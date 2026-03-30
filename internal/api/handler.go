package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
	"github.com/swarm-editor/swarm-editor/internal/audit"
	"github.com/swarm-editor/swarm-editor/internal/swarm"
)

// Input validation limits
const (
	maxNameLen  = 100
	maxDescLen  = 500
	maxTitleLen = 200
	maxIDLen    = 128
	maxSessions = 1000
)

// CommandHandler handles WebSocket commands from UI
type CommandHandler struct {
	server *WebSocketServer
}

// NewCommandHandler creates a new command handler
func NewCommandHandler(server *WebSocketServer) *CommandHandler {
	return &CommandHandler{server: server}
}

// HandleCommand handles a command from UI
func (h *CommandHandler) HandleCommand(method string, params json.RawMessage) (any, error) {
	// Derive timeout from server context so in-flight commands are cancelled on shutdown
	parentCtx := h.server.Context()
	if parentCtx == nil {
		parentCtx = context.Background()
	}
	ctx, cancel := context.WithTimeout(parentCtx, 30*time.Second)
	defer cancel()

	switch method {
	// Agent management
	case "get_agents":
		return h.handleGetAgents(ctx, params)
	case "get_agent":
		return h.handleGetAgent(ctx, params)
	case "start_agent":
		return h.handleStartAgent(ctx, params)
	case "stop_agent":
		return h.handleStopAgent(ctx, params)
	case "refresh_agents":
		return h.handleRefreshAgents(ctx, params)
	case "add_agent":
		return h.handleAddAgent(ctx, params)
	case "update_agent":
		return h.handleUpdateAgent(ctx, params)
	case "delete_agent":
		return h.handleDeleteAgent(ctx, params)
	case "get_config_path":
		return h.handleGetConfigPath(ctx, params)

	// Session management
	case "create_session":
		return h.handleCreateSession(ctx, params)
	case "send_message":
		return h.handleSendMessage(ctx, params)
	case "close_session":
		return h.handleCloseSession(ctx, params)

	// Permission management
	case "permission_response":
		return h.handlePermissionResponse(ctx, params)

	// Swarm management
	case "get_swarms":
		return h.handleGetSwarms(ctx, params)
	case "get_swarm":
		return h.handleGetSwarm(ctx, params)
	case "create_swarm":
		return h.handleCreateSwarm(ctx, params)
	case "start_swarm":
		return h.handleStartSwarm(ctx, params)
	case "stop_swarm":
		return h.handleStopSwarm(ctx, params)
	case "delete_swarm":
		return h.handleDeleteSwarm(ctx, params)
	case "submit_task":
		return h.handleSubmitTask(ctx, params)
	case "get_swarm_tasks":
		return h.handleGetSwarmTasks(ctx, params)
	case "execute_task":
		return h.handleExecuteTask(ctx, params)

	// Team management
	case "get_teams":
		return h.handleGetTeams(ctx, params)
	case "create_team":
		return h.handleCreateTeam(ctx, params)
	case "delete_team":
		return h.handleDeleteTeam(ctx, params)
	case "add_agent_to_team":
		return h.handleAddAgentToTeam(ctx, params)
	case "remove_agent_from_team":
		return h.handleRemoveAgentFromTeam(ctx, params)

	// MCP management
	case "get_mcp_servers":
		return h.handleGetMCPServers(ctx, params)
	case "start_mcp_server":
		return h.handleStartMCPServer(ctx, params)
	case "stop_mcp_server":
		return h.handleStopMCPServer(ctx, params)
	case "call_mcp_tool":
		return h.handleCallMCPTool(ctx, params)
	case "add_mcp_server":
		return h.handleAddMCPServer(ctx, params)
	case "remove_mcp_server":
		return h.handleRemoveMCPServer(ctx, params)

	// Monitoring
	case "get_supervisor_stats":
		return h.handleGetSupervisorStats(ctx, params)
	case "get_emergence_data":
		return h.handleGetEmergenceData(ctx, params)

	// File system
	case "list_dir":
		return h.handleListDir(ctx, params)
	case "read_file":
		return h.handleReadFile(ctx, params)
	case "write_file":
		return h.handleWriteFile(ctx, params)

	// Workflow management
	case "list_workflows":
		return h.handleListWorkflows(ctx, params)
	case "get_workflow":
		return h.handleGetWorkflow(ctx, params)
	case "create_workflow":
		return h.handleCreateWorkflow(ctx, params)
	case "update_workflow":
		return h.handleUpdateWorkflow(ctx, params)
	case "delete_workflow":
		return h.handleDeleteWorkflow(ctx, params)
	case "execute_workflow":
		return h.handleExecuteWorkflow(ctx, params)
	case "get_workflow_checkpoints":
		return h.handleGetWorkflowCheckpoints(ctx, params)
	case "restore_workflow":
		return h.handleRestoreWorkflow(ctx, params)
	case "resume_workflow":
		return h.handleResumeWorkflow(ctx, params)
	case "add_workflow_node":
		return h.handleAddWorkflowNode(ctx, params)
	case "add_workflow_edge":
		return h.handleAddWorkflowEdge(ctx, params)
	case "get_workflow_report":
		return h.handleGetWorkflowReport(ctx, params)
	case "clear_node_cache":
		return h.handleClearNodeCache(ctx, params)
	case "clear_all_caches":
		return h.handleClearAllCaches(ctx, params)
	case "list_automations":
		return h.handleListAutomations(ctx, params)
	case "add_automation":
		return h.handleAddAutomation(ctx, params)
	case "remove_automation":
		return h.handleRemoveAutomation(ctx, params)
	case "enable_automation":
		return h.handleEnableAutomation(ctx, params)
	case "list_artifacts":
		return h.handleListArtifacts(ctx, params)
	case "get_artifact":
		return h.handleGetArtifact(ctx, params)
	case "create_artifact":
		return h.handleCreateArtifact(ctx, params)
	case "delete_artifact":
		return h.handleDeleteArtifact(ctx, params)

	// Audit Log Commands
	case "list_audit_events":
		return h.handleListAuditEvents(ctx, params)
	case "get_audit_stats":
		return h.handleGetAuditStats(ctx, params)
	case "clear_audit_log":
		return h.handleClearAuditLog(ctx, params)

	// Workflow Variables
	case "list_variables":
		return h.handleListVariables(ctx, params)
	case "add_variable":
		return h.handleAddVariable(ctx, params)
	case "remove_variable":
		return h.handleRemoveVariable(ctx, params)
	case "set_variable_value":
		return h.handleSetVariableValue(ctx, params)
	case "resolve_variables":
		return h.handleResolveVariables(ctx, params)

	// Schedule Runner
	case "start_schedule_runner":
		return h.handleStartScheduleRunner(ctx, params)
	case "stop_schedule_runner":
		return h.handleStopScheduleRunner(ctx, params)
	case "get_schedule_runner_status":
		return h.handleGetScheduleRunnerStatus(ctx, params)

	default:
		return nil, NewAPIError(CodeMethodNotFound, fmt.Sprintf("unknown method: %s", method))
	}
}

// ==================== Agent Handlers ====================

func (h *CommandHandler) handleGetAgents(ctx context.Context, params json.RawMessage) (any, error) {
	registry := h.server.Registry()
	if registry == nil {
		return []AgentInfo{}, nil
	}

	agents := registry.GetAll()
	result := make([]AgentInfo, 0, len(agents))

	// Add internal agents
	for _, a := range agents {
		result = append(result, AgentInfo{
			ID:    string(a.ID),
			Name:  a.Name,
			Type:  string(a.Type),
			State: string(a.GetState()),
		})
	}

	// Add external agents from connection manager
	if cm := h.server.ConnManager(); cm != nil {
		connections := cm.GetConnected()
		for _, conn := range connections {
			name := ""
			if conn.Config != nil {
				name = conn.Config.Name
			}
			result = append(result, AgentInfo{
				ID:    conn.ID,
				Name:  name,
				Type:  "external",
				State: "connected",
			})
		}
	}

	return result, nil
}

func (h *CommandHandler) handleGetAgent(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("agent id is required")
	}

	registry := h.server.Registry()
	if registry == nil {
		return nil, errNotFound("agent not found")
	}

	ag, ok := registry.Get(acp.AgentID(req.ID))
	if !ok {
		return nil, errNotFound("agent not found")
	}

	return AgentInfo{
		ID:    string(ag.ID),
		Name:  ag.Name,
		Type:  string(ag.Type),
		State: string(ag.GetState()),
	}, nil
}

func (h *CommandHandler) handleStartAgent(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("agent id is required")
	}

	registry := h.server.Registry()
	if registry == nil {
		return nil, NewAPIError(CodeInternalError, "service unavailable")
	}

	ag, ok := registry.Get(acp.AgentID(req.ID))
	if !ok {
		return nil, errNotFound("agent not found")
	}

	ag.SetState(agent.StateIdle)
	return map[string]string{"status": "started"}, nil
}

