package team

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/a2a"
)

func TestTeamSchedulerCreation(t *testing.T) {
	team := &Team{
		Members: make(map[string]*Member),
	}
	team.Members["agent1"] = &Member{
		ID:   "agent1",
		Role: RoleDeveloper,
	}

	router := a2a.NewRouter(a2a.RouterConfig{})
	coordinator := a2a.NewCoordinator(a2a.CoordinatorConfig{}, router)

	config := TeamSchedulerConfig{
		Mode:        SchedulingModeBestFit,
		MaxParallel: 5,
	}

	scheduler := NewTeamScheduler(config, team, router, coordinator)

	if scheduler == nil {
		t.Fatal("Expected scheduler to be created")
	}

	if scheduler.config.MaxParallel != 5 {
		t.Errorf("Expected MaxParallel 5, got %d", scheduler.config.MaxParallel)
	}
}

func TestTeamSchedulerDefaultConfig(t *testing.T) {
	team := &Team{Members: make(map[string]*Member)}
	router := a2a.NewRouter(a2a.RouterConfig{})
	coordinator := a2a.NewCoordinator(a2a.CoordinatorConfig{}, router)

	config := TeamSchedulerConfig{} // Empty config
	scheduler := NewTeamScheduler(config, team, router, coordinator)

	// Should apply defaults
	if scheduler.config.MaxParallel != 5 {
		t.Errorf("Expected default MaxParallel 5, got %d", scheduler.config.MaxParallel)
	}

	if scheduler.config.TaskTimeout != 30*time.Minute {
		t.Errorf("Expected default TaskTimeout 30m, got %v", scheduler.config.TaskTimeout)
	}
}

func TestTeamSchedulerSubmitTask(t *testing.T) {
	team := &Team{Members: make(map[string]*Member)}
	router := a2a.NewRouter(a2a.RouterConfig{})
	coordinator := a2a.NewCoordinator(a2a.CoordinatorConfig{}, router)

	scheduler := NewTeamScheduler(TeamSchedulerConfig{}, team, router, coordinator)

	task := &ScheduledTask{
		ID:          "task1",
		Title:       "Test Task",
		Description: "Test description",
		Priority:    1,
	}

	err := scheduler.SubmitTask(task)
	if err != nil {
		t.Errorf("Failed to submit task: %v", err)
	}

	if task.Status != "pending" {
		t.Errorf("Expected status 'pending', got %s", task.Status)
	}

	if scheduler.pendingTasks["task1"] == nil {
		t.Error("Task not found in pending tasks")
	}
}

func TestTeamSchedulerGetNextTask(t *testing.T) {
	team := &Team{Members: make(map[string]*Member)}
	router := a2a.NewRouter(a2a.RouterConfig{})
	coordinator := a2a.NewCoordinator(a2a.CoordinatorConfig{}, router)

	scheduler := NewTeamScheduler(TeamSchedulerConfig{}, team, router, coordinator)

	// Add tasks with different priorities
	scheduler.SubmitTask(&ScheduledTask{ID: "task1", Priority: 1})
	scheduler.SubmitTask(&ScheduledTask{ID: "task2", Priority: 3})
	scheduler.SubmitTask(&ScheduledTask{ID: "task3", Priority: 2})

	next := scheduler.getNextTask()
	if next == nil {
		t.Fatal("Expected to get a task")
	}

	// Should return highest priority
	if next.ID != "task2" {
		t.Errorf("Expected task2 (priority 3), got %s (priority %d)", next.ID, next.Priority)
	}
}

func TestTeamSchedulerDependencies(t *testing.T) {
	team := &Team{Members: make(map[string]*Member)}
	router := a2a.NewRouter(a2a.RouterConfig{})
	coordinator := a2a.NewCoordinator(a2a.CoordinatorConfig{}, router)

	scheduler := NewTeamScheduler(TeamSchedulerConfig{}, team, router, coordinator)

	// Add completed task
	scheduler.completedTasks["task1"] = &ScheduledTask{ID: "task1", Status: "completed"}

	// Add task with dependency
	task2 := &ScheduledTask{
		ID:           "task2",
		Dependencies: []string{"task1"},
	}
	scheduler.SubmitTask(task2)

	// Add task with unmet dependency
	task3 := &ScheduledTask{
		ID:           "task3",
		Dependencies: []string{"task-missing"},
	}
	scheduler.SubmitTask(task3)

	// task1 is completed, so task2 should be ready
	if !scheduler.areDependenciesMet(task2) {
		t.Error("Expected task2 dependencies to be met")
	}

	// task-missing is not completed, so task3 should not be ready
	if scheduler.areDependenciesMet(task3) {
		t.Error("Expected task3 dependencies to NOT be met")
	}
}

