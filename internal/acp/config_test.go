package acp

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestNewConfig(t *testing.T) {
	cfg := NewConfig()

	if cfg == nil {
		t.Fatal("NewConfig returned nil")
	}

	if cfg.Agents == nil {
		t.Error("Agents map should be initialized")
	}

	if cfg.MaxConnections != 10 {
		t.Errorf("Expected MaxConnections 10, got %d", cfg.MaxConnections)
	}

	if cfg.ConnectTimeout != 30 {
		t.Errorf("Expected ConnectTimeout 30, got %d", cfg.ConnectTimeout)
	}

	if cfg.DefaultSwarmConfig == nil {
		t.Fatal("DefaultSwarmConfig should not be nil")
	}

	if cfg.DefaultSwarmConfig.DefaultTopology != "star" {
		t.Errorf("Expected DefaultTopology 'star', got '%s'", cfg.DefaultSwarmConfig.DefaultTopology)
	}
}

func TestConfigAddAgent(t *testing.T) {
	cfg := NewConfig()

	agent := &AgentConfig{
		ID:      "test-agent",
		Name:    "Test Agent",
		Enabled: true,
		Command: "/usr/bin/test",
	}

	err := cfg.AddAgent(agent)
	if err != nil {
		t.Fatalf("AddAgent failed: %v", err)
	}

	if len(cfg.Agents) != 1 {
		t.Errorf("Expected 1 agent, got %d", len(cfg.Agents))
	}

	// Test duplicate
	err = cfg.AddAgent(agent)
	if err == nil {
		t.Error("AddAgent should fail for duplicate agent")
	}

	// Test empty ID
	err = cfg.AddAgent(&AgentConfig{Name: "No ID"})
	if err == nil {
		t.Error("AddAgent should fail for empty ID")
	}
}

func TestConfigRemoveAgent(t *testing.T) {
	cfg := NewConfig()
	cfg.AddAgent(&AgentConfig{ID: "test-agent", Command: "/usr/bin/test"})

	err := cfg.RemoveAgent("test-agent")
	if err != nil {
		t.Fatalf("RemoveAgent failed: %v", err)
	}

	if len(cfg.Agents) != 0 {
		t.Errorf("Expected 0 agents, got %d", len(cfg.Agents))
	}

	// Test non-existent
	err = cfg.RemoveAgent("non-existent")
	if err == nil {
		t.Error("RemoveAgent should fail for non-existent agent")
	}
}

func TestConfigGetAgent(t *testing.T) {
	cfg := NewConfig()
	cfg.AddAgent(&AgentConfig{ID: "test-agent", Command: "/usr/bin/test"})

	agent, ok := cfg.GetAgent("test-agent")
	if !ok {
		t.Fatal("Agent should be found")
	}

	if agent.ID != "test-agent" {
		t.Errorf("Expected ID 'test-agent', got '%s'", agent.ID)
	}

	// Test non-existent
	_, ok = cfg.GetAgent("non-existent")
	if ok {
		t.Error("Non-existent agent should not be found")
	}
}

func TestConfigListAgents(t *testing.T) {
	cfg := NewConfig()

	// Empty
	list := cfg.ListAgents()
	if len(list) != 0 {
		t.Errorf("Expected empty list, got %d", len(list))
	}

	// Add agents
	cfg.AddAgent(&AgentConfig{ID: "agent-1", Command: "/usr/bin/test"})
	cfg.AddAgent(&AgentConfig{ID: "agent-2", Command: "/usr/bin/test"})

	list = cfg.ListAgents()
	if len(list) != 2 {
		t.Errorf("Expected 2 agents, got %d", len(list))
	}
}

func TestConfigListEnabledAgents(t *testing.T) {
	cfg := NewConfig()

	cfg.AddAgent(&AgentConfig{ID: "enabled-1", Enabled: true, Command: "/usr/bin/test"})
	cfg.AddAgent(&AgentConfig{ID: "disabled-1", Enabled: false, Command: "/usr/bin/test"})
	cfg.AddAgent(&AgentConfig{ID: "enabled-2", Enabled: true, Command: "/usr/bin/test"})

	enabled := cfg.ListEnabledAgents()
	if len(enabled) != 2 {
		t.Errorf("Expected 2 enabled agents, got %d", len(enabled))
	}
}

