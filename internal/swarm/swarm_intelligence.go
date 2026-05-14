// Package swarm implements swarm intelligence scheduling with A2A coordination
package swarm

import (
	"context"
	"encoding/json"
	"fmt"
	"maps"
	"math/rand/v2"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/swarm-editor/swarm-editor/internal/a2a"
	"github.com/swarm-editor/swarm-editor/internal/log"
)

// swarmIntelLog is a scoped logger for the SwarmIntelligenceScheduler component.
var swarmIntelLog = log.With("component", "SwarmIntelligence")

// SwarmIntelligenceConfig configures the swarm intelligence scheduler
type SwarmIntelligenceConfig struct {
	// Pheromone settings
	PheromoneDecayRate   float64       `json:"pheromoneDecayRate"`   // Decay rate per second
	PheromoneDepositBase float64       `json:"pheromoneDepositBase"` // Base deposit amount
	PheromoneEvaporate   time.Duration `json:"pheromoneEvaporate"`   // Evaporation interval

	// Emergence detection
	SignalThreshold     float64 `json:"signalThreshold"`     // Threshold for signal detection
	CongestionThreshold float64 `json:"congestionThreshold"` // Load threshold for congestion signal
	OpportunityWindow   int     `json:"opportunityWindow"`   // Tasks to consider for opportunity

	// Negotiation settings
	NegotiationTimeout time.Duration `json:"negotiationTimeout"`
	BidWeight          float64       `json:"bidWeight"` // Weight for bid scoring

	// Swarm behavior
	ExplorationRate float64 `json:"explorationRate"` // Probability of random agent selection
	ConvergenceRate float64 `json:"convergenceRate"` // How fast agents converge on good paths
}

// signalRetentionDuration is how long emergent signals are kept before cleanup
const signalRetentionDuration = 5 * time.Minute

// DefaultSwarmIntelligenceConfig returns default configuration
func DefaultSwarmIntelligenceConfig() SwarmIntelligenceConfig {
	return SwarmIntelligenceConfig{
		PheromoneDecayRate:   0.1,
		PheromoneDepositBase: 1.0,
		PheromoneEvaporate:   5 * time.Second,
		SignalThreshold:      0.6,
		CongestionThreshold:  0.8,
		OpportunityWindow:    10,
		NegotiationTimeout:   10 * time.Second,
		BidWeight:            0.5,
		ExplorationRate:      0.1,
		ConvergenceRate:      0.3,
	}
}

// SwarmIntelligenceScheduler extends Scheduler with A2A and emergent behavior
type SwarmIntelligenceScheduler struct {
	*Scheduler // Embed existing scheduler

	mu sync.RWMutex

	config SwarmIntelligenceConfig

	// A2A infrastructure
	router      *a2a.Router
	coordinator *a2a.Coordinator

	// Pheromone trails - task type -> agent -> strength
	pheromones map[string]map[string]float64

	// Emergent signals
	signals  map[string]*EmergentSignal
	signalMu sync.RWMutex

	// Agent performance tracking
	agentPerformance map[string]*AgentPerformance

	// Negotiation state
	activeNegotiations map[string]*Negotiation

	// Topology for A2A routing
	swarmTopology TopologyType

	// Lifecycle
	ctx     context.Context
	cancel  context.CancelFunc
	wg      sync.WaitGroup
	running bool
}

// AgentPerformance tracks agent performance metrics
type AgentPerformance struct {
	mu sync.RWMutex

	AgentID string

	// Task performance
	TasksCompleted  int
	TasksFailed     int
	AverageDuration time.Duration
	TotalDuration   time.Duration

	// Specialization (task type -> success rate)
	Specialization map[string]float64

	// Recent performance trend (last N tasks)
	RecentSuccess []bool
	TrendWindow   int
}

// EmergentSignal represents a detected emergent signal
type EmergentSignal struct {
	Type        string    `json:"type"` // "congestion", "opportunity", "collaboration", "danger", "innovation", "pattern_found", "self_organization", "synergy"
	Location    string    `json:"location"`
	Strength    float64   `json:"strength"`
	Timestamp   time.Time `json:"timestamp"`
	Agents      []string  `json:"agents"`
	Description string    `json:"description"`
	// Additional context for enhanced signals
	Pattern    string         `json:"pattern,omitempty"`    // Detected pattern name
	Metadata   map[string]any `json:"metadata,omitempty"`   // Additional signal data
	Confidence float64        `json:"confidence,omitempty"` // Detection confidence 0-1
}

// Negotiation represents an active negotiation between agents
type Negotiation struct {
	ID           string
	TaskID       string
	Initiator    string
	Participants []string
	Bids         map[string]*Bid
	Status       string // "pending", "evaluating", "completed", "cancelled"
	CreatedAt    time.Time
	Deadline     time.Time
	Winner       string
}

// Bid represents an agent's bid for a task
type Bid struct {
	AgentID      string
	TaskID       string
	Capability   float64 // How well agent can do the task
	Availability float64 // How available the agent is
	Cost         float64 // Estimated cost/duration
	Value        float64 // Computed bid value
	Reason       string
	Timestamp    time.Time
}

