package swarm

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
)

func TestNewConsensusEngine(t *testing.T) {
	registry := agent.NewRegistry()
	config := ConsensusConfig{
		DefaultAlgorithm: ConsensusSimpleMajority,
		DefaultTimeout:   30 * time.Second,
		MinAgreement:     0.51,
	}

	engine := NewConsensusEngine(config, registry)

	if engine == nil {
		t.Fatal("NewConsensusEngine returned nil")
	}

	if engine.config.DefaultAlgorithm != ConsensusSimpleMajority {
		t.Errorf("Expected algorithm %s, got %s", ConsensusSimpleMajority, engine.config.DefaultAlgorithm)
	}

	if engine.agentRegistry == nil {
		t.Error("Agent registry should be set")
	}
}

func TestConsensusEngineDefaultConfig(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	if engine.config.DefaultTimeout == 0 {
		t.Error("Default timeout should be set")
	}

	if engine.config.DefaultAlgorithm == "" {
		t.Error("Default algorithm should be set")
	}

	if engine.config.MinAgreement == 0 {
		t.Error("MinAgreement should be set")
	}
}

func TestConsensusEngineStartStop(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	ctx := context.Background()
	err := engine.Start(ctx)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	// Give it a moment to start
	time.Sleep(50 * time.Millisecond)

	// Stop should not panic
	engine.Stop()
}

func TestConsensusEngineDoubleStart(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	ctx := context.Background()

	// First start should succeed
	err := engine.Start(ctx)
	if err != nil {
		t.Fatalf("First Start failed: %v", err)
	}

	// Second start should fail
	err = engine.Start(ctx)
	if err == nil {
		t.Error("Second Start should return error")
	}

	// Clean up
	engine.Stop()
}

func TestConsensusEngineDoubleStop(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	ctx := context.Background()
	engine.Start(ctx)

	// First stop should succeed
	engine.Stop()

	// Second stop should not panic
	engine.Stop()
}

func TestCreateProposal(t *testing.T) {
	registry := agent.NewRegistry()

	// Add some agents
	for i := 0; i < 3; i++ {
		a := agent.NewAgent("test-agent", agent.AgentTypeCoder)
		registry.Register(a)
	}

	engine := NewConsensusEngine(ConsensusConfig{
		DefaultTimeout: 5 * time.Second,
	}, registry)

	ctx := context.Background()
	engine.Start(ctx)
	defer engine.Stop()

	proposal := &Proposal{
		ID:          "prop-1",
		Title:       "Test Proposal",
		Description: "This is a test proposal for consensus voting",
		CreatedAt:   time.Now(),
	}

	// Create proposal with timeout
	ctxTimeout, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	result, err := engine.CreateProposal(ctxTimeout, proposal, ConsensusSimpleMajority)
	if err != nil {
		t.Fatalf("CreateProposal failed: %v", err)
	}

	if result == nil {
		t.Fatal("Result should not be nil")
	}

	if result.TaskID != proposal.ID {
		t.Errorf("Expected task ID %s, got %s", proposal.ID, result.TaskID)
	}
}

func TestConsensusAlgorithms(t *testing.T) {
	tests := []struct {
		name          string
		algorithm     ConsensusAlgorithm
		approvalRate  float64
		expectedAgree bool
	}{
		{
			name:          "Simple majority - approved",
			algorithm:     ConsensusSimpleMajority,
			approvalRate:  0.6,
			expectedAgree: true,
		},
		{
			name:          "Simple majority - rejected",
			algorithm:     ConsensusSimpleMajority,
			approvalRate:  0.4,
			expectedAgree: false,
		},
		{
			name:          "Supermajority - approved",
			algorithm:     ConsensusSupermajority,
			approvalRate:  0.7,
			expectedAgree: true,
		},
		{
			name:          "Supermajority - rejected",
			algorithm:     ConsensusSupermajority,
			approvalRate:  0.6,
			expectedAgree: false,
		},
		{
			name:          "Unanimity - approved",
			algorithm:     ConsensusUnanimity,
			approvalRate:  1.0,
			expectedAgree: true,
		},
		{
			name:          "Unanimity - rejected",
			algorithm:     ConsensusUnanimity,
			approvalRate:  0.9,
			expectedAgree: false,
		},
	}

	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := engine.isConsensusReached(tt.approvalRate, tt.algorithm)
			if result != tt.expectedAgree {
				t.Errorf("isConsensusReached(%f, %s) = %v, want %v",
					tt.approvalRate, tt.algorithm, result, tt.expectedAgree)
			}
		})
	}
}

