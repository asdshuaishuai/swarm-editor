// Package swarm implements lightweight state checkpointing for crash recovery.
// Inspired by LangGraph's per-step state persistence and Temporal's event sourcing,
// but adapted to Swarm Editor's single-process, JSON-file-based architecture.
package swarm

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/swarm-editor/swarm-editor/internal/log"
)

var checkpointLog = log.With("component", "Checkpoint")

// CoordinatorSnapshot represents a snapshot of coordinator state at a point in time.
// Snapshots use the same atomic write pattern as session/store.go
// (write to temp file, then rename) for crash safety.
type CoordinatorSnapshot struct {
	ID           string              `json:"id"`
	Timestamp    time.Time           `json:"timestamp"`
	ActiveTasks  []*CoordinationTask `json:"activeTasks"`
	PendingTasks []*CoordinationTask `json:"pendingTasks"`
	Sequence     int64               `json:"sequence"`
}

// CheckpointStore persists coordinator state to disk for crash recovery.
// Thread-safe. Designed for single-process use (no distributed locking).
type CheckpointStore struct {
	mu       sync.Mutex
	dataDir  string
	sequence int64
	maxKeep  int
}

// NewCheckpointStore creates a checkpoint store that persists to dataDir.
// maxKeep controls how many checkpoint files to retain (default 5).
func NewCheckpointStore(dataDir string, maxKeep int) (*CheckpointStore, error) {
	if maxKeep <= 0 {
		maxKeep = 5
	}
	if err := os.MkdirAll(dataDir, 0750); err != nil {
		return nil, fmt.Errorf("create checkpoint dir: %w", err)
	}
	return &CheckpointStore{dataDir: dataDir, maxKeep: maxKeep}, nil
}

// Save atomically writes a checkpoint. Uses the same temp-file-then-rename
// pattern as session/store.go for crash safety.
// The mutex is held for the entire operation to prevent races with LoadLatest.
func (s *CheckpointStore) Save(activeTasks []*CoordinationTask, pendingTasks []*CoordinationTask) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.sequence++
	seq := s.sequence

	cp := &CoordinatorSnapshot{
		ID:           fmt.Sprintf("ckpt_%d_%s", seq, uuid.New().String()[:8]),
		Timestamp:    time.Now(),
		ActiveTasks:  activeTasks,
		PendingTasks: pendingTasks,
		Sequence:     seq,
	}

	data, err := json.Marshal(cp)
	if err != nil {
		return fmt.Errorf("marshal checkpoint: %w", err)
	}

	// Atomic write: temp file -> rename (same as session/store.go)
	tmp, err := os.CreateTemp(s.dataDir, "ckpt_*.tmp")
	if err != nil {
		return fmt.Errorf("create temp checkpoint: %w", err)
	}
	if err := tmp.Chmod(0600); err != nil {
		tmp.Close()
		os.Remove(tmp.Name())
		return fmt.Errorf("chmod checkpoint: %w", err)
	}
	tmpPath := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("write checkpoint: %w", err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("close checkpoint: %w", err)
	}

	finalPath := filepath.Join(s.dataDir, cp.ID+".json")
	if err := os.Rename(tmpPath, finalPath); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("rename checkpoint: %w", err)
	}

	s.pruneOld()
	return nil
}

// LoadLatest recovers the most recent valid checkpoint.
// Returns nil if no checkpoints exist (fresh start).
func (s *CheckpointStore) LoadLatest() (*CoordinatorSnapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.loadLatestLocked()
}

// loadLatestLocked is the internal implementation that assumes s.mu is held.
func (s *CheckpointStore) loadLatestLocked() (*CoordinatorSnapshot, error) {
	entries, err := os.ReadDir(s.dataDir)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("read checkpoint dir: %w", err)
	}

	var latest *CoordinatorSnapshot
	var latestTime time.Time

	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(s.dataDir, entry.Name()))
		if err != nil {
			checkpointLog.Warn("Skipping unreadable file", "file", entry.Name(), "error", err)
			continue
		}
		var cp CoordinatorSnapshot
		if err := json.Unmarshal(data, &cp); err != nil {
			checkpointLog.Warn("Skipping corrupt file", "file", entry.Name(), "error", err)
			continue
		}
		if cp.Timestamp.After(latestTime) {
			latest = &cp
			latestTime = cp.Timestamp
		}
	}

	return latest, nil
}

// LatestSequence returns the sequence number of the most recent checkpoint, or 0.
func (s *CheckpointStore) LatestSequence() int64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.sequence
}

// pruneOld removes the oldest checkpoint files when the count exceeds maxKeep.
func (s *CheckpointStore) pruneOld() {
	entries, err := os.ReadDir(s.dataDir)
	if err != nil {
		return
	}

	type cpFile struct {
		name string
		time time.Time
	}
	var files []cpFile
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		files = append(files, cpFile{name: e.Name(), time: info.ModTime()})
	}

	// Sort oldest first
	sort.Slice(files, func(i, j int) bool {
		return files[i].time.Before(files[j].time)
	})

	// Delete oldest if over limit
	for i := range len(files) - s.maxKeep {
		if err := os.Remove(filepath.Join(s.dataDir, files[i].name)); err != nil {
			checkpointLog.Warn("Failed to prune", "file", files[i].name, "error", err)
		}
	}
}

