package api

import (
	"encoding/json"
	"testing"
)

func TestHandleStagePatch_Validation(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		cmd    string
		params string
	}{
		{"stage_patch", `{}`},
		{"stage_patch", `{"agentId":""}`},
		{"stage_patch", `{"agentId":"a"}`},
		{"stage_patch", `{"path":""}`},
		{"stage_patch", `{invalid}`},
		{"commit_patch", `{}`},
		{"commit_patch", `{"id":""}`},
		{"commit_patch", `{invalid}`},
		{"reject_patch", `{}`},
		{"reject_patch", `{"id":""}`},
		{"reject_patch", `{invalid}`},
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

func TestHandleListPatches_Empty(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("list_patches", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	arr, ok := result.([]*PendingPatch)
	if !ok {
		t.Fatalf("expected []*PendingPatch, got %T", result)
	}
	if len(arr) != 0 {
		t.Errorf("expected empty patches, got %d", len(arr))
	}
}

func TestHandleStagePatch_Success(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("stage_patch", json.RawMessage(`{
		"agentId": "agent-1",
		"path": "main.go",
		"oldContent": "old",
		"newContent": "new"
	}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["agentId"] != "agent-1" {
		t.Errorf("expected agent-1, got %v", m["agentId"])
	}
	if m["path"] != "main.go" {
		t.Errorf("expected main.go, got %v", m["path"])
	}
	if m["id"] == nil || m["id"] == "" {
		t.Error("expected non-empty patch ID")
	}

	// Verify it appears in list
	listResult, err := handler.HandleCommand("list_patches", json.RawMessage(`{"agentId":"agent-1"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error listing patches: %v", err)
	}
	patches := listResult.([]*PendingPatch)
	if len(patches) != 1 {
		t.Fatalf("expected 1 patch, got %d", len(patches))
	}
	if patches[0].AgentID != "agent-1" {
		t.Errorf("expected agent-1, got %s", patches[0].AgentID)
	}
}

func TestHandleCommitPatch_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("commit_patch", json.RawMessage(`{"id":"nonexistent"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent patch")
	}
}

func TestHandleRejectPatch_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("reject_patch", json.RawMessage(`{"id":"nonexistent"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent patch")
	}
}

func TestHandleStageCommitReject_RoundTrip(t *testing.T) {
	handler, _ := newTestHandler()

	// Stage
	stageResult, err := handler.HandleCommand("stage_patch", json.RawMessage(`{
		"agentId": "a1", "path": "f.go", "oldContent": "", "newContent": "code"
	}`), "test")
	if err != nil {
		t.Fatalf("stage failed: %v", err)
	}
	patchID := stageResult.(map[string]any)["id"].(string)

	// Commit
	commitResult, err := handler.HandleCommand("commit_patch", json.RawMessage(`{"id":"`+patchID+`"}`), "test")
	if err != nil {
		t.Fatalf("commit failed: %v", err)
	}
	commitMap := commitResult.(map[string]any)
	if commitMap["status"] != "committed" {
		t.Errorf("expected committed status, got %v", commitMap["status"])
	}

	// Verify removed
	listResult, _ := handler.HandleCommand("list_patches", json.RawMessage(`{}`), "test")
	if len(listResult.([]*PendingPatch)) != 0 {
		t.Error("expected empty patches after commit")
	}
}

func TestHandleStageReject_RoundTrip(t *testing.T) {
	handler, _ := newTestHandler()

	// Stage
	stageResult, err := handler.HandleCommand("stage_patch", json.RawMessage(`{
		"agentId": "a2", "path": "r.go", "oldContent": "", "newContent": "code"
	}`), "test")
	if err != nil {
		t.Fatalf("stage failed: %v", err)
	}
	patchID := stageResult.(map[string]any)["id"].(string)

	// Reject
	rejectResult, err := handler.HandleCommand("reject_patch", json.RawMessage(`{"id":"`+patchID+`"}`), "test")
	if err != nil {
		t.Fatalf("reject failed: %v", err)
	}
	rejectMap := rejectResult.(map[string]string)
	if rejectMap["status"] != "rejected" {
		t.Errorf("expected rejected status, got %s", rejectMap["status"])
	}

	// Verify removed
	listResult, _ := handler.HandleCommand("list_patches", json.RawMessage(`{}`), "test")
	if len(listResult.([]*PendingPatch)) != 0 {
		t.Error("expected empty patches after reject")
	}
}
