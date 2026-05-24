package api

import (
	"encoding/json"
	"testing"

	"github.com/swarm-editor/swarm-editor/internal/agent"
	"github.com/swarm-editor/swarm-editor/internal/swarm"
)

func TestHandleGetSupervisorStats_NilRegistry(t *testing.T) {
	// Server with nil registry should return empty stats
	server := &WebSocketServer{}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("get_supervisor_stats", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	stats, ok := result.(SupervisorStats)
	if !ok {
		t.Fatalf("expected SupervisorStats, got %T", result)
	}

	if stats.TotalAgents != 0 {
		t.Errorf("expected TotalAgents=0, got %d", stats.TotalAgents)
	}
	if stats.HealthyAgents != 0 {
		t.Errorf("expected HealthyAgents=0, got %d", stats.HealthyAgents)
	}
	if stats.BusyAgents != 0 {
		t.Errorf("expected BusyAgents=0, got %d", stats.BusyAgents)
	}
	if stats.UnhealthyAgents != 0 {
		t.Errorf("expected UnhealthyAgents=0, got %d", stats.UnhealthyAgents)
	}
}

func TestHandleGetSupervisorStats_EmptyRegistry(t *testing.T) {
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
		t.Errorf("expected TotalAgents=0, got %d", stats.TotalAgents)
	}
	if stats.HealthyAgents != 0 {
		t.Errorf("expected HealthyAgents=0, got %d", stats.HealthyAgents)
	}
	if stats.Throughput != 0 {
		t.Errorf("expected Throughput=0, got %f", stats.Throughput)
	}
}

