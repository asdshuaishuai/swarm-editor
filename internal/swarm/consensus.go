// Package swarm implements consensus mechanisms for multi-agent coordination
// Using Queen Bee model: Coordinator evaluates task results instead of voting
package swarm

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
	"github.com/swarm-editor/swarm-editor/internal/log"
)

var consensusLog = log.With("component", "Consensus")

// ConsensusAlgorithm defines the type of consensus algorithm
type ConsensusAlgorithm string

const (
	// ConsensusSimpleMajority requires >50% approval
	ConsensusSimpleMajority ConsensusAlgorithm = "simple_majority"
	// ConsensusSupermajority requires 2/3 approval
	ConsensusSupermajority ConsensusAlgorithm = "supermajority"
	// ConsensusUnanimity requires 100% approval
	ConsensusUnanimity ConsensusAlgorithm = "unanimity"
	// ConsensusWeighted uses weighted voting based on agent capabilities
	ConsensusWeighted ConsensusAlgorithm = "weighted"
	// ConsensusByzantine uses Byzantine fault tolerance
	ConsensusByzantine ConsensusAlgorithm = "byzantine"
	// ConsensusQueenBee uses Queen Bee model - coordinator evaluates results
	ConsensusQueenBee ConsensusAlgorithm = "queen_bee"

	// taskCleanupDelay is how long to keep completed task results before cleanup
	taskCleanupDelay = 5 * time.Minute
)

// ConsensusEngine manages task result evaluation using Queen Bee model
type ConsensusEngine struct {
	mu sync.RWMutex

	config        ConsensusConfig
	agentRegistry *agent.Registry
	activeTasks   map[string]*ActiveTaskEvaluation
	running       bool

	// Callbacks
	onTaskEvaluationStarted func(task *Task)
	onEvaluationReceived    func(taskID string, evaluation Evaluation)
	onConsensusReached      func(result *ConsensusResult)
	onTimeout               func(taskID string)

	ctx    context.Context
	cancel context.CancelFunc

	// WaitGroups for tracking goroutines
	monitorWg sync.WaitGroup // Tracks monitor loop goroutine
	cleanupWg sync.WaitGroup // Tracks cleanup goroutines
}

// ConsensusConfig configures the consensus engine
type ConsensusConfig struct {
	DefaultAlgorithm ConsensusAlgorithm `json:"defaultAlgorithm"`
	DefaultTimeout   time.Duration      `json:"defaultTimeout"`
	MinAgreement     float64            `json:"minAgreement"` // 0.0-1.0
	MaxRetries       int                `json:"maxRetries"`
	EvaluationDelay  time.Duration      `json:"evaluationDelay"` // Delay before collecting evaluations

	// Byzantine fault tolerance settings
	ByzantineMaxFaults int `json:"byzantineMaxFaults"` // Max faulty nodes tolerated
}

// ActiveTaskEvaluation tracks an active task evaluation
type ActiveTaskEvaluation struct {
	Task             *Task
	Evaluations      map[string]Evaluation
	Algorithm        ConsensusAlgorithm
	Deadline         time.Time
	Completed        bool
	Result           *ConsensusResult
	EvalChannel      chan Evaluation
	cleanupScheduled bool      // Internal flag to prevent duplicate cleanup goroutines
	closeOnce        sync.Once // Ensures EvalChannel is closed exactly once

	// ExpectedEvaluationCount is the number of agents asked to evaluate this task.
	// Used for ConsensusUnanimity to determine when all participating agents have voted.
	ExpectedEvaluationCount int
}

// Evaluation represents an agent's evaluation of a task result
type Evaluation struct {
	AgentID    string  `json:"agentId"`
	Approved   bool    `json:"approved"`
	Confidence float64 `json:"confidence"`
	Comment    string  `json:"comment,omitempty"`
	Weight     float64 `json:"weight,omitempty"`
}

