package swarm

import (
	"sync"
	"testing"
	"time"
)

func TestNewWorkflowArtifactStore(t *testing.T) {
	store := NewWorkflowArtifactStore()
	if store == nil {
		t.Fatal("expected non-nil store")
	}
	if store.Count() != 0 {
		t.Fatalf("expected 0 artifacts, got %d", store.Count())
	}
}

func TestWorkflowArtifactStore_CreateAndGet(t *testing.T) {
	store := NewWorkflowArtifactStore()

	artifact := &WorkflowArtifact{
		WorkflowID:  "wf-123",
		NodeID:      "node-1",
		Key:         "output",
		Type:        WorkflowArtifactTypeJSON,
		Data:        map[string]any{"result": 42},
		Description: "test output",
	}

	created, err := store.CreateOrUpdate(artifact)
	if err != nil {
		t.Fatalf("CreateOrUpdate failed: %v", err)
	}
	if created.ID == "" {
		t.Error("expected auto-generated ID")
	}
	if created.Version != 0 {
		t.Fatalf("expected version 0, got %d", created.Version)
	}
	if created.CreatedAt.IsZero() {
		t.Error("expected non-zero CreatedAt")
	}

	// Get by workflowID + key
	got := store.Get("wf-123", "output")
	if got == nil {
		t.Fatal("expected artifact, got nil")
	}
	if got.Data.(map[string]any)["result"] != 42 {
		t.Error("data mismatch")
	}

	// Get non-existent
	got = store.Get("wf-123", "nonexistent")
	if got != nil {
		t.Error("expected nil for non-existent artifact")
	}
}

func TestWorkflowArtifactStore_UpdateVersion(t *testing.T) {
	store := NewWorkflowArtifactStore()

	artifact := &WorkflowArtifact{
		WorkflowID: "wf-123",
		Key:        "output",
		Type:       WorkflowArtifactTypeJSON,
		Data:       map[string]any{"v": 1},
	}

	created, err := store.CreateOrUpdate(artifact)
	if err != nil {
		t.Fatalf("CreateOrUpdate failed: %v", err)
	}
	if created.Version != 0 {
		t.Fatalf("expected version 0, got %d", created.Version)
	}

	// Update with same key
	updated := &WorkflowArtifact{
		WorkflowID: "wf-123",
		Key:        "output",
		Type:       WorkflowArtifactTypeMarkdown,
		Data:       "# Updated",
	}

	result, err := store.CreateOrUpdate(updated)
	if err != nil {
		t.Fatalf("CreateOrUpdate update failed: %v", err)
	}
	if result.Version != 1 {
		t.Fatalf("expected version 1, got %d", result.Version)
	}
	if result.Type != WorkflowArtifactTypeMarkdown {
		t.Error("expected updated type")
	}
	if result.ID != created.ID {
		t.Error("expected preserved ID on update")
	}

	// Third update
	_, err = store.CreateOrUpdate(&WorkflowArtifact{
		WorkflowID: "wf-123",
		Key:        "output",
		Data:       "v3",
	})
	if err != nil {
		t.Fatalf("third update failed: %v", err)
	}

	got := store.Get("wf-123", "output")
	if got.Version != 2 {
		t.Fatalf("expected version 2, got %d", got.Version)
	}
}

