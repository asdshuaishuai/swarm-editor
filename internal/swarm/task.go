package swarm

import (
	"encoding/json"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/pkg/utils"
)

// TaskState represents the state of a task
type TaskState string

const (
	TaskStatePending   TaskState = "pending"
	TaskStateRunning   TaskState = "running"
	TaskStateCompleted TaskState = "completed"
	TaskStateFailed    TaskState = "failed"
	TaskStateCancelled TaskState = "cancelled"

	// decompositionDescMinLen is the minimum description length for task decomposition
	decompositionDescMinLen = 100
	// decompositionPromptMinLen is the minimum prompt length for task decomposition
	decompositionPromptMinLen = 3
)

// validTransitions defines allowed state transitions (Google A2A guarded state machine).
// A transition from key -> value is valid. Unlisted transitions are rejected.
var validTransitions = map[TaskState][]TaskState{
	TaskStatePending:   {TaskStateRunning, TaskStateCancelled},
	TaskStateRunning:   {TaskStateCompleted, TaskStateFailed, TaskStateCancelled},
	TaskStateCompleted: {},                 // terminal
	TaskStateFailed:    {TaskStatePending}, // can retry
	TaskStateCancelled: {},                 // terminal
}

// canTransition checks if transitioning from -> to is valid (Google A2A pattern).
func canTransition(from, to TaskState) bool {
	allowed, ok := validTransitions[from]
	if !ok {
		return false
	}
	for _, a := range allowed {
		if a == to {
			return true
		}
	}
	return false
}

// TaskPriority defines task priority
type TaskPriority string

const (
	PriorityLow      TaskPriority = "low"
	PriorityMedium   TaskPriority = "medium"
	PriorityHigh     TaskPriority = "high"
	PriorityCritical TaskPriority = "critical"
)

// Task represents a unit of work for the swarm
type Task struct {
	mu sync.RWMutex `json:"-"`

	ID          string       `json:"id"`
	ParentID    string       `json:"parentId,omitempty"`
	Title       string       `json:"title"`
	Description string       `json:"description"`
	Prompt      acp.Prompt   `json:"prompt"`
	State       TaskState    `json:"state"`
	Priority    TaskPriority `json:"priority"`

	AssignedTo   []acp.AgentID `json:"assignedTo,omitempty"`
	Dependencies []string      `json:"dependencies,omitempty"`
	Subtasks     []*Task       `json:"subtasks,omitempty"`

	Result *TaskResult `json:"result,omitempty"`
	Error  string      `json:"error,omitempty"`

	CreatedAt   time.Time `json:"createdAt"`
	StartedAt   time.Time `json:"startedAt,omitempty"`
	CompletedAt time.Time `json:"completedAt,omitempty"`

	Timeout    time.Duration `json:"timeout,omitempty"`
	RetryCount int           `json:"retryCount"`
	MaxRetries int           `json:"maxRetries"`

	// MaxTurns limits the number of agent interaction turns for this task.
	// A "turn" is one send-and-receive cycle between the swarm and an agent.
	// 0 means unlimited (default). Inspired by OpenAI Swarm's max_turns pattern.
	MaxTurns int `json:"maxTurns,omitempty"`

	// scheduleRetries tracks how many times this task failed to find capable agents (pre-execution).
	// Not persisted to JSON — only used in-memory by the scheduler.
	scheduleRetries int `json:"-"`
	TurnCount       int `json:"turnCount,omitempty"`

	Metadata map[string]any `json:"metadata,omitempty"`
}

// TaskExecutionResult represents the result of task execution (specific to task.go)
type TaskExecutionResult struct {
	TaskID       string          `json:"taskId"`
	AgentID      acp.AgentID     `json:"agentId,omitempty"`
	Output       json.RawMessage `json:"output,omitempty"`
	FilesChanged []string        `json:"filesChanged,omitempty"`
	Artifacts    []Artifact      `json:"artifacts,omitempty"`
	Error        error           `json:"error,omitempty"`
	StartedAt    time.Time       `json:"startedAt"`
	CompletedAt  time.Time       `json:"completedAt"`
	Duration     time.Duration   `json:"duration"`
}

// NewTask creates a new task
func NewTask(title, description string, prompt acp.Prompt) *Task {
	return &Task{
		ID:          generateTaskID(),
		Title:       title,
		Description: description,
		Prompt:      prompt,
		State:       TaskStatePending,
		Priority:    PriorityMedium,
		MaxRetries:  3,
		Metadata:    make(map[string]any),
		CreatedAt:   time.Now(),
	}
}

// IsDecomposable checks if the task can be decomposed
func (t *Task) IsDecomposable() bool {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return len(t.Description) > decompositionDescMinLen || len(t.Prompt) > decompositionPromptMinLen
}

