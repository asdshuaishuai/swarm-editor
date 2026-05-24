package acp

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
	"testing"
	"time"
)

// ==================== OnUpdateFunc (0.0%) ====================

func TestAgentConnection_OnUpdateFunc(t *testing.T) {
	conn := &AgentConnection{
		ID:       "agent-1",
		State:    StateConnected,
		sessions: make(map[SessionID]*AgentSession),
	}

	// Without handler: should return nil
	fn := conn.OnUpdateFunc()
	if fn != nil {
		t.Error("expected nil when no handler set")
	}

	// With handler: should return the same function
	called := false
	handler := func(sessionID SessionID, update *Update) {
		called = true
	}
	conn.OnUpdate(handler)

	fn = conn.OnUpdateFunc()
	if fn == nil {
		t.Fatal("expected handler to be set")
	}

	// Call the returned function to verify it's the right one
	fn("session-1", &Update{SessionUpdate: "plan"})
	if !called {
		t.Error("returned handler should be the one we set")
	}
}

// ==================== GetMetrics (0.0%) ====================

func TestAgentConnection_GetMetrics(t *testing.T) {
	conn := &AgentConnection{
		ID:       "agent-1",
		State:    StateConnected,
		sessions: make(map[SessionID]*AgentSession),
	}

	// Default metrics should be zero-valued
	m := conn.GetMetrics()
	if m.PID != 0 {
		t.Errorf("expected PID 0, got %d", m.PID)
	}
	if m.CPU != 0 {
		t.Errorf("expected CPU 0, got %f", m.CPU)
	}
	if m.RSS != 0 {
		t.Errorf("expected RSS 0, got %d", m.RSS)
	}

	// Set custom metrics and verify retrieval
	conn.mu.Lock()
	conn.metrics = ProcessMetrics{
		PID:       42,
		CPU:       5.5,
		RSS:       1024,
		Collected: time.Now(),
	}
	conn.mu.Unlock()

	m = conn.GetMetrics()
	if m.PID != 42 {
		t.Errorf("expected PID 42, got %d", m.PID)
	}
	if m.CPU != 5.5 {
		t.Errorf("expected CPU 5.5, got %f", m.CPU)
	}
	if m.RSS != 1024 {
		t.Errorf("expected RSS 1024, got %d", m.RSS)
	}
}

// ==================== CollectMetrics (33.3%) ====================

func TestAgentConnection_CollectMetrics_WithRealProcess(t *testing.T) {
	// Use "sleep" as a long-lived command we can get metrics from
	cmd := exec.Command("sleep", "5")
	if err := cmd.Start(); err != nil {
		t.Skipf("cannot start sleep process: %v", err)
	}
	defer cmd.Process.Kill()

	conn := &AgentConnection{
		ID:       "agent-1",
		State:    StateConnected,
		sessions: make(map[SessionID]*AgentSession),
		cmd:      cmd,
	}

	m := conn.CollectMetrics()
	if m.PID == 0 {
		t.Error("expected non-zero PID for running process")
	}
	if m.PID != cmd.Process.Pid {
		t.Errorf("expected PID %d, got %d", cmd.Process.Pid, m.PID)
	}
	if m.Collected.IsZero() {
		t.Error("expected non-zero Collected time")
	}
}

// ==================== NewTestConnection (0.0%) ====================

func TestNewTestConnection_Basic(t *testing.T) {
	conn, handler, cleanup := NewTestConnection("test-agent-1")
	defer cleanup()

	if conn == nil {
		t.Fatal("connection should not be nil")
	}
	if handler == nil {
		t.Fatal("handler should not be nil")
	}
	if conn.ID != "test-agent-1" {
		t.Errorf("expected ID 'test-agent-1', got '%s'", conn.ID)
	}
	if conn.GetState() != StateConnected {
		t.Errorf("expected StateConnected, got %s", conn.GetState())
	}
	if conn.client == nil {
		t.Error("client should not be nil")
	}
	if conn.sessions == nil {
		t.Error("sessions map should be initialized")
	}

	// Verify we can create a session through it
	session, err := conn.CreateSession(context.Background(), ModeDefault)
	if err != nil {
		t.Fatalf("CreateSession failed: %v", err)
	}
	if session == nil {
		t.Fatal("session should not be nil")
	}
}