func TestTeamSchedulerGetAvailableAgents(t *testing.T) {
	team := &Team{
		Members: make(map[string]*Member),
	}
	team.Members["agent1"] = &Member{ID: "agent1", Role: RoleDeveloper}
	team.Members["agent2"] = &Member{ID: "agent2", Role: RoleReviewer}
	team.Members["agent3"] = &Member{ID: "agent3", Role: RoleDeveloper}

	router := a2a.NewRouter(a2a.RouterConfig{})
	coordinator := a2a.NewCoordinator(a2a.CoordinatorConfig{}, router)

	scheduler := NewTeamScheduler(TeamSchedulerConfig{}, team, router, coordinator)

	// Get all developers
	agents := scheduler.getAvailableAgents(RoleDeveloper)
	if len(agents) != 2 {
		t.Errorf("Expected 2 developers, got %d", len(agents))
	}

	// Get all agents (no role filter)
	agents = scheduler.getAvailableAgents("")
	if len(agents) != 3 {
		t.Errorf("Expected 3 agents, got %d", len(agents))
	}
}

func TestTeamSchedulerAgentScoring(t *testing.T) {
	team := &Team{Members: make(map[string]*Member)}
	router := a2a.NewRouter(a2a.RouterConfig{})
	coordinator := a2a.NewCoordinator(a2a.CoordinatorConfig{}, router)

	scheduler := NewTeamScheduler(TeamSchedulerConfig{}, team, router, coordinator)

	// Set up agent performance
	scheduler.agentSuccess["agent1"] = 0.9
	scheduler.agentSuccess["agent2"] = 0.5
	scheduler.agentLoad["agent1"] = 0
	scheduler.agentLoad["agent2"] = 1

	task := &ScheduledTask{Priority: 3}

	score1 := scheduler.calculateAgentScore("agent1", task)
	score2 := scheduler.calculateAgentScore("agent2", task)

	// agent1 should score higher due to higher success rate and lower load
	if score1 <= score2 {
		t.Errorf("Expected agent1 score (%.2f) > agent2 score (%.2f)", score1, score2)
	}
}

func TestTeamSchedulerSelectionModes(t *testing.T) {
	team := &Team{
		Members: make(map[string]*Member),
	}
	team.Members["agent1"] = &Member{ID: "agent1", Role: RoleDeveloper}
	team.Members["agent2"] = &Member{ID: "agent2", Role: RoleDeveloper}
	team.Members["agent3"] = &Member{ID: "agent3", Role: RoleDeveloper}

	router := a2a.NewRouter(a2a.RouterConfig{})
	coordinator := a2a.NewCoordinator(a2a.CoordinatorConfig{}, router)

	task := &ScheduledTask{ID: "task1"}

	tests := []struct {
		mode SchedulingMode
	}{
		{SchedulingModeHierarchical},
		{SchedulingModeRoundRobin},
		{SchedulingModeBestFit},
		{SchedulingModeCollaborative},
		{SchedulingModeAuction},
	}

	for _, tt := range tests {
		t.Run(string(tt.mode), func(t *testing.T) {
			scheduler := NewTeamScheduler(TeamSchedulerConfig{Mode: tt.mode}, team, router, coordinator)

			// Set success rates for auction mode
			if tt.mode == SchedulingModeAuction {
				scheduler.agentSuccess["agent1"] = 0.8
				scheduler.agentSuccess["agent2"] = 0.9
				scheduler.agentSuccess["agent3"] = 0.7
			}

			agents := scheduler.getAvailableAgents(RoleDeveloper)
			selected := scheduler.selectAgents(task)

			if tt.mode == SchedulingModeCollaborative {
				// Collaborative should select 2 agents
				if len(selected) != 2 && len(selected) != len(agents) {
					t.Errorf("Expected 2 agents for collaborative, got %d", len(selected))
				}
			} else {
				// Other modes select 1 agent
				if len(selected) != 1 {
					t.Errorf("Expected 1 agent for %s, got %d", tt.mode, len(selected))
				}
			}
		})
	}
}

