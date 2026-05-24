package api

import (
	"encoding/json"
	"testing"
)

func TestHandleCreateSession_NoConnMgr(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("create_session", json.RawMessage(`{"agentId":"ghost","mode":"default"}`), "test")
	if err == nil {
		t.Error("expected error when connection manager not available")
	}
}

func TestHandleCreateSession_InvalidJSON(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("create_session", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleGetSessions_NoConnMgr(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("get_sessions", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	arr, ok := result.([]SessionInfo)
	if !ok {
		t.Fatalf("expected []SessionInfo, got %T", result)
	}
	if len(arr) != 0 {
		t.Errorf("expected empty sessions, got %d", len(arr))
	}
}

func TestHandleSendMessage_NoConnMgr(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("send_message", json.RawMessage(`{"sessionId":"s1","message":"test"}`), "test")
	if err == nil {
		t.Error("expected error when connection manager not available")
	}
}

func TestHandleSendMessage_InvalidJSON(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("send_message", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleListWorkflows_NoSwarms(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("list_workflows", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error when orchestrator not configured")
	}
}

func TestHandleGetWorkflow_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("get_workflow", json.RawMessage(`{"id":"ghost"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent workflow")
	}
}

func TestHandleGetWorkflow_InvalidJSON(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("get_workflow", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleCreateWorkflow_InvalidJSON(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("create_workflow", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleDeleteWorkflow_InvalidJSON(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("delete_workflow", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleExecuteWorkflow_InvalidJSON(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("execute_workflow", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleGetWorkflowCheckpoints_InvalidJSON(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("get_workflow_checkpoints", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleRestoreWorkflow_InvalidJSON(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("restore_workflow", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleResumeWorkflow_InvalidJSON(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("resume_workflow", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleGetWorkflowReport_InvalidJSON(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("get_workflow_report", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleValidateWorkflow_InvalidJSON(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("validate_workflow", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}
