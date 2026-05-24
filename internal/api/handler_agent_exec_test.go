package api

import (
	"encoding/json"
	"testing"
)

func TestExecuteCode_SpecifiedAgentNotConnected(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("execute_code", json.RawMessage(`{"content":"fmt.Println('hi')","language":"go","agentId":"nonexistent-agent"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["success"] == true {
		t.Error("expected success=false for nonexistent agent")
	}
	errMsg, _ := m["error"].(string)
	if errMsg == "" {
		t.Error("expected error message")
	}
	// Without ConnManager, returns "Agent connection manager not available"
	t.Logf("error message: %s", errMsg)
}

func TestExecuteCode_NilConnManager(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	// No ConnManager, no agentId → should return no agent available
	result, err := handler.HandleCommand("execute_code", json.RawMessage(`{"content":"print('hello')","language":"python"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]any)
	if m["success"] == true {
		t.Error("expected success=false")
	}
}

func TestExecuteCode_WithFilePath(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	// Test that filePath is accepted without error (agent lookup still fails)
	result, err := handler.HandleCommand("execute_code", json.RawMessage(`{"content":"console.log('hi')","language":"javascript","filePath":"/path/to/test.js","agentId":"missing-agent"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]any)
	if m["success"] == true {
		t.Error("expected success=false for missing agent")
	}
	errMsg := m["error"].(string)
	if errMsg == "" {
		t.Error("expected error message")
	}
}

func TestExecuteCode_InvalidJSON(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("execute_code", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}
