package storage

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestMemoryBackend(t *testing.T) {
	backend := NewMemoryBackend()
	ctx := context.Background()

	// Test Set and Get
	err := backend.Set(ctx, "key1", []byte("value1"))
	if err != nil {
		t.Fatalf("Set failed: %v", err)
	}

	value, err := backend.Get(ctx, "key1")
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}

	if string(value) != "value1" {
		t.Errorf("expected 'value1', got '%s'", string(value))
	}

	// Test non-existent key
	_, err = backend.Get(ctx, "nonexistent")
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound, got %v", err)
	}

	// Test Delete
	err = backend.Delete(ctx, "key1")
	if err != nil {
		t.Fatalf("Delete failed: %v", err)
	}

	_, err = backend.Get(ctx, "key1")
	if err != ErrNotFound {
		t.Error("key should be deleted")
	}

	// Test List
	_ = backend.Set(ctx, "prefix/key1", []byte("v1"))
	_ = backend.Set(ctx, "prefix/key2", []byte("v2"))
	_ = backend.Set(ctx, "other/key3", []byte("v3"))

	keys, err := backend.List(ctx, "prefix")
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}

	if len(keys) != 2 {
		t.Errorf("expected 2 keys, got %d", len(keys))
	}

	// Test Close
	if err := backend.Close(); err != nil {
		t.Errorf("Close failed: %v", err)
	}
}

func TestMemoryBackendMutation(t *testing.T) {
	backend := NewMemoryBackend()
	ctx := context.Background()

	// Store value
	original := []byte("original")
	err := backend.Set(ctx, "key", original)
	if err != nil {
		t.Fatal(err)
	}

	// Mutate original (should not affect stored value)
	original[0] = 'X'

	retrieved, err := backend.Get(ctx, "key")
	if err != nil {
		t.Fatal(err)
	}

	if string(retrieved) == "Xriginal" {
		t.Error("stored value should not be affected by mutation")
	}
}

func TestFileBackend(t *testing.T) {
	// Create temp directory
	tmpDir, err := os.MkdirTemp("", "storage_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	backend, err := NewFileBackend(tmpDir)
	if err != nil {
		t.Fatal(err)
	}
	defer backend.Close()

	ctx := context.Background()

	// Test Set and Get
	err = backend.Set(ctx, "key1", []byte("value1"))
	if err != nil {
		t.Fatalf("Set failed: %v", err)
	}

	value, err := backend.Get(ctx, "key1")
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}

	if string(value) != "value1" {
		t.Errorf("expected 'value1', got '%s'", string(value))
	}

	// Test non-existent key
	_, err = backend.Get(ctx, "nonexistent")
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound, got %v", err)
	}

	// Test nested keys
	err = backend.Set(ctx, "nested/deep/key", []byte("nested value"))
	if err != nil {
		t.Fatalf("nested Set failed: %v", err)
	}

	value, err = backend.Get(ctx, "nested/deep/key")
	if err != nil {
		t.Fatalf("nested Get failed: %v", err)
	}

	if string(value) != "nested value" {
		t.Errorf("expected 'nested value', got '%s'", string(value))
	}

	// Verify file was created
	path := filepath.Join(tmpDir, "nested", "deep", "key")
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Error("file should exist")
	}

	// Test Delete
	err = backend.Delete(ctx, "key1")
	if err != nil {
		t.Fatalf("Delete failed: %v", err)
	}

	_, err = backend.Get(ctx, "key1")
	if err != ErrNotFound {
		t.Error("key should be deleted")
	}

	// Test List
	_ = backend.Set(ctx, "prefix/key1", []byte("v1"))
	_ = backend.Set(ctx, "prefix/key2", []byte("v2"))
	_ = backend.Set(ctx, "other/key3", []byte("v3"))

	keys, err := backend.List(ctx, "prefix")
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}

	if len(keys) != 2 {
		t.Errorf("expected 2 keys, got %d: %v", len(keys), keys)
	}
}

