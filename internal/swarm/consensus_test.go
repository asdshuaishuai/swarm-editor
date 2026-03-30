package swarm

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
)

func TestNewConsensusEngine(t *testing.T) {
	registry := agent.NewRegistry()
	config := ConsensusConfig{
		DefaultAlgorithm: ConsensusSimpleMajority,
		DefaultTimeout:   30 * time.Second,
		MinAgreement:     0.51,
	}

	engine := NewConsensusEngine(config, registry)

	if engine == nil {
		t.Fatal("NewConsensusEngine returned nil")
	}

	if engine.config.DefaultAlgorithm != ConsensusSimpleMajority {
		t.Errorf("Expected algorithm %s, got %s", ConsensusSimpleMajority, engine.config.DefaultAlgorithm)
	}

	if engine.agentRegistry == nil {
		t.Error("Agent registry should be set")
	}
}

func TestConsensusEngineDefaultConfig(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	if engine.config.DefaultTimeout == 0 {
		t.Error("Default timeout should be set")
	}

	if engine.config.DefaultAlgorithm == "" {
		t.Error("Default algorithm should be set")
	}

	if engine.config.MinAgreement == 0 {
		t.Error("MinAgreement should be set")
	}

	// Default should be Queen Bee model
	if engine.config.DefaultAlgorithm != ConsensusQueenBee {
		t.Errorf("Expected default algorithm %s, got %s", ConsensusQueenBee, engine.config.DefaultAlgorithm)
	}
}

func TestConsensusEngineStartStop(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	ctx := context.Background()
	err := engine.Start(ctx)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	// Give it a moment to start
	time.Sleep(50 * time.Millisecond)

	// Stop should not panic
	engine.Stop()
}

func TestConsensusEngineDoubleStart(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	ctx := context.Background()

	// First start should succeed
	err := engine.Start(ctx)
	if err != nil {
		t.Fatalf("First Start failed: %v", err)
	}

	// Second start should fail
	err = engine.Start(ctx)
	if err == nil {
		t.Error("Second Start should return error")
	}

	// Clean up
	engine.Stop()
}

func TestConsensusEngineDoubleStop(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	ctx := context.Background()
	engine.Start(ctx)

	// First stop should succeed
	engine.Stop()

	// Second stop should not panic
	engine.Stop()
}

func TestEvaluateTask(t *testing.T) {
	registry := agent.NewRegistry()

	// Add some agents
	for i := 0; i < 3; i++ {
		a := agent.NewAgent("test-agent", agent.AgentTypeCoder)
		registry.Register(a)
	}

	engine := NewConsensusEngine(ConsensusConfig{
		DefaultTimeout: 5 * time.Second,
	}, registry)

	ctx := context.Background()
	engine.Start(ctx)
	defer engine.Stop()

	task := NewTask("Test Task", "This is a test task for Queen Bee evaluation", acp.Prompt{
		{Type: "text", Text: "Sample task prompt"},
	})

	// Create evaluation with timeout
	ctxTimeout, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	result, err := engine.EvaluateTask(ctxTimeout, task, ConsensusQueenBee)
	if err != nil {
		t.Fatalf("EvaluateTask failed: %v", err)
	}

	if result == nil {
		t.Fatal("Result should not be nil")
	}

	if result.TaskID != task.ID {
		t.Errorf("Expected task ID %s, got %s", task.ID, result.TaskID)
	}
}

// Test backward compatibility with CreateProposal
func TestCreateProposalBackwardCompatibility(t *testing.T) {
	registry := agent.NewRegistry()

	// Add some agents
	for i := 0; i < 3; i++ {
		a := agent.NewAgent("test-agent", agent.AgentTypeCoder)
		registry.Register(a)
	}

	engine := NewConsensusEngine(ConsensusConfig{
		DefaultTimeout: 5 * time.Second,
	}, registry)

	ctx := context.Background()
	engine.Start(ctx)
	defer engine.Stop()

	task := NewTask("Test Task", "This is a test task for backward compatibility", acp.Prompt{
		{Type: "text", Text: "Sample task prompt"},
	})

	// Create proposal with timeout (backward compatibility)
	ctxTimeout, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	result, err := engine.CreateProposal(ctxTimeout, task, ConsensusSimpleMajority)
	if err != nil {
		t.Fatalf("CreateProposal failed: %v", err)
	}

	if result == nil {
		t.Fatal("Result should not be nil")
	}

	if result.TaskID != task.ID {
		t.Errorf("Expected task ID %s, got %s", task.ID, result.TaskID)
	}
}

