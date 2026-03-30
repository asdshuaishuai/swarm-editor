// Package swarm provides Template/Transform Node for workflow execution.
// Inspired by Dify Template Transform, n8n Set Node, and LangGraph state channels:
//   - Jinja2-style template rendering with {{expression}} syntax
//   - JSON path access to upstream node results
//   - Built-in functions: upper, lower, trim, length, join, split, replace, now, json_parse, json_stringify
//   - Multiple output variables support
//   - Loop variable access (item, index)
package swarm

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	// MaxTemplateRecursionDepth limits nested function call depth to prevent stack overflow.
	MaxTemplateRecursionDepth = 20

	// MaxTemplateSize limits template string length (1MB) to prevent OOM.
	MaxTemplateSize = 1 << 20

	// MaxTemplateOutputSize limits rendered output size (2MB) to prevent OOM.
	MaxTemplateOutputSize = 2 << 20

	// MaxConcatArgs limits the number of arguments to concat() function.
	MaxConcatArgs = 100
)

// TemplateResult represents the output of a template/transform node.
type TemplateResult struct {
	Output    map[string]any `json:"output"`
	Variables map[string]any `json:"variables,omitempty"`
	Raw       string         `json:"raw,omitempty"`
}

// ExecuteTemplateNode renders a template string with variable substitution.
//
// Config fields:
//   - template (string): Template string with {{expression}} placeholders
//   - variables (map[string]string): Named output variables with template values
//   - code (string): Alias for template (n8n compatibility)
//   - language (string): Language hint, reserved for future use
//
// Template syntax:
//   - {{variable.key}} — Workflow variable reference (resolved by variable store)
//   - {{node_id.result.field}} — Upstream node result reference
//   - {{upper(value)}} — Convert to uppercase
//   - {{lower(value)}} — Convert to lowercase
//   - {{trim(value)}} — Trim whitespace
//   - {{length(value)}} — Get length of string/array
//   - {{join(array, separator)}} — Join array elements
//   - {{split(string, separator)}} — Split string into array
//   - {{replace(string, old, new)}} — Replace substrings
//   - {{default(value, fallback)}} — Use fallback if value is empty
//   - {{now()}} — Current timestamp
//   - {{json_parse(string)}} — Parse JSON string
//   - {{json_stringify(value)}} — Serialize to JSON string
//   - {{int(value)}} — Convert to integer
//   - {{float(value)}} — Convert to float
//   - {{index(array, n)}} — Get array element at index
func ExecuteTemplateNode(config map[string]any) (*TemplateResult, error) {
	// Extract template string
	template := getStringConfig(config, "template", "")
	if template == "" {
		template = getStringConfig(config, "code", "")
	}

	// Check template size limit
	if len(template) > MaxTemplateSize {
		return nil, fmt.Errorf("template node: template size %d exceeds limit %d", len(template), MaxTemplateSize)
	}

	// Check for named variables (Dify Template Transform pattern)
	var namedVars map[string]any
	if v, ok := config["variables"]; ok {
		if vm, ok := v.(map[string]any); ok {
			namedVars = vm
		}
	}

	// Check named variable template sizes
	for key, tmpl := range namedVars {
		if s, ok := tmpl.(string); ok && len(s) > MaxTemplateSize {
			return nil, fmt.Errorf("template node: variable %q template size %d exceeds limit %d", key, len(s), MaxTemplateSize)
		}
	}

	// Render template
	output := make(map[string]any)

	if len(namedVars) > 0 {
		// Named variable mode: render each variable template
		for key, tmpl := range namedVars {
			tmplStr, ok := tmpl.(string)
			if !ok {
				tmplStr = fmt.Sprintf("%v", tmpl)
			}
			rendered := renderTemplate(tmplStr, 0)
			if isTemplateError(rendered) {
				return nil, fmt.Errorf("template node: error rendering variable %q: %v", key, rendered)
			}
			output[key] = rendered
		}
		// Also render main template if provided
		if template != "" {
			rendered := renderTemplate(template, 0)
			if isTemplateError(rendered) {
				return nil, fmt.Errorf("template node: error rendering template: %v", rendered)
			}
			output["_result"] = rendered
		}
	} else if template != "" {
		// Simple template mode: render single template
		rendered := renderTemplate(template, 0)
		if isTemplateError(rendered) {
			return nil, fmt.Errorf("template node: %v", rendered)
		}
		output["result"] = rendered
	}

	return &TemplateResult{
		Output:    output,
		Raw:       template,
		Variables: namedVars,
	}, nil
}

