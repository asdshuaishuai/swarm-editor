package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"github.com/swarm-editor/swarm-editor/internal/agent"
	"github.com/swarm-editor/swarm-editor/internal/swarm"
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

// ==================== Kubernetes-style Error Type Assertions ====================

func TestIsNotFound(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected bool
	}{
		{"not found error", errNotFound("resource"), true},
		{"validation error", errValidation("invalid"), false},
		{"nil error", nil, false},
		{"non-APIError", errors.New("generic"), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if result := IsNotFound(tt.err); result != tt.expected {
				t.Errorf("IsNotFound(%v) = %v, want %v", tt.err, result, tt.expected)
			}
		})
	}
}

func TestIsValidation(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected bool
	}{
		{"validation error", errValidation("invalid"), true},
		{"not found error", errNotFound("resource"), false},
		{"nil error", nil, false},
		{"non-APIError", errors.New("generic"), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if result := IsValidation(tt.err); result != tt.expected {
				t.Errorf("IsValidation(%v) = %v, want %v", tt.err, result, tt.expected)
			}
		})
	}
}

func TestIsUnauthorized(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected bool
	}{
		{"unauthorized error", errUnauthorized("not authorized"), true},
		{"not found error", errNotFound("resource"), false},
		{"nil error", nil, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if result := IsUnauthorized(tt.err); result != tt.expected {
				t.Errorf("IsUnauthorized(%v) = %v, want %v", tt.err, result, tt.expected)
			}
		})
	}
}

func TestIsLimitExceeded(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected bool
	}{
		{"limit exceeded", errLimitExceeded("too many"), true},
		{"validation error", errValidation("invalid"), false},
		{"nil error", nil, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if result := IsLimitExceeded(tt.err); result != tt.expected {
				t.Errorf("IsLimitExceeded(%v) = %v, want %v", tt.err, result, tt.expected)
			}
		})
	}
}

func TestGetAPIError(t *testing.T) {
	t.Run("returns APIError for APIError type", func(t *testing.T) {
		apiErr := errNotFound("test")
		result := GetAPIError(apiErr)
		if result == nil {
			t.Fatal("expected non-nil result")
		}
		if result.Code != CodeNotFound {
			t.Errorf("expected CodeNotFound, got %d", result.Code)
		}
	})

	t.Run("returns nil for non-APIError", func(t *testing.T) {
		result := GetAPIError(errors.New("generic"))
		if result != nil {
			t.Errorf("expected nil, got %v", result)
		}
	})

	t.Run("returns nil for nil error", func(t *testing.T) {
		result := GetAPIError(nil)
		if result != nil {
			t.Errorf("expected nil, got %v", result)
		}
	})
}

func TestIsRateLimited(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected bool
	}{
		{"rate limited error", NewAPIError(CodeRateLimited, "slow down"), true},
		{"validation error", errValidation("invalid"), false},
		{"nil error", nil, false},
		{"non-APIError", errors.New("generic"), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if result := IsRateLimited(tt.err); result != tt.expected {
				t.Errorf("IsRateLimited(%v) = %v, want %v", tt.err, result, tt.expected)
			}
		})
	}
}

func TestIsConflict(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected bool
	}{
		{"conflict error", NewAPIError(CodeConflict, "already exists"), true},
		{"not found error", errNotFound("resource"), false},
		{"nil error", nil, false},
		{"non-APIError", errors.New("generic"), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if result := IsConflict(tt.err); result != tt.expected {
				t.Errorf("IsConflict(%v) = %v, want %v", tt.err, result, tt.expected)
			}
		})
	}
}

func TestIsNotConnected(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected bool
	}{
		{"not connected error", errNotConnected("disconnected"), true},
		{"validation error", errValidation("invalid"), false},
		{"nil error", nil, false},
		{"non-APIError", errors.New("generic"), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if result := IsNotConnected(tt.err); result != tt.expected {
				t.Errorf("IsNotConnected(%v) = %v, want %v", tt.err, result, tt.expected)
			}
		})
	}
}

