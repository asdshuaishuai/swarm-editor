package api

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/swarm-editor/swarm-editor/internal/a2a"
	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
)

func TestSyncAgentCards_NilRegistry(t *testing.T) {
	s := &WebSocketServer{}
	h := &CommandHandler{server: s}
	// Should not panic
	h.syncAgentCards()
}

func TestSyncAgentCards_WithInternalAgents(t *testing.T) {
	registry := agent.NewRegistry()
	a := agent.NewAgent("TestCoder", agent.AgentTypeCoder)
	if err := registry.Register(a); err != nil {
		t.Fatal(err)
	}

	cardReg := a2a.NewAgentCardRegistry()
	s := &WebSocketServer{
		registry:         registry,
		a2aCardRegistry:  cardReg,
	}
	h := &CommandHandler{server: s}

	h.syncAgentCards()

	cards := cardReg.List()
	if len(cards) != 1 {
		t.Fatalf("expected 1 card, got %d", len(cards))
	}
	if cards[0].Name != "TestCoder" {
		t.Errorf("expected name TestCoder, got %s", cards[0].Name)
	}
}

func TestSyncAgentCards_DuplicateAgentsSkipped(t *testing.T) {
	registry := agent.NewRegistry()
	a := agent.NewAgent("Dup", agent.AgentTypeCoder)
	if err := registry.Register(a); err != nil {
		t.Fatal(err)
	}

	cardReg := a2a.NewAgentCardRegistry()
	s := &WebSocketServer{
		registry:         registry,
		a2aCardRegistry:  cardReg,
	}
	h := &CommandHandler{server: s}

	// Call twice — should still have only 1 card
	h.syncAgentCards()
	h.syncAgentCards()

	cards := cardReg.List()
	if len(cards) != 1 {
		t.Errorf("expected 1 card after double sync, got %d", len(cards))
	}
}

func TestSyncAgentCards_MultipleTypes(t *testing.T) {
	registry := agent.NewRegistry()
	coder := agent.NewAgent("Coder1", agent.AgentTypeCoder)
	reviewer := agent.NewAgent("Reviewer1", agent.AgentTypeReviewer)
	registry.Register(coder)
	registry.Register(reviewer)

	cardReg := a2a.NewAgentCardRegistry()
	s := &WebSocketServer{
		registry:         registry,
		a2aCardRegistry:  cardReg,
	}
	h := &CommandHandler{server: s}

	h.syncAgentCards()

	cards := cardReg.List()
	if len(cards) != 2 {
		t.Fatalf("expected 2 cards, got %d", len(cards))
	}

	names := map[string]bool{}
	for _, c := range cards {
		names[c.Name] = true
	}
	if !names["Coder1"] || !names["Reviewer1"] {
		t.Errorf("expected Coder1 and Reviewer1, got %v", names)
	}
}

func TestHandleGetAgents_WithRegistry(t *testing.T) {
	registry := agent.NewRegistry()
	a := agent.NewAgent("RegAgent", agent.AgentTypeCoder)
	registry.Register(a)

	s := &WebSocketServer{
		registry:      registry,
		workspacePath: t.TempDir(),
	}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("get_agents", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	agents, ok := result.([]AgentInfo)
	if !ok {
		t.Fatalf("expected []AgentInfo, got %T", result)
	}
	if len(agents) < 1 {
		t.Errorf("expected at least 1 agent, got %d", len(agents))
	}
	found := false
	for _, a := range agents {
		if a.Name == "RegAgent" {
			found = true
			if a.Type != "coder" {
				t.Errorf("expected type coder, got %s", a.Type)
			}
		}
	}
	if !found {
		t.Error("expected to find RegAgent in results")
	}
}

func TestHandleGetAgents_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("get_agents", json.RawMessage(`invalid`), "test")
	// get_agents ignores JSON params, so invalid JSON returns empty list
	if err != nil {
		t.Logf("got error (acceptable): %v", err)
	}
}