// NewConsensusEngine creates a new consensus engine
func NewConsensusEngine(config ConsensusConfig, registry *agent.Registry) *ConsensusEngine {
	if config.DefaultTimeout == 0 {
		config.DefaultTimeout = 30 * time.Second
	}
	if config.DefaultAlgorithm == "" {
		config.DefaultAlgorithm = ConsensusQueenBee
	}
	if config.MinAgreement == 0 {
		config.MinAgreement = 0.51
	}

	return &ConsensusEngine{
		config:        config,
		agentRegistry: registry,
		activeTasks:   make(map[string]*ActiveTaskEvaluation),
	}
}

// Start starts the consensus engine
func (e *ConsensusEngine) Start(ctx context.Context) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.running {
		return fmt.Errorf("consensus engine is already running")
	}

	e.ctx, e.cancel = context.WithCancel(ctx)
	e.running = true

	e.monitorWg.Add(1)
	go e.taskMonitorLoop()
	return nil
}

// Stop stops the consensus engine
func (e *ConsensusEngine) Stop() {
	e.mu.Lock()
	if !e.running {
		e.mu.Unlock()
		return
	}
	e.running = false
	if e.cancel != nil {
		e.cancel()
	}
	e.mu.Unlock()

	// Wait for all goroutines to finish (monitor loop + cleanup goroutines)
	e.monitorWg.Wait()
	e.cleanupWg.Wait()
}

// EvaluateTask creates a new task evaluation request (Queen Bee model)
// The coordinator evaluates task results instead of voting on proposals
func (e *ConsensusEngine) EvaluateTask(ctx context.Context, task *Task, algorithm ConsensusAlgorithm) (*ConsensusResult, error) {
	if task == nil {
		return nil, fmt.Errorf("task cannot be nil")
	}
	if algorithm == "" {
		algorithm = e.config.DefaultAlgorithm
	}

	e.mu.Lock()
	active := &ActiveTaskEvaluation{
		Task:        task,
		Evaluations: make(map[string]Evaluation),
		Algorithm:   algorithm,
		Deadline:    time.Now().Add(e.config.DefaultTimeout),
		EvalChannel: make(chan Evaluation, 100),
	}
	e.activeTasks[task.ID] = active
	onStarted := e.onTaskEvaluationStarted
	e.mu.Unlock()

	if onStarted != nil {
		onStarted(task)
	}

	// Collect evaluations from agents (tracked for graceful shutdown)
	e.cleanupWg.Add(1)
	go e.collectEvaluations(active)

	// Wait for result or timeout
	result, err := e.waitForConsensus(ctx, active)

	return result, err
}

// CreateProposal is kept for backward compatibility, delegates to EvaluateTask
func (e *ConsensusEngine) CreateProposal(ctx context.Context, task *Task, algorithm ConsensusAlgorithm) (*ConsensusResult, error) {
	return e.EvaluateTask(ctx, task, algorithm)
}

