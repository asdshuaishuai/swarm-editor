// Package swarm implements intelligent task coordination
package swarm

import (
	"context"
	"fmt"
	"maps"
	"sync"
	"sync/atomic"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/log"
)

// coordinatorLog is a scoped logger for the Coordinator component.
var coordinatorLog = log.With("component", "Coordinator")

const maxCoordinatorCompletedTasks = 500
const maxCoordinatorPendingTasks = 1000

// needsDecompositionDescMinLen is the minimum description length to consider decomposition
const needsDecompositionDescMinLen = 200

// Coordinator manages multi-agent task coordination
type Coordinator struct {
	mu sync.RWMutex

	// Configuration
	config CoordinatorConfig

	// Agent management
	connectionManager *acp.ConnectionManager
	coordinator       *acp.AgentConnection
	workers           map[string]*acp.AgentConnection

	// Active tasks
	activeTasks    map[string]*CoordinationTask
	pendingTasks   []*CoordinationTask
	completedTasks []*CoordinationTask

	// Reverse index for O(1) agent → task lookup (performance optimization)
	agentToTask map[string]string // agentID → taskID

	// Per-task cancellation (AutoGen CancellationTokenSource pattern)
	taskCancels map[string][]context.CancelFunc // taskID → cancel funcs (one per worker)

	// Communication channels
	broadcastChan chan *CoordinatorMessage
	resultChan    chan *TaskResult

	// Input guardrails (OpenAI Agents SDK pattern)
	inputGuardrails *InputGuardrailChain

	// Callbacks
	onTaskStart    func(task *CoordinationTask)
	onTaskComplete func(task *CoordinationTask, result *TaskResult)

	running bool
	ctx     context.Context
	cancel  context.CancelFunc
	wg      sync.WaitGroup // WaitGroup for background goroutines

	// Checkpoint store for crash recovery (LangGraph-inspired)
	checkpoint *CheckpointStore

	// Role allocator for dynamic role assignment
	roleAllocator *RoleAllocator
}

// CoordinatorConfig configures the coordinator
type CoordinatorConfig struct {
	TaskTimeout      time.Duration `json:"taskTimeout"`
	MaxConcurrent    int           `json:"maxConcurrent"`
	RetryCount       int           `json:"retryCount"`
	ConsensusEnabled bool          `json:"consensusEnabled"`
	MinAgreement     float64       `json:"minAgreement"` // 0.0-1.0
}

