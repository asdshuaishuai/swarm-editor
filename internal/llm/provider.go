// Package llm provides LLM provider integrations
package llm

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
)

// Provider defines the interface for LLM providers
type Provider interface {
	// Name returns the provider name
	Name() string

	// Generate generates a response for the given prompt
	Generate(ctx context.Context, req *GenerateRequest) (*GenerateResponse, error)

	// Stream generates a streaming response
	Stream(ctx context.Context, req *GenerateRequest) (<-chan StreamChunk, error)

	// CountTokens counts tokens in a prompt
	CountTokens(prompt acp.Prompt) (int, error)

	// GetCapabilities returns the model capabilities
	GetCapabilities() ModelCapabilities
}

// GenerateRequest represents a generation request
type GenerateRequest struct {
	Model         string         `json:"model"`
	Messages      []Message      `json:"messages"`
	MaxTokens     int            `json:"maxTokens,omitempty"`
	Temperature   float64        `json:"temperature,omitempty"`
	TopP          float64        `json:"topP,omitempty"`
	StopSequences []string       `json:"stopSequences,omitempty"`
	Tools         []Tool         `json:"tools,omitempty"`
	System        string         `json:"system,omitempty"`
	Metadata      map[string]any `json:"metadata,omitempty"`
}

// Message represents a chat message
type Message struct {
	Role    string         `json:"role"` // "system", "user", "assistant"
	Content []ContentBlock `json:"content"`
}

// ContentBlock represents content in a message
type ContentBlock struct {
	Type       string         `json:"type"` // "text", "image", "tool_use", "tool_result"
	Text       string         `json:"text,omitempty"`
	Source     *ContentSource `json:"source,omitempty"`
	ToolUse    *ToolUse       `json:"toolUse,omitempty"`
	ToolResult *ToolResult    `json:"toolResult,omitempty"`
}

// ContentSource represents content source (e.g., image)
type ContentSource struct {
	Type      string `json:"type"` // "base64"
	MediaType string `json:"mediaType"`
	Data      string `json:"data"`
}

// ToolUse represents a tool use request
type ToolUse struct {
	ID    string          `json:"id"`
	Name  string          `json:"name"`
	Input json.RawMessage `json:"input"`
}

// ToolResult represents a tool execution result
type ToolResult struct {
	ToolUseID string          `json:"toolUseId"`
	Content   json.RawMessage `json:"content"`
	IsError   bool            `json:"isError,omitempty"`
}

// Tool represents an available tool
type Tool struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	InputSchema json.RawMessage `json:"inputSchema"`
}

// GenerateResponse represents a generation response
type GenerateResponse struct {
	ID         string         `json:"id"`
	Model      string         `json:"model"`
	Content    []ContentBlock `json:"content"`
	StopReason string         `json:"stopReason"`
	Usage      Usage          `json:"usage"`
}

// Usage represents token usage
type Usage struct {
	InputTokens  int `json:"inputTokens"`
	OutputTokens int `json:"outputTokens"`
}

// StreamChunk represents a chunk in streaming response
type StreamChunk struct {
	Type  string        `json:"type"` // "content_block_delta", "message_stop", "error"
	Delta *ContentDelta `json:"delta,omitempty"`
	Error error         `json:"error,omitempty"`
}

// ContentDelta represents a content delta
type ContentDelta struct {
	Type string `json:"type"` // "text_delta"
	Text string `json:"text,omitempty"`
}

// ModelCapabilities describes model capabilities
type ModelCapabilities struct {
	SupportsVision    bool     `json:"supportsVision"`
	SupportsTools     bool     `json:"supportsTools"`
	SupportsStreaming bool     `json:"supportsStreaming"`
	MaxTokens         int      `json:"maxTokens"`
	SupportedModels   []string `json:"supportedModels"`
}

// Registry manages LLM providers
type Registry struct {
	mu        sync.RWMutex
	providers map[string]Provider
	def       string
}

// NewRegistry creates a new provider registry
func NewRegistry() *Registry {
	return &Registry{
		providers: make(map[string]Provider),
	}
}

// Register registers a provider
func (r *Registry) Register(provider Provider) {
	if provider == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.providers[provider.Name()] = provider
	if r.def == "" {
		r.def = provider.Name()
	}
}

// Get retrieves a provider by name
func (r *Registry) Get(name string) (Provider, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	provider, ok := r.providers[name]
	return provider, ok
}

// GetDefault returns the default provider
func (r *Registry) GetDefault() Provider {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.def == "" {
		return nil
	}
	return r.providers[r.def]
}

// SetDefault sets the default provider
func (r *Registry) SetDefault(name string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.providers[name]; !ok {
		return fmt.Errorf("provider not found: %s", name)
	}
	r.def = name
	return nil
}

// List returns all registered providers
func (r *Registry) List() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]string, 0, len(r.providers))
	for name := range r.providers {
		result = append(result, name)
	}
	return result
}

// MockProvider is a mock implementation for testing
type MockProvider struct {
	name         string
	capabilities ModelCapabilities
	responses    []string
	responseIdx  int
}

// NewMockProvider creates a new mock provider
func NewMockProvider(name string) *MockProvider {
	return &MockProvider{
		name: name,
		capabilities: ModelCapabilities{
			SupportsVision:    true,
			SupportsTools:     true,
			SupportsStreaming: true,
			MaxTokens:         4096,
			SupportedModels:   []string{"mock-model"},
		},
		responses: []string{
			"I understand. Let me help you with that.",
			"Here's my analysis of your request.",
			"I'll proceed with the task as requested.",
		},
	}
}

