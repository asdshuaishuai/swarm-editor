// Package swarm implements State Reducers for workflow state management.
// Inspired by LangGraph's Annotated[type, reducer] pattern:
//   - StateSchema defines typed state channels with per-key merge strategies
//   - Reducers control how concurrent/sequential writes to the same key are merged
//   - Default reducer is "overwrite"; custom reducers enable accumulation patterns
//
// Example (equivalent to LangGraph's Annotated[list, operator.add]):
//
//	schema := NewStateSchema()
//	schema.Define("messages", ReducerAppend)  // each write appends to list
//	schema.Define("count", nil)                // each write overwrites
package swarm

import (
	"fmt"
	"sort"
	"sync"
)

// StateReducer merges an existing state value with a new value.
// Returns the merged result. Called under lock.
// If old is nil, should return newVal (or newVal merged with default).
type StateReducer func(old, newVal any) any

// Built-in reducers.

// ReducerOverwrite replaces old with new (default behavior when Reducer is nil).
func ReducerOverwrite(_, newVal any) any {
	return newVal
}

// ReducerAppend appends newVal to old (both must be or be convertible to []any).
// If old is nil, wraps newVal in a single-element slice.
func ReducerAppend(old, newVal any) any {
	var oldSlice []any
	switch v := old.(type) {
	case nil:
		// no-op
	case []any:
		oldSlice = v
	default:
		oldSlice = []any{v}
	}

	switch v := newVal.(type) {
	case []any:
		result := make([]any, len(oldSlice), len(oldSlice)+len(v))
		copy(result, oldSlice)
		for _, item := range v {
			result = append(result, deepCopyAny(item))
		}
		return result
	default:
		result := make([]any, len(oldSlice), len(oldSlice)+1)
		copy(result, oldSlice)
		result = append(result, deepCopyAny(v))
		return result
	}
}

// ReducerMergeMap merges newVal into old map (later keys override).
// Both must be map[string]any. If old is nil, returns deep copy of newVal.
func ReducerMergeMap(old, newVal any) any {
	var merged map[string]any
	if m, ok := old.(map[string]any); ok {
		merged = make(map[string]any, len(m))
		for k, v := range m {
			merged[k] = deepCopyAny(v)
		}
	} else {
		merged = make(map[string]any)
	}

	if m, ok := newVal.(map[string]any); ok {
		for k, v := range m {
			merged[k] = deepCopyAny(v)
		}
	} else if newVal != nil {
		// Non-map new value: skip (can't merge)
		return old
	}

	return merged
}

// ReducerSetUnion computes the union of two string slices (deduplicated, sorted).
// Both must be []string or nil. Useful for tracking unique tags, categories, etc.
func ReducerSetUnion(old, newVal any) any {
	var set map[string]struct{}

	if s, ok := old.([]string); ok {
		set = make(map[string]struct{}, len(s))
		for _, v := range s {
			set[v] = struct{}{}
		}
	} else {
		set = make(map[string]struct{})
	}

	if s, ok := newVal.([]string); ok {
		for _, v := range s {
			set[v] = struct{}{}
		}
	}

	result := make([]string, 0, len(set))
	for v := range set {
		result = append(result, v)
	}
	sort.Strings(result)
	return result
}

// ReducerMax keeps the larger of old and newVal (both must be numeric or nil).
// If old is nil, returns newVal.
func ReducerMax(old, newVal any) any {
	if old == nil {
		return newVal
	}
	oldVal := toFloat64OrZero(old)
	newValF := toFloat64OrZero(newVal)
	if newValF > oldVal {
		return newVal
	}
	return old
}

// ReducerMin keeps the smaller of old and newVal (both must be numeric or nil).
// If old is nil, returns newVal.
func ReducerMin(old, newVal any) any {
	if old == nil {
		return newVal
	}
	oldVal := toFloat64OrZero(old)
	newValF := toFloat64OrZero(newVal)
	if newValF < oldVal {
		return newVal
	}
	return old
}

func toFloat64OrZero(v any) float64 {
	switch val := v.(type) {
	case float64:
		return val
	case int:
		return float64(val)
	case int64:
		return float64(val)
	case nil:
		return 0
	default:
		return 0
	}
}

// StateChannel defines a state key's merge behavior.
type StateChannel struct {
	Key     string        // state key name
	Reducer StateReducer  // merge function; nil = overwrite
	Default any           // initial value when key has never been set
}

// StateSchema manages workflow state with per-key reducer semantics.
// Thread-safe. Inspired by LangGraph's state channels.
//
// State flows through the workflow graph: each node reads from and writes
// to the schema. When multiple nodes write to the same key, the Reducer
// determines how values are merged (e.g., append for message lists).
type StateSchema struct {
	mu     sync.RWMutex
	channels map[string]*StateChannel // key → channel definition
	values   map[string]any           // key → current value
}