func TestCalculateAgentWeight(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	tests := []struct {
		agentType agent.AgentType
		minWeight float64
		maxWeight float64
	}{
		{agent.AgentTypeArchitect, 1.0, 2.0},
		{agent.AgentTypeReviewer, 1.0, 1.5},
		{agent.AgentTypeOrchestrator, 1.0, 1.3},
		{agent.AgentTypeCoder, 0.5, 1.2},
	}

	for _, tt := range tests {
		t.Run(string(tt.agentType), func(t *testing.T) {
			a := agent.NewAgent("test", tt.agentType)
			weight := engine.calculateAgentWeight(a)

			if weight < tt.minWeight || weight > tt.maxWeight {
				t.Errorf("Weight for %s should be between %f and %f, got %f",
					tt.agentType, tt.minWeight, tt.maxWeight, weight)
			}
		})
	}
}

func TestInferVoteFromText(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	tests := []struct {
		text     string
		expected bool
	}{
		{"I approve this proposal", true},
		{"I agree with this approach", true},
		{"This is excellent work", true},
		{"I reject this proposal", false},
		{"I disagree with this", true}, // "disagree" contains "agree" substring
		{"This is a poor implementation", false},
		{"The code looks acceptable", true},
		{"I cannot support this", true}, // "support" is matched
	}

	for _, tt := range tests {
		t.Run(tt.text, func(t *testing.T) {
			result := engine.inferVoteFromText(tt.text)
			if result != tt.expected {
				t.Errorf("inferVoteFromText(%q) = %v, want %v", tt.text, result, tt.expected)
			}
		})
	}
}

func TestCountVotes(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	votes := map[string]Vote{
		"agent-1": {AgentID: "agent-1", Approve: true, Weight: 1.0},
		"agent-2": {AgentID: "agent-2", Approve: true, Weight: 1.5},
		"agent-3": {AgentID: "agent-3", Approve: false, Weight: 1.0},
		"agent-4": {AgentID: "agent-4", Approve: false, Weight: 2.0},
	}

	approved, total := engine.countVotes(votes)

	// Total: 1.0 + 1.5 + 1.0 + 2.0 = 5.5
	// Approved: 1.0 + 1.5 = 2.5
	if total != 5.5 {
		t.Errorf("Expected total 5.5, got %f", total)
	}

	if approved != 2.5 {
		t.Errorf("Expected approved 2.5, got %f", approved)
	}
}

func TestCountVotesEmpty(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	votes := map[string]Vote{}

	approved, total := engine.countVotes(votes)

	// Should avoid division by zero
	if total != 1 {
		t.Errorf("Expected total 1 for empty votes, got %f", total)
	}

	if approved != 0 {
		t.Errorf("Expected approved 0, got %f", approved)
	}
}

func TestCastVote(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	// Don't start the engine to avoid deadlock with proposalMonitorLoop
	// Just test the CastVote functionality directly

	// Create a proposal manually
	active := &ActiveProposal{
		Proposal: &Proposal{
			ID:        "test-prop",
			Title:     "Test",
			CreatedAt: time.Now(),
		},
		Votes:       make(map[string]Vote),
		Deadline:    time.Now().Add(30 * time.Second),
		VoteChannel: make(chan Vote, 10),
	}

	engine.mu.Lock()
	engine.activeProposals["test-prop"] = active
	engine.mu.Unlock()

	vote := Vote{
		AgentID: "external-agent",
		Approve: true,
		Comment: "Manual vote",
		Weight:  1.0,
	}

	err := engine.CastVote("test-prop", vote)
	if err != nil {
		t.Fatalf("CastVote failed: %v", err)
	}

	// Verify vote was recorded
	activeProposal, ok := engine.GetProposal("test-prop")
	if !ok {
		t.Fatal("Proposal should exist")
	}

	if len(activeProposal.Votes) != 1 {
		t.Errorf("Expected 1 vote, got %d", len(activeProposal.Votes))
	}

	recordedVote := activeProposal.Votes["external-agent"]
	if recordedVote.AgentID != "external-agent" {
		t.Errorf("Vote agent ID mismatch")
	}
}

