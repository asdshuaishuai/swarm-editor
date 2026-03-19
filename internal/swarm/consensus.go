// Package swarm implements consensus mechanisms for multi-agent coordination
package swarm

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
)

// ConsensusAlgorithm defines the type of consensus algorithm
type ConsensusAlgorithm string

const (
	// ConsensusSimpleMajority requires >50% approval
	ConsensusSimpleMajority ConsensusAlgorithm = "simple_majority"
	// ConsensusSupermajority requires 2/3 approval
	ConsensusSupermajority ConsensusAlgorithm = "supermajority"
	// ConsensusUnanimity requires 100% approval
	ConsensusUnanimity ConsensusAlgorithm = "unanimity"
	// ConsensusWeighted uses weighted voting based on agent capabilities
	ConsensusWeighted ConsensusAlgorithm = "weighted"
	// ConsensusByzantine uses Byzantine fault tolerance
	ConsensusByzantine ConsensusAlgorithm = "byzantine"
)

// ConsensusEngine manages consensus voting among agents
type ConsensusEngine struct {
	mu sync.RWMutex

	config          ConsensusConfig
	agentRegistry   *agent.Registry
	activeProposals map[string]*ActiveProposal
	running         bool

	// Callbacks
	onProposalCreated  func(proposal *Proposal)
	onVoteReceived     func(proposalID string, vote Vote)
	onConsensusReached func(result *ConsensusResult)
	onTimeout          func(proposalID string)

	ctx    context.Context
	cancel context.CancelFunc

	// WaitGroup for tracking cleanup goroutines
	cleanupWg sync.WaitGroup
}

// ConsensusConfig configures the consensus engine
type ConsensusConfig struct {
	DefaultAlgorithm ConsensusAlgorithm `json:"defaultAlgorithm"`
	DefaultTimeout   time.Duration      `json:"defaultTimeout"`
	MinAgreement     float64            `json:"minAgreement"` // 0.0-1.0
	MaxRetries       int                `json:"maxRetries"`
	VotingDelay      time.Duration      `json:"votingDelay"` // Delay before collecting votes

	// Byzantine fault tolerance settings
	ByzantineMaxFaults int `json:"byzantineMaxFaults"` // Max faulty nodes tolerated
}

// ActiveProposal tracks an active voting proposal
type ActiveProposal struct {
	Proposal    *Proposal
	Votes       map[string]Vote
	Algorithm   ConsensusAlgorithm
	Deadline    time.Time
	Completed   bool
	Result      *ConsensusResult
	VoteChannel chan Vote
}

// NewConsensusEngine creates a new consensus engine
func NewConsensusEngine(config ConsensusConfig, registry *agent.Registry) *ConsensusEngine {
	if config.DefaultTimeout == 0 {
		config.DefaultTimeout = 30 * time.Second
	}
	if config.DefaultAlgorithm == "" {
		config.DefaultAlgorithm = ConsensusSimpleMajority
	}
	if config.MinAgreement == 0 {
		config.MinAgreement = 0.51
	}

	return &ConsensusEngine{
		config:          config,
		agentRegistry:   registry,
		activeProposals: make(map[string]*ActiveProposal),
	}
}

// Start starts the consensus engine
func (e *ConsensusEngine) Start(ctx context.Context) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.running {
		return fmt.Errorf("consensus engine is already running")
	}

	e.ctx, e.cancel = context.WithCancel(ctx)
	e.running = true

	go e.proposalMonitorLoop()
	return nil
}

// Stop stops the consensus engine
func (e *ConsensusEngine) Stop() {
	e.mu.Lock()
	if !e.running {
		e.mu.Unlock()
		return
	}
	e.running = false
	if e.cancel != nil {
		e.cancel()
	}
	e.mu.Unlock()

	// Wait for all cleanup goroutines to finish
	e.cleanupWg.Wait()
}

// CreateProposal creates a new proposal for voting
func (e *ConsensusEngine) CreateProposal(ctx context.Context, proposal *Proposal, algorithm ConsensusAlgorithm) (*ConsensusResult, error) {
	if proposal == nil {
		return nil, fmt.Errorf("proposal cannot be nil")
	}
	if algorithm == "" {
		algorithm = e.config.DefaultAlgorithm
	}

	e.mu.Lock()
	active := &ActiveProposal{
		Proposal:    proposal,
		Votes:       make(map[string]Vote),
		Algorithm:   algorithm,
		Deadline:    time.Now().Add(e.config.DefaultTimeout),
		VoteChannel: make(chan Vote, 100),
	}
	e.activeProposals[proposal.ID] = active
	e.mu.Unlock()

	if e.onProposalCreated != nil {
		e.onProposalCreated(proposal)
	}

	// Collect votes from agents
	go e.collectVotes(active)

	// Wait for result or timeout
	result, err := e.waitForConsensus(ctx, active)

	return result, err
}

