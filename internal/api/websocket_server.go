// Package api provides WebSocket API server for UI communication
package api

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"github.com/swarm-editor/swarm-editor/internal/a2a"
	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
	"github.com/swarm-editor/swarm-editor/internal/log"
	"github.com/swarm-editor/swarm-editor/internal/lsp"
	"github.com/swarm-editor/swarm-editor/internal/mcp"
	"github.com/swarm-editor/swarm-editor/internal/swarm"
	"github.com/swarm-editor/swarm-editor/internal/team"
	"github.com/swarm-editor/swarm-editor/internal/terminal"
)

var ErrSendBufferFull = errors.New("send buffer full")
var ErrHubDraining = errors.New("hub is draining")

var wsLog = log.With("component", "WebSocket")
var hubLog = log.With("component", "Hub")

// ==================== API Error Codes ====================
// JSON-RPC standard codes
const (
	CodeParseError     = -32700
	CodeInvalidRequest = -32600
	CodeMethodNotFound = -32601
	CodeInvalidParams  = -32602
	CodeInternalError  = -32603
)

// Application-specific error codes (positive range to avoid JSON-RPC conflicts)
const (
	CodeNotFound      = -32001
	CodeValidation    = -32002
	CodeUnauthorized  = -32003
	CodeRateLimited   = -32004
	CodeConflict      = -32005
	CodeNotConnected  = -32006
	CodeLimitExceeded = -32007
)

// APIError represents a typed API error with error code
type APIError struct {
	Code    int
	Message string
}

func (e *APIError) Error() string {
	return e.Message
}

// NewAPIError creates a new APIError
func NewAPIError(code int, message string) *APIError {
	return &APIError{Code: code, Message: message}
}

// errNotFound returns a not-found API error
func errNotFound(msg string) *APIError {
	return NewAPIError(CodeNotFound, msg)
}

// errValidation returns a validation API error
func errValidation(msg string) *APIError {
	return NewAPIError(CodeValidation, msg)
}

// errNotConnected returns a not-connected API error
func errNotConnected(msg string) *APIError {
	return NewAPIError(CodeNotConnected, msg)
}

// errLimitExceeded returns a limit-exceeded API error
func errLimitExceeded(msg string) *APIError {
	return NewAPIError(CodeLimitExceeded, msg)
}

// errUnauthorized returns an unauthorized API error
func errUnauthorized(msg string) *APIError {
	return NewAPIError(CodeUnauthorized, msg)
}

// ==================== Error Type Assertions (Kubernetes-style) ====================

// IsNotFound returns true if the error is a not-found error
func IsNotFound(err error) bool {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr.Code == CodeNotFound
	}
	return false
}

// IsValidation returns true if the error is a validation error
func IsValidation(err error) bool {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr.Code == CodeValidation
	}
	return false
}

// IsUnauthorized returns true if the error is an unauthorized error
func IsUnauthorized(err error) bool {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr.Code == CodeUnauthorized
	}
	return false
}

// IsRateLimited returns true if the error is a rate-limited error
func IsRateLimited(err error) bool {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr.Code == CodeRateLimited
	}
	return false
}

// IsConflict returns true if the error is a conflict error
func IsConflict(err error) bool {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr.Code == CodeConflict
	}
	return false
}

// IsNotConnected returns true if the error is a not-connected error
func IsNotConnected(err error) bool {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr.Code == CodeNotConnected
	}
	return false
}

// IsLimitExceeded returns true if the error is a limit-exceeded error
func IsLimitExceeded(err error) bool {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr.Code == CodeLimitExceeded
	}
	return false
}

// IsInternal returns true if the error is an internal error
func IsInternal(err error) bool {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr.Code == CodeInternalError
	}
	return false
}

// GetAPIError extracts the APIError from an error, returns nil if not an APIError
func GetAPIError(err error) *APIError {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr
	}
	return nil
}

// ==================== WebSocket Protocol Types ====================

// WSRequest represents a WebSocket request from UI
type WSRequest struct {
	ID     string          `json:"id"`
	Method string          `json:"method"`
	Params json.RawMessage `json:"params,omitempty"`
}

// WSResponse represents a WebSocket response to UI
type WSResponse struct {
	ID     string          `json:"id"`
	Result json.RawMessage `json:"result,omitempty"`
	Error  *WSError        `json:"error,omitempty"`
}

// WSError represents a WebSocket error
type WSError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// WSEvent represents a WebSocket event pushed to UI
type WSEvent struct {
	Type    string `json:"type"`
	Payload any    `json:"payload"`
}

// ==================== API Response Types ====================

// AgentInfo represents agent information for UI
type AgentInfo struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Type         string   `json:"type"`
	State        string   `json:"state"`
	Command      string   `json:"command,omitempty"`
	Description  string   `json:"description,omitempty"`
	Enabled      *bool    `json:"enabled,omitempty"`
	Capabilities []string `json:"capabilities,omitempty"`
	LastActive   string   `json:"lastActive,omitempty"`
}

// SwarmInfo represents swarm information for UI
type SwarmInfo struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Topology   string `json:"topology"`
	Strategy   string `json:"strategy"`
	Status     string `json:"status"`
	AgentCount int    `json:"agentCount"`
	TaskCount  int    `json:"taskCount"`
	Stats      *SwarmStatsInfo `json:"stats,omitempty"`
}

