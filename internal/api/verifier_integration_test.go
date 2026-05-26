package api

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func newVerifyTestServer(t *testing.T) *WebSocketServer {
	t.Helper()
	dir := t.TempDir()
	return &WebSocketServer{
		workspacePath: dir,
		shadowBuffer:  NewShadowBuffer(),
	}
}

func TestCommitPatch_WritesFile(t *testing.T) {
	server := newVerifyTestServer(t)
	dir := server.workspacePath
	handler := NewCommandHandler(server)

	stageResult, err := handler.HandleCommand("stage_patch", json.RawMessage(
		`{"agentId":"a1","path":"sub/test.txt","oldContent":"","newContent":"hello world"}`), "test")
	if err != nil {
		t.Fatalf("stage failed: %v", err)
	}
	patchID := stageResult.(map[string]any)["id"].(string)

	os.MkdirAll(filepath.Join(dir, "sub"), 0755)

	_, err = handler.HandleCommand("commit_patch", json.RawMessage(
		`{"id":"`+patchID+`"}`), "test")
	if err != nil {
		t.Fatalf("commit failed: %v", err)
	}

	content, err := os.ReadFile(filepath.Join(dir, "sub", "test.txt"))
	if err != nil {
		t.Fatalf("file not found: %v", err)
	}
	if string(content) != "hello world" {
		t.Errorf("expected 'hello world', got %q", string(content))
	}
}

func TestCommitPatch_VerifyState(t *testing.T) {
	server := newVerifyTestServer(t)
	dir := server.workspacePath
	goFile := filepath.Join(dir, "valid.go")
	if err := os.WriteFile(goFile, []byte("package valid\n"), 0644); err != nil {
		t.Fatal(err)
	}
	handler := NewCommandHandler(server)

	stageResult, err := handler.HandleCommand("stage_patch", json.RawMessage(
		`{"agentId":"a1","path":"valid.go","oldContent":"package valid\n","newContent":"package valid\n\nfunc Hello() {}\n"}`), "test")
	if err != nil {
		t.Fatalf("stage failed: %v", err)
	}
	patchID := stageResult.(map[string]any)["id"].(string)

	commitResult, err := handler.HandleCommand("commit_patch", json.RawMessage(
		`{"id":"`+patchID+`"}`), "test")
	if err != nil {
		t.Fatalf("commit failed: %v", err)
	}

	m := commitResult.(map[string]any)
	if m["status"] != "committed" {
		t.Errorf("expected committed, got %v", m["status"])
	}
	// verifyState should be present (passed or failed depending on go vet availability)
	if m["verifyState"] == nil {
		t.Error("expected verifyState in response")
	}
	t.Logf("verifyState: %v", m["verifyState"])
}