// collectVotes collects votes from all available agents
func (e *ConsensusEngine) collectVotes(active *ActiveProposal) {
	agents := e.agentRegistry.GetIdle()
	if len(agents) == 0 {
		agents = e.agentRegistry.GetAll()
	}

	// Give agents time to review the proposal
	if e.config.VotingDelay > 0 {
		time.Sleep(e.config.VotingDelay)
	}

	var wg sync.WaitGroup
	for _, a := range agents {
		wg.Add(1)
		go func(ag *agent.Agent) {
			defer wg.Done()
			vote := e.requestVote(ag, active.Proposal)

			// Record vote with proper locking
			e.mu.Lock()
			if !active.Completed {
				active.Votes[vote.AgentID] = vote
				if e.onVoteReceived != nil {
					e.onVoteReceived(active.Proposal.ID, vote)
				}
				// Check if we can reach early consensus
				if e.canReachEarlyConsensus(active) {
					e.finalizeConsensus(active)
				}
			}
			e.mu.Unlock()
		}(a)
	}

	wg.Wait()
}

// requestVote requests a vote from an agent
func (e *ConsensusEngine) requestVote(a *agent.Agent, proposal *Proposal) Vote {
	// Create evaluation prompt for the agent
	evalPrompt := acp.Prompt{
		{Type: "text", Text: e.buildEvaluationPrompt(proposal)},
	}

	// Execute evaluation
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	result, err := a.Execute(ctx, evalPrompt)
	if err != nil {
		return Vote{
			AgentID: string(a.ID),
			Approve: false,
			Comment: fmt.Sprintf("Evaluation failed: %v", err),
			Weight:  e.calculateAgentWeight(a),
		}
	}

	// Parse the agent's response to determine vote
	return e.parseAgentResponse(a, result, proposal)
}

// buildEvaluationPrompt creates a prompt for agents to evaluate a proposal
func (e *ConsensusEngine) buildEvaluationPrompt(proposal *Proposal) string {
	return fmt.Sprintf(`You are asked to evaluate and vote on the following proposal.

Title: %s
Description: %s

Please analyze this proposal and respond with your vote in the following JSON format:
{
  "approve": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of your decision"
}

Consider:
1. Feasibility - Can this be implemented successfully?
2. Quality - Does this meet our standards?
3. Risk - What are the potential issues?
4. Alignment - Does this align with the project goals?

Provide your honest assessment.`, proposal.Title, proposal.Description)
}

// parseAgentResponse parses the agent's response into a vote
func (e *ConsensusEngine) parseAgentResponse(a *agent.Agent, result *agent.ExecutionResult, proposal *Proposal) Vote {
	vote := Vote{
		AgentID: string(a.ID),
		Weight:  e.calculateAgentWeight(a),
	}

	// Try to parse JSON response
	var response struct {
		Approve    bool    `json:"approve"`
		Confidence float64 `json:"confidence"`
		Reasoning  string  `json:"reasoning"`
	}

	// Use Output field from ExecutionResult
	textContent := result.Output

	if err := json.Unmarshal([]byte(textContent), &response); err != nil {
		// If JSON parsing fails, try to infer from text
		vote.Approve = e.inferVoteFromText(textContent)
		vote.Comment = "Vote inferred from text response"
	} else {
		vote.Approve = response.Approve
		vote.Comment = response.Reasoning
		// Adjust weight based on confidence
		if response.Confidence > 0 {
			vote.Weight *= response.Confidence
		}
	}

	return vote
}

// inferVoteFromText attempts to infer a vote from unstructured text
func (e *ConsensusEngine) inferVoteFromText(text string) bool {
	// Simple heuristic: look for positive/negative indicators
	positiveIndicators := []string{"approve", "accept", "yes", "agree", "support", "good", "excellent"}
	negativeIndicators := []string{"reject", "deny", "no", "disagree", "oppose", "bad", "poor"}

	textLower := strings.ToLower(text)
	positiveCount := 0
	negativeCount := 0

	for _, indicator := range positiveIndicators {
		if strings.Contains(textLower, indicator) {
			positiveCount++
		}
	}

	for _, indicator := range negativeIndicators {
		if strings.Contains(textLower, indicator) {
			negativeCount++
		}
	}

	return positiveCount >= negativeCount
}