// CoordinationTask represents a task being coordinated
type CoordinationTask struct {
	ID          string `json:"id"`
	ParentID    string `json:"parentId,omitempty"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Prompt      string `json:"prompt"`
	Priority    int    `json:"priority"`

	// Decomposition
	Subtasks  []*CoordinationTask `json:"subtasks,omitempty"`
	IsSubtask bool                `json:"isSubtask"`

	// Assignment
	AssignedTo   []string `json:"assignedTo"` // Agent IDs
	RequiredRole string   `json:"requiredRole,omitempty"`

	// Status
	Status      TaskStatus `json:"status"`
	Progress    float64    `json:"progress"`
	StartedAt   time.Time  `json:"startedAt,omitempty"`
	CompletedAt time.Time  `json:"completedAt,omitempty"`

	// Results
	Results   map[string]*TaskResult `json:"results"` // Agent ID -> Result
	Consensus *ConsensusResult       `json:"consensus,omitempty"`

	// Metadata
	Metadata map[string]any `json:"metadata,omitempty"`

	// Internal atomic counter for turn tracking (avoids data race on Metadata map)
	atomicTurnCount int64
}

// CoordinatorMessage represents a message from coordinator
type CoordinatorMessage struct {
	Type     string         `json:"type"` // "task_assign", "task_cancel", "query", "broadcast"
	TaskID   string         `json:"taskId,omitempty"`
	Content  string         `json:"content,omitempty"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

// CoordinationUpdate represents an update from an agent
type CoordinationUpdate struct {
	AgentID  string  `json:"agentId"`
	TaskID   string  `json:"taskId,omitempty"`
	Type     string  `json:"type"` // "progress", "result", "error", "query"
	Progress float64 `json:"progress,omitempty"`
	Content  string  `json:"content,omitempty"`
	Error    string  `json:"error,omitempty"`
}

// NewCoordinator creates a new coordinator
func NewCoordinator(config CoordinatorConfig, cm *acp.ConnectionManager) *Coordinator {
	// Set defaults for config
	if config.MaxConcurrent <= 0 {
		config.MaxConcurrent = 10
	}
	if config.TaskTimeout <= 0 {
		config.TaskTimeout = 5 * time.Minute
	}
	if config.RetryCount <= 0 {
		config.RetryCount = 3
	}
	if config.MinAgreement <= 0 {
		config.MinAgreement = 0.51
	}

	return &Coordinator{
		config:            config,
		connectionManager: cm,
		workers:           make(map[string]*acp.AgentConnection),
		activeTasks:       make(map[string]*CoordinationTask),
		pendingTasks:      make([]*CoordinationTask, 0),
		agentToTask:       make(map[string]string), // Reverse index for O(1) lookup
		taskCancels:       make(map[string][]context.CancelFunc),
		broadcastChan:     make(chan *CoordinatorMessage, 100),
		resultChan:        make(chan *TaskResult, 100),
		checkpoint:        nil, // Set via SetCheckpointStore() when needed
		inputGuardrails:   NewInputGuardrailChain(),
		roleAllocator:     NewRoleAllocator(),
	}
}

// SetCoordinator sets the coordinator agent connection
func (c *Coordinator) SetCoordinator(conn *acp.AgentConnection) {
	if conn == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.coordinator = conn
}

// SetCheckpointStore sets the checkpoint store for crash recovery.
// Must be called before starting the coordinator.
func (c *Coordinator) SetCheckpointStore(store *CheckpointStore) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.checkpoint = store
}

// SetInputGuardrails replaces the default input guardrail chain.
// Must be called before submitting tasks.
func (c *Coordinator) SetInputGuardrails(chain *InputGuardrailChain) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.inputGuardrails = chain
}

// GetInputGuardrails returns the current input guardrail chain for inspection.
func (c *Coordinator) GetInputGuardrails() *InputGuardrailChain {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.inputGuardrails
}

// GetRoleAllocator returns the role allocator for dynamic role assignment
func (c *Coordinator) GetRoleAllocator() *RoleAllocator {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.roleAllocator
}

// AddWorker adds a worker agent connection
func (c *Coordinator) AddWorker(id string, conn *acp.AgentConnection) {
	if id == "" || conn == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.workers[id] = conn
}

// RemoveWorker removes a worker
func (c *Coordinator) RemoveWorker(id string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.workers, id)
}

// Start starts the coordinator
func (c *Coordinator) Start(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.running {
		return fmt.Errorf("coordinator is already running")
	}

	c.ctx, c.cancel = context.WithCancel(ctx)
	c.running = true

	// Recreate channels if they were closed by a previous Stop() call.
	// Receiving from a closed channel returns zero immediately, so without
	// this, the coordinator goroutines would busy-wait after Stop()+Start().
	c.resultChan = make(chan *TaskResult, 100)
	c.broadcastChan = make(chan *CoordinatorMessage, 100)

	// Start message handling loops
	c.wg.Add(2)
	go c.coordinatorLoop()
	go c.resultProcessingLoop()

	return nil
}

// Stop stops the coordinator
func (c *Coordinator) Stop() {
	c.mu.Lock()
	if !c.running {
		c.mu.Unlock()
		return
	}
	c.running = false
	if c.cancel != nil {
		c.cancel()
	}
	c.mu.Unlock()

	// Wait for all background goroutines to finish
	c.wg.Wait()

	// Close channels after goroutines exit to unblock any potential senders
	// Safe because running=false prevents Start() from re-opening them
	close(c.resultChan)
	close(c.broadcastChan)
}

