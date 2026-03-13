// Package swarm defines shared types for the swarm system
package swarm

import (
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
)

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
	TaskID        string              `json:"taskId"`
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
