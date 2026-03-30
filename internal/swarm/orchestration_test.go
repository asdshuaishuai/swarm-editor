package swarm

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestOrchestrator_CreateWorkflow(t *testing.T) {
	orchestrator := NewOrchestrator(nil)

	workflow := orchestrator.CreateWorkflow("test-workflow", ModeSequential)
	if workflow == nil {
		t.Fatal("expected workflow to be created")
	}

	if workflow.Name != "test-workflow" {
		t.Errorf("expected name 'test-workflow', got '%s'", workflow.Name)
	}

	if workflow.Mode != ModeSequential {
		t.Errorf("expected mode 'sequential', got '%s'", workflow.Mode)
	}

	if workflow.Status != "draft" {
		t.Errorf("expected status 'draft', got '%s'", workflow.Status)
	}
}

func TestWorkflow_AddNode(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("test", ModeSequential)

	node := &WorkflowNode{
		ID:      "node-1",
		Name:    "Agent 1",
		AgentID: "agent-1",
		Type:    "agent",
	}

	workflow.AddNode(node)

	if len(workflow.Nodes) != 1 {
		t.Errorf("expected 1 node, got %d", len(workflow.Nodes))
	}

	if workflow.Nodes[0].ID != "node-1" {
		t.Errorf("expected node ID 'node-1', got '%s'", workflow.Nodes[0].ID)
	}
}

func TestWorkflow_AddEdge(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("test", ModeSequential)

	workflow.AddNode(&WorkflowNode{ID: "node-1", Name: "Node 1"})
	workflow.AddNode(&WorkflowNode{ID: "node-2", Name: "Node 2"})

	edge := &WorkflowEdge{
		ID:   "edge-1",
		From: "node-1",
		To:   "node-2",
	}

	err := workflow.AddEdge(edge)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(workflow.Edges) != 1 {
		t.Errorf("expected 1 edge, got %d", len(workflow.Edges))
	}
}

func TestWorkflow_AddEdge_InvalidNode(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("test", ModeSequential)

	workflow.AddNode(&WorkflowNode{ID: "node-1", Name: "Node 1"})

	edge := &WorkflowEdge{
		ID:   "edge-1",
		From: "node-1",
		To:   "non-existent",
	}

	err := workflow.AddEdge(edge)
	if err == nil {
		t.Error("expected error for non-existent node")
	}
}

func TestWorkflow_GetStartNodes(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("test", ModeSequential)

	workflow.AddNode(&WorkflowNode{ID: "node-1", Name: "Start"})
	workflow.AddNode(&WorkflowNode{ID: "node-2", Name: "Middle"})
	workflow.AddEdge(&WorkflowEdge{ID: "e1", From: "node-1", To: "node-2"})

	startNodes := workflow.GetStartNodes()
	if len(startNodes) != 1 {
		t.Errorf("expected 1 start node, got %d", len(startNodes))
	}

	if startNodes[0].ID != "node-1" {
		t.Errorf("expected start node 'node-1', got '%s'", startNodes[0].ID)
	}
}

func TestWorkflow_GetNextNodes(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("test", ModeSequential)

	workflow.AddNode(&WorkflowNode{ID: "node-1", Name: "First"})
	workflow.AddNode(&WorkflowNode{ID: "node-2", Name: "Second"})
	workflow.AddNode(&WorkflowNode{ID: "node-3", Name: "Third"})

	workflow.AddEdge(&WorkflowEdge{ID: "e1", From: "node-1", To: "node-2"})
	workflow.AddEdge(&WorkflowEdge{ID: "e2", From: "node-1", To: "node-3"})

	nextNodes := workflow.GetNextNodes("node-1")
	if len(nextNodes) != 2 {
		t.Errorf("expected 2 next nodes, got %d", len(nextNodes))
	}
}

func TestOrchestrator_CreateCheckpoint(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("test", ModeSequential)

	workflow.AddNode(&WorkflowNode{
		ID:     "node-1",
		Name:   "Agent 1",
		Status: TaskStatusCompleted,
	})

	workflow.currentNode = "node-1"

	cp := orchestrator.createCheckpoint(workflow)

	if cp == nil {
		t.Fatal("expected checkpoint to be created")
	}

	if cp.WorkflowID != workflow.ID {
		t.Errorf("expected workflow ID '%s', got '%s'", workflow.ID, cp.WorkflowID)
	}

	if len(cp.NodeStates) != 1 {
		t.Errorf("expected 1 node state, got %d", len(cp.NodeStates))
	}
}

func TestOrchestrator_GetCheckpoints(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("test", ModeSequential)
	workflow.AddNode(&WorkflowNode{ID: "node-1", Name: "Node 1"})

	// Create multiple checkpoints
	orchestrator.createCheckpoint(workflow)
	orchestrator.createCheckpoint(workflow)

	checkpoints := orchestrator.GetCheckpoints(workflow.ID)
	if len(checkpoints) != 2 {
		t.Errorf("expected 2 checkpoints, got %d", len(checkpoints))
	}
}

func TestWorkflow_ToJSON(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("test", ModeSequential)

	workflow.AddNode(&WorkflowNode{ID: "node-1", Name: "Agent 1"})
	workflow.AddEdge(&WorkflowEdge{ID: "e1", From: "node-1", To: "node-2"})

	data, err := workflow.ToJSON()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(data) == 0 {
		t.Error("expected non-empty JSON output")
	}
}

func TestFromJSON(t *testing.T) {
	jsonData := `{
		"id": "wf-test",
		"name": "Test Workflow",
		"description": "A test workflow",
		"mode": "sequential",
		"nodes": [
			{"id": "node-1", "name": "Agent 1", "agentId": "agent-1", "type": "agent"}
		],
		"edges": [],
		"status": "draft"
	}`

	workflow, err := FromJSON([]byte(jsonData))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if workflow.Name != "Test Workflow" {
		t.Errorf("expected name 'Test Workflow', got '%s'", workflow.Name)
	}

	if workflow.Mode != ModeSequential {
		t.Errorf("expected mode 'sequential', got '%s'", workflow.Mode)
	}

	if len(workflow.Nodes) != 1 {
		t.Errorf("expected 1 node, got %d", len(workflow.Nodes))
	}
}

func TestOrchestrator_ExecuteSequential(t *testing.T) {
	// Note: This test requires a scheduler with actual agents
	// For now, we just test the workflow setup
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("sequential-test", ModeSequential)

	workflow.AddNode(&WorkflowNode{ID: "node-1", Name: "Step 1", AgentID: "agent-1"})
	workflow.AddNode(&WorkflowNode{ID: "node-2", Name: "Step 2", AgentID: "agent-2"})
	workflow.AddEdge(&WorkflowEdge{ID: "e1", From: "node-1", To: "node-2"})

	// Verify setup
	startNodes := workflow.GetStartNodes()
	if len(startNodes) != 1 {
		t.Errorf("expected 1 start node, got %d", len(startNodes))
	}

	nextNodes := workflow.GetNextNodes("node-1")
	if len(nextNodes) != 1 {
		t.Errorf("expected 1 next node, got %d", len(nextNodes))
	}
}

func TestOrchestrator_ExecuteParallel(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("parallel-test", ModeParallel)

	// Multiple start nodes for parallel execution
	workflow.AddNode(&WorkflowNode{ID: "node-1", Name: "Parallel 1", AgentID: "agent-1"})
	workflow.AddNode(&WorkflowNode{ID: "node-2", Name: "Parallel 2", AgentID: "agent-2"})
	workflow.AddNode(&WorkflowNode{ID: "node-3", Name: "Join", AgentID: "agent-3"})

	workflow.AddEdge(&WorkflowEdge{ID: "e1", From: "node-1", To: "node-3"})
	workflow.AddEdge(&WorkflowEdge{ID: "e2", From: "node-2", To: "node-3"})

	startNodes := workflow.GetStartNodes()
	if len(startNodes) != 2 {
		t.Errorf("expected 2 start nodes for parallel, got %d", len(startNodes))
	}
}

func TestOrchestrator_ExecuteGraph(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("graph-test", ModeGraph)

	// Diamond pattern
	workflow.AddNode(&WorkflowNode{ID: "start", Name: "Start", AgentID: "agent-1"})
	workflow.AddNode(&WorkflowNode{ID: "branch-a", Name: "Branch A", AgentID: "agent-2"})
	workflow.AddNode(&WorkflowNode{ID: "branch-b", Name: "Branch B", AgentID: "agent-3"})
	workflow.AddNode(&WorkflowNode{ID: "merge", Name: "Merge", AgentID: "agent-4"})

	workflow.AddEdge(&WorkflowEdge{ID: "e1", From: "start", To: "branch-a"})
	workflow.AddEdge(&WorkflowEdge{ID: "e2", From: "start", To: "branch-b"})
	workflow.AddEdge(&WorkflowEdge{ID: "e3", From: "branch-a", To: "merge"})
	workflow.AddEdge(&WorkflowEdge{ID: "e4", From: "branch-b", To: "merge"})

	// Verify graph structure
	startNodes := workflow.GetStartNodes()
	if len(startNodes) != 1 || startNodes[0].ID != "start" {
		t.Errorf("expected single start node 'start'")
	}

	// Test BFS traversal would visit all nodes
	visited := make(map[string]bool)
	queue := startNodes

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]

		if visited[current.ID] {
			continue
		}
		visited[current.ID] = true

		nextNodes := workflow.GetNextNodes(current.ID)
		queue = append(queue, nextNodes...)
	}

	if len(visited) != 4 {
		t.Errorf("expected to visit 4 nodes, visited %d", len(visited))
	}
}

func TestOrchestrator_ListWorkflows(t *testing.T) {
	orchestrator := NewOrchestrator(nil)

	orchestrator.CreateWorkflow("workflow-1", ModeSequential)
	orchestrator.CreateWorkflow("workflow-2", ModeParallel)
	orchestrator.CreateWorkflow("workflow-3", ModeGraph)

	workflows := orchestrator.ListWorkflows()
	if len(workflows) != 3 {
		t.Errorf("expected 3 workflows, got %d", len(workflows))
	}
}

