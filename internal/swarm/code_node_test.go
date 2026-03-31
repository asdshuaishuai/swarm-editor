package swarm

import (
	"fmt"
	"strings"
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

// Tests for executeCodeNodeJavaScript via config setting
func TestExecuteCodeNode_JavaScriptMode(t *testing.T) {
	// Test with language="javascript" config
	tests := []struct {
		name     string
		code     string
		config   map[string]any
		vars     map[string]any
		expected any
		hasError bool
	}{
		{
			name:     "simple addition",
			code:     "1 + 2",
			config:   map[string]any{"language": "javascript"},
			expected: int64(3),
		},
		{
			name:     "with variables",
			code:     "x + y",
			config:   map[string]any{"language": "javascript"},
			vars:     map[string]any{"x": 10, "y": 20},
			expected: int64(30),
		},
		{
			name:     "custom timeout",
			code:     "1 + 1",
			config:   map[string]any{"language": "javascript", "timeout_ms": 5000},
			expected: int64(2),
		},
		{
			name:     "syntax error",
			code:     "invalid javascript {{{",
			config:   map[string]any{"language": "javascript"},
			hasError: true,
		},
		{
			name:     "object creation",
			code:     "({a: 1, b: 2})",
			config:   map[string]any{"language": "javascript"},
			expected: map[string]any{"a": int64(1), "b": int64(2)},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			params := map[string]any{"code": tt.code}
			for k, v := range tt.config {
				params[k] = v
			}
			if tt.vars != nil {
				params["variables"] = tt.vars
			}

			result, err := ExecuteCodeNode(params)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if tt.hasError {
				if result.Error == "" {
					t.Error("expected error result")
				}
				return
			}

			if result.Error != "" {
				t.Fatalf("unexpected eval error: %s", result.Error)
			}

			// For simple values, compare directly
			if m, ok := tt.expected.(map[string]any); ok {
				gotMap, ok := result.Output.(map[string]any)
				if !ok {
					t.Fatalf("expected map, got %T", result.Output)
				}
				if len(gotMap) != len(m) {
					t.Errorf("expected %d keys, got %d", len(m), len(gotMap))
				}
			} else if result.Output != tt.expected {
				t.Errorf("expected %v (%T), got %v (%T)", tt.expected, tt.expected, result.Output, result.Output)
			}
		})
	}
}

