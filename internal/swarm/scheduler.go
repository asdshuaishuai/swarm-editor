// Package swarm implements intelligent swarm scheduling
package swarm

import (
	"context"
	"encoding/json"
	"fmt"
	"maps"
	"math"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/log"
)

// schedulerLog is a scoped logger for the Scheduler component.
var schedulerLog = log.With("component", "Scheduler")

const maxSchedulerDLQEntries = 100 // Max in-memory DLQ entries

// Scheduler manages intelligent task scheduling across agents
type Scheduler struct {
	mu sync.RWMutex

	// Configuration
	config SchedulerConfig

	// Fallback configuration (CrewAI-inspired cascading fallback)
	fallbackConfig FallbackConfig

	// Agent pool
	coordinator *AgentInfo
	workers     map[string]*AgentInfo

	// Task management - use unified TaskQueue
	pendingQueue  *TaskQueue
	runningTasks  map[string]*ScheduledTask
	completedTask []*ScheduledTask
	completedIDs  map[string]bool // Fast lookup for dependency resolution
	failedIDs     map[string]bool // Track failed tasks for dependency failure propagation

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

	// Rate limiter for backpressure (CrewAI-inspired)
	rateLimiter *RateLimiter

	// Dead Letter Queue for tasks that exhausted retries (Temporal-inspired)
	dlq *schedulerDLQ

	// Health provider for fallback (decoupled from Supervisor)
	healthProvider AgentHealthProvider
}

// SchedulerConfig configures the scheduler
type SchedulerConfig struct {
	MaxConcurrentTasks  int           `json:"maxConcurrentTasks"`
	TaskTimeout         time.Duration `json:"taskTimeout"`
	RetryCount          int           `json:"retryCount"`
	RetryDelay          time.Duration `json:"retryDelay"`
	LoadBalanceStrategy string        `json:"loadBalanceStrategy"` // "round_robin", "least_loaded", "priority", "capability"
	OverloadThreshold   float64       `json:"overloadThreshold"`   // 0.0-1.0, load ratio to consider agent overloaded
	RebalanceInterval   time.Duration `json:"rebalanceInterval"`   // How often to check for rebalancing
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
	mu               sync.RWMutex
	currentLoad      int
	totalTasks       int
	successCount     int // Total successful tasks (for accurate success rate)
	successRate      float64
	consecutiveFails int

	// Circuit breaker for health management
	circuitBreaker *CircuitBreaker
}

// IncrementLoad atomically increments the agent's current load.
// Note: totalTasks is only incremented in RecordResult to avoid double-counting
// (each task is counted once on completion, not once on assignment + once on completion).
func (a *AgentInfo) IncrementLoad() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.currentLoad++
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

// GetSuccessRate returns the agent's task success rate (0.0-1.0)
func (a *AgentInfo) GetSuccessRate() float64 {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.successRate
}

// GetConsecutiveFails returns the number of consecutive task failures
func (a *AgentInfo) GetConsecutiveFails() int {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.consecutiveFails
}

// RecordResult updates success/failure tracking after a task completes
func (a *AgentInfo) RecordResult(success bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.totalTasks++
	if success {
		a.successCount++
		a.consecutiveFails = 0
	} else {
		a.consecutiveFails++
	}
	// Calculate success rate as successes / total (not 1 - consecutiveFails/total)
	if a.totalTasks > 0 {
		a.successRate = float64(a.successCount) / float64(a.totalTasks)
	}

	// Update circuit breaker
	if a.circuitBreaker != nil {
		if success {
			a.circuitBreaker.RecordSuccess()
		} else {
			a.circuitBreaker.RecordFailure()
		}
	}
}

// IsHealthy returns true if the agent is not in a degraded state.
// Uses circuit breaker state when available, falls back to simple check.
func (a *AgentInfo) IsHealthy() bool {
	a.mu.RLock()
	defer a.mu.RUnlock()

	// Use circuit breaker if available
	if a.circuitBreaker != nil {
		return a.circuitBreaker.IsHealthy()
	}
	// Fallback to simple check
	return a.consecutiveFails < 3
}

// AllowRequest checks if a request should be allowed through the circuit breaker.
// Returns true if the request can proceed, false if it should be rejected.
func (a *AgentInfo) AllowRequest() bool {
	a.mu.RLock()
	cb := a.circuitBreaker
	a.mu.RUnlock()

	if cb == nil {
		return true // No circuit breaker, allow by default
	}
	return cb.Allow()
}

// GetCircuitBreakerStats returns the circuit breaker statistics.
// Returns nil if circuit breaker is not initialized.
func (a *AgentInfo) GetCircuitBreakerStats() *CircuitBreakerStats {
	a.mu.RLock()
	cb := a.circuitBreaker
	a.mu.RUnlock()

	if cb == nil {
		return nil
	}
	stats := cb.GetStats()
	return &stats
}

