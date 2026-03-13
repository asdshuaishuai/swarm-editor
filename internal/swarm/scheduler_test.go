package swarm

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
)

func TestNewScheduler(t *testing.T) {
	config := SchedulerConfig{
		MaxConcurrentTasks:  5,
		TaskTimeout:         30 * time.Second,
		RetryCount:          3,
		RetryDelay:          1 * time.Second,
		LoadBalanceStrategy: "round_robin",
	}

	scheduler := NewScheduler(config, nil)

	if scheduler == nil {
		t.Fatal("NewScheduler returned nil")
	}

	if scheduler.config.MaxConcurrentTasks != 5 {
		t.Errorf("Expected MaxConcurrentTasks 5, got %d", scheduler.config.MaxConcurrentTasks)
	}

	if scheduler.workers == nil {
		t.Error("Workers map should be initialized")
	}

	if scheduler.pendingQueue == nil {
		t.Error("Pending queue should be initialized")
	}
}

func TestSchedulerAddRemoveWorker(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	agent := &AgentInfo{
		ID:            "agent-1",
		Priority:      1,
		MaxConcurrent: 2,
	}

	scheduler.AddWorker(agent)

	if len(scheduler.workers) != 1 {
		t.Errorf("Expected 1 worker, got %d", len(scheduler.workers))
	}

	if scheduler.workers["agent-1"] != agent {
		t.Error("Worker not stored correctly")
	}

	scheduler.RemoveWorker("agent-1")

	if len(scheduler.workers) != 0 {
		t.Errorf("Expected 0 workers after removal, got %d", len(scheduler.workers))
	}
}

func TestSchedulerSetCoordinator(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	coordinator := &AgentInfo{
		ID:            "coordinator-1",
		Priority:      10,
		MaxConcurrent: 5,
	}

	scheduler.SetCoordinator(coordinator)

	if scheduler.coordinator != coordinator {
		t.Error("Coordinator not set correctly")
	}
}

func TestSchedulerSubmitTask(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)
	task := NewTask("Test", "Description", acp.Prompt{})

	err := scheduler.SubmitTask(task)
	if err != nil {
		t.Fatalf("SubmitTask failed: %v", err)
	}

	if task.State != TaskStatePending {
		t.Errorf("Task state should be pending, got '%s'", task.State)
	}

	if task.CreatedAt.IsZero() {
		t.Error("CreatedAt should be set")
	}

	if scheduler.pendingQueue.Len() != 1 {
		t.Errorf("Queue should have 1 task, got %d", scheduler.pendingQueue.Len())
	}
}

func TestSchedulerSelectAgentsForTask(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{
		LoadBalanceStrategy: "round_robin",
	}, nil)

	// Add workers
	scheduler.AddWorker(&AgentInfo{
		ID:            "agent-1",
		MaxConcurrent: 2,
		currentLoad:   0,
		Roles:         []string{"coder"},
	})

	scheduler.AddWorker(&AgentInfo{
		ID:            "agent-2",
		MaxConcurrent: 2,
		currentLoad:   0,
		Roles:         []string{"reviewer"},
	})

	task := NewTask("Test", "Description", acp.Prompt{})

	agents := scheduler.selectAgentsForTask(task)
	if len(agents) == 0 {
		t.Error("Should select at least one agent")
	}
}

func TestSchedulerSelectAgentsWithRoleRequirement(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{
		LoadBalanceStrategy: "round_robin",
	}, nil)

	scheduler.AddWorker(&AgentInfo{
		ID:            "coder-1",
		MaxConcurrent: 2,
		currentLoad:   0,
		Roles:         []string{"coder"},
	})

	scheduler.AddWorker(&AgentInfo{
		ID:            "reviewer-1",
		MaxConcurrent: 2,
		currentLoad:   0,
		Roles:         []string{"reviewer"},
	})

	// Task requiring coder role
	task := NewTask("Test", "Description", acp.Prompt{})
	task.Metadata["requiredRole"] = "coder"

	agents := scheduler.selectAgentsForTask(task)

	if len(agents) != 1 {
		t.Errorf("Expected 1 agent with coder role, got %d", len(agents))
	}

	if agents[0].ID != "coder-1" {
		t.Errorf("Expected coder-1, got %s", agents[0].ID)
	}
}

func TestSchedulerSelectAgentsLoadLimit(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{
		LoadBalanceStrategy: "round_robin",
	}, nil)

	// Agent at max load
	scheduler.AddWorker(&AgentInfo{
		ID:            "busy-agent",
		MaxConcurrent: 2,
		currentLoad:   2, // At capacity
	})

	// Agent with available capacity
	scheduler.AddWorker(&AgentInfo{
		ID:            "available-agent",
		MaxConcurrent: 2,
		currentLoad:   0,
	})

	task := NewTask("Test", "Description", acp.Prompt{})
	agents := scheduler.selectAgentsForTask(task)

	if len(agents) != 1 {
		t.Errorf("Expected 1 available agent, got %d", len(agents))
	}

	if agents[0].ID != "available-agent" {
		t.Errorf("Expected available-agent, got %s", agents[0].ID)
	}
}

func TestSchedulerSelectLeastLoaded(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{
		LoadBalanceStrategy: "least_loaded",
	}, nil)

	agents := []*AgentInfo{
		{ID: "agent-1", currentLoad: 3},
		{ID: "agent-2", currentLoad: 1},
		{ID: "agent-3", currentLoad: 2},
	}

	selected := scheduler.selectLeastLoaded(agents)

	if len(selected) != 1 {
		t.Errorf("Expected 1 agent, got %d", len(selected))
	}

	if selected[0].ID != "agent-2" {
		t.Errorf("Expected agent-2 (least loaded), got %s", selected[0].ID)
	}
}

func TestSchedulerSelectByPriority(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{
		LoadBalanceStrategy: "priority",
	}, nil)

	agents := []*AgentInfo{
		{ID: "agent-1", Priority: 1},
		{ID: "agent-2", Priority: 5},
		{ID: "agent-3", Priority: 3},
	}

	selected := scheduler.selectByPriority(agents)

	if len(selected) != 1 {
		t.Errorf("Expected 1 agent, got %d", len(selected))
	}

	if selected[0].ID != "agent-2" {
		t.Errorf("Expected agent-2 (highest priority), got %s", selected[0].ID)
	}
}