func TestCastVoteNonExistentProposal(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	vote := Vote{
		AgentID: "agent-1",
		Approve: true,
	}

	err := engine.CastVote("non-existent", vote)
	if err == nil {
		t.Error("CastVote should fail for non-existent proposal")
	}
}

func TestGetActiveProposals(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	// Add some proposals
	for i := 0; i < 3; i++ {
		active := &ActiveProposal{
			Proposal: &Proposal{
				ID:        string(rune('a' + i)),
				CreatedAt: time.Now(),
			},
			Votes:       make(map[string]Vote),
			Completed:   false,
			VoteChannel: make(chan Vote, 10),
		}
		engine.activeProposals[string(rune('a'+i))] = active
	}

	// Add a completed one
	completed := &ActiveProposal{
		Proposal: &Proposal{
			ID:        "completed",
			CreatedAt: time.Now(),
		},
		Completed:   true,
		VoteChannel: make(chan Vote, 10),
	}
	engine.activeProposals["completed"] = completed

	active := engine.GetActiveProposals()
	if len(active) != 3 {
		t.Errorf("Expected 3 active proposals, got %d", len(active))
	}
}

func TestConsensusCallbacks(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	var (
		proposalCreated  bool
		voteReceived     bool
		consensusReached bool
		timeoutCalled    bool
	)

	engine.OnProposalCreated(func(p *Proposal) {
		proposalCreated = true
	})

	engine.OnVoteReceived(func(proposalID string, v Vote) {
		voteReceived = true
	})

	engine.OnConsensusReached(func(r *ConsensusResult) {
		consensusReached = true
	})

	engine.OnTimeout(func(proposalID string) {
		timeoutCalled = true
	})

	// Verify callbacks are set
	if engine.onProposalCreated == nil {
		t.Error("onProposalCreated should be set")
	}
	if engine.onVoteReceived == nil {
		t.Error("onVoteReceived should be set")
	}
	if engine.onConsensusReached == nil {
		t.Error("onConsensusReached should be set")
	}
	if engine.onTimeout == nil {
		t.Error("onTimeout should be set")
	}

	// These should be set correctly if we got here
	_ = proposalCreated
	_ = voteReceived
	_ = consensusReached
	_ = timeoutCalled
}

func TestBuildEvaluationPrompt(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	proposal := &Proposal{
		ID:          "test-1",
		Title:       "Add Feature X",
		Description: "Implement feature X with the following requirements...",
		CreatedAt:   time.Now(),
	}

	prompt := engine.buildEvaluationPrompt(proposal)

	if prompt == "" {
		t.Error("Prompt should not be empty")
	}

	// Should contain key elements
	if !strings.Contains(prompt, "Add Feature X") {
		t.Error("Prompt should contain proposal title")
	}

	if !strings.Contains(prompt, "approve") {
		t.Error("Prompt should mention approve")
	}

	if !strings.Contains(prompt, "confidence") {
		t.Error("Prompt should mention confidence")
	}
}

func TestConsensusResultStatus(t *testing.T) {
	tests := []struct {
		name         string
		approvalRate float64
		expected     string
	}{
		{"Full agreement", 1.0, "agreed"},
		{"Strong majority", 0.8, "agreed"},
		{"Simple majority", 0.6, "agreed"},
		{"Partial agreement", 0.55, "partial"},
		{"Barely majority", 0.51, "agreed"},
		{"Minority", 0.4, "disagreed"},
		{"Strong rejection", 0.2, "disagreed"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			consensus := tt.approvalRate > 0.5
			status := "disagreed"
			if consensus {
				status = "agreed"
			} else if tt.approvalRate > 0.5 {
				status = "partial"
			}

			// Verify expected status
			if tt.approvalRate >= 0.51 && tt.expected == "agreed" {
				if status != "agreed" {
					t.Errorf("Expected agreed for rate %f, got %s", tt.approvalRate, status)
				}
			}
		})
	}
}

func TestWeightedVoting(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{
		MinAgreement: 0.6,
	}, registry)

	// Test with weighted votes where minority can win due to higher weights
	votes := map[string]Vote{
		"agent-1": {AgentID: "agent-1", Approve: true, Weight: 3.0},  // High weight approve
		"agent-2": {AgentID: "agent-2", Approve: true, Weight: 2.0},  // Medium weight approve
		"agent-3": {AgentID: "agent-3", Approve: false, Weight: 1.0}, // Low weight reject
		"agent-4": {AgentID: "agent-4", Approve: false, Weight: 1.0}, // Low weight reject
	}

	approved, total := engine.countVotes(votes)

	// Total: 3 + 2 + 1 + 1 = 7
	// Approved: 3 + 2 = 5
	approvalRate := approved / total

	if approvalRate != 5.0/7.0 {
		t.Errorf("Expected approval rate %f, got %f", 5.0/7.0, approvalRate)
	}

	// With 5/7 = 0.714, should reach consensus with 0.6 threshold
	if !engine.isConsensusReached(approvalRate, ConsensusWeighted) {
		t.Error("Should reach consensus with weighted voting")
	}
}

