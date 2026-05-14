package acp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sync"
	"sync/atomic"

	"github.com/google/uuid"

	"github.com/swarm-editor/swarm-editor/internal/log"
)

var serverLog = log.With("component", "ACP")
var clientLog = log.With("component", "ACPClient")

// Method names as defined by ACP
const (
	MethodInitialize         = "initialize"
	MethodAuthenticate       = "authenticate"
	MethodSessionNew         = "session/new"
	MethodSessionLoad        = "session/load"
	MethodSessionSetMode     = "session/set_mode"
	MethodSessionPrompt      = "session/prompt"
	MethodSessionCancel      = "session/cancel"
	MethodSessionUpdate      = "session/update"
	MethodSessionRequestPerm = "session/request_permission"
	MethodSessionClose       = "session/close"

	// Client methods
	MethodFSReadTextFile  = "fs/read_text_file"
	MethodFSWriteTextFile = "fs/write_text_file"
	MethodTerminalCreate  = "terminal/create"
	MethodTerminalWrite   = "terminal/write"

	// MCP methods
	MethodMCPStartServer = "mcp/startServer"
	MethodMCPStopServer  = "mcp/stopServer"
	MethodMCPCallTool    = "mcp/callTool"
	MethodMCPListTools   = "mcp/listTools"
)

// Handler handles ACP method calls
type Handler interface {
	// Initialize handles the initialize request
	Initialize(ctx context.Context, params *InitializeParams) (*InitializeResult, error)

	// Authenticate handles authentication
	Authenticate(ctx context.Context, method string, params json.RawMessage) error

	// SessionNew creates a new session
	SessionNew(ctx context.Context, params *SessionNewParams) (*SessionNewResult, error)

	// SessionLoad loads an existing session
	SessionLoad(ctx context.Context, params *SessionLoadParams) (*SessionLoadResult, error)

	// SessionSetMode changes session mode
	SessionSetMode(ctx context.Context, params *SessionSetModeParams) error

	// SessionPrompt processes a prompt
	SessionPrompt(ctx context.Context, params *SessionPromptParams) (*SessionPromptResult, error)

	// SessionCancel cancels ongoing prompt
	SessionCancel(ctx context.Context, sessionID SessionID) error

	// SwarmCreate creates a new swarm
	SwarmCreate(ctx context.Context, params *SwarmCreateParams) (*SwarmCreateResult, error)

	// SwarmStart starts a swarm
	SwarmStart(ctx context.Context, params *SwarmStartParams) error

	// SwarmStop stops a swarm
	SwarmStop(ctx context.Context, params *SwarmStopParams) error

	// SwarmSubmitTask submits a task to a swarm
	SwarmSubmitTask(ctx context.Context, params *SwarmSubmitTaskParams) (*SwarmSubmitTaskResult, error)

	// SwarmExecuteTask executes a task in a swarm
	SwarmExecuteTask(ctx context.Context, params *SwarmExecuteTaskParams) (*SwarmTaskResult, error)

	// SwarmGetStatus gets swarm status
	SwarmGetStatus(ctx context.Context, params *SwarmGetStatusParams) (*SwarmStatusResult, error)

	// MCPStartServer starts an MCP server
	MCPStartServer(ctx context.Context, params *MCPStartServerParams) (*MCPServerStatus, error)

	// MCPStopServer stops an MCP server
	MCPStopServer(ctx context.Context, params *MCPStopServerParams) (*MCPServerStatus, error)

	// MCPCallTool calls a tool on an MCP server
	MCPCallTool(ctx context.Context, params *MCPCallToolParams) (*MCPCallToolResult, error)

	// MCPListTools lists available tools on an MCP server
	MCPListTools(ctx context.Context, params *MCPListToolsParams) (*MCPListToolsResult, error)

	// OnUpdate registers a callback for session updates
	OnUpdate(callback func(sessionID SessionID, update *Update))

	// OnPermissionRequest registers a callback for permission requests
	OnPermissionRequest(callback func(sessionID SessionID, request *SessionRequestPermissionParams) (*PermissionOutcome, error))
}

