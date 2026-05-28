// Package agent provides Agent CLI scanning and management
package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/log"
)

var scannerLog = log.With("component", "Scanner")

// AgentCLI represents a detected coding agent CLI
type AgentCLI struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	Executable   string            `json:"executable"`
	Version      string            `json:"version"`
	Path         string            `json:"path"`
	ConfigPath   string            `json:"configPath,omitempty"`
	Capabilities []string          `json:"capabilities"`
	Provider     string            `json:"provider"` // anthropic, google, alibaba, etc.
	Model        string            `json:"model,omitempty"`
	EnvVars      map[string]string `json:"envVars,omitempty"`
	Status       AgentStatus       `json:"status"`
	LastChecked  time.Time         `json:"lastChecked"`
	Metadata     map[string]any    `json:"metadata,omitempty"`
}

// AgentStatus represents the status of an agent
type AgentStatus string

const (
	AgentStatusAvailable AgentStatus = "available"
	AgentStatusRunning   AgentStatus = "running"
	AgentStatusError     AgentStatus = "error"
	AgentStatusUnknown   AgentStatus = "unknown"
)

// KnownAgent defines a known agent CLI configuration
type KnownAgent struct {
	Name         string
	Executables  []string // Possible executable names
	ConfigFiles  []string // Possible config file names
	ConfigPaths  []string // Possible config directories
	Provider     string
	EnvPrefix    string // Environment variable prefix for API keys
	ModelEnvVar  string // Environment variable for model selection
	Capabilities []string
}

// KnownAgents is the registry of known coding agent CLIs
var KnownAgents = []KnownAgent{
	{
		Name:         "claude-code",
		Executables:  []string{"claude", "claude-code"},
		ConfigFiles:  []string{".claude.json", "claude.json"},
		ConfigPaths:  []string{"~/.claude", "~/.config/claude"},
		Provider:     "anthropic",
		EnvPrefix:    "ANTHROPIC",
		ModelEnvVar:  "ANTHROPIC_MODEL",
		Capabilities: []string{"code", "edit", "test", "refactor", "debug"},
	},
	{
		Name:         "kimi-code",
		Executables:  []string{"kimi", "kimi-code", "moonshot"},
		ConfigFiles:  []string{".kimi.json", "kimi.json"},
		ConfigPaths:  []string{"~/.kimi", "~/.config/kimi"},
		Provider:     "moonshot",
		EnvPrefix:    "MOONSHOT",
		ModelEnvVar:  "MOONSHOT_MODEL",
		Capabilities: []string{"code", "chat", "translate"},
	},
	{
		Name:         "opencode",
		Executables:  []string{"opencode", "open-code"},
		ConfigFiles:  []string{".opencode.json", "opencode.json"},
		ConfigPaths:  []string{"~/.opencode", "~/.config/opencode"},
		Provider:     "openai",
		EnvPrefix:    "OPENAI",
		ModelEnvVar:  "OPENAI_MODEL",
		Capabilities: []string{"code", "chat", "complete"},
	},
	{
		Name:         "crush-cli",
		Executables:  []string{"crush", "crush-cli"},
		ConfigFiles:  []string{".crush.json", "crush.json"},
		ConfigPaths:  []string{"~/.crush", "~/.config/crush"},
		Provider:     "custom",
		EnvPrefix:    "CRUSH",
		ModelEnvVar:  "CRUSH_MODEL",
		Capabilities: []string{"code", "build", "deploy"},
	},
	{
		Name:         "gemini-cli",
		Executables:  []string{"gemini", "gemini-cli", "gcloud-ai"},
		ConfigFiles:  []string{".gemini.json", "gemini.json"},
		ConfigPaths:  []string{"~/.gemini", "~/.config/gemini"},
		Provider:     "google",
		EnvPrefix:    "GOOGLE",
		ModelEnvVar:  "GEMINI_MODEL",
		Capabilities: []string{"code", "chat", "multimodal"},
	},
	{
		Name:         "qwen-code",
		Executables:  []string{"qwen", "qwen-code", "tongyi"},
		ConfigFiles:  []string{".qwen.json", "qwen.json"},
		ConfigPaths:  []string{"~/.qwen", "~/.config/qwen"},
		Provider:     "alibaba",
		EnvPrefix:    "DASHSCOPE",
		ModelEnvVar:  "QWEN_MODEL",
		Capabilities: []string{"code", "chat", "translate"},
	},
	{
		Name:         "droid-cli",
		Executables:  []string{"droid", "droid-cli"},
		ConfigFiles:  []string{"settings.json", "mcp.json"},
		ConfigPaths:  []string{"~/.factory", "~/.config/factory"},
		Provider:     "factory",
		EnvPrefix:    "FACTORY",
		ModelEnvVar:  "FACTORY_MODEL",
		Capabilities: []string{"code", "android", "mobile", "mcp"},
	},
	{
		Name:         "cursor",
		Executables:  []string{"cursor", "cursor-cli"},
		ConfigFiles:  []string{".cursor.json"},
		ConfigPaths:  []string{"~/.cursor"},
		Provider:     "cursor",
		EnvPrefix:    "CURSOR",
		ModelEnvVar:  "CURSOR_MODEL",
		Capabilities: []string{"code", "edit", "refactor"},
	},
	{
		Name:         "aider",
		Executables:  []string{"aider"},
		ConfigFiles:  []string{".aider.conf.yml"},
		ConfigPaths:  []string{"~/.aider"},
		Provider:     "multi",
		EnvPrefix:    "AIDER",
		ModelEnvVar:  "AIDER_MODEL",
		Capabilities: []string{"code", "git", "edit"},
	},
	{
		Name:         "copilot-cli",
		Executables:  []string{"gh", "github-copilot"},
		ConfigFiles:  []string{"copilot.json"},
		ConfigPaths:  []string{"~/.config/gh"},
		Provider:     "github",
		EnvPrefix:    "GITHUB",
		ModelEnvVar:  "",
		Capabilities: []string{"code", "complete", "chat"},
	},
	{
		Name:         "cline",
		Executables:  []string{"cline"},
		ConfigFiles:  []string{"cline.json"},
		ConfigPaths:  []string{"~/.cline", "~/.config/cline"},
		Provider:     "cline",
		EnvPrefix:    "CLINE",
		ModelEnvVar:  "CLINE_MODEL",
		Capabilities: []string{"code", "edit", "test", "debug", "mcp"},
	},
	{
		Name:         "soloncode",
		Executables:  []string{"soloncode"},
		ConfigFiles:  []string{"soloncode.json"},
		ConfigPaths:  []string{"~/.soloncode"},
		Provider:     "deepseek",
		EnvPrefix:    "SOLONCODE",
		ModelEnvVar:  "SOLONCODE_MODEL",
		Capabilities: []string{"code", "edit", "chat", "debug"},
	},
}

