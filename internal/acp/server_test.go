package acp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"sync"
	"testing"
	"time"
)

// MockHandler implements Handler for testing
type MockHandler struct {
	initializeFunc     func(ctx context.Context, params *InitializeParams) (*InitializeResult, error)
	authenticateFunc   func(ctx context.Context, method string, params json.RawMessage) error
	sessionNewFunc     func(ctx context.Context, params *SessionNewParams) (*SessionNewResult, error)
	sessionLoadFunc    func(ctx context.Context, params *SessionLoadParams) (*SessionLoadResult, error)
	sessionSetModeFunc func(ctx context.Context, params *SessionSetModeParams) error
	sessionPromptFunc  func(ctx context.Context, params *SessionPromptParams) (*SessionPromptResult, error)
	sessionCancelFunc  func(ctx context.Context, sessionID SessionID) error
	updateCallback     func(sessionID SessionID, update *Update)
	permissionCallback func(sessionID SessionID, request *SessionRequestPermissionParams) (*PermissionOutcome, error)
}

func (m *MockHandler) Initialize(ctx context.Context, params *InitializeParams) (*InitializeResult, error) {
	if m.initializeFunc != nil {
		return m.initializeFunc(ctx, params)
	}
	return &InitializeResult{
		ProtocolVersion:   ProtocolVersion,
		AgentCapabilities: AgentCapabilities{},
		AgentInfo:         ImplementationInfo{Name: "test-agent", Version: "1.0"},
	}, nil
}

func (m *MockHandler) Authenticate(ctx context.Context, method string, params json.RawMessage) error {
	if m.authenticateFunc != nil {
		return m.authenticateFunc(ctx, method, params)
	}
	return nil
}

func (m *MockHandler) SessionNew(ctx context.Context, params *SessionNewParams) (*SessionNewResult, error) {
	if m.sessionNewFunc != nil {
		return m.sessionNewFunc(ctx, params)
	}
	return &SessionNewResult{
		SessionID: "test-session",
		Mode:      params.Mode,
	}, nil
}

func (m *MockHandler) SessionLoad(ctx context.Context, params *SessionLoadParams) (*SessionLoadResult, error) {
	if m.sessionLoadFunc != nil {
		return m.sessionLoadFunc(ctx, params)
	}
	return &SessionLoadResult{SessionID: params.SessionID, Mode: ModeDefault}, nil
}

func (m *MockHandler) SessionSetMode(ctx context.Context, params *SessionSetModeParams) error {
	if m.sessionSetModeFunc != nil {
		return m.sessionSetModeFunc(ctx, params)
	}
	return nil
}

func (m *MockHandler) SessionPrompt(ctx context.Context, params *SessionPromptParams) (*SessionPromptResult, error) {
	if m.sessionPromptFunc != nil {
		return m.sessionPromptFunc(ctx, params)
	}
	return &SessionPromptResult{StopReason: StopEndTurn}, nil
}

func (m *MockHandler) SessionCancel(ctx context.Context, sessionID SessionID) error {
	if m.sessionCancelFunc != nil {
		return m.sessionCancelFunc(ctx, sessionID)
	}
	return nil
}

func (m *MockHandler) OnUpdate(callback func(sessionID SessionID, update *Update)) {
	m.updateCallback = callback
}

func (m *MockHandler) OnPermissionRequest(callback func(sessionID SessionID, request *SessionRequestPermissionParams) (*PermissionOutcome, error)) {
	m.permissionCallback = callback
}

func (m *MockHandler) SwarmCreate(ctx context.Context, params *SwarmCreateParams) (*SwarmCreateResult, error) {
	return &SwarmCreateResult{SwarmID: "test-swarm"}, nil
}

func (m *MockHandler) SwarmStart(ctx context.Context, params *SwarmStartParams) error {
	return nil
}

func (m *MockHandler) SwarmStop(ctx context.Context, params *SwarmStopParams) error {
	return nil
}

func (m *MockHandler) SwarmSubmitTask(ctx context.Context, params *SwarmSubmitTaskParams) (*SwarmSubmitTaskResult, error) {
	return &SwarmSubmitTaskResult{TaskID: "test-task"}, nil
}

func (m *MockHandler) SwarmExecuteTask(ctx context.Context, params *SwarmExecuteTaskParams) (*SwarmTaskResult, error) {
	return &SwarmTaskResult{TaskID: params.TaskID, Status: "completed"}, nil
}

func (m *MockHandler) SwarmGetStatus(ctx context.Context, params *SwarmGetStatusParams) (*SwarmStatusResult, error) {
	return &SwarmStatusResult{SwarmID: params.SwarmID, State: "active"}, nil
}

func (m *MockHandler) MCPStartServer(ctx context.Context, params *MCPStartServerParams) (*MCPServerStatus, error) {
	return &MCPServerStatus{ServerID: params.ServerID, Status: "connected"}, nil
}

func (m *MockHandler) MCPStopServer(ctx context.Context, params *MCPStopServerParams) (*MCPServerStatus, error) {
	return &MCPServerStatus{ServerID: params.ServerID, Status: "disconnected"}, nil
}

func (m *MockHandler) MCPCallTool(ctx context.Context, params *MCPCallToolParams) (*MCPCallToolResult, error) {
	return &MCPCallToolResult{Content: []MCPContent{{Type: "text", Text: "mock result"}}}, nil
}

func (m *MockHandler) MCPListTools(ctx context.Context, params *MCPListToolsParams) (*MCPListToolsResult, error) {
	return &MCPListToolsResult{Tools: []Tool{}}, nil
}

// MockTransport implements Transport for testing with proper context handling
type MockTransport struct {
	mu          sync.Mutex
	closed      bool
	sendFunc    func(msg *Message) error
	receiveFunc func() (*Message, error)
}

func (m *MockTransport) Send(msg *Message) error {
	m.mu.Lock()
	closed := m.closed
	m.mu.Unlock()
	if closed {
		return bytes.ErrTooLarge
	}
	if m.sendFunc != nil {
		return m.sendFunc(msg)
	}
	return nil
}

func (m *MockTransport) Receive() (*Message, error) {
	m.mu.Lock()
	closed := m.closed
	m.mu.Unlock()
	if closed {
		return nil, bytes.ErrTooLarge
	}
	if m.receiveFunc != nil {
		return m.receiveFunc()
	}
	// Block until closed - this allows readLoop to be stopped cleanly
	time.Sleep(100 * time.Millisecond)
	return nil, bytes.ErrTooLarge
}

func (m *MockTransport) Close() error {
	m.mu.Lock()
	m.closed = true
	m.mu.Unlock()
	return nil
}

// Server tests

func TestNewServer(t *testing.T) {
	handler := &MockHandler{}
	transport := &MockTransport{}

	server := NewServer(handler, transport)

	if server == nil {
		t.Fatal("NewServer returned nil")
	}

	if server.handler == nil {
		t.Error("handler should be set")
	}

	if server.transport == nil {
		t.Error("transport should be set")
	}

	if server.pendingRequests == nil {
		t.Error("pendingRequests map should be initialized")
	}
}

