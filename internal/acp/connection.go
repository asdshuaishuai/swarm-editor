package acp

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/log"
)

var connLog = log.With("component", "Connection")

// ProcessMetrics holds physical resource metrics for a managed agent process.
type ProcessMetrics struct {
	PID       int       `json:"pid"`
	CPU       float64   `json:"cpuPercent"`
	RSS       uint64    `json:"rssBytes"`
	Collected time.Time `json:"collectedAt"`
}

// ConnectionState represents the state of an agent connection
type ConnectionState string

const (
	StateDisconnected ConnectionState = "disconnected"
	StateConnecting   ConnectionState = "connecting"
	StateConnected    ConnectionState = "connected"
	StateError        ConnectionState = "error"

	// MaxSessionsPerConnection limits the number of sessions per connection
	// to prevent memory exhaustion from unbounded session accumulation.
	MaxSessionsPerConnection = 100
)

// validateCommand validates the command and arguments for security purposes.
// It prevents command injection, path traversal, and shell metacharacter attacks.
func validateCommand(command string, args []string) error {
	if command == "" {
		return fmt.Errorf("command cannot be empty")
	}

	// Clean the command path and check for path traversal
	cleanCmd := filepath.Clean(command)
	if strings.Contains(cleanCmd, "..") {
		return fmt.Errorf("path traversal detected in command: %s", command)
	}

	// Check for shell metacharacters that could enable command injection
	dangerousPatterns := []string{
		"|", "||", "&&", ";", "\n", "\r",
		"$(", "`", "${", ">", ">>", "<", "<<",
	}

	for _, pattern := range dangerousPatterns {
		if strings.Contains(command, pattern) {
			return fmt.Errorf("shell metacharacter detected in command: %s", command)
		}
	}

	// Validate arguments for shell injection
	for i, arg := range args {
		for _, pattern := range dangerousPatterns {
			if strings.Contains(arg, pattern) {
				return fmt.Errorf("shell metacharacter detected in argument %d: %s", i, arg)
			}
		}
	}

	return nil
}

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

	// Process metrics (Design Doc Section 1: PID/CPU/RSS)
	metrics ProcessMetrics

	// Log ring buffer (Design Doc Section 2: 5000-line stdout/stderr capture)
	logs *LogRingBuffer

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
	closed  bool // Tracks whether done channel is already closed for current capture
}

// StartContentCapture initializes content capture for a prompt turn.
func (s *AgentSession) StartContentCapture() {
	s.mu.Lock()
	s.content = nil
	s.done = make(chan struct{})
	s.closed = false
	s.mu.Unlock()
}

// AddContent adds a content block to the session
func (s *AgentSession) AddContent(block ContentBlock) {
	s.mu.Lock()
	s.content = append(s.content, block)
	s.mu.Unlock()
}

// FinishContentCapture signals that content capture is complete.
// Idempotent for the same capture session (safe to call multiple times).
func (s *AgentSession) FinishContentCapture() {
	s.mu.Lock()
	done := s.done
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.closed = true
	s.mu.Unlock()

	if done != nil {
		close(done)
	}
}

// WaitForContent waits for content capture to complete with timeout
func (s *AgentSession) WaitForContent(timeout time.Duration) []ContentBlock {
	s.mu.Lock()
	done := s.done
	s.mu.Unlock()

	if done == nil {
		return nil
	}

	timer := time.NewTimer(timeout)
	defer timer.Stop()

	select {
	case <-done:
		s.mu.Lock()
		content := s.content
		s.mu.Unlock()
		return content
	case <-timer.C:
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

	// wg tracks goroutines spawned for async connection establishment
	wg sync.WaitGroup
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

	// Check if already connected (conn.State is protected by conn.mu)
	if conn, ok := m.connections[agentID]; ok {
		conn.mu.RLock()
		state := conn.State
		cancel := conn.cancel // MEDIUM FIX: capture cancel under conn.mu.RLock
		conn.mu.RUnlock()
		if state == StateConnected || state == StateConnecting {
			// Return existing connection (caller can wait for StateConnected if needed)
			return conn, nil
		}
		// Connection exists but in error/disconnected state - clean up before reconnecting
		if cancel != nil {
			cancel()
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
		logs:     NewLogRingBuffer(5000),
	}
	conn.ctx, conn.cancel = context.WithCancel(ctx)

	m.connections[agentID] = conn

	// Start connection in background
	m.wg.Add(1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				connLog.Error("establishConnection panic", "conn_id", conn.ID, "panic", r)
			}
			m.wg.Done()
		}()
		m.establishConnection(conn)
	}()

	return conn, nil
}

