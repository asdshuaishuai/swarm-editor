package swarm

import (
	"sync"
	"testing"
	"time"
)

// mockBroadcaster captures broadcast events for testing.
type mockBroadcaster struct {
	mu      sync.Mutex
	events  []map[string]any
}

func (m *mockBroadcaster) Broadcast(eventType string, payload any) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.events = append(m.events, map[string]any{
		"type":    eventType,
		"payload": payload,
	})
}

func (m *mockBroadcaster) getEvents() []map[string]any {
	m.mu.Lock()
	defer m.mu.Unlock()
	result := make([]map[string]any, len(m.events))
	copy(result, m.events)
	return result
}

func (m *mockBroadcaster) eventCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.events)
}

func TestNewScheduleRunner(t *testing.T) {
	store := NewScheduleStore()
	orch := NewOrchestrator(NewScheduler(SchedulerConfig{}, nil))
	b := &mockBroadcaster{}

	runner := NewScheduleRunner(store, orch, b)

	if runner == nil {
		t.Fatal("NewScheduleRunner returned nil")
	}
	if runner.Status() != ScheduleRunnerStopped {
		t.Errorf("expected status stopped, got %s", runner.Status())
	}
	if runner.GetRunningCount() != 0 {
		t.Errorf("expected 0 running, got %d", runner.GetRunningCount())
	}
	if runner.GetQueuedCount() != 0 {
		t.Errorf("expected 0 queued, got %d", runner.GetQueuedCount())
	}
}

func TestScheduleRunnerStartStop(t *testing.T) {
	store := NewScheduleStore()
	orch := NewOrchestrator(NewScheduler(SchedulerConfig{}, nil))
	b := &mockBroadcaster{}

	runner := NewScheduleRunner(store, orch, b)

	// Start the runner
	if err := runner.Start(); err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	if runner.Status() != ScheduleRunnerRunning {
		t.Errorf("expected status running, got %s", runner.Status())
	}

	// Double start should fail
	if err := runner.Start(); err == nil {
		t.Error("expected error on double start")
	}

	// Stop the runner
	if err := runner.Stop(); err != nil {
		t.Fatalf("Stop failed: %v", err)
	}
	if runner.Status() != ScheduleRunnerStopped {
		t.Errorf("expected status stopped, got %s", runner.Status())
	}

	// Double stop should fail
	if err := runner.Stop(); err == nil {
		t.Error("expected error on double stop")
	}
}

func TestScheduleRunnerStopWhenNotRunning(t *testing.T) {
	store := NewScheduleStore()
	orch := NewOrchestrator(NewScheduler(SchedulerConfig{}, nil))
	b := &mockBroadcaster{}

	runner := NewScheduleRunner(store, orch, b)

	if err := runner.Stop(); err == nil {
		t.Error("expected error when stopping non-running runner")
	}
}

func TestScheduleRunnerStatusSnapshot(t *testing.T) {
	store := NewScheduleStore()
	orch := NewOrchestrator(NewScheduler(SchedulerConfig{}, nil))
	b := &mockBroadcaster{}

	runner := NewScheduleRunner(store, orch, b)

	snapshot := runner.StatusSnapshot()
	if snapshot["status"] != string(ScheduleRunnerStopped) {
		t.Errorf("expected stopped, got %v", snapshot["status"])
	}
	if snapshot["runningCount"] != 0 {
		t.Errorf("expected 0 running, got %v", snapshot["runningCount"])
	}
	if snapshot["queuedCount"] != 0 {
		t.Errorf("expected 0 queued, got %v", snapshot["queuedCount"])
	}
}