func TestNewServerNilHandler(t *testing.T) {
	transport := &MockTransport{}
	server := NewServer(nil, transport)
	if server != nil {
		t.Error("NewServer with nil handler should return nil")
	}
}

func TestNewServerNilTransport(t *testing.T) {
	handler := &MockHandler{}
	server := NewServer(handler, nil)
	if server != nil {
		t.Error("NewServer with nil transport should return nil")
	}
}

func TestNewServerBothNil(t *testing.T) {
	server := NewServer(nil, nil)
	if server != nil {
		t.Error("NewServer with both nil should return nil")
	}
}

func TestServerStartStop(t *testing.T) {
	handler := &MockHandler{}
	transport := &MockTransport{}

	server := NewServer(handler, transport)

	ctx := context.Background()
	err := server.Start(ctx)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	// Give it a moment to start
	time.Sleep(20 * time.Millisecond)

	err = server.Stop()
	if err != nil {
		t.Fatalf("Stop failed: %v", err)
	}
}

func TestServerSendUpdate(t *testing.T) {
	var sentMsg *Message
	transport := &MockTransport{
		sendFunc: func(msg *Message) error {
			sentMsg = msg
			return nil
		},
	}
	handler := &MockHandler{}
	server := NewServer(handler, transport)

	update := &Update{SessionUpdate: "plan"}
	err := server.SendUpdate("session-1", update)
	if err != nil {
		t.Fatalf("SendUpdate failed: %v", err)
	}

	if sentMsg == nil {
		t.Fatal("Message should have been sent")
	}

	if sentMsg.Method != MethodSessionUpdate {
		t.Errorf("Expected method '%s', got '%s'", MethodSessionUpdate, sentMsg.Method)
	}
}

func TestServerSendUpdateNilUpdate(t *testing.T) {
	transport := &MockTransport{}
	handler := &MockHandler{}
	server := NewServer(handler, transport)

	err := server.SendUpdate("session-1", nil)
	if err == nil {
		t.Error("SendUpdate with nil update should return error")
	}
}

func TestServerRequestPermissionNilRequest(t *testing.T) {
	transport := &MockTransport{}
	handler := &MockHandler{}
	server := NewServer(handler, transport)

	_, err := server.RequestPermission(context.Background(), "session-1", nil)
	if err == nil {
		t.Error("RequestPermission with nil request should return error")
	}
}

// Client tests

func TestNewClient(t *testing.T) {
	transport := &MockTransport{}

	client := NewClient(transport)

	if client == nil {
		t.Fatal("NewClient returned nil")
	}

	if client.transport == nil {
		t.Error("transport should be set")
	}

	if client.pendingRequests == nil {
		t.Error("pendingRequests map should be initialized")
	}
}

func TestNewClientNilTransport(t *testing.T) {
	client := NewClient(nil)
	if client != nil {
		t.Error("NewClient with nil transport should return nil")
	}
}

func TestClientStartStop(t *testing.T) {
	transport := &MockTransport{}
	client := NewClient(transport)

	ctx := context.Background()
	err := client.Start(ctx)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	// Give it a moment to start
	time.Sleep(20 * time.Millisecond)

	err = client.Stop()
	if err != nil {
		t.Fatalf("Stop failed: %v", err)
	}
}

func TestClientOnUpdate(t *testing.T) {
	transport := &MockTransport{}
	client := NewClient(transport)

	called := false
	client.OnUpdate(func(sessionID SessionID, update *Update) {
		called = true
	})

	if client.updateHandler == nil {
		t.Error("updateHandler should be set")
	}

	// Verify the handler works
	client.updateHandler("test", &Update{SessionUpdate: "plan"})
	if !called {
		t.Error("Handler should have been called")
	}
}

func TestClientOnPermissionRequest(t *testing.T) {
	transport := &MockTransport{}
	client := NewClient(transport)

	called := false
	client.OnPermissionRequest(func(sessionID SessionID, request *SessionRequestPermissionParams) (*PermissionOutcome, error) {
		called = true
		return &PermissionOutcome{Outcome: "selected"}, nil
	})

	if client.permissionHandler == nil {
		t.Error("permissionHandler should be set")
	}

	// Verify the handler works
	client.permissionHandler("test", &SessionRequestPermissionParams{})
	if !called {
		t.Error("Handler should have been called")
	}
}

func TestClientSendUpdate(t *testing.T) {
	var sentMsg *Message
	transport := &MockTransport{
		sendFunc: func(msg *Message) error {
			sentMsg = msg
			return nil
		},
	}
	client := NewClient(transport)

	update := &Update{SessionUpdate: "plan"}
	err := client.SendUpdate("session-1", update)
	if err != nil {
		t.Fatalf("SendUpdate failed: %v", err)
	}

	if sentMsg == nil {
		t.Fatal("Message should have been sent")
	}

	if sentMsg.Method != MethodSessionUpdate {
		t.Errorf("Expected method '%s', got '%s'", MethodSessionUpdate, sentMsg.Method)
	}
}

func TestClientSendUpdateNilUpdate(t *testing.T) {
	transport := &MockTransport{}
	client := NewClient(transport)

	err := client.SendUpdate("session-1", nil)
	if err == nil {
		t.Error("SendUpdate with nil update should return error")
	}
}

// Method constants test

func TestMethodConstants(t *testing.T) {
	methods := []string{
		MethodInitialize,
		MethodAuthenticate,
		MethodSessionNew,
		MethodSessionLoad,
		MethodSessionSetMode,
		MethodSessionPrompt,
		MethodSessionCancel,
		MethodSessionUpdate,
		MethodSessionRequestPerm,
		MethodFSReadTextFile,
		MethodFSWriteTextFile,
		MethodTerminalCreate,
		MethodTerminalWrite,
	}

	for _, method := range methods {
		if method == "" {
			t.Error("Method constant should not be empty")
		}
	}
}

// Error handling tests

func TestClientCallTransportError(t *testing.T) {
	transport := &MockTransport{
		sendFunc: func(msg *Message) error {
			return bytes.ErrTooLarge // Simulate transport error
		},
	}

	client := NewClient(transport)

	_, err := client.Initialize(context.Background(), &InitializeParams{
		ProtocolVersion: ProtocolVersion,
	})

	if err == nil {
		t.Error("Initialize should fail with transport error")
	}
}

// Handler interface compliance test

func TestMockHandlerImplementsHandler(t *testing.T) {
	var _ Handler = &MockHandler{}
}

// ConnectionState tests

func TestConnectionStateConstants(t *testing.T) {
	states := []ConnectionState{
		StateDisconnected,
		StateConnecting,
		StateConnected,
		StateError,
	}

	for _, state := range states {
		if state == "" {
			t.Error("ConnectionState constant should not be empty")
		}
	}
}

// Client method tests