// NewSwarmIntelligenceScheduler creates a new swarm intelligence scheduler
func NewSwarmIntelligenceScheduler(
	scheduler *Scheduler,
	config SwarmIntelligenceConfig,
	router *a2a.Router,
	coordinator *a2a.Coordinator,
) *SwarmIntelligenceScheduler {
	if router == nil {
		router = a2a.NewRouter(a2a.RouterConfig{})
	}
	if coordinator == nil {
		coordinator = a2a.NewCoordinator(a2a.CoordinatorConfig{}, router)
	}

	return &SwarmIntelligenceScheduler{
		Scheduler:          scheduler,
		config:             config,
		router:             router,
		coordinator:        coordinator,
		pheromones:         make(map[string]map[string]float64),
		signals:            make(map[string]*EmergentSignal),
		agentPerformance:   make(map[string]*AgentPerformance),
		activeNegotiations: make(map[string]*Negotiation),
		swarmTopology:      TopologyMesh,
	}
}

// Start starts the swarm intelligence scheduler
func (s *SwarmIntelligenceScheduler) Start(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Prevent double start
	if s.running {
		return nil
	}

	// Start the base scheduler
	if err := s.Scheduler.Start(ctx); err != nil {
		return fmt.Errorf("failed to start scheduler: %w", err)
	}

	s.running = true

	// Start A2A infrastructure
	if err := s.router.Start(ctx); err != nil {
		s.Scheduler.Stop()
		return fmt.Errorf("failed to start A2A router: %w", err)
	}

	s.ctx, s.cancel = context.WithCancel(ctx)

	// Start pheromone evaporation
	s.wg.Add(1)
	go s.pheromoneEvaporationLoop()

	// Start emergence detection
	s.wg.Add(1)
	go s.emergenceDetectionLoop()

	// Register A2A message handlers
	s.registerA2AHandlers()

	return nil
}

// Stop stops the swarm intelligence scheduler
func (s *SwarmIntelligenceScheduler) Stop() {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return
	}
	s.running = false
	if s.cancel != nil {
		s.cancel()
	}
	s.mu.Unlock()

	s.wg.Wait()
	s.Scheduler.Stop()
	s.router.Stop()
}

// sendAsync sends a message asynchronously with error logging
func (s *SwarmIntelligenceScheduler) sendAsync(msg *a2a.Message) {
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		defer func() {
			if r := recover(); r != nil {
				swarmIntelLog.Error("sendAsync panic", "error", r)
			}
		}()
		if err := s.router.Send(msg); err != nil {
			swarmIntelLog.Error("Failed to send message", "msg_type", msg.Type, "error", err)
		}
	}()
}

// registerA2AHandlers registers handlers for A2A messages
func (s *SwarmIntelligenceScheduler) registerA2AHandlers() {
	// Handle task bids
	s.router.RegisterHandler(a2a.MessageTypeProposal, s.handleProposal)

	// Handle help requests
	s.router.RegisterHandler(a2a.MessageTypeHelpRequest, s.handleHelpRequest)

	// Handle knowledge sharing
	s.router.RegisterHandler(a2a.MessageTypeKnowledgeShare, s.handleKnowledgeShare)

	// Handle sync messages
	s.router.RegisterHandler(a2a.MessageTypeSync, s.handleSync)

	// Handle pheromone signals
	s.router.RegisterHandler(a2a.MessageTypePheromone, s.handlePheromone)

	// Handle emergent signals
	s.router.RegisterHandler(a2a.MessageTypeSignal, s.handleSignal)
}

// SelectAgentsWithIntelligence selects agents using swarm intelligence
func (s *SwarmIntelligenceScheduler) SelectAgentsWithIntelligence(task *Task) []*AgentInfo {
	// Snapshot workers under Scheduler.mu (protects s.Scheduler.workers)
	s.Scheduler.mu.RLock()
	workers := make([]*AgentInfo, 0, len(s.workers))
	for _, w := range s.workers {
		workers = append(workers, w)
	}
	s.Scheduler.mu.RUnlock()

	// Snapshot config and pheromones under s.mu (SwarmIntelligenceScheduler fields)
	s.mu.RLock()
	explorationRate := s.config.ExplorationRate
	congestionThreshold := s.config.CongestionThreshold
	taskType := s.getTaskType(task)
	var pheromonesCopy map[string]float64
	if pheromones, ok := s.pheromones[taskType]; ok {
		pheromonesCopy = make(map[string]float64, len(pheromones))
		maps.Copy(pheromonesCopy, pheromones)
	}
	s.mu.RUnlock()

	if len(workers) == 0 {
		return nil
	}

	// Check for exploration (random selection)
	if explorationRate > 0 && randomFloat() < explorationRate {
		return s.selectRandomAgents(workers, task)
	}

	// Use pheromone trails if available
	if pheromonesCopy != nil {
		return s.selectByPheromoneWithConfig(workers, pheromonesCopy, task, congestionThreshold)
	}

	// Fall back to negotiation
	return s.selectByNegotiation(workers, task)
}

// selectByPheromoneWithConfig selects agents based on pheromone strength with explicit config
func (s *SwarmIntelligenceScheduler) selectByPheromoneWithConfig(agents []*AgentInfo, pheromones map[string]float64, task *Task, congestionThreshold float64) []*AgentInfo {
	type scoredAgent struct {
		agent     *AgentInfo
		pheromone float64
		load      int
		score     float64
	}

	scored := make([]scoredAgent, len(agents))
	for i, agent := range agents {
		p := pheromones[agent.ID]
		load := agent.GetLoad()

		// Combine pheromone strength with current load
		score := p*(1-congestionThreshold) - float64(load)*congestionThreshold
		if score < 0 {
			score = 0
		}

		scored[i] = scoredAgent{
			agent:     agent,
			pheromone: p,
			load:      load,
			score:     score,
		}
	}

	// Sort by score
	sort.Slice(scored, func(i, j int) bool {
		return scored[i].score > scored[j].score
	})

	// Select top agent (with bounds check)
	if len(scored) == 0 {
		return nil
	}
	return []*AgentInfo{scored[0].agent}
}

