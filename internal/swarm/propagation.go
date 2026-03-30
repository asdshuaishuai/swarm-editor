// Package swarm implements context propagation for trace-aware task dispatching
package swarm

import (
	"context"
	"fmt"
	"maps"
	"slices"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/pkg/utils"
)

// PropagationContext carries request-scoped metadata across agent boundaries.
// Inspired by OpenTelemetry trace propagation, but lightweight and zero-dependency.
// Can later be bridged to OpenTelemetry for production distributed tracing.
// Thread-safe: RecordAgent is protected by mutex.
type PropagationContext struct {
	mu          sync.Mutex        `json:"-"`
	TraceID     string            `json:"traceId"`
	ParentSpan  string            `json:"parentSpan,omitempty"`
	TaskLineage []string          `json:"taskLineage"` // ancestor task IDs
	AgentChain  []string          `json:"agentChain"`  // agents that handled this
	Labels      map[string]string `json:"labels,omitempty"`
	Deadline    time.Time         `json:"deadline,omitempty"`
}

type propagationKey struct{}

// WithPropagation attaches propagation context to a Go context
func WithPropagation(ctx context.Context, pc *PropagationContext) context.Context {
	return context.WithValue(ctx, propagationKey{}, pc)
}

// PropagationFrom extracts propagation context from a Go context.
// Returns nil if no propagation context is set (safe to call unconditionally).
func PropagationFrom(ctx context.Context) *PropagationContext {
	pc, _ := ctx.Value(propagationKey{}).(*PropagationContext)
	return pc
}

// NewPropagationContext creates a propagation context with a new trace ID.
// If traceID is empty, a unique ID is generated from timestamp.
func NewPropagationContext(traceID string) *PropagationContext {
	if traceID == "" {
		traceID = utils.GenerateID("trace")
	}
	return &PropagationContext{
		TraceID:     traceID,
		TaskLineage: make([]string, 0),
		AgentChain:  make([]string, 0),
		Labels:      make(map[string]string),
	}
}

// Child creates a child propagation context for a subtask or agent handoff.
// The child inherits the trace ID and builds on the parent's lineage and agent chain.
func (pc *PropagationContext) Child(taskID string, agentID string) *PropagationContext {
	// Snapshot all mutable fields under lock (RecordAgent may be writing concurrently)
	pc.mu.Lock()
	agentChain := make([]string, len(pc.AgentChain))
	copy(agentChain, pc.AgentChain)
	labels := make(map[string]string, len(pc.Labels))
	maps.Copy(labels, pc.Labels)
	// MEDIUM FIX: TaskLineage also needs to be captured under lock
	taskLineage := make([]string, len(pc.TaskLineage))
	copy(taskLineage, pc.TaskLineage)
	pc.mu.Unlock()

	child := &PropagationContext{
		TraceID:     pc.TraceID,
		ParentSpan:  fmt.Sprintf("%s/%s", pc.ParentSpan, taskID),
		TaskLineage: append(taskLineage, taskID),
		AgentChain:  append(agentChain, agentID),
		Labels:      labels,
	}
	return child
}

// PropagateDeadline applies the propagation context's deadline to a Go context.
// Returns the original context unchanged if no deadline is set.
func (pc *PropagationContext) PropagateDeadline(ctx context.Context) (context.Context, context.CancelFunc) {
	if pc.Deadline.IsZero() {
		return ctx, func() {}
	}
	return context.WithDeadline(ctx, pc.Deadline)
}

// RecordAgent adds an agent to the chain (deduplicated).
func (pc *PropagationContext) RecordAgent(agentID string) {
	pc.mu.Lock()
	defer pc.mu.Unlock()
	if slices.Contains(pc.AgentChain, agentID) {
		return
	}
	pc.AgentChain = append(pc.AgentChain, agentID)
}

// String returns a human-readable representation of the propagation context.
func (pc *PropagationContext) String() string {
	if pc == nil {
		return "PropagationContext(nil)"
	}
	pc.mu.Lock()
	defer pc.mu.Unlock()
	return fmt.Sprintf("PropagationContext{trace=%s, span=%s, lineage=%v, agents=%v}",
		pc.TraceID, pc.ParentSpan, pc.TaskLineage, pc.AgentChain)
}
