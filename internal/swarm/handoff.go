// Package swarm implements Agent Handoff mechanism
// Based on OpenAI Swarm's handoff pattern for fluent task transfer between agents
package swarm

import (
	"context"
	"encoding/json"
	"fmt"
	"maps"
	"sort"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/a2a"
	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
	"github.com/swarm-editor/swarm-editor/internal/log"
	"github.com/swarm-editor/swarm-editor/pkg/utils"
)

var handoffLog = log.With("component", "Handoff")

// HandoffState represents the state of a handoff
type HandoffState string

const (
	HandoffStatePending   HandoffState = "pending"
	HandoffStateAccepted  HandoffState = "accepted"
	HandoffStateRejected  HandoffState = "rejected"
	HandoffStateCompleted HandoffState = "completed"
)

// HandoffRequest represents a request to transfer a task to another agent
type HandoffRequest struct {
	ID          string          `json:"id"`
	FromAgent   string          `json:"fromAgent"`
	ToAgent     string          `json:"toAgent"`
	TaskID      string          `json:"taskId"`
	Reason      string          `json:"reason"`
	Context     *HandoffContext `json:"context"`
	Status      HandoffState    `json:"status"`
	CreatedAt   time.Time       `json:"createdAt"`
	RespondedAt time.Time       `json:"respondedAt,omitempty"`
}

// HandoffContext contains the context to transfer
type HandoffContext struct {
	ConversationHistory []acp.ContentBlock `json:"conversationHistory"`
	FilesModified       []string           `json:"filesModified"`
	CurrentState        string             `json:"currentState"`
	NextSteps           []string           `json:"nextSteps"`
	Instructions        string             `json:"instructions"`
	Metadata            map[string]any     `json:"metadata"`

	// ContextVariables accumulates state across handoff chains.
	// Unlike Metadata (arbitrary key-value), these variables are explicitly
	// designed to be merged during sequential handoffs, inspired by OpenAI Swarm's
	// context_variables pattern where each agent can read and update shared state.
	ContextVariables map[string]any `json:"contextVariables,omitempty"`
}

// HandoffResponse represents the response to a handoff request
type HandoffResponse struct {
	RequestID  string    `json:"requestId"`
	Accepted   bool      `json:"accepted"`
	Message    string    `json:"message,omitempty"`
	Summary    string    `json:"summary,omitempty"`
	ReceivedAt time.Time `json:"receivedAt"`

	// UpdatedVariables allows the accepting agent to update context variables
	// during handoff acceptance, similar to OpenAI Swarm's context_variables update
	UpdatedVariables map[string]any `json:"updatedVariables,omitempty"`
}

// HandoffManager manages agent handoffs
type HandoffManager struct {
	mu sync.RWMutex

	// Active handoffs
	pending   map[string]*HandoffRequest
	active    map[string]*HandoffRequest
	completed map[string]*HandoffRequest

	// Agents
	registry *agent.Registry

	// Handoff depth tracking (prevents infinite loops)
	// taskID -> current depth count
	handoffDepth map[string]int
	maxDepth     int

	// handoffDepthBlocked tracks tasks that have hit the depth limit.
	// This prevents bypassing the limit: when depth reaches maxDepth, we move
	// the taskID here instead of deleting from handoffDepth, so subsequent
	// requests are blocked permanently for this task.
	handoffDepthBlocked map[string]struct{}

	// closeOnce ensures Close() is idempotent — calling it twice or after
	// RequestHandoff has already been called won't cause a WaitGroup panic.
	closeOnce sync.Once

	// wg tracks in-flight waitForResponse goroutines for graceful shutdown
	wg sync.WaitGroup

	// ctx and cancel provide graceful shutdown - cancel() signals all in-flight
	// goroutines to stop, then wg.Wait() drains them.
	ctx    context.Context
	cancel context.CancelFunc

	// Callbacks
	onHandoffRequested func(req *HandoffRequest)
	onHandoffAccepted  func(req *HandoffRequest)
	onHandoffCompleted func(req *HandoffRequest)
	onHandoffRejected  func(req *HandoffRequest)

	// Hooks (OpenAI Swarm on_handoff / after_handoff pattern)
	// onBeforeHandoff runs before a handoff is requested.
	// Return false to abort, or return a modified HandoffContext to transform the context.
	onBeforeHandoff HandoffHook
	// onAfterHandoff runs after a handoff completes or is rejected.
	// success is true if the handoff completed, false if rejected/timeout.
	onAfterHandoff func(ctx context.Context, req *HandoffRequest, success bool)

	// Configuration
	maxPendingHandoffs int
	handoffTimeout     time.Duration

	// A2A Router for inter-agent handoff messaging
	a2aRouter *a2a.Router

	// Event broadcasting for UI streaming (OpenAI Swarm handoff streaming pattern)
	broadcaster EventBroadcaster
}

