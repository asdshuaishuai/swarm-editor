// Package swarm provides a Dead Letter Queue for failed tasks.
// Inspired by Temporal's DLQ for handling tasks that exceed retry limits.
package swarm

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/swarm-editor/swarm-editor/internal/log"
)

var dlqLog = log.With("component", "DLQ")

// DLQEntry represents a failed task stored in the Dead Letter Queue.
type DLQEntry struct {
	ID          string            `json:"id"`
	TaskID      string            `json:"taskId"`
	Task        *CoordinationTask `json:"task"`
	Error       string            `json:"error"`
	ErrorType   ErrorType         `json:"errorType"`
	Attempts    int               `json:"attempts"`
	FailedAt    time.Time         `json:"failedAt"`
	LastAttempt time.Time         `json:"lastAttempt"`
	OriginalID  string            `json:"originalId,omitempty"` // For tracking after retries
	Metadata    map[string]any    `json:"metadata,omitempty"`
}

// DeadLetterQueue persists failed tasks that cannot be retried.
// Thread-safe. Designed for single-process use.
type DeadLetterQueue struct {
	mu      sync.RWMutex
	dataDir string
	maxSize int // Maximum entries to keep (0 = unlimited)
}

// NewDeadLetterQueue creates a DLQ that persists to dataDir.
func NewDeadLetterQueue(dataDir string, maxSize int) (*DeadLetterQueue, error) {
	if err := os.MkdirAll(dataDir, 0750); err != nil {
		return nil, fmt.Errorf("create DLQ dir: %w", err)
	}
	return &DeadLetterQueue{dataDir: dataDir, maxSize: maxSize}, nil
}

// Add stores a failed task in the DLQ.
func (q *DeadLetterQueue) Add(task *CoordinationTask, err error, attempts int) error {
	if task == nil {
		return fmt.Errorf("dlq: nil task")
	}
	if err == nil {
		return fmt.Errorf("dlq: nil error for task %s", task.ID)
	}

	q.mu.Lock()
	defer q.mu.Unlock()

	entry := &DLQEntry{
		ID:          fmt.Sprintf("dlq_%s_%s", uuid.New().String()[:8], task.ID),
		TaskID:      task.ID,
		Task:        task,
		Error:       err.Error(),
		Attempts:    attempts,
		FailedAt:    time.Now(),
		LastAttempt: time.Now(),
		Metadata:    make(map[string]any),
	}

	// Classify error if possible
	var classified *ClassifiedError
	if AsClassifiedError(err, &classified) {
		entry.ErrorType = classified.Type
	}

	data, marshalErr := json.Marshal(entry)
	if marshalErr != nil {
		return fmt.Errorf("marshal DLQ entry: %w", marshalErr)
	}

	// Atomic write: temp file -> rename (same pattern as checkpoint.go)
	path := filepath.Join(q.dataDir, entry.ID+".json")
	tmp, tmpErr := os.CreateTemp(q.dataDir, "dlq_*.tmp")
	if tmpErr != nil {
		return fmt.Errorf("create temp DLQ entry: %w", tmpErr)
	}
	tmpPath := tmp.Name()
	// LOW: Set file permissions to 0600 to protect sensitive error data
	if chmodErr := tmp.Chmod(0600); chmodErr != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("chmod temp DLQ entry: %w", chmodErr)
	}
	if _, writeErr := tmp.Write(data); writeErr != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("write temp DLQ entry: %w", writeErr)
	}
	if closeErr := tmp.Close(); closeErr != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("close temp DLQ entry: %w", closeErr)
	}
	if renameErr := os.Rename(tmpPath, path); renameErr != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("rename DLQ entry: %w", renameErr)
	}

	// Prune old entries if over limit
	q.pruneIfNeeded()

	return nil
}

// Get retrieves a DLQ entry by ID.
func (q *DeadLetterQueue) Get(id string) (*DLQEntry, error) {
	q.mu.RLock()
	defer q.mu.RUnlock()

	path := filepath.Join(q.dataDir, id+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("read DLQ entry: %w", err)
	}

	var entry DLQEntry
	if err := json.Unmarshal(data, &entry); err != nil {
		return nil, fmt.Errorf("unmarshal DLQ entry: %w", err)
	}

	return &entry, nil
}

// List returns all DLQ entries sorted by FailedAt (newest first).
func (q *DeadLetterQueue) List() ([]*DLQEntry, error) {
	q.mu.RLock()
	defer q.mu.RUnlock()

	entries, err := os.ReadDir(q.dataDir)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("read DLQ dir: %w", err)
	}

	var results []*DLQEntry
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(q.dataDir, entry.Name()))
		if err != nil {
			dlqLog.Warn("Skipping unreadable file", "file", entry.Name(), "error", err)
			continue
		}
		var dlqEntry DLQEntry
		if err := json.Unmarshal(data, &dlqEntry); err != nil {
			dlqLog.Warn("Skipping corrupt file", "file", entry.Name(), "error", err)
			continue
		}
		results = append(results, &dlqEntry)
	}

	// Sort by FailedAt descending (newest first)
	sort.Slice(results, func(i, j int) bool {
		return results[i].FailedAt.After(results[j].FailedAt)
	})

	return results, nil
}

