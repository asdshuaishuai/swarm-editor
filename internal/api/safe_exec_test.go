package api

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestSafeExec_EmptyName(t *testing.T) {
	_, err := safeExec(context.Background(), "")
	if err == nil {
		t.Error("expected error for empty command name")
	}
}

func TestSafeExec_PathSeparator(t *testing.T) {
	_, err := safeExec(context.Background(), "/usr/bin/ls")
	if err == nil {
		t.Error("expected error for path separator in name")
	}
}

func TestSafeExec_Backslash(t *testing.T) {
	_, err := safeExec(context.Background(), `cmd\sub`)
	if err == nil {
		t.Error("expected error for backslash in name")
	}
}

func TestSafeExec_EmptyArg(t *testing.T) {
	_, err := safeExec(context.Background(), "echo", "hello", "")
	if err == nil {
		t.Error("expected error for empty argument")
	}
}

func TestSafeExec_Valid(t *testing.T) {
	cmd, err := safeExec(context.Background(), "echo", "hello")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cmd == nil {
		t.Fatal("expected non-nil cmd")
	}
}

func TestSafeExec_NoArgs(t *testing.T) {
	cmd, err := safeExec(context.Background(), "ls")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cmd == nil {
		t.Fatal("expected non-nil cmd")
	}
}

func TestHandleA2AStatus_NilRouter(t *testing.T) {
	s := &WebSocketServer{}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("a2a_status", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["routerAvailable"] != false {
		t.Error("expected routerAvailable=false")
	}
	if m["coordAvailable"] != false {
		t.Error("expected coordAvailable=false")
	}
	if m["cardRegistrySize"] != 0 {
		t.Errorf("expected cardRegistrySize=0, got %v", m["cardRegistrySize"])
	}
}

func TestHandleA2AMessageLog_NilRouter(t *testing.T) {
	s := &WebSocketServer{}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("a2a_message_log", json.RawMessage(`{"limit":10}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("message log result: %T", result)
}

func TestHandleA2AMessageLog_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("a2a_message_log", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleReplaceContent_EmptyQuery(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("replace_content", json.RawMessage(`{"query":"","replacement":"x"}`), "test")
	if err == nil {
		t.Error("expected error for empty query")
	}
}

func TestHandleReplaceContent_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("replace_content", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleReplaceContent_NoWorkspace(t *testing.T) {
	s := &WebSocketServer{workspacePath: ""}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("replace_content", json.RawMessage(`{"query":"foo","replacement":"bar"}`), "test")
	if err == nil {
		t.Error("expected error with no workspace")
	}
}

func TestHandleReplaceContent_BasicReplace(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "test.txt"), []byte("Hello World\nHello Go"), 0644); err != nil {
		t.Fatal(err)
	}

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("replace_content", json.RawMessage(`{"query":"Hello","replacement":"Hi"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}

	// Verify file was modified
	data, _ := os.ReadFile(filepath.Join(dir, "test.txt"))
	content := string(data)
	if content != "Hi World\nHi Go" {
		t.Errorf("expected 'Hi World\\nHi Go', got '%s'", content)
	}
	if m["changedFiles"].(int) != 1 {
		t.Errorf("expected 1 changed file, got %v", m["changedFiles"])
	}
}

func TestHandleReplaceContent_DryRun(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "test.txt"), []byte("Hello World"), 0644); err != nil {
		t.Fatal(err)
	}

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("replace_content", json.RawMessage(`{"query":"Hello","replacement":"Hi","dryRun":true}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]any)
	if m["dryRun"] != true {
		t.Error("expected dryRun=true")
	}

	// File should NOT be modified
	data, _ := os.ReadFile(filepath.Join(dir, "test.txt"))
	if string(data) != "Hello World" {
		t.Error("expected file to be unchanged in dryRun mode")
	}
}

func TestHandleReplaceContent_SpecificFiles(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "a.txt"), []byte("Hello A"), 0644)
	os.WriteFile(filepath.Join(dir, "b.txt"), []byte("Hello B"), 0644)

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("replace_content", json.RawMessage(`{"query":"Hello","replacement":"Hi","files":["a.txt"]}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]any)

	// Only a.txt should be changed
	dataA, _ := os.ReadFile(filepath.Join(dir, "a.txt"))
	dataB, _ := os.ReadFile(filepath.Join(dir, "b.txt"))
	if string(dataA) != "Hi A" {
		t.Errorf("expected a.txt to be changed, got '%s'", dataA)
	}
	if string(dataB) != "Hello B" {
		t.Errorf("expected b.txt to be unchanged, got '%s'", dataB)
	}
	results := m["results"].([]ReplaceResult)
	if len(results) != 1 {
		t.Errorf("expected 1 result, got %d", len(results))
	}
}

func TestHandleReplaceContent_Regex(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "code.go"), []byte("foo123 bar456"), 0644)

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("replace_content", json.RawMessage(`{"query":"\\d+","replacement":"NUM","regex":true}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	data, _ := os.ReadFile(filepath.Join(dir, "code.go"))
	if string(data) != "fooNUM barNUM" {
		t.Errorf("expected 'fooNUM barNUM', got '%s'", data)
	}
}

func TestHandleReplaceContent_InvalidRegex(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("replace_content", json.RawMessage(`{"query":"[invalid","replacement":"x","regex":true}`), "test")
	if err == nil {
		t.Error("expected error for invalid regex")
	}
}

func TestHandleReplaceContent_CaseSensitive(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "test.txt"), []byte("Hello hello HELLO"), 0644)

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("replace_content", json.RawMessage(`{"query":"Hello","replacement":"Hi","caseSensitive":true}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	data, _ := os.ReadFile(filepath.Join(dir, "test.txt"))
	// Only "Hello" should be replaced, not "hello" or "HELLO"
	if string(data) != "Hi hello HELLO" {
		t.Errorf("expected case-sensitive replacement, got '%s'", data)
	}
}

func TestHandleReplaceContent_WholeWord(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "test.txt"), []byte("testing test attest"), 0644)

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("replace_content", json.RawMessage(`{"query":"test","replacement":"X","wholeWord":true}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	data, _ := os.ReadFile(filepath.Join(dir, "test.txt"))
	if string(data) != "testing X attest" {
		t.Errorf("expected whole-word replacement, got '%s'", data)
	}
}

func TestHandleReplaceContent_NoMatch(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "test.txt"), []byte("Hello World"), 0644)

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("replace_content", json.RawMessage(`{"query":"xyz","replacement":"abc"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]any)
	results := m["results"].([]ReplaceResult)
	if len(results) != 0 {
		t.Errorf("expected 0 results for no match, got %d", len(results))
	}
	if m["changedFiles"].(int) != 0 {
		t.Errorf("expected 0 changed files, got %v", m["changedFiles"])
	}
}

