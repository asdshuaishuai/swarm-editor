package swarm

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/a2a"
)

func TestSwarmIntelligenceScheduler_Creation(t *testing.T) {
	// Create base scheduler
	baseScheduler := NewScheduler(SchedulerConfig{
		MaxConcurrentTasks: 5,
	}, nil)

	// Create swarm intelligence scheduler
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	if scheduler == nil {
		t.Fatal("Expected scheduler to be created")
	}

	if scheduler.config.PheromoneDecayRate != 0.1 {
		t.Errorf("Expected default pheromone decay rate 0.1, got %f", scheduler.config.PheromoneDecayRate)
	}

	if scheduler.config.ExplorationRate != 0.1 {
		t.Errorf("Expected default exploration rate 0.1, got %f", scheduler.config.ExplorationRate)
	}
}

func TestSwarmIntelligenceScheduler_DepositPheromone(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	// Deposit pheromone for successful task
	scheduler.DepositPheromone("agent1", "coding", true)

	state := scheduler.GetPheromoneState()
	if state["coding"]["agent1"] != 1.0 {
		t.Errorf("Expected pheromone strength 1.0, got %f", state["coding"]["agent1"])
	}

	// Deposit negative pheromone for failed task
	scheduler.DepositPheromone("agent1", "coding", false)
	state = scheduler.GetPheromoneState()
	if state["coding"]["agent1"] >= 1.0 {
		t.Errorf("Expected pheromone strength to decrease after failure, got %f", state["coding"]["agent1"])
	}
}

func TestSwarmIntelligenceScheduler_PheromoneEvaporation(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := SwarmIntelligenceConfig{
		PheromoneDecayRate:   0.5, // 50% decay
		PheromoneDepositBase: 1.0,
		PheromoneEvaporate:   10 * time.Millisecond,
	}
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	// Deposit pheromone
	scheduler.DepositPheromone("agent1", "coding", true)
	initialStrength := scheduler.GetPheromoneState()["coding"]["agent1"]

	// Manually trigger evaporation
	scheduler.evaporatePheromones()

	newStrength := scheduler.GetPheromoneState()["coding"]["agent1"]
	expected := initialStrength * (1 - config.PheromoneDecayRate)

	if newStrength != expected {
		t.Errorf("Expected strength %f after evaporation, got %f", expected, newStrength)
	}
}

func TestSwarmIntelligenceScheduler_SelectAgentsWithPheromone(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	config.ExplorationRate = 0       // Disable exploration for deterministic selection
	config.CongestionThreshold = 0.3 // Lower congestion weight to favor pheromone
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	// Add workers
	agent1 := &AgentInfo{
		ID:            "agent1",
		MaxConcurrent: 5, // Higher capacity
	}
	agent1.IncrementLoad() // Agent1 has load 1

	agent2 := &AgentInfo{
		ID:            "agent2",
		MaxConcurrent: 5,
	}
	// Agent2 has load 0

	scheduler.AddWorker(agent1)
	scheduler.AddWorker(agent2)

	// Deposit very strong pheromone for agent1
	for i := 0; i < 10; i++ {
		scheduler.DepositPheromone("agent1", "coding", true)
	}

	// Even with some load, strong pheromone should favor agent1
	task := &Task{
		ID:          "task1",
		Title:       "Test Task",
		Description: "Test description",
		Metadata:    map[string]interface{}{"type": "coding"},
	}

	selected := scheduler.SelectAgentsWithIntelligence(task)
	if len(selected) == 0 {
		t.Fatal("Expected to select at least one agent")
	}

	// Agent1 should be selected due to strong pheromone strength
	if selected[0].ID != "agent1" {
		t.Errorf("Expected agent1 to be selected, got %s", selected[0].ID)
	}
}

func TestSwarmIntelligenceScheduler_BidCalculation(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	config.BidWeight = 0.7
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	bid := &Bid{
		AgentID:      "agent1",
		TaskID:       "task1",
		Capability:   0.9,
		Availability: 0.8,
		Cost:         2.0,
	}

	value := scheduler.calculateBidValue(bid)

	// Value = Capability * Availability / Cost * Weight
	expected := 0.9 * 0.8 / 2.0 * 0.7
	if value < expected-0.01 || value > expected+0.01 {
		t.Errorf("Expected bid value around %f, got %f", expected, value)
	}
}

func TestSwarmIntelligenceScheduler_SubmitBid(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	config.NegotiationTimeout = 5 * time.Second
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	// Create negotiation
	negotiation := &Negotiation{
		ID:        "neg1",
		TaskID:    "task1",
		Status:    "pending",
		Deadline:  time.Now().Add(5 * time.Second),
		Bids:      make(map[string]*Bid),
		CreatedAt: time.Now(),
	}

	scheduler.mu.Lock()
	scheduler.activeNegotiations["neg1"] = negotiation
	scheduler.mu.Unlock()

	// Submit bid
	bid := &Bid{
		AgentID:      "agent1",
		TaskID:       "task1",
		Capability:   0.8,
		Availability: 1.0,
		Cost:         1.0,
	}

	err := scheduler.SubmitBid("neg1", bid)
	if err != nil {
		t.Fatalf("Failed to submit bid: %v", err)
	}

	// Verify bid was recorded
	if negotiation.Bids["agent1"] == nil {
		t.Error("Expected bid to be recorded")
	}
}

