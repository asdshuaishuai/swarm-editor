// Package swarm implements task result validation and guardrails
// Inspired by Semantic Kernel's function result filtering,
// LangGraph's interrupt-before/interrupt-after patterns for human-in-the-loop,
// and OpenAI Agents SDK's input guardrails for pre-execution validation
package swarm

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"
)

// InputGuardrailAction defines what action to take for an input.
// Inspired by OpenAI Agents SDK's input guardrail triage.
type InputGuardrailAction string

const (
	// InputAllow passes the input to the agent unchanged.
	InputAllow InputGuardrailAction = "allow"

	// InputReject blocks the input from reaching the agent.
	InputReject InputGuardrailAction = "reject"

	// InputRewrite transforms the input before passing to the agent.
	InputRewrite InputGuardrailAction = "rewrite"

	// InputTriage routes the input to a specialized handler instead of normal execution.
	InputTriage InputGuardrailAction = "triage"
)

// InputGuardrailResult is the outcome of pre-execution input validation.
type InputGuardrailResult struct {
	Action   InputGuardrailAction `json:"action"`
	Reason   string               `json:"reason,omitempty"`
	Rewrite  string               `json:"rewrite,omitempty"`  // Rewritten input (when Action=Rewrite)
	TriageTo string               `json:"triageTo,omitempty"` // Target handler (when Action=Triage)
	RuleName string               `json:"ruleName,omitempty"`
}

// InputGuardrail defines a pre-execution validation rule.
// Inspired by OpenAI Agents SDK's InputGuardrail:
// validates/transforms user input before it reaches the agent.
type InputGuardrail struct {
	Name        string
	Description string
	// Check returns an InputGuardrailResult describing what to do with the input.
	// Return InputAllow to pass through, InputReject to block, InputRewrite to transform,
	// InputTriage to route to a specialized handler.
	Check func(ctx context.Context, input string, metadata map[string]any) (*InputGuardrailResult, error)
}

// InputGuardrailChain runs multiple input guardrails in sequence.
// Short-circuits on first InputReject or InputTriage.
// Collects rewrites and applies the last one.
type InputGuardrailChain struct {
	mu         sync.RWMutex
	guardrails []InputGuardrail
}

// NewInputGuardrailChain creates a new chain with default guardrails.
func NewInputGuardrailChain() *InputGuardrailChain {
	chain := &InputGuardrailChain{}
	chain.guardrails = []InputGuardrail{
		{
			Name:        "max_length",
			Description: "Reject inputs exceeding maximum length (100KB)",
			Check:       checkInputMaxLength,
		},
		{
			Name:        "empty_input",
			Description: "Reject empty or whitespace-only inputs",
			Check:       checkEmptyInput,
		},
	}
	return chain
}

// AddGuardrail adds a custom input guardrail to the chain.
func (c *InputGuardrailChain) AddGuardrail(g InputGuardrail) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.guardrails = append(c.guardrails, g)
}

// Validate runs all guardrails against the input.
// Returns the final result after processing all guardrails.
// Short-circuits on first InputReject or InputTriage.
func (c *InputGuardrailChain) Validate(ctx context.Context, input string, metadata map[string]any) (*InputGuardrailResult, error) {
	if metadata == nil {
		metadata = make(map[string]any)
	}

	c.mu.RLock()
	guardrails := make([]InputGuardrail, len(c.guardrails))
	copy(guardrails, c.guardrails)
	c.mu.RUnlock()

	currentInput := input
	var lastRewrite string

	for _, g := range guardrails {
		result, err := g.Check(ctx, currentInput, metadata)
		if err != nil {
			return nil, fmt.Errorf("input guardrail %q error: %w", g.Name, err)
		}
		if result == nil {
			continue
		}
		result.RuleName = g.Name

		switch result.Action {
		case InputAllow:
			// Continue to next guardrail
		case InputReject:
			return result, nil
		case InputRewrite:
			if result.Rewrite != "" {
				currentInput = result.Rewrite
				lastRewrite = result.Rewrite
			}
		case InputTriage:
			return result, nil
		}
	}

	// If any rewrite happened, return the rewritten result
	if lastRewrite != "" {
		return &InputGuardrailResult{
			Action:  InputRewrite,
			Rewrite: lastRewrite,
			Reason:  "input rewritten by guardrails",
		}, nil
	}

	return &InputGuardrailResult{Action: InputAllow}, nil
}

const maxInputLength = 100 << 10 // 100KB

