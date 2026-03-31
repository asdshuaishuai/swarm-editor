package swarm

import (
	"testing"
)

func TestExecuteSwitchNode_Equals(t *testing.T) {
	tests := []struct {
		name      string
		field     any
		operator  string
		value     any
		branch    string
		wantMatch bool
	}{
		{"string match", "hello", "equals", "hello", "branch1", true},
		{"string no match", "hello", "equals", "world", "branch1", false},
		{"numeric match", 42, "equals", 42, "branch1", true},
		{"numeric string match", "42", "equals", "42", "branch1", true},
		{"nil vs nil", nil, "equals", nil, "branch1", true},
		{"nil vs value", nil, "equals", "hello", "branch1", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ExecuteSwitchNode(map[string]any{
				"field": tt.field,
				"branches": []any{
					map[string]any{
						"name": tt.branch,
						"rules": []any{
							map[string]any{
								"operator": tt.operator,
								"value":    tt.value,
							},
						},
					},
				},
			})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Matched != tt.wantMatch {
				t.Errorf("matched: got %v, want %v", result.Matched, tt.wantMatch)
			}
			if result.Matched && result.Branch != tt.branch {
				t.Errorf("branch: got %q, want %q", result.Branch, tt.branch)
			}
		})
	}
}

func TestExecuteSwitchNode_NotEquals(t *testing.T) {
	result, err := ExecuteSwitchNode(map[string]any{
		"field": "hello",
		"branches": []any{
			map[string]any{
				"name": "not_world",
				"rules": []any{
					map[string]any{
						"operator": "not_equals",
						"value":    "world",
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Matched {
		t.Error("expected match for not_equals")
	}
	if result.Branch != "not_world" {
		t.Errorf("expected branch 'not_world', got %q", result.Branch)
	}
}

func TestExecuteSwitchNode_Contains(t *testing.T) {
	tests := []struct {
		name     string
		field    string
		operator string
		value    string
		want     bool
	}{
		{"contains", "hello world", "contains", "world", true},
		{"not contains", "hello", "not_contains", "world", true},
		{"starts with", "hello world", "starts_with", "hello", true},
		{"ends with", "hello world", "ends_with", "world", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ExecuteSwitchNode(map[string]any{
				"field": tt.field,
				"branches": []any{
					map[string]any{
						"name": "branch1",
						"rules": []any{
							map[string]any{
								"operator": tt.operator,
								"value":    tt.value,
							},
						},
					},
				},
			})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Matched != tt.want {
				t.Errorf("matched: got %v, want %v", result.Matched, tt.want)
			}
		})
	}
}

func TestExecuteSwitchNode_Ordered(t *testing.T) {
	tests := []struct {
		name     string
		field    any
		operator string
		value    any
		want     bool
	}{
		{"greater than", 10, "greater_than", 5, true},
		{"less than", 3, "less_than", 5, true},
		{"gte equal", 5, "greater_than_or_equal", 5, true},
		{"lte equal", 5, "less_than_or_equal", 5, true},
		{"gt false", 3, "greater_than", 5, false},
		{"lt false", 10, "less_than", 5, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ExecuteSwitchNode(map[string]any{
				"field": tt.field,
				"branches": []any{
					map[string]any{
						"name": "branch1",
						"rules": []any{
							map[string]any{
								"operator": tt.operator,
								"value":    tt.value,
							},
						},
					},
				},
			})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Matched != tt.want {
				t.Errorf("matched: got %v, want %v", result.Matched, tt.want)
			}
		})
	}
}

func TestExecuteSwitchNode_IsEmpty(t *testing.T) {
	tests := []struct {
		name     string
		field    any
		operator string
		want     bool
	}{
		{"empty string", "", "is_empty", true},
		{"non-empty string", "hello", "is_not_empty", true},
		{"nil value", nil, "is_empty", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ExecuteSwitchNode(map[string]any{
				"field": tt.field,
				"branches": []any{
					map[string]any{
						"name": "branch1",
						"rules": []any{
							map[string]any{
								"operator": tt.operator,
							},
						},
					},
				},
			})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Matched != tt.want {
				t.Errorf("matched: got %v, want %v", result.Matched, tt.want)
			}
		})
	}
}

func TestExecuteSwitchNode_Matches(t *testing.T) {
	result, err := ExecuteSwitchNode(map[string]any{
		"field": "hello-123",
		"branches": []any{
			map[string]any{
				"name": "numeric",
				"rules": []any{
					map[string]any{
						"operator": "matches",
						"value":    `^\w+-\d+$`,
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Matched {
		t.Error("expected match for regex")
	}
}

func TestExecuteSwitchNode_MatchesInvalid(t *testing.T) {
	result, err := ExecuteSwitchNode(map[string]any{
		"field": "hello",
		"branches": []any{
			map[string]any{
				"name": "branch1",
				"rules": []any{
					map[string]any{
						"operator": "matches",
						"value":    "[invalid",
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Matched {
		t.Error("invalid regex should not match")
	}
}

func TestExecuteSwitchNode_In(t *testing.T) {
	result, err := ExecuteSwitchNode(map[string]any{
		"field": "banana",
		"branches": []any{
			map[string]any{
				"name": "fruit",
				"rules": []any{
					map[string]any{
						"operator": "in",
						"value":    []any{"apple", "banana", "cherry"},
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Matched {
		t.Error("expected match for 'in' operator")
	}
}

func TestExecuteSwitchNode_InString(t *testing.T) {
	result, err := ExecuteSwitchNode(map[string]any{
		"field": "banana",
		"branches": []any{
			map[string]any{
				"name": "fruit",
				"rules": []any{
					map[string]any{
						"operator": "in",
						"value":    "apple,banana,cherry",
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Matched {
		t.Error("expected match for 'in' with comma-separated string")
	}
}

func TestExecuteSwitchNode_CaseInsensitive(t *testing.T) {
	result, err := ExecuteSwitchNode(map[string]any{
		"field":         "Hello World",
		"case_sensitive": false,
		"branches": []any{
			map[string]any{
				"name": "lower",
				"rules": []any{
					map[string]any{
						"operator": "equals",
						"value":    "hello world",
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Matched {
		t.Error("expected case-insensitive match")
	}
}

func TestExecuteSwitchNode_FirstMatchWins(t *testing.T) {
	// First matching branch should win, even if later branches also match
	result, err := ExecuteSwitchNode(map[string]any{
		"field": "hello",
		"branches": []any{
			map[string]any{
				"name": "first",
				"rules": []any{
					map[string]any{
						"operator": "equals",
						"value":    "hello",
					},
				},
			},
			map[string]any{
				"name": "second",
				"rules": []any{
					map[string]any{
						"operator": "contains",
						"value":    "ell",
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Branch != "first" {
		t.Errorf("expected first branch, got %q", result.Branch)
	}
}

func TestExecuteSwitchNode_Fallback(t *testing.T) {
	result, err := ExecuteSwitchNode(map[string]any{
		"field":   "unknown",
		"fallback": "default_branch",
		"branches": []any{
			map[string]any{
				"name": "first",
				"rules": []any{
					map[string]any{
						"operator": "equals",
						"value":    "hello",
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Matched {
		t.Error("fallback should not be marked as matched")
	}
	if result.Branch != "default_branch" {
		t.Errorf("expected fallback branch, got %q", result.Branch)
	}
}

func TestExecuteSwitchNode_NoMatchNoFallback(t *testing.T) {
	result, err := ExecuteSwitchNode(map[string]any{
		"field": "unknown",
		"branches": []any{
			map[string]any{
				"name": "first",
				"rules": []any{
					map[string]any{
						"operator": "equals",
						"value":    "hello",
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Matched {
		t.Error("expected no match")
	}
	if result.Branch != "" {
		t.Errorf("expected empty branch, got %q", result.Branch)
	}
}

func TestExecuteSwitchNode_Empty(t *testing.T) {
	result, err := ExecuteSwitchNode(map[string]any{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Matched {
		t.Error("expected no match for empty config")
	}
	if result.Evaluated != 0 {
		t.Errorf("expected 0 evaluated, got %d", result.Evaluated)
	}
}

func TestExecuteSwitchNode_ANDLogic(t *testing.T) {
	result, err := ExecuteSwitchNode(map[string]any{
		"field": "hello world",
		"branches": []any{
			map[string]any{
				"name":  "match",
				"logic": "and",
				"rules": []any{
					map[string]any{
						"operator": "contains",
						"value":    "hello",
					},
					map[string]any{
						"operator": "contains",
						"value":    "world",
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Matched {
		t.Error("expected AND logic match")
	}
}

func TestExecuteSwitchNode_ANDLogicFail(t *testing.T) {
	result, err := ExecuteSwitchNode(map[string]any{
		"field": "hello world",
		"branches": []any{
			map[string]any{
				"name":  "match",
				"logic": "and",
				"rules": []any{
					map[string]any{
						"operator": "contains",
						"value":    "hello",
					},
					map[string]any{
						"operator": "contains",
						"value":    "foo",
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Matched {
		t.Error("AND logic should fail when one rule doesn't match")
	}
}

func TestExecuteSwitchNode_ORLogic(t *testing.T) {
	result, err := ExecuteSwitchNode(map[string]any{
		"field": "hello world",
		"branches": []any{
			map[string]any{
				"name":  "match",
				"logic": "or",
				"rules": []any{
					map[string]any{
						"operator": "contains",
						"value":    "foo",
					},
					map[string]any{
						"operator": "contains",
						"value":    "world",
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Matched {
		t.Error("expected OR logic match")
	}
}

func TestExecuteSwitchNode_MultipleBranches(t *testing.T) {
	result, err := ExecuteSwitchNode(map[string]any{
		"field": "error: timeout",
		"branches": []any{
			map[string]any{
				"name": "success",
				"rules": []any{
					map[string]any{
						"operator": "starts_with",
						"value":    "success",
					},
				},
			},
			map[string]any{
				"name": "error",
				"rules": []any{
					map[string]any{
						"operator": "starts_with",
						"value":    "error",
					},
				},
			},
			map[string]any{
				"name": "warning",
				"rules": []any{
					map[string]any{
						"operator": "starts_with",
						"value":    "warning",
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Branch != "error" {
		t.Errorf("expected 'error' branch, got %q", result.Branch)
	}
	if result.Evaluated != 2 {
		t.Errorf("expected 2 branches evaluated, got %d", result.Evaluated)
	}
}

func TestExecuteSwitchNode_RegexTooLong(t *testing.T) {
	longPattern := make([]byte, 1025)
	for i := range longPattern {
		longPattern[i] = 'a'
	}
	result, err := ExecuteSwitchNode(map[string]any{
		"field": "hello",
		"branches": []any{
			map[string]any{
				"name": "branch1",
				"rules": []any{
					map[string]any{
						"operator": "matches",
						"value":    string(longPattern),
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Matched {
		t.Error("regex too long should not match")
	}
}

func TestExecuteSwitchNode_InvalidBranchesFormat(t *testing.T) {
	// Non-array branches should be handled gracefully
	result, err := ExecuteSwitchNode(map[string]any{
		"field":    "hello",
		"branches": "invalid",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Matched {
		t.Error("invalid branches format should not match")
	}
}

func TestCompareSwitchIn_EdgeCases(t *testing.T) {
	tests := []struct {
		name          string
		left          any
		right         any
		caseSensitive bool
		want          bool
	}{
		{"non-slice/non-string right type", "hello", 42, true, false},
		{"empty []any", "hello", []any{}, true, false},
		{"case-insensitive match in []any", "hello", []any{"HELLO", "WORLD"}, false, true},
		{"case-sensitive no match in []any", "hello", []any{"HELLO", "WORLD"}, true, false},
		{"comma-separated with spaces", "banana", "apple, banana, cherry", true, true},
		{"comma-separated empty string", "hello", "", true, false},
		{"nil left value", nil, []any{"hello"}, true, false},
		{"nil right value", "hello", nil, true, false},
		{"map as right type", "hello", map[string]any{"key": "value"}, true, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := compareSwitchIn(tt.left, tt.right, tt.caseSensitive)
			if got != tt.want {
				t.Errorf("compareSwitchIn(%v, %v, %v) = %v, want %v", tt.left, tt.right, tt.caseSensitive, got, tt.want)
			}
		})
	}
}