// Scanner scans for installed agent CLIs
type Scanner struct {
	mu             sync.RWMutex
	agents         map[string]*AgentCLI
	paths          []string
	homeDir        string
	onDetected     func(*AgentCLI)
	onStatusChange func(id string, status AgentStatus)
}

// NewScanner creates a new agent scanner
func NewScanner() *Scanner {
	homeDir, _ := os.UserHomeDir()

	return &Scanner{
		agents:  make(map[string]*AgentCLI),
		paths:   getPaths(),
		homeDir: homeDir,
	}
}

// getPaths returns the system PATH directories
func getPaths() []string {
	pathEnv := os.Getenv("PATH")
	var paths []string

	// Add common locations
	commonPaths := []string{
		"/usr/local/bin",
		"/usr/bin",
		"/opt/homebrew/bin",
		"/opt/local/bin",
	}

	if runtime.GOOS == "windows" {
		commonPaths = append(commonPaths,
			`C:\Program Files`,
			`C:\Program Files (x86)`,
			filepath.Join(os.Getenv("LOCALAPPDATA"), "Programs"),
		)
	}

	// Add PATH directories
	for _, p := range strings.Split(pathEnv, string(os.PathListSeparator)) {
		if p != "" {
			paths = append(paths, p)
		}
	}

	// Add common paths
	for _, p := range commonPaths {
		if !containsPath(paths, p) {
			paths = append(paths, p)
		}
	}

	// Add agent-specific bin directories
	homeDir, _ := os.UserHomeDir()
	if homeDir != "" {
		agentBins := []string{
			filepath.Join(homeDir, ".soloncode", "bin"),
			filepath.Join(homeDir, ".local", "bin"),
			filepath.Join(homeDir, "bin"),
			filepath.Join(homeDir, ".claude", "bin"),
		}
		for _, p := range agentBins {
			if !containsPath(paths, p) {
				paths = append(paths, p)
			}
		}
	}

	return paths
}

func containsPath(paths []string, p string) bool {
	for _, path := range paths {
		if path == p {
			return true
		}
	}
	return false
}

// OnDetected sets the callback for when an agent is detected
func (s *Scanner) OnDetected(fn func(*AgentCLI)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onDetected = fn
}

// OnStatusChange sets the callback for status changes
func (s *Scanner) OnStatusChange(fn func(string, AgentStatus)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onStatusChange = fn
}

