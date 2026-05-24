package api

import (
	"encoding/json"
	"fmt"
	"testing"
)

func TestHandleGetMCPServers_Empty(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("get_mcp_servers", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	servers, ok := result.([]MCPServerInfo)
	if !ok {
		t.Fatalf("expected []MCPServerInfo, got %T", result)
	}
	if len(servers) != 0 {
		t.Errorf("expected empty list, got %d servers", len(servers))
	}
}

func TestHandleStartMCPServer_MissingID(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("start_mcp_server", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing serverId")
	}
}

func TestHandleStartMCPServer_NotFound(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("start_mcp_server", json.RawMessage(`{"serverId":"nonexistent"}`), "test")
	if err == nil {
		t.Error("expected error for unknown server")
	}
}

func TestHandleStopMCPServer_MissingID(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("stop_mcp_server", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing serverId")
	}
}

func TestHandleStopMCPServer_NotFound(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("stop_mcp_server", json.RawMessage(`{"serverId":"nope"}`), "test")
	if err == nil {
		t.Error("expected error for unknown server")
	}
}

func TestHandleCallMCPTool_MissingServerID(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("call_mcp_tool", json.RawMessage(`{"toolName":"read"}`), "test")
	if err == nil {
		t.Error("expected error for missing serverId")
	}
}

func TestHandleCallMCPTool_MissingToolName(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("call_mcp_tool", json.RawMessage(`{"serverId":"s1"}`), "test")
	if err == nil {
		t.Error("expected error for missing toolName")
	}
}

func TestHandleCallMCPTool_NotFound(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("call_mcp_tool", json.RawMessage(`{"serverId":"x","toolName":"read"}`), "test")
	if err == nil {
		t.Error("expected error for unknown server")
	}
}

func TestHandleAddMCPServer_MissingName(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("add_mcp_server", json.RawMessage(`{"config":{"command":"npx"}}`), "test")
	if err == nil {
		t.Error("expected error for missing name")
	}
}

func TestHandleAddMCPServer_MissingCommand(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("add_mcp_server", json.RawMessage(`{"config":{"name":"test"}}`), "test")
	if err == nil {
		t.Error("expected error for missing command")
	}
}

func TestHandleRemoveMCPServer_MissingID(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("remove_mcp_server", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing serverId")
	}
}

func TestHandleRemoveMCPServer_NotFound(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("remove_mcp_server", json.RawMessage(`{"serverId":"nope"}`), "test")
	if err == nil {
		t.Error("expected error for unknown server")
	}
}

func TestHandleListMCPTools_MissingID(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("list_mcp_tools", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing serverId")
	}
}

func TestHandleListMCPTools_NotFound(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("list_mcp_tools", json.RawMessage(`{"serverId":"ghost"}`), "test")
	if err == nil {
		t.Error("expected error for unknown server")
	}
}

func TestHandleCallMCPTool_TooManyArguments(t *testing.T) {
	server := &WebSocketServer{workspacePath: t.TempDir()}
	handler := NewCommandHandler(server)

	args := make(map[string]any)
	for i := 0; i < 51; i++ {
		args[fmt.Sprintf("key%d", i)] = i
	}
	raw, _ := json.Marshal(map[string]any{
		"serverId":  "s1",
		"toolName":  "read",
		"arguments": args,
	})

	_, err := handler.HandleCommand("call_mcp_tool", raw, "test")
	if err == nil {
		t.Error("expected error for too many arguments")
	}
}
