package swarm

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
)

func TestNewSwarm(t *testing.T) {
	config := SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test Swarm",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	}

	swarm := NewSwarm(config)

	if swarm == nil {
		t.Fatal("NewSwarm returned nil")
	}

	if swarm.ID != "swarm-1" {
		t.Errorf("Expected ID 'swarm-1', got '%s'", swarm.ID)
	}

	if swarm.Name != "Test Swarm" {
		t.Errorf("Expected Name 'Test Swarm', got '%s'", swarm.Name)
	}

	if swarm.Topology != TopologyStar {
		t.Errorf("Expected Topology '%s', got '%s'", TopologyStar, swarm.Topology)
	}

	if swarm.Strategy != StrategyParallel {
		t.Errorf("Expected Strategy '%s', got '%s'", StrategyParallel, swarm.Strategy)
	}

	if swarm.State != SwarmStateInitializing {
		t.Errorf("Expected State '%s', got '%s'", SwarmStateInitializing, swarm.State)
	}
}

func TestSwarmAddAgent(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	a := agent.NewAgent("test-agent", agent.AgentTypeCoder)

	swarm.AddAgent(a)

	agents := swarm.GetAgents()
	if len(agents) != 1 {
		t.Errorf("Expected 1 agent, got %d", len(agents))
	}

	// Test adding same agent twice
	swarm.AddAgent(a) // Should be idempotent

	agents = swarm.GetAgents()
	if len(agents) != 1 {
		t.Errorf("Expected 1 agent after duplicate add, got %d", len(agents))
	}
}

func TestSwarmRemoveAgent(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	a := agent.NewAgent("test-agent", agent.AgentTypeCoder)
	swarm.AddAgent(a)
	swarm.RemoveAgent(a.ID)

	agents := swarm.GetAgents()
	if len(agents) != 0 {
		t.Errorf("Expected 0 agents after remove, got %d", len(agents))
	}
}

func TestSwarmSetCoordinator(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	coord := agent.NewAgent("coordinator", agent.AgentTypeOrchestrator)
	swarm.AddAgent(coord)
	swarm.SetCoordinator(coord)

	// Coordinator should be set - verify through topology
	neighbors := swarm.GetNeighbors(coord.ID)
	_ = neighbors // Just verify no panic
}

func TestSwarmTopologyStar(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	// Add coordinator first
	coord := agent.NewAgent("coord", agent.AgentTypeOrchestrator)
	swarm.AddAgent(coord)
	swarm.SetCoordinator(coord)

	// Add workers and store their actual IDs
	var workerIDs []acp.AgentID
	for i := 0; i < 3; i++ {
		a := agent.NewAgent("worker-"+string(rune('0'+i)), agent.AgentTypeCoder)
		swarm.AddAgent(a)
		workerIDs = append(workerIDs, a.ID)
	}

	// In star topology, coordinator should have all workers as neighbors
	coordNeighbors := swarm.GetNeighbors(coord.ID)
	if len(coordNeighbors) != 3 {
		t.Errorf("Coordinator should have 3 neighbors, got %d", len(coordNeighbors))
	}

	// Each worker should have coordinator as neighbor
	for _, workerID := range workerIDs {
		neighbors := swarm.GetNeighbors(workerID)
		if len(neighbors) != 1 {
			t.Errorf("Worker %s should have 1 neighbor (coordinator), got %d", workerID, len(neighbors))
		}
	}
}

func TestSwarmTopologyMesh(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyMesh,
		Strategy: StrategyParallel,
	})

	// Add agents
	var agentIDs []acp.AgentID
	for i := 0; i < 4; i++ {
		a := agent.NewAgent("agent-"+string(rune('0'+i)), agent.AgentTypeCoder)
		swarm.AddAgent(a)
		agentIDs = append(agentIDs, a.ID)
	}

	// In mesh topology, all agents should be connected to all other agents
	for _, id := range agentIDs {
		neighbors := swarm.GetNeighbors(id)
		if len(neighbors) != 3 {
			t.Errorf("In mesh topology, each agent should have 3 neighbors, got %d", len(neighbors))
		}
	}
}

func TestSwarmTopologyRing(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyRing,
		Strategy: StrategyParallel,
	})

	// Add agents
	var agentIDs []acp.AgentID
	for i := 0; i < 4; i++ {
		a := agent.NewAgent("agent-"+string(rune('0'+i)), agent.AgentTypeCoder)
		swarm.AddAgent(a)
		agentIDs = append(agentIDs, a.ID)
	}

	// In ring topology, each agent should have exactly 1 neighbor
	for _, id := range agentIDs {
		neighbors := swarm.GetNeighbors(id)
		if len(neighbors) != 1 {
			t.Errorf("Agent %s should have 1 neighbor in ring, got %d", id, len(neighbors))
		}
	}
}

func TestSwarmTopologyTree(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyTree,
		Strategy: StrategyParallel,
	})

	// Add agents
	for i := 0; i < 7; i++ {
		a := agent.NewAgent("agent-"+string(rune('0'+i)), agent.AgentTypeCoder)
		swarm.AddAgent(a)
	}

	// Tree topology creates a binary tree structure
	// Verify all agents have some neighbors
	agents := swarm.GetAgents()
	for _, a := range agents {
		neighbors := swarm.GetNeighbors(a.ID)
		// Root has 2 children, leaves have 1 parent, internal have 3 (1 parent + 2 children)
		if len(neighbors) < 1 || len(neighbors) > 3 {
			t.Errorf("Agent %s has unexpected number of neighbors: %d", a.ID, len(neighbors))
		}
	}
}

func TestSwarmGetNeighborsNonExistent(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	// Test with non-existent agent
	neighbors := swarm.GetNeighbors("non-existent")

	// nil slice is valid and has length 0
	if len(neighbors) != 0 {
		t.Errorf("Expected empty slice for non-existent agent, got %d", len(neighbors))
	}
}

func TestSwarmGetAgents(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	// Empty swarm
	agents := swarm.GetAgents()
	if len(agents) != 0 {
		t.Errorf("Expected 0 agents, got %d", len(agents))
	}

	// Add agents
	for i := 0; i < 3; i++ {
		a := agent.NewAgent("agent-"+string(rune('0'+i)), agent.AgentTypeCoder)
		swarm.AddAgent(a)
	}

	agents = swarm.GetAgents()
	if len(agents) != 3 {
		t.Errorf("Expected 3 agents, got %d", len(agents))
	}
}