// NewStateSchema creates an empty state schema.
func NewStateSchema() *StateSchema {
	return &StateSchema{
		channels: make(map[string]*StateChannel),
		values:   make(map[string]any),
	}
}

// Define registers a state channel with an optional reducer.
// If reducer is nil, writes to this key overwrite (default behavior).
// If default is non-nil, it's used as the initial value when Get is called
// before any Set.
func (s *StateSchema) Define(key string, reducer StateReducer, defaultVal ...any) {
	s.mu.Lock()
	defer s.mu.Unlock()

	ch := &StateChannel{
		Key:    key,
		Reducer: reducer,
	}
	if len(defaultVal) > 0 {
		ch.Default = defaultVal[0]
	}
	s.channels[key] = ch
}

// Set writes a value to a state key, applying the channel's reducer.
// If the key has no defined channel, the value overwrites (default behavior).
func (s *StateSchema) Set(key string, value any) {
	s.mu.Lock()
	defer s.mu.Unlock()

	ch, ok := s.channels[key]
	if !ok {
		// No channel defined — default overwrite behavior
		s.values[key] = deepCopyAny(value)
		return
	}

	reducer := ch.Reducer // nil means overwrite
	if reducer == nil {
		reducer = ReducerOverwrite
	}

	old := s.values[key]
	s.values[key] = reducer(old, value)
}

// Get retrieves a state value by key.
// If the key has never been set and has a default, returns the default (deep copied).
func (s *StateSchema) Get(key string) (any, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	val, ok := s.values[key]
	if ok {
		return deepCopyAny(val), true
	}

	// Check for default
	if ch, exists := s.channels[key]; exists && ch.Default != nil {
		return deepCopyAny(ch.Default), true
	}

	return nil, false
}

// Delete removes a state key.
func (s *StateSchema) Delete(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.values, key)
}

// Keys returns all defined state channel keys.
func (s *StateSchema) Keys() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]string, 0, len(s.channels))
	for k := range s.channels {
		result = append(result, k)
	}
	sort.Strings(result)
	return result
}

// Snapshot returns a deep copy of all state values.
func (s *StateSchema) Snapshot() map[string]any {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make(map[string]any, len(s.values))
	for k, v := range s.values {
		result[k] = deepCopyAny(v)
	}
	return result
}

// Len returns the number of state keys that have been set.
func (s *StateSchema) Len() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.values)
}

// Clear removes all state values (preserves channel definitions).
func (s *StateSchema) Clear() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.values = make(map[string]any)
}

// Channel returns the channel definition for a key, or nil.
func (s *StateSchema) Channel(key string) *StateChannel {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.channels[key]
}

// SetAll merges a map of values into the state, applying each key's reducer.
func (s *StateSchema) SetAll(values map[string]any) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for key, value := range values {
		ch, ok := s.channels[key]
		if !ok {
			s.values[key] = deepCopyAny(value)
			continue
		}

		reducer := ch.Reducer
		if reducer == nil {
			reducer = ReducerOverwrite
		}

		old := s.values[key]
		s.values[key] = reducer(old, value)
	}
}

// MarshalValues returns a JSON-serializable map of all state values.
// Useful for checkpoint persistence.
func (s *StateSchema) MarshalValues() (map[string]any, error) {
	return s.Snapshot(), nil
}

// ImportValues replaces all state values from a map (used for checkpoint restore).
func (s *StateSchema) ImportValues(values map[string]any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.values = make(map[string]any, len(values))
	for k, v := range values {
		s.values[k] = deepCopyAny(v)
	}
}

// StateSchemaFromMap creates a StateSchema from a config map.
// Each key in the map defines a state channel. The value determines the reducer:
//   - "overwrite" or omitted: overwrite reducer
//   - "append": append reducer (for lists)
//   - "merge": merge map reducer
//   - "union": set union reducer (for string slices)
//   - "max": max reducer (for numbers)
//   - "min": min reducer (for numbers)
func StateSchemaFromMap(config map[string]string) *StateSchema {
	s := NewStateSchema()
	for key, reducerName := range config {
		var reducer StateReducer
		switch reducerName {
		case "append":
			reducer = ReducerAppend
		case "merge":
			reducer = ReducerMergeMap
		case "union":
			reducer = ReducerSetUnion
		case "max":
			reducer = ReducerMax
		case "min":
			reducer = ReducerMin
		case "overwrite", "":
			reducer = nil // default
		default:
			// Try to find a custom reducer by name (future extensibility)
			continue
		}
		s.Define(key, reducer)
	}
	return s
}

// String returns a human-readable representation of the state.
func (s *StateSchema) String() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return fmt.Sprintf("StateSchema{keys=%d, values=%d}", len(s.channels), len(s.values))
}
