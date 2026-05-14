package api

import (
"context"
"encoding/json"
"fmt"
"strings"
"time"
"github.com/google/uuid"
"github.com/swarm-editor/swarm-editor/internal/audit"
"github.com/swarm-editor/swarm-editor/internal/swarm"
)

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
		ID          string                   `json:"id"`
		Name        string                   `json:"name"`
		Description string                   `json:"description"`
		Trigger     swarm.AutomationTrigger  `json:"trigger"`
		Actions     []swarm.AutomationAction `json:"actions"`
		Enabled     bool                     `json:"enabled"`
		Cooldown    string                   `json:"cooldown"`
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
	deleted := store.Delete(strings.TrimSpace(req.WorkflowID), strings.TrimSpace(req.Key))
	if !deleted {
		apiLog.Warn("Artifact not found for deletion", "workflow_id", req.WorkflowID, "key", req.Key)
	}
	return map[string]string{"status": "deleted"}, nil
}

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

	// Enforce maximum limit to prevent unbounded memory allocation
	const maxAuditLimit = 10000
	limit := req.Limit
	if limit <= 0 || limit > maxAuditLimit {
		limit = maxAuditLimit
	}

	filter := &audit.Filter{
		EventType:    req.EventType,
		Actor:        req.Actor,
		Action:       req.Action,
		ResourceType: req.ResourceType,
		ResourceID:   req.ResourceID,
		Success:      req.Success,
		Limit:        limit,
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
	apiLog.Info("Audit log cleared", "removed", count)

	logger.Clear()
	return map[string]any{"success": true, "clearedCount": count}, nil
}

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

func (h *CommandHandler) handleRemoveVariable(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		WorkflowID string `json:"workflowId"`
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

func (h *CommandHandler) handleGetScheduleRunnerStatus(ctx context.Context, params json.RawMessage) (any, error) {
	runner := h.server.ScheduleRunner()
	if runner == nil {
		return nil, errNotConnected("schedule runner not configured")
	}
	return runner.StatusSnapshot(), nil
}