func TestScheduleRunnerHandleOverlapSkip(t *testing.T) {
	store := NewScheduleStore()
	orch := NewOrchestrator(NewScheduler(SchedulerConfig{}, nil))
	b := &mockBroadcaster{}

	runner := NewScheduleRunner(store, orch, b)

	sc := &ScheduleConfig{
		ID:            "sched-1",
		Name:          "Test Schedule",
		WorkflowID:    "wf-1",
		Cron:          "* * * * *",
		OverlapPolicy: ScheduleOverlapSkip,
		Enabled:       true,
	}

	// Simulate a running execution
	runner.mu.Lock()
	runner.runningSchedules[sc.ID] = &runningExecution{
		ScheduleID:  sc.ID,
		ExecutionID: "exec-1",
		StartedAt:   time.Now(),
	}
	runner.mu.Unlock()

	// Add schedule to store so skipCount can be updated
	store.AddSchedule(sc)

	// handleOverlap should return false (skip)
	if runner.handleOverlap(sc) {
		t.Error("expected handleOverlap to return false for skip policy with running execution")
	}

	// Verify skip count was incremented
	s := store.GetSchedule(sc.ID)
	if s.State.SkipCount != 1 {
		t.Errorf("expected skip count 1, got %d", s.State.SkipCount)
	}
}

func TestScheduleRunnerHandleOverlapAllow(t *testing.T) {
	store := NewScheduleStore()
	orch := NewOrchestrator(NewScheduler(SchedulerConfig{}, nil))
	b := &mockBroadcaster{}

	runner := NewScheduleRunner(store, orch, b)

	sc := &ScheduleConfig{
		ID:            "sched-2",
		Name:          "Allow Schedule",
		WorkflowID:    "wf-1",
		Cron:          "* * * * *",
		OverlapPolicy: ScheduleOverlapAllow,
		Enabled:       true,
	}

	// Simulate a running execution
	runner.mu.Lock()
	runner.runningSchedules[sc.ID] = &runningExecution{
		ScheduleID:  sc.ID,
		ExecutionID: "exec-1",
		StartedAt:   time.Now(),
	}
	runner.mu.Unlock()

	// handleOverlap should return true (allow concurrent)
	if !runner.handleOverlap(sc) {
		t.Error("expected handleOverlap to return true for allow policy")
	}
}

func TestScheduleRunnerHandleOverlapQueueOne(t *testing.T) {
	store := NewScheduleStore()
	orch := NewOrchestrator(NewScheduler(SchedulerConfig{}, nil))
	b := &mockBroadcaster{}

	runner := NewScheduleRunner(store, orch, b)

	sc := &ScheduleConfig{
		ID:            "sched-3",
		Name:          "Queue Schedule",
		WorkflowID:    "wf-1",
		Cron:          "* * * * *",
		Input:         map[string]any{"key": "value"},
		OverlapPolicy: ScheduleOverlapQueueOne,
		Enabled:       true,
	}

	// Simulate a running execution
	runner.mu.Lock()
	runner.runningSchedules[sc.ID] = &runningExecution{
		ScheduleID:  sc.ID,
		ExecutionID: "exec-1",
		StartedAt:   time.Now(),
	}
	runner.mu.Unlock()

	// First overlap should queue
	if runner.handleOverlap(sc) {
		t.Error("expected handleOverlap to return false (queue) for first overlap")
	}

	runner.mu.Lock()
	if len(runner.queuedExecutions[sc.ID]) != 1 {
		t.Errorf("expected 1 queued execution, got %d", len(runner.queuedExecutions[sc.ID]))
	}
	runner.mu.Unlock()

	// Second overlap should not queue again (only one buffered)
	if runner.handleOverlap(sc) {
		t.Error("expected handleOverlap to return false (already queued)")
	}

	runner.mu.Lock()
	if len(runner.queuedExecutions[sc.ID]) != 1 {
		t.Errorf("expected still 1 queued execution, got %d", len(runner.queuedExecutions[sc.ID]))
	}
	runner.mu.Unlock()
}