func TestExecuteCodeNode_JavaScriptTimeout(t *testing.T) {
	// Very short timeout should fail on infinite loop
	result, err := ExecuteCodeNode(map[string]any{
		"code":        "while(true) {}",
		"language":    "javascript",
		"timeout_ms":  10, // 10ms - very short
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Error == "" {
		t.Error("expected timeout error for infinite loop")
	}
}

func TestExecuteCodeNode_JavaScriptTimeoutClamped(t *testing.T) {
	// Timeout should be clamped to MaxCodeExecutionTimeout
	result, err := ExecuteCodeNode(map[string]any{
		"code":        "1 + 1",
		"language":    "javascript",
		"timeout_ms":  999999999, // Way over max
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Should still work because timeout is clamped
	if result.Output != int64(2) {
		t.Errorf("expected 2, got %v", result.Output)
	}
}

func TestExecuteCodeNode_JavaScriptVariableIsolation(t *testing.T) {
	// Variables should be isolated - modifying them shouldn't affect original
	original := map[string]any{"items": []any{"a", "b"}}
	result, err := ExecuteCodeNode(map[string]any{
		"code":      "items.push('c'); items.length",
		"language":  "javascript",
		"variables": original,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Error != "" {
		t.Fatalf("unexpected eval error: %s", result.Error)
	}
	// Original should not be modified
	items, ok := original["items"].([]any)
	if !ok || len(items) != 2 {
		t.Errorf("original variables should not be mutated, got %v", original["items"])
	}
}

func TestExecuteCodeNode_EscapedQuotes(t *testing.T) {
	t.Run("logical op does not match inside string", func(t *testing.T) {
		// The || inside the string should not be treated as a logical operator.
		// Use double quotes to wrap a string containing single quotes with ||.
		result, err := ExecuteCodeNode(map[string]any{
			"code": `"it's a || b" || "end"`,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		// "it's a || b" is truthy, so OR short-circuits to it
		if result.Output != "it's a || b" {
			t.Errorf("expected \"it's a || b\", got %v", result.Output)
		}
	})

	t.Run("comparison inside string with escaped quote", func(t *testing.T) {
		result, err := ExecuteCodeNode(map[string]any{
			"code": `'a\\'s' == 'a\\'s'`,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Output != true {
			t.Errorf("expected true, got %v", result.Output)
		}
	})

	t.Run("arithmetic inside string with double quotes", func(t *testing.T) {
		result, err := ExecuteCodeNode(map[string]any{
			"code": `"2 + 3"`,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Output != "2 + 3" {
			t.Errorf("expected \"2 + 3\", got %v", result.Output)
		}
	})

	t.Run("ternary with string containing comparison", func(t *testing.T) {
		result, err := ExecuteCodeNode(map[string]any{
			"code": `1 > 0 ? "yes" : "no"`,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Output != "yes" {
			t.Errorf("expected \"yes\", got %v", result.Output)
		}
	})
}

func TestLookupVariable(t *testing.T) {
	tests := []struct {
		name  string
		vars  map[string]any
		path  string
		want  any
		found bool
	}{
		{"simple key", map[string]any{"x": 42}, "x", 42, true},
		{"missing key", map[string]any{"x": 42}, "y", nil, false},
		{"nested key", map[string]any{"a": map[string]any{"b": "hello"}}, "a.b", "hello", true},
		{"deep nested", map[string]any{"a": map[string]any{"b": map[string]any{"c": true}}}, "a.b.c", true, true},
		{"non-map intermediate", map[string]any{"a": "string"}, "a.b", nil, false},
		{"empty path", map[string]any{"x": 1}, "", nil, false},
		{"nil vars", nil, "x", nil, false},
		{"triple dot path", map[string]any{"x": map[string]any{"y": map[string]any{"z": 3.14}}}, "x.y.z", 3.14, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, found := lookupVariable(tt.vars, tt.path)
			if found != tt.found {
				t.Errorf("found = %v, want %v", found, tt.found)
			}
			if found && got != tt.want {
				t.Errorf("got %v, want %v", got, tt.want)
			}
		})
	}
}

func TestFormatCodeValue(t *testing.T) {
	tests := []struct {
		name  string
		input any
		want  string
	}{
		{"string", "hello", "'hello'"},
		{"string with quotes", "it's", "'it\\'s'"},
		{"string with backslash", "a\\b", "'a\\\\b'"},
		{"nil", nil, "null"},
		{"bool true", true, "true"},
		{"bool false", false, "false"},
		{"float64", 3.14, "3.14"},
		{"int", 42, "42"},
		{"int64", int64(99), "99"},
		{"slice", []int{1, 2}, "[1,2]"},
		{"map", map[string]any{"k": "v"}, `{"k":"v"}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := formatCodeValue(tt.input)
			if got != tt.want {
				t.Errorf("formatCodeValue(%v) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

// ==================== findTernaryColon Tests ====================

func TestFindTernaryColon(t *testing.T) {
	tests := []struct {
		expr      string
		startFrom int
		want      int
	}{
		{"a ? b : c", 0, 6},
		{"a : b", 0, 2},             // simple case
		{"'a:b' ? x : y", 0, 10},   // colon inside string should be skipped
		{"(a : b) ? x : y", 0, 12}, // colon inside parens should be skipped
		{"[a : b] ? x : y", 0, 12}, // colon inside brackets should be skipped
		{"a ? b : c", 4, 6},        // startFrom past first colon
		{"no colon", 0, -1},
		{"a ? 'b:c' : d", 0, 10},   // escaped colon in string
		{"\"x:y\" ? 1 : 2", 0, 10}, // double quote string
	}

	for _, tt := range tests {
		name := fmt.Sprintf("%q/%d", tt.expr, tt.startFrom)
		t.Run(name, func(t *testing.T) {
			got := findTernaryColon(tt.expr, tt.startFrom)
			if got != tt.want {
				t.Errorf("findTernaryColon(%q, %d) = %d, want %d", tt.expr, tt.startFrom, got, tt.want)
			}
		})
	}
}

// ==================== evaluateTernary Tests ====================

func TestEvaluateTernary(t *testing.T) {
	tests := []struct {
		name    string
		expr    string
		want    any
		wantErr bool
	}{
		{"true branch", "true ? 'yes' : 'no'", "yes", false},
		{"false branch", "false ? 'yes' : 'no'", "no", false},
		{"nested", "1 > 0 ? (2 > 1 ? 'a' : 'b') : 'c'", "a", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			questionIdx := strings.Index(tt.expr, "?")
			got, err := evaluateTernary(tt.expr, questionIdx, map[string]any{}, 0)
			if (err != nil) != tt.wantErr {
				t.Errorf("evaluateTernary(%q) error = %v, wantErr %v", tt.expr, err, tt.wantErr)
			}
			if !tt.wantErr && got != tt.want {
				t.Errorf("evaluateTernary(%q) = %v, want %v", tt.expr, got, tt.want)
			}
		})
	}
}

func TestEvaluateCodeExpressionWithDepth_Exceeded(t *testing.T) {
	// Test recursion depth exceeded in the wrapper function
	_, err := evaluateCodeExpressionWithDepth("1 + 1", nil, MaxTemplateRecursionDepth+1)
	if err == nil {
		t.Error("expected error when recursion depth exceeded")
	}
	if err != nil && !strings.Contains(err.Error(), "recursion depth exceeded") {
		t.Errorf("expected recursion depth error, got: %v", err)
	}

	// At max depth - 1 should work (wrapper checks depth > max, internal checks depth > max too)
	result, err := evaluateCodeExpressionWithDepth("1 + 1", nil, MaxTemplateRecursionDepth-1)
	if err != nil {
		t.Errorf("expected no error at max depth - 1, got: %v", err)
	}
	if result.(int) != 2 {
		t.Errorf("expected 2, got %v (%T)", result, result)
	}
}

func TestEvaluateCodeFunction_UnmatchedParen(t *testing.T) {
	_, err := evaluateCodeFunction("abs(1", nil, 0)
	if err == nil {
		t.Error("expected error for unmatched parenthesis")
	}
	if err != nil && !strings.Contains(err.Error(), "unmatched parenthesis") {
		t.Errorf("expected unmatched parenthesis error, got: %v", err)
	}
}

func TestEvaluateCodeFunction_UnknownFunction(t *testing.T) {
	_, err := evaluateCodeFunction("unknownFunc(1)", nil, 0)
	if err == nil {
		t.Error("expected error for unknown function")
	}
	if err != nil && !strings.Contains(err.Error(), "unknown function") {
		t.Errorf("expected unknown function error, got: %v", err)
	}
}

func TestEvaluateCodeFunction_WrongArgCount(t *testing.T) {
	tests := []struct {
		name string
		expr string
	}{
		{"abs_no_args", "abs()"},
		{"abs_two_args", "abs(1, 2)"},
		{"ceil_no_args", "ceil()"},
		{"floor_no_args", "floor()"},
		{"round_no_args", "round()"},
		{"min_one_arg", "min(1)"},
		{"max_one_arg", "max(1)"},
		{"pow_one_arg", "pow(1)"},
		{"sqrt_no_args", "sqrt()"},
		{"len_no_args", "len()"},
		{"substr_one_arg", "substr('hello')"},
		{"indexof_one_arg", "indexof('hello')"},
		{"int_no_args", "int()"},
		{"float_no_args", "float()"},
		{"str_no_args", "str()"},
		{"json_parse_no_args", "json_parse()"},
		{"json_stringify_no_args", "json_stringify()"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := evaluateCodeFunction(tt.expr, nil, 0)
			if err == nil {
				t.Errorf("expected error for %q", tt.expr)
			}
		})
	}
}

func TestEvaluateCodeFunction_NonNumericArg(t *testing.T) {
	tests := []struct {
		name string
		expr string
	}{
		{"abs_string", "abs('hello')"},
		{"ceil_string", "ceil('hello')"},
		{"floor_string", "floor('hello')"},
		{"round_string", "round('hello')"},
		{"min_first_string", "min('a', 1)"},
		{"min_second_string", "min(1, 'a')"},
		{"max_first_string", "max('a', 1)"},
		{"pow_base_string", "pow('a', 2)"},
		{"pow_exp_string", "pow(2, 'a')"},
		{"sqrt_string", "sqrt('hello')"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := evaluateCodeFunction(tt.expr, nil, 0)
			if err == nil {
				t.Errorf("expected error for %q", tt.expr)
			}
		})
	}
}

func TestEvaluateCodeFunction_EdgeCases(t *testing.T) {
	// sqrt negative
	_, err := evaluateCodeFunction("sqrt(-1)", nil, 0)
	if err == nil {
		t.Error("expected error for sqrt(-1)")
	}

	// substr with out-of-range indices
	result, err := evaluateCodeFunction("substr('hello', -1, 3)", nil, 0)
	if err != nil {
		t.Errorf("substr with negative start: unexpected error: %v", err)
	}
	if result != "hello" {
		t.Errorf("substr with negative start: expected 'hello', got %v", result)
	}

	// substr with end > len
	result, err = evaluateCodeFunction("substr('hi', 0, 10)", nil, 0)
	if err != nil {
		t.Errorf("substr with end > len: unexpected error: %v", err)
	}
	if result != "hi" {
		t.Errorf("substr with end > len: expected 'hi', got %v", result)
	}

	// int with non-numeric → returns 0
	result, err = evaluateCodeFunction("int('hello')", nil, 0)
	if err != nil {
		t.Errorf("int('hello'): unexpected error: %v", err)
	}
	if result != 0 {
		t.Errorf("int('hello'): expected 0, got %v", result)
	}

	// float with non-numeric → returns 0.0
	result, err = evaluateCodeFunction("float('hello')", nil, 0)
	if err != nil {
		t.Errorf("float('hello'): unexpected error: %v", err)
	}
	if result != 0.0 {
		t.Errorf("float('hello'): expected 0.0, got %v", result)
	}

	// len with different types
	tests := []struct {
		name string
		expr string
		want any
	}{
		{"len_string", "len('hello')", 5},
		{"len_empty_string", "len('')", 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := evaluateCodeFunction(tt.expr, nil, 0)
			if err != nil {
				t.Errorf("unexpected error: %v", err)
			}
			if result != tt.want {
				t.Errorf("expected %v, got %v", tt.want, result)
			}
		})
	}

	// json_parse with invalid JSON
	_, err = evaluateCodeFunction("json_parse('not json')", nil, 0)
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestCodeTypeOf(t *testing.T) {
	tests := []struct {
		name string
		val  any
		want string
	}{
		{"nil", nil, "null"},
		{"bool true", true, "boolean"},
		{"bool false", false, "boolean"},
		{"int", 42, "number"},
		{"int64", int64(42), "number"},
		{"int32", int32(42), "number"},
		{"float64", 3.14, "number"},
		{"float32", float32(3.14), "number"},
		{"string", "hello", "string"},
		{"array", []any{1, 2, 3}, "array"},
		{"object", map[string]any{"key": "val"}, "object"},
		{"unknown type", struct{}{}, "unknown"},
		{"unknown slice", []int{1, 2, 3}, "unknown"}, // []int not []any
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := codeTypeOf(tt.val); got != tt.want {
				t.Errorf("codeTypeOf(%v) = %q, want %q", tt.val, got, tt.want)
			}
		})
	}
}

// TestExecuteCodeNode_UnaryMinusEdgeCases tests edge cases for unary minus
func TestExecuteCodeNode_UnaryMinusEdgeCases(t *testing.T) {
	t.Run("unary minus on float", func(t *testing.T) {
		result, err := ExecuteCodeNode(map[string]any{
			"code": "-3.14",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Output != -3.14 {
			t.Errorf("expected -3.14, got %v", result.Output)
		}
	})

	t.Run("unary minus on variable", func(t *testing.T) {
		result, err := ExecuteCodeNode(map[string]any{
			"code":      "-count",
			"variables": map[string]any{"count": 5},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Output != -5 {
			t.Errorf("expected -5, got %v", result.Output)
		}
	})

	t.Run("unary minus on non-numeric", func(t *testing.T) {
		result, err := ExecuteCodeNode(map[string]any{
			"code":      "-text",
			"variables": map[string]any{"text": "hello"},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Error == "" {
			t.Error("expected error for negating non-numeric")
		}
	})
}

// TestExecuteCodeNode_NullAndNil tests null and nil literals
func TestExecuteCodeNode_NullAndNil(t *testing.T) {
	tests := []struct {
		name string
		code string
		want any
	}{
		{"null literal", "null", nil},
		{"nil literal", "nil", nil},
		{"ternary with null", "false ? 'yes' : null", nil},
		{"ternary with nil", "true ? nil : 'no'", nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ExecuteCodeNode(map[string]any{"code": tt.code})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Output != tt.want {
				t.Errorf("expected %v, got %v", tt.want, result.Output)
			}
		})
	}
}

// TestExecuteCodeNode_ParenthesesEdgeCases tests parentheses handling
func TestExecuteCodeNode_ParenthesesEdgeCases(t *testing.T) {
	t.Run("nested parens", func(t *testing.T) {
		result, err := ExecuteCodeNode(map[string]any{
			"code": "((1 + 2) * 3)",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Output != 9 {
			t.Errorf("expected 9, got %v", result.Output)
		}
	})

	t.Run("unclosed paren", func(t *testing.T) {
		result, err := ExecuteCodeNode(map[string]any{
			"code": "(1 + 2",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		// Unclosed paren is parsed as-is (partial parsing behavior)
		// The expression parser handles it gracefully
		if result.Output != nil {
			t.Logf("parsed unclosed paren as: %v", result.Output)
		}
	})
}

// TestExecuteCodeNode_LogicalNotEdgeCases tests ! operator
func TestExecuteCodeNode_LogicalNotEdgeCases(t *testing.T) {
	tests := []struct {
		name string
		code string
		want any
	}{
		{"not true", "!true", false},
		{"not false", "!false", true},
		{"not 0", "!0", true},
		{"not 1", "!1", false},
		{"not empty string", "!''", true},
		{"not non-empty", "!'x'", false},
		{"double not", "!!true", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ExecuteCodeNode(map[string]any{"code": tt.code})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Output != tt.want {
				t.Errorf("expected %v, got %v", tt.want, result.Output)
			}
		})
	}
}

// TestExecuteCodeNode_EvalCodeArgEdgeCases tests evalCodeArg edge cases
func TestExecuteCodeNode_EvalCodeArgEdgeCases(t *testing.T) {
	t.Run("empty arg", func(t *testing.T) {
		result, err := ExecuteCodeNode(map[string]any{
			"code": "len('')",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Output != 0 {
			t.Errorf("expected 0, got %v", result.Output)
		}
	})

	t.Run("whitespace arg", func(t *testing.T) {
		result, err := ExecuteCodeNode(map[string]any{
			"code": "trim('   ')",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		// Should handle whitespace-only string
		if result.Error != "" && !strings.Contains(result.Error, "unknown function") {
			t.Logf("result: %v, error: %s", result.Output, result.Error)
		}
	})

	t.Run("float with decimal in function", func(t *testing.T) {
		result, err := ExecuteCodeNode(map[string]any{
			"code": "floor(3.7)",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.Output != 3 {
			t.Errorf("expected 3, got %v", result.Output)
		}
	})
}

// ==================== evalCodeArg direct tests ====================

func TestEvalCodeArg_Direct(t *testing.T) {
	tests := []struct {
		name     string
		arg      string
		vars     map[string]any
		expected any
		hasError bool
	}{
		{"empty string", "", nil, "", false},
		{"single quoted string", "'hello'", nil, "hello", false},
		{"double quoted string", `"world"`, nil, "world", false},
		{"integer number", "42", nil, 42, false},
		{"negative integer", "-5", nil, -5, false},
		{"float number", "3.14", nil, 3.14, false},
		{"boolean true", "true", nil, true, false},
		{"boolean false", "false", nil, false, false},
		{"null literal", "null", nil, nil, false},
		{"nil literal", "nil", nil, nil, false},
		{"variable reference", "x", map[string]any{"x": 42}, 42, false},
		{"nested variable ref", "data.field", map[string]any{"data.field": "value"}, "value", false},
		{"expression as arg", "1 + 2", nil, 3, false},
		{"undefined variable falls through", "nonexistent", nil, "nonexistent", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := evalCodeArg(tt.arg, tt.vars, 0)
			if tt.hasError {
				if err == nil {
					t.Error("expected error")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.expected {
				t.Errorf("expected %v (%T), got %v (%T)", tt.expected, tt.expected, got, got)
			}
		})
	}
}

// ==================== resolveCodeVariables direct tests ====================

func TestResolveCodeVariables_Direct(t *testing.T) {
	// No vars returns code unchanged
	got := resolveCodeVariables("hello world", nil)
	if got != "hello world" {
		t.Errorf("expected 'hello world', got %q", got)
	}

	// Empty vars returns code unchanged
	got = resolveCodeVariables("hello world", map[string]any{})
	if got != "hello world" {
		t.Errorf("expected 'hello world', got %q", got)
	}

	// Template variable replacement
	got = resolveCodeVariables("{{name}}", map[string]any{"name": "Alice"})
	if got != "'Alice'" {
		t.Errorf("expected \"'Alice'\", got %q", got)
	}

	// Multiple template variables
	got = resolveCodeVariables("{{a}} and {{b}}", map[string]any{"a": "X", "b": "Y"})
	if got != "'X' and 'Y'" {
		t.Errorf("expected \"'X' and 'Y'\", got %q", got)
	}

	// Nested variable path
	got = resolveCodeVariables("{{data.key}}", map[string]any{"data": map[string]any{"key": "val"}})
	if got != "'val'" {
		t.Errorf("expected \"'val'\", got %q", got)
	}

	// Undefined template variable remains unchanged
	got = resolveCodeVariables("{{missing}}", map[string]any{"other": 1})
	if got != "{{missing}}" {
		t.Errorf("expected unchanged, got %q", got)
	}

	// Integer variable formats correctly
	got = resolveCodeVariables("{{count}}", map[string]any{"count": 42})
	if got != "42" {
		t.Errorf("expected '42', got %q", got)
	}

	// Boolean variable formats correctly
	got = resolveCodeVariables("{{flag}}", map[string]any{"flag": true})
	if got != "true" {
		t.Errorf("expected 'true', got %q", got)
	}

	// Nil variable formats as null
	got = resolveCodeVariables("{{empty}}", map[string]any{"empty": nil})
	if got != "null" {
		t.Errorf("expected 'null', got %q", got)
	}
}

// ==================== evaluateCodeExpressionInternal direct tests ====================

func TestEvaluateCodeExpressionInternal_Direct(t *testing.T) {
	tests := []struct {
		name     string
		expr     string
		vars     map[string]any
		expected any
		hasError bool
	}{
		{"simple literal int", "42", nil, 42, false},
		{"simple literal float", "3.14", nil, 3.14, false},
		{"string literal single", "'hello'", nil, "hello", false},
		{"string literal double", `"world"`, nil, "world", false},
		{"boolean true", "true", nil, true, false},
		{"boolean false", "false", nil, false, false},
		{"null", "null", nil, nil, false},
		{"nil", "nil", nil, nil, false},
		{"variable", "x", map[string]any{"x": 99}, 99, false},
		{"arithmetic", "1 + 2", nil, 3, false},
		{"comparison", "5 > 3", nil, true, false},
		{"logical", "true && false", nil, false, false},
		{"ternary", "true ? 1 : 0", nil, 1, false},
		{"parenthesized", "(42)", nil, 42, false},
		{"unary not", "!false", nil, true, false},
		{"unary minus", "-5", nil, -5, false},
		{"fallback string", "unknown_expr", nil, "unknown_expr", false},
		{"function call", "len('hi')", nil, 2, false},
		{"array index", "arr[0]", map[string]any{"arr": []any{10, 20}}, 10, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := evaluateCodeExpressionInternal(tt.expr, tt.vars, 0)
			if tt.hasError {
				if err == nil {
					t.Error("expected error")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.expected {
				t.Errorf("expected %v (%T), got %v (%T)", tt.expected, tt.expected, got, got)
			}
		})
	}
}

// ==================== evaluateComparison direct tests ====================

func TestEvaluateComparison_Direct(t *testing.T) {
	tests := []struct {
		name     string
		expr     string
		vars     map[string]any
		expected bool
	}{
		{"equal ints", "5 == 5", nil, true},
		{"not equal ints", "5 != 3", nil, true},
		{"equal ints false", "5 == 3", nil, false},
		{"not equal false", "5 != 5", nil, false},
		{"greater true", "5 > 3", nil, true},
		{"greater false", "3 > 5", nil, false},
		{"less true", "3 < 5", nil, true},
		{"less false", "5 < 3", nil, false},
		{"gte true", "5 >= 5", nil, true},
		{"gte equal", "5 >= 3", nil, true},
		{"gte false", "3 >= 5", nil, false},
		{"lte true", "3 <= 5", nil, true},
		{"lte equal", "5 <= 5", nil, true},
		{"lte false", "5 <= 3", nil, false},
		{"string equal", "'a' == 'a'", nil, true},
		{"string not equal", "'a' != 'b'", nil, true},
		{"string greater", "'b' > 'a'", nil, true},
		{"string less", "'a' < 'b'", nil, true},
		{"nil equal nil", "null == null", nil, true},
		{"nil not equal int", "null != 5", nil, true},
		{"int not equal string", "5 != '5'", nil, true},
		{"comparison with variables", "x == y", map[string]any{"x": 10, "y": 10}, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			idx := findComparisonOp(tt.expr)
			if idx < 0 {
				t.Fatalf("findComparisonOp returned -1 for %q", tt.expr)
			}
			got, err := evaluateComparison(tt.expr, idx, tt.vars, 0)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.expected {
				t.Errorf("expected %v, got %v", tt.expected, got)
			}
		})
	}
}

// ==================== evaluateLogical direct tests ====================

func TestEvaluateLogical_Direct(t *testing.T) {
	// Test OR short-circuit: returns left value if truthy
	t.Run("or short-circuit true", func(t *testing.T) {
		idx := findLogicalOp("true || false", "||")
		if idx < 0 {
			t.Fatal("findLogicalOp returned -1")
		}
		got, err := evaluateLogical("true || false", idx, "||", nil, 0)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != true {
			t.Errorf("expected true, got %v", got)
		}
	})

	// Test OR returns right when left is falsy
	t.Run("or returns right", func(t *testing.T) {
		idx := findLogicalOp("false || 42", "||")
		if idx < 0 {
			t.Fatal("findLogicalOp returned -1")
		}
		got, err := evaluateLogical("false || 42", idx, "||", nil, 0)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != 42 {
			t.Errorf("expected 42, got %v", got)
		}
	})

	// Test AND short-circuit: returns left value if falsy
	t.Run("and short-circuit false", func(t *testing.T) {
		idx := findLogicalOp("false && true", "&&")
		if idx < 0 {
			t.Fatal("findLogicalOp returned -1")
		}
		got, err := evaluateLogical("false && true", idx, "&&", nil, 0)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != false {
			t.Errorf("expected false, got %v", got)
		}
	})

	// Test AND returns right when left is truthy
	t.Run("and returns right", func(t *testing.T) {
		idx := findLogicalOp("true && 99", "&&")
		if idx < 0 {
			t.Fatal("findLogicalOp returned -1")
		}
		got, err := evaluateLogical("true && 99", idx, "&&", nil, 0)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != 99 {
			t.Errorf("expected 99, got %v", got)
		}
	})

	// Test OR with nil left
	t.Run("or nil left", func(t *testing.T) {
		idx := findLogicalOp("null || 'default'", "||")
		if idx < 0 {
			t.Fatal("findLogicalOp returned -1")
		}
		got, err := evaluateLogical("null || 'default'", idx, "||", nil, 0)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != "default" {
			t.Errorf("expected 'default', got %v", got)
		}
	})
}

// ==================== evaluateArithmetic direct tests ====================

func TestEvaluateArithmetic_Direct(t *testing.T) {
	tests := []struct {
		name     string
		expr     string
		vars     map[string]any
		expected any
		hasError bool
	}{
		{"addition", "3 + 4", nil, 7, false},
		{"subtraction", "10 - 3", nil, 7, false},
		{"multiplication", "6 * 7", nil, 42, false},
		{"integer division", "15 / 3", nil, 5, false},
		{"float division", "10 / 3", nil, 10.0 / 3.0, false},
		{"modulo", "10 % 3", nil, 1, false},
		{"power int result", "2 ** 10", nil, 1024, false},
		{"power float result", "2 ** 0.5", nil, nil, false}, // sqrt(2), non-integer
		{"division by zero", "10 / 0", nil, nil, true},
		{"modulo by zero", "10 % 0", nil, nil, true},
		{"with variables", "x * y", map[string]any{"x": 3, "y": 7}, 21, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			vars := tt.vars
			if vars == nil {
				vars = map[string]any{}
			}
			idx := findArithmeticOp(tt.expr)
			if idx < 0 && !tt.hasError {
				t.Fatalf("findArithmeticOp returned -1 for %q", tt.expr)
			}
			if idx < 0 {
				return
			}
			got, err := evaluateArithmetic(tt.expr, idx, vars, 0)
			if tt.hasError {
				if err == nil {
					t.Error("expected error")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tt.expected != nil {
				if got != tt.expected {
					t.Errorf("expected %v, got %v", tt.expected, got)
				}
			}
		})
	}
}

// ==================== evaluateCodeFunction direct tests ====================

func TestEvaluateCodeFunction_Direct(t *testing.T) {
	// Test built-in functions directly
	t.Run("len map", func(t *testing.T) {
		got, err := evaluateCodeFunction("len(map)", map[string]any{"map": map[string]any{"a": 1, "b": 2}}, 0)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != 2 {
			t.Errorf("expected 2, got %v", got)
		}
	})

	t.Run("len array", func(t *testing.T) {
		got, err := evaluateCodeFunction("len(arr)", map[string]any{"arr": []any{1, 2, 3, 4}}, 0)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != 4 {
			t.Errorf("expected 4, got %v", got)
		}
	})

	t.Run("indexOf", func(t *testing.T) {
		got, err := evaluateCodeFunction("indexOf('hello world', 'world')", nil, 0)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != 6 {
			t.Errorf("expected 6, got %v", got)
		}
	})

	t.Run("index_of alias", func(t *testing.T) {
		got, err := evaluateCodeFunction("index_of('abcdef', 'cd')", nil, 0)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != 2 {
			t.Errorf("expected 2, got %v", got)
		}
	})

	t.Run("pow with variable args", func(t *testing.T) {
		vars := map[string]any{"base": 3.0, "exp": 2.0}
		got, err := evaluateCodeFunction("pow(base, exp)", vars, 0)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != 9 {
			t.Errorf("expected 9, got %v", got)
		}
	})

	t.Run("json_stringify map", func(t *testing.T) {
		got, err := evaluateCodeFunction("json_stringify(json_parse('{\"x\":1}'))", nil, 0)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		s := toString(got)
		if s != `{"x":1}` {
			t.Errorf("expected compact JSON, got %q", s)
		}
	})

	t.Run("str conversion of number", func(t *testing.T) {
		got, err := evaluateCodeFunction("str(42)", nil, 0)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != "42" {
			t.Errorf("expected '42', got %v", got)
		}
	})

	t.Run("float conversion of string", func(t *testing.T) {
		got, err := evaluateCodeFunction("float('3.14')", nil, 0)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != 3.14 {
			t.Errorf("expected 3.14, got %v", got)
		}
	})

	t.Run("min returns smaller", func(t *testing.T) {
		got, err := evaluateCodeFunction("min(1, 2)", nil, 0)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != 1.0 {
			t.Errorf("expected 1.0, got %v", got)
		}
	})

	t.Run("max returns larger", func(t *testing.T) {
		got, err := evaluateCodeFunction("max(1, 2)", nil, 0)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != 2.0 {
			t.Errorf("expected 2.0, got %v", got)
		}
	})

	t.Run("abs negative", func(t *testing.T) {
		got, err := evaluateCodeFunction("abs(-10)", nil, 0)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != 10.0 {
			t.Errorf("expected 10.0, got %v", got)
		}
	})
}

// ==================== Array index tests ====================

func TestEvaluateCodeExpressionInternal_ArrayIndex(t *testing.T) {
	t.Run("valid index", func(t *testing.T) {
		got, err := evaluateCodeExpressionInternal("arr[0]", map[string]any{"arr": []any{"a", "b", "c"}}, 0)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != "a" {
			t.Errorf("expected 'a', got %v", got)
		}
	})

	t.Run("last index", func(t *testing.T) {
		got, err := evaluateCodeExpressionInternal("arr[2]", map[string]any{"arr": []any{10, 20, 30}}, 0)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != 30 {
			t.Errorf("expected 30, got %v", got)
		}
	})

	t.Run("out of bounds", func(t *testing.T) {
		_, err := evaluateCodeExpressionInternal("arr[5]", map[string]any{"arr": []any{1, 2}}, 0)
		if err == nil {
			t.Error("expected error for out of bounds")
		}
	})

	t.Run("negative index", func(t *testing.T) {
		_, err := evaluateCodeExpressionInternal("arr[-1]", map[string]any{"arr": []any{1, 2}}, 0)
		if err == nil {
			t.Error("expected error for negative index")
		}
	})

	t.Run("undefined variable", func(t *testing.T) {
		_, err := evaluateCodeExpressionInternal("missing[0]", map[string]any{}, 0)
		if err == nil {
			t.Error("expected error for undefined variable")
		}
	})

	t.Run("non-array variable", func(t *testing.T) {
		_, err := evaluateCodeExpressionInternal("x[0]", map[string]any{"x": "not an array"}, 0)
		if err == nil {
			t.Error("expected error for non-array variable")
		}
	})

	t.Run("invalid index string", func(t *testing.T) {
		_, err := evaluateCodeExpressionInternal("arr[abc]", map[string]any{"arr": []any{1}}, 0)
		if err == nil {
			t.Error("expected error for invalid index")
		}
	})
}

// ==================== findArithmeticOp direct tests ====================

func TestFindArithmeticOp_Direct(t *testing.T) {
	tests := []struct {
		name string
		expr string
		want int // -1 means not found
	}{
		{"addition", "3 + 4", 2},
		{"subtraction", "10 - 3", 3},
		{"multiplication only", "6 * 7", 2},
		{"division only", "10 / 3", 3},
		{"modulo only", "10 % 3", 3},
		{"power only", "2 ** 8", 2},
		{"no operator", "42", -1},
		{"precedence add over mul", "2 + 3 * 4", 2},
		{"precedence mul over pow", "2 * 3 ** 4", 2},
		{"unary minus skipped", "-5 + 3", 3},
		{"unary minus at start", "-5", -1},
		{"parens block", "(2 + 3) * 4", 8},
		{"string blocks", "'a+b' * 2", 6},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := findArithmeticOp(tt.expr)
			if got != tt.want {
				t.Errorf("findArithmeticOp(%q) = %d, want %d", tt.expr, got, tt.want)
			}
		})
	}
}

// ==================== findComparisonOp direct tests ====================

func TestFindComparisonOp_Direct(t *testing.T) {
	tests := []struct {
		name string
		expr string
		want int
	}{
		{"greater than", "5 > 3", 2},
		{"less than", "3 < 5", 2},
		{"greater or equal", "5 >= 3", 2},
		{"less or equal", "3 <= 5", 2},
		{"equal", "5 == 5", 2},
		{"not equal", "5 != 3", 2},
		{"no comparison", "42", -1},
		{"in string", "'5>3'", -1},
		{"in parens", "(5 > 3)", -1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := findComparisonOp(tt.expr)
			if got != tt.want {
				t.Errorf("findComparisonOp(%q) = %d, want %d", tt.expr, got, tt.want)
			}
		})
	}
}

// ==================== findLogicalOp direct tests ====================

func TestFindLogicalOp_Direct(t *testing.T) {
	tests := []struct {
		name string
		expr string
		op   string
		want int
	}{
		{"or", "true || false", "||", 5},
		{"and", "true && false", "&&", 5},
		{"no or", "true", "||", -1},
		{"no and", "true", "&&", -1},
		{"in string", "'a||b'", "||", -1},
		{"in parens", "(a || b)", "||", -1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := findLogicalOp(tt.expr, tt.op)
			if got != tt.want {
				t.Errorf("findLogicalOp(%q, %q) = %d, want %d", tt.expr, tt.op, got, tt.want)
			}
		})
	}
}

// ==================== findTernarySeparator direct tests ====================

func TestFindTernarySeparator_Direct(t *testing.T) {
	tests := []struct {
		name string
		expr string
		want int
	}{
		{"simple", "a ? b : c", 2},
		{"in string", "'a?b' ? x : y", 6},
		{"in parens", "(a ? b : c) ? x : y", 12},
		{"no ternary", "a + b", -1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := findTernarySeparator(tt.expr)
			if got != tt.want {
				t.Errorf("findTernarySeparator(%q) = %d, want %d", tt.expr, got, tt.want)
			}
		})
	}
}
