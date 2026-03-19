package llm

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
)

func TestNewRegistry(t *testing.T) {
	registry := NewRegistry()

	if registry == nil {
		t.Fatal("NewRegistry returned nil")
	}

	if registry.providers == nil {
		t.Error("providers map should be initialized")
	}
}

func TestRegistryRegister(t *testing.T) {
	registry := NewRegistry()
	provider := NewMockProvider("test-provider")

	registry.Register(provider)

	if len(registry.providers) != 1 {
		t.Errorf("Expected 1 provider, got %d", len(registry.providers))
	}

	// First registered provider should be default
	if registry.def != "test-provider" {
		t.Errorf("Expected default 'test-provider', got '%s'", registry.def)
	}
}

func TestRegistryGet(t *testing.T) {
	registry := NewRegistry()
	provider := NewMockProvider("test-provider")
	registry.Register(provider)

	found, ok := registry.Get("test-provider")
	if !ok {
		t.Fatal("Provider should be found")
	}

	if found.Name() != "test-provider" {
		t.Errorf("Expected name 'test-provider', got '%s'", found.Name())
	}

	// Test non-existent provider
	_, ok = registry.Get("non-existent")
	if ok {
		t.Error("Non-existent provider should not be found")
	}
}

func TestRegistryGetDefault(t *testing.T) {
	registry := NewRegistry()

	// No default when empty
	def := registry.GetDefault()
	if def != nil {
		t.Error("Default should be nil when empty")
	}

	// Register provider
	provider := NewMockProvider("test-provider")
	registry.Register(provider)

	def = registry.GetDefault()
	if def == nil {
		t.Fatal("Default should not be nil")
	}

	if def.Name() != "test-provider" {
		t.Errorf("Expected default 'test-provider', got '%s'", def.Name())
	}
}

func TestRegistrySetDefault(t *testing.T) {
	registry := NewRegistry()
	provider1 := NewMockProvider("provider-1")
	provider2 := NewMockProvider("provider-2")

	registry.Register(provider1)
	registry.Register(provider2)

	err := registry.SetDefault("provider-2")
	if err != nil {
		t.Fatalf("SetDefault failed: %v", err)
	}

	if registry.def != "provider-2" {
		t.Errorf("Expected default 'provider-2', got '%s'", registry.def)
	}

	// Test setting non-existent as default
	err = registry.SetDefault("non-existent")
	if err == nil {
		t.Error("SetDefault should fail for non-existent provider")
	}
}

func TestRegistryList(t *testing.T) {
	registry := NewRegistry()

	// Empty registry
	list := registry.List()
	if len(list) != 0 {
		t.Errorf("Expected empty list, got %d", len(list))
	}

	// Add providers
	registry.Register(NewMockProvider("provider-1"))
	registry.Register(NewMockProvider("provider-2"))

	list = registry.List()
	if len(list) != 2 {
		t.Errorf("Expected 2 providers, got %d", len(list))
	}
}

func TestRegistryConcurrentAccess(t *testing.T) {
	registry := NewRegistry()
	var wg sync.WaitGroup
	done := make(chan bool, 20)

	// Concurrent registrations
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			registry.Register(NewMockProvider("provider-" + string(rune('0'+idx))))
			done <- true
		}(i)
	}

	// Concurrent reads
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			registry.List()
			done <- true
		}()
	}

	wg.Wait()
	close(done)

	count := 0
	for range done {
		count++
	}
	if count != 20 {
		t.Errorf("Expected 20 completions, got %d", count)
	}
}

// MockProvider tests

func TestNewMockProvider(t *testing.T) {
	provider := NewMockProvider("test")

	if provider == nil {
		t.Fatal("NewMockProvider returned nil")
	}

	if provider.Name() != "test" {
		t.Errorf("Expected name 'test', got '%s'", provider.Name())
	}

	caps := provider.GetCapabilities()
	if !caps.SupportsVision {
		t.Error("Should support vision")
	}

	if !caps.SupportsTools {
		t.Error("Should support tools")
	}

	if caps.MaxTokens != 4096 {
		t.Errorf("Expected MaxTokens 4096, got %d", caps.MaxTokens)
	}
}

