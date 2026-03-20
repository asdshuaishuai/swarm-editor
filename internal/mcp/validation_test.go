package mcp

import (
	"testing"
)

func TestNewSchemaValidator(t *testing.T) {
	v := NewSchemaValidator(true)
	if v == nil {
		t.Fatal("NewSchemaValidator returned nil")
	}
	if !v.strict {
		t.Error("expected strict mode")
	}
}

func TestValidateRequiredFields(t *testing.T) {
	v := NewSchemaValidator(false)
	schema := InputSchema{
		Type: "object",
		Properties: map[string]Property{
			"name": {Type: "string"},
		},
		Required: []string{"name"},
	}

	// Missing required field
	err := v.Validate(map[string]interface{}{}, schema)
	if err == nil {
		t.Error("expected error for missing required field")
	}

	// Required field present
	err = v.Validate(map[string]interface{}{"name": "test"}, schema)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestValidateStringType(t *testing.T) {
	v := NewSchemaValidator(false)
	schema := InputSchema{
		Type: "object",
		Properties: map[string]Property{
			"name": {Type: "string"},
		},
	}

	// Valid string
	err := v.Validate(map[string]interface{}{"name": "test"}, schema)
	if err != nil {
		t.Errorf("unexpected error for valid string: %v", err)
	}

	// Invalid type
	err = v.Validate(map[string]interface{}{"name": 123}, schema)
	if err == nil {
		t.Error("expected error for non-string value")
	}
}

func TestValidateNumberType(t *testing.T) {
	v := NewSchemaValidator(false)
	schema := InputSchema{
		Type: "object",
		Properties: map[string]Property{
			"value": {Type: "number"},
		},
	}

	// Valid numbers
	validInputs := []map[string]interface{}{
		{"value": 123},
		{"value": 123.45},
		{"value": float64(100)},
	}

	for _, input := range validInputs {
		err := v.Validate(input, schema)
		if err != nil {
			t.Errorf("unexpected error for valid number: %v", err)
		}
	}

	// Invalid type
	err := v.Validate(map[string]interface{}{"value": "not a number"}, schema)
	if err == nil {
		t.Error("expected error for non-number value")
	}
}

func TestValidateIntegerType(t *testing.T) {
	v := NewSchemaValidator(false)
	schema := InputSchema{
		Type: "object",
		Properties: map[string]Property{
			"count": {Type: "integer"},
		},
	}

	// Valid integers
	err := v.Validate(map[string]interface{}{"count": 42}, schema)
	if err != nil {
		t.Errorf("unexpected error for valid integer: %v", err)
	}

	// Invalid: float
	err = v.Validate(map[string]interface{}{"count": 42.5}, schema)
	if err == nil {
		t.Error("expected error for float value")
	}

	// Invalid: string
	err = v.Validate(map[string]interface{}{"count": "42"}, schema)
	if err == nil {
		t.Error("expected error for string value")
	}
}

func TestValidateBooleanType(t *testing.T) {
	v := NewSchemaValidator(false)
	schema := InputSchema{
		Type: "object",
		Properties: map[string]Property{
			"enabled": {Type: "boolean"},
		},
	}

	// Valid booleans
	err := v.Validate(map[string]interface{}{"enabled": true}, schema)
	if err != nil {
		t.Errorf("unexpected error for true: %v", err)
	}

	err = v.Validate(map[string]interface{}{"enabled": false}, schema)
	if err != nil {
		t.Errorf("unexpected error for false: %v", err)
	}

	// Invalid type
	err = v.Validate(map[string]interface{}{"enabled": "yes"}, schema)
	if err == nil {
		t.Error("expected error for non-boolean value")
	}
}

func TestValidateArrayType(t *testing.T) {
	v := NewSchemaValidator(false)
	schema := InputSchema{
		Type: "object",
		Properties: map[string]Property{
			"items": {Type: "array"},
		},
	}

	// Valid array
	err := v.Validate(map[string]interface{}{"items": []interface{}{1, 2, 3}}, schema)
	if err != nil {
		t.Errorf("unexpected error for valid array: %v", err)
	}

	// Invalid type
	err = v.Validate(map[string]interface{}{"items": "not an array"}, schema)
	if err == nil {
		t.Error("expected error for non-array value")
	}
}

func TestValidateObjectType(t *testing.T) {
	v := NewSchemaValidator(false)
	schema := InputSchema{
		Type: "object",
		Properties: map[string]Property{
			"config": {Type: "object"},
		},
	}

	// Valid object
	err := v.Validate(map[string]interface{}{"config": map[string]interface{}{"key": "value"}}, schema)
	if err != nil {
		t.Errorf("unexpected error for valid object: %v", err)
	}

	// Invalid type
	err = v.Validate(map[string]interface{}{"config": "not an object"}, schema)
	if err == nil {
		t.Error("expected error for non-object value")
	}
}

func TestStrictMode(t *testing.T) {
	strictValidator := NewSchemaValidator(true)
	looseValidator := NewSchemaValidator(false)

	schema := InputSchema{
		Type:       "object",
		Properties: map[string]Property{},
	}

	input := map[string]interface{}{"unknown": "field"}

	// Strict mode: reject unknown fields
	err := strictValidator.Validate(input, schema)
	if err == nil {
		t.Error("expected error for unknown field in strict mode")
	}

	// Loose mode: allow unknown fields
	err = looseValidator.Validate(input, schema)
	if err != nil {
		t.Errorf("unexpected error in loose mode: %v", err)
	}
}

func TestValidationError(t *testing.T) {
	err := &ValidationError{
		Field:   "test",
		Message: "invalid value",
	}

	expected := "validation error: test - invalid value"
	if err.Error() != expected {
		t.Errorf("expected %q, got %q", expected, err.Error())
	}
}

func TestSchemaBuilder(t *testing.T) {
	builder := NewSchemaBuilder()
	schema := builder.
		AddStringProperty("name", "The name", true).
		AddIntegerProperty("age", "The age", false).
		AddBooleanProperty("active", "Is active", false).
		Build()

	if schema.Type != "object" {
		t.Errorf("expected type 'object', got %q", schema.Type)
	}
	if len(schema.Properties) != 3 {
		t.Errorf("expected 3 properties, got %d", len(schema.Properties))
	}
	if len(schema.Required) != 1 {
		t.Errorf("expected 1 required field, got %d", len(schema.Required))
	}
}

func TestSchemaBuilderBuildTool(t *testing.T) {
	builder := NewSchemaBuilder()
	tool := builder.
		AddStringProperty("input", "Input text", true).
		BuildTool("test-tool", "A test tool")

	if tool.Name != "test-tool" {
		t.Errorf("expected name 'test-tool', got %q", tool.Name)
	}
	if tool.Description != "A test tool" {
		t.Errorf("expected description 'A test tool', got %q", tool.Description)
	}
}

func TestValidateToolInput(t *testing.T) {
	tool := Tool{
		Name:        "test",
		Description: "Test tool",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"name": {Type: "string"},
			},
			Required: []string{"name"},
		},
	}

	// Valid input
	err := ValidateToolInput(tool, map[string]interface{}{"name": "test"})
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	// Invalid input
	err = ValidateToolInput(tool, map[string]interface{}{})
	if err == nil {
		t.Error("expected error for missing required field")
	}
}
