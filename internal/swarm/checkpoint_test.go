package swarm

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCheckpointStore_SaveAndLoad(t *testing.T) {
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 5)
	if err != nil {
		t.Fatal(err)
	}

	active := []*CoordinationTask{
		{ID: "task_1", Title: "Test Task", Status: TaskStatusRunning},
	}
	pending := []*CoordinationTask{
		{ID: "task_2", Title: "Pending Task", Status: TaskStatusPending},
	}

	err = store.Save(active, pending)
	if err != nil {
		t.Fatal(err)
	}

	// Verify sequence incremented
	if store.LatestSequence() != 1 {
		t.Fatalf("expected sequence 1, got %d", store.LatestSequence())
	}

	// Load latest
	cp, err := store.LoadLatest()
	if err != nil {
		t.Fatal(err)
	}
	if cp == nil {
		t.Fatal("expected non-nil checkpoint")
	}
	if cp.Sequence != 1 {
		t.Fatalf("expected sequence 1, got %d", cp.Sequence)
	}
	if len(cp.ActiveTasks) != 1 || cp.ActiveTasks[0].ID != "task_1" {
		t.Fatal("active tasks mismatch")
	}
	if len(cp.PendingTasks) != 1 || cp.PendingTasks[0].ID != "task_2" {
		t.Fatal("pending tasks mismatch")
	}
}

func TestCheckpointStore_LoadLatest_Empty(t *testing.T) {
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 5)
	if err != nil {
		t.Fatal(err)
	}

	cp, err := store.LoadLatest()
	if err != nil {
		t.Fatal(err)
	}
	if cp != nil {
		t.Fatal("expected nil for empty store")
	}
}

func TestCheckpointStore_PruneOld(t *testing.T) {
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 3)
	if err != nil {
		t.Fatal(err)
	}

	// Create 5 checkpoints
	for i := 0; i < 5; i++ {
		err := store.Save(nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		time.Sleep(10 * time.Millisecond) // Ensure different timestamps
	}

	// Only 3 should remain
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}

	var jsonFiles []string
	for _, e := range entries {
		if filepath.Ext(e.Name()) == ".json" {
			jsonFiles = append(jsonFiles, e.Name())
		}
	}

	if len(jsonFiles) != 3 {
		t.Fatalf("expected 3 checkpoint files, got %d", len(jsonFiles))
	}
}

func TestCheckpointStore_CorruptFile(t *testing.T) {
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 5)
	if err != nil {
		t.Fatal(err)
	}

	// Save a valid checkpoint
	err = store.Save([]*CoordinationTask{{ID: "valid"}}, nil)
	if err != nil {
		t.Fatal(err)
	}

	// Write a corrupt file
	corruptPath := filepath.Join(dir, "corrupt.json")
	if err := os.WriteFile(corruptPath, []byte("not json"), 0644); err != nil {
		t.Fatal(err)
	}

	// LoadLatest should skip the corrupt file and return the valid one
	cp, err := store.LoadLatest()
	if err != nil {
		t.Fatal(err)
	}
	if cp == nil {
		t.Fatal("expected valid checkpoint despite corrupt file")
	}
}

func TestCheckpointStore_AtomicWrite(t *testing.T) {
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 5)
	if err != nil {
		t.Fatal(err)
	}

	task := &CoordinationTask{ID: "atomic_test", Title: "Atomic Write Test"}
	err = store.Save([]*CoordinationTask{task}, nil)
	if err != nil {
		t.Fatal(err)
	}

	// Verify the file is valid JSON
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}

	found := false
	for _, e := range entries {
		if filepath.Ext(e.Name()) != ".json" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			continue
		}
		var cp CoordinatorSnapshot
		if json.Unmarshal(data, &cp) != nil {
			t.Fatalf("checkpoint file %s is not valid JSON", e.Name())
		}
		if len(cp.ActiveTasks) > 0 && cp.ActiveTasks[0].ID == "atomic_test" {
			found = true
		}
	}

	if !found {
		t.Fatal("expected to find checkpoint with atomic_test task")
	}
}

func TestCheckpointStore_Permissions(t *testing.T) {
	// Use a non-temp directory to control permissions exactly
	dir := filepath.Join(t.TempDir(), "checkpoints")
	_, err := NewCheckpointStore(dir, 5)
	if err != nil {
		t.Fatal(err)
	}

	// Verify directory was created
	info, err := os.Stat(dir)
	if err != nil {
		t.Fatal(err)
	}
	if !info.IsDir() {
		t.Fatal("expected directory")
	}
	// The intended permission is 0750, but umask may affect the actual mode.
	// Just verify it's not world-writable.
	if info.Mode().Perm()&0o002 != 0 {
		t.Fatalf("directory should not be world-writable, got %o", info.Mode().Perm())
	}
}

func TestNewCheckpointStore_DefaultMaxKeep(t *testing.T) {
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 0)
	if err != nil {
		t.Fatal(err)
	}
	// Default should be 5
	for i := 0; i < 8; i++ {
		_ = store.Save(nil, nil)
		time.Sleep(5 * time.Millisecond)
	}

	entries, _ := os.ReadDir(dir)
	count := 0
	for _, e := range entries {
		if filepath.Ext(e.Name()) == ".json" {
			count++
		}
	}
	if count > 5 {
		t.Fatalf("expected at most 5 files, got %d", count)
	}
}