// HandoffHook is called before a handoff request is created.
// It can validate, transform, or abort the handoff.
// Return (true, nil) to proceed, (false, nil) to abort, or (true, modifiedCtx) to transform.
type HandoffHook func(ctx context.Context, req *HandoffRequest) (allow bool, modifiedCtx *HandoffContext, err error)

// EventBroadcaster allows handoff events to be streamed to UI
type EventBroadcaster interface {
	Broadcast(eventType string, payload any)
}

// DefaultMaxHandoffDepth prevents infinite handoff loops (OpenAI Swarm best practice)
const DefaultMaxHandoffDepth = 10

// NewHandoffManager creates a new handoff manager
func NewHandoffManager(registry *agent.Registry) *HandoffManager {
	ctx, cancel := context.WithCancel(context.Background())
	return &HandoffManager{
		registry:            registry,
		pending:             make(map[string]*HandoffRequest),
		active:              make(map[string]*HandoffRequest),
		completed:           make(map[string]*HandoffRequest),
		handoffDepth:        make(map[string]int),
		handoffDepthBlocked: make(map[string]struct{}),
		maxDepth:            DefaultMaxHandoffDepth,
		maxPendingHandoffs:  5,
		handoffTimeout:      30 * time.Second,
		ctx:                 ctx,
		cancel:              cancel,
	}
}

// RequestHandoff initiates a handoff from one agent to another
func (hm *HandoffManager) RequestHandoff(ctx context.Context, fromAgent, toAgent, taskID, reason string, context *HandoffContext) (*HandoffRequest, error) {
	// Create a preliminary request for the pre-handoff hook
	preReq := &HandoffRequest{
		FromAgent: fromAgent,
		ToAgent:   toAgent,
		TaskID:    taskID,
		Reason:    reason,
		Context:   context,
	}

	// Run pre-handoff hook if set (OpenAI Swarm on_handoff pattern)
	hm.mu.RLock()
	hook := hm.onBeforeHandoff
	hm.mu.RUnlock()
	if hook != nil {
		allow, modifiedCtx, err := hook(ctx, preReq)
		if err != nil {
			return nil, fmt.Errorf("pre-handoff hook error: %w", err)
		}
		if !allow {
			return nil, fmt.Errorf("handoff rejected by pre-handoff hook")
		}
		if modifiedCtx != nil {
			context = modifiedCtx
		}
	}

	hm.mu.Lock()

	// Check if agents exist
	if _, ok := hm.registry.Get(acp.AgentID(fromAgent)); !ok {
		hm.mu.Unlock()
		return nil, fmt.Errorf("source agent %s not found", fromAgent)
	}

	if _, ok := hm.registry.Get(acp.AgentID(toAgent)); !ok {
		hm.mu.Unlock()
		return nil, fmt.Errorf("target agent %s not found", toAgent)
	}

	// Check pending limit
	if len(hm.pending) >= hm.maxPendingHandoffs {
		hm.mu.Unlock()
		return nil, fmt.Errorf("too many pending handoffs")
	}

	// Check handoff depth to prevent infinite loops
	// First check if task is permanently blocked (hit limit before)
	if _, blocked := hm.handoffDepthBlocked[taskID]; blocked {
		hm.mu.Unlock()
		return nil, fmt.Errorf("handoff depth limit reached for task %s (blocked)", taskID)
	}
	currentDepth := hm.handoffDepth[taskID]
	if currentDepth >= hm.maxDepth {
		hm.mu.Unlock()
		return nil, fmt.Errorf("handoff depth limit reached for task %s (%d/%d)", taskID, currentDepth, hm.maxDepth)
	}

	// Create handoff request
	req := &HandoffRequest{
		ID:        generateHandoffID(),
		FromAgent: fromAgent,
		ToAgent:   toAgent,
		TaskID:    taskID,
		Reason:    reason,
		Context:   context,
		Status:    HandoffStatePending,
		CreatedAt: time.Now(),
	}

	hm.pending[req.ID] = req
	onRequested := hm.onHandoffRequested
	hm.mu.Unlock()

	// Notify callback outside lock
	if onRequested != nil {
		onRequested(req)
	}

	// Send A2A handoff request to target agent
	hm.sendA2AHandoff(a2a.MessageTypeHandoffRequest, fromAgent, toAgent, &a2a.HandoffRequestPayload{
		RequestID: req.ID,
		TaskID:    taskID,
		Reason:    reason,
		Context:   toA2AHandoffContext(context),
		Timeout:   hm.handoffTimeout,
	})

	// Send handoff request to target agent (via ACP or internal)
	// In a real implementation, this would use ACP messaging
	hm.wg.Add(1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				handoffLog.Error("waitForResponse panic", "request_id", req.ID, "panic", r)
			}
			hm.wg.Done()
		}()
		hm.waitForResponse(ctx, req)
	}()

	return req, nil
}

