package swarm

import (
	"bytes"
	"fmt"
	"strings"
	"sync"
	"testing"
)

func TestWorkflowVariableType_IsValid(t *testing.T) {
	tests := []struct {
		typ   WorkflowVariableType
		valid bool
	}{
		{VarTypeString, true},
		{VarTypeNumber, true},
		{VarTypeBoolean, true},
		{VarTypeJSON, true},
		{VarTypeArray, true},
		{"unknown", false},
		{"", false},
	}

	for _, tt := range tests {
		if got := tt.typ.IsValid(); got != tt.valid {
			t.Errorf("type %q IsValid() = %v, want %v", tt.typ, got, tt.valid)
		}
	}
}

func TestWorkflowVariable_GetValue(t *testing.T) {
	v := &WorkflowVariable{Value: "set", Default: "default"}
	if got := v.GetValue(); got != "set" {
		t.Errorf("expected 'set', got %v", got)
	}

	v2 := &WorkflowVariable{Default: "default"}
	if got := v2.GetValue(); got != "default" {
		t.Errorf("expected 'default', got %v", got)
	}

	v3 := &WorkflowVariable{}
	if got := v3.GetValue(); got != nil {
		t.Errorf("expected nil, got %v", got)
	}
}

func TestWorkflowVariable_SetValue(t *testing.T) {
	v := &WorkflowVariable{Type: VarTypeString}

	if err := v.SetValue("hello"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v.GetValue() != "hello" {
		t.Errorf("expected 'hello', got %v", v.GetValue())
	}

	// Type mismatch
	if err := v.SetValue(42); err == nil {
		t.Error("expected error for type mismatch")
	}
}

func TestWorkflowVariable_Validate(t *testing.T) {
	// Required without value
	v := &WorkflowVariable{Name: "test", Key: "test", Type: VarTypeString, Required: true}
	if err := v.Validate(); err == nil {
		t.Error("expected error for required variable without value")
	}

	// Required with default
	v2 := &WorkflowVariable{Name: "test", Key: "test", Type: VarTypeString, Required: true, Default: "ok"}
	if err := v2.Validate(); err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	// Not required without value
	v3 := &WorkflowVariable{Name: "test", Key: "test", Type: VarTypeString}
	if err := v3.Validate(); err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	// Type mismatch
	v4 := &WorkflowVariable{Name: "test", Key: "test", Type: VarTypeString, Value: 42}
	if err := v4.Validate(); err == nil {
		t.Error("expected error for type mismatch")
	}
}

func TestWorkflowVariable_Snapshot(t *testing.T) {
	v := &WorkflowVariable{
		ID:    "var-1",
		Name:  "Test",
		Key:   "test",
		Type:  VarTypeString,
		Value: "hello",
	}
	snap := v.Snapshot()
	if snap.ID != "var-1" || snap.Name != "Test" || snap.Value != "hello" {
		t.Error("snapshot mismatch")
	}

	// Verify isolation
	snap.Value = "changed"
	if v.GetValue() != "hello" {
		t.Error("snapshot mutation leaked to original")
	}
}

func TestWorkflowVariable_SnapshotDeepCopy(t *testing.T) {
	// Test map deep copy isolation
	v := &WorkflowVariable{
		ID:    "var-1",
		Name:  "Test",
		Key:   "test",
		Type:  VarTypeJSON,
		Value: map[string]any{"nested": "data", "count": 42},
	}
	snap := v.Snapshot()
	snap.Value.(map[string]any)["nested"] = "mutated"
	original := v.GetValue().(map[string]any)
	if original["nested"] == "mutated" {
		t.Error("snapshot map mutation leaked to original")
	}
	if original["nested"] != "data" {
		t.Errorf("expected original 'data', got %v", original["nested"])
	}

	// Test array deep copy isolation
	v2 := &WorkflowVariable{
		ID:    "var-2",
		Name:  "TestArr",
		Key:   "test-arr",
		Type:  VarTypeArray,
		Value: []any{1, 2, 3},
	}
	snap2 := v2.Snapshot()
	snap2.Value.([]any)[0] = 99
	original2 := v2.GetValue().([]any)
	if original2[0] == 99 {
		t.Error("snapshot array mutation leaked to original")
	}
	if original2[0] != 1 {
		t.Errorf("expected original 1, got %v", original2[0])
	}

	// Test Default field deep copy
	v3 := &WorkflowVariable{
		ID:      "var-3",
		Name:    "TestDefault",
		Key:     "test-default",
		Type:    VarTypeJSON,
		Default: map[string]any{"config": "value"},
	}
	snap3 := v3.Snapshot()
	snap3.Default.(map[string]any)["config"] = "mutated"
	original3 := v3.Default.(map[string]any)
	if original3["config"] == "mutated" {
		t.Error("snapshot Default mutation leaked to original")
	}
}

func TestWorkflowVariableStore_AddVariable(t *testing.T) {
	s := NewWorkflowVariableStore()

	v := &WorkflowVariable{ID: "var-1", Name: "Test", Key: "test", Type: VarTypeString}
	if err := s.AddVariable("wf-1", v); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Duplicate key
	v2 := &WorkflowVariable{ID: "var-2", Name: "Test2", Key: "test", Type: VarTypeString}
	if err := s.AddVariable("wf-1", v2); err == nil {
		t.Error("expected error for duplicate key")
	}

	// Empty key
	v3 := &WorkflowVariable{ID: "var-3", Name: "Test3", Key: "", Type: VarTypeString}
	if err := s.AddVariable("wf-1", v3); err == nil {
		t.Error("expected error for empty key")
	}

	// Invalid type
	v4 := &WorkflowVariable{ID: "var-4", Name: "Test4", Key: "test4", Type: "invalid"}
	if err := s.AddVariable("wf-1", v4); err == nil {
		t.Error("expected error for invalid type")
	}

	// Empty ID
	v5 := &WorkflowVariable{Name: "Test5", Key: "test5", Type: VarTypeString}
	if err := s.AddVariable("wf-1", v5); err == nil {
		t.Error("expected error for empty ID")
	}
}

func TestWorkflowVariableStore_RemoveVariable(t *testing.T) {
	s := NewWorkflowVariableStore()

	s.AddVariable("wf-1", &WorkflowVariable{ID: "var-1", Key: "test1", Type: VarTypeString})
	s.AddVariable("wf-1", &WorkflowVariable{ID: "var-2", Key: "test2", Type: VarTypeString})

	if !s.RemoveVariable("wf-1", "var-1") {
		t.Error("expected true for existing variable")
	}
	if s.RemoveVariable("wf-1", "var-1") {
		t.Error("expected false for removed variable")
	}
	if s.RemoveVariable("wf-1", "nonexistent") {
		t.Error("expected false for nonexistent variable")
	}

	vars := s.ListVariables("wf-1")
	if len(vars) != 1 {
		t.Errorf("expected 1 variable, got %d", len(vars))
	}
}

func TestWorkflowVariableStore_GetVariable(t *testing.T) {
	s := NewWorkflowVariableStore()
	s.AddVariable("wf-1", &WorkflowVariable{ID: "var-1", Key: "test", Type: VarTypeString, Value: "hello"})

	got := s.GetVariable("wf-1", "var-1")
	if got == nil {
		t.Fatal("expected non-nil variable")
	}
	if got.Key != "test" {
		t.Errorf("expected key 'test', got %s", got.Key)
	}
	if s.GetVariable("wf-1", "nonexistent") != nil {
		t.Error("expected nil for nonexistent variable")
	}
}

func TestWorkflowVariableStore_GetVariableByKey(t *testing.T) {
	s := NewWorkflowVariableStore()
	s.AddVariable("wf-1", &WorkflowVariable{ID: "var-1", Key: "user_name", Type: VarTypeString, Value: "Alice"})

	got := s.GetVariableByKey("wf-1", "user_name")
	if got == nil {
		t.Fatal("expected non-nil variable")
	}
	if got.Value != "Alice" {
		t.Errorf("expected 'Alice', got %v", got.Value)
	}
}

func TestWorkflowVariableStore_ListVariables(t *testing.T) {
	s := NewWorkflowVariableStore()
	s.AddVariable("wf-1", &WorkflowVariable{ID: "var-1", Key: "a", Type: VarTypeString})
	s.AddVariable("wf-1", &WorkflowVariable{ID: "var-2", Key: "b", Type: VarTypeNumber})

	vars := s.ListVariables("wf-1")
	if len(vars) != 2 {
		t.Fatalf("expected 2 variables, got %d", len(vars))
	}

	// Empty workflow
	vars2 := s.ListVariables("wf-nonexistent")
	if len(vars2) != 0 {
		t.Errorf("expected 0 variables, got %d", len(vars2))
	}
}

func TestWorkflowVariableStore_SetVariableValue(t *testing.T) {
	s := NewWorkflowVariableStore()
	s.AddVariable("wf-1", &WorkflowVariable{ID: "var-1", Key: "count", Type: VarTypeNumber})

	if err := s.SetVariableValue("wf-1", "count", 42); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got := s.GetVariableByKey("wf-1", "count")
	if got.GetValue() != 42 {
		t.Errorf("expected 42, got %v", got.GetValue())
	}

	// Type mismatch
	if err := s.SetVariableValue("wf-1", "count", "not a number"); err == nil {
		t.Error("expected error for type mismatch")
	}

	// Nonexistent
	if err := s.SetVariableValue("wf-1", "nonexistent", "val"); err == nil {
		t.Error("expected error for nonexistent variable")
	}
}

func TestWorkflowVariableStore_ResolveVariables(t *testing.T) {
	s := NewWorkflowVariableStore()
	s.AddVariable("wf-1", &WorkflowVariable{ID: "var-1", Key: "name", Type: VarTypeString, Value: "Alice"})
	s.AddVariable("wf-1", &WorkflowVariable{ID: "var-2", Key: "count", Type: VarTypeNumber, Value: 42})

	tests := []struct {
		name     string
		template string
		expected string
		hasError bool
	}{
		{"simple", "Hello {{name}}", "Hello Alice", false},
		{"multiple", "{{name}} has {{count}} items", "Alice has 42 items", false},
		{"no template", "plain text", "plain text", false},
		{"empty", "", "", false},
		{"unknown var", "Hello {{unknown}}", "Hello {{unknown}}", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := s.ResolveVariables("wf-1", tt.template)
			if tt.hasError && err == nil {
				t.Error("expected error")
			}
			if !tt.hasError && err != nil {
				t.Errorf("unexpected error: %v", err)
			}
			if result != tt.expected {
				t.Errorf("expected %q, got %q", tt.expected, result)
			}
		})
	}
}

