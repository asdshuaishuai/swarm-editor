package swarm

import (
	"context"
	"testing"
)

func TestExecuteIteratorNode_BasicArray(t *testing.T) {
	config := map[string]any{
		"items": []any{"a", "b", "c"},
	}

	result, err := ExecuteIteratorNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.TotalItems != 3 {
		t.Errorf("expected 3 items, got %d", result.TotalItems)
	}
	if result.Succeeded != 3 {
		t.Errorf("expected 3 succeeded, got %d", result.Succeeded)
	}

	// Verify iteration context
	if result.Outputs[0]["index"] != 0 {
		t.Errorf("expected index 0, got %v", result.Outputs[0]["index"])
	}
	if result.Outputs[0]["item"] != "a" {
		t.Errorf("expected item 'a', got %v", result.Outputs[0]["item"])
	}
	if result.Outputs[0]["first"] != true {
		t.Errorf("expected first=true for index 0")
	}
	if result.Outputs[2]["last"] != true {
		t.Errorf("expected last=true for last item")
	}
}

func TestExecuteIteratorNode_BatchSize(t *testing.T) {
	config := map[string]any{
		"items":    []any{1, 2, 3, 4, 5},
		"batchSize": 2.0,
	}

	result, err := ExecuteIteratorNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.TotalItems != 5 {
		t.Errorf("expected 5 items, got %d", result.TotalItems)
	}
}

func TestExecuteIteratorNode_MaxIterations(t *testing.T) {
	config := map[string]any{
		"items":         []any{1, 2, 3, 4, 5, 6, 7, 8, 9, 10},
		"maxIterations": 3.0,
	}

	result, err := ExecuteIteratorNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.TotalItems != 3 {
		t.Errorf("expected 3 items (maxIterations=3), got %d", result.TotalItems)
	}
}

func TestExecuteIteratorNode_StartFrom(t *testing.T) {
	config := map[string]any{
		"items":     []any{10, 20, 30, 40, 50},
		"startFrom": 2.0,
	}

	result, err := ExecuteIteratorNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.TotalItems != 3 {
		t.Errorf("expected 3 items (startFrom=2), got %d", result.TotalItems)
	}
	if result.Outputs[0]["item"] != 30 {
		t.Errorf("expected first item to be 30 (index 2), got %v", result.Outputs[0]["item"])
	}
}

func TestExecuteIteratorNode_StartFromBeyondEnd(t *testing.T) {
	config := map[string]any{
		"items":     []any{1, 2, 3},
		"startFrom": 10.0,
	}

	result, err := ExecuteIteratorNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.TotalItems != 0 {
		t.Errorf("expected 0 items (startFrom beyond end), got %d", result.TotalItems)
	}
}

func TestExecuteIteratorNode_EmptyArray(t *testing.T) {
	config := map[string]any{
		"items": []any{},
	}

	result, err := ExecuteIteratorNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.TotalItems != 0 {
		t.Errorf("expected 0 items, got %d", result.TotalItems)
	}
}

func TestExecuteIteratorNode_MissingItems(t *testing.T) {
	config := map[string]any{}

	_, err := ExecuteIteratorNode(context.Background(), config)
	if err == nil {
		t.Fatal("expected error for missing items")
	}
}

func TestExecuteIteratorNode_NilItems(t *testing.T) {
	config := map[string]any{
		"items": nil,
	}

	_, err := ExecuteIteratorNode(context.Background(), config)
	if err == nil {
		t.Fatal("expected error for nil items")
	}
}

func TestExecuteIteratorNode_SingleItem(t *testing.T) {
	config := map[string]any{
		"items": "single-value",
	}

	result, err := ExecuteIteratorNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.TotalItems != 1 {
		t.Errorf("expected 1 item (single value wrapped), got %d", result.TotalItems)
	}
	if result.Outputs[0]["item"] != "single-value" {
		t.Errorf("expected 'single-value', got %v", result.Outputs[0]["item"])
	}
	if result.Outputs[0]["first"] != true || result.Outputs[0]["last"] != true {
		t.Error("single item should be both first and last")
	}
}

func TestExecuteIteratorNode_ClampValues(t *testing.T) {
	items := make([]any, 10)
	for i := range items {
		items[i] = i
	}

	config := map[string]any{
		"items":         items,
		"batchSize":     200.0, // should be clamped to 100
		"maxIterations": 99999.0, // should be clamped to 10000
	}

	result, err := ExecuteIteratorNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Should process all 10 items (limited by array size, not maxIterations)
	if result.TotalItems != 10 {
		t.Errorf("expected 10 items, got %d", result.TotalItems)
	}
}

func TestExecuteIteratorNode_ContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	config := map[string]any{
		"items": []any{1, 2, 3},
	}

	_, err := ExecuteIteratorNode(ctx, config)
	if err == nil {
		t.Fatal("expected error from cancelled context")
	}
}

func TestExtractArray(t *testing.T) {
	tests := []struct {
		name  string
		input any
		want  int
	}{
		{"[]any", []any{1, 2, 3}, 3},
		{"[]string", []string{"a", "b"}, 2},
		{"[]int", []int{1, 2, 3, 4}, 4},
		{"[]float64", []float64{1.0, 2.0}, 2},
		{"nil", nil, 0},
		{"single string", "hello", 1},
		{"single int", 42, 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := extractArray(tt.input)
			if tt.want == 0 && result != nil {
				t.Errorf("expected nil for %s, got %v", tt.name, result)
			} else if tt.want > 0 && len(result) != tt.want {
				t.Errorf("expected %d items for %s, got %d", tt.want, tt.name, len(result))
			}
		})
	}
}

func TestExecuteIteratorNode_ComplexItems(t *testing.T) {
	items := []any{
		map[string]any{"name": "Alice", "age": 30},
		map[string]any{"name": "Bob", "age": 25},
	}

	config := map[string]any{
		"items": items,
	}

	result, err := ExecuteIteratorNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.TotalItems != 2 {
		t.Fatalf("expected 2 items, got %d", result.TotalItems)
	}

	// Verify complex item is preserved
	alice := result.Outputs[0]["item"].(map[string]any)
	if alice["name"] != "Alice" {
		t.Errorf("expected Alice, got %v", alice["name"])
	}
}

func TestExecuteIteratorNode_IndexedOutput(t *testing.T) {
	config := map[string]any{
		"items": []any{"x", "y", "z", "w"},
	}

	result, err := ExecuteIteratorNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	for i, output := range result.Outputs {
		if output["index"] != i {
			t.Errorf("item %d: expected index %d, got %v", i, i, output["index"])
		}
	}
}