// Server implements the ACP server
type Server struct {
	handler   Handler
	transport Transport

	mu              sync.RWMutex
	pendingRequests map[int64]chan *Message
	nextID          int64
	running         bool

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// NewServer creates a new ACP server
func NewServer(handler Handler, transport Transport) *Server {
	if handler == nil || transport == nil {
		return nil
	}
	return &Server{
		handler:         handler,
		transport:       transport,
		pendingRequests: make(map[int64]chan *Message),
	}
}

// Start starts the server
func (s *Server) Start(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.running {
		return fmt.Errorf("server is already running")
	}

	s.ctx, s.cancel = context.WithCancel(ctx)
	s.running = true

	s.wg.Add(1)
	go s.readLoop()

	return nil
}

// Stop stops the server.
// IMPORTANT: transport.Close() MUST be called before wg.Wait() to prevent deadlock.
// The readLoop blocks in transport.Receive(), which won't see context cancellation.
// Closing the transport unblocks Receive(), allowing the goroutine to exit.
func (s *Server) Stop() error {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return nil
	}
	s.running = false
	if s.cancel != nil {
		s.cancel()
	}
	s.mu.Unlock()

	// Close transport FIRST to unblock readLoop's Receive() call
	transportErr := s.transport.Close()
	// THEN wait for goroutines to finish
	s.wg.Wait()
	return transportErr
}

// SendUpdate sends a session update notification
func (s *Server) SendUpdate(sessionID SessionID, update *Update) error {
	if update == nil {
		return fmt.Errorf("update cannot be nil")
	}
	params := &SessionUpdateParams{
		SessionID: sessionID,
		Update:    *update,
	}
	msg, err := NewNotification(MethodSessionUpdate, params)
	if err != nil {
		return fmt.Errorf("create session update notification: %w", err)
	}
	if err := s.transport.Send(msg); err != nil {
		return fmt.Errorf("send session update: %w", err)
	}
	return nil
}

