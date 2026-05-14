// Package agent implements a three-layer memory system for agents.
// Inspired by CrewAI's Short/Long/Shared memory architecture:
//   - ShortTermMemory: per-agent, bounded, session-scoped (recent context)
//   - LongTermMemory: per-agent, persistent, cross-session (learned patterns)
//   - SharedMemory: cross-agent, bounded, team-scoped (collaboration context)
package agent

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
)

// MemoryEntry represents a single memory item with metadata.
type MemoryEntry struct {
	Key       string        `json:"key"`
	Value     any           `json:"value"`
	Timestamp time.Time     `json:"timestamp"`
	TTL       time.Duration `json:"ttl,omitempty"` // 0 = no expiry
	Tags      []string      `json:"tags,omitempty"`

	// Importance is a 0.0-1.0 score set by the agent when storing.
	// Inspired by CrewAI's memory importance scoring:
	// higher importance = more likely to be retrieved in search.
	// 0.0 = ephemeral, 1.0 = critical.
	Importance float64 `json:"importance,omitempty"`

	// LastAccessedAt tracks when this entry was last retrieved.
	// Used for recency scoring in composite memory search.
	LastAccessedAt time.Time `json:"lastAccessedAt,omitempty"`
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

// Set stores a value with optional importance score. Overwrites existing key.
// Importance is a 0.0-1.0 score for composite memory search ranking.
func (m *ShortTermMemory) Set(key string, value any, importance ...float64) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Check for existing entry to update in-place
	for i, e := range m.entries {
		if e.Key == key {
			m.entries[i].Value = value
			m.entries[i].Timestamp = time.Now()
			if len(importance) > 0 {
				m.entries[i].Importance = clampImportance(importance[0])
			}
			return
		}
	}

	// Add new entry
	entry := MemoryEntry{Key: key, Value: value, Timestamp: time.Now()}
	if len(importance) > 0 {
		entry.Importance = clampImportance(importance[0])
	}
	m.entries = append(m.entries, entry)

	// Evict oldest if at capacity
	if len(m.entries) > m.maxEntries {
		m.entries = m.entries[len(m.entries)-m.maxEntries:]
	}
}

// Get retrieves a value by key. Returns (value, true) or (nil, false).
// Returns a deep copy of the value to prevent mutation of internal state.
// Updates LastAccessedAt for recency scoring (best-effort, outside read lock).
func (m *ShortTermMemory) Get(key string) (any, bool) {
	m.mu.RLock()
	for i, e := range m.entries {
		if e.Key == key {
			val := deepCopyValue(e.Value)
			m.mu.RUnlock()
			// Best-effort update outside read lock to avoid serializing reads.
			// Re-lookup by key; if entry was evicted/shifted, the update is harmlessly skipped.
			m.mu.Lock()
			if i < len(m.entries) && m.entries[i].Key == key {
				m.entries[i].LastAccessedAt = time.Now()
			}
			m.mu.Unlock()
			return val, true
		}
	}
	m.mu.RUnlock()
	return nil, false
}

