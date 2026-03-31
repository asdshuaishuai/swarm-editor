package mcp

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// getMockServerPath returns the path to the mock MCP server script
func getMockServerPath(t *testing.T) string {
	// Get the directory of this file
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	// Use Python mock server for more reliable JSON handling
	return filepath.Join(dir, "mock_server.py")
}

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
	mockPath := getMockServerPath(t)

	config := &ClientConfig{
		Name:    "test-client",
		Command: "python3",
		Args:    []string{mockPath},
		Timeout: 5,
	}

	client := NewClient(config)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := client.Connect(ctx)
	if err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer func() { _ = client.Disconnect() }()

	if !client.IsConnected() {
		t.Error("Client should be connected")
	}

	if !client.IsInitialized() {
		t.Error("Client should be initialized")
	}
}

func TestClientDisconnect(t *testing.T) {
	mockPath := getMockServerPath(t)

	config := &ClientConfig{
		Name:    "test-client",
		Command: "python3",
		Args:    []string{mockPath},
		Timeout: 5,
	}

	client := NewClient(config)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}

	err := client.Disconnect()
	if err != nil {
		t.Fatalf("Disconnect failed: %v", err)
	}

	if client.IsConnected() {
		t.Error("Client should not be connected after disconnect")
	}
}

func TestClientListTools(t *testing.T) {
	mockPath := getMockServerPath(t)

	config := &ClientConfig{
		Name:    "test-client",
		Command: "python3",
		Args:    []string{mockPath},
		Timeout: 5,
	}

	client := NewClient(config)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer func() { _ = client.Disconnect() }()

	tools := client.ListTools()

	if tools == nil {
		t.Error("ListTools should not return nil")
	}

	if len(tools) == 0 {
		t.Errorf("Expected at least 1 tool, got %d", len(tools))
	}

	// Check for the mock test_tool
	found := false
	for _, tool := range tools {
		if tool.Name == "test_tool" {
			found = true
			if tool.Description != "A test tool" {
				t.Errorf("Expected description 'A test tool', got '%s'", tool.Description)
			}
			break
		}
	}
	if !found {
		t.Error("test_tool not found in tools list")
	}
}

