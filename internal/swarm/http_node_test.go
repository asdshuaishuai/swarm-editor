package swarm

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestExecuteHTTPRequestNode_GET(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			t.Errorf("expected GET, got %s", r.Method)
		}
		if r.Header.Get("X-Custom") != "test-value" {
			t.Errorf("expected custom header, got %s", r.Header.Get("X-Custom"))
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "hello"})
	}))
	defer server.Close()

	config := map[string]any{
		"method":               "GET",
		"url":                  server.URL + "/api/test",
		"headers":              map[string]any{"X-Custom": "test-value"},
		"allowPrivateNetworks": true,
	}

	result, err := ExecuteHTTPRequestNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", result.StatusCode)
	}
	if result.Method != "GET" {
		t.Errorf("expected method GET, got %s", result.Method)
	}
	if result.Body == "" {
		t.Error("expected non-empty body")
	}
	// JSON parsing should be present in the marshaled result
	marshaled := marshalHTTPResult(result)
	if _, ok := marshaled["json"]; !ok {
		t.Error("expected 'json' field in marshaled result")
	}
}

func TestExecuteHTTPRequestNode_POST(t *testing.T) {
	var receivedBody string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("expected POST, got %s", r.Method)
		}
		buf := make([]byte, 1024)
		n, _ := r.Body.Read(buf)
		receivedBody = string(buf[:n])
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(`{"id": 42}`))
	}))
	defer server.Close()

	config := map[string]any{
		"method":               "POST",
		"url":                  server.URL + "/api/items",
		"body":                 `{"name": "test item"}`,
		"allowPrivateNetworks": true,
	}

	result, err := ExecuteHTTPRequestNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.StatusCode != 201 {
		t.Errorf("expected status 201, got %d", result.StatusCode)
	}
	if receivedBody != `{"name": "test item"}` {
		t.Errorf("expected body to be sent, got %q", receivedBody)
	}
}

func TestExecuteHTTPRequestNode_ValidationError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error": "bad request"}`))
	}))
	defer server.Close()

	config := map[string]any{
		"method":               "GET",
		"url":                  server.URL + "/api/bad",
		"validateStatus":       true,
		"allowPrivateNetworks": true,
	}

	_, err := ExecuteHTTPRequestNode(context.Background(), config)
	if err == nil {
		t.Fatal("expected error for 400 status with validateStatus=true")
	}
}

