package api

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/swarm"
)

func createTestSwarmServer(t *testing.T) *WebSocketServer {
	t.Helper()
	dir := t.TempDir()
	return &WebSocketServer{
		workspacePath: dir,
		swarms:        make(map[string]*swarm.Swarm),
	}
}

func TestHandleGetSwarmTasks_InvalidJSON(t *testing.T) {
	s := createTestSwarmServer(t)
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("get_swarm_tasks", json.RawMessage(`invalid`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleGetSwarmTasks_MissingSwarmID(t *testing.T) {
	s := createTestSwarmServer(t)
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("get_swarm_tasks", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing swarmId")
	}
}

func TestHandleGetSwarmTasks_SwarmNotFound(t *testing.T) {
	s := createTestSwarmServer(t)
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("get_swarm_tasks", json.RawMessage(`{"swarmId":"nonexistent"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent swarm")
	}
}

func TestHandleGetSwarmTasks_EmptyTasks(t *testing.T) {
	s := createTestSwarmServer(t)
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-1",
		Name:     "TestSwarm",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	s.swarms["sw-1"] = sw
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("get_swarm_tasks", json.RawMessage(`{"swarmId":"sw-1"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	tasks, ok := result.([]TaskInfo)
	if !ok {
		t.Fatalf("expected []TaskInfo, got %T", result)
	}
	if len(tasks) != 0 {
		t.Errorf("expected 0 tasks, got %d", len(tasks))
	}
}

func TestHandleGetSwarmTasks_WithTasks(t *testing.T) {
	s := createTestSwarmServer(t)
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-2",
		Name:     "TaskSwarm",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	s.swarms["sw-2"] = sw

	// Submit a task
	task := &swarm.Task{
		ID:          "task-1",
		Title:       "Test Task",
		Description: "A test task",
		State:       swarm.TaskStatePending,
		Priority:    swarm.PriorityHigh,
		CreatedAt:   time.Now(),
	}
	ctx := context.Background()
	if err := sw.SubmitTask(ctx, task); err != nil {
		t.Fatalf("failed to submit task: %v", err)
	}

	h := NewCommandHandler(s)
	result, err := h.HandleCommand("get_swarm_tasks", json.RawMessage(`{"swarmId":"sw-2"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	tasks, ok := result.([]TaskInfo)
	if !ok {
		t.Fatalf("expected []TaskInfo, got %T", result)
	}
	if len(tasks) != 1 {
		t.Fatalf("expected 1 task, got %d", len(tasks))
	}
	if tasks[0].ID != "task-1" {
		t.Errorf("expected task ID task-1, got %s", tasks[0].ID)
	}
	if tasks[0].Title != "Test Task" {
		t.Errorf("expected title Test Task, got %s", tasks[0].Title)
	}
	if tasks[0].Status != "pending" {
		t.Errorf("expected status pending, got %s", tasks[0].Status)
	}
	if tasks[0].Priority != "high" {
		t.Errorf("expected priority high, got %s", tasks[0].Priority)
	}
}

func TestHandleGetSwarmTasks_CompletedTask(t *testing.T) {
	s := createTestSwarmServer(t)
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-3",
		Name:     "CompletedSwarm",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	s.swarms["sw-3"] = sw

	task := &swarm.Task{
		ID:          "task-c",
		Title:       "Completed Task",
		State:       swarm.TaskStateCompleted,
		Priority:    swarm.PriorityMedium,
		CreatedAt:   time.Now(),
		CompletedAt: time.Now(),
		Result:      &swarm.TaskResult{Content: "done"},
	}
	if err := sw.SubmitTask(context.Background(), task); err != nil {
		t.Fatalf("failed to submit task: %v", err)
	}

	h := NewCommandHandler(s)
	result, err := h.HandleCommand("get_swarm_tasks", json.RawMessage(`{"swarmId":"sw-3"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	tasks := result.([]TaskInfo)
	if len(tasks) != 1 {
		t.Fatalf("expected 1 task, got %d", len(tasks))
	}
	if tasks[0].CompletedAt == nil {
		t.Error("expected non-nil CompletedAt")
	}
}

func TestHandleGetSwarm_Full(t *testing.T) {
	s := createTestSwarmServer(t)
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:        "sw-4",
		Name:      "FullSwarm",
		Topology:  swarm.TopologyMesh,
		Strategy:  swarm.StrategyParallel,
		AgentCount: 3,
	})
	s.swarms["sw-4"] = sw

	h := NewCommandHandler(s)
	result, err := h.handleGetSwarm(context.Background(), json.RawMessage(`{"id":"sw-4"}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["name"] != "FullSwarm" {
		t.Errorf("expected name FullSwarm, got %v", m["name"])
	}
	if m["topology"] != "mesh" {
		t.Errorf("expected topology mesh, got %v", m["topology"])
	}
}

func TestHandleGetConsensus_NoSwarms(t *testing.T) {
	s := createTestSwarmServer(t)
	h := NewCommandHandler(s)

	result, err := h.handleGetConsensus(context.Background(), json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// handleGetConsensus returns []ConsensusInfo directly
	t.Logf("consensus result type: %T", result)
}

func TestHandleGetConsensus_InvalidJSON(t *testing.T) {
	s := createTestSwarmServer(t)
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("get_consensus", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleGetConsensus_WithSwarm(t *testing.T) {
	s := createTestSwarmServer(t)
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-con",
		Name:     "ConsensusSwarm",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	s.swarms["sw-con"] = sw

	h := NewCommandHandler(s)
	result, err := h.handleGetConsensus(context.Background(), json.RawMessage(`{"swarmId":"sw-con"}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("consensus result: %T", result)
}
