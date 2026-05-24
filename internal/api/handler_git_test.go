package api

import (
	"encoding/json"
	"testing"
)

func TestGitHandler_Validation(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		cmd    string
		params string
	}{
		// git_diff: missing path
		{"git_diff", `{}`},
		// git_diff: empty path
		{"git_diff", `{"path":""}`},
		// git_diff: invalid JSON
		{"git_diff", `{invalid}`},
		// git_commit: missing message
		{"git_commit", `{}`},
		// git_commit: empty message
		{"git_commit", `{"message":""}`},
		// git_discard: missing path
		{"git_discard", `{}`},
		// git_discard: empty path
		{"git_discard", `{"path":""}`},
		// git_blame: missing path
		{"git_blame", `{}`},
		// git_blame: empty path
		{"git_blame", `{"path":""}`},
		// git_blame: invalid JSON
		{"git_blame", `{invalid}`},
		// git_branch_create: missing name
		{"git_branch_create", `{}`},
		// git_branch_create: empty name
		{"git_branch_create", `{"name":""}`},
		// git_branch_checkout: missing name
		{"git_branch_checkout", `{}`},
		// git_branch_checkout: empty name
		{"git_branch_checkout", `{"name":""}`},
		// git_worktree_add: missing path
		{"git_worktree_add", `{}`},
		// git_worktree_add: empty path
		{"git_worktree_add", `{"path":""}`},
		// git_worktree_remove: missing path
		{"git_worktree_remove", `{}`},
		// git_worktree_remove: empty path
		{"git_worktree_remove", `{"path":""}`},
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

func TestGitHandler_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	noWorkspaceTests := []struct {
		cmd    string
		params string
	}{
		{"git_status", `{}`},
		{"git_diff", `{"path":"a.txt"}`},
		{"git_stage", `{"path":"a.txt"}`},
		{"git_unstage", `{"path":"a.txt"}`},
		{"git_commit", `{"message":"test"}`},
		{"git_discard", `{"path":"a.txt"}`},
		{"git_log", `{}`},
		{"git_push", `{}`},
		{"git_pull", `{}`},
		{"git_stash", `{}`},
		{"git_stash_pop", `{}`},
		{"git_undo_commit", `{}`},
		{"git_branch_create", `{"name":"test"}`},
		{"git_branch_checkout", `{"name":"test"}`},
	}

	for _, tt := range noWorkspaceTests {
		t.Run(tt.cmd+"_no_workspace", func(t *testing.T) {
			_, err := handler.HandleCommand(tt.cmd, json.RawMessage(tt.params), "test")
			if err == nil {
				t.Error("expected error when workspace not configured")
			}
		})
	}
}

func TestGitHandler_BranchList_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("git_branch_list", nil, "test")
	if err == nil {
		t.Error("expected error when workspace not configured")
	}
}

func TestGitHandler_WorktreeList_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("git_worktree_list", nil, "test")
	if err == nil {
		t.Error("expected error when workspace not configured")
	}
}