func TestExecuteHTTPRequestNode_ValidateStatusFalse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"error": "not found"}`))
	}))
	defer server.Close()

	config := map[string]any{
		"method":               "GET",
		"url":                  server.URL + "/api/missing",
		"validateStatus":       false,
		"allowPrivateNetworks": true,
	}

	result, err := ExecuteHTTPRequestNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error with validateStatus=false: %v", err)
	}
	if result.StatusCode != 404 {
		t.Errorf("expected status 404, got %d", result.StatusCode)
	}
}

func TestExecuteHTTPRequestNode_MissingURL(t *testing.T) {
	config := map[string]any{
		"method": "GET",
	}

	_, err := ExecuteHTTPRequestNode(context.Background(), config)
	if err == nil {
		t.Fatal("expected error for missing URL")
	}
}

func TestExecuteHTTPRequestNode_InvalidURL(t *testing.T) {
	config := map[string]any{
		"method": "GET",
		"url":    "ftp://invalid-scheme.com",
	}

	_, err := ExecuteHTTPRequestNode(context.Background(), config)
	if err == nil {
		t.Fatal("expected error for invalid URL scheme")
	}
}

func TestExecuteHTTPRequestNode_Timeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(2 * time.Second)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	config := map[string]any{
		"method":               "GET",
		"url":                  server.URL + "/api/slow",
		"timeout":              0.5, // 0.5 seconds
		"allowPrivateNetworks": true,
	}

	_, err := ExecuteHTTPRequestNode(ctx, config)
	if err == nil {
		t.Fatal("expected timeout error")
	}
}

func TestExecuteHTTPRequestNode_DefaultValues(t *testing.T) {
	var gotMethod string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer server.Close()

	// Minimal config - only URL
	config := map[string]any{
		"url":                  server.URL + "/api/test",
		"allowPrivateNetworks": true,
	}

	result, err := ExecuteHTTPRequestNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotMethod != "GET" {
		t.Errorf("default method should be GET, got %s", gotMethod)
	}
	if result.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", result.StatusCode)
	}
	if result.DurationMs < 0 {
		t.Error("expected non-negative duration")
	}
}

func TestExecuteHTTPRequestNode_ClampValues(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer server.Close()

	// Test retryCount clamping (max 5)
	config := map[string]any{
		"url":                  server.URL + "/api/test",
		"retryCount":           100.0,
		"allowPrivateNetworks": true,
	}

	_, err := ExecuteHTTPRequestNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Test timeout clamping (max 300s)
	config2 := map[string]any{
		"url":                  server.URL + "/api/test",
		"timeout":              999.0,
		"allowPrivateNetworks": true,
	}

	_, err = ExecuteHTTPRequestNode(context.Background(), config2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestExecuteHTTPRequestNode_ContextCancellation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(5 * time.Second)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	config := map[string]any{
		"url":                  server.URL + "/api/test",
		"allowPrivateNetworks": true,
	}

	_, err := ExecuteHTTPRequestNode(ctx, config)
	if err == nil {
		t.Fatal("expected error from cancelled context")
	}
}

func TestBuildHeaders(t *testing.T) {
	tests := []struct {
		name   string
		config map[string]any
		expect map[string]string
	}{
		{
			"map[string]any",
			map[string]any{"headers": map[string]any{"Content-Type": "application/json", "Auth": "Bearer token"}},
			map[string]string{"Content-Type": "application/json", "Auth": "Bearer token"},
		},
		{
			"map[string]string",
			map[string]any{"headers": map[string]string{"Content-Type": "application/json", "X-Custom": "value"}},
			map[string]string{"Content-Type": "application/json", "X-Custom": "value"},
		},
		{
			"no headers",
			map[string]any{},
			map[string]string{},
		},
		{
			"non-string values ignored",
			map[string]any{"headers": map[string]any{"Key": 12345}},
			map[string]string{},
		},
		{
			"dangerous headers blocked",
			map[string]any{"headers": map[string]any{"Host": "evil.com", "Authorization": "Bearer stolen", "Content-Type": "application/json"}},
			map[string]string{"Content-Type": "application/json"}, // Host and Authorization should be blocked
		},
		{
			"case-insensitive dangerous header blocking",
			map[string]any{"headers": map[string]any{"host": "evil.com", "HOST": "evil.com", "authorization": "Bearer stolen"}},
			map[string]string{}, // All variants should be blocked
		},
		{
			"map[string]string dangerous blocked",
			map[string]any{"headers": map[string]string{"Host": "evil.com", "X-Allowed": "ok"}},
			map[string]string{"X-Allowed": "ok"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := buildHeaders(tt.config, false) // allowPrivate=false for SSRF protection
			for k, v := range tt.expect {
				if result[k] != v {
					t.Errorf("header %q: expected %q, got %q", k, v, result[k])
				}
			}
			// Verify dangerous headers are not present
			for _, blocked := range []string{"Host", "Authorization", "Cookie"} {
				if _, ok := result[blocked]; ok {
					t.Errorf("dangerous header %q should be blocked", blocked)
				}
			}
		})
	}
}

func TestGetStringConfig(t *testing.T) {
	tests := []struct {
		key   string
		def   string
		input map[string]any
		want  string
	}{
		{"method", "GET", map[string]any{"method": "POST"}, "POST"},
		{"missing", "default", map[string]any{}, "default"},
		{"wrong_type", "default", map[string]any{"method": 42}, "default"},
	}
	for _, tt := range tests {
		got := getStringConfig(tt.input, tt.key, tt.def)
		if got != tt.want {
			t.Errorf("getStringConfig(%q, %q) = %q, want %q", tt.key, tt.def, got, tt.want)
		}
	}
}

func TestGetFloatConfig(t *testing.T) {
	tests := []struct {
		key   string
		def   float64
		input map[string]any
		want  float64
	}{
		{"timeout", 30, map[string]any{"timeout": 60.0}, 60},
		{"missing", 30, map[string]any{}, 30},
		{"int_val", 30, map[string]any{"int_val": 45}, 45},
		{"string_num", 30, map[string]any{"string_num": "10.5"}, 10.5},
		{"invalid", 30, map[string]any{"invalid": "abc"}, 30},
	}
	for _, tt := range tests {
		got := getFloatConfig(tt.input, tt.key, tt.def)
		if got != tt.want {
			t.Errorf("getFloatConfig(%q, %v) = %v, want %v", tt.key, tt.def, got, tt.want)
		}
	}
}

func TestGetBoolConfig(t *testing.T) {
	if getBoolConfig(map[string]any{"flag": true}, "flag", false) != true {
		t.Error("expected true")
	}
	if getBoolConfig(map[string]any{}, "flag", true) != true {
		t.Error("expected default true")
	}
	if getBoolConfig(map[string]any{"flag": "yes"}, "flag", false) != false {
		t.Error("expected false for non-bool value")
	}
}

func TestMarshalHTTPResult(t *testing.T) {
	result := &HTTPRequestResult{
		StatusCode: 200,
		Status:     "200 OK",
		Headers:    map[string]string{"Content-Type": "application/json"},
		Body:       `{"key": "value"}`,
		DurationMs: 42.5,
		URL:        "http://example.com",
		Method:     "GET",
	}

	marshaled := marshalHTTPResult(result)
	if marshaled["statusCode"] != 200 {
		t.Errorf("expected statusCode 200, got %v", marshaled["statusCode"])
	}
	if _, ok := marshaled["json"]; !ok {
		t.Error("expected 'json' field for valid JSON body")
	}

	// Non-JSON body should not have json field
	result2 := &HTTPRequestResult{
		StatusCode: 200,
		Status:     "200 OK",
		Body:       "plain text response",
		DurationMs: 10,
	}
	marshaled2 := marshalHTTPResult(result2)
	if _, ok := marshaled2["json"]; ok {
		t.Error("expected no 'json' field for non-JSON body")
	}
}

func TestExecuteHTTPRequestNode_MethodNormalization(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	methods := []string{"get", "post", "PUT", "Delete", "PATCH"}
	for _, method := range methods {
		config := map[string]any{
			"method":               method,
			"url":                  fmt.Sprintf("%s/api/%s", server.URL, method),
			"allowPrivateNetworks": true,
		}
		_, err := ExecuteHTTPRequestNode(context.Background(), config)
		if err != nil {
			t.Errorf("method %q: unexpected error: %v", method, err)
		}
	}
}

func TestExecuteHTTPRequestNode_HeadersExtraction(t *testing.T) {
	var gotAuth, gotContentType, gotCustomAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotContentType = r.Header.Get("Content-Type")
		gotCustomAuth = r.Header.Get("X-Custom-Auth")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ok": true}`))
	}))
	defer server.Close()

	config := map[string]any{
		"method": "GET",
		"url":    server.URL + "/api/secure",
		"headers": map[string]any{
			"Authorization": "Bearer secret-token", // This should be BLOCKED as dangerous header
			"Content-Type":  "application/json",
			"X-Custom-Auth": "custom-value", // This should be allowed
		},
		"allowPrivateNetworks": true,
	}

	result, err := ExecuteHTTPRequestNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Authorization header should be BLOCKED for security
	if gotAuth != "" {
		t.Errorf("expected Authorization header to be BLOCKED, but got %q", gotAuth)
	}
	if gotContentType != "application/json" {
		t.Errorf("expected Content-Type header to be sent, got %q", gotContentType)
	}
	// Custom header should be allowed
	if gotCustomAuth != "custom-value" {
		t.Errorf("expected X-Custom-Auth header to be sent, got %q", gotCustomAuth)
	}
	// Verify response headers in result
	if result.Headers == nil {
		t.Error("expected non-nil response headers")
	}
}

