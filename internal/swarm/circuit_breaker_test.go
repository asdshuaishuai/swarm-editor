package swarm

import (
	"fmt"
	"sync"
	"testing"
	"time"
)

func TestCircuitBreakerInitial(t *testing.T) {
	cb := NewCircuitBreaker(DefaultCircuitBreakerConfig())

	if cb.State() != StateClosed {
		t.Errorf("Initial state = %v, want Closed", cb.State())
	}

	if !cb.IsHealthy() {
		t.Error("Circuit should be healthy initially")
	}

	if cb.IsOpen() {
		t.Error("Circuit should not be open initially")
	}

	cb.Close()
}

func TestCircuitBreakerTripOnFailures(t *testing.T) {
	config := CircuitBreakerConfig{
		FailureThreshold: 3,
		SuccessThreshold: 2,
		Timeout:          100 * time.Millisecond,
	}
	cb := NewCircuitBreaker(config)

	// Record failures up to threshold
	for i := 0; i < config.FailureThreshold; i++ {
		if !cb.Allow() {
			t.Errorf("Allow() = false at failure %d, should be true", i)
		}
		cb.RecordFailure()
	}

	// Circuit should now be open
	if cb.State() != StateOpen {
		t.Errorf("State after %d failures = %v, want Open", config.FailureThreshold, cb.State())
	}

	// Requests should be rejected
	if cb.Allow() {
		t.Error("Allow() should return false when circuit is open")
	}

	cb.Close()
}

func TestCircuitBreakerRecovery(t *testing.T) {
	config := CircuitBreakerConfig{
		FailureThreshold: 2,
		SuccessThreshold: 2,
		Timeout:          50 * time.Millisecond,
	}
	cb := NewCircuitBreaker(config)

	// Trip the circuit
	cb.Allow()
	cb.RecordFailure()
	cb.Allow()
	cb.RecordFailure()

	if cb.State() != StateOpen {
		t.Fatalf("State = %v, want Open", cb.State())
	}

	// Wait for timeout
	time.Sleep(config.Timeout + 10*time.Millisecond)

	// Should transition to half-open
	if !cb.Allow() {
		t.Error("Allow() should return true after timeout (half-open)")
	}

	if cb.State() != StateHalfOpen {
		t.Errorf("State = %v, want HalfOpen", cb.State())
	}

	// Record success to close the circuit
	cb.RecordSuccess()

	if cb.State() != StateHalfOpen {
		t.Errorf("State after 1 success = %v, want HalfOpen", cb.State())
	}

	// Need another success (threshold is 2)
	// But first we need to Allow() again since concurrent count decremented
	if !cb.Allow() {
		t.Error("Allow() should return true in half-open")
	}
	cb.RecordSuccess()

	if cb.State() != StateClosed {
		t.Errorf("State after %d successes = %v, want Closed", config.SuccessThreshold, cb.State())
	}

	cb.Close()
}

func TestCircuitBreakerFailureInHalfOpenReopens(t *testing.T) {
	config := CircuitBreakerConfig{
		FailureThreshold: 2,
		SuccessThreshold: 2,
		Timeout:          50 * time.Millisecond,
	}
	cb := NewCircuitBreaker(config)

	// Trip the circuit
	cb.Allow()
	cb.RecordFailure()
	cb.Allow()
	cb.RecordFailure()

	// Wait for timeout
	time.Sleep(config.Timeout + 10*time.Millisecond)

	// Transition to half-open
	if !cb.Allow() {
		t.Error("Allow() should return true after timeout")
	}

	// Record failure - should reopen
	cb.RecordFailure()

	if cb.State() != StateOpen {
		t.Errorf("State after failure in half-open = %v, want Open", cb.State())
	}

	cb.Close()
}

func TestCircuitBreakerStats(t *testing.T) {
	config := DefaultCircuitBreakerConfig()
	cb := NewCircuitBreaker(config)

	// Record some operations
	cb.Allow()
	cb.RecordSuccess()
	cb.Allow()
	cb.RecordSuccess()
	cb.Allow()
	cb.RecordFailure()

	stats := cb.GetStats()

	if stats.TotalRequests != 3 {
		t.Errorf("TotalRequests = %d, want 3", stats.TotalRequests)
	}

	if stats.TotalSuccesses != 2 {
		t.Errorf("TotalSuccesses = %d, want 2", stats.TotalSuccesses)
	}

	if stats.TotalFailures != 1 {
		t.Errorf("TotalFailures = %d, want 1", stats.TotalFailures)
	}

	if stats.ConsecutiveFails != 1 {
		t.Errorf("ConsecutiveFails = %d, want 1", stats.ConsecutiveFails)
	}

	cb.Close()
}

