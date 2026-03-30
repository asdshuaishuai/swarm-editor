// Package swarm provides multi-agent coordination
package swarm

import (
	"sync"
	"time"
)

// FailureType classifies node failures for observability
type FailureType string

const (
	// FailureTypeTimeout indicates context deadline exceeded
	FailureTypeTimeout FailureType = "timeout"
	// FailureTypeAgentError indicates agent returned an error
	FailureTypeAgentError FailureType = "agent_error"
	// FailureTypeValidation indicates node config validation failed
	FailureTypeValidation FailureType = "validation"
	// FailureTypeCancelled indicates workflow/context was cancelled
	FailureTypeCancelled FailureType = "cancelled"
	// FailureTypeInterrupt indicates workflow paused for human-in-the-loop
	FailureTypeInterrupt FailureType = "interrupt"
	// FailureTypeSystem indicates internal system error
	FailureTypeSystem FailureType = "system"
	// FailureTypeUnknown indicates unclassified error
	FailureTypeUnknown FailureType = "unknown"
)

// NodeFailure represents a single node's failure details
type NodeFailure struct {
	NodeID       string      `json:"nodeId"`
	FailureType  FailureType `json:"failureType"`
	ErrorMessage string      `json:"errorMessage"`
	ErrorCode    string      `json:"errorCode,omitempty"`
	Retryable    bool        `json:"retryable"`
	Timestamp    time.Time   `json:"timestamp"`
	DurationMs   float64     `json:"durationMs"`
}

// NodeResult represents a successfully completed node's output
type NodeResult struct {
	NodeID      string    `json:"nodeId"`
	Status      string    `json:"status"`
	Result      any       `json:"result,omitempty"`
	StartedAt   time.Time `json:"startedAt,omitempty"`
	CompletedAt time.Time `json:"completedAt,omitempty"`
	DurationMs  float64   `json:"durationMs"`
}

// SkippedNode represents a node that was skipped due to dependency failure
type SkippedNode struct {
	NodeID    string    `json:"nodeId"`
	Reason    string    `json:"reason"`
	SkippedAt time.Time `json:"skippedAt"`
}

// WorkflowExecutionReport provides comprehensive execution metadata
// Inspired by Temporal's workflow history for error observability.
// Thread-safe: all mutating methods are protected by mutex.
type WorkflowExecutionReport struct {
	mu sync.RWMutex `json:"-"`

	// Identity
	WorkflowID  string    `json:"workflowId"`
	ExecutionID string    `json:"executionId"`
	CreatedAt   time.Time `json:"createdAt"`

	// Summary
	Status     string `json:"status"`
	Mode       string `json:"mode"`
	DurationMs float64 `json:"durationMs"`

	// Node outcomes
	SucceededNodes []NodeResult  `json:"succeededNodes,omitempty"`
	FailedNodes    []NodeFailure `json:"failedNodes,omitempty"`
	SkippedNodes   []SkippedNode `json:"skippedNodes,omitempty"`

	// Error summary
	TotalNodes   int `json:"totalNodes"`
	SuccessCount int `json:"successCount"`
	FailureCount int `json:"failureCount"`
	SkippedCount int `json:"skippedCount"`

	// For recovery
	CheckpointID string `json:"checkpointId,omitempty"`

	// Root cause (first failure that triggered cascade)
	RootCause *NodeFailure `json:"rootCause,omitempty"`
}

// NewWorkflowExecutionReport creates a new report for a workflow
func NewWorkflowExecutionReport(workflowID string, mode OrchestrationMode) *WorkflowExecutionReport {
	return &WorkflowExecutionReport{
		WorkflowID:     workflowID,
		ExecutionID:    "exec-" + time.Now().Format("20060102-150405.999"),
		CreatedAt:      time.Now(),
		Mode:           string(mode),
		Status:         "running",
		SucceededNodes: make([]NodeResult, 0),
		FailedNodes:    make([]NodeFailure, 0),
		SkippedNodes:   make([]SkippedNode, 0),
	}
}

