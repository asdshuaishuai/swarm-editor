package api

import (
"context"
"encoding/json"
"fmt"
"time"
"github.com/swarm-editor/swarm-editor/internal/agent"
)

func (h *CommandHandler) handleGetSupervisorStats(ctx context.Context, params json.RawMessage) (any, error) {
	registry := h.server.Registry()
	if registry == nil {
		return SupervisorStats{}, nil
	}

	agents := registry.GetAll()
	stats := SupervisorStats{
		TotalAgents: len(agents),
	}

	for _, a := range agents {
		switch a.GetState() {
		case agent.StateIdle:
			stats.HealthyAgents++
		case agent.StateThinking, agent.StateExecuting:
			stats.HealthyAgents++
			stats.BusyAgents++
		case agent.StateError:
			stats.UnhealthyAgents++
		default:
			stats.DegradedAgents++
		}
	}

	return stats, nil
}

func (h *CommandHandler) handleGetEmergenceData(ctx context.Context, params json.RawMessage) (any, error) {
	// Use EmergenceService when available for real-time metrics
	if svc := h.server.EmergenceService(); svc != nil {
		return svc.GetData(), nil
	}

	// Fallback: compute inline from swarm data (no supervisor configured)
	swarms := h.server.ListSwarms()

	// Calculate health metrics from swarm data
	totalAgents := 0
	busyAgents := 0
	idleAgents := 0

	for _, sw := range swarms {
		stats := sw.GetStats()
		totalAgents += stats.AgentCount
		busyAgents += stats.ExecutingAgents
		idleAgents += stats.IdleAgents
	}

	// Calculate utilization
	utilization := 0.0
	if totalAgents > 0 {
		utilization = float64(busyAgents) / float64(totalAgents)
	}

	data := EmergenceData{
		Health: SwarmHealth{
			OverallScore:     0.85,
			CongestionLevel:  0.15,
			CollaborationIdx: 0.78,
			InnovationRate:   0.62,
			AgentUtilization: utilization,
		},
		Signals: []EmergentSignal{},
		Agents:  []AgentNode{},
		Flows:   []TaskFlow{},
	}

	// Build agent nodes from all swarms
	agentIndex := 0 // Track agent count separately for positioning
	for swarmID, sw := range swarms {
		stats := sw.GetStats()

		// Add coordinator node
		data.Agents = append(data.Agents, AgentNode{
			ID:   swarmID + "-coordinator",
			Name: "Coordinator",
			Type: "coordinator",
			Load: float64(stats.ExecutingAgents) / float64(stats.AgentCount+1),
			X:    0.5,
			Y:    0.5,
		})

		// Add agent nodes for each agent in the swarm
		for _, ag := range sw.GetAgents() {
			data.Agents = append(data.Agents, AgentNode{
				ID:   string(ag.ID),
				Name: ag.Name,
				Type: string(ag.Type),
				Load: 0.5, // Default load
				X:    0.3 + float64(agentIndex)*0.1,
				Y:    0.3 + float64(agentIndex)*0.1,
			})
			agentIndex++

			// Add flow from coordinator to agent
			data.Flows = append(data.Flows, TaskFlow{
				ID:        fmt.Sprintf("flow-%s-%s", swarmID, ag.ID),
				FromAgent: swarmID + "-coordinator",
				ToAgent:   string(ag.ID),
				TaskType:  "coordination",
				Status:    "active",
				StartedAt: time.Now().Format(time.RFC3339),
			})
		}
	}

	return data, nil
}