func TestExecuteHTTPRequestNode_ResponseStructure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Request-Id", "req-123")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"data": [1, 2, 3]}`))
	}))
	defer server.Close()

	config := map[string]any{
		"url":                  server.URL + "/api/structured",
		"allowPrivateNetworks": true,
	}

	result, err := ExecuteHTTPRequestNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify all result fields
	if result.StatusCode != 200 {
		t.Errorf("expected 200, got %d", result.StatusCode)
	}
	if result.Status != "200 OK" {
		t.Errorf("expected '200 OK', got %q", result.Status)
	}
	if result.Method != "GET" {
		t.Errorf("expected GET, got %s", result.Method)
	}
	if result.URL != server.URL+"/api/structured" {
		t.Errorf("URL mismatch: %s", result.URL)
	}
	if result.DurationMs < 0 {
		t.Error("expected non-negative duration")
	}
	if result.Headers["X-Request-Id"] != "req-123" {
		t.Errorf("expected X-Request-Id header, got %v", result.Headers["X-Request-Id"])
	}
}

func TestExecuteHTTPRequestNode_SSRFProtection(t *testing.T) {
	// SSRF protection is enabled by default
	tests := []struct {
		name string
		url  string
		ok   bool // true = should be blocked (SSRF), false = should pass
	}{
		{"block_localhost", "http://localhost/api", true},
		{"block_127_0_0_1", "http://127.0.0.1/api", true},
		{"block_0_0_0_0", "http://0.0.0.0/api", true},
		{"block_169_metadata", "http://169.254.169.254/latest/meta-data/", true},
		{"block_10_private", "http://10.0.0.1/api", true},
		{"block_192_168", "http://192.168.1.1/api", true},
		{"block_172_16", "http://172.16.0.1/api", true},
		{"block_172_31", "http://172.31.255.255/api", true},
		{"block_172_15_allowed", "http://172.15.0.1/api", false}, // 172.15 is NOT private
		{"block_google_metadata", "http://metadata.google.internal/api", true},
		{"block_127_0_0_2", "http://127.0.0.2/api", true}, // entire 127.0.0.0/8
		{"block_127_1", "http://127.1/api", true},         // shorthand loopback
		{"block_ipv6_loopback", "http://[::1]/api", true}, // IPv6 loopback
		{"block_ipv4_mapped_loopback", "http://[::ffff:127.0.0.1]/api", true},
		{"block_fe80_linklocal", "http://[fe80::1]/api", true}, // IPv6 link-local
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config := map[string]any{
				"method": "GET",
				"url":    tt.url,
			}
			_, err := ExecuteHTTPRequestNode(context.Background(), config)
			if tt.ok {
				if err == nil {
					t.Errorf("expected SSRF block for %q", tt.url)
				} else if !strings.Contains(err.Error(), "SSRF protection") {
					t.Errorf("expected SSRF error for %q, got: %v", tt.url, err)
				}
			} else {
				// Non-blocked URLs: should not get SSRF error (may get connection error instead)
				if err != nil && strings.Contains(err.Error(), "SSRF protection") {
					t.Errorf("unexpected SSRF block for %q", tt.url)
				}
			}
		})
	}
}