// Name returns the provider name
func (p *MockProvider) Name() string {
	return p.name
}

// Generate generates a mock response
func (p *MockProvider) Generate(ctx context.Context, req *GenerateRequest) (*GenerateResponse, error) {
	if req == nil {
		return nil, fmt.Errorf("request cannot be nil")
	}
	response := p.responses[p.responseIdx]
	p.responseIdx = (p.responseIdx + 1) % len(p.responses)

	return &GenerateResponse{
		ID:    fmt.Sprintf("mock_%d", p.responseIdx),
		Model: req.Model,
		Content: []ContentBlock{
			{Type: "text", Text: response},
		},
		StopReason: "end_turn",
		Usage: Usage{
			InputTokens:  100,
			OutputTokens: 50,
		},
	}, nil
}

// Stream generates a mock streaming response
func (p *MockProvider) Stream(ctx context.Context, req *GenerateRequest) (<-chan StreamChunk, error) {
	if req == nil {
		return nil, fmt.Errorf("request cannot be nil")
	}
	ch := make(chan StreamChunk, 10)

	go func() {
		defer close(ch)
		response := p.responses[p.responseIdx]
		p.responseIdx = (p.responseIdx + 1) % len(p.responses)

		// Simulate streaming
		for i, char := range response {
			select {
			case <-ctx.Done():
				ch <- StreamChunk{Error: ctx.Err()}
				return
			default:
				ch <- StreamChunk{
					Type: "content_block_delta",
					Delta: &ContentDelta{
						Type: "text_delta",
						Text: string(char),
					},
				}
			}
			// Small delay to simulate streaming
			if i%5 == 0 {
				time.Sleep(10 * time.Millisecond)
			}
		}
		ch <- StreamChunk{Type: "message_stop"}
	}()

	return ch, nil
}

// CountTokens returns a mock token count
func (p *MockProvider) CountTokens(prompt acp.Prompt) (int, error) {
	if prompt == nil {
		return 0, nil
	}
	count := 0
	for _, block := range prompt {
		if block.Type == "text" {
			count += len(block.Text) / 4 // Rough estimate
		}
	}
	return count, nil
}

// GetCapabilities returns mock capabilities
func (p *MockProvider) GetCapabilities() ModelCapabilities {
	return p.capabilities
}

// ConvertACPPromptToLLMMessages converts ACP prompt to LLM messages
func ConvertACPPromptToLLMMessages(prompt acp.Prompt) []Message {
	if prompt == nil {
		return nil
	}
	messages := make([]Message, 0, len(prompt))

	for _, block := range prompt {
		content := ContentBlock{}

		switch block.Type {
		case "text":
			content.Type = "text"
			content.Text = block.Text

		case "image":
			content.Type = "image"
			if block.Image != nil {
				content.Source = &ContentSource{
					Type:      "base64",
					MediaType: block.Image.MimeType,
					Data:      block.Image.Data,
				}
			}

		case "resource":
			content.Type = "text"
			if block.Resource != nil {
				content.Text = block.Resource.Text
			}
		}

		messages = append(messages, Message{
			Role:    "user",
			Content: []ContentBlock{content},
		})
	}

	return messages
}

// ToolManager manages tool definitions
type ToolManager struct {
	mu    sync.RWMutex
	tools map[string]Tool
}

// NewToolManager creates a new tool manager
func NewToolManager() *ToolManager {
	return &ToolManager{
		tools: make(map[string]Tool),
	}
}

// Register registers a tool
func (tm *ToolManager) Register(tool Tool) {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	tm.tools[tool.Name] = tool
}

// Get retrieves a tool by name
func (tm *ToolManager) Get(name string) (Tool, bool) {
	tm.mu.RLock()
	defer tm.mu.RUnlock()
	tool, ok := tm.tools[name]
	return tool, ok
}

// List returns all registered tools
func (tm *ToolManager) List() []Tool {
	tm.mu.RLock()
	defer tm.mu.RUnlock()
	result := make([]Tool, 0, len(tm.tools))
	for _, tool := range tm.tools {
		result = append(result, tool)
	}
	return result
}

// GetToolsForPrompt returns tools formatted for LLM prompt
func (tm *ToolManager) GetToolsForPrompt() []Tool {
	return tm.List()
}

// ExecuteTool executes a tool by name
func (tm *ToolManager) ExecuteTool(ctx context.Context, name string, input json.RawMessage) (json.RawMessage, error) {
	// Tool execution would be implemented by the actual tool handlers
	return json.RawMessage(`{"status": "executed"}`), nil
}

// DefaultTools returns the default set of tools
func DefaultTools() []Tool {
	return []Tool{
		{
			Name:        "read_file",
			Description: "Read the contents of a file",
			InputSchema: json.RawMessage(`{"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}`),
		},
		{
			Name:        "write_file",
			Description: "Write content to a file",
			InputSchema: json.RawMessage(`{"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]}`),
		},
		{
			Name:        "execute_command",
			Description: "Execute a shell command",
			InputSchema: json.RawMessage(`{"type": "object", "properties": {"command": {"type": "string"}, "args": {"type": "array", "items": {"type": "string"}}}, "required": ["command"]}`),
		},
		{
			Name:        "search_code",
			Description: "Search for code patterns",
			InputSchema: json.RawMessage(`{"type": "object", "properties": {"pattern": {"type": "string"}, "path": {"type": "string"}}, "required": ["pattern"]}`),
		},
		{
			Name:        "list_directory",
			Description: "List contents of a directory",
			InputSchema: json.RawMessage(`{"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}`),
		},
	}
}