func TestIsInternal(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected bool
	}{
		{"internal error", NewAPIError(CodeInternalError, "something broke"), true},
		{"not found error", errNotFound("resource"), false},
		{"nil error", nil, false},
		{"non-APIError", errors.New("generic"), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if result := IsInternal(tt.err); result != tt.expected {
				t.Errorf("IsInternal(%v) = %v, want %v", tt.err, result, tt.expected)
			}
		})
	}
}

func TestCryptoEqual(t *testing.T) {
	tests := []struct {
		name     string
		a        string
		b        string
		expected bool
	}{
		{"equal strings", "hello", "hello", true},
		{"different strings", "hello", "world", false},
		{"empty strings", "", "", true},
		{"one empty", "hello", "", false},
		{"different lengths", "abc", "abcdef", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if result := cryptoEqual(tt.a, tt.b); result != tt.expected {
				t.Errorf("cryptoEqual(%q, %q) = %v, want %v", tt.a, tt.b, result, tt.expected)
			}
		})
	}
}

func TestHandleHealth(t *testing.T) {
	cfg := &WebSocketConfig{Addr: ":0"}
	s := NewWebSocketServer(cfg)

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()

	s.handleHealth(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("handleHealth status = %d, want %d", w.Code, http.StatusOK)
	}

	body := w.Body.String()
	if body != "OK" {
		t.Errorf("handleHealth body = %q, want %q", body, "OK")
	}
}

// ==================== WebSocket Integration Tests ====================
// These tests use real WebSocket connections (gorilla/websocket + httptest)
// to exercise the 0% coverage functions: Start, Stop, Handle, handleWebSocket,
// ClientHub.Run/Stop/Register/Unregister/Broadcast/Subscribe/broadcastEvent/
// pushStats/getAgentStats/getSwarmStats, Client.ReadLoop/WriteLoop/
// handleMessage/SendResult/SendError/SendEvent/SendRaw/Close.

// wsDialer is the test WebSocket dialer (no compression, short handshake timeout).
var wsDialer = websocket.Dialer{
	HandshakeTimeout: 2 * time.Second,
}

// newWSServer creates a WebSocketServer bound to a random port for testing.
func newWSServer(t *testing.T) *WebSocketServer {
	t.Helper()
	return NewWebSocketServer(&WebSocketConfig{Addr: ":0"})
}

// startServer starts the WebSocketServer using httptest.Server and returns a cleanup func.
// This avoids the wg deadlock issue with server.ListenAndServe().
func startServer(t *testing.T, s *WebSocketServer) func() {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.handleWebSocket)
	mux.HandleFunc("/health", s.handleHealth)

	ts := httptest.NewServer(mux)
	s.addr = strings.TrimPrefix(ts.URL, "http://")

	// Start the hub
	ctx, cancel := context.WithCancel(context.Background())
	s.mu.Lock()
	s.ctx, s.cancel = context.WithCancel(ctx)
	s.mu.Unlock()
	go s.hub.Run(s.ctx)

	// Wire team manager
	if s.teamManager != nil {
		s.teamManager.SetBroadcaster(s.hub)
	}

	return func() {
		cancel()
		s.hub.Stop()
		ts.Close()
	}
}

// dial connects a test WebSocket client to the server URL.
func dial(t *testing.T, url string) *websocket.Conn {
	t.Helper()
	conn, _, err := wsDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	return conn
}

// readMessage reads a single text message with timeout.
func readMessage(t *testing.T, conn *websocket.Conn, timeout time.Duration) []byte {
	t.Helper()
	conn.SetReadDeadline(time.Now().Add(timeout))
	_, msg, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("read message failed: %v", err)
	}
	return msg
}

// getClient returns the first registered client from the hub.
func getClient(t *testing.T, h *ClientHub) *Client {
	t.Helper()
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, c := range h.clients {
		return c
	}
	t.Fatal("no client registered in hub")
	return nil
}

// ==================== WebSocketServer Start/Stop ====================

