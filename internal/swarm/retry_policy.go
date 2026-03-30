// Package swarm provides multi-agent coordination
package swarm

import (
	"context"
	"errors"
	"math/rand/v2"
	"slices"
	"time"
)

// ErrorType classifies errors for retry decisions (Temporal-inspired)
type ErrorType int

const (
	// ErrorTypeRetryable indicates transient failures that should be retried
	ErrorTypeRetryable ErrorType = iota
	// ErrorTypeNonRetryable indicates permanent failures that should not be retried
	ErrorTypeNonRetryable
	// ErrorTypeTimeout indicates a timeout that may be retryable with longer timeout
	ErrorTypeTimeout
	// ErrorTypeCancelled indicates user-initiated cancellation
	ErrorTypeCancelled
)

// ClassifiedError wraps an error with retry metadata
type ClassifiedError struct {
	Type       ErrorType
	Inner      error
	RetryAfter time.Duration // Hint for when to retry (0 = use policy)
}

func (e *ClassifiedError) Error() string {
	return e.Inner.Error()
}

func (e *ClassifiedError) Unwrap() error {
	return e.Inner
}

// IsRetryable returns true if the error should be retried
func (e *ClassifiedError) IsRetryable() bool {
	return e.Type == ErrorTypeRetryable || e.Type == ErrorTypeTimeout
}

// ClassifyError creates a classified error
func ClassifyError(err error, errorType ErrorType) *ClassifiedError {
	return &ClassifiedError{Inner: err, Type: errorType}
}

// RetryPolicy defines Temporal-style retry behavior
type RetryPolicy struct {
	// InitialInterval is the first retry delay
	InitialInterval time.Duration `json:"initialInterval"`
	// BackoffCoefficient multiplies the interval on each retry (default 2.0)
	BackoffCoefficient float64 `json:"backoffCoefficient"`
	// MaximumInterval caps the backoff (default 100x InitialInterval)
	MaximumInterval time.Duration `json:"maximumInterval"`
	// MaximumAttempts limits total attempts (0 = unlimited)
	MaximumAttempts int `json:"maximumAttempts"`
	// NonRetryableErrorTypes lists error types that should never be retried
	NonRetryableErrorTypes []ErrorType `json:"nonRetryableErrorTypes"`
}

// DefaultRetryPolicy returns Temporal-style defaults
func DefaultRetryPolicy() RetryPolicy {
	return RetryPolicy{
		InitialInterval:        time.Second,
		BackoffCoefficient:     2.0,
		MaximumInterval:        time.Minute,
		MaximumAttempts:        5,
		NonRetryableErrorTypes: []ErrorType{ErrorTypeNonRetryable, ErrorTypeCancelled},
	}
}

// GetNextDelay calculates the next retry delay with exponential backoff + jitter
// Uses "decorrelated jitter" algorithm for better distribution
func (p RetryPolicy) GetNextDelay(attempt int) time.Duration {
	if attempt <= 0 {
		return 0
	}

	// Calculate exponential backoff: InitialInterval * Coefficient^(attempt-1)
	delay := float64(p.InitialInterval)
	for i := 1; i < attempt; i++ {
		delay *= p.BackoffCoefficient
		if delay > float64(p.MaximumInterval) {
			delay = float64(p.MaximumInterval)
			break
		}
	}

	// Add jitter: random value between InitialInterval and delay
	// This prevents thundering herd when multiple tasks fail simultaneously
	if delay > float64(p.InitialInterval) {
		jitter := rand.Float64() * (delay - float64(p.InitialInterval))
		delay = float64(p.InitialInterval) + jitter
	}

	return time.Duration(delay)
}

// ShouldRetry determines if an error should be retried based on policy
func (p RetryPolicy) ShouldRetry(err error, attempt int) bool {
	// Check attempt limit
	if p.MaximumAttempts > 0 && attempt >= p.MaximumAttempts {
		return false
	}

	// Check error classification
	var classified *ClassifiedError
	if errors.As(err, &classified) {
		if slices.Contains(p.NonRetryableErrorTypes, classified.Type) {
			return false
		}
		return classified.IsRetryable()
	}

	// Unknown errors are retryable by default (fail-safe)
	return true
}

// RetryExecutor executes operations with retry policy
type RetryExecutor struct {
	policy RetryPolicy
}

// NewRetryExecutor creates a new retry executor
func NewRetryExecutor(policy RetryPolicy) *RetryExecutor {
	return &RetryExecutor{policy: policy}
}

// Execute runs fn with retry policy applied
func (e *RetryExecutor) Execute(ctx context.Context, fn func(ctx context.Context) error) error {
	var lastErr error
	attempt := 0

	for {
		attempt++
		err := fn(ctx)
		if err == nil {
			return nil
		}

		if !e.policy.ShouldRetry(err, attempt) {
			return err
		}

		lastErr = err
		delay := e.policy.GetNextDelay(attempt)

		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			// Return last error wrapped as cancelled (preserves error history)
			return &ClassifiedError{Type: ErrorTypeCancelled, Inner: lastErr}
		case <-timer.C:
			// Continue to next attempt
		}
	}
}