// collectEvaluations collects evaluations from all available agents
func (e *ConsensusEngine) collectEvaluations(active *ActiveTaskEvaluation) {
	defer e.cleanupWg.Done()
	defer func() {
		if r := recover(); r != nil {
			consensusLog.Error("collectEvaluations panic", "task_id", active.Task.ID, "panic", r)
		}
	}()

	agents := e.agentRegistry.GetIdle()
	if len(agents) == 0 {
		agents = e.agentRegistry.GetAll()
	}

	// Record the number of agents that will be asked to evaluate.
	// This is used by ConsensusUnanimity to determine when all participating agents
	// have voted, rather than using e.agentRegistry.Count() which includes
	// disconnected/inactive agents that will never submit an evaluation.
	e.mu.Lock()
	active.ExpectedEvaluationCount = len(agents)
	e.mu.Unlock()

	// If no agents are available, we cannot collect evaluations - return early
	// to prevent deadlock (wg.Wait() would block forever if no goroutines spawned)
	if len(agents) == 0 {
		consensusLog.Warn("No agents available for evaluation", "task_id", active.Task.ID)
		return
	}

	// Give agents time to review the task result, respecting context cancellation
	if e.config.EvaluationDelay > 0 {
		e.mu.RLock()
		engineCtx := e.ctx
		e.mu.RUnlock()

		delayTimer := time.NewTimer(e.config.EvaluationDelay)
		defer delayTimer.Stop()

		if engineCtx != nil {
			select {
			case <-delayTimer.C:
			case <-engineCtx.Done():
				return
			}
		} else {
			<-delayTimer.C
		}
	}

	var wg sync.WaitGroup
	for _, a := range agents {
		wg.Add(1)
		go func(ag *agent.Agent) {
			defer wg.Done()
			defer func() {
				if r := recover(); r != nil {
					consensusLog.Error("Evaluation goroutine panic", "agent_id", ag.ID, "panic", r)
				}
			}()
			evaluation := e.evaluateTaskResult(ag, active.Task)

			// Record evaluation with proper locking
			e.mu.Lock()
			if !active.Completed {
				active.Evaluations[evaluation.AgentID] = evaluation
				onReceived := e.onEvaluationReceived
				earlyConsensus := e.canReachEarlyConsensus(active)
				e.mu.Unlock()

				// Fire callback outside lock
				if onReceived != nil {
					onReceived(active.Task.ID, evaluation)
				}

				if earlyConsensus {
					e.mu.Lock()
					onConsensus := e.finalizeConsensus(active)
					e.mu.Unlock()
					if onConsensus != nil && active.Result != nil {
						onConsensus(active.Result)
					}
				}
				return
			}
			e.mu.Unlock()
		}(a)
	}

	wg.Wait()
}

// evaluateTaskResult evaluates a task result from an agent's perspective (Queen Bee model)
// Instead of voting on proposals, agents evaluate task execution results
func (e *ConsensusEngine) evaluateTaskResult(a *agent.Agent, task *Task) Evaluation {
	// Create evaluation prompt for the agent
	evalPrompt := acp.Prompt{
		{Type: "text", Text: e.buildEvaluationPrompt(task)},
	}

	// Execute evaluation using engine's context for proper cancellation
	e.mu.RLock()
	engineCtx := e.ctx
	e.mu.RUnlock()

	var ctx context.Context
	var cancel context.CancelFunc
	if engineCtx != nil {
		ctx, cancel = context.WithTimeout(engineCtx, 10*time.Second)
	} else {
		ctx, cancel = context.WithTimeout(context.Background(), 10*time.Second)
	}
	defer cancel()

	result, err := a.Execute(ctx, evalPrompt)
	if err != nil {
		return Evaluation{
			AgentID:  string(a.ID),
			Approved: false,
			Comment:  fmt.Sprintf("Evaluation failed: %v", err),
			Weight:   e.calculateAgentWeight(a),
		}
	}

	// Parse the agent's response to determine evaluation
	return e.parseAgentEvaluation(a, result, task)
}

// buildEvaluationPrompt creates a prompt for agents to evaluate a task result
func (e *ConsensusEngine) buildEvaluationPrompt(task *Task) string {
	resultInfo := "No result available"
	if task.Result != nil {
		resultInfo = fmt.Sprintf("Content: %s\nFiles Changed: %v\nDuration: %v",
			task.Result.Content, task.Result.FilesChanged, task.Result.Duration)
		if task.Result.Error != "" {
			resultInfo += fmt.Sprintf("\nError: %s", task.Result.Error)
		}
	}

	return fmt.Sprintf(`You are asked to evaluate the result of the following task.

Title: %s
Description: %s

Task Result:
%s

Please analyze this task result and respond with your evaluation in the following JSON format:
{
  "approved": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of your evaluation"
}

Consider:
1. Completeness - Was the task completed successfully?
2. Quality - Does the result meet our standards?
3. Correctness - Are there any errors or issues?
4. Efficiency - Was the task executed efficiently?

Provide your honest assessment.`, task.Title, task.Description, resultInfo)
}