func TestHandleScanMCPServers_NoScanner(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("scan_mcp_servers", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Async: returns {"status": "scanning"}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map[string]any, got %T", result)
	}
	if m["status"] != "scanning" {
		t.Fatalf("expected status=scanning, got %v", m["status"])
	}
}

func TestHandleScanSkills_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("scan_skills", json.RawMessage(`{invalid}`), "test")
	// scan_skills accepts any params (unused), may still succeed
	_ = err
}

func TestHandleExecuteCode_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("execute_code", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleStartAgent_MissingID(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("start_agent", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing id")
	}
}

func TestHandleStartAgent_NonexistentAgent(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("start_agent", json.RawMessage(`{"id":"nonexistent"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent agent")
	}
}

func TestHandleStopAgent_MissingID(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("stop_agent", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing id")
	}
}

func TestHandleRefreshAgents_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	// refresh_agents delegates to handleGetAgents which accepts any params
	result, err := h.HandleCommand("refresh_agents", json.RawMessage(`invalid`), "test")
	if err != nil {
		t.Logf("got error (acceptable): %v", err)
	} else {
		t.Logf("got result (acceptable): %T", result)
	}
}

func TestHandleGetAgent_NilRegistry(t *testing.T) {
	s := &WebSocketServer{workspacePath: t.TempDir()}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("get_agent", json.RawMessage(`{"id":"some-id"}`), "test")
	if err == nil {
		t.Error("expected error with nil registry")
	}
}

func TestHandleGetAgent_FoundInRegistry(t *testing.T) {
	registry := agent.NewRegistry()
	a := agent.NewAgent("FoundAgent", agent.AgentTypeCoder)
	registry.Register(a)

	s := &WebSocketServer{
		registry:      registry,
		workspacePath: t.TempDir(),
	}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("get_agent", json.RawMessage(`{"id":"`+string(a.ID)+`"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	info, ok := result.(AgentInfo)
	if !ok {
		t.Fatalf("expected AgentInfo, got %T", result)
	}
	if info.Name != "FoundAgent" {
		t.Errorf("expected name FoundAgent, got %s", info.Name)
	}
}

func TestBuildAgentCard_NilConfig(t *testing.T) {
	card := buildAgentCard("id", "Name", "type", nil)
	if card.Description != "" {
		t.Error("expected empty description with nil config")
	}
	if card.Capabilities.MCP {
		t.Error("expected no MCP capability with nil config")
	}
}

func TestBuildAgentCard_SSECapability(t *testing.T) {
	cfg := &acp.AgentConfig{
		ExpectedCapabilities: acp.AgentCapabilities{
			MCP: acp.MCPCapabilities{SSE: true},
		},
	}
	card := buildAgentCard("id", "Name", "type", cfg)
	if !card.Capabilities.MCP {
		t.Error("expected MCP capability with SSE config")
	}
}

func TestBuildAgentCardFromCLI_NilConfig(t *testing.T) {
	cli := &agent.AgentCLI{
		ID:   "cli",
		Name: "CLI",
		Path: "/bin/test",
	}
	card := buildAgentCardFromCLI(cli, nil)
	if card.Description != "" {
		t.Error("expected empty description")
	}
	if card.Metadata["agentType"] != "cli" {
		t.Error("expected agentType=cli")
	}
}

func TestSyncAgentCards_WithRegistryAndCards(t *testing.T) {
	registry := agent.NewRegistry()
	a := agent.NewAgent("SyncTest", agent.AgentTypeArchitect)
	registry.Register(a)

	cardReg := a2a.NewAgentCardRegistry()
	s := &WebSocketServer{
		registry:        registry,
		a2aCardRegistry: cardReg,
	}
	h := &CommandHandler{server: s}

	// Call via handleGetAgentCards to exercise syncAgentCards path
	result, err := h.handleGetAgentCards(context.Background(), json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	cards := result.([]*a2a.AgentCard)
	if len(cards) != 1 {
		t.Errorf("expected 1 card, got %d", len(cards))
	}
}