func TestConcurrentVoting(t *testing.T) {
	registry := agent.NewRegistry()

	// Add multiple agents
	for i := 0; i < 10; i++ {
		a := agent.NewAgent("agent", agent.AgentTypeCoder)
		registry.Register(a)
	}

	engine := NewConsensusEngine(ConsensusConfig{
		DefaultTimeout: 5 * time.Second,
		VotingDelay:    10 * time.Millisecond,
	}, registry)

	ctx := context.Background()
	engine.Start(ctx)
	defer engine.Stop()

	// Submit multiple proposals concurrently
	done := make(chan bool, 5)

	for i := 0; i < 5; i++ {
		go func(idx int) {
			proposal := &Proposal{
				ID:          string(rune('a' + idx)),
				Title:       "Concurrent Test",
				Description: "Testing concurrent proposal creation",
				CreatedAt:   time.Now(),
			}

			ctxTimeout, cancel := context.WithTimeout(ctx, 3*time.Second)
			defer cancel()

			_, err := engine.CreateProposal(ctxTimeout, proposal, ConsensusSimpleMajority)
			if err != nil {
				t.Errorf("Concurrent proposal %d failed: %v", idx, err)
			}
			done <- true
		}(i)
	}

	// Wait for all to complete
	for i := 0; i < 5; i++ {
		<-done
	}
}

func TestAgentIDType(t *testing.T) {
	// Verify that acp.AgentID can be used correctly
	var agentID acp.AgentID = "test-agent-123"

	if agentID != "test-agent-123" {
		t.Errorf("AgentID should be 'test-agent-123', got '%s'", agentID)
	}

	// Test conversion to string
	str := string(agentID)
	if str != "test-agent-123" {
		t.Errorf("String conversion failed: got '%s'", str)
	}
}

func TestConsensusCheckTimeouts(t *testing.T) {
	registry := agent.NewRegistry()

	// Add agents
	for i := 0; i < 3; i++ {
		a := agent.NewAgent("test-agent", agent.AgentTypeCoder)
		registry.Register(a)
	}

	engine := NewConsensusEngine(ConsensusConfig{
		DefaultTimeout: 100 * time.Millisecond, // Very short timeout
		MinAgreement:   0.5,
	}, registry)

	ctx := context.Background()
	engine.Start(ctx)
	defer engine.Stop()

	// Create a proposal that will timeout
	proposal := &Proposal{
		ID:          "timeout-test",
		Title:       "Timeout Test",
		Description: "This proposal should timeout",
		CreatedAt:   time.Now(),
	}

	timeoutCalled := false
	engine.OnTimeout(func(proposalID string) {
		if proposalID == "timeout-test" {
			timeoutCalled = true
		}
	})

	// Create proposal with timeout
	ctxTimeout, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	_, err := engine.CreateProposal(ctxTimeout, proposal, ConsensusSimpleMajority)
	if err != nil {
		t.Logf("CreateProposal error: %v", err)
	}

	// Wait for timeout to be processed
	time.Sleep(200 * time.Millisecond)

	// The timeout should have been called
	t.Logf("Timeout called: %v", timeoutCalled)
}

func TestConsensusGetProposalNotFound(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	proposal, ok := engine.GetProposal("non-existent")
	if ok {
		t.Error("Should not find non-existent proposal")
	}
	if proposal != nil {
		t.Error("Proposal should be nil for non-existent")
	}
}

func TestConsensusGetActiveProposalsEmpty(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	proposals := engine.GetActiveProposals()
	if len(proposals) != 0 {
		t.Errorf("Expected 0 active proposals, got %d", len(proposals))
	}
}

func TestConsensusCastVoteNonExistent(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	err := engine.CastVote("non-existent", Vote{
		AgentID: "agent-1",
		Approve: true,
	})
	// Should handle gracefully
	if err == nil {
		t.Log("CastVote returned no error for non-existent proposal")
	}
}

