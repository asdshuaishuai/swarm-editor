package swarm

import (
	"strings"
	"testing"
)

func TestExecuteTemplateNode_Simple(t *testing.T) {
	tests := []struct {
		name     string
		template string
		expected string
	}{
		{"plain text", "hello world", "hello world"},
		{"single variable", "{{name}}", "name"},
		{"embedded variable", "Hello {{user}}!", "Hello user!"},
		{"multiple variables", "{{a}} and {{b}}", "a and b"},
		{"no variables", "no placeholders", "no placeholders"},
		{"whitespace in expr", "Hello {{ user }}!", "Hello user!"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ExecuteTemplateNode(map[string]any{
				"template": tt.template,
			})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			got := toString(result.Output["result"])
			if got != tt.expected {
				t.Errorf("expected %q, got %q", tt.expected, got)
			}
		})
	}
}

func TestExecuteTemplateNode_CodeAlias(t *testing.T) {
	// "code" field should be treated as alias for "template"
	result, err := ExecuteTemplateNode(map[string]any{
		"code": "{{greeting}}",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got := toString(result.Output["result"])
	if got != "greeting" {
		t.Errorf("expected 'greeting', got %q", got)
	}
}

func TestExecuteTemplateNode_NamedVariables(t *testing.T) {
	result, err := ExecuteTemplateNode(map[string]any{
		"variables": map[string]any{
			"summary": "{{upper(title)}}",
			"count":   "{{length(text)}}",
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result.Output["summary"] != "TITLE" {
		t.Errorf("expected 'TITLE', got %v", result.Output["summary"])
	}
	if toString(result.Output["count"]) != "4" {
		t.Errorf("expected '4', got %v", result.Output["count"])
	}
}

func TestExecuteTemplateNode_NamedVariablesWithTemplate(t *testing.T) {
	result, err := ExecuteTemplateNode(map[string]any{
		"template": "Result: {{value}}",
		"variables": map[string]any{
			"key1": "{{upper(value)}}",
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Output["key1"] != "VALUE" {
		t.Errorf("expected 'VALUE', got %v", result.Output["key1"])
	}
	if toString(result.Output["_result"]) != "Result: value" {
		t.Errorf("expected 'Result: value', got %v", result.Output["_result"])
	}
}

func TestExecuteTemplateNode_Empty(t *testing.T) {
	result, err := ExecuteTemplateNode(map[string]any{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Output) != 0 {
		t.Errorf("expected empty output, got %v", result.Output)
	}
}

func TestTemplateFunc_Upper(t *testing.T) {
	result, err := ExecuteTemplateNode(map[string]any{
		"template": "{{upper('hello world')}}",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if toString(result.Output["result"]) != "HELLO WORLD" {
		t.Errorf("expected 'HELLO WORLD', got %v", result.Output["result"])
	}
}

func TestTemplateFunc_Lower(t *testing.T) {
	result, err := ExecuteTemplateNode(map[string]any{
		"template": "{{lower('HELLO WORLD')}}",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if toString(result.Output["result"]) != "hello world" {
		t.Errorf("expected 'hello world', got %v", result.Output["result"])
	}
}

func TestTemplateFunc_Trim(t *testing.T) {
	result, err := ExecuteTemplateNode(map[string]any{
		"template": "{{trim('  hello  ')}}",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if toString(result.Output["result"]) != "hello" {
		t.Errorf("expected 'hello', got %q", toString(result.Output["result"]))
	}
}

func TestTemplateFunc_Length(t *testing.T) {
	result, err := ExecuteTemplateNode(map[string]any{
		"template": "{{length('hello')}}",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if toString(result.Output["result"]) != "5" {
		t.Errorf("expected '5', got %v", result.Output["result"])
	}
}

func TestTemplateFunc_Join(t *testing.T) {
	result, err := ExecuteTemplateNode(map[string]any{
		"template": "{{join('a,b,c', '-')}}",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if toString(result.Output["result"]) != "a-b-c" {
		t.Errorf("expected 'a-b-c', got %v", result.Output["result"])
	}
}

func TestTemplateFunc_Split(t *testing.T) {
	result, err := ExecuteTemplateNode(map[string]any{
		"template": "{{split('a,b,c', ',')}}",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	arr, ok := result.Output["result"].([]any)
	if !ok {
		t.Fatalf("expected array, got %T", result.Output["result"])
	}
	if len(arr) != 3 {
		t.Errorf("expected 3 elements, got %d", len(arr))
	}
}

func TestTemplateFunc_Replace(t *testing.T) {
	result, err := ExecuteTemplateNode(map[string]any{
		"template": "{{replace('hello world', 'world', 'universe')}}",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if toString(result.Output["result"]) != "hello universe" {
		t.Errorf("expected 'hello universe', got %v", result.Output["result"])
	}
}

func TestTemplateFunc_Default(t *testing.T) {
	tests := []struct {
		name     string
		template string
		expected string
	}{
		{"with value", "{{default('hello', 'fallback')}}", "hello"},
		{"empty value", "{{default('', 'fallback')}}", "fallback"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ExecuteTemplateNode(map[string]any{"template": tt.template})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if toString(result.Output["result"]) != tt.expected {
				t.Errorf("expected %q, got %q", tt.expected, toString(result.Output["result"]))
			}
		})
	}
}

func TestTemplateFunc_Now(t *testing.T) {
	result, err := ExecuteTemplateNode(map[string]any{
		"template": "{{now()}}",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got := toString(result.Output["result"])
	if len(got) < 20 {
		t.Errorf("expected RFC3339 timestamp, got %q", got)
	}
}

func TestTemplateFunc_JSONParse(t *testing.T) {
	result, err := ExecuteTemplateNode(map[string]any{
		"template": "{{json_parse('{\"key\": \"value\"}')}}",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got := result.Output["result"]
	m, ok := got.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", got)
	}
	if m["key"] != "value" {
		t.Errorf("expected key=value, got %v", m)
	}
}

func TestTemplateFunc_JSONStringify(t *testing.T) {
	result, err := ExecuteTemplateNode(map[string]any{
		"template": "{{json_stringify('{\"a\": 1}')}}",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got := toString(result.Output["result"])
	if got != `{"a":1}` {
		t.Errorf("expected compact JSON, got %q", got)
	}
}

func TestTemplateFunc_Int(t *testing.T) {
	result, err := ExecuteTemplateNode(map[string]any{
		"template": "{{int('42')}}",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Output["result"] != 42 {
		t.Errorf("expected 42, got %v", result.Output["result"])
	}
}

func TestTemplateFunc_Float(t *testing.T) {
	result, err := ExecuteTemplateNode(map[string]any{
		"template": "{{float('3.14')}}",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	f, ok := result.Output["result"].(float64)
	if !ok {
		t.Fatalf("expected float64, got %T", result.Output["result"])
	}
	if f != 3.14 {
		t.Errorf("expected 3.14, got %v", f)
	}
}

func TestTemplateFunc_Index(t *testing.T) {
	result, err := ExecuteTemplateNode(map[string]any{
		"template": "{{index('a,b,c', '1')}}",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if toString(result.Output["result"]) != "b" {
		t.Errorf("expected 'b', got %v", result.Output["result"])
	}
}

func TestTemplateFunc_Concat(t *testing.T) {
	result, err := ExecuteTemplateNode(map[string]any{
		"template": "{{concat('hello', ' ', 'world')}}",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if toString(result.Output["result"]) != "hello world" {
		t.Errorf("expected 'hello world', got %v", result.Output["result"])
	}
}

func TestTemplateFunc_Contains(t *testing.T) {
	result, err := ExecuteTemplateNode(map[string]any{
		"template": "{{contains('hello world', 'world')}}",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got, ok := result.Output["result"].(bool)
	if !ok {
		t.Fatalf("expected bool, got %T", result.Output["result"])
	}
	if !got {
		t.Error("expected true")
	}
}

func TestTemplateFunc_HasPrefix(t *testing.T) {
	result, err := ExecuteTemplateNode(map[string]any{
		"template": "{{has_prefix('hello world', 'hello')}}",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got, ok := result.Output["result"].(bool)
	if !ok {
		t.Fatalf("expected bool, got %T", result.Output["result"])
	}
	if !got {
		t.Error("expected true")
	}
}

func TestTemplateFunc_HasSuffix(t *testing.T) {
	result, err := ExecuteTemplateNode(map[string]any{
		"template": "{{has_suffix('hello world', 'world')}}",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got, ok := result.Output["result"].(bool)
	if !ok {
		t.Fatalf("expected bool, got %T", result.Output["result"])
	}
	if !got {
		t.Error("expected true")
	}
}

func TestTemplateFunc_Substring(t *testing.T) {
	result, err := ExecuteTemplateNode(map[string]any{
		"template": "{{substring('hello world', '0', '5')}}",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if toString(result.Output["result"]) != "hello" {
		t.Errorf("expected 'hello', got %v", result.Output["result"])
	}
}

func TestTemplateFunc_Unknown(t *testing.T) {
	result, err := ExecuteTemplateNode(map[string]any{
		"template": "{{unknown_func('test')}}",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Unknown function returns expression as-is
	got := toString(result.Output["result"])
	if got != "{{unknown_func}}" {
		t.Errorf("expected raw expression, got %q", got)
	}
}

func TestRenderTemplate_SingleExpression(t *testing.T) {
	// Single expression should return raw value, not stringified
	result := renderTemplate("{{upper('hello')}}", 0)
	s, ok := result.(string)
	if !ok {
		t.Fatalf("expected string, got %T", result)
	}
	if s != "HELLO" {
		t.Errorf("expected 'HELLO', got %q", s)
	}
}

func TestRenderTemplate_IntExpression(t *testing.T) {
	// int() function returns an int, not a string
	result := renderTemplate("{{int('42')}}", 0)
	n, ok := result.(int)
	if !ok {
		t.Fatalf("expected int, got %T", result)
	}
	if n != 42 {
		t.Errorf("expected 42, got %d", n)
	}
}

func TestRenderTemplate_FloatExpression(t *testing.T) {
	result := renderTemplate("{{float('3.14')}}", 0)
	f, ok := result.(float64)
	if !ok {
		t.Fatalf("expected float64, got %T", result)
	}
	if f != 3.14 {
		t.Errorf("expected 3.14, got %v", f)
	}
}

func TestRenderTemplate_BoolExpression(t *testing.T) {
	result := renderTemplate("{{contains('hello', 'ell')}}", 0)
	b, ok := result.(bool)
	if !ok {
		t.Fatalf("expected bool, got %T", result)
	}
	if !b {
		t.Error("expected true")
	}
}

func TestParseTemplateArgs(t *testing.T) {
	tests := []struct {
		input    string
		expected []string
	}{
		{"a, b, c", []string{"a", "b", "c"}},
		{"'hello, world', 'foo'", []string{"'hello, world'", "'foo'"}},
		{"a, func(b, c)", []string{"a", "func(b, c)"}},
		{"single", []string{"single"}},
		{"", nil},
	}

	for _, tt := range tests {
		result := parseTemplateArgs(tt.input)
		if len(result) != len(tt.expected) {
			t.Errorf("parseTemplateArgs(%q): expected %d args, got %d", tt.input, len(tt.expected), len(result))
			continue
		}
		for i, v := range result {
			if v != tt.expected[i] {
				t.Errorf("parseTemplateArgs(%q)[%d]: expected %q, got %q", tt.input, i, tt.expected[i], v)
			}
		}
	}
}

func TestEvaluateArg(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"  hello  ", "hello"},
		{`"quoted"`, "quoted"},
		{"plain", "plain"},
		{"", ""},
		{"  ", ""},
	}

	for _, tt := range tests {
		result := evaluateArg(tt.input, 0)
		if result != tt.expected {
			t.Errorf("evaluateArg(%q): expected %q, got %q", tt.input, tt.expected, result)
		}
	}
}

func TestExecuteTemplateNode_Complex(t *testing.T) {
	// Complex template with multiple functions
	result, err := ExecuteTemplateNode(map[string]any{
		"template": "{{upper(trim('  hello  '))}} - {{replace('foo bar', 'bar', 'baz')}}",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got := toString(result.Output["result"])
	if got != "HELLO - foo baz" {
		t.Errorf("expected 'HELLO - foo baz', got %q", got)
	}
}

func TestExecuteTemplateNode_RecursionDepthLimit(t *testing.T) {
	// Test that deeply nested function calls are limited
	// Build a template with 25 nested upper() calls
	var nested strings.Builder
	for i := 0; i < 25; i++ {
		nested.WriteString("upper(")
	}
	nested.WriteString("'test'")
	for i := 0; i < 25; i++ {
		nested.WriteString(")")
	}
	template := "{{" + nested.String() + "}}"

	result, err := ExecuteTemplateNode(map[string]any{
		"template": template,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Should return error message instead of panicking
	got := toString(result.Output["result"])
	if !strings.Contains(strings.ToLower(got), "recursion depth exceeded") {
		t.Errorf("expected recursion error, got %q", got)
	}
}

func TestExecuteTemplateNode_TemplateSizeLimit(t *testing.T) {
	// Test that oversized templates are rejected
	largeTemplate := strings.Repeat("x", 2<<20) // 2MB
	_, err := ExecuteTemplateNode(map[string]any{
		"template": largeTemplate,
	})
	if err == nil {
		t.Fatal("expected error for oversized template")
	}
	if !strings.Contains(err.Error(), "exceeds limit") {
		t.Errorf("expected size limit error, got %v", err)
	}
}

func TestRenderTemplate_RecursionDepth(t *testing.T) {
	// Test that renderTemplate respects depth limit
	result := renderTemplate("{{upper('hello')}}", MaxTemplateRecursionDepth)
	got, ok := result.(string)
	if !ok {
		t.Fatalf("expected string, got %T", result)
	}
	if !strings.Contains(strings.ToLower(got), "recursion depth exceeded") {
		t.Errorf("expected recursion error, got %q", got)
	}
}

func TestTemplateFunc_NestedSplitLength(t *testing.T) {
	// {{length(split('a,b,c', ','))}} should return 3, not 7
	result, err := ExecuteTemplateNode(map[string]any{
		"template": "{{length(split('a,b,c', ','))}}",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Output["result"] != 3 {
		t.Errorf("expected 3, got %v", result.Output["result"])
	}
}

func TestTemplateFunc_NestedJoinArray(t *testing.T) {
	// {{join(split('a,b,c', ','), ' - ')}} should return "a - b - c"
	result, err := ExecuteTemplateNode(map[string]any{
		"template": "{{join(split('a,b,c', ','), ' - ')}}",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	got := toString(result.Output["result"])
	if got != "a - b - c" {
		t.Errorf("expected 'a - b - c', got %q", got)
	}
}

func TestTemplateFunc_NestedIndexArray(t *testing.T) {
	// {{index(split('a,b,c', ','), '1')}} should return "b"
	result, err := ExecuteTemplateNode(map[string]any{
		"template": "{{index(split('a,b,c', ','), '1')}}",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if toString(result.Output["result"]) != "b" {
		t.Errorf("expected 'b', got %v", result.Output["result"])
	}
}