func TestWorkflowArtifactStore_Validation(t *testing.T) {
	store := NewWorkflowArtifactStore()

	// Missing workflowID
	_, err := store.CreateOrUpdate(&WorkflowArtifact{Key: "k"})
	if err == nil {
		t.Error("expected error for missing workflowID")
	}

	// Missing key
	_, err = store.CreateOrUpdate(&WorkflowArtifact{WorkflowID: "wf"})
	if err == nil {
		t.Error("expected error for missing key")
	}

	// Auto-generate ID
	_, err = store.CreateOrUpdate(&WorkflowArtifact{
		WorkflowID: "wf",
		Key:        "k",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestWorkflowArtifactStore_DefaultType(t *testing.T) {
	store := NewWorkflowArtifactStore()

	artifact := &WorkflowArtifact{
		WorkflowID: "wf",
		Key:        "k",
		Data:       "data",
	}

	result, err := store.CreateOrUpdate(artifact)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Type != WorkflowArtifactTypeJSON {
		t.Fatalf("expected default type JSON, got %s", result.Type)
	}
}

func TestWorkflowArtifactStore_GetByID(t *testing.T) {
	store := NewWorkflowArtifactStore()

	created, _ := store.CreateOrUpdate(&WorkflowArtifact{
		ID:         "custom-id",
		WorkflowID: "wf",
		Key:        "k",
		Data:       "data",
	})

	got := store.GetByID(created.ID)
	if got == nil {
		t.Fatal("expected artifact by ID")
	}
	if got.WorkflowID != "wf" {
		t.Error("workflowID mismatch")
	}

	got = store.GetByID("nonexistent")
	if got != nil {
		t.Error("expected nil for non-existent ID")
	}
}

func TestWorkflowArtifactStore_ListByWorkflow(t *testing.T) {
	store := NewWorkflowArtifactStore()

	store.CreateOrUpdate(&WorkflowArtifact{WorkflowID: "wf-1", NodeID: "n1", Key: "a", Data: 1})
	store.CreateOrUpdate(&WorkflowArtifact{WorkflowID: "wf-1", NodeID: "n2", Key: "b", Data: 2})
	store.CreateOrUpdate(&WorkflowArtifact{WorkflowID: "wf-2", NodeID: "n1", Key: "c", Data: 3})

	// List all for wf-1
	all := store.ListByWorkflow("wf-1", "")
	if len(all) != 2 {
		t.Fatalf("expected 2 artifacts, got %d", len(all))
	}

	// Filter by nodeID
	filtered := store.ListByWorkflow("wf-1", "n1")
	if len(filtered) != 1 {
		t.Fatalf("expected 1 artifact, got %d", len(filtered))
	}
	if filtered[0].Key != "a" {
		t.Error("expected artifact with key 'a'")
	}

	// Non-existent workflow
	empty := store.ListByWorkflow("wf-nonexistent", "")
	if len(empty) != 0 {
		t.Fatalf("expected 0 artifacts, got %d", len(empty))
	}
}

func TestWorkflowArtifactStore_Delete(t *testing.T) {
	store := NewWorkflowArtifactStore()

	store.CreateOrUpdate(&WorkflowArtifact{WorkflowID: "wf", Key: "k1", Data: 1})
	store.CreateOrUpdate(&WorkflowArtifact{WorkflowID: "wf", Key: "k2", Data: 2})

	// Delete specific
	deleted := store.Delete("wf", "k1")
	if !deleted {
		t.Error("expected delete to return true")
	}
	if store.Count() != 1 {
		t.Fatalf("expected 1 artifact, got %d", store.Count())
	}

	got := store.Get("wf", "k1")
	if got != nil {
		t.Error("expected nil after delete")
	}
}

func TestWorkflowArtifactStore_DeleteByWorkflow(t *testing.T) {
	store := NewWorkflowArtifactStore()

	store.CreateOrUpdate(&WorkflowArtifact{WorkflowID: "wf-1", Key: "a", Data: 1})
	store.CreateOrUpdate(&WorkflowArtifact{WorkflowID: "wf-1", Key: "b", Data: 2})
	store.CreateOrUpdate(&WorkflowArtifact{WorkflowID: "wf-2", Key: "c", Data: 3})

	count := store.DeleteByWorkflow("wf-1")
	if count != 2 {
		t.Fatalf("expected 2 deleted, got %d", count)
	}
	if store.Count() != 1 {
		t.Fatalf("expected 1 remaining, got %d", store.Count())
	}
}

func TestWorkflowArtifactStore_Prune(t *testing.T) {
	store := NewWorkflowArtifactStore()
	store.SetMaxPerNode(2)

	store.CreateOrUpdate(&WorkflowArtifact{WorkflowID: "wf", NodeID: "n1", Key: "a", Data: 1})
	store.CreateOrUpdate(&WorkflowArtifact{WorkflowID: "wf", NodeID: "n1", Key: "b", Data: 2})
	store.CreateOrUpdate(&WorkflowArtifact{WorkflowID: "wf", NodeID: "n1", Key: "c", Data: 3})
	store.CreateOrUpdate(&WorkflowArtifact{WorkflowID: "wf", NodeID: "n2", Key: "d", Data: 4})

	pruned := store.Prune()
	if pruned != 1 {
		t.Fatalf("expected 1 pruned, got %d", pruned)
	}
	if store.Count() != 3 {
		t.Fatalf("expected 3 remaining, got %d", store.Count())
	}

	// Prune again should be no-op
	pruned = store.Prune()
	if pruned != 0 {
		t.Fatalf("expected 0 pruned, got %d", pruned)
	}

	// Unlimited max (0) should prune nothing
	store.SetMaxPerNode(0)
	store.CreateOrUpdate(&WorkflowArtifact{WorkflowID: "wf", NodeID: "n1", Key: "e", Data: 5})
	store.CreateOrUpdate(&WorkflowArtifact{WorkflowID: "wf", NodeID: "n1", Key: "f", Data: 6})
	pruned = store.Prune()
	if pruned != 0 {
		t.Fatalf("expected 0 pruned with unlimited, got %d", pruned)
	}
}

func TestWorkflowArtifactStore_MarshalJSON(t *testing.T) {
	store := NewWorkflowArtifactStore()
	store.CreateOrUpdate(&WorkflowArtifact{
		WorkflowID: "wf",
		Key:        "k",
		Type:       WorkflowArtifactTypeText,
		Data:       "hello",
	})

	data, err := store.MarshalJSON()
	if err != nil {
		t.Fatalf("MarshalJSON failed: %v", err)
	}
	if len(data) == 0 {
		t.Error("expected non-empty JSON")
	}
}

func TestWorkflowArtifactStore_ConcurrentAccess(t *testing.T) {
	store := NewWorkflowArtifactStore()
	store.SetMaxPerNode(100)

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			store.CreateOrUpdate(&WorkflowArtifact{
				WorkflowID: "wf",
				NodeID:      "n1",
				Key:         "key",
				Data:        i,
			})
		}(i)
	}
	wg.Wait()

	if store.Count() != 1 {
		t.Fatalf("expected 1 artifact (key updates), got %d", store.Count())
	}

	got := store.Get("wf", "key")
	if got == nil {
		t.Fatal("expected artifact")
	}
	// Version should be 99 (first create + 99 updates)
	if got.Version != 99 {
		t.Fatalf("expected version 99, got %d", got.Version)
	}
}

func TestWorkflowArtifactStore_Metadata(t *testing.T) {
	store := NewWorkflowArtifactStore()

	artifact := &WorkflowArtifact{
		WorkflowID: "wf",
		Key:        "k",
		Data:       "data",
		Metadata: map[string]string{
			"source": "test",
			"env":    "ci",
		},
	}

	created, _ := store.CreateOrUpdate(artifact)
	if len(created.Metadata) != 2 {
		t.Fatalf("expected 2 metadata entries, got %d", len(created.Metadata))
	}

	// Update without metadata should preserve existing
	store.CreateOrUpdate(&WorkflowArtifact{
		WorkflowID: "wf",
		Key:        "k",
		Data:       "updated",
	})
	got := store.Get("wf", "k")
	if len(got.Metadata) != 2 {
		t.Fatalf("expected preserved metadata, got %d entries", len(got.Metadata))
	}

	// Update with metadata should replace
	store.CreateOrUpdate(&WorkflowArtifact{
		WorkflowID: "wf",
		Key:        "k",
		Data:       "updated2",
		Metadata:   map[string]string{"new": "meta"},
	})
	got = store.Get("wf", "k")
	if len(got.Metadata) != 1 {
		t.Fatalf("expected 1 metadata entry after replace, got %d", len(got.Metadata))
	}
}

func TestWorkflowArtifactStore_MetadataAutoInit(t *testing.T) {
	store := NewWorkflowArtifactStore()

	artifact := &WorkflowArtifact{
		WorkflowID: "wf",
		Key:        "k",
		Data:       "data",
		// Metadata is nil
	}

	created, _ := store.CreateOrUpdate(artifact)
	if created.Metadata == nil {
		t.Error("expected auto-initialized metadata map")
	}
}

func TestSnapshotWorkflowArtifact_Isolation(t *testing.T) {
	original := &WorkflowArtifact{
		ID:          "art-123",
		WorkflowID:  "wf",
		NodeID:      "n1",
		Key:         "k",
		Type:        WorkflowArtifactTypeJSON,
		Data:        map[string]any{"x": 1},
		Description: "original",
		Version:     3,
		CreatedAt:   time.Now().Add(-time.Hour),
		UpdatedAt:   time.Now(),
		Metadata:    map[string]string{"a": "b"},
	}

	snapshot := snapshotWorkflowArtifact(original)

	// In-place mutation of map Data should not affect original
	snapshot.Data.(map[string]any)["y"] = 99
	if original.Data.(map[string]any)["y"] != nil {
		t.Error("snapshot Data map mutation leaked to original")
	}
	if len(original.Data.(map[string]any)) != 1 {
		t.Error("original Data map size changed")
	}

	// Metadata mutation should not affect original
	snapshot.Metadata["c"] = "d"
	if len(original.Metadata) != 1 {
		t.Error("snapshot metadata change leaked to original")
	}

	// Description is a string (immutable), safe
	snapshot.Description = "modified"
	if original.Description != "original" {
		t.Error("snapshot description change leaked to original")
	}

	// Slice Data should be isolated
	originalSlice := &WorkflowArtifact{
		ID:   "art-slice",
		Data: []any{"a", "b", "c"},
	}
	snapSlice := snapshotWorkflowArtifact(originalSlice)
	snapSlice.Data.([]any)[0] = "Z"
	if originalSlice.Data.([]any)[0] != "a" {
		t.Error("snapshot slice mutation leaked to original")
	}
}

func TestWorkflowArtifactStore_PruneOldestFirst(t *testing.T) {
	store := NewWorkflowArtifactStore()
	store.SetMaxPerNode(2)

	// Create artifacts with different timestamps
	a1, _ := store.CreateOrUpdate(&WorkflowArtifact{WorkflowID: "wf", NodeID: "n1", Key: "oldest", Data: 1})
	a2, _ := store.CreateOrUpdate(&WorkflowArtifact{WorkflowID: "wf", NodeID: "n1", Key: "middle", Data: 2})
	_, _ = store.CreateOrUpdate(&WorkflowArtifact{WorkflowID: "wf", NodeID: "n1", Key: "newest", Data: 3})

	// Manually set CreatedAt to control prune order
	a1.mu.Lock()
	a1.CreatedAt = time.Now().Add(-2 * time.Hour)
	a1.mu.Unlock()
	a2.mu.Lock()
	a2.CreatedAt = time.Now().Add(-1 * time.Hour)
	a2.mu.Unlock()

	store.Prune()

	if store.Get("wf", "oldest") != nil {
		t.Error("oldest artifact should have been pruned")
	}
	if store.Get("wf", "middle") == nil || store.Get("wf", "newest") == nil {
		t.Error("newer artifacts should survive pruning")
	}
}

// Tests for deepCopyAny function

func TestDeepCopyAny_Nil(t *testing.T) {
	result := deepCopyAny(nil)
	if result != nil {
		t.Errorf("expected nil, got %v", result)
	}
}

func TestDeepCopyAny_MapStringAny(t *testing.T) {
	original := map[string]any{
		"a": 1,
		"b": "string",
		"c": map[string]any{"nested": true},
	}
	cp := deepCopyAny(original).(map[string]any)

	// Modify original - copy should not be affected
	original["a"] = 999
	original["c"].(map[string]any)["nested"] = false

	if cp["a"] == 999 {
		t.Error("deep copy should not reflect changes to original")
	}
	if cp["c"].(map[string]any)["nested"] == false {
		t.Error("nested map should be independent")
	}
}

func TestDeepCopyAny_MapStringString(t *testing.T) {
	original := map[string]string{"a": "1", "b": "2"}
	cp := deepCopyAny(original).(map[string]string)

	original["a"] = "modified"
	if cp["a"] != "1" {
		t.Error("string map copy should be independent")
	}
}

func TestDeepCopyAny_SliceAny(t *testing.T) {
	original := []any{"a", "b", map[string]any{"key": "val"}}
	cp := deepCopyAny(original).([]any)

	original[0] = "modified"
	original[2].(map[string]any)["key"] = "modified"

	if cp[0] == "modified" {
		t.Error("slice copy should be independent")
	}
	if cp[2].(map[string]any)["key"] == "modified" {
		t.Error("nested map in slice should be independent")
	}
}

func TestDeepCopyAny_SliceString(t *testing.T) {
	original := []string{"a", "b", "c"}
	cp := deepCopyAny(original).([]string)

	original[0] = "modified"
	if cp[0] != "a" {
		t.Error("string slice should be independent")
	}
}

func TestDeepCopyAny_SliceInt(t *testing.T) {
	original := []int{1, 2, 3}
	cp := deepCopyAny(original).([]int)

	original[0] = 999
	if cp[0] != 1 {
		t.Error("int slice should be independent")
	}
}

func TestDeepCopyAny_SliceFloat64(t *testing.T) {
	original := []float64{1.1, 2.2}
	cp := deepCopyAny(original).([]float64)

	original[0] = 9.9
	if cp[0] != 1.1 {
		t.Error("float64 slice should be independent")
	}
}

func TestDeepCopyAny_Primitives(t *testing.T) {
	tests := []struct {
		name  string
		value any
	}{
		{"string", "hello"},
		{"int", 42},
		{"float64", 3.14},
		{"bool", true},
		{"bool false", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := deepCopyAny(tt.value)
			if result != tt.value {
				t.Errorf("primitives should pass through, got %v", result)
			}
		})
	}
}