func TestCheckpointStore_ListCheckpoints(t *testing.T) {
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 10)
	if err != nil {
		t.Fatal(err)
	}

	// Create 3 checkpoints with different tasks
	for i := 0; i < 3; i++ {
		task := &CoordinationTask{
			ID:       fmt.Sprintf("task_%d", i),
			Title:    fmt.Sprintf("Task %d", i),
			Status:   TaskStatusPending,
			Progress: 0.0,
		}
		err := store.Save([]*CoordinationTask{task}, nil)
		if err != nil {
			t.Fatal(err)
		}
		time.Sleep(10 * time.Millisecond)
	}

	checkpoints, err := store.ListCheckpoints()
	if err != nil {
		t.Fatal(err)
	}
	if len(checkpoints) != 3 {
		t.Fatalf("expected 3 checkpoints, got %d", len(checkpoints))
	}

	// Verify sorted newest first
	if checkpoints[0].ActiveTasks[0].ID != "task_2" {
		t.Fatalf("expected newest first, got %s", checkpoints[0].ActiveTasks[0].ID)
	}
	if checkpoints[2].ActiveTasks[0].ID != "task_0" {
		t.Fatalf("expected oldest last, got %s", checkpoints[2].ActiveTasks[0].ID)
	}
}

func TestCheckpointStore_LoadCheckpoint(t *testing.T) {
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 5)
	if err != nil {
		t.Fatal(err)
	}

	task := &CoordinationTask{ID: "specific_task", Title: "Specific Task"}
	err = store.Save([]*CoordinationTask{task}, nil)
	if err != nil {
		t.Fatal(err)
	}

	// Get the checkpoint ID from list
	checkpoints, err := store.ListCheckpoints()
	if err != nil {
		t.Fatal(err)
	}
	if len(checkpoints) == 0 {
		t.Fatal("expected at least one checkpoint")
	}

	// Load by ID
	cp, err := store.LoadCheckpoint(checkpoints[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if cp == nil {
		t.Fatal("expected checkpoint")
	}
	if len(cp.ActiveTasks) != 1 || cp.ActiveTasks[0].ID != "specific_task" {
		t.Fatalf("unexpected checkpoint content: %+v", cp.ActiveTasks)
	}

	// Load non-existent checkpoint
	cp, err = store.LoadCheckpoint("nonexistent")
	if err != nil {
		t.Fatal(err)
	}
	if cp != nil {
		t.Fatal("expected nil for non-existent checkpoint")
	}
}

func TestCheckpointStore_DiffCheckpoints(t *testing.T) {
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 10)
	if err != nil {
		t.Fatal(err)
	}

	// First checkpoint with task_1 pending
	err = store.Save([]*CoordinationTask{
		{ID: "task_1", Title: "Task 1", Status: TaskStatusPending, Progress: 0.0},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	time.Sleep(10 * time.Millisecond)

	// Second checkpoint with task_1 running and task_2 added
	err = store.Save([]*CoordinationTask{
		{ID: "task_1", Title: "Task 1", Status: TaskStatusRunning, Progress: 0.5},
		{ID: "task_2", Title: "Task 2", Status: TaskStatusPending, Progress: 0.0},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}

	checkpoints, err := store.ListCheckpoints()
	if err != nil {
		t.Fatal(err)
	}
	if len(checkpoints) != 2 {
		t.Fatalf("expected 2 checkpoints, got %d", len(checkpoints))
	}

	// Diff newest vs oldest (newest first in list)
	diff, err := store.DiffCheckpoints(checkpoints[1].ID, checkpoints[0].ID)
	if err != nil {
		t.Fatal(err)
	}

	// Verify added task
	if len(diff.AddedTasks) != 1 || diff.AddedTasks[0].ID != "task_2" {
		t.Fatalf("expected 1 added task (task_2), got %d", len(diff.AddedTasks))
	}

	// Verify modified task
	if len(diff.ModifiedTasks) != 1 {
		t.Fatalf("expected 1 modified task, got %d", len(diff.ModifiedTasks))
	}
	if diff.ModifiedTasks[0].TaskID != "task_1" {
		t.Fatalf("expected task_1 modified, got %s", diff.ModifiedTasks[0].TaskID)
	}
	if diff.ModifiedTasks[0].OldStatus != "pending" {
		t.Fatalf("expected old status pending, got %s", diff.ModifiedTasks[0].OldStatus)
	}
	if diff.ModifiedTasks[0].NewStatus != "running" {
		t.Fatalf("expected new status running, got %s", diff.ModifiedTasks[0].NewStatus)
	}
}

func TestCheckpointStore_DeleteCheckpoint(t *testing.T) {
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 10)
	if err != nil {
		t.Fatal(err)
	}

	err = store.Save([]*CoordinationTask{{ID: "to_delete"}}, nil)
	if err != nil {
		t.Fatal(err)
	}

	checkpoints, err := store.ListCheckpoints()
	if err != nil {
		t.Fatal(err)
	}
	if len(checkpoints) != 1 {
		t.Fatalf("expected 1 checkpoint, got %d", len(checkpoints))
	}

	// Delete the checkpoint
	err = store.DeleteCheckpoint(checkpoints[0].ID)
	if err != nil {
		t.Fatal(err)
	}

	// Verify deleted
	checkpoints, err = store.ListCheckpoints()
	if err != nil {
		t.Fatal(err)
	}
	if len(checkpoints) != 0 {
		t.Fatalf("expected 0 checkpoints after delete, got %d", len(checkpoints))
	}

	// Delete non-existent should not error
	err = store.DeleteCheckpoint("nonexistent")
	if err != nil {
		t.Fatal(err)
	}
}
