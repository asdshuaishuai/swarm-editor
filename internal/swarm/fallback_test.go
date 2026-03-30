package swarm

import (
	"context"
	"testing"

	"github.com/swarm-editor/swarm-editor/internal/acp"
)

// mockAgentListProvider implements AgentListProvider for testing
type mockAgentListProvider struct {
	agents []*acp.AgentConnection
}

func (m *mockAgentListProvider) GetAgents() []*acp.AgentConnection {
	return m.agents
}

// mockHealthProvider implements AgentHealthProvider for testing
type mockHealthProvider struct {
	health map[string]*AgentHealth
}

func (m *mockHealthProvider) GetHealth(agentID string) *AgentHealth {
	if m.health == nil {
		return nil
	}
	return m.health[agentID]
}

func TestFallbackChain_Exhaustion(t *testing.T) {
	agents := &mockAgentListProvider{
		agents: []*acp.AgentConnection{
			{ID: "agent_1"},
			{ID: "agent_2"},
		},
	}
	health := &mockHealthProvider{
		health: map[string]*AgentHealth{
			"agent_1": {Score: 0.9},
			"agent_2": {Score: 0.8},
		},
	}

	config := DefaultFallbackConfig()
	config.MaxAttempts = 2

	chain := NewFallbackChain("task_1", config, agents, health)

	// First attempt
	conn, err := chain.NextAgent(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if conn.ID != "agent_1" {
		t.Fatalf("expected agent_1 (highest health), got %s", conn.ID)
	}
	chain.MarkAttempted(conn.ID)

	if chain.RemainingAttempts() != 1 {
		t.Fatalf("expected 1 remaining, got %d", chain.RemainingAttempts())
	}

	// Second attempt
	conn, err = chain.NextAgent(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if conn.ID != "agent_2" {
		t.Fatalf("expected agent_2, got %s", conn.ID)
	}
	chain.MarkAttempted(conn.ID)

	// Third attempt should fail
	_, err = chain.NextAgent(context.Background())
	if err == nil {
		t.Fatal("expected error when chain exhausted")
	}
}

func TestFallbackChain_HealthThreshold(t *testing.T) {
	agents := &mockAgentListProvider{
		agents: []*acp.AgentConnection{
			{ID: "healthy"},
			{ID: "degraded"},
		},
	}
	health := &mockHealthProvider{
		health: map[string]*AgentHealth{
			"healthy":  {Score: 0.9},
			"degraded": {Score: 0.2},
		},
	}

	config := DefaultFallbackConfig()
	config.RequiredMinHealth = 0.5

	chain := NewFallbackChain("task_1", config, agents, health)

	// Should skip degraded agent
	conn, err := chain.NextAgent(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if conn.ID != "healthy" {
		t.Fatalf("expected healthy agent, got %s", conn.ID)
	}
	chain.MarkAttempted(conn.ID)

	// Should fail because only degraded remains
	_, err = chain.NextAgent(context.Background())
	if err == nil {
		t.Fatal("expected error when all remaining agents below health threshold")
	}
}

func TestFallbackChain_NoHealthProvider(t *testing.T) {
	agents := &mockAgentListProvider{
		agents: []*acp.AgentConnection{
			{ID: "agent_1"},
			{ID: "agent_2"},
		},
	}

	config := DefaultFallbackConfig()
	chain := NewFallbackChain("task_1", config, agents, nil)

	// Without health provider, should return agents in order
	conn, err := chain.NextAgent(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if conn == nil {
		t.Fatal("expected agent")
	}
}

func TestFallbackChain_ByRole(t *testing.T) {
	agents := &mockAgentListProvider{
		agents: []*acp.AgentConnection{
			{ID: "agent_C"},
			{ID: "agent_A"},
			{ID: "agent_B"},
		},
	}

	config := DefaultFallbackConfig()
	config.Strategy = FallbackByRole
	config.AgentPreference = []string{"agent_B", "agent_A"}

	chain := NewFallbackChain("task_1", config, agents, nil)

	conn, err := chain.NextAgent(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if conn.ID != "agent_B" {
		t.Fatalf("expected agent_B (first preference), got %s", conn.ID)
	}
	chain.MarkAttempted(conn.ID)

	conn, err = chain.NextAgent(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if conn.ID != "agent_A" {
		t.Fatalf("expected agent_A (second preference), got %s", conn.ID)
	}
}

func TestFallbackChain_AttemptedAgents(t *testing.T) {
	agents := &mockAgentListProvider{
		agents: []*acp.AgentConnection{
			{ID: "agent_1"},
		},
	}

	config := DefaultFallbackConfig()
	chain := NewFallbackChain("task_1", config, agents, nil)
	chain.MarkAttempted("agent_1")
	chain.MarkAttempted("agent_2")

	attempted := chain.AttemptedAgents()
	if len(attempted) != 2 {
		t.Fatalf("expected 2 attempted agents, got %d", len(attempted))
	}
}

func TestDefaultFallbackConfig(t *testing.T) {
	config := DefaultFallbackConfig()
	if config.MaxAttempts != 3 {
		t.Fatalf("expected 3 max attempts, got %d", config.MaxAttempts)
	}
	if config.RequiredMinHealth != 0.5 {
		t.Fatalf("expected 0.5 min health, got %f", config.RequiredMinHealth)
	}
	if config.Strategy != FallbackByHealthScore {
		t.Fatalf("expected by_health strategy, got %s", config.Strategy)
	}
}
