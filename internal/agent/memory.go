// Package agent implements a three-layer memory system for agents.
// Inspired by CrewAI's Short/Long/Shared memory architecture:
//   - ShortTermMemory: per-agent, bounded, session-scoped (recent context)
//   - LongTermMemory: per-agent, persistent, cross-session (learned patterns)
//   - SharedMemory: cross-agent, bounded, team-scoped (collaboration context)
package agent

import (
	"sync"
	"time"
)

// MemoryEntry represents a single memory item with metadata.
type MemoryEntry struct {
	Key       string    `json:"key"`
	Value     any       `json:"value"`
	Timestamp time.Time `json:"timestamp"`
	TTL       time.Duration `json:"ttl,omitempty"` // 0 = no expiry
	Tags      []string  `json:"tags,omitempty"`
}

// ShortTermMemory holds recent, bounded memory for a single agent.
// Inspired by CrewAI's ShortMemory: auto-expires old entries,
// bounded by maxEntries, useful for current task context.
type ShortTermMemory struct {
	mu         sync.RWMutex
	entries    []MemoryEntry
	maxEntries int
}

// NewShortTermMemory creates a short-term memory with bounded capacity.
func NewShortTermMemory(maxEntries int) *ShortTermMemory {
	if maxEntries <= 0 {
		maxEntries = 100
	}
	return &ShortTermMemory{
		entries:    make([]MemoryEntry, 0, maxEntries),
		maxEntries: maxEntries,
	}
}

// Set stores a value. Overwrites existing key.
func (m *ShortTermMemory) Set(key string, value any) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Check for existing entry to update in-place
	for i, e := range m.entries {
		if e.Key == key {
			m.entries[i].Value = value
			m.entries[i].Timestamp = time.Now()
			return
		}
	}

	// Add new entry
	entry := MemoryEntry{Key: key, Value: value, Timestamp: time.Now()}
	m.entries = append(m.entries, entry)

	// Evict oldest if at capacity
	if len(m.entries) > m.maxEntries {
		m.entries = m.entries[len(m.entries)-m.maxEntries:]
	}
}

// Get retrieves a value by key. Returns (value, true) or (nil, false).
func (m *ShortTermMemory) Get(key string) (any, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, e := range m.entries {
		if e.Key == key {
			return e.Value, true
		}
	}
	return nil, false
}

// Delete removes an entry by key.
func (m *ShortTermMemory) Delete(key string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for i, e := range m.entries {
		if e.Key == key {
			m.entries = append(m.entries[:i], m.entries[i+1:]...)
			return
		}
	}
}

// EvictExpired removes entries past their TTL.
func (m *ShortTermMemory) EvictExpired() {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()
	kept := make([]MemoryEntry, 0, len(m.entries))
	for _, e := range m.entries {
		if e.TTL > 0 && now.Sub(e.Timestamp) > e.TTL {
			continue
		}
		kept = append(kept, e)
	}
	m.entries = kept
}

// Entries returns a copy of all entries.
func (m *ShortTermMemory) Entries() []MemoryEntry {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]MemoryEntry, len(m.entries))
	copy(result, m.entries)
	return result
}

// Len returns the current number of entries.
func (m *ShortTermMemory) Len() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.entries)
}

// Clear removes all entries.
func (m *ShortTermMemory) Clear() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.entries = m.entries[:0]
}

// LongTermMemory holds persistent memory for a single agent.
// Inspired by CrewAI's LongMemory: unbounded (with optional cap),
// survives across sessions, stores learned patterns and important context.
type LongTermMemory struct {
	mu         sync.RWMutex
	entries    map[string]MemoryEntry
	maxEntries int // 0 = unlimited
}

// NewLongTermMemory creates a long-term memory. If maxEntries > 0, oldest-timestamp eviction applies.
func NewLongTermMemory(maxEntries int) *LongTermMemory {
	return &LongTermMemory{
		entries:    make(map[string]MemoryEntry),
		maxEntries: maxEntries,
	}
}

