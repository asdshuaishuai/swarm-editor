package api

import (
	"encoding/json"
	"testing"
)

func TestAgentHandler_Validation(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		cmd    string
		params string
	}{
		{"get_agent", `{}`},
		{"get_agent", `{"id":""}`},
		{"get_agent", `{invalid}`},
		{"start_agent", `{}`},
		{"start_agent", `{"agentId":""}`},
		{"start_agent", `{invalid}`},
		{"stop_agent", `{}`},
		{"stop_agent", `{"agentId":""}`},
		{"stop_agent", `{invalid}`},
		{"add_agent", `{}`},
		{"add_agent", `{invalid}`},
		{"delete_agent", `{}`},
		{"delete_agent", `{"id":""}`},
		{"delete_agent", `{invalid}`},
		{"update_agent", `{}`},
		{"update_agent", `{"id":""}`},
		{"update_agent", `{invalid}`},
		{"execute_code", `{}`},
		{"execute_code", `{invalid}`},
		{"test_agent", `{}`},
		{"test_agent", `{"agentId":""}`},
		{"test_agent", `{invalid}`},
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

func TestAgentHandler_GetAgents_NilRegistry(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("get_agents", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	arr, ok := result.([]AgentInfo)
	if !ok {
		t.Fatalf("expected []AgentInfo, got %T", result)
	}
	if len(arr) != 0 {
		t.Errorf("expected empty agents, got %d", len(arr))
	}
}

func TestAgentHandler_GetAgent_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("get_agent", json.RawMessage(`{"id":"nonexistent"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent agent")
	}
}

func TestAgentHandler_StartAgent_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("start_agent", json.RawMessage(`{"agentId":"ghost"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent agent")
	}
}

func TestAgentHandler_StopAgent_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("stop_agent", json.RawMessage(`{"agentId":"ghost"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent agent")
	}
}

func TestAgentHandler_DeleteAgent_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("delete_agent", json.RawMessage(`{"id":"ghost"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent agent")
	}
}

func TestAgentHandler_AddAgent_MissingFields(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("add_agent", json.RawMessage(`{"name":"test"}`), "test")
	if err == nil {
		t.Error("expected error for missing command")
	}

	_, err = handler.HandleCommand("add_agent", json.RawMessage(`{"command":"echo"}`), "test")
	if err == nil {
		t.Error("expected error for missing name")
	}
}

func TestAgentHandler_UpdateAgent_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("update_agent", json.RawMessage(`{"id":"ghost","command":"echo"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent agent")
	}
}

func TestSessionValidation_Extended(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		cmd    string
		params string
	}{
		{"create_session", `{invalid}`},
		{"send_message", `{"sessionId":"s1"}`},
		{"send_message", `{invalid}`},
		{"close_session", `{}`},
		{"close_session", `{"sessionId":""}`},
		{"close_session", `{invalid}`},
		{"save_custom_instructions", `{invalid}`},
	}

	for _, tt := range tests {
		t.Run(tt.cmd+"_ext_invalid", func(t *testing.T) {
			_, err := handler.HandleCommand(tt.cmd, json.RawMessage(tt.params), "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestSessionHandler_CloseSession_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("close_session", json.RawMessage(`{"sessionId":"ghost"}`), "test")
	t.Logf("close_session ghost: err=%v", err)
}

func TestAgentHandler_GetProcessMetrics_NilConnMgr(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("get_process_metrics", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	arr, ok := result.([]map[string]any)
	if !ok {
		t.Fatalf("expected []map[string]any, got %T", result)
	}
	if len(arr) != 0 {
		t.Errorf("expected empty array without connection manager, got %d", len(arr))
	}
}
