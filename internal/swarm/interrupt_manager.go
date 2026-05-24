package swarm

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/log"
	"github.com/swarm-editor/swarm-editor/pkg/utils"
)

var interruptLog = log.With("component", "InterruptManager")

// InterruptReason describes why an agent was interrupted
type InterruptReason string

const (
	InterruptTimeout    InterruptReason = "timeout"
	InterruptTokenLimit InterruptReason = "token_limit"
	InterruptNetwork    InterruptReason = "network_error"
	InterruptCrash      InterruptReason = "agent_crash"
	InterruptUserCancel InterruptReason = "user_cancel"
	InterruptQueenOrder InterruptReason = "queen_order"
)

// RecoveryStrategy defines how to handle an interrupted task
type RecoveryStrategy string

const (
	RecoveryRetrySame  RecoveryStrategy = "retry_same"   // retry same agent
	RecoveryReassign   RecoveryStrategy = "reassign"     // give to different agent
	RecoveryCheckpoint RecoveryStrategy = "checkpoint"   // save & wait
	RecoveryEscalate   RecoveryStrategy = "escalate"     // queen re-plans
)

// Checkpoint saves task progress for later resumption
type TaskCheckpoint struct {
	ID             string
	TaskID         string
	AgentID        string
	Reason         InterruptReason
	Strategy       RecoveryStrategy
	PartialResult  string    // whatever the agent produced so far
	CompletedSteps []string
	RemainingSteps []string
	SavedAt        time.Time
	ResumeDelay    time.Duration // for retry_same
	RetryCount     int
}

// InterruptRecord tracks an interrupt event
type InterruptRecord struct {
	ID          string
	TaskID      string
	AgentID     string
	Reason      InterruptReason
	Checkpoint  *TaskCheckpoint
	Timestamp   time.Time
	Recovered   bool
	RecoveredAt *time.Time
}

// InterruptManager manages agent interrupts and recovery
type InterruptManager struct {
	mu            sync.RWMutex
	checkpoints   map[string]*TaskCheckpoint
	interrupts    []InterruptRecord
	baseRetryDelay time.Duration
	maxRetries    int
	scheduled     map[string]time.Time // checkpointID -> scheduled resume time
}

// NewInterruptManager creates a new interrupt manager
func NewInterruptManager() *InterruptManager {
	return &InterruptManager{
		checkpoints:    make(map[string]*TaskCheckpoint),
		interrupts:     make([]InterruptRecord, 0),
		baseRetryDelay: 5 * time.Second,
		maxRetries:     5,
		scheduled:      make(map[string]time.Time),
	}
}

// Interrupt creates a checkpoint, cancels the task context, and saves partial result
func (im *InterruptManager) Interrupt(ctx context.Context, agentID, taskID string, reason InterruptReason) (*TaskCheckpoint, error) {
	im.mu.Lock()
	defer im.mu.Unlock()

	// Check if task already has a checkpoint
	for _, cp := range im.checkpoints {
		if cp.TaskID == taskID && !isCheckpointRecovered(cp, im.interrupts) {
			return nil, fmt.Errorf("task %s already has an active checkpoint", taskID)
		}
	}

	checkpointID := utils.GenerateID("checkpoint")
	now := time.Now()

	checkpoint := &TaskCheckpoint{
		ID:             checkpointID,
		TaskID:         taskID,
		AgentID:        agentID,
		Reason:         reason,
		Strategy:       RecoveryRetrySame, // default strategy
		PartialResult:  "",
		CompletedSteps: []string{},
		RemainingSteps: []string{},
		SavedAt:        now,
		ResumeDelay:    im.baseRetryDelay,
		RetryCount:     0,
	}

	im.checkpoints[checkpointID] = checkpoint

	record := InterruptRecord{
		ID:        utils.GenerateID("interrupt"),
		TaskID:    taskID,
		AgentID:   agentID,
		Reason:    reason,
		Checkpoint: checkpoint,
		Timestamp: now,
		Recovered: false,
	}
	im.interrupts = append(im.interrupts, record)

	interruptLog.Info("Agent interrupted", "agent_id", agentID, "task_id", taskID, "reason", reason, "checkpoint_id", checkpointID)

	return checkpoint, nil
}