// establishConnection starts the agent process and initializes ACP
func (m *ConnectionManager) establishConnection(conn *AgentConnection) {
	conn.mu.Lock()
	conn.State = StateConnecting
	oldState := StateDisconnected
	onStateChange := conn.onStateChange
	conn.mu.Unlock()

	if onStateChange != nil {
		onStateChange(conn.ID, oldState, StateConnecting)
	}

	// Validate command and args for security (prevent command injection)
	if err := validateCommand(conn.Config.Command, conn.Config.Args); err != nil {
		m.setConnectionError(conn, fmt.Errorf("command validation failed: %w", err))
		return
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
		stdin.Close() // Clean up stdin on stdout failure
		m.setConnectionError(conn, fmt.Errorf("failed to create stdout pipe: %w", err))
		return
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		stdin.Close() // Clean up on stderr failure
		stdout.Close()
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
	if startErr := cmd.Start(); startErr != nil {
		conn.mu.Unlock()
		// Clean up pipes on start failure (MEDIUM: pipe leak fix)
		stdin.Close()
		stdout.Close()
		stderr.Close()
		m.setConnectionError(conn, fmt.Errorf("failed to start agent process: %w", startErr))
		return
	}
	conn.mu.Unlock()

	// Pipe stderr into log ring buffer (Design Doc Section 2)
	if conn.logs != nil {
		go func() {
			buf := make([]byte, 4096)
			for {
				n, readErr := stderr.Read(buf)
				if n > 0 {
					for _, line := range strings.Split(string(buf[:n]), "\n") {
						if line != "" {
							conn.AppendLog(line, "stderr")
						}
					}
				}
				if readErr != nil {
					return
				}
			}
		}()
	}

	// Create transport and client
	transport := NewStdioTransport(stdout, stdin)
	client := NewClient(transport)

	// Wire update handler to accumulate content in sessions
	client.OnUpdate(func(sessionID SessionID, update *Update) {
		conn.mu.RLock()
		session, ok := conn.sessions[sessionID]
		onUpdate := conn.onUpdate
		conn.mu.RUnlock()

		if ok && update.Content != nil {
			session.AddContent(*update.Content)
		}

		// Forward to external handler if set
		if onUpdate != nil {
			onUpdate(sessionID, update)
		}
	})

	conn.mu.Lock()
	conn.transport = transport
	conn.client = client
	conn.mu.Unlock()

	// Start client
	if clientStartErr := client.Start(conn.ctx); clientStartErr != nil {
		m.setConnectionError(conn, fmt.Errorf("failed to start client: %w", clientStartErr))
		// Kill orphaned process on client start failure (MEDIUM: process leak fix)
		m.killProcess(conn, cmd)
		return
	}

	// Initialize ACP protocol
	initResult, err := m.initializeAgent(conn)
	if err != nil {
		m.setConnectionError(conn, fmt.Errorf("initialization failed: %w", err))
		// Kill orphaned process on initialization failure (MEDIUM: process leak fix)
		m.killProcess(conn, cmd)
		return
	}

	conn.mu.Lock()
	conn.State = StateConnected
	conn.Capabilities = initResult.AgentCapabilities
	conn.Info = initResult.AgentInfo
	onConnected := conn.onStateChange
	conn.mu.Unlock()

	if onConnected != nil {
		onConnected(conn.ID, StateConnecting, StateConnected)
	}

	if m.onConnectionChange != nil {
		m.onConnectionChange(conn.ID, StateConnected)
	}
}

// killProcess terminates an agent process on startup failure.
// Used to clean up orphaned processes when client.Start() or initializeAgent() fails.
func (m *ConnectionManager) killProcess(conn *AgentConnection, cmd *exec.Cmd) {
	if cmd == nil || cmd.Process == nil {
		return
	}
	// Try graceful shutdown first
	if err := cmd.Process.Signal(os.Interrupt); err != nil {
		// Process might already be dead, try to kill directly
		_ = cmd.Process.Kill() //nolint:errcheck // best effort during cleanup
		return
	}
	// Wait briefly for graceful shutdown, then force kill if needed
	done := make(chan error, 1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				connLog.Error("killProcess cmd.Wait panic", "panic", r)
			}
		}()
		done <- cmd.Wait()
	}()
	timer := time.NewTimer(2 * time.Second)
	defer timer.Stop()
	select {
	case <-done:
		// Process exited gracefully
	case <-timer.C:
		// Force kill after timeout
		_ = cmd.Process.Kill() //nolint:errcheck // best effort during cleanup
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
// Lock ordering: acquires conn.mu only. Does NOT acquire m.mu to prevent ABBA deadlock
// with Disconnect() which holds m.mu -> conn.mu.
func (m *ConnectionManager) setConnectionError(conn *AgentConnection, err error) {
	conn.mu.Lock()
	oldState := conn.State
	conn.State = StateError
	conn.Error = err
	onStateChange := conn.onStateChange
	conn.mu.Unlock()

	// Invoke connection state change callback (no lock needed - callback is immutable after Connect)
	if onStateChange != nil {
		onStateChange(conn.ID, oldState, StateError)
	}

	// Invoke manager-level callback. Note: we read m.onConnectionChange without m.mu here.
	// This is safe because:
	// 1. setConnectionError is only called from establishConnection goroutine
	// 2. Disconnect() holds m.mu when modifying connections, so the conn won't be deleted concurrently
	// 3. onConnectionChange is set during Setup() before any connections exist
	m.mu.RLock()
	onConnectionChange := m.onConnectionChange
	m.mu.RUnlock()

	if onConnectionChange != nil {
		onConnectionChange(conn.ID, StateError)
	}
}

// Disconnect closes a connection
func (m *ConnectionManager) Disconnect(agentID string) error {
	// Remove from map under m.mu, release before blocking I/O
	m.mu.Lock()
	conn, ok := m.connections[agentID]
	if !ok {
		m.mu.Unlock()
		return nil
	}
	delete(m.connections, agentID)
	onConnectionChange := m.onConnectionChange
	m.mu.Unlock()

	// Perform blocking shutdown outside m.mu to avoid blocking other operations
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
				defer func() {
					if r := recover(); r != nil {
						connLog.Error("cmd.Wait panic", "panic", r)
						select {
						case done <- fmt.Errorf("panic: %v", r):
						default:
						}
					}
				}()
				done <- conn.cmd.Wait()
			}()

			timer := time.NewTimer(2 * time.Second)
			defer timer.Stop()

			select {
			case <-done:
				// Process exited gracefully
			case <-timer.C:
				// Force kill after timeout
				_ = conn.cmd.Process.Kill() //nolint:errcheck // best effort during shutdown
			}
		}
	}
	conn.State = StateDisconnected

	// Clear sessions to prevent memory leak
	// Close done channels first to unblock any waiting goroutines
	for id, session := range conn.sessions {
		session.FinishContentCapture()
		delete(conn.sessions, id)
	}

	conn.mu.Unlock()

	if onConnectionChange != nil {
		onConnectionChange(agentID, StateDisconnected)
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
		conn.mu.RLock()
		state := conn.State
		conn.mu.RUnlock()
		if state == StateConnected {
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

	// Wait for any in-flight connection establishment goroutines to complete
	m.wg.Wait()
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

	if client == nil {
		return nil, fmt.Errorf("agent has no ACP client")
	}

	result, err := client.SessionNew(ctx, &SessionNewParams{
		Mode: mode,
	})
	if err != nil {
		return nil, fmt.Errorf("session new: %w", err)
	}

	session := &AgentSession{
		ID:         result.SessionID,
		Mode:       result.Mode,
		CreatedAt:  time.Now(),
		LastActive: time.Now(),
	}

	c.mu.Lock()
	// LRU eviction: remove oldest session if at capacity
	if len(c.sessions) >= MaxSessionsPerConnection {
		var oldestID SessionID
		var oldestTime time.Time
		for id, s := range c.sessions {
			if oldestTime.IsZero() || s.LastActive.Before(oldestTime) {
				oldestTime = s.LastActive
				oldestID = id
			}
		}
		if oldestID != "" {
			connLog.Warn("Evicting oldest session due to capacity limit",
				"session_id", oldestID,
				"capacity", MaxSessionsPerConnection)
			delete(c.sessions, oldestID)
		}
	}
	c.sessions[result.SessionID] = session
	c.mu.Unlock()

	return session, nil
}

// CloseSession closes a specific session and removes it from the connection.
// This prevents unbounded session accumulation on long-lived connections.
func (c *AgentConnection) CloseSession(ctx context.Context, sessionID SessionID) error {
	c.mu.RLock()
	if c.State != StateConnected {
		c.mu.RUnlock()
		return fmt.Errorf("agent not connected")
	}
	_ = c.client // captured for potential future use when ACP adds session/close
	c.mu.RUnlock()

	// Clean up local session state
	// Note: ACP protocol may not have SessionClose, so we just clean up local state
	// This prevents memory leak from unbounded session accumulation
	c.mu.Lock()
	if session, ok := c.sessions[sessionID]; ok {
		session.FinishContentCapture()
		delete(c.sessions, sessionID)
	}
	c.mu.Unlock()

	return nil
}

// SendPrompt sends a prompt to the agent
func (c *AgentConnection) SendPrompt(ctx context.Context, sessionID SessionID, prompt Prompt) (*SessionPromptResult, error) {
	c.mu.RLock()
	if c.State != StateConnected {
		c.mu.RUnlock()
		return nil, fmt.Errorf("agent not connected")
	}
	client := c.client
	session, hasSession := c.sessions[sessionID]
	c.mu.RUnlock()

	if client == nil {
		return nil, fmt.Errorf("agent has no ACP client")
	}

	// Start content capture for this prompt turn
	if hasSession {
		session.StartContentCapture()
	}

	result, err := client.SessionPrompt(ctx, &SessionPromptParams{
		SessionID: sessionID,
		Prompt:    prompt,
	})
	if err != nil {
		if hasSession {
			session.FinishContentCapture()
		}
		return nil, fmt.Errorf("session prompt: %w", err)
	}

	// Collect accumulated content from session updates
	if hasSession {
		session.FinishContentCapture()
		blocks := session.WaitForContent(5 * time.Second)
		if len(blocks) > 0 {
			var textParts []string
			for _, block := range blocks {
				if block.Type == "text" && block.Text != "" {
					textParts = append(textParts, block.Text)
				}
			}
			if len(textParts) > 0 {
				result.Content = strings.Join(textParts, "")
			}
		}
		session.LastActive = time.Now()
	}

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

	if client == nil {
		return fmt.Errorf("agent has no ACP client")
	}

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

// OnUpdateFunc returns the current OnUpdate callback function.
func (c *AgentConnection) OnUpdateFunc() func(sessionID SessionID, update *Update) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.onUpdate
}

// GetMetrics returns the latest process resource metrics for this connection.
func (c *AgentConnection) GetMetrics() ProcessMetrics {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.metrics
}

// CollectMetrics reads current PID/CPU/RSS from the OS for this agent process.
// On non-Linux systems, only PID is populated.
func (c *AgentConnection) CollectMetrics() ProcessMetrics {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.cmd == nil || c.cmd.Process == nil {
		return c.metrics
	}

	pid := c.cmd.Process.Pid
	c.metrics.PID = pid
	c.metrics.Collected = time.Now()

	// Read RSS from /proc/[pid]/statm (Linux only)
	if data, err := os.ReadFile(fmt.Sprintf("/proc/%d/statm", pid)); err == nil {
		var size, resident uint64
		if _, err := fmt.Sscanf(string(data), "%d %d", &size, &resident); err == nil {
			c.metrics.RSS = resident * uint64(os.Getpagesize())
		}
	}

	return c.metrics
}

// RecentLogs returns the last n log entries from this connection's ring buffer.
func (c *AgentConnection) RecentLogs(n int) []LogEntry {
	c.mu.RLock()
	logs := c.logs
	c.mu.RUnlock()
	if logs == nil {
		return nil
	}
	return logs.Recent(n)
}

// AppendLog adds a log line to the connection's ring buffer.
func (c *AgentConnection) AppendLog(line, stream string) {
	c.mu.RLock()
	logs := c.logs
	c.mu.RUnlock()
	if logs != nil {
		logs.Append(line, stream)
	}
}