func TestClientSessionNew(t *testing.T) {
	transport := &MockTransport{
		sendFunc: func(msg *Message) error {
			// Verify the message is correct
			if msg.Method != MethodSessionNew {
				t.Errorf("Expected method %s, got %s", MethodSessionNew, msg.Method)
			}
			return nil
		},
	}

	client := NewClient(transport)

	// Use a short timeout since we don't expect a response
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	params := &SessionNewParams{
		Mode: ModeDefault,
	}

	// SessionNew should call transport.Send
	_, err := client.SessionNew(ctx, params)
	// Will fail because we don't return a proper response (context timeout)
	if err != nil {
		t.Logf("SessionNew error (expected without mock response): %v", err)
	}
}

func TestClientSessionPrompt(t *testing.T) {
	transport := &MockTransport{
		sendFunc: func(msg *Message) error {
			if msg.Method != MethodSessionPrompt {
				t.Errorf("Expected method %s, got %s", MethodSessionPrompt, msg.Method)
			}
			return nil
		},
	}

	client := NewClient(transport)

	// Use a short timeout since we don't expect a response
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	params := &SessionPromptParams{
		SessionID: "test-session",
		Prompt:    Prompt{{Type: "text", Text: "Hello"}},
	}

	_, err := client.SessionPrompt(ctx, params)
	if err != nil {
		t.Logf("SessionPrompt error (expected without mock response): %v", err)
	}
}

func TestClientSessionCancel(t *testing.T) {
	transport := &MockTransport{
		sendFunc: func(msg *Message) error {
			if msg.Method != MethodSessionCancel {
				t.Errorf("Expected method %s, got %s", MethodSessionCancel, msg.Method)
			}
			return nil
		},
	}

	client := NewClient(transport)

	// Use a short timeout since we don't expect a response
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	err := client.SessionCancel(ctx, "test-session")
	if err != nil {
		t.Logf("SessionCancel error (expected without mock response): %v", err)
	}
}

// Server RequestPermission test

func TestServerRequestPermission(t *testing.T) {
	transport := &MockTransport{
		sendFunc: func(msg *Message) error {
			if msg.Method != MethodSessionRequestPerm {
				t.Errorf("Expected method %s, got %s", MethodSessionRequestPerm, msg.Method)
			}
			return nil
		},
	}

	server := NewServer(&MockHandler{}, transport)

	ctx := context.Background()
	params := &SessionRequestPermissionParams{
		SessionID: "test-session",
		ToolCall: ToolCallInfo{
			ToolCallID: "perm-1",
			Title:      "Test Permission",
		},
		Options: []PermissionOption{
			{OptionID: "1", Name: "Allow", Kind: PermAllowOnce},
		},
	}

	// This will timeout because we don't have a response
	ctxTimeout, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
	defer cancel()

	_, err := server.RequestPermission(ctxTimeout, "test-session", params)
	if err == nil {
		t.Log("RequestPermission succeeded")
	} else {
		t.Logf("RequestPermission error (expected timeout): %v", err)
	}
}

// PermissionOutcome tests

func TestPermissionOutcomeJSON(t *testing.T) {
	outcome := &PermissionOutcome{
		Outcome:  "approved",
		OptionID: "1",
	}

	data, err := json.Marshal(outcome)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed PermissionOutcome
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.Outcome != "approved" {
		t.Error("Outcome mismatch")
	}
}

// SessionNewResult tests

func TestSessionNewResultJSON(t *testing.T) {
	result := &SessionNewResult{
		SessionID: "session-123",
		Mode:      ModeDefault,
	}

	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed SessionNewResult
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.SessionID != "session-123" {
		t.Error("SessionID mismatch")
	}
}

// SessionPromptResult tests

func TestSessionPromptResultJSON(t *testing.T) {
	result := &SessionPromptResult{
		StopReason: StopEndTurn,
	}

	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed SessionPromptResult
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.StopReason != StopEndTurn {
		t.Error("StopReason mismatch")
	}
}

// InitializeResult tests

func TestInitializeResultJSON(t *testing.T) {
	result := &InitializeResult{
		ProtocolVersion: ProtocolVersion,
		AgentCapabilities: AgentCapabilities{
			LoadSession: true,
		},
		AgentInfo: ImplementationInfo{
			Name:    "test-agent",
			Version: "1.0.0",
		},
	}

	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed InitializeResult
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.ProtocolVersion != ProtocolVersion {
		t.Error("ProtocolVersion mismatch")
	}
	if !parsed.AgentCapabilities.LoadSession {
		t.Error("LoadSession should be true")
	}
}

// ToolCallInfo tests

func TestToolCallInfoJSON(t *testing.T) {
	info := &ToolCallInfo{
		ToolCallID: "call-123",
		Title:      "Read File",
		Kind:       ToolRead,
	}

	data, err := json.Marshal(info)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed ToolCallInfo
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.ToolCallID != "call-123" {
		t.Error("ToolCallID mismatch")
	}
}

// PermissionOption tests

func TestPermissionOptionJSON(t *testing.T) {
	option := &PermissionOption{
		OptionID: "opt-1",
		Name:     "Allow",
		Kind:     PermAllowOnce,
	}

	data, err := json.Marshal(option)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed PermissionOption
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.OptionID != "opt-1" {
		t.Error("OptionID mismatch")
	}
}

// Server handleRequest tests

func TestServerHandleRequestInitialize(t *testing.T) {
	var sentMsg *Message
	transport := &MockTransport{
		sendFunc: func(msg *Message) error {
			sentMsg = msg
			return nil
		},
	}

	handler := &MockHandler{
		initializeFunc: func(ctx context.Context, params *InitializeParams) (*InitializeResult, error) {
			return &InitializeResult{
				ProtocolVersion:   ProtocolVersion,
				AgentCapabilities: AgentCapabilities{},
				AgentInfo:         ImplementationInfo{Name: "test", Version: "1.0"},
			}, nil
		},
	}

	server := NewServer(handler, transport)
	server.ctx = context.Background()

	// Create an initialize request
	params := &InitializeParams{ProtocolVersion: ProtocolVersion}
	paramsJSON, _ := json.Marshal(params)
	msg := &Message{
		ID:     &RequestID{Number: 1, IsNum: true},
		Method: MethodInitialize,
		Params: paramsJSON,
	}

	server.handleRequest(msg)

	if sentMsg == nil {
		t.Fatal("Response should have been sent")
	}

	if sentMsg.ID == nil || sentMsg.ID.Number != 1 {
		t.Error("Response ID should match request ID")
	}
}

func TestServerHandleRequestSessionNew(t *testing.T) {
	var sentMsg *Message
	transport := &MockTransport{
		sendFunc: func(msg *Message) error {
			sentMsg = msg
			return nil
		},
	}

	handler := &MockHandler{
		sessionNewFunc: func(ctx context.Context, params *SessionNewParams) (*SessionNewResult, error) {
			return &SessionNewResult{
				SessionID: "test-session-123",
				Mode:      params.Mode,
			}, nil
		},
	}

	server := NewServer(handler, transport)
	server.ctx = context.Background()

	params := &SessionNewParams{Mode: ModeDefault}
	paramsJSON, _ := json.Marshal(params)
	msg := &Message{
		ID:     &RequestID{Number: 2, IsNum: true},
		Method: MethodSessionNew,
		Params: paramsJSON,
	}

	server.handleRequest(msg)

	if sentMsg == nil {
		t.Fatal("Response should have been sent")
	}
}

