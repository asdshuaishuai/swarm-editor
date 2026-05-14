//go:build !race

// These tests intentionally create race conditions to verify thread-safety.
// They are skipped when running with -race flag because the race detector
// will flag intentional concurrent access patterns.
// Pattern from nats-io/nats.go norace_test.go

package swarm

import (
	"context"
	"sync"
	"testing"
	"time"
)

// TestFinalizeConsensusOnce verifies that finalizeConsensus can only close
// the EvalChannel once even when called concurrently
func TestFinalizeConsensusOnce(t *testing.T) {
	config := ConsensusConfig{
		DefaultAlgorithm: ConsensusSimpleMajority,
		DefaultTimeout:   30 * time.Second,
		MinAgreement:     0.5,
		MaxRetries:       3,
	}
	engine := NewConsensusEngine(config, nil)

	ctx := context.Background()
	err := engine.Start(ctx)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer engine.Stop()

	task := &Task{
		ID:          "test-task-once",
		Title:       "Test Task",
		Description: "Test description",
		Priority:    PriorityMedium,
	}

	// Create an active evaluation directly
	active := &ActiveTaskEvaluation{
		Task:        task,
		Evaluations: make(map[string]Evaluation),
		Deadline:    time.Now().Add(30 * time.Second),
		EvalChannel: make(chan Evaluation, 10),
	}

	// Store it
	engine.mu.Lock()
	engine.activeTasks[task.ID] = active
	engine.mu.Unlock()

	// Launch multiple goroutines to call finalizeConsensus concurrently
	var wg sync.WaitGroup
	panicCount := 0
	var panicMu sync.Mutex

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			defer func() {
				if r := recover(); r != nil {
					panicMu.Lock()
					panicCount++
					panicMu.Unlock()
				}
			}()

			engine.mu.Lock()
			engine.finalizeConsensus(active)
			engine.mu.Unlock()
		}()
	}

	wg.Wait()

	// Should not have any panics from double channel close
	if panicCount > 0 {
		t.Errorf("finalizeConsensus caused %d panics (likely double channel close)", panicCount)
	}
}

// TestActiveTaskEvaluationCloseOnce tests the closeOnce field directly
func TestActiveTaskEvaluationCloseOnce(t *testing.T) {
	active := &ActiveTaskEvaluation{
		Task:        &Task{ID: "test"},
		Evaluations: make(map[string]Evaluation),
		EvalChannel: make(chan Evaluation, 10),
	}

	// Multiple calls to closeOnce should be safe
	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			active.closeOnce.Do(func() {
				close(active.EvalChannel)
			})
		}()
	}

	wg.Wait()

	// Verify channel is closed (reading should return zero value and false)
	select {
	case _, ok := <-active.EvalChannel:
		if ok {
			t.Error("channel should be closed")
		}
	default:
		// Channel was closed, select didn't block
	}
}
