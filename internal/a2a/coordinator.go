// Package a2a implements Agent-to-Agent coordination
package a2a

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"sort"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/log"
)

var a2aLog = log.With("component", "A2A")

// Coordinator manages A2A coordination and scheduling
type Coordinator struct {
	mu sync.RWMutex

	// A2A Router for messaging
	router *Router

	// Agent registry
	agents map[string]*AgentState

	// Task management
	pendingTasks   map[string]*CoordinationTask
	runningTasks   map[string]*CoordinationTask
	completedTasks map[string]*CoordinationTask

	// Pheromone trails for swarm intelligence
	pheromones map[string]*PheromoneTrail

	// Configuration
	config CoordinatorConfig

	// Callbacks
	onTaskAssigned   func(task *CoordinationTask, agent string)
	onTaskComplete   func(task *CoordinationTask, result *TaskResult)
	onAgentAvailable func(agentID string)

	// Lifecycle
	running bool
	ctx     context.Context
	cancel  context.CancelFunc
	wg      sync.WaitGroup
}

// AgentState tracks an agent's current state
type AgentState struct {
	ID           string
	Status       string // "idle", "busy", "offline", "error"
	Capabilities []string
	CurrentTask  string
	Load         float64 // 0.0 - 1.0
	SuccessRate  float64 // 0.0 - 1.0
	LastSeen     time.Time

	// Coordination state
	PeerScore     map[string]float64 // Scores for working with peers
	TaskHistory   []string
	PreferredRole string
}

// CoordinationTask represents a task being coordinated
type CoordinationTask struct {
	ID          string
	Title       string
	Description string
	Priority    int

	// Assignment
	AssignedTo   []string
	RequiredRole string
	Dependencies []string

	// State
	Status      string // "pending", "assigned", "running", "completed", "failed"
	Progress    float64
	StartedAt   time.Time
	CompletedAt time.Time // Time when task was completed or failed

	// Results
	Results map[string]*TaskResult

	// Coordination metadata
	Attempts     int
	Negotiations []*Negotiation
}

// Negotiation represents a negotiation between agents
type Negotiation struct {
	ID         string
	TaskID     string
	Proposer   string
	Responders []string
	Status     string // "pending", "accepted", "rejected", "counter"
	Terms      json.RawMessage
	CreatedAt  time.Time
}

// PheromoneTrail represents a digital pheromone for swarm intelligence
type PheromoneTrail struct {
	Type      string
	Location  string
	Strength  float64
	DecayRate float64
	CreatedAt time.Time
	UpdatedAt time.Time
}

// SchedulingStrategy defines the scheduling approach
type SchedulingStrategy string

const (
	StrategyRoundRobin    SchedulingStrategy = "round_robin"
	StrategyLeastLoaded   SchedulingStrategy = "least_loaded"
	StrategyCapability    SchedulingStrategy = "capability"
	StrategyCollaborative SchedulingStrategy = "collaborative"
	StrategySwarm         SchedulingStrategy = "swarm"
)

// CoordinatorConfig configures the coordinator
type CoordinatorConfig struct {
	MaxConcurrent      int
	TaskTimeout        time.Duration
	NegotiationTimeout time.Duration
	PheromoneDecay     float64 // Decay rate per second
	Strategy           SchedulingStrategy
	MaxCompletedTasks  int // Maximum number of completed tasks to retain (0 = unlimited)
	MaxPheromones      int // Maximum number of pheromone trails to retain (0 = unlimited)
}

// NewCoordinator creates a new A2A coordinator
func NewCoordinator(config CoordinatorConfig, router *Router) *Coordinator {
	if config.MaxConcurrent <= 0 {
		config.MaxConcurrent = 10
	}
	if config.TaskTimeout <= 0 {
		config.TaskTimeout = 30 * time.Minute
	}
	if config.NegotiationTimeout <= 0 {
		config.NegotiationTimeout = 30 * time.Second
	}
	if config.PheromoneDecay <= 0 {
		config.PheromoneDecay = 0.1
	}
	if config.Strategy == "" {
		config.Strategy = StrategyCollaborative
	}
	if config.MaxCompletedTasks <= 0 {
		config.MaxCompletedTasks = 1000 // Default: retain last 1000 completed tasks
	}
	if config.MaxPheromones <= 0 {
		config.MaxPheromones = 500 // Default: retain last 500 pheromone trails
	}

	return &Coordinator{
		router:         router,
		agents:         make(map[string]*AgentState),
		pendingTasks:   make(map[string]*CoordinationTask),
		runningTasks:   make(map[string]*CoordinationTask),
		completedTasks: make(map[string]*CoordinationTask),
		pheromones:     make(map[string]*PheromoneTrail),
		config:         config,
	}
}

