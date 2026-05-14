package acp

import (
	"context"
	"encoding/json"
)

// MockHandler implements Handler for testing.
// It allows customization via function fields; each field defaults to a no-op
// that returns a sensible zero value so tests only override what they need.
type MockHandler struct {
	InitializeFunc     func(ctx context.Context, params *InitializeParams) (*InitializeResult, error)
	AuthenticateFunc   func(ctx context.Context, method string, params json.RawMessage) error
	SessionNewFunc     func(ctx context.Context, params *SessionNewParams) (*SessionNewResult, error)
	SessionLoadFunc    func(ctx context.Context, params *SessionLoadParams) (*SessionLoadResult, error)
	SessionSetModeFunc func(ctx context.Context, params *SessionSetModeParams) error
	SessionPromptFunc  func(ctx context.Context, params *SessionPromptParams) (*SessionPromptResult, error)
	SessionCancelFunc  func(ctx context.Context, sessionID SessionID) error
}

func (m *MockHandler) Initialize(ctx context.Context, params *InitializeParams) (*InitializeResult, error) {
	if m.InitializeFunc != nil {
		return m.InitializeFunc(ctx, params)
	}
	return &InitializeResult{
		ProtocolVersion:   ProtocolVersion,
		AgentCapabilities: AgentCapabilities{},
		AgentInfo:         ImplementationInfo{Name: "test-agent", Version: "1.0"},
	}, nil
}

func (m *MockHandler) Authenticate(ctx context.Context, method string, params json.RawMessage) error {
	if m.AuthenticateFunc != nil {
		return m.AuthenticateFunc(ctx, method, params)
	}
	return nil
}

func (m *MockHandler) SessionNew(ctx context.Context, params *SessionNewParams) (*SessionNewResult, error) {
	if m.SessionNewFunc != nil {
		return m.SessionNewFunc(ctx, params)
	}
	return &SessionNewResult{
		SessionID: "test-session",
		Mode:      params.Mode,
	}, nil
}

func (m *MockHandler) SessionLoad(ctx context.Context, params *SessionLoadParams) (*SessionLoadResult, error) {
	if m.SessionLoadFunc != nil {
		return m.SessionLoadFunc(ctx, params)
	}
	return &SessionLoadResult{SessionID: params.SessionID, Mode: ModeDefault}, nil
}

func (m *MockHandler) SessionSetMode(ctx context.Context, params *SessionSetModeParams) error {
	if m.SessionSetModeFunc != nil {
		return m.SessionSetModeFunc(ctx, params)
	}
	return nil
}

func (m *MockHandler) SessionPrompt(ctx context.Context, params *SessionPromptParams) (*SessionPromptResult, error) {
	if m.SessionPromptFunc != nil {
		return m.SessionPromptFunc(ctx, params)
	}
	return &SessionPromptResult{StopReason: StopEndTurn}, nil
}

func (m *MockHandler) SessionCancel(ctx context.Context, sessionID SessionID) error {
	if m.SessionCancelFunc != nil {
		return m.SessionCancelFunc(ctx, sessionID)
	}
	return nil
}

func (m *MockHandler) OnUpdate(callback func(sessionID SessionID, update *Update)) {
	// No-op by default
}

func (m *MockHandler) OnPermissionRequest(callback func(sessionID SessionID, request *SessionRequestPermissionParams) (*PermissionOutcome, error)) {
	// No-op by default
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