// SubmitTask submits a task for coordination
// Returns an error if the task is nil, has an empty ID, or has no title/description
func (c *Coordinator) SubmitTask(ctx context.Context, task *CoordinationTask) error {
	// Input validation
	if task == nil {
		return fmt.Errorf("task cannot be nil")
	}
	if task.ID == "" {
		return fmt.Errorf("task ID is required")
	}
	if task.Title == "" && task.Description == "" {
		return fmt.Errorf("task must have either a title or description")
	}
	if task.Priority < 0 {
		return fmt.Errorf("task priority cannot be negative")
	}

	// Run input guardrails (OpenAI Agents SDK pattern)
	c.mu.RLock()
	guardrails := c.inputGuardrails
	c.mu.RUnlock()
	if guardrails != nil {
		input := task.Prompt
		if input == "" {
			input = task.Title + " " + task.Description
		}
		result, err := guardrails.Validate(ctx, input, task.Metadata)
		if err != nil {
			return fmt.Errorf("input guardrail error: %w", err)
		}
		switch result.Action {
		case InputReject:
			return fmt.Errorf("input rejected by guardrail %q: %s", result.RuleName, result.Reason)
		case InputRewrite:
			task.Prompt = result.Rewrite
		case InputTriage:
			// Store triage hint in metadata for downstream processing
			if task.Metadata == nil {
				task.Metadata = make(map[string]any)
			}
			task.Metadata["_triageTo"] = result.TriageTo
			task.Metadata["_triageReason"] = result.Reason
		}
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	// Check if coordinator is running
	if !c.running {
		return fmt.Errorf("coordinator is not running")
	}

	// Check for duplicate task ID in active tasks
	if _, exists := c.activeTasks[task.ID]; exists {
		return fmt.Errorf("task with ID %s already exists in active tasks", task.ID)
	}

	// Check for duplicate task ID in pending tasks
	for _, t := range c.pendingTasks {
		if t.ID == task.ID {
			return fmt.Errorf("task with ID %s already exists in pending tasks", task.ID)
		}
	}

	// Check for duplicate task ID in completed tasks
	for _, t := range c.completedTasks {
		if t.ID == task.ID {
			return fmt.Errorf("task with ID %s already exists in completed tasks", task.ID)
		}
	}

	task.Status = TaskStatusPending
	c.pendingTasks = append(c.pendingTasks, task)

	// Limit pending tasks to prevent unbounded growth
	if len(c.pendingTasks) > maxCoordinatorPendingTasks {
		c.pendingTasks = c.pendingTasks[len(c.pendingTasks)-maxCoordinatorPendingTasks:]
	}

	return nil
}

// coordinatorLoop is the main coordination loop
func (c *Coordinator) coordinatorLoop() {
	defer c.wg.Done()
	defer func() {
		if r := recover(); r != nil {
			coordinatorLog.Error("coordinatorLoop panic", "error", r)
		}
	}()
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-c.ctx.Done():
			return
		case msg := <-c.broadcastChan:
			c.handleBroadcast(msg)
		case <-ticker.C:
			c.processPendingTasks()
		}
	}
}

// resultProcessingLoop processes task results
func (c *Coordinator) resultProcessingLoop() {
	defer c.wg.Done()
	defer func() {
		if r := recover(); r != nil {
			coordinatorLog.Error("resultProcessingLoop panic", "error", r)
		}
	}()
	for {
		select {
		case <-c.ctx.Done():
			return
		case result := <-c.resultChan:
			c.handleResult(result)
		}
	}
}