func TestSwarmStartStop(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	a := agent.NewAgent("test-agent", agent.AgentTypeCoder)
	swarm.AddAgent(a)

	ctx := context.Background()
	err := swarm.Start(ctx)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	if swarm.State != SwarmStateActive {
		t.Errorf("Expected State '%s', got '%s'", SwarmStateActive, swarm.State)
	}

	// Stop
	err = swarm.Stop()
	if err != nil {
		t.Fatalf("Stop failed: %v", err)
	}

	if swarm.State != SwarmStateStopped {
		t.Errorf("Expected State '%s', got '%s'", SwarmStateStopped, swarm.State)
	}
}

func TestSwarmSubmitTask(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	ctx := context.Background()
	swarm.Start(ctx)
	defer swarm.Stop()

	task := &Task{
		ID:       "task-1",
		Prompt:   acp.Prompt{{Type: "text", Text: "Test task"}},
		Priority: PriorityMedium,
	}

	err := swarm.SubmitTask(ctx, task)
	if err != nil {
		t.Fatalf("SubmitTask failed: %v", err)
	}

	stats := swarm.GetStats()
	if stats.PendingTasks != 1 {
		t.Errorf("Expected 1 pending task, got %d", stats.PendingTasks)
	}
}

func TestSwarmExecuteTaskNoAgents(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	ctx := context.Background()
	swarm.Start(ctx)
	defer swarm.Stop()

	task := &Task{
		ID:       "task-1",
		Prompt:   acp.Prompt{{Type: "text", Text: "Test task"}},
		Priority: PriorityMedium,
	}

	_, err := swarm.ExecuteTask(ctx, task)
	if err == nil {
		t.Error("ExecuteTask should return error when no agents available")
	}
}

func TestSwarmSelectAgentsForParallel(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	// Add agents
	for i := 0; i < 3; i++ {
		a := agent.NewAgent("agent-"+string(rune('0'+i)), agent.AgentTypeCoder)
		swarm.AddAgent(a)
	}

	task := &Task{ID: "task-1", Prompt: acp.Prompt{{Type: "text", Text: "test"}}}
	selected := swarm.selectAgentsForParallel(task)

	if len(selected) != 3 {
		t.Errorf("Expected 3 selected agents, got %d", len(selected))
	}
}

func TestSwarmSelectAgentForSequential(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategySequential,
	})

	// Add agents
	for i := 0; i < 3; i++ {
		a := agent.NewAgent("agent-"+string(rune('0'+i)), agent.AgentTypeCoder)
		swarm.AddAgent(a)
	}

	task := &Task{ID: "task-1", Prompt: acp.Prompt{{Type: "text", Text: "test"}}}
	selected := swarm.selectAgentForSequential(task)

	if len(selected) > 1 {
		t.Errorf("Expected at most 1 selected agent, got %d", len(selected))
	}
}

func TestSwarmSelectAgentForSequentialNoIdle(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategySequential,
	})

	// Add agent and set to non-idle state
	a := agent.NewAgent("agent-1", agent.AgentTypeCoder)
	a.SetState(agent.StateExecuting)
	swarm.AddAgent(a)

	task := &Task{ID: "task-1", Prompt: acp.Prompt{{Type: "text", Text: "test"}}}
	selected := swarm.selectAgentForSequential(task)

	if len(selected) != 0 {
		t.Errorf("Expected 0 selected agents when none idle, got %d", len(selected))
	}
}

func TestSwarmOnTaskComplete(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	called := false
	swarm.OnTaskComplete(func(task *Task) {
		called = true
	})

	if swarm.onTaskComplete == nil {
		t.Error("onTaskComplete should be set")
	}

	// Trigger callback
	if swarm.onTaskComplete != nil {
		swarm.onTaskComplete(&Task{ID: "test"})
	}

	if !called {
		t.Error("Callback should have been called")
	}
}

func TestSwarmGetStats(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	// Add agents
	for i := 0; i < 3; i++ {
		a := agent.NewAgent("agent-"+string(rune('0'+i)), agent.AgentTypeCoder)
		swarm.AddAgent(a)
	}

	ctx := context.Background()
	swarm.Start(ctx)
	defer swarm.Stop()

	// Add a task
	task := &Task{ID: "task-1", Prompt: acp.Prompt{{Type: "text", Text: "test"}}}
	swarm.SubmitTask(ctx, task)

	stats := swarm.GetStats()

	if stats.AgentCount != 3 {
		t.Errorf("Expected AgentCount 3, got %d", stats.AgentCount)
	}

	if stats.PendingTasks != 1 {
		t.Errorf("Expected PendingTasks 1, got %d", stats.PendingTasks)
	}

	if stats.Topology != "star" {
		t.Errorf("Expected Topology 'star', got '%s'", stats.Topology)
	}

	if stats.Strategy != "parallel" {
		t.Errorf("Expected Strategy 'parallel', got '%s'", stats.Strategy)
	}

	if stats.State != "active" {
		t.Errorf("Expected State 'active', got '%s'", stats.State)
	}
}

func TestSwarmConcurrentAccess(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	var wg sync.WaitGroup
	done := make(chan bool, 20)

	// Concurrent agent additions
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			a := agent.NewAgent("agent-"+string(rune('0'+idx)), agent.AgentTypeCoder)
			swarm.AddAgent(a)
			done <- true
		}(i)
	}

	// Concurrent reads
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			swarm.GetAgents()
			done <- true
		}()
	}

	wg.Wait()
	close(done)

	count := 0
	for range done {
		count++
	}
	if count != 20 {
		t.Errorf("Expected 20 completions, got %d", count)
	}
}

// Topology type tests

func TestTopologyTypes(t *testing.T) {
	topologies := []TopologyType{
		TopologyStar,
		TopologyMesh,
		TopologyTree,
		TopologyRing,
		TopologyHybrid,
	}

	for _, topo := range topologies {
		if topo == "" {
			t.Error("TopologyType should not be empty")
		}
	}
}

// Strategy type tests

func TestTaskStrategyTypes(t *testing.T) {
	strategies := []TaskStrategy{
		StrategyParallel,
		StrategySequential,
		StrategyPipeline,
		StrategyMapReduce,
	}

	for _, strategy := range strategies {
		if strategy == "" {
			t.Error("TaskStrategy should not be empty")
		}
	}
}

// State type tests

func TestSwarmStateTypes(t *testing.T) {
	states := []SwarmState{
		SwarmStateInitializing,
		SwarmStateActive,
		SwarmStatePaused,
		SwarmStateStopping,
		SwarmStateStopped,
	}

	for _, state := range states {
		if state == "" {
			t.Error("SwarmState should not be empty")
		}
	}
}

// Proposal tests

