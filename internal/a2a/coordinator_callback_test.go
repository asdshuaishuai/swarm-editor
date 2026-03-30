package a2a

import (
	"context"
	"sync"
	"testing"
	"time"
)

// TestOnTaskAssignedCallbackOutsideLock verifies that the onTaskAssigned callback
// is invoked outside the coordinator lock to prevent deadlock.
func TestOnTaskAssignedCallbackOutsideLock(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coord := NewCoordinator(CoordinatorConfig{
		MaxConcurrent: 10,
		Strategy:      StrategyRoundRobin,
	}, router)

	// Register an agent
	coord.RegisterAgent("agent-1", []string{"test"})

	var callbackInvoked bool
	var mu sync.Mutex
	coord.OnTaskAssigned(func(task *CoordinationTask, agentID string) {
		mu.Lock()
		callbackInvoked = true
		mu.Unlock()

		// If callback is invoked while holding coord.mu, this would deadlock
		// because SubmitTask also acquires coord.mu
		err := coord.SubmitTask(context.Background(), &CoordinationTask{
			ID:           "test-task-2",
			Title:        "Test Task 2",
			Priority:     1,
			RequiredRole: "test",
		})
		if err != nil {
			t.Logf("SubmitTask in callback returned: %v", err)
		}
	})

	// Start coordinator
	if err := coord.Start(context.Background()); err != nil {
		t.Fatalf("failed to start coordinator: %v", err)
	}
	defer coord.Stop()

	// Submit a task which should trigger the callback
	err := coord.SubmitTask(context.Background(), &CoordinationTask{
		ID:           "test-task-1",
		Title:        "Test Task",
		Priority:     1,
		RequiredRole: "test",
	})
	if err != nil {
		t.Fatalf("failed to submit task: %v", err)
	}

	// Wait for callback to be invoked
	time.Sleep(200 * time.Millisecond)

	mu.Lock()
	if !callbackInvoked {
		t.Error("onTaskAssigned callback was not invoked")
	}
	mu.Unlock()
}

// TestHandleHelpRequestNoDataRace verifies that handleHelpRequest doesn't
// have data races when accessing agent state.
func TestHandleHelpRequestNoDataRace(t *testing.T) {
	router := NewRouter(RouterConfig{})
	coord := NewCoordinator(CoordinatorConfig{
		MaxConcurrent: 10,
		Strategy:      StrategyRoundRobin,
	}, router)

	// Register multiple agents with capabilities
	for i := 0; i < 5; i++ {
		agentID := string(rune('a' + i))
		coord.RegisterAgent(agentID, []string{"skill1", "skill2"})
	}

	// Start coordinator
	if err := coord.Start(context.Background()); err != nil {
		t.Fatalf("failed to start coordinator: %v", err)
	}
	defer coord.Stop()

	var wg sync.WaitGroup

	// Concurrently handle help requests while modifying agents
	for i := 0; i < 10; i++ {
		wg.Add(1)

		// Goroutine: Handle help request (reads agent states)
		go func() {
			defer wg.Done()
			msg := &Message{
				Type: MessageTypeHelpRequest,
				From: "test-agent",
				To:   "coordinator",
			}
			msg.WithPayload(&HelpRequestPayload{
				Skills:  []string{"skill1"},
				Urgency: 1,
			})
			// This should not race with other operations
			coord.handleHelpRequest(msg)
		}()
	}

	wg.Wait()
}
