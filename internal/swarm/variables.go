// Package swarm provides typed workflow variables for structured data flow.
// Inspired by Dify's Variable System and Prefect's block-based configuration:
//   - Typed variables (string, number, boolean, json, array)
//   - Default values and required validation
//   - Workflow-scoped variables for node-to-node data passing
//   - Template resolution: {{variable.key}} → actual value
package swarm

import (
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"strings"
	"sync"
)

// WorkflowVariableType defines the type of a workflow variable.
type WorkflowVariableType string

const (
	VarTypeString  WorkflowVariableType = "string"
	VarTypeNumber  WorkflowVariableType = "number"
	VarTypeBoolean WorkflowVariableType = "boolean"
	VarTypeJSON    WorkflowVariableType = "json"
	VarTypeArray   WorkflowVariableType = "array"
)

// IsValid returns true if the variable type is recognized.
func (t WorkflowVariableType) IsValid() bool {
	switch t {
	case VarTypeString, VarTypeNumber, VarTypeBoolean, VarTypeJSON, VarTypeArray:
		return true
	}
	return false
}

// WorkflowVariable represents a typed variable in a workflow.
// Variables define the input/output schema of a workflow and enable
// structured data flow between nodes.
//
// Inspired by:
//   - Dify: Typed variables with default values, used in workflow nodes
//   - Prefect: Blocks with typed configuration for reusable parameters
//   - Temporal: Workflow parameters with schema validation
type WorkflowVariable struct {
	mu          sync.Mutex
	ID          string             `json:"id"`
	Name        string             `json:"name"`
	Key         string             `json:"key"`
	Type        WorkflowVariableType `json:"type"`
	Value       any                `json:"value"`
	Default     any                `json:"default,omitempty"`
	Description string             `json:"description,omitempty"`
	Required    bool               `json:"required"`
}

// GetValue returns the variable's current value (deep copied), falling back to default.
func (v *WorkflowVariable) GetValue() any {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.Value != nil {
		return deepCopyAny(v.Value) // deep copy to prevent data pollution
	}
	return deepCopyAny(v.Default) // deep copy default as well
}

// SetValue sets the variable's value with type validation.
func (v *WorkflowVariable) SetValue(value any) error {
	v.mu.Lock()
	defer v.mu.Unlock()

	if err := validateVariableValue(v.Type, value); err != nil {
		return err
	}
	v.Value = deepCopyAny(value) // Deep copy to prevent external mutation
	return nil
}

// Validate checks if the variable has a valid value set (or default if not required).
func (v *WorkflowVariable) Validate() error {
	v.mu.Lock()
	defer v.mu.Unlock()

	val := v.Value
	if val == nil {
		val = v.Default
	}
	if v.Required && val == nil {
		return fmt.Errorf("variable %q (%s) is required but has no value", v.Name, v.Key)
	}
	if val != nil {
		return validateVariableValue(v.Type, val)
	}
	return nil
}

// Snapshot returns a safe copy of the variable for external use.
func (v *WorkflowVariable) Snapshot() WorkflowVariable {
	v.mu.Lock()
	defer v.mu.Unlock()
	return WorkflowVariable{
		ID:          v.ID,
		Name:        v.Name,
		Key:         v.Key,
		Type:        v.Type,
		Value:       deepCopyAny(v.Value),
		Default:     deepCopyAny(v.Default),
		Description: v.Description,
		Required:    v.Required,
	}
}

// WorkflowVariableStore manages typed variables for workflows.
// Thread-safe: supports concurrent reads and writes.
type WorkflowVariableStore struct {
	mu        sync.RWMutex
	variables map[string][]*WorkflowVariable // workflowID -> ordered variables
}

// NewWorkflowVariableStore creates a new variable store.
func NewWorkflowVariableStore() *WorkflowVariableStore {
	return &WorkflowVariableStore{
		variables: make(map[string][]*WorkflowVariable),
	}
}