func TestProposalJSON(t *testing.T) {
	proposal := &Proposal{
		ID:          "prop-1",
		Title:       "Test Proposal",
		Description: "A test",
		Content:     json.RawMessage(`{"key": "value"}`),
		CreatedAt:   time.Now(),
	}

	data, err := json.Marshal(proposal)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed Proposal
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.ID != "prop-1" {
		t.Errorf("ID mismatch")
	}
}

// SwarmStats tests

func TestSwarmStatsJSON(t *testing.T) {
	stats := &SwarmStats{
		AgentCount:      5,
		IdleAgents:      3,
		ExecutingAgents: 2,
		PendingTasks:    10,
		CompletedTasks:  20,
		Topology:        "star",
		Strategy:        "parallel",
		State:           "active",
	}

	data, err := json.Marshal(stats)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed SwarmStats
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.AgentCount != 5 {
		t.Errorf("AgentCount mismatch")
	}
}

// SwarmConfig tests

func TestSwarmConfigJSON(t *testing.T) {
	config := SwarmConfig{
		ID:         "swarm-1",
		Name:       "Test Swarm",
		Topology:   TopologyStar,
		Strategy:   StrategyParallel,
		AgentCount: 5,
		AgentTypes: []agent.AgentType{agent.AgentTypeCoder, agent.AgentTypeReviewer},
	}

	data, err := json.Marshal(config)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed SwarmConfig
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.ID != "swarm-1" {
		t.Errorf("ID mismatch")
	}

	if len(parsed.AgentTypes) != 2 {
		t.Errorf("AgentTypes mismatch")
	}
}

func TestSwarmDecomposeTask(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	// Add agents
	for i := 0; i < 3; i++ {
		a := agent.NewAgent("agent-"+string(rune('0'+i)), agent.AgentTypeCoder)
		swarm.AddAgent(a)
	}

	ctx := context.Background()

	// Non-decomposable task
	simpleTask := &Task{
		ID:          "task-1",
		Prompt:      acp.Prompt{{Type: "text", Text: "simple"}},
		Description: "Simple task",
	}
	subtasks, err := swarm.DecomposeTask(ctx, simpleTask)
	if err != nil {
		t.Fatalf("DecomposeTask failed: %v", err)
	}
	if len(subtasks) != 1 {
		t.Errorf("Non-decomposable task should return itself, got %d subtasks", len(subtasks))
	}

	// Decomposable task (has multiple prompts)
	complexTask := &Task{
		ID:          "task-2",
		Prompt:      acp.Prompt{{Type: "text", Text: "complex"}},
		Description: "This is a very complex task that involves multiple steps including designing the architecture, implementing the code, writing tests, and documenting the solution",
	}
	complexTask.State = TaskStatePending

	subtasks, err = swarm.DecomposeTask(ctx, complexTask)
	if err != nil {
		t.Fatalf("DecomposeTask failed: %v", err)
	}
	// Should decompose based on number of agents
	if len(subtasks) < 1 {
		t.Errorf("Expected at least 1 subtask for decomposable task")
	}
}

func TestSwarmSelectAgentsForPipeline(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyPipeline,
	})

	// Add agents
	for i := 0; i < 3; i++ {
		a := agent.NewAgent("agent-"+string(rune('0'+i)), agent.AgentTypeCoder)
		swarm.AddAgent(a)
	}

	task := &Task{ID: "task-1", Prompt: acp.Prompt{{Type: "text", Text: "test"}}}
	selected := swarm.selectAgentsForPipeline(task)

	// Pipeline should select all idle agents (same as parallel in current impl)
	if len(selected) != 3 {
		t.Errorf("Expected 3 selected agents for pipeline, got %d", len(selected))
	}
}

func TestSwarmSelectAgentsForMapReduce(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyMapReduce,
	})

	// Add agents
	for i := 0; i < 3; i++ {
		a := agent.NewAgent("agent-"+string(rune('0'+i)), agent.AgentTypeCoder)
		swarm.AddAgent(a)
	}

	task := &Task{ID: "task-1", Prompt: acp.Prompt{{Type: "text", Text: "test"}}}
	selected := swarm.selectAgentsForMapReduce(task)

	// MapReduce should select all idle agents for map phase
	if len(selected) != 3 {
		t.Errorf("Expected 3 selected agents for mapreduce, got %d", len(selected))
	}
}

func TestSwarmExecuteTaskWithPipeline(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyPipeline,
	})

	// Add agents
	for i := 0; i < 3; i++ {
		a := agent.NewAgent("agent-"+string(rune('0'+i)), agent.AgentTypeCoder)
		swarm.AddAgent(a)
	}

	ctx := context.Background()
	swarm.Start(ctx)
	defer swarm.Stop()

	task := &Task{
		ID:       "task-1",
		Prompt:   acp.Prompt{{Type: "text", Text: "test"}},
		Priority: PriorityMedium,
	}

	_, err := swarm.ExecuteTask(ctx, task)
	// ExecuteTask will fail because agents don't have real LLM connections
	// but it should not panic and should return a result
	if err == nil {
		// If no error, verify the task was completed
		if task.State != TaskStateCompleted {
			t.Errorf("Expected TaskStateCompleted, got %s", task.State)
		}
	}
}

func TestSwarmExecuteTaskWithMapReduce(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyMapReduce,
	})

	// Add agents
	for i := 0; i < 3; i++ {
		a := agent.NewAgent("agent-"+string(rune('0'+i)), agent.AgentTypeCoder)
		swarm.AddAgent(a)
	}

	ctx := context.Background()
	swarm.Start(ctx)
	defer swarm.Stop()

	task := &Task{
		ID:       "task-1",
		Prompt:   acp.Prompt{{Type: "text", Text: "test"}},
		Priority: PriorityMedium,
	}

	_, err := swarm.ExecuteTask(ctx, task)
	// ExecuteTask will fail because agents don't have real LLM connections
	// but it should not panic
	if err == nil {
		if task.State != TaskStateCompleted {
			t.Errorf("Expected TaskStateCompleted, got %s", task.State)
		}
	}
}

func TestSwarmTopologyHybrid(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyHybrid,
		Strategy: StrategyParallel,
	})

	// Add coordinator
	coord := agent.NewAgent("coord", agent.AgentTypeOrchestrator)
	swarm.AddAgent(coord)
	swarm.SetCoordinator(coord)

	// Add workers
	var agentIDs []acp.AgentID
	for i := 0; i < 4; i++ {
		a := agent.NewAgent("agent-"+string(rune('0'+i)), agent.AgentTypeCoder)
		swarm.AddAgent(a)
		agentIDs = append(agentIDs, a.ID)
	}

	// In hybrid topology, coordinator should connect to all workers
	coordNeighbors := swarm.GetNeighbors(coord.ID)
	if len(coordNeighbors) < 3 {
		t.Errorf("Coordinator should have at least 3 neighbors in hybrid, got %d", len(coordNeighbors))
	}

	// Workers should have coordinator and ring neighbor
	for _, id := range agentIDs {
		neighbors := swarm.GetNeighbors(id)
		// Should have coordinator + at least one ring neighbor
		if len(neighbors) < 2 {
			t.Errorf("Agent %s should have at least 2 neighbors in hybrid, got %d", id, len(neighbors))
		}
	}
}

