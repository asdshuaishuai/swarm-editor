package api

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/swarm-editor/swarm-editor/internal/a2a"
	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
)

func TestBuildAgentCard(t *testing.T) {
	card := buildAgentCard("agent-1", "TestAgent", "coding", nil)
	if card.Name != "TestAgent" {
		t.Errorf("expected name TestAgent, got %s", card.Name)
	}
	if card.Version != "1.0.0" {
		t.Errorf("expected version 1.0.0, got %s", card.Version)
	}
	if card.Provider == nil || card.Provider.Name != "swarm-editor" {
		t.Error("expected provider name swarm-editor")
	}
	if !card.Capabilities.Streaming {
		t.Error("expected streaming=true")
	}
	if len(card.DefaultInputModes) == 0 || card.DefaultInputModes[0] != "text/plain" {
		t.Error("expected text/plain input mode")
	}
	hasTypeTag := false
	for _, tag := range card.Tags {
		if tag == "coding" {
			hasTypeTag = true
		}
	}
	if !hasTypeTag {
		t.Error("expected 'coding' tag")
	}
}

func TestBuildAgentCard_WithConfig(t *testing.T) {
	cfg := &acp.AgentConfig{
		ID:          "agent-1",
		Description: "A test agent",
		Tags:        []string{"test", "demo"},
		ExpectedCapabilities: acp.AgentCapabilities{
			MCP: acp.MCPCapabilities{HTTP: true},
		},
	}
	card := buildAgentCard("agent-1", "TestAgent", "coding", cfg)
	if card.Description != "A test agent" {
		t.Errorf("expected description 'A test agent', got %s", card.Description)
	}
	if !card.Capabilities.MCP {
		t.Error("expected MCP capability from config")
	}
	tagSet := make(map[string]bool)
	for _, tag := range card.Tags {
		tagSet[tag] = true
	}
	if !tagSet["test"] || !tagSet["demo"] {
		t.Errorf("expected test/demo tags, got %v", card.Tags)
	}
}

func TestBuildAgentCard_WithPairProgramming(t *testing.T) {
	cfg := &acp.AgentConfig{
		ExpectedCapabilities: acp.AgentCapabilities{
			PairProgramming: true,
			LoadSession:     true,
		},
	}
	card := buildAgentCard("a", "PP", "coding", cfg)
	tagSet := make(map[string]bool)
	for _, tag := range card.Tags {
		tagSet[tag] = true
	}
	if !tagSet["pair_programming"] {
		t.Error("expected pair_programming tag")
	}
	if !tagSet["session_management"] {
		t.Error("expected session_management tag")
	}
}

func TestBuildAgentCardFromCLI(t *testing.T) {
	cli := &agent.AgentCLI{
		ID:   "cli-1",
		Name: "MyCLI",
		Path: "/usr/bin/mycli",
	}
	card := buildAgentCardFromCLI(cli, nil)
	if card.Name != "MyCLI" {
		t.Errorf("expected name MyCLI, got %s", card.Name)
	}
	if card.Metadata["path"] != "/usr/bin/mycli" {
		t.Errorf("expected path metadata, got %v", card.Metadata["path"])
	}
	if card.Metadata["agentType"] != "cli" {
		t.Error("expected agentType=cli")
	}
}

func TestBuildAgentCardFromCLI_WithConfig(t *testing.T) {
	cli := &agent.AgentCLI{
		ID:   "cli-2",
		Name: "ConfiguredCLI",
		Path: "/usr/bin/cli2",
	}
	cfg := &acp.AgentConfig{
		Description: "Configured CLI agent",
		Tags:        []string{"custom"},
	}
	card := buildAgentCardFromCLI(cli, cfg)
	if card.Description != "Configured CLI agent" {
		t.Errorf("expected description, got %s", card.Description)
	}
	tagSet := make(map[string]bool)
	for _, tag := range card.Tags {
		tagSet[tag] = true
	}
	if !tagSet["custom"] {
		t.Error("expected custom tag")
	}
}

func TestHandleGetAgentCards_NilRegistry(t *testing.T) {
	h := &CommandHandler{server: &WebSocketServer{}}
	result, err := h.handleGetAgentCards(context.Background(), json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	cards, ok := result.([]*a2a.AgentCard)
	if !ok {
		t.Fatalf("expected []*a2a.AgentCard, got %T", result)
	}
	if len(cards) != 0 {
		t.Errorf("expected 0 cards, got %d", len(cards))
	}
}

func TestHandleGetAgentCards_WithRegistry(t *testing.T) {
	registry := a2a.NewAgentCardRegistry()
	registry.Register("test-id", &a2a.AgentCard{Name: "Test"})
	s := &WebSocketServer{a2aCardRegistry: registry}
	h := &CommandHandler{server: s}

	result, err := h.handleGetAgentCards(context.Background(), json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	cards := result.([]*a2a.AgentCard)
	if len(cards) != 1 {
		t.Errorf("expected 1 card, got %d", len(cards))
	}
	if cards[0].Name != "Test" {
		t.Errorf("expected Test, got %s", cards[0].Name)
	}
}

func TestHandleFindAgentsByCapability_Validation(t *testing.T) {
	registry := a2a.NewAgentCardRegistry()
	s := &WebSocketServer{a2aCardRegistry: registry}
	h := &CommandHandler{server: s}
	_, err := h.handleFindAgentsByCapability(context.Background(), json.RawMessage(`{}`))
	if err == nil {
		t.Fatal("expected validation error")
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected APIError, got %T", err)
	}
	if apiErr.Code != CodeValidation {
		t.Errorf("expected CodeValidation (%d), got %d", CodeValidation, apiErr.Code)
	}
}

func TestHandleFindAgentsByCapability_ByCapability(t *testing.T) {
	registry := a2a.NewAgentCardRegistry()
	registry.Register("a1", &a2a.AgentCard{Name: "Agent1", Capabilities: a2a.AgentCapabilities{Streaming: true}})
	s := &WebSocketServer{a2aCardRegistry: registry}
	h := &CommandHandler{server: s}

	result, err := h.handleFindAgentsByCapability(context.Background(), json.RawMessage(`{"capability":"streaming"}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	cards := result.([]*a2a.AgentCard)
	_ = cards
}

func TestHandleFindAgentsByCapability_ByTag(t *testing.T) {
	registry := a2a.NewAgentCardRegistry()
	registry.Register("a1", &a2a.AgentCard{Name: "Agent1", Tags: []string{"coding"}})
	s := &WebSocketServer{a2aCardRegistry: registry}
	h := &CommandHandler{server: s}

	result, err := h.handleFindAgentsByCapability(context.Background(), json.RawMessage(`{"tag":"coding"}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	cards := result.([]*a2a.AgentCard)
	_ = cards
}

func TestHandleFindAgentsByCapability_NilRegistry(t *testing.T) {
	h := &CommandHandler{server: &WebSocketServer{}}
	result, err := h.handleFindAgentsByCapability(context.Background(), json.RawMessage(`{"capability":"test"}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	cards := result.([]*a2a.AgentCard)
	if len(cards) != 0 {
		t.Errorf("expected 0 cards, got %d", len(cards))
	}
}

func TestHandleFindAgentsByCapability_InvalidJSON(t *testing.T) {
	h := &CommandHandler{server: &WebSocketServer{}}
	_, err := h.handleFindAgentsByCapability(context.Background(), json.RawMessage(`invalid`))
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}
