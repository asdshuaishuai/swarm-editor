// Package swarm implements the swarm orchestration system
package swarm

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
	"github.com/swarm-editor/swarm-editor/internal/log"
)

var orchestratorLog = log.With("component", "Swarm")

// TopologyType defines the swarm topology
type TopologyType string

const (
	TopologyStar   TopologyType = "star"   // Central coordinator, agents report to it
	TopologyMesh   TopologyType = "mesh"   // All agents connected to all
	TopologyTree   TopologyType = "tree"   // Hierarchical structure
	TopologyRing   TopologyType = "ring"   // Agents in a ring
	TopologyHybrid TopologyType = "hybrid" // Combination of topologies
)

// TaskStrategy defines how tasks are distributed
type TaskStrategy string

const (
	StrategyParallel   TaskStrategy = "parallel"   // Execute tasks in parallel
	StrategySequential TaskStrategy = "sequential" // Execute tasks one by one
	StrategyPipeline   TaskStrategy = "pipeline"   // Tasks flow through stages
	StrategyMapReduce  TaskStrategy = "mapreduce"  // Map tasks, reduce results
)

// SwarmState represents the state of a swarm
type SwarmState string

const (
	SwarmStateInitializing SwarmState = "initializing"
	SwarmStateActive       SwarmState = "active"
	SwarmStatePaused       SwarmState = "paused"
	SwarmStateStopping     SwarmState = "stopping"
	SwarmStateStopped      SwarmState = "stopped"
)

// Swarm represents a coordinated group of agents using Queen Bee model
// The coordinator (Queen Bee) assigns tasks to workers, workers execute and report back
type Swarm struct {
	mu sync.RWMutex

	ID       string
	Name     string
	Topology TopologyType
	Strategy TaskStrategy
	State    SwarmState

	coordinator *agent.Agent
	agents      map[acp.AgentID]*agent.Agent
	edges       map[acp.AgentID][]acp.AgentID // Adjacency list for topology
	registry    *agent.Registry               // Registry for HandoffManager

	tasks     map[string]*Task
	taskQueue []*Task
	completed []*Task

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup // Tracks in-flight goroutines for graceful shutdown (AutoGen drain pattern)

	onTaskComplete func(task *Task)

	// Handoff manager for agent handoffs
	handoffManager *HandoffManager

	// Result validator for post-execution guardrails (Semantic Kernel pattern)
	resultValidator *ResultValidator

	// Termination policy for composite execution limits (AutoGen pattern)
	terminationPolicy *CompositeTerminationPolicy

	// Event broadcaster for real-time streaming to UI
	broadcaster EventBroadcaster
}

// SwarmConfig configures a swarm
type SwarmConfig struct {
	ID          string
	Name        string
	Topology    TopologyType
	Strategy    TaskStrategy
	AgentCount  int
	AgentTypes  []agent.AgentType
	TaskTimeout time.Duration // Timeout for task execution
}

// NewSwarm creates a new swarm with Queen Bee model
func NewSwarm(config SwarmConfig) *Swarm {
	s := &Swarm{
		ID:       config.ID,
		Name:     config.Name,
		Topology: config.Topology,
		Strategy: config.Strategy,
		State:    SwarmStateInitializing,
		agents:   make(map[acp.AgentID]*agent.Agent),
		edges:    make(map[acp.AgentID][]acp.AgentID),
		tasks:    make(map[string]*Task),
		registry: agent.NewRegistry(),
	}

	// Initialize handoff manager
	s.handoffManager = NewHandoffManager(s.registry)

	// Initialize result validator with default guardrails
	s.resultValidator = NewResultValidator()

	// Initialize termination policy with default conditions (AutoGen composite pattern)
	s.terminationPolicy = NewCompositePolicy(TerminationOR)
	s.terminationPolicy.Add(NewNoProgressCondition())

	return s
}

// AddAgent adds an agent to the swarm
func (s *Swarm) AddAgent(a *agent.Agent) {
	if a == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.agents[a.ID] = a
	if err := s.registry.Register(a); err != nil {
		orchestratorLog.Warn("Failed to register agent", "agent_id", a.ID, "error", err)
	}

	// Update topology edges
	s.buildTopology()
}

