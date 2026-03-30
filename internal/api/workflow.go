// Package api provides HTTP/WebSocket API handlers
package api

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"log"
	"math/big"
	"net/http"
	"strings"

	"github.com/swarm-editor/swarm-editor/internal/swarm"
)

// maxRequestBodySize limits request body size to prevent OOM attacks (1MB)
const maxRequestBodySize int64 = 1 << 20

// apiError logs internal error details and returns a safe error message to client
func apiError(w http.ResponseWriter, internalErr error, publicMsg string, code int) {
	if internalErr != nil {
		log.Printf("[API] Error: %v", internalErr)
	}
	http.Error(w, publicMsg, code)
}

// decodeJSON decodes a JSON request body with size limit protection
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodySize)
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		if errors.Is(err, io.ErrUnexpectedEOF) || errors.Is(err, io.EOF) {
			apiError(w, err, "request body too large", http.StatusRequestEntityTooLarge)
		} else {
			apiError(w, err, "invalid request format", http.StatusBadRequest)
		}
		return false
	}
	return true
}

// WorkflowAPI handles workflow-related API requests
type WorkflowAPI struct {
	orchestrator *swarm.Orchestrator
}

// NewWorkflowAPI creates a new workflow API handler
func NewWorkflowAPI(orchestrator *swarm.Orchestrator) *WorkflowAPI {
	return &WorkflowAPI{
		orchestrator: orchestrator,
	}
}

// CreateWorkflowRequest represents a workflow creation request
type CreateWorkflowRequest struct {
	Name        string                  `json:"name"`
	Description string                  `json:"description"`
	Mode        swarm.OrchestrationMode `json:"mode"`
}

// CreateWorkflowResponse represents a workflow creation response
type CreateWorkflowResponse struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

// HandleCreateWorkflow handles POST /workflows
func (api *WorkflowAPI) HandleCreateWorkflow(w http.ResponseWriter, r *http.Request) {
	var req CreateWorkflowRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}

	if req.Mode == "" {
		req.Mode = swarm.ModeSequential
	}

	workflow := api.orchestrator.CreateWorkflow(req.Name, req.Mode)
	workflow.SetDescription(req.Description)

	resp := CreateWorkflowResponse{
		ID:     workflow.ID,
		Name:   workflow.Name,
		Status: workflow.Status,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(resp); err != nil {
		apiError(w, err, "failed to encode response", http.StatusInternalServerError)
	}
}

// AddNodeRequest represents a node addition request
type AddNodeRequest struct {
	AgentID  string         `json:"agentId"`
	Name     string         `json:"name"`
	Type     string         `json:"type"`
	Position swarm.Position `json:"position"`
}

// HandleAddNode handles POST /workflows/{id}/nodes
func (api *WorkflowAPI) HandleAddNode(w http.ResponseWriter, r *http.Request) {
	workflowID := r.PathValue("id")
	if workflowID == "" {
		http.Error(w, "workflow id is required", http.StatusBadRequest)
		return
	}

	workflow := api.orchestrator.GetWorkflow(workflowID)
	if workflow == nil {
		http.Error(w, "workflow not found", http.StatusNotFound)
		return
	}

	var req AddNodeRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	if strings.TrimSpace(req.Name) == "" {
		http.Error(w, "node name is required", http.StatusBadRequest)
		return
	}

	node := &swarm.WorkflowNode{
		ID:       generateID("node"),
		Name:     req.Name,
		AgentID:  req.AgentID,
		Type:     req.Type,
		Position: req.Position,
		Status:   swarm.TaskStatusPending,
	}

	workflow.AddNode(node)

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(node); err != nil {
		apiError(w, err, "failed to encode response", http.StatusInternalServerError)
	}
}

// AddEdgeRequest represents an edge addition request
type AddEdgeRequest struct {
	From      string `json:"from"`
	To        string `json:"to"`
	Condition string `json:"condition,omitempty"`
	Label     string `json:"label,omitempty"`
}