func TestServerHandleRequestSessionPrompt(t *testing.T) {
	var sentMsg *Message
	transport := &MockTransport{
		sendFunc: func(msg *Message) error {
			sentMsg = msg
			return nil
		},
	}

	handler := &MockHandler{
		sessionPromptFunc: func(ctx context.Context, params *SessionPromptParams) (*SessionPromptResult, error) {
			return &SessionPromptResult{StopReason: StopEndTurn}, nil
		},
	}

	server := NewServer(handler, transport)
	server.ctx = context.Background()

	params := &SessionPromptParams{
		SessionID: "test-session",
		Prompt:    Prompt{{Type: "text", Text: "Hello"}},
	}
	paramsJSON, _ := json.Marshal(params)
	msg := &Message{
		ID:     &RequestID{Number: 3, IsNum: true},
		Method: MethodSessionPrompt,
		Params: paramsJSON,
	}

	server.handleRequest(msg)

	if sentMsg == nil {
		t.Fatal("Response should have been sent")
	}
}

func TestServerHandleRequestSessionCancel(t *testing.T) {
	var sentMsg *Message
	transport := &MockTransport{
		sendFunc: func(msg *Message) error {
			sentMsg = msg
			return nil
		},
	}

	canceled := false
	handler := &MockHandler{
		sessionCancelFunc: func(ctx context.Context, sessionID SessionID) error {
			canceled = true
			return nil
		},
	}

	server := NewServer(handler, transport)
	server.ctx = context.Background()

	params := &SessionCancelParams{SessionID: "test-session"}
	paramsJSON, _ := json.Marshal(params)
	msg := &Message{
		ID:     &RequestID{Number: 4, IsNum: true},
		Method: MethodSessionCancel,
		Params: paramsJSON,
	}

	server.handleRequest(msg)

	if !canceled {
		t.Error("SessionCancel should have been called")
	}

	if sentMsg == nil {
		t.Fatal("Response should have been sent")
	}
}

func TestServerHandleRequestUnknownMethod(t *testing.T) {
	var sentMsg *Message
	transport := &MockTransport{
		sendFunc: func(msg *Message) error {
			sentMsg = msg
			return nil
		},
	}

	handler := &MockHandler{}
	server := NewServer(handler, transport)
	server.ctx = context.Background()

	msg := &Message{
		ID:     &RequestID{Number: 5, IsNum: true},
		Method: "unknown/method",
		Params: json.RawMessage("{}"),
	}

	server.handleRequest(msg)

	if sentMsg == nil {
		t.Fatal("Error response should have been sent")
	}

	if sentMsg.Error == nil {
		t.Error("Response should contain an error for unknown method")
	}
}

func TestServerHandleRequestInvalidParams(t *testing.T) {
	var sentMsg *Message
	transport := &MockTransport{
		sendFunc: func(msg *Message) error {
			sentMsg = msg
			return nil
		},
	}

	handler := &MockHandler{}
	server := NewServer(handler, transport)
	server.ctx = context.Background()

	msg := &Message{
		ID:     &RequestID{Number: 6, IsNum: true},
		Method: MethodInitialize,
		Params: json.RawMessage("invalid json"),
	}

	server.handleRequest(msg)

	if sentMsg == nil {
		t.Fatal("Error response should have been sent")
	}

	if sentMsg.Error == nil {
		t.Error("Response should contain an error for invalid params")
	}
}

func TestServerHandleResponse(t *testing.T) {
	transport := &MockTransport{}
	server := NewServer(&MockHandler{}, transport)

	// Set up a pending request
	respCh := make(chan *Message, 1)
	server.mu.Lock()
	server.pendingRequests[123] = respCh
	server.mu.Unlock()

	// Handle a response
	msg := &Message{
		ID: &RequestID{Number: 123, IsNum: true},
		Result: func() json.RawMessage {
			data, _ := json.Marshal(map[string]string{"status": "ok"})
			return data
		}(),
	}

	server.handleResponse(msg)

	// Check that the response was sent to the channel
	select {
	case received := <-respCh:
		if received.ID.Number != 123 {
			t.Error("Response ID mismatch")
		}
	default:
		t.Error("Response should have been sent to pending request channel")
	}
}

func TestServerHandleResponseNoPending(t *testing.T) {
	transport := &MockTransport{}
	server := NewServer(&MockHandler{}, transport)

	// Handle a response with no pending request (should not panic)
	msg := &Message{
		ID:     &RequestID{Number: 999, IsNum: true},
		Result: json.RawMessage("{}"),
	}

	// Should not panic
	server.handleResponse(msg)
}

func TestServerHandleNotification(t *testing.T) {
	transport := &MockTransport{}
	server := NewServer(&MockHandler{}, transport)

	// Handle a notification (currently a no-op, but should not panic)
	msg := &Message{
		Method: "some/notification",
		Params: json.RawMessage("{}"),
	}

	server.handleNotification(msg)
}

func TestServerHandleRequestAuthenticate(t *testing.T) {
	var sentMsg *Message
	transport := &MockTransport{
		sendFunc: func(msg *Message) error {
			sentMsg = msg
			return nil
		},
	}

	authenticated := false
	handler := &MockHandler{
		authenticateFunc: func(ctx context.Context, method string, params json.RawMessage) error {
			authenticated = true
			return nil
		},
	}

	server := NewServer(handler, transport)
	server.ctx = context.Background()

	params := struct {
		Method string          `json:"method"`
		Params json.RawMessage `json:"params"`
	}{
		Method: "token",
		Params: json.RawMessage(`{"token": "test"}`),
	}
	paramsJSON, _ := json.Marshal(params)
	msg := &Message{
		ID:     &RequestID{Number: 7, IsNum: true},
		Method: MethodAuthenticate,
		Params: paramsJSON,
	}

	server.handleRequest(msg)

	if !authenticated {
		t.Error("Authenticate should have been called")
	}

	if sentMsg == nil {
		t.Fatal("Response should have been sent")
	}
}

func TestServerHandleRequestSessionLoad(t *testing.T) {
	var sentMsg *Message
	transport := &MockTransport{
		sendFunc: func(msg *Message) error {
			sentMsg = msg
			return nil
		},
	}

	handler := &MockHandler{
		sessionLoadFunc: func(ctx context.Context, params *SessionLoadParams) (*SessionLoadResult, error) {
			return &SessionLoadResult{
				SessionID: params.SessionID,
				Mode:      ModeDefault,
			}, nil
		},
	}

	server := NewServer(handler, transport)
	server.ctx = context.Background()

	params := &SessionLoadParams{SessionID: "existing-session"}
	paramsJSON, _ := json.Marshal(params)
	msg := &Message{
		ID:     &RequestID{Number: 8, IsNum: true},
		Method: MethodSessionLoad,
		Params: paramsJSON,
	}

	server.handleRequest(msg)

	if sentMsg == nil {
		t.Fatal("Response should have been sent")
	}
}

