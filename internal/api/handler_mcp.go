package api

import (
"context"
"encoding/json"
"fmt"
"path/filepath"
"strings"
"github.com/swarm-editor/swarm-editor/internal/acp"
"github.com/swarm-editor/swarm-editor/internal/agent"
"github.com/swarm-editor/swarm-editor/internal/mcp"
)

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

	// Disconnect first, then remove from registry
	if err := client.Disconnect(); err != nil {
		h.server.RemoveMCPClient(req.ServerID)
		return nil, safeError("failed to disconnect MCP server", err)
	}

	// Remove from registry after successful disconnect
	h.server.RemoveMCPClient(req.ServerID)

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

	// Register runtime MCP client so it's immediately usable
	client := mcp.NewClient(&mcp.ClientConfig{
		Name:    req.Config.Name,
		Command: req.Config.Command,
		Args:    req.Config.Args,
		Env:     req.Config.Env,
	})
	h.server.AddMCPClient(req.Config.Name, client)

	// Try to connect (non-fatal if it fails — server config is saved)
	var connectStatus string
	if err := client.Connect(ctx); err != nil {
		connectStatus = "disconnected"
		apiLog.Warn("MCP server saved but connect failed", "name", req.Config.Name, "error", err)
	} else {
		connectStatus = "connected"
	}

	return map[string]any{
		"id":     req.Config.Name,
		"name":   req.Config.Name,
		"status": connectStatus,
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

func (h *CommandHandler) handleScanMCPServers(ctx context.Context, params json.RawMessage) (any, error) {
	scanner := h.server.Scanner()
	if scanner == nil {
		return []MCPServerInfo{}, nil
	}

	// Ensure scanner has results
	if len(scanner.GetAgents()) == 0 {
		if _, err := scanner.Scan(ctx); err != nil {
			return nil, safeError("agent scan failed", err)
		}
	}

	discovery := agent.NewMCPDiscovery(scanner)
	discovered, err := discovery.DiscoverAll()
	if err != nil {
		return nil, safeError("MCP discovery failed", err)
	}

	result := make([]MCPServerInfo, 0, len(discovered))
	for _, s := range discovered {
		result = append(result, MCPServerInfo{
			ID:       s.Name,
			Name:     s.Name,
			Type:     s.Type,
			Command:  s.Command,
			Args:     s.Args,
			URL:      s.URL,
			Headers:  s.Headers,
			Env:      s.Env,
			Disabled: s.Disabled,
			Source:   s.Source,
			Status:   "discovered",
		})
	}

	return result, nil
}

func (h *CommandHandler) handleListMCPTools(ctx context.Context, params json.RawMessage) (any, error) {
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

	tools := client.ListTools()
	result := make([]map[string]any, 0, len(tools))
	for _, t := range tools {
		result = append(result, map[string]any{
			"name":        t.Name,
			"description": t.Description,
			"inputSchema": t.InputSchema,
		})
	}

	return result, nil
}

