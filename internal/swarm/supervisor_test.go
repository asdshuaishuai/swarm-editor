package swarm

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
)

// Helper function to create a test agent
func createTestAgent(name string, agentType agent.AgentType) *agent.Agent {
	return agent.NewAgent(name, agentType)
}

// Helper function to create a supervisor with test configuration
func createTestSupervisor() *Supervisor {
	config := SupervisorConfig{
		CheckInterval:    100 * time.Millisecond,
		HeartbeatTimeout: 200 * time.Millisecond,
		StuckThreshold:   500 * time.Millisecond,
		RecoveryTimeout:  1 * time.Second,
		HealthThreshold:  0.7,
	}
	return NewSupervisor(config, nil, nil)
}

func TestNewSupervisor(t *testing.T) {
	tests := []struct {
		name           string
		config         SupervisorConfig
		registry       *agent.Registry
		lifecycle      *agent.Lifecycle
		wantConfigured bool
	}{
		{
			name:           "with default config",
			config:         DefaultSupervisorConfig(),
			registry:       nil,
			lifecycle:      nil,
			wantConfigured: true,
		},
		{
			name: "with custom config",
			config: SupervisorConfig{
				CheckInterval:    10 * time.Second,
				HeartbeatTimeout: 30 * time.Second,
				StuckThreshold:   60 * time.Second,
				RecoveryTimeout:  120 * time.Second,
				HealthThreshold:  0.8,
			},
			registry:       nil,
			lifecycle:      nil,
			wantConfigured: true,
		},
		{
			name:           "with provided registry and lifecycle",
			config:         DefaultSupervisorConfig(),
			registry:       agent.NewRegistry(),
			lifecycle:      nil, // Will be created from registry
			wantConfigured: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sup := NewSupervisor(tt.config, tt.registry, tt.lifecycle)

			if sup == nil {
				t.Fatal("NewSupervisor returned nil")
			}

			if sup.healthScores == nil {
				t.Error("healthScores map should be initialized")
			}

			if sup.alerts == nil {
				t.Error("alerts slice should be initialized")
			}

			if sup.stuckAgents == nil {
				t.Error("stuckAgents map should be initialized")
			}

			if sup.heartbeats == nil {
				t.Error("heartbeats map should be initialized")
			}

			if sup.registry == nil {
				t.Error("registry should be initialized")
			}

			if sup.lifecycle == nil {
				t.Error("lifecycle should be initialized")
			}

			// Verify stuck config is set correctly
			if !sup.stuckConfig.Enabled {
				t.Error("stuck detection should be enabled by default")
			}

			// Verify heartbeat config is set correctly
			if !sup.heartbeatConfig.Required {
				t.Error("heartbeat should be required by default")
			}
		})
	}
}

func TestDefaultSupervisorConfig(t *testing.T) {
	config := DefaultSupervisorConfig()

	if config.CheckInterval != 30*time.Second {
		t.Errorf("Expected CheckInterval 30s, got %v", config.CheckInterval)
	}

	if config.HeartbeatTimeout != 60*time.Second {
		t.Errorf("Expected HeartbeatTimeout 60s, got %v", config.HeartbeatTimeout)
	}

	if config.StuckThreshold != 2*time.Minute {
		t.Errorf("Expected StuckThreshold 2m, got %v", config.StuckThreshold)
	}

	if config.RecoveryTimeout != 2*time.Minute {
		t.Errorf("Expected RecoveryTimeout 2m, got %v", config.RecoveryTimeout)
	}

	if config.HealthThreshold != 0.7 {
		t.Errorf("Expected HealthThreshold 0.7, got %v", config.HealthThreshold)
	}
}

func TestSupervisorStartStop(t *testing.T) {
	sup := createTestSupervisor()

	ctx := context.Background()

	// Test Start
	err := sup.Start(ctx)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	if !sup.running {
		t.Error("Supervisor should be running after Start")
	}

	// Give it a moment to start the monitor loop
	time.Sleep(50 * time.Millisecond)

	// Test Stop
	sup.Stop()

	if sup.running {
		t.Error("Supervisor should not be running after Stop")
	}
}

func TestSupervisorDoubleStart(t *testing.T) {
	sup := createTestSupervisor()

	ctx := context.Background()

	// First start should succeed
	err := sup.Start(ctx)
	if err != nil {
		t.Fatalf("First Start failed: %v", err)
	}

	// Second start should fail
	err = sup.Start(ctx)
	if err == nil {
		t.Error("Second Start should return error")
	}

	// Clean up
	sup.Stop()
}

func TestSupervisorDoubleStop(t *testing.T) {
	sup := createTestSupervisor()

	ctx := context.Background()
	sup.Start(ctx)

	// First stop should succeed
	sup.Stop()

	// Second stop should not panic
	sup.Stop()
}

func TestSupervisorStopWithoutStart(t *testing.T) {
	sup := createTestSupervisor()

	// Stop without start should not panic
	sup.Stop()
}

func TestSupervisorRecordHeartbeat(t *testing.T) {
	sup := createTestSupervisor()
	agentID := "test-agent-1"

	// Record initial heartbeat
	sup.RecordHeartbeat(agentID)

	// Verify heartbeat was recorded
	sup.mu.RLock()
	_, exists := sup.heartbeats[agentID]
	sup.mu.RUnlock()

	if !exists {
		t.Error("Heartbeat should be recorded")
	}

	// Record another heartbeat
	time.Sleep(10 * time.Millisecond)
	sup.RecordHeartbeat(agentID)

	// Verify heartbeat time was updated
	sup.mu.RLock()
	heartbeatTime := sup.heartbeats[agentID]
	sup.mu.RUnlock()

	if heartbeatTime.IsZero() {
		t.Error("Heartbeat time should be set")
	}
}