func TestServerHandleRequestSessionSetMode(t *testing.T) {
	var sentMsg *Message
	transport := &MockTransport{
		sendFunc: func(msg *Message) error {
			sentMsg = msg
			return nil
		},
	}

	modeSet := false
	handler := &MockHandler{
		sessionSetModeFunc: func(ctx context.Context, params *SessionSetModeParams) error {
			modeSet = true
			return nil
		},
	}

	server := NewServer(handler, transport)
	server.ctx = context.Background()

	params := &SessionSetModeParams{
		SessionID: "test-session",
		Mode:      ModePlanning,
	}
	paramsJSON, _ := json.Marshal(params)
	msg := &Message{
		ID:     &RequestID{Number: 9, IsNum: true},
		Method: MethodSessionSetMode,
		Params: paramsJSON,
	}

	server.handleRequest(msg)

	if !modeSet {
		t.Error("SessionSetMode should have been called")
	}

	if sentMsg == nil {
		t.Fatal("Response should have been sent")
	}
}

// Client handleNotification tests

func TestClientHandleNotificationSessionUpdate(t *testing.T) {
	transport := &MockTransport{}
	client := NewClient(transport)

	var receivedUpdate *Update
	var receivedSessionID SessionID
	client.OnUpdate(func(sessionID SessionID, update *Update) {
		receivedSessionID = sessionID
		receivedUpdate = update
	})

	// Create a session update notification
	params := &SessionUpdateParams{
		SessionID: "test-session",
		Update:    Update{SessionUpdate: "plan", Title: "Test Update"},
	}
	paramsJSON, _ := json.Marshal(params)
	msg := &Message{
		Method: MethodSessionUpdate,
		Params: paramsJSON,
	}

	client.handleNotification(msg)

	if receivedSessionID != "test-session" {
		t.Errorf("Expected session ID 'test-session', got '%s'", receivedSessionID)
	}

	if receivedUpdate == nil {
		t.Fatal("Update should have been received")
	}

	if receivedUpdate.Title != "Test Update" {
		t.Errorf("Expected title 'Test Update', got '%s'", receivedUpdate.Title)
	}
}

func TestClientHandleNotificationPermissionRequest(t *testing.T) {
	transport := &MockTransport{}
	client := NewClient(transport)

	var receivedRequest *SessionRequestPermissionParams
	var receivedSessionID SessionID
	client.OnPermissionRequest(func(sessionID SessionID, request *SessionRequestPermissionParams) (*PermissionOutcome, error) {
		receivedSessionID = sessionID
		receivedRequest = request
		return &PermissionOutcome{Outcome: "approved"}, nil
	})

	// Create a permission request notification
	params := &SessionRequestPermissionParams{
		SessionID: "test-session",
		ToolCall: ToolCallInfo{
			ToolCallID: "tool-1",
			Title:      "Read File",
		},
	}
	paramsJSON, _ := json.Marshal(params)
	msg := &Message{
		Method: MethodSessionRequestPerm,
		Params: paramsJSON,
	}

	client.handleNotification(msg)

	if receivedSessionID != "test-session" {
		t.Errorf("Expected session ID 'test-session', got '%s'", receivedSessionID)
	}

	if receivedRequest == nil {
		t.Fatal("Permission request should have been received")
	}

	if receivedRequest.ToolCall.ToolCallID != "tool-1" {
		t.Errorf("Expected tool call ID 'tool-1', got '%s'", receivedRequest.ToolCall.ToolCallID)
	}
}

func TestClientHandleNotificationUnknownMethod(t *testing.T) {
	transport := &MockTransport{}
	client := NewClient(transport)

	// Should not panic for unknown notifications
	msg := &Message{
		Method: "unknown/notification",
		Params: json.RawMessage("{}"),
	}

	client.handleNotification(msg)
}

// Double-start protection tests

func TestServerDoubleStart(t *testing.T) {
	handler := &MockHandler{}
	transport := &MockTransport{}
	server := NewServer(handler, transport)

	ctx := context.Background()

	// First start should succeed
	err := server.Start(ctx)
	if err != nil {
		t.Fatalf("First Start failed: %v", err)
	}

	// Give it a moment to start
	time.Sleep(20 * time.Millisecond)

	// Second start should fail
	err = server.Start(ctx)
	if err == nil {
		t.Error("Second Start should fail with double-start error")
	}

	// Clean up
	_ = server.Stop()
}

func TestClientDoubleStart(t *testing.T) {
	transport := &MockTransport{}
	client := NewClient(transport)

	ctx := context.Background()

	// First start should succeed
	err := client.Start(ctx)
	if err != nil {
		t.Fatalf("First Start failed: %v", err)
	}

	// Give it a moment to start
	time.Sleep(20 * time.Millisecond)

	// Second start should fail
	err = client.Start(ctx)
	if err == nil {
		t.Error("Second Start should fail with double-start error")
	}

	// Clean up
	_ = client.Stop()
}

func TestServerStopIdempotent(t *testing.T) {
	handler := &MockHandler{}
	transport := &MockTransport{}
	server := NewServer(handler, transport)

	ctx := context.Background()
	err := server.Start(ctx)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	time.Sleep(20 * time.Millisecond)

	// First stop
	err = server.Stop()
	if err != nil {
		t.Fatalf("First Stop failed: %v", err)
	}

	// Second stop should be safe (no panic)
	err = server.Stop()
	if err != nil {
		t.Fatalf("Second Stop should not fail: %v", err)
	}
}

func TestClientStopIdempotent(t *testing.T) {
	transport := &MockTransport{}
	client := NewClient(transport)

	ctx := context.Background()
	err := client.Start(ctx)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	time.Sleep(20 * time.Millisecond)

	// First stop
	err = client.Stop()
	if err != nil {
		t.Fatalf("First Stop failed: %v", err)
	}

	// Second stop should be safe (no panic)
	err = client.Stop()
	if err != nil {
		t.Fatalf("Second Stop should not fail: %v", err)
	}
}

// Concurrent start test

func TestServerConcurrentStart(t *testing.T) {
	handler := &MockHandler{}
	transport := &MockTransport{}
	server := NewServer(handler, transport)

	ctx := context.Background()
	var wg sync.WaitGroup
	errors := make([]error, 2)

	// Try to start concurrently
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			errors[idx] = server.Start(ctx)
		}(i)
	}

	wg.Wait()

	// One should succeed, one should fail
	successCount := 0
	for _, err := range errors {
		if err == nil {
			successCount++
		}
	}

	if successCount != 1 {
		t.Errorf("Expected exactly one successful start, got %d", successCount)
	}

	// Clean up
	_ = server.Stop()
}