func TestDeepCopyAny_NestedStructures(t *testing.T) {
	original := map[string]any{
		"slice": []any{
			map[string]any{"inner": []int{1, 2, 3}},
		},
	}
	cp := deepCopyAny(original).(map[string]any)

	// Deep modification
	original["slice"].([]any)[0].(map[string]any)["inner"].([]int)[0] = 999

	if cp["slice"].([]any)[0].(map[string]any)["inner"].([]int)[0] == 999 {
		t.Error("deeply nested structure should be independent")
	}
}

func TestDeepCopyAny_SliceBool(t *testing.T) {
	original := []bool{true, false, true}
	cp := deepCopyAny(original).([]bool)
	if len(cp) != 3 {
		t.Errorf("len = %d, want 3", len(cp))
	}
	original[0] = false
	if cp[0] != true {
		t.Error("slice should be independent")
	}
}

func TestDeepCopyAny_SliceMapStringAny(t *testing.T) {
	original := []map[string]any{
		{"a": 1},
		nil,
		{"b": 2},
	}
	cp := deepCopyAny(original).([]map[string]any)
	if len(cp) != 3 {
		t.Errorf("len = %d, want 3", len(cp))
	}
	if cp[1] != nil {
		t.Error("nil element should remain nil")
	}

	// Verify independence
	original[0]["a"] = 999
	if cp[0]["a"] == 999 {
		t.Error("inner maps should be deep copied")
	}
}

func TestDeepCopyAny_MapStringInt(t *testing.T) {
	original := map[string]int{"a": 1, "b": 2}
	cp := deepCopyAny(original).(map[string]int)
	if cp["a"] != 1 || cp["b"] != 2 {
		t.Error("values should be copied")
	}
	original["a"] = 999
	if cp["a"] == 999 {
		t.Error("map should be independent")
	}
}

func TestDeepCopyAny_MapStringFloat64(t *testing.T) {
	original := map[string]float64{"pi": 3.14, "e": 2.71}
	cp := deepCopyAny(original).(map[string]float64)
	if cp["pi"] != 3.14 {
		t.Error("values should be copied")
	}
	original["pi"] = 99.9
	if cp["pi"] == 99.9 {
		t.Error("map should be independent")
	}
}

func TestDeepCopyAny_EmptyCollections(t *testing.T) {
	// Empty map[string]any
	m := deepCopyAny(map[string]any{}).(map[string]any)
	if len(m) != 0 {
		t.Error("empty map should remain empty")
	}

	// Empty []any
	s := deepCopyAny([]any{}).([]any)
	if len(s) != 0 {
		t.Error("empty slice should remain empty")
	}
}
