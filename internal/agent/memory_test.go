package agent

import (
	"sync"
	"testing"
	"time"
)

// --- ShortTermMemory Tests ---

func TestShortTermMemory_NewWithDefault(t *testing.T) {
	m := NewShortTermMemory(0)
	if m.maxEntries != 100 {
		t.Errorf("expected default maxEntries=100, got %d", m.maxEntries)
	}
}

func TestShortTermMemory_SetGet(t *testing.T) {
	m := NewShortTermMemory(10)
	m.Set("key1", "value1")

	v, ok := m.Get("key1")
	if !ok || v != "value1" {
		t.Errorf("expected value1, got %v (ok=%v)", v, ok)
	}

	_, ok = m.Get("missing")
	if ok {
		t.Error("expected false for missing key")
	}
}

func TestShortTermMemory_SetOverwrites(t *testing.T) {
	m := NewShortTermMemory(10)
	m.Set("key1", "old")
	m.Set("key1", "new")

	v, ok := m.Get("key1")
	if !ok || v != "new" {
		t.Errorf("expected new, got %v", v)
	}
}

func TestShortTermMemory_Delete(t *testing.T) {
	m := NewShortTermMemory(10)
	m.Set("key1", "value1")
	m.Delete("key1")

	_, ok := m.Get("key1")
	if ok {
		t.Error("expected false after delete")
	}
}

func TestShortTermMemory_BoundedEviction(t *testing.T) {
	m := NewShortTermMemory(3)
	m.Set("a", 1)
	m.Set("b", 2)
	m.Set("c", 3)
	m.Set("d", 4) // should evict "a"

	if m.Len() != 3 {
		t.Errorf("expected len=3, got %d", m.Len())
	}
	_, ok := m.Get("a")
	if ok {
		t.Error("expected 'a' to be evicted")
	}
	v, ok := m.Get("d")
	if !ok || v != 4 {
		t.Errorf("expected 'd'=4, got %v", v)
	}
}

func TestShortTermMemory_Entries(t *testing.T) {
	m := NewShortTermMemory(10)
	m.Set("k1", "v1")
	m.Set("k2", "v2")

	entries := m.Entries()
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}
}

func TestShortTermMemory_EntriesCopy(t *testing.T) {
	m := NewShortTermMemory(10)
	m.Set("k1", "v1")

	entries := m.Entries()
	entries[0].Value = "mutated"

	v, _ := m.Get("k1")
	if v == "mutated" {
		t.Error("Entries() should return a copy, not alias internal state")
	}
}

func TestShortTermMemory_EvictExpired(t *testing.T) {
	m := NewShortTermMemory(10)
	now := time.Now()

	m.entries = append(m.entries, MemoryEntry{
		Key:       "expired",
		Value:     "old",
		Timestamp: now.Add(-2 * time.Hour),
		TTL:       time.Hour,
	})
	m.entries = append(m.entries, MemoryEntry{
		Key:       "fresh",
		Value:     "new",
		Timestamp: now,
		TTL:       time.Hour,
	})
	m.entries = append(m.entries, MemoryEntry{
		Key:       "noTTL",
		Value:     "permanent",
		Timestamp: now.Add(-2 * time.Hour),
		TTL:       0,
	})

	m.EvictExpired()

	if _, ok := m.Get("expired"); ok {
		t.Error("expired entry should be removed")
	}
	if _, ok := m.Get("fresh"); !ok {
		t.Error("fresh entry should remain")
	}
	if _, ok := m.Get("noTTL"); !ok {
		t.Error("entry with TTL=0 should not be evicted")
	}
}

func TestShortTermMemory_Clear(t *testing.T) {
	m := NewShortTermMemory(10)
	m.Set("k1", "v1")
	m.Set("k2", "v2")
	m.Clear()

	if m.Len() != 0 {
		t.Errorf("expected len=0 after clear, got %d", m.Len())
	}
}

func TestShortTermMemory_ConcurrentAccess(t *testing.T) {
	m := NewShortTermMemory(1000)
	var wg sync.WaitGroup

	for range 100 {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			m.Set("key", i)
			m.Get("key")
			m.Delete("key")
		}(0)
	}
	wg.Wait()
}

// --- LongTermMemory Tests ---

func TestLongTermMemory_SetGet(t *testing.T) {
	m := NewLongTermMemory(0)
	m.Set("key1", "value1")

	v, ok := m.Get("key1")
	if !ok || v != "value1" {
		t.Errorf("expected value1, got %v (ok=%v)", v, ok)
	}

	_, ok = m.Get("missing")
	if ok {
		t.Error("expected false for missing key")
	}
}

func TestLongTermMemory_Delete(t *testing.T) {
	m := NewLongTermMemory(0)
	m.Set("key1", "value1")
	m.Delete("key1")

	_, ok := m.Get("key1")
	if ok {
		t.Error("expected false after delete")
	}
}

