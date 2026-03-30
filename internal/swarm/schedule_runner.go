// Package swarm implements cron-based scheduled workflow execution.
// Inspired by Temporal Schedules API and Prefect 3 Scheduled Workflows.
package swarm

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	cronlib "github.com/robfig/cron/v3"
)

const (
	// scheduleCheckInterval is the default ticker interval for checking schedules.
	// 1 minute granularity matches typical cron minimum resolution.
	scheduleCheckInterval = 1 * time.Minute

	// defaultCatchUpWindow is the default max age for catch-up runs.
	defaultCatchUpWindow = 1 * time.Hour

	// maxScheduleRetries is the default max retries per scheduled execution.
	maxScheduleRetries = 3

	// defaultScheduleRetryDelay is the default delay between retries.
	defaultScheduleRetryDelay = 5 * time.Second
)

// ScheduleRunnerStatus represents the operational state of the runner.
type ScheduleRunnerStatus string

const (
	ScheduleRunnerStopped ScheduleRunnerStatus = "stopped"
	ScheduleRunnerRunning ScheduleRunnerStatus = "running"
	ScheduleRunnerStopping ScheduleRunnerStatus = "stopping"
)

// runningExecution tracks a currently executing scheduled workflow.
type runningExecution struct {
	ScheduleID  string
	ExecutionID string
	StartedAt   time.Time
}

// queuedExecution represents a buffered run waiting for the current execution to complete.
type queuedExecution struct {
	ScheduleID string
	Input      map[string]any
	QueuedAt   time.Time
}

// ScheduleRunner evaluates cron expressions and triggers workflow executions.
// It supports overlap policies (skip/allow/queue_one), catch-up for missed schedules,
// retry on failure, and timezone-aware cron evaluation.
//
// Thread-safe: all public methods are safe for concurrent use.
type ScheduleRunner struct {
	mu               sync.RWMutex
	store            *ScheduleStore
	orchestrator     *Orchestrator
	broadcaster      EventBroadcaster
	ticker           *time.Ticker
	stopCh           chan struct{}
	wg               sync.WaitGroup
	status           ScheduleRunnerStatus
	runningSchedules map[string]*runningExecution // scheduleID -> running
	queuedExecutions map[string][]*queuedExecution // scheduleID -> queue
}

// NewScheduleRunner creates a new schedule runner.
func NewScheduleRunner(store *ScheduleStore, orchestrator *Orchestrator, broadcaster EventBroadcaster) *ScheduleRunner {
	return &ScheduleRunner{
		store:            store,
		orchestrator:     orchestrator,
		broadcaster:      broadcaster,
		status:           ScheduleRunnerStopped,
		runningSchedules: make(map[string]*runningExecution),
		queuedExecutions: make(map[string][]*queuedExecution),
	}
}

// Start begins the schedule evaluation loop.
// The runner checks all enabled schedules every minute.
func (r *ScheduleRunner) Start() error {
	r.mu.Lock()
	if r.status == ScheduleRunnerRunning {
		r.mu.Unlock()
		return fmt.Errorf("schedule runner is already running")
	}
	r.status = ScheduleRunnerRunning
	r.stopCh = make(chan struct{})
	r.ticker = time.NewTicker(scheduleCheckInterval)
	r.mu.Unlock()

	log.Printf("[ScheduleRunner] Started (check interval: %v)", scheduleCheckInterval)

	r.wg.Add(1)
	go r.runLoop()

	return nil
}

// Stop gracefully shuts down the schedule runner.
// It waits for in-flight executions to complete.
func (r *ScheduleRunner) Stop() error {
	r.mu.Lock()
	if r.status != ScheduleRunnerRunning {
		r.mu.Unlock()
		return fmt.Errorf("schedule runner is not running")
	}
	r.status = ScheduleRunnerStopping
	if r.ticker != nil {
		r.ticker.Stop()
	}
	if r.stopCh != nil {
		close(r.stopCh)
	}
	r.mu.Unlock()

	// Wait for the main loop goroutine to finish
	r.wg.Wait()

	r.mu.Lock()
	r.status = ScheduleRunnerStopped
	r.mu.Unlock()

	log.Printf("[ScheduleRunner] Stopped")
	return nil
}

// Status returns the current status of the runner.
func (r *ScheduleRunner) Status() ScheduleRunnerStatus {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.status
}

// GetRunningCount returns the number of currently executing scheduled workflows.
func (r *ScheduleRunner) GetRunningCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.runningSchedules)
}

