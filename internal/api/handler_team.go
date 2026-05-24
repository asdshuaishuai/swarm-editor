package api

import (
"context"
"encoding/json"
"fmt"
"strings"
"time"
"github.com/swarm-editor/swarm-editor/internal/acp"
)

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

	return map[string]string{"status": StatusDeleted}, nil
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
	req.TeamID = strings.TrimSpace(req.TeamID)
	req.AgentID = strings.TrimSpace(req.AgentID)
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
	req.TeamID = strings.TrimSpace(req.TeamID)
	req.AgentID = strings.TrimSpace(req.AgentID)
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

