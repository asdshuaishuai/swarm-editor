// Package swarm implements agent health monitoring and stuck detection, and recovery
package swarm

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
	"github.com/swarm-editor/swarm-editor/internal/log"
)

var supervisorLog = log.With("component", "Supervisor")

// Supervisor monitors agent health and manages recovery
type Supervisor struct {
	mu sync.RWMutex

	// Configuration
	config SupervisorConfig

	// Agent management
	registry  *agent.Registry
	lifecycle *agent.Lifecycle

	// Health tracking
	healthScores map[string]*AgentHealth
	alerts       []*SupervisorAlert

	// Stuck detection
	stuckAgents map[string]*StuckAgentInfo
	stuckConfig StuckDetectionConfig

	// Heartbeats
	heartbeats      map[string]time.Time
	heartbeatConfig HeartbeatConfig

	// Callbacks
	onAgentStuck     func(agent *agent.Agent, duration time.Duration)
	onAgentRecovered func(agent *agent.Agent)
	onHealthDegraded func(agent *agent.Agent, score float64)

	// Event broadcasting for UI streaming
	broadcaster EventBroadcaster

	// Lifecycle
	ctx     context.Context
	cancel  context.CancelFunc
	wg      sync.WaitGroup
	running bool
}

// SupervisorConfig configures the supervisor
type SupervisorConfig struct {
	CheckInterval    time.Duration `json:"checkInterval"`
	HeartbeatTimeout time.Duration `json:"heartbeatTimeout"`
	StuckThreshold   time.Duration `json:"stuckThreshold"`
	RecoveryTimeout  time.Duration `json:"recoveryTimeout"`
	HealthThreshold  float64       `json:"healthThreshold"` // 0.0-1.0, health score below this triggers degraded
}

// AgentHealth tracks agent health metrics
type AgentHealth struct {
	AgentID          string
	Score            float64
	ConsecutiveFails int
	LastHeartbeat    time.Time
	LastErrorTime    time.Time
	TotalTasks       int
	SuccessfulTasks  int
	AvgResponseTime  time.Duration
}

// StuckAgentInfo tracks stuck agent state
type StuckAgentInfo struct {
	AgentID         string
	StuckAt         time.Time
	DetectedAt      time.Time
	RecoveryAttempt int
}

// StuckDetectionConfig configures stuck detection
type StuckDetectionConfig struct {
	Enabled         bool
	Threshold       time.Duration // No heartbeat for this duration = stuck
	MaxRecoveryTime time.Duration // Max time to attempt recovery
}

// HeartbeatConfig configures heartbeat tracking
type HeartbeatConfig struct {
	Required  bool
	Interval  time.Duration // Expected heartbeat interval
	MaxMisses int           // Max consecutive misses before alert
}

// SupervisorAlert represents a health alert
type SupervisorAlert struct {
	Type      string // "stuck", "degraded", "recovered", "heartbeat_missed"
	AgentID   string
	Message   string
	Timestamp time.Time
	Severity  string // "info", "warning", "critical"
	Metadata  map[string]any
}

// DefaultSupervisorConfig returns default supervisor configuration
func DefaultSupervisorConfig() SupervisorConfig {
	return SupervisorConfig{
		CheckInterval:    30 * time.Second,
		HeartbeatTimeout: 60 * time.Second,
		StuckThreshold:   2 * time.Minute,
		RecoveryTimeout:  2 * time.Minute,
		HealthThreshold:  0.7,
	}
}

// NewSupervisor creates a new supervisor
func NewSupervisor(config SupervisorConfig, registry *agent.Registry, lifecycle *agent.Lifecycle) *Supervisor {
	if registry == nil {
		registry = agent.NewRegistry()
	}
	if lifecycle == nil {
		lifecycle = agent.NewLifecycle(registry)
	}
	return &Supervisor{
		config:       config,
		registry:     registry,
		lifecycle:    lifecycle,
		healthScores: make(map[string]*AgentHealth),
		alerts:       make([]*SupervisorAlert, 0),
		stuckAgents:  make(map[string]*StuckAgentInfo),
		stuckConfig: StuckDetectionConfig{
			Enabled:         true,
			Threshold:       config.StuckThreshold,
			MaxRecoveryTime: config.RecoveryTimeout,
		},
		heartbeatConfig: HeartbeatConfig{
			Required:  true,
			Interval:  config.HeartbeatTimeout,
			MaxMisses: 3,
		},
		heartbeats: make(map[string]time.Time),
	}
}

