package swarm

import (
	"testing"
)

func TestExecuteMergeNode_Append(t *testing.T) {
	tests := []struct {
		name    string
		inputs  []any
		wantLen int
		want    any
	}{
		{
			"flat values",
			[]any{"a", "b", "c"},
			3,
			[]any{"a", "b", "c"},
		},
		{
			"arrays flattened",
			[]any{[]any{1, 2}, []any{3, 4}},
			2,
			[]any{1, 2, 3, 4},
		},
		{
			"mixed arrays and values",
			[]any{[]any{1, 2}, "c", 3},
			3,
			[]any{1, 2, "c", 3},
		},
		{
			"nil inputs skipped",
			[]any{nil, "a", nil, "b"},
			4,
			[]any{"a", "b"},
		},
		{
			"empty inputs",
			[]any{},
			0,
			[]any{},
		},
		{
			"nil inputs field",
			nil,
			0,
			[]any{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config := map[string]any{
				"mode":   "append",
				"inputs": tt.inputs,
			}
			result, err := ExecuteMergeNode(config)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Count != tt.wantLen {
				t.Errorf("expected count %d, got %d", tt.wantLen, result.Count)
			}
			got := result.Merged
			arr, ok := got.([]any)
			if !ok {
				t.Fatalf("expected []any, got %T", got)
			}
			if len(arr) != len(tt.want.([]any)) {
				t.Errorf("expected %d items, got %d", len(tt.want.([]any)), len(arr))
			}
		})
	}
}

func TestExecuteMergeNode_Combine(t *testing.T) {
	tests := []struct {
		name    string
		inputs  []any
		wantKey string
		wantVal any
	}{
		{
			"merge two maps",
			[]any{
				map[string]any{"a": 1, "b": 2},
				map[string]any{"b": 3, "c": 4},
			},
			"b",
			3, // later value overrides
		},
		{
			"three maps",
			[]any{
				map[string]any{"x": 1},
				map[string]any{"y": 2},
				map[string]any{"z": 3},
			},
			"z",
			3,
		},
		{
			"empty input",
			[]any{},
			"",
			nil,
		},
		{
			"non-map inputs ignored",
			[]any{"not a map", map[string]any{"key": "val"}},
			"key",
			"val",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config := map[string]any{
				"mode":   "combine",
				"inputs": tt.inputs,
			}
			result, err := ExecuteMergeNode(config)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			m, ok := result.Merged.(map[string]any)
			if !ok {
				if tt.wantVal == nil {
					return
				}
				t.Fatalf("expected map, got %T", result.Merged)
			}
			if m[tt.wantKey] != tt.wantVal {
				t.Errorf("key %q: expected %v, got %v", tt.wantKey, tt.wantVal, m[tt.wantKey])
			}
		})
	}
}

func TestExecuteMergeNode_ChooseBranch(t *testing.T) {
	tests := []struct {
		name   string
		inputs []any
		want   any
	}{
		{"first available", []any{"first", "second"}, "first"},
		{"skip nil", []any{nil, nil, "third"}, "third"},
		{"all nil", []any{nil, nil}, nil},
		{"empty", []any{}, nil},
		{"map value", []any{nil, map[string]any{"k": "v"}}, true}, // map is non-nil
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config := map[string]any{
				"mode":   "choose_branch",
				"inputs": tt.inputs,
			}
			result, err := ExecuteMergeNode(config)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tt.name == "map value" {
				m, ok := result.Merged.(map[string]any)
				if !ok || m["k"] != "v" {
					t.Errorf("expected map[k]=v, got %v", result.Merged)
				}
				return
			}
			if result.Merged != tt.want {
				t.Errorf("expected %v, got %v", tt.want, result.Merged)
			}
		})
	}
}

func TestExecuteMergeNode_WaitAll(t *testing.T) {
	inputs := []any{"a", 42, true, nil}
	config := map[string]any{
		"mode":   "wait_all",
		"inputs": inputs,
	}
	result, err := ExecuteMergeNode(config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	arr, ok := result.Merged.([]any)
	if !ok {
		t.Fatalf("expected []any, got %T", result.Merged)
	}
	if len(arr) != len(inputs) {
		t.Errorf("expected %d items, got %d", len(inputs), len(arr))
	}
	if result.Count != len(inputs) {
		t.Errorf("expected count %d, got %d", len(inputs), result.Count)
	}
}

func TestExecuteMergeNode_DefaultMode(t *testing.T) {
	config := map[string]any{
		"inputs": []any{1, 2, 3},
	}
	result, err := ExecuteMergeNode(config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Mode != MergeAppend {
		t.Errorf("expected default mode 'append', got %q", result.Mode)
	}
}

func TestExecuteMergeNode_InvalidMode(t *testing.T) {
	config := map[string]any{
		"mode":   "invalid_mode",
		"inputs": []any{1, 2},
	}
	_, err := ExecuteMergeNode(config)
	if err == nil {
		t.Fatal("expected error for invalid mode")
	}
}

func TestExecuteMergeNode_NoInputs(t *testing.T) {
	config := map[string]any{
		"mode": "append",
	}
	result, err := ExecuteMergeNode(config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Count != 0 {
		t.Errorf("expected 0, got %d", result.Count)
	}
}

func TestExecuteMergeNode_ResultStructure(t *testing.T) {
	config := map[string]any{
		"mode":   "combine",
		"inputs": []any{map[string]any{"a": 1}},
	}
	result, err := ExecuteMergeNode(config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Mode != "combine" {
		t.Errorf("expected mode 'combine', got %q", result.Mode)
	}
	if result.Count != 1 {
		t.Errorf("expected count 1, got %d", result.Count)
	}
	if len(result.Results) != 1 {
		t.Errorf("expected 1 result, got %d", len(result.Results))
	}
}
