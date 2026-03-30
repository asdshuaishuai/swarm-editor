package swarm

import (
	"testing"
)

func TestLoopDetector_NoLoop(t *testing.T) {
	ld := NewLoopDetector()

	// Different outputs should not trigger loop detection
	for i := 0; i < 10; i++ {
		isLoop, _ := ld.CheckOutput("unique output number " + string(rune('A'+i)))
		if isLoop {
			t.Errorf("Unexpected loop detection at iteration %d", i)
		}
	}
}

func TestLoopDetector_ExactDuplicate(t *testing.T) {
	ld := NewLoopDetector()
	ld.SetMaxConsecutiveDuplicates(3)

	// Two identical outputs should not trigger (threshold is 3)
	ld.CheckOutput("same content")
	ld.CheckOutput("same content")
	isLoop, _ := ld.CheckOutput("same content")

	if !isLoop {
		t.Error("Expected loop detection after 3 identical outputs")
	}
}

func TestLoopDetector_Reset(t *testing.T) {
	ld := NewLoopDetector()

	ld.CheckOutput("content A")
	ld.CheckOutput("content A")
	ld.Reset()

	isLoop, _ := ld.CheckOutput("content A")
	if isLoop {
		t.Error("Expected no loop after reset")
	}
}

func TestLoopDetector_EmptyContent(t *testing.T) {
	ld := NewLoopDetector()

	isLoop, reason := ld.CheckOutput("")
	if isLoop {
		t.Errorf("Empty content should not trigger loop: %s", reason)
	}
}

func TestLoopDetector_ConsecutiveCount(t *testing.T) {
	ld := NewLoopDetector()

	ld.CheckOutput("X")
	ld.CheckOutput("Y")
	ld.CheckOutput("X")
	ld.CheckOutput("X")

	// Last two are "X" but not consecutive from end (Y breaks it)
	// Actually: history is [X, Y, X, X] — last 2 are consecutive X
	if count := ld.ConsecutiveCount(); count != 2 {
		t.Errorf("Expected consecutive count 2, got %d", count)
	}
}

func TestLoopDetector_NearDuplicate(t *testing.T) {
	ld := NewLoopDetector()
	ld.SetSimilarityThreshold(0.9)

	// Near-identical content should be detected
	content1 := "The function returns a boolean value when the input is valid"
	content2 := "The function returns a boolean value when the input is valid." // extra period

	isLoop, reason := ld.CheckOutput(content1)
	if isLoop {
		t.Errorf("First unique output should not trigger loop: %s", reason)
	}

	isLoop, _ = ld.CheckOutput(content2)
	if !isLoop {
		t.Error("Near-duplicate should trigger loop detection")
	}
}

func TestLoopDetector_SetMaxHistory(t *testing.T) {
	ld := NewLoopDetector()
	ld.SetMaxHistory(2)

	// Only last 2 outputs are tracked
	ld.CheckOutput("A")
	ld.CheckOutput("B")
	ld.CheckOutput("C")

	// "A" should have been evicted from history
	// "B" and "C" are in history — no duplicates
	isLoop, _ := ld.CheckOutput("A")
	if isLoop {
		t.Error("Evicted entry should not cause false positive")
	}
}

func TestIsNearDuplicate(t *testing.T) {
	tests := []struct {
		a, b   string
		expect bool
	}{
		{"hello world", "hello world", true},
		{"hello world", "hello there", false},
		{"a b c d e", "a b c d e f", false},
		{"the quick brown fox", "the quick brown fox jumps", false},
		{"identical content here", "identical content here", true},
	}

	for _, tt := range tests {
		result := isNearDuplicate(tt.a, tt.b)
		if result != tt.expect {
			t.Errorf("isNearDuplicate(%q, %q) = %v, want %v", tt.a, tt.b, result, tt.expect)
		}
	}
}
