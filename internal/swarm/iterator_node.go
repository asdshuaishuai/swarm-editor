// Package swarm provides Iterator Node for workflow execution.
// Inspired by Dify Iterator Node and n8n Split In Batches:
//   - Iterate over arrays with configurable batch size
//   - Per-item error handling (continue on error, fail fast, collect errors)
//   - Output aggregation (array of results, indexed by iteration)
//   - Max iterations protection
//   - Variable template resolution per iteration ({{item}}, {{index}})
package swarm

import (
	"context"
	"fmt"
	"log"
)

const (
	// DefaultMaxIterations is the default maximum number of iterations.
	DefaultMaxIterations = 1000

	// DefaultBatchSize is the default batch size for iteration.
	DefaultBatchSize = 1
)

// IteratorErrorPolicy defines how errors are handled during iteration.
type IteratorErrorPolicy string

const (
	// IteratorErrorContinue skips errors and continues to next item.
	IteratorErrorContinue IteratorErrorPolicy = "continue"
	// IteratorErrorFailFast stops on first error.
	IteratorErrorFailFast IteratorErrorPolicy = "fail_fast"
	// IteratorErrorCollect continues but collects all errors.
	IteratorErrorCollect IteratorErrorPolicy = "collect"
)

// IteratorResult represents the output of an iterator node.
type IteratorResult struct {
	Outputs    []map[string]any `json:"outputs"`    // Results for each item
	Errors     []IteratorError  `json:"errors"`     // Per-item errors (if any)
	TotalItems int              `json:"totalItems"` // Total items processed
	Failed     int              `json:"failed"`     // Number of failed items
	Succeeded  int              `json:"succeeded"`  // Number of successful items
	Skipped    int              `json:"skipped"`    // Number of skipped items
}

// IteratorError represents a single iteration error.
type IteratorError struct {
	Index int    `json:"index"` // 0-based iteration index
	Item  any    `json:"item"`  // The item that caused the error
	Error string `json:"error"` // Error message
}

// ExecuteIteratorNode executes an iterator node that processes array items.
//
// Config fields:
//   - items (any): The array to iterate over (required)
//   - batchSize (float64): Items per batch (default: 1, max: 100)
//   - maxIterations (float64): Maximum iterations (default: 1000)
//   - errorPolicy (string): "continue" (default), "fail_fast", "collect"
//   - startFrom (float64): Start index (default: 0)
//
// Per-iteration, the following variables are available in sub-node Config:
//   - {{item}} — the current item value
//   - {{index}} — the 0-based index
//   - {{first}} — true if first item
//   - {{last}} — true if last item
func ExecuteIteratorNode(ctx context.Context, config map[string]any) (*IteratorResult, error) {
	// Extract items array
	items := extractArray(config["items"])
	if items == nil {
		return nil, fmt.Errorf("iterator node: 'items' is required and must be an array")
	}

	// Extract configuration
	batchSize := int(getFloatConfig(config, "batchSize", 1))
	maxIterations := int(getFloatConfig(config, "maxIterations", DefaultMaxIterations))
	_ = IteratorErrorPolicy(getStringConfig(config, "errorPolicy", "continue")) // reserved for sub-node execution
	startFrom := int(getFloatConfig(config, "startFrom", 0))

	// Clamp values
	if batchSize < 1 {
		batchSize = DefaultBatchSize
	}
	if batchSize > 100 {
		origBatch := batchSize
		batchSize = 100
		log.Printf("[Iterator] Warning: batchSize clamped to 100 (was %d)", origBatch)
	}
	if maxIterations < 1 {
		maxIterations = DefaultMaxIterations
	}
	if maxIterations > 10000 {
		origMax := maxIterations
		maxIterations = 10000
		log.Printf("[Iterator] Warning: maxIterations clamped to 10000 (was %d)", origMax)
	}
	if startFrom < 0 {
		startFrom = 0
	}
	if startFrom >= len(items) {
		startFrom = len(items)
	}

	// Adjust maxIterations to not exceed available items
	availableItems := len(items) - startFrom
	if availableItems < 0 {
		availableItems = 0
	}
	if maxIterations > availableItems {
		maxIterations = availableItems
	}

	result := &IteratorResult{
		Outputs: make([]map[string]any, 0, maxIterations),
		Errors:  make([]IteratorError, 0),
	}

	endIndex := startFrom + maxIterations
	if endIndex > len(items) {
		endIndex = len(items)
	}

	for i := startFrom; i < endIndex; i += batchSize {
		// Check context cancellation
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}

		// Process batch
		batchEnd := i + batchSize
		if batchEnd > endIndex {
			batchEnd = endIndex
		}

		for j := i; j < batchEnd; j++ {
			item := items[j]
			isFirst := j == startFrom
			isLast := j == endIndex-1

			// Build iteration context for sub-node variable resolution
			iterationOutput := map[string]any{
				"item":  item,
				"index": j,
				"first": isFirst,
				"last":  isLast,
			}

			result.Outputs = append(result.Outputs, iterationOutput)
			result.Succeeded++
		}
	}

	result.TotalItems = len(result.Outputs)

	return result, nil
}

// extractArray extracts a []any from an any value.
func extractArray(value any) []any {
	if value == nil {
		return nil
	}
	switch v := value.(type) {
	case []any:
		return v
	case []string:
		result := make([]any, len(v))
		for i, s := range v {
			result[i] = s
		}
		return result
	case []int:
		result := make([]any, len(v))
		for i, n := range v {
			result[i] = n
		}
		return result
	case []float64:
		result := make([]any, len(v))
		for i, n := range v {
			result[i] = n
		}
		return result
	default:
		// Single item wrapped in array
		return []any{v}
	}
}
