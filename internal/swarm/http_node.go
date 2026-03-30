// Package swarm provides HTTP Request Node for workflow execution.
// Inspired by Dify HTTP Request Node and n8n HTTP Request Node:
//   - Configurable HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)
//   - Template variable resolution in URL, headers, body
//   - Timeout with configurable duration
//   - Retry with exponential backoff and jitter
//   - Response status code validation
//   - Structured response output (status, headers, body, duration)
package swarm

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"math/rand"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	// DefaultHTTPRequestTimeout is the default timeout for HTTP request nodes.
	DefaultHTTPRequestTimeout = 30 * time.Second

	// MaxHTTPRequestTimeout is the maximum allowed timeout.
	MaxHTTPRequestTimeout = 5 * time.Minute

	// MaxRetries is the maximum number of retries allowed.
	MaxRetries = 5

	// MaxResponseBodySize is the maximum response body size (10MB).
	MaxResponseBodySize = 10 << 20
)

// HTTPRequestResult represents the structured output of an HTTP request node.
type HTTPRequestResult struct {
	StatusCode int                    `json:"statusCode"`
	Status     string                 `json:"status"`
	Headers    map[string]string      `json:"headers"`
	Body       string                 `json:"body"`
	DurationMs float64                `json:"durationMs"`
	URL        string                 `json:"url"`
	Method     string                 `json:"method"`
}

// ExecuteHTTPRequestNode executes an HTTP request based on node configuration.
// This is the core execution logic for WorkflowNode.Type == "http_request".
//
// Config fields:
//   - method (string): HTTP method (default: "GET")
//   - url (string): Target URL (required, supports {{variable.key}} templates)
//   - headers (map[string]any): Request headers
//   - body (string): Request body (for POST/PUT/PATCH)
//   - timeout (float64): Timeout in seconds (default: 30, max: 300)
//   - retryCount (float64): Number of retries (default: 0, max: 5)
//   - validateStatus (bool): Fail on non-2xx status codes (default: true)
//   - insecureSkipVerify (bool): Skip TLS verification (default: false)
func ExecuteHTTPRequestNode(ctx context.Context, config map[string]any) (*HTTPRequestResult, error) {
	// Extract and validate configuration
	method := getStringConfig(config, "method", "GET")
	rawURL := getStringConfig(config, "url", "")
	timeoutSec := getFloatConfig(config, "timeout", 30)
	retryCount := int(getFloatConfig(config, "retryCount", 0))
	validateStatus := getBoolConfig(config, "validateStatus", true)
	insecureSkipVerify := getBoolConfig(config, "insecureSkipVerify", false)

	if rawURL == "" {
		return nil, fmt.Errorf("http_request node: 'url' is required")
	}

	// Validate URL
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return nil, fmt.Errorf("http_request node: invalid URL %q: %w", rawURL, err)
	}
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return nil, fmt.Errorf("http_request node: URL must use http or https scheme, got %q", parsedURL.Scheme)
	}

	// SSRF protection: block private/internal network access
	// Blocks: localhost, 127.x.x.x, 0.0.0.0, 169.254.x.x (cloud metadata), 10.x.x.x, 172.16-31.x.x, 192.168.x.x
	// Configurable via allowPrivateNetworks (default: false)
	allowPrivate := getBoolConfig(config, "allowPrivateNetworks", false)
	if !allowPrivate {
		if err := validateURLHost(parsedURL.Host); err != nil {
			return nil, fmt.Errorf("http_request node: %w", err)
		}
	}

	// Clamp values
	if timeoutSec <= 0 {
		timeoutSec = 30
	}
	if timeoutSec > 300 {
		origTimeout := timeoutSec
		timeoutSec = 300
		log.Printf("[HTTPNode] Warning: timeout clamped to 300s (was %v)", origTimeout)
	}
	if retryCount < 0 {
		retryCount = 0
	}
	if retryCount > MaxRetries {
		origRetry := retryCount
		retryCount = MaxRetries
		log.Printf("[HTTPNode] Warning: retryCount clamped to %d (was %d)", MaxRetries, origRetry)
	}

	// Normalize method
	method = strings.ToUpper(method)

	// Build request body
	var bodyReader io.Reader
	if bodyStr, ok := config["body"].(string); ok && bodyStr != "" {
		bodyReader = bytes.NewBufferString(bodyStr)
	}

	// Build headers (filtered for dangerous headers)
	headers := buildHeaders(config, allowPrivate)

	// Create HTTP client with SSRF-protected redirect handling
	client := &http.Client{
		Timeout: time.Duration(timeoutSec) * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: insecureSkipVerify,
			},
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			// Validate each redirect target to prevent SSRF bypass
			if !allowPrivate {
				if err := validateURLHost(req.URL.Host); err != nil {
					return fmt.Errorf("redirect blocked: %w", err)
				}
			}
			// Limit redirect count (Go default is 10)
			if len(via) >= 10 {
				return fmt.Errorf("stopped after 10 redirects")
			}
			return nil
		},
	}

	// Execute with retries
	var lastErr error
	var result *HTTPRequestResult

	for attempt := 0; attempt <= retryCount; attempt++ {
		if attempt > 0 {
			// Exponential backoff with jitter
			backoff := time.Duration(math.Pow(2, float64(attempt-1))*1000) * time.Millisecond
			jitter := time.Duration(rand.Intn(500)) * time.Millisecond
			timer := time.NewTimer(backoff + jitter)
			select {
			case <-ctx.Done():
				timer.Stop()
				return nil, ctx.Err()
			case <-timer.C:
			}
		}

		result, lastErr = doHTTPRequest(ctx, client, method, rawURL, headers, bodyReader)
		if lastErr == nil {
			break
		}

		// Don't retry on context errors or 4xx client errors
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		if result != nil && result.StatusCode >= 400 && result.StatusCode < 500 {
			break
		}
	}

	if lastErr != nil {
		return nil, fmt.Errorf("http_request node failed after %d attempts: %w", retryCount+1, lastErr)
	}

	// Validate status code
	if validateStatus && (result.StatusCode < 200 || result.StatusCode >= 300) {
		return nil, fmt.Errorf("http_request node: unexpected status code %d (%s) from %s %s",
			result.StatusCode, result.Status, method, rawURL)
	}

	return result, nil
}

