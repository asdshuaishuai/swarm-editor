// Package swarm provides Variable Aggregator Node for workflow execution.
// Inspired by Dify Variable Aggregator and n8n merge strategies:
//   - Collects outputs from multiple upstream parallel branches
//   - Multiple aggregation strategies: concat, first, last, merge_maps, count, join
//   - Type-aware aggregation with fallback handling
//   - Automatic upstream result collection in graph mode
package swarm

import (
	"context"
	"fmt"
	"math"
	"strings"
)

// AggregatorStrategy defines how upstream results are aggregated.
type AggregatorStrategy string

const (
	// AggConcat concatenates all results into an array.
	AggConcat AggregatorStrategy = "concat"

	// AggFirst takes the first non-empty result.
	AggFirst AggregatorStrategy = "first"

	// AggLast takes the last non-empty result.
	AggLast AggregatorStrategy = "last"

	// AggMergeMaps merges all map results into one (later overrides earlier).
	AggMergeMaps AggregatorStrategy = "merge_maps"

	// AggCount counts the number of non-empty results.
	AggCount AggregatorStrategy = "count"

	// AggJoin joins all string results with a separator.
	AggJoin AggregatorStrategy = "join"

	// AggSum sums all numeric results.
	AggSum AggregatorStrategy = "sum"

	// AggAvg averages all numeric results.
	AggAvg AggregatorStrategy = "avg"

	// AggMin takes the minimum numeric result.
	AggMin AggregatorStrategy = "min"

	// AggMax takes the maximum numeric result.
	AggMax AggregatorStrategy = "max"
)

var validAggregatorStrategies = map[AggregatorStrategy]bool{
	AggConcat:    true,
	AggFirst:     true,
	AggLast:      true,
	AggMergeMaps: true,
	AggCount:     true,
	AggJoin:      true,
	AggSum:       true,
	AggAvg:       true,
	AggMin:       true,
	AggMax:       true,
}

// AggregatorResult represents the output of an aggregator node.
type AggregatorResult struct {
	Strategy AggregatorStrategy `json:"strategy"`
	Count    int                `json:"count"`
	Result   any                `json:"result"`
	Items    []any              `json:"items,omitempty"`
}

// ExecuteAggregatorNode aggregates results from upstream nodes.
//
// Config fields:
//   - strategy (string): Aggregation strategy (default: "concat")
//   - inputs ([]any): Explicit upstream results to aggregate
//   - separator (string): Separator for "join" strategy (default: ", ")
//   - key (string): For merge_maps, extract sub-key from maps
//   - skip_empty (bool): Skip nil/empty results (default: true)
//
// In graph mode, inputs are automatically collected from upstream nodes.
func ExecuteAggregatorNode(ctx context.Context, config map[string]any) (*AggregatorResult, error) {
	// Check for context cancellation
	if err := ctx.Err(); err != nil {
		return nil, fmt.Errorf("aggregator node: context cancelled: %w", err)
	}

	strategy := AggregatorStrategy(getStringConfig(config, "strategy", "concat"))
	if !validAggregatorStrategies[strategy] {
		return nil, fmt.Errorf("aggregator node: invalid strategy %q, valid: concat, first, last, merge_maps, count, join, sum, avg, min, max", strategy)
	}

	// Extract separator for join strategy
	separator := getStringConfig(config, "separator", ", ")

	// Extract key for merge_maps strategy
	key := getStringConfig(config, "key", "")

	// Whether to skip empty results
	skipEmpty := getBoolConfig(config, "skip_empty", true)

	// Collect inputs
	var inputs []any
	if v, ok := config["inputs"]; ok {
		if arr, ok := v.([]any); ok {
			inputs = arr
		}
	}

	// Filter inputs
	var filtered []any
	for _, input := range inputs {
		if skipEmpty && isEmptyValue(input) {
			continue
		}
		filtered = append(filtered, input)
	}

	// Aggregate
	result := aggregateByStrategy(filtered, strategy, separator, key)

	return &AggregatorResult{
		Strategy: strategy,
		Count:    len(filtered),
		Result:   result,
		Items:    filtered,
	}, nil
}

// aggregateByStrategy performs aggregation based on strategy.
func aggregateByStrategy(inputs []any, strategy AggregatorStrategy, separator string, key string) any {
	switch strategy {
	case AggConcat:
		return aggregateConcat(inputs)
	case AggFirst:
		return aggregateFirst(inputs)
	case AggLast:
		return aggregateLast(inputs)
	case AggMergeMaps:
		return aggregateMergeMaps(inputs, key)
	case AggCount:
		return len(inputs)
	case AggJoin:
		return aggregateJoin(inputs, separator)
	case AggSum:
		return aggregateSum(inputs)
	case AggAvg:
		return aggregateAvg(inputs)
	case AggMin:
		return aggregateMin(inputs)
	case AggMax:
		return aggregateMax(inputs)
	default:
		return aggregateConcat(inputs)
	}
}

