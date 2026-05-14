package swarm

import (
	"reflect"
	"testing"
)

func TestReducerOverwrite(t *testing.T) {
	tests := []struct {
		old, newVal, want any
	}{
		{nil, "a", "a"},
		{"old", "new", "new"},
		{[]any{1, 2}, []any{3}, []any{3}},
	}
	for _, tt := range tests {
		got := ReducerOverwrite(tt.old, tt.newVal)
		if !reflect.DeepEqual(got, tt.want) {
			t.Errorf("ReducerOverwrite(%v, %v) = %v, want %v", tt.old, tt.newVal, got, tt.want)
		}
	}
}

func TestReducerAppend(t *testing.T) {
	tests := []struct {
		name   string
		old    any
		newVal any
		want   []any
	}{
		{"nil to slice", nil, "a", []any{"a"}},
		{"nil to slice from slice", nil, []any{"a", "b"}, []any{"a", "b"}},
		{"append to slice", []any{"a"}, "b", []any{"a", "b"}},
		{"append slice to slice", []any{"a"}, []any{"b", "c"}, []any{"a", "b", "c"}},
		{"append non-slice old", "a", "b", []any{"a", "b"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ReducerAppend(tt.old, tt.newVal)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("ReducerAppend(%v, %v) = %v, want %v", tt.old, tt.newVal, got, tt.want)
			}
		})
	}
}

func TestReducerMergeMap(t *testing.T) {
	tests := []struct {
		name   string
		old    any
		newVal any
		want   map[string]any
	}{
		{"nil + map", nil, map[string]any{"a": 1}, map[string]any{"a": 1}},
		{"merge", map[string]any{"a": 1}, map[string]any{"b": 2}, map[string]any{"a": 1, "b": 2}},
		{"override", map[string]any{"a": 1}, map[string]any{"a": 2}, map[string]any{"a": 2}},
		{"non-map new", map[string]any{"a": 1}, "string", map[string]any{"a": 1}}, // unchanged
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ReducerMergeMap(tt.old, tt.newVal)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("ReducerMergeMap(%v, %v) = %v, want %v", tt.old, tt.newVal, got, tt.want)
			}
		})
	}
}

func TestReducerSetUnion(t *testing.T) {
	tests := []struct {
		name   string
		old    any
		newVal any
		want   []string
	}{
		{"nil + nil", nil, nil, []string{}},
		{"nil + slice", nil, []string{"a", "b"}, []string{"a", "b"}},
		{"union", []string{"a", "b"}, []string{"b", "c"}, []string{"a", "b", "c"}},
		{"dedup", []string{"a"}, []string{"a", "a", "b"}, []string{"a", "b"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ReducerSetUnion(tt.old, tt.newVal)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("ReducerSetUnion(%v, %v) = %v, want %v", tt.old, tt.newVal, got, tt.want)
			}
		})
	}
}

func TestReducerMax(t *testing.T) {
	tests := []struct {
		old, newVal, want any
	}{
		{nil, 5.0, 5.0},
		{3.0, 5.0, 5.0},
		{5.0, 3.0, 5.0},
		{int(3), 5.0, 5.0},
	}
	for _, tt := range tests {
		got := ReducerMax(tt.old, tt.newVal)
		if !reflect.DeepEqual(got, tt.want) {
			t.Errorf("ReducerMax(%v, %v) = %v, want %v", tt.old, tt.newVal, got, tt.want)
		}
	}
}

func TestReducerMin(t *testing.T) {
	tests := []struct {
		old, newVal, want any
	}{
		{nil, 5.0, 5.0},
		{3.0, 5.0, 3.0},
		{5.0, 3.0, 3.0},
	}
	for _, tt := range tests {
		got := ReducerMin(tt.old, tt.newVal)
		if !reflect.DeepEqual(got, tt.want) {
			t.Errorf("ReducerMin(%v, %v) = %v, want %v", tt.old, tt.newVal, got, tt.want)
		}
	}
}

func TestStateSchema_Define(t *testing.T) {
	s := NewStateSchema()
	s.Define("messages", ReducerAppend)
	s.Define("count", nil)
	s.Define("max", ReducerMax, 0.0)

	if len(s.Keys()) != 3 {
		t.Errorf("expected 3 keys, got %d", len(s.Keys()))
	}

	ch := s.Channel("messages")
	if ch == nil || ch.Reducer == nil {
		t.Error("messages channel should have ReducerAppend")
	}

	ch = s.Channel("max")
	if ch == nil || ch.Default == nil {
		t.Error("max channel should have default value")
	}
}

func TestStateSchema_SetGet(t *testing.T) {
	s := NewStateSchema()
	s.Define("messages", ReducerAppend)
	s.Define("count", nil)

	// Set without channel defined — overwrite
	s.Set("unknown", "value")
	v, ok := s.Get("unknown")
	if !ok || v != "value" {
		t.Errorf("expected (value, true), got (%v, %v)", v, ok)
	}

	// Set with append reducer
	s.Set("messages", "a")
	v, ok = s.Get("messages")
	if !ok {
		t.Fatal("expected messages to exist")
	}
	if arr, ok := v.([]any); !ok || len(arr) != 1 || arr[0] != "a" {
		t.Errorf("expected [a], got %v", v)
	}

	// Second append
	s.Set("messages", "b")
	v, _ = s.Get("messages")
	if arr, ok := v.([]any); !ok || len(arr) != 2 {
		t.Errorf("expected [a, b], got %v", v)
	}

	// Set with overwrite (nil reducer)
	s.Set("count", 1)
	s.Set("count", 2)
	v, _ = s.Get("count")
	if v != 2 {
		t.Errorf("expected 2, got %v", v)
	}
}

