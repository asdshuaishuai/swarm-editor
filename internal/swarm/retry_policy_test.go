package swarm

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestClassifiedError(t *testing.T) {
	innerErr := errors.New("inner error")
	classified := ClassifyError(innerErr, ErrorTypeRetryable)

	if classified.Error() != "inner error" {
		t.Errorf("Error() = %q, want %q", classified.Error(), "inner error")
	}

	if !classified.IsRetryable() {
		t.Error("IsRetryable() = false for ErrorTypeRetryable")
	}

	if errors.Unwrap(classified) != innerErr {
		t.Error("Unwrap() did not return inner error")
	}

	// Test non-retryable
	nonRetryable := ClassifyError(innerErr, ErrorTypeNonRetryable)
	if nonRetryable.IsRetryable() {
		t.Error("IsRetryable() = true for ErrorTypeNonRetryable")
	}

	// Test timeout (should be retryable)
	timeout := ClassifyError(innerErr, ErrorTypeTimeout)
	if !timeout.IsRetryable() {
		t.Error("IsRetryable() = false for ErrorTypeTimeout")
	}

	// Test cancelled (should not be retryable)
	cancelled := ClassifyError(innerErr, ErrorTypeCancelled)
	if cancelled.IsRetryable() {
		t.Error("IsRetryable() = true for ErrorTypeCancelled")
	}
}

func TestDefaultRetryPolicy(t *testing.T) {
	policy := DefaultRetryPolicy()

	if policy.InitialInterval != time.Second {
		t.Errorf("InitialInterval = %v, want %v", policy.InitialInterval, time.Second)
	}

	if policy.BackoffCoefficient != 2.0 {
		t.Errorf("BackoffCoefficient = %v, want 2.0", policy.BackoffCoefficient)
	}

	if policy.MaximumInterval != time.Minute {
		t.Errorf("MaximumInterval = %v, want %v", policy.MaximumInterval, time.Minute)
	}

	if policy.MaximumAttempts != 5 {
		t.Errorf("MaximumAttempts = %v, want 5", policy.MaximumAttempts)
	}

	if len(policy.NonRetryableErrorTypes) != 2 {
		t.Errorf("NonRetryableErrorTypes length = %v, want 2", len(policy.NonRetryableErrorTypes))
	}
}

func TestRetryPolicyGetNextDelay(t *testing.T) {
	policy := RetryPolicy{
		InitialInterval:    time.Second,
		BackoffCoefficient: 2.0,
		MaximumInterval:    time.Minute,
	}

	// Attempt 0 or negative should return 0
	if delay := policy.GetNextDelay(0); delay != 0 {
		t.Errorf("GetNextDelay(0) = %v, want 0", delay)
	}
	if delay := policy.GetNextDelay(-1); delay != 0 {
		t.Errorf("GetNextDelay(-1) = %v, want 0", delay)
	}

	// Attempt 1: should be around InitialInterval (with jitter)
	delay1 := policy.GetNextDelay(1)
	if delay1 < time.Second || delay1 > 2*time.Second {
		t.Errorf("GetNextDelay(1) = %v, expected around 1s", delay1)
	}

	// Attempt 2: should be around 2s (with jitter)
	delay2 := policy.GetNextDelay(2)
	if delay2 < time.Second || delay2 > 4*time.Second {
		t.Errorf("GetNextDelay(2) = %v, expected between 1s and 4s", delay2)
	}

	// Attempt 3: should be around 4s (with jitter)
	delay3 := policy.GetNextDelay(3)
	if delay3 < time.Second || delay3 > 8*time.Second {
		t.Errorf("GetNextDelay(3) = %v, expected between 1s and 8s", delay3)
	}
}

func TestRetryPolicyGetNextDelayCapsAtMaximum(t *testing.T) {
	policy := RetryPolicy{
		InitialInterval:    time.Second,
		BackoffCoefficient: 10.0, // Large coefficient to hit max quickly
		MaximumInterval:    5 * time.Second,
	}

	// Even with large attempt number, should cap at MaximumInterval
	delay := policy.GetNextDelay(10)
	if delay > policy.MaximumInterval {
		t.Errorf("GetNextDelay(10) = %v, exceeds MaximumInterval %v", delay, policy.MaximumInterval)
	}
}

