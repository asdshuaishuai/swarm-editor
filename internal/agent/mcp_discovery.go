// Package agent provides MCP server discovery from agent configurations
package agent

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// MCPServerInfo represents discovered MCP server information
type MCPServerInfo struct {
	Name     string            `json:"name"`
	Type     string            `json:"type"` // "stdio" or "http"
	Command  string            `json:"command,omitempty"`
	Args     []string          `json:"args,omitempty"`
	URL      string            `json:"url,omitempty"`
	Headers  map[string]string `json:"headers,omitempty"`
	Env      map[string]string `json:"env,omitempty"`
	Disabled bool              `json:"disabled"`
	Source   string            `json:"source"` // Which agent this came from
}

// MCPDiscovery discovers MCP servers from agent configurations
type MCPDiscovery struct {
	scanner *Scanner
}

// NewMCPDiscovery creates a new MCP discovery instance
func NewMCPDiscovery(scanner *Scanner) *MCPDiscovery {
	return &MCPDiscovery{scanner: scanner}
}

// DiscoverFromAgent discovers MCP servers from a specific agent's configuration
func (d *MCPDiscovery) DiscoverFromAgent(agent *AgentCLI) ([]MCPServerInfo, error) {
	if agent.ConfigPath == "" {
		return nil, nil
	}

	// Parse the config file
	config, err := ParseAgentConfig(agent.ConfigPath)
	if err != nil {
		return nil, fmt.Errorf("failed to parse config: %w", err)
	}

	var servers []MCPServerInfo

	// Extract MCP servers from config
	if config.MCP != nil && config.MCP.Servers != nil {
		for name, server := range config.MCP.Servers {
			servers = append(servers, MCPServerInfo{
				Name:     name,
				Type:     server.Type,
				Command:  stringsJoin(server.Command, " "),
				Args:     server.Args,
				URL:      server.URL,
				Headers:  server.Headers,
				Env:      server.Env,
				Disabled: server.Disabled,
				Source:   agent.Name,
			})
		}
	}

	// Also check for mcpServers field (alternative format)
	if raw := config.Raw; raw != nil {
		if mcpServers, ok := raw["mcpServers"].(map[string]any); ok {
			for name, s := range mcpServers {
				if serverData, ok := s.(map[string]any); ok {
					server := parseMCPServerFromMap(name, serverData, agent.Name)
					servers = append(servers, server)
				}
			}
		}

		// Check for mcp field with nested servers
		if mcp, ok := raw["mcp"].(map[string]any); ok {
			for name, s := range mcp {
				if serverData, ok := s.(map[string]any); ok {
					server := parseMCPServerFromMap(name, serverData, agent.Name)
					servers = append(servers, server)
				}
			}
		}
	}

	return servers, nil
}

// DiscoverAll discovers MCP servers from all detected agents
func (d *MCPDiscovery) DiscoverAll() ([]MCPServerInfo, error) {
	agents := d.scanner.GetAgents()
	var allServers []MCPServerInfo

	for _, agent := range agents {
		servers, err := d.DiscoverFromAgent(agent)
		if err != nil {
			continue // Skip agents with parsing errors
		}
		allServers = append(allServers, servers...)
	}

	return allServers, nil
}

// parseMCPServerFromMap parses MCP server configuration from a raw map
func parseMCPServerFromMap(name string, data map[string]any, source string) MCPServerInfo {
	server := MCPServerInfo{
		Name:    name,
		Headers: make(map[string]string),
		Env:     make(map[string]string),
		Source:  source,
	}

	if t, ok := data["type"].(string); ok {
		server.Type = t
	}

	if cmd, ok := data["command"].(string); ok {
		server.Command = cmd
	}

	if args, ok := data["args"].([]any); ok {
		for _, arg := range args {
			if argStr, ok := arg.(string); ok {
				server.Args = append(server.Args, argStr)
			}
		}
	}

	// Handle command as array
	if cmdArr, ok := data["command"].([]any); ok && len(cmdArr) > 0 {
		if cmdStr, ok := cmdArr[0].(string); ok {
			server.Command = cmdStr
		}
		for i, arg := range cmdArr {
			if i > 0 {
				if argStr, ok := arg.(string); ok {
					server.Args = append(server.Args, argStr)
				}
			}
		}
	}

	if url, ok := data["url"].(string); ok {
		server.URL = url
	}

	if headers, ok := data["headers"].(map[string]any); ok {
		for k, v := range headers {
			if str, ok := v.(string); ok {
				server.Headers[k] = str
			}
		}
	}

	if env, ok := data["env"].(map[string]any); ok {
		for k, v := range env {
			if str, ok := v.(string); ok {
				server.Env[k] = str
			}
		}
	}

	if disabled, ok := data["disabled"].(bool); ok {
		server.Disabled = disabled
	}

	return server
}