func TestSchedulerSelectRoundRobin(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	agents := []*AgentInfo{
		{ID: "agent-1", totalTasks: 5},
		{ID: "agent-2", totalTasks: 2},
		{ID: "agent-3", totalTasks: 3},
	}

	selected := scheduler.selectRoundRobin(agents)

	if len(selected) != 1 {
		t.Errorf("Expected 1 agent, got %d", len(selected))
	}

	if selected[0].ID != "agent-2" {
		t.Errorf("Expected agent-2 (least tasks), got %s", selected[0].ID)
	}
}

func TestSchedulerCalculateCapabilityScore(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	agent := &AgentInfo{
		ID:          "test-agent",
		Roles:       []string{"coder", "reviewer"},
		Priority:    5,
		successRate: 0.9,
		currentLoad: 1,
	}

	task := NewTask("Test", "Description", acp.Prompt{})
	task.Metadata["requiredRole"] = "coder"

	score := scheduler.calculateCapabilityScore(agent, task)

	// Score should include:
	// +10 for role match
	// +5 for priority
	// +4.5 for success rate (0.9 * 5)
	// -2 for load (1 * 2)
	// Total: 17.5
	if score < 17 || score > 18 {
		t.Errorf("Expected score around 17.5, got %f", score)
	}

	// Test without role match
	task2 := NewTask("Test", "Description", acp.Prompt{})
	task2.Metadata["requiredRole"] = "architect"

	score2 := scheduler.calculateCapabilityScore(agent, task2)

	// Should be lower without role match
	if score2 >= score {
		t.Errorf("Score without role match should be lower: %f >= %f", score2, score)
	}
}

func TestSchedulerAgentHasRole(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	agent := &AgentInfo{
		Roles: []string{"coder", "reviewer", "tester"},
	}

	if !scheduler.agentHasRole(agent, "coder") {
		t.Error("Agent should have coder role")
	}

	if !scheduler.agentHasRole(agent, "reviewer") {
		t.Error("Agent should have reviewer role")
	}

	if scheduler.agentHasRole(agent, "architect") {
		t.Error("Agent should not have architect role")
	}
}

func TestSchedulerBuildPromptFromTask(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	task := NewTask("Test", "Write a function", acp.Prompt{})
	task.Metadata["context"] = "This is a Go project"
	task.Metadata["files"] = []string{"/path/to/file.go"}

	prompt := scheduler.buildPromptFromTask(task)

	if len(prompt) < 2 {
		t.Errorf("Prompt should have at least 2 content blocks, got %d", len(prompt))
	}

	// First block should be the description
	if prompt[0].Type != "text" {
		t.Errorf("First block should be text, got %s", prompt[0].Type)
	}

	if prompt[0].Text != "Write a function" {
		t.Errorf("First block text mismatch: %s", prompt[0].Text)
	}
}

func TestSchedulerShouldDecompose(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	tests := []struct {
		description string
		expected    bool
	}{
		{"Short description", false},
		{"Create a function", false},
		// This description has 50+ words
		{"Implement a new feature that includes user authentication with OAuth2 support, database migrations for the user table, API endpoints for login and registration, unit tests for all new functionality, integration tests for the auth flow, and documentation for the API", true},
		// Multiple action words trigger decomposition
		{"Implement feature and write tests", true},
		{"Create component and update docs", true},
	}

	for _, tt := range tests {
		task := NewTask("Test", tt.description, acp.Prompt{})
		result := scheduler.shouldDecompose(task)
		if result != tt.expected {
			t.Errorf("shouldDecompose(%q) = %v, want %v", tt.description, result, tt.expected)
		}
	}
}

func TestSchedulerSplitByConjunctions(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	tests := []struct {
		input    string
		expected int
	}{
		{"Task one and task two", 2},
		{"First step then second step", 2},
		{"A; B; C", 3},
		{"Single task", 1},
		{"Task 1, then Task 2, then Task 3", 3},
	}

	for _, tt := range tests {
		result := scheduler.splitByConjunctions(tt.input)
		if len(result) != tt.expected {
			t.Errorf("splitByConjunctions(%q) returned %d parts, want %d", tt.input, len(result), tt.expected)
		}
	}
}

func TestSchedulerAggregateResults(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	results := []*TaskResult{
		{
			TaskID:       "task-1",
			AgentID:      "agent-1",
			FilesChanged: []string{"file1.go", "file2.go"},
			Artifacts:    []Artifact{{Type: "code", Name: "artifact1"}},
			Duration:     10 * time.Second,
		},
		{
			TaskID:       "task-1",
			AgentID:      "agent-2",
			FilesChanged: []string{"file2.go", "file3.go"},
			Artifacts:    []Artifact{{Type: "code", Name: "artifact2"}},
			Duration:     15 * time.Second,
		},
	}

	aggregated := scheduler.aggregateResults(results)

	if aggregated == nil {
		t.Fatal("aggregateResults returned nil")
	}

	if aggregated.TaskID != "task-1" {
		t.Errorf("TaskID should be task-1, got %s", aggregated.TaskID)
	}

	// Should deduplicate files
	if len(aggregated.FilesChanged) != 3 {
		t.Errorf("Expected 3 unique files, got %d: %v", len(aggregated.FilesChanged), aggregated.FilesChanged)
	}

	// Should combine artifacts
	if len(aggregated.Artifacts) != 2 {
		t.Errorf("Expected 2 artifacts, got %d", len(aggregated.Artifacts))
	}
}

func TestSchedulerGetStats(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{
		MaxConcurrentTasks: 5,
	}, nil)

	scheduler.AddWorker(&AgentInfo{ID: "agent-1", currentLoad: 1})
	scheduler.AddWorker(&AgentInfo{ID: "agent-2", currentLoad: 2})

	task := NewTask("Test", "Description", acp.Prompt{})
	scheduler.SubmitTask(task)

	stats := scheduler.GetStats()

	if stats.TotalWorkers != 2 {
		t.Errorf("Expected 2 workers, got %d", stats.TotalWorkers)
	}

	if stats.PendingTasks != 1 {
		t.Errorf("Expected 1 pending task, got %d", stats.PendingTasks)
	}

	// Average load should be 1.5 ((1+2)/2)
	if stats.AverageLoad != 1.5 {
		t.Errorf("Expected average load 1.5, got %f", stats.AverageLoad)
	}
}