// Start starts the coordinator
func (c *Coordinator) Start(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.running {
		return fmt.Errorf("coordinator already running")
	}

	c.ctx, c.cancel = context.WithCancel(ctx)
	c.running = true

	// Register message handlers
	c.router.RegisterHandler(MessageTypeTaskAccept, c.handleTaskAccept)
	c.router.RegisterHandler(MessageTypeTaskReject, c.handleTaskReject)
	c.router.RegisterHandler(MessageTypeTaskProgress, c.handleTaskProgress)
	c.router.RegisterHandler(MessageTypeTaskComplete, c.handleTaskComplete)
	c.router.RegisterHandler(MessageTypeTaskFailed, c.handleTaskFailed)
	c.router.RegisterHandler(MessageTypeHelpRequest, c.handleHelpRequest)
	c.router.RegisterHandler(MessageTypeHelpOffer, c.handleHelpOffer)
	c.router.RegisterHandler(MessageTypeProposal, c.handleProposal)
	c.router.RegisterHandler(MessageTypeAgreement, c.handleAgreement)
	c.router.RegisterHandler(MessageTypePheromone, c.handlePheromone)

	// Start background processes
	c.wg.Add(2)
	go c.schedulingLoop()
	go c.pheromoneDecayLoop()

	return nil
}

// Stop stops the coordinator
func (c *Coordinator) Stop() {
	c.mu.Lock()
	if !c.running {
		c.mu.Unlock()
		return
	}
	c.running = false
	if c.cancel != nil {
		c.cancel()
	}
	c.mu.Unlock()

	c.wg.Wait()
}

// RegisterAgent registers an agent with the coordinator
func (c *Coordinator) RegisterAgent(id string, capabilities []string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.agents[id] = &AgentState{
		ID:           id,
		Status:       "idle",
		Capabilities: capabilities,
		Load:         0,
		SuccessRate:  1.0,
		LastSeen:     time.Now(),
		PeerScore:    make(map[string]float64),
		TaskHistory:  make([]string, 0),
	}
}

// UnregisterAgent unregisters an agent and releases it from running tasks
func (c *Coordinator) UnregisterAgent(id string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	delete(c.agents, id)

	// Release agent from any running tasks to prevent permanent stuck
	for _, task := range c.runningTasks {
		var remaining []string
		for _, aid := range task.AssignedTo {
			if aid != id {
				remaining = append(remaining, aid)
			}
		}
		if len(remaining) < len(task.AssignedTo) {
			task.AssignedTo = remaining
			if len(task.AssignedTo) == 0 {
				task.Status = "failed"
				task.CompletedAt = time.Now()
				delete(c.runningTasks, task.ID)
				c.completedTasks[task.ID] = task
				a2aLog.Warn("Task failed: all agents unregistered", "task_id", task.ID)
			}
		}
	}
}

// SubmitTask submits a task for coordination
func (c *Coordinator) SubmitTask(ctx context.Context, task *CoordinationTask) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Check if coordinator is running
	if !c.running {
		return fmt.Errorf("coordinator is not running")
	}

	task.Status = "pending"
	c.pendingTasks[task.ID] = task

	return nil
}

// schedulingLoop is the main scheduling loop
func (c *Coordinator) schedulingLoop() {
	defer c.wg.Done()

	// Snapshot context to avoid data race on c.ctx
	ctx := c.ctx

	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.checkTaskTimeouts()
			c.scheduleNext()
		}
	}
}

// checkTaskTimeouts moves tasks that have exceeded TaskTimeout from running to failed.
// Without this, agent disconnects or message loss would permanently occupy MaxConcurrent slots.
func (c *Coordinator) checkTaskTimeouts() {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	for id, task := range c.runningTasks {
		if !task.StartedAt.IsZero() && now.Sub(task.StartedAt) > c.config.TaskTimeout {
			a2aLog.Warn("Task timed out", "task_id", id, "elapsed", now.Sub(task.StartedAt), "timeout", c.config.TaskTimeout)
			task.Status = "failed"
			task.CompletedAt = now
			delete(c.runningTasks, id)
			c.completedTasks[id] = task

			// Release agents back to idle
			for _, agentID := range task.AssignedTo {
				if agent, ok := c.agents[agentID]; ok && agent.Status == "busy" {
					agent.Status = "idle"
					agent.CurrentTask = ""
				}
			}
		}
	}
}