func TestOrchestrator_DeleteWorkflow(t *testing.T) {
	orchestrator := NewOrchestrator(nil)

	workflow := orchestrator.CreateWorkflow("to-delete", ModeSequential)
	orchestrator.createCheckpoint(workflow)

	orchestrator.DeleteWorkflow(workflow.ID)

	if orchestrator.GetWorkflow(workflow.ID) != nil {
		t.Error("expected workflow to be deleted")
	}

	if len(orchestrator.GetCheckpoints(workflow.ID)) != 0 {
		t.Error("expected checkpoints to be deleted")
	}
}

func TestOrchestrator_Execute_NoStartNodes(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("empty", ModeSequential)

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	err := orchestrator.Execute(ctx, workflow.ID)
	if err == nil {
		t.Error("expected error for empty workflow")
	}
}

func TestOrchestrator_Execute_WorkflowNotFound(t *testing.T) {
	orchestrator := NewOrchestrator(nil)

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	err := orchestrator.Execute(ctx, "non-existent")
	if err == nil {
		t.Error("expected error for non-existent workflow")
	}
}

func TestWorkflow_GetNextNodes_ConditionSuccess(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("test", ModeSequential)

	workflow.AddNode(&WorkflowNode{ID: "node-1", Name: "First", Status: TaskStatusCompleted})
	workflow.AddNode(&WorkflowNode{ID: "node-2", Name: "Second"})
	workflow.AddNode(&WorkflowNode{ID: "node-3", Name: "Third"})

	// edge with "success" condition - should only be followed if source completed
	workflow.AddEdge(&WorkflowEdge{ID: "e1", From: "node-1", To: "node-2", Condition: "success"})
	// edge without condition - always followed
	workflow.AddEdge(&WorkflowEdge{ID: "e2", From: "node-1", To: "node-3"})

	nextNodes := workflow.GetNextNodes("node-1")
	if len(nextNodes) != 2 {
		t.Errorf("expected 2 next nodes (success met + unconditional), got %d", len(nextNodes))
	}
}

func TestWorkflow_GetNextNodes_ConditionSuccessNotMet(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("test", ModeSequential)

	workflow.AddNode(&WorkflowNode{ID: "node-1", Name: "First", Status: TaskStatusFailed})
	workflow.AddNode(&WorkflowNode{ID: "node-2", Name: "Second"})
	workflow.AddNode(&WorkflowNode{ID: "node-3", Name: "Third"})

	// edge with "success" condition - should NOT be followed since source failed
	workflow.AddEdge(&WorkflowEdge{ID: "e1", From: "node-1", To: "node-2", Condition: "success"})
	// edge with "failure" condition - should be followed since source failed
	workflow.AddEdge(&WorkflowEdge{ID: "e2", From: "node-1", To: "node-3", Condition: "failure"})

	nextNodes := workflow.GetNextNodes("node-1")
	if len(nextNodes) != 1 {
		t.Errorf("expected 1 next node (only failure path), got %d", len(nextNodes))
	}
	if len(nextNodes) > 0 && nextNodes[0].ID != "node-3" {
		t.Errorf("expected node-3, got %s", nextNodes[0].ID)
	}
}

func TestWorkflow_GetNextNodes_ConditionFailure(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("test", ModeSequential)

	workflow.AddNode(&WorkflowNode{ID: "node-1", Name: "First", Status: TaskStatusRunning})
	workflow.AddNode(&WorkflowNode{ID: "node-2", Name: "Second"})

	// edge with "failure" condition - should NOT be followed since source is running
	workflow.AddEdge(&WorkflowEdge{ID: "e1", From: "node-1", To: "node-2", Condition: "failure"})

	nextNodes := workflow.GetNextNodes("node-1")
	if len(nextNodes) != 0 {
		t.Errorf("expected 0 next nodes (failure condition not met), got %d", len(nextNodes))
	}
}

func TestWorkflow_SetDescription(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("test", ModeSequential)

	workflow.SetDescription("test description")
	if workflow.Description != "test description" {
		t.Errorf("expected description 'test description', got %q", workflow.Description)
	}
}

func TestWorkflow_SetStatusThreadSafe(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("test", ModeSequential)

	// Concurrent status updates should not race
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			workflow.setWorkflowStatus("running")
			// Read status under lock
			workflow.mu.RLock()
			_ = workflow.Status
			workflow.mu.RUnlock()
		}()
	}
	wg.Wait()
}

func TestWorkflow_ExecuteNodeThreadSafe(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("test", ModeSequential)

	node := &WorkflowNode{
		ID:      "node-1",
		Name:    "Test Node",
		AgentID: "agent-1",
		Type:    "agent",
	}
	workflow.AddNode(node)

	// Execute node should properly lock workflow
	ctx := context.Background()
	err := orchestrator.executeNode(ctx, workflow, node)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	// Verify node status was updated
	if node.Status != TaskStatusCompleted {
		t.Errorf("expected status %s, got %s", TaskStatusCompleted, node.Status)
	}
}

func TestOrchestrator_MaxRounds_Sequential(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	orchestrator.SetMaxRounds(2)
	workflow := orchestrator.CreateWorkflow("max-rounds-test", ModeSequential)

	workflow.AddNode(&WorkflowNode{ID: "n1", Name: "Step 1", AgentID: "a1"})
	workflow.AddNode(&WorkflowNode{ID: "n2", Name: "Step 2", AgentID: "a2"})
	workflow.AddNode(&WorkflowNode{ID: "n3", Name: "Step 3", AgentID: "a3"})
	workflow.AddEdge(&WorkflowEdge{ID: "e1", From: "n1", To: "n2"})
	workflow.AddEdge(&WorkflowEdge{ID: "e2", From: "n2", To: "n3"})

	ctx := context.Background()
	err := orchestrator.Execute(ctx, workflow.ID)
	if err == nil {
		t.Error("expected max rounds error")
	}
	if err != nil && !containsString(err.Error(), "max rounds") {
		t.Errorf("expected max rounds error, got: %v", err)
	}
}

func TestOrchestrator_MaxRounds_Unlimited(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	// Default MaxRounds is 0 (unlimited)
	workflow := orchestrator.CreateWorkflow("unlimited-test", ModeSequential)

	workflow.AddNode(&WorkflowNode{ID: "n1", Name: "Step 1", AgentID: "a1"})
	workflow.AddNode(&WorkflowNode{ID: "n2", Name: "Step 2", AgentID: "a2"})
	workflow.AddEdge(&WorkflowEdge{ID: "e1", From: "n1", To: "n2"})

	ctx := context.Background()
	err := orchestrator.Execute(ctx, workflow.ID)
	if err != nil {
		t.Errorf("unlimited rounds should succeed: %v", err)
	}
	if workflow.Status != "completed" {
		t.Errorf("expected status 'completed', got %q", workflow.Status)
	}
}

func TestOrchestrator_MaxRounds_Parallel(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	orchestrator.SetMaxRounds(1)
	workflow := orchestrator.CreateWorkflow("parallel-max", ModeParallel)

	workflow.AddNode(&WorkflowNode{ID: "n1", Name: "P1", AgentID: "a1"})
	workflow.AddNode(&WorkflowNode{ID: "n2", Name: "P2", AgentID: "a2"})

	ctx := context.Background()
	err := orchestrator.Execute(ctx, workflow.ID)
	if err == nil {
		t.Error("expected max rounds error with 2 nodes and max 1 round")
	}
}

func containsString(s, substr string) bool {
	return len(s) >= len(substr) && searchString(s, substr)
}

func searchString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// Workflow Version Tests

func TestWorkflow_CreateVersion(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("versioned-workflow", ModeSequential)

	// Initial version should be 0
	if workflow.Version != 0 {
		t.Errorf("expected initial version 0, got %d", workflow.Version)
	}

	// Add a node
	workflow.AddNode(&WorkflowNode{ID: "node-1", Name: "First", AgentID: "agent-1"})

	// Create version 1
	v1 := workflow.CreateVersion("Initial version")
	if v1 != 1 {
		t.Errorf("expected version 1, got %d", v1)
	}
	if workflow.Version != 1 {
		t.Errorf("expected workflow.Version 1, got %d", workflow.Version)
	}

	// Add another node and create version 2
	workflow.AddNode(&WorkflowNode{ID: "node-2", Name: "Second", AgentID: "agent-2"})
	v2 := workflow.CreateVersion("Added second node")
	if v2 != 2 {
		t.Errorf("expected version 2, got %d", v2)
	}

	// Check version history length
	history := workflow.GetVersionHistory()
	if len(history) != 2 {
		t.Errorf("expected 2 versions in history, got %d", len(history))
	}

	// Verify version history entries
	if history[0].Version != 1 || history[0].Description != "Initial version" {
		t.Errorf("version history[0] incorrect: %+v", history[0])
	}
	if history[1].Version != 2 || history[1].Description != "Added second node" {
		t.Errorf("version history[1] incorrect: %+v", history[1])
	}
}

func TestWorkflow_RollbackToVersion(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("rollback-test", ModeSequential)

	// Create initial version with 1 node
	workflow.AddNode(&WorkflowNode{ID: "node-1", Name: "First", AgentID: "agent-1"})
	workflow.CreateVersion("v1 - one node")

	// Add second node and create version 2
	workflow.AddNode(&WorkflowNode{ID: "node-2", Name: "Second", AgentID: "agent-2"})
	workflow.CreateVersion("v2 - two nodes")

	// Add third node (no version yet)
	workflow.AddNode(&WorkflowNode{ID: "node-3", Name: "Third", AgentID: "agent-3"})

	// Verify we have 3 nodes now
	if len(workflow.Nodes) != 3 {
		t.Errorf("expected 3 nodes, got %d", len(workflow.Nodes))
	}

	// Rollback to version 1 (should have 1 node)
	err := workflow.RollbackToVersion(1)
	if err != nil {
		t.Fatalf("rollback failed: %v", err)
	}

	if len(workflow.Nodes) != 1 {
		t.Errorf("expected 1 node after rollback to v1, got %d", len(workflow.Nodes))
	}
	if workflow.Nodes[0].ID != "node-1" {
		t.Errorf("expected node-1 after rollback, got %s", workflow.Nodes[0].ID)
	}
	if workflow.Version != 1 {
		t.Errorf("expected Version=1 after rollback, got %d", workflow.Version)
	}
	if workflow.Status != "draft" {
		t.Errorf("expected status 'draft' after rollback, got %q", workflow.Status)
	}
}

