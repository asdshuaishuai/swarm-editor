package swarm

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/agent"
)

func TestPlanState(t *testing.T) {
	tests := []struct {
		state    PlanState
		expected string
	}{
		{PlanStateDraft, "draft"},
		{PlanStateApproved, "approved"},
		{PlanStateExecuting, "executing"},
		{PlanStateCompleted, "completed"},
		{PlanStateFailed, "failed"},
	}

	for _, tt := range tests {
		t.Run(string(tt.state), func(t *testing.T) {
			if string(tt.state) != tt.expected {
				t.Errorf("expected %s, got %s", tt.expected, tt.state)
			}
		})
	}
}

func TestSubtaskState(t *testing.T) {
	tests := []struct {
		state    SubtaskState
		expected string
	}{
		{SubtaskStatePending, "pending"},
		{SubtaskStateRunning, "running"},
		{SubtaskStateCompleted, "completed"},
		{SubtaskStateFailed, "failed"},
		{SubtaskStateSkipped, "skipped"},
	}

	for _, tt := range tests {
		t.Run(string(tt.state), func(t *testing.T) {
			if string(tt.state) != tt.expected {
				t.Errorf("expected %s, got %s", tt.expected, tt.state)
			}
		})
	}
}

func TestNewPlannerWorkerManager(t *testing.T) {
	registry := agent.NewRegistry()
	config := DefaultPlannerWorkerConfig()
	m := NewPlannerWorkerManager(registry, config)

	if m == nil {
		t.Fatal("expected non-nil manager")
	}
	if m.registry != registry {
		t.Error("registry not set correctly")
	}
	if m.config.MaxSubtasksPerPlan != 10 {
		t.Errorf("expected MaxSubtasksPerPlan 10, got %d", m.config.MaxSubtasksPerPlan)
	}
}

func TestNewPlannerWorkerManager_NilRegistry(t *testing.T) {
	m := NewPlannerWorkerManager(nil, DefaultPlannerWorkerConfig())

	if m == nil {
		t.Fatal("expected non-nil manager")
	}
	if m.registry == nil {
		t.Error("expected default registry to be created")
	}
	if m.plans == nil {
		t.Error("expected plans map to be initialized")
	}
	if m.workers == nil {
		t.Error("expected workers map to be initialized")
	}
}

func TestRegisterWorker(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	worker := agent.NewAgent("Test Worker", agent.AgentTypeCoder)
	m.RegisterWorker(worker, agent.AgentTypeCoder, []string{"code"})

	if len(m.workers) != 1 {
		t.Errorf("expected 1 worker, got %d", len(m.workers))
	}
	if len(m.workerPool[agent.AgentTypeCoder]) != 1 {
		t.Errorf("expected 1 coder in pool, got %d", len(m.workerPool[agent.AgentTypeCoder]))
	}
}

func TestUnregisterWorker(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	worker := agent.NewAgent("Test Worker", agent.AgentTypeCoder)
	m.RegisterWorker(worker, agent.AgentTypeCoder, []string{"code"})
	m.UnregisterWorker(string(worker.ID))

	if len(m.workers) != 0 {
		t.Errorf("expected 0 workers, got %d", len(m.workers))
	}
	if len(m.workerPool[agent.AgentTypeCoder]) != 0 {
		t.Errorf("expected 0 coders in pool, got %d", len(m.workerPool[agent.AgentTypeCoder]))
	}
}

func TestSetPlanner(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	planner := agent.NewAgent("Test Planner", agent.AgentTypePlanner)
	m.SetPlanner(planner)

	if m.planner != planner {
		t.Error("planner not set correctly")
	}
}