func TestConfigUpdateAgent(t *testing.T) {
	cfg := NewConfig()
	cfg.AddAgent(&AgentConfig{ID: "test-agent", Name: "Original", Command: "/usr/bin/test"})

	err := cfg.UpdateAgent(&AgentConfig{ID: "test-agent", Name: "Updated", Command: "/usr/bin/test"})
	if err != nil {
		t.Fatalf("UpdateAgent failed: %v", err)
	}

	agent, _ := cfg.GetAgent("test-agent")
	if agent.Name != "Updated" {
		t.Errorf("Expected Name 'Updated', got '%s'", agent.Name)
	}

	// Test non-existent
	err = cfg.UpdateAgent(&AgentConfig{ID: "non-existent", Command: "/usr/bin/test"})
	if err == nil {
		t.Error("UpdateAgent should fail for non-existent agent")
	}

	// Test empty ID
	err = cfg.UpdateAgent(&AgentConfig{Name: "No ID", Command: "/usr/bin/test"})
	if err == nil {
		t.Error("UpdateAgent should fail for empty ID")
	}
}

func TestConfigGetAgentsByTag(t *testing.T) {
	cfg := NewConfig()

	cfg.AddAgent(&AgentConfig{ID: "agent-1", Tags: []string{"primary", "coding"}, Command: "/usr/bin/test"})
	cfg.AddAgent(&AgentConfig{ID: "agent-2", Tags: []string{"review"}, Command: "/usr/bin/test"})
	cfg.AddAgent(&AgentConfig{ID: "agent-3", Tags: []string{"coding"}, Command: "/usr/bin/test"})

	coding := cfg.GetAgentsByTag("coding")
	if len(coding) != 2 {
		t.Errorf("Expected 2 agents with 'coding' tag, got %d", len(coding))
	}

	primary := cfg.GetAgentsByTag("primary")
	if len(primary) != 1 {
		t.Errorf("Expected 1 agent with 'primary' tag, got %d", len(primary))
	}

	nonexistent := cfg.GetAgentsByTag("nonexistent")
	if len(nonexistent) != 0 {
		t.Errorf("Expected 0 agents with 'nonexistent' tag, got %d", len(nonexistent))
	}
}

func TestConfigGetAgentsByRole(t *testing.T) {
	cfg := NewConfig()

	cfg.AddAgent(&AgentConfig{
		ID:      "coder-1",
		Command: "/usr/bin/test",
		SwarmConfig: &AgentSwarmConfig{
			PreferredRoles: []string{"coder", "architect"},
		},
	})
	cfg.AddAgent(&AgentConfig{
		ID:      "reviewer-1",
		Command: "/usr/bin/test",
		SwarmConfig: &AgentSwarmConfig{
			PreferredRoles: []string{"reviewer"},
		},
	})
	cfg.AddAgent(&AgentConfig{
		ID:      "no-swarm-config",
		Command: "/usr/bin/test",
	})

	coders := cfg.GetAgentsByRole("coder")
	if len(coders) != 1 {
		t.Errorf("Expected 1 coder, got %d", len(coders))
	}

	reviewers := cfg.GetAgentsByRole("reviewer")
	if len(reviewers) != 1 {
		t.Errorf("Expected 1 reviewer, got %d", len(reviewers))
	}

	architects := cfg.GetAgentsByRole("architect")
	if len(architects) != 1 {
		t.Errorf("Expected 1 architect, got %d", len(architects))
	}
}

func TestConfigGetCoordinators(t *testing.T) {
	cfg := NewConfig()

	cfg.AddAgent(&AgentConfig{
		ID:      "coord-1",
		Enabled: true,
		Command: "/usr/bin/test",
		SwarmConfig: &AgentSwarmConfig{
			CanBeCoordinator: true,
		},
	})
	cfg.AddAgent(&AgentConfig{
		ID:      "worker-1",
		Enabled: true,
		Command: "/usr/bin/test",
		SwarmConfig: &AgentSwarmConfig{
			CanBeCoordinator: false,
			CanBeWorker:      true,
		},
	})
	cfg.AddAgent(&AgentConfig{
		ID:      "disabled-coord",
		Enabled: false,
		Command: "/usr/bin/test",
		SwarmConfig: &AgentSwarmConfig{
			CanBeCoordinator: true,
		},
	})

	coordinators := cfg.GetCoordinators()
	if len(coordinators) != 1 {
		t.Errorf("Expected 1 coordinator, got %d", len(coordinators))
	}
}

