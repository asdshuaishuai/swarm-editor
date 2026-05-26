package api

import (
"context"
"encoding/json"
"fmt"
"os"
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
				if conn, err := connMgr.Connect(ctx, req.ID); err != nil {
					connWarning = fmt.Sprintf("ACP connection failed: %v", err)
				} else {
					h.wireAgentLogStream(conn)
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
					if conn, err := connMgr.Connect(ctx, req.ID); err != nil {
						connWarning = fmt.Sprintf("ACP connection failed: %v", err)
						return map[string]string{"status": StatusError, "warning": connWarning}, nil
					} else {
						h.wireAgentLogStream(conn)
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

func (h *CommandHandler) handleGetAgentLogs(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		AgentID string `json:"agentId"`
		Count   int    `json:"count"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.AgentID = strings.TrimSpace(req.AgentID)
	if req.AgentID == "" {
		return nil, errValidation("agentId is required")
	}
	if req.Count <= 0 {
		req.Count = 100
	}

	connMgr := h.server.ConnManager()
	if connMgr == nil {
		return []acp.LogEntry{}, nil
	}

	conn, ok := connMgr.GetConnection(req.AgentID)
	if !ok {
		return nil, errNotFound("agent not connected")
	}

	return conn.RecentLogs(req.Count), nil
}

// ==================== Shadow Buffer Handlers ====================

func (h *CommandHandler) handleStagePatch(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		AgentID    string `json:"agentId"`
		Path       string `json:"path"`
		OldContent string `json:"oldContent"`
		NewContent string `json:"newContent"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if strings.TrimSpace(req.AgentID) == "" {
		return nil, errValidation("agentId is required")
	}
	if strings.TrimSpace(req.Path) == "" {
		return nil, errValidation("path is required")
	}

	sb := h.server.ShadowBuffer()
	if sb == nil {
		return nil, NewAPIError(CodeInternalError, "shadow buffer not available")
	}

	id := sb.Stage(req.AgentID, req.Path, req.OldContent, req.NewContent)
	patch, _ := sb.Get(id)
	return map[string]any{
		"id":        id,
		"agentId":   patch.AgentID,
		"path":      patch.Path,
		"createdAt": patch.CreatedAt,
	}, nil
}

func (h *CommandHandler) handleListPatches(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		AgentID string `json:"agentId"`
	}
	_ = json.Unmarshal(params, &req)

	sb := h.server.ShadowBuffer()
	if sb == nil {
		return []PendingPatch{}, nil
	}

	return sb.List(req.AgentID), nil
}

func (h *CommandHandler) handleCommitPatch(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if strings.TrimSpace(req.ID) == "" {
		return nil, errValidation("id is required")
	}

	sb := h.server.ShadowBuffer()
	if sb == nil {
		return nil, NewAPIError(CodeInternalError, "shadow buffer not available")
	}

	patch, ok := sb.Get(req.ID)
	if !ok {
		return nil, errNotFound("patch not found")
	}

	// Write new content to disk
	if h.server.WorkspacePath() != "" && patch.NewContent != "" {
		fullPath := filepath.Join(h.server.WorkspacePath(), patch.Path)
		if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
			return nil, NewAPIError(CodeInternalError, "failed to create directory: "+err.Error())
		}
		if err := os.WriteFile(fullPath, []byte(patch.NewContent), 0644); err != nil {
			return nil, NewAPIError(CodeInternalError, "failed to write file: "+err.Error())
		}
	}

	// Remove from buffer after successful write
	sb.Commit(req.ID)

	// Trigger verification
	result := h.verifyAndBroadcast(ctx, patch)

	return map[string]any{
		"id":           req.ID,
		"status":       "committed",
		"verifyState":  string(result.State),
		"verifyErrors": result.Errors,
	}, nil
}

func (h *CommandHandler) handleRejectPatch(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if strings.TrimSpace(req.ID) == "" {
		return nil, errValidation("id is required")
	}

	sb := h.server.ShadowBuffer()
	if sb == nil {
		return nil, NewAPIError(CodeInternalError, "shadow buffer not available")
	}

	if !sb.Reject(req.ID) {
		return nil, errNotFound("patch not found")
	}
	return map[string]string{"id": req.ID, "status": "rejected"}, nil
}

const maxVerifyRetries = 3

func (h *CommandHandler) verifyAndBroadcast(ctx context.Context, patch *PendingPatch) VerifyResult {
	hub := h.server.Hub()
	verifier := h.server.Verifier()
	if hub == nil || verifier == nil {
		return VerifyResult{State: VerifyPassed}
	}

	hub.Broadcast("verification_started", map[string]any{
		"patchId": patch.ID,
		"agentId": patch.AgentID,
		"path":    patch.Path,
	})

	result := verifier.Verify(ctx, patch.Path)

	if result.State == VerifyPassed {
		hub.Broadcast("verification_passed", map[string]any{
			"patchId": patch.ID,
			"agentId": patch.AgentID,
			"path":    patch.Path,
		})
		return result
	}

	patch.RetryCount++
	hub.Broadcast("verification_failed", map[string]any{
		"patchId":    patch.ID,
		"agentId":    patch.AgentID,
		"path":       patch.Path,
		"errors":     result.Errors,
		"retryCount": patch.RetryCount,
	})

	if patch.RetryCount >= maxVerifyRetries {
		hub.Broadcast("verification_escalated", map[string]any{
			"patchId":    patch.ID,
			"agentId":    patch.AgentID,
			"path":       patch.Path,
			"errors":     result.Errors,
			"retryCount": patch.RetryCount,
			"reason":     "max retries exceeded, requiring human intervention",
		})
		return result
	}

	h.sendVerifyFeedback(ctx, patch, result.Errors)
	return result
}

func (h *CommandHandler) sendVerifyFeedback(ctx context.Context, patch *PendingPatch, errors []VerificationError) {
	if h.server.connManager == nil {
		return
	}
	conn, ok := h.server.connManager.GetConnection(patch.AgentID)
	if !ok {
		apiLog.Warn("no agent connection for verify feedback", "agentId", patch.AgentID)
		return
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Verification failed for %s (attempt %d/%d):\n\n", patch.Path, patch.RetryCount, maxVerifyRetries))
	for i, e := range errors {
		sb.WriteString(fmt.Sprintf("%d. [%s] %s:%d: %s\n", i+1, e.Source, e.File, e.Line, e.Message))
	}
	sb.WriteString("\nPlease fix these errors and generate a new patch.")

	// Find an active session for this agent
	h.server.mu.RLock()
	var sessionID acp.SessionID
	for sid, aid := range h.server.sessionToAgent {
		if aid == patch.AgentID {
			sessionID = acp.SessionID(sid)
			break
		}
	}
	h.server.mu.RUnlock()

	if sessionID == "" {
		apiLog.Warn("no active session for verify feedback", "agentId", patch.AgentID)
		return
	}

	prompt := acp.Prompt{
		{Type: "text", Text: sb.String()},
	}
	_, err := conn.SendPrompt(ctx, sessionID, prompt)
	if err != nil {
		apiLog.Error("failed to send verify feedback", "agentId", patch.AgentID, "error", err)
	}
}

func (h *CommandHandler) handleVerifyPatch(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if strings.TrimSpace(req.Path) == "" {
		return nil, errValidation("path is required")
	}

	verifier := h.server.Verifier()
	if verifier == nil {
		return nil, NewAPIError(CodeInternalError, "verifier not available")
	}

	result := verifier.Verify(ctx, req.Path)
	return map[string]any{
		"path":        req.Path,
		"verifyState": string(result.State),
		"errors":      result.Errors,
	}, nil
}

// wireAgentLogStream registers a throttled log broadcaster for an agent
// connection so stderr lines stream to clients at ~30Hz (Design Doc S2).
func (h *CommandHandler) wireAgentLogStream(conn *acp.AgentConnection) {
	if conn == nil {
		return
	}
	hub := h.server.Hub()
	if hub == nil {
		return
	}
	conn.SetLogFlush(func(agentID string, batch []acp.LogEntry) {
		hub.Broadcast("agent_log_chunk", map[string]any{
			"agentId": agentID,
			"entries": batch,
		})
	})
}
