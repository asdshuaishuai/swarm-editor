// Package swarm tests for role allocator
package swarm

import (
	"testing"
	"time"
)

func TestAssignRole_BestMatch(t *testing.T) {
	ra := NewRoleAllocator()

	task := &Task{
		ID:          "task-1",
		Title:       "Implement feature",
		Description: "Code implementation needed",
		Priority:    PriorityHigh,
		State:       TaskStatePending,
		Metadata:    make(map[string]any),
		CreatedAt:   time.Now(),
	}

	agents := []AgentHealth{
		{
			AgentID:          "agent-1",
			Score:            0.9,
			ConsecutiveFails: 0,
			TotalTasks:       10,
			SuccessfulTasks:  9,
			AvgResponseTime:  100 * time.Millisecond,
		},
		{
			AgentID:          "agent-2",
			Score:            0.7,
			ConsecutiveFails: 1,
			TotalTasks:       5,
			SuccessfulTasks:  3,
			AvgResponseTime:  200 * time.Millisecond,
		},
	}

	agentID, role, score, err := ra.AssignRole(task, agents)

	if err != nil {
		t.Fatalf("AssignRole failed: %v", err)
	}

	if agentID == "" {
		t.Fatal("Expected agentID to be set")
	}

	if role != RoleCoder {
		t.Errorf("Expected role %s, got %s", RoleCoder, role)
	}

	if score <= 0 {
		t.Errorf("Expected positive score, got %f", score)
	}

	// Verify assignment was recorded
	assignment := ra.GetAssignment(agentID)
	if assignment == nil {
		t.Fatal("Expected assignment to be recorded")
	}

	if assignment.TaskID != task.ID {
		t.Errorf("Expected task ID %s, got %s", task.ID, assignment.TaskID)
	}
}

func TestAssignRole_AllBusy(t *testing.T) {
	ra := NewRoleAllocator()

	task := &Task{
		ID:          "task-1",
		Title:       "Test task",
		Description: "Testing",
		Priority:    PriorityMedium,
		State:       TaskStatePending,
		Metadata:    make(map[string]any),
		CreatedAt:   time.Now(),
	}

	agents := []AgentHealth{
		{
			AgentID:          "agent-1",
			Score:            0.9,
			ConsecutiveFails: 0,
			TotalTasks:       10,
			SuccessfulTasks:  9,
			AvgResponseTime:  100 * time.Millisecond,
		},
	}

	// First assignment should succeed
	agentID1, _, _, err := ra.AssignRole(task, agents)
	if err != nil {
		t.Fatalf("First AssignRole failed: %v", err)
	}

	// Second assignment should fail because agent is busy
	task2 := &Task{
		ID:          "task-2",
		Title:       "Another task",
		Description: "More testing",
		Priority:    PriorityMedium,
		State:       TaskStatePending,
		Metadata:    make(map[string]any),
		CreatedAt:   time.Now(),
	}

	_, _, _, err = ra.AssignRole(task2, agents)
	if err == nil {
		t.Error("Expected error when all agents are busy")
	}

	// Release agent and try again
	ra.ReleaseAgent(agentID1)

	agentID2, _, _, err := ra.AssignRole(task2, agents)
	if err != nil {
		t.Fatalf("Second AssignRole after release failed: %v", err)
	}

	if agentID2 != agentID1 {
		t.Errorf("Expected agent %s, got %s", agentID1, agentID2)
	}
}

func TestAssignRole_NoAgents(t *testing.T) {
	ra := NewRoleAllocator()

	task := &Task{
		ID:          "task-1",
		Title:       "Test task",
		Description: "Testing",
		Priority:    PriorityMedium,
		State:       TaskStatePending,
		Metadata:    make(map[string]any),
		CreatedAt:   time.Now(),
	}

	agents := []AgentHealth{}

	_, _, _, err := ra.AssignRole(task, agents)
	if err == nil {
		t.Error("Expected error when no agents available")
	}
}