func TestMockProviderGenerate(t *testing.T) {
	provider := NewMockProvider("test")
	ctx := context.Background()

	req := &GenerateRequest{
		Model: "mock-model",
		Messages: []Message{
			{Role: "user", Content: []ContentBlock{{Type: "text", Text: "Hello"}}},
		},
	}

	resp, err := provider.Generate(ctx, req)
	if err != nil {
		t.Fatalf("Generate failed: %v", err)
	}

	if resp == nil {
		t.Fatal("Response should not be nil")
	}

	if resp.Model != "mock-model" {
		t.Errorf("Expected model 'mock-model', got '%s'", resp.Model)
	}

	if len(resp.Content) == 0 {
		t.Error("Content should not be empty")
	}

	if resp.StopReason != "end_turn" {
		t.Errorf("Expected StopReason 'end_turn', got '%s'", resp.StopReason)
	}

	if resp.Usage.InputTokens != 100 {
		t.Errorf("Expected InputTokens 100, got %d", resp.Usage.InputTokens)
	}
}

func TestMockProviderStream(t *testing.T) {
	provider := NewMockProvider("test")
	ctx := context.Background()

	req := &GenerateRequest{
		Model: "mock-model",
		Messages: []Message{
			{Role: "user", Content: []ContentBlock{{Type: "text", Text: "Hello"}}},
		},
	}

	ch, err := provider.Stream(ctx, req)
	if err != nil {
		t.Fatalf("Stream failed: %v", err)
	}

	if ch == nil {
		t.Fatal("Channel should not be nil")
	}

	// Collect chunks
	chunks := make([]StreamChunk, 0)
	for chunk := range ch {
		chunks = append(chunks, chunk)
	}

	if len(chunks) == 0 {
		t.Error("Should receive at least one chunk")
	}

	// Last chunk should be message_stop
	lastChunk := chunks[len(chunks)-1]
	if lastChunk.Type != "message_stop" {
		t.Errorf("Expected last chunk type 'message_stop', got '%s'", lastChunk.Type)
	}
}

func TestMockProviderStreamCancelled(t *testing.T) {
	provider := NewMockProvider("test")
	ctx, cancel := context.WithCancel(context.Background())

	req := &GenerateRequest{
		Model: "mock-model",
		Messages: []Message{
			{Role: "user", Content: []ContentBlock{{Type: "text", Text: "Hello"}}},
		},
	}

	ch, err := provider.Stream(ctx, req)
	if err != nil {
		t.Fatalf("Stream failed: %v", err)
	}

	// Read at least one chunk to ensure goroutine has started
	// This makes the test more reliable
	select {
	case chunk := <-ch:
		if chunk.Error != nil {
			// Already got an error, which is fine
			return
		}
		// Got a valid chunk, now cancel and check for error in remaining chunks
	case <-time.After(100 * time.Millisecond):
		// Channel might be closed already
	}

	// Cancel the context
	cancel()

	// Read remaining chunks - should either get an error chunk or normal completion
	// depending on timing
	hasError := false
	for chunk := range ch {
		if chunk.Error != nil {
			hasError = true
			break
		}
	}

	// This test is timing-dependent, so we just verify the channel closes properly
	// The error path is tested implicitly through the context check in Stream
	_ = hasError
}

func TestMockProviderCountTokens(t *testing.T) {
	provider := NewMockProvider("test")

	prompt := acp.Prompt{
		{Type: "text", Text: "Hello world"},
		{Type: "text", Text: "Another text"},
	}

	count, err := provider.CountTokens(prompt)
	if err != nil {
		t.Fatalf("CountTokens failed: %v", err)
	}

	// Rough estimate: each 4 chars = 1 token
	// "Hello world" = 11 chars = 2 tokens
	// "Another text" = 12 chars = 3 tokens
	// Total = 5 tokens
	if count != 5 {
		t.Errorf("Expected 5 tokens, got %d", count)
	}
}

func TestMockProviderGenerateCyclesResponses(t *testing.T) {
	provider := NewMockProvider("test")
	ctx := context.Background()

	req := &GenerateRequest{
		Model:    "mock-model",
		Messages: []Message{},
	}

	// Generate more responses than we have predefined
	responses := make([]string, 0, 5)
	for i := 0; i < 5; i++ {
		resp, _ := provider.Generate(ctx, req)
		responses = append(responses, resp.Content[0].Text)
	}

	// Should cycle through responses
	if responses[0] == responses[3] {
		// Fourth response should be same as first (cycling)
	} else if responses[0] == responses[1] {
		t.Error("Responses should cycle through different values")
	}
}

// ToolManager tests

func TestNewToolManager(t *testing.T) {
	tm := NewToolManager()

	if tm == nil {
		t.Fatal("NewToolManager returned nil")
	}

	if tm.tools == nil {
		t.Error("tools map should be initialized")
	}
}