// scheduleNext schedules the next pending task
func (c *Coordinator) scheduleNext() {
	c.mu.Lock()

	if len(c.runningTasks) >= c.config.MaxConcurrent {
		c.mu.Unlock()
		return
	}

	// Get next task by priority
	task := c.getNextTask()
	if task == nil {
		c.mu.Unlock()
		return
	}

	// Select agent(s) based on strategy
	agents := c.selectAgents(task)
	if len(agents) == 0 {
		c.mu.Unlock()
		return
	}

	// Initiate task assignment via A2A
	callback := c.initiateTaskAssignment(task, agents)
	c.mu.Unlock()

	// Invoke callback outside lock to prevent deadlock
	if callback != nil {
		callback()
	}
}

// getNextTask gets the next highest priority task
func (c *Coordinator) getNextTask() *CoordinationTask {
	if len(c.pendingTasks) == 0 {
		return nil
	}

	var highest *CoordinationTask
	for _, task := range c.pendingTasks {
		// Check dependencies
		if !c.areDependenciesMet(task) {
			continue
		}

		if highest == nil || task.Priority > highest.Priority {
			highest = task
		}
	}

	return highest
}

// areDependenciesMet checks if task dependencies are satisfied
func (c *Coordinator) areDependenciesMet(task *CoordinationTask) bool {
	for _, depID := range task.Dependencies {
		dep, ok := c.completedTasks[depID]
		if !ok || dep.Status != "completed" {
			return false
		}
	}
	return true
}

// selectAgents selects agents based on the configured strategy
func (c *Coordinator) selectAgents(task *CoordinationTask) []string {
	switch c.config.Strategy {
	case StrategyRoundRobin:
		return c.selectRoundRobin(task)
	case StrategyLeastLoaded:
		return c.selectLeastLoaded(task)
	case StrategyCapability:
		return c.selectByCapability(task)
	case StrategyCollaborative:
		return c.selectCollaborative(task)
	case StrategySwarm:
		return c.selectSwarm(task)
	default:
		return c.selectLeastLoaded(task)
	}
}

// selectRoundRobin selects agents in round-robin fashion
func (c *Coordinator) selectRoundRobin(task *CoordinationTask) []string {
	var available []string
	for id, agent := range c.agents {
		if agent.Status == "idle" && c.hasRequiredRole(agent, task.RequiredRole) {
			available = append(available, id)
		}
	}

	if len(available) == 0 {
		return nil
	}

	// Sort by last task time for round-robin effect
	sort.Slice(available, func(i, j int) bool {
		return len(c.agents[available[i]].TaskHistory) < len(c.agents[available[j]].TaskHistory)
	})

	return available[:1]
}

// selectLeastLoaded selects the agent with the least load
func (c *Coordinator) selectLeastLoaded(task *CoordinationTask) []string {
	var candidates []*AgentState
	for _, agent := range c.agents {
		if agent.Status != "idle" {
			continue
		}
		if !c.hasRequiredRole(agent, task.RequiredRole) {
			continue
		}
		candidates = append(candidates, agent)
	}

	if len(candidates) == 0 {
		return nil
	}

	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].Load < candidates[j].Load
	})

	return []string{candidates[0].ID}
}

// selectByCapability selects the best agent by capability match
func (c *Coordinator) selectByCapability(task *CoordinationTask) []string {
	type scoredAgent struct {
		id    string
		score float64
	}

	var candidates []scoredAgent
	for id, agent := range c.agents {
		if agent.Status != "idle" {
			continue
		}

		score := c.calculateCapabilityScore(agent, task)
		if score > 0 {
			candidates = append(candidates, scoredAgent{id: id, score: score})
		}
	}

	if len(candidates) == 0 {
		return nil
	}

	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].score > candidates[j].score
	})

	return []string{candidates[0].id}
}

