package swarm

import (
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
