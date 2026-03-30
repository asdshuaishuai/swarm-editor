package swarm

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestDeadLetterQueueAdd(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "dlq_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dlq, err := NewDeadLetterQueue(tmpDir, 0)
	if err != nil {
		t.Fatalf("NewDeadLetterQueue: %v", err)
	}

	task := &CoordinationTask{
		ID:     "task-1",
		Prompt: "test task",
		Status: TaskStatusFailed,
	}

	err = dlq.Add(task, errors.New("test error"), 3)
	if err != nil {
		t.Fatalf("Add: %v", err)
	}

	// Verify file was created
	entries, _ := os.ReadDir(tmpDir)
	if len(entries) != 1 {
		t.Errorf("Expected 1 entry, got %d", len(entries))
	}
}

func TestDeadLetterQueueGet(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "dlq_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dlq, err := NewDeadLetterQueue(tmpDir, 0)
	if err != nil {
		t.Fatalf("NewDeadLetterQueue: %v", err)
	}

	task := &CoordinationTask{
		ID:     "task-1",
		Prompt: "test task",
		Status: TaskStatusFailed,
	}

	classifiedErr := ClassifyError(errors.New("retryable error"), ErrorTypeRetryable)
	if err := dlq.Add(task, classifiedErr, 5); err != nil {
		t.Fatalf("Add: %v", err)
	}

	// List to get the ID
	entries, err := dlq.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("Expected 1 entry, got %d", len(entries))
	}

	// Get the entry
	entry, err := dlq.Get(entries[0].ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if entry == nil {
		t.Fatal("Entry is nil")
	}

	if entry.TaskID != "task-1" {
		t.Errorf("TaskID = %q, want %q", entry.TaskID, "task-1")
	}
	if entry.Attempts != 5 {
		t.Errorf("Attempts = %d, want 5", entry.Attempts)
	}
	if entry.ErrorType != ErrorTypeRetryable {
		t.Errorf("ErrorType = %v, want ErrorTypeRetryable", entry.ErrorType)
	}
}

func TestDeadLetterQueueGetNotFound(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "dlq_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dlq, err := NewDeadLetterQueue(tmpDir, 0)
	if err != nil {
		t.Fatalf("NewDeadLetterQueue: %v", err)
	}

	entry, err := dlq.Get("nonexistent")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if entry != nil {
		t.Error("Expected nil entry for nonexistent ID")
	}
}

func TestDeadLetterQueueList(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "dlq_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dlq, err := NewDeadLetterQueue(tmpDir, 0)
	if err != nil {
		t.Fatalf("NewDeadLetterQueue: %v", err)
	}

	// Add multiple entries
	for i := 0; i < 3; i++ {
		task := &CoordinationTask{
			ID:     "task-" + string(rune('0'+i)),
			Prompt: "test task",
			Status: TaskStatusFailed,
		}
		if err := dlq.Add(task, errors.New("error"), i+1); err != nil {
			t.Fatalf("Add %d: %v", i, err)
		}
		time.Sleep(time.Millisecond) // Ensure different timestamps
	}

	entries, err := dlq.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}

	if len(entries) != 3 {
		t.Errorf("Expected 3 entries, got %d", len(entries))
	}

	// Verify sorted by FailedAt descending (newest first)
	for i := 1; i < len(entries); i++ {
		if entries[i].FailedAt.After(entries[i-1].FailedAt) {
			t.Error("Entries not sorted by FailedAt descending")
		}
	}
}

func TestDeadLetterQueueRemove(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "dlq_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dlq, err := NewDeadLetterQueue(tmpDir, 0)
	if err != nil {
		t.Fatalf("NewDeadLetterQueue: %v", err)
	}

	task := &CoordinationTask{ID: "task-1", Prompt: "test"}
	if err := dlq.Add(task, errors.New("error"), 1); err != nil {
		t.Fatalf("Add: %v", err)
	}

	entries, _ := dlq.List()
	if len(entries) != 1 {
		t.Fatalf("Expected 1 entry before remove")
	}

	if err := dlq.Remove(entries[0].ID); err != nil {
		t.Fatalf("Remove: %v", err)
	}

	entries, _ = dlq.List()
	if len(entries) != 0 {
		t.Errorf("Expected 0 entries after remove, got %d", len(entries))
	}
}

func TestDeadLetterQueueReplay(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "dlq_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dlq, err := NewDeadLetterQueue(tmpDir, 0)
	if err != nil {
		t.Fatalf("NewDeadLetterQueue: %v", err)
	}

	task := &CoordinationTask{ID: "task-1", Prompt: "test task"}
	if err := dlq.Add(task, errors.New("error"), 3); err != nil {
		t.Fatalf("Add: %v", err)
	}

	entries, _ := dlq.List()
	if len(entries) != 1 {
		t.Fatalf("Expected 1 entry")
	}

	var replayedTask *CoordinationTask
	submitFn := func(t *CoordinationTask) error {
		replayedTask = t
		return nil
	}

	if err := dlq.Replay(entries[0].ID, submitFn); err != nil {
		t.Fatalf("Replay: %v", err)
	}

	if replayedTask == nil {
		t.Fatal("Task was not replayed")
	}
	if replayedTask.ID != "task-1" {
		t.Errorf("Replayed task ID = %q, want %q", replayedTask.ID, "task-1")
	}

	// Entry should be removed after replay
	entries, _ = dlq.List()
	if len(entries) != 0 {
		t.Error("Entry should be removed after replay")
	}
}