func checkInputMaxLength(_ context.Context, input string, _ map[string]any) (*InputGuardrailResult, error) {
	if len(input) > maxInputLength {
		return &InputGuardrailResult{
			Action: InputReject,
			Reason: fmt.Sprintf("input length %d exceeds maximum %d", len(input), maxInputLength),
		}, nil
	}
	return &InputGuardrailResult{Action: InputAllow}, nil
}

func checkEmptyInput(_ context.Context, input string, _ map[string]any) (*InputGuardrailResult, error) {
	if strings.TrimSpace(input) == "" {
		return &InputGuardrailResult{
			Action: InputReject,
			Reason: "input is empty or whitespace-only",
		}, nil
	}
	return &InputGuardrailResult{Action: InputAllow}, nil
}

// ValidationResult represents the outcome of result validation
type ValidationResult struct {
	Valid     bool   `json:"valid"`
	Reason    string `json:"reason,omitempty"`
	Severity  string `json:"severity,omitempty"`  // "info", "warning", "error"
	RuleName  string `json:"ruleName,omitempty"`  // Which rule produced this result
	TripCount int    `json:"tripCount,omitempty"` // How many times this rule has failed (CrewAI pattern)

	// Triage indicates the task should be routed to a fallback agent instead of
	// retrying the original agent. Set automatically when TripCount >= TripThreshold.
	// Inspired by CrewAI's guardrail triage pattern.
	Triage     bool   `json:"triage,omitempty"`
	TriageHint string `json:"triageHint,omitempty"` // Context for the fallback agent
}

// ResultValidator validates task results before they are accepted.
// Inspired by Semantic Kernel's guardrails pattern:
// "Filter function results, set MaximumAutoInvokeAttempts, and validate inputs"
type ResultValidator struct {
	mu sync.RWMutex

	// Validation rules
	rules []ValidationRule

	// Configuration
	maxContentLength int      // Maximum allowed content length (0 = unlimited)
	blockedPatterns  []string // Patterns that indicate problematic results

	// Trip tracking (CrewAI pattern): counts consecutive failures per rule
	// to detect "guardrail thrashing" where an agent keeps failing the same check.
	tripCounts    map[string]int // rule name -> consecutive failure count
	tripThreshold int            // After N trips, force triage (default: 5)

	// Human-in-the-loop callback (LangGraph interrupt-before pattern)
	// When a result requires human review, this callback is invoked.
	// If nil, results requiring review are automatically rejected.
	onRequireReview func(ctx context.Context, taskID string, result *TaskResult, reason string) (approve bool, err error)
}

// ValidationRule defines a custom validation rule
type ValidationRule struct {
	Name        string
	Description string
	Validate    func(result *TaskResult) *ValidationResult
}

// NewResultValidator creates a new result validator with default rules
func NewResultValidator() *ResultValidator {
	v := &ResultValidator{
		maxContentLength: 1 << 20, // 1MB default
		// Default blocked patterns are conservative to avoid false positives.
		// Users should add domain-specific patterns via SetBlockedPatterns.
		blockedPatterns: []string{
			"fatal error",
		},
		tripCounts:    make(map[string]int),
		tripThreshold: 5, // Force triage after 5 consecutive failures per rule
	}

	// Register default validation rules
	v.rules = []ValidationRule{
		{
			Name:        "error_check",
			Description: "Reject results that contain error messages",
			Validate:    v.validateNoErrors,
		},
		{
			Name:        "content_length",
			Description: "Reject results exceeding max content length",
			Validate:    v.validateContentLength,
		},
		{
			Name:        "duration_check",
			Description: "Flag results with suspiciously short duration (possible failure)",
			Validate:    v.validateDuration,
		},
	}

	return v
}

// AddRule adds a custom validation rule
func (v *ResultValidator) AddRule(rule ValidationRule) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.rules = append(v.rules, rule)
}

// SetMaxContentLength sets the maximum allowed content length
func (v *ResultValidator) SetMaxContentLength(maxLength int) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.maxContentLength = maxLength
}

// SetBlockedPatterns sets patterns that indicate problematic results
func (v *ResultValidator) SetBlockedPatterns(patterns []string) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.blockedPatterns = patterns
}

// SetOnRequireReview sets the human-in-the-loop callback for results requiring review
func (v *ResultValidator) SetOnRequireReview(fn func(ctx context.Context, taskID string, result *TaskResult, reason string) (bool, error)) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.onRequireReview = fn
}

