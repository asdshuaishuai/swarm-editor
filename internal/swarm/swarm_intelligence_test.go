package swarm

import (
	"context"
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
	// Error expected without registered agents
	if err == nil {
		// This is fine if broadcast to empty set
	}
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
		ID:        "neg-1",
		TaskID:    "task-1",
		Status:    "pending",
		Deadline:  time.Now().Add(5 * time.Second),
		Bids:      make(map[string]*Bid),
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
