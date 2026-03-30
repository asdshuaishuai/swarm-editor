package swarm

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestNewResultValidator_DefaultRules(t *testing.T) {
	v := NewResultValidator()

	if v == nil {
		t.Fatal("NewResultValidator returned nil")
	}
	if len(v.rules) != 3 {
		t.Errorf("expected 3 default rules, got %d", len(v.rules))
	}
	if v.maxContentLength != 1<<20 {
		t.Errorf("expected default max content length 1MB, got %d", v.maxContentLength)
	}
}

func TestResultValidator_Validate_NilResult(t *testing.T) {
	v := NewResultValidator()
	result := v.Validate(nil)

	if result.Valid {
		t.Error("nil result should be invalid")
	}
	if result.Severity != "error" {
		t.Errorf("expected severity 'error', got %q", result.Severity)
	}
}

func TestResultValidator_Validate_ValidResult(t *testing.T) {
	v := NewResultValidator()
	result := v.Validate(&TaskResult{
		TaskID:      "task_1",
		Content:     "some valid content",
		StartedAt:   time.Now().Add(-5 * time.Second),
		CompletedAt: time.Now(),
		Duration:    5 * time.Second,
	})

	if !result.Valid {
		t.Errorf("valid result should pass: %s", result.Reason)
	}
}

func TestResultValidator_Validate_WithError(t *testing.T) {
	v := NewResultValidator()
	result := v.Validate(&TaskResult{
		TaskID: "task_1",
		Error:  "something went wrong",
	})

	if result.Valid {
		t.Error("result with error should be invalid")
	}
	if result.Severity != "error" {
		t.Errorf("expected severity 'error', got %q", result.Severity)
	}
}

func TestResultValidator_Validate_BlockedPattern(t *testing.T) {
	v := NewResultValidator()
	result := v.Validate(&TaskResult{
		TaskID:  "task_1",
		Content: "fatal error occurred during processing",
	})

	if result.Valid {
		t.Error("result with blocked pattern should be invalid")
	}
	if result.Severity != "warning" {
		t.Errorf("expected severity 'warning', got %q", result.Severity)
	}
}

func TestResultValidator_Validate_ContentTooLong(t *testing.T) {
	v := NewResultValidator()
	v.SetMaxContentLength(100)

	result := v.Validate(&TaskResult{
		TaskID:  "task_1",
		Content: string(make([]byte, 200)),
	})

	if result.Valid {
		t.Error("result exceeding max content length should be invalid")
	}
	if result.Severity != "warning" {
		t.Errorf("expected severity 'warning', got %q", result.Severity)
	}
}

func TestResultValidator_Validate_ContentWithinLimit(t *testing.T) {
	v := NewResultValidator()
	v.SetMaxContentLength(1000)

	result := v.Validate(&TaskResult{
		TaskID:  "task_1",
		Content: "short content",
	})

	if !result.Valid {
		t.Errorf("content within limit should pass: %s", result.Reason)
	}
}

func TestResultValidator_Validate_SuspiciousDuration(t *testing.T) {
	v := NewResultValidator()
	result := v.Validate(&TaskResult{
		TaskID:   "task_1",
		Content:  "",
		Duration: 50 * time.Millisecond,
	})

	if result.Valid {
		t.Error("result with suspiciously fast duration and empty content should be invalid")
	}
	if result.Severity != "warning" {
		t.Errorf("expected severity 'warning', got %q", result.Severity)
	}
}

func TestResultValidator_Validate_SuspiciousDurationWithContent(t *testing.T) {
	v := NewResultValidator()
	result := v.Validate(&TaskResult{
		TaskID:   "task_1",
		Content:  "completed successfully",
		Duration: 50 * time.Millisecond,
	})

	if !result.Valid {
		t.Errorf("fast duration with content should pass: %s", result.Reason)
	}
}