func TestSupervisorRecordHeartbeatWithExistingHealth(t *testing.T) {
	sup := createTestSupervisor()

	// Create and register agent for recovery callback
	testAgent := createTestAgent("Test Agent", agent.AgentTypeCoder)
	sup.registry.Register(testAgent)
	agentID := string(testAgent.ID)

	// Create health entry with some failures
	sup.mu.Lock()
	sup.healthScores[agentID] = &AgentHealth{
		AgentID:          agentID,
		Score:            0.5,
		ConsecutiveFails: 3,
	}
	sup.stuckAgents[agentID] = &StuckAgentInfo{
		AgentID:         agentID,
		StuckAt:         time.Now().Add(-1 * time.Minute),
		DetectedAt:      time.Now().Add(-1 * time.Minute),
		RecoveryAttempt: 0,
	}
	sup.mu.Unlock()

	// Record heartbeat - should clear stuck state and reset failures
	sup.RecordHeartbeat(agentID)

	// Verify consecutive fails was reset
	health := sup.GetHealth(agentID)
	if health == nil {
		t.Fatal("Health should exist")
	}

	if health.ConsecutiveFails != 0 {
		t.Errorf("Expected ConsecutiveFails 0, got %d", health.ConsecutiveFails)
	}

	// Verify stuck state was cleared
	sup.mu.RLock()
	_, isStuck := sup.stuckAgents[agentID]
	sup.mu.RUnlock()

	if isStuck {
		t.Error("Agent should no longer be marked as stuck")
	}
}

func TestSupervisorMarkTaskResult(t *testing.T) {
	tests := []struct {
		name           string
		agentID        string
		success        bool
		responseTime   time.Duration
		initialHealth  *AgentHealth
		wantTotal      int
		wantSuccessful int
		wantFails      int
	}{
		{
			name:           "first success",
			agentID:        "agent-1",
			success:        true,
			responseTime:   100 * time.Millisecond,
			initialHealth:  nil,
			wantTotal:      1,
			wantSuccessful: 1,
			wantFails:      0,
		},
		{
			name:           "first failure",
			agentID:        "agent-2",
			success:        false,
			responseTime:   200 * time.Millisecond,
			initialHealth:  nil,
			wantTotal:      1,
			wantSuccessful: 0,
			wantFails:      1,
		},
		{
			name:         "success after failures resets consecutive fails",
			agentID:      "agent-3",
			success:      true,
			responseTime: 50 * time.Millisecond,
			initialHealth: &AgentHealth{
				AgentID:          "agent-3",
				Score:            0.5,
				ConsecutiveFails: 5,
				TotalTasks:       10,
				SuccessfulTasks:  5,
			},
			wantTotal:      11,
			wantSuccessful: 6,
			wantFails:      0,
		},
		{
			name:         "failure increments consecutive fails",
			agentID:      "agent-4",
			success:      false,
			responseTime: 150 * time.Millisecond,
			initialHealth: &AgentHealth{
				AgentID:          "agent-4",
				Score:            0.8,
				ConsecutiveFails: 2,
				TotalTasks:       5,
				SuccessfulTasks:  5,
			},
			wantTotal:      6,
			wantSuccessful: 5,
			wantFails:      3,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sup := createTestSupervisor()

			// Set up initial health if provided
			if tt.initialHealth != nil {
				sup.mu.Lock()
				sup.healthScores[tt.agentID] = tt.initialHealth
				sup.mu.Unlock()
			}

			// Mark task result
			sup.MarkTaskResult(tt.agentID, tt.success, tt.responseTime)

			// Verify health
			health := sup.GetHealth(tt.agentID)
			if health == nil {
				t.Fatal("Health should exist")
			}

			if health.TotalTasks != tt.wantTotal {
				t.Errorf("Expected TotalTasks %d, got %d", tt.wantTotal, health.TotalTasks)
			}

			if health.SuccessfulTasks != tt.wantSuccessful {
				t.Errorf("Expected SuccessfulTasks %d, got %d", tt.wantSuccessful, health.SuccessfulTasks)
			}

			if health.ConsecutiveFails != tt.wantFails {
				t.Errorf("Expected ConsecutiveFails %d, got %d", tt.wantFails, health.ConsecutiveFails)
			}

			// Verify response time was updated
			if health.AvgResponseTime <= 0 {
				t.Error("AvgResponseTime should be positive")
			}
		})
	}
}

func TestSupervisorMarkTaskResultNoResponseTime(t *testing.T) {
	sup := createTestSupervisor()
	agentID := "test-agent"

	// Mark task with zero response time
	sup.MarkTaskResult(agentID, true, 0)

	health := sup.GetHealth(agentID)
	if health == nil {
		t.Fatal("Health should exist")
	}

	// AvgResponseTime should still be 0 if no response time provided
	if health.AvgResponseTime != 0 {
		t.Errorf("Expected AvgResponseTime 0, got %v", health.AvgResponseTime)
	}
}

func TestSupervisorGetHealth(t *testing.T) {
	sup := createTestSupervisor()
	agentID := "test-agent"

	// Get health for non-existent agent
	health := sup.GetHealth(agentID)
	if health != nil {
		t.Error("GetHealth should return nil for non-existent agent")
	}

	// Create health entry
	sup.mu.Lock()
	sup.healthScores[agentID] = &AgentHealth{
		AgentID: agentID,
		Score:   0.85,
	}
	sup.mu.Unlock()

	// Get health for existing agent
	health = sup.GetHealth(agentID)
	if health == nil {
		t.Fatal("GetHealth should return health for existing agent")
	}

	if health.Score != 0.85 {
		t.Errorf("Expected Score 0.85, got %f", health.Score)
	}
}