// templateExpr matches {{expression}} patterns.
var templateExpr = regexp.MustCompile(`\{\{(.*?)\}\}`)

// renderTemplate replaces all {{expression}} placeholders with evaluated values.
// depth tracks recursion depth to prevent stack overflow from deeply nested expressions.
// Returns error sentinel values as strings prefixed with "[template error:" to signal
// failure to callers. Callers should check via isTemplateError().
func renderTemplate(template string, depth int) any {
	// Check recursion depth
	if depth > MaxTemplateRecursionDepth {
		return templateError("recursion depth exceeded")
	}

	// Check if the entire template is a single expression
	// Must have exactly one {{ at start and one }} at end, with no other {{ or }} inside
	trimmed := strings.TrimSpace(template)
	if strings.HasPrefix(trimmed, "{{") && strings.HasSuffix(trimmed, "}}") {
		inner := trimmed[2 : len(trimmed)-2]
		// Verify no nested {{ or }} inside
		if !strings.Contains(inner, "{{") && !strings.Contains(inner, "}}") {
			result := evaluateTemplateExpr(strings.TrimSpace(inner), depth+1)
			// If it's a single expression, return the raw value (not stringified)
			return result
		}
	}

	// Multiple expressions: render as string
	matches := templateExpr.FindAllStringSubmatchIndex(template, -1)
	if len(matches) == 0 {
		return template
	}

	var result strings.Builder
	lastEnd := 0
	for _, loc := range matches {
		// Check output size limit to prevent OOM
		if result.Len() > MaxTemplateOutputSize {
			return templateError("output size exceeded")
		}
		// Add text before expression
		result.WriteString(template[lastEnd:loc[0]])
		// Evaluate expression
		expr := strings.TrimSpace(template[loc[2]:loc[3]])
		val := evaluateTemplateExpr(expr, depth+1)
		result.WriteString(toString(val))
		lastEnd = loc[1]
	}
	result.WriteString(template[lastEnd:])

	// Final size check
	if result.Len() > MaxTemplateOutputSize {
		return templateError("output size exceeded")
	}

	return result.String()
}

// evaluateTemplateExpr evaluates a single template expression.
func evaluateTemplateExpr(expr string, depth int) any {
	// Check recursion depth
	if depth > MaxTemplateRecursionDepth {
		return templateError("recursion depth exceeded")
	}

	// Check for function calls: funcName(arg1, arg2, ...)
	if idx := strings.Index(expr, "("); idx > 0 {
		funcName := strings.TrimSpace(expr[:idx])
		// Find matching closing paren (handle nested parens)
		argsStart := idx + 1
		parenDepth := 1
		argsEnd := argsStart
		for argsEnd < len(expr) && parenDepth > 0 {
			switch expr[argsEnd] {
			case '(':
				parenDepth++
			case ')':
				parenDepth--
			}
			if parenDepth > 0 {
				argsEnd++
			}
		}
		if parenDepth != 0 {
			// Unmatched parens — return as plain expression
			return expr
		}
		argsStr := expr[argsStart:argsEnd]
		args := parseTemplateArgs(argsStr)
		return callTemplateFunc(funcName, args, depth+1)
	}

	// Plain value reference — return as string
	return expr
}