func TestWorkflowVariableStore_ResolveVariablesInMap(t *testing.T) {
	s := NewWorkflowVariableStore()
	s.AddVariable("wf-1", &WorkflowVariable{ID: "var-1", Key: "name", Type: VarTypeString, Value: "Alice"})

	m := map[string]any{
		"greeting": "Hello {{name}}",
		"count":    42,
	}

	result, err := s.ResolveVariablesInMap("wf-1", m)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result["greeting"] != "Hello Alice" {
		t.Errorf("expected 'Hello Alice', got %v", result["greeting"])
	}
	if result["count"] != 42 {
		t.Errorf("expected 42, got %v", result["count"])
	}
}

func TestWorkflowVariableStore_ValidateAll(t *testing.T) {
	s := NewWorkflowVariableStore()
	s.AddVariable("wf-1", &WorkflowVariable{ID: "var-1", Key: "name", Type: VarTypeString, Value: "Alice"})
	s.AddVariable("wf-1", &WorkflowVariable{ID: "var-2", Key: "missing", Type: VarTypeString, Required: true})

	if err := s.ValidateAll("wf-1"); err == nil {
		t.Error("expected validation error for missing required variable")
	}

	// Set the missing variable
	s.SetVariableValue("wf-1", "missing", "now set")
	if err := s.ValidateAll("wf-1"); err != nil {
		t.Errorf("unexpected error after setting value: %v", err)
	}
}