// processPendingTasks processes pending tasks
func (c *Coordinator) processPendingTasks() {
	c.mu.Lock()

	if len(c.pendingTasks) == 0 {
		c.mu.Unlock()
		return
	}

	// Check capacity
	if len(c.activeTasks) >= c.config.MaxConcurrent {
		c.mu.Unlock()
		return
	}

	// Get next task by priority
	task := c.getNextTask()
	if task == nil {
		c.mu.Unlock()
		return
	}

	// Remove from pending
	for i, t := range c.pendingTasks {
		if t.ID == task.ID {
			c.pendingTasks = append(c.pendingTasks[:i], c.pendingTasks[i+1:]...)
			break
		}
	}

	// Check if task needs decomposition
	// CRITICAL: Release lock before spawning goroutine — decomposeTask
	// re-acquires c.mu.Lock(), and the mutex is non-recursive.
	if c.needsDecomposition(task) {
		c.mu.Unlock()
		c.wg.Add(1)
		go func() {
			defer func() {
				if r := recover(); r != nil {
					coordinatorLog.Error("decomposeTask panic", "task_id", task.ID, "error", r)
				}
				c.wg.Done()
			}()
			c.decomposeTask(task)
		}()
		return
	}

	// Assign task to workers
	assigned := c.assignTask(task)
	if !assigned {
		// Put back in queue if no workers available
		c.pendingTasks = append([]*CoordinationTask{task}, c.pendingTasks...)
		c.mu.Unlock()
		return
	}

	// Start task execution
	c.activeTasks[task.ID] = task
	c.wg.Add(1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				coordinatorLog.Error("executeTask panic", "task_id", task.ID, "error", r)
			}
			c.wg.Done()
		}()
		c.executeTask(task)
	}()
	c.mu.Unlock()
}

// getNextTask gets the next highest priority task
func (c *Coordinator) getNextTask() *CoordinationTask {
	if len(c.pendingTasks) == 0 {
		return nil
	}

	// Sort by priority (higher first)
	highest := c.pendingTasks[0]
	for _, t := range c.pendingTasks {
		if t.Priority > highest.Priority {
			highest = t
		}
	}
	return highest
}

// needsDecomposition checks if a task needs to be decomposed
func (c *Coordinator) needsDecomposition(task *CoordinationTask) bool {
	// Check if task is complex enough to decompose
	return len(task.Description) > needsDecompositionDescMinLen && len(c.workers) > 1
}

// decomposeTask decomposes a task into subtasks
func (c *Coordinator) decomposeTask(task *CoordinationTask) {
	defer func() {
		if r := recover(); r != nil {
			coordinatorLog.Error("decomposeTask panic", "task_id", task.ID, "error", r)
		}
	}()

	c.mu.Lock()
	defer c.mu.Unlock()

	task.Status = TaskStatusDecomposing
	// Add parent task to activeTasks so it remains trackable during decomposition
	c.activeTasks[task.ID] = task

	// Simple decomposition heuristic (c.mu held for createSubtasks)
	subtasks := c.createSubtasks(task)

	task.Subtasks = subtasks
	for _, st := range subtasks {
		st.IsSubtask = true
		st.ParentID = task.ID
		c.pendingTasks = append(c.pendingTasks, st)
	}
	// Parent task remains in activeTasks until all subtasks complete
	// It will be removed when all subtasks are done (handled in handleResult)
	task.Status = TaskStatusPending
}

// createSubtasks creates subtasks from a main task.
// Called from decomposeTask with c.mu held.
func (c *Coordinator) createSubtasks(task *CoordinationTask) []*CoordinationTask {
	workerCount := len(c.workers)
	if workerCount == 0 {
		return nil
	}

	subtasks := make([]*CoordinationTask, workerCount)
	for i := range workerCount {
		subtasks[i] = &CoordinationTask{
			ID:          fmt.Sprintf("%s-%d", task.ID, i+1),
			ParentID:    task.ID,
			Title:       fmt.Sprintf("%s (Part %d)", task.Title, i+1),
			Description: task.Description,
			Prompt:      task.Prompt,
			Priority:    task.Priority,
			Status:      TaskStatusPending,
			Results:     make(map[string]*TaskResult),
		}
	}

	return subtasks
}

// assignTask assigns a task to available workers
func (c *Coordinator) assignTask(task *CoordinationTask) bool {
	available := c.getAvailableWorkers()
	if len(available) == 0 {
		return false
	}

	// Select best worker for this task
	worker := c.selectBestWorker(task, available)
	if worker == "" {
		return false
	}

	task.AssignedTo = []string{worker}
	task.Status = TaskStatusAssigned

	// Update reverse index for O(1) lookup in handleResult
	c.agentToTask[worker] = task.ID

	return true
}