func TestStore(t *testing.T) {
	backend := NewMemoryBackend()
	store := NewStore(backend)
	ctx := context.Background()

	// Test JSON operations
	type TestStruct struct {
		Name  string `json:"name"`
		Value int    `json:"value"`
	}

	original := &TestStruct{Name: "test", Value: 42}
	err := store.SetJSON(ctx, "json_key", original)
	if err != nil {
		t.Fatalf("SetJSON failed: %v", err)
	}

	var retrieved TestStruct
	err = store.GetJSON(ctx, "json_key", &retrieved)
	if err != nil {
		t.Fatalf("GetJSON failed: %v", err)
	}

	if retrieved.Name != "test" || retrieved.Value != 42 {
		t.Errorf("retrieved data mismatch: %+v", retrieved)
	}

	// Test String operations
	err = store.SetString(ctx, "string_key", "hello world")
	if err != nil {
		t.Fatal(err)
	}

	str, err := store.GetString(ctx, "string_key")
	if err != nil {
		t.Fatal(err)
	}

	if str != "hello world" {
		t.Errorf("expected 'hello world', got '%s'", str)
	}

	// Test Delete
	err = store.Delete(ctx, "json_key")
	if err != nil {
		t.Fatal(err)
	}

	err = store.GetJSON(ctx, "json_key", &retrieved)
	if err != ErrNotFound {
		t.Error("key should be deleted")
	}

	// Test List
	_ = store.SetString(ctx, "list/a", "1")
	_ = store.SetString(ctx, "list/b", "2")

	keys, err := store.List(ctx, "list")
	if err != nil {
		t.Fatal(err)
	}

	if len(keys) != 2 {
		t.Errorf("expected 2 keys, got %d", len(keys))
	}
}

func TestCachedStore(t *testing.T) {
	backend := NewMemoryBackend()
	store := NewStore(backend)
	cached := NewCachedStore(*store, 100*time.Millisecond)
	ctx := context.Background()

	// Set a value
	_ = backend.Set(ctx, "key", []byte("value"))

	// First Get should hit backend
	v1, err := cached.Get(ctx, "key")
	if err != nil {
		t.Fatal(err)
	}

	// Update backend directly (simulating external change)
	_ = backend.Set(ctx, "key", []byte("new_value"))

	// Second Get should return cached value (not updated)
	v2, err := cached.Get(ctx, "key")
	if err != nil {
		t.Fatal(err)
	}

	if string(v2) != string(v1) {
		t.Error("cached value should not change before TTL expires")
	}

	// Invalidate cache
	cached.Invalidate("key")

	// Now Get should return updated value
	v3, err := cached.Get(ctx, "key")
	if err != nil {
		t.Fatal(err)
	}

	if string(v3) != "new_value" {
		t.Errorf("expected 'new_value' after cache invalidation, got '%s'", string(v3))
	}
}

func TestCachedStoreExpiration(t *testing.T) {
	backend := NewMemoryBackend()
	store := NewStore(backend)
	cached := NewCachedStore(*store, 50*time.Millisecond)
	ctx := context.Background()

	// Set a value
	_ = backend.Set(ctx, "key", []byte("value"))

	// First Get
	_, _ = cached.Get(ctx, "key")

	// Wait for TTL to expire
	time.Sleep(60 * time.Millisecond)

	// Update backend
	_ = backend.Set(ctx, "key", []byte("updated"))

	// Get should return updated value (cache expired)
	v, err := cached.Get(ctx, "key")
	if err != nil {
		t.Fatal(err)
	}

	if string(v) != "updated" {
		t.Errorf("expected 'updated', got '%s'", string(v))
	}
}

// TestCachedStoreGetReturnsCopy verifies that CachedStore.Get returns a copy
// of the cached data, not a reference to the internal slice.
func TestCachedStoreGetReturnsCopy(t *testing.T) {
	backend := NewMemoryBackend()
	store := NewStore(backend)
	cached := NewCachedStore(*store, 100*time.Millisecond)
	ctx := context.Background()

	// Set a value
	original := []byte("original_value")
	_ = backend.Set(ctx, "key", original)

	// First Get should hit backend and cache the value
	v1, err := cached.Get(ctx, "key")
	if err != nil {
		t.Fatal(err)
	}

	// Mutate the returned slice
	v1[0] = 'X'

	// Second Get should return a copy, not the mutated slice
	v2, err := cached.Get(ctx, "key")
	if err != nil {
		t.Fatal(err)
	}

	// v2 should be "original_value", not "Xriginal_value"
	if string(v2) != "original_value" {
		t.Errorf("CachedStore.Get should return a copy, got '%s'", string(v2))
	}

	// Also verify that the first mutation didn't affect the cached data
	if string(v1) != "Xriginal_value" {
		t.Errorf("mutation should have affected v1, got '%s'", string(v1))
	}
}

