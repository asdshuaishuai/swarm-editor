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
	result := make([]AgentInfo, 0)
	seen := make(map[string]bool)

	// Load config for command/description/enabled fields
	configAgents := make(map[string]*acp.AgentConfig)
	if cfg, err := acp.LoadConfig(""); err == nil {
		for _, a := range cfg.Agents {
			configAgents[a.ID] = a
		}
	}

	// Add internal agents from registry
	if registry := h.server.Registry(); registry != nil {
		for _, a := range registry.GetAll() {
			id := string(a.ID)
			info := AgentInfo{
				ID:    id,
				Name:  a.Name,
				Type:  string(a.Type),
				State: string(a.GetState()),
			}
			if cfg, ok := configAgents[id]; ok {
				info.Command = cfg.Command
				info.Description = cfg.Description
				info.Enabled = &cfg.Enabled
			}
			result = append(result, info)
			seen[id] = true
		}
	}

	// Add external agents from connection manager
	if cm := h.server.ConnManager(); cm != nil {
		for _, conn := range cm.GetConnected() {
			if seen[conn.ID] {
				continue
			}
			name := ""
			var cfg *acp.AgentConfig
			if conn.Config != nil {
				name = conn.Config.Name
			}
			if c, ok := configAgents[conn.ID]; ok {
				cfg = c
			}
			info := AgentInfo{
				ID:    conn.ID,
				Name:  name,
				Type:  AgentTypeExternal,
				State: AgentStateConnected,
			}
			if cfg != nil {
				info.Command = cfg.Command
				info.Description = cfg.Description
				info.Enabled = &cfg.Enabled
			}
			result = append(result, info)
			seen[conn.ID] = true
		}
	}

	// Add scanned CLI agents
	if scanner := h.server.Scanner(); scanner != nil {
		for _, cli := range scanner.GetAgents() {
			if seen[cli.ID] {
				continue
			}
			state := AgentStateAvailable
			if cli.Status == agent.AgentStatusRunning {
				state = AgentStateRunning
			}
			info := AgentInfo{
				ID:           cli.ID,
				Name:         cli.Name,
				Type:         AgentTypeCLI,
				State:        state,
				Command:      cli.Path,
				Capabilities: cli.Capabilities,
			}
			if cfg, ok := configAgents[cli.ID]; ok {
				info.Command = cfg.Command
				info.Description = cfg.Description
				info.Enabled = &cfg.Enabled
			}
			result = append(result, info)
			seen[cli.ID] = true
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

	// Check registry first
	registry := h.server.Registry()
	if registry != nil {
		if ag, ok := registry.Get(acp.AgentID(req.ID)); ok {
			var connWarning string
			if connMgr := h.server.ConnManager(); connMgr != nil {
				if _, err := connMgr.Connect(ctx, req.ID); err != nil {
					connWarning = fmt.Sprintf("ACP connection failed: %v", err)
				}
			}
			ag.SetState(agent.StateIdle)
			result := map[string]string{"status": StatusStarted}
			if connWarning != "" {
				result["warning"] = connWarning
			}
			return result, nil
		}
	}

	// CLI agent path: connect via ACP using scanned agent info
	scanner := h.server.Scanner()
	if scanner != nil {
		for _, cli := range scanner.GetAgents() {
			if cli.ID == req.ID {
				var connWarning string
				if connMgr := h.server.ConnManager(); connMgr != nil {
					if _, err := connMgr.Connect(ctx, req.ID); err != nil {
						connWarning = fmt.Sprintf("ACP connection failed: %v", err)
						return map[string]string{"status": StatusError, "warning": connWarning}, nil
					}
				}
				result := map[string]string{"status": StatusStarted}
				if connWarning != "" {
					result["warning"] = connWarning
				}
				return result, nil
			}
		}
	}

	return nil, errNotFound("agent not found")
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

	// Disconnect ACP connection if exists (works for both registry and CLI agents)
	if connMgr := h.server.ConnManager(); connMgr != nil {
		_ = connMgr.Disconnect(req.ID) // best effort
	}

	// Update registry agent state if present
	if registry := h.server.Registry(); registry != nil {
		if ag, ok := registry.Get(acp.AgentID(req.ID)); ok {
			ag.SetState(agent.StateIdle)
		}
	}

	return map[string]string{"status": StatusStopped}, nil
}

func (h *CommandHandler) handleRefreshAgents(ctx context.Context, params json.RawMessage) (any, error) {
	// Trigger CLI agent scan
	scanner := h.server.Scanner()
	if scanner != nil {
		scanned, err := scanner.Scan(ctx)
		if err != nil {
			apiLog.Warn("agent scan failed", "error", err)
		} else {
			apiLog.Info("agent scan completed", "count", len(scanned))
		}
	}

	// Return merged list (registry + external connections)
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
	if strings.TrimSpace(req.Config.Command) == "" {
		return nil, errValidation("agent command is required")
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

	return map[string]string{"id": req.ID, "status": StatusDeleted}, nil
}

func (h *CommandHandler) handleGetConfigPath(ctx context.Context, params json.RawMessage) (any, error) {
	return filepath.Join(acp.ConfigDir, acp.ConfigFile), nil
}

func (h *CommandHandler) handleScanSkills(ctx context.Context, params json.RawMessage) (any, error) {
	scanner := h.server.Scanner()
	skillScanner := agent.NewSkillScanner()

	// Set workspace dir for project-local skill scanning
	if h.server.workspacePath != "" {
		skillScanner.SetWorkspaceDir(h.server.workspacePath)
	}

	var skills []agent.SkillInfo
	var err error

	if scanner != nil {
		// Ensure agent scan has been done
		if len(scanner.GetAgents()) == 0 {
			scanner.Scan(ctx)
		}
		skills, err = skillScanner.ScanWithAgents(scanner.GetAgents())

		// Also discover MCP-based skills with tool introspection
		if err == nil {
			discovery := agent.NewMCPDiscovery(scanner)
			if mcpServers, mcpErr := discovery.DiscoverAll(); mcpErr == nil && len(mcpServers) > 0 {
				// Collect tools from connected MCP servers
				serverTools := make(map[string][]agent.MCPTool)
				for _, srv := range mcpServers {
					if client, ok := h.server.GetMCPClient(srv.Name); ok {
						tools := client.ListTools()
						mcpTools := make([]agent.MCPTool, 0, len(tools))
						for _, t := range tools {
							mcpTools = append(mcpTools, agent.MCPTool{
								Name:        t.Name,
								Description: t.Description,
							})
						}
						if len(mcpTools) > 0 {
							serverTools[srv.Name] = mcpTools
						}
					}
				}

				mcpSkills, mcpErr := skillScanner.ScanWithMCPTools(mcpServers, serverTools)
				if mcpErr == nil {
					// Merge MCP skills, avoiding duplicates
					seen := make(map[string]bool)
					for _, s := range skills {
						seen[s.ID] = true
					}
					for _, s := range mcpSkills {
						if !seen[s.ID] {
							skills = append(skills, s)
						}
					}
				}
			}
		}
	} else {
		skills, err = skillScanner.Scan()
	}

	if err != nil {
		return nil, safeError("skill scan failed", err)
	}

	// Convert to response format
	result := make([]map[string]any, 0, len(skills))
	for _, s := range skills {
		result = append(result, map[string]any{
			"id":          s.ID,
			"name":        s.Name,
			"description": s.Description,
			"source":      string(s.Source),
			"path":        s.Path,
			"agentId":     s.AgentID,
			"tags":        s.Tags,
		})
	}

	return result, nil
}

func (h *CommandHandler) handleExecuteCode(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		FilePath string `json:"filePath"`
		Content  string `json:"content"`
		Language string `json:"language"`
		AgentID  string `json:"agentId"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if strings.TrimSpace(req.Content) == "" {
		return nil, errValidation("content is required")
	}

	// Find an available agent for code execution
	agentID := strings.TrimSpace(req.AgentID)
	if agentID == "" {
		if cm := h.server.ConnManager(); cm != nil {
			connections := cm.GetConnected()
			if len(connections) > 0 {
				agentID = connections[0].ID
			}
		}
	}

	if agentID == "" {
		return map[string]any{
			"success": false,
			"output":  "",
			"error":   "No agent available for code execution. Please connect an agent first.",
		}, nil
	}

	connMgr := h.server.ConnManager()
	if connMgr == nil {
		return map[string]any{
			"success": false,
			"output":  "",
			"error":   "Agent connection manager not available",
		}, nil
	}

	conn, ok := connMgr.GetConnection(agentID)
	if !ok {
		return map[string]any{
			"success": false,
			"output":  "",
			"error":   fmt.Sprintf("Agent %s is not connected", agentID),
		}, nil
	}

	// Create a session for code execution
	session, err := conn.CreateSession(ctx, acp.ModeDefault)
	if err != nil {
		return map[string]any{
			"success": false,
			"output":  "",
			"error":   fmt.Sprintf("Failed to create session: %v", err),
		}, nil
	}

	// Register session
	sessionID := string(session.ID)
	h.server.mu.Lock()
	if h.server.sessionToAgent == nil {
		h.server.sessionToAgent = make(map[string]string)
	}
	h.server.sessionToAgent[sessionID] = agentID
	h.server.mu.Unlock()

	// Build execution prompt
	fileName := req.FilePath
	if idx := strings.LastIndex(fileName, "/"); idx >= 0 {
		fileName = fileName[idx+1:]
	}
	promptText := fmt.Sprintf("Execute the following %s code from %s:\n\n```%s\n%s\n```\n\nRun this code and report the output.", req.Language, fileName, req.Language, req.Content)

	prompt := acp.Prompt{
		{Type: "text", Text: promptText},
	}

	result, err := conn.SendPrompt(ctx, session.ID, prompt)

	// Clean up session
	h.server.mu.Lock()
	delete(h.server.sessionToAgent, sessionID)
	h.server.mu.Unlock()
	conn.CloseSession(ctx, session.ID)

	if err != nil {
		return map[string]any{
			"success": false,
			"output":  "",
			"error":   fmt.Sprintf("Execution failed: %v", err),
		}, nil
	}

	return map[string]any{
		"success": result.StopReason == acp.StopEndTurn,
		"output":  result.Content,
		"error":   "",
	}, nil
}

func (h *CommandHandler) handleTestAgent(ctx context.Context, params json.RawMessage) (any, error) {
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

	scanner := h.server.Scanner()
	if scanner == nil {
		return nil, NewAPIError(CodeInternalError, "scanner not available")
	}

	status := scanner.CheckStatus(ctx, req.ID)

	return map[string]any{
		"id":     req.ID,
		"status": string(status),
	}, nil
}

func (h *CommandHandler) handleGetProcessMetrics(ctx context.Context, params json.RawMessage) (any, error) {
	connMgr := h.server.ConnManager()
	if connMgr == nil {
		return []map[string]any{}, nil
	}

	results := make([]map[string]any, 0)
	for _, conn := range connMgr.ListConnections() {
		m := conn.CollectMetrics()
		results = append(results, map[string]any{
			"agentId":     conn.ID,
			"pid":         m.PID,
			"cpuPercent":  m.CPU,
			"rssBytes":    m.RSS,
			"collectedAt": m.Collected,
		})
	}

	return results, nil
}