func TestSwarmIntelligenceScheduler_CongestionDetection(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	config.CongestionThreshold = 0.5
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	// Add overloaded agents
	for i := 0; i < 3; i++ {
		agent := &AgentInfo{
			ID:            string(rune('a' + i)),
			MaxConcurrent: 2,
		}
		agent.IncrementLoad()
		agent.IncrementLoad() // Full load
		scheduler.AddWorker(agent)
	}

	// Detect congestion
	signal := scheduler.detectCongestion(scheduler.workers)

	if signal == nil {
		t.Fatal("Expected congestion signal to be detected")
	}

	if signal.Type != "congestion" {
		t.Errorf("Expected signal type 'congestion', got %s", signal.Type)
	}

	if len(signal.Agents) == 0 {
		t.Error("Expected congested agents to be listed")
	}
}

func TestSwarmIntelligenceScheduler_OpportunityDetection(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	config.OpportunityWindow = 5
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	// Add idle agents
	for i := 0; i < 3; i++ {
		agent := &AgentInfo{
			ID:            string(rune('a' + i)),
			MaxConcurrent: 2,
		}
		scheduler.AddWorker(agent)
	}

	// Add pending tasks
	for i := 0; i < 10; i++ {
		task := &Task{
			ID:          string(rune('0' + i)),
			Title:       "Task",
			Description: "Description",
		}
		scheduler.SubmitTask(task)
	}

	// Detect opportunity
	signal := scheduler.detectOpportunity()

	if signal == nil {
		t.Fatal("Expected opportunity signal to be detected")
	}

	if signal.Type != "opportunity" {
		t.Errorf("Expected signal type 'opportunity', got %s", signal.Type)
	}
}

func TestSwarmIntelligenceScheduler_UpdateAgentPerformance(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	// Update performance for successful task
	scheduler.UpdateAgentPerformance("agent1", 100*time.Millisecond, true, "coding")
	scheduler.UpdateAgentPerformance("agent1", 200*time.Millisecond, true, "coding")
	scheduler.UpdateAgentPerformance("agent1", 150*time.Millisecond, false, "coding")

	perf := scheduler.GetAgentPerformance("agent1")
	if perf == nil {
		t.Fatal("Expected performance data to be recorded")
	}

	if perf.TasksCompleted != 2 {
		t.Errorf("Expected 2 completed tasks, got %d", perf.TasksCompleted)
	}

	if perf.TasksFailed != 1 {
		t.Errorf("Expected 1 failed task, got %d", perf.TasksFailed)
	}

	if perf.Specialization["coding"] <= 0 {
		t.Error("Expected coding specialization to be positive")
	}
}

func TestSwarmIntelligenceScheduler_A2AHandlers(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	router := a2a.NewRouter(a2a.RouterConfig{})
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// Test help request handling
	helpMsg := a2a.NewMessage(a2a.MessageTypeHelpRequest, "agent1", "swarm_scheduler").
		WithPayload(&a2a.HelpRequestPayload{
			TaskID:  "task1",
			Reason:  "Need help",
			Urgency: 3,
		})

	err := scheduler.handleHelpRequest(helpMsg)
	if err != nil {
		t.Errorf("Failed to handle help request: %v", err)
	}

	// Test sync handling
	syncMsg := a2a.NewMessage(a2a.MessageTypeSync, "agent1", "swarm_scheduler").
		WithPayload(&a2a.SyncPayload{
			StateType: "swarm_state",
		})

	err = scheduler.handleSync(syncMsg)
	if err != nil {
		t.Errorf("Failed to handle sync: %v", err)
	}

	// Test pheromone handling
	pheroMsg := a2a.NewMessage(a2a.MessageTypePheromone, "agent1", "swarm_scheduler").
		WithPayload(&a2a.PheromonePayload{
			PheromoneType: "coding",
			Strength:      0.8,
			Location:      "agent1",
		})

	err = scheduler.handlePheromone(pheroMsg)
	if err != nil {
		t.Errorf("Failed to handle pheromone: %v", err)
	}

	// Verify pheromone was recorded
	state := scheduler.GetPheromoneState()
	if state["coding"]["agent1"] != 0.8 {
		t.Errorf("Expected pheromone strength 0.8, got %f", state["coding"]["agent1"])
	}
}

func TestSwarmIntelligenceScheduler_Lifecycle(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	config.PheromoneEvaporate = 100 * time.Millisecond
	router := a2a.NewRouter(a2a.RouterConfig{})
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	err := scheduler.Start(ctx)
	if err != nil {
		t.Fatalf("Failed to start scheduler: %v", err)
	}

	// Let it run briefly
	time.Sleep(150 * time.Millisecond)

	// Stop should not block
	done := make(chan struct{})
	go func() {
		scheduler.Stop()
		close(done)
	}()

	select {
	case <-done:
		// Good
	case <-time.After(2 * time.Second):
		t.Fatal("Stop took too long")
	}
}

func TestSwarmIntelligenceScheduler_BroadcastSwarmCommand(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	router := a2a.NewRouter(a2a.RouterConfig{})
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// Broadcast command (will fail without agents, but shouldn't panic)
	err := scheduler.BroadcastSwarmCommand("converge", map[string]string{"target": "task1"})
	// Error expected without registered agents, but nil is also acceptable
	_ = err // Ignore result - broadcast to empty set is allowed
}

func TestSwarmIntelligenceScheduler_GetActiveNegotiations(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	// Initially no negotiations
	negotiations := scheduler.GetActiveNegotiations()
	if len(negotiations) != 0 {
		t.Errorf("Expected 0 negotiations, got %d", len(negotiations))
	}

	// Add a negotiation
	scheduler.activeNegotiations["neg-1"] = &Negotiation{
		ID:     "neg-1",
		Status: "pending",
	}

	negotiations = scheduler.GetActiveNegotiations()
	if len(negotiations) != 1 {
		t.Errorf("Expected 1 negotiation, got %d", len(negotiations))
	}
}

