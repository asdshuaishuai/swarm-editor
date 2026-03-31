// Package swarm provides multiple orchestration modes
// Inspired by CrewAI (Sequential/Hierarchical/Consensual)
// and LangGraph (Graph-based routing)
package swarm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"maps"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/audit"
)

// OrchestrationMode defines how agents collaborate
type OrchestrationMode string

// FailurePolicy defines how parallel execution handles failures.
// Inspired by LangGraph's superstep failure policies.
type FailurePolicy string

const (
	// FailurePolicyFailFast cancels remaining work on first error (default).
	FailurePolicyFailFast FailurePolicy = "fail_fast"
	// FailurePolicyFailMajority continues until >50% of nodes fail.
	FailurePolicyFailMajority FailurePolicy = "fail_majority"
	// FailurePolicyContinuePartial completes all nodes, reports errors at end.
	FailurePolicyContinuePartial FailurePolicy = "continue_partial"
)

const (
	// ModeSequential - agents execute in order, one after another
	// Use case: Pipeline processing, code review chain
	ModeSequential OrchestrationMode = "sequential"

	// ModeParallel - agents execute simultaneously
	// Use case: Independent tasks, load distribution
	ModeParallel OrchestrationMode = "parallel"

	// ModeHierarchical - coordinator delegates to workers
	// Use case: Complex task decomposition, team management
	ModeHierarchical OrchestrationMode = "hierarchical"

	// ModeConsensual - agents vote on results
	// Use case: Quality assurance, multi-perspective review
	ModeConsensual OrchestrationMode = "consensual"

	// ModeGraph - custom graph-based routing (LangGraph style)
	// Use case: Complex workflows with conditional branching
	ModeGraph OrchestrationMode = "graph"

	// ModeGroupChat - agents take turns in a conversation (AutoGen style)
	// Use case: Brainstorming, collaborative problem-solving, multi-agent discussion
	ModeGroupChat OrchestrationMode = "group_chat"

	// maxCheckpointsPerWorkflow limits stored checkpoints per workflow to prevent unbounded memory growth
	maxCheckpointsPerWorkflow = 100
)

// Compensatable is implemented by nodes that define a compensation action.
// Inspired by Temporal's Activity compensation pattern:
// when a workflow step fails, the orchestrator runs compensation actions
// in reverse order of the completed steps.
type Compensatable interface {
	// Compensate undoes the effect of this step's execution.
	// It receives the result from the original execution (if any) and
	// must return nil if compensation succeeded.
	Compensate(ctx context.Context, result any) error
}

// SagaRecord tracks execution for saga compensation.
type SagaRecord struct {
	NodeID    string    `json:"nodeId"`
	Status    string    `json:"status"` // "completed", "compensated", "compensation_failed"
	Result    any       `json:"result,omitempty"`
	Completed time.Time `json:"completedAt"`
}

// WorkflowNode represents a node in the workflow graph
type WorkflowNode struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	AgentID     string         `json:"agentId"`
	Type        string         `json:"type"` // "agent", "condition", "parallel", "join", "subgraph"
	SubgraphID  string         `json:"subgraphId,omitempty"` // For Type="subgraph": ID of nested workflow
	Config      map[string]any `json:"config"`
	Position    Position       `json:"position"`
	Status      TaskStatus     `json:"status"`
	Result      any            `json:"result,omitempty"`
	StartedAt   *time.Time     `json:"startedAt,omitempty"`
	CompletedAt *time.Time     `json:"completedAt,omitempty"`
	// DependsOn lists node IDs that must complete before this node can execute.
	// Inspired by CrewAI's task.depends_on for declarative task dependencies.
	// When set, this overrides edge-based ordering for dependency resolution.
	DependsOn []string `json:"dependsOn,omitempty"`

	// Interrupt fields for human-in-the-loop workflows (LangGraph pattern)
	// Interrupt, if true, pauses BEFORE node execution for external input.
	Interrupt bool `json:"interrupt,omitempty"`
	// InterruptBefore is an alias for Interrupt (pauses before execution).
	InterruptBefore bool `json:"interruptBefore,omitempty"`
	// InterruptAfter, if true, pauses AFTER node execution completes.
	InterruptAfter bool `json:"interruptAfter,omitempty"`
	// ResumeInput stores input to use when resuming from an interrupt.
	ResumeInput any `json:"resumeInput,omitempty"`

	// InterruptActions defines predefined actions for human-in-the-loop review.
	// Inspired by Dify's HITL Human Input node with action-based routing.
	// When set, the UI presents these as selectable buttons instead of a free-text input.
	// Each action maps to an edge condition for downstream routing.
	// Example: [{"id": "approve", "label": "Approve"}, {"id": "reject", "label": "Reject"}]
	InterruptActions []InterruptAction `json:"interruptActions,omitempty"`
	// ChosenAction stores the ID of the action selected by the user during resume.
	// Used by graph traversal to select the matching edge via Condition field.
	ChosenAction string `json:"chosenAction,omitempty"`
}

// InterruptAction represents a predefined action for human-in-the-loop review.
// Inspired by Dify's action-based routing from HITL nodes.
type InterruptAction struct {
	ID    string `json:"id"`              // Unique action identifier (matched to edge Condition)
	Label string `json:"label"`           // Display label for the UI button
	Style string `json:"style,omitempty"` // UI style hint: "primary", "danger", "warning", "default"
}

// Position for visual orchestrator
type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// WorkflowEdge represents a connection between nodes
type WorkflowEdge struct {
	ID        string `json:"id"`
	From      string `json:"from"`
	To        string `json:"to"`
	Condition string `json:"condition,omitempty"` // Optional condition for branching
	Label     string `json:"label,omitempty"`
}

// Workflow represents a complete workflow definition
type Workflow struct {
	mu          sync.RWMutex
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Description string            `json:"description"`
	Mode        OrchestrationMode `json:"mode"`
	Nodes       []*WorkflowNode   `json:"nodes"`
	Edges       []*WorkflowEdge   `json:"edges"`
	Status      string            `json:"status"` // "draft", "running", "paused", "completed", "failed"
	CreatedAt   time.Time         `json:"createdAt"`
	UpdatedAt   time.Time         `json:"updatedAt"`

	// Version management (LangGraph-style versioning)
	Version        int               `json:"version"`
	VersionHistory []*WorkflowVersion `json:"versionHistory,omitempty"`

	// Execution state
	currentNode string
	execHistory []ExecutionStep
	roundCount  int // tracks total node executions for MaxRounds limiting

	// Saga compensation log: records completed nodes for reverse-order compensation
	// on workflow failure (Temporal pattern).
	sagaLog []SagaRecord

	// LastExecutionReport stores the most recent execution report for observability.
	// Inspired by Temporal's workflow history for error visibility.
	LastExecutionReport *WorkflowExecutionReport `json:"lastExecutionReport,omitempty"`

	// Interrupt state for human-in-the-loop workflows (LangGraph pattern)
	// InterruptedNodeID is set when workflow is paused at an interrupt point.
	InterruptedNodeID string `json:"interruptedNodeId,omitempty"`
	// InterruptPhase indicates whether pause occurred before or after node execution: "before", "after"
	InterruptPhase string `json:"interruptPhase,omitempty"`

	// Compensation idempotency guard (Round 376 HIGH fix)
	// Prevents concurrent double-compensation when multiple callers invoke RunCompensation.
	compensating atomic.Bool

	// Workflow chaining (CrewAI Flows pattern).
	// OnComplete defines downstream workflows to trigger when this workflow completes successfully.
	// Each entry specifies a target workflow ID and optional input mapping.
	OnComplete []WorkflowChainLink `json:"onComplete,omitempty"`
}

// WorkflowChainLink defines a downstream workflow to trigger on completion.
// Inspired by CrewAI Flows: sequential composition of workflows where the
// output of one flow feeds into the next.
type WorkflowChainLink struct {
	WorkflowID string         `json:"workflowId"`           // target workflow to execute
	Input      map[string]any `json:"input,omitempty"`      // input to pass to downstream
	Condition  string         `json:"condition,omitempty"`  // "always" (default), "on_success", "on_failure"
}

// WorkflowVersion represents a snapshot of workflow at a specific version.
// Inspired by LangGraph's versioned state management for rollback and A/B testing.
type WorkflowVersion struct {
	Version     int               `json:"version"`
	CreatedAt   time.Time         `json:"createdAt"`
	Description string            `json:"description,omitempty"`
	Nodes       []*WorkflowNode   `json:"nodes"` // Snapshot of nodes at this version
	Edges       []*WorkflowEdge   `json:"edges"` // Snapshot of edges at this version
	Mode        OrchestrationMode `json:"mode"`
	CreatedBy   string            `json:"createdBy,omitempty"` // Optional: who created this version
}

// ExecutionStep records a step in workflow execution
type ExecutionStep struct {
	NodeID    string    `json:"nodeId"`
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
	Duration  float64   `json:"durationMs"`
	Error     string    `json:"error,omitempty"`
}

// Checkpoint represents a saved state for recovery
type Checkpoint struct {
	ID          string                   `json:"id"`
	WorkflowID  string                   `json:"workflowId"`
	CreatedAt   time.Time                `json:"createdAt"`
	NodeStates  map[string]*WorkflowNode `json:"nodeStates"`
	CurrentNode string                   `json:"currentNode"`
	ExecHistory []ExecutionStep          `json:"execHistory"`
	Metadata    map[string]any           `json:"metadata"`
	SagaLog     []SagaRecord             `json:"sagaLog"`
	RoundCount  int                      `json:"roundCount"`
}

// Orchestrator manages workflow execution
type Orchestrator struct {
	mu sync.RWMutex

	// FailurePolicy controls how parallel/hierarchical errors are handled.
	// Default: FailurePolicyFailFast.
	FailurePolicy FailurePolicy

	// MaxRounds limits total node executions per workflow to prevent infinite loops.
	// Inspired by AutoGen's max_rounds parameter. 0 = unlimited.
	MaxRounds int

	// AutoCheckpoint enables automatic checkpoint creation after each node execution.
	// Inspired by LangGraph's per-superstep checkpointing.
	// When true, every executeNode call creates a checkpoint, enabling recovery
	// from any point in any execution mode (not just sequential).
	// Default: false (only sequential mode checkpoints explicitly).
	AutoCheckpoint bool

	// WorkflowRetryPolicy controls automatic retry of failed workflow executions.
	// Inspired by Temporal's workflow-level retry with exponential backoff.
	// When set, a failed workflow execution will be retried with delays
	// calculated by the policy's GetNextDelay method.
	// Default: nil (no retry, workflow fails immediately).
	WorkflowRetryPolicy *RetryPolicy

	// WorkflowTimeout sets an overall timeout for workflow execution.
	// Inspired by Temporal's Schedule-to-Close timeout:
	// the maximum time from Execute() call to workflow completion.
	// When set, the workflow context is derived from this timeout.
	// Default: 0 (no timeout, runs until completion or context cancellation).
	WorkflowTimeout time.Duration

	// Workflows
	workflows map[string]*Workflow

	// Checkpoints for recovery
	checkpoints map[string][]*Checkpoint

	// Signal/Query bus for external workflow interaction (Temporal-inspired)
	signalBus *SignalBus

	// Scheduler for task execution
	scheduler *Scheduler

	// resultCache caches node execution results to skip redundant work.
	// Inspired by Prefect's task result caching (cache_key_fn + cache_expiration).
	// Nodes with CacheKey set will check this cache before execution.
	resultCache *ResultCache

	// broadcaster streams workflow execution events to UI in real-time.
	// Inspired by LangGraph's multi-mode streaming (values/updates/events).
	// When set, node start/complete/cached events are broadcast.
	broadcaster EventBroadcaster

	// automationEngine evaluates event-driven automations on workflow state changes.
	// Inspired by Prefect 3 Automations: declarative rules that trigger actions
	// (notifications, workflow chaining, webhooks) on state transitions.
	automationEngine *AutomationEngine

	// artifactStore manages typed, versioned execution outputs.
	// Inspired by Prefect 3 Artifacts: typed data (json, markdown, table, link)
	// produced by workflow nodes, queryable across runs, with versioning.
	artifactStore *WorkflowArtifactStore

	// variableStore manages typed workflow variables for structured data flow.
	// Inspired by Dify's Variable System: typed variables with defaults,
	// validation, and {{variable.key}} template resolution.
	variableStore *WorkflowVariableStore

	// auditLogger records admin operations for compliance and debugging.
	// Inspired by Temporal Cloud Audit Log (GA Jan 2026): comprehensive trail
	// of who did what, when, with UI and API access.
	auditLogger *audit.Logger

	// wg tracks goroutines spawned for async workflow execution (resume, retry)
	wg sync.WaitGroup
}

// NewOrchestrator creates a new orchestrator
func NewOrchestrator(scheduler *Scheduler) *Orchestrator {
	return &Orchestrator{
		workflows:        make(map[string]*Workflow),
		checkpoints:      make(map[string][]*Checkpoint),
		signalBus:        NewSignalBus(),
		scheduler:        scheduler,
		resultCache:      NewResultCache(),
		automationEngine: NewAutomationEngine(),
		artifactStore:    NewWorkflowArtifactStore(),
		variableStore:    NewWorkflowVariableStore(),
		auditLogger:      audit.NewLogger("", 10000), // in-memory audit log, 10k max
		FailurePolicy:    FailurePolicyFailFast,
	}
}

// Close waits for all in-flight async workflow goroutines (e.g. ResumeWorkflow)
// to complete before returning. Must be called during shutdown to prevent goroutine leaks.
func (o *Orchestrator) Close() {
	o.wg.Wait()
}

// SetFailurePolicy sets the failure handling policy for parallel execution.
// Must be called before Execute.
func (o *Orchestrator) SetFailurePolicy(policy FailurePolicy) {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.FailurePolicy = policy
}

// SetMaxRounds limits total node executions per workflow.
// Inspired by AutoGen's max_rounds. 0 = unlimited (default).
func (o *Orchestrator) SetMaxRounds(max int) {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.MaxRounds = max
}