func TestWorkflowVariableStore_DeleteByWorkflow(t *testing.T) {
	s := NewWorkflowVariableStore()
	s.AddVariable("wf-1", &WorkflowVariable{ID: "var-1", Key: "a", Type: VarTypeString})
	s.AddVariable("wf-1", &WorkflowVariable{ID: "var-2", Key: "b", Type: VarTypeString})

	s.DeleteByWorkflow("wf-1")

	vars := s.ListVariables("wf-1")
	if len(vars) != 0 {
		t.Errorf("expected 0 variables after delete, got %d", len(vars))
	}
}

func TestWorkflowVariableStore_ConcurrentAccess(t *testing.T) {
	s := NewWorkflowVariableStore()

	// Pre-populate
	for i := 0; i < 10; i++ {
		s.AddVariable("wf-1", &WorkflowVariable{
			ID:    fmt.Sprintf("var-%d", i),
			Key:   fmt.Sprintf("key-%d", i),
			Type:  VarTypeString,
			Value: fmt.Sprintf("val-%d", i),
		})
	}

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			key := fmt.Sprintf("key-%d", idx%10)
			s.SetVariableValue("wf-1", key, fmt.Sprintf("updated-%d", idx))
			s.GetVariableByKey("wf-1", key)
			s.ResolveVariables("wf-1", fmt.Sprintf("{{%s}}", key))
		}(i)
	}
	wg.Wait()
}

