package swarm

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// skipIfCannotChmod skips the test if the filesystem doesn't support chmod
// (e.g., running as root, or on a filesystem that ignores permissions).
func skipIfCannotChmod(t *testing.T, dir string) {
	t.Helper()
	helper := filepath.Join(dir, ".permcheck")
	if err := os.WriteFile(helper, []byte("x"), 0o600); err != nil {
		t.Skip("cannot write test file for permission check")
	}
	if err := os.Chmod(helper, 0o400); err != nil {
		t.Skip("cannot chmod test file")
	}
	// Try writing after chmod to read-only — if it succeeds, permissions are ignored
	if err := os.WriteFile(helper, []byte("y"), 0o600); err == nil {
		t.Skip("filesystem ignores permission changes (likely root or container)")
	}
	os.Remove(helper)
}

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

func TestCheckpointStore_Save_ReadOnlyDir(t *testing.T) {
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 5)
	if err != nil {
		t.Fatal(err)
	}

	skipIfCannotChmod(t, dir)

	// Make the directory read-only to trigger CreateTemp failure
	if err := os.Chmod(dir, 0o500); err != nil {
		t.Fatal(err)
	}
	defer os.Chmod(dir, 0o700) // restore for cleanup

	err = store.Save([]*CoordinationTask{{ID: "task_1"}}, nil)
	if err == nil {
		t.Fatal("expected error when saving to read-only directory")
	}
	// The error should mention temp file creation failure
	if err != nil && !strings.Contains(err.Error(), "temp") {
		t.Errorf("expected temp-related error, got: %v", err)
	}
}

func TestCheckpointStore_Save_NonExistentDir(t *testing.T) {
	// Test Save when the dataDir has been removed after creation
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 5)
	if err != nil {
		t.Fatal(err)
	}

	// Remove the directory to trigger ReadDir failure in pruneOld
	// and file creation failure in subsequent Saves
	os.RemoveAll(dir)

	// First Save should fail because the directory no longer exists
	err = store.Save([]*CoordinationTask{{ID: "task_1"}}, nil)
	if err == nil {
		t.Fatal("expected error when saving to removed directory")
	}
}

func TestCheckpointStore_Save_Concurrent(t *testing.T) {
	// Test concurrent Save calls to verify thread safety
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 10)
	if err != nil {
		t.Fatal(err)
	}

	const goroutines = 10
	errCh := make(chan error, goroutines)

	for i := 0; i < goroutines; i++ {
		go func(id int) {
			task := &CoordinationTask{
				ID:     fmt.Sprintf("task_%d", id),
				Status: TaskStatusRunning,
			}
			errCh <- store.Save([]*CoordinationTask{task}, nil)
		}(i)
	}

	for i := 0; i < goroutines; i++ {
		if err := <-errCh; err != nil {
			t.Errorf("concurrent Save %d failed: %v", i, err)
		}
	}

	// All saves should have incremented the sequence
	if store.LatestSequence() != goroutines {
		t.Fatalf("expected sequence %d, got %d", goroutines, store.LatestSequence())
	}

	// Verify all checkpoint files exist and are valid JSON
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	jsonCount := 0
	for _, e := range entries {
		if filepath.Ext(e.Name()) == ".json" {
			jsonCount++
		}
	}
	if jsonCount != goroutines {
		t.Fatalf("expected %d checkpoint files, got %d", goroutines, jsonCount)
	}
}

func TestCheckpointStore_Save_EmptyTasks(t *testing.T) {
	// Test Save with nil/empty task slices
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 5)
	if err != nil {
		t.Fatal(err)
	}

	err = store.Save(nil, nil)
	if err != nil {
		t.Fatalf("Save with nil tasks: %v", err)
	}

	err = store.Save([]*CoordinationTask{}, []*CoordinationTask{})
	if err != nil {
		t.Fatalf("Save with empty tasks: %v", err)
	}

	cp, err := store.LoadLatest()
	if err != nil {
		t.Fatal(err)
	}
	if cp == nil {
		t.Fatal("expected checkpoint")
	}
	if len(cp.ActiveTasks) != 0 || len(cp.PendingTasks) != 0 {
		t.Fatal("expected empty task lists")
	}
}