// parseTemplateArgs splits arguments by comma, respecting nested quotes.
func parseTemplateArgs(s string) []string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}

	var args []string
	var current strings.Builder
	inQuote := false
	quoteChar := byte(0)
	depth := 0

	for i := 0; i < len(s); i++ {
		ch := s[i]
		switch {
		case inQuote:
			current.WriteByte(ch)
			if ch == quoteChar {
				inQuote = false
			}
		case ch == '"' || ch == '\'':
			inQuote = true
			quoteChar = ch
			current.WriteByte(ch)
		case ch == '(':
			depth++
			current.WriteByte(ch)
		case ch == ')':
			depth--
			current.WriteByte(ch)
		case ch == ',' && depth == 0:
			args = append(args, strings.TrimSpace(current.String()))
			current.Reset()
		default:
			current.WriteByte(ch)
		}
	}
	if current.Len() > 0 {
		args = append(args, strings.TrimSpace(current.String()))
	}
	return args
}

// callTemplateFunc dispatches a template function call.
func callTemplateFunc(name string, args []string, depth int) any {
	// Check recursion depth
	if depth > MaxTemplateRecursionDepth {
		return templateError("recursion depth exceeded")
	}
	switch name {
	case "upper":
		if len(args) > 0 {
			return strings.ToUpper(evaluateArg(args[0], depth))
		}
		return ""

	case "lower":
		if len(args) > 0 {
			return strings.ToLower(evaluateArg(args[0], depth))
		}
		return ""

	case "trim":
		if len(args) > 0 {
			return strings.TrimSpace(evaluateArg(args[0], depth))
		}
		return ""

	case "length":
		if len(args) > 0 {
			val := evaluateArgAny(args[0], depth)
			switch v := val.(type) {
			case string:
				return len(v)
			case []any:
				return len(v)
			case map[string]any:
				return len(v)
			default:
				return len(toString(val))
			}
		}
		return 0

	case "join":
		if len(args) >= 2 {
			// args[0] can be a comma-separated string or an array from split()
			val := evaluateArgAny(args[0], depth)
			sep := evaluateArg(args[1], depth)
			switch v := val.(type) {
			case []any:
				parts := make([]string, len(v))
				for i, item := range v {
					parts[i] = toString(item)
				}
				return strings.Join(parts, sep)
			default:
				items := strings.Split(toString(v), ",")
				return strings.Join(items, sep)
			}
		}
		return ""

	case "split":
		if len(args) >= 2 {
			s := evaluateArg(args[0], depth)
			sep := evaluateArg(args[1], depth)
			parts := strings.Split(s, sep)
			result := make([]any, len(parts))
			for i, p := range parts {
				result[i] = strings.TrimSpace(p)
			}
			return result
		}
		return []any{}

	case "replace":
		if len(args) >= 3 {
			s := evaluateArg(args[0], depth)
			old := evaluateArg(args[1], depth)
			new := evaluateArg(args[2], depth)
			if old == "" {
				return s
			}
			return strings.ReplaceAll(s, old, new)
		}
		return ""

	case "default":
		if len(args) >= 2 {
			val := evaluateArg(args[0], depth)
			if val == "" {
				return evaluateArg(args[1], depth)
			}
			return val
		}
		return ""

	case "now":
		return time.Now().Format(time.RFC3339)

	case "json_parse":
		if len(args) > 0 {
			s := evaluateArg(args[0], depth)
			var result any
			if err := json.Unmarshal([]byte(s), &result); err != nil {
				return s // Return raw string on parse error
			}
			return result
		}
		return nil

	case "json_stringify":
		if len(args) > 0 {
			// Try to parse as JSON first, then re-serialize for pretty output
			s := evaluateArg(args[0], depth)
			var parsed any
			if err := json.Unmarshal([]byte(s), &parsed); err == nil {
				out, err := json.Marshal(parsed)
				if err == nil {
					return string(out)
				}
			}
			return s
		}
		return ""

	case "int":
		if len(args) > 0 {
			s := evaluateArg(args[0], depth)
			n, err := strconv.Atoi(s)
			if err != nil {
				return 0
			}
			return n
		}
		return 0

	case "float":
		if len(args) > 0 {
			s := evaluateArg(args[0], depth)
			f, err := strconv.ParseFloat(s, 64)
			if err != nil {
				return 0.0
			}
			return f
		}
		return 0.0

	case "index":
		if len(args) >= 2 {
			val := evaluateArgAny(args[0], depth)
			idx, err := strconv.Atoi(evaluateArg(args[1], depth))
			if err != nil || idx < 0 {
				return nil
			}
			switch v := val.(type) {
			case []any:
				if idx >= len(v) {
					return nil
				}
				return v[idx]
			default:
				items := strings.Split(toString(v), ",")
				if idx >= len(items) {
					return nil
				}
				return strings.TrimSpace(items[idx])
			}
		}
		return nil

	case "concat":
		// Concatenate all arguments (limit to MaxConcatArgs)
		if len(args) > MaxConcatArgs {
			return "[concat error: too many arguments]"
		}
		var sb strings.Builder
		for _, arg := range args {
			sb.WriteString(evaluateArg(arg, depth))
		}
		return sb.String()

	case "contains":
		if len(args) >= 2 {
			s := evaluateArg(args[0], depth)
			sub := evaluateArg(args[1], depth)
			return strings.Contains(s, sub)
		}
		return false

	case "has_prefix":
		if len(args) >= 2 {
			s := evaluateArg(args[0], depth)
			prefix := evaluateArg(args[1], depth)
			return strings.HasPrefix(s, prefix)
		}
		return false

	case "has_suffix":
		if len(args) >= 2 {
			s := evaluateArg(args[0], depth)
			suffix := evaluateArg(args[1], depth)
			return strings.HasSuffix(s, suffix)
		}
		return false

	case "substring":
		if len(args) >= 3 {
			s := evaluateArg(args[0], depth)
			start, err1 := strconv.Atoi(evaluateArg(args[1], depth))
			end, err2 := strconv.Atoi(evaluateArg(args[2], depth))
			if err1 != nil || err2 != nil || start < 0 || end > len(s) || start >= end {
				return s
			}
			return s[start:end]
		}
		return ""

	default:
		// Unknown function — return expression as-is
		return fmt.Sprintf("{{%s}}", name)
	}
}