// RequestPermission requests permission from the client
func (s *Server) RequestPermission(ctx context.Context, sessionID SessionID, request *SessionRequestPermissionParams) (*PermissionOutcome, error) {
	if request == nil {
		return nil, fmt.Errorf("request cannot be nil")
	}

	id := atomic.AddInt64(&s.nextID, 1)
	reqID := &RequestID{Number: id, IsNum: true}

	msg, err := NewRequest(reqID, MethodSessionRequestPerm, request)
	if err != nil {
		return nil, fmt.Errorf("create permission request: %w", err)
	}

	respCh := make(chan *Message, 1)
	s.mu.Lock()
	s.pendingRequests[id] = respCh
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.pendingRequests, id)
		s.mu.Unlock()
	}()

	if err := s.transport.Send(msg); err != nil {
		return nil, fmt.Errorf("send permission request: %w", err)
	}

	select {
	case resp := <-respCh:
		if resp.Error != nil {
			return nil, resp.Error
		}
		var outcome PermissionOutcome
		if err := json.Unmarshal(resp.Result, &outcome); err != nil {
			return nil, fmt.Errorf("unmarshal permission outcome: %w", err)
		}
		return &outcome, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (s *Server) readLoop() {
	defer s.wg.Done()

	for {
		select {
		case <-s.ctx.Done():
			return
		default:
		}

		msg, err := s.transport.Receive()
		if err != nil {
			if errors.Is(err, io.EOF) {
				// Normal shutdown
				return
			}
			// Non-EOF error: transport may recover, but log and exit readLoop
			// to avoid busy-loop when transport returns permanent errors
			serverLog.Warn("readLoop receive error", "error", err)
			return
		}

		if msg.ID != nil && msg.Method != "" {
			// Request - isolate panics to prevent process crash
			s.wg.Add(1)
			go func() {
				defer func() {
					if r := recover(); r != nil {
						serverLog.Error("handleRequest panic", "panic", r)
					}
					s.wg.Done()
				}()
				s.handleRequest(msg)
			}()
		} else if msg.Method != "" {
			// Notification - isolate panics to prevent process crash
			s.wg.Add(1)
			go func() {
				defer func() {
					if r := recover(); r != nil {
						serverLog.Error("handleNotification panic", "panic", r)
					}
					s.wg.Done()
				}()
				s.handleNotification(msg)
			}()
		} else if msg.ID != nil {
			// Response
			s.handleResponse(msg)
		}
	}
}

func (s *Server) handleRequest(msg *Message) {
	var result any
	var err error

	ctx := s.ctx

	switch msg.Method {
	case MethodInitialize:
		var params InitializeParams
		if err = json.Unmarshal(msg.Params, &params); err == nil {
			result, err = s.handler.Initialize(ctx, &params)
		}

	case MethodAuthenticate:
		var params struct {
			Method string          `json:"method"`
			Params json.RawMessage `json:"params"`
		}
		if err = json.Unmarshal(msg.Params, &params); err == nil {
			err = s.handler.Authenticate(ctx, params.Method, params.Params)
		}

	case MethodSessionNew:
		var params SessionNewParams
		if err = json.Unmarshal(msg.Params, &params); err == nil {
			result, err = s.handler.SessionNew(ctx, &params)
		}

	case MethodSessionLoad:
		var params SessionLoadParams
		if err = json.Unmarshal(msg.Params, &params); err == nil {
			result, err = s.handler.SessionLoad(ctx, &params)
		}

	case MethodSessionSetMode:
		var params SessionSetModeParams
		if err = json.Unmarshal(msg.Params, &params); err == nil {
			err = s.handler.SessionSetMode(ctx, &params)
		}

	case MethodSessionPrompt:
		var params SessionPromptParams
		if err = json.Unmarshal(msg.Params, &params); err == nil {
			result, err = s.handler.SessionPrompt(ctx, &params)
		}

	case MethodSessionCancel:
		var params SessionCancelParams
		if err = json.Unmarshal(msg.Params, &params); err == nil {
			err = s.handler.SessionCancel(ctx, params.SessionID)
		}

	case MethodSwarmCreate:
		var params SwarmCreateParams
		if err = json.Unmarshal(msg.Params, &params); err == nil {
			result, err = s.handler.SwarmCreate(ctx, &params)
		}

	case MethodSwarmStart:
		var params SwarmStartParams
		if err = json.Unmarshal(msg.Params, &params); err == nil {
			err = s.handler.SwarmStart(ctx, &params)
		}

	case MethodSwarmStop:
		var params SwarmStopParams
		if err = json.Unmarshal(msg.Params, &params); err == nil {
			err = s.handler.SwarmStop(ctx, &params)
		}

	case MethodSwarmSubmitTask:
		var params SwarmSubmitTaskParams
		if err = json.Unmarshal(msg.Params, &params); err == nil {
			result, err = s.handler.SwarmSubmitTask(ctx, &params)
		}

	case MethodSwarmExecuteTask:
		var params SwarmExecuteTaskParams
		if err = json.Unmarshal(msg.Params, &params); err == nil {
			result, err = s.handler.SwarmExecuteTask(ctx, &params)
		}

	case MethodSwarmGetStatus:
		var params SwarmGetStatusParams
		if err = json.Unmarshal(msg.Params, &params); err == nil {
			result, err = s.handler.SwarmGetStatus(ctx, &params)
		}

	case MethodMCPStartServer:
		var params MCPStartServerParams
		if err = json.Unmarshal(msg.Params, &params); err == nil {
			result, err = s.handler.MCPStartServer(ctx, &params)
		}

	case MethodMCPStopServer:
		var params MCPStopServerParams
		if err = json.Unmarshal(msg.Params, &params); err == nil {
			result, err = s.handler.MCPStopServer(ctx, &params)
		}

	case MethodMCPCallTool:
		var params MCPCallToolParams
		if err = json.Unmarshal(msg.Params, &params); err == nil {
			result, err = s.handler.MCPCallTool(ctx, &params)
		}

	case MethodMCPListTools:
		var params MCPListToolsParams
		if err = json.Unmarshal(msg.Params, &params); err == nil {
			result, err = s.handler.MCPListTools(ctx, &params)
		}

	default:
		err = fmt.Errorf("method not found: %s", msg.Method)
	}

	// Send response
	var resp *Message
	if err != nil {
		resp = NewErrorResponse(msg.ID, InternalError, err.Error(), nil)
	} else {
		resp, err = NewResponse(msg.ID, result)
		if err != nil {
			resp = NewErrorResponse(msg.ID, InternalError, err.Error(), nil)
		}
	}

	if err := s.transport.Send(resp); err != nil {
		serverLog.Error("handleRequest failed to send response", "error", err)
	}
}

func (s *Server) handleNotification(msg *Message) {
	// Handle notifications (if any)
	// Currently ACP doesn't define client->agent notifications
}

func (s *Server) handleResponse(msg *Message) {
	// CRITICAL: Check for nil ID before accessing msg.ID.IsNum
	// Malformed JSON-RPC responses may have nil ID
	if msg.ID == nil {
		return
	}

	s.mu.RLock()
	var id int64
	if msg.ID.IsNum {
		id = msg.ID.Number
	} else {
		// ACP uses numeric IDs only; string-ID responses are dropped
		// Log this for debugging non-conformant clients
		serverLog.Warn("Dropping response with non-numeric ID (ACP uses numeric IDs only)",
			"string_id", msg.ID.String)
		s.mu.RUnlock()
		return
	}
	ch, ok := s.pendingRequests[id]
	s.mu.RUnlock()

	if ok {
		select {
		case ch <- msg:
		default:
			serverLog.Warn("Duplicate response for request, dropping", "request_id", id)
		}
	}
}

// Client represents an ACP client (editor side)
type Client struct {
	transport Transport

	mu              sync.RWMutex
	nextID          int64
	pendingRequests map[int64]chan *Message
	running         bool

	updateHandler     func(sessionID SessionID, update *Update)
	permissionHandler func(sessionID SessionID, request *SessionRequestPermissionParams) (*PermissionOutcome, error)

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// NewClient creates a new ACP client
func NewClient(transport Transport) *Client {
	if transport == nil {
		return nil
	}
	return &Client{
		transport:       transport,
		pendingRequests: make(map[int64]chan *Message),
	}
}

// Start starts the client
func (c *Client) Start(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.running {
		return fmt.Errorf("client is already running")
	}

	c.ctx, c.cancel = context.WithCancel(ctx)
	c.running = true

	c.wg.Add(1)
	go c.readLoop()
	return nil
}

// Stop stops the client
func (c *Client) Stop() error {
	c.mu.Lock()
	if !c.running {
		c.mu.Unlock()
		return nil
	}
	c.running = false
	if c.cancel != nil {
		c.cancel()
	}
	c.mu.Unlock()

	// Close transport BEFORE waiting for goroutines.
	// readLoop is blocked on transport.Receive(); closing the transport
	// unblocks it and allows wg.Wait() to complete.
	// If we waited first (transport.Close after wg.Wait), readLoop would
	// block indefinitely on Receive() → deadlock.
	transportErr := c.transport.Close()

	c.wg.Wait()
	return transportErr
}

// OnUpdate sets the update handler
func (c *Client) OnUpdate(handler func(sessionID SessionID, update *Update)) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.updateHandler = handler
}

// OnPermissionRequest sets the permission handler
func (c *Client) OnPermissionRequest(handler func(sessionID SessionID, request *SessionRequestPermissionParams) (*PermissionOutcome, error)) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.permissionHandler = handler
}