func TestStateSchema_Default(t *testing.T) {
	s := NewStateSchema()
	s.Define("max", ReducerMax, 0.0)

	// Get before set — returns default
	v, ok := s.Get("max")
	if !ok || v != 0.0 {
		t.Errorf("expected default 0.0, got %v", v)
	}

	// Set — should apply reducer
	s.Set("max", 5.0)
	v, _ = s.Get("max")
	if v != 5.0 {
		t.Errorf("expected 5.0, got %v", v)
	}
}

func TestStateSchema_Snapshot(t *testing.T) {
	s := NewStateSchema()
	s.Define("a", nil)
	s.Define("b", nil)
	s.Set("a", 1)
	s.Set("b", 2)

	snap := s.Snapshot()
	if len(snap) != 2 {
		t.Errorf("expected 2 items, got %d", len(snap))
	}

	// Mutate snapshot shouldn't affect original
	snap["a"] = 999
	v, _ := s.Get("a")
	if v != 1 {
		t.Error("snapshot mutation affected original")
	}
}

func TestStateSchema_Delete(t *testing.T) {
	s := NewStateSchema()
	s.Define("key", nil)
	s.Set("key", "value")
	s.Delete("key")

	_, ok := s.Get("key")
	if ok {
		t.Error("expected key to be deleted")
	}
}

func TestStateSchema_Clear(t *testing.T) {
	s := NewStateSchema()
	s.Define("a", nil)
	s.Define("b", nil)
	s.Set("a", 1)
	s.Set("b", 2)
	s.Clear()

	if s.Len() != 0 {
		t.Errorf("expected 0 values, got %d", s.Len())
	}
	// Keys should still exist
	if len(s.Keys()) != 2 {
		t.Errorf("expected 2 channel definitions, got %d", len(s.Keys()))
	}
}

func TestStateSchema_SetAll(t *testing.T) {
	s := NewStateSchema()
	s.Define("messages", ReducerAppend)
	s.Define("count", nil)

	s.SetAll(map[string]any{
		"messages": "a",
		"count":    1,
	})

	v, _ := s.Get("messages")
	if arr, ok := v.([]any); !ok || len(arr) != 1 {
		t.Errorf("expected [a], got %v", v)
	}

	// Second SetAll — messages should append
	s.SetAll(map[string]any{
		"messages": "b",
		"count":    2,
	})

	v, _ = s.Get("messages")
	if arr, ok := v.([]any); !ok || len(arr) != 2 {
		t.Errorf("expected [a, b], got %v", v)
	}

	v, _ = s.Get("count")
	if v != 2 {
		t.Errorf("expected 2, got %v", v)
	}
}

func TestStateSchemaFromMap(t *testing.T) {
	config := map[string]string{
		"messages": "append",
		"tags":     "union",
		"meta":     "merge",
		"max":      "max",
		"min":      "min",
		"count":    "overwrite",
		"default":  "",
	}

	s := StateSchemaFromMap(config)

	// Verify reducers by behavior
	s.Set("messages", "a")
	s.Set("messages", "b")
	if v, _ := s.Get("messages"); len(v.([]any)) != 2 {
		t.Errorf("append reducer failed: %v", v)
	}

	s.Set("max", 1.0)
	s.Set("max", 2.0)
	if v, _ := s.Get("max"); v != 2.0 {
		t.Errorf("max reducer failed: %v", v)
	}

	s.Set("count", 1)
	s.Set("count", 2)
	if v, _ := s.Get("count"); v != 2 {
		t.Errorf("overwrite reducer failed: %v", v)
	}
}

func TestStateSchema_DeepCopy(t *testing.T) {
	s := NewStateSchema()
	s.Define("map", ReducerMergeMap)

	original := map[string]any{"key": "value"}
	s.Set("map", original)

	// Mutate original
	original["key"] = "mutated"

	// State should be unaffected
	v, _ := s.Get("map")
	if m, ok := v.(map[string]any); ok {
		if m["key"] != "value" {
			t.Error("mutation affected state (deep copy failed)")
		}
	} else {
		t.Errorf("expected map, got %T", v)
	}
}

func TestStateSchema_ImportExport(t *testing.T) {
	s1 := NewStateSchema()
	s1.Define("a", ReducerAppend)
	s1.Set("a", "x")
	s1.Set("a", "y")

	values, _ := s1.MarshalValues()

	s2 := NewStateSchema()
	s2.Define("a", ReducerAppend)
	s2.ImportValues(values)

	v1, _ := s1.Get("a")
	v2, _ := s2.Get("a")
	if !reflect.DeepEqual(v1, v2) {
		t.Errorf("import mismatch: %v vs %v", v1, v2)
	}
}