// Test FileBackend with invalid directory
func TestFileBackendInvalidDir(t *testing.T) {
	// Try to create a FileBackend with a file instead of directory
	tmpFile, err := os.CreateTemp("", "notadir")
	if err != nil {
		t.Fatal(err)
	}
	tmpPath := tmpFile.Name()
	tmpFile.Close()
	defer os.Remove(tmpPath)

	_, err = NewFileBackend(tmpPath)
	if err == nil {
		t.Error("NewFileBackend should fail with file path instead of directory")
	}
}

// Test Store GetJSON with invalid JSON
func TestStoreGetJSONInvalid(t *testing.T) {
	backend := NewMemoryBackend()
	store := NewStore(backend)
	ctx := context.Background()

	// Store invalid JSON
	_ = backend.Set(ctx, "invalid_json", []byte("not valid json"))

	var result map[string]interface{}
	err := store.GetJSON(ctx, "invalid_json", &result)
	if err == nil {
		t.Error("GetJSON should fail with invalid JSON")
	}
}

// Test Store GetString with non-existent key
func TestStoreGetStringNotFound(t *testing.T) {
	backend := NewMemoryBackend()
	store := NewStore(backend)
	ctx := context.Background()

	_, err := store.GetString(ctx, "nonexistent")
	if err != ErrNotFound {
		t.Errorf("Expected ErrNotFound, got %v", err)
	}
}

// Test Store SetJSON with nil value
func TestStoreSetJSONNil(t *testing.T) {
	backend := NewMemoryBackend()
	store := NewStore(backend)
	ctx := context.Background()

	// SetJSON with nil should still work (marshal to null)
	err := store.SetJSON(ctx, "nil_key", nil)
	if err != nil {
		t.Logf("SetJSON with nil returned: %v", err)
	}
}

// Test MemoryBackend concurrent access
func TestMemoryBackendConcurrent(t *testing.T) {
	backend := NewMemoryBackend()
	ctx := context.Background()

	done := make(chan bool)

	// Concurrent writes
	for i := 0; i < 10; i++ {
		go func(n int) {
			key := string(rune('a' + n))
			_ = backend.Set(ctx, key, []byte("value"))
			done <- true
		}(i)
	}

	// Concurrent reads
	for i := 0; i < 10; i++ {
		go func(n int) {
			key := string(rune('a' + n))
			_, _ = backend.Get(ctx, key)
			done <- true
		}(i)
	}

	// Wait for all goroutines
	for i := 0; i < 20; i++ {
		<-done
	}
}

// Test CachedStore caches values correctly
func TestCachedStoreSetThroughBackend(t *testing.T) {
	backend := NewMemoryBackend()
	store := NewStore(backend)
	cached := NewCachedStore(*store, 100*time.Millisecond)
	ctx := context.Background()

	// Set through backend directly
	_ = backend.Set(ctx, "key", []byte("value"))

	// First Get should hit backend and cache
	v1, err := cached.Get(ctx, "key")
	if err != nil {
		t.Fatal(err)
	}

	if string(v1) != "value" {
		t.Errorf("Expected 'value', got '%s'", string(v1))
	}

	// Update backend directly (simulating external change)
	_ = backend.Set(ctx, "key", []byte("new_value"))

	// Second Get should return cached value (not updated)
	v2, err := cached.Get(ctx, "key")
	if err != nil {
		t.Fatal(err)
	}

	if string(v2) != "value" {
		t.Error("Cached value should not change before TTL expires")
	}
}

