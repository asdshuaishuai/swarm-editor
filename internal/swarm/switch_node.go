// Package swarm provides Switch Node for workflow execution.
// Inspired by n8n Switch Node and Dify Question Classifier:
//   - Multi-branch routing based on value matching
//   - Multiple rules per branch (AND/OR logic)
//   - Fallback/default route support
//   - String, numeric, and regex matching
package swarm

import (
	"fmt"
	"regexp"
	"strings"
)

// SwitchRoute defines a single routing rule in a switch node.
type SwitchRoute struct {
	// Field is the field/value to evaluate (supports {{variable}} references).
	Field string `json:"field"`

	// Operator is the comparison operator:
	//   - equals, not_equals
	//   - contains, not_contains
	//   - starts_with, ends_with
	//   - greater_than, less_than
	//   - matches (regex), not_matches (regex)
	//   - is_empty, is_not_empty
	//   - in, not_in
	Operator string `json:"operator"`

	// Value is the comparison value.
	Value any `json:"value,omitempty"`
}

// SwitchBranch defines a named branch with routing rules.
type SwitchBranch struct {
	// Name is the branch identifier (used as edge condition).
	Name string `json:"name"`

	// Rules defines the conditions for this branch.
	// All rules must match (AND logic) for the branch to be selected.
	Rules []SwitchRoute `json:"rules"`

	// Logic controls how rules are combined: "and" (all match) or "or" (any match).
	Logic string `json:"logic,omitempty"`
}

// SwitchResult represents the output of a switch node.
type SwitchResult struct {
	Branch   string `json:"branch"`
	Matched  bool   `json:"matched"`
	Rules    int    `json:"rules"`
	Evaluated int   `json:"evaluated"`
}

// ExecuteSwitchNode evaluates switch rules and selects the matching branch.
//
// Config fields:
//   - field (string): Value to evaluate (resolved from variables/upstream)
//   - branches ([]SwitchBranch): Ordered list of branches to evaluate
//   - fallback (string): Default branch name if no rules match
//   - case_sensitive (bool): Whether string comparisons are case-sensitive (default: true)
//
// The first branch whose rules all match (AND logic) is selected.
// The branch name is set as ChosenAction for downstream edge routing.
func ExecuteSwitchNode(config map[string]any) (*SwitchResult, error) {
	// Extract field value
	fieldValue := config["field"]

	// Extract case sensitivity
	caseSensitive := true
	if v, ok := config["case_sensitive"]; ok {
		if b, ok := v.(bool); ok {
			caseSensitive = b
		}
	}

	// Extract branches
	branches := parseSwitchBranches(config)

	if len(branches) == 0 {
		return &SwitchResult{
			Branch:   "",
			Matched:  false,
			Evaluated: 0,
		}, nil
	}

	// Evaluate branches in order — first match wins
	for i, branch := range branches {
		matched := evaluateBranch(branch, fieldValue, caseSensitive)
		if matched {
			return &SwitchResult{
				Branch:    branch.Name,
				Matched:   true,
				Rules:     len(branch.Rules),
				Evaluated: i + 1,
			}, nil
		}
	}

	// Check fallback
	fallback := getStringConfig(config, "fallback", "")
	if fallback != "" {
		return &SwitchResult{
			Branch:    fallback,
			Matched:   false,
			Evaluated: len(branches),
		}, nil
	}

	return &SwitchResult{
		Branch:    "",
		Matched:   false,
		Evaluated: len(branches),
	}, nil
}

// parseSwitchBranches extracts branches from config.
func parseSwitchBranches(config map[string]any) []SwitchBranch {
	v, ok := config["branches"]
	if !ok {
		return nil
	}

	// Support []map[string]any format
	if arr, ok := v.([]any); ok {
		var branches []SwitchBranch
		for _, item := range arr {
			if m, ok := item.(map[string]any); ok {
				branch := SwitchBranch{
					Name:  getStringConfig(m, "name", ""),
					Logic: getStringConfig(m, "logic", "and"),
				}
				// Parse rules
				if rules, ok := m["rules"]; ok {
					if rulesArr, ok := rules.([]any); ok {
						for _, rule := range rulesArr {
							if rm, ok := rule.(map[string]any); ok {
								branch.Rules = append(branch.Rules, SwitchRoute{
									Field:    getStringConfig(rm, "field", ""),
									Operator: getStringConfig(rm, "operator", "equals"),
									Value:    rm["value"],
								})
							}
						}
					}
				}
				if branch.Name != "" && len(branch.Rules) > 0 {
					branches = append(branches, branch)
				}
			}
		}
		return branches
	}

	return nil
}

// evaluateBranch checks if all (AND) or any (OR) rules match.
func evaluateBranch(branch SwitchBranch, fieldValue any, caseSensitive bool) bool {
	if len(branch.Rules) == 0 {
		return false
	}

	logic := strings.ToLower(branch.Logic)
	if logic == "or" {
		// OR logic: any rule matches
		for _, rule := range branch.Rules {
			if evaluateSwitchRoute(rule, fieldValue, caseSensitive) {
				return true
			}
		}
		return false
	}

	// AND logic (default): all rules must match
	for _, rule := range branch.Rules {
		if !evaluateSwitchRoute(rule, fieldValue, caseSensitive) {
			return false
		}
	}
	return true
}