// deepCopyValue creates a deep copy of a value using JSON round-trip.
// This prevents callers from mutating internal state.
func deepCopyValue(v any) any {
	if v == nil {
		return nil
	}
	// For immutable scalar types, return as-is (no need to copy)
	switch val := v.(type) {
	case bool, int, int8, int16, int32, int64,
		uint, uint8, uint16, uint32, uint64,
		float32, float64, string:
		return val
	}
	// For reference types, use JSON round-trip
	data, err := json.Marshal(v)
	if err != nil {
		// For non-JSON-serializable values, return as-is (caller beware)
		return v
	}
	var cp any
	if err := json.Unmarshal(data, &cp); err != nil {
		// For unmarshal errors, return as-is (caller beware)
		return v
	}
	return cp
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
// Inspired by CrewAI's LongMemory: bounded (default 1000 entries),
// survives across sessions, stores learned patterns and important context.
// Use maxEntries=0 for unlimited (not recommended for long-running agents).
type LongTermMemory struct {
	mu         sync.RWMutex
	entries    map[string]MemoryEntry
	maxEntries int // 0 = unlimited (use with caution)
}

// DefaultLongTermMemorySize is the default capacity for LongTermMemory.
const DefaultLongTermMemorySize = 1000

// NewLongTermMemory creates a long-term memory. If maxEntries <= 0, uses DefaultLongTermMemorySize.
// LRU eviction applies when capacity is exceeded.
func NewLongTermMemory(maxEntries int) *LongTermMemory {
	if maxEntries <= 0 {
		maxEntries = DefaultLongTermMemorySize
	}
	return &LongTermMemory{
		entries:    make(map[string]MemoryEntry),
		maxEntries: maxEntries,
	}
}

// Set stores a value persistently with optional importance score.
func (m *LongTermMemory) Set(key string, value any, importance ...float64) {
	m.mu.Lock()
	defer m.mu.Unlock()

	entry := MemoryEntry{Key: key, Value: value, Timestamp: time.Now()}
	if len(importance) > 0 {
		entry.Importance = clampImportance(importance[0])
	}
	m.entries[key] = entry

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

// Get retrieves a value by key. Returns a deep copy to prevent mutation.
// Updates LastAccessedAt for recency scoring (best-effort, outside read lock).
func (m *LongTermMemory) Get(key string) (any, bool) {
	m.mu.RLock()
	e, ok := m.entries[key]
	if !ok {
		m.mu.RUnlock()
		return nil, false
	}
	val := deepCopyValue(e.Value)
	m.mu.RUnlock()
	// Best-effort update outside read lock.
	m.mu.Lock()
	if existing, ok := m.entries[key]; ok && existing.Key == e.Key {
		m.entries[key] = MemoryEntry{
			Key:            existing.Key,
			Value:          existing.Value,
			Timestamp:      existing.Timestamp,
			TTL:            existing.TTL,
			Tags:           existing.Tags,
			Importance:     existing.Importance,
			LastAccessedAt: time.Now(),
		}
	}
	m.mu.Unlock()
	return val, true
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

// Set stores a team-scoped value with owner tracking and optional importance.
func (m *SharedMemory) Set(key string, value any, ownerAgentID string, importance ...float64) {
	m.mu.Lock()
	defer m.mu.Unlock()

	tags := []string{"shared", "owner:" + ownerAgentID}
	entry := MemoryEntry{
		Key:       key,
		Value:     value,
		Timestamp: time.Now(),
		Tags:      tags,
	}
	if len(importance) > 0 {
		entry.Importance = clampImportance(importance[0])
	}
	m.entries[key] = entry

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

// Get retrieves a team-scoped value. Returns a deep copy to prevent mutation.
// Updates LastAccessedAt for recency scoring (best-effort, outside read lock).
func (m *SharedMemory) Get(key string) (any, bool) {
	m.mu.RLock()
	e, ok := m.entries[key]
	if !ok {
		m.mu.RUnlock()
		return nil, false
	}
	val := deepCopyValue(e.Value)
	m.mu.RUnlock()
	// Best-effort update outside read lock.
	m.mu.Lock()
	if existing, ok := m.entries[key]; ok && existing.Key == e.Key {
		m.entries[key] = MemoryEntry{
			Key:            existing.Key,
			Value:          existing.Value,
			Timestamp:      existing.Timestamp,
			TTL:            existing.TTL,
			Tags:           existing.Tags,
			Importance:     existing.Importance,
			LastAccessedAt: time.Now(),
		}
	}
	m.mu.Unlock()
	return val, true
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

// --- Composite Memory Scoring (CrewAI pattern) ---

// ScoredEntry is a memory entry with its composite search score.
type ScoredEntry struct {
	Entry  MemoryEntry
	Score  float64
	Reason string // human-readable explanation of the score
}

// SearchConfig configures composite memory search scoring weights.
// Inspired by CrewAI's composite memory scoring:
//   composite = recencyWeight * recency + importanceWeight * importance + relevanceWeight * relevance
type SearchConfig struct {
	// RecencyWeight controls how much recency affects the score (0.0-1.0).
	// Recency decays exponentially: 1.0 / (1.0 + hoursSinceAccess)
	RecencyWeight float64

	// ImportanceWeight controls how much the stored importance affects the score.
	ImportanceWeight float64

	// RelevanceWeight controls how much tag/keyword matching affects the score.
	RelevanceWeight float64

	// MaxResults limits the number of results returned (0 = unlimited).
	MaxResults int

	// MinScore filters out entries below this composite score threshold.
	MinScore float64
}

// DefaultSearchConfig returns sensible defaults for composite memory search.
func DefaultSearchConfig() SearchConfig {
	return SearchConfig{
		RecencyWeight:   0.3,
		ImportanceWeight: 0.3,
		RelevanceWeight: 0.4,
		MaxResults:     10,
		MinScore:       0.0,
	}
}

// Search performs composite scored search on short-term memory.
// Query is matched against entry Keys and Tags.
// Results are sorted by composite score (highest first).
func (m *ShortTermMemory) Search(query string, config SearchConfig) []ScoredEntry {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return scoreEntries(m.entries, query, config)
}

// Search performs composite scored search on long-term memory.
func (m *LongTermMemory) Search(query string, config SearchConfig) []ScoredEntry {
	m.mu.RLock()
	defer m.mu.RUnlock()
	entries := make([]MemoryEntry, 0, len(m.entries))
	for _, e := range m.entries {
		entries = append(entries, e)
	}
	return scoreEntries(entries, query, config)
}

// Search performs composite scored search on shared memory.
func (m *SharedMemory) Search(query string, config SearchConfig) []ScoredEntry {
	m.mu.RLock()
	defer m.mu.RUnlock()
	entries := make([]MemoryEntry, 0, len(m.entries))
	for _, e := range m.entries {
		entries = append(entries, e)
	}
	return scoreEntries(entries, query, config)
}

// scoreEntries computes composite scores for a slice of entries.
func scoreEntries(entries []MemoryEntry, query string, config SearchConfig) []ScoredEntry {
	now := time.Now()
	queryLower := strings.ToLower(query)
	queryTerms := strings.Fields(queryLower)

	results := make([]ScoredEntry, 0, len(entries))

	for _, e := range entries {
		// Recency: exponential decay based on last access time
		accessTime := e.LastAccessedAt
		if accessTime.IsZero() {
			accessTime = e.Timestamp
		}
		hoursSinceAccess := now.Sub(accessTime).Hours()
		recency := 1.0 / (1.0 + hoursSinceAccess)

		// Importance: directly from stored value
		importance := e.Importance

		// Relevance: tag and key matching
		relevance := computeRelevance(e, queryLower, queryTerms)

		// Composite score
		composite := config.RecencyWeight*recency +
			config.ImportanceWeight*importance +
			config.RelevanceWeight*relevance

		if composite < config.MinScore {
			continue
		}

		results = append(results, ScoredEntry{
			Entry:  e,
			Score:  composite,
			Reason: formatScoreReason(recency, importance, relevance),
		})
	}

	// Sort by score descending
	sortScoredEntries(results)

	if config.MaxResults > 0 && len(results) > config.MaxResults {
		results = results[:config.MaxResults]
	}

	return results
}

// computeRelevance checks how well an entry matches a query.
func computeRelevance(e MemoryEntry, queryLower string, queryTerms []string) float64 {
	score := 0.0
	matched := 0

	// Check key match
	if strings.Contains(strings.ToLower(e.Key), queryLower) {
		score += 0.5
		matched++
	}

	// Check tag matches
	for _, tag := range e.Tags {
		tagLower := strings.ToLower(tag)
		if strings.Contains(tagLower, queryLower) {
			score += 0.3
			matched++
			break // Only count one full match
		}
	}

	// Check partial term matches
	for _, term := range queryTerms {
		if strings.Contains(strings.ToLower(e.Key), term) {
			score += 0.1
			matched++
			break
		}
		for _, tag := range e.Tags {
			if strings.Contains(strings.ToLower(tag), term) {
				score += 0.1
				matched++
				break
			}
		}
	}

	// Normalize to 0.0-1.0
	if score > 1.0 {
		score = 1.0
	}
	return score
}

// formatScoreReason creates a human-readable explanation.
func formatScoreReason(recency, importance, relevance float64) string {
	return fmt.Sprintf("recency=%.2f importance=%.2f relevance=%.2f",
		recency, importance, relevance)
}

// sortScoredEntries sorts by score descending.
func sortScoredEntries(entries []ScoredEntry) {
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Score > entries[j].Score
	})
}

// clampImportance ensures importance is in [0.0, 1.0].
func clampImportance(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}
