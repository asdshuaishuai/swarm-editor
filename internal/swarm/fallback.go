// Package swarm implements cascading fallback chains for task execution.
// Inspired by CrewAI's task delegation with capability-based escalation.
// Integrates with the existing Supervisor health scoring for circuit-breaking.
package swarm

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/log"
)

var fallbackLog = log.With("component", "Fallback")

// FallbackStrategy defines how to select the next fallback agent
type FallbackStrategy string

const (
	// FallbackByHealthScore tries next agent with highest health score
	FallbackByHealthScore FallbackStrategy = "by_health"
	// FallbackByCapability tries next agent matching required capability
	FallbackByCapability FallbackStrategy = "by_capability"
	// FallbackByRole tries agents in explicit preference order
	FallbackByRole FallbackStrategy = "by_role"
)

// FallbackConfig configures fallback behavior for a task
type FallbackConfig struct {
	MaxAttempts       int              `json:"maxAttempts"`
	Strategy          FallbackStrategy `json:"strategy"`
	RequiredMinHealth float64          `json:"requiredMinHealth"`
	PerAttemptTimeout time.Duration    `json:"perAttemptTimeout"`
	AgentPreference   []string         `json:"agentPreference,omitempty"`
}

// DefaultFallbackConfig returns sensible defaults
func DefaultFallbackConfig() FallbackConfig {
	return FallbackConfig{
		MaxAttempts:       3,
		Strategy:          FallbackByHealthScore,
		RequiredMinHealth: 0.5,
		PerAttemptTimeout: 2 * time.Minute,
	}
}

// AgentHealthProvider is an interface for getting agent health scores.
// Decouples FallbackChain from the concrete Supervisor implementation.
type AgentHealthProvider interface {
	GetHealth(agentID string) *AgentHealth
}

// AgentListProvider is an interface for listing available agent connections.
type AgentListProvider interface {
	GetAgents() []*acp.AgentConnection
}

// StaticAgentListProvider is a static list of agents, used to avoid lock re-entry
// when FallbackChain is created from within a locked context.
type StaticAgentListProvider struct {
	agents []*acp.AgentConnection
}

// NewStaticAgentListProvider creates a static provider from a pre-fetched list
func NewStaticAgentListProvider(agents []*acp.AgentConnection) *StaticAgentListProvider {
	return &StaticAgentListProvider{agents: agents}
}

// GetAgents returns the static list of agents
func (s *StaticAgentListProvider) GetAgents() []*acp.AgentConnection {
	return s.agents
}

// FallbackChain manages cascading fallback for a task.
// Each task gets its own chain instance, tracking which agents have been tried.
type FallbackChain struct {
	config    FallbackConfig
	taskID    string
	agents    AgentListProvider
	health    AgentHealthProvider
	attempted map[string]struct{}
}

// NewFallbackChain creates a fallback chain for a task
func NewFallbackChain(taskID string, config FallbackConfig, agents AgentListProvider, health AgentHealthProvider) *FallbackChain {
	return &FallbackChain{
		config:    config,
		taskID:    taskID,
		agents:    agents,
		health:    health,
		attempted: make(map[string]struct{}),
	}
}

// NextAgent returns the next agent to try, or an error if exhausted.
// Uses the configured strategy to select among eligible agents.
func (fc *FallbackChain) NextAgent(ctx context.Context) (*acp.AgentConnection, error) {
	if len(fc.attempted) >= fc.config.MaxAttempts {
		return nil, fmt.Errorf("fallback chain exhausted after %d attempts", len(fc.attempted))
	}

	var candidates []*acp.AgentConnection

	switch fc.config.Strategy {
	case FallbackByHealthScore:
		candidates = fc.selectByHealth()
	case FallbackByCapability:
		candidates = fc.selectByCapability()
	case FallbackByRole:
		candidates = fc.selectByRole()
	default:
		candidates = fc.selectByHealth()
	}

	for _, conn := range candidates {
		if _, tried := fc.attempted[conn.ID]; tried {
			continue
		}
		if fc.health != nil {
			health := fc.health.GetHealth(conn.ID)
			if health != nil && health.Score < fc.config.RequiredMinHealth {
				fallbackLog.Warn("Skipping agent: health below threshold", "agent_id", conn.ID, "health", health.Score, "threshold", fc.config.RequiredMinHealth)
				continue
			}
		}
		return conn, nil
	}

	return nil, fmt.Errorf("no eligible agents remaining in fallback chain for task %s", fc.taskID)
}

// MarkAttempted records that an agent has been tried
func (fc *FallbackChain) MarkAttempted(agentID string) {
	fc.attempted[agentID] = struct{}{}
}

// RemainingAttempts returns how many attempts are left
func (fc *FallbackChain) RemainingAttempts() int {
	return fc.config.MaxAttempts - len(fc.attempted)
}

// AttemptedAgents returns the list of agents that have been tried
func (fc *FallbackChain) AttemptedAgents() []string {
	ids := make([]string, 0, len(fc.attempted))
	for id := range fc.attempted {
		ids = append(ids, id)
	}
	return ids
}

// selectByHealth returns agents sorted by health score (highest first)
func (fc *FallbackChain) selectByHealth() []*acp.AgentConnection {
	all := fc.agents.GetAgents()
	if fc.health == nil {
		return all
	}
	// Copy to avoid mutating the provider's slice
	sorted := make([]*acp.AgentConnection, len(all))
	copy(sorted, all)
	sort.Slice(sorted, func(i, j int) bool {
		return fc.getHealthScore(sorted[i].ID) > fc.getHealthScore(sorted[j].ID)
	})
	return sorted
}

// selectByCapability returns agents that match task requirements
func (fc *FallbackChain) selectByCapability() []*acp.AgentConnection {
	// No metadata-based filtering yet; fall back to health-based
	return fc.selectByHealth()
}

// selectByRole returns agents ordered by explicit preference, then by health
func (fc *FallbackChain) selectByRole() []*acp.AgentConnection {
	if len(fc.config.AgentPreference) > 0 {
		var ordered []*acp.AgentConnection
		all := fc.agents.GetAgents()
		for _, prefID := range fc.config.AgentPreference {
			for _, conn := range all {
				if conn.ID == prefID {
					ordered = append(ordered, conn)
					break
				}
			}
		}
		if len(ordered) > 0 {
			return ordered
		}
	}
	return fc.selectByHealth()
}

func (fc *FallbackChain) getHealthScore(agentID string) float64 {
	if fc.health == nil {
		return 0.5 // neutral score when no health provider
	}
	h := fc.health.GetHealth(agentID)
	if h == nil {
		return 0.5
	}
	return h.Score
}
