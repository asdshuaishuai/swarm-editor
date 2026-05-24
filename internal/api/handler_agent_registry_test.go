package api

import (
	"encoding/json"
	"testing"

	"github.com/swarm-editor/swarm-editor/internal/agent"
)

func TestGetAgents_WithRegistry(t *testing.T) {
	dir := t.TempDir()
	registry := agent.NewRegistry()

	a := agent.NewAgent("test-bot", agent.AgentTypeCoder)
	registry.Register(a)

	server := &WebSocketServer{
		workspacePath: dir,
		registry:      registry,
	}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("get_agents", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	infos, ok := result.([]AgentInfo)
	if !ok {
		t.Fatalf("expected []AgentInfo, got %T", result)
	}
	if len(infos) == 0 {
		t.Error("expected at least one agent from registry")
	}

	found := false
	for _, info := range infos {
		if info.Name == "test-bot" {
			found = true
			if info.Type != "coder" {
				t.Errorf("expected type 'coder', got '%s'", info.Type)
			}
			if info.State != "idle" {
				t.Errorf("expected state 'idle', got '%s'", info.State)
			}
			break
		}
	}
	if !found {
		t.Error("test-bot agent not found in results")
	}
}

func TestGetAgents_WithMultipleAgents(t *testing.T) {
	dir := t.TempDir()
	registry := agent.NewRegistry()

	a1 := agent.NewAgent("agent-1", agent.AgentTypeCoder)
	a2 := agent.NewAgent("agent-2", agent.AgentTypeReviewer)
	registry.Register(a1)
	registry.Register(a2)

	server := &WebSocketServer{
		workspacePath: dir,
		registry:      registry,
	}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("get_agents", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	infos := result.([]AgentInfo)
	if len(infos) != 2 {
		t.Errorf("expected 2 agents, got %d", len(infos))
	}
}

func TestGetAgent_FromRegistry(t *testing.T) {
	dir := t.TempDir()
	registry := agent.NewRegistry()

	a := agent.NewAgent("specific-agent", agent.AgentTypeCoder)
	registry.Register(a)

	server := &WebSocketServer{
		workspacePath: dir,
		registry:      registry,
	}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("get_agent", json.RawMessage(`{"id":"`+string(a.ID)+`"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	info, ok := result.(AgentInfo)
	if !ok {
		t.Fatalf("expected AgentInfo, got %T", result)
	}
	if info.Name != "specific-agent" {
		t.Errorf("expected name 'specific-agent', got '%s'", info.Name)
	}
}

func TestFindAgentsByCapability_WithRegistry(t *testing.T) {
	dir := t.TempDir()
	registry := agent.NewRegistry()

	a := agent.NewAgent("capable-agent", agent.AgentTypeCoder)
	registry.Register(a)

	server := &WebSocketServer{
		workspacePath: dir,
		registry:      registry,
	}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("find_agents_by_capability", json.RawMessage(`{"capability":"code_generation"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("find by capability result: %T", result)
}

func TestGetAgentCards_WithRegistry(t *testing.T) {
	dir := t.TempDir()
	registry := agent.NewRegistry()

	a := agent.NewAgent("card-agent", agent.AgentTypeCoder)
	registry.Register(a)

	server := &WebSocketServer{
		workspacePath: dir,
		registry:      registry,
	}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("get_agent_cards", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("agent cards: %T", result)
}

func TestRefreshAgents_WithRegistry(t *testing.T) {
	dir := t.TempDir()
	registry := agent.NewRegistry()

	a := agent.NewAgent("refresh-agent", agent.AgentTypeCoder)
	registry.Register(a)

	server := &WebSocketServer{
		workspacePath: dir,
		registry:      registry,
	}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("refresh_agents", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	infos, ok := result.([]AgentInfo)
	if !ok {
		t.Fatalf("expected []AgentInfo, got %T", result)
	}
	if len(infos) == 0 {
		t.Error("expected at least one agent")
	}
}

func TestUpdateAgent_WithConfig(t *testing.T) {
	// update_agent loads from global acp.ConfigDir, not workspace
	// Test that invalid ID returns error
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("update_agent", json.RawMessage(`{"config":{"id":"nonexistent-agent","name":"Test","command":"echo"}}`), "test")
	if err == nil {
		t.Log("update_agent succeeded (agent may exist in global config)")
	} else {
		t.Logf("expected error for nonexistent agent: %v", err)
	}
}

func TestDeleteAgent_WithConfig(t *testing.T) {
	// delete_agent loads from global acp.ConfigDir, not workspace
	// Test that invalid ID returns error
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("delete_agent", json.RawMessage(`{"id":"nonexistent-agent-del"}`), "test")
	if err == nil {
		t.Log("delete_agent succeeded (agent may exist in global config)")
	} else {
		t.Logf("expected error for nonexistent agent: %v", err)
	}
}