func TestExecuteHTTPRequestNode_SSRFAllowPrivate(t *testing.T) {
	// With allowPrivateNetworks=true, localhost should pass
	// (But the request will still fail since there's no server — we just verify no SSRF error)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	// Normal external URL should always work
	config := map[string]any{
		"url":                  server.URL + "/api/test",
		"allowPrivateNetworks": true,
	}
	_, err := ExecuteHTTPRequestNode(context.Background(), config)
	if err != nil {
		t.Errorf("normal URL should work: %v", err)
	}
}

func TestValidateURLHost(t *testing.T) {
	tests := []struct {
		host string
		ok   bool
	}{
		{"example.com", true},
		{"api.example.com:8080", true},
		{"localhost", false},
		{"127.0.0.1", false},
		{"0.0.0.0", false},
		{"169.254.169.254", false},
		{"10.0.0.1", false},
		{"10.255.255.255", false},
		{"192.168.0.1", false},
		{"172.16.0.0", false},
		{"172.31.255.255", false},
		{"172.15.255.255", true}, // Not in private range
		{"172.32.0.0", true},     // Not in private range
		{"metadata.google.internal", false},
		{"[::1]", false},
		// Raw IPv6 without brackets (edge cases for port stripping)
		{"::1", false},              // Raw IPv6 loopback
		{"::1:8080", false},         // Raw IPv6 with port (bypass attempt)
		{"[::1]:8080", false},       // IPv6 with brackets and port
		{"fe80::1", false},          // IPv6 link-local
		{"[fe80::1]:8080", false},   // IPv6 link-local with port
		// Note: 2001:db8::/32 is documentation range (RFC 3849), NOT private.
		// Go's IsPrivate() only blocks fc00::/7 (ULA), so this is allowed.
		{"2001:db8::1", true},       // Documentation range - allowed (not actually private)
		// IPv4-mapped IPv6 addresses (SSRF bypass via ::ffff:x.x.x.x)
		{"::ffff:127.0.0.1", false},        // Loopback via IPv4-mapped IPv6
		{"[::ffff:127.0.0.1]", false},      // Loopback via IPv4-mapped IPv6 with brackets
		{"[::ffff:127.0.0.1]:8080", false}, // Loopback via IPv4-mapped IPv6 with port
		{"::ffff:169.254.169.254", false},  // Cloud metadata via IPv4-mapped IPv6
		{"::ffff:10.0.0.1", false},         // Private network via IPv4-mapped IPv6
		{"::ffff:192.168.1.1", false},      // Private network via IPv4-mapped IPv6
		{"::ffff:172.16.0.1", false},       // Private network via IPv4-mapped IPv6
	}

	for _, tt := range tests {
		t.Run(tt.host, func(t *testing.T) {
			err := validateURLHost(tt.host)
			if tt.ok && err != nil {
				t.Errorf("expected %q to pass: %v", tt.host, err)
			}
			if !tt.ok && err == nil {
				t.Errorf("expected %q to be blocked", tt.host)
			}
		})
	}
}