func (h *CommandHandler) handleStopAgent(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("agent id is required")
	}

	registry := h.server.Registry()
	if registry == nil {
		return nil, NewAPIError(CodeInternalError, "service unavailable")
	}

	ag, ok := registry.Get(acp.AgentID(req.ID))
	if !ok {
		return nil, errNotFound("agent not found")
	}

	ag.SetState(agent.StateError) // Using Error as "stopped" state
	return map[string]string{"status": "stopped"}, nil
}

func (h *CommandHandler) handleRefreshAgents(ctx context.Context, params json.RawMessage) (any, error) {
	// Trigger agent discovery
	return h.handleGetAgents(ctx, params)
}

// ==================== Session Handlers ====================

func (h *CommandHandler) handleCreateSession(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		AgentID string `json:"agentId"`
		Mode    string `json:"mode"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if strings.TrimSpace(req.AgentID) == "" {
		return nil, errValidation("agentId is required")
	}

	// Get ACP connection for the agent
	if h.server.connManager == nil {
		return nil, NewAPIError(CodeInternalError, "agent connections not available")
	}
	conn, ok := h.server.connManager.GetConnection(req.AgentID)
	if !ok {
		return nil, errNotConnected(fmt.Sprintf("agent %s is not connected", req.AgentID))
	}

	// Determine session mode
	var mode acp.SessionMode
	switch req.Mode {
	case "planning":
		mode = acp.ModePlanning
	case "editing", "code":
		mode = acp.ModeEditing
	case "reviewing", "review":
		mode = acp.ModeReviewing
	case "pair_driver":
		mode = acp.ModePairDriver
	case "pair_navigator":
		mode = acp.ModePairNav
	case "swarm":
		mode = acp.ModeSwarm
	default:
		mode = acp.ModeDefault
	}

	// Create session via ACP
	session, err := conn.CreateSession(ctx, mode)
	if err != nil {
		return nil, safeError("failed to create session", err)
	}

	// Store session -> agent mapping
	h.server.mu.Lock()
	if h.server.sessionToAgent == nil {
		h.server.sessionToAgent = make(map[string]string)
	}
	if len(h.server.sessionToAgent) >= maxSessions {
		h.server.mu.Unlock()
		return nil, errLimitExceeded(fmt.Sprintf("maximum number of sessions (%d) reached", maxSessions))
	}
	h.server.sessionToAgent[string(session.ID)] = req.AgentID
	h.server.mu.Unlock()

	return SessionInfo{
		ID:        string(session.ID),
		AgentID:   req.AgentID,
		Mode:      req.Mode,
		CreatedAt: time.Now().Format(time.RFC3339),
		UpdatedAt: time.Now().Format(time.RFC3339),
	}, nil
}

func (h *CommandHandler) handleSendMessage(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		SessionID string `json:"sessionId"`
		Message   string `json:"message"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if strings.TrimSpace(req.SessionID) == "" {
		return nil, errValidation("sessionId is required")
	}
	if len(req.Message) > 100*1024 {
		return nil, errValidation("message exceeds maximum size (100KB)")
	}

	// Look up which agent owns this session
	h.server.mu.RLock()
	agentID, ok := h.server.sessionToAgent[req.SessionID]
	h.server.mu.RUnlock()

	if !ok {
		return nil, errNotFound(fmt.Sprintf("session not found: %s", req.SessionID))
	}

	// Get the ACP connection for the agent
	if h.server.connManager == nil {
		return nil, NewAPIError(CodeInternalError, "agent connections not available")
	}
	conn, ok := h.server.connManager.GetConnection(agentID)
	if !ok {
		return nil, errNotConnected(fmt.Sprintf("agent %s is not connected", agentID))
	}

	// Create prompt
	prompt := acp.Prompt{
		{Type: "text", Text: req.Message},
	}

	// Send prompt via ACP
	result, err := conn.SendPrompt(ctx, acp.SessionID(req.SessionID), prompt)
	if err != nil {
		return nil, safeError("failed to send message", err)
	}

	return map[string]any{
		"sessionId":  req.SessionID,
		"stopReason": result.StopReason,
	}, nil
}

func (h *CommandHandler) handleCloseSession(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	// Input validation
	req.SessionID = strings.TrimSpace(req.SessionID)
	if req.SessionID == "" {
		return nil, errValidation("sessionId is required")
	}

	// Clean up session -> agent mapping
	h.server.mu.Lock()
	delete(h.server.sessionToAgent, req.SessionID)
	h.server.mu.Unlock()

	return map[string]string{"status": "closed"}, nil
}

// ==================== Permission Handlers ====================

// PermissionResponseRequest represents a permission response from UI
type PermissionResponseRequest struct {
	RequestID  string `json:"requestId"`
	Approved   bool   `json:"approved"`
	ResolvedBy string `json:"resolvedBy"`
	Reason     string `json:"reason,omitempty"`
}

func (h *CommandHandler) handlePermissionResponse(ctx context.Context, params json.RawMessage) (any, error) {
	var req PermissionResponseRequest
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if req.RequestID == "" {
		return nil, errValidation("requestId is required")
	}
	if req.ResolvedBy == "" {
		return nil, errValidation("resolvedBy is required")
	}

	// Get team manager and respond to permission request
	tm := h.server.TeamManager()
	if tm == nil {
		return nil, NewAPIError(CodeInternalError, "service unavailable")
	}

	pm := tm.PermissionManager()
	if pm == nil {
		return nil, NewAPIError(CodeInternalError, "service unavailable")
	}

	err := pm.RespondToRequest(req.RequestID, req.Approved, req.ResolvedBy, req.Reason)
	if err != nil {
		return nil, safeError("failed to respond to request", err)
	}

	return map[string]any{
		"requestId": req.RequestID,
		"status":    req.Approved,
	}, nil
}

// ==================== Swarm Handlers ====================

func (h *CommandHandler) handleGetSwarms(ctx context.Context, params json.RawMessage) (any, error) {
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

	return result, nil
}

type createSwarmRequest struct {
	Name     string   `json:"name"`
	Topology string   `json:"topology"`
	Strategy string   `json:"strategy"`
	AgentIDs []string `json:"agentIds"`
}

func (h *CommandHandler) handleCreateSwarm(ctx context.Context, params json.RawMessage) (any, error) {
	var req createSwarmRequest
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	// Validate input
	if strings.TrimSpace(req.Name) == "" {
		return nil, errValidation("name is required")
	}
	if len(req.Name) > maxNameLen {
		return nil, errValidation(fmt.Sprintf("name exceeds %d characters", maxNameLen))
	}

	cfg := swarm.SwarmConfig{
		ID:       "swarm_" + uuid.New().String()[:8],
		Name:     req.Name,
		Topology: swarm.TopologyType(req.Topology),
		Strategy: swarm.TaskStrategy(req.Strategy),
	}

	sw := swarm.NewSwarm(cfg)

	// Add agents
	registry := h.server.Registry()
	if registry != nil {
		for _, agentID := range req.AgentIDs {
			ag, ok := registry.Get(acp.AgentID(agentID))
			if ok {
				sw.AddAgent(ag)
			}
		}
	}

	h.server.AddSwarm(cfg.ID, sw)

	return SwarmInfo{
		ID:         cfg.ID,
		Name:       cfg.Name,
		Topology:   req.Topology,
		Strategy:   req.Strategy,
		Status:     "created",
		AgentCount: len(req.AgentIDs),
	}, nil
}

func (h *CommandHandler) handleStartSwarm(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("swarm id is required")
	}

	sw, ok := h.server.GetSwarm(req.ID)
	if !ok {
		return nil, errNotFound("swarm not found")
	}

	if err := sw.Start(ctx); err != nil {
		return nil, safeError("failed to start swarm", err)
	}

	return map[string]string{"status": "started"}, nil
}

func (h *CommandHandler) handleStopSwarm(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("swarm id is required")
	}

	sw, ok := h.server.GetSwarm(req.ID)
	if !ok {
		return nil, errNotFound("swarm not found")
	}

	if err := sw.Stop(); err != nil {
		return nil, safeError("failed to stop swarm", err)
	}
	return map[string]string{"status": "stopped"}, nil
}

