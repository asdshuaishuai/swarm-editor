package mcp

import (
	"context"
	"testing"
)

func TestNewServer(t *testing.T) {
	config := &ServerConfig{
		Name:    "test-server",
		Version: "1.0.0",
	}

	server := NewServer(config)
	if server == nil {
		t.Fatal("NewServer returned nil")
	}

	if server.name != "test-server" {
		t.Errorf("Expected name 'test-server', got '%s'", server.name)
	}

	if server.IsStarted() {
		t.Error("Server should not be started initially")
	}
}

func TestServerStart(t *testing.T) {
	config := &ServerConfig{
		Name:    "test-server",
		Version: "1.0.0",
	}

	server := NewServer(config)

	ctx := context.Background()
	err := server.Start(ctx)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	if !server.IsStarted() {
		t.Error("Server should be started")
	}
}

func TestServerStop(t *testing.T) {
	config := &ServerConfig{
		Name:    "test-server",
		Version: "1.0.0",
	}

	server := NewServer(config)
	server.Start(context.Background())

	err := server.Stop()
	if err != nil {
		t.Fatalf("Stop failed: %v", err)
	}

	if server.IsStarted() {
		t.Error("Server should not be started after stop")
	}
}

func TestServerRegisterTool(t *testing.T) {
	config := &ServerConfig{
		Name:    "test-server",
		Version: "1.0.0",
	}

	server := NewServer(config)

	tool := Tool{
		Name:        "test-tool",
		Description: "A test tool",
	}

	handler := func(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
		return &ToolResult{
			Content: []Content{{Type: "text", Text: "ok"}},
		}, nil
	}

	err := server.RegisterTool(tool, handler)
	if err != nil {
		t.Fatalf("RegisterTool failed: %v", err)
	}

	tools := server.ListTools()
	if len(tools) != 1 {
		t.Errorf("Expected 1 tool, got %d", len(tools))
	}
}

func TestServerUnregisterTool(t *testing.T) {
	config := &ServerConfig{
		Name:    "test-server",
		Version: "1.0.0",
	}

	server := NewServer(config)

	tool := Tool{Name: "test-tool"}
	handler := func(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
		return &ToolResult{}, nil
	}

	server.RegisterTool(tool, handler)
	server.UnregisterTool("test-tool")

	tools := server.ListTools()
	if len(tools) != 0 {
		t.Errorf("Expected 0 tools after unregister, got %d", len(tools))
	}
}

func TestServerHandleTool(t *testing.T) {
	config := &ServerConfig{
		Name:    "test-server",
		Version: "1.0.0",
	}

	server := NewServer(config)

	tool := Tool{Name: "echo"}
	handler := func(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
		msg, _ := args["message"].(string)
		return &ToolResult{
			Content: []Content{{Type: "text", Text: msg}},
		}, nil
	}

	server.RegisterTool(tool, handler)

	ctx := context.Background()
	result, err := server.HandleTool(ctx, "echo", map[string]interface{}{"message": "hello"})
	if err != nil {
		t.Fatalf("HandleTool failed: %v", err)
	}

	if len(result.Content) != 1 {
		t.Fatal("Expected 1 content item")
	}

	if result.Content[0].Text != "hello" {
		t.Errorf("Expected 'hello', got '%s'", result.Content[0].Text)
	}
}

func TestServerHandleToolNotFound(t *testing.T) {
	config := &ServerConfig{
		Name:    "test-server",
		Version: "1.0.0",
	}

	server := NewServer(config)

	ctx := context.Background()
	_, err := server.HandleTool(ctx, "nonexistent", nil)
	if err == nil {
		t.Error("HandleTool should fail for nonexistent tool")
	}
	if err != ErrToolNotFound {
		t.Errorf("Expected ErrToolNotFound, got %v", err)
	}
}