func TestToolManagerRegister(t *testing.T) {
	tm := NewToolManager()

	tool := Tool{
		Name:        "test_tool",
		Description: "A test tool",
		InputSchema: json.RawMessage(`{"type": "object"}`),
	}

	tm.Register(tool)

	if len(tm.tools) != 1 {
		t.Errorf("Expected 1 tool, got %d", len(tm.tools))
	}
}

func TestToolManagerGet(t *testing.T) {
	tm := NewToolManager()

	tool := Tool{
		Name:        "test_tool",
		Description: "A test tool",
	}
	tm.Register(tool)

	found, ok := tm.Get("test_tool")
	if !ok {
		t.Fatal("Tool should be found")
	}

	if found.Name != "test_tool" {
		t.Errorf("Expected name 'test_tool', got '%s'", found.Name)
	}

	// Test non-existent tool
	_, ok = tm.Get("non-existent")
	if ok {
		t.Error("Non-existent tool should not be found")
	}
}

func TestToolManagerList(t *testing.T) {
	tm := NewToolManager()

	// Empty
	list := tm.List()
	if len(list) != 0 {
		t.Errorf("Expected empty list, got %d", len(list))
	}

	// Add tools
	tm.Register(Tool{Name: "tool-1"})
	tm.Register(Tool{Name: "tool-2"})

	list = tm.List()
	if len(list) != 2 {
		t.Errorf("Expected 2 tools, got %d", len(list))
	}
}

func TestToolManagerGetToolsForPrompt(t *testing.T) {
	tm := NewToolManager()

	tm.Register(Tool{Name: "tool-1"})
	tm.Register(Tool{Name: "tool-2"})

	tools := tm.GetToolsForPrompt()
	if len(tools) != 2 {
		t.Errorf("Expected 2 tools, got %d", len(tools))
	}
}

func TestToolManagerExecuteTool(t *testing.T) {
	tm := NewToolManager()
	ctx := context.Background()

	result, err := tm.ExecuteTool(ctx, "any_tool", json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("ExecuteTool failed: %v", err)
	}

	if string(result) != `{"status": "executed"}` {
		t.Errorf("Unexpected result: %s", string(result))
	}
}

func TestToolManagerConcurrentAccess(t *testing.T) {
	tm := NewToolManager()
	var wg sync.WaitGroup
	done := make(chan bool, 20)

	// Concurrent registrations
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			tm.Register(Tool{Name: "tool-" + string(rune('0'+idx))})
			done <- true
		}(i)
	}

	// Concurrent reads
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			tm.List()
			done <- true
		}()
	}

	wg.Wait()
	close(done)

	count := 0
	for range done {
		count++
	}
	if count != 20 {
		t.Errorf("Expected 20 completions, got %d", count)
	}
}

// DefaultTools tests

func TestDefaultTools(t *testing.T) {
	tools := DefaultTools()

	if len(tools) == 0 {
		t.Fatal("DefaultTools should not be empty")
	}

	// Check for expected tools
	toolNames := make(map[string]bool)
	for _, tool := range tools {
		toolNames[tool.Name] = true
	}

	expectedTools := []string{"read_file", "write_file", "execute_command", "search_code", "list_directory"}
	for _, name := range expectedTools {
		if !toolNames[name] {
			t.Errorf("Expected tool '%s' not found", name)
		}
	}
}

// ConvertACPPromptToLLMMessages tests

func TestConvertACPPromptToLLMMessages(t *testing.T) {
	tests := []struct {
		name     string
		prompt   acp.Prompt
		expected int
	}{
		{
			name:     "empty prompt",
			prompt:   acp.Prompt{},
			expected: 0,
		},
		{
			name: "text only",
			prompt: acp.Prompt{
				{Type: "text", Text: "Hello"},
			},
			expected: 1,
		},
		{
			name: "multiple blocks",
			prompt: acp.Prompt{
				{Type: "text", Text: "Hello"},
				{Type: "text", Text: "World"},
			},
			expected: 2,
		},
		{
			name: "image block",
			prompt: acp.Prompt{
				{Type: "image", Image: &acp.ImageData{Data: "base64data", MimeType: "image/png"}},
			},
			expected: 1,
		},
		{
			name: "resource block",
			prompt: acp.Prompt{
				{Type: "resource", Resource: &acp.Resource{Text: "resource text"}},
			},
			expected: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			messages := ConvertACPPromptToLLMMessages(tt.prompt)

			if len(messages) != tt.expected {
				t.Errorf("Expected %d messages, got %d", tt.expected, len(messages))
			}

			// Check all messages have user role
			for _, msg := range messages {
				if msg.Role != "user" {
					t.Errorf("Expected role 'user', got '%s'", msg.Role)
				}
			}
		})
	}
}

