package api

import (
	"encoding/json"
	"testing"
)

func TestSessionHandler_GetSessions(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("get_sessions", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("sessions: %T", result)
}

func TestSessionHandler_CreateSession_MissingFields(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("create_session", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing fields")
	}
}

func TestSessionHandler_GetCustomInstructions(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("get_custom_instructions", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("custom instructions: %T", result)
}

func TestSessionHandler_SaveCustomInstructions(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("save_custom_instructions", json.RawMessage(`{"content":"Be helpful and concise"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("save result: %T %v", result, result)
}

func TestSessionHandler_SendMessage_MissingFields(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("send_message", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing fields")
	}
}

func TestA2AHandler_GetStatus(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("a2a_status", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("a2a status: %T", result)
}

func TestA2AHandler_GetMessageLog(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("a2a_message_log", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("a2a message log: %T", result)
}

func TestWorkspaceHandler_GetWorkspace_Integration(t *testing.T) {
	dir := t.TempDir()
	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("get_workspace", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map[string]string, got %T", result)
	}
	if m["path"] != dir {
		t.Errorf("expected path %s, got %s", dir, m["path"])
	}
}

func TestTeamHandler_GetTeams(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("get_teams", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("teams: %T", result)
}

func TestTeamHandler_CreateTeam_MissingFields(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("create_team", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing fields")
	}
}

func TestMCPHandler_GetMCPServers(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("get_mcp_servers", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("mcp servers: %T", result)
}

func TestMCPHandler_ScanMCPServers_Integration(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("scan_mcp_servers", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("scan mcp result: %T", result)
}

func TestMCPHandler_ListMCPTools_MissingID(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("list_mcp_tools", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing serverId")
	}
}

func TestWorkflowHandler_ListWorkflows(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	// Without orchestrator configured, should return error
	_, err := handler.HandleCommand("list_workflows", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Log("list_workflows succeeded without orchestrator")
	} else {
		t.Logf("expected error without orchestrator: %v", err)
	}
}

func TestWorkflowHandler_GetWorkflow_MissingID(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("get_workflow", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing id")
	}
}
