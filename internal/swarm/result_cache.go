package swarm

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sync"
	"time"
)

// ResultCache provides per-node result caching with TTL expiration.
// Inspired by Prefect's task result caching (cache_key_fn + cache_expiration).
// When a workflow node has CacheKey set and its inputs hash matches a cached entry,
// execution is skipped and the cached result is returned directly.
//
// This is especially valuable for:
// - Expensive LLM calls that return deterministic results for the same input
// - Tool invocations with idempotent results
// - Subgraph workflows with stable outputs
type ResultCache struct {
	mu    sync.RWMutex
	items map[string]*cacheEntry

	// nodeKeys tracks which cache keys belong to which nodeID,
	// enabling efficient per-node cache invalidation.
	nodeKeys map[string][]string // nodeID → cache keys

	// maxSize limits the number of cache entries. When exceeded,
	// the oldest entry (by cachedAt) is evicted. 0 = unlimited.
	maxSize int
}

type cacheEntry struct {
	result    any
	cachedAt  time.Time
	expiresAt time.Time
}

// NewResultCache creates a new empty result cache.
func NewResultCache() *ResultCache {
	return &ResultCache{
		items:    make(map[string]*cacheEntry),
		nodeKeys: make(map[string][]string),
		maxSize:  DefaultCacheMaxSize,
	}
}

// Get retrieves a cached result by key. Returns (result, true) if found and not expired.
// Returns a deep copy to prevent external mutation of cached data.
func (c *ResultCache) Get(key string) (any, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	entry, ok := c.items[key]
	if !ok {
		return nil, false
	}
	if !entry.expiresAt.IsZero() && time.Now().After(entry.expiresAt) {
		return nil, false // expired
	}
	return deepCopyAny(entry.result), true // Deep copy to prevent external mutation
}

// Set stores a result in the cache with the given TTL.
// If ttl is 0, the entry never expires (use with caution).
// nodeID is used for tracking which keys belong to which node for efficient invalidation.
// When the cache exceeds maxSize, the oldest entry (by cachedAt) is evicted.
func (c *ResultCache) Set(key string, result any, ttl time.Duration, nodeID ...string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// If this key already exists, remove the old entry first
	if _, exists := c.items[key]; exists {
		delete(c.items, key)
		c.removeNodeKeyRef(key)
	}

	// Evict oldest entry if at capacity
	if c.maxSize > 0 && len(c.items) >= c.maxSize {
		c.evictOldest()
	}

	now := time.Now()
	entry := &cacheEntry{
		result:    deepCopyAny(result), // Deep copy to prevent external mutation
		cachedAt:  now,
		expiresAt: now.Add(ttl),
	}
	if ttl == 0 {
		entry.expiresAt = time.Time{}
	}
	c.items[key] = entry
	if len(nodeID) > 0 && nodeID[0] != "" {
		c.nodeKeys[nodeID[0]] = append(c.nodeKeys[nodeID[0]], key)
	}
}

// evictOldest removes the oldest cache entry (by cachedAt).
// Must be called with c.mu held.
func (c *ResultCache) evictOldest() {
	var oldestKey string
	var oldestTime time.Time
	for key, entry := range c.items {
		if oldestKey == "" || entry.cachedAt.Before(oldestTime) {
			oldestKey = key
			oldestTime = entry.cachedAt
		}
	}
	if oldestKey != "" {
		delete(c.items, oldestKey)
		c.removeNodeKeyRef(oldestKey)
	}
}

// removeNodeKeyRef removes a key from nodeKeys tracking.
// Must be called with c.mu held.
func (c *ResultCache) removeNodeKeyRef(key string) {
	for nodeID, keys := range c.nodeKeys {
		for i, k := range keys {
			if k == key {
				c.nodeKeys[nodeID] = append(keys[:i], keys[i+1:]...)
				if len(c.nodeKeys[nodeID]) == 0 {
					delete(c.nodeKeys, nodeID)
				}
				return
			}
		}
	}
}