// RemoveAgent removes an agent from the swarm
func (s *Swarm) RemoveAgent(id acp.AgentID) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.agents, id)
	if err := s.registry.Unregister(id); err != nil {
		orchestratorLog.Warn("Failed to unregister agent", "agent_id", id, "error", err)
	}
	s.buildTopology()
}

// SetCoordinator sets the coordinator agent
func (s *Swarm) SetCoordinator(a *agent.Agent) {
	if a == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.coordinator = a
	s.buildTopology()
}

// buildTopology builds the connectivity graph based on topology type
func (s *Swarm) buildTopology() {
	agentIDs := make([]acp.AgentID, 0, len(s.agents))
	for id := range s.agents {
		agentIDs = append(agentIDs, id)
	}

	// Clear existing edges
	s.edges = make(map[acp.AgentID][]acp.AgentID)

	switch s.Topology {
	case TopologyStar:
		// All agents connect to coordinator
		if s.coordinator != nil {
			for _, id := range agentIDs {
				if id != s.coordinator.ID {
					s.edges[s.coordinator.ID] = append(s.edges[s.coordinator.ID], id)
					s.edges[id] = []acp.AgentID{s.coordinator.ID}
				}
			}
		}

	case TopologyMesh:
		// All agents connect to all other agents
		for _, id1 := range agentIDs {
			for _, id2 := range agentIDs {
				if id1 != id2 {
					s.edges[id1] = append(s.edges[id1], id2)
				}
			}
		}

	case TopologyRing:
		// Agents in a ring
		for i, id := range agentIDs {
			next := agentIDs[(i+1)%len(agentIDs)]
			s.edges[id] = []acp.AgentID{next}
		}

	case TopologyTree:
		// Build a binary tree structure
		if len(agentIDs) > 0 {
			s.buildTree(agentIDs, 0)
		}

	case TopologyHybrid:
		// Hybrid: Star + Ring combination
		// Coordinator connects to all, and agents form a ring
		if s.coordinator != nil {
			for _, id := range agentIDs {
				if id != s.coordinator.ID {
					s.edges[s.coordinator.ID] = append(s.edges[s.coordinator.ID], id)
					s.edges[id] = append(s.edges[id], s.coordinator.ID)
				}
			}
		}
		// Add ring connections
		for i, id := range agentIDs {
			next := agentIDs[(i+1)%len(agentIDs)]
			s.edges[id] = append(s.edges[id], next)
		}

	default:
		// Default to mesh topology for unknown types
		for _, id1 := range agentIDs {
			for _, id2 := range agentIDs {
				if id1 != id2 {
					s.edges[id1] = append(s.edges[id1], id2)
				}
			}
		}
	}
}

// buildTree recursively builds a tree topology
func (s *Swarm) buildTree(agentIDs []acp.AgentID, rootIdx int) {
	if rootIdx >= len(agentIDs) {
		return
	}

	root := agentIDs[rootIdx]
	leftIdx := 2*rootIdx + 1
	rightIdx := 2*rootIdx + 2

	if leftIdx < len(agentIDs) {
		s.edges[root] = append(s.edges[root], agentIDs[leftIdx])
		s.edges[agentIDs[leftIdx]] = []acp.AgentID{root}
		s.buildTree(agentIDs, leftIdx)
	}

	if rightIdx < len(agentIDs) {
		s.edges[root] = append(s.edges[root], agentIDs[rightIdx])
		s.edges[agentIDs[rightIdx]] = []acp.AgentID{root}
		s.buildTree(agentIDs, rightIdx)
	}
}

// GetNeighbors returns a copy of the neighbors of an agent in the topology
func (s *Swarm) GetNeighbors(id acp.AgentID) []acp.AgentID {
	s.mu.RLock()
	defer s.mu.RUnlock()
	neighbors := s.edges[id]
	if neighbors == nil {
		return nil
	}
	result := make([]acp.AgentID, len(neighbors))
	copy(result, neighbors)
	return result
}