// AddVariable adds a variable to a workflow. Returns error if key is empty or duplicate.
func (s *WorkflowVariableStore) AddVariable(workflowID string, v *WorkflowVariable) error {
	if v.ID == "" {
		return fmt.Errorf("variable ID is required")
	}
	if strings.TrimSpace(v.Key) == "" {
		return fmt.Errorf("variable key is required")
	}
	// Default to string type if not specified
	if v.Type == "" {
		v.Type = VarTypeString
	}
	if !v.Type.IsValid() {
		return fmt.Errorf("invalid variable type: %q", v.Type)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	vars := s.variables[workflowID]
	for _, existing := range vars {
		existing.mu.Lock()
		if existing.Key == v.Key {
			existing.mu.Unlock()
			return fmt.Errorf("duplicate variable key: %q", v.Key)
		}
		existing.mu.Unlock()
	}

	s.variables[workflowID] = append(vars, v)
	log.Printf("[Variables] Added variable %q (key: %s, type: %s) to workflow %q", v.Name, v.Key, v.Type, workflowID)
	return nil
}

// RemoveVariable removes a variable by ID from a workflow.
func (s *WorkflowVariableStore) RemoveVariable(workflowID string, variableID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	vars := s.variables[workflowID]
	for i, v := range vars {
		if v.ID == variableID {
			s.variables[workflowID] = append(vars[:i], vars[i+1:]...)
			return true
		}
	}
	return false
}

// GetVariable returns a snapshot of a variable by ID.
func (s *WorkflowVariableStore) GetVariable(workflowID string, variableID string) *WorkflowVariable {
	s.mu.RLock()
	defer s.mu.RUnlock()

	vars := s.variables[workflowID]
	for _, v := range vars {
		if v.ID == variableID {
			snap := v.Snapshot()
			return &snap
		}
	}
	return nil
}

// GetVariableByKey returns a snapshot of a variable by key.
func (s *WorkflowVariableStore) GetVariableByKey(workflowID string, key string) *WorkflowVariable {
	s.mu.RLock()
	defer s.mu.RUnlock()

	vars := s.variables[workflowID]
	for _, v := range vars {
		v.mu.Lock()
		if v.Key == key {
			snap := WorkflowVariable{
				ID:          v.ID,
				Name:        v.Name,
				Key:         v.Key,
				Type:        v.Type,
				Value:       deepCopyAny(v.Value),
				Default:     deepCopyAny(v.Default),
				Description: v.Description,
				Required:    v.Required,
			}
			v.mu.Unlock()
			return &snap
		}
		v.mu.Unlock()
	}
	return nil
}

// ListVariables returns snapshots of all variables for a workflow.
func (s *WorkflowVariableStore) ListVariables(workflowID string) []WorkflowVariable {
	s.mu.RLock()
	defer s.mu.RUnlock()

	vars := s.variables[workflowID]
	result := make([]WorkflowVariable, 0, len(vars))
	for _, v := range vars {
		result = append(result, v.Snapshot())
	}
	return result
}

// SetVariableValue sets a variable's value by key.
func (s *WorkflowVariableStore) SetVariableValue(workflowID string, key string, value any) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	vars := s.variables[workflowID]
	for _, v := range vars {
		v.mu.Lock()
		if v.Key == key {
			v.mu.Unlock()
			return v.SetValue(value)
		}
		v.mu.Unlock()
	}
	return fmt.Errorf("variable %q not found in workflow %q", key, workflowID)
}