func TestSwarmDoubleStart(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	ctx := context.Background()

	// First start should succeed
	err := swarm.Start(ctx)
	if err != nil {
		t.Fatalf("First Start failed: %v", err)
	}

	// Second start should fail
	err = swarm.Start(ctx)
	if err == nil {
		t.Error("Second Start should return error")
	}

	// Clean up
	swarm.Stop()
}

func TestSwarmCalculateWorkerScore(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	// Add a coordinator
	coord := agent.NewAgent("coordinator", agent.AgentTypeOrchestrator)
	swarm.SetCoordinator(coord)

	// Add agents with different types
	coder := agent.NewAgent("coder-1", agent.AgentTypeCoder)
	coder.SetState(agent.StateIdle)
	swarm.AddAgent(coder)

	tester := agent.NewAgent("tester-1", agent.AgentTypeTester)
	tester.SetState(agent.StateIdle)
	swarm.AddAgent(tester)

	busyAgent := agent.NewAgent("busy-1", agent.AgentTypeCoder)
	busyAgent.SetState(agent.StateExecuting)
	swarm.AddAgent(busyAgent)

	// Task for coding - should match coder due to "code" keyword
	codeTask := &Task{
		ID:          "task-1",
		Description: "Write code for the feature",
		Prompt:      acp.Prompt{{Type: "text", Text: "test"}},
	}

	selected := swarm.AssignTaskToWorker(codeTask)
	if selected == nil {
		t.Fatal("Expected a worker to be selected")
	}
	// Coder should be selected for code task
	if selected.Type != agent.AgentTypeCoder {
		t.Errorf("Expected coder to be selected for code task, got %s", selected.Type)
	}

	// Task for testing - should match tester due to "test" keyword (no "code" or "implement")
	testTask := &Task{
		ID:          "task-2",
		Description: "Validate the functionality with unit tests",
		Prompt:      acp.Prompt{{Type: "text", Text: "test"}},
	}

	selected = swarm.AssignTaskToWorker(testTask)
	if selected == nil {
		t.Fatal("Expected a worker to be selected")
	}
	// Tester should be selected for test task
	if selected.Type != agent.AgentTypeTester {
		t.Errorf("Expected tester to be selected for test task, got %s", selected.Type)
	}

	// Busy agent should never be selected
	if selected.ID == busyAgent.ID {
		t.Error("Busy agent should not be selected")
	}
}

func TestSwarmUnknownTopology(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyType("unknown"),
		Strategy: StrategyParallel,
	})

	// Add agents
	var agentIDs []acp.AgentID
	for i := 0; i < 3; i++ {
		a := agent.NewAgent("agent-"+string(rune('0'+i)), agent.AgentTypeCoder)
		swarm.AddAgent(a)
		agentIDs = append(agentIDs, a.ID)
	}

	// Unknown topology should default to mesh (all connected to all)
	for _, id := range agentIDs {
		neighbors := swarm.GetNeighbors(id)
		if len(neighbors) != 2 {
			t.Errorf("Unknown topology should default to mesh, agent %s should have 2 neighbors, got %d", id, len(neighbors))
		}
	}
}

// Edge case tests for nil checks

func TestSwarmAddNilAgent(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	// Should not panic when adding nil agent
	swarm.AddAgent(nil)

	agents := swarm.GetAgents()
	if len(agents) != 0 {
		t.Errorf("Expected 0 agents after adding nil, got %d", len(agents))
	}
}

func TestSwarmSetNilCoordinator(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	// Add a real agent first
	a := agent.NewAgent("test-agent", agent.AgentTypeCoder)
	swarm.AddAgent(a)

	// Should not panic when setting nil coordinator
	swarm.SetCoordinator(nil)

	// Original agent should still be there
	agents := swarm.GetAgents()
	if len(agents) != 1 {
		t.Errorf("Expected 1 agent after setting nil coordinator, got %d", len(agents))
	}
}

func TestSwarmSubmitNilTask(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	ctx := context.Background()
	swarm.Start(ctx)
	defer swarm.Stop()

	// Should return error for nil task
	err := swarm.SubmitTask(ctx, nil)
	if err == nil {
		t.Error("SubmitTask should return error for nil task")
	}

	stats := swarm.GetStats()
	if stats.PendingTasks != 0 {
		t.Errorf("Expected 0 pending tasks after nil submit, got %d", stats.PendingTasks)
	}
}

func TestSwarmDecomposeNilTask(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	ctx := context.Background()

	// Should return error for nil task
	subtasks, err := swarm.DecomposeTask(ctx, nil)
	if err == nil {
		t.Error("DecomposeTask should return error for nil task")
	}
	if subtasks != nil {
		t.Error("DecomposeTask should return nil subtasks for nil task")
	}
}

func TestSwarmExecuteNilTask(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	ctx := context.Background()
	swarm.Start(ctx)
	defer swarm.Stop()

	// Should return error for nil task
	result, err := swarm.ExecuteTask(ctx, nil)
	if err == nil {
		t.Error("ExecuteTask should return error for nil task")
	}
	if result != nil {
		t.Error("ExecuteTask should return nil result for nil task")
	}
}

func TestSwarmGetTask(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	// Add a task
	task := &Task{
		ID:    "task-1",
		Title: "Test Task",
		State: TaskStatePending,
	}
	swarm.tasks["task-1"] = task

	// Test getting existing task
	retrieved := swarm.GetTask("task-1")
	if retrieved == nil {
		t.Fatal("Expected to retrieve task-1")
	}
	if retrieved.Title != "Test Task" {
		t.Errorf("Expected title 'Test Task', got '%s'", retrieved.Title)
	}

	// Test getting non-existent task
	notFound := swarm.GetTask("non-existent")
	if notFound != nil {
		t.Error("Expected nil for non-existent task")
	}
}

func TestSwarmGetTaskConcurrent(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	// Add tasks
	for i := 0; i < 100; i++ {
		swarm.tasks[string(rune(i))] = &Task{ID: string(rune(i))}
	}

	// Concurrent reads
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				_ = swarm.GetTask(string(rune(j)))
			}
		}()
	}
	wg.Wait()
}

func TestSwarmGetHandoffManager(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	hm := swarm.GetHandoffManager()
	if hm == nil {
		t.Error("expected non-nil handoff manager")
	}
}