func TestRecordResult_ReinforcesPheromone(t *testing.T) {
	ra := NewRoleAllocator()

	agentID := "agent-1"
	role := RoleCoder

	// Record successful results
	for i := 0; i < 5; i++ {
		ra.RecordResult(agentID, role, true)
	}

	trails := ra.GetPheromones(agentID)
	if len(trails) != 1 {
		t.Fatalf("Expected 1 trail, got %d", len(trails))
	}

	if trails[0].Role != role {
		t.Errorf("Expected role %s, got %s", role, trails[0].Role)
	}

	if trails[0].TaskCount != 5 {
		t.Errorf("Expected task count 5, got %d", trails[0].TaskCount)
	}

	if trails[0].Strength <= 0.5 {
		t.Errorf("Expected strength > 0.5 after successes, got %f", trails[0].Strength)
	}

	// Record a failure
	ra.RecordResult(agentID, role, false)

	trails = ra.GetPheromones(agentID)
	if trails[0].Strength >= 0.9 {
		t.Errorf("Expected strength to decrease after failure, got %f", trails[0].Strength)
	}
}

func TestDecayPheromones(t *testing.T) {
	ra := NewRoleAllocator()
	ra.SetDecayRate(0.5) // 50% decay per hour for testing

	agentID := "agent-1"
	role := RoleCoder

	// Set up initial pheromone
	ra.RecordResult(agentID, role, true)

	trails := ra.GetPheromones(agentID)
	initialStrength := trails[0].Strength

	// Manually set LastUsed to simulate time passing
	ra.mu.Lock()
	ra.pheromones[agentID][0].LastUsed = time.Now().Add(-2 * time.Hour)
	ra.mu.Unlock()

	// Decay
	ra.DecayPheromones()

	trails = ra.GetPheromones(agentID)
	if trails[0].Strength >= initialStrength {
		t.Errorf("Expected strength to decay, was %f, now %f", initialStrength, trails[0].Strength)
	}
}

func TestReleaseAgent(t *testing.T) {
	ra := NewRoleAllocator()

	task := &Task{
		ID:          "task-1",
		Title:       "Test task",
		Description: "Testing",
		Priority:    PriorityMedium,
		State:       TaskStatePending,
		Metadata:    make(map[string]any),
		CreatedAt:   time.Now(),
	}

	agents := []AgentHealth{
		{
			AgentID:          "agent-1",
			Score:            0.9,
			ConsecutiveFails: 0,
			TotalTasks:       10,
			SuccessfulTasks:  9,
			AvgResponseTime:  100 * time.Millisecond,
		},
	}

	agentID, _, _, err := ra.AssignRole(task, agents)
	if err != nil {
		t.Fatalf("AssignRole failed: %v", err)
	}

	// Verify assignment exists
	if ra.GetAssignment(agentID) == nil {
		t.Fatal("Expected assignment to exist")
	}

	// Release agent
	ra.ReleaseAgent(agentID)

	// Verify assignment is removed
	if ra.GetAssignment(agentID) != nil {
		t.Error("Expected assignment to be removed after release")
	}
}

func TestDynamicRoleSwitching(t *testing.T) {
	ra := NewRoleAllocator()

	agents := []AgentHealth{
		{
			AgentID:          "agent-1",
			Score:            0.9,
			ConsecutiveFails: 0,
			TotalTasks:       10,
			SuccessfulTasks:  9,
			AvgResponseTime:  100 * time.Millisecond,
		},
	}

	// Task 1: Coding task
	codingTask := &Task{
		ID:          "task-code",
		Title:       "Implement feature",
		Description: "Code implementation",
		Priority:    PriorityHigh,
		State:       TaskStatePending,
		Metadata:    make(map[string]any),
		CreatedAt:   time.Now(),
	}

	agentID1, role1, _, err := ra.AssignRole(codingTask, agents)
	if err != nil {
		t.Fatalf("AssignRole for coding task failed: %v", err)
	}

	if role1 != RoleCoder {
		t.Errorf("Expected role %s for coding task, got %s", RoleCoder, role1)
	}

	// Record success
	ra.RecordResult(agentID1, role1, true)

	// Release agent
	ra.ReleaseAgent(agentID1)

	// Task 2: Review task
	reviewTask := &Task{
		ID:          "task-review",
		Title:       "Review code",
		Description: "Code review needed",
		Priority:    PriorityHigh,
		State:       TaskStatePending,
		Metadata:    make(map[string]any),
		CreatedAt:   time.Now(),
	}

	agentID2, role2, _, err := ra.AssignRole(reviewTask, agents)
	if err != nil {
		t.Fatalf("AssignRole for review task failed: %v", err)
	}

	if role2 != RoleReviewer {
		t.Errorf("Expected role %s for review task, got %s", RoleReviewer, role2)
	}

	if agentID2 != agentID1 {
		t.Errorf("Expected same agent %s, got %s", agentID1, agentID2)
	}

	// Record success for review task
	ra.RecordResult(agentID2, role2, true)

	// Verify both trails exist
	trails := ra.GetPheromones(agentID1)
	if len(trails) != 2 {
		t.Fatalf("Expected 2 trails, got %d", len(trails))
	}

	// Verify roles
	roleSet := make(map[AgentRole]bool)
	for _, trail := range trails {
		roleSet[trail.Role] = true
	}

	if !roleSet[RoleCoder] || !roleSet[RoleReviewer] {
		t.Error("Expected both Coder and Reviewer roles in trails")
	}
}

