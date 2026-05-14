package swarm

import (
	"context"
	"fmt"
	"testing"
)

func TestExecuteAggregatorNode_Concat(t *testing.T) {
	result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy": "concat",
		"inputs":   []any{1, 2, 3},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Count != 3 {
		t.Errorf("expected count 3, got %d", result.Count)
	}
	arr, ok := result.Result.([]any)
	if !ok {
		t.Fatalf("expected []any, got %T", result.Result)
	}
	if len(arr) != 3 {
		t.Errorf("expected 3 items, got %d", len(arr))
	}
}

func TestExecuteAggregatorNode_ConcatFlatten(t *testing.T) {
	result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy": "concat",
		"inputs":   []any{[]any{1, 2}, []any{3, 4}, 5},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	arr, ok := result.Result.([]any)
	if !ok {
		t.Fatalf("expected []any, got %T", result.Result)
	}
	if len(arr) != 5 {
		t.Errorf("expected 5 items (flattened), got %d", len(arr))
	}
}

func TestExecuteAggregatorNode_First(t *testing.T) {
	result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy": "first",
		"inputs":   []any{nil, "hello", "world"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result != "hello" {
		t.Errorf("expected 'hello', got %v", result.Result)
	}
	if result.Count != 2 {
		t.Errorf("expected count 2 (after skipping empty), got %d", result.Count)
	}
}

func TestExecuteAggregatorNode_Last(t *testing.T) {
	result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy": "last",
		"inputs":   []any{"hello", "world", nil},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result != "world" {
		t.Errorf("expected 'world', got %v", result.Result)
	}
}

func TestExecuteAggregatorNode_FirstEmpty(t *testing.T) {
	result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy": "first",
		"inputs":   []any{nil, nil},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result != nil {
		t.Errorf("expected nil, got %v", result.Result)
	}
}

func TestExecuteAggregatorNode_MergeMaps(t *testing.T) {
	result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy": "merge_maps",
		"inputs": []any{
			map[string]any{"a": 1, "b": 2},
			map[string]any{"b": 3, "c": 4},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.Result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result.Result)
	}
	if m["a"] != 1 || m["b"] != 3 || m["c"] != 4 {
		t.Errorf("expected merged map, got %v", m)
	}
}

func TestExecuteAggregatorNode_MergeMapsKey(t *testing.T) {
	result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy": "merge_maps",
		"key":      "value",
		"inputs": []any{
			map[string]any{"value": "hello", "other": 1},
			map[string]any{"value": "world", "other": 2},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.Result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result.Result)
	}
	if m["value"] != "world" {
		t.Errorf("expected 'world' (last wins), got %v", m["value"])
	}
	// "other" should not be in result when key is specified
	if _, exists := m["other"]; exists {
		t.Error("expected 'other' key to be excluded when key is specified")
	}
}

func TestExecuteAggregatorNode_Count(t *testing.T) {
	result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy": "count",
		"inputs":   []any{"a", "b", nil, "c", ""},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result != 3 {
		t.Errorf("expected 3 (non-empty), got %v", result.Result)
	}
}

func TestExecuteAggregatorNode_Join(t *testing.T) {
	result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy":  "join",
		"separator": " | ",
		"inputs":    []any{"apple", "banana", "cherry"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result != "apple | banana | cherry" {
		t.Errorf("expected 'apple | banana | cherry', got %v", result.Result)
	}
}

func TestExecuteAggregatorNode_Sum(t *testing.T) {
	tests := []struct {
		name     string
		inputs   []any
		expected any
	}{
		{"integers", []any{1, 2, 3}, 6},
		{"floats", []any{1.5, 2.5}, 4}, // whole number returns int
		{"mixed int/float", []any{1, 2.5}, 3.5},
		{"empty", []any{}, 0.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
				"strategy": "sum",
				"inputs":   tt.inputs,
			})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Result != tt.expected {
				t.Errorf("expected %v, got %v", tt.expected, result.Result)
			}
		})
	}
}

func TestExecuteAggregatorNode_Avg(t *testing.T) {
	result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy": "avg",
		"inputs":   []any{10, 20, 30},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result != 20.0 {
		t.Errorf("expected 20.0, got %v", result.Result)
	}
}

func TestExecuteAggregatorNode_AvgEmpty(t *testing.T) {
	// Test avg with empty inputs (count == 0 branch)
	result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy": "avg",
		"inputs":   []any{},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result != 0.0 {
		t.Errorf("expected 0.0 for empty avg, got %v", result.Result)
	}
	if result.Count != 0 {
		t.Errorf("expected count 0, got %d", result.Count)
	}
}

func TestExecuteAggregatorNode_AvgNonNumeric(t *testing.T) {
	// Test avg with non-numeric inputs (count stays 0)
	result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy": "avg",
		"inputs":   []any{"a", "b", "c"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result != 0.0 {
		t.Errorf("expected 0.0 for non-numeric avg, got %v", result.Result)
	}
}

func TestExecuteAggregatorNode_MinMax(t *testing.T) {
	minResult, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy": "min",
		"inputs":   []any{5, 3, 8, 1},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if minResult.Result != 1 {
		t.Errorf("expected min=1, got %v", minResult.Result)
	}

	maxResult, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy": "max",
		"inputs":   []any{5, 3, 8, 1},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if maxResult.Result != 8 {
		t.Errorf("expected max=8, got %v", maxResult.Result)
	}
}

func TestExecuteAggregatorNode_MinMaxEmpty(t *testing.T) {
	minResult, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy": "min",
		"inputs":   []any{},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if minResult.Result != nil {
		t.Errorf("expected nil for empty min, got %v", minResult.Result)
	}
}

func TestExecuteAggregatorNode_SkipEmpty(t *testing.T) {
	// skip_empty=false should include nil and empty values
	result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy":   "count",
		"skip_empty": false,
		"inputs":     []any{"a", nil, "", "b"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result != 4 {
		t.Errorf("expected 4 (include empty), got %v", result.Result)
	}
}

func TestExecuteAggregatorNode_DefaultStrategy(t *testing.T) {
	result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"inputs": []any{1, 2},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Strategy != AggConcat {
		t.Errorf("expected default strategy 'concat', got %q", result.Strategy)
	}
}

func TestExecuteAggregatorNode_InvalidStrategy(t *testing.T) {
	_, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy": "unknown_strategy",
		"inputs":   []any{1, 2},
	})
	if err == nil {
		t.Fatal("expected error for invalid strategy")
	}
}

