// Package api provides HTTP handlers for the swarm editor
package api

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/swarm"
)

// EmergenceService provides data for the emergence dashboard
type EmergenceService struct {
	mu sync.RWMutex

	// Dependencies
	supervisor  *swarm.Supervisor
	scheduler   *swarm.Scheduler
	coordinator *swarm.Coordinator

	// Cached data
	lastUpdate time.Time
	cache      *EmergenceData
}

// NewEmergenceService creates a new emergence service
func NewEmergenceService(
	supervisor *swarm.Supervisor,
	scheduler *swarm.Scheduler,
	coordinator *swarm.Coordinator,
) *EmergenceService {
	return &EmergenceService{
		supervisor:  supervisor,
		scheduler:   scheduler,
		coordinator: coordinator,
	}
}

// GetData returns the current emergence data (returns a copy to prevent mutation)
func (s *EmergenceService) GetData() *EmergenceData {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Cache for 5 seconds
	if s.cache != nil && time.Since(s.lastUpdate) < 5*time.Second {
		return s.copyEmergenceData(s.cache)
	}

	data := s.collectData()
	s.cache = data
	s.lastUpdate = time.Now()

	return s.copyEmergenceData(data)
}

// copyEmergenceData returns a shallow copy of emergence data to prevent mutation
func (s *EmergenceService) copyEmergenceData(data *EmergenceData) *EmergenceData {
	if data == nil {
		return nil
	}
	cp := *data
	// Copy slices to prevent mutation of internal cache
	if len(data.Signals) > 0 {
		cp.Signals = make([]EmergentSignal, len(data.Signals))
		copy(cp.Signals, data.Signals)
	}
	if len(data.Agents) > 0 {
		cp.Agents = make([]AgentNode, len(data.Agents))
		copy(cp.Agents, data.Agents)
	}
	if len(data.Flows) > 0 {
		cp.Flows = make([]TaskFlow, len(data.Flows))
		copy(cp.Flows, data.Flows)
	}
	return &cp
}

// collectData collects all emergence data
func (s *EmergenceService) collectData() *EmergenceData {
	data := &EmergenceData{}

	// Collect health metrics
	data.Health = s.collectHealthMetrics()

	// Collect agent nodes
	data.Agents = s.collectAgentNodes()

	// Collect task flows
	data.Flows = s.collectTaskFlows()

	// Collect emergent signals
	data.Signals = s.collectEmergentSignals()

	return data
}

// collectHealthMetrics collects overall swarm health metrics
func (s *EmergenceService) collectHealthMetrics() SwarmHealth {
	health := SwarmHealth{}

	// Get supervisor stats
	if s.supervisor != nil {
		stats := s.supervisor.GetStats()
		totalAgents := stats.TotalAgents
		if totalAgents > 0 {
			healthyRatio := float64(stats.HealthyAgents) / float64(totalAgents)
			health.OverallScore = healthyRatio

			// Agent utilization: busy = total - healthy (healthy agents are idle)
			busyAgents := max(0, totalAgents-stats.HealthyAgents)
			health.AgentUtilization = float64(busyAgents) / float64(totalAgents)

			// Congestion level based on stuck agents
			health.CongestionLevel = float64(stats.StuckAgents) / float64(totalAgents)
		}
	}

	// Get scheduler stats
	if s.scheduler != nil {
		stats := s.scheduler.GetStats()
		totalWorkers := stats.TotalWorkers

		if totalWorkers > 0 {
			// Collaboration index: how well distributed the work is
			avgLoad := stats.AverageLoad
			health.CollaborationIdx = 1.0 - avgLoad/float64(totalWorkers)
			if health.CollaborationIdx < 0 {
				health.CollaborationIdx = 0
			}
		}

		// Innovation rate: based on task diversity (approximation)
		if stats.CompletedTasks > 0 {
			health.InnovationRate = float64(stats.CompletedTasks) / float64(stats.CompletedTasks+stats.PendingTasks+1)
		}

		// Queue congestion
		if stats.QueueLength > 0 {
			health.CongestionLevel += float64(stats.QueueLength) / float64(stats.TotalWorkers+1) * 0.5
			if health.CongestionLevel > 1 {
				health.CongestionLevel = 1
			}
		}
	}

	// Get coordinator stats
	if s.coordinator != nil {
		stats := s.coordinator.GetStats()
		// Additional metrics from coordinator
		if stats.WorkerCount > 0 {
			activeRatio := float64(stats.ActiveTasks) / float64(stats.WorkerCount)
			health.AgentUtilization = activeRatio
		}
	}

	// Normalize overall score
	if health.OverallScore == 0 {
		health.OverallScore = 0.5 // Default to neutral
	}

	return health
}