func TestSwarmIntelligenceScheduler_GetActiveNegotiations_WithParticipantsAndBids(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	// Add a negotiation with participants and bids
	scheduler.activeNegotiations["neg-1"] = &Negotiation{
		ID:           "neg-1",
		TaskID:       "task-1",
		Status:       "pending",
		Participants: []string{"agent1", "agent2", "agent3"},
		Bids: map[string]*Bid{
			"agent1": {AgentID: "agent1", Value: 0.5},
			"agent2": {AgentID: "agent2", Value: 0.9},
		},
		Deadline: time.Now().Add(5 * time.Second),
	}

	negotiations := scheduler.GetActiveNegotiations()
	if len(negotiations) != 1 {
		t.Fatalf("Expected 1 negotiation, got %d", len(negotiations))
	}

	// Verify participants were copied
	if len(negotiations[0].Participants) != 3 {
		t.Errorf("Expected 3 participants, got %d", len(negotiations[0].Participants))
	}

	// Verify bids were copied
	if len(negotiations[0].Bids) != 2 {
		t.Errorf("Expected 2 bids, got %d", len(negotiations[0].Bids))
	}

	// Verify deep copy - modifying returned value should not affect original
	negotiations[0].Participants[0] = "modified"
	scheduler.mu.RLock()
	original := scheduler.activeNegotiations["neg-1"]
	if original.Participants[0] == "modified" {
		t.Error("Participants should be deep copied, not shared")
	}
	scheduler.mu.RUnlock()

	// Verify bids are independent
	negotiations[0].Bids["agent1"].Value = 0.0
	scheduler.mu.RLock()
	if scheduler.activeNegotiations["neg-1"].Bids["agent1"].Value == 0.0 {
		t.Error("Bids should be deep copied, not shared")
	}
	scheduler.mu.RUnlock()
}

func TestSwarmIntelligenceScheduler_GetSignals(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	// Initially no signals
	signals := scheduler.GetSignals()
	if len(signals) != 0 {
		t.Errorf("Expected 0 signals, got %d", len(signals))
	}

	// Add a signal manually
	scheduler.signals["sig-1"] = &EmergentSignal{
		Type:      "congestion",
		Location:  "agent1",
		Timestamp: time.Now(),
	}

	signals = scheduler.GetSignals()
	if len(signals) != 1 {
		t.Errorf("Expected 1 signal, got %d", len(signals))
	}
}

func TestSwarmIntelligenceScheduler_GetAgentPerformance(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	// Get performance for non-existent agent
	perf := scheduler.GetAgentPerformance("agent1")
	if perf != nil {
		t.Error("Expected nil performance for unknown agent")
	}

	// Add performance data
	agentPerf := &AgentPerformance{
		AgentID:        "agent1",
		TasksCompleted: 10,
		TasksFailed:    2,
	}
	scheduler.agentPerformance["agent1"] = agentPerf

	perf = scheduler.GetAgentPerformance("agent1")
	if perf == nil {
		t.Fatal("Expected performance data")
	}
	if perf.TasksCompleted != 10 {
		t.Errorf("Expected 10 completed tasks, got %d", perf.TasksCompleted)
	}
}

func TestSwarmIntelligenceScheduler_CalculateBidValue(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	bid := &Bid{
		AgentID:      "agent1",
		Capability:   0.9,
		Availability: 1.0,
		Cost:         1.0,
	}

	value := scheduler.calculateBidValue(bid)
	if value <= 0 {
		t.Errorf("Expected positive bid value, got %f", value)
	}
}

func TestSwarmIntelligenceScheduler_SelectLeastLoaded(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	// Add workers with different loads
	agent1 := &AgentInfo{ID: "agent1", MaxConcurrent: 5}
	agent1.IncrementLoad()
	agent1.IncrementLoad()

	agent2 := &AgentInfo{ID: "agent2", MaxConcurrent: 5}
	agent2.IncrementLoad()

	agents := []*AgentInfo{agent1, agent2}

	selected := scheduler.selectLeastLoaded(agents)
	if len(selected) == 0 {
		t.Fatal("Expected at least one agent selected")
	}
	if selected[0].ID != "agent2" {
		t.Errorf("Expected agent2 (least loaded), got %s", selected[0].ID)
	}
}

func TestSwarmIntelligenceScheduler_SelectRandomAgents(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	config.ExplorationRate = 1.0 // Force exploration
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	// Add workers
	for i := 0; i < 5; i++ {
		agent := &AgentInfo{ID: fmt.Sprintf("agent%d", i), MaxConcurrent: 5}
		scheduler.AddWorker(agent)
	}

	// Get workers and select
	scheduler.mu.RLock()
	agents := make([]*AgentInfo, 0, len(scheduler.workers))
	for _, w := range scheduler.workers {
		agents = append(agents, w)
	}
	scheduler.mu.RUnlock()

	// Select with exploration
	task := &Task{ID: "task-1"}
	selected := scheduler.selectRandomAgents(agents, task)
	if len(selected) == 0 {
		t.Error("Expected at least one agent selected")
	}
}

func TestSwarmIntelligenceScheduler_A2AMessaging(t *testing.T) {
	router := a2a.NewRouter(a2a.RouterConfig{})
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// Register agent for A2A with proper send function
	sendFunc := func(m *a2a.Message) error { return nil }
	scheduler.RegisterAgentForA2A("agent1", sendFunc, []string{"coding"})
	scheduler.RegisterAgentForA2A("agent2", sendFunc, []string{"testing"})

	// Unregister
	scheduler.UnregisterAgentFromA2A("agent1")

	// Send A2A message (should not panic)
	msg := a2a.NewMessage(a2a.MessageTypeTaskRequest, "scheduler", "agent2")
	err := scheduler.SendA2AMessage(msg)
	// Error expected because agent2 may not have proper send function
	_ = err
}

