// Package swarm provides Code Execution Node for workflow execution.
// Inspired by Dify Code Node, n8n Code Node, and LangGraph Expression Tool:
//   - Safe expression evaluation (no arbitrary code execution)
//   - Math operations: +, -, *, /, %, **
//   - Comparison operations: ==, !=, >, <, >=, <=
//   - Logical operations: &&, ||, !
//   - Ternary operator: condition ? true_value : false_value
//   - Variable access from upstream node results
//   - Built-in math functions: abs, ceil, floor, round, min, max, pow, sqrt
//   - String functions: len, substr, indexOf
//   - Type conversion: int(), float(), str(), bool()
//   - Array operations: [], len(), push(), slice()
//   - No eval/exec — only whitelisted operations
package swarm

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
)

const (
	// MaxCodeExecutionTimeout limits code node execution time (5 minutes).
	// Prevents malicious/misconfigured long-running scripts from blocking workflows indefinitely.
	MaxCodeExecutionTimeout = 5 * time.Minute
)

// CodeResult represents the output of a code/expression node.
type CodeResult struct {
	Output any    `json:"output"`
	Error  string `json:"error,omitempty"`
	Type   string `json:"type,omitempty"`
}

// ExecuteCodeNode evaluates a code expression or script safely.
//
// Config fields:
//   - code (string): Expression/script to evaluate (required)
//   - language (string): "expression" (default) or "javascript" (goja engine)
//   - variables (map[string]any): Input variables accessible in expressions/scripts
//   - timeout_ms (int): Execution timeout in milliseconds (default: 5000 for expression, 30000 for javascript)
//
// Expression syntax (language: "expression"):
//   - Arithmetic: 1 + 2 * 3, 10 / 3, 2 ** 8
//   - Comparison: x > 0, x == 42, x != "hello"
//   - Logical: x > 0 && x < 100, x == 1 || x == 2, !flag
//   - Ternary: x > 0 ? "positive" : "non-positive"
//   - Variables: {{variable.key}}, {{node_id.result.field}}
//   - Functions: abs(-5), ceil(3.14), floor(3.14), round(3.14), min(1,2), max(1,2), pow(2,8), sqrt(16)
//   - String: len("hello"), substr("hello", 0, 3)
//   - Type: int("42"), float("3.14"), str(42), bool(1)
//   - JSON: json_parse('{"a":1}'), json_stringify({"a":1})
//
// JavaScript syntax (language: "javascript"):
//   - Full JavaScript via goja (pure Go JS engine)
//   - Variables injected as global read-only bindings
//   - Supports: loops, conditionals, functions, closures, classes
//   - Safety: 10MB memory limit, 30s timeout, no Go runtime APIs
func ExecuteCodeNode(ctx context.Context, config map[string]any) (*CodeResult, error) {
	code := getStringConfig(config, "code", "")
	if code == "" {
		return &CodeResult{Output: nil, Type: "null"}, nil
	}

	// Size limit for code
	if len(code) > MaxTemplateSize {
		return nil, fmt.Errorf("code node: code size %d exceeds limit %d", len(code), MaxTemplateSize)
	}

	// Extract input variables
	vars := make(map[string]any)
	if v, ok := config["variables"]; ok {
		if m, ok := v.(map[string]any); ok {
			for k, val := range m {
				vars[k] = val
			}
		}
	}

	// Dispatch by language
	language := getStringConfig(config, "language", "expression")
	switch language {
	case "javascript":
		return executeCodeNodeJavaScript(ctx, config, code, vars)
	default:
		return executeCodeNodeExpression(code, vars)
	}
}

// executeCodeNodeJavaScript runs code using the goja JS engine.
func executeCodeNodeJavaScript(ctx context.Context, config map[string]any, code string, vars map[string]any) (*CodeResult, error) {
	// Determine timeout (default 30s for JS, max 5 minutes)
	timeoutMs := 30000
	if v, ok := config["timeout_ms"]; ok {
		if n, ok := toInt64(v); ok && n > 0 {
			timeoutMs = int(n)
		}
	}
	// Clamp to maximum allowed timeout to prevent indefinite blocking
	maxTimeoutMs := int(MaxCodeExecutionTimeout.Milliseconds())
	if timeoutMs > maxTimeoutMs {
		timeoutMs = maxTimeoutMs
	}
	timeout := time.Duration(timeoutMs) * time.Millisecond

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	executor := &GojaExecutor{}
	result, err := executor.Execute(ctx, code, vars)
	if err != nil {
		return &CodeResult{
			Output: nil,
			Error:  err.Error(),
			Type:   "error",
		}, nil
	}

	return &CodeResult{
		Output: result,
		Type:   codeTypeOf(result),
	}, nil
}