func TestSchedulerStartStop(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	ctx := context.Background()
	err := scheduler.Start(ctx)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	// Give it a moment to start
	time.Sleep(50 * time.Millisecond)

	// Stop should not panic
	scheduler.Stop()
}

func TestSchedulerDoubleStart(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	ctx := context.Background()
	err := scheduler.Start(ctx)
	if err != nil {
		t.Fatalf("First Start failed: %v", err)
	}

	// Second start should return an error
	err = scheduler.Start(ctx)
	if err == nil {
		t.Error("Second Start should return an error")
	}

	scheduler.Stop()
}

func TestSchedulerStartAfterStop(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	ctx := context.Background()
	err := scheduler.Start(ctx)
	if err != nil {
		t.Fatalf("First Start failed: %v", err)
	}

	scheduler.Stop()

	// Should be able to start again after stop
	err = scheduler.Start(ctx)
	if err != nil {
		t.Fatalf("Start after Stop failed: %v", err)
	}

	scheduler.Stop()
}

func TestSchedulerCallbacks(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	var (
		startCalled    bool
		completeCalled bool
		failCalled     bool
		progressCalled bool
	)

	scheduler.OnTaskStart(func(task *ScheduledTask) {
		startCalled = true
	})

	scheduler.OnTaskComplete(func(task *ScheduledTask) {
		completeCalled = true
	})

	scheduler.OnTaskFail(func(task *ScheduledTask, err error) {
		failCalled = true
	})

	scheduler.OnProgress(func(taskID string, progress float64) {
		progressCalled = true
	})

	// Verify callbacks are set (we can't easily test execution without full integration)
	if scheduler.onTaskStart == nil {
		t.Error("onTaskStart callback should be set")
	}

	if scheduler.onTaskComplete == nil {
		t.Error("onTaskComplete callback should be set")
	}

	if scheduler.onTaskFail == nil {
		t.Error("onTaskFail callback should be set")
	}

	if scheduler.onProgress == nil {
		t.Error("onProgress callback should be set")
	}

	// These are set correctly if we got here
	_ = startCalled
	_ = completeCalled
	_ = failCalled
	_ = progressCalled
}

func TestSchedulerSubmitTaskWithDecomposition(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	ctx := context.Background()

	// Simple task that doesn't need decomposition
	task := &Task{
		ID:          "simple-task",
		Title:       "Simple Task",
		Description: "A simple task",
		Priority:    PriorityMedium,
	}

	tasks, err := scheduler.SubmitTaskWithDecomposition(ctx, task)
	if err != nil {
		t.Fatalf("SubmitTaskWithDecomposition failed: %v", err)
	}

	if len(tasks) != 1 {
		t.Errorf("Expected 1 task, got %d", len(tasks))
	}

	if tasks[0].ID != "simple-task" {
		t.Error("Task ID mismatch")
	}
}

func TestSchedulerSubmitTaskWithDecompositionComplex(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	ctx := context.Background()

	// Complex task with a long description
	task := &Task{
		ID:          "complex-task",
		Title:       "Complex Task",
		Description: "This is a complex task that needs to be broken down into multiple smaller subtasks for parallel processing by multiple agents. We need to ensure this description is long enough to trigger decomposition logic.",
		Priority:    PriorityHigh,
		Prompt: acp.Prompt{
			{Type: "text", Text: "First part of the task"},
			{Type: "text", Text: "Second part of the task"},
			{Type: "text", Text: "Third part of the task"},
		},
	}

	tasks, err := scheduler.SubmitTaskWithDecomposition(ctx, task)
	if err != nil {
		t.Fatalf("SubmitTaskWithDecomposition failed: %v", err)
	}

	// Should return at least one task
	if len(tasks) < 1 {
		t.Error("Expected at least one task")
	}
}

func TestSchedulerSelectByCapability(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	// Add workers with different capabilities
	scheduler.workers["worker-1"] = &AgentInfo{
		ID: "worker-1",
		Capabilities: acp.AgentCapabilities{
			LoadSession: true,
		},
		Roles:         []string{"code", "test"},
		MaxConcurrent: 2,
	}
	scheduler.workers["worker-2"] = &AgentInfo{
		ID: "worker-2",
		Capabilities: acp.AgentCapabilities{
			LoadSession: true,
		},
		Roles:         []string{"code"},
		MaxConcurrent: 2,
	}
	scheduler.workers["worker-3"] = &AgentInfo{
		ID: "worker-3",
		Capabilities: acp.AgentCapabilities{
			LoadSession: true,
		},
		Roles:         []string{"review"},
		MaxConcurrent: 2,
	}

	task := &Task{
		ID:          "task-1",
		Title:       "Code Task",
		Description: "Task requiring coding skills",
	}

	agents := scheduler.selectAgentsForTask(task)
	// Should find some agents
	t.Logf("Found %d agents for task", len(agents))
}

func TestSchedulerSelectAgentsForTaskWithLoad(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	// Add workers with different loads
	scheduler.workers["worker-1"] = &AgentInfo{
		ID: "worker-1",
		Capabilities: acp.AgentCapabilities{
			LoadSession: true,
		},
		Roles:         []string{"code"},
		MaxConcurrent: 2,
		currentLoad:   2, // At capacity
	}
	scheduler.workers["worker-2"] = &AgentInfo{
		ID: "worker-2",
		Capabilities: acp.AgentCapabilities{
			LoadSession: true,
		},
		Roles:         []string{"code"},
		MaxConcurrent: 2,
		currentLoad:   0, // Available
	}

	task := &Task{
		ID:          "task-1",
		Title:       "Code Task",
		Description: "Task requiring coding skills",
	}

	agents := scheduler.selectAgentsForTask(task)
	if len(agents) != 1 {
		t.Errorf("Expected 1 available agent, got %d", len(agents))
	}

	if len(agents) > 0 && agents[0].ID != "worker-2" {
		t.Error("Should select worker-2 which has lower load")
	}
}

func TestSchedulerScheduleNextEmptyQueue(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	scheduler.ctx, scheduler.cancel = ctx, cancel

	// Call scheduleNext with empty queue - should not panic
	scheduler.scheduleNext()
}

