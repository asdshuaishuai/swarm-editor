package acp

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sync"
)

// getConfigDir returns the configuration directory, with fallback for missing HOME
func getConfigDir() string {
	home := os.Getenv("HOME")
	if home == "" {
		// Fallback to current directory if HOME is not set
		if cwd, err := os.Getwd(); err == nil {
			return filepath.Join(cwd, ".swarm-editor")
		}
		return ".swarm-editor"
	}
	return filepath.Join(home, ".swarm-editor")
}

// ConfigDir is the default directory for ACP configuration
var ConfigDir = getConfigDir()

// ConfigFile is the main configuration file name
const ConfigFile = "agents.json"

// AgentConfig represents configuration for a single ACP agent
type AgentConfig struct {
	// Basic info
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Enabled     bool   `json:"enabled"`

	// Connection settings
	Command string            `json:"command"` // Executable path
	Args    []string          `json:"args,omitempty"`
	Env     map[string]string `json:"env,omitempty"`

	// MCP settings
	MCPSettings MCPSettings `json:"mcpSettings"`

	// Capabilities
	ExpectedCapabilities AgentCapabilities `json:"expectedCapabilities,omitempty"`

	// Swarm settings
	SwarmConfig *AgentSwarmConfig `json:"swarmConfig,omitempty"`

	// Metadata
	Tags    []string `json:"tags,omitempty"`
	Timeout int      `json:"timeout,omitempty"` // seconds
}

// MCPSettings configures MCP server exposure
type MCPSettings struct {
	UseCustomMCP     bool              `json:"useCustomMcp"`
	UseEditorMCP     bool              `json:"useEditorMcp"`
	AllowedTools     []string          `json:"allowedTools,omitempty"`
	CustomMCPServers []MCPServerConfig `json:"customMcpServers,omitempty"`
}