// selectByNegotiation selects agents through negotiation/bidding
func (s *SwarmIntelligenceScheduler) selectByNegotiation(agents []*AgentInfo, task *Task) []*AgentInfo {
	// Create negotiation
	negotiation := &Negotiation{
		ID:           fmt.Sprintf("neg_%s", uuid.New().String()[:8]),
		TaskID:       task.ID,
		Initiator:    "swarm_scheduler",
		Participants: make([]string, len(agents)),
		Bids:         make(map[string]*Bid),
		Status:       "pending",
		CreatedAt:    time.Now(),
		Deadline:     time.Now().Add(s.config.NegotiationTimeout),
	}

	for i, a := range agents {
		negotiation.Participants[i] = a.ID
	}

	s.mu.Lock()
	s.activeNegotiations[negotiation.ID] = negotiation
	s.mu.Unlock()

	// Request bids from all agents
	s.requestBids(negotiation, task)

	// Wait for bids or timeout (cancellable via context)
	waitDuration := min(100*time.Millisecond, s.config.NegotiationTimeout/2)
	// Guard against zero/negative duration which would panic in NewTimer
	if waitDuration <= 0 {
		waitDuration = 10 * time.Millisecond
	}
	waitTimer := time.NewTimer(waitDuration)
	defer waitTimer.Stop()

	// Capture context for cancellation
	s.mu.RLock()
	ctx := s.ctx
	s.mu.RUnlock()

	if ctx != nil {
		select {
		case <-waitTimer.C:
		case <-ctx.Done():
			// Clean up negotiation to prevent memory leak
			s.mu.Lock()
			delete(s.activeNegotiations, negotiation.ID)
			s.mu.Unlock()
			return nil
		}
	} else {
		<-waitTimer.C
	}

	// Evaluate bids
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(negotiation.Bids) == 0 {
		// No bids received, fall back to least loaded
		delete(s.activeNegotiations, negotiation.ID)
		return s.selectLeastLoaded(agents)
	}

	// Find best bid
	var bestBid *Bid
	for _, bid := range negotiation.Bids {
		if bestBid == nil || bid.Value > bestBid.Value {
			bestBid = bid
		}
	}

	if bestBid == nil {
		delete(s.activeNegotiations, negotiation.ID)
		return s.selectLeastLoaded(agents)
	}

	// Find the agent
	for _, agent := range agents {
		if agent.ID == bestBid.AgentID {
			negotiation.Winner = agent.ID
			negotiation.Status = "completed"
			// Clean up completed negotiation to prevent memory leak
			delete(s.activeNegotiations, negotiation.ID)
			return []*AgentInfo{agent}
		}
	}

	// Agent not found in list, clean up negotiation
	delete(s.activeNegotiations, negotiation.ID)
	return nil
}

// requestBids requests bids from agents for a task
func (s *SwarmIntelligenceScheduler) requestBids(negotiation *Negotiation, task *Task) {
	payload := &a2a.ProposalPayload{
		ProposalID:   negotiation.ID,
		Type:         "task_assignment",
		Proposer:     "swarm_scheduler",
		Content:      safeMarshalJSON(task),
		ValidUntil:   negotiation.Deadline,
		RequiresVote: false,
	}

	// Capture context under lock for goroutines (may be nil if not started)
	s.mu.RLock()
	ctx := s.ctx
	s.mu.RUnlock()

	for _, agentID := range negotiation.Participants {
		msg := a2a.NewMessage(a2a.MessageTypeProposal, "swarm_scheduler", agentID).
			WithPayload(payload).
			WithTTL(s.config.NegotiationTimeout)

		s.wg.Add(1)
		go func(m *a2a.Message) {
			defer func() {
				if r := recover(); r != nil {
					swarmIntelLog.Error("broadcast negotiation panic", "error", r)
				}
				s.wg.Done()
			}()
			// Check if context is cancelled before sending (nil ctx is always "not done")
			if ctx != nil {
				select {
				case <-ctx.Done():
					return
				default:
				}
			}
			if err := s.router.Send(m); err != nil {
				swarmIntelLog.Error("failed to send message", "error", err)
			}
		}(msg)
	}
}

// SubmitBid submits a bid for a negotiation
func (s *SwarmIntelligenceScheduler) SubmitBid(negotiationID string, bid *Bid) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	negotiation, ok := s.activeNegotiations[negotiationID]
	if !ok {
		return fmt.Errorf("negotiation not found: %s", negotiationID)
	}

	if negotiation.Status != "pending" {
		return fmt.Errorf("negotiation not accepting bids: %s", negotiation.Status)
	}

	if time.Now().After(negotiation.Deadline) {
		negotiation.Status = "completed"
		return fmt.Errorf("negotiation deadline passed")
	}

	bid.Timestamp = time.Now()
	// Calculate bid value without re-acquiring lock
	bid.Value = s.calculateBidValueLocked(bid)
	negotiation.Bids[bid.AgentID] = bid

	return nil
}