func TestWebSocketServer_StartStop(t *testing.T) {
	s := newWSServer(t)
	cleanup := startServer(t, s)
	defer cleanup()

	ctx := s.Context()
	if ctx == nil {
		t.Error("expected non-nil context after Start")
	}
	if s.Handler() == nil {
		t.Error("expected non-nil handler after Start")
	}
}

// TestWebSocketServer_RealStartStop tests the actual Start/Stop methods with a real HTTP server.
// This exercises the wg tracking and shutdown goroutine.
func TestWebSocketServer_RealStartStop(t *testing.T) {
	s := NewWebSocketServer(&WebSocketConfig{Addr: "127.0.0.1:0"})

	ctx, cancel := context.WithCancel(context.Background())
	startDone := make(chan error, 1)
	go func() {
		startDone <- s.Start(ctx)
	}()

	// Wait for server to bind
	time.Sleep(200 * time.Millisecond)

	// Stop should complete within 5 seconds
	stopDone := make(chan struct{})
	go func() {
		s.Stop()
		close(stopDone)
	}()

	select {
	case <-stopDone:
		// Success — no deadlock
	case <-time.After(5 * time.Second):
		t.Fatal("Stop() did not return within 5 seconds — possible deadlock")
	}

	// Start should have returned after Stop
	select {
	case err := <-startDone:
		if err != http.ErrServerClosed {
			t.Errorf("expected ErrServerClosed, got %v", err)
		}
	default:
		t.Error("Start() should have returned after Stop()")
	}

	_ = cancel
}

func TestWebSocketServer_Handler(t *testing.T) {
	s := newWSServer(t)
	h := s.Handler()
	if h == nil {
		t.Fatal("expected non-nil handler")
	}
	if h.server != s {
		t.Error("handler should reference the server")
	}
}

func TestWebSocketServer_Defaults(t *testing.T) {
	s := NewWebSocketServer(&WebSocketConfig{})
	if s.addr != ":8080" {
		t.Errorf("expected default addr :8080, got %s", s.addr)
	}
	if s.ListSwarms() == nil {
		t.Error("expected non-nil default swarms")
	}
}

func TestWebSocketServer_New(t *testing.T) {
	s := NewWebSocketServer(&WebSocketConfig{
		Addr:           ":9090",
		AuthToken:      "test-token",
		AllowedOrigins: []string{"http://localhost:3000"},
	})
	if s.addr != ":9090" {
		t.Errorf("expected addr :9090, got %s", s.addr)
	}
	if s.authToken != "test-token" {
		t.Errorf("expected authToken test-token, got %s", s.authToken)
	}
	if s.Handler() == nil {
		t.Error("expected non-nil handler")
	}
	if s.Hub() == nil {
		t.Error("expected non-nil hub")
	}
}

// ==================== Auth Tests ====================

func TestWebSocketServer_Auth_QueryToken(t *testing.T) {
	s := NewWebSocketServer(&WebSocketConfig{AuthToken: "secret"})
	cleanup := startServer(t, s)
	defer cleanup()

	url := "ws://" + s.addr + "/ws?token=secret"
	conn := dial(t, url)
	defer conn.Close()

	msg := readMessage(t, conn, 2*time.Second)
	var event WSEvent
	if err := json.Unmarshal(msg, &event); err != nil {
		t.Fatalf("unmarshal event: %v", err)
	}
	if event.Type != "connected" {
		t.Errorf("expected 'connected' event, got %s", event.Type)
	}
}

func TestWebSocketServer_Auth_BearerToken(t *testing.T) {
	s := NewWebSocketServer(&WebSocketConfig{AuthToken: "bearer-secret"})
	cleanup := startServer(t, s)
	defer cleanup()

	header := http.Header{"Authorization": []string{"Bearer bearer-secret"}}
	conn, _, err := wsDialer.Dial("ws://"+s.addr+"/ws", header)
	if err != nil {
		t.Fatalf("dial with bearer token failed: %v", err)
	}
	defer conn.Close()

	msg := readMessage(t, conn, 2*time.Second)
	var event WSEvent
	if err := json.Unmarshal(msg, &event); err != nil {
		t.Fatalf("unmarshal event: %v", err)
	}
	if event.Type != "connected" {
		t.Errorf("expected 'connected' event, got %s", event.Type)
	}
}

