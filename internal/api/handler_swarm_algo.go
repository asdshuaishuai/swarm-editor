package api

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/swarm"
)

// handleGetQueenStatus returns current queen and backup info
func (h *CommandHandler) handleGetQueenStatus(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		SwarmID string `json:"swarmId"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if req.SwarmID == "" {
		return nil, errValidation("swarmId is required")
	}

	sw, ok := h.server.GetSwarm(req.SwarmID)
	if !ok {
		return nil, errNotFound("swarm not found")
	}

	info := sw.GetQueenInfo()
	return map[string]any{
		"swarmId":    req.SwarmID,
		"queenId":    info.QueenID,
		"backupId":   info.BackupQueenID,
		"state":      info.State.String(),
		"round":      info.ElectionRound,
		"electedAt":  info.ElectedAt.Format(time.RFC3339),
		"abdication": info.AbdicationReason,
	}, nil
}

// handleTriggerElection manually triggers queen election
func (h *CommandHandler) handleTriggerElection(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		SwarmID string `json:"swarmId"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if req.SwarmID == "" {
		return nil, errValidation("swarmId is required")
	}

	sw, ok := h.server.GetSwarm(req.SwarmID)
	if !ok {
		return nil, errNotFound("swarm not found")
	}

	var sup *swarm.Supervisor
	if err := sw.TriggerElection(ctx, sup); err != nil {
		return nil, safeError("election failed", err)
	}

	info := sw.GetQueenInfo()
	return map[string]any{
		"swarmId":  req.SwarmID,
		"queenId":  info.QueenID,
		"backupId": info.BackupQueenID,
		"state":    info.State.String(),
		"round":    info.ElectionRound,
	}, nil
}

// handleAbdicateQueen forces the current queen to abdicate
func (h *CommandHandler) handleAbdicateQueen(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		SwarmID string `json:"swarmId"`
		Reason  string `json:"reason"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if req.SwarmID == "" {
		return nil, errValidation("swarmId is required")
	}

	sw, ok := h.server.GetSwarm(req.SwarmID)
	if !ok {
		return nil, errNotFound("swarm not found")
	}

	reason := req.Reason
	if reason == "" {
		reason = "manual abdication"
	}

	if err := sw.AbdicateQueen(reason); err != nil {
		return nil, safeError("abdication failed", err)
	}

	info := sw.GetQueenInfo()
	return map[string]any{
		"swarmId":  req.SwarmID,
		"queenId":  info.QueenID,
		"backupId": info.BackupQueenID,
		"state":    info.State.String(),
		"previous": reason,
	}, nil
}

// handleInterruptAgent interrupts a running agent
func (h *CommandHandler) handleInterruptAgent(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		SwarmID string `json:"swarmId"`
		AgentID string `json:"agentId"`
		TaskID  string `json:"taskId"`
		Reason  string `json:"reason"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if req.SwarmID == "" {
		return nil, errValidation("swarmId is required")
	}
	if req.AgentID == "" {
		return nil, errValidation("agentId is required")
	}
	if req.TaskID == "" {
		return nil, errValidation("taskId is required")
	}

	sw, ok := h.server.GetSwarm(req.SwarmID)
	if !ok {
		return nil, errNotFound("swarm not found")
	}

	im := sw.GetInterruptManager()
	if im == nil {
		return nil, errNotFound("interrupt manager not available")
	}

	reason := swarm.InterruptReason(req.Reason)
	if reason == "" {
		reason = swarm.InterruptUserCancel
	}

	checkpoint, err := im.Interrupt(ctx, req.AgentID, req.TaskID, reason)
	if err != nil {
		return nil, safeError("interrupt failed", err)
	}

	return map[string]any{
		"checkpointId":  checkpoint.ID,
		"taskId":        checkpoint.TaskID,
		"agentId":       checkpoint.AgentID,
		"reason":        string(checkpoint.Reason),
		"partialResult": checkpoint.PartialResult,
		"savedAt":       checkpoint.SavedAt.Format(time.RFC3339),
	}, nil
}