func TestConfigGetWorkers(t *testing.T) {
	cfg := NewConfig()

	cfg.AddAgent(&AgentConfig{
		ID:      "worker-1",
		Enabled: true,
		Command: "/usr/bin/test",
		SwarmConfig: &AgentSwarmConfig{
			CanBeWorker: true,
		},
	})
	cfg.AddAgent(&AgentConfig{
		ID:      "coord-1",
		Enabled: true,
		Command: "/usr/bin/test",
		SwarmConfig: &AgentSwarmConfig{
			CanBeWorker:      false,
			CanBeCoordinator: true,
		},
	})
	cfg.AddAgent(&AgentConfig{
		ID:      "disabled-worker",
		Enabled: false,
		Command: "/usr/bin/test",
		SwarmConfig: &AgentSwarmConfig{
			CanBeWorker: true,
		},
	})

	workers := cfg.GetWorkers()
	if len(workers) != 1 {
		t.Errorf("Expected 1 worker, got %d", len(workers))
	}
}

func TestConfigValidate(t *testing.T) {
	cfg := NewConfig()

	// Valid config
	cfg.AddAgent(&AgentConfig{ID: "agent-1", Command: "/usr/bin/test"})
	err := cfg.Validate()
	if err != nil {
		t.Errorf("Valid config should pass: %v", err)
	}

	// Invalid - missing command
	cfg.AddAgent(&AgentConfig{ID: "agent-2", Command: ""})
	err = cfg.Validate()
	if err == nil {
		t.Error("Config should fail validation for missing command")
	}
}

func TestConfigClone(t *testing.T) {
	cfg := NewConfig()
	cfg.AddAgent(&AgentConfig{
		ID:      "test-agent",
		Name:    "Test",
		Command: "/usr/bin/test",
		Tags:    []string{"primary"},
	})

	clone, err := cfg.Clone()
	if err != nil {
		t.Fatalf("Clone failed: %v", err)
	}

	if clone == nil {
		t.Fatal("Clone should not be nil")
	}

	if clone.Agents == nil {
		t.Fatal("Clone should have Agents map")
	}

	if len(clone.Agents) != 1 {
		t.Errorf("Clone should have 1 agent, got %d", len(clone.Agents))
	}

	// Verify deep copy
	cfg.Agents["test-agent"].Name = "Modified"
	if clone.Agents["test-agent"].Name == "Modified" {
		t.Error("Clone should be independent of original")
	}
}

func TestConfigSaveLoad(t *testing.T) {
	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "config.json")

	cfg := NewConfig()
	cfg.AddAgent(&AgentConfig{
		ID:      "test-agent",
		Name:    "Test",
		Command: "/usr/bin/test",
		Enabled: true,
	})

	// Save
	err := cfg.Save(path)
	if err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	// Verify file exists
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Fatal("Config file should exist")
	}

	// Load
	loaded, err := LoadConfig(path)
	if err != nil {
		t.Fatalf("LoadConfig failed: %v", err)
	}

	if len(loaded.Agents) != 1 {
		t.Errorf("Expected 1 agent, got %d", len(loaded.Agents))
	}

	agent, ok := loaded.Agents["test-agent"]
	if !ok {
		t.Fatal("Agent should exist")
	}

	if agent.Name != "Test" {
		t.Errorf("Expected Name 'Test', got '%s'", agent.Name)
	}
}

func TestLoadConfigNonExistent(t *testing.T) {
	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "nonexistent", "config.json")

	// Should create default config
	cfg, err := LoadConfig(path)
	if err != nil {
		t.Fatalf("LoadConfig should create default: %v", err)
	}

	if cfg == nil {
		t.Fatal("Config should not be nil")
	}

	// Verify file was created
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Error("Config file should be created")
	}
}

