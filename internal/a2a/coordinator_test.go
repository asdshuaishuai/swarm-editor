package a2a

import (
	"context"
	"testing"
	"time"
)

func TestCoordinatorCreation(t *testing.T) {
	router := NewRouter(RouterConfig{})
	config := CoordinatorConfig{
		MaxConcurrent: 10,
		TaskTimeout:   5 * time.Minute,
	}

	coordinator := NewCoordinator(config, router)

	if coordinator == nil {
		t.Fatal("Expected coordinator to be created")
	}

	if coordinator.config.MaxConcurrent != 10 {
		t.Errorf("Expected MaxConcurrent 10, got %d", coordinator.config.MaxConcurrent)
	}
}

func TestCoordinatorDefaultConfig(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	if coordinator.config.MaxConcurrent != 10 {
		t.Errorf("Expected default MaxConcurrent 10, got %d", coordinator.config.MaxConcurrent)
	}

	if coordinator.config.TaskTimeout != 30*time.Minute {
		t.Errorf("Expected default TaskTimeout 30m, got %v", coordinator.config.TaskTimeout)
	}

	if coordinator.config.Strategy != StrategyCollaborative {
		t.Errorf("Expected default Strategy %s, got %s", StrategyCollaborative, coordinator.config.Strategy)
	}
}

func TestCoordinatorRegisterAgent(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	coordinator.RegisterAgent("agent1", []string{"coding", "testing"})

	if coordinator.agents["agent1"] == nil {
		t.Error("Agent should be registered")
	}

	if coordinator.agents["agent1"].Capabilities[0] != "coding" {
		t.Error("Agent capabilities should be preserved")
	}
}

func TestCoordinatorUnregisterAgent(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	coordinator.RegisterAgent("agent1", []string{})
	coordinator.UnregisterAgent("agent1")

	if coordinator.agents["agent1"] != nil {
		t.Error("Agent should be unregistered")
	}
}

func TestCoordinatorSubmitTask(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	task := &CoordinationTask{
		ID:       "task1",
		Priority: 1,
	}

	ctx := context.Background()
	err := coordinator.SubmitTask(ctx, task)
	if err != nil {
		t.Errorf("Failed to submit task: %v", err)
	}

	if coordinator.pendingTasks["task1"] == nil {
		t.Error("Task should be in pending tasks")
	}
}

func TestCoordinatorTaskDependencies(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	ctx := context.Background()

	// Submit task with dependency
	task1 := &CoordinationTask{ID: "task1", Priority: 1}
	task2 := &CoordinationTask{
		ID:           "task2",
		Priority:     2,
		Dependencies: []string{"task1"},
	}

	coordinator.SubmitTask(ctx, task1)
	coordinator.SubmitTask(ctx, task2)

	// Task2 should not be ready until task1 is done
	if coordinator.areDependenciesMet(task2) {
		t.Error("Task2 should not be ready - task1 not completed")
	}

	// Complete task1 with proper status
	task1.Status = "completed"
	coordinator.completedTasks["task1"] = task1

	if !coordinator.areDependenciesMet(task2) {
		t.Error("Task2 should be ready after task1 is completed")
	}
}

func TestCoordinatorSelectAgent(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{Strategy: StrategyRoundRobin}, router)

	// Register agents
	coordinator.RegisterAgent("agent1", []string{})
	coordinator.RegisterAgent("agent2", []string{})

	task := &CoordinationTask{ID: "task1"}

	agents := coordinator.selectAgents(task)
	if len(agents) == 0 {
		t.Error("Expected to select an agent")
	}
}

func TestCoordinatorStrategies(t *testing.T) {
	router := NewRouter(RouterConfig{})

	tests := []struct {
		strategy SchedulingStrategy
	}{
		{StrategyRoundRobin},
		{StrategyLeastLoaded},
		{StrategyCapability},
		{StrategyCollaborative},
		{StrategySwarm},
	}

	for _, tt := range tests {
		t.Run(string(tt.strategy), func(t *testing.T) {
			config := CoordinatorConfig{Strategy: tt.strategy}
			coordinator := NewCoordinator(config, router)

			coordinator.RegisterAgent("agent1", []string{})
			coordinator.RegisterAgent("agent2", []string{})

			task := &CoordinationTask{ID: "task1"}
			agents := coordinator.selectAgents(task)

			// Swarm strategy may return nil without pheromones
			if len(agents) == 0 && tt.strategy != StrategySwarm {
				t.Errorf("Expected agent selection for strategy %s", tt.strategy)
			}
		})
	}
}