// collectAgentNodes collects agent node data for visualization
func (s *EmergenceService) collectAgentNodes() []AgentNode {
	nodes := make([]AgentNode, 0)

	// Get health info from supervisor
	if s.supervisor != nil {
		stats := s.supervisor.GetStats()
		totalAgents := stats.TotalAgents

		// Position calculation helper
		getPosition := func(index, total int) (x, y float64) {
			if total <= 1 {
				return 0.5, 0.5
			}
			// Arrange in a grid-like pattern
			x = 0.5 + 0.3*float64(total)/10.0*float64(index%2+1)
			y = 0.5 + 0.3*float64(total)/10.0*float64(index%3+1)
			return x, y
		}

		idx := 0
		// This would ideally iterate through actual agents
		// For now, create summary nodes
		if stats.HealthyAgents > 0 {
			x, y := getPosition(idx, totalAgents)
			nodes = append(nodes, AgentNode{
				ID:           "healthy-agents",
				Name:         "Healthy Agents",
				Type:         "group",
				Load:         float64(stats.HealthyAgents) / float64(totalAgents),
				Connectivity: stats.HealthyAgents,
				X:            x,
				Y:            y,
			})
			idx++
		}

		if stats.DegradedAgents > 0 {
			x, y := getPosition(idx, totalAgents)
			nodes = append(nodes, AgentNode{
				ID:           "degraded-agents",
				Name:         "Degraded Agents",
				Type:         "group",
				Load:         float64(stats.DegradedAgents) / float64(totalAgents),
				Connectivity: stats.DegradedAgents,
				X:            x,
				Y:            y,
			})
			idx++
		}

		if stats.UnhealthyAgents > 0 {
			x, y := getPosition(idx, totalAgents)
			nodes = append(nodes, AgentNode{
				ID:           "unhealthy-agents",
				Name:         "Unhealthy Agents",
				Type:         "group",
				Load:         1.0,
				Connectivity: 0,
				X:            x,
				Y:            y,
			})
			idx++
		}

		if stats.StuckAgents > 0 {
			x, y := getPosition(idx, totalAgents)
			nodes = append(nodes, AgentNode{
				ID:           "stuck-agents",
				Name:         "Stuck Agents",
				Type:         "group",
				Load:         1.0,
				Connectivity: 0,
				X:            x,
				Y:            y,
			})
		}
	}

	return nodes
}

// collectTaskFlows collects task flow data
func (s *EmergenceService) collectTaskFlows() []TaskFlow {
	flows := make([]TaskFlow, 0)
	now := time.Now().Format(time.RFC3339)

	// Get scheduler stats for flow data
	if s.scheduler != nil {
		stats := s.scheduler.GetStats()

		if stats.RunningTasks > 0 {
			flows = append(flows, TaskFlow{
				ID:        "pending-to-running",
				FromAgent: "queue",
				ToAgent:   "workers",
				TaskType:  "scheduled",
				Status:    "active",
				StartedAt: now,
			})
		}

		if stats.CompletedTasks > 0 {
			flows = append(flows, TaskFlow{
				ID:        "running-to-completed",
				FromAgent: "workers",
				ToAgent:   "completed",
				TaskType:  "completed",
				Status:    "done",
				StartedAt: now,
			})
		}
	}

	// Get coordinator stats
	if s.coordinator != nil {
		stats := s.coordinator.GetStats()

		if stats.ActiveTasks > 0 {
			flows = append(flows, TaskFlow{
				ID:        "coordinator-active",
				FromAgent: "coordinator",
				ToAgent:   "workers",
				TaskType:  "coordinated",
				Status:    "active",
				StartedAt: now,
			})
		}
	}

	return flows
}

