// Package swarm implements dynamic role allocation using pheromone-trail inspired swarm intelligence
package swarm

import (
	"fmt"
	"sync"
	"time"
)

// AgentRole represents a dynamically assigned role
type AgentRole string

const (
	RoleCoder     AgentRole = "coder"
	RoleReviewer  AgentRole = "reviewer"
	RoleTester    AgentRole = "tester"
	RoleArchitect AgentRole = "architect"
	RoleGeneric   AgentRole = "generic"
)

// PheromoneTrail tracks agent's demonstrated capability per role
type PheromoneTrail struct {
	Role        AgentRole
	Strength    float64    // 0-1, decays over time, reinforced on success
	TaskCount   int
	SuccessRate float64
	LastUsed    time.Time
}

// RoleAssignment tracks current assignment
type RoleAssignment struct {
	AgentID    string
	Role       AgentRole
	TaskID     string
	AssignedAt time.Time
	Score      float64 // how well matched
}

// RoleAllocator manages dynamic role assignment
type RoleAllocator struct {
	mu         sync.RWMutex
	pheromones map[string][]PheromoneTrail // agentID → trails
	active     map[string]*RoleAssignment   // agentID → current assignment
	decayRate  float64                      // pheromone decay per hour
}

// NewRoleAllocator creates a new role allocator
func NewRoleAllocator() *RoleAllocator {
	return &RoleAllocator{
		pheromones: make(map[string][]PheromoneTrail),
		active:     make(map[string]*RoleAssignment),
		decayRate:  0.1, // 10% decay per hour
	}
}

// AssignRole picks the best agent+role for a task
func (ra *RoleAllocator) AssignRole(task *Task, agents []AgentHealth) (agentID string, role AgentRole, score float64, err error) {
	if task == nil {
		return "", RoleGeneric, 0, fmt.Errorf("task cannot be nil")
	}
	if len(agents) == 0 {
		return "", RoleGeneric, 0, fmt.Errorf("no agents available")
	}

	ra.mu.Lock()
	defer ra.mu.Unlock()

	// Determine required role from task metadata
	requiredRole := ra.inferRoleFromTask(task)

	// Find best agent for this role
	var bestAgent string
	var bestScore float64 = -1.0

	for _, agent := range agents {
		// Skip agents that are already assigned
		if _, assigned := ra.active[agent.AgentID]; assigned {
			continue
		}

		// Calculate score for this agent
		agentScore := ra.calculateAgentScore(agent.AgentID, requiredRole, agent)
		if agentScore > bestScore {
			bestScore = agentScore
			bestAgent = agent.AgentID
		}
	}

	if bestAgent == "" {
		return "", RoleGeneric, 0, fmt.Errorf("no available agents")
	}

	// Create assignment
	assignment := &RoleAssignment{
		AgentID:    bestAgent,
		Role:       requiredRole,
		TaskID:     task.ID,
		AssignedAt: time.Now(),
		Score:      bestScore,
	}
	ra.active[bestAgent] = assignment

	return bestAgent, requiredRole, bestScore, nil
}

// inferRoleFromTask determines the required role based on task description
func (ra *RoleAllocator) inferRoleFromTask(task *Task) AgentRole {
	// Check if role is explicitly specified
	if requiredRole, ok := task.Metadata["requiredRole"].(string); ok {
		switch AgentRole(requiredRole) {
		case RoleCoder, RoleReviewer, RoleTester, RoleArchitect:
			return AgentRole(requiredRole)
		}
	}

	// Infer from task description keywords
	desc := fmt.Sprintf("%s %s", task.Title, task.Description)
	descLower := toLower(desc)

	if contains(descLower, "review") || contains(descLower, "audit") {
		return RoleReviewer
	}
	if contains(descLower, "test") || contains(descLower, "spec") {
		return RoleTester
	}
	if contains(descLower, "architect") || contains(descLower, "design") {
		return RoleArchitect
	}
	if contains(descLower, "code") || contains(descLower, "implement") || contains(descLower, "refactor") {
		return RoleCoder
	}

	return RoleGeneric
}

// calculateAgentScore computes a score for an agent's suitability for a role
func (ra *RoleAllocator) calculateAgentScore(agentID string, role AgentRole, health AgentHealth) float64 {
	// Get pheromone trail for this role
	trails := ra.pheromones[agentID]
	var trail *PheromoneTrail
	for i := range trails {
		if trails[i].Role == role {
			trail = &trails[i]
			break
		}
	}

	pheromoneStrength := 0.5 // default for new agents
	if trail != nil {
		pheromoneStrength = trail.Strength
	}

	// Calculate load factor (1.0 when idle, decreases with more active tasks)
	// Count active tasks for this agent
	activeCount := 0
	for _, assignment := range ra.active {
		if assignment.AgentID == agentID {
			activeCount++
		}
	}
	loadFactor := 1.0
	if activeCount > 0 {
		loadFactor = 1.0 / float64(activeCount+1)
	}

	// Capability match - simplified based on role
	capabilityMatch := 0.5
	if trail != nil && trail.TaskCount > 0 {
		capabilityMatch = trail.SuccessRate
	}

	// Weighted scoring formula
	// pheromone_strength * 0.4 + health_score * 0.3 + load_factor * 0.2 + capability_match * 0.1
	score := pheromoneStrength*0.4 + health.Score*0.3 + loadFactor*0.2 + capabilityMatch*0.1

	return score
}

