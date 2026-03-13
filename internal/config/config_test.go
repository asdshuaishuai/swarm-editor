package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig()

	if cfg == nil {
		t.Fatal("DefaultConfig returned nil")
	}

	// Server config
	if cfg.Server.Host != "127.0.0.1" {
		t.Errorf("Expected Server.Host '127.0.0.1', got '%s'", cfg.Server.Host)
	}
	if cfg.Server.Port != 8080 {
		t.Errorf("Expected Server.Port 8080, got %d", cfg.Server.Port)
	}
	if cfg.Server.GRPCPort != 9090 {
		t.Errorf("Expected Server.GRPCPort 9090, got %d", cfg.Server.GRPCPort)
	}

	// ACP config
	if cfg.ACP.Version != "1.0" {
		t.Errorf("Expected ACP.Version '1.0', got '%s'", cfg.ACP.Version)
	}

	// Agent config
	if cfg.Agent.DefaultType != "coder" {
		t.Errorf("Expected Agent.DefaultType 'coder', got '%s'", cfg.Agent.DefaultType)
	}

	// Swarm config
	if cfg.Swarm.DefaultTopology != "star" {
		t.Errorf("Expected Swarm.DefaultTopology 'star', got '%s'", cfg.Swarm.DefaultTopology)
	}
	if cfg.Swarm.DefaultStrategy != "parallel" {
		t.Errorf("Expected Swarm.DefaultStrategy 'parallel', got '%s'", cfg.Swarm.DefaultStrategy)
	}
	if cfg.Swarm.MaxAgents != 100 {
		t.Errorf("Expected Swarm.MaxAgents 100, got %d", cfg.Swarm.MaxAgents)
	}

	// Pair config
	if cfg.Pair.MaxSuggestions != 10 {
		t.Errorf("Expected Pair.MaxSuggestions 10, got %d", cfg.Pair.MaxSuggestions)
	}

	// Team config
	if cfg.Team.MaxTeams != 50 {
		t.Errorf("Expected Team.MaxTeams 50, got %d", cfg.Team.MaxTeams)
	}

	// LLM config
	if cfg.LLM.DefaultProvider != "claude" {
		t.Errorf("Expected LLM.DefaultProvider 'claude', got '%s'", cfg.LLM.DefaultProvider)
	}
	if len(cfg.LLM.Providers) != 2 {
		t.Errorf("Expected 2 LLM providers, got %d", len(cfg.LLM.Providers))
	}

	// Storage config
	if cfg.Storage.Type != "sqlite" {
		t.Errorf("Expected Storage.Type 'sqlite', got '%s'", cfg.Storage.Type)
	}

	// Logging config
	if cfg.Logging.Level != "info" {
		t.Errorf("Expected Logging.Level 'info', got '%s'", cfg.Logging.Level)
	}

	// UI config
	if cfg.UI.Theme != "dark" {
		t.Errorf("Expected UI.Theme 'dark', got '%s'", cfg.UI.Theme)
	}
}

func TestDefaultConfigProviders(t *testing.T) {
	cfg := DefaultConfig()

	claude, ok := cfg.LLM.Providers["claude"]
	if !ok {
		t.Fatal("Expected claude provider")
	}
	if claude.Model != "claude-sonnet-4-6" {
		t.Errorf("Expected claude model 'claude-sonnet-4-6', got '%s'", claude.Model)
	}

	openai, ok := cfg.LLM.Providers["openai"]
	if !ok {
		t.Fatal("Expected openai provider")
	}
	if openai.Model != "gpt-4" {
		t.Errorf("Expected openai model 'gpt-4', got '%s'", openai.Model)
	}
}

func TestConfigPathDefault(t *testing.T) {
	// Clear env var
	os.Unsetenv("SWARM_EDITOR_CONFIG")

	path := ConfigPath()
	if path == "" {
		t.Error("ConfigPath should not return empty string")
	}

	// Should contain .config/swarm-editor
	if !filepath.IsAbs(path) {
		// If not absolute, it should be the default relative path
		if path != "./configs/default.yaml" {
			t.Logf("ConfigPath returned: %s", path)
		}
	}
}

func TestConfigPathFromEnv(t *testing.T) {
	customPath := "/custom/path/config.yaml"
	os.Setenv("SWARM_EDITOR_CONFIG", customPath)
	defer os.Unsetenv("SWARM_EDITOR_CONFIG")

	path := ConfigPath()
	if path != customPath {
		t.Errorf("Expected ConfigPath '%s', got '%s'", customPath, path)
	}
}