// calculateBidValueLocked calculates bid value assuming lock is already held
func (s *SwarmIntelligenceScheduler) calculateBidValueLocked(bid *Bid) float64 {
	// Value = Capability * Availability / Cost
	value := bid.Capability * bid.Availability
	if bid.Cost > 0 {
		value /= bid.Cost
	}

	// Apply weight
	value *= s.config.BidWeight

	// Add pheromone bonus if available
	if pheromones, ok := s.pheromones["default"]; ok {
		if p, ok := pheromones[bid.AgentID]; ok {
			value += p * (1 - s.config.BidWeight)
		}
	}

	return value
}

// calculateBidValue calculates the value of a bid (acquires lock).
// Kept for tests and backward compatibility.
func (s *SwarmIntelligenceScheduler) calculateBidValue(bid *Bid) float64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.calculateBidValueLocked(bid)
}

// DepositPheromone deposits pheromone on successful task completion
func (s *SwarmIntelligenceScheduler) DepositPheromone(agentID, taskType string, success bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.pheromones[taskType] == nil {
		s.pheromones[taskType] = make(map[string]float64)
	}

	// Calculate deposit amount
	deposit := s.config.PheromoneDepositBase
	if !success {
		deposit = -deposit * 0.5 // Negative deposit for failures
	}

	// Apply deposit
	current := s.pheromones[taskType][agentID]
	newValue := current + deposit
	if newValue < 0 {
		newValue = 0
	}
	s.pheromones[taskType][agentID] = newValue

	// Broadcast pheromone update via A2A
	msg := a2a.NewMessage(a2a.MessageTypePheromone, "swarm_scheduler", "broadcast").
		WithPayload(&a2a.PheromonePayload{
			PheromoneType: taskType,
			Strength:      newValue,
			Location:      agentID,
			CreatedAt:     time.Now(),
			Decay:         s.config.PheromoneDecayRate,
		})

	s.sendAsync(msg)
}

// pheromoneEvaporationLoop periodically evaporates pheromones
func (s *SwarmIntelligenceScheduler) pheromoneEvaporationLoop() {
	defer s.wg.Done()

	ticker := time.NewTicker(s.config.PheromoneEvaporate)
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			s.evaporatePheromones()
		}
	}
}

// evaporatePheromones applies decay to all pheromones
func (s *SwarmIntelligenceScheduler) evaporatePheromones() {
	s.mu.Lock()
	defer s.mu.Unlock()

	for taskType, agents := range s.pheromones {
		for agentID, strength := range agents {
			newStrength := strength * (1 - s.config.PheromoneDecayRate)
			if newStrength < 0.01 {
				delete(agents, agentID)
			} else {
				agents[agentID] = newStrength
			}
		}

		if len(agents) == 0 {
			delete(s.pheromones, taskType)
		}
	}
}

// emergenceDetectionLoop periodically detects emergent signals
func (s *SwarmIntelligenceScheduler) emergenceDetectionLoop() {
	defer s.wg.Done()

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			s.detectEmergentSignals()
		}
	}
}

// detectEmergentSignals analyzes swarm state for emergent patterns
func (s *SwarmIntelligenceScheduler) detectEmergentSignals() {
	// Use Scheduler.mu to access workers (not s.mu which is for SwarmIntelligenceScheduler fields)
	s.Scheduler.mu.RLock()
	workers := make(map[string]*AgentInfo, len(s.workers))
	maps.Copy(workers, s.workers)
	s.Scheduler.mu.RUnlock()

	// Detect congestion
	congestionSignal := s.detectCongestion(workers)
	if congestionSignal != nil {
		s.recordSignal(congestionSignal)
	}

	// Detect collaboration opportunities
	opportunitySignal := s.detectOpportunity()
	if opportunitySignal != nil {
		s.recordSignal(opportunitySignal)
	}

	// Detect self-organization patterns
	selfOrgSignal := s.detectSelfOrganization(workers)
	if selfOrgSignal != nil {
		s.recordSignal(selfOrgSignal)
	}

	// Detect synergy (agents working well together)
	synergySignal := s.detectSynergy()
	if synergySignal != nil {
		s.recordSignal(synergySignal)
	}

	// Detect innovation (novel task patterns)
	innovationSignal := s.detectInnovation()
	if innovationSignal != nil {
		s.recordSignal(innovationSignal)
	}

	// Clean old signals
	s.cleanOldSignals()
}

// detectCongestion detects if agents are overloaded
func (s *SwarmIntelligenceScheduler) detectCongestion(workers map[string]*AgentInfo) *EmergentSignal {
	avgLoad := 0.0
	maxLoad := 0.0
	congestedAgents := []string{}

	for id, agent := range workers {
		// Guard against division by zero
		var load float64
		if agent.MaxConcurrent > 0 {
			load = float64(agent.GetLoad()) / float64(agent.MaxConcurrent)
		} else {
			load = float64(agent.GetLoad()) // Use raw load if MaxConcurrent is 0
		}
		avgLoad += load
		if load > maxLoad {
			maxLoad = load
		}
		if load > s.config.CongestionThreshold {
			congestedAgents = append(congestedAgents, id)
		}
	}

	if len(workers) > 0 {
		avgLoad /= float64(len(workers))
	}

	// Signal if average load is high or many agents are congested
	if avgLoad > s.config.SignalThreshold || len(congestedAgents) > len(workers)/2 {
		return &EmergentSignal{
			Type:        "congestion",
			Location:    "swarm",
			Strength:    avgLoad,
			Timestamp:   time.Now(),
			Agents:      congestedAgents,
			Description: fmt.Sprintf("Swarm congestion detected: avg load %.2f, %d congested agents", avgLoad, len(congestedAgents)),
		}
	}

	return nil
}