// Start starts the supervisor
func (s *Supervisor) Start(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.running {
		return fmt.Errorf("supervisor already running")
	}

	s.ctx, s.cancel = context.WithCancel(ctx)
	s.running = true

	// Start monitoring loop
	s.wg.Add(1)
	go s.monitorLoop()

	return nil
}

// Stop stops the supervisor
func (s *Supervisor) Stop() {
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
}

// monitorLoop is the main monitoring loop
func (s *Supervisor) monitorLoop() {
	defer s.wg.Done()

	ticker := time.NewTicker(s.config.CheckInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			s.checkAgents()
		}
	}
}

// checkAgents checks all registered agents for health issues
func (s *Supervisor) checkAgents() {
	var events []supervisorEvent

	s.mu.Lock()
	agents := s.registry.GetAll()
	now := time.Now()

	for _, ag := range agents {
		agentID := string(ag.ID)
		health, exists := s.healthScores[agentID]
		if !exists {
			health = &AgentHealth{
				AgentID:       agentID,
				Score:         1.0,
				LastHeartbeat: now,
			}
			s.healthScores[agentID] = health
		}

		// Calculate health score
		s.calculateHealthScore(ag, health)

		// Check for stuck agents
		if s.stuckConfig.Enabled {
			if ev := s.collectStuckEvent(ag, health); ev != nil {
				events = append(events, *ev)
			}
		}

		// Check health threshold
		if health.Score < s.config.HealthThreshold {
			events = append(events, supervisorEvent{kind: "degraded", agent: ag, score: health.Score})
			s.addAlert("degraded", agentID, fmt.Sprintf("Agent health degraded: %.2f", health.Score), "warning", nil)
		}
	}

	// Snapshot callbacks under lock
	onStuck := s.onAgentStuck
	onDegraded := s.onHealthDegraded
	s.mu.Unlock()

	// Fire callbacks outside lock to prevent deadlock
	for _, ev := range events {
		switch ev.kind {
		case "stuck":
			if onStuck != nil {
				onStuck(ev.agent, ev.duration)
			}
		case "degraded":
			if onDegraded != nil {
				onDegraded(ev.agent, ev.score)
			}
		case "unrecoverable":
			s.handleUnrecoverableAgent(ev.agent)
		}
	}
}

// calculateHealthScore calculates agent health score
func (s *Supervisor) calculateHealthScore(ag *agent.Agent, health *AgentHealth) {
	state := ag.GetState()

	// Base score from state
	baseScore := 0.5
	switch state {
	case agent.StateIdle, agent.StateThinking, agent.StateExecuting:
		baseScore = 1.0
	case agent.StateWaiting:
		baseScore = 0.7
	case agent.StateError:
		baseScore = 0.2
	}

	// Factor in success rate
	successRate := 0.0
	if health.TotalTasks > 0 {
		successRate = float64(health.SuccessfulTasks) / float64(health.TotalTasks)
	}

	// Factor in response time (lower is better)
	responseFactor := 1.0
	if health.AvgResponseTime > 0 {
		responseFactor = 1.0 - (float64(health.AvgResponseTime.Milliseconds()) / float64(10*time.Second.Milliseconds()))
		if responseFactor < 0 {
			responseFactor = 0
		}
	}

	// Factor in consecutive failures
	failFactor := 0.0
	if health.ConsecutiveFails > 0 {
		failFactor = float64(health.ConsecutiveFails) * 0.1
		if failFactor > 1 {
			failFactor = 1
		}
	}

	// Final score is weighted average (failFactor subtracted: more failures = lower score)
	health.Score = baseScore*0.4 + successRate*0.3 + responseFactor*0.2 - failFactor*0.1

	// Clamp to [0, 1]
	if health.Score < 0 {
		health.Score = 0
	}
	if health.Score > 1 {
		health.Score = 1
	}
}

// collectStuckEvent checks if an agent is stuck and returns an event to fire as callback.
// Must be called with s.mu held. Returns nil if no stuck event to fire.
func (s *Supervisor) collectStuckEvent(ag *agent.Agent, health *AgentHealth) *supervisorEvent {
	agentID := string(ag.ID)
	lastHeartbeat, ok := s.heartbeats[agentID]
	if !ok {
		return nil
	}

	timeSinceHeartbeat := time.Since(lastHeartbeat)
	if timeSinceHeartbeat > s.stuckConfig.Threshold {
		// Check if already marked as stuck
		stuckInfo, isStuck := s.stuckAgents[agentID]
		if isStuck {
			// Check if max recovery time exceeded (use config instead of fixed attempt count)
			if time.Since(stuckInfo.DetectedAt) > s.stuckConfig.MaxRecoveryTime {
				// Max recovery time reached — defer to outside lock to prevent deadlock
				return &supervisorEvent{kind: "unrecoverable", agent: ag}
			}
			return nil
		}

		// Mark as stuck
		stuckInfo = &StuckAgentInfo{
			AgentID:         agentID,
			StuckAt:         lastHeartbeat,
			DetectedAt:      time.Now(),
			RecoveryAttempt: 0,
		}
		s.stuckAgents[agentID] = stuckInfo

		// Update health score
		health.Score *= 0.5

		// Add alert
		s.addAlert("stuck", agentID, fmt.Sprintf("Agent stuck for %v", timeSinceHeartbeat), "warning", nil)

		return &supervisorEvent{kind: "stuck", agent: ag, duration: timeSinceHeartbeat}
	}
	return nil
}