func TestClientGetTool(t *testing.T) {
	mockPath := getMockServerPath(t)

	config := &ClientConfig{
		Name:    "test-client",
		Command: "python3",
		Args:    []string{mockPath},
		Timeout: 5,
	}

	client := NewClient(config)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer func() { _ = client.Disconnect() }()

	tool, ok := client.GetTool("test_tool")
	if !ok {
		t.Error("test_tool should exist")
	}

	if tool.Name != "test_tool" {
		t.Errorf("Expected tool name 'test_tool', got '%s'", tool.Name)
	}

	// Test non-existent tool
	_, ok = client.GetTool("non_existent_tool")
	if ok {
		t.Error("non_existent_tool should not exist")
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
	mockPath := getMockServerPath(t)

	config := &ClientConfig{
		Name:    "test-client",
		Command: "python3",
		Args:    []string{mockPath},
		Timeout: 5,
	}

	client := NewClient(config)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer func() { _ = client.Disconnect() }()

	result, err := client.CallTool(ctx, "test_tool", map[string]interface{}{
		"input": "test input",
	})
	if err != nil {
		t.Fatalf("CallTool failed: %v", err)
	}

	if result == nil {
		t.Fatal("Result should not be nil")
	}

	if len(result.Content) == 0 {
		t.Error("Result should have content")
	}

	if result.Content[0].Type != "text" {
		t.Errorf("Expected content type 'text', got '%s'", result.Content[0].Type)
	}
}

func TestClientCallToolNotFound(t *testing.T) {
	mockPath := getMockServerPath(t)

	config := &ClientConfig{
		Name:    "test-client",
		Command: "python3",
		Args:    []string{mockPath},
		Timeout: 5,
	}

	client := NewClient(config)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer func() { _ = client.Disconnect() }()

	_, err := client.CallTool(ctx, "non_existent_tool", map[string]interface{}{})
	if err == nil {
		t.Error("CallTool should fail for non-existent tool")
	}
	if err != ErrToolNotFound {
		t.Errorf("Expected ErrToolNotFound, got %v", err)
	}
}

func TestClientPing(t *testing.T) {
	mockPath := getMockServerPath(t)

	config := &ClientConfig{
		Name:    "test-client",
		Command: "python3",
		Args:    []string{mockPath},
		Timeout: 5,
	}

	client := NewClient(config)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer func() { _ = client.Disconnect() }()

	err := client.Ping(ctx)
	if err != nil {
		t.Errorf("Ping failed: %v", err)
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
		t.Fatal("NewClient with nil config should still return client")
	}
	if client.config == nil {
		t.Fatal("Client config should not be nil")
	}
	if client.config.Timeout != 30 {
		t.Error("Default timeout should be 30 seconds")
	}
}

func TestClientConcurrentAccess(t *testing.T) {
	mockPath := getMockServerPath(t)

	config := &ClientConfig{
		Name:    "test-client",
		Command: "python3",
		Args:    []string{mockPath},
		Timeout: 5,
	}

	client := NewClient(config)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer func() { _ = client.Disconnect() }()

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

func TestValidateCommand(t *testing.T) {
	// Save original and restore after test
	orig := AllowedMCPCommands
	defer func() { AllowedMCPCommands = orig }()

	tests := []struct {
		name        string
		command     string
		allowed     map[string]bool
		wantErr     bool
		description string
	}{
		{
			name:        "empty command",
			command:     "",
			allowed:     nil,
			wantErr:     true,
			description: "empty command should fail",
		},
		{
			name:        "allowed command npx",
			command:     "npx",
			allowed:     nil,
			wantErr:     false,
			description: "npx is in default whitelist",
		},
		{
			name:        "allowed command uvx",
			command:     "uvx",
			allowed:     nil,
			wantErr:     false,
			description: "uvx is in default whitelist",
		},
		{
			name:        "blocked command",
			command:     "malicious-binary",
			allowed:     nil,
			wantErr:     true,
			description: "non-whitelisted command should fail",
		},
		{
			name:        "command with forward slash path",
			command:     "/usr/local/bin/npx",
			allowed:     nil,
			wantErr:     false,
			description: "extracts base command from Unix path",
		},
		{
			name:        "command with backslash path",
			command:     "C:\\Program Files\\nodejs\\npx",
			allowed:     nil,
			wantErr:     false,
			description: "extracts base command from Windows path",
		},
		{
			name:        "custom whitelist allowed",
			command:     "my-custom-server",
			allowed:     map[string]bool{"my-custom-server": true},
			wantErr:     false,
			description: "custom whitelist allows command",
		},
		{
			name:        "custom whitelist blocked",
			command:     "npx",
			allowed:     map[string]bool{"only-this": true},
			wantErr:     true,
			description: "custom whitelist blocks default commands",
		},
		{
			name:        "python allowed",
			command:     "python",
			allowed:     nil,
			wantErr:     false,
			description: "python is in default whitelist",
		},
		{
			name:        "uv allowed",
			command:     "uv",
			allowed:     nil,
			wantErr:     false,
			description: "uv is in default whitelist",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			AllowedMCPCommands = tt.allowed
			err := validateCommand(tt.command)
			if tt.wantErr {
				if err == nil {
					t.Errorf("%s: expected error, got nil", tt.description)
				}
			} else {
				if err != nil {
					t.Errorf("%s: unexpected error: %v", tt.description, err)
				}
			}
		})
	}
}

func TestErrCommandForbidden(t *testing.T) {
	if ErrCommandForbidden == nil {
		t.Fatal("ErrCommandForbidden should not be nil")
	}
	if ErrCommandForbidden.Code != -4 {
		t.Errorf("expected code -4, got %d", ErrCommandForbidden.Code)
	}
	if ErrCommandForbidden.Message == "" {
		t.Error("ErrCommandForbidden should have a message")
	}
}

func TestClientGetCapabilities(t *testing.T) {
	mockPath := getMockServerPath(t)

	config := &ClientConfig{
		Name:    "test-client",
		Command: "python3",
		Args:    []string{mockPath},
		Timeout: 5,
	}

	client := NewClient(config)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer func() { _ = client.Disconnect() }()

	caps := client.GetCapabilities()
	if caps == nil {
		t.Error("Capabilities should not be nil")
	}
}

func TestClientListResources(t *testing.T) {
	mockPath := getMockServerPath(t)

	config := &ClientConfig{
		Name:    "test-client",
		Command: "python3",
		Args:    []string{mockPath},
		Timeout: 5,
	}

	client := NewClient(config)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer func() { _ = client.Disconnect() }()

	resources, err := client.ListResources(ctx)
	if err != nil {
		t.Errorf("ListResources failed: %v", err)
	}

	if resources == nil {
		t.Error("ListResources should not return nil")
	}
}

func TestClientListPrompts(t *testing.T) {
	mockPath := getMockServerPath(t)

	config := &ClientConfig{
		Name:    "test-client",
		Command: "python3",
		Args:    []string{mockPath},
		Timeout: 5,
	}

	client := NewClient(config)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer func() { _ = client.Disconnect() }()

	prompts, err := client.ListPrompts(ctx)
	if err != nil {
		t.Errorf("ListPrompts failed: %v", err)
	}

	if prompts == nil {
		t.Error("ListPrompts should not return nil")
	}
}

func TestClientReadResource(t *testing.T) {
	mockPath := getMockServerPath(t)

	config := &ClientConfig{
		Name:    "test-client",
		Command: "python3",
		Args:    []string{mockPath},
		Timeout: 5,
	}

	client := NewClient(config)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer func() { _ = client.Disconnect() }()

	// Call ReadResource directly - mock server handles resources/read
	result, err := client.ReadResource(ctx, "file:///test.txt")
	if err != nil {
		t.Errorf("ReadResource failed: %v", err)
	}
	if result == nil {
		t.Error("ReadResource should not return nil")
	}
}

func TestClientReadResource_NotConnected(t *testing.T) {
	config := &ClientConfig{
		Name:    "test-client",
		Command: "python3",
		Args:    []string{"--nonexistent"},
		Timeout: 5,
	}

	client := NewClient(config)
	ctx := context.Background()

	_, err := client.ReadResource(ctx, "file:///test.txt")
	if err != ErrNotConnected {
		t.Errorf("expected ErrNotConnected, got: %v", err)
	}
}

func TestClientGetPrompt(t *testing.T) {
	mockPath := getMockServerPath(t)

	config := &ClientConfig{
		Name:    "test-client",
		Command: "python3",
		Args:    []string{mockPath},
		Timeout: 5,
	}

	client := NewClient(config)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer func() { _ = client.Disconnect() }()

	// Call GetPrompt directly - mock server handles prompts/get
	result, err := client.GetPrompt(ctx, "test-prompt", nil)
	if err != nil {
		t.Errorf("GetPrompt failed: %v", err)
	}
	if result == nil {
		t.Error("GetPrompt should not return nil")
	}
}

func TestClientGetPrompt_NotConnected(t *testing.T) {
	config := &ClientConfig{
		Name:    "test-client",
		Command: "python3",
		Args:    []string{"--nonexistent"},
		Timeout: 5,
	}

	client := NewClient(config)
	ctx := context.Background()

	_, err := client.GetPrompt(ctx, "test-prompt", nil)
	if err != ErrNotConnected {
		t.Errorf("expected ErrNotConnected, got: %v", err)
	}
}