// detectOpportunity detects collaboration opportunities
func (s *SwarmIntelligenceScheduler) detectOpportunity() *EmergentSignal {
	// Snapshot workers under Scheduler.mu
	s.Scheduler.mu.RLock()
	workersCopy := make(map[string]*AgentInfo, len(s.workers))
	maps.Copy(workersCopy, s.workers)
	s.Scheduler.mu.RUnlock()

	// MEDIUM FIX: pendingQueue is protected by Scheduler.mu, not SwarmIntelligenceScheduler.mu
	s.Scheduler.mu.RLock()
	pending := s.pendingQueue.Len()
	s.Scheduler.mu.RUnlock()

	s.mu.RLock()
	opportunityWindow := s.config.OpportunityWindow
	s.mu.RUnlock()

	// Check for pending tasks that could benefit from collaboration
	if pending >= opportunityWindow {
		// Find idle agents from snapshot
		idleAgents := []string{}
		for id, agent := range workersCopy {
			if agent.GetLoad() == 0 {
				idleAgents = append(idleAgents, id)
			}
		}

		if len(idleAgents) >= 2 {
			return &EmergentSignal{
				Type:        "opportunity",
				Location:    "swarm",
				Strength:    float64(pending) / float64(opportunityWindow),
				Timestamp:   time.Now(),
				Agents:      idleAgents,
				Description: fmt.Sprintf("Collaboration opportunity: %d pending tasks, %d idle agents", pending, len(idleAgents)),
			}
		}
	}

	return nil
}

// detectSelfOrganization detects agents self-organizing into efficient patterns
func (s *SwarmIntelligenceScheduler) detectSelfOrganization(workers map[string]*AgentInfo) *EmergentSignal {
	if len(workers) < 2 {
		return nil
	}

	// Count agents in different load states
	idle := 0
	active := 0
	full := 0

	for _, agent := range workers {
		load := agent.GetLoad()
		if load == 0 {
			idle++
		} else if load >= agent.MaxConcurrent {
			full++
		} else {
			active++
		}
	}

	total := len(workers)

	// Self-organization detected when workload is well-distributed
	// (not all idle, not all full, most in active state)
	activeRatio := float64(active) / float64(total)
	if activeRatio > 0.4 && activeRatio < 0.8 && idle < total/2 && full < total/2 {
		activeAgents := []string{}
		for id, agent := range workers {
			if agent.GetLoad() > 0 && agent.GetLoad() < agent.MaxConcurrent {
				activeAgents = append(activeAgents, id)
			}
		}

		return &EmergentSignal{
			Type:        "self_organization",
			Location:    "swarm",
			Strength:    activeRatio,
			Timestamp:   time.Now(),
			Agents:      activeAgents,
			Description: fmt.Sprintf("Self-organization: %d/%d agents actively collaborating", active, total),
			Pattern:     "balanced_distribution",
			Confidence:  0.75,
		}
	}

	return nil
}

// detectSynergy detects when agents are working well together (high success correlation)
func (s *SwarmIntelligenceScheduler) detectSynergy() *EmergentSignal {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Find agents with complementary specializations
	type agentPair struct {
		agent1   string
		agent2   string
		score    float64
		taskType string
	}

	var bestPairs []agentPair

	// Analyze performance correlations
	for taskType, pheromones := range s.pheromones {
		if len(pheromones) < 2 {
			continue
		}

		// Find agents with high pheromone on same task type
		agents := make([]string, 0, len(pheromones))
		for agentID, strength := range pheromones {
			if strength > s.config.SignalThreshold {
				agents = append(agents, agentID)
			}
		}

		if len(agents) >= 2 {
			// Calculate synergy score
			score := 0.0
			for _, a := range agents {
				if perf, ok := s.agentPerformance[a]; ok {
					perf.mu.RLock()
					if rate, ok := perf.Specialization[taskType]; ok && rate > 0.7 {
						score += rate
					}
					perf.mu.RUnlock()
				}
			}

			if score > 1.5 && len(agents) >= 2 {
				bestPairs = append(bestPairs, agentPair{
					agent1:   agents[0],
					agent2:   agents[1],
					score:    score,
					taskType: taskType,
				})
			}
		}
	}

	if len(bestPairs) > 0 {
		// Sort by score
		sort.Slice(bestPairs, func(i, j int) bool {
			return bestPairs[i].score > bestPairs[j].score
		})

		best := bestPairs[0]
		return &EmergentSignal{
			Type:        "synergy",
			Location:    "swarm",
			Strength:    best.score / 2.0, // Normalize to 0-1
			Timestamp:   time.Now(),
			Agents:      []string{best.agent1, best.agent2},
			Description: fmt.Sprintf("Synergy detected for %s tasks", best.taskType),
			Pattern:     "complementary_specialization",
			Confidence:  best.score / 2.0,
		}
	}

	return nil
}