func TestAggregateByStrategy_Default(t *testing.T) {
	// Test that unknown strategy falls back to concat
	result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"inputs": []any{1, 2, 3},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Strategy != AggConcat {
		t.Errorf("expected default strategy 'concat', got %q", result.Strategy)
	}
}

func TestExecuteAggregatorNode_EmptyInputs(t *testing.T) {
	tests := []struct {
		name     string
		strategy string
	}{
		{"concat empty", "concat"},
		{"join empty", "join"},
		{"sum empty", "sum"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
				"strategy": tt.strategy,
			})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Count != 0 {
				t.Errorf("expected count 0, got %d", result.Count)
			}
		})
	}
}

func TestExecuteAggregatorNode_MergeMapsNonMap(t *testing.T) {
	// Non-map inputs should be silently ignored
	result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy": "merge_maps",
		"inputs":   []any{"not a map", 42, map[string]any{"key": "val"}},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.Result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result.Result)
	}
	if m["key"] != "val" {
		t.Errorf("expected key=val, got %v", m)
	}
}

func TestExecuteAggregatorNode_NumericStringInputs(t *testing.T) {
	// Numeric strings should work for sum/avg/min/max
	result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy": "sum",
		"inputs":   []any{"10", "20", "30"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Sum of integers returns int
	if result.Result != 60 {
		t.Errorf("expected 60, got %v", result.Result)
	}
}

func TestExecuteAggregatorNode_LastWithEmpty(t *testing.T) {
	tests := []struct {
		name     string
		inputs   []any
		expected any
	}{
		{"last non-empty", []any{"first", "middle", "last"}, "last"},
		{"last with empty at end", []any{"first", "middle", "", "last", nil}, "last"},
		{"all empty", []any{"", nil, ""}, nil},
		{"empty slice", []any{}, nil},
		{"skip empty to find earlier", []any{"valid", "", nil}, "valid"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
				"strategy": "last",
				"inputs":   tt.inputs,
			})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Result != tt.expected {
				t.Errorf("expected %v, got %v", tt.expected, result.Result)
			}
		})
	}
}

func TestExecuteAggregatorNode_MinMaxWithNegatives(t *testing.T) {
	// Test min with all negative
	result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy": "min",
		"inputs":   []any{-5, -3, -8, -1, -9},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result != -9 {
		t.Errorf("min (negative): expected -9, got %v", result.Result)
	}

	// Test max with all negative
	result, err = ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy": "max",
		"inputs":   []any{-5, -3, -8, -1, -9},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result != -1 {
		t.Errorf("max (negative): expected -1, got %v", result.Result)
	}
}

func TestIsEmptyValue(t *testing.T) {
	tests := []struct {
		input    any
		expected bool
	}{
		{nil, true},
		{"", true},
		{0, true},         // 0 (int) is considered empty by design
		{0.0, true},       // 0.0 (float64) is considered empty by design
		{int64(0), false}, // int64 is NOT handled by switch, falls through to default
		{false, true},     // false is considered empty by design (!v)
		{1, false},        // non-zero int is not empty
		{true, false},     // true is not empty
		{[]any{}, true},
		{[]any{1}, false},
		{map[string]any{}, true},
		{map[string]any{"key": "val"}, false},
		{"non-empty", false},
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("%v-%v", tt.input, tt.expected), func(t *testing.T) {
			result := isEmptyValue(tt.input)
			if result != tt.expected {
				t.Errorf("isEmptyValue(%v) = %v, want %v", tt.input, result, tt.expected)
			}
		})
	}
}

func TestExecuteAggregatorNode_MaxWithNegatives(t *testing.T) {
	result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy": "max",
		"inputs":   []any{-5, -3, -8, -1},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result != -1 {
		t.Errorf("expected max=-1, got %v", result.Result)
	}
}

func TestExecuteAggregatorNode_MaxFloat(t *testing.T) {
	result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy": "max",
		"inputs":   []any{3.14, 2.71, 1.41},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result != 3.14 {
		t.Errorf("expected max=3.14, got %v", result.Result)
	}
}

func TestExecuteAggregatorNode_MinFloat(t *testing.T) {
	result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy": "min",
		"inputs":   []any{3.14, 2.71, 1.41},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result != 1.41 {
		t.Errorf("expected min=1.41, got %v", result.Result)
	}
}

func TestExecuteAggregatorNode_MaxWithMixedTypes(t *testing.T) {
	result, err := ExecuteAggregatorNode(context.Background(), map[string]any{
		"strategy": "max",
		"inputs":   []any{5, 3.7, 8, 2.1},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result != 8 {
		t.Errorf("expected max=8, got %v", result.Result)
	}
}
