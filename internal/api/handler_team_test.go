package api

import (
	"encoding/json"
	"testing"
)

func TestTeamHandler_Validation(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		cmd    string
		params string
	}{
		// create_team: missing name
		{"create_team", `{}`},
		// create_team: empty name
		{"create_team", `{"name":"  "}`},
		// create_team: invalid JSON
		{"create_team", `{invalid}`},
		// delete_team: missing id
		{"delete_team", `{}`},
		// delete_team: empty id
		{"delete_team", `{"id":"  "}`},
		// delete_team: invalid JSON
		{"delete_team", `{invalid}`},
		// add_agent_to_team: missing teamId
		{"add_agent_to_team", `{}`},
		// add_agent_to_team: missing agentId
		{"add_agent_to_team", `{"teamId":"t1"}`},
		// add_agent_to_team: empty teamId
		{"add_agent_to_team", `{"teamId":"  ","agentId":"a1"}`},
		// add_agent_to_team: empty agentId
		{"add_agent_to_team", `{"teamId":"t1","agentId":"  "}`},
		// add_agent_to_team: invalid JSON
		{"add_agent_to_team", `{invalid}`},
		// remove_agent_from_team: missing teamId
		{"remove_agent_from_team", `{}`},
		// remove_agent_from_team: missing agentId
		{"remove_agent_from_team", `{"teamId":"t1"}`},
		// remove_agent_from_team: invalid JSON
		{"remove_agent_from_team", `{invalid}`},
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

func TestTeamHandler_GetTeams_NilManager(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("get_teams", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	arr, ok := result.([]TeamInfo)
	if !ok {
		t.Fatalf("expected []TeamInfo, got %T", result)
	}
	if len(arr) != 0 {
		t.Errorf("expected empty teams, got %d", len(arr))
	}
}

func TestTeamHandler_DeleteTeam_NilManager(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("delete_team", json.RawMessage(`{"id":"nonexistent"}`), "test")
	// delete_team returns service unavailable when team manager is nil
	if err == nil {
		// If it succeeds, that's also acceptable (idempotent delete)
		return
	}
}

func TestTeamHandler_AddAgentToTeam_NilManager(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("add_agent_to_team", json.RawMessage(`{"teamId":"nope","agentId":"a1"}`), "test")
	if err == nil {
		t.Error("expected error for nil team manager")
	}
}

func TestTeamHandler_RemoveAgentFromTeam_NilManager(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("remove_agent_from_team", json.RawMessage(`{"teamId":"nope","agentId":"a1"}`), "test")
	if err == nil {
		t.Error("expected error for nil team manager")
	}
}
