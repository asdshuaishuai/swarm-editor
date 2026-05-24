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
			Stats: &SwarmStatsInfo{
				AgentCount:      stats.AgentCount,
				IdleAgents:      stats.IdleAgents,
				ExecutingAgents: stats.ExecutingAgents,
				PendingTasks:    stats.PendingTasks,
				CompletedTasks:  stats.CompletedTasks,
				Topology:        stats.Topology,
				Strategy:        stats.Strategy,
				State:           stats.State,
			},
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
	switch req.Topology {
	case "star", "mesh", "tree", "ring", "hybrid", "":
	default:
		return nil, errValidation("invalid topology: " + req.Topology)
	}
	switch req.Strategy {
	case "round_robin", "least_loaded", "priority", "capability", "":
	default:
		return nil, errValidation("invalid strategy: " + req.Strategy)
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
		Status:     StatusCreated,
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

	if hub := h.server.Hub(); hub != nil {
		hub.Broadcast("swarm_status_change", map[string]any{
			"swarmId": req.ID,
			"status":  StatusRunning,
		})
	}

	return map[string]string{"status": StatusStarted}, nil
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

	if hub := h.server.Hub(); hub != nil {
		hub.Broadcast("swarm_status_change", map[string]any{
			"swarmId": req.ID,
			"status":  StatusStopped,
		})
	}

	return map[string]string{"status": StatusStopped}, nil
}

func (h *CommandHandler) handleSubmitTask(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		SwarmID       string   `json:"swarmId"`
		Title         string   `json:"title"`
		Description   string   `json:"description"`
		Priority      string   `json:"priority"`
		Constraints   []string `json:"constraints,omitempty"`
		Acceptance    []string `json:"acceptance,omitempty"`
		RiskTolerance string   `json:"riskTolerance,omitempty"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	// Validate input lengths
	req.SwarmID = strings.TrimSpace(req.SwarmID)
	if req.SwarmID == "" {
		return nil, errValidation("swarmId is required")
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		return nil, errValidation("title is required")
	}
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
	switch req.Priority {
	case "high":
		priority = swarm.PriorityHigh
	case "medium", "":
		priority = swarm.PriorityMedium
	case "low":
		priority = swarm.PriorityLow
	case "critical":
		priority = swarm.PriorityCritical
	default:
		return nil, errValidation("invalid priority: " + req.Priority)
	}

	// Build metadata from new fields
	metadata := make(map[string]any)
	if len(req.Constraints) > 0 {
		metadata["constraints"] = req.Constraints
	}
	if len(req.Acceptance) > 0 {
		metadata["acceptance"] = req.Acceptance
	}
	if req.RiskTolerance != "" {
		metadata["riskTolerance"] = req.RiskTolerance
	}

	// Create and submit task
	task := &swarm.Task{
		ID:          taskID,
		Title:       req.Title,
		Description: req.Description,
		Priority:    priority,
		State:       swarm.TaskStatePending,
		Metadata:    metadata,
	}

	if err := sw.SubmitTask(ctx, task); err != nil {
		return nil, safeError("failed to submit task", err)
	}

	return TaskInfo{
		ID:          taskID,
		Title:       req.Title,
		Description: req.Description,
		Status:      StatusPending,
		Priority:    string(priority),
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

	tasks := sw.GetAllTasks()
	result := make([]TaskInfo, 0, len(tasks))
	for _, t := range tasks {
		assignedTo := make([]string, 0, len(t.AssignedTo))
		for _, id := range t.AssignedTo {
			assignedTo = append(assignedTo, string(id))
		}
		info := TaskInfo{
			ID:          t.ID,
			Title:       t.Title,
			Description: t.Description,
			Status:      string(t.State),
			Priority:    string(t.Priority),
			AssignedTo:  assignedTo,
			CreatedAt:   t.CreatedAt.Format(time.RFC3339),
		}
		if !t.StartedAt.IsZero() {
			ts := t.StartedAt.Format(time.RFC3339)
			info.StartedAt = &ts
		}
		if !t.CompletedAt.IsZero() {
			ts := t.CompletedAt.Format(time.RFC3339)
			info.CompletedAt = &ts
		}
		result = append(result, info)
	}

	return result, nil
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
	coordinatorID := ""
	if coord := s.GetCoordinator(); coord != nil {
		coordinatorID = string(coord.ID)
	}
	return map[string]any{
		"id":            s.ID,
		"name":          s.Name,
		"topology":      string(s.Topology),
		"strategy":      string(s.Strategy),
		"status":        stats.State,
		"agentCount":    stats.AgentCount,
		"taskCount":     stats.PendingTasks + stats.CompletedTasks,
		"coordinatorId": coordinatorID,
		"stats": map[string]any{
			"agentCount":      stats.AgentCount,
			"idleAgents":      stats.IdleAgents,
			"executingAgents": stats.ExecutingAgents,
			"pendingTasks":    stats.PendingTasks,
			"completedTasks":  stats.CompletedTasks,
			"topology":        stats.Topology,
			"strategy":        stats.Strategy,
			"state":           stats.State,
		},
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

	return map[string]string{"id": req.ID, "status": StatusDeleted}, nil
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
		"status": StatusCompleted,
		"output": result.Content,
		"agentResults": func() map[string]any {
			m := make(map[string]any, len(result.AgentResults))
			for id, ar := range result.AgentResults {
				m[id] = map[string]any{
					"agentId":    ar.AgentID,
					"content":    ar.Content,
					"error":      ar.Error,
					"success":    ar.Error == "",
					"durationMs": result.Duration.Milliseconds(),
				}
			}
			return m
		}(),
	}, nil
}

func (h *CommandHandler) handleCancelTask(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		SwarmID string `json:"swarmId"`
		TaskID  string `json:"taskId"`
		Reason  string `json:"reason"`
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

	reason := swarm.CancelReason(req.Reason)
	if reason == "" {
		reason = swarm.CancelReasonUser
	}
	cancelled := task.Cancel(reason)
	if !cancelled {
		return map[string]any{
			"taskId":  req.TaskID,
			"status":  string(task.GetState()),
			"message": "task cannot be cancelled from current state",
		}, nil
	}

	return map[string]any{
		"taskId": req.TaskID,
		"status": StatusCancelled,
	}, nil
}

func (h *CommandHandler) handleAssignTask(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		SwarmID string `json:"swarmId"`
		TaskID  string `json:"taskId"`
		AgentID string `json:"agentId"`
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
	if strings.TrimSpace(req.AgentID) == "" {
		return nil, errValidation("agent id is required")
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

	task.Assign(acp.AgentID(req.AgentID))
	return map[string]any{
		"taskId":  req.TaskID,
		"agentId": req.AgentID,
		"status":  "assigned",
	}, nil
}

func (h *CommandHandler) handleResolveHandoff(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		SwarmID   string `json:"swarmId"`
		RequestID string `json:"requestId"`
		Accepted  bool   `json:"accepted"`
		Summary   string `json:"summary"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if strings.TrimSpace(req.RequestID) == "" {
		return nil, errValidation("requestId is required")
	}

	// Find the swarm and resolve the handoff
	swarms := h.server.ListSwarms()
	for id, sw := range swarms {
		if req.SwarmID != "" && id != req.SwarmID {
			continue
		}
		if req.Accepted {
			if err := sw.AcceptHandoff(ctx, req.RequestID, req.Summary); err != nil {
				continue // Try next swarm
			}
		} else {
			if err := sw.RejectHandoff(ctx, req.RequestID, req.Summary); err != nil {
				continue
			}
		}
		return map[string]any{
			"requestId": req.RequestID,
			"accepted":  req.Accepted,
			"status":    "resolved",
		}, nil
	}

	return nil, errNotFound("handoff request not found")
}

