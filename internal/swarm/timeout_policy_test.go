package swarm

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestDefaultTimeoutPolicy(t *testing.T) {
	policy := DefaultTimeoutPolicy()

	if policy.ScheduleToStart != 5*time.Minute {
		t.Errorf("ScheduleToStart = %v, want 5m", policy.ScheduleToStart)
	}
	if policy.StartToClose != 30*time.Minute {
		t.Errorf("StartToClose = %v, want 30m", policy.StartToClose)
	}
	if policy.Heartbeat != 30*time.Second {
		t.Errorf("Heartbeat = %v, want 30s", policy.Heartbeat)
	}
}

func TestTimeoutStageString(t *testing.T) {
	tests := []struct {
		stage    TimeoutStage
		expected string
	}{
		{TimeoutStageNone, "None"},
		{TimeoutStageScheduleToStart, "ScheduleToStart"},
		{TimeoutStageStartToClose, "StartToClose"},
		{TimeoutStageHeartbeat, "Heartbeat"},
	}

	for _, tt := range tests {
		if got := tt.stage.String(); got != tt.expected {
			t.Errorf("TimeoutStage(%d).String() = %q, want %q", tt.stage, got, tt.expected)
		}
	}
}

func TestTimeoutError(t *testing.T) {
	err := &TimeoutError{
		Stage:    TimeoutStageStartToClose,
		Duration: 30 * time.Minute,
		Elapsed:  35 * time.Minute,
		TaskID:   "task-123",
		AgentID:  "agent-456",
	}

	if !IsTimeoutError(err) {
		t.Error("IsTimeoutError returned false")
	}

	stage := GetTimeoutStage(err)
	if stage != TimeoutStageStartToClose {
		t.Errorf("GetTimeoutStage = %v, want TimeoutStageStartToClose", stage)
	}

	// Check error message contains key info
	msg := err.Error()
	if msg == "" {
		t.Error("Error message is empty")
	}
}

func TestTimeoutManagerStartTracking(t *testing.T) {
	policy := TimeoutPolicy{
		ScheduleToStart: time.Minute,
		StartToClose:    5 * time.Minute,
		Heartbeat:       10 * time.Second,
	}
	mgr := NewTimeoutManager(policy)

	ctx := context.Background()
	childCtx, tracker := mgr.StartTracking(ctx, "task-1", "agent-1")

	if tracker == nil {
		t.Fatal("tracker is nil")
	}
	if tracker.TaskID != "task-1" {
		t.Errorf("TaskID = %q, want %q", tracker.TaskID, "task-1")
	}
	if tracker.AgentID != "agent-1" {
		t.Errorf("AgentID = %q, want %q", tracker.AgentID, "agent-1")
	}
	if childCtx == nil {
		t.Error("childCtx is nil")
	}

	// Clean up
	mgr.CompleteTracking("task-1")
}

func TestTimeoutManagerMarkStarted(t *testing.T) {
	policy := TimeoutPolicy{
		ScheduleToStart: time.Minute,
		StartToClose:    5 * time.Minute,
		Heartbeat:       10 * time.Second,
	}
	mgr := NewTimeoutManager(policy)

	ctx := context.Background()
	_, tracker := mgr.StartTracking(ctx, "task-1", "agent-1")

	// Before started
	if tracker.StartedAt.Load() != nil {
		t.Error("StartedAt should be nil before MarkStarted")
	}

	// Mark started
	mgr.MarkStarted("task-1")

	// After started
	if tracker.StartedAt.Load() == nil {
		t.Error("StartedAt should be set after MarkStarted")
	}

	mgr.CompleteTracking("task-1")
}

func TestTimeoutManagerRecordHeartbeat(t *testing.T) {
	policy := TimeoutPolicy{
		Heartbeat: time.Second,
	}
	mgr := NewTimeoutManager(policy)

	ctx := context.Background()
	_, tracker := mgr.StartTracking(ctx, "task-1", "agent-1")
	mgr.MarkStarted("task-1")

	initialHB := tracker.LastHeartbeat.Load()
	if initialHB == nil {
		t.Fatal("LastHeartbeat is nil")
	}

	time.Sleep(10 * time.Millisecond)

	mgr.RecordHeartbeat("task-1")

	newHB := tracker.LastHeartbeat.Load()
	if newHB == nil {
		t.Fatal("LastHeartbeat is nil after RecordHeartbeat")
	}

	if hb, ok := newHB.(time.Time); ok {
		if initial, ok := initialHB.(time.Time); ok {
			if !hb.After(initial) {
				t.Error("LastHeartbeat should be updated after RecordHeartbeat")
			}
		}
	}

	mgr.CompleteTracking("task-1")
}

