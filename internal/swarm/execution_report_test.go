package swarm

import (
	"testing"
	"time"
)

func TestNewWorkflowExecutionReport(t *testing.T) {
	r := NewWorkflowExecutionReport("wf-1", ModeSequential)
	if r.WorkflowID != "wf-1" {
		t.Errorf("WorkflowID = %q, want 'wf-1'", r.WorkflowID)
	}
	if r.Mode != "sequential" {
		t.Errorf("Mode = %q, want 'sequential'", r.Mode)
	}
	if r.Status != "running" {
		t.Errorf("Status = %q, want 'running'", r.Status)
	}
	if r.ExecutionID == "" {
		t.Error("ExecutionID should not be empty")
	}
	if r.CreatedAt.IsZero() {
		t.Error("CreatedAt should not be zero")
	}
}

func TestAddSuccess(t *testing.T) {
	r := NewWorkflowExecutionReport("wf-1", ModeSequential)
	now := time.Now()
	r.AddSuccess("n1", "result-data", now, now.Add(100*time.Millisecond))
	r.AddSuccess("n2", nil, now, now.Add(50*time.Millisecond))

	if r.SuccessCount != 2 {
		t.Errorf("SuccessCount = %d, want 2", r.SuccessCount)
	}
	if len(r.SucceededNodes) != 2 {
		t.Errorf("SucceededNodes len = %d, want 2", len(r.SucceededNodes))
	}
	if r.SucceededNodes[0].NodeID != "n1" {
		t.Errorf("SucceededNodes[0].NodeID = %q, want 'n1'", r.SucceededNodes[0].NodeID)
	}
	if r.SucceededNodes[0].DurationMs != 100 {
		t.Errorf("SucceededNodes[0].DurationMs = %f, want 100", r.SucceededNodes[0].DurationMs)
	}
}

func TestAddFailure(t *testing.T) {
	r := NewWorkflowExecutionReport("wf-1", ModeSequential)
	r.AddFailure("n1", FailureTypeTimeout, "context deadline", time.Now(), 5000)

	if r.FailureCount != 1 {
		t.Errorf("FailureCount = %d, want 1", r.FailureCount)
	}
	if len(r.FailedNodes) != 1 {
		t.Errorf("FailedNodes len = %d, want 1", len(r.FailedNodes))
	}
	f := r.FailedNodes[0]
	if f.NodeID != "n1" {
		t.Errorf("NodeID = %q, want 'n1'", f.NodeID)
	}
	if f.FailureType != FailureTypeTimeout {
		t.Errorf("FailureType = %q, want 'timeout'", f.FailureType)
	}
	// Timeout and AgentError are retryable
	if !f.Retryable {
		t.Error("timeout failure should be retryable")
	}

	// First failure becomes root cause
	if r.RootCause == nil {
		t.Fatal("RootCause should be set automatically")
	}
	if r.RootCause.NodeID != "n1" {
		t.Errorf("RootCause.NodeID = %q, want 'n1'", r.RootCause.NodeID)
	}
}

func TestAddFailure_SystemNotRetryable(t *testing.T) {
	r := NewWorkflowExecutionReport("wf-1", ModeSequential)
	r.AddFailure("n1", FailureTypeSystem, "internal error", time.Now(), 100)

	if r.FailedNodes[0].Retryable {
		t.Error("system failure should not be retryable")
	}
}

func TestAddSkipped(t *testing.T) {
	r := NewWorkflowExecutionReport("wf-1", ModeSequential)
	r.AddSkipped("n1", "dependency failed")

	if r.SkippedCount != 1 {
		t.Errorf("SkippedCount = %d, want 1", r.SkippedCount)
	}
	if len(r.SkippedNodes) != 1 {
		t.Errorf("SkippedNodes len = %d, want 1", len(r.SkippedNodes))
	}
	if r.SkippedNodes[0].Reason != "dependency failed" {
		t.Errorf("Reason = %q, want 'dependency failed'", r.SkippedNodes[0].Reason)
	}
	if r.SkippedNodes[0].SkippedAt.IsZero() {
		t.Error("SkippedAt should not be zero")
	}
}

func TestSetTotal(t *testing.T) {
	r := NewWorkflowExecutionReport("wf-1", ModeSequential)
	r.SetTotal(10)
	if r.TotalNodes != 10 {
		t.Errorf("TotalNodes = %d, want 10", r.TotalNodes)
	}
}