func TestConsensusAlgorithms(t *testing.T) {
	tests := []struct {
		name         string
		algorithm    ConsensusAlgorithm
		approvalRate float64
		expected     bool
		minAgreement float64
	}{
		{
			name:         "SimpleMajority 50% should fail",
			algorithm:    ConsensusSimpleMajority,
			approvalRate: 0.5,
			expected:     false,
		},
		{
			name:         "SimpleMajority 51% should pass",
			algorithm:    ConsensusSimpleMajority,
			approvalRate: 0.51,
			expected:     true,
		},
		{
			name:         "Supermajority 66% should fail",
			algorithm:    ConsensusSupermajority,
			approvalRate: 0.66,
			expected:     false,
		},
		{
			name:         "Supermajority 67% should pass",
			algorithm:    ConsensusSupermajority,
			approvalRate: 0.67,
			expected:     true,
		},
		{
			name:         "Unanimity 99% should fail",
			algorithm:    ConsensusUnanimity,
			approvalRate: 0.99,
			expected:     false,
		},
		{
			name:         "Unanimity 100% should pass",
			algorithm:    ConsensusUnanimity,
			approvalRate: 1.0,
			expected:     true,
		},
		{
			name:         "Weighted 70% with min 0.6 should pass",
			algorithm:    ConsensusWeighted,
			approvalRate: 0.7,
			minAgreement: 0.6,
			expected:     true,
		},
		{
			name:         "Weighted 50% with min 0.6 should fail",
			algorithm:    ConsensusWeighted,
			approvalRate: 0.5,
			minAgreement: 0.6,
			expected:     false,
		},
		{
			name:         "Byzantine 66% should fail",
			algorithm:    ConsensusByzantine,
			approvalRate: 0.66,
			expected:     false,
		},
		{
			name:         "Byzantine 67% should pass",
			algorithm:    ConsensusByzantine,
			approvalRate: 0.67,
			expected:     true,
		},
		{
			name:         "QueenBee 70% with min 0.6 should pass",
			algorithm:    ConsensusQueenBee,
			approvalRate: 0.7,
			minAgreement: 0.6,
			expected:     true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config := ConsensusConfig{}
			if tt.minAgreement > 0 {
				config.MinAgreement = tt.minAgreement
			}
			engine := NewConsensusEngine(config, agent.NewRegistry())
			result := engine.isConsensusReached(tt.approvalRate, tt.algorithm)
			if result != tt.expected {
				t.Errorf("Expected %v for %s with approval rate %.2f, got %v",
					tt.expected, tt.algorithm, tt.approvalRate, result)
			}
		})
	}
}

func TestInferEvaluationFromText(t *testing.T) {
	engine := NewConsensusEngine(ConsensusConfig{}, agent.NewRegistry())

	tests := []struct {
		name     string
		text     string
		expected bool
	}{
		{
			name:     "Explicit approve",
			text:     "I approve this proposal. It looks good.",
			expected: true,
		},
		{
			name:     "Explicit reject",
			text:     "I reject this proposal. It has issues.",
			expected: false,
		},
		{
			name:     "Positive language",
			text:     "This looks excellent, great work!",
			expected: true,
		},
		{
			name:     "Negative language",
			text:     "This is poor quality, needs major changes.",
			expected: false,
		},
		{
			name:     "Mixed leans positive",
			text:     "There are a few concerns, but overall this is excellent and good.",
			expected: true,
		},
		{
			name:     "Mixed leans negative",
			text:     "There are issues, problems, and it's poor quality overall.",
			expected: false, // "poor" and "problems" count as 2 negatives vs 0 positives
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := engine.inferEvaluationFromText(tt.text)
			if result != tt.expected {
				t.Errorf("Expected %v for text: %q, got %v", tt.expected, tt.text, result)
			}
		})
	}
}