// --- Additional coverage tests for uncovered lines ---

// L81: url.Parse error (malformed URL)
func TestExecuteHTTPRequestNode_InvalidURLParse(t *testing.T) {
	config := map[string]any{
		"url": "http://[::1:bad-ipv6",
	}
	_, err := ExecuteHTTPRequestNode(context.Background(), config)
	if err == nil {
		t.Fatal("expected error for invalid URL parse")
	}
	if !strings.Contains(err.Error(), "invalid URL") {
		t.Errorf("expected 'invalid URL' error, got: %v", err)
	}
}

// L99: timeoutSec <= 0 gets clamped to 30
func TestExecuteHTTPRequestNode_ZeroTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer server.Close()

	config := map[string]any{
		"url":                  server.URL + "/api/test",
		"timeout":              0,
		"allowPrivateNetworks": true,
	}

	result, err := ExecuteHTTPRequestNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error with timeout=0: %v", err)
	}
	if result.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", result.StatusCode)
	}
}

// L107: retryCount < 0 gets clamped to 0
func TestExecuteHTTPRequestNode_NegativeRetryCount(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer server.Close()

	config := map[string]any{
		"url":                  server.URL + "/api/test",
		"retryCount":           -5.0,
		"allowPrivateNetworks": true,
	}

	result, err := ExecuteHTTPRequestNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error with negative retryCount: %v", err)
	}
	if result.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", result.StatusCode)
	}
}