// SetBroadcaster sets the event broadcaster for workflow execution streaming.
// When set, node start/complete/cached events are broadcast in real-time.
// Inspired by LangGraph's multi-mode streaming (values/updates/messages/events).
func (o *Orchestrator) SetBroadcaster(broadcaster EventBroadcaster) {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.broadcaster = broadcaster
}

// GetBroadcaster returns the current event broadcaster (may be nil).
func (o *Orchestrator) GetBroadcaster() EventBroadcaster {
	o.mu.RLock()
	defer o.mu.RUnlock()
	return o.broadcaster
}

// GetArtifactStore returns the artifact store for managing typed workflow outputs.
func (o *Orchestrator) GetArtifactStore() *WorkflowArtifactStore {
	return o.artifactStore
}

// GetVariableStore returns the variable store for managing typed workflow variables.
func (o *Orchestrator) GetVariableStore() *WorkflowVariableStore {
	return o.variableStore
}

// GetAutomationEngine returns the automation engine for managing event-driven rules.
func (o *Orchestrator) GetAutomationEngine() *AutomationEngine {
	o.mu.RLock()
	defer o.mu.RUnlock()
	return o.automationEngine
}

// GetAuditLogger returns the audit logger for admin operation tracking.
func (o *Orchestrator) GetAuditLogger() *audit.Logger {
	o.mu.RLock()
	defer o.mu.RUnlock()
	return o.auditLogger
}

// SetAuditLogger sets a custom audit logger (e.g., with file persistence).
func (o *Orchestrator) SetAuditLogger(logger *audit.Logger) {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.auditLogger = logger
}

// triggerChainedWorkflows executes downstream workflows defined in OnComplete.
// Inspired by CrewAI Flows: sequential workflow composition where output flows
// to the next workflow. Runs asynchronously to avoid blocking the parent.
// Conditions: "always" (default), "on_success" (completed only), "on_failure" (failed only).
func (o *Orchestrator) triggerChainedWorkflows(w *Workflow, terminalStatus string) {
	w.mu.RLock()
	links := make([]WorkflowChainLink, len(w.OnComplete))
	copy(links, w.OnComplete)
	w.mu.RUnlock()

	if len(links) == 0 {
		return
	}

	for _, link := range links {
		// Self-loop prevention: skip if chained workflow is the same as the current one
		if link.WorkflowID == w.ID {
			log.Printf("[Orchestration] Skipping self-loop chain: workflow %q chains to itself", w.ID)
			continue
		}

		// Evaluate condition
		switch link.Condition {
		case "on_success":
			if terminalStatus != "completed" {
				continue
			}
		case "on_failure":
			if terminalStatus != "failed" {
				continue
			}
		case "", "always":
			// always trigger
		default:
			log.Printf("[Orchestration] Unknown chain condition %q in workflow %q, treating as always", link.Condition, w.ID)
		}

		// Capture for goroutine
		link := link
		parentID := w.ID
		o.wg.Add(1)
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[Orchestration] Chain workflow panic for %q → %q: %v", parentID, link.WorkflowID, r)
				}
				o.wg.Done()
			}()
			log.Printf("[Orchestration] Chaining workflow %q → %q (condition: %s)",
				parentID, link.WorkflowID, link.Condition)

			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			err := o.Execute(ctx, link.WorkflowID)
			chainStatus := "completed"
			if err != nil {
				chainStatus = "failed"
				log.Printf("[Orchestration] Chained workflow %q failed: %v", link.WorkflowID, err)
			} else {
				log.Printf("[Orchestration] Chained workflow %q completed", link.WorkflowID)
			}

			if b := o.GetBroadcaster(); b != nil {
				b.Broadcast("workflow_chain_completed", map[string]any{
					"parentWorkflowId": parentID,
					"childWorkflowId":  link.WorkflowID,
					"status":           chainStatus,
				})
			}
		}()
	}
}

// setWorkflowStatus sets the workflow status and broadcasts a status change event.
// Must be called WITHOUT holding w.mu (this method acquires it internally).
func (o *Orchestrator) setWorkflowStatus(w *Workflow, status string) {
	w.mu.Lock()
	w.Status = status
	wfID := w.ID
	w.mu.Unlock()

	if b := o.GetBroadcaster(); b != nil {
		b.Broadcast("workflow_status_change", map[string]any{
			"workflowId": wfID,
			"status":     status,
		})
	}

	// Evaluate automations on workflow state changes (Prefect 3 pattern)
	// Use a short timeout context to prevent indefinite blocking while allowing
	// automation actions to complete independently of parent workflow context.
	if ae := o.GetAutomationEngine(); ae != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel() // Ensure context is cancelled after EvaluateEvent returns
		ae.EvaluateEvent(ctx, "workflow."+status, map[string]any{
			"workflowId": wfID,
			"status":     status,
		})
	}

	// Workflow chaining: trigger downstream workflows on terminal states (CrewAI Flows pattern)
	if status == "completed" || status == "failed" {
		o.triggerChainedWorkflows(w, status)
	}
}

// GetSignalBus returns the signal/query bus for the orchestrator.
// Use to register signal handlers, query handlers, or send signals to running workflows.
func (o *Orchestrator) GetSignalBus() *SignalBus {
	o.mu.RLock()
	defer o.mu.RUnlock()
	return o.signalBus
}

// GetResultCache returns the result cache for manual inspection or invalidation.
// Use ClearNodeCache/ClearAllCaches for common operations.
func (o *Orchestrator) GetResultCache() *ResultCache {
	return o.resultCache
}

// ClearNodeCache removes all cached results for a specific node.
func (o *Orchestrator) ClearNodeCache(nodeID string) {
	o.resultCache.DeleteByNodeID(nodeID)
}

// ClearAllCaches removes all cached node results.
func (o *Orchestrator) ClearAllCaches() {
	o.resultCache.Clear()
}

// CreateWorkflow creates a new workflow
func (o *Orchestrator) CreateWorkflow(name string, mode OrchestrationMode) *Workflow {
	o.mu.Lock()
	defer o.mu.Unlock()

	now := time.Now()
	workflow := &Workflow{
		ID:          fmt.Sprintf("wf-%s", uuid.New().String()[:8]),
		Name:        name,
		Mode:        mode,
		Nodes:       make([]*WorkflowNode, 0),
		Edges:       make([]*WorkflowEdge, 0),
		Status:      "draft",
		CreatedAt:   now,
		UpdatedAt:   now,
		execHistory: make([]ExecutionStep, 0),
	}

	o.workflows[workflow.ID] = workflow

	// Audit log
	if o.auditLogger != nil {
		o.auditLogger.Log("api", "system", "create", "workflow", workflow.ID, map[string]any{
			"name": name,
			"mode": string(mode),
		}, true, "")
	}

	return workflow
}

// AddNode adds a node to a workflow
func (w *Workflow) AddNode(node *WorkflowNode) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.Nodes = append(w.Nodes, node)
	w.UpdatedAt = time.Now()
}

// SetDescription sets the workflow description safely
func (w *Workflow) SetDescription(desc string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.Description = desc
}

// SetName updates the workflow name (thread-safe)
func (w *Workflow) SetName(name string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.Name = name
}

// WorkflowSnapshot is a read-only copy of workflow state for safe external access
type WorkflowSnapshot struct {
	ID          string
	Name        string
	Description string
	Mode        OrchestrationMode
	Status      string
	CreatedAt   time.Time
	UpdatedAt   time.Time
	Version     int
	Nodes       []WorkflowNode
	Edges       []WorkflowEdge
	// Interrupt state (LangGraph pattern)
	InterruptedNodeID string
	InterruptPhase    string
	// Workflow chaining (CrewAI Flows pattern)
	OnComplete []WorkflowChainLink
}

// Snapshot returns a consistent copy of workflow state under read lock
func (w *Workflow) Snapshot() WorkflowSnapshot {
	w.mu.RLock()
	defer w.mu.RUnlock()

	nodes := make([]WorkflowNode, len(w.Nodes))
	for i, n := range w.Nodes {
		nodes[i] = *n
	}

	edges := make([]WorkflowEdge, len(w.Edges))
	for i, e := range w.Edges {
		edges[i] = *e
	}

	// Deep copy OnComplete slice
	onComplete := make([]WorkflowChainLink, len(w.OnComplete))
	copy(onComplete, w.OnComplete)

	return WorkflowSnapshot{
		ID:                w.ID,
		Name:              w.Name,
		Description:       w.Description,
		Mode:              w.Mode,
		Status:            w.Status,
		CreatedAt:         w.CreatedAt,
		UpdatedAt:         w.UpdatedAt,
		Version:           w.Version,
		Nodes:             nodes,
		Edges:             edges,
		InterruptedNodeID: w.InterruptedNodeID,
		InterruptPhase:    w.InterruptPhase,
		OnComplete:        onComplete,
	}
}

// AddEdge adds an edge between nodes
func (w *Workflow) AddEdge(edge *WorkflowEdge) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	// Validate nodes exist
	fromExists := false
	toExists := false
	for _, n := range w.Nodes {
		if n.ID == edge.From {
			fromExists = true
		}
		if n.ID == edge.To {
			toExists = true
		}
	}

	if !fromExists || !toExists {
		return fmt.Errorf("edge references non-existent node")
	}

	w.Edges = append(w.Edges, edge)
	w.UpdatedAt = time.Now()
	return nil
}

// CreateVersion creates a new version snapshot of the workflow.
// Returns the new version number. Inspired by LangGraph's versioned state management.
func (w *Workflow) CreateVersion(description string) int {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.Version++
	now := time.Now()

	// Deep copy nodes and edges for snapshot
	nodesCopy := make([]*WorkflowNode, len(w.Nodes))
	for i, n := range w.Nodes {
		nodeCopy := *n
		if n.Config != nil {
			nodeCopy.Config = make(map[string]any, len(n.Config))
			maps.Copy(nodeCopy.Config, n.Config)
		}
		nodesCopy[i] = &nodeCopy
	}

	edgesCopy := make([]*WorkflowEdge, len(w.Edges))
	for i, e := range w.Edges {
		edgeCopy := *e
		edgesCopy[i] = &edgeCopy
	}

	version := &WorkflowVersion{
		Version:     w.Version,
		CreatedAt:   now,
		Description: description,
		Nodes:       nodesCopy,
		Edges:       edgesCopy,
		Mode:        w.Mode,
	}

	w.VersionHistory = append(w.VersionHistory, version)
	w.UpdatedAt = now

	return w.Version
}

// RollbackToVersion reverts the workflow to a previous version.
// Returns an error if the version doesn't exist.
func (w *Workflow) RollbackToVersion(version int) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	// Find the version in history
	var targetVersion *WorkflowVersion
	for _, v := range w.VersionHistory {
		if v.Version == version {
			targetVersion = v
			break
		}
	}

	if targetVersion == nil {
		return fmt.Errorf("version %d not found in history", version)
	}

	// Restore nodes and edges from the target version
	nodesCopy := make([]*WorkflowNode, len(targetVersion.Nodes))
	for i, n := range targetVersion.Nodes {
		nodeCopy := *n
		if n.Config != nil {
			nodeCopy.Config = make(map[string]any, len(n.Config))
			maps.Copy(nodeCopy.Config, n.Config)
		}
		nodesCopy[i] = &nodeCopy
	}

	edgesCopy := make([]*WorkflowEdge, len(targetVersion.Edges))
	for i, e := range targetVersion.Edges {
		edgeCopy := *e
		edgesCopy[i] = &edgeCopy
	}

	w.Nodes = nodesCopy
	w.Edges = edgesCopy
	w.Mode = targetVersion.Mode
	w.Version = targetVersion.Version
	w.UpdatedAt = time.Now()
	w.Status = "draft" // Reset status after rollback

	return nil
}

// GetVersionHistory returns a copy of the version history.
func (w *Workflow) GetVersionHistory() []*WorkflowVersion {
	w.mu.RLock()
	defer w.mu.RUnlock()

	history := make([]*WorkflowVersion, len(w.VersionHistory))
	copy(history, w.VersionHistory)
	return history
}

// GetVersion returns a specific version from history.
func (w *Workflow) GetVersion(version int) *WorkflowVersion {
	w.mu.RLock()
	defer w.mu.RUnlock()

	for _, v := range w.VersionHistory {
		if v.Version == version {
			return v
		}
	}
	return nil
}

// GetNextNodes returns nodes that should execute after the given node
func (w *Workflow) GetNextNodes(nodeID string) []*WorkflowNode {
	w.mu.RLock()
	// Pre-read ChosenAction for action-based routing (Dify HITL pattern).
	var chosenAction string
	for _, n := range w.Nodes {
		if n.ID == nodeID {
			chosenAction = n.ChosenAction
			break
		}
	}

	var nextIDs []string
	for _, edge := range w.Edges {
		if edge.From == nodeID {
			// Check condition if present
			skipEdge := false
			if edge.Condition != "" {
				switch edge.Condition {
				case "success":
					for _, n := range w.Nodes {
						if n.ID == nodeID && n.Status != TaskStatusCompleted {
							skipEdge = true
							break
						}
					}
				case "failure":
					for _, n := range w.Nodes {
						if n.ID == nodeID && n.Status != TaskStatusFailed {
							skipEdge = true
							break
						}
					}
				case "always":
				case "true", "false":
					// Condition node output routing (Dify IF node pattern)
					// Matches ChosenAction set by ExecuteConditionNode
					if chosenAction != "" && chosenAction != edge.Condition {
						skipEdge = true
					}
				default:
					// Action-based routing: match ChosenAction against edge condition
					if chosenAction != "" {
						if chosenAction != edge.Condition {
							skipEdge = true
						}
					} else {
						// No ChosenAction set and condition is not a recognized keyword.
						// This could be a typo (e.g., "sucess" instead of "success") or
						// a condition waiting for future action input — skip to be safe.
						log.Printf("[Orchestration] Edge condition %q has no matching ChosenAction, skipping edge %s->%s",
							edge.Condition, edge.From, edge.To)
						skipEdge = true
					}
				}
			}
			if !skipEdge {
				nextIDs = append(nextIDs, edge.To)
			}
		}
	}

	var nodes []*WorkflowNode
	for _, n := range w.Nodes {
		for _, id := range nextIDs {
			if n.ID == id {
				nodes = append(nodes, n)
			}
		}
	}
	w.mu.RUnlock()

	// Consume ChosenAction outside RLock (requires write access).
	// One-shot: cleared after first GetNextNodes call so subsequent calls
	// fall back to default edge evaluation.
	if chosenAction != "" {
		w.mu.Lock()
		for _, n := range w.Nodes {
			if n.ID == nodeID {
				n.ChosenAction = ""
				break
			}
		}
		w.mu.Unlock()
	}

	return nodes
}

