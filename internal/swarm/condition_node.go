// Package swarm provides Condition Node for workflow execution.
// Inspired by Dify IF Node, n8n IF Node, and Temporal conditional execution:
//   - Expression-based branching: left operator right
//   - Value references: {{node_id.result.field}} and {{variable.key}}
//   - Operators: ==, !=, >, <, >=, <=, contains, starts_with, ends_with, is_empty, matches
//   - Short-circuit evaluation for null-safe comparisons
package swarm

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
)

// Comparison operators supported by condition evaluation.
const (
	OpEqual            = "=="
	OpNotEqual         = "!="
	OpGreaterThan      = ">"
	OpGreaterOrEqual   = ">="
	OpLessThan         = "<"
	OpLessOrEqual      = "<="
	OpContains         = "contains"
	OpNotContains      = "not_contains"
	OpStartsWith       = "starts_with"
	OpEndsWith         = "ends_with"
	OpIsEmpty          = "is_empty"
	OpIsNotEmpty       = "is_not_empty"
	OpMatches          = "matches"
	OpMatchesNot       = "not_matches"
	OpIsTrue           = "is_true"
	OpIsFalse          = "is_false"
	OpIn    = "in"
	OpNotIn = "not_in"
)

var validOperators = map[string]bool{
	OpEqual: true, OpNotEqual: true,
	OpGreaterThan: true, OpGreaterOrEqual: true, OpLessThan: true, OpLessOrEqual: true,
	OpContains: true, OpNotContains: true,
	OpStartsWith: true, OpEndsWith: true,
	OpIsEmpty: true, OpIsNotEmpty: true,
	OpMatches: true, OpMatchesNot: true,
	OpIsTrue: true, OpIsFalse: true,
	OpIn: true, OpNotIn: true,
}

// ConditionResult represents the output of a condition node.
type ConditionResult struct {
	Result  bool   `json:"result"`
	Left    any    `json:"left"`
	Right   any    `json:"right"`
	Operator string `json:"operator"`
}

// ExecuteConditionNode evaluates a condition expression and returns the result.
//
// Config fields:
//   - left (any): Left operand value (supports variable references)
//   - operator (string): Comparison operator (default: "==")
//   - right (any): Right operand value (supports variable references)
//
// Output edges:
//   - Edge with condition "true" is followed when condition evaluates to true
//   - Edge with condition "false" is followed when condition evaluates to false
func ExecuteConditionNode(config map[string]any) (*ConditionResult, error) {
	left := config["left"]
	operator := getStringConfig(config, "operator", "==")
	right := config["right"]

	if !validOperators[operator] {
		return nil, fmt.Errorf("condition node: invalid operator %q, valid: %v", operator, validOperatorList())
	}

	result := evaluateCondition(left, operator, right)

	return &ConditionResult{
		Result:   result,
		Left:     left,
		Right:    right,
		Operator: operator,
	}, nil
}

// evaluateCondition performs the actual comparison.
func evaluateCondition(left any, operator string, right any) bool {
	switch operator {
	case OpEqual:
		return compareEqual(left, right)
	case OpNotEqual:
		return !compareEqual(left, right)
	case OpGreaterThan, OpLessThan, OpGreaterOrEqual, OpLessOrEqual:
		return compareOrdered(left, operator, right)
	case OpContains:
		return compareContains(left, right)
	case OpNotContains:
		return !compareContains(left, right)
	case OpStartsWith:
		return compareStringPrefix(left, right)
	case OpEndsWith:
		return compareStringSuffix(left, right)
	case OpIsEmpty:
		return isEmpty(left)
	case OpIsNotEmpty:
		return !isEmpty(left)
	case OpMatches:
		return compareRegex(left, right, false)
	case OpMatchesNot:
		return compareRegex(left, right, true)
	case OpIsTrue:
		return isTruthy(left)
	case OpIsFalse:
		return !isTruthy(left)
	case OpIn:
		return compareIn(left, right)
	case OpNotIn:
		return !compareIn(left, right)
	default:
		return false
	}
}

// compareEqual checks if left == right with type coercion.
func compareEqual(left, right any) bool {
	// Nil comparison
	if left == nil && right == nil {
		return true
	}
	if left == nil || right == nil {
		return false
	}

	// Try numeric comparison (skip if either is a string — "42" != 42)
	_, leftIsString := left.(string)
	_, rightIsString := right.(string)
	if !leftIsString && !rightIsString {
		lf, lok := toFloat64(left)
		rf, rok := toFloat64(right)
		if lok && rok {
			return lf == rf
		}
	}

	// String comparison
	ls, lok2 := left.(string)
	rs, rok2 := right.(string)
	if lok2 && rok2 {
		return ls == rs
	}

	// Bool comparison
	lb, lok3 := left.(bool)
	rb, rok3 := right.(bool)
	if lok3 && rok3 {
		return lb == rb
	}

	// Cross-type comparison: not equal unless both are the same type
	return false
}