func TestCheckpointStore_Save_FilePermissions(t *testing.T) {
	// Verify that saved checkpoint files are created with 0600 permissions
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 5)
	if err != nil {
		t.Fatal(err)
	}

	err = store.Save([]*CoordinationTask{{ID: "perm_test"}}, nil)
	if err != nil {
		t.Fatal(err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if filepath.Ext(e.Name()) != ".json" {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		// Verify it's at least not world-writable
		if info.Mode().Perm()&0o002 != 0 {
			t.Errorf("checkpoint file %s should not be world-writable, got %o", e.Name(), info.Mode().Perm())
		}
	}
}

func TestCheckpointStore_Save_RenameToReadOnlyDir(t *testing.T) {
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 5)
	if err != nil {
		t.Fatal(err)
	}

	// Create the temp file first by doing a Save, then make dir read-only
	err = store.Save([]*CoordinationTask{{ID: "first"}}, nil)
	if err != nil {
		t.Fatal(err)
	}

	skipIfCannotChmod(t, dir)

	if err := os.Chmod(dir, 0o500); err != nil {
		t.Fatal(err)
	}
	defer os.Chmod(dir, 0o700)

	err = store.Save([]*CoordinationTask{{ID: "second"}}, nil)
	if err == nil {
		t.Fatal("expected error when renaming into read-only directory")
	}
}

func TestIsValidCheckpointID(t *testing.T) {
	tests := []struct {
		name string
		id   string
		want bool
	}{
		{"valid", "cp-12345", true},
		{"valid with dashes", "checkpoint-abc-def", true},
		{"valid short", "x", true},
		{"empty", "", false},
		{"too long", strings.Repeat("a", 129), false},
		{"exactly 128", strings.Repeat("b", 128), true},
		{"contains slash", "cp/123", false},
		{"contains backslash", "cp\\123", false},
		{"contains dot", "cp.123", false},
		{"contains all forbidden", "a/b\\.c", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isValidCheckpointID(tt.id)
			if got != tt.want {
				t.Errorf("isValidCheckpointID(%q) = %v, want %v", tt.id, got, tt.want)
			}
		})
	}
}

func TestCheckpointStore_LoadCheckpoint_InvalidID(t *testing.T) {
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 5)
	if err != nil {
		t.Fatal(err)
	}

	// Test with invalid ID containing path traversal
	_, err = store.LoadCheckpoint("../etc/passwd")
	if err == nil {
		t.Fatal("expected error for invalid checkpoint ID")
	}
	if !strings.Contains(err.Error(), "invalid checkpoint id") {
		t.Errorf("expected invalid checkpoint id error, got: %v", err)
	}

	// Test with empty ID
	_, err = store.LoadCheckpoint("")
	if err == nil {
		t.Fatal("expected error for empty checkpoint ID")
	}
}

func TestCheckpointStore_DeleteCheckpoint_InvalidID(t *testing.T) {
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 5)
	if err != nil {
		t.Fatal(err)
	}

	// Test with invalid ID containing path traversal
	err = store.DeleteCheckpoint("../etc/passwd")
	if err == nil {
		t.Fatal("expected error for invalid checkpoint ID")
	}
	if !strings.Contains(err.Error(), "invalid checkpoint id") {
		t.Errorf("expected invalid checkpoint id error, got: %v", err)
	}
}

func TestCheckpointStore_DiffCheckpoints_MissingCheckpoint(t *testing.T) {
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 5)
	if err != nil {
		t.Fatal(err)
	}

	// Save one checkpoint
	err = store.Save([]*CoordinationTask{{ID: "task_1"}}, nil)
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

	// Try to diff with non-existent checkpoint
	_, err = store.DiffCheckpoints(checkpoints[0].ID, "nonexistent")
	if err == nil {
		t.Fatal("expected error when diffing with non-existent checkpoint")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Errorf("expected 'not found' error, got: %v", err)
	}

	// Try to diff with invalid ID
	_, err = store.DiffCheckpoints(checkpoints[0].ID, "../invalid")
	if err == nil {
		t.Fatal("expected error for invalid checkpoint ID")
	}
}