func TestSwarmSetHandoffBroadcaster(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	// Create a mock broadcaster
	mockBc := &mockEventBroadcaster{}

	swarm.SetHandoffBroadcaster(mockBc)

	// Verify no panic - broadcaster is set on handoffManager
}

func TestSwarmBroadcastToWorkers(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	ctx := context.Background()

	// BroadcastToWorkers with no agents should return empty map
	errors := swarm.BroadcastToWorkers(ctx, "test message")
	if len(errors) != 0 {
		t.Errorf("expected 0 errors for empty swarm, got %d", len(errors))
	}
}

func TestSwarmGetResultValidator(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	rv := swarm.GetResultValidator()
	if rv == nil {
		t.Error("expected non-nil result validator")
	}
}

func TestSwarmGetTerminationPolicy(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	tp := swarm.GetTerminationPolicy()
	if tp == nil {
		t.Error("expected non-nil termination policy")
	}
}

func TestSwarmHandoffCallbacks(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	var requestedCalled, acceptedCalled, completedCalled, rejectedCalled bool

	swarm.OnHandoffRequested(func(req *HandoffRequest) { requestedCalled = true })
	swarm.OnHandoffAccepted(func(req *HandoffRequest) { acceptedCalled = true })
	swarm.OnHandoffCompleted(func(req *HandoffRequest) { completedCalled = true })
	swarm.OnHandoffRejected(func(req *HandoffRequest) { rejectedCalled = true })

	// Verify callbacks were registered (no panic)
	_ = requestedCalled
	_ = acceptedCalled
	_ = completedCalled
	_ = rejectedCalled
}

func TestSwarmGetHandoffStats(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	// GetHandoffStats should return stats from handoffManager
	stats := swarm.GetHandoffStats()
	if stats == nil {
		t.Error("expected non-nil handoff stats")
	}
}

func TestSwarmRequestHandoff(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	ctx := context.Background()

	// RequestHandoff should return error for non-existent agents
	_, err := swarm.RequestHandoff(ctx, "from-agent", "to-agent", "task-1", "test", nil)
	// Expected to fail because to-agent doesn't exist
	if err == nil {
		t.Error("expected error for non-existent to-agent")
	}
}

func TestSwarmRejectHandoff(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	ctx := context.Background()

	// RejectHandoff should return error for non-existent request
	err := swarm.RejectHandoff(ctx, "non-existent-request", "test reason")
	if err == nil {
		t.Error("expected error for non-existent request")
	}
}

func TestSwarmCompleteHandoff(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "swarm-1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	ctx := context.Background()

	// CompleteHandoff should return error for non-existent request
	err := swarm.CompleteHandoff(ctx, "non-existent-request")
	if err == nil {
		t.Error("expected error for non-existent request")
	}
}

// --- Additional coverage tests for BroadcastToWorkers, GetStats, AcceptHandoff ---

func TestSwarm_BroadcastToWorkers_OnlyCoordinator(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "s1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	coord := agent.NewAgent("coord", agent.AgentTypeOrchestrator)
	swarm.AddAgent(coord)
	swarm.SetCoordinator(coord)

	ctx := context.Background()
	errs := swarm.BroadcastToWorkers(ctx, "hello workers")
	if len(errs) != 0 {
		t.Errorf("expected 0 errors when only coordinator, got %d", len(errs))
	}
}

func TestSwarm_BroadcastToWorkers_WithWorkers(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "s1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	coord := agent.NewAgent("coord", agent.AgentTypeOrchestrator)
	swarm.AddAgent(coord)
	swarm.SetCoordinator(coord)

	// Add workers (no ACP connections, so Execute will return ErrNoConnection)
	w1 := agent.NewAgent("w1", agent.AgentTypeCoder)
	w2 := agent.NewAgent("w2", agent.AgentTypeCoder)
	swarm.AddAgent(w1)
	swarm.AddAgent(w2)

	ctx := context.Background()
	errs := swarm.BroadcastToWorkers(ctx, "hello workers")

	// Both workers should have errors (no connection), but broadcast should complete without panic
	if len(errs) != 2 {
		t.Errorf("expected 2 errors (no connection for each worker), got %d", len(errs))
	}
	if _, ok := errs[w1.ID]; !ok {
		t.Errorf("expected error for worker w1")
	}
	if _, ok := errs[w2.ID]; !ok {
		t.Errorf("expected error for worker w2")
	}
	// Coordinator should NOT be in the error map
	if _, ok := errs[coord.ID]; ok {
		t.Errorf("coordinator should not be in error map")
	}
}

func TestSwarm_BroadcastToWorkers_NoCoordinator(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "s1",
		Name:     "Test",
		Topology: TopologyMesh,
		Strategy: StrategyParallel,
	})

	// Add agents but no coordinator set
	w1 := agent.NewAgent("w1", agent.AgentTypeCoder)
	w2 := agent.NewAgent("w2", agent.AgentTypeReviewer)
	swarm.AddAgent(w1)
	swarm.AddAgent(w2)

	ctx := context.Background()
	errs := swarm.BroadcastToWorkers(ctx, "hello")

	// All agents are workers when no coordinator is set
	if len(errs) != 2 {
		t.Errorf("expected 2 errors when no coordinator, got %d", len(errs))
	}
}

func TestSwarm_BroadcastToWorkers_ContextCancelled(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "s1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	w1 := agent.NewAgent("w1", agent.AgentTypeCoder)
	swarm.AddAgent(w1)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	errs := swarm.BroadcastToWorkers(ctx, "hello")
	// Should complete without panic, error map may or may not have the entry
	// depending on whether Execute checks context before returning ErrNoConnection
	_ = errs
}

func TestSwarm_GetStats_Empty(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "s1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	stats := swarm.GetStats()
	if stats == nil {
		t.Fatal("expected non-nil stats")
	}
	if stats.AgentCount != 0 {
		t.Errorf("expected 0 agents, got %d", stats.AgentCount)
	}
	if stats.IdleAgents != 0 {
		t.Errorf("expected 0 idle agents, got %d", stats.IdleAgents)
	}
	if stats.ExecutingAgents != 0 {
		t.Errorf("expected 0 executing agents, got %d", stats.ExecutingAgents)
	}
	if stats.PendingTasks != 0 {
		t.Errorf("expected 0 pending tasks, got %d", stats.PendingTasks)
	}
	if stats.CompletedTasks != 0 {
		t.Errorf("expected 0 completed tasks, got %d", stats.CompletedTasks)
	}
	if stats.Topology != "star" {
		t.Errorf("expected topology star, got %s", stats.Topology)
	}
	if stats.Strategy != "parallel" {
		t.Errorf("expected strategy parallel, got %s", stats.Strategy)
	}
	if stats.State != "initializing" {
		t.Errorf("expected state initializing, got %s", stats.State)
	}
}