func TestRetryPolicyShouldRetry(t *testing.T) {
	policy := DefaultRetryPolicy()

	// Under max attempts, unknown error should be retryable
	if !policy.ShouldRetry(errors.New("unknown error"), 1) {
		t.Error("ShouldRetry(unknown, 1) = false, want true")
	}

	// At max attempts, should not retry
	if policy.ShouldRetry(errors.New("error"), 5) {
		t.Error("ShouldRetry(any, 5) = true, want false (max attempts)")
	}

	// Non-retryable classified error
	classified := ClassifyError(errors.New("non-retryable"), ErrorTypeNonRetryable)
	if policy.ShouldRetry(classified, 1) {
		t.Error("ShouldRetry(non-retryable, 1) = true, want false")
	}

	// Cancelled error
	cancelled := ClassifyError(errors.New("cancelled"), ErrorTypeCancelled)
	if policy.ShouldRetry(cancelled, 1) {
		t.Error("ShouldRetry(cancelled, 1) = true, want false")
	}

	// Retryable classified error
	retryable := ClassifyError(errors.New("retryable"), ErrorTypeRetryable)
	if !policy.ShouldRetry(retryable, 1) {
		t.Error("ShouldRetry(retryable, 1) = false, want true")
	}

	// Timeout error (retryable)
	timeout := ClassifyError(errors.New("timeout"), ErrorTypeTimeout)
	if !policy.ShouldRetry(timeout, 1) {
		t.Error("ShouldRetry(timeout, 1) = false, want true")
	}
}

func TestRetryPolicyShouldRetryUnlimitedAttempts(t *testing.T) {
	policy := RetryPolicy{
		InitialInterval:        time.Second,
		BackoffCoefficient:     2.0,
		MaximumInterval:        time.Minute,
		MaximumAttempts:        0, // Unlimited
		NonRetryableErrorTypes: []ErrorType{ErrorTypeNonRetryable},
	}

	// With unlimited attempts, should always retry (unless non-retryable)
	if !policy.ShouldRetry(errors.New("error"), 100) {
		t.Error("ShouldRetry with MaximumAttempts=0 should allow high attempt counts")
	}
}

func TestRetryExecutorSuccess(t *testing.T) {
	policy := DefaultRetryPolicy()
	executor := NewRetryExecutor(policy)

	callCount := 0
	err := executor.Execute(context.Background(), func(ctx context.Context) error {
		callCount++
		if callCount < 3 {
			return ClassifyError(errors.New("transient"), ErrorTypeRetryable)
		}
		return nil
	})

	if err != nil {
		t.Errorf("Execute() = %v, want nil", err)
	}
	if callCount != 3 {
		t.Errorf("callCount = %d, want 3", callCount)
	}
}

func TestRetryExecutorMaxAttempts(t *testing.T) {
	policy := RetryPolicy{
		InitialInterval:        time.Millisecond,
		BackoffCoefficient:     1.0,
		MaximumInterval:        time.Millisecond,
		MaximumAttempts:        3,
		NonRetryableErrorTypes: []ErrorType{ErrorTypeNonRetryable},
	}
	executor := NewRetryExecutor(policy)

	callCount := 0
	err := executor.Execute(context.Background(), func(ctx context.Context) error {
		callCount++
		return ClassifyError(errors.New("always fails"), ErrorTypeRetryable)
	})

	if err == nil {
		t.Error("Execute() = nil, want error after max attempts")
	}
	if callCount != 3 {
		t.Errorf("callCount = %d, want 3", callCount)
	}
}

func TestRetryExecutorNonRetryable(t *testing.T) {
	policy := DefaultRetryPolicy()
	executor := NewRetryExecutor(policy)

	callCount := 0
	err := executor.Execute(context.Background(), func(ctx context.Context) error {
		callCount++
		return ClassifyError(errors.New("permanent"), ErrorTypeNonRetryable)
	})

	if err == nil {
		t.Error("Execute() = nil, want error")
	}
	if callCount != 1 {
		t.Errorf("callCount = %d, want 1 (no retry for non-retryable)", callCount)
	}
}

func TestRetryExecutorContextCancellation(t *testing.T) {
	policy := RetryPolicy{
		InitialInterval:        time.Hour, // Long delay to test cancellation
		BackoffCoefficient:     1.0,
		MaximumInterval:        time.Hour,
		MaximumAttempts:        100,
		NonRetryableErrorTypes: []ErrorType{},
	}
	executor := NewRetryExecutor(policy)

	ctx, cancel := context.WithCancel(context.Background())

	// Cancel after first call
	go func() {
		time.Sleep(50 * time.Millisecond)
		cancel()
	}()

	callCount := 0
	err := executor.Execute(ctx, func(ctx context.Context) error {
		callCount++
		return ClassifyError(errors.New("fail"), ErrorTypeRetryable)
	})

	// Should return ClassifiedError with type Cancelled wrapping the original error
	if err == nil {
		t.Fatal("Execute() = nil, want error")
	}

	var classified *ClassifiedError
	if !errors.As(err, &classified) {
		t.Errorf("Execute() = %v, want ClassifiedError", err)
	} else {
		if classified.Type != ErrorTypeCancelled {
			t.Errorf("classified.Type = %v, want ErrorTypeCancelled", classified.Type)
		}
		if classified.Inner == nil {
			t.Error("classified.Inner = nil, want wrapped error")
		}
	}

	if callCount != 1 {
		t.Errorf("callCount = %d, want 1", callCount)
	}
}