// Remove deletes a DLQ entry by ID.
func (q *DeadLetterQueue) Remove(id string) error {
	q.mu.Lock()
	defer q.mu.Unlock()

	path := filepath.Join(q.dataDir, id+".json")
	err := os.Remove(path)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("remove DLQ entry: %w", err)
	}
	return nil
}

// Replay re-submits a DLQ entry for retry.
// The callback function is responsible for re-queueing the task.
// The entire operation (read, submit, remove) is atomic under write lock to prevent TOCTOU races.
func (q *DeadLetterQueue) Replay(id string, submitFn func(*CoordinationTask) error) error {
	q.mu.Lock()
	defer q.mu.Unlock()

	// Read entry directly under write lock (not via Get which uses RLock)
	path := filepath.Join(q.dataDir, id+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return fmt.Errorf("DLQ entry not found: %s", id)
		}
		return fmt.Errorf("read DLQ entry: %w", err)
	}

	var entry DLQEntry
	if err := json.Unmarshal(data, &entry); err != nil {
		return fmt.Errorf("unmarshal DLQ entry: %w", err)
	}

	// Submit the task while still holding lock (ensures atomicity)
	if err := submitFn(entry.Task); err != nil {
		return fmt.Errorf("replay task: %w", err)
	}

	// Remove from DLQ after successful replay (still under same lock)
	if err := os.Remove(path); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("remove DLQ entry: %w", err)
	}

	return nil
}

// ReplayAll re-submits all DLQ entries for retry.
func (q *DeadLetterQueue) ReplayAll(submitFn func(*CoordinationTask) error) (int, error) {
	entries, err := q.List()
	if err != nil {
		return 0, fmt.Errorf("list DLQ entries: %w", err)
	}

	replayed := 0
	for _, entry := range entries {
		if err := q.Replay(entry.ID, submitFn); err != nil {
			dlqLog.Warn("Failed to replay", "entry_id", entry.ID, "error", err)
			continue
		}
		replayed++
	}

	return replayed, nil
}

// Purge removes all DLQ entries older than the specified duration.
func (q *DeadLetterQueue) Purge(olderThan time.Duration) (int, error) {
	q.mu.Lock()
	defer q.mu.Unlock()

	entries, err := os.ReadDir(q.dataDir)
	if err != nil {
		return 0, fmt.Errorf("read DLQ dir: %w", err)
	}

	cutoff := time.Now().Add(-olderThan)
	purged := 0

	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		if info.ModTime().Before(cutoff) {
			path := filepath.Join(q.dataDir, entry.Name())
			if err := os.Remove(path); err != nil {
				dlqLog.Warn("Failed to purge", "file", entry.Name(), "error", err)
				continue
			}
			purged++
		}
	}

	return purged, nil
}

// Stats returns statistics about the DLQ.
type DLQStats struct {
	TotalEntries  int               `json:"totalEntries"`
	ByErrorType   map[ErrorType]int `json:"byErrorType"`
	OldestEntry   time.Time         `json:"oldestEntry"`
	NewestEntry   time.Time         `json:"newestEntry"`
	TotalAttempts int               `json:"totalAttempts"`
}

// GetStats returns statistics about the DLQ.
func (q *DeadLetterQueue) GetStats() (*DLQStats, error) {
	entries, err := q.List()
	if err != nil {
		return nil, err
	}

	stats := &DLQStats{
		ByErrorType: make(map[ErrorType]int),
	}

	for _, entry := range entries {
		stats.TotalEntries++
		stats.ByErrorType[entry.ErrorType]++
		stats.TotalAttempts += entry.Attempts

		if stats.OldestEntry.IsZero() || entry.FailedAt.Before(stats.OldestEntry) {
			stats.OldestEntry = entry.FailedAt
		}
		if stats.NewestEntry.IsZero() || entry.FailedAt.After(stats.NewestEntry) {
			stats.NewestEntry = entry.FailedAt
		}
	}

	return stats, nil
}

// pruneIfNeeded removes oldest entries if over maxSize limit.
func (q *DeadLetterQueue) pruneIfNeeded() {
	if q.maxSize <= 0 {
		return
	}

	entries, err := os.ReadDir(q.dataDir)
	if err != nil {
		return
	}

	// Count JSON files
	var files []struct {
		name string
		time time.Time
	}
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".json" {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		files = append(files, struct {
			name string
			time time.Time
		}{e.Name(), info.ModTime()})
	}

	// Sort oldest first
	sort.Slice(files, func(i, j int) bool {
		return files[i].time.Before(files[j].time)
	})

	// Delete oldest if over limit
	for i := range len(files) - q.maxSize {
		if err := os.Remove(filepath.Join(q.dataDir, files[i].name)); err != nil {
			dlqLog.Warn("Failed to prune", "file", files[i].name, "error", err)
		}
	}
}

// AsClassifiedError checks if an error is a ClassifiedError using errors.As.
func AsClassifiedError(err error, target **ClassifiedError) bool {
	return errors.As(err, target)
}