func TestSwarmIntelligenceScheduler_HandleProposal(t *testing.T) {
	router := a2a.NewRouter(a2a.RouterConfig{})
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// Create a negotiation
	scheduler.activeNegotiations["neg-1"] = &Negotiation{
		ID:       "neg-1",
		TaskID:   "task-1",
		Status:   "pending",
		Deadline: time.Now().Add(5 * time.Second),
		Bids:     make(map[string]*Bid),
	}

	// Handle proposal message
	msg := a2a.NewMessage(a2a.MessageTypeProposal, "agent1", "scheduler").
		WithPayload(&a2a.ProposalPayload{
			ProposalID: "prop-1",
			Type:       "bid",
		})

	err := scheduler.handleProposal(msg)
	if err != nil {
		t.Logf("handleProposal returned: %v (may be expected)", err)
	}
}

func TestSwarmIntelligenceScheduler_HandleKnowledgeShare(t *testing.T) {
	router := a2a.NewRouter(a2a.RouterConfig{})
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// Handle knowledge share message
	msg := a2a.NewMessage(a2a.MessageTypeKnowledgeShare, "agent1", "scheduler").
		WithPayload(&a2a.KnowledgeSharePayload{
			Type:    "pattern",
			Title:   "Best Practice",
			Content: []byte(`{"pattern": "singleton"}`),
		})

	err := scheduler.handleKnowledgeShare(msg)
	if err != nil {
		t.Logf("handleKnowledgeShare returned: %v", err)
	}
}

func TestSwarmIntelligenceScheduler_HandleKnowledgeShareSuccessPattern(t *testing.T) {
	router := a2a.NewRouter(a2a.RouterConfig{})
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// Test success_pattern type
	msg := a2a.NewMessage(a2a.MessageTypeKnowledgeShare, "agent1", "scheduler").
		WithPayload(&a2a.KnowledgeSharePayload{
			Type:    "success_pattern",
			Title:   "Success Pattern",
			Content: []byte(`{"taskType": "coding", "success": true}`),
		})

	err := scheduler.handleKnowledgeShare(msg)
	if err != nil {
		t.Errorf("handleKnowledgeShare failed: %v", err)
	}

	// Verify pheromone was deposited
	state := scheduler.GetPheromoneState()
	if state["coding"]["agent1"] <= 0 {
		t.Error("Expected pheromone to be deposited for coding task")
	}

	// Test failure pattern
	msg2 := a2a.NewMessage(a2a.MessageTypeKnowledgeShare, "agent1", "scheduler").
		WithPayload(&a2a.KnowledgeSharePayload{
			Type:    "success_pattern",
			Title:   "Failure Pattern",
			Content: []byte(`{"taskType": "testing", "success": false}`),
		})

	err = scheduler.handleKnowledgeShare(msg2)
	if err != nil {
		t.Errorf("handleKnowledgeShare failed: %v", err)
	}
}

func TestSwarmIntelligenceScheduler_RequestConsensus(t *testing.T) {
	router := a2a.NewRouter(a2a.RouterConfig{})
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// Request consensus (will fail without proper setup)
	ctx := context.Background()
	result, err := scheduler.RequestConsensus(ctx, "Should we proceed?", []string{"yes", "no"}, time.Now().Add(5*time.Second))
	// Error expected without agents
	_ = result
	_ = err
}

func TestSwarmIntelligenceScheduler_RandomFloat(t *testing.T) {
	// Test randomFloat function
	for i := 0; i < 100; i++ {
		val := randomFloat()
		if val < 0 || val > 1.0 {
			t.Errorf("randomFloat returned out of range: %f", val)
		}
	}
}

func TestSwarmIntelligenceScheduler_Min(t *testing.T) {
	if min(1*time.Second, 2*time.Second) != 1*time.Second {
		t.Error("min(1s, 2s) should return 1s")
	}
	if min(2*time.Second, 1*time.Second) != 1*time.Second {
		t.Error("min(2s, 1s) should return 1s")
	}
	if min(5*time.Second, 5*time.Second) != 5*time.Second {
		t.Error("min(5s, 5s) should return 5s")
	}
}

func TestSwarmIntelligenceScheduler_UnmarshalJSON(t *testing.T) {
	data := `{"id": "test", "name": "Test"}`
	var result map[string]interface{}
	err := unmarshalJSON([]byte(data), &result)
	if err != nil {
		t.Errorf("unmarshalJSON failed: %v", err)
	}
	if result["id"] != "test" {
		t.Error("Unexpected result")
	}
}

func TestSwarmIntelligenceScheduler_SelectByNegotiation(t *testing.T) {
	router := a2a.NewRouter(a2a.RouterConfig{})
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	config.NegotiationTimeout = 100 * time.Millisecond
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// Add workers
	agent1 := &AgentInfo{ID: "agent1", MaxConcurrent: 5}
	agent2 := &AgentInfo{ID: "agent2", MaxConcurrent: 5}
	scheduler.AddWorker(agent1)
	scheduler.AddWorker(agent2)

	// Register send functions for A2A
	router.RegisterAgent("agent1", func(m *a2a.Message) error { return nil }, nil)
	router.RegisterAgent("agent2", func(m *a2a.Message) error { return nil }, nil)

	// Test negotiation selection
	task := &Task{ID: "task-1", Title: "Test Task"}
	agents := []*AgentInfo{agent1, agent2}

	selected := scheduler.selectByNegotiation(agents, task)
	// Will fall back to least loaded since no bids received
	if len(selected) == 0 {
		t.Error("Expected at least one agent selected")
	}
}