// MCPServerConfig represents a custom MCP server configuration
type MCPServerConfig struct {
	Name    string            `json:"name"`
	Command string            `json:"command"`
	Args    []string          `json:"args,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
}

// AgentSwarmConfig configures swarm behavior for this agent
type AgentSwarmConfig struct {
	CanBeCoordinator bool     `json:"canBeCoordinator"`
	CanBeWorker      bool     `json:"canBeWorker"`
	PreferredRoles   []string `json:"preferredRoles,omitempty"` // "coder", "reviewer", "tester"
	MaxConcurrent    int      `json:"maxConcurrent,omitempty"`
	Priority         int      `json:"priority,omitempty"` // Higher = more priority for tasks
}

// Config represents the full ACP configuration
type Config struct {
	mu sync.RWMutex

	// Global settings
	DefaultMCPSettings MCPSettings `json:"defaultMcpSettings"`

	// Agent configurations
	Agents map[string]*AgentConfig `json:"agents"`

	// Connection pool settings
	MaxConnections int `json:"maxConnections"`
	ConnectTimeout int `json:"connectTimeout"`

	// Swarm defaults
	DefaultSwarmConfig *DefaultSwarmSettings `json:"defaultSwarmConfig,omitempty"`
}

// DefaultSwarmSettings defines default swarm behavior
type DefaultSwarmSettings struct {
	DefaultTopology    string  `json:"defaultTopology"`
	DefaultStrategy    string  `json:"defaultStrategy"`
	ConsensusThreshold float64 `json:"consensusThreshold"`
	TaskTimeout        int     `json:"taskTimeout"`
	MaxRetries         int     `json:"maxRetries"`
}

// NewConfig creates a new configuration with defaults
func NewConfig() *Config {
	return &Config{
		DefaultMCPSettings: MCPSettings{
			UseCustomMCP: true,
			UseEditorMCP: false,
		},
		Agents:         make(map[string]*AgentConfig),
		MaxConnections: 10,
		ConnectTimeout: 30,
		DefaultSwarmConfig: &DefaultSwarmSettings{
			DefaultTopology:    "star",
			DefaultStrategy:    "parallel",
			ConsensusThreshold: 0.6,
			TaskTimeout:        300,
			MaxRetries:         3,
		},
	}
}

// LoadConfig loads configuration from file
func LoadConfig(path string) (*Config, error) {
	if path == "" {
		path = filepath.Join(ConfigDir, ConfigFile)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			// Create default config
			cfg := NewConfig()
			if saveErr := cfg.Save(path); saveErr != nil {
				return nil, fmt.Errorf("failed to create default config: %w", saveErr)
			}
			return cfg, nil
		}
		return nil, fmt.Errorf("failed to read config: %w", err)
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config: %w", err)
	}

	if cfg.Agents == nil {
		cfg.Agents = make(map[string]*AgentConfig)
	}

	return &cfg, nil
}

// Save saves configuration to file
func (c *Config) Save(path string) error {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if path == "" {
		path = filepath.Join(ConfigDir, ConfigFile)
	}

	// Ensure directory exists with restricted permissions
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	// Write with restricted permissions (owner read/write only)
	return os.WriteFile(path, data, 0600)
}

// AddAgent adds an agent configuration
func (c *Config) AddAgent(agent *AgentConfig) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if agent.ID == "" {
		return fmt.Errorf("agent ID is required")
	}

	if _, exists := c.Agents[agent.ID]; exists {
		return fmt.Errorf("agent %s already exists", agent.ID)
	}

	c.Agents[agent.ID] = agent
	return nil
}

// RemoveAgent removes an agent configuration
func (c *Config) RemoveAgent(id string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if _, exists := c.Agents[id]; !exists {
		return fmt.Errorf("agent %s not found", id)
	}

	delete(c.Agents, id)
	return nil
}

// GetAgent retrieves an agent configuration
func (c *Config) GetAgent(id string) (*AgentConfig, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	agent, ok := c.Agents[id]
	return agent, ok
}

// ListAgents returns all agent configurations
func (c *Config) ListAgents() []*AgentConfig {
	c.mu.RLock()
	defer c.mu.RUnlock()

	result := make([]*AgentConfig, 0, len(c.Agents))
	for _, agent := range c.Agents {
		result = append(result, agent)
	}
	return result
}

// ListEnabledAgents returns all enabled agent configurations
func (c *Config) ListEnabledAgents() []*AgentConfig {
	c.mu.RLock()
	defer c.mu.RUnlock()

	result := make([]*AgentConfig, 0)
	for _, agent := range c.Agents {
		if agent.Enabled {
			result = append(result, agent)
		}
	}
	return result
}

// UpdateAgent updates an agent configuration
func (c *Config) UpdateAgent(agent *AgentConfig) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if agent.ID == "" {
		return fmt.Errorf("agent ID is required")
	}

	if _, exists := c.Agents[agent.ID]; !exists {
		return fmt.Errorf("agent %s not found", agent.ID)
	}

	c.Agents[agent.ID] = agent
	return nil
}

// GetAgentsByTag returns agents matching a tag
func (c *Config) GetAgentsByTag(tag string) []*AgentConfig {
	c.mu.RLock()
	defer c.mu.RUnlock()

	result := make([]*AgentConfig, 0)
	for _, agent := range c.Agents {
		for _, t := range agent.Tags {
			if t == tag {
				result = append(result, agent)
				break
			}
		}
	}
	return result
}

// GetAgentsByRole returns agents with a preferred role
func (c *Config) GetAgentsByRole(role string) []*AgentConfig {
	c.mu.RLock()
	defer c.mu.RUnlock()

	result := make([]*AgentConfig, 0)
	for _, agent := range c.Agents {
		if agent.SwarmConfig != nil {
			for _, r := range agent.SwarmConfig.PreferredRoles {
				if r == role {
					result = append(result, agent)
					break
				}
			}
		}
	}
	return result
}

// GetCoordinators returns agents that can be coordinators
func (c *Config) GetCoordinators() []*AgentConfig {
	c.mu.RLock()
	defer c.mu.RUnlock()

	result := make([]*AgentConfig, 0)
	for _, agent := range c.Agents {
		if agent.Enabled && agent.SwarmConfig != nil && agent.SwarmConfig.CanBeCoordinator {
			result = append(result, agent)
		}
	}
	return result
}

// GetWorkers returns agents that can be workers
func (c *Config) GetWorkers() []*AgentConfig {
	c.mu.RLock()
	defer c.mu.RUnlock()

	result := make([]*AgentConfig, 0)
	for _, agent := range c.Agents {
		if agent.Enabled && agent.SwarmConfig != nil && agent.SwarmConfig.CanBeWorker {
			result = append(result, agent)
		}
	}
	return result
}

// Validate validates the configuration
func (c *Config) Validate() error {
	c.mu.RLock()
	defer c.mu.RUnlock()

	for id, agent := range c.Agents {
		if agent.Command == "" {
			return fmt.Errorf("agent %s: command is required", id)
		}
	}

	return nil
}

// Clone creates a deep copy of the configuration
func (c *Config) Clone() (*Config, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	data, err := json.Marshal(c)
	if err != nil {
		return nil, err
	}

	var clone Config
	if err := json.Unmarshal(data, &clone); err != nil {
		return nil, err
	}

	return &clone, nil
}

// ExampleConfig returns an example configuration
func ExampleConfig() *Config {
	cfg := NewConfig()

	// Add example agents - errors are ignored as this is example data
	_ = cfg.AddAgent(&AgentConfig{ //nolint:errcheck
		ID:          "claude-code",
		Name:        "Claude Code",
		Description: "Claude-powered coding assistant",
		Enabled:     true,
		Command:     "/usr/local/bin/claude-code",
		Args:        []string{"acp"},
		Env: map[string]string{
			"ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}",
		},
		MCPSettings: MCPSettings{
			UseCustomMCP: true,
			UseEditorMCP: true,
		},
		SwarmConfig: &AgentSwarmConfig{
			CanBeCoordinator: true,
			CanBeWorker:      true,
			PreferredRoles:   []string{"coder", "architect"},
			MaxConcurrent:    3,
			Priority:         10,
		},
		Tags:    []string{"primary", "coding"},
		Timeout: 300,
	})

	_ = cfg.AddAgent(&AgentConfig{ //nolint:errcheck
		ID:          "code-reviewer",
		Name:        "Code Reviewer",
		Description: "Specialized code review agent",
		Enabled:     true,
		Command:     "/usr/local/bin/reviewer-agent",
		Args:        []string{"--acp"},
		MCPSettings: MCPSettings{
			UseCustomMCP: true,
		},
		SwarmConfig: &AgentSwarmConfig{
			CanBeCoordinator: false,
			CanBeWorker:      true,
			PreferredRoles:   []string{"reviewer"},
			MaxConcurrent:    5,
			Priority:         8,
		},
		Tags:    []string{"review", "quality"},
		Timeout: 120,
	})

	_ = cfg.AddAgent(&AgentConfig{ //nolint:errcheck
		ID:          "test-generator",
		Name:        "Test Generator",
		Description: "Automated test generation agent",
		Enabled:     true,
		Command:     "/usr/local/bin/test-agent",
		Args:        []string{"acp"},
		MCPSettings: MCPSettings{
			UseCustomMCP: true,
		},
		SwarmConfig: &AgentSwarmConfig{
			CanBeCoordinator: false,
			CanBeWorker:      true,
			PreferredRoles:   []string{"tester"},
			MaxConcurrent:    2,
			Priority:         6,
		},
		Tags:    []string{"testing", "automation"},
		Timeout: 180,
	})

	return cfg
}