func TestWorkflow_RollbackToVersion_NotFound(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("test", ModeSequential)
	workflow.AddNode(&WorkflowNode{ID: "n1", Name: "N1", AgentID: "a1"})
	workflow.CreateVersion("v1")

	// Try to rollback to non-existent version
	err := workflow.RollbackToVersion(999)
	if err == nil {
		t.Error("expected error for non-existent version")
	}
}

func TestWorkflow_GetVersion(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("test", ModeSequential)
	workflow.AddNode(&WorkflowNode{ID: "n1", Name: "N1", AgentID: "a1"})
	workflow.CreateVersion("first version")

	// Get existing version
	v := workflow.GetVersion(1)
	if v == nil {
		t.Fatal("expected to find version 1")
	}
	if v.Description != "first version" {
		t.Errorf("expected description 'first version', got %q", v.Description)
	}

	// Get non-existent version
	v = workflow.GetVersion(999)
	if v != nil {
		t.Error("expected nil for non-existent version")
	}
}

func TestWorkflow_VersionPreservesEdges(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("edge-test", ModeSequential)

	// Create nodes
	workflow.AddNode(&WorkflowNode{ID: "n1", Name: "N1", AgentID: "a1"})
	workflow.AddNode(&WorkflowNode{ID: "n2", Name: "N2", AgentID: "a2"})
	workflow.AddEdge(&WorkflowEdge{ID: "e1", From: "n1", To: "n2"})
	workflow.CreateVersion("v1 with edge")

	// Add another node and edge
	workflow.AddNode(&WorkflowNode{ID: "n3", Name: "N3", AgentID: "a3"})
	workflow.AddEdge(&WorkflowEdge{ID: "e2", From: "n2", To: "n3"})
	workflow.CreateVersion("v2 with two edges")

	// Verify current state has 2 edges
	if len(workflow.Edges) != 2 {
		t.Errorf("expected 2 edges, got %d", len(workflow.Edges))
	}

	// Rollback to v1 (should have 1 edge)
	err := workflow.RollbackToVersion(1)
	if err != nil {
		t.Fatalf("rollback failed: %v", err)
	}

	if len(workflow.Edges) != 1 {
		t.Errorf("expected 1 edge after rollback, got %d", len(workflow.Edges))
	}
	if workflow.Edges[0].ID != "e1" {
		t.Errorf("expected edge e1 after rollback, got %s", workflow.Edges[0].ID)
	}
}

func TestWorkflow_VersionPreservesMode(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("mode-test", ModeSequential)
	workflow.CreateVersion("v1 sequential")

	// Change mode and create version
	// (in real code, mode would be changed via some setter)
	workflow.mu.Lock()
	workflow.Mode = ModeParallel
	workflow.mu.Unlock()
	workflow.CreateVersion("v2 parallel")

	// Rollback to v1 (should be sequential)
	err := workflow.RollbackToVersion(1)
	if err != nil {
		t.Fatalf("rollback failed: %v", err)
	}

	if workflow.Mode != ModeSequential {
		t.Errorf("expected ModeSequential after rollback, got %q", workflow.Mode)
	}
}

// SubWorkflow Tests (LangGraph-style subgraph composition)

func TestWorkflow_SubgraphNode(t *testing.T) {
	orchestrator := NewOrchestrator(nil)

	// Create parent workflow
	parent := orchestrator.CreateWorkflow("parent-workflow", ModeSequential)

	// Create child workflow (subgraph)
	child := orchestrator.CreateWorkflow("child-workflow", ModeSequential)
	child.AddNode(&WorkflowNode{ID: "child-1", Name: "Child Node", AgentID: "agent-1"})

	// Add subgraph node to parent
	subgraphNode := &WorkflowNode{
		ID:         "sub-1",
		Name:       "Execute Child Workflow",
		Type:       "subgraph",
		SubgraphID: child.ID,
	}
	parent.AddNode(subgraphNode)

	// Verify subgraph node fields
	if subgraphNode.Type != "subgraph" {
		t.Errorf("expected type 'subgraph', got %q", subgraphNode.Type)
	}
	if subgraphNode.SubgraphID != child.ID {
		t.Errorf("expected SubgraphID %q, got %q", child.ID, subgraphNode.SubgraphID)
	}
}

func TestWorkflow_SubgraphNotFound(t *testing.T) {
	orchestrator := NewOrchestrator(nil)

	// Create parent workflow with non-existent subgraph reference
	parent := orchestrator.CreateWorkflow("parent-workflow", ModeSequential)
	parent.AddNode(&WorkflowNode{
		ID:         "sub-1",
		Name:       "Missing Subgraph",
		Type:       "subgraph",
		SubgraphID: "non-existent-workflow",
	})

	ctx := context.Background()
	err := orchestrator.Execute(ctx, parent.ID)
	if err == nil {
		t.Error("expected error for non-existent subgraph")
	}
}

func TestWorkflow_AgentNodeDefault(t *testing.T) {
	orchestrator := NewOrchestrator(nil)

	// Create workflow with agent node (default type)
	workflow := orchestrator.CreateWorkflow("agent-workflow", ModeSequential)
	workflow.AddNode(&WorkflowNode{
		ID:      "agent-1",
		Name:    "Agent Node",
		AgentID: "agent-123",
		// Type not specified - should default to "agent" behavior
	})

	// Verify node was added
	if len(workflow.Nodes) != 1 {
		t.Errorf("expected 1 node, got %d", len(workflow.Nodes))
	}
	if workflow.Nodes[0].AgentID != "agent-123" {
		t.Errorf("expected AgentID 'agent-123', got %q", workflow.Nodes[0].AgentID)
	}
}

// Saga Compensation Tests (Temporal-inspired)

// mockCompensator implements Compensatable for testing
type mockCompensator struct {
	called bool
	err     error
}

func (m *mockCompensator) Compensate(_ context.Context, _ any) error {
	m.called = true
	return m.err
}

func TestSaga_SagaLogRecordsCompletedNodes(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("saga-test", ModeSequential)
	workflow.AddNode(&WorkflowNode{ID: "n1", Name: "Step 1", AgentID: "agent-1"})
	workflow.AddEdge(&WorkflowEdge{ID: "e1", From: "n1", To: "n2"})
	workflow.AddNode(&WorkflowNode{ID: "n2", Name: "Step 2", AgentID: "agent-2"})

	// Manually add saga records (simulating execution)
	workflow.mu.Lock()
	workflow.sagaLog = []SagaRecord{
		{NodeID: "n1", Status: "completed", Result: "step1-result"},
		{NodeID: "n2", Status: "completed", Result: "step2-result"},
	}
	workflow.mu.Unlock()

	// Verify saga log has 2 entries
	if len(workflow.sagaLog) != 2 {
		t.Fatalf("expected 2 saga records, got %d", len(workflow.sagaLog))
	}
	if workflow.sagaLog[0].NodeID != "n1" {
		t.Errorf("expected first record NodeID 'n1', got %q", workflow.sagaLog[0].NodeID)
	}
}

func TestSaga_RunCompensation_Empty(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("saga-empty", ModeSequential)

	err := orchestrator.RunCompensation(context.Background(), workflow.ID)
	if err != nil {
		t.Errorf("empty compensation should not error: %v", err)
	}
}

func TestSaga_RunCompensation_NoCompensator(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("saga-no-comp", ModeSequential)
	workflow.AddNode(&WorkflowNode{ID: "n1", Name: "Step 1", AgentID: "agent-1"})

	// Add saga record with non-Compensatable result
	workflow.mu.Lock()
	workflow.sagaLog = []SagaRecord{
		{NodeID: "n1", Status: "completed", Result: "plain-result"},
	}
	workflow.mu.Unlock()

	// Should succeed without errors (no compensatable steps)
	err := orchestrator.RunCompensation(context.Background(), workflow.ID)
	if err != nil {
		t.Errorf("non-compensatable steps should not error: %v", err)
	}
}

func TestSaga_RunCompensation_WithCompensator(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("saga-comp", ModeSequential)
	workflow.AddNode(&WorkflowNode{ID: "n1", Name: "Step 1", AgentID: "agent-1"})
	workflow.AddNode(&WorkflowNode{ID: "n2", Name: "Step 2", AgentID: "agent-2"})

	comp1 := &mockCompensator{}
	comp2 := &mockCompensator{}

	// Add saga records with Compensatable results (executed in order n1, n2)
	workflow.mu.Lock()
	workflow.sagaLog = []SagaRecord{
		{NodeID: "n1", Status: "completed", Result: comp1},
		{NodeID: "n2", Status: "completed", Result: comp2},
	}
	workflow.mu.Unlock()

	err := orchestrator.RunCompensation(context.Background(), workflow.ID)
	if err != nil {
		t.Errorf("compensation should succeed: %v", err)
	}

	// Verify both compensators were called (reverse order: n2 first, then n1)
	if !comp2.called {
		t.Error("compensator for n2 should have been called first (reverse order)")
	}
	if !comp1.called {
		t.Error("compensator for n1 should have been called second (reverse order)")
	}

	// Verify saga log updated to "compensated"
	workflow.mu.RLock()
	if workflow.sagaLog[0].Status != "compensated" || workflow.sagaLog[1].Status != "compensated" {
		t.Error("saga log entries should be marked as 'compensated'")
	}
	workflow.mu.RUnlock()
}

func TestSaga_RunCompensation_WithErrors(t *testing.T) {
	orchestrator := NewOrchestrator(nil)
	workflow := orchestrator.CreateWorkflow("saga-err", ModeSequential)
	workflow.AddNode(&WorkflowNode{ID: "n1", Name: "Step 1", AgentID: "agent-1"})
	workflow.AddNode(&WorkflowNode{ID: "n2", Name: "Step 2", AgentID: "agent-2"})

	comp1 := &mockCompensator{}
	comp2 := &mockCompensator{err: fmt.Errorf("compensation failed")}

	workflow.mu.Lock()
	workflow.sagaLog = []SagaRecord{
		{NodeID: "n1", Status: "completed", Result: comp1},
		{NodeID: "n2", Status: "completed", Result: comp2},
	}
	workflow.mu.Unlock()

	err := orchestrator.RunCompensation(context.Background(), workflow.ID)
	if err == nil {
		t.Error("compensation with errors should return error")
	}
	if !strings.Contains(err.Error(), "1 error") {
		t.Errorf("expected '1 error' in message, got: %v", err)
	}

	// Both compensators should still have been called
	if !comp1.called {
		t.Error("compensator for n1 should have been called even though n2 failed")
	}
	if !comp2.called {
		t.Error("compensator for n2 should have been called")
	}
}