func (h *CommandHandler) handleSubmitTask(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		SwarmID     string `json:"swarmId"`
		Title       string `json:"title"`
		Description string `json:"description"`
		Priority    string `json:"priority"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	// Validate input lengths
	if len(req.Title) > maxTitleLen {
		return nil, errValidation(fmt.Sprintf("title exceeds %d characters", maxTitleLen))
	}
	if len(req.Description) > maxDescLen {
		return nil, errValidation(fmt.Sprintf("description exceeds %d characters", maxDescLen))
	}

	sw, ok := h.server.GetSwarm(req.SwarmID)
	if !ok {
		return nil, errNotFound(fmt.Sprintf("swarm not found: %s", req.SwarmID))
	}

	taskID := "task_" + uuid.New().String()[:8]

	// Default priority
	priority := swarm.PriorityMedium
	if req.Priority != "" {
		priority = swarm.TaskPriority(req.Priority)
	}

	// Create and submit task
	task := &swarm.Task{
		ID:          taskID,
		Title:       req.Title,
		Description: req.Description,
		Priority:    priority,
		State:       swarm.TaskStatePending,
	}

	if err := sw.SubmitTask(ctx, task); err != nil {
		return nil, safeError("failed to submit task", err)
	}

	return TaskInfo{
		ID:          taskID,
		Title:       req.Title,
		Description: req.Description,
		Status:      "pending",
		Priority:    0, // Default priority
		CreatedAt:   time.Now().Format(time.RFC3339),
	}, nil
}

func (h *CommandHandler) handleGetSwarmTasks(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		SwarmID string `json:"swarmId"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.SwarmID = strings.TrimSpace(req.SwarmID)
	if req.SwarmID == "" {
		return nil, errValidation("swarmId is required")
	}

	sw, ok := h.server.GetSwarm(req.SwarmID)
	if !ok {
		return nil, errNotFound("swarm not found")
	}

	stats := sw.GetStats()
	return map[string]any{
		"pending":   stats.PendingTasks,
		"running":   stats.ExecutingAgents,
		"completed": stats.CompletedTasks,
	}, nil
}

// ==================== Team Handlers ====================

func (h *CommandHandler) handleGetTeams(ctx context.Context, params json.RawMessage) (any, error) {
	tm := h.server.TeamManager()
	if tm == nil {
		return []TeamInfo{}, nil
	}

	teams := tm.ListTeams()
	result := make([]TeamInfo, 0, len(teams))

	for _, t := range teams {
		snap := t.Snapshot()

		members := make([]MemberInfo, 0, len(snap.Members))
		for _, m := range snap.Members {
			online := false
			if h.server.connManager != nil {
				if conn, ok := h.server.connManager.GetConnection(m.ID); ok {
					online = conn.GetState() == acp.StateConnected
				}
			}
			members = append(members, MemberInfo{
				ID:     m.ID,
				Name:   m.Name,
				Role:   m.Role,
				Online: online,
			})
		}

		result = append(result, TeamInfo{
			ID:          snap.ID,
			Name:        snap.Name,
			Description: snap.Description,
			OwnerID:     snap.Owner,
			Members:     members,
			Agents:      snap.AgentIDs,
			CreatedAt:   snap.CreatedAt.Format(time.RFC3339),
		})
	}

	return result, nil
}

func (h *CommandHandler) handleCreateTeam(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Name        string `json:"name"`
		OwnerID     string `json:"ownerId"`
		Description string `json:"description"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	// Validate input lengths
	if len(req.Name) > maxNameLen {
		return nil, errValidation(fmt.Sprintf("name exceeds %d characters", maxNameLen))
	}
	if len(req.Description) > maxDescLen {
		return nil, errValidation(fmt.Sprintf("description exceeds %d characters", maxDescLen))
	}
	if req.Name == "" {
		return nil, errValidation("name is required")
	}
	if req.OwnerID == "" {
		return nil, errValidation("ownerId is required")
	}

	tm := h.server.TeamManager()
	if tm == nil {
		return nil, NewAPIError(CodeInternalError, "service unavailable")
	}

	t, err := tm.CreateTeam(req.Name, req.OwnerID)
	if err != nil {
		return nil, safeError("failed to create team", err)
	}

	return TeamInfo{
		ID:          t.ID,
		Name:        t.Name,
		Description: t.Description,
		OwnerID:     t.Owner,
		Members:     []MemberInfo{},
		Agents:      []string{},
		CreatedAt:   t.CreatedAt.Format(time.RFC3339),
	}, nil
}

func (h *CommandHandler) handleDeleteTeam(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	// Input validation
	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("team id is required")
	}
	if len(req.ID) > maxIDLen {
		return nil, errValidation("team id too long")
	}

	tm := h.server.TeamManager()
	if tm == nil {
		return nil, NewAPIError(CodeInternalError, "service unavailable")
	}

	tm.DeleteTeam(req.ID)

	return map[string]string{"status": "deleted"}, nil
}

func (h *CommandHandler) handleAddAgentToTeam(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		TeamID  string `json:"teamId"`
		AgentID string `json:"agentId"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	// Input validation
	if req.TeamID == "" {
		return nil, errValidation("team id is required")
	}
	if req.AgentID == "" {
		return nil, errValidation("agent id is required")
	}
	if len(req.TeamID) > maxIDLen || len(req.AgentID) > maxIDLen {
		return nil, errValidation("id too long")
	}

	tm := h.server.TeamManager()
	if tm == nil {
		return nil, NewAPIError(CodeInternalError, "service unavailable")
	}

	t, ok := tm.GetTeam(req.TeamID)
	if !ok {
		return nil, errNotFound("team not found")
	}

	registry := h.server.Registry()
	if registry == nil {
		return nil, NewAPIError(CodeInternalError, "service unavailable")
	}

	ag, ok := registry.Get(acp.AgentID(req.AgentID))
	if !ok {
		return nil, errNotFound("agent not found")
	}

	if err := t.AddAgent(ag); err != nil {
		return nil, safeError("failed to add agent to team", err)
	}

	return map[string]string{"status": "added"}, nil
}

func (h *CommandHandler) handleRemoveAgentFromTeam(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		TeamID  string `json:"teamId"`
		AgentID string `json:"agentId"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	// Input validation
	if req.TeamID == "" {
		return nil, errValidation("team id is required")
	}
	if req.AgentID == "" {
		return nil, errValidation("agent id is required")
	}
	if len(req.TeamID) > maxIDLen || len(req.AgentID) > maxIDLen {
		return nil, errValidation("id too long")
	}

	tm := h.server.TeamManager()
	if tm == nil {
		return nil, NewAPIError(CodeInternalError, "service unavailable")
	}

	t, ok := tm.GetTeam(req.TeamID)
	if !ok {
		return nil, errNotFound("team not found")
	}

	t.RemoveAgent(acp.AgentID(req.AgentID))

	return map[string]string{"status": "removed"}, nil
}

// ==================== MCP Handlers ====================

func (h *CommandHandler) handleGetMCPServers(ctx context.Context, params json.RawMessage) (any, error) {
	clients := h.server.ListMCPClients()
	result := make([]MCPServerInfo, 0, len(clients))

	for id := range clients {
		result = append(result, MCPServerInfo{
			ID:     id,
			Name:   id,
			Status: "connected",
		})
	}

	return result, nil
}

func (h *CommandHandler) handleStartMCPServer(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ServerID string `json:"serverId"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if strings.TrimSpace(req.ServerID) == "" {
		return nil, errValidation("serverId is required")
	}

	// Get MCP client
	client, ok := h.server.GetMCPClient(req.ServerID)
	if !ok {
		return nil, errNotFound("MCP server not found")
	}

	// Connect the client
	if err := client.Connect(ctx); err != nil {
		return nil, safeError("failed to connect MCP server", err)
	}

	return map[string]any{
		"id":     req.ServerID,
		"status": "connected",
	}, nil
}

func (h *CommandHandler) handleStopMCPServer(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ServerID string `json:"serverId"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if strings.TrimSpace(req.ServerID) == "" {
		return nil, errValidation("serverId is required")
	}

	client, ok := h.server.GetMCPClient(req.ServerID)
	if !ok {
		return nil, errNotFound("MCP server not found")
	}

	if err := client.Disconnect(); err != nil {
		return nil, safeError("failed to disconnect MCP server", err)
	}

	return map[string]any{
		"id":     req.ServerID,
		"status": "disconnected",
	}, nil
}

func (h *CommandHandler) handleCallMCPTool(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ServerID  string         `json:"serverId"`
		ToolName  string         `json:"toolName"`
		Arguments map[string]any `json:"arguments"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if strings.TrimSpace(req.ServerID) == "" {
		return nil, errValidation("serverId is required")
	}
	if strings.TrimSpace(req.ToolName) == "" {
		return nil, errValidation("toolName is required")
	}
	if len(req.Arguments) > 50 {
		return nil, errValidation("too many arguments (max 50 keys)")
	}

	client, ok := h.server.GetMCPClient(req.ServerID)
	if !ok {
		return nil, errNotFound("MCP server not found")
	}

	result, err := client.CallTool(ctx, req.ToolName, req.Arguments)
	if err != nil {
		return nil, safeError("failed to call MCP tool", err)
	}

	return result, nil
}