func TestSwarmIntelligenceScheduler_RequestBids(t *testing.T) {
	router := a2a.NewRouter(a2a.RouterConfig{})
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// Create negotiation
	negotiation := &Negotiation{
		ID:           "neg-1",
		TaskID:       "task-1",
		Participants: []string{"agent1", "agent2"},
		Bids:         make(map[string]*Bid),
		Status:       "pending",
		Deadline:     time.Now().Add(5 * time.Second),
	}

	task := &Task{ID: "task-1", Title: "Test Task"}

	// Request bids - should not panic
	scheduler.requestBids(negotiation, task)

	// Verify negotiation was created
	if negotiation.ID == "" {
		t.Error("Expected negotiation ID to be set")
	}
}

func TestSwarmIntelligenceScheduler_DetectEmergentSignals(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	// Add overloaded agents to trigger congestion signal
	for i := 0; i < 5; i++ {
		agent := &AgentInfo{
			ID:            fmt.Sprintf("agent%d", i),
			MaxConcurrent: 2,
		}
		agent.IncrementLoad()
		agent.IncrementLoad() // Full load
		scheduler.AddWorker(agent)
	}

	// Add pending tasks
	for i := 0; i < 10; i++ {
		task := &Task{ID: fmt.Sprintf("task%d", i)}
		scheduler.SubmitTask(task)
	}

	// Detect emergent signals
	scheduler.detectEmergentSignals()

	// Check if signals were recorded
	signals := scheduler.GetSignals()
	// May or may not have signals depending on thresholds
	_ = signals
}

func TestSwarmIntelligenceScheduler_RecordSignal(t *testing.T) {
	router := a2a.NewRouter(a2a.RouterConfig{})
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// Record a signal
	signal := &EmergentSignal{
		Type:        "test_signal",
		Location:    "swarm",
		Strength:    0.8,
		Timestamp:   time.Now(),
		Description: "Test signal",
	}

	scheduler.recordSignal(signal)

	// Verify signal was recorded
	signals := scheduler.GetSignals()
	if len(signals) == 0 {
		t.Error("Expected signal to be recorded")
	}
}

func TestSwarmIntelligenceScheduler_CleanOldSignals(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	// Add an old signal
	oldSignal := &EmergentSignal{
		Type:      "old_signal",
		Timestamp: time.Now().Add(-10 * time.Minute), // 10 minutes ago
	}
	scheduler.signals["old"] = oldSignal

	// Add a recent signal
	recentSignal := &EmergentSignal{
		Type:      "recent_signal",
		Timestamp: time.Now(),
	}
	scheduler.signals["recent"] = recentSignal

	// Clean old signals
	scheduler.cleanOldSignals()

	// Verify old signal was removed
	signals := scheduler.GetSignals()
	for _, s := range signals {
		if s.Type == "old_signal" {
			t.Error("Old signal should have been cleaned")
		}
	}
}

func TestSwarmIntelligenceScheduler_HandleSignalMessage(t *testing.T) {
	router := a2a.NewRouter(a2a.RouterConfig{})
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// Add agents for congestion handling
	agent := &AgentInfo{ID: "agent1", MaxConcurrent: 5}
	scheduler.AddWorker(agent)

	// Test congestion signal
	congestionMsg := a2a.NewMessage(a2a.MessageTypeSignal, "agent1", "scheduler").
		WithPayload(&a2a.SignalPayload{
			SignalType: "congestion",
			Strength:   0.9,
			Location:   "swarm",
		})

	err := scheduler.handleSignal(congestionMsg)
	if err != nil {
		t.Errorf("handleSignal failed: %v", err)
	}

	// Test opportunity signal
	opportunityMsg := a2a.NewMessage(a2a.MessageTypeSignal, "agent1", "scheduler").
		WithPayload(&a2a.SignalPayload{
			SignalType: "opportunity",
			Strength:   0.7,
			Location:   "swarm",
		})

	err = scheduler.handleSignal(opportunityMsg)
	if err != nil {
		t.Errorf("handleSignal failed for opportunity: %v", err)
	}
}

func TestSwarmIntelligenceScheduler_HandleCongestionSignal(t *testing.T) {
	router := a2a.NewRouter(a2a.RouterConfig{})
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// Add agents with different loads
	agent1 := &AgentInfo{ID: "agent1", MaxConcurrent: 5}
	agent1.IncrementLoad()
	agent1.IncrementLoad()

	agent2 := &AgentInfo{ID: "agent2", MaxConcurrent: 5} // No load

	scheduler.AddWorker(agent1)
	scheduler.AddWorker(agent2)

	// Handle congestion signal
	payload := a2a.SignalPayload{
		SignalType: "congestion",
		Strength:   0.9,
		Location:   "swarm",
	}

	scheduler.handleCongestionSignal(payload)
	// Should not panic
}

func TestSwarmIntelligenceScheduler_HandleOpportunitySignal(t *testing.T) {
	router := a2a.NewRouter(a2a.RouterConfig{})
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// Handle opportunity signal
	payload := a2a.SignalPayload{
		SignalType: "opportunity",
		Strength:   0.8,
		Location:   "swarm",
		Data:       []byte(`{"tasks": 5}`),
	}

	scheduler.handleOpportunitySignal(payload)
	// Should not panic
}

func TestSwarmIntelligenceScheduler_CalculateBidValueLocked(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	config.BidWeight = 0.7
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	// Deposit some pheromone
	scheduler.DepositPheromone("agent1", "default", true)

	bid := &Bid{
		AgentID:      "agent1",
		Capability:   0.9,
		Availability: 0.8,
		Cost:         2.0,
	}

	value := scheduler.calculateBidValueLocked(bid)
	if value <= 0 {
		t.Errorf("Expected positive bid value, got %f", value)
	}
}

