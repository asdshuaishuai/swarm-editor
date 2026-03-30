// Package mcp provides MCP (Model Context Protocol) integration
package mcp

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// enumPattern matches "enum:value1,value2,..." in property descriptions
var enumPattern = regexp.MustCompile(`enum:([^\s]+)`)

// SchemaValidator validates tool inputs against JSON Schema
type SchemaValidator struct {
	strict bool
}

// NewSchemaValidator creates a new schema validator
func NewSchemaValidator(strict bool) *SchemaValidator {
	return &SchemaValidator{strict: strict}
}

// Validate validates input against a schema
func (v *SchemaValidator) Validate(input map[string]any, schema InputSchema) error {
	// Check required fields
	for _, required := range schema.Required {
		if _, ok := input[required]; !ok {
			return &ValidationError{
				Field:   required,
				Message: "required field missing",
			}
		}
	}

	// Validate each property
	for name, value := range input {
		prop, ok := schema.Properties[name]
		if !ok {
			if v.strict {
				return &ValidationError{
					Field:   name,
					Message: "unknown field",
				}
			}
			continue
		}

		if err := v.validateProperty(name, value, prop); err != nil {
			return err
		}
	}

	return nil
}

// validateProperty validates a single property
func (v *SchemaValidator) validateProperty(name string, value any, prop Property) error {
	if value == nil {
		return nil // Allow null values
	}

	switch prop.Type {
	case "string":
		return v.validateString(name, value, prop)
	case "number":
		return v.validateNumber(name, value)
	case "integer":
		return v.validateInteger(name, value)
	case "boolean":
		return v.validateBoolean(name, value)
	case "array":
		return v.validateArray(name, value)
	case "object":
		return v.validateObject(name, value)
	default:
		return nil // Unknown type, skip validation
	}
}

// validateString validates a string value
func (v *SchemaValidator) validateString(name string, value any, prop Property) error {
	str, ok := value.(string)
	if !ok {
		return &ValidationError{
			Field:   name,
			Message: fmt.Sprintf("expected string, got %T", value),
		}
	}

	// Check enum values if specified (stored in Description for now)
	if strings.Contains(prop.Description, "enum:") {
		// Parse enum values from description
		// Format: "enum:value1,value2,value3"
		enumStr := strings.TrimPrefix(
			enumPattern.FindString(prop.Description),
			"enum:",
		)
		if enumStr != "" {
			enumValues := strings.Split(enumStr, ",")
			valid := false
			for _, ev := range enumValues {
				if str == ev {
					valid = true
					break
				}
			}
			if !valid {
				return &ValidationError{
					Field:   name,
					Message: fmt.Sprintf("value must be one of: %v", enumValues),
				}
			}
		}
	}

	return nil
}

// validateNumber validates a number value
func (v *SchemaValidator) validateNumber(name string, value any) error {
	switch value.(type) {
	case float64, float32, int, int64, int32:
		return nil
	default:
		return &ValidationError{
			Field:   name,
			Message: fmt.Sprintf("expected number, got %T", value),
		}
	}
}

// validateInteger validates an integer value
func (v *SchemaValidator) validateInteger(name string, value any) error {
	switch val := value.(type) {
	case float64:
		if val != float64(int64(val)) {
			return &ValidationError{
				Field:   name,
				Message: "expected integer, got float",
			}
		}
		return nil
	case int, int64, int32:
		return nil
	case json.Number:
		_, err := val.Int64()
		if err != nil {
			return &ValidationError{
				Field:   name,
				Message: "expected integer",
			}
		}
		return nil
	default:
		return &ValidationError{
			Field:   name,
			Message: fmt.Sprintf("expected integer, got %T", value),
		}
	}
}

// validateBoolean validates a boolean value
func (v *SchemaValidator) validateBoolean(name string, value any) error {
	_, ok := value.(bool)
	if !ok {
		return &ValidationError{
			Field:   name,
			Message: fmt.Sprintf("expected boolean, got %T", value),
		}
	}
	return nil
}

// validateArray validates an array value
func (v *SchemaValidator) validateArray(name string, value any) error {
	_, ok := value.([]any)
	if !ok {
		// Try as JSON array
		if arr, ok := value.([]json.RawMessage); ok {
			_ = arr // Valid JSON array
			return nil
		}
		return &ValidationError{
			Field:   name,
			Message: fmt.Sprintf("expected array, got %T", value),
		}
	}
	return nil
}

// validateObject validates an object value
func (v *SchemaValidator) validateObject(name string, value any) error {
	_, ok := value.(map[string]any)
	if !ok {
		return &ValidationError{
			Field:   name,
			Message: fmt.Sprintf("expected object, got %T", value),
		}
	}
	return nil
}

// ValidationError represents a validation error
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("validation error: %s - %s", e.Field, e.Message)
}

// ValidateToolInput validates tool input against the tool's schema
func ValidateToolInput(tool Tool, input map[string]any) error {
	validator := NewSchemaValidator(false)
	return validator.Validate(input, tool.InputSchema)
}

// SchemaBuilder helps build input schemas
type SchemaBuilder struct {
	schema InputSchema
}

// NewSchemaBuilder creates a new schema builder
func NewSchemaBuilder() *SchemaBuilder {
	return &SchemaBuilder{
		schema: InputSchema{
			Type:       "object",
			Properties: make(map[string]Property),
			Required:   []string{},
		},
	}
}

// AddProperty adds a property to the schema
func (b *SchemaBuilder) AddProperty(name, propType, description string, required bool) *SchemaBuilder {
	b.schema.Properties[name] = Property{
		Type:        propType,
		Description: description,
	}
	if required {
		b.schema.Required = append(b.schema.Required, name)
	}
	return b
}

// AddStringProperty adds a string property
func (b *SchemaBuilder) AddStringProperty(name, description string, required bool) *SchemaBuilder {
	return b.AddProperty(name, "string", description, required)
}

// AddNumberProperty adds a number property
func (b *SchemaBuilder) AddNumberProperty(name, description string, required bool) *SchemaBuilder {
	return b.AddProperty(name, "number", description, required)
}

// AddIntegerProperty adds an integer property
func (b *SchemaBuilder) AddIntegerProperty(name, description string, required bool) *SchemaBuilder {
	return b.AddProperty(name, "integer", description, required)
}

// AddBooleanProperty adds a boolean property
func (b *SchemaBuilder) AddBooleanProperty(name, description string, required bool) *SchemaBuilder {
	return b.AddProperty(name, "boolean", description, required)
}

// AddArrayProperty adds an array property
func (b *SchemaBuilder) AddArrayProperty(name, description string, required bool) *SchemaBuilder {
	return b.AddProperty(name, "array", description, required)
}

// AddObjectProperty adds an object property
func (b *SchemaBuilder) AddObjectProperty(name, description string, required bool) *SchemaBuilder {
	return b.AddProperty(name, "object", description, required)
}

// Build returns the built schema
func (b *SchemaBuilder) Build() InputSchema {
	return b.schema
}

// BuildTool creates a tool with the built schema
func (b *SchemaBuilder) BuildTool(name, description string) Tool {
	return Tool{
		Name:        name,
		Description: description,
		InputSchema: b.Build(),
	}
}