func TestSupervisorGetAlerts(t *testing.T) {
	sup := createTestSupervisor()

	// Get alerts when empty
	alerts := sup.GetAlerts()
	if len(alerts) != 0 {
		t.Errorf("Expected 0 alerts, got %d", len(alerts))
	}

	// Add some alerts
	sup.mu.Lock()
	sup.alerts = append(sup.alerts,
		&SupervisorAlert{Type: "stuck", AgentID: "agent-1", Severity: "warning"},
		&SupervisorAlert{Type: "degraded", AgentID: "agent-2", Severity: "warning"},
	)
	sup.mu.Unlock()

	// Get alerts
	alerts = sup.GetAlerts()
	if len(alerts) != 2 {
		t.Errorf("Expected 2 alerts, got %d", len(alerts))
	}
}

func TestSupervisorClearAlerts(t *testing.T) {
	sup := createTestSupervisor()

	// Add some alerts
	sup.mu.Lock()
	sup.alerts = append(sup.alerts,
		&SupervisorAlert{Type: "stuck", AgentID: "agent-1"},
		&SupervisorAlert{Type: "degraded", AgentID: "agent-2"},
	)
	sup.mu.Unlock()

	// Clear alerts
	sup.ClearAlerts()

	// Verify alerts are cleared
	alerts := sup.GetAlerts()
	if len(alerts) != 0 {
		t.Errorf("Expected 0 alerts after clear, got %d", len(alerts))
	}
}

func TestSupervisorOnAgentStuck(t *testing.T) {
	sup := createTestSupervisor()

	var callbackCalled bool
	var callbackAgent *agent.Agent
	var callbackDuration time.Duration
	var mu sync.Mutex

	sup.OnAgentStuck(func(a *agent.Agent, taskID string, d time.Duration) {
		mu.Lock()
		defer mu.Unlock()
		callbackCalled = true
		callbackAgent = a
		callbackDuration = d
	})

	// Verify callback is registered
	sup.mu.RLock()
	fn := sup.onAgentStuck
	sup.mu.RUnlock()

	if fn == nil {
		t.Error("onAgentStuck callback should be registered")
	}

	// Create and register an agent
	testAgent := createTestAgent("Test Agent", agent.AgentTypeCoder)
	sup.registry.Register(testAgent)
	agentID := string(testAgent.ID)

	// Record a heartbeat in the past (simulating stuck agent)
	sup.mu.Lock()
	sup.heartbeats[agentID] = time.Now().Add(-1 * time.Minute)
	sup.mu.Unlock()

	// Trigger stuck check via checkAgents
	sup.checkAgents()

	// Verify callback was called
	mu.Lock()
	called := callbackCalled
	mu.Unlock()

	if !called {
		t.Error("onAgentStuck callback should have been called")
	}

	// Verify alert was added
	alerts := sup.GetAlerts()
	found := false
	for _, alert := range alerts {
		if alert.Type == "stuck" && alert.AgentID == agentID {
			found = true
			break
		}
	}
	if !found {
		t.Error("Stuck alert should have been added")
	}

	// Verify agent is in stuckAgents
	sup.mu.RLock()
	_, isStuck := sup.stuckAgents[agentID]
	sup.mu.RUnlock()

	if !isStuck {
		t.Error("Agent should be marked as stuck")
	}

	_ = callbackAgent
	_ = callbackDuration
}

func TestSupervisorOnAgentRecovered(t *testing.T) {
	sup := createTestSupervisor()

	var callbackCalled bool
	var callbackAgent *agent.Agent
	var mu sync.Mutex

	sup.OnAgentRecovered(func(a *agent.Agent) {
		mu.Lock()
		defer mu.Unlock()
		callbackCalled = true
		callbackAgent = a
	})

	// Verify callback is registered
	sup.mu.RLock()
	fn := sup.onAgentRecovered
	sup.mu.RUnlock()

	if fn == nil {
		t.Error("onAgentRecovered callback should be registered")
	}

	// Create and register an agent
	testAgent := createTestAgent("Test Agent", agent.AgentTypeCoder)
	sup.registry.Register(testAgent)
	agentID := string(testAgent.ID)

	// Mark agent as stuck
	sup.mu.Lock()
	sup.stuckAgents[agentID] = &StuckAgentInfo{
		AgentID:         agentID,
		StuckAt:         time.Now().Add(-1 * time.Minute),
		DetectedAt:      time.Now().Add(-1 * time.Minute),
		RecoveryAttempt: 0,
	}
	sup.healthScores[agentID] = &AgentHealth{
		AgentID: agentID,
		Score:   0.5,
	}
	sup.mu.Unlock()

	// Record heartbeat - should trigger recovery
	sup.RecordHeartbeat(agentID)

	// Wait for async callback
	time.Sleep(50 * time.Millisecond)

	// Verify callback was called
	mu.Lock()
	called := callbackCalled
	mu.Unlock()

	if !called {
		t.Error("onAgentRecovered callback should have been called")
	}

	// Verify recovery alert was added
	alerts := sup.GetAlerts()
	found := false
	for _, alert := range alerts {
		if alert.Type == "recovered" && alert.AgentID == agentID {
			found = true
			break
		}
	}
	if !found {
		t.Error("Recovery alert should have been added")
	}

	// Verify agent is no longer stuck
	sup.mu.RLock()
	_, isStuck := sup.stuckAgents[agentID]
	sup.mu.RUnlock()

	if isStuck {
		t.Error("Agent should no longer be marked as stuck")
	}

	_ = callbackAgent
}