type SwarmStatsInfo struct {
	AgentCount      int    `json:"agentCount"`
	IdleAgents      int    `json:"idleAgents"`
	ExecutingAgents int    `json:"executingAgents"`
	PendingTasks    int    `json:"pendingTasks"`
	CompletedTasks  int    `json:"completedTasks"`
	Topology        string `json:"topology"`
	Strategy        string `json:"strategy"`
	State           string `json:"state"`
}

// TeamInfo represents team information for UI
type TeamInfo struct {
	ID          string       `json:"id"`
	Name        string       `json:"name"`
	Description string       `json:"description,omitempty"`
	OwnerID     string       `json:"ownerId"`
	Members     []MemberInfo `json:"members"`
	Agents      []string     `json:"agents"`
	CreatedAt   string       `json:"createdAt"`
}

// MemberInfo represents team member information for UI
type MemberInfo struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Role   string `json:"role"`
	Online bool   `json:"online"`
}

// SessionInfo represents session information for UI
type SessionInfo struct {
	ID        string        `json:"id"`
	AgentID   string        `json:"agentId"`
	Mode      string        `json:"mode"`
	Messages  []MessageInfo `json:"messages"`
	CreatedAt string        `json:"createdAt"`
	UpdatedAt string        `json:"updatedAt"`
}

// MessageInfo represents message information for UI
type MessageInfo struct {
	Role      string `json:"role"`
	Content   string `json:"content"`
	Timestamp string `json:"timestamp"`
}

// MCPServerInfo represents MCP server information for UI
type MCPServerInfo struct {
	ID       string            `json:"id"`
	Name     string            `json:"name"`
	Type     string            `json:"type,omitempty"`
	Command  string            `json:"command,omitempty"`
	Args     []string          `json:"args,omitempty"`
	URL      string            `json:"url,omitempty"`
	Headers  map[string]string `json:"headers,omitempty"`
	Env      map[string]string `json:"env,omitempty"`
	Disabled bool              `json:"disabled,omitempty"`
	Source   string            `json:"source,omitempty"`
	Status   string            `json:"status"`
	Tools    []ToolInfo        `json:"tools,omitempty"`
}

// ToolInfo represents MCP tool information for UI
type ToolInfo struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema,omitempty"`
}

// TaskInfo represents task information for UI
type TaskInfo struct {
	ID          string        `json:"id"`
	Title       string        `json:"title"`
	Description string        `json:"description"`
	Status      string        `json:"status"`
	Priority    string        `json:"priority"`
	AssignedTo  []string      `json:"assignedTo,omitempty"`
	Results     []*ResultInfo `json:"results,omitempty"`
	CreatedAt   string        `json:"createdAt"`
	StartedAt   *string       `json:"startedAt,omitempty"`
	CompletedAt *string       `json:"completedAt,omitempty"`
}

// ResultInfo represents task result information for UI
type ResultInfo struct {
	AgentID  string `json:"agentId"`
	Content  string `json:"content"`
	Success  bool   `json:"success"`
	Duration int64  `json:"duration"`
}

// EmergenceData represents emergence dashboard data for UI
type EmergenceData struct {
	Health  SwarmHealth      `json:"health"`
	Signals []EmergentSignal `json:"signals"`
	Agents  []AgentNode      `json:"agents"`
	Flows   []TaskFlow       `json:"flows"`
}

// SwarmHealth represents swarm health metrics
type SwarmHealth struct {
	OverallScore     float64 `json:"overallScore"`
	CongestionLevel  float64 `json:"congestionLevel"`
	CollaborationIdx float64 `json:"collaborationIndex"`
	InnovationRate   float64 `json:"innovationRate"`
	AgentUtilization float64 `json:"agentUtilization"`
}

// EmergentSignal represents an emergent signal
type EmergentSignal struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	Severity  string `json:"severity"`
	Message   string `json:"message"`
	Timestamp string `json:"timestamp"`
}

// AgentNode represents an agent in the network graph
type AgentNode struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Type         string  `json:"type"`
	Load         float64 `json:"load"`
	Connectivity int     `json:"connectivity"`
	X            float64 `json:"x"`
	Y            float64 `json:"y"`
}

// TaskFlow represents task flow between agents
type TaskFlow struct {
	ID        string `json:"id"`
	FromAgent string `json:"fromAgent"`
	ToAgent   string `json:"toAgent"`
	TaskType  string `json:"taskType"`
	Status    string `json:"status"`
	StartedAt string `json:"startedAt"`
}

// SupervisorStats represents supervisor statistics for UI
type SupervisorStats struct {
	TotalAgents     int     `json:"totalAgents"`
	HealthyAgents   int     `json:"healthyAgents"`
	DegradedAgents  int     `json:"degradedAgents"`
	UnhealthyAgents int     `json:"unhealthyAgents"`
	BusyAgents      int     `json:"busyAgents"`
	AvgResponseTime float64 `json:"avgResponseTime"`
	Throughput      float64 `json:"throughput"`
}

// FileInfo represents file information for UI
type FileInfo struct {
	Path         string `json:"path"`
	Name         string `json:"name"`
	IsDirectory  bool   `json:"isDirectory"`
	Size         int64  `json:"size"`
	LastModified string `json:"lastModified"`
}

// PermissionRequest represents a permission request for UI
type PermissionRequest struct {
	ID          string             `json:"id"`
	SessionID   string             `json:"sessionId"`
	Type        string             `json:"type"`
	Description string             `json:"description"`
	Options     []PermissionOption `json:"options,omitempty"`
	Metadata    map[string]any     `json:"metadata,omitempty"`
}