// initCircuitBreaker initializes the circuit breaker with the given config.
func (a *AgentInfo) initCircuitBreaker(config CircuitBreakerConfig) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.circuitBreaker != nil {
		a.circuitBreaker.Close()
	}
	a.circuitBreaker = NewCircuitBreaker(config)
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
	Trace       *PropagationContext // Trace propagation for observability
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
	if config.OverloadThreshold <= 0 {
		config.OverloadThreshold = 0.8 // 80% of max concurrent
	}
	if config.RebalanceInterval <= 0 {
		config.RebalanceInterval = 30 * time.Second
	}

	return &Scheduler{
		config:         config,
		fallbackConfig: DefaultFallbackConfig(),
		workers:        make(map[string]*AgentInfo),
		pendingQueue:   NewTaskQueue(),
		runningTasks:   make(map[string]*ScheduledTask),
		completedTask:  make([]*ScheduledTask, 0),
		completedIDs:   make(map[string]bool),
		failedIDs:      make(map[string]bool),
		connections:    connections,
		rateLimiter:    NewRateLimiter(DefaultRateLimitConfig()),
		dlq:            &schedulerDLQ{entries: make(map[string]*dlqEntry)},
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
	// Initialize circuit breaker (idempotent - checks under agent.mu internally)
	agent.initCircuitBreaker(DefaultCircuitBreakerConfig())
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

// GetAgents returns all agent connections, satisfying the AgentListProvider interface
// This enables FallbackChain to select from available agents
func (s *Scheduler) GetAgents() []*acp.AgentConnection {
	s.mu.RLock()
	defer s.mu.RUnlock()

	conns := make([]*acp.AgentConnection, 0, len(s.workers))
	for _, agent := range s.workers {
		if agent.Connection != nil {
			conns = append(conns, agent.Connection)
		}
	}
	return conns
}

// SetHealthProvider sets the health provider for fallback decisions
func (s *Scheduler) SetHealthProvider(provider AgentHealthProvider) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.healthProvider = provider
}

// SetFallbackConfig configures fallback behavior
func (s *Scheduler) SetFallbackConfig(config FallbackConfig) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.fallbackConfig = config
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
	s.wg.Go(s.schedulerLoop)

	// Start progress monitor
	s.wg.Go(s.progressMonitor)

	// Start rebalance monitor
	s.wg.Go(s.rebalanceMonitor)

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
		return nil, fmt.Errorf("decompose task: %w", err)
	}

	if len(subtasks) > 1 {
		// Submit all subtasks
		for _, st := range subtasks {
			if err := s.SubmitTask(st); err != nil {
				return nil, fmt.Errorf("submit subtask %q: %w", st.Title, err)
			}
		}
		return subtasks, nil
	}

	// Submit single task
	if err := s.SubmitTask(task); err != nil {
		return nil, fmt.Errorf("submit task: %w", err)
	}

	return []*Task{task}, nil
}