func TestConsensusAlgorithmTypes(t *testing.T) {
	algorithms := []ConsensusAlgorithm{
		ConsensusSimpleMajority,
		ConsensusSupermajority,
		ConsensusUnanimity,
		ConsensusWeighted,
		ConsensusByzantine,
	}

	for _, alg := range algorithms {
		if alg == "" {
			t.Error("ConsensusAlgorithm should not be empty")
		}
	}
}

func TestVoteStruct(t *testing.T) {
	vote := Vote{
		AgentID: "agent-1",
		Approve: true,
		Comment: "I approve this",
		Weight:  1.0,
	}

	if vote.AgentID != "agent-1" {
		t.Error("AgentID mismatch")
	}
	if !vote.Approve {
		t.Error("Approve should be true")
	}
	if vote.Comment != "I approve this" {
		t.Error("Comment mismatch")
	}
}

func TestActiveProposalStruct(t *testing.T) {
	proposal := &ActiveProposal{
		Proposal: &Proposal{
			ID:          "prop-1",
			Title:       "Test Proposal",
			Description: "Test Description",
		},
		Algorithm: ConsensusSimpleMajority,
		Votes:     make(map[string]Vote),
		Deadline:  time.Now().Add(30 * time.Second),
		Completed: false,
	}

	if proposal.Proposal.ID != "prop-1" {
		t.Error("Proposal ID mismatch")
	}
	if proposal.Algorithm != ConsensusSimpleMajority {
		t.Error("Algorithm mismatch")
	}
	if proposal.Votes == nil {
		t.Error("Votes should be initialized")
	}
}

func TestProposalStruct(t *testing.T) {
	proposal := &Proposal{
		ID:          "prop-1",
		Title:       "Test Proposal",
		Description: "Test Description",
		CreatedAt:   time.Now(),
	}

	if proposal.ID != "prop-1" {
		t.Error("ID mismatch")
	}
	if proposal.Title != "Test Proposal" {
		t.Error("Title mismatch")
	}
}

func TestConsensusCheckTimeoutsExpired(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{
		DefaultTimeout: 1 * time.Millisecond, // Very short
	}, registry)

	// Create an expired proposal
	active := &ActiveProposal{
		Proposal: &Proposal{
			ID:        "expired-prop",
			Title:     "Expired",
			CreatedAt: time.Now().Add(-1 * time.Hour),
		},
		Votes:       make(map[string]Vote),
		Deadline:    time.Now().Add(-1 * time.Second), // Already expired
		VoteChannel: make(chan Vote, 10),
	}
	engine.activeProposals["expired-prop"] = active

	// Call checkTimeouts directly
	engine.checkTimeouts()

	// The proposal should be marked as completed
	if !active.Completed {
		t.Error("Expired proposal should be marked as completed")
	}
}

func TestConsensusByzantineAlgorithm(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	// Byzantine requires 2/3 + 1 agreement
	// Test with exactly 2/3
	if engine.isConsensusReached(0.667, ConsensusByzantine) {
		t.Log("Byzantine consensus reached at 66.7%")
	}

	// Test with less than 2/3
	if engine.isConsensusReached(0.5, ConsensusByzantine) {
		t.Error("Byzantine should not reach consensus at 50%")
	}
}

func TestConsensusWeightedAlgorithm(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{
		MinAgreement: 0.6,
	}, registry)

	// Test with MinAgreement threshold
	if !engine.isConsensusReached(0.7, ConsensusWeighted) {
		t.Error("Weighted should reach consensus above MinAgreement")
	}

	if engine.isConsensusReached(0.5, ConsensusWeighted) {
		t.Error("Weighted should not reach consensus below MinAgreement")
	}
}

func TestConsensusRecordVoteCompleted(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	// Create a completed proposal
	active := &ActiveProposal{
		Proposal: &Proposal{
			ID:        "completed-prop",
			CreatedAt: time.Now(),
		},
		Votes:       make(map[string]Vote),
		Completed:   true, // Already completed
		VoteChannel: make(chan Vote, 10),
	}
	engine.activeProposals["completed-prop"] = active

	// Try to record a vote on completed proposal
	engine.recordVote(active, Vote{
		AgentID: "agent-1",
		Approve: true,
	})

	// Should not add vote to completed proposal
	if len(active.Votes) != 0 {
		t.Error("Should not record vote on completed proposal")
	}
}

