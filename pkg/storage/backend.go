// Package storage provides storage abstractions for swarm-editor
package storage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"
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
	// Create directory with restricted permissions
	if err := os.MkdirAll(basePath, 0700); err != nil {
		return nil, fmt.Errorf("failed to create base path: %w", err)
	}
	return &FileBackend{basePath: basePath}, nil
}

// Get retrieves a value by key
func (b *FileBackend) Get(ctx context.Context, key string) ([]byte, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	path, err := b.keyToPath(key)
	if err != nil {
		return nil, fmt.Errorf("invalid key: %w", err)
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
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

	path, err := b.keyToPath(key)
	if err != nil {
		return fmt.Errorf("invalid key: %w", err)
	}

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

	path, err := b.keyToPath(key)
	if err != nil {
		return fmt.Errorf("invalid key: %w", err)
	}
	err = os.Remove(path)
	if errors.Is(err, fs.ErrNotExist) {
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
			log.Printf("[Storage] Skipping path %s: %v", path, err)
			return nil
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
func (b *FileBackend) keyToPath(key string) (string, error) {
	// Validate key to prevent path traversal
	if key == "" {
		return "", errors.New("key cannot be empty")
	}
	if strings.Contains(key, "..") {
		return "", errors.New("key cannot contain path traversal sequences")
	}
	if strings.HasPrefix(key, "/") || strings.HasPrefix(key, "\\") {
		return "", errors.New("key cannot be an absolute path")
	}

	path := filepath.Join(b.basePath, key)

	// Ensure the resolved path is within basePath (prevent escaping)
	// Use basePath+separator to prevent "/data" matching "/data_backup/..."
	cleanPath := filepath.Clean(path)
	if !strings.HasPrefix(cleanPath, b.basePath+string(filepath.Separator)) && cleanPath != b.basePath {
		return "", errors.New("key resolves to path outside base directory")
	}

	return cleanPath, nil
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
func (s *Store) GetJSON(ctx context.Context, key string, v any) error {
	data, err := s.backend.Get(ctx, key)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, v)
}

// SetJSON marshals and stores a JSON value
func (s *Store) SetJSON(ctx context.Context, key string, v any) error {
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
		if cached, ok := entry.(CachedEntry); ok && time.Now().Before(cached.expiresAt) {
			// Return copy to prevent caller from mutating cached data
			result := make([]byte, len(cached.data))
			copy(result, cached.data)
			return result, nil
		}
		s.cache.Delete(key)
	}

	// Get from store
	data, err := s.store.backend.Get(ctx, key)
	if err != nil {
		return nil, err
	}

	// Cache a copy to prevent caller from mutating cached data
	dataCopy := make([]byte, len(data))
	copy(dataCopy, data)
	s.cache.Store(key, CachedEntry{
		data:      dataCopy,
		expiresAt: time.Now().Add(s.ttl),
	})

	// Return copy to prevent caller from mutating cached data
	result := make([]byte, len(data))
	copy(result, data)
	return result, nil
}

// Invalidate removes a key from cache
func (s *CachedStore) Invalidate(key string) {
	s.cache.Delete(key)
}