// ==================== Monitoring Handlers ====================

func (h *CommandHandler) handleGetSupervisorStats(ctx context.Context, params json.RawMessage) (any, error) {
	registry := h.server.Registry()
	if registry == nil {
		return SupervisorStats{}, nil
	}

	agents := registry.GetAll()
	stats := SupervisorStats{
		TotalAgents: len(agents),
	}

	for _, a := range agents {
		switch a.GetState() {
		case agent.StateIdle:
			stats.HealthyAgents++
		case agent.StateThinking, agent.StateExecuting:
			stats.HealthyAgents++
			stats.BusyAgents++
		case agent.StateError:
			stats.UnhealthyAgents++
		default:
			stats.DegradedAgents++
		}
	}

	return stats, nil
}

func (h *CommandHandler) handleGetEmergenceData(ctx context.Context, params json.RawMessage) (any, error) {
	// Use EmergenceService when available for real-time metrics
	if svc := h.server.EmergenceService(); svc != nil {
		return svc.GetData(), nil
	}

	// Fallback: compute inline from swarm data (no supervisor configured)
	swarms := h.server.ListSwarms()

	// Calculate health metrics from swarm data
	totalAgents := 0
	busyAgents := 0
	idleAgents := 0

	for _, sw := range swarms {
		stats := sw.GetStats()
		totalAgents += stats.AgentCount
		busyAgents += stats.ExecutingAgents
		idleAgents += stats.IdleAgents
	}

	// Calculate utilization
	utilization := 0.0
	if totalAgents > 0 {
		utilization = float64(busyAgents) / float64(totalAgents)
	}

	data := EmergenceData{
		Health: SwarmHealth{
			OverallScore:     0.85,
			CongestionLevel:  0.15,
			CollaborationIdx: 0.78,
			InnovationRate:   0.62,
			AgentUtilization: utilization,
		},
		Signals: []EmergentSignal{},
		Agents:  []AgentNode{},
		Flows:   []TaskFlow{},
	}

	// Build agent nodes from all swarms
	agentIndex := 0 // Track agent count separately for positioning
	for swarmID, sw := range swarms {
		stats := sw.GetStats()

		// Add coordinator node
		data.Agents = append(data.Agents, AgentNode{
			ID:   swarmID + "-coordinator",
			Name: "Coordinator",
			Type: "coordinator",
			Load: float64(stats.ExecutingAgents) / float64(stats.AgentCount+1),
			X:    0.5,
			Y:    0.5,
		})

		// Add agent nodes for each agent in the swarm
		for _, ag := range sw.GetAgents() {
			data.Agents = append(data.Agents, AgentNode{
				ID:   string(ag.ID),
				Name: ag.Name,
				Type: string(ag.Type),
				Load: 0.5, // Default load
				X:    0.3 + float64(agentIndex)*0.1,
				Y:    0.3 + float64(agentIndex)*0.1,
			})
			agentIndex++

			// Add flow from coordinator to agent
			data.Flows = append(data.Flows, TaskFlow{
				ID:        fmt.Sprintf("flow-%s-%s", swarmID, ag.ID),
				FromAgent: swarmID + "-coordinator",
				ToAgent:   string(ag.ID),
				TaskType:  "coordination",
				Status:    "active",
				StartedAt: time.Now().Format(time.RFC3339),
			})
		}
	}

	return data, nil
}

// ==================== File System Handlers ====================

func (h *CommandHandler) handleListDir(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	// Validate and clean path
	relPath := filepath.Clean(req.Path)
	if relPath == "" || relPath == "." {
		relPath = "."
	}

	// Security: Reject file operations if workspace path is not configured
	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	// Use workspace path if set
	path := filepath.Join(h.server.workspacePath, relPath)
	// Security: Verify resolved path is still within workspace
	// Use EvalSymlinks to resolve symlinks and prevent traversal via symlinks
	absPath, err := filepath.EvalSymlinks(path)
	if err != nil {
		return nil, errValidation("invalid path")
	}
	absWorkspace, err := filepath.EvalSymlinks(h.server.workspacePath)
	if err != nil {
		return nil, errNotConnected("invalid workspace configuration")
	}
	if !strings.HasPrefix(absPath, absWorkspace+string(filepath.Separator)) && absPath != absWorkspace {
		return nil, errValidation("access denied: path outside workspace")
	}

	// Read directory (use absPath to follow symlinks correctly)
	entries, err := os.ReadDir(absPath)
	if err != nil {
		return nil, safeError("failed to read directory", err)
	}

	// Build file entries
	var result []FileInfo
	for _, entry := range entries {
		// Use cleaned relative path (not raw req.Path) to prevent path traversal in metadata
		fullPath := filepath.Join(relPath, entry.Name())
		result = append(result, FileInfo{
			Name:        entry.Name(),
			Path:        fullPath,
			IsDirectory: entry.IsDir(),
		})
	}

	return result, nil
}

func (h *CommandHandler) handleReadFile(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	// Validate path
	if req.Path == "" {
		return nil, errValidation("path is required")
	}

	path := filepath.Clean(req.Path)

	// Security: Require workspace path to be set
	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	path = filepath.Join(h.server.workspacePath, path)
	// Security: Verify resolved path is still within workspace
	// Use EvalSymlinks to resolve symlinks and prevent traversal via symlinks
	absPath, err := filepath.EvalSymlinks(path)
	if err != nil {
		return nil, errValidation("invalid path")
	}
	absWorkspace, err := filepath.EvalSymlinks(h.server.workspacePath)
	if err != nil {
		return nil, errValidation("invalid workspace configuration")
	}
	if !strings.HasPrefix(absPath, absWorkspace+string(filepath.Separator)) && absPath != absWorkspace {
		return nil, errUnauthorized("access denied: path outside workspace")
	}

	// Check if file exists (use absPath to follow symlinks correctly)
	info, err := os.Stat(absPath)
	if err != nil {
		return nil, errNotFound("file")
	}

	if info.IsDir() {
		return nil, errValidation("path is a directory, not a file")
	}

	// Limit file size to prevent memory exhaustion
	const maxFileSize = 10 << 20 // 10 MB
	if info.Size() > maxFileSize {
		return nil, errValidation(fmt.Sprintf("file too large: %d bytes (max %d)", info.Size(), maxFileSize))
	}

	// Read file content (use absPath to follow symlinks correctly)
	content, err := os.ReadFile(absPath)
	if err != nil {
		return nil, safeError("failed to read file", err)
	}

	return map[string]string{"content": string(content)}, nil
}

func (h *CommandHandler) handleWriteFile(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	// Validate path
	if req.Path == "" {
		return nil, errValidation("path is required")
	}

	path := filepath.Clean(req.Path)

	// Security: Require workspace path to be set
	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	path = filepath.Join(h.server.workspacePath, path)
	// Security: Verify resolved path is still within workspace
	// Use EvalSymlinks to resolve symlinks and prevent traversal via symlinks
	// For writes, the file may not exist yet, so eval the parent directory
	absWorkspace, err := filepath.EvalSymlinks(h.server.workspacePath)
	if err != nil {
		return nil, errNotConnected("invalid workspace configuration")
	}
	// Eval parent dir to catch symlinks in intermediate path components
	parentDir := filepath.Dir(path)
	absParent, err := filepath.EvalSymlinks(parentDir)
	if err != nil {
		// Parent doesn't exist yet — fall back to Abs for validation,
		// but verify no ".." components in the cleaned path that could escape workspace
		absParent, err = filepath.Abs(parentDir)
		if err != nil {
			return nil, errValidation("invalid path")
		}
		// When EvalSymlinks fails, check that no path component is ".."
		// to prevent traversal via non-existent directories
		relPath, err := filepath.Rel(absWorkspace, absParent)
		if err != nil || strings.HasPrefix(relPath, "..") {
			return nil, errValidation("access denied: path outside workspace")
		}
	}
	if !strings.HasPrefix(absParent, absWorkspace+string(filepath.Separator)) && absParent != absWorkspace {
		return nil, errValidation("access denied: path outside workspace")
	}

	// Limit content size to prevent memory/disk exhaustion
	const maxWriteSize = 10 << 20 // 10 MB
	if len(req.Content) > maxWriteSize {
		return nil, errValidation("content too large")
	}

	// Ensure parent directory exists
	if err := os.MkdirAll(absParent, 0755); err != nil {
		return nil, safeError("failed to create directory", err)
	}

	// Write file atomically (temp file + rename) to prevent partial writes
	// and concurrent reads seeing corrupted data
	absPath := filepath.Join(absParent, filepath.Base(path))
	tmpFile, err := os.CreateTemp(absParent, ".swarm-write-*.tmp")
	if err != nil {
		return nil, safeError("failed to create temp file", err)
	}
	tmpPath := tmpFile.Name()
	if _, err := tmpFile.Write([]byte(req.Content)); err != nil {
		tmpFile.Close()
		os.Remove(tmpPath)
		return nil, safeError("failed to write temp file", err)
	}
	if err := tmpFile.Close(); err != nil {
		os.Remove(tmpPath)
		return nil, safeError("failed to close temp file", err)
	}
	// Rename is atomic on POSIX systems
	if err := os.Rename(tmpPath, absPath); err != nil {
		os.Remove(tmpPath)
		return nil, safeError("failed to rename file", err)
	}

	return map[string]string{"status": "written"}, nil
}