// getAvailableWorkers returns available worker IDs
func (c *Coordinator) getAvailableWorkers() []string {
	available := make([]string, 0)

	// Count current tasks per worker
	workerLoad := make(map[string]int)
	for _, task := range c.activeTasks {
		for _, agentID := range task.AssignedTo {
			workerLoad[agentID]++
		}
	}

	// Find workers with low load
	for id := range c.workers {
		if workerLoad[id] < 2 {
			available = append(available, id)
		}
	}

	return available
}

// selectBestWorker selects the best worker for a task
func (c *Coordinator) selectBestWorker(task *CoordinationTask, available []string) string {
	if len(available) == 0 {
		return ""
	}
	return available[0]
}

// AssignTaskWithRoles assigns a task using dynamic role allocation based on agent health
func (c *Coordinator) AssignTaskWithRoles(task *CoordinationTask, agentsHealth []AgentHealth) (string, AgentRole, float64, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Convert int priority to TaskPriority
	var priority TaskPriority
	switch task.Priority {
	case 3:
		priority = PriorityCritical
	case 2:
		priority = PriorityHigh
	case 1:
		priority = PriorityMedium
	default:
		priority = PriorityLow
	}

	// Convert CoordinationTask to Task for role allocator
	swarmTask := &Task{
		ID:          task.ID,
		Title:       task.Title,
		Description: task.Description,
		Priority:    priority,
		State:       TaskStatePending,
		Metadata:    task.Metadata,
		CreatedAt:   time.Now(),
	}

	agentID, role, score, err := c.roleAllocator.AssignRole(swarmTask, agentsHealth)
	if err != nil {
		return "", RoleGeneric, 0, err
	}

	// Update task assignment
	task.AssignedTo = []string{agentID}
	task.Status = TaskStatusAssigned

	// Store role in metadata for reference
	if task.Metadata == nil {
		task.Metadata = make(map[string]any)
	}
	task.Metadata["assignedRole"] = string(role)

	// Update reverse index for O(1) lookup in handleResult
	c.agentToTask[agentID] = task.ID

	return agentID, role, score, nil
}

// RecordRoleResult records the result of a role-based task execution
func (c *Coordinator) RecordRoleResult(agentID string, task *CoordinationTask, success bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.recordRoleResultLocked(agentID, task, success)
}

// recordRoleResultLocked is the lock-free internal version called when c.mu is already held
func (c *Coordinator) recordRoleResultLocked(agentID string, task *CoordinationTask, success bool) {
	// Extract role from metadata
	var role AgentRole = RoleGeneric
	if roleStr, ok := task.Metadata["assignedRole"].(string); ok {
		role = AgentRole(roleStr)
	}

	c.roleAllocator.RecordResult(agentID, role, success)

	// Release the agent for next assignment
	c.roleAllocator.ReleaseAgent(agentID)
}

// GetActiveRoles returns all active role assignments
func (c *Coordinator) GetActiveRoles() []RoleAssignment {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.roleAllocator.GetAllAssignments()
}

// executeTask executes a task on assigned workers
func (c *Coordinator) executeTask(task *CoordinationTask) {
	defer func() {
		if r := recover(); r != nil {
			coordinatorLog.Error("executeTask panic", "task_id", task.ID, "error", r)
		}
	}()

	c.mu.Lock()
	task.Status = TaskStatusRunning
	task.StartedAt = time.Now()
	onStart := c.onTaskStart
	c.mu.Unlock()

	if onStart != nil {
		onStart(task)
	}

	// Send task to assigned workers
	// Snapshot workers under lock to prevent data race with concurrent RemoveWorker
	c.mu.RLock()
	workers := make(map[string]*acp.AgentConnection, len(c.workers))
	maps.Copy(workers, c.workers)
	// Snapshot Metadata for concurrent-safe access in worker goroutines
	maxTurns := 0
	if task.Metadata != nil {
		if v, ok := task.Metadata["maxTurns"].(int); ok {
			maxTurns = v
		}
	}
	c.mu.RUnlock()

	for _, agentID := range task.AssignedTo {
		worker, ok := workers[string(agentID)]
		if !ok {
			continue
		}

		c.wg.Add(1)
		go func(t *CoordinationTask, aID string, w *acp.AgentConnection, mt int) {
			defer c.wg.Done()
			defer func() {
				if r := recover(); r != nil {
					coordinatorLog.Error("executeOnWorker panic", "task_id", t.ID, "agent_id", aID, "error", r)
				}
			}()
			c.executeOnWorkerWithMaxTurns(t, aID, w, mt)
		}(task, agentID, worker, maxTurns)
	}
}