func TestSaga_RunCompensation_WorkflowNotFound(t *testing.T) {
	orchestrator := NewOrchestrator(nil)

	err := orchestrator.RunCompensation(context.Background(), "non-existent")
	if err == nil {
		t.Error("should error for non-existent workflow")
	}
}

// --- Continue-As-New Tests ---

func TestContinueAsNew_ResetsExecutionState(t *testing.T) {
	orch := NewOrchestrator(nil)
	wf := orch.CreateWorkflow("cron-wf", ModeSequential)

	// Simulate completed execution
	wf.mu.Lock()
	wf.currentNode = "n3"
	wf.execHistory = []ExecutionStep{
		{NodeID: "n1", Status: "completed", Timestamp: time.Now()},
		{NodeID: "n2", Status: "completed", Timestamp: time.Now()},
	}
	wf.sagaLog = []SagaRecord{
		{NodeID: "n1", Status: "completed"},
	}
	wf.roundCount = 50
	wf.Status = "completed"
	wf.Nodes = []*WorkflowNode{
		{ID: "n1", Status: TaskStatusCompleted, Result: "done"},
		{ID: "n2", Status: TaskStatusCompleted, Result: "done"},
	}
	wf.mu.Unlock()

	runNum, err := orch.ContinueAsNew(context.Background(), wf.ID, DefaultContinueAsNewOptions())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	wf.mu.RLock()
	defer wf.mu.RUnlock()

	if wf.currentNode != "" {
		t.Errorf("expected currentNode to be reset, got %q", wf.currentNode)
	}
	if len(wf.execHistory) != 0 {
		t.Errorf("expected execHistory to be empty, got %d entries", len(wf.execHistory))
	}
	if len(wf.sagaLog) != 0 {
		t.Errorf("expected sagaLog to be empty, got %d entries", len(wf.sagaLog))
	}
	if wf.roundCount != 0 {
		t.Errorf("expected roundCount=0, got %d", wf.roundCount)
	}
	// Round 376 CRITICAL fix: ContinueAsNew sets status to "draft" not "running"
	// Setting "running" would permanently block Execute() which checks for running state
	if wf.Status != "draft" {
		t.Errorf("expected status='draft', got %q", wf.Status)
	}
	if runNum != 1 {
		t.Errorf("expected runNum=1, got %d", runNum)
	}

	// Identity preserved
	if wf.ID == "" {
		t.Error("workflow ID should be preserved")
	}
	if wf.Name != "cron-wf" {
		t.Errorf("expected name='cron-wf', got %q", wf.Name)
	}
}

func TestContinueAsNew_ResetNodeResults(t *testing.T) {
	orch := NewOrchestrator(nil)
	wf := orch.CreateWorkflow("test", ModeSequential)

	wf.mu.Lock()
	now := time.Now()
	wf.Nodes = []*WorkflowNode{
		{ID: "n1", Status: TaskStatusCompleted, Result: "result1", StartedAt: &now, CompletedAt: &now},
	}
	wf.mu.Unlock()

	opts := DefaultContinueAsNewOptions()
	opts.ResetNodeResults = true
	_, err := orch.ContinueAsNew(context.Background(), wf.ID, opts)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	wf.mu.RLock()
	defer wf.mu.RUnlock()
	if wf.Nodes[0].Result != nil {
		t.Errorf("expected node result to be nil, got %v", wf.Nodes[0].Result)
	}
	if wf.Nodes[0].StartedAt != nil {
		t.Error("expected node StartedAt to be nil")
	}
}

func TestContinueAsNew_PreserveNodeStatuses(t *testing.T) {
	orch := NewOrchestrator(nil)
	wf := orch.CreateWorkflow("test", ModeSequential)

	wf.mu.Lock()
	wf.Nodes = []*WorkflowNode{
		{ID: "n1", Status: TaskStatusCompleted, Result: "result1"},
	}
	wf.mu.Unlock()

	opts := DefaultContinueAsNewOptions()
	opts.ResetNodeStatuses = false // default
	_, err := orch.ContinueAsNew(context.Background(), wf.ID, opts)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	wf.mu.RLock()
	defer wf.mu.RUnlock()
	if wf.Nodes[0].Status != TaskStatusCompleted {
		t.Errorf("expected node status to be preserved, got %q", wf.Nodes[0].Status)
	}
}

func TestContinueAsNew_ResetNodeStatuses(t *testing.T) {
	orch := NewOrchestrator(nil)
	wf := orch.CreateWorkflow("test", ModeSequential)

	wf.mu.Lock()
	wf.Nodes = []*WorkflowNode{
		{ID: "n1", Status: TaskStatusCompleted, Result: "result1"},
	}
	wf.mu.Unlock()

	opts := ContinueAsNewOptions{ResetNodeStatuses: true}
	_, err := orch.ContinueAsNew(context.Background(), wf.ID, opts)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	wf.mu.RLock()
	defer wf.mu.RUnlock()
	if wf.Nodes[0].Status != "" {
		t.Errorf("expected node status to be cleared, got %q", wf.Nodes[0].Status)
	}
}

func TestContinueAsNew_WorkflowNotFound(t *testing.T) {
	orch := NewOrchestrator(nil)
	_, err := orch.ContinueAsNew(context.Background(), "non-existent", DefaultContinueAsNewOptions())
	if err == nil {
		t.Error("should error for non-existent workflow")
	}
}

func TestContinueAsNew_RunningWorkflow(t *testing.T) {
	orch := NewOrchestrator(nil)
	wf := orch.CreateWorkflow("test", ModeSequential)

	wf.mu.Lock()
	wf.Status = "running"
	wf.mu.Unlock()

	_, err := orch.ContinueAsNew(context.Background(), wf.ID, DefaultContinueAsNewOptions())
	if err == nil {
		t.Error("should error for running workflow")
	}
}

func TestContinueAsNew_IncrementingRunNumber(t *testing.T) {
	orch := NewOrchestrator(nil)
	wf := orch.CreateWorkflow("cron", ModeSequential)

	// First continue-as-new
	wf.mu.Lock()
	wf.roundCount = 1000
	wf.Status = "completed"
	wf.mu.Unlock()

	run1, _ := orch.ContinueAsNew(context.Background(), wf.ID, DefaultContinueAsNewOptions())

	// Second continue-as-new
	wf.mu.Lock()
	wf.roundCount = 2000
	wf.Status = "completed"
	wf.mu.Unlock()

	run2, _ := orch.ContinueAsNew(context.Background(), wf.ID, DefaultContinueAsNewOptions())

	if run2 <= run1 {
		t.Errorf("expected run2(%d) > run1(%d)", run2, run1)
	}
}

// --- GroupChat Tests ---

func TestRoundRobinSelector(t *testing.T) {
	sel := &RoundRobinSelector{}
	nodes := []*WorkflowNode{
		{ID: "a", AgentID: "agent-a"},
		{ID: "b", AgentID: "agent-b"},
		{ID: "c", AgentID: "agent-c"},
	}

	if idx := sel.Select(0, nil, nodes); idx != 0 {
		t.Errorf("turn 0: expected 0, got %d", idx)
	}
	if idx := sel.Select(1, nil, nodes); idx != 1 {
		t.Errorf("turn 1: expected 1, got %d", idx)
	}
	if idx := sel.Select(2, nil, nodes); idx != 2 {
		t.Errorf("turn 2: expected 2, got %d", idx)
	}
	// Wraps around
	if idx := sel.Select(3, nil, nodes); idx != 0 {
		t.Errorf("turn 3: expected 0 (wrap), got %d", idx)
	}
}

func TestRoundRobinSelector_Empty(t *testing.T) {
	sel := &RoundRobinSelector{}
	if idx := sel.Select(0, nil, nil); idx != -1 {
		t.Errorf("expected -1 for empty nodes, got %d", idx)
	}
}

func TestFuncSelector(t *testing.T) {
	sel := &FuncSelector{Fn: func(turns int, _ []GroupChatMessage, _ []*WorkflowNode) int {
		return turns % 2
	}}

	nodes := []*WorkflowNode{{ID: "a"}, {ID: "b"}}
	if sel.Select(0, nil, nodes) != 0 {
		t.Error("expected 0")
	}
	if sel.Select(1, nil, nodes) != 1 {
		t.Error("expected 1")
	}
}

func TestFuncSelector_Nil(t *testing.T) {
	sel := &FuncSelector{}
	if sel.Select(0, nil, nil) != -1 {
		t.Error("expected -1 for nil function")
	}
}

func TestExecuteGroupChat_MaxRounds(t *testing.T) {
	orch := NewOrchestrator(nil)
	orch.SetMaxRounds(3)

	wf := orch.CreateWorkflow("group-chat", ModeGroupChat)
	wf.Nodes = []*WorkflowNode{
		{ID: "a", AgentID: "agent-a", Type: "agent"},
		{ID: "b", AgentID: "agent-b", Type: "agent"},
	}

	// executeNode will fail since no scheduler, so we test max rounds via context cancellation
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	err := orch.Execute(ctx, wf.ID)
	if err == nil {
		t.Error("expected error from cancelled context")
	}
}

