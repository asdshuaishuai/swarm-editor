// Package acp implements ACP agent connection management
package acp

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"
	"time"
)

// ConnectionState represents the state of an agent connection
type ConnectionState string

const (
	StateDisconnected ConnectionState = "disconnected"
	StateConnecting   ConnectionState = "connecting"
	StateConnected    ConnectionState = "connected"
	StateError        ConnectionState = "error"
)

// AgentConnection represents a connection to an ACP agent
type AgentConnection struct {
	mu sync.RWMutex

	ID     string
	Config *AgentConfig
	State  ConnectionState
	Error  error

	// Process management
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout io.Reader
	stderr io.Reader

	// ACP communication
	transport Transport
	client    *Client

	// Session management
	sessions map[SessionID]*AgentSession

	// Capabilities (negotiated during initialization)
	Capabilities AgentCapabilities
	Info         ImplementationInfo

	// Callbacks
	onStateChange func(id string, old, new ConnectionState)
	onUpdate      func(sessionID SessionID, update *Update)

	ctx    context.Context
	cancel context.CancelFunc
}

// AgentSession represents a session with an agent
type AgentSession struct {
	ID         SessionID
	Mode       SessionMode
	CreatedAt  time.Time
	LastActive time.Time

	// Content capture for prompt responses
	mu      sync.Mutex
	content []ContentBlock
	done    chan struct{}
}

// StartContentCapture initializes content capture for a prompt turn
func (s *AgentSession) StartContentCapture() {
	s.mu.Lock()
	s.content = nil
	s.done = make(chan struct{})
	s.mu.Unlock()
}

// AddContent adds a content block to the session
func (s *AgentSession) AddContent(block ContentBlock) {
	s.mu.Lock()
	s.content = append(s.content, block)
	s.mu.Unlock()
}

// FinishContentCapture signals that content capture is complete
func (s *AgentSession) FinishContentCapture() {
	s.mu.Lock()
	if s.done != nil {
		close(s.done)
	}
	s.mu.Unlock()
}

// WaitForContent waits for content capture to complete with timeout
func (s *AgentSession) WaitForContent(timeout time.Duration) []ContentBlock {
	s.mu.Lock()
	done := s.done
	s.mu.Unlock()

	if done == nil {
		return nil
	}

	select {
	case <-done:
		s.mu.Lock()
		content := s.content
		s.mu.Unlock()
		return content
	case <-time.After(timeout):
		return nil
	}
}

// GetContent returns the captured content
func (s *AgentSession) GetContent() []ContentBlock {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.content
}

// ConnectionManager manages all agent connections
type ConnectionManager struct {
	mu          sync.RWMutex
	connections map[string]*AgentConnection
	config      *Config

	onConnectionChange func(id string, state ConnectionState)
}

// NewConnectionManager creates a new connection manager
func NewConnectionManager(cfg *Config) *ConnectionManager {
	if cfg == nil {
		cfg = NewConfig()
	}
	return &ConnectionManager{
		connections: make(map[string]*AgentConnection),
		config:      cfg,
	}
}

// Connect establishes a connection to an agent
func (m *ConnectionManager) Connect(ctx context.Context, agentID string) (*AgentConnection, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Check if already connected
	if conn, ok := m.connections[agentID]; ok {
		if conn.State == StateConnected {
			return conn, nil
		}
	}

	// Get agent config
	agentCfg, ok := m.config.GetAgent(agentID)
	if !ok {
		return nil, fmt.Errorf("agent %s not found in configuration", agentID)
	}

	if !agentCfg.Enabled {
		return nil, fmt.Errorf("agent %s is disabled", agentID)
	}

	// Create connection
	conn := &AgentConnection{
		ID:       agentID,
		Config:   agentCfg,
		State:    StateConnecting,
		sessions: make(map[SessionID]*AgentSession),
	}
	conn.ctx, conn.cancel = context.WithCancel(ctx)

	m.connections[agentID] = conn

	// Start connection in background
	go m.establishConnection(conn)

	return conn, nil
}