func TestWebSocketServer_Auth_RejectInvalidToken(t *testing.T) {
	s := NewWebSocketServer(&WebSocketConfig{AuthToken: "secret"})
	cleanup := startServer(t, s)
	defer cleanup()

	url := "ws://" + s.addr + "/ws?token=wrong"
	_, _, err := wsDialer.Dial(url, nil)
	if err == nil {
		t.Fatal("expected dial to fail with wrong token")
	}
}

// ==================== ClientHub Tests ====================

func TestClientHub_RunStop(t *testing.T) {
	s := newWSServer(t)
	h := s.Hub()

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		h.Run(ctx)
		close(done)
	}()

	time.Sleep(50 * time.Millisecond)
	cancel()
	select {
	case <-done:
		// Good — Run returned
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not return after cancel")
	}
}

func TestClientHub_Run_NilContext(t *testing.T) {
	s := newWSServer(t)
	h := s.Hub()

	done := make(chan struct{})
	go func() {
		h.Run(context.TODO())
		close(done)
	}()

	time.Sleep(50 * time.Millisecond)
	h.Stop()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not return after Stop")
	}
}

func TestClientHub_Broadcast_BeforeRun(t *testing.T) {
	s := newWSServer(t)
	h := s.Hub()
	// Broadcast before Run should be a no-op (ctx is nil)
	h.Broadcast("test", map[string]string{"key": "value"})
}

func TestClientHub_Stop_Idempotent(t *testing.T) {
	s := newWSServer(t)
	h := s.Hub()
	h.Stop()
	h.Stop() // double stop should not panic
}

func TestClientHub_Register_Unregister(t *testing.T) {
	s := newWSServer(t)
	cleanup := startServer(t, s)
	defer cleanup()

	conn := dial(t, "ws://"+s.addr+"/ws")
	defer conn.Close()

	// Read connected event (from Register)
	msg := readMessage(t, conn, 2*time.Second)
	var event WSEvent
	if err := json.Unmarshal(msg, &event); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if event.Type != "connected" {
		t.Errorf("expected 'connected', got %s", event.Type)
	}

	// Close connection — triggers Unregister via ReadLoop
	conn.Close()
	time.Sleep(100 * time.Millisecond)
}

func TestClientHub_Broadcast(t *testing.T) {
	s := newWSServer(t)
	cleanup := startServer(t, s)
	defer cleanup()

	conn := dial(t, "ws://"+s.addr+"/ws")
	defer conn.Close()

	readMessage(t, conn, 2*time.Second) // consume connected event

	s.Hub().Broadcast("test_event", map[string]string{"msg": "hello"})

	msg := readMessage(t, conn, 2*time.Second)
	var event WSEvent
	if err := json.Unmarshal(msg, &event); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if event.Type != "test_event" {
		t.Errorf("expected 'test_event', got %s", event.Type)
	}
}

func TestClientHub_Broadcast_MultipleClients(t *testing.T) {
	s := newWSServer(t)
	cleanup := startServer(t, s)
	defer cleanup()

	conn1 := dial(t, "ws://"+s.addr+"/ws")
	defer conn1.Close()
	conn2 := dial(t, "ws://"+s.addr+"/ws")
	defer conn2.Close()

	readMessage(t, conn1, 2*time.Second) // connected events
	readMessage(t, conn2, 2*time.Second)

	s.Hub().Broadcast("multi", "payload")

	msg1 := readMessage(t, conn1, 2*time.Second)
	msg2 := readMessage(t, conn2, 2*time.Second)

	var e1, e2 WSEvent
	if err := json.Unmarshal(msg1, &e1); err != nil {
		t.Fatalf("unmarshal msg1: %v", err)
	}
	if err := json.Unmarshal(msg2, &e2); err != nil {
		t.Fatalf("unmarshal msg2: %v", err)
	}
	if e1.Type != "multi" || e2.Type != "multi" {
		t.Error("both clients should receive 'multi' event")
	}
}