func TestDeadLetterQueueReplayAll(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "dlq_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dlq, err := NewDeadLetterQueue(tmpDir, 0)
	if err != nil {
		t.Fatalf("NewDeadLetterQueue: %v", err)
	}

	// Add multiple entries
	for i := 0; i < 3; i++ {
		task := &CoordinationTask{ID: string(rune('0' + i)), Prompt: "test"}
		if err := dlq.Add(task, errors.New("error"), 1); err != nil {
			t.Fatalf("Add: %v", err)
		}
		time.Sleep(time.Millisecond)
	}

	replayedCount := 0
	submitFn := func(t *CoordinationTask) error {
		replayedCount++
		return nil
	}

	count, err := dlq.ReplayAll(submitFn)
	if err != nil {
		t.Fatalf("ReplayAll: %v", err)
	}

	if count != 3 {
		t.Errorf("Replayed %d tasks, want 3", count)
	}
	if replayedCount != 3 {
		t.Errorf("SubmitFn called %d times, want 3", replayedCount)
	}
}

func TestDeadLetterQueuePurge(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "dlq_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dlq, err := NewDeadLetterQueue(tmpDir, 0)
	if err != nil {
		t.Fatalf("NewDeadLetterQueue: %v", err)
	}

	// Add an entry and modify its mtime to be old
	task := &CoordinationTask{ID: "old-task", Prompt: "test"}
	if err := dlq.Add(task, errors.New("error"), 1); err != nil {
		t.Fatalf("Add: %v", err)
	}

	entries, _ := dlq.List()
	oldPath := filepath.Join(tmpDir, entries[0].ID+".json")

	// Set mtime to 2 hours ago
	oldTime := time.Now().Add(-2 * time.Hour)
	if err := os.Chtimes(oldPath, oldTime, oldTime); err != nil {
		t.Fatalf("Chtimes: %v", err)
	}

	// Add a new entry
	task2 := &CoordinationTask{ID: "new-task", Prompt: "test"}
	if err := dlq.Add(task2, errors.New("error"), 1); err != nil {
		t.Fatalf("Add: %v", err)
	}

	// Purge entries older than 1 hour
	purged, err := dlq.Purge(time.Hour)
	if err != nil {
		t.Fatalf("Purge: %v", err)
	}

	if purged != 1 {
		t.Errorf("Purged %d entries, want 1", purged)
	}

	entries, _ = dlq.List()
	if len(entries) != 1 {
		t.Errorf("Expected 1 entry after purge, got %d", len(entries))
	}
}

func TestDeadLetterQueueMaxSize(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "dlq_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dlq, err := NewDeadLetterQueue(tmpDir, 2) // Max 2 entries
	if err != nil {
		t.Fatalf("NewDeadLetterQueue: %v", err)
	}

	// Add 3 entries - oldest should be pruned
	for i := 0; i < 3; i++ {
		task := &CoordinationTask{ID: string(rune('0' + i)), Prompt: "test"}
		if err := dlq.Add(task, errors.New("error"), 1); err != nil {
			t.Fatalf("Add: %v", err)
		}
		time.Sleep(time.Millisecond) // Ensure different timestamps
	}

	entries, _ := dlq.List()
	if len(entries) > 2 {
		t.Errorf("Expected at most 2 entries with maxSize=2, got %d", len(entries))
	}
}

func TestDeadLetterQueueStats(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "dlq_test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dlq, err := NewDeadLetterQueue(tmpDir, 0)
	if err != nil {
		t.Fatalf("NewDeadLetterQueue: %v", err)
	}

	// Add entries with different error types
	task1 := &CoordinationTask{ID: "task-1", Prompt: "test"}
	dlq.Add(task1, ClassifyError(errors.New("retryable"), ErrorTypeRetryable), 3)

	task2 := &CoordinationTask{ID: "task-2", Prompt: "test"}
	dlq.Add(task2, ClassifyError(errors.New("timeout"), ErrorTypeTimeout), 2)

	task3 := &CoordinationTask{ID: "task-3", Prompt: "test"}
	dlq.Add(task3, ClassifyError(errors.New("cancelled"), ErrorTypeCancelled), 1)

	stats, err := dlq.GetStats()
	if err != nil {
		t.Fatalf("GetStats: %v", err)
	}

	if stats.TotalEntries != 3 {
		t.Errorf("TotalEntries = %d, want 3", stats.TotalEntries)
	}

	if stats.ByErrorType[ErrorTypeRetryable] != 1 {
		t.Errorf("Retryable count = %d, want 1", stats.ByErrorType[ErrorTypeRetryable])
	}
	if stats.ByErrorType[ErrorTypeTimeout] != 1 {
		t.Errorf("Timeout count = %d, want 1", stats.ByErrorType[ErrorTypeTimeout])
	}
	if stats.ByErrorType[ErrorTypeCancelled] != 1 {
		t.Errorf("Cancelled count = %d, want 1", stats.ByErrorType[ErrorTypeCancelled])
	}

	if stats.TotalAttempts != 6 {
		t.Errorf("TotalAttempts = %d, want 6", stats.TotalAttempts)
	}
}

func TestAsClassifiedError(t *testing.T) {
	innerErr := errors.New("inner")
	classified := ClassifyError(innerErr, ErrorTypeRetryable)

	var target *ClassifiedError
	if !AsClassifiedError(classified, &target) {
		t.Error("AsClassifiedError returned false for ClassifiedError")
	}
	if target.Type != ErrorTypeRetryable {
		t.Errorf("target.Type = %v, want ErrorTypeRetryable", target.Type)
	}

	// Test with non-classified error
	var target2 *ClassifiedError
	if AsClassifiedError(innerErr, &target2) {
		t.Error("AsClassifiedError returned true for non-ClassifiedError")
	}
}