// PermissionOption represents a permission option
type PermissionOption struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"`
}

// ==================== WebSocketServer ====================

// WebSocketServer exposes ACP API to UI via WebSocket
type WebSocketServer struct {
	addr     string
	upgrader websocket.Upgrader
	handler  *CommandHandler
	hub      *ClientHub

	// Dependencies
	registry    *agent.Registry
	connManager *acp.ConnectionManager
	swarms      map[string]*swarm.Swarm
	supervisors map[string]*swarm.Supervisor // Supervisor instances for event streaming
	teamManager *team.Manager
	mcpClients  map[string]*mcp.Client

	// Workspace
	workspacePath string // Root directory for file operations

	// LSP
	lspManager *lsp.Manager

	// Agent scanning
	scanner *agent.Scanner

	// A2A protocol
	a2aRouter      *a2a.Router
	a2aCoordinator *a2a.Coordinator
	a2aCardRegistry *a2a.AgentCardRegistry

	// Emergence
	emergenceService *EmergenceService // Real-time emergence dashboard data

	// Shadow buffer (Design Doc Section 7: code change double-buffering)
	shadowBuffer *ShadowBuffer

	// Verifier runs lint/compile checks after patch commit
	verifier *Verifier

	// Sensitive command detector (Design Doc S6: HITL interception)
	sensitiveDetector *acp.SensitiveDetector

	// Terminal
	terminalMgr *terminal.Manager

	// Workflow
	orchestrator *swarm.Orchestrator // Orchestrator for workflow commands

	// Schedule
	scheduleRunner *swarm.ScheduleRunner // Cron-based schedule runner

	// File watcher
	fileWatcher *FileWatcher

	// Sessions
	sessionToAgent  map[string]string            // sessionID -> agentID mapping
	sessionToMode   map[string]string            // sessionID -> mode mapping
	clientSessions  map[string]map[string]struct{} // clientID -> set of sessionIDs

	mu     sync.RWMutex
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup

	// configMu serializes config file load-modify-save operations
	// to prevent TOCTOU races between concurrent WebSocket commands
	configMu sync.Mutex

	// Security
	authToken string // Optional token for authentication (empty = no auth)
}

// WebSocketConfig for WebSocket server
type WebSocketConfig struct {
	Addr        string
	Registry    *agent.Registry
	ConnManager *acp.ConnectionManager
	Swarms      map[string]*swarm.Swarm
	Supervisors map[string]*swarm.Supervisor // Supervisors for event streaming
	TeamManager *team.Manager
	MCPClients  map[string]*mcp.Client

	// Workspace
	WorkspacePath string // Root directory for file operations (defaults to current directory)

	// Security settings
	AuthToken      string   // Optional token for authentication (empty = no auth)
	AllowedOrigins []string // Allowed origins for CORS (empty = allow all in dev mode)
}

// NewWebSocketServer creates a new WebSocket server
func NewWebSocketServer(cfg *WebSocketConfig) *WebSocketServer {
	if cfg.Addr == "" {
		cfg.Addr = ":8080"
	}
	if cfg.Swarms == nil {
		cfg.Swarms = make(map[string]*swarm.Swarm)
	}
	if cfg.Supervisors == nil {
		cfg.Supervisors = make(map[string]*swarm.Supervisor)
	}
	if cfg.MCPClients == nil {
		cfg.MCPClients = make(map[string]*mcp.Client)
	}
	if cfg.WorkspacePath == "" {
		cfg.WorkspacePath = "."
	}

	// Build emergence service from available dependencies
	var emergenceService *EmergenceService
	if len(cfg.Supervisors) > 0 {
		var supervisor *swarm.Supervisor
		for _, sup := range cfg.Supervisors {
			supervisor = sup
			break
		}
		emergenceService = NewEmergenceService(supervisor, nil, nil)
	}

	// Initialize LSP manager for code intelligence
	rootDir := lsp.ResolveWorkspacePath(cfg.WorkspacePath)
	lspScanner := lsp.NewScanner()
	lspManager := lsp.NewManager(rootDir, lspScanner)

	// Initialize terminal manager for real PTY sessions
	terminalMgr := terminal.NewManager(cfg.WorkspacePath)

	// Initialize agent scanner for CLI discovery
	agentScanner := agent.NewScanner()

	// Initialize A2A protocol components
	a2aRouter := a2a.NewRouter(a2a.RouterConfig{
		QueueSize:   1000,
		SendTimeout: 5 * time.Second,
		RetryCount:  3,
		RetryDelay:  100 * time.Millisecond,
	})
	a2aCoordinator := a2a.NewCoordinator(a2a.CoordinatorConfig{
		MaxConcurrent:      10,
		TaskTimeout:        30 * time.Minute,
		NegotiationTimeout: 30 * time.Second,
		PheromoneDecay:     0.1,
		Strategy:           a2a.StrategyCollaborative,
		MaxCompletedTasks:  1000,
		MaxPheromones:      500,
	}, a2aRouter)
	a2aCardRegistry := a2a.NewAgentCardRegistry()

	s := &WebSocketServer{
		addr:             cfg.Addr,
		registry:         cfg.Registry,
		connManager:      cfg.ConnManager,
		swarms:           cfg.Swarms,
		supervisors:      cfg.Supervisors,
		teamManager:      cfg.TeamManager,
		mcpClients:       cfg.MCPClients,
		workspacePath:    cfg.WorkspacePath,
		emergenceService: emergenceService,
		lspManager:       lspManager,
		terminalMgr:      terminalMgr,
		scanner:          agentScanner,
		a2aRouter:        a2aRouter,
		a2aCoordinator:   a2aCoordinator,
		a2aCardRegistry:  a2aCardRegistry,
		shadowBuffer:     NewShadowBuffer(),
		clientSessions:   make(map[string]map[string]struct{}),
		sessionToMode:    make(map[string]string),
		authToken:        cfg.AuthToken,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				return checkOrigin(r, cfg.AllowedOrigins)
			},
		},
	}

	// Security baseline summary at startup
	if cfg.AuthToken == "" {
		wsLog.Warn("Security: no auth token configured — WebSocket connections will be unauthenticated")
	} else {
		wsLog.Info("Security: auth token configured — WebSocket connections require authentication")
	}
	if len(cfg.AllowedOrigins) == 0 {
		wsLog.Warn("Security: no AllowedOrigins configured — all origins accepted (dev mode)")
	} else {
		wsLog.Info("Security: AllowedOrigins configured", "origins", cfg.AllowedOrigins)
	}

	s.handler = NewCommandHandler(s)
	s.hub = NewClientHub(s)
	s.fileWatcher = NewFileWatcher(s.hub)

	// Wire LSP diagnostics push: when LSP server sends publishDiagnostics,
	// broadcast immediately to all connected clients (Cursor/Windsurf pattern).
	lspManager.OnDiagnostics(func(uri string, diags []lsp.Diagnostic) {
		s.hub.Broadcast("lsp_diagnostics_update", map[string]any{
			"uri":         uri,
			"diagnostics": diags,
		})
	})

	return s
}

