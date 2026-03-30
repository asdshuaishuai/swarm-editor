// Package swarm provides multi-stage timeout policies for task execution.
// Inspired by Temporal's timeout hierarchy: ScheduleToStart, StartToClose, Heartbeat.
package swarm

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"
)

// TimeoutPolicy defines multiple timeout stages for task execution.
// This follows Temporal's timeout model:
// - ScheduleToStart: Time from task creation to execution start
// - StartToClose: Time from execution start to completion
// - Heartbeat: Maximum interval between heartbeats (for long-running tasks)
type TimeoutPolicy struct {
	// ScheduleToStart is the maximum time a task can wait before being picked up.
	// If the task is not started within this duration, it times out.
	ScheduleToStart time.Duration `json:"scheduleToStart"`

	// StartToClose is the maximum time from task execution start to completion.
	// This is the overall execution timeout.
	StartToClose time.Duration `json:"startToClose"`

	// Heartbeat is the maximum interval between heartbeat signals.
	// If no heartbeat is received within this duration, the task is considered stuck.
	Heartbeat time.Duration `json:"heartbeat"`

	// HeartbeatTimeout is the grace period after a missed heartbeat before timeout.
	// This provides resilience against transient network issues.
	HeartbeatTimeout time.Duration `json:"heartbeatTimeout"`
}

// DefaultTimeoutPolicy returns sensible defaults for most tasks.
func DefaultTimeoutPolicy() TimeoutPolicy {
	return TimeoutPolicy{
		ScheduleToStart:  5 * time.Minute,
		StartToClose:     30 * time.Minute,
		Heartbeat:        30 * time.Second,
		HeartbeatTimeout: 10 * time.Second,
	}
}

// TimeoutStage indicates which timeout was exceeded.
type TimeoutStage int

const (
	TimeoutStageNone TimeoutStage = iota
	TimeoutStageScheduleToStart
	TimeoutStageStartToClose
	TimeoutStageHeartbeat
)

func (s TimeoutStage) String() string {
	switch s {
	case TimeoutStageScheduleToStart:
		return "ScheduleToStart"
	case TimeoutStageStartToClose:
		return "StartToClose"
	case TimeoutStageHeartbeat:
		return "Heartbeat"
	default:
		return "None"
	}
}

// TimeoutError represents a timeout at a specific stage.
type TimeoutError struct {
	Stage    TimeoutStage
	Duration time.Duration
	Elapsed  time.Duration
	TaskID   string
	AgentID  string
}

func (e *TimeoutError) Error() string {
	return fmt.Sprintf("timeout at stage %s: elapsed %v exceeds limit %v (task=%s, agent=%s)",
		e.Stage, e.Elapsed, e.Duration, e.TaskID, e.AgentID)
}

// TimeoutManager tracks and enforces timeout policies for running tasks.
type TimeoutManager struct {
	mu        sync.RWMutex
	policy    TimeoutPolicy
	trackers  map[string]*TimeoutTracker // taskID -> tracker
	onTimeout func(taskID string, stage TimeoutStage)
}

// TimeoutTracker tracks timing for a single task.
type TimeoutTracker struct {
	TaskID        string
	AgentID       string
	Policy        TimeoutPolicy
	CreatedAt     time.Time
	StartedAt     atomic.Value // time.Time
	LastHeartbeat atomic.Value // time.Time
	Completed     atomic.Bool
	cancelFunc    context.CancelFunc
	ctx           context.Context // Task context for goroutine cleanup
}

// NewTimeoutManager creates a new timeout manager with the given policy.
func NewTimeoutManager(policy TimeoutPolicy) *TimeoutManager {
	return &TimeoutManager{
		policy:   policy,
		trackers: make(map[string]*TimeoutTracker),
	}
}

// OnTimeout sets the callback for timeout events.
func (m *TimeoutManager) OnTimeout(fn func(taskID string, stage TimeoutStage)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onTimeout = fn
}