// establishConnection starts the agent process and initializes ACP
func (m *ConnectionManager) establishConnection(conn *AgentConnection) {
	conn.mu.Lock()
	conn.State = StateConnecting
	oldState := StateDisconnected
	conn.mu.Unlock()

	if conn.onStateChange != nil {
		conn.onStateChange(conn.ID, oldState, StateConnecting)
	}

	// Start the agent process
	cmd := exec.CommandContext(conn.ctx, conn.Config.Command, conn.Config.Args...)

	// Set environment
	cmd.Env = os.Environ()
	for k, v := range conn.Config.Env {
		// Expand environment variables
		expanded := os.ExpandEnv(v)
		cmd.Env = append(cmd.Env, fmt.Sprintf("%s=%s", k, expanded))
	}

	// Create pipes
	stdin, err := cmd.StdinPipe()
	if err != nil {
		m.setConnectionError(conn, fmt.Errorf("failed to create stdin pipe: %w", err))
		return
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		m.setConnectionError(conn, fmt.Errorf("failed to create stdout pipe: %w", err))
		return
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		m.setConnectionError(conn, fmt.Errorf("failed to create stderr pipe: %w", err))
		return
	}

	conn.mu.Lock()
	conn.cmd = cmd
	conn.stdin = stdin
	conn.stdout = stdout
	conn.stderr = stderr

	// Start process while holding the lock to avoid race with Disconnect
	// which reads conn.cmd.Process under the same lock
	if err := cmd.Start(); err != nil {
		conn.mu.Unlock()
		m.setConnectionError(conn, fmt.Errorf("failed to start agent process: %w", err))
		return
	}
	conn.mu.Unlock()

	// Create transport and client
	transport := NewStdioTransport(stdout, stdin)
	client := NewClient(transport)

	conn.mu.Lock()
	conn.transport = transport
	conn.client = client
	conn.mu.Unlock()

	// Start client
	if err := client.Start(conn.ctx); err != nil {
		m.setConnectionError(conn, fmt.Errorf("failed to start client: %w", err))
		return
	}

	// Initialize ACP protocol
	initResult, err := m.initializeAgent(conn)
	if err != nil {
		m.setConnectionError(conn, fmt.Errorf("initialization failed: %w", err))
		return
	}

	conn.mu.Lock()
	conn.State = StateConnected
	conn.Capabilities = initResult.AgentCapabilities
	conn.Info = initResult.AgentInfo
	conn.mu.Unlock()

	if conn.onStateChange != nil {
		conn.onStateChange(conn.ID, StateConnecting, StateConnected)
	}

	if m.onConnectionChange != nil {
		m.onConnectionChange(conn.ID, StateConnected)
	}
}

// initializeAgent performs ACP initialization handshake
func (m *ConnectionManager) initializeAgent(conn *AgentConnection) (*InitializeResult, error) {
	ctx := conn.ctx
	if conn.Config.Timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, time.Duration(conn.Config.Timeout)*time.Second)
		defer cancel()
	}

	initParams := &InitializeParams{
		ProtocolVersion: ProtocolVersion,
		ClientCapabilities: ClientCapabilities{
			FileSystem: FileSystemCapabilities{
				ReadTextFile:  true,
				WriteTextFile: true,
			},
			Terminal: true,
		},
		ClientInfo: ImplementationInfo{
			Name:    "swarm-editor",
			Title:   "Swarm Editor",
			Version: "0.1.0",
		},
	}

	return conn.client.Initialize(ctx, initParams)
}

// setConnectionError sets the connection to error state
func (m *ConnectionManager) setConnectionError(conn *AgentConnection, err error) {
	conn.mu.Lock()
	oldState := conn.State
	conn.State = StateError
	conn.Error = err
	conn.mu.Unlock()

	if conn.onStateChange != nil {
		conn.onStateChange(conn.ID, oldState, StateError)
	}

	if m.onConnectionChange != nil {
		m.onConnectionChange(conn.ID, StateError)
	}
}

// Disconnect closes a connection
func (m *ConnectionManager) Disconnect(agentID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	conn, ok := m.connections[agentID]
	if !ok {
		return nil
	}

	conn.mu.Lock()
	if conn.cancel != nil {
		conn.cancel()
	}
	if conn.stdin != nil {
		conn.stdin.Close()
	}
	if conn.client != nil {
		if err := conn.client.Stop(); err != nil {
			// Log but continue - we're shutting down anyway
			fmt.Fprintf(os.Stderr, "warning: client stop error: %v\n", err)
		}
	}
	// Terminate the agent process with graceful shutdown attempt
	if conn.cmd != nil && conn.cmd.Process != nil {
		// Try graceful shutdown first
		if err := conn.cmd.Process.Signal(os.Interrupt); err != nil {
			// Process might already be dead, try to kill directly
			_ = conn.cmd.Process.Kill() //nolint:errcheck // best effort during shutdown
		} else {
			// Wait briefly for graceful shutdown, then force kill if needed
			done := make(chan error, 1)
			go func() {
				done <- conn.cmd.Wait()
			}()

			select {
			case <-done:
				// Process exited gracefully
			case <-time.After(2 * time.Second):
				// Force kill after timeout
				_ = conn.cmd.Process.Kill() //nolint:errcheck // best effort during shutdown
			}
		}
	}
	conn.State = StateDisconnected
	conn.mu.Unlock()

	delete(m.connections, agentID)

	if m.onConnectionChange != nil {
		m.onConnectionChange(agentID, StateDisconnected)
	}

	return nil
}