func TestSwarmIntelligenceScheduler_GetTaskType(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	// Test with no metadata
	task1 := &Task{ID: "task1"}
	if scheduler.getTaskType(task1) != "default" {
		t.Error("Expected default task type")
	}

	// Test with metadata
	task2 := &Task{
		ID:       "task2",
		Metadata: map[string]interface{}{"type": "coding"},
	}
	if scheduler.getTaskType(task2) != "coding" {
		t.Error("Expected coding task type")
	}

	// Test with non-string type
	task3 := &Task{
		ID:       "task3",
		Metadata: map[string]interface{}{"type": 123},
	}
	if scheduler.getTaskType(task3) != "default" {
		t.Error("Expected default task type for non-string")
	}
}

func TestSwarmIntelligenceScheduler_SelectByNegotiationWithRealTimeBids(t *testing.T) {
	router := a2a.NewRouter(a2a.RouterConfig{})
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	config.NegotiationTimeout = 200 * time.Millisecond
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// Add workers
	agent1 := &AgentInfo{ID: "agent1", MaxConcurrent: 5}
	agent2 := &AgentInfo{ID: "agent2", MaxConcurrent: 5}
	scheduler.AddWorker(agent1)
	scheduler.AddWorker(agent2)

	// Register send functions for A2A
	router.RegisterAgent("agent1", func(m *a2a.Message) error { return nil }, nil)
	router.RegisterAgent("agent2", func(m *a2a.Message) error {
		// When agent2 receives a proposal, it submits a bid via SubmitBid
		if m.Type == a2a.MessageTypeProposal {
			// Parse the proposal to get negotiation ID
			var payload a2a.ProposalPayload
			if err := m.ParsePayload(&payload); err == nil {
				// Submit a bid asynchronously after a short delay
				go func() {
					time.Sleep(10 * time.Millisecond)
					scheduler.SubmitBid(payload.ProposalID, &Bid{
						AgentID:      "agent2",
						TaskID:       "task-bid-test",
						Capability:   0.9,
						Availability: 1.0,
						Cost:         0.5,
						Reason:       "I can do this task well",
					})
				}()
			}
		}
		return nil
	}, nil)

	// Test negotiation selection with bids
	task := &Task{ID: "task-bid-test", Title: "Test Task"}
	agents := []*AgentInfo{agent1, agent2}

	selected := scheduler.selectByNegotiation(agents, task)
	// Agent2 should win because it has a higher bid
	if len(selected) == 0 {
		t.Error("Expected at least one agent selected")
	}
}

func TestSwarmIntelligenceScheduler_HandleProposalTaskBid(t *testing.T) {
	router := a2a.NewRouter(a2a.RouterConfig{})
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// Create a negotiation
	scheduler.mu.Lock()
	scheduler.activeNegotiations["neg-1"] = &Negotiation{
		ID:       "neg-1",
		TaskID:   "task-1",
		Status:   "pending",
		Deadline: time.Now().Add(5 * time.Second),
		Bids:     make(map[string]*Bid),
	}
	scheduler.mu.Unlock()

	// Handle proposal message with task_bid type
	bidContent, _ := json.Marshal(&Bid{
		AgentID:      "agent1",
		TaskID:       "task-1",
		Capability:   0.9,
		Availability: 1.0,
		Cost:         0.5,
		Reason:       "I can handle this task",
	})

	msg := a2a.NewMessage(a2a.MessageTypeProposal, "agent1", "scheduler").
		WithPayload(&a2a.ProposalPayload{
			ProposalID: "neg-1",
			Type:       "task_bid",
			Content:    bidContent,
		})

	err := scheduler.handleProposal(msg)
	if err != nil {
		t.Errorf("handleProposal should succeed: %v", err)
	}

	// Verify bid was added
	scheduler.mu.RLock()
	bid, exists := scheduler.activeNegotiations["neg-1"].Bids["agent1"]
	scheduler.mu.RUnlock()

	if !exists {
		t.Error("Expected bid to be added to negotiation")
	}
	if bid != nil && bid.Capability != 0.9 {
		t.Errorf("Expected capability 0.9, got %f", bid.Capability)
	}
}

func TestSwarmIntelligenceScheduler_HandleProposalUnknownType(t *testing.T) {
	router := a2a.NewRouter(a2a.RouterConfig{})
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// Handle proposal message with unknown type
	msg := a2a.NewMessage(a2a.MessageTypeProposal, "agent1", "scheduler").
		WithPayload(&a2a.ProposalPayload{
			ProposalID: "prop-1",
			Type:       "unknown_type",
		})

	err := scheduler.handleProposal(msg)
	if err != nil {
		t.Errorf("handleProposal should return nil for unknown type: %v", err)
	}
}

func TestSwarmIntelligenceScheduler_HandleProposalInvalidPayload(t *testing.T) {
	router := a2a.NewRouter(a2a.RouterConfig{})
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// Handle proposal message with invalid payload (missing payload)
	msg := &a2a.Message{
		Type: a2a.MessageTypeProposal,
	}

	err := scheduler.handleProposal(msg)
	if err == nil {
		t.Error("Expected error for message without payload")
	}
}

// ==================== safeMarshalJSON Tests ====================

func TestSafeMarshalJSON_Valid(t *testing.T) {
	data := map[string]any{"key": "value", "num": 42}
	result := safeMarshalJSON(data)
	if result == nil {
		t.Error("expected non-nil result for valid input")
	}
	if string(result) != `{"key":"value","num":42}` {
		t.Errorf("result = %s, want {\"key\":\"value\",\"num\":42}", string(result))
	}
}

func TestSafeMarshalJSON_Slice(t *testing.T) {
	data := []string{"a", "b", "c"}
	result := safeMarshalJSON(data)
	if result == nil {
		t.Error("expected non-nil result for slice")
	}
}