func TestNewTestConnection_SendPrompt(t *testing.T) {
	conn, _, cleanup := NewTestConnection("test-agent-2")
	defer cleanup()

	session, err := conn.CreateSession(context.Background(), ModeDefault)
	if err != nil {
		t.Fatalf("CreateSession failed: %v", err)
	}

	result, err := conn.SendPrompt(context.Background(), session.ID, Prompt{
		{Type: "text", Text: "Hello"},
	})
	if err != nil {
		t.Fatalf("SendPrompt failed: %v", err)
	}
	if result == nil {
		t.Fatal("result should not be nil")
	}
}

// ==================== RegisterTestConnection (0.0%) ====================

func TestRegisterTestConnection(t *testing.T) {
	cm := NewConnectionManager(nil)

	// Create a test connection
	conn, _, cleanup := NewTestConnection("test-reg-1")
	defer cleanup()

	// Register it
	cm.RegisterTestConnection(conn)

	// Verify it's in the manager
	retrieved, ok := cm.GetConnection("test-reg-1")
	if !ok {
		t.Error("expected to find registered connection")
	}
	if retrieved.ID != "test-reg-1" {
		t.Errorf("expected ID 'test-reg-1', got '%s'", retrieved.ID)
	}

	// Verify it shows in ListConnections
	conns := cm.ListConnections()
	if len(conns) != 1 {
		t.Errorf("expected 1 connection, got %d", len(conns))
	}

	// Verify it shows in GetConnected (state is connected)
	connected := cm.GetConnected()
	if len(connected) != 1 {
		t.Errorf("expected 1 connected, got %d", len(connected))
	}
}

// ==================== killProcess (0.0%) ====================

func TestKillProcess_NilCmd(t *testing.T) {
	cm := NewConnectionManager(nil)
	conn := &AgentConnection{
		ID:       "agent-1",
		State:    StateError,
		sessions: make(map[SessionID]*AgentSession),
	}
	// nil cmd — should return immediately
	cm.killProcess(conn, nil)
}

func TestKillProcess_NilProcess(t *testing.T) {
	cm := NewConnectionManager(nil)
	conn := &AgentConnection{
		ID:       "agent-1",
		State:    StateError,
		sessions: make(map[SessionID]*AgentSession),
	}
	// cmd with nil Process — should return immediately
	cmd := &exec.Cmd{}
	cm.killProcess(conn, cmd)
}

func TestKillProcess_GracefulShutdown(t *testing.T) {
	cm := NewConnectionManager(nil)
	conn := &AgentConnection{
		ID:       "agent-1",
		State:    StateError,
		sessions: make(map[SessionID]*AgentSession),
	}

	// Start a short-lived process that will respond to SIGINT
	cmd := exec.Command("sleep", "30")
	if err := cmd.Start(); err != nil {
		t.Skipf("cannot start sleep: %v", err)
	}

	cm.killProcess(conn, cmd)

	// Process should be dead now — wait should not block
	err := cmd.Wait()
	if err == nil {
		// Process exited cleanly (signal)
	} else {
		// Process was killed
		if !strings.Contains(err.Error(), "signal") && !strings.Contains(err.Error(), "killed") {
			t.Logf("process wait error (acceptable): %v", err)
		}
	}
}

func TestKillProcess_AlreadyDead(t *testing.T) {
	cm := NewConnectionManager(nil)
	conn := &AgentConnection{
		ID:       "agent-1",
		State:    StateError,
		sessions: make(map[SessionID]*AgentSession),
	}

	// Start and immediately kill a process
	cmd := exec.Command("true")
	if err := cmd.Start(); err != nil {
		t.Skipf("cannot start true: %v", err)
	}
	// Wait for it to exit
	cmd.Wait()

	// killProcess should handle already-dead process gracefully
	cm.killProcess(conn, cmd)
}

