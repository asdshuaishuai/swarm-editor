package api

import (
	"strings"
	"testing"
)

func TestPreserveCaseMatch_Identical(t *testing.T) {
	got := preserveCaseMatch("hello", "hello")
	if got != "hello" {
		t.Errorf("expected hello, got %s", got)
	}
}

func TestPreserveCaseMatch_Empty(t *testing.T) {
	got := preserveCaseMatch("", "test")
	if got != "test" {
		t.Errorf("expected test, got %s", got)
	}
}

func TestPreserveCaseMatch_UpperCase(t *testing.T) {
	got := preserveCaseMatch("HELLO", "world")
	if got != "WORLD" {
		t.Errorf("expected WORLD, got %s", got)
	}
}

func TestPreserveCaseMatch_LowerCase(t *testing.T) {
	got := preserveCaseMatch("hello", "WORLD")
	if got != "world" {
		t.Errorf("expected world, got %s", got)
	}
}

func TestPreserveCaseMatch_TitleCase(t *testing.T) {
	got := preserveCaseMatch("Hello", "world")
	if got != "World" {
		t.Errorf("expected World, got %s", got)
	}
}

func TestPreserveCaseMatch_InvertedTitleCase(t *testing.T) {
	got := preserveCaseMatch("hELLO", "world")
	if got != "wORLD" {
		t.Errorf("expected wORLD, got %s", got)
	}
}

func TestPreserveCaseMatch_Hyphenated(t *testing.T) {
	got := preserveCaseMatch("MY-VAR", "new-name")
	if got != "NEW-NAME" {
		t.Errorf("expected NEW-NAME, got %s", got)
	}
}

func TestPreserveCaseMatch_Underscored(t *testing.T) {
	got := preserveCaseMatch("my_var", "new_name")
	if got != "new_name" {
		t.Errorf("expected new_name, got %s", got)
	}
}

func TestPreserveCaseMatch_NoMatch(t *testing.T) {
	got := preserveCaseMatch("MiXeD", "replacement")
	// Mixed case with no special pattern — return as-is
	if got != "replacement" {
		t.Errorf("expected replacement, got %s", got)
	}
}

func TestCaseInsensitiveReplaceAllWithCasePreserve_Basic(t *testing.T) {
	got := caseInsensitiveReplaceAllWithCasePreserve("hello world", "hello", "hi")
	if got != "hi world" {
		t.Errorf("expected 'hi world', got '%s'", got)
	}
}

func TestCaseInsensitiveReplaceAllWithCasePreserve_UpperCase(t *testing.T) {
	got := caseInsensitiveReplaceAllWithCasePreserve("HELLO WORLD", "hello", "hi")
	if got != "HI WORLD" {
		t.Errorf("expected 'HI WORLD', got '%s'", got)
	}
}

func TestCaseInsensitiveReplaceAllWithCasePreserve_TitleCase(t *testing.T) {
	got := caseInsensitiveReplaceAllWithCasePreserve("Hello World", "hello", "hi")
	if got != "Hi World" {
		t.Errorf("expected 'Hi World', got '%s'", got)
	}
}

func TestCaseInsensitiveReplaceAllWithCasePreserve_Multiple(t *testing.T) {
	got := caseInsensitiveReplaceAllWithCasePreserve("foo bar FOO baz Foo", "foo", "x")
	if !strings.Contains(got, "x bar") || !strings.Contains(got, "X baz") {
		t.Errorf("expected case-preserved replacements, got '%s'", got)
	}
}

func TestCaseInsensitiveReplaceAllWithCasePreserve_EmptyOld(t *testing.T) {
	got := caseInsensitiveReplaceAllWithCasePreserve("hello", "", "x")
	if got != "hello" {
		t.Errorf("expected unchanged, got '%s'", got)
	}
}

func TestCaseInsensitiveReplaceAllWithCasePreserve_NoMatch(t *testing.T) {
	got := caseInsensitiveReplaceAllWithCasePreserve("hello world", "xyz", "abc")
	if got != "hello world" {
		t.Errorf("expected unchanged, got '%s'", got)
	}
}

func TestCaseInsensitiveReplaceAll_Basic(t *testing.T) {
	got := caseInsensitiveReplaceAll("Hello World", "hello", "hi")
	if got != "hi World" {
		t.Errorf("expected 'hi World', got '%s'", got)
	}
}

func TestCaseInsensitiveReplaceAll_EmptyOld(t *testing.T) {
	got := caseInsensitiveReplaceAll("test", "", "x")
	if got != "test" {
		t.Errorf("expected unchanged, got '%s'", got)
	}
}

func TestMapToRange(t *testing.T) {
	m := map[string]any{
		"start": map[string]any{"line": 1.0, "character": 2.0},
		"end":   map[string]any{"line": 3.0, "character": 4.0},
	}
	r := mapToRange(m)
	if r.Start.Line != 1 || r.Start.Character != 2 {
		t.Errorf("expected start 1:2, got %d:%d", r.Start.Line, r.Start.Character)
	}
	if r.End.Line != 3 || r.End.Character != 4 {
		t.Errorf("expected end 3:4, got %d:%d", r.End.Line, r.End.Character)
	}
}

func TestMapToRange_Nil(t *testing.T) {
	r := mapToRange(nil)
	if r.Start.Line != 0 || r.End.Line != 0 {
		t.Error("expected zero range for nil input")
	}
}

func TestMapToPosition(t *testing.T) {
	m := map[string]any{"line": 5.0, "character": 10.0}
	p := mapToPosition(m)
	if p.Line != 5 || p.Character != 10 {
		t.Errorf("expected 5:10, got %d:%d", p.Line, p.Character)
	}
}

func TestMapToPosition_Partial(t *testing.T) {
	m := map[string]any{"line": 3.0}
	p := mapToPosition(m)
	if p.Line != 3 || p.Character != 0 {
		t.Errorf("expected 3:0, got %d:%d", p.Line, p.Character)
	}
}