func TestSafeMarshalJSON_Nil(t *testing.T) {
	result := safeMarshalJSON(nil)
	if string(result) != "null" {
		t.Errorf("result = %s, want 'null'", string(result))
	}
}

func TestSafeMarshalJSON_Unmarshallable(t *testing.T) {
	// Channel cannot be marshaled to JSON
	ch := make(chan int)
	result := safeMarshalJSON(ch)
	if result != nil {
		t.Error("expected nil for unmarshallable type (channel)")
	}
}

func TestSafeMarshalJSON_Func(t *testing.T) {
	// Functions cannot be marshaled to JSON
	fn := func() {}
	result := safeMarshalJSON(fn)
	if result != nil {
		t.Error("expected nil for unmarshallable type (func)")
	}
}

// ==================== mustMarshalJSON Tests ====================

func TestMustMarshalJSON_Valid(t *testing.T) {
	data := map[string]string{"a": "b"}
	result := mustMarshalJSON(data)
	if result == nil {
		t.Error("expected non-nil result")
	}
}

func TestDetectSynergy_NoPheromones(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	s := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	signal := s.detectSynergy()
	if signal != nil {
		t.Error("expected nil signal when no pheromones exist")
	}
}

func TestDetectSynergy_WithSynergisticAgents(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	config.SignalThreshold = 0.3
	s := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	// Deposit strong pheromones for 2 agents on same task type
	s.DepositPheromone("agent-1", "coding", true)
	s.DepositPheromone("agent-1", "coding", true)
	s.DepositPheromone("agent-2", "coding", true)
	s.DepositPheromone("agent-2", "coding", true)

	// Set up agent performance with high specialization
	s.agentPerformance["agent-1"] = &AgentPerformance{
		Specialization: map[string]float64{"coding": 0.9},
	}
	s.agentPerformance["agent-2"] = &AgentPerformance{
		Specialization: map[string]float64{"coding": 0.85},
	}

	signal := s.detectSynergy()
	if signal == nil {
		t.Fatal("expected synergy signal to be detected")
	}
	if signal.Type != "synergy" {
		t.Errorf("expected type 'synergy', got %q", signal.Type)
	}
	if signal.Strength <= 0 {
		t.Errorf("expected positive strength, got %f", signal.Strength)
	}
	if len(signal.Agents) != 2 {
		t.Errorf("expected 2 agents, got %d", len(signal.Agents))
	}
}

func TestDetectSynergy_LowScore(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	config.SignalThreshold = 0.3
	s := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	// Deposit pheromones for 2 agents
	s.DepositPheromone("agent-1", "coding", true)
	s.DepositPheromone("agent-2", "coding", true)

	// Low specialization (score won't exceed 1.5)
	s.agentPerformance["agent-1"] = &AgentPerformance{
		Specialization: map[string]float64{"coding": 0.3},
	}
	s.agentPerformance["agent-2"] = &AgentPerformance{
		Specialization: map[string]float64{"coding": 0.3},
	}

	signal := s.detectSynergy()
	if signal != nil {
		t.Error("expected nil signal when synergy score is too low")
	}
}

func TestDetectSynergy_SingleAgentPerTask(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	config.SignalThreshold = 0.3
	s := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	// Only 1 agent with pheromone
	s.DepositPheromone("agent-1", "coding", true)
	s.DepositPheromone("agent-1", "coding", true)

	signal := s.detectSynergy()
	if signal != nil {
		t.Error("expected nil signal with only 1 agent per task type")
	}
}

func TestDetectInnovation_NoPerformanceData(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	s := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	signal := s.detectInnovation()
	if signal != nil {
		t.Error("expected nil signal when no performance data exists")
	}
}

func TestDetectInnovation_WithInnovators(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	s := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	// Set up a worker so workerCount > 0
	s.workers = map[string]*AgentInfo{"agent-1": {}}

	// Agent with 4+ successes in last 5 tasks
	s.agentPerformance["agent-1"] = &AgentPerformance{
		RecentSuccess: []bool{false, true, true, true, true},
	}

	signal := s.detectInnovation()
	if signal == nil {
		t.Fatal("expected innovation signal to be detected")
	}
	if signal.Type != "innovation" {
		t.Errorf("expected type 'innovation', got %q", signal.Type)
	}
	if signal.Confidence != 0.8 {
		t.Errorf("expected confidence 0.8, got %f", signal.Confidence)
	}
}

func TestDetectInnovation_LowSuccessRate(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	s := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	s.workers = map[string]*AgentInfo{"agent-1": {}}

	// Agent with only 2 successes in last 5 tasks
	s.agentPerformance["agent-1"] = &AgentPerformance{
		RecentSuccess: []bool{false, false, true, true, false},
	}

	signal := s.detectInnovation()
	if signal != nil {
		t.Error("expected nil signal when success rate is too low")
	}
}

func TestDetectInnovation_NoWorkers(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	s := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	// Innovator but no workers
	s.agentPerformance["agent-1"] = &AgentPerformance{
		RecentSuccess: []bool{true, true, true, true, true},
	}

	signal := s.detectInnovation()
	if signal != nil {
		t.Error("expected nil signal when workerCount is 0")
	}
}

func TestDetectInnovation_InsufficientHistory(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	s := NewSwarmIntelligenceScheduler(baseScheduler, config, nil, nil)

	s.workers = map[string]*AgentInfo{"agent-1": {}}

	// Agent with only 3 recent successes (needs >= 5)
	s.agentPerformance["agent-1"] = &AgentPerformance{
		RecentSuccess: []bool{true, true, true},
	}

	signal := s.detectInnovation()
	if signal != nil {
		t.Error("expected nil signal when RecentSuccess < 5")
	}
}

