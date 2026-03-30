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

func TestValidate_InvalidDuration(t *testing.T) {
	cfg := DefaultConfig()

	// Set an invalid duration
	cfg.ACP.Timeout = "not-a-duration"
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for invalid duration")
	}
	if err.Error() != `invalid duration for "acp.timeout": "not-a-duration" (time: invalid duration "not-a-duration")` {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestValidate_EmptyDurationAllowed(t *testing.T) {
	cfg := DefaultConfig()

	// Empty duration should not fail validation
	cfg.ACP.Timeout = ""
	err := cfg.Validate()
	if err != nil {
		t.Errorf("empty duration should be valid, got: %v", err)
	}
}

func TestValidate_AllDurationsParsed(t *testing.T) {
	cfg := DefaultConfig()

	// Default config should pass (all durations are valid)
	if err := cfg.Validate(); err != nil {
		t.Fatalf("default config should validate, got: %v", err)
	}

	// Set invalid durations in multiple places
	cfg.Agent.HeartbeatInterval = "30xs"
	cfg.Swarm.TaskTimeout = "abc"
	cfg.Pair.DefaultSessionTimeout = ""
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for invalid durations")
	}
	// Should fail on the first invalid one
	if !contains(err.Error(), "agent.heartbeat_interval") {
		t.Errorf("expected error about agent.heartbeat_interval, got: %v", err)
	}
}

func TestValidate_PortTooHigh(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Server.Port = 70000
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for port > 65535")
	}
	if !contains(err.Error(), "server port") {
		t.Errorf("expected error about server port, got: %v", err)
	}
}

func TestValidate_NegativePort(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Server.Port = -1
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for negative port")
	}
}

func TestValidate_GRPCPortTooHigh(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Server.GRPCPort = 99999
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for grpc port > 65535")
	}
	if !contains(err.Error(), "grpc port") {
		t.Errorf("expected error about grpc port, got: %v", err)
	}
}

func TestValidate_NegativeGRPCPort(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Server.GRPCPort = -1
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for negative grpc port")
	}
}

func TestValidate_NegativeMaxMessageSize(t *testing.T) {
	cfg := DefaultConfig()
	cfg.ACP.MaxMessageSize = -100
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for negative max message size")
	}
	if !contains(err.Error(), "max message size") {
		t.Errorf("expected error about max message size, got: %v", err)
	}
}

func TestValidate_NegativeMaxConcurrentSessions(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Agent.MaxConcurrentSessions = -5
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for negative max concurrent sessions")
	}
	if !contains(err.Error(), "max concurrent sessions") {
		t.Errorf("expected error about max concurrent sessions, got: %v", err)
	}
}

func TestValidate_NegativeMaxAgents(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Swarm.MaxAgents = -1
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for negative max agents")
	}
	if !contains(err.Error(), "max agents") {
		t.Errorf("expected error about max agents, got: %v", err)
	}
}

func TestValidate_MinAgreementOutOfRange(t *testing.T) {
	cfg := DefaultConfig()

	// Test negative
	cfg.Swarm.Consensus.MinAgreement = -0.5
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for negative min agreement")
	}
	if !contains(err.Error(), "min agreement") {
		t.Errorf("expected error about min agreement, got: %v", err)
	}

	// Test > 1
	cfg.Swarm.Consensus.MinAgreement = 1.5
	err = cfg.Validate()
	if err == nil {
		t.Fatal("expected error for min agreement > 1")
	}
}

func TestValidate_NegativeMaxTeams(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Team.MaxTeams = -10
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for negative max teams")
	}
	if !contains(err.Error(), "max teams") {
		t.Errorf("expected error about max teams, got: %v", err)
	}
}

func TestValidate_NegativeMaxMembersPerTeam(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Team.MaxMembersPerTeam = -1
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for negative max members per team")
	}
	if !contains(err.Error(), "max members per team") {
		t.Errorf("expected error about max members per team, got: %v", err)
	}
}