// CreateSubtasks creates subtasks for decomposition
func (t *Task) CreateSubtasks(count int) []*Task {
	t.mu.Lock()
	defer t.mu.Unlock()

	if count <= 0 {
		return nil
	}

	subtasks := make([]*Task, count)
	for i := range count {
		subtasks[i] = &Task{
			ID:          generateTaskID(),
			ParentID:    t.ID,
			Title:       fmt.Sprintf("%s (Part %d)", t.Title, i+1),
			Description: t.Description,
			Prompt:      t.Prompt,
			State:       TaskStatePending,
			Priority:    t.Priority,
			MaxRetries:  t.MaxRetries,
			Metadata:    make(map[string]any),
		}
	}

	t.Subtasks = subtasks
	return subtasks
}

// Assign assigns the task to agents
func (t *Task) Assign(agentIDs ...acp.AgentID) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	if !canTransition(t.State, TaskStateRunning) {
		return false
	}
	t.AssignedTo = agentIDs
	t.State = TaskStateRunning
	t.StartedAt = time.Now()
	return true
}

// Complete marks the task as completed
func (t *Task) Complete(result *TaskResult) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	if !canTransition(t.State, TaskStateCompleted) {
		return false
	}
	t.State = TaskStateCompleted
	t.Result = result
	t.CompletedAt = time.Now()
	return true
}

// Fail marks the task as failed
func (t *Task) Fail(err error) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	if !canTransition(t.State, TaskStateFailed) {
		return false
	}
	t.State = TaskStateFailed
	if err != nil {
		t.Error = err.Error()
	}
	t.CompletedAt = time.Now()
	return true
}

// CancelReason encodes why a task was cancelled (Google A2A pattern).
type CancelReason string

const (
	CancelReasonUser       CancelReason = "user_cancelled"
	CancelReasonTimeout    CancelReason = "timeout"
	CancelReasonDependency CancelReason = "dependency_failed"
	CancelReasonResource   CancelReason = "resource_limit"
	CancelReasonShutdown   CancelReason = "shutdown"
)

// Cancel cancels the task and all its subtasks recursively.
// Inspired by AutoGen's linked CancellationTokenSource pattern where
// cancellation cascades through the entire task hierarchy.
// The reason is stored in metadata and propagated to subtasks (Google A2A pattern).
func (t *Task) Cancel(reason CancelReason) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	if !canTransition(t.State, TaskStateCancelled) {
		return false
	}
	t.State = TaskStateCancelled
	t.CompletedAt = time.Now()
	if reason != "" {
		if t.Metadata == nil {
			t.Metadata = make(map[string]any)
		}
		t.Metadata["cancelReason"] = string(reason)
	}
	// Cascade cancellation to subtasks with same reason
	for _, st := range t.Subtasks {
		st.Cancel(reason)
	}
	return true
}

// Retry increments retry count and resets state
func (t *Task) Retry() bool {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.RetryCount >= t.MaxRetries {
		return false
	}

	if !canTransition(t.State, TaskStatePending) {
		return false
	}

	t.RetryCount++
	t.State = TaskStatePending
	t.Error = ""
	return true
}

// SetPriority sets the task priority
func (t *Task) SetPriority(priority TaskPriority) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.Priority = priority
}

// GetPriority returns the task priority
func (t *Task) GetPriority() TaskPriority {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.Priority
}

// SetTimeout sets the task timeout
func (t *Task) SetTimeout(timeout time.Duration) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.Timeout = timeout
}

// EscalatePriorityIfNearDeadline checks if the task deadline is approaching
// and escalates priority accordingly. Returns true if priority was changed.
// Inspired by EDF (Earliest Deadline First) scheduling from real-time systems.
func (t *Task) EscalatePriorityIfNearDeadline() bool {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.Timeout <= 0 || t.CreatedAt.IsZero() {
		return false
	}

	deadline := t.CreatedAt.Add(t.Timeout)
	remaining := time.Until(deadline)
	if remaining <= 0 {
		return false // already past deadline
	}

	// Escalation thresholds
	switch {
	case remaining <= 1*time.Minute:
		if t.Priority != PriorityCritical {
			t.Priority = PriorityCritical
			return true
		}
	case remaining <= 5*time.Minute:
		if t.Priority != PriorityHigh && t.Priority != PriorityCritical {
			t.Priority = PriorityHigh
			return true
		}
	case remaining <= 15*time.Minute:
		if t.Priority != PriorityMedium && t.Priority != PriorityHigh && t.Priority != PriorityCritical {
			t.Priority = PriorityMedium
			return true
		}
	}
	return false
}

// IncrementTurns atomically increments the turn counter and returns the new count
func (t *Task) IncrementTurns() int {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.TurnCount++
	return t.TurnCount
}

// IsTurnLimitReached returns true if MaxTurns > 0 and turn count has reached it
func (t *Task) IsTurnLimitReached() bool {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.MaxTurns > 0 && t.TurnCount >= t.MaxTurns
}

// SetMaxTurns sets the maximum number of agent interaction turns
func (t *Task) SetMaxTurns(maxTurns int) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.MaxTurns = maxTurns
}

// AddDependency adds a dependency to another task
func (t *Task) AddDependency(taskID string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.Dependencies = append(t.Dependencies, taskID)
}