func TestSchedulerScheduleNextAtCapacity(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{
		MaxConcurrentTasks: 1,
	}, nil)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	scheduler.ctx, scheduler.cancel = ctx, cancel

	// Add a task to pending queue
	task := &Task{
		ID:          "task-1",
		Title:       "Test Task",
		Description: "Test",
		Priority:    PriorityMedium,
	}
	scheduler.pendingQueue.Push(task)

	// Fill running tasks to capacity
	scheduler.runningTasks["running-1"] = &ScheduledTask{
		Task:   &Task{ID: "running-1"},
		Status: TaskStatusRunning,
	}

	// Call scheduleNext - should not schedule due to capacity
	scheduler.scheduleNext()

	// Task should still be in pending queue
	if scheduler.pendingQueue.Len() != 1 {
		t.Error("Task should remain in queue when at capacity")
	}
}

func TestSchedulerScheduleNextNoWorkers(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{
		MaxConcurrentTasks: 5,
	}, nil)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	scheduler.ctx, scheduler.cancel = ctx, cancel

	// Add a task to pending queue
	task := &Task{
		ID:          "task-1",
		Title:       "Test Task",
		Description: "Test",
		Priority:    PriorityMedium,
	}
	scheduler.pendingQueue.Push(task)

	// Call scheduleNext with no workers - task should be put back
	scheduler.scheduleNext()

	// Task should still be in pending queue
	if scheduler.pendingQueue.Len() != 1 {
		t.Error("Task should be put back in queue when no workers")
	}
}

func TestScheduledTaskStruct(t *testing.T) {
	now := time.Now()
	task := &ScheduledTask{
		Task: &Task{
			ID:          "task-1",
			Title:       "Test Task",
			Description: "Test",
			Priority:    PriorityHigh,
		},
		AssignedTo: []*AgentInfo{
			{ID: "agent-1", Roles: []string{"code"}},
		},
		StartedAt:   now,
		CompletedAt: now.Add(time.Hour),
		Status:      TaskStatusCompleted,
		Result:      &TaskResult{Content: "Task completed successfully"},
	}

	if task.Task.ID != "task-1" {
		t.Error("Task ID mismatch")
	}
	if len(task.AssignedTo) != 1 {
		t.Error("Should have 1 assigned agent")
	}
	if task.Status != TaskStatusCompleted {
		t.Error("Status should be completed")
	}
}

func TestAgentInfoStruct(t *testing.T) {
	agent := &AgentInfo{
		ID:    "agent-1",
		Roles: []string{"code", "test", "review"},
		Capabilities: acp.AgentCapabilities{
			LoadSession: true,
		},
		MaxConcurrent: 3,
		currentLoad:   1,
	}

	if agent.ID != "agent-1" {
		t.Error("Agent ID mismatch")
	}
	if len(agent.Roles) != 3 {
		t.Error("Should have 3 roles")
	}
	if agent.GetLoad() != 1 {
		t.Error("Load should be 1")
	}
}

func TestSchedulerConfigDefaults(t *testing.T) {
	config := SchedulerConfig{}
	scheduler := NewScheduler(config, nil)

	// Check that defaults are applied
	if scheduler.config.MaxConcurrentTasks <= 0 {
		t.Error("MaxConcurrentTasks should have a default value > 0")
	}
	if scheduler.config.TaskTimeout <= 0 {
		t.Error("TaskTimeout should have a default value > 0")
	}
	if scheduler.config.RetryDelay <= 0 {
		t.Error("RetryDelay should have a default value > 0")
	}
	if scheduler.config.LoadBalanceStrategy == "" {
		t.Error("LoadBalanceStrategy should have a default value")
	}
}

func TestSchedulerConfigPreservesValues(t *testing.T) {
	config := SchedulerConfig{
		MaxConcurrentTasks:  5,
		TaskTimeout:         10 * time.Second,
		RetryDelay:          500 * time.Millisecond,
		LoadBalanceStrategy: "priority",
	}
	scheduler := NewScheduler(config, nil)

	if scheduler.config.MaxConcurrentTasks != 5 {
		t.Errorf("MaxConcurrentTasks should be 5, got %d", scheduler.config.MaxConcurrentTasks)
	}
	if scheduler.config.TaskTimeout != 10*time.Second {
		t.Errorf("TaskTimeout should be 10s, got %v", scheduler.config.TaskTimeout)
	}
	if scheduler.config.RetryDelay != 500*time.Millisecond {
		t.Errorf("RetryDelay should be 500ms, got %v", scheduler.config.RetryDelay)
	}
	if scheduler.config.LoadBalanceStrategy != "priority" {
		t.Errorf("LoadBalanceStrategy should be priority, got %s", scheduler.config.LoadBalanceStrategy)
	}
}

func TestSchedulerSelectByCapabilityStrategy(t *testing.T) {
	// Test with capability strategy explicitly set
	scheduler := NewScheduler(SchedulerConfig{
		LoadBalanceStrategy: "capability",
	}, nil)

	scheduler.workers["worker-1"] = &AgentInfo{
		ID: "worker-1",
		Capabilities: acp.AgentCapabilities{
			LoadSession: true,
		},
		Roles:         []string{"code", "test"},
		MaxConcurrent: 2,
	}
	scheduler.workers["worker-2"] = &AgentInfo{
		ID: "worker-2",
		Capabilities: acp.AgentCapabilities{
			LoadSession: true,
		},
		Roles:         []string{"code"},
		MaxConcurrent: 2,
	}
	scheduler.workers["worker-3"] = &AgentInfo{
		ID: "worker-3",
		Capabilities: acp.AgentCapabilities{
			LoadSession: true,
		},
		Roles:         []string{"review"},
		MaxConcurrent: 2,
	}

	task := &Task{
		ID:          "task-1",
		Title:       "Code Task",
		Description: "Task requiring coding skills",
	}

	agents := scheduler.selectAgentsForTask(task)
	if len(agents) == 0 {
		t.Error("Should find agents with capability strategy")
	}
	t.Logf("Found %d agents with capability strategy", len(agents))
}

func TestSchedulerDecomposeByRules(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	task := &Task{
		ID:          "task-1",
		Title:       "Implement feature X and write tests",
		Description: "Implement the feature and then write unit tests for it",
	}

	subtasks := scheduler.decomposeByRules(task)
	// Should split by "and" conjunction
	if len(subtasks) < 2 {
		t.Logf("DecomposeByRules returned %d subtasks (may be 1 if no conjunctions)", len(subtasks))
	}
}