// Set stores a value persistently.
func (m *LongTermMemory) Set(key string, value any) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.entries[key] = MemoryEntry{Key: key, Value: value, Timestamp: time.Now()}

	// LRU eviction if bounded
	if m.maxEntries > 0 && len(m.entries) > m.maxEntries {
		// Evict oldest entry
		var oldestKey string
		var oldestTime time.Time
		for k, e := range m.entries {
			if oldestTime.IsZero() || e.Timestamp.Before(oldestTime) {
				oldestTime = e.Timestamp
				oldestKey = k
			}
		}
		if oldestKey != "" {
			delete(m.entries, oldestKey)
		}
	}
}

// Get retrieves a value by key.
func (m *LongTermMemory) Get(key string) (any, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	e, ok := m.entries[key]
	if !ok {
		return nil, false
	}
	return e.Value, true
}

// Delete removes a key.
func (m *LongTermMemory) Delete(key string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.entries, key)
}

// Entries returns a copy of all entries.
func (m *LongTermMemory) Entries() []MemoryEntry {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]MemoryEntry, 0, len(m.entries))
	for _, e := range m.entries {
		result = append(result, e)
	}
	return result
}

// Len returns the current number of entries.
func (m *LongTermMemory) Len() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.entries)
}

// Clear removes all entries.
func (m *LongTermMemory) Clear() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.entries = make(map[string]MemoryEntry)
}

// SharedMemory holds memory shared across all agents in a team.
// Inspired by CrewAI's SharedMemory: bounded, team-scoped,
// useful for shared context, decisions, and collaboration artifacts.
type SharedMemory struct {
	mu         sync.RWMutex
	entries    map[string]MemoryEntry
	maxEntries int
}

// NewSharedMemory creates a shared memory with bounded capacity.
func NewSharedMemory(maxEntries int) *SharedMemory {
	if maxEntries <= 0 {
		maxEntries = 200
	}
	return &SharedMemory{
		entries:    make(map[string]MemoryEntry),
		maxEntries: maxEntries,
	}
}

// Set stores a team-scoped value with owner tracking.
// The ownerAgentID is stored in the entry's Tags for per-entry tracking.
func (m *SharedMemory) Set(key string, value any, ownerAgentID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	tags := []string{"shared", "owner:" + ownerAgentID}
	m.entries[key] = MemoryEntry{
		Key:       key,
		Value:     value,
		Timestamp: time.Now(),
		Tags:      tags,
	}

	// Evict oldest if at capacity
	if len(m.entries) > m.maxEntries {
		var oldestKey string
		var oldestTime time.Time
		for k, e := range m.entries {
			if oldestTime.IsZero() || e.Timestamp.Before(oldestTime) {
				oldestTime = e.Timestamp
				oldestKey = k
			}
		}
		if oldestKey != "" {
			delete(m.entries, oldestKey)
		}
	}
}

// Get retrieves a team-scoped value.
func (m *SharedMemory) Get(key string) (any, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	e, ok := m.entries[key]
	if !ok {
		return nil, false
	}
	return e.Value, true
}

// Delete removes a team-scoped value.
func (m *SharedMemory) Delete(key string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.entries, key)
}

// Entries returns a copy of all entries.
func (m *SharedMemory) Entries() []MemoryEntry {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]MemoryEntry, 0, len(m.entries))
	for _, e := range m.entries {
		result = append(result, e)
	}
	return result
}

// Len returns the current number of entries.
func (m *SharedMemory) Len() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.entries)
}

// Clear removes all entries.
func (m *SharedMemory) Clear() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.entries = make(map[string]MemoryEntry)
}

// SearchByTag returns entries matching any of the given tags.
func (m *SharedMemory) SearchByTag(tags ...string) []MemoryEntry {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []MemoryEntry
	tagSet := make(map[string]struct{}, len(tags))
	for _, t := range tags {
		tagSet[t] = struct{}{}
	}

	for _, e := range m.entries {
		for _, tag := range e.Tags {
			if _, ok := tagSet[tag]; ok {
				result = append(result, e)
				break
			}
		}
	}
	return result
}