// LoadMCPConfig loads MCP configuration from a dedicated mcp.json file
func LoadMCPConfig(path string) ([]MCPServerInfo, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read MCP config: %w", err)
	}

	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse MCP config: %w", err)
	}

	var servers []MCPServerInfo

	if mcpServers, ok := raw["mcpServers"].(map[string]any); ok {
		for name, s := range mcpServers {
			if serverData, ok := s.(map[string]any); ok {
				server := parseMCPServerFromMap(name, serverData, "mcp.json")
				servers = append(servers, server)
			}
		}
	}

	return servers, nil
}

// stringsJoin joins strings with separator (helper for compatibility)
func stringsJoin(strs []string, sep string) string {
	result := ""
	for i, s := range strs {
		if i > 0 {
			result += sep
		}
		result += s
	}
	return result
}

// DiscoverProject discovers MCP servers from project-level configs
func (d *MCPDiscovery) DiscoverProject(workspaceDir string) ([]MCPServerInfo, error) {
	var servers []MCPServerInfo

	// Project-level config paths
	projectPaths := []string{
		filepath.Join(workspaceDir, ".swarm-editor", "mcp.json"),
		filepath.Join(workspaceDir, ".mcp.json"),
		filepath.Join(workspaceDir, ".claude", "mcp.json"),
	}

	for _, p := range projectPaths {
		if s, err := LoadMCPConfig(p); err == nil && len(s) > 0 {
			// Tag with project source
			for i := range s {
				s[i].Source = "project:" + filepath.Base(filepath.Dir(p))
			}
			servers = append(servers, s...)
		}
	}

	return servers, nil
}

// DiscoverGlobal discovers MCP servers from global config paths
func (d *MCPDiscovery) DiscoverGlobal() ([]MCPServerInfo, error) {
	var servers []MCPServerInfo

	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	// Global config paths
	globalPaths := []string{
		filepath.Join(home, ".claude", "mcp.json"),
		filepath.Join(home, ".config", "claude-code", "mcp.json"),
		filepath.Join(home, ".config", "cursor", "mcp.json"),
		filepath.Join(home, ".swarm-editor", "mcp.json"),
	}

	for _, p := range globalPaths {
		if s, err := LoadMCPConfig(p); err == nil && len(s) > 0 {
			// Tag with global source
			for i := range s {
				s[i].Source = "global:" + filepath.Base(filepath.Dir(p))
			}
			servers = append(servers, s...)
		}
	}

	return servers, nil
}

// DiscoverAllWithScope discovers MCP servers from agents + global + project configs
func (d *MCPDiscovery) DiscoverAllWithScope(workspaceDir string) ([]MCPServerInfo, error) {
	var allServers []MCPServerInfo
	seen := make(map[string]bool)

	addUnique := func(servers []MCPServerInfo) {
		for _, s := range servers {
			key := s.Name + ":" + s.Command
			if !seen[key] {
				seen[key] = true
				allServers = append(allServers, s)
			}
		}
	}

	// 1. Agent-based discovery
	if agentServers, err := d.DiscoverAll(); err == nil {
		addUnique(agentServers)
	}

	// 2. Global config files
	if globalServers, err := d.DiscoverGlobal(); err == nil {
		addUnique(globalServers)
	}

	// 3. Project-level config files
	if workspaceDir != "" {
		if projectServers, err := d.DiscoverProject(workspaceDir); err == nil {
			addUnique(projectServers)
		}
	}

	return allServers, nil
}