// L156-165: Retry loop with backoff (attempt > 0)
// Note: retries only happen on network-level errors (lastErr != nil),
// not on HTTP error status codes. We use a hijacked connection to force
// connection reset errors for the first N attempts.
func TestExecuteHTTPRequestNode_RetrySuccess(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		if attempts < 3 {
			// Force a connection reset by hijacking and closing
			hj, ok := w.(http.Hijacker)
			if ok {
				conn, _, _ := hj.Hijack()
				conn.Close()
				return
			}
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ok": true}`))
	}))
	defer server.Close()

	config := map[string]any{
		"url":                  server.URL + "/api/flaky",
		"retryCount":           3.0,
		"timeout":              5.0,
		"allowPrivateNetworks": true,
	}

	result, err := ExecuteHTTPRequestNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error after retries: %v", err)
	}
	if result.StatusCode != 200 {
		t.Errorf("expected status 200 after retries, got %d", result.StatusCode)
	}
	if attempts != 3 {
		t.Errorf("expected 3 attempts, got %d", attempts)
	}
}

// L162: context cancellation during retry backoff
func TestExecuteHTTPRequestNode_ContextCancelDuringRetry(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Always force connection reset to trigger retry
		hj, ok := w.(http.Hijacker)
		if ok {
			conn, _, _ := hj.Hijack()
			conn.Close()
		}
	}))
	defer server.Close()

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(100 * time.Millisecond)
		cancel()
	}()

	config := map[string]any{
		"url":                  server.URL + "/api/flaky",
		"retryCount":           10.0,
		"timeout":              5.0,
		"allowPrivateNetworks": true,
	}

	_, err := ExecuteHTTPRequestNode(ctx, config)
	if err == nil {
		t.Fatal("expected error from context cancellation during retry")
	}
	// Either context canceled or request failed is acceptable
}

// L178: 4xx status stops retry immediately
func TestExecuteHTTPRequestNode_NoRetryOn4xx(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.WriteHeader(http.StatusForbidden)
		w.Write([]byte(`{"error": "forbidden"}`))
	}))
	defer server.Close()

	config := map[string]any{
		"url":                  server.URL + "/api/forbidden",
		"retryCount":           5.0,
		"validateStatus":       false,
		"allowPrivateNetworks": true,
	}

	result, err := ExecuteHTTPRequestNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.StatusCode != 403 {
		t.Errorf("expected status 403, got %d", result.StatusCode)
	}
	if attempts != 1 {
		t.Errorf("expected 1 attempt (no retry on 4xx), got %d", attempts)
	}
}

// L138-147: redirect handling (CheckRedirect is invoked)
// Note: redirect-to-private-host (L138-139) cannot be tested with httptest
// because the server runs on 127.0.0.1 which is itself private.
// allowPrivate=false blocks the initial URL; allowPrivate=true skips redirect check.
// This is a HARD BOUNDARY for unit testing. Test redirect chain limit instead.
func TestExecuteHTTPRequestNode_RedirectAllowed(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("redirected"))
	}))
	defer target.Close()

	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Location", target.URL+"/target")
		w.WriteHeader(http.StatusFound)
	}))
	defer source.Close()

	config := map[string]any{
		"url":                  source.URL + "/start",
		"allowPrivateNetworks": true,
	}

	result, err := ExecuteHTTPRequestNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error following redirect: %v", err)
	}
	if result.StatusCode != 200 {
		t.Errorf("expected status 200 after redirect, got %d", result.StatusCode)
	}
	if result.Body != "redirected" {
		t.Errorf("expected body 'redirected', got %q", result.Body)
	}
}

// L144: redirect chain exceeds 10 hops
func TestExecuteHTTPRequestNode_TooManyRedirects(t *testing.T) {
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Location", srv.URL+"/loop")
		w.WriteHeader(http.StatusFound)
	}))
	defer srv.Close()

	config := map[string]any{
		"url":                  srv.URL + "/loop",
		"allowPrivateNetworks": true,
	}

	_, err := ExecuteHTTPRequestNode(context.Background(), config)
	if err == nil {
		t.Fatal("expected error for too many redirects")
	}
	if !strings.Contains(err.Error(), "stopped after 10 redirects") {
		t.Errorf("expected 'stopped after 10 redirects' error, got: %v", err)
	}
}

