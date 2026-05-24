package api

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// --- Workspace handlers ---

func TestHandleGetWorkspace_DefaultPath(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("get_workspace", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map[string]string, got %T", result)
	}
	if _, exists := m["path"]; !exists {
		t.Error("expected 'path' key in result")
	}
}

func TestHandleGetWorkspace_AfterSetWorkspace(t *testing.T) {
	handler, server := newTestHandler()

	_, err := handler.HandleCommand("set_workspace", json.RawMessage(`{"path":"/tmp/test-ws"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if server.workspacePath != "/tmp/test-ws" {
		t.Errorf("expected /tmp/test-ws, got %s", server.workspacePath)
	}

	result, err := handler.HandleCommand("get_workspace", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]string)
	if m["path"] != "/tmp/test-ws" {
		t.Errorf("expected /tmp/test-ws, got %s", m["path"])
	}
}

func TestHandleSetWorkspace_InvalidJSON(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("set_workspace", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleSetWorkspace_EmptyPath(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("set_workspace", json.RawMessage(`{"path":""}`), "test")
	if err == nil {
		t.Error("expected error for empty path")
	}
}

func TestHandleSetWorkspace_WhitespacePath(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("set_workspace", json.RawMessage(`{"path":"   "}`), "test")
	if err == nil {
		t.Error("expected error for whitespace-only path")
	}
}

func TestHandleSetWorkspace_TrimsPath(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("set_workspace", json.RawMessage(`{"path":"  /tmp/trimmed  "}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]string)
	if m["path"] != "/tmp/trimmed" {
		t.Errorf("expected trimmed path, got %q", m["path"])
	}
}

// --- Monitoring handlers ---

func TestHandleGetSupervisorStats_Empty(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("get_supervisor_stats", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	stats, ok := result.(SupervisorStats)
	if !ok {
		t.Fatalf("expected SupervisorStats, got %T", result)
	}
	if stats.TotalAgents != 0 {
		t.Errorf("expected 0 total agents, got %d", stats.TotalAgents)
	}
}

func TestHandleGetEmergenceData_Empty(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("get_emergence_data", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	data, ok := result.(EmergenceData)
	if !ok {
		t.Fatalf("expected EmergenceData, got %T", result)
	}
	if len(data.Agents) != 0 {
		t.Errorf("expected 0 agents, got %d", len(data.Agents))
	}
	if len(data.Flows) != 0 {
		t.Errorf("expected 0 flows, got %d", len(data.Flows))
	}
	if len(data.Signals) != 0 {
		t.Errorf("expected 0 signals, got %d", len(data.Signals))
	}
}

// --- Custom instructions handlers ---

func TestHandleGetCustomInstructions_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("get_custom_instructions", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["content"] != "" {
		t.Errorf("expected empty content, got %v", m["content"])
	}
}

func TestHandleGetCustomInstructions_WithFile(t *testing.T) {
	tmpDir := t.TempDir()
	err := os.WriteFile(filepath.Join(tmpDir, ".swarm-instructions.md"), []byte("test instructions"), 0644)
	if err != nil {
		t.Fatal(err)
	}

	handler, server := newTestHandler()
	server.workspacePath = tmpDir

	result, err := handler.HandleCommand("get_custom_instructions", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]any)
	content, _ := m["content"].(string)
	if content == "" {
		t.Error("expected non-empty content")
	}
	files, _ := m["files"].([]string)
	if len(files) == 0 {
		t.Error("expected at least one file")
	}
}

func TestHandleSaveCustomInstructions_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("save_custom_instructions", json.RawMessage(`{"content":"test"}`), "test")
	if err == nil {
		t.Error("expected error when workspace not configured")
	}
}

func TestHandleSaveCustomInstructions_InvalidJSON(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("save_custom_instructions", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleSaveCustomInstructions_Success(t *testing.T) {
	tmpDir := t.TempDir()

	handler, server := newTestHandler()
	server.workspacePath = tmpDir

	result, err := handler.HandleCommand("save_custom_instructions", json.RawMessage(`{"content":"hello world"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["status"] != "saved" {
		t.Errorf("expected 'saved', got %s", m["status"])
	}

	data, err := os.ReadFile(filepath.Join(tmpDir, ".swarm-instructions.md"))
	if err != nil {
		t.Fatalf("file not created: %v", err)
	}
	if string(data) != "hello world" {
		t.Errorf("expected 'hello world', got %q", string(data))
	}
}

func TestHandleSaveCustomInstructions_TooLarge(t *testing.T) {
	tmpDir := t.TempDir()

	handler, server := newTestHandler()
	server.workspacePath = tmpDir

	largeContent := make([]byte, 101*1024) // 101KB > 100KB limit
	for i := range largeContent {
		largeContent[i] = 'a'
	}

	_, err := handler.HandleCommand("save_custom_instructions", json.RawMessage(`{"content":"`+string(largeContent)+`"}`), "test")
	if err == nil {
		t.Error("expected error for oversized instructions")
	}
}

// --- GetSessions with data ---

func TestHandleGetSessions_WithSessionData(t *testing.T) {
	handler, server := newTestHandler()

	server.mu.Lock()
	server.sessionToAgent = map[string]string{"s1": "agent-1"}
	server.sessionToMode = map[string]string{"s1": "editing"}
	server.mu.Unlock()

	result, err := handler.HandleCommand("get_sessions", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	arr, ok := result.([]SessionInfo)
	if !ok {
		t.Fatalf("expected []SessionInfo, got %T", result)
	}
	if len(arr) != 1 {
		t.Fatalf("expected 1 session, got %d", len(arr))
	}
	if arr[0].ID != "s1" || arr[0].AgentID != "agent-1" || arr[0].Mode != "editing" {
		t.Errorf("unexpected session data: %+v", arr[0])
	}
}

// --- SendMessage validation ---

func TestHandleSendMessage_MissingSessionID(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("send_message", json.RawMessage(`{"message":"test"}`), "test")
	if err == nil {
		t.Error("expected error for missing sessionId")
	}
}

func TestHandleSendMessage_MessageTooLarge(t *testing.T) {
	handler, server := newTestHandler()

	server.mu.Lock()
	server.sessionToAgent = map[string]string{"s1": "agent-1"}
	server.mu.Unlock()

	largeMsg := make([]byte, 101*1024)
	for i := range largeMsg {
		largeMsg[i] = 'x'
	}

	_, err := handler.HandleCommand("send_message", json.RawMessage(`{"sessionId":"s1","message":"`+string(largeMsg)+`"}`), "test")
	if err == nil {
		t.Error("expected error for oversized message")
	}
}