func TestScheduleStoreScheduleCRUD(t *testing.T) {
	store := NewScheduleStore()

	// Add a schedule
	sc := &ScheduleConfig{
		ID:         "sched-crud",
		Name:       "CRUD Test",
		WorkflowID: "wf-crud",
		Cron:       "*/5 * * * *",
		Enabled:    true,
		Input:      map[string]any{"test": true},
	}

	if err := store.AddSchedule(sc); err != nil {
		t.Fatalf("AddSchedule failed: %v", err)
	}

	// Get should return a copy
	got := store.GetSchedule("sched-crud")
	if got == nil {
		t.Fatal("GetSchedule returned nil")
	}
	if got.Name != "CRUD Test" {
		t.Errorf("expected name 'CRUD Test', got %q", got.Name)
	}
	if got.Input["test"] != true {
		t.Error("expected input test=true")
	}

	// Modifying the copy should not affect the original
	got.Input["test"] = false
	got2 := store.GetSchedule("sched-crud")
	if got2.Input["test"] != true {
		t.Error("store copy was affected by external modification")
	}

	// List
	list := store.ListSchedules()
	if len(list) != 1 {
		t.Fatalf("expected 1 schedule, got %d", len(list))
	}

	// Enable/Disable
	if !store.EnableSchedule("sched-crud", false) {
		t.Error("EnableSchedule should return true")
	}
	got3 := store.GetSchedule("sched-crud")
	if got3.Enabled {
		t.Error("expected schedule to be disabled")
	}

	// Remove
	if !store.RemoveSchedule("sched-crud") {
		t.Error("RemoveSchedule should return true")
	}
	if store.GetSchedule("sched-crud") != nil {
		t.Error("GetSchedule should return nil after removal")
	}
}

func TestScheduleStoreValidation(t *testing.T) {
	store := NewScheduleStore()

	// Empty ID
	if err := store.AddSchedule(&ScheduleConfig{ID: "", Cron: "* * * * *"}); err == nil {
		t.Error("expected error for empty ID")
	}

	// Empty cron
	if err := store.AddSchedule(&ScheduleConfig{ID: "test", Cron: ""}); err == nil {
		t.Error("expected error for empty cron")
	}

	// Remove non-existent
	if store.RemoveSchedule("nonexistent") {
		t.Error("RemoveSchedule should return false for non-existent")
	}

	// Get non-existent
	if store.GetSchedule("nonexistent") != nil {
		t.Error("GetSchedule should return nil for non-existent")
	}
}

func TestScheduleStoreEnableNonExistent(t *testing.T) {
	store := NewScheduleStore()
	if store.EnableSchedule("nonexistent", true) {
		t.Error("EnableSchedule should return false for non-existent")
	}
}

func TestScheduleStoreExecuteCallback(t *testing.T) {
	store := NewScheduleStore()

	var calledScheduleID string
	var calledInput map[string]any

	store.SetExecuteCallback(func(scheduleID string, input map[string]any) {
		calledScheduleID = scheduleID
		calledInput = input
	})

	// Trigger the callback
	store.mu.RLock()
	cb := store.onExecute
	store.mu.RUnlock()

	if cb != nil {
		cb("sched-1", map[string]any{"key": "val"})
	}

	if calledScheduleID != "sched-1" {
		t.Errorf("expected schedule ID sched-1, got %q", calledScheduleID)
	}
	if calledInput["key"] != "val" {
		t.Error("expected callback to receive input")
	}
}

func TestScheduleOverlapPolicyConstants(t *testing.T) {
	policies := []ScheduleOverlapPolicy{
		ScheduleOverlapSkip,
		ScheduleOverlapAllow,
		ScheduleOverlapQueueOne,
	}
	expected := []string{"skip", "allow", "queue_one"}

	for i, p := range policies {
		if string(p) != expected[i] {
			t.Errorf("expected %q, got %q", expected[i], p)
		}
	}
}

func TestScheduleRunnerExecuteWithRetry(t *testing.T) {
	store := NewScheduleStore()
	orch := NewOrchestrator(NewScheduler(SchedulerConfig{}, nil))
	b := &mockBroadcaster{}

	runner := NewScheduleRunner(store, orch, b)

	// Add a schedule pointing to a non-existent workflow
	// (execution will fail but should be handled gracefully)
	sc := &ScheduleConfig{
		ID:         "sched-retry",
		Name:       "Retry Test",
		WorkflowID: "nonexistent-wf",
		Cron:       "* * * * *",
		Enabled:    true,
		MaxRetries: 1,
		RetryDelay: 10 * time.Millisecond,
	}
	store.AddSchedule(sc)

	// Execute with short timeout to fail fast
	start := time.Now()
	runner.executeSchedule(sc, map[string]any{})
	elapsed := time.Since(start)

	// Should complete (even though it fails) within a reasonable time
	if elapsed > 10*time.Second {
		t.Errorf("executeSchedule took too long: %v", elapsed)
	}

	// Verify schedule state was updated
	updated := store.GetSchedule("sched-retry")
	if updated.State.RunCount != 1 {
		t.Errorf("expected run count 1, got %d", updated.State.RunCount)
	}
	if updated.State.LastResult != "failed" {
		t.Errorf("expected last result 'failed', got %q", updated.State.LastResult)
	}
	if updated.State.LastError == "" {
		t.Error("expected non-empty last error")
	}
	if updated.State.LastRun.IsZero() {
		t.Error("expected non-zero last run time")
	}
}

