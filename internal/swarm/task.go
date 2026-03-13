package swarm

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
)

// TaskState represents the state of a task
type TaskState string

const (
	TaskStatePending   TaskState = "pending"
	TaskStateRunning   TaskState = "running"
	TaskStateCompleted TaskState = "completed"
	TaskStateFailed    TaskState = "failed"
	TaskStateCancelled TaskState = "cancelled"
)

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

	Metadata map[string]interface{} `json:"metadata,omitempty"`
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
		Metadata:    make(map[string]interface{}),
		CreatedAt:   time.Now(),
	}
}

// IsDecomposable checks if the task can be decomposed
func (t *Task) IsDecomposable() bool {
	// Check if task is complex enough to decompose
	// This could be based on description length, prompt complexity, etc.
	return len(t.Description) > 100 || len(t.Prompt) > 3
}

// CreateSubtasks creates subtasks for decomposition
func (t *Task) CreateSubtasks(count int) []*Task {
	t.mu.Lock()
	defer t.mu.Unlock()

	if count <= 0 {
		return nil
	}

	subtasks := make([]*Task, count)
	for i := 0; i < count; i++ {
		subtasks[i] = &Task{
			ID:          generateTaskID(),
			ParentID:    t.ID,
			Title:       fmt.Sprintf("%s (Part %d)", t.Title, i+1),
			Description: t.Description,
			Prompt:      t.Prompt,
			State:       TaskStatePending,
			Priority:    t.Priority,
			MaxRetries:  t.MaxRetries,
			Metadata:    make(map[string]interface{}),
		}
	}

	t.Subtasks = subtasks
	return subtasks
}

// Assign assigns the task to agents
func (t *Task) Assign(agentIDs ...acp.AgentID) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.AssignedTo = agentIDs
	t.State = TaskStateRunning
	t.StartedAt = time.Now()
}

// Complete marks the task as completed
func (t *Task) Complete(result *TaskResult) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.State = TaskStateCompleted
	t.Result = result
	t.CompletedAt = time.Now()
}

// Fail marks the task as failed
func (t *Task) Fail(err error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.State = TaskStateFailed
	if err != nil {
		t.Error = err.Error()
	}
	t.CompletedAt = time.Now()
}

// Cancel cancels the task
func (t *Task) Cancel() {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.State = TaskStateCancelled
	t.CompletedAt = time.Now()
}

// Retry increments retry count and resets state
func (t *Task) Retry() bool {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.RetryCount >= t.MaxRetries {
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

// ToJSON converts the task to JSON
func (t *Task) ToJSON() ([]byte, error) {
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

	q.tasks = append(q.tasks[:i], append([]*Task{task}, q.tasks[i:]...)...)
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
	return fmt.Sprintf("task_%d", time.Now().UnixNano())
}