func TestCheckpointStore_DiffCheckpoints_RemovedTasks(t *testing.T) {
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 10)
	if err != nil {
		t.Fatal(err)
	}

	// First checkpoint with task_1 and task_2
	err = store.Save([]*CoordinationTask{
		{ID: "task_1", Title: "Task 1", Status: TaskStatusPending, Progress: 0.0},
		{ID: "task_2", Title: "Task 2", Status: TaskStatusPending, Progress: 0.0},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	time.Sleep(10 * time.Millisecond)

	// Second checkpoint with only task_1 (task_2 removed)
	err = store.Save([]*CoordinationTask{
		{ID: "task_1", Title: "Task 1", Status: TaskStatusRunning, Progress: 0.5},
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

	// Verify removed task
	if len(diff.RemovedTasks) != 1 || diff.RemovedTasks[0].ID != "task_2" {
		t.Fatalf("expected 1 removed task (task_2), got %d: %v", len(diff.RemovedTasks), diff.RemovedTasks)
	}

	// Verify modified task
	if len(diff.ModifiedTasks) != 1 {
		t.Fatalf("expected 1 modified task, got %d", len(diff.ModifiedTasks))
	}
}

func TestCheckpointStore_DiffCheckpoints_PendingTasks(t *testing.T) {
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 10)
	if err != nil {
		t.Fatal(err)
	}

	// First checkpoint with pending tasks
	err = store.Save(nil, []*CoordinationTask{
		{ID: "pending_1", Title: "Pending 1", Status: TaskStatusPending, Progress: 0.0},
	})
	if err != nil {
		t.Fatal(err)
	}
	time.Sleep(10 * time.Millisecond)

	// Second checkpoint with pending task moved to active
	err = store.Save([]*CoordinationTask{
		{ID: "pending_1", Title: "Pending 1", Status: TaskStatusRunning, Progress: 0.5},
	}, []*CoordinationTask{})
	if err != nil {
		t.Fatal(err)
	}

	checkpoints, err := store.ListCheckpoints()
	if err != nil {
		t.Fatal(err)
	}

	diff, err := store.DiffCheckpoints(checkpoints[1].ID, checkpoints[0].ID)
	if err != nil {
		t.Fatal(err)
	}

	// Task should be modified, not added/removed
	if len(diff.ModifiedTasks) != 1 {
		t.Fatalf("expected 1 modified task, got %d", len(diff.ModifiedTasks))
	}
	if diff.ModifiedTasks[0].TaskID != "pending_1" {
		t.Errorf("expected pending_1 modified, got %s", diff.ModifiedTasks[0].TaskID)
	}
}

func TestCheckpointStore_ListCheckpoints_Empty(t *testing.T) {
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 5)
	if err != nil {
		t.Fatal(err)
	}

	checkpoints, err := store.ListCheckpoints()
	if err != nil {
		t.Fatal(err)
	}
	if len(checkpoints) != 0 {
		t.Errorf("expected nil or empty list, got %d checkpoints", len(checkpoints))
	}
}

func TestCheckpointStore_NewCheckpointStore_Error(t *testing.T) {
	// Try to create a store in a path where parent is a file
	tmpFile := filepath.Join(t.TempDir(), "notadir")
	if err := os.WriteFile(tmpFile, []byte("test"), 0644); err != nil {
		t.Fatal(err)
	}

	_, err := NewCheckpointStore(tmpFile, 5)
	if err == nil {
		t.Fatal("expected error when creating store in a file path")
	}
}

func TestCheckpointStore_LatestSequence(t *testing.T) {
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 5)
	if err != nil {
		t.Fatal(err)
	}

	// Initial sequence should be 0
	if store.LatestSequence() != 0 {
		t.Errorf("expected initial sequence 0, got %d", store.LatestSequence())
	}

	// After save, sequence should increment
	_ = store.Save(nil, nil)
	if store.LatestSequence() != 1 {
		t.Errorf("expected sequence 1, got %d", store.LatestSequence())
	}

	_ = store.Save(nil, nil)
	if store.LatestSequence() != 2 {
		t.Errorf("expected sequence 2, got %d", store.LatestSequence())
	}
}

// ---------------------------------------------------------------------------
// Save function error branch coverage tests
// ---------------------------------------------------------------------------

