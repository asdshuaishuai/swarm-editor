package utils

import (
	"context"
	"testing"
	"time"
)

func TestContextWithTimeout(t *testing.T) {
	// Test with positive timeout
	ctx, cancel := ContextWithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	select {
	case <-ctx.Done():
		t.Error("context should not be done immediately")
	case <-time.After(50 * time.Millisecond):
		// Expected
	}

	// Wait for timeout
	select {
	case <-ctx.Done():
		// Expected
	case <-time.After(100 * time.Millisecond):
		t.Error("context should be done after timeout")
	}

	// Test with zero timeout
	ctx2, cancel2 := ContextWithTimeout(context.Background(), 0)
	defer cancel2()

	select {
	case <-ctx2.Done():
		t.Error("context with zero timeout should not be done immediately")
	case <-time.After(50 * time.Millisecond):
		// Expected
	}

	// Test with negative timeout
	ctx3, cancel3 := ContextWithTimeout(context.Background(), -1*time.Second)
	defer cancel3()

	select {
	case <-ctx3.Done():
		t.Error("context with negative timeout should not be done immediately")
	case <-time.After(50 * time.Millisecond):
		// Expected
	}
}

func TestContextWithDeadline(t *testing.T) {
	// Test with future deadline
	deadline := time.Now().Add(100 * time.Millisecond)
	ctx, cancel := ContextWithDeadline(context.Background(), deadline)
	defer cancel()

	select {
	case <-ctx.Done():
		t.Error("context should not be done immediately")
	case <-time.After(50 * time.Millisecond):
		// Expected
	}

	// Wait for deadline
	select {
	case <-ctx.Done():
		// Expected
	case <-time.After(100 * time.Millisecond):
		t.Error("context should be done after deadline")
	}

	// Test with zero deadline
	ctx2, cancel2 := ContextWithDeadline(context.Background(), time.Time{})
	defer cancel2()

	select {
	case <-ctx2.Done():
		t.Error("context with zero deadline should not be done immediately")
	case <-time.After(50 * time.Millisecond):
		// Expected
	}
}

func TestMergeContexts(t *testing.T) {
	ctx1, cancel1 := context.WithCancel(context.Background())
	ctx2, cancel2 := context.WithCancel(context.Background())
	defer cancel2() // Ensure ctx2 is cleaned up

	merged, mergedCancel := MergeContexts(ctx1, ctx2)
	defer mergedCancel()

	// Merged context should not be done initially
	select {
	case <-merged.Done():
		t.Error("merged context should not be done initially")
	default:
		// Expected
	}

	// Cancel first context
	cancel1()

	// Merged context should now be done
	select {
	case <-merged.Done():
		// Expected
	case <-time.After(100 * time.Millisecond):
		t.Error("merged context should be done when first parent is cancelled")
	}

	// Test with second context
	ctx3, cancel3 := context.WithCancel(context.Background())
	ctx4, cancel4 := context.WithCancel(context.Background())
	defer cancel3() // Clean up ctx3

	merged2, mergedCancel2 := MergeContexts(ctx3, ctx4)
	defer mergedCancel2()

	// Cancel second context
	cancel4()

	select {
	case <-merged2.Done():
		// Expected
	case <-time.After(100 * time.Millisecond):
		t.Error("merged context should be done when second parent is cancelled")
	}
}

func TestContextWithValue(t *testing.T) {
	ctx := context.Background()

	// Set and get value
	ctx = ContextWithValue(ctx, "test_key", "test_value")

	val, ok := ValueFromContext[string](ctx, "test_key")
	if !ok {
		t.Fatal("value should be found")
	}
	if val != "test_value" {
		t.Errorf("expected 'test_value', got '%s'", val)
	}

	// Get non-existent key
	_, ok = ValueFromContext[string](ctx, "nonexistent")
	if ok {
		t.Error("nonexistent key should not be found")
	}

	// Test with different type
	ctx = ContextWithValue(ctx, "int_key", 42)
	intVal, ok := ValueFromContext[int](ctx, "int_key")
	if !ok {
		t.Fatal("int value should be found")
	}
	if intVal != 42 {
		t.Errorf("expected 42, got %d", intVal)
	}

	// Test type assertion failure
	_, ok = ValueFromContext[string](ctx, "int_key")
	if ok {
		t.Error("should not find string when int was stored")
	}
}

func TestWithRequestID(t *testing.T) {
	ctx := context.Background()

	// Get from empty context
	if id := GetRequestID(ctx); id != "" {
		t.Errorf("empty context should return empty string, got '%s'", id)
	}

	// Set and get
	ctx = WithRequestID(ctx, "req-123")
	if id := GetRequestID(ctx); id != "req-123" {
		t.Errorf("expected 'req-123', got '%s'", id)
	}
}

func TestWithSessionID(t *testing.T) {
	ctx := context.Background()

	if id := GetSessionID(ctx); id != "" {
		t.Errorf("empty context should return empty string, got '%s'", id)
	}

	ctx = WithSessionID(ctx, "session-456")
	if id := GetSessionID(ctx); id != "session-456" {
		t.Errorf("expected 'session-456', got '%s'", id)
	}
}

func TestWithAgentID(t *testing.T) {
	ctx := context.Background()

	if id := GetAgentID(ctx); id != "" {
		t.Errorf("empty context should return empty string, got '%s'", id)
	}

	ctx = WithAgentID(ctx, "agent-789")
	if id := GetAgentID(ctx); id != "agent-789" {
		t.Errorf("expected 'agent-789', got '%s'", id)
	}
}

func TestWithStartTime(t *testing.T) {
	ctx := context.Background()

	// Get from empty context
	if st := GetStartTime(ctx); !st.IsZero() {
		t.Errorf("empty context should return zero time, got %v", st)
	}

	// Set and get
	now := time.Now()
	ctx = WithStartTime(ctx, now)
	st := GetStartTime(ctx)
	if st.IsZero() {
		t.Fatal("start time should not be zero")
	}

	// Allow for small time difference due to precision
	diff := st.Sub(now)
	if diff < -time.Millisecond || diff > time.Millisecond {
		t.Errorf("expected %v, got %v", now, st)
	}
}

func TestElapsed(t *testing.T) {
	ctx := context.Background()

	// Test with no start time
	if e := Elapsed(ctx); e != 0 {
		t.Errorf("elapsed with no start time should be 0, got %v", e)
	}

	// Test with start time
	start := time.Now().Add(-100 * time.Millisecond)
	ctx = WithStartTime(ctx, start)

	elapsed := Elapsed(ctx)
	if elapsed < 90*time.Millisecond || elapsed > 200*time.Millisecond {
		t.Errorf("elapsed should be around 100ms, got %v", elapsed)
	}
}

func TestContextKeys(t *testing.T) {
	// Test that context keys don't conflict
	ctx := context.Background()
	ctx = WithRequestID(ctx, "req-1")
	ctx = WithSessionID(ctx, "sess-1")
	ctx = WithAgentID(ctx, "agent-1")
	ctx = WithStartTime(ctx, time.Now())

	// All values should be retrievable
	if GetRequestID(ctx) != "req-1" {
		t.Error("request ID mismatch")
	}
	if GetSessionID(ctx) != "sess-1" {
		t.Error("session ID mismatch")
	}
	if GetAgentID(ctx) != "agent-1" {
		t.Error("agent ID mismatch")
	}
	if GetStartTime(ctx).IsZero() {
		t.Error("start time should not be zero")
	}
}
