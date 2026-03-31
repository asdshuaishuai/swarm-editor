package swarm

import (
	"fmt"
	"strings"
	"testing"
)

func TestExecuteConditionNode_Equal(t *testing.T) {
	tests := []struct {
		name     string
		left     any
		operator string
		right    any
		expected bool
	}{
		{"string equal", "hello", "==", "hello", true},
		{"string not equal", "hello", "==", "world", false},
		{"string not equal op", "hello", "!=", "world", true},
		{"string not equal same", "hello", "!=", "hello", false},
		{"numeric equal int", 42, "==", 42, true},
		{"numeric equal float", 3.14, "==", 3.14, true},
		{"numeric cross type", 42, "==", 42.0, true},
		{"bool equal", true, "==", true, true},
		{"nil equal", nil, "==", nil, true},
		{"nil vs string", nil, "==", "hello", false},
		{"string vs nil", "hello", "==", nil, false},
		{"bool vs int", true, "==", 1, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ExecuteConditionNode(map[string]any{
				"left": tt.left, "operator": tt.operator, "right": tt.right,
			})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Result != tt.expected {
				t.Errorf("left=%v op=%s right=%v: expected %v, got %v", tt.left, tt.operator, tt.right, tt.expected, result.Result)
			}
		})
	}
}

func TestExecuteConditionNode_Ordered(t *testing.T) {
	tests := []struct {
		name     string
		left     any
		operator string
		right    any
		expected bool
	}{
		{"greater true", 10, ">", 5, true},
		{"greater false", 5, ">", 10, false},
		{"greater equal true", 10, ">=", 10, true},
		{"greater equal true 2", 10, ">=", 5, true},
		{"greater equal false", 5, ">=", 10, false},
		{"less than true", 5, "<", 10, true},
		{"less than false", 10, "<", 5, false},
		{"less equal true", 5, "<=", 10, true},
		{"less equal equal", 10, "<=", 10, true},
		{"less equal false", 10, "<=", 5, false},
		{"string greater", "b", ">", "a", true},
		{"string less", "a", "<", "b", true},
		{"string greater equal", "b", ">=", "a", true},
		{"string less equal", "a", "<=", "b", true},
		{"float comparison", 3.14, ">", 3.13, true},
		{"mixed type fallback", 10, ">", "hello", false}, // non-numeric string vs number
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ExecuteConditionNode(map[string]any{
				"left": tt.left, "operator": tt.operator, "right": tt.right,
			})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Result != tt.expected {
				t.Errorf("expected %v, got %v", tt.expected, result.Result)
			}
		})
	}
}

func TestExecuteConditionNode_Contains(t *testing.T) {
	tests := []struct {
		name     string
		left     any
		operator string
		right    any
		expected bool
	}{
		{"contains true", "hello world", "contains", "world", true},
		{"contains false", "hello world", "contains", "planet", false},
		{"not contains true", "hello", "not_contains", "world", true},
		{"not contains false", "hello world", "not_contains", "world", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ExecuteConditionNode(map[string]any{
				"left": tt.left, "operator": tt.operator, "right": tt.right,
			})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Result != tt.expected {
				t.Errorf("expected %v, got %v", tt.expected, result.Result)
			}
		})
	}
}

func TestExecuteConditionNode_StartsEndsWith(t *testing.T) {
	tests := []struct {
		name     string
		left     any
		operator string
		right    any
		expected bool
	}{
		{"starts_with true", "hello", "starts_with", "hel", true},
		{"starts_with false", "hello", "starts_with", "wor", false},
		{"ends_with true", "hello", "ends_with", "llo", true},
		{"ends_with false", "hello", "ends_with", "hel", false},
	}

	for _, tt := range tests {
		name := tt.left.(string) + " " + tt.operator + " " + toString(tt.right)
		t.Run(name, func(t *testing.T) {
			result, err := ExecuteConditionNode(map[string]any{
				"left": tt.left, "operator": tt.operator, "right": tt.right,
			})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Result != tt.expected {
				t.Errorf("expected %v, got %v", tt.expected, result.Result)
			}
		})
	}
}

