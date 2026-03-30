package utils

import (
	"strings"
	"testing"
)

func TestGenerateID(t *testing.T) {
	id1 := GenerateID("task")
	id2 := GenerateID("task")

	if !strings.HasPrefix(id1, "task_") {
		t.Errorf("expected prefix 'task_', got %q", id1[:5])
	}

	// IDs should be unique (different counter or timestamp)
	if id1 == id2 {
		t.Error("two GenerateID calls returned same ID")
	}

	// Format: prefix_timestamp_random_counter
	parts := strings.Split(id1, "_")
	if len(parts) != 4 {
		t.Fatalf("expected 4 parts, got %d: %v", len(parts), parts)
	}

	// Counter part should be 4 hex chars
	if len(parts[3]) != 4 {
		t.Errorf("expected 4-char counter, got %q", parts[3])
	}
}

func TestGenerateID_EmptyPrefix(t *testing.T) {
	id := GenerateID("")
	if strings.HasPrefix(id, "_") {
		// Still valid, just starts with underscore
		parts := strings.Split(id, "_")
		if len(parts) != 4 {
			t.Fatalf("expected 4 parts for empty prefix, got %d", len(parts))
		}
	}
}

func TestGenerateShortID(t *testing.T) {
	id1 := GenerateShortID("a")
	id2 := GenerateShortID("a")

	if !strings.HasPrefix(id1, "a_") {
		t.Errorf("expected prefix 'a_', got %q", id1[:2])
	}

	if id1 == id2 {
		t.Error("two GenerateShortID calls returned same ID")
	}

	// Should be short: prefix + "_" + 8 hex chars
	if len(id1) != 10 {
		t.Errorf("expected length 10, got %d: %q", len(id1), id1)
	}
}

func TestGenerateShortID_EmptyPrefix(t *testing.T) {
	id := GenerateShortID("")
	if len(id) != 9 {
		t.Errorf("expected length 9 for empty prefix, got %d: %q", len(id), id)
	}
}