func TestCircuitBreakerConcurrentLimit(t *testing.T) {
	config := CircuitBreakerConfig{
		FailureThreshold: 5,
		SuccessThreshold: 2,
		Timeout:          time.Second,
		MaxConcurrent:    3,
	}
	cb := NewCircuitBreaker(config)

	// Should allow up to MaxConcurrent
	allowed := 0
	for i := 0; i < 5; i++ {
		if cb.Allow() {
			allowed++
		}
	}

	if allowed != 3 {
		t.Errorf("Allowed %d requests, want 3 (MaxConcurrent limit)", allowed)
	}

	// Complete some requests
	cb.RecordSuccess()
	cb.RecordSuccess()

	// Should allow more now
	if !cb.Allow() {
		t.Error("Allow() should return true after completing requests")
	}

	cb.Close()
}

func TestCircuitBreakerReset(t *testing.T) {
	config := CircuitBreakerConfig{
		FailureThreshold: 2,
		SuccessThreshold: 2,
		Timeout:          time.Second,
	}
	cb := NewCircuitBreaker(config)

	// Trip the circuit
	cb.Allow()
	cb.RecordFailure()
	cb.Allow()
	cb.RecordFailure()

	if cb.State() != StateOpen {
		t.Fatalf("State = %v, want Open", cb.State())
	}

	// Reset
	cb.Reset()

	if cb.State() != StateClosed {
		t.Errorf("State after reset = %v, want Closed", cb.State())
	}

	stats := cb.GetStats()
	if stats.ConsecutiveFails != 0 {
		t.Errorf("ConsecutiveFails after reset = %d, want 0", stats.ConsecutiveFails)
	}

	cb.Close()
}

func TestCircuitBreakerForceOperations(t *testing.T) {
	cb := NewCircuitBreaker(DefaultCircuitBreakerConfig())

	// Force open
	cb.ForceOpen()
	if !cb.IsOpen() {
		t.Error("IsOpen() should return true after ForceOpen()")
	}

	// Force close
	cb.ForceClose()
	if !cb.IsHealthy() {
		t.Error("IsHealthy() should return true after ForceClose()")
	}

	cb.Close()
}

func TestCircuitBreakerConcurrentAccess(t *testing.T) {
	config := CircuitBreakerConfig{
		FailureThreshold: 100,
		SuccessThreshold: 50,
		Timeout:          time.Second,
		MaxConcurrent:    100,
	}
	cb := NewCircuitBreaker(config)

	var wg sync.WaitGroup
	_ = make(chan error, 100) // reserved for future error collection

	// Concurrent Allow/Record operations
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				if cb.Allow() {
					cb.RecordSuccess()
				}
			}
		}()
	}

	wg.Wait()

	// Verify state is still consistent
	stats := cb.GetStats()
	if stats.State != StateClosed {
		t.Errorf("State after concurrent ops = %v, want Closed", stats.State)
	}

	// Total operations should be tracked
	if stats.TotalRequests != stats.TotalSuccesses+stats.TotalFailures {
		t.Errorf("Request count mismatch: total=%d, successes=%d, failures=%d",
			stats.TotalRequests, stats.TotalSuccesses, stats.TotalFailures)
	}

	cb.Close()
}

