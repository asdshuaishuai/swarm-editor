// Package swarm implements intelligent swarm scheduling
package swarm

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
)

// Scheduler manages intelligent task scheduling across agents
type Scheduler struct {
	mu sync.RWMutex

	// Configuration
	config SchedulerConfig

	// Agent pool
	coordinator *AgentInfo
	workers     map[string]*AgentInfo

	// Task management - use unified TaskQueue
	pendingQueue  *TaskQueue
	runningTasks  map[string]*ScheduledTask
	completedTask []*ScheduledTask

	// Connections
	connections *acp.ConnectionManager

	// Callbacks
	onTaskStart    func(task *ScheduledTask)
	onTaskComplete func(task *ScheduledTask)
	onTaskFail     func(task *ScheduledTask, err error)
	onProgress     func(taskID string, progress float64)

	// Lifecycle state
	running bool
	wg      sync.WaitGroup

	ctx    context.Context
	cancel context.CancelFunc
}

// SchedulerConfig configures the scheduler
type SchedulerConfig struct {
	MaxConcurrentTasks  int           `json:"maxConcurrentTasks"`
	TaskTimeout         time.Duration `json:"taskTimeout"`
	RetryCount          int           `json:"retryCount"`
	RetryDelay          time.Duration `json:"retryDelay"`
	LoadBalanceStrategy string        `json:"loadBalanceStrategy"` // "round_robin", "least_loaded", "priority", "capability"
}

// AgentInfo contains information about an available agent
type AgentInfo struct {
	ID            string
	Connection    *acp.AgentConnection
	Capabilities  acp.AgentCapabilities
	Roles         []string
	Priority      int
	MaxConcurrent int

	// Runtime state (protected by mu)
	mu          sync.RWMutex
	currentLoad int
	totalTasks  int
	successRate float64
}

// IncrementLoad atomically increments the agent's current load
func (a *AgentInfo) IncrementLoad() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.currentLoad++
	a.totalTasks++
}

// DecrementLoad atomically decrements the agent's current load
func (a *AgentInfo) DecrementLoad() {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.currentLoad > 0 {
		a.currentLoad--
	}
}

// GetLoad returns the current load
func (a *AgentInfo) GetLoad() int {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.currentLoad
}

// GetTotalTasks returns the total tasks processed
func (a *AgentInfo) GetTotalTasks() int {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.totalTasks
}

// ScheduledTask represents a task scheduled for execution
type ScheduledTask struct {
	Task        *Task
	AssignedTo  []*AgentInfo
	StartedAt   time.Time
	CompletedAt time.Time
	Status      TaskStatus
	Progress    float64
	Result      *TaskResult
	Error       error
	RetryCount  int
}

// NewScheduler creates a new scheduler
func NewScheduler(config SchedulerConfig, connections *acp.ConnectionManager) *Scheduler {
	// Apply defaults for zero values
	if config.MaxConcurrentTasks <= 0 {
		config.MaxConcurrentTasks = 10
	}
	if config.TaskTimeout <= 0 {
		config.TaskTimeout = 5 * time.Minute
	}
	if config.RetryDelay <= 0 {
		config.RetryDelay = 1 * time.Second
	}
	if config.LoadBalanceStrategy == "" {
		config.LoadBalanceStrategy = "least_loaded"
	}

	return &Scheduler{
		config:        config,
		workers:       make(map[string]*AgentInfo),
		pendingQueue:  NewTaskQueue(),
		runningTasks:  make(map[string]*ScheduledTask),
		completedTask: make([]*ScheduledTask, 0),
		connections:   connections,
	}
}

// SetCoordinator sets the coordinator agent
func (s *Scheduler) SetCoordinator(agent *AgentInfo) {
	if agent == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.coordinator = agent
}

// AddWorker adds a worker agent to the pool
func (s *Scheduler) AddWorker(agent *AgentInfo) {
	if agent == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.workers[agent.ID] = agent
}

// RemoveWorker removes a worker from the pool
func (s *Scheduler) RemoveWorker(agentID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.workers, agentID)
}

// Start starts the scheduler
func (s *Scheduler) Start(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Prevent double-start
	if s.running {
		return fmt.Errorf("scheduler is already running")
	}

	s.ctx, s.cancel = context.WithCancel(ctx)
	s.running = true

	// Start scheduler loop
	s.wg.Add(1)
	go s.schedulerLoop()

	// Start progress monitor
	s.wg.Add(1)
	go s.progressMonitor()

	return nil
}

