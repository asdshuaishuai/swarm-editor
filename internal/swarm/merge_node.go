// Package swarm provides Merge Node for workflow execution.
// Inspired by n8n Merge Node and Dify parallel branch convergence:
//   - Multiple input modes: append, combine by position, choose branch, wait all
//   - Collects results from upstream nodes
//   - Supports array concatenation, object merging, and first-available selection
package swarm

import (
	"fmt"
)

// MergeMode defines how upstream results are merged.
type MergeMode string

const (
	// MergeAppend concatenates all upstream results into an array.
	MergeAppend MergeMode = "append"

	// MergeCombine merges upstream result maps by key (later values override).
	MergeCombine MergeMode = "combine"

	// MergeChooseBranch takes the first available non-empty result.
	MergeChooseBranch MergeMode = "choose_branch"

	// MergeWaitAll waits for all upstream nodes and returns all results.
	MergeWaitAll MergeMode = "wait_all"
)

var validMergeModes = map[MergeMode]bool{
	MergeAppend:       true,
	MergeCombine:      true,
	MergeChooseBranch: true,
	MergeWaitAll:      true,
}

// MergeResult represents the output of a merge node.
type MergeResult struct {
	Mode    MergeMode `json:"mode"`
	Results []any     `json:"results"`
	Merged  any       `json:"merged"`
	Count   int       `json:"count"`
}

// ExecuteMergeNode merges results from upstream nodes.
//
// Config fields:
//   - mode (string): Merge mode (default: "append")
//     - "append": concatenate all results into an array
//     - "combine": merge all result maps into one (later overrides earlier)
//     - "choose_branch": take the first non-nil result
//     - "wait_all": collect all results as-is
//   - inputs ([]any): Upstream node results to merge
//
// In graph mode, inputs are automatically collected from upstream nodes.
// In other modes, inputs can be explicitly provided.
func ExecuteMergeNode(config map[string]any) (*MergeResult, error) {
	mode := MergeMode(getStringConfig(config, "mode", "append"))
	if !validMergeModes[mode] {
		return nil, fmt.Errorf("merge node: invalid mode %q, valid: append, combine, choose_branch, wait_all", mode)
	}

	// Collect inputs
	var inputs []any
	if v, ok := config["inputs"]; ok {
		if arr, ok := v.([]any); ok {
			inputs = arr
		}
	}

	result, merged := mergeResults(inputs, mode)

	return &MergeResult{
		Mode:    mode,
		Results: result,
		Merged:  merged,
		Count:   len(result),
	}, nil
}

// mergeResults performs the actual merge based on mode.
func mergeResults(inputs []any, mode MergeMode) (results []any, merged any) {
	switch mode {
	case MergeAppend:
		return appendMerge(inputs)
	case MergeCombine:
		return combineMerge(inputs)
	case MergeChooseBranch:
		return chooseMerge(inputs)
	case MergeWaitAll:
		return waitAllMerge(inputs)
	default:
		return appendMerge(inputs)
	}
}

// appendMerge concatenates all inputs into a flat array.
func appendMerge(inputs []any) (results []any, merged any) {
	var flat []any
	for _, input := range inputs {
		switch v := input.(type) {
		case []any:
			for _, item := range v {
				flat = append(flat, deepCopyAny(item))
			}
		case nil:
			// Skip nil inputs
		default:
			flat = append(flat, deepCopyAny(v))
		}
	}
	if flat == nil {
		flat = []any{}
	}
	return inputs, flat
}

// combineMerge merges all map inputs into a single map (later values override).
func combineMerge(inputs []any) (results []any, merged any) {
	combined := make(map[string]any)
	for _, input := range inputs {
		if m, ok := input.(map[string]any); ok {
			for k, v := range m {
				combined[k] = deepCopyAny(v)
			}
		}
	}
	return inputs, combined
}

// chooseMerge takes the first non-nil result (deep copied).
func chooseMerge(inputs []any) (results []any, merged any) {
	for _, input := range inputs {
		if input != nil {
			return inputs, deepCopyAny(input) // deep copy to prevent data pollution
		}
	}
	return inputs, nil
}

// waitAllMerge returns all inputs deep-copied.
func waitAllMerge(inputs []any) (results []any, merged any) {
	if inputs == nil {
		inputs = []any{}
	}
	copied := make([]any, len(inputs))
	for i, v := range inputs {
		copied[i] = deepCopyAny(v)
	}
	return inputs, copied
}
