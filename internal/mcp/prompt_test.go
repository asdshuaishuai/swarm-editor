package mcp

import (
	"context"
	"testing"
)

func TestNewPromptManager(t *testing.T) {
	pm := NewPromptManager()
	if pm == nil {
		t.Fatal("NewPromptManager returned nil")
	}
	if pm.prompts == nil {
		t.Error("prompts map not initialized")
	}
}

func TestRegisterPrompt(t *testing.T) {
	pm := NewPromptManager()
	prompt := &Prompt{
		Name:        "test-prompt",
		Description: "A test prompt",
		Arguments: []PromptArg{
			{Name: "input", Description: "Input text", Required: true},
		},
	}

	err := pm.RegisterPrompt(prompt)
	if err != nil {
		t.Errorf("RegisterPrompt failed: %v", err)
	}

	if len(pm.prompts) != 1 {
		t.Errorf("expected 1 prompt, got %d", len(pm.prompts))
	}
}

func TestUnregisterPrompt(t *testing.T) {
	pm := NewPromptManager()
	if err := pm.RegisterPrompt(&Prompt{Name: "test-prompt"}); err != nil {
		t.Fatalf("RegisterPrompt failed: %v", err)
	}
	pm.UnregisterPrompt("test-prompt")

	if len(pm.prompts) != 0 {
		t.Errorf("expected 0 prompts, got %d", len(pm.prompts))
	}
}

func TestListPrompts(t *testing.T) {
	pm := NewPromptManager()
	if err := pm.RegisterPrompt(&Prompt{Name: "prompt1"}); err != nil {
		t.Fatalf("RegisterPrompt failed: %v", err)
	}
	if err := pm.RegisterPrompt(&Prompt{Name: "prompt2"}); err != nil {
		t.Fatalf("RegisterPrompt failed: %v", err)
	}

	prompts := pm.ListPrompts()
	if len(prompts) != 2 {
		t.Errorf("expected 2 prompts, got %d", len(prompts))
	}
}

func TestGetPrompt(t *testing.T) {
	pm := NewPromptManager()
	if err := pm.RegisterPrompt(&Prompt{Name: "test-prompt"}); err != nil {
		t.Fatalf("RegisterPrompt failed: %v", err)
	}

	prompt, ok := pm.GetPrompt("test-prompt")
	if !ok {
		t.Error("expected to find prompt")
	}
	if prompt.Name != "test-prompt" {
		t.Errorf("expected name 'test-prompt', got %q", prompt.Name)
	}

	_, ok = pm.GetPrompt("nonexistent")
	if ok {
		t.Error("expected not to find nonexistent prompt")
	}
}

func TestExecutePromptNotFound(t *testing.T) {
	pm := NewPromptManager()

	_, err := pm.ExecutePrompt(context.Background(), "nonexistent", nil)
	if err != ErrPromptNotFound {
		t.Errorf("expected ErrPromptNotFound, got %v", err)
	}
}

func TestExecutePromptWithHandler(t *testing.T) {
	pm := NewPromptManager()
	prompt := &Prompt{
		Name: "handler-prompt",
		Handler: func(ctx context.Context, args map[string]string) ([]PromptMessage, error) {
			return []PromptMessage{
				{Role: "user", Content: MessageContent{Type: "text", Text: "Hello"}},
			}, nil
		},
	}
	if err := pm.RegisterPrompt(prompt); err != nil {
		t.Fatalf("RegisterPrompt failed: %v", err)
	}

	messages, err := pm.ExecutePrompt(context.Background(), "handler-prompt", nil)
	if err != nil {
		t.Errorf("ExecutePrompt failed: %v", err)
	}
	if len(messages) != 1 {
		t.Errorf("expected 1 message, got %d", len(messages))
	}
}

func TestExecutePromptMissingRequiredArg(t *testing.T) {
	pm := NewPromptManager()
	prompt := &Prompt{
		Name: "requires-input",
		Arguments: []PromptArg{
			{Name: "required", Required: true},
		},
	}
	if err := pm.RegisterPrompt(prompt); err != nil {
		t.Fatalf("RegisterPrompt failed: %v", err)
	}

	_, err := pm.ExecutePrompt(context.Background(), "requires-input", nil)
	if err == nil {
		t.Error("expected error for missing required argument")
	}
}