// GetStartNodes returns nodes with no incoming edges
func (w *Workflow) GetStartNodes() []*WorkflowNode {
	w.mu.RLock()
	defer w.mu.RUnlock()

	hasIncoming := make(map[string]bool)
	for _, edge := range w.Edges {
		hasIncoming[edge.To] = true
	}

	// Also consider DependsOn as implicit incoming edges
	for _, n := range w.Nodes {
		for _, dep := range n.DependsOn {
			hasIncoming[n.ID] = true
			_ = dep // dependency noted
		}
	}

	var startNodes []*WorkflowNode
	for _, n := range w.Nodes {
		if !hasIncoming[n.ID] {
			startNodes = append(startNodes, n)
		}
	}
	return startNodes
}

// GetPreviousNodes returns nodes that have edges pointing to the given node.
// Used by merge nodes to collect upstream results.
// GetPreviousNodes returns deep copies of predecessor nodes to prevent data races.
// Callers can safely access returned nodes without holding any lock.
func (w *Workflow) GetPreviousNodes(nodeID string) []*WorkflowNode {
	w.mu.RLock()
	defer w.mu.RUnlock()

	var prevIDs []string
	for _, edge := range w.Edges {
		if edge.To == nodeID {
			prevIDs = append(prevIDs, edge.From)
		}
	}

	var nodes []*WorkflowNode
	for _, n := range w.Nodes {
		for _, id := range prevIDs {
			if n.ID == id {
				// Return deep copy to prevent caller from mutating internal state
				nodes = append(nodes, snapshotWorkflowNode(n))
				break
			}
		}
	}
	return nodes
}

// snapshotWorkflowNode creates a deep copy of a WorkflowNode.
func snapshotWorkflowNode(n *WorkflowNode) *WorkflowNode {
	if n == nil {
		return nil
	}
	cp := *n // shallow copy of struct
	// Deep copy Config map using deepCopyAny (handles map[string]any recursively)
	if n.Config != nil {
		cp.Config = deepCopyAny(n.Config).(map[string]any)
	}
	// Deep copy Result (any type)
	cp.Result = deepCopyAny(n.Result)
	// Deep copy InterruptActions slice
	if n.InterruptActions != nil {
		cp.InterruptActions = make([]InterruptAction, len(n.InterruptActions))
		copy(cp.InterruptActions, n.InterruptActions)
	}
	return &cp
}

// TopologicalSort returns nodes in dependency order using Kahn's algorithm.
// Inspired by CrewAI's declarative task dependency resolution.
// Returns nodes sorted so that all dependencies of a node appear before it.
// Returns an error if a cycle is detected.
func (w *Workflow) TopologicalSort() ([]*WorkflowNode, error) {
	w.mu.RLock()
	defer w.mu.RUnlock()

	// Build adjacency list from both Edges and DependsOn
	nodeMap := make(map[string]*WorkflowNode, len(w.Nodes))
	for _, n := range w.Nodes {
		nodeMap[n.ID] = n
	}

	// Compute in-degree for each node
	inDegree := make(map[string]int, len(w.Nodes))
	adjList := make(map[string][]string, len(w.Nodes))

	for _, edge := range w.Edges {
		adjList[edge.From] = append(adjList[edge.From], edge.To)
		inDegree[edge.To]++
	}
	for _, n := range w.Nodes {
		for _, dep := range n.DependsOn {
			if _, ok := nodeMap[dep]; !ok {
				return nil, fmt.Errorf("node %q depends on non-existent node %q", n.ID, dep)
			}
			adjList[dep] = append(adjList[dep], n.ID)
			inDegree[n.ID]++
		}
	}

	// Initialize queue with zero in-degree nodes
	var queue []string
	for _, n := range w.Nodes {
		if inDegree[n.ID] == 0 {
			queue = append(queue, n.ID)
		}
	}

	var sorted []*WorkflowNode
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		sorted = append(sorted, nodeMap[id])

		for _, next := range adjList[id] {
			inDegree[next]--
			if inDegree[next] == 0 {
				queue = append(queue, next)
			}
		}
	}

	if len(sorted) != len(w.Nodes) {
		return nil, fmt.Errorf("dependency cycle detected: sorted %d of %d nodes", len(sorted), len(w.Nodes))
	}
	return sorted, nil
}

// GetExecutableNodes returns nodes whose dependencies are all satisfied.
// A node is executable if all nodes in its DependsOn list have status "completed".
func (w *Workflow) GetExecutableNodes() []*WorkflowNode {
	w.mu.RLock()
	defer w.mu.RUnlock()

	completed := make(map[string]bool, len(w.Nodes))
	for _, n := range w.Nodes {
		if n.Status == TaskStatusCompleted {
			completed[n.ID] = true
		}
	}

	var ready []*WorkflowNode
	for _, n := range w.Nodes {
		if n.Status != "" {
			continue // Already started or completed
		}
		allDepsMet := true
		for _, dep := range n.DependsOn {
			if !completed[dep] {
				allDepsMet = false
				break
			}
		}
		if allDepsMet {
			ready = append(ready, n)
		}
	}
	return ready
}

// Execute runs the workflow with optional retry on failure.
// Inspired by Temporal's workflow-level retry: if WorkflowRetryPolicy is set,
// failed executions are retried with exponential backoff + jitter.
// Only retryable errors (ClassifiedError with type Retryable/Timeout) are retried.
func (o *Orchestrator) Execute(ctx context.Context, workflowID string) error {
	o.mu.RLock()
	workflow, exists := o.workflows[workflowID]
	retryPolicy := o.WorkflowRetryPolicy
	auditLogger := o.auditLogger // Snapshot under lock
	o.mu.RUnlock()

	if !exists {
		return fmt.Errorf("workflow not found: %s", workflowID)
	}

	// Audit log workflow execution start
	if auditLogger != nil {
		workflow.mu.RLock()
		auditLogger.Log("api", "system", "execute", "workflow", workflowID, map[string]any{
			"name": workflow.Name,
			"mode": string(workflow.Mode),
		}, true, "")
		workflow.mu.RUnlock()
	}

	// Fast path: no retry policy
	if retryPolicy == nil {
		return o.executeWorkflow(ctx, workflow)
	}

	// Retry loop with exponential backoff
	attempt := 0
	for {
		err := o.executeWorkflow(ctx, workflow)
		if err == nil {
			return nil
		}

	// Only retry ClassifiedErrors that are retryable, or context deadline exceeded
	// (which may succeed with a longer workflow timeout).
	// Regular errors (not ClassifiedError) are not retried.
		var ce *ClassifiedError
		isDeadlineExceeded := errors.Is(err, context.DeadlineExceeded)
		if !errors.As(err, &ce) || !ce.IsRetryable() {
			if !isDeadlineExceeded {
				return err
			}
			// Wrap as a retryable timeout for retry policy
			ce = ClassifyError(err, ErrorTypeTimeout)
		}

		attempt++

		// Check max attempts
		if retryPolicy.MaximumAttempts > 0 && attempt >= retryPolicy.MaximumAttempts {
			return fmt.Errorf("workflow %q failed after %d attempts: %w", workflowID, attempt, err)
		}

		// Calculate delay with backoff + jitter
		delay := retryPolicy.GetNextDelay(attempt)
		if ce != nil && ce.RetryAfter > 0 {
			delay = ce.RetryAfter
		}

		// Wait for retry delay or context cancellation
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return fmt.Errorf("workflow %q cancelled during retry wait: %w", workflowID, ctx.Err())
		case <-timer.C:
			log.Printf("[Orchestration] Retrying workflow %q (attempt %d) after %v: %v",
				workflowID, attempt, delay, err)
		}
	}
}

// executeWorkflow runs the workflow's execution mode without retry.
func (o *Orchestrator) executeWorkflow(ctx context.Context, workflow *Workflow) error {
	// HIGH: Snapshot WorkflowTimeout under lock to prevent data race
	o.mu.RLock()
	workflowTimeout := o.WorkflowTimeout
	o.mu.RUnlock()

	// Apply workflow-level timeout if configured (Temporal Schedule-to-Close pattern)
	if workflowTimeout > 0 {
		wctx, wcancel := context.WithTimeout(ctx, workflowTimeout)
		defer wcancel()
		ctx = wctx
	}

	// Check if context is already cancelled or timed out before doing any work
	if err := ctx.Err(); err != nil {
		return err
	}

	workflow.mu.Lock()
	// Guard against concurrent execution (e.g., triggerChainedWorkflows + manual Execute)
	if workflow.Status == "running" {
		workflow.mu.Unlock()
		return fmt.Errorf("workflow %q is already running", workflow.ID)
	}
	workflow.Status = "running"
	mode := workflow.Mode
	workflow.mu.Unlock()

	o.setWorkflowStatus(workflow, "running")

	switch mode {
	case ModeSequential:
		return o.executeSequential(ctx, workflow)
	case ModeParallel:
		return o.executeParallel(ctx, workflow)
	case ModeHierarchical:
		return o.executeHierarchical(ctx, workflow)
	case ModeConsensual:
		return o.executeConsensual(ctx, workflow)
	case ModeGroupChat:
		return o.executeGroupChat(ctx, workflow)
	case ModeGraph:
		return o.executeGraph(ctx, workflow)
	default:
		o.setWorkflowStatus(workflow, "failed")
		return fmt.Errorf("unknown orchestration mode: %s", mode)
	}
}

// executeSequential runs nodes one after another
func (o *Orchestrator) executeSequential(ctx context.Context, w *Workflow) error {
	startTime := time.Now()
	startNodes := w.GetStartNodes()
	if len(startNodes) == 0 {
		o.setWorkflowStatus(w, "failed")
		return fmt.Errorf("no start nodes found")
	}

	// Create execution report (Temporal-inspired observability)
	w.mu.RLock()
	report := NewWorkflowExecutionReport(w.ID, w.Mode)
	report.SetTotal(len(w.Nodes))
	w.mu.RUnlock()

	// Follow the chain
	visited := make(map[string]bool) // HIGH FIX: Track visited nodes to detect cycles
	current := startNodes[0]
	var execErr error

	for current != nil {
		// HIGH FIX: Check context cancellation between nodes
		if ctx.Err() != nil {
			o.setWorkflowStatus(w, "failed")
			report.AddFailure(current.ID, FailureTypeCancelled, ctx.Err().Error(), startTime, float64(time.Since(startTime).Milliseconds()))
			if compErr := o.RunCompensation(ctx, w.ID); compErr != nil {
				log.Printf("[Orchestration] Compensation error: %v", compErr)
			}
			execErr = ctx.Err()
			break
		}

		// HIGH FIX: Cycle detection - skip already visited nodes
		if visited[current.ID] {
			log.Printf("[Orchestration] Cycle detected, skipping node %q", current.ID)
			break
		}
		visited[current.ID] = true

		// Skip already-completed nodes (e.g., after resume from interrupt)
		w.mu.RLock()
		isCompleted := current.Status == TaskStatusCompleted
		w.mu.RUnlock()
		if isCompleted {
			w.mu.RLock()
			completedAt := current.CompletedAt
			startedAt := current.StartedAt
			result := current.Result
			w.mu.RUnlock()
			if completedAt != nil && startedAt != nil {
				report.AddSuccess(current.ID, result, *startedAt, *completedAt)
			}
			next := w.GetNextNodes(current.ID)
			if len(next) > 0 {
				current = next[0]
			} else {
				current = nil
			}
			continue
		}

		// Create checkpoint before each node (sequential mode default).
		// When AutoCheckpoint is on, executeNode also checkpoints after completion,
		// giving before+after coverage for maximum recovery granularity.
		if !o.AutoCheckpoint {
			o.createCheckpoint(w)
		}

		// Execute node
		nodeStart := time.Now()
		if err := o.executeNode(ctx, w, current); err != nil {
			// CRITICAL: Handle interrupt (LangGraph pattern)
			// Interrupts are NOT failures - they pause execution for external input
			if IsInterruptError(err) {
				// Workflow status already set to "paused" in executeNode
				report.Finalize("paused", float64(time.Since(startTime).Milliseconds()))
				w.mu.Lock()
				w.LastExecutionReport = report
				w.mu.Unlock()
				return nil // Exit cleanly, workflow remains paused
			}

			o.setWorkflowStatus(w, "failed")
			// Update failed node status (was left as TaskStatusRunning)
			failTime := time.Now()
			w.mu.Lock()
			current.Status = TaskStatusFailed
			current.CompletedAt = &failTime
			w.mu.Unlock()
			// Classify failure type
			ft := classifyError(err)
			report.AddFailure(current.ID, ft, err.Error(), nodeStart, float64(time.Since(nodeStart).Milliseconds()))
			// CRITICAL FIX: Run saga compensation on failure (Temporal pattern)
			if compErr := o.RunCompensation(ctx, w.ID); compErr != nil {
				log.Printf("[Orchestration] Compensation error: %v", compErr)
			}
			execErr = err
			break
		}

		// Record success (snapshot under lock for consistency)
		w.mu.RLock()
		seqCompletedAt := current.CompletedAt
		seqStartedAt := current.StartedAt
		seqResult := current.Result
		w.mu.RUnlock()
		if seqCompletedAt != nil && seqStartedAt != nil {
			report.AddSuccess(current.ID, seqResult, *seqStartedAt, *seqCompletedAt)
		}

		// Get next node
		nextNodes := w.GetNextNodes(current.ID)
		if len(nextNodes) == 0 {
			break
		}
		current = nextNodes[0]
	}

	// Finalize and store report
	if execErr != nil {
		report.Finalize("failed", float64(time.Since(startTime).Milliseconds()))
	} else {
		o.setWorkflowStatus(w, "completed")
		report.Finalize("completed", float64(time.Since(startTime).Milliseconds()))
	}

	// Store report on workflow
	w.mu.Lock()
	w.LastExecutionReport = report
	w.mu.Unlock()

	return execErr
}