func TestTeamSchedulerCompleteTask(t *testing.T) {
	team := &Team{Members: make(map[string]*Member)}
	router := a2a.NewRouter(a2a.RouterConfig{})
	coordinator := a2a.NewCoordinator(a2a.CoordinatorConfig{}, router)

	scheduler := NewTeamScheduler(TeamSchedulerConfig{}, team, router, coordinator)

	// Add running task
	task := &ScheduledTask{
		ID:         "task1",
		AssignedTo: []string{"agent1", "agent2"},
		Status:     "running",
	}
	scheduler.runningTasks["task1"] = task
	scheduler.agentLoad["agent1"] = 1
	scheduler.agentLoad["agent2"] = 1

	result := &ScheduledTaskResult{
		Output:   "Task completed",
		Duration: time.Second,
	}

	scheduler.CompleteTask("task1", result)

	// Task should be moved to completed
	if scheduler.completedTasks["task1"] == nil {
		t.Error("Task should be in completed tasks")
	}

	if scheduler.runningTasks["task1"] != nil {
		t.Error("Task should not be in running tasks")
	}

	// Load should be decremented
	if scheduler.agentLoad["agent1"] != 0 {
		t.Errorf("Expected agent1 load 0, got %d", scheduler.agentLoad["agent1"])
	}

	// Success rate should be updated
	if scheduler.agentSuccess["agent1"] == 0 {
		t.Error("Expected agent success rate to be updated")
	}
}

func TestTeamSchedulerHandoffTask(t *testing.T) {
	team := &Team{Members: make(map[string]*Member)}
	router := a2a.NewRouter(a2a.RouterConfig{})
	coordinator := a2a.NewCoordinator(a2a.CoordinatorConfig{}, router)

	scheduler := NewTeamScheduler(TeamSchedulerConfig{}, team, router, coordinator)

	task := &ScheduledTask{
		ID:         "task1",
		AssignedTo: []string{"agent1"},
		Status:     "running",
	}
	scheduler.runningTasks["task1"] = task
	scheduler.agentLoad["agent1"] = 1
	scheduler.agentLoad["agent2"] = 0

	err := scheduler.HandoffTask("task1", "agent1", "agent2", "agent1 busy")
	if err != nil {
		t.Errorf("Failed to handoff task: %v", err)
	}

	// Check assignment updated
	if len(task.AssignedTo) != 1 || task.AssignedTo[0] != "agent2" {
		t.Error("Task should be assigned to agent2")
	}

	// Check handoff recorded
	if len(task.Handoffs) != 1 {
		t.Error("Handoff should be recorded")
	}

	// Check load updated
	if scheduler.agentLoad["agent1"] != 0 {
		t.Error("agent1 load should be 0")
	}
	if scheduler.agentLoad["agent2"] != 1 {
		t.Error("agent2 load should be 1")
	}
}

func TestTeamSchedulerHandoffTask_NegativeLoadClamp(t *testing.T) {
	team := &Team{Members: make(map[string]*Member)}
	router := a2a.NewRouter(a2a.RouterConfig{})
	coordinator := a2a.NewCoordinator(a2a.CoordinatorConfig{}, router)

	scheduler := NewTeamScheduler(TeamSchedulerConfig{}, team, router, coordinator)

	task := &ScheduledTask{
		ID:         "task1",
		AssignedTo: []string{"agent1"},
		Status:     "running",
	}
	scheduler.runningTasks["task1"] = task
	// agent1 is not in agentLoad (was never registered via RegisterTeamAgent)
	// so its load defaults to 0 in Go

	err := scheduler.HandoffTask("task1", "agent1", "agent2", "handoff")
	if err != nil {
		t.Fatalf("HandoffTask failed: %v", err)
	}

	// agent1's load should be clamped to 0, not negative
	if scheduler.agentLoad["agent1"] < 0 {
		t.Errorf("agent1 load should not be negative, got %d", scheduler.agentLoad["agent1"])
	}
}

