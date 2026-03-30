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
			"X-Custom":     "value",
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