// executeCodeNodeExpression runs code using the built-in expression evaluator.
func executeCodeNodeExpression(code string, vars map[string]any) (*CodeResult, error) {
	// First resolve template variables in the code
	resolved := resolveCodeVariables(code, vars)

	// Evaluate the expression with depth limit
	result, evalErr := evaluateCodeExpressionWithDepth(resolved, vars, 0)
	if evalErr != nil {
		return &CodeResult{
			Output: nil,
			Error:  evalErr.Error(),
			Type:   "error",
		}, nil
	}

	// Determine output type
	typeName := codeTypeOf(result)

	return &CodeResult{
		Output: result,
		Type:   typeName,
	}, nil
}

// evaluateCodeExpressionWithDepth evaluates with recursion depth tracking.
func evaluateCodeExpressionWithDepth(expr string, vars map[string]any, depth int) (any, error) {
	if depth > MaxTemplateRecursionDepth {
		return nil, fmt.Errorf("expression recursion depth exceeded (max %d)", MaxTemplateRecursionDepth)
	}
	return evaluateCodeExpressionInternal(expr, vars, depth)
}

// evaluateCodeExpression evaluates a code expression string.
func evaluateCodeExpressionInternal(expr string, vars map[string]any, depth int) (any, error) {
	// Check recursion depth
	if depth > MaxTemplateRecursionDepth {
		return nil, fmt.Errorf("expression recursion depth exceeded")
	}
	nextDepth := depth + 1

	expr = strings.TrimSpace(expr)

	// Handle ternary operator: condition ? true_value : false_value
	if idx := findTernarySeparator(expr); idx >= 0 {
		return evaluateTernary(expr, idx, vars, nextDepth)
	}

	// Handle logical OR: left || right
	if idx := findLogicalOp(expr, "||"); idx >= 0 {
		return evaluateLogical(expr, idx, "||", vars, nextDepth)
	}

	// Handle logical AND: left && right
	if idx := findLogicalOp(expr, "&&"); idx >= 0 {
		return evaluateLogical(expr, idx, "&&", vars, nextDepth)
	}

	// Handle comparison operators
	if idx := findComparisonOp(expr); idx >= 0 {
		return evaluateComparison(expr, idx, vars, nextDepth)
	}

	// Handle function calls: name(args)
	if idx := strings.Index(expr, "("); idx > 0 && strings.HasSuffix(strings.TrimSpace(expr), ")") {
		return evaluateCodeFunction(expr, vars, nextDepth)
	}

	// Handle unary not: !expr
	if strings.HasPrefix(expr, "!") {
		val, err := evaluateCodeExpressionInternal(strings.TrimSpace(expr[1:]), vars, nextDepth)
		if err != nil {
			return nil, err
		}
		return !isTruthy(val), nil
	}

	// Handle unary minus: -expr (only if not followed by arithmetic)
	if strings.HasPrefix(expr, "-") {
		// Only apply as unary if the rest doesn't contain top-level operators
		rest := expr[1:]
		if findArithmeticOp(rest) < 0 && findComparisonOp(rest) < 0 && findLogicalOp(rest, "||") < 0 && findLogicalOp(rest, "&&") < 0 {
			val, err := evaluateCodeExpressionInternal(strings.TrimSpace(rest), vars, nextDepth)
			if err != nil {
				return nil, err
			}
			f, ok := toFloat64(val)
			if !ok {
				return nil, fmt.Errorf("cannot negate non-numeric value: %v", val)
			}
			if math.IsInf(f, 0) || math.IsNaN(f) {
				return nil, fmt.Errorf("cannot negate non-finite value: %v", f)
			}
			if f == float64(int(f)) && f >= float64(math.MinInt) && f <= float64(math.MaxInt) {
				return -int(f), nil
			}
			return -f, nil
		}
	}

	// Handle parenthesized expression: (expr)
	if strings.HasPrefix(expr, "(") {
		// Find the matching closing paren for the first (
		parenDepth := 0
		matchIdx := -1
		for i, ch := range expr {
			if ch == '(' {
				parenDepth++
			} else if ch == ')' {
				parenDepth--
				if parenDepth == 0 {
					matchIdx = i
					break
				}
			}
		}
		if matchIdx == len(expr)-1 {
			// The entire expression is wrapped in a single pair of parens
			inner := expr[1:matchIdx]
			return evaluateCodeExpressionInternal(inner, vars, nextDepth)
		}
	}

	// Handle arithmetic operators
	if idx := findArithmeticOp(expr); idx >= 0 {
		return evaluateArithmetic(expr, idx, vars, nextDepth)
	}

	// Handle string literals
	if len(expr) >= 2 && ((strings.HasPrefix(expr, "'") && strings.HasSuffix(expr, "'")) ||
		(strings.HasPrefix(expr, `"`) && strings.HasSuffix(expr, `"`))) {
		return expr[1 : len(expr)-1], nil
	}

	// Handle null
	if expr == "null" || expr == "nil" {
		return nil, nil
	}

	// Handle boolean
	if expr == "true" {
		return true, nil
	}
	if expr == "false" {
		return false, nil
	}

	// Handle number
	if f, err := strconv.ParseFloat(expr, 64); err == nil {
		if !math.IsInf(f, 0) && !math.IsNaN(f) && f >= float64(math.MinInt) && f <= float64(math.MaxInt) && f == float64(int(f)) && !strings.Contains(expr, ".") && !strings.Contains(expr, "e") {
			return int(f), nil
		}
		return f, nil
	}

	// Handle variable reference
	if val, ok := vars[expr]; ok {
		return val, nil
	}

	// Try array index: arr[0]
	if arrIdx := strings.Index(expr, "["); arrIdx > 0 && strings.HasSuffix(expr, "]") {
		arrName := expr[:arrIdx]
		indexStr := expr[arrIdx+1 : len(expr)-1]
		val, ok := vars[arrName]
		if !ok {
			return nil, fmt.Errorf("undefined variable: %s", arrName)
		}
		idx, err := strconv.Atoi(indexStr)
		if err != nil {
			return nil, fmt.Errorf("invalid array index: %s", indexStr)
		}
		switch a := val.(type) {
		case []any:
			if idx < 0 || idx >= len(a) {
				return nil, fmt.Errorf("array index %d out of bounds (len %d)", idx, len(a))
			}
			return a[idx], nil
		default:
			return nil, fmt.Errorf("cannot index non-array value of type %T", val)
		}
	}

	// Return as string literal (fallback)
	return expr, nil
}

