package agent

import (
	"strings"
	"testing"
	"time"
)

func TestClampImportance(t *testing.T) {
	tests := []struct {
		input float64
		want  float64
	}{
		{-0.5, 0},
		{0, 0},
		{0.5, 0.5},
		{1.0, 1.0},
		{1.5, 1.0},
	}
	for _, tt := range tests {
		got := clampImportance(tt.input)
		if got != tt.want {
			t.Errorf("clampImportance(%v) = %v, want %v", tt.input, got, tt.want)
		}
	}
}

func TestShortTermMemory_Search_Basic(t *testing.T) {
	m := NewShortTermMemory(100)
	m.Set("config", "debug mode", 0.9)
	m.Set("task", "fix bug #123", 0.7)
	m.Set("note", "lunch at noon", 0.1)

	results := m.Search("config", DefaultSearchConfig())
	if len(results) == 0 {
		t.Fatal("expected at least 1 result for 'config'")
	}
	if results[0].Entry.Key != "config" {
		t.Errorf("top result Key = %q, want %q", results[0].Entry.Key, "config")
	}
	if results[0].Score <= 0 {
		t.Error("score should be positive")
	}
}

func TestShortTermMemory_Search_ByTag(t *testing.T) {
	m := NewShortTermMemory(100)
	m.Set("review-1", "code review", 0.5)
	// Set entry with tag manually
	entry := MemoryEntry{
		Key:       "review-2",
		Value:     "another review",
		Timestamp: time.Now(),
		Tags:      []string{"review", "quality"},
		Importance: 0.8,
	}
	m.entries = append(m.entries, entry)

	results := m.Search("review", DefaultSearchConfig())
	if len(results) < 2 {
		t.Errorf("expected at least 2 results for 'review', got %d", len(results))
	}
}

func TestShortTermMemory_Search_Recency(t *testing.T) {
	m := NewShortTermMemory(100)
	// Create an old entry
	m.Set("old-entry", "old data", 0.9)
	// Simulate it being accessed long ago
	m.entries[0].LastAccessedAt = time.Now().Add(-48 * time.Hour)
	m.entries[0].Timestamp = time.Now().Add(-48 * time.Hour)

	// Create a recent entry
	m.Set("new-entry", "new data", 0.9)
	m.entries[1].LastAccessedAt = time.Now()

	results := m.Search("entry", DefaultSearchConfig())
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}
	// Recent entry should score higher due to recency
	if results[0].Entry.Key != "new-entry" {
		t.Errorf("top result should be 'new-entry' (recency), got %q", results[0].Entry.Key)
	}
}

func TestShortTermMemory_Search_Importance(t *testing.T) {
	m := NewShortTermMemory(100)
	m.Set("critical", "critical info", 1.0)
	m.Set("trivial", "trivial info", 0.0)
	// Same timestamp so recency is equal
	now := time.Now()
	m.entries[0].Timestamp = now
	m.entries[0].LastAccessedAt = now
	m.entries[1].Timestamp = now
	m.entries[1].LastAccessedAt = now

	// Search with high importance weight
	config := SearchConfig{
		RecencyWeight:   0.0,
		ImportanceWeight: 1.0,
		RelevanceWeight: 0.0,
		MaxResults:     10,
		MinScore:       0.0,
	}
	results := m.Search("", config)
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}
	if results[0].Entry.Key != "critical" {
		t.Errorf("top result should be 'critical' (importance), got %q", results[0].Entry.Key)
	}
}

func TestShortTermMemory_Search_MinScore(t *testing.T) {
	m := NewShortTermMemory(100)
	m.Set("old", "very old", 0.1)
	m.entries[0].LastAccessedAt = time.Now().Add(-1000 * time.Hour)

	config := SearchConfig{
		RecencyWeight:   0.5,
		ImportanceWeight: 0.5,
		RelevanceWeight: 0.0,
		MaxResults:     10,
		MinScore:       0.5,
	}
	results := m.Search("old", config)
	if len(results) != 0 {
		t.Errorf("expected 0 results (below min score), got %d", len(results))
	}
}

func TestShortTermMemory_Search_MaxResults(t *testing.T) {
	m := NewShortTermMemory(100)
	for i := 0; i < 20; i++ {
		m.Set("item-"+strings.Repeat("a", i+1), "data", 0.5)
	}

	config := SearchConfig{MaxResults: 5}
	results := m.Search("item", config)
	if len(results) != 5 {
		t.Errorf("expected 5 results (max), got %d", len(results))
	}
}

func TestLongTermMemory_Search(t *testing.T) {
	m := NewLongTermMemory(100)
	m.Set("config", "debug", 0.9)
	m.Set("task", "fix bug", 0.5)

	results := m.Search("config", DefaultSearchConfig())
	if len(results) == 0 {
		t.Fatal("expected results for 'config'")
	}
	if results[0].Entry.Key != "config" {
		t.Errorf("top result Key = %q, want %q", results[0].Entry.Key, "config")
	}
}

func TestSharedMemory_Search(t *testing.T) {
	m := NewSharedMemory(100)
	m.Set("decision", "use Go", "agent-1", 0.8)
	m.Set("artifact", "code review", "agent-2", 0.6)

	results := m.Search("decision", DefaultSearchConfig())
	if len(results) == 0 {
		t.Fatal("expected results for 'decision'")
	}
	if results[0].Entry.Key != "decision" {
		t.Errorf("top result Key = %q, want %q", results[0].Entry.Key, "decision")
	}
}