// Start starts the WebSocket server
func (s *WebSocketServer) Start(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}
	s.mu.Lock()
	s.ctx, s.cancel = context.WithCancel(ctx)
	s.mu.Unlock()

	// Start A2A protocol components
	if err := s.a2aRouter.Start(ctx); err != nil {
		return fmt.Errorf("failed to start A2A router: %w", err)
	}
	if err := s.a2aCoordinator.Start(ctx); err != nil {
		return fmt.Errorf("failed to start A2A coordinator: %w", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.handleWebSocket)
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/api/terminal/ws", s.HandleTerminalWebSocket)

	server := &http.Server{
		Addr:           s.addr,
		Handler:        mux,
		ReadTimeout:    10 * time.Second,
		WriteTimeout:   30 * time.Second,
		IdleTimeout:    120 * time.Second,
		MaxHeaderBytes: 1 << 20, // 1MB
	}

	s.wg.Add(1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				wsLog.Error("Server shutdown goroutine panic", "panic", r)
			}
			s.wg.Done()
		}()
		<-s.ctx.Done()
		// Use a short timeout context for graceful shutdown
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer shutdownCancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			wsLog.Error("Server shutdown error", "error", err)
		}
	}()

	s.wg.Add(1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				wsLog.Error("Hub.Run panic", "panic", r)
			}
			s.wg.Done()
		}()
		s.hub.Run(s.ctx)
	}()

	// Connect team manager to hub for event broadcasting
	if s.teamManager != nil {
		s.teamManager.SetBroadcaster(s.hub)
		s.teamManager.SetA2ARouter(s.a2aRouter)
	}

	// Connect agent registry to hub for state change broadcasting
	if s.registry != nil {
		s.registry.SetBroadcaster(s.hub)
	}

	// Connect A2A router to hub for message broadcasting
	if s.a2aRouter != nil {
		s.a2aRouter.SetBroadcaster(s.hub)
	}

	// Connect MCP clients to hub for tool/status broadcasting
	for _, mc := range s.mcpClients {
		mc.SetBroadcaster(s.hub)
	}

	// Connect audit logger to hub for real-time audit event streaming
	if s.orchestrator != nil {
		if al := s.orchestrator.GetAuditLogger(); al != nil {
			al.SetBroadcaster(s.hub)
		}
	}

	wsLog.Info("Server starting", "addr", s.addr)
	return server.ListenAndServe()
}

// Stop stops the WebSocket server with graceful shutdown:
// 1. Drain: reject new connections (but let existing handlers finish)
// 2. Cancel: signal all goroutines to stop
// 3. Wait: for all goroutines to complete
// 4. Close: all client connections
func (s *WebSocketServer) Stop() {
	// Phase 1: Start drain - reject new connections
	s.hub.Drain()

	// Phase 2: Signal shutdown
	s.mu.Lock()
	cancel := s.cancel
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}

	// Phase 3: Wait for in-flight handlers to complete
	s.wg.Wait()

	// Phase 3.5: Stop A2A components
	s.a2aCoordinator.Stop()
	s.a2aRouter.Stop()

	// Phase 3.6: Stop file watcher
	if s.fileWatcher != nil {
		s.fileWatcher.Stop()
	}

	// Phase 4: Close all connections
	s.hub.Stop()
	wsLog.Info("Server stopped")
}

// Context returns the server's lifecycle context
func (s *WebSocketServer) Context() context.Context {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.ctx
}

// Handler returns the command handler
func (s *WebSocketServer) Handler() *CommandHandler {
	return s.handler
}

// EmergenceService returns the emergence service (nil if not configured)
func (s *WebSocketServer) EmergenceService() *EmergenceService {
	return s.emergenceService
}

// Hub returns the client hub
func (s *WebSocketServer) Hub() *ClientHub {
	return s.hub
}