func TestHandleGetSupervisorStats_WithIdleAgents(t *testing.T) {
	handler, server := newTestHandler()

	// Register idle agents
	for i := 0; i < 3; i++ {
		a := agent.NewAgent("idle-agent", agent.AgentTypeCoder)
		if err := server.Registry().Register(a); err != nil {
			t.Fatalf("failed to register agent: %v", err)
		}
	}

	result, err := handler.HandleCommand("get_supervisor_stats", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	stats, ok := result.(SupervisorStats)
	if !ok {
		t.Fatalf("expected SupervisorStats, got %T", result)
	}

	if stats.TotalAgents != 3 {
		t.Errorf("expected TotalAgents=3, got %d", stats.TotalAgents)
	}
	if stats.HealthyAgents != 3 {
		t.Errorf("expected HealthyAgents=3 (idle agents are healthy), got %d", stats.HealthyAgents)
	}
	if stats.BusyAgents != 0 {
		t.Errorf("expected BusyAgents=0 (idle agents are not busy), got %d", stats.BusyAgents)
	}
	if stats.UnhealthyAgents != 0 {
		t.Errorf("expected UnhealthyAgents=0, got %d", stats.UnhealthyAgents)
	}
	if stats.Throughput != 0 {
		t.Errorf("expected Throughput=0 (no busy agents), got %f", stats.Throughput)
	}
}

func TestHandleGetSupervisorStats_WithBusyAgents(t *testing.T) {
	handler, server := newTestHandler()

	// Register thinking agent
	a1 := agent.NewAgent("thinking-agent", agent.AgentTypeCoder)
	a1.SetState(agent.StateThinking)
	if err := server.Registry().Register(a1); err != nil {
		t.Fatalf("failed to register agent: %v", err)
	}

	// Register executing agent
	a2 := agent.NewAgent("executing-agent", agent.AgentTypeWorker)
	a2.SetState(agent.StateExecuting)
	if err := server.Registry().Register(a2); err != nil {
		t.Fatalf("failed to register agent: %v", err)
	}

	result, err := handler.HandleCommand("get_supervisor_stats", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	stats, ok := result.(SupervisorStats)
	if !ok {
		t.Fatalf("expected SupervisorStats, got %T", result)
	}

	if stats.TotalAgents != 2 {
		t.Errorf("expected TotalAgents=2, got %d", stats.TotalAgents)
	}
	if stats.HealthyAgents != 2 {
		t.Errorf("expected HealthyAgents=2 (busy agents are healthy), got %d", stats.HealthyAgents)
	}
	if stats.BusyAgents != 2 {
		t.Errorf("expected BusyAgents=2, got %d", stats.BusyAgents)
	}
	if stats.Throughput != 10.0 {
		t.Errorf("expected Throughput=10.0 (2/2*10), got %f", stats.Throughput)
	}
}

func TestHandleGetSupervisorStats_WithErroredAgents(t *testing.T) {
	handler, server := newTestHandler()

	// Register error agents
	a1 := agent.NewAgent("error-agent-1", agent.AgentTypeCoder)
	a1.SetState(agent.StateError)
	if err := server.Registry().Register(a1); err != nil {
		t.Fatalf("failed to register agent: %v", err)
	}

	a2 := agent.NewAgent("error-agent-2", agent.AgentTypeReviewer)
	a2.SetState(agent.StateError)
	if err := server.Registry().Register(a2); err != nil {
		t.Fatalf("failed to register agent: %v", err)
	}

	result, err := handler.HandleCommand("get_supervisor_stats", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	stats, ok := result.(SupervisorStats)
	if !ok {
		t.Fatalf("expected SupervisorStats, got %T", result)
	}

	if stats.TotalAgents != 2 {
		t.Errorf("expected TotalAgents=2, got %d", stats.TotalAgents)
	}
	if stats.UnhealthyAgents != 2 {
		t.Errorf("expected UnhealthyAgents=2, got %d", stats.UnhealthyAgents)
	}
	if stats.HealthyAgents != 0 {
		t.Errorf("expected HealthyAgents=0 (error agents are unhealthy), got %d", stats.HealthyAgents)
	}
	// AvgResponseTime should be computed: 2*500/2 = 500
	if stats.AvgResponseTime != 500.0 {
		t.Errorf("expected AvgResponseTime=500.0, got %f", stats.AvgResponseTime)
	}
}

func TestHandleGetSupervisorStats_MixedStates(t *testing.T) {
	handler, server := newTestHandler()

	// Idle agent
	a1 := agent.NewAgent("idle", agent.AgentTypeCoder)
	if err := server.Registry().Register(a1); err != nil {
		t.Fatalf("register idle: %v", err)
	}

	// Thinking agent
	a2 := agent.NewAgent("thinking", agent.AgentTypeCoder)
	a2.SetState(agent.StateThinking)
	if err := server.Registry().Register(a2); err != nil {
		t.Fatalf("register thinking: %v", err)
	}

	// Executing agent
	a3 := agent.NewAgent("executing", agent.AgentTypeWorker)
	a3.SetState(agent.StateExecuting)
	if err := server.Registry().Register(a3); err != nil {
		t.Fatalf("register executing: %v", err)
	}

	// Error agent
	a4 := agent.NewAgent("errored", agent.AgentTypeReviewer)
	a4.SetState(agent.StateError)
	if err := server.Registry().Register(a4); err != nil {
		t.Fatalf("register errored: %v", err)
	}

	result, err := handler.HandleCommand("get_supervisor_stats", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	stats, ok := result.(SupervisorStats)
	if !ok {
		t.Fatalf("expected SupervisorStats, got %T", result)
	}

	if stats.TotalAgents != 4 {
		t.Errorf("expected TotalAgents=4, got %d", stats.TotalAgents)
	}
	// idle(1) + thinking(1) + executing(1) = 3 healthy
	if stats.HealthyAgents != 3 {
		t.Errorf("expected HealthyAgents=3, got %d", stats.HealthyAgents)
	}
	// thinking + executing = 2 busy
	if stats.BusyAgents != 2 {
		t.Errorf("expected BusyAgents=2, got %d", stats.BusyAgents)
	}
	if stats.UnhealthyAgents != 1 {
		t.Errorf("expected UnhealthyAgents=1, got %d", stats.UnhealthyAgents)
	}
	// Throughput = 2/4 * 10 = 5.0
	if stats.Throughput != 5.0 {
		t.Errorf("expected Throughput=5.0, got %f", stats.Throughput)
	}
	// AvgResponseTime = 1*500/4 = 125.0
	if stats.AvgResponseTime != 125.0 {
		t.Errorf("expected AvgResponseTime=125.0, got %f", stats.AvgResponseTime)
	}
}

func TestHandleGetEmergenceData_NoSwarms(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("get_emergence_data", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	data, ok := result.(EmergenceData)
	if !ok {
		t.Fatalf("expected EmergenceData, got %T", result)
	}

	health := data.Health
	if health.OverallScore != 0 {
		t.Errorf("expected OverallScore=0, got %f", health.OverallScore)
	}
	if health.CongestionLevel != 0 {
		t.Errorf("expected CongestionLevel=0, got %f", health.CongestionLevel)
	}
	if health.AgentUtilization != 0 {
		t.Errorf("expected AgentUtilization=0, got %f", health.AgentUtilization)
	}
	if health.CollaborationIdx != 0 {
		t.Errorf("expected CollaborationIdx=0, got %f", health.CollaborationIdx)
	}
	if health.InnovationRate != 0 {
		t.Errorf("expected InnovationRate=0, got %f", health.InnovationRate)
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

func TestHandleGetEmergenceData_WithSwarm(t *testing.T) {
	handler, server := newTestHandler()

	// Create a swarm with agents
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw1",
		Name:     "Test Swarm",
		Topology: swarm.TopologyMesh,
		Strategy: swarm.StrategyParallel,
	})

	a1 := agent.NewAgent("agent-1", agent.AgentTypeCoder)
	a2 := agent.NewAgent("agent-2", agent.AgentTypeWorker)
	sw.AddAgent(a1)
	sw.AddAgent(a2)

	server.AddSwarm("sw1", sw)

	result, err := handler.HandleCommand("get_emergence_data", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	data, ok := result.(EmergenceData)
	if !ok {
		t.Fatalf("expected EmergenceData, got %T", result)
	}

	// Should have coordinator node + 2 agent nodes
	if len(data.Agents) != 3 {
		t.Errorf("expected 3 agent nodes (1 coordinator + 2 agents), got %d", len(data.Agents))
	}

	// First agent should be the coordinator
	if data.Agents[0].ID != "sw1-coordinator" {
		t.Errorf("expected first agent ID 'sw1-coordinator', got %s", data.Agents[0].ID)
	}
	if data.Agents[0].Type != "coordinator" {
		t.Errorf("expected coordinator type, got %s", data.Agents[0].Type)
	}

	// Should have 2 flows (one per agent from coordinator)
	if len(data.Flows) != 2 {
		t.Errorf("expected 2 flows, got %d", len(data.Flows))
	}

	// Agent utilization should be computed from swarm stats
	// 0 busy agents / 2 total = 0
	health := data.Health
	if health.AgentUtilization != 0 {
		t.Errorf("expected AgentUtilization=0 (no busy agents), got %f", health.AgentUtilization)
	}
	// CollaborationIdx: 1 multi-agent swarm / 1 swarm = 1.0
	if health.CollaborationIdx != 1.0 {
		t.Errorf("expected CollaborationIdx=1.0, got %f", health.CollaborationIdx)
	}
}

func TestHandleGetEmergenceData_MultipleSwarms(t *testing.T) {
	handler, server := newTestHandler()

	// Swarm 1: multi-agent
	sw1 := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "multi",
		Name:     "Multi-Agent Swarm",
		Topology: swarm.TopologyMesh,
		Strategy: swarm.StrategyParallel,
	})
	a1 := agent.NewAgent("m1", agent.AgentTypeCoder)
	a2 := agent.NewAgent("m2", agent.AgentTypeWorker)
	sw1.AddAgent(a1)
	sw1.AddAgent(a2)
	server.AddSwarm("multi", sw1)

	// Swarm 2: single agent
	sw2 := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "single",
		Name:     "Single-Agent Swarm",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategySequential,
	})
	a3 := agent.NewAgent("s1", agent.AgentTypeCoder)
	sw2.AddAgent(a3)
	server.AddSwarm("single", sw2)

	result, err := handler.HandleCommand("get_emergence_data", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	data, ok := result.(EmergenceData)
	if !ok {
		t.Fatalf("expected EmergenceData, got %T", result)
	}

	// 2 coordinators + 2 agents from sw1 + 1 agent from sw2 = 5 total
	if len(data.Agents) != 5 {
		t.Errorf("expected 5 agent nodes, got %d", len(data.Agents))
	}

	// 2 flows from sw1 + 1 flow from sw2 = 3 total
	if len(data.Flows) != 3 {
		t.Errorf("expected 3 flows, got %d", len(data.Flows))
	}

	// CollaborationIdx: 1 multi-agent swarm / 2 total swarms = 0.5
	health := data.Health
	if health.CollaborationIdx != 0.5 {
		t.Errorf("expected CollaborationIdx=0.5, got %f", health.CollaborationIdx)
	}
}

func TestHandleGetEmergenceData_WithEmergenceService(t *testing.T) {
	handler, server := newTestHandler()

	// Create a mock EmergenceService and set it on the server
	svc := &EmergenceService{}
	// Manually inject test data via the cache by using the struct directly
	// Since we can't easily construct a real EmergenceService with nil deps,
	// we'll test the handler's code path through HandleCommand which
	// delegates to handleGetEmergenceData.
	//
	// Instead, verify that the handler uses the emergence service path
	// by constructing one via NewEmergenceService with nil deps.
	svc = NewEmergenceService(nil, nil, nil)

	// Set the emergence service on the server
	server.emergenceService = svc

	result, err := handler.HandleCommand("get_emergence_data", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	data, ok := result.(*EmergenceData)
	if !ok {
		t.Fatalf("expected *EmergenceData, got %T", result)
	}

	// With nil deps, the emergence service should still return valid data
	// OverallScore defaults to 0.5 when no deps configured
	if data.Health.OverallScore != 0.5 {
		t.Errorf("expected OverallScore=0.5 (default for nil deps), got %f", data.Health.OverallScore)
	}
}

func TestHandleGetSupervisorStats_DirectCall(t *testing.T) {
	// Test direct handler call with context and params (as internal method)
	handler, server := newTestHandler()

	a1 := agent.NewAgent("direct-agent", agent.AgentTypeArchitect)
	a1.SetState(agent.StateThinking)
	if err := server.Registry().Register(a1); err != nil {
		t.Fatalf("register: %v", err)
	}

	// Call directly like the handler would
	result, err := handler.HandleCommand("get_supervisor_stats", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	stats, ok := result.(SupervisorStats)
	if !ok {
		t.Fatalf("expected SupervisorStats, got %T", result)
	}

	if stats.TotalAgents != 1 {
		t.Errorf("expected TotalAgents=1, got %d", stats.TotalAgents)
	}
	if stats.BusyAgents != 1 {
		t.Errorf("expected BusyAgents=1, got %d", stats.BusyAgents)
	}
}

func TestHandleGetEmergenceData_WithBusyAgents(t *testing.T) {
	handler, server := newTestHandler()

	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "busy-swarm",
		Name:     "Busy Swarm",
		Topology: swarm.TopologyMesh,
		Strategy: swarm.StrategyParallel,
	})

	a1 := agent.NewAgent("busy-agent", agent.AgentTypeCoder)
	a1.SetState(agent.StateExecuting)
	sw.AddAgent(a1)

	server.AddSwarm("busy-swarm", sw)

	result, err := handler.HandleCommand("get_emergence_data", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	data, ok := result.(EmergenceData)
	if !ok {
		t.Fatalf("expected EmergenceData, got %T", result)
	}

	// Agent utilization: 1 executing / 1 total = 1.0
	health := data.Health
	if health.AgentUtilization != 1.0 {
		t.Errorf("expected AgentUtilization=1.0, got %f", health.AgentUtilization)
	}

	// With no tasks, overallScore should equal utilization = 1.0
	if health.OverallScore != 1.0 {
		t.Errorf("expected OverallScore=1.0 (utilization with no tasks), got %f", health.OverallScore)
	}
}

func TestHandleGetEmergenceData_ContextParam(t *testing.T) {
	// Verify that params are accepted but not required
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("get_emergence_data", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	data, ok := result.(EmergenceData)
	if !ok {
		t.Fatalf("expected EmergenceData, got %T", result)
	}

	// Empty swarms should return zero metrics
	if data.Health.OverallScore != 0 {
		t.Errorf("expected OverallScore=0, got %f", data.Health.OverallScore)
	}
}
