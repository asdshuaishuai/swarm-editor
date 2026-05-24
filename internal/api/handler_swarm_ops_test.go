package api

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/swarm-editor/swarm-editor/internal/agent"
	"github.com/swarm-editor/swarm-editor/internal/swarm"
)

func TestHandleDeleteSwarm_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("delete_swarm", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleDeleteSwarm_EmptyID(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("delete_swarm", json.RawMessage(`{"id":""}`), "test")
	if err == nil {
		t.Error("expected error for empty id")
	}
}

func TestHandleDeleteSwarm_Valid(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-del",
		Name:     "DeleteSwarm",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	s.swarms["sw-del"] = sw
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("delete_swarm", json.RawMessage(`{"id":"sw-del"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]string)
	if m["status"] != "deleted" {
		t.Errorf("expected status deleted, got %s", m["status"])
	}
	if _, ok := s.swarms["sw-del"]; ok {
		t.Error("expected swarm to be removed")
	}
}

func TestHandleDeleteSwarm_Nonexistent(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("delete_swarm", json.RawMessage(`{"id":"sw-none"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]string)
	if m["status"] != "deleted" {
		t.Errorf("expected status deleted, got %s", m["status"])
	}
}

func TestHandleExecuteTask_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("execute_task", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleExecuteTask_MissingSwarmID(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("execute_task", json.RawMessage(`{"taskId":"t-1"}`), "test")
	if err == nil {
		t.Error("expected error for missing swarmId")
	}
}

func TestHandleExecuteTask_MissingTaskID(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("execute_task", json.RawMessage(`{"swarmId":"sw-1"}`), "test")
	if err == nil {
		t.Error("expected error for missing taskId")
	}
}

func TestHandleExecuteTask_SwarmNotFound(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("execute_task", json.RawMessage(`{"swarmId":"sw-none","taskId":"t-1"}`), "test")
	if err == nil {
		t.Error("expected error for swarm not found")
	}
}

func TestHandleExecuteTask_TaskNotFound(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-et",
		Name:     "ExecTaskSwarm",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	s.swarms["sw-et"] = sw
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("execute_task", json.RawMessage(`{"swarmId":"sw-et","taskId":"t-none"}`), "test")
	if err == nil {
		t.Error("expected error for task not found")
	}
}

func TestHandleCancelTask_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("cancel_task", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleCancelTask_MissingSwarmID(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("cancel_task", json.RawMessage(`{"taskId":"t-1"}`), "test")
	if err == nil {
		t.Error("expected error for missing swarmId")
	}
}

func TestHandleCancelTask_SwarmNotFound(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("cancel_task", json.RawMessage(`{"swarmId":"sw-none","taskId":"t-1"}`), "test")
	if err == nil {
		t.Error("expected error for swarm not found")
	}
}

func TestHandleCancelTask_Valid(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-ct",
		Name:     "CancelTaskSwarm",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	task := &swarm.Task{
		ID:    "t-ct",
		Title: "CancelMe",
		State: swarm.TaskStatePending,
	}
	sw.SubmitTask(context.Background(), task)
	s.swarms["sw-ct"] = sw
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("cancel_task", json.RawMessage(`{"swarmId":"sw-ct","taskId":"t-ct","reason":"test cancel"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]any)
	if m["status"] != "cancelled" {
		t.Errorf("expected status cancelled, got %v", m["status"])
	}
}

func TestHandleAssignTask_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("assign_task", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleAssignTask_MissingFields(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("assign_task", json.RawMessage(`{"swarmId":"sw-1"}`), "test")
	if err == nil {
		t.Error("expected error for missing fields")
	}
}

func TestHandleAssignTask_SwarmNotFound(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("assign_task", json.RawMessage(`{"swarmId":"sw-none","taskId":"t-1","agentId":"a-1"}`), "test")
	if err == nil {
		t.Error("expected error for swarm not found")
	}
}

func TestHandleGetConsensus_AllSwarms(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	sw1 := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-c1",
		Name:     "ConsensusSwarm1",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	sw2 := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-c2",
		Name:     "ConsensusSwarm2",
		Topology: swarm.TopologyMesh,
		Strategy: swarm.StrategyParallel,
	})
	s.swarms["sw-c1"] = sw1
	s.swarms["sw-c2"] = sw2
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("get_consensus", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Should return consensus info for all swarms
	t.Logf("consensus result: %T, %v", result, result)
}

func TestHandleGetConsensus_SpecificSwarm(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-spec",
		Name:     "SpecificConsensus",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	s.swarms["sw-spec"] = sw
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("get_consensus", json.RawMessage(`{"swarmId":"sw-spec"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("specific consensus result: %T", result)
}

func TestHandleCreateSwarm_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("create_swarm", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleCreateSwarm_MissingName(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("create_swarm", json.RawMessage(`{"topology":"star","strategy":"parallel"}`), "test")
	if err == nil {
		t.Error("expected error for missing name")
	}
}

func TestHandleCreateSwarm_Valid(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("create_swarm", json.RawMessage(`{"name":"NewSwarm","topology":"star","strategy":"round_robin"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	si, ok := result.(SwarmInfo)
	if !ok {
		t.Fatalf("expected SwarmInfo, got %T", result)
	}
	if si.Name != "NewSwarm" {
		t.Errorf("expected name NewSwarm, got %s", si.Name)
	}
	if si.ID == "" {
		t.Error("expected non-empty id")
	}
}

func TestHandleGetSwarm_MissingID(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("get_swarm", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing id")
	}
}

func TestHandleGetSwarm_NotFound(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("get_swarm", json.RawMessage(`{"id":"nope"}`), "test")
	if err == nil {
		t.Error("expected error for swarm not found")
	}
}

func TestHandleCreateSwarm_WithAgents(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	registry := agent.NewRegistry()
	a := agent.NewAgent("SwarmAgent", agent.AgentTypeCoder)
	registry.Register(a)
	s.registry = registry
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("create_swarm", json.RawMessage(`{"name":"AgentSwarm","topology":"star","strategy":"round_robin","agentIds":["`+string(a.ID)+`"]}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	si := result.(SwarmInfo)
	if si.Name != "AgentSwarm" {
		t.Errorf("expected name AgentSwarm, got %s", si.Name)
	}
}

func TestHandleStartSwarm_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("start_swarm", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleStopSwarm_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("stop_swarm", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleSubmitTask_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("submit_task", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleSubmitTask_SwarmNotFound(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("submit_task", json.RawMessage(`{"swarmId":"sw-none","title":"task"}`), "test")
	if err == nil {
		t.Error("expected error for swarm not found")
	}
}

func TestHandleSubmitTask_Valid(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-sub",
		Name:     "SubmitTaskSwarm",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	s.swarms["sw-sub"] = sw
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("submit_task", json.RawMessage(`{"swarmId":"sw-sub","title":"Test Task","description":"desc"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	ti, ok := result.(TaskInfo)
	if !ok {
		t.Fatalf("expected TaskInfo, got %T", result)
	}
	if ti.Title != "Test Task" {
		t.Errorf("expected title Test Task, got %s", ti.Title)
	}
	if ti.Status != "pending" {
		t.Errorf("expected status pending, got %s", ti.Status)
	}
}