// RecordResult updates pheromone trail based on task execution result
func (ra *RoleAllocator) RecordResult(agentID string, role AgentRole, success bool) {
	ra.mu.Lock()
	defer ra.mu.Unlock()

	trails := ra.pheromones[agentID]
	var trail *PheromoneTrail
	trailIdx := -1

	for i := range trails {
		if trails[i].Role == role {
			trail = &trails[i]
			trailIdx = i
			break
		}
	}

	if trail == nil {
		// Create new trail
		trail = &PheromoneTrail{
			Role:     role,
			Strength: 0.5,
			TaskCount: 0,
			SuccessRate: 0.0,
			LastUsed: time.Now(),
		}
		ra.pheromones[agentID] = append(trails, *trail)
		trailIdx = len(trails)
	}

	// Update trail
	trail.TaskCount++
	if success {
		trail.Strength = min(1.0, trail.Strength+0.1) // Reinforce
	} else {
		trail.Strength = max(0.0, trail.Strength-0.2) // Punish
	}

	// Approximate success rate from current strength
	trail.SuccessRate = trail.Strength
	trail.LastUsed = time.Now()

	// Update in map
	if trailIdx >= 0 {
		ra.pheromones[agentID][trailIdx] = *trail
	}
}

// GetAssignment returns the current assignment for an agent
func (ra *RoleAllocator) GetAssignment(agentID string) *RoleAssignment {
	ra.mu.RLock()
	defer ra.mu.RUnlock()

	assignment := ra.active[agentID]
	if assignment == nil {
		return nil
	}

	cp := *assignment
	return &cp
}

// GetAllAssignments returns all active role assignments
func (ra *RoleAllocator) GetAllAssignments() []RoleAssignment {
	ra.mu.RLock()
	defer ra.mu.RUnlock()

	result := make([]RoleAssignment, 0, len(ra.active))
	for _, assignment := range ra.active {
		result = append(result, *assignment)
	}
	return result
}

// ReleaseAgent marks an agent as available
func (ra *RoleAllocator) ReleaseAgent(agentID string) {
	ra.mu.Lock()
	defer ra.mu.Unlock()

	delete(ra.active, agentID)
}

// DecayPheromones reduces old pheromone trails
func (ra *RoleAllocator) DecayPheromones() {
	ra.mu.Lock()
	defer ra.mu.Unlock()

	now := time.Now()
	for agentID, trails := range ra.pheromones {
		for i := range trails {
			hoursSinceLastUse := now.Sub(trails[i].LastUsed).Hours()
			if hoursSinceLastUse > 0 {
				decay := ra.decayRate * hoursSinceLastUse
				trails[i].Strength = max(0.0, trails[i].Strength-decay)
			}
		}
		ra.pheromones[agentID] = trails
	}
}

// GetPheromones returns pheromone trails for an agent
func (ra *RoleAllocator) GetPheromones(agentID string) []PheromoneTrail {
	ra.mu.RLock()
	defer ra.mu.RUnlock()

	trails := ra.pheromones[agentID]
	if trails == nil {
		return nil
	}

	result := make([]PheromoneTrail, len(trails))
	copy(result, trails)
	return result
}

// SetDecayRate sets the pheromone decay rate per hour
func (ra *RoleAllocator) SetDecayRate(rate float64) {
	ra.mu.Lock()
	defer ra.mu.Unlock()

	ra.decayRate = rate
}

// Helper functions for string operations
func toLower(s string) string {
	// Simple lower case conversion for common ASCII characters
	result := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			result[i] = c + 32
		} else {
			result[i] = c
		}
	}
	return string(result)
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && findSubstring(s, substr) >= 0
}

func findSubstring(s, substr string) int {
	// Simple substring search
	if len(substr) == 0 {
		return 0
	}
	if len(s) < len(substr) {
		return -1
	}

	for i := 0; i <= len(s)-len(substr); i++ {
		match := true
		for j := 0; j < len(substr); j++ {
			if s[i+j] != substr[j] {
				match = false
				break
			}
		}
		if match {
			return i
		}
	}
	return -1
}

func min(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func max(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}
