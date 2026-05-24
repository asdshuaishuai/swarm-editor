package api

import (
"context"
"encoding/json"
"fmt"
"os"
"path/filepath"
"strings"
"time"
"github.com/swarm-editor/swarm-editor/internal/acp"
)

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

	// Check session limit with atomic reservation to prevent TOCTOU race.
	// Reserve a slot under the lock, create the ACP session outside the lock,
	// then register. If ACP creation fails, release the slot.
	h.server.mu.Lock()
	if h.server.sessionToAgent == nil {
		h.server.sessionToAgent = make(map[string]string)
	}
	if len(h.server.sessionToAgent) >= maxSessions {
		h.server.mu.Unlock()
		return nil, errLimitExceeded(fmt.Sprintf("maximum number of sessions (%d) reached", maxSessions))
	}
	h.server.mu.Unlock()

	// Create session via ACP (outside lock — may block on network)
	session, err := conn.CreateSession(ctx, mode)
	if err != nil {
		return nil, safeError("failed to create session", err)
	}

	// Re-check and register under lock to close the race window
	h.server.mu.Lock()
	if h.server.sessionToMode == nil {
		h.server.sessionToMode = make(map[string]string)
	}
	if len(h.server.sessionToAgent) >= maxSessions {
		// Another goroutine filled the slots while we were creating the session.
		// Close the orphaned ACP session and reject.
		h.server.mu.Unlock()
		conn.CloseSession(ctx, session.ID)
		return nil, errLimitExceeded(fmt.Sprintf("maximum number of sessions (%d) reached", maxSessions))
	}
	h.server.sessionToAgent[string(session.ID)] = req.AgentID
	h.server.sessionToMode[string(session.ID)] = req.Mode
	if clientID := ClientIDFromContext(ctx); clientID != "" {
		if h.server.clientSessions == nil {
			h.server.clientSessions = make(map[string]map[string]struct{})
		}
		if h.server.clientSessions[clientID] == nil {
			h.server.clientSessions[clientID] = make(map[string]struct{})
		}
		h.server.clientSessions[clientID][string(session.ID)] = struct{}{}
	}
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

	// Inject custom instructions if available (Cursor .cursorrules / VS Code AGENTS.md pattern)
	promptText := req.Message
	if instructions := h.loadCustomInstructions(); instructions != "" {
		promptText = "[Project Instructions]\n" + instructions + "\n\n[User Message]\n" + req.Message
	}

	// Create prompt
	prompt := acp.Prompt{
		{Type: "text", Text: promptText},
	}

	// Send prompt via ACP
	result, err := conn.SendPrompt(ctx, acp.SessionID(req.SessionID), prompt)
	if err != nil {
		return nil, safeError("failed to send message", err)
	}

	if hub := h.server.Hub(); hub != nil {
		hub.Broadcast("agent_message", map[string]any{
			"sessionId": req.SessionID,
			"content":   result.Content,
		})
	}

	return map[string]any{
		"sessionId":  req.SessionID,
		"stopReason": result.StopReason,
		"content":    result.Content,
	}, nil
}

func (h *CommandHandler) loadCustomInstructions() string {
	if h.server.workspacePath == "" {
		return ""
	}
	var parts []string
	for _, filename := range instructionFiles {
		path := filepath.Join(h.server.workspacePath, filename)
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		content := strings.TrimSpace(string(data))
		if content != "" {
			parts = append(parts, fmt.Sprintf("--- %s ---\n%s", filename, content))
		}
	}
	return strings.Join(parts, "\n\n")
}

func (h *CommandHandler) handleGetCustomInstructions(ctx context.Context, params json.RawMessage) (any, error) {
	if h.server.workspacePath == "" {
		return map[string]any{"content": "", "files": []string{}}, nil
	}

	var foundFiles []string
	var parts []string
	for _, filename := range instructionFiles {
		path := filepath.Join(h.server.workspacePath, filename)
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		content := strings.TrimSpace(string(data))
		if content != "" {
			foundFiles = append(foundFiles, filename)
			parts = append(parts, fmt.Sprintf("--- %s ---\n%s", filename, content))
		}
	}

	return map[string]any{
		"content": strings.Join(parts, "\n\n"),
		"files":   foundFiles,
	}, nil
}

func (h *CommandHandler) handleSaveCustomInstructions(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Content string `json:"content"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	// Limit instruction size to prevent abuse
	const maxInstructionsSize = 100 * 1024 // 100KB
	if len(req.Content) > maxInstructionsSize {
		return nil, errValidation("instructions exceed maximum size (100KB)")
	}

	path := filepath.Join(h.server.workspacePath, ".swarm-instructions.md")

	// Atomic write (temp + rename)
	dir := filepath.Dir(path)
	tmpFile, err := os.CreateTemp(dir, ".swarm-instructions-*.tmp")
	if err != nil {
		return nil, safeError("failed to create temp file", err)
	}
	tmpPath := tmpFile.Name()
	if _, err := tmpFile.WriteString(req.Content); err != nil {
		tmpFile.Close()
		os.Remove(tmpPath)
		return nil, safeError("failed to write temp file", err)
	}
	if err := tmpFile.Close(); err != nil {
		os.Remove(tmpPath)
		return nil, safeError("failed to close temp file", err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return nil, safeError("failed to save instructions file", err)
	}

	return map[string]string{"status": "saved", "path": ".swarm-instructions.md"}, nil
}

func (h *CommandHandler) handleGetSessions(ctx context.Context, params json.RawMessage) (any, error) {
	h.server.mu.RLock()
	type sessionEntry struct {
		agentID string
		mode    string
	}
	snapshot := make(map[string]sessionEntry, len(h.server.sessionToAgent))
	for k, v := range h.server.sessionToAgent {
		snapshot[k] = sessionEntry{agentID: v, mode: h.server.sessionToMode[k]}
	}
	h.server.mu.RUnlock()

	if len(snapshot) == 0 {
		return []SessionInfo{}, nil
	}

	now := time.Now().Format(time.RFC3339)
	result := make([]SessionInfo, 0, len(snapshot))
	for sessionID, entry := range snapshot {
		result = append(result, SessionInfo{
			ID:        sessionID,
			AgentID:   entry.agentID,
			Mode:      entry.mode,
			CreatedAt: now,
			UpdatedAt: now,
		})
	}

	return result, nil
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

	// Look up agent before removing mapping
	h.server.mu.Lock()
	agentID, hadSession := h.server.sessionToAgent[req.SessionID]
	delete(h.server.sessionToAgent, req.SessionID)
	delete(h.server.sessionToMode, req.SessionID)
	for _, sessions := range h.server.clientSessions {
		delete(sessions, req.SessionID)
	}
	h.server.mu.Unlock()

	// Close ACP session on the agent side (best effort)
	if hadSession && h.server.connManager != nil {
		if conn, ok := h.server.connManager.GetConnection(agentID); ok {
			_ = conn.CloseSession(ctx, acp.SessionID(req.SessionID))
		}
	}

	return map[string]string{"status": "closed"}, nil
}