// detectInnovation detects novel patterns or approaches
func (s *SwarmIntelligenceScheduler) detectInnovation() *EmergentSignal {
	// Snapshot worker count under Scheduler.mu
	s.Scheduler.mu.RLock()
	workerCount := len(s.workers)
	s.Scheduler.mu.RUnlock()

	s.mu.RLock()
	defer s.mu.RUnlock()

	// Look for agents with improving performance trends
	innovators := []string{}
	for agentID, perf := range s.agentPerformance {
		perf.mu.RLock()
		// Check recent success trend
		if len(perf.RecentSuccess) >= 5 {
			recentSuccess := 0
			for i := len(perf.RecentSuccess) - 5; i < len(perf.RecentSuccess); i++ {
				if perf.RecentSuccess[i] {
					recentSuccess++
				}
			}

			// 4+ successes in last 5 tasks indicates innovation
			if recentSuccess >= 4 {
				innovators = append(innovators, agentID)
			}
		}
		perf.mu.RUnlock()
	}

	if len(innovators) > 0 && workerCount > 0 {
		return &EmergentSignal{
			Type:        "innovation",
			Location:    "swarm",
			Strength:    float64(len(innovators)) / float64(workerCount),
			Timestamp:   time.Now(),
			Agents:      innovators,
			Description: fmt.Sprintf("Innovation detected: %d agents showing improved patterns", len(innovators)),
			Pattern:     "performance_improvement",
			Confidence:  0.8,
		}
	}

	return nil
}

// recordSignal records and broadcasts an emergent signal
func (s *SwarmIntelligenceScheduler) recordSignal(signal *EmergentSignal) {
	s.signalMu.Lock()
	s.signals[fmt.Sprintf("%s_%s", signal.Type, uuid.New().String()[:8])] = signal
	s.signalMu.Unlock()

	// Broadcast signal via A2A
	msg := a2a.NewMessage(a2a.MessageTypeSignal, "swarm_scheduler", "broadcast").
		WithPayload(&a2a.SignalPayload{
			SignalType: signal.Type,
			Strength:   signal.Strength,
			Location:   signal.Location,
			Data:       mustMarshalJSON(signal),
		})

	s.sendAsync(msg)
}

// cleanOldSignals removes old signals
func (s *SwarmIntelligenceScheduler) cleanOldSignals() {
	s.signalMu.Lock()
	defer s.signalMu.Unlock()

	cutoff := time.Now().Add(-signalRetentionDuration)
	for id, signal := range s.signals {
		if signal.Timestamp.Before(cutoff) {
			delete(s.signals, id)
		}
	}
}

// GetSignals returns copies of current emergent signals
func (s *SwarmIntelligenceScheduler) GetSignals() []*EmergentSignal {
	s.signalMu.RLock()
	defer s.signalMu.RUnlock()

	signals := make([]*EmergentSignal, 0, len(s.signals))
	for _, sig := range s.signals {
		// Copy to prevent caller from mutating internal state
		sigCopy := *sig
		if sig.Agents != nil {
			sigCopy.Agents = make([]string, len(sig.Agents))
			copy(sigCopy.Agents, sig.Agents)
		}
		if sig.Metadata != nil {
			sigCopy.Metadata = make(map[string]any, len(sig.Metadata))
			maps.Copy(sigCopy.Metadata, sig.Metadata)
		}
		signals = append(signals, &sigCopy)
	}

	// Sort by timestamp, newest first
	sort.Slice(signals, func(i, j int) bool {
		return signals[i].Timestamp.After(signals[j].Timestamp)
	})

	return signals
}

// A2A Message Handlers

func (s *SwarmIntelligenceScheduler) handleProposal(msg *a2a.Message) error {
	var payload a2a.ProposalPayload
	if err := msg.ParsePayload(&payload); err != nil {
		return err
	}

	// Handle proposals from agents
	if payload.Type == "task_bid" {
		var bid Bid
		if err := unmarshalJSON(payload.Content, &bid); err != nil {
			return err
		}
		return s.SubmitBid(payload.ProposalID, &bid)
	}

	return nil
}

func (s *SwarmIntelligenceScheduler) handleHelpRequest(msg *a2a.Message) error {
	var payload a2a.HelpRequestPayload
	if err := msg.ParsePayload(&payload); err != nil {
		return err
	}

	// Find available helpers (use Scheduler.mu for s.workers)
	s.Scheduler.mu.RLock()
	helpers := []string{}
	for id, agent := range s.workers {
		if id != msg.From && agent.GetLoad() < agent.MaxConcurrent {
			helpers = append(helpers, id)
		}
	}
	s.Scheduler.mu.RUnlock()

	// Offer help
	if len(helpers) > 0 {
		response := a2a.NewMessage(a2a.MessageTypeHelpOffer, helpers[0], msg.From).
			WithPayload(&a2a.HelpOfferPayload{
				RequestID: msg.ID,
				AgentID:   helpers[0],
				Available: true,
			})

		s.sendAsync(response)
	}

	return nil
}

func (s *SwarmIntelligenceScheduler) handleKnowledgeShare(msg *a2a.Message) error {
	var payload a2a.KnowledgeSharePayload
	if err := msg.ParsePayload(&payload); err != nil {
		return err
	}

	// Update pheromones based on shared knowledge
	if payload.Type == "success_pattern" {
		// Agent sharing successful pattern
		var data struct {
			TaskType string `json:"taskType"`
			Success  bool   `json:"success"`
		}
		if err := unmarshalJSON(payload.Content, &data); err == nil {
			s.DepositPheromone(msg.From, data.TaskType, data.Success)
		}
	}

	return nil
}

func (s *SwarmIntelligenceScheduler) handleSync(msg *a2a.Message) error {
	var payload a2a.SyncPayload
	if err := msg.ParsePayload(&payload); err != nil {
		return err
	}

	// Sync state with agents
	if payload.StateType == "swarm_state" {
		// Agent requesting current swarm state
		response := a2a.NewMessage(a2a.MessageTypeSyncAck, "swarm_scheduler", msg.From).
			WithPayload(&a2a.SyncPayload{
				StateType: "swarm_state",
				State:     mustMarshalJSON(s.GetStats()),
				Version:   time.Now().UnixNano(),
			})

		s.sendAsync(response)
	}

	return nil
}