func TestValidate_FontSizeTooSmall(t *testing.T) {
	cfg := DefaultConfig()
	cfg.UI.EditorFontSize = 4
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for font size < 8")
	}
	if !contains(err.Error(), "editor font size") {
		t.Errorf("expected error about editor font size, got: %v", err)
	}
}

func TestValidate_FontSizeTooLarge(t *testing.T) {
	cfg := DefaultConfig()
	cfg.UI.EditorFontSize = 100
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for font size > 72")
	}
}

func TestValidate_FontSizeBoundary(t *testing.T) {
	cfg := DefaultConfig()

	// 8 is the minimum allowed
	cfg.UI.EditorFontSize = 8
	if err := cfg.Validate(); err != nil {
		t.Errorf("font size 8 should be valid, got: %v", err)
	}

	// 72 is the maximum allowed
	cfg.UI.EditorFontSize = 72
	if err := cfg.Validate(); err != nil {
		t.Errorf("font size 72 should be valid, got: %v", err)
	}
}

func TestValidate_PortZero(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Server.Port = 0
	if err := cfg.Validate(); err != nil {
		t.Errorf("port 0 should be valid, got: %v", err)
	}
}

func TestValidate_PortMax(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Server.Port = 65535
	if err := cfg.Validate(); err != nil {
		t.Errorf("port 65535 should be valid, got: %v", err)
	}
}

func TestValidate_InvalidConsensusTimeout(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Swarm.Consensus.Timeout = "not-a-time"
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for invalid consensus timeout")
	}
	if !contains(err.Error(), "consensus.timeout") {
		t.Errorf("expected error about consensus.timeout, got: %v", err)
	}
}

func TestValidate_InvalidSessionTimeout(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Agent.SessionTimeout = "xyz"
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for invalid session timeout")
	}
	if !contains(err.Error(), "session_timeout") {
		t.Errorf("expected error about session_timeout, got: %v", err)
	}
}

func TestValidate_InvalidPairTimeouts(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Pair.DefaultSessionTimeout = "bad"
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for invalid pair timeout")
	}
	if !contains(err.Error(), "default_session_timeout") {
		t.Errorf("expected error about pair timeout, got: %v", err)
	}

	cfg.Pair.DefaultSessionTimeout = "30m"
	cfg.Pair.RoleSwitchCooldown = "also-bad"
	err = cfg.Validate()
	if err == nil {
		t.Fatal("expected error for invalid role switch cooldown")
	}
	if !contains(err.Error(), "role_switch_cooldown") {
		t.Errorf("expected error about role_switch_cooldown, got: %v", err)
	}
}

func TestValidate_InvalidTeamSyncInterval(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Team.WorkspaceSyncInterval = "nope"
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for invalid workspace sync interval")
	}
	if !contains(err.Error(), "workspace_sync_interval") {
		t.Errorf("expected error about workspace_sync_interval, got: %v", err)
	}
}

func TestValidate_ZeroValues(t *testing.T) {
	cfg := DefaultConfig()
	cfg.ACP.MaxMessageSize = 0
	cfg.Agent.MaxConcurrentSessions = 0
	cfg.Swarm.MaxAgents = 0
	cfg.Team.MaxTeams = 0
	cfg.Team.MaxMembersPerTeam = 0
	if err := cfg.Validate(); err != nil {
		t.Errorf("zero values should be valid, got: %v", err)
	}
}

func TestValidate_MinAgreementBoundary(t *testing.T) {
	cfg := DefaultConfig()

	cfg.Swarm.Consensus.MinAgreement = 0
	if err := cfg.Validate(); err != nil {
		t.Errorf("min agreement 0 should be valid, got: %v", err)
	}

	cfg.Swarm.Consensus.MinAgreement = 1
	if err := cfg.Validate(); err != nil {
		t.Errorf("min agreement 1 should be valid, got: %v", err)
	}
}

func TestValidate_InvalidTaskTimeout(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Swarm.TaskTimeout = "forever"
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for invalid task timeout")
	}
	if !contains(err.Error(), "task_timeout") {
		t.Errorf("expected error about task_timeout, got: %v", err)
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && searchString(s, substr)
}

func searchString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
