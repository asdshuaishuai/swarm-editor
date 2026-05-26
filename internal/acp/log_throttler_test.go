package acp

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestLogThrottler_BatchesEntries(t *testing.T) {
	var mu sync.Mutex
	var batches [][]LogEntry
	tr := NewLogThrottler(20*time.Millisecond, func(b []LogEntry) {
		mu.Lock()
		batches = append(batches, b)
		mu.Unlock()
	})
	defer tr.Stop()

	for i := 0; i < 50; i++ {
		tr.Push(LogEntry{Line: "x", Stream: "stderr"})
	}

	time.Sleep(60 * time.Millisecond)

	mu.Lock()
	defer mu.Unlock()
	if len(batches) == 0 {
		t.Fatal("expected at least one batch")
	}
	total := 0
	for _, b := range batches {
		total += len(b)
	}
	if total != 50 {
		t.Errorf("expected 50 entries flushed, got %d", total)
	}
	// 50 pushes within 60ms (1 interval window) should produce 1-2 batches, not 50.
	if len(batches) > 4 {
		t.Errorf("expected ≤4 batches (throttled), got %d", len(batches))
	}
}

func TestLogThrottler_DefaultInterval(t *testing.T) {
	tr := NewLogThrottler(0, func([]LogEntry) {})
	defer tr.Stop()
	if tr.interval != 33*time.Millisecond {
		t.Errorf("expected default 33ms, got %v", tr.interval)
	}
}

func TestLogThrottler_Stop(t *testing.T) {
	var count atomic.Int32
	tr := NewLogThrottler(10*time.Millisecond, func(b []LogEntry) {
		count.Add(int32(len(b)))
	})
	tr.Push(LogEntry{Line: "a"})
	tr.Stop()
	time.Sleep(30 * time.Millisecond)
	// Stop before flush; entries dropped
	if count.Load() != 0 {
		t.Errorf("expected 0 flushed after stop, got %d", count.Load())
	}
}

func TestLogThrottler_PendingCount(t *testing.T) {
	tr := NewLogThrottler(500*time.Millisecond, func([]LogEntry) {})
	defer tr.Stop()
	tr.Push(LogEntry{Line: "a"})
	tr.Push(LogEntry{Line: "b"})
	if tr.Pending() != 2 {
		t.Errorf("expected 2 pending, got %d", tr.Pending())
	}
}

func TestLogThrottler_NoFlushOnEmpty(t *testing.T) {
	var calls atomic.Int32
	tr := NewLogThrottler(10*time.Millisecond, func([]LogEntry) {
		calls.Add(1)
	})
	defer tr.Stop()
	time.Sleep(30 * time.Millisecond)
	if calls.Load() != 0 {
		t.Errorf("expected no flush without pushes, got %d", calls.Load())
	}
}

func TestLogThrottler_StopIsIdempotent(t *testing.T) {
	tr := NewLogThrottler(10*time.Millisecond, func([]LogEntry) {})
	tr.Stop()
	tr.Stop() // should not panic
}

func TestLogThrottler_OverflowDropsEntries(t *testing.T) {
	// Use a long interval so nothing flushes during the burst
	tr := NewLogThrottler(time.Hour, func([]LogEntry) {})
	defer tr.Stop()

	for i := 0; i < MaxPendingEntries+500; i++ {
		tr.Push(LogEntry{Line: "x", Stream: "stderr"})
	}

	if tr.Pending() != MaxPendingEntries {
		t.Errorf("expected pending=%d (capped), got %d", MaxPendingEntries, tr.Pending())
	}
	if tr.Dropped() != 500 {
		t.Errorf("expected 500 dropped, got %d", tr.Dropped())
	}
}

func TestLogThrottler_DroppedAccumulates(t *testing.T) {
	tr := NewLogThrottler(time.Hour, func([]LogEntry) {})
	defer tr.Stop()
	// Fill to cap
	for i := 0; i < MaxPendingEntries; i++ {
		tr.Push(LogEntry{Line: "x"})
	}
	// Now every push is dropped
	for i := 0; i < 7; i++ {
		tr.Push(LogEntry{Line: "y"})
	}
	if tr.Dropped() != 7 {
		t.Errorf("expected 7 dropped, got %d", tr.Dropped())
	}
}
