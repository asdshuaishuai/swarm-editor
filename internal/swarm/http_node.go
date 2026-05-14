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
	"math"
	"math/rand"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/log"
)

var httpNodeLog = log.With("component", "HTTPNode")

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
	StatusCode int               `json:"statusCode"`
	Status     string            `json:"status"`
	Headers    map[string]string `json:"headers"`
	Body       string            `json:"body"`
	DurationMs float64           `json:"durationMs"`
	URL        string            `json:"url"`
	Method     string            `json:"method"`
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
	//
	// Security model:
	// - By default, SSRF protection is ENABLED
	// - Config option "allowPrivateNetworks" is DEPRECATED (user-controllable, security risk)
	// - Admin override: Set SWARM_ALLOW_PRIVATE_NETWORKS=true env var for development/testing
	// - Future: Config option will be removed; only env var will work
	allowPrivate := getBoolConfig(config, "allowPrivateNetworks", false) ||
		os.Getenv("SWARM_ALLOW_PRIVATE_NETWORKS") == "true"
	if allowPrivate {
		httpNodeLog.Warn("SSRF protection disabled - use SWARM_ALLOW_PRIVATE_NETWORKS env var instead of config option")
	}
	if !allowPrivate {
		if err := validateURLHostWithDNS(parsedURL.Host); err != nil {
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
		httpNodeLog.Warn("Timeout clamped to 300s", "original", origTimeout)
	}
	if retryCount < 0 {
		retryCount = 0
	}
	if retryCount > MaxRetries {
		origRetry := retryCount
		retryCount = MaxRetries
		httpNodeLog.Warn("retryCount clamped", "max", MaxRetries, "original", origRetry)
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
	// Includes common credential-bearing headers (defense-in-depth)
	blockedHeaders := map[string]bool{
		"host":                true, // Bypass virtual host routing
		"authorization":       true, // Credential injection
		"proxy-authorization": true, // Proxy auth bypass
		"cookie":              true, // Session hijacking
		"proxy-connection":    true, // Proxy smuggling
		"upgrade":             true, // Protocol upgrade attacks
		"connection":          true, // Connection smuggling
		// Common credential headers (defense-in-depth - use Credential Store instead)
		"x-api-key":       true, // API key injection
		"x-auth-token":    true, // Auth token injection
		"x-access-token":  true, // Access token injection
		"x-api-token":     true, // API token injection
		"x-session-token": true, // Session token injection
		"x-secret-key":    true, // Secret key injection
		"x-api-secret":    true, // API secret injection
	}

	headers := make(map[string]string)
	if h, ok := config["headers"]; ok {
		switch v := h.(type) {
		case map[string]string:
			for key, value := range v {
				lowerKey := strings.ToLower(key)
				if blockedHeaders[lowerKey] {
					httpNodeLog.Warn("Blocked dangerous header", "header", key)
					continue
				}
				headers[key] = value
			}
		case map[string]any:
			for key, value := range v {
				lowerKey := strings.ToLower(key)
				if blockedHeaders[lowerKey] {
					httpNodeLog.Warn("Blocked dangerous header", "header", key)
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
		httpNodeLog.Warn("allowPrivateNetworks enabled - SSRF protection bypassed")
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
	} else if strings.Contains(hostname, "::") || strings.Count(hostname, ":") >= 2 {
		// Raw IPv6 without brackets (e.g., "::1" or "2001:db8::1")
		// May have a port suffix (::1:8080) - net.ParseIP interprets this as valid IPv6!
		// We need to try stripping potential port suffixes and check both.
		candidates := []string{hostname}

		// Try stripping last :segment if it looks like a port (digits only)
		if lastColon := strings.LastIndex(hostname, ":"); lastColon > strings.Index(hostname, "::") {
			suffix := hostname[lastColon+1:]
			if _, err := strconv.Atoi(suffix); err == nil {
				// Suffix is all digits - might be a port. Add stripped version.
				candidates = append(candidates, hostname[:lastColon])
			}
		}

		for _, candidate := range candidates {
			if ip := net.ParseIP(candidate); ip != nil {
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

	// IPv6 / IPv4-mapped IPv6 - use net.ParseIP for complete coverage
	if ip := net.ParseIP(hostname); ip != nil {
		// Normalize IPv4-mapped IPv6 (e.g., ::ffff:127.0.0.1) to IPv4
		// so that Go's IsLoopback/IsPrivate checks work correctly.
		checkIP := ip
		if ip4 := ip.To4(); ip4 != nil {
			checkIP = ip4
		}
		if checkIP.IsLoopback() {
			return fmt.Errorf("URL host %q resolves to a private/internal network (SSRF protection)", host)
		}
		if checkIP.IsLinkLocalUnicast() || checkIP.IsLinkLocalMulticast() {
			return fmt.Errorf("URL host %q resolves to a private/internal network (SSRF protection)", host)
		}
		if checkIP.IsPrivate() {
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

// validateURLHostWithDNS validates the URL host AND resolves DNS to check resolved IPs.
// This prevents DNS rebinding attacks where a hostname resolves to a private IP.
func validateURLHostWithDNS(host string) error {
	// First, do the string-based validation (fast path)
	if err := validateURLHost(host); err != nil {
		return err
	}

	// Extract hostname for DNS resolution
	hostname := host
	if strings.HasPrefix(hostname, "[") {
		// IPv6 with brackets: [::1] or [::1]:8080
		closeBracket := strings.Index(hostname, "]")
		if closeBracket > 0 {
			hostname = hostname[1:closeBracket]
		}
	} else if strings.Contains(hostname, ":") {
		// Could be IPv4:port, IPv6:port, or IPv6 without port
		// Try to parse as IPv6 first
		if strings.Contains(hostname, "::") || strings.Count(hostname, ":") >= 2 {
			// Raw IPv6 - may or may not have port
			// IPv6 addresses use colons, so last colon might be part of address
			// Try parsing the whole thing first
			if ip := net.ParseIP(hostname); ip != nil {
				// Valid IPv6 without port
			} else {
				// Might have a port - try stripping last segment after colon
				// But be careful: ::1:8080 - the :8080 is a port
				// Find the last colon and try parsing what's before it
				lastColon := strings.LastIndex(hostname, ":")
				if lastColon > 0 {
					candidate := hostname[:lastColon]
					if ip := net.ParseIP(candidate); ip != nil {
						hostname = candidate
					}
				}
			}
		} else {
			// IPv4:port - strip port
			if idx := strings.LastIndex(hostname, ":"); idx > 0 {
				hostname = hostname[:idx]
			}
		}
	}

	// Skip DNS resolution if it's already an IP address (already validated by validateURLHost)
	if ip := net.ParseIP(hostname); ip != nil {
		return nil
	}

	// Resolve DNS with timeout to prevent hanging
	// Use a context with 5 second timeout
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	r := &net.Resolver{}
	ips, err := r.LookupIPAddr(ctx, hostname)
	if err != nil {
		// DNS resolution failed or timed out - allow the request to proceed
		// The actual HTTP request will fail if the host is truly unreachable
		httpNodeLog.Debug("DNS resolution failed, allowing request", "host", hostname, "error", err)
		return nil
	}

	for _, ipAddr := range ips {
		ip := ipAddr.IP
		// Normalize IPv4-mapped IPv6 (e.g., ::ffff:127.0.0.1) to IPv4
		// so that Go's IsLoopback/IsPrivate checks work correctly.
		checkIP := ip
		if ip4 := ip.To4(); ip4 != nil {
			checkIP = ip4
		}
		if checkIP.IsLoopback() {
			return fmt.Errorf("URL host %q resolves to loopback IP %s (SSRF protection)", host, ip)
		}
		if checkIP.IsLinkLocalUnicast() || checkIP.IsLinkLocalMulticast() {
			return fmt.Errorf("URL host %q resolves to link-local IP %s (SSRF protection)", host, ip)
		}
		if checkIP.IsPrivate() {
			return fmt.Errorf("URL host %q resolves to private IP %s (SSRF protection)", host, ip)
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