// handleUnrecoverableAgent handles an agent that cannot be recovered.
// Must be called WITHOUT holding s.mu to prevent deadlock.
func (s *Supervisor) handleUnrecoverableAgent(ag *agent.Agent) {
	agentID := string(ag.ID)

	// Remove from registry (outside s.mu — registry has its own locking)
	if err := s.registry.Unregister(ag.ID); err != nil {
		supervisorLog.Warn("Failed to unregister agent", "agent_id", agentID, "error", err)
	}

	// Clean up supervisor state under lock
	s.mu.Lock()
	delete(s.stuckAgents, agentID)
	delete(s.healthScores, agentID)
	delete(s.heartbeats, agentID)
	s.addAlert("unrecoverable", agentID, "Agent could not be recovered after multiple attempts", "critical", nil)
	s.mu.Unlock()
}

// addAlert adds an alert. Caller must hold s.mu.
func (s *Supervisor) addAlert(alertType, agentID, message, severity string, metadata map[string]any) {
	alert := &SupervisorAlert{
		Type:      alertType,
		AgentID:   agentID,
		Message:   message,
		Timestamp: time.Now(),
		Severity:  severity,
		Metadata:  metadata,
	}
	s.alerts = append(s.alerts, alert)

	// Limit alerts to prevent memory leak (keep last 1000)
	const maxAlerts = 1000
	if len(s.alerts) > maxAlerts {
		trimmed := make([]*SupervisorAlert, maxAlerts)
		copy(trimmed, s.alerts[len(s.alerts)-maxAlerts:])
		s.alerts = trimmed
	}

	// Broadcast alert to UI (snapshot broadcaster under lock)
	broadcaster := s.broadcaster
	if broadcaster != nil {
		s.wg.Add(1)
		go func() {
			defer s.wg.Done()
			defer func() {
				if r := recover(); r != nil {
					supervisorLog.Error("Alert broadcast panic", "panic", r)
				}
			}()
			broadcaster.Broadcast("supervisor_alert", map[string]any{
				"type":      alertType,
				"agentId":   agentID,
				"message":   message,
				"severity":  severity,
				"timestamp": alert.Timestamp,
				"metadata":  metadata,
			})
		}()
	}
}

// RecordHeartbeat records a heartbeat for an agent
func (s *Supervisor) RecordHeartbeat(agentID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.heartbeats[agentID] = time.Now()

	// Update health score
	if health, exists := s.healthScores[agentID]; exists {
		health.ConsecutiveFails = 0
		health.LastHeartbeat = time.Now()

		// Check if agent was stuck and is now recovered
		if _, wasStuck := s.stuckAgents[agentID]; wasStuck {
			delete(s.stuckAgents, agentID)
			// Snapshot callback under lock to prevent race with OnAgentRecovered()
			onRecovered := s.onAgentRecovered
			if onRecovered != nil {
				if ag, exists := s.registry.Get(acp.AgentID(agentID)); exists && ag != nil {
					s.wg.Add(1)
					go func(agent *agent.Agent, callback func(*agent.Agent)) {
						defer s.wg.Done()
						defer func() {
							if r := recover(); r != nil {
								supervisorLog.Error("onAgentRecovered callback panic", "agent_id", agentID, "panic", r)
							}
						}()
						callback(agent)
					}(ag, onRecovered)
				}
			}
			s.addAlert("recovered", agentID, "Agent recovered from stuck state", "info", nil)
		}
	}
}

