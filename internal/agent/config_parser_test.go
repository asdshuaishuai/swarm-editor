package agent

import (
	"os"
	"testing"
)

func TestJSONConfigParser_Format(t *testing.T) {
	p := &JSONConfigParser{}
	if got := p.Format(); got != "json" {
		t.Errorf("expected json, got %s", got)
	}
}

func TestJSONConfigParser_Parse(t *testing.T) {
	t.Run("valid full config", func(t *testing.T) {
		f := writeTestFile(t, `{"model":"claude-3","provider":"anthropic","baseUrl":"https://api.anthropic.com","maxOutputTokens":4096}`)
		parser := &JSONConfigParser{}
		cfg, err := parser.Parse(f)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if cfg.Model != "claude-3" {
			t.Errorf("expected model claude-3, got %s", cfg.Model)
		}
		if cfg.Provider != "anthropic" {
			t.Errorf("expected provider anthropic, got %s", cfg.Provider)
		}
		if cfg.BaseURL != "https://api.anthropic.com" {
			t.Errorf("expected base URL, got %s", cfg.BaseURL)
		}
		if cfg.MaxTokens != 4096 {
			t.Errorf("expected maxTokens 4096, got %d", cfg.MaxTokens)
		}
		if cfg.Raw == nil {
			t.Error("expected raw map to be populated")
		}
	})

	t.Run("extracts common fields from env (fallback)", func(t *testing.T) {
		// Model is a number, causing Unmarshal to fail and triggering extractCommonFields
		f := writeTestFile(t, `{"model":123,"env":{"ANTHROPIC_MODEL":"claude-3-5","ANTHROPIC_BASE_URL":"https://custom.url"}}`)
		parser := &JSONConfigParser{}
		cfg, err := parser.Parse(f)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if cfg.Model != "claude-3-5" {
			t.Errorf("expected model claude-3-5, got %q", cfg.Model)
		}
		if cfg.BaseURL != "https://custom.url" {
			t.Errorf("expected base URL https://custom.url, got %q", cfg.BaseURL)
		}
	})

	t.Run("extracts generic model field", func(t *testing.T) {
		f := writeTestFile(t, `{"model":"gpt-4","provider":"openai"}`)
		parser := &JSONConfigParser{}
		cfg, err := parser.Parse(f)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if cfg.Model != "gpt-4" {
			t.Errorf("expected model gpt-4, got %s", cfg.Model)
		}
	})

	t.Run("extracts from providers format (fallback)", func(t *testing.T) {
		// model is a non-string type to force fallback path
		f := writeTestFile(t, `{"model":[],"providers":{"openai":{"base_url":"https://api.openai.com/v1"}}}`)
		parser := &JSONConfigParser{}
		cfg, err := parser.Parse(f)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if cfg.Provider != "openai" {
			t.Errorf("expected provider openai, got %q", cfg.Provider)
		}
		if cfg.BaseURL != "https://api.openai.com/v1" {
			t.Errorf("expected base URL, got %q", cfg.BaseURL)
		}
	})

	t.Run("file not found", func(t *testing.T) {
		parser := &JSONConfigParser{}
		_, err := parser.Parse("/nonexistent/path.json")
		if err == nil {
			t.Error("expected error for nonexistent file")
		}
	})

	t.Run("invalid JSON", func(t *testing.T) {
		f := writeTestFile(t, `{invalid json}`)
		parser := &JSONConfigParser{}
		_, err := parser.Parse(f)
		if err == nil {
			t.Error("expected error for invalid JSON")
		}
	})
}

func TestTOMLConfigParser_Format(t *testing.T) {
	p := &TOMLConfigParser{}
	if got := p.Format(); got != "toml" {
		t.Errorf("expected toml, got %s", got)
	}
}