func TestCreatePlan(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	ctx := context.Background()
	subtasks := []*Subtask{
		{ID: "st1", Title: "Task 1", Description: "First task", Type: "code"},
		{ID: "st2", Title: "Task 2", Description: "Second task", Type: "test"},
	}

	plan, err := m.CreatePlan(ctx, "task-1", "Test plan", "Complete test goal", subtasks)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if plan.ParentTask != "task-1" {
		t.Errorf("expected ParentTask task-1, got %s", plan.ParentTask)
	}
	if plan.Goal != "Complete test goal" {
		t.Errorf("expected goal 'Complete test goal', got %s", plan.Goal)
	}
	if len(plan.Subtasks) != 2 {
		t.Errorf("expected 2 subtasks, got %d", len(plan.Subtasks))
	}
	if plan.State != PlanStateDraft {
		t.Errorf("expected state draft, got %s", plan.State)
	}
}

func TestCreatePlanTooManySubtasks(t *testing.T) {
	registry := agent.NewRegistry()
	config := DefaultPlannerWorkerConfig()
	config.MaxSubtasksPerPlan = 2
	m := NewPlannerWorkerManager(registry, config)

	ctx := context.Background()
	subtasks := []*Subtask{
		{ID: "st1", Title: "Task 1"},
		{ID: "st2", Title: "Task 2"},
		{ID: "st3", Title: "Task 3"},
	}

	_, err := m.CreatePlan(ctx, "task-1", "Test", "Goal", subtasks)
	if err == nil {
		t.Error("expected error for too many subtasks")
	}
}