// AcceptHandoff accepts a handoff request and optionally updates context variables
func (hm *HandoffManager) AcceptHandoff(ctx context.Context, requestID, summary string, updatedVars ...map[string]any) error {
	hm.mu.Lock()
	req, ok := hm.pending[requestID]
	if !ok {
		hm.mu.Unlock()
		return fmt.Errorf("handoff request %s not found", requestID)
	}

	// Merge any updated context variables into the handoff context
	if req.Context != nil && len(updatedVars) > 0 && updatedVars[0] != nil {
		req.Context.MergeContextVariables(updatedVars[0])
	}

	// Move to active
	delete(hm.pending, requestID)
	req.Status = HandoffStateAccepted
	req.RespondedAt = time.Now()
	hm.active[requestID] = req
	onAccepted := hm.onHandoffAccepted
	hm.mu.Unlock()

	// Notify callback outside lock
	if onAccepted != nil {
		onAccepted(req)
	}

	// Send A2A handoff accept to source agent
	hm.sendA2AHandoff(a2a.MessageTypeHandoffAccept, req.ToAgent, req.FromAgent, &a2a.HandoffAcceptPayload{
		RequestID: requestID,
		AgentID:   req.ToAgent,
		Summary:   summary,
	})

	return nil
}

// RejectHandoff rejects a handoff request
func (hm *HandoffManager) RejectHandoff(ctx context.Context, requestID, reason string) error {
	hm.mu.Lock()
	req, ok := hm.pending[requestID]
	if !ok {
		hm.mu.Unlock()
		return fmt.Errorf("handoff request %s not found", requestID)
	}

	// Remove from pending
	delete(hm.pending, requestID)
	req.Status = HandoffStateRejected
	req.RespondedAt = time.Now()
	onRejected := hm.onHandoffRejected
	onAfter := hm.onAfterHandoff
	hm.mu.Unlock()

	// Notify callbacks outside lock
	if onRejected != nil {
		onRejected(req)
	}
	if onAfter != nil {
		onAfter(ctx, req, false)
	}

	// Send A2A handoff reject to source agent
	hm.sendA2AHandoff(a2a.MessageTypeHandoffReject, req.ToAgent, req.FromAgent, &a2a.HandoffRejectPayload{
		RequestID: requestID,
		Reason:    reason,
	})

	return nil
}