func TestTimeoutManagerGetTracker(t *testing.T) {
	policy := DefaultTimeoutPolicy()
	mgr := NewTimeoutManager(policy)

	ctx := context.Background()
	mgr.StartTracking(ctx, "task-1", "agent-1")

	tracker := mgr.GetTracker("task-1")
	if tracker == nil {
		t.Error("GetTracker returned nil for tracked task")
	}

	tracker = mgr.GetTracker("nonexistent")
	if tracker != nil {
		t.Error("GetTracker should return nil for untracked task")
	}

	mgr.CompleteTracking("task-1")
}

func TestTimeoutTrackerGetElapsedTime(t *testing.T) {
	policy := DefaultTimeoutPolicy()
	tracker := &TimeoutTracker{
		TaskID:    "task-1",
		Policy:    policy,
		CreatedAt: time.Now().Add(-30 * time.Second),
	}
	tracker.StartedAt.Store(time.Now().Add(-20 * time.Second))

	scheduleToStart, startToClose := tracker.GetElapsedTime()

	// Allow 100ms tolerance
	if scheduleToStart < 29*time.Second || scheduleToStart > 31*time.Second {
		t.Errorf("scheduleToStart = %v, expected ~30s", scheduleToStart)
	}
	if startToClose < 19*time.Second || startToClose > 21*time.Second {
		t.Errorf("startToClose = %v, expected ~20s", startToClose)
	}
}

func TestTimeoutTrackerGetTimeUntilTimeout(t *testing.T) {
	policy := TimeoutPolicy{
		ScheduleToStart: 1 * time.Minute,
		StartToClose:    5 * time.Minute,
		Heartbeat:       30 * time.Second,
	}
	tracker := &TimeoutTracker{
		TaskID:    "task-1",
		Policy:    policy,
		CreatedAt: time.Now().Add(-10 * time.Second),
	}
	tracker.StartedAt.Store(time.Now().Add(-5 * time.Second))
	tracker.LastHeartbeat.Store(time.Now().Add(-5 * time.Second))

	scheduleToStart, startToClose, heartbeat := tracker.GetTimeUntilTimeout()

	// Should have remaining time
	if scheduleToStart <= 0 {
		t.Errorf("scheduleToStart = %v, expected positive", scheduleToStart)
	}
	if startToClose <= 0 {
		t.Errorf("startToClose = %v, expected positive", startToClose)
	}
	if heartbeat <= 0 {
		t.Errorf("heartbeat = %v, expected positive", heartbeat)
	}
}

func TestTimeoutManagerScheduleToStartTimeout(t *testing.T) {
	policy := TimeoutPolicy{
		ScheduleToStart: 50 * time.Millisecond,
		StartToClose:    5 * time.Minute,
		Heartbeat:       0, // Disable heartbeat monitoring
	}
	mgr := NewTimeoutManager(policy)

	var timeoutMu sync.Mutex
	var timeoutTaskID string
	var timeoutStage TimeoutStage
	mgr.OnTimeout(func(taskID string, stage TimeoutStage) {
		timeoutMu.Lock()
		defer timeoutMu.Unlock()
		timeoutTaskID = taskID
		timeoutStage = stage
	})

	ctx := context.Background()
	childCtx, _ := mgr.StartTracking(ctx, "task-1", "agent-1")

	// Wait for timeout
	time.Sleep(100 * time.Millisecond)

	timeoutMu.Lock()
	defer timeoutMu.Unlock()

	if timeoutTaskID != "task-1" {
		t.Errorf("timeoutTaskID = %q, want %q", timeoutTaskID, "task-1")
	}
	if timeoutStage != TimeoutStageScheduleToStart {
		t.Errorf("timeoutStage = %v, want TimeoutStageScheduleToStart", timeoutStage)
	}

	// Context should be cancelled
	select {
	case <-childCtx.Done():
		// Expected
	default:
		t.Error("Context should be cancelled after timeout")
	}

	mgr.CompleteTracking("task-1")
}

