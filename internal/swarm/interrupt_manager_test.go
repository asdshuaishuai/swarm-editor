package swarm

import (
	"context"
	"testing"
	"time"
)

func TestInterrupt_Timeout(t *testing.T) {
	im := NewInterruptManager()
	ctx := context.Background()

	checkpoint, err := im.Interrupt(ctx, "agent1", "task1", InterruptTimeout)
	if err != nil {
		t.Fatalf("Interrupt failed: %v", err)
	}

	if checkpoint.TaskID != "task1" {
		t.Errorf("Expected taskID task1, got %s", checkpoint.TaskID)
	}
	if checkpoint.Reason != InterruptTimeout {
		t.Errorf("Expected reason %s, got %s", InterruptTimeout, checkpoint.Reason)
	}
	if checkpoint.Strategy != RecoveryRetrySame {
		t.Errorf("Expected default strategy %s, got %s", RecoveryRetrySame, checkpoint.Strategy)
	}
}

func TestInterrupt_NetworkError(t *testing.T) {
	im := NewInterruptManager()
	ctx := context.Background()

	checkpoint, err := im.Interrupt(ctx, "agent2", "task2", InterruptNetwork)
	if err != nil {
		t.Fatalf("Interrupt failed: %v", err)
	}

	if checkpoint.Reason != InterruptNetwork {
		t.Errorf("Expected reason %s, got %s", InterruptNetwork, checkpoint.Reason)
	}
	if checkpoint.AgentID != "agent2" {
		t.Errorf("Expected agentID agent2, got %s", checkpoint.AgentID)
	}
}

func TestCheckpoint_SaveAndResume(t *testing.T) {
	im := NewInterruptManager()
	ctx := context.Background()

	checkpoint, err := im.Interrupt(ctx, "agent1", "task1", InterruptTimeout)
	if err != nil {
		t.Fatalf("Interrupt failed: %v", err)
	}

	// Verify checkpoint is saved
	saved, err := im.GetCheckpoint(checkpoint.ID)
	if err != nil {
		t.Fatalf("GetCheckpoint failed: %v", err)
	}
	if saved.ID != checkpoint.ID {
		t.Errorf("Expected checkpoint ID %s, got %s", checkpoint.ID, saved.ID)
	}

	// Resume from checkpoint
	err = im.Resume(ctx, checkpoint.ID)
	if err != nil {
		t.Fatalf("Resume failed: %v", err)
	}

	// Verify recovered status
	activeInterrupts := im.GetActiveInterrupts()
	if len(activeInterrupts) != 0 {
		t.Errorf("Expected 0 active interrupts after resume, got %d", len(activeInterrupts))
	}
}

func TestResumeWithDifferentAgent(t *testing.T) {
	im := NewInterruptManager()
	ctx := context.Background()

	checkpoint, err := im.Interrupt(ctx, "agent1", "task1", InterruptCrash)
	if err != nil {
		t.Fatalf("Interrupt failed: %v", err)
	}

	// Resume with different agent
	err = im.ResumeWithAgent(ctx, checkpoint.ID, "agent2")
	if err != nil {
		t.Fatalf("ResumeWithAgent failed: %v", err)
	}

	// Verify agent changed
	saved, _ := im.GetCheckpoint(checkpoint.ID)
	if saved.AgentID != "agent2" {
		t.Errorf("Expected agentID agent2, got %s", saved.AgentID)
	}
	if saved.Strategy != RecoveryReassign {
		t.Errorf("Expected strategy %s, got %s", RecoveryReassign, saved.Strategy)
	}
}

func TestScheduleRetry_ExponentialBackoff(t *testing.T) {
	im := NewInterruptManager()
	im.SetBaseRetryDelay(1 * time.Second)
	ctx := context.Background()

	checkpoint, err := im.Interrupt(ctx, "agent1", "task1", InterruptTimeout)
	if err != nil {
		t.Fatalf("Interrupt failed: %v", err)
	}

	// First retry: 1s * 2^0 = 1s
	im.ScheduleRetry(checkpoint.ID, 0)
	scheduled1, _ := im.GetScheduledTime(checkpoint.ID)
	expected1 := time.Now().Add(1 * time.Second)
	if scheduled1.Sub(expected1) > 100*time.Millisecond {
		t.Errorf("Expected scheduled time around %v, got %v", expected1, scheduled1)
	}

	// Second retry: 1s * 2^1 = 2s
	im.ScheduleRetry(checkpoint.ID, 0)
	scheduled2, _ := im.GetScheduledTime(checkpoint.ID)
	expected2 := time.Now().Add(2 * time.Second)
	if scheduled2.Sub(expected2) > 100*time.Millisecond {
		t.Errorf("Expected scheduled time around %v, got %v", expected2, scheduled2)
	}

	// Verify retry count
	saved, _ := im.GetCheckpoint(checkpoint.ID)
	if saved.RetryCount != 2 {
		t.Errorf("Expected retry count 2, got %d", saved.RetryCount)
	}
}

