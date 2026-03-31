package swarm

import (
	"testing"
	"time"
)

func TestMaxTurnsCondition(t *testing.T) {
	cond := NewMaxTurnsCondition(3)

	if cond.Name() != "max_turns" {
		t.Errorf("Name() = %q, want %q", cond.Name(), "max_turns")
	}

	// Below limit should not terminate
	for i := 1; i <= 2; i++ {
		result := cond.Check(i, "output")
		if result.Terminated {
			t.Errorf("Check(%d) should not terminate below limit", i)
		}
	}

	// At limit should terminate
	result := cond.Check(3, "output")
	if !result.Terminated {
		t.Error("Check(3) should terminate at limit")
	}
	if result.Condition != "max_turns" {
		t.Errorf("Condition = %q, want %q", result.Condition, "max_turns")
	}

	// Zero means unlimited
	unlimited := NewMaxTurnsCondition(0)
	result = unlimited.Check(1000, "output")
	if result.Terminated {
		t.Error("Unlimited (0) should never terminate")
	}

	// Reset should be no-op
	cond.Reset()
}

func TestTimeoutCondition(t *testing.T) {
	cond := NewTimeoutCondition(100 * time.Millisecond)

	if cond.Name() != "timeout" {
		t.Errorf("Name() = %q, want %q", cond.Name(), "timeout")
	}

	// Should not timeout immediately
	result := cond.Check(1, "output")
	if result.Terminated {
		t.Error("Should not timeout immediately after first check")
	}

	// Wait for timeout
	time.Sleep(150 * time.Millisecond)
	result = cond.Check(2, "output")
	if !result.Terminated {
		t.Error("Should timeout after duration")
	}

	// Reset should restart timer
	cond.Reset()
	result = cond.Check(3, "output")
	if result.Terminated {
		t.Error("Should not timeout immediately after reset")
	}

	// Zero duration means no timeout
	noTimeout := NewTimeoutCondition(0)
	result = noTimeout.Check(1, "output")
	if result.Terminated {
		t.Error("Zero duration should never timeout")
	}
}

func TestNoProgressCondition(t *testing.T) {
	cond := NewNoProgressCondition()

	if cond.Name() != "no_progress" {
		t.Errorf("Name() = %q, want %q", cond.Name(), "no_progress")
	}

	// Unique outputs should not trigger
	for i := range 5 {
		result := cond.Check(i, "unique output "+string(rune('A'+i)))
		if result.Terminated {
			t.Errorf("Unique output %d should not trigger loop detection", i)
		}
	}

	// Reset and test duplicate detection
	cond.Reset()
	condWithLowThreshold := NewNoProgressConditionWithConfig(3, 0) // 3 identical = loop

	// Two identical should not trigger
	condWithLowThreshold.Check(1, "same content")
	result := condWithLowThreshold.Check(2, "same content")
	if result.Terminated {
		t.Error("Two identical should not trigger (threshold is 3)")
	}

	// Third identical should trigger
	result = condWithLowThreshold.Check(3, "same content")
	if !result.Terminated {
		t.Error("Three identical should trigger loop detection")
	}
	if result.Condition != "no_progress" {
		t.Errorf("Condition = %q, want %q", result.Condition, "no_progress")
	}

	// Empty output should not trigger
	cond.Reset()
	result = cond.Check(1, "")
	if result.Terminated {
		t.Error("Empty output should not trigger")
	}
}

func TestCustomCondition(t *testing.T) {
	callCount := 0
	cond := NewCustomCondition("my_condition", func(turnCount int, lastOutput string) bool {
		callCount++
		return lastOutput == "STOP"
	})

	if cond.Name() != "my_condition" {
		t.Errorf("Name() = %q, want %q", cond.Name(), "my_condition")
	}

	// Normal output should not trigger
	result := cond.Check(1, "normal output")
	if result.Terminated {
		t.Error("Normal output should not trigger custom condition")
	}

	// Special output should trigger
	result = cond.Check(2, "STOP")
	if !result.Terminated {
		t.Error("Output 'STOP' should trigger custom condition")
	}
	if result.Condition != "my_condition" {
		t.Errorf("Condition = %q, want %q", result.Condition, "my_condition")
	}

	// Verify callback was called twice
	if callCount != 2 {
		t.Errorf("Callback called %d times, want 2", callCount)
	}

	// Reset should be no-op
	cond.Reset()
}

func TestCompositePolicy_OR(t *testing.T) {
	policy := NewCompositePolicy(TerminationOR)
	policy.Add(NewMaxTurnsCondition(5))
	policy.Add(NewCustomCondition("stop_word", func(_ int, output string) bool {
		return output == "TERMINATE"
	}))

	if policy.ConditionCount() != 2 {
		t.Errorf("ConditionCount() = %d, want 2", policy.ConditionCount())
	}

	// Neither condition met - should not terminate
	result := policy.Check(1, "normal output")
	if result.Terminated {
		t.Error("Should not terminate when no condition met")
	}

	// MaxTurns met - should terminate (OR mode)
	result = policy.Check(6, "normal output")
	if !result.Terminated {
		t.Error("Should terminate when max_turns met (OR mode)")
	}

	// Reset and test custom condition
	policy.Reset()
	result = policy.Check(1, "TERMINATE")
	if !result.Terminated {
		t.Error("Should terminate when custom condition met (OR mode)")
	}
}