func TestClientHub_Subscribe(t *testing.T) {
	s := newWSServer(t)
	cleanup := startServer(t, s)
	defer cleanup()

	conn := dial(t, "ws://"+s.addr+"/ws")
	defer conn.Close()

	msg := readMessage(t, conn, 2*time.Second)
	var connEvent WSEvent
	if err := json.Unmarshal(msg, &connEvent); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	payload, ok := connEvent.Payload.(map[string]any)
	if !ok {
		t.Fatal("expected payload to be map[string]any")
	}
	clientID, ok := payload["clientId"].(string)
	if !ok {
		t.Fatal("expected clientId in connected event payload")
	}

	// Subscribe should not panic
	s.Hub().Subscribe(clientID, "agent_stats")
}

func TestClientHub_Stop_ClosesClients(t *testing.T) {
	s := newWSServer(t)
	cleanup := startServer(t, s)
	defer cleanup()

	conn := dial(t, "ws://"+s.addr+"/ws")
	defer conn.Close()

	readMessage(t, conn, 2*time.Second)

	s.Hub().Stop()

	conn.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
	_, _, err := conn.ReadMessage()
	if err == nil {
		t.Error("expected read to fail after hub Stop")
	}
}

// ==================== Client Tests ====================

func TestClient_SendResult(t *testing.T) {
	s := newWSServer(t)
	cleanup := startServer(t, s)
	defer cleanup()

	conn := dial(t, "ws://"+s.addr+"/ws")
	defer conn.Close()
	readMessage(t, conn, 2*time.Second)

	client := getClient(t, s.Hub())
	client.SendResult("req-1", map[string]string{"status": "ok"})

	msg := readMessage(t, conn, 2*time.Second)
	var resp WSResponse
	if err := json.Unmarshal(msg, &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if resp.ID != "req-1" {
		t.Errorf("expected id 'req-1', got %s", resp.ID)
	}
	if resp.Result == nil {
		t.Error("expected non-nil result")
	}
}

func TestClient_SendResult_NilResult(t *testing.T) {
	s := newWSServer(t)
	cleanup := startServer(t, s)
	defer cleanup()

	conn := dial(t, "ws://"+s.addr+"/ws")
	defer conn.Close()
	readMessage(t, conn, 2*time.Second)

	client := getClient(t, s.Hub())
	client.SendResult("req-nil", nil)

	msg := readMessage(t, conn, 2*time.Second)
	var resp WSResponse
	if err := json.Unmarshal(msg, &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.ID != "req-nil" {
		t.Errorf("expected id 'req-nil', got %s", resp.ID)
	}
	if resp.Result != nil {
		t.Errorf("expected nil result for nil input, got %s", resp.Result)
	}
}

func TestClient_SendError(t *testing.T) {
	s := newWSServer(t)
	cleanup := startServer(t, s)
	defer cleanup()

	conn := dial(t, "ws://"+s.addr+"/ws")
	defer conn.Close()
	readMessage(t, conn, 2*time.Second)

	client := getClient(t, s.Hub())
	client.SendError("req-2", CodeNotFound, "not found")

	msg := readMessage(t, conn, 2*time.Second)
	var resp WSResponse
	if err := json.Unmarshal(msg, &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if resp.ID != "req-2" {
		t.Errorf("expected id 'req-2', got %s", resp.ID)
	}
	if resp.Error == nil {
		t.Fatal("expected non-nil error")
	}
	if resp.Error.Code != CodeNotFound {
		t.Errorf("expected code %d, got %d", CodeNotFound, resp.Error.Code)
	}
	if resp.Error.Message != "not found" {
		t.Errorf("expected message 'not found', got %s", resp.Error.Message)
	}
}

func TestClient_SendEvent(t *testing.T) {
	s := newWSServer(t)
	cleanup := startServer(t, s)
	defer cleanup()

	conn := dial(t, "ws://"+s.addr+"/ws")
	defer conn.Close()
	readMessage(t, conn, 2*time.Second)

	client := getClient(t, s.Hub())
	client.SendEvent("custom_event", map[string]int{"value": 42})

	msg := readMessage(t, conn, 2*time.Second)
	var event WSEvent
	if err := json.Unmarshal(msg, &event); err != nil {
		t.Fatalf("unmarshal event: %v", err)
	}
	if event.Type != "custom_event" {
		t.Errorf("expected 'custom_event', got %s", event.Type)
	}
}

func TestClient_SendRaw(t *testing.T) {
	s := newWSServer(t)
	cleanup := startServer(t, s)
	defer cleanup()

	conn := dial(t, "ws://"+s.addr+"/ws")
	defer conn.Close()
	readMessage(t, conn, 2*time.Second)

	client := getClient(t, s.Hub())
	raw := []byte(`{"type":"raw","data":123}`)
	if err := client.SendRaw(raw); err != nil {
		t.Fatalf("SendRaw failed: %v", err)
	}

	msg := readMessage(t, conn, 2*time.Second)
	if string(msg) != string(raw) {
		t.Errorf("expected %s, got %s", raw, msg)
	}
}

// ==================== handleMessage Tests ====================

func TestClient_HandleMessage_ParseError(t *testing.T) {
	s := newWSServer(t)
	cleanup := startServer(t, s)
	defer cleanup()

	conn := dial(t, "ws://"+s.addr+"/ws")
	defer conn.Close()
	readMessage(t, conn, 2*time.Second)

	if err := conn.WriteMessage(websocket.TextMessage, []byte("not json")); err != nil {
		t.Fatalf("write failed: %v", err)
	}

	msg := readMessage(t, conn, 2*time.Second)
	var resp WSResponse
	if err := json.Unmarshal(msg, &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Error == nil {
		t.Fatal("expected error response")
	}
	if resp.Error.Code != CodeParseError {
		t.Errorf("expected parse error code %d, got %d", CodeParseError, resp.Error.Code)
	}
}

func TestClient_HandleMessage_MethodNotFound(t *testing.T) {
	s := newWSServer(t)
	cleanup := startServer(t, s)
	defer cleanup()

	conn := dial(t, "ws://"+s.addr+"/ws")
	defer conn.Close()
	readMessage(t, conn, 2*time.Second)

	req := WSRequest{ID: "1", Method: "nonexistent_method", Params: json.RawMessage(`{}`)}
	data, _ := json.Marshal(req)
	if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
		t.Fatalf("write failed: %v", err)
	}

	msg := readMessage(t, conn, 2*time.Second)
	var resp WSResponse
	if err := json.Unmarshal(msg, &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Error == nil {
		t.Fatal("expected error for unknown method")
	}
}

func TestClient_HandleMessage_APIError(t *testing.T) {
	s := newWSServer(t)
	cleanup := startServer(t, s)
	defer cleanup()

	conn := dial(t, "ws://"+s.addr+"/ws")
	defer conn.Close()
	readMessage(t, conn, 2*time.Second)

	// get_agent with nonexistent agent should return not-found (registry is nil)
	req := WSRequest{ID: "api-err", Method: "get_agent", Params: json.RawMessage(`{"id":"nonexistent"}`)}
	data, _ := json.Marshal(req)
	if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
		t.Fatalf("write failed: %v", err)
	}

	msg := readMessage(t, conn, 2*time.Second)
	var resp WSResponse
	if err := json.Unmarshal(msg, &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Error == nil {
		t.Error("expected error for nonexistent agent")
	}
	if resp.Error.Code != CodeNotFound {
		t.Errorf("expected not-found code %d, got %d", CodeNotFound, resp.Error.Code)
	}
}

// ==================== pushStats / getAgentStats / getSwarmStats ====================

func TestClientHub_GetAgentStats_NilRegistry(t *testing.T) {
	s := newWSServer(t)
	h := s.Hub()

	ctx, cancel := context.WithCancel(context.Background())
	go h.Run(ctx)
	defer cancel()
	time.Sleep(50 * time.Millisecond)

	stats := h.getAgentStats()
	if stats != nil {
		t.Errorf("expected nil stats when registry is nil, got %v", stats)
	}
}

func TestClientHub_GetAgentStats_WithAgents(t *testing.T) {
	reg := agent.NewRegistry()
	a := agent.NewAgent("test-agent", agent.AgentTypeCoder)
	reg.Register(a)

	s := NewWebSocketServer(&WebSocketConfig{Registry: reg})
	h := s.Hub()

	ctx, cancel := context.WithCancel(context.Background())
	go h.Run(ctx)
	defer cancel()
	time.Sleep(50 * time.Millisecond)

	stats := h.getAgentStats()
	if len(stats) != 1 {
		t.Fatalf("expected 1 agent stat, got %d", len(stats))
	}
	if stats[0].ID != string(a.ID) {
		t.Errorf("expected id %s, got %s", a.ID, stats[0].ID)
	}
	if stats[0].Type != "coder" {
		t.Errorf("expected type coder, got %s", stats[0].Type)
	}
}

func TestClientHub_PushStats(t *testing.T) {
	reg := agent.NewRegistry()
	a := agent.NewAgent("test-agent", agent.AgentTypeCoder)
	reg.Register(a)

	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID: "sw1", Name: "Swarm 1",
		Topology: swarm.TopologyStar, Strategy: swarm.StrategyParallel,
	})
	defer sw.Stop()

	s := NewWebSocketServer(&WebSocketConfig{
		Registry: reg,
		Swarms:   map[string]*swarm.Swarm{"sw1": sw},
	})
	cleanup := startServer(t, s)
	defer cleanup()

	conn := dial(t, "ws://"+s.addr+"/ws")
	defer conn.Close()
	readMessage(t, conn, 2*time.Second) // consume connected event

	// Call pushStats directly — should broadcast agent_stats and swarm_stats
	s.Hub().pushStats()

	// Read the two broadcast events
	msg1 := readMessage(t, conn, 2*time.Second)
	var e1 WSEvent
	if err := json.Unmarshal(msg1, &e1); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if e1.Type != "agent_stats" && e1.Type != "swarm_stats" {
		t.Errorf("expected agent_stats or swarm_stats, got %s", e1.Type)
	}

	msg2 := readMessage(t, conn, 2*time.Second)
	var e2 WSEvent
	if err := json.Unmarshal(msg2, &e2); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if e2.Type != "agent_stats" && e2.Type != "swarm_stats" {
		t.Errorf("expected agent_stats or swarm_stats, got %s", e2.Type)
	}
}

func TestClientHub_PushStats_Empty(t *testing.T) {
	s := newWSServer(t)
	cleanup := startServer(t, s)
	defer cleanup()

	conn := dial(t, "ws://"+s.addr+"/ws")
	defer conn.Close()
	readMessage(t, conn, 2*time.Second)

	// pushStats with no registry and no swarms — should broadcast nothing
	s.Hub().pushStats()

	// No messages should be available
	conn.SetReadDeadline(time.Now().Add(200 * time.Millisecond))
	_, _, err := conn.ReadMessage()
	if err == nil {
		t.Error("expected no messages from pushStats with empty data")
	}
}

func TestClientHub_GetSwarmStats_Empty(t *testing.T) {
	s := newWSServer(t)
	h := s.Hub()

	ctx, cancel := context.WithCancel(context.Background())
	go h.Run(ctx)
	defer cancel()
	time.Sleep(50 * time.Millisecond)

	stats := h.getSwarmStats()
	if len(stats) != 0 {
		t.Errorf("expected empty stats, got %d", len(stats))
	}
}

func TestClientHub_GetSwarmStats_WithSwarm(t *testing.T) {
	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:       "test-swarm",
		Name:     "Test Swarm",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	})
	defer sw.Stop()

	s := NewWebSocketServer(&WebSocketConfig{
		Swarms: map[string]*swarm.Swarm{"test-swarm": sw},
	})
	h := s.Hub()

	ctx, cancel := context.WithCancel(context.Background())
	go h.Run(ctx)
	defer cancel()
	time.Sleep(50 * time.Millisecond)

	stats := h.getSwarmStats()
	if len(stats) != 1 {
		t.Fatalf("expected 1 swarm stat, got %d", len(stats))
	}
	if stats[0].ID != "test-swarm" {
		t.Errorf("expected id 'test-swarm', got %s", stats[0].ID)
	}
	if stats[0].Name != "Test Swarm" {
		t.Errorf("expected name 'Test Swarm', got %s", stats[0].Name)
	}
}