// ResolveVariables replaces {{variable.key}} templates in a string with actual values.
// Returns the resolved string and any errors encountered.
func (s *WorkflowVariableStore) ResolveVariables(workflowID string, template string) (string, error) {
	if template == "" || !strings.Contains(template, "{{") {
		return template, nil
	}

	s.mu.RLock()
	vars := s.variables[workflowID]
	// Build lookup map under lock (read fields directly to avoid nested lock)
	lookup := make(map[string]any, len(vars))
	for _, v := range vars {
		v.mu.Lock()
		val := v.Value
		if val == nil {
			val = v.Default
		}
		lookup[v.Key] = val
		v.mu.Unlock()
	}
	s.mu.RUnlock()

	// Find all {{key}} patterns and replace
	var errs []string
	result := variableTemplateRegex.ReplaceAllStringFunc(template, func(match string) string {
		key := strings.TrimSpace(match[2 : len(match)-2])
		val, ok := lookup[key]
		if !ok {
			errs = append(errs, fmt.Sprintf("variable %q not found", key))
			return match // leave unreplaced
		}
		return fmt.Sprintf("%v", val)
	})

	if len(errs) > 0 {
		return result, fmt.Errorf("variable resolution errors: %s", strings.Join(errs, "; "))
	}
	return result, nil
}

// ResolveVariablesInMap replaces {{variable.key}} templates in all string values of a map.
func (s *WorkflowVariableStore) ResolveVariablesInMap(workflowID string, m map[string]any) (map[string]any, error) {
	if m == nil {
		return nil, nil
	}

	result := make(map[string]any, len(m))
	var firstErr error
	for k, v := range m {
		if str, ok := v.(string); ok {
			resolved, err := s.ResolveVariables(workflowID, str)
			if err != nil && firstErr == nil {
				firstErr = err
			}
			result[k] = resolved
		} else {
			result[k] = v
		}
	}
	return result, firstErr
}

// ValidateAll checks all required variables have values set.
func (s *WorkflowVariableStore) ValidateAll(workflowID string) error {
	s.mu.RLock()
	vars := s.variables[workflowID]
	// Copy slice to avoid TOCTOU: concurrent AddVariable/RemoveVariable
	// may modify the backing array after we release RLock.
	snapshot := make([]*WorkflowVariable, len(vars))
	copy(snapshot, vars)
	s.mu.RUnlock()

	var errs []string
	for _, v := range snapshot {
		if err := v.Validate(); err != nil {
			errs = append(errs, err.Error())
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("variable validation failed: %s", strings.Join(errs, "; "))
	}
	return nil
}

// DeleteByWorkflow removes all variables for a workflow (used during workflow deletion).
func (s *WorkflowVariableStore) DeleteByWorkflow(workflowID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.variables, workflowID)
}

// MarshalJSON returns the store state as JSON.
func (s *WorkflowVariableStore) MarshalJSON() ([]byte, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// MEDIUM FIX: Snapshot variables to avoid race with WorkflowVariable.mu during json.Marshal
	snapshot := make(map[string][]*WorkflowVariable, len(s.variables))
	for wfID, vars := range s.variables {
		varsCopy := make([]*WorkflowVariable, len(vars))
		for i, v := range vars {
			snap := v.Snapshot()
			varsCopy[i] = &snap
		}
		snapshot[wfID] = varsCopy
	}

	return json.Marshal(map[string]any{
		"workflows": snapshot,
	})
}

// variableTemplateRegex matches {{key}} patterns in template strings.
var variableTemplateRegex = regexp.MustCompile(`\{\{([^}]+)\}\}`)

// validateVariableValue checks if a value matches the declared type.
func validateVariableValue(typ WorkflowVariableType, value any) error {
	switch typ {
	case VarTypeString:
		if _, ok := value.(string); !ok {
			return fmt.Errorf("expected string, got %T", value)
		}
	case VarTypeNumber:
		switch value.(type) {
		case float64, int, int64, int32, float32:
			// valid
		default:
			return fmt.Errorf("expected number, got %T", value)
		}
	case VarTypeBoolean:
		if _, ok := value.(bool); !ok {
			return fmt.Errorf("expected boolean, got %T", value)
		}
	case VarTypeJSON:
		if _, ok := value.(map[string]any); !ok {
			// Also accept string that could be JSON
			if _, ok := value.(string); !ok {
				return fmt.Errorf("expected JSON object or string, got %T", value)
			}
		}
	case VarTypeArray:
		if _, ok := value.([]any); !ok {
			return fmt.Errorf("expected array, got %T", value)
		}
	default:
		return nil // unknown type, no validation
	}
	return nil
}