// Stop stops the scheduler and waits for goroutines to complete
func (s *Scheduler) Stop() {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return
	}

	if s.cancel != nil {
		s.cancel()
	}
	s.running = false
	s.mu.Unlock()

	// Wait for goroutines to complete
	s.wg.Wait()
}

// SubmitTask submits a task for scheduling
func (s *Scheduler) SubmitTask(task *Task) error {
	if task == nil {
		return fmt.Errorf("task cannot be nil")
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	task.State = TaskStatePending
	task.CreatedAt = time.Now()

	s.pendingQueue.Push(task)

	return nil
}

// SubmitTaskWithDecomposition submits a task and decomposes it if needed
func (s *Scheduler) SubmitTaskWithDecomposition(ctx context.Context, task *Task) ([]*Task, error) {
	// Analyze task complexity
	subtasks, err := s.decomposeTask(ctx, task)
	if err != nil {
		return nil, err
	}

	if len(subtasks) > 1 {
		// Submit all subtasks
		for _, st := range subtasks {
			if err := s.SubmitTask(st); err != nil {
				return nil, err
			}
		}
		return subtasks, nil
	}

	// Submit single task
	if err := s.SubmitTask(task); err != nil {
		return nil, err
	}

	return []*Task{task}, nil
}

// schedulerLoop is the main scheduling loop
func (s *Scheduler) schedulerLoop() {
	defer s.wg.Done()

	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			s.scheduleNext()
		}
	}
}

// scheduleNext schedules the next pending task
func (s *Scheduler) scheduleNext() {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if we can run more tasks
	if len(s.runningTasks) >= s.config.MaxConcurrentTasks {
		return
	}

	// Get next task
	task := s.pendingQueue.Pop()
	if task == nil {
		return
	}

	// Select best agents for this task
	agents := s.selectAgentsForTask(task)
	if len(agents) == 0 {
		// Put back in queue if no agents available
		s.pendingQueue.Push(task)
		return
	}

	// Create scheduled task
	scheduled := &ScheduledTask{
		Task:       task,
		AssignedTo: agents,
		StartedAt:  time.Now(),
		Status:     TaskStatusRunning,
	}

	s.runningTasks[task.ID] = scheduled

	// Start task execution
	go s.executeTask(scheduled)
}

// selectAgentsForTask selects the best agents for a task
func (s *Scheduler) selectAgentsForTask(task *Task) []*AgentInfo {
	var candidates []*AgentInfo

	// Filter agents by capability and load
	for _, agent := range s.workers {
		if agent.GetLoad() >= agent.MaxConcurrent {
			continue
		}

		// Check role compatibility
		if len(task.Metadata) > 0 {
			if requiredRole, ok := task.Metadata["requiredRole"].(string); ok {
				if !s.agentHasRole(agent, requiredRole) {
					continue
				}
			}
		}

		candidates = append(candidates, agent)
	}

	if len(candidates) == 0 {
		return nil
	}

	// Apply load balancing strategy
	switch s.config.LoadBalanceStrategy {
	case "least_loaded":
		return s.selectLeastLoaded(candidates)
	case "priority":
		return s.selectByPriority(candidates)
	case "capability":
		return s.selectByCapability(candidates, task)
	case "round_robin":
		fallthrough
	default:
		return s.selectRoundRobin(candidates)
	}
}

// selectLeastLoaded selects the agent with the least current load
func (s *Scheduler) selectLeastLoaded(agents []*AgentInfo) []*AgentInfo {
	if len(agents) == 0 {
		return nil
	}
	sort.Slice(agents, func(i, j int) bool {
		return agents[i].GetLoad() < agents[j].GetLoad()
	})
	return []*AgentInfo{agents[0]}
}

// selectByPriority selects agents by priority
func (s *Scheduler) selectByPriority(agents []*AgentInfo) []*AgentInfo {
	if len(agents) == 0 {
		return nil
	}
	sort.Slice(agents, func(i, j int) bool {
		return agents[i].Priority > agents[j].Priority
	})
	return []*AgentInfo{agents[0]}
}

// selectByCapability selects agents by capability match
func (s *Scheduler) selectByCapability(agents []*AgentInfo, task *Task) []*AgentInfo {
	if len(agents) == 0 {
		return nil
	}
	// Score agents by capability match
	type scoredAgent struct {
		agent *AgentInfo
		score float64
	}

	scored := make([]scoredAgent, len(agents))
	for i, agent := range agents {
		score := s.calculateCapabilityScore(agent, task)
		scored[i] = scoredAgent{agent: agent, score: score}
	}

	sort.Slice(scored, func(i, j int) bool {
		return scored[i].score > scored[j].score
	})

	return []*AgentInfo{scored[0].agent}
}