// parseAgentEvaluation parses the agent's response into an evaluation
func (e *ConsensusEngine) parseAgentEvaluation(a *agent.Agent, result *agent.ExecutionResult, task *Task) Evaluation {
	evaluation := Evaluation{
		AgentID: string(a.ID),
		Weight:  e.calculateAgentWeight(a),
	}

	// Try to parse JSON response
	var response struct {
		Approved   bool    `json:"approved"`
		Confidence float64 `json:"confidence"`
		Reasoning  string  `json:"reasoning"`
	}

	// Use Output field from ExecutionResult
	textContent := result.Output

	if err := json.Unmarshal([]byte(textContent), &response); err != nil {
		// If JSON parsing fails, try to infer from text
		evaluation.Approved = e.inferEvaluationFromText(textContent)
		evaluation.Comment = "Evaluation inferred from text response"
	} else {
		evaluation.Approved = response.Approved
		evaluation.Confidence = response.Confidence
		evaluation.Comment = response.Reasoning
		// Adjust weight based on confidence
		if response.Confidence > 0 {
			evaluation.Weight *= response.Confidence
		}
	}

	return evaluation
}

// inferEvaluationFromText attempts to infer an evaluation from unstructured text
func (e *ConsensusEngine) inferEvaluationFromText(text string) bool {
	// Empty or whitespace-only text defaults to reject (not approve)
	if strings.TrimSpace(text) == "" {
		return false
	}

	// Simple heuristic: look for positive/negative indicators
	positiveIndicators := []string{"approved", "accept", "yes", "agree", "good", "excellent", "complete", "success"}
	negativeIndicators := []string{"reject", "deny", "disagree", "bad", "poor", "incomplete", "fail"}

	textLower := strings.ToLower(text)
	positiveCount := 0
	negativeCount := 0

	for _, indicator := range positiveIndicators {
		if strings.Contains(textLower, indicator) {
			positiveCount++
		}
	}

	for _, indicator := range negativeIndicators {
		if strings.Contains(textLower, indicator) {
			negativeCount++
		}
	}

	return positiveCount >= negativeCount
}

// calculateAgentWeight calculates evaluation weight for an agent
func (e *ConsensusEngine) calculateAgentWeight(a *agent.Agent) float64 {
	baseWeight := 1.0

	// Adjust weight based on agent type
	switch a.Type {
	case agent.AgentTypeArchitect:
		baseWeight = 1.5 // Architects have more weight for design decisions
	case agent.AgentTypeReviewer:
		baseWeight = 1.3 // Reviewers have more weight for quality decisions
	case agent.AgentTypeOrchestrator:
		baseWeight = 1.2 // Orchestrators have slightly more weight
	}

	// Consider tool history success rate
	history := a.GetToolHistory()
	if len(history) > 0 {
		successCount := 0
		for _, exec := range history {
			if exec.Status == acp.StatusCompleted {
				successCount++
			}
		}
		successRate := float64(successCount) / float64(len(history))
		baseWeight *= (0.5 + 0.5*successRate) // Scale between 0.5 and 1.0
	}

	return baseWeight
}

// recordEvaluation records an evaluation for a task.
// Note: This function assumes the caller holds the lock.
// Returns callbacks to fire after the lock is released.
func (e *ConsensusEngine) recordEvaluation(active *ActiveTaskEvaluation, evaluation Evaluation) (func(string, Evaluation), func(*ConsensusResult)) {
	if active.Completed {
		return nil, nil // Task already completed
	}

	active.Evaluations[evaluation.AgentID] = evaluation

	onReceived := e.onEvaluationReceived
	onConsensus := e.canReachEarlyConsensus(active)

	if onConsensus {
		cb := e.finalizeConsensus(active)
		return onReceived, cb
	}

	return onReceived, nil
}