// IsReady checks if all dependencies are satisfied
func (t *Task) IsReady(completedTasks map[string]bool) bool {
	t.mu.RLock()
	defer t.mu.RUnlock()

	// If no dependencies, task is ready
	if len(t.Dependencies) == 0 {
		return true
	}

	// If completedTasks is nil, no dependencies can be satisfied
	if completedTasks == nil {
		return false
	}

	for _, depID := range t.Dependencies {
		if !completedTasks[depID] {
			return false
		}
	}
	return true
}

// GetDuration returns the task duration
func (t *Task) GetDuration() time.Duration {
	t.mu.RLock()
	defer t.mu.RUnlock()

	if !t.StartedAt.IsZero() && !t.CompletedAt.IsZero() {
		return t.CompletedAt.Sub(t.StartedAt)
	}
	return 0
}

// ToJSON converts the task to JSON (acquires read lock for consistent snapshot)
func (t *Task) ToJSON() ([]byte, error) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return json.Marshal(t)
}

// TaskFromJSON creates a task from JSON
func TaskFromJSON(data []byte) (*Task, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("empty data")
	}

	var task Task
	if err := json.Unmarshal(data, &task); err != nil {
		return nil, err
	}
	return &task, nil
}

// TaskQueue is a priority queue for tasks
type TaskQueue struct {
	mu    sync.RWMutex
	tasks []*Task
}

// NewTaskQueue creates a new task queue
func NewTaskQueue() *TaskQueue {
	return &TaskQueue{
		tasks: make([]*Task, 0),
	}
}

// Push adds a task to the queue
func (q *TaskQueue) Push(task *Task) {
	if task == nil {
		return
	}
	q.mu.Lock()
	defer q.mu.Unlock()

	// Insert based on priority
	i := 0
	for ; i < len(q.tasks); i++ {
		if comparePriority(task.Priority, q.tasks[i].Priority) > 0 {
			break
		}
	}

	// Use a temporary slice to avoid the three-argument append gotcha
	// (inner append may modify q.tasks backing array, corrupting outer append)
	tmp := make([]*Task, 0, len(q.tasks)+1)
	tmp = append(tmp, q.tasks[:i]...)
	tmp = append(tmp, task)
	tmp = append(tmp, q.tasks[i:]...)
	q.tasks = tmp
}

// Pop removes and returns the highest priority task
func (q *TaskQueue) Pop() *Task {
	q.mu.Lock()
	defer q.mu.Unlock()

	if len(q.tasks) == 0 {
		return nil
	}

	task := q.tasks[0]
	q.tasks = q.tasks[1:]
	return task
}

// Peek returns the highest priority task without removing it
func (q *TaskQueue) Peek() *Task {
	q.mu.RLock()
	defer q.mu.RUnlock()

	if len(q.tasks) == 0 {
		return nil
	}
	return q.tasks[0]
}

// Len returns the queue length
func (q *TaskQueue) Len() int {
	q.mu.RLock()
	defer q.mu.RUnlock()
	return len(q.tasks)
}

// Remove removes a specific task from the queue
func (q *TaskQueue) Remove(taskID string) *Task {
	q.mu.Lock()
	defer q.mu.Unlock()

	for i, task := range q.tasks {
		if task.ID == taskID {
			q.tasks = append(q.tasks[:i], q.tasks[i+1:]...)
			return task
		}
	}
	return nil
}

// GetAll returns all tasks in the queue
func (q *TaskQueue) GetAll() []*Task {
	q.mu.RLock()
	defer q.mu.RUnlock()
	result := make([]*Task, len(q.tasks))
	copy(result, q.tasks)
	return result
}

// EscalateDeadlines checks all queued tasks and escalates priority
// for tasks approaching their deadline. Returns the number of tasks escalated.
// Must be called periodically (e.g., every 30s) to be effective.
func (q *TaskQueue) EscalateDeadlines() int {
	q.mu.Lock()
	defer q.mu.Unlock()

	escalated := 0
	for _, task := range q.tasks {
		if task.EscalatePriorityIfNearDeadline() {
			escalated++
		}
	}

	// Re-sort queue if any priorities changed
	if escalated > 0 {
		sort.SliceStable(q.tasks, func(i, j int) bool {
			return comparePriority(q.tasks[i].Priority, q.tasks[j].Priority) > 0
		})
	}
	return escalated
}

// comparePriority compares two priorities
// Returns > 0 if p1 > p2, < 0 if p1 < p2, 0 if equal
// Unknown priorities are treated as lowest priority
func comparePriority(p1, p2 TaskPriority) int {
	priorityValue := map[TaskPriority]int{
		PriorityCritical: 4,
		PriorityHigh:     3,
		PriorityMedium:   2,
		PriorityLow:      1,
	}

	v1, ok1 := priorityValue[p1]
	v2, ok2 := priorityValue[p2]

	// Treat unknown priorities as 0 (lowest)
	if !ok1 {
		v1 = 0
	}
	if !ok2 {
		v2 = 0
	}

	return v1 - v2
}

func generateTaskID() string {
	return utils.GenerateID("task")
}
