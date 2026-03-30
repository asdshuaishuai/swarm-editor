// Package swarm implements composable termination conditions for agent execution.
// Inspired by AutoGen's composite termination conditions:
// should_terminate(msg) composes multiple conditions with AND/OR logic,
// including "no_progress" (LoopDetector), max_rounds, timeout, and custom conditions.
package swarm

import (
	"fmt"
	"sync"
	"time"
)

// TerminationResult is the outcome of a termination check.
type TerminationResult struct {
	Terminated bool   `json:"terminated"`
	Reason     string `json:"reason,omitempty"`
	Condition  string `json:"condition,omitempty"` // Which condition triggered
}

// TerminationCondition is a single termination check.
type TerminationCondition interface {
	// Check evaluates the condition and returns a TerminationResult.
	// If Terminated is true, execution should stop.
	Check(turnCount int, lastOutput string) TerminationResult
	// Name returns a human-readable name for this condition.
	Name() string
	// Reset resets internal state (e.g., when starting a new task).
	Reset()
}

// MaxTurnsCondition terminates after a maximum number of turns.
type MaxTurnsCondition struct {
	maxTurns int
}

// NewMaxTurnsCondition creates a condition that terminates after maxTurns.
// A value of 0 means unlimited.
func NewMaxTurnsCondition(maxTurns int) *MaxTurnsCondition {
	return &MaxTurnsCondition{maxTurns: maxTurns}
}

func (c *MaxTurnsCondition) Name() string { return "max_turns" }

func (c *MaxTurnsCondition) Check(turnCount int, _ string) TerminationResult {
	if c.maxTurns > 0 && turnCount >= c.maxTurns {
		return TerminationResult{
			Terminated: true,
			Reason:     fmt.Sprintf("max turns reached (%d/%d)", turnCount, c.maxTurns),
			Condition:  c.Name(),
		}
	}
	return TerminationResult{}
}

func (c *MaxTurnsCondition) Reset() {}

// TimeoutCondition terminates after a wall-clock duration.
type TimeoutCondition struct {
	mu       sync.Mutex
	deadline time.Time
	timeout  time.Duration
	started  bool
}

// NewTimeoutCondition creates a condition that terminates after the given duration.
// A zero duration means no timeout.
func NewTimeoutCondition(timeout time.Duration) *TimeoutCondition {
	return &TimeoutCondition{timeout: timeout}
}

func (c *TimeoutCondition) Name() string { return "timeout" }

func (c *TimeoutCondition) Check(_ int, _ string) TerminationResult {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.timeout <= 0 {
		return TerminationResult{}
	}

	if !c.started {
		c.deadline = time.Now().Add(c.timeout)
		c.started = true
	}

	if time.Now().After(c.deadline) {
		return TerminationResult{
			Terminated: true,
			Reason:     fmt.Sprintf("timeout reached (%v)", c.timeout),
			Condition:  c.Name(),
		}
	}
	return TerminationResult{}
}

func (c *TimeoutCondition) Reset() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.started = false
}

// NoProgressCondition terminates when outputs are near-identical (wraps LoopDetector).
type NoProgressCondition struct {
	detector *LoopDetector
}

// NewNoProgressCondition creates a condition that terminates when consecutive outputs
// are identical or near-identical (Jaccard similarity >= 0.9).
func NewNoProgressCondition() *NoProgressCondition {
	return &NoProgressCondition{detector: NewLoopDetector()}
}

// NewNoProgressConditionWithConfig creates a condition with custom thresholds.
func NewNoProgressConditionWithConfig(maxConsecutive int, similarityThreshold float64) *NoProgressCondition {
	ld := NewLoopDetector()
	ld.SetMaxConsecutiveDuplicates(maxConsecutive)
	ld.SetSimilarityThreshold(similarityThreshold)
	return &NoProgressCondition{detector: ld}
}

func (c *NoProgressCondition) Name() string { return "no_progress" }

