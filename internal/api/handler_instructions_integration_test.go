package api

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestCustomInstructions_GetWithFile(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	// Create an AGENTS.md file
	content := "Always use Go best practices\nWrite tests for all new code"
	if err := os.WriteFile(filepath.Join(dir, "AGENTS.md"), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	result, err := handler.HandleCommand("get_custom_instructions", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["content"] == "" {
		t.Error("expected non-empty content")
	}
	files, ok := m["files"].([]string)
	if !ok {
		t.Fatalf("expected []string for files, got %T", m["files"])
	}
	if len(files) != 1 || files[0] != "AGENTS.md" {
		t.Errorf("expected [AGENTS.md], got %v", files)
	}
	t.Logf("content: %v", m["content"])
}

func TestCustomInstructions_GetEmpty(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("get_custom_instructions", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["content"] != "" {
		t.Error("expected empty content with no instruction files")
	}
}

func TestCustomInstructions_GetNoWorkspace(t *testing.T) {
	server := &WebSocketServer{workspacePath: ""}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("get_custom_instructions", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["content"] != "" {
		t.Error("expected empty content with no workspace")
	}
}

func TestCustomInstructions_SaveAndLoad(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	// Save
	result, err := handler.HandleCommand("save_custom_instructions", json.RawMessage(`{"content":"Be helpful and concise"}`), "test")
	if err != nil {
		t.Fatalf("save error: %v", err)
	}
	t.Logf("save result: %v", result)

	// Verify file was created
	data, err := os.ReadFile(filepath.Join(dir, ".swarm-instructions.md"))
	if err != nil {
		t.Fatalf("file not created: %v", err)
	}
	if string(data) != "Be helpful and concise" {
		t.Errorf("expected 'Be helpful and concise', got '%s'", data)
	}

	// Load and verify
	result, err = handler.HandleCommand("get_custom_instructions", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("load error: %v", err)
	}
	m := result.(map[string]any)
	if m["content"] == "" {
		t.Error("expected non-empty content after save")
	}
	t.Logf("loaded content: %v", m["content"])
}

func TestCustomInstructions_SaveNoWorkspace(t *testing.T) {
	server := &WebSocketServer{workspacePath: ""}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("save_custom_instructions", json.RawMessage(`{"content":"test"}`), "test")
	if err == nil {
		t.Error("expected error when no workspace configured")
	}
}

func TestCustomInstructions_MultipleFiles(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	// Create multiple instruction files
	if err := os.WriteFile(filepath.Join(dir, "AGENTS.md"), []byte("Agents instructions"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, ".cursorrules"), []byte("Cursor rules"), 0644); err != nil {
		t.Fatal(err)
	}

	result, err := handler.HandleCommand("get_custom_instructions", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]any)
	files := m["files"].([]string)
	if len(files) != 2 {
		t.Errorf("expected 2 files, got %d: %v", len(files), files)
	}
}

func TestCustomInstructions_SaveTooLarge(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	// Create content over 100KB
	largeContent := make([]byte, 101*1024)
	for i := range largeContent {
		largeContent[i] = 'a'
	}
	_, err := handler.HandleCommand("save_custom_instructions", json.RawMessage(`{"content":"`+string(largeContent)+`"}`), "test")
	if err == nil {
		t.Error("expected error for oversized instructions")
	}
}
