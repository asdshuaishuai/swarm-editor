package api

import (
	"encoding/json"
	"testing"
)

func TestFilesystemHandler_Validation(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		cmd    string
		params string
	}{
		// read_file: missing path
		{"read_file", `{}`},
		// read_file: empty path
		{"read_file", `{"path":""}`},
		// read_file: invalid JSON
		{"read_file", `{invalid}`},
		// write_file: missing path
		{"write_file", `{"content":"test"}`},
		// write_file: empty path
		{"write_file", `{"path":"","content":"test"}`},
		// write_file: invalid JSON
		{"write_file", `{invalid}`},
		// delete_file: missing path
		{"delete_file", `{}`},
		// delete_file: invalid JSON
		{"delete_file", `{invalid}`},
		// rename_file: missing path
		{"rename_file", `{}`},
		// rename_file: missing newPath
		{"rename_file", `{"path":"a.txt"}`},
		// create_file: missing path
		{"create_file", `{}`},
		// mkdir: missing path
		{"mkdir", `{}`},
		// copy_file: missing path
		{"copy_file", `{}`},
		// copy_file: missing dest
		{"copy_file", `{"path":"a.txt"}`},
		// search_files: invalid JSON
		{"search_files", `{invalid}`},
		// search_content: invalid JSON
		{"search_content", `{invalid}`},
		// replace_content: missing path
		{"replace_content", `{}`},
		// replace_content: missing search
		{"replace_content", `{"path":"a.txt"}`},
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

func TestFilesystemHandler_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	// list_dir with valid path but no workspace
	_, err := handler.HandleCommand("list_dir", json.RawMessage(`{"path":"."}`), "test")
	if err == nil {
		t.Error("expected error when workspace not configured")
	}

	// read_file with valid path but no workspace
	_, err = handler.HandleCommand("read_file", json.RawMessage(`{"path":"test.txt"}`), "test")
	if err == nil {
		t.Error("expected error when workspace not configured")
	}

	// write_file with valid path but no workspace
	_, err = handler.HandleCommand("write_file", json.RawMessage(`{"path":"test.txt","content":"hello"}`), "test")
	if err == nil {
		t.Error("expected error when workspace not configured")
	}
}

func TestWorkspaceHandler_GetWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("get_workspace", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if _, exists := m["path"]; !exists {
		t.Error("expected path field")
	}
}

func TestWorkspaceHandler_SetWorkspace_EmptyPath(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("set_workspace", json.RawMessage(`{"path":""}`), "test")
	if err == nil {
		t.Error("expected error for empty path")
	}
}

func TestWorkspaceHandler_SetWorkspace_WhitespacePath(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("set_workspace", json.RawMessage(`{"path":"   "}`), "test")
	if err == nil {
		t.Error("expected error for whitespace-only path")
	}
}

func TestWorkspaceHandler_SetWorkspace_InvalidJSON(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("set_workspace", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestWorkspaceHandler_SetWorkspace_Success(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("set_workspace", json.RawMessage(`{"path":"/tmp/test"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["path"] != "/tmp/test" {
		t.Errorf("expected /tmp/test, got %s", m["path"])
	}
}