func TestTOMLConfigParser_Parse(t *testing.T) {
	t.Run("root level default_model", func(t *testing.T) {
		f := writeTestFile(t, `default_model = "kimi"`)
		parser := &TOMLConfigParser{}
		cfg, err := parser.Parse(f)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if cfg.Model != "kimi" {
			t.Errorf("expected model kimi, got %s", cfg.Model)
		}
	})

	t.Run("models section", func(t *testing.T) {
		f := writeTestFile(t, `
[models.kimi]
provider = "anthropic"
model = "kimi-k2.5"
`)
		parser := &TOMLConfigParser{}
		cfg, err := parser.Parse(f)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		// [models.kimi] sets model to "kimi", then model="kimi-k2.5" overrides it
		if cfg.Model != "kimi-k2.5" {
			t.Errorf("expected model kimi-k2.5, got %s", cfg.Model)
		}
		if cfg.Provider != "anthropic" {
			t.Errorf("expected provider anthropic, got %s", cfg.Provider)
		}
	})

	t.Run("providers section with base_url", func(t *testing.T) {
		f := writeTestFile(t, `
[providers.anthropic]
base_url = "https://api.anthropic.com"
`)
		parser := &TOMLConfigParser{}
		cfg, err := parser.Parse(f)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if cfg.Provider != "anthropic" {
			t.Errorf("expected provider anthropic, got %s", cfg.Provider)
		}
		if cfg.BaseURL != "https://api.anthropic.com" {
			t.Errorf("expected base URL, got %s", cfg.BaseURL)
		}
	})

	t.Run("skips comments and empty lines", func(t *testing.T) {
		f := writeTestFile(t, `
# This is a comment
default_model = "test"

`)
		parser := &TOMLConfigParser{}
		cfg, err := parser.Parse(f)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if cfg.Model != "test" {
			t.Errorf("expected model test, got %s", cfg.Model)
		}
	})

	t.Run("file not found", func(t *testing.T) {
		parser := &TOMLConfigParser{}
		_, err := parser.Parse("/nonexistent/path.toml")
		if err == nil {
			t.Error("expected error for nonexistent file")
		}
	})
}

func TestGetParserForFile(t *testing.T) {
	tests := []struct {
		path     string
		expected string
	}{
		{"config.json", "json"},
		{"config.JSON", "json"}, // case insensitive
		{"config.toml", "toml"},
		{"config.TOML", "toml"},
		{"config.yml", ""},     // nil for yaml
		{"config.yaml", ""},    // nil for yaml
		{"config.txt", "json"}, // default to json
		{"noext", "json"},      // no extension defaults to json
	}
	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			parser := GetParserForFile(tt.path)
			if tt.expected == "" {
				if parser != nil {
					t.Errorf("expected nil parser for %s, got %T", tt.path, parser)
				}
				return
			}
			if parser == nil {
				t.Fatalf("expected parser for %s, got nil", tt.path)
			}
			if parser.Format() != tt.expected {
				t.Errorf("expected format %s, got %s", tt.expected, parser.Format())
			}
		})
	}
}

func TestParseAgentConfig_Unsupported(t *testing.T) {
	f := writeTestFile(t, `key: value`)
	defer os.Remove(f)
	// Rename to .yml
	ymlPath := f + ".yml"
	if err := os.Rename(f, ymlPath); err != nil {
		t.Fatalf("rename: %v", err)
	}
	defer os.Remove(ymlPath)

	_, err := ParseAgentConfig(ymlPath)
	if err == nil {
		t.Error("expected error for unsupported format")
	}
}

func TestParseAgentConfig_JSON(t *testing.T) {
	f := writeTestFile(t, `{"model":"test-model"}`)
	defer os.Remove(f)

	cfg, err := ParseAgentConfig(f)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Model != "test-model" {
		t.Errorf("expected model test-model, got %s", cfg.Model)
	}
}

// writeTestFile creates a temp file with content and returns its path
func writeTestFile(t *testing.T, content string) string {
	t.Helper()
	f, err := os.CreateTemp("", "config_test_*")
	if err != nil {
		t.Fatalf("create temp file: %v", err)
	}
	t.Cleanup(func() { os.Remove(f.Name()) })
	if _, err := f.WriteString(content); err != nil {
		t.Fatalf("write temp file: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("close temp file: %v", err)
	}
	return f.Name()
}