func TestResultValidator_AddCustomRule(t *testing.T) {
	v := NewResultValidator()
	v.AddRule(ValidationRule{
		Name:        "min_length",
		Description: "Content must be at least 10 chars",
		Validate: func(result *TaskResult) *ValidationResult {
			if len(result.Content) < 10 {
				return &ValidationResult{Valid: false, Reason: "content too short", Severity: "warning"}
			}
			return &ValidationResult{Valid: true}
		},
	})

	// Short content should fail
	result := v.Validate(&TaskResult{Content: "hi"})
	if result.Valid {
		t.Error("short content should fail custom rule")
	}

	// Long content should pass
	result = v.Validate(&TaskResult{Content: "this is long enough"})
	if !result.Valid {
		t.Errorf("long content should pass custom rule: %s", result.Reason)
	}
}

func TestResultValidator_SetBlockedPatterns(t *testing.T) {
	v := NewResultValidator()
	v.SetBlockedPatterns([]string{"custom_block"})

	result := v.Validate(&TaskResult{
		TaskID:  "task_1",
		Content: "this contains custom_block pattern",
	})

	if result.Valid {
		t.Error("custom blocked pattern should trigger")
	}
}

func TestResultValidator_SetOnRequireReview(t *testing.T) {
	v := NewResultValidator()
	v.SetBlockedPatterns([]string{"needs_review"})

	reviewCalled := false
	v.SetOnRequireReview(func(ctx context.Context, taskID string, result *TaskResult, reason string) (bool, error) {
		reviewCalled = true
		return true, nil
	})

	// Content with warning pattern should trigger review
	result, err := v.ValidateWithReview(context.TODO(), "task_1", &TaskResult{
		Content: "this needs_review",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Valid {
		t.Errorf("human-approved result should be valid: %s", result.Reason)
	}
	if !reviewCalled {
		t.Error("human review callback should have been called")
	}
}

func TestResultValidator_ValidateWithReview_ErrorSeverity(t *testing.T) {
	v := NewResultValidator()

	// Error severity should not trigger review even with callback
	reviewCalled := false
	v.SetOnRequireReview(func(ctx context.Context, taskID string, result *TaskResult, reason string) (bool, error) {
		reviewCalled = true
		return true, nil
	})

	result, err := v.ValidateWithReview(context.TODO(), "task_1", &TaskResult{
		Error: "internal failure",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Valid {
		t.Error("error severity should not be approved by human review")
	}
	if reviewCalled {
		t.Error("human review should not be called for error severity")
	}
}

func TestResultValidator_ValidateWithReview_NoCallback(t *testing.T) {
	v := NewResultValidator()
	v.SetBlockedPatterns([]string{"blocked"})

	// Warning without callback should be rejected
	result, err := v.ValidateWithReview(context.TODO(), "task_1", &TaskResult{
		Content: "this is blocked",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Valid {
		t.Error("warning without review callback should be rejected")
	}
}

func TestResultValidator_UnlimitedContentLength(t *testing.T) {
	v := NewResultValidator()
	v.SetMaxContentLength(0) // 0 = unlimited

	// Very large content should pass when unlimited
	largeContent := string(make([]byte, 5<<20)) // 5MB
	result := v.Validate(&TaskResult{
		TaskID:  "task_1",
		Content: largeContent,
	})

	if !result.Valid {
		t.Errorf("unlimited content length should allow large content: %s", result.Reason)
	}
}

func TestResultValidator_TripCounting(t *testing.T) {
	v := NewResultValidator()
	v.SetTripThreshold(3)

	badResult := &TaskResult{
		TaskID:  "task_1",
		Content: "fatal error in output",
		Error:   "",
	}

	// First failure: TripCount should be 1, no triage
	vr1 := v.Validate(badResult)
	if vr1.Valid {
		t.Fatal("Expected validation to fail")
	}
	if vr1.TripCount != 1 {
		t.Errorf("Expected TripCount=1, got %d", vr1.TripCount)
	}
	if vr1.RuleName != "error_check" {
		t.Errorf("Expected RuleName='error_check', got %q", vr1.RuleName)
	}
	if vr1.Triage {
		t.Error("Expected no triage on first failure")
	}

	// Second failure: TripCount should be 2
	vr2 := v.Validate(badResult)
	if vr2.TripCount != 2 {
		t.Errorf("Expected TripCount=2, got %d", vr2.TripCount)
	}
	if vr2.Triage {
		t.Error("Expected no triage on second failure")
	}

	// Third failure: TripCount should be 3, triage forced
	vr3 := v.Validate(badResult)
	if vr3.TripCount != 3 {
		t.Errorf("Expected TripCount=3, got %d", vr3.TripCount)
	}
	if !vr3.Triage {
		t.Error("Expected triage to be forced at threshold")
	}
	if vr3.TriageHint == "" {
		t.Error("Expected triage hint to be set")
	}
}

func TestResultValidator_TripCountResetOnSuccess(t *testing.T) {
	v := NewResultValidator()
	v.SetTripThreshold(3)

	badResult := &TaskResult{TaskID: "task_1", Content: "fatal error"}
	goodResult := &TaskResult{
		TaskID:   "task_1",
		Content:  "valid output",
		Duration: 200 * time.Millisecond,
	}

	// Fail twice
	v.Validate(badResult)
	v.Validate(badResult)

	if v.GetTripCount("error_check") != 2 {
		t.Errorf("Expected trip count 2, got %d", v.GetTripCount("error_check"))
	}

	// Successful validation resets all trips
	vr := v.Validate(goodResult)
	if !vr.Valid {
		t.Errorf("Expected valid, got: %s", vr.Reason)
	}
	if v.GetTripCount("error_check") != 0 {
		t.Errorf("Expected trip count reset to 0, got %d", v.GetTripCount("error_check"))
	}
}

func TestResultValidator_ResetTrips(t *testing.T) {
	v := NewResultValidator()
	badResult := &TaskResult{TaskID: "task_1", Content: "fatal error"}

	v.Validate(badResult)
	v.Validate(badResult)

	v.ResetTrips()

	if v.GetTripCount("error_check") != 0 {
		t.Errorf("Expected trip count 0 after reset, got %d", v.GetTripCount("error_check"))
	}
}

// --- Input Guardrail Chain Tests ---

func TestInputGuardrailChain_DefaultChain(t *testing.T) {
	chain := NewInputGuardrailChain()

	// Valid input should pass
	result, err := chain.Validate(context.TODO(), "hello world", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Action != InputAllow {
		t.Errorf("expected InputAllow, got %s", result.Action)
	}
}

func TestInputGuardrailChain_RejectEmpty(t *testing.T) {
	chain := NewInputGuardrailChain()

	result, err := chain.Validate(context.TODO(), "   ", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Action != InputReject {
		t.Errorf("expected InputReject for empty input, got %s", result.Action)
	}
	if result.RuleName != "empty_input" {
		t.Errorf("expected rule 'empty_input', got %q", result.RuleName)
	}
}

func TestInputGuardrailChain_RejectTooLong(t *testing.T) {
	chain := NewInputGuardrailChain()

	longInput := string(make([]byte, maxInputLength+1))
	result, err := chain.Validate(context.TODO(), longInput, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Action != InputReject {
		t.Errorf("expected InputReject for too long input, got %s", result.Action)
	}
	if result.RuleName != "max_length" {
		t.Errorf("expected rule 'max_length', got %q", result.RuleName)
	}
}

func TestInputGuardrailChain_CustomRewrite(t *testing.T) {
	chain := NewInputGuardrailChain()
	chain.AddGuardrail(InputGuardrail{
		Name:        "trim_prefix",
		Description: "Rewrite to remove prefix",
		Check: func(ctx context.Context, input string, metadata map[string]any) (*InputGuardrailResult, error) {
			return &InputGuardrailResult{
				Action:  InputRewrite,
				Rewrite: "rewritten: " + input,
			}, nil
		},
	})

	result, err := chain.Validate(context.TODO(), "hello", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Action != InputRewrite {
		t.Errorf("expected InputRewrite, got %s", result.Action)
	}
	if result.Rewrite != "rewritten: hello" {
		t.Errorf("expected rewritten content, got %q", result.Rewrite)
	}
}

func TestInputGuardrailChain_ShortCircuitOnReject(t *testing.T) {
	chain := NewInputGuardrailChain()

	called := false
	chain.AddGuardrail(InputGuardrail{
		Name:        "should_not_run",
		Description: "Should not run after reject",
		Check: func(ctx context.Context, input string, metadata map[string]any) (*InputGuardrailResult, error) {
			called = true
			return &InputGuardrailResult{Action: InputAllow}, nil
		},
	})

	// Empty input triggers reject from empty_input guardrail before custom one
	_, _ = chain.Validate(context.TODO(), "", nil)
	if called {
		t.Error("guardrail after reject should not be called")
	}
}

func TestInputGuardrailChain_Triage(t *testing.T) {
	chain := NewInputGuardrailChain()
	chain.AddGuardrail(InputGuardrail{
		Name:        "security_check",
		Description: "Triage dangerous inputs",
		Check: func(ctx context.Context, input string, metadata map[string]any) (*InputGuardrailResult, error) {
			if strings.Contains(input, "delete all") {
				return &InputGuardrailResult{
					Action:   InputTriage,
					TriageTo: "security_review",
					Reason:   "potentially destructive input",
				}, nil
			}
			return &InputGuardrailResult{Action: InputAllow}, nil
		},
	})

	result, err := chain.Validate(context.TODO(), "please delete all files", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Action != InputTriage {
		t.Errorf("expected InputTriage, got %s", result.Action)
	}
	if result.TriageTo != "security_review" {
		t.Errorf("expected triage to 'security_review', got %q", result.TriageTo)
	}
}

// --- ValidateWithRetry Tests ---

func TestValidateWithRetry_PassesImmediately(t *testing.T) {
	v := NewResultValidator()
	result := &TaskResult{Content: "valid output"}

	final, vr, retries := v.ValidateWithRetry(
		context.Background(), result, DefaultGuardrailRetryPolicy(),
		func(r *TaskResult, reason string) (*TaskResult, error) { return nil, nil },
	)

	if !vr.Valid {
		t.Error("expected valid result")
	}
	if retries != 0 {
		t.Errorf("expected 0 retries, got %d", retries)
	}
	if final != result {
		t.Error("expected original result returned")
	}
}

func TestValidateWithRetry_RetriesAndSucceeds(t *testing.T) {
	v := NewResultValidator()
	result := &TaskResult{Content: "bad output", Error: "execution failed"}

	attempt := 0
	retryFn := func(r *TaskResult, reason string) (*TaskResult, error) {
		attempt++
		if attempt >= 2 {
			return &TaskResult{Content: "fixed output"}, nil
		}
		return &TaskResult{Content: "still bad", Error: "still failing"}, nil
	}

	final, vr, retries := v.ValidateWithRetry(
		context.Background(), result, DefaultGuardrailRetryPolicy(), retryFn,
	)

	if !vr.Valid {
		t.Errorf("expected valid after retry, got reason: %s", vr.Reason)
	}
	if retries != 2 {
		t.Errorf("expected 2 retries, got %d", retries)
	}
	if final.Content != "fixed output" {
		t.Errorf("expected 'fixed output', got %q", final.Content)
	}
}

func TestValidateWithRetry_ExhaustsRetries(t *testing.T) {
	v := NewResultValidator()
	result := &TaskResult{Content: "bad output", Error: "always fails"}

	policy := DefaultGuardrailRetryPolicy()
	policy.MaxRetries = 2

	retryFn := func(r *TaskResult, reason string) (*TaskResult, error) {
		return &TaskResult{Content: "still bad", Error: "still failing"}, nil
	}

	_, vr, retries := v.ValidateWithRetry(
		context.Background(), result, policy, retryFn,
	)

	if vr.Valid {
		t.Error("expected invalid after exhausting retries")
	}
	if retries != 2 {
		t.Errorf("expected 2 retries (max), got %d", retries)
	}
}

func TestValidateWithRetry_StopsOnTriage(t *testing.T) {
	v := NewResultValidator()
	v.SetTripThreshold(2) // Force triage after 2 failures

	policy := DefaultGuardrailRetryPolicy()
	policy.MaxRetries = 5 // Would allow 5 retries

	result := &TaskResult{Content: "bad output", Error: "always fails"}

	callCount := 0
	retryFn := func(r *TaskResult, reason string) (*TaskResult, error) {
		callCount++
		return &TaskResult{Content: "still bad", Error: "still failing"}, nil
	}

	_, vr, _ := v.ValidateWithRetry(
		context.Background(), result, policy, retryFn,
	)

	if vr.Triage != true {
		t.Error("expected triage to be set")
	}
	// Should stop retrying at triage threshold, not max retries
	if callCount > 3 { // initial + 2 retries to trigger triage
		t.Errorf("expected <= 3 calls (stopped by triage), got %d", callCount)
	}
}

func TestValidateWithRetry_SkipsWarningSeverity(t *testing.T) {
	v := NewResultValidator()
	// Set up a warning-only scenario by adding a rule that returns warning
	v.AddRule(ValidationRule{
		Name: "content_length",
		Validate: func(r *TaskResult) *ValidationResult {
			if len(r.Content) < 10 {
				return &ValidationResult{
					Valid:    false,
					Reason:   "content too short",
					Severity: "warning",
				}
			}
			return nil
		},
	})

	policy := DefaultGuardrailRetryPolicy() // Only retries on "error"

	result := &TaskResult{Content: "short"}
	retryCalled := false
	retryFn := func(r *TaskResult, reason string) (*TaskResult, error) {
		retryCalled = true
		return &TaskResult{Content: "much longer content now"}, nil
	}

	_, vr, retries := v.ValidateWithRetry(
		context.Background(), result, policy, retryFn,
	)

	if vr.Valid {
		t.Error("expected invalid (warning)")
	}
	if retryCalled {
		t.Error("retry should not be called for warning severity")
	}
	if retries != 0 {
		t.Errorf("expected 0 retries, got %d", retries)
	}
}

func TestValidateWithRetry_ContextCancelled(t *testing.T) {
	v := NewResultValidator()
	result := &TaskResult{Content: "error: always fails"}

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	policy := DefaultGuardrailRetryPolicy()
	policy.MaxRetries = 10

	retryFn := func(r *TaskResult, reason string) (*TaskResult, error) {
		return &TaskResult{Content: "error: still failing"}, nil
	}

	_, _, retries := v.ValidateWithRetry(ctx, result, policy, retryFn)
	if retries != 0 {
		t.Errorf("expected 0 retries on cancelled context, got %d", retries)
	}
}

func TestValidateWithRetry_RetryFuncError(t *testing.T) {
	v := NewResultValidator()
	result := &TaskResult{Content: "bad output", Error: "fails"}

	retryFn := func(r *TaskResult, reason string) (*TaskResult, error) {
		return nil, fmt.Errorf("retry impossible")
	}

	_, vr, retries := v.ValidateWithRetry(
		context.Background(), result, DefaultGuardrailRetryPolicy(), retryFn,
	)

	if vr.Valid {
		t.Error("expected invalid when retry func errors")
	}
	if retries != 1 {
		t.Errorf("expected 1 retry attempt, got %d", retries)
	}
}