// resolveCodeVariables replaces {{variable.key}} references and bare variable names in code.
func resolveCodeVariables(code string, vars map[string]any) string {
	if len(vars) == 0 {
		return code
	}

	// First resolve {{...}} template references
	result := templateExpr.ReplaceAllStringFunc(code, func(match string) string {
		inner := match[2 : len(match)-2]
		inner = strings.TrimSpace(inner)

		if val, ok := lookupVariable(vars, inner); ok {
			return formatCodeValue(val)
		}
		return match
	})

	return result
}

// lookupVariable looks up a dotted variable path in the variables map.
func lookupVariable(vars map[string]any, path string) (any, bool) {
	parts := strings.Split(path, ".")
	if len(parts) == 0 {
		return nil, false
	}

	val, ok := vars[parts[0]]
	if !ok {
		return nil, false
	}

	for _, part := range parts[1:] {
		switch m := val.(type) {
		case map[string]any:
			val, ok = m[part]
			if !ok {
				return nil, false
			}
		default:
			return nil, false
		}
	}

	return val, true
}

// formatCodeValue formats a value for embedding in code expressions.
func formatCodeValue(val any) string {
	switch v := val.(type) {
	case string:
		// Escape for embedding in expressions - backslash first, then quotes
		escaped := strings.ReplaceAll(v, "\\", "\\\\")
		escaped = strings.ReplaceAll(escaped, "'", "\\'")
		return "'" + escaped + "'"
	case nil:
		return "null"
	case bool:
		return strconv.FormatBool(v)
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	default:
		b, err := json.Marshal(v)
		if err != nil {
			return "null"
		}
		return string(b)
	}
}

