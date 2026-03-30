package swarm

import (
	"testing"
)

func TestExecuteCodeNode_Arithmetic(t *testing.T) {
	tests := []struct {
		name     string
		code     string
		expected any
		hasError bool
	}{
		{"addition", "1 + 2", 3, false},
		{"subtraction", "10 - 3", 7, false},
		{"multiplication", "4 * 5", 20, false},
		{"division", "10 / 3", 3.3333333333333335, false},
		{"integer division", "9 / 3", 3, false},
		{"modulo", "10 % 3", 1, false},
		{"power", "2 ** 8", 256, false},
		{"precedence", "2 + 3 * 4", 14, false},
		{"parens", "(2 + 3) * 4", 20, false},
		{"nested parens", "((1 + 2) * (3 + 4))", 21, false},
		{"division by zero", "10 / 0", nil, true},
		{"modulo by zero", "10 % 0", nil, true},
		{"unary minus", "-5 + 3", -2, false},
		{"negative power", "pow(2, -1)", 0.5, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ExecuteCodeNode(map[string]any{"code": tt.code})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tt.hasError {
				if result.Error == "" {
					t.Errorf("expected error, got %v", result.Output)
				}
				return
			}
			if result.Error != "" {
				t.Fatalf("unexpected eval error: %s", result.Error)
			}
			if result.Output != tt.expected {
				t.Errorf("expected %v (%T), got %v (%T)", tt.expected, tt.expected, result.Output, result.Output)
			}
		})
	}
}

func TestExecuteCodeNode_Comparison(t *testing.T) {
	tests := []struct {
		name     string
		code     string
		expected bool
	}{
		{"equal numbers", "5 == 5", true},
		{"not equal", "5 != 3", true},
		{"greater than", "5 > 3", true},
		{"less than", "3 < 5", true},
		{"gte", "5 >= 5", true},
		{"lte", "3 <= 5", true},
		{"string equal", "'hello' == 'hello'", true},
		{"string not equal", "'hello' != 'world'", true},
		{"string gt", "'b' > 'a'", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ExecuteCodeNode(map[string]any{"code": tt.code})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Error != "" {
				t.Fatalf("unexpected eval error: %s", result.Error)
			}
			got, ok := result.Output.(bool)
			if !ok {
				t.Fatalf("expected bool, got %T", result.Output)
			}
			if got != tt.expected {
				t.Errorf("expected %v, got %v", tt.expected, got)
			}
		})
	}
}

func TestExecuteCodeNode_Logical(t *testing.T) {
	tests := []struct {
		name     string
		code     string
		expected any
	}{
		{"and true", "true && true", true},
		{"and false", "true && false", false},
		{"or true", "false || true", true},
		{"or false", "false || false", false},
		{"not true", "!true", false},
		{"not false", "!false", true},
		{"complex and", "1 > 0 && 2 > 1", true},
		{"complex or", "1 > 0 || 2 < 1", true},
		{"short circuit and", "false && true", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ExecuteCodeNode(map[string]any{"code": tt.code})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Error != "" {
				t.Fatalf("unexpected eval error: %s", result.Error)
			}
			if result.Output != tt.expected {
				t.Errorf("expected %v, got %v", tt.expected, result.Output)
			}
		})
	}
}

func TestExecuteCodeNode_Ternary(t *testing.T) {
	tests := []struct {
		name     string
		code     string
		expected any
	}{
		{"true branch", "true ? 'yes' : 'no'", "yes"},
		{"false branch", "false ? 'yes' : 'no'", "no"},
		{"with expression", "5 > 3 ? 'bigger' : 'smaller'", "bigger"},
		{"nested ternary", "1 > 2 ? 'a' : 2 > 3 ? 'b' : 'c'", "c"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ExecuteCodeNode(map[string]any{"code": tt.code})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Error != "" {
				t.Fatalf("unexpected eval error: %s", result.Error)
			}
			if result.Output != tt.expected {
				t.Errorf("expected %v, got %v", tt.expected, result.Output)
			}
		})
	}
}

func TestExecuteCodeNode_Functions(t *testing.T) {
	tests := []struct {
		name     string
		code     string
		expected any
	}{
		{"abs positive", "abs(5)", 5.0},
		{"abs negative", "abs(-5)", 5.0},
		{"ceil", "ceil(3.14)", 4},
		{"floor", "floor(3.14)", 3},
		{"round", "round(3.5)", 4},
		{"min", "min(3, 5)", 3.0},
		{"max", "max(3, 5)", 5.0},
		{"pow", "pow(2, 8)", 256},
		{"sqrt", "sqrt(16)", 4},
		{"sqrt non-perfect", "sqrt(2)", nil}, // float, not int
		{"len string", "len('hello')", 5},
		{"substr", "substr('hello', 0, 3)", "hel"},
		{"indexOf", "indexOf('hello', 'll')", 2},
		{"indexOf not found", "indexOf('hello', 'x')", -1},
		{"int conversion", "int('42')", 42},
		{"float conversion", "float('3.14')", 3.14},
		{"str conversion", "str(42)", "42"},
		{"json parse", "json_parse('{\"a\":1}')", nil}, // map, checked separately
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ExecuteCodeNode(map[string]any{"code": tt.code})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Error != "" {
				t.Fatalf("unexpected eval error: %s", result.Error)
			}
			if tt.expected != nil && result.Output != tt.expected {
				t.Errorf("expected %v, got %v", tt.expected, result.Output)
			}
		})
	}
}

