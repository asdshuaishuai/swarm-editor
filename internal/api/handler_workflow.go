package api

import (
"context"
"encoding/json"
"fmt"
"strings"
"time"
"github.com/google/uuid"
"github.com/swarm-editor/swarm-editor/internal/swarm"
)

func (h *CommandHandler) handleListWorkflows(ctx context.Context, params json.RawMessage) (any, error) {
	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	workflows := orch.ListWorkflows()
	result := make([]map[string]any, 0, len(workflows))
	for _, w := range workflows {
		result = append(result, workflowToMap(w))
	}
	return result, nil
}

func (h *CommandHandler) handleGetWorkflow(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("workflow id is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	w := orch.GetWorkflow(req.ID)
	if w == nil {
		return nil, errNotFound("workflow not found")
	}

	return workflowToMap(w), nil
}

func (h *CommandHandler) handleCreateWorkflow(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Mode        string `json:"mode"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if strings.TrimSpace(req.Name) == "" {
		return nil, errValidation("workflow name is required")
	}
	if len(req.Name) > maxNameLen {
		return nil, errValidation(fmt.Sprintf("name too long (max %d)", maxNameLen))
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	// Default to sequential mode
	mode := swarm.ModeSequential
	if req.Mode != "" {
		mode = swarm.OrchestrationMode(req.Mode)
	}

	w := orch.CreateWorkflow(req.Name, mode)
	w.SetDescription(req.Description)

	return map[string]any{
		"id":     w.ID,
		"name":   w.Name,
		"status": w.Status,
	}, nil
}

func (h *CommandHandler) handleUpdateWorkflow(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID       string          `json:"id"`
		Workflow *map[string]any `json:"workflow"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("workflow id is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	w := orch.GetWorkflow(req.ID)
	if w == nil {
		return nil, errNotFound("workflow not found")
	}

	// Update workflow properties if provided
	if req.Workflow != nil {
		if name, ok := (*req.Workflow)["name"].(string); ok && name != "" {
			w.SetName(name)
		}
		if desc, ok := (*req.Workflow)["description"].(string); ok {
			w.SetDescription(desc)
		}
	}

	return workflowToMap(w), nil
}

func (h *CommandHandler) handleDeleteWorkflow(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("workflow id is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	w := orch.GetWorkflow(req.ID)
	if w == nil {
		return nil, errNotFound("workflow not found")
	}

	orch.DeleteWorkflow(req.ID)
	return map[string]string{"id": req.ID, "status": "deleted"}, nil
}

func (h *CommandHandler) handleExecuteWorkflow(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("workflow id is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	if err := orch.Execute(ctx, req.ID); err != nil {
		return nil, safeError("workflow execution failed", err)
	}

	return map[string]string{"id": req.ID, "status": "executing"}, nil
}

func (h *CommandHandler) handleGetWorkflowCheckpoints(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("workflow id is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	checkpoints := orch.GetCheckpoints(req.ID)
	result := make([]map[string]any, 0, len(checkpoints))
	for _, cp := range checkpoints {
		result = append(result, map[string]any{
			"id":          cp.ID,
			"workflowId":  cp.WorkflowID,
			"createdAt":   cp.CreatedAt.Format(time.RFC3339),
			"currentNode": cp.CurrentNode,
			"metadata":    cp.Metadata,
		})
	}
	return result, nil
}

func (h *CommandHandler) handleRestoreWorkflow(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID           string `json:"id"`
		CheckpointID string `json:"checkpointId"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("workflow id is required")
	}
	if strings.TrimSpace(req.CheckpointID) == "" {
		return nil, errValidation("checkpoint id is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	w, err := orch.RestoreFromCheckpoint(req.CheckpointID)
	if err != nil {
		return nil, safeError("failed to restore from checkpoint", err)
	}

	// Validate that the restored workflow matches the requested workflow ID
	// This prevents restoring a checkpoint from a different workflow
	if w.ID != req.ID {
		return nil, errValidation("checkpoint does not belong to the specified workflow")
	}

	return workflowToMap(w), nil
}

func (h *CommandHandler) handleExportWorkflow(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("workflow id is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	data, err := orch.ExportWorkflow(req.ID)
	if err != nil {
		return nil, safeError("failed to export workflow", err)
	}

	return map[string]any{
		"data":     string(data),
		"format":   "json",
		"size":     len(data),
		"exported": time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func (h *CommandHandler) handleImportWorkflow(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Data json.RawMessage `json:"data"`
		Name string          `json:"name"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if len(req.Data) == 0 {
		return nil, errValidation("workflow data is required")
	}
	const maxImportSize = 1 << 20 // 1 MB
	if len(req.Data) > maxImportSize {
		return nil, errValidation(fmt.Sprintf("workflow data too large (%d bytes, max %d)", len(req.Data), maxImportSize))
	}
	if strings.TrimSpace(req.Name) == "" {
		return nil, errValidation("workflow name is required")
	}
	if len(req.Name) > maxNameLen {
		return nil, errValidation(fmt.Sprintf("name too long (max %d)", maxNameLen))
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	w, err := orch.ImportWorkflow([]byte(req.Data), req.Name)
	if err != nil {
		return nil, safeError("failed to import workflow", err)
	}

	return map[string]any{
		"id":   w.ID,
		"name": w.Name,
	}, nil
}

func (h *CommandHandler) handleValidateWorkflow(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("workflow id is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	w := orch.GetWorkflow(req.ID)
	if w == nil {
		return nil, errNotFound("workflow not found")
	}

	errs := w.Validate()
	return map[string]any{
		"valid":  !errs.HasErrors(),
		"errors": errs,
	}, nil
}

func (h *CommandHandler) handleGetWorkflowStatus(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("workflow id is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	status, err := orch.GetWorkflowStatus(req.ID)
	if err != nil {
		return nil, errNotFound(err.Error())
	}

	return status, nil
}

func (h *CommandHandler) handleGetWorkflowReport(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("workflow id is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	report := orch.GetExecutionReport(req.ID)
	if report == nil {
		return nil, errNotFound("no execution report for workflow")
	}

	return report, nil
}

func (h *CommandHandler) handleClearNodeCache(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		NodeID string `json:"nodeId"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if strings.TrimSpace(req.NodeID) == "" {
		return nil, errValidation("nodeId is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	orch.ClearNodeCache(req.NodeID)
	return map[string]string{"status": "ok"}, nil
}

func (h *CommandHandler) handleClearAllCaches(ctx context.Context, params json.RawMessage) (any, error) {
	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	orch.ClearAllCaches()
	return map[string]string{"status": "ok"}, nil
}

func (h *CommandHandler) handleResumeWorkflow(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID    string `json:"id"`
		Input any    `json:"input"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("workflow id is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	w, err := orch.ResumeWorkflow(ctx, req.ID, req.Input)
	if err != nil {
		return nil, safeError("failed to resume workflow", err)
	}

	return workflowToMap(w), nil
}

func (h *CommandHandler) handleAddWorkflowNode(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID   string `json:"id"`
		Node struct {
			AgentID  string         `json:"agentId"`
			Name     string         `json:"name"`
			Type     string         `json:"type"`
			Position swarm.Position `json:"position"`
		} `json:"node"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if strings.TrimSpace(req.ID) == "" {
		return nil, errValidation("workflow id is required")
	}
	if strings.TrimSpace(req.Node.Name) == "" {
		return nil, errValidation("node name is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	w := orch.GetWorkflow(req.ID)
	if w == nil {
		return nil, errNotFound(fmt.Sprintf("workflow %s not found", req.ID))
	}

	node := &swarm.WorkflowNode{
		ID:       fmt.Sprintf("node_%s", uuid.New().String()[:8]),
		Name:     strings.TrimSpace(req.Node.Name),
		AgentID:  strings.TrimSpace(req.Node.AgentID),
		Type:     "agent", // Default to agent type
		Status:   swarm.TaskStatusPending,
		Position: req.Node.Position,
	}

	if req.Node.Type != "" {
		node.Type = req.Node.Type
	}

	w.AddNode(node)

	return map[string]any{
		"id":       node.ID,
		"name":     node.Name,
		"agentId":  node.AgentID,
		"type":     node.Type,
		"status":   string(node.Status),
		"position": node.Position,
	}, nil
}

func (h *CommandHandler) handleAddWorkflowEdge(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		ID   string `json:"id"`
		Edge struct {
			From      string `json:"from"`
			To        string `json:"to"`
			Condition string `json:"condition"`
			Label     string `json:"label"`
		} `json:"edge"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		return nil, errValidation("workflow id is required")
	}
	req.Edge.From = strings.TrimSpace(req.Edge.From)
	if req.Edge.From == "" {
		return nil, errValidation("edge source node is required")
	}
	req.Edge.To = strings.TrimSpace(req.Edge.To)
	if req.Edge.To == "" {
		return nil, errValidation("edge target node is required")
	}

	orch := h.server.Orchestrator()
	if orch == nil {
		return nil, errNotConnected("orchestrator not configured")
	}

	w := orch.GetWorkflow(req.ID)
	if w == nil {
		return nil, errNotFound("workflow not found")
	}

	edge := &swarm.WorkflowEdge{
		ID:        fmt.Sprintf("edge_%s", uuid.New().String()[:8]),
		From:      req.Edge.From,
		To:        req.Edge.To,
		Condition: req.Edge.Condition,
		Label:     req.Edge.Label,
	}

	if err := w.AddEdge(edge); err != nil {
		return nil, safeError("failed to add edge", err)
	}

	return map[string]any{
		"id":        edge.ID,
		"from":      edge.From,
		"to":        edge.To,
		"condition": edge.Condition,
		"label":     edge.Label,
	}, nil
}