func TestExecuteConditionNode_Empty(t *testing.T) {
	tests := []struct {
		name     string
		left     any
		operator string
		expected bool
	}{
		{"nil is_empty", nil, "is_empty", true},
		{"empty string is_empty", "", "is_empty", true},
		{"non-empty string is_empty", "hello", "is_empty", false},
		{"zero is_empty", 0, "is_empty", true},
		{"non-zero is_empty", 1, "is_empty", false},
		{"false is_empty", false, "is_empty", true},
		{"true is_empty", true, "is_empty", false},
	{"empty slice is_empty", []any{}, "is_empty", true},
		{"nil is_not_empty", nil, "is_not_empty", false},
		{"hello is_not_empty", "hello", "is_not_empty", true},
	}

	for _, tt := range tests {
		t.Run(tt.operator+"_"+toString(tt.left), func(t *testing.T) {
			result, err := ExecuteConditionNode(map[string]any{
				"left": tt.left, "operator": tt.operator,
			})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Result != tt.expected {
				t.Errorf("expected %v, got %v", tt.expected, result.Result)
			}
		})
	}
}

func TestExecuteConditionNode_Truthy(t *testing.T) {
	tests := []struct {
		name     string
		left     any
		operator string
		expected bool
	}{
		{"true is_true", true, "is_true", true},
		{"false is_true", false, "is_true", false},
		{"non-empty is_true", "hello", "is_true", true},
		{"empty is_true", "", "is_true", false},
		{"zero is_true", 0, "is_true", false},
		{"nil is_true", nil, "is_true", false},
		{"1 is_true", 1, "is_true", true},
		{"false is_false", false, "is_false", true},
		{"true is_false", true, "is_false", false},
	}

	for _, tt := range tests {
		t.Run(tt.operator+"_"+toString(tt.left), func(t *testing.T) {
			result, err := ExecuteConditionNode(map[string]any{
				"left": tt.left, "operator": tt.operator,
			})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Result != tt.expected {
				t.Errorf("expected %v, got %v", tt.expected, result.Result)
			}
		})
	}
}

func TestExecuteConditionNode_Matches(t *testing.T) {
	tests := []struct {
		name     string
		left     any
		operator string
		right    any
		expected bool
	}{
		{"email matches", "user@example.com", "matches", `^[\w.]+@[\w.]+\.\w+$`, true},
		{"email no match", "not-email", "matches", `^[\w.]+@[\w.]+\.\w+$`, false},
		{"matches not", "user@example.com", "not_matches", `^not`, true},
		{"matches not false", "not-email", "not_matches", `^not`, false},
	}

	for _, tt := range tests {
		t.Run(tt.operator+"_"+toString(tt.left), func(t *testing.T) {
			result, err := ExecuteConditionNode(map[string]any{
				"left": tt.left, "operator": tt.operator, "right": tt.right,
			})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Result != tt.expected {
				t.Errorf("expected %v, got %v", tt.expected, result.Result)
			}
		})
	}
}

func TestExecuteConditionNode_In(t *testing.T) {
	tests := []struct {
		name     string
		left     any
		operator string
		right    any
		expected bool
	}{
		{"in comma list", "b", "in", "a,b,c", true},
		{"in comma list not found", "d", "in", "a,b,c", false},
		{"in space list", "b", "in", "a b c", true},
		{"not in list", "d", "not_in", "a,b,c", true},
		{"not in list found", "b", "not_in", "a,b,c", false},
	}

	for _, tt := range tests {
		t.Run(tt.operator+"_"+toString(tt.left), func(t *testing.T) {
			result, err := ExecuteConditionNode(map[string]any{
				"left": tt.left, "operator": tt.operator, "right": tt.right,
			})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Result != tt.expected {
				t.Errorf("expected %v, got %v", tt.expected, result.Result)
			}
		})
	}
}

func TestExecuteConditionNode_InvalidOperator(t *testing.T) {
	_, err := ExecuteConditionNode(map[string]any{
		"left":     "a",
		"operator": "invalid_op",
		"right":    "b",
	})
	if err == nil {
		t.Fatal("expected error for invalid operator")
	}
}

