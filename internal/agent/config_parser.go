// Package agent provides configuration parsing for various agent CLIs
package agent

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// AgentConfig represents the parsed configuration from an agent CLI
type AgentConfig struct {
	Model       string            `json:"model"`
	Provider    string            `json:"provider"`
	BaseURL     string            `json:"baseUrl"`
	APIKey      string            `json:"apiKey,omitempty"`
	EnvVars     map[string]string `json:"envVars,omitempty"`
	MaxTokens   int               `json:"maxOutputTokens,omitempty"`
	MCP         *MCPConfig        `json:"mcp,omitempty"`
	CustomModel []*CustomModel    `json:"customModels,omitempty"`
	Raw         map[string]any    `json:"-"`
}

// MCPConfig represents MCP server configuration
type MCPConfig struct {
	Servers map[string]MCPServer `json:"servers,omitempty"`
}

// MCPServer represents a single MCP server configuration
type MCPServer struct {
	Type     string            `json:"type"`
	Command  []string          `json:"command,omitempty"`
	Args     []string          `json:"args,omitempty"`
	URL      string            `json:"url,omitempty"`
	Headers  map[string]string `json:"headers,omitempty"`
	Env      map[string]string `json:"env,omitempty"`
	Disabled bool              `json:"disabled"`
}

// CustomModel represents a custom model configuration
type CustomModel struct {
	DisplayName    string `json:"displayName"`
	Model          string `json:"model"`
	BaseURL        string `json:"baseUrl"`
	APIKey         string `json:"apiKey"`
	Provider       string `json:"provider"`
	MaxOutputToken int    `json:"maxOutputTokens"`
}

// ConfigParser defines the interface for parsing agent configs
type ConfigParser interface {
	Parse(path string) (*AgentConfig, error)
	Format() string
}

// JSONConfigParser parses JSON configuration files
type JSONConfigParser struct{}

func (p *JSONConfigParser) Format() string {
	return "json"
}

func (p *JSONConfigParser) Parse(path string) (*AgentConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	// Parse as raw map first
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %w", err)
	}

	config := &AgentConfig{
		EnvVars: make(map[string]string),
		Raw:     raw,
	}

	// Try to parse as full AgentConfig
	if err := json.Unmarshal(data, config); err != nil {
		// If that fails, try to extract common fields
		p.extractCommonFields(raw, config)
	}

	return config, nil
}

// extractCommonFields extracts common configuration fields from various agent formats
func (p *JSONConfigParser) extractCommonFields(raw map[string]any, config *AgentConfig) {
	// Claude Code format: env.ANTHROPIC_MODEL
	if env, ok := raw["env"].(map[string]any); ok {
		if model, ok := env["ANTHROPIC_MODEL"].(string); ok {
			config.Model = model
		}
		if baseURL, ok := env["ANTHROPIC_BASE_URL"].(string); ok {
			config.BaseURL = baseURL
		}
	}

	// Generic model field
	if model, ok := raw["model"].(string); ok && config.Model == "" {
		config.Model = model
	}

	// Provider field
	if provider, ok := raw["provider"].(string); ok {
		config.Provider = provider
	}

	// Crush/OpenCode provider format
	if providers, ok := raw["providers"].(map[string]any); ok {
		for name, p := range providers {
			if providerConfig, ok := p.(map[string]any); ok {
				config.Provider = name
				if baseURL, ok := providerConfig["base_url"].(string); ok {
					config.BaseURL = baseURL
				}
				break
			}
		}
	}
}

// TOMLConfigParser parses TOML configuration files (for Kimi Code)
type TOMLConfigParser struct{}

func (p *TOMLConfigParser) Format() string {
	return "toml"
}

func (p *TOMLConfigParser) Parse(path string) (*AgentConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	config := &AgentConfig{
		EnvVars: make(map[string]string),
		Raw:     make(map[string]any),
	}

	// Simple TOML parsing for Kimi Code format
	// Format:
	// default_model = "kimi"
	// [models.kimi]
	// provider = "anthropic"
	// model = "kimi-k2.5"
	// [providers.anthropic]
	// base_url = "http://..."
	// api_key = "sk-xxx"

	content := string(data)
	lines := strings.Split(content, "\n")

	var currentSection string
	var currentProvider string

	for _, line := range lines {
		line = strings.TrimSpace(line)

		// Skip empty lines and comments
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// Section header [section.subsection]
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			section := strings.Trim(line, "[]")
			parts := strings.Split(section, ".")

			if len(parts) >= 1 {
				currentSection = parts[0]
				if len(parts) >= 2 {
					if parts[0] == "providers" {
						currentProvider = parts[1]
					} else if parts[0] == "models" {
						config.Model = parts[1]
					}
				}
			}
			continue
		}

		// Key = value
		if strings.Contains(line, "=") {
			parts := strings.SplitN(line, "=", 2)
			if len(parts) != 2 {
				continue
			}

			key := strings.TrimSpace(parts[0])
			value := strings.Trim(strings.TrimSpace(parts[1]), "\"'")

			switch currentSection {
			case "":
				// Root level
				if key == "default_model" {
					config.Model = value
				}
			case "providers":
				if currentProvider != "" {
					config.Provider = currentProvider
					if key == "base_url" {
						config.BaseURL = value
					}
				}
			case "models":
				if key == "provider" {
					config.Provider = value
				} else if key == "model" {
					config.Model = value
				}
			}
		}
	}

	return config, nil
}

// GetParserForFile returns the appropriate parser for a config file
func GetParserForFile(path string) ConfigParser {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".json":
		return &JSONConfigParser{}
	case ".toml":
		return &TOMLConfigParser{}
	case ".yml", ".yaml":
		// YAML support could be added
		return nil
	default:
		// Try JSON as default
		return &JSONConfigParser{}
	}
}

// ParseAgentConfig parses an agent configuration file
func ParseAgentConfig(path string) (*AgentConfig, error) {
	parser := GetParserForFile(path)
	if parser == nil {
		return nil, fmt.Errorf("unsupported config format: %s", filepath.Ext(path))
	}
	return parser.Parse(path)
}