func TestCalculateAgentWeight(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	// Test different agent types
	tests := []struct {
		name         string
		agentType    agent.AgentType
		expectedBase float64
	}{
		{
			name:         "Architect weight",
			agentType:    agent.AgentTypeArchitect,
			expectedBase: 1.5,
		},
		{
			name:         "Reviewer weight",
			agentType:    agent.AgentTypeReviewer,
			expectedBase: 1.3,
		},
		{
			name:         "Orchestrator weight",
			agentType:    agent.AgentTypeOrchestrator,
			expectedBase: 1.2,
		},
		{
			name:         "Coder weight",
			agentType:    agent.AgentTypeCoder,
			expectedBase: 1.0,
		},
		{
			name:         "Tester weight",
			agentType:    agent.AgentTypeTester,
			expectedBase: 1.0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			a := agent.NewAgent("test", tt.agentType)
			weight := engine.calculateAgentWeight(a)
			if weight != tt.expectedBase {
				t.Errorf("Expected weight %.1f for %s, got %.1f", tt.expectedBase, tt.agentType, weight)
			}
		})
	}
}

func TestCastEvaluation(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	task := NewTask("Test Task", "Test description", acp.Prompt{})

	ctx := context.Background()
	engine.Start(ctx)
	defer engine.Stop()

	// Evaluate the task
	go func() {
		_, err := engine.EvaluateTask(ctx, task, ConsensusQueenBee)
		if err != nil {
			t.Logf("EvaluateTask error: %v", err)
		}
	}()

	// Give it a moment to start
	time.Sleep(100 * time.Millisecond)

	// Cast an external evaluation
	evaluation := Evaluation{
		AgentID:  "external-agent",
		Approved: true,
		Comment:  "Looks good to me",
		Weight:   1.0,
	}

	err := engine.CastEvaluation(task.ID, evaluation)
	if err != nil {
		t.Fatalf("CastEvaluation failed: %v", err)
	}

	// Check that evaluation was recorded
	active, ok := engine.GetTask(task.ID)
	if !ok {
		t.Fatal("Task should exist")
	}

	if len(active.Evaluations) != 1 {
		t.Errorf("Expected 1 evaluation, got %d", len(active.Evaluations))
	}

	recordedEval := active.Evaluations["external-agent"]
	if recordedEval.Approved != true {
		t.Error("Expected evaluation to be approved")
	}
	if recordedEval.Comment != "Looks good to me" {
		t.Errorf("Expected comment mismatch")
	}
}

// Test backward compatibility with CastVote
func TestCastVoteBackwardCompatibility(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	task := NewTask("Test Task", "Test description", acp.Prompt{})

	ctx := context.Background()
	engine.Start(ctx)
	defer engine.Stop()

	// Evaluate the task
	go func() {
		_, err := engine.EvaluateTask(ctx, task, ConsensusQueenBee)
		if err != nil {
			t.Logf("EvaluateTask error: %v", err)
		}
	}()

	// Give it a moment to start
	time.Sleep(100 * time.Millisecond)

	// Cast an external vote (backward compatibility)
	vote := Vote{
		AgentID: "external-agent",
		Approve: true,
		Comment: "Looks good to me",
		Weight:  1.0,
	}

	err := engine.CastVote(task.ID, vote)
	if err != nil {
		t.Fatalf("CastVote failed: %v", err)
	}

	// Check that vote was recorded
	active, ok := engine.GetTask(task.ID)
	if !ok {
		t.Fatal("Task should exist")
	}

	if len(active.Evaluations) != 1 {
		t.Errorf("Expected 1 evaluation, got %d", len(active.Evaluations))
	}

	recordedEval := active.Evaluations["external-agent"]
	if recordedEval.Approved != true {
		t.Error("Expected evaluation to be approved")
	}
	if recordedEval.Comment != "Looks good to me" {
		t.Errorf("Expected comment mismatch")
	}
}