func TestFinalize(t *testing.T) {
	r := NewWorkflowExecutionReport("wf-1", ModeSequential)
	r.Finalize("completed", 1234.5)
	if r.Status != "completed" {
		t.Errorf("Status = %q, want 'completed'", r.Status)
	}
	if r.DurationMs != 1234.5 {
		t.Errorf("DurationMs = %f, want 1234.5", r.DurationMs)
	}
}

func TestHasFailures(t *testing.T) {
	r := NewWorkflowExecutionReport("wf-1", ModeSequential)
	if r.HasFailures() {
		t.Error("empty report should not have failures")
	}

	r.AddFailure("n1", FailureTypeAgentError, "error", time.Now(), 0)
	if !r.HasFailures() {
		t.Error("report with failure should have failures")
	}
}

func TestIsComplete(t *testing.T) {
	r := NewWorkflowExecutionReport("wf-1", ModeSequential)
	if !r.IsComplete() {
		t.Error("empty report should be complete")
	}

	r.AddFailure("n1", FailureTypeAgentError, "error", time.Now(), 0)
	if r.IsComplete() {
		t.Error("report with failure should not be complete")
	}

	r2 := NewWorkflowExecutionReport("wf-2", ModeSequential)
	r2.AddSkipped("n1", "reason")
	if r2.IsComplete() {
		t.Error("report with skipped should not be complete")
	}
}

func TestSnapshot(t *testing.T) {
	r := NewWorkflowExecutionReport("wf-1", ModeSequential)
	now := time.Now()
	r.AddSuccess("n1", "result", now, now.Add(100*time.Millisecond))
	r.AddFailure("n2", FailureTypeTimeout, "timeout", now, 100)
	r.AddSkipped("n3", "dep")
	r.SetTotal(3)

	snap := r.Snapshot()
	if snap.WorkflowID != "wf-1" {
		t.Errorf("Snapshot.WorkflowID = %q", snap.WorkflowID)
	}
	if snap.TotalNodes != 3 {
		t.Errorf("Snapshot.TotalNodes = %d, want 3", snap.TotalNodes)
	}
	if len(snap.SucceededNodes) != 1 {
		t.Errorf("Snapshot.SucceededNodes len = %d, want 1", len(snap.SucceededNodes))
	}
	if len(snap.FailedNodes) != 1 {
		t.Errorf("Snapshot.FailedNodes len = %d, want 1", len(snap.FailedNodes))
	}
	if len(snap.SkippedNodes) != 1 {
		t.Errorf("Snapshot.SkippedNodes len = %d, want 1", len(snap.SkippedNodes))
	}
	if snap.RootCause == nil {
		t.Error("Snapshot should have RootCause")
	}

	// Verify independence — modifying original should not affect snapshot
	r.AddSuccess("n4", "more data", now, now.Add(50*time.Millisecond))
	if len(snap.SucceededNodes) != 1 {
		t.Error("snapshot should be independent of original")
	}
}

func TestFailureTypeValues(t *testing.T) {
	types := []FailureType{
		FailureTypeTimeout, FailureTypeAgentError, FailureTypeValidation,
		FailureTypeCancelled, FailureTypeInterrupt, FailureTypeSystem, FailureTypeUnknown,
	}
	for _, ft := range types {
		if ft == "" {
			t.Errorf("FailureType should not be empty")
		}
	}
}

func TestNodeFailureStruct(t *testing.T) {
	nf := NodeFailure{
		NodeID:       "n1",
		FailureType:  FailureTypeAgentError,
		ErrorMessage: "test error",
		ErrorCode:    "ERR_001",
		Retryable:    true,
		DurationMs:   100.5,
	}
	if nf.NodeID != "n1" || !nf.Retryable {
		t.Error("NodeFailure struct fields mismatch")
	}
}

func TestNodeResultStruct(t *testing.T) {
	nr := NodeResult{
		NodeID:     "n1",
		Status:     "completed",
		Result:     "data",
		DurationMs: 50.0,
	}
	if nr.NodeID != "n1" || nr.Status != "completed" {
		t.Error("NodeResult struct fields mismatch")
	}
}

func TestSkippedNodeStruct(t *testing.T) {
	sn := SkippedNode{
		NodeID:    "n1",
		Reason:    "dep failed",
		SkippedAt: time.Now(),
	}
	if sn.NodeID != "n1" || sn.Reason != "dep failed" {
		t.Error("SkippedNode struct fields mismatch")
	}
}