func (c *NoProgressCondition) Check(_ int, output string) TerminationResult {
	if output == "" {
		return TerminationResult{}
	}
	isLoop, reason := c.detector.CheckOutput(output)
	if isLoop {
		return TerminationResult{
			Terminated: true,
			Reason:     reason,
			Condition:  c.Name(),
		}
	}
	return TerminationResult{}
}

func (c *NoProgressCondition) Reset() {
	c.detector.Reset()
}

// CustomCondition allows arbitrary termination logic via a function.
type CustomCondition struct {
	name      string
	check     func(turnCount int, lastOutput string) bool
}

// NewCustomCondition creates a termination condition from a custom function.
func NewCustomCondition(name string, check func(turnCount int, lastOutput string) bool) *CustomCondition {
	return &CustomCondition{name: name, check: check}
}

func (c *CustomCondition) Name() string { return c.name }

func (c *CustomCondition) Check(turnCount int, lastOutput string) TerminationResult {
	if c.check(turnCount, lastOutput) {
		return TerminationResult{
			Terminated: true,
			Reason:     fmt.Sprintf("custom condition %q triggered at turn %d", c.name, turnCount),
			Condition:  c.name,
		}
	}
	return TerminationResult{}
}

func (c *CustomCondition) Reset() {}

// CompositeTerminationPolicy composes multiple TerminationConditions
// with AND/OR logic (AutoGen pattern).
//
// AND mode: terminates when ALL conditions are met.
// OR mode: terminates when ANY condition is met (default).
//
// Usage:
//
//	policy := NewCompositePolicy(TerminationOR)
//	policy.Add(NewMaxTurnsCondition(10))
//	policy.Add(NewNoProgressCondition())
//	policy.Add(NewTimeoutCondition(5 * time.Minute))
//	// Terminates on first condition met (OR logic)
type CompositeTerminationPolicy struct {
	mu          sync.Mutex
	mode        TerminationMode
	conditions  []TerminationCondition
}

// TerminationMode determines how conditions are combined.
type TerminationMode string

const (
	// TerminationOR terminates when ANY condition is met (default, more aggressive).
	TerminationOR TerminationMode = "or"
	// TerminationAND terminates when ALL conditions are met (more conservative).
	TerminationAND TerminationMode = "and"
)

// NewCompositePolicy creates a composite termination policy.
// Default mode is OR (terminates on first condition met).
func NewCompositePolicy(mode TerminationMode) *CompositeTerminationPolicy {
	if mode == "" {
		mode = TerminationOR
	}
	return &CompositeTerminationPolicy{
		mode:       mode,
		conditions: make([]TerminationCondition, 0),
	}
}

// Add appends a termination condition.
func (p *CompositeTerminationPolicy) Add(condition TerminationCondition) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.conditions = append(p.conditions, condition)
}

// Check evaluates all conditions according to the policy mode.
func (p *CompositeTerminationPolicy) Check(turnCount int, lastOutput string) TerminationResult {
	p.mu.Lock()
	conditions := make([]TerminationCondition, len(p.conditions))
	copy(conditions, p.conditions)
	mode := p.mode
	p.mu.Unlock()

	if len(conditions) == 0 {
		return TerminationResult{}
	}

	if mode == TerminationAND {
		// AND: all conditions must terminate
		names := make([]string, 0, len(conditions))
		for _, c := range conditions {
			result := c.Check(turnCount, lastOutput)
			if !result.Terminated {
				return TerminationResult{}
			}
			names = append(names, result.Condition)
		}
		return TerminationResult{
			Terminated: true,
			Reason:     fmt.Sprintf("all conditions met: %v", names),
			Condition:  "and",
		}
	}

	// OR: any condition terminating is sufficient (default)
	for _, c := range conditions {
		result := c.Check(turnCount, lastOutput)
		if result.Terminated {
			return result
		}
	}

	return TerminationResult{}
}

// Reset resets all conditions.
func (p *CompositeTerminationPolicy) Reset() {
	p.mu.Lock()
	defer p.mu.Unlock()
	for _, c := range p.conditions {
		c.Reset()
	}
}

// ConditionCount returns the number of registered conditions.
func (p *CompositeTerminationPolicy) ConditionCount() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.conditions)
}