// classifyError determines the failure type from an error
func classifyError(err error) FailureType {
	if err == nil {
		return FailureTypeUnknown
	}

	// Check custom error types first (more reliable than string matching)
	var timeoutErr *TimeoutError
	if errors.As(err, &timeoutErr) {
		return FailureTypeTimeout
	}

	var interruptErr *InterruptError
	if errors.As(err, &interruptErr) {
		return FailureTypeInterrupt
	}

	// Check standard library error types
	if errors.Is(err, context.DeadlineExceeded) {
		return FailureTypeTimeout
	}
	if errors.Is(err, context.Canceled) {
		return FailureTypeCancelled
	}

	// Fallback: check error message for patterns (less reliable)
	errMsg := err.Error()
	if containsAny(errMsg, []string{"validation", "invalid", "required"}) {
		return FailureTypeValidation
	}
	if containsAny(errMsg, []string{"timeout", "timed out", "deadline exceeded"}) {
		return FailureTypeTimeout
	}
	if containsAny(errMsg, []string{"agent", "connection"}) {
		return FailureTypeAgentError
	}
	if containsAny(errMsg, []string{"system", "internal"}) {
		return FailureTypeSystem
	}
	return FailureTypeUnknown
}

// containsAny checks if s contains any of the substrings
func containsAny(s string, substrs []string) bool {
	for _, sub := range substrs {
		if strings.Contains(strings.ToLower(s), strings.ToLower(sub)) {
			return true
		}
	}
	return false
}

// executeParallel runs all start nodes simultaneously with configurable failure policy
func (o *Orchestrator) executeParallel(ctx context.Context, w *Workflow) error {
	startNodes := w.GetStartNodes()
	if len(startNodes) == 0 {
		o.setWorkflowStatus(w, "failed")
		return fmt.Errorf("no start nodes found")
	}

	o.mu.RLock()
	policy := o.FailurePolicy
	o.mu.RUnlock()

	// Create execution report for observability (Temporal-inspired)
	startTime := time.Now()
	w.mu.RLock()
	report := NewWorkflowExecutionReport(w.ID, w.Mode)
	w.mu.RUnlock()
	report.SetTotal(len(startNodes))

	var wg sync.WaitGroup
	errChan := make(chan error, len(startNodes))

	for _, node := range startNodes {
		nodeStart := time.Now() // capture per-node start time
		wg.Add(1)
		go func(n *WorkflowNode) {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[Orchestration] Parallel node %s panic: %v", n.ID, r)
					failNow := time.Now()
					w.mu.Lock()
					n.Status = TaskStatusFailed
					n.CompletedAt = &failNow
					w.mu.Unlock()
					report.AddFailure(n.ID, FailureTypeSystem, fmt.Sprintf("panic: %v", r), nodeStart, float64(time.Since(nodeStart).Milliseconds()))
					errChan <- fmt.Errorf("node %s panicked: %v", n.ID, r)
				}
				wg.Done()
			}()
			if err := o.executeNode(ctx, w, n); err != nil {
				if !IsInterruptError(err) {
					failNow := time.Now()
					w.mu.Lock()
					n.Status = TaskStatusFailed
					n.CompletedAt = &failNow
					w.mu.Unlock()
					report.AddFailure(n.ID, classifyError(err), err.Error(), nodeStart, float64(time.Since(nodeStart).Milliseconds()))
				}
				errChan <- err
			} else {
				// Snapshot node fields under lock to prevent data race
				// with concurrent workflow modifications (e.g., RestoreVersion)
				w.mu.RLock()
				completedAt := n.CompletedAt
				startedAt := n.StartedAt
				result := n.Result
				w.mu.RUnlock()
				if completedAt != nil && startedAt != nil {
					report.AddSuccess(n.ID, result, *startedAt, *completedAt)
				}
			}
		}(node)
	}

	// Apply failure policy
	switch policy {
	case FailurePolicyFailFast:
		// Wait for all workers to complete, then drain errors.
		// Previous select-based approach had a race: if errChan and done became
		// ready simultaneously, Go's select could pick done, silently discarding errors.
		wg.Wait()
		close(errChan)
		var firstErr error
		for err := range errChan {
			if firstErr == nil {
				firstErr = err
			}
		}
		if firstErr != nil {
			if IsInterruptError(firstErr) {
				// Interrupt already set status to "paused" in executeNode;
				// do NOT overwrite to "failed"
				report.Finalize("paused", float64(time.Since(startTime).Milliseconds()))
				w.mu.Lock()
				w.LastExecutionReport = report
				w.mu.Unlock()
				return nil // Don't propagate interrupt as error
			}
			o.setWorkflowStatus(w, "failed")
			if compErr := o.RunCompensation(ctx, w.ID); compErr != nil {
				log.Printf("[Orchestration] Compensation error: %v", compErr)
			}
			report.Finalize("failed", float64(time.Since(startTime).Milliseconds()))
			w.mu.Lock()
			w.LastExecutionReport = report
			w.mu.Unlock()
			return firstErr
		}

	case FailurePolicyFailMajority:
		wg.Wait()
		close(errChan)
		total := len(startNodes)
		failCount := 0
		var firstErr error
		for err := range errChan {
			failCount++
			if firstErr == nil {
				firstErr = err
			}
		}
		if failCount > total/2 {
			o.setWorkflowStatus(w, "failed")
			// Run compensation for successful nodes when majority fails
			if compErr := o.RunCompensation(ctx, w.ID); compErr != nil {
				log.Printf("[Orchestration] Compensation error (fail_majority): %v", compErr)
			}
			report.Finalize("failed", float64(time.Since(startTime).Milliseconds()))
			w.mu.Lock()
			w.LastExecutionReport = report
			w.mu.Unlock()
			return fmt.Errorf("majority failed (%d/%d): %w", failCount, total, firstErr)
		}

	case FailurePolicyContinuePartial:
		wg.Wait()
		close(errChan)
		var errs []error
		for err := range errChan {
			errs = append(errs, err)
		}
		if len(errs) > 0 {
			o.setWorkflowStatus(w, "partial")
			report.Finalize("partial", float64(time.Since(startTime).Milliseconds()))
			w.mu.Lock()
			w.LastExecutionReport = report
			w.mu.Unlock()
			return fmt.Errorf("%d/%d nodes failed (continue_partial policy)", len(errs), len(startNodes))
		}

	default:
		// Unknown policy, fall back to fail-fast
		wg.Wait()
		close(errChan)
		for err := range errChan {
			if err != nil {
				o.setWorkflowStatus(w, "failed")
				report.Finalize("failed", float64(time.Since(startTime).Milliseconds()))
				w.mu.Lock()
				w.LastExecutionReport = report
				w.mu.Unlock()
				return err
			}
		}
	}

	o.setWorkflowStatus(w, "completed")
	report.Finalize("completed", float64(time.Since(startTime).Milliseconds()))
	w.mu.Lock()
	w.LastExecutionReport = report
	w.mu.Unlock()
	return nil
}

// executeHierarchical uses coordinator-worker pattern with configurable failure policy
func (o *Orchestrator) executeHierarchical(ctx context.Context, w *Workflow) error {
	// Snapshot nodes under lock
	w.mu.RLock()
	nodes := make([]*WorkflowNode, len(w.Nodes))
	copy(nodes, w.Nodes)
	w.mu.RUnlock()

	// Find coordinator (first node with type "coordinator" or first node)
	var coordinator *WorkflowNode
	var workers []*WorkflowNode

	for _, n := range nodes {
		if n.Type == "coordinator" || coordinator == nil {
			coordinator = n
		} else {
			workers = append(workers, n)
		}
	}

	if coordinator == nil {
		o.setWorkflowStatus(w, "failed")
		return fmt.Errorf("no coordinator node found")
	}

	// Create execution report for observability
	startTime := time.Now()
	w.mu.RLock()
	report := NewWorkflowExecutionReport(w.ID, w.Mode)
	w.mu.RUnlock()
	report.SetTotal(len(nodes))

	// Execute coordinator first
	coordStart := time.Now()
	if err := o.executeNode(ctx, w, coordinator); err != nil {
		if IsInterruptError(err) {
			report.Finalize("paused", float64(time.Since(startTime).Milliseconds()))
			w.mu.Lock()
			w.LastExecutionReport = report
			w.mu.Unlock()
			return nil
		}
		failNow := time.Now()
		w.mu.Lock()
		coordinator.Status = TaskStatusFailed
		coordinator.CompletedAt = &failNow
		w.mu.Unlock()
		report.AddFailure(coordinator.ID, classifyError(err), err.Error(), coordStart, float64(time.Since(coordStart).Milliseconds()))
		report.Finalize("failed", float64(time.Since(startTime).Milliseconds()))
		w.mu.Lock()
		w.LastExecutionReport = report
		w.mu.Unlock()
		o.setWorkflowStatus(w, "failed")
		if compErr := o.RunCompensation(ctx, w.ID); compErr != nil {
			log.Printf("[Orchestration] Compensation error during hierarchical execution: %v", compErr)
		}
		return err
	}
	w.mu.RLock()
	coordinatorCompleted := coordinator.CompletedAt
	coordinatorStarted := coordinator.StartedAt
	coordinatorResult := coordinator.Result
	w.mu.RUnlock()
	if coordinatorCompleted != nil && coordinatorStarted != nil {
		report.AddSuccess(coordinator.ID, coordinatorResult, *coordinatorStarted, *coordinatorCompleted)
	}

	// Execute workers with failure policy
	o.mu.RLock()
	policy := o.FailurePolicy
	o.mu.RUnlock()

	var wg sync.WaitGroup
	errChan := make(chan error, len(workers))

	for _, worker := range workers {
		workerStart := time.Now()
		wg.Add(1)
		go func(n *WorkflowNode) {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[Orchestration] Hierarchical node %s panic: %v", n.ID, r)
					failNow := time.Now()
					w.mu.Lock()
					n.Status = TaskStatusFailed
					n.CompletedAt = &failNow
					w.mu.Unlock()
					report.AddFailure(n.ID, FailureTypeSystem, fmt.Sprintf("panic: %v", r), workerStart, float64(time.Since(workerStart).Milliseconds()))
					errChan <- fmt.Errorf("node %s panicked: %v", n.ID, r)
				}
				wg.Done()
			}()
			if err := o.executeNode(ctx, w, n); err != nil {
				if !IsInterruptError(err) {
					failNow := time.Now()
					w.mu.Lock()
					n.Status = TaskStatusFailed
					n.CompletedAt = &failNow
					w.mu.Unlock()
					report.AddFailure(n.ID, classifyError(err), err.Error(), workerStart, float64(time.Since(workerStart).Milliseconds()))
				}
				errChan <- err
			} else {
				// Snapshot node fields under lock to prevent data race
				w.mu.RLock()
				completedAt := n.CompletedAt
				startedAt := n.StartedAt
				result := n.Result
				w.mu.RUnlock()
				if completedAt != nil && startedAt != nil {
					report.AddSuccess(n.ID, result, *startedAt, *completedAt)
				}
			}
		}(worker)
	}

	switch policy {
	case FailurePolicyFailFast:
		// Wait for all workers to complete, then drain errors.
		// Previous select-based approach had a race: if errChan and done became
		// ready simultaneously, Go's select could pick done, silently discarding errors.
		wg.Wait()
		close(errChan)
		var firstErr error
		for err := range errChan {
			if firstErr == nil {
				firstErr = err
			}
		}
		if firstErr != nil {
			if IsInterruptError(firstErr) {
				report.Finalize("paused", float64(time.Since(startTime).Milliseconds()))
				w.mu.Lock()
				w.LastExecutionReport = report
				w.mu.Unlock()
				return nil
			}
			o.setWorkflowStatus(w, "failed")
			if compErr := o.RunCompensation(ctx, w.ID); compErr != nil {
				log.Printf("[Orchestration] Compensation error: %v", compErr)
			}
			report.Finalize("failed", float64(time.Since(startTime).Milliseconds()))
			w.mu.Lock()
			w.LastExecutionReport = report
			w.mu.Unlock()
			return firstErr
		}

	case FailurePolicyFailMajority:
		wg.Wait()
		close(errChan)
		total := len(workers)
		failCount := 0
		var firstErr error
		for err := range errChan {
			failCount++
			if firstErr == nil {
				firstErr = err
			}
		}
		if total > 0 && failCount > total/2 {
			o.setWorkflowStatus(w, "failed")
			// Run compensation for successful workers when majority fails
			if compErr := o.RunCompensation(ctx, w.ID); compErr != nil {
				log.Printf("[Orchestration] Compensation error (hierarchical fail_majority): %v", compErr)
			}
			report.Finalize("failed", float64(time.Since(startTime).Milliseconds()))
			w.mu.Lock()
			w.LastExecutionReport = report
			w.mu.Unlock()
			return fmt.Errorf("majority of workers failed (%d/%d): %w", failCount, total, firstErr)
		}

	case FailurePolicyContinuePartial:
		wg.Wait()
		close(errChan)
		errs := 0
		for range errChan {
			errs++
		}
		if errs > 0 {
			o.setWorkflowStatus(w, "partial")
		}

	default:
		wg.Wait()
		close(errChan)
		for err := range errChan {
			if err != nil {
				log.Printf("[Orchestration] Hierarchical worker failed: %v", err)
			}
		}
	}

	o.setWorkflowStatus(w, "completed")
	report.Finalize("completed", float64(time.Since(startTime).Milliseconds()))
	w.mu.Lock()
	w.LastExecutionReport = report
	w.mu.Unlock()
	return nil
}