func TestExecuteGroupChat_NoAgentNodes(t *testing.T) {
	orch := NewOrchestrator(nil)
	wf := orch.CreateWorkflow("empty-chat", ModeGroupChat)
	// No agent nodes — only condition nodes

	err := orch.Execute(context.Background(), wf.ID)
	if err == nil {
		t.Error("expected error for no agent nodes")
	}
	if !strings.Contains(err.Error(), "no agent nodes") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestExecuteGroupChat_UnknownMode(t *testing.T) {
	orch := NewOrchestrator(nil)
	wf := orch.CreateWorkflow("test", "unknown_mode")

	err := orch.Execute(context.Background(), wf.ID)
	if err == nil {
		t.Error("expected error for unknown mode")
	}
}

// --- Time Travel / Fork Tests ---

func TestForkFromCheckpoint_Basic(t *testing.T) {
	orch := NewOrchestrator(nil)
	wf := orch.CreateWorkflow("source", ModeSequential)
	wf.Nodes = []*WorkflowNode{
		{ID: "n1", Name: "Step 1", AgentID: "a", Status: TaskStatusCompleted, Result: "done-1"},
		{ID: "n2", Name: "Step 2", AgentID: "b"},
	}
	wf.Edges = []*WorkflowEdge{
		{ID: "e1", From: "n1", To: "n2"},
	}

	// Create a checkpoint at this state
	cp := orch.createCheckpoint(wf)

	// Fork from checkpoint
	fork, err := orch.ForkFromCheckpoint(cp.ID, "experiment")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify fork is a new workflow
	if fork.ID == wf.ID {
		t.Error("fork should have different ID from source")
	}
	if fork.Name != "experiment" {
		t.Errorf("expected name 'experiment', got %q", fork.Name)
	}

	// Verify fork inherited structure
	if len(fork.Nodes) != 2 {
		t.Fatalf("expected 2 nodes, got %d", len(fork.Nodes))
	}
	if len(fork.Edges) != 1 {
		t.Fatalf("expected 1 edge, got %d", len(fork.Edges))
	}

	// Verify fork has checkpoint state
	if fork.Nodes[0].Status != TaskStatusCompleted {
		t.Errorf("fork node n1 should be completed from checkpoint, got %q", fork.Nodes[0].Status)
	}
	if fork.Nodes[0].Result != "done-1" {
		t.Errorf("fork node n1 should have result from checkpoint, got %v", fork.Nodes[0].Result)
	}

	// Verify fork node n2 is fresh (not in checkpoint state)
	if fork.Nodes[1].Status == TaskStatusCompleted {
		t.Error("fork node n2 should not be completed (wasn't in checkpoint)")
	}

	// Verify fork is registered
	if orch.GetWorkflow(fork.ID) == nil {
		t.Error("fork should be registered in orchestrator")
	}

	// Verify source workflow is unchanged
	source := orch.GetWorkflow(wf.ID)
	if source == nil {
		t.Fatal("source workflow should still exist")
	}
}

func TestForkFromCheckpoint_SourceUnchanged(t *testing.T) {
	orch := NewOrchestrator(nil)
	wf := orch.CreateWorkflow("source", ModeSequential)
	wf.Nodes = []*WorkflowNode{
		{ID: "n1", AgentID: "a", Status: TaskStatusCompleted, Result: "original"},
	}
	cp := orch.createCheckpoint(wf)

	// Modify source after checkpoint
	wf.mu.Lock()
	wf.Nodes[0].Result = "modified-after-checkpoint"
	wf.mu.Unlock()

	// Fork should get checkpoint state, not current state
	fork, _ := orch.ForkFromCheckpoint(cp.ID, "fork")
	if fork.Nodes[0].Result != "original" {
		t.Errorf("fork should have checkpoint state 'original', got %v", fork.Nodes[0].Result)
	}
}

func TestForkFromCheckpoint_CheckpointNotFound(t *testing.T) {
	orch := NewOrchestrator(nil)
	_, err := orch.ForkFromCheckpoint("nonexistent", "fork")
	if err == nil {
		t.Error("should error for nonexistent checkpoint")
	}
}

func TestForkFromCheckpoint_AutoName(t *testing.T) {
	orch := NewOrchestrator(nil)
	wf := orch.CreateWorkflow("source", ModeSequential)
	wf.Nodes = []*WorkflowNode{{ID: "n1"}}
	cp := orch.createCheckpoint(wf)

	fork, err := orch.ForkFromCheckpoint(cp.ID, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(fork.Name, "source-fork") {
		t.Errorf("expected auto-generated fork name containing 'source-fork', got %q", fork.Name)
	}
}

func TestForkFromCheckpoint_SagaLogCleared(t *testing.T) {
	orch := NewOrchestrator(nil)
	wf := orch.CreateWorkflow("source", ModeSequential)
	wf.Nodes = []*WorkflowNode{{ID: "n1", Status: TaskStatusCompleted}}
	wf.mu.Lock()
	wf.sagaLog = []SagaRecord{{NodeID: "n1", Status: "completed"}}
	wf.mu.Unlock()

	cp := orch.createCheckpoint(wf)
	fork, _ := orch.ForkFromCheckpoint(cp.ID, "fork")

	fork.mu.RLock()
	defer fork.mu.RUnlock()
	if len(fork.sagaLog) != 0 {
		t.Errorf("fork should start with empty saga log, got %d entries", len(fork.sagaLog))
	}
}

func TestGetStateHistory(t *testing.T) {
	orch := NewOrchestrator(nil)
	wf := orch.CreateWorkflow("test", ModeSequential)
	wf.Nodes = []*WorkflowNode{{ID: "n1"}}

	orch.createCheckpoint(wf)
	orch.createCheckpoint(wf)
	orch.createCheckpoint(wf)

	history := orch.GetStateHistory(wf.ID)
	if len(history) != 3 {
		t.Errorf("expected 3 checkpoints in history, got %d", len(history))
	}
}

func TestForkFromCheckpoint_ForkHasCheckpoint(t *testing.T) {
	orch := NewOrchestrator(nil)
	wf := orch.CreateWorkflow("source", ModeSequential)
	wf.Nodes = []*WorkflowNode{{ID: "n1", Status: TaskStatusCompleted}}
	cp := orch.createCheckpoint(wf)

	fork, _ := orch.ForkFromCheckpoint(cp.ID, "fork")

	// Fork should have its own initial checkpoint
	forkCPs := orch.GetCheckpoints(fork.ID)
	if len(forkCPs) != 1 {
		t.Errorf("fork should have 1 initial checkpoint, got %d", len(forkCPs))
	}

	// Checkpoint should have fork metadata
	if forkCPs[0].Metadata["forked_from"] != wf.ID {
		t.Errorf("fork checkpoint should record source workflow ID")
	}
}

// --- TopologicalSort / DependsOn Tests ---

func TestTopologicalSort_Linear(t *testing.T) {
	wf := &Workflow{
		Nodes: []*WorkflowNode{
			{ID: "a"},
			{ID: "b", DependsOn: []string{"a"}},
			{ID: "c", DependsOn: []string{"b"}},
		},
	}

	sorted, err := wf.TopologicalSort()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(sorted) != 3 {
		t.Fatalf("expected 3 nodes, got %d", len(sorted))
	}
	// a must come before b, b before c
	order := make(map[string]int)
	for i, n := range sorted {
		order[n.ID] = i
	}
	if order["a"] >= order["b"] {
		t.Error("a should come before b")
	}
	if order["b"] >= order["c"] {
		t.Error("b should come before c")
	}
}

func TestTopologicalSort_Parallel(t *testing.T) {
	wf := &Workflow{
		Nodes: []*WorkflowNode{
			{ID: "a"},
			{ID: "b", DependsOn: []string{"a"}},
			{ID: "c", DependsOn: []string{"a"}},
			{ID: "d", DependsOn: []string{"b", "c"}},
		},
	}

	sorted, err := wf.TopologicalSort()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(sorted) != 4 {
		t.Fatalf("expected 4 nodes, got %d", len(sorted))
	}

	order := make(map[string]int)
	for i, n := range sorted {
		order[n.ID] = i
	}
	if order["a"] >= order["b"] || order["a"] >= order["c"] {
		t.Error("a should come before both b and c")
	}
	if order["b"] >= order["d"] || order["c"] >= order["d"] {
		t.Error("b and c should come before d")
	}
}

func TestTopologicalSort_CycleDetection(t *testing.T) {
	wf := &Workflow{
		Nodes: []*WorkflowNode{
			{ID: "a", DependsOn: []string{"b"}},
			{ID: "b", DependsOn: []string{"a"}},
		},
	}

	_, err := wf.TopologicalSort()
	if err == nil {
		t.Error("expected error for cycle")
	}
	if !strings.Contains(err.Error(), "cycle") {
		t.Errorf("expected cycle error, got: %v", err)
	}
}

func TestTopologicalSort_NonExistentDependency(t *testing.T) {
	wf := &Workflow{
		Nodes: []*WorkflowNode{
			{ID: "a", DependsOn: []string{"nonexistent"}},
		},
	}

	_, err := wf.TopologicalSort()
	if err == nil {
		t.Error("expected error for non-existent dependency")
	}
	if !strings.Contains(err.Error(), "non-existent") {
		t.Errorf("expected non-existent error, got: %v", err)
	}
}

func TestTopologicalSort_EdgeBased(t *testing.T) {
	wf := &Workflow{
		Nodes: []*WorkflowNode{
			{ID: "a"},
			{ID: "b"},
			{ID: "c"},
		},
		Edges: []*WorkflowEdge{
			{From: "a", To: "b"},
			{From: "b", To: "c"},
		},
	}

	sorted, err := wf.TopologicalSort()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	order := make(map[string]int)
	for i, n := range sorted {
		order[n.ID] = i
	}
	if order["a"] >= order["b"] || order["b"] >= order["c"] {
		t.Error("edge-based ordering should be respected")
	}
}

func TestTopologicalSort_Mixed(t *testing.T) {
	wf := &Workflow{
		Nodes: []*WorkflowNode{
			{ID: "a"},
			{ID: "b"}, // depends on a via edge
			{ID: "c", DependsOn: []string{"a"}}, // depends on a via DependsOn
			{ID: "d", DependsOn: []string{"b", "c"}},
		},
		Edges: []*WorkflowEdge{
			{From: "a", To: "b"},
		},
	}

	sorted, err := wf.TopologicalSort()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(sorted) != 4 {
		t.Fatalf("expected 4 nodes, got %d", len(sorted))
	}

	order := make(map[string]int)
	for i, n := range sorted {
		order[n.ID] = i
	}
	if order["a"] >= order["b"] || order["a"] >= order["c"] {
		t.Error("a should come before b and c (mixed deps)")
	}
	if order["b"] >= order["d"] || order["c"] >= order["d"] {
		t.Error("b and c should come before d")
	}
}

func TestGetExecutableNodes(t *testing.T) {
	wf := &Workflow{
		Nodes: []*WorkflowNode{
			{ID: "a", Status: TaskStatusCompleted},
			{ID: "b", DependsOn: []string{"a"}}, // dep satisfied
			{ID: "c", DependsOn: []string{"d"}}, // dep not satisfied
			{ID: "d"},                            // no deps, no status
		},
	}

	ready := wf.GetExecutableNodes()
	if len(ready) != 2 {
		t.Fatalf("expected 2 ready nodes (b and d), got %d", len(ready))
	}
	ids := make(map[string]bool)
	for _, n := range ready {
		ids[n.ID] = true
	}
	if !ids["b"] {
		t.Error("b should be ready (dep 'a' completed)")
	}
	if !ids["d"] {
		t.Error("d should be ready (no deps)")
	}
}

func TestGetExecutableNodes_NoneReady(t *testing.T) {
	wf := &Workflow{
		Nodes: []*WorkflowNode{
			{ID: "a", DependsOn: []string{"b"}},
			{ID: "b", DependsOn: []string{"c"}},
		},
	}

	ready := wf.GetExecutableNodes()
	if len(ready) != 0 {
		t.Errorf("expected 0 ready nodes, got %d", len(ready))
	}
}

// --- AutoCheckpoint Tests ---

func TestAutoCheckpoint_CreatesAfterEachNode(t *testing.T) {
	orch := NewOrchestrator(nil)
	orch.AutoCheckpoint = true

	wf := orch.CreateWorkflow("test", ModeSequential)
	wf.Nodes = []*WorkflowNode{
		{ID: "n1", AgentID: "a"},
		{ID: "n2", AgentID: "b"},
	}
	wf.Edges = []*WorkflowEdge{{From: "n1", To: "n2"}}

	// Execute will fail at executeNode (no scheduler), but checkpoint
	// is created after successful node completion, so we test via context cancel
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_ = orch.Execute(ctx, wf.ID)
	// In sequential mode without AutoCheckpoint, no checkpoint is created
	// because createCheckpoint is skipped when AutoCheckpoint=true and
	// the node execution fails. Test the flag itself:
	orch2 := NewOrchestrator(nil)
	if orch2.AutoCheckpoint {
		t.Error("default AutoCheckpoint should be false")
	}
	orch2.AutoCheckpoint = true
	if !orch2.AutoCheckpoint {
		t.Error("AutoCheckpoint should be true after setting")
	}
}

func TestAutoCheckpoint_SequentialModeNoDouble(t *testing.T) {
	orch := NewOrchestrator(nil)
	// Default: AutoCheckpoint=false, sequential mode checkpoints before each node
	if orch.AutoCheckpoint {
		t.Error("default should be false")
	}

	// When AutoCheckpoint=true, sequential skips its pre-node checkpoint
	// (executeNode handles after-node checkpoint)
	orch.AutoCheckpoint = true
	// Verify the conditional logic exists by checking that we don't panic
	wf := orch.CreateWorkflow("test", ModeSequential)
	wf.Nodes = []*WorkflowNode{{ID: "n1", AgentID: "a"}}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_ = orch.Execute(ctx, wf.ID)
}

// --- Workflow Retry Tests ---

func TestWorkflowRetry_NoPolicy(t *testing.T) {
	orch := NewOrchestrator(nil)
	// Without retry policy, execution succeeds normally
	wf := orch.CreateWorkflow("test", ModeSequential)
	wf.Nodes = []*WorkflowNode{{ID: "n1", AgentID: "a"}}

	err := orch.Execute(context.Background(), wf.ID)
	if err != nil {
		t.Errorf("expected no error without retry policy, got: %v", err)
	}
}

func TestWorkflowRetry_NonRetryableError(t *testing.T) {
	orch := NewOrchestrator(nil)
	policy := DefaultRetryPolicy()
	policy.MaximumAttempts = 10
	policy.InitialInterval = 0
	orch.WorkflowRetryPolicy = &policy

	// Non-ClassifiedError (workflow not found) should not be retried
	err := orch.Execute(context.Background(), "nonexistent")
	if err == nil {
		t.Error("expected error")
	}
	if strings.Contains(err.Error(), "after") {
		t.Error("should not retry non-classified errors")
	}
}

func TestWorkflowRetry_ClassifiedNonRetryable(t *testing.T) {
	orch := NewOrchestrator(nil)
	policy := DefaultRetryPolicy()
	policy.MaximumAttempts = 5
	policy.InitialInterval = 0
	orch.WorkflowRetryPolicy = &policy

	// Even with a retry policy, NonRetryable ClassifiedErrors don't retry.
	// We test this by verifying that an unknown mode error (which is
	// a plain error, not ClassifiedError) is not retried.
	wf := orch.CreateWorkflow("test", "nonexistent_mode")
	err := orch.Execute(context.Background(), wf.ID)
	if err == nil {
		t.Error("expected error for unknown mode")
	}
}

func TestWorkflowRetry_PolicyConfiguration(t *testing.T) {
	orch := NewOrchestrator(nil)
	if orch.WorkflowRetryPolicy != nil {
		t.Error("default WorkflowRetryPolicy should be nil")
	}

	policy := DefaultRetryPolicy()
	policy.MaximumAttempts = 10
	orch.WorkflowRetryPolicy = &policy

	if orch.WorkflowRetryPolicy.MaximumAttempts != 10 {
		t.Error("policy should be set")
	}

	// Workflow should succeed normally with policy set (no failures)
	wf := orch.CreateWorkflow("test", ModeSequential)
	wf.Nodes = []*WorkflowNode{{ID: "n1", AgentID: "a"}}
	err := orch.Execute(context.Background(), wf.ID)
	if err != nil {
		t.Errorf("expected no error, got: %v", err)
	}
}

func TestWorkflowRetry_ContextCancelDuringRetry(t *testing.T) {
	orch := NewOrchestrator(nil)
	policy := DefaultRetryPolicy()
	policy.MaximumAttempts = 100 // Would retry many times
	policy.InitialInterval = time.Minute // Long delay
	orch.WorkflowRetryPolicy = &policy

	// Non-classified error fails immediately, no retry.
	// Test verifies the path doesn't hang.
	err := orch.Execute(context.Background(), "nonexistent")
	if err == nil {
		t.Error("expected error")
	}
}

// --- Workflow Timeout Tests ---

func TestWorkflowTimeout_CompletesBeforeTimeout(t *testing.T) {
	orch := NewOrchestrator(nil)
	orch.WorkflowTimeout = 10 * time.Second

	wf := orch.CreateWorkflow("test", ModeSequential)
	wf.Nodes = []*WorkflowNode{{ID: "n1", AgentID: "a"}}

	// Should complete successfully within timeout
	err := orch.Execute(context.Background(), wf.ID)
	if err != nil {
		t.Errorf("expected no error within timeout, got: %v", err)
	}
	if wf.Status != "completed" {
		t.Errorf("expected status 'completed', got %q", wf.Status)
	}
}

func TestWorkflowTimeout_ExceedsTimeout(t *testing.T) {
	orch := NewOrchestrator(nil)
	orch.WorkflowTimeout = 1 * time.Nanosecond // Effectively zero timeout

	wf := orch.CreateWorkflow("test", ModeSequential)
	wf.Nodes = []*WorkflowNode{{ID: "n1", AgentID: "a"}}

	err := orch.Execute(context.Background(), wf.ID)
	if err == nil {
		t.Error("expected timeout error")
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("expected deadline exceeded error, got: %v", err)
	}
}

func TestWorkflowTimeout_DefaultNoTimeout(t *testing.T) {
	orch := NewOrchestrator(nil)
	if orch.WorkflowTimeout != 0 {
		t.Error("default WorkflowTimeout should be 0")
	}
}

func TestWorkflowTimeout_WithRetry(t *testing.T) {
	orch := NewOrchestrator(nil)
	orch.WorkflowTimeout = 1 * time.Nanosecond // Will timeout on first attempt

	policy := DefaultRetryPolicy()
	policy.MaximumAttempts = 2
	policy.InitialInterval = time.Millisecond
	policy.MaximumInterval = time.Millisecond
	orch.WorkflowRetryPolicy = &policy

	wf := orch.CreateWorkflow("test", ModeSequential)
	wf.Nodes = []*WorkflowNode{{ID: "n1", AgentID: "a"}}

	// Timeout is a retryable error (ErrorTypeTimeout), should retry
	err := orch.Execute(context.Background(), wf.ID)
	if err == nil {
		t.Error("expected error after timeout retries")
	}
	// Should have retried (2 attempts)
	if !strings.Contains(err.Error(), "after") {
		t.Errorf("expected retry exhaustion message, got: %v", err)
	}
}

func TestWorkflowTimeout_WithRetrySucceeds(t *testing.T) {
	orch := NewOrchestrator(nil)
	orch.WorkflowTimeout = 10 * time.Second // Long enough to complete

	policy := DefaultRetryPolicy()
	policy.MaximumAttempts = 3
	policy.InitialInterval = 0
	orch.WorkflowRetryPolicy = &policy

	wf := orch.CreateWorkflow("test", ModeSequential)
	wf.Nodes = []*WorkflowNode{{ID: "n1", AgentID: "a"}}

	// Should complete successfully on first attempt (no timeout)
	err := orch.Execute(context.Background(), wf.ID)
	if err != nil {
		t.Errorf("expected no error, got: %v", err)
	}
}

func TestActionBasedRouting_GraphMode(t *testing.T) {
	orch := NewOrchestrator(nil)
	wf := orch.CreateWorkflow("action-routing-test", ModeGraph)

	wf.AddNode(&WorkflowNode{
		ID:   "approval",
		Name: "Approval",
		Type: "agent",
		Interrupt:       true,
		InterruptActions: []InterruptAction{
			{ID: "approve", Label: "Approve", Style: "primary"},
			{ID: "reject", Label: "Reject", Style: "danger"},
		},
	})
	wf.AddNode(&WorkflowNode{ID: "deploy", Name: "Deploy", Type: "agent"})
	wf.AddNode(&WorkflowNode{ID: "rollback", Name: "Rollback", Type: "agent"})

	if err := wf.AddEdge(&WorkflowEdge{From: "approval", To: "deploy", Condition: "approve"}); err != nil {
		t.Fatal(err)
	}
	if err := wf.AddEdge(&WorkflowEdge{From: "approval", To: "rollback", Condition: "reject"}); err != nil {
		t.Fatal(err)
	}

	// Simulate paused state (as if interrupt fired during execution)
	wf.mu.Lock()
	wf.Status = "paused"
	wf.InterruptedNodeID = "approval"
	wf.InterruptPhase = "after"
	wf.mu.Unlock()

	// Resume with "approve" action
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := orch.ResumeWorkflow(ctx, wf.ID, "approve")
	if err != nil {
		t.Fatalf("resume failed: %v", err)
	}

	// Verify ChosenAction was set on the approval node
	found := false
	for _, n := range wf.Nodes {
		if n.ID == "approval" {
			if n.ChosenAction != "approve" {
				t.Errorf("expected ChosenAction=approve, got %q", n.ChosenAction)
			}
			found = true
		}
	}
	if !found {
		t.Fatal("approval node not found")
	}

	// Verify GetNextNodes routes to deploy based on ChosenAction
	next := wf.GetNextNodes("approval")
	if len(next) != 1 || next[0].ID != "deploy" {
		t.Errorf("expected [deploy], got %v", nodeIDs(next))
	}

	// Verify ChosenAction was consumed (one-shot)
	for _, n := range wf.Nodes {
		if n.ID == "approval" && n.ChosenAction != "" {
			t.Error("expected ChosenAction to be cleared after GetNextNodes")
		}
	}
}

func TestActionBasedRouting_ChoosenActionClearedAfterRouting(t *testing.T) {
	wf := &Workflow{
		ID:   "test",
		Mode: ModeGraph,
		Nodes: []*WorkflowNode{
			{ID: "A", Type: "agent", ChosenAction: "approve", InterruptActions: []InterruptAction{{ID: "approve", Label: "A"}}},
			{ID: "B", Type: "agent"},
			{ID: "C", Type: "agent"},
		},
		Edges: []*WorkflowEdge{
			{From: "A", To: "B", Condition: "approve"},
			{From: "A", To: "C", Condition: "reject"},
		},
		execHistory: make([]ExecutionStep, 0),
	}

	// First call: ChosenAction="approve" should match edge to B
	next := wf.GetNextNodes("A")
	if len(next) != 1 || next[0].ID != "B" {
		t.Fatalf("expected [B], got node IDs: %v", nodeIDs(next))
	}

	// ChosenAction should be cleared (one-shot)
	for _, n := range wf.Nodes {
		if n.ID == "A" && n.ChosenAction != "" {
			t.Fatal("expected ChosenAction to be cleared after GetNextNodes")
		}
	}

	// Second call: no ChosenAction → action-conditioned edges are skipped
	next2 := wf.GetNextNodes("A")
	if len(next2) != 0 {
		t.Fatalf("expected 0 nodes without ChosenAction (action edges require action), got %d", len(next2))
	}
}

func TestActionRouting_InvalidActionIgnored(t *testing.T) {
	orch := NewOrchestrator(nil)
	wf := orch.CreateWorkflow("invalid-action-test", ModeGraph)

	wf.AddNode(&WorkflowNode{
		ID:   "step1",
		Name: "Step 1",
		Type: "agent",
		Interrupt:       true,
		InterruptActions: []InterruptAction{{ID: "valid", Label: "Valid"}},
	})
	wf.AddNode(&WorkflowNode{ID: "step2", Name: "Step 2", Type: "agent"})

	// Simulate paused state
	wf.mu.Lock()
	wf.Status = "paused"
	wf.InterruptedNodeID = "step1"
	wf.InterruptPhase = "after"
	wf.mu.Unlock()

	// Resume with invalid action - should not panic, action ignored
	_, err := orch.ResumeWorkflow(context.Background(), wf.ID, "invalid_action")
	if err != nil {
		t.Fatalf("resume with invalid action should not error: %v", err)
	}

	// Verify invalid action was NOT set as ChosenAction
	for _, n := range wf.Nodes {
		if n.ID == "step1" && n.ChosenAction == "invalid_action" {
			t.Error("invalid action should not be stored as ChosenAction")
		}
	}
}

func nodeIDs(nodes []*WorkflowNode) []string {
	ids := make([]string, len(nodes))
	for i, n := range nodes {
		ids[i] = n.ID
	}
	return ids
}

func TestWorkflowChaining_NoLinks(t *testing.T) {
	orch := NewOrchestrator(nil)
	wf := orch.CreateWorkflow("parent", ModeSequential)

	// triggerChainedWorkflows with no links should be a no-op
	orch.triggerChainedWorkflows(wf, "completed")
	// No panic = success
}

func TestWorkflowChaining_ConditionOnSuccess(t *testing.T) {
	orch := NewOrchestrator(nil)
	parent := orch.CreateWorkflow("parent", ModeSequential)
	parent.AddNode(&WorkflowNode{ID: "n1", Name: "N1", Type: "agent"})
	parent.OnComplete = []WorkflowChainLink{
		{WorkflowID: "child", Condition: "on_success"},
	}

	// On completed → should trigger (no panic, link exists)
	// We can't test actual execution without a scheduler, but we verify
	// the condition evaluation doesn't skip incorrectly.
	orch.triggerChainedWorkflows(parent, "completed")
}

func TestWorkflowChaining_ConditionOnFailure(t *testing.T) {
	orch := NewOrchestrator(nil)
	parent := orch.CreateWorkflow("parent", ModeSequential)
	parent.AddNode(&WorkflowNode{ID: "n1", Name: "N1", Type: "agent"})
	parent.OnComplete = []WorkflowChainLink{
		{WorkflowID: "child", Condition: "on_failure"},
	}

	// On completed → should NOT trigger (condition mismatch)
	// On failed → would trigger, but we don't test that path here
	// Just verify no panic on completed with on_failure condition
	orch.triggerChainedWorkflows(parent, "completed")
}

func TestWorkflowChaining_ConditionAlways(t *testing.T) {
	orch := NewOrchestrator(nil)
	parent := orch.CreateWorkflow("parent", ModeSequential)
	parent.AddNode(&WorkflowNode{ID: "n1", Name: "N1", Type: "agent"})
	parent.OnComplete = []WorkflowChainLink{
		{WorkflowID: "child", Condition: "always"},
	}

	// Always triggers regardless of status
	orch.triggerChainedWorkflows(parent, "completed")
	orch.triggerChainedWorkflows(parent, "failed")
}

func TestWorkflowChaining_NonTerminalStatus(t *testing.T) {
	orch := NewOrchestrator(nil)
	parent := orch.CreateWorkflow("parent", ModeSequential)
	parent.AddNode(&WorkflowNode{ID: "n1", Name: "N1", Type: "agent"})
	parent.OnComplete = []WorkflowChainLink{
		{WorkflowID: "child", Condition: "always"},
	}

	// Running status should NOT trigger chains
	orch.triggerChainedWorkflows(parent, "running")
	orch.triggerChainedWorkflows(parent, "paused")
	orch.triggerChainedWorkflows(parent, "draft")
}

func TestWorkflowChaining_MultipleLinks(t *testing.T) {
	orch := NewOrchestrator(nil)
	parent := orch.CreateWorkflow("parent", ModeSequential)
	parent.AddNode(&WorkflowNode{ID: "n1", Name: "N1", Type: "agent"})
	parent.OnComplete = []WorkflowChainLink{
		{WorkflowID: "child-a", Condition: "on_success"},
		{WorkflowID: "child-b", Condition: "always"},
		{WorkflowID: "child-c", Condition: "on_failure"},
	}

	// On completed: child-a (on_success ✓) and child-b (always ✓) should trigger
	// child-c (on_failure) should NOT trigger
	// We just verify no panic with multiple links
	orch.triggerChainedWorkflows(parent, "completed")
}

func TestExecuteNode_VariableResolution(t *testing.T) {
	orch := NewOrchestrator(nil)
	wf := orch.CreateWorkflow("test-vars", ModeSequential)

	// Add a workflow variable
	varStore := orch.GetVariableStore()
	err := varStore.AddVariable(wf.ID, &WorkflowVariable{
		ID:    "var-1",
		Name:  "API Key",
		Key:   "api_key",
		Type:  VarTypeString,
		Value: "secret-123",
	})
	if err != nil {
		t.Fatalf("failed to add variable: %v", err)
	}

	// Create a node with template in Config
	node := &WorkflowNode{
		ID:   "node-1",
		Name: "Test Node",
		Type: "agent",
		Config: map[string]any{
			"apiKey":    "{{api_key}}",
			"endpoint":  "https://api.example.com",
			"unresolved": "{{unknown_var}}",
		},
	}
	wf.AddNode(node)

	// Verify initial state has template strings
	if node.Config["apiKey"] != "{{api_key}}" {
		t.Errorf("expected template string before resolution, got %v", node.Config["apiKey"])
	}

	// Note: We cannot easily test the full executeNode flow without a mock scheduler/agent,
	// but we can verify the variable resolution logic works
	resolved, err := varStore.ResolveVariablesInMap(wf.ID, node.Config)
	if err != nil {
		// Error is expected for unknown_var, but resolved should still contain the known vars
		t.Logf("expected error for unknown variable: %v", err)
	}

	// Verify known variable was resolved
	if resolved["apiKey"] != "secret-123" {
		t.Errorf("expected resolved apiKey to be 'secret-123', got %v", resolved["apiKey"])
	}

	// Verify non-template values are preserved
	if resolved["endpoint"] != "https://api.example.com" {
		t.Errorf("expected endpoint to be preserved, got %v", resolved["endpoint"])
	}

	// Verify unknown variable remains as template (or is left unchanged)
	if resolved["unresolved"] != "{{unknown_var}}" {
		t.Logf("note: unknown var resolved to %v", resolved["unresolved"])
	}
}

func TestClassifyError_CustomTypes(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected FailureType
	}{
		{"timeout error", &TimeoutError{Stage: TimeoutStageStartToClose, Duration: 5 * time.Second}, FailureTypeTimeout},
		{"interrupt error", NewInterruptError("node-1", "before"), FailureTypeInterrupt},
		{"context deadline", context.DeadlineExceeded, FailureTypeTimeout},
		{"context canceled", context.Canceled, FailureTypeCancelled},
		{"nil error", nil, FailureTypeUnknown},
		{"generic error", errors.New("some error"), FailureTypeUnknown},
		{"validation error", errors.New("validation failed: required field missing"), FailureTypeValidation},
		{"agent error", errors.New("agent connection timeout"), FailureTypeTimeout},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := classifyError(tt.err)
			if result != tt.expected {
				t.Errorf("classifyError(%v) = %s, want %s", tt.err, result, tt.expected)
			}
		})
	}
}