func TestClientConcurrentStart(t *testing.T) {
	transport := &MockTransport{}
	client := NewClient(transport)

	ctx := context.Background()
	var wg sync.WaitGroup
	errors := make([]error, 2)

	// Try to start concurrently
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			errors[idx] = client.Start(ctx)
		}(i)
	}

	wg.Wait()

	// One should succeed, one should fail
	successCount := 0
	for _, err := range errors {
		if err == nil {
			successCount++
		}
	}

	if successCount != 1 {
		t.Errorf("Expected exactly one successful start, got %d", successCount)
	}

	// Clean up
	_ = client.Stop()
}

// Additional Client handleNotification tests for coverage

func TestClientHandleNotificationSessionUpdateNoHandler(t *testing.T) {
	transport := &MockTransport{}
	client := NewClient(transport)
	// Don't set update handler

	params := &SessionUpdateParams{
		SessionID: "test-session",
		Update:    Update{SessionUpdate: "plan", Title: "Test Update"},
	}
	paramsJSON, _ := json.Marshal(params)
	msg := &Message{
		Method: MethodSessionUpdate,
		Params: paramsJSON,
	}

	// Should not panic when no handler is set
	client.handleNotification(msg)
}

func TestClientHandleNotificationPermissionRequestNoHandler(t *testing.T) {
	transport := &MockTransport{}
	client := NewClient(transport)
	// Don't set permission handler

	params := &SessionRequestPermissionParams{
		SessionID: "test-session",
		ToolCall: ToolCallInfo{
			ToolCallID: "tool-1",
			Title:      "Read File",
		},
	}
	paramsJSON, _ := json.Marshal(params)
	msg := &Message{
		Method: MethodSessionRequestPerm,
		Params: paramsJSON,
	}

	// Should not panic when no handler is set
	client.handleNotification(msg)
}

func TestClientHandleNotificationInvalidParams(t *testing.T) {
	transport := &MockTransport{}
	client := NewClient(transport)

	client.OnUpdate(func(sessionID SessionID, update *Update) {
		// Should not be called with invalid params
		t.Error("Update handler should not be called with invalid params")
	})

	// Create message with invalid params
	msg := &Message{
		Method: MethodSessionUpdate,
		Params: json.RawMessage("invalid json"),
	}

	// Should not panic
	client.handleNotification(msg)
}

func TestClientHandleNotificationPermissionRequestWithSendError(t *testing.T) {
	var sendError error
	transport := &MockTransport{
		sendFunc: func(msg *Message) error {
			sendError = bytes.ErrTooLarge
			return bytes.ErrTooLarge
		},
	}
	client := NewClient(transport)

	client.OnPermissionRequest(func(sessionID SessionID, request *SessionRequestPermissionParams) (*PermissionOutcome, error) {
		return &PermissionOutcome{Outcome: "approved"}, nil
	})

	params := &SessionRequestPermissionParams{
		SessionID: "test-session",
		ToolCall: ToolCallInfo{
			ToolCallID: "tool-1",
			Title:      "Read File",
		},
	}
	paramsJSON, _ := json.Marshal(params)
	msg := &Message{
		Method: MethodSessionRequestPerm,
		Params: paramsJSON,
	}

	// Should not panic even when send fails
	client.handleNotification(msg)

	// The send should have been attempted
	if sendError == nil {
		t.Error("Send should have been attempted")
	}
}

func TestClientHandleNotificationPermissionRequestHandlerError(t *testing.T) {
	var sentMsg *Message
	transport := &MockTransport{
		sendFunc: func(msg *Message) error {
			// MEDIUM fix: Should send error response when handler errors
			sentMsg = msg
			return nil
		},
	}
	client := NewClient(transport)

	client.OnPermissionRequest(func(sessionID SessionID, request *SessionRequestPermissionParams) (*PermissionOutcome, error) {
		return nil, fmt.Errorf("handler error")
	})

	params := &SessionRequestPermissionParams{
		SessionID: "test-session",
		ToolCall: ToolCallInfo{
			ToolCallID: "tool-1",
			Title:      "Read File",
		},
	}
	paramsJSON, _ := json.Marshal(params)
	msg := &Message{
		Method: MethodSessionRequestPerm,
		Params: paramsJSON,
	}

	// Should not panic when handler errors
	client.handleNotification(msg)

	// Verify error response was sent (MEDIUM fix: send error on handler failure)
	if sentMsg == nil {
		t.Error("Error response should have been sent when handler errors")
	} else if sentMsg.Error == nil {
		t.Error("Response should contain error")
	} else if sentMsg.Error.Code != -32603 {
		t.Errorf("Error code should be -32603 (Internal error), got %d", sentMsg.Error.Code)
	}
}

func TestClientHandleNotificationPermissionRequestInvalidParams(t *testing.T) {
	transport := &MockTransport{}
	client := NewClient(transport)

	client.OnPermissionRequest(func(sessionID SessionID, request *SessionRequestPermissionParams) (*PermissionOutcome, error) {
		t.Error("Permission handler should not be called with invalid params")
		return nil, nil
	})

	// Create message with invalid params
	msg := &Message{
		Method: MethodSessionRequestPerm,
		Params: json.RawMessage("invalid json"),
	}

	// Should not panic
	client.handleNotification(msg)
}

// Additional Server readLoop tests

func TestServerReadLoopWithNotification(t *testing.T) {
	notificationReceived := false
	transport := &MockTransport{
		receiveFunc: func() (*Message, error) {
			if !notificationReceived {
				notificationReceived = true
				return &Message{
					Method: "some/notification",
					Params: json.RawMessage("{}"),
				}, nil
			}
			// Return EOF after first message to stop the loop
			return nil, io.EOF
		},
	}

	handler := &MockHandler{}
	server := NewServer(handler, transport)

	ctx := context.Background()
	err := server.Start(ctx)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	// Wait for readLoop to process the notification
	time.Sleep(100 * time.Millisecond)

	err = server.Stop()
	if err != nil {
		t.Fatalf("Stop failed: %v", err)
	}

	if !notificationReceived {
		t.Error("Notification should have been received")
	}
}

func TestClientReadLoopWithResponse(t *testing.T) {
	responseReceived := false
	transport := &MockTransport{
		receiveFunc: func() (*Message, error) {
			if !responseReceived {
				responseReceived = true
				return &Message{
					ID:     &RequestID{Number: 1, IsNum: true},
					Result: json.RawMessage(`{"status": "ok"}`),
				}, nil
			}
			return nil, io.EOF
		},
	}

	client := NewClient(transport)

	ctx := context.Background()
	err := client.Start(ctx)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	// Wait for readLoop to process the response
	time.Sleep(100 * time.Millisecond)

	err = client.Stop()
	if err != nil {
		t.Fatalf("Stop failed: %v", err)
	}

	if !responseReceived {
		t.Error("Response should have been received")
	}
}