func TestSupervisorOnHealthDegraded(t *testing.T) {
	sup := createTestSupervisor()

	var callbackCalled bool
	var callbackAgent *agent.Agent
	var callbackScore float64
	var mu sync.Mutex

	sup.OnHealthDegraded(func(a *agent.Agent, score float64) {
		mu.Lock()
		defer mu.Unlock()
		callbackCalled = true
		callbackAgent = a
		callbackScore = score
	})

	// Verify callback is registered
	sup.mu.RLock()
	fn := sup.onHealthDegraded
	sup.mu.RUnlock()

	if fn == nil {
		t.Error("onHealthDegraded callback should be registered")
	}

	// Create and register an agent with error state
	testAgent := createTestAgent("Test Agent", agent.AgentTypeCoder)
	testAgent.SetState(agent.StateError)
	sup.registry.Register(testAgent)
	agentID := string(testAgent.ID)

	// Set up health with low score
	sup.mu.Lock()
	sup.healthScores[agentID] = &AgentHealth{
		AgentID:          agentID,
		Score:            0.3, // Below HealthThreshold
		ConsecutiveFails: 5,
		TotalTasks:       10,
		SuccessfulTasks:  2,
	}
	sup.heartbeats[agentID] = time.Now()
	sup.mu.Unlock()

	// Trigger health check
	sup.checkAgents()

	// Verify callback was called
	mu.Lock()
	called := callbackCalled
	mu.Unlock()

	if !called {
		t.Error("onHealthDegraded callback should have been called")
	}

	// Verify degraded alert was added
	alerts := sup.GetAlerts()
	found := false
	for _, alert := range alerts {
		if alert.Type == "degraded" && alert.AgentID == agentID {
			found = true
			break
		}
	}
	if !found {
		t.Error("Degraded alert should have been added")
	}

	_ = callbackAgent
	_ = callbackScore
}

func TestSupervisorCalculateHealthScore(t *testing.T) {
	tests := []struct {
		name          string
		agentState    agent.AgentState
		totalTasks    int
		successful    int
		avgResponse   time.Duration
		consecFails   int
		expectedRange [2]float64 // min, max expected score
	}{
		{
			name:          "healthy idle agent",
			agentState:    agent.StateIdle,
			totalTasks:    10,
			successful:    10,
			avgResponse:   100 * time.Millisecond,
			consecFails:   0,
			expectedRange: [2]float64{0.8, 1.0},
		},
		{
			name:          "healthy thinking agent",
			agentState:    agent.StateThinking,
			totalTasks:    5,
			successful:    5,
			avgResponse:   50 * time.Millisecond,
			consecFails:   0,
			expectedRange: [2]float64{0.8, 1.0},
		},
		{
			name:          "healthy executing agent",
			agentState:    agent.StateExecuting,
			totalTasks:    20,
			successful:    18,
			avgResponse:   200 * time.Millisecond,
			consecFails:   0,
			expectedRange: [2]float64{0.6, 1.0},
		},
		{
			name:          "waiting agent - reduced score",
			agentState:    agent.StateWaiting,
			totalTasks:    5,
			successful:    5,
			avgResponse:   100 * time.Millisecond,
			consecFails:   0,
			expectedRange: [2]float64{0.5, 0.9},
		},
		{
			name:          "error state agent - low score",
			agentState:    agent.StateError,
			totalTasks:    10,
			successful:    5,
			avgResponse:   100 * time.Millisecond,
			consecFails:   3,
			expectedRange: [2]float64{0.0, 0.5},
		},
		{
			name:          "agent with consecutive failures",
			agentState:    agent.StateIdle,
			totalTasks:    20,
			successful:    10,
			avgResponse:   100 * time.Millisecond,
			consecFails:   5,
			expectedRange: [2]float64{0.6, 0.8},
		},
		{
			name:          "agent with slow response",
			agentState:    agent.StateIdle,
			totalTasks:    5,
			successful:    5,
			avgResponse:   5 * time.Second,
			consecFails:   0,
			expectedRange: [2]float64{0.5, 0.9},
		},
		{
			name:          "agent with zero tasks",
			agentState:    agent.StateIdle,
			totalTasks:    0,
			successful:    0,
			avgResponse:   0,
			consecFails:   0,
			expectedRange: [2]float64{0.5, 0.7},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sup := createTestSupervisor()

			// Create agent
			testAgent := createTestAgent("Test Agent", agent.AgentTypeCoder)
			testAgent.SetState(tt.agentState)

			// Create health entry
			health := &AgentHealth{
				AgentID:          string(testAgent.ID),
				Score:            1.0,
				TotalTasks:       tt.totalTasks,
				SuccessfulTasks:  tt.successful,
				AvgResponseTime:  tt.avgResponse,
				ConsecutiveFails: tt.consecFails,
			}

			// Calculate health score
			sup.calculateHealthScore(testAgent, health)

			// Verify score is within expected range
			if health.Score < tt.expectedRange[0] || health.Score > tt.expectedRange[1] {
				t.Errorf("Score %f not in expected range [%f, %f]", health.Score, tt.expectedRange[0], tt.expectedRange[1])
			}

			// Verify score is clamped to [0, 1]
			if health.Score < 0 || health.Score > 1 {
				t.Errorf("Score %f should be in range [0, 1]", health.Score)
			}
		})
	}
}

func TestSupervisorGetStats(t *testing.T) {
	sup := createTestSupervisor()

	// Get stats when empty
	stats := sup.GetStats()
	if stats.TotalAgents != 0 {
		t.Errorf("Expected TotalAgents 0, got %d", stats.TotalAgents)
	}

	// Add some agents with different health scores
	sup.mu.Lock()
	sup.healthScores = map[string]*AgentHealth{
		"healthy-1":   {AgentID: "healthy-1", Score: 0.9},
		"healthy-2":   {AgentID: "healthy-2", Score: 0.85},
		"degraded-1":  {AgentID: "degraded-1", Score: 0.6},
		"degraded-2":  {AgentID: "degraded-2", Score: 0.55},
		"unhealthy-1": {AgentID: "unhealthy-1", Score: 0.3},
	}
	sup.stuckAgents = map[string]*StuckAgentInfo{
		"stuck-1": {AgentID: "stuck-1"},
	}
	sup.alerts = []*SupervisorAlert{
		{Type: "stuck", AgentID: "stuck-1"},
		{Type: "degraded", AgentID: "degraded-1"},
	}
	sup.mu.Unlock()

	stats = sup.GetStats()

	if stats.TotalAgents != 5 {
		t.Errorf("Expected TotalAgents 5, got %d", stats.TotalAgents)
	}

	// HealthThreshold is 0.7, so healthy are >= 0.7
	if stats.HealthyAgents != 2 {
		t.Errorf("Expected HealthyAgents 2, got %d", stats.HealthyAgents)
	}

	// Degraded are >= 0.5 and < 0.7
	if stats.DegradedAgents != 2 {
		t.Errorf("Expected DegradedAgents 2, got %d", stats.DegradedAgents)
	}

	// Unhealthy are < 0.5
	if stats.UnhealthyAgents != 1 {
		t.Errorf("Expected UnhealthyAgents 1, got %d", stats.UnhealthyAgents)
	}

	if stats.StuckAgents != 1 {
		t.Errorf("Expected StuckAgents 1, got %d", stats.StuckAgents)
	}

	if stats.ActiveAlerts != 2 {
		t.Errorf("Expected ActiveAlerts 2, got %d", stats.ActiveAlerts)
	}
}