func TestExecuteConditionNode_DefaultOperator(t *testing.T) {
	result, err := ExecuteConditionNode(map[string]any{
		"left":  "hello",
		"right": "hello",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Result {
		t.Error("expected true for equal values with default operator")
	}
	if result.Operator != "==" {
		t.Errorf("expected default operator '==', got %q", result.Operator)
	}
}

func TestExecuteConditionNode_TypeCoercion(t *testing.T) {
	// int vs float64 should be equal
	result, err := ExecuteConditionNode(map[string]any{
		"left":     42,
		"operator": "==",
		"right":    float64(42),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Result {
		t.Error("expected int 42 == float64(42) to be true")
	}

	// string "42" should NOT equal int 42 (string comparison)
	result2, err := ExecuteConditionNode(map[string]any{
		"left":     "42",
		"operator": "==",
		"right":    42,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result2.Result {
		t.Error("expected string '42' != int 42 to be false")
	}

	// But "42" should equal string "42"
	result3, err := ExecuteConditionNode(map[string]any{
		"left":     "42",
		"operator": "==",
		"right":    "42",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result3.Result {
		t.Error("expected string '42' == string '42' to be true")
	}
}

func TestToFloat64(t *testing.T) {
	tests := []struct {
		input    any
		expected float64
		ok       bool
	}{
		{float64(3.14), 3.14, true},
		{float32(2.5), 2.5, true},
		{42, 42.0, true},
		{int64(100), 100.0, true},
		{"3.14", 3.14, true},
		{"not a number", 0, false},
		{"true", 0, false},
		{nil, 0, false},
		// Additional type coverage (Round 72)
		{int32(32), 32.0, true},
		{int16(16), 16.0, true},
		{int8(8), 8.0, true},
		{uint(1), 1.0, true},
		{uint64(64), 64.0, true},
		{uint32(32), 32.0, true},
		{uint16(16), 16.0, true},
		{uint8(8), 8.0, true},
		{"Inf", 0, false}, // Inf values rejected
		{"NaN", 0, false}, // NaN values rejected
		{"+Inf", 0, false},
		{"-Inf", 0, false},
		{true, 0, false}, // default case: non-numeric, non-string
		{[]int{1, 2}, 0, false},
		{map[string]int{"a": 1}, 0, false},
	}

	for _, tt := range tests {
		name := fmt.Sprintf("%v", tt.input)
		t.Run(name, func(t *testing.T) {
			got, ok := toFloat64(tt.input)
			if ok != tt.ok {
				t.Errorf("expected ok=%v for %v", tt.ok, tt.input)
			}
			if ok && got != tt.expected {
				t.Errorf("expected %v, got %v", tt.expected, got)
			}
		})
	}
}

func TestToString(t *testing.T) {
	if toString(nil) != "" {
		t.Error("nil should be empty string")
	}
	if toString("hello") != "hello" {
		t.Error("string should pass through")
	}
	if toString(42) != "42" {
		t.Error("int should convert to string")
	}
	if toString(true) != "true" {
		t.Error("bool should convert to string")
	}
}

func TestIsEmpty(t *testing.T) {
	if !isEmpty(nil) {
		t.Error("nil should be empty")
	}
	if !isEmpty("") {
		t.Error("empty string should be empty")
	}
	if !isEmpty(0) {
		t.Error("zero should be empty")
	}
	if !isEmpty(false) {
		t.Error("false should be empty")
	}
	if isEmpty("hello") {
		t.Error("non-empty string should not be empty")
	}
	if isEmpty(true) {
		t.Error("true should not be empty")
	}
	if isEmpty(1) {
		t.Error("1 should not be empty")
	}
	// Additional type coverage for isEmpty (same bug as isTruthy: multi-type case)
	t.Run("float64 zero", func(t *testing.T) {
		if !isEmpty(float64(0)) {
			t.Error("float64 zero should be empty")
		}
	})
	t.Run("float64 nonzero", func(t *testing.T) {
		if isEmpty(float64(3.14)) {
			t.Error("float64 nonzero should not be empty")
		}
	})
	t.Run("int64 zero", func(t *testing.T) {
		if !isEmpty(int64(0)) {
			t.Error("int64 zero should be empty")
		}
	})
	t.Run("uint zero", func(t *testing.T) {
		if !isEmpty(uint(0)) {
			t.Error("uint zero should be empty")
		}
	})
	// Cover all remaining numeric types
	t.Run("int32 zero", func(t *testing.T) {
		if !isEmpty(int32(0)) {
			t.Error("int32 zero should be empty")
		}
	})
	t.Run("int32 nonzero", func(t *testing.T) {
		if isEmpty(int32(1)) {
			t.Error("int32 nonzero should not be empty")
		}
	})
	t.Run("int64 zero", func(t *testing.T) {
		if !isEmpty(int64(0)) {
			t.Error("int64 zero should be empty")
		}
	})
	t.Run("int64 nonzero", func(t *testing.T) {
		if isEmpty(int64(1)) {
			t.Error("int64 nonzero should not be empty")
		}
	})
	t.Run("uint64 zero", func(t *testing.T) {
		if !isEmpty(uint64(0)) {
			t.Error("uint64 zero should be empty")
		}
	})
	t.Run("uint32 zero", func(t *testing.T) {
		if !isEmpty(uint32(0)) {
			t.Error("uint32 zero should be empty")
		}
	})
	t.Run("float32 zero", func(t *testing.T) {
		if !isEmpty(float32(0)) {
			t.Error("float32 zero should be empty")
		}
	})
	t.Run("float32 nonzero", func(t *testing.T) {
		if isEmpty(float32(3.14)) {
			t.Error("float32 nonzero should not be empty")
		}
	})
	t.Run("empty slice", func(t *testing.T) {
		if !isEmpty([]any{}) {
			t.Error("empty slice should be empty")
		}
	})
	t.Run("non-empty slice", func(t *testing.T) {
		if isEmpty([]any{1, 2, 3}) {
			t.Error("non-empty slice should not be empty")
		}
	})
	t.Run("empty map", func(t *testing.T) {
		if !isEmpty(map[string]any{}) {
			t.Error("empty map should be empty")
		}
	})
	t.Run("non-empty map", func(t *testing.T) {
		if isEmpty(map[string]any{"key": "value"}) {
			t.Error("non-empty map should not be empty")
		}
	})
	t.Run("unknown type", func(t *testing.T) {
		if isEmpty(struct{}{}) {
			t.Error("unknown type (struct) should not be empty")
		}
	})
}

func TestIsTruthy(t *testing.T) {
	if isTruthy(nil) {
		t.Error("nil should not be truthy")
	}
	if isTruthy("") {
		t.Error("empty string should not be truthy")
	}
	if isTruthy(0) {
		t.Error("zero should not be truthy")
	}
	if isTruthy(false) {
		t.Error("false should not be truthy")
	}
	if !isTruthy("hello") {
		t.Error("non-empty string should be truthy")
	}
	if !isTruthy(1) {
		t.Error("1 should be truthy")
	}
	if !isTruthy(true) {
		t.Error("true should be truthy")
	}

	// Additional type coverage
	t.Run("empty slice", func(t *testing.T) {
		if isTruthy([]any{}) {
			t.Error("empty slice should not be truthy")
		}
	})
	t.Run("non-empty slice", func(t *testing.T) {
		if !isTruthy([]any{1}) {
			t.Error("non-empty slice should be truthy")
		}
	})
	t.Run("empty map", func(t *testing.T) {
		if isTruthy(map[string]any{}) {
			t.Error("empty map should not be truthy")
		}
	})
	t.Run("non-empty map", func(t *testing.T) {
		if !isTruthy(map[string]any{"k": "v"}) {
			t.Error("non-empty map should be truthy")
		}
	})
	t.Run("float64 zero", func(t *testing.T) {
		if isTruthy(float64(0)) {
			t.Error("float64 zero should not be truthy")
		}
	})
	t.Run("float64 nonzero", func(t *testing.T) {
		if !isTruthy(float64(3.14)) {
			t.Error("float64 nonzero should be truthy")
		}
	})
	t.Run("int64 zero", func(t *testing.T) {
		if isTruthy(int64(0)) {
			t.Error("int64 zero should not be truthy")
		}
	})
	t.Run("int64 nonzero", func(t *testing.T) {
		if !isTruthy(int64(42)) {
			t.Error("int64 nonzero should be truthy")
		}
	})
	t.Run("uint zero", func(t *testing.T) {
		if isTruthy(uint(0)) {
			t.Error("uint zero should not be truthy")
		}
	})
	t.Run("uint nonzero", func(t *testing.T) {
		if !isTruthy(uint(1)) {
			t.Error("uint nonzero should be truthy")
		}
	})
	// Cover all remaining numeric types
	t.Run("int32 zero", func(t *testing.T) {
		if isTruthy(int32(0)) {
			t.Error("int32 zero should not be truthy")
		}
	})
	t.Run("int32 nonzero", func(t *testing.T) {
		if !isTruthy(int32(1)) {
			t.Error("int32 nonzero should be truthy")
		}
	})
	t.Run("int16 zero", func(t *testing.T) {
		if isTruthy(int16(0)) {
			t.Error("int16 zero should not be truthy")
		}
	})
	t.Run("int16 nonzero", func(t *testing.T) {
		if !isTruthy(int16(1)) {
			t.Error("int16 nonzero should be truthy")
		}
	})
	t.Run("int8 zero", func(t *testing.T) {
		if isTruthy(int8(0)) {
			t.Error("int8 zero should not be truthy")
		}
	})
	t.Run("int8 nonzero", func(t *testing.T) {
		if !isTruthy(int8(1)) {
			t.Error("int8 nonzero should be truthy")
		}
	})
	t.Run("uint64 zero", func(t *testing.T) {
		if isTruthy(uint64(0)) {
			t.Error("uint64 zero should not be truthy")
		}
	})
	t.Run("uint64 nonzero", func(t *testing.T) {
		if !isTruthy(uint64(1)) {
			t.Error("uint64 nonzero should be truthy")
		}
	})
	t.Run("uint32 zero", func(t *testing.T) {
		if isTruthy(uint32(0)) {
			t.Error("uint32 zero should not be truthy")
		}
	})
	t.Run("uint32 nonzero", func(t *testing.T) {
		if !isTruthy(uint32(1)) {
			t.Error("uint32 nonzero should be truthy")
		}
	})
	t.Run("uint16 zero", func(t *testing.T) {
		if isTruthy(uint16(0)) {
			t.Error("uint16 zero should not be truthy")
		}
	})
	t.Run("uint16 nonzero", func(t *testing.T) {
		if !isTruthy(uint16(1)) {
			t.Error("uint16 nonzero should be truthy")
		}
	})
	t.Run("uint8 zero", func(t *testing.T) {
		if isTruthy(uint8(0)) {
			t.Error("uint8 zero should not be truthy")
		}
	})
	t.Run("uint8 nonzero", func(t *testing.T) {
		if !isTruthy(uint8(1)) {
			t.Error("uint8 nonzero should be truthy")
		}
	})
	t.Run("float32 zero", func(t *testing.T) {
		if isTruthy(float32(0)) {
			t.Error("float32 zero should not be truthy")
		}
	})
	t.Run("float32 nonzero", func(t *testing.T) {
		if !isTruthy(float32(3.14)) {
			t.Error("float32 nonzero should be truthy")
		}
	})
}

func TestExecuteConditionNode_InArray(t *testing.T) {
	// compareIn should handle []any input directly
	result, err := ExecuteConditionNode(map[string]any{
		"left":     "b",
		"operator": "in",
		"right":    []any{"a", "b", "c"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Result {
		t.Error("expected 'b' to be found in []any")
	}
}

func TestExecuteConditionNode_InArrayNotFound(t *testing.T) {
	result, err := ExecuteConditionNode(map[string]any{
		"left":     "d",
		"operator": "in",
		"right":    []any{"a", "b", "c"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result {
		t.Error("expected 'd' to not be found in []any")
	}
}

func TestExecuteConditionNode_RegexTooLong(t *testing.T) {
	// Regex pattern > 1024 chars should return false (ReDoS protection)
	longPattern := strings.Repeat("a*", 600)
	result, err := ExecuteConditionNode(map[string]any{
		"left":     "test",
		"operator": "matches",
		"right":    longPattern,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Result {
		t.Error("long regex pattern should not match (ReDoS protection)")
	}
}

func TestToString_AllTypes(t *testing.T) {
	tests := []struct {
		input    any
		expected string
	}{
		{nil, ""},
		{"hello", "hello"},
		{true, "true"},
		{false, "false"},
		{int(42), "42"},
		{int64(42), "42"},
		{int32(42), "42"},
		{int16(42), "42"},
		{int8(42), "42"},
		{uint(42), "42"},
		{uint64(42), "42"},
		{uint32(42), "42"},
		{uint16(42), "42"},
		{uint8(42), "42"},
		{float64(3.14), "3.14"},
		{float32(3.14), "3.14"},
	}
	for _, tt := range tests {
		got := toString(tt.input)
		if got != tt.expected {
			t.Errorf("toString(%v): expected %q, got %q", tt.input, tt.expected, got)
		}
	}
}