func TestCircuitBreakerStateChangeCallback(t *testing.T) {
	config := CircuitBreakerConfig{
		FailureThreshold: 2,
		SuccessThreshold: 1,
		Timeout:          50 * time.Millisecond,
	}
	cb := NewCircuitBreaker(config)

	var callbackMu sync.Mutex
	callbackCalled := false
	var fromState, toState CircuitState

	cb.OnStateChange(func(from, to CircuitState) {
		callbackMu.Lock()
		callbackCalled = true
		fromState = from
		toState = to
		callbackMu.Unlock()
	})

	// Trip the circuit
	cb.Allow()
	cb.RecordFailure()
	cb.Allow()
	cb.RecordFailure()

	// Wait for callback with timeout
	deadline := time.Now().Add(100 * time.Millisecond)
	for {
		callbackMu.Lock()
		called := callbackCalled
		callbackMu.Unlock()
		if called {
			break
		}
		if time.Now().After(deadline) {
			t.Error("State change callback was not called within timeout")
			cb.Close()
			return
		}
		time.Sleep(5 * time.Millisecond)
	}

	callbackMu.Lock()
	f := fromState
	tt := toState
	callbackMu.Unlock()

	if f != StateClosed || tt != StateOpen {
		t.Errorf("Callback received %s -> %s, want Closed -> Open", f, tt)
	}

	cb.Close()
}

func TestCircuitBreaker_IsOpen(t *testing.T) {
	cb := NewCircuitBreaker(CircuitBreakerConfig{
		FailureThreshold: 3,
		Timeout:          5 * time.Second,
	})
	defer cb.Close()

	if cb.IsOpen() {
		t.Error("new circuit should not be open")
	}

	// Trip the circuit
	for i := 0; i < 3; i++ {
		cb.RecordFailure()
	}

	if !cb.IsOpen() {
		t.Error("circuit should be open after failures")
	}
}

func TestCircuitBreaker_IsHalfOpen(t *testing.T) {
	cb := NewCircuitBreaker(CircuitBreakerConfig{
		FailureThreshold: 2,
		Timeout:          50 * time.Millisecond,
	})
	defer cb.Close()

	// Trip the circuit
	cb.RecordFailure()
	cb.RecordFailure()

	if cb.IsHalfOpen() {
		t.Error("circuit should be open, not half-open")
	}

	// Wait for reset timeout
	time.Sleep(100 * time.Millisecond)

	// After reset timeout, state transitions to half-open on next Allow()
	cb.Allow()
	if !cb.IsHalfOpen() {
		t.Error("circuit should be half-open after reset timeout")
	}
}

func TestCircuitBreaker_HalfOpenConcurrentLimit(t *testing.T) {
	cb := NewCircuitBreaker(CircuitBreakerConfig{
		FailureThreshold: 1,
		Timeout:          50 * time.Millisecond,
	})
	defer cb.Close()

	// Trip the circuit
	cb.RecordFailure()
	if cb.State() != StateOpen {
		t.Fatal("circuit should be open")
	}

	// Wait for reset timeout
	time.Sleep(100 * time.Millisecond)

	// First Allow() should transition to half-open and succeed
	if !cb.Allow() {
		t.Error("first Allow() in half-open should succeed")
	}

	// Second Allow() while one request is in-flight should be rejected
	// (half-open only allows 1 concurrent request)
	if cb.Allow() {
		t.Error("second Allow() in half-open should be rejected (concurrent limit)")
	}
}

func TestCircuitBreaker_TransitionToSameState(t *testing.T) {
	cb := NewCircuitBreaker(CircuitBreakerConfig{
		FailureThreshold: 1,
		Timeout:          50 * time.Millisecond,
	})
	defer cb.Close()

	// Set up callback
	callbackCalled := false
	cb.OnStateChange(func(from, to CircuitState) {
		callbackCalled = true
	})

	// Transitioning to the same state should not trigger callback
	// The circuit starts in StateClosed, so we try to set it to StateClosed again
	// This is tricky since transitionTo is not exposed directly
	// We can test by calling Allow() when already closed (no transition)
	// or by checking that consecutive RecordSuccess doesn't trigger multiple callbacks

	// Allow() in closed state should succeed without state change
	if !cb.Allow() {
		t.Error("Allow() should succeed in closed state")
	}

	// RecordSuccess in closed state should not trigger state change
	cb.RecordSuccess()

	// Callback should not have been called (no state change)
	if callbackCalled {
		t.Error("callback should not be called for same-state transition")
	}
}