// canReachEarlyConsensus checks if consensus can be determined before timeout
func (e *ConsensusEngine) canReachEarlyConsensus(active *ActiveTaskEvaluation) bool {
	// For unanimity, we need all evaluations from participating agents.
	// Use ExpectedEvaluationCount (agents actually asked to evaluate) rather
	// than e.agentRegistry.Count() (total registered agents including disconnected).
	if active.Algorithm == ConsensusUnanimity {
		// Use ExpectedEvaluationCount when available (set by RequestConsensus).
		// Fallback to registry count for backward compatibility (e.g., tests).
		expectedCount := active.ExpectedEvaluationCount
		if expectedCount == 0 {
			expectedCount = e.agentRegistry.Count()
		}
		if expectedCount == 0 {
			return false // No agents to evaluate
		}
		return len(active.Evaluations) >= expectedCount
	}

	// For weighted algorithms, check if remaining evaluations can't change outcome
	totalAgents := e.agentRegistry.Count()
	if totalAgents == 0 {
		return false // No agents to evaluate
	}

	remainingEvals := totalAgents - len(active.Evaluations)
	if remainingEvals == 0 {
		return true
	}

	// Use weight-based calculation consistent with finalizeConsensus
	approved, totalWeight := e.countEvaluations(active.Evaluations)
	if totalWeight == 0 {
		return false
	}
	approvalRate := approved / totalWeight

	// Max remaining weight: assume all remaining agents have max weight (1.5)
	const maxAgentWeight = 1.5
	maxRemainingWeight := float64(remainingEvals) * maxAgentWeight
	maxTotalWeight := totalWeight + maxRemainingWeight

	// Worst case: all remaining agents reject with max weight
	worstCaseRate := approved / maxTotalWeight
	// Best case: all remaining agents approve with max weight
	bestCaseRate := (approved + maxRemainingWeight) / maxTotalWeight

	// Check if remaining evaluations could swing the decision
	switch active.Algorithm {
	case ConsensusSimpleMajority:
		// Even if all remaining reject, still above 50%
		if worstCaseRate > 0.5 {
			return true
		}
		// Even if all remaining approve, still below 50%
		if bestCaseRate <= 0.5 {
			return true
		}
	case ConsensusSupermajority:
		if worstCaseRate >= 0.667 {
			return true
		}
		if bestCaseRate < 0.667 {
			return true
		}
	case ConsensusWeighted:
		threshold := e.config.MinAgreement
		if worstCaseRate >= threshold {
			return true
		}
		if bestCaseRate < threshold {
			return true
		}
	case ConsensusByzantine:
		if worstCaseRate >= 0.667 {
			return true
		}
		if bestCaseRate < 0.667 {
			return true
		}
	case ConsensusQueenBee:
		// Queen Bee model: coordinator decision can be final
		if approvalRate >= e.config.MinAgreement {
			return true
		}
	}

	return false
}

// waitForConsensus waits for consensus to be reached or timeout.
// Uses EvalChannel (closed by finalizeConsensus) instead of polling.
func (e *ConsensusEngine) waitForConsensus(ctx context.Context, active *ActiveTaskEvaluation) (*ConsensusResult, error) {
	timeout := time.Until(active.Deadline)
	if timeout <= 0 {
		timeout = time.Second
	}

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Wait for EvalChannel close (signals consensus finalized) or context timeout
	select {
	case <-active.EvalChannel:
		// Channel closed — consensus finalized
		e.mu.RLock()
		result := active.Result
		e.mu.RUnlock()
		return result, nil

	case <-ctx.Done():
		var onConsensus func(*ConsensusResult)
		e.mu.Lock()
		if !active.Completed {
			onConsensus = e.finalizeConsensus(active)
		}
		result := active.Result
		e.mu.Unlock()
		if onConsensus != nil && result != nil {
			onConsensus(result)
		}
		return result, nil
	}
}