// executeConsensual runs agents and collects votes
func (o *Orchestrator) executeConsensual(ctx context.Context, w *Workflow) error {
	startNodes := w.GetStartNodes()
	if len(startNodes) == 0 {
		o.setWorkflowStatus(w, "failed")
		return fmt.Errorf("no start nodes found")
	}

	// Create execution report for observability
	startTime := time.Now()
	w.mu.RLock()
	report := NewWorkflowExecutionReport(w.ID, w.Mode)
	w.mu.RUnlock()
	report.SetTotal(len(startNodes))

	// Execute all nodes and collect results
	results := make(map[string]any)
	var mu sync.Mutex

	var wg sync.WaitGroup
	for _, node := range startNodes {
		nodeStart := time.Now()
		wg.Add(1)
		go func(n *WorkflowNode) {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[Orchestration] Consensual node %s panic: %v", n.ID, r)
					failNow := time.Now()
					w.mu.Lock()
					n.Status = TaskStatusFailed
					n.CompletedAt = &failNow
					w.mu.Unlock()
					report.AddFailure(n.ID, FailureTypeSystem, fmt.Sprintf("panic: %v", r), nodeStart, float64(time.Since(nodeStart).Milliseconds()))
				}
				wg.Done()
			}()
			if err := o.executeNode(ctx, w, n); err != nil {
				if !IsInterruptError(err) {
					failNow := time.Now()
					w.mu.Lock()
					n.Status = TaskStatusFailed
					n.CompletedAt = &failNow
					w.mu.Unlock()
					report.AddFailure(n.ID, classifyError(err), err.Error(), nodeStart, float64(time.Since(nodeStart).Milliseconds()))
				}
				log.Printf("[Orchestration] Consensual node %s failed: %v", n.ID, err)
			} else {
				// Snapshot node fields under lock to prevent data race
				w.mu.RLock()
				result := n.Result
				completedAt := n.CompletedAt
				startedAt := n.StartedAt
				w.mu.RUnlock()
				mu.Lock()
				results[n.ID] = result
				mu.Unlock()
				if completedAt != nil && startedAt != nil {
					report.AddSuccess(n.ID, result, *startedAt, *completedAt)
				}
			}
		}(node)
	}
	wg.Wait()

	// Check if any node triggered an interrupt (e.g., HITL approval)
	w.mu.RLock()
	isPaused := w.Status == "paused"
	w.mu.RUnlock()
	if isPaused {
		report.Finalize("paused", float64(time.Since(startTime).Milliseconds()))
		w.mu.Lock()
		w.LastExecutionReport = report
		w.mu.Unlock()
		return nil
	}

	// Implement voting mechanism
	// Collect votes from all completed nodes (read under workflow lock)
	w.mu.RLock()
	votes := make(map[string]int) // result content -> count
	for _, node := range w.Nodes {
		if node.Status == TaskStatusCompleted && node.Result != nil {
			// Convert result to string for comparison
			resultStr := fmt.Sprintf("%v", node.Result)
			votes[resultStr]++
		}
	}
	w.mu.RUnlock()

	// Find the consensus result (most votes)
	var consensusResult any
	maxVotes := 0
	for result, count := range votes {
		if count > maxVotes {
			maxVotes = count
			consensusResult = result
		}
	}

	// Require majority agreement
	agreementThreshold := len(startNodes) / 2
	if maxVotes > agreementThreshold {
		o.setWorkflowStatus(w, "completed")
		// Store consensus result in first node
		if len(startNodes) > 0 {
			w.mu.Lock()
			startNodes[0].Result = consensusResult
			w.mu.Unlock()
		}
		report.Finalize("completed", float64(time.Since(startTime).Milliseconds()))
	} else {
		// No consensus reached
		o.setWorkflowStatus(w, "failed")
		report.Finalize("failed", float64(time.Since(startTime).Milliseconds()))
		// Run compensation for successfully completed nodes
		if compErr := o.RunCompensation(ctx, w.ID); compErr != nil {
			log.Printf("[Orchestration] Compensation error during consensual execution: %v", compErr)
		}
	}
	w.mu.Lock()
	w.LastExecutionReport = report
	w.mu.Unlock()

	if maxVotes <= agreementThreshold {
		return fmt.Errorf("consensus not reached: max votes %d, threshold %d", maxVotes, agreementThreshold+1)
	}
	return nil
}

// SpeakerSelectionPolicy determines how the next speaker is chosen in GroupChat mode.
// Inspired by AutoGen's GroupChat speaker selection.
type SpeakerSelectionPolicy string

const (
	// SpeakerPolicyRoundRobin cycles through agents in order.
	SpeakerPolicyRoundRobin SpeakerSelectionPolicy = "round_robin"

	// SpeakerPolicyRandom picks a random agent.
	SpeakerPolicyRandom SpeakerSelectionPolicy = "random"

	// SpeakerPolicyAuto lets a custom function select the next speaker
	// based on message content and context.
	SpeakerPolicyAuto SpeakerSelectionPolicy = "auto"

	// SpeakerPolicyManual requires external selection via Signal.
	SpeakerPolicyManual SpeakerSelectionPolicy = "manual"
)

// SpeakerSelector picks the next agent to speak in a GroupChat.
type SpeakerSelector interface {
	// Select chooses the next speaker given the conversation history.
	// Returns the index of the selected node in the nodes slice, or -1 to end.
	Select(turns int, messages []GroupChatMessage, nodes []*WorkflowNode) int
}

// GroupChatMessage represents a single message in the group chat.
type GroupChatMessage struct {
	From    string `json:"from"`    // AgentID of the speaker
	Content string `json:"content"` // Message content
	Turn    int    `json:"turn"`    // Turn number
}

// RoundRobinSelector cycles through agents in order.
type RoundRobinSelector struct {
	current int
}

func (s *RoundRobinSelector) Select(_ int, _ []GroupChatMessage, nodes []*WorkflowNode) int {
	if len(nodes) == 0 {
		return -1
	}
	idx := s.current % len(nodes)
	s.current++
	return idx
}

// RandomSelector picks a random agent each turn.
type RandomSelector struct {
	// Seed for deterministic testing. 0 = random.
	Seed int64
}

func (s *RandomSelector) Select(_ int, _ []GroupChatMessage, nodes []*WorkflowNode) int {
	if len(nodes) == 0 {
		return -1
	}
	// Simple deterministic selection based on turn for testability
	return int(time.Now().UnixNano()) % len(nodes)
}

// FuncSelector allows custom speaker selection logic.
type FuncSelector struct {
	Fn func(turns int, messages []GroupChatMessage, nodes []*WorkflowNode) int
}

func (s *FuncSelector) Select(turns int, messages []GroupChatMessage, nodes []*WorkflowNode) int {
	if s.Fn == nil {
		return -1
	}
	return s.Fn(turns, messages, nodes)
}

// executeGroupChat runs a multi-agent conversation (AutoGen GroupChat pattern).
// Agents take turns speaking, with a SpeakerSelector determining who goes next.
func (o *Orchestrator) executeGroupChat(ctx context.Context, w *Workflow) error {
	// Get speaker selection policy from workflow config
	selector := o.resolveSpeakerSelector(w)

	// Collect all agent nodes
	w.mu.RLock()
	nodes := make([]*WorkflowNode, 0, len(w.Nodes))
	for _, n := range w.Nodes {
		if n.Type == "agent" || n.Type == "" {
			nodes = append(nodes, n)
		}
	}
	w.mu.RUnlock()

	if len(nodes) == 0 {
		o.setWorkflowStatus(w, "failed")
		return fmt.Errorf("no agent nodes found for group chat")
	}

	// Check for max rounds
	o.mu.RLock()
	maxRounds := o.MaxRounds
	o.mu.RUnlock()

	// Create execution report for observability
	startTime := time.Now()
	w.mu.RLock()
	report := NewWorkflowExecutionReport(w.ID, w.Mode)
	w.mu.RUnlock()
	report.SetTotal(len(nodes))

	var messages []GroupChatMessage

	for turn := 0; ; turn++ {
		// Check max rounds
		if maxRounds > 0 && turn >= maxRounds {
			o.setWorkflowStatus(w, "completed")
			report.Finalize("completed", float64(time.Since(startTime).Milliseconds()))
			w.mu.Lock()
			w.LastExecutionReport = report
			w.mu.Unlock()
			return nil
		}

		// Check context cancellation
		if ctx.Err() != nil {
			o.setWorkflowStatus(w, "failed")
			report.Finalize("failed", float64(time.Since(startTime).Milliseconds()))
			w.mu.Lock()
			w.LastExecutionReport = report
			w.mu.Unlock()
			return ctx.Err()
		}

		// Select next speaker
		idx := selector.Select(turn, messages, nodes)
		if idx < 0 || idx >= len(nodes) {
			o.setWorkflowStatus(w, "completed")
			report.Finalize("completed", float64(time.Since(startTime).Milliseconds()))
			w.mu.Lock()
			w.LastExecutionReport = report
			w.mu.Unlock()
			return nil
		}

		speaker := nodes[idx]

		// Process signals before each turn
		if o.signalBus != nil {
			if err := o.signalBus.ProcessSignals(ctx, w); err != nil {
				log.Printf("[GroupChat] Signal processing error: %v", err)
			}
		}

		// Execute the speaker's node
		nodeStart := time.Now()
		if err := o.executeNode(ctx, w, speaker); err != nil {
			if IsInterruptError(err) {
				report.Finalize("paused", float64(time.Since(startTime).Milliseconds()))
				w.mu.Lock()
				w.LastExecutionReport = report
				w.mu.Unlock()
				return nil
			}
			failNow := time.Now()
			w.mu.Lock()
			speaker.Status = TaskStatusFailed
			speaker.CompletedAt = &failNow
			w.mu.Unlock()
			report.AddFailure(speaker.ID, classifyError(err), err.Error(), nodeStart, float64(time.Since(nodeStart).Milliseconds()))
			o.setWorkflowStatus(w, "failed")
			report.Finalize("failed", float64(time.Since(startTime).Milliseconds()))
			w.mu.Lock()
			w.LastExecutionReport = report
			w.mu.Unlock()
			if compErr := o.RunCompensation(ctx, w.ID); compErr != nil {
				log.Printf("[Orchestration] Compensation error during group chat execution: %v", compErr)
			}
			return fmt.Errorf("group chat error at turn %d (speaker %s): %w", turn, speaker.ID, err)
		}

		// Snapshot node fields under lock for report
		w.mu.RLock()
		gcCompletedAt := speaker.CompletedAt
		gcStartedAt := speaker.StartedAt
		gcResult := speaker.Result
		w.mu.RUnlock()
		if gcCompletedAt != nil && gcStartedAt != nil {
			report.AddSuccess(speaker.ID, gcResult, *gcStartedAt, *gcCompletedAt)
		}

		// Record message
		content := ""
		if gcResult != nil {
			content = fmt.Sprintf("%v", gcResult)
		}

		messages = append(messages, GroupChatMessage{
			From:    speaker.AgentID,
			Content: content,
			Turn:    turn,
		})

		// Store messages in workflow metadata for later retrieval
		w.mu.Lock()
		if w.currentNode == "" {
			w.currentNode = "group_chat"
		}
		w.mu.Unlock()
	}
}

// resolveSpeakerSelector creates a SpeakerSelector from workflow config.
func (o *Orchestrator) resolveSpeakerSelector(w *Workflow) SpeakerSelector {
	w.mu.RLock()
	config := make(map[string]any)
	for _, n := range w.Nodes {
		if len(n.Config) > 0 {
			maps.Copy(config, n.Config)
			break // Use first node's config as workflow-level config
		}
	}
	w.mu.RUnlock()

	policy := SpeakerPolicyRoundRobin // default
	if p, ok := config["speaker_policy"].(string); ok {
		policy = SpeakerSelectionPolicy(p)
	}

	switch policy {
	case SpeakerPolicyRandom:
		return &RandomSelector{}
	case SpeakerPolicyAuto:
		if fn, ok := config["speaker_selector_fn"].(func(int, []GroupChatMessage, []*WorkflowNode) int); ok {
			return &FuncSelector{Fn: fn}
		}
		// Fall back to round robin if no custom function provided
		return &RoundRobinSelector{}
	case SpeakerPolicyManual:
		// Manual mode: external signals drive selection
		// Use PeekSignals + RemoveSignal to avoid consuming signals
		// that ProcessSignals should handle (fixes double-drain bug).
		return &FuncSelector{Fn: func(turns int, messages []GroupChatMessage, nodes []*WorkflowNode) int {
			if o.signalBus != nil {
				signals := o.signalBus.PeekSignals(w.ID)
				for _, sig := range signals {
					if sig.Name == "next_speaker" {
						if agentID, ok := sig.Input.(string); ok {
							for i, n := range nodes {
								if n.AgentID == agentID {
									o.signalBus.RemoveSignal(w.ID, "next_speaker")
									return i
								}
							}
						}
					}
				}
			}
			return -1 // End chat if no signal received
		}}
	default:
		return &RoundRobinSelector{}
	}
}

