package swarm

import (
	"strings"
	"testing"
)

// FuzzLoopDetectorCheckOutput fuzzes the LoopDetector.CheckOutput method with
// arbitrary content strings. This ensures the loop detection logic never panics
// on unexpected, adversarial, or malformed agent output.
//
// Follows the Go standard library pattern of fuzzing string-processing functions
// that accept external input (e.g., net/url, encoding/json).
func FuzzLoopDetectorCheckOutput(f *testing.F) {
	// Seed corpus: representative agent outputs and edge cases
	f.Add("")
	f.Add("short")
	f.Add(strings.Repeat("a", 10000)) // very long single word
	f.Add("normal agent output with some words")
	f.Add("Hello, World! This is a test.\nMultiple lines.\nThird line.")
	f.Add("   leading and trailing spaces   ")
	f.Add("\t\ttabs\t\tand\nnewlines\n\n\n")
	f.Add("{\"json\": \"output\"}")                                 // JSON-like output
	f.Add("<<<<<<< HEAD\nconflict\n=======\nother\n>>>>>>> branch") // merge conflict markers
	f.Add(string([]byte{0x00, 0x01, 0xff}))                         // binary-like bytes
	f.Add("Lorem ipsum dolor sit amet, consectetur adipiscing elit. " +
		"Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.")

	f.Fuzz(func(t *testing.T, content string) {
		t.Parallel()

		// Fresh detector for each fuzz iteration to avoid state leakage
		ld := NewLoopDetector()

		// Single call must not panic
		isLoop, reason := ld.CheckOutput(content)
		_ = isLoop
		_ = reason

		// Repeated calls with the same content should not panic
		for i := 0; i < 10; i++ {
			isLoop, reason = ld.CheckOutput(content)
			_ = isLoop
			_ = reason
		}

		// Verify that empty content always returns no loop
		if content == "" {
			isLoop, reason = ld.CheckOutput("")
			if isLoop {
				t.Errorf("empty content should not trigger loop, got reason: %s", reason)
			}
		}
	})
}

// FuzzLoopDetectorSimilarity fuzzes the LoopDetector with similarity threshold
// enabled, using pairs of strings to test near-duplicate detection.
func FuzzLoopDetectorSimilarity(f *testing.F) {
	f.Add("hello world", "hello world")
	f.Add("the quick brown fox", "the quick brown fox jumps")
	f.Add("", "")
	f.Add("identical", "identical")
	f.Add("completely different sentence A", "entirely other statement B")

	f.Fuzz(func(t *testing.T, a, b string) {
		t.Parallel()

		ld := NewLoopDetector()
		ld.SetSimilarityThreshold(0.9)
		ld.SetMaxConsecutiveDuplicates(100) // avoid triggering exact-duplicate loop

		// Both calls must not panic regardless of input
		isLoop1, reason1 := ld.CheckOutput(a)
		_ = isLoop1
		_ = reason1

		isLoop2, reason2 := ld.CheckOutput(b)
		_ = isLoop2
		_ = reason2
	})
}

// FuzzSplitWords fuzzes the splitWords helper function with arbitrary strings.
// splitWords tokenizes content for Jaccard similarity comparison, so it must
// handle all possible rune combinations without panicking.
func FuzzSplitWords(f *testing.F) {
	f.Add("")
	f.Add("hello world")
	f.Add("one,two,three,four")
	f.Add("a.b.c.d")
	f.Add("line1\nline2\nline3")
	f.Add("mixed \t whitespace \n and \t separators")
	f.Add("punctuation: semicolons; commas, periods. colons:")
	f.Add(string([]byte{0x00, 0x80, 0xff})) // non-ASCII bytes
	f.Add("CamelCase snake_case kebab-case")

	f.Fuzz(func(t *testing.T, s string) {
		t.Parallel()

		// Must not panic on any input
		words := splitWords(s)

		// Basic sanity: empty input should produce no words
		if s == "" && len(words) != 0 {
			t.Errorf("splitWords(%q) = %v, want empty slice", s, words)
		}

		// All returned words should be non-empty
		for i, w := range words {
			if w == "" {
				t.Errorf("splitWords(%q)[%d] = %q, want non-empty", s, i, w)
			}
		}
	})
}

// FuzzIsNearDuplicate fuzzes the isNearDuplicate function with pairs of strings.
// This tests the Jaccard similarity comparison for robustness against adversarial input.
func FuzzIsNearDuplicate(f *testing.F) {
	f.Add("hello world", "hello world")
	f.Add("hello world", "goodbye world")
	f.Add("", "")
	f.Add("a", "")
	f.Add("", "b")
	f.Add("the quick brown fox", "the quick brown fox jumps over the lazy dog")
	f.Add(strings.Repeat("word ", 100), strings.Repeat("word ", 100))
	f.Add("completely different first", "completely different second")

	f.Fuzz(func(t *testing.T, a, b string) {
		t.Parallel()

		// Must not panic on any input
		result := isNearDuplicate(a, b)
		_ = result

		// Symmetric: isNearDuplicate(a,b) == isNearDuplicate(b,a)
		result2 := isNearDuplicate(b, a)
		if result != result2 {
			t.Errorf("isNearDuplicate not symmetric: isNearDuplicate(%q,%q)=%v, isNearDuplicate(%q,%q)=%v",
				a, b, result, b, a, result2)
		}

		// Reflexive: isNearDuplicate(a,a) should be true for non-empty strings
		if a != "" {
			if !isNearDuplicate(a, a) {
				t.Errorf("isNearDuplicate(%q, %q) = false, want true (reflexive for non-empty)", a, a)
			}
		}
	})
}