func TestApplyStrategy_RetrySame(t *testing.T) {
	im := NewInterruptManager()
	im.SetBaseRetryDelay(1 * time.Second)
	im.SetMaxRetries(3)
	ctx := context.Background()

	checkpoint, err := im.Interrupt(ctx, "agent1", "task1", InterruptTimeout)
	if err != nil {
		t.Fatalf("Interrupt failed: %v", err)
	}

	// Apply retry strategy
	err = im.ApplyStrategy(checkpoint.ID, RecoveryRetrySame)
	if err != nil {
		t.Fatalf("ApplyStrategy failed: %v", err)
	}

	// Verify scheduled
	_, hasScheduled := im.GetScheduledTime(checkpoint.ID)
	if !hasScheduled {
		t.Error("Expected scheduled retry time")
	}

	// Verify retry count incremented
	saved, _ := im.GetCheckpoint(checkpoint.ID)
	if saved.RetryCount != 1 {
		t.Errorf("Expected retry count 1, got %d", saved.RetryCount)
	}
	if saved.Strategy != RecoveryRetrySame {
		t.Errorf("Expected strategy %s, got %s", RecoveryRetrySame, saved.Strategy)
	}
}

func TestApplyStrategy_Reassign(t *testing.T) {
	im := NewInterruptManager()
	ctx := context.Background()

	checkpoint, err := im.Interrupt(ctx, "agent1", "task1", InterruptTimeout)
	if err != nil {
		t.Fatalf("Interrupt failed: %v", err)
	}

	// Apply reassign strategy
	err = im.ApplyStrategy(checkpoint.ID, RecoveryReassign)
	if err != nil {
		t.Fatalf("ApplyStrategy failed: %v", err)
	}

	saved, _ := im.GetCheckpoint(checkpoint.ID)
	if saved.Strategy != RecoveryReassign {
		t.Errorf("Expected strategy %s, got %s", RecoveryReassign, saved.Strategy)
	}
	// Reassign should reset retry count
	if saved.RetryCount != 0 {
		t.Errorf("Expected retry count 0 after reassign, got %d", saved.RetryCount)
	}
}

func TestApplyStrategy_Escalate(t *testing.T) {
	im := NewInterruptManager()
	ctx := context.Background()

	checkpoint, err := im.Interrupt(ctx, "agent1", "task1", InterruptTimeout)
	if err != nil {
		t.Fatalf("Interrupt failed: %v", err)
	}

	// Apply escalate strategy
	err = im.ApplyStrategy(checkpoint.ID, RecoveryEscalate)
	if err != nil {
		t.Fatalf("ApplyStrategy failed: %v", err)
	}

	saved, _ := im.GetCheckpoint(checkpoint.ID)
	if saved.Strategy != RecoveryEscalate {
		t.Errorf("Expected strategy %s, got %s", RecoveryEscalate, saved.Strategy)
	}
}

func TestMaxRetries(t *testing.T) {
	im := NewInterruptManager()
	im.SetMaxRetries(2)
	im.SetBaseRetryDelay(1 * time.Second)
	ctx := context.Background()

	checkpoint, err := im.Interrupt(ctx, "agent1", "task1", InterruptTimeout)
	if err != nil {
		t.Fatalf("Interrupt failed: %v", err)
	}

	// First retry - should succeed
	err = im.ApplyStrategy(checkpoint.ID, RecoveryRetrySame)
	if err != nil {
		t.Fatalf("First ApplyStrategy failed: %v", err)
	}

	// Second retry - should succeed
	err = im.ApplyStrategy(checkpoint.ID, RecoveryRetrySame)
	if err != nil {
		t.Fatalf("Second ApplyStrategy failed: %v", err)
	}

	// Third retry - should fail (max retries = 2)
	err = im.ApplyStrategy(checkpoint.ID, RecoveryRetrySame)
	if err == nil {
		t.Error("Expected error exceeding max retries, got nil")
	}
}