func TestCastEvaluationNonExistentTask(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	ctx := context.Background()
	engine.Start(ctx)
	defer engine.Stop()

	evaluation := Evaluation{
		AgentID:  "external-agent",
		Approved: true,
	}

	err := engine.CastEvaluation("non-existent-task", evaluation)
	if err == nil {
		t.Error("Expected error for non-existent task")
	}
	if !strings.Contains(err.Error(), "task not found") {
		t.Errorf("Expected 'task not found' error, got: %v", err)
	}
}

func TestGetActiveTasks(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	// Add 2 active tasks
	for i := 0; i < 2; i++ {
		task := NewTask("Test Task", "Test", acp.Prompt{})
		active := &ActiveTaskEvaluation{
			Task:        task,
			Evaluations: make(map[string]Evaluation),
			Completed:   false,
		}
		engine.activeTasks[string(rune('a'+i))] = active
	}

	// Add 1 completed task
	completedTask := NewTask("Completed Task", "Test", acp.Prompt{})
	completed := &ActiveTaskEvaluation{
		Task:        completedTask,
		Evaluations: make(map[string]Evaluation),
		Completed:   true,
	}
	engine.activeTasks["completed"] = completed

	active := engine.GetActiveTasks()
	if len(active) != 2 {
		t.Errorf("Expected 2 active tasks, got %d", len(active))
	}
}

// Test backward compatibility with GetActiveProposals
func TestGetActiveProposalsBackwardCompatibility(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	// Add 2 active tasks
	for i := 0; i < 2; i++ {
		task := NewTask("Test Task", "Test", acp.Prompt{})
		active := &ActiveTaskEvaluation{
			Task:        task,
			Evaluations: make(map[string]Evaluation),
			Completed:   false,
		}
		engine.activeTasks[string(rune('a'+i))] = active
	}

	// Add 1 completed task
	completedTask := NewTask("Completed Task", "Test", acp.Prompt{})
	completed := &ActiveTaskEvaluation{
		Task:        completedTask,
		Evaluations: make(map[string]Evaluation),
		Completed:   true,
	}
	engine.activeTasks["completed"] = completed

	active := engine.GetActiveProposals()
	if len(active) != 2 {
		t.Errorf("Expected 2 active proposals, got %d", len(active))
	}
}

