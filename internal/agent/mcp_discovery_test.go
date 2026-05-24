package agent

import (
	"os"
	"path/filepath"
	"testing"
)

func TestStringsJoinHelper(t *testing.T) {
	// Test the stringsJoin helper directly
	if got := stringsJoin([]string{"a", "b", "c"}, ","); got != "a,b,c" {
		t.Errorf("expected 'a,b,c', got %q", got)
	}
	if got := stringsJoin(nil, "-"); got != "" {
		t.Errorf("expected empty string for nil, got %q", got)
	}
}

func TestParseMCPServerFromMap_Basic(t *testing.T) {
	data := map[string]any{
		"type":    "stdio",
		"command": "node",
		"args":    []any{"server.js", "--port", "3000"},
		"url":     "",
	}

	server := parseMCPServerFromMap("test-server", data, "claude-code")

	if server.Name != "test-server" {
		t.Errorf("expected name test-server, got %s", server.Name)
	}
	if server.Type != "stdio" {
		t.Errorf("expected type stdio, got %s", server.Type)
	}
	if server.Command != "node" {
		t.Errorf("expected command node, got %s", server.Command)
	}
	if len(server.Args) != 3 {
		t.Errorf("expected 3 args, got %d: %v", len(server.Args), server.Args)
	}
	if server.Source != "claude-code" {
		t.Errorf("expected source claude-code, got %s", server.Source)
	}
}

func TestParseMCPServerFromMap_CommandArray(t *testing.T) {
	data := map[string]any{
		"command": []any{"python", "-m", "mcp_server"},
	}

	server := parseMCPServerFromMap("py-server", data, "opencode")

	if server.Command != "python" {
		t.Errorf("expected command python, got %s", server.Command)
	}
	if len(server.Args) != 2 {
		t.Errorf("expected 2 args from command array, got %d: %v", len(server.Args), server.Args)
	}
	if server.Args[0] != "-m" || server.Args[1] != "mcp_server" {
		t.Errorf("expected args [-m, mcp_server], got %v", server.Args)
	}
}

func TestParseMCPServerFromMap_HeadersAndEnv(t *testing.T) {
	data := map[string]any{
		"type": "http",
		"url":  "http://localhost:8080",
		"headers": map[string]any{
			"Authorization": "Bearer token123",
			"X-Custom":      "value",
		},
		"env": map[string]any{
			"API_KEY": "secret",
		},
	}

	server := parseMCPServerFromMap("http-server", data, "test")

	if server.Type != "http" {
		t.Errorf("expected type http, got %s", server.Type)
	}
	if server.URL != "http://localhost:8080" {
		t.Errorf("expected url, got %s", server.URL)
	}
	if server.Headers["Authorization"] != "Bearer token123" {
		t.Errorf("expected Authorization header, got %s", server.Headers["Authorization"])
	}
	if server.Env["API_KEY"] != "secret" {
		t.Errorf("expected API_KEY env, got %s", server.Env["API_KEY"])
	}
}

func TestParseMCPServerFromMap_Disabled(t *testing.T) {
	data := map[string]any{
		"type":     "stdio",
		"command":  "node",
		"disabled": true,
	}

	server := parseMCPServerFromMap("disabled-server", data, "test")

	if !server.Disabled {
		t.Error("expected server to be disabled")
	}
}

func TestParseMCPServerFromMap_Empty(t *testing.T) {
	server := parseMCPServerFromMap("empty", map[string]any{}, "test")

	if server.Name != "empty" {
		t.Errorf("expected name empty, got %s", server.Name)
	}
	if server.Type != "" {
		t.Errorf("expected empty type, got %s", server.Type)
	}
	if server.Command != "" {
		t.Errorf("expected empty command, got %s", server.Command)
	}
	if server.Headers == nil {
		t.Error("expected non-nil Headers map")
	}
	if server.Env == nil {
		t.Error("expected non-nil Env map")
	}
}

func TestParseMCPServerFromMap_NonStringArgs(t *testing.T) {
	data := map[string]any{
		"args": []any{"valid", 123, true},
	}

	server := parseMCPServerFromMap("mixed-args", data, "test")

	// Only string args should be included
	if len(server.Args) != 1 {
		t.Errorf("expected 1 string arg, got %d: %v", len(server.Args), server.Args)
	}
	if server.Args[0] != "valid" {
		t.Errorf("expected 'valid', got %s", server.Args[0])
	}
}