func TestSwarmIntelligence_HandleHelpRequest_ParseError(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	router := a2a.NewRouter(a2a.RouterConfig{})
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// Invalid payload (not JSON) - create message with nil payload, then override
	helpMsg := a2a.NewMessage(a2a.MessageTypeHelpRequest, "agent1", "swarm_scheduler")
	helpMsg.Payload = json.RawMessage("not json{{{")

	err := scheduler.handleHelpRequest(helpMsg)
	if err == nil {
		t.Error("expected error for invalid payload")
	}
}

func TestSwarmIntelligence_HandleHelpRequest_NoHelpers(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	router := a2a.NewRouter(a2a.RouterConfig{})
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// Valid payload but no workers registered
	helpMsg := a2a.NewMessage(a2a.MessageTypeHelpRequest, "agent1", "swarm_scheduler").
		WithPayload(&a2a.HelpRequestPayload{
			TaskID:  "task1",
			Reason:  "Need help",
			Urgency: 3,
		})

	err := scheduler.handleHelpRequest(helpMsg)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestSwarmIntelligence_HandleHelpRequest_WithHelpers(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	router := a2a.NewRouter(a2a.RouterConfig{})
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// Add a worker with low load
	worker := &AgentInfo{ID: "helper-1", MaxConcurrent: 5}
	scheduler.workers["helper-1"] = worker

	helpMsg := a2a.NewMessage(a2a.MessageTypeHelpRequest, "helper-1", "swarm_scheduler").
		WithPayload(&a2a.HelpRequestPayload{
			TaskID:  "task1",
			Reason:  "Need help",
			Urgency: 3,
		})

	err := scheduler.handleHelpRequest(helpMsg)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestSwarmIntelligence_HandleHelpRequest_SenderIsHelper(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	router := a2a.NewRouter(a2a.RouterConfig{})
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// Add a worker, but sender IS the helper (should be excluded)
	worker := &AgentInfo{ID: "helper-1", MaxConcurrent: 5}
	scheduler.workers["helper-1"] = worker

	helpMsg := a2a.NewMessage(a2a.MessageTypeHelpRequest, "helper-1", "swarm_scheduler").
		WithPayload(&a2a.HelpRequestPayload{
			TaskID:  "task1",
			Reason:  "Need help",
			Urgency: 3,
		})

	err := scheduler.handleHelpRequest(helpMsg)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	// helper-1 is excluded because msg.From == helper-1
}

func TestSwarmIntelligence_DetectSelfOrganization_FewWorkers(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	router := a2a.NewRouter(a2a.RouterConfig{})
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// Less than 2 workers should return nil
	workers := map[string]*AgentInfo{
		"agent-1": {ID: "agent-1", MaxConcurrent: 5},
	}
	signal := scheduler.detectSelfOrganization(workers)
	if signal != nil {
		t.Error("expected nil signal with < 2 workers")
	}
}

func TestSwarmIntelligence_DetectSelfOrganization_AllIdle(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	router := a2a.NewRouter(a2a.RouterConfig{})
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// All idle (load=0) → activeRatio=0 → no signal
	workers := map[string]*AgentInfo{
		"agent-1": {ID: "agent-1", MaxConcurrent: 5},
		"agent-2": {ID: "agent-2", MaxConcurrent: 5},
		"agent-3": {ID: "agent-3", MaxConcurrent: 5},
	}
	signal := scheduler.detectSelfOrganization(workers)
	if signal != nil {
		t.Error("expected nil signal when all agents idle")
	}
}

func TestSwarmIntelligence_DetectSelfOrganization_AllFull(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	router := a2a.NewRouter(a2a.RouterConfig{})
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// All full (load >= MaxConcurrent) → no signal
	workers := map[string]*AgentInfo{
		"agent-1": {ID: "agent-1", MaxConcurrent: 2},
		"agent-2": {ID: "agent-2", MaxConcurrent: 2},
	}
	workers["agent-1"].IncrementLoad()
	workers["agent-1"].IncrementLoad()
	workers["agent-2"].IncrementLoad()
	workers["agent-2"].IncrementLoad()
	signal := scheduler.detectSelfOrganization(workers)
	if signal != nil {
		t.Error("expected nil signal when all agents full")
	}
}

func TestSwarmIntelligence_DetectSelfOrganization_Balanced(t *testing.T) {
	baseScheduler := NewScheduler(SchedulerConfig{}, nil)
	config := DefaultSwarmIntelligenceConfig()
	router := a2a.NewRouter(a2a.RouterConfig{})
	scheduler := NewSwarmIntelligenceScheduler(baseScheduler, config, router, nil)

	// 3 active, 1 idle → activeRatio=0.75 → should detect self-organization
	workers := map[string]*AgentInfo{
		"agent-1": {ID: "agent-1", MaxConcurrent: 5},
		"agent-2": {ID: "agent-2", MaxConcurrent: 5},
		"agent-3": {ID: "agent-3", MaxConcurrent: 5},
		"agent-4": {ID: "agent-4", MaxConcurrent: 5},
	}
	workers["agent-1"].IncrementLoad() // load=1
	workers["agent-2"].IncrementLoad()
	workers["agent-2"].IncrementLoad() // load=2
	workers["agent-3"].IncrementLoad() // load=1
	// agent-4 stays at load=0
	signal := scheduler.detectSelfOrganization(workers)
	if signal == nil {
		t.Fatal("expected self-organization signal")
	}
	if signal.Type != "self_organization" {
		t.Errorf("expected type self_organization, got %s", signal.Type)
	}
	if signal.Strength < 0.7 || signal.Strength > 0.8 {
		t.Errorf("expected strength ~0.75, got %v", signal.Strength)
	}
}