func (s *SwarmIntelligenceScheduler) handlePheromone(msg *a2a.Message) error {
	var payload a2a.PheromonePayload
	if err := msg.ParsePayload(&payload); err != nil {
		return err
	}

	// Update local pheromone map
	s.mu.Lock()
	if s.pheromones[payload.PheromoneType] == nil {
		s.pheromones[payload.PheromoneType] = make(map[string]float64)
	}
	s.pheromones[payload.PheromoneType][payload.Location] = payload.Strength
	s.mu.Unlock()

	return nil
}

func (s *SwarmIntelligenceScheduler) handleSignal(msg *a2a.Message) error {
	var payload a2a.SignalPayload
	if err := msg.ParsePayload(&payload); err != nil {
		return err
	}

	// React to emergent signals
	switch payload.SignalType {
	case "congestion":
		// Redistribute load
		s.handleCongestionSignal(payload)
	case "opportunity":
		// Enable collaboration
		s.handleOpportunitySignal(payload)
	}

	return nil
}

func (s *SwarmIntelligenceScheduler) handleCongestionSignal(payload a2a.SignalPayload) {
	// Find least loaded agents and redistribute (use Scheduler.mu for s.workers)
	s.Scheduler.mu.RLock()
	var lightest *AgentInfo
	for _, agent := range s.workers {
		if lightest == nil || agent.GetLoad() < lightest.GetLoad() {
			lightest = agent
		}
	}
	s.Scheduler.mu.RUnlock()

	// Broadcast swarm command to redistribute
	if lightest != nil {
		cmd := a2a.NewMessage(a2a.MessageTypeSwarmCmd, "swarm_scheduler", "broadcast").
			WithPayload(&a2a.SwarmCommandPayload{
				Command:  "redistribute",
				Target:   lightest.ID,
				Priority: 2,
			})

		s.sendAsync(cmd)
	}
}

func (s *SwarmIntelligenceScheduler) handleOpportunitySignal(payload a2a.SignalPayload) {
	// Encourage collaboration
	cmd := a2a.NewMessage(a2a.MessageTypeSwarmCmd, "swarm_scheduler", "broadcast").
		WithPayload(&a2a.SwarmCommandPayload{
			Command:  "collaborate",
			Params:   payload.Data,
			Priority: 1,
		})

	s.sendAsync(cmd)
}

// UpdateAgentPerformance updates performance metrics for an agent
func (s *SwarmIntelligenceScheduler) UpdateAgentPerformance(agentID string, duration time.Duration, success bool, taskType string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	perf, ok := s.agentPerformance[agentID]
	if !ok {
		perf = &AgentPerformance{
			AgentID:        agentID,
			Specialization: make(map[string]float64),
			RecentSuccess:  make([]bool, 0, 10),
			TrendWindow:    10,
		}
		s.agentPerformance[agentID] = perf
	}

	perf.mu.Lock()
	defer perf.mu.Unlock()

	// Update counts
	if success {
		perf.TasksCompleted++
	} else {
		perf.TasksFailed++
	}

	// Update duration
	perf.TotalDuration += duration
	if perf.TasksCompleted > 0 {
		perf.AverageDuration = perf.TotalDuration / time.Duration(perf.TasksCompleted)
	}

	// Update specialization
	if taskType != "" {
		currentRate := perf.Specialization[taskType]
		if success {
			perf.Specialization[taskType] = currentRate*0.9 + 1.0*0.1
		} else {
			perf.Specialization[taskType] = currentRate * 0.9
		}
	}

	// Update trend
	perf.RecentSuccess = append(perf.RecentSuccess, success)
	if len(perf.RecentSuccess) > perf.TrendWindow {
		perf.RecentSuccess = perf.RecentSuccess[1:]
	}
}

// GetAgentPerformance returns performance metrics for an agent
// GetAgentPerformance returns a copy of the agent's performance data.
// Field-by-field construction avoids copying the sync.RWMutex.
func (s *SwarmIntelligenceScheduler) GetAgentPerformance(agentID string) *AgentPerformance {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ap, ok := s.agentPerformance[agentID]
	if !ok {
		return nil
	}

	// Field-by-field copy to avoid copying sync.RWMutex
	ap.mu.RLock()
	spec := make(map[string]float64, len(ap.Specialization))
	maps.Copy(spec, ap.Specialization)
	recent := make([]bool, len(ap.RecentSuccess))
	copy(recent, ap.RecentSuccess)
	ap.mu.RUnlock()

	return &AgentPerformance{
		AgentID:         ap.AgentID,
		TasksCompleted:  ap.TasksCompleted,
		TasksFailed:     ap.TasksFailed,
		AverageDuration: ap.AverageDuration,
		TotalDuration:   ap.TotalDuration,
		Specialization:  spec,
		RecentSuccess:   recent,
	}
}

// Helper functions

func (s *SwarmIntelligenceScheduler) getTaskType(task *Task) string {
	if task.Metadata == nil {
		return "default"
	}
	if taskType, ok := task.Metadata["type"].(string); ok {
		return taskType
	}
	return "default"
}