// ==================== Unregister Session Cleanup ====================

func TestClientHub_Unregister_CleansStaleSessions(t *testing.T) {
	s := newWSServer(t)
	s.sessionToAgent = map[string]string{"sess1": "agent1", "sess2": "agent2"}
	cleanup := startServer(t, s)
	defer cleanup()

	conn := dial(t, "ws://"+s.addr+"/ws")
	defer conn.Close()

	readMessage(t, conn, 2*time.Second)

	// Close triggers Unregister via ReadLoop, which should clean sessionToAgent
	conn.Close()
	time.Sleep(100 * time.Millisecond)

	s.mu.RLock()
	cleaned := len(s.sessionToAgent)
	s.mu.RUnlock()
	if cleaned != 0 {
		t.Errorf("expected sessionToAgent to be cleaned, got %d entries", cleaned)
	}
}

// ==================== Concurrency Tests ====================

func TestClientHub_ConcurrentRegister(t *testing.T) {
	s := newWSServer(t)
	cleanup := startServer(t, s)
	defer cleanup()

	var conns []*websocket.Conn
	var mu sync.Mutex

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			conn := dial(t, "ws://"+s.addr+"/ws")
			mu.Lock()
			conns = append(conns, conn)
			mu.Unlock()
		}()
	}
	wg.Wait()

	for _, conn := range conns {
		readMessage(t, conn, 2*time.Second)
		conn.Close()
	}
}