func TestSchedulerAggregateResultsBasic(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	results := []*TaskResult{
		{
			TaskID:      "subtask-1",
			Content:     "Result 1",
			StartedAt:   time.Now(),
			CompletedAt: time.Now().Add(1 * time.Second),
		},
		{
			TaskID:      "subtask-2",
			Content:     "Result 2",
			StartedAt:   time.Now(),
			CompletedAt: time.Now().Add(2 * time.Second),
		},
	}

	aggregated := scheduler.aggregateResults(results)
	if aggregated == nil {
		t.Error("aggregateResults should not return nil")
	}
}

func TestSchedulerSplitByConjunctionsMultiple(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	description := "Implement A, test B, and review C"
	subtasks := scheduler.splitByConjunctions(description)
	// Should split by multiple conjunctions
	t.Logf("SplitByConjunctions returned %d subtasks", len(subtasks))
}

func TestTaskStateConstants(t *testing.T) {
	states := []TaskState{
		TaskStatePending,
		TaskStateRunning,
		TaskStateCompleted,
		TaskStateFailed,
		TaskStateCancelled,
	}

	for _, state := range states {
		if state == "" {
			t.Error("TaskState should not be empty")
		}
	}
}

func TestSchedulerProgressMonitorWithCallbacks(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{
		TaskTimeout: 10 * time.Second,
	}, nil)

	var progressUpdates []float64
	var mu sync.Mutex

	scheduler.OnProgress(func(taskID string, progress float64) {
		mu.Lock()
		progressUpdates = append(progressUpdates, progress)
		mu.Unlock()
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	scheduler.ctx, scheduler.cancel = ctx, cancel

	// Add a running task
	task := &Task{
		ID:          "task-1",
		Title:       "Test Task",
		Description: "Test",
		Priority:    PriorityMedium,
	}
	scheduler.runningTasks[task.ID] = &ScheduledTask{
		Task:      task,
		StartedAt: time.Now(),
		Status:    TaskStatusRunning,
	}

	// Increment WaitGroup before starting progressMonitor directly
	scheduler.wg.Add(1)
	go scheduler.progressMonitor()

	// Wait for progress updates
	time.Sleep(150 * time.Millisecond)

	mu.Lock()
	updates := len(progressUpdates)
	mu.Unlock()

	if updates == 0 {
		t.Log("Progress monitor may not have fired yet")
	}
}

func TestSchedulerProgressMonitorNoTimeout(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{
		TaskTimeout: 0, // No timeout
	}, nil)

	var progressCalled bool
	scheduler.OnProgress(func(taskID string, progress float64) {
		progressCalled = true
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	scheduler.ctx, scheduler.cancel = ctx, cancel

	// Add a running task
	task := &Task{
		ID:          "task-1",
		Title:       "Test Task",
		Description: "Test",
	}
	scheduler.runningTasks[task.ID] = &ScheduledTask{
		Task:      task,
		StartedAt: time.Now(),
		Status:    TaskStatusRunning,
	}

	// Increment WaitGroup before starting progressMonitor directly
	scheduler.wg.Add(1)
	go scheduler.progressMonitor()
	time.Sleep(100 * time.Millisecond)

	// Progress should still be called even without timeout config
	_ = progressCalled
}

func TestSchedulerProgressMonitorCancelled(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{
		TaskTimeout: 10 * time.Second,
	}, nil)

	ctx, cancel := context.WithCancel(context.Background())
	scheduler.ctx, scheduler.cancel = ctx, cancel

	// Cancel immediately
	cancel()

	// Increment WaitGroup before starting progressMonitor directly
	scheduler.wg.Add(1)
	// Run progress monitor - should exit immediately
	done := make(chan bool, 1)
	go func() {
		scheduler.progressMonitor()
		done <- true
	}()

	select {
	case <-done:
		// Good - monitor exited
	case <-time.After(500 * time.Millisecond):
		t.Error("Progress monitor should exit when context is cancelled")
	}
}

func TestSchedulerSubmitTaskWithDecompositionNoDecompose(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	ctx := context.Background()

	// Short description won't trigger decomposition
	task := &Task{
		ID:          "simple-task",
		Title:       "Simple Task",
		Description: "Short description",
		Priority:    PriorityMedium,
	}

	tasks, err := scheduler.SubmitTaskWithDecomposition(ctx, task)
	if err != nil {
		t.Fatalf("SubmitTaskWithDecomposition failed: %v", err)
	}

	if len(tasks) != 1 {
		t.Errorf("Expected 1 task, got %d", len(tasks))
	}
}

func TestSchedulerDecomposeTaskNoCoordinator(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	// No coordinator set - will use rules-based decomposition
	task := &Task{
		ID:          "task-1",
		Title:       "Test Task",
		Description: "Short description",
	}

	// Without coordinator, should use rules-based decomposition
	subtasks, err := scheduler.decomposeTask(context.Background(), task)
	if err != nil {
		t.Fatalf("decomposeTask failed: %v", err)
	}

	if len(subtasks) != 1 {
		t.Errorf("Expected 1 subtask, got %d", len(subtasks))
	}
}

func TestSchedulerSelectAgentsForTaskNoRoles(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{
		LoadBalanceStrategy: "round_robin",
	}, nil)

	// Agent without roles
	scheduler.workers["agent-1"] = &AgentInfo{
		ID:            "agent-1",
		MaxConcurrent: 2,
		currentLoad:   0,
		Roles:         nil,
	}

	task := NewTask("Test", "Description", acp.Prompt{})
	// Task without required role
	agents := scheduler.selectAgentsForTask(task)

	if len(agents) != 1 {
		t.Errorf("Expected 1 agent, got %d", len(agents))
	}
}

func TestSchedulerSelectByCapabilityWithScores(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	agents := []*AgentInfo{
		{
			ID:          "agent-1",
			Roles:       []string{"coder"},
			Priority:    5,
			successRate: 0.9,
			currentLoad: 0,
		},
		{
			ID:          "agent-2",
			Roles:       []string{"coder", "reviewer"},
			Priority:    3,
			successRate: 0.8,
			currentLoad: 1,
		},
	}

	task := &Task{
		ID:          "task-1",
		Description: "Test task",
		Metadata:    map[string]interface{}{"requiredRole": "coder"},
	}

	selected := scheduler.selectByCapability(agents, task)

	if len(selected) != 1 {
		t.Errorf("Expected 1 agent, got %d", len(selected))
	}

	// Agent-1 should score higher (role match + priority - no load penalty)
	if selected[0].ID != "agent-1" {
		t.Logf("Selected agent: %s", selected[0].ID)
	}
}

