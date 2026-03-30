package swarm

import (
	"context"
	"fmt"
	"testing"
	"time"
)

func TestNewInterruptError(t *testing.T) {
	ie := NewInterruptError("node-1", "before")
	if ie.NodeID != "node-1" {
		t.Errorf("NodeID = %q, want 'node-1'", ie.NodeID)
	}
	if ie.Phase != "before" {
		t.Errorf("Phase = %q, want 'before'", ie.Phase)
	}
}

func TestInterruptError_Error(t *testing.T) {
	ie := NewInterruptError("node-1", "after")
	msg := ie.Error()
	if msg == "" {
		t.Error("Error() should return non-empty string")
	}
}

func TestIsInterruptError_Nil(t *testing.T) {
	if IsInterruptError(nil) {
		t.Error("nil error should not be an InterruptError")
	}
}

func TestIsInterruptError_Direct(t *testing.T) {
	ie := NewInterruptError("node-1", "before")
	if !IsInterruptError(ie) {
		t.Error("should identify direct InterruptError")
	}
}

func TestIsInterruptError_Wrapped(t *testing.T) {
	ie := NewInterruptError("node-2", "after")
	wrapped := fmt.Errorf("task failed: %w", ie)
	if !IsInterruptError(wrapped) {
		t.Error("should identify wrapped InterruptError")
	}
}

func TestIsInterruptError_OtherError(t *testing.T) {
	if IsInterruptError(fmt.Errorf("some other error")) {
		t.Error("should not identify non-InterruptError")
	}
}

func TestGojaExecutor_Execute_Simple(t *testing.T) {
	exec := &GojaExecutor{}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	result, err := exec.Execute(ctx, "1 + 2", nil)
	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}
	if result == nil {
		t.Fatal("result should not be nil")
	}
}

func TestGojaExecutor_Execute_WithVariables(t *testing.T) {
	exec := &GojaExecutor{}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	variables := map[string]any{
		"x": 10,
		"y": 20,
	}
	result, err := exec.Execute(ctx, "x + y", variables)
	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}
	num, ok := result.(int64)
	if !ok || num != 30 {
		t.Errorf("expected 30, got %v (%T)", result, result)
	}
}

func TestGojaExecutor_Execute_SyntaxError(t *testing.T) {
	exec := &GojaExecutor{}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := exec.Execute(ctx, "invalid javascript {{{", nil)
	if err == nil {
		t.Error("expected error for invalid JavaScript")
	}
}

func TestGojaExecutor_Execute_Timeout(t *testing.T) {
	exec := &GojaExecutor{}
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	// Infinite loop should be killed by timeout
	_, err := exec.Execute(ctx, "while(true) {}", nil)
	if err == nil {
		t.Error("expected error for infinite loop")
	}
}

func TestGojaExecutor_Execute_VariableIsolation(t *testing.T) {
	exec := &GojaExecutor{}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	original := map[string]any{"items": []any{"a", "b"}}
	_, err := exec.Execute(ctx, "items.push('c')", original)
	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}
	// Original should not be modified
	items, ok := original["items"].([]any)
	if !ok || len(items) != 2 {
		t.Errorf("original variable should not be mutated, got %v", original["items"])
	}
}