// handleResumeTask resumes a task from checkpoint
func (h *CommandHandler) handleResumeTask(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		CheckpointID string `json:"checkpointId"`
		AgentID      string `json:"agentId,omitempty"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if req.CheckpointID == "" {
		return nil, errValidation("checkpointId is required")
	}

	// Find the swarm that owns this checkpoint
	var im *swarm.InterruptManager
	for _, sw := range h.server.ListSwarms() {
		if mgr := sw.GetInterruptManager(); mgr != nil {
			if cp, err := mgr.GetCheckpoint(req.CheckpointID); err == nil && cp != nil {
				im = mgr
				break
			}
		}
	}

	if im == nil {
		return nil, errNotFound("checkpoint not found")
	}

	var err error
	if req.AgentID != "" {
		err = im.ResumeWithAgent(ctx, req.CheckpointID, req.AgentID)
	} else {
		err = im.Resume(ctx, req.CheckpointID)
	}

	if err != nil {
		return nil, safeError("resume failed", err)
	}

	return map[string]any{
		"checkpointId": req.CheckpointID,
		"status":       "resumed",
	}, nil
}

// handleGetCheckpoints lists checkpoints for a swarm
func (h *CommandHandler) handleGetCheckpoints(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		SwarmID string `json:"swarmId"`
		TaskID  string `json:"taskId,omitempty"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if req.SwarmID == "" {
		return nil, errValidation("swarmId is required")
	}

	sw, ok := h.server.GetSwarm(req.SwarmID)
	if !ok {
		return nil, errNotFound("swarm not found")
	}

	im := sw.GetInterruptManager()
	if im == nil {
		return []any{}, nil
	}

	var checkpoints any
	if req.TaskID != "" {
		checkpoints = im.ListCheckpoints(req.TaskID)
	} else {
		interrupts := im.GetActiveInterrupts()
		result := make([]map[string]any, 0, len(interrupts))
		for _, rec := range interrupts {
			if rec.Checkpoint != nil {
				result = append(result, map[string]any{
					"checkpointId":  rec.Checkpoint.ID,
					"taskId":        rec.Checkpoint.TaskID,
					"agentId":       rec.Checkpoint.AgentID,
					"reason":        string(rec.Checkpoint.Reason),
					"strategy":      string(rec.Checkpoint.Strategy),
					"partialResult": rec.Checkpoint.PartialResult,
					"savedAt":       rec.Checkpoint.SavedAt.Format(time.RFC3339),
					"retryCount":    rec.Checkpoint.RetryCount,
					"recovered":     rec.Recovered,
				})
			}
		}
		checkpoints = result
	}

	return checkpoints, nil
}

// handleRecoverTask applies a recovery strategy to a checkpoint
func (h *CommandHandler) handleRecoverTask(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		CheckpointID string `json:"checkpointId"`
		Strategy     string `json:"strategy"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if req.CheckpointID == "" {
		return nil, errValidation("checkpointId is required")
	}
	if req.Strategy == "" {
		return nil, errValidation("strategy is required")
	}

	strategy := swarm.RecoveryStrategy(req.Strategy)
	switch strategy {
	case swarm.RecoveryRetrySame, swarm.RecoveryReassign, swarm.RecoveryCheckpoint, swarm.RecoveryEscalate:
	default:
		return nil, errValidation(fmt.Sprintf("invalid strategy: %s", req.Strategy))
	}

	var im *swarm.InterruptManager
	for _, sw := range h.server.ListSwarms() {
		if mgr := sw.GetInterruptManager(); mgr != nil {
			if cp, err := mgr.GetCheckpoint(req.CheckpointID); err == nil && cp != nil {
				im = mgr
				break
			}
		}
	}

	if im == nil {
		return nil, errNotFound("checkpoint not found")
	}

	if err := im.ApplyStrategy(req.CheckpointID, strategy); err != nil {
		return nil, safeError("recovery failed", err)
	}

	return map[string]any{
		"checkpointId": req.CheckpointID,
		"strategy":     req.Strategy,
		"status":       "recovering",
	}, nil
}

// handleGetRoleAssignments returns current dynamic role assignments
func (h *CommandHandler) handleGetRoleAssignments(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		SwarmID string `json:"swarmId"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if req.SwarmID == "" {
		return nil, errValidation("swarmId is required")
	}

	sw, ok := h.server.GetSwarm(req.SwarmID)
	if !ok {
		return nil, errNotFound("swarm not found")
	}

	assignments := sw.GetRoleAssignments()
	result := make([]map[string]any, 0, len(assignments))
	for _, a := range assignments {
		result = append(result, map[string]any{
			"agentId":    a.AgentID,
			"role":       string(a.Role),
			"taskId":     a.TaskID,
			"assignedAt": a.AssignedAt.Format(time.RFC3339),
			"score":      a.Score,
		})
	}

	return result, nil
}