// selectCollaborative selects agents considering collaboration history
func (c *Coordinator) selectCollaborative(task *CoordinationTask) []string {
	// First, find capable agents
	var capable []string
	for id, agent := range c.agents {
		if agent.Status != "idle" {
			continue
		}
		if !c.hasRequiredRole(agent, task.RequiredRole) {
			continue
		}
		capable = append(capable, id)
	}

	if len(capable) == 0 {
		return nil
	}

	// Score by collaboration potential
	type scoredAgent struct {
		id    string
		score float64
	}

	scores := make([]scoredAgent, len(capable))
	for i, id := range capable {
		agent := c.agents[id]
		score := agent.SuccessRate * 0.5

		// Bonus for good collaboration with peers
		if len(task.AssignedTo) > 0 {
			for _, peer := range task.AssignedTo {
				if peerScore, ok := agent.PeerScore[peer]; ok {
					score += peerScore * 0.3
				}
			}
		}

		// Penalty for high load
		score -= agent.Load * 0.2

		scores[i] = scoredAgent{id: id, score: score}
	}

	sort.Slice(scores, func(i, j int) bool {
		return scores[i].score > scores[j].score
	})

	return []string{scores[0].id}
}

// selectSwarm selects agents using swarm intelligence (pheromone trails)
func (c *Coordinator) selectSwarm(task *CoordinationTask) []string {
	// Find agents attracted to pheromone trails related to this task type
	var candidates []string
	pheromoneType := task.RequiredRole

	// Find strongest pheromone trail for this type
	var bestTrail *PheromoneTrail
	for _, trail := range c.pheromones {
		if trail.Type == pheromoneType && trail.Strength > 0.1 {
			if bestTrail == nil || trail.Strength > bestTrail.Strength {
				bestTrail = trail
			}
		}
	}

	// If trail exists, prefer agents near that "location"
	if bestTrail != nil {
		// In a real implementation, "location" could be a task category or skill area
		// Here we use it to select agents with relevant experience
		for id, agent := range c.agents {
			if agent.Status != "idle" {
				continue
			}
			if !c.hasRequiredRole(agent, task.RequiredRole) {
				continue
			}

			// Check if agent has worked on similar tasks
			for _, prevTask := range agent.TaskHistory {
				if prevTask == bestTrail.Location {
					candidates = append([]string{id}, candidates...) // Prefer experienced agents
					continue
				}
			}
			candidates = append(candidates, id)
		}
	} else {
		// No pheromone, fall back to capability-based selection
		return c.selectByCapability(task)
	}

	if len(candidates) == 0 {
		return nil
	}

	return candidates[:1]
}

// calculateCapabilityScore calculates how well an agent matches a task
func (c *Coordinator) calculateCapabilityScore(agent *AgentState, task *CoordinationTask) float64 {
	score := 0.0

	// Base score from capabilities
	capabilityMatch := 0
	for _, cap := range agent.Capabilities {
		if cap == task.RequiredRole {
			capabilityMatch++
		}
	}
	score += float64(capabilityMatch) * 10

	// Success rate bonus
	score += agent.SuccessRate * 5

	// Load penalty
	score -= agent.Load * 3

	// Pheromone bonus (swarm intelligence)
	pheromoneKey := task.RequiredRole
	if trail, ok := c.pheromones[pheromoneKey]; ok {
		// Check if agent has contributed to this trail
		for _, prevTask := range agent.TaskHistory {
			if prevTask == trail.Location {
				score += trail.Strength * 5
				break
			}
		}
	}

	return score
}

// hasRequiredRole checks if an agent has the required role
func (c *Coordinator) hasRequiredRole(agent *AgentState, requiredRole string) bool {
	if requiredRole == "" {
		return true
	}

	for _, cap := range agent.Capabilities {
		if cap == requiredRole {
			return true
		}
	}
	return false
}