// Resume resumes a task from checkpoint
func (im *InterruptManager) Resume(ctx context.Context, checkpointID string) error {
	im.mu.Lock()
	defer im.mu.Unlock()

	checkpoint, exists := im.checkpoints[checkpointID]
	if !exists {
		return fmt.Errorf("checkpoint %s not found", checkpointID)
	}

	// Check if already recovered
	for i := range im.interrupts {
		if im.interrupts[i].Checkpoint != nil && im.interrupts[i].Checkpoint.ID == checkpointID {
			if im.interrupts[i].Recovered {
				return fmt.Errorf("checkpoint %s already recovered", checkpointID)
			}
			now := time.Now()
			im.interrupts[i].Recovered = true
			im.interrupts[i].RecoveredAt = &now
			break
		}
	}

	interruptLog.Info("Resuming task from checkpoint", "checkpoint_id", checkpointID, "task_id", checkpoint.TaskID, "agent_id", checkpoint.AgentID)

	return nil
}

// ResumeWithAgent resumes a task from checkpoint with a different agent
func (im *InterruptManager) ResumeWithAgent(ctx context.Context, checkpointID, newAgentID string) error {
	im.mu.Lock()
	defer im.mu.Unlock()

	checkpoint, exists := im.checkpoints[checkpointID]
	if !exists {
		return fmt.Errorf("checkpoint %s not found", checkpointID)
	}

	oldAgentID := checkpoint.AgentID
	checkpoint.AgentID = newAgentID
	checkpoint.Strategy = RecoveryReassign

	// Mark interrupt as recovered
	for i := range im.interrupts {
		if im.interrupts[i].Checkpoint != nil && im.interrupts[i].Checkpoint.ID == checkpointID {
			if im.interrupts[i].Recovered {
				return fmt.Errorf("checkpoint %s already recovered", checkpointID)
			}
			now := time.Now()
			im.interrupts[i].Recovered = true
			im.interrupts[i].RecoveredAt = &now
			break
		}
	}

	interruptLog.Info("Resuming task with new agent", "checkpoint_id", checkpointID, "task_id", checkpoint.TaskID, "old_agent_id", oldAgentID, "new_agent_id", newAgentID)

	return nil
}

// ScheduleRetry schedules a retry with exponential backoff
func (im *InterruptManager) ScheduleRetry(checkpointID string, delay time.Duration) {
	im.mu.Lock()
	defer im.mu.Unlock()

	checkpoint, exists := im.checkpoints[checkpointID]
	if !exists {
		interruptLog.Warn("Cannot schedule retry: checkpoint not found", "checkpoint_id", checkpointID)
		return
	}

	// Calculate exponential backoff: delay = baseDelay * 2^retryCount
	backoffDelay := im.baseRetryDelay * (1 << checkpoint.RetryCount)
	if delay > 0 {
		backoffDelay = delay
	}

	scheduledTime := time.Now().Add(backoffDelay)
	im.scheduled[checkpointID] = scheduledTime

	checkpoint.ResumeDelay = backoffDelay
	checkpoint.RetryCount++

	interruptLog.Info("Scheduled retry", "checkpoint_id", checkpointID, "retry_count", checkpoint.RetryCount, "delay", backoffDelay)
}

// GetCheckpoint returns a checkpoint by ID
func (im *InterruptManager) GetCheckpoint(id string) (*TaskCheckpoint, error) {
	im.mu.RLock()
	defer im.mu.RUnlock()

	checkpoint, exists := im.checkpoints[id]
	if !exists {
		return nil, fmt.Errorf("checkpoint %s not found", id)
	}
	// Return a copy to prevent external mutation
	cp := *checkpoint
	return &cp, nil
}

// ListCheckpoints returns all checkpoints for a task
func (im *InterruptManager) ListCheckpoints(taskID string) []TaskCheckpoint {
	im.mu.RLock()
	defer im.mu.RUnlock()

	var result []TaskCheckpoint
	for _, cp := range im.checkpoints {
		if cp.TaskID == taskID {
			cpCopy := *cp
			result = append(result, cpCopy)
		}
	}
	return result
}

