package api

import (
	"net/http/httptest"
	"testing"
)

// FuzzCheckOrigin fuzzes the checkOrigin function with arbitrary origin strings.
// This follows the Kubernetes pattern of fuzzing pure functions that accept
// untrusted input to verify they never panic on malformed or adversarial data.
func FuzzCheckOrigin(f *testing.F) {
	// Seed corpus: common, edge-case, and adversarial origin values
	f.Add("https://example.com")
	f.Add("")
	f.Add("*.example.com")
	f.Add("http://localhost:3000")
	f.Add("http://localhost:3000; __proto__=evil")
	f.Add("https://evil.com\nInjected-Header: true")
	f.Add("null")
	f.Add("file:///etc/passwd")
	f.Add("https://allowed.com")
	f.Add("https://sub.example.com")

	f.Fuzz(func(t *testing.T, origin string) {
		t.Parallel()

		allowedOriginsCases := [][]string{
			nil, // no allowed origins (dev mode)
			{},  // empty allowed origins (dev mode)
			{"https://allowed.com"},
			{"https://allowed.com", "*.example.com"},
			{"http://localhost:3000"},
			{"*"}, // wildcard-only
			{"*.example.com", "*.other.com"},
		}

		for _, allowedOrigins := range allowedOriginsCases {
			req := httptest.NewRequest("GET", "/ws", nil)
			if origin != "" {
				req.Header.Set("Origin", origin)
			}
			// Must not panic on any input
			_ = checkOrigin(req, allowedOrigins)
		}
	})
}

// FuzzCryptoEqual fuzzes the cryptoEqual constant-time comparison function.
// Verifies the mathematical properties that a constant-time equality function
// must uphold: symmetry and reflexivity.
func FuzzCryptoEqual(f *testing.F) {
	// Seed corpus: typical and edge-case inputs
	f.Add("hello", "hello")
	f.Add("hello", "world")
	f.Add("", "")
	f.Add("a", "b")
	f.Add("", "nonempty")
	f.Add("same-length-but-different-aaa", "same-length-but-different-bbb")
	f.Add("secret-api-key-12345", "secret-api-key-12345")
	f.Add("secret-api-key-12345", "secret-api-key-12346")

	f.Fuzz(func(t *testing.T, a, b string) {
		t.Parallel()

		// Symmetric property: cryptoEqual(a,b) == cryptoEqual(b,a)
		// This is a fundamental property of any equality relation.
		result1 := cryptoEqual(a, b)
		result2 := cryptoEqual(b, a)
		if result1 != result2 {
			t.Errorf("cryptoEqual not symmetric: cryptoEqual(%q,%q)=%v, cryptoEqual(%q,%q)=%v",
				a, b, result1, b, a, result2)
		}

		// Reflexive property: cryptoEqual(a,a) should always be true
		if !cryptoEqual(a, a) {
			t.Errorf("cryptoEqual(%q, %q) = false, want true (reflexive)", a, a)
		}

		// Reflexive property for b as well
		if !cryptoEqual(b, b) {
			t.Errorf("cryptoEqual(%q, %q) = false, want true (reflexive)", b, b)
		}
	})
}
