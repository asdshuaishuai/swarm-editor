// Package agent implements the intelligent agent system
package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/log"
)

var agentLog = log.With("component", "Agent")

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
	AgentTypePlanner      AgentType = "planner" // Plans and breaks down tasks (Cursor-like)
	AgentTypeWorker       AgentType = "worker"  // Executes planned subtasks

	// maxToolHistorySize limits the number of recent tool executions stored per agent
	maxToolHistorySize = 100
)

// AgentState represents the current state of an agent
type AgentState string

const (
	StateIdle      AgentState = "idle"
	StateThinking  AgentState = "thinking"
	StateExecuting AgentState = "executing"
	StateWaiting   AgentState = "waiting"
	StateError     AgentState = "error"
	StateBlocked   AgentState = "blocked" // HITL: awaiting human approval
)

// StateBroadcaster broadcasts agent state changes to WebSocket clients.
type StateBroadcaster interface {
	Broadcast(eventType string, payload any)
}

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

	broadcaster StateBroadcaster

	// Three-layer memory system (CrewAI-inspired)
	// ShortTerm: recent context, bounded, session-scoped
	// LongTerm: persistent patterns, cross-session
	shortMemory *ShortTermMemory
	longMemory  *LongTermMemory

	// ACP Connection for external agent communication
	conn *acp.AgentConnection

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
	Memory           map[string]any
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
			Memory: make(map[string]any),
		},
		shortMemory: NewShortTermMemory(100),
		longMemory:  NewLongTermMemory(0), // uses DefaultLongTermMemorySize (1000)
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

// SetBroadcaster sets the broadcaster for agent state change events.
func (a *Agent) SetBroadcaster(b StateBroadcaster) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.broadcaster = b
}

// SetState updates the agent state and broadcasts the change.
func (a *Agent) SetState(state AgentState) {
	a.mu.Lock()
	prev := a.State
	a.State = state
	a.lastActive = time.Now()
	bc := a.broadcaster
	id := a.ID
	name := a.Name
	a.mu.Unlock()

	if bc != nil && prev != state {
		bc.Broadcast("agent_status_change", map[string]any{
			"agentId":   string(id),
			"agentName": name,
			"oldState":  string(prev),
			"newState":  string(state),
		})
	}
}

// GetState returns the current state
func (a *Agent) GetState() AgentState {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.State
}

// Block transitions the agent to blocked state (HITL stdin lock).
// The agent cannot accept new prompts until Unblock is called.
func (a *Agent) Block() {
	a.SetState(StateBlocked)
}

// Unblock transitions the agent back to idle from blocked state.
func (a *Agent) Unblock() {
	a.mu.RLock()
	if a.State != StateBlocked {
		a.mu.RUnlock()
		return
	}
	a.mu.RUnlock()
	a.SetState(StateIdle)
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
	if len(a.toolHistory) > maxToolHistorySize {
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

// Execute executes a prompt by delegating to an external ACP agent
func (a *Agent) Execute(ctx context.Context, prompt acp.Prompt) (*ExecutionResult, error) {
	// HITL stdin lock: reject new prompts while blocked on human approval
	a.mu.RLock()
	state := a.State
	a.mu.RUnlock()
	if state == StateBlocked {
		return nil, fmt.Errorf("agent %s is blocked awaiting human approval", a.ID)
	}

	a.SetState(StateThinking)
	defer a.SetState(StateIdle)

	// Check if ACP connection is available (under lock)
	a.mu.RLock()
	conn := a.conn
	a.mu.RUnlock()

	if conn == nil {
		return nil, acp.ErrNoConnection
	}

	// Get or create session atomically under write lock
	// Release lock before blocking SendPrompt to avoid holding lock during I/O
	var sessionID acp.SessionID
	a.mu.Lock()
	if a.session != nil {
		sessionID = *a.session
		a.mu.Unlock()
	} else {
		// Release lock during I/O to allow concurrent state reads
		a.mu.Unlock()
		session, err := conn.CreateSession(ctx, acp.ModeDefault)
		if err != nil {
			return nil, fmt.Errorf("create session: %w", err)
		}
		sessionID = session.ID
		a.mu.Lock()
		// Double-check: another goroutine may have created a session while we were blocked
		if a.session == nil {
			a.session = &sessionID
		} else {
			// Use the existing session; our newly created session is orphaned.
			// Log but don't leak - the remote agent will clean it up on inactivity.
			agentLog.Info("Orphaned session, will be garbage collected", "session_id", sessionID, "agent_id", a.ID, "existing_session", *a.session)
			sessionID = *a.session
		}
		a.mu.Unlock()
	}

	// Send prompt to external agent via ACP
	result, err := conn.SendPrompt(ctx, sessionID, prompt)
	if err != nil {
		return nil, fmt.Errorf("send prompt: %w", err)
	}

	// Convert ACP result to execution result
	execResult := &ExecutionResult{
		AgentID:    a.ID,
		StopReason: result.StopReason,
		Output:     "",
	}

	// Update last active time
	a.mu.Lock()
	a.lastActive = time.Now()
	a.mu.Unlock()

	return execResult, nil
}

// SetConnection sets the ACP connection for this agent
func (a *Agent) SetConnection(conn *acp.AgentConnection) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.conn = conn
}

// GetConnection returns the ACP connection for this agent
func (a *Agent) GetConnection() *acp.AgentConnection {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.conn
}

// ShortMemory returns the agent's short-term memory.
// Use for recent context within the current session.
func (a *Agent) ShortMemory() *ShortTermMemory {
	return a.shortMemory
}

// LongMemory returns the agent's long-term memory.
// Use for persistent patterns and knowledge across sessions.
func (a *Agent) LongMemory() *LongTermMemory {
	return a.longMemory
}

// Remember stores a value in short-term memory (convenience method).
func (a *Agent) Remember(key string, value any) {
	a.shortMemory.Set(key, value)
}

// Recall retrieves a value from short-term memory (convenience method).
func (a *Agent) Recall(key string) (any, bool) {
	return a.shortMemory.Get(key)
}

// Learn stores a value in long-term memory (convenience method).
func (a *Agent) Learn(key string, value any) {
	a.longMemory.Set(key, value)
}

// Know retrieves a value from long-term memory (convenience method).
func (a *Agent) Know(key string) (any, bool) {
	return a.longMemory.Get(key)
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