func TestExecuteCodeNode_JsonParse(t *testing.T) {
	result, err := ExecuteCodeNode(map[string]any{
		"code": "json_parse('{\"key\": \"value\"}')",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Error != "" {
		t.Fatalf("unexpected eval error: %s", result.Error)
	}
	m, ok := result.Output.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result.Output)
	}
	if m["key"] != "value" {
		t.Errorf("expected key=value, got %v", m)
	}
}

func TestExecuteCodeNode_JsonStringify(t *testing.T) {
	// json_stringify on a parsed JSON object
	result, err := ExecuteCodeNode(map[string]any{
		"code": "json_stringify(json_parse('{\"a\": 1}'))",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Error != "" {
		t.Fatalf("unexpected eval error: %s", result.Error)
	}
	got := toString(result.Output)
	if got != `{"a":1}` {
		t.Errorf("expected compact JSON, got %q", got)
	}
}

func TestExecuteCodeNode_Variables(t *testing.T) {
	result, err := ExecuteCodeNode(map[string]any{
		"code": "x + y",
		"variables": map[string]any{
			"x": 10,
			"y": 20,
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Error != "" {
		t.Fatalf("unexpected eval error: %s", result.Error)
	}
	if result.Output != 30 {
		t.Errorf("expected 30, got %v", result.Output)
	}
}

func TestExecuteCodeNode_TemplateVariables(t *testing.T) {
	result, err := ExecuteCodeNode(map[string]any{
		"code":      "{{name}}",
		"variables": map[string]any{"name": "hello"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Error != "" {
		t.Fatalf("unexpected eval error: %s", result.Error)
	}
	if result.Output != "hello" {
		t.Errorf("expected 'hello', got %v", result.Output)
	}
}

func TestExecuteCodeNode_Empty(t *testing.T) {
	result, err := ExecuteCodeNode(map[string]any{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Output != nil {
		t.Errorf("expected nil, got %v", result.Output)
	}
	if result.Type != "null" {
		t.Errorf("expected type null, got %s", result.Type)
	}
}

func TestExecuteCodeNode_Literals(t *testing.T) {
	tests := []struct {
		name     string
		code     string
		expected any
		typ      string
	}{
		{"string literal", "'hello'", "hello", "string"},
		{"double quoted", `"hello"`, "hello", "string"},
		{"number int", "42", 42, "number"},
		{"number float", "3.14", 3.14, "number"},
		{"boolean true", "true", true, "boolean"},
		{"boolean false", "false", false, "boolean"},
		{"null", "null", nil, "null"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ExecuteCodeNode(map[string]any{"code": tt.code})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Output != tt.expected {
				t.Errorf("expected %v, got %v", tt.expected, result.Output)
			}
			if result.Type != tt.typ {
				t.Errorf("expected type %s, got %s", tt.typ, result.Type)
			}
		})
	}
}

func TestExecuteCodeNode_ComplexExpression(t *testing.T) {
	// Fibonacci-like: (1 + 2) * 3 - 1 = 8
	result, err := ExecuteCodeNode(map[string]any{
		"code": "(1 + 2) * 3 - 1",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Output != 8 {
		t.Errorf("expected 8, got %v", result.Output)
	}
}

func TestExecuteCodeNode_SizeLimit(t *testing.T) {
	largeCode := string(make([]byte, 2<<20)) // 2MB
	_, err := ExecuteCodeNode(map[string]any{"code": largeCode})
	if err == nil {
		t.Fatal("expected error for oversized code")
	}
}

func TestExecuteCodeNode_ErrorResult(t *testing.T) {
	result, err := ExecuteCodeNode(map[string]any{
		"code": "10 / 0",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Error == "" {
		t.Error("expected error result for division by zero")
	}
	if result.Type != "error" {
		t.Errorf("expected type error, got %s", result.Type)
	}
}

func TestExecuteCodeNode_SqrtNegative(t *testing.T) {
	result, err := ExecuteCodeNode(map[string]any{
		"code": "sqrt(-1)",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Error == "" {
		t.Error("expected error for sqrt(-1)")
	}
}

func TestExecuteCodeNode_NestedFunctions(t *testing.T) {
	// abs(floor(-3.7)) = abs(-4) = 4
	result, err := ExecuteCodeNode(map[string]any{
		"code": "abs(floor(-3.7))",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Error != "" {
		t.Fatalf("unexpected eval error: %s", result.Error)
	}
	if result.Output != 4.0 {
		t.Errorf("expected 4, got %v", result.Output)
	}
}

func TestExecuteCodeNode_ArithmeticWithVars(t *testing.T) {
	result, err := ExecuteCodeNode(map[string]any{
		"code": "price * quantity",
		"variables": map[string]any{
			"price":     10,
			"quantity":  5,
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Output != 50 {
		t.Errorf("expected 50, got %v", result.Output)
	}
}
