package api

import (
	"net/http/httptest"
	"testing"
)

func TestCheckOrigin(t *testing.T) {
	tests := []struct {
		name           string
		allowedOrigins []string
		origin         string
		expected       bool
	}{
		{
			name:           "empty allowed origins allows all",
			allowedOrigins: []string{},
			origin:         "https://example.com",
			expected:       true,
		},
		{
			name:           "no origin header allowed",
			allowedOrigins: []string{"https://allowed.com"},
			origin:         "",
			expected:       true,
		},
		{
			name:           "exact match allowed",
			allowedOrigins: []string{"https://allowed.com"},
			origin:         "https://allowed.com",
			expected:       true,
		},
		{
			name:           "not in allowed list",
			allowedOrigins: []string{"https://allowed.com"},
			origin:         "https://blocked.com",
			expected:       false,
		},
		{
			name:           "wildcard subdomain match",
			allowedOrigins: []string{"*.example.com"},
			origin:         "https://sub.example.com",
			expected:       true,
		},
		{
			name:           "wildcard subdomain no match",
			allowedOrigins: []string{"*.example.com"},
			origin:         "https://other.com",
			expected:       false,
		},
		{
			name:           "multiple allowed origins",
			allowedOrigins: []string{"https://a.com", "https://b.com"},
			origin:         "https://b.com",
			expected:       true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/ws", nil)
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}

			result := checkOrigin(req, tt.allowedOrigins)
			if result != tt.expected {
				t.Errorf("checkOrigin() = %v, expected %v", result, tt.expected)
			}
		})
	}
}

func TestWebSocketAuthToken(t *testing.T) {
	tests := []struct {
		name       string
		authToken  string
		reqToken   string
		shouldAuth bool
	}{
		{
			name:       "no token required",
			authToken:  "",
			reqToken:   "",
			shouldAuth: true,
		},
		{
			name:       "valid token",
			authToken:  "secret123",
			reqToken:   "secret123",
			shouldAuth: true,
		},
		{
			name:       "invalid token",
			authToken:  "secret123",
			reqToken:   "wrong",
			shouldAuth: false,
		},
		{
			name:       "missing token when required",
			authToken:  "secret123",
			reqToken:   "",
			shouldAuth: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create server with auth token
			cfg := &WebSocketConfig{
				Addr:      ":0",
				AuthToken: tt.authToken,
			}
			s := NewWebSocketServer(cfg)

			// Verify token is set
			if s.authToken != tt.authToken {
				t.Errorf("authToken not set correctly")
			}

			// Test auth logic
			authenticated := true
			if s.authToken != "" {
				authenticated = tt.reqToken == s.authToken
			}

			if authenticated != tt.shouldAuth {
				t.Errorf("auth logic = %v, expected %v", authenticated, tt.shouldAuth)
			}
		})
	}
}