func TestSwarm_GetStats_WithMixedStates(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "s1",
		Name:     "Test",
		Topology: TopologyMesh,
		Strategy: StrategySequential,
	})

	idleAgent := agent.NewAgent("idle-1", agent.AgentTypeCoder)
	swarm.AddAgent(idleAgent)

	execAgent := agent.NewAgent("exec-1", agent.AgentTypeCoder)
	execAgent.SetState(agent.StateExecuting)
	swarm.AddAgent(execAgent)

	thinkAgent := agent.NewAgent("think-1", agent.AgentTypeOrchestrator)
	thinkAgent.SetState(agent.StateThinking)
	swarm.AddAgent(thinkAgent)

	stats := swarm.GetStats()
	if stats.AgentCount != 3 {
		t.Errorf("expected 3 agents, got %d", stats.AgentCount)
	}
	if stats.IdleAgents != 1 {
		t.Errorf("expected 1 idle agent, got %d", stats.IdleAgents)
	}
	if stats.ExecutingAgents != 2 {
		t.Errorf("expected 2 executing/thinking agents, got %d", stats.ExecutingAgents)
	}
	if stats.Topology != "mesh" {
		t.Errorf("expected topology mesh, got %s", stats.Topology)
	}
	if stats.Strategy != "sequential" {
		t.Errorf("expected strategy sequential, got %s", stats.Strategy)
	}
}

func TestSwarm_GetStats_WithTasks(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "s1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	a := agent.NewAgent("a1", agent.AgentTypeCoder)
	swarm.AddAgent(a)

	// Manually add pending and completed tasks
	swarm.taskQueue = append(swarm.taskQueue, &Task{ID: "t1"}, &Task{ID: "t2"})
	swarm.completed = append(swarm.completed, &Task{ID: "t3"}, &Task{ID: "t4"}, &Task{ID: "t5"})

	stats := swarm.GetStats()
	if stats.PendingTasks != 2 {
		t.Errorf("expected 2 pending tasks, got %d", stats.PendingTasks)
	}
	if stats.CompletedTasks != 3 {
		t.Errorf("expected 3 completed tasks, got %d", stats.CompletedTasks)
	}
}

func TestSwarm_GetStats_AfterStartStop(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "s1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	ctx := context.Background()
	swarm.Start(ctx)

	stats := swarm.GetStats()
	if stats.State != "active" {
		t.Errorf("expected state active after Start, got %s", stats.State)
	}

	swarm.Stop()
	stats = swarm.GetStats()
	if stats.State != "stopped" {
		t.Errorf("expected state stopped after Stop, got %s", stats.State)
	}
}

func TestSwarm_AcceptHandoff_NotFound(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "s1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	ctx := context.Background()
	err := swarm.AcceptHandoff(ctx, "nonexistent-request", "test summary")
	if err == nil {
		t.Error("expected error for nonexistent handoff request")
	}
}

func TestSwarm_AcceptHandoff_Success(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "s1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	fromAgent := agent.NewAgent("from-1", agent.AgentTypeCoder)
	toAgent := agent.NewAgent("to-1", agent.AgentTypeCoder)
	swarm.AddAgent(fromAgent)
	swarm.AddAgent(toAgent)

	ctx := context.Background()

	// Create a pending handoff request
	req, err := swarm.RequestHandoff(ctx, string(fromAgent.ID), string(toAgent.ID), "task-1", "need help", nil)
	if err != nil {
		t.Fatalf("RequestHandoff failed: %v", err)
	}
	if req == nil {
		t.Fatal("RequestHandoff returned nil request")
	}

	// Verify it's in pending stats
	stats := swarm.GetHandoffStats()
	if stats[HandoffStatePending] != 1 {
		t.Errorf("expected 1 pending handoff, got %d", stats[HandoffStatePending])
	}

	// Accept the handoff
	err = swarm.AcceptHandoff(ctx, req.ID, "accepted summary")
	if err != nil {
		t.Fatalf("AcceptHandoff failed: %v", err)
	}

	// Verify state transitioned
	stats = swarm.GetHandoffStats()
	if stats[HandoffStatePending] != 0 {
		t.Errorf("expected 0 pending handoffs after accept, got %d", stats[HandoffStatePending])
	}
	if stats[HandoffStateAccepted] != 1 {
		t.Errorf("expected 1 accepted handoff, got %d", stats[HandoffStateAccepted])
	}
}

func TestSwarm_AcceptHandoff_WithUpdatedVars(t *testing.T) {
	swarm := NewSwarm(SwarmConfig{
		ID:       "s1",
		Name:     "Test",
		Topology: TopologyStar,
		Strategy: StrategyParallel,
	})

	fromAgent := agent.NewAgent("from-1", agent.AgentTypeCoder)
	toAgent := agent.NewAgent("to-1", agent.AgentTypeCoder)
	swarm.AddAgent(fromAgent)
	swarm.AddAgent(toAgent)

	ctx := context.Background()

	// Create handoff with context
	handoffCtx := &HandoffContext{
		ContextVariables: map[string]any{"key1": "value1"},
	}
	req, err := swarm.RequestHandoff(ctx, string(fromAgent.ID), string(toAgent.ID), "task-1", "need help", handoffCtx)
	if err != nil {
		t.Fatalf("RequestHandoff failed: %v", err)
	}

	// Accept with updated vars
	updatedVars := map[string]any{"key2": "value2", "key1": "updated"}
	err = swarm.AcceptHandoff(ctx, req.ID, "accepted with updates", updatedVars)
	if err != nil {
		t.Fatalf("AcceptHandoff with vars failed: %v", err)
	}

	// Verify the context was merged (request moved to active)
	stats := swarm.GetHandoffStats()
	if stats[HandoffStateAccepted] != 1 {
		t.Errorf("expected 1 accepted handoff, got %d", stats[HandoffStateAccepted])
	}
}

// ==================== resolveSpeakerSelector Tests ====================

func TestResolveSpeakerSelector_Default(t *testing.T) {
	o := NewOrchestrator(nil)
	w := o.CreateWorkflow("test", ModeGroupChat)
	w.AddNode(&WorkflowNode{
		ID:      "node-1",
		AgentID: "agent-1",
	})

	sel := o.resolveSpeakerSelector(w)
	if sel == nil {
		t.Fatal("expected non-nil selector")
	}
	// Default (no config) should return RoundRobinSelector
	_, ok := sel.(*RoundRobinSelector)
	if !ok {
		t.Errorf("expected RoundRobinSelector for default config, got %T", sel)
	}
}