func TestListCheckpoints(t *testing.T) {
	im := NewInterruptManager()
	ctx := context.Background()

	// Create checkpoints for different tasks
	im.Interrupt(ctx, "agent1", "task1", InterruptTimeout)
	im.Interrupt(ctx, "agent2", "task2", InterruptNetwork)
	im.Interrupt(ctx, "agent3", "task3", InterruptCrash)

	checkpoints := im.ListCheckpoints("task1")
	if len(checkpoints) != 1 {
		t.Errorf("Expected 1 checkpoint for task1, got %d", len(checkpoints))
	}

	task2Checkpoints := im.ListCheckpoints("task2")
	if len(task2Checkpoints) != 1 {
		t.Errorf("Expected 1 checkpoint for task2, got %d", len(task2Checkpoints))
	}
}

func TestGetActiveInterrupts(t *testing.T) {
	im := NewInterruptManager()
	ctx := context.Background()

	// Create interrupt
	im.Interrupt(ctx, "agent1", "task1", InterruptTimeout)

	// Get active interrupts
	active := im.GetActiveInterrupts()
	if len(active) != 1 {
		t.Fatalf("Expected 1 active interrupt, got %d", len(active))
	}

	// Resume the interrupt
	im.Resume(ctx, active[0].Checkpoint.ID)

	// Should have no active interrupts
	active = im.GetActiveInterrupts()
	if len(active) != 0 {
		t.Errorf("Expected 0 active interrupts after resume, got %d", len(active))
	}
}

func TestDuplicateInterrupt(t *testing.T) {
	im := NewInterruptManager()
	ctx := context.Background()

	// Create first interrupt
	_, err := im.Interrupt(ctx, "agent1", "task1", InterruptTimeout)
	if err != nil {
		t.Fatalf("First interrupt failed: %v", err)
	}

	// Try to create second interrupt for same task
	_, err = im.Interrupt(ctx, "agent2", "task1", InterruptNetwork)
	if err == nil {
		t.Error("Expected error for duplicate interrupt, got nil")
	}
}

func TestCleanupOldCheckpoints(t *testing.T) {
	im := NewInterruptManager()
	ctx := context.Background()

	// Create old checkpoint (simulated by immediately marking as recovered)
	cp1, _ := im.Interrupt(ctx, "agent1", "task1", InterruptTimeout)
	im.Resume(ctx, cp1.ID)

	// Manually set saved time to old
	im.mu.Lock()
	if cp, ok := im.checkpoints[cp1.ID]; ok {
		cp.SavedAt = time.Now().Add(-2 * time.Hour)
	}
	im.mu.Unlock()

	// Create recent checkpoint
	cp2, _ := im.Interrupt(ctx, "agent2", "task2", InterruptTimeout)

	// Cleanup checkpoints older than 1 hour
	removed := im.CleanupOldCheckpoints(1 * time.Hour)

	if removed != 1 {
		t.Errorf("Expected 1 checkpoint removed, got %d", removed)
	}

	// Verify old checkpoint removed
	_, err := im.GetCheckpoint(cp1.ID)
	if err == nil {
		t.Error("Expected old checkpoint to be removed")
	}

	// Verify recent checkpoint still exists
	_, err = im.GetCheckpoint(cp2.ID)
	if err != nil {
		t.Errorf("Expected recent checkpoint to exist, got error: %v", err)
	}
}

func TestCheckpointNotFound(t *testing.T) {
	im := NewInterruptManager()
	ctx := context.Background()

	// Try to get non-existent checkpoint
	_, err := im.GetCheckpoint("nonexistent")
	if err == nil {
		t.Error("Expected error for non-existent checkpoint, got nil")
	}

	// Try to resume non-existent checkpoint
	err = im.Resume(ctx, "nonexistent")
	if err == nil {
		t.Error("Expected error for resume non-existent checkpoint, got nil")
	}
}

func TestResumeAlreadyRecovered(t *testing.T) {
	im := NewInterruptManager()
	ctx := context.Background()

	checkpoint, err := im.Interrupt(ctx, "agent1", "task1", InterruptTimeout)
	if err != nil {
		t.Fatalf("Interrupt failed: %v", err)
	}

	// First resume
	err = im.Resume(ctx, checkpoint.ID)
	if err != nil {
		t.Fatalf("First resume failed: %v", err)
	}

	// Second resume should fail
	err = im.Resume(ctx, checkpoint.ID)
	if err == nil {
		t.Error("Expected error for double resume, got nil")
	}
}