// finalizeConsensus calculates and stores the final consensus result.
// IMPORTANT: Caller must hold e.mu. Returns the onConsensusReached callback
// to be fired after the lock is released to prevent deadlock.
func (e *ConsensusEngine) finalizeConsensus(active *ActiveTaskEvaluation) func(*ConsensusResult) {
	if active.Completed {
		return nil
	}

	active.Completed = true

	approved, total := e.countEvaluations(active.Evaluations)
	approvalRate := approved / total

	status := "disagreed"
	if e.isConsensusReached(approvalRate, active.Algorithm) {
		status = "agreed"
	} else if approvalRate > 0.5 {
		status = "partial"
	}

	// Build contributions list
	var contributions []AgentContribution
	for agentID, evaluation := range active.Evaluations {
		voteStr := "reject"
		if evaluation.Approved {
			voteStr = "approve"
		}
		contributions = append(contributions, AgentContribution{
			AgentID: agentID,
			Vote:    voteStr,
			Content: evaluation.Comment,
			Weight:  evaluation.Weight,
		})
	}

	// Convert evaluations to votes for backward compatibility
	votes := make(map[string]Vote)
	for agentID, evaluation := range active.Evaluations {
		votes[agentID] = Vote{
			AgentID: agentID,
			Approve: evaluation.Approved,
			Comment: evaluation.Comment,
			Weight:  evaluation.Weight,
		}
	}

	active.Result = &ConsensusResult{
		TaskID:        active.Task.ID,
		Status:        status,
		ApprovalRate:  approvalRate,
		Votes:         votes,
		Contributions: contributions,
	}

	// Cleanup - use sync.Once to ensure channel is closed exactly once
	active.closeOnce.Do(func() {
		close(active.EvalChannel)
	})

	// Return callback to fire outside lock
	return e.onConsensusReached
}

// countEvaluations counts approved evaluations and total weight.
// Returns (approvedWeight, totalWeight). When there are no evaluations,
// returns (0, 1) to avoid division by zero - this results in approvalRate=0.0
// which correctly indicates no consensus was reached.
func (e *ConsensusEngine) countEvaluations(evaluations map[string]Evaluation) (float64, float64) {
	var approved, total float64
	for _, evaluation := range evaluations {
		total += evaluation.Weight
		if evaluation.Approved {
			approved += evaluation.Weight
		}
	}

	if total == 0 {
		return 0, 1 // Avoid division by zero, results in approvalRate=0.0
	}

	return approved, total
}

// isConsensusReached determines if consensus is reached based on algorithm
func (e *ConsensusEngine) isConsensusReached(approvalRate float64, algorithm ConsensusAlgorithm) bool {
	switch algorithm {
	case ConsensusSimpleMajority:
		return approvalRate > 0.5
	case ConsensusSupermajority:
		return approvalRate >= 0.667
	case ConsensusUnanimity:
		return approvalRate >= 1.0
	case ConsensusWeighted:
		return approvalRate >= e.config.MinAgreement
	case ConsensusByzantine:
		// Byzantine requires 2/3 + 1 agreement
		return approvalRate >= 0.667
	case ConsensusQueenBee:
		// Queen Bee model uses configurable threshold
		return approvalRate >= e.config.MinAgreement
	default:
		return approvalRate >= e.config.MinAgreement
	}
}

// taskMonitorLoop monitors active tasks for timeouts
func (e *ConsensusEngine) taskMonitorLoop() {
	defer e.monitorWg.Done()

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-e.ctx.Done():
			return
		case <-ticker.C:
			e.checkTimeouts()
		}
	}
}

