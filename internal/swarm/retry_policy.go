// Package swarm provides multi-agent coordination
package swarm

import (
	"context"
	"errors"
	"fmt"
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
	if e.Inner == nil {
		return fmt.Sprintf("classified error: type=%d", e.Type)
	}
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

// GetNodeRetryPolicy extracts a per-node RetryPolicy from node Config.
// Inspired by Temporal's per-activity retry policies.
// Returns nil if no retry policy is configured (use workflow default).
//
// Config format (JSON):
//
//	"retryPolicy": {
//	  "maximumAttempts": 3,
//	  "initialInterval": "1s",
//	  "backoffCoefficient": 2.0,
//	  "maximumInterval": "30s"
//	}
func GetNodeRetryPolicy(node *WorkflowNode) *RetryPolicy {
	if node == nil || node.Config == nil {
		return nil
	}
	raw, ok := node.Config["retryPolicy"]
	if !ok {
		return nil
	}

	// Support map[string]any (from JSON unmarshal)
	m, ok := raw.(map[string]any)
	if !ok {
		return nil
	}

	policy := DefaultRetryPolicy()

	// maximumAttempts can be float64 (JSON) or int (programmatic)
	if v, ok := m["maximumAttempts"].(float64); ok && v > 0 {
		policy.MaximumAttempts = int(v)
	} else if v, ok := m["maximumAttempts"].(int); ok && v > 0 {
		policy.MaximumAttempts = v
	}
	if v, ok := m["initialInterval"].(string); ok {
		if d, err := time.ParseDuration(v); err == nil && d > 0 {
			policy.InitialInterval = d
		}
	}
	// backoffCoefficient can be float64 (JSON) or int (programmatic)
	if v, ok := m["backoffCoefficient"].(float64); ok && v > 0 {
		policy.BackoffCoefficient = v
	} else if v, ok := m["backoffCoefficient"].(int); ok && v > 0 {
		policy.BackoffCoefficient = float64(v)
	}
	if v, ok := m["maximumInterval"].(string); ok {
		if d, err := time.ParseDuration(v); err == nil && d > 0 {
			policy.MaximumInterval = d
		}
	}
	// Parse nonRetryableErrorTypes: ["non_retryable", "cancelled"]
	if types, ok := m["nonRetryableErrorTypes"].([]any); ok {
		errorTypeMap := map[string]ErrorType{
			"retryable":     ErrorTypeRetryable,
			"non_retryable": ErrorTypeNonRetryable,
			"timeout":       ErrorTypeTimeout,
			"cancelled":     ErrorTypeCancelled,
		}
		var nonRetryable []ErrorType
		for _, t := range types {
			if s, ok := t.(string); ok {
				if et, found := errorTypeMap[s]; found {
					nonRetryable = append(nonRetryable, et)
				}
			}
		}
		if len(nonRetryable) > 0 {
			policy.NonRetryableErrorTypes = nonRetryable
		}
	}

	return &policy
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
