package api

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
	"github.com/swarm-editor/swarm-editor/internal/swarm"
)

func TestHandleResolveHandoff_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("resolve_handoff", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleResolveHandoff_MissingRequestID(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("resolve_handoff", json.RawMessage(`{"accepted":true}`), "test")
	if err == nil {
		t.Error("expected error for missing requestId")
	}
}

func TestHandleResolveHandoff_NoSwarms(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("resolve_handoff", json.RawMessage(`{"requestId":"r-1","accepted":true}`), "test")
	if err == nil {
		t.Error("expected error when no swarms have the request")
	}
}

func TestHandleResolveHandoff_AcceptWithRealSwarm(t *testing.T) {
	dir := t.TempDir()
	registry := agent.NewRegistry()
	a1 := agent.NewAgent("Agent1", agent.AgentTypeCoder)
	a2 := agent.NewAgent("Agent2", agent.AgentTypeReviewer)
	registry.Register(a1)
	registry.Register(a2)

	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-handoff",
		Name:     "HandoffSwarm",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})

	// Register agents with swarm
	sw.AddAgent(a1)
	sw.AddAgent(a2)

	s := &WebSocketServer{
		workspacePath: dir,
		swarms:        map[string]*swarm.Swarm{"sw-handoff": sw},
	}
	h := NewCommandHandler(s)

	// Create a handoff request
	req, err := sw.RequestHandoff(context.Background(), string(a1.ID), string(a2.ID), "task-1", "need review", nil)
	if err != nil {
		t.Fatalf("failed to create handoff request: %v", err)
	}

	// Accept it
	result, err := h.HandleCommand("resolve_handoff", json.RawMessage(`{"swarmId":"sw-handoff","requestId":"`+req.ID+`","accepted":true,"summary":"looks good"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["status"] != "resolved" {
		t.Errorf("expected status resolved, got %v", m["status"])
	}
	if m["accepted"] != true {
		t.Error("expected accepted=true")
	}
}

func TestHandleResolveHandoff_RejectWithRealSwarm(t *testing.T) {
	dir := t.TempDir()
	registry := agent.NewRegistry()
	a1 := agent.NewAgent("RejA1", agent.AgentTypeCoder)
	a2 := agent.NewAgent("RejA2", agent.AgentTypeReviewer)
	registry.Register(a1)
	registry.Register(a2)

	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-reject",
		Name:     "RejectSwarm",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	sw.AddAgent(a1)
	sw.AddAgent(a2)

	s := &WebSocketServer{
		workspacePath: dir,
		swarms:        map[string]*swarm.Swarm{"sw-reject": sw},
	}
	h := NewCommandHandler(s)

	req, err := sw.RequestHandoff(context.Background(), string(a1.ID), string(a2.ID), "task-r", "check this", nil)
	if err != nil {
		t.Fatalf("failed to create handoff request: %v", err)
	}

	result, err := h.HandleCommand("resolve_handoff", json.RawMessage(`{"swarmId":"sw-reject","requestId":"`+req.ID+`","accepted":false,"summary":"rejected"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]any)
	if m["accepted"] != false {
		t.Error("expected accepted=false")
	}
}

func TestHandleResolveHandoff_SwarmIDFilter(t *testing.T) {
	dir := t.TempDir()
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-filter",
		Name:     "FilterSwarm",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})

	s := &WebSocketServer{
		workspacePath: dir,
		swarms:        map[string]*swarm.Swarm{"sw-filter": sw},
	}
	h := NewCommandHandler(s)

	// Nonexistent request filtered by swarmId
	_, err := h.HandleCommand("resolve_handoff", json.RawMessage(`{"swarmId":"sw-filter","requestId":"nonexistent","accepted":true}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent request")
	}
}

func TestHandleResolveHandoff_WrongSwarmID(t *testing.T) {
	dir := t.TempDir()
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-real",
		Name:     "RealSwarm",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})

	s := &WebSocketServer{
		workspacePath: dir,
		swarms:        map[string]*swarm.Swarm{"sw-real": sw},
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("resolve_handoff", json.RawMessage(`{"swarmId":"sw-other","requestId":"r-1","accepted":true}`), "test")
	if err == nil {
		t.Error("expected error when swarmId doesn't match any swarm with the request")
	}
}

func TestHandleResolveHandoff_MultiSwarmSearch(t *testing.T) {
	dir := t.TempDir()
	registry := agent.NewRegistry()
	a1 := agent.NewAgent("MultiA1", agent.AgentTypeCoder)
	a2 := agent.NewAgent("MultiA2", agent.AgentTypeReviewer)
	registry.Register(a1)
	registry.Register(a2)

	sw1 := swarm.NewSwarm(swarm.SwarmConfig{ID: "sw-1", Name: "Swarm1", Topology: swarm.TopologyStar, Strategy: swarm.StrategyParallel})
	sw2 := swarm.NewSwarm(swarm.SwarmConfig{ID: "sw-2", Name: "Swarm2", Topology: swarm.TopologyStar, Strategy: swarm.StrategyParallel})
	sw1.AddAgent(a1)
	sw1.AddAgent(a2)

	// Create handoff in sw-1
	req, _ := sw1.RequestHandoff(context.Background(), string(a1.ID), string(a2.ID), "t-m", "reason", nil)

	s := &WebSocketServer{
		workspacePath: dir,
		swarms:        map[string]*swarm.Swarm{"sw-1": sw1, "sw-2": sw2},
	}
	h := NewCommandHandler(s)

	// No swarmId → should search both and find in sw-1
	result, err := h.HandleCommand("resolve_handoff", json.RawMessage(`{"requestId":"`+req.ID+`","accepted":true,"summary":"ok"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]any)
	if m["status"] != "resolved" {
		t.Errorf("expected resolved, got %v", m["status"])
	}
}

// Verify Swarm.AddAgent exists
func init() {
	_ = acp.AgentID("")
}