func TestClientReadLoopWithNotification(t *testing.T) {
	notificationReceived := false
	transport := &MockTransport{
		receiveFunc: func() (*Message, error) {
			if !notificationReceived {
				notificationReceived = true
				params, _ := json.Marshal(&SessionUpdateParams{
					SessionID: "test",
					Update:    Update{SessionUpdate: "plan"},
				})
				return &Message{
					Method: MethodSessionUpdate,
					Params: params,
				}, nil
			}
			return nil, io.EOF
		},
	}

	client := NewClient(transport)

	updateReceived := false
	client.OnUpdate(func(sessionID SessionID, update *Update) {
		updateReceived = true
	})

	ctx := context.Background()
	err := client.Start(ctx)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	// Wait for readLoop to process the notification
	time.Sleep(100 * time.Millisecond)

	err = client.Stop()
	if err != nil {
		t.Fatalf("Stop failed: %v", err)
	}

	if !notificationReceived {
		t.Error("Notification should have been received")
	}

	if !updateReceived {
		t.Error("Update handler should have been called")
	}
}

// TestServerHandleNotificationNil tests handleNotification with nil message
func TestServerHandleNotificationNil(t *testing.T) {
	transport := &MockTransport{}
	server := NewServer(&MockHandler{}, transport)

	// Should handle nil gracefully (won't panic because function is empty)
	server.handleNotification(nil)
}

// TestServerHandleNotificationVariousTypes tests different notification types
func TestServerHandleNotificationVariousTypes(t *testing.T) {
	transport := &MockTransport{}
	server := NewServer(&MockHandler{}, transport)

	tests := []struct {
		name string
		msg  *Message
	}{
		{
			name: "update notification",
			msg: &Message{
				JSONRPC: "2.0",
				Method:  "notifications/update",
				Params:  json.RawMessage(`{"sessionUpdate": "plan"}`),
			},
		},
		{
			name: "progress notification",
			msg: &Message{
				JSONRPC: "2.0",
				Method:  "notifications/progress",
				Params:  json.RawMessage(`{"progress": 0.5}`),
			},
		},
		{
			name: "cancelled notification",
			msg: &Message{
				JSONRPC: "2.0",
				Method:  "notifications/cancelled",
				Params:  json.RawMessage(`{"reason": "user cancelled"}`),
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Should not panic
			server.handleNotification(tt.msg)
		})
	}
}

// TestClientOnUpdateHandlerRace verifies that OnUpdate() properly
// acquires c.mu when setting the handler, preventing race with handleNotification.
// Without the fix, this test would fail under -race.
func TestClientOnUpdateHandlerRace(t *testing.T) {
	transport := &MockTransport{}
	client := NewClient(transport)

	ctx, cancel := context.WithCancel(context.Background())

	// Start client in background
	_ = client.Start(ctx)

	// Set handler concurrently (would race without lock)
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			client.OnUpdate(func(sessionID SessionID, update *Update) {})
		}()
	}
	wg.Wait()

	cancel()
}

// TestClientOnPermissionRequestHandlerRace verifies that OnPermissionRequest()
// properly acquires c.mu when setting the handler.
func TestClientOnPermissionRequestHandlerRace(t *testing.T) {
	transport := &MockTransport{}
	client := NewClient(transport)

	ctx, cancel := context.WithCancel(context.Background())

	_ = client.Start(ctx)

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			client.OnPermissionRequest(func(sessionID SessionID, request *SessionRequestPermissionParams) (*PermissionOutcome, error) {
				return &PermissionOutcome{Outcome: "selected", OptionID: "allow"}, nil
			})
		}()
	}
	wg.Wait()

	cancel()
}

// ==================== handleRequest: Swarm/MCP switch cases ====================

func TestServerHandleRequest_SwarmCreate(t *testing.T) {
	var sentMsg *Message
	transport := &MockTransport{
		sendFunc: func(msg *Message) error { sentMsg = msg; return nil },
	}
	server := NewServer(&MockHandler{}, transport)
	server.ctx = context.Background()

	paramsJSON := []byte(`{"name":"test-swarm"}`)
	server.handleRequest(&Message{
		ID: &RequestID{Number: 1, IsNum: true},
		Method: MethodSwarmCreate,
		Params: paramsJSON,
	})

	if sentMsg == nil {
		t.Fatal("expected message to be sent")
	}
	// Response message has Result set, not Method
	if sentMsg.Error != nil {
		t.Errorf("expected no error, got %v", sentMsg.Error)
	}
}

func TestServerHandleRequest_SwarmStart(t *testing.T) {
	var sentMsg *Message
	transport := &MockTransport{
		sendFunc: func(msg *Message) error { sentMsg = msg; return nil },
	}
	server := NewServer(&MockHandler{}, transport)
	server.ctx = context.Background()

	server.handleRequest(&Message{
		ID:     &RequestID{Number: 1, IsNum: true},
		Method: MethodSwarmStart,
		Params: []byte(`{}`),
	})

	if sentMsg == nil {
		t.Fatal("expected message to be sent")
	}
}

func TestServerHandleRequest_SwarmStop(t *testing.T) {
	var sentMsg *Message
	transport := &MockTransport{
		sendFunc: func(msg *Message) error { sentMsg = msg; return nil },
	}
	server := NewServer(&MockHandler{}, transport)
	server.ctx = context.Background()

	server.handleRequest(&Message{
		ID:     &RequestID{Number: 1, IsNum: true},
		Method: MethodSwarmStop,
		Params: []byte(`{"swarmId":"s1"}`),
	})

	if sentMsg == nil {
		t.Fatal("expected message to be sent")
	}
}

func TestServerHandleRequest_SwarmSubmitTask(t *testing.T) {
	var sentMsg *Message
	transport := &MockTransport{
		sendFunc: func(msg *Message) error { sentMsg = msg; return nil },
	}
	server := NewServer(&MockHandler{}, transport)
	server.ctx = context.Background()

	server.handleRequest(&Message{
		ID:     &RequestID{Number: 1, IsNum: true},
		Method: MethodSwarmSubmitTask,
		Params: []byte(`{"title":"test task"}`),
	})

	if sentMsg == nil {
		t.Fatal("expected message to be sent")
	}
}

func TestServerHandleRequest_SwarmExecuteTask(t *testing.T) {
	var sentMsg *Message
	transport := &MockTransport{
		sendFunc: func(msg *Message) error { sentMsg = msg; return nil },
	}
	server := NewServer(&MockHandler{}, transport)
	server.ctx = context.Background()

	server.handleRequest(&Message{
		ID:     &RequestID{Number: 1, IsNum: true},
		Method: MethodSwarmExecuteTask,
		Params: []byte(`{"taskId":"t1"}`),
	})

	if sentMsg == nil {
		t.Fatal("expected message to be sent")
	}
}

func TestServerHandleRequest_SwarmGetStatus(t *testing.T) {
	var sentMsg *Message
	transport := &MockTransport{
		sendFunc: func(msg *Message) error { sentMsg = msg; return nil },
	}
	server := NewServer(&MockHandler{}, transport)
	server.ctx = context.Background()

	server.handleRequest(&Message{
		ID:     &RequestID{Number: 1, IsNum: true},
		Method: MethodSwarmGetStatus,
		Params: []byte(`{"swarmId":"s1"}`),
	})

	if sentMsg == nil {
		t.Fatal("expected message to be sent")
	}
}