func TestGetAllAssignments(t *testing.T) {
	ra := NewRoleAllocator()

	agents := []AgentHealth{
		{
			AgentID:          "agent-1",
			Score:            0.9,
			ConsecutiveFails: 0,
			TotalTasks:       10,
			SuccessfulTasks:  9,
			AvgResponseTime:  100 * time.Millisecond,
		},
		{
			AgentID:          "agent-2",
			Score:            0.8,
			ConsecutiveFails: 0,
			TotalTasks:       5,
			SuccessfulTasks:  4,
			AvgResponseTime:  150 * time.Millisecond,
		},
	}

	task1 := &Task{
		ID:          "task-1",
		Title:       "Task 1",
		Description: "First task",
		Priority:    PriorityHigh,
		State:       TaskStatePending,
		Metadata:    make(map[string]any),
		CreatedAt:   time.Now(),
	}

	task2 := &Task{
		ID:          "task-2",
		Title:       "Task 2",
		Description: "Second task",
		Priority:    PriorityMedium,
		State:       TaskStatePending,
		Metadata:    make(map[string]any),
		CreatedAt:   time.Now(),
	}

	ra.AssignRole(task1, agents)
	ra.AssignRole(task2, agents)

	assignments := ra.GetAllAssignments()
	if len(assignments) != 2 {
		t.Errorf("Expected 2 assignments, got %d", len(assignments))
	}

	// Verify no duplicate agents
	agentIDs := make(map[string]bool)
	for _, assignment := range assignments {
		if agentIDs[assignment.AgentID] {
			t.Errorf("Duplicate agent ID in assignments: %s", assignment.AgentID)
		}
		agentIDs[assignment.AgentID] = true
	}
}

func TestInferRoleFromTask(t *testing.T) {
	ra := NewRoleAllocator()

	tests := []struct {
		name        string
		title       string
		description string
		expected    AgentRole
	}{
		{
			name:        "Coding task",
			title:       "Implement feature",
			description: "Code implementation needed",
			expected:    RoleCoder,
		},
		{
			name:        "Review task",
			title:       "Review PR",
			description: "Code review required",
			expected:    RoleReviewer,
		},
		{
			name:        "Test task",
			title:       "Write tests",
			description: "Unit test coverage needed",
			expected:    RoleTester,
		},
		{
			name:        "Architecture task",
			title:       "Design system",
			description: "Architecture planning",
			expected:    RoleArchitect,
		},
		{
			name:        "Generic task",
			title:       "Do something",
			description: "General task",
			expected:    RoleGeneric,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			task := &Task{
				ID:          "test-task",
				Title:       tt.title,
				Description: tt.description,
				Priority:    PriorityMedium,
				State:       TaskStatePending,
				Metadata:    make(map[string]any),
				CreatedAt:   time.Now(),
			}

			role := ra.inferRoleFromTask(task)
			if role != tt.expected {
				t.Errorf("Expected role %s, got %s", tt.expected, role)
			}
		})
	}
}

func TestInferRoleFromTask_ExplicitRole(t *testing.T) {
	ra := NewRoleAllocator()

	task := &Task{
		ID:          "test-task",
		Title:       "Some task",
		Description: "Any description",
		Priority:    PriorityMedium,
		State:       TaskStatePending,
		Metadata:    map[string]any{
			"requiredRole": "tester",
		},
		CreatedAt: time.Now(),
	}

	role := ra.inferRoleFromTask(task)
	if role != RoleTester {
		t.Errorf("Expected explicit role %s, got %s", RoleTester, role)
	}
}
