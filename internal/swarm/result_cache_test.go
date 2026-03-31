package swarm

import (
	"sync"
	"testing"
	"time"
)

func TestResultCache_BasicGetSet(t *testing.T) {
	c := NewResultCache()

	// Miss
	_, ok := c.Get("key1")
	if ok {
		t.Fatal("expected cache miss on empty cache")
	}

	// Set and hit
	c.Set("key1", "result1", 5*time.Minute)
	val, ok := c.Get("key1")
	if !ok {
		t.Fatal("expected cache hit")
	}
	if val != "result1" {
		t.Fatalf("expected 'result1', got %v", val)
	}
}

func TestResultCache_Expiration(t *testing.T) {
	c := NewResultCache()

	c.Set("key1", "result1", 50*time.Millisecond)
	// Should be available immediately
	_, ok := c.Get("key1")
	if !ok {
		t.Fatal("expected cache hit before expiration")
	}

	// Wait for expiration
	time.Sleep(60 * time.Millisecond)
	_, ok = c.Get("key1")
	if ok {
		t.Fatal("expected cache miss after expiration")
	}
}

func TestResultCache_NoExpiration(t *testing.T) {
	c := NewResultCache()

	// TTL=0 means no expiration
	c.Set("key1", "result1", 0)
	time.Sleep(50 * time.Millisecond)
	_, ok := c.Get("key1")
	if !ok {
		t.Fatal("expected cache hit with zero TTL (no expiration)")
	}
}

func TestResultCache_Delete(t *testing.T) {
	c := NewResultCache()
	c.Set("key1", "result1", 5*time.Minute)

	c.Delete("key1")
	_, ok := c.Get("key1")
	if ok {
		t.Fatal("expected cache miss after delete")
	}
}

func TestResultCache_DeleteByNodeID(t *testing.T) {
	c := NewResultCache()
	// Simulate multiple cache entries for the same node (different inputs)
	c.Set("key-a", "result-a", 5*time.Minute, "node-1")
	c.Set("key-b", "result-b", 5*time.Minute, "node-1")
	c.Set("key-c", "result-c", 5*time.Minute, "node-2")

	removed := c.DeleteByNodeID("node-1")
	if removed != 2 {
		t.Fatalf("expected 2 removed, got %d", removed)
	}
	_, ok := c.Get("key-a")
	if ok {
		t.Fatal("expected miss for key-a after DeleteByNodeID")
	}
	_, ok = c.Get("key-b")
	if ok {
		t.Fatal("expected miss for key-b after DeleteByNodeID")
	}
	// node-2's entries should be unaffected
	_, ok = c.Get("key-c")
	if !ok {
		t.Fatal("expected hit for key-c (different node)")
	}
}

func TestResultCache_Clear(t *testing.T) {
	c := NewResultCache()
	c.Set("key1", "r1", 5*time.Minute)
	c.Set("key2", "r2", 5*time.Minute)

	c.Clear()
	if c.Size() != 0 {
		t.Fatalf("expected size 0 after clear, got %d", c.Size())
	}
	_, ok := c.Get("key1")
	if ok {
		t.Fatal("expected miss after clear")
	}
}

func TestResultCache_MaxSizeEviction(t *testing.T) {
	c := NewResultCache()
	c.maxSize = 3 // Override to small size for testing

	c.Set("key1", "r1", 5*time.Minute, "node-1")
	c.Set("key2", "r2", 5*time.Minute, "node-2")
	c.Set("key3", "r3", 5*time.Minute, "node-3")

	if c.Size() != 3 {
		t.Fatalf("expected size 3, got %d", c.Size())
	}

	// Adding a 4th entry should evict the oldest (key1)
	c.Set("key4", "r4", 5*time.Minute, "node-4")
	if c.Size() != 3 {
		t.Fatalf("expected size 3 after eviction, got %d", c.Size())
	}

	_, ok := c.Get("key1")
	if ok {
		t.Fatal("expected key1 to be evicted (oldest)")
	}

	// Newer entries should still be available
	_, ok = c.Get("key4")
	if !ok {
		t.Fatal("expected key4 to be present")
	}
}