func TestLongTermMemory_Unbounded(t *testing.T) {
	m := NewLongTermMemory(0)
	for i := range 200 {
		m.Set("key", i)
	}
	if m.Len() != 1 {
		t.Errorf("unbounded memory should keep 1 key, got %d", m.Len())
	}
}

func TestLongTermMemory_OldestEviction(t *testing.T) {
	m := NewLongTermMemory(3)
	m.Set("a", 1)
	m.Set("b", 2)
	m.Set("c", 3)

	// Adding "d" should evict oldest entry ("a")
	m.Set("d", 4)

	if m.Len() != 3 {
		t.Errorf("expected len=3, got %d", m.Len())
	}
	if _, ok := m.Get("a"); ok {
		t.Error("expected 'a' to be evicted (oldest timestamp)")
	}
	if _, ok := m.Get("d"); !ok {
		t.Error("expected 'd' to remain")
	}
}

func TestLongTermMemory_Entries(t *testing.T) {
	m := NewLongTermMemory(0)
	m.Set("k1", "v1")
	m.Set("k2", "v2")

	entries := m.Entries()
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}
}

func TestLongTermMemory_Clear(t *testing.T) {
	m := NewLongTermMemory(0)
	m.Set("k1", "v1")
	m.Clear()

	if m.Len() != 0 {
		t.Errorf("expected len=0 after clear, got %d", m.Len())
	}
}

func TestLongTermMemory_ConcurrentAccess(t *testing.T) {
	m := NewLongTermMemory(1000)
	var wg sync.WaitGroup

	for range 100 {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			m.Set("key", i)
			m.Get("key")
			m.Delete("key")
		}(0)
	}
	wg.Wait()
}

// --- SharedMemory Tests ---

func TestSharedMemory_NewWithDefault(t *testing.T) {
	m := NewSharedMemory(0)
	if m.maxEntries != 200 {
		t.Errorf("expected default maxEntries=200, got %d", m.maxEntries)
	}
}

func TestSharedMemory_SetGet(t *testing.T) {
	m := NewSharedMemory(10)
	m.Set("key1", "value1", "agent-1")

	v, ok := m.Get("key1")
	if !ok || v != "value1" {
		t.Errorf("expected value1, got %v (ok=%v)", v, ok)
	}
}

func TestSharedMemory_Delete(t *testing.T) {
	m := NewSharedMemory(10)
	m.Set("key1", "value1", "agent-1")
	m.Delete("key1")

	_, ok := m.Get("key1")
	if ok {
		t.Error("expected false after delete")
	}
}

func TestSharedMemory_BoundedEviction(t *testing.T) {
	m := NewSharedMemory(3)
	m.Set("a", 1, "agent-1")
	m.Set("b", 2, "agent-1")
	m.Set("c", 3, "agent-1")
	m.Set("d", 4, "agent-1") // should evict "a"

	if m.Len() != 3 {
		t.Errorf("expected len=3, got %d", m.Len())
	}
	if _, ok := m.Get("a"); ok {
		t.Error("expected 'a' to be evicted")
	}
}

func TestSharedMemory_SearchByTag(t *testing.T) {
	m := NewSharedMemory(10)
	// Set adds "shared" tag automatically
	m.Set("k1", "v1", "agent-1")
	m.Set("k2", "v2", "agent-1")

	// Manually add entry with custom tags for testing
	m.mu.Lock()
	m.entries["custom"] = MemoryEntry{
		Key:       "custom",
		Value:     "val",
		Timestamp: time.Now(),
		Tags:      []string{"custom", "test"},
	}
	m.mu.Unlock()

	results := m.SearchByTag("shared")
	if len(results) != 2 {
		t.Errorf("expected 2 entries with 'shared' tag, got %d", len(results))
	}

	results = m.SearchByTag("test")
	if len(results) != 1 {
		t.Errorf("expected 1 entry with 'test' tag, got %d", len(results))
	}

	results = m.SearchByTag("nonexistent")
	if len(results) != 0 {
		t.Errorf("expected 0 entries for nonexistent tag, got %d", len(results))
	}

	// Multiple tags (OR logic)
	results = m.SearchByTag("shared", "custom")
	if len(results) != 3 {
		t.Errorf("expected 3 entries matching shared OR custom, got %d", len(results))
	}
}

func TestSharedMemory_Entries(t *testing.T) {
	m := NewSharedMemory(10)
	m.Set("k1", "v1", "agent-1")

	entries := m.Entries()
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
}

func TestSharedMemory_Clear(t *testing.T) {
	m := NewSharedMemory(10)
	m.Set("k1", "v1", "agent-1")
	m.Clear()

	if m.Len() != 0 {
		t.Errorf("expected len=0 after clear, got %d", m.Len())
	}
}

func TestSharedMemory_ConcurrentAccess(t *testing.T) {
	m := NewSharedMemory(1000)
	var wg sync.WaitGroup

	for range 100 {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			m.Set("key", i, "agent")
			m.Get("key")
			m.Delete("key")
		}(0)
	}
	wg.Wait()
}
