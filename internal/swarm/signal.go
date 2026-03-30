// Package swarm provides workflow signal/query support
// Inspired by Temporal's Signal and Query APIs:
// - Signal: external events injected into a running workflow (fire-and-forget)
// - Query: synchronous queries to inspect running workflow state
package swarm

import (
	"context"
	"fmt"
	"log"
	"maps"
	"sync"
	"time"
)

// Signal represents an external event injected into a workflow.
// Inspired by Temporal's SignalWorkflow API.
type Signal struct {
	Name      string    `json:"name"`
	Input     any       `json:"input,omitempty"`
	Timestamp time.Time `json:"timestamp"`
	Source    string    `json:"source,omitempty"`
}

// DeepCopy creates a deep copy of the Signal to prevent mutation of shared state.
func (s *Signal) DeepCopy() *Signal {
	if s == nil {
		return nil
	}
	return &Signal{
		Name:      s.Name,
		Input:     deepCopyAny(s.Input),
		Timestamp: s.Timestamp,
		Source:    s.Source,
	}
}

// QueryRequest represents a query to inspect workflow state.
// Inspired by Temporal's QueryWorkflow API.
type QueryRequest struct {
	QueryType string `json:"queryType"`
	Args      any    `json:"args,omitempty"`
}

// QueryResponse represents the result of a workflow query.
type QueryResponse struct {
	Result    any       `json:"result"`
	Timestamp time.Time `json:"timestamp"`
	Error     string    `json:"error,omitempty"`
}

// SignalHandler processes a signal delivered to a workflow.
// Returns updated node configuration or nil if no action needed.
type SignalHandler func(ctx context.Context, workflow *Workflow, signal *Signal) error

// QueryHandler responds to a query about a running workflow.
type QueryHandler func(ctx context.Context, workflow *Workflow, query *QueryRequest) (*QueryResponse, error)

// SignalBus manages signals and queries for running workflows.
// Inspired by Temporal's signal/query mechanism for external workflow interaction.
type SignalBus struct {
	mu sync.RWMutex

	// Signal handlers registered per signal name
	signalHandlers map[string]SignalHandler

	// Query handlers registered per query type
	queryHandlers map[string]QueryHandler

	// Signal buffers for workflows (workflowID -> buffered signals)
	pendingSignals map[string][]*Signal

	// Max buffered signals per workflow before dropping
	maxBufferedSignals int
}

// NewSignalBus creates a new signal bus.
func NewSignalBus() *SignalBus {
	return &SignalBus{
		signalHandlers:     make(map[string]SignalHandler),
		queryHandlers:      make(map[string]QueryHandler),
		pendingSignals:     make(map[string][]*Signal),
		maxBufferedSignals: 100,
	}
}

// RegisterSignalHandler registers a handler for a named signal.
func (sb *SignalBus) RegisterSignalHandler(name string, handler SignalHandler) {
	sb.mu.Lock()
	defer sb.mu.Unlock()
	sb.signalHandlers[name] = handler
}

// RegisterQueryHandler registers a handler for a named query type.
func (sb *SignalBus) RegisterQueryHandler(queryType string, handler QueryHandler) {
	sb.mu.Lock()
	defer sb.mu.Unlock()
	sb.queryHandlers[queryType] = handler
}

// SendSignal buffers a signal for a running workflow.
// The signal will be processed on the next executeNode call.
func (sb *SignalBus) SendSignal(workflowID string, signal *Signal) error {
	if workflowID == "" {
		return fmt.Errorf("workflow ID is required")
	}
	if signal == nil {
		return fmt.Errorf("signal cannot be nil")
	}
	if signal.Name == "" {
		return fmt.Errorf("signal name is required")
	}

	sb.mu.Lock()
	defer sb.mu.Unlock()

	// MEDIUM: Deep copy signal to avoid data race on caller's mutable object.
	// The caller retains their original signal and could mutate it concurrently.
	signal = signal.DeepCopy()

	// Fill timestamp on our copy (not caller's object)
	if signal.Timestamp.IsZero() {
		signal.Timestamp = time.Now()
	}

	// Drop oldest if buffer is full
	signals := sb.pendingSignals[workflowID]
	if len(signals) >= sb.maxBufferedSignals {
		log.Printf("[SignalBus] buffer full for workflow %q, dropping oldest signal %q", workflowID, signal.Name)
		sb.pendingSignals[workflowID] = append(signals[1:], signal)
	} else {
		sb.pendingSignals[workflowID] = append(signals, signal)
	}

	return nil
}

