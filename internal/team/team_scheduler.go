// Package team implements team-based scheduling enhancements
package team

import (
	"context"
	"fmt"
	"log"
	"sort"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/a2a"
	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
)

// SchedulingMode defines how tasks are assigned within a team
type SchedulingMode string

const (
	SchedulingModeHierarchical  SchedulingMode = "hierarchical"  // Leader assigns tasks
	SchedulingModeRoundRobin    SchedulingMode = "round_robin"   // Tasks rotate among members
	SchedulingModeBestFit       SchedulingMode = "best_fit"      // Best qualified member gets task
	SchedulingModeCollaborative SchedulingMode = "collaborative" // Team decides together
	SchedulingModeAuction       SchedulingMode = "auction"       // Members bid on tasks
)

// TeamSchedulerConfig configures team scheduling
type TeamSchedulerConfig struct {
	Mode          SchedulingMode
	MaxParallel   int
	TaskTimeout   time.Duration
	EnableHandoff bool // Enable task handoff between members
	EnableReview  bool // Enable peer review
	EnablePairing bool // Enable pair programming
}

// TeamScheduler handles intelligent task scheduling within teams
type TeamScheduler struct {
	mu sync.RWMutex

	config TeamSchedulerConfig

	// A2A infrastructure
	router      *a2a.Router
	coordinator *a2a.Coordinator

	// Team reference
	team *Team

	// Task queues
	pendingTasks   map[string]*ScheduledTask
	runningTasks   map[string]*ScheduledTask
	completedTasks map[string]*ScheduledTask

	// Agent tracking
	agentLoad    map[string]int
	agentSuccess map[string]float64
	peerScores   map[string]map[string]float64 // Agent collaboration scores

	// Callbacks
	onTaskAssigned func(taskID, agentID string)
	onTaskComplete func(taskID string, result *ScheduledTaskResult)

	// Lifecycle
	running bool
	ctx     context.Context
	cancel  context.CancelFunc
	wg      sync.WaitGroup
}

// ScheduledTask represents a task being scheduled
type ScheduledTask struct {
	ID           string
	Title        string
	Description  string
	Priority     int
	RequiredRole MemberRole

	// Assignment
	AssignedTo   []string
	Dependencies []string

	// State
	Status      string // "pending", "assigned", "running", "review", "completed", "failed"
	Progress    float64
	StartedAt   time.Time
	CompletedAt time.Time

	// Results
	Result *ScheduledTaskResult

	// Handoff history
	Handoffs []TaskHandoffRecord
}

// TaskHandoffRecord records task handoff between members
type TaskHandoffRecord struct {
	From      string    `json:"from"`
	To        string    `json:"to"`
	Reason    string    `json:"reason"`
	Timestamp time.Time `json:"timestamp"`
}

// ScheduledTaskResult represents task execution result
type ScheduledTaskResult struct {
	Output       string
	FilesChanged []string
	Error        string
	Duration     time.Duration
}

// NewTeamScheduler creates a new team scheduler
func NewTeamScheduler(config TeamSchedulerConfig, team *Team, router *a2a.Router, coordinator *a2a.Coordinator) *TeamScheduler {
	if config.MaxParallel <= 0 {
		config.MaxParallel = 5
	}
	if config.TaskTimeout <= 0 {
		config.TaskTimeout = 30 * time.Minute
	}

	return &TeamScheduler{
		config:         config,
		team:           team,
		router:         router,
		coordinator:    coordinator,
		pendingTasks:   make(map[string]*ScheduledTask),
		runningTasks:   make(map[string]*ScheduledTask),
		completedTasks: make(map[string]*ScheduledTask),
		agentLoad:      make(map[string]int),
		agentSuccess:   make(map[string]float64),
		peerScores:     make(map[string]map[string]float64),
	}
}

// Start starts the team scheduler
func (s *TeamScheduler) Start(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.running {
		return fmt.Errorf("scheduler already running")
	}

	s.ctx, s.cancel = context.WithCancel(ctx)
	s.running = true

	log.Printf("[TeamScheduler] Starting scheduler with mode: %s, max parallel: %d", s.config.Mode, s.config.MaxParallel)

	s.wg.Add(1)
	go s.schedulingLoop()

	return nil
}