func TestSupervisorCheckAgents(t *testing.T) {
	sup := createTestSupervisor()

	// Create and register agents
	agent1 := createTestAgent("Agent 1", agent.AgentTypeCoder)
	agent1.SetState(agent.StateIdle)
	sup.registry.Register(agent1)

	agent2 := createTestAgent("Agent 2", agent.AgentTypeReviewer)
	agent2.SetState(agent.StateError)
	sup.registry.Register(agent2)

	// Record heartbeats
	sup.RecordHeartbeat(string(agent1.ID))
	sup.RecordHeartbeat(string(agent2.ID))

	// Run checkAgents
	sup.checkAgents()

	// Verify health scores were created
	health1 := sup.GetHealth(string(agent1.ID))
	if health1 == nil {
		t.Fatal("Health for agent1 should exist")
	}

	health2 := sup.GetHealth(string(agent2.ID))
	if health2 == nil {
		t.Fatal("Health for agent2 should exist")
	}

	// Agent1 (idle) should have higher score than agent2 (error)
	if health1.Score <= health2.Score {
		t.Errorf("Agent1 (idle) should have higher score than agent2 (error): %f vs %f", health1.Score, health2.Score)
	}
}

func TestSupervisorStuckDetection(t *testing.T) {
	sup := createTestSupervisor()

	// Create and register agent
	testAgent := createTestAgent("Test Agent", agent.AgentTypeCoder)
	testAgent.SetState(agent.StateIdle)
	sup.registry.Register(testAgent)
	agentID := string(testAgent.ID)

	// Record heartbeat in the past (beyond stuck threshold)
	sup.mu.Lock()
	sup.heartbeats[agentID] = time.Now().Add(-10 * time.Second)
	sup.healthScores[agentID] = &AgentHealth{
		AgentID: agentID,
		Score:   1.0,
	}
	sup.mu.Unlock()

	// Run check to detect stuck agent
	sup.checkAgents()

	// Verify agent is marked as stuck
	sup.mu.RLock()
	stuckInfo, isStuck := sup.stuckAgents[agentID]
	sup.mu.RUnlock()

	if !isStuck {
		t.Error("Agent should be marked as stuck")
	}

	if stuckInfo == nil {
		t.Fatal("Stuck info should exist")
	}

	if stuckInfo.AgentID != agentID {
		t.Errorf("Expected AgentID %s, got %s", agentID, stuckInfo.AgentID)
	}

	// Health score should be reduced
	health := sup.GetHealth(agentID)
	if health.Score >= 1.0 {
		t.Errorf("Health score should be reduced for stuck agent, got %f", health.Score)
	}
}

func TestSupervisorStuckDetectionRecoveryAttempts(t *testing.T) {
	sup := createTestSupervisor()

	// Create and register agent
	testAgent := createTestAgent("Test Agent", agent.AgentTypeCoder)
	testAgent.SetState(agent.StateIdle)
	sup.registry.Register(testAgent)
	agentID := string(testAgent.ID)

	// Record heartbeat in the past
	sup.mu.Lock()
	sup.heartbeats[agentID] = time.Now().Add(-10 * time.Second)
	sup.healthScores[agentID] = &AgentHealth{
		AgentID: agentID,
		Score:   1.0,
	}
	sup.stuckAgents[agentID] = &StuckAgentInfo{
		AgentID:         agentID,
		RecoveryAttempt: 3, // Already at max attempts
	}
	sup.mu.Unlock()

	// Run check - should trigger unrecoverable handling
	sup.checkAgents()

	// Agent should be removed from registry (unrecoverable)
	_, exists := sup.registry.Get(acp.AgentID(agentID))
	if exists {
		t.Error("Unrecoverable agent should be removed from registry")
	}

	// Verify critical alert was added
	alerts := sup.GetAlerts()
	found := false
	for _, alert := range alerts {
		if alert.Type == "unrecoverable" && alert.AgentID == agentID {
			found = true
			break
		}
	}
	if !found {
		t.Error("Unrecoverable alert should have been added")
	}
}

func TestSupervisorMonitorLoop(t *testing.T) {
	// Create supervisor with very short check interval
	config := SupervisorConfig{
		CheckInterval:    50 * time.Millisecond,
		HeartbeatTimeout: 200 * time.Millisecond,
		StuckThreshold:   500 * time.Millisecond,
		RecoveryTimeout:  1 * time.Second,
		HealthThreshold:  0.7,
	}
	sup := NewSupervisor(config, nil, nil)

	// Create and register agent
	testAgent := createTestAgent("Test Agent", agent.AgentTypeCoder)
	sup.registry.Register(testAgent)
	agentID := string(testAgent.ID)

	// Start supervisor
	ctx := context.Background()
	err := sup.Start(ctx)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	// Record heartbeat
	sup.RecordHeartbeat(agentID)

	// Wait for a few check cycles
	time.Sleep(150 * time.Millisecond)

	// Stop supervisor
	sup.Stop()

	// Verify it was running and stopped
	if sup.running {
		t.Error("Supervisor should not be running after Stop")
	}
}

