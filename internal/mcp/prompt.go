// Package mcp provides MCP (Model Context Protocol) integration
package mcp

import (
	"context"
	"strings"
	"sync"
	"text/template"
)

// Prompt represents an MCP prompt template
type Prompt struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Arguments   []PromptArg    `json:"arguments"`
	Template    string         `json:"-"`
	Handler     PromptHandler  `json:"-"`
}

// PromptArg represents a prompt argument
type PromptArg struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Required    bool   `json:"required"`
}

// PromptMessage represents a message in a prompt
type PromptMessage struct {
	Role    string      `json:"role"`
	Content MessageContent `json:"content"`
}

// MessageContent represents the content of a message
type MessageContent struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	ImageURL string `json:"imageUrl,omitempty"`
}

// PromptHandler is a function that generates prompt messages
type PromptHandler func(ctx context.Context, args map[string]string) ([]PromptMessage, error)

// PromptManager manages MCP prompts
type PromptManager struct {
	mu      sync.RWMutex
	prompts map[string]*Prompt
}

// NewPromptManager creates a new prompt manager
func NewPromptManager() *PromptManager {
	return &PromptManager{
		prompts: make(map[string]*Prompt),
	}
}

// RegisterPrompt registers a prompt template
func (pm *PromptManager) RegisterPrompt(prompt *Prompt) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	pm.prompts[prompt.Name] = prompt
	return nil
}

// UnregisterPrompt removes a prompt
func (pm *PromptManager) UnregisterPrompt(name string) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	delete(pm.prompts, name)
}

// ListPrompts lists all available prompts
func (pm *PromptManager) ListPrompts() []Prompt {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	prompts := make([]Prompt, 0, len(pm.prompts))
	for _, p := range pm.prompts {
		prompts = append(prompts, *p)
	}
	return prompts
}

// GetPrompt gets a prompt by name
func (pm *PromptManager) GetPrompt(name string) (*Prompt, bool) {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	p, ok := pm.prompts[name]
	if !ok {
		return nil, false
	}
	return p, true
}

// ExecutePrompt executes a prompt with arguments
func (pm *PromptManager) ExecutePrompt(ctx context.Context, name string, args map[string]string) ([]PromptMessage, error) {
	pm.mu.RLock()
	prompt, ok := pm.prompts[name]
	pm.mu.RUnlock()

	if !ok {
		return nil, ErrPromptNotFound
	}

	// Validate required arguments
	for _, arg := range prompt.Arguments {
		if arg.Required {
			if _, ok := args[arg.Name]; !ok {
				return nil, &MCPError{
					Code:    -6,
					Message: "missing required argument: " + arg.Name,
				}
			}
		}
	}

	// Use handler if available
	if prompt.Handler != nil {
		return prompt.Handler(ctx, args)
	}

	// Use template if available
	if prompt.Template != "" {
		return pm.executeTemplate(prompt, args)
	}

	return nil, ErrPromptNotExecutable
}

// executeTemplate executes a text template
func (pm *PromptManager) executeTemplate(prompt *Prompt, args map[string]string) ([]PromptMessage, error) {
	tmpl, err := template.New(prompt.Name).Parse(prompt.Template)
	if err != nil {
		return nil, err
	}

	var buf strings.Builder
	if err := tmpl.Execute(&buf, args); err != nil {
		return nil, err
	}

	return []PromptMessage{
		{
			Role: "user",
			Content: MessageContent{
				Type: "text",
				Text: buf.String(),
			},
		},
	}, nil
}

// ErrPromptNotFound indicates prompt not found
var ErrPromptNotFound = &MCPError{Code: -5, Message: "prompt not found"}

// ErrPromptNotExecutable indicates prompt cannot be executed
var ErrPromptNotExecutable = &MCPError{Code: -7, Message: "prompt not executable"}

// Built-in prompts

// CodeReviewPrompt is a built-in code review prompt
var CodeReviewPrompt = &Prompt{
	Name:        "code-review",
	Description: "Review code for quality, security, and best practices",
	Arguments: []PromptArg{
		{Name: "code", Description: "Code to review", Required: true},
		{Name: "language", Description: "Programming language", Required: false},
		{Name: "focus", Description: "Focus area (security, performance, style)", Required: false},
	},
	Template: `Please review the following code:
` + "```{{.language}}" + `
{{.code}}
` + "```" + `

{{if .focus}}Focus on: {{.focus}}{{end}}

Provide feedback on:
1. Code quality and readability
2. Potential bugs or issues
3. Security vulnerabilities
4. Performance considerations
5. Suggestions for improvement`,
}

// TestGenerationPrompt is a built-in test generation prompt
var TestGenerationPrompt = &Prompt{
	Name:        "generate-tests",
	Description: "Generate unit tests for code",
	Arguments: []PromptArg{
		{Name: "code", Description: "Code to test", Required: true},
		{Name: "framework", Description: "Test framework (jest, go test, pytest)", Required: false},
	},
	Template: `Generate comprehensive unit tests for the following code:
` + "```{{.language}}" + `
{{.code}}
` + "```" + `

{{if .framework}}Using {{.framework}} test framework{{end}}

Include:
1. Happy path tests
2. Edge cases
3. Error handling tests
4. Mock external dependencies if needed`,
}

// DocumentCodePrompt is a built-in documentation prompt
var DocumentCodePrompt = &Prompt{
	Name:        "document-code",
	Description: "Generate documentation for code",
	Arguments: []PromptArg{
		{Name: "code", Description: "Code to document", Required: true},
		{Name: "style", Description: "Documentation style (jsdoc, godoc, pydoc)", Required: false},
	},
	Template: `Generate documentation for the following code:
` + "```" + `
{{.code}}
` + "```" + `

{{if .style}}Use {{.style}} style{{end}}

Include:
1. Function/method descriptions
2. Parameter descriptions
3. Return value descriptions
4. Usage examples`,
}

// RegisterBuiltInPrompts registers all built-in prompts
func RegisterBuiltInPrompts(pm *PromptManager) {
	pm.RegisterPrompt(CodeReviewPrompt)
	pm.RegisterPrompt(TestGenerationPrompt)
	pm.RegisterPrompt(DocumentCodePrompt)
}