// Stop stops the scheduler
func (s *TeamScheduler) Stop() {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return
	}
	log.Printf("[TeamScheduler] Stopping scheduler...")
	s.running = false
	if s.cancel != nil {
		s.cancel()
	}
	s.mu.Unlock()

	s.wg.Wait()
	log.Printf("[TeamScheduler] Scheduler stopped")
}

// SubmitTask submits a task for scheduling
func (s *TeamScheduler) SubmitTask(task *ScheduledTask) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	task.Status = "pending"
	s.pendingTasks[task.ID] = task
	log.Printf("[TeamScheduler] Task %s submitted, priority: %d", task.ID, task.Priority)

	return nil
}

// schedulingLoop is the main scheduling loop
func (s *TeamScheduler) schedulingLoop() {
	defer s.wg.Done()

	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			s.scheduleNext()
		}
	}
}

// scheduleNext schedules the next pending task
func (s *TeamScheduler) scheduleNext() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(s.runningTasks) >= s.config.MaxParallel {
		return
	}

	task := s.getNextTask()
	if task == nil {
		return
	}

	agents := s.selectAgents(task)
	if len(agents) == 0 {
		return
	}

	s.assignTask(task, agents)
}

// getNextTask gets the next highest priority task
func (s *TeamScheduler) getNextTask() *ScheduledTask {
	if len(s.pendingTasks) == 0 {
		return nil
	}

	var highest *ScheduledTask
	for _, task := range s.pendingTasks {
		if !s.areDependenciesMet(task) {
			continue
		}

		if highest == nil || task.Priority > highest.Priority {
			highest = task
		}
	}

	return highest
}

// areDependenciesMet checks if task dependencies are satisfied
func (s *TeamScheduler) areDependenciesMet(task *ScheduledTask) bool {
	for _, depID := range task.Dependencies {
		dep, ok := s.completedTasks[depID]
		if !ok || dep.Status != "completed" {
			return false
		}
	}
	return true
}

// selectAgents selects agents based on scheduling mode
func (s *TeamScheduler) selectAgents(task *ScheduledTask) []string {
	availableAgents := s.getAvailableAgents(task.RequiredRole)
	if len(availableAgents) == 0 {
		return nil
	}

	switch s.config.Mode {
	case SchedulingModeHierarchical:
		return s.selectHierarchical(availableAgents, task)
	case SchedulingModeRoundRobin:
		return s.selectRoundRobin(availableAgents, task)
	case SchedulingModeBestFit:
		return s.selectBestFit(availableAgents, task)
	case SchedulingModeCollaborative:
		return s.selectCollaborative(availableAgents, task)
	case SchedulingModeAuction:
		return s.selectAuction(availableAgents, task)
	default:
		return s.selectBestFit(availableAgents, task)
	}
}

// getAvailableAgents returns available agents with the required role
func (s *TeamScheduler) getAvailableAgents(requiredRole MemberRole) []string {
	var available []string

	s.team.mu.RLock()
	defer s.team.mu.RUnlock()

	for id, member := range s.team.Members {
		// Check role if specified
		if requiredRole != "" && member.Role != requiredRole {
			continue
		}

		// Check if agent is not overloaded
		load := s.agentLoad[id]
		if load < 2 { // Max 2 concurrent tasks per agent
			available = append(available, id)
		}
	}

	return available
}

// selectHierarchical selects through team leader decision
func (s *TeamScheduler) selectHierarchical(agents []string, task *ScheduledTask) []string {
	if len(agents) == 0 {
		return nil
	}

	// Score each agent
	type scoredAgent struct {
		id    string
		score float64
	}

	scored := make([]scoredAgent, len(agents))
	for i, id := range agents {
		score := s.calculateAgentScore(id, task)
		scored[i] = scoredAgent{id: id, score: score}
	}

	sort.Slice(scored, func(i, j int) bool {
		return scored[i].score > scored[j].score
	})

	return []string{scored[0].id}
}

// selectRoundRobin selects in round-robin fashion
func (s *TeamScheduler) selectRoundRobin(agents []string, task *ScheduledTask) []string {
	if len(agents) == 0 {
		return nil
	}

	// Find agent with fewest completed tasks
	minTasks := int(^uint(0) >> 1)
	var selected string

	for _, id := range agents {
		load := s.agentLoad[id]
		if load < minTasks {
			minTasks = load
			selected = id
		}
	}

	if selected == "" {
		return []string{agents[0]}
	}

	return []string{selected}
}