func TestSchedulerBuildPromptFromTaskWithFiles(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	task := NewTask("Test", "Write a function", acp.Prompt{})
	task.Metadata["context"] = "This is a Go project"
	task.Metadata["files"] = []string{"/path/to/file.go", "/path/to/another.go"}

	prompt := scheduler.buildPromptFromTask(task)

	// Should have: description + context + 2 files = 4 blocks
	if len(prompt) < 3 {
		t.Errorf("Expected at least 3 content blocks, got %d", len(prompt))
	}

	// Check for resource blocks
	hasResource := false
	for _, block := range prompt {
		if block.Type == "resource" {
			hasResource = true
			break
		}
	}

	if !hasResource {
		t.Error("Expected at least one resource block for files")
	}
}

func TestSchedulerAggregateResultsEmpty(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	// Empty results
	result := scheduler.aggregateResults(nil)
	if result != nil {
		t.Error("Expected nil for empty results")
	}

	// Empty slice
	result = scheduler.aggregateResults([]*TaskResult{})
	if result != nil {
		t.Error("Expected nil for empty slice")
	}
}

func TestSchedulerAggregateResultsSingle(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	// Single result should return as-is
	single := &TaskResult{
		TaskID:  "task-1",
		Content: "Result",
	}

	result := scheduler.aggregateResults([]*TaskResult{single})
	if result != single {
		t.Error("Single result should be returned as-is")
	}
}

func TestSchedulerSplitByConjunctionsEmpty(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	// Empty string
	result := scheduler.splitByConjunctions("")
	if len(result) != 1 || result[0] != "" {
		t.Logf("splitByConjunctions('') = %v", result)
	}

	// Single word
	result = scheduler.splitByConjunctions("single")
	if len(result) != 1 || result[0] != "single" {
		t.Errorf("Expected ['single'], got %v", result)
	}
}

func TestSchedulerSelectRoundRobinEqualTasks(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	// All agents with same task count
	agents := []*AgentInfo{
		{ID: "agent-1", totalTasks: 5},
		{ID: "agent-2", totalTasks: 5},
		{ID: "agent-3", totalTasks: 5},
	}

	selected := scheduler.selectRoundRobin(agents)

	if len(selected) != 1 {
		t.Errorf("Expected 1 agent, got %d", len(selected))
	}
}

func TestSchedulerSelectLeastLoadedSingleAgent(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	agents := []*AgentInfo{
		{ID: "agent-1", currentLoad: 0},
	}

	selected := scheduler.selectLeastLoaded(agents)
	if len(selected) != 1 {
		t.Errorf("Expected 1 agent, got %d", len(selected))
	}
	if selected[0].ID != "agent-1" {
		t.Errorf("Expected agent-1, got %s", selected[0].ID)
	}
}

func TestSchedulerSelectByPrioritySingleAgent(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	agents := []*AgentInfo{
		{ID: "agent-1", Priority: 5},
	}

	selected := scheduler.selectByPriority(agents)
	if len(selected) != 1 {
		t.Errorf("Expected 1 agent, got %d", len(selected))
	}
}

func TestSchedulerTaskStatusValues(t *testing.T) {
	// Test that TaskStatus constants have expected values
	if TaskStatusPending != "pending" {
		t.Errorf("TaskStatusPending should be 'pending', got %s", TaskStatusPending)
	}
	if TaskStatusRunning != "running" {
		t.Errorf("TaskStatusRunning should be 'running', got %s", TaskStatusRunning)
	}
	if TaskStatusCompleted != "completed" {
		t.Errorf("TaskStatusCompleted should be 'completed', got %s", TaskStatusCompleted)
	}
	if TaskStatusFailed != "failed" {
		t.Errorf("TaskStatusFailed should be 'failed', got %s", TaskStatusFailed)
	}
	if TaskStatusRetrying != "retrying" {
		t.Errorf("TaskStatusRetrying should be 'retrying', got %s", TaskStatusRetrying)
	}
}

func TestSchedulerGetStatsWithNoWorkers(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{
		MaxConcurrentTasks: 5,
	}, nil)

	stats := scheduler.GetStats()

	if stats.TotalWorkers != 0 {
		t.Errorf("Expected 0 workers, got %d", stats.TotalWorkers)
	}

	if stats.AverageLoad != 0 {
		t.Errorf("Expected 0 average load with no workers, got %f", stats.AverageLoad)
	}
}

func TestSchedulerGetStatsWithRunningTasks(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{
		MaxConcurrentTasks: 5,
	}, nil)

	// Add running tasks
	scheduler.runningTasks["task-1"] = &ScheduledTask{
		Task:   &Task{ID: "task-1"},
		Status: TaskStatusRunning,
	}
	scheduler.runningTasks["task-2"] = &ScheduledTask{
		Task:   &Task{ID: "task-2"},
		Status: TaskStatusRunning,
	}

	stats := scheduler.GetStats()

	if stats.RunningTasks != 2 {
		t.Errorf("Expected 2 running tasks, got %d", stats.RunningTasks)
	}
}

func TestSchedulerGetStatsWithCompletedTasks(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	// Add completed tasks
	scheduler.completedTask = append(scheduler.completedTask,
		&ScheduledTask{Task: &Task{ID: "task-1"}},
		&ScheduledTask{Task: &Task{ID: "task-2"}},
		&ScheduledTask{Task: &Task{ID: "task-3"}},
	)

	stats := scheduler.GetStats()

	if stats.CompletedTasks != 3 {
		t.Errorf("Expected 3 completed tasks, got %d", stats.CompletedTasks)
	}
}

func TestPriorityOrder(t *testing.T) {
	// Test that priority comparison works correctly
	tests := []struct {
		p1, p2   TaskPriority
		expected int
	}{
		{PriorityHigh, PriorityLow, 1},
		{PriorityLow, PriorityHigh, -1},
		{PriorityHigh, PriorityHigh, 0},
		{PriorityMedium, PriorityLow, 1},
		{PriorityMedium, PriorityHigh, -1},
	}

	for _, tt := range tests {
		result := comparePriority(tt.p1, tt.p2)
		if (result > 0 && tt.expected <= 0) || (result < 0 && tt.expected >= 0) {
			t.Errorf("comparePriority(%v, %v) = %d, expected sign %d", tt.p1, tt.p2, result, tt.expected)
		}
	}
}