func TestTimeoutManagerNoTimeoutIfStarted(t *testing.T) {
	policy := TimeoutPolicy{
		ScheduleToStart: 50 * time.Millisecond,
		StartToClose:    5 * time.Minute,
		Heartbeat:       0,
	}
	mgr := NewTimeoutManager(policy)

	var timeoutCalled bool
	mgr.OnTimeout(func(taskID string, stage TimeoutStage) {
		timeoutCalled = true
	})

	ctx := context.Background()
	_, tracker := mgr.StartTracking(ctx, "task-1", "agent-1")

	// Mark started before timeout
	time.Sleep(20 * time.Millisecond)
	mgr.MarkStarted("task-1")

	// Wait past the ScheduleToStart timeout
	time.Sleep(60 * time.Millisecond)

	if timeoutCalled {
		t.Error("Timeout should not be called if task started in time")
	}

	if tracker.StartedAt.Load() == nil {
		t.Error("Task should be marked as started")
	}

	mgr.CompleteTracking("task-1")
}

func TestTimeoutManagerHeartbeatTimeout(t *testing.T) {
	policy := TimeoutPolicy{
		ScheduleToStart:  0, // Disable
		StartToClose:     0, // Disable
		Heartbeat:        30 * time.Millisecond,
		HeartbeatTimeout: 20 * time.Millisecond,
	}
	mgr := NewTimeoutManager(policy)

	var timeoutMu sync.Mutex
	var timeoutStage TimeoutStage
	mgr.OnTimeout(func(taskID string, stage TimeoutStage) {
		timeoutMu.Lock()
		defer timeoutMu.Unlock()
		timeoutStage = stage
	})

	ctx := context.Background()
	_, _ = mgr.StartTracking(ctx, "task-1", "agent-1")
	mgr.MarkStarted("task-1")

	// Wait for heartbeat timeout (30ms + 20ms grace = 50ms)
	time.Sleep(100 * time.Millisecond)

	timeoutMu.Lock()
	defer timeoutMu.Unlock()

	if timeoutStage != TimeoutStageHeartbeat {
		t.Errorf("timeoutStage = %v, want TimeoutStageHeartbeat", timeoutStage)
	}

	mgr.CompleteTracking("task-1")
}

func TestTimeoutManagerHeartbeatKeepsTaskAlive(t *testing.T) {
	policy := TimeoutPolicy{
		ScheduleToStart:  0,
		StartToClose:     0,
		Heartbeat:        30 * time.Millisecond,
		HeartbeatTimeout: 20 * time.Millisecond,
	}
	mgr := NewTimeoutManager(policy)

	var timeoutCalled bool
	mgr.OnTimeout(func(taskID string, stage TimeoutStage) {
		timeoutCalled = true
	})

	ctx := context.Background()
	_, _ = mgr.StartTracking(ctx, "task-1", "agent-1")
	mgr.MarkStarted("task-1")

	// Send heartbeats to keep alive
	for i := 0; i < 5; i++ {
		time.Sleep(20 * time.Millisecond)
		mgr.RecordHeartbeat("task-1")
	}

	// Should not have timed out
	if timeoutCalled {
		t.Error("Timeout should not be called while heartbeats are being sent")
	}

	mgr.CompleteTracking("task-1")
}

func TestTimeoutManagerCompleteTrackingCancelsContext(t *testing.T) {
	policy := TimeoutPolicy{
		ScheduleToStart: 5 * time.Minute,
	}
	mgr := NewTimeoutManager(policy)

	ctx := context.Background()
	childCtx, _ := mgr.StartTracking(ctx, "task-1", "agent-1")

	// Complete tracking
	mgr.CompleteTracking("task-1")

	// Context should be cancelled
	select {
	case <-childCtx.Done():
		// Expected
	case <-time.After(100 * time.Millisecond):
		t.Error("Context should be cancelled after CompleteTracking")
	}
}

func TestIsTimeoutError(t *testing.T) {
	timeoutErr := &TimeoutError{Stage: TimeoutStageStartToClose}
	if !IsTimeoutError(timeoutErr) {
		t.Error("IsTimeoutError should return true for TimeoutError")
	}

	regularErr := context.DeadlineExceeded
	if IsTimeoutError(regularErr) {
		t.Error("IsTimeoutError should return false for non-TimeoutError")
	}
}