// schedulerLoop is the main scheduling loop
func (s *Scheduler) schedulerLoop() {
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

// scheduleNext schedules the next pending task that has all dependencies satisfied
func (s *Scheduler) scheduleNext() {
	s.mu.Lock()

	// Check if we can run more tasks
	if len(s.runningTasks) >= s.config.MaxConcurrentTasks {
		s.mu.Unlock()
		return
	}

	// Snapshot queue length to bound iteration — prevents infinite churn
	// when all tasks have unsatisfied dependencies
	queueLen := s.pendingQueue.Len()
	if queueLen == 0 {
		s.mu.Unlock()
		return
	}

	for range queueLen {
		task := s.pendingQueue.Pop()
		if task == nil {
			s.mu.Unlock()
			return
		}

		// Check if any dependency has failed — if so, fail this task immediately
		if s.hasFailedDependency(task) {
			task.State = TaskStateFailed
			task.Error = "dependency failed"
			s.failedIDs[task.ID] = true
			schedulerLog.Info("Task skipped: dependency failed", "task_id", task.ID)
			s.completedTask = append(s.completedTask, scheduledFromFailed(task))
			continue
		}

		// Check if all dependencies are satisfied (DAG-aware scheduling)
		if !task.IsReady(s.completedIDs) {
			// Put back at the end of the queue — dependencies not yet met
			s.pendingQueue.Push(task)
			continue
		}

		// Select best agents for this task
		agents := s.selectAgentsForTask(task)
		if len(agents) == 0 {
			// Track pre-execution scheduling failures to prevent infinite queue loop
			task.mu.Lock()
			task.scheduleRetries++
			retries := task.scheduleRetries
			task.mu.Unlock()

			maxScheduleRetries := 10
			if retries >= maxScheduleRetries {
				schedulerLog.Error("Task failed after schedule retries: no capable agents", "task_id", task.ID, "retries", retries)
				task.Fail(fmt.Errorf("no capable agents found after %d scheduling attempts", retries))
				s.completedTask = append(s.completedTask, scheduledFromFailed(task))
				continue
			}
			s.pendingQueue.Push(task)
			continue
		}

		// Create scheduled task with trace propagation
		trace := NewPropagationContext("")
		if task.ParentID != "" {
			// Child task: inherit trace from parent if available
			if parent, ok := s.runningTasks[task.ParentID]; ok && parent.Trace != nil {
				trace = parent.Trace.Child(task.ID, "")
			}
		}
		scheduled := &ScheduledTask{
			Task:       task,
			AssignedTo: agents,
			StartedAt:  time.Now(),
			Status:     TaskStatusRunning,
			Trace:      trace,
		}

		s.runningTasks[task.ID] = scheduled

		// Snapshot rate limiter reference before releasing lock
		rateLimiter := s.rateLimiter

		// Release lock before blocking rate limit wait to avoid blocking other operations
		s.mu.Unlock()

		// Wait for rate limit token before spawning (backpressure)
		// This prevents overwhelming agents with too many concurrent tasks
		rateLimitErr := error(nil)
		if rateLimiter != nil {
			if err := rateLimiter.WaitGlobal(s.ctx); err != nil {
				rateLimitErr = err
			} else {
				for _, agent := range agents {
					if err := rateLimiter.WaitAgent(s.ctx, agent.ID); err != nil {
						rateLimitErr = err
						break
					}
				}
			}
		}

		// Re-acquire lock to update state
		s.mu.Lock()
		if rateLimitErr != nil {
			// Context cancelled or rate limit error — put task back
			delete(s.runningTasks, task.ID)
			s.pendingQueue.Push(task)
			s.mu.Unlock()
			return
		}

		// Verify task wasn't cancelled while we waited
		if _, stillRunning := s.runningTasks[task.ID]; !stillRunning {
			s.mu.Unlock()
			return
		}

		// Start task execution (tracked by WaitGroup for graceful shutdown)
		s.wg.Go(func() {
			defer func() {
				if r := recover(); r != nil {
					schedulerLog.Error("executeTask panic", "task_id", scheduled.Task.ID, "error", r)
				}
			}()
			s.executeTask(scheduled)
		})
		s.mu.Unlock()
		return // Only schedule one task per tick
	}

	s.mu.Unlock()
}

// selectAgentsForTask selects the best agents for a task
func (s *Scheduler) selectAgentsForTask(task *Task) []*AgentInfo {
	var candidates []*AgentInfo

	// Filter agents by capability, load, and health (circuit-breaker)
	for _, agent := range s.workers {
		// Circuit-breaker: use Allow() for full three-state check
		if !agent.AllowRequest() {
			continue
		}
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
		// Use fallback chain when no healthy agents found
		return s.selectFallbackAgent(task)
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

// selectFallbackAgent uses FallbackChain to find an agent when none are healthy.
// IMPORTANT: Must be called while holding s.mu lock. Uses StaticAgentListProvider
// to avoid deadlock from calling GetAgents() which would try to re-acquire the lock.
// Note: NextAgent may perform blocking I/O (health checks) while holding s.mu.
// This is a known design limitation — fixing requires refactoring selectAgentsForTask
// to release the lock before the fallback path.
func (s *Scheduler) selectFallbackAgent(task *Task) []*AgentInfo {
	// Collect agents while holding lock, pass as static list to avoid lock re-entry
	conns := make([]*acp.AgentConnection, 0, len(s.workers))
	for _, agent := range s.workers {
		if agent.Connection != nil {
			conns = append(conns, agent.Connection)
		}
	}
	staticProvider := NewStaticAgentListProvider(conns)

	fallback := NewFallbackChain(task.ID, s.fallbackConfig, staticProvider, s.healthProvider)

	conn, err := fallback.NextAgent(s.ctx)
	if err != nil {
		schedulerLog.Error("Fallback failed", "task_id", task.ID, "error", err)
		return nil
	}

	// Find the AgentInfo for this connection
	for _, agent := range s.workers {
		if agent.Connection != nil && agent.Connection.ID == conn.ID {
			return []*AgentInfo{agent}
		}
	}

	return nil
}

// selectLeastLoaded selects the agent with the least current load
func (s *Scheduler) selectLeastLoaded(agents []*AgentInfo) []*AgentInfo {
	if len(agents) == 0 {
		return nil
	}
	// Copy to avoid mutating caller's slice
	sorted := make([]*AgentInfo, len(agents))
	copy(sorted, agents)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].GetLoad() < sorted[j].GetLoad()
	})
	return []*AgentInfo{sorted[0]}
}