// CompleteHandoff marks a handoff as completed
func (hm *HandoffManager) CompleteHandoff(ctx context.Context, requestID string) error {
	hm.mu.Lock()
	req, ok := hm.active[requestID]
	if !ok {
		hm.mu.Unlock()
		return fmt.Errorf("active handoff %s not found", requestID)
	}

	// Move to completed
	delete(hm.active, requestID)
	req.Status = HandoffStateCompleted
	hm.completed[requestID] = req

	// Increment handoff depth for the task and check maxDepth limit.
	// If maxDepth is reached, move taskID to the permanent blocked set to prevent
	// bypass (deleting the entry would reset depth to 0 on next request).
	// If maxDepth is NOT reached, clean up tracking to prevent memory leak
	// for tasks that complete normally before hitting the limit.
	hm.handoffDepth[req.TaskID]++
	if hm.handoffDepth[req.TaskID] >= hm.maxDepth {
		hm.handoffDepthBlocked[req.TaskID] = struct{}{}
		delete(hm.handoffDepth, req.TaskID)
	} else {
		delete(hm.handoffDepth, req.TaskID)
		delete(hm.handoffDepthBlocked, req.TaskID)
	}

	// Limit completed handoffs to prevent memory leak (keep last 200)
	const maxCompletedHandoffs = 200
	if len(hm.completed) > maxCompletedHandoffs {
		// Remove oldest entries deterministically: collect IDs, sort by creation time,
		// remove oldest half. Since map iteration is random, we collect first.
		ids := make([]string, 0, len(hm.completed))
		for id := range hm.completed {
			ids = append(ids, id)
		}
		// Sort by creation time (oldest first) using the request's CreatedAt
		sort.Slice(ids, func(i, j int) bool {
			a, b := hm.completed[ids[i]], hm.completed[ids[j]]
			return a.CreatedAt.Before(b.CreatedAt)
		})
		// Remove oldest half
		removeCount := len(ids) - maxCompletedHandoffs/2
		for i := range removeCount {
			delete(hm.completed, ids[i])
		}
	}

	onCompleted := hm.onHandoffCompleted
	onAfter := hm.onAfterHandoff
	hm.mu.Unlock()

	// Notify callbacks outside lock
	if onCompleted != nil {
		onCompleted(req)
	}
	if onAfter != nil {
		onAfter(ctx, req, true)
	}

	// Send A2A handoff complete notification
	hm.sendA2AHandoff(a2a.MessageTypeHandoffComplete, req.ToAgent, req.FromAgent, &a2a.HandoffCompletePayload{
		RequestID: requestID,
	})

	return nil
}

// waitForResponse waits for handoff response with timeout or shutdown signal.
// It listens for: (1) timeout, (2) caller context cancellation, (3) manager shutdown.
func (hm *HandoffManager) waitForResponse(ctx context.Context, req *HandoffRequest) {
	// Capture timeout and ctx under lock to avoid race with Close() / SetHandoffTimeout
	hm.mu.RLock()
	timeout := hm.handoffTimeout
	managerCtx := hm.ctx
	hm.mu.RUnlock()

	timer := time.NewTimer(timeout)
	defer timer.Stop()

	select {
	case <-timer.C:
		// Timeout - auto reject
		hm.mu.Lock()
		if _, ok := hm.pending[req.ID]; ok {
			delete(hm.pending, req.ID)
			req.Status = HandoffStateRejected
		}
		onRejected := hm.onHandoffRejected
		onAfter := hm.onAfterHandoff
		hm.mu.Unlock()

		if onRejected != nil {
			onRejected(req)
		}
		if onAfter != nil {
			onAfter(ctx, req, false)
		}
	case <-ctx.Done():
		// Caller context cancelled - clean up pending state
		hm.mu.Lock()
		if _, ok := hm.pending[req.ID]; ok {
			delete(hm.pending, req.ID)
			req.Status = HandoffStateRejected
		}
		hm.mu.Unlock()
		return
	case <-managerCtx.Done():
		// Manager shutting down - clean up pending state without callbacks
		// (callbacks may not be safe to call during shutdown)
		hm.mu.Lock()
		if _, ok := hm.pending[req.ID]; ok {
			delete(hm.pending, req.ID)
			req.Status = HandoffStateRejected
		}
		hm.mu.Unlock()
		return
	}
}

// GetPendingHandoffs returns deep copies of all pending handoffs
func (hm *HandoffManager) GetPendingHandoffs() []*HandoffRequest {
	hm.mu.RLock()
	defer hm.mu.RUnlock()

	result := make([]*HandoffRequest, 0, len(hm.pending))
	for _, req := range hm.pending {
		result = append(result, req.DeepCopy())
	}
	return result
}

// GetActiveHandoffs returns deep copies of all active handoffs
func (hm *HandoffManager) GetActiveHandoffs() []*HandoffRequest {
	hm.mu.RLock()
	defer hm.mu.RUnlock()

	result := make([]*HandoffRequest, 0, len(hm.active))
	for _, req := range hm.active {
		result = append(result, req.DeepCopy())
	}
	return result
}

// GetCompletedHandoffs returns all completed handoffs
func (hm *HandoffManager) GetHandoffStats() map[HandoffState]int {
	hm.mu.RLock()
	defer hm.mu.RUnlock()

	return map[HandoffState]int{
		HandoffStatePending:   len(hm.pending),
		HandoffStateAccepted:  len(hm.active),
		HandoffStateCompleted: len(hm.completed),
	}
}