// GetAgents returns all agents in the swarm
func (s *Swarm) GetAgents() []*agent.Agent {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]*agent.Agent, 0, len(s.agents))
	for _, a := range s.agents {
		result = append(result, a)
	}
	return result
}

// GetTask returns a task by ID
func (s *Swarm) GetTask(taskID string) *Task {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.tasks[taskID]
}

// Start starts the swarm
func (s *Swarm) Start(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Prevent double start
	if s.State == SwarmStateActive {
		return fmt.Errorf("swarm is already active")
	}

	s.ctx, s.cancel = context.WithCancel(ctx)
	s.State = SwarmStateActive

	// Start all agents
	for _, a := range s.agents {
		a.SetState(agent.StateIdle)
	}

	return nil
}

// Stop stops the swarm and waits for in-flight goroutines to complete.
// Uses AutoGen's two-phase drain pattern: cancel context, then wait for goroutines.
func (s *Swarm) Stop() error {
	s.mu.Lock()
	s.State = SwarmStateStopping
	if s.cancel != nil {
		s.cancel()
	}
	s.mu.Unlock()

	// Wait for all in-flight goroutines (executeOnAgentsWithPrompt, BroadcastToWorkers)
	s.wg.Wait()

	// Close handoff manager to release its goroutines
	if s.handoffManager != nil {
		s.handoffManager.Close()
	}

	// Stop all agents
	for _, a := range s.GetAgents() {
		a.SetState(agent.StateIdle)
	}

	s.mu.Lock()
	s.State = SwarmStateStopped
	s.mu.Unlock()

	return nil
}

