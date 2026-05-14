// Package swarm provides circuit breaker pattern for agent health management.
// Inspired by Hystrix's three-state circuit breaker model.
package swarm

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/log"
)

var circuitBreakerLog = log.With("component", "CircuitBreaker")

// CircuitState represents the state of a circuit breaker
type CircuitState int32

const (
	// StateClosed means requests flow normally
	StateClosed CircuitState = iota
	// StateOpen means requests are rejected immediately
	StateOpen
	// StateHalfOpen means limited requests are allowed to test recovery
	StateHalfOpen
)

func (s CircuitState) String() string {
	switch s {
	case StateClosed:
		return "closed"
	case StateOpen:
		return "open"
	case StateHalfOpen:
		return "half-open"
	default:
		return "unknown"
	}
}

// CircuitBreakerConfig holds circuit breaker configuration
type CircuitBreakerConfig struct {
	// FailureThreshold is the number of consecutive failures to trip the circuit
	FailureThreshold int `json:"failureThreshold"`

	// SuccessThreshold is the number of consecutive successes in half-open to close
	SuccessThreshold int `json:"successThreshold"`

	// Timeout is how long the circuit stays open before transitioning to half-open
	Timeout time.Duration `json:"timeout"`

	// MaxConcurrent is the maximum concurrent requests allowed (0 = unlimited)
	MaxConcurrent int `json:"maxConcurrent"`
}

// DefaultCircuitBreakerConfig returns sensible defaults
func DefaultCircuitBreakerConfig() CircuitBreakerConfig {
	return CircuitBreakerConfig{
		FailureThreshold: 5,
		SuccessThreshold: 3,
		Timeout:          30 * time.Second,
		MaxConcurrent:    10,
	}
}

// CircuitBreaker implements the circuit breaker pattern
type CircuitBreaker struct {
	config CircuitBreakerConfig

	// State (atomic for lock-free reads)
	state atomic.Int32

	// Counters (protected by mutex)
	mu               sync.Mutex
	consecutiveFails int
	consecutiveOk    int
	lastFailureTime  time.Time
	lastStateChange  time.Time
	totalRequests    int64
	totalFailures    int64
	totalSuccesses   int64
	totalRejections  int64
	concurrentCount  int

	// Callbacks
	onStateChange func(from, to CircuitState)

	// Lifecycle
	ctx    context.Context
	cancel context.CancelFunc
}

// NewCircuitBreaker creates a new circuit breaker
func NewCircuitBreaker(config CircuitBreakerConfig) *CircuitBreaker {
	cb := &CircuitBreaker{
		config:          config,
		lastStateChange: time.Now(),
	}
	cb.state.Store(int32(StateClosed))
	ctx, cancel := context.WithCancel(context.Background())
	cb.ctx = ctx
	cb.cancel = cancel
	return cb
}

// State returns the current circuit state
func (cb *CircuitBreaker) State() CircuitState {
	return CircuitState(cb.state.Load())
}

// Allow checks if a request should be allowed
// Returns true if the request can proceed, false if it should be rejected
func (cb *CircuitBreaker) Allow() bool {
	currentState := cb.State()

	switch currentState {
	case StateClosed:
		// Check concurrent limit
		if cb.config.MaxConcurrent > 0 {
			cb.mu.Lock()
			if cb.concurrentCount >= cb.config.MaxConcurrent {
				cb.mu.Unlock()
				cb.recordRejection()
				return false
			}
			cb.concurrentCount++
			cb.mu.Unlock()
		}
		return true

	case StateOpen:
		// Check if timeout has elapsed — hold lock across transition and allow check
		cb.mu.Lock()
		elapsed := time.Since(cb.lastFailureTime)
		if elapsed >= cb.config.Timeout {
			// Transition to half-open atomically (prevent concurrent Allow() from both entering half-open)
			cb.state.Store(int32(StateHalfOpen))
			cb.lastStateChange = time.Now()
			cb.consecutiveOk = 0
			onStateChange := cb.onStateChange
			cb.mu.Unlock()

			circuitBreakerLog.Info("State transition: open -> half-open")
			if onStateChange != nil {
				go onStateChange(StateOpen, StateHalfOpen)
			}
			return cb.allowInHalfOpen()
		}
		cb.mu.Unlock()

		cb.recordRejection()
		return false

	case StateHalfOpen:
		return cb.allowInHalfOpen()

	default:
		return false
	}
}

// allowInHalfOpen handles requests in half-open state
func (cb *CircuitBreaker) allowInHalfOpen() bool {
	// In half-open, we allow limited requests
	cb.mu.Lock()
	if cb.concurrentCount >= 1 { // Only 1 request at a time in half-open
		cb.mu.Unlock()
		cb.recordRejection()
		return false
	}
	cb.concurrentCount++
	cb.mu.Unlock()
	return true
}

// RecordSuccess records a successful request
func (cb *CircuitBreaker) RecordSuccess() {
	cb.mu.Lock()
	cb.concurrentCount--
	if cb.concurrentCount < 0 {
		cb.concurrentCount = 0
	}
	cb.consecutiveFails = 0
	cb.consecutiveOk++
	cb.totalRequests++
	cb.totalSuccesses++

	// Check state transition while still holding lock (CRITICAL FIX)
	// Inline transition logic to avoid TOCTOU race
	shouldClose := cb.state.Load() == int32(StateHalfOpen) && cb.consecutiveOk >= cb.config.SuccessThreshold
	var onStateChange func(from, to CircuitState)
	if shouldClose {
		oldState := CircuitState(cb.state.Swap(int32(StateClosed)))
		cb.lastStateChange = time.Now()
		cb.consecutiveFails = 0
		cb.consecutiveOk = 0
		onStateChange = cb.onStateChange
		cb.mu.Unlock()

		circuitBreakerLog.Info("State transition", "from", oldState, "to", StateClosed)
		if onStateChange != nil {
			go onStateChange(oldState, StateClosed)
		}
		return
	}
	cb.mu.Unlock()
}