// selectBestFit selects the best qualified agent
func (s *TeamScheduler) selectBestFit(agents []string, task *ScheduledTask) []string {
	if len(agents) == 0 {
		return nil
	}

	type scoredAgent struct {
		id    string
		score float64
	}

	scored := make([]scoredAgent, len(agents))
	for i, id := range agents {
		score := s.calculateAgentScore(id, task)
		scored[i] = scoredAgent{id: id, score: score}
	}

	sort.Slice(scored, func(i, j int) bool {
		return scored[i].score > scored[j].score
	})

	return []string{scored[0].id}
}

// selectCollaborative selects multiple agents for collaboration
func (s *TeamScheduler) selectCollaborative(agents []string, task *ScheduledTask) []string {
	if len(agents) == 0 {
		return nil
	}

	// For collaborative mode, select 2-3 agents with good peer scores
	type scoredAgent struct {
		id        string
		score     float64
		peerScore float64
	}

	scored := make([]scoredAgent, len(agents))
	for i, id := range agents {
		score := s.calculateAgentScore(id, task)
		peerScore := s.calculatePeerScore(id)
		scored[i] = scoredAgent{id: id, score: score, peerScore: peerScore}
	}

	// Sort by combined score
	sort.Slice(scored, func(i, j int) bool {
		return scored[i].score+scored[i].peerScore > scored[j].score+scored[j].peerScore
	})

	// Select top 2 for collaboration
	count := 2
	if len(scored) < count {
		count = len(scored)
	}

	result := make([]string, count)
	for i := 0; i < count; i++ {
		result[i] = scored[i].id
	}

	return result
}

// selectAuction selects through bidding process
func (s *TeamScheduler) selectAuction(agents []string, task *ScheduledTask) []string {
	if len(agents) == 0 {
		return nil
	}

	// Simulate auction - agents with higher success rate and lower load "bid" higher
	type bid struct {
		agentID string
		bid     float64
	}

	bids := make([]bid, len(agents))
	for i, id := range agents {
		// Bid is based on capability and availability
		bidValue := s.agentSuccess[id] * 10
		bidValue -= float64(s.agentLoad[id]) * 2
		bids[i] = bid{agentID: id, bid: bidValue}
	}

	sort.Slice(bids, func(i, j int) bool {
		return bids[i].bid > bids[j].bid
	})

	// Select highest bidder
	if bids[0].bid > 0 {
		return []string{bids[0].agentID}
	}

	return nil
}

// calculateAgentScore calculates an agent's score for a task
func (s *TeamScheduler) calculateAgentScore(agentID string, task *ScheduledTask) float64 {
	score := 0.0

	// Success rate bonus
	if successRate, ok := s.agentSuccess[agentID]; ok {
		score += successRate * 5
	} else {
		score += 2.5 // Default score
	}

	// Load penalty
	load := s.agentLoad[agentID]
	score -= float64(load) * 2

	// Priority bonus for high priority tasks
	if task.Priority >= 3 {
		// Prefer experienced agents for high priority
		if successRate, ok := s.agentSuccess[agentID]; ok && successRate > 0.8 {
			score += 3
		}
	}

	return score
}

// calculatePeerScore calculates collaboration score with peers
func (s *TeamScheduler) calculatePeerScore(agentID string) float64 {
	if peerScores, ok := s.peerScores[agentID]; ok {
		total := 0.0
		for _, score := range peerScores {
			total += score
		}
		if len(peerScores) > 0 {
			return total / float64(len(peerScores))
		}
	}
	return 0.0
}

// assignTask assigns a task to selected agents
func (s *TeamScheduler) assignTask(task *ScheduledTask, agents []string) {
	// Remove from pending
	delete(s.pendingTasks, task.ID)

	// Update task
	task.Status = "assigned"
	task.AssignedTo = agents
	task.StartedAt = time.Now()

	// Move to running
	s.runningTasks[task.ID] = task

	// Update agent load
	for _, id := range agents {
		s.agentLoad[id]++
	}

	// Notify via A2A
	for _, agentID := range agents {
		msg := a2a.NewMessage(a2a.MessageTypeTaskRequest, "team_scheduler", agentID).
			WithPayload(&a2a.TaskRequestPayload{
				TaskID:      task.ID,
				Title:       task.Title,
				Description: task.Description,
				Priority:    task.Priority,
			})

		go s.router.Send(msg)
	}

	if s.onTaskAssigned != nil {
		s.onTaskAssigned(task.ID, agents[0])
	}
}