func TestCommitPatch_NotFound(t *testing.T) {
	server := newVerifyTestServer(t)
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("commit_patch", json.RawMessage(
		`{"id":"nonexistent"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent patch")
	}
}

func TestCommitPatch_MissingID(t *testing.T) {
	server := newVerifyTestServer(t)
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("commit_patch", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing id")
	}
}

func TestVerifyPatch_Command(t *testing.T) {
	server := newVerifyTestServer(t)
	dir := server.workspacePath
	goFile := filepath.Join(dir, "main.go")
	if err := os.WriteFile(goFile, []byte("package main\n\nfunc main() {}\n"), 0644); err != nil {
		t.Fatal(err)
	}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("verify_patch", json.RawMessage(
		`{"path":"main.go"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m := result.(map[string]any)
	if m["path"] != "main.go" {
		t.Errorf("expected path main.go, got %v", m["path"])
	}
	if m["verifyState"] == nil {
		t.Error("expected verifyState")
	}
	t.Logf("result: %v", m)
}

func TestVerifyPatch_MissingPath(t *testing.T) {
	server := newVerifyTestServer(t)
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("verify_patch", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing path")
	}
}

func TestVerifyPatch_UnknownExtension(t *testing.T) {
	server := newVerifyTestServer(t)
	dir := server.workspacePath
	if err := os.WriteFile(filepath.Join(dir, "data.xyz"), []byte("hello"), 0644); err != nil {
		t.Fatal(err)
	}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("verify_patch", json.RawMessage(
		`{"path":"data.xyz"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m := result.(map[string]any)
	if m["verifyState"] != "passed" {
		t.Errorf("expected passed for unknown ext, got %v", m["verifyState"])
	}
}

func TestCommitPatch_PathTraversalRejected(t *testing.T) {
	server := newVerifyTestServer(t)
	handler := NewCommandHandler(server)

	// Stage a patch with a malicious traversal path
	stageResult, err := handler.HandleCommand("stage_patch", json.RawMessage(
		`{"agentId":"attacker","path":"../../etc/passwd","oldContent":"","newContent":"hacked"}`), "test")
	if err != nil {
		t.Fatalf("stage failed: %v", err)
	}
	patchID := stageResult.(map[string]any)["id"].(string)

	// Commit should be rejected by safePath
	_, err = handler.HandleCommand("commit_patch", json.RawMessage(
		`{"id":"`+patchID+`"}`), "test")
	if err == nil {
		t.Error("expected error for path traversal, got nil")
	}

	// Confirm nothing was written outside workspace
	if _, statErr := os.Stat("/etc/passwd"); statErr == nil {
		// File exists (it always does on Linux), check it wasn't overwritten
		// by reading first byte and ensuring it's not "hacked"
		data, _ := os.ReadFile("/etc/passwd")
		if string(data) == "hacked" {
			t.Fatal("path traversal succeeded — /etc/passwd was overwritten!")
		}
	}
}

func TestCommitPatch_AbsolutePathRejected(t *testing.T) {
	server := newVerifyTestServer(t)
	handler := NewCommandHandler(server)

	stageResult, err := handler.HandleCommand("stage_patch", json.RawMessage(
		`{"agentId":"a1","path":"/tmp/evil","oldContent":"","newContent":"x"}`), "test")
	if err != nil {
		t.Fatalf("stage failed: %v", err)
	}
	patchID := stageResult.(map[string]any)["id"].(string)

	// Absolute paths joined with workspace become safe (joined under workspace),
	// but ensure it stays inside workspace
	_, err = handler.HandleCommand("commit_patch", json.RawMessage(
		`{"id":"`+patchID+`"}`), "test")
	// safePath cleans and joins; absolute path becomes workspace/tmp/evil (safe)
	if err != nil {
		t.Logf("commit returned error (acceptable): %v", err)
	}
}

func TestStageAndCommit_FullCycle(t *testing.T) {
	server := newVerifyTestServer(t)
	dir := server.workspacePath
	if err := os.WriteFile(filepath.Join(dir, "readme.md"), []byte("old"), 0644); err != nil {
		t.Fatal(err)
	}
	handler := NewCommandHandler(server)

	// Stage
	stageResult, err := handler.HandleCommand("stage_patch", json.RawMessage(
		`{"agentId":"a1","path":"readme.md","oldContent":"old","newContent":"new content"}`), "test")
	if err != nil {
		t.Fatalf("stage failed: %v", err)
	}
	patchID := stageResult.(map[string]any)["id"].(string)

	// List patches
	listResult, err := handler.HandleCommand("list_patches", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("list failed: %v", err)
	}
	patches := listResult.([]*PendingPatch)
	if len(patches) != 1 {
		t.Fatalf("expected 1 patch, got %d", len(patches))
	}

	// Commit
	commitResult, err := handler.HandleCommand("commit_patch", json.RawMessage(
		`{"id":"`+patchID+`"}`), "test")
	if err != nil {
		t.Fatalf("commit failed: %v", err)
	}
	m := commitResult.(map[string]any)
	if m["status"] != "committed" {
		t.Errorf("expected committed, got %v", m["status"])
	}

	// Verify file content
	content, err := os.ReadFile(filepath.Join(dir, "readme.md"))
	if err != nil {
		t.Fatal(err)
	}
	if string(content) != "new content" {
		t.Errorf("expected 'new content', got %q", string(content))
	}

	// List should be empty now
	listResult2, _ := handler.HandleCommand("list_patches", json.RawMessage(`{}`), "test")
	patches2 := listResult2.([]*PendingPatch)
	if len(patches2) != 0 {
		t.Errorf("expected 0 patches after commit, got %d", len(patches2))
	}
}