// findTernarySeparator finds the ? in a ternary expression, skipping nested ternaries.
func findTernarySeparator(expr string) int {
	depth := 0
	inStr := false
	var strCh byte
	for i := 0; i < len(expr); i++ {
		ch := expr[i]
		if inStr {
			if ch == strCh && i > 0 && expr[i-1] != '\\' {
				inStr = false
			}
			continue
		}
		switch {
		case ch == '\'' || ch == '"':
			inStr = true
			strCh = ch
		case ch == '(' || ch == '[':
			depth++
		case ch == ')' || ch == ']':
			depth--
		case ch == '?' && depth == 0:
			return i
		}
	}
	return -1
}

// findTernaryColon finds the : separator in a ternary, skipping nested ternaries and strings.
func findTernaryColon(expr string, startFrom int) int {
	depth := 0
	inStr := false
	strChar := byte(0)
	for i := startFrom; i < len(expr); i++ {
		ch := expr[i]
		if inStr {
			if ch == strChar && i > 0 && expr[i-1] != '\\' {
				inStr = false
			}
			continue
		}
		if ch == '\'' || ch == '"' {
			inStr = true
			strChar = ch
			continue
		}
		switch {
		case ch == '(' || ch == '[':
			depth++
		case ch == ')' || ch == ']':
			depth--
		case ch == ':' && depth == 0:
			return i
		}
	}
	return -1
}

// evaluateTernary evaluates a ternary expression.
func evaluateTernary(expr string, questionIdx int, vars map[string]any, depth int) (any, error) {
	condition := strings.TrimSpace(expr[:questionIdx])
	colonIdx := findTernaryColon(expr, questionIdx+1)
	if colonIdx < 0 {
		return nil, fmt.Errorf("ternary expression missing ':' separator")
	}
	trueExpr := strings.TrimSpace(expr[questionIdx+1 : colonIdx])
	falseExpr := strings.TrimSpace(expr[colonIdx+1:])

	cond, err := evaluateCodeExpressionInternal(condition, vars, depth)
	if err != nil {
		return nil, fmt.Errorf("ternary condition error: %w", err)
	}

	if isTruthy(cond) {
		return evaluateCodeExpressionInternal(trueExpr, vars, depth)
	}
	return evaluateCodeExpressionInternal(falseExpr, vars, depth)
}

// findLogicalOp finds && or || at the top level (not inside parens/strings).
func findLogicalOp(expr string, op string) int {
	depth := 0
	inStr := false
	strChar := byte(0)
	opLen := len(op)
	for i := 0; i < len(expr)-opLen+1; i++ {
		ch := expr[i]
		if inStr {
			if ch == strChar && i > 0 && expr[i-1] != '\\' {
				inStr = false
			}
			continue
		}
		if ch == '\'' || ch == '"' {
			inStr = true
			strChar = ch
			continue
		}
		switch {
		case ch == '(':
			depth++
		case ch == ')':
			depth--
		case depth == 0 && expr[i:i+opLen] == op:
			return i
		}
	}
	return -1
}

// evaluateLogical evaluates a logical AND or OR expression.
func evaluateLogical(expr string, opIdx int, op string, vars map[string]any, depth int) (any, error) {
	left := strings.TrimSpace(expr[:opIdx])
	right := strings.TrimSpace(expr[opIdx+len(op):])

	leftVal, err := evaluateCodeExpressionInternal(left, vars, depth)
	if err != nil {
		return nil, err
	}

	switch op {
	case "||":
		if isTruthy(leftVal) {
			return leftVal, nil
		}
		return evaluateCodeExpressionInternal(right, vars, depth)
	case "&&":
		if !isTruthy(leftVal) {
			return leftVal, nil
		}
		return evaluateCodeExpressionInternal(right, vars, depth)
	}
	return nil, fmt.Errorf("unknown logical operator: %s", op)
}

// findComparisonOp finds a comparison operator at the top level.
func findComparisonOp(expr string) int {
	ops := []struct {
		op  string
		len int
	}{
		{">=", 2}, {"<=", 2}, {"==", 2}, {"!=", 2},
		{">", 1}, {"<", 1},
	}
	for _, o := range ops {
		idx := findTopLevelOp(expr, o.op)
		if idx >= 0 {
			return idx
		}
	}
	return -1
}