// ==================== Additional Agent Handlers ====================

func (h *CommandHandler) handleAddAgent(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Config acp.AgentConfig `json:"config"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	// Validate required fields
	if strings.TrimSpace(req.Config.ID) == "" {
		return nil, errValidation("agent id is required")
	}
	if strings.TrimSpace(req.Config.Name) == "" {
		return nil, errValidation("agent name is required")
	}
	if len(req.Config.ID) > maxIDLen {
		return nil, errValidation(fmt.Sprintf("agent id too long (max %d)", maxIDLen))
	}
	if len(req.Config.Name) > maxNameLen {
		return nil, errValidation(fmt.Sprintf("agent name too long (max %d)", maxNameLen))
	}

	// Load config, add agent, and save atomically
	h.server.configMu.Lock()
	defer h.server.configMu.Unlock()

	cfg, err := acp.LoadConfig("")
	if err != nil {
		return nil, safeError("failed to load config", err)
	}

	if err := cfg.AddAgent(&req.Config); err != nil {
		return nil, safeError("failed to add agent", err)
	}

	configPath := filepath.Join(acp.ConfigDir, acp.ConfigFile)
	if err := cfg.Save(configPath); err != nil {
		return nil, safeError("failed to save config", err)
	}

	return map[string]any{
		"id":          req.Config.ID,
		"name":        req.Config.Name,
		"type":        "acp",
		"state":       "idle",
		"status":      "idle",
		"command":     req.Config.Command,
		"description": req.Config.Description,
		"enabled":     req.Config.Enabled,
	}, nil
}

func (h *CommandHandler) handleUpdateAgent(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Config acp.AgentConfig `json:"config"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if strings.TrimSpace(req.Config.ID) == "" {
		return nil, errValidation("agent id is required")
	}

	// Load config, update agent, and save atomically
	h.server.configMu.Lock()
	defer h.server.configMu.Unlock()

	cfg, err := acp.LoadConfig("")
	if err != nil {
		return nil, safeError("failed to load config", err)
	}

	if err := cfg.UpdateAgent(&req.Config); err != nil {
		return nil, safeError("failed to update agent", err)
	}

	configPath := filepath.Join(acp.ConfigDir, acp.ConfigFile)
	if err := cfg.Save(configPath); err != nil {
		return nil, safeError("failed to save config", err)
	}

	return map[string]any{
		"id":          req.Config.ID,
		"name":        req.Config.Name,
		"type":        "acp",
		"state":       "idle",
		"status":      "idle",
		"command":     req.Config.Command,
		"description": req.Config.Description,
		"enabled":     req.Config.Enabled,
	}, nil
}

func (h *CommandHandler) handleDeleteAgent(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("agent id is required")
	}

	// Load config, delete agent, and save atomically
	h.server.configMu.Lock()
	defer h.server.configMu.Unlock()

	cfg, err := acp.LoadConfig("")
	if err != nil {
		return nil, safeError("failed to load config", err)
	}

	if err := cfg.RemoveAgent(req.ID); err != nil {
		return nil, safeError("failed to delete agent", err)
	}

	configPath := filepath.Join(acp.ConfigDir, acp.ConfigFile)
	if err := cfg.Save(configPath); err != nil {
		return nil, safeError("failed to save config", err)
	}

	return map[string]string{"id": req.ID, "status": "deleted"}, nil
}

func (h *CommandHandler) handleGetConfigPath(ctx context.Context, params json.RawMessage) (any, error) {
	return filepath.Join(acp.ConfigDir, acp.ConfigFile), nil
}

// ==================== Additional Swarm Handlers ====================

func (h *CommandHandler) handleGetSwarm(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("swarm id is required")
	}

	swarms := h.server.ListSwarms()
	s, ok := swarms[req.ID]
	if !ok {
		return nil, errNotFound("swarm not found")
	}

	stats := s.GetStats()
	return map[string]any{
		"id":           s.ID,
		"name":         s.Name,
		"topology":     string(s.Topology),
		"strategy":     string(s.Strategy),
		"status":       stats.State,
		"agentCount":   stats.AgentCount,
		"taskCount":    stats.PendingTasks + stats.CompletedTasks,
		"coordinatorId": "",
	}, nil
}

func (h *CommandHandler) handleDeleteSwarm(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("swarm id is required")
	}

	// Stop swarm before removing to prevent goroutine leak
	if sw, ok := h.server.GetSwarm(req.ID); ok {
		_ = sw.Stop() // best effort stop
	}
	h.server.RemoveSwarm(req.ID)

	return map[string]string{"id": req.ID, "status": "deleted"}, nil
}

func (h *CommandHandler) handleExecuteTask(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		SwarmID string `json:"swarmId"`
		TaskID  string `json:"taskId"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if strings.TrimSpace(req.SwarmID) == "" {
		return nil, errValidation("swarm id is required")
	}
	if strings.TrimSpace(req.TaskID) == "" {
		return nil, errValidation("task id is required")
	}

	swarms := h.server.ListSwarms()
	s, ok := swarms[req.SwarmID]
	if !ok {
		return nil, errNotFound(fmt.Sprintf("swarm %s not found", req.SwarmID))
	}

	task := s.GetTask(req.TaskID)
	if task == nil {
		return nil, errNotFound(fmt.Sprintf("task %s not found", req.TaskID))
	}

	result, err := s.ExecuteTask(ctx, task)
	if err != nil {
		return nil, safeError("task execution failed", err)
	}

	return map[string]any{
		"taskId":   req.TaskID,
		"status":   "completed",
		"output":   result.Content,
		"agentResults": map[string]any{
			result.AgentID: map[string]any{
				"agentId":    result.AgentID,
				"content":    result.Content,
				"success":    true,
				"durationMs": result.Duration.Milliseconds(),
			},
		},
	}, nil
}

// ==================== Additional MCP Handlers ====================

func (h *CommandHandler) handleAddMCPServer(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Config struct {
			Name    string            `json:"name"`
			Command string            `json:"command"`
			Args    []string          `json:"args"`
			Env     map[string]string `json:"env"`
		} `json:"config"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if strings.TrimSpace(req.Config.Name) == "" {
		return nil, errValidation("server name is required")
	}
	if strings.TrimSpace(req.Config.Command) == "" {
		return nil, errValidation("command is required")
	}

	// Load config, add MCP server, and save atomically
	h.server.configMu.Lock()
	defer h.server.configMu.Unlock()

	cfg, err := acp.LoadConfig("")
	if err != nil {
		return nil, safeError("failed to load config", err)
	}

	serverConfig := acp.MCPServerConfig{
		Name:    req.Config.Name,
		Command: req.Config.Command,
		Args:    req.Config.Args,
		Env:     req.Config.Env,
	}

	cfg.DefaultMCPSettings.CustomMCPServers = append(cfg.DefaultMCPSettings.CustomMCPServers, serverConfig)

	configPath := filepath.Join(acp.ConfigDir, acp.ConfigFile)
	if err := cfg.Save(configPath); err != nil {
		return nil, safeError("failed to save config", err)
	}

	return map[string]any{
		"id":     req.Config.Name,
		"name":   req.Config.Name,
		"status": "disconnected",
		"tools":  []any{},
	}, nil
}