// Registry returns the agent registry
func (s *WebSocketServer) Registry() *agent.Registry {
	return s.registry
}

// ConnManager returns the connection manager
func (s *WebSocketServer) ConnManager() *acp.ConnectionManager {
	return s.connManager
}

// Scanner returns the agent CLI scanner
func (s *WebSocketServer) Scanner() *agent.Scanner {
	return s.scanner
}

// ShadowBuffer returns the code change double-buffer (Design Doc Section 7)
func (s *WebSocketServer) ShadowBuffer() *ShadowBuffer {
	return s.shadowBuffer
}

// Verifier returns the lint/compile verifier, initializing lazily.
func (s *WebSocketServer) Verifier() *Verifier {
	if s.verifier == nil {
		s.verifier = NewVerifier(s.workspacePath)
	}
	return s.verifier
}

// WorkspacePath returns the root workspace directory.
func (s *WebSocketServer) WorkspacePath() string {
	return s.workspacePath
}

// SensitiveDetector returns the lazy-initialized sensitive command detector.
// Design Doc Section 6: HITL interception of risky commands.
func (s *WebSocketServer) SensitiveDetector() *acp.SensitiveDetector {
	if s.sensitiveDetector == nil {
		s.sensitiveDetector = acp.NewSensitiveDetector()
	}
	return s.sensitiveDetector
}

// A2ARouter returns the A2A protocol router
func (s *WebSocketServer) A2ARouter() *a2a.Router {
	return s.a2aRouter
}

// A2ACoordinator returns the A2A protocol coordinator
func (s *WebSocketServer) A2ACoordinator() *a2a.Coordinator {
	return s.a2aCoordinator
}

// A2ACardRegistry returns the A2A agent card registry
func (s *WebSocketServer) A2ACardRegistry() *a2a.AgentCardRegistry {
	return s.a2aCardRegistry
}

// TeamManager returns the team manager
func (s *WebSocketServer) TeamManager() *team.Manager {
	return s.teamManager
}

// ListSwarms returns all swarms
func (s *WebSocketServer) ListSwarms() map[string]*swarm.Swarm {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make(map[string]*swarm.Swarm, len(s.swarms))
	maps.Copy(result, s.swarms)
	return result
}

// GetSwarm returns a swarm by ID
func (s *WebSocketServer) GetSwarm(id string) (*swarm.Swarm, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sw, ok := s.swarms[id]
	return sw, ok
}

// AddSwarm adds a swarm and wires its handoff manager for event streaming.
// This enables real-time handoff events (requested, accepted, rejected, completed)
// to be broadcast to connected WebSocket clients.
func (s *WebSocketServer) AddSwarm(id string, sw *swarm.Swarm) {
	if sw == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.swarms[id] = sw
	// Wire handoff broadcaster for real-time event streaming (OpenAI Swarm pattern)
	sw.SetHandoffBroadcaster(s.hub)
	// Wire A2A router for inter-agent messaging
	sw.SetA2ARouter(s.a2aRouter)
}

// RemoveSwarm removes a swarm
func (s *WebSocketServer) RemoveSwarm(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.swarms, id)
}

// AddSupervisor adds a supervisor and wires its broadcaster for event streaming.
// This enables real-time supervisor alerts (stuck agents, health degradation) to be
// broadcast to connected WebSocket clients.
func (s *WebSocketServer) AddSupervisor(id string, sup *swarm.Supervisor) {
	if sup == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.supervisors[id] = sup
	// Wire broadcaster for real-time event streaming
	sup.SetBroadcaster(s.hub)
}

// RemoveSupervisor removes a supervisor
func (s *WebSocketServer) RemoveSupervisor(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.supervisors, id)
}

// SetOrchestrator sets the orchestrator for workflow commands
func (s *WebSocketServer) SetOrchestrator(orch *swarm.Orchestrator) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.orchestrator = orch
}

// Orchestrator returns the orchestrator
func (s *WebSocketServer) Orchestrator() *swarm.Orchestrator {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.orchestrator
}

// SetScheduleRunner sets the schedule runner for cron commands
func (s *WebSocketServer) SetScheduleRunner(runner *swarm.ScheduleRunner) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.scheduleRunner = runner
}

// ScheduleRunner returns the schedule runner
func (s *WebSocketServer) ScheduleRunner() *swarm.ScheduleRunner {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.scheduleRunner
}

// LSPManager returns the LSP manager
func (s *WebSocketServer) LSPManager() *lsp.Manager {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.lspManager
}

// SetWorkspace sets the workspace path and starts watching the directory for
// external file changes. The previous watcher is stopped.
func (s *WebSocketServer) SetWorkspace(path string) {
	s.mu.Lock()
	s.workspacePath = path
	s.mu.Unlock()

	if s.fileWatcher != nil {
		if err := s.fileWatcher.Watch(path); err != nil {
			wsLog.Error("Failed to start file watcher", "path", path, "error", err)
		}
	}
}

// FileWatcher returns the file watcher instance.
func (s *WebSocketServer) FileWatcher() *FileWatcher {
	return s.fileWatcher
}

// ListMCPClients returns all MCP clients
func (s *WebSocketServer) ListMCPClients() map[string]*mcp.Client {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make(map[string]*mcp.Client, len(s.mcpClients))
	maps.Copy(result, s.mcpClients)
	return result
}

// GetMCPClient returns an MCP client by ID
func (s *WebSocketServer) GetMCPClient(id string) (*mcp.Client, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	client, ok := s.mcpClients[id]
	return client, ok
}

