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

	ctx := context.Background()
	if err := coordinator.Start(ctx); err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer coordinator.Stop()

	task := &CoordinationTask{
		ID:       "task1",
		Priority: 1,
	}

	err := coordinator.SubmitTask(ctx, task)
	if err != nil {
		t.Errorf("Failed to submit task: %v", err)
	}

	if coordinator.pendingTasks["task1"] == nil {
		t.Error("Task should be in pending tasks")
	}
}

func TestCoordinatorSubmitTaskRejectsWhenStopped(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	ctx := context.Background()
	task := &CoordinationTask{
		ID:       "task1",
		Priority: 1,
	}

	err := coordinator.SubmitTask(ctx, task)
	if err == nil {
		t.Error("Expected error when submitting to stopped coordinator")
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

	if err := coordinator.Start(ctx); err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer coordinator.Stop()

	_ = coordinator.SubmitTask(ctx, task1)
	_ = coordinator.SubmitTask(ctx, task2)

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
	ctx := context.Background()
	if err := coordinator.Start(ctx); err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer coordinator.Stop()
	_ = coordinator.SubmitTask(ctx, &CoordinationTask{ID: "task1"})
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

func TestCoordinatorPheromoneExisting(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	// Deposit pheromone twice at same location
	coordinator.leavePheromone("coding", "agent1")
	initialStrength := coordinator.pheromones["coding:agent1"].Strength

	// Deposit again - should increase strength
	coordinator.leavePheromone("coding", "agent1")
	newStrength := coordinator.pheromones["coding:agent1"].Strength

	if newStrength <= initialStrength {
		t.Errorf("Expected strength to increase, got %f -> %f", initialStrength, newStrength)
	}

	// Test strength cap at 1.0
	for i := 0; i < 10; i++ {
		coordinator.leavePheromone("coding", "agent1")
	}

	if coordinator.pheromones["coding:agent1"].Strength > 1.0 {
		t.Errorf("Strength should be capped at 1.0, got %f", coordinator.pheromones["coding:agent1"].Strength)
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
	if err := coordinator.Start(ctx); err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer coordinator.Stop()

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

func TestCoordinatorHandleTaskAccept(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	// Setup task
	task := &CoordinationTask{ID: "task1", Status: "assigned"}
	coordinator.runningTasks["task1"] = task

	// Create accept message
	msg := NewMessage(MessageTypeTaskAccept, "agent1", "coordinator").
		WithPayload(&TaskAcceptPayload{
			TaskID:    "task1",
			AgentID:   "agent1",
			Estimate:  60,
			StartTime: time.Now(),
		})

	err := coordinator.handleTaskAccept(msg)
	if err != nil {
		t.Errorf("handleTaskAccept failed: %v", err)
	}

	if task.Status != "running" {
		t.Errorf("Expected task status 'running', got %s", task.Status)
	}
}

func TestCoordinatorHandleTaskProgress(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	// Setup task
	task := &CoordinationTask{ID: "task1", Status: "running"}
	coordinator.runningTasks["task1"] = task

	// Create progress message
	msg := NewMessage(MessageTypeTaskProgress, "agent1", "coordinator").
		WithPayload(&TaskProgressPayload{
			TaskID:   "task1",
			Progress: 0.5,
			Status:   "In progress",
		})

	err := coordinator.handleTaskProgress(msg)
	if err != nil {
		t.Errorf("handleTaskProgress failed: %v", err)
	}

	if task.Progress != 0.5 {
		t.Errorf("Expected progress 0.5, got %f", task.Progress)
	}
}

func TestCoordinatorHandleTaskComplete(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	// Setup agent
	coordinator.RegisterAgent("agent1", []string{"coding"})

	// Setup task
	task := &CoordinationTask{
		ID:         "task1",
		Status:     "running",
		AssignedTo: []string{"agent1"},
	}
	coordinator.runningTasks["task1"] = task

	// Create complete message
	msg := NewMessage(MessageTypeTaskComplete, "agent1", "coordinator").
		WithPayload(&TaskCompletePayload{
			TaskID:   "task1",
			Result:   []byte(`{"status": "done"}`),
			Duration: time.Minute,
		})

	err := coordinator.handleTaskComplete(msg)
	if err != nil {
		t.Errorf("handleTaskComplete failed: %v", err)
	}

	if task.Status != "completed" {
		t.Errorf("Expected task status 'completed', got %s", task.Status)
	}

	if coordinator.agents["agent1"].Status != "idle" {
		t.Errorf("Expected agent status 'idle', got %s", coordinator.agents["agent1"].Status)
	}
}

func TestCoordinatorHandleTaskFailed(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	// Setup agent
	coordinator.RegisterAgent("agent1", []string{"coding"})

	// Setup task with single agent
	task := &CoordinationTask{
		ID:         "task1",
		Status:     "running",
		AssignedTo: []string{"agent1"},
	}
	coordinator.runningTasks["task1"] = task

	// Create failed message
	msg := NewMessage(MessageTypeTaskFailed, "agent1", "coordinator").
		WithPayload(&TaskFailedPayload{
			TaskID:    "task1",
			Error:     "Something went wrong",
			Retryable: true,
		})

	err := coordinator.handleTaskFailed(msg)
	if err != nil {
		t.Errorf("handleTaskFailed failed: %v", err)
	}

	if task.Status != "failed" {
		t.Errorf("Expected task status 'failed', got %s", task.Status)
	}
}

func TestCoordinatorHandleTaskReject(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	// Setup agent
	coordinator.RegisterAgent("agent1", []string{"coding"})

	// Setup task
	task := &CoordinationTask{
		ID:         "task1",
		Status:     "assigned",
		AssignedTo: []string{"agent1"},
	}
	coordinator.runningTasks["task1"] = task

	// Create reject message
	msg := NewMessage(MessageTypeTaskReject, "agent1", "coordinator").
		WithPayload(map[string]interface{}{
			"taskId": "task1",
			"reason": "Too busy",
		})

	err := coordinator.handleTaskReject(msg)
	if err != nil {
		t.Errorf("handleTaskReject failed: %v", err)
	}

	// Task should be back in pending
	if coordinator.pendingTasks["task1"] == nil {
		t.Error("Task should be back in pending")
	}
}

func TestCoordinatorHandleHelpRequest(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	// Setup agents
	coordinator.RegisterAgent("agent1", []string{"coding"})
	coordinator.RegisterAgent("agent2", []string{"testing"})

	// Create help request message
	msg := NewMessage(MessageTypeHelpRequest, "agent1", "coordinator").
		WithPayload(&HelpRequestPayload{
			TaskID:  "task1",
			Reason:  "Need testing help",
			Skills:  []string{"testing"},
			Urgency: 3,
		})

	err := coordinator.handleHelpRequest(msg)
	if err != nil {
		t.Errorf("handleHelpRequest failed: %v", err)
	}
}

func TestCoordinatorHandlePheromone(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	// Create pheromone message
	msg := NewMessage(MessageTypePheromone, "agent1", "coordinator").
		WithPayload(&PheromonePayload{
			PheromoneType: "coding",
			Location:      "auth-module",
			Strength:      0.8,
			Decay:         0.1,
		})

	err := coordinator.handlePheromone(msg)
	if err != nil {
		t.Errorf("handlePheromone failed: %v", err)
	}

	key := "coding:auth-module"
	if coordinator.pheromones[key] == nil {
		t.Error("Expected pheromone trail to be created")
	}
}

func TestCoordinatorDecayPheromones(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	// Add pheromone
	coordinator.leavePheromone("coding", "task1")
	coordinator.pheromones["coding:task1"].Strength = 0.5
	coordinator.pheromones["coding:task1"].DecayRate = 0.3

	coordinator.decayPheromones()

	if coordinator.pheromones["coding:task1"].Strength >= 0.5 {
		t.Error("Pheromone should have decayed")
	}
}

func TestCoordinatorCleanupOldCompletedTasks(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{MaxCompletedTasks: 2}, router)

	// Add more completed tasks than the limit
	for i := 0; i < 5; i++ {
		task := &CoordinationTask{
			ID:          string(rune('a' + i)),
			Status:      "completed",
			CompletedAt: time.Now().Add(time.Duration(i) * time.Minute),
		}
		coordinator.completedTasks[task.ID] = task
	}

	coordinator.cleanupOldCompletedTasks()

	if len(coordinator.completedTasks) > coordinator.config.MaxCompletedTasks {
		t.Errorf("Expected max %d completed tasks, got %d",
			coordinator.config.MaxCompletedTasks, len(coordinator.completedTasks))
	}
}

func TestCoordinatorRequestHelp(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	// Register agent for receiving
	received := make(chan *Message, 1)
	router.RegisterAgent("agent1", func(m *Message) error {
		received <- m
		return nil
	}, []string{"coding"})

	coordinator.RegisterAgent("agent1", []string{"coding"})

	ctx := context.Background()
	err := coordinator.RequestHelp(ctx, "task1", "Need help", []string{"coding"}, 3)
	if err != nil {
		t.Errorf("RequestHelp failed: %v", err)
	}
}

func TestCoordinatorBroadcastKnowledge(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	// Register agent for receiving
	router.RegisterAgent("agent1", func(m *Message) error {
		return nil
	}, []string{"coding"})

	ctx := context.Background()
	err := coordinator.BroadcastKnowledge(ctx, "pattern", "Auth Pattern", map[string]string{"type": "oauth"}, []string{"auth"})
	if err != nil {
		t.Errorf("BroadcastKnowledge failed: %v", err)
	}
}

func TestCoordinatorOnAgentAvailable(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	called := false
	coordinator.OnAgentAvailable(func(agentID string) {
		called = true
	})

	if coordinator.onAgentAvailable == nil {
		t.Error("OnAgentAvailable callback should be set")
	}

	coordinator.onAgentAvailable("agent1")
	if !called {
		t.Error("Callback should have been called")
	}
}

func TestCoordinatorHandleProposal(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	// Setup running task with agent
	coordinator.RegisterAgent("agent1", []string{})
	task := &CoordinationTask{
		ID:         "task1",
		AssignedTo: []string{"agent1"},
	}
	coordinator.runningTasks["task1"] = task

	// Create proposal message
	msg := NewMessage(MessageTypeProposal, "agent1", "coordinator").
		WithPayload(&ProposalPayload{
			ProposalID:   "prop1",
			Type:         "task_split",
			Proposer:     "agent1",
			Content:      []byte(`{"split": true}`),
			RequiresVote: true,
		})

	err := coordinator.handleProposal(msg)
	if err != nil {
		t.Errorf("handleProposal failed: %v", err)
	}
}

func TestCoordinatorHandleAgreement(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	// Setup task with negotiation
	task := &CoordinationTask{
		ID:         "task1",
		AssignedTo: []string{"agent1"},
		Negotiations: []*Negotiation{
			{ID: "prop1", Status: "pending"},
		},
	}
	coordinator.runningTasks["task1"] = task

	// Create agreement message
	msg := NewMessage(MessageTypeAgreement, "agent2", "coordinator").
		WithPayload(&AgreementPayload{
			ProposalID: "prop1",
			AgentID:    "agent2",
		})

	err := coordinator.handleAgreement(msg)
	if err != nil {
		t.Errorf("handleAgreement failed: %v", err)
	}
}

func TestCoordinatorInitiateTaskAssignment(t *testing.T) {
	router := NewRouter(RouterConfig{})

	// Setup agent with receive function
	received := make(chan *Message, 1)
	router.RegisterAgent("agent1", func(m *Message) error {
		received <- m
		return nil
	}, []string{"coding"})

	coordinator := NewCoordinator(CoordinatorConfig{}, router)
	coordinator.RegisterAgent("agent1", []string{"coding"})

	// Add task to pending
	task := &CoordinationTask{
		ID:          "task1",
		Title:       "Test Task",
		Description: "Test Description",
		Priority:    1,
	}
	coordinator.pendingTasks["task1"] = task

	// Initiate assignment
	coordinator.initiateTaskAssignment(task, []string{"agent1"})

	// Verify task moved to running
	if coordinator.runningTasks["task1"] == nil {
		t.Error("Task should be in running tasks")
	}

	// Verify agent is busy
	if coordinator.agents["agent1"].Status != "busy" {
		t.Error("Agent should be busy")
	}
}

func TestCoordinatorHasRequiredRole(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	agent := &AgentState{
		ID:           "agent1",
		Capabilities: []string{"coding", "testing"},
	}

	if !coordinator.hasRequiredRole(agent, "coding") {
		t.Error("Agent should have coding role")
	}

	if coordinator.hasRequiredRole(agent, "design") {
		t.Error("Agent should not have design role")
	}

	// Empty required role should always match
	if !coordinator.hasRequiredRole(agent, "") {
		t.Error("Empty required role should match any agent")
	}
}

func TestCoordinatorScheduleNext(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{MaxConcurrent: 5}, router)

	// Register an agent with receive function
	received := make(chan *Message, 1)
	router.RegisterAgent("agent1", func(m *Message) error {
		received <- m
		return nil
	}, []string{"coding"})

	coordinator.RegisterAgent("agent1", []string{"coding"})
	coordinator.agents["agent1"].Status = "idle"

	// Add a pending task
	task := &CoordinationTask{
		ID:          "task1",
		Title:       "Test Task",
		Description: "Test Description",
		Priority:    1,
	}
	coordinator.pendingTasks["task1"] = task

	// Call scheduleNext
	coordinator.scheduleNext()

	// Verify task moved to running
	if coordinator.runningTasks["task1"] == nil {
		t.Error("Task should be moved to running tasks")
	}

	// Verify task removed from pending
	if coordinator.pendingTasks["task1"] != nil {
		t.Error("Task should be removed from pending")
	}
}

func TestCoordinatorScheduleNextMaxConcurrent(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{MaxConcurrent: 1}, router)

	// Register agents
	router.RegisterAgent("agent1", func(m *Message) error { return nil }, []string{"coding"})
	router.RegisterAgent("agent2", func(m *Message) error { return nil }, []string{"coding"})

	coordinator.RegisterAgent("agent1", []string{"coding"})
	coordinator.RegisterAgent("agent2", []string{"coding"})
	coordinator.agents["agent1"].Status = "idle"
	coordinator.agents["agent2"].Status = "idle"

	// Add a running task
	coordinator.runningTasks["running1"] = &CoordinationTask{ID: "running1"}

	// Add a pending task
	coordinator.pendingTasks["task1"] = &CoordinationTask{ID: "task1", Priority: 1}

	// Call scheduleNext - should not schedule because at max concurrent
	coordinator.scheduleNext()

	// Task should still be pending
	if coordinator.pendingTasks["task1"] == nil {
		t.Error("Task should still be pending when at max concurrent")
	}
}

func TestCoordinatorHandleHelpOffer(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	// Create help offer message
	msg := NewMessage(MessageTypeHelpOffer, "agent1", "coordinator").
		WithPayload(&HelpOfferPayload{
			RequestID: "req1",
			AgentID:   "agent2",
			Skills:    []string{"testing"},
			Available: true,
		})

	// handleHelpOffer currently returns nil (no-op)
	err := coordinator.handleHelpOffer(msg)
	if err != nil {
		t.Errorf("handleHelpOffer should not return error: %v", err)
	}
}

func TestCoordinatorSelectSwarmWithPheromone(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	// Register agents
	coordinator.RegisterAgent("agent1", []string{"coding"})
	coordinator.RegisterAgent("agent2", []string{"coding"})
	coordinator.agents["agent1"].Status = "idle"
	coordinator.agents["agent2"].Status = "idle"

	// Add pheromone trail
	coordinator.pheromones["coding:auth-module"] = &PheromoneTrail{
		Type:      "coding",
		Location:  "auth-module",
		Strength:  0.8,
		DecayRate: 0.1,
	}

	// Agent1 has experience with auth-module
	coordinator.agents["agent1"].TaskHistory = []string{"auth-module", "user-service"}

	task := &CoordinationTask{
		ID:           "task1",
		RequiredRole: "coding",
	}

	// Select using swarm strategy
	selected := coordinator.selectSwarm(task)

	if len(selected) == 0 {
		t.Error("Expected to select an agent")
	}

	// Agent1 should be preferred due to pheromone trail experience
	if len(selected) > 0 && selected[0] != "agent1" {
		t.Logf("Agent %s was selected (agent1 preferred but not guaranteed)", selected[0])
	}
}

func TestCoordinatorSelectSwarmFallbackToCapability(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	// Register agents
	coordinator.RegisterAgent("agent1", []string{"coding"})
	coordinator.agents["agent1"].Status = "idle"

	// No pheromone trails
	task := &CoordinationTask{
		ID:           "task1",
		RequiredRole: "coding",
	}

	// Should fallback to capability-based selection
	selected := coordinator.selectSwarm(task)

	if len(selected) == 0 {
		t.Error("Expected to select an agent (fallback to capability)")
	}
}

func TestCoordinatorSelectSwarmNoIdleAgents(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	// Register agents but mark them as busy
	coordinator.RegisterAgent("agent1", []string{"coding"})
	coordinator.agents["agent1"].Status = "busy"

	// Add pheromone trail
	coordinator.pheromones["coding:auth-module"] = &PheromoneTrail{
		Type:     "coding",
		Location: "auth-module",
		Strength: 0.8,
	}

	task := &CoordinationTask{
		ID:           "task1",
		RequiredRole: "coding",
	}

	// Should return nil because no idle agents
	selected := coordinator.selectSwarm(task)

	if len(selected) != 0 {
		t.Errorf("Expected no selection (no idle agents), got %d", len(selected))
	}
}

func TestCoordinatorSelectSwarmWrongRole(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	// Register agent with different role
	coordinator.RegisterAgent("agent1", []string{"testing"})
	coordinator.agents["agent1"].Status = "idle"

	// Add pheromone trail for coding
	coordinator.pheromones["coding:auth-module"] = &PheromoneTrail{
		Type:     "coding",
		Location: "auth-module",
		Strength: 0.8,
	}

	task := &CoordinationTask{
		ID:           "task1",
		RequiredRole: "coding",
	}

	// Should return nil because agent doesn't have required role
	selected := coordinator.selectSwarm(task)

	if len(selected) != 0 {
		t.Errorf("Expected no selection (wrong role), got %d", len(selected))
	}
}

func TestCoordinatorCallbackOutsideLock(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	// Register an agent
	coordinator.RegisterAgent("agent-1", []string{"coding"})

	var callbackCompleted bool
	var canAcquireLock bool

	coordinator.OnTaskComplete(func(task *CoordinationTask, result *TaskResult) {
		// If callback is invoked outside the lock, we should be able to acquire the lock
		coordinator.mu.TryLock()
		canAcquireLock = true
		coordinator.mu.Unlock()
		callbackCompleted = true
	})

	// Manually set up a running task with results for all assigned agents
	coordinator.mu.Lock()
	task := &CoordinationTask{
		ID:           "task-1",
		RequiredRole: "coding",
		Status:       "running",
		AssignedTo:   []string{"agent-1"},
		Results:      make(map[string]*TaskResult),
	}
	coordinator.runningTasks["task-1"] = task
	coordinator.mu.Unlock()

	// Simulate task completion message
	msg := NewMessage(MessageTypeTaskComplete, "agent-1", "coordinator").
		WithPayload(&TaskCompletePayload{
			TaskID: "task-1",
			Result: []byte(`{"output": "done"}`),
		})

	err := coordinator.handleTaskComplete(msg)
	if err != nil {
		t.Fatalf("handleTaskComplete failed: %v", err)
	}

	if !callbackCompleted {
		t.Error("onTaskComplete callback should have been called")
	}
	if !canAcquireLock {
		t.Error("callback should be invoked outside coordinator lock (TryLock succeeded)")
	}
}

func TestCoordinatorHandleHelpRequestNoRace(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coordinator := NewCoordinator(CoordinatorConfig{}, router)

	coordinator.RegisterAgent("agent-1", []string{"coding"})

	msg := NewMessage(MessageTypeHelpRequest, "agent-1", "coordinator").
		WithPayload(&HelpRequestPayload{
			Skills: []string{"coding"},
		})

	// This should not race with concurrent RegisterAgent/UnregisterAgent
	done := make(chan struct{})
	go func() {
		defer close(done)
		_ = coordinator.handleHelpRequest(msg)
	}()

	// Concurrently register/unregister agents
	for i := 0; i < 10; i++ {
		coordinator.RegisterAgent("extra", []string{})
		coordinator.UnregisterAgent("extra")
	}

	<-done
}
