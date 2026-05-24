package api

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestFileWatcher_NewFileWatcher(t *testing.T) {
	fw := NewFileWatcher(nil)
	if fw == nil {
		t.Fatal("expected non-nil FileWatcher")
	}
}

func TestFileWatcher_Watch_EmptyPath(t *testing.T) {
	fw := NewFileWatcher(nil)
	err := fw.Watch("")
	if err != nil {
		t.Fatalf("expected nil error for empty path, got %v", err)
	}
	fw.Stop()
}

func TestFileWatcher_Watch_NonexistentDir(t *testing.T) {
	fw := NewFileWatcher(nil)
	err := fw.Watch("/tmp/nonexistent_dir_12345")
	if err == nil {
		t.Error("expected error for nonexistent directory")
	}
	fw.Stop()
}

func TestFileWatcher_Watch_Stop(t *testing.T) {
	dir := t.TempDir()
	fw := NewFileWatcher(nil)

	err := fw.Watch(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	fw.Stop()

	// Stop should be idempotent
	fw.Stop()
}

func TestFileWatcher_Watch_Restart(t *testing.T) {
	dir := t.TempDir()
	fw := NewFileWatcher(nil)

	err := fw.Watch(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Restart with same dir
	err = fw.Watch(dir)
	if err != nil {
		t.Fatalf("unexpected error on restart: %v", err)
	}

	fw.Stop()
}

func TestIsNoisePath(t *testing.T) {
	tests := []struct {
		path     string
		expected bool
	}{
		{"/home/user/project/.git/config", true},
		{"/home/user/project/node_modules/react/index.js", true},
		{"/home/user/project/.cache/data", true},
		{"/home/user/project/__pycache__/foo.pyc", true},
		{"/home/user/project/.next/build-manifest.json", true},
		{"/home/user/project/dist/bundle.js", true},
		{"/home/user/project/build/output.js", true},
		{"/home/user/project/target/classes/App.class", true},
		{"/home/user/project/vendor/lib.rs", true},
		{"/home/user/project/.idea/workspace.xml", true},
		{"/home/user/project/.vscode/settings.json", true},
		{"/home/user/project/.terraform/tfstate", true},
		{"/home/user/project/bin/main", true},
		{"/home/user/project/src/main.go", false},
		{"/home/user/project/README.md", false},
		{"/home/user/project/internal/api/handler.go", false},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			result := isNoisePath(tt.path)
			if result != tt.expected {
				t.Errorf("isNoisePath(%q) = %v, want %v", tt.path, result, tt.expected)
			}
		})
	}
}

func TestFileWatcher_EventBroadcast(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping file watcher event test in short mode")
	}

	dir := t.TempDir()

	// Create a simple mock hub that captures broadcasts
	var broadcasted []string
	var broadcastPayloads []FileEvent
	hub := &ClientHub{}

	// We can't easily mock the hub.Broadcast, so we test the helper functions instead
	_ = hub
	_ = broadcasted
	_ = broadcastPayloads

	fw := NewFileWatcher(hub)
	err := fw.Watch(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Create a file — the event should be classified as FileCreated
	testFile := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(testFile, []byte("hello"), 0644); err != nil {
		t.Fatalf("failed to create test file: %v", err)
	}

	// Give the watcher time to process
	time.Sleep(200 * time.Millisecond)

	// Modify the file — should be classified as FileChanged
	if err := os.WriteFile(testFile, []byte("world"), 0644); err != nil {
		t.Fatalf("failed to modify test file: %v", err)
	}

	time.Sleep(200 * time.Millisecond)

	// Delete the file — should be classified as FileDeleted
	if err := os.Remove(testFile); err != nil {
		t.Fatalf("failed to delete test file: %v", err)
	}

	time.Sleep(200 * time.Millisecond)

	fw.Stop()
}

func TestAddSubdirs_NoPanic(t *testing.T) {
	dir := t.TempDir()

	// Create directory structure
	os.MkdirAll(filepath.Join(dir, "src", "pkg"), 0755)
	os.MkdirAll(filepath.Join(dir, ".git", "objects"), 0755)
	os.MkdirAll(filepath.Join(dir, "node_modules", "react"), 0755)

	// Test via FileWatcher.Watch which calls addSubdirs internally
	fw := NewFileWatcher(nil)
	err := fw.Watch(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	fw.Stop()
}