// Delete removes a single cache entry and cleans up nodeKeys tracking.
func (c *ResultCache) Delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, exists := c.items[key]; exists {
		delete(c.items, key)
		c.removeNodeKeyRef(key)
	}
}

// DeleteByNodeID removes all cache entries associated with the given node ID.
// Returns the number of entries removed.
func (c *ResultCache) DeleteByNodeID(nodeID string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	keys := c.nodeKeys[nodeID]
	removed := 0
	for _, key := range keys {
		if _, exists := c.items[key]; exists {
			delete(c.items, key)
			removed++
		}
	}
	delete(c.nodeKeys, nodeID)
	return removed
}

// Clear removes all cache entries.
func (c *ResultCache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items = make(map[string]*cacheEntry)
	c.nodeKeys = make(map[string][]string)
}

// Size returns the number of entries (including potentially expired ones).
func (c *ResultCache) Size() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.items)
}

// Prune removes expired entries and returns the count of pruned items.
func (c *ResultCache) Prune() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	pruned := 0
	prunedKeys := make(map[string]struct{})
	for key, entry := range c.items {
		if !entry.expiresAt.IsZero() && now.After(entry.expiresAt) {
			delete(c.items, key)
			prunedKeys[key] = struct{}{}
			pruned++
		}
	}
	// Clean up stale references in nodeKeys
	for nodeID, keys := range c.nodeKeys {
		filtered := keys[:0]
		for _, key := range keys {
			if _, pruned := prunedKeys[key]; !pruned {
				filtered = append(filtered, key)
			}
		}
		if len(filtered) == 0 {
			delete(c.nodeKeys, nodeID)
		} else {
			c.nodeKeys[nodeID] = filtered
		}
	}
	return pruned
}

// ComputeCacheKey generates a deterministic cache key from a node ID and its inputs.
// Uses SHA-256 of the JSON-serialized inputs for stable hashing.
// If inputs is nil, only the node ID is used (useful for nodes with no parameters).
// If inputs fail to marshal (e.g. contains channels/functions), the error type is
// hashed to prevent different unmarshalable inputs from colliding on the same key.
func ComputeCacheKey(nodeID string, inputs any) string {
	h := sha256.New()
	h.Write([]byte(nodeID))
	if inputs != nil {
		data, err := json.Marshal(inputs)
		if err != nil {
			// Marshal failed — hash the error type so different unmarshalable inputs
			// don't produce the same key (preventing false cache hits)
			h.Write([]byte("marshal_error:"))
			h.Write([]byte(err.Error()))
		} else {
			h.Write(data)
		}
	}
	return hex.EncodeToString(h.Sum(nil))
}

// DefaultCacheTTL is the default TTL for cached node results when CacheTTL is not set.
// 1 hour is a reasonable default for most workflow scenarios.
// DefaultCacheMaxSize is the maximum number of entries the cache can hold.
// When exceeded, the oldest entry is evicted (LRU-like by cachedAt).
// 1000 is a reasonable default for most workflow scenarios.
const DefaultCacheMaxSize = 1000

const DefaultCacheTTL = 1 * time.Hour

// GetNodeCacheTTL returns the effective TTL for a node's cached result.
// If node.Config["cacheTTL"] is set (as a number of seconds), that value is used.
// Otherwise, DefaultCacheTTL (1 hour) is returned.
// A value of -1 means "no caching" for this node.
func GetNodeCacheTTL(node *WorkflowNode) time.Duration {
	if node.Config == nil {
		return DefaultCacheTTL
	}
	raw, ok := node.Config["cacheTTL"]
	if !ok {
		return DefaultCacheTTL
	}
	// Handle JSON number (float64 after unmarshal)
	switch v := raw.(type) {
	case float64:
		secs := int(v)
		if secs < 0 {
			return -1 // disabled
		}
		if secs == 0 {
			return 0 // no expiration
		}
		return time.Duration(secs) * time.Second
	case int:
		if v < 0 {
			return -1
		}
		if v == 0 {
			return 0
		}
		return time.Duration(v) * time.Second
	}
	return DefaultCacheTTL
}