// SetTripThreshold sets the number of consecutive failures before forcing triage.
// Default is 5. Inspired by CrewAI's guardrail_max_retries pattern.
func (v *ResultValidator) SetTripThreshold(threshold int) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.tripThreshold = threshold
}

// GetTripCount returns the current trip count for a specific rule.
func (v *ResultValidator) GetTripCount(ruleName string) int {
	v.mu.RLock()
	defer v.mu.RUnlock()
	return v.tripCounts[ruleName]
}

// ResetTrips resets trip counts for all rules. Call after a successful validation
// cycle or when switching to a different task.
func (v *ResultValidator) ResetTrips() {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.tripCounts = make(map[string]int)
}

// Validate runs all validation rules against a task result.
// Inspired by OpenAI Swarm's guardrail chaining with soft/hard distinction:
// - Hard rules (severity="error") short-circuit immediately.
// - Soft rules (severity="warning") accumulate but don't stop execution.
// Tracks trip counts per rule (CrewAI pattern) to detect guardrail thrashing.
// When a rule exceeds TripThreshold consecutive failures, sets Triage=true.
func (v *ResultValidator) Validate(result *TaskResult) *ValidationResult {
	if result == nil {
		return &ValidationResult{
			Valid:    false,
			Reason:   "result is nil",
			Severity: "error",
		}
	}

	v.mu.RLock()
	rules := make([]ValidationRule, len(v.rules))
	copy(rules, v.rules)
	v.mu.RUnlock()

	var warnings []string
	allValid := true
	var firstRuleName string
	var firstTripCount int
	var firstTriage bool
	var firstTriageHint string

	for _, rule := range rules {
		vr := rule.Validate(result)
		if vr != nil && !vr.Valid {
			vr.RuleName = rule.Name

			// Track trip count (CrewAI pattern) — check threshold under lock to avoid race
			v.mu.Lock()
			v.tripCounts[rule.Name]++
			vr.TripCount = v.tripCounts[rule.Name]
			threshold := v.tripThreshold
			shouldTriage := vr.TripCount >= threshold
			v.mu.Unlock()

			// Force triage if thrashing detected
			if shouldTriage {
				vr.Triage = true
				vr.TriageHint = fmt.Sprintf(
					"guardrail %q failed %d consecutive times (threshold: %d), forcing triage",
					rule.Name, vr.TripCount, threshold)
			}

			// Record first failure's metadata
			if firstRuleName == "" {
				firstRuleName = vr.RuleName
				firstTripCount = vr.TripCount
				firstTriage = vr.Triage
				firstTriageHint = vr.TriageHint
			}

			// Hard failures short-circuit (OpenAI Swarm pattern)
			if vr.Severity == "error" {
				return vr
			}

			// Soft failures accumulate warnings
			allValid = false
			warnings = append(warnings, vr.Reason)
		}
	}

	if allValid {
		// Reset trip counts on successful validation
		v.mu.Lock()
		for name := range v.tripCounts {
			v.tripCounts[name] = 0
		}
		v.mu.Unlock()

		return &ValidationResult{Valid: true}
	}

	// Return accumulated warnings (all soft, no hard failures)
	// but carry first failure's trip/triage info
	var combined strings.Builder
	for i, w := range warnings {
		if i > 0 {
			combined.WriteString("; ")
		}
		combined.WriteString(w)
	}
	return &ValidationResult{
		Valid:      false,
		Reason:     combined.String(),
		Severity:   "warning",
		RuleName:   firstRuleName,
		TripCount:  firstTripCount,
		Triage:     firstTriage,
		TriageHint: firstTriageHint,
	}
}

// ValidateWithReview validates a result and invokes human review if needed
// This implements LangGraph's interrupt-before pattern for human-in-the-loop
func (v *ResultValidator) ValidateWithReview(ctx context.Context, taskID string, result *TaskResult) (*ValidationResult, error) {
	vr := v.Validate(result)
	if vr.Valid {
		return vr, nil
	}

	// For warnings, try human review if callback is set
	if vr.Severity == "warning" {
		v.mu.RLock()
		onReview := v.onRequireReview
		v.mu.RUnlock()

		if onReview != nil {
			approve, err := onReview(ctx, taskID, result, vr.Reason)
			if err != nil {
				return nil, fmt.Errorf("human review failed: %w", err)
			}
			if approve {
				return &ValidationResult{Valid: true, Reason: "approved by human review"}, nil
			}
		}
	}

	return vr, nil
}