// validateStatus=false with 5xx (should still succeed, no error)
func TestExecuteHTTPRequestNode_ValidateStatusFalse_5xx(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error": "internal"}`))
	}))
	defer server.Close()

	config := map[string]any{
		"url":                  server.URL + "/api/error",
		"validateStatus":       false,
		"allowPrivateNetworks": true,
	}

	result, err := ExecuteHTTPRequestNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error with validateStatus=false on 500: %v", err)
	}
	if result.StatusCode != 500 {
		t.Errorf("expected status 500, got %d", result.StatusCode)
	}
}

// insecureSkipVerify=true (config is accepted and request proceeds)
func TestExecuteHTTPRequestNode_InsecureSkipVerify(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer server.Close()

	config := map[string]any{
		"url":                  server.URL + "/api/test",
		"insecureSkipVerify":   true,
		"allowPrivateNetworks": true,
	}

	result, err := ExecuteHTTPRequestNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error with insecureSkipVerify=true: %v", err)
	}
	if result.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", result.StatusCode)
	}
}

// Empty body (no body sent)
func TestExecuteHTTPRequestNode_EmptyBody(t *testing.T) {
	var receivedBody string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		buf := make([]byte, 1024)
		n, _ := r.Body.Read(buf)
		receivedBody = string(buf[:n])
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer server.Close()

	config := map[string]any{
		"method":               "POST",
		"url":                  server.URL + "/api/empty",
		"allowPrivateNetworks": true,
	}

	result, err := ExecuteHTTPRequestNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", result.StatusCode)
	}
	if receivedBody != "" {
		t.Errorf("expected empty body to be sent, got %q", receivedBody)
	}
}

// L352: fe80: prefix fallback (bypasses net.ParseIP by using non-parseable bracket form)
func TestValidateURLHost_Fe80Prefix(t *testing.T) {
	err := validateURLHost("[FE80:bad]")
	if err == nil {
		t.Error("expected [FE80:bad] to be blocked by fe80: prefix check")
	}
}

// L359: 169.254.x.x caught by prefix check (bypasses net.ParseIP by using non-IP hostname)
func TestValidateURLHost_169_254_NonMetadata(t *testing.T) {
	err := validateURLHost("169.254.example.com")
	if err == nil {
		t.Error("expected 169.254.example.com to be blocked by prefix check")
	}
}

// L368: 172.x private range (octet parsing path, bypasses net.ParseIP)
func TestValidateURLHost_172_20(t *testing.T) {
	err := validateURLHost("172.20.example.com")
	if err == nil {
		t.Error("expected 172.20.example.com to be blocked by octet range check")
	}
}

// L385: getFloatConfig with int64 input
func TestGetFloatConfig_Int64(t *testing.T) {
	config := map[string]any{"value": int64(42)}
	got := getFloatConfig(config, "value", 0)
	if got != 42.0 {
		t.Errorf("getFloatConfig(int64) = %v, want 42.0", got)
	}
}

func TestValidateURLHostWithDNS(t *testing.T) {
	tests := []struct {
		name    string
		host    string
		wantErr bool
	}{
		// Direct IP tests (fast path, no DNS)
		{"loopback IP", "127.0.0.1", true},
		{"private IP 10.x", "10.0.0.1", true},
		{"private IP 192.168.x", "192.168.1.1", true},
		{"private IP 172.16.x", "172.16.0.1", true},
		{"cloud metadata IP", "169.254.169.254", true},
		{"public IP", "8.8.8.8", false},
		{"localhost", "localhost", true},
		{"metadata.google.internal", "metadata.google.internal", true},
		// IPv6 tests
		{"IPv6 loopback", "::1", true},
		{"IPv6 link-local", "fe80::1", true},
		// Public hostname (may resolve, but should not be blocked if public)
		// Note: this test depends on DNS resolution
		{"public hostname", "example.com", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateURLHostWithDNS(tt.host)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateURLHostWithDNS(%q) error = %v, wantErr %v", tt.host, err, tt.wantErr)
			}
		})
	}
}