// AddMCPClient adds an MCP client
func (s *WebSocketServer) AddMCPClient(id string, client *mcp.Client) {
	if client == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.mcpClients[id] = client
}

// RemoveMCPClient removes an MCP client from the registry
func (s *WebSocketServer) RemoveMCPClient(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.mcpClients, id)
}

// handleWebSocket handles WebSocket upgrade requests
func (s *WebSocketServer) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Check auth token if required
	if s.authToken != "" {
		// Support both Authorization header (preferred) and URL query parameter (fallback)
		token := ""

		// Check Authorization header first (Bearer token)
		authHeader := r.Header.Get("Authorization")
		if after, ok := strings.CutPrefix(authHeader, "Bearer "); ok {
			token = after
		}

		// Fallback to URL query parameter (deprecated for production)
		if token == "" {
			token = r.URL.Query().Get("token")
			if token != "" {
				wsLog.Warn("Auth via query token (deprecated for production — use Authorization header instead)",
					"remote_addr", r.RemoteAddr)
			}
		}

		// Use constant-time comparison to prevent timing attacks
		if !cryptoEqual(token, s.authToken) {
			wsLog.Warn("Authentication failed", "remote_addr", r.RemoteAddr, "reason", "invalid token")
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
	}

	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		wsLog.Warn("Upgrade error", "error", err)
		return
	}

	clientID := "client_" + uuid.New().String()[:8]
	client := NewClient(clientID, conn, s)

	if err := s.hub.Register(client); err != nil {
		conn.Close()
		wsLog.Warn("Rejected client", "client_id", clientID, "error", err)
		return
	}

	s.wg.Add(1)
	go client.ReadLoop()

	s.wg.Add(1)
	go client.WriteLoop()
}

// cryptoEqual performs constant-time comparison to prevent timing attacks
func cryptoEqual(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

// handleHealth handles health check requests
func (s *WebSocketServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write([]byte("OK")); err != nil {
		wsLog.Warn("Health check write error", "error", err)
	}
}

// ==================== ClientHub ====================

// ClientHub manages all WebSocket connections and broadcasts events
type ClientHub struct {
	server        *WebSocketServer
	clients       map[string]*Client
	broadcast     chan *WSEvent
	subscriptions map[string]map[string]struct{}

	mu       sync.RWMutex
	ctx      context.Context
	cancel   context.CancelFunc
	draining bool // true after Drain() called — reject new registrations
}

// NewClientHub creates a new client hub
func NewClientHub(server *WebSocketServer) *ClientHub {
	return &ClientHub{
		server:        server,
		clients:       make(map[string]*Client),
		broadcast:     make(chan *WSEvent, 100),
		subscriptions: make(map[string]map[string]struct{}),
	}
}

// Run starts the hub event loop
func (h *ClientHub) Run(ctx context.Context) {
	if ctx == nil {
		ctx = context.Background()
	}
	h.mu.Lock()
	h.ctx, h.cancel = context.WithCancel(ctx)
	h.mu.Unlock()

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-h.ctx.Done():
			return
		case event := <-h.broadcast:
			h.broadcastEvent(event)
		case <-ticker.C:
			h.pushStats()
		}
	}
}

// Stop stops the hub
func (h *ClientHub) Stop() {
	h.mu.Lock()
	cancel := h.cancel
	h.mu.Unlock()
	if cancel != nil {
		cancel()
	}

	h.mu.Lock()
	for _, client := range h.clients {
		client.Close()
	}
	h.clients = make(map[string]*Client)
	h.mu.Unlock()
}

// Drain stops accepting new connections as the first phase of graceful shutdown.
// This implements the nats-inspired two-phase shutdown:
//   - Phase 1 (Drain): reject new registrations but let existing handlers continue
//   - Phase 2 (Stop): cancel context, wait for handlers, then close connections
//
// Drain() is called automatically by Stop(). Manual calling is only needed
// when you want to reject new connections before starting the full shutdown.
func (h *ClientHub) Drain() {
	h.mu.Lock()
	h.draining = true
	h.mu.Unlock()
	hubLog.Info("Draining, rejecting new connections")
}

// IsDraining reports whether the hub is in drain mode.
func (h *ClientHub) IsDraining() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.draining
}

// Register registers a new client. Returns ErrHubDraining if the hub is shutting down.
func (h *ClientHub) Register(client *Client) error {
	h.mu.Lock()
	if h.draining {
		h.mu.Unlock()
		return fmt.Errorf("hub is draining: %w", ErrHubDraining)
	}
	h.clients[client.ID] = client
	clientCount := len(h.clients)
	h.mu.Unlock()

	hubLog.Info("Client registered", "client_id", client.ID, "total", clientCount)

	// Send event outside lock to avoid blocking on I/O
	client.SendEvent("connected", map[string]any{
		"clientId": client.ID,
		"time":     time.Now().Format(time.RFC3339),
	})
	return nil
}