// SubmitTask submits a task to the swarm
func (s *Swarm) SubmitTask(ctx context.Context, task *Task) error {
	if task == nil {
		return fmt.Errorf("task cannot be nil")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	task.State = TaskStatePending
	task.CreatedAt = time.Now()
	s.tasks[task.ID] = task
	s.taskQueue = append(s.taskQueue, task)

	return nil
}

// DecomposeTask decomposes a complex task into subtasks
func (s *Swarm) DecomposeTask(ctx context.Context, task *Task) ([]*Task, error) {
	if task == nil {
		return nil, fmt.Errorf("task cannot be nil")
	}

	// Analyze task complexity
	if !task.IsDecomposable() {
		return []*Task{task}, nil
	}

	// Create subtasks based on strategy
	s.mu.RLock()
	agentCount := len(s.agents)
	s.mu.RUnlock()

	subtasks := task.CreateSubtasks(agentCount)
	return subtasks, nil
}

// ExecuteTask executes a task using available agents
func (s *Swarm) ExecuteTask(ctx context.Context, task *Task) (*TaskResult, error) {
	if task == nil {
		return nil, fmt.Errorf("task cannot be nil")
	}

	// Check turn limit before execution (OpenAI Swarm pattern)
	if task.IsTurnLimitReached() {
		return nil, fmt.Errorf("task %s exceeded max_turns (%d/%d)", task.ID, task.TurnCount, task.MaxTurns)
	}

	s.mu.Lock()
	task.State = TaskStateRunning
	s.mu.Unlock()

	// Select agent(s) based on strategy
	var selectedAgents []*agent.Agent

	switch s.Strategy {
	case StrategyParallel:
		selectedAgents = s.selectAgentsForParallel(task)
	case StrategySequential:
		selectedAgents = s.selectAgentForSequential(task)
	case StrategyPipeline:
		selectedAgents = s.selectAgentsForPipeline(task)
	case StrategyMapReduce:
		selectedAgents = s.selectAgentsForMapReduce(task)
	default:
		selectedAgents = s.selectAgentsForParallel(task)
	}

	// Execute on selected agents
	result := &TaskResult{
		TaskID:    task.ID,
		StartedAt: time.Now(),
	}

	// Run task execution
	err := s.executeOnAgents(ctx, task, selectedAgents, result)

	// Error recovery: if execution failed and we haven't hit max_turns,
	// retry with error context appended to the prompt (OpenAI Swarm pattern).
	// This gives the agent a chance to self-correct from its error.
	// Note: we build a separate recoveryPrompt to avoid mutating task.Prompt
	// which could cause race conditions with concurrent readers.
	const maxRecoveryAttempts = 1
	for i := 0; err != nil && i < maxRecoveryAttempts && !task.IsTurnLimitReached(); i++ {
		// Build recovery prompt with error context prepended
		task.mu.RLock()
		originalPrompt := make(acp.Prompt, len(task.Prompt))
		copy(originalPrompt, task.Prompt)
		task.mu.RUnlock()

		recoveryPrompt := make(acp.Prompt, 0, len(originalPrompt)+1)
		recoveryPrompt = append(recoveryPrompt, acp.ContentBlock{
			Type: "text",
			Text: fmt.Sprintf("[Previous attempt failed with error: %s. Please retry with a different approach.]", err.Error()),
		})
		recoveryPrompt = append(recoveryPrompt, originalPrompt...)

		// Use the original prompt for recovery (passed directly, not mutating task)
		originalErr := err
		recoveryErr := s.executeOnAgentsWithPrompt(ctx, task, selectedAgents, result, recoveryPrompt)
		if recoveryErr == nil {
			err = nil // Recovery succeeded
		} else {
			err = fmt.Errorf("recovery also failed: %v (original: %w)", recoveryErr, originalErr)
		}
	}

	result.CompletedAt = time.Now()
	if err != nil {
		result.Error = err.Error()
	}

	// Validate result before accepting (Semantic Kernel guardrails pattern)
	if err == nil {
		validation := s.resultValidator.Validate(result)
		if !validation.Valid {
			orchestratorLog.Warn("Task result validation failed", "task_id", task.ID, "reason", validation.Reason, "severity", validation.Severity)
			if validation.Severity == "error" {
				err = fmt.Errorf("result validation failed: %s", validation.Reason)
				result.Error = err.Error()
			}
		}
	}

	s.mu.Lock()
	if err != nil {
		task.State = TaskStateFailed
	} else {
		task.State = TaskStateCompleted
	}
	task.Result = result
	s.completed = append(s.completed, task)

	// Limit completed tasks to prevent memory leak (keep last 500)
	const maxCompletedTasks = 500
	if len(s.completed) > maxCompletedTasks {
		s.completed = s.completed[len(s.completed)-maxCompletedTasks:]
	}

	onComplete := s.onTaskComplete
	s.mu.Unlock()

	if onComplete != nil {
		onComplete(task)
	}

	return result, err
}

func (s *Swarm) selectAgentsForParallel(task *Task) []*agent.Agent {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Select all idle agents
	var selected []*agent.Agent
	for _, a := range s.agents {
		if a.GetState() == agent.StateIdle {
			selected = append(selected, a)
		}
	}
	return selected
}

func (s *Swarm) selectAgentForSequential(task *Task) []*agent.Agent {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Select single best agent
	var best *agent.Agent
	for _, a := range s.agents {
		if a.GetState() == agent.StateIdle {
			if best == nil || len(a.GetToolHistory()) < len(best.GetToolHistory()) {
				best = a
			}
		}
	}
	if best != nil {
		return []*agent.Agent{best}
	}
	return nil
}

func (s *Swarm) selectAgentsForPipeline(task *Task) []*agent.Agent {
	// Select agents based on pipeline stages
	return s.selectAgentsForParallel(task)
}

func (s *Swarm) selectAgentsForMapReduce(task *Task) []*agent.Agent {
	// Select agents for map phase
	return s.selectAgentsForParallel(task)
}

func (s *Swarm) executeOnAgents(ctx context.Context, task *Task, agents []*agent.Agent, result *TaskResult) error {
	return s.executeOnAgentsWithPrompt(ctx, task, agents, result, task.Prompt)
}

// executeOnAgentsWithPrompt executes a task using a specific prompt (used for error recovery)
func (s *Swarm) executeOnAgentsWithPrompt(ctx context.Context, task *Task, agents []*agent.Agent, result *TaskResult, prompt acp.Prompt) error {
	if len(agents) == 0 {
		return fmt.Errorf("no available agents")
	}

	// Increment turn count (AutoGen pattern: track turns for termination)
	turns := task.IncrementTurns()

	// Track in-flight goroutines on struct wg for graceful shutdown
	s.wg.Add(len(agents))
	var wg sync.WaitGroup
	errCh := make(chan error, len(agents))

	// Collect outputs for termination policy check (thread-safe)
	var outputMu sync.Mutex
	var outputs []string

	for _, a := range agents {
		wg.Add(1)
		go func(ag *agent.Agent) {
			defer wg.Done()
			defer s.wg.Done()
			defer func() {
				if r := recover(); r != nil {
					orchestratorLog.Error("executeOnAgentsWithPrompt goroutine panic", "agent_id", ag.ID, "panic", r)
				}
			}()

			// Broadcast turn_start delimiter (OpenAI Swarm pattern)
			s.broadcastTurnStart(ag.ID, task.ID)

			ag.SetState(agent.StateExecuting)

			// Execute task with the provided prompt
			execResult, err := ag.Execute(ctx, prompt)

			// Always reset agent state after execution
			ag.SetState(agent.StateIdle)

			// Broadcast turn_end delimiter (OpenAI Swarm pattern)
			s.broadcastTurnEnd(ag.ID, task.ID, err == nil)

			if err != nil {
				errCh <- fmt.Errorf("agent %s: %w", ag.ID, err)
				return
			}

			// Collect output for termination policy
			if execResult != nil && execResult.Output != "" {
				outputMu.Lock()
				outputs = append(outputs, execResult.Output)
				outputMu.Unlock()
			}
		}(a)
	}

	wg.Wait()
	close(errCh)

	// Collect all errors
	var errors []error
	for err := range errCh {
		errors = append(errors, err)
	}

	// Return combined error if any
	if len(errors) > 0 {
		return fmt.Errorf("execution failed: %d error(s)", len(errors))
	}

	// Check termination policy (AutoGen composable termination pattern)
	// Combines MaxTurns, Timeout, NoProgress conditions with AND/OR logic
	combinedOutput := strings.Join(outputs, "\n")
	if s.terminationPolicy != nil {
		termResult := s.terminationPolicy.Check(turns, combinedOutput)
		if termResult.Terminated {
			return fmt.Errorf("task %s terminated: %s (condition: %s)",
				task.ID, termResult.Reason, termResult.Condition)
		}
	}

	// Backward compatibility: check per-task MaxTurns if not covered by policy
	if task.MaxTurns > 0 && turns > task.MaxTurns {
		return fmt.Errorf("task %s exceeded max_turns (%d/%d)", task.ID, turns, task.MaxTurns)
	}

	return nil
}

// AssignTaskToWorker assigns a task to the best available worker (Queen Bee model)
// The coordinator (Queen Bee) decides which worker gets the task - no voting
func (s *Swarm) AssignTaskToWorker(task *Task) *agent.Agent {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.coordinator == nil {
		// No coordinator, select first available agent
		for _, a := range s.agents {
			if a.GetState() == agent.StateIdle {
				task.AssignedTo = []acp.AgentID{a.ID}
				return a
			}
		}
		return nil
	}

	// Queen Bee selects best worker based on:
	// 1. Worker state (idle preferred)
	// 2. Worker capabilities matching task requirements
	// 3. Worker load (less loaded preferred)
	var bestWorker *agent.Agent
	bestScore := -1.0

	for _, a := range s.agents {
		if a.ID == s.coordinator.ID {
			continue // Skip coordinator
		}

		score := s.calculateWorkerScore(a, task)
		if score > bestScore {
			bestScore = score
			bestWorker = a
		}
	}

	if bestWorker != nil {
		task.AssignedTo = []acp.AgentID{bestWorker.ID}
	}

	return bestWorker
}

// calculateWorkerScore calculates a score for worker selection (Queen Bee decision)
func (s *Swarm) calculateWorkerScore(a *agent.Agent, task *Task) float64 {
	score := 0.0

	// Idle agents get highest priority
	if a.GetState() == agent.StateIdle {
		score += 10.0
	} else if a.GetState() == agent.StateThinking {
		score += 5.0
	} else {
		return -1.0 // Busy agents are not considered
	}

	// Capability matching based on task description keywords
	taskLower := strings.ToLower(task.Description)
	agentTypeStr := string(a.Type)

	// Match agent type to task requirements
	if strings.Contains(taskLower, "review") && agentTypeStr == "reviewer" {
		score += 5.0
	} else if strings.Contains(taskLower, "test") && agentTypeStr == "tester" {
		score += 5.0
	} else if strings.Contains(taskLower, "architect") && agentTypeStr == "architect" {
		score += 5.0
	} else if (strings.Contains(taskLower, "code") || strings.Contains(taskLower, "implement")) && agentTypeStr == "coder" {
		score += 5.0
	}

	// Less tool history = less loaded (simplified load metric)
	historyLen := len(a.GetToolHistory())
	if historyLen < 10 {
		score += 3.0
	} else if historyLen < 50 {
		score += 1.0
	}

	return score
}

// BroadcastToWorkers broadcasts a message to all workers (Queen Bee -> Workers)
// Returns a map of agent IDs to errors (nil if successful)
func (s *Swarm) BroadcastToWorkers(ctx context.Context, message string) map[acp.AgentID]error {
	s.mu.RLock()
	agents := make([]struct {
		id    acp.AgentID
		agent *agent.Agent
	}, 0, len(s.agents))
	for id, a := range s.agents {
		if s.coordinator != nil && a.ID == s.coordinator.ID {
			continue // Skip coordinator
		}
		agents = append(agents, struct {
			id    acp.AgentID
			agent *agent.Agent
		}{id: id, agent: a})
	}
	s.mu.RUnlock()

	errors := make(map[acp.AgentID]error)
	var mu sync.Mutex
	var wg sync.WaitGroup

	// Track in-flight goroutines on struct wg for graceful shutdown
	s.wg.Add(len(agents))

	for _, a := range agents {
		wg.Add(1)
		go func(agentID acp.AgentID, agent *agent.Agent) {
			defer wg.Done()
			defer s.wg.Done()
			defer func() {
				if r := recover(); r != nil {
					orchestratorLog.Error("BroadcastToWorkers goroutine panic", "agent_id", agentID, "panic", r)
				}
			}()
			_, err := agent.Execute(ctx, acp.Prompt{
				{Type: "text", Text: message},
			})
			if err != nil {
				mu.Lock()
				errors[agentID] = err
				mu.Unlock()
			}
		}(a.id, a.agent)
	}

	wg.Wait()
	return errors
}

// OnTaskComplete registers a callback for task completion
func (s *Swarm) OnTaskComplete(fn func(task *Task)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onTaskComplete = fn
}

// GetStats returns swarm statistics
func (s *Swarm) GetStats() *SwarmStats {
	s.mu.RLock()
	defer s.mu.RUnlock()

	idle := 0
	executing := 0
	for _, a := range s.agents {
		switch a.GetState() {
		case agent.StateIdle:
			idle++
		case agent.StateExecuting, agent.StateThinking:
			executing++
		}
	}

	return &SwarmStats{
		AgentCount:      len(s.agents),
		IdleAgents:      idle,
		ExecutingAgents: executing,
		PendingTasks:    len(s.taskQueue),
		CompletedTasks:  len(s.completed),
		Topology:        string(s.Topology),
		Strategy:        string(s.Strategy),
		State:           string(s.State),
	}
}

// SwarmStats holds swarm statistics
type SwarmStats struct {
	AgentCount      int    `json:"agentCount"`
	IdleAgents      int    `json:"idleAgents"`
	ExecutingAgents int    `json:"executingAgents"`
	PendingTasks    int    `json:"pendingTasks"`
	CompletedTasks  int    `json:"completedTasks"`
	Topology        string `json:"topology"`
	Strategy        string `json:"strategy"`
	State           string `json:"state"`
}

// RequestHandoff initiates a handoff from one agent to another
func (s *Swarm) RequestHandoff(ctx context.Context, fromAgent, toAgent, taskID, reason string, context *HandoffContext) (*HandoffRequest, error) {
	return s.handoffManager.RequestHandoff(ctx, fromAgent, toAgent, taskID, reason, context)
}

// AcceptHandoff accepts a pending handoff request, optionally updating context variables
func (s *Swarm) AcceptHandoff(ctx context.Context, requestID, summary string, updatedVars ...map[string]any) error {
	return s.handoffManager.AcceptHandoff(ctx, requestID, summary, updatedVars...)
}

// RejectHandoff rejects a pending handoff request
func (s *Swarm) RejectHandoff(ctx context.Context, requestID, reason string) error {
	return s.handoffManager.RejectHandoff(ctx, requestID, reason)
}

// CompleteHandoff marks an active handoff as completed
func (s *Swarm) CompleteHandoff(ctx context.Context, requestID string) error {
	return s.handoffManager.CompleteHandoff(ctx, requestID)
}

// GetHandoffStats returns statistics about handoffs
func (s *Swarm) GetHandoffStats() map[HandoffState]int {
	return s.handoffManager.GetHandoffStats()
}

// OnHandoffRequested registers a callback for handoff request events
func (s *Swarm) OnHandoffRequested(fn func(req *HandoffRequest)) {
	s.handoffManager.SetOnHandoffRequested(fn)
}

// OnHandoffAccepted registers a callback for handoff acceptance events
func (s *Swarm) OnHandoffAccepted(fn func(req *HandoffRequest)) {
	s.handoffManager.SetOnHandoffAccepted(fn)
}

// OnHandoffCompleted registers a callback for handoff completion events
func (s *Swarm) OnHandoffCompleted(fn func(req *HandoffRequest)) {
	s.handoffManager.SetOnHandoffCompleted(fn)
}

// OnHandoffRejected registers a callback for handoff rejection events
func (s *Swarm) OnHandoffRejected(fn func(req *HandoffRequest)) {
	s.handoffManager.SetOnHandoffRejected(fn)
}

// GetResultValidator returns the result validator for adding custom rules
func (s *Swarm) GetResultValidator() *ResultValidator {
	return s.resultValidator
}

// GetTerminationPolicy returns the composite termination policy for customization.
// Users can add conditions (MaxTurns, Timeout, custom) or change the mode (AND/OR).
func (s *Swarm) GetTerminationPolicy() *CompositeTerminationPolicy {
	return s.terminationPolicy
}

// SetHandoffBroadcaster wires the event broadcaster to the handoff manager and swarm.
// This enables real-time handoff and turn event streaming to UI (OpenAI Swarm pattern).
func (s *Swarm) SetHandoffBroadcaster(broadcaster EventBroadcaster) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.broadcaster = broadcaster
	if s.handoffManager != nil {
		s.handoffManager.SetBroadcaster(broadcaster)
	}
}