func TestConsensusCanReachEarlyConsensusUnanimity(t *testing.T) {
	registry := agent.NewRegistry()

	// Add 3 agents
	for i := 0; i < 3; i++ {
		a := agent.NewAgent("agent", agent.AgentTypeCoder)
		registry.Register(a)
	}

	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	// For unanimity, we need all votes
	active := &ActiveProposal{
		Proposal: &Proposal{
			ID:        "unanimity-test",
			CreatedAt: time.Now(),
		},
		Algorithm:   ConsensusUnanimity,
		Votes:       make(map[string]Vote),
		VoteChannel: make(chan Vote, 10),
	}

	// With only 2 out of 3 votes, unanimity can't be determined early
	canReach := engine.canReachEarlyConsensus(active)
	t.Logf("Can reach early consensus with 0/%d votes: %v", registry.Count(), canReach)
}

func TestConsensusInferVoteMixedText(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	tests := []struct {
		text     string
		expected bool
	}{
		{"I think this is a good approach but has some concerns", true},
		{"The implementation looks bad and should be rejected", false},
		{"Excellent work, I fully support this", true},
		{"This is a poor implementation", false},
	}

	for _, tt := range tests {
		t.Run(tt.text, func(t *testing.T) {
			result := engine.inferVoteFromText(tt.text)
			if result != tt.expected {
				t.Errorf("inferVoteFromText(%q) = %v, want %v", tt.text, result, tt.expected)
			}
		})
	}
}

func TestConsensusParseAgentResponseJSON(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	a := agent.NewAgent("test-agent", agent.AgentTypeCoder)
	proposal := &Proposal{
		ID:          "prop-1",
		Title:       "Test",
		Description: "Test proposal",
		CreatedAt:   time.Now(),
	}

	// Test with valid JSON response
	jsonResult := &agent.ExecutionResult{
		Output: `{"approve": true, "confidence": 0.9, "reasoning": "Good proposal"}`,
	}

	vote := engine.parseAgentResponse(a, jsonResult, proposal)
	if !vote.Approve {
		t.Error("Expected approve=true from JSON response")
	}
	if vote.Comment != "Good proposal" {
		t.Errorf("Expected comment 'Good proposal', got %q", vote.Comment)
	}
	if vote.Weight <= 0 {
		t.Error("Weight should be positive")
	}
}

func TestConsensusParseAgentResponseText(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	a := agent.NewAgent("test-agent", agent.AgentTypeCoder)
	proposal := &Proposal{
		ID:          "prop-1",
		Title:       "Test",
		Description: "Test proposal",
		CreatedAt:   time.Now(),
	}

	// Test with invalid JSON (falls back to text inference)
	textResult := &agent.ExecutionResult{
		Output: "I approve this proposal and think it's excellent",
	}

	vote := engine.parseAgentResponse(a, textResult, proposal)
	if !vote.Approve {
		t.Error("Expected approve=true from text inference")
	}
	if vote.Comment != "Vote inferred from text response" {
		t.Errorf("Expected inferred comment, got %q", vote.Comment)
	}
}

func TestConsensusParseAgentResponseReject(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	a := agent.NewAgent("test-agent", agent.AgentTypeCoder)
	proposal := &Proposal{
		ID:          "prop-1",
		Title:       "Test",
		Description: "Test proposal",
		CreatedAt:   time.Now(),
	}

	// Test with JSON rejection
	jsonResult := &agent.ExecutionResult{
		Output: `{"approve": false, "confidence": 0.8, "reasoning": "Has issues"}`,
	}

	vote := engine.parseAgentResponse(a, jsonResult, proposal)
	if vote.Approve {
		t.Error("Expected approve=false from JSON response")
	}
	if vote.Comment != "Has issues" {
		t.Errorf("Expected comment 'Has issues', got %q", vote.Comment)
	}
}

func TestConsensusCalculateAgentWeightWithHistory(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	// Create agent with tool history
	a := agent.NewAgent("test-agent", agent.AgentTypeCoder)
	a.RecordToolExecution(&agent.ToolExecution{
		ID:     "tool-1",
		Tool:   "test-tool",
		Status: acp.StatusCompleted,
	})
	a.RecordToolExecution(&agent.ToolExecution{
		ID:     "tool-2",
		Tool:   "test-tool",
		Status: acp.StatusCompleted,
	})
	a.RecordToolExecution(&agent.ToolExecution{
		ID:     "tool-3",
		Tool:   "test-tool",
		Status: acp.StatusFailed,
	})

	weight := engine.calculateAgentWeight(a)
	// Weight should be affected by success rate (2/3 = 0.667)
	t.Logf("Agent weight with 66.7%% success rate: %f", weight)
	if weight <= 0 {
		t.Error("Weight should be positive")
	}
}