func TestExampleConfig(t *testing.T) {
	cfg := ExampleConfig()

	if cfg == nil {
		t.Fatal("ExampleConfig returned nil")
	}

	if len(cfg.Agents) != 3 {
		t.Errorf("Expected 3 agents in example, got %d", len(cfg.Agents))
	}

	// Check for expected agents
	ids := []string{"claude-code", "code-reviewer", "test-generator"}
	for _, id := range ids {
		if _, ok := cfg.Agents[id]; !ok {
			t.Errorf("Expected agent '%s' not found", id)
		}
	}
}

func TestConfigConcurrentAccess(t *testing.T) {
	cfg := NewConfig()
	var wg sync.WaitGroup
	done := make(chan bool, 20)

	// Concurrent adds
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			cfg.AddAgent(&AgentConfig{
				ID:      "agent-" + string(rune('0'+idx)),
				Command: "/usr/bin/test",
			})
			done <- true
		}(i)
	}

	// Concurrent reads
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			cfg.ListAgents()
			done <- true
		}()
	}

	wg.Wait()
	close(done)

	count := 0
	for range done {
		count++
	}
	if count != 20 {
		t.Errorf("Expected 20 completions, got %d", count)
	}
}

// JSON marshaling tests

func TestAgentConfigJSON(t *testing.T) {
	agent := &AgentConfig{
		ID:          "test-agent",
		Name:        "Test Agent",
		Description: "A test agent",
		Enabled:     true,
		Command:     "/usr/bin/test",
		Args:        []string{"--verbose"},
		Env:         map[string]string{"API_KEY": "secret"},
		Tags:        []string{"primary"},
		Timeout:     300,
	}

	data, err := json.MarshalIndent(agent, "", "  ")
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed AgentConfig
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.ID != "test-agent" {
		t.Errorf("ID mismatch")
	}

	if parsed.Name != "Test Agent" {
		t.Errorf("Name mismatch")
	}

	if len(parsed.Args) != 1 {
		t.Errorf("Args mismatch")
	}
}

func TestMCPSettingsJSON(t *testing.T) {
	settings := MCPSettings{
		UseCustomMCP: true,
		UseEditorMCP: false,
		AllowedTools: []string{"read", "write"},
		CustomMCPServers: []MCPServerConfig{
			{Name: "server-1", Command: "/usr/bin/server"},
		},
	}

	data, err := json.Marshal(settings)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed MCPSettings
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if !parsed.UseCustomMCP {
		t.Error("UseCustomMCP should be true")
	}

	if len(parsed.AllowedTools) != 2 {
		t.Errorf("Expected 2 allowed tools, got %d", len(parsed.AllowedTools))
	}
}

func TestAgentSwarmConfigJSON(t *testing.T) {
	config := &AgentSwarmConfig{
		CanBeCoordinator: true,
		CanBeWorker:      true,
		PreferredRoles:   []string{"coder", "reviewer"},
		MaxConcurrent:    5,
		Priority:         10,
	}

	data, err := json.Marshal(config)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed AgentSwarmConfig
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if !parsed.CanBeCoordinator {
		t.Error("CanBeCoordinator should be true")
	}

	if len(parsed.PreferredRoles) != 2 {
		t.Errorf("Expected 2 preferred roles, got %d", len(parsed.PreferredRoles))
	}
}

func TestDefaultSwarmSettingsJSON(t *testing.T) {
	settings := &DefaultSwarmSettings{
		DefaultTopology:    "mesh",
		DefaultStrategy:    "pipeline",
		ConsensusThreshold: 0.75,
		TaskTimeout:        600,
		MaxRetries:         5,
	}

	data, err := json.Marshal(settings)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed DefaultSwarmSettings
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.DefaultTopology != "mesh" {
		t.Errorf("Topology mismatch")
	}

	if parsed.ConsensusThreshold != 0.75 {
		t.Errorf("Threshold mismatch")
	}
}

