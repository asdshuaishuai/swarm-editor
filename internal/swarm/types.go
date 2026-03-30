// Package swarm defines shared types for the swarm system
package swarm

import (
	"encoding/json"
	"time"
)

// TaskStatus represents the status of a task
type TaskStatus string

const (
	TaskStatusPending   TaskStatus = "pending"
	TaskStatusRunning   TaskStatus = "running"
	TaskStatusCompleted TaskStatus = "completed"
	TaskStatusFailed    TaskStatus = "failed"
	TaskStatusRetrying  TaskStatus = "retrying"
	TaskStatusCancelled TaskStatus = "cancelled"

	// Intermediate states (Google A2A pattern: distinguish terminal vs in-progress)
	TaskStatusDecomposing TaskStatus = "decomposing"
	TaskStatusAssigned    TaskStatus = "assigned"
	TaskStatusConsensus   TaskStatus = "consensus"
)

// IsTerminal returns true if the status represents a final, non-reversible state.
// Inspired by Google A2A protocol's terminal state distinction:
// TASK_STATE_COMPLETED, TASK_STATE_FAILED, TASK_STATE_CANCELED, TASK_STATE_REJECTED
// are all terminal and cannot transition to any other state.
func (s TaskStatus) IsTerminal() bool {
	switch s {
	case TaskStatusCompleted, TaskStatusFailed, TaskStatusCancelled:
		return true
	}
	return false
}

// IsInterrupted returns true if the task is waiting for external input.
// Inspired by Google A2A's TASK_STATE_INPUT_REQUIRED and TASK_STATE_AUTH_REQUIRED.
func (s TaskStatus) IsInterrupted() bool {
	return false // Reserved for future: "input_required", "auth_required"
}

// TaskResult represents the result of a task execution
type TaskResult struct {
	TaskID       string        `json:"taskId"`
	AgentID      string        `json:"agentId,omitempty"`
	Content      string        `json:"content,omitempty"`
	FilesChanged []string      `json:"filesChanged,omitempty"`
	Artifacts    []Artifact    `json:"artifacts,omitempty"`
	Error        string        `json:"error,omitempty"`
	StartedAt    time.Time     `json:"startedAt"`
	CompletedAt  time.Time     `json:"completedAt"`
	Duration     time.Duration `json:"duration"`
}

// Artifact represents a task artifact
type Artifact struct {
	Type        string `json:"type"` // "file", "code", "documentation", "test"
	Name        string `json:"name"`
	Path        string `json:"path,omitempty"`
	Content     string `json:"content,omitempty"`
	Description string `json:"description,omitempty"`
}

// ConsensusResult represents the result of a consensus vote
type ConsensusResult struct {
	TaskID        string              `json:"taskId,omitempty"`
	ProposalID    string              `json:"proposalId,omitempty"`
	Status        string              `json:"status"` // "agreed", "disagreed", "partial"
	ApprovalRate  float64             `json:"approvalRate"`
	Votes         map[string]Vote     `json:"votes"`
	Contributions []AgentContribution `json:"contributions,omitempty"`
	FinalResult   string              `json:"finalResult,omitempty"`
}

// Vote represents an agent's vote
type Vote struct {
	AgentID string  `json:"agentId"`
	Approve bool    `json:"approve"`
	Comment string  `json:"comment,omitempty"`
	Weight  float64 `json:"weight,omitempty"`
}

// AgentContribution represents an agent's contribution to a task
type AgentContribution struct {
	AgentID string  `json:"agentId"`
	Content string  `json:"content,omitempty"`
	Vote    string  `json:"vote,omitempty"` // "approve", "reject", "abstain"
	Weight  float64 `json:"weight,omitempty"`
}

// Proposal represents a proposal for consensus voting
type Proposal struct {
	ID          string          `json:"id"`
	Title       string          `json:"title,omitempty"`
	Description string          `json:"description,omitempty"`
	Content     json.RawMessage `json:"content,omitempty"`
	CreatedAt   time.Time       `json:"createdAt,omitempty"`
}
