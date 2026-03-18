package mcp

import (
	"context"
	"testing"
)

func TestNewClient(t *testing.T) {
	config := &ClientConfig{
		Name:    "test-client",
		Command: "test-command",
		Args:    []string{"--arg1"},
		Env:     map[string]string{"KEY": "VALUE"},
	}

	client := NewClient(config)
	if client == nil {
		t.Fatal("NewClient returned nil")
	}

	if client.name != "test-client" {
		t.Errorf("Expected name 'test-client', got '%s'", client.name)
	}

	if client.IsConnected() {
		t.Error("Client should not be connected initially")
	}
}

func TestClientConnect(t *testing.T) {
	config := &ClientConfig{
		Name:    "test-client",
		Command: "echo",
	}

	client := NewClient(config)

	ctx := context.Background()
	err := client.Connect(ctx)
	if err != nil {
		t.Fatalf("Connect failed: %v", err)
	}

	if !client.IsConnected() {
		t.Error("Client should be connected")
	}
}

func TestClientDisconnect(t *testing.T) {
	config := &ClientConfig{
		Name:    "test-client",
		Command: "echo",
	}

	client := NewClient(config)
	client.Connect(context.Background())

	err := client.Disconnect()
	if err != nil {
		t.Fatalf("Disconnect failed: %v", err)
	}

	if client.IsConnected() {
		t.Error("Client should not be connected after disconnect")
	}
}

func TestClientListTools(t *testing.T) {
	config := &ClientConfig{
		Name:    "test-client",
		Command: "echo",
	}

	client := NewClient(config)
	tools := client.ListTools()

	if tools == nil {
		t.Error("ListTools should not return nil")
	}

	if len(tools) != 0 {
		t.Errorf("Expected 0 tools initially, got %d", len(tools))
	}
}

func TestClientCallToolNotConnected(t *testing.T) {
	config := &ClientConfig{
		Name:    "test-client",
		Command: "echo",
	}

	client := NewClient(config)
	// Not connected

	ctx := context.Background()
	_, err := client.CallTool(ctx, "test-tool", map[string]interface{}{})
	if err == nil {
		t.Error("CallTool should fail when not connected")
	}
	if err != ErrNotConnected {
		t.Errorf("Expected ErrNotConnected, got %v", err)
	}
}

func TestClientCallToolConnected(t *testing.T) {
	config := &ClientConfig{
		Name:    "test-client",
		Command: "echo",
	}

	client := NewClient(config)
	client.Connect(context.Background())

	ctx := context.Background()
	result, err := client.CallTool(ctx, "test-tool", map[string]interface{}{})
	if err != nil {
		t.Fatalf("CallTool failed: %v", err)
	}

	if result == nil {
		t.Fatal("Result should not be nil")
	}

	if len(result.Content) == 0 {
		t.Error("Result should have content")
	}
}

func TestMCPError(t *testing.T) {
	err := &MCPError{Code: -1, Message: "test error"}

	if err.Error() != "test error" {
		t.Errorf("Expected error message 'test error', got '%s'", err.Error())
	}
}

func TestClientConfigFields(t *testing.T) {
	config := &ClientConfig{
		Name:    "test",
		Command: "/usr/bin/test",
		Args:    []string{"--verbose", "--debug"},
		Env: map[string]string{
			"HOME":  "/home/user",
			"PATH":  "/usr/bin",
			"DEBUG": "1",
		},
	}

	if config.Name != "test" {
		t.Error("Name mismatch")
	}
	if len(config.Args) != 2 {
		t.Error("Args length mismatch")
	}
	if len(config.Env) != 3 {
		t.Error("Env length mismatch")
	}
}

func TestToolStruct(t *testing.T) {
	tool := Tool{
		Name:        "test-tool",
		Description: "A test tool",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"input": {
					Type:        "string",
					Description: "Input parameter",
				},
			},
			Required: []string{"input"},
		},
	}

	if tool.Name != "test-tool" {
		t.Error("Tool name mismatch")
	}
	if len(tool.InputSchema.Properties) != 1 {
		t.Error("Properties length mismatch")
	}
}

func TestToolResultStruct(t *testing.T) {
	result := ToolResult{
		Content: []Content{
			{Type: "text", Text: "Hello"},
			{Type: "image", Text: "base64data"},
		},
		IsError: false,
	}

	if len(result.Content) != 2 {
		t.Error("Content length mismatch")
	}
	if result.IsError {
		t.Error("IsError should be false")
	}
}

func TestClientNilConfig(t *testing.T) {
	// Test that nil config doesn't panic
	client := NewClient(nil)
	if client == nil {
		t.Error("NewClient with nil config should still return client")
	}
}

func TestClientConcurrentAccess(t *testing.T) {
	config := &ClientConfig{
		Name:    "test-client",
		Command: "echo",
	}

	client := NewClient(config)
	client.Connect(context.Background())

	done := make(chan bool)

	// Concurrent reads
	for i := 0; i < 5; i++ {
		go func() {
			_ = client.IsConnected()
			_ = client.ListTools()
			done <- true
		}()
	}

	// Wait for all goroutines
	for i := 0; i < 5; i++ {
		<-done
	}
}

func TestPredefinedErrors(t *testing.T) {
	errors := []*MCPError{ErrNotConnected, ErrToolNotFound, ErrInvalidArgs}

	for i, err := range errors {
		if err == nil {
			t.Errorf("Error at index %d should not be nil", i)
			continue
		}
		if err.Message == "" {
			t.Errorf("Error at index %d: message should not be empty", i)
		}
		if err.Code >= 0 {
			t.Errorf("Error at index %d: code should be negative, got %d", i, err.Code)
		}
	}
}