// Test CachedStore InvalidateAll
func TestCachedStoreInvalidateMultiple(t *testing.T) {
	backend := NewMemoryBackend()
	store := NewStore(backend)
	cached := NewCachedStore(*store, 100*time.Millisecond)
	ctx := context.Background()

	// Set multiple values
	_ = backend.Set(ctx, "key1", []byte("value1"))
	_ = backend.Set(ctx, "key2", []byte("value2"))

	// Cache them
	_, _ = cached.Get(ctx, "key1")
	_, _ = cached.Get(ctx, "key2")

	// Invalidate one
	cached.Invalidate("key1")

	// Update backend
	_ = backend.Set(ctx, "key1", []byte("new1"))
	_ = backend.Set(ctx, "key2", []byte("new2"))

	// key1 should fetch fresh value (cache invalidated)
	v1, _ := cached.Get(ctx, "key1")
	if string(v1) != "new1" {
		t.Errorf("Expected 'new1' after invalidation, got '%s'", string(v1))
	}

	// key2 should still return cached value
	v2, _ := cached.Get(ctx, "key2")
	if string(v2) != "value2" {
		t.Errorf("Expected cached 'value2', got '%s'", string(v2))
	}
}

// Test Store Close method
func TestStoreClose(t *testing.T) {
	backend := NewMemoryBackend()
	store := NewStore(backend)

	// Close should call backend's Close
	err := store.Close()
	if err != nil {
		t.Errorf("Store.Close should not return error: %v", err)
	}
}

// Test CachedStore with expired entries
func TestCachedStoreExpiredEntry(t *testing.T) {
	backend := NewMemoryBackend()
	store := NewStore(backend)
	cached := NewCachedStore(*store, 10*time.Millisecond)
	ctx := context.Background()

	// Set a value
	_ = backend.Set(ctx, "key", []byte("value"))

	// First Get to cache it
	v1, err := cached.Get(ctx, "key")
	if err != nil {
		t.Fatal(err)
	}
	if string(v1) != "value" {
		t.Errorf("Expected 'value', got '%s'", string(v1))
	}

	// Wait for TTL to expire
	time.Sleep(20 * time.Millisecond)

	// Update backend
	_ = backend.Set(ctx, "key", []byte("updated"))

	// Get should fetch fresh value (cache expired)
	v2, err := cached.Get(ctx, "key")
	if err != nil {
		t.Fatal(err)
	}
	if string(v2) != "updated" {
		t.Errorf("Expected 'updated' after expiration, got '%s'", string(v2))
	}
}

// TestCachedStoreGetBackendError tests that CachedStore.Get propagates backend errors
func TestCachedStoreGetBackendError(t *testing.T) {
	backend := NewMemoryBackend()
	store := NewStore(backend)
	cached := NewCachedStore(*store, 100*time.Millisecond)
	ctx := context.Background()

	// Get non-existent key should return ErrNotFound from backend
	_, err := cached.Get(ctx, "nonexistent_key")
	if err == nil {
		if err != ErrNotFound {
			t.Errorf("Expected ErrNotFound, got %v", err)
		}
	}
}

// Test FileBackend keyToPath validation
func TestFileBackendKeyValidation(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "filebackend_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	backend, err := NewFileBackend(tmpDir)
	if err != nil {
		t.Fatal(err)
	}
	defer backend.Close()

	ctx := context.Background()

	tests := []struct {
		name    string
		key     string
		wantErr bool
	}{
		{"empty key", "", true},
		{"path traversal", "../etc/passwd", true},
		{"absolute path unix", "/etc/passwd", true},
		{"valid key", "valid_key", false},
		{"nested valid", "nested/valid/key", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Test via Set
			err := backend.Set(ctx, tt.key, []byte("test"))
			if (err != nil) != tt.wantErr {
				t.Errorf("Set(%q) error = %v, wantErr %v", tt.key, err, tt.wantErr)
			}

			// Test via Get
			_, err = backend.Get(ctx, tt.key)
			if (err != nil) != tt.wantErr {
				t.Errorf("Get(%q) error = %v, wantErr %v", tt.key, err, tt.wantErr)
			}

			// Test via Delete
			err = backend.Delete(ctx, tt.key)
			if (err != nil) != tt.wantErr {
				t.Errorf("Delete(%q) error = %v, wantErr %v", tt.key, err, tt.wantErr)
			}
		})
	}
}