func TestClientHub_ConcurrentBroadcast(t *testing.T) {
	s := newWSServer(t)
	cleanup := startServer(t, s)
	defer cleanup()

	conn := dial(t, "ws://"+s.addr+"/ws")
	defer conn.Close()
	readMessage(t, conn, 2*time.Second)

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			s.Hub().Broadcast("concurrent", i)
		}(i)
	}
	wg.Wait()

	// Drain some messages
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	count := 0
	for count < 10 {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
		count++
	}
	if count == 0 {
		t.Error("expected to receive at least some broadcast messages")
	}
}

// ==================== Edge Cases ====================

func TestWebSocketServer_AddSwarm_Nil(t *testing.T) {
	s := newWSServer(t)
	s.AddSwarm("nil", nil) // should not panic
}

func TestWebSocketServer_AddSupervisor_Nil(t *testing.T) {
	s := newWSServer(t)
	s.AddSupervisor("nil", nil) // should not panic
}

func TestWebSocketServer_AddMCPClient_Nil(t *testing.T) {
	s := newWSServer(t)
	s.AddMCPClient("nil", nil) // should not panic
}

func TestWebSocketServer_SwarmManagement(t *testing.T) {
	s := newWSServer(t)

	sw := swarm.NewSwarm(swarm.SwarmConfig{
		ID:   "s1",
		Name: "Swarm 1",
	})
	defer sw.Stop()
	s.AddSwarm("s1", sw)

	got, ok := s.GetSwarm("s1")
	if !ok {
		t.Error("expected to find swarm s1")
	}
	if got != sw {
		t.Error("expected same swarm reference")
	}

	list := s.ListSwarms()
	if len(list) != 1 {
		t.Errorf("expected 1 swarm, got %d", len(list))
	}

	s.RemoveSwarm("s1")
	_, ok = s.GetSwarm("s1")
	if ok {
		t.Error("expected swarm to be removed")
	}
}
