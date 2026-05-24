package acp

import (
	"strings"
	"sync"
	"testing"
)

func TestNewLogRingBuffer_DefaultCapacity(t *testing.T) {
	b := NewLogRingBuffer(0)
	if b.cap != 5000 {
		t.Errorf("expected default cap 5000, got %d", b.cap)
	}
	b = NewLogRingBuffer(-1)
	if b.cap != 5000 {
		t.Errorf("expected default cap 5000 for negative, got %d", b.cap)
	}
}

func TestNewLogRingBuffer_CustomCapacity(t *testing.T) {
	b := NewLogRingBuffer(100)
	if b.cap != 100 {
		t.Errorf("expected cap 100, got %d", b.cap)
	}
}

func TestLogRingBuffer_AppendAndRecent(t *testing.T) {
	b := NewLogRingBuffer(5)

	b.Append("line1", "stdout")
	b.Append("line2", "stderr")
	b.Append("line3", "stdout")

	if b.Len() != 3 {
		t.Fatalf("expected len 3, got %d", b.Len())
	}

	entries := b.Recent(2)
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}
	if entries[0].Line != "line2" {
		t.Errorf("expected line2, got %s", entries[0].Line)
	}
	if entries[1].Line != "line3" {
		t.Errorf("expected line3, got %s", entries[1].Line)
	}
}

func TestLogRingBuffer_Overflow(t *testing.T) {
	b := NewLogRingBuffer(3)

	for i := 0; i < 5; i++ {
		b.Append(strings.Repeat("x", i+1), "stdout")
	}

	if b.Len() != 3 {
		t.Fatalf("expected len 3 after overflow, got %d", b.Len())
	}

	entries := b.Recent(3)
	if len(entries) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(entries))
	}
	// Should have last 3: "xxx", "xxxx", "xxxxx"
	if entries[0].Line != "xxx" {
		t.Errorf("expected xxx, got %s", entries[0].Line)
	}
	if entries[1].Line != "xxxx" {
		t.Errorf("expected xxxx, got %s", entries[1].Line)
	}
	if entries[2].Line != "xxxxx" {
		t.Errorf("expected xxxxx, got %s", entries[2].Line)
	}
}

func TestLogRingBuffer_RecentMoreThanCount(t *testing.T) {
	b := NewLogRingBuffer(10)
	b.Append("a", "stdout")
	b.Append("b", "stderr")

	entries := b.Recent(100)
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}
	if entries[0].Line != "a" {
		t.Errorf("expected a, got %s", entries[0].Line)
	}
	if entries[1].Line != "b" {
		t.Errorf("expected b, got %s", entries[1].Line)
	}
}

func TestLogRingBuffer_RecentZero(t *testing.T) {
	b := NewLogRingBuffer(5)
	b.Append("a", "stdout")

	entries := b.Recent(0)
	if len(entries) != 0 {
		t.Errorf("expected 0 entries, got %d", len(entries))
	}
}

func TestLogRingBuffer_EmptyRecent(t *testing.T) {
	b := NewLogRingBuffer(5)

	entries := b.Recent(10)
	if len(entries) != 0 {
		t.Errorf("expected 0 entries from empty buffer, got %d", len(entries))
	}
	if b.Len() != 0 {
		t.Errorf("expected len 0, got %d", b.Len())
	}
}

func TestLogRingBuffer_Clear(t *testing.T) {
	b := NewLogRingBuffer(5)
	b.Append("a", "stdout")
	b.Append("b", "stderr")

	b.Clear()

	if b.Len() != 0 {
		t.Errorf("expected len 0 after clear, got %d", b.Len())
	}
	entries := b.Recent(10)
	if len(entries) != 0 {
		t.Errorf("expected 0 entries after clear, got %d", len(entries))
	}
}

func TestLogRingBuffer_StreamField(t *testing.T) {
	b := NewLogRingBuffer(5)
	b.Append("out", "stdout")
	b.Append("err", "stderr")

	entries := b.Recent(2)
	if entries[0].Stream != "stdout" {
		t.Errorf("expected stdout, got %s", entries[0].Stream)
	}
	if entries[1].Stream != "stderr" {
		t.Errorf("expected stderr, got %s", entries[1].Stream)
	}
}

func TestLogRingBuffer_TimestampSet(t *testing.T) {
	b := NewLogRingBuffer(5)
	b.Append("a", "stdout")

	entries := b.Recent(1)
	if entries[0].Timestamp.IsZero() {
		t.Error("expected non-zero timestamp")
	}
}

func TestLogRingBuffer_ConcurrentAccess(t *testing.T) {
	b := NewLogRingBuffer(100)
	var wg sync.WaitGroup

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				b.Append("line", "stdout")
			}
		}(i)
	}

	wg.Wait()

	if b.Len() != 100 {
		t.Errorf("expected len 100 after overflow, got %d", b.Len())
	}
}

func TestLogRingBuffer_SingleCapacity(t *testing.T) {
	b := NewLogRingBuffer(1)
	b.Append("a", "stdout")
	b.Append("b", "stdout")

	if b.Len() != 1 {
		t.Fatalf("expected len 1, got %d", b.Len())
	}
	entries := b.Recent(1)
	if entries[0].Line != "b" {
		t.Errorf("expected b, got %s", entries[0].Line)
	}
}

func TestLogRingBuffer_DoubleOverflow(t *testing.T) {
	b := NewLogRingBuffer(3)

	for i := 0; i < 10; i++ {
		b.Append(string(rune('a'+i)), "stdout")
	}

	if b.Len() != 3 {
		t.Fatalf("expected len 3, got %d", b.Len())
	}

	entries := b.Recent(3)
	if entries[0].Line != "h" {
		t.Errorf("expected h, got %s", entries[0].Line)
	}
	if entries[1].Line != "i" {
		t.Errorf("expected i, got %s", entries[1].Line)
	}
	if entries[2].Line != "j" {
		t.Errorf("expected j, got %s", entries[2].Line)
	}
}