// calculateAgentWeight calculates voting weight for an agent
func (e *ConsensusEngine) calculateAgentWeight(a *agent.Agent) float64 {
	baseWeight := 1.0

	// Adjust weight based on agent type
	switch a.Type {
	case agent.AgentTypeArchitect:
		baseWeight = 1.5 // Architects have more weight for design decisions
	case agent.AgentTypeReviewer:
		baseWeight = 1.3 // Reviewers have more weight for quality decisions
	case agent.AgentTypeOrchestrator:
		baseWeight = 1.2 // Orchestrators have slightly more weight
	}

	// Consider tool history success rate
	history := a.GetToolHistory()
	if len(history) > 0 {
		successCount := 0
		for _, exec := range history {
			if exec.Status == acp.StatusCompleted {
				successCount++
			}
		}
		successRate := float64(successCount) / float64(len(history))
		baseWeight *= (0.5 + 0.5*successRate) // Scale between 0.5 and 1.0
	}

	return baseWeight
}

// recordVote records a vote for a proposal
// Note: This function assumes the caller holds the lock
func (e *ConsensusEngine) recordVote(active *ActiveProposal, vote Vote) {
	if active.Completed {
		return // Proposal already completed
	}

	active.Votes[vote.AgentID] = vote

	if e.onVoteReceived != nil {
		e.onVoteReceived(active.Proposal.ID, vote)
	}

	// Check if we can reach early consensus
	if e.canReachEarlyConsensus(active) {
		e.finalizeConsensus(active)
	}
}

// canReachEarlyConsensus checks if consensus can be determined before timeout
func (e *ConsensusEngine) canReachEarlyConsensus(active *ActiveProposal) bool {
	// For unanimity, we need all votes
	if active.Algorithm == ConsensusUnanimity {
		return len(active.Votes) >= e.agentRegistry.Count()
	}

	// For other algorithms, check if remaining votes can't change outcome
	totalAgents := e.agentRegistry.Count()
	if totalAgents == 0 {
		return false // No agents to vote
	}

	currentVotes := len(active.Votes)
	remainingVotes := totalAgents - currentVotes

	if remainingVotes == 0 {
		return true
	}

	// Calculate current approval
	approved, _ := e.countVotes(active.Votes)
	approvalRate := approved / float64(totalAgents)

	// Check if remaining votes could swing the decision
	switch active.Algorithm {
	case ConsensusSimpleMajority:
		// If approval > 50% + remaining/total, it's decided
		if approvalRate > 0.5+float64(remainingVotes)/float64(totalAgents) {
			return true
		}
		if approvalRate < 0.5-float64(remainingVotes)/float64(totalAgents) {
			return true
		}
	case ConsensusSupermajority:
		if approvalRate > 0.667+float64(remainingVotes)/float64(totalAgents) {
			return true
		}
		if approvalRate < 0.333-float64(remainingVotes)/float64(totalAgents) {
			return true
		}
	}

	return false
}

// waitForConsensus waits for consensus to be reached or timeout
func (e *ConsensusEngine) waitForConsensus(ctx context.Context, active *ActiveProposal) (*ConsensusResult, error) {
	timeout := time.Until(active.Deadline)
	if timeout <= 0 {
		timeout = time.Second
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Wait for completion or timeout
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			e.mu.Lock()
			if !active.Completed {
				e.finalizeConsensus(active)
			}
			result := active.Result
			e.mu.Unlock()
			return result, nil

		case <-ticker.C:
			e.mu.RLock()
			completed := active.Completed
			result := active.Result
			e.mu.RUnlock()

			if completed {
				return result, nil
			}
		}
	}
}

// finalizeConsensus calculates and stores the final consensus result
func (e *ConsensusEngine) finalizeConsensus(active *ActiveProposal) {
	if active.Completed {
		return
	}

	active.Completed = true

	approved, total := e.countVotes(active.Votes)
	approvalRate := approved / total

	status := "disagreed"
	if e.isConsensusReached(approvalRate, active.Algorithm) {
		status = "agreed"
	} else if approvalRate > 0.5 {
		status = "partial"
	}

	// Build contributions list
	var contributions []AgentContribution
	for agentID, vote := range active.Votes {
		voteStr := "reject"
		if vote.Approve {
			voteStr = "approve"
		}
		contributions = append(contributions, AgentContribution{
			AgentID: agentID,
			Vote:    voteStr,
			Content: vote.Comment,
			Weight:  vote.Weight,
		})
	}

	active.Result = &ConsensusResult{
		TaskID:        active.Proposal.ID,
		Status:        status,
		ApprovalRate:  approvalRate,
		Votes:         active.Votes,
		Contributions: contributions,
	}

	if e.onConsensusReached != nil {
		e.onConsensusReached(active.Result)
	}

	// Cleanup
	close(active.VoteChannel)
}

