package swarm

import (
	"sync"
	"testing"
	"time"
)

// mockBroadcaster captures broadcast events for testing.
type mockBroadcaster struct {
	mu     sync.Mutex
	events []map[string]any
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

	// handleOverlap should return overlapSkipped (not overlapProceed)
	action := runner.handleOverlap(sc)
	if action == overlapProceed {
		t.Error("expected handleOverlap to NOT return overlapProceed for skip policy with running execution")
	}

	// Caller is responsible for updating skip count when action is overlapSkipped
	if action == overlapSkipped {
		store.mu.Lock()
		if s, ok := store.schedules[sc.ID]; ok {
			s.State.SkipCount++
		}
		store.mu.Unlock()
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

	// handleOverlap should return overlapProceed (allow concurrent)
	if runner.handleOverlap(sc) != overlapProceed {
		t.Error("expected handleOverlap to return overlapProceed for allow policy")
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

	// First overlap should queue (return overlapSkip, not overlapProceed)
	if runner.handleOverlap(sc) == overlapProceed {
		t.Error("expected handleOverlap to NOT return overlapProceed (queue) for first overlap")
	}

	runner.mu.Lock()
	if len(runner.queuedExecutions[sc.ID]) != 1 {
		t.Errorf("expected 1 queued execution, got %d", len(runner.queuedExecutions[sc.ID]))
	}
	runner.mu.Unlock()

	// Second overlap should not queue again (only one buffered)
	if runner.handleOverlap(sc) == overlapProceed {
		t.Error("expected handleOverlap to NOT return overlapProceed (already queued)")
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

func TestScheduleRunner_updateLastRun(t *testing.T) {
	store := NewScheduleStore()
	orch := NewOrchestrator(NewScheduler(SchedulerConfig{}, nil))
	runner := NewScheduleRunner(store, orch, nil)

	// Create a schedule
	sc := &ScheduleConfig{
		ID:      "schedule-1",
		Cron:    "0 * * * *",
		Enabled: true,
	}
	store.AddSchedule(sc)

	// Update last run
	now := time.Now()
	runner.updateLastRun("schedule-1", now)

	// Verify update
	retrieved := store.GetSchedule("schedule-1")
	if retrieved == nil {
		t.Fatal("schedule not found")
	}
	if retrieved.State.LastRun.IsZero() {
		t.Error("LastRun should be set")
	}
}

func TestScheduleRunner_updateLastRun_NonExistent(t *testing.T) {
	store := NewScheduleStore()
	orch := NewOrchestrator(NewScheduler(SchedulerConfig{}, nil))
	runner := NewScheduleRunner(store, orch, nil)

	// Update last run for non-existent schedule (should not panic)
	now := time.Now()
	runner.updateLastRun("non-existent", now)
}

func TestScheduleRunner_updateNextRun(t *testing.T) {
	store := NewScheduleStore()
	orch := NewOrchestrator(NewScheduler(SchedulerConfig{}, nil))
	runner := NewScheduleRunner(store, orch, nil)

	// Create a schedule
	sc := &ScheduleConfig{
		ID:      "schedule-1",
		Cron:    "0 * * * *",
		Enabled: true,
	}
	store.AddSchedule(sc)

	// Update next run
	nextTime := time.Now().Add(1 * time.Hour)
	runner.updateNextRun("schedule-1", nextTime)

	// Verify update
	retrieved := store.GetSchedule("schedule-1")
	if retrieved == nil {
		t.Fatal("schedule not found")
	}
	if retrieved.State.NextRun.IsZero() {
		t.Error("NextRun should be set")
	}
}

func TestScheduleRunner_updateNextRun_NonExistent(t *testing.T) {
	store := NewScheduleStore()
	orch := NewOrchestrator(NewScheduler(SchedulerConfig{}, nil))
	runner := NewScheduleRunner(store, orch, nil)

	// Update next run for non-existent schedule (should not panic)
	nextTime := time.Now().Add(1 * time.Hour)
	runner.updateNextRun("non-existent", nextTime)
}

// ==================== checkAndExecute Additional Tests ====================

func TestScheduleRunnerCheckAndExecute_CatchUpWindow(t *testing.T) {
	store := NewScheduleStore()
	orch := NewOrchestrator(NewScheduler(SchedulerConfig{}, nil))
	b := &mockBroadcaster{}

	runner := NewScheduleRunner(store, orch, b)

	// Create a schedule with catch-up enabled and old last run
	// The key is to set up a schedule that would NOT fire normally
	// but has catch-up enabled
	sc := &ScheduleConfig{
		ID:            "sched-catchup",
		Name:          "CatchUp Test",
		WorkflowID:    "wf-1",
		Cron:          "0 0 1 1 *", // Once per year (won't fire normally)
		Enabled:       true,
		CatchUp:       true,
		CatchUpWindow: 1 * time.Hour,
		State: ScheduleRuntimeState{
			LastRun: time.Now().Add(-3 * time.Hour), // Too old to catch up
		},
	}
	store.AddSchedule(sc)

	// checkAndExecute should update lastRun to skip past the gap
	runner.checkAndExecute()

	// Verify lastRun was updated (not zero and recent)
	retrieved := store.GetSchedule("sched-catchup")
	if retrieved == nil {
		t.Fatal("schedule not found")
	}
	// The lastRun should have been updated to something more recent
	if time.Since(retrieved.State.LastRun) > 2*time.Hour {
		t.Error("lastRun should have been updated to skip past the gap")
	}
}

func TestScheduleRunnerCheckAndExecute_ShouldFire(t *testing.T) {
	store := NewScheduleStore()
	orch := NewOrchestrator(NewScheduler(SchedulerConfig{}, nil))
	b := &mockBroadcaster{}

	runner := NewScheduleRunner(store, orch, b)

	// Create a workflow
	wf := orch.CreateWorkflow("test-wf", ModeSequential)
	wf.AddNode(&WorkflowNode{ID: "node-1", Type: "agent"})

	// Create a schedule that should fire (last run was 2 minutes ago)
	sc := &ScheduleConfig{
		ID:         "sched-fire",
		Name:       "Fire Test",
		WorkflowID: wf.ID,
		Cron:       "* * * * *", // Every minute
		Enabled:    true,
		State: ScheduleRuntimeState{
			LastRun: time.Now().Add(-2 * time.Minute),
		},
	}
	store.AddSchedule(sc)

	// checkAndExecute should trigger execution
	runner.checkAndExecute()

	// Give some time for goroutine to start
	time.Sleep(50 * time.Millisecond)

	// Verify broadcast was called
	if b.eventCount() == 0 {
		t.Error("expected execution to be triggered")
	}
}

func TestScheduleRunnerCheckAndExecute_NotYetDue(t *testing.T) {
	store := NewScheduleStore()
	orch := NewOrchestrator(NewScheduler(SchedulerConfig{}, nil))
	b := &mockBroadcaster{}

	runner := NewScheduleRunner(store, orch, b)

	// Create a schedule that should NOT fire yet (last run was just now)
	sc := &ScheduleConfig{
		ID:         "sched-notdue",
		Name:       "Not Due Test",
		WorkflowID: "wf-1",
		Cron:       "0 0 * * *", // Once per day at midnight
		Enabled:    true,
		State: ScheduleRuntimeState{
			LastRun: time.Now(),
		},
	}
	store.AddSchedule(sc)

	// checkAndExecute should not trigger execution
	runner.checkAndExecute()

	// Verify no broadcast
	if b.eventCount() != 0 {
		t.Errorf("expected no execution, got %d events", b.eventCount())
	}

	// Verify nextRun was updated
	retrieved := store.GetSchedule("sched-notdue")
	if retrieved == nil {
		t.Fatal("schedule not found")
	}
	if retrieved.State.NextRun.IsZero() {
		t.Error("nextRun should have been updated")
	}
}

func TestScheduleRunnerCheckAndExecute_ZeroLastRun(t *testing.T) {
	store := NewScheduleStore()
	orch := NewOrchestrator(NewScheduler(SchedulerConfig{}, nil))
	b := &mockBroadcaster{}

	runner := NewScheduleRunner(store, orch, b)

	// Create a schedule with zero last run
	sc := &ScheduleConfig{
		ID:         "sched-zero",
		Name:       "Zero LastRun Test",
		WorkflowID: "wf-1",
		Cron:       "* * * * *",
		Enabled:    true,
		State: ScheduleRuntimeState{
			LastRun: time.Time{}, // Zero value
		},
	}
	store.AddSchedule(sc)

	// checkAndExecute should handle zero last run
	runner.checkAndExecute()

	// No panic = success
}

func TestScheduleRunnerCheckAndExecute_NilInput(t *testing.T) {
	store := NewScheduleStore()
	orch := NewOrchestrator(NewScheduler(SchedulerConfig{}, nil))
	b := &mockBroadcaster{}

	runner := NewScheduleRunner(store, orch, b)

	// Create a workflow
	wf := orch.CreateWorkflow("test-wf", ModeSequential)
	wf.AddNode(&WorkflowNode{ID: "node-1", Type: "agent"})

	// Create a schedule with nil input
	sc := &ScheduleConfig{
		ID:         "sched-nil-input",
		Name:       "Nil Input Test",
		WorkflowID: wf.ID,
		Cron:       "* * * * *",
		Enabled:    true,
		Input:      nil, // nil input
		State: ScheduleRuntimeState{
			LastRun: time.Now().Add(-2 * time.Minute),
		},
	}
	store.AddSchedule(sc)

	// checkAndExecute should handle nil input
	runner.checkAndExecute()

	// Give some time for goroutine
	time.Sleep(50 * time.Millisecond)

	// No panic = success
}

// ==================== StatusSnapshot Additional Coverage ====================

func TestScheduleRunnerStatusSnapshot_WithRunningSchedules(t *testing.T) {
	store := NewScheduleStore()
	orch := NewOrchestrator(NewScheduler(SchedulerConfig{}, nil))
	b := &mockBroadcaster{}

	runner := NewScheduleRunner(store, orch, b)

	now := time.Now()

	// Populate runningSchedules
	runner.mu.Lock()
	runner.runningSchedules["sched-run-1"] = &runningExecution{
		ScheduleID:  "sched-run-1",
		ExecutionID: "exec-001",
		StartedAt:   now.Add(-30 * time.Second),
	}
	runner.runningSchedules["sched-run-2"] = &runningExecution{
		ScheduleID:  "sched-run-2",
		ExecutionID: "exec-002",
		StartedAt:   now.Add(-10 * time.Second),
	}
	runner.mu.Unlock()

	snapshot := runner.StatusSnapshot()

	// Verify counts
	if snapshot["status"] != string(ScheduleRunnerStopped) {
		t.Errorf("expected stopped, got %v", snapshot["status"])
	}
	if snapshot["runningCount"] != 2 {
		t.Errorf("expected runningCount 2, got %v", snapshot["runningCount"])
	}
	if snapshot["queuedCount"] != 0 {
		t.Errorf("expected queuedCount 0, got %v", snapshot["queuedCount"])
	}

	// Verify runningSchedules slice content
	runningList, ok := snapshot["runningSchedules"].([]map[string]any)
	if !ok {
		t.Fatalf("expected runningSchedules to be []map[string]any, got %T", snapshot["runningSchedules"])
	}
	if len(runningList) != 2 {
		t.Fatalf("expected 2 running schedules, got %d", len(runningList))
	}

	// Build a set of schedule IDs from the result for verification
	foundIDs := make(map[string]bool)
	for _, entry := range runningList {
		sid, ok := entry["scheduleId"].(string)
		if !ok {
			t.Errorf("expected scheduleId to be string, got %T", entry["scheduleId"])
			continue
		}
		foundIDs[sid] = true

		// Verify executionId is present
		if _, hasExecID := entry["executionId"]; !hasExecID {
			t.Errorf("missing executionId for schedule %q", sid)
		}
		// Verify startedAt is present
		if _, hasStartedAt := entry["startedAt"]; !hasStartedAt {
			t.Errorf("missing startedAt for schedule %q", sid)
		}
	}

	if !foundIDs["sched-run-1"] {
		t.Error("expected sched-run-1 in runningSchedules")
	}
	if !foundIDs["sched-run-2"] {
		t.Error("expected sched-run-2 in runningSchedules")
	}

	// Verify queuedExecutions is empty slice
	queuedList, ok := snapshot["queuedExecutions"].([]map[string]any)
	if !ok {
		t.Fatalf("expected queuedExecutions to be []map[string]any, got %T", snapshot["queuedExecutions"])
	}
	if len(queuedList) != 0 {
		t.Errorf("expected 0 queued executions, got %d", len(queuedList))
	}
}

func TestScheduleRunnerStatusSnapshot_WithQueuedExecutions(t *testing.T) {
	store := NewScheduleStore()
	orch := NewOrchestrator(NewScheduler(SchedulerConfig{}, nil))
	b := &mockBroadcaster{}

	runner := NewScheduleRunner(store, orch, b)

	now := time.Now()

	// Populate queuedExecutions for two different schedules
	runner.mu.Lock()
	runner.queuedExecutions["sched-q-1"] = []*queuedExecution{
		{ScheduleID: "sched-q-1", Input: map[string]any{"key": "val1"}, QueuedAt: now.Add(-2 * time.Minute)},
		{ScheduleID: "sched-q-1", Input: map[string]any{"key": "val2"}, QueuedAt: now.Add(-1 * time.Minute)},
	}
	runner.queuedExecutions["sched-q-2"] = []*queuedExecution{
		{ScheduleID: "sched-q-2", Input: nil, QueuedAt: now.Add(-30 * time.Second)},
	}
	runner.mu.Unlock()

	snapshot := runner.StatusSnapshot()

	// Verify counts
	if snapshot["runningCount"] != 0 {
		t.Errorf("expected runningCount 0, got %v", snapshot["runningCount"])
	}
	if snapshot["queuedCount"] != 3 {
		t.Errorf("expected queuedCount 3, got %v", snapshot["queuedCount"])
	}

	// Verify queuedExecutions slice content
	queuedList, ok := snapshot["queuedExecutions"].([]map[string]any)
	if !ok {
		t.Fatalf("expected queuedExecutions to be []map[string]any, got %T", snapshot["queuedExecutions"])
	}
	if len(queuedList) != 3 {
		t.Fatalf("expected 3 queued executions, got %d", len(queuedList))
	}

	// Count per schedule
	countBySchedule := make(map[string]int)
	for _, entry := range queuedList {
		sid, ok := entry["scheduleId"].(string)
		if !ok {
			t.Errorf("expected scheduleId to be string, got %T", entry["scheduleId"])
			continue
		}
		countBySchedule[sid]++

		// Verify queuedAt is present
		if _, hasQueuedAt := entry["queuedAt"]; !hasQueuedAt {
			t.Errorf("missing queuedAt for schedule %q", sid)
		}
	}

	if countBySchedule["sched-q-1"] != 2 {
		t.Errorf("expected 2 queued for sched-q-1, got %d", countBySchedule["sched-q-1"])
	}
	if countBySchedule["sched-q-2"] != 1 {
		t.Errorf("expected 1 queued for sched-q-2, got %d", countBySchedule["sched-q-2"])
	}

	// Verify runningSchedules is empty slice
	runningList, ok := snapshot["runningSchedules"].([]map[string]any)
	if !ok {
		t.Fatalf("expected runningSchedules to be []map[string]any, got %T", snapshot["runningSchedules"])
	}
	if len(runningList) != 0 {
		t.Errorf("expected 0 running schedules, got %d", len(runningList))
	}
}

func TestScheduleRunnerStatusSnapshot_WithBoth(t *testing.T) {
	store := NewScheduleStore()
	orch := NewOrchestrator(NewScheduler(SchedulerConfig{}, nil))
	b := &mockBroadcaster{}

	runner := NewScheduleRunner(store, orch, b)

	now := time.Now()

	// Populate both runningSchedules and queuedExecutions
	runner.mu.Lock()
	runner.runningSchedules["sched-both-1"] = &runningExecution{
		ScheduleID:  "sched-both-1",
		ExecutionID: "exec-b1",
		StartedAt:   now.Add(-15 * time.Second),
	}
	runner.queuedExecutions["sched-both-1"] = []*queuedExecution{
		{ScheduleID: "sched-both-1", Input: map[string]any{"x": 1}, QueuedAt: now.Add(-5 * time.Second)},
	}
	runner.queuedExecutions["sched-both-2"] = []*queuedExecution{
		{ScheduleID: "sched-both-2", Input: map[string]any{"y": 2}, QueuedAt: now},
	}
	runner.mu.Unlock()

	snapshot := runner.StatusSnapshot()

	// Verify combined counts
	if snapshot["runningCount"] != 1 {
		t.Errorf("expected runningCount 1, got %v", snapshot["runningCount"])
	}
	if snapshot["queuedCount"] != 2 {
		t.Errorf("expected queuedCount 2, got %v", snapshot["queuedCount"])
	}

	// Verify running
	runningList, ok := snapshot["runningSchedules"].([]map[string]any)
	if !ok {
		t.Fatalf("expected runningSchedules to be []map[string]any, got %T", snapshot["runningSchedules"])
	}
	if len(runningList) != 1 {
		t.Fatalf("expected 1 running schedule, got %d", len(runningList))
	}
	if runningList[0]["scheduleId"] != "sched-both-1" {
		t.Errorf("expected scheduleId sched-both-1, got %v", runningList[0]["scheduleId"])
	}
	if runningList[0]["executionId"] != "exec-b1" {
		t.Errorf("expected executionId exec-b1, got %v", runningList[0]["executionId"])
	}

	// Verify queued
	queuedList, ok := snapshot["queuedExecutions"].([]map[string]any)
	if !ok {
		t.Fatalf("expected queuedExecutions to be []map[string]any, got %T", snapshot["queuedExecutions"])
	}
	if len(queuedList) != 2 {
		t.Fatalf("expected 2 queued executions, got %d", len(queuedList))
	}

	// Verify return map has all expected top-level keys
	expectedKeys := []string{"status", "runningCount", "queuedCount", "runningSchedules", "queuedExecutions"}
	for _, key := range expectedKeys {
		if _, exists := snapshot[key]; !exists {
			t.Errorf("missing key %q in snapshot", key)
		}
	}
}