// selectByPriority selects agents by priority
func (s *Scheduler) selectByPriority(agents []*AgentInfo) []*AgentInfo {
	if len(agents) == 0 {
		return nil
	}
	// Copy to avoid mutating caller's slice
	sorted := make([]*AgentInfo, len(agents))
	copy(sorted, agents)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].Priority > sorted[j].Priority
	})
	return []*AgentInfo{sorted[0]}
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
	// Pick agent with lowest current load (active concurrent tasks)
	minLoad := math.MaxInt32
	var selected *AgentInfo

	for _, agent := range agents {
		load := agent.GetLoad()
		if load < minLoad {
			minLoad = load
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
	score += agent.GetSuccessRate() * 5.0

	// Load penalty
	score -= float64(agent.GetLoad()) * 2.0

	return score
}

// agentHasRole checks if an agent has a specific role
func (s *Scheduler) agentHasRole(agent *AgentInfo, role string) bool {
	return slices.Contains(agent.Roles, role)
}

// executeTask executes a task on assigned agents
func (s *Scheduler) executeTask(scheduled *ScheduledTask) {
	task := scheduled.Task

	// Snapshot AssignedTo under lock to avoid race with migrateTask
	s.mu.RLock()
	assignedTo := make([]*AgentInfo, len(scheduled.AssignedTo))
	copy(assignedTo, scheduled.AssignedTo)
	s.mu.RUnlock()

	schedulerLog.Info("Starting task execution", "task_id", task.ID, "agents", len(assignedTo))

	// Notify callback (snapshot under lock to avoid race)
	s.mu.RLock()
	onStart := s.onTaskStart
	s.mu.RUnlock()
	if onStart != nil {
		onStart(scheduled)
	}

	// Update agent load and record in trace
	for _, agent := range assignedTo {
		agent.IncrementLoad()
		if scheduled.Trace != nil {
			scheduled.Trace.RecordAgent(agent.ID)
		}
	}

	// Execute on each agent
	var wg sync.WaitGroup
	results := make(chan *TaskResult, len(assignedTo))
	errors := make(chan error, len(assignedTo))

	for _, agent := range assignedTo {
		wg.Add(1)
		go func(a *AgentInfo) {
			defer func() {
				if r := recover(); r != nil {
					schedulerLog.Error("executeOnAgent panic", "agent_id", a.ID, "error", r)
				}
				wg.Done()
			}()

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

	// Update agent load — re-read current AssignedTo (not stale snapshot) to handle
	// concurrent migration correctly (migrateTask may have changed AssignedTo).
	s.mu.RLock()
	currentAssigned := make([]*AgentInfo, len(scheduled.AssignedTo))
	copy(currentAssigned, scheduled.AssignedTo)
	s.mu.RUnlock()

	for _, agent := range currentAssigned {
		agent.DecrementLoad()
	}

	// Handle completion
	s.mu.Lock()
	delete(s.runningTasks, task.ID)
	s.mu.Unlock()

	if len(allErrors) > 0 && len(allResults) == 0 {
		// All failed - try fallback chain for cascading retries
		scheduled.Status = TaskStatusFailed
		scheduled.Error = allErrors[0]
		schedulerLog.Error("Task failed", "task_id", task.ID, "error", allErrors[0])

		// Mark failed agents as attempted in fallback chain
		s.mu.RLock()
		fallbackConfig := s.fallbackConfig
		healthProvider := s.healthProvider
		s.mu.RUnlock()
		fallback := NewFallbackChain(task.ID, fallbackConfig, s, healthProvider)
		for _, agent := range assignedTo {
			fallback.MarkAttempted(agent.ID)
		}

		// Try to get next agent from fallback chain
		nextConn, fallbackErr := fallback.NextAgent(s.ctx)
		if fallbackErr == nil && nextConn != nil {
			// Find AgentInfo for the fallback connection (snapshot workers under lock)
			s.mu.RLock()
			var nextAgent *AgentInfo
			for _, agent := range s.workers {
				if agent.Connection != nil && agent.Connection.ID == nextConn.ID {
					nextAgent = agent
					break
				}
			}
			s.mu.RUnlock()

			if nextAgent != nil {
				schedulerLog.Warn("Task falling back to agent",
					"task_id", task.ID, "agent_id", nextAgent.ID, "remaining", fallback.RemainingAttempts())

				// Use select with context for cancellable delay
				timer := time.NewTimer(s.config.RetryDelay)
				defer timer.Stop()
				select {
				case <-s.ctx.Done():
					schedulerLog.Info("Context cancelled, aborting fallback", "task_id", task.ID)
					scheduled.Status = TaskStatusFailed
					s.mu.RLock()
					onFail := s.onTaskFail
					s.mu.RUnlock()
					if onFail != nil {
						onFail(scheduled, s.ctx.Err())
					}
					s.mu.Lock()
					s.failedIDs[task.ID] = true
					cbs := s.propagateFailure(task.ID)
					s.completedTask = append(s.completedTask, scheduled)
					s.mu.Unlock()
					for _, cb := range cbs {
						cb()
					}
					return
				case <-timer.C:
					// Delay completed, proceed with fallback
				}

				// Execute on fallback agent
				scheduled.AssignedTo = []*AgentInfo{nextAgent}
				scheduled.RetryCount++
				scheduled.Status = TaskStatusRetrying
				nextAgent.IncrementLoad()

				result, execErr := s.executeOnAgent(scheduled, nextAgent)
				nextAgent.DecrementLoad()

				if execErr == nil && result != nil {
					// Fallback succeeded — update under lock to avoid race with progressMonitor
					s.mu.Lock()
					scheduled.Status = TaskStatusCompleted
					scheduled.CompletedAt = time.Now()
					scheduled.Progress = 1.0
					scheduled.Result = result
					s.mu.Unlock()
					schedulerLog.Info("Task completed via fallback", "task_id", task.ID, "agent_id", nextAgent.ID)
					s.mu.RLock()
					onComplete := s.onTaskComplete
					s.mu.RUnlock()
					if onComplete != nil {
						onComplete(scheduled)
					}
					s.mu.Lock()
					s.completedIDs[task.ID] = true
					s.completedTask = append(s.completedTask, scheduled)
					s.mu.Unlock()
					return
				}
				schedulerLog.Error("Fallback agent also failed", "agent_id", nextAgent.ID, "task_id", task.ID, "error", execErr)
			}
		}

		// Check for traditional retry with proper cancellation support
		if scheduled.RetryCount < s.config.RetryCount {
			scheduled.RetryCount++
			scheduled.Status = TaskStatusRetrying
			schedulerLog.Info("Scheduling retry", "task_id", task.ID, "attempt", scheduled.RetryCount, "max", s.config.RetryCount)

			// Use select with context for cancellable delay
			timer := time.NewTimer(s.config.RetryDelay)
			defer timer.Stop()
			select {
			case <-s.ctx.Done():
				// Context cancelled, don't retry
				schedulerLog.Info("Context cancelled, aborting retry", "task_id", task.ID)
				scheduled.Status = TaskStatusFailed
				s.mu.RLock()
				onFail := s.onTaskFail
				s.mu.RUnlock()
				if onFail != nil {
					onFail(scheduled, s.ctx.Err())
				}
				s.mu.Lock()
				s.failedIDs[task.ID] = true
				cbs := s.propagateFailure(task.ID)
				s.completedTask = append(s.completedTask, scheduled)
				s.mu.Unlock()
				for _, cb := range cbs {
					cb()
				}
				return
			case <-timer.C:
				// Delay completed, proceed with retry
			}

			// Re-queue for retry instead of direct recursive call
			s.mu.Lock()
			task.State = TaskStatePending
			s.pendingQueue.Push(task)
			s.mu.Unlock()
			schedulerLog.Info("Task re-queued for retry", "task_id", task.ID)
			return
		}

		schedulerLog.Error("Task failed after retries", "task_id", task.ID, "retries", scheduled.RetryCount)

		// Send to Dead Letter Queue for observability
		s.mu.Lock()
		var assignedAgent string
		if len(scheduled.AssignedTo) > 0 {
			assignedAgent = scheduled.AssignedTo[0].ID
		}
		traceID := ""
		if scheduled.Trace != nil {
			traceID = scheduled.Trace.TraceID
		}
		s.dlq.add(scheduled.Task.ID, scheduled.Task.Title, assignedAgent, traceID, allErrors[0], scheduled.RetryCount)
		s.mu.Unlock()

		s.mu.RLock()
		onFail := s.onTaskFail
		s.mu.RUnlock()
		if onFail != nil {
			onFail(scheduled, allErrors[0])
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

		schedulerLog.Info("Task completed successfully", "task_id", task.ID, "results", len(allResults))
		s.mu.RLock()
		onComplete := s.onTaskComplete
		s.mu.RUnlock()
		if onComplete != nil {
			onComplete(scheduled)
		}
	}

	s.mu.Lock()
	// Track task outcome for dependency resolution
	var failCbs []func()
	if scheduled.Status == TaskStatusCompleted {
		s.completedIDs[task.ID] = true
	} else {
		s.failedIDs[task.ID] = true
		failCbs = s.propagateFailure(task.ID)
	}
	// Append BEFORE trim so the rebuilt maps include the current task
	s.completedTask = append(s.completedTask, scheduled)
	// Limit completed tasks history to prevent memory leak
	maxCompleted := 1000
	if len(s.completedTask) >= maxCompleted {
		// Trim completedTask and sync ID maps to prevent memory leak
		trimmed := s.completedTask[len(s.completedTask)-maxCompleted/2:]
		// Rebuild ID maps from trimmed slice to evict stale entries
		newCompletedIDs := make(map[string]bool, len(trimmed))
		newFailedIDs := make(map[string]bool)
		for _, t := range trimmed {
			if t.Status == TaskStatusCompleted {
				newCompletedIDs[t.Task.ID] = true
			} else {
				newFailedIDs[t.Task.ID] = true
			}
		}
		s.completedIDs = newCompletedIDs
		s.failedIDs = newFailedIDs
		s.completedTask = trimmed
	}
	s.mu.Unlock()
	for _, cb := range failCbs {
		cb()
	}
}

// executeOnAgent executes a task on a single agent with error recovery
func (s *Scheduler) executeOnAgent(scheduled *ScheduledTask, agent *AgentInfo) (*TaskResult, error) {
	s.mu.RLock()
	ctx := s.ctx
	s.mu.RUnlock()
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
	if err == nil {
		return &TaskResult{
			TaskID:      scheduled.Task.ID,
			AgentID:     agent.ID,
			Content:     "{}",
			Duration:    time.Since(scheduled.StartedAt),
			StartedAt:   scheduled.StartedAt,
			CompletedAt: time.Now(),
		}, nil
	}

	// Error recovery: retry with error context appended (OpenAI Swarm pattern)
	// This gives the agent a chance to self-correct
	// Create a new session for recovery since the original session may be in a bad state
	if scheduled.Task.MaxTurns > 0 && scheduled.Task.TurnCount >= scheduled.Task.MaxTurns {
		return nil, fmt.Errorf("prompt failed: %w (max_turns reached)", err)
	}

	recoverySession, recoveryErr := agent.Connection.CreateSession(ctx, acp.ModeDefault)
	if recoveryErr != nil {
		return nil, fmt.Errorf("prompt failed: %w (recovery session creation also failed: %v)", err, recoveryErr)
	}

	recoveryPrompt := append(acp.Prompt(nil), acp.ContentBlock{
		Type: "text",
		Text: fmt.Sprintf("[Previous attempt failed with error: %s. Please retry with a different approach.]", err.Error()),
	})
	recoveryPrompt = append(recoveryPrompt, prompt...)

	_, recoveryErr = agent.Connection.SendPrompt(ctx, recoverySession.ID, recoveryPrompt)
	if recoveryErr != nil {
		return nil, fmt.Errorf("prompt failed: %w (recovery also failed: %v)", err, recoveryErr)
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
	s.mu.RLock()
	coord := s.coordinator
	s.mu.RUnlock()
	if coord != nil {
		return s.decomposeWithCoordinator(ctx, task, coord)
	}

	// Otherwise, use rule-based decomposition
	return s.decomposeByRules(task), nil
}

// decomposeWithCoordinator uses the coordinator agent to decompose tasks
func (s *Scheduler) decomposeWithCoordinator(ctx context.Context, task *Task, coord *AgentInfo) ([]*Task, error) {
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

	if coord.Connection == nil {
		return nil, fmt.Errorf("coordinator has no active connection")
	}
	session, err := coord.Connection.CreateSession(ctx, acp.ModePlanning)
	if err != nil {
		return nil, err
	}

	// Set up content capture before sending prompt
	session.StartContentCapture()

	// Wire up the OnUpdate callback to capture content
	coord.Connection.OnUpdate(func(sid acp.SessionID, update *acp.Update) {
		if sid == session.ID && update.Content != nil {
			// Capture content block from the update
			session.AddContent(*update.Content)
		}
	})

	result, err := coord.Connection.SendPrompt(ctx, session.ID, prompt)
	if err != nil {
		session.FinishContentCapture()
		return nil, err
	}

	// Finish content capture and get the captured content
	session.FinishContentCapture()
	content := session.GetContent()
	_ = result // StopReason is in result, content is captured via updates

	// Parse decomposition result from captured content
	subtasks, err := s.parseDecompositionResponse(content, task)
	if err != nil {
		// If parsing fails, return original task
		return []*Task{task}, nil
	}

	return subtasks, nil
}

// SubtaskDefinition represents a subtask from coordinator's decomposition
type SubtaskDefinition struct {
	Title        string `json:"title"`
	Description  string `json:"description"`
	Priority     string `json:"priority"`
	RequiredRole string `json:"requiredRole"`
}

// DecomposeDecision represents the decision not to decompose
type DecomposeDecision struct {
	Decompose bool `json:"decompose"`
}

// parseDecompositionResponse parses the coordinator's response to extract subtasks
func (s *Scheduler) parseDecompositionResponse(content []acp.ContentBlock, originalTask *Task) ([]*Task, error) {
	if len(content) == 0 {
		return nil, fmt.Errorf("no content captured")
	}

	// Find text content block
	var textContent string
	for _, block := range content {
		if block.Type == "text" && block.Text != "" {
			textContent = block.Text
			break
		}
	}

	if textContent == "" {
		return nil, fmt.Errorf("no text content found")
	}

	// Clean up the text - remove markdown code blocks if present
	textContent = strings.TrimSpace(textContent)
	if after, ok := strings.CutPrefix(textContent, "```json"); ok {
		textContent = strings.TrimSuffix(after, "```")
		textContent = strings.TrimSpace(textContent)
	} else if after, ok := strings.CutPrefix(textContent, "```"); ok {
		textContent = strings.TrimSuffix(after, "```")
		textContent = strings.TrimSpace(textContent)
	}

	// Try to parse as decomposition decision first
	var decision DecomposeDecision
	if err := json.Unmarshal([]byte(textContent), &decision); err == nil && !decision.Decompose {
		// Coordinator decided not to decompose
		return []*Task{originalTask}, nil
	}

	// Try to parse as array of subtasks
	var definitions []SubtaskDefinition
	if err := json.Unmarshal([]byte(textContent), &definitions); err != nil {
		return nil, fmt.Errorf("failed to parse subtasks: %w", err)
	}

	if len(definitions) == 0 {
		return []*Task{originalTask}, nil
	}

	// Convert definitions to Task objects
	subtasks := make([]*Task, 0, len(definitions))
	for i, def := range definitions {
		priority := PriorityMedium
		switch strings.ToLower(def.Priority) {
		case "high":
			priority = PriorityHigh
		case "low":
			priority = PriorityLow
		}

		subtask := &Task{
			ID:          fmt.Sprintf("%s_%d", originalTask.ID, i+1),
			ParentID:    originalTask.ID,
			Title:       def.Title,
			Description: def.Description,
			Priority:    priority,
			State:       TaskStatePending,
			CreatedAt:   time.Now(),
			Metadata:    make(map[string]any),
		}

		if def.RequiredRole != "" {
			subtask.Metadata["requiredRole"] = def.RequiredRole
		}

		subtasks = append(subtasks, subtask)
	}

	return subtasks, nil
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
			// Copy metadata to avoid shared pointer mutation across subtasks
			metadata := make(map[string]any, len(task.Metadata))
			maps.Copy(metadata, task.Metadata)

			subtask := &Task{
				ID:          fmt.Sprintf("%s_%d", task.ID, i),
				ParentID:    task.ID,
				Title:       fmt.Sprintf("%s (Part %d)", task.Title, i+1),
				Description: part,
				Priority:    task.Priority,
				State:       TaskStatePending,
				CreatedAt:   time.Now(),
				Metadata:    metadata,
			}

			// Sequential dependency: each subtask depends on the previous one
			// This implements CrewAI's task chain pattern where tasks form a pipeline
			if i > 0 && len(subtasks) > 0 {
				subtask.Dependencies = []string{subtasks[i-1].ID}
			}

			subtasks = append(subtasks, subtask)
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
			for s := range strings.SplitSeq(part, sep) {
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
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			s.mu.Lock()
			onProgress := s.onProgress
			var progressUpdates []struct {
				id       string
				progress float64
			}
			for _, task := range s.runningTasks {
				// Calculate progress based on time elapsed
				elapsed := time.Since(task.StartedAt)
				if s.config.TaskTimeout > 0 {
					task.Progress = min(1.0, float64(elapsed)/float64(s.config.TaskTimeout))
				}
				progressUpdates = append(progressUpdates, struct {
					id       string
					progress float64
				}{task.Task.ID, task.Progress})
			}
			s.mu.Unlock()

			if onProgress != nil {
				for _, pu := range progressUpdates {
					onProgress(pu.id, pu.progress)
				}
			}
		}
	}
}

// rebalanceMonitor periodically checks for overloaded agents and rebalances tasks
func (s *Scheduler) rebalanceMonitor() {
	ticker := time.NewTicker(s.config.RebalanceInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			s.checkAndRebalance()
		}
	}
}

// checkAndRebalance checks for overloaded agents and migrates low-priority tasks
func (s *Scheduler) checkAndRebalance() {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Find overloaded agents
	overloaded := s.findOverloadedAgents()
	if len(overloaded) == 0 {
		return
	}

	// Find underutilized agents
	underutilized := s.findUnderutilizedAgents()
	if len(underutilized) == 0 {
		return
	}

	// Migrate low-priority tasks from overloaded to underutilized agents
	for _, overloadedAgent := range overloaded {
		// Find low-priority tasks on this agent
		lowPriorityTasks := s.findLowPriorityTasksForAgent(overloadedAgent.ID)
		for _, task := range lowPriorityTasks {
			// Find best underutilized agent for this task
			targetAgent := s.selectBestAgentForMigration(task, underutilized)
			if targetAgent != nil {
				// Migrate the task
				s.migrateTask(task, overloadedAgent, targetAgent)
			}
		}
	}
}

// findOverloadedAgents returns agents that are above the overload threshold
func (s *Scheduler) findOverloadedAgents() []*AgentInfo {
	var overloaded []*AgentInfo
	for _, agent := range s.workers {
		if agent.MaxConcurrent <= 0 {
			continue
		}
		loadRatio := float64(agent.GetLoad()) / float64(agent.MaxConcurrent)
		if loadRatio >= s.config.OverloadThreshold {
			overloaded = append(overloaded, agent)
		}
	}
	return overloaded
}

// findUnderutilizedAgents returns agents with low load that can accept more tasks
func (s *Scheduler) findUnderutilizedAgents() []*AgentInfo {
	var underutilized []*AgentInfo
	for _, agent := range s.workers {
		if agent.MaxConcurrent <= 0 {
			continue
		}
		loadRatio := float64(agent.GetLoad()) / float64(agent.MaxConcurrent)
		// Underutilized means less than 50% of capacity
		if loadRatio < 0.5 {
			underutilized = append(underutilized, agent)
		}
	}
	return underutilized
}

// findLowPriorityTasksForAgent finds low priority tasks assigned to a specific agent
func (s *Scheduler) findLowPriorityTasksForAgent(agentID string) []*ScheduledTask {
	var lowPriority []*ScheduledTask
	for _, task := range s.runningTasks {
		for _, agent := range task.AssignedTo {
			if agent.ID == agentID && task.Task.Priority <= PriorityLow {
				lowPriority = append(lowPriority, task)
				break
			}
		}
	}
	return lowPriority
}

// selectBestAgentForMigration selects the best underutilized agent for task migration
func (s *Scheduler) selectBestAgentForMigration(task *ScheduledTask, candidates []*AgentInfo) *AgentInfo {
	if len(candidates) == 0 {
		return nil
	}

	// Score candidates
	type scoredAgent struct {
		agent *AgentInfo
		score float64
	}

	scoredCandidates := make([]scoredAgent, 0, len(candidates))
	for _, agent := range candidates {
		if agent.MaxConcurrent <= 0 || agent.GetLoad() >= agent.MaxConcurrent {
			continue // Skip if no capacity or at max
		}

		score := s.calculateCapabilityScore(agent, task.Task)
		// Bonus for lower load
		score += (1.0 - float64(agent.GetLoad())/float64(agent.MaxConcurrent)) * 5.0
		scoredCandidates = append(scoredCandidates, scoredAgent{agent: agent, score: score})
	}

	if len(scoredCandidates) == 0 {
		return nil
	}

	// Sort by score descending
	sort.Slice(scoredCandidates, func(i, j int) bool {
		return scoredCandidates[i].score > scoredCandidates[j].score
	})

	return scoredCandidates[0].agent
}

// migrateTask moves a task from one agent to another
func (s *Scheduler) migrateTask(task *ScheduledTask, from, to *AgentInfo) {
	// Update assigned agents
	newAssigned := make([]*AgentInfo, 0, len(task.AssignedTo))
	for _, agent := range task.AssignedTo {
		if agent.ID != from.ID {
			newAssigned = append(newAssigned, agent)
		}
	}
	newAssigned = append(newAssigned, to)
	task.AssignedTo = newAssigned

	// Update loads
	from.DecrementLoad()
	to.IncrementLoad()

	schedulerLog.Info("Migrated task between agents", "task_id", task.Task.ID, "from", from.ID, "to", to.ID)
}

// GetStats returns scheduler statistics
func (s *Scheduler) GetStats() *SchedulerStats {
	s.mu.RLock()
	defer s.mu.RUnlock()

	running := len(s.runningTasks)
	completed := len(s.completedTask)
	pending := s.pendingQueue.Len()

	avgLoad := 0.0
	healthy := 0
	degraded := 0
	for _, agent := range s.workers {
		avgLoad += float64(agent.GetLoad())
		if agent.IsHealthy() {
			healthy++
		} else {
			degraded++
		}
	}
	if len(s.workers) > 0 {
		avgLoad /= float64(len(s.workers))
	}

	return &SchedulerStats{
		PendingTasks:    pending,
		RunningTasks:    running,
		CompletedTasks:  completed,
		TotalWorkers:    len(s.workers),
		AverageLoad:     avgLoad,
		QueueLength:     pending,
		HealthyWorkers:  healthy,
		DegradedWorkers: degraded,
		DLQEntries:      s.dlq.size(),
	}
}

// SchedulerStats holds scheduler statistics
type SchedulerStats struct {
	PendingTasks    int     `json:"pendingTasks"`
	RunningTasks    int     `json:"runningTasks"`
	CompletedTasks  int     `json:"completedTasks"`
	TotalWorkers    int     `json:"totalWorkers"`
	AverageLoad     float64 `json:"averageLoad"`
	QueueLength     int     `json:"queueLength"`
	HealthyWorkers  int     `json:"healthyWorkers"`  // Workers with closed circuit breakers
	DegradedWorkers int     `json:"degradedWorkers"` // Workers with open/half-open circuit breakers
	DLQEntries      int     `json:"dlqEntries"`      // Tasks that exhausted retries
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

// hasFailedDependency checks if any of the task's dependencies have failed
func (s *Scheduler) hasFailedDependency(task *Task) bool {
	for _, depID := range task.Dependencies {
		if s.failedIDs[depID] {
			return true
		}
	}
	return false
}

// scheduledFromFailed creates a completed ScheduledTask record for a dependency-failed task
func scheduledFromFailed(task *Task) *ScheduledTask {
	return &ScheduledTask{
		Task:        task,
		StartedAt:   time.Now(),
		CompletedAt: time.Now(),
		Status:      TaskStatusFailed,
		Error:       fmt.Errorf("dependency failed"),
	}
}

// propagateFailure marks all tasks that depend on the failed task as failed too.
// Must be called with s.mu held. Returns callbacks to invoke after unlocking.
func (s *Scheduler) propagateFailure(failedTaskID string) []func() {
	// Collect IDs of tasks to fail (to avoid modifying pendingQueue while iterating)
	var toFail []string

	// Check running tasks
	for id, scheduled := range s.runningTasks {
		if slices.Contains(scheduled.Task.Dependencies, failedTaskID) {
			toFail = append(toFail, id)
		}
	}

	// Fail running tasks that depended on the failed task
	// Collect callbacks to invoke outside the lock
	var failCallbacks []func()
	for _, id := range toFail {
		if scheduled, ok := s.runningTasks[id]; ok {
			scheduled.Status = TaskStatusFailed
			scheduled.Error = fmt.Errorf("dependency %s failed", failedTaskID)
			scheduled.Task.State = TaskStateFailed
			scheduled.Task.Error = scheduled.Error.Error()
			delete(s.runningTasks, id)
			s.failedIDs[id] = true
			s.completedTask = append(s.completedTask, scheduled)
			schedulerLog.Warn("Task failed due to dependency failure", "task_id", id, "failed_dep", failedTaskID)
			if s.onTaskFail != nil {
				onFail := s.onTaskFail
				err := scheduled.Error
				failCallbacks = append(failCallbacks, func() { onFail(scheduled, err) })
			}
		}
	}
	return failCallbacks
}

// schedulerDLQ is an in-memory Dead Letter Queue for the scheduler.
// Stores lightweight records of tasks that exhausted all retries.
// Inspired by Temporal's DLQ pattern.
type schedulerDLQ struct {
	mu      sync.RWMutex
	entries map[string]*dlqEntry
}

type dlqEntry struct {
	TaskID   string
	Title    string
	Error    string
	Attempts int
	FailedAt time.Time
	AgentID  string
	TraceID  string // For distributed tracing correlation
}

func (d *schedulerDLQ) add(taskID, title, agentID, traceID string, err error, attempts int) {
	if err == nil {
		err = fmt.Errorf("dlq: nil error for task %s", taskID)
	}

	d.mu.Lock()
	defer d.mu.Unlock()
	d.entries[taskID] = &dlqEntry{
		TaskID:   taskID,
		Title:    title,
		Error:    err.Error(),
		Attempts: attempts,
		FailedAt: time.Now(),
		AgentID:  agentID,
		TraceID:  traceID,
	}
	// Limit in-memory size
	if len(d.entries) > maxSchedulerDLQEntries {
		// Remove oldest entries
		keys := make([]string, 0, len(d.entries))
		for k := range d.entries {
			keys = append(keys, k)
		}
		sort.Slice(keys, func(i, j int) bool {
			return d.entries[keys[i]].FailedAt.Before(d.entries[keys[j]].FailedAt)
		})
		removeCount := len(keys) - maxSchedulerDLQEntries
		for i := range removeCount {
			delete(d.entries, keys[i])
		}
	}
}

func (d *schedulerDLQ) size() int {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return len(d.entries)
}