func TestDefaultSearchConfig(t *testing.T) {
	config := DefaultSearchConfig()
	if config.RecencyWeight != 0.3 {
		t.Errorf("RecencyWeight = %v, want 0.3", config.RecencyWeight)
	}
	if config.ImportanceWeight != 0.3 {
		t.Errorf("ImportanceWeight = %v, want 0.3", config.ImportanceWeight)
	}
	if config.RelevanceWeight != 0.4 {
		t.Errorf("RelevanceWeight = %v, want 0.4", config.RelevanceWeight)
	}
	if config.MaxResults != 10 {
		t.Errorf("MaxResults = %d, want 10", config.MaxResults)
	}
}

func TestScoredEntry_Reason(t *testing.T) {
	m := NewShortTermMemory(100)
	m.Set("test", "value", 0.5)

	results := m.Search("test", DefaultSearchConfig())
	if len(results) == 0 {
		t.Fatal("no results")
	}
	if results[0].Reason == "" {
		t.Error("reason should not be empty")
	}
	if !strings.Contains(results[0].Reason, "recency=") {
		t.Errorf("reason should contain 'recency=', got %q", results[0].Reason)
	}
}

func TestSearch_TagMatch(t *testing.T) {
	entry := MemoryEntry{
		Key:        "some-key",
		Value:      "some-value",
		Tags:       []string{"review", "quality", "go"},
		Importance: 0.5,
	}

	score := computeRelevance(entry, "review", []string{"review"})
	if score <= 0 {
		t.Error("tag match should have positive relevance")
	}

	// Non-matching query
	score = computeRelevance(entry, "nonexistent", []string{"nonexistent"})
	if score > 0.5 {
		t.Errorf("non-matching query should have low relevance, got %v", score)
	}
}

func TestShortTermMemory_ImportanceOptional(t *testing.T) {
	m := NewShortTermMemory(100)

	// Without importance
	m.Set("no-importance", "value")
	if m.entries[0].Importance != 0 {
		t.Errorf("default importance should be 0, got %v", m.entries[0].Importance)
	}

	// With importance
	m.Set("high-importance", "value", 0.9)
	if m.entries[1].Importance != 0.9 {
		t.Errorf("importance should be 0.9, got %v", m.entries[1].Importance)
	}

	// Clamped importance
	m.Set("clamped", "value", 1.5)
	if m.entries[2].Importance != 1.0 {
		t.Errorf("clamped importance should be 1.0, got %v", m.entries[2].Importance)
	}
}

func TestLongTermMemory_ImportanceOptional(t *testing.T) {
	m := NewLongTermMemory(100)

	m.Set("key1", "val1")
	m.Set("key2", "val2", 0.7)

	e1, ok := m.Get("key1")
	if !ok || e1 == nil {
		t.Fatal("key1 not found")
	}
	e2, ok := m.Get("key2")
	if !ok || e2 == nil {
		t.Fatal("key2 not found")
	}

	// Can't check Importance directly since Get returns deep copy of Value
	// But we can check that entries are stored correctly
	m.mu.RLock()
	if m.entries["key1"].Importance != 0 {
		t.Error("key1 default importance should be 0")
	}
	if m.entries["key2"].Importance != 0.7 {
		t.Error("key2 importance should be 0.7")
	}
	m.mu.RUnlock()
}

func TestSearchResults_Sorted(t *testing.T) {
	m := NewShortTermMemory(100)
	// All same recency (just created), different importance
	m.Set("low", "low priority", 0.1)
	m.Set("medium", "medium priority", 0.5)
	m.Set("high", "high priority", 1.0)

	// Zero out recency (all same access time)
	now := time.Now()
	for i := range m.entries {
		m.entries[i].Timestamp = now
		m.entries[i].LastAccessedAt = now
	}

	// Search with importance-dominant config
	config := SearchConfig{
		RecencyWeight:   0.0,
		ImportanceWeight: 1.0,
		RelevanceWeight: 0.0,
		MaxResults:     10,
	}
	results := m.Search("priority", config)
	if len(results) != 3 {
		t.Fatalf("expected 3 results, got %d", len(results))
	}
	if results[0].Entry.Key != "high" {
		t.Errorf("top result should be 'high', got %q", results[0].Entry.Key)
	}
	if results[2].Entry.Key != "low" {
		t.Errorf("last result should be 'low', got %q", results[2].Entry.Key)
	}
}

func TestSearch_EmptyQuery(t *testing.T) {
	m := NewShortTermMemory(100)
	m.Set("item", "data", 0.5)

	// Empty query should still return results (importance/recency only)
	results := m.Search("", DefaultSearchConfig())
	if len(results) != 1 {
		t.Errorf("empty query should return 1 result, got %d", len(results))
	}
}

func TestSearch_NoResults(t *testing.T) {
	m := NewShortTermMemory(100)

	results := m.Search("nonexistent", DefaultSearchConfig())
	if len(results) != 0 {
		t.Errorf("expected 0 results for nonexistent query, got %d", len(results))
	}
}

func TestShortTermMemory_Search_Concurrent(t *testing.T) {
	m := NewShortTermMemory(100)
	for i := 0; i < 100; i++ {
		m.Set("key-"+strings.Repeat("a", i%10), "val", 0.5)
	}

	done := make(chan struct{})
	for i := 0; i < 50; i++ {
		go func() {
			defer func() { done <- struct{}{} }()
			m.Search("key", DefaultSearchConfig())
		}()
	}
	for i := 0; i < 50; i++ {
		<-done
	}
}