func TestScheduleRunnerBroadcastOnExecute(t *testing.T) {
	store := NewScheduleStore()
	orch := NewOrchestrator(NewScheduler(SchedulerConfig{}, nil))
	b := &mockBroadcaster{}

	runner := NewScheduleRunner(store, orch, b)

	sc := &ScheduleConfig{
		ID:         "sched-bcast",
		Name:       "Broadcast Test",
		WorkflowID: "nonexistent-wf",
		Cron:       "* * * * *",
		Enabled:    true,
		MaxRetries: 0,
		RetryDelay: 0,
	}
	store.AddSchedule(sc)

	runner.executeSchedule(sc, map[string]any{})

	events := b.getEvents()
	if len(events) < 2 {
		t.Fatalf("expected at least 2 events, got %d", len(events))
	}

	// First event should be schedule_execution_started
	if events[0]["type"] != "schedule_execution_started" {
		t.Errorf("expected first event type 'schedule_execution_started', got %q", events[0]["type"])
	}

	// Last event should be schedule_execution_completed
	lastEvent := events[len(events)-1]
	if lastEvent["type"] != "schedule_execution_completed" {
		t.Errorf("expected last event type 'schedule_execution_completed', got %q", lastEvent["type"])
	}
}

func TestScheduleRunnerCheckAndExecuteWithDisabledSchedule(t *testing.T) {
	store := NewScheduleStore()
	orch := NewOrchestrator(NewScheduler(SchedulerConfig{}, nil))
	b := &mockBroadcaster{}

	runner := NewScheduleRunner(store, orch, b)

	// Add a disabled schedule
	sc := &ScheduleConfig{
		ID:         "sched-disabled",
		Name:       "Disabled",
		WorkflowID: "wf-1",
		Cron:       "* * * * *",
		Enabled:    false,
	}
	store.AddSchedule(sc)

	// checkAndExecute should not execute disabled schedules
	runner.checkAndExecute()

	if b.eventCount() != 0 {
		t.Errorf("expected 0 events for disabled schedule, got %d", b.eventCount())
	}
}

func TestScheduleRunnerCheckAndExecuteWithInvalidCron(t *testing.T) {
	store := NewScheduleStore()
	orch := NewOrchestrator(NewScheduler(SchedulerConfig{}, nil))
	b := &mockBroadcaster{}

	runner := NewScheduleRunner(store, orch, b)

	sc := &ScheduleConfig{
		ID:         "sched-invalid",
		Name:       "Invalid Cron",
		WorkflowID: "wf-1",
		Cron:       "invalid cron expr",
		Enabled:    true,
	}
	store.AddSchedule(sc)

	// checkAndExecute should handle invalid cron gracefully
	runner.checkAndExecute()

	if b.eventCount() != 0 {
		t.Errorf("expected 0 events for invalid cron, got %d", b.eventCount())
	}
}

func TestScheduleRunnerContextCancellation(t *testing.T) {
	store := NewScheduleStore()
	orch := NewOrchestrator(NewScheduler(SchedulerConfig{}, nil))
	b := &mockBroadcaster{}

	runner := NewScheduleRunner(store, orch, b)

	if err := runner.Start(); err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	// Stop should complete quickly (no hanging goroutines)
	done := make(chan struct{})
	go func() {
		_ = runner.Stop()
		close(done)
	}()

	select {
	case <-done:
		// Good
	case <-time.After(5 * time.Second):
		t.Fatal("Stop did not complete in time")
	}
}