// executeGraph runs graph-based workflow (LangGraph style)
func (o *Orchestrator) executeGraph(ctx context.Context, w *Workflow) error {
	startNodes := w.GetStartNodes()
	if len(startNodes) == 0 {
		o.setWorkflowStatus(w, "failed")
		return fmt.Errorf("no start nodes found")
	}

	// Create execution report for observability
	startTime := time.Now()
	w.mu.RLock()
	report := NewWorkflowExecutionReport(w.ID, w.Mode)
	report.SetTotal(len(w.Nodes))
	w.mu.RUnlock()

	// BFS traversal of the graph
	visited := make(map[string]bool)
	queue := startNodes

	for len(queue) > 0 {
		// Check for context cancellation before processing each node
		if err := ctx.Err(); err != nil {
			report.Finalize("cancelled", float64(time.Since(startTime).Milliseconds()))
			w.mu.Lock()
			w.LastExecutionReport = report
			w.mu.Unlock()
			// Run compensation for any completed nodes before cancellation
			if compErr := o.RunCompensation(ctx, w.ID); compErr != nil {
				log.Printf("[Orchestration] Compensation error during graph cancellation for %q: %v", w.ID, compErr)
			}
			o.setWorkflowStatus(w, "failed")
			return fmt.Errorf("workflow %q cancelled during graph execution: %w", w.ID, err)
		}

		// Dequeue
		current := queue[0]
		queue = queue[1:]

		if visited[current.ID] {
			continue
		}
		visited[current.ID] = true

		// Skip already-completed nodes (e.g., after resume from interrupt)
		w.mu.RLock()
		isCompleted := current.Status == TaskStatusCompleted
		w.mu.RUnlock()
		if isCompleted {
			w.mu.RLock()
			completedAt := current.CompletedAt
			startedAt := current.StartedAt
			result := current.Result
			w.mu.RUnlock()
			if completedAt != nil && startedAt != nil {
				report.AddSuccess(current.ID, result, *startedAt, *completedAt)
			}
			queue = append(queue, w.GetNextNodes(current.ID)...)
			continue
		}

		// Process any buffered signals before executing node (Temporal-inspired)
		if o.signalBus != nil {
			if err := o.signalBus.ProcessSignals(ctx, w); err != nil {
				log.Printf("[Orchestration] Signal processing error: %v", err)
			}
		}

		// Execute node
		nodeStart := time.Now()
		if err := o.executeNode(ctx, w, current); err != nil {
			if IsInterruptError(err) {
				report.Finalize("paused", float64(time.Since(startTime).Milliseconds()))
				w.mu.Lock()
				w.LastExecutionReport = report
				w.mu.Unlock()
				return nil
			}
			failNow := time.Now()
			w.mu.Lock()
			current.Status = TaskStatusFailed
			current.CompletedAt = &failNow
			w.mu.Unlock()
			report.AddFailure(current.ID, classifyError(err), err.Error(), nodeStart, float64(time.Since(nodeStart).Milliseconds()))
			o.setWorkflowStatus(w, "failed")
			// CRITICAL FIX: Run saga compensation on failure (Temporal pattern)
			if compErr := o.RunCompensation(ctx, w.ID); compErr != nil {
				log.Printf("[Orchestration] Compensation error: %v", compErr)
			}
			report.Finalize("failed", float64(time.Since(startTime).Milliseconds()))
			w.mu.Lock()
			w.LastExecutionReport = report
			w.mu.Unlock()
			return err
		}

		// Snapshot node fields under lock for report
		w.mu.RLock()
		graphCompletedAt := current.CompletedAt
		graphStartedAt := current.StartedAt
		graphResult := current.Result
		w.mu.RUnlock()
		if graphCompletedAt != nil && graphStartedAt != nil {
			report.AddSuccess(current.ID, graphResult, *graphStartedAt, *graphCompletedAt)
		}

		// Enqueue next nodes
		nextNodes := w.GetNextNodes(current.ID)
		queue = append(queue, nextNodes...)
	}

	o.setWorkflowStatus(w, "completed")
	report.Finalize("completed", float64(time.Since(startTime).Milliseconds()))
	w.mu.Lock()
	w.LastExecutionReport = report
	w.mu.Unlock()
	return nil
}

// executeNode executes a single node
func (o *Orchestrator) executeNode(ctx context.Context, w *Workflow, node *WorkflowNode) error {
	// Check max rounds (AutoGen pattern)
	o.mu.RLock()
	maxRounds := o.MaxRounds
	o.mu.RUnlock()
	if maxRounds > 0 {
		w.mu.Lock()
		w.roundCount++
		currentRound := w.roundCount
		w.mu.Unlock()
		if currentRound > maxRounds {
			return fmt.Errorf("max rounds (%d) exceeded at node %q", maxRounds, node.ID)
		}
	}

	now := time.Now()

	// === RESULT CACHE CHECK (Prefect pattern) ===
	// If node has CacheKey configured, check cache before executing.
	// CacheKey can be a static string or "auto" for input-based hashing.
	w.mu.RLock()
	cacheKey := node.Config["cacheKey"]
	w.mu.RUnlock()
	if cacheKey != nil {
		cacheTTL := GetNodeCacheTTL(node)
		if cacheTTL >= 0 { // -1 means caching disabled
			var key string
			if s, ok := cacheKey.(string); ok && s == "auto" {
				w.mu.RLock()
				key = ComputeCacheKey(node.ID, node.Config)
				w.mu.RUnlock()
			} else {
				key = ComputeCacheKey(node.ID, cacheKey)
			}
			if cached, hit := o.resultCache.Get(key); hit {
				// Cache hit — skip execution, use cached result
				w.mu.Lock()
				node.StartedAt = &now
				completeTime := time.Now()
				node.CompletedAt = &completeTime
				node.Status = TaskStatusCompleted
				node.Result = cached
				w.execHistory = append(w.execHistory, ExecutionStep{
					NodeID:    node.ID,
					Status:    "cached",
					Timestamp: completeTime,
					Duration:  float64(completeTime.Sub(now).Milliseconds()),
				})
				w.sagaLog = append(w.sagaLog, SagaRecord{
					NodeID:    node.ID,
					Status:    "completed",
					Result:    cached,
					Completed: completeTime,
				})
				// HIGH: Capture workflow ID before unlock for broadcast after unlock
				wfID := w.ID
				w.mu.Unlock()
				log.Printf("[Orchestration] Cache hit for node %q (key: %s)", node.ID, key[:8])
				// Stream cache hit event (LangGraph streaming pattern)
				if b := o.GetBroadcaster(); b != nil {
					b.Broadcast("workflow_node_cached", map[string]any{
						"workflowId": wfID,
						"nodeId":     node.ID,
						"nodeName":   node.Name,
						"durationMs": float64(time.Since(now).Milliseconds()),
					})
				}
				return nil
			}
		}
	}

	// Update node status under workflow lock
	w.mu.Lock()
	node.StartedAt = &now
	node.Status = TaskStatusRunning
	w.execHistory = append(w.execHistory, ExecutionStep{
		NodeID:    node.ID,
		Status:    "started",
		Timestamp: now,
	})
	w.mu.Unlock()

	// Stream node start event (LangGraph streaming pattern)
	if b := o.GetBroadcaster(); b != nil {
		wfID := w.Snapshot().ID
		b.Broadcast("workflow_node_start", map[string]any{
			"workflowId": wfID,
			"nodeId":     node.ID,
			"nodeName":   node.Name,
			"nodeType":   node.Type,
			"agentId":    node.AgentID,
		})
	}

	// === INTERRUPT CHECK: Before node execution (LangGraph pattern) ===
	// Read interrupt flags under lock (ResumeWorkflow writes these under w.mu.Lock)
	w.mu.RLock()
	interruptBefore := node.Interrupt || node.InterruptBefore
	w.mu.RUnlock()
	if interruptBefore {
		w.mu.Lock()
		w.Status = "paused"
		w.InterruptedNodeID = node.ID
		w.InterruptPhase = "before"
		wfID := w.ID
		w.mu.Unlock()
		log.Printf("[Orchestration] Interrupt before node %q, workflow paused", node.ID)
		if b := o.GetBroadcaster(); b != nil {
			b.Broadcast("workflow_status_change", map[string]any{
				"workflowId":        wfID,
				"status":            "paused",
				"interruptedNodeId": node.ID,
				"interruptPhase":    "before",
			})
		}
		return NewInterruptError(node.ID, "before")
	}

	// === VARIABLE RESOLUTION (Dify/Prefect pattern) ===
	// Resolve {{variable.key}} templates in node Config before execution.
	if o.variableStore != nil {
		w.mu.RLock()
		workflowID := w.ID
		w.mu.RUnlock()

		if node.Config != nil {
			resolvedConfig, err := o.variableStore.ResolveVariablesInMap(workflowID, node.Config)
			if err != nil {
				log.Printf("[Orchestration] Warning: variable resolution failed for node %q Config: %v", node.ID, err)
			} else {
				w.mu.Lock()
				node.Config = resolvedConfig
				w.mu.Unlock()
			}
		}
	}

	// Handle subgraph type: recursively execute nested workflow (LangGraph pattern)
	if node.Type == "subgraph" && node.SubgraphID != "" {
		subWorkflow := o.GetWorkflow(node.SubgraphID)
		if subWorkflow == nil {
			return fmt.Errorf("subgraph workflow %q not found", node.SubgraphID)
		}
		// Execute nested workflow
		if err := o.Execute(ctx, node.SubgraphID); err != nil {
			// Propagate error from subgraph
			return fmt.Errorf("subgraph %q failed: %w", node.SubgraphID, err)
		}
		// Capture subgraph status before acquiring parent workflow lock
		subStatus := subWorkflow.Snapshot().Status
		// Store subgraph result
		w.mu.Lock()
		node.Result = map[string]any{
			"subgraphID": node.SubgraphID,
			"status":     subStatus,
		}
		w.mu.Unlock()
		// Fall through to completion marking
	} else if node.Type == "http_request" {
		// HTTP Request node (Dify/n8n pattern) - execute HTTP call directly
		httpResult, err := ExecuteHTTPRequestNode(ctx, node.Config)
		if err != nil {
			return fmt.Errorf("http_request node %q failed: %w", node.ID, err)
		}
		w.mu.Lock()
		node.Result = marshalHTTPResult(httpResult)
		w.mu.Unlock()
	} else if node.Type == "iterator" {
		// Iterator node (Dify pattern) - process array items
		iterResult, err := ExecuteIteratorNode(ctx, node.Config)
		if err != nil {
			return fmt.Errorf("iterator node %q failed: %w", node.ID, err)
		}
		w.mu.Lock()
		node.Result = map[string]any{
			"outputs":    iterResult.Outputs,
			"errors":     iterResult.Errors,
			"totalItems": iterResult.TotalItems,
			"failed":     iterResult.Failed,
			"succeeded":  iterResult.Succeeded,
			"skipped":    iterResult.Skipped,
		}
		w.mu.Unlock()
	} else if node.Type == "condition" {
		// Condition node (Dify IF node pattern) - evaluate expression and set result
		condResult, err := ExecuteConditionNode(node.Config)
		if err != nil {
			return fmt.Errorf("condition node %q failed: %w", node.ID, err)
		}
		w.mu.Lock()
		// Set result so downstream nodes can reference it
		// Also set ChosenAction to "true"/"false" for edge routing
		if condResult.Result {
			node.ChosenAction = "true"
		} else {
			node.ChosenAction = "false"
		}
		node.Result = map[string]any{
			"result":   condResult.Result,
			"left":     condResult.Left,
			"right":    condResult.Right,
			"operator": condResult.Operator,
		}
		w.mu.Unlock()
	} else if node.Type == "template" || node.Type == "transform" {
		// Template/Transform node (Dify Template Transform / n8n Set node pattern)
		tmplResult, err := ExecuteTemplateNode(node.Config)
		if err != nil {
			return fmt.Errorf("template node %q failed: %w", node.ID, err)
		}
		w.mu.Lock()
		node.Result = tmplResult.Output
		w.mu.Unlock()
	} else if node.Type == "merge" {
		// Merge node (n8n Merge Node pattern) - combine upstream results
		// Collect results from all predecessor nodes
		prevNodes := w.GetPreviousNodes(node.ID)
		var upstreamInputs []any
		for _, prev := range prevNodes {
			if prev.Result != nil {
				upstreamInputs = append(upstreamInputs, prev.Result)
			}
		}
		// Build config with collected inputs (override any existing inputs)
		mergeConfig := make(map[string]any)
		for k, v := range node.Config {
			mergeConfig[k] = v
		}
		// Only use collected inputs if config doesn't already have them
		if _, hasInputs := mergeConfig["inputs"]; !hasInputs {
			mergeConfig["inputs"] = upstreamInputs
		}

		mergeResult, err := ExecuteMergeNode(mergeConfig)
		if err != nil {
			return fmt.Errorf("merge node %q failed: %w", node.ID, err)
		}
		w.mu.Lock()
		node.Result = map[string]any{
			"mode":    string(mergeResult.Mode),
			"results": mergeResult.Results,
			"merged":  mergeResult.Merged,
			"count":   mergeResult.Count,
		}
		w.mu.Unlock()
	} else if node.Type == "switch" {
		// Switch node (n8n Switch Node pattern) - multi-branch routing
		switchConfig := make(map[string]any)
		for k, v := range node.Config {
			switchConfig[k] = v
		}
		// Use upstream result as field value if available
		prevNodes := w.GetPreviousNodes(node.ID)
		if len(prevNodes) > 0 && prevNodes[0].Result != nil {
			if _, hasField := switchConfig["field"]; !hasField {
				switchConfig["field"] = prevNodes[0].Result
			}
		}
		switchResult, err := ExecuteSwitchNode(switchConfig)
		if err != nil {
			return fmt.Errorf("switch node %q failed: %w", node.ID, err)
		}
		w.mu.Lock()
		node.Result = map[string]any{
			"branch":    switchResult.Branch,
			"matched":   switchResult.Matched,
			"rules":     switchResult.Rules,
			"evaluated": switchResult.Evaluated,
		}
		if switchResult.Branch != "" {
			node.ChosenAction = switchResult.Branch
		}
		w.mu.Unlock()
	} else if node.Type == "wait" || node.Type == "delay" {
		// Wait/Delay node (n8n Wait Node pattern) - time-based delay
		waitResult, err := ExecuteWaitNode(ctx, node.Config)
		if err != nil {
			return fmt.Errorf("wait node %q failed: %w", node.ID, err)
		}
		w.mu.Lock()
		node.Result = map[string]any{
			"waitedMs":  waitResult.WaitedMs,
			"waited":    waitResult.Waited,
			"deadline":  waitResult.Deadline,
			"cancelled": waitResult.Cancelled,
		}
		w.mu.Unlock()
	} else if node.Type == "aggregator" {
		// Aggregator node (Dify Variable Aggregator pattern) - collect upstream results
		prevNodes := w.GetPreviousNodes(node.ID)
		var upstreamInputs []any
		for _, prev := range prevNodes {
			if prev.Result != nil {
				upstreamInputs = append(upstreamInputs, prev.Result)
			}
		}
		aggConfig := make(map[string]any)
		for k, v := range node.Config {
			aggConfig[k] = v
		}
		if _, hasInputs := aggConfig["inputs"]; !hasInputs {
			aggConfig["inputs"] = upstreamInputs
		}
		aggResult, err := ExecuteAggregatorNode(ctx, aggConfig)
		if err != nil {
			return fmt.Errorf("aggregator node %q failed: %w", node.ID, err)
		}
		w.mu.Lock()
		node.Result = map[string]any{
			"strategy": string(aggResult.Strategy),
			"count":    aggResult.Count,
			"result":   aggResult.Result,
			"items":    aggResult.Items,
		}
		w.mu.Unlock()
	} else if node.Type == "code" {
		// Code/expression node (Dify Code Node / n8n Code Node pattern)
		codeConfig := make(map[string]any)
		for k, v := range node.Config {
			codeConfig[k] = v
		}
		// Inject upstream results as variables
		prevNodes := w.GetPreviousNodes(node.ID)
		vars := make(map[string]any)
		for _, prev := range prevNodes {
			if prev.Result != nil {
				vars[prev.ID] = prev.Result
			}
		}
		if _, hasVars := codeConfig["variables"]; !hasVars && len(vars) > 0 {
			codeConfig["variables"] = vars
		}
		codeResult, err := ExecuteCodeNode(codeConfig)
		if err != nil {
			return fmt.Errorf("code node %q failed: %w", node.ID, err)
		}
		w.mu.Lock()
		node.Result = map[string]any{
			"output": codeResult.Output,
			"type":   codeResult.Type,
			"error":  codeResult.Error,
		}
		w.mu.Unlock()
	} else {
		// Default: agent type - create task for scheduler
		task := &Task{
			ID:          fmt.Sprintf("task-%s-%s", node.ID, uuid.New().String()[:8]),
			Title:       node.Name,
			Description: fmt.Sprintf("Execute workflow node: %s", node.Name),
			Priority:    PriorityMedium,
			State:       TaskStatePending,
			AssignedTo:  []acp.AgentID{acp.AgentID(node.AgentID)},
			CreatedAt:   time.Now(),
		}

		// Submit to scheduler
		if o.scheduler != nil {
			if err := o.scheduler.SubmitTask(task); err != nil {
				return fmt.Errorf("failed to submit task for node %q: %w", node.ID, err)
			}
		}
	}

	// Mark complete under workflow lock
	completeTime := time.Now()

	// === INTERRUPT CHECK: After node execution (LangGraph pattern) ===
	// Read interrupt flag under lock (ResumeWorkflow writes this under w.mu.Lock)
	w.mu.RLock()
	interruptAfter := node.InterruptAfter
	w.mu.RUnlock()
	if interruptAfter {
		w.mu.Lock()
		w.Status = "paused"
		w.InterruptedNodeID = node.ID
		w.InterruptPhase = "after"
		// Still record completion for this node
		node.CompletedAt = &completeTime
		node.Status = TaskStatusCompleted
		w.execHistory = append(w.execHistory, ExecutionStep{
			NodeID:    node.ID,
			Status:    "completed",
			Timestamp: completeTime,
			Duration:  float64(completeTime.Sub(now).Milliseconds()),
		})
		// Record in saga log so compensation runs for this node if workflow fails after resume
		w.sagaLog = append(w.sagaLog, SagaRecord{
			NodeID:    node.ID,
			Status:    "completed",
			Result:    node.Result,
			Completed: completeTime,
		})
		wfID := w.ID
		w.mu.Unlock()
		log.Printf("[Orchestration] Interrupt after node %q, workflow paused", node.ID)
		if b := o.GetBroadcaster(); b != nil {
			b.Broadcast("workflow_status_change", map[string]any{
				"workflowId":        wfID,
				"status":            "paused",
				"interruptedNodeId": node.ID,
				"interruptPhase":    "after",
			})
		}
		return NewInterruptError(node.ID, "after")
	}

	w.mu.Lock()
	node.CompletedAt = &completeTime
	node.Status = TaskStatusCompleted
	w.execHistory = append(w.execHistory, ExecutionStep{
		NodeID:    node.ID,
		Status:    "completed",
		Timestamp: completeTime,
		Duration:  float64(completeTime.Sub(now).Milliseconds()),
	})
	// Record in saga log for potential compensation
	w.sagaLog = append(w.sagaLog, SagaRecord{
		NodeID:    node.ID,
		Status:    "completed",
		Result:    node.Result,
		Completed: completeTime,
	})
	// Prevent unbounded growth
	const maxExecHistory = 500
	if len(w.execHistory) > maxExecHistory {
		w.execHistory = w.execHistory[len(w.execHistory)-maxExecHistory:]
	}
	// Capture result for cache write (read under lock, write outside)
	nodeResult := node.Result
	nodeCacheKey := node.Config["cacheKey"]
	nodeCacheTTL := DefaultCacheTTL
	if nodeCacheKey != nil {
		nodeCacheTTL = GetNodeCacheTTL(node)
	}
	nodeConfig := node.Config
	w.mu.Unlock()

	// Store result in cache (Prefect pattern)
	if nodeCacheKey != nil && nodeCacheTTL >= 0 && nodeResult != nil {
		var key string
		if s, ok := nodeCacheKey.(string); ok && s == "auto" {
			key = ComputeCacheKey(node.ID, nodeConfig)
		} else {
			key = ComputeCacheKey(node.ID, nodeCacheKey)
		}
		o.resultCache.Set(key, nodeResult, nodeCacheTTL, node.ID)
	}

	// Auto-checkpoint after successful node execution (LangGraph pattern)
	if o.AutoCheckpoint {
		o.createCheckpoint(w)
	}

	// Stream node complete event (LangGraph streaming pattern)
	if b := o.GetBroadcaster(); b != nil {
		wfID := w.Snapshot().ID
		durationMs := float64(time.Since(now).Milliseconds())
		b.Broadcast("workflow_node_complete", map[string]any{
			"workflowId": wfID,
			"nodeId":     node.ID,
			"nodeName":   node.Name,
			"nodeType":   node.Type,
			"durationMs": durationMs,
			"cached":     nodeCacheKey != nil,
		})
	}

	return nil
}

