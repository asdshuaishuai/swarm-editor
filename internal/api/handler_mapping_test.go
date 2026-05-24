package api

import (
	"testing"

	"github.com/swarm-editor/swarm-editor/internal/lsp"
)

func TestMapToCallHierarchyItem(t *testing.T) {
	m := map[string]any{
		"name":    "testFunc",
		"kind":    float64(12),
		"detail":  "func()",
		"uri":     "file:///test.go",
		"range":   map[string]any{"start": map[string]any{"line": float64(1), "character": float64(0)}, "end": map[string]any{"line": float64(1), "character": float64(10)}},
		"selectionRange": map[string]any{"start": map[string]any{"line": float64(1), "character": float64(5)}, "end": map[string]any{"line": float64(1), "character": float64(14)}},
		"tags":    []any{float64(1)},
		"data":    "extra",
	}

	item := mapToCallHierarchyItem(m)
	if item.Name != "testFunc" {
		t.Errorf("expected name 'testFunc', got '%s'", item.Name)
	}
	if item.Kind != 12 {
		t.Errorf("expected kind 12, got %d", item.Kind)
	}
	if item.Detail != "func()" {
		t.Errorf("expected detail 'func()', got '%s'", item.Detail)
	}
	if item.URI != "file:///test.go" {
		t.Errorf("expected URI 'file:///test.go', got '%s'", item.URI)
	}
	if item.Range.Start.Line != 1 || item.Range.Start.Character != 0 {
		t.Errorf("expected range start (1,0), got (%d,%d)", item.Range.Start.Line, item.Range.Start.Character)
	}
	if item.SelectionRange.Start.Line != 1 || item.SelectionRange.Start.Character != 5 {
		t.Errorf("expected selectionRange start (1,5), got (%d,%d)", item.SelectionRange.Start.Line, item.SelectionRange.Start.Character)
	}
	if len(item.Tags) != 1 || item.Tags[0] != 1 {
		t.Errorf("expected tags [1], got %v", item.Tags)
	}
	if item.Data != "extra" {
		t.Errorf("expected data 'extra', got %v", item.Data)
	}
}

func TestMapToCallHierarchyItem_Minimal(t *testing.T) {
	item := mapToCallHierarchyItem(map[string]any{})
	if item.Name != "" {
		t.Errorf("expected empty name, got '%s'", item.Name)
	}
	if item.Kind != 0 {
		t.Errorf("expected kind 0, got %d", item.Kind)
	}
}

func TestMapToCallHierarchyItem_PartialFields(t *testing.T) {
	m := map[string]any{
		"name": "onlyName",
	}
	item := mapToCallHierarchyItem(m)
	if item.Name != "onlyName" {
		t.Errorf("expected name 'onlyName', got '%s'", item.Name)
	}
	if item.URI != "" {
		t.Errorf("expected empty URI, got '%s'", item.URI)
	}
}

func TestMapToTypeHierarchyItem(t *testing.T) {
	m := map[string]any{
		"name":    "MyType",
		"kind":    float64(23),
		"detail":  "struct{}",
		"uri":     "file:///types.go",
		"range":   map[string]any{"start": map[string]any{"line": float64(5), "character": float64(6)}, "end": map[string]any{"line": float64(5), "character": float64(20)}},
		"selectionRange": map[string]any{"start": map[string]any{"line": float64(5), "character": float64(6)}, "end": map[string]any{"line": float64(5), "character": float64(12)}},
		"tags":    []any{float64(2), float64(3)},
		"data":    map[string]any{"key": "value"},
	}

	item := mapToTypeHierarchyItem(m)
	if item.Name != "MyType" {
		t.Errorf("expected name 'MyType', got '%s'", item.Name)
	}
	if item.Kind != 23 {
		t.Errorf("expected kind 23, got %d", item.Kind)
	}
	if item.Detail != "struct{}" {
		t.Errorf("expected detail 'struct{}', got '%s'", item.Detail)
	}
	if item.URI != "file:///types.go" {
		t.Errorf("expected URI 'file:///types.go', got '%s'", item.URI)
	}
	if item.Range.Start.Line != 5 {
		t.Errorf("expected range start line 5, got %d", item.Range.Start.Line)
	}
	if len(item.Tags) != 2 {
		t.Errorf("expected 2 tags, got %d", len(item.Tags))
	}
	data, ok := item.Data.(map[string]any)
	if !ok {
		t.Fatal("expected data to be map[string]any")
	}
	if data["key"] != "value" {
		t.Errorf("expected data[key]='value', got %v", data["key"])
	}
}

func TestMapToTypeHierarchyItem_Minimal(t *testing.T) {
	item := mapToTypeHierarchyItem(map[string]any{})
	if item.Name != "" {
		t.Errorf("expected empty name, got '%s'", item.Name)
	}
}

func TestMapToCallHierarchyItem_InvalidTags(t *testing.T) {
	m := map[string]any{
		"name": "test",
		"tags": []any{"not-a-number"},
	}
	item := mapToCallHierarchyItem(m)
	if len(item.Tags) != 0 {
		t.Errorf("expected 0 tags for non-numeric tag, got %d", len(item.Tags))
	}
}

func TestMapToTypeHierarchyItem_InvalidTags(t *testing.T) {
	m := map[string]any{
		"name": "test",
		"tags": []any{"invalid", float64(1)},
	}
	item := mapToTypeHierarchyItem(m)
	if len(item.Tags) != 1 || item.Tags[0] != 1 {
		t.Errorf("expected tags [1], got %v", item.Tags)
	}
}

func TestCallHierarchyItemType(t *testing.T) {
	// Verify the returned type matches lsp.CallHierarchyItem
	m := map[string]any{"name": "fn"}
	item := mapToCallHierarchyItem(m)
	var _ lsp.CallHierarchyItem = item
}

func TestTypeHierarchyItemType(t *testing.T) {
	m := map[string]any{"name": "T"}
	item := mapToTypeHierarchyItem(m)
	var _ lsp.TypeHierarchyItem = item
}