// aggregateConcat concatenates all results into a flat array.
func aggregateConcat(inputs []any) any {
	var result []any
	for _, input := range inputs {
		switch v := input.(type) {
		case []any:
			result = append(result, v...)
		default:
			result = append(result, v)
		}
	}
	if result == nil {
		return []any{}
	}
	return result
}

// aggregateFirst takes the first non-empty result.
func aggregateFirst(inputs []any) any {
	for _, input := range inputs {
		if !isEmptyValue(input) {
			return input
		}
	}
	return nil
}

// aggregateLast takes the last non-empty result.
func aggregateLast(inputs []any) any {
	for i := len(inputs) - 1; i >= 0; i-- {
		if !isEmptyValue(inputs[i]) {
			return inputs[i]
		}
	}
	return nil
}

// aggregateMergeMaps merges all map results into one.
// If key is specified, only the sub-key value is merged.
func aggregateMergeMaps(inputs []any, key string) any {
	combined := make(map[string]any)
	for _, input := range inputs {
		m, ok := input.(map[string]any)
		if !ok {
			continue
		}
		if key != "" {
			// Extract sub-key value
			if subVal, ok := m[key]; ok {
				combined[key] = deepCopyAny(subVal)
			}
		} else {
			// Merge entire map
			for k, v := range m {
				combined[k] = deepCopyAny(v)
			}
		}
	}
	return combined
}

// aggregateJoin joins all string results with a separator.
func aggregateJoin(inputs []any, separator string) any {
	parts := make([]string, 0, len(inputs))
	for _, input := range inputs {
		s := toString(input)
		if s != "" {
			parts = append(parts, s)
		}
	}
	return strings.Join(parts, separator)
}

// aggregateSum sums all numeric results.
func aggregateSum(inputs []any) any {
	var sum float64
	count := 0
	for _, input := range inputs {
		f, ok := toFloat64(input)
		if ok {
			sum += f
			count++
		}
	}
	if count == 0 {
		return 0.0
	}
	// Return int if result is whole number and fits in int range
	// Check IsInf BEFORE int() conversion to avoid undefined behavior
	if !math.IsInf(sum, 0) && sum == float64(int(sum)) && sum >= float64(math.MinInt) && sum <= float64(math.MaxInt) {
		return int(sum)
	}
	return sum
}

// aggregateAvg averages all numeric results.
func aggregateAvg(inputs []any) any {
	var sum float64
	count := 0
	for _, input := range inputs {
		f, ok := toFloat64(input)
		if ok {
			sum += f
			count++
		}
	}
	if count == 0 {
		return 0.0
	}
	return sum / float64(count)
}

// aggregateMin takes the minimum numeric result.
func aggregateMin(inputs []any) any {
	var min float64
	first := true
	for _, input := range inputs {
		f, ok := toFloat64(input)
		if ok {
			if first || f < min {
				min = f
				first = false
			}
		}
	}
	if first {
		return nil
	}
	// Return int if result is whole number and fits in int range
	// Check IsInf BEFORE int() conversion to avoid undefined behavior
	if !math.IsInf(min, 0) && min == float64(int(min)) && min >= float64(math.MinInt) && min <= float64(math.MaxInt) {
		return int(min)
	}
	return min
}

// aggregateMax takes the maximum numeric result.
func aggregateMax(inputs []any) any {
	var max float64
	first := true
	for _, input := range inputs {
		f, ok := toFloat64(input)
		if ok {
			if first || f > max {
				max = f
				first = false
			}
		}
	}
	if first {
		return nil
	}
	// Return int if result is whole number and fits in int range
	// Check IsInf BEFORE int() conversion to avoid undefined behavior
	if !math.IsInf(max, 0) && max == float64(int(max)) && max >= float64(math.MinInt) && max <= float64(math.MaxInt) {
		return int(max)
	}
	return max
}

// isEmptyValue checks if a value is considered empty for aggregation purposes.
func isEmptyValue(val any) bool {
	if val == nil {
		return true
	}
	switch v := val.(type) {
	case string:
		return v == ""
	case []any:
		return len(v) == 0
	case map[string]any:
		return len(v) == 0
	case float64:
		return v == 0
	case int:
		return v == 0
	case bool:
		return !v
	}
	return false
}