// RunCompensation executes compensation actions in reverse order
// for all completed steps in the workflow (Temporal Saga pattern).
// Called when workflow execution fails to undo partial progress.
// Idempotency: concurrent calls are safe - only one compensation runs at a time.
func (o *Orchestrator) RunCompensation(ctx context.Context, workflowID string) error {
	w := o.GetWorkflow(workflowID)
	if w == nil {
		return fmt.Errorf("workflow %q not found", workflowID)
	}

	// HIGH fix from Round 376: Idempotency guard using atomic flag
	// Compare-And-Swap ensures only one goroutine enters compensation at a time
	if !w.compensating.CompareAndSwap(false, true) {
		return fmt.Errorf("compensation already in progress for workflow %q", workflowID)
	}
	defer w.compensating.Store(false)

	w.mu.RLock()
	sagaLog := make([]SagaRecord, len(w.sagaLog))
	copy(sagaLog, w.sagaLog)
	w.mu.RUnlock()

	if len(sagaLog) == 0 {
		return nil // Nothing to compensate
	}

	log.Printf("[Orchestration] Running saga compensation for workflow %q (%d steps to undo)", workflowID, len(sagaLog))

	// Execute in reverse order (last completed → first completed)
	compensationErrors := 0
	compensatedCount := 0
	for i := len(sagaLog) - 1; i >= 0; i-- {
		record := &sagaLog[i]
		if record.Status != "completed" {
			continue
		}

		// Check if the node implements Compensatable interface
		compensatable, ok := record.Result.(Compensatable)
		if !ok {
			log.Printf("[Orchestration] Compensation: step %q has no compensator, skipping", record.NodeID)
			continue
		}

		compensatedCount++
		if err := compensatable.Compensate(ctx, record.Result); err != nil {
			log.Printf("[Orchestration] Compensation failed for step %q: %v", record.NodeID, err)
			record.Status = "compensation_failed"
			compensationErrors++
		} else {
			log.Printf("[Orchestration] Compensation succeeded for step %q", record.NodeID)
			record.Status = "compensated"
		}
	}

	// Incremental update: sync status changes back to w.sagaLog without replacing entire slice.
	// This prevents losing records that may have been appended by other goroutines
	// during compensation processing.
	statusUpdates := make(map[string]string) // nodeID -> newStatus
	for i := range sagaLog {
		if sagaLog[i].Status == "compensated" || sagaLog[i].Status == "compensation_failed" {
			statusUpdates[sagaLog[i].NodeID] = sagaLog[i].Status
		}
	}
	w.mu.Lock()
	for i := range w.sagaLog {
		if newStatus, ok := statusUpdates[w.sagaLog[i].NodeID]; ok {
			w.sagaLog[i].Status = newStatus
		}
	}
	w.mu.Unlock()

	if compensationErrors > 0 {
		return fmt.Errorf("saga compensation completed with %d error(s) out of %d attempted", compensationErrors, compensatedCount)
	}
	return nil
}

// createCheckpoint saves current workflow state
// Lock ordering: always acquire w.mu before o.mu to prevent deadlock
func (o *Orchestrator) createCheckpoint(w *Workflow) *Checkpoint {
	// Snapshot workflow state under w.mu, release before acquiring o.mu
	w.mu.RLock()
	nodeStates := make(map[string]*WorkflowNode)
	for _, n := range w.Nodes {
		nodeCopy := *n
		nodeStates[n.ID] = &nodeCopy
	}
	currentNode := w.currentNode
	execHistory := make([]ExecutionStep, len(w.execHistory))
	copy(execHistory, w.execHistory)
	sagaLog := make([]SagaRecord, len(w.sagaLog))
	copy(sagaLog, w.sagaLog)
	roundCount := w.roundCount
	w.mu.RUnlock()

	cp := &Checkpoint{
		ID:          fmt.Sprintf("cp-%s", uuid.New().String()[:8]),
		WorkflowID:  w.ID,
		CreatedAt:   time.Now(),
		NodeStates:  nodeStates,
		CurrentNode: currentNode,
		ExecHistory: execHistory,
		Metadata:    make(map[string]any),
		SagaLog:     sagaLog,
		RoundCount:  roundCount,
	}

	// Store checkpoint (no w.mu held)
	o.mu.Lock()
	o.checkpoints[w.ID] = append(o.checkpoints[w.ID], cp)
	// Trim old checkpoints to prevent unbounded growth
	if len(o.checkpoints[w.ID]) > maxCheckpointsPerWorkflow {
		// Remove oldest checkpoints (keep most recent)
		o.checkpoints[w.ID] = o.checkpoints[w.ID][len(o.checkpoints[w.ID])-maxCheckpointsPerWorkflow:]
	}
	o.mu.Unlock()

	return cp
}

// RestoreFromCheckpoint restores workflow state from a checkpoint
func (o *Orchestrator) RestoreFromCheckpoint(checkpointID string) (*Workflow, error) {
	// Find checkpoint under o.mu, take snapshot, release before acquiring workflow lock
	o.mu.RLock()
	var foundCP *Checkpoint
	var workflow *Workflow
	for wfID, checkpoints := range o.checkpoints {
		for _, cp := range checkpoints {
			if cp.ID == checkpointID {
				foundCP = cp
				workflow = o.workflows[wfID]
				break
			}
		}
		if foundCP != nil {
			break
		}
	}
	o.mu.RUnlock()

	if foundCP == nil {
		return nil, fmt.Errorf("checkpoint not found: %s", checkpointID)
	}
	if workflow == nil {
		return nil, fmt.Errorf("workflow not found")
	}

	// Restore node states under workflow.mu only (no o.mu held)
	workflow.mu.Lock()
	for _, n := range workflow.Nodes {
		if saved, ok := foundCP.NodeStates[n.ID]; ok {
			n.Status = saved.Status
			n.Result = saved.Result
			n.StartedAt = saved.StartedAt
			n.CompletedAt = saved.CompletedAt
		}
	}
	workflow.currentNode = foundCP.CurrentNode
	workflow.execHistory = foundCP.ExecHistory
	// Restore saga log and round count to prevent duplicate compensation
	if foundCP.SagaLog != nil {
		workflow.sagaLog = make([]SagaRecord, len(foundCP.SagaLog))
		copy(workflow.sagaLog, foundCP.SagaLog)
	} else {
		workflow.sagaLog = nil
	}
	workflow.roundCount = foundCP.RoundCount
	// Clear interrupt state from failed execution
	workflow.InterruptedNodeID = ""
	workflow.InterruptPhase = ""
	workflow.mu.Unlock()

	o.setWorkflowStatus(workflow, "running")

	return workflow, nil
}

// GetCheckpoints returns a copy of all checkpoints for a workflow
func (o *Orchestrator) GetCheckpoints(workflowID string) []*Checkpoint {
	o.mu.RLock()
	defer o.mu.RUnlock()
	cps := o.checkpoints[workflowID]
	if cps == nil {
		return nil
	}
	result := make([]*Checkpoint, len(cps))
	copy(result, cps)
	return result
}