func TestTeamSchedulerStats(t *testing.T) {
	team := &Team{Members: make(map[string]*Member)}
	router := a2a.NewRouter(a2a.RouterConfig{})
	coordinator := a2a.NewCoordinator(a2a.CoordinatorConfig{}, router)

	scheduler := NewTeamScheduler(TeamSchedulerConfig{Mode: SchedulingModeBestFit}, team, router, coordinator)

	// Add some tasks
	scheduler.SubmitTask(&ScheduledTask{ID: "task1"})
	scheduler.runningTasks["task2"] = &ScheduledTask{ID: "task2"}
	scheduler.completedTasks["task3"] = &ScheduledTask{ID: "task3"}

	stats := scheduler.GetStats()

	if stats.PendingTasks != 1 {
		t.Errorf("Expected 1 pending task, got %d", stats.PendingTasks)
	}

	if stats.RunningTasks != 1 {
		t.Errorf("Expected 1 running task, got %d", stats.RunningTasks)
	}

	if stats.CompletedTasks != 1 {
		t.Errorf("Expected 1 completed task, got %d", stats.CompletedTasks)
	}

	if stats.SchedulingMode != "best_fit" {
		t.Errorf("Expected mode 'best_fit', got %s", stats.SchedulingMode)
	}
}

func TestTeamSchedulerLifecycle(t *testing.T) {
	team := &Team{Members: make(map[string]*Member)}
	router := a2a.NewRouter(a2a.RouterConfig{})
	coordinator := a2a.NewCoordinator(a2a.CoordinatorConfig{}, router)

	scheduler := NewTeamScheduler(TeamSchedulerConfig{}, team, router, coordinator)

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	err := scheduler.Start(ctx)
	if err != nil {
		t.Fatalf("Failed to start scheduler: %v", err)
	}

	// Let it run briefly
	time.Sleep(50 * time.Millisecond)

	// Stop should not block
	done := make(chan struct{})
	go func() {
		scheduler.Stop()
		close(done)
	}()

	select {
	case <-done:
		// Good
	case <-time.After(time.Second):
		t.Error("Stop took too long")
	}
}

func TestTeamSchedulerCallbacks(t *testing.T) {
	team := &Team{
		Members: make(map[string]*Member),
	}
	team.Members["agent1"] = &Member{ID: "agent1", Role: RoleDeveloper}

	router := a2a.NewRouter(a2a.RouterConfig{})
	coordinator := a2a.NewCoordinator(a2a.CoordinatorConfig{}, router)

	scheduler := NewTeamScheduler(TeamSchedulerConfig{}, team, router, coordinator)

	assignedCalled := false
	completeCalled := false

	scheduler.OnTaskAssigned(func(taskID, agentID string) {
		assignedCalled = true
	})

	scheduler.OnTaskComplete(func(taskID string, result *ScheduledTaskResult) {
		completeCalled = true
	})

	// Manually trigger assignment
	task := &ScheduledTask{ID: "task1", Priority: 1}
	scheduler.SubmitTask(task)
	cb := scheduler.assignTask(task, []string{"agent1"})

	// assignTask returns callback for invocation outside lock
	if cb != nil {
		cb()
	}

	if !assignedCalled {
		t.Error("OnTaskAssigned callback should have been called")
	}

	// Complete the task
	scheduler.CompleteTask("task1", &ScheduledTaskResult{})

	if !completeCalled {
		t.Error("OnTaskComplete callback should have been called")
	}
}