// GuardrailRetryPolicy configures automatic retry behavior for guardrail validation.
// Inspired by CrewAI's guardrail_max_retries + output_json retry loop.
type GuardrailRetryPolicy struct {
	// MaxRetries is the maximum number of retry attempts after initial failure.
	// 0 = no retry (default behavior). Recommended: 3.
	MaxRetries int

	// RetryOnSeverity controls which severities trigger retry.
	// Only results with matching severity will be retried.
	// Default: {"error"} — only retry on errors, not warnings.
	RetryOnSeverity map[string]bool
}

// DefaultGuardrailRetryPolicy returns a sensible default retry policy.
func DefaultGuardrailRetryPolicy() GuardrailRetryPolicy {
	return GuardrailRetryPolicy{
		MaxRetries: 3,
		RetryOnSeverity: map[string]bool{
			"error": true,
		},
	}
}

// RetryFunc is called when validation fails and a retry is needed.
// It receives the invalid result and the validation reason, and should
// return a new (hopefully valid) result or an error if retry is impossible.
type RetryFunc func(result *TaskResult, reason string) (*TaskResult, error)

// ValidateWithRetry validates a result and automatically retries with feedback
// if validation fails. Inspired by CrewAI's guardrail auto-retry pattern:
// when output_json validation fails, the error is fed back to the agent
// so it can correct its output.
//
// Returns the final result (possibly from retry), the last validation result,
// and the number of retries attempted.
func (v *ResultValidator) ValidateWithRetry(
	ctx context.Context,
	result *TaskResult,
	policy GuardrailRetryPolicy,
	retry RetryFunc,
) (*TaskResult, *ValidationResult, int) {
	vr := v.Validate(result)
	if vr.Valid {
		return result, vr, 0
	}

	// Check if this severity warrants retry
	if !policy.RetryOnSeverity[vr.Severity] {
		return result, vr, 0
	}

	retries := 0
	current := result

	for retries < policy.MaxRetries {
		// Check context cancellation
		if ctx.Err() != nil {
			return current, vr, retries
		}

		retries++

		// Check for triage — don't retry if guardrail thrashing detected
		if vr.Triage {
			return current, vr, retries
		}

		// Call retry function with feedback
		newResult, err := retry(current, vr.Reason)
		if err != nil {
			// Retry function failed, return last known state
			return current, vr, retries
		}
		if newResult == nil {
			return current, vr, retries
		}

		current = newResult
		vr = v.Validate(current)
		if vr.Valid {
			return current, vr, retries
		}
	}

	return current, vr, retries
}

// validateNoErrors checks for error indicators in the result
func (v *ResultValidator) validateNoErrors(result *TaskResult) *ValidationResult {
	if result.Error != "" {
		return &ValidationResult{
			Valid:    false,
			Reason:   fmt.Sprintf("result contains error: %s", result.Error),
			Severity: "error",
		}
	}

	// Check for blocked patterns in content
	v.mu.RLock()
	patterns := make([]string, len(v.blockedPatterns))
	copy(patterns, v.blockedPatterns)
	v.mu.RUnlock()

	lowerContent := strings.ToLower(result.Content)
	for _, pattern := range patterns {
		if strings.Contains(lowerContent, pattern) {
			return &ValidationResult{
				Valid:    false,
				Reason:   fmt.Sprintf("content contains blocked pattern: %q", pattern),
				Severity: "warning",
			}
		}
	}

	return &ValidationResult{Valid: true}
}

// validateContentLength checks that content doesn't exceed max length
func (v *ResultValidator) validateContentLength(result *TaskResult) *ValidationResult {
	v.mu.RLock()
	maxLen := v.maxContentLength
	v.mu.RUnlock()

	if maxLen > 0 && len(result.Content) > maxLen {
		return &ValidationResult{
			Valid:    false,
			Reason:   fmt.Sprintf("content length %d exceeds maximum %d", len(result.Content), maxLen),
			Severity: "warning",
		}
	}

	return &ValidationResult{Valid: true}
}

// validateDuration checks for suspiciously short execution duration
// A task that completes in < 100ms likely failed silently
func (v *ResultValidator) validateDuration(result *TaskResult) *ValidationResult {
	if result.Duration < 100*time.Millisecond && result.Content == "" {
		return &ValidationResult{
			Valid:    false,
			Reason:   fmt.Sprintf("suspiciously fast execution (%v) with empty content", result.Duration),
			Severity: "warning",
		}
	}

	return &ValidationResult{Valid: true}
}