func TestWorkflowVariableStore_DefaultType(t *testing.T) {
	s := NewWorkflowVariableStore()
	v := &WorkflowVariable{ID: "var-1", Key: "test", Type: ""} // empty type defaults to string
	if err := s.AddVariable("wf-1", v); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got := s.GetVariable("wf-1", "var-1")
	if got.Type != VarTypeString {
		t.Errorf("expected default type 'string', got %s", got.Type)
	}
}

func TestValidateVariableValue(t *testing.T) {
	tests := []struct {
		typ    WorkflowVariableType
		value  any
		hasErr bool
	}{
		{VarTypeString, "hello", false},
		{VarTypeString, 42, true},
		{VarTypeNumber, 42.0, false},
		{VarTypeNumber, 42, false},
		{VarTypeNumber, "not a number", true},
		{VarTypeBoolean, true, false},
		{VarTypeBoolean, "true", true},
		{VarTypeJSON, map[string]any{"a": 1}, false},
		{VarTypeJSON, `{"a":1}`, false}, // string JSON is accepted
		{VarTypeJSON, 42, true},
		{VarTypeArray, []any{1, 2, 3}, false},
		{VarTypeArray, "not array", true},
	}

	for _, tt := range tests {
		err := validateVariableValue(tt.typ, tt.value)
		if tt.hasErr && err == nil {
			t.Errorf("type=%s value=%v: expected error", tt.typ, tt.value)
		}
		if !tt.hasErr && err != nil {
			t.Errorf("type=%s value=%v: unexpected error: %v", tt.typ, tt.value, err)
		}
	}
}

func TestWorkflowVariableStore_MarshalJSON(t *testing.T) {
	s := NewWorkflowVariableStore()
	// Empty store
	data, err := s.MarshalJSON()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(data) != `{"workflows":{}}` {
		t.Errorf("empty store: got %s", data)
	}

	// Add some variables (must use AddVariable first, then SetVariableValue)
	if err := s.AddVariable("wf-1", &WorkflowVariable{ID: "var-1", Key: "name", Type: VarTypeString}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := s.AddVariable("wf-1", &WorkflowVariable{ID: "var-2", Key: "count", Type: VarTypeNumber}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := s.AddVariable("wf-2", &WorkflowVariable{ID: "var-3", Key: "flag", Type: VarTypeBoolean}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Set values
	s.SetVariableValue("wf-1", "name", "test")
	s.SetVariableValue("wf-1", "count", 42)
	s.SetVariableValue("wf-2", "flag", true)

	data, err = s.MarshalJSON()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Should contain both workflows
	if !bytes.Contains(data, []byte("wf-1")) {
		t.Error("expected wf-1 in output")
	}
	if !bytes.Contains(data, []byte("wf-2")) {
		t.Error("expected wf-2 in output")
	}
}

func TestPropagationContext_String(t *testing.T) {
	// nil context
	var pc *PropagationContext
	if got := pc.String(); got != "PropagationContext(nil)" {
		t.Errorf("nil context: got %q", got)
	}

	// Valid context
	pc = NewPropagationContext("trace-1")
	got := pc.String()
	if !strings.Contains(got, "trace-1") {
		t.Errorf("expected trace ID in output, got %s", got)
	}
}