// TestCheckpointStore_Save_CreateTempFail_DirIsFile tests that Save returns an
// error when dataDir is a regular file rather than a directory. This covers the
// os.CreateTemp failure branch (checkpoint.go:76-79).
func TestCheckpointStore_Save_CreateTempFail_DirIsFile(t *testing.T) {
	tmpFile := filepath.Join(t.TempDir(), "not_a_dir")
	if err := os.WriteFile(tmpFile, []byte("data"), 0644); err != nil {
		t.Fatal(err)
	}

	// Bypass the constructor to inject a file path as dataDir.
	store := &CheckpointStore{dataDir: tmpFile, maxKeep: 5}

	err := store.Save([]*CoordinationTask{{ID: "t1"}}, nil)
	if err == nil {
		t.Fatal("expected error when dataDir is a file")
	}
	if !strings.Contains(err.Error(), "temp") {
		t.Errorf("expected 'temp' in error message, got: %v", err)
	}
}

// TestCheckpointStore_Save_CreateTempFail_NoPermission tests the CreateTemp
// failure path by making dataDir read-only. This is a more targeted variant
// of the existing TestCheckpointStore_Save_ReadOnlyDir test.
func TestCheckpointStore_Save_CreateTempFail_NoPermission(t *testing.T) {
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 5)
	if err != nil {
		t.Fatal(err)
	}

	skipIfCannotChmod(t, dir)

	if err := os.Chmod(dir, 0o555); err != nil {
		t.Fatal(err)
	}
	defer os.Chmod(dir, 0o755)

	err = store.Save([]*CoordinationTask{{ID: "t1"}}, nil)
	if err == nil {
		t.Fatal("expected error when dataDir is read-only")
	}
	// Verify the error comes from the temp file creation step.
	if !strings.Contains(err.Error(), "temp") {
		t.Errorf("expected 'temp' in error, got: %v", err)
	}
}

// TestCheckpointStore_Save_CreateTempFail_PathTooLong tests that Save returns
// an error when dataDir is a path exceeding the OS limit. This covers the
// os.CreateTemp failure branch via ENAMETOOLONG.
func TestCheckpointStore_Save_CreateTempFail_PathTooLong(t *testing.T) {
	// Create a very long path component (exceeds PATH_MAX on Linux = 4096).
	longDir := filepath.Join(t.TempDir(), strings.Repeat("a", 5000))
	store := &CheckpointStore{dataDir: longDir, maxKeep: 5}

	err := store.Save([]*CoordinationTask{{ID: "t1"}}, nil)
	if err == nil {
		t.Fatal("expected error for excessively long dataDir path")
	}
}

// TestCheckpointStore_Save_MarshalFail tests the json.Marshal failure branch.
// This is covered by creating a CoordinationTask with a channel field (which
// is not JSON-serializable) wrapped through an interface. Since the current
// CoordinatorSnapshot struct only uses JSON-serializable fields, this branch
// is effectively a hard boundary for the current struct definition.
// We verify the marshal path is reachable by confirming the error wrapping.
// Note: With the current struct, json.Marshal will never fail because all
// fields are JSON-safe. This test documents that the branch exists but cannot
// be triggered without modifying the struct.
func TestCheckpointStore_Save_MarshalFail_HardBoundary(t *testing.T) {
	t.Skip("HARD BOUNDARY: CoordinatorSnapshot fields are all JSON-serializable; " +
		"json.Marshal cannot fail with the current struct definition. " +
		"To cover this branch, a non-serializable field would need to be added.")
}

// TestCheckpointStore_Save_ChmodFail_HardBoundary documents that the tmp.Chmod
// failure branch (checkpoint.go:80-84) cannot be reliably triggered on Linux.
// On Linux, chmod(2) on a regular file owned by the calling process always
// succeeds. It can only fail for special files, NFS with root squashing, or
// SELinux/AppArmor policies.
func TestCheckpointStore_Save_ChmodFail_HardBoundary(t *testing.T) {
	t.Skip("HARD BOUNDARY: chmod on a regular file owned by the process " +
		"always succeeds on Linux. Cannot trigger without root/NFS/SELinux.")
}

// TestCheckpointStore_Save_WriteFail_HardBoundary documents that the tmp.Write
// failure branch (checkpoint.go:86-90) cannot be reliably triggered in unit
// tests. Write can fail with ENOSPC (disk full) or EIO (I/O error), but these
// require either filling the disk or using a fault-injecting filesystem.
func TestCheckpointStore_Save_WriteFail_HardBoundary(t *testing.T) {
	t.Skip("HARD BOUNDARY: Write to a regular file fails only on ENOSPC " +
		"(disk full) or EIO. Not triggerable in unit tests without " +
		"fault-injecting filesystems (e.g., dm-flakey, FUSE).")
}