func TestResultCache_Prune(t *testing.T) {
	c := NewResultCache()
	c.Set("live", "result", 5*time.Minute)
	c.Set("expired", "old", 50*time.Millisecond)

	time.Sleep(60 * time.Millisecond)
	pruned := c.Prune()
	if pruned != 1 {
		t.Fatalf("expected 1 pruned entry, got %d", pruned)
	}
	if c.Size() != 1 {
		t.Fatalf("expected size 1 after prune, got %d", c.Size())
	}
	_, ok := c.Get("live")
	if !ok {
		t.Fatal("expected 'live' entry to survive prune")
	}
}

func TestResultCache_ConcurrentAccess(t *testing.T) {
	c := NewResultCache()
	var wg sync.WaitGroup

	// Concurrent writes
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			key := string(rune('a' + i%26))
			c.Set(key, i, 5*time.Minute)
		}(i)
	}

	// Concurrent reads
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			key := string(rune('a' + i%26))
			c.Get(key)
		}(i)
	}

	wg.Wait()
	if c.Size() == 0 {
		t.Fatal("expected non-empty cache after concurrent access")
	}
}

func TestComputeCacheKey_Deterministic(t *testing.T) {
	key1 := ComputeCacheKey("node-1", map[string]any{"input": "hello"})
	key2 := ComputeCacheKey("node-1", map[string]any{"input": "hello"})
	if key1 != key2 {
		t.Fatal("same inputs should produce same key")
	}
}

func TestComputeCacheKey_DifferentInputs(t *testing.T) {
	key1 := ComputeCacheKey("node-1", map[string]any{"input": "hello"})
	key2 := ComputeCacheKey("node-1", map[string]any{"input": "world"})
	if key1 == key2 {
		t.Fatal("different inputs should produce different keys")
	}
}

func TestComputeCacheKey_DifferentNodes(t *testing.T) {
	key1 := ComputeCacheKey("node-1", map[string]any{"input": "hello"})
	key2 := ComputeCacheKey("node-2", map[string]any{"input": "hello"})
	if key1 == key2 {
		t.Fatal("same input on different nodes should produce different keys")
	}
}

func TestComputeCacheKey_NilInputs(t *testing.T) {
	key1 := ComputeCacheKey("node-1", nil)
	key2 := ComputeCacheKey("node-1", nil)
	if key1 != key2 {
		t.Fatal("nil inputs should produce deterministic keys")
	}
}

func TestComputeCacheKey_UnmarshalableInputs(t *testing.T) {
	// Channels can't be marshaled — should not panic and should produce different keys
	// for different unmarshalable inputs
	key1 := ComputeCacheKey("node-1", make(chan int))
	// Different channel instances produce the same error message, so keys are identical
	key2 := ComputeCacheKey("node-1", make(chan int))
	if key1 != key2 {
		t.Fatal("same unmarshalable type should produce deterministic keys")
	}
	if key1 == "" {
		t.Fatal("expected non-empty key for unmarshalable input")
	}
	// nil inputs should produce a different key than unmarshalable inputs
	keyNil := ComputeCacheKey("node-1", nil)
	if key1 == keyNil {
		t.Fatal("unmarshalable input should produce different key than nil")
	}
}

func TestGetNodeCacheTTL_Default(t *testing.T) {
	node := &WorkflowNode{Config: nil}
	ttl := GetNodeCacheTTL(node)
	if ttl != DefaultCacheTTL {
		t.Fatalf("expected default TTL %v, got %v", DefaultCacheTTL, ttl)
	}
}

func TestGetNodeCacheTTL_Custom(t *testing.T) {
	node := &WorkflowNode{
		Config: map[string]any{"cacheTTL": float64(300)},
	}
	ttl := GetNodeCacheTTL(node)
	if ttl != 300*time.Second {
		t.Fatalf("expected 300s, got %v", ttl)
	}
}

func TestGetNodeCacheTTL_Disabled(t *testing.T) {
	node := &WorkflowNode{
		Config: map[string]any{"cacheTTL": float64(-1)},
	}
	ttl := GetNodeCacheTTL(node)
	if ttl != -1 {
		t.Fatalf("expected -1 (disabled), got %v", ttl)
	}
}