// compareOrdered checks numeric ordering: >, <, >=, <=
// Falls back to string comparison for non-numeric values.
func compareOrdered(left any, operator string, right any) bool {
	// Try numeric comparison first
	_, leftIsString := left.(string)
	_, rightIsString := right.(string)
	if !leftIsString && !rightIsString {
		lf, lok := toFloat64(left)
		rf, rok := toFloat64(right)
		if lok && rok {
			switch operator {
			case OpGreaterThan:
				return lf > rf
			case OpLessThan:
				return lf < rf
			case OpGreaterOrEqual:
				return lf >= rf
			case OpLessOrEqual:
				return lf <= rf
			}
		}
	}

	// String comparison fallback
	ls, lok := left.(string)
	rs, rok := right.(string)
	if lok && rok {
		switch operator {
		case OpGreaterThan:
			return ls > rs
		case OpLessThan:
			return ls < rs
		case OpGreaterOrEqual:
			return ls >= rs
		case OpLessOrEqual:
			return ls <= rs
		}
	}

	return false
}

// compareContains checks if left string contains right string.
func compareContains(left, right any) bool {
	ls := toString(left)
	rs := toString(right)
	return strings.Contains(ls, rs)
}

// compareStringPrefix checks if left string starts with right string.
func compareStringPrefix(left, right any) bool {
	ls := toString(left)
	rs := toString(right)
	return strings.HasPrefix(ls, rs)
}

// compareStringSuffix checks if left string ends with right string.
func compareStringSuffix(left, right any) bool {
	ls := toString(left)
	rs := toString(right)
	return strings.HasSuffix(ls, rs)
}

// compareRegex checks if left string matches right regex pattern.
// Pattern length is limited to 1024 chars to prevent ReDoS attacks.
func compareRegex(left, right any, negate bool) bool {
	ls := toString(left)
	rs := toString(right)
	if len(rs) > 1024 || len(ls) > 10000 {
		return false
	}
	matched, err := regexp.MatchString(rs, ls)
	if err != nil {
		return false
	}
	if negate {
		return !matched
	}
	return matched
}

// compareIn checks if left value exists in right (array or comma-separated string).
func compareIn(left, right any) bool {
	ls := toString(left)

	// Handle []any input directly (e.g., from split())
	if arr, ok := right.([]any); ok {
		for _, item := range arr {
			if toString(item) == ls {
				return true
			}
		}
		return false
	}

	rs := toString(right)

	// Check if right is a comma/space-separated list
	if strings.Contains(rs, ",") || strings.Contains(rs, " ") {
		separator := ","
		if !strings.Contains(rs, ",") {
			separator = " "
		}
		items := strings.SplitSeq(rs, separator)
		for item := range items {
			if strings.TrimSpace(item) == ls {
				return true
			}
		}
		return false
	}

	return compareEqual(left, right)
}

// isEmpty checks if a value is empty (nil, "", 0, false, empty map/slice).
func isEmpty(val any) bool {
	if val == nil {
		return true
	}
	switch v := val.(type) {
	case string:
		return v == ""
	case bool:
		return !v
	case int, int64, int32, int16, int8,
		uint, uint64, uint32, uint16, uint8,
		float64, float32:
		return v == 0
	case []any:
		return len(v) == 0
	case map[string]any:
		return len(v) == 0
	}
	return false
}

// isTruthy checks if a value is truthy (not nil, not empty, not false, not 0).
func isTruthy(val any) bool {
	if val == nil {
		return false
	}
	switch v := val.(type) {
	case string:
		return v != ""
	case bool:
		return v
	case int, int64, int32, int16, int8,
		uint, uint64, uint32, uint16, uint8,
		float64, float32:
		return v != 0
	case []any:
		return len(v) > 0
	case map[string]any:
		return len(v) > 0
	}
	return true
}

// toFloat64 attempts to convert any value to float64.
func toFloat64(val any) (float64, bool) {
	switch v := val.(type) {
	case float64:
		return v, true
	case float32:
		return float64(v), true
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	case int32:
		return float64(v), true
	case int16:
		return float64(v), true
	case int8:
		return float64(v), true
	case uint:
		return float64(v), true
	case uint64:
		return float64(v), true
	case uint32:
		return float64(v), true
	case uint16:
		return float64(v), true
	case uint8:
		return float64(v), true
	case string:
		f, err := strconv.ParseFloat(v, 64)
		if err != nil || math.IsInf(f, 0) || math.IsNaN(f) {
			return 0, false
		}
		return f, true
	default:
		return 0, false
	}
}

// toString converts any value to its string representation.
func toString(val any) string {
	if val == nil {
		return ""
	}
	switch v := val.(type) {
	case string:
		return v
	case bool:
		return strconv.FormatBool(v)
	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	case int32:
		return strconv.FormatInt(int64(v), 10)
	case int16:
		return strconv.FormatInt(int64(v), 10)
	case int8:
		return strconv.FormatInt(int64(v), 10)
	case uint:
		return strconv.FormatUint(uint64(v), 10)
	case uint64:
		return strconv.FormatUint(v, 10)
	case uint32:
		return strconv.FormatUint(uint64(v), 10)
	case uint16:
		return strconv.FormatUint(uint64(v), 10)
	case uint8:
		return strconv.FormatUint(uint64(v), 10)
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case float32:
		return strconv.FormatFloat(float64(v), 'f', -1, 32)
	case fmt.Stringer:
		return v.String()
	default:
		return fmt.Sprintf("%v", v)
	}
}

// validOperatorList returns a comma-separated string of valid operators.
func validOperatorList() string {
	ops := make([]string, 0, len(validOperators))
	for op := range validOperators {
		ops = append(ops, op)
	}
	return strings.Join(ops, ", ")
}