func TestResolveSpeakerSelector_Random(t *testing.T) {
	o := NewOrchestrator(nil)
	w := o.CreateWorkflow("test", ModeGroupChat)
	w.AddNode(&WorkflowNode{
		ID:      "node-1",
		AgentID: "agent-1",
		Config: map[string]any{
			"speaker_policy": "random",
		},
	})

	sel := o.resolveSpeakerSelector(w)
	if sel == nil {
		t.Fatal("expected non-nil selector")
	}
	_, ok := sel.(*RandomSelector)
	if !ok {
		t.Errorf("expected RandomSelector for random policy, got %T", sel)
	}
}

func TestResolveSpeakerSelector_Auto_WithCustomFunc(t *testing.T) {
	o := NewOrchestrator(nil)
	w := o.CreateWorkflow("test", ModeGroupChat)
	w.AddNode(&WorkflowNode{
		ID:      "node-1",
		AgentID: "agent-1",
		Config: map[string]any{
			"speaker_policy": "auto",
			"speaker_selector_fn": func(turns int, messages []GroupChatMessage, nodes []*WorkflowNode) int {
				return 0 // Always select first node
			},
		},
	})

	sel := o.resolveSpeakerSelector(w)
	if sel == nil {
		t.Fatal("expected non-nil selector")
	}
	fnSel, ok := sel.(*FuncSelector)
	if !ok {
		t.Fatalf("expected FuncSelector for auto policy with custom function, got %T", sel)
	}
	// Verify the function works
	idx := fnSel.Select(1, nil, nil)
	if idx != 0 {
		t.Errorf("expected custom function to return 0, got %d", idx)
	}
}

func TestResolveSpeakerSelector_Auto_WithoutCustomFunc(t *testing.T) {
	o := NewOrchestrator(nil)
	w := o.CreateWorkflow("test", ModeGroupChat)
	w.AddNode(&WorkflowNode{
		ID:      "node-1",
		AgentID: "agent-1",
		Config: map[string]any{
			"speaker_policy": "auto",
			// No speaker_selector_fn - should fall back to round robin
		},
	})

	sel := o.resolveSpeakerSelector(w)
	if sel == nil {
		t.Fatal("expected non-nil selector")
	}
	_, ok := sel.(*RoundRobinSelector)
	if !ok {
		t.Errorf("expected RoundRobinSelector fallback for auto without custom function, got %T", sel)
	}
}

func TestResolveSpeakerSelector_Manual_WithSignal(t *testing.T) {
	o := NewOrchestrator(nil)
	w := o.CreateWorkflow("test", ModeGroupChat)
	w.AddNode(&WorkflowNode{
		ID:      "node-1",
		AgentID: "agent-1",
		Config: map[string]any{
			"speaker_policy": "manual",
		},
	})
	w.AddNode(&WorkflowNode{
		ID:      "node-2",
		AgentID: "agent-2",
	})

	// Add a next_speaker signal to the signal bus
	o.signalBus.pendingSignals[w.ID] = append(
		o.signalBus.pendingSignals[w.ID],
		&Signal{Name: "next_speaker", Input: "agent-2"},
	)

	sel := o.resolveSpeakerSelector(w)
	if sel == nil {
		t.Fatal("expected non-nil selector")
	}

	nodes := w.Nodes
	idx := sel.Select(1, nil, nodes)
	if idx != 1 {
		t.Errorf("expected manual selector to return index 1 (agent-2), got %d", idx)
	}

	// Signal should be consumed
	signals := o.signalBus.PeekSignals(w.ID)
	for _, sig := range signals {
		if sig.Name == "next_speaker" {
			t.Error("expected next_speaker signal to be consumed")
		}
	}
}

func TestResolveSpeakerSelector_Manual_NoSignal(t *testing.T) {
	o := NewOrchestrator(nil)
	w := o.CreateWorkflow("test", ModeGroupChat)
	w.AddNode(&WorkflowNode{
		ID:      "node-1",
		AgentID: "agent-1",
		Config: map[string]any{
			"speaker_policy": "manual",
		},
	})

	sel := o.resolveSpeakerSelector(w)
	if sel == nil {
		t.Fatal("expected non-nil selector")
	}

	// No signal available - should return -1 (end chat)
	idx := sel.Select(1, nil, w.Nodes)
	if idx != -1 {
		t.Errorf("expected manual selector to return -1 when no signal, got %d", idx)
	}
}

func TestResolveSpeakerSelector_Manual_UnknownAgent(t *testing.T) {
	o := NewOrchestrator(nil)
	w := o.CreateWorkflow("test", ModeGroupChat)
	w.AddNode(&WorkflowNode{
		ID:      "node-1",
		AgentID: "agent-1",
		Config: map[string]any{
			"speaker_policy": "manual",
		},
	})

	// Signal references an agent not in the workflow
	o.signalBus.pendingSignals[w.ID] = append(
		o.signalBus.pendingSignals[w.ID],
		&Signal{Name: "next_speaker", Input: "unknown-agent"},
	)

	sel := o.resolveSpeakerSelector(w)
	idx := sel.Select(1, nil, w.Nodes)
	if idx != -1 {
		t.Errorf("expected -1 for unknown agent in manual signal, got %d", idx)
	}
}

func TestResolveSpeakerSelector_Manual_SignalNotString(t *testing.T) {
	o := NewOrchestrator(nil)
	w := o.CreateWorkflow("test", ModeGroupChat)
	w.AddNode(&WorkflowNode{
		ID:      "node-1",
		AgentID: "agent-1",
		Config: map[string]any{
			"speaker_policy": "manual",
		},
	})

	// Signal Input is not a string
	o.signalBus.pendingSignals[w.ID] = append(
		o.signalBus.pendingSignals[w.ID],
		&Signal{Name: "next_speaker", Input: 12345},
	)

	sel := o.resolveSpeakerSelector(w)
	idx := sel.Select(1, nil, w.Nodes)
	// Non-string input should be ignored, return -1
	if idx != -1 {
		t.Errorf("expected -1 for non-string signal input, got %d", idx)
	}
}

func TestResolveSpeakerSelector_UnknownPolicy(t *testing.T) {
	o := NewOrchestrator(nil)
	w := o.CreateWorkflow("test", ModeGroupChat)
	w.AddNode(&WorkflowNode{
		ID:      "node-1",
		AgentID: "agent-1",
		Config: map[string]any{
			"speaker_policy": "unknown_policy",
		},
	})

	sel := o.resolveSpeakerSelector(w)
	if sel == nil {
		t.Fatal("expected non-nil selector for unknown policy")
	}
	// Unknown policy falls through to default case (RoundRobinSelector)
	_, ok := sel.(*RoundRobinSelector)
	if !ok {
		t.Errorf("expected RoundRobinSelector for unknown policy (default), got %T", sel)
	}
}