// MarkTaskResult records task result for health tracking
func (s *Supervisor) MarkTaskResult(agentID string, success bool, responseTime time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()

	health, exists := s.healthScores[agentID]
	if !exists {
		health = &AgentHealth{
			AgentID: agentID,
			Score:   1.0,
		}
		s.healthScores[agentID] = health
	}

	health.TotalTasks++
	if success {
		health.SuccessfulTasks++
		health.ConsecutiveFails = 0
	} else {
		health.ConsecutiveFails++
		health.LastErrorTime = time.Now()
	}

	// Update average response time
	if responseTime > 0 {
		totalTime := health.AvgResponseTime * time.Duration(health.TotalTasks-1)
		health.AvgResponseTime = (totalTime + responseTime) / time.Duration(health.TotalTasks)
	}
}

// GetHealth returns a copy of health info for an agent
func (s *Supervisor) GetHealth(agentID string) *AgentHealth {
	s.mu.RLock()
	defer s.mu.RUnlock()
	h := s.healthScores[agentID]
	if h == nil {
		return nil
	}
	cp := *h
	return &cp
}

// GetAlerts returns a copy of all alerts
func (s *Supervisor) GetAlerts() []*SupervisorAlert {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]*SupervisorAlert, len(s.alerts))
	copy(result, s.alerts)
	return result
}

// ClearAlerts clears all alerts
func (s *Supervisor) ClearAlerts() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.alerts = make([]*SupervisorAlert, 0)
}

// SetAlertsForTest sets alerts for testing purposes
func (s *Supervisor) SetAlertsForTest(alerts []*SupervisorAlert) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.alerts = alerts
}

// OnAgentStuck registers callback for stuck agents
func (s *Supervisor) OnAgentStuck(fn func(agent *agent.Agent, duration time.Duration)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onAgentStuck = fn
}

// OnAgentRecovered registers callback for recovered agents
func (s *Supervisor) OnAgentRecovered(fn func(agent *agent.Agent)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onAgentRecovered = fn
}

// OnHealthDegraded registers callback for degraded health
func (s *Supervisor) OnHealthDegraded(fn func(agent *agent.Agent, score float64)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onHealthDegraded = fn
}

// SetBroadcaster sets the event broadcaster for supervisor alerts streaming to UI.
// When set, supervisor events (stuck, recovered, degraded, alerts) are broadcast
// to connected clients for real-time monitoring.
func (s *Supervisor) SetBroadcaster(broadcaster EventBroadcaster) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.broadcaster = broadcaster

	// Wire callbacks to broadcast events
	if broadcaster != nil {
		s.onAgentStuck = func(ag *agent.Agent, duration time.Duration) {
			broadcaster.Broadcast("agent_stuck", map[string]any{
				"agentId":   ag.ID,
				"agentName": ag.Name,
				"duration":  duration.String(),
				"timestamp": time.Now(),
			})
		}
		s.onAgentRecovered = func(ag *agent.Agent) {
			broadcaster.Broadcast("agent_recovered", map[string]any{
				"agentId":   ag.ID,
				"agentName": ag.Name,
				"timestamp": time.Now(),
			})
		}
		s.onHealthDegraded = func(ag *agent.Agent, score float64) {
			broadcaster.Broadcast("agent_health_degraded", map[string]any{
				"agentId":   ag.ID,
				"agentName": ag.Name,
				"score":     score,
				"timestamp": time.Now(),
			})
		}
	}
}

// GetStats returns supervisor statistics
func (s *Supervisor) GetStats() SupervisorStats {
	s.mu.RLock()
	defer s.mu.RUnlock()

	healthyCount := 0
	degradedCount := 0
	unhealthyCount := 0
	stuckCount := len(s.stuckAgents)

	for _, health := range s.healthScores {
		if health.Score >= s.config.HealthThreshold {
			healthyCount++
		} else if health.Score >= 0.5 {
			degradedCount++
		} else {
			unhealthyCount++
		}
	}

	return SupervisorStats{
		TotalAgents:     len(s.healthScores),
		HealthyAgents:   healthyCount,
		DegradedAgents:  degradedCount,
		UnhealthyAgents: unhealthyCount,
		StuckAgents:     stuckCount,
		ActiveAlerts:    len(s.alerts),
	}
}

// SupervisorStats holds supervisor statistics
type SupervisorStats struct {
	TotalAgents     int `json:"totalAgents"`
	HealthyAgents   int `json:"healthyAgents"`
	DegradedAgents  int `json:"degradedAgents"`
	UnhealthyAgents int `json:"unhealthyAgents"`
	StuckAgents     int `json:"stuckAgents"`
	ActiveAlerts    int `json:"activeAlerts"`
}

// supervisorEvent represents a deferred callback event collected during checkAgents
type supervisorEvent struct {
	kind     string // "stuck", "degraded", or "unrecoverable"
	agent    *agent.Agent
	duration time.Duration
	score    float64
}
