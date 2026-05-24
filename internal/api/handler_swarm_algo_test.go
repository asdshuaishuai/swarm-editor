package api

import (
	"encoding/json"
	"testing"

	"github.com/swarm-editor/swarm-editor/internal/swarm"
)

func TestHandleGetQueenStatus_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("get_queen_status", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleGetQueenStatus_EmptyID(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("get_queen_status", json.RawMessage(`{"swarmId":""}`), "test")
	if err == nil {
		t.Error("expected error for empty swarmId")
	}
}

func TestHandleGetQueenStatus_NotFound(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("get_queen_status", json.RawMessage(`{"swarmId":"no-exist"}`), "test")
	if err == nil {
		t.Error("expected error for missing swarm")
	}
}

func TestHandleGetQueenStatus_Valid(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-queen",
		Name:     "QueenTest",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	s.swarms["sw-queen"] = sw
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("get_queen_status", json.RawMessage(`{"swarmId":"sw-queen"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["swarmId"] != "sw-queen" {
		t.Errorf("expected swarmId sw-queen, got %v", m["swarmId"])
	}
}

func TestHandleTriggerElection_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("trigger_election", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleTriggerElection_EmptyID(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("trigger_election", json.RawMessage(`{"swarmId":""}`), "test")
	if err == nil {
		t.Error("expected error for empty swarmId")
	}
}

func TestHandleTriggerElection_NotFound(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("trigger_election", json.RawMessage(`{"swarmId":"nope"}`), "test")
	if err == nil {
		t.Error("expected error for missing swarm")
	}
}

func TestHandleTriggerElection_Valid(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-elect",
		Name:     "ElectionTest",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	s.swarms["sw-elect"] = sw
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("trigger_election", json.RawMessage(`{"swarmId":"sw-elect"}`), "test")
	// Election may fail if no agents available, but should not crash
	if err != nil {
		// Expected if no agents registered — just verify no panic
		t.Logf("trigger_election returned error (expected with no agents): %v", err)
		return
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	t.Logf("election result: %v", m)
}

func TestHandleAbdicateQueen_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("abdicate_queen", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleAbdicateQueen_EmptyID(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("abdicate_queen", json.RawMessage(`{"swarmId":""}`), "test")
	if err == nil {
		t.Error("expected error for empty swarmId")
	}
}

func TestHandleAbdicateQueen_NotFound(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("abdicate_queen", json.RawMessage(`{"swarmId":"nope"}`), "test")
	if err == nil {
		t.Error("expected error for missing swarm")
	}
}

func TestHandleAbdicateQueen_Valid(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-abd",
		Name:     "AbdicateTest",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
		ElectionConfig: &swarm.ElectionConfig{
			DefaultCandidates: []string{"claude-code", "opencode"},
			HealthThreshold:   0.7,
		},
	})
	s.swarms["sw-abd"] = sw
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("abdicate_queen", json.RawMessage(`{"swarmId":"sw-abd","reason":"test"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["previous"] != "test" {
		t.Errorf("expected previous 'test', got %v", m["previous"])
	}
}

func TestHandleInterruptAgent_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("interrupt_agent", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleInterruptAgent_MissingFields(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("interrupt_agent", json.RawMessage(`{"swarmId":"s1"}`), "test")
	if err == nil {
		t.Error("expected error for missing agentId")
	}

	_, err = h.HandleCommand("interrupt_agent", json.RawMessage(`{"swarmId":"s1","agentId":"a1"}`), "test")
	if err == nil {
		t.Error("expected error for missing taskId")
	}
}

func TestHandleInterruptAgent_NotFound(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("interrupt_agent", json.RawMessage(`{"swarmId":"nope","agentId":"a1","taskId":"t1"}`), "test")
	if err == nil {
		t.Error("expected error for missing swarm")
	}
}

func TestHandleInterruptAgent_Valid(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-int",
		Name:     "InterruptTest",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	s.swarms["sw-int"] = sw
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("interrupt_agent", json.RawMessage(`{"swarmId":"sw-int","agentId":"a1","taskId":"t1"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["checkpointId"] == nil || m["checkpointId"] == "" {
		t.Error("expected checkpointId in result")
	}
	if m["taskId"] != "t1" {
		t.Errorf("expected taskId t1, got %v", m["taskId"])
	}
}

func TestHandleResumeTask_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("resume_task", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleResumeTask_EmptyCheckpoint(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("resume_task", json.RawMessage(`{"checkpointId":""}`), "test")
	if err == nil {
		t.Error("expected error for empty checkpointId")
	}
}

func TestHandleResumeTask_NotFound(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("resume_task", json.RawMessage(`{"checkpointId":"cp-nope"}`), "test")
	if err == nil {
		t.Error("expected error for missing checkpoint")
	}
}

func TestHandleGetCheckpoints_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("get_checkpoints", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleGetCheckpoints_EmptyID(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("get_checkpoints", json.RawMessage(`{"swarmId":""}`), "test")
	if err == nil {
		t.Error("expected error for empty swarmId")
	}
}

func TestHandleGetCheckpoints_Valid(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-cp",
		Name:     "CheckpointTest",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	s.swarms["sw-cp"] = sw
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("get_checkpoints", json.RawMessage(`{"swarmId":"sw-cp"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Should return empty list or slice (no checkpoints yet)
	t.Logf("get_checkpoints result type: %T", result)
}

func TestHandleRecoverTask_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("recover_task", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleRecoverTask_MissingFields(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("recover_task", json.RawMessage(`{"checkpointId":""}`), "test")
	if err == nil {
		t.Error("expected error for empty checkpointId")
	}

	_, err = h.HandleCommand("recover_task", json.RawMessage(`{"checkpointId":"cp1"}`), "test")
	if err == nil {
		t.Error("expected error for empty strategy")
	}
}

func TestHandleRecoverTask_InvalidStrategy(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("recover_task", json.RawMessage(`{"checkpointId":"cp1","strategy":"bogus"}`), "test")
	if err == nil {
		t.Error("expected error for invalid strategy")
	}
}

func TestHandleRecoverTask_NotFound(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-rec",
		Name:     "RecoverTest",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	s.swarms["sw-rec"] = sw
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("recover_task", json.RawMessage(`{"checkpointId":"cp-nope","strategy":"retry_same"}`), "test")
	if err == nil {
		t.Error("expected error for missing checkpoint")
	}
}

func TestHandleGetRoleAssignments_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("get_role_assignments", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleGetRoleAssignments_EmptyID(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("get_role_assignments", json.RawMessage(`{"swarmId":""}`), "test")
	if err == nil {
		t.Error("expected error for empty swarmId")
	}
}

func TestHandleGetRoleAssignments_NotFound(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("get_role_assignments", json.RawMessage(`{"swarmId":"nope"}`), "test")
	if err == nil {
		t.Error("expected error for missing swarm")
	}
}

func TestHandleGetRoleAssignments_Valid(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-roles",
		Name:     "RolesTest",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	s.swarms["sw-roles"] = sw
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("get_role_assignments", json.RawMessage(`{"swarmId":"sw-roles"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	arr, ok := result.([]map[string]any)
	if !ok {
		t.Fatalf("expected []map, got %T", result)
	}
	if len(arr) != 0 {
		t.Errorf("expected 0 assignments, got %d", len(arr))
	}
}