func TestHandleRenameFile(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "old.txt"), []byte("content"), 0644)

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("rename_file", json.RawMessage(`{"oldPath":"old.txt","newPath":"new.txt"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]string)
	if m["status"] != "renamed" {
		t.Errorf("expected status renamed, got %s", m["status"])
	}

	// Verify
	if _, err := os.Stat(filepath.Join(dir, "old.txt")); !os.IsNotExist(err) {
		t.Error("expected old file to be gone")
	}
	data, _ := os.ReadFile(filepath.Join(dir, "new.txt"))
	if string(data) != "content" {
		t.Errorf("expected content, got '%s'", data)
	}
}

func TestHandleRenameFile_MissingOldPath(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("rename_file", json.RawMessage(`{"newPath":"new.txt"}`), "test")
	if err == nil {
		t.Error("expected error for missing oldPath")
	}
}

func TestHandleRenameFile_MissingNewPath(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("rename_file", json.RawMessage(`{"oldPath":"old.txt"}`), "test")
	if err == nil {
		t.Error("expected error for missing newPath")
	}
}

func TestHandleRenameFile_NonexistentSource(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("rename_file", json.RawMessage(`{"oldPath":"noexist.txt","newPath":"new.txt"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent source")
	}
}

func TestHandleRenameFile_DestinationExists(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "old.txt"), []byte("a"), 0644)
	os.WriteFile(filepath.Join(dir, "new.txt"), []byte("b"), 0644)

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("rename_file", json.RawMessage(`{"oldPath":"old.txt","newPath":"new.txt"}`), "test")
	if err == nil {
		t.Error("expected error when destination exists")
	}
}

func TestHandleRenameFile_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("rename_file", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleRenameFile_ToSubdirectory(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "file.txt"), []byte("data"), 0644)

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("rename_file", json.RawMessage(`{"oldPath":"file.txt","newPath":"sub/file.txt"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]string)
	if m["status"] != "renamed" {
		t.Errorf("expected status renamed, got %s", m["status"])
	}

	data, _ := os.ReadFile(filepath.Join(dir, "sub", "file.txt"))
	if string(data) != "data" {
		t.Errorf("expected data, got '%s'", data)
	}
}