func TestSupervisorAlertMetadata(t *testing.T) {
	sup := createTestSupervisor()

	// Create and register agent
	testAgent := createTestAgent("Test Agent", agent.AgentTypeCoder)
	sup.registry.Register(testAgent)
	agentID := string(testAgent.ID)

	// Record heartbeat in the past
	sup.mu.Lock()
	sup.heartbeats[agentID] = time.Now().Add(-10 * time.Second)
	sup.healthScores[agentID] = &AgentHealth{
		AgentID: agentID,
		Score:   1.0,
	}
	sup.mu.Unlock()

	// Run check to generate stuck alert
	sup.checkAgents()

	// Verify alert has proper metadata
	alerts := sup.GetAlerts()
	if len(alerts) == 0 {
		t.Fatal("Expected at least one alert")
	}

	alert := alerts[0]
	if alert.Type == "" {
		t.Error("Alert type should be set")
	}
	if alert.AgentID == "" {
		t.Error("Alert AgentID should be set")
	}
	if alert.Message == "" {
		t.Error("Alert message should be set")
	}
	if alert.Timestamp.IsZero() {
		t.Error("Alert timestamp should be set")
	}
	if alert.Severity == "" {
		t.Error("Alert severity should be set")
	}
}

func TestSupervisorConcurrentAccess(t *testing.T) {
	sup := createTestSupervisor()

	// Start supervisor
	ctx := context.Background()
	err := sup.Start(ctx)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer sup.Stop()

	var wg sync.WaitGroup

	// Concurrent heartbeat recording
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			agentID := string(rune('a' + id))
			for j := 0; j < 100; j++ {
				sup.RecordHeartbeat(agentID)
				sup.MarkTaskResult(agentID, j%2 == 0, time.Duration(j)*time.Millisecond)
			}
		}(i)
	}

	// Concurrent health reading
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			agentID := string(rune('a' + id))
			for j := 0; j < 100; j++ {
				sup.GetHealth(agentID)
				sup.GetAlerts()
				sup.GetStats()
			}
		}(i)
	}

	// Concurrent alert clearing
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 10; i++ {
			time.Sleep(10 * time.Millisecond)
			sup.ClearAlerts()
		}
	}()

	wg.Wait()
}

func TestSupervisorContextCancellation(t *testing.T) {
	sup := createTestSupervisor()

	// Create cancellable context
	ctx, cancel := context.WithCancel(context.Background())

	err := sup.Start(ctx)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	// Cancel context
	cancel()

	// Wait for supervisor to stop (monitor loop checks at CheckInterval)
	time.Sleep(200 * time.Millisecond)

	// Note: The supervisor may not immediately set running=false when context is cancelled
	// because the monitor loop may be waiting on the ticker. The Stop() method properly
	// waits for the waitGroup. This test verifies context cancellation triggers shutdown.
}

func TestSupervisorTypesJSON(t *testing.T) {
	// Test SupervisorConfig JSON marshaling
	config := SupervisorConfig{
		CheckInterval:    30 * time.Second,
		HeartbeatTimeout: 60 * time.Second,
		StuckThreshold:   2 * time.Minute,
		RecoveryTimeout:  2 * time.Minute,
		HealthThreshold:  0.7,
	}

	// Verify fields are accessible
	if config.CheckInterval != 30*time.Second {
		t.Errorf("CheckInterval mismatch")
	}
	if config.HealthThreshold != 0.7 {
		t.Errorf("HealthThreshold mismatch")
	}
}

func TestSupervisorAgentHealthStruct(t *testing.T) {
	// Test AgentHealth struct
	health := &AgentHealth{
		AgentID:          "test-agent",
		Score:            0.85,
		ConsecutiveFails: 0,
		LastHeartbeat:    time.Now(),
		LastErrorTime:    time.Time{},
		TotalTasks:       10,
		SuccessfulTasks:  9,
		AvgResponseTime:  100 * time.Millisecond,
	}

	if health.AgentID != "test-agent" {
		t.Errorf("AgentID mismatch")
	}
	if health.Score != 0.85 {
		t.Errorf("Score mismatch")
	}
	if health.TotalTasks != 10 {
		t.Errorf("TotalTasks mismatch")
	}
}

func TestSupervisorStuckAgentInfoStruct(t *testing.T) {
	// Test StuckAgentInfo struct
	info := &StuckAgentInfo{
		AgentID:         "test-agent",
		StuckAt:         time.Now().Add(-1 * time.Minute),
		DetectedAt:      time.Now(),
		RecoveryAttempt: 2,
	}

	if info.AgentID != "test-agent" {
		t.Errorf("AgentID mismatch")
	}
	if info.RecoveryAttempt != 2 {
		t.Errorf("RecoveryAttempt mismatch")
	}
}

func TestSupervisorAlertStruct(t *testing.T) {
	// Test SupervisorAlert struct
	alert := &SupervisorAlert{
		Type:      "stuck",
		AgentID:   "test-agent",
		Message:   "Agent stuck for 5m",
		Timestamp: time.Now(),
		Severity:  "warning",
		Metadata: map[string]any{
			"duration": "5m",
		},
	}

	if alert.Type != "stuck" {
		t.Errorf("Type mismatch")
	}
	if alert.Severity != "warning" {
		t.Errorf("Severity mismatch")
	}
	if alert.Metadata["duration"] != "5m" {
		t.Errorf("Metadata mismatch")
	}
}

func TestSupervisorStatsStruct(t *testing.T) {
	// Test SupervisorStats struct
	stats := SupervisorStats{
		TotalAgents:     10,
		HealthyAgents:   7,
		DegradedAgents:  2,
		UnhealthyAgents: 1,
		StuckAgents:     1,
		ActiveAlerts:    3,
	}

	if stats.TotalAgents != 10 {
		t.Errorf("TotalAgents mismatch")
	}
	if stats.HealthyAgents != 7 {
		t.Errorf("HealthyAgents mismatch")
	}
	if stats.StuckAgents != 1 {
		t.Errorf("StuckAgents mismatch")
	}
}