// Initialize sends initialize request
func (c *Client) Initialize(ctx context.Context, params *InitializeParams) (*InitializeResult, error) {
	var result InitializeResult
	if err := c.call(ctx, MethodInitialize, params, &result); err != nil {
		return nil, fmt.Errorf("initialize: %w", err)
	}
	return &result, nil
}

// SessionNew creates a new session
func (c *Client) SessionNew(ctx context.Context, params *SessionNewParams) (*SessionNewResult, error) {
	var result SessionNewResult
	if err := c.call(ctx, MethodSessionNew, params, &result); err != nil {
		return nil, fmt.Errorf("session new: %w", err)
	}
	return &result, nil
}

// SessionPrompt sends a prompt
func (c *Client) SessionPrompt(ctx context.Context, params *SessionPromptParams) (*SessionPromptResult, error) {
	var result SessionPromptResult
	if err := c.call(ctx, MethodSessionPrompt, params, &result); err != nil {
		return nil, fmt.Errorf("session prompt: %w", err)
	}
	return &result, nil
}

// SessionCancel cancels an ongoing prompt
func (c *Client) SessionCancel(ctx context.Context, sessionID SessionID) error {
	return c.call(ctx, MethodSessionCancel, &SessionCancelParams{SessionID: sessionID}, nil)
}

// SendUpdate sends a session update (from agent to client)
func (c *Client) SendUpdate(sessionID SessionID, update *Update) error {
	if update == nil {
		return fmt.Errorf("update cannot be nil")
	}
	params := &SessionUpdateParams{
		SessionID: sessionID,
		Update:    *update,
	}
	msg, err := NewNotification(MethodSessionUpdate, params)
	if err != nil {
		return fmt.Errorf("create session update notification: %w", err)
	}
	if err := c.transport.Send(msg); err != nil {
		return fmt.Errorf("send session update: %w", err)
	}
	return nil
}