// collectEmergentSignals collects emergent behavior signals
func (s *EmergenceService) collectEmergentSignals() []EmergentSignal {
	signals := make([]EmergentSignal, 0)
	now := time.Now().Format(time.RFC3339)

	// Analyze supervisor alerts
	if s.supervisor != nil {
		alerts := s.supervisor.GetAlerts()
		for _, alert := range alerts {
			severity := alert.Severity
			signalType := alert.Type

			// Map alert types to signal types
			if severity == "critical" {
				signalType = "anomaly"
			}

			signals = append(signals, EmergentSignal{
				ID:        alert.Type + "-" + alert.AgentID,
				Type:      signalType,
				Severity:  severity,
				Message:   alert.Message,
				Timestamp: alert.Timestamp.Format(time.RFC3339),
			})
		}
	}

	// Detect collaboration patterns
	if s.coordinator != nil {
		stats := s.coordinator.GetStats()
		if stats.WorkerCount > 2 && stats.ActiveTasks > 0 {
			signals = append(signals, EmergentSignal{
				ID:        "collaboration-active",
				Type:      "collaboration",
				Severity:  "info",
				Message:   "Multi-agent collaboration in progress",
				Timestamp: now,
			})
		}
	}

	// Detect congestion
	if s.scheduler != nil {
		stats := s.scheduler.GetStats()
		if stats.QueueLength > stats.TotalWorkers {
			signals = append(signals, EmergentSignal{
				ID:        "congestion-detected",
				Type:      "bottleneck",
				Severity:  "warning",
				Message:   "Task queue congestion detected",
				Timestamp: now,
			})
		}
	}

	return signals
}

// HTTP Handlers

// HandleGetEmergenceData handles GET /emergence
func (s *EmergenceService) HandleGetEmergenceData(w http.ResponseWriter, r *http.Request) {
	// MEDIUM FIX: Validate HTTP method
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	data := s.GetData()
	// MEDIUM FIX: Buffer JSON first to prevent double-write on Encode error
	buf, err := json.Marshal(data)
	if err != nil {
		apiError(w, err, "failed to encode emergence data", http.StatusInternalServerError)
		return
	}
	w.Write(buf)
}

// HandleGetSwarmHealth handles GET /emergence/health
func (s *EmergenceService) HandleGetSwarmHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	data := s.GetData()
	buf, err := json.Marshal(data.Health)
	if err != nil {
		apiError(w, err, "failed to encode health data", http.StatusInternalServerError)
		return
	}
	w.Write(buf)
}

// HandleGetAgentNodes handles GET /emergence/agents
func (s *EmergenceService) HandleGetAgentNodes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	data := s.GetData()
	buf, err := json.Marshal(data.Agents)
	if err != nil {
		apiError(w, err, "failed to encode agent data", http.StatusInternalServerError)
		return
	}
	w.Write(buf)
}

// HandleGetTaskFlows handles GET /emergence/flows
func (s *EmergenceService) HandleGetTaskFlows(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	data := s.GetData()
	buf, err := json.Marshal(data.Flows)
	if err != nil {
		apiError(w, err, "failed to encode flow data", http.StatusInternalServerError)
		return
	}
	w.Write(buf)
}

// HandleGetEmergentSignals handles GET /emergence/signals
func (s *EmergenceService) HandleGetEmergentSignals(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	data := s.GetData()
	buf, err := json.Marshal(data.Signals)
	if err != nil {
		apiError(w, err, "failed to encode signal data", http.StatusInternalServerError)
		return
	}
	w.Write(buf)
}
