package api

import (
	"encoding/json"
	"testing"
)

func TestSwarmHandler_Validation(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		cmd    string
		params string
	}{
		// create_swarm: missing name
		{"create_swarm", `{"topology":"star"}`},
		// create_swarm: empty name
		{"create_swarm", `{"name":"  "}`},
		// create_swarm: invalid topology
		{"create_swarm", `{"name":"test","topology":"invalid"}`},
		// create_swarm: invalid strategy
		{"create_swarm", `{"name":"test","strategy":"invalid"}`},
		// create_swarm: invalid JSON
		{"create_swarm", `{invalid}`},
		// start_swarm: missing id
		{"start_swarm", `{}`},
		// start_swarm: empty id
		{"start_swarm", `{"id":"  "}`},
		// start_swarm: invalid JSON
		{"start_swarm", `{invalid}`},
		// stop_swarm: missing id
		{"stop_swarm", `{}`},
		// stop_swarm: invalid JSON
		{"stop_swarm", `{invalid}`},
		// submit_task: missing swarmId
		{"submit_task", `{"title":"test"}`},
		// submit_task: missing title
		{"submit_task", `{"swarmId":"sw1"}`},
		// submit_task: empty swarmId
		{"submit_task", `{"swarmId":"  ","title":"test"}`},
		// submit_task: empty title
		{"submit_task", `{"swarmId":"sw1","title":"  "}`},
		// submit_task: invalid JSON
		{"submit_task", `{invalid}`},
		// get_swarm: missing id
		{"get_swarm", `{}`},
		// get_swarm: empty id
		{"get_swarm", `{"id":"  "}`},
		// get_swarm: invalid JSON
		{"get_swarm", `{invalid}`},
		// get_swarm_tasks: missing swarmId
		{"get_swarm_tasks", `{}`},
		// get_swarm_tasks: empty swarmId
		{"get_swarm_tasks", `{"swarmId":"  "}`},
		// execute_task: missing taskId
		{"execute_task", `{}`},
		// execute_task: invalid JSON
		{"execute_task", `{invalid}`},
		// cancel_task: missing taskId
		{"cancel_task", `{}`},
		// cancel_task: empty taskId
		{"cancel_task", `{"taskId":"  "}`},
		// assign_task: missing taskId
		{"assign_task", `{}`},
		// assign_task: missing agentId
		{"assign_task", `{"taskId":"t1"}`},
		// resolve_handoff: missing taskId
		{"resolve_handoff", `{}`},
		// resolve_handoff: invalid JSON
		{"resolve_handoff", `{invalid}`},
		// get_consensus: invalid JSON
		{"get_consensus", `{invalid}`},
		// delete_swarm: missing id
		{"delete_swarm", `{}`},
		// delete_swarm: empty id
		{"delete_swarm", `{"id":"  "}`},
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

func TestSwarmHandler_GetSwarms_Empty(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("get_swarms", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	arr, ok := result.([]SwarmInfo)
	if !ok {
		t.Fatalf("expected []SwarmInfo, got %T", result)
	}
	if len(arr) != 0 {
		t.Errorf("expected empty swarms, got %d", len(arr))
	}
}

func TestSwarmHandler_StartSwarm_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("start_swarm", json.RawMessage(`{"id":"nonexistent"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent swarm")
	}
}

func TestSwarmHandler_StopSwarm_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("stop_swarm", json.RawMessage(`{"id":"nonexistent"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent swarm")
	}
}

func TestSwarmHandler_SubmitTask_SwarmNotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("submit_task", json.RawMessage(`{"swarmId":"nope","title":"do thing"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent swarm")
	}
}

func TestSwarmHandler_GetSwarm_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("get_swarm", json.RawMessage(`{"id":"nope"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent swarm")
	}
}

func TestSwarmHandler_GetSwarmTasks_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("get_swarm_tasks", json.RawMessage(`{"swarmId":"nope"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent swarm")
	}
}

func TestSwarmHandler_ExecuteTask_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("execute_task", json.RawMessage(`{"taskId":"nope","agentId":"a1"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent task")
	}
}

func TestSwarmHandler_CancelTask_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("cancel_task", json.RawMessage(`{"taskId":"nope"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent task")
	}
}

func TestSwarmHandler_AssignTask_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("assign_task", json.RawMessage(`{"taskId":"nope","agentId":"a1"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent task")
	}
}

func TestSwarmHandler_GetConsensus_EmptyResult(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("get_consensus", json.RawMessage(`{"swarmId":"nope"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if _, exists := m["consensus"]; !exists {
		t.Error("expected consensus field")
	}
}

func TestSwarmHandler_DeleteSwarm_Noop(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("delete_swarm", json.RawMessage(`{"id":"nope"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map[string]string, got %T", result)
	}
	if m["status"] != "deleted" {
		t.Errorf("expected status=deleted, got %v", m["status"])
	}
}

func TestSwarmHandler_ResolveHandoff_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("resolve_handoff", json.RawMessage(`{"taskId":"nope","resolution":"accept"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent task")
	}
}
