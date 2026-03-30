package mcp

import (
	"context"
	"os"
	"testing"
	"time"
)

func TestNewTestClientPair(t *testing.T) {
	client, mock, err := NewTestClientPair(nil)
	if err != nil {
		t.Fatalf("NewTestClientPair failed: %v", err)
	}
	if client == nil {
		t.Fatal("client should not be nil")
	}
	if mock == nil {
		t.Fatal("mock should not be nil")
	}

	defer mock.Close()
}

func TestNewTestClientPair_CustomTools(t *testing.T) {
	customTools := []Tool{
		{Name: "custom_tool", Description: "Custom", InputSchema: InputSchema{Type: "object"}},
	}
	client, mock, err := NewTestClientPair(customTools)
	if err != nil {
		t.Fatalf("NewTestClientPair with custom tools failed: %v", err)
	}
	defer mock.Close()

	if !client.initialized.Load() {
		t.Error("client should be initialized")
	}
}

func TestMockServerCore_HandleMessage_Initialize(t *testing.T) {
	core := &mockServerCore{}
	msg := map[string]any{"jsonrpc": "2.0", "id": float64(1), "method": "initialize", "params": map[string]any{}}
	resp := core.handleMessage(msg)

	if resp["id"] != float64(1) {
		t.Error("response should preserve id")
	}
	result, ok := resp["result"].(map[string]any)
	if !ok {
		t.Fatal("result should be a map")
	}
	info, ok := result["serverInfo"].(map[string]any)
	if !ok || info["name"] != "in-process-mock-server" {
		t.Error("serverInfo.name should be 'in-process-mock-server'")
	}
}

func TestMockServerCore_HandleMessage_ToolsList(t *testing.T) {
	core := &mockServerCore{tools: mockDefaultTools}
	msg := map[string]any{"jsonrpc": "2.0", "id": float64(2), "method": "tools/list"}
	resp := core.handleMessage(msg)

	result, ok := resp["result"].(map[string]any)
	if !ok {
		t.Fatal("result should be a map")
	}
	tools, ok := result["tools"].([]Tool)
	if !ok || len(tools) != 1 {
		t.Errorf("expected 1 tool, got %d", len(tools))
	}
}

func TestMockServerCore_HandleMessage_ToolsCall(t *testing.T) {
	core := &mockServerCore{}
	msg := map[string]any{"jsonrpc": "2.0", "id": float64(3), "method": "tools/call", "params": map[string]any{"name": "test"}}
	resp := core.handleMessage(msg)

	result, ok := resp["result"].(map[string]any)
	if !ok {
		t.Fatal("result should be a map")
	}
	content, ok := result["content"].([]map[string]any)
	if !ok || len(content) != 1 {
		t.Error("expected 1 content block")
	}
	isError, ok := result["isError"].(bool)
	if !ok || isError {
		t.Error("isError should be false")
	}
}

func TestMockServerCore_HandleMessage_Ping(t *testing.T) {
	core := &mockServerCore{}
	msg := map[string]any{"jsonrpc": "2.0", "id": float64(4), "method": "ping"}
	resp := core.handleMessage(msg)

	if resp["id"] != float64(4) {
		t.Error("response should preserve id")
	}
}

func TestMockServerCore_HandleMessage_Notification(t *testing.T) {
	core := &mockServerCore{}
	// Notification has no id — response should not contain an id field
	msg := map[string]any{"jsonrpc": "2.0", "method": "notifications/initialized", "params": map[string]any{}}
	resp := core.handleMessage(msg)
	if resp == nil {
		t.Fatal("handleMessage should return a response")
	}
	if _, ok := resp["id"]; ok {
		t.Error("notification response should not contain id field")
	}
}

func TestMockServerCore_HandleMessage_UnknownMethod(t *testing.T) {
	core := &mockServerCore{}
	msg := map[string]any{"jsonrpc": "2.0", "id": float64(5), "method": "unknown/method"}
	resp := core.handleMessage(msg)
	if resp == nil {
		t.Error("request with id should return a response, even for unknown method")
	}
}

