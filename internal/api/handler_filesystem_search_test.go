package api

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/swarm-editor/swarm-editor/internal/agent"
)

func TestHandleSearchContent_EmptyQuery(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("search_content", json.RawMessage(`{"query":""}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string][]ContentSearchResult)
	if !ok {
		t.Fatalf("expected map[string][]ContentSearchResult, got %T", result)
	}
	if len(m["results"]) != 0 {
		t.Errorf("expected 0 results, got %d", len(m["results"]))
	}
}

func TestHandleSearchContent_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("search_content", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleSearchContent_NoWorkspace(t *testing.T) {
	s := &WebSocketServer{workspacePath: ""}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("search_content", json.RawMessage(`{"query":"test"}`), "test")
	if err == nil {
		t.Error("expected error with no workspace")
	}
}

func TestHandleSearchContent_BasicSearch(t *testing.T) {
	dir := t.TempDir()
	// Create test files
	if err := os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("Hello World\nHello Go\nGoodbye"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "other.txt"), []byte("Nothing here"), 0644); err != nil {
		t.Fatal(err)
	}

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("search_content", json.RawMessage(`{"query":"Hello","limit":10}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string][]ContentSearchResult)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	results := m["results"]
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}
}

func TestHandleSearchContent_CaseSensitive(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "test.txt"), []byte("Hello hello HELLO"), 0644); err != nil {
		t.Fatal(err)
	}

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("search_content", json.RawMessage(`{"query":"Hello","caseSensitive":true,"limit":10}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string][]ContentSearchResult)
	// Should only match "Hello" (not "hello" or "HELLO")
	if len(m["results"]) != 1 {
		t.Errorf("expected 1 case-sensitive result, got %d", len(m["results"]))
	}
}

func TestHandleSearchContent_Regex(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "code.go"), []byte("func main() {\n\tfmt.Println(\"hi\")\n}"), 0644); err != nil {
		t.Fatal(err)
	}

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("search_content", json.RawMessage(`{"query":"func\\s+\\w+","regex":true,"limit":10}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string][]ContentSearchResult)
	if len(m["results"]) != 1 {
		t.Errorf("expected 1 regex result, got %d", len(m["results"]))
	}
}

func TestHandleSearchContent_InvalidRegex(t *testing.T) {
	dir := t.TempDir()
	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("search_content", json.RawMessage(`{"query":"[invalid","regex":true}`), "test")
	if err == nil {
		t.Error("expected error for invalid regex")
	}
}

func TestHandleSearchContent_WholeWord(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "test.txt"), []byte("testing test attest"), 0644); err != nil {
		t.Fatal(err)
	}

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("search_content", json.RawMessage(`{"query":"test","wholeWord":true,"limit":10}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string][]ContentSearchResult)
	// Should only match "test" as a whole word, not "testing" or "attest"
	if len(m["results"]) != 1 {
		t.Errorf("expected 1 whole-word result, got %d", len(m["results"]))
	}
}

func TestHandleSearchContent_FolderRestriction(t *testing.T) {
	dir := t.TempDir()
	sub := filepath.Join(dir, "src")
	if err := os.MkdirAll(sub, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sub, "main.go"), []byte("package main"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "root.go"), []byte("package root"), 0644); err != nil {
		t.Fatal(err)
	}

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("search_content", json.RawMessage(`{"query":"package","folder":"src","limit":10}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string][]ContentSearchResult)
	// Should only find results in src/
	if len(m["results"]) != 1 {
		t.Errorf("expected 1 result in src/, got %d", len(m["results"]))
	}
}

func TestHandleCopyFile(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "original.txt")
	dst := filepath.Join(dir, "copy.txt")
	if err := os.WriteFile(src, []byte("copy me"), 0644); err != nil {
		t.Fatal(err)
	}

	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("copy_file", json.RawMessage(`{"srcPath":"original.txt","dstPath":"copy.txt"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["status"] != "copied" {
		t.Errorf("expected status copied, got %s", m["status"])
	}

	// Verify file was copied
	data, err := os.ReadFile(dst)
	if err != nil {
		t.Fatalf("failed to read copied file: %v", err)
	}
	if string(data) != "copy me" {
		t.Errorf("expected 'copy me', got '%s'", data)
	}
}

func TestHandleCopyFile_MissingSource(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("copy_file", json.RawMessage(`{"dstPath":"copy.txt"}`), "test")
	if err == nil {
		t.Error("expected error for missing source")
	}
}

func TestHandleCopyFile_MissingDestination(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("copy_file", json.RawMessage(`{"srcPath":"original.txt"}`), "test")
	if err == nil {
		t.Error("expected error for missing destination")
	}
}

func TestHandleCopyFile_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("copy_file", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleCopyFile_NonexistentSource(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("copy_file", json.RawMessage(`{"source":"noexist.txt","dstPath":"copy.txt"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent source")
	}
}

func TestHandleRefreshAgents_WithScanner(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping scanner test in short mode")
	}
	t.Skip("skipping: requires real CLI agents which may hang in CI")

	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		scanner:      agent.NewScanner(),
	}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("refresh_agents", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	agents, ok := result.([]AgentInfo)
	if !ok {
		t.Fatalf("expected []AgentInfo, got %T", result)
	}
	t.Logf("found %d agents after refresh", len(agents))
}

func TestHandleTestAgent_WithScanner(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping scanner test in short mode")
	}
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		scanner:      agent.NewScanner(),
	}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("test_agent", json.RawMessage(`{"id":"nonexistent-agent"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["id"] != "nonexistent-agent" {
		t.Errorf("expected id nonexistent-agent, got %v", m["id"])
	}
	t.Logf("status: %v", m["status"])
}