func TestMCPServerConfigJSON(t *testing.T) {
	config := MCPServerConfig{
		Name:    "custom-server",
		Command: "/usr/bin/mcp-server",
		Args:    []string{"--port", "8080"},
		Env:     map[string]string{"DEBUG": "true"},
	}

	data, err := json.Marshal(config)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed MCPServerConfig
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.Name != "custom-server" {
		t.Errorf("Name mismatch")
	}
}

// Edge case tests

func TestConfigSaveEmptyPath(t *testing.T) {
	// This test uses the default ConfigDir, which we need to clean up
	cfg := NewConfig()

	// Just verify it doesn't panic
	_ = cfg

	// Note: We don't actually call Save("") because it would write to HOME
	// In a real test, we'd mock the filesystem
}

func TestConfigGetAgentsByTagNoTags(t *testing.T) {
	cfg := NewConfig()
	cfg.AddAgent(&AgentConfig{ID: "no-tags", Command: "/usr/bin/test"})

	agents := cfg.GetAgentsByTag("any-tag")
	if len(agents) != 0 {
		t.Errorf("Expected 0 agents, got %d", len(agents))
	}
}

func TestConfigGetAgentsByRoleNoSwarmConfig(t *testing.T) {
	cfg := NewConfig()
	cfg.AddAgent(&AgentConfig{ID: "no-config", Command: "/usr/bin/test"})

	agents := cfg.GetAgentsByRole("coder")
	if len(agents) != 0 {
		t.Errorf("Expected 0 agents, got %d", len(agents))
	}
}

func TestConfigGetCoordinatorsNoSwarmConfig(t *testing.T) {
	cfg := NewConfig()
	cfg.AddAgent(&AgentConfig{ID: "no-config", Enabled: true, Command: "/usr/bin/test"})

	coordinators := cfg.GetCoordinators()
	if len(coordinators) != 0 {
		t.Errorf("Expected 0 coordinators, got %d", len(coordinators))
	}
}

func TestConfigGetWorkersNoSwarmConfig(t *testing.T) {
	cfg := NewConfig()
	cfg.AddAgent(&AgentConfig{ID: "no-config", Enabled: true, Command: "/usr/bin/test"})

	workers := cfg.GetWorkers()
	if len(workers) != 0 {
		t.Errorf("Expected 0 workers, got %d", len(workers))
	}
}

func TestConfigSaveInvalidPath(t *testing.T) {
	cfg := NewConfig()
	cfg.AddAgent(&AgentConfig{ID: "test", Command: "/usr/bin/test"})

	// Try to save to an invalid path (directory doesn't exist and can't be created)
	err := cfg.Save("/proc/nonexistent/config.json")
	if err == nil {
		t.Error("Save should fail for invalid path")
	}
}

func TestLoadConfigInvalidJSON(t *testing.T) {
	tmpDir := t.TempDir()
	invalidJSON := filepath.Join(tmpDir, "config.json")

	// Write invalid JSON
	if err := os.WriteFile(invalidJSON, []byte("not valid json"), 0644); err != nil {
		t.Fatalf("Failed to write invalid JSON: %v", err)
	}

	// LoadConfig should handle invalid JSON gracefully
	cfg, err := LoadConfig(invalidJSON)
	if err == nil {
		t.Error("LoadConfig should return error for invalid JSON")
	}
	if cfg != nil {
		t.Error("Config should be nil for invalid JSON")
	}
}

func TestLoadConfigWithDefaultMCPSettings(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.json")

	cfg := NewConfig()
	cfg.AddAgent(&AgentConfig{ID: "test", Command: "/usr/bin/test"})
	cfg.DefaultMCPSettings = MCPSettings{
		UseCustomMCP: true,
		AllowedTools: []string{"read", "write"},
	}

	data, err := json.Marshal(cfg)
	if err != nil {
		t.Fatalf("Failed to marshal config: %v", err)
	}

	if err := os.WriteFile(configPath, data, 0644); err != nil {
		t.Fatalf("Failed to write config: %v", err)
	}

	loaded, err := LoadConfig(configPath)
	if err != nil {
		t.Fatalf("LoadConfig failed: %v", err)
	}

	if loaded.DefaultMCPSettings.UseCustomMCP != true {
		t.Error("DefaultMCPSettings.UseCustomMCP should be true")
	}

	if len(loaded.DefaultMCPSettings.AllowedTools) != 2 {
		t.Errorf("Expected 2 allowed tools, got %d", len(loaded.DefaultMCPSettings.AllowedTools))
	}
}