// findTopLevelOp finds an operator at the top level.
func findTopLevelOp(expr string, op string) int {
	depth := 0
	inStr := false
	strChar := byte(0)
	opLen := len(op)
	for i := 0; i < len(expr)-opLen+1; i++ {
		ch := expr[i]
		if inStr {
			if ch == strChar && i > 0 && expr[i-1] != '\\' {
				inStr = false
			}
			continue
		}
		if ch == '\'' || ch == '"' {
			inStr = true
			strChar = ch
			continue
		}
		switch {
		case ch == '(':
			depth++
		case ch == ')':
			depth--
		case depth == 0 && expr[i:i+opLen] == op:
			return i
		}
	}
	return -1
}

// evaluateComparison evaluates a comparison expression.
func evaluateComparison(expr string, opIdx int, vars map[string]any, depth int) (any, error) {
	// Determine operator length - check bounds first to prevent panic
	opLen := 1
	if opIdx+1 < len(expr) {
		if expr[opIdx:opIdx+2] == ">=" || expr[opIdx:opIdx+2] == "<=" || expr[opIdx:opIdx+2] == "==" || expr[opIdx:opIdx+2] == "!=" {
			opLen = 2
		}
	}

	op := expr[opIdx : opIdx+opLen]
	left := strings.TrimSpace(expr[:opIdx])
	right := strings.TrimSpace(expr[opIdx+opLen:])

	leftVal, err := evaluateCodeExpressionInternal(left, vars, depth)
	if err != nil {
		return nil, err
	}
	rightVal, err := evaluateCodeExpressionInternal(right, vars, depth)
	if err != nil {
		return nil, err
	}

	switch op {
	case "==":
		return compareEqual(leftVal, rightVal), nil
	case "!=":
		return !compareEqual(leftVal, rightVal), nil
	case ">":
		return compareOrdered(leftVal, ">", rightVal), nil
	case "<":
		return compareOrdered(leftVal, "<", rightVal), nil
	case ">=":
		return compareOrdered(leftVal, ">=", rightVal), nil
	case "<=":
		return compareOrdered(leftVal, "<=", rightVal), nil
	}
	return nil, fmt.Errorf("unknown comparison operator: %s", op)
}

// findArithmeticOp finds an arithmetic operator at the top level (+, -, *, /, %, **).
// Returns (index, operatorLength). Returns -1, 0 if not found.
func findArithmeticOp(expr string) int {
	depth := 0
	inStr := false
	strChar := byte(0)

	// Track last-seen operator at each precedence level.
	// For left-to-right evaluation of non-associative operators (-, /),
	// we must split at the rightmost lowest-precedence operator so the
	// recursive call on the left side handles earlier operators first.
	// Example: "10 - 3 - 2" splits at the last "-" → left="10 - 3", right="2"
	//   → left recurses to (10-3)=7 → 7-2=5 (correct, not 9).
	var addSubIdx, mulDivIdx, powIdx int
	addSubIdx = -1
	mulDivIdx = -1
	powIdx = -1

	for i := 0; i < len(expr); i++ {
		ch := expr[i]
		if inStr {
			if ch == strChar && i > 0 && expr[i-1] != '\\' {
				inStr = false
			}
			continue
		}
		if ch == '\'' || ch == '"' {
			inStr = true
			strChar = ch
			continue
		}
		switch {
		case ch == '(' || ch == '[':
			depth++
		case ch == ')' || ch == ']':
			depth--
		case depth == 0:
			// Check for ** first (before *)
			if ch == '*' && i+1 < len(expr) && expr[i+1] == '*' {
				if powIdx == -1 {
					powIdx = i
				}
				i++ // skip next *
				continue
			}
			if ch == '+' || ch == '-' {
				// Skip unary +/-
				if i == 0 {
					continue
				}
				prev := strings.TrimRight(expr[:i], " ")
				if len(prev) == 0 {
					continue
				}
				lastCh := prev[len(prev)-1]
				if lastCh == '(' || lastCh == '[' || lastCh == ',' || lastCh == '=' || lastCh == '!' || lastCh == '<' || lastCh == '>' {
					continue
				}
				addSubIdx = i // track rightmost for correct left-to-right evaluation
			}
			if ch == '*' && powIdx == -1 {
				mulDivIdx = i // track rightmost for correct left-to-right evaluation
			}
			if ch == '/' || ch == '%' {
				mulDivIdx = i // track rightmost for correct left-to-right evaluation
			}
		}
	}

	// Return rightmost lowest-precedence operator for correct left-to-right evaluation
	if addSubIdx >= 0 {
		return addSubIdx
	}
	if mulDivIdx >= 0 {
		return mulDivIdx
	}
	if powIdx >= 0 {
		return powIdx
	}
	return -1
}