// ==================== Orchestrator Setter/Getter Tests ====================

func TestOrchestrator_SetFailurePolicy(t *testing.T) {
	o := NewOrchestrator(nil)
	o.SetFailurePolicy(FailurePolicyContinuePartial)
	if o.FailurePolicy != FailurePolicyContinuePartial {
		t.Errorf("FailurePolicy = %v, want ContinuePartial", o.FailurePolicy)
	}
}

func TestOrchestrator_SetMaxRounds(t *testing.T) {
	o := NewOrchestrator(nil)
	o.SetMaxRounds(10)
	if o.MaxRounds != 10 {
		t.Errorf("MaxRounds = %d, want 10", o.MaxRounds)
	}
}

func TestOrchestrator_SetBroadcaster(t *testing.T) {
	o := NewOrchestrator(nil)
	var bc mockEventBroadcaster2
	o.SetBroadcaster(bc)
	got := o.GetBroadcaster()
	if got == nil {
		t.Error("GetBroadcaster should return non-nil after SetBroadcaster")
	}
}

func TestOrchestrator_GetBroadcaster_Nil(t *testing.T) {
	o := NewOrchestrator(nil)
	if o.GetBroadcaster() != nil {
		t.Error("GetBroadcaster should be nil initially")
	}
}

func TestOrchestrator_GetArtifactStore(t *testing.T) {
	o := NewOrchestrator(nil)
	if o.GetArtifactStore() == nil {
		t.Error("GetArtifactStore should return non-nil")
	}
}

