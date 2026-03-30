package api

import (
	"fmt"
	"sync"
	"testing"
)

func TestWorkspaceManager_Create(t *testing.T) {
	m := NewWorkspaceManager()

	w := m.Create("ws-1", "Test", "/tmp/test")
	if w == nil {
		t.Fatal("expected workspace, got nil")
	}
	if w.ID != "ws-1" {
		t.Errorf("expected ID ws-1, got %s", w.ID)
	}
}

func TestWorkspaceManager_Get(t *testing.T) {
	m := NewWorkspaceManager()
	m.Create("ws-1", "Test", "/tmp/test")

	w := m.Get("ws-1")
	if w == nil {
		t.Error("expected workspace, got nil")
	}

	w = m.Get("ws-404")
	if w != nil {
		t.Error("expected nil for non-existing workspace")
	}

	// Test immutability of returned copy
	original := m.Get("ws-1")
	 original.Name = "modified"
	if m.Get("ws-1").Name == "modified" {
	 t.Error("Get should return a copy")
    }
}

func TestWorkspaceManager_Delete(t *testing.T) {
	m := NewWorkspaceManager()
	m.Create("ws-1", "Test", "/tmp/test")

	m.Delete("ws-1")
	if m.Get("ws-1") != nil {
        t.Error("ws-1 should be deleted")
    }
	if m.GetByPath("/tmp/test") != nil {
        t.Error("byPath mapping should be removed")
    }
}

func TestWorkspaceManager_LockFile(t *testing.T) {
	m := NewWorkspaceManager()
	m.Create("ws-1", "Test", "/tmp/test")

	// Lock file successfully
	err := m.LockFile("ws-1", "/file.go", "user-1")
	if err != nil {
		t.Errorf("expected no error, got %v", err)
	 }

	// Verify lock
	w := m.Get("ws-1")
	if w.FileLocks["/file.go"] != "user-1" {
        t.Error("file should be locked")
    }

	// Double lock by different user should fail
	err = m.LockFile("ws-1", "/file.go", "user-2")
	if err == nil {
        t.Error("expected error when file already locked")
    }
}

func TestWorkspaceManager_UnlockFile(t *testing.T) {
	m := NewWorkspaceManager()
	m.Create("ws-1", "Test", "/tmp/test")

	// Lock file first
	m.LockFile("ws-1", "/file.go", "user-1")

	// Owner unlocks
	err := m.UnlockFile("ws-1", "/file.go", "user-1")
	if err != nil {
        t.Errorf("owner should be able to unlock: %v", err)
    }

	// Verify unlocked
	w := m.Get("ws-1")
	if _, ok := w.FileLocks["/file.go"]; ok {
        t.Error("file should be unlocked")
    }
}

func TestWorkspaceManager_Concurrency(t *testing.T) {
	m := NewWorkspaceManager()

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
        wg.Add(1)
        go func(id int) {
            defer wg.Done()
            m.Create(fmt.Sprintf("ws-%d", id), "Workspace", fmt.Sprintf("/path%d", id))
        }(i)
    }

	wg.Wait()

	if len(m.List()) != 10 {
        t.Errorf("expected 10 workspaces, got %d", len(m.List()))
    }
}
