// Package storage provides storage abstractions for swarm-editor
package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Backend defines the storage backend interface
type Backend interface {
	Get(ctx context.Context, key string) ([]byte, error)
	Set(ctx context.Context, key string, value []byte) error
	Delete(ctx context.Context, key string) error
	List(ctx context.Context, prefix string) ([]string, error)
	Close() error
}

// MemoryBackend is an in-memory storage backend
type MemoryBackend struct {
	mu   sync.RWMutex
	data map[string][]byte
}

// NewMemoryBackend creates a new in-memory backend
func NewMemoryBackend() *MemoryBackend {
	return &MemoryBackend{
		data: make(map[string][]byte),
	}
}

// Get retrieves a value by key
func (b *MemoryBackend) Get(ctx context.Context, key string) ([]byte, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	value, ok := b.data[key]
	if !ok {
		return nil, ErrNotFound
	}

	// Return a copy to prevent mutation
	result := make([]byte, len(value))
	copy(result, value)
	return result, nil
}

// Set stores a value by key
func (b *MemoryBackend) Set(ctx context.Context, key string, value []byte) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	// Store a copy to prevent mutation
	data := make([]byte, len(value))
	copy(data, value)
	b.data[key] = data
	return nil
}

// Delete removes a key
func (b *MemoryBackend) Delete(ctx context.Context, key string) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	delete(b.data, key)
	return nil
}

// List lists keys with a given prefix
func (b *MemoryBackend) List(ctx context.Context, prefix string) ([]string, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	var keys []string
	for key := range b.data {
		if prefix == "" || len(key) >= len(prefix) && key[:len(prefix)] == prefix {
			keys = append(keys, key)
		}
	}
	return keys, nil
}

// Close closes the backend (no-op for memory backend)
func (b *MemoryBackend) Close() error {
	return nil
}

// FileBackend is a file-based storage backend
type FileBackend struct {
	mu       sync.RWMutex
	basePath string
}

// NewFileBackend creates a new file-based backend
func NewFileBackend(basePath string) (*FileBackend, error) {
	if err := os.MkdirAll(basePath, 0755); err != nil {
		return nil, fmt.Errorf("failed to create base path: %w", err)
	}
	return &FileBackend{basePath: basePath}, nil
}

// Get retrieves a value by key
func (b *FileBackend) Get(ctx context.Context, key string) ([]byte, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	path := b.keyToPath(key)
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("read failed: %w", err)
	}
	return data, nil
}

// Set stores a value by key
func (b *FileBackend) Set(ctx context.Context, key string, value []byte) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	path := b.keyToPath(key)

	// Ensure directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	// Write to temp file first, then rename for atomicity
	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, value, 0644); err != nil {
		return fmt.Errorf("write failed: %w", err)
	}

	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("rename failed: %w", err)
	}

	return nil
}

// Delete removes a key
func (b *FileBackend) Delete(ctx context.Context, key string) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	path := b.keyToPath(key)
	err := os.Remove(path)
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

// List lists keys with a given prefix
func (b *FileBackend) List(ctx context.Context, prefix string) ([]string, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	var keys []string
	base := b.basePath

	err := filepath.Walk(base, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip errors
		}
		if info.IsDir() {
			return nil
		}

		rel, err := filepath.Rel(base, path)
		if err != nil {
			return nil
		}

		key := filepath.ToSlash(rel)
		if prefix == "" || len(key) >= len(prefix) && key[:len(prefix)] == prefix {
			keys = append(keys, key)
		}
		return nil
	})

	return keys, err
}

// Close closes the backend (no-op for file backend)
func (b *FileBackend) Close() error {
	return nil
}

// keyToPath converts a key to a file path
func (b *FileBackend) keyToPath(key string) string {
	return filepath.Join(b.basePath, key)
}

// Storage errors
var (
	ErrNotFound = fmt.Errorf("key not found")
)

// Store provides a high-level key-value storage interface
type Store struct {
	backend Backend
}

// NewStore creates a new store with the given backend
func NewStore(backend Backend) *Store {
	return &Store{backend: backend}
}

// GetJSON retrieves and unmarshals a JSON value
func (s *Store) GetJSON(ctx context.Context, key string, v interface{}) error {
	data, err := s.backend.Get(ctx, key)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, v)
}

// SetJSON marshals and stores a JSON value
func (s *Store) SetJSON(ctx context.Context, key string, v interface{}) error {
	data, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("marshal failed: %w", err)
	}
	return s.backend.Set(ctx, key, data)
}

// GetString retrieves a string value
func (s *Store) GetString(ctx context.Context, key string) (string, error) {
	data, err := s.backend.Get(ctx, key)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// SetString stores a string value
func (s *Store) SetString(ctx context.Context, key, value string) error {
	return s.backend.Set(ctx, key, []byte(value))
}

// Delete removes a key
func (s *Store) Delete(ctx context.Context, key string) error {
	return s.backend.Delete(ctx, key)
}

// List lists keys with a given prefix
func (s *Store) List(ctx context.Context, prefix string) ([]string, error) {
	return s.backend.List(ctx, prefix)
}

// Close closes the store
func (s *Store) Close() error {
	return s.backend.Close()
}

// CachedStore provides caching on top of a store
type CachedStore struct {
	store Store
	cache sync.Map
	ttl   time.Duration
}

// CachedEntry represents a cached entry with expiration
type CachedEntry struct {
	data      []byte
	expiresAt time.Time
}

// NewCachedStore creates a cached store wrapper
func NewCachedStore(store Store, ttl time.Duration) *CachedStore {
	return &CachedStore{
		store: store,
		ttl:   ttl,
	}
}

// Get retrieves a value, checking cache first
func (s *CachedStore) Get(ctx context.Context, key string) ([]byte, error) {
	// Check cache
	if entry, ok := s.cache.Load(key); ok {
		if time.Now().Before(entry.(CachedEntry).expiresAt) {
			return entry.(CachedEntry).data, nil
		}
		s.cache.Delete(key)
	}

	// Get from store
	data, err := s.store.backend.Get(ctx, key)
	if err != nil {
		return nil, err
	}

	// Cache it
	s.cache.Store(key, CachedEntry{
		data:      data,
		expiresAt: time.Now().Add(s.ttl),
	})

	return data, nil
}

// Invalidate removes a key from cache
func (s *CachedStore) Invalidate(key string) {
	s.cache.Delete(key)
}