// checkTimeouts checks for timed out tasks and cleans up completed ones
func (e *ConsensusEngine) checkTimeouts() {
	var timeoutEvents []func()
	var consensusEvents []func()

	e.mu.Lock()
	now := time.Now()
	for id, active := range e.activeTasks {
		if !active.Completed && now.After(active.Deadline) {
			onConsensus := e.finalizeConsensus(active)
			if onConsensus != nil && active.Result != nil {
				result := active.Result
				consensusEvents = append(consensusEvents, func() { onConsensus(result) })
			}

			onTimeout := e.onTimeout
			taskID := id
			if onTimeout != nil {
				timeoutEvents = append(timeoutEvents, func() { onTimeout(taskID) })
			}
		}

		// Clean up completed tasks that haven't had cleanup scheduled yet
		if active.Completed && !active.cleanupScheduled {
			active.cleanupScheduled = true
			// Capture ctx while holding the lock
			ctx := e.ctx
			e.cleanupWg.Add(1)
			go func(taskID string, engineCtx context.Context) {
				defer e.cleanupWg.Done()
				defer func() {
					if r := recover(); r != nil {
						consensusLog.Error("Cleanup goroutine panic", "task_id", taskID, "panic", r)
					}
				}()
				// Use a timer for cleanup delay (allows consumers to read results)
				timer := time.NewTimer(taskCleanupDelay)
				defer timer.Stop()

				if engineCtx == nil {
					// No context, just wait for timer
					<-timer.C
					e.mu.Lock()
					delete(e.activeTasks, taskID)
					e.mu.Unlock()
					return
				}

				select {
				case <-timer.C:
					e.mu.Lock()
					delete(e.activeTasks, taskID)
					e.mu.Unlock()
				case <-engineCtx.Done():
					// Engine is shutting down, cleanup immediately
					e.mu.Lock()
					delete(e.activeTasks, taskID)
					e.mu.Unlock()
				}
			}(id, ctx)
		}
	}
	e.mu.Unlock()

	// Fire consensus and timeout callbacks outside lock to prevent deadlock
	for _, fn := range consensusEvents {
		fn()
	}
	for _, fn := range timeoutEvents {
		fn()
	}
}

// GetTask gets a task evaluation by ID (returns a copy to prevent mutation)
func (e *ConsensusEngine) GetTask(taskID string) (*ActiveTaskEvaluation, bool) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	active, ok := e.activeTasks[taskID]
	if !ok || active == nil {
		return nil, false
	}
	// Return a deep copy to prevent callers from corrupting internal state
	// Note: ActiveTaskEvaluation contains sync.Once, so we cannot use value copy.
	// Construct a new struct and copy field-by-field.
	cp := &ActiveTaskEvaluation{
		Task:                    active.Task,
		Algorithm:               active.Algorithm,
		Deadline:                active.Deadline,
		Completed:               active.Completed,
		Result:                  active.Result,
		EvalChannel:             nil, // Do not copy the channel
		ExpectedEvaluationCount: active.ExpectedEvaluationCount,
		// closeOnce is zero-valued by default
	}
	if active.Evaluations != nil {
		cp.Evaluations = make(map[string]Evaluation, len(active.Evaluations))
		for k, v := range active.Evaluations {
			cp.Evaluations[k] = v
		}
	}
	return cp, true
}

// GetProposal is kept for backward compatibility, delegates to GetTask
func (e *ConsensusEngine) GetProposal(proposalID string) (*ActiveTaskEvaluation, bool) {
	return e.GetTask(proposalID)
}

