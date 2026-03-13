// Package swarm implements intelligent task coordination
package swarm

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
)

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

	// Communication channels
	broadcastChan chan *CoordinatorMessage
	resultChan    chan *TaskResult

	// Callbacks
	onTaskStart    func(task *CoordinationTask)
	onTaskComplete func(task *CoordinationTask, result *TaskResult)

	running bool
	ctx     context.Context
	cancel  context.CancelFunc
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
	Metadata map[string]interface{} `json:"metadata,omitempty"`
}

// Additional task statuses for coordination
const (
	TaskStatusDecomposing TaskStatus = "decomposing"
	TaskStatusAssigned    TaskStatus = "assigned"
	TaskStatusConsensus   TaskStatus = "consensus"
)

// CoordinatorMessage represents a message from coordinator
type CoordinatorMessage struct {
	Type     string                 `json:"type"` // "task_assign", "task_cancel", "query", "broadcast"
	TaskID   string                 `json:"taskId,omitempty"`
	Content  string                 `json:"content,omitempty"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
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
		broadcastChan:     make(chan *CoordinatorMessage, 100),
		resultChan:        make(chan *TaskResult, 100),
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

	// Start message handling loops
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

	c.mu.Lock()
	defer c.mu.Unlock()

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

	return nil
}

// coordinatorLoop is the main coordination loop
func (c *Coordinator) coordinatorLoop() {
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
	defer c.mu.Unlock()

	if len(c.pendingTasks) == 0 {
		return
	}

	// Check capacity
	if len(c.activeTasks) >= c.config.MaxConcurrent {
		return
	}

	// Get next task by priority
	task := c.getNextTask()
	if task == nil {
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
	if c.needsDecomposition(task) {
		go c.decomposeTask(task)
		return
	}

	// Assign task to workers
	assigned := c.assignTask(task)
	if !assigned {
		// Put back in queue if no workers available
		c.pendingTasks = append([]*CoordinationTask{task}, c.pendingTasks...)
		return
	}

	// Start task execution
	c.activeTasks[task.ID] = task
	go c.executeTask(task)
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
	return len(task.Description) > 200 && len(c.workers) > 1
}

// decomposeTask decomposes a task into subtasks
func (c *Coordinator) decomposeTask(task *CoordinationTask) {
	c.mu.Lock()
	task.Status = TaskStatusDecomposing
	c.mu.Unlock()

	// Simple decomposition heuristic
	subtasks := c.createSubtasks(task)

	c.mu.Lock()
	task.Subtasks = subtasks
	for _, st := range subtasks {
		st.IsSubtask = true
		st.ParentID = task.ID
		c.pendingTasks = append(c.pendingTasks, st)
	}
	task.Status = TaskStatusPending
	c.mu.Unlock()
}

// createSubtasks creates subtasks from a main task
func (c *Coordinator) createSubtasks(task *CoordinationTask) []*CoordinationTask {
	workerCount := len(c.workers)
	if workerCount == 0 {
		return nil
	}

	subtasks := make([]*CoordinationTask, workerCount)
	for i := 0; i < workerCount; i++ {
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

// executeTask executes a task on assigned workers
func (c *Coordinator) executeTask(task *CoordinationTask) {
	c.mu.Lock()
	task.Status = TaskStatusRunning
	task.StartedAt = time.Now()
	c.mu.Unlock()

	if c.onTaskStart != nil {
		c.onTaskStart(task)
	}

	// Send task to assigned workers
	for _, agentID := range task.AssignedTo {
		worker, ok := c.workers[agentID]
		if !ok {
			continue
		}

		go c.executeOnWorker(task, agentID, worker)
	}
}

// executeOnWorker executes a task on a specific worker
func (c *Coordinator) executeOnWorker(task *CoordinationTask, agentID string, worker *acp.AgentConnection) {
	ctx := c.ctx
	if c.config.TaskTimeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, c.config.TaskTimeout)
		defer cancel()
	}

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

	// Send result
	c.resultChan <- taskResult
}

// handleWorkerError handles errors from workers
func (c *Coordinator) handleWorkerError(task *CoordinationTask, agentID string, err error) {
	c.mu.Lock()
	defer c.mu.Unlock()

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
		if c.onTaskComplete != nil {
			c.onTaskComplete(task, nil)
		}
	}
}

// handleResult handles a task result
func (c *Coordinator) handleResult(result *TaskResult) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Find task this result belongs to
	var task *CoordinationTask
	for _, t := range c.activeTasks {
		for _, agentID := range t.AssignedTo {
			if agentID == result.AgentID {
				task = t
				break
			}
		}
		if task != nil {
			break
		}
	}

	if task == nil {
		return
	}

	// Store result
	if task.Results == nil {
		task.Results = make(map[string]*TaskResult)
	}
	task.Results[result.AgentID] = result

	// Check if all assigned workers have reported
	if len(task.Results) == len(task.AssignedTo) {
		c.completeTask(task)
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

	// Move to completed
	delete(c.activeTasks, task.ID)
	c.completedTasks = append(c.completedTasks, task)

	if c.onTaskComplete != nil {
		var finalResult *TaskResult
		for _, r := range task.Results {
			finalResult = r
			break
		}
		c.onTaskComplete(task, finalResult)
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

// cancelTask cancels a task
func (c *Coordinator) cancelTask(taskID string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	task, ok := c.activeTasks[taskID]
	if !ok {
		return
	}

	task.Status = TaskStatusFailed
	delete(c.activeTasks, taskID)
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