func TestTeamSchedulerScheduleNext(t *testing.T) {
	team := &Team{
		Members: make(map[string]*Member),
	}
	team.Members["agent1"] = &Member{ID: "agent1", Role: RoleDeveloper}
	team.Members["agent2"] = &Member{ID: "agent2", Role: RoleDeveloper}

	router := a2a.NewRouter(a2a.RouterConfig{})
	coordinator := a2a.NewCoordinator(a2a.CoordinatorConfig{}, router)

	scheduler := NewTeamScheduler(TeamSchedulerConfig{
		MaxParallel: 5,
	}, team, router, coordinator)

	// Register agents
	scheduler.RegisterTeamAgent("agent1", nil)
	scheduler.RegisterTeamAgent("agent2", nil)

	// Submit task
	task := &ScheduledTask{
		ID:          "task1",
		Title:       "Test Task",
		Description: "Test",
		Priority:    1,
	}
	scheduler.SubmitTask(task)

	// Schedule next
	scheduler.scheduleNext()

	// Verify task was scheduled
	scheduler.mu.RLock()
	_, running := scheduler.runningTasks["task1"]
	scheduler.mu.RUnlock()

	if !running {
		t.Error("Task should be running after scheduleNext")
	}
}

func TestTeamSchedulerScheduleNextWithMaxParallel(t *testing.T) {
	team := &Team{
		Members: make(map[string]*Member),
	}
	team.Members["agent1"] = &Member{ID: "agent1", Role: RoleDeveloper}

	router := a2a.NewRouter(a2a.RouterConfig{})
	coordinator := a2a.NewCoordinator(a2a.CoordinatorConfig{}, router)

	scheduler := NewTeamScheduler(TeamSchedulerConfig{
		MaxParallel: 1, // Only 1 parallel task
	}, team, router, coordinator)

	scheduler.RegisterTeamAgent("agent1", nil)

	// Submit two tasks
	scheduler.SubmitTask(&ScheduledTask{ID: "task1", Priority: 1})
	scheduler.SubmitTask(&ScheduledTask{ID: "task2", Priority: 1})

	// Schedule next - only first should run
	scheduler.scheduleNext()

	scheduler.mu.RLock()
	runningCount := len(scheduler.runningTasks)
	scheduler.mu.RUnlock()

	if runningCount != 1 {
		t.Errorf("Expected 1 running task, got %d", runningCount)
	}
}

func TestTeamSchedulerRegisterTeamAgent(t *testing.T) {
	team := &Team{Members: make(map[string]*Member)}
	router := a2a.NewRouter(a2a.RouterConfig{})
	coordinator := a2a.NewCoordinator(a2a.CoordinatorConfig{}, router)

	scheduler := NewTeamScheduler(TeamSchedulerConfig{}, team, router, coordinator)

	// Register agent
	scheduler.RegisterTeamAgent("agent1", nil)

	// Verify agent is registered
	scheduler.mu.RLock()
	load, ok := scheduler.agentLoad["agent1"]
	success := scheduler.agentSuccess["agent1"]
	peers := scheduler.peerScores["agent1"]
	scheduler.mu.RUnlock()

	if !ok {
		t.Error("Agent should be registered in agentLoad")
	}
	if load != 0 {
		t.Errorf("Expected initial load 0, got %d", load)
	}
	if success != 1.0 {
		t.Errorf("Expected initial success 1.0, got %f", success)
	}
	if peers == nil {
		t.Error("peerScores should be initialized")
	}
}

func TestNewAgentToAgentCoordination(t *testing.T) {
	team := &Team{Members: make(map[string]*Member)}
	router := a2a.NewRouter(a2a.RouterConfig{})

	coord := NewAgentToAgentCoordination(router, team)

	if coord == nil {
		t.Fatal("Expected coordination to be created")
	}

	if coord.router != router {
		t.Error("Router should be set")
	}

	if coord.team != team {
		t.Error("Team should be set")
	}

	if coord.collaborations == nil {
		t.Error("Collaborations map should be initialized")
	}
}

func TestAgentToAgentCoordinationRequestHelp(t *testing.T) {
	team := &Team{
		Members: make(map[string]*Member),
	}
	team.Members["agent1"] = &Member{ID: "agent1", Role: RoleDeveloper}
	team.Members["agent2"] = &Member{ID: "agent2", Role: RoleDeveloper}

	router := a2a.NewRouter(a2a.RouterConfig{})
	router.RegisterAgent("agent2", func(m *a2a.Message) error { return nil }, nil)

	coord := NewAgentToAgentCoordination(router, team)

	ctx := context.Background()
	err := coord.RequestHelp(ctx, "agent1", "task1", "Need help with testing", []string{})

	if err != nil {
		t.Errorf("RequestHelp failed: %v", err)
	}
}

