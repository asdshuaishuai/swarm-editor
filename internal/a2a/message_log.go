package a2a

import (
	"encoding/json"
	"sync"
	"time"
)

// LogEntry represents a single message in the audit log.
type LogEntry struct {
	ID        string          `json:"id"`
	Type      MessageType     `json:"type"`
	From      string          `json:"from"`
	To        string          `json:"to"`
	Group     string          `json:"group,omitempty"`
	Payload   json.RawMessage `json:"payload,omitempty"`
	Timestamp time.Time       `json:"timestamp"`
}

// MessageLog is a ring buffer that records recent A2A messages for auditing.
type MessageLog struct {
	mu      sync.RWMutex
	entries []*LogEntry
	cap     int
	head    int
	count   int
}

// NewMessageLog creates a ring buffer with the given capacity.
func NewMessageLog(capacity int) *MessageLog {
	if capacity <= 0 {
		capacity = 1000
	}
	return &MessageLog{
		entries: make([]*LogEntry, capacity),
		cap:     capacity,
	}
}

// Append adds a message to the log.
func (l *MessageLog) Append(msg *Message) {
	if msg == nil {
		return
	}

	entry := &LogEntry{
		ID:        msg.ID,
		Type:      msg.Type,
		From:      msg.From,
		To:        msg.To,
		Group:     msg.Group,
		Payload:   msg.Payload,
		Timestamp: time.Now(),
	}

	l.mu.Lock()
	idx := (l.head + l.count) % l.cap
	l.entries[idx] = entry
	if l.count < l.cap {
		l.count++
	} else {
		l.head = (l.head + 1) % l.cap
	}
	l.mu.Unlock()
}

// Recent returns the last N entries (most recent last).
func (l *MessageLog) Recent(n int) []*LogEntry {
	l.mu.RLock()
	defer l.mu.RUnlock()

	if n <= 0 || n > l.count {
		n = l.count
	}

	result := make([]*LogEntry, 0, n)
	// Read from oldest to newest
	for i := 0; i < l.count && len(result) < n; i++ {
		idx := (l.head + i) % l.cap
		result = append(result, l.entries[idx])
	}
	return result
}

// Len returns the number of logged entries.
func (l *MessageLog) Len() int {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.count
}

// Clear removes all entries.
func (l *MessageLog) Clear() {
	l.mu.Lock()
	l.entries = make([]*LogEntry, l.cap)
	l.head = 0
	l.count = 0
	l.mu.Unlock()
}

// Stats returns summary statistics.
func (l *MessageLog) Stats() map[string]any {
	l.mu.RLock()
	defer l.mu.RUnlock()

	typeCount := make(map[string]int)
	for i := 0; i < l.count; i++ {
		idx := (l.head + i) % l.cap
		if l.entries[idx] != nil {
			typeCount[string(l.entries[idx].Type)]++
		}
	}

	return map[string]any{
		"totalEntries": l.count,
		"capacity":     l.cap,
		"byType":       typeCount,
	}
}