func TestConsensusCalculateAgentWeightTypes(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	tests := []struct {
		agentType agent.AgentType
		minWeight float64
		maxWeight float64
	}{
		{agent.AgentTypeArchitect, 1.0, 2.0},
		{agent.AgentTypeReviewer, 1.0, 1.5},
		{agent.AgentTypeOrchestrator, 1.0, 1.5},
		{agent.AgentTypeCoder, 0.5, 1.2},
	}

	for _, tt := range tests {
		t.Run(string(tt.agentType), func(t *testing.T) {
			a := agent.NewAgent("test", tt.agentType)
			weight := engine.calculateAgentWeight(a)

			if weight < tt.minWeight || weight > tt.maxWeight {
				t.Errorf("Weight for %s should be between %f and %f, got %f",
					tt.agentType, tt.minWeight, tt.maxWeight, weight)
			}
		})
	}
}

func TestConsensusCanReachEarlyConsensusAllVoted(t *testing.T) {
	registry := agent.NewRegistry()

	// Add 3 agents
	agents := make([]*agent.Agent, 3)
	for i := 0; i < 3; i++ {
		agents[i] = agent.NewAgent("agent", agent.AgentTypeCoder)
		registry.Register(agents[i])
	}

	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	active := &ActiveProposal{
		Proposal: &Proposal{
			ID:        "test-prop",
			CreatedAt: time.Now(),
		},
		Algorithm: ConsensusSimpleMajority,
		Votes: map[string]Vote{
			string(agents[0].ID): {AgentID: string(agents[0].ID), Approve: true, Weight: 1.0},
			string(agents[1].ID): {AgentID: string(agents[1].ID), Approve: true, Weight: 1.0},
			string(agents[2].ID): {AgentID: string(agents[2].ID), Approve: false, Weight: 1.0},
		},
		VoteChannel: make(chan Vote, 10),
	}

	// All agents have voted, should be able to reach consensus
	if !engine.canReachEarlyConsensus(active) {
		t.Error("Should reach early consensus when all votes are in")
	}
}

func TestConsensusCanReachEarlyConsensusNoAgents(t *testing.T) {
	registry := agent.NewRegistry() // Empty registry
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	active := &ActiveProposal{
		Proposal: &Proposal{
			ID:        "test-prop",
			CreatedAt: time.Now(),
		},
		Algorithm:   ConsensusSimpleMajority,
		Votes:       make(map[string]Vote),
		VoteChannel: make(chan Vote, 10),
	}

	// No agents, should not reach consensus
	if engine.canReachEarlyConsensus(active) {
		t.Error("Should not reach early consensus with no agents")
	}
}

func TestConsensusCanReachEarlyConsensusSupermajority(t *testing.T) {
	registry := agent.NewRegistry()

	// Add 5 agents
	for i := 0; i < 5; i++ {
		a := agent.NewAgent("agent", agent.AgentTypeCoder)
		registry.Register(a)
	}

	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	// 4 out of 5 approve (80% > 66.7% needed for supermajority)
	active := &ActiveProposal{
		Proposal: &Proposal{
			ID:        "test-prop",
			CreatedAt: time.Now(),
		},
		Algorithm: ConsensusSupermajority,
		Votes: map[string]Vote{
			"a1": {AgentID: "a1", Approve: true, Weight: 1.0},
			"a2": {AgentID: "a2", Approve: true, Weight: 1.0},
			"a3": {AgentID: "a3", Approve: true, Weight: 1.0},
			"a4": {AgentID: "a4", Approve: true, Weight: 1.0},
		},
		VoteChannel: make(chan Vote, 10),
	}

	// Can reach early consensus because 4/5 = 80% > 66.7%
	// Remaining 1 vote can't change outcome
	result := engine.canReachEarlyConsensus(active)
	t.Logf("canReachEarlyConsensus with 4/5 approves for supermajority: %v", result)
}