// broadcastTurnStart emits a turn_start delimiter event.
// Inspired by OpenAI Swarm's {"delim": "start"} pattern, this allows UI consumers
// to bracket agent turns for proper state tracking.
func (s *Swarm) broadcastTurnStart(agentID acp.AgentID, taskID string) {
	s.mu.RLock()
	b := s.broadcaster
	s.mu.RUnlock()
	if b == nil {
		return
	}
	b.Broadcast("agent_turn_start", map[string]any{
		"agentId":   agentID,
		"taskId":    taskID,
		"timestamp": time.Now(),
	})
}

// broadcastTurnEnd emits a turn_end delimiter event.
// Inspired by OpenAI Swarm's {"delim": "end"} pattern.
func (s *Swarm) broadcastTurnEnd(agentID acp.AgentID, taskID string, success bool) {
	s.mu.RLock()
	b := s.broadcaster
	s.mu.RUnlock()
	if b == nil {
		return
	}
	b.Broadcast("agent_turn_end", map[string]any{
		"agentId":   agentID,
		"taskId":    taskID,
		"success":   success,
		"timestamp": time.Now(),
	})
}

// GetHandoffManager returns the handoff manager for direct access
func (s *Swarm) GetHandoffManager() *HandoffManager {
	return s.handoffManager
}
