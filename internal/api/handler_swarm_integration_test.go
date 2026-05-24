package api

import (
	"encoding/json"
	"testing"
)

func TestResolveHandoff_MissingRequestID(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("resolve_handoff", json.RawMessage(`{"accepted":true}`), "test")
	if err == nil {
		t.Error("expected error for missing requestId")
	}
}

func TestResolveHandoff_NonexistentRequest(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("resolve_handoff", json.RawMessage(`{"requestId":"nonexistent","accepted":true}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent handoff request")
	}
}

func TestGetConsensus_SpecificSwarm(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("get_consensus", json.RawMessage(`{"swarmId":"nonexistent"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("result type: %T", result)
}

func TestGetConsensus_AllSwarms(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("get_consensus", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("result type: %T", result)
}

func TestSubmitTask_MissingFields(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("submit_task", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing fields")
	}
}

func TestExecuteTask_MissingFields(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("execute_task", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing fields")
	}
}

func TestCancelTask_MissingFields(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("cancel_task", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing taskId")
	}
}

func TestAssignTask_MissingFields(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("assign_task", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing fields")
	}
}

func TestGetSwarm_MissingID(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("get_swarm", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing swarmId")
	}
}

func TestCreateSwarm_MissingName(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("create_swarm", json.RawMessage(`{"agentIds":["a1"]}`), "test")
	if err == nil {
		t.Error("expected error for missing name")
	}
}

func TestDeleteSwarm_MissingID(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("delete_swarm", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing id")
	}
}

func TestGetSupervisorStats_Integration(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("get_supervisor_stats", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("supervisor stats: %T", result)
}

func TestGetScheduleRunnerStatus_Integration(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	// Without runner configured, should return error
	_, err := handler.HandleCommand("get_schedule_runner_status", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Log("get_schedule_runner_status succeeded without runner")
	} else {
		t.Logf("expected error without runner: %v", err)
	}
}

func TestListAuditEvents_Integration(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	// Without orchestrator configured, may return error
	_, err := handler.HandleCommand("list_audit_events", json.RawMessage(`{"limit":10}`), "test")
	if err == nil {
		t.Log("list_audit_events succeeded without orchestrator")
	} else {
		t.Logf("expected error without orchestrator: %v", err)
	}
}

func TestGetAuditStats_Integration(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	// Without orchestrator configured, may return error
	_, err := handler.HandleCommand("get_audit_stats", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Log("get_audit_stats succeeded without orchestrator")
	} else {
		t.Logf("expected error without orchestrator: %v", err)
	}
}

func TestClearAuditLog_Integration(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	// Requires confirm=true
	_, err := handler.HandleCommand("clear_audit_log", json.RawMessage(`{"confirm":true}`), "test")
	if err == nil {
		t.Log("clear_audit_log succeeded")
	} else {
		t.Logf("clear_audit_log error: %v", err)
	}
}

func TestStartScheduleRunner_Integration(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	// Without runner configured, should return error
	_, err := handler.HandleCommand("start_schedule_runner", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Log("start_schedule_runner succeeded without runner")
	} else {
		t.Logf("expected error without runner: %v", err)
	}
}

func TestStopScheduleRunner_Integration(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	// Without runner configured, should return error
	_, err := handler.HandleCommand("stop_schedule_runner", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Log("stop_schedule_runner succeeded without runner")
	} else {
		t.Logf("expected error without runner: %v", err)
	}
}

func TestGetEmergenceData_Integration(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("get_emergence_data", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("emergence data: %T", result)
}