// evaluateSwitchRoute evaluates a single routing rule.
func evaluateSwitchRoute(route SwitchRoute, fieldValue any, caseSensitive bool) bool {
	operator := strings.ToLower(strings.TrimSpace(route.Operator))

	// Resolve field reference
	value := fieldValue
	if route.Field != "" {
		// If field is specified, it's a reference — use the value directly
		// In the future, this could resolve {{node_id.result.field}} references
		value = fieldValue
	}

	target := route.Value

	switch operator {
	case "equals", "equal":
		return compareSwitchValues(value, target, caseSensitive)
	case "not_equals", "not_equal":
		return !compareSwitchValues(value, target, caseSensitive)
	case "contains":
		return compareSwitchContains(value, target, caseSensitive)
	case "not_contains":
		return !compareSwitchContains(value, target, caseSensitive)
	case "starts_with":
		return compareSwitchPrefix(value, target, caseSensitive)
	case "ends_with":
		return compareSwitchSuffix(value, target, caseSensitive)
	case "greater_than", "gt":
		return compareSwitchOrdered(value, target, "gt")
	case "less_than", "lt":
		return compareSwitchOrdered(value, target, "lt")
	case "greater_than_or_equal", "gte":
		return compareSwitchOrdered(value, target, "gte")
	case "less_than_or_equal", "lte":
		return compareSwitchOrdered(value, target, "lte")
	case "matches":
		return compareSwitchRegex(value, target, false)
	case "not_matches":
		return !compareSwitchRegex(value, target, false)
	case "is_empty":
		return isEmpty(value)
	case "is_not_empty":
		return !isEmpty(value)
	case "in":
		return compareSwitchIn(value, target, caseSensitive)
	case "not_in":
		return !compareSwitchIn(value, target, caseSensitive)
	default:
		return false
	}
}

// compareSwitchValues compares two values for equality.
func compareSwitchValues(left, right any, caseSensitive bool) bool {
	if left == nil && right == nil {
		return true
	}
	if left == nil || right == nil {
		return false
	}

	ls := toString(left)
	rs := toString(right)

	if !caseSensitive {
		return strings.EqualFold(ls, rs)
	}
	return ls == rs
}

// compareSwitchContains checks if left contains right.
func compareSwitchContains(left, right any, caseSensitive bool) bool {
	ls := toString(left)
	rs := toString(right)

	if !caseSensitive {
		return strings.Contains(strings.ToLower(ls), strings.ToLower(rs))
	}
	return strings.Contains(ls, rs)
}

// compareSwitchPrefix checks if left starts with right.
func compareSwitchPrefix(left, right any, caseSensitive bool) bool {
	ls := toString(left)
	rs := toString(right)

	if !caseSensitive {
		return strings.HasPrefix(strings.ToLower(ls), strings.ToLower(rs))
	}
	return strings.HasPrefix(ls, rs)
}

// compareSwitchSuffix checks if left ends with right.
func compareSwitchSuffix(left, right any, caseSensitive bool) bool {
	ls := toString(left)
	rs := toString(right)

	if !caseSensitive {
		return strings.HasSuffix(strings.ToLower(ls), strings.ToLower(rs))
	}
	return strings.HasSuffix(ls, rs)
}

// compareSwitchOrdered compares numeric ordering.
func compareSwitchOrdered(left, right any, op string) bool {
	lf, lok := toFloat64(left)
	rf, rok := toFloat64(right)
	if !lok || !rok {
		return false
	}

	switch op {
	case "gt":
		return lf > rf
	case "lt":
		return lf < rf
	case "gte":
		return lf >= rf
	case "lte":
		return lf <= rf
	default:
		return false
	}
}

// compareSwitchRegex checks regex match.
func compareSwitchRegex(left, right any, negate bool) bool {
	ls := toString(left)
	rs := toString(right)

	matched, err := regexpMatchString(rs, ls)
	if err != nil {
		return false
	}
	if negate {
		return !matched
	}
	return matched
}

// regexpMatchString wraps regexp.MatchString with bounded pattern and input length.
// Go's RE2 engine is linear-time, but long inputs can still cause high memory/CPU usage.
func regexpMatchString(pattern, s string) (bool, error) {
	if len(pattern) > 1024 {
		return false, fmt.Errorf("regex pattern too long (max 1024 chars)")
	}
	// Limit input string length to prevent memory/CPU exhaustion
	const maxInputLen = 10000
	if len(s) > maxInputLen {
		return false, fmt.Errorf("input string too long for regex matching (max %d chars)", maxInputLen)
	}
	return regexp.MatchString(pattern, s)
}

// compareSwitchIn checks if value is in a list.
func compareSwitchIn(left, right any, caseSensitive bool) bool {
	ls := toString(left)

	switch v := right.(type) {
	case []any:
		for _, item := range v {
			rs := toString(item)
			if caseSensitive {
				if ls == rs {
					return true
				}
			} else {
				if strings.EqualFold(ls, rs) {
					return true
				}
			}
		}
	case string:
		// Comma-separated list
		items := strings.Split(v, ",")
		for _, item := range items {
			if caseSensitive {
				if strings.TrimSpace(item) == ls {
					return true
				}
			} else {
				if strings.EqualFold(strings.TrimSpace(item), ls) {
					return true
				}
			}
		}
	}

	return false
}
