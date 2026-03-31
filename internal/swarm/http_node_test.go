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
		"method":  "GET",
		"url":     server.URL + "/api/test",
		"headers": map[string]any{"X-Custom": "test-value"},
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
		"method": "POST",
		"url":    server.URL + "/api/items",
		"body":   `{"name": "test item"}`,
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
		"method":         "GET",
		"url":            server.URL + "/api/bad",
		"validateStatus": true,
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
		"method":         "GET",
		"url":            server.URL + "/api/missing",
		"validateStatus": false,
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
		"method":  "GET",
		"url":     server.URL + "/api/slow",
		"timeout": 0.5, // 0.5 seconds
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
		"url": server.URL + "/api/test",
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
		"url":        server.URL + "/api/test",
		"retryCount": 100.0,
		"allowPrivateNetworks": true,
	}

	_, err := ExecuteHTTPRequestNode(context.Background(), config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Test timeout clamping (max 300s)
	config2 := map[string]any{
		"url":     server.URL + "/api/test",
		"timeout": 999.0,
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
		"url": server.URL + "/api/test",
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
			"method": method,
			"url":    fmt.Sprintf("%s/api/%s", server.URL, method),
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
		"url": server.URL + "/api/structured",
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
		{"block_127_0_0_2", "http://127.0.0.2/api", true},        // entire 127.0.0.0/8
		{"block_127_1", "http://127.1/api", true},                // shorthand loopback
		{"block_ipv6_loopback", "http://[::1]/api", true},        // IPv6 loopback
		{"block_ipv4_mapped_loopback", "http://[::ffff:127.0.0.1]/api", true},
		{"block_fe80_linklocal", "http://[fe80::1]/api", true},   // IPv6 link-local
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
		"url": server.URL + "/api/test",
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
		{"172.15.255.255", true},  // Not in private range
		{"172.32.0.0", true},     // Not in private range
		{"metadata.google.internal", false},
		{"[::1]", false},
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
