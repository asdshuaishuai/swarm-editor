package api

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestHandleDeleteFile_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("delete_file", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleDeleteFile_EmptyPath(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("delete_file", json.RawMessage(`{"path":""}`), "test")
	if err == nil {
		t.Error("expected error for empty path")
	}
}

func TestHandleDeleteFile_NonexistentFile(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("delete_file", json.RawMessage(`{"path":"noexist.txt"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent file")
	}
}

func TestHandleDeleteFile_ValidFile(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "del.txt"), []byte("content"), 0644)

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("delete_file", json.RawMessage(`{"path":"del.txt"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]string)
	if m["status"] != "deleted" {
		t.Errorf("expected status deleted, got %s", m["status"])
	}
	if _, err := os.Stat(filepath.Join(dir, "del.txt")); !os.IsNotExist(err) {
		t.Error("expected file to be deleted")
	}
}

func TestHandleDeleteFile_Directory(t *testing.T) {
	dir := t.TempDir()
	subdir := filepath.Join(dir, "subdir")
	os.MkdirAll(subdir, 0755)
	os.WriteFile(filepath.Join(subdir, "inner.txt"), []byte("data"), 0644)

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("delete_file", json.RawMessage(`{"path":"subdir"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]string)
	if m["status"] != "deleted" {
		t.Errorf("expected status deleted, got %s", m["status"])
	}
	if _, err := os.Stat(subdir); !os.IsNotExist(err) {
		t.Error("expected directory to be deleted")
	}
}

func TestHandleCopyFile_SelfCopy(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "same.txt"), []byte("content"), 0644)

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("copy_file", json.RawMessage(`{"srcPath":"same.txt","dstPath":"same.txt"}`), "test")
	if err == nil {
		t.Error("expected error for copying onto itself")
	}
}

func TestHandleCopyFile_ToDirectory(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "src.txt"), []byte("content"), 0644)
	os.MkdirAll(filepath.Join(dir, "subdir"), 0755)

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("copy_file", json.RawMessage(`{"srcPath":"src.txt","dstPath":"subdir"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]string)
	if m["status"] != "copied" {
		t.Errorf("expected status copied, got %s", m["status"])
	}
	data, _ := os.ReadFile(filepath.Join(dir, "subdir", "src.txt"))
	if string(data) != "content" {
		t.Errorf("expected content in copied file, got '%s'", data)
	}
}

func TestHandleCopyFile_DestinationExists(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "src.txt"), []byte("a"), 0644)
	os.WriteFile(filepath.Join(dir, "dst.txt"), []byte("b"), 0644)

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("copy_file", json.RawMessage(`{"srcPath":"src.txt","dstPath":"dst.txt"}`), "test")
	if err == nil {
		t.Error("expected error when destination exists")
	}
}

func TestHandleCopyFile_CopyDirectory(t *testing.T) {
	dir := t.TempDir()
	srcDir := filepath.Join(dir, "srcdir")
	os.MkdirAll(srcDir, 0755)
	os.WriteFile(filepath.Join(srcDir, "file.txt"), []byte("data"), 0644)

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("copy_file", json.RawMessage(`{"srcPath":"srcdir","dstPath":"dstdir"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]string)
	if m["status"] != "copied" {
		t.Errorf("expected status copied, got %s", m["status"])
	}
	data, _ := os.ReadFile(filepath.Join(dir, "dstdir", "file.txt"))
	if string(data) != "data" {
		t.Errorf("expected content in copied dir file, got '%s'", data)
	}
}

func TestHandleCopyFile_DeepPath(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "deep.txt"), []byte("deep content"), 0644)

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("copy_file", json.RawMessage(`{"srcPath":"deep.txt","dstPath":"a/b/c/deep.txt"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]string)
	if m["status"] != "copied" {
		t.Errorf("expected status copied, got %s", m["status"])
	}
	data, _ := os.ReadFile(filepath.Join(dir, "a", "b", "c", "deep.txt"))
	if string(data) != "deep content" {
		t.Errorf("expected content, got '%s'", data)
	}
}

func TestHandleMkdir_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("mkdir", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleMkdir_EmptyPath(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("mkdir", json.RawMessage(`{"path":""}`), "test")
	if err == nil {
		t.Error("expected error for empty path")
	}
}

func TestHandleMkdir_Valid(t *testing.T) {
	dir := t.TempDir()
	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("mkdir", json.RawMessage(`{"path":"newdir"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]string)
	if m["status"] != "created" {
		t.Errorf("expected status created, got %s", m["status"])
	}
	info, err := os.Stat(filepath.Join(dir, "newdir"))
	if err != nil {
		t.Fatalf("expected directory to exist: %v", err)
	}
	if !info.IsDir() {
		t.Error("expected directory")
	}
}

func TestHandleMkdir_NestedPath(t *testing.T) {
	dir := t.TempDir()
	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("mkdir", json.RawMessage(`{"path":"a/b/c"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]string)
	if m["status"] != "created" {
		t.Errorf("expected status created, got %s", m["status"])
	}
	if _, err := os.Stat(filepath.Join(dir, "a", "b", "c")); err != nil {
		t.Fatalf("expected nested directory to exist: %v", err)
	}
}

func TestHandleMkdir_AlreadyExists(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "exists"), 0755)

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("mkdir", json.RawMessage(`{"path":"exists"}`), "test")
	if err == nil {
		t.Error("expected error when directory already exists")
	}
}

func TestHandleMkdir_FileConflict(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "conflict"), []byte("data"), 0644)

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("mkdir", json.RawMessage(`{"path":"conflict"}`), "test")
	if err == nil {
		t.Error("expected error when file exists with same name")
	}
}