// doHTTPRequest performs a single HTTP request and returns the result.
func doHTTPRequest(ctx context.Context, client *http.Client, method, rawURL string, headers map[string]string, body io.Reader) (*HTTPRequestResult, error) {
	req, err := http.NewRequestWithContext(ctx, method, rawURL, body)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	for key, value := range headers {
		req.Header.Set(key, value)
	}

	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	duration := time.Since(start)

	// Read body with size limit
	bodyReader := io.LimitReader(resp.Body, MaxResponseBodySize)
	bodyBytes, err := io.ReadAll(bodyReader)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	// Extract response headers
	respHeaders := make(map[string]string, len(resp.Header))
	for key, values := range resp.Header {
		if len(values) > 0 {
			respHeaders[key] = values[0]
		}
	}

	return &HTTPRequestResult{
		StatusCode: resp.StatusCode,
		Status:     resp.Status,
		Headers:    respHeaders,
		Body:       string(bodyBytes),
		DurationMs: float64(duration.Milliseconds()),
		URL:        rawURL,
		Method:     method,
	}, nil
}

// buildHeaders extracts headers from node config, filtering dangerous headers.
// Dangerous headers that can bypass security controls are blocked.
func buildHeaders(config map[string]any, allowPrivate bool) map[string]string {
	// Headers that can bypass security controls or cause security issues
	blockedHeaders := map[string]bool{
		"host":               true, // Bypass virtual host routing
		"authorization":      true, // Credential injection
		"proxy-authorization": true, // Proxy auth bypass
		"cookie":             true, // Session hijacking
		"proxy-connection":   true, // Proxy smuggling
		"upgrade":            true, // Protocol upgrade attacks
		"connection":         true, // Connection smuggling
	}

	headers := make(map[string]string)
	if h, ok := config["headers"]; ok {
		switch v := h.(type) {
		case map[string]string:
			for key, value := range v {
				lowerKey := strings.ToLower(key)
				if blockedHeaders[lowerKey] {
					log.Printf("[HTTPNode] WARN: blocked dangerous header %q", key)
					continue
				}
				headers[key] = value
			}
		case map[string]any:
			for key, value := range v {
				lowerKey := strings.ToLower(key)
				if blockedHeaders[lowerKey] {
					log.Printf("[HTTPNode] WARN: blocked dangerous header %q", key)
					continue
				}
				if strVal, ok := value.(string); ok {
					headers[key] = strVal
				}
			}
		}
	}

	// Log warning for insecureSkipVerify
	if allowPrivate {
		log.Printf("[HTTPNode] WARN: allowPrivateNetworks enabled - SSRF protection bypassed")
	}

	return headers
}