// countVotes counts approved votes and total weight
func (e *ConsensusEngine) countVotes(votes map[string]Vote) (float64, float64) {
	var approved, total float64
	for _, vote := range votes {
		total += vote.Weight
		if vote.Approve {
			approved += vote.Weight
		}
	}

	if total == 0 {
		return 0, 1 // Avoid division by zero
	}

	return approved, total
}

// isConsensusReached determines if consensus is reached based on algorithm
func (e *ConsensusEngine) isConsensusReached(approvalRate float64, algorithm ConsensusAlgorithm) bool {
	switch algorithm {
	case ConsensusSimpleMajority:
		return approvalRate > 0.5
	case ConsensusSupermajority:
		return approvalRate >= 0.667
	case ConsensusUnanimity:
		return approvalRate >= 1.0
	case ConsensusWeighted:
		return approvalRate >= e.config.MinAgreement
	case ConsensusByzantine:
		// Byzantine requires 2/3 + 1 agreement
		return approvalRate >= 0.667
	default:
		return approvalRate >= e.config.MinAgreement
	}
}

// proposalMonitorLoop monitors active proposals for timeouts
func (e *ConsensusEngine) proposalMonitorLoop() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-e.ctx.Done():
			return
		case <-ticker.C:
			e.checkTimeouts()
		}
	}
}

// checkTimeouts checks for timed out proposals
func (e *ConsensusEngine) checkTimeouts() {
	e.mu.Lock()
	defer e.mu.Unlock()

	now := time.Now()
	for id, active := range e.activeProposals {
		if !active.Completed && now.After(active.Deadline) {
			e.finalizeConsensus(active)

			if e.onTimeout != nil {
				e.onTimeout(id)
			}

			// Clean up completed proposals after a delay
			// Capture ctx while holding the lock
			ctx := e.ctx
			e.cleanupWg.Add(1)
			go func(proposalID string, engineCtx context.Context) {
				defer e.cleanupWg.Done()
				// Use a timer for cleanup
				timer := time.NewTimer(5 * time.Minute)
				defer timer.Stop()

				if engineCtx == nil {
					// No context, just wait for timer
					<-timer.C
					e.mu.Lock()
					delete(e.activeProposals, proposalID)
					e.mu.Unlock()
					return
				}

				select {
				case <-timer.C:
					e.mu.Lock()
					delete(e.activeProposals, proposalID)
					e.mu.Unlock()
				case <-engineCtx.Done():
					// Engine is shutting down, cleanup immediately
					e.mu.Lock()
					delete(e.activeProposals, proposalID)
					e.mu.Unlock()
				}
			}(id, ctx)
		}
	}
}

// GetProposal gets a proposal by ID
func (e *ConsensusEngine) GetProposal(proposalID string) (*ActiveProposal, bool) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	active, ok := e.activeProposals[proposalID]
	return active, ok
}

// GetActiveProposals returns all active proposals
func (e *ConsensusEngine) GetActiveProposals() []*ActiveProposal {
	e.mu.RLock()
	defer e.mu.RUnlock()

	result := make([]*ActiveProposal, 0, len(e.activeProposals))
	for _, active := range e.activeProposals {
		if !active.Completed {
			result = append(result, active)
		}
	}
	return result
}

// CastVote allows manually casting a vote (for external integrations)
func (e *ConsensusEngine) CastVote(proposalID string, vote Vote) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	active, ok := e.activeProposals[proposalID]
	if !ok {
		return fmt.Errorf("proposal not found: %s", proposalID)
	}

	if active.Completed {
		return fmt.Errorf("proposal already completed: %s", proposalID)
	}

	e.recordVote(active, vote)
	return nil
}

// Callbacks

// OnProposalCreated registers a callback for proposal creation events
func (e *ConsensusEngine) OnProposalCreated(fn func(proposal *Proposal)) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.onProposalCreated = fn
}

// OnVoteReceived registers a callback for vote events
func (e *ConsensusEngine) OnVoteReceived(fn func(proposalID string, vote Vote)) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.onVoteReceived = fn
}

// OnConsensusReached registers a callback for consensus events
func (e *ConsensusEngine) OnConsensusReached(fn func(result *ConsensusResult)) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.onConsensusReached = fn
}

// OnTimeout registers a callback for timeout events
func (e *ConsensusEngine) OnTimeout(fn func(proposalID string)) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.onTimeout = fn
}