func TestHandleCreateFile_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("create_file", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleCreateFile_EmptyPath(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("create_file", json.RawMessage(`{"path":""}`), "test")
	if err == nil {
		t.Error("expected error for empty path")
	}
}

func TestHandleCreateFile_Valid(t *testing.T) {
	dir := t.TempDir()
	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("create_file", json.RawMessage(`{"path":"new.txt"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]string)
	if m["status"] != "created" {
		t.Errorf("expected status created, got %s", m["status"])
	}
	data, _ := os.ReadFile(filepath.Join(dir, "new.txt"))
	if string(data) != "" {
		t.Errorf("expected empty file, got '%s'", data)
	}
}

func TestHandleCreateFile_NestedPath(t *testing.T) {
	dir := t.TempDir()
	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("create_file", json.RawMessage(`{"path":"sub/dir/new.txt"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]string)
	if m["status"] != "created" {
		t.Errorf("expected status created, got %s", m["status"])
	}
	if _, err := os.Stat(filepath.Join(dir, "sub", "dir", "new.txt")); err != nil {
		t.Fatalf("expected file to exist: %v", err)
	}
}

func TestHandleCreateFile_AlreadyExists(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "exists.txt"), []byte("data"), 0644)

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("create_file", json.RawMessage(`{"path":"exists.txt"}`), "test")
	if err == nil {
		t.Error("expected error when file already exists")
	}
}

func TestHandleWriteFile_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("write_file", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleWriteFile_EmptyPath(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("write_file", json.RawMessage(`{"path":"","content":"data"}`), "test")
	if err == nil {
		t.Error("expected error for empty path")
	}
}

func TestHandleWriteFile_NewFile(t *testing.T) {
	dir := t.TempDir()
	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("write_file", json.RawMessage(`{"path":"out.txt","content":"hello"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]string)
	if m["status"] != "written" {
		t.Errorf("expected status written, got %s", m["status"])
	}
	data, _ := os.ReadFile(filepath.Join(dir, "out.txt"))
	if string(data) != "hello" {
		t.Errorf("expected 'hello', got '%s'", data)
	}
}

func TestHandleWriteFile_Overwrite(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "over.txt"), []byte("old"), 0644)

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("write_file", json.RawMessage(`{"path":"over.txt","content":"new"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]string)
	if m["status"] != "written" {
		t.Errorf("expected status written, got %s", m["status"])
	}
	data, _ := os.ReadFile(filepath.Join(dir, "over.txt"))
	if string(data) != "new" {
		t.Errorf("expected 'new', got '%s'", data)
	}
}

func TestHandleRevealFile_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("reveal_file", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleRevealFile_NonexistentPath(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("reveal_file", json.RawMessage(`{"path":"noexist.txt"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent path")
	}
}

func TestHandleRevealFile_ValidPath(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "reveal.txt"), []byte("data"), 0644)

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("reveal_file", json.RawMessage(`{"path":"reveal.txt"}`), "test")
	// xdg-open may not be available in test env, so both success and error are acceptable
	if err != nil {
		t.Logf("reveal_file error (expected in test env): %v", err)
	}
}

// copyFileContents coverage
func TestHandleCopyFile_SourceNotFound(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("copy_file", json.RawMessage(`{"srcPath":"missing.txt","dstPath":"dst.txt"}`), "test")
	if err == nil {
		t.Error("expected error for missing source file")
	}
}

// ClientIDFromContext coverage
func TestClientIDFromContext(t *testing.T) {
	ctx := context.Background()
	id := ClientIDFromContext(ctx)
	if id != "" {
		t.Errorf("expected empty client ID from background context, got %s", id)
	}
}

func TestHandleWriteFile_NestedPath(t *testing.T) {
	dir := t.TempDir()
	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("write_file", json.RawMessage(`{"path":"sub/dir/file.txt","content":"nested"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]string)
	if m["status"] != "written" {
		t.Errorf("expected status written, got %s", m["status"])
	}
	data, _ := os.ReadFile(filepath.Join(dir, "sub", "dir", "file.txt"))
	if string(data) != "nested" {
		t.Errorf("expected 'nested', got '%s'", data)
	}
}