// CompleteTask marks a task as completed
func (s *TeamScheduler) CompleteTask(taskID string, result *ScheduledTaskResult) {
	s.mu.Lock()
	defer s.mu.Unlock()

	task, ok := s.runningTasks[taskID]
	if !ok {
		return
	}

	task.Status = "completed"
	task.Result = result
	task.CompletedAt = time.Now()

	// Move to completed
	delete(s.runningTasks, taskID)
	s.completedTasks[taskID] = task

	// Update agent load and success rate
	for _, id := range task.AssignedTo {
		s.agentLoad[id]--
		if s.agentLoad[id] < 0 {
			s.agentLoad[id] = 0
		}

		// Update success rate (rolling average)
		if result.Error == "" {
			s.agentSuccess[id] = (s.agentSuccess[id]*9 + 1.0) / 10
		} else {
			s.agentSuccess[id] = (s.agentSuccess[id] * 9) / 10
		}
	}

	// Update peer collaboration scores
	if len(task.AssignedTo) > 1 {
		for i, id1 := range task.AssignedTo {
			for j, id2 := range task.AssignedTo {
				if i != j {
					if s.peerScores[id1] == nil {
						s.peerScores[id1] = make(map[string]float64)
					}
					// Successful collaboration increases peer score
					if result.Error == "" {
						s.peerScores[id1][id2] = (s.peerScores[id1][id2]*9 + 1.0) / 10
					}
				}
			}
		}
	}

	if s.onTaskComplete != nil {
		s.onTaskComplete(taskID, result)
	}
}

// HandoffTask hands off a task from one agent to another
func (s *TeamScheduler) HandoffTask(taskID, fromAgent, toAgent, reason string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	task, ok := s.runningTasks[taskID]
	if !ok {
		return fmt.Errorf("task not found: %s", taskID)
	}

	// Record handoff
	handoff := TaskHandoffRecord{
		From:      fromAgent,
		To:        toAgent,
		Reason:    reason,
		Timestamp: time.Now(),
	}
	task.Handoffs = append(task.Handoffs, handoff)

	// Update assignment
	var newAssigned []string
	for _, id := range task.AssignedTo {
		if id != fromAgent {
			newAssigned = append(newAssigned, id)
		}
	}
	newAssigned = append(newAssigned, toAgent)
	task.AssignedTo = newAssigned

	// Update loads
	s.agentLoad[fromAgent]--
	s.agentLoad[toAgent]++

	return nil
}

// GetStats returns scheduler statistics
func (s *TeamScheduler) GetStats() *SchedulerStats {
	s.mu.RLock()
	defer s.mu.RUnlock()

	avgLoad := 0.0
	avgSuccess := 0.0

	for _, load := range s.agentLoad {
		avgLoad += float64(load)
	}
	if len(s.agentLoad) > 0 {
		avgLoad /= float64(len(s.agentLoad))
	}

	for _, success := range s.agentSuccess {
		avgSuccess += success
	}
	if len(s.agentSuccess) > 0 {
		avgSuccess /= float64(len(s.agentSuccess))
	}

	return &SchedulerStats{
		PendingTasks:   len(s.pendingTasks),
		RunningTasks:   len(s.runningTasks),
		CompletedTasks: len(s.completedTasks),
		AverageLoad:    avgLoad,
		AverageSuccess: avgSuccess,
		SchedulingMode: string(s.config.Mode),
	}
}

// SchedulerStats holds scheduler statistics
type SchedulerStats struct {
	PendingTasks   int     `json:"pendingTasks"`
	RunningTasks   int     `json:"runningTasks"`
	CompletedTasks int     `json:"completedTasks"`
	AverageLoad    float64 `json:"averageLoad"`
	AverageSuccess float64 `json:"averageSuccess"`
	SchedulingMode string  `json:"schedulingMode"`
}