// GetActiveTasks returns copies of all active task evaluations
func (e *ConsensusEngine) GetActiveTasks() []*ActiveTaskEvaluation {
	e.mu.RLock()
	defer e.mu.RUnlock()

	result := make([]*ActiveTaskEvaluation, 0, len(e.activeTasks))
	for _, active := range e.activeTasks {
		if !active.Completed {
			// Return a copy to prevent callers from corrupting internal state
			// Same field-by-field copy as GetTask (sync.Once prevents value copy)
			cp := &ActiveTaskEvaluation{
				Task:                    active.Task,
				Algorithm:               active.Algorithm,
				Deadline:                active.Deadline,
				Completed:               active.Completed,
				Result:                  active.Result,
				EvalChannel:             nil,
				ExpectedEvaluationCount: active.ExpectedEvaluationCount,
			}
			if active.Evaluations != nil {
				cp.Evaluations = make(map[string]Evaluation, len(active.Evaluations))
				for k, v := range active.Evaluations {
					cp.Evaluations[k] = v
				}
			}
			result = append(result, cp)
		}
	}
	return result
}

// GetActiveProposals is kept for backward compatibility, delegates to GetActiveTasks
func (e *ConsensusEngine) GetActiveProposals() []*ActiveTaskEvaluation {
	return e.GetActiveTasks()
}

// CastEvaluation allows manually casting an evaluation (for external integrations)
func (e *ConsensusEngine) CastEvaluation(taskID string, evaluation Evaluation) error {
	e.mu.Lock()

	active, ok := e.activeTasks[taskID]
	if !ok {
		e.mu.Unlock()
		return fmt.Errorf("task not found: %s", taskID)
	}

	if active.Completed {
		e.mu.Unlock()
		return fmt.Errorf("task already completed: %s", taskID)
	}

	onReceived, onConsensus := e.recordEvaluation(active, evaluation)
	// Capture values for callbacks before unlocking
	taskIDCopy := active.Task.ID
	var resultCopy *ConsensusResult
	if active.Result != nil {
		resultCopy = active.Result
	}
	e.mu.Unlock()

	// Fire callbacks outside lock
	if onReceived != nil {
		onReceived(taskIDCopy, evaluation)
	}
	if onConsensus != nil && resultCopy != nil {
		onConsensus(resultCopy)
	}

	return nil
}

// CastVote is kept for backward compatibility, converts Vote to Evaluation
func (e *ConsensusEngine) CastVote(taskID string, vote Vote) error {
	evaluation := Evaluation{
		AgentID:  vote.AgentID,
		Approved: vote.Approve,
		Comment:  vote.Comment,
		Weight:   vote.Weight,
	}
	return e.CastEvaluation(taskID, evaluation)
}

// Callbacks

// OnTaskEvaluationStarted registers a callback for task evaluation start events
func (e *ConsensusEngine) OnTaskEvaluationStarted(fn func(task *Task)) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.onTaskEvaluationStarted = fn
}

// OnEvaluationReceived registers a callback for evaluation events
func (e *ConsensusEngine) OnEvaluationReceived(fn func(taskID string, evaluation Evaluation)) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.onEvaluationReceived = fn
}

// OnProposalCreated is kept for backward compatibility, delegates to OnTaskEvaluationStarted
func (e *ConsensusEngine) OnProposalCreated(fn func(task *Task)) {
	e.OnTaskEvaluationStarted(fn)
}

// OnVoteReceived is kept for backward compatibility, converts to evaluation callback
func (e *ConsensusEngine) OnVoteReceived(fn func(taskID string, vote Vote)) {
	e.mu.Lock()
	defer e.mu.Unlock()
	// Wrap the vote callback to work with evaluations
	e.onEvaluationReceived = func(taskID string, evaluation Evaluation) {
		vote := Vote{
			AgentID: evaluation.AgentID,
			Approve: evaluation.Approved,
			Comment: evaluation.Comment,
			Weight:  evaluation.Weight,
		}
		fn(taskID, vote)
	}
}

// OnConsensusReached registers a callback for consensus events
func (e *ConsensusEngine) OnConsensusReached(fn func(result *ConsensusResult)) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.onConsensusReached = fn
}

// OnTimeout registers a callback for timeout events
func (e *ConsensusEngine) OnTimeout(fn func(taskID string)) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.onTimeout = fn
}