func TestEnsureDir(t *testing.T) {
	// Create a temp directory path for a file
	// EnsureDir creates the parent directory for a file path
	tmpFile := filepath.Join(os.TempDir(), "swarm-editor-test", "nested", "config.yaml")
	expectedDir := filepath.Join(os.TempDir(), "swarm-editor-test", "nested")
	defer os.RemoveAll(filepath.Join(os.TempDir(), "swarm-editor-test"))

	err := EnsureDir(tmpFile)
	if err != nil {
		t.Fatalf("EnsureDir failed: %v", err)
	}

	// Check if parent directory was created
	info, err := os.Stat(expectedDir)
	if err != nil {
		t.Fatalf("Parent directory should exist: %v", err)
	}
	if !info.IsDir() {
		t.Error("Parent path should be a directory")
	}
}

func TestAppConfigStruct(t *testing.T) {
	cfg := &AppConfig{
		Server: ServerConfig{
			Host: "0.0.0.0",
			Port: 3000,
		},
		ACP: ACPConfig{
			Version: "2.0",
		},
		Agent: AgentConfig{
			DefaultType: "reviewer",
		},
		Swarm: SwarmConfig{
			DefaultTopology: "mesh",
			DefaultStrategy: "sequential",
		},
	}

	if cfg.Server.Host != "0.0.0.0" {
		t.Errorf("Server.Host mismatch")
	}
	if cfg.Server.Port != 3000 {
		t.Errorf("Server.Port mismatch")
	}
	if cfg.ACP.Version != "2.0" {
		t.Errorf("ACP.Version mismatch")
	}
	if cfg.Agent.DefaultType != "reviewer" {
		t.Errorf("Agent.DefaultType mismatch")
	}
	if cfg.Swarm.DefaultTopology != "mesh" {
		t.Errorf("Swarm.DefaultTopology mismatch")
	}
}

func TestConsensusConfigDefaults(t *testing.T) {
	cfg := DefaultConfig()

	if cfg.Swarm.Consensus.Algorithm != "simple_majority" {
		t.Errorf("Expected Consensus.Algorithm 'simple_majority', got '%s'", cfg.Swarm.Consensus.Algorithm)
	}
	if cfg.Swarm.Consensus.MinAgreement != 0.51 {
		t.Errorf("Expected Consensus.MinAgreement 0.51, got %f", cfg.Swarm.Consensus.MinAgreement)
	}
}

func TestStorageConfigDefaults(t *testing.T) {
	cfg := DefaultConfig()

	if cfg.Storage.SQLite.Path != "./data/swarm-editor.db" {
		t.Errorf("Expected SQLite.Path './data/swarm-editor.db', got '%s'", cfg.Storage.SQLite.Path)
	}
	if cfg.Storage.Badger.Path != "./data/badger" {
		t.Errorf("Expected Badger.Path './data/badger', got '%s'", cfg.Storage.Badger.Path)
	}
}

func TestLoggingConfigDefaults(t *testing.T) {
	cfg := DefaultConfig()

	if cfg.Logging.Format != "json" {
		t.Errorf("Expected Logging.Format 'json', got '%s'", cfg.Logging.Format)
	}
	if cfg.Logging.Output != "stdout" {
		t.Errorf("Expected Logging.Output 'stdout', got '%s'", cfg.Logging.Output)
	}
	if cfg.Logging.File.MaxSize != 100 {
		t.Errorf("Expected Logging.File.MaxSize 100, got %d", cfg.Logging.File.MaxSize)
	}
}

func TestUIConfigDefaults(t *testing.T) {
	cfg := DefaultConfig()

	if cfg.UI.EditorFont != "Fira Code" {
		t.Errorf("Expected UI.EditorFont 'Fira Code', got '%s'", cfg.UI.EditorFont)
	}
	if cfg.UI.EditorFontSize != 14 {
		t.Errorf("Expected UI.EditorFontSize 14, got %d", cfg.UI.EditorFontSize)
	}
	if cfg.UI.SidebarWidth != 280 {
		t.Errorf("Expected UI.SidebarWidth 280, got %d", cfg.UI.SidebarWidth)
	}
}