// executeOnWorkerWithMaxTurns executes a task on a specific worker with a pre-snapshotted maxTurns value.
func (c *Coordinator) executeOnWorkerWithMaxTurns(task *CoordinationTask, agentID string, worker *acp.AgentConnection, maxTurns int) {
	// Check max_turns limit (snapshotted in executeTask under lock)
	if maxTurns > 0 {
		currentTurns := atomic.AddInt64(&task.atomicTurnCount, 1) - 1
		if currentTurns >= int64(maxTurns) {
			c.handleWorkerError(task, agentID, fmt.Errorf("exceeded max_turns (%d/%d)", currentTurns, maxTurns))
			return
		}
	}

	c.mu.RLock()
	ctx := c.ctx
	taskTimeout := c.config.TaskTimeout
	c.mu.RUnlock()
	var taskCancel context.CancelFunc
	if taskTimeout > 0 {
		ctx, taskCancel = context.WithTimeout(ctx, taskTimeout)
	} else {
		ctx, taskCancel = context.WithCancel(ctx)
	}
	defer taskCancel()

	// Register cancel func for external cancellation (AutoGen CancellationTokenSource pattern)
	c.mu.Lock()
	c.taskCancels[task.ID] = append(c.taskCancels[task.ID], taskCancel)
	c.mu.Unlock()

	// Create session with worker
	session, err := worker.CreateSession(ctx, acp.ModeDefault)
	if err != nil {
		c.handleWorkerError(task, agentID, err)
		return
	}

	// Send prompt
	prompt := acp.Prompt{
		{Type: "text", Text: task.Prompt},
	}

	_, err = worker.SendPrompt(ctx, session.ID, prompt)
	if err != nil {
		c.handleWorkerError(task, agentID, err)
		return
	}

	// Create task result
	taskResult := &TaskResult{
		AgentID:     agentID,
		Content:     "Task completed",
		StartedAt:   task.StartedAt,
		CompletedAt: time.Now(),
	}
	taskResult.Duration = taskResult.CompletedAt.Sub(taskResult.StartedAt)

	// Send result with context check to prevent panic on closed channel during shutdown
	// The select checks c.ctx.Done() first to avoid sending on a closed resultChan
	c.mu.RLock()
	coordCtx := c.ctx
	c.mu.RUnlock()

	select {
	case <-coordCtx.Done():
		coordinatorLog.Info("Context cancelled, discarding result", "task_id", task.ID, "agent_id", agentID)
	case c.resultChan <- taskResult:
		// Sent successfully
	default:
		coordinatorLog.Warn("resultChan full, discarding result", "task_id", task.ID, "agent_id", agentID)
	}
}

// handleWorkerError handles errors from workers
func (c *Coordinator) handleWorkerError(task *CoordinationTask, agentID string, err error) {
	coordinatorLog.Error("Worker error", "agent_id", agentID, "task_id", task.ID, "error", err)

	c.mu.Lock()

	if task.Results == nil {
		task.Results = make(map[string]*TaskResult)
	}
	task.Results[agentID] = &TaskResult{
		AgentID: agentID,
		Error:   err.Error(),
	}

	// Check if all workers failed
	allFailed := true
	for _, assigned := range task.AssignedTo {
		if r, ok := task.Results[assigned]; !ok || r.Error == "" {
			allFailed = false
			break
		}
	}

	if allFailed {
		task.Status = TaskStatusFailed
		// Clean up agent-to-task reverse index (same as completeTask)
		for _, agentID := range task.AssignedTo {
			delete(c.agentToTask, agentID)
		}
		delete(c.activeTasks, task.ID)
		delete(c.taskCancels, task.ID)
		onComplete := c.onTaskComplete
		c.mu.Unlock()
		if onComplete != nil {
			onComplete(task, nil)
		}
		return
	}
	c.mu.Unlock()
}

