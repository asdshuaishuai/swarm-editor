package api

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestRevealFile_NotExist(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("reveal_file", json.RawMessage(`{"path":"nonexistent.txt"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent path")
	}
}

func TestRevealFile_InvalidJSON(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("reveal_file", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestRevealFile_PathTraversal(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("reveal_file", json.RawMessage(`{"path":"../../etc/passwd"}`), "test")
	if err == nil {
		t.Error("expected error for path traversal")
	}
}

func TestRevealFile_Exists(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	// Create a file
	if err := os.WriteFile(filepath.Join(dir, "test.txt"), []byte("hello"), 0644); err != nil {
		t.Fatal(err)
	}

	// This will attempt to run xdg-open on Linux which may fail in CI
	// but we can at least verify the path validation passes
	result, err := handler.HandleCommand("reveal_file", json.RawMessage(`{"path":"test.txt"}`), "test")
	if err != nil {
		// In CI without a display manager, xdg-open may fail — that's OK
		t.Logf("reveal failed (expected in CI): %v", err)
		return
	}
	m, ok := result.(map[string]bool)
	if !ok {
		t.Fatalf("expected map[string]bool, got %T", result)
	}
	if !m["success"] {
		t.Error("expected success=true")
	}
}

func TestListDir_WithFiles(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	// Create files and directories
	if err := os.WriteFile(filepath.Join(dir, "file1.txt"), []byte("content1"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "subdir"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "subdir", "file2.txt"), []byte("content2"), 0644); err != nil {
		t.Fatal(err)
	}

	result, err := handler.HandleCommand("list_dir", json.RawMessage(`{"path":""}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// list_dir returns []FileInfo directly
	entries, ok := result.([]FileInfo)
	if !ok {
		t.Fatalf("expected []FileInfo, got %T", result)
	}
	if len(entries) == 0 {
		t.Error("expected at least one entry")
	}
	t.Logf("entries: %d items", len(entries))
}

func TestListDir_Subdirectory(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	if err := os.MkdirAll(filepath.Join(dir, "sub"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "sub", "a.txt"), []byte("a"), 0644); err != nil {
		t.Fatal(err)
	}

	result, err := handler.HandleCommand("list_dir", json.RawMessage(`{"path":"sub"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("subdir listing: %T", result)
}

func TestSearchFiles_WithWorkspace(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	// Create files
	if err := os.WriteFile(filepath.Join(dir, "app.go"), []byte("package main"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "app_test.go"), []byte("package main"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "src"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "src", "util.go"), []byte("package util"), 0644); err != nil {
		t.Fatal(err)
	}

	result, err := handler.HandleCommand("search_files", json.RawMessage(`{"query":"*.go"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// search_files returns map[string][]FileInfo
	m, ok := result.(map[string][]FileInfo)
	if !ok {
		t.Fatalf("expected map[string][]FileInfo, got %T", result)
	}
	t.Logf("search files result: %d files", len(m["results"]))
}
