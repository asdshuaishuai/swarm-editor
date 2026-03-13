// Package swarm implements the swarm orchestration system
package swarm

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
)

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

// Swarm represents a coordinated group of agents
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

	tasks     map[string]*Task
	taskQueue []*Task
	completed []*Task

	consensusThreshold float64
	votingTimeout      time.Duration

	ctx    context.Context
	cancel context.CancelFunc

	onTaskComplete func(task *Task)
	onConsensus    func(result *SwarmConsensusResult)
}

// SwarmConfig configures a swarm
type SwarmConfig struct {
	ID                 string
	Name               string
	Topology           TopologyType
	Strategy           TaskStrategy
	AgentCount         int
	AgentTypes         []agent.AgentType
	ConsensusThreshold float64
	VotingTimeout      time.Duration
}

// NewSwarm creates a new swarm
func NewSwarm(config SwarmConfig) *Swarm {
	s := &Swarm{
		ID:                 config.ID,
		Name:               config.Name,
		Topology:           config.Topology,
		Strategy:           config.Strategy,
		State:              SwarmStateInitializing,
		agents:             make(map[acp.AgentID]*agent.Agent),
		edges:              make(map[acp.AgentID][]acp.AgentID),
		tasks:              make(map[string]*Task),
		consensusThreshold: config.ConsensusThreshold,
		votingTimeout:      config.VotingTimeout,
	}

	// Initialize consensus engine with default config
	if s.consensusThreshold == 0 {
		s.consensusThreshold = 0.51
	}
	if s.votingTimeout == 0 {
		s.votingTimeout = 30 * time.Second
	}

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

	// Update topology edges
	s.buildTopology()
}

// RemoveAgent removes an agent from the swarm
func (s *Swarm) RemoveAgent(id acp.AgentID) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.agents, id)
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

// GetNeighbors returns the neighbors of an agent in the topology
func (s *Swarm) GetNeighbors(id acp.AgentID) []acp.AgentID {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.edges[id]
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

// Stop stops the swarm
func (s *Swarm) Stop() error {
	s.mu.Lock()
	s.State = SwarmStateStopping
	if s.cancel != nil {
		s.cancel()
	}
	s.mu.Unlock()

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

	result.CompletedAt = time.Now()
	if err != nil {
		result.Error = err.Error()
	}

	s.mu.Lock()
	task.State = TaskStateCompleted
	task.Result = result
	s.completed = append(s.completed, task)
	s.mu.Unlock()

	if s.onTaskComplete != nil {
		s.onTaskComplete(task)
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
	if len(agents) == 0 {
		return fmt.Errorf("no available agents")
	}

	var wg sync.WaitGroup
	errCh := make(chan error, len(agents))

	for _, a := range agents {
		wg.Add(1)
		go func(ag *agent.Agent) {
			defer wg.Done()
			ag.SetState(agent.StateExecuting)

			// Execute task
			_, err := ag.Execute(ctx, task.Prompt)
			if err != nil {
				errCh <- fmt.Errorf("agent %s: %w", ag.ID, err)
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
		return fmt.Errorf("execution errors: %v", errors)
	}

	return nil
}

// Vote initiates a consensus vote
func (s *Swarm) Vote(ctx context.Context, proposal *Proposal) (*SwarmConsensusResult, error) {
	if proposal == nil {
		return nil, fmt.Errorf("proposal cannot be nil")
	}

	s.mu.RLock()
	agents := make([]*agent.Agent, 0, len(s.agents))
	for _, a := range s.agents {
		agents = append(agents, a)
	}
	s.mu.RUnlock()

	votes := make(map[acp.AgentID]SwarmVote)
	voteCh := make(chan SwarmVote, len(agents))

	// Collect votes from all agents
	var wg sync.WaitGroup
	for _, a := range agents {
		wg.Add(1)
		go func(ag *agent.Agent) {
			defer wg.Done()
			vote := s.collectVote(ctx, ag, proposal)
			voteCh <- vote
		}(a)
	}

	wg.Wait()
	close(voteCh)

	for vote := range voteCh {
		votes[vote.AgentID] = vote
	}

	// Calculate consensus
	result := s.calculateConsensus(proposal, votes)

	if s.onConsensus != nil {
		s.onConsensus(result)
	}

	return result, nil
}

func (s *Swarm) collectVote(ctx context.Context, a *agent.Agent, proposal *Proposal) SwarmVote {
	// Simulate vote collection (would be replaced with actual agent decision)
	approve := rand.Float64() > 0.3 // 70% approval rate simulation
	return SwarmVote{
		AgentID: acp.AgentID(a.ID),
		Approve: approve,
		Comment: "",
		Weight:  1.0,
	}
}

func (s *Swarm) calculateConsensus(proposal *Proposal, votes map[acp.AgentID]SwarmVote) *SwarmConsensusResult {
	if proposal == nil {
		return &SwarmConsensusResult{
			Status:       "disagreed",
			ApprovalRate: 0,
			Votes:        votes,
		}
	}

	totalWeight := 0.0
	approveWeight := 0.0

	for _, vote := range votes {
		totalWeight += vote.Weight
		if vote.Approve {
			approveWeight += vote.Weight
		}
	}

	// Avoid division by zero
	if totalWeight == 0 {
		return &SwarmConsensusResult{
			ProposalID:   proposal.ID,
			Status:       "disagreed",
			ApprovalRate: 0,
			Votes:        votes,
		}
	}

	approvalRate := approveWeight / totalWeight
	consensus := approvalRate >= s.consensusThreshold

	status := "disagreed"
	if consensus {
		status = "agreed"
	} else if approvalRate > 0.5 {
		status = "partial"
	}

	return &SwarmConsensusResult{
		ProposalID:   proposal.ID,
		Status:       status,
		ApprovalRate: approvalRate,
		Votes:        votes,
	}
}

// OnTaskComplete registers a callback for task completion
func (s *Swarm) OnTaskComplete(fn func(task *Task)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onTaskComplete = fn
}

// OnConsensus registers a callback for consensus results
func (s *Swarm) OnConsensus(fn func(result *SwarmConsensusResult)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onConsensus = fn
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

// Proposal represents a proposal for consensus
type Proposal struct {
	ID          string
	Title       string
	Description string
	Content     json.RawMessage
	CreatedAt   time.Time
}

// SwarmVote represents an agent's vote in swarm consensus
type SwarmVote struct {
	AgentID acp.AgentID
	Approve bool
	Comment string
	Weight  float64
}

// SwarmConsensusResult represents the result of a swarm consensus vote
type SwarmConsensusResult struct {
	ProposalID   string
	Status       string // "agreed", "disagreed", "partial"
	ApprovalRate float64
	Votes        map[acp.AgentID]SwarmVote
}