func TestResolveSpeakerSelector_NoNodes(t *testing.T) {
	o := NewOrchestrator(nil)
	w := o.CreateWorkflow("test", ModeGroupChat)
	// No nodes added

	sel := o.resolveSpeakerSelector(w)
	if sel == nil {
		t.Fatal("expected non-nil selector even with no nodes")
	}
}

// ==================== executeOnAgentsWithPrompt Tests ====================

func TestOrchestrator_ExecuteOnAgents_NoAgents(t *testing.T) {
	s := NewSwarm(SwarmConfig{ID: "s1", Name: "Test", Topology: TopologyStar, Strategy: StrategyParallel})

	task := NewTask("test", "test desc", acp.Prompt{{Type: "text", Text: "hello"}})
	result := &TaskResult{}

	ctx := context.Background()
	err := s.executeOnAgentsWithPrompt(ctx, task, nil, result, task.Prompt)
	if err == nil {
		t.Error("expected error when no agents provided")
	}
	if err.Error() != "no available agents" {
		t.Errorf("expected 'no available agents' error, got '%s'", err.Error())
	}
}

func TestOrchestrator_ExecuteOnAgents_EmptySlice(t *testing.T) {
	s := NewSwarm(SwarmConfig{ID: "s1", Name: "Test", Topology: TopologyStar, Strategy: StrategyParallel})

	task := NewTask("test", "test desc", acp.Prompt{{Type: "text", Text: "hello"}})
	result := &TaskResult{}

	ctx := context.Background()
	err := s.executeOnAgentsWithPrompt(ctx, task, []*agent.Agent{}, result, task.Prompt)
	if err == nil {
		t.Error("expected error when empty agent slice provided")
	}
}

func TestOrchestrator_ExecuteOnAgents_AgentError(t *testing.T) {
	s := NewSwarm(SwarmConfig{ID: "s1", Name: "Test", Topology: TopologyStar, Strategy: StrategyParallel})

	a := agent.NewAgent("agent-1", agent.AgentTypeCoder)
	s.AddAgent(a)

	ctx := context.Background()
	s.Start(ctx)
	defer s.Stop()

	task := NewTask("test", "test desc", acp.Prompt{{Type: "text", Text: "hello"}})
	result := &TaskResult{}

	// Agent has no ACP connection, so Execute will fail
	err := s.executeOnAgentsWithPrompt(ctx, task, []*agent.Agent{a}, result, task.Prompt)
	if err == nil {
		t.Error("expected error when agent has no connection")
	}
}

func TestOrchestrator_ExecuteOnAgents_ContextCancelled(t *testing.T) {
	s := NewSwarm(SwarmConfig{ID: "s1", Name: "Test", Topology: TopologyStar, Strategy: StrategyParallel})

	a := agent.NewAgent("agent-1", agent.AgentTypeCoder)
	s.AddAgent(a)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	s.Start(ctx)
	defer s.Stop()

	task := NewTask("test", "test desc", acp.Prompt{{Type: "text", Text: "hello"}})
	result := &TaskResult{}

	// Should return error (agent execution fails due to cancelled context)
	err := s.executeOnAgentsWithPrompt(ctx, task, []*agent.Agent{a}, result, task.Prompt)
	if err == nil {
		t.Error("expected error when context is cancelled")
	}
}

func TestOrchestrator_ExecuteOnAgents_MaxTurns(t *testing.T) {
	s := NewSwarm(SwarmConfig{ID: "s1", Name: "Test", Topology: TopologyStar, Strategy: StrategyParallel})

	a := agent.NewAgent("agent-1", agent.AgentTypeCoder)
	s.AddAgent(a)

	ctx := context.Background()
	s.Start(ctx)
	defer s.Stop()

	task := NewTask("test", "test desc", acp.Prompt{{Type: "text", Text: "hello"}})
	task.MaxTurns = 1
	result := &TaskResult{}

	// First call increments turns to 1, should succeed
	err := s.executeOnAgentsWithPrompt(ctx, task, []*agent.Agent{a}, result, task.Prompt)
	// Will error because no connection, but turns should be incremented
	_ = err

	// Second call: turns is now 2, exceeds MaxTurns of 1
	err = s.executeOnAgentsWithPrompt(ctx, task, []*agent.Agent{a}, result, task.Prompt)
	if err == nil {
		t.Error("expected error when max_turns exceeded")
	}
	if err != nil && !containsAny(err.Error(), []string{"max_turns", "exceeded", "error"}) {
		t.Logf("unexpected error: %v", err)
	}
}

func TestOrchestrator_ExecuteOnAgents_MultipleAgents_AllFail(t *testing.T) {
	s := NewSwarm(SwarmConfig{ID: "s1", Name: "Test", Topology: TopologyStar, Strategy: StrategyParallel})

	a1 := agent.NewAgent("agent-1", agent.AgentTypeCoder)
	a2 := agent.NewAgent("agent-2", agent.AgentTypeCoder)
	s.AddAgent(a1)
	s.AddAgent(a2)

	ctx := context.Background()
	s.Start(ctx)
	defer s.Stop()

	task := NewTask("test", "test desc", acp.Prompt{{Type: "text", Text: "hello"}})
	result := &TaskResult{}

	// Both agents have no connections - both should fail
	err := s.executeOnAgentsWithPrompt(ctx, task, []*agent.Agent{a1, a2}, result, task.Prompt)
	if err == nil {
		t.Error("expected error when all agents fail")
	}
}

func TestOrchestrator_ExecuteOnAgents_TurnsIncrement(t *testing.T) {
	s := NewSwarm(SwarmConfig{ID: "s1", Name: "Test", Topology: TopologyStar, Strategy: StrategyParallel})

	a := agent.NewAgent("agent-1", agent.AgentTypeCoder)
	s.AddAgent(a)

	ctx := context.Background()
	s.Start(ctx)
	defer s.Stop()

	task := NewTask("test", "test desc", acp.Prompt{{Type: "text", Text: "hello"}})
	result := &TaskResult{}

	if task.TurnCount != 0 {
		t.Fatalf("expected initial turn count 0, got %d", task.TurnCount)
	}

	// executeOnAgentsWithPrompt will fail (no connection) but should still increment turns
	_ = s.executeOnAgentsWithPrompt(ctx, task, []*agent.Agent{a}, result, task.Prompt)

	if task.TurnCount != 1 {
		t.Errorf("expected turn count 1 after execution, got %d", task.TurnCount)
	}
}