func (s *SwarmIntelligenceScheduler) selectRandomAgents(agents []*AgentInfo, task *Task) []*AgentInfo {
	if len(agents) == 0 {
		return nil
	}

	// Filter available agents
	available := make([]*AgentInfo, 0)
	for _, a := range agents {
		if a.GetLoad() < a.MaxConcurrent {
			available = append(available, a)
		}
	}

	if len(available) == 0 {
		return nil
	}

	// Random selection
	idx := int(randomFloat() * float64(len(available)))
	if idx >= len(available) {
		idx = len(available) - 1
	}

	return []*AgentInfo{available[idx]}
}

func (s *SwarmIntelligenceScheduler) selectLeastLoaded(agents []*AgentInfo) []*AgentInfo {
	if len(agents) == 0 {
		return nil
	}

	var selected *AgentInfo
	for _, a := range agents {
		if selected == nil || a.GetLoad() < selected.GetLoad() {
			selected = a
		}
	}

	if selected != nil {
		return []*AgentInfo{selected}
	}
	return nil
}

// GetPheromoneState returns current pheromone state
func (s *SwarmIntelligenceScheduler) GetPheromoneState() map[string]map[string]float64 {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make(map[string]map[string]float64, len(s.pheromones))
	for k, v := range s.pheromones {
		result[k] = make(map[string]float64, len(v))
		maps.Copy(result[k], v)
	}
	return result
}

// GetActiveNegotiations returns active negotiations
// GetActiveNegotiations returns copies of active negotiations
func (s *SwarmIntelligenceScheduler) GetActiveNegotiations() []*Negotiation {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*Negotiation, 0, len(s.activeNegotiations))
	for _, n := range s.activeNegotiations {
		// Copy to prevent caller from mutating internal state
		nCopy := *n
		if n.Participants != nil {
			nCopy.Participants = make([]string, len(n.Participants))
			copy(nCopy.Participants, n.Participants)
		}
		if n.Bids != nil {
			bids := make(map[string]*Bid, len(n.Bids))
			for k, b := range n.Bids {
				bCopy := *b
				bids[k] = &bCopy
			}
			nCopy.Bids = bids
		}
		result = append(result, &nCopy)
	}
	return result
}

// RegisterAgentForA2A registers an agent with A2A routing
func (s *SwarmIntelligenceScheduler) RegisterAgentForA2A(agentID string, sendFunc func(*a2a.Message) error, capabilities []string) {
	s.router.RegisterAgent(agentID, sendFunc, capabilities)
}

// UnregisterAgentFromA2A unregisters an agent from A2A routing
func (s *SwarmIntelligenceScheduler) UnregisterAgentFromA2A(agentID string) {
	s.router.UnregisterAgent(agentID)

	// Clean up agent performance data to prevent memory leak
	s.mu.Lock()
	delete(s.agentPerformance, agentID)
	// Clean up agent pheromone entries across all task types to prevent memory leak
	for taskType := range s.pheromones {
		delete(s.pheromones[taskType], agentID)
	}
	s.mu.Unlock()
}

// SendA2AMessage sends a message via A2A
func (s *SwarmIntelligenceScheduler) SendA2AMessage(msg *a2a.Message) error {
	return s.router.Send(msg)
}

// BroadcastSwarmCommand broadcasts a command to all agents
func (s *SwarmIntelligenceScheduler) BroadcastSwarmCommand(command string, params any) error {
	msg := a2a.NewMessage(a2a.MessageTypeSwarmCmd, "swarm_scheduler", "broadcast").
		WithPayload(&a2a.SwarmCommandPayload{
			Command:  command,
			Params:   mustMarshalJSON(params),
			Priority: 1,
		})

	return s.router.Send(msg)
}

// RequestConsensus initiates a consensus vote among agents
func (s *SwarmIntelligenceScheduler) RequestConsensus(ctx context.Context, subject string, options []string, deadline time.Time) (string, error) {
	voteID := fmt.Sprintf("vote_%s", uuid.New().String()[:8])

	payload := &a2a.VoteRequestPayload{
		VoteID:    voteID,
		Subject:   subject,
		Options:   options,
		Algorithm: "majority",
		Deadline:  deadline,
	}

	msg := a2a.NewMessage(a2a.MessageTypeVoteRequest, "swarm_scheduler", "broadcast").
		WithPayload(payload)

	if err := s.router.Send(msg); err != nil {
		return "", err
	}

	// Wait for votes or context cancellation (simplified - in production would track votes properly)
	duration := time.Until(deadline)
	if duration <= 0 {
		return "", ctx.Err() // Deadline already passed
	}
	timer := time.NewTimer(duration)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case <-timer.C:
		// Timeout reached
		if len(options) == 0 {
			return "", fmt.Errorf("no consensus options available")
		}
		return options[0], nil
	}
}

// Utility functions

func randomFloat() float64 {
	return rand.Float64()
}

// safeMarshalJSON marshals v to JSON, logging errors instead of panicking.
// Returns nil if marshaling fails - callers should check for nil if the data is critical.
func safeMarshalJSON(v any) []byte {
	data, err := json.Marshal(v)
	if err != nil {
		swarmIntelLog.Warn("JSON marshal error", "error", err)
		return nil
	}
	return data
}

// mustMarshalJSON is kept for backward compatibility but logs errors.
// Deprecated: Use safeMarshalJSON instead.
func mustMarshalJSON(v any) []byte {
	return safeMarshalJSON(v)
}

func unmarshalJSON(data []byte, v any) error {
	return json.Unmarshal(data, v)
}