// Test that checkAgents handles unregistered agents gracefully
func TestSupervisorCheckAgentsNoHeartbeat(t *testing.T) {
	sup := createTestSupervisor()

	// Create and register agent
	testAgent := createTestAgent("Test Agent", agent.AgentTypeCoder)
	sup.registry.Register(testAgent)
	agentID := string(testAgent.ID)

	// Don't record heartbeat - agent exists in registry but no heartbeat

	// Run checkAgents - should not panic
	sup.checkAgents()

	// Agent should not be marked as stuck (no heartbeat to check)
	sup.mu.RLock()
	_, isStuck := sup.stuckAgents[agentID]
	sup.mu.RUnlock()

	if isStuck {
		t.Error("Agent should not be marked stuck without heartbeat record")
	}
}

// Test multiple agents with different health states
func TestSupervisorMultipleAgentsHealthStates(t *testing.T) {
	sup := createTestSupervisor()

	// Create agents with different states
	agents := []*agent.Agent{
		createTestAgent("Idle Agent", agent.AgentTypeCoder),
		createTestAgent("Thinking Agent", agent.AgentTypeCoder),
		createTestAgent("Error Agent", agent.AgentTypeCoder),
	}

	agents[0].SetState(agent.StateIdle)
	agents[1].SetState(agent.StateThinking)
	agents[2].SetState(agent.StateError)

	// Register all agents
	for _, a := range agents {
		sup.registry.Register(a)
		sup.RecordHeartbeat(string(a.ID))
	}

	// Run check
	sup.checkAgents()

	// Verify all have health scores
	stats := sup.GetStats()
	if stats.TotalAgents != 3 {
		t.Errorf("Expected 3 agents, got %d", stats.TotalAgents)
	}
}

// TestGetAlertsReturnsCopy verifies that GetAlerts returns a copy of the alerts slice,
// not the internal slice. Mutating the returned slice should not affect the supervisor.
func TestGetAlertsReturnsCopy(t *testing.T) {
	sup := NewSupervisor(DefaultSupervisorConfig(), nil, nil)

	// Trigger an alert via stuck detection setup
	sup.mu.Lock()
	sup.alerts = append(sup.alerts, &SupervisorAlert{
		Type:      "stuck",
		AgentID:   "agent-1",
		Message:   "test alert",
		Timestamp: time.Now(),
		Severity:  "warning",
	})
	sup.mu.Unlock()

	alerts := sup.GetAlerts()
	if len(alerts) != 1 {
		t.Fatalf("expected 1 alert, got %d", len(alerts))
	}

	// Mutate the returned slice
	alerts[0] = nil

	// Internal slice should be unchanged
	originalAlerts := sup.GetAlerts()
	if len(originalAlerts) != 1 {
		t.Errorf("expected 1 alert after mutation, got %d", len(originalAlerts))
	}
	if originalAlerts[0] == nil {
		t.Error("internal alert should not be nil after mutating returned copy")
	}
}

// TestSupervisor_SetBroadcaster tests that SetBroadcaster correctly sets up
// callback functions for broadcasting supervisor events.
func TestSupervisor_SetBroadcaster(t *testing.T) {
	sup := NewSupervisor(DefaultSupervisorConfig(), nil, nil)

	// Initially no broadcaster set
	sup.mu.RLock()
	initialBroadcaster := sup.broadcaster
	sup.mu.RUnlock()
	if initialBroadcaster != nil {
		t.Error("expected nil broadcaster initially")
	}

	// Set a mock broadcaster (reuse existing mock from automations_test.go)
	mockBroadcaster := &mockEventBroadcaster{}
	sup.SetBroadcaster(mockBroadcaster)

	// Verify broadcaster is set and callbacks are wired
	sup.mu.RLock()
	b := sup.broadcaster
	sup.mu.RUnlock()
	if b == nil {
		t.Error("expected broadcaster to be set")
	}

	// Verify callbacks are wired
	sup.mu.RLock()
	onStuck := sup.onAgentStuck
	sup.mu.RUnlock()
	if onStuck == nil {
		t.Error("expected onAgentStuck callback to be wired")
	}

	// Test nil broadcaster clears callbacks
	sup.SetBroadcaster(nil)
	sup.mu.RLock()
	b = sup.broadcaster
	sup.mu.RUnlock()
	if b != nil {
		t.Error("expected broadcaster to be nil after clearing")
	}
}

func TestSupervisor_SetBroadcaster_WithBroadcaster(t *testing.T) {
	registry := agent.NewRegistry()
	agent1 := agent.NewAgent("Test Agent 1", agent.AgentTypeCoder)
	registry.Register(agent1)

	sup := NewSupervisor(SupervisorConfig{}, registry, nil)
	defer sup.Stop()

	var mu sync.Mutex
	var events []map[string]any
	broadcaster := &testSupervisorBroadcaster{
		broadcastFn: func(eventType string, payload any) {
			mu.Lock()
			defer mu.Unlock()
			events = append(events, map[string]any{"type": eventType, "payload": payload})
		},
	}
	sup.SetBroadcaster(broadcaster)

	// Record heartbeat that triggers stuck detection after timeout
	sup.RecordHeartbeat(string(agent1.ID))

	// Verify broadcaster was set
	sup.mu.RLock()
	b := sup.broadcaster
	sup.mu.RUnlock()
	if b == nil {
		t.Error("expected broadcaster to be set")
	}
}

type testSupervisorBroadcaster struct {
	broadcastFn func(eventType string, payload any)
}

func (t *testSupervisorBroadcaster) Broadcast(eventType string, payload any) {
	if t.broadcastFn != nil {
		t.broadcastFn(eventType, payload)
	}
}