// getStringConfig extracts a string value from config with a default.
func getStringConfig(config map[string]any, key, defaultVal string) string {
	if v, ok := config[key]; ok {
		if strVal, ok := v.(string); ok {
			return strVal
		}
	}
	return defaultVal
}

// validateURLHost checks if a URL host points to a private/internal network.
// Returns error if the host is private (SSRF protection).
func validateURLHost(host string) error {
	// Handle IPv6 brackets first — extract hostname before port parsing
	hostname := host
	if strings.HasPrefix(hostname, "[") {
		// IPv6: [::1] or [::1]:8080
		closeBracket := strings.Index(hostname, "]")
		if closeBracket > 0 {
			hostname = hostname[1:closeBracket]
			// Remaining after ] is optional :port
		}
	} else {
		// IPv4: remove port if present
		if idx := strings.LastIndex(host, ":"); idx > 0 {
			hostname = host[:idx]
		}
	}

	// Block well-known private/special addresses
	privateHosts := [4]string{
		"localhost",
		"0.0.0.0",
		"169.254.169.254", // AWS/cloud metadata endpoint
		"metadata.google.internal",
	}
	for _, blocked := range privateHosts {
		if hostname == blocked {
			return fmt.Errorf("URL host %q resolves to a private/internal network (SSRF protection)", host)
		}
	}

	// Block entire 127.0.0.0/8 loopback range
	if strings.HasPrefix(hostname, "127.") {
		return fmt.Errorf("URL host %q resolves to a private/internal network (SSRF protection)", host)
	}

	// IPv6 loopback - use net.ParseIP for complete coverage
	if ip := net.ParseIP(hostname); ip != nil {
		if ip.IsLoopback() {
			return fmt.Errorf("URL host %q resolves to a private/internal network (SSRF protection)", host)
		}
		if ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
			return fmt.Errorf("URL host %q resolves to a private/internal network (SSRF protection)", host)
		}
		if ip.IsPrivate() {
			return fmt.Errorf("URL host %q resolves to a private network (SSRF protection)", host)
		}
	}

	// Block link-local: fe80::/10 (string prefix fallback for non-parseable)
	if strings.HasPrefix(hostname, "fe80:") || strings.HasPrefix(hostname, "FE80:") {
		return fmt.Errorf("URL host %q resolves to a private/internal network (SSRF protection)", host)
	}

	// Block 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16
	if strings.HasPrefix(hostname, "10.") ||
		strings.HasPrefix(hostname, "192.168.") ||
		strings.HasPrefix(hostname, "169.254.") {
		return fmt.Errorf("URL host %q resolves to a private network (SSRF protection)", host)
	}
	// 172.16.0.0 - 172.31.255.255
	if strings.HasPrefix(hostname, "172.") {
		parts := strings.SplitN(hostname, ".", 2)
		if len(parts) >= 2 {
			secondPart := strings.Split(parts[1], ".")[0]
			octet, err := strconv.Atoi(secondPart)
			if err == nil && octet >= 16 && octet <= 31 {
				return fmt.Errorf("URL host %q resolves to a private network (SSRF protection)", host)
			}
		}
	}

	return nil
}

// getFloatConfig extracts a float64 value from config with a default.
func getFloatConfig(config map[string]any, key string, defaultVal float64) float64 {
	if v, ok := config[key]; ok {
		switch n := v.(type) {
		case float64:
			return n
		case int:
			return float64(n)
		case int64:
			return float64(n)
		case string:
			if f, err := strconv.ParseFloat(n, 64); err == nil {
				return f
			}
		}
	}
	return defaultVal
}

// getBoolConfig extracts a bool value from config with a default.
func getBoolConfig(config map[string]any, key string, defaultVal bool) bool {
	if v, ok := config[key]; ok {
		if b, ok := v.(bool); ok {
			return b
		}
	}
	return defaultVal
}

// marshalHTTPResult converts an HTTPRequestResult to a map for node Result storage.
func marshalHTTPResult(r *HTTPRequestResult) map[string]any {
	result := map[string]any{
		"statusCode": r.StatusCode,
		"status":     r.Status,
		"headers":    r.Headers,
		"body":       r.Body,
		"durationMs": r.DurationMs,
		"url":        r.URL,
		"method":     r.Method,
	}

	// Attempt to parse body as JSON for structured access
	var jsonBody any
	if err := json.Unmarshal([]byte(r.Body), &jsonBody); err == nil {
		result["json"] = jsonBody
	}

	return result
}