func TestRetryExecutorReturnsLastError(t *testing.T) {
	policy := RetryPolicy{
		InitialInterval:        time.Millisecond,
		BackoffCoefficient:     1.0,
		MaximumInterval:        time.Millisecond,
		MaximumAttempts:        2,
		NonRetryableErrorTypes: []ErrorType{},
	}
	executor := NewRetryExecutor(policy)

	expectedErr := errors.New("final error")
	callCount := 0
	err := executor.Execute(context.Background(), func(ctx context.Context) error {
		callCount++
		if callCount == 2 {
			return ClassifyError(expectedErr, ErrorTypeRetryable)
		}
		return ClassifyError(errors.New("first error"), ErrorTypeRetryable)
	})

	if err == nil {
		t.Error("Execute() = nil, want error")
	}
	// The inner error should be accessible via Unwrap
	if !errors.Is(errors.Unwrap(err), expectedErr) && err.Error() != expectedErr.Error() {
		t.Errorf("Execute() error = %v, want to contain %v", err, expectedErr)
	}
}

func TestGetNodeRetryPolicy(t *testing.T) {
	t.Run("nil node", func(t *testing.T) {
		if p := GetNodeRetryPolicy(nil); p != nil {
			t.Error("expected nil for nil node")
		}
	})

	t.Run("nil config", func(t *testing.T) {
		node := &WorkflowNode{Config: nil}
		if p := GetNodeRetryPolicy(node); p != nil {
			t.Error("expected nil for nil config")
		}
	})

	t.Run("no retryPolicy key", func(t *testing.T) {
		node := &WorkflowNode{Config: map[string]any{"other": "value"}}
		if p := GetNodeRetryPolicy(node); p != nil {
			t.Error("expected nil when no retryPolicy key")
		}
	})

	t.Run("invalid retryPolicy type", func(t *testing.T) {
		node := &WorkflowNode{Config: map[string]any{"retryPolicy": "string"}}
		if p := GetNodeRetryPolicy(node); p != nil {
			t.Error("expected nil for non-map retryPolicy")
		}
	})

	t.Run("full config", func(t *testing.T) {
		node := &WorkflowNode{
			Config: map[string]any{
				"retryPolicy": map[string]any{
					"maximumAttempts":    10,
					"initialInterval":    "2s",
					"backoffCoefficient": 3.0,
					"maximumInterval":    "60s",
					"nonRetryableErrorTypes": []any{
						"cancelled",
					},
				},
			},
		}
		p := GetNodeRetryPolicy(node)
		if p == nil {
			t.Fatal("expected non-nil policy")
		}
		if p.MaximumAttempts != 10 {
			t.Errorf("MaximumAttempts = %d, want 10", p.MaximumAttempts)
		}
		if p.InitialInterval != 2*time.Second {
			t.Errorf("InitialInterval = %v, want 2s", p.InitialInterval)
		}
		if p.BackoffCoefficient != 3.0 {
			t.Errorf("BackoffCoefficient = %f, want 3.0", p.BackoffCoefficient)
		}
		if p.MaximumInterval != 60*time.Second {
			t.Errorf("MaximumInterval = %v, want 60s", p.MaximumInterval)
		}
		if len(p.NonRetryableErrorTypes) != 1 || p.NonRetryableErrorTypes[0] != ErrorTypeCancelled {
			t.Errorf("NonRetryableErrorTypes = %v, want [cancelled]", p.NonRetryableErrorTypes)
		}
	})

	t.Run("partial config uses defaults", func(t *testing.T) {
		node := &WorkflowNode{
			Config: map[string]any{
				"retryPolicy": map[string]any{
					"maximumAttempts": 3,
				},
			},
		}
		p := GetNodeRetryPolicy(node)
		if p == nil {
			t.Fatal("expected non-nil policy")
		}
		if p.MaximumAttempts != 3 {
			t.Errorf("MaximumAttempts = %d, want 3", p.MaximumAttempts)
		}
		// Should use DefaultRetryPolicy values for unset fields
		if p.InitialInterval != DefaultRetryPolicy().InitialInterval {
			t.Errorf("InitialInterval = %v, want default %v", p.InitialInterval, DefaultRetryPolicy().InitialInterval)
		}
	})

	t.Run("invalid duration string ignored", func(t *testing.T) {
		node := &WorkflowNode{
			Config: map[string]any{
				"retryPolicy": map[string]any{
					"initialInterval": "not-a-duration",
				},
			},
		}
		p := GetNodeRetryPolicy(node)
		if p == nil {
			t.Fatal("expected non-nil policy")
		}
		// Invalid duration should fall back to default
		if p.InitialInterval != DefaultRetryPolicy().InitialInterval {
			t.Errorf("InitialInterval = %v, want default (invalid duration should be ignored)", p.InitialInterval)
		}
	})
}