func TestServerListTools(t *testing.T) {
	config := &ServerConfig{
		Name:    "test-server",
		Version: "1.0.0",
	}

	server := NewServer(config)

	// Empty initially
	tools := server.ListTools()
	if len(tools) != 0 {
		t.Errorf("Expected 0 tools initially, got %d", len(tools))
	}

	// Add tools
	handler := func(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
		return &ToolResult{}, nil
	}

	server.RegisterTool(Tool{Name: "tool1"}, handler)
	server.RegisterTool(Tool{Name: "tool2"}, handler)
	server.RegisterTool(Tool{Name: "tool3"}, handler)

	tools = server.ListTools()
	if len(tools) != 3 {
		t.Errorf("Expected 3 tools, got %d", len(tools))
	}
}

func TestServerInfo(t *testing.T) {
	config := &ServerConfig{
		Name:        "test-server",
		Version:     "2.0.0",
		Description: "Test description",
	}

	server := NewServer(config)

	info := server.ServerInfo()
	if info["name"] != "test-server" {
		t.Error("ServerInfo name mismatch")
	}
	if info["version"] != "2.0.0" {
		t.Error("ServerInfo version mismatch")
	}
}

func TestServerConcurrentAccess(t *testing.T) {
	config := &ServerConfig{
		Name:    "test-server",
		Version: "1.0.0",
	}

	server := NewServer(config)
	server.Start(context.Background())

	handler := func(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
		return &ToolResult{}, nil
	}

	done := make(chan bool)

	// Concurrent tool registration
	for i := 0; i < 5; i++ {
		go func(n int) {
			name := string(rune('a' + n))
			server.RegisterTool(Tool{Name: name}, handler)
			done <- true
		}(i)
	}

	// Concurrent tool listing
	for i := 0; i < 5; i++ {
		go func() {
			_ = server.ListTools()
			done <- true
		}()
	}

	// Wait for all goroutines
	for i := 0; i < 10; i++ {
		<-done
	}
}

func TestServerNilConfig(t *testing.T) {
	// Test that nil config doesn't panic
	server := NewServer(nil)
	if server == nil {
		t.Error("NewServer with nil config should still return server")
	}
}

func TestServerMultipleRegistrations(t *testing.T) {
	config := &ServerConfig{
		Name:    "test-server",
		Version: "1.0.0",
	}

	server := NewServer(config)

	handler := func(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
		return &ToolResult{}, nil
	}

	// Register same tool twice - should overwrite
	server.RegisterTool(Tool{Name: "tool1"}, handler)
	server.RegisterTool(Tool{Name: "tool1"}, handler) // Overwrite

	tools := server.ListTools()
	if len(tools) != 1 {
		t.Errorf("Expected 1 tool after double registration, got %d", len(tools))
	}
}

func TestServerUnregisterNonExistent(t *testing.T) {
	config := &ServerConfig{
		Name:    "test-server",
		Version: "1.0.0",
	}

	server := NewServer(config)

	// Should not panic
	server.UnregisterTool("nonexistent")

	tools := server.ListTools()
	if len(tools) != 0 {
		t.Errorf("Expected 0 tools, got %d", len(tools))
	}
}

func TestServerListToolsPreservesMetadata(t *testing.T) {
	server := NewServer(&ServerConfig{Name: "test", Version: "1.0.0"})

	handler := func(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
		return &ToolResult{}, nil
	}

	tool := Tool{
		Name:        "search",
		Description: "Search for files",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"query": {Type: "string", Description: "Search query"},
			},
			Required: []string{"query"},
		},
	}

	server.RegisterTool(tool, handler)
	tools := server.ListTools()

	if len(tools) != 1 {
		t.Fatalf("Expected 1 tool, got %d", len(tools))
	}

	got := tools[0]
	if got.Name != "search" {
		t.Errorf("Expected name 'search', got %s", got.Name)
	}
	if got.Description != "Search for files" {
		t.Errorf("Expected description 'Search for files', got %s", got.Description)
	}
	if got.InputSchema.Type != "object" {
		t.Errorf("Expected schema type 'object', got %s", got.InputSchema.Type)
	}
	if len(got.InputSchema.Required) != 1 || got.InputSchema.Required[0] != "query" {
		t.Errorf("Expected required ['query'], got %v", got.InputSchema.Required)
	}

	// Unregister should also remove metadata
	server.UnregisterTool("search")
	tools = server.ListTools()
	if len(tools) != 0 {
		t.Errorf("Expected 0 tools after unregister, got %d", len(tools))
	}
}
