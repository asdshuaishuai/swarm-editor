package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/swarm-editor/swarm-editor/internal/swarm"
)

func TestWorkflowAPI_CreateWorkflow(t *testing.T) {
	orchestrator := swarm.NewOrchestrator(nil)
	api := NewWorkflowAPI(orchestrator)

	reqBody := CreateWorkflowRequest{
		Name:        "Test Workflow",
		Description: "A test workflow",
		Mode:        swarm.ModeSequential,
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/workflows", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	api.HandleCreateWorkflow(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp CreateWorkflowResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp.Name != "Test Workflow" {
		t.Errorf("expected name 'Test Workflow', got '%s'", resp.Name)
	}

	if resp.Status != "draft" {
		t.Errorf("expected status 'draft', got '%s'", resp.Status)
	}
}

func TestWorkflowAPI_CreateWorkflow_MissingName(t *testing.T) {
	orchestrator := swarm.NewOrchestrator(nil)
	api := NewWorkflowAPI(orchestrator)

	reqBody := CreateWorkflowRequest{
		Description: "A test workflow",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/workflows", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	api.HandleCreateWorkflow(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}
}

func TestWorkflowAPI_AddNode(t *testing.T) {
	orchestrator := swarm.NewOrchestrator(nil)
	api := NewWorkflowAPI(orchestrator)

	// Create workflow first
	workflow := orchestrator.CreateWorkflow("Test", swarm.ModeSequential)

	reqBody := AddNodeRequest{
		AgentID:  "agent-1",
		Name:     "Coder Agent",
		Type:     "agent",
		Position: swarm.Position{X: 100, Y: 100},
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/workflows/"+workflow.ID+"/nodes", bytes.NewReader(body))
	req.SetPathValue("id", workflow.ID)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	api.HandleAddNode(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

func TestWorkflowAPI_AddNode_WorkflowNotFound(t *testing.T) {
	orchestrator := swarm.NewOrchestrator(nil)
	api := NewWorkflowAPI(orchestrator)

	reqBody := AddNodeRequest{
		AgentID: "agent-1",
		Name:    "Coder Agent",
		Type:    "agent",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/workflows/non-existent/nodes", bytes.NewReader(body))
	req.SetPathValue("id", "non-existent")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	api.HandleAddNode(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected status 404, got %d", w.Code)
	}
}

func TestWorkflowAPI_AddEdge(t *testing.T) {
	orchestrator := swarm.NewOrchestrator(nil)
	api := NewWorkflowAPI(orchestrator)

	// Create workflow and nodes
	workflow := orchestrator.CreateWorkflow("Test", swarm.ModeSequential)
	workflow.AddNode(&swarm.WorkflowNode{ID: "node-1", Name: "Node 1"})
	workflow.AddNode(&swarm.WorkflowNode{ID: "node-2", Name: "Node 2"})

	reqBody := AddEdgeRequest{
		From:  "node-1",
		To:    "node-2",
		Label: "next",
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/workflows/"+workflow.ID+"/edges", bytes.NewReader(body))
	req.SetPathValue("id", workflow.ID)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	api.HandleAddEdge(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

func TestWorkflowAPI_GetWorkflow(t *testing.T) {
	orchestrator := swarm.NewOrchestrator(nil)
	api := NewWorkflowAPI(orchestrator)

	workflow := orchestrator.CreateWorkflow("Test", swarm.ModeSequential)

	req := httptest.NewRequest(http.MethodGet, "/workflows/"+workflow.ID, nil)
	req.SetPathValue("id", workflow.ID)
	w := httptest.NewRecorder()

	api.HandleGetWorkflow(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

func TestWorkflowAPI_GetWorkflow_NotFound(t *testing.T) {
	orchestrator := swarm.NewOrchestrator(nil)
	api := NewWorkflowAPI(orchestrator)

	req := httptest.NewRequest(http.MethodGet, "/workflows/non-existent", nil)
	req.SetPathValue("id", "non-existent")
	w := httptest.NewRecorder()

	api.HandleGetWorkflow(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected status 404, got %d", w.Code)
	}
}

func TestWorkflowAPI_ListWorkflows(t *testing.T) {
	orchestrator := swarm.NewOrchestrator(nil)
	api := NewWorkflowAPI(orchestrator)

	// Create multiple workflows
	orchestrator.CreateWorkflow("Workflow 1", swarm.ModeSequential)
	orchestrator.CreateWorkflow("Workflow 2", swarm.ModeParallel)

	req := httptest.NewRequest(http.MethodGet, "/workflows", nil)
	w := httptest.NewRecorder()

	api.HandleListWorkflows(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var workflows []*swarm.Workflow
	if err := json.Unmarshal(w.Body.Bytes(), &workflows); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if len(workflows) != 2 {
		t.Errorf("expected 2 workflows, got %d", len(workflows))
	}
}

func TestWorkflowAPI_DeleteWorkflow(t *testing.T) {
	orchestrator := swarm.NewOrchestrator(nil)
	api := NewWorkflowAPI(orchestrator)

	workflow := orchestrator.CreateWorkflow("Test", swarm.ModeSequential)

	req := httptest.NewRequest(http.MethodDelete, "/workflows/"+workflow.ID, nil)
	req.SetPathValue("id", workflow.ID)
	w := httptest.NewRecorder()

	api.HandleDeleteWorkflow(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("expected status 204, got %d", w.Code)
	}

	// Verify workflow is deleted
	if orchestrator.GetWorkflow(workflow.ID) != nil {
		t.Error("expected workflow to be deleted")
	}
}

func TestWorkflowAPI_GetCheckpoints(t *testing.T) {
	orchestrator := swarm.NewOrchestrator(nil)
	api := NewWorkflowAPI(orchestrator)

	workflow := orchestrator.CreateWorkflow("Test", swarm.ModeSequential)
	workflow.AddNode(&swarm.WorkflowNode{ID: "node-1", Name: "Node 1"})

	// Create checkpoint manually (normally done during execution)
	// For now just test the endpoint

	req := httptest.NewRequest(http.MethodGet, "/workflows/"+workflow.ID+"/checkpoints", nil)
	req.SetPathValue("id", workflow.ID)
	w := httptest.NewRecorder()

	api.HandleGetCheckpoints(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

func TestGenerateID(t *testing.T) {
	id1 := generateID("node")
	id2 := generateID("node")

	if id1 == id2 {
		t.Error("expected different IDs")
	}

	if len(id1) < 5 {
		t.Errorf("ID too short: %s", id1)
	}
}