func TestCompositePolicy_AND(t *testing.T) {
	policy := NewCompositePolicy(TerminationAND)
	policy.Add(NewMaxTurnsCondition(3))
	policy.Add(NewCustomCondition("stop_word", func(_ int, output string) bool {
		return output == "TERMINATE"
	}))

	// Only one condition met - should NOT terminate (AND mode)
	result := policy.Check(5, "normal output") // max_turns met, but not stop_word
	if result.Terminated {
		t.Error("Should not terminate when only one condition met (AND mode)")
	}

	// Both conditions met - should terminate
	result = policy.Check(5, "TERMINATE")
	if !result.Terminated {
		t.Error("Should terminate when both conditions met (AND mode)")
	}
	if result.Condition != "and" {
		t.Errorf("Condition = %q, want %q", result.Condition, "and")
	}
}

func TestCompositePolicy_Empty(t *testing.T) {
	policy := NewCompositePolicy(TerminationOR)

	// Empty policy should never terminate
	result := policy.Check(1000, "any output")
	if result.Terminated {
		t.Error("Empty policy should never terminate")
	}
}

func TestCompositePolicy_Reset(t *testing.T) {
	policy := NewCompositePolicy(TerminationOR)
	policy.Add(NewNoProgressCondition())

	// Trigger loop detection
	policy.Check(1, "same")
	policy.Check(2, "same")
	policy.Check(3, "same")
	result := policy.Check(4, "same")
	if !result.Terminated {
		t.Error("Should detect loop after identical outputs")
	}

	// Reset should clear history
	policy.Reset()
	result = policy.Check(1, "same")
	if result.Terminated {
		t.Error("Should not detect loop after reset")
	}
}

func TestCompositePolicy_DefaultMode(t *testing.T) {
	// Empty mode should default to OR
	policy := NewCompositePolicy("")
	if policy.mode != TerminationOR {
		t.Errorf("Empty mode should default to OR, got %q", policy.mode)
	}
}

func TestTerminationResult_Fields(t *testing.T) {
	cond := NewMaxTurnsCondition(1)
	result := cond.Check(2, "output")

	if !result.Terminated {
		t.Fatal("Expected Terminated = true")
	}
	if result.Reason == "" {
		t.Error("Reason should not be empty")
	}
	if result.Condition == "" {
		t.Error("Condition should not be empty")
	}
}

func TestCustomCondition_Reset(t *testing.T) {
	called := false
	cond := NewCustomCondition("test", func(turnCount int, lastOutput string) bool {
		called = true
		return turnCount >= 3
	})

	if cond.Name() != "test" {
		t.Errorf("Name() = %q, want %q", cond.Name(), "test")
	}

	// Below threshold
	result := cond.Check(2, "output")
	if result.Terminated {
		t.Error("Should not terminate below threshold")
	}

	// At threshold
	result = cond.Check(3, "output")
	if !result.Terminated {
		t.Error("Should terminate at threshold")
	}
	if !called {
		t.Error("Custom check function should have been called")
	}

	// Reset is a no-op but should not panic
	cond.Reset()

	// Verify condition still works after reset
	called = false
	result = cond.Check(3, "output")
	if !result.Terminated {
		t.Error("Should still terminate after reset (no-op)")
	}
}

func TestTimeoutCondition_Reset(t *testing.T) {
	cond := NewTimeoutCondition(100 * time.Millisecond)

	// Start the timeout
	result := cond.Check(0, "")
	if result.Terminated {
		t.Error("Should not terminate immediately")
	}

	// Reset the condition
	cond.Reset()

	// After reset, should be able to start fresh
	// The started flag should be reset, so next Check() will restart the timer
	result = cond.Check(0, "")
	if result.Terminated {
		t.Error("Should not terminate immediately after reset")
	}
}

func TestMaxTurnsCondition_Reset(t *testing.T) {
	cond := NewMaxTurnsCondition(3)

	// Turn 1
	result := cond.Check(1, "")
	if result.Terminated {
		t.Error("Should not terminate at turn 1")
	}

	// Turn 3 - should terminate
	result = cond.Check(3, "")
	if !result.Terminated {
		t.Error("Should terminate at turn 3")
	}

	// Reset
	cond.Reset()

	// After reset, should start fresh
	result = cond.Check(1, "")
	if result.Terminated {
		t.Error("Should not terminate at turn 1 after reset")
	}
}

func TestNoProgressCondition_Reset(t *testing.T) {
	cond := NewNoProgressCondition()

	// Check with different outputs (not a loop)
	result := cond.Check(0, "output 1")
	if result.Terminated {
		t.Error("Should not terminate on first check")
	}

	// Reset
	cond.Reset()

	// After reset, should start fresh
	result = cond.Check(0, "different output")
	if result.Terminated {
		t.Error("Should not terminate after reset with different output")
	}
}
