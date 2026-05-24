package api

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSafePath_EmptyPath(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.safePath("")
	if err == nil {
		t.Error("expected error for empty path")
	}
}

func TestSafePath_NoWorkspace(t *testing.T) {
	server := &WebSocketServer{workspacePath: ""}
	handler := NewCommandHandler(server)

	_, err := handler.safePath("file.txt")
	if err == nil {
		t.Error("expected error for no workspace")
	}
}

func TestSafePath_ValidExistingFile(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	// Create a file
	if err := os.WriteFile(filepath.Join(dir, "test.txt"), []byte("hello"), 0644); err != nil {
		t.Fatal(err)
	}

	path, err := handler.safePath("test.txt")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if path != filepath.Join(dir, "test.txt") {
		t.Errorf("expected %s, got %s", filepath.Join(dir, "test.txt"), path)
	}
}

func TestSafePath_ValidNewFile(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	// File doesn't exist yet — should still validate parent
	path, err := handler.safePath("newfile.txt")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if path != filepath.Join(dir, "newfile.txt") {
		t.Errorf("expected %s, got %s", filepath.Join(dir, "newfile.txt"), path)
	}
}

func TestSafePath_PathTraversal(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	_, err := handler.safePath("../../etc/passwd")
	if err == nil {
		t.Error("expected error for path traversal")
	}
}

func TestSafePath_DeepPathTraversal(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	_, err := handler.safePath("subdir/../../etc/shadow")
	if err == nil {
		t.Error("expected error for deep path traversal")
	}
}

func TestSafePath_Subdirectory(t *testing.T) {
	dir := t.TempDir()
	subdir := filepath.Join(dir, "src")
	if err := os.MkdirAll(subdir, 0755); err != nil {
		t.Fatal(err)
	}

	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	path, err := handler.safePath("src/main.go")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if path != filepath.Join(dir, "src", "main.go") {
		t.Errorf("unexpected path: %s", path)
	}
}

func TestSafePath_DotPath(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	path, err := handler.safePath(".")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if path != dir {
		t.Errorf("expected %s, got %s", dir, path)
	}
}

func TestSafePath_NestedNewFile(t *testing.T) {
	dir := t.TempDir()
	sub := filepath.Join(dir, "deep", "nested")
	if err := os.MkdirAll(sub, 0755); err != nil {
		t.Fatal(err)
	}

	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	path, err := handler.safePath("deep/nested/file.ts")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if path != filepath.Join(sub, "file.ts") {
		t.Errorf("expected %s, got %s", filepath.Join(sub, "file.ts"), path)
	}
}

func TestIsBinaryContent_Text(t *testing.T) {
	if isBinaryContent([]byte("Hello World")) {
		t.Error("expected text content to not be binary")
	}
}

func TestIsBinaryContent_Binary(t *testing.T) {
	// Contains null byte
	if !isBinaryContent([]byte("Hello\x00World")) {
		t.Error("expected content with null byte to be binary")
	}
}

func TestIsBinaryContent_Empty(t *testing.T) {
	if isBinaryContent([]byte{}) {
		t.Error("expected empty content to not be binary")
	}
}

func TestIsBinaryContent_UTF8(t *testing.T) {
	// Valid UTF-8 with multibyte chars
	if isBinaryContent([]byte("Hello 世界")) {
		t.Error("expected UTF-8 content to not be binary")
	}
}

func TestIsBinaryContent_Code(t *testing.T) {
	code := []byte("package main\n\nfunc main() {\n\tprintln(\"hello\")\n}")
	if isBinaryContent(code) {
		t.Error("expected Go code to not be binary")
	}
}