// Scan scans for all known agent CLIs
func (s *Scanner) Scan(ctx context.Context) ([]*AgentCLI, error) {
	s.mu.Lock()

	// Clear previous scan results to avoid accumulation
	s.agents = make(map[string]*AgentCLI)

	var detected []*AgentCLI
	var wg sync.WaitGroup
	results := make(chan *AgentCLI, len(KnownAgents))

	for _, known := range KnownAgents {
		wg.Add(1)
		go func(k KnownAgent) {
			defer func() {
				if r := recover(); r != nil {
					scannerLog.Error("scanAgent panic", "name", k.Name, "panic", r)
				}
				wg.Done()
			}()
			if agent := s.scanAgent(ctx, k); agent != nil {
				results <- agent
			}
		}(known)
	}

	go func() {
		defer func() {
			if r := recover(); r != nil {
				scannerLog.Error("Wait group cleanup panic", "panic", r)
			}
		}()
		wg.Wait()
		close(results)
	}()

	for agent := range results {
		s.agents[agent.ID] = agent
		detected = append(detected, agent)
	}

	// Snapshot callback under lock, invoke outside lock
	onDetected := s.onDetected
	s.mu.Unlock()

	if onDetected != nil {
		for _, agent := range detected {
			onDetected(agent)
		}
	}

	return detected, nil
}

// scanAgent scans for a specific agent
func (s *Scanner) scanAgent(ctx context.Context, known KnownAgent) *AgentCLI {
	// Try each executable name
	for _, execName := range known.Executables {
		execPath, err := s.findExecutable(execName)
		if err != nil {
			continue
		}

		agent := &AgentCLI{
			ID:           known.Name,
			Name:         known.Name,
			Executable:   execName,
			Path:         execPath,
			Provider:     known.Provider,
			Capabilities: known.Capabilities,
			EnvVars:      make(map[string]string),
			Metadata:     make(map[string]any),
			Status:       AgentStatusAvailable,
			LastChecked:  time.Now(),
		}

		// Get version
		if version, err := s.getVersion(ctx, execPath); err == nil {
			agent.Version = version
		}

		// Find config file
		if configPath := s.findConfig(known); configPath != "" {
			agent.ConfigPath = configPath
			s.loadConfig(agent, configPath)
		}

		// Load environment variables
		s.loadEnvVars(agent, known)

		return agent
	}

	return nil
}

// findExecutable finds an executable in PATH
func (s *Scanner) findExecutable(name string) (string, error) {
	// Check if it's already an absolute path
	if filepath.IsAbs(name) {
		if _, err := os.Stat(name); err == nil {
			return name, nil
		}
		return "", fmt.Errorf("executable not found: %s", name)
	}

	// Search in PATH
	for _, dir := range s.paths {
		path := filepath.Join(dir, name)
		if runtime.GOOS == "windows" {
			path += ".exe"
		}
		if _, err := os.Stat(path); err == nil {
			return path, nil
		}
	}

	return "", fmt.Errorf("executable not found: %s", name)
}

// getVersion gets the version of an agent
func (s *Scanner) getVersion(ctx context.Context, execPath string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	// Try common version flags
	flags := []string{"--version", "-v", "version", "--version-short"}
	const maxVersionOutput = 64 * 1024 // 64KB limit for version output

	for _, flag := range flags {
		cmd := exec.CommandContext(ctx, execPath, flag)
		// Force-kill process and don't wait for IO goroutines beyond 1s
		cmd.Cancel = func() error { return cmd.Process.Kill() }
		cmd.WaitDelay = time.Second
		output, err := cmd.CombinedOutput()
		if err == nil && len(output) > 0 {
			if len(output) > maxVersionOutput {
				output = output[:maxVersionOutput]
			}
			version := strings.TrimSpace(string(output))
			// Clean up version string
			version = strings.Split(version, "\n")[0]
			return version, nil
		}
	}

	return "", fmt.Errorf("could not determine version")
}

// findConfig finds the config file for an agent
func (s *Scanner) findConfig(known KnownAgent) string {
	for _, configDir := range known.ConfigPaths {
		dir := expandHomeWithDir(configDir, s.homeDir)
		for _, configFile := range known.ConfigFiles {
			path := filepath.Join(dir, configFile)
			if _, err := os.Stat(path); err == nil {
				return path
			}
		}
	}
	return ""
}