// evaluateArithmetic evaluates an arithmetic expression.
func evaluateArithmetic(expr string, opIdx int, vars map[string]any, depth int) (any, error) {
	// Determine operator
	opLen := 1
	op := string(expr[opIdx])
	if opIdx+1 < len(expr) && expr[opIdx+1] == '*' && op == "*" {
		op = "**"
		opLen = 2
	}

	left := strings.TrimSpace(expr[:opIdx])
	right := strings.TrimSpace(expr[opIdx+opLen:])

	leftVal, err := evaluateCodeExpressionInternal(left, vars, depth)
	if err != nil {
		return nil, err
	}
	rightVal, err := evaluateCodeExpressionInternal(right, vars, depth)
	if err != nil {
		return nil, err
	}

	lf, lok := toFloat64(leftVal)
	rf, rok := toFloat64(rightVal)
	if !lok || !rok {
		return nil, fmt.Errorf("arithmetic requires numeric operands, got %T and %T", leftVal, rightVal)
	}

	var result float64
	switch op {
	case "+":
		result = lf + rf
	case "-":
		result = lf - rf
	case "*":
		result = lf * rf
	case "/":
		if rf == 0 {
			return nil, fmt.Errorf("division by zero")
		}
		result = lf / rf
	case "%":
		if rf == 0 {
			return nil, fmt.Errorf("modulo by zero")
		}
		result = math.Mod(lf, rf)
	case "**":
		result = math.Pow(lf, rf)
	default:
		return nil, fmt.Errorf("unknown arithmetic operator: %s", op)
	}

	// Return int if result is a whole number
	if !math.IsInf(result, 0) && !math.IsNaN(result) && result >= float64(math.MinInt) && result <= float64(math.MaxInt) && result == float64(int(result)) {
		return int(result), nil
	}
	return result, nil
}