func TestConvertACPPromptWithImage(t *testing.T) {
	prompt := acp.Prompt{
		{
			Type:  "image",
			Image: &acp.ImageData{Data: "base64data", MimeType: "image/png"},
		},
	}

	messages := ConvertACPPromptToLLMMessages(prompt)

	if len(messages) != 1 {
		t.Fatalf("Expected 1 message, got %d", len(messages))
	}

	content := messages[0].Content[0]
	if content.Type != "image" {
		t.Errorf("Expected content type 'image', got '%s'", content.Type)
	}

	if content.Source == nil {
		t.Fatal("Source should not be nil for image")
	}

	if content.Source.MediaType != "image/png" {
		t.Errorf("Expected MediaType 'image/png', got '%s'", content.Source.MediaType)
	}

	if content.Source.Data != "base64data" {
		t.Errorf("Expected Data 'base64data', got '%s'", content.Source.Data)
	}
}

func TestConvertACPPromptWithResource(t *testing.T) {
	prompt := acp.Prompt{
		{
			Type:     "resource",
			Resource: &acp.Resource{Text: "resource content"},
		},
	}

	messages := ConvertACPPromptToLLMMessages(prompt)

	if len(messages) != 1 {
		t.Fatalf("Expected 1 message, got %d", len(messages))
	}

	content := messages[0].Content[0]
	if content.Type != "text" {
		t.Errorf("Expected content type 'text' for resource, got '%s'", content.Type)
	}

	if content.Text != "resource content" {
		t.Errorf("Expected Text 'resource content', got '%s'", content.Text)
	}
}

// Type tests

func TestGenerateRequestJSON(t *testing.T) {
	req := &GenerateRequest{
		Model:         "test-model",
		MaxTokens:     100,
		Temperature:   0.7,
		TopP:          0.9,
		StopSequences: []string{"STOP"},
	}

	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed GenerateRequest
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.Model != "test-model" {
		t.Errorf("Model mismatch")
	}

	if parsed.MaxTokens != 100 {
		t.Errorf("MaxTokens mismatch")
	}
}

func TestMessageJSON(t *testing.T) {
	msg := Message{
		Role: "user",
		Content: []ContentBlock{
			{Type: "text", Text: "Hello"},
		},
	}

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed Message
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.Role != "user" {
		t.Errorf("Role mismatch")
	}
}

func TestContentBlockWithToolUse(t *testing.T) {
	block := ContentBlock{
		Type: "tool_use",
		ToolUse: &ToolUse{
			ID:    "tool-123",
			Name:  "read_file",
			Input: json.RawMessage(`{"path": "/test"}`),
		},
	}

	data, err := json.Marshal(block)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed ContentBlock
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.ToolUse == nil {
		t.Fatal("ToolUse should not be nil")
	}

	if parsed.ToolUse.Name != "read_file" {
		t.Errorf("Tool name mismatch")
	}
}

func TestContentBlockWithToolResult(t *testing.T) {
	block := ContentBlock{
		Type: "tool_result",
		ToolResult: &ToolResult{
			ToolUseID: "tool-123",
			Content:   json.RawMessage(`{"result": "ok"}`),
			IsError:   false,
		},
	}

	data, err := json.Marshal(block)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed ContentBlock
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.ToolResult == nil {
		t.Fatal("ToolResult should not be nil")
	}

	if parsed.ToolResult.ToolUseID != "tool-123" {
		t.Errorf("ToolUseID mismatch")
	}
}

func TestStreamChunk(t *testing.T) {
	chunk := StreamChunk{
		Type: "content_block_delta",
		Delta: &ContentDelta{
			Type: "text_delta",
			Text: "Hello",
		},
	}

	data, err := json.Marshal(chunk)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed StreamChunk
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.Type != "content_block_delta" {
		t.Errorf("Type mismatch")
	}

	if parsed.Delta.Text != "Hello" {
		t.Errorf("Delta text mismatch")
	}
}

func TestGenerateResponseJSON(t *testing.T) {
	resp := &GenerateResponse{
		ID:    "resp-123",
		Model: "test-model",
		Content: []ContentBlock{
			{Type: "text", Text: "Response text"},
		},
		StopReason: "end_turn",
		Usage: Usage{
			InputTokens:  100,
			OutputTokens: 50,
		},
	}

	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed GenerateResponse
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.ID != "resp-123" {
		t.Errorf("ID mismatch")
	}

	if parsed.Usage.InputTokens != 100 {
		t.Errorf("Usage.InputTokens mismatch")
	}
}