func (c *Client) call(ctx context.Context, method string, params any, result any) error {
	id := atomic.AddInt64(&c.nextID, 1)
	reqID := &RequestID{Number: id, IsNum: true}

	msg, err := NewRequest(reqID, method, params)
	if err != nil {
		return fmt.Errorf("create %s request: %w", method, err)
	}

	respCh := make(chan *Message, 1)
	c.mu.Lock()
	c.pendingRequests[id] = respCh
	c.mu.Unlock()

	defer func() {
		c.mu.Lock()
		delete(c.pendingRequests, id)
		c.mu.Unlock()
	}()

	if err := c.transport.Send(msg); err != nil {
		return fmt.Errorf("send %s request: %w", method, err)
	}

	select {
	case resp := <-respCh:
		if resp.Error != nil {
			return resp.Error
		}
		if result != nil && resp.Result != nil {
			if err := json.Unmarshal(resp.Result, result); err != nil {
				return fmt.Errorf("unmarshal %s response: %w", method, err)
			}
		}
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (c *Client) readLoop() {
	defer c.wg.Done()

	for {
		select {
		case <-c.ctx.Done():
			return
		default:
		}

		msg, err := c.transport.Receive()
		if err != nil {
			if errors.Is(err, io.EOF) {
				// Normal shutdown
				return
			}
			// Non-EOF error: transport may recover, but log and exit readLoop
			// to avoid busy-loop when transport returns permanent errors
			clientLog.Warn("readLoop receive error", "error", err)
			return
		}

		if msg.ID != nil && msg.Method == "" {
			// Response to our request
			var id int64
			if msg.ID.IsNum {
				id = msg.ID.Number
			} else {
				// ACP uses numeric IDs only; string-ID responses are dropped
				// Log this for debugging non-conformant agents
				clientLog.Warn("Dropping response with non-numeric ID (ACP uses numeric IDs only)",
					"string_id", msg.ID.String)
				continue
			}
			c.mu.RLock()
			ch, ok := c.pendingRequests[id]
			c.mu.RUnlock()

			if ok {
				select {
				case ch <- msg:
				default:
					clientLog.Warn("Duplicate response for request, dropping", "request_id", id)
				}
			}
		} else if msg.Method != "" {
			// Notification from agent
			c.handleNotification(msg)
		}
	}
}

func (c *Client) handleNotification(msg *Message) {
	// Snapshot handlers under lock to prevent race with OnUpdate/OnPermissionRequest
	c.mu.RLock()
	updateHandler := c.updateHandler
	permissionHandler := c.permissionHandler
	c.mu.RUnlock()

	switch msg.Method {
	case MethodSessionUpdate:
		if updateHandler != nil {
			var params SessionUpdateParams
			if err := json.Unmarshal(msg.Params, &params); err == nil {
				updateHandler(params.SessionID, &params.Update)
			}
		}

	case MethodSessionRequestPerm:
		if permissionHandler != nil {
			var params SessionRequestPermissionParams
			if err := json.Unmarshal(msg.Params, &params); err == nil {
				outcome, handlerErr := permissionHandler(params.SessionID, &params)
				if handlerErr == nil {
					// Send response
					resp, respErr := NewResponse(msg.ID, outcome)
					if respErr != nil {
						clientLog.Error("handleNotification failed to create response", "error", respErr)
						return
					}
					if sendErr := c.transport.Send(resp); sendErr != nil {
						clientLog.Error("handleNotification failed to send response", "error", sendErr)
					}
				} else {
					// MEDIUM: Send error response when handler fails (previously silently ignored)
					clientLog.Error("Permission handler error", "error", handlerErr)
					errResp := NewErrorResponse(msg.ID, -32603, handlerErr.Error(), nil)
					if sendErr := c.transport.Send(errResp); sendErr != nil {
						clientLog.Error("handleNotification failed to send error response", "error", sendErr)
					}
				}
			}
		}
	}
}

// GenerateSessionID generates a new session ID
func GenerateSessionID() SessionID {
	return SessionID("sess_" + uuid.New().String()[:12])
}

// GenerateAgentID generates a new agent ID
func GenerateAgentID() AgentID {
	return AgentID("agent_" + uuid.New().String()[:8])
}

// GenerateToolCallID generates a new tool call ID
func GenerateToolCallID() ToolCallID {
	return ToolCallID("call_" + uuid.New().String()[:8])
}