func TestGetTimeoutStage(t *testing.T) {
	timeoutErr := &TimeoutError{Stage: TimeoutStageHeartbeat}
	if stage := GetTimeoutStage(timeoutErr); stage != TimeoutStageHeartbeat {
		t.Errorf("GetTimeoutStage = %v, want TimeoutStageHeartbeat", stage)
	}

	regularErr := context.DeadlineExceeded
	if stage := GetTimeoutStage(regularErr); stage != TimeoutStageNone {
		t.Errorf("GetTimeoutStage = %v, want TimeoutStageNone", stage)
	}
}

func TestMonitorStartToClose_ZeroDuration(t *testing.T) {
	// StartToClose = 0 should return immediately
	m := NewTimeoutManager(TimeoutPolicy{StartToClose: 0})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	tracker := &TimeoutTracker{
		TaskID:  "task-1",
		StartedAt: atomic.Value{},
		Completed: atomic.Bool{},
		ctx:      ctx,
	}
	tracker.StartedAt.Store(time.Now())

	done := make(chan struct{})
	go func() {
		m.monitorStartToClose(ctx, tracker)
		close(done)
	}()

	select {
	case <-done:
		// Good - returned immediately for zero duration
	case <-time.After(time.Second):
		t.Fatal("monitorStartToClose should return immediately for zero duration")
	}
}

func TestMonitorStartToClose_FiresTimeout(t *testing.T) {
	m := NewTimeoutManager(TimeoutPolicy{StartToClose: 50 * time.Millisecond})

	var mu sync.Mutex
	var firedTaskID string
	var firedStage TimeoutStage
	m.OnTimeout(func(taskID string, stage TimeoutStage) {
		mu.Lock()
		defer mu.Unlock()
		firedTaskID = taskID
		firedStage = stage
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	tracker := &TimeoutTracker{
		TaskID:  "task-fire",
		StartedAt: atomic.Value{},
		Completed: atomic.Bool{},
		ctx:      ctx,
	}
	tracker.StartedAt.Store(time.Now())

	m.monitorStartToClose(ctx, tracker)

	mu.Lock()
	if firedTaskID != "task-fire" {
		t.Errorf("expected taskID 'task-fire', got %q", firedTaskID)
	}
	if firedStage != TimeoutStageStartToClose {
		t.Errorf("expected stage %v, got %v", TimeoutStageStartToClose, firedStage)
	}
	mu.Unlock()
}

func TestMonitorStartToClose_AlreadyCompleted(t *testing.T) {
	m := NewTimeoutManager(TimeoutPolicy{StartToClose: 50 * time.Millisecond})

	var mu sync.Mutex
	fired := false
	m.OnTimeout(func(taskID string, stage TimeoutStage) {
		mu.Lock()
		defer mu.Unlock()
		fired = true
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	tracker := &TimeoutTracker{
		TaskID:  "task-done",
		StartedAt: atomic.Value{},
		Completed: atomic.Bool{},
		ctx:      ctx,
	}
	tracker.StartedAt.Store(time.Now())
	tracker.Completed.Store(true) // Already completed

	m.monitorStartToClose(ctx, tracker)

	mu.Lock()
	if fired {
		t.Error("expected no timeout to fire for already completed task")
	}
	mu.Unlock()
}

func TestMonitorStartToClose_ContextCancelled(t *testing.T) {
	m := NewTimeoutManager(TimeoutPolicy{StartToClose: 5 * time.Second})

	ctx, cancel := context.WithCancel(context.Background())

	tracker := &TimeoutTracker{
		TaskID:  "task-cancel",
		StartedAt: atomic.Value{},
		Completed: atomic.Bool{},
		ctx:      ctx,
	}
	tracker.StartedAt.Store(time.Now())

	done := make(chan struct{})
	go func() {
		m.monitorStartToClose(ctx, tracker)
		close(done)
	}()

	// Cancel context after a short delay
	time.Sleep(20 * time.Millisecond)
	cancel()

	select {
	case <-done:
		// Good - returned on context cancel
	case <-time.After(time.Second):
		t.Fatal("monitorStartToClose should return when context cancelled")
	}
}