// selectRoundRobin selects agents in round-robin fashion
func (s *Scheduler) selectRoundRobin(agents []*AgentInfo) []*AgentInfo {
	if len(agents) == 0 {
		return nil
	}
	// Simple round-robin based on total tasks
	minTasks := math.MaxInt32
	var selected *AgentInfo

	for _, agent := range agents {
		tasks := agent.GetTotalTasks()
		if tasks < minTasks {
			minTasks = tasks
			selected = agent
		}
	}

	if selected != nil {
		return []*AgentInfo{selected}
	}
	return []*AgentInfo{agents[0]}
}

// calculateCapabilityScore calculates how well an agent matches a task
func (s *Scheduler) calculateCapabilityScore(agent *AgentInfo, task *Task) float64 {
	score := 0.0

	// Role match
	if requiredRole, ok := task.Metadata["requiredRole"].(string); ok {
		if s.agentHasRole(agent, requiredRole) {
			score += 10.0
		}
	}

	// Priority bonus
	score += float64(agent.Priority)

	// Success rate bonus
	score += agent.successRate * 5.0

	// Load penalty
	score -= float64(agent.GetLoad()) * 2.0

	return score
}

// agentHasRole checks if an agent has a specific role
func (s *Scheduler) agentHasRole(agent *AgentInfo, role string) bool {
	for _, r := range agent.Roles {
		if r == role {
			return true
		}
	}
	return false
}

// executeTask executes a task on assigned agents
func (s *Scheduler) executeTask(scheduled *ScheduledTask) {
	task := scheduled.Task

	// Notify callback
	if s.onTaskStart != nil {
		s.onTaskStart(scheduled)
	}

	// Update agent load
	for _, agent := range scheduled.AssignedTo {
		agent.IncrementLoad()
	}

	// Execute on each agent
	var wg sync.WaitGroup
	results := make(chan *TaskResult, len(scheduled.AssignedTo))
	errors := make(chan error, len(scheduled.AssignedTo))

	for _, agent := range scheduled.AssignedTo {
		wg.Add(1)
		go func(a *AgentInfo) {
			defer wg.Done()

			result, err := s.executeOnAgent(scheduled, a)
			if err != nil {
				errors <- err
			} else {
				results <- result
			}
		}(agent)
	}

	wg.Wait()
	close(results)
	close(errors)

	// Collect results
	var allResults []*TaskResult
	for r := range results {
		allResults = append(allResults, r)
	}

	var allErrors []error
	for e := range errors {
		allErrors = append(allErrors, e)
	}

	// Update agent load
	for _, agent := range scheduled.AssignedTo {
		agent.DecrementLoad()
	}

	// Handle completion
	s.mu.Lock()
	delete(s.runningTasks, task.ID)
	s.mu.Unlock()

	if len(allErrors) > 0 && len(allResults) == 0 {
		// All failed
		scheduled.Status = TaskStatusFailed
		scheduled.Error = allErrors[0]

		// Check for retry
		if scheduled.RetryCount < s.config.RetryCount {
			scheduled.RetryCount++
			scheduled.Status = TaskStatusRetrying
			time.Sleep(s.config.RetryDelay)
			s.mu.Lock()
			s.runningTasks[task.ID] = scheduled
			s.mu.Unlock()
			go s.executeTask(scheduled)
			return
		}

		if s.onTaskFail != nil {
			s.onTaskFail(scheduled, allErrors[0])
		}
	} else {
		// Success (possibly partial)
		scheduled.Status = TaskStatusCompleted
		scheduled.CompletedAt = time.Now()
		scheduled.Progress = 1.0

		// Aggregate results
		if len(allResults) > 0 {
			scheduled.Result = s.aggregateResults(allResults)
		}

		if s.onTaskComplete != nil {
			s.onTaskComplete(scheduled)
		}
	}

	s.mu.Lock()
	s.completedTask = append(s.completedTask, scheduled)
	s.mu.Unlock()
}