// DrainSignals retrieves and removes all pending signals for a workflow.
// Called by the orchestrator during node execution.
func (sb *SignalBus) DrainSignals(workflowID string) []*Signal {
	sb.mu.Lock()
	defer sb.mu.Unlock()

	signals := sb.pendingSignals[workflowID]
	if len(signals) == 0 {
		return nil
	}
	sb.pendingSignals[workflowID] = nil
	return signals
}

// PeekSignals returns a deep copy of pending signals without removing them.
// Use when you need to inspect signals before ProcessSignals consumes them.
func (sb *SignalBus) PeekSignals(workflowID string) []*Signal {
	sb.mu.RLock()
	defer sb.mu.RUnlock()

	signals := sb.pendingSignals[workflowID]
	if len(signals) == 0 {
		return nil
	}
	result := make([]*Signal, len(signals))
	for i, sig := range signals {
		result[i] = sig.DeepCopy()
	}
	return result
}

// RemoveSignal removes a specific signal by name from the pending buffer.
// Returns true if a signal was found and removed.
func (sb *SignalBus) RemoveSignal(workflowID string, signalName string) bool {
	sb.mu.Lock()
	defer sb.mu.Unlock()

	signals := sb.pendingSignals[workflowID]
	for i, sig := range signals {
		if sig.Name == signalName {
			sb.pendingSignals[workflowID] = append(signals[:i], signals[i+1:]...)
			return true
		}
	}
	return false
}

// Query executes a synchronous query against a running workflow.
func (sb *SignalBus) Query(ctx context.Context, workflow *Workflow, req *QueryRequest) (*QueryResponse, error) {
	if workflow == nil {
		return nil, fmt.Errorf("workflow cannot be nil")
	}
	if req == nil {
		return nil, fmt.Errorf("query request cannot be nil")
	}
	if req.QueryType == "" {
		return nil, fmt.Errorf("query type is required")
	}

	sb.mu.RLock()
	handler, ok := sb.queryHandlers[req.QueryType]
	sb.mu.RUnlock()

	if !ok {
		return &QueryResponse{
			Error:     fmt.Sprintf("no handler registered for query type %q", req.QueryType),
			Timestamp: time.Now(),
		}, nil
	}

	resp, err := handler(ctx, workflow, req)
	if err != nil {
		return nil, fmt.Errorf("query handler error: %w", err)
	}

	if resp == nil {
		return &QueryResponse{Timestamp: time.Now()}, nil
	}
	if resp.Timestamp.IsZero() {
		resp.Timestamp = time.Now()
	}
	return resp, nil
}

// ProcessSignals processes buffered signals for a workflow.
// Called by the orchestrator to handle signals between node executions.
func (sb *SignalBus) ProcessSignals(ctx context.Context, workflow *Workflow) error {
	signals := sb.DrainSignals(workflow.ID)
	if len(signals) == 0 {
		return nil
	}

	sb.mu.RLock()
	handlers := make(map[string]SignalHandler, len(sb.signalHandlers))
	maps.Copy(handlers, sb.signalHandlers)
	sb.mu.RUnlock()

	for _, signal := range signals {
		handler, ok := handlers[signal.Name]
		if !ok {
			continue
		}
		if err := handler(ctx, workflow, signal); err != nil {
			return fmt.Errorf("signal handler %q error: %w", signal.Name, err)
		}
	}

	return nil
}

// GetPendingSignalCount returns the number of buffered signals for a workflow.
func (sb *SignalBus) GetPendingSignalCount(workflowID string) int {
	sb.mu.RLock()
	defer sb.mu.RUnlock()
	return len(sb.pendingSignals[workflowID])
}

// ClearWorkflowSignals removes all pending signals for a workflow.
// Should be called when a workflow is deleted to prevent memory leaks.
func (sb *SignalBus) ClearWorkflowSignals(workflowID string) {
	sb.mu.Lock()
	defer sb.mu.Unlock()
	delete(sb.pendingSignals, workflowID)
}

// SetMaxBufferedSignals sets the maximum number of buffered signals per workflow.
// If max < 1, it defaults to 1 to prevent panic in SendSignal.
func (sb *SignalBus) SetMaxBufferedSignals(max int) {
	if max < 1 {
		max = 1
	}
	sb.mu.Lock()
	defer sb.mu.Unlock()
	sb.maxBufferedSignals = max
}
