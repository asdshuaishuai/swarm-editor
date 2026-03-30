// Package api provides WebSocket API server for UI communication
package api

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log"
	"maps"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
	"github.com/swarm-editor/swarm-editor/internal/mcp"
	"github.com/swarm-editor/swarm-editor/internal/swarm"
	"github.com/swarm-editor/swarm-editor/internal/team"
)

var ErrSendBufferFull = errors.New("send buffer full")

// ==================== API Error Codes ====================
// JSON-RPC standard codes
const (
	CodeParseError    = -32700
	CodeInvalidRequest = -32600
	CodeMethodNotFound = -32601
	CodeInvalidParams = -32602
	CodeInternalError = -32603
)

// Application-specific error codes (positive range to avoid JSON-RPC conflicts)
const (
	CodeNotFound       = -32001
	CodeValidation     = -32002
	CodeUnauthorized   = -32003
	CodeRateLimited    = -32004
	CodeConflict       = -32005
	CodeNotConnected   = -32006
	CodeLimitExceeded  = -32007
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
	ID      string     `json:"id"`
	Name    string     `json:"name"`
	Command string     `json:"command"`
	Args    []string   `json:"args,omitempty"`
	Status  string     `json:"status"`
	Tools   []ToolInfo `json:"tools,omitempty"`
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
	Priority    int           `json:"priority"`
	AssignedTo  []string      `json:"assignedTo,omitempty"`
	Results     []*ResultInfo `json:"results,omitempty"`
	CreatedAt   string        `json:"createdAt"`
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

	// Emergence
	emergenceService *EmergenceService // Real-time emergence dashboard data

	// Workflow
	orchestrator *swarm.Orchestrator // Orchestrator for workflow commands

	// Schedule
	scheduleRunner *swarm.ScheduleRunner // Cron-based schedule runner

	// Sessions
	sessionToAgent map[string]string // sessionID -> agentID mapping

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
		authToken:        cfg.AuthToken,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				return checkOrigin(r, cfg.AllowedOrigins)
			},
		},
	}

	s.handler = NewCommandHandler(s)
	s.hub = NewClientHub(s)

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

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.handleWebSocket)
	mux.HandleFunc("/health", s.handleHealth)

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
				log.Printf("[WebSocket] Server shutdown goroutine panic: %v", r)
			}
			s.wg.Done()
		}()
		<-s.ctx.Done()
		// Use a short timeout context for graceful shutdown
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer shutdownCancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("[WebSocket] Server shutdown error: %v", err)
		}
	}()

	s.wg.Add(1)
	go s.hub.Run(s.ctx)

	// Connect team manager to hub for event broadcasting
	if s.teamManager != nil {
		s.teamManager.SetBroadcaster(s.hub)
	}

	log.Printf("[WebSocket] Server starting on %s", s.addr)
	return server.ListenAndServe()
}

// Stop stops the WebSocket server
func (s *WebSocketServer) Stop() {
	s.mu.Lock()
	cancel := s.cancel
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	s.wg.Wait()
	s.hub.Stop()
	log.Printf("[WebSocket] Server stopped")
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

		// Fallback to URL query parameter
		if token == "" {
			token = r.URL.Query().Get("token")
		}

		// Use constant-time comparison to prevent timing attacks
		if !cryptoEqual(token, s.authToken) {
			log.Printf("[WebSocket] Authentication failed for %q (invalid token)", r.RemoteAddr)
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
	}

	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WebSocket] Upgrade error: %v", err)
		return
	}

	clientID := "client_" + uuid.New().String()[:8]
	client := NewClient(clientID, conn, s)

	s.hub.Register(client)

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
		log.Printf("[WebSocket] Health check write error: %v", err)
	}
}

// ==================== ClientHub ====================

// ClientHub manages all WebSocket connections and broadcasts events
type ClientHub struct {
	server        *WebSocketServer
	clients       map[string]*Client
	broadcast     chan *WSEvent
	subscriptions map[string]map[string]struct{}

	mu     sync.RWMutex
	ctx    context.Context
	cancel context.CancelFunc
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
	h.ctx, h.cancel = context.WithCancel(ctx)

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
	if h.cancel != nil {
		h.cancel()
	}

	h.mu.Lock()
	for _, client := range h.clients {
		client.Close()
	}
	h.clients = make(map[string]*Client)
	h.mu.Unlock()
}

