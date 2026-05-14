package swarm

import (
	"context"
	"testing"
	"time"
)

func TestExecuteWaitNode_Seconds(t *testing.T) {
	ctx := context.Background()
	result, err := ExecuteWaitNode(ctx, map[string]any{
		"duration": 1,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.WaitedMs < 900 {
		t.Errorf("expected ~1000ms wait, got %dms", result.WaitedMs)
	}
	if result.Cancelled {
		t.Error("should not be cancelled")
	}
}

func TestExecuteWaitNode_Milliseconds(t *testing.T) {
	ctx := context.Background()
	result, err := ExecuteWaitNode(ctx, map[string]any{
		"duration_ms": 100,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.WaitedMs < 50 {
		t.Errorf("expected ~100ms wait, got %dms", result.WaitedMs)
	}
}

func TestExecuteWaitNode_ZeroDuration(t *testing.T) {
	ctx := context.Background()
	result, err := ExecuteWaitNode(ctx, map[string]any{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.WaitedMs != 0 {
		t.Errorf("expected 0ms, got %dms", result.WaitedMs)
	}
}

func TestExecuteWaitNode_ContextCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(50 * time.Millisecond)
		cancel()
	}()

	result, err := ExecuteWaitNode(ctx, map[string]any{
		"duration": 10, // Would wait 10s but context cancels after 50ms
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Cancelled {
		t.Error("should be cancelled")
	}
	if result.WaitedMs > 500 {
		t.Errorf("expected <500ms, got %dms", result.WaitedMs)
	}
}

func TestExecuteWaitNode_UntilPast(t *testing.T) {
	ctx := context.Background()
	// Past timestamp
	past := time.Now().Add(-1 * time.Hour).Format(time.RFC3339)
	result, err := ExecuteWaitNode(ctx, map[string]any{
		"until": past,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.WaitedMs != 0 {
		t.Errorf("expected 0ms for past time, got %dms", result.WaitedMs)
	}
	if result.Deadline == "" {
		t.Error("expected deadline to be set")
	}
}

func TestExecuteWaitNode_UntilFuture(t *testing.T) {
	ctx := context.Background()
	// Use 2 seconds in future to avoid RFC3339 second-precision truncation
	future := time.Now().Add(2 * time.Second).Format(time.RFC3339)
	result, err := ExecuteWaitNode(ctx, map[string]any{
		"until": future,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.WaitedMs < 900 {
		t.Errorf("expected ~2000ms wait, got %dms", result.WaitedMs)
	}
	if result.Deadline == "" {
		t.Error("expected deadline to be set")
	}
}

func TestExecuteWaitNode_InvalidUntil(t *testing.T) {
	ctx := context.Background()
	_, err := ExecuteWaitNode(ctx, map[string]any{
		"until": "not-a-timestamp",
	})
	if err == nil {
		t.Fatal("expected error for invalid timestamp")
	}
}

func TestExecuteWaitNode_MaxWaitClamp(t *testing.T) {
	ctx := context.Background()
	// Request 48h but max is 24h — should clamp
	start := time.Now()
	_, err := ExecuteWaitNode(ctx, map[string]any{
		"duration": int((48 * time.Hour) / time.Second),
		"max_wait": 1, // Override to 1 second max
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	elapsed := time.Since(start)
	if elapsed > 2*time.Second {
		t.Errorf("max_wait clamp failed: elapsed %v", elapsed)
	}
}

func TestExecuteWaitNode_DurationTakesPrecedence(t *testing.T) {
	ctx := context.Background()
	future := time.Now().Add(10 * time.Second).Format(time.RFC3339)
	result, err := ExecuteWaitNode(ctx, map[string]any{
		"duration": 1,      // 1 second — should take precedence
		"until":    future, // 10 seconds
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.WaitedMs < 900 {
		t.Errorf("expected ~1000ms, got %dms", result.WaitedMs)
	}
}

func TestExecuteWaitNode_DurationMsTakesPrecedence(t *testing.T) {
	ctx := context.Background()
	_, err := ExecuteWaitNode(ctx, map[string]any{
		"duration":    10,  // 10 seconds
		"duration_ms": 100, // 100ms — should take precedence
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestExecuteWaitNode_Float64Duration(t *testing.T) {
	ctx := context.Background()
	result, err := ExecuteWaitNode(ctx, map[string]any{
		"duration": float64(1), // float64 input
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.WaitedMs < 900 {
		t.Errorf("expected ~1000ms, got %dms", result.WaitedMs)
	}
}

func TestToInt64(t *testing.T) {
	tests := []struct {
		input    any
		expected int64
		ok       bool
	}{
		{int(42), 42, true},
		{int64(42), 42, true},
		{float64(42.5), 42, true},
		{"42", 42, true},
		{"not-a-number", 0, false},
		{nil, 0, false},
		{true, 0, false},
	}

	for _, tt := range tests {
		result, ok := toInt64(tt.input)
		if ok != tt.ok {
			t.Errorf("toInt64(%v): ok=%v, want %v", tt.input, ok, tt.ok)
		}
		if ok && result != tt.expected {
			t.Errorf("toInt64(%v): got %d, want %d", tt.input, result, tt.expected)
		}
	}
}
