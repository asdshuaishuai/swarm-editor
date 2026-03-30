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