// handleResult handles a task result
func (c *Coordinator) handleResult(result *TaskResult) {
	c.mu.Lock()

	// Validate result is not nil
	if result == nil {
		c.mu.Unlock()
		return
	}

	// Validate agentID is provided
	if result.AgentID == "" {
		c.mu.Unlock()
		return
	}

	// Verify the worker is registered
	if _, registered := c.workers[result.AgentID]; !registered {
		// Reject results from unregistered workers
		c.mu.Unlock()
		return
	}

	// O(1) lookup: find task using reverse index (performance optimization)
	taskID, exists := c.agentToTask[result.AgentID]
	if !exists {
		// No active task found for this agent
		c.mu.Unlock()
		return
	}

	task, exists := c.activeTasks[taskID]
	if !exists {
		// Task no longer active (should not happen, cleanup index)
		delete(c.agentToTask, result.AgentID)
		c.mu.Unlock()
		return
	}

	// Store result
	if task.Results == nil {
		task.Results = make(map[string]*TaskResult)
	}
	task.Results[result.AgentID] = result

	// Check if all assigned workers have reported
	if len(task.Results) == len(task.AssignedTo) {
		// completeTask handles unlock
		c.completeTask(task)
	} else {
		c.mu.Unlock()
	}
}

// completeTask completes a task and possibly runs consensus
func (c *Coordinator) completeTask(task *CoordinationTask) {
	// Run consensus if enabled and not already run
	if c.config.ConsensusEnabled && len(task.Results) > 1 && task.Consensus == nil {
		task.Status = TaskStatusConsensus
		c.runConsensus(task)
		return
	}

	// Mark completed
	task.Status = TaskStatusCompleted
	task.CompletedAt = time.Now()
	task.Progress = 1.0

	// Record role results and clean up agent-to-task reverse index
	for _, agentID := range task.AssignedTo {
		// Determine success based on result
		success := true
		if r, ok := task.Results[agentID]; ok && r.Error != "" {
			success = false
		}
		// Record role result for pheromone trail
		c.recordRoleResultLocked(agentID, task, success)
		delete(c.agentToTask, agentID)
	}

	// Move to completed
	delete(c.activeTasks, task.ID)
	delete(c.taskCancels, task.ID)
	c.completedTasks = append(c.completedTasks, task)

	// Limit completed tasks history to prevent memory leak (keep last 500)
	if len(c.completedTasks) > maxCoordinatorCompletedTasks {
		c.completedTasks = c.completedTasks[len(c.completedTasks)-maxCoordinatorCompletedTasks:]
	}

	// Extract finalResult BEFORE releasing lock to prevent data race on task.Results
	var finalResult *TaskResult
	for _, r := range task.Results {
		finalResult = r
		break
	}
	onComplete := c.onTaskComplete
	c.mu.Unlock()

	if onComplete != nil {
		onComplete(task, finalResult)
	}
}

// runConsensus runs consensus between agent results
func (c *Coordinator) runConsensus(task *CoordinationTask) {
	total := len(task.Results)
	if total == 0 {
		task.Consensus = &ConsensusResult{
			Status:       "disagreed",
			ApprovalRate: 0,
			Votes:        make(map[string]Vote),
		}
		c.completeTask(task)
		return
	}

	approved := 0
	for _, result := range task.Results {
		if result.Error == "" {
			approved++
		}
	}

	agreement := float64(approved) / float64(total)

	// Determine consensus status
	status := "disagreed"
	if agreement >= c.config.MinAgreement {
		status = "agreed"
	} else if agreement > 0.5 {
		status = "partial"
	}

	task.Consensus = &ConsensusResult{
		Status:       status,
		ApprovalRate: agreement,
		Votes:        make(map[string]Vote),
	}

	for _, res := range task.Results {
		if res.Error == "" {
			task.Consensus.FinalResult = res.Content
			break
		}
	}

	c.completeTask(task)
}