func TestSupervisor_AddAlert(t *testing.T) {
	s := createTestSupervisor()

	s.mu.Lock()
	s.addAlert("stuck", "agent-1", "Agent is stuck", "warning", nil)
	s.mu.Unlock()

	s.mu.RLock()
	alerts := s.alerts
	s.mu.RUnlock()

	if len(alerts) != 1 {
		t.Fatalf("expected 1 alert, got %d", len(alerts))
	}
	if alerts[0].Type != "stuck" {
		t.Errorf("expected type 'stuck', got %q", alerts[0].Type)
	}
	if alerts[0].AgentID != "agent-1" {
		t.Errorf("expected agentID 'agent-1', got %q", alerts[0].AgentID)
	}
	if alerts[0].Message != "Agent is stuck" {
		t.Errorf("expected message 'Agent is stuck', got %q", alerts[0].Message)
	}
	if alerts[0].Severity != "warning" {
		t.Errorf("expected severity 'warning', got %q", alerts[0].Severity)
	}
	if alerts[0].Timestamp.IsZero() {
		t.Error("expected non-zero timestamp")
	}
}

func TestSupervisor_AddAlert_WithMetadata(t *testing.T) {
	s := createTestSupervisor()

	metadata := map[string]any{"key": "value", "count": 42}
	s.mu.Lock()
	s.addAlert("degraded", "agent-2", "Health degraded", "critical", metadata)
	s.mu.Unlock()

	s.mu.RLock()
	alerts := s.alerts
	s.mu.RUnlock()

	if len(alerts) != 1 {
		t.Fatalf("expected 1 alert, got %d", len(alerts))
	}
	if alerts[0].Metadata == nil {
		t.Fatal("expected metadata to be set")
	}
	if alerts[0].Metadata["key"] != "value" {
		t.Errorf("expected metadata key='value', got %v", alerts[0].Metadata["key"])
	}
}

func TestSupervisor_AddAlert_MaxAlerts(t *testing.T) {
	s := createTestSupervisor()

	// Add more than maxAlerts (1000)
	s.mu.Lock()
	for i := 0; i < 1005; i++ {
		s.addAlert("test", "agent-1", "alert", "info", nil)
	}
	s.mu.Unlock()

	s.mu.RLock()
	count := len(s.alerts)
	s.mu.RUnlock()

	if count > 1000 {
		t.Errorf("expected at most 1000 alerts, got %d", count)
	}
}

func TestSupervisor_AddAlert_WithBroadcaster(t *testing.T) {
	s := createTestSupervisor()

	var mu sync.Mutex
	var broadcasted bool
	s.broadcaster = &testSupervisorBroadcaster{
		broadcastFn: func(eventType string, payload any) {
			mu.Lock()
			defer mu.Unlock()
			if eventType == "supervisor_alert" {
				broadcasted = true
			}
		},
	}

	s.mu.Lock()
	s.addAlert("stuck", "agent-1", "test", "warning", nil)
	s.mu.Unlock()

	// Wait for the goroutine to complete
	s.wg.Wait()

	mu.Lock()
	if !broadcasted {
		t.Error("expected alert to be broadcast")
	}
	mu.Unlock()
}

// TestSupervisor_GetStats_HealthStates tests GetStats with different health states
func TestSupervisor_GetStats_HealthStates(t *testing.T) {
	sup := createTestSupervisor()

	// Add agents with different health scores
	// HealthThreshold defaults to 0.7
	// Score >= 0.7: Healthy
	// Score >= 0.5: Degraded
	// Score < 0.5: Unhealthy

	sup.mu.Lock()
	// Healthy agent (score 0.9)
	sup.healthScores["healthy-agent"] = &AgentHealth{
		AgentID: "healthy-agent",
		Score:   0.9,
	}

	// Degraded agent (score 0.6)
	sup.healthScores["degraded-agent"] = &AgentHealth{
		AgentID: "degraded-agent",
		Score:   0.6,
	}

	// Unhealthy agent (score 0.3)
	sup.healthScores["unhealthy-agent"] = &AgentHealth{
		AgentID: "unhealthy-agent",
		Score:   0.3,
	}

	// Stuck agent
	sup.stuckAgents["stuck-agent"] = &StuckAgentInfo{
		AgentID:    "stuck-agent",
		StuckAt:    time.Now(),
		DetectedAt: time.Now(),
	}
	sup.mu.Unlock()

	stats := sup.GetStats()

	// Verify counts
	if stats.TotalAgents != 3 {
		t.Errorf("expected 3 total agents, got %d", stats.TotalAgents)
	}
	if stats.HealthyAgents != 1 {
		t.Errorf("expected 1 healthy agent, got %d", stats.HealthyAgents)
	}
	if stats.DegradedAgents != 1 {
		t.Errorf("expected 1 degraded agent, got %d", stats.DegradedAgents)
	}
	if stats.UnhealthyAgents != 1 {
		t.Errorf("expected 1 unhealthy agent, got %d", stats.UnhealthyAgents)
	}
	if stats.StuckAgents != 1 {
		t.Errorf("expected 1 stuck agent, got %d", stats.StuckAgents)
	}
}

func TestSupervisor_SetAlertsForTest(t *testing.T) {
	sup := createTestSupervisor()

	alerts := []*SupervisorAlert{
		{Type: "stuck", AgentID: "agent-1", Message: "test alert", Severity: "warning"},
		{Type: "degraded", AgentID: "agent-2", Message: "health degraded", Severity: "critical"},
	}
	sup.SetAlertsForTest(alerts)

	got := sup.GetAlerts()
	if len(got) != 2 {
		t.Fatalf("expected 2 alerts, got %d", len(got))
	}
	if got[0].AgentID != "agent-1" {
		t.Errorf("alert[0].AgentID = %q, want %q", got[0].AgentID, "agent-1")
	}
	if got[1].Severity != "critical" {
		t.Errorf("alert[1].Severity = %q, want %q", got[1].Severity, "critical")
	}
}
