// Package swarm implements loop detection for agent execution.
// Inspired by AutoGen's "no progress" termination condition where
// consecutive messages with identical or near-identical content indicate
// the agent is stuck in a loop and should be terminated.
package swarm

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"sync"
)

// LoopDetector detects when an agent produces identical or near-identical
// outputs consecutively, indicating it's stuck in a loop.
// Inspired by AutoGen's composite termination conditions:
// should_terminate(msg) composes multiple conditions with AND/OR logic,
// including a "no progress" detector that hashes recent messages.
type LoopDetector struct {
	mu sync.Mutex

	// history stores hashes of recent outputs for deduplication
	history []string

	// contentHistory stores the actual content for Jaccard similarity comparison
	contentHistory []string

	// maxHistory is how many recent outputs to track
	maxHistory int

	// maxConsecutiveDuplicates is the threshold for triggering a loop alert
	maxConsecutiveDuplicates int

	// similarityThreshold is the min Jaccard similarity (0-1) to consider
	// two outputs "near-identical". 0 means exact match only.
	similarityThreshold float64
}

// NewLoopDetector creates a loop detector with sensible defaults.
// maxHistory=5 tracks the last 5 outputs per task.
// maxConsecutiveDuplicates=3 triggers after 3 identical outputs.
func NewLoopDetector() *LoopDetector {
	return &LoopDetector{
		history:                  make([]string, 0, 5),
		contentHistory:           make([]string, 0, 5),
		maxHistory:               5,
		maxConsecutiveDuplicates: 3,
		similarityThreshold:      0,
	}
}

// CheckOutput checks if the output indicates a loop.
// Returns (isLoop, reason) where isLoop is true if a loop is detected.
func (ld *LoopDetector) CheckOutput(content string) (bool, string) {
	if content == "" {
		return false, ""
	}

	ld.mu.Lock()
	defer ld.mu.Unlock()

	hash := hashContent(content)

	// Add to history first (bounded) so we count the current output
	ld.history = append(ld.history, hash)
	ld.contentHistory = append(ld.contentHistory, content)
	if len(ld.history) > ld.maxHistory {
		ld.history = ld.history[len(ld.history)-ld.maxHistory:]
		ld.contentHistory = ld.contentHistory[len(ld.contentHistory)-ld.maxHistory:]
	}

	// Check for exact duplicates at the end of history
	consecutiveDuplicates := 1 // count current output
	for i := len(ld.history) - 2; i >= 0; i-- {
		if ld.history[i] == hash {
			consecutiveDuplicates++
		} else {
			break
		}
	}

	if consecutiveDuplicates >= ld.maxConsecutiveDuplicates {
		return true, fmt.Sprintf(
			"loop detected: %d consecutive identical outputs (content hash: %s)",
			consecutiveDuplicates, hash[:8])
	}

	// Check for near-identical outputs using Jaccard similarity
	if ld.similarityThreshold > 0 && consecutiveDuplicates < 2 && len(ld.contentHistory) >= 2 {
		prevContent := ld.contentHistory[len(ld.contentHistory)-2]
		if isNearDuplicate(content, prevContent) {
			return true, fmt.Sprintf(
				"near-loop detected: output is very similar to previous (hash: %s)",
				hash[:8])
		}
	}

	return false, ""
}

// Reset clears the output history
func (ld *LoopDetector) Reset() {
	ld.mu.Lock()
	defer ld.mu.Unlock()
	ld.history = ld.history[:0]
	ld.contentHistory = ld.contentHistory[:0]
}

// SetMaxConsecutiveDuplicates configures the duplicate threshold
func (ld *LoopDetector) SetMaxConsecutiveDuplicates(n int) {
	ld.mu.Lock()
	defer ld.mu.Unlock()
	ld.maxConsecutiveDuplicates = n
}

// SetMaxHistory configures how many outputs to track
func (ld *LoopDetector) SetMaxHistory(n int) {
	ld.mu.Lock()
	defer ld.mu.Unlock()
	ld.maxHistory = n
}

// SetSimilarityThreshold configures the Jaccard similarity threshold for near-duplicate detection
func (ld *LoopDetector) SetSimilarityThreshold(t float64) {
	ld.mu.Lock()
	defer ld.mu.Unlock()
	ld.similarityThreshold = t
}

// ConsecutiveCount returns the current count of consecutive duplicate outputs
func (ld *LoopDetector) ConsecutiveCount() int {
	ld.mu.Lock()
	defer ld.mu.Unlock()
	if len(ld.history) == 0 {
		return 0
	}
	last := ld.history[len(ld.history)-1]
	count := 0
	for i := len(ld.history) - 1; i >= 0; i-- {
		if ld.history[i] == last {
			count++
		} else {
			break
		}
	}
	return count
}

// hashContent creates a SHA-256 hash of content for comparison
func hashContent(content string) string {
	// Normalize: trim whitespace, lowercase for comparison
	normalized := strings.ToLower(strings.TrimSpace(content))
	h := sha256.Sum256([]byte(normalized))
	return hex.EncodeToString(h[:])
}

// isNearDuplicate checks if two content strings are near-duplicates
// using a simple word-level Jaccard similarity.
func isNearDuplicate(a, b string) bool {
	if a == "" || b == "" {
		return false
	}

	wordsA := splitWords(a)
	wordsB := splitWords(b)

	if len(wordsA) == 0 || len(wordsB) == 0 {
		return false
	}

	// Build word sets
	setA := make(map[string]struct{}, len(wordsA))
	for _, w := range wordsA {
		setA[w] = struct{}{}
	}
	setB := make(map[string]struct{}, len(wordsB))
	for _, w := range wordsB {
		setB[w] = struct{}{}
	}

	// Jaccard similarity: |intersection| / |union|
	intersection := 0
	for w := range setA {
		if _, ok := setB[w]; ok {
			intersection++
		}
	}
	union := len(setA) + len(setB) - intersection
	if union == 0 {
		return false
	}

	similarity := float64(intersection) / float64(union)
	return similarity >= 0.9
}

// splitWords splits content into words for Jaccard comparison
func splitWords(s string) []string {
	s = strings.ToLower(s)
	var words []string
	var current strings.Builder
	for _, r := range s {
		if r == ' ' || r == '\n' || r == '\t' || r == ',' || r == '.' || r == ';' || r == ':' {
			if current.Len() > 0 {
				words = append(words, current.String())
				current.Reset()
			}
		} else {
			current.WriteRune(r)
		}
	}
	if current.Len() > 0 {
		words = append(words, current.String())
	}
	return words
}