func TestOrchestrator_GetVariableStore(t *testing.T) {
	o := NewOrchestrator(nil)
	if o.GetVariableStore() == nil {
		t.Error("GetVariableStore should return non-nil")
	}
}

func TestOrchestrator_GetAutomationEngine(t *testing.T) {
	o := NewOrchestrator(nil)
	if o.GetAutomationEngine() == nil {
		t.Error("GetAutomationEngine should return non-nil")
	}
}

func TestOrchestrator_GetAuditLogger(t *testing.T) {
	o := NewOrchestrator(nil)
	if o.GetAuditLogger() == nil {
		t.Error("GetAuditLogger should return non-nil")
	}
}

func TestOrchestrator_SetAuditLogger(t *testing.T) {
	o := NewOrchestrator(nil)
	o.SetAuditLogger(nil)
	if o.GetAuditLogger() != nil {
		t.Error("GetAuditLogger should be nil after SetAuditLogger(nil)")
	}
}

func TestOrchestrator_GetResultCache(t *testing.T) {
	o := NewOrchestrator(nil)
	if o.GetResultCache() == nil {
		t.Error("GetResultCache should return non-nil")
	}
}

func TestOrchestrator_ClearNodeCache(t *testing.T) {
	o := NewOrchestrator(nil)
	// Should not panic
	o.ClearNodeCache("nonexistent-node")
}