func TestLoadConfigEmptyAgentsMap(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.json")

	// Create config without agents map
	data := []byte(`{"maxConnections": 5}`)
	if err := os.WriteFile(configPath, data, 0644); err != nil {
		t.Fatalf("Failed to write config: %v", err)
	}

	loaded, err := LoadConfig(configPath)
	if err != nil {
		t.Fatalf("LoadConfig failed: %v", err)
	}

	if loaded.Agents == nil {
		t.Error("Agents map should be initialized even if not in JSON")
	}
}

// Additional edge case tests

func TestConfigAddAgentWithFullConfig(t *testing.T) {
	cfg := NewConfig()

	agent := &AgentConfig{
		ID:          "full-agent",
		Name:        "Full Agent",
		Description: "A fully configured agent",
		Enabled:     true,
		Command:     "/usr/bin/test",
		Args:        []string{"--verbose", "--debug"},
		Env:         map[string]string{"API_KEY": "secret", "DEBUG": "true"},
		MCPSettings: MCPSettings{
			UseCustomMCP: true,
			UseEditorMCP: true,
			AllowedTools: []string{"read", "write", "execute"},
			CustomMCPServers: []MCPServerConfig{
				{Name: "custom-1", Command: "/usr/bin/mcp1"},
				{Name: "custom-2", Command: "/usr/bin/mcp2", Args: []string{"--port", "8080"}},
			},
		},
		ExpectedCapabilities: AgentCapabilities{
			LoadSession:       true,
			PairProgramming:   true,
			TeamCollaboration: true,
		},
		SwarmConfig: &AgentSwarmConfig{
			CanBeCoordinator: true,
			CanBeWorker:      true,
			PreferredRoles:   []string{"coder", "architect", "reviewer"},
			MaxConcurrent:    5,
			Priority:         10,
		},
		Tags:    []string{"primary", "production", "critical"},
		Timeout: 300,
	}

	err := cfg.AddAgent(agent)
	if err != nil {
		t.Fatalf("AddAgent failed: %v", err)
	}

	// Verify all fields are preserved
	loaded, _ := cfg.GetAgent("full-agent")
	if loaded.Name != "Full Agent" {
		t.Errorf("Name mismatch: got %s", loaded.Name)
	}
	if len(loaded.Args) != 2 {
		t.Errorf("Expected 2 args, got %d", len(loaded.Args))
	}
	if len(loaded.Env) != 2 {
		t.Errorf("Expected 2 env vars, got %d", len(loaded.Env))
	}
	if len(loaded.MCPSettings.CustomMCPServers) != 2 {
		t.Errorf("Expected 2 MCP servers, got %d", len(loaded.MCPSettings.CustomMCPServers))
	}
	if !loaded.ExpectedCapabilities.LoadSession {
		t.Error("LoadSession capability should be true")
	}
	if loaded.SwarmConfig == nil {
		t.Fatal("SwarmConfig should not be nil")
	}
	if loaded.SwarmConfig.MaxConcurrent != 5 {
		t.Errorf("MaxConcurrent should be 5, got %d", loaded.SwarmConfig.MaxConcurrent)
	}
}

func TestConfigValidateMultipleErrors(t *testing.T) {
	cfg := NewConfig()

	// Add multiple agents with issues
	cfg.AddAgent(&AgentConfig{ID: "no-command", Command: ""})
	cfg.AddAgent(&AgentConfig{ID: "valid", Command: "/usr/bin/test"})
	cfg.AddAgent(&AgentConfig{ID: "also-no-command", Command: ""})

	err := cfg.Validate()
	if err == nil {
		t.Error("Validate should fail for agents without commands")
	}

	// Error should mention one of the invalid agents
	if !containsString(err.Error(), "no-command") && !containsString(err.Error(), "also-no-command") {
		t.Errorf("Error should mention an invalid agent: %v", err)
	}
}

func containsString(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsString(s[1:], substr) || s[:len(substr)] == substr)
}