// RecordFailure records a failed request
func (cb *CircuitBreaker) RecordFailure() {
	cb.mu.Lock()
	cb.concurrentCount--
	if cb.concurrentCount < 0 {
		cb.concurrentCount = 0
	}
	cb.consecutiveFails++
	cb.consecutiveOk = 0
	cb.totalRequests++
	cb.totalFailures++
	cb.lastFailureTime = time.Now()

	// Check state transition while still holding lock (CRITICAL FIX)
	// Inline transition logic to avoid TOCTOU race
	currentState := CircuitState(cb.state.Load())
	var shouldOpen bool
	if currentState == StateClosed && cb.consecutiveFails >= cb.config.FailureThreshold {
		shouldOpen = true
	} else if currentState == StateHalfOpen {
		// Any failure in half-open reopens the circuit
		shouldOpen = true
	}

	var onStateChange func(from, to CircuitState)
	if shouldOpen {
		oldState := CircuitState(cb.state.Swap(int32(StateOpen)))
		cb.lastStateChange = time.Now()
		onStateChange = cb.onStateChange
		cb.mu.Unlock()

		circuitBreakerLog.Info("State transition", "from", oldState, "to", StateOpen)
		if onStateChange != nil {
			go onStateChange(oldState, StateOpen)
		}
		return
	}
	cb.mu.Unlock()
}

// recordRejection records a rejected request
func (cb *CircuitBreaker) recordRejection() {
	cb.mu.Lock()
	cb.totalRejections++
	cb.mu.Unlock()
}

// transitionTo changes the circuit state
func (cb *CircuitBreaker) transitionTo(newState CircuitState) {
	oldState := CircuitState(cb.state.Swap(int32(newState)))

	if oldState != newState {
		cb.mu.Lock()
		cb.lastStateChange = time.Now()
		if newState == StateClosed {
			cb.consecutiveFails = 0
			cb.consecutiveOk = 0
		} else if newState == StateHalfOpen {
			cb.consecutiveOk = 0
		}
		onStateChange := cb.onStateChange
		cb.mu.Unlock()

		circuitBreakerLog.Info("State transition", "from", oldState, "to", newState)

		if onStateChange != nil {
			onStateChange(oldState, newState)
		}
	}
}

// OnStateChange sets the callback for state changes
func (cb *CircuitBreaker) OnStateChange(fn func(from, to CircuitState)) {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	cb.onStateChange = fn
}

// Stats returns circuit breaker statistics
type CircuitBreakerStats struct {
	State            CircuitState `json:"state"`
	ConsecutiveFails int          `json:"consecutiveFails"`
	ConsecutiveOk    int          `json:"consecutiveOk"`
	TotalRequests    int64        `json:"totalRequests"`
	TotalFailures    int64        `json:"totalFailures"`
	TotalSuccesses   int64        `json:"totalSuccesses"`
	TotalRejections  int64        `json:"totalRejections"`
	LastFailureTime  time.Time    `json:"lastFailureTime"`
	LastStateChange  time.Time    `json:"lastStateChange"`
}

// GetStats returns current circuit breaker statistics
func (cb *CircuitBreaker) GetStats() CircuitBreakerStats {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	return CircuitBreakerStats{
		State:            cb.State(),
		ConsecutiveFails: cb.consecutiveFails,
		ConsecutiveOk:    cb.consecutiveOk,
		TotalRequests:    cb.totalRequests,
		TotalFailures:    cb.totalFailures,
		TotalSuccesses:   cb.totalSuccesses,
		TotalRejections:  cb.totalRejections,
		LastFailureTime:  cb.lastFailureTime,
		LastStateChange:  cb.lastStateChange,
	}
}

// Reset resets the circuit breaker to closed state
func (cb *CircuitBreaker) Reset() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	cb.consecutiveFails = 0
	cb.consecutiveOk = 0
	cb.concurrentCount = 0

	// Inline state transition to avoid TOCTOU race
	oldState := CircuitState(cb.state.Swap(int32(StateClosed)))
	if oldState != StateClosed {
		cb.lastStateChange = time.Now()
		circuitBreakerLog.Info("State transition (reset)", "from", oldState, "to", StateClosed)
		if cb.onStateChange != nil {
			go cb.onStateChange(oldState, StateClosed)
		}
	}
}

// Close stops the circuit breaker
func (cb *CircuitBreaker) Close() {
	if cb.cancel != nil {
		cb.cancel()
	}
}

// ForceOpen forces the circuit to open (for testing or manual intervention)
func (cb *CircuitBreaker) ForceOpen() {
	cb.mu.Lock()
	cb.lastFailureTime = time.Now()
	cb.mu.Unlock()
	cb.transitionTo(StateOpen)
}

// ForceClose forces the circuit to close (for testing or manual intervention)
func (cb *CircuitBreaker) ForceClose() {
	cb.Reset()
}

// IsHealthy returns true if the circuit is closed (healthy)
func (cb *CircuitBreaker) IsHealthy() bool {
	return cb.State() == StateClosed
}

// IsOpen returns true if the circuit is open (rejecting requests)
func (cb *CircuitBreaker) IsOpen() bool {
	return cb.State() == StateOpen
}

// IsHalfOpen returns true if the circuit is half-open (testing recovery)
func (cb *CircuitBreaker) IsHalfOpen() bool {
	return cb.State() == StateHalfOpen
}