// evaluateArg evaluates a template argument.
// If the argument contains template expressions, render them.
// If the argument is a nested function call, evaluate it recursively.
// Otherwise, strip quotes and return as-is.
func evaluateArg(arg string, depth int) string {
	return toString(evaluateArgAny(arg, depth))
}

// evaluateArgAny is like evaluateArg but preserves non-string types.
// Used by functions that accept array/object arguments (length, index, concat, join).
func evaluateArgAny(arg string, depth int) any {
	// Check recursion depth
	if depth > MaxTemplateRecursionDepth {
		return templateError("recursion depth exceeded")
	}

	arg = strings.TrimSpace(arg)
	if arg == "" {
		return ""
	}

	// Strip surrounding quotes
	if len(arg) >= 2 && ((strings.HasPrefix(arg, `"`) && strings.HasSuffix(arg, `"`)) ||
		(strings.HasPrefix(arg, `'`) && strings.HasSuffix(arg, `'`))) {
		return arg[1 : len(arg)-1]
	}

	// Check for nested template expressions
	if strings.Contains(arg, "{{") {
		result := renderTemplate(arg, depth+1)
		return result
	}

	// Check for nested function calls: name(...)
	if idx := strings.Index(arg, "("); idx > 0 && strings.HasSuffix(arg, ")") {
		result := evaluateTemplateExpr(arg, depth+1)
		return result
	}

	return arg
}

// templateError returns a sentinel error string for template rendering failures.
// Uses a unique prefix so callers can distinguish real errors from legitimate output.
func templateError(msg string) string {
	return fmt.Sprintf("[template error: %s]", msg)
}

// isTemplateError checks if a rendered value is a template error sentinel.
func isTemplateError(val any) bool {
	s, ok := val.(string)
	return ok && strings.HasPrefix(s, "[template error:")
}