func TestExecutePromptWithTemplate(t *testing.T) {
	pm := NewPromptManager()
	prompt := &Prompt{
		Name:     "template-prompt",
		Template: "Hello, {{.name}}!",
		Arguments: []PromptArg{
			{Name: "name", Required: false},
		},
	}
	pm.RegisterPrompt(prompt)

	messages, err := pm.ExecutePrompt(context.Background(), "template-prompt", map[string]string{
		"name": "World",
	})
	if err != nil {
		t.Errorf("ExecutePrompt failed: %v", err)
	}
	if len(messages) != 1 {
		t.Errorf("expected 1 message, got %d", len(messages))
	}
	if messages[0].Content.Text != "Hello, World!" {
		t.Errorf("expected 'Hello, World!', got %q", messages[0].Content.Text)
	}
}

func TestRegisterBuiltInPrompts(t *testing.T) {
	pm := NewPromptManager()
	RegisterBuiltInPrompts(pm)

	prompts := pm.ListPrompts()
	if len(prompts) < 3 {
		t.Errorf("expected at least 3 built-in prompts, got %d", len(prompts))
	}

	// Check specific prompts exist
	expectedPrompts := []string{"code-review", "generate-tests", "document-code"}
	for _, name := range expectedPrompts {
		if _, ok := pm.GetPrompt(name); !ok {
			t.Errorf("expected built-in prompt %q not found", name)
		}
	}
}

func TestPromptArgStruct(t *testing.T) {
	arg := PromptArg{
		Name:        "test",
		Description: "Test argument",
		Required:    true,
	}

	if arg.Name != "test" {
		t.Errorf("expected name 'test', got %q", arg.Name)
	}
	if !arg.Required {
		t.Error("expected Required to be true")
	}
}

func TestPromptMessageStruct(t *testing.T) {
	msg := PromptMessage{
		Role: "user",
		Content: MessageContent{
			Type: "text",
			Text: "Hello",
		},
	}

	if msg.Role != "user" {
		t.Errorf("expected role 'user', got %q", msg.Role)
	}
	if msg.Content.Text != "Hello" {
		t.Errorf("expected text 'Hello', got %q", msg.Content.Text)
	}
}

// TestExecutePrompt_TemplateParseError tests that malformed templates return an error
func TestExecutePrompt_TemplateParseError(t *testing.T) {
	pm := NewPromptManager()
	prompt := &Prompt{
		Name:     "bad-template",
		Template: "{{.name", // Missing closing }}
	}
	if err := pm.RegisterPrompt(prompt); err != nil {
		t.Fatalf("RegisterPrompt failed: %v", err)
	}

	_, err := pm.ExecutePrompt(context.Background(), "bad-template", map[string]string{
		"name": "World",
	})
	if err == nil {
		t.Error("expected error from malformed template")
	}
}

// TestExecutePrompt_TemplateExecuteError tests template execution errors
func TestExecutePrompt_TemplateExecuteError(t *testing.T) {
	pm := NewPromptManager()
	// Template that references another undefined template
	prompt := &Prompt{
		Name:     "undefined-template-ref",
		Template: `{{template "nonexistent" .}}`,
	}
	if err := pm.RegisterPrompt(prompt); err != nil {
		t.Fatalf("RegisterPrompt failed: %v", err)
	}

	_, err := pm.ExecutePrompt(context.Background(), "undefined-template-ref", map[string]string{
		"name": "World",
	})
	if err == nil {
		t.Error("expected error from undefined template reference")
	}
}

// TestExecutePrompt_TemplateBadFieldAccess tests template with bad field access
func TestExecutePrompt_TemplateBadFieldAccess(t *testing.T) {
	pm := NewPromptManager()
	// Template that tries to call a method on a string
	prompt := &Prompt{
		Name:     "bad-method-call",
		Template: `{{.name.InvalidMethod}}`,
	}
	if err := pm.RegisterPrompt(prompt); err != nil {
		t.Fatalf("RegisterPrompt failed: %v", err)
	}

	// This should not error at parse time, but might fail at execute time
	// depending on how Go template handles missing methods
	_, err := pm.ExecutePrompt(context.Background(), "bad-method-call", map[string]string{
		"name": "World",
	})
	// Template execution may or may not error - just verify no panic
	if err != nil {
		t.Logf("Template execution error (expected for bad method): %v", err)
	}
}