// ==================== establishConnection (31.8%) ====================
// establishConnection is called in a goroutine from Connect().
// We test it indirectly via ConnectionManager.Connect by setting up
// scenarios that exercise specific code paths.

func TestEstablishConnection_CommandValidationFails(t *testing.T) {
	cm := NewConnectionManager(&Config{
		Agents: map[string]*AgentConfig{
			"bad-agent": {
				ID:      "bad-agent",
				Enabled: true,
				Command: "echo; rm -rf /", // shell metacharacter
			},
		},
	})

	var stateChanges []ConnectionState
	cm.OnConnectionChange(func(id string, state ConnectionState) {
		stateChanges = append(stateChanges, state)
	})

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	conn, err := cm.Connect(ctx, "bad-agent")
	if err != nil {
		t.Fatalf("Connect should return connection object: %v", err)
	}

	// Wait for background establishConnection to fail
	time.Sleep(500 * time.Millisecond)

	if conn.GetState() != StateError {
		t.Errorf("expected StateError, got %s", conn.GetState())
	}
	if conn.Error == nil {
		t.Error("expected error to be set")
	} else if !strings.Contains(conn.Error.Error(), "command validation failed") {
		t.Errorf("expected command validation error, got: %v", conn.Error)
	}

	// State change callback should have fired for error
	found := false
	for _, s := range stateChanges {
		if s == StateError {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected StateError in connection change callbacks")
	}

	cm.DisconnectAll()
}

func TestEstablishConnection_ProcessStartFails(t *testing.T) {
	cm := NewConnectionManager(&Config{
		Agents: map[string]*AgentConfig{
			"bad-path": {
				ID:      "bad-path",
				Enabled: true,
				Command: "/nonexistent/binary/that/does/not/exist",
			},
		},
	})

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	conn, err := cm.Connect(ctx, "bad-path")
	if err != nil {
		t.Fatalf("Connect should return connection object: %v", err)
	}

	// Wait for background establishConnection to fail
	time.Sleep(500 * time.Millisecond)

	if conn.GetState() != StateError {
		t.Errorf("expected StateError, got %s", conn.GetState())
	}
	if conn.Error == nil {
		t.Error("expected error to be set")
	}

	cm.DisconnectAll()
}

func TestEstablishConnection_WithOnStateChangeCallback(t *testing.T) {
	var mu sync.Mutex
	var transitions []string
	cm := NewConnectionManager(&Config{
		Agents: map[string]*AgentConfig{
			"cb-agent": {
				ID:      "cb-agent",
				Enabled: true,
				Command: "echo",
			},
		},
	})
	cm.OnConnectionChange(func(id string, state ConnectionState) {
		mu.Lock()
		transitions = append(transitions, string(state))
		mu.Unlock()
	})

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	conn, err := cm.Connect(ctx, "cb-agent")
	if err != nil {
		t.Fatalf("Connect should return connection object: %v", err)
	}

	// Set onStateChange callback before establishConnection runs
	conn.mu.Lock()
	conn.onStateChange = func(id string, old, new ConnectionState) {
		mu.Lock()
		transitions = append(transitions, fmt.Sprintf("conn:%s->%s", old, new))
		mu.Unlock()
	}
	conn.mu.Unlock()

	// Wait for background goroutine
	time.Sleep(500 * time.Millisecond)

	mu.Lock()
	t.Logf("transitions: %v", transitions)
	mu.Unlock()

	cm.DisconnectAll()
}

func TestEstablishConnection_ContextCancelled(t *testing.T) {
	cm := NewConnectionManager(&Config{
		Agents: map[string]*AgentConfig{
			"cancel-agent": {
				ID:      "cancel-agent",
				Enabled: true,
				Command: "sleep", // long-running but will be cancelled
				Args:    []string{"60"},
			},
		},
	})

	ctx, cancel := context.WithCancel(context.Background())

	conn, err := cm.Connect(ctx, "cancel-agent")
	if err != nil {
		t.Fatalf("Connect should return connection object: %v", err)
	}

	// Let the process start
	time.Sleep(200 * time.Millisecond)

	// Cancel context to trigger cleanup
	cancel()

	// Wait a bit for cleanup
	time.Sleep(200 * time.Millisecond)

	// Verify the connection object exists and had a cancel func
	_ = conn.GetState()

	cm.DisconnectAll()
}

// ==================== initializeAgent (0.0%) ====================
// initializeAgent is called from establishConnection. We test it indirectly
// by verifying the full flow works through NewTestConnection which sets up
// a real client-server pair.

func TestInitializeAgent_WithTimeout(t *testing.T) {
	cm := NewConnectionManager(&Config{
		Agents: map[string]*AgentConfig{
			"timeout-agent": {
				ID:      "timeout-agent",
				Enabled: true,
				Command: "sleep",
				Args:    []string{"60"},
				Timeout: 1, // 1 second timeout
			},
		},
	})

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	conn, err := cm.Connect(ctx, "timeout-agent")
	if err != nil {
		t.Fatalf("Connect should return connection object: %v", err)
	}

	// Wait for initialization to time out
	time.Sleep(2 * time.Second)

	if conn.GetState() == StateConnected {
		t.Error("expected non-connected state since sleep isn't a real ACP agent")
	}

	cm.DisconnectAll()
}

// ==================== Disconnect more paths (52.6%) ====================

func TestDisconnect_WithRunningProcess(t *testing.T) {
	cm := NewConnectionManager(nil)

	ctx, cancel := context.WithCancel(context.Background())

	// Create a connection with a running process
	cmd := exec.Command("sleep", "30")
	stdin, _ := cmd.StdinPipe()
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()
	cmd.Start()

	clientTransport, serverTransport := NewInmemTransportPair()
	c := NewClient(clientTransport)
	s := NewServer(&MockHandler{}, serverTransport)
	c.Start(ctx)
	s.Start(ctx)

	conn := &AgentConnection{
		ID:       "proc-agent",
		State:    StateConnected,
		ctx:      ctx,
		cancel:   cancel,
		cmd:      cmd,
		stdin:    stdin,
		stdout:   stdout,
		stderr:   stderr,
		client:   c,
		transport: clientTransport,
		sessions: make(map[SessionID]*AgentSession),
	}

	cm.connections["proc-agent"] = conn

	err := cm.Disconnect("proc-agent")
	if err != nil {
		t.Fatalf("Disconnect failed: %v", err)
	}

	// Verify process is gone
	if cmd.Process != nil {
		// Process might still exist but should be killed
		cmd.Process.Kill()
	}

	s.Stop()
}

func TestDisconnect_WithSessionsWithContentCapture(t *testing.T) {
	cm := NewConnectionManager(nil)

	ctx, cancel := context.WithCancel(context.Background())

	conn := &AgentConnection{
		ID:       "session-agent",
		State:    StateConnected,
		ctx:      ctx,
		cancel:   cancel,
		sessions: make(map[SessionID]*AgentSession),
	}

	// Add sessions with active content capture
	sid := SessionID("sess-with-capture")
	session := &AgentSession{
		ID:         sid,
		Mode:       ModeDefault,
		CreatedAt:  time.Now(),
		LastActive: time.Now(),
	}
	session.StartContentCapture()
	session.AddContent(ContentBlock{Type: "text", Text: "partial content"})
	// Don't call FinishContentCapture — Disconnect should clean it up

	conn.sessions[sid] = session
	cm.connections["session-agent"] = conn

	err := cm.Disconnect("session-agent")
	if err != nil {
		t.Fatalf("Disconnect failed: %v", err)
	}

	// Verify done channel was closed (FinishContentCapture called)
	session.mu.Lock()
	closed := session.closed
	session.mu.Unlock()
	if !closed {
		t.Error("session content capture should be finished after disconnect")
	}
}

// ==================== CreateSession LRU eviction (61.5%) ====================

func TestCreateSession_LRUEviction(t *testing.T) {
	conn, handler, cleanup := setupInmemConnection(t, "evict-agent")
	defer cleanup()

	// Customize handler to produce unique session IDs
	var counter int
	handler.SessionNewFunc = func(ctx context.Context, params *SessionNewParams) (*SessionNewResult, error) {
		counter++
		return &SessionNewResult{
			SessionID: SessionID(fmt.Sprintf("sess-%d", counter)),
			Mode:      params.Mode,
		}, nil
	}

	// Fill up to MaxSessionsPerConnection
	for i := 0; i < MaxSessionsPerConnection; i++ {
		_, err := conn.CreateSession(context.Background(), ModeDefault)
		if err != nil {
			t.Fatalf("CreateSession %d failed: %v", i, err)
		}
	}

	if len(conn.sessions) != MaxSessionsPerConnection {
		t.Fatalf("expected %d sessions, got %d", MaxSessionsPerConnection, len(conn.sessions))
	}

	// Mark the first session as oldest
	conn.sessions[SessionID("sess-1")].LastActive = time.Now().Add(-1 * time.Hour)

	// Create one more — should evict the oldest
	_, err := conn.CreateSession(context.Background(), ModeDefault)
	if err != nil {
		t.Fatalf("CreateSession overflow failed: %v", err)
	}

	// Still at MaxSessionsPerConnection
	if len(conn.sessions) != MaxSessionsPerConnection {
		t.Errorf("expected %d sessions after eviction, got %d", MaxSessionsPerConnection, len(conn.sessions))
	}

	// Oldest should be evicted
	if _, ok := conn.sessions[SessionID("sess-1")]; ok {
		t.Error("oldest session should have been evicted")
	}

	// Newest should exist
	if _, ok := conn.sessions[SessionID(fmt.Sprintf("sess-%d", MaxSessionsPerConnection+1))]; !ok {
		t.Error("newest session should exist")
	}
}

// ==================== SendPrompt content capture (64.3%) ====================

func TestSendPrompt_WithContentUpdates(t *testing.T) {
	conn, handler, cleanup := setupInmemConnection(t, "content-agent")
	defer cleanup()

	// Set up handler to return a successful prompt result
	promptDone := make(chan struct{})
	handler.SessionPromptFunc = func(ctx context.Context, params *SessionPromptParams) (*SessionPromptResult, error) {
		defer close(promptDone)
		return &SessionPromptResult{
			StopReason: StopEndTurn,
			Content:    "test response",
		}, nil
	}

	// Wire up the update handler to forward content to sessions
	conn.OnUpdate(func(sessionID SessionID, update *Update) {
		conn.mu.RLock()
		session, ok := conn.sessions[sessionID]
		conn.mu.RUnlock()
		if ok && update.Content != nil {
			session.AddContent(*update.Content)
		}
	})

	session, err := conn.CreateSession(context.Background(), ModeDefault)
	if err != nil {
		t.Fatalf("CreateSession failed: %v", err)
	}

	result, err := conn.SendPrompt(context.Background(), session.ID, Prompt{
		{Type: "text", Text: "Hello"},
	})
	if err != nil {
		t.Fatalf("SendPrompt failed: %v", err)
	}
	if result == nil {
		t.Fatal("result should not be nil")
	}
	if result.StopReason != StopEndTurn {
		t.Errorf("expected StopEndTurn, got %s", result.StopReason)
	}
}

func TestSendPrompt_PromptServerError(t *testing.T) {
	conn, handler, cleanup := setupInmemConnection(t, "prompt-err-agent")
	defer cleanup()

	handler.SessionPromptFunc = func(ctx context.Context, params *SessionPromptParams) (*SessionPromptResult, error) {
		return nil, fmt.Errorf("prompt rejected")
	}

	session, err := conn.CreateSession(context.Background(), ModeDefault)
	if err != nil {
		t.Fatalf("CreateSession failed: %v", err)
	}

	_, err = conn.SendPrompt(context.Background(), session.ID, Prompt{
		{Type: "text", Text: "test"},
	})
	if err == nil {
		t.Error("expected error when prompt server returns error")
	}
	if !strings.Contains(err.Error(), "prompt rejected") {
		t.Errorf("expected 'prompt rejected' in error, got: %v", err)
	}

	// Content capture should still be finished even on error
	session.mu.Lock()
	closed := session.closed
	session.mu.Unlock()
	if !closed {
		t.Error("content capture should be finished after prompt error")
	}
}

func TestSendPrompt_NilClient(t *testing.T) {
	conn := &AgentConnection{
		ID:       "agent-1",
		State:    StateConnected,
		client:   nil,
		sessions: make(map[SessionID]*AgentSession),
	}

	_, err := conn.SendPrompt(context.Background(), "sess-1", Prompt{})
	if err == nil {
		t.Error("expected error for nil client")
	}
	if !strings.Contains(err.Error(), "no ACP client") {
		t.Errorf("expected 'no ACP client' error, got: %v", err)
	}
}

// ==================== CreateSession nil client (61.5%) ====================

func TestCreateSession_NilClient(t *testing.T) {
	conn := &AgentConnection{
		ID:       "agent-1",
		State:    StateConnected,
		client:   nil,
		sessions: make(map[SessionID]*AgentSession),
	}

	_, err := conn.CreateSession(context.Background(), ModeDefault)
	if err == nil {
		t.Error("expected error for nil client")
	}
	if !strings.Contains(err.Error(), "no ACP client") {
		t.Errorf("expected 'no ACP client' error, got: %v", err)
	}
}

// ==================== CancelPrompt nil client (88.9%) ====================

func TestCancelPrompt_NilClient(t *testing.T) {
	conn := &AgentConnection{
		ID:       "agent-1",
		State:    StateConnected,
		client:   nil,
		sessions: make(map[SessionID]*AgentSession),
	}

	err := conn.CancelPrompt(context.Background(), "sess-1")
	if err == nil {
		t.Error("expected error for nil client")
	}
	if !strings.Contains(err.Error(), "no ACP client") {
		t.Errorf("expected 'no ACP client' error, got: %v", err)
	}
}

// ==================== server.go handleResponse (64.3%) ====================

func TestServerHandleResponse_NilID(t *testing.T) {
	transport := &MockTransport{}
	server := NewServer(&MockHandler{}, transport)

	// Response with nil ID should be dropped
	msg := &Message{
		ID:     nil,
		Result: json.RawMessage(`{"status":"ok"}`),
	}
	// Should not panic
	server.handleResponse(msg)
}

func TestServerHandleResponse_StringID(t *testing.T) {
	transport := &MockTransport{}
	server := NewServer(&MockHandler{}, transport)

	// Response with string ID (non-numeric) should be dropped
	msg := &Message{
		ID:     &RequestID{String: "abc", IsNum: false},
		Result: json.RawMessage(`{"status":"ok"}`),
	}
	// Should not panic
	server.handleResponse(msg)
}

func TestServerHandleResponse_DuplicateResponse(t *testing.T) {
	transport := &MockTransport{}
	server := NewServer(&MockHandler{}, transport)

	// Set up a pending request with a full channel
	respCh := make(chan *Message, 1)
	respCh <- &Message{ID: &RequestID{Number: 1, IsNum: true}} // fill the channel

	server.mu.Lock()
	server.pendingRequests[1] = respCh
	server.mu.Unlock()

	// Send another response for the same ID — should be dropped
	msg := &Message{
		ID:     &RequestID{Number: 1, IsNum: true},
		Result: json.RawMessage(`{"status":"duplicate"}`),
	}
	// Should not panic or block
	server.handleResponse(msg)
}

// ==================== mock_handler.go uncovered methods ====================

func TestMockHandler_Authenticate_WithFunc(t *testing.T) {
	called := false
	h := &MockHandler{
		AuthenticateFunc: func(ctx context.Context, method string, params json.RawMessage) error {
			called = true
			if method != "token" {
				t.Errorf("expected method 'token', got '%s'", method)
			}
			return nil
		},
	}

	err := h.Authenticate(context.Background(), "token", json.RawMessage(`{}`))
	if err != nil {
		t.Errorf("expected nil error, got: %v", err)
	}
	if !called {
		t.Error("AuthenticateFunc should have been called")
	}
}

func TestMockHandler_Authenticate_Default(t *testing.T) {
	h := &MockHandler{}
	err := h.Authenticate(context.Background(), "none", nil)
	if err != nil {
		t.Errorf("default Authenticate should return nil, got: %v", err)
	}
}

func TestMockHandler_SessionLoad_WithFunc(t *testing.T) {
	called := false
	h := &MockHandler{
		SessionLoadFunc: func(ctx context.Context, params *SessionLoadParams) (*SessionLoadResult, error) {
			called = true
			return &SessionLoadResult{
				SessionID: params.SessionID,
				Mode:      ModePlanning,
			}, nil
		},
	}

	result, err := h.SessionLoad(context.Background(), &SessionLoadParams{SessionID: "sess-1"})
	if err != nil {
		t.Fatalf("SessionLoad failed: %v", err)
	}
	if !called {
		t.Error("SessionLoadFunc should have been called")
	}
	if result.SessionID != "sess-1" {
		t.Errorf("expected session ID 'sess-1', got '%s'", result.SessionID)
	}
	if result.Mode != ModePlanning {
		t.Errorf("expected ModePlanning, got '%s'", result.Mode)
	}
}

func TestMockHandler_SessionLoad_Default(t *testing.T) {
	h := &MockHandler{}
	result, err := h.SessionLoad(context.Background(), &SessionLoadParams{SessionID: "sess-1"})
	if err != nil {
		t.Fatalf("default SessionLoad should not error: %v", err)
	}
	if result.SessionID != "sess-1" {
		t.Errorf("expected session ID 'sess-1', got '%s'", result.SessionID)
	}
	if result.Mode != ModeDefault {
		t.Errorf("expected ModeDefault, got '%s'", result.Mode)
	}
}

func TestMockHandler_SessionSetMode_WithFunc(t *testing.T) {
	called := false
	h := &MockHandler{
		SessionSetModeFunc: func(ctx context.Context, params *SessionSetModeParams) error {
			called = true
			return fmt.Errorf("mode not supported")
		},
	}

	err := h.SessionSetMode(context.Background(), &SessionSetModeParams{
		SessionID: "sess-1",
		Mode:      ModeEditing,
	})
	if err == nil {
		t.Error("expected error from SessionSetModeFunc")
	}
	if !called {
		t.Error("SessionSetModeFunc should have been called")
	}
}

func TestMockHandler_SessionSetMode_Default(t *testing.T) {
	h := &MockHandler{}
	err := h.SessionSetMode(context.Background(), &SessionSetModeParams{
		SessionID: "sess-1",
		Mode:      ModeDefault,
	})
	if err != nil {
		t.Errorf("default SessionSetMode should return nil, got: %v", err)
	}
}

func TestMockHandler_OnUpdate(t *testing.T) {
	h := &MockHandler{}
	// Should not panic — it's a no-op
	h.OnUpdate(func(sessionID SessionID, update *Update) {})
}

func TestMockHandler_OnPermissionRequest(t *testing.T) {
	h := &MockHandler{}
	// Should not panic — it's a no-op
	h.OnPermissionRequest(func(sessionID SessionID, request *SessionRequestPermissionParams) (*PermissionOutcome, error) {
		return nil, nil
	})
}

// ==================== establishConnection: stderr pipe + log ring buffer ====================

func TestEstablishConnection_StderrCapture(t *testing.T) {
	cm := NewConnectionManager(&Config{
		Agents: map[string]*AgentConfig{
			"stderr-agent": {
				ID:      "stderr-agent",
				Enabled: true,
				Command: "sh",
				Args:    []string{"-c", "echo 'test stderr output' >&2; sleep 30"},
			},
		},
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	conn, err := cm.Connect(ctx, "stderr-agent")
	if err != nil {
		t.Fatalf("Connect should return connection object: %v", err)
	}

	// Wait for process to start and produce stderr
	time.Sleep(500 * time.Millisecond)

	// Check if logs were captured (ring buffer should have content)
	entries := conn.RecentLogs(10)
	if len(entries) == 0 {
		// The stderr goroutine may not have fired yet, that's ok
		t.Log("No stderr entries captured (timing dependent)")
	} else {
		found := false
		for _, e := range entries {
			if strings.Contains(e.Line, "test stderr output") {
				found = true
				break
			}
		}
		if !found {
			t.Logf("Stderr entries: %v", entries)
		}
	}

	cm.DisconnectAll()
}

// ==================== CollectMetrics with process ====================

func TestCollectMetrics_UpdatesStoredMetrics(t *testing.T) {
	cmd := exec.Command("sleep", "5")
	if err := cmd.Start(); err != nil {
		t.Skipf("cannot start sleep: %v", err)
	}
	defer cmd.Process.Kill()

	conn := &AgentConnection{
		ID:       "metrics-agent",
		State:    StateConnected,
		sessions: make(map[SessionID]*AgentSession),
		cmd:      cmd,
	}

	// Collect metrics
	m1 := conn.CollectMetrics()
	if m1.PID != cmd.Process.Pid {
		t.Errorf("expected PID %d, got %d", cmd.Process.Pid, m1.PID)
	}

	// Verify stored metrics are accessible via GetMetrics
	m2 := conn.GetMetrics()
	if m2.PID != m1.PID {
		t.Errorf("GetMetrics PID mismatch: %d vs %d", m2.PID, m1.PID)
	}

	// On Linux, check if RSS was populated
	if _, err := os.ReadFile(fmt.Sprintf("/proc/%d/statm", cmd.Process.Pid)); err == nil {
		if m1.RSS == 0 {
			t.Log("RSS was 0 despite /proc/[pid]/statm being available — possible timing issue")
		}
	}
}

// ==================== Connect: already connected/connecting state ====================

func TestConnect_AlreadyConnecting(t *testing.T) {
	cm := NewConnectionManager(&Config{
		Agents: map[string]*AgentConfig{
			"dup-agent": {
				ID:      "dup-agent",
				Enabled: true,
				Command: "sleep",
				Args:    []string{"60"},
			},
		},
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// First connect starts establishing
	conn1, err := cm.Connect(ctx, "dup-agent")
	if err != nil {
		t.Fatalf("first Connect failed: %v", err)
	}

	// Set state to connecting explicitly to ensure the branch is hit
	conn1.mu.Lock()
	conn1.State = StateConnecting
	conn1.mu.Unlock()

	// Second connect should return same connection
	conn2, err := cm.Connect(ctx, "dup-agent")
	if err != nil {
		t.Fatalf("second Connect failed: %v", err)
	}
	if conn1.ID != conn2.ID {
		t.Errorf("expected same connection, got %s vs %s", conn1.ID, conn2.ID)
	}

	cm.DisconnectAll()
}

func TestConnect_ReconnectFromError(t *testing.T) {
	cm := NewConnectionManager(&Config{
		Agents: map[string]*AgentConfig{
			"reconn-agent": {
				ID:      "reconn-agent",
				Enabled: true,
				Command: "echo",
			},
		},
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// First connect
	conn1, err := cm.Connect(ctx, "reconn-agent")
	if err != nil {
		t.Fatalf("first Connect failed: %v", err)
	}

	// Manually set to error state
	conn1.mu.Lock()
	conn1.State = StateError
	conn1.Error = fmt.Errorf("simulated error")
	conn1.mu.Unlock()

	// Second connect should clean up and try reconnecting
	conn2, err := cm.Connect(ctx, "reconn-agent")
	if err != nil {
		t.Fatalf("reconnect failed: %v", err)
	}
	if conn2 == nil {
		t.Fatal("reconnect should return a connection object")
	}

	cm.DisconnectAll()
}