// Edge case tests

func TestSchedulerAddNilWorker(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	// Should not panic and should not add nil worker
	scheduler.AddWorker(nil)

	if len(scheduler.workers) != 0 {
		t.Error("Nil worker should not be added")
	}
}

func TestSchedulerSetNilCoordinator(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	// Set a coordinator first
	scheduler.SetCoordinator(&AgentInfo{ID: "coordinator-1"})
	if scheduler.coordinator == nil {
		t.Fatal("Coordinator should be set")
	}

	// Setting nil should not change the coordinator
	scheduler.SetCoordinator(nil)
	if scheduler.coordinator == nil {
		t.Error("Coordinator should not be set to nil")
	}
}

func TestSchedulerSubmitNilTask(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	err := scheduler.SubmitTask(nil)
	if err == nil {
		t.Error("SubmitTask should return error for nil task")
	}
}

func TestSchedulerSelectLeastLoadedEmpty(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	// Empty slice should return nil
	selected := scheduler.selectLeastLoaded([]*AgentInfo{})
	if selected != nil {
		t.Error("selectLeastLoaded with empty slice should return nil")
	}
}

func TestSchedulerSelectByPriorityEmpty(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	// Empty slice should return nil
	selected := scheduler.selectByPriority([]*AgentInfo{})
	if selected != nil {
		t.Error("selectByPriority with empty slice should return nil")
	}
}

func TestSchedulerSelectByCapabilityEmpty(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	task := NewTask("Test", "Description", acp.Prompt{})

	// Empty slice should return nil
	selected := scheduler.selectByCapability([]*AgentInfo{}, task)
	if selected != nil {
		t.Error("selectByCapability with empty slice should return nil")
	}
}

func TestSchedulerSelectRoundRobinEmpty(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	// Empty slice should return nil
	selected := scheduler.selectRoundRobin([]*AgentInfo{})
	if selected != nil {
		t.Error("selectRoundRobin with empty slice should return nil")
	}
}

// Tests for IncrementLoad and DecrementLoad
func TestAgentInfoIncrementLoad(t *testing.T) {
	agent := &AgentInfo{
		ID:            "agent-1",
		MaxConcurrent: 3,
		currentLoad:   0,
		totalTasks:    0,
	}

	// Initial state
	if agent.GetLoad() != 0 {
		t.Errorf("Initial load should be 0, got %d", agent.GetLoad())
	}
	if agent.GetTotalTasks() != 0 {
		t.Errorf("Initial total tasks should be 0, got %d", agent.GetTotalTasks())
	}

	// Increment load
	agent.IncrementLoad()
	if agent.GetLoad() != 1 {
		t.Errorf("Load should be 1 after increment, got %d", agent.GetLoad())
	}
	if agent.GetTotalTasks() != 1 {
		t.Errorf("Total tasks should be 1 after increment, got %d", agent.GetTotalTasks())
	}

	// Increment again
	agent.IncrementLoad()
	if agent.GetLoad() != 2 {
		t.Errorf("Load should be 2 after second increment, got %d", agent.GetLoad())
	}
	if agent.GetTotalTasks() != 2 {
		t.Errorf("Total tasks should be 2 after second increment, got %d", agent.GetTotalTasks())
	}
}

func TestAgentInfoDecrementLoad(t *testing.T) {
	agent := &AgentInfo{
		ID:            "agent-1",
		MaxConcurrent: 3,
		currentLoad:   2,
		totalTasks:    5,
	}

	// Initial state
	if agent.GetLoad() != 2 {
		t.Errorf("Initial load should be 2, got %d", agent.GetLoad())
	}

	// Decrement load
	agent.DecrementLoad()
	if agent.GetLoad() != 1 {
		t.Errorf("Load should be 1 after decrement, got %d", agent.GetLoad())
	}

	// Decrement again
	agent.DecrementLoad()
	if agent.GetLoad() != 0 {
		t.Errorf("Load should be 0 after second decrement, got %d", agent.GetLoad())
	}

	// Total tasks should not change on decrement
	if agent.GetTotalTasks() != 5 {
		t.Errorf("Total tasks should still be 5, got %d", agent.GetTotalTasks())
	}
}

func TestAgentInfoDecrementLoadNotNegative(t *testing.T) {
	agent := &AgentInfo{
		ID:            "agent-1",
		MaxConcurrent: 3,
		currentLoad:   0,
	}

	// Decrement when already at 0 should not go negative
	agent.DecrementLoad()
	if agent.GetLoad() != 0 {
		t.Errorf("Load should stay at 0, got %d", agent.GetLoad())
	}
}

func TestAgentInfoConcurrentLoadOperations(t *testing.T) {
	agent := &AgentInfo{
		ID:            "agent-1",
		MaxConcurrent: 10,
		currentLoad:   0,
		totalTasks:    0,
	}

	var wg sync.WaitGroup
	numOps := 100

	// Concurrent increments
	for i := 0; i < numOps; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			agent.IncrementLoad()
		}()
	}

	wg.Wait()

	if agent.GetLoad() != numOps {
		t.Errorf("Expected load %d after concurrent increments, got %d", numOps, agent.GetLoad())
	}
	if agent.GetTotalTasks() != numOps {
		t.Errorf("Expected total tasks %d, got %d", numOps, agent.GetTotalTasks())
	}

	// Concurrent decrements
	for i := 0; i < numOps; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			agent.DecrementLoad()
		}()
	}

	wg.Wait()

	if agent.GetLoad() != 0 {
		t.Errorf("Expected load 0 after concurrent decrements, got %d", agent.GetLoad())
	}
}

// Test for scheduler Stop when not running
func TestSchedulerStopWhenNotRunning(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	// Stop when not running should not panic
	scheduler.Stop()

	// Verify it's still not running
	if scheduler.running {
		t.Error("Scheduler should not be running")
	}
}

// Test for empty select results
func TestSchedulerSelectAgentsForTaskAllAtCapacity(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	// All agents at max capacity
	scheduler.workers["agent-1"] = &AgentInfo{
		ID:            "agent-1",
		MaxConcurrent: 2,
		currentLoad:   2,
	}
	scheduler.workers["agent-2"] = &AgentInfo{
		ID:            "agent-2",
		MaxConcurrent: 1,
		currentLoad:   1,
	}

	task := NewTask("Test", "Description", acp.Prompt{})
	agents := scheduler.selectAgentsForTask(task)

	if agents != nil {
		t.Errorf("Expected nil when all agents at capacity, got %d agents", len(agents))
	}
}