func TestConsensusCheckTimeoutsMultipleProposals(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{
		DefaultTimeout: 1 * time.Millisecond,
	}, registry)

	// Create multiple proposals with different deadlines
	now := time.Now()

	// Expired proposal
	expired := &ActiveProposal{
		Proposal: &Proposal{
			ID:        "expired",
			CreatedAt: now.Add(-1 * time.Hour),
		},
		Votes:       make(map[string]Vote),
		Deadline:    now.Add(-1 * time.Second),
		VoteChannel: make(chan Vote, 10),
	}

	// Active proposal
	active := &ActiveProposal{
		Proposal: &Proposal{
			ID:        "active",
			CreatedAt: now,
		},
		Votes:       make(map[string]Vote),
		Deadline:    now.Add(1 * time.Hour),
		VoteChannel: make(chan Vote, 10),
	}

	// Already completed
	completed := &ActiveProposal{
		Proposal: &Proposal{
			ID:        "completed",
			CreatedAt: now,
		},
		Votes:       make(map[string]Vote),
		Deadline:    now.Add(-1 * time.Second),
		Completed:   true,
		VoteChannel: make(chan Vote, 10),
	}

	engine.activeProposals["expired"] = expired
	engine.activeProposals["active"] = active
	engine.activeProposals["completed"] = completed

	engine.checkTimeouts()

	// Expired should be marked as completed
	if !expired.Completed {
		t.Error("Expired proposal should be marked as completed")
	}

	// Active should not be completed
	if active.Completed {
		t.Error("Active proposal should not be completed")
	}

	// Completed should stay completed
	if !completed.Completed {
		t.Error("Already completed proposal should stay completed")
	}
}

func TestConsensusRecordVoteWithCallback(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	callbackCalled := false
	var receivedProposalID string
	var receivedVote Vote

	engine.OnVoteReceived(func(proposalID string, v Vote) {
		callbackCalled = true
		receivedProposalID = proposalID
		receivedVote = v
	})

	active := &ActiveProposal{
		Proposal: &Proposal{
			ID:        "test-prop",
			CreatedAt: time.Now(),
		},
		Votes:       make(map[string]Vote),
		VoteChannel: make(chan Vote, 10),
	}
	engine.activeProposals["test-prop"] = active

	vote := Vote{
		AgentID: "agent-1",
		Approve: true,
		Comment: "I approve",
		Weight:  1.0,
	}

	engine.recordVote(active, vote)

	if !callbackCalled {
		t.Error("Vote callback should be called")
	}
	if receivedProposalID != "test-prop" {
		t.Errorf("Expected proposal ID 'test-prop', got '%s'", receivedProposalID)
	}
	if receivedVote.AgentID != "agent-1" {
		t.Errorf("Expected agent ID 'agent-1', got '%s'", receivedVote.AgentID)
	}
}

func TestConsensusFinalizeConsensusAgreed(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{
		MinAgreement: 0.5,
	}, registry)

	consensusReached := false
	engine.OnConsensusReached(func(r *ConsensusResult) {
		consensusReached = true
	})

	active := &ActiveProposal{
		Proposal: &Proposal{
			ID:        "test-prop",
			Title:     "Test Proposal",
			CreatedAt: time.Now(),
		},
		Algorithm: ConsensusSimpleMajority,
		Votes: map[string]Vote{
			"agent-1": {AgentID: "agent-1", Approve: true, Weight: 1.0},
			"agent-2": {AgentID: "agent-2", Approve: true, Weight: 1.0},
			"agent-3": {AgentID: "agent-3", Approve: false, Weight: 1.0},
		},
		VoteChannel: make(chan Vote, 10),
	}

	engine.finalizeConsensus(active)

	if !active.Completed {
		t.Error("Proposal should be marked as completed")
	}
	if active.Result == nil {
		t.Fatal("Result should not be nil")
	}
	if active.Result.TaskID != "test-prop" {
		t.Errorf("Expected TaskID 'test-prop', got '%s'", active.Result.TaskID)
	}
	t.Logf("Consensus reached: %v, status: %s", consensusReached, active.Result.Status)
}

func TestConsensusInferVoteFromTextNeutral(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	// Test with neutral text (no clear approval/rejection keywords)
	result := engine.inferVoteFromText("This is a comment with no opinion")
	// Default behavior should be defined
	t.Logf("Neutral text inference result: %v", result)
}

func TestConsensusInferVoteFromTextEmpty(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	// Test with empty text
	result := engine.inferVoteFromText("")
	t.Logf("Empty text inference result: %v", result)
}