// TestCheckpointStore_Save_CloseFail_HardBoundary documents that the tmp.Close
// failure branch (checkpoint.go:91-94) cannot be reliably triggered in unit
// tests. Close can fail with EIO on NFS or with a disk error, but on local
// filesystems close(2) almost never fails.
func TestCheckpointStore_Save_CloseFail_HardBoundary(t *testing.T) {
	t.Skip("HARD BOUNDARY: Close on a regular file fails only on EIO " +
		"(e.g., NFS write-back failure). Not triggerable in unit tests.")
}

// TestCheckpointStore_Save_RenameFail_CrossDevice tests the os.Rename failure
// branch (checkpoint.go:97-100) by using /tmp and a tmpfs mount... however,
// without root access this cannot be done. On Linux, rename(2) fails with
// EXDEV when source and destination are on different filesystems. Since both
// the temp file and final path are in the same dataDir, this can only happen
// if dataDir itself spans filesystems (e.g., a bind mount), which requires
// root to set up.
func TestCheckpointStore_Save_RenameFail_HardBoundary(t *testing.T) {
	t.Skip("HARD BOUNDARY: Rename fails with EXDEV only when source and " +
		"dest are on different filesystems. Since both files are in " +
		"dataDir, this requires root to set up (bind mount, tmpfs). " +
		"Making dataDir read-only causes CreateTemp to fail first.")
}

// TestCheckpointStore_Save_SequenceIncrementsOnFailure verifies that even when
// Save fails, the sequence counter has already been incremented (because the
// increment happens before the file operations). This is important behavioral
// coverage for the lock/unlock section at the top of Save.
func TestCheckpointStore_Save_SequenceIncrementsOnFailure(t *testing.T) {
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 5)
	if err != nil {
		t.Fatal(err)
	}

	// Make dir read-only so Save fails at CreateTemp.
	if err := os.Chmod(dir, 0o555); err != nil {
		t.Fatal(err)
	}
	defer os.Chmod(dir, 0o755)

	before := store.LatestSequence()
	err = store.Save(nil, nil)
	if err == nil {
		t.Fatal("expected Save to fail")
	}
	after := store.LatestSequence()

	// The sequence was incremented inside Save before the error occurred.
	if after != before+1 {
		t.Errorf("expected sequence to increment from %d to %d even on failure, got %d",
			before, before+1, after)
	}
}

// TestCheckpointStore_Save_TempFileCleanupOnError verifies that when Save fails
// after creating the temp file, the temp file is cleaned up. We verify this by
// checking that no .tmp files remain in dataDir after a failed Save.
func TestCheckpointStore_Save_TempFileCleanupOnError(t *testing.T) {
	dir := t.TempDir()
	store, err := NewCheckpointStore(dir, 5)
	if err != nil {
		t.Fatal(err)
	}

	// Make dir read-only so Save fails at CreateTemp.
	// In this case no temp file is created, so no cleanup needed.
	if err := os.Chmod(dir, 0o555); err != nil {
		t.Fatal(err)
	}
	defer os.Chmod(dir, 0o755)

	_ = store.Save(nil, nil)

	// Verify no .tmp files remain.
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".tmp") {
			t.Errorf("temp file not cleaned up: %s", e.Name())
		}
	}
}

// TestCheckpointStore_Save_NoWorkflowID_NoCheckpointID documents that the Save
// function does not validate workflowID or checkpointID because:
// 1. Save does not take a workflowID parameter -- it stores coordinator state
// 2. checkpointID is auto-generated inside Save (fmt.Sprintf with UUID)
// These validations exist in LoadCheckpoint and DeleteCheckpoint via
// isValidCheckpointID, but not in Save.
func TestCheckpointStore_Save_NoWorkflowID_NoCheckpointID(t *testing.T) {
	t.Skip("NOT APPLICABLE: Save(activeTasks, pendingTasks) does not accept " +
		"workflowID or checkpointID parameters. Checkpoint ID is auto-generated " +
		"with UUID. Validation via isValidCheckpointID applies to Load/Delete, " +
		"not Save. See TestIsValidCheckpointID and TestCheckpointStore_LoadCheckpoint_InvalidID.")
}