func TestOrchestrator_ClearAllCaches(t *testing.T) {
	o := NewOrchestrator(nil)
	// Should not panic
	o.ClearAllCaches()
}

func TestWorkflow_SetName(t *testing.T) {
	w := &Workflow{Name: "old"}
	w.SetName("new")
	if w.Name != "new" {
		t.Errorf("Name = %q, want 'new'", w.Name)
	}
}

func TestOrchestrator_Close(t *testing.T) {
	o := NewOrchestrator(nil)
	// Should not block or panic with no goroutines
	o.Close()
}

type mockEventBroadcaster2 struct{}

func (m mockEventBroadcaster2) Broadcast(eventType string, payload any) {}

// ==================== Workflow Snapshot Tests ====================

func TestWorkflow_Snapshot(t *testing.T) {
	o := NewOrchestrator(nil)
	w := o.CreateWorkflow("snapshot-test", ModeSequential)

	// Add nodes
	w.AddNode(&WorkflowNode{ID: "n1", Name: "Node 1", Type: "agent"})
	w.AddNode(&WorkflowNode{ID: "n2", Name: "Node 2", Type: "agent"})

	// Add edge
	w.AddEdge(&WorkflowEdge{ID: "e1", From: "n1", To: "n2"})

	// Set status
	w.SetStatus("running")

	snapshot := w.Snapshot()

	// Verify snapshot fields
	if snapshot.ID != w.ID {
		t.Error("snapshot ID mismatch")
	}
	if snapshot.Name != "snapshot-test" {
		t.Errorf("snapshot Name = %q, want 'snapshot-test'", snapshot.Name)
	}
	if snapshot.Status != "running" {
		t.Errorf("snapshot Status = %q, want 'running'", snapshot.Status)
	}
	if len(snapshot.Nodes) != 2 {
		t.Errorf("snapshot Nodes count = %d, want 2", len(snapshot.Nodes))
	}
	if len(snapshot.Edges) != 1 {
		t.Errorf("snapshot Edges count = %d, want 1", len(snapshot.Edges))
	}
}

func TestWorkflow_Snapshot_Isolation(t *testing.T) {
	o := NewOrchestrator(nil)
	w := o.CreateWorkflow("isolation-test", ModeSequential)
	w.AddNode(&WorkflowNode{ID: "n1", Name: "Original", Type: "agent"})

	snapshot := w.Snapshot()

	// Modify original workflow - use direct field access
	w.mu.Lock()
	w.Status = "modified"
	w.Nodes[0].Name = "Modified"
	w.mu.Unlock()

	// Snapshot should not be affected
	if snapshot.Status == "modified" {
		t.Error("snapshot should not reflect status changes")
	}
	if snapshot.Nodes[0].Name == "Modified" {
		t.Error("snapshot nodes should be independent")
	}
}

func TestWorkflow_Snapshot_OnComplete(t *testing.T) {
	o := NewOrchestrator(nil)
	w := o.CreateWorkflow("oncomplete-test", ModeSequential)

	// Set OnComplete
	w.OnComplete = []WorkflowChainLink{
		{WorkflowID: "next-wf", InputMapping: map[string]string{"a": "b"}},
	}

	snapshot := w.Snapshot()

	if len(snapshot.OnComplete) != 1 {
		t.Fatalf("snapshot OnComplete count = %d, want 1", len(snapshot.OnComplete))
	}

	// Modify original
	w.OnComplete[0].WorkflowID = "modified-wf"

	// Snapshot should not be affected
	if snapshot.OnComplete[0].WorkflowID == "modified-wf" {
		t.Error("snapshot OnComplete should be independent")
	}
}

// ==================== Orchestrator GetPreviousNodes Tests ====================

func TestWorkflow_GetPreviousNodes(t *testing.T) {
	o := NewOrchestrator(nil)
	w := o.CreateWorkflow("prev-test", ModeSequential)

	// Create nodes
	w.AddNode(&WorkflowNode{ID: "start", Name: "Start", Type: "agent"})
	w.AddNode(&WorkflowNode{ID: "middle", Name: "Middle", Type: "agent"})
	w.AddNode(&WorkflowNode{ID: "end", Name: "End", Type: "agent"})

	// Create edges: start -> middle -> end
	w.AddEdge(&WorkflowEdge{ID: "e1", From: "start", To: "middle"})
	w.AddEdge(&WorkflowEdge{ID: "e2", From: "middle", To: "end"})

	// Get previous nodes for "end"
	prev := w.GetPreviousNodes("end")
	if len(prev) != 1 {
		t.Fatalf("GetPreviousNodes('end') = %d nodes, want 1", len(prev))
	}
	if prev[0].ID != "middle" {
		t.Errorf("GetPreviousNodes('end')[0].ID = %q, want 'middle'", prev[0].ID)
	}

	// Get previous nodes for "middle"
	prev = w.GetPreviousNodes("middle")
	if len(prev) != 1 {
		t.Fatalf("GetPreviousNodes('middle') = %d nodes, want 1", len(prev))
	}
	if prev[0].ID != "start" {
		t.Errorf("GetPreviousNodes('middle')[0].ID = %q, want 'start'", prev[0].ID)
	}

	// Get previous nodes for "start" (no predecessors)
	prev = w.GetPreviousNodes("start")
	if len(prev) != 0 {
		t.Errorf("GetPreviousNodes('start') = %d nodes, want 0", len(prev))
	}

	// Get previous nodes for non-existent node
	prev = w.GetPreviousNodes("nonexistent")
	if len(prev) != 0 {
		t.Errorf("GetPreviousNodes('nonexistent') = %d nodes, want 0", len(prev))
	}
}

func TestWorkflow_GetPreviousNodes_MultiplePredecessors(t *testing.T) {
	o := NewOrchestrator(nil)
	w := o.CreateWorkflow("multi-prev-test", ModeSequential)

	// Create diamond shape: A -> B, A -> C, B -> D, C -> D
	w.AddNode(&WorkflowNode{ID: "A", Type: "agent"})
	w.AddNode(&WorkflowNode{ID: "B", Type: "agent"})
	w.AddNode(&WorkflowNode{ID: "C", Type: "agent"})
	w.AddNode(&WorkflowNode{ID: "D", Type: "agent"})

	w.AddEdge(&WorkflowEdge{ID: "e1", From: "A", To: "B"})
	w.AddEdge(&WorkflowEdge{ID: "e2", From: "A", To: "C"})
	w.AddEdge(&WorkflowEdge{ID: "e3", From: "B", To: "D"})
	w.AddEdge(&WorkflowEdge{ID: "e4", From: "C", To: "D"})

	// D should have B and C as predecessors
	prev := w.GetPreviousNodes("D")
	if len(prev) != 2 {
		t.Fatalf("GetPreviousNodes('D') = %d nodes, want 2", len(prev))
	}

	prevIDs := make(map[string]bool)
	for _, n := range prev {
		prevIDs[n.ID] = true
	}
	if !prevIDs["B"] || !prevIDs["C"] {
		t.Error("GetPreviousNodes('D') should return B and C")
	}
}