// ForkFromCheckpoint creates a new workflow that branches from a checkpoint.
// Inspired by LangGraph's Time Travel: the original workflow is unchanged,
// while the fork starts from the checkpoint's state and can diverge.
//
// Use cases:
//   - A/B testing: fork a workflow, try different inputs on each branch
//   - Exploratory debugging: fork from a checkpoint and test changes
//   - What-if analysis: compare outcomes of different decisions
//
// Returns the new forked workflow. The fork's name is suffixed with "-fork-N".
func (o *Orchestrator) ForkFromCheckpoint(checkpointID string, forkName string) (*Workflow, error) {
	// Find checkpoint (snapshot under o.mu, release before creating workflow)
	o.mu.RLock()
	var foundCP *Checkpoint
	var sourceWorkflow *Workflow
	var forkCount int
	for wfID, checkpoints := range o.checkpoints {
		for _, cp := range checkpoints {
			if cp.ID == checkpointID {
				foundCP = cp
				sourceWorkflow = o.workflows[wfID]
				break
			}
		}
		if foundCP != nil {
			break
		}
	}
	// Count existing forks from this source
	if sourceWorkflow != nil {
		prefix := sourceWorkflow.Name + "-fork"
		for _, w := range o.workflows {
			if strings.HasPrefix(w.Name, prefix) {
				forkCount++
			}
		}
	}
	o.mu.RUnlock()

	if foundCP == nil {
		return nil, fmt.Errorf("checkpoint not found: %s", checkpointID)
	}
	if sourceWorkflow == nil {
		return nil, fmt.Errorf("source workflow not found for checkpoint")
	}

	// Determine fork name
	if forkName == "" {
		forkName = fmt.Sprintf("%s-fork-%d", sourceWorkflow.Name, forkCount+1)
	}

	// Create the fork workflow (deep copy of structure, checkpoint state)
	fork := &Workflow{
		ID:          fmt.Sprintf("wf-%s", uuid.New().String()[:8]),
		Name:        forkName,
		Description: fmt.Sprintf("Fork of %s from checkpoint %s", sourceWorkflow.Name, checkpointID),
		Mode:        sourceWorkflow.Mode,
		Nodes:       make([]*WorkflowNode, 0, len(sourceWorkflow.Nodes)),
		Edges:       make([]*WorkflowEdge, 0, len(sourceWorkflow.Edges)),
		Status:      "running",
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
		Version:     1,
		// Don't inherit version history — fork is a new timeline
		currentNode: foundCP.CurrentNode,
		execHistory: make([]ExecutionStep, len(foundCP.ExecHistory)),
		sagaLog:     nil, // Fork starts fresh for saga
	}
	copy(fork.execHistory, foundCP.ExecHistory)

	// Deep copy edges and nodes under source workflow lock
	sourceWorkflow.mu.RLock()
	for _, e := range sourceWorkflow.Edges {
		edgeCopy := *e
		fork.Edges = append(fork.Edges, &edgeCopy)
	}
	for _, n := range sourceWorkflow.Nodes {
		if saved, ok := foundCP.NodeStates[n.ID]; ok {
			// Use checkpoint's saved state
			nodeCopy := *saved
			fork.Nodes = append(fork.Nodes, &nodeCopy)
		} else {
			// Node not in checkpoint (added after checkpoint was created)
			nodeCopy := *n
			nodeCopy.Status = ""     // Reset to unexecuted
			nodeCopy.Result = nil
			nodeCopy.StartedAt = nil
			nodeCopy.CompletedAt = nil
			fork.Nodes = append(fork.Nodes, &nodeCopy)
		}
	}
	sourceWorkflow.mu.RUnlock()

	// Store fork metadata in checkpoint for traceability
	forkMetadata := map[string]any{
		"forked_from":    sourceWorkflow.ID,
		"forked_from_cp": checkpointID,
		"forked_at":      time.Now().Format(time.RFC3339),
	}

	// Register the fork workflow
	o.mu.Lock()
	o.workflows[fork.ID] = fork
	o.checkpoints[fork.ID] = append(o.checkpoints[fork.ID], &Checkpoint{
		ID:          fmt.Sprintf("cp-%s", uuid.New().String()[:8]),
		WorkflowID:  fork.ID,
		CreatedAt:   time.Now(),
		NodeStates:  foundCP.NodeStates,
		CurrentNode: foundCP.CurrentNode,
		ExecHistory: fork.execHistory,
		Metadata:    forkMetadata,
	})
	o.mu.Unlock()

	return fork, nil
}

// GetStateHistory returns all checkpoints for a workflow, ordered by time.
// Inspired by LangGraph's get_state_history() for Time Travel.
func (o *Orchestrator) GetStateHistory(workflowID string) []*Checkpoint {
	return o.GetCheckpoints(workflowID)
}

// GetWorkflow returns a workflow by ID
func (o *Orchestrator) GetWorkflow(id string) *Workflow {
	o.mu.RLock()
	defer o.mu.RUnlock()
	return o.workflows[id]
}

// ListWorkflows returns all workflows
func (o *Orchestrator) ListWorkflows() []*Workflow {
	o.mu.RLock()
	defer o.mu.RUnlock()

	workflows := make([]*Workflow, 0, len(o.workflows))
	for _, w := range o.workflows {
		workflows = append(workflows, w)
	}
	return workflows
}

// GetExecutionReport returns the last execution report for a workflow
func (o *Orchestrator) GetExecutionReport(workflowID string) *WorkflowExecutionReport {
	o.mu.RLock()
	w := o.workflows[workflowID]
	o.mu.RUnlock()

	if w == nil {
		return nil
	}

	w.mu.RLock()
	report := w.LastExecutionReport
	w.mu.RUnlock()

	if report == nil {
		return nil
	}

	// Return a snapshot to avoid exposing mutable state
	snapshot := report.Snapshot()
	return &snapshot
}

// ResumeWorkflow resumes a paused workflow from its interrupt point.
// The input parameter allows external modification of the node's input/result.
//
// For interrupt_before: input replaces the node's ResumeInput.
// For interrupt_after: input replaces the node's result for subsequent nodes.
//
// Inspired by LangGraph's resume functionality for human-in-the-loop workflows.
func (o *Orchestrator) ResumeWorkflow(ctx context.Context, workflowID string, input any) (*Workflow, error) {
	o.mu.RLock()
	w, exists := o.workflows[workflowID]
	o.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("workflow %q not found", workflowID)
	}

	// Hold write lock continuously from status check through state modification
	// to prevent TOCTOU race where two concurrent ResumeWorkflow calls both
	// see "paused" and both try to resume (CRITICAL-3 & CRITICAL-4 fix)
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.Status != "paused" {
		return nil, fmt.Errorf("workflow %q is not paused (status: %q)", workflowID, w.Status)
	}

	interruptedNodeID := w.InterruptedNodeID
	interruptPhase := w.InterruptPhase

	if interruptedNodeID == "" {
		return nil, fmt.Errorf("workflow %q has no interrupt point to resume", workflowID)
	}

	// Find the interrupted node
	var interruptedNode *WorkflowNode
	for _, n := range w.Nodes {
		if n.ID == interruptedNodeID {
			interruptedNode = n
			break
		}
	}

	if interruptedNode == nil {
		return nil, fmt.Errorf("interrupted node %q not found", interruptedNodeID)
	}

	// Update the node based on phase
	switch interruptPhase {
	case "before":
		// Before phase: input becomes the node's execution input
		interruptedNode.ResumeInput = input
		// Clear interrupt flags so re-execution doesn't immediately re-trigger
		interruptedNode.Interrupt = false
		interruptedNode.InterruptBefore = false
	case "after":
		// After phase: input replaces the node's result
		interruptedNode.Result = input
		interruptedNode.Interrupt = false
		interruptedNode.InterruptAfter = false
	}

	// Handle action-based routing (Dify HITL pattern)
	// If InterruptActions are defined and input is a string matching an action ID,
	// store it as ChosenAction for downstream edge routing.
	if len(interruptedNode.InterruptActions) > 0 {
		if actionID, ok := input.(string); ok {
			valid := false
			for _, a := range interruptedNode.InterruptActions {
				if a.ID == actionID {
					valid = true
					break
				}
			}
			if valid {
				interruptedNode.ChosenAction = actionID
				log.Printf("[Orchestration] Action selected: %q for node %q", actionID, interruptedNodeID)
			} else {
				log.Printf("[Orchestration] Warning: action %q not found in InterruptActions for node %q, ignoring", actionID, interruptedNodeID)
			}
		}
	}

	// Clear interrupt state and set running atomically
	w.InterruptedNodeID = ""
	w.InterruptPhase = ""
	w.Status = "running"

	log.Printf("[Orchestration] Resuming workflow %q from interrupt at node %q (phase: %s)", workflowID, interruptedNodeID, interruptPhase)

	// Resume execution in a goroutine (non-blocking).
	// Derive a new context from the parent to propagate cancellation/deadline.
	o.wg.Add(1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[Orchestration] Resume workflow panic for %q: %v", workflowID, r)
			}
			o.wg.Done()
		}()
		resumeCtx, cancel := context.WithCancel(ctx)
		defer cancel()
		if err := o.executeWorkflow(resumeCtx, w); err != nil {
			log.Printf("[Orchestration] Resume workflow %q failed: %v", workflowID, err)
		}
	}()

	return w, nil
}

// DeleteWorkflow removes a workflow
func (o *Orchestrator) DeleteWorkflow(id string) {
	o.mu.Lock()
	defer o.mu.Unlock()

	// Get workflow name for audit log before deletion
	var wfName string
	if wf, ok := o.workflows[id]; ok {
		wfName = wf.Name
	}

	delete(o.workflows, id)
	delete(o.checkpoints, id)

	// Clean up pending signals to prevent memory leak
	if o.signalBus != nil {
		o.signalBus.ClearWorkflowSignals(id)
	}

	// Clean up artifacts for this workflow
	if o.artifactStore != nil {
		o.artifactStore.DeleteByWorkflow(id)
	}

	// Clean up variables for this workflow
	if o.variableStore != nil {
		o.variableStore.DeleteByWorkflow(id)
	}

	// Audit log
	if o.auditLogger != nil {
		o.auditLogger.Log("api", "system", "delete", "workflow", id, map[string]any{
			"name": wfName,
		}, true, "")
	}
}

// ContinueAsNew resets the execution state of a workflow while preserving its identity.
// Inspired by Temporal's Continue-As-New pattern: long-running workflows that complete
// a logical epoch can reset their execution history to prevent unbounded memory growth,
// then continue executing from the start (or from a specified node).
//
// Use cases:
//   - Cron/monitoring workflows that repeat the same logic periodically
//   - Long-running event processing pipelines that process batches
//   - Iterative workflows where history from previous iterations is not needed
//
// Returns the workflow's new run number (incremented from the previous).
func (o *Orchestrator) ContinueAsNew(ctx context.Context, workflowID string, opts ContinueAsNewOptions) (int, error) {
	o.mu.RLock()
	workflow, exists := o.workflows[workflowID]
	o.mu.RUnlock()

	if !exists {
		return 0, fmt.Errorf("workflow not found: %s", workflowID)
	}

	// Trim old checkpoints BEFORE acquiring workflow lock (avoid lock nesting)
	if opts.KeepCheckpoints > 0 {
		o.mu.Lock()
		cps := o.checkpoints[workflowID]
		if len(cps) > opts.KeepCheckpoints {
			o.checkpoints[workflowID] = cps[len(cps)-opts.KeepCheckpoints:]
		}
		o.mu.Unlock()
	} else {
		o.mu.Lock()
		o.checkpoints[workflowID] = nil
		o.mu.Unlock()
	}

	// Now acquire workflow lock (same pattern as RestoreFromCheckpoint)
	workflow.mu.Lock()
	// Note: unlock is handled manually before broadcast (not defer)

	if workflow.Status == "running" {
		workflow.mu.Unlock()
		return 0, fmt.Errorf("cannot continue-as-new on a running workflow")
	}

	runNumber := workflow.roundCount/maxRoundsPerContinueAsNew + 1

	// Reset execution state (use nil instead of [:0] to release underlying array)
	workflow.currentNode = ""
	workflow.execHistory = nil
	workflow.sagaLog = nil
	workflow.roundCount = 0
	workflow.InterruptedNodeID = ""
	workflow.InterruptPhase = ""
	workflow.LastExecutionReport = nil

	// Reset node states based on options
	for _, n := range workflow.Nodes {
		if opts.ResetNodeResults {
			n.Result = nil
			n.StartedAt = nil
			n.CompletedAt = nil
		}
		if opts.ResetNodeStatuses {
			n.Status = ""
		}
		// Always reset interrupt flags and chosen action for clean re-execution
		// (HIGH fix from Round 376 audit)
		n.Interrupt = false
		n.InterruptBefore = false
		n.InterruptAfter = false
		n.ChosenAction = ""
	}

	// Preserve: ID, Name, Mode, Nodes structure, Edges, Version, VersionHistory
	// CRITICAL fix from Round 376: Set status to "draft" not "running"
	// Setting "running" would permanently block Execute() which checks for running state
	workflow.Status = "draft"
	workflow.UpdatedAt = time.Now()
	workflow.mu.Unlock() // Manual unlock (replaces defer for broadcast)

	// Broadcast after releasing lock (setWorkflowStatus re-locks internally)
	o.setWorkflowStatus(workflow, "draft")

	return runNumber, nil
}

// ContinueAsNewOptions configures Continue-As-New behavior.
type ContinueAsNewOptions struct {
	// ResetNodeResults clears node results, startedAt, completedAt.
	// Default: true
	ResetNodeResults bool

	// ResetNodeStatuses clears node statuses back to empty.
	// Default: false (preserves status for conditional routing)
	ResetNodeStatuses bool

	// KeepCheckpoints keeps the N most recent checkpoints after reset.
	// 0 = discard all checkpoints. Default: 1
	KeepCheckpoints int
}

// DefaultContinueAsNewOptions returns sensible defaults.
func DefaultContinueAsNewOptions() ContinueAsNewOptions {
	return ContinueAsNewOptions{
		ResetNodeResults: true,
		ResetNodeStatuses: false,
		KeepCheckpoints:  1,
	}
}

// maxRoundsPerContinueAsNew is the round count divisor for computing run numbers.
const maxRoundsPerContinueAsNew = 1000

// ToJSON exports workflow as JSON
func (w *Workflow) ToJSON() ([]byte, error) {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return json.MarshalIndent(w, "", "  ")
}

// FromJSON imports workflow from JSON
func FromJSON(data []byte) (*Workflow, error) {
	var w Workflow
	if err := json.Unmarshal(data, &w); err != nil {
		return nil, err
	}
	w.execHistory = make([]ExecutionStep, 0)
	return &w, nil
}