func TestGetNodeCacheTTL_NoExpiration(t *testing.T) {
	node := &WorkflowNode{
		Config: map[string]any{"cacheTTL": float64(0)},
	}
	ttl := GetNodeCacheTTL(node)
	if ttl != 0 {
		t.Fatalf("expected 0 (no expiration), got %v", ttl)
	}
}

func TestGetNodeCacheTTL_IntType(t *testing.T) {
	node := &WorkflowNode{
		Config: map[string]any{"cacheTTL": 120}, // int, not float64
	}
	ttl := GetNodeCacheTTL(node)
	if ttl != 120*time.Second {
		t.Fatalf("expected 120s, got %v", ttl)
	}
}

func TestGetNodeCacheTTL_IntDisabled(t *testing.T) {
	node := &WorkflowNode{
		Config: map[string]any{"cacheTTL": -1}, // int negative
	}
	ttl := GetNodeCacheTTL(node)
	if ttl != -1 {
		t.Fatalf("expected -1 (disabled), got %v", ttl)
	}
}

func TestGetNodeCacheTTL_IntNoExpiration(t *testing.T) {
	node := &WorkflowNode{
		Config: map[string]any{"cacheTTL": 0}, // int zero
	}
	ttl := GetNodeCacheTTL(node)
	if ttl != 0 {
		t.Fatalf("expected 0 (no expiration), got %v", ttl)
	}
}

func TestGetNodeCacheTTL_MissingKey(t *testing.T) {
	node := &WorkflowNode{
		Config: map[string]any{"other": "value"}, // no cacheTTL
	}
	ttl := GetNodeCacheTTL(node)
	if ttl != DefaultCacheTTL {
		t.Fatalf("expected default TTL %v, got %v", DefaultCacheTTL, ttl)
	}
}

func TestGetNodeCacheTTL_InvalidType(t *testing.T) {
	node := &WorkflowNode{
		Config: map[string]any{"cacheTTL": "invalid"}, // string, not number
	}
	ttl := GetNodeCacheTTL(node)
	if ttl != DefaultCacheTTL {
		t.Fatalf("expected default TTL %v, got %v", DefaultCacheTTL, ttl)
	}
}

func TestResultCache_Prune_WithNodeKeys(t *testing.T) {
	c := NewResultCache()

	// Set entries with node IDs
	c.Set("node1-key1", "result1", 50*time.Millisecond, "node1")
	c.Set("node1-key2", "result2", 50*time.Millisecond, "node1")
	c.Set("node2-key1", "result3", 5*time.Minute, "node2")

	time.Sleep(60 * time.Millisecond)

	pruned := c.Prune()
	if pruned != 2 {
		t.Fatalf("expected 2 pruned entries, got %d", pruned)
	}

	// node1 should have no keys (both expired)
	c.mu.RLock()
	node1Keys := c.nodeKeys["node1"]
	node2Keys := c.nodeKeys["node2"]
	c.mu.RUnlock()

	if len(node1Keys) != 0 {
		t.Errorf("expected node1 to have 0 keys after all expired, got %d", len(node1Keys))
	}
	if len(node2Keys) != 1 {
		t.Errorf("expected node2 to have 1 key, got %d", len(node2Keys))
	}

	// node1 should be removed from nodeKeys entirely
	c.mu.RLock()
	_, node1Exists := c.nodeKeys["node1"]
	c.mu.RUnlock()

	if node1Exists {
		t.Error("expected node1 to be removed from nodeKeys map")
	}
}

func TestResultCache_Prune_NoExpiration(t *testing.T) {
	c := NewResultCache()

	c.Set("no-expiry", "result", 0) // TTL=0 means no expiration
	c.Set("with-expiry", "result2", 50*time.Millisecond)

	time.Sleep(60 * time.Millisecond)

	pruned := c.Prune()
	if pruned != 1 {
		t.Fatalf("expected 1 pruned entry, got %d", pruned)
	}

	// no-expiry should survive
	_, ok := c.Get("no-expiry")
	if !ok {
		t.Error("expected 'no-expiry' entry to survive prune")
	}
}

func TestResultCache_Prune_Empty(t *testing.T) {
	c := NewResultCache()
	pruned := c.Prune()
	if pruned != 0 {
		t.Errorf("expected 0 pruned entries for empty cache, got %d", pruned)
	}
}