func TestServerHandleRequest_MCPStartServer(t *testing.T) {
	var sentMsg *Message
	transport := &MockTransport{
		sendFunc: func(msg *Message) error { sentMsg = msg; return nil },
	}
	server := NewServer(&MockHandler{}, transport)
	server.ctx = context.Background()

	server.handleRequest(&Message{
		ID:     &RequestID{Number: 1, IsNum: true},
		Method: MethodMCPStartServer,
		Params: []byte(`{"serverId":"mcp-1"}`),
	})

	if sentMsg == nil {
		t.Fatal("expected message to be sent")
	}
}

func TestServerHandleRequest_MCPStopServer(t *testing.T) {
	var sentMsg *Message
	transport := &MockTransport{
		sendFunc: func(msg *Message) error { sentMsg = msg; return nil },
	}
	server := NewServer(&MockHandler{}, transport)
	server.ctx = context.Background()

	server.handleRequest(&Message{
		ID:     &RequestID{Number: 1, IsNum: true},
		Method: MethodMCPStopServer,
		Params: []byte(`{"serverId":"mcp-1"}`),
	})

	if sentMsg == nil {
		t.Fatal("expected message to be sent")
	}
}

func TestServerHandleRequest_MCPCallTool(t *testing.T) {
	var sentMsg *Message
	transport := &MockTransport{
		sendFunc: func(msg *Message) error { sentMsg = msg; return nil },
	}
	server := NewServer(&MockHandler{}, transport)
	server.ctx = context.Background()

	server.handleRequest(&Message{
		ID:     &RequestID{Number: 1, IsNum: true},
		Method: MethodMCPCallTool,
		Params: []byte(`{"serverId":"mcp-1","name":"tool1"}`),
	})

	if sentMsg == nil {
		t.Fatal("expected message to be sent")
	}
}

func TestServerHandleRequest_MCPListTools(t *testing.T) {
	var sentMsg *Message
	transport := &MockTransport{
		sendFunc: func(msg *Message) error { sentMsg = msg; return nil },
	}
	server := NewServer(&MockHandler{}, transport)
	server.ctx = context.Background()

	server.handleRequest(&Message{
		ID:     &RequestID{Number: 1, IsNum: true},
		Method: MethodMCPListTools,
		Params: []byte(`{}`),
	})

	if sentMsg == nil {
		t.Fatal("expected message to be sent")
	}
}

func TestServerHandleRequest_UnknownMethod(t *testing.T) {
	transport := &MockTransport{
		sendFunc: func(msg *Message) error { return nil },
	}
	server := NewServer(&MockHandler{}, transport)
	server.ctx = context.Background()

	// Should not panic, should send error response
	server.handleRequest(&Message{
		ID:     &RequestID{Number: 1, IsNum: true},
		Method: "unknown/method",
		Params: []byte(`{}`),
	})
}

func TestServerHandleRequest_InvalidParams(t *testing.T) {
	transport := &MockTransport{
		sendFunc: func(msg *Message) error { return nil },
	}
	server := NewServer(&MockHandler{}, transport)
	server.ctx = context.Background()

	// Invalid JSON params should trigger error response, not panic
	server.handleRequest(&Message{
		ID:     &RequestID{Number: 1, IsNum: true},
		Method: MethodSwarmCreate,
		Params: []byte(`{invalid json`),
	})
}

func TestServerHandleRequest_NilID(t *testing.T) {
	transport := &MockTransport{
		sendFunc: func(msg *Message) error { return nil },
	}
	server := NewServer(&MockHandler{}, transport)
	server.ctx = context.Background()

	// nil ID — should not panic
	server.handleRequest(&Message{
		ID:     nil,
		Method: MethodSwarmCreate,
		Params: []byte(`{}`),
	})
}

// TestClientCallErrorResponse tests that call returns error when server responds with error
func TestClientCallErrorResponse(t *testing.T) {
	respCh := make(chan *Message, 1)
	transport := &MockTransport{
		sendFunc: func(msg *Message) error {
			// When a request is sent, respond with an error
			if msg.ID != nil {
				go func() {
					respCh <- &Message{
						ID:    msg.ID,
						Error: &Error{Code: -32000, Message: "internal error"},
					}
				}()
			}
			return nil
		},
		receiveFunc: func() (*Message, error) {
			select {
			case resp := <-respCh:
				return resp, nil
			case <-time.After(5 * time.Second):
				return nil, io.EOF
			}
		},
	}

	client := NewClient(transport)
	ctx := context.Background()
	if err := client.Start(ctx); err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer client.Stop()

	// Wait for readLoop to start
	time.Sleep(20 * time.Millisecond)

	_, err := client.Initialize(ctx, &InitializeParams{
		ProtocolVersion: ProtocolVersion,
	})

	if err == nil {
		t.Error("Initialize should fail with error response")
	}
}

// TestClientCallContextCanceled tests that call returns ctx.Err() when context is canceled
func TestClientCallContextCanceled(t *testing.T) {
	// Use a channel that never gets sent to - simulate blocking
	transport := &MockTransport{
		sendFunc: func(msg *Message) error {
			return nil // Send succeeds, but no response will come
		},
		receiveFunc: func() (*Message, error) {
			// Block for a long time
			time.Sleep(10 * time.Second)
			return nil, io.EOF
		},
	}

	client := NewClient(transport)
	ctx := context.Background()
	if err := client.Start(ctx); err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer client.Stop()

	// Wait for readLoop to start
	time.Sleep(20 * time.Millisecond)

	// Create a context that's already canceled
	ctxWithCancel, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	_, err := client.Initialize(ctxWithCancel, &InitializeParams{
		ProtocolVersion: ProtocolVersion,
	})

	if err == nil {
		t.Error("Initialize should fail with canceled context")
	}
	if err != context.Canceled {
		t.Errorf("Expected context.Canceled, got %v", err)
	}
}

// TestClientCallResultUnmarshalError tests handling of unmarshal errors
func TestClientCallResultUnmarshalError(t *testing.T) {
	respCh := make(chan *Message, 1)
	transport := &MockTransport{
		sendFunc: func(msg *Message) error {
			// When a request is sent, respond with invalid result
			if msg.ID != nil {
				go func() {
					respCh <- &Message{
						ID:     msg.ID,
						Result: json.RawMessage(`"not an object"`),
					}
				}()
			}
			return nil
		},
		receiveFunc: func() (*Message, error) {
			select {
			case resp := <-respCh:
				return resp, nil
			case <-time.After(5 * time.Second):
				return nil, io.EOF
			}
		},
	}

	client := NewClient(transport)
	ctx := context.Background()
	if err := client.Start(ctx); err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer client.Stop()

	// Wait for readLoop to start
	time.Sleep(20 * time.Millisecond)

	_, err := client.Initialize(ctx, &InitializeParams{
		ProtocolVersion: ProtocolVersion,
	})

	// Should get an unmarshal error
	if err == nil {
		t.Error("Initialize should fail with unmarshal error")
	}
}