func (h *CommandHandler) handleRemoveMCPServer(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ServerID string `json:"serverId"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if strings.TrimSpace(req.ServerID) == "" {
		return nil, errValidation("server id is required")
	}

	// Load config, remove MCP server, and save atomically
	h.server.configMu.Lock()
	defer h.server.configMu.Unlock()

	cfg, err := acp.LoadConfig("")
	if err != nil {
		return nil, safeError("failed to load config", err)
	}

	// Remove server from slice
	servers := cfg.DefaultMCPSettings.CustomMCPServers
	found := false
	for i, s := range servers {
		if s.Name == req.ServerID {
			cfg.DefaultMCPSettings.CustomMCPServers = append(servers[:i], servers[i+1:]...)
			found = true
			break
		}
	}
	if !found {
		return nil, errNotFound(fmt.Sprintf("MCP server %s not found", req.ServerID))
	}

	configPath := filepath.Join(acp.ConfigDir, acp.ConfigFile)
	if err := cfg.Save(configPath); err != nil {
		return nil, safeError("failed to save config", err)
	}

	return map[string]string{"id": req.ServerID, "status": "removed"}, nil
}

// ==================== Workflow Handlers ====================

func (h *CommandHandler) handleListWorkflows(ctx context.Context, params json.RawMessage) (any, error) {
	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	workflows := orch.ListWorkflows()
	result := make([]map[string]any, 0, len(workflows))
	for _, w := range workflows {
		result = append(result, workflowToMap(w))
	}
	return result, nil
}

func (h *CommandHandler) handleGetWorkflow(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("workflow id is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	w := orch.GetWorkflow(req.ID)
	if w == nil {
		return nil, errNotFound("workflow not found")
	}

	return workflowToMap(w), nil
}

func (h *CommandHandler) handleCreateWorkflow(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Mode        string `json:"mode"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if strings.TrimSpace(req.Name) == "" {
		return nil, errValidation("workflow name is required")
	}
	if len(req.Name) > maxNameLen {
		return nil, errValidation(fmt.Sprintf("name too long (max %d)", maxNameLen))
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	// Default to sequential mode
	mode := swarm.ModeSequential
	if req.Mode != "" {
		mode = swarm.OrchestrationMode(req.Mode)
	}

	w := orch.CreateWorkflow(req.Name, mode)
	w.SetDescription(req.Description)

	return map[string]any{
		"id":     w.ID,
		"name":   w.Name,
		"status": w.Status,
	}, nil
}

func (h *CommandHandler) handleUpdateWorkflow(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID       string                   `json:"id"`
		Workflow *map[string]any `json:"workflow"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("workflow id is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	w := orch.GetWorkflow(req.ID)
	if w == nil {
		return nil, errNotFound("workflow not found")
	}

	// Update workflow properties if provided
	if req.Workflow != nil {
		if name, ok := (*req.Workflow)["name"].(string); ok && name != "" {
			w.SetName(name)
		}
		if desc, ok := (*req.Workflow)["description"].(string); ok {
			w.SetDescription(desc)
		}
	}

	return workflowToMap(w), nil
}

func (h *CommandHandler) handleDeleteWorkflow(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("workflow id is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	w := orch.GetWorkflow(req.ID)
	if w == nil {
		return nil, errNotFound("workflow not found")
	}

	orch.DeleteWorkflow(req.ID)
	return map[string]string{"id": req.ID, "status": "deleted"}, nil
}

func (h *CommandHandler) handleExecuteWorkflow(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("workflow id is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	if err := orch.Execute(ctx, req.ID); err != nil {
		return nil, safeError("workflow execution failed", err)
	}

	return map[string]string{"id": req.ID, "status": "executing"}, nil
}

func (h *CommandHandler) handleGetWorkflowCheckpoints(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("workflow id is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	checkpoints := orch.GetCheckpoints(req.ID)
	result := make([]map[string]any, 0, len(checkpoints))
	for _, cp := range checkpoints {
		result = append(result, map[string]any{
			"id":          cp.ID,
			"workflowId":  cp.WorkflowID,
			"createdAt":   cp.CreatedAt.Format(time.RFC3339),
			"currentNode": cp.CurrentNode,
			"metadata":    cp.Metadata,
		})
	}
	return result, nil
}

func (h *CommandHandler) handleRestoreWorkflow(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID           string `json:"id"`
		CheckpointID string `json:"checkpointId"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("workflow id is required")
	}
	if strings.TrimSpace(req.CheckpointID) == "" {
		return nil, errValidation("checkpoint id is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	w, err := orch.RestoreFromCheckpoint(req.CheckpointID)
	if err != nil {
		return nil, safeError("failed to restore from checkpoint", err)
	}

	// Validate that the restored workflow matches the requested workflow ID
	// This prevents restoring a checkpoint from a different workflow
	if w.ID != req.ID {
		return nil, errValidation("checkpoint does not belong to the specified workflow")
	}

	return workflowToMap(w), nil
}

func (h *CommandHandler) handleGetWorkflowReport(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("workflow id is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	report := orch.GetExecutionReport(req.ID)
	if report == nil {
		return nil, errNotFound("no execution report for workflow")
	}

	return report, nil
}

func (h *CommandHandler) handleClearNodeCache(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		NodeID string `json:"nodeId"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if strings.TrimSpace(req.NodeID) == "" {
		return nil, errValidation("nodeId is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	orch.ClearNodeCache(req.NodeID)
	return map[string]string{"status": "ok"}, nil
}

func (h *CommandHandler) handleClearAllCaches(ctx context.Context, params json.RawMessage) (any, error) {
	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	orch.ClearAllCaches()
	return map[string]string{"status": "ok"}, nil
}

// ==================== Automation Handlers ====================

func (h *CommandHandler) handleListAutomations(ctx context.Context, params json.RawMessage) (any, error) {
	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}
	ae := orch.GetAutomationEngine()
	if ae == nil {
		return nil, errNotConnected("automation engine not configured")
	}

	automations := ae.ListAutomations()
	result := make([]map[string]any, 0, len(automations))
	for _, a := range automations {
		result = append(result, map[string]any{
			"id":          a.ID,
			"name":        a.Name,
			"description": a.Description,
			"trigger":     a.Trigger,
			"actions":     a.Actions,
			"enabled":     a.Enabled,
			"cooldown":    a.Cooldown.String(),
			"fireCount":   a.FireCount(),
			"lastFired":   a.LastFired(),
		})
	}
	return result, nil
}

func (h *CommandHandler) handleAddAutomation(ctx context.Context, params json.RawMessage) (any, error) {
	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}
	ae := orch.GetAutomationEngine()
	if ae == nil {
		return nil, errNotConnected("automation engine not configured")
	}

	var req struct {
		ID          string             `json:"id"`
		Name        string             `json:"name"`
		Description string             `json:"description"`
		Trigger     swarm.AutomationTrigger `json:"trigger"`
		Actions     []swarm.AutomationAction `json:"actions"`
		Enabled     bool               `json:"enabled"`
		Cooldown    string             `json:"cooldown"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if strings.TrimSpace(req.ID) == "" {
		return nil, errValidation("id is required")
	}

	a := &swarm.Automation{
		ID:          strings.TrimSpace(req.ID),
		Name:        req.Name,
		Description: req.Description,
		Trigger:     req.Trigger,
		Actions:     req.Actions,
		Enabled:     req.Enabled,
	}
	if req.Cooldown != "" {
		d, err := time.ParseDuration(req.Cooldown)
		if err != nil {
			return nil, safeError("invalid cooldown duration", err)
		}
		a.Cooldown = d
	}

	if err := ae.AddAutomation(a); err != nil {
		return nil, safeError("failed to add automation", err)
	}
	return map[string]string{"id": a.ID, "status": "added"}, nil
}

func (h *CommandHandler) handleRemoveAutomation(ctx context.Context, params json.RawMessage) (any, error) {
	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}
	ae := orch.GetAutomationEngine()
	if ae == nil {
		return nil, errNotConnected("automation engine not configured")
	}

	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if strings.TrimSpace(req.ID) == "" {
		return nil, errValidation("id is required")
	}

	if !ae.RemoveAutomation(strings.TrimSpace(req.ID)) {
		return nil, errNotFound("automation not found")
	}
	return map[string]string{"status": "removed"}, nil
}

func (h *CommandHandler) handleEnableAutomation(ctx context.Context, params json.RawMessage) (any, error) {
	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}
	ae := orch.GetAutomationEngine()
	if ae == nil {
		return nil, errNotConnected("automation engine not configured")
	}

	var req struct {
		ID      string `json:"id"`
		Enabled bool   `json:"enabled"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if strings.TrimSpace(req.ID) == "" {
		return nil, errValidation("id is required")
	}

	if !ae.EnableAutomation(strings.TrimSpace(req.ID), req.Enabled) {
		return nil, errNotFound("automation not found")
	}
	return map[string]string{"status": "updated"}, nil
}

// ==================== Artifact Handlers (Prefect 3 Artifacts) ====================

func (h *CommandHandler) handleListArtifacts(ctx context.Context, params json.RawMessage) (any, error) {
	orch := h.server.Orchestrator()
	if orch == nil {
		return []any{}, nil
	}
	var req struct {
		WorkflowID string `json:"workflowId"`
		NodeID     string `json:"nodeId,omitempty"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if strings.TrimSpace(req.WorkflowID) == "" {
		return nil, errValidation("workflowId is required")
	}
	store := orch.GetArtifactStore()
	if store == nil {
		return []any{}, nil
	}
	return store.ListByWorkflow(strings.TrimSpace(req.WorkflowID), req.NodeID), nil
}

func (h *CommandHandler) handleGetArtifact(ctx context.Context, params json.RawMessage) (any, error) {
	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}
	var req struct {
		ID         string `json:"id"`
		WorkflowID string `json:"workflowId"`
		Key        string `json:"key"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	store := orch.GetArtifactStore()
	if store == nil {
		return nil, errNotConnected("artifact store not configured")
	}
	if strings.TrimSpace(req.ID) != "" {
		artifact := store.GetByID(strings.TrimSpace(req.ID))
		if artifact == nil {
			return nil, errNotFound("artifact not found")
		}
		return artifact, nil
	}
	if strings.TrimSpace(req.WorkflowID) != "" && strings.TrimSpace(req.Key) != "" {
		artifact := store.Get(strings.TrimSpace(req.WorkflowID), strings.TrimSpace(req.Key))
		if artifact == nil {
			return nil, errNotFound("artifact not found")
		}
		return artifact, nil
	}
	return nil, errValidation("id or (workflowId + key) is required")
}

func (h *CommandHandler) handleCreateArtifact(ctx context.Context, params json.RawMessage) (any, error) {
	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}
	var req struct {
		ID          string            `json:"id,omitempty"`
		WorkflowID  string            `json:"workflowId"`
		NodeID      string            `json:"nodeId,omitempty"`
		Key         string            `json:"key"`
		Type        string            `json:"type,omitempty"`
		Data        any               `json:"data"`
		Description string            `json:"description,omitempty"`
		Metadata    map[string]string `json:"metadata,omitempty"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if strings.TrimSpace(req.WorkflowID) == "" {
		return nil, errValidation("workflowId is required")
	}
	if strings.TrimSpace(req.Key) == "" {
		return nil, errValidation("key is required")
	}
	store := orch.GetArtifactStore()
	if store == nil {
		return nil, errNotConnected("artifact store not configured")
	}
	artifact := &swarm.WorkflowArtifact{
		ID:          strings.TrimSpace(req.ID),
		WorkflowID:  strings.TrimSpace(req.WorkflowID),
		NodeID:      strings.TrimSpace(req.NodeID),
		Key:         strings.TrimSpace(req.Key),
		Type:        swarm.WorkflowArtifactType(req.Type),
		Data:        req.Data,
		Description: req.Description,
		Metadata:    req.Metadata,
	}
	result, err := store.CreateOrUpdate(artifact)
	if err != nil {
		return nil, safeError("failed to create artifact", err)
	}
	return map[string]string{"id": result.ID, "status": "created"}, nil
}

func (h *CommandHandler) handleDeleteArtifact(ctx context.Context, params json.RawMessage) (any, error) {
	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}
	var req struct {
		WorkflowID string `json:"workflowId"`
		Key        string `json:"key"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if strings.TrimSpace(req.WorkflowID) == "" {
		return nil, errValidation("workflowId is required")
	}
	if strings.TrimSpace(req.Key) == "" {
		return nil, errValidation("key is required")
	}
	store := orch.GetArtifactStore()
	if store == nil {
		return nil, errNotConnected("artifact store not configured")
	}
	store.Delete(strings.TrimSpace(req.WorkflowID), strings.TrimSpace(req.Key))
	return map[string]string{"status": "deleted"}, nil
}

func (h *CommandHandler) handleResumeWorkflow(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID    string `json:"id"`
		Input any    `json:"input"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("workflow id is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	w, err := orch.ResumeWorkflow(ctx, req.ID, req.Input)
	if err != nil {
		return nil, safeError("failed to resume workflow", err)
	}

	return workflowToMap(w), nil
}

func (h *CommandHandler) handleAddWorkflowNode(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID   string `json:"id"`
		Node struct {
			AgentID  string         `json:"agentId"`
			Name     string         `json:"name"`
			Type     string         `json:"type"`
			Position swarm.Position `json:"position"`
		} `json:"node"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if strings.TrimSpace(req.ID) == "" {
		return nil, errValidation("workflow id is required")
	}
	if strings.TrimSpace(req.Node.Name) == "" {
		return nil, errValidation("node name is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	w := orch.GetWorkflow(req.ID)
	if w == nil {
		return nil, errNotFound(fmt.Sprintf("workflow %s not found", req.ID))
	}

	node := &swarm.WorkflowNode{
		ID:       fmt.Sprintf("node_%s", uuid.New().String()[:8]),
		Name:     req.Node.Name,
		AgentID:  req.Node.AgentID,
		Type:     "agent", // Default to agent type
		Status:   swarm.TaskStatusPending,
		Position: req.Node.Position,
	}

	if req.Node.Type != "" {
		node.Type = req.Node.Type
	}

	w.AddNode(node)

	return map[string]any{
		"id":       node.ID,
		"name":     node.Name,
		"agentId":  node.AgentID,
		"type":     node.Type,
		"status":   string(node.Status),
		"position": node.Position,
	}, nil
}

func (h *CommandHandler) handleAddWorkflowEdge(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID   string `json:"id"`
		Edge struct {
			From      string `json:"from"`
			To        string `json:"to"`
			Condition string `json:"condition"`
			Label     string `json:"label"`
		} `json:"edge"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("workflow id is required")
	}
	req.Edge.From = strings.TrimSpace(req.Edge.From)
	if req.Edge.From == "" {
		return nil, errValidation("edge source node is required")
	}
	req.Edge.To = strings.TrimSpace(req.Edge.To)
	if req.Edge.To == "" {
		return nil, errValidation("edge target node is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	w := orch.GetWorkflow(req.ID)
	if w == nil {
		return nil, errNotFound("workflow not found")
	}

	edge := &swarm.WorkflowEdge{
		ID:        fmt.Sprintf("edge_%s", uuid.New().String()[:8]),
		From:      req.Edge.From,
		To:        req.Edge.To,
		Condition: req.Edge.Condition,
		Label:     req.Edge.Label,
	}

	if err := w.AddEdge(edge); err != nil {
		return nil, safeError("failed to add edge", err)
	}

	return map[string]any{
		"id":        edge.ID,
		"from":      edge.From,
		"to":        edge.To,
		"condition": edge.Condition,
		"label":     edge.Label,
	}, nil
}

// workflowToMap converts a workflow snapshot to a map for JSON serialization
func workflowToMap(w *swarm.Workflow) map[string]any {
	if w == nil {
		return nil
	}

	s := w.Snapshot()

	nodes := make([]map[string]any, 0, len(s.Nodes))
	for _, n := range s.Nodes {
		nodeMap := map[string]any{
			"id":       n.ID,
			"name":     n.Name,
			"agentId":  n.AgentID,
			"type":     n.Type,
			"status":   string(n.Status),
			"position": n.Position,
		}
		// Add optional fields only if they have values
		if n.SubgraphID != "" {
			nodeMap["subgraphId"] = n.SubgraphID
		}
		if n.Config != nil {
			nodeMap["config"] = n.Config
		}
		if n.Result != nil {
			nodeMap["result"] = n.Result
		}
		if n.StartedAt != nil {
			nodeMap["startedAt"] = n.StartedAt.Format(time.RFC3339Nano)
		}
		if n.CompletedAt != nil {
			nodeMap["completedAt"] = n.CompletedAt.Format(time.RFC3339Nano)
		}
		if len(n.DependsOn) > 0 {
			nodeMap["dependsOn"] = n.DependsOn
		}
		// Interrupt fields for human-in-the-loop workflows
		if n.Interrupt {
			nodeMap["interrupt"] = n.Interrupt
		}
		if n.InterruptBefore {
			nodeMap["interruptBefore"] = n.InterruptBefore
		}
		if n.InterruptAfter {
			nodeMap["interruptAfter"] = n.InterruptAfter
		}
		if n.ResumeInput != nil {
			nodeMap["resumeInput"] = n.ResumeInput
		}
		if len(n.InterruptActions) > 0 {
			nodeMap["interruptActions"] = n.InterruptActions
		}
		if n.ChosenAction != "" {
			nodeMap["chosenAction"] = n.ChosenAction
		}
		nodes = append(nodes, nodeMap)
	}

	edges := make([]map[string]any, 0, len(s.Edges))
	for _, e := range s.Edges {
		edges = append(edges, map[string]any{
			"id":        e.ID,
			"from":      e.From,
			"to":        e.To,
			"condition": e.Condition,
			"label":     e.Label,
		})
	}

	return map[string]any{
		"id":                s.ID,
		"name":              s.Name,
		"description":       s.Description,
		"mode":              string(s.Mode),
		"status":            s.Status,
		"nodes":             nodes,
		"edges":             edges,
		"createdAt":         s.CreatedAt.Format(time.RFC3339),
		"updatedAt":         s.UpdatedAt.Format(time.RFC3339),
		"interruptedNodeId": s.InterruptedNodeID,
		"interruptPhase":    s.InterruptPhase,
		"onComplete":        s.OnComplete,
	}
}

// safeError wraps an error for client responses without exposing internal details.
// It logs the full error internally and returns a generic APIError to the client.
func safeError(msg string, err error) error {
	// Log full error internally for debugging
	log.Printf("[API] internal error: %s: %v", msg, err)
	// Return APIError with internal error code
	return NewAPIError(CodeInternalError, msg)
}

// safeUnmarshalError returns a generic JSON parse error without exposing details.
func safeUnmarshalError(err error) error {
	log.Printf("[API] JSON unmarshal error: %v", err)
	return errValidation("invalid request format")
}

// ==================== Audit Log Handlers ====================

// handleListAuditEvents returns audit events with optional filtering
func (h *CommandHandler) handleListAuditEvents(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		EventType    string     `json:"eventType,omitempty"`
		Actor        string     `json:"actor,omitempty"`
		Action       string     `json:"action,omitempty"`
		ResourceType string     `json:"resourceType,omitempty"`
		ResourceID   string     `json:"resourceId,omitempty"`
		Success      *bool      `json:"success,omitempty"`
		StartTime    *time.Time `json:"startTime,omitempty"`
		EndTime      *time.Time `json:"endTime,omitempty"`
		Limit        int        `json:"limit,omitempty"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	logger := orch.GetAuditLogger()
	if logger == nil {
		return []audit.Event{}, nil
	}

	filter := &audit.Filter{
		EventType:    req.EventType,
		Actor:        req.Actor,
		Action:       req.Action,
		ResourceType: req.ResourceType,
		ResourceID:   req.ResourceID,
		Success:      req.Success,
		Limit:        req.Limit,
	}
	if req.StartTime != nil {
		filter.StartTime = *req.StartTime
	}
	if req.EndTime != nil {
		filter.EndTime = *req.EndTime
	}

	events := logger.GetEvents(filter)
	return events, nil
}

// handleGetAuditStats returns audit log statistics
func (h *CommandHandler) handleGetAuditStats(ctx context.Context, params json.RawMessage) (any, error) {
	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	logger := orch.GetAuditLogger()
	if logger == nil {
		return map[string]any{"count": 0, "enabled": false}, nil
	}

	return map[string]any{
		"count":   logger.GetEventCount(),
		"enabled": logger.IsEnabled(),
	}, nil
}

// handleClearAuditLog clears the in-memory audit log
// WARNING: This is a destructive operation. Requires confirm=true parameter.
func (h *CommandHandler) handleClearAuditLog(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Confirm bool `json:"confirm"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	// Require explicit confirmation to prevent accidental clears
	if !req.Confirm {
		return nil, errValidation("clear_audit_log requires confirm=true parameter")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	logger := orch.GetAuditLogger()
	if logger == nil {
		return map[string]any{"success": true}, nil
	}

	// Log the clear action to the audit log itself before clearing (preserves trace)
	count := logger.GetEventCount()
	logger.Log("audit.cleared", "system", "clear_audit_log", "audit_log", "", map[string]any{"clearedCount": count}, true, "")
	log.Printf("[Handler] AUDIT LOG CLEARED: %d events removed", count)

	logger.Clear()
	return map[string]any{"success": true, "clearedCount": count}, nil
}

// ==================== Workflow Variable Handlers ====================

// handleListVariables returns all variables for a workflow
func (h *CommandHandler) handleListVariables(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		WorkflowID string `json:"workflowId"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if strings.TrimSpace(req.WorkflowID) == "" {
		return nil, errValidation("workflowId is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	store := orch.GetVariableStore()
	if store == nil {
		return []swarm.WorkflowVariable{}, nil
	}

	return store.ListVariables(req.WorkflowID), nil
}

// handleAddVariable adds a variable to a workflow
func (h *CommandHandler) handleAddVariable(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		WorkflowID  string `json:"workflowId"`
		Name        string `json:"name"`
		Key         string `json:"key"`
		Type        string `json:"type"`
		Value       any    `json:"value,omitempty"`
		Default     any    `json:"default,omitempty"`
		Description string `json:"description,omitempty"`
		Required    bool   `json:"required"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if strings.TrimSpace(req.WorkflowID) == "" {
		return nil, errValidation("workflowId is required")
	}
	if strings.TrimSpace(req.Key) == "" {
		return nil, errValidation("variable key is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	store := orch.GetVariableStore()
	if store == nil {
		return nil, errNotConnected("variable store not configured")
	}

	v := &swarm.WorkflowVariable{
		ID:          fmt.Sprintf("var-%s", uuid.New().String()[:8]),
		Name:        req.Name,
		Key:         strings.TrimSpace(req.Key),
		Type:        swarm.WorkflowVariableType(req.Type),
		Value:       req.Value,
		Default:     req.Default,
		Description: req.Description,
		Required:    req.Required,
	}
	if err := store.AddVariable(req.WorkflowID, v); err != nil {
		return nil, safeError("failed to add variable", err)
	}

	return map[string]string{"id": v.ID, "key": v.Key}, nil
}

// handleRemoveVariable removes a variable from a workflow
func (h *CommandHandler) handleRemoveVariable(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		WorkflowID  string `json:"workflowId"`
		VariableID string `json:"variableId"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if strings.TrimSpace(req.WorkflowID) == "" {
		return nil, errValidation("workflowId is required")
	}
	if strings.TrimSpace(req.VariableID) == "" {
		return nil, errValidation("variableId is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	store := orch.GetVariableStore()
	if store == nil {
		return nil, errNotConnected("variable store not configured")
	}

	store.RemoveVariable(req.WorkflowID, req.VariableID)
	return map[string]string{"status": "removed"}, nil
}

// handleSetVariableValue sets a variable's value
func (h *CommandHandler) handleSetVariableValue(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		WorkflowID string `json:"workflowId"`
		Key        string `json:"key"`
		Value      any    `json:"value"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if strings.TrimSpace(req.WorkflowID) == "" {
		return nil, errValidation("workflowId is required")
	}
	if strings.TrimSpace(req.Key) == "" {
		return nil, errValidation("variable key is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	store := orch.GetVariableStore()
	if store == nil {
		return nil, errNotConnected("variable store not configured")
	}

	if err := store.SetVariableValue(req.WorkflowID, req.Key, req.Value); err != nil {
		return nil, safeError("failed to set variable value", err)
	}

	return map[string]string{"status": "updated"}, nil
}

// handleResolveVariables resolves {{variable.key}} templates in a string
func (h *CommandHandler) handleResolveVariables(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		WorkflowID string `json:"workflowId"`
		Template   string `json:"template"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if strings.TrimSpace(req.WorkflowID) == "" {
		return nil, errValidation("workflowId is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	store := orch.GetVariableStore()
	if store == nil {
		return nil, errNotConnected("variable store not configured")
	}

	result, err := store.ResolveVariables(req.WorkflowID, req.Template)
	if err != nil {
		return nil, safeError("failed to resolve variables", err)
	}

	return map[string]string{"result": result}, nil
}

// ==================== Schedule Runner Handlers ====================

// handleStartScheduleRunner starts the cron-based schedule runner.
func (h *CommandHandler) handleStartScheduleRunner(ctx context.Context, params json.RawMessage) (any, error) {
	runner := h.server.ScheduleRunner()
	if runner == nil {
		return nil, errNotConnected("schedule runner not configured")
	}
	if err := runner.Start(); err != nil {
		return nil, safeError("failed to start schedule runner", err)
	}
	return runner.StatusSnapshot(), nil
}

// handleStopScheduleRunner stops the cron-based schedule runner.
func (h *CommandHandler) handleStopScheduleRunner(ctx context.Context, params json.RawMessage) (any, error) {
	runner := h.server.ScheduleRunner()
	if runner == nil {
		return nil, errNotConnected("schedule runner not configured")
	}
	if err := runner.Stop(); err != nil {
		return nil, safeError("failed to stop schedule runner", err)
	}
	return runner.StatusSnapshot(), nil
}

// handleGetScheduleRunnerStatus returns the schedule runner's full status snapshot.
func (h *CommandHandler) handleGetScheduleRunnerStatus(ctx context.Context, params json.RawMessage) (any, error) {
	runner := h.server.ScheduleRunner()
	if runner == nil {
		return nil, errNotConnected("schedule runner not configured")
	}
	return runner.StatusSnapshot(), nil
}
