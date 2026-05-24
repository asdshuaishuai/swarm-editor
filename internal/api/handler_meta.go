package api

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/audit"
)

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

	// Enrich events with IDs for frontend deduplication
	type auditEventJSON struct {
		ID           string         `json:"id"`
		Timestamp    time.Time      `json:"timestamp"`
		EventType    string         `json:"eventType"`
		Actor        string         `json:"actor"`
		Action       string         `json:"action"`
		ResourceType string         `json:"resourceType"`
		ResourceID   string         `json:"resourceId"`
		Details      map[string]any `json:"details,omitempty"`
		IPAddress    string         `json:"ipAddress,omitempty"`
		UserAgent    string         `json:"userAgent,omitempty"`
		Success      bool           `json:"success"`
		Error        string         `json:"error,omitempty"`
	}

	result := make([]auditEventJSON, len(events))
	for i, e := range events {
		result[i] = auditEventJSON{
			ID:           fmt.Sprintf("audit_%d_%d", e.Timestamp.UnixMilli(), i),
			Timestamp:    e.Timestamp,
			EventType:    e.EventType,
			Actor:        e.Actor,
			Action:       e.Action,
			ResourceType: e.ResourceType,
			ResourceID:   e.ResourceID,
			Details:      e.Details,
			IPAddress:    e.IPAddress,
			UserAgent:    e.UserAgent,
			Success:      e.Success,
			Error:        e.Error,
		}
	}
	return result, nil
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

	count := logger.GetEventCount()
	logger.Log("audit.cleared", "system", "clear_audit_log", "audit_log", "", map[string]any{"clearedCount": count}, true, "")
	apiLog.Info("Audit log cleared", "removed", count)

	logger.Clear()
	return map[string]any{"success": true, "clearedCount": count}, nil
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
