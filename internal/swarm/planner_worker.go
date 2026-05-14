// Package swarm implements Planner-Worker pattern
// Based on Cursor's architecture where a Planner breaks down tasks and Workers execute them
package swarm

import (
	"context"
	"encoding/json"
	"fmt"
	"maps"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
	"github.com/swarm-editor/swarm-editor/internal/log"
	"github.com/swarm-editor/swarm-editor/pkg/utils"
)

var plannerLog = log.With("component", "PlannerWorker")

// PlanState represents the state of a plan
type PlanState string

const (
	PlanStateDraft     PlanState = "draft"
	PlanStateApproved  PlanState = "approved"
	PlanStateExecuting PlanState = "executing"
	PlanStateCompleted PlanState = "completed"
	PlanStateFailed    PlanState = "failed"
)

// SubtaskState represents the state of a subtask
type SubtaskState string

const (
	SubtaskStatePending   SubtaskState = "pending"
	SubtaskStateRunning   SubtaskState = "running"
	SubtaskStateCompleted SubtaskState = "completed"
	SubtaskStateFailed    SubtaskState = "failed"
	SubtaskStateSkipped   SubtaskState = "skipped"
)

// Plan represents a task breakdown plan created by Planner
type Plan struct {
	mu sync.RWMutex

	ID          string     `json:"id"`
	ParentTask  string     `json:"parentTask"`
	Description string     `json:"description"`
	Goal        string     `json:"goal"`
	Subtasks    []*Subtask `json:"subtasks"`
	State       PlanState  `json:"state"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
	CreatedBy   string     `json:"createdBy"` // Planner agent ID

	// Execution context
	AssignedWorkers map[string]string `json:"assignedWorkers"` // subtask ID -> worker ID
	CompletedCount  int               `json:"completedCount"`
	FailedCount     int               `json:"failedCount"`

	// Failure tracking
	FailureReason string `json:"failureReason,omitempty"` // Reason for failure if state is failed

	// Dependencies
	Dependencies map[string][]string `json:"dependencies"` // subtask ID -> prerequisite subtask IDs

	// Result aggregation
	Results map[string]*SubtaskResult `json:"results"` // subtask ID -> result
}

// Subtask represents a single unit of work in a plan
type Subtask struct {
	ID          string       `json:"id"`
	PlanID      string       `json:"planId"`
	Title       string       `json:"title"`
	Description string       `json:"description"`
	Type        string       `json:"type"` // "code", "review", "test", "research", "integration"
	Priority    int          `json:"priority"`
	State       SubtaskState `json:"state"`

	// Execution details
	AssignedTo   string          `json:"assignedTo,omitempty"`
	AssignedType agent.AgentType `json:"assignedType,omitempty"` // Preferred agent type
	Input        string          `json:"input,omitempty"`        // Input context for worker
	Expected     string          `json:"expected,omitempty"`     // Expected output description
	Timeout      time.Duration   `json:"timeout,omitempty"`

	// Dependencies
	DependsOn []string `json:"dependsOn,omitempty"` // Subtask IDs this depends on

	// Metadata
	Tags    []string       `json:"tags,omitempty"`
	Context map[string]any `json:"context,omitempty"`
}

// SubtaskResult represents the result of a subtask execution
type SubtaskResult struct {
	SubtaskID    string        `json:"subtaskId"`
	WorkerID     string        `json:"workerId"`
	Output       string        `json:"output"`
	Artifacts    []Artifact    `json:"artifacts,omitempty"`
	FilesChanged []string      `json:"filesChanged,omitempty"`
	Error        string        `json:"error,omitempty"`
	StartedAt    time.Time     `json:"startedAt"`
	CompletedAt  time.Time     `json:"completedAt"`
	Duration     time.Duration `json:"duration"`
	Success      bool          `json:"success"`
}

// PlannerWorkerManager manages the Planner-Worker pattern
type PlannerWorkerManager struct {
	mu sync.RWMutex

	// Registry for agent lookup
	registry *agent.Registry

	// Plans
	plans     map[string]*Plan
	active    map[string]*Plan // Currently executing plans
	completed map[string]*Plan

	// Workers
	workers    map[string]*WorkerInfo
	workerPool map[agent.AgentType][]string // Agent type -> worker IDs

	// Planner
	planner *agent.Agent

	// Configuration
	config PlannerWorkerConfig

	// Execution tracking
	wg sync.WaitGroup // Tracks executing plan goroutines

	// Callbacks
	onPlanCreated     func(plan *Plan)
	onSubtaskStart    func(subtask *Subtask, workerID string)
	onSubtaskComplete func(result *SubtaskResult)
	onPlanComplete    func(plan *Plan)
}

// WorkerInfo contains information about a worker
type WorkerInfo struct {
	Agent          *agent.Agent
	Type           agent.AgentType
	Capabilities   []string
	CurrentTask    string // Currently assigned subtask ID
	Load           int
	TasksCompleted int
	SuccessRate    float64
}

// PlannerWorkerConfig configures the planner-worker pattern
type PlannerWorkerConfig struct {
	MaxSubtasksPerPlan    int           `json:"maxSubtasksPerPlan"`
	DefaultSubtaskTimeout time.Duration `json:"defaultSubtaskTimeout"`
	MaxConcurrentWorkers  int           `json:"maxConcurrentWorkers"`
	EnableParallel        bool          `json:"enableParallel"`
	AutoAssign            bool          `json:"autoAssign"`
}

// DefaultPlannerWorkerConfig returns default configuration
func DefaultPlannerWorkerConfig() PlannerWorkerConfig {
	return PlannerWorkerConfig{
		MaxSubtasksPerPlan:    10,
		DefaultSubtaskTimeout: 5 * time.Minute,
		MaxConcurrentWorkers:  5,
		EnableParallel:        true,
		AutoAssign:            true,
	}
}

// NewPlannerWorkerManager creates a new planner-worker manager
func NewPlannerWorkerManager(registry *agent.Registry, config PlannerWorkerConfig) *PlannerWorkerManager {
	if registry == nil {
		registry = agent.NewRegistry()
	}

	return &PlannerWorkerManager{
		registry:   registry,
		plans:      make(map[string]*Plan),
		active:     make(map[string]*Plan),
		completed:  make(map[string]*Plan),
		workers:    make(map[string]*WorkerInfo),
		workerPool: make(map[agent.AgentType][]string),
		config:     config,
	}
}

// SetPlanner sets the planner agent
func (m *PlannerWorkerManager) SetPlanner(planner *agent.Agent) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.planner = planner
}

// RegisterWorker registers a worker agent
func (m *PlannerWorkerManager) RegisterWorker(a *agent.Agent, workerType agent.AgentType, capabilities []string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	info := &WorkerInfo{
		Agent:        a,
		Type:         workerType,
		Capabilities: capabilities,
	}

	m.workers[string(a.ID)] = info
	m.workerPool[workerType] = append(m.workerPool[workerType], string(a.ID))
}

// UnregisterWorker removes a worker
func (m *PlannerWorkerManager) UnregisterWorker(agentID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if info, ok := m.workers[agentID]; ok {
		// Remove from worker pool
		pool := m.workerPool[info.Type]
		for i, id := range pool {
			if id == agentID {
				m.workerPool[info.Type] = append(pool[:i], pool[i+1:]...)
				break
			}
		}
		delete(m.workers, agentID)
	}
}

// CreatePlan creates a new plan for a task (called by Planner)
func (m *PlannerWorkerManager) CreatePlan(ctx context.Context, taskID, description, goal string, subtasks []*Subtask) (*Plan, error) {
	m.mu.Lock()

	if len(subtasks) > m.config.MaxSubtasksPerPlan {
		m.mu.Unlock()
		return nil, fmt.Errorf("too many subtasks: %d > %d", len(subtasks), m.config.MaxSubtasksPerPlan)
	}

	plan := &Plan{
		ID:              generatePlanID(),
		ParentTask:      taskID,
		Description:     description,
		Goal:            goal,
		Subtasks:        subtasks,
		State:           PlanStateDraft,
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
		AssignedWorkers: make(map[string]string),
		Dependencies:    make(map[string][]string),
		Results:         make(map[string]*SubtaskResult),
	}

	// Build dependency graph
	for _, st := range subtasks {
		plan.Dependencies[st.ID] = st.DependsOn
		st.PlanID = plan.ID
		st.State = SubtaskStatePending
	}

	m.plans[plan.ID] = plan

	onCreated := m.onPlanCreated
	m.mu.Unlock()

	if onCreated != nil {
		onCreated(plan)
	}

	return plan, nil
}

// ApprovePlan approves a plan for execution
func (m *PlannerWorkerManager) ApprovePlan(planID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	plan, ok := m.plans[planID]
	if !ok {
		return fmt.Errorf("plan not found: %s", planID)
	}

	if plan.State != PlanStateDraft {
		return fmt.Errorf("plan is not in draft state: %s", plan.State)
	}

	plan.State = PlanStateApproved
	plan.UpdatedAt = time.Now()

	return nil
}

// ExecutePlan starts executing an approved plan
func (m *PlannerWorkerManager) ExecutePlan(ctx context.Context, planID string) error {
	m.mu.Lock()
	plan, ok := m.plans[planID]
	if !ok {
		m.mu.Unlock()
		return fmt.Errorf("plan not found: %s", planID)
	}

	if plan.State != PlanStateApproved {
		state := plan.State // capture before unlock to avoid data race
		m.mu.Unlock()
		return fmt.Errorf("plan is not approved: %s", state)
	}

	plan.State = PlanStateExecuting
	m.active[planID] = plan
	m.mu.Unlock()

	// Execute subtasks respecting dependencies (tracked by WaitGroup)
	m.wg.Add(1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				plannerLog.Error("executeSubtasks panic", "plan_id", plan.ID, "panic", r)
			}
			m.wg.Done()
		}()
		m.executeSubtasks(ctx, plan)
	}()

	return nil
}

// executeSubtasks executes subtasks respecting dependencies
func (m *PlannerWorkerManager) executeSubtasks(ctx context.Context, plan *Plan) {
	// Create execution order based on dependencies
	order, cycleErr := m.topologicalSort(plan)
	if cycleErr != "" {
		m.markPlanFailed(plan.ID, cycleErr)
		return
	}

	for _, subtaskID := range order {
		// Check if context cancelled
		select {
		case <-ctx.Done():
			m.markPlanFailed(plan.ID, "context cancelled")
			return
		default:
		}

		subtask := m.getSubtask(plan, subtaskID)
		if subtask == nil {
			continue
		}

		// Check if dependencies are satisfied
		if !m.dependenciesSatisfied(plan, subtask) {
			m.markSubtaskState(plan, subtaskID, SubtaskStateSkipped)
			continue
		}

		// Assign worker
		workerID := m.assignWorker(subtask)
		if workerID == "" {
			m.markSubtaskState(plan, subtaskID, SubtaskStateFailed)
			continue
		}

		// Execute subtask
		m.markSubtaskState(plan, subtaskID, SubtaskStateRunning)
		result := m.executeSubtask(ctx, plan, subtask, workerID)

		// Store result
		m.mu.Lock()
		plan.Results[subtaskID] = result
		if result.Success {
			plan.CompletedCount++
		} else {
			plan.FailedCount++
		}
		onComplete := m.onSubtaskComplete
		m.mu.Unlock()

		// Notify callback outside lock
		if onComplete != nil {
			onComplete(result)
		}
	}

	// Check final state
	m.mu.Lock()
	allCompleted := plan.CompletedCount == len(plan.Subtasks)
	if allCompleted {
		plan.State = PlanStateCompleted
	} else {
		plan.State = PlanStateFailed
	}
	plan.UpdatedAt = time.Now()

	delete(m.active, plan.ID)
	m.completed[plan.ID] = plan

	// Limit completed plans to prevent memory leak (keep last 500)
	const maxCompletedPlans = 500
	if len(m.completed) > maxCompletedPlans {
		// Remove oldest entries (simple approach: clear half)
		count := 0
		for id := range m.completed {
			delete(m.completed, id)
			count++
			if count >= maxCompletedPlans/2 {
				break
			}
		}
	}

	// Snapshot callback under lock before invoking
	onPlanComplete := m.onPlanComplete
	m.mu.Unlock()

	if onPlanComplete != nil {
		onPlanComplete(plan)
	}
}

// topologicalSort returns subtask IDs in execution order.
// Returns (order, cycleError) - if a cycle is detected, cycleError contains
// the error message and order contains all subtask IDs for fallback execution.
// This avoids writing to plan.FailureReason without mutex (LangGraph graph validation pattern).
func (m *PlannerWorkerManager) topologicalSort(plan *Plan) (order []string, cycleErr string) {
	visited := make(map[string]bool)
	inStack := make(map[string]bool) // Tracks nodes in current DFS path for cycle detection
	hasCycle := false
	cycleSubtask := ""

	var visit func(id string)
	visit = func(id string) {
		if hasCycle {
			return
		}
		if inStack[id] {
			// Circular dependency detected
			hasCycle = true
			cycleSubtask = id
			return
		}
		if visited[id] {
			return
		}
		visited[id] = true
		inStack[id] = true
		defer func() { delete(inStack, id) }()

		// Visit dependencies first
		for _, dep := range plan.Dependencies[id] {
			visit(dep)
		}

		order = append(order, id)
	}

	for _, st := range plan.Subtasks {
		visit(st.ID)
	}

	if hasCycle {
		// Return all subtasks in their original order so they can be individually
		// marked as failed during execution
		ids := make([]string, len(plan.Subtasks))
		for i, st := range plan.Subtasks {
			ids[i] = st.ID
		}
		return ids, fmt.Sprintf("circular dependency detected involving subtask %s", cycleSubtask)
	}

	// Sort by priority within same dependency level
	sort.Slice(order, func(i, j int) bool {
		st1 := m.getSubtask(plan, order[i])
		st2 := m.getSubtask(plan, order[j])
		if st1 == nil || st2 == nil {
			return false
		}
		return st1.Priority > st2.Priority
	})

	return order, ""
}

// dependenciesSatisfied checks if all dependencies are completed
// Thread-safe: acquires RLock internally
func (m *PlannerWorkerManager) dependenciesSatisfied(plan *Plan, subtask *Subtask) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, depID := range subtask.DependsOn {
		result, ok := plan.Results[depID]
		if !ok || !result.Success {
			return false
		}
	}
	return true
}

// getSubtask finds a subtask in a plan
func (m *PlannerWorkerManager) getSubtask(plan *Plan, subtaskID string) *Subtask {
	for _, st := range plan.Subtasks {
		if st.ID == subtaskID {
			return st
		}
	}
	return nil
}

// assignWorker assigns the best available worker for a subtask
func (m *PlannerWorkerManager) assignWorker(subtask *Subtask) string {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.config.AutoAssign {
		return ""
	}

	// Get preferred agent type
	preferredType := subtask.AssignedType
	if preferredType == "" {
		preferredType = m.inferAgentType(subtask)
	}

	// Find available worker of preferred type
	workers := m.workerPool[preferredType]
	for _, workerID := range workers {
		info := m.workers[workerID]
		if info != nil && info.CurrentTask == "" {
			info.CurrentTask = subtask.ID
			plan := m.plans[subtask.PlanID]
			if plan != nil {
				plan.AssignedWorkers[subtask.ID] = workerID
			}
			return workerID
		}
	}

	// Fallback to any available worker
	for workerID, info := range m.workers {
		if info.CurrentTask == "" {
			info.CurrentTask = subtask.ID
			plan := m.plans[subtask.PlanID]
			if plan != nil {
				plan.AssignedWorkers[subtask.ID] = workerID
			}
			return workerID
		}
	}

	return ""
}

// inferAgentType infers the best agent type for a subtask
func (m *PlannerWorkerManager) inferAgentType(subtask *Subtask) agent.AgentType {
	switch subtask.Type {
	case "code", "implementation":
		return agent.AgentTypeCoder
	case "review":
		return agent.AgentTypeReviewer
	case "test":
		return agent.AgentTypeTester
	case "architecture", "design":
		return agent.AgentTypeArchitect
	default:
		return agent.AgentTypeWorker
	}
}

// promptContext holds snapshot of plan data needed for building worker prompts.
// Used to avoid data races when accessing plan fields without lock.
type promptContext struct {
	Goal          string
	DepResults    map[string]*SubtaskResult // Results for subtask dependencies
	DependencyIDs []string                  // IDs of dependencies
}

// executeSubtask executes a single subtask on a worker
func (m *PlannerWorkerManager) executeSubtask(ctx context.Context, plan *Plan, subtask *Subtask, workerID string) *SubtaskResult {
	result := &SubtaskResult{
		SubtaskID: subtask.ID,
		WorkerID:  workerID,
		StartedAt: time.Now(),
	}

	// Notify callback (snapshot under lock to avoid race)
	m.mu.RLock()
	onSubtaskStart := m.onSubtaskStart
	m.mu.RUnlock()
	if onSubtaskStart != nil {
		onSubtaskStart(subtask, workerID)
	}

	// Get worker
	m.mu.RLock()
	workerInfo, ok := m.workers[workerID]
	m.mu.RUnlock()

	if !ok {
		result.Error = "worker not found"
		result.Success = false
		result.CompletedAt = time.Now()
		return result
	}

	// Snapshot plan data for prompt building (avoid data race on plan.Goal and plan.Results)
	m.mu.RLock()
	promptCtx := promptContext{
		Goal:          plan.Goal,
		DepResults:    make(map[string]*SubtaskResult, len(subtask.DependsOn)),
		DependencyIDs: subtask.DependsOn,
	}
	for _, depID := range subtask.DependsOn {
		if r, exists := plan.Results[depID]; exists {
			// Copy the result to prevent external mutation
			resultCopy := *r
			promptCtx.DepResults[depID] = &resultCopy
		}
	}
	m.mu.RUnlock()

	// Build prompt for worker using snapshot data
	prompt := m.buildWorkerPromptWithContext(subtask, &promptCtx)

	// Execute on worker agent
	worker := workerInfo.Agent
	execResult, err := worker.Execute(ctx, prompt)

	result.CompletedAt = time.Now()
	result.Duration = result.CompletedAt.Sub(result.StartedAt)

	if err != nil {
		result.Error = err.Error()
		result.Success = false
	} else if execResult != nil {
		result.Output = execResult.Output
		result.Success = execResult.Error == nil
	}

	// Update worker info
	m.mu.Lock()
	workerInfo.CurrentTask = ""
	workerInfo.TasksCompleted++
	if result.Success {
		workerInfo.SuccessRate = (workerInfo.SuccessRate*float64(workerInfo.TasksCompleted-1) + 1.0) / float64(workerInfo.TasksCompleted)
	}
	m.mu.Unlock()

	return result
}

// buildWorkerPromptWithContext builds the prompt using snapshot data (thread-safe).
// This is the preferred method when accessing plan data from goroutines.
func (m *PlannerWorkerManager) buildWorkerPromptWithContext(subtask *Subtask, ctx *promptContext) acp.Prompt {
	var sb strings.Builder

	sb.WriteString("## Task\n")
	sb.WriteString(subtask.Title)
	sb.WriteString("\n\n")

	sb.WriteString("## Context\n")
	sb.WriteString("You are working on a larger plan: ")
	sb.WriteString(ctx.Goal)
	sb.WriteString("\n\n")

	sb.WriteString("## Your Subtask\n")
	sb.WriteString(subtask.Description)
	sb.WriteString("\n\n")

	if subtask.Input != "" {
		sb.WriteString("## Input\n")
		sb.WriteString(subtask.Input)
		sb.WriteString("\n\n")
	}

	if subtask.Expected != "" {
		sb.WriteString("## Expected Output\n")
		sb.WriteString(subtask.Expected)
		sb.WriteString("\n\n")
	}

	// Add dependency results from snapshot
	if len(ctx.DependencyIDs) > 0 {
		sb.WriteString("## Previous Results\n")
		for _, depID := range ctx.DependencyIDs {
			if result, ok := ctx.DepResults[depID]; ok && result.Success {
				sb.WriteString(fmt.Sprintf("### %s\n%s\n\n", depID, result.Output))
			}
		}
	}

	return acp.Prompt{
		{Type: "text", Text: sb.String()},
	}
}

// markSubtaskState updates subtask state
func (m *PlannerWorkerManager) markSubtaskState(plan *Plan, subtaskID string, state SubtaskState) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, st := range plan.Subtasks {
		if st.ID == subtaskID {
			st.State = state
			break
		}
	}
	plan.UpdatedAt = time.Now()
}

// markPlanFailed marks a plan as failed
func (m *PlannerWorkerManager) markPlanFailed(planID, reason string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if plan, ok := m.plans[planID]; ok {
		plan.State = PlanStateFailed
		plan.FailureReason = reason
		plan.UpdatedAt = time.Now()
		delete(m.active, planID)
		m.completed[planID] = plan
	}
}

// GetPlan returns a plan by ID (returns a snapshot to prevent mutation)
func (m *PlannerWorkerManager) GetPlan(planID string) (*Plan, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	plan, ok := m.plans[planID]
	if !ok {
		return nil, false
	}
	return plan.Snapshot(), true
}

// GetActivePlans returns all active plans (returns snapshots to prevent mutation)
func (m *PlannerWorkerManager) GetActivePlans() []*Plan {
	m.mu.RLock()
	defer m.mu.RUnlock()

	plans := make([]*Plan, 0, len(m.active))
	for _, p := range m.active {
		plans = append(plans, p.Snapshot())
	}
	return plans
}

// GetWorkerStats returns copies of worker statistics
func (m *PlannerWorkerManager) GetWorkerStats() map[string]*WorkerInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make(map[string]*WorkerInfo, len(m.workers))
	for k, v := range m.workers {
		cp := *v // Value copy to prevent mutation of internal state
		result[k] = &cp
	}
	return result
}

// PlanFromJSON parses a plan from JSON
func PlanFromJSON(data []byte) (*Plan, error) {
	var plan Plan
	if err := json.Unmarshal(data, &plan); err != nil {
		return nil, err
	}
	return &plan, nil
}

// ToJSON serializes a plan to JSON
func (p *Plan) ToJSON() ([]byte, error) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return json.Marshal(p)
}

// GetProgress returns plan execution progress
func (p *Plan) GetProgress() float64 {
	p.mu.RLock()
	defer p.mu.RUnlock()

	if len(p.Subtasks) == 0 {
		return 0
	}
	return float64(p.CompletedCount+p.FailedCount) / float64(len(p.Subtasks))
}

// Snapshot returns a deep copy of the plan for safe external access
func (p *Plan) Snapshot() *Plan {
	p.mu.RLock()
	defer p.mu.RUnlock()

	// Shallow copy of value fields
	copy := &Plan{
		ID:             p.ID,
		ParentTask:     p.ParentTask,
		Description:    p.Description,
		Goal:           p.Goal,
		State:          p.State,
		CreatedAt:      p.CreatedAt,
		UpdatedAt:      p.UpdatedAt,
		CreatedBy:      p.CreatedBy,
		CompletedCount: p.CompletedCount,
		FailedCount:    p.FailedCount,
		FailureReason:  p.FailureReason,
	}

	// Deep copy slices and maps
	copy.Subtasks = make([]*Subtask, len(p.Subtasks))
	for i, st := range p.Subtasks {
		stCopy := *st // shallow copy of Subtask (immutable after creation)
		copy.Subtasks[i] = &stCopy
	}

	copy.AssignedWorkers = maps.Clone(p.AssignedWorkers)
	copy.Dependencies = make(map[string][]string, len(p.Dependencies))
	for k, v := range p.Dependencies {
		copy.Dependencies[k] = append([]string{}, v...)
	}

	copy.Results = make(map[string]*SubtaskResult, len(p.Results))
	for k, v := range p.Results {
		if v != nil {
			rCopy := *v // shallow copy of result
			copy.Results[k] = &rCopy
		}
	}

	return copy
}

// Callback setters
func (m *PlannerWorkerManager) OnPlanCreated(fn func(plan *Plan)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onPlanCreated = fn
}

func (m *PlannerWorkerManager) OnSubtaskStart(fn func(subtask *Subtask, workerID string)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onSubtaskStart = fn
}

func (m *PlannerWorkerManager) OnSubtaskComplete(fn func(result *SubtaskResult)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onSubtaskComplete = fn
}

func (m *PlannerWorkerManager) OnPlanComplete(fn func(plan *Plan)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onPlanComplete = fn
}

func generatePlanID() string {
	return utils.GenerateID("plan")
}

// Wait blocks until all executing plans complete (for graceful shutdown)
func (m *PlannerWorkerManager) Wait() {
	m.wg.Wait()
}