// initiateTaskAssignment initiates task assignment via A2A negotiation.
// Returns a callback to invoke after releasing the lock to prevent deadlock.
func (c *Coordinator) initiateTaskAssignment(task *CoordinationTask, agents []string) func() {
	// Remove from pending
	delete(c.pendingTasks, task.ID)

	// Mark as assigned
	task.Status = "assigned"
	task.AssignedTo = agents
	task.StartedAt = time.Now()

	// Move to running
	c.runningTasks[task.ID] = task

	// Send task request to selected agents
	for _, agentID := range agents {
		msg := NewMessage(MessageTypeTaskRequest, "coordinator", agentID).
			WithPayload(&TaskRequestPayload{
				TaskID:       task.ID,
				Title:        task.Title,
				Description:  task.Description,
				Priority:     task.Priority,
				RequiredRole: task.RequiredRole,
			}).
			WithPriority(Priority(task.Priority))

		// Set callback for task assigned
		msg.WithCorrelation(task.ID)

		c.wg.Add(1)
		go func(m *Message) {
			defer func() {
				c.wg.Done()
				if r := recover(); r != nil {
					a2aLog.Error("Send task request panic", "panic", r)
				}
			}()
			if err := c.router.Send(m); err != nil {
				a2aLog.Error("Failed to send task request", "to", m.To, "error", err)
			}
		}(msg)

		// Update agent state for each assigned agent
		if agent, ok := c.agents[agentID]; ok {
			agent.Status = "busy"
			agent.CurrentTask = task.ID
			agent.Load = min(1.0, agent.Load+0.3)
		}
	}

	// Snapshot callback under lock, return for invocation outside lock to prevent deadlock
	onTaskAssigned := c.onTaskAssigned
	assignedAgent := ""
	if len(agents) > 0 {
		assignedAgent = agents[0]
	}
	if onTaskAssigned != nil && assignedAgent != "" {
		return func() { onTaskAssigned(task, assignedAgent) }
	}
	return nil
}

// ============================================================================
// Message Handlers
// ============================================================================