// executeOnAgent executes a task on a single agent
func (s *Scheduler) executeOnAgent(scheduled *ScheduledTask, agent *AgentInfo) (*TaskResult, error) {
	ctx := s.ctx
	if s.config.TaskTimeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, s.config.TaskTimeout)
		defer cancel()
	}

	// Create session
	session, err := agent.Connection.CreateSession(ctx, acp.ModeDefault)
	if err != nil {
		return nil, fmt.Errorf("failed to create session: %w", err)
	}

	// Build prompt from task
	prompt := s.buildPromptFromTask(scheduled.Task)

	// Send prompt
	_, err = agent.Connection.SendPrompt(ctx, session.ID, prompt)
	if err != nil {
		return nil, fmt.Errorf("prompt failed: %w", err)
	}

	return &TaskResult{
		TaskID:      scheduled.Task.ID,
		AgentID:     agent.ID,
		Content:     "{}",
		Duration:    time.Since(scheduled.StartedAt),
		StartedAt:   scheduled.StartedAt,
		CompletedAt: time.Now(),
	}, nil
}

// buildPromptFromTask creates an ACP prompt from a task
func (s *Scheduler) buildPromptFromTask(task *Task) acp.Prompt {
	var prompt acp.Prompt

	// Add description as text
	prompt = append(prompt, acp.ContentBlock{
		Type: "text",
		Text: task.Description,
	})

	// Add context if available
	if context, ok := task.Metadata["context"].(string); ok {
		prompt = append(prompt, acp.ContentBlock{
			Type: "text",
			Text: "\nContext:\n" + context,
		})
	}

	// Add file resources if available
	if files, ok := task.Metadata["files"].([]string); ok {
		for _, file := range files {
			prompt = append(prompt, acp.ContentBlock{
				Type: "resource",
				Resource: &acp.Resource{
					URI: "file://" + file,
				},
			})
		}
	}

	return prompt
}

// decomposeTask analyzes and decomposes a complex task
func (s *Scheduler) decomposeTask(ctx context.Context, task *Task) ([]*Task, error) {
	// If coordinator is available, use it for decomposition
	if s.coordinator != nil {
		return s.decomposeWithCoordinator(ctx, task)
	}

	// Otherwise, use rule-based decomposition
	return s.decomposeByRules(task), nil
}

// decomposeWithCoordinator uses the coordinator agent to decompose tasks
func (s *Scheduler) decomposeWithCoordinator(ctx context.Context, task *Task) ([]*Task, error) {
	// Create decomposition prompt
	prompt := acp.Prompt{
		acp.ContentBlock{
			Type: "text",
			Text: fmt.Sprintf(`Analyze the following task and decompose it into subtasks if it's complex enough.

Task: %s
Description: %s

If the task can be decomposed, respond with a JSON array of subtasks:
[
  {"title": "...", "description": "...", "priority": "high|medium|low", "requiredRole": "coder|reviewer|tester|architect"},
  ...
]

If the task should not be decomposed, respond with:
{"decompose": false}

Only output the JSON, no other text.`, task.Title, task.Description),
		},
	}

	session, err := s.coordinator.Connection.CreateSession(ctx, acp.ModePlanning)
	if err != nil {
		return nil, err
	}

	result, err := s.coordinator.Connection.SendPrompt(ctx, session.ID, prompt)
	if err != nil {
		return nil, err
	}

	// Parse decomposition result
	_ = result // Would parse the response to get subtasks

	return []*Task{task}, nil
}

// decomposeByRules decomposes tasks using rule-based logic
func (s *Scheduler) decomposeByRules(task *Task) []*Task {
	// Check for decomposition hints in description
	if !s.shouldDecompose(task) {
		return []*Task{task}
	}

	subtasks := make([]*Task, 0)

	// Check for common patterns
	if strings.Contains(strings.ToLower(task.Description), "and") ||
		strings.Contains(strings.ToLower(task.Description), "then") {
		// Split by conjunctions
		parts := s.splitByConjunctions(task.Description)
		for i, part := range parts {
			subtasks = append(subtasks, &Task{
				ID:          fmt.Sprintf("%s_%d", task.ID, i),
				ParentID:    task.ID,
				Title:       fmt.Sprintf("%s (Part %d)", task.Title, i+1),
				Description: part,
				Priority:    task.Priority,
				State:       TaskStatePending,
				CreatedAt:   time.Now(),
				Metadata:    task.Metadata,
			})
		}
	}

	if len(subtasks) == 0 {
		return []*Task{task}
	}

	return subtasks
}