func TestOnTaskEvaluationStartedCallback(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	var mu sync.Mutex
	var receivedTask *Task
	engine.OnTaskEvaluationStarted(func(task *Task) {
		mu.Lock()
		receivedTask = task
		mu.Unlock()
	})

	task := NewTask("Test Task", "Test", acp.Prompt{})

	ctx := context.Background()
	engine.Start(ctx)
	defer engine.Stop()

	go engine.EvaluateTask(ctx, task, ConsensusQueenBee)

	// Wait for callback with proper synchronization
	var gotTask *Task
	for i := 0; i < 10; i++ {
		mu.Lock()
		gotTask = receivedTask
		mu.Unlock()
		if gotTask != nil {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}

	if gotTask == nil {
		t.Fatal("Expected to receive task in callback")
	}
	if gotTask.ID != task.ID {
		t.Errorf("Expected task ID %s, got %s", task.ID, gotTask.ID)
	}
}

// Test backward compatibility with OnProposalCreated
func TestOnProposalCreatedBackwardCompatibility(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	var mu sync.Mutex
	var receivedTask *Task
	engine.OnProposalCreated(func(task *Task) {
		mu.Lock()
		receivedTask = task
		mu.Unlock()
	})

	task := NewTask("Test Task", "Test", acp.Prompt{})

	ctx := context.Background()
	engine.Start(ctx)
	defer engine.Stop()

	go engine.CreateProposal(ctx, task, ConsensusQueenBee)

	// Wait for callback with proper synchronization
	var gotTask *Task
	for i := 0; i < 10; i++ {
		mu.Lock()
		gotTask = receivedTask
		mu.Unlock()
		if gotTask != nil {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}

	if gotTask == nil {
		t.Fatal("Expected to receive task in callback")
	}
	if gotTask.ID != task.ID {
		t.Errorf("Expected task ID %s, got %s", task.ID, gotTask.ID)
	}
}

func TestOnEvaluationReceivedCallback(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	var mu sync.Mutex
	var receivedTaskID string
	var receivedEval Evaluation
	engine.OnEvaluationReceived(func(taskID string, eval Evaluation) {
		mu.Lock()
		receivedTaskID = taskID
		receivedEval = eval
		mu.Unlock()
	})

	task := NewTask("Test Task", "Test", acp.Prompt{})

	ctx := context.Background()
	engine.Start(ctx)
	defer engine.Stop()

	go engine.EvaluateTask(ctx, task, ConsensusQueenBee)

	// Give it a moment to start
	time.Sleep(100 * time.Millisecond)

	// Cast an evaluation to trigger callback
	eval := Evaluation{
		AgentID:  "test-agent",
		Approved: true,
		Comment:  "Test comment",
	}
	err := engine.CastEvaluation(task.ID, eval)
	if err != nil {
		t.Fatalf("CastEvaluation failed: %v", err)
	}

	// Wait for callback with proper synchronization
	var gotTaskID string
	var gotEval Evaluation
	for i := 0; i < 10; i++ {
		mu.Lock()
		gotTaskID = receivedTaskID
		gotEval = receivedEval
		mu.Unlock()
		if gotTaskID != "" {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}

	if gotTaskID != task.ID {
		t.Errorf("Expected task ID %s, got %s", task.ID, gotTaskID)
	}
	if gotEval.AgentID != "test-agent" {
		t.Errorf("Expected agent ID 'test-agent', got %s", gotEval.AgentID)
	}
	if gotEval.Approved != true {
		t.Error("Expected approved to be true")
	}
}

// Test backward compatibility with OnVoteReceived
func TestOnVoteReceivedBackwardCompatibility(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	var mu sync.Mutex
	var receivedTaskID string
	var receivedVote Vote
	engine.OnVoteReceived(func(taskID string, vote Vote) {
		mu.Lock()
		receivedTaskID = taskID
		receivedVote = vote
		mu.Unlock()
	})

	task := NewTask("Test Task", "Test", acp.Prompt{})

	ctx := context.Background()
	engine.Start(ctx)
	defer engine.Stop()

	go engine.EvaluateTask(ctx, task, ConsensusQueenBee)

	// Give it a moment to start
	time.Sleep(100 * time.Millisecond)

	// Cast a vote to trigger callback
	vote := Vote{
		AgentID: "test-agent",
		Approve: true,
		Comment: "Test comment",
	}
	err := engine.CastVote(task.ID, vote)
	if err != nil {
		t.Fatalf("CastVote failed: %v", err)
	}

	// Wait for callback with proper synchronization
	var gotTaskID string
	var gotVote Vote
	for i := 0; i < 10; i++ {
		mu.Lock()
		gotTaskID = receivedTaskID
		gotVote = receivedVote
		mu.Unlock()
		if gotTaskID != "" {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}

	if gotTaskID != task.ID {
		t.Errorf("Expected task ID %s, got %s", task.ID, gotTaskID)
	}
	if gotVote.AgentID != "test-agent" {
		t.Errorf("Expected agent ID 'test-agent', got %s", gotVote.AgentID)
	}
	if gotVote.Approve != true {
		t.Error("Expected approved to be true")
	}
}

func TestOnConsensusReachedCallback(t *testing.T) {
	registry := agent.NewRegistry()
	for i := 0; i < 3; i++ {
		a := agent.NewAgent(fmt.Sprintf("agent-%d", i), agent.AgentTypeCoder)
		registry.Register(a)
	}

	engine := NewConsensusEngine(ConsensusConfig{
		MinAgreement:   0.5,
		DefaultTimeout: 2 * time.Second,
	}, registry)

	resultCh := make(chan *ConsensusResult, 1)
	engine.OnConsensusReached(func(result *ConsensusResult) {
		resultCh <- result
	})

	task := NewTask("Test Task", "Test", acp.Prompt{})

	ctx := context.Background()
	err := engine.Start(ctx)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer engine.Stop()

	go func() {
		_, _ = engine.EvaluateTask(ctx, task, ConsensusSimpleMajority)
	}()

	select {
	case receivedResult := <-resultCh:
		if receivedResult == nil {
			t.Fatal("Expected non-nil consensus result in callback")
		}
		if receivedResult.TaskID != task.ID {
			t.Errorf("Expected task ID %s, got %s", task.ID, receivedResult.TaskID)
		}
		if receivedResult.Status == "" {
			t.Error("Expected non-empty consensus status")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Timed out waiting for consensus callback")
	}
}

func TestOnTimeoutCallback(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{
		DefaultTimeout: 500 * time.Millisecond,
	}, registry)

	var timedOutTaskID string
	engine.OnTimeout(func(taskID string) {
		timedOutTaskID = taskID
	})

	task := NewTask("Test Task", "Test", acp.Prompt{})

	ctx := context.Background()
	err := engine.Start(ctx)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer engine.Stop()

	// Insert an overdue task directly and force timeout processing.
	engine.mu.Lock()
	engine.activeTasks[task.ID] = &ActiveTaskEvaluation{
		Task:        task,
		Evaluations: make(map[string]Evaluation),
		Algorithm:   ConsensusQueenBee,
		Deadline:    time.Now().Add(-1 * time.Second),
		EvalChannel: make(chan Evaluation, 1),
	}
	engine.mu.Unlock()

	engine.checkTimeouts()

	if timedOutTaskID != task.ID {
		t.Errorf("Expected timeout for task %s, got %s", task.ID, timedOutTaskID)
	}

	active, ok := engine.GetTask(task.ID)
	if !ok {
		t.Fatal("Task should still exist")
	}
	if active.Completed != true {
		t.Error("Task should be marked as completed after timeout")
	}
}

func TestGetTaskNotFound(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	task, ok := engine.GetTask("non-existent")
	if ok {
		t.Error("Expected ok to be false for non-existent task")
	}
	if task != nil {
		t.Error("Task should be nil for non-existent")
	}
}

// Test backward compatibility with GetProposal
func TestGetProposalBackwardCompatibility(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	proposal, ok := engine.GetProposal("non-existent")
	if ok {
		t.Error("Expected ok to be false for non-existent proposal")
	}
	if proposal != nil {
		t.Error("Proposal should be nil for non-existent")
	}
}

func TestGetActiveTasksEmpty(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	tasks := engine.GetActiveTasks()
	if len(tasks) != 0 {
		t.Errorf("Expected 0 active tasks, got %d", len(tasks))
	}
}

func TestActiveTaskEvaluationStruct(t *testing.T) {
	task := NewTask("Test Task", "Test description", acp.Prompt{})
	active := &ActiveTaskEvaluation{
		Task:        task,
		Evaluations: make(map[string]Evaluation),
		Algorithm:   ConsensusQueenBee,
		Deadline:    time.Now().Add(1 * time.Minute),
		Completed:   false,
	}

	if active.Task.ID != task.ID {
		t.Error("Task ID mismatch")
	}
	if active.Algorithm != ConsensusQueenBee {
		t.Error("Algorithm mismatch")
	}
	if active.Completed != false {
		t.Error("Completed should be false")
	}
}

func TestEvaluationStruct(t *testing.T) {
	eval := Evaluation{
		AgentID:    "test-agent",
		Approved:   true,
		Confidence: 0.9,
		Comment:    "Looks good",
		Weight:     1.5,
	}

	if eval.AgentID != "test-agent" {
		t.Error("AgentID mismatch")
	}
	if eval.Approved != true {
		t.Error("Approved should be true")
	}
	if eval.Confidence != 0.9 {
		t.Error("Confidence mismatch")
	}
	if eval.Comment != "Looks good" {
		t.Error("Comment mismatch")
	}
	if eval.Weight != 1.5 {
		t.Error("Weight mismatch")
	}
}

func TestCanReachEarlyConsensus(t *testing.T) {
	registry := agent.NewRegistry()
	for i := 0; i < 10; i++ { // 10 agents total
		a := agent.NewAgent(fmt.Sprintf("agent-%d", i), agent.AgentTypeCoder)
		registry.Register(a)
	}

	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	tests := []struct {
		name          string
		algorithm     ConsensusAlgorithm
		currentVotes  int
		approvedVotes float64
		expected      bool
	}{
		{
			name:          "Unanimity with 9/10 votes can't reach early",
			algorithm:     ConsensusUnanimity,
			currentVotes:  9,
			approvedVotes: 9.0,
			expected:      false,
		},
		{
			name:          "Unanimity with 10/10 votes can reach early",
			algorithm:     ConsensusUnanimity,
			currentVotes:  10,
			approvedVotes: 10.0,
			expected:      true,
		},
		{
			name:          "Simple majority with 6/10 approved cannot reach early yet",
			algorithm:     ConsensusSimpleMajority,
			currentVotes:  6,
			approvedVotes: 6.0,
			expected:      false, // 60% < 50% + 4/10 = 90% threshold
		},
		{
			name:          "Simple majority with 8/10 approved can reach early",
			algorithm:     ConsensusSimpleMajority,
			currentVotes:  8,
			approvedVotes: 8.0,
			expected:      true, // 80% > 50% + 2/10 = 20% → 80% > 70% → yes
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			active := &ActiveTaskEvaluation{
				Algorithm:   tt.algorithm,
				Evaluations: make(map[string]Evaluation),
			}

			// Add approved votes
			for i := 0; i < int(tt.approvedVotes); i++ {
				active.Evaluations[fmt.Sprintf("approve-%d", i)] = Evaluation{
					AgentID:  fmt.Sprintf("approve-%d", i),
					Approved: true,
					Weight:   1.0,
				}
			}

			// Add rejected votes
			rejected := tt.currentVotes - int(tt.approvedVotes)
			for i := 0; i < rejected; i++ {
				active.Evaluations[fmt.Sprintf("reject-%d", i)] = Evaluation{
					AgentID:  fmt.Sprintf("reject-%d", i),
					Approved: false,
					Weight:   1.0,
				}
			}

			result := engine.canReachEarlyConsensus(active)
			if result != tt.expected {
				t.Errorf("Expected %v, got %v", tt.expected, result)
			}
		})
	}
}

func TestCountEvaluations(t *testing.T) {
	engine := NewConsensusEngine(ConsensusConfig{}, agent.NewRegistry())

	evaluations := map[string]Evaluation{
		"agent-1": {Approved: true, Weight: 1.0},
		"agent-2": {Approved: true, Weight: 1.5},
		"agent-3": {Approved: false, Weight: 1.0},
		"agent-4": {Approved: true, Weight: 0.5},
	}

	approved, total := engine.countEvaluations(evaluations)

	expectedApproved := 1.0 + 1.5 + 0.5    // 3.0
	expectedTotal := 1.0 + 1.5 + 1.0 + 0.5 // 4.0

	if approved != expectedApproved {
		t.Errorf("Expected approved %.1f, got %.1f", expectedApproved, approved)
	}
	if total != expectedTotal {
		t.Errorf("Expected total %.1f, got %.1f", expectedTotal, total)
	}
}

func TestCountEvaluationsEmpty(t *testing.T) {
	engine := NewConsensusEngine(ConsensusConfig{}, agent.NewRegistry())

	evaluations := map[string]Evaluation{}

	approved, total := engine.countEvaluations(evaluations)

	if approved != 0 {
		t.Errorf("Expected approved 0, got %.1f", approved)
	}
	if total != 1 { // Should avoid division by zero
		t.Errorf("Expected total 1, got %.1f", total)
	}
}

func TestQueenBeeModelDefault(t *testing.T) {
	registry := agent.NewRegistry()
	engine := NewConsensusEngine(ConsensusConfig{}, registry)

	// Default algorithm should be Queen Bee
	if engine.config.DefaultAlgorithm != ConsensusQueenBee {
		t.Errorf("Expected default algorithm %s, got %s", ConsensusQueenBee, engine.config.DefaultAlgorithm)
	}

	// Queen Bee should use min agreement threshold
	result := engine.isConsensusReached(0.7, ConsensusQueenBee)
	if result != true { // Default min agreement is 0.51
		t.Error("Expected 70% to pass Queen Bee consensus")
	}

	result = engine.isConsensusReached(0.5, ConsensusQueenBee)
	if result != false {
		t.Error("Expected 50% to fail Queen Bee consensus")
	}
}
