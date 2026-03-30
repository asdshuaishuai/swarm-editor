// Package swarm provides multi-agent coordination
package swarm

import (
	"errors"
	"fmt"
)

// InterruptError is returned when workflow execution hits an interrupt point.
// The workflow is paused and awaiting resume via ResumeWorkflow.
// Inspired by LangGraph's human-in-the-loop interrupt pattern.
type InterruptError struct {
	NodeID string // The node where interrupt occurred
	Phase  string // "before" or "after"
}

// NewInterruptError creates a new interrupt error
func NewInterruptError(nodeID, phase string) *InterruptError {
	return &InterruptError{
		NodeID: nodeID,
		Phase:  phase,
	}
}

func (e *InterruptError) Error() string {
	return fmt.Sprintf("workflow interrupted at node %q (phase: %s)", e.NodeID, e.Phase)
}

// IsInterruptError returns true if err is or wraps an InterruptError.
// Uses standard errors.As for full compatibility with wrapped errors
// (fmt.Errorf "%w", errors.Join, multi-layer wrapping).
func IsInterruptError(err error) bool {
	if err == nil {
		return false
	}
	var ie *InterruptError
	return errors.As(err, &ie)
}
