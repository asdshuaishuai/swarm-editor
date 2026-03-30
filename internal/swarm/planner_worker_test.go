package swarm

import (
	"context"
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