func TestAgentToAgentCoordinationRequestHelpNoHelpers(t *testing.T) {
	team := &Team{
		Members: make(map[string]*Member),
	}
	team.Members["agent1"] = &Member{ID: "agent1", Role: RoleDeveloper}

	router := a2a.NewRouter(a2a.RouterConfig{})
	coord := NewAgentToAgentCoordination(router, team)

	ctx := context.Background()
	err := coord.RequestHelp(ctx, "agent1", "task1", "Need help", []string{})

	if err == nil {
		t.Error("Expected error when no helpers available")
	}
}

func TestAgentToAgentCoordinationStartCollaboration(t *testing.T) {
	team := &Team{
		Members: make(map[string]*Member),
	}
	team.Members["agent1"] = &Member{ID: "agent1", Role: RoleDeveloper}
	team.Members["agent2"] = &Member{ID: "agent2", Role: RoleDeveloper}

	router := a2a.NewRouter(a2a.RouterConfig{})
	router.RegisterAgent("agent1", func(m *a2a.Message) error { return nil }, nil)
	router.RegisterAgent("agent2", func(m *a2a.Message) error { return nil }, nil)

	coord := NewAgentToAgentCoordination(router, team)

	collab := coord.StartCollaboration("pair_programming", "task1", []string{"agent1", "agent2"})

	if collab == nil {
		t.Fatal("Expected collaboration to be created")
	}

	if collab.TaskID != "task1" {
		t.Errorf("Expected TaskID 'task1', got %s", collab.TaskID)
	}

	if collab.Type != "pair_programming" {
		t.Errorf("Expected type 'pair_programming', got %s", collab.Type)
	}

	if collab.Status != "active" {
		t.Errorf("Expected status 'active', got %s", collab.Status)
	}

	if len(collab.Agents) != 2 {
		t.Errorf("Expected 2 agents, got %d", len(collab.Agents))
	}

	// Verify collaboration is stored
	coord.mu.RLock()
	_, exists := coord.collaborations[collab.ID]
	coord.mu.RUnlock()

	if !exists {
		t.Error("Collaboration should be stored")
	}
}

func TestAgentToAgentCoordinationEndCollaboration(t *testing.T) {
	team := &Team{
		Members: make(map[string]*Member),
	}
	team.Members["agent1"] = &Member{ID: "agent1", Role: RoleDeveloper}
	team.Members["agent2"] = &Member{ID: "agent2", Role: RoleDeveloper}

	router := a2a.NewRouter(a2a.RouterConfig{})
	router.RegisterAgent("agent1", func(m *a2a.Message) error { return nil }, nil)
	router.RegisterAgent("agent2", func(m *a2a.Message) error { return nil }, nil)

	coord := NewAgentToAgentCoordination(router, team)

	// Start collaboration
	collab := coord.StartCollaboration("review", "task1", []string{"agent1", "agent2"})

	// End collaboration
	coord.EndCollaboration(collab.ID)

	// Verify collaboration is removed from map
	coord.mu.RLock()
	_, exists := coord.collaborations[collab.ID]
	coord.mu.RUnlock()

	if exists {
		t.Error("Collaboration should be removed after ending")
	}
}

func TestTeamSchedulerCalculatePeerScore(t *testing.T) {
	router := a2a.NewRouter(a2a.RouterConfig{})
	coordinator := a2a.NewCoordinator(a2a.CoordinatorConfig{}, router)
	team := &Team{Members: make(map[string]*Member)}
	scheduler := NewTeamScheduler(TeamSchedulerConfig{}, team, router, coordinator)

	// Register agent
	scheduler.RegisterTeamAgent("agent1", nil)

	// Initially no peer scores, should return 0
	score := scheduler.calculatePeerScore("agent1")
	if score != 0.0 {
		t.Errorf("Expected 0.0 for agent with no peer scores, got %f", score)
	}

	// Add peer scores
	scheduler.mu.Lock()
	scheduler.peerScores["agent1"] = map[string]float64{
		"agent2": 0.8,
		"agent3": 0.6,
	}
	scheduler.mu.Unlock()

	// Calculate average
	score = scheduler.calculatePeerScore("agent1")
	expected := (0.8 + 0.6) / 2.0
	if score != expected {
		t.Errorf("Expected %f, got %f", expected, score)
	}

	// Test non-existent agent
	score = scheduler.calculatePeerScore("nonexistent")
	if score != 0.0 {
		t.Errorf("Expected 0.0 for non-existent agent, got %f", score)
	}
}

