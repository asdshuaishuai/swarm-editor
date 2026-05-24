package api

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
	"github.com/swarm-editor/swarm-editor/internal/swarm"
)

// ==================== handleScanSkills coverage ====================

func TestHandleScanSkills_Cov_WithWorkspacePath(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
		scanner:       nil, // no scanner → fallback Scan()
	}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("scan_skills", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	skills, ok := result.([]map[string]any)
	if !ok {
		t.Fatalf("expected []map[string]any, got %T", result)
	}
	if skills == nil {
		t.Error("expected non-nil slice")
	}
}

func TestHandleScanSkills_Cov_EmptyWorkspacePath(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: "",
		swarms:        make(map[string]*swarm.Swarm),
		scanner:       nil,
	}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("scan_skills", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	skills, ok := result.([]map[string]any)
	if !ok {
		t.Fatalf("expected []map[string]any, got %T", result)
	}
	_ = skills
}

func TestHandleScanSkills_Cov_WithParams(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
		scanner:       nil,
	}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("scan_skills", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	skills := result.([]map[string]any)
	_ = skills
}

// ==================== handleRefreshAgents coverage ====================

func TestHandleRefreshAgents_Cov_NilScannerWithRegistry(t *testing.T) {
	registry := agent.NewRegistry()
	ag := &agent.Agent{
		ID:   acp.AgentID("refresh-nil-scan"),
		Name: "Refresh Nil Scanner Agent",
		Type: agent.AgentTypeCoder,
	}
	if err := registry.Register(ag); err != nil {
		t.Fatalf("failed to register agent: %v", err)
	}

	s := &WebSocketServer{
		registry:    registry,
		connManager: nil,
		swarms:      make(map[string]*swarm.Swarm),
		scanner:     nil,
	}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("refresh_agents", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	agents, ok := result.([]AgentInfo)
	if !ok {
		t.Fatalf("expected []AgentInfo, got %T", result)
	}

	found := false
	for _, a := range agents {
		if a.ID == "refresh-nil-scan" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected refresh-nil-scan agent in results")
	}
}

func TestHandleRefreshAgents_Cov_RegistryAndConnManager(t *testing.T) {
	registry := agent.NewRegistry()
	ag := &agent.Agent{
		ID:   acp.AgentID("refresh-both"),
		Name: "Refresh Both Agent",
		Type: agent.AgentTypeReviewer,
	}
	if err := registry.Register(ag); err != nil {
		t.Fatalf("failed to register agent: %v", err)
	}

	s := &WebSocketServer{
		registry:    registry,
		connManager: acp.NewConnectionManager(&acp.Config{}),
		swarms:      make(map[string]*swarm.Swarm),
		scanner:     nil,
	}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("refresh_agents", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	agents := result.([]AgentInfo)
	if len(agents) < 1 {
		t.Errorf("expected at least 1 agent, got %d", len(agents))
	}

	found := false
	for _, a := range agents {
		if a.ID == "refresh-both" {
			found = true
			if a.Type != "reviewer" {
				t.Errorf("expected type reviewer, got %s", a.Type)
			}
			break
		}
	}
	if !found {
		t.Error("expected refresh-both in results")
	}
}

func TestHandleRefreshAgents_Cov_EmptyRegistry(t *testing.T) {
	s := &WebSocketServer{
		registry:    agent.NewRegistry(),
		connManager: nil,
		swarms:      make(map[string]*swarm.Swarm),
		scanner:     nil,
	}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("refresh_agents", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	agents := result.([]AgentInfo)
	if len(agents) != 0 {
		t.Errorf("expected 0 agents from empty registry, got %d", len(agents))
	}
}

// ==================== handleGetConsensus coverage ====================

func TestHandleGetConsensus_Cov_EmptySwarms(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("get_consensus", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["algorithm"] != "queen_bee" {
		t.Errorf("expected algorithm queen_bee, got %v", m["algorithm"])
	}
	if m["threshold"] != 0.51 {
		t.Errorf("expected threshold 0.51, got %v", m["threshold"])
	}
}

func TestHandleGetConsensus_Cov_WithSwarmFilter(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}

	sw1 := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-cov-1",
		Name:     "CovConsensusSwarm1",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	sw2 := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-cov-2",
		Name:     "CovConsensusSwarm2",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	s.swarms["sw-cov-1"] = sw1
	s.swarms["sw-cov-2"] = sw2
	h := NewCommandHandler(s)

	// Filter to only sw-cov-1
	result, err := h.HandleCommand("get_consensus", json.RawMessage(`{"swarmId":"sw-cov-1"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["algorithm"] != "queen_bee" {
		t.Errorf("expected algorithm queen_bee, got %v", m["algorithm"])
	}
}

func TestHandleGetConsensus_Cov_NonexistentSwarm(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}

	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-cov-exist",
		Name:     "CovExistingSwarm",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	s.swarms["sw-cov-exist"] = sw
	h := NewCommandHandler(s)

	// Filter to nonexistent swarm ID
	result, err := h.HandleCommand("get_consensus", json.RawMessage(`{"swarmId":"sw-cov-nope"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["algorithm"] != "queen_bee" {
		t.Errorf("expected algorithm queen_bee, got %v", m["algorithm"])
	}
}

func TestHandleGetConsensus_Cov_WithCompletedTasks(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-cov-comp",
		Name:     "CovCompletedSwarm",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	s.swarms["sw-cov-comp"] = sw

	// Submit a task and complete it
	ctx := context.Background()
	task := swarm.NewTask("Completed Task", "test desc", acp.Prompt{
		{Type: "text", Text: "do stuff"},
	})
	if err := sw.SubmitTask(ctx, task); err != nil {
		t.Fatalf("SubmitTask failed: %v", err)
	}
	// Assign to transition to running, then complete
	task.Assign(acp.AgentID("test-agent"))
	task.Complete(&swarm.TaskResult{
		TaskID:  task.ID,
		Content: "done",
	})

	h := NewCommandHandler(s)
	result, err := h.HandleCommand("get_consensus", json.RawMessage(`{"swarmId":"sw-cov-comp"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["algorithm"] != "queen_bee" {
		t.Errorf("expected algorithm queen_bee, got %v", m["algorithm"])
	}
	if _, ok := m["consensus"]; !ok {
		t.Error("expected 'consensus' key in result")
	}
}

// ==================== handleExecuteCode coverage ====================

func TestHandleExecuteCode_Cov_NoAgentAvailable(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
		connManager:   nil,
	}
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
		t.Error("expected error message about no agent available")
	}
}

func TestHandleExecuteCode_Cov_NoConnManager(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
		connManager:   nil,
	}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("execute_code", json.RawMessage(`{"content":"fmt.Println","language":"go","agentId":"some-agent"}`), "test")
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
}

func TestHandleExecuteCode_Cov_AgentNotConnected(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
		connManager:   acp.NewConnectionManager(&acp.Config{}),
	}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("execute_code", json.RawMessage(`{"content":"print('hello')","language":"python","agentId":"nonexistent"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["success"] != false {
		t.Error("expected success=false for unconnected agent")
	}
	if m["error"] == "" {
		t.Error("expected error about agent not connected")
	}
}

func TestHandleExecuteCode_Cov_EmptyConnManagerAutoSelect(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
		connManager:   acp.NewConnectionManager(&acp.Config{}),
	}
	h := NewCommandHandler(s)

	// No agentId specified, empty conn manager
	result, err := h.HandleCommand("execute_code", json.RawMessage(`{"content":"x = 1","language":"python"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m := result.(map[string]any)
	if m["success"] != false {
		t.Error("expected success=false when no agent available for auto-select")
	}
}

func TestHandleExecuteCode_Cov_WithFilePath(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
		connManager:   nil,
	}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("execute_code", json.RawMessage(`{"content":"x=1","language":"python","filePath":"/some/path/file.py"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m := result.(map[string]any)
	if m["success"] != false {
		t.Error("expected success=false with no agent")
	}
}

// ==================== handleGetProcessMetrics coverage ====================

func TestHandleGetProcessMetrics_Cov_NilConnManager(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
		connManager:   nil,
	}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("get_process_metrics", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	metrics, ok := result.([]map[string]any)
	if !ok {
		t.Fatalf("expected []map[string]any, got %T", result)
	}
	if len(metrics) != 0 {
		t.Errorf("expected 0 metrics with nil conn manager, got %d", len(metrics))
	}
}

func TestHandleGetProcessMetrics_Cov_EmptyConnManager(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
		connManager:   acp.NewConnectionManager(&acp.Config{}),
	}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("get_process_metrics", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	metrics, ok := result.([]map[string]any)
	if !ok {
		t.Fatalf("expected []map[string]any, got %T", result)
	}
	if len(metrics) != 0 {
		t.Errorf("expected 0 metrics with empty conn manager, got %d", len(metrics))
	}
}

func TestHandleGetProcessMetrics_Cov_WithParams(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
		connManager:   nil,
	}
	h := NewCommandHandler(s)

	// Handler ignores params, just returns metrics
	result, err := h.HandleCommand("get_process_metrics", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	metrics := result.([]map[string]any)
	if len(metrics) != 0 {
		t.Errorf("expected 0 metrics, got %d", len(metrics))
	}
}

// ==================== handleResumeTask coverage ====================

func TestHandleResumeTask_Cov_ValidResume(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-cov-resume",
		Name:     "CovResumeTestSwarm",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	s.swarms["sw-cov-resume"] = sw
	h := NewCommandHandler(s)

	// Create a checkpoint via interrupt
	intResult, err := h.HandleCommand("interrupt_agent", json.RawMessage(`{"swarmId":"sw-cov-resume","agentId":"agent-r1","taskId":"task-r1"}`), "test")
	if err != nil {
		t.Fatalf("interrupt failed: %v", err)
	}
	intMap := intResult.(map[string]any)
	checkpointID, ok := intMap["checkpointId"].(string)
	if !ok || checkpointID == "" {
		t.Fatal("expected checkpointId from interrupt")
	}

	// Resume the task
	result, err := h.HandleCommand("resume_task", json.RawMessage(`{"checkpointId":"`+checkpointID+`"}`), "test")
	if err != nil {
		t.Fatalf("resume failed: %v", err)
	}

	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["checkpointId"] != checkpointID {
		t.Errorf("expected checkpointId %s, got %v", checkpointID, m["checkpointId"])
	}
	if m["status"] != "resumed" {
		t.Errorf("expected status resumed, got %v", m["status"])
	}
}

func TestHandleResumeTask_Cov_ResumeWithAgent(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-cov-res-agent",
		Name:     "CovResumeWithAgentSwarm",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	s.swarms["sw-cov-res-agent"] = sw
	h := NewCommandHandler(s)

	// Create a checkpoint
	intResult, err := h.HandleCommand("interrupt_agent", json.RawMessage(`{"swarmId":"sw-cov-res-agent","agentId":"orig-agent","taskId":"task-ra1"}`), "test")
	if err != nil {
		t.Fatalf("interrupt failed: %v", err)
	}
	checkpointID := intResult.(map[string]any)["checkpointId"].(string)

	// Resume with a different agent
	result, err := h.HandleCommand("resume_task", json.RawMessage(`{"checkpointId":"`+checkpointID+`","agentId":"new-agent"}`), "test")
	if err != nil {
		t.Fatalf("resume with agent failed: %v", err)
	}

	m := result.(map[string]any)
	if m["status"] != "resumed" {
		t.Errorf("expected status resumed, got %v", m["status"])
	}
}

func TestHandleResumeTask_Cov_AlreadyRecovered(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-cov-res-dup",
		Name:     "CovResumeDupSwarm",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	s.swarms["sw-cov-res-dup"] = sw
	h := NewCommandHandler(s)

	// Create checkpoint
	intResult, err := h.HandleCommand("interrupt_agent", json.RawMessage(`{"swarmId":"sw-cov-res-dup","agentId":"a1","taskId":"t1"}`), "test")
	if err != nil {
		t.Fatalf("interrupt failed: %v", err)
	}
	checkpointID := intResult.(map[string]any)["checkpointId"].(string)

	// Resume once — should succeed
	_, err = h.HandleCommand("resume_task", json.RawMessage(`{"checkpointId":"`+checkpointID+`"}`), "test")
	if err != nil {
		t.Fatalf("first resume failed: %v", err)
	}

	// Resume again — should fail (already recovered)
	_, err = h.HandleCommand("resume_task", json.RawMessage(`{"checkpointId":"`+checkpointID+`"}`), "test")
	if err == nil {
		t.Error("expected error for already recovered checkpoint")
	}
}

func TestHandleResumeTask_Cov_MultipleSwarms(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	sw1 := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-cov-multi-1",
		Name:     "CovMultiSwarm1",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	sw2 := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "sw-cov-multi-2",
		Name:     "CovMultiSwarm2",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	s.swarms["sw-cov-multi-1"] = sw1
	s.swarms["sw-cov-multi-2"] = sw2
	h := NewCommandHandler(s)

	// Create checkpoint in sw1
	intResult, err := h.HandleCommand("interrupt_agent", json.RawMessage(`{"swarmId":"sw-cov-multi-1","agentId":"a1","taskId":"t1"}`), "test")
	if err != nil {
		t.Fatalf("interrupt failed: %v", err)
	}
	checkpointID := intResult.(map[string]any)["checkpointId"].(string)

	// Resume should find the checkpoint across both swarms
	result, err := h.HandleCommand("resume_task", json.RawMessage(`{"checkpointId":"`+checkpointID+`"}`), "test")
	if err != nil {
		t.Fatalf("resume across swarms failed: %v", err)
	}

	m := result.(map[string]any)
	if m["status"] != "resumed" {
		t.Errorf("expected status resumed, got %v", m["status"])
	}
}

// ==================== handleGetAgentLogs coverage ====================

func TestHandleGetAgentLogs_Cov_NilConnManager(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
		connManager:   nil,
	}
	h := NewCommandHandler(s)

	result, err := h.HandleCommand("get_agent_logs", json.RawMessage(`{"agentId":"a1","count":10}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	logs, ok := result.([]acp.LogEntry)
	if !ok {
		t.Fatalf("expected []acp.LogEntry, got %T", result)
	}
	if len(logs) != 0 {
		t.Errorf("expected 0 logs with nil conn manager, got %d", len(logs))
	}
}

func TestHandleGetAgentLogs_Cov_InvalidJSON(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("get_agent_logs", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleGetAgentLogs_Cov_EmptyAgentID(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
	}
	h := NewCommandHandler(s)

	_, err := h.HandleCommand("get_agent_logs", json.RawMessage(`{"agentId":"","count":10}`), "test")
	if err == nil {
		t.Error("expected error for empty agentId")
	}
}

func TestHandleGetAgentLogs_Cov_DefaultCount(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
		connManager:   acp.NewConnectionManager(&acp.Config{}),
	}
	h := NewCommandHandler(s)

	// Agent not connected — should return not found error
	_, err := h.HandleCommand("get_agent_logs", json.RawMessage(`{"agentId":"noexist"}`), "test")
	if err == nil {
		t.Error("expected error for non-connected agent")
	}
}

func TestHandleGetAgentLogs_Cov_NegativeCount(t *testing.T) {
	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
		connManager:   nil,
	}
	h := NewCommandHandler(s)

	// Negative count should default to 100
	result, err := h.HandleCommand("get_agent_logs", json.RawMessage(`{"agentId":"a1","count":-5}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	logs := result.([]acp.LogEntry)
	_ = logs
}

// ==================== handleGetProcessMetrics with context ====================

func TestHandleGetProcessMetrics_Cov_WithContext(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	s := &WebSocketServer{
		workspacePath: t.TempDir(),
		swarms:        make(map[string]*swarm.Swarm),
		connManager:   nil,
	}
	h := NewCommandHandler(s)

	// Use the context-aware path by calling handleGetProcessMetrics directly
	result, err := h.handleGetProcessMetrics(ctx, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	metrics := result.([]map[string]any)
	if len(metrics) != 0 {
		t.Errorf("expected 0 metrics, got %d", len(metrics))
	}
}
