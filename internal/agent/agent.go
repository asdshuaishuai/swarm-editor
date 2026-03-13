// Package agent implements the intelligent agent system
package agent

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
)

// AgentType defines the type/role of an agent
type AgentType string

const (
	AgentTypeCoder        AgentType = "coder"
	AgentTypeReviewer     AgentType = "reviewer"
	AgentTypeArchitect    AgentType = "architect"
	AgentTypeTester       AgentType = "tester"
	AgentTypeNavigator    AgentType = "navigator"
	AgentTypeDriver       AgentType = "driver"
	AgentTypeOrchestrator AgentType = "orchestrator"
)

// AgentState represents the current state of an agent
type AgentState string

const (
	StateIdle      AgentState = "idle"
	StateThinking  AgentState = "thinking"
	StateExecuting AgentState = "executing"
	StateWaiting   AgentState = "waiting"
	StateError     AgentState = "error"
)

// Agent represents an AI agent instance
type Agent struct {
	mu sync.RWMutex

	ID           acp.AgentID
	Name         string
	Type         AgentType
	State        AgentState
	Capabilities acp.AgentCapabilities

	session     *acp.SessionID
	context     *AgentContext
	toolHistory []ToolExecution

	created    time.Time
	lastActive time.Time

	// Callbacks
	onUpdate   func(update *acp.Update)
	onToolCall func(tool *ToolCall)
}

// AgentContext maintains the agent's working context
type AgentContext struct {
	WorkingDirectory string
	OpenFiles        []string
	RecentEdits      []EditRecord
	TaskHistory      []TaskRecord
	Memory           map[string]interface{}
}

// ToolExecution records a tool execution
type ToolExecution struct {
	ID        acp.ToolCallID
	Tool      string
	Input     json.RawMessage
	Output    json.RawMessage
	Status    acp.ToolCallStatus
	Timestamp time.Time
}

// ToolCall represents a tool call request
type ToolCall struct {
	ID           acp.ToolCallID
	Tool         string
	Title        string
	Kind         acp.ToolKind
	Input        json.RawMessage
	RequiresPerm bool
}

// EditRecord records a file edit
type EditRecord struct {
	Path      string
	Timestamp time.Time
	Summary   string
}

// TaskRecord records a completed task
type TaskRecord struct {
	ID          string
	Description string
	Status      string
	Result      string
	Timestamp   time.Time
}

// NewAgent creates a new agent
func NewAgent(name string, agentType AgentType) *Agent {
	return &Agent{
		ID:         acp.GenerateAgentID(),
		Name:       name,
		Type:       agentType,
		State:      StateIdle,
		created:    time.Now(),
		lastActive: time.Now(),
		context: &AgentContext{
			Memory: make(map[string]interface{}),
		},
		Capabilities: acp.AgentCapabilities{
			PromptCapabilities: acp.PromptCapabilities{
				Image:           true,
				Audio:           false,
				EmbeddedContext: true,
			},
			LoadSession: true,
		},
	}
}

// SetSession associates the agent with a session
func (a *Agent) SetSession(sessionID acp.SessionID) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.session = &sessionID
}

// GetSession returns the current session
func (a *Agent) GetSession() *acp.SessionID {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.session
}

// SetState updates the agent state
func (a *Agent) SetState(state AgentState) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.State = state
	a.lastActive = time.Now()
}

// GetState returns the current state
func (a *Agent) GetState() AgentState {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.State
}

// UpdateContext updates the agent's context
func (a *Agent) UpdateContext(fn func(*AgentContext)) {
	if fn == nil {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	fn(a.context)
}

// RecordToolExecution records a tool execution in history
func (a *Agent) RecordToolExecution(exec *ToolExecution) {
	if exec == nil {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	a.toolHistory = append(a.toolHistory, *exec)
	if len(a.toolHistory) > 100 {
		a.toolHistory = a.toolHistory[1:]
	}
}

// GetToolHistory returns recent tool executions
func (a *Agent) GetToolHistory() []ToolExecution {
	a.mu.RLock()
	defer a.mu.RUnlock()
	result := make([]ToolExecution, len(a.toolHistory))
	copy(result, a.toolHistory)
	return result
}

// OnUpdate registers a callback for updates
func (a *Agent) OnUpdate(fn func(update *acp.Update)) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.onUpdate = fn
}

// OnToolCall registers a callback for tool calls
func (a *Agent) OnToolCall(fn func(tool *ToolCall)) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.onToolCall = fn
}

// SendUpdate sends an update notification
func (a *Agent) SendUpdate(update *acp.Update) {
	a.mu.RLock()
	fn := a.onUpdate
	a.mu.RUnlock()

	if fn != nil && update != nil {
		fn(update)
	}
}

// Execute executes a prompt with the agent
func (a *Agent) Execute(ctx context.Context, prompt acp.Prompt) (*ExecutionResult, error) {
	a.SetState(StateThinking)
	defer a.SetState(StateIdle)

	// This would be implemented by the actual LLM integration
	return &ExecutionResult{
		AgentID:    a.ID,
		StopReason: acp.StopEndTurn,
	}, nil
}

// ExecutionResult represents the result of agent execution
type ExecutionResult struct {
	AgentID    acp.AgentID
	StopReason acp.StopReason
	Output     string
	ToolCalls  []ToolCall
	Error      error
}

// AgentInfo returns information about the agent
func (a *Agent) AgentInfo() acp.ImplementationInfo {
	return acp.ImplementationInfo{
		Name:    string(a.ID),
		Title:   a.Name,
		Version: "1.0.0",
	}
}