// evaluateCodeFunction evaluates a function call expression.
func evaluateCodeFunction(expr string, vars map[string]any, depth int) (any, error) {
	parenIdx := strings.Index(expr, "(")
	funcName := strings.TrimSpace(expr[:parenIdx])

	// Find matching closing paren
	argsStart := parenIdx + 1
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
		return nil, fmt.Errorf("unmatched parenthesis in function call")
	}

	argsStr := expr[argsStart:argsEnd]
	args := parseTemplateArgs(argsStr)

	switch strings.ToLower(funcName) {
	case "abs":
		if len(args) != 1 {
			return nil, fmt.Errorf("abs() requires 1 argument")
		}
		val, err := evalCodeArg(args[0], vars, depth)
		if err != nil {
			return nil, err
		}
		f, ok := toFloat64(val)
		if !ok {
			return nil, fmt.Errorf("abs() requires numeric argument")
		}
		return math.Abs(f), nil

	case "ceil":
		if len(args) != 1 {
			return nil, fmt.Errorf("ceil() requires 1 argument")
		}
		val, err := evalCodeArg(args[0], vars, depth)
		if err != nil {
			return nil, err
		}
		f, ok := toFloat64(val)
		if !ok {
			return nil, fmt.Errorf("ceil() requires numeric argument")
		}
		cf := math.Ceil(f)
		if math.IsInf(cf, 0) || math.IsNaN(cf) || cf > float64(math.MaxInt) || cf < float64(math.MinInt) {
			return cf, nil // return as float64 for out-of-range
		}
		return int(cf), nil

	case "floor":
		if len(args) != 1 {
			return nil, fmt.Errorf("floor() requires 1 argument")
		}
		val, err := evalCodeArg(args[0], vars, depth)
		if err != nil {
			return nil, err
		}
		f, ok := toFloat64(val)
		if !ok {
			return nil, fmt.Errorf("floor() requires numeric argument")
		}
		ff := math.Floor(f)
		if math.IsInf(ff, 0) || math.IsNaN(ff) || ff > float64(math.MaxInt) || ff < float64(math.MinInt) {
			return ff, nil // return as float64 for out-of-range
		}
		return int(ff), nil

	case "round":
		if len(args) != 1 {
			return nil, fmt.Errorf("round() requires 1 argument")
		}
		val, err := evalCodeArg(args[0], vars, depth)
		if err != nil {
			return nil, err
		}
		f, ok := toFloat64(val)
		if !ok {
			return nil, fmt.Errorf("round() requires numeric argument")
		}
		rf := math.Round(f)
		if math.IsInf(rf, 0) || math.IsNaN(rf) || rf > float64(math.MaxInt) || rf < float64(math.MinInt) {
			return rf, nil // return as float64 for out-of-range
		}
		return int(rf), nil

	case "min":
		if len(args) != 2 {
			return nil, fmt.Errorf("min() requires 2 arguments")
		}
		a, err := evalCodeArg(args[0], vars, depth)
		if err != nil {
			return nil, err
		}
		b, err := evalCodeArg(args[1], vars, depth)
		if err != nil {
			return nil, err
		}
		af, aok := toFloat64(a)
		bf, bok := toFloat64(b)
		if !aok || !bok {
			return nil, fmt.Errorf("min() requires numeric arguments")
		}
		if af < bf {
			return af, nil
		}
		return bf, nil

	case "max":
		if len(args) != 2 {
			return nil, fmt.Errorf("max() requires 2 arguments")
		}
		a, err := evalCodeArg(args[0], vars, depth)
		if err != nil {
			return nil, err
		}
		b, err := evalCodeArg(args[1], vars, depth)
		if err != nil {
			return nil, err
		}
		af, aok := toFloat64(a)
		bf, bok := toFloat64(b)
		if !aok || !bok {
			return nil, fmt.Errorf("max() requires numeric arguments")
		}
		if af > bf {
			return af, nil
		}
		return bf, nil

	case "pow":
		if len(args) != 2 {
			return nil, fmt.Errorf("pow() requires 2 arguments")
		}
		base, err := evalCodeArg(args[0], vars, depth)
		if err != nil {
			return nil, err
		}
		exp, err := evalCodeArg(args[1], vars, depth)
		if err != nil {
			return nil, err
		}
		bf, bok := toFloat64(base)
		ef, eok := toFloat64(exp)
		if !bok || !eok {
			return nil, fmt.Errorf("pow() requires numeric arguments")
		}
		result := math.Pow(bf, ef)
		if !math.IsInf(result, 0) && !math.IsNaN(result) && result >= float64(math.MinInt) && result <= float64(math.MaxInt) && result == float64(int(result)) {
			return int(result), nil
		}
		return result, nil

	case "sqrt":
		if len(args) != 1 {
			return nil, fmt.Errorf("sqrt() requires 1 argument")
		}
		val, err := evalCodeArg(args[0], vars, depth)
		if err != nil {
			return nil, err
		}
		f, ok := toFloat64(val)
		if !ok {
			return nil, fmt.Errorf("sqrt() requires numeric argument")
		}
		if f < 0 {
			return nil, fmt.Errorf("sqrt() requires non-negative argument")
		}
		result := math.Sqrt(f)
		if !math.IsInf(result, 0) && !math.IsNaN(result) && result >= float64(math.MinInt) && result <= float64(math.MaxInt) && result == float64(int(result)) {
			return int(result), nil
		}
		return result, nil

	case "len":
		if len(args) != 1 {
			return nil, fmt.Errorf("len() requires 1 argument")
		}
		val, err := evalCodeArg(args[0], vars, depth)
		if err != nil {
			return nil, err
		}
		switch v := val.(type) {
		case string:
			return len(v), nil
		case []any:
			return len(v), nil
		case map[string]any:
			return len(v), nil
		default:
			return len(toString(val)), nil
		}

	case "substr":
		if len(args) != 3 {
			return nil, fmt.Errorf("substr() requires 3 arguments (string, start, end)")
		}
		val, err := evalCodeArg(args[0], vars, depth)
		if err != nil {
			return nil, err
		}
		startVal, err := evalCodeArg(args[1], vars, depth)
		if err != nil {
			return nil, err
		}
		endVal, err := evalCodeArg(args[2], vars, depth)
		if err != nil {
			return nil, err
		}
		s := toString(val)
		start, ok := toFloat64(startVal)
		if !ok {
			return nil, fmt.Errorf("substr() start must be numeric")
		}
		end, ok := toFloat64(endVal)
		if !ok {
			return nil, fmt.Errorf("substr() end must be numeric")
		}
		// Guard against Inf/NaN which would cause undefined int() behavior
		if math.IsInf(start, 0) || math.IsNaN(start) || math.IsInf(end, 0) || math.IsNaN(end) {
			return nil, fmt.Errorf("substr() start/end must be finite numbers")
		}
		si, ei := int(start), int(end)
		if si < 0 || ei > len(s) || si >= ei {
			return s, nil
		}
		return s[si:ei], nil

	case "indexof", "index_of":
		if len(args) != 2 {
			return nil, fmt.Errorf("indexOf() requires 2 arguments")
		}
		val, err := evalCodeArg(args[0], vars, depth)
		if err != nil {
			return nil, err
		}
		sub, err := evalCodeArg(args[1], vars, depth)
		if err != nil {
			return nil, err
		}
		return strings.Index(toString(val), toString(sub)), nil

	case "int":
		if len(args) != 1 {
			return nil, fmt.Errorf("int() requires 1 argument")
		}
		val, err := evalCodeArg(args[0], vars, depth)
		if err != nil {
			return nil, err
		}
		f, ok := toFloat64(val)
		if !ok {
			return 0, nil
		}
		// Guard against Inf/NaN/overflow which would cause undefined behavior
		if math.IsInf(f, 0) || math.IsNaN(f) || f > float64(math.MaxInt) || f < float64(math.MinInt) {
			return nil, fmt.Errorf("int(): value %v out of range", f)
		}
		return int(f), nil

	case "float":
		if len(args) != 1 {
			return nil, fmt.Errorf("float() requires 1 argument")
		}
		val, err := evalCodeArg(args[0], vars, depth)
		if err != nil {
			return nil, err
		}
		f, ok := toFloat64(val)
		if !ok {
			return 0.0, nil
		}
		return f, nil

	case "str":
		if len(args) != 1 {
			return nil, fmt.Errorf("str() requires 1 argument")
		}
		val, err := evalCodeArg(args[0], vars, depth)
		if err != nil {
			return nil, err
		}
		return toString(val), nil

	case "json_parse":
		if len(args) != 1 {
			return nil, fmt.Errorf("json_parse() requires 1 argument")
		}
		val, err := evalCodeArg(args[0], vars, depth)
		if err != nil {
			return nil, err
		}
		var result any
		if err := json.Unmarshal([]byte(toString(val)), &result); err != nil {
			return nil, fmt.Errorf("json_parse() failed: %w", err)
		}
		return result, nil

	case "json_stringify":
		if len(args) != 1 {
			return nil, fmt.Errorf("json_stringify() requires 1 argument")
		}
		val, err := evalCodeArg(args[0], vars, depth)
		if err != nil {
			return nil, err
		}
		b, err := json.Marshal(val)
		if err != nil {
			return nil, fmt.Errorf("json_stringify() failed: %w", err)
		}
		return string(b), nil

	default:
		return nil, fmt.Errorf("unknown function: %s", funcName)
	}
}