func TestTeamSchedulerCalculatePeerScoreEmpty(t *testing.T) {
	router := a2a.NewRouter(a2a.RouterConfig{})
	coordinator := a2a.NewCoordinator(a2a.CoordinatorConfig{}, router)
	team := &Team{Members: make(map[string]*Member)}
	scheduler := NewTeamScheduler(TeamSchedulerConfig{}, team, router, coordinator)

	// Register agent
	scheduler.RegisterTeamAgent("agent1", nil)

	// Set empty peer scores map
	scheduler.mu.Lock()
	scheduler.peerScores["agent1"] = map[string]float64{}
	scheduler.mu.Unlock()

	// Should return 0 for empty map
	score := scheduler.calculatePeerScore("agent1")
	if score != 0.0 {
		t.Errorf("Expected 0.0 for empty peer scores, got %f", score)
	}
}

func TestTeamSchedulerCompletedTasksCleanup(t *testing.T) {
	router := a2a.NewRouter(a2a.RouterConfig{})
	coordinator := a2a.NewCoordinator(a2a.CoordinatorConfig{}, router)
	team := &Team{Members: make(map[string]*Member)}
	team.Members["agent1"] = &Member{ID: "agent1", Role: RoleDeveloper}

	scheduler := NewTeamScheduler(TeamSchedulerConfig{}, team, router, coordinator)
	scheduler.RegisterTeamAgent("agent1", nil)

	// Submit and complete tasks to fill completedTasks beyond limit
	for i := 0; i < maxCompletedTasks+100; i++ {
		taskID := fmt.Sprintf("task_%d", i)
		task := &ScheduledTask{
			ID:         taskID,
			Priority:   1,
			AssignedTo: []string{"agent1"},
		}

		// Submit task
		scheduler.SubmitTask(task)

		// Manually move from pending to running
		scheduler.mu.Lock()
		scheduler.runningTasks[taskID] = task
		delete(scheduler.pendingTasks, taskID)
		scheduler.mu.Unlock()

		// Complete the task
		scheduler.CompleteTask(taskID, &ScheduledTaskResult{Error: ""})
	}

	// Verify cleanup happened - should not exceed maxCompletedTasks
	scheduler.mu.RLock()
	count := len(scheduler.completedTasks)
	scheduler.mu.RUnlock()

	if count > maxCompletedTasks {
		t.Errorf("completedTasks count %d exceeds max %d", count, maxCompletedTasks)
	}

	// Verify oldest tasks were removed (task_0 should not exist)
	scheduler.mu.RLock()
	_, exists := scheduler.completedTasks["task_0"]
	scheduler.mu.RUnlock()

	if exists {
		t.Error("Oldest task should have been cleaned up")
	}
}

func TestTeamSchedulerMaxCompletedTasks(t *testing.T) {
	// Verify the constant is set to expected value
	if maxCompletedTasks != 1000 {
		t.Errorf("maxCompletedTasks = %d, expected 1000", maxCompletedTasks)
	}
}

func TestHasRequiredSkills(t *testing.T) {
	tests := []struct {
		name           string
		memberSkills   []string
		requiredSkills []string
		want           bool
	}{
		{"no requirements", []string{"go", "python"}, nil, true},
		{"empty requirements", []string{"go"}, []string{}, true},
		{"no member skills", []string{}, []string{"go"}, false},
		{"exact match", []string{"go", "python"}, []string{"go"}, true},
		{"all required", []string{"go", "python", "rust"}, []string{"go", "rust"}, true},
		{"missing skill", []string{"go"}, []string{"go", "python"}, false},
		{"both empty", []string{}, []string{}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := hasRequiredSkills(tt.memberSkills, tt.requiredSkills)
			if got != tt.want {
				t.Errorf("hasRequiredSkills() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestAgentToAgentCoordination_Close(t *testing.T) {
	coord := NewAgentToAgentCoordination(nil, nil)
	coord.Close()
}
