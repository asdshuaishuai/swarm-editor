package api

import (
"context"
"encoding/json"
"fmt"
"strings"
"time"
"github.com/google/uuid"
"github.com/swarm-editor/swarm-editor/internal/acp"
"github.com/swarm-editor/swarm-editor/internal/swarm"
)

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
		"id":            s.ID,
		"name":          s.Name,
		"topology":      string(s.Topology),
		"strategy":      string(s.Strategy),
		"status":        stats.State,
		"agentCount":    stats.AgentCount,
		"taskCount":     stats.PendingTasks + stats.CompletedTasks,
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
		"taskId": req.TaskID,
		"status": "completed",
		"output": result.Content,
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

