package swarm

import (
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
)

func TestNewTask(t *testing.T) {
	prompt := acp.Prompt{
		{Type: "text", Text: "Test prompt"},
	}

	task := NewTask("Test Task", "Test description", prompt)

	if task == nil {
		t.Fatal("NewTask returned nil")
	}

	if task.Title != "Test Task" {
		t.Errorf("Expected title 'Test Task', got '%s'", task.Title)
	}

	if task.Description != "Test description" {
		t.Errorf("Expected description 'Test description', got '%s'", task.Description)
	}

	if task.State != TaskStatePending {
		t.Errorf("Expected state '%s', got '%s'", TaskStatePending, task.State)
	}

	if task.Priority != PriorityMedium {
		t.Errorf("Expected priority '%s', got '%s'", PriorityMedium, task.Priority)
	}

	if task.MaxRetries != 3 {
		t.Errorf("Expected MaxRetries 3, got %d", task.MaxRetries)
	}

	if task.ID == "" {
		t.Error("Task ID should not be empty")
	}

	if task.Metadata == nil {
		t.Error("Task metadata should be initialized")
	}

	if task.CreatedAt.IsZero() {
		t.Error("Task CreatedAt should be initialized")
	}
}

func TestTaskIsDecomposable(t *testing.T) {
	tests := []struct {
		name        string
		description string
		prompt      acp.Prompt
		expected    bool
	}{
		{
			name:        "Short description, single prompt",
			description: "Short",
			prompt:      acp.Prompt{{Type: "text", Text: "Single"}},
			expected:    false,
		},
		{
			name:        "Long description",
			description: "This is a very long description that exceeds the 100 character threshold for task decomposition analysis",
			prompt:      acp.Prompt{{Type: "text", Text: "Single"}},
			expected:    true,
		},
		{
			name:        "Multiple prompts",
			description: "Short",
			prompt: acp.Prompt{
				{Type: "text", Text: "First"},
				{Type: "text", Text: "Second"},
				{Type: "text", Text: "Third"},
				{Type: "text", Text: "Fourth"},
			},
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			task := NewTask("Test", tt.description, tt.prompt)
			if got := task.IsDecomposable(); got != tt.expected {
				t.Errorf("IsDecomposable() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestTaskCreateSubtasks(t *testing.T) {
	prompt := acp.Prompt{{Type: "text", Text: "Test"}}
	task := NewTask("Parent", "Description", prompt)

	subtasks := task.CreateSubtasks(3)

	if len(subtasks) != 3 {
		t.Errorf("Expected 3 subtasks, got %d", len(subtasks))
	}

	for i, st := range subtasks {
		if st.ParentID != task.ID {
			t.Errorf("Subtask %d: ParentID should be '%s', got '%s'", i, task.ID, st.ParentID)
		}

		if st.State != TaskStatePending {
			t.Errorf("Subtask %d: State should be pending, got '%s'", i, st.State)
		}
	}

	if len(task.Subtasks) != 3 {
		t.Errorf("Task should have 3 subtasks stored, got %d", len(task.Subtasks))
	}
}

func TestTaskCreateSubtasksInvalidCount(t *testing.T) {
	prompt := acp.Prompt{{Type: "text", Text: "Test"}}
	task := NewTask("Parent", "Description", prompt)

	// Zero count should return nil
	subtasks := task.CreateSubtasks(0)
	if subtasks != nil {
		t.Errorf("Expected nil for zero count, got %d subtasks", len(subtasks))
	}

	// Negative count should return nil
	task2 := NewTask("Parent2", "Description", prompt)
	subtasks = task2.CreateSubtasks(-1)
	if subtasks != nil {
		t.Errorf("Expected nil for negative count, got %d subtasks", len(subtasks))
	}
}

func TestTaskAssign(t *testing.T) {
	task := NewTask("Test", "Desc", acp.Prompt{})
	agentIDs := []acp.AgentID{"agent-1", "agent-2"}

	task.Assign(agentIDs...)

	if len(task.AssignedTo) != 2 {
		t.Errorf("Expected 2 assigned agents, got %d", len(task.AssignedTo))
	}

	if task.State != TaskStateRunning {
		t.Errorf("Expected state '%s', got '%s'", TaskStateRunning, task.State)
	}

	if task.StartedAt.IsZero() {
		t.Error("StartedAt should be set")
	}
}

func TestTaskComplete(t *testing.T) {
	task := NewTask("Test", "Desc", acp.Prompt{})
	result := &TaskResult{TaskID: task.ID}

	// Must transition through running state first (A2A guarded transitions)
	task.Assign(acp.AgentID("agent-1"))

	task.Complete(result)

	if task.State != TaskStateCompleted {
		t.Errorf("Expected state '%s', got '%s'", TaskStateCompleted, task.State)
	}

	if task.Result != result {
		t.Error("Result should be set")
	}

	if task.CompletedAt.IsZero() {
		t.Error("CompletedAt should be set")
	}
}

func TestTaskFail(t *testing.T) {
	task := NewTask("Test", "Desc", acp.Prompt{})

	// Must transition through running state first (A2A guarded transitions)
	task.Assign(acp.AgentID("agent-1"))

	testErr := errors.New("test error")
	task.Fail(testErr)

	if task.State != TaskStateFailed {
		t.Errorf("Expected state '%s', got '%s'", TaskStateFailed, task.State)
	}

	if task.Error != "test error" {
		t.Errorf("Expected error 'test error', got '%s'", task.Error)
	}

	if task.CompletedAt.IsZero() {
		t.Error("CompletedAt should be set")
	}

	// Test with nil error (from running state)
	task2 := NewTask("Test2", "Desc", acp.Prompt{})
	task2.Assign(acp.AgentID("agent-2"))
	task2.Fail(nil)

	if task2.Error != "" {
		t.Errorf("Expected empty error for nil, got '%s'", task2.Error)
	}
}

func TestTaskCancel(t *testing.T) {
	task := NewTask("Test", "Desc", acp.Prompt{})
	task.Cancel(CancelReasonUser)

	if task.State != TaskStateCancelled {
		t.Errorf("Expected state '%s', got '%s'", TaskStateCancelled, task.State)
	}

	if task.CompletedAt.IsZero() {
		t.Error("CompletedAt should be set")
	}
}

func TestTaskRetry(t *testing.T) {
	task := NewTask("Test", "Desc", acp.Prompt{})
	task.MaxRetries = 2

	// Put task into failed state: pending -> running -> failed
	task.Assign(acp.AgentID("agent-1"))
	task.Fail(fmt.Errorf("simulated failure"))
	if task.State != TaskStateFailed {
		t.Fatalf("Task should be failed, got %s", task.State)
	}

	// First retry should succeed
	if !task.Retry() {
		t.Error("First retry should succeed")
	}
	if task.RetryCount != 1 {
		t.Errorf("RetryCount should be 1, got %d", task.RetryCount)
	}
	if task.State != TaskStatePending {
		t.Errorf("State should be pending, got '%s'", task.State)
	}

	// Fail again to test second retry: pending -> running -> failed
	task.Assign(acp.AgentID("agent-1"))
	task.Fail(fmt.Errorf("simulated failure"))

	// Second retry should succeed
	if !task.Retry() {
		t.Error("Second retry should succeed")
	}
	if task.RetryCount != 2 {
		t.Errorf("RetryCount should be 2, got %d", task.RetryCount)
	}

	// Fail again to test max retries: pending -> running -> failed
	task.Assign(acp.AgentID("agent-1"))
	task.Fail(fmt.Errorf("simulated failure"))

	// Third retry should fail (max retries reached)
	if task.Retry() {
		t.Error("Third retry should fail (max reached)")
	}
}

func TestTaskSetPriority(t *testing.T) {
	task := NewTask("Test", "Desc", acp.Prompt{})

	task.SetPriority(PriorityHigh)
	if task.Priority != PriorityHigh {
		t.Errorf("Expected priority '%s', got '%s'", PriorityHigh, task.Priority)
	}
}

func TestTaskSetTimeout(t *testing.T) {
	task := NewTask("Test", "Desc", acp.Prompt{})
	timeout := 30 * time.Second

	task.SetTimeout(timeout)
	if task.Timeout != timeout {
		t.Errorf("Expected timeout %v, got %v", timeout, task.Timeout)
	}
}

func TestTaskAddDependency(t *testing.T) {
	task := NewTask("Test", "Desc", acp.Prompt{})

	task.AddDependency("task-1")
	task.AddDependency("task-2")

	if len(task.Dependencies) != 2 {
		t.Errorf("Expected 2 dependencies, got %d", len(task.Dependencies))
	}
}

func TestTaskIsReady(t *testing.T) {
	task := NewTask("Test", "Desc", acp.Prompt{})
	task.AddDependency("task-1")
	task.AddDependency("task-2")

	// No completed tasks
	completed := map[string]bool{}
	if task.IsReady(completed) {
		t.Error("Task should not be ready with no completed dependencies")
	}

	// Partial completion
	completed["task-1"] = true
	if task.IsReady(completed) {
		t.Error("Task should not be ready with partial dependencies")
	}

	// All dependencies completed
	completed["task-2"] = true
	if !task.IsReady(completed) {
		t.Error("Task should be ready with all dependencies completed")
	}
}

func TestTaskIsReadyNoDependencies(t *testing.T) {
	task := NewTask("Test", "Desc", acp.Prompt{})

	// No dependencies - should be ready
	if !task.IsReady(nil) {
		t.Error("Task with no dependencies should be ready even with nil map")
	}

	if !task.IsReady(map[string]bool{}) {
		t.Error("Task with no dependencies should be ready with empty map")
	}
}

func TestTaskIsReadyNilCompleted(t *testing.T) {
	task := NewTask("Test", "Desc", acp.Prompt{})
	task.AddDependency("task-1")

	// Nil completedTasks map with dependencies - should not be ready
	if task.IsReady(nil) {
		t.Error("Task with dependencies should not be ready with nil completed map")
	}
}

func TestTaskGetDuration(t *testing.T) {
	task := NewTask("Test", "Desc", acp.Prompt{})

	// No duration without start/complete
	if dur := task.GetDuration(); dur != 0 {
		t.Errorf("Expected 0 duration, got %v", dur)
	}

	// Set times
	task.StartedAt = time.Now().Add(-1 * time.Hour)
	task.CompletedAt = time.Now()

	dur := task.GetDuration()
	if dur <= 0 {
		t.Errorf("Expected positive duration, got %v", dur)
	}
}

func TestTaskToJSON(t *testing.T) {
	task := NewTask("Test", "Desc", acp.Prompt{{Type: "text", Text: "Test"}})

	data, err := task.ToJSON()
	if err != nil {
		t.Fatalf("ToJSON failed: %v", err)
	}

	if len(data) == 0 {
		t.Error("JSON data should not be empty")
	}
}

func TestTaskFromJSON(t *testing.T) {
	original := NewTask("Test", "Desc", acp.Prompt{{Type: "text", Text: "Test"}})
	original.SetPriority(PriorityHigh)

	data, err := original.ToJSON()
	if err != nil {
		t.Fatalf("ToJSON failed: %v", err)
	}

	task, err := TaskFromJSON(data)
	if err != nil {
		t.Fatalf("TaskFromJSON failed: %v", err)
	}

	if task.Title != original.Title {
		t.Errorf("Title mismatch: got '%s', want '%s'", task.Title, original.Title)
	}

	if task.Priority != original.Priority {
		t.Errorf("Priority mismatch: got '%s', want '%s'", task.Priority, original.Priority)
	}
}

func TestTaskFromJSONEmpty(t *testing.T) {
	_, err := TaskFromJSON([]byte{})
	if err == nil {
		t.Error("TaskFromJSON should fail with empty data")
	}
}

func TestTaskFromJSONInvalidJSON(t *testing.T) {
	_, err := TaskFromJSON([]byte("invalid json"))
	if err == nil {
		t.Error("TaskFromJSON should fail with invalid JSON")
	}
}

func TestTaskQueue(t *testing.T) {
	q := NewTaskQueue()

	// Empty queue
	if q.Len() != 0 {
		t.Errorf("Empty queue should have length 0, got %d", q.Len())
	}
	if q.Peek() != nil {
		t.Error("Empty queue peek should return nil")
	}
	if q.Pop() != nil {
		t.Error("Empty queue pop should return nil")
	}

	// Add tasks with different priorities
	lowTask := NewTask("Low", "Desc", acp.Prompt{})
	lowTask.SetPriority(PriorityLow)

	highTask := NewTask("High", "Desc", acp.Prompt{})
	highTask.SetPriority(PriorityHigh)

	mediumTask := NewTask("Medium", "Desc", acp.Prompt{})
	mediumTask.SetPriority(PriorityMedium)

	q.Push(lowTask)
	q.Push(highTask)
	q.Push(mediumTask)

	if q.Len() != 3 {
		t.Errorf("Queue should have 3 items, got %d", q.Len())
	}

	// Pop should return highest priority first
	first := q.Pop()
	if first.Priority != PriorityHigh {
		t.Errorf("First pop should be high priority, got '%s'", first.Priority)
	}

	second := q.Pop()
	if second.Priority != PriorityMedium {
		t.Errorf("Second pop should be medium priority, got '%s'", second.Priority)
	}

	third := q.Pop()
	if third.Priority != PriorityLow {
		t.Errorf("Third pop should be low priority, got '%s'", third.Priority)
	}
}

func TestTaskQueueRemove(t *testing.T) {
	q := NewTaskQueue()

	task1 := NewTask("Task1", "Desc", acp.Prompt{})
	task2 := NewTask("Task2", "Desc", acp.Prompt{})

	q.Push(task1)
	q.Push(task2)

	removed := q.Remove(task1.ID)
	if removed == nil || removed.ID != task1.ID {
		t.Error("Remove should return the removed task")
	}

	if q.Len() != 1 {
		t.Errorf("Queue should have 1 item after removal, got %d", q.Len())
	}

	// Remove non-existent
	removed = q.Remove("non-existent")
	if removed != nil {
		t.Error("Remove of non-existent should return nil")
	}
}

func TestTaskQueueGetAll(t *testing.T) {
	q := NewTaskQueue()

	task1 := NewTask("Task1", "Desc", acp.Prompt{})
	task2 := NewTask("Task2", "Desc", acp.Prompt{})

	q.Push(task1)
	q.Push(task2)

	all := q.GetAll()
	if len(all) != 2 {
		t.Errorf("GetAll should return 2 items, got %d", len(all))
	}

	// Verify it's a copy (modifying shouldn't affect queue)
	all[0] = nil
	if q.Len() != 2 {
		t.Error("Modifying returned slice shouldn't affect queue")
	}
}

func TestComparePriority(t *testing.T) {
	tests := []struct {
		p1, p2       TaskPriority
		wantPositive bool
		wantNegative bool
		wantZero     bool
	}{
		{PriorityCritical, PriorityHigh, true, false, false},
		{PriorityHigh, PriorityMedium, true, false, false},
		{PriorityMedium, PriorityLow, true, false, false},
		{PriorityLow, PriorityCritical, false, true, false},
		{PriorityMedium, PriorityMedium, false, false, true},
	}

	for _, tt := range tests {
		result := comparePriority(tt.p1, tt.p2)
		if tt.wantPositive && result <= 0 {
			t.Errorf("comparePriority(%s, %s) = %d, want positive", tt.p1, tt.p2, result)
		}
		if tt.wantNegative && result >= 0 {
			t.Errorf("comparePriority(%s, %s) = %d, want negative", tt.p1, tt.p2, result)
		}
		if tt.wantZero && result != 0 {
			t.Errorf("comparePriority(%s, %s) = %d, want zero", tt.p1, tt.p2, result)
		}
	}
}

func TestComparePriorityInvalid(t *testing.T) {
	// Unknown priority should be treated as lowest (0)
	result := comparePriority(TaskPriority("unknown"), PriorityLow)
	if result >= 0 {
		t.Errorf("Unknown priority should be lower than Low, got result %d", result)
	}

	// Both unknown should be equal
	result = comparePriority(TaskPriority("unknown1"), TaskPriority("unknown2"))
	if result != 0 {
		t.Errorf("Two unknown priorities should be equal, got result %d", result)
	}

	// Unknown vs known - unknown should be lower
	result = comparePriority(TaskPriority("invalid"), PriorityCritical)
	if result >= 0 {
		t.Errorf("Unknown priority should be lower than Critical, got result %d", result)
	}
}

func TestTaskQueueConcurrentAccess(t *testing.T) {
	q := NewTaskQueue()
	done := make(chan bool)

	// Concurrent pushes
	for i := 0; i < 10; i++ {
		go func() {
			for j := 0; j < 100; j++ {
				task := NewTask("Task", "Desc", acp.Prompt{})
				q.Push(task)
			}
			done <- true
		}()
	}

	// Concurrent pops
	for i := 0; i < 5; i++ {
		go func() {
			for j := 0; j < 50; j++ {
				q.Pop()
			}
			done <- true
		}()
	}

	// Concurrent Len calls
	for i := 0; i < 5; i++ {
		go func() {
			for j := 0; j < 100; j++ {
				_ = q.Len()
			}
			done <- true
		}()
	}

	// Wait for all goroutines (10 push + 5 pop + 5 len = 20)
	for i := 0; i < 20; i++ {
		<-done
	}
}

func TestTaskEscalatePriorityIfNearDeadline(t *testing.T) {
	tests := []struct {
		name          string
		timeout       time.Duration
		createdAgo    time.Duration
		initialPrio   TaskPriority
		wantEscalated bool
		wantPriority  TaskPriority
	}{
		{
			name:          "no timeout returns false",
			timeout:       0,
			createdAgo:    0,
			initialPrio:   PriorityLow,
			wantEscalated: false,
			wantPriority:  PriorityLow,
		},
		{
			name:          "far from deadline returns false",
			timeout:       1 * time.Hour,
			createdAgo:    1 * time.Minute,
			initialPrio:   PriorityLow,
			wantEscalated: false,
			wantPriority:  PriorityLow,
		},
		{
			name:          "past deadline returns false",
			timeout:       1 * time.Minute,
			createdAgo:    2 * time.Minute,
			initialPrio:   PriorityLow,
			wantEscalated: false,
			wantPriority:  PriorityLow,
		},
		{
			name:          "within 15 min escalates low to medium",
			timeout:       20 * time.Minute,
			createdAgo:    8 * time.Minute,
			initialPrio:   PriorityLow,
			wantEscalated: true,
			wantPriority:  PriorityMedium,
		},
		{
			name:          "within 5 min escalates low to high",
			timeout:       10 * time.Minute,
			createdAgo:    6 * time.Minute,
			initialPrio:   PriorityLow,
			wantEscalated: true,
			wantPriority:  PriorityHigh,
		},
		{
			name:          "within 1 min escalates to critical",
			timeout:       5 * time.Minute,
			createdAgo:    4*time.Minute + 30*time.Second,
			initialPrio:   PriorityLow,
			wantEscalated: true,
			wantPriority:  PriorityCritical,
		},
		{
			name:          "already at critical does not escalate",
			timeout:       30 * time.Second,
			createdAgo:    15 * time.Second,
			initialPrio:   PriorityCritical,
			wantEscalated: false,
			wantPriority:  PriorityCritical,
		},
		{
			name:          "already at high within 5 min but not 1 min does not escalate",
			timeout:       10 * time.Minute,
			createdAgo:    6 * time.Minute,
			initialPrio:   PriorityHigh,
			wantEscalated: false,
			wantPriority:  PriorityHigh,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			task := NewTask("Test", "Desc", acp.Prompt{})
			task.SetPriority(tt.initialPrio)
			task.SetTimeout(tt.timeout)
			if tt.createdAgo > 0 {
				task.CreatedAt = time.Now().Add(-tt.createdAgo)
			}

			escalated := task.EscalatePriorityIfNearDeadline()
			if escalated != tt.wantEscalated {
				t.Errorf("EscalatePriorityIfNearDeadline() = %v, want %v", escalated, tt.wantEscalated)
			}
			if task.Priority != tt.wantPriority {
				t.Errorf("Priority = %v, want %v", task.Priority, tt.wantPriority)
			}
		})
	}
}

func TestTaskQueueEscalateDeadlines(t *testing.T) {
	q := NewTaskQueue()

	// Task within 1 min of deadline (low → critical)
	criticalTask := NewTask("Critical", "Desc", acp.Prompt{})
	criticalTask.SetPriority(PriorityLow)
	criticalTask.SetTimeout(30 * time.Second)
	criticalTask.CreatedAt = time.Now().Add(-15 * time.Second)
	q.Push(criticalTask)

	// Task far from deadline (no change)
	farTask := NewTask("Far", "Desc", acp.Prompt{})
	farTask.SetPriority(PriorityLow)
	farTask.SetTimeout(1 * time.Hour)
	q.Push(farTask)

	// Task no timeout (no change)
	noTimeoutTask := NewTask("NoTimeout", "Desc", acp.Prompt{})
	noTimeoutTask.SetPriority(PriorityLow)
	q.Push(noTimeoutTask)

	escalated := q.EscalateDeadlines()
	if escalated != 1 {
		t.Errorf("EscalateDeadlines() = %d, want 1", escalated)
	}

	// Verify re-sorting: criticalTask should now be first
	first := q.Peek()
	if first == nil || first.ID != criticalTask.ID {
		t.Errorf("Expected critical task first, got %v", first)
	}
	if criticalTask.Priority != PriorityCritical {
		t.Errorf("Expected critical priority, got %v", criticalTask.Priority)
	}

	// Far task and no-timeout task should remain low
	remaining := q.GetAll()
	for _, task := range remaining {
		if task.ID == farTask.ID && task.Priority != PriorityLow {
			t.Errorf("Far task should remain low, got %v", task.Priority)
		}
		if task.ID == noTimeoutTask.ID && task.Priority != PriorityLow {
			t.Errorf("No-timeout task should remain low, got %v", task.Priority)
		}
	}
}

func TestTaskQueueEscalateDeadlinesEmpty(t *testing.T) {
	q := NewTaskQueue()
	escalated := q.EscalateDeadlines()
	if escalated != 0 {
		t.Errorf("EscalateDeadlines() on empty queue = %d, want 0", escalated)
	}
}

func TestTaskConcurrentStateChanges(t *testing.T) {
	task := NewTask("Test", "Desc", acp.Prompt{})
	done := make(chan bool)

	// Concurrent state changes
	for i := 0; i < 10; i++ {
		go func() {
			for j := 0; j < 100; j++ {
				task.SetPriority(PriorityHigh)
				task.SetPriority(PriorityLow)
				_ = task.GetPriority()
			}
			done <- true
		}()
	}

	// Wait for all goroutines
	for i := 0; i < 10; i++ {
		<-done
	}
}

func TestTaskCancelCascadesToSubtasks(t *testing.T) {
	parent := NewTask("Parent", "Parent desc", acp.Prompt{})
	subtasks := parent.CreateSubtasks(3)

	// Verify subtasks exist
	if len(parent.Subtasks) != 3 {
		t.Fatalf("Expected 3 subtasks, got %d", len(parent.Subtasks))
	}

	// Cancel parent
	parent.Cancel(CancelReasonUser)

	// Verify parent is cancelled
	if parent.State != TaskStateCancelled {
		t.Errorf("Expected parent state '%s', got '%s'", TaskStateCancelled, parent.State)
	}

	// Verify all subtasks are also cancelled (AutoGen linked cancellation pattern)
	for i, st := range subtasks {
		if st.State != TaskStateCancelled {
			t.Errorf("Subtask %d: expected state '%s', got '%s'", i, TaskStateCancelled, st.State)
		}
		if st.CompletedAt.IsZero() {
			t.Errorf("Subtask %d: CompletedAt should be set after cancellation", i)
		}
	}
}

func TestTaskCancelCascadesRecursively(t *testing.T) {
	parent := NewTask("Parent", "Parent desc", acp.Prompt{})
	subtasks := parent.CreateSubtasks(2)

	// Add nested subtasks to the first subtask
	grandchildren := subtasks[0].CreateSubtasks(2)

	parent.Cancel(CancelReasonUser)

	// Verify nested subtasks are also cancelled
	for i, gc := range grandchildren {
		if gc.State != TaskStateCancelled {
			t.Errorf("Grandchild %d: expected state '%s', got '%s'", i, TaskStateCancelled, gc.State)
		}
	}
}

func TestTaskStatusIsTerminal(t *testing.T) {
	tests := []struct {
		status   TaskStatus
		terminal bool
	}{
		{TaskStatusPending, false},
		{TaskStatusRunning, false},
		{TaskStatusRetrying, false},
		{TaskStatusDecomposing, false},
		{TaskStatusAssigned, false},
		{TaskStatusConsensus, false},
		{TaskStatusCompleted, true},
		{TaskStatusFailed, true},
		{TaskStatusCancelled, true},
	}

	for _, tt := range tests {
		if got := tt.status.IsTerminal(); got != tt.terminal {
			t.Errorf("TaskStatus(%q).IsTerminal() = %v, want %v", tt.status, got, tt.terminal)
		}
	}
}