func TestApprovePlan(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	ctx := context.Background()
	subtasks := []*Subtask{{ID: "st1", Title: "Task 1"}}
	plan, _ := m.CreatePlan(ctx, "task-1", "Test", "Goal", subtasks)

	err := m.ApprovePlan(plan.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if plan.State != PlanStateApproved {
		t.Errorf("expected state approved, got %s", plan.State)
	}
}

func TestApprovePlanNotFound(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	err := m.ApprovePlan("non-existent")
	if err == nil {
		t.Error("expected error for non-existent plan")
	}
}

func TestApprovePlanWrongState(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	ctx := context.Background()
	subtasks := []*Subtask{{ID: "st1", Title: "Task 1"}}
	plan, _ := m.CreatePlan(ctx, "task-1", "Test", "Goal", subtasks)
	plan.State = PlanStateExecuting // Wrong state

	err := m.ApprovePlan(plan.ID)
	if err == nil {
		t.Error("expected error for wrong state")
	}
}

func TestGetPlan(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	ctx := context.Background()
	subtasks := []*Subtask{{ID: "st1", Title: "Task 1"}}
	plan, _ := m.CreatePlan(ctx, "task-1", "Test", "Goal", subtasks)

	retrieved, ok := m.GetPlan(plan.ID)
	if !ok {
		t.Fatal("expected to find plan")
	}
	if retrieved.ID != plan.ID {
		t.Errorf("expected ID %s, got %s", plan.ID, retrieved.ID)
	}
}

func TestGetPlanNotFound(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	_, ok := m.GetPlan("non-existent")
	if ok {
		t.Error("expected not to find plan")
	}
}

func TestGetWorkerStats(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	worker := agent.NewAgent("Test Worker", agent.AgentTypeCoder)
	m.RegisterWorker(worker, agent.AgentTypeCoder, []string{"code"})

	stats := m.GetWorkerStats()
	if len(stats) != 1 {
		t.Errorf("expected 1 worker in stats, got %d", len(stats))
	}
}

func TestPlanProgress(t *testing.T) {
	plan := &Plan{
		Subtasks: []*Subtask{
			{ID: "st1", State: SubtaskStateCompleted},
			{ID: "st2", State: SubtaskStateCompleted},
			{ID: "st3", State: SubtaskStatePending},
			{ID: "st4", State: SubtaskStateFailed},
		},
		CompletedCount: 2,
		FailedCount:    1,
	}

	progress := plan.GetProgress()
	expected := 0.75 // 3/4
	if progress != expected {
		t.Errorf("expected progress %f, got %f", expected, progress)
	}
}

func TestPlanProgressNoSubtasks(t *testing.T) {
	plan := &Plan{
		Subtasks: []*Subtask{},
	}

	progress := plan.GetProgress()
	if progress != 0 {
		t.Errorf("expected progress 0, got %f", progress)
	}
}

func TestPlanToJSON(t *testing.T) {
	plan := &Plan{
		ID:          "plan-1",
		ParentTask:  "task-1",
		Description: "Test plan",
		Goal:        "Test goal",
		Subtasks: []*Subtask{
			{ID: "st1", Title: "Task 1", Type: "code"},
		},
		State:     PlanStateDraft,
		CreatedAt: time.Now(),
	}

	data, err := plan.ToJSON()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(data) == 0 {
		t.Error("expected non-empty JSON")
	}
}

func TestPlanFromJSON(t *testing.T) {
	jsonData := `{
		"id": "plan-1",
		"parentTask": "task-1",
		"description": "Test plan",
		"goal": "Test goal",
		"subtasks": [{"id": "st1", "title": "Task 1", "type": "code", "state": "pending"}],
		"state": "draft"
	}`

	plan, err := PlanFromJSON([]byte(jsonData))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if plan.ID != "plan-1" {
		t.Errorf("expected ID plan-1, got %s", plan.ID)
	}
	if len(plan.Subtasks) != 1 {
		t.Errorf("expected 1 subtask, got %d", len(plan.Subtasks))
	}
}

func TestCallbackOnPlanCreated(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	var createdPlan *Plan
	var mu sync.Mutex
	m.OnPlanCreated(func(plan *Plan) {
		mu.Lock()
		createdPlan = plan
		mu.Unlock()
	})

	ctx := context.Background()
	subtasks := []*Subtask{{ID: "st1", Title: "Task 1"}}
	plan, _ := m.CreatePlan(ctx, "task-1", "Test", "Goal", subtasks)

	mu.Lock()
	defer mu.Unlock()
	if createdPlan == nil {
		t.Fatal("expected callback to be called")
	}
	if createdPlan.ID != plan.ID {
		t.Errorf("expected plan ID %s, got %s", plan.ID, createdPlan.ID)
	}
}

func TestTopologicalSort(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	plan := &Plan{
		Subtasks: []*Subtask{
			{ID: "st1", Title: "Task 1", DependsOn: []string{}},
			{ID: "st2", Title: "Task 2", DependsOn: []string{"st1"}},
			{ID: "st3", Title: "Task 3", DependsOn: []string{"st1"}},
			{ID: "st4", Title: "Task 4", DependsOn: []string{"st2", "st3"}},
		},
		Dependencies: map[string][]string{
			"st1": {},
			"st2": {"st1"},
			"st3": {"st1"},
			"st4": {"st2", "st3"},
		},
	}

	order, _ := m.topologicalSort(plan)

	// st1 must come before st2 and st3
	// st2 and st3 must come before st4
	st1Idx := indexOf(order, "st1")
	st2Idx := indexOf(order, "st2")
	st3Idx := indexOf(order, "st3")
	st4Idx := indexOf(order, "st4")

	if st1Idx > st2Idx {
		t.Error("st1 should come before st2")
	}
	if st1Idx > st3Idx {
		t.Error("st1 should come before st3")
	}
	if st2Idx > st4Idx {
		t.Error("st2 should come before st4")
	}
	if st3Idx > st4Idx {
		t.Error("st3 should come before st4")
	}
}

func TestDependenciesSatisfied(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	plan := &Plan{
		Results: map[string]*SubtaskResult{
			"st1": {SubtaskID: "st1", Success: true},
		},
	}

	subtask := &Subtask{
		ID:        "st2",
		DependsOn: []string{"st1"},
	}

	if !m.dependenciesSatisfied(plan, subtask) {
		t.Error("expected dependencies to be satisfied")
	}

	subtask.DependsOn = []string{"st1", "st3"} // st3 not completed
	if m.dependenciesSatisfied(plan, subtask) {
		t.Error("expected dependencies to NOT be satisfied")
	}
}

func TestInferAgentType(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	tests := []struct {
		subtaskType string
		expected    agent.AgentType
	}{
		{"code", agent.AgentTypeCoder},
		{"implementation", agent.AgentTypeCoder},
		{"review", agent.AgentTypeReviewer},
		{"test", agent.AgentTypeTester},
		{"architecture", agent.AgentTypeArchitect},
		{"design", agent.AgentTypeArchitect},
		{"unknown", agent.AgentTypeWorker},
	}

	for _, tt := range tests {
		t.Run(tt.subtaskType, func(t *testing.T) {
			subtask := &Subtask{Type: tt.subtaskType}
			result := m.inferAgentType(subtask)
			if result != tt.expected {
				t.Errorf("expected %s, got %s", tt.expected, result)
			}
		})
	}
}

// Helper function
func indexOf(slice []string, item string) int {
	for i, v := range slice {
		if v == item {
			return i
		}
	}
	return -1
}

func TestPlannerWorkerManager_Callbacks(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	var callbackSet bool

	m.OnSubtaskStart(func(s *Subtask, workerID string) {
		callbackSet = true
	})

	// Verify callback registration doesn't panic
	// The callback is called internally during plan execution
	_ = callbackSet // Acknowledge variable exists
}

func TestPlannerWorkerManager_Wait(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	// Wait should return immediately when no plans are running
	done := make(chan struct{})
	go func() {
		m.Wait()
		close(done)
	}()

	select {
	case <-done:
		// Good - Wait returned immediately
	case <-time.After(1 * time.Second):
		t.Error("Wait should return immediately when no plans are running")
	}
}

func TestGeneratePlanID(t *testing.T) {
	id1 := generatePlanID()
	id2 := generatePlanID()

	if id1 == "" {
		t.Error("generatePlanID should return non-empty string")
	}
	if len(id1) < 5 {
		t.Errorf("generatePlanID returned too short: %s", id1)
	}
	// Should start with "plan"
	if !strings.HasPrefix(id1, "plan") {
		t.Errorf("generatePlanID should start with 'plan', got %s", id1)
	}
	// Should be unique
	if id1 == id2 {
		t.Error("generatePlanID should return unique IDs")
	}
}

func TestPlannerWorkerManager_GetActivePlans(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	// No active plans initially (plans only become active during ExecutePlan)
	plans := m.GetActivePlans()
	if len(plans) != 0 {
		t.Errorf("expected 0 active plans, got %d", len(plans))
	}
}

func TestPlannerWorkerManager_OnSubtaskComplete(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	var callbackCalled bool
	m.OnSubtaskComplete(func(result *SubtaskResult) {
		callbackCalled = true
	})

	// Verify callback registration (no panic)
	_ = callbackCalled
}

func TestPlannerWorkerManager_OnPlanComplete(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	var callbackCalled bool
	m.OnPlanComplete(func(plan *Plan) {
		callbackCalled = true
	})

	// Verify callback registration (no panic)
	_ = callbackCalled
}

func TestPlannerWorkerManager_MarkSubtaskState(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	ctx := context.Background()
	subtasks := []*Subtask{
		{ID: "st1", Title: "Task 1", State: SubtaskStatePending},
		{ID: "st2", Title: "Task 2", State: SubtaskStatePending},
	}
	plan, _ := m.CreatePlan(ctx, "task-1", "Test", "Goal", subtasks)

	// Mark first subtask as running
	m.markSubtaskState(plan, "st1", SubtaskStateRunning)
	if plan.Subtasks[0].State != SubtaskStateRunning {
		t.Errorf("expected st1 state running, got %s", plan.Subtasks[0].State)
	}
	if plan.Subtasks[1].State != SubtaskStatePending {
		t.Errorf("expected st2 state unchanged, got %s", plan.Subtasks[1].State)
	}

	// Mark first subtask as completed
	m.markSubtaskState(plan, "st1", SubtaskStateCompleted)
	if plan.Subtasks[0].State != SubtaskStateCompleted {
		t.Errorf("expected st1 state completed, got %s", plan.Subtasks[0].State)
	}

	// Non-existent subtask ID should be no-op
	m.markSubtaskState(plan, "nonexistent", SubtaskStateFailed)
}

func TestPlannerWorkerManager_MarkPlanFailed(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	ctx := context.Background()
	subtasks := []*Subtask{{ID: "st1", Title: "Task 1"}}
	plan, _ := m.CreatePlan(ctx, "task-1", "Test", "Goal", subtasks)
	m.ApprovePlan(plan.ID)

	// Mark as active (simulating execution start)
	m.mu.Lock()
	m.active[plan.ID] = plan
	m.mu.Unlock()

	m.markPlanFailed(plan.ID, "worker crashed")

	if plan.State != PlanStateFailed {
		t.Errorf("expected state failed, got %s", plan.State)
	}
	if plan.FailureReason != "worker crashed" {
		t.Errorf("expected failure reason 'worker crashed', got %q", plan.FailureReason)
	}

	// Should be removed from active and added to completed
	m.mu.RLock()
	_, inActive := m.active[plan.ID]
	_, inCompleted := m.completed[plan.ID]
	m.mu.RUnlock()

	if inActive {
		t.Error("plan should be removed from active")
	}
	if !inCompleted {
		t.Error("plan should be in completed")
	}

	// Non-existent plan should be no-op
	m.markPlanFailed("nonexistent", "reason")
}

func TestPlannerWorkerManager_BuildWorkerPromptWithContext(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	subtask := &Subtask{
		ID:          "st1",
		Title:       "Implement feature",
		Description: "Write the code for feature X",
		Input:       "context data",
		Expected:    "feature X works",
	}

	ctx := &promptContext{
		Goal:          "Complete the project",
		DependencyIDs: []string{"st0"},
		DepResults: map[string]*SubtaskResult{
			"st0": {SubtaskID: "st0", Output: "Previous result data", Success: true},
		},
	}

	prompt := m.buildWorkerPromptWithContext(subtask, ctx)
	if len(prompt) == 0 {
		t.Fatal("expected non-empty prompt")
	}

	text := prompt[0].Text
	if !strings.Contains(text, "Implement feature") {
		t.Error("prompt should contain subtask title")
	}
	if !strings.Contains(text, "Complete the project") {
		t.Error("prompt should contain plan goal")
	}
	if !strings.Contains(text, "Write the code for feature X") {
		t.Error("prompt should contain subtask description")
	}
	if !strings.Contains(text, "context data") {
		t.Error("prompt should contain input")
	}
	if !strings.Contains(text, "feature X works") {
		t.Error("prompt should contain expected output")
	}
	if !strings.Contains(text, "Previous result data") {
		t.Error("prompt should contain dependency result")
	}
}

func TestPlannerWorkerManager_BuildWorkerPromptWithContext_NoInput(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	subtask := &Subtask{
		ID:          "st1",
		Title:       "Simple task",
		Description: "Do something",
	}

	ctx := &promptContext{
		Goal: "Goal",
	}

	prompt := m.buildWorkerPromptWithContext(subtask, ctx)
	text := prompt[0].Text

	// Should not contain Input or Expected Output sections
	if strings.Contains(text, "## Input") {
		t.Error("prompt should not contain Input section when empty")
	}
	if strings.Contains(text, "## Expected Output") {
		t.Error("prompt should not contain Expected Output section when empty")
	}
	if strings.Contains(text, "## Previous Results") {
		t.Error("prompt should not contain Previous Results section when no deps")
	}
}

func TestPlannerWorkerManager_AssignWorker_AutoAssign(t *testing.T) {
	registry := agent.NewRegistry()
	config := DefaultPlannerWorkerConfig()
	config.AutoAssign = true
	m := NewPlannerWorkerManager(registry, config)

	worker := agent.NewAgent("Worker 1", agent.AgentTypeCoder)
	m.RegisterWorker(worker, agent.AgentTypeCoder, []string{"code"})

	ctx := context.Background()
	subtasks := []*Subtask{{ID: "st1", Title: "Code task", Type: "code"}}
	plan, _ := m.CreatePlan(ctx, "task-1", "Test", "Goal", subtasks)

	subtask := &Subtask{ID: "st1", Type: "code", PlanID: plan.ID}
	assigned := m.assignWorker(subtask)

	if assigned == "" {
		t.Fatal("expected worker to be assigned")
	}
	if assigned != string(worker.ID) {
		t.Errorf("expected worker ID %q, got %q", string(worker.ID), assigned)
	}

	// Worker should now have CurrentTask set
	m.mu.RLock()
	info := m.workers[string(worker.ID)]
	m.mu.RUnlock()
	if info.CurrentTask != "st1" {
		t.Errorf("expected CurrentTask 'st1', got %q", info.CurrentTask)
	}
}

func TestPlannerWorkerManager_AssignWorker_AutoAssignDisabled(t *testing.T) {
	registry := agent.NewRegistry()
	config := DefaultPlannerWorkerConfig()
	config.AutoAssign = false
	m := NewPlannerWorkerManager(registry, config)

	worker := agent.NewAgent("Worker 1", agent.AgentTypeCoder)
	m.RegisterWorker(worker, agent.AgentTypeCoder, []string{"code"})

	subtask := &Subtask{ID: "st1", Type: "code"}
	assigned := m.assignWorker(subtask)

	if assigned != "" {
		t.Errorf("expected no worker assigned when AutoAssign=false, got %q", assigned)
	}
}

func TestPlannerWorkerManager_AssignWorker_BusyWorker(t *testing.T) {
	registry := agent.NewRegistry()
	config := DefaultPlannerWorkerConfig()
	config.AutoAssign = true
	m := NewPlannerWorkerManager(registry, config)

	worker := agent.NewAgent("Worker 1", agent.AgentTypeCoder)
	m.RegisterWorker(worker, agent.AgentTypeCoder, []string{"code"})

	// Mark worker as busy
	m.mu.Lock()
	m.workers[string(worker.ID)].CurrentTask = "other-task"
	m.mu.Unlock()

	subtask := &Subtask{ID: "st1", Type: "code"}
	assigned := m.assignWorker(subtask)

	if assigned != "" {
		t.Errorf("expected no worker assigned when all busy, got %q", assigned)
	}
}

func TestPlannerWorkerManager_AssignWorker_TypeFallback(t *testing.T) {
	registry := agent.NewRegistry()
	config := DefaultPlannerWorkerConfig()
	config.AutoAssign = true
	m := NewPlannerWorkerManager(registry, config)

	// Register a coder, but request a tester
	worker := agent.NewAgent("Worker 1", agent.AgentTypeCoder)
	m.RegisterWorker(worker, agent.AgentTypeCoder, []string{"code"})

	ctx := context.Background()
	subtasks := []*Subtask{{ID: "st1", Title: "Test task", Type: "test"}}
	plan, _ := m.CreatePlan(ctx, "task-1", "Test", "Goal", subtasks)

	// No tester available, should fallback to any available worker
	subtask := &Subtask{ID: "st1", Type: "test", PlanID: plan.ID}
	assigned := m.assignWorker(subtask)

	if assigned == "" {
		t.Fatal("expected fallback to available worker of different type")
	}
	if assigned != string(worker.ID) {
		t.Errorf("expected fallback to worker %q, got %q", string(worker.ID), assigned)
	}
}

func TestPlannerWorkerManager_GetSubtask(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	plan := &Plan{
		Subtasks: []*Subtask{
			{ID: "st1", Title: "Task 1"},
			{ID: "st2", Title: "Task 2"},
		},
	}

	st := m.getSubtask(plan, "st1")
	if st == nil {
		t.Fatal("expected to find subtask st1")
	}
	if st.Title != "Task 1" {
		t.Errorf("expected title 'Task 1', got %q", st.Title)
	}

	st = m.getSubtask(plan, "nonexistent")
	if st != nil {
		t.Error("expected nil for nonexistent subtask")
	}
}

// --- ExecutePlan tests (via executeSubtasks) ---

func TestPlannerWorkerManager_ExecutePlan_CycleDetection(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	ctx := context.Background()
	// Create subtasks with circular dependencies: st1 depends on st2, st2 depends on st1
	subtasks := []*Subtask{
		{ID: "st1", Title: "Task 1", DependsOn: []string{"st2"}},
		{ID: "st2", Title: "Task 2", DependsOn: []string{"st1"}},
	}
	plan, _ := m.CreatePlan(ctx, "task-cycle", "Test", "Goal", subtasks)
	m.ApprovePlan(plan.ID)

	// ExecutePlan spawns a goroutine — wait for it
	m.ExecutePlan(ctx, plan.ID)
	m.Wait()

	// Plan should be failed due to cycle
	p, ok := m.GetPlan(plan.ID)
	if !ok {
		t.Fatal("plan should exist after execution")
	}
	if p.State != PlanStateFailed {
		t.Errorf("plan state = %q, want %q", p.State, PlanStateFailed)
	}
	if p.FailureReason == "" {
		t.Error("expected failure reason for cycle detection")
	}
}

func TestPlannerWorkerManager_ExecutePlan_ContextCancelled(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	ctx, cancel := context.WithCancel(context.Background())
	subtasks := []*Subtask{
		{ID: "st1", Title: "Task 1"},
		{ID: "st2", Title: "Task 2"},
	}
	plan, _ := m.CreatePlan(ctx, "task-cancel", "Test", "Goal", subtasks)
	m.ApprovePlan(plan.ID)

	// Cancel context before execution
	cancel()

	m.ExecutePlan(ctx, plan.ID)
	m.Wait()

	p, ok := m.GetPlan(plan.ID)
	if !ok {
		t.Fatal("plan should exist after execution")
	}
	if p.State != PlanStateFailed {
		t.Errorf("plan state = %q, want %q", p.State, PlanStateFailed)
	}
}

func TestPlannerWorkerManager_ExecutePlan_NotApproved(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	ctx := context.Background()
	subtasks := []*Subtask{{ID: "st1", Title: "Task 1"}}
	plan, _ := m.CreatePlan(ctx, "task-draft", "Test", "Goal", subtasks)
	// Don't approve — keep in draft

	err := m.ExecutePlan(ctx, plan.ID)
	if err == nil {
		t.Error("expected error for non-approved plan")
	}
}

func TestPlannerWorkerManager_ExecutePlan_NotFound(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	err := m.ExecutePlan(context.Background(), "nonexistent")
	if err == nil {
		t.Error("expected error for non-existent plan")
	}
}

func TestPlannerWorkerManager_ExecutePlan_NoWorker(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewPlannerWorkerManager(registry, DefaultPlannerWorkerConfig())

	ctx := context.Background()
	subtasks := []*Subtask{{ID: "st1", Title: "Task 1"}}
	plan, _ := m.CreatePlan(ctx, "task-noworker", "Test", "Goal", subtasks)
	m.ApprovePlan(plan.ID)

	// No workers registered — executeSubtask will fail to assign worker
	m.ExecutePlan(ctx, plan.ID)
	m.Wait()

	p, ok := m.GetPlan(plan.ID)
	if !ok {
		t.Fatal("plan should exist")
	}
	// Should be failed since no worker was assigned
	if p.State != PlanStateFailed {
		t.Errorf("plan state = %q, want %q (no worker available)", p.State, PlanStateFailed)
	}
}