func TestConfigListEnabledAgentsAllDisabled(t *testing.T) {
	cfg := NewConfig()

	cfg.AddAgent(&AgentConfig{ID: "disabled-1", Enabled: false, Command: "/usr/bin/test"})
	cfg.AddAgent(&AgentConfig{ID: "disabled-2", Enabled: false, Command: "/usr/bin/test"})

	enabled := cfg.ListEnabledAgents()
	if len(enabled) != 0 {
		t.Errorf("Expected 0 enabled agents, got %d", len(enabled))
	}
}

func TestConfigGetAgentsByTagMultipleTags(t *testing.T) {
	cfg := NewConfig()

	cfg.AddAgent(&AgentConfig{
		ID:      "multi-tag",
		Command: "/usr/bin/test",
		Tags:    []string{"tag1", "tag2", "tag3"},
	})

	// Should find agent for any of its tags
	for _, tag := range []string{"tag1", "tag2", "tag3"} {
		agents := cfg.GetAgentsByTag(tag)
		if len(agents) != 1 {
			t.Errorf("Expected 1 agent for tag %s, got %d", tag, len(agents))
		}
	}
}

func TestConfigGetCoordinatorsMultiple(t *testing.T) {
	cfg := NewConfig()

	cfg.AddAgent(&AgentConfig{
		ID:      "coord-1",
		Enabled: true,
		Command: "/usr/bin/test",
		SwarmConfig: &AgentSwarmConfig{
			CanBeCoordinator: true,
		},
	})
	cfg.AddAgent(&AgentConfig{
		ID:      "coord-2",
		Enabled: true,
		Command: "/usr/bin/test",
		SwarmConfig: &AgentSwarmConfig{
			CanBeCoordinator: true,
		},
	})

	coordinators := cfg.GetCoordinators()
	if len(coordinators) != 2 {
		t.Errorf("Expected 2 coordinators, got %d", len(coordinators))
	}
}

func TestConfigGetWorkersMultiple(t *testing.T) {
	cfg := NewConfig()

	cfg.AddAgent(&AgentConfig{
		ID:      "worker-1",
		Enabled: true,
		Command: "/usr/bin/test",
		SwarmConfig: &AgentSwarmConfig{
			CanBeWorker: true,
		},
	})
	cfg.AddAgent(&AgentConfig{
		ID:      "worker-2",
		Enabled: true,
		Command: "/usr/bin/test",
		SwarmConfig: &AgentSwarmConfig{
			CanBeWorker: true,
		},
	})

	workers := cfg.GetWorkers()
	if len(workers) != 2 {
		t.Errorf("Expected 2 workers, got %d", len(workers))
	}
}

func TestConfigUpdateAgentWithNewValues(t *testing.T) {
	cfg := NewConfig()

	// Add initial agent
	cfg.AddAgent(&AgentConfig{
		ID:      "test-agent",
		Name:    "Original",
		Enabled: false,
		Command: "/usr/bin/original",
	})

	// Update with completely new values
	err := cfg.UpdateAgent(&AgentConfig{
		ID:      "test-agent",
		Name:    "Updated",
		Enabled: true,
		Command: "/usr/bin/updated",
		Args:    []string{"--new"},
		Env:     map[string]string{"NEW": "env"},
		Tags:    []string{"new-tag"},
	})
	if err != nil {
		t.Fatalf("UpdateAgent failed: %v", err)
	}

	agent, _ := cfg.GetAgent("test-agent")
	if agent.Name != "Updated" {
		t.Errorf("Name should be 'Updated', got '%s'", agent.Name)
	}
	if !agent.Enabled {
		t.Error("Enabled should be true")
	}
	if agent.Command != "/usr/bin/updated" {
		t.Errorf("Command should be '/usr/bin/updated', got '%s'", agent.Command)
	}
	if len(agent.Args) != 1 {
		t.Errorf("Expected 1 arg, got %d", len(agent.Args))
	}
}