// SetOnHandoffRequested sets the callback for handoff request events
func (hm *HandoffManager) SetOnHandoffRequested(fn func(req *HandoffRequest)) {
	hm.mu.Lock()
	defer hm.mu.Unlock()
	hm.onHandoffRequested = fn
}

// SetOnHandoffAccepted sets the callback for handoff acceptance events
func (hm *HandoffManager) SetOnHandoffAccepted(fn func(req *HandoffRequest)) {
	hm.mu.Lock()
	defer hm.mu.Unlock()
	hm.onHandoffAccepted = fn
}

// SetOnHandoffCompleted sets the callback for handoff completion events
func (hm *HandoffManager) SetOnHandoffCompleted(fn func(req *HandoffRequest)) {
	hm.mu.Lock()
	defer hm.mu.Unlock()
	hm.onHandoffCompleted = fn
}

// SetOnHandoffRejected sets the callback for handoff rejection events
func (hm *HandoffManager) SetOnHandoffRejected(fn func(req *HandoffRequest)) {
	hm.mu.Lock()
	defer hm.mu.Unlock()
	hm.onHandoffRejected = fn
}

// SetOnBeforeHandoff sets the pre-handoff hook (OpenAI Swarm on_handoff pattern).
// The hook runs before a handoff request is created. It can:
//   - Return (false, nil, nil) to abort the handoff
//   - Return (true, modifiedCtx, nil) to transform the handoff context
//   - Return (false, nil, err) to abort with an error
func (hm *HandoffManager) SetOnBeforeHandoff(fn HandoffHook) {
	hm.mu.Lock()
	defer hm.mu.Unlock()
	hm.onBeforeHandoff = fn
}

// SetOnAfterHandoff sets the post-handoff hook (OpenAI Swarm after_handoff pattern).
// The hook runs after a handoff completes (success=true) or is rejected/timeout (success=false).
func (hm *HandoffManager) SetOnAfterHandoff(fn func(ctx context.Context, req *HandoffRequest, success bool)) {
	hm.mu.Lock()
	defer hm.mu.Unlock()
	hm.onAfterHandoff = fn
}

// GetHandoffDepth returns the current handoff depth for a task
func (hm *HandoffManager) GetHandoffDepth(taskID string) int {
	hm.mu.RLock()
	defer hm.mu.RUnlock()
	return hm.handoffDepth[taskID]
}

// SetMaxDepth sets the maximum allowed handoff depth
func (hm *HandoffManager) SetMaxDepth(max int) {
	hm.mu.Lock()
	defer hm.mu.Unlock()
	hm.maxDepth = max
}

// SetBroadcaster sets the event broadcaster for handoff streaming to UI.
// When set, handoff events (requested, accepted, rejected, completed) are
// broadcast to connected clients for real-time visibility.
// Implements OpenAI Swarm's handoff streaming pattern.
func (hm *HandoffManager) SetBroadcaster(broadcaster EventBroadcaster) {
	hm.mu.Lock()
	defer hm.mu.Unlock()
	hm.broadcaster = broadcaster

	// Wire callbacks to broadcast events
	if broadcaster != nil {
		hm.onHandoffRequested = func(req *HandoffRequest) {
			broadcaster.Broadcast("handoff_requested", map[string]any{
				"id":        req.ID,
				"fromAgent": req.FromAgent,
				"toAgent":   req.ToAgent,
				"taskId":    req.TaskID,
				"reason":    req.Reason,
				"status":    req.Status,
				"createdAt": req.CreatedAt,
			})
		}
		hm.onHandoffAccepted = func(req *HandoffRequest) {
			broadcaster.Broadcast("handoff_accepted", map[string]any{
				"id":          req.ID,
				"fromAgent":   req.FromAgent,
				"toAgent":     req.ToAgent,
				"taskId":      req.TaskID,
				"respondedAt": req.RespondedAt,
			})
		}
		hm.onHandoffRejected = func(req *HandoffRequest) {
			broadcaster.Broadcast("handoff_rejected", map[string]any{
				"id":          req.ID,
				"fromAgent":   req.FromAgent,
				"toAgent":     req.ToAgent,
				"taskId":      req.TaskID,
				"respondedAt": req.RespondedAt,
			})
		}
		hm.onHandoffCompleted = func(req *HandoffRequest) {
			broadcaster.Broadcast("handoff_completed", map[string]any{
				"id":        req.ID,
				"fromAgent": req.FromAgent,
				"toAgent":   req.ToAgent,
				"taskId":    req.TaskID,
			})
		}
	}
}