// Unregister unregisters a client
func (h *ClientHub) Unregister(client *Client) {
	h.mu.Lock()
	delete(h.clients, client.ID)
	for eventType := range h.subscriptions {
		delete(h.subscriptions[eventType], client.ID)
		if len(h.subscriptions[eventType]) == 0 {
			delete(h.subscriptions, eventType)
		}
	}
	clientCount := len(h.clients)
	h.mu.Unlock()

	// Clean up session -> agent mappings owned by this client.
	h.server.mu.Lock()
	if sessions, ok := h.server.clientSessions[client.ID]; ok {
		count := 0
		for sid := range sessions {
			if _, exists := h.server.sessionToAgent[sid]; exists {
				delete(h.server.sessionToAgent, sid)
				count++
			}
		}
		delete(h.server.clientSessions, client.ID)
		h.server.mu.Unlock()
		if count > 0 {
			hubLog.Info("Client unregistered", "client_id", client.ID, "total", clientCount, "cleaned_sessions", count)
			return
		}
	} else {
		h.server.mu.Unlock()
	}

	hubLog.Info("Client unregistered", "client_id", client.ID, "total", clientCount)
}

// Broadcast broadcasts an event to all clients
func (h *ClientHub) Broadcast(eventType string, payload any) {
	// Guard against Broadcast called before Run() initializes h.ctx
	h.mu.RLock()
	ctx := h.ctx
	h.mu.RUnlock()
	if ctx == nil {
		return
	}
	select {
	case <-ctx.Done():
		// Hub is stopped, drop the event
		return
	default:
	}
	select {
	case h.broadcast <- &WSEvent{
		Type:    eventType,
		Payload: payload,
	}:
	case <-ctx.Done():
		// Hub stopped while sending, drop the event
	}
}

// Subscribe subscribes a client to an event type
func (h *ClientHub) Subscribe(clientID string, eventType string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.subscriptions[eventType] == nil {
		h.subscriptions[eventType] = make(map[string]struct{})
	}
	h.subscriptions[eventType][clientID] = struct{}{}
}

// broadcastEvent broadcasts an event to all clients
func (h *ClientHub) broadcastEvent(event *WSEvent) {
	// Take a snapshot of clients under lock to avoid holding lock during I/O
	h.mu.RLock()
	clients := make([]*Client, 0, len(h.clients))
	for _, client := range h.clients {
		clients = append(clients, client)
	}
	h.mu.RUnlock()

	data, err := json.Marshal(event)
	if err != nil {
		hubLog.Error("Failed to marshal event", "error", err)
		return
	}

	for _, client := range clients {
		if err := client.SendRaw(data); err != nil {
			hubLog.Warn("Failed to send to client", "client_id", client.ID, "error", err)
		}
	}
}

// pushStats pushes periodic stats to clients
func (h *ClientHub) pushStats() {
	if agents := h.getAgentStats(); len(agents) > 0 {
		h.Broadcast("agent_stats", agents)
	}

	if swarms := h.getSwarmStats(); len(swarms) > 0 {
		h.Broadcast("swarm_stats", swarms)
	}
}

// getAgentStats gets agent statistics
func (h *ClientHub) getAgentStats() []AgentInfo {
	if h.server.registry == nil {
		return nil
	}

	agents := h.server.registry.GetAll()
	result := make([]AgentInfo, 0, len(agents))
	for _, a := range agents {
		result = append(result, AgentInfo{
			ID:    string(a.ID),
			Name:  a.Name,
			Type:  string(a.Type),
			State: string(a.GetState()),
		})
	}
	return result
}

// getSwarmStats gets swarm statistics
func (h *ClientHub) getSwarmStats() []SwarmInfo {
	swarms := h.server.ListSwarms()
	result := make([]SwarmInfo, 0, len(swarms))
	for id, sw := range swarms {
		stats := sw.GetStats()
		result = append(result, SwarmInfo{
			ID:         id,
			Name:       sw.Name,
			Topology:   string(sw.Topology),
			Strategy:   string(sw.Strategy),
			Status:     stats.State,
			AgentCount: stats.AgentCount,
			TaskCount:  stats.PendingTasks + stats.CompletedTasks,
			Stats: &SwarmStatsInfo{
				AgentCount:      stats.AgentCount,
				IdleAgents:      stats.IdleAgents,
				ExecutingAgents: stats.ExecutingAgents,
				PendingTasks:    stats.PendingTasks,
				CompletedTasks:  stats.CompletedTasks,
				Topology:        stats.Topology,
				Strategy:        stats.Strategy,
				State:           stats.State,
			},
		})
	}
	return result
}

// ==================== Client ====================

// Client represents a WebSocket client connection
type Client struct {
	ID      string
	conn    *websocket.Conn
	server  *WebSocketServer
	sendCh  chan []byte
	closeCh chan struct{}
	mu      sync.Mutex
}

// NewClient creates a new WebSocket client
func NewClient(id string, conn *websocket.Conn, server *WebSocketServer) *Client {
	// Limit maximum message size to 1MB to prevent memory exhaustion
	conn.SetReadLimit(1 << 20)

	return &Client{
		ID:      id,
		conn:    conn,
		server:  server,
		sendCh:  make(chan []byte, 100),
		closeCh: make(chan struct{}),
	}
}

// wsPongWait is how long to wait for a pong before considering the connection dead.
const wsPongWait = 60 * time.Second

// wsPingPeriod must be shorter than wsPongWait.
const wsPingPeriod = 30 * time.Second