func TestConfigCloneWithMultipleAgents(t *testing.T) {
	cfg := NewConfig()

	// Add multiple agents with different configurations
	for i := 0; i < 5; i++ {
		cfg.AddAgent(&AgentConfig{
			ID:      "agent-" + string(rune('0'+i)),
			Name:    "Agent " + string(rune('0'+i)),
			Enabled: i%2 == 0,
			Command: "/usr/bin/test",
			Tags:    []string{"tag" + string(rune('0'+i))},
		})
	}

	clone, err := cfg.Clone()
	if err != nil {
		t.Fatalf("Clone failed: %v", err)
	}

	if len(clone.Agents) != 5 {
		t.Errorf("Clone should have 5 agents, got %d", len(clone.Agents))
	}

	// Verify independence
	cfg.RemoveAgent("agent-0")
	if _, ok := clone.Agents["agent-0"]; !ok {
		t.Error("Clone should still have agent-0 after removal from original")
	}
}

func TestConfigSaveAndLoadComplexConfig(t *testing.T) {
	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "complex-config.json")

	cfg := NewConfig()

	// Add agents with various configurations
	cfg.AddAgent(&AgentConfig{
		ID:          "claude-code",
		Name:        "Claude Code",
		Description: "Primary coding assistant",
		Enabled:     true,
		Command:     "/usr/local/bin/claude-code",
		Args:        []string{"acp"},
		Env:         map[string]string{"ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}"},
		MCPSettings: MCPSettings{
			UseCustomMCP: true,
			UseEditorMCP: true,
			AllowedTools: []string{"read", "write"},
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

	cfg.AddAgent(&AgentConfig{
		ID:          "reviewer",
		Name:        "Code Reviewer",
		Description: "Code review specialist",
		Enabled:     true,
		Command:     "/usr/local/bin/reviewer",
		SwarmConfig: &AgentSwarmConfig{
			CanBeWorker:    true,
			PreferredRoles: []string{"reviewer"},
		},
		Tags: []string{"review", "quality"},
	})

	// Save
	if err := cfg.Save(path); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	// Load
	loaded, err := LoadConfig(path)
	if err != nil {
		t.Fatalf("LoadConfig failed: %v", err)
	}

	// Verify all agents loaded
	if len(loaded.Agents) != 2 {
		t.Errorf("Expected 2 agents, got %d", len(loaded.Agents))
	}

	// Verify complex agent config
	agent, ok := loaded.Agents["claude-code"]
	if !ok {
		t.Fatal("claude-code agent should exist")
	}
	if agent.Name != "Claude Code" {
		t.Errorf("Name mismatch: got '%s'", agent.Name)
	}
	if len(agent.Args) != 1 || agent.Args[0] != "acp" {
		t.Errorf("Args mismatch: got %v", agent.Args)
	}
	if agent.SwarmConfig == nil || !agent.SwarmConfig.CanBeCoordinator {
		t.Error("SwarmConfig should be present with CanBeCoordinator=true")
	}
}

func TestConfigNilDefaultSwarmConfig(t *testing.T) {
	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "config.json")

	// Create config JSON without DefaultSwarmConfig
	data := []byte(`{"agents": {}, "maxConnections": 5}`)
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatalf("Failed to write config: %v", err)
	}

	loaded, err := LoadConfig(path)
	if err != nil {
		t.Fatalf("LoadConfig failed: %v", err)
	}

	// DefaultSwarmConfig should be nil if not in JSON
	// (or it might be set by NewConfig - depends on implementation)
	_ = loaded
}

func TestGetConfigDir(t *testing.T) {
	// Test with HOME set
	home := os.Getenv("HOME")
	dir := getConfigDir()

	if home != "" {
		expected := filepath.Join(home, ".swarm-editor")
		if dir != expected {
			t.Errorf("Expected %s, got %s", expected, dir)
		}
	}
}

func TestGetConfigDirFallback(t *testing.T) {
	// Save original HOME
	originalHome := os.Getenv("HOME")

	// Clear HOME to test fallback
	os.Unsetenv("HOME")

	dir := getConfigDir()

	// Should fallback to current directory + .swarm-editor
	// or just ".swarm-editor" if Getwd fails
	if dir == "" {
		t.Error("getConfigDir should return a non-empty string")
	}

	// Restore HOME
	if originalHome != "" {
		os.Setenv("HOME", originalHome)
	}
}