// StartTracking begins tracking timeouts for a task.
// Returns a context that will be cancelled when any timeout is exceeded.
func (m *TimeoutManager) StartTracking(ctx context.Context, taskID, agentID string) (context.Context, *TimeoutTracker) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Create cancellable context
	childCtx, cancel := context.WithCancel(ctx)

	tracker := &TimeoutTracker{
		TaskID:     taskID,
		AgentID:    agentID,
		Policy:     m.policy,
		CreatedAt:  time.Now(),
		cancelFunc: cancel,
		ctx:        childCtx,
	}
	tracker.LastHeartbeat.Store(time.Now())

	m.trackers[taskID] = tracker

	// Start ScheduleToStart timeout monitor
	go m.monitorScheduleToStart(childCtx, tracker)

	return childCtx, tracker
}

// MarkStarted marks a task as started (picked up by an agent).
func (m *TimeoutManager) MarkStarted(taskID string) {
	m.mu.RLock()
	tracker, ok := m.trackers[taskID]
	m.mu.RUnlock()

	if !ok {
		return
	}

	now := time.Now()
	tracker.StartedAt.Store(now)
	tracker.LastHeartbeat.Store(now)

	// Start StartToClose and Heartbeat monitors
	go m.monitorStartToClose(tracker.ctx, tracker)
	go m.monitorHeartbeat(tracker.ctx, tracker)
}

// RecordHeartbeat records a heartbeat for a running task.
func (m *TimeoutManager) RecordHeartbeat(taskID string) {
	m.mu.RLock()
	tracker, ok := m.trackers[taskID]
	m.mu.RUnlock()

	if !ok {
		return
	}

	tracker.LastHeartbeat.Store(time.Now())
}

// CompleteTracking stops tracking a task and cleans up.
func (m *TimeoutManager) CompleteTracking(taskID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if tracker, ok := m.trackers[taskID]; ok {
		tracker.Completed.Store(true)
		if tracker.cancelFunc != nil {
			tracker.cancelFunc()
		}
		delete(m.trackers, taskID)
	}
}

// GetTracker returns a safe copy of the tracker for a task, or nil if not tracked.
// The returned copy does not expose cancelFunc or ctx to prevent caller interference.
func (m *TimeoutManager) GetTracker(taskID string) *TimeoutTracker {
	m.mu.RLock()
	defer m.mu.RUnlock()
	t := m.trackers[taskID]
	if t == nil {
		return nil
	}
	// Return a copy without internal fields
	return &TimeoutTracker{
		TaskID:    t.TaskID,
		AgentID:   t.AgentID,
		Policy:    t.Policy,
		CreatedAt: t.CreatedAt,
		// StartedAt, LastHeartbeat, Completed are atomic — safe to read from copy
	}
}

// GetElapsedTime returns elapsed time for each stage.
func (t *TimeoutTracker) GetElapsedTime() (scheduleToStart, startToClose time.Duration) {
	now := time.Now()
	scheduleToStart = now.Sub(t.CreatedAt)

	if startedAt := t.StartedAt.Load(); startedAt != nil {
		if st, ok := startedAt.(time.Time); ok {
			startToClose = now.Sub(st)
		}
	}

	return scheduleToStart, startToClose
}