func (h *CommandHandler) handleGetConsensus(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		SwarmID string `json:"swarmId"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	swarms := h.server.ListSwarms()

	type ConsensusInfo struct {
		TaskID        string  `json:"taskId"`
		Algorithm     string  `json:"algorithm"`
		ApprovalRate  float64 `json:"approvalRate"`
		TotalVotes    int     `json:"totalVotes"`
		ApprovedVotes int     `json:"approvedVotes"`
		Completed     bool    `json:"completed"`
		Agreed        bool    `json:"agreed"`
	}

	results := make([]ConsensusInfo, 0)

	for id, sw := range swarms {
		if req.SwarmID != "" && id != req.SwarmID {
			continue
		}

		// Query the ConsensusEngine for real evaluation data
		engine := sw.ConsensusEngine()
		activeTasks := engine.GetActiveTasks()

		for _, active := range activeTasks {
			if active.Result == nil {
				continue
			}
			totalVotes := len(active.Evaluations)
			approvedVotes := 0
			for _, eval := range active.Evaluations {
				if eval.Approved {
					approvedVotes++
				}
			}
			results = append(results, ConsensusInfo{
				TaskID:        active.Task.ID,
				Algorithm:     string(active.Algorithm),
				ApprovalRate:  active.Result.ApprovalRate,
				TotalVotes:    totalVotes,
				ApprovedVotes: approvedVotes,
				Completed:     active.Completed,
				Agreed:        active.Result.Status == "agreed",
			})
		}

		// Also include completed tasks that went through consensus
		tasks := sw.GetAllTasks()
		for _, task := range tasks {
			if task.GetState() != swarm.TaskStateCompleted || task.Result == nil {
				continue
			}
			// Skip if already reported from consensus engine
			found := false
			for _, r := range results {
				if r.TaskID == task.ID {
					found = true
					break
				}
			}
			if found {
				continue
			}
			approved := task.Result.Error == ""
			approvalRate := 0.0
			if approved {
				approvalRate = 1.0
			}
			results = append(results, ConsensusInfo{
				TaskID:        task.ID,
				Algorithm:     "queen_bee",
				ApprovalRate:  approvalRate,
				TotalVotes:    1,
				ApprovedVotes: func() int { if approved { return 1 }; return 0 }(),
				Completed:     true,
				Agreed:        approved,
			})
		}
	}

	return map[string]any{
		"consensus": results,
		"algorithm": "queen_bee",
		"threshold": 0.51,
	}, nil
}

