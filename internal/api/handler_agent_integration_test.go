package api

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestAgentHandler_GetAgents(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("get_agents", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("agents: %T", result)
}

func TestAgentHandler_RefreshAgents(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("refresh_agents", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("refresh result: %T", result)
}

func TestAgentHandler_ExecuteCode_EmptyContent(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("execute_code", json.RawMessage(`{"content":"","language":"go"}`), "test")
	if err == nil {
		t.Error("expected error for empty content")
	}
}

func TestAgentHandler_ExecuteCode_NoAgent(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("execute_code", json.RawMessage(`{"content":"fmt.Println(\"hello\")","language":"go"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["success"] == true {
		t.Error("expected success=false when no agent available")
	}
	if m["error"] == nil || m["error"] == "" {
		t.Error("expected error message when no agent available")
	}
	t.Logf("no-agent result: %v", m)
}

func TestAgentHandler_ScanSkills(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("scan_skills", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("skills: %T", result)
}

func TestAgentHandler_AddAgent(t *testing.T) {
	restore := setupConfigDir(t)
	defer restore()

	dir := t.TempDir()
	// Create agents.json so config can be saved
	configDir := filepath.Join(dir, ".swarm-editor")
	if err := os.MkdirAll(configDir, 0755); err != nil {
		t.Fatal(err)
	}
	// Write empty initial config
	initialConfig := `{"agents":[]}`
	if err := os.WriteFile(filepath.Join(configDir, "agents.json"), []byte(initialConfig), 0644); err != nil {
		t.Fatal(err)
	}

	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	// Use unique ID to avoid collisions across test runs
	uid := fmt.Sprintf("test-agent-%d", time.Now().UnixNano())
	result, err := handler.HandleCommand("add_agent", json.RawMessage(`{"config":{"id":"`+uid+`","name":"Test Agent","command":"echo","args":[],"type":"custom"}}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("add agent result: %T %v", result, result)
}

func TestAgentHandler_UpdateAgent_MissingID(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("update_agent", json.RawMessage(`{"name":"Test"}`), "test")
	if err == nil {
		t.Error("expected error for missing id")
	}
}

func TestAgentHandler_GetAgent_MissingID(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("get_agent", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing id")
	}
}

func TestAgentHandler_TestAgent_MissingID(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("test_agent", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing id")
	}
}

func TestAgentHandler_FindAgentsByCapability(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("find_agents_by_capability", json.RawMessage(`{"capability":"code_generation"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("find by capability: %T", result)
}

func TestAgentHandler_GetAgentCards(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("get_agent_cards", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("agent cards: %T", result)
}

func TestAgentHandler_GetConfigPath(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("get_config_path", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	path, ok := result.(string)
	if !ok {
		t.Fatalf("expected string, got %T", result)
	}
	if path == "" {
		t.Error("expected non-empty config path")
	}
	t.Logf("config path: %s", path)
}