// GetConnection retrieves a connection by ID
func (m *ConnectionManager) GetConnection(agentID string) (*AgentConnection, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	conn, ok := m.connections[agentID]
	return conn, ok
}

// ListConnections returns all connections
func (m *ConnectionManager) ListConnections() []*AgentConnection {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*AgentConnection, 0, len(m.connections))
	for _, conn := range m.connections {
		result = append(result, conn)
	}
	return result
}

// GetConnected returns all connected agents
func (m *ConnectionManager) GetConnected() []*AgentConnection {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*AgentConnection, 0)
	for _, conn := range m.connections {
		if conn.State == StateConnected {
			result = append(result, conn)
		}
	}
	return result
}

// ConnectAll connects to all enabled agents
func (m *ConnectionManager) ConnectAll(ctx context.Context) error {
	agents := m.config.ListEnabledAgents()
	for _, agent := range agents {
		_, err := m.Connect(ctx, agent.ID)
		if err != nil {
			return fmt.Errorf("failed to connect to %s: %w", agent.ID, err)
		}
	}
	return nil
}

// DisconnectAll disconnects all agents
// Errors from individual disconnects are ignored to ensure all agents are attempted
func (m *ConnectionManager) DisconnectAll() {
	m.mu.RLock()
	ids := make([]string, 0, len(m.connections))
	for id := range m.connections {
		ids = append(ids, id)
	}
	m.mu.RUnlock()

	for _, id := range ids {
		_ = m.Disconnect(id) //nolint:errcheck // intentional - disconnect all regardless of errors
	}
}

// OnConnectionChange registers a callback for connection state changes
func (m *ConnectionManager) OnConnectionChange(fn func(id string, state ConnectionState)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onConnectionChange = fn
}

// CreateSession creates a new session with an agent
func (c *AgentConnection) CreateSession(ctx context.Context, mode SessionMode) (*AgentSession, error) {
	c.mu.RLock()
	if c.State != StateConnected {
		c.mu.RUnlock()
		return nil, fmt.Errorf("agent not connected")
	}
	client := c.client
	c.mu.RUnlock()

	result, err := client.SessionNew(ctx, &SessionNewParams{
		Mode: mode,
	})
	if err != nil {
		return nil, err
	}

	session := &AgentSession{
		ID:         result.SessionID,
		Mode:       result.Mode,
		CreatedAt:  time.Now(),
		LastActive: time.Now(),
	}

	c.mu.Lock()
	c.sessions[result.SessionID] = session
	c.mu.Unlock()

	return session, nil
}

// SendPrompt sends a prompt to the agent
func (c *AgentConnection) SendPrompt(ctx context.Context, sessionID SessionID, prompt Prompt) (*SessionPromptResult, error) {
	c.mu.RLock()
	if c.State != StateConnected {
		c.mu.RUnlock()
		return nil, fmt.Errorf("agent not connected")
	}
	client := c.client
	c.mu.RUnlock()

	result, err := client.SessionPrompt(ctx, &SessionPromptParams{
		SessionID: sessionID,
		Prompt:    prompt,
	})
	if err != nil {
		return nil, err
	}

	// Update session last active
	c.mu.Lock()
	if session, ok := c.sessions[sessionID]; ok {
		session.LastActive = time.Now()
	}
	c.mu.Unlock()

	return result, nil
}

// CancelPrompt cancels an ongoing prompt
func (c *AgentConnection) CancelPrompt(ctx context.Context, sessionID SessionID) error {
	c.mu.RLock()
	if c.State != StateConnected {
		c.mu.RUnlock()
		return fmt.Errorf("agent not connected")
	}
	client := c.client
	c.mu.RUnlock()

	return client.SessionCancel(ctx, sessionID)
}

// GetState returns the current connection state
func (c *AgentConnection) GetState() ConnectionState {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.State
}

// OnStateChange registers a callback for state changes
func (c *AgentConnection) OnStateChange(fn func(id string, old, new ConnectionState)) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.onStateChange = fn
}

// OnUpdate registers a callback for session updates
func (c *AgentConnection) OnUpdate(fn func(sessionID SessionID, update *Update)) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.onUpdate = fn
}