// shouldDecompose determines if a task should be decomposed
func (s *Scheduler) shouldDecompose(task *Task) bool {
	// Check complexity indicators
	wordCount := len(strings.Fields(task.Description))
	if wordCount > 50 {
		return true
	}

	// Check for multiple actions
	actionWords := []string{"implement", "write", "create", "update", "refactor", "test", "review"}
	actionCount := 0
	lowerDesc := strings.ToLower(task.Description)
	for _, word := range actionWords {
		if strings.Contains(lowerDesc, word) {
			actionCount++
		}
	}

	return actionCount >= 2
}

// splitByConjunctions splits a description by conjunctions
func (s *Scheduler) splitByConjunctions(desc string) []string {
	// Simple split by common conjunctions
	separators := []string{" and ", " then ", ", then ", "; ", "\n\n"}

	result := []string{desc}
	for _, sep := range separators {
		var newResult []string
		for _, part := range result {
			split := strings.Split(part, sep)
			for _, s := range split {
				s = strings.TrimSpace(s)
				if s != "" {
					newResult = append(newResult, s)
				}
			}
		}
		result = newResult
	}

	return result
}

// aggregateResults combines results from multiple agents
func (s *Scheduler) aggregateResults(results []*TaskResult) *TaskResult {
	if len(results) == 0 {
		return nil
	}

	if len(results) == 1 {
		return results[0]
	}

	// Aggregate outputs
	aggregated := &TaskResult{
		TaskID: results[0].TaskID,
	}

	// Combine files changed
	fileSet := make(map[string]bool)
	for _, r := range results {
		for _, f := range r.FilesChanged {
			fileSet[f] = true
		}
	}
	for f := range fileSet {
		aggregated.FilesChanged = append(aggregated.FilesChanged, f)
	}

	// Combine artifacts
	for _, r := range results {
		aggregated.Artifacts = append(aggregated.Artifacts, r.Artifacts...)
	}

	// Calculate total duration
	var totalDuration time.Duration
	for _, r := range results {
		totalDuration += r.Duration
	}
	aggregated.Duration = totalDuration / time.Duration(len(results))

	return aggregated
}

// progressMonitor monitors task progress
func (s *Scheduler) progressMonitor() {
	defer s.wg.Done()

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			s.mu.RLock()
			for _, task := range s.runningTasks {
				// Calculate progress based on time elapsed
				elapsed := time.Since(task.StartedAt)
				if s.config.TaskTimeout > 0 {
					task.Progress = math.Min(1.0, float64(elapsed)/float64(s.config.TaskTimeout))
				}

				if s.onProgress != nil {
					s.onProgress(task.Task.ID, task.Progress)
				}
			}
			s.mu.RUnlock()
		}
	}
}

// GetStats returns scheduler statistics
func (s *Scheduler) GetStats() *SchedulerStats {
	s.mu.RLock()
	defer s.mu.RUnlock()

	running := len(s.runningTasks)
	completed := len(s.completedTask)
	pending := s.pendingQueue.Len()

	avgLoad := 0.0
	for _, agent := range s.workers {
		avgLoad += float64(agent.GetLoad())
	}
	if len(s.workers) > 0 {
		avgLoad /= float64(len(s.workers))
	}

	return &SchedulerStats{
		PendingTasks:   pending,
		RunningTasks:   running,
		CompletedTasks: completed,
		TotalWorkers:   len(s.workers),
		AverageLoad:    avgLoad,
		QueueLength:    pending,
	}
}

// SchedulerStats holds scheduler statistics
type SchedulerStats struct {
	PendingTasks   int     `json:"pendingTasks"`
	RunningTasks   int     `json:"runningTasks"`
	CompletedTasks int     `json:"completedTasks"`
	TotalWorkers   int     `json:"totalWorkers"`
	AverageLoad    float64 `json:"averageLoad"`
	QueueLength    int     `json:"queueLength"`
}

// OnTaskStart registers a callback for task start events
func (s *Scheduler) OnTaskStart(fn func(task *ScheduledTask)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onTaskStart = fn
}

// OnTaskComplete registers a callback for task completion events
func (s *Scheduler) OnTaskComplete(fn func(task *ScheduledTask)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onTaskComplete = fn
}

// OnTaskFail registers a callback for task failure events
func (s *Scheduler) OnTaskFail(fn func(task *ScheduledTask, err error)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onTaskFail = fn
}

// OnProgress registers a callback for progress updates
func (s *Scheduler) OnProgress(fn func(taskID string, progress float64)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onProgress = fn
}