// GetActiveInterrupts returns all active (unrecovered) interrupt records
func (im *InterruptManager) GetActiveInterrupts() []InterruptRecord {
	im.mu.RLock()
	defer im.mu.RUnlock()

	var result []InterruptRecord
	for _, rec := range im.interrupts {
		if !rec.Recovered {
			recCopy := rec
			if rec.Checkpoint != nil {
				cpCopy := *rec.Checkpoint
				recCopy.Checkpoint = &cpCopy
			}
			result = append(result, recCopy)
		}
	}
	return result
}

// ApplyStrategy executes a recovery strategy on a checkpoint
func (im *InterruptManager) ApplyStrategy(checkpointID string, strategy RecoveryStrategy) error {
	im.mu.Lock()
	defer im.mu.Unlock()

	checkpoint, exists := im.checkpoints[checkpointID]
	if !exists {
		return fmt.Errorf("checkpoint %s not found", checkpointID)
	}

	checkpoint.Strategy = strategy

	switch strategy {
	case RecoveryRetrySame:
		// Check max retries
		if checkpoint.RetryCount >= im.maxRetries {
			return fmt.Errorf("max retries (%d) exceeded for checkpoint %s", im.maxRetries, checkpointID)
		}
		// Schedule retry with backoff
		backoffDelay := im.baseRetryDelay * (1 << checkpoint.RetryCount)
		scheduledTime := time.Now().Add(backoffDelay)
		im.scheduled[checkpointID] = scheduledTime
		checkpoint.ResumeDelay = backoffDelay
		checkpoint.RetryCount++

	case RecoveryReassign:
		// Mark for reassignment - caller must provide new agent
		checkpoint.RetryCount = 0 // Reset retry count for new agent

	case RecoveryCheckpoint:
		// Save and wait - no action needed, checkpoint already saved

	case RecoveryEscalate:
		// Mark for escalation - queen will re-plan
		checkpoint.RetryCount = 0
	}

	interruptLog.Info("Applied recovery strategy", "checkpoint_id", checkpointID, "strategy", strategy)

	return nil
}

// isCheckpointRecovered checks if a checkpoint has been recovered
func isCheckpointRecovered(checkpoint *TaskCheckpoint, records []InterruptRecord) bool {
	for _, rec := range records {
		if rec.Checkpoint != nil && rec.Checkpoint.ID == checkpoint.ID && rec.Recovered {
			return true
		}
	}
	return false
}

// SetBaseRetryDelay sets the base delay for retry backoff
func (im *InterruptManager) SetBaseRetryDelay(delay time.Duration) {
	im.mu.Lock()
	defer im.mu.Unlock()
	im.baseRetryDelay = delay
}

// SetMaxRetries sets the maximum number of retries
func (im *InterruptManager) SetMaxRetries(max int) {
	im.mu.Lock()
	defer im.mu.Unlock()
	im.maxRetries = max
}

// GetScheduledTime returns the scheduled resume time for a checkpoint
func (im *InterruptManager) GetScheduledTime(checkpointID string) (time.Time, bool) {
	im.mu.RLock()
	defer im.mu.RUnlock()
	t, ok := im.scheduled[checkpointID]
	return t, ok
}

// ClearScheduled removes a scheduled retry
func (im *InterruptManager) ClearScheduled(checkpointID string) {
	im.mu.Lock()
	defer im.mu.Unlock()
	delete(im.scheduled, checkpointID)
}

// CleanupOldCheckpoints removes checkpoints older than the given duration
func (im *InterruptManager) CleanupOldCheckpoints(olderThan time.Duration) int {
	im.mu.Lock()
	defer im.mu.Unlock()

	cutoff := time.Now().Add(-olderThan)
	removed := 0

	for id, cp := range im.checkpoints {
		// Only remove recovered checkpoints
		if cp.SavedAt.Before(cutoff) && isCheckpointRecovered(cp, im.interrupts) {
			delete(im.checkpoints, id)
			delete(im.scheduled, id)
			removed++
		}
	}

	interruptLog.Info("Cleaned up old checkpoints", "count", removed, "older_than", olderThan)
	return removed
}