// Close cancels all in-flight handoff operations and waits for goroutines to finish.
// Call this during graceful shutdown to prevent goroutine leaks.
// The cancellation signal allows waitForResponse goroutines to exit immediately
// instead of blocking until handoffTimeout (30s).
// Idempotent: safe to call multiple times.
func (hm *HandoffManager) Close() {
	hm.closeOnce.Do(func() {
		if hm.cancel != nil {
			hm.cancel()
		}
		hm.wg.Wait()
	})
}

// ClearTaskDepthTracking clears all depth tracking for a task when it truly completes.
// This should be called when a task is finished (success or failure) to prevent memory leaks
// from tasks that never hit the maxDepth limit.
// It also removes the task from the blocked set, allowing new handoffs if the task is reused.
func (hm *HandoffManager) ClearTaskDepthTracking(taskID string) {
	hm.mu.Lock()
	defer hm.mu.Unlock()
	delete(hm.handoffDepth, taskID)
	delete(hm.handoffDepthBlocked, taskID)
}

// SetHandoffTimeout sets the timeout for handoff responses.
// Thread-safe: can be called at runtime.
func (hm *HandoffManager) SetHandoffTimeout(timeout time.Duration) {
	hm.mu.Lock()
	defer hm.mu.Unlock()
	hm.handoffTimeout = timeout
}

// GetHandoffTimeout returns the current handoff timeout.
func (hm *HandoffManager) GetHandoffTimeout() time.Duration {
	hm.mu.RLock()
	defer hm.mu.RUnlock()
	return hm.handoffTimeout
}

// SetA2ARouter sets the A2A router for inter-agent handoff messaging.
// When set, handoff state transitions are broadcast via A2A messages,
// enabling agents to communicate handoff requests/responses across the network.
func (hm *HandoffManager) SetA2ARouter(router *a2a.Router) {
	hm.mu.Lock()
	defer hm.mu.Unlock()
	hm.a2aRouter = router
}

// sendA2AHandoff sends an A2A handoff message if the router is available.
// This is fire-and-forget: errors are logged but don't block the handoff flow.
func (hm *HandoffManager) sendA2AHandoff(msgType a2a.MessageType, fromAgent, toAgent string, payload any) {
	hm.mu.RLock()
	router := hm.a2aRouter
	hm.mu.RUnlock()

	if router == nil {
		return
	}

	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		handoffLog.Debug("A2A handoff payload marshal failed", "type", msgType, "error", err)
		return
	}

	msg := a2a.NewMessage(msgType, fromAgent, toAgent).
		WithPayload(json.RawMessage(payloadJSON))

	if err := router.Enqueue(msg); err != nil {
		handoffLog.Debug("A2A handoff enqueue failed", "type", msgType, "error", err)
	}
}

// toA2AHandoffContext converts a swarm HandoffContext to an A2A HandoffContextData.
func toA2AHandoffContext(ctx *HandoffContext) a2a.HandoffContextData {
	if ctx == nil {
		return a2a.HandoffContextData{}
	}
	result := a2a.HandoffContextData{
		CurrentState: ctx.CurrentState,
		Instructions: ctx.Instructions,
	}
	if ctx.FilesModified != nil {
		result.FilesModified = make([]string, len(ctx.FilesModified))
		copy(result.FilesModified, ctx.FilesModified)
	}
	if ctx.NextSteps != nil {
		result.NextSteps = make([]string, len(ctx.NextSteps))
		copy(result.NextSteps, ctx.NextSteps)
	}
	if ctx.Metadata != nil {
		result.Metadata = maps.Clone(ctx.Metadata)
	}
	// Convert ContentBlocks to []map[string]any for A2A transport
	if ctx.ConversationHistory != nil {
		result.ConversationHistory = make([]map[string]any, 0, len(ctx.ConversationHistory))
		for _, block := range ctx.ConversationHistory {
			m := map[string]any{
				"type": block.Type,
			}
			if block.Text != "" {
				m["text"] = block.Text
			}
			result.ConversationHistory = append(result.ConversationHistory, m)
		}
	}
	return result
}