// ListCheckpoints returns all available checkpoints sorted by timestamp (newest first).
// This enables time-travel debugging by allowing inspection of historical states.
func (s *CheckpointStore) ListCheckpoints() ([]*CoordinatorSnapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	entries, err := os.ReadDir(s.dataDir)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("read checkpoint dir: %w", err)
	}

	var checkpoints []*CoordinatorSnapshot
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(s.dataDir, entry.Name()))
		if err != nil {
			continue
		}
		var cp CoordinatorSnapshot
		if err := json.Unmarshal(data, &cp); err != nil {
			continue
		}
		checkpoints = append(checkpoints, &cp)
	}

	// Sort by timestamp descending (newest first)
	sort.Slice(checkpoints, func(i, j int) bool {
		return checkpoints[i].Timestamp.After(checkpoints[j].Timestamp)
	})

	return checkpoints, nil
}

// LoadCheckpoint loads a specific checkpoint by ID.
// Returns nil if the checkpoint does not exist.
func (s *CheckpointStore) LoadCheckpoint(id string) (*CoordinatorSnapshot, error) {
	if !isValidCheckpointID(id) {
		return nil, fmt.Errorf("invalid checkpoint id: %s", id)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	path := filepath.Join(s.dataDir, id+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("read checkpoint %s: %w", id, err)
	}

	var cp CoordinatorSnapshot
	if err := json.Unmarshal(data, &cp); err != nil {
		return nil, fmt.Errorf("unmarshal checkpoint %s: %w", id, err)
	}

	return &cp, nil
}

// CheckpointDiff represents the difference between two checkpoints.
type CheckpointDiff struct {
	Checkpoint1ID string              `json:"checkpoint1Id"`
	Checkpoint2ID string              `json:"checkpoint2Id"`
	AddedTasks    []*CoordinationTask `json:"addedTasks"`
	RemovedTasks  []*CoordinationTask `json:"removedTasks"`
	ModifiedTasks []*TaskDiff         `json:"modifiedTasks"`
}

// TaskDiff represents the difference in a single task between checkpoints.
type TaskDiff struct {
	TaskID      string  `json:"taskId"`
	OldStatus   string  `json:"oldStatus"`
	NewStatus   string  `json:"newStatus"`
	OldProgress float64 `json:"oldProgress"`
	NewProgress float64 `json:"newProgress"`
}

// DiffCheckpoints compares two checkpoints and returns the differences.
// This is useful for understanding state evolution during debugging.
func (s *CheckpointStore) DiffCheckpoints(id1, id2 string) (*CheckpointDiff, error) {
	cp1, err := s.LoadCheckpoint(id1)
	if err != nil {
		return nil, fmt.Errorf("load checkpoint1: %w", err)
	}
	if cp1 == nil {
		return nil, fmt.Errorf("checkpoint %s not found", id1)
	}

	cp2, err := s.LoadCheckpoint(id2)
	if err != nil {
		return nil, fmt.Errorf("load checkpoint2: %w", err)
	}
	if cp2 == nil {
		return nil, fmt.Errorf("checkpoint %s not found", id2)
	}

	diff := &CheckpointDiff{
		Checkpoint1ID: id1,
		Checkpoint2ID: id2,
	}

	// Build task maps for comparison
	tasks1 := make(map[string]*CoordinationTask)
	for _, t := range cp1.ActiveTasks {
		tasks1[t.ID] = t
	}
	for _, t := range cp1.PendingTasks {
		tasks1[t.ID] = t
	}

	tasks2 := make(map[string]*CoordinationTask)
	for _, t := range cp2.ActiveTasks {
		tasks2[t.ID] = t
	}
	for _, t := range cp2.PendingTasks {
		tasks2[t.ID] = t
	}

	// Find added and modified tasks
	for id, t2 := range tasks2 {
		t1, exists := tasks1[id]
		if !exists {
			diff.AddedTasks = append(diff.AddedTasks, t2)
		} else if t1.Status != t2.Status || t1.Progress != t2.Progress {
			diff.ModifiedTasks = append(diff.ModifiedTasks, &TaskDiff{
				TaskID:      id,
				OldStatus:   string(t1.Status),
				NewStatus:   string(t2.Status),
				OldProgress: t1.Progress,
				NewProgress: t2.Progress,
			})
		}
	}

	// Find removed tasks
	for id, t1 := range tasks1 {
		if _, exists := tasks2[id]; !exists {
			diff.RemovedTasks = append(diff.RemovedTasks, t1)
		}
	}

	return diff, nil
}

// DeleteCheckpoint removes a specific checkpoint by ID.
// Returns ErrNotFound if the checkpoint does not exist.
func (s *CheckpointStore) DeleteCheckpoint(id string) error {
	if !isValidCheckpointID(id) {
		return fmt.Errorf("invalid checkpoint id: %s", id)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	path := filepath.Join(s.dataDir, id+".json")
	err := os.Remove(path)
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("delete checkpoint %s: %w", id, err)
	}
	return nil
}

// isValidCheckpointID validates that a checkpoint ID is safe for filesystem operations.
// Prevents path traversal attacks via crafted IDs containing "/", "..", etc.
func isValidCheckpointID(id string) bool {
	if id == "" || len(id) > 128 {
		return false
	}
	return !strings.ContainsAny(id, "/\\.")
}
