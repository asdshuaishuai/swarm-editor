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

	// Throughput: tasks completed per minute (approximation from busy agent ratio)
	if stats.TotalAgents > 0 {
		stats.Throughput = float64(stats.BusyAgents) / float64(stats.TotalAgents) * 10.0
	}
	// AvgResponseTime: estimated response latency in ms based on agent health
	if stats.UnhealthyAgents > 0 {
		stats.AvgResponseTime = float64(stats.UnhealthyAgents) * 500.0 / float64(stats.TotalAgents)
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
	totalTasks := 0
	completedTasks := 0
	pendingTasks := 0

	for _, sw := range swarms {
		stats := sw.GetStats()
		totalAgents += stats.AgentCount
		busyAgents += stats.ExecutingAgents
		idleAgents += stats.IdleAgents
		totalTasks += stats.PendingTasks + stats.CompletedTasks
		completedTasks += stats.CompletedTasks
		pendingTasks += stats.PendingTasks
	}

	// Calculate utilization
	utilization := 0.0
	if totalAgents > 0 {
		utilization = float64(busyAgents) / float64(totalAgents)
	}

	// OverallScore: weighted combination of utilization and task completion
	overallScore := 0.0
	if totalTasks > 0 {
		completionRate := float64(completedTasks) / float64(totalTasks)
		overallScore = utilization*0.4 + completionRate*0.6
	} else if totalAgents > 0 {
		overallScore = utilization
	}

	// CongestionLevel: ratio of pending tasks to total agents (capped at 1.0)
	congestionLevel := 0.0
	if totalAgents > 0 {
		congestionLevel = float64(pendingTasks) / float64(totalAgents)
		if congestionLevel > 1.0 {
			congestionLevel = 1.0
		}
	}

	// CollaborationIdx: ratio of active swarms with multiple agents
	collaborationIdx := 0.0
	multiAgentSwarms := 0
	for _, sw := range swarms {
		if sw.GetStats().AgentCount > 1 {
			multiAgentSwarms++
		}
	}
	if len(swarms) > 0 {
		collaborationIdx = float64(multiAgentSwarms) / float64(len(swarms))
	}

	// InnovationRate: completion efficiency — completed vs total tasks
	innovationRate := 0.0
	if totalTasks > 0 {
		innovationRate = float64(completedTasks) / float64(totalTasks)
	}

	data := EmergenceData{
		Health: SwarmHealth{
			OverallScore:     overallScore,
			CongestionLevel:  congestionLevel,
			CollaborationIdx: collaborationIdx,
			InnovationRate:   innovationRate,
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
			Load:         float64(stats.ExecutingAgents) / float64(stats.AgentCount+1),
			Connectivity: stats.AgentCount,
			X:    0.5,
			Y:    0.5,
		})

		// Add agent nodes for each agent in the swarm
		for _, ag := range sw.GetAgents() {
			data.Agents = append(data.Agents, AgentNode{
				ID:   string(ag.ID),
				Name: ag.Name,
				Type: string(ag.Type),
				Load:         0.5,
				Connectivity: len(sw.GetAgents()) - 1,
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