// RegisterTeamAgent registers an agent for a specific team
func (s *TeamScheduler) RegisterTeamAgent(agentID string, a *agent.Agent) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.agentLoad[agentID] = 0
	s.agentSuccess[agentID] = 1.0
	s.peerScores[agentID] = make(map[string]float64)
}

// Callbacks

// OnTaskAssigned registers a callback for task assignment events
func (s *TeamScheduler) OnTaskAssigned(fn func(taskID, agentID string)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onTaskAssigned = fn
}

// OnTaskComplete registers a callback for task completion events
func (s *TeamScheduler) OnTaskComplete(fn func(taskID string, result *ScheduledTaskResult)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onTaskComplete = fn
}

// AgentToAgentCoordination enables direct agent-to-agent coordination
type AgentToAgentCoordination struct {
	mu sync.RWMutex

	router *a2a.Router
	team   *Team

	// Active collaborations
	collaborations map[string]*Collaboration
}

// Collaboration represents an active collaboration between agents
type Collaboration struct {
	ID        string
	TaskID    string
	Agents    []string
	Type      string // "pair_programming", "review", "help", "sync"
	Status    string
	StartedAt time.Time
}

// NewAgentToAgentCoordination creates a new A2A coordination handler
func NewAgentToAgentCoordination(router *a2a.Router, team *Team) *AgentToAgentCoordination {
	return &AgentToAgentCoordination{
		router:         router,
		team:           team,
		collaborations: make(map[string]*Collaboration),
	}
}

// RequestHelp allows an agent to request help from teammates
func (c *AgentToAgentCoordination) RequestHelp(ctx context.Context, fromAgent, taskID, reason string, requiredSkills []string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Find available teammates with required skills
	c.team.mu.RLock()
	var helpers []string
	for id, member := range c.team.Members {
		if id == fromAgent {
			continue
		}

		// Check if member has required skills
		hasSkill := len(requiredSkills) == 0 // If no skills required, anyone can help
		if member.AgentID != nil {
			// Check agent capabilities
			_ = acp.AgentID("") // Placeholder for capability check
		}

		if hasSkill {
			helpers = append(helpers, id)
		}
	}
	c.team.mu.RUnlock()

	if len(helpers) == 0 {
		return fmt.Errorf("no available helpers")
	}

	// Send help request via A2A
	for _, helperID := range helpers {
		msg := a2a.NewMessage(a2a.MessageTypeHelpRequest, fromAgent, helperID).
			WithPayload(&a2a.HelpRequestPayload{
				TaskID:  taskID,
				Reason:  reason,
				Skills:  requiredSkills,
				Urgency: 3, // Medium urgency
			})

		go func(m *a2a.Message) {
			if err := c.router.Send(m); err != nil {
				log.Printf("AgentToAgentCoordination: failed to send help request to %s: %v", m.To, err)
			}
		}(msg)
	}

	return nil
}

// StartCollaboration initiates a collaboration between agents
func (c *AgentToAgentCoordination) StartCollaboration(collaborationType, taskID string, agents []string) *Collaboration {
	c.mu.Lock()
	defer c.mu.Unlock()

	collab := &Collaboration{
		ID:        fmt.Sprintf("collab_%d", time.Now().UnixNano()),
		TaskID:    taskID,
		Agents:    agents,
		Type:      collaborationType,
		Status:    "active",
		StartedAt: time.Now(),
	}

	c.collaborations[collab.ID] = collab

	// Notify all agents
	for _, agentID := range agents {
		msg := a2a.NewMessage(a2a.MessageTypeSync, "coordination", agentID).
			WithPayload(&a2a.SyncPayload{
				StateType: "collaboration",
				State:     nil, // Would contain collaboration details
			})

		go func(m *a2a.Message) {
			if err := c.router.Send(m); err != nil {
				log.Printf("AgentToAgentCoordination: failed to send collaboration sync to %s: %v", m.To, err)
			}
		}(msg)
	}

	return collab
}

// EndCollaboration ends a collaboration
func (c *AgentToAgentCoordination) EndCollaboration(collaborationID string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if collab, ok := c.collaborations[collaborationID]; ok {
		collab.Status = "completed"
		delete(c.collaborations, collaborationID)
	}
}