// ReadLoop reads messages from the client with ping/pong keepalive.
// Dead connections (no pong within wsPongWait) are detected automatically.
func (c *Client) ReadLoop() {
	defer func() {
		if r := recover(); r != nil {
			wsLog.Error("ReadLoop panic", "client_id", c.ID, "panic", r)
		}
		c.server.Hub().Unregister(c)
		c.Close()
		c.server.wg.Done()
	}()

	// Set up read deadline and pong handler for keepalive.
	c.conn.SetReadDeadline(time.Now().Add(wsPongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(wsPongWait))
		return nil
	})

	// Start ping ticker in a separate goroutine.
	c.server.wg.Add(1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				wsLog.Error("Ping ticker panic", "client_id", c.ID, "panic", r)
			}
			c.server.wg.Done()
		}()
		ticker := time.NewTicker(wsPingPeriod)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				c.mu.Lock()
				c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					c.mu.Unlock()
					return // connection is dead
				}
				c.mu.Unlock()
			case <-c.closeCh:
				return
			}
		}
	}()

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				wsLog.Warn("Read error", "client_id", c.ID, "error", err)
			}
			return
		}

		c.handleMessage(message)
	}
}

// WriteLoop writes messages to the client
func (c *Client) WriteLoop() {
	defer func() {
		if r := recover(); r != nil {
			wsLog.Error("WriteLoop panic", "client_id", c.ID, "panic", r)
		}
		c.server.wg.Done()
	}()

	for {
		select {
		case <-c.closeCh:
			return
		case data := <-c.sendCh:
			c.mu.Lock()
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			err := c.conn.WriteMessage(websocket.TextMessage, data)
			c.mu.Unlock()
			if err != nil {
				wsLog.Warn("Write error", "client_id", c.ID, "error", err)
				return
			}
		}
	}
}

// handleMessage handles an incoming message
func (c *Client) handleMessage(data []byte) {
	defer func() {
		if r := recover(); r != nil {
			wsLog.Error("handleMessage panic", "client_id", c.ID, "panic", r)
		}
	}()

	var req WSRequest
	if err := json.Unmarshal(data, &req); err != nil {
		c.SendError(req.ID, -32700, "Parse error")
		return
	}

	handler := c.server.Handler()
	result, err := handler.HandleCommand(req.Method, req.Params, c.ID)
	if err != nil {
		// Log error for debugging
		wsLog.Warn("Command error", "method", req.Method, "error", err)
		// Use typed error code if available, otherwise generic internal error
		var apiErr *APIError
		if errors.As(err, &apiErr) {
			c.SendError(req.ID, apiErr.Code, apiErr.Message)
		} else {
			c.SendError(req.ID, CodeInternalError, "internal error")
		}
		return
	}

	c.SendResult(req.ID, result)
}

// SendResult sends a successful result
func (c *Client) SendResult(id string, result any) {
	var resultData json.RawMessage
	if result != nil {
		data, err := json.Marshal(result)
		if err != nil {
			c.SendError(id, -32603, "Failed to marshal result")
			return
		}
		resultData = data
	}

	resp := WSResponse{
		ID:     id,
		Result: resultData,
	}

	data, err := json.Marshal(resp)
	if err != nil {
		wsLog.Error("Failed to marshal response", "client_id", c.ID, "error", err)
		return
	}

	if err := c.SendRaw(data); err != nil {
		wsLog.Warn("Failed to send response", "client_id", c.ID, "error", err)
	}
}

// SendError sends an error response
func (c *Client) SendError(id string, code int, message string) {
	resp := WSResponse{
		ID: id,
		Error: &WSError{
			Code:    code,
			Message: message,
		},
	}

	data, err := json.Marshal(resp)
	if err != nil {
		wsLog.Error("Failed to marshal error", "client_id", c.ID, "error", err)
		return
	}

	if err := c.SendRaw(data); err != nil {
		wsLog.Warn("Failed to send error", "client_id", c.ID, "error", err)
	}
}

// SendEvent sends an event to the client
func (c *Client) SendEvent(eventType string, payload any) {
	event := WSEvent{
		Type:    eventType,
		Payload: payload,
	}

	data, err := json.Marshal(event)
	if err != nil {
		wsLog.Error("Failed to marshal event", "client_id", c.ID, "error", err)
		return
	}

	if err := c.SendRaw(data); err != nil {
		wsLog.Warn("Failed to send event", "client_id", c.ID, "error", err)
	}
}

// SendRaw sends raw data to the client
func (c *Client) SendRaw(data []byte) error {
	select {
	case c.sendCh <- data:
		return nil
	default:
		return ErrSendBufferFull
	}
}

// Close closes the client connection
func (c *Client) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()

	select {
	case <-c.closeCh:
		return
	default:
		close(c.closeCh)
		c.conn.Close()
	}
}

// ==================== Security Helpers ====================

// checkOrigin validates the origin of WebSocket requests
func checkOrigin(r *http.Request, allowedOrigins []string) bool {
	// If no allowed origins specified, allow all (development mode)
	// WARNING: In production, always configure AllowedOrigins
	if len(allowedOrigins) == 0 {
		origin := r.Header.Get("Origin")
		if origin != "" {
			wsLog.Warn("No allowed origins configured, accepting connection", "origin", origin)
		}
		return true
	}

	origin := r.Header.Get("Origin")
	if origin == "" {
		// Allow connections without Origin header (e.g., non-browser clients)
		return true
	}

	// Check if origin is in allowed list
	for _, allowed := range allowedOrigins {
		if origin == allowed {
			return true
		}
		// Support wildcard subdomains (e.g., *.example.com)
		if strings.HasPrefix(allowed, "*.") {
			domain := allowed[2:]
			if strings.HasSuffix(origin, "."+domain) {
				return true
			}
		}
	}

	wsLog.Warn("Rejected connection from origin", "origin", origin)
	return false
}