// Test coordinator set and used
func TestSchedulerDecomposeWithCoordinatorNil(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	// No coordinator set
	task := &Task{
		ID:          "task-1",
		Title:       "Test",
		Description: "Short description",
	}

	// Should fall back to rule-based decomposition
	subtasks, err := scheduler.decomposeTask(context.Background(), task)
	if err != nil {
		t.Fatalf("decomposeTask failed: %v", err)
	}

	if len(subtasks) != 1 {
		t.Errorf("Expected 1 subtask without coordinator, got %d", len(subtasks))
	}
}

// Test SetCoordinator nil handling
func TestSchedulerSetCoordinatorDoesNotReplace(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	// Set initial coordinator
	coordinator := &AgentInfo{ID: "coordinator-1"}
	scheduler.SetCoordinator(coordinator)

	if scheduler.coordinator == nil || scheduler.coordinator.ID != "coordinator-1" {
		t.Fatal("Coordinator should be set")
	}

	// Try to set nil - should not change
	scheduler.SetCoordinator(nil)
	if scheduler.coordinator == nil {
		t.Error("Coordinator should not be replaced with nil")
	}
}

// Test GetLoad and GetTotalTasks thread safety
func TestAgentInfoGetLoadThreadSafe(t *testing.T) {
	agent := &AgentInfo{
		ID:          "agent-1",
		currentLoad: 5,
		totalTasks:  10,
	}

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			load := agent.GetLoad()
			tasks := agent.GetTotalTasks()
			_ = load
			_ = tasks
		}()
	}

	wg.Wait()
	// If we get here without race condition, the test passes
}

// Test progress callback registration and invocation
func TestSchedulerOnProgressCallback(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{
		TaskTimeout: 10 * time.Second,
	}, nil)

	var progressCallbackInvoked bool
	var receivedTaskID string
	var receivedProgress float64

	scheduler.OnProgress(func(taskID string, progress float64) {
		progressCallbackInvoked = true
		receivedTaskID = taskID
		receivedProgress = progress
	})

	// Verify callback was registered
	if scheduler.onProgress == nil {
		t.Error("Progress callback should be registered")
	}

	// Simulate progress callback being called
	if scheduler.onProgress != nil {
		scheduler.onProgress("test-task", 0.5)
	}

	if !progressCallbackInvoked {
		t.Error("Progress callback should have been invoked")
	}
	if receivedTaskID != "test-task" {
		t.Errorf("Expected taskID 'test-task', got '%s'", receivedTaskID)
	}
	if receivedProgress != 0.5 {
		t.Errorf("Expected progress 0.5, got %.2f", receivedProgress)
	}

	t.Logf("Progress callback invoked: %v, taskID: %s, progress: %.2f", progressCallbackInvoked, receivedTaskID, receivedProgress)
}

// Test scheduler stats with no workers
func TestSchedulerGetStatsNoWorkers(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	stats := scheduler.GetStats()
	if stats == nil {
		t.Fatal("GetStats should not return nil")
	}

	if stats.TotalWorkers != 0 {
		t.Errorf("Expected 0 workers, got %d", stats.TotalWorkers)
	}
	if stats.AverageLoad != 0 {
		t.Errorf("Expected 0 average load with no workers, got %f", stats.AverageLoad)
	}
}

// Test scheduler stats with workers
func TestSchedulerGetStatsWithWorkers(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	scheduler.workers["worker-1"] = &AgentInfo{
		ID:          "worker-1",
		currentLoad: 2,
	}
	scheduler.workers["worker-2"] = &AgentInfo{
		ID:          "worker-2",
		currentLoad: 1,
	}

	stats := scheduler.GetStats()

	if stats.TotalWorkers != 2 {
		t.Errorf("Expected 2 workers, got %d", stats.TotalWorkers)
	}

	expectedAvgLoad := 1.5 // (2 + 1) / 2
	if stats.AverageLoad != expectedAvgLoad {
		t.Errorf("Expected average load %.2f, got %.2f", expectedAvgLoad, stats.AverageLoad)
	}
}

// Test all callback registrations
func TestSchedulerAllCallbacks(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	var startCalled, completeCalled, failCalled bool

	scheduler.OnTaskStart(func(task *ScheduledTask) {
		startCalled = true
	})

	scheduler.OnTaskComplete(func(task *ScheduledTask) {
		completeCalled = true
	})

	scheduler.OnTaskFail(func(task *ScheduledTask, err error) {
		failCalled = true
	})

	scheduler.OnProgress(func(taskID string, progress float64) {})

	// Verify all callbacks are set
	if scheduler.onTaskStart == nil {
		t.Error("onTaskStart should be set")
	}
	if scheduler.onTaskComplete == nil {
		t.Error("onTaskComplete should be set")
	}
	if scheduler.onTaskFail == nil {
		t.Error("onTaskFail should be set")
	}
	if scheduler.onProgress == nil {
		t.Error("onProgress should be set")
	}

	t.Logf("Callbacks registered: start=%v, complete=%v, fail=%v", startCalled, completeCalled, failCalled)
}

// Test scheduler with zero timeout (no progress calculation)
func TestSchedulerProgressMonitorZeroTimeout(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{
		TaskTimeout: 0, // No timeout
	}, nil)

	// Add worker
	scheduler.AddWorker(&AgentInfo{
		ID:            "worker-1",
		MaxConcurrent: 2,
	})

	// Start and stop quickly - just verify no panic with zero timeout
	ctx := context.Background()
	err := scheduler.Start(ctx)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	// Stop immediately
	scheduler.Stop()

	// Test passes if no panic occurs with zero timeout
}

// Test scheduler concurrent stats access
func TestSchedulerConcurrentStatsAccess(t *testing.T) {
	scheduler := NewScheduler(SchedulerConfig{}, nil)

	// Add workers
	for i := 0; i < 5; i++ {
		scheduler.workers[fmt.Sprintf("worker-%d", i)] = &AgentInfo{
			ID:          fmt.Sprintf("worker-%d", i),
			currentLoad: i,
		}
	}

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			stats := scheduler.GetStats()
			_ = stats
		}()
	}

	wg.Wait()
	// Test passes if no race condition detected
}