func TestLoadMCPConfig_Basic(t *testing.T) {
	configFile := filepath.Join(t.TempDir(), "mcp.json")
	content := `{
		"mcpServers": {
			"test-server": {
				"type": "stdio",
				"command": "node",
				"args": ["server.js"]
			}
		}
	}`
	if err := os.WriteFile(configFile, []byte(content), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	servers, err := LoadMCPConfig(configFile)
	if err != nil {
		t.Fatalf("LoadMCPConfig: %v", err)
	}
	if len(servers) != 1 {
		t.Fatalf("expected 1 server, got %d", len(servers))
	}
	if servers[0].Name != "test-server" {
		t.Errorf("expected name test-server, got %s", servers[0].Name)
	}
	if servers[0].Type != "stdio" {
		t.Errorf("expected type stdio, got %s", servers[0].Type)
	}
	if servers[0].Source != "mcp.json" {
		t.Errorf("expected source mcp.json, got %s", servers[0].Source)
	}
}

func TestLoadMCPConfig_NotFound(t *testing.T) {
	_, err := LoadMCPConfig("/nonexistent/mcp.json")
	if err == nil {
		t.Error("expected error for nonexistent file")
	}
}

func TestLoadMCPConfig_InvalidJSON(t *testing.T) {
	configFile := filepath.Join(t.TempDir(), "bad.json")
	if err := os.WriteFile(configFile, []byte("not json"), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	_, err := LoadMCPConfig(configFile)
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestLoadMCPConfig_NoMCPServers(t *testing.T) {
	configFile := filepath.Join(t.TempDir(), "empty.json")
	if err := os.WriteFile(configFile, []byte(`{"other": "data"}`), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	servers, err := LoadMCPConfig(configFile)
	if err != nil {
		t.Fatalf("LoadMCPConfig: %v", err)
	}
	if len(servers) != 0 {
		t.Errorf("expected 0 servers, got %d", len(servers))
	}
}

func TestLoadMCPConfig_MultipleServers(t *testing.T) {
	configFile := filepath.Join(t.TempDir(), "multi.json")
	content := `{
		"mcpServers": {
			"server-a": {"type": "stdio", "command": "a"},
			"server-b": {"type": "http", "url": "http://localhost:8080"},
			"server-c": {"type": "stdio", "command": "c", "disabled": true}
		}
	}`
	if err := os.WriteFile(configFile, []byte(content), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	servers, err := LoadMCPConfig(configFile)
	if err != nil {
		t.Fatalf("LoadMCPConfig: %v", err)
	}
	if len(servers) != 3 {
		t.Fatalf("expected 3 servers, got %d", len(servers))
	}
}

func TestNewMCPDiscovery(t *testing.T) {
	scanner := NewScanner()
	d := NewMCPDiscovery(scanner)
	if d == nil {
		t.Fatal("NewMCPDiscovery returned nil")
	}
	if d.scanner != scanner {
		t.Error("scanner not set")
	}
}

func TestDiscoverFromAgent_NoConfigPath(t *testing.T) {
	d := NewMCPDiscovery(NewScanner())

	servers, err := d.DiscoverFromAgent(&AgentCLI{Name: "test"})
	if err != nil {
		t.Fatalf("DiscoverFromAgent: %v", err)
	}
	if len(servers) != 0 {
		t.Errorf("expected 0 servers for agent without config path, got %d", len(servers))
	}
}

func TestDiscoverFromAgent_InvalidConfig(t *testing.T) {
	d := NewMCPDiscovery(NewScanner())

	servers, err := d.DiscoverFromAgent(&AgentCLI{
		Name:       "test",
		ConfigPath: "/nonexistent/config.json",
	})
	// Should return error (can't parse nonexistent file)
	if err == nil {
		t.Error("expected error for nonexistent config file")
	}
	if servers != nil {
		t.Errorf("expected nil servers for invalid config, got %v", servers)
	}
}

func TestDiscoverAll_Empty(t *testing.T) {
	s := NewScanner()
	d := NewMCPDiscovery(s)

	servers, err := d.DiscoverAll()
	if err != nil {
		t.Fatalf("DiscoverAll: %v", err)
	}
	// No agents in scanner, so no servers
	if len(servers) != 0 {
		t.Errorf("expected 0 servers for empty scanner, got %d", len(servers))
	}
}

func TestMCPServerInfo_Struct(t *testing.T) {
	info := MCPServerInfo{
		Name:    "test",
		Type:    "stdio",
		Command: "node server.js",
		Args:    []string{"--port", "3000"},
		Source:  "claude-code",
	}

	if info.Name != "test" {
		t.Errorf("expected name test, got %s", info.Name)
	}
	if info.Disabled {
		t.Error("expected not disabled")
	}
}

func TestDiscoverFromAgent_ValidConfigWithMCPServers(t *testing.T) {
	// Create a valid agent config with MCP.Servers
	configFile := filepath.Join(t.TempDir(), "agent.json")
	content := `{
		"name": "test-agent",
		"mcp": {
			"servers": {
				"stdio-server": {
					"type": "stdio",
					"command": "node",
					"args": ["server.js"]
				},
				"http-server": {
					"type": "http",
					"url": "http://localhost:8080"
				}
			}
		}
	}`
	if err := os.WriteFile(configFile, []byte(content), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	d := NewMCPDiscovery(NewScanner())
	servers, err := d.DiscoverFromAgent(&AgentCLI{
		Name:       "test-agent",
		ConfigPath: configFile,
	})
	if err != nil {
		t.Fatalf("DiscoverFromAgent: %v", err)
	}
	// Note: mcp.servers creates 2 entries + raw["mcp"] creates "servers" entry = 3 total
	// The actual MCP servers are stdio-server and http-server
	serverNames := make(map[string]bool)
	for _, s := range servers {
		serverNames[s.Name] = true
	}
	if !serverNames["stdio-server"] || !serverNames["http-server"] {
		t.Errorf("expected stdio-server and http-server, got %d: %v", len(servers), servers)
	}
}

func TestDiscoverFromAgent_ValidConfigWithRawMcpServers(t *testing.T) {
	// Create a config with mcpServers in raw format
	configFile := filepath.Join(t.TempDir(), "raw-agent.json")
	content := `{
		"name": "raw-agent",
		"mcpServers": {
			"raw-server": {
				"type": "stdio",
				"command": "python",
				"args": ["-m", "mcp"]
			}
		}
	}`
	if err := os.WriteFile(configFile, []byte(content), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	d := NewMCPDiscovery(NewScanner())
	servers, err := d.DiscoverFromAgent(&AgentCLI{
		Name:       "raw-agent",
		ConfigPath: configFile,
	})
	if err != nil {
		t.Fatalf("DiscoverFromAgent: %v", err)
	}
	if len(servers) != 1 {
		t.Errorf("expected 1 server, got %d: %v", len(servers), servers)
	}
	if servers[0].Name != "raw-server" {
		t.Errorf("expected name raw-server, got %s", servers[0].Name)
	}
}

func TestDiscoverFromAgent_ValidConfigWithNestedMcp(t *testing.T) {
	// Create a config with nested mcp.servers format
	configFile := filepath.Join(t.TempDir(), "nested-agent.json")
	content := `{
		"name": "nested-agent",
		"mcp": {
			"servers": {
				"nested-server": {
					"type": "stdio",
					"command": "node"
				}
			}
		}
	}`
	if err := os.WriteFile(configFile, []byte(content), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	d := NewMCPDiscovery(NewScanner())
	servers, err := d.DiscoverFromAgent(&AgentCLI{
		Name:       "nested-agent",
		ConfigPath: configFile,
	})
	if err != nil {
		t.Fatalf("DiscoverFromAgent: %v", err)
	}
	// Check that nested-server exists
	found := false
	for _, s := range servers {
		if s.Name == "nested-server" && s.Source == "nested-agent" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected nested-server with source nested-agent, got %d: %v", len(servers), servers)
	}
}

func TestDiscoverAll_WithAgents(t *testing.T) {
	// Create scanner with agents
	s := NewScanner()

	// Create two agent configs
	dir := t.TempDir()

	config1 := filepath.Join(dir, "agent1.json")
	content1 := `{
		"name": "agent1",
		"mcpServers": {
			"server1": {"type": "stdio", "command": "node"}
		}
	}`
	if err := os.WriteFile(config1, []byte(content1), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	config2 := filepath.Join(dir, "agent2.json")
	content2 := `{
		"name": "agent2",
		"mcpServers": {
			"server2": {"type": "http", "url": "http://localhost:9090"}
		}
	}`
	if err := os.WriteFile(config2, []byte(content2), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	// Add agents to scanner
	s.agents["agent1"] = &AgentCLI{Name: "agent1", ConfigPath: config1}
	s.agents["agent2"] = &AgentCLI{Name: "agent2", ConfigPath: config2}

	d := NewMCPDiscovery(s)
	servers, err := d.DiscoverAll()
	if err != nil {
		t.Fatalf("DiscoverAll: %v", err)
	}
	// Check that server1 and server2 exist
	serverNames := make(map[string]bool)
	for _, s := range servers {
		serverNames[s.Name] = true
	}
	if !serverNames["server1"] || !serverNames["server2"] {
		t.Errorf("expected server1 and server2, got %d: %v", len(servers), servers)
	}
}

func TestDiscoverAll_SkipsErrors(t *testing.T) {
	s := NewScanner()
	dir := t.TempDir()

	// Valid config
	validConfig := filepath.Join(dir, "valid.json")
	validContent := `{"name": "valid", "mcpServers": {"s1": {"type": "stdio", "command": "node"}}}`
	if err := os.WriteFile(validConfig, []byte(validContent), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	// Invalid config (will cause error, should be skipped)
	invalidConfig := filepath.Join(dir, "invalid.json")
	if err := os.WriteFile(invalidConfig, []byte("not json"), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	s.agents["valid"] = &AgentCLI{Name: "valid", ConfigPath: validConfig}
	s.agents["invalid"] = &AgentCLI{Name: "invalid", ConfigPath: invalidConfig}

	d := NewMCPDiscovery(s)
	servers, err := d.DiscoverAll()
	if err != nil {
		t.Fatalf("DiscoverAll: %v", err)
	}
	// Should have 1 server from valid agent, invalid agent skipped
	if len(servers) != 1 {
		t.Errorf("expected 1 server (invalid agent skipped), got %d: %v", len(servers), servers)
	}
}

func TestDiscoverProject(t *testing.T) {
	tmpDir := t.TempDir()

	// Create project .mcp.json
	mcpDir := filepath.Join(tmpDir, ".swarm-editor")
	if err := os.MkdirAll(mcpDir, 0755); err != nil {
		t.Fatal(err)
	}
	mcpJSON := filepath.Join(mcpDir, "mcp.json")
	config := `{"mcpServers":{"test-server":{"command":"test-cmd","args":["--flag"]}}}`
	if err := os.WriteFile(mcpJSON, []byte(config), 0644); err != nil {
		t.Fatal(err)
	}

	d := NewMCPDiscovery(&Scanner{})
	servers, err := d.DiscoverProject(tmpDir)
	if err != nil {
		t.Fatalf("DiscoverProject: %v", err)
	}
	if len(servers) < 1 {
		t.Fatalf("expected at least 1 server, got %d", len(servers))
	}
	s := servers[0]
	if s.Name != "test-server" {
		t.Errorf("expected name 'test-server', got %s", s.Name)
	}
	if s.Command != "test-cmd" {
		t.Errorf("expected command 'test-cmd', got %s", s.Command)
	}
	if s.Source == "" {
		t.Error("expected non-empty source tag")
	}
}

func TestDiscoverProject_EmptyDir(t *testing.T) {
	tmpDir := t.TempDir()
	d := NewMCPDiscovery(&Scanner{})
	servers, err := d.DiscoverProject(tmpDir)
	if err != nil {
		t.Fatalf("DiscoverProject: %v", err)
	}
	if len(servers) != 0 {
		t.Errorf("expected 0 servers from empty dir, got %d", len(servers))
	}
}

func TestDiscoverGlobal(t *testing.T) {
	d := NewMCPDiscovery(&Scanner{})
	servers, err := d.DiscoverGlobal()
	if err != nil {
		t.Fatalf("DiscoverGlobal: %v", err)
	}
	t.Logf("DiscoverGlobal found %d servers", len(servers))
}

func TestDiscoverAllWithScope(t *testing.T) {
	tmpDir := t.TempDir()

	mcpDir := filepath.Join(tmpDir, ".swarm-editor")
	if err := os.MkdirAll(mcpDir, 0755); err != nil {
		t.Fatal(err)
	}
	mcpJSON := filepath.Join(mcpDir, "mcp.json")
	config := `{"mcpServers":{"proj-srv":{"command":"proj-cmd","args":[]}}}`
	if err := os.WriteFile(mcpJSON, []byte(config), 0644); err != nil {
		t.Fatal(err)
	}

	d := NewMCPDiscovery(&Scanner{})
	servers, err := d.DiscoverAllWithScope(tmpDir)
	if err != nil {
		t.Fatalf("DiscoverAllWithScope: %v", err)
	}
	found := false
	for _, s := range servers {
		if s.Name == "proj-srv" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected to find proj-srv in results")
	}
}

func TestDiscoverAllWithScope_Dedup(t *testing.T) {
	tmpDir := t.TempDir()

	for _, dir := range []string{".swarm-editor", "."} {
		p := filepath.Join(tmpDir, dir)
		if dir != "." {
			if err := os.MkdirAll(p, 0755); err != nil {
				t.Fatal(err)
			}
		}
		f := filepath.Join(p, "mcp.json")
		config := `{"mcpServers":{"dup-srv":{"command":"dup-cmd","args":[]}}}`
		if err := os.WriteFile(f, []byte(config), 0644); err != nil {
			t.Fatal(err)
		}
	}

	d := NewMCPDiscovery(&Scanner{})
	servers, err := d.DiscoverAllWithScope(tmpDir)
	if err != nil {
		t.Fatalf("DiscoverAllWithScope: %v", err)
	}
	count := 0
	for _, s := range servers {
		if s.Name == "dup-srv" {
			count++
		}
	}
	if count != 1 {
		t.Errorf("expected 1 unique 'dup-srv', got %d", count)
	}
}