func TestCoordinatorLeastLoadedStrategy(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{Strategy: StrategyLeastLoaded}, router)

	// Register agents with different loads
	coordinator.RegisterAgent("agent1", []string{})
	coordinator.RegisterAgent("agent2", []string{})

	// Set different loads
	coordinator.agents["agent1"].Load = 0.8
	coordinator.agents["agent2"].Load = 0.2

	task := &CoordinationTask{ID: "task1"}
	agents := coordinator.selectAgents(task)

	// Should select agent2 (least loaded)
	if len(agents) > 0 && agents[0] != "agent2" {
		t.Errorf("Expected agent2 (least loaded), got %s", agents[0])
	}
}

func TestCoordinatorCapabilityStrategy(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{Strategy: StrategyCapability}, router)

	// Register agents with different capabilities
	coordinator.RegisterAgent("agent1", []string{"testing"})
	coordinator.RegisterAgent("agent2", []string{"coding", "testing"})

	task := &CoordinationTask{
		ID:           "task1",
		RequiredRole: "coding",
	}

	agents := coordinator.selectAgents(task)

	// Should select agent2 (has coding capability)
	if len(agents) > 0 && agents[0] != "agent2" {
		t.Errorf("Expected agent2 (has coding capability), got %s", agents[0])
	}
}

func TestCoordinatorGetStats(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	coordinator.RegisterAgent("agent1", []string{})
	coordinator.SubmitTask(context.Background(), &CoordinationTask{ID: "task1"})
	coordinator.runningTasks["task2"] = &CoordinationTask{ID: "task2"}
	coordinator.completedTasks["task3"] = &CoordinationTask{ID: "task3"}

	stats := coordinator.GetStats()

	if stats.TotalAgents != 1 {
		t.Errorf("Expected 1 agent, got %d", stats.TotalAgents)
	}

	if stats.PendingTasks != 1 {
		t.Errorf("Expected 1 pending task, got %d", stats.PendingTasks)
	}

	if stats.RunningTasks != 1 {
		t.Errorf("Expected 1 running task, got %d", stats.RunningTasks)
	}

	if stats.CompletedTasks != 1 {
		t.Errorf("Expected 1 completed task, got %d", stats.CompletedTasks)
	}
}

func TestCoordinatorLifecycle(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	err := coordinator.Start(ctx)
	if err != nil {
		t.Fatalf("Failed to start coordinator: %v", err)
	}

	// Let it run briefly
	time.Sleep(50 * time.Millisecond)

	// Stop should not block
	done := make(chan struct{})
	go func() {
		coordinator.Stop()
		close(done)
	}()

	select {
	case <-done:
		// Good
	case <-time.After(time.Second):
		t.Error("Stop took too long")
	}
}

func TestCoordinatorPheromones(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	// Deposit pheromone
	coordinator.leavePheromone("coding", "agent1")

	// Check pheromone exists (key is "coding:agent1")
	key := "coding:agent1"
	if coordinator.pheromones[key] == nil {
		t.Error("Expected coding pheromone trail")
	}
}

func TestCoordinatorCallbacks(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	assignedCalled := false
	completedCalled := false

	coordinator.OnTaskAssigned(func(task *CoordinationTask, agent string) {
		assignedCalled = true
	})

	coordinator.OnTaskComplete(func(task *CoordinationTask, result *TaskResult) {
		completedCalled = true
	})

	// Verify callbacks are set
	if coordinator.onTaskAssigned == nil {
		t.Error("OnTaskAssigned callback should be set")
	}

	if coordinator.onTaskComplete == nil {
		t.Error("OnTaskComplete callback should be set")
	}

	// Trigger manually
	coordinator.onTaskAssigned(&CoordinationTask{ID: "task1"}, "agent1")
	coordinator.onTaskComplete(&CoordinationTask{ID: "task1"}, &TaskResult{})

	if !assignedCalled {
		t.Error("OnTaskAssigned callback should have been called")
	}

	if !completedCalled {
		t.Error("OnTaskComplete callback should have been called")
	}
}

func TestCoordinatorGetNextTask(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	ctx := context.Background()

	// Add tasks with different priorities
	coordinator.SubmitTask(ctx, &CoordinationTask{ID: "task1", Priority: 1})
	coordinator.SubmitTask(ctx, &CoordinationTask{ID: "task2", Priority: 3})
	coordinator.SubmitTask(ctx, &CoordinationTask{ID: "task3", Priority: 2})

	next := coordinator.getNextTask()
	if next == nil {
		t.Fatal("Expected to get a task")
	}

	// Should return highest priority
	if next.ID != "task2" {
		t.Errorf("Expected task2 (priority 3), got %s (priority %d)", next.ID, next.Priority)
	}
}