// GetQueuedCount returns the total number of queued executions across all schedules.
func (r *ScheduleRunner) GetQueuedCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	count := 0
	for _, q := range r.queuedExecutions {
		count += len(q)
	}
	return count
}

// StatusSnapshot returns a map with the runner's full status for WebSocket responses.
func (r *ScheduleRunner) StatusSnapshot() map[string]any {
	r.mu.RLock()
	defer r.mu.RUnlock()

	running := make([]map[string]any, 0, len(r.runningSchedules))
	for sid, re := range r.runningSchedules {
		running = append(running, map[string]any{
			"scheduleId":  sid,
			"executionId": re.ExecutionID,
			"startedAt":   re.StartedAt,
		})
	}

	queued := make([]map[string]any, 0)
	for sid, q := range r.queuedExecutions {
		for _, qe := range q {
			queued = append(queued, map[string]any{
				"scheduleId": sid,
				"queuedAt":   qe.QueuedAt,
			})
		}
	}

	return map[string]any{
		"status":          string(r.status),
		"runningCount":    len(r.runningSchedules),
		"queuedCount":     r.GetQueuedCount(),
		"runningSchedules": running,
		"queuedExecutions": queued,
	}
}

// runLoop is the main ticker-driven evaluation loop.
func (r *ScheduleRunner) runLoop() {
	defer r.wg.Done()

	for {
		select {
		case <-r.ticker.C:
			r.checkAndExecute()
		case <-r.stopCh:
			return
		}
	}
}

// checkAndExecute evaluates all enabled schedules and triggers executions that are due.
func (r *ScheduleRunner) checkAndExecute() {
	now := time.Now()
	schedules := r.store.ListSchedules()

	for _, sc := range schedules {
		if !sc.Enabled {
			continue
		}

		// Parse cron expression with optional timezone
		parser := cronlib.NewParser(cronlib.Minute | cronlib.Hour | cronlib.Dom | cronlib.Month | cronlib.Dow)
		schedule, err := parser.Parse(sc.Cron)
		if err != nil {
			log.Printf("[ScheduleRunner] Invalid cron expression for schedule %q: %v", sc.ID, err)
			continue
		}

		// Calculate next scheduled time
		nextRun := schedule.Next(sc.State.LastRun)
		if nextRun.IsZero() {
			continue
		}

		// Check if this schedule should fire now
		shouldFire := false

		if nextRun.Before(now) || nextRun.Equal(now) {
			shouldFire = true
		}

		// Check catch-up: if catchUp is enabled and we missed runs
		if !shouldFire && sc.CatchUp {
			catchUpWindow := sc.CatchUpWindow
			if catchUpWindow == 0 {
				catchUpWindow = defaultCatchUpWindow
			}
			// Check if the last expected run was within the catch-up window
			if !sc.State.LastRun.IsZero() && now.Sub(sc.State.LastRun) > catchUpWindow {
				// Too old to catch up, just update lastRun to skip past the gap
				r.updateLastRun(sc.ID, now)
				continue
			}
		}

		if !shouldFire {
			// Update next run time for status reporting
			r.updateNextRun(sc.ID, nextRun)
			continue
		}

		// Handle overlap policy
		if !r.handleOverlap(sc) {
			// Execution was skipped or queued
			continue
		}

		// Execute the schedule
		input := deepCopyAny(sc.Input).(map[string]any)
		if input == nil {
			input = make(map[string]any)
		}
		go r.executeSchedule(sc, input)
	}
}

// handleOverlap checks if a new execution can proceed based on the overlap policy.
// Returns true if execution should proceed, false if skipped or queued.
func (r *ScheduleRunner) handleOverlap(sc *ScheduleConfig) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	policy := sc.OverlapPolicy
	if policy == "" {
		policy = ScheduleOverlapSkip
		if sc.Overlap {
			policy = ScheduleOverlapAllow
		}
	}

	_, isRunning := r.runningSchedules[sc.ID]

	switch policy {
	case ScheduleOverlapAllow:
		// Always allow concurrent execution
		return true

	case ScheduleOverlapSkip:
		if isRunning {
			// Skip this execution
			r.store.mu.Lock()
			if s, ok := r.store.schedules[sc.ID]; ok {
				s.State.SkipCount++
			}
			r.store.mu.Unlock()
			log.Printf("[ScheduleRunner] Skipping schedule %q (already running)", sc.ID)
			return false
		}
		return true

	case ScheduleOverlapQueueOne:
		if isRunning {
			// Only queue if there isn't already a queued execution
			if len(r.queuedExecutions[sc.ID]) == 0 {
				input := deepCopyAny(sc.Input).(map[string]any)
				if input == nil {
					input = make(map[string]any)
				}
				r.queuedExecutions[sc.ID] = append(r.queuedExecutions[sc.ID], &queuedExecution{
					ScheduleID: sc.ID,
					Input:      input,
					QueuedAt:   time.Now(),
				})
				log.Printf("[ScheduleRunner] Queued execution for schedule %q", sc.ID)
			}
			return false
		}
		return true
	}

	return true
}

