package api

import (
"context"
"encoding/json"
"fmt"
"path/filepath"
"strings"
"github.com/swarm-editor/swarm-editor/internal/acp"
"github.com/swarm-editor/swarm-editor/internal/agent"
)

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