func TestCircuitBreaker_TransitionToClosed(t *testing.T) {
	cb := NewCircuitBreaker(CircuitBreakerConfig{
		FailureThreshold: 2,
		SuccessThreshold: 2,
		Timeout:          50 * time.Millisecond,
	})

	// Record failures to open the circuit
	cb.RecordFailure()
	cb.RecordFailure()
	if cb.State() != StateOpen {
		t.Fatalf("expected open, got %s", cb.State())
	}

	// Wait for timeout to elapse, then call Allow() to trigger half-open transition
	time.Sleep(80 * time.Millisecond)
	if !cb.Allow() {
		t.Fatalf("expected Allow() to succeed and trigger half-open, but was rejected")
	}
	if cb.State() != StateHalfOpen {
		t.Fatalf("expected half-open after Allow(), got %s", cb.State())
	}

	// Record successes to close the circuit
	cb.RecordSuccess()
	cb.RecordSuccess()
	if cb.State() != StateClosed {
		t.Fatalf("expected closed after successes, got %s", cb.State())
	}
}

func TestCircuitBreaker_HalfOpenToOpenOnFailure(t *testing.T) {
	cb := NewCircuitBreaker(CircuitBreakerConfig{
		FailureThreshold: 1,
		SuccessThreshold: 2,
		Timeout:          50 * time.Millisecond,
	})

	// Open the circuit
	cb.RecordFailure()
	if cb.State() != StateOpen {
		t.Fatalf("expected open, got %s", cb.State())
	}

	// Wait for timeout and call Allow() to enter half-open
	time.Sleep(80 * time.Millisecond)
	if !cb.Allow() {
		t.Fatalf("expected Allow() to trigger half-open")
	}
	if cb.State() != StateHalfOpen {
		t.Fatalf("expected half-open, got %s", cb.State())
	}

	// Failure in half-open should re-open
	cb.RecordFailure()
	if cb.State() != StateOpen {
		t.Fatalf("expected open after half-open failure, got %s", cb.State())
	}
}

func TestCircuitStateString(t *testing.T) {
	tests := []struct {
		state CircuitState
		want  string
	}{
		{StateClosed, "closed"},
		{StateOpen, "open"},
		{StateHalfOpen, "half-open"},
		{CircuitState(99), "unknown"},
		{CircuitState(-1), "unknown"},
	}
	for _, tt := range tests {
		got := tt.state.String()
		if got != tt.want {
			t.Errorf("CircuitState(%d).String() = %q, want %q", tt.state, got, tt.want)
		}
	}
}

func TestCircuitBreaker_StateChangeCallbackHalfOpenToClosed(t *testing.T) {
	cb := NewCircuitBreaker(CircuitBreakerConfig{
		FailureThreshold: 1,
		SuccessThreshold: 2,
		Timeout:          50 * time.Millisecond,
	})
	defer cb.Close()

	var mu sync.Mutex
	var transitions []string
	cb.OnStateChange(func(from, to CircuitState) {
		mu.Lock()
		transitions = append(transitions, fmt.Sprintf("%s->%s", from, to))
		mu.Unlock()
	})

	// Trip the circuit
	cb.RecordFailure()
	if cb.State() != StateOpen {
		t.Fatalf("expected open, got %s", cb.State())
	}

	// Wait for timeout then call Allow() to trigger half-open transition
	time.Sleep(60 * time.Millisecond)
	cb.Allow() // This triggers the open->half-open transition
	if cb.State() != StateHalfOpen {
		t.Fatalf("expected half-open, got %s", cb.State())
	}

	// Record enough successes to close
	cb.RecordSuccess()
	cb.RecordSuccess()
	if cb.State() != StateClosed {
		t.Fatalf("expected closed, got %s", cb.State())
	}

	// Wait for goroutine callbacks to complete
	time.Sleep(100 * time.Millisecond)

	mu.Lock()
	defer mu.Unlock()

	// Should have seen all three transitions (order may vary due to goroutine scheduling)
	expected := map[string]bool{
		"closed->open":      false,
		"open->half-open":   false,
		"half-open->closed": false,
	}

	if len(transitions) != len(expected) {
		t.Fatalf("expected %d transitions, got %d: %v", len(expected), len(transitions), transitions)
	}

	for _, tr := range transitions {
		if _, ok := expected[tr]; !ok {
			t.Errorf("unexpected transition: %q", tr)
		}
		expected[tr] = true
	}

	for tr, found := range expected {
		if !found {
			t.Errorf("missing transition: %q", tr)
		}
	}
}