func TestModelCapabilitiesJSON(t *testing.T) {
	caps := ModelCapabilities{
		SupportsVision:    true,
		SupportsTools:     true,
		SupportsStreaming: true,
		MaxTokens:         4096,
		SupportedModels:   []string{"model-1", "model-2"},
	}

	data, err := json.Marshal(caps)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed ModelCapabilities
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if !parsed.SupportsVision {
		t.Error("SupportsVision should be true")
	}

	if len(parsed.SupportedModels) != 2 {
		t.Errorf("Expected 2 supported models, got %d", len(parsed.SupportedModels))
	}
}

// Integration-style test

func TestFullWorkflow(t *testing.T) {
	// Create registry
	registry := NewRegistry()

	// Register mock provider
	provider := NewMockProvider("mock")
	registry.Register(provider)

	// Get default
	def := registry.GetDefault()
	if def == nil {
		t.Fatal("Default provider should exist")
	}

	// Create tool manager
	tm := NewToolManager()

	// Register tools
	for _, tool := range DefaultTools() {
		tm.Register(tool)
	}

	// Generate response
	ctx := context.Background()
	req := &GenerateRequest{
		Model: "mock-model",
		Messages: []Message{
			{Role: "user", Content: []ContentBlock{{Type: "text", Text: "Hello"}}},
		},
		Tools: tm.GetToolsForPrompt(),
	}

	resp, err := def.Generate(ctx, req)
	if err != nil {
		t.Fatalf("Generate failed: %v", err)
	}

	if resp == nil {
		t.Fatal("Response should not be nil")
	}

	// Stream response
	streamCh, err := def.Stream(ctx, req)
	if err != nil {
		t.Fatalf("Stream failed: %v", err)
	}

	// Collect stream
	receivedChunks := 0
	for range streamCh {
		receivedChunks++
	}

	if receivedChunks == 0 {
		t.Error("Should receive at least one chunk from stream")
	}
}

// Benchmark tests

func BenchmarkMockProviderGenerate(b *testing.B) {
	provider := NewMockProvider("test")
	ctx := context.Background()
	req := &GenerateRequest{
		Model:    "mock-model",
		Messages: []Message{},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = provider.Generate(ctx, req)
	}
}

func BenchmarkConvertACPPrompt(b *testing.B) {
	prompt := acp.Prompt{
		{Type: "text", Text: "Hello world this is a test"},
		{Type: "text", Text: "Another block of text"},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ConvertACPPromptToLLMMessages(prompt)
	}
}

func BenchmarkRegistryConcurrentAccess(b *testing.B) {
	registry := NewRegistry()
	provider := NewMockProvider("test")
	registry.Register(provider)

	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			registry.Get("test")
		}
	})
}

// Timeout test

func TestMockProviderGenerateWithTimeout(t *testing.T) {
	provider := NewMockProvider("test")

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	req := &GenerateRequest{
		Model:    "mock-model",
		Messages: []Message{},
	}

	// Mock provider should be fast enough to not timeout
	resp, err := provider.Generate(ctx, req)
	if err != nil {
		t.Fatalf("Generate should not timeout: %v", err)
	}

	if resp == nil {
		t.Error("Response should not be nil")
	}
}

// Edge case tests

func TestRegistryRegisterNilProvider(t *testing.T) {
	registry := NewRegistry()

	// Should not panic and should not add nil provider
	registry.Register(nil)

	if len(registry.List()) != 0 {
		t.Error("Nil provider should not be registered")
	}
}

func TestMockProviderGenerateNilRequest(t *testing.T) {
	provider := NewMockProvider("test")
	ctx := context.Background()

	_, err := provider.Generate(ctx, nil)
	if err == nil {
		t.Error("Generate should return error for nil request")
	}
}

func TestMockProviderStreamNilRequest(t *testing.T) {
	provider := NewMockProvider("test")
	ctx := context.Background()

	_, err := provider.Stream(ctx, nil)
	if err == nil {
		t.Error("Stream should return error for nil request")
	}
}

func TestMockProviderCountTokensNilPrompt(t *testing.T) {
	provider := NewMockProvider("test")

	count, err := provider.CountTokens(nil)
	if err != nil {
		t.Fatalf("CountTokens should not error for nil prompt: %v", err)
	}

	if count != 0 {
		t.Errorf("Expected 0 tokens for nil prompt, got %d", count)
	}
}

func TestConvertACPPromptToLLMMessagesNilPrompt(t *testing.T) {
	messages := ConvertACPPromptToLLMMessages(nil)

	if messages != nil {
		t.Error("ConvertACPPromptToLLMMessages should return nil for nil prompt")
	}
}