// GetTimeUntilTimeout returns time remaining until each timeout.
// Returns 0 if the timeout has already exceeded.
func (t *TimeoutTracker) GetTimeUntilTimeout() (scheduleToStart, startToClose, heartbeat time.Duration) {
	elapsedSchedule, elapsedStart := t.GetElapsedTime()

	// ScheduleToStart remaining
	if t.Policy.ScheduleToStart > 0 {
		scheduleToStart = t.Policy.ScheduleToStart - elapsedSchedule
		if scheduleToStart < 0 {
			scheduleToStart = 0
		}
	} else {
		scheduleToStart = -1 // Not configured
	}

	// StartToClose remaining
	if t.Policy.StartToClose > 0 {
		startToClose = t.Policy.StartToClose - elapsedStart
		if startToClose < 0 {
			startToClose = 0
		}
	} else {
		startToClose = -1 // Not configured
	}

	// Heartbeat remaining
	if t.Policy.Heartbeat > 0 {
		lastHB := t.LastHeartbeat.Load()
		if lastHB != nil {
			if hb, ok := lastHB.(time.Time); ok {
				elapsedSinceHB := time.Since(hb)
				heartbeat = t.Policy.Heartbeat - elapsedSinceHB
				if heartbeat < 0 {
					heartbeat = 0
				}
			}
		}
	} else {
		heartbeat = -1 // Not configured
	}

	return scheduleToStart, startToClose, heartbeat
}

func (m *TimeoutManager) monitorScheduleToStart(ctx context.Context, tracker *TimeoutTracker) {
	if m.policy.ScheduleToStart <= 0 {
		return
	}

	timer := time.NewTimer(m.policy.ScheduleToStart)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return
	case <-timer.C:
		// Check if already started
		if tracker.StartedAt.Load() != nil {
			return
		}

		if tracker.Completed.Load() {
			return
		}

		// ScheduleToStart timeout exceeded
		m.fireTimeout(tracker, TimeoutStageScheduleToStart)
	}
}

func (m *TimeoutManager) monitorStartToClose(ctx context.Context, tracker *TimeoutTracker) {
	if m.policy.StartToClose <= 0 {
		return
	}

	// Wait until started or context cancelled
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	for {
		if tracker.StartedAt.Load() != nil {
			break
		}
		if tracker.Completed.Load() {
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}

	timer := time.NewTimer(m.policy.StartToClose)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return
	case <-timer.C:
	}

	if tracker.Completed.Load() {
		return
	}

	// StartToClose timeout exceeded
	m.fireTimeout(tracker, TimeoutStageStartToClose)
}

func (m *TimeoutManager) monitorHeartbeat(ctx context.Context, tracker *TimeoutTracker) {
	if m.policy.Heartbeat <= 0 {
		return
	}

	// Wait until started or context cancelled
	pollTicker := time.NewTicker(10 * time.Millisecond)
	defer pollTicker.Stop()
	for {
		if tracker.StartedAt.Load() != nil {
			break
		}
		if tracker.Completed.Load() {
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-pollTicker.C:
		}
	}

	// Check heartbeat at regular intervals
	ticker := time.NewTicker(m.policy.Heartbeat / 2)
	defer ticker.Stop()

	gracePeriod := m.policy.Heartbeat + m.policy.HeartbeatTimeout

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if tracker.Completed.Load() {
				return
			}

			lastHB := tracker.LastHeartbeat.Load()
			if lastHB == nil {
				continue
			}

			if hb, ok := lastHB.(time.Time); ok {
				if time.Since(hb) > gracePeriod {
					// Heartbeat timeout exceeded
					m.fireTimeout(tracker, TimeoutStageHeartbeat)
					return
				}
			}
		}
	}
}

func (m *TimeoutManager) fireTimeout(tracker *TimeoutTracker, stage TimeoutStage) {
	// Cancel the context
	if tracker.cancelFunc != nil {
		tracker.cancelFunc()
	}

	// Fire callback
	m.mu.RLock()
	onTimeout := m.onTimeout
	m.mu.RUnlock()

	if onTimeout != nil {
		onTimeout(tracker.TaskID, stage)
	}
}

// IsTimeoutError checks if an error is a TimeoutError.
func IsTimeoutError(err error) bool {
	_, ok := err.(*TimeoutError)
	return ok
}

// GetTimeoutStage extracts the timeout stage from an error, or TimeoutStageNone.
func GetTimeoutStage(err error) TimeoutStage {
	if timeoutErr, ok := err.(*TimeoutError); ok {
		return timeoutErr.Stage
	}
	return TimeoutStageNone
}