// Register registers a new client
func (h *ClientHub) Register(client *Client) {
	h.mu.Lock()
	h.clients[client.ID] = client
	clientCount := len(h.clients)
	h.mu.Unlock()

	log.Printf("[Hub] Client registered: %s (total: %d)", client.ID, clientCount)

	// Send event outside lock to avoid blocking on I/O
	client.SendEvent("connected", map[string]any{
		"clientId": client.ID,
		"time":     time.Now().Format(time.RFC3339),
	})
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

	// Clean up session -> agent mappings to prevent memory leak.
	// When a client disconnects without calling close_session, entries
	// in sessionToAgent become stale. Clear all entries since we don't
	// track which client owns which session (bounded at maxSessions=1000).
	h.server.mu.Lock()
	if len(h.server.sessionToAgent) > 0 {
		count := len(h.server.sessionToAgent)
		h.server.sessionToAgent = make(map[string]string)
		h.server.mu.Unlock()
		log.Printf("[Hub] Client unregistered: %s (total: %d), cleaned %d stale session mappings", client.ID, clientCount, count)
		return
	}
	h.server.mu.Unlock()

	log.Printf("[Hub] Client unregistered: %s (total: %d)", client.ID, clientCount)
}

// Broadcast broadcasts an event to all clients
func (h *ClientHub) Broadcast(eventType string, payload any) {
	// Guard against Broadcast called before Run() initializes h.ctx
	if h.ctx == nil {
		return
	}
	select {
	case <-h.ctx.Done():
		// Hub is stopped, drop the event
		return
	default:
	}
	select {
	case h.broadcast <- &WSEvent{
		Type:    eventType,
		Payload: payload,
	}:
	case <-h.ctx.Done():
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
		log.Printf("[Hub] Failed to marshal event: %v", err)
		return
	}

	for _, client := range clients {
		if err := client.SendRaw(data); err != nil {
			log.Printf("[Hub] Failed to send to client %s: %v", client.ID, err)
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
			log.Printf("[Client %s] ReadLoop panic: %v", c.ID, r)
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
				log.Printf("[WebSocket] Ping ticker panic for client %s: %v", c.ID, r)
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
				log.Printf("[Client %s] Read error: %v", c.ID, err)
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
			log.Printf("[Client %s] WriteLoop panic: %v", c.ID, r)
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
				log.Printf("[Client %s] Write error: %v", c.ID, err)
				return
			}
		}
	}
}

// handleMessage handles an incoming message
func (c *Client) handleMessage(data []byte) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[Client %s] handleMessage panic: %v", c.ID, r)
		}
	}()

	var req WSRequest
	if err := json.Unmarshal(data, &req); err != nil {
		c.SendError(req.ID, -32700, "Parse error")
		return
	}

	result, err := c.server.Handler().HandleCommand(req.Method, req.Params)
	if err != nil {
		// Log error for debugging
		log.Printf("[WebSocket] Command error for %q: %v", req.Method, err)
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
		log.Printf("[Client %s] Failed to marshal response: %v", c.ID, err)
		return
	}

	if err := c.SendRaw(data); err != nil {
		log.Printf("[Client %s] Failed to send response: %v", c.ID, err)
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
		log.Printf("[Client %s] Failed to marshal error: %v", c.ID, err)
		return
	}

	if err := c.SendRaw(data); err != nil {
		log.Printf("[Client %s] Failed to send error: %v", c.ID, err)
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
		log.Printf("[Client %s] Failed to marshal event: %v", c.ID, err)
		return
	}

	if err := c.SendRaw(data); err != nil {
		log.Printf("[Client %s] Failed to send event: %v", c.ID, err)
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
			log.Printf("[WebSocket] WARNING: No allowed origins configured, accepting connection from: %s", origin)
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

	log.Printf("[WebSocket] Rejected connection from origin: %s", origin)
	return false
}