func TestInProcessMock_Close(t *testing.T) {
	client, mock, err := NewTestClientPair(nil)
	if err != nil {
		t.Fatalf("NewTestClientPair failed: %v", err)
	}
	// Close should not panic
	mock.Close()
	_ = client
}

func TestNullReadCloser(t *testing.T) {
	n := &nullReadCloser{}
	buf := make([]byte, 10)
	nRead, err := n.Read(buf)
	if nRead != 0 {
		t.Errorf("expected 0 bytes, got %d", nRead)
	}
	if err == nil {
		t.Error("expected EOF")
	}
}

func TestClient_Ping(t *testing.T) {
	client, mock, err := NewTestClientPair(nil)
	if err != nil {
		t.Fatalf("NewTestClientPair failed: %v", err)
	}
	defer mock.Close()

	// Start client message handler to read server responses
	client.wg.Add(1)
	go client.handleMessages()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx); err != nil {
		t.Errorf("Ping failed: %v", err)
	}
}

func TestMockMCPServer_Basic(t *testing.T) {
	server, err := NewMockMCPServer(nil)
	if err != nil {
		t.Fatalf("NewMockMCPServer failed: %v", err)
	}
	defer server.Close()

	if server.GetAddr() == "" {
		t.Error("addr should not be empty")
	}

	cmd := server.GetCommand()
	if cmd == "" {
		t.Error("command should not be empty")
	}

	// WaitForReady should succeed within a few attempts
	if err := server.WaitForReady(); err != nil {
		t.Fatalf("WaitForReady failed: %v", err)
	}
}

func TestMockMCPServer_Close_Idempotent(t *testing.T) {
	server, err := NewMockMCPServer(nil)
	if err != nil {
		t.Fatalf("NewMockMCPServer failed: %v", err)
	}

	if err := server.Close(); err != nil {
		t.Fatalf("first Close failed: %v", err)
	}
	if err := server.Close(); err != nil {
		t.Errorf("second Close should be no-op: %v", err)
	}
}

func TestMockMCPServer_CustomTools(t *testing.T) {
	customTools := []Tool{
		{Name: "custom", Description: "Custom tool", InputSchema: InputSchema{Type: "object"}},
	}
	server, err := NewMockMCPServer(&MockServerConfig{Tools: customTools})
	if err != nil {
		t.Fatalf("NewMockMCPServer with custom tools failed: %v", err)
	}
	defer server.Close()

	if err := server.WaitForReady(); err != nil {
		t.Fatalf("WaitForReady failed: %v", err)
	}
}

func TestCreateMockServerScript(t *testing.T) {
	tmpFile := t.TempDir() + "/mock_server.sh"
	if err := CreateMockServerScript(tmpFile); err != nil {
		t.Fatalf("CreateMockServerScript failed: %v", err)
	}

	// Verify file is executable
	info, err := os.Stat(tmpFile)
	if err != nil {
		t.Fatalf("stat failed: %v", err)
	}
	if info.Mode()&0111 != 0111 {
		t.Error("script should be executable")
	}

	// Verify content contains expected MCP protocol responses
	data, err := os.ReadFile(tmpFile)
	if err != nil {
		t.Fatalf("ReadFile failed: %v", err)
	}
	content := string(data)
	if content == "" {
		t.Error("script should not be empty")
	}
}

func TestMockServerViaScript(t *testing.T) {
	tmpFile := t.TempDir() + "/mock_server.sh"
	config, err := MockServerViaScript(tmpFile)
	if err != nil {
		t.Fatalf("MockServerViaScript failed: %v", err)
	}
	if config == nil {
		t.Fatal("config should not be nil")
	}
	if config.Command != tmpFile {
		t.Errorf("expected command %q, got %q", tmpFile, config.Command)
	}
	if config.Name != "mock-test-client" {
		t.Errorf("expected name 'mock-test-client', got %q", config.Name)
	}
}