// HandleAddEdge handles POST /workflows/{id}/edges
func (api *WorkflowAPI) HandleAddEdge(w http.ResponseWriter, r *http.Request) {
	workflowID := r.PathValue("id")
	if workflowID == "" {
		http.Error(w, "workflow id is required", http.StatusBadRequest)
		return
	}

	workflow := api.orchestrator.GetWorkflow(workflowID)
	if workflow == nil {
		http.Error(w, "workflow not found", http.StatusNotFound)
		return
	}

	var req AddEdgeRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	if strings.TrimSpace(req.From) == "" {
		http.Error(w, "edge source (from) is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.To) == "" {
		http.Error(w, "edge target (to) is required", http.StatusBadRequest)
		return
	}

	edge := &swarm.WorkflowEdge{
		ID:        generateID("edge"),
		From:      req.From,
		To:        req.To,
		Condition: req.Condition,
		Label:     req.Label,
	}

	if err := workflow.AddEdge(edge); err != nil {
		apiError(w, err, "failed to add edge", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(edge); err != nil {
		apiError(w, err, "failed to encode response", http.StatusInternalServerError)
	}
}

// HandleGetWorkflow handles GET /workflows/{id}
func (api *WorkflowAPI) HandleGetWorkflow(w http.ResponseWriter, r *http.Request) {
	workflowID := r.PathValue("id")
	if workflowID == "" {
		http.Error(w, "workflow id is required", http.StatusBadRequest)
		return
	}

	workflow := api.orchestrator.GetWorkflow(workflowID)
	if workflow == nil {
		http.Error(w, "workflow not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(workflow); err != nil {
		apiError(w, err, "failed to encode response", http.StatusInternalServerError)
	}
}

// HandleListWorkflows handles GET /workflows
func (api *WorkflowAPI) HandleListWorkflows(w http.ResponseWriter, _ *http.Request) {
	workflows := api.orchestrator.ListWorkflows()

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(workflows); err != nil {
		apiError(w, err, "failed to encode response", http.StatusInternalServerError)
	}
}

// HandleDeleteWorkflow handles DELETE /workflows/{id}
func (api *WorkflowAPI) HandleDeleteWorkflow(w http.ResponseWriter, r *http.Request) {
	workflowID := r.PathValue("id")
	if workflowID == "" {
		http.Error(w, "workflow id is required", http.StatusBadRequest)
		return
	}

	api.orchestrator.DeleteWorkflow(workflowID)

	w.WriteHeader(http.StatusNoContent)
}

// ExecuteWorkflowRequest represents an execution request
type ExecuteWorkflowRequest struct {
	Context map[string]any `json:"context,omitempty"`
}

// HandleExecuteWorkflow handles POST /workflows/{id}/execute
func (api *WorkflowAPI) HandleExecuteWorkflow(w http.ResponseWriter, r *http.Request) {
	workflowID := r.PathValue("id")
	if workflowID == "" {
		http.Error(w, "workflow id is required", http.StatusBadRequest)
		return
	}

	if err := api.orchestrator.Execute(r.Context(), workflowID); err != nil {
		apiError(w, err, "failed to execute workflow", http.StatusInternalServerError)
		return
	}

	workflow := api.orchestrator.GetWorkflow(workflowID)
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(workflow); err != nil {
		apiError(w, err, "failed to encode response", http.StatusInternalServerError)
	}
}

// HandleGetCheckpoints handles GET /workflows/{id}/checkpoints
func (api *WorkflowAPI) HandleGetCheckpoints(w http.ResponseWriter, r *http.Request) {
	workflowID := r.PathValue("id")
	if workflowID == "" {
		http.Error(w, "workflow id is required", http.StatusBadRequest)
		return
	}

	checkpoints := api.orchestrator.GetCheckpoints(workflowID)

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(checkpoints); err != nil {
		apiError(w, err, "failed to encode response", http.StatusInternalServerError)
	}
}

// RestoreCheckpointRequest represents a restore request
type RestoreCheckpointRequest struct {
	CheckpointID string `json:"checkpointId"`
}

// HandleRestoreCheckpoint handles POST /workflows/{id}/restore
func (api *WorkflowAPI) HandleRestoreCheckpoint(w http.ResponseWriter, r *http.Request) {
	var req RestoreCheckpointRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	workflow, err := api.orchestrator.RestoreFromCheckpoint(req.CheckpointID)
	if err != nil {
		apiError(w, err, "checkpoint not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(workflow); err != nil {
		apiError(w, err, "failed to encode response", http.StatusInternalServerError)
	}
}


// Helper function to generate IDs
func generateID(prefix string) string {
	return prefix + "-" + randomString(8)
}

func randomString(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, length)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		b[i] = charset[n.Int64()]
	}
	return string(b)
}