// loadConfig loads the config file for an agent
func (s *Scanner) loadConfig(agent *AgentCLI, configPath string) {
	// Use the new config parser that supports multiple formats
	config, err := ParseAgentConfig(configPath)
	if err != nil {
		// Fallback to old JSON parsing for backward compatibility
		data, err := os.ReadFile(configPath)
		if err != nil {
			return
		}

		var rawConfig map[string]any
		if err := json.Unmarshal(data, &rawConfig); err != nil {
			return
		}

		// Extract common config fields
		if model, ok := rawConfig["model"].(string); ok {
			agent.Model = model
		}
		if provider, ok := rawConfig["provider"].(string); ok {
			agent.Provider = provider
		}

		agent.Metadata["config"] = rawConfig
		return
	}

	// Use parsed config
	if config.Model != "" {
		agent.Model = config.Model
	}
	if config.Provider != "" {
		agent.Provider = config.Provider
	}

	// Store raw config in metadata
	agent.Metadata["config"] = config.Raw

	// Store MCP servers if available
	if len(config.Raw) > 0 {
		if mcpServers, ok := config.Raw["mcpServers"].(map[string]any); ok {
			agent.Metadata["mcpServers"] = mcpServers
		}
		if mcp, ok := config.Raw["mcp"].(map[string]any); ok {
			agent.Metadata["mcp"] = mcp
		}
	}

	// Store custom models if available
	if len(config.CustomModel) > 0 {
		agent.Metadata["customModels"] = config.CustomModel
	}
}

// loadEnvVars loads environment variables for an agent
func (s *Scanner) loadEnvVars(agent *AgentCLI, known KnownAgent) {
	// Load API key env var
	if known.EnvPrefix != "" {
		apiKeyEnv := known.EnvPrefix + "_API_KEY"
		if apiKey := os.Getenv(apiKeyEnv); apiKey != "" {
			agent.EnvVars["API_KEY"] = "****" // Don't expose actual key
		}
	}

	// Load model env var
	if known.ModelEnvVar != "" {
		if model := os.Getenv(known.ModelEnvVar); model != "" {
			agent.Model = model
		}
	}
}

// expandHomeWithDir expands ~ to home directory using provided homeDir
func expandHomeWithDir(path, homeDir string) string {
	if strings.HasPrefix(path, "~/") {
		return filepath.Join(homeDir, path[2:])
	}
	return path
}

// GetAgent returns a deep copy of an agent by ID to prevent mutation of internal state
func (s *Scanner) GetAgent(id string) (*AgentCLI, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	agent, ok := s.agents[id]
	if !ok {
		return nil, false
	}
	return copyAgentCLI(agent), true
}

// GetAgents returns deep copies of all detected agents
func (s *Scanner) GetAgents() []*AgentCLI {
	s.mu.RLock()
	defer s.mu.RUnlock()

	agents := make([]*AgentCLI, 0, len(s.agents))
	for _, agent := range s.agents {
		agents = append(agents, copyAgentCLI(agent))
	}
	return agents
}

// GetAgentsByProvider returns deep copies of agents by provider
func (s *Scanner) GetAgentsByProvider(provider string) []*AgentCLI {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var agents []*AgentCLI
	for _, agent := range s.agents {
		if agent.Provider == provider {
			agents = append(agents, copyAgentCLI(agent))
		}
	}
	return agents
}

// copyAgentCLI creates a deep copy of an AgentCLI to prevent mutation of internal state
func copyAgentCLI(a *AgentCLI) *AgentCLI {
	cp := *a
	if cp.Capabilities != nil {
		cp.Capabilities = make([]string, len(a.Capabilities))
		copy(cp.Capabilities, a.Capabilities)
	}
	if cp.EnvVars != nil {
		cp.EnvVars = make(map[string]string, len(a.EnvVars))
		for k, v := range a.EnvVars {
			cp.EnvVars[k] = v
		}
	}
	if cp.Metadata != nil {
		cp.Metadata = make(map[string]any, len(a.Metadata))
		for k, v := range a.Metadata {
			cp.Metadata[k] = v
		}
	}
	return &cp
}

// CheckStatus checks the status of an agent
func (s *Scanner) CheckStatus(ctx context.Context, id string) AgentStatus {
	s.mu.Lock()
	agent, ok := s.agents[id]
	if !ok {
		s.mu.Unlock()
		return AgentStatusUnknown
	}
	agentPath := agent.Path
	s.mu.Unlock()

	// Try to run the agent with --help or --version (OUTSIDE lock - blocking I/O)
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, agentPath, "--help")
	err := cmd.Run()

	// Re-acquire lock to update status
	s.mu.Lock()
	agent, ok = s.agents[id] // Re-verify agent still exists
	if !ok {
		s.mu.Unlock()
		return AgentStatusUnknown
	}
	if err != nil {
		agent.Status = AgentStatusError
	} else {
		agent.Status = AgentStatusAvailable
	}
	agent.LastChecked = time.Now()
	onChange := s.onStatusChange
	s.mu.Unlock()

	if onChange != nil {
		onChange(id, agent.Status)
	}

	return agent.Status
}

// Refresh rescans for agents
func (s *Scanner) Refresh(ctx context.Context) ([]*AgentCLI, error) {
	s.mu.Lock()
	s.agents = make(map[string]*AgentCLI)
	s.paths = getPaths()
	s.mu.Unlock()

	return s.Scan(ctx)
}