// AddSuccess records a successful node execution
func (r *WorkflowExecutionReport) AddSuccess(nodeID string, result any, startedAt, completedAt time.Time) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.SuccessCount++
	r.SucceededNodes = append(r.SucceededNodes, NodeResult{
		NodeID:      nodeID,
		Status:      "completed",
		Result:      result,
		StartedAt:   startedAt,
		CompletedAt: completedAt,
		DurationMs:  float64(completedAt.Sub(startedAt).Milliseconds()),
	})
}

// AddFailure records a failed node execution
func (r *WorkflowExecutionReport) AddFailure(nodeID string, failureType FailureType, errMsg string, startedAt time.Time, durationMs float64) {
	r.mu.Lock()
	defer r.mu.Unlock()

	failure := NodeFailure{
		NodeID:       nodeID,
		FailureType:  failureType,
		ErrorMessage: errMsg,
		Retryable:    failureType == FailureTypeTimeout || failureType == FailureTypeAgentError,
		Timestamp:    time.Now(),
		DurationMs:   durationMs,
	}
	r.FailureCount++
	r.FailedNodes = append(r.FailedNodes, failure)

	// First failure is root cause.
	// IMPORTANT: We must store a COPY, not a pointer into the slice.
	// &r.FailedNodes[i] would become dangling when a future append()
	// reallocates the backing array. Taking a value copy and addressing it
	// forces Go's escape analysis to heap-allocate the copy, making it safe.
	if r.RootCause == nil {
		rootCause := r.FailedNodes[len(r.FailedNodes)-1] // value copy
		r.RootCause = &rootCause                        // heap-escaped via escape analysis
	}
}

// AddSkipped records a skipped node
func (r *WorkflowExecutionReport) AddSkipped(nodeID, reason string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.SkippedCount++
	r.SkippedNodes = append(r.SkippedNodes, SkippedNode{
		NodeID:    nodeID,
		Reason:    reason,
		SkippedAt: time.Now(),
	})
}

// SetTotal sets the total node count
func (r *WorkflowExecutionReport) SetTotal(total int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.TotalNodes = total
}

// Finalize calculates final status and duration
func (r *WorkflowExecutionReport) Finalize(status string, durationMs float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Status = status
	r.DurationMs = durationMs
}

// HasFailures returns true if any nodes failed
func (r *WorkflowExecutionReport) HasFailures() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.FailureCount > 0
}

// IsComplete returns true if all nodes succeeded
func (r *WorkflowExecutionReport) IsComplete() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.FailureCount == 0 && r.SkippedCount == 0
}

// Snapshot returns a consistent snapshot of the report for reading.
// Thread-safe: acquires read lock and copies all data.
func (r *WorkflowExecutionReport) Snapshot() WorkflowExecutionReport {
	r.mu.RLock()
	defer r.mu.RUnlock()

	// Copy slices to avoid external modifications
	succeeded := make([]NodeResult, len(r.SucceededNodes))
	copy(succeeded, r.SucceededNodes)

	failed := make([]NodeFailure, len(r.FailedNodes))
	copy(failed, r.FailedNodes)

	skipped := make([]SkippedNode, len(r.SkippedNodes))
	copy(skipped, r.SkippedNodes)

	var rootCause *NodeFailure
	if r.RootCause != nil {
		rc := *r.RootCause // copy
		rootCause = &rc
	}

	return WorkflowExecutionReport{
		WorkflowID:     r.WorkflowID,
		ExecutionID:    r.ExecutionID,
		CreatedAt:      r.CreatedAt,
		Status:         r.Status,
		Mode:           r.Mode,
		DurationMs:     r.DurationMs,
		SucceededNodes: succeeded,
		FailedNodes:    failed,
		SkippedNodes:   skipped,
		TotalNodes:     r.TotalNodes,
		SuccessCount:   r.SuccessCount,
		FailureCount:   r.FailureCount,
		SkippedCount:   r.SkippedCount,
		CheckpointID:   r.CheckpointID,
		RootCause:      rootCause,
	}
}