// handleTaskAccept handles task acceptance
func (c *Coordinator) handleTaskAccept(msg *Message) error {
	var payload TaskAcceptPayload
	if err := msg.ParsePayload(&payload); err != nil {
		return err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	task, ok := c.runningTasks[payload.TaskID]
	if !ok {
		return fmt.Errorf("task not found: %s", payload.TaskID)
	}

	// Agent accepted the task
	task.Status = "running"

	// Leave pheromone trail for successful assignment
	c.leavePheromone(task.RequiredRole, payload.AgentID)

	return nil
}

// handleTaskReject handles task rejection
func (c *Coordinator) handleTaskReject(msg *Message) error {
	var payload struct {
		TaskID string `json:"taskId"`
		Reason string `json:"reason"`
	}
	if err := msg.ParsePayload(&payload); err != nil {
		return err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	task, ok := c.runningTasks[payload.TaskID]
	if !ok {
		return fmt.Errorf("task not found: %s", payload.TaskID)
	}

	// Agent rejected, try to find alternative
	agentID := msg.From

	// Update agent state
	if agent, ok := c.agents[agentID]; ok {
		agent.Status = "idle"
		agent.CurrentTask = ""
		agent.Load = max(0, agent.Load-0.3)
	}

	// Remove from assigned list
	var newAssigned []string
	for _, id := range task.AssignedTo {
		if id != agentID {
			newAssigned = append(newAssigned, id)
		}
	}
	task.AssignedTo = newAssigned

	// If no agents left, put back in pending
	if len(task.AssignedTo) == 0 {
		delete(c.runningTasks, task.ID)
		task.Status = "pending"
		task.Attempts++
		c.pendingTasks[task.ID] = task
	}

	return nil
}

// handleTaskProgress handles task progress updates
func (c *Coordinator) handleTaskProgress(msg *Message) error {
	var payload TaskProgressPayload
	if err := msg.ParsePayload(&payload); err != nil {
		return err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	task, ok := c.runningTasks[payload.TaskID]
	if !ok {
		return nil
	}

	task.Progress = payload.Progress
	return nil
}

// handleTaskComplete handles task completion
func (c *Coordinator) handleTaskComplete(msg *Message) error {
	var payload TaskCompletePayload
	if err := msg.ParsePayload(&payload); err != nil {
		return err
	}

	c.mu.Lock()

	task, ok := c.runningTasks[payload.TaskID]
	if !ok {
		c.mu.Unlock()
		return nil
	}

	agentID := msg.From

	// Store result
	if task.Results == nil {
		task.Results = make(map[string]*TaskResult)
	}
	task.Results[agentID] = &TaskResult{
		TaskID:       payload.TaskID,
		AgentID:      agentID,
		Content:      string(payload.Result),
		FilesChanged: payload.FilesChanged,
		Duration:     payload.Duration,
	}

	// Update agent state
	if agent, ok := c.agents[agentID]; ok {
		agent.Status = "idle"
		agent.CurrentTask = ""
		agent.Load = max(0, agent.Load-0.3)
		agent.SuccessRate = (agent.SuccessRate*9 + 1) / 10 // Rolling average
		agent.TaskHistory = append(agent.TaskHistory, payload.TaskID)
		if len(agent.TaskHistory) > 100 {
			agent.TaskHistory = agent.TaskHistory[1:]
		}
	}

	// Check if all assigned agents completed
	if len(task.Results) >= len(task.AssignedTo) {
		task.Status = "completed"
		task.Progress = 1.0
		task.CompletedAt = time.Now()
		delete(c.runningTasks, task.ID)
		c.completedTasks[task.ID] = task

		// Clean up old completed tasks if limit is set
		if c.config.MaxCompletedTasks > 0 && len(c.completedTasks) > c.config.MaxCompletedTasks {
			c.cleanupOldCompletedTasks()
		}

		// Leave strong pheromone trail on success
		c.leavePheromone(task.RequiredRole, task.ID)

		// Snapshot callback under lock, invoke outside lock to prevent deadlock
		onTaskComplete := c.onTaskComplete
		var taskResult *TaskResult
		for _, r := range task.Results {
			taskResult = r
			break
		}
		c.mu.Unlock()

		if onTaskComplete != nil {
			onTaskComplete(task, taskResult)
		}
		return nil
	}

	c.mu.Unlock()
	return nil
}

// handleTaskFailed handles task failure
func (c *Coordinator) handleTaskFailed(msg *Message) error {
	var payload TaskFailedPayload
	if err := msg.ParsePayload(&payload); err != nil {
		return err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	task, ok := c.runningTasks[payload.TaskID]
	if !ok {
		return nil
	}

	agentID := msg.From

	// Update agent state
	if agent, ok := c.agents[agentID]; ok {
		agent.Status = "idle"
		agent.CurrentTask = ""
		agent.Load = max(0, agent.Load-0.3)
		agent.SuccessRate = (agent.SuccessRate * 9) / 10 // Rolling average
	}

	// Store failure
	if task.Results == nil {
		task.Results = make(map[string]*TaskResult)
	}
	task.Results[agentID] = &TaskResult{
		TaskID: payload.TaskID,
		Error:  payload.Error,
	}

	// Check if all failed
	allFailed := true
	for _, id := range task.AssignedTo {
		if r, ok := task.Results[id]; !ok || r.Error == "" {
			allFailed = false
			break
		}
	}

	if allFailed {
		task.Status = "failed"
		delete(c.runningTasks, task.ID)
		c.completedTasks[task.ID] = task

		// Clean up old completed tasks if limit is set
		if c.config.MaxCompletedTasks > 0 && len(c.completedTasks) > c.config.MaxCompletedTasks {
			c.cleanupOldCompletedTasks()
		}
	}

	return nil
}

// handleHelpRequest handles help requests between agents
func (c *Coordinator) handleHelpRequest(msg *Message) error {
	var payload HelpRequestPayload
	if err := msg.ParsePayload(&payload); err != nil {
		return err
	}

	// Snapshot agent fields under lock to prevent data race
	type agentSnapshot struct {
		status       string
		capabilities []string
	}
	c.mu.RLock()
	agents := make(map[string]agentSnapshot, len(c.agents))
	for id, agent := range c.agents {
		caps := make([]string, len(agent.Capabilities))
		copy(caps, agent.Capabilities)
		agents[id] = agentSnapshot{
			status:       agent.Status,
			capabilities: caps,
		}
	}
	c.mu.RUnlock()

	// Find available agents with required skills
	var helpers []string
	for id, agent := range agents {
		if agent.status != "idle" {
			continue
		}

		hasSkill := false
		for _, skill := range payload.Skills {
			for _, cap := range agent.capabilities {
				if cap == skill {
					hasSkill = true
					break
				}
			}
			if hasSkill {
				break
			}
		}

		if hasSkill || len(payload.Skills) == 0 {
			helpers = append(helpers, id)
		}
	}

	// Send help offers to eligible agents
	for _, helperID := range helpers {
		offer := NewMessage(MessageTypeHelpOffer, "coordinator", helperID).
			WithPayload(&HelpOfferPayload{
				RequestID: msg.ID,
				AgentID:   helperID,
				Skills:    payload.Skills,
				Available: true,
			})

		c.wg.Add(1)
		go func(m *Message) {
			defer func() {
				c.wg.Done()
				if r := recover(); r != nil {
					a2aLog.Error("Help offer send panic", "panic", r)
				}
			}()
			if err := c.router.Send(m); err != nil {
				a2aLog.Error("Failed to send help offer", "to", m.To, "error", err)
			}
		}(offer)
	}

	return nil
}

// handleHelpOffer handles help offers from agents
func (c *Coordinator) handleHelpOffer(msg *Message) error {
	// Help offers are forwarded to the requesting agent
	return nil
}

// handleProposal handles negotiation proposals
func (c *Coordinator) handleProposal(msg *Message) error {
	var payload ProposalPayload
	if err := msg.ParsePayload(&payload); err != nil {
		return err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	// Create negotiation record
	negotiation := &Negotiation{
		ID:        payload.ProposalID,
		Proposer:  msg.From,
		Status:    "pending",
		Terms:     payload.Content,
		CreatedAt: time.Now(),
	}

	// Find affected task
	for _, task := range c.runningTasks {
		for _, agentID := range task.AssignedTo {
			if agentID == msg.From {
				task.Negotiations = append(task.Negotiations, negotiation)
				// Limit negotiation history to prevent unbounded growth
				const maxNegotiations = 100
				if len(task.Negotiations) > maxNegotiations {
					task.Negotiations = task.Negotiations[len(task.Negotiations)-maxNegotiations:]
				}
				break
			}
		}
	}

	return nil
}

// handleAgreement handles agreement messages
func (c *Coordinator) handleAgreement(msg *Message) error {
	var payload AgreementPayload
	if err := msg.ParsePayload(&payload); err != nil {
		return err
	}

	// Update negotiation status
	c.mu.Lock()
	defer c.mu.Unlock()

	for _, task := range c.runningTasks {
		for _, neg := range task.Negotiations {
			if neg.ID == payload.ProposalID {
				neg.Status = "accepted"
				// Deduplicate: skip if agent already responded
				alreadyResponded := slices.Contains(neg.Responders, payload.AgentID)
				if !alreadyResponded {
					neg.Responders = append(neg.Responders, payload.AgentID)
					// Limit responders to prevent unbounded growth
					if len(neg.Responders) > 50 {
						neg.Responders = neg.Responders[len(neg.Responders)-50:]
					}
				}
			}
		}
	}

	return nil
}

// handlePheromone handles pheromone messages (swarm intelligence)
func (c *Coordinator) handlePheromone(msg *Message) error {
	var payload PheromonePayload
	if err := msg.ParsePayload(&payload); err != nil {
		return err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	key := payload.PheromoneType + ":" + payload.Location

	if existing, ok := c.pheromones[key]; ok {
		// Reinforce existing trail
		existing.Strength = min(1.0, existing.Strength+payload.Strength)
		existing.UpdatedAt = time.Now()
	} else {
		// Create new trail
		c.pheromones[key] = &PheromoneTrail{
			Type:      payload.PheromoneType,
			Location:  payload.Location,
			Strength:  payload.Strength,
			DecayRate: payload.Decay,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}

		// Trim old pheromones to prevent unbounded memory growth
		c.trimPheromones()
	}

	return nil
}

// trimPheromones removes oldest pheromone trails when the limit is exceeded.
// Must be called while holding c.mu.
func (c *Coordinator) trimPheromones() {
	if c.config.MaxPheromones <= 0 {
		return // unlimited
	}

	if len(c.pheromones) <= c.config.MaxPheromones {
		return
	}

	// Find and remove oldest trails
	// Collect all trails with their keys for sorting
	type entry struct {
		key       string
		createdAt time.Time
	}
	entries := make([]entry, 0, len(c.pheromones))
	for k, v := range c.pheromones {
		entries = append(entries, entry{key: k, createdAt: v.CreatedAt})
	}

	// Sort by creation time (oldest first)
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].createdAt.Before(entries[j].createdAt)
	})

	// Remove oldest entries until we're under the limit
	toRemove := len(c.pheromones) - c.config.MaxPheromones
	for i := range toRemove {
		delete(c.pheromones, entries[i].key)
	}
}

// ============================================================================
// Pheromone Management (Swarm Intelligence)
// ============================================================================

// leavePheromone leaves a pheromone trail
func (c *Coordinator) leavePheromone(pheromoneType, location string) {
	key := pheromoneType + ":" + location

	if existing, ok := c.pheromones[key]; ok {
		existing.Strength = min(1.0, existing.Strength+0.2)
		existing.UpdatedAt = time.Now()
	} else {
		c.pheromones[key] = &PheromoneTrail{
			Type:      pheromoneType,
			Location:  location,
			Strength:  0.3,
			DecayRate: c.config.PheromoneDecay,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
	}
}

// pheromoneDecayLoop handles pheromone decay
func (c *Coordinator) pheromoneDecayLoop() {
	defer c.wg.Done()

	// Snapshot context to avoid data race on c.ctx
	ctx := c.ctx

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.decayPheromones()
		}
	}
}

// decayPheromones decays all pheromone trails
func (c *Coordinator) decayPheromones() {
	c.mu.Lock()
	defer c.mu.Unlock()

	for key, trail := range c.pheromones {
		trail.Strength -= trail.DecayRate
		if trail.Strength <= 0 {
			delete(c.pheromones, key)
		}
	}
}

// cleanupOldCompletedTasks removes old completed tasks to prevent memory leaks
// Must be called with lock already held
func (c *Coordinator) cleanupOldCompletedTasks() {
	if c.config.MaxCompletedTasks <= 0 || len(c.completedTasks) <= c.config.MaxCompletedTasks {
		return
	}

	// Find the oldest tasks to remove
	type taskWithTime struct {
		id   string
		time time.Time
	}

	var tasks []taskWithTime
	for id, task := range c.completedTasks {
		tasks = append(tasks, taskWithTime{id: id, time: task.CompletedAt})
	}

	// Sort by completion time (oldest first)
	sort.Slice(tasks, func(i, j int) bool {
		return tasks[i].time.Before(tasks[j].time)
	})

	// Remove oldest tasks until we're under the limit
	toRemove := len(c.completedTasks) - c.config.MaxCompletedTasks
	for i := range min(toRemove, len(tasks)) {
		delete(c.completedTasks, tasks[i].id)
	}
}

// ============================================================================
// Statistics and Callbacks
// ============================================================================

// GetStats returns coordinator statistics
func (c *Coordinator) GetStats() *CoordinatorStats {
	c.mu.RLock()
	defer c.mu.RUnlock()

	idleAgents := 0
	busyAgents := 0
	for _, agent := range c.agents {
		switch agent.Status {
		case "idle":
			idleAgents++
		case "busy":
			busyAgents++
		}
	}

	return &CoordinatorStats{
		TotalAgents:    len(c.agents),
		IdleAgents:     idleAgents,
		BusyAgents:     busyAgents,
		PendingTasks:   len(c.pendingTasks),
		RunningTasks:   len(c.runningTasks),
		CompletedTasks: len(c.completedTasks),
		PheromoneCount: len(c.pheromones),
	}
}

// CoordinatorStats holds coordinator statistics
type CoordinatorStats struct {
	TotalAgents    int `json:"totalAgents"`
	IdleAgents     int `json:"idleAgents"`
	BusyAgents     int `json:"busyAgents"`
	PendingTasks   int `json:"pendingTasks"`
	RunningTasks   int `json:"runningTasks"`
	CompletedTasks int `json:"completedTasks"`
	PheromoneCount int `json:"pheromoneCount"`
}

// OnTaskAssigned registers a callback for task assignment events
func (c *Coordinator) OnTaskAssigned(fn func(task *CoordinationTask, agent string)) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.onTaskAssigned = fn
}

// OnTaskComplete registers a callback for task completion events
func (c *Coordinator) OnTaskComplete(fn func(task *CoordinationTask, result *TaskResult)) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.onTaskComplete = fn
}

