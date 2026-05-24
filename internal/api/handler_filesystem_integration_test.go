package api

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestFilesystemHandler_SearchContent_WithWorkspace(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	// Create files with content
	if err := os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("Hello World\nFoo Bar\nhello again"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "other.txt"), []byte("No match here"), 0644); err != nil {
		t.Fatal(err)
	}

	result, err := handler.HandleCommand("search_content", json.RawMessage(`{"query":"hello","limit":10}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string][]ContentSearchResult)
	if !ok {
		t.Fatalf("expected map[string][]ContentSearchResult, got %T", result)
	}
	results := m["results"]
	if len(results) == 0 {
		t.Error("expected at least one search result")
	}
	t.Logf("found %d results", len(results))
}

func TestFilesystemHandler_SearchContent_CaseSensitive(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	if err := os.WriteFile(filepath.Join(dir, "test.txt"), []byte("Hello hello HELLO"), 0644); err != nil {
		t.Fatal(err)
	}

	// Case-insensitive (default) should find matches
	result, err := handler.HandleCommand("search_content", json.RawMessage(`{"query":"hello","limit":10}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string][]ContentSearchResult)
	if len(m["results"]) == 0 {
		t.Error("expected at least one result for case-insensitive")
	}

	// Case-sensitive
	result, err = handler.HandleCommand("search_content", json.RawMessage(`{"query":"hello","caseSensitive":true,"limit":10}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m = result.(map[string][]ContentSearchResult)
	t.Logf("case-sensitive results: %d", len(m["results"]))
}

func TestFilesystemHandler_SearchContent_EmptyQuery(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("search_content", json.RawMessage(`{"query":""}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string][]ContentSearchResult)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if len(m["results"]) != 0 {
		t.Error("expected empty results for empty query")
	}
}

func TestFilesystemHandler_ReplaceContent_WithWorkspace(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	content := "Hello World\nFoo Bar\nHello Again"
	if err := os.WriteFile(filepath.Join(dir, "test.txt"), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	result, err := handler.HandleCommand("replace_content", json.RawMessage(`{"query":"Hello","replacement":"Hi"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["results"] == nil {
		t.Error("expected results field")
	}

	// Verify file was modified
	data, err := os.ReadFile(filepath.Join(dir, "test.txt"))
	if err != nil {
		t.Fatal(err)
	}
	if string(data) == content {
		t.Error("expected file to be modified")
	}
	t.Logf("results: %v", m["results"])
}

func TestFilesystemHandler_ReplaceContent_NoMatch(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	if err := os.WriteFile(filepath.Join(dir, "test.txt"), []byte("Hello World"), 0644); err != nil {
		t.Fatal(err)
	}

	result, err := handler.HandleCommand("replace_content", json.RawMessage(`{"query":"NotFound","replacement":"X"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]any)
	replacements := m["results"]
	if replacements == nil {
		t.Error("expected results field")
	}
}

func TestFilesystemHandler_CopyFile(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	if err := os.WriteFile(filepath.Join(dir, "src.txt"), []byte("copy me"), 0644); err != nil {
		t.Fatal(err)
	}

	_, err := handler.HandleCommand("copy_file", json.RawMessage(`{"srcPath":"src.txt","dstPath":"dst.txt"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(dir, "dst.txt"))
	if err != nil {
		t.Fatalf("failed to read copied file: %v", err)
	}
	if string(data) != "copy me" {
		t.Errorf("expected 'copy me', got '%s'", data)
	}
}

func TestFilesystemHandler_CopyFile_ToSubdir(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	if err := os.MkdirAll(filepath.Join(dir, "subdir"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "src.txt"), []byte("content"), 0644); err != nil {
		t.Fatal(err)
	}

	_, err := handler.HandleCommand("copy_file", json.RawMessage(`{"srcPath":"src.txt","dstPath":"subdir/copied.txt"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(dir, "subdir", "copied.txt"))
	if err != nil {
		t.Fatalf("failed to read copied file: %v", err)
	}
	if string(data) != "content" {
		t.Errorf("expected 'content', got '%s'", data)
	}
}

func TestFilesystemHandler_Mkdir(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("mkdir", json.RawMessage(`{"path":"newdir"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	stat, err := os.Stat(filepath.Join(dir, "newdir"))
	if err != nil {
		t.Fatalf("directory not created: %v", err)
	}
	if !stat.IsDir() {
		t.Error("expected directory")
	}
}

func TestFilesystemHandler_CreateFile(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("create_file", json.RawMessage(`{"path":"newfile.txt"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	stat, err := os.Stat(filepath.Join(dir, "newfile.txt"))
	if err != nil {
		t.Fatalf("file not created: %v", err)
	}
	if stat.IsDir() {
		t.Error("expected file, not directory")
	}
}

func TestFilesystemHandler_ReadWriteRoundTrip(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	content := "Hello, World!\nLine 2\nLine 3"

	// Write
	_, err := handler.HandleCommand("write_file", json.RawMessage(`{"path":"roundtrip.txt","content":"Hello, World!\nLine 2\nLine 3"}`), "test")
	if err != nil {
		t.Fatalf("write error: %v", err)
	}

	// Read
	result, err := handler.HandleCommand("read_file", json.RawMessage(`{"path":"roundtrip.txt"}`), "test")
	if err != nil {
		t.Fatalf("read error: %v", err)
	}
	m, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map[string]string, got %T", result)
	}
	if m["content"] != content {
		t.Errorf("expected %q, got %q", content, m["content"])
	}
}

func TestFilesystemHandler_DeleteFile(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	if err := os.WriteFile(filepath.Join(dir, "todelete.txt"), []byte("bye"), 0644); err != nil {
		t.Fatal(err)
	}

	_, err := handler.HandleCommand("delete_file", json.RawMessage(`{"path":"todelete.txt"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if _, err := os.Stat(filepath.Join(dir, "todelete.txt")); !os.IsNotExist(err) {
		t.Error("expected file to be deleted")
	}
}

func TestFilesystemHandler_RenameFile(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	if err := os.WriteFile(filepath.Join(dir, "old.txt"), []byte("data"), 0644); err != nil {
		t.Fatal(err)
	}

	_, err := handler.HandleCommand("rename_file", json.RawMessage(`{"oldPath":"old.txt","newPath":"new.txt"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if _, err := os.Stat(filepath.Join(dir, "old.txt")); !os.IsNotExist(err) {
		t.Error("expected old file to be gone")
	}
	data, err := os.ReadFile(filepath.Join(dir, "new.txt"))
	if err != nil {
		t.Fatalf("new file not found: %v", err)
	}
	if string(data) != "data" {
		t.Errorf("expected 'data', got '%s'", data)
	}
}