// handleBroadcast handles broadcast messages
func (c *Coordinator) handleBroadcast(msg *CoordinatorMessage) {
	if msg == nil {
		return
	}
	switch msg.Type {
	case "task_cancel":
		if msg.TaskID != "" {
			c.cancelTask(msg.TaskID)
		}
	}
}

// cancelTask cancels a task and cascades cancellation to its subtasks.
// Inspired by AutoGen's linked CancellationTokenSource pattern.
func (c *Coordinator) cancelTask(taskID string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	task, ok := c.activeTasks[taskID]
	if !ok {
		return
	}

	task.Status = TaskStatusCancelled
	task.CompletedAt = time.Now()
	delete(c.activeTasks, taskID)

	// Clean up agent-to-task reverse index (same as completeTask)
	for _, agentID := range task.AssignedTo {
		delete(c.agentToTask, agentID)
	}

	// Cancel the running goroutine(s) via per-task context
	if cancelFns, ok := c.taskCancels[taskID]; ok {
		for _, fn := range cancelFns {
			fn()
		}
		delete(c.taskCancels, taskID)
	}

	// Add to completedTasks for visibility (with limit to prevent memory leak)
	c.completedTasks = append(c.completedTasks, task)
	if len(c.completedTasks) > maxCoordinatorCompletedTasks {
		c.completedTasks = c.completedTasks[len(c.completedTasks)-maxCoordinatorCompletedTasks:]
	}

	// Cascade: cancel subtasks that are active
	for _, st := range task.Subtasks {
		if _, isActive := c.activeTasks[st.ID]; isActive {
			st.Status = TaskStatusCancelled
			st.CompletedAt = time.Now()
			delete(c.activeTasks, st.ID)
			// Clean up agent-to-task reverse index for subtask
			for _, agentID := range st.AssignedTo {
				delete(c.agentToTask, agentID)
			}
			// Cancel subtask's running goroutine(s)
			if cancelFns, ok := c.taskCancels[st.ID]; ok {
				for _, fn := range cancelFns {
					fn()
				}
				delete(c.taskCancels, st.ID)
			}
			// Add cancelled subtask to completedTasks
			c.completedTasks = append(c.completedTasks, st)
			if len(c.completedTasks) > maxCoordinatorCompletedTasks {
				c.completedTasks = c.completedTasks[len(c.completedTasks)-maxCoordinatorCompletedTasks:]
			}
		}
		// Also remove from pending
		for i, pt := range c.pendingTasks {
			if pt.ID == st.ID {
				c.pendingTasks = append(c.pendingTasks[:i], c.pendingTasks[i+1:]...)
				break
			}
		}
	}
}

// GetStats returns coordinator statistics
func (c *Coordinator) GetStats() *CoordinatorStats {
	c.mu.RLock()
	defer c.mu.RUnlock()

	return &CoordinatorStats{
		WorkerCount:    len(c.workers),
		PendingTasks:   len(c.pendingTasks),
		ActiveTasks:    len(c.activeTasks),
		CompletedTasks: len(c.completedTasks),
		MaxConcurrent:  c.config.MaxConcurrent,
	}
}

// CoordinatorStats holds coordinator statistics
type CoordinatorStats struct {
	WorkerCount    int `json:"workerCount"`
	PendingTasks   int `json:"pendingTasks"`
	ActiveTasks    int `json:"activeTasks"`
	CompletedTasks int `json:"completedTasks"`
	MaxConcurrent  int `json:"maxConcurrent"`
}

// OnTaskStart registers a callback for task start events
func (c *Coordinator) OnTaskStart(fn func(task *CoordinationTask)) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.onTaskStart = fn
}

// OnTaskComplete registers a callback for task completion events
func (c *Coordinator) OnTaskComplete(fn func(task *CoordinationTask, result *TaskResult)) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.onTaskComplete = fn
}
