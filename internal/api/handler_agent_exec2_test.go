package api

import (
	"encoding/json"
	"testing"

	"github.com/swarm-editor/swarm-editor/internal/agent"
)

func TestHandleExecuteCode_EmptyContent(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("execute_code", json.RawMessage(`{"content":""}`), "test")
	if err == nil {
		t.Error("expected error for empty content")
	}
}

func TestHandleExecuteCode_NoAgent(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("execute_code", json.RawMessage(`{"content":"print('hello')","language":"python"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["success"] != false {
		t.Error("expected success=false")
	}
	if m["error"] == "" {
		t.Error("expected error message about no agent")
	}
}

func TestHandleExecuteCode_WithAgentID_NoConnMgr(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("execute_code", json.RawMessage(`{"content":"x=1","language":"python","agentId":"agent-1"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]any)
	if m["success"] != false {
		t.Error("expected success=false without conn manager")
	}
}

func TestHandleScanSkills_NoScanner(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("scan_skills", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	skills, ok := result.([]map[string]any)
	if !ok {
		t.Fatalf("expected []map[string]any, got %T", result)
	}
	// Without scanner, should do basic scan (may return empty)
	t.Logf("got %d skills", len(skills))
}

func TestHandleScanSkills_WithWorkspace(t *testing.T) {
	dir := t.TempDir()
	s := &WebSocketServer{workspacePath: dir}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("scan_skills", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	skills := result.([]map[string]any)
	t.Logf("got %d skills with workspace", len(skills))
}

func TestHandleTestAgent_NoScanner(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("test_agent", json.RawMessage(`{"id":"some-agent"}`), "test")
	if err == nil {
		t.Error("expected error without scanner")
	}
}

func TestHandleAddAgent_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("add_agent", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleAddAgent_MissingID(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("add_agent", json.RawMessage(`{"config":{"name":"Test","command":"test"}}`), "test")
	if err == nil {
		t.Error("expected error for missing agent id")
	}
}

func TestHandleAddAgent_MissingName(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("add_agent", json.RawMessage(`{"config":{"id":"test-id","command":"test"}}`), "test")
	if err == nil {
		t.Error("expected error for missing agent name")
	}
}

func TestHandleAddAgent_MissingCommand(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("add_agent", json.RawMessage(`{"config":{"id":"test-id","name":"Test"}}`), "test")
	if err == nil {
		t.Error("expected error for missing agent command")
	}
}

func TestHandleAddAgent_IDTooLong(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	longID := string(make([]byte, 300))
	for i := range longID {
		longID = longID[:i] + "x" + longID[i+1:]
	}

	_, err := h.HandleCommand("add_agent", json.RawMessage(`{"config":{"id":"`+longID+`","name":"T","command":"t"}}`), "test")
	if err == nil {
		t.Error("expected error for id too long")
	}
}

func TestHandleAddAgent_NameTooLong(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	longName := string(make([]byte, 300))
	for i := range longName {
		longName = longName[:i] + "x" + longName[i+1:]
	}

	_, err := h.HandleCommand("add_agent", json.RawMessage(`{"config":{"id":"t","name":"`+longName+`","command":"t"}}`), "test")
	if err == nil {
		t.Error("expected error for name too long")
	}
}

func TestHandleRemoveAgent_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("remove_agent", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleRemoveAgent_MissingID(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("remove_agent", json.RawMessage(`{"id":""}`), "test")
	if err == nil {
		t.Error("expected error for empty id")
	}
}

func TestHandleStartAgent_RegistryAgent(t *testing.T) {
	registry := agent.NewRegistry()
	a := agent.NewAgent("StartTest", agent.AgentTypeCoder)
	registry.Register(a)

	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		registry:      registry,
	}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("start_agent", json.RawMessage(`{"id":"`+string(a.ID)+`"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]string)
	if m["status"] != "started" {
		t.Errorf("expected status started, got %s", m["status"])
	}
}

func TestHandleStopAgent_RegistryAgent(t *testing.T) {
	registry := agent.NewRegistry()
	a := agent.NewAgent("StopTest", agent.AgentTypeCoder)
	registry.Register(a)

	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		registry:      registry,
	}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("stop_agent", json.RawMessage(`{"id":"`+string(a.ID)+`"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]string)
	if m["status"] != "stopped" {
		t.Errorf("expected status stopped, got %s", m["status"])
	}
}

func TestHandleStopAgent_NoRegistry(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("stop_agent", json.RawMessage(`{"id":"any-id"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]string)
	if m["status"] != "stopped" {
		t.Errorf("expected status stopped, got %s", m["status"])
	}
}

func TestHandleGetAgents_MultipleSources(t *testing.T) {
	registry := agent.NewRegistry()
	a1 := agent.NewAgent("Internal1", agent.AgentTypeCoder)
	registry.Register(a1)

	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		registry:      registry,
	}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("get_agents", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	agents := result.([]AgentInfo)
	found := false
	for _, a := range agents {
		if a.Name == "Internal1" {
			found = true
		}
	}
	if !found {
		t.Error("expected to find Internal1 in agent list")
	}
}

func TestHandleGetAgent_EmptyID(t *testing.T) {
	registry := agent.NewRegistry()
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		registry:      registry,
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("get_agent", json.RawMessage(`{"id":""}`), "test")
	if err == nil {
		t.Error("expected error for empty id")
	}
}

func TestHandleGetAgent_NotFound(t *testing.T) {
	registry := agent.NewRegistry()
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		registry:      registry,
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("get_agent", json.RawMessage(`{"id":"nonexistent"}`), "test")
	if err == nil {
		t.Error("expected error for agent not found")
	}
}
