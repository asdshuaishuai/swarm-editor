package acp

import (
	"sync"
	"time"
)

// MaxPendingEntries caps the throttler's in-memory buffer so a slow flush
// callback can't cause unbounded growth under burst load.
const MaxPendingEntries = 10000

// LogThrottler batches log entries and flushes them at a maximum rate.
// Design Doc Section 2: throttle log pushes to ~30Hz to prevent client overload.
type LogThrottler struct {
	mu       sync.Mutex
	interval time.Duration
	pending  []LogEntry
	timer    *time.Timer
	flush    func([]LogEntry)
	stopped  bool
	dropped  int // count of entries dropped due to overflow
}

// NewLogThrottler creates a throttler that flushes batches at most once per interval.
// A typical interval is 33ms (~30Hz).
func NewLogThrottler(interval time.Duration, flush func([]LogEntry)) *LogThrottler {
	if interval <= 0 {
		interval = 33 * time.Millisecond
	}
	return &LogThrottler{
		interval: interval,
		flush:    flush,
	}
}

// Push adds an entry and schedules a flush. Entries beyond MaxPendingEntries
// are dropped (oldest preserved) — the dropped count is queryable via Dropped().
func (t *LogThrottler) Push(entry LogEntry) {
	t.mu.Lock()
	if t.stopped {
		t.mu.Unlock()
		return
	}
	if len(t.pending) >= MaxPendingEntries {
		// Buffer full — drop newest to avoid OOM under sustained burst.
		t.dropped++
		t.mu.Unlock()
		return
	}
	t.pending = append(t.pending, entry)
	if t.timer == nil {
		t.timer = time.AfterFunc(t.interval, t.doFlush)
	}
	t.mu.Unlock()
}

// Dropped returns the count of entries dropped due to overflow since
// the throttler was created. Useful for surfacing back-pressure metrics.
func (t *LogThrottler) Dropped() int {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.dropped
}

func (t *LogThrottler) doFlush() {
	t.mu.Lock()
	if t.stopped {
		t.mu.Unlock()
		return
	}
	batch := t.pending
	t.pending = nil
	t.timer = nil
	flush := t.flush
	t.mu.Unlock()

	if len(batch) > 0 && flush != nil {
		flush(batch)
	}
}

// Stop cancels any pending flush. Safe to call multiple times.
func (t *LogThrottler) Stop() {
	t.mu.Lock()
	t.stopped = true
	if t.timer != nil {
		t.timer.Stop()
		t.timer = nil
	}
	t.pending = nil
	t.mu.Unlock()
}

// Pending returns the count of buffered entries waiting to flush.
func (t *LogThrottler) Pending() int {
	t.mu.Lock()
	defer t.mu.Unlock()
	return len(t.pending)
}
