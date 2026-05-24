package acp

import (
	"sync"
	"time"
)

// LogEntry represents a single stdout/stderr line from an agent process.
type LogEntry struct {
	Line      string    `json:"line"`
	Stream    string    `json:"stream"` // "stdout" or "stderr"
	Timestamp time.Time `json:"timestamp"`
}

// LogRingBuffer is a fixed-capacity ring buffer for process log lines.
// Design Doc Section 2: 5000-line ring buffer with overflow.
type LogRingBuffer struct {
	mu      sync.RWMutex
	entries []LogEntry
	cap     int
	head    int
	count   int
}

// NewLogRingBuffer creates a ring buffer with the given line capacity.
func NewLogRingBuffer(capacity int) *LogRingBuffer {
	if capacity <= 0 {
		capacity = 5000
	}
	return &LogRingBuffer{
		entries: make([]LogEntry, capacity),
		cap:     capacity,
	}
}

// Append adds a log line to the buffer.
func (b *LogRingBuffer) Append(line, stream string) {
	b.mu.Lock()
	idx := (b.head + b.count) % b.cap
	b.entries[idx] = LogEntry{
		Line:      line,
		Stream:    stream,
		Timestamp: time.Now(),
	}
	if b.count < b.cap {
		b.count++
	} else {
		b.head = (b.head + 1) % b.cap
	}
	b.mu.Unlock()
}

// Recent returns the last n log entries (or all if n > count).
func (b *LogRingBuffer) Recent(n int) []LogEntry {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if n > b.count {
		n = b.count
	}

	result := make([]LogEntry, n)
	for i := 0; i < n; i++ {
		idx := (b.head + b.count - n + i) % b.cap
		result[i] = b.entries[idx]
	}
	return result
}

// Len returns the number of entries currently in the buffer.
func (b *LogRingBuffer) Len() int {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.count
}

// Clear removes all entries.
func (b *LogRingBuffer) Clear() {
	b.mu.Lock()
	b.head = 0
	b.count = 0
	b.mu.Unlock()
}