// OnAgentAvailable registers a callback for agent availability events
func (c *Coordinator) OnAgentAvailable(fn func(agentID string)) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.onAgentAvailable = fn
}

// RequestHelp broadcasts a help request to available agents
func (c *Coordinator) RequestHelp(ctx context.Context, taskID, reason string, skills []string, urgency int) error {
	msg := NewMessage(MessageTypeHelpRequest, "coordinator", "broadcast").
		WithPayload(&HelpRequestPayload{
			TaskID:  taskID,
			Reason:  reason,
			Skills:  skills,
			Urgency: urgency,
		}).
		WithPriority(Priority(urgency))

	return c.router.Send(msg)
}

// BroadcastKnowledge shares knowledge with all agents
func (c *Coordinator) BroadcastKnowledge(ctx context.Context, knowledgeType, title string, content any, relevance []string) error {
	contentJSON, err := json.Marshal(content)
	if err != nil {
		return fmt.Errorf("failed to marshal knowledge content: %w", err)
	}

	msg := NewMessage(MessageTypeKnowledgeShare, "coordinator", "broadcast").
		WithPayload(&KnowledgeSharePayload{
			Type:      knowledgeType,
			Title:     title,
			Content:   contentJSON,
			Relevance: relevance,
		})

	return c.router.Send(msg)
}
