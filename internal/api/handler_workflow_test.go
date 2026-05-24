package api

import (
	"encoding/json"
	"testing"
)

func TestWorkflowHandler_Validation(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		cmd    string
		params string
	}{
		// get_workflow: missing id
		{"get_workflow", `{}`},
		// get_workflow: empty id
		{"get_workflow", `{"id":"  "}`},
		// get_workflow: invalid JSON
		{"get_workflow", `{invalid}`},
		// create_workflow: missing name
		{"create_workflow", `{}`},
		// create_workflow: empty name
		{"create_workflow", `{"name":"  "}`},
		// create_workflow: invalid mode
		{"create_workflow", `{"name":"test","mode":"invalid"}`},
		// create_workflow: invalid JSON
		{"create_workflow", `{invalid}`},
		// update_workflow: missing id
		{"update_workflow", `{}`},
		// update_workflow: empty id
		{"update_workflow", `{"id":"  "}`},
		// delete_workflow: missing id
		{"delete_workflow", `{}`},
		// delete_workflow: empty id
		{"delete_workflow", `{"id":"  "}`},
		// execute_workflow: missing id
		{"execute_workflow", `{}`},
		// execute_workflow: empty id
		{"execute_workflow", `{"id":"  "}`},
		// get_workflow_checkpoints: missing id
		{"get_workflow_checkpoints", `{}`},
		// restore_workflow: missing id
		{"restore_workflow", `{}`},
		// restore_workflow: empty id
		{"restore_workflow", `{"id":"  "}`},
		// export_workflow: missing id
		{"export_workflow", `{}`},
		// validate_workflow: missing id
		{"validate_workflow", `{}`},
		// validate_workflow: empty id
		{"validate_workflow", `{"id":"  "}`},
		// get_workflow_status: missing id
		{"get_workflow_status", `{}`},
		// get_workflow_status: empty id
		{"get_workflow_status", `{"id":"  "}`},
		// get_workflow_report: missing id
		{"get_workflow_report", `{}`},
		// resume_workflow: missing id
		{"resume_workflow", `{}`},
		// resume_workflow: empty id
		{"resume_workflow", `{"id":"  "}`},
		// add_workflow_node: missing workflowId
		{"add_workflow_node", `{}`},
		// add_workflow_node: empty workflowId
		{"add_workflow_node", `{"workflowId":"  ","type":"action","name":"test"}`},
		// add_workflow_node: missing type
		{"add_workflow_node", `{"workflowId":"wf1","name":"test"}`},
		// add_workflow_node: missing name
		{"add_workflow_node", `{"workflowId":"wf1","type":"action"}`},
		// add_workflow_edge: missing workflowId
		{"add_workflow_edge", `{}`},
		// add_workflow_edge: empty workflowId
		{"add_workflow_edge", `{"workflowId":"  ","from":"n1","to":"n2"}`},
		// add_workflow_edge: missing from
		{"add_workflow_edge", `{"workflowId":"wf1","to":"n2"}`},
		// add_workflow_edge: missing to
		{"add_workflow_edge", `{"workflowId":"wf1","from":"n1"}`},
	}

	for _, tt := range tests {
		t.Run(tt.cmd+"_invalid", func(t *testing.T) {
			_, err := handler.HandleCommand(tt.cmd, json.RawMessage(tt.params), "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestWorkflowHandler_ListWorkflows_NilOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("list_workflows", nil, "test")
	if err == nil {
		t.Error("expected error for nil orchestrator")
	}
}

func TestWorkflowHandler_GetWorkflow_NilOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("get_workflow", json.RawMessage(`{"id":"wf1"}`), "test")
	if err == nil {
		t.Error("expected error for nil orchestrator")
	}
}

func TestWorkflowHandler_CreateWorkflow_NilOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("create_workflow", json.RawMessage(`{"name":"test"}`), "test")
	if err == nil {
		t.Error("expected error for nil orchestrator")
	}
}

func TestWorkflowHandler_DeleteWorkflow_NilOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("delete_workflow", json.RawMessage(`{"id":"wf1"}`), "test")
	if err == nil {
		t.Error("expected error for nil orchestrator")
	}
}

func TestWorkflowHandler_ExecuteWorkflow_NilOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("execute_workflow", json.RawMessage(`{"id":"wf1"}`), "test")
	if err == nil {
		t.Error("expected error for nil orchestrator")
	}
}