// evalCodeArg evaluates a single function argument.
func evalCodeArg(arg string, vars map[string]any, depth int) (any, error) {
	arg = strings.TrimSpace(arg)
	if arg == "" {
		return "", nil
	}

	// Strip quotes
	if len(arg) >= 2 && ((strings.HasPrefix(arg, "'") && strings.HasSuffix(arg, "'")) ||
		(strings.HasPrefix(arg, `"`) && strings.HasSuffix(arg, `"`))) {
		return arg[1 : len(arg)-1], nil
	}

	// Try as number
	if f, err := strconv.ParseFloat(arg, 64); err == nil {
		// Guard against Inf/NaN/overflow before int() conversion
		if !math.IsInf(f, 0) && !math.IsNaN(f) && f >= float64(math.MinInt) && f <= float64(math.MaxInt) && f == float64(int(f)) && !strings.Contains(arg, ".") {
			return int(f), nil
		}
		return f, nil
	}

	// Try as boolean
	if arg == "true" {
		return true, nil
	}
	if arg == "false" {
		return false, nil
	}
	if arg == "null" || arg == "nil" {
		return nil, nil
	}

	// Try as variable
	if val, ok := vars[arg]; ok {
		return val, nil
	}

	// Try as code expression
	return evaluateCodeExpressionInternal(arg, vars, depth)
}

// codeTypeOf returns the type name of a value.
func codeTypeOf(val any) string {
	if val == nil {
		return "null"
	}
	switch val.(type) {
	case bool:
		return "boolean"
	case int, int64, int32, float64, float32:
		return "number"
	case string:
		return "string"
	case []any:
		return "array"
	case map[string]any:
		return "object"
	default:
		return "unknown"
	}
}