// IsTaskDepthBlocked returns true if the task has hit the depth limit and is permanently blocked.
func (hm *HandoffManager) IsTaskDepthBlocked(taskID string) bool {
	hm.mu.RLock()
	defer hm.mu.RUnlock()
	_, blocked := hm.handoffDepthBlocked[taskID]
	return blocked
}

func generateHandoffID() string {
	return utils.GenerateID("handoff")
}

// MergeContextVariables merges new variables into the existing context variables.
// For slice values with the same key, values are concatenated (not replaced).
// For other types, new values overwrite existing ones.
// This implements the OpenAI Swarm pattern where context_variables accumulate
// across handoff chains, allowing each agent to build on state from previous agents.
func (hc *HandoffContext) MergeContextVariables(newVars map[string]any) map[string]any {
	if len(newVars) == 0 {
		return hc.ContextVariables
	}

	// Copy-on-write: create a new map to avoid mutating shared state
	merged := make(map[string]any, len(hc.ContextVariables)+len(newVars))
	maps.Copy(merged, hc.ContextVariables)
	for k, v := range newVars {
		if existing, ok := merged[k]; ok {
			// Deep merge: concatenate slices, overwrite other types
			existingSlice, isExistingSlice := toSlice(existing)
			newSlice, isNewSlice := toSlice(v)
			if isExistingSlice && isNewSlice {
				result := make([]any, 0, len(existingSlice)+len(newSlice))
				result = append(result, existingSlice...)
				result = append(result, newSlice...)
				merged[k] = result
				continue
			}
		}
		merged[k] = v
	}
	hc.ContextVariables = merged
	return merged
}

// DeepCopy creates a deep copy of the HandoffContext to prevent shared mutable state.
// This is critical because HandoffRequest.Context is a pointer and maps/slices are
// mutable - callers could otherwise modify internal state through returned copies.
func (hc *HandoffContext) DeepCopy() *HandoffContext {
	if hc == nil {
		return nil
	}
	clone := &HandoffContext{
		CurrentState: hc.CurrentState,
		Instructions: hc.Instructions,
	}
	// Deep copy slices
	if hc.ConversationHistory != nil {
		clone.ConversationHistory = make([]acp.ContentBlock, len(hc.ConversationHistory))
		copy(clone.ConversationHistory, hc.ConversationHistory)
	}
	if hc.FilesModified != nil {
		clone.FilesModified = make([]string, len(hc.FilesModified))
		copy(clone.FilesModified, hc.FilesModified)
	}
	if hc.NextSteps != nil {
		clone.NextSteps = make([]string, len(hc.NextSteps))
		copy(clone.NextSteps, hc.NextSteps)
	}
	// Deep copy maps
	if hc.Metadata != nil {
		clone.Metadata = maps.Clone(hc.Metadata)
	}
	if hc.ContextVariables != nil {
		clone.ContextVariables = maps.Clone(hc.ContextVariables)
	}
	return clone
}

// DeepCopy creates a deep copy of the HandoffRequest, including its Context pointer.
func (r *HandoffRequest) DeepCopy() *HandoffRequest {
	if r == nil {
		return nil
	}
	clone := &HandoffRequest{
		ID:          r.ID,
		FromAgent:   r.FromAgent,
		ToAgent:     r.ToAgent,
		TaskID:      r.TaskID,
		Reason:      r.Reason,
		Context:     r.Context.DeepCopy(),
		Status:      r.Status,
		CreatedAt:   r.CreatedAt,
		RespondedAt: r.RespondedAt,
	}
	return clone
}

// toSlice attempts to convert a value to []any for deep merge
func toSlice(v any) ([]any, bool) {
	switch s := v.(type) {
	case []any:
		return s, true
	case []string:
		result := make([]any, len(s))
		for i, v := range s {
			result[i] = v
		}
		return result, true
	}
	return nil, false
}

// GetContextVariable retrieves a single context variable
func (hc *HandoffContext) GetContextVariable(key string) (any, bool) {
	if hc.ContextVariables == nil {
		return nil, false
	}
	val, ok := hc.ContextVariables[key]
	return val, ok
}

// SetContextVariable sets a single context variable
func (hc *HandoffContext) SetContextVariable(key string, value any) {
	if hc.ContextVariables == nil {
		hc.ContextVariables = make(map[string]any)
	}
	hc.ContextVariables[key] = value
}