// executeSchedule runs a scheduled workflow and updates the schedule state.
func (r *ScheduleRunner) executeSchedule(sc *ScheduleConfig, input map[string]any) {
	executionID := uuid.New().String()
	startedAt := time.Now()

	// Mark as running
	r.mu.Lock()
	r.runningSchedules[sc.ID] = &runningExecution{
		ScheduleID:  sc.ID,
		ExecutionID: executionID,
		StartedAt:   startedAt,
	}
	r.mu.Unlock()

	log.Printf("[ScheduleRunner] Executing schedule %q (workflow: %s, execution: %s)",
		sc.ID, sc.WorkflowID, executionID)

	// Broadcast schedule execution started
	r.broadcast("schedule_execution_started", map[string]any{
		"scheduleId":  sc.ID,
		"workflowId":  sc.WorkflowID,
		"executionId": executionID,
		"startedAt":   startedAt,
	})

	// Execute with retry
	maxRetries := sc.MaxRetries
	if maxRetries <= 0 {
		maxRetries = maxScheduleRetries
	}
	retryDelay := sc.RetryDelay
	if retryDelay <= 0 {
		retryDelay = defaultScheduleRetryDelay
	}

	var execErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			log.Printf("[ScheduleRunner] Retrying schedule %q (attempt %d/%d)",
				sc.ID, attempt, maxRetries)
			time.Sleep(retryDelay)
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		execErr = r.orchestrator.Execute(ctx, sc.WorkflowID)
		cancel()

		if execErr == nil {
			break
		}
	}

	// Update schedule state
	result := "success"
	lastError := ""
	if execErr != nil {
		result = "failed"
		lastError = execErr.Error()
		log.Printf("[ScheduleRunner] Schedule %q failed: %v", sc.ID, execErr)
	}

	now := time.Now()
	r.store.mu.Lock()
	if s, ok := r.store.schedules[sc.ID]; ok {
		s.State.LastRun = now
		s.State.LastResult = result
		s.State.LastError = lastError
		s.State.RunCount++
		s.State.IsRunning = false
	}
	r.store.mu.Unlock()

	// Mark as no longer running
	r.mu.Lock()
	delete(r.runningSchedules, sc.ID)

	// Check for queued execution (QUEUE_ONE policy)
	if queued, ok := r.queuedExecutions[sc.ID]; ok && len(queued) > 0 {
		next := queued[0]
		r.queuedExecutions[sc.ID] = queued[1:]
		if len(r.queuedExecutions[sc.ID]) == 0 {
			delete(r.queuedExecutions, sc.ID)
		}
		r.mu.Unlock()

		log.Printf("[ScheduleRunner] Executing queued run for schedule %q", sc.ID)
		go r.executeSchedule(sc, next.Input)
	} else {
		r.mu.Unlock()
	}

	// Broadcast schedule execution completed
	r.broadcast("schedule_execution_completed", map[string]any{
		"scheduleId":  sc.ID,
		"workflowId":  sc.WorkflowID,
		"executionId": executionID,
		"result":      result,
		"error":       lastError,
		"startedAt":   startedAt,
		"completedAt": now,
	})
}

// updateLastRun updates the LastRun timestamp for a schedule.
func (r *ScheduleRunner) updateLastRun(scheduleID string, t time.Time) {
	r.store.mu.Lock()
	defer r.store.mu.Unlock()
	if s, ok := r.store.schedules[scheduleID]; ok {
		s.State.LastRun = t
	}
}

// updateNextRun updates the NextRun timestamp for a schedule.
func (r *ScheduleRunner) updateNextRun(scheduleID string, t time.Time) {
	r.store.mu.Lock()
	defer r.store.mu.Unlock()
	if s, ok := r.store.schedules[scheduleID]; ok {
		s.State.NextRun = t
	}
}

// broadcast sends an event to the event broadcaster if configured.
func (r *ScheduleRunner) broadcast(eventType string, payload any) {
	if r.broadcaster != nil {
		r.broadcaster.Broadcast(eventType, payload)
	}
}
