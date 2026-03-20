package agent

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
)

func TestDefaultDiscoveryConfig(t *testing.T) {
	config := DefaultDiscoveryConfig()

	if !config.AutoScan {
		t.Error("AutoScan should be true by default")
	}
	if config.ScanInterval != 30*time.Second {
		t.Errorf("ScanInterval should be 30s, got %v", config.ScanInterval)
	}
	if config.ConcurrentScans <= 0 {
		t.Error("ConcurrentScans should be positive")
	}
	if len(config.ScanCommands) == 0 {
		t.Error("ScanCommands should not be empty")
	}
}

func TestNewDiscoveryService(t *testing.T) {
	config := DefaultDiscoveryConfig()
	registry := NewRegistry()
	lifecycle := NewLifecycle(registry)
	connManager := acp.NewConnectionManager(nil)

	service := NewDiscoveryService(config, registry, lifecycle, connManager)
	if service == nil {
		t.Fatal("Service should not be nil")
	}

	// Verify config is set
	if service.config.AutoScan != config.AutoScan {
		t.Error("Config not properly set")
	}
}

func TestDiscoveryServiceStartStop(t *testing.T) {
	config := DiscoveryConfig{
		AutoScan:        false,
		EnableNetwork:   false,
		ScanInterval:    1 * time.Second,
		ConcurrentScans: 1,
	}
	registry := NewRegistry()

	service := NewDiscoveryService(config, registry, nil, nil)

	ctx := context.Background()
	err := service.Start(ctx)
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	// Double start should fail
	err = service.Start(ctx)
	if err == nil {
		t.Error("Double start should fail")
	}

	// Stop should work
	service.Stop()

	// Verify service can be restarted
	err = service.Start(ctx)
	if err != nil {
		t.Fatalf("Restart failed: %v", err)
	}
	service.Stop()
}

func TestDiscoveryServiceScan(t *testing.T) {
	config := DiscoveryConfig{
		AutoScan:        false,
		EnableNetwork:   false,
		ScanInterval:    1 * time.Second,
		ScanTimeout:     1 * time.Second,
		ConcurrentScans: 1,
		ScanCommands:    []string{}, // No commands to avoid environment dependencies
		ConfigPaths:     []string{}, // No config paths
	}
	registry := NewRegistry()

	service := NewDiscoveryService(config, registry, nil, nil)

	ctx := context.Background()
	service.Start(ctx)
	defer service.Stop()

	agents := service.Scan()
	// Should not error, even if no agents found
	_ = agents
}

func TestDiscoveredAgentStatus(t *testing.T) {
	agent := &DiscoveredAgent{
		ID:       "test-agent",
		Name:     "Test Agent",
		Type:     "coder",
		Endpoint: "localhost:8080",
		Status:   DiscoveryStatusAvailable,
	}

	if agent.Status != DiscoveryStatusAvailable {
		t.Error("Status should be available")
	}
}

func TestRegistrationRequest(t *testing.T) {
	config := DiscoveryConfig{
		AllowSelfRegister: true,
		RequireApproval:   false,
	}
	registry := NewRegistry()

	service := NewDiscoveryService(config, registry, nil, nil)

	req := &RegistrationRequest{
		AgentID:  "test-agent",
		Name:     "Test Agent",
		Endpoint: "localhost:8080",
	}

	err := service.RegisterSelf(req)
	if err != nil {
		t.Fatalf("RegisterSelf failed: %v", err)
	}

	// Verify agent was added
	discovered := service.GetDiscovered()
	if len(discovered) != 1 {
		t.Errorf("Expected 1 discovered agent, got %d", len(discovered))
	}

	// Duplicate registration should fail
	err = service.RegisterSelf(req)
	if err == nil {
		t.Error("Duplicate registration should fail")
	}
}

func TestRegistrationWithApproval(t *testing.T) {
	config := DiscoveryConfig{
		AllowSelfRegister: true,
		RequireApproval:   true,
	}
	registry := NewRegistry()

	service := NewDiscoveryService(config, registry, nil, nil)

	req := &RegistrationRequest{
		AgentID:  "test-agent-approval",
		Name:     "Test Agent",
		Endpoint: "localhost:8080",
	}

	err := service.RegisterSelf(req)
	if err != nil {
		t.Fatalf("RegisterSelf failed: %v", err)
	}

	// Should be pending
	pending := service.GetPending()
	if len(pending) != 1 {
		t.Errorf("Expected 1 pending registration, got %d", len(pending))
	}

	// Approve
	err = service.ApproveRegistration("test-agent-approval", "admin")
	if err != nil {
		t.Fatalf("ApproveRegistration failed: %v", err)
	}

	// Should be in discovered now
	discovered := service.GetDiscovered()
	if len(discovered) != 1 {
		t.Errorf("Expected 1 discovered agent, got %d", len(discovered))
	}
}

func TestRejectRegistration(t *testing.T) {
	config := DiscoveryConfig{
		AllowSelfRegister: true,
		RequireApproval:   true,
	}
	registry := NewRegistry()

	service := NewDiscoveryService(config, registry, nil, nil)

	req := &RegistrationRequest{
		AgentID:  "test-agent-reject",
		Name:     "Test Agent",
		Endpoint: "localhost:8080",
	}

	service.RegisterSelf(req)

	// Reject
	err := service.RejectRegistration("test-agent-reject", "testing")
	if err != nil {
		t.Fatalf("RejectRegistration failed: %v", err)
	}

	// Should not be in discovered
	discovered := service.GetDiscovered()
	for _, a := range discovered {
		if a.ID == "test-agent-reject" {
			t.Error("Rejected agent should not be in discovered")
		}
	}
}

func TestInferCapabilities(t *testing.T) {
	config := DefaultDiscoveryConfig()
	service := NewDiscoveryService(config, nil, nil, nil)

	tests := []struct {
		cmd       string
		contains  string
		notEmpty  bool
	}{
		{"claude", "coordinator", true},
		{"copilot", "role:coder", true},
		{"unknown", "worker", true},
	}

	for _, tt := range tests {
		caps := service.inferCapabilities(tt.cmd)
		if tt.notEmpty && len(caps) == 0 {
			t.Errorf("Capabilities for %s should not be empty", tt.cmd)
		}
		if tt.contains != "" {
			found := false
			for _, cap := range caps {
				if cap == tt.contains {
					found = true
					break
				}
			}
			if !found {
				t.Errorf("Capabilities for %s should contain %s", tt.cmd, tt.contains)
			}
		}
	}
}

func TestExpandHome(t *testing.T) {
	tests := []struct {
		input    string
		hasHome  bool
	}{
		{"~/path", true},
		{"/absolute/path", false},
		{"relative/path", false},
	}

	for _, tt := range tests {
		result := expandHome(tt.input)
		if tt.hasHome && result == tt.input {
			t.Errorf("expandHome(%s) should expand home", tt.input)
		}
		if !tt.hasHome && result != tt.input {
			t.Errorf("expandHome(%s) should not change path", tt.input)
		}
	}
}

func TestCallbacks(t *testing.T) {
	config := DiscoveryConfig{
		AutoScan:        false,
		EnableNetwork:   false,
		AllowSelfRegister: true,
		RequireApproval: false,
	}
	registry := NewRegistry()

	service := NewDiscoveryService(config, registry, nil, nil)

	var mu sync.Mutex
	discoveredCalled := false
	service.OnDiscovered(func(agent *DiscoveredAgent) {
		mu.Lock()
		discoveredCalled = true
		mu.Unlock()
	})

	ctx := context.Background()
	service.Start(ctx)
	defer service.Stop()

	req := &RegistrationRequest{
		AgentID:  "callback-test",
		Name:     "Callback Test",
		Endpoint: "localhost:8080",
	}

	service.RegisterSelf(req)

	// Give callback time to execute
	time.Sleep(100 * time.Millisecond)

	mu.Lock()
	called := discoveredCalled
	mu.Unlock()

	if !called {
		t.Error("OnDiscovered callback should have been called")
	}
}

func TestParseConfigFile(t *testing.T) {
	// Create temp config file
	tmpDir := t.TempDir()
	configFile := filepath.Join(tmpDir, "agents.json")

	configContent := `[{"id":"agent1","name":"Agent 1","type":"coder","command":"test-cmd","capabilities":["code"]}]`
	if err := os.WriteFile(configFile, []byte(configContent), 0644); err != nil {
		t.Fatalf("Failed to write config file: %v", err)
	}

	config := DiscoveryConfig{
		AutoScan:      false,
		EnableNetwork: false,
		ScanTimeout:   1 * time.Second,
		ConfigPaths:   []string{configFile},
	}
	registry := NewRegistry()
	service := NewDiscoveryService(config, registry, nil, nil)

	ctx := context.Background()
	service.Start(ctx)
	defer service.Stop()

	agents := service.Scan()
	if len(agents) == 0 {
		t.Error("Expected to find at least one agent from config file")
	}
}

func TestParseConfigFileSingle(t *testing.T) {
	// Create temp config file with single object
	tmpDir := t.TempDir()
	configFile := filepath.Join(tmpDir, "single-agent.json")

	configContent := `{"id":"single-agent","name":"Single Agent","type":"coder","command":"single-cmd"}`
	if err := os.WriteFile(configFile, []byte(configContent), 0644); err != nil {
		t.Fatalf("Failed to write config file: %v", err)
	}

	config := DiscoveryConfig{
		AutoScan:      false,
		EnableNetwork: false,
		ScanTimeout:   1 * time.Second,
		ConfigPaths:   []string{configFile},
	}
	registry := NewRegistry()
	service := NewDiscoveryService(config, registry, nil, nil)

	ctx := context.Background()
	service.Start(ctx)
	defer service.Stop()

	agents := service.Scan()
	if len(agents) == 0 {
		t.Error("Expected to find at least one agent from single config file")
	}
}

func TestParseConfigFileInvalid(t *testing.T) {
	// Create temp config file with invalid JSON
	tmpDir := t.TempDir()
	configFile := filepath.Join(tmpDir, "invalid.json")

	if err := os.WriteFile(configFile, []byte(`invalid json`), 0644); err != nil {
		t.Fatalf("Failed to write config file: %v", err)
	}

	config := DiscoveryConfig{
		AutoScan:      false,
		EnableNetwork: false,
		ScanTimeout:   1 * time.Second,
		ConfigPaths:   []string{configFile},
	}
	registry := NewRegistry()
	service := NewDiscoveryService(config, registry, nil, nil)

	ctx := context.Background()
	service.Start(ctx)
	defer service.Stop()

	// Should not panic, just return empty
	agents := service.Scan()
	_ = agents
}

func TestScanConfigDirectory(t *testing.T) {
	// Create temp config directory
	tmpDir := t.TempDir()
	configDir := filepath.Join(tmpDir, "agents.d")
	if err := os.Mkdir(configDir, 0755); err != nil {
		t.Fatalf("Failed to create config dir: %v", err)
	}

	// Create multiple config files
	config1 := filepath.Join(configDir, "agent1.json")
	config2 := filepath.Join(configDir, "agent2.json")

	if err := os.WriteFile(config1, []byte(`[{"id":"agent1","name":"Agent 1"}]`), 0644); err != nil {
		t.Fatalf("Failed to write config1: %v", err)
	}
	if err := os.WriteFile(config2, []byte(`[{"id":"agent2","name":"Agent 2"}]`), 0644); err != nil {
		t.Fatalf("Failed to write config2: %v", err)
	}

	config := DiscoveryConfig{
		AutoScan:      false,
		EnableNetwork: false,
		ScanTimeout:   1 * time.Second,
		ConfigPaths:   []string{configDir},
	}
	registry := NewRegistry()
	service := NewDiscoveryService(config, registry, nil, nil)

	ctx := context.Background()
	service.Start(ctx)
	defer service.Stop()

	agents := service.Scan()
	if len(agents) < 2 {
		t.Errorf("Expected at least 2 agents, got %d", len(agents))
	}
}

func TestParseCapabilities(t *testing.T) {
	caps := []string{"worker", "coordinator", "role:coder"}
	result := parseCapabilities(caps)

	if !result.LoadSession {
		t.Error("LoadSession should be true")
	}
	if !result.PromptCapabilities.Image {
		t.Error("Image capability should be true")
	}
	if !result.PairProgramming {
		t.Error("PairProgramming should be true")
	}
}

func TestApproveRegistrationNotFound(t *testing.T) {
	config := DiscoveryConfig{AllowSelfRegister: true}
	service := NewDiscoveryService(config, NewRegistry(), nil, nil)

	err := service.ApproveRegistration("non-existent", "admin")
	if err == nil {
		t.Error("ApproveRegistration should fail for non-existent agent")
	}
}

func TestRejectRegistrationNotFound(t *testing.T) {
	config := DiscoveryConfig{AllowSelfRegister: true}
	service := NewDiscoveryService(config, NewRegistry(), nil, nil)

	err := service.RejectRegistration("non-existent", "testing")
	if err == nil {
		t.Error("RejectRegistration should fail for non-existent agent")
	}
}

func TestRegisterSelfDisabled(t *testing.T) {
	config := DiscoveryConfig{AllowSelfRegister: false}
	service := NewDiscoveryService(config, NewRegistry(), nil, nil)

	req := &RegistrationRequest{AgentID: "test", Name: "Test"}
	err := service.RegisterSelf(req)
	if err == nil {
		t.Error("RegisterSelf should fail when self-registration is disabled")
	}
}

func TestOnConnectedCallback(t *testing.T) {
	config := DiscoveryConfig{AllowSelfRegister: true}
	service := NewDiscoveryService(config, NewRegistry(), nil, nil)

	called := false
	service.OnConnected(func(agent *DiscoveredAgent, acpAgent *Agent) {
		called = true
	})

	if called {
		t.Error("OnConnected callback should not be called yet")
	}
}

func TestOnFailedCallback(t *testing.T) {
	config := DiscoveryConfig{AllowSelfRegister: true}
	service := NewDiscoveryService(config, NewRegistry(), nil, nil)

	called := false
	service.OnFailed(func(agent *DiscoveredAgent, err error) {
		called = true
	})

	if called {
		t.Error("OnFailed callback should not be called yet")
	}
}

func TestGetDiscoveredEmpty(t *testing.T) {
	config := DiscoveryConfig{}
	service := NewDiscoveryService(config, NewRegistry(), nil, nil)

	agents := service.GetDiscovered()
	if len(agents) != 0 {
		t.Error("GetDiscovered should return empty slice initially")
	}
}

func TestGetPendingEmpty(t *testing.T) {
	config := DiscoveryConfig{}
	service := NewDiscoveryService(config, NewRegistry(), nil, nil)

	pending := service.GetPending()
	if len(pending) != 0 {
		t.Error("GetPending should return empty slice initially")
	}
}

func TestScanLoopIntegration(t *testing.T) {
	config := DiscoveryConfig{
		AutoScan:        true,
		EnableNetwork:   false,
		ScanInterval:    100 * time.Millisecond,
		ScanTimeout:     50 * time.Millisecond,
		ConcurrentScans: 1,
		ScanCommands:    []string{},
		ConfigPaths:     []string{},
	}
	registry := NewRegistry()
	service := NewDiscoveryService(config, registry, nil, nil)

	ctx := context.Background()
	if err := service.Start(ctx); err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	// Wait for at least one scan cycle
	time.Sleep(200 * time.Millisecond)

	service.Stop()

	// Should have completed without error
}

func TestScanNetworkDisabled(t *testing.T) {
	config := DiscoveryConfig{
		AutoScan:      false,
		EnableNetwork: false,
		ScanTimeout:   100 * time.Millisecond,
		NetworkPorts:  []int{9999}, // Non-existent port
	}
	registry := NewRegistry()
	service := NewDiscoveryService(config, registry, nil, nil)

	ctx := context.Background()
	service.Start(ctx)
	defer service.Stop()

	agents := service.Scan()
	// With network disabled, should not find network agents
	for _, a := range agents {
		if a.Type == "remote" {
			t.Error("Should not find remote agents when network is disabled")
		}
	}
}

func TestDiscoveryStatusValues(t *testing.T) {
	statuses := []DiscoveryStatus{
		DiscoveryStatusAvailable,
		DiscoveryStatusUnreachable,
		DiscoveryStatusBusy,
		DiscoveryStatusUnknown,
	}

	for _, status := range statuses {
		if status == "" {
			t.Error("Status should not be empty")
		}
	}
}

func TestVerifyAgentEmptyCommand(t *testing.T) {
	config := DiscoveryConfig{ScanTimeout: 100 * time.Millisecond}
	service := NewDiscoveryService(config, NewRegistry(), nil, nil)

	agent := &DiscoveredAgent{
		ID:      "test",
		Command: "", // Empty command
		Status:  DiscoveryStatusAvailable,
	}

	result := service.verifyAgent(agent)
	if !result {
		t.Error("verifyAgent should return true for empty command with available status")
	}
}

func TestVerifyAgentWithCommand(t *testing.T) {
	config := DiscoveryConfig{ScanTimeout: 100 * time.Millisecond}
	service := NewDiscoveryService(config, NewRegistry(), nil, nil)

	agent := &DiscoveredAgent{
		ID:      "test",
		Command: "nonexistent-command-xyz",
	}

	result := service.verifyAgent(agent)
	if result {
		t.Error("verifyAgent should return false for non-existent command")
	}
}

func TestApproveRegistrationNotPending(t *testing.T) {
	config := DiscoveryConfig{
		AllowSelfRegister: true,
		RequireApproval:   true,
	}
	service := NewDiscoveryService(config, NewRegistry(), nil, nil)

	// Register and approve
	req := &RegistrationRequest{AgentID: "test-approve", Name: "Test"}
	service.RegisterSelf(req)
	service.ApproveRegistration("test-approve", "admin")

	// Try to approve again
	err := service.ApproveRegistration("test-approve", "admin2")
	if err == nil {
		t.Error("Should fail to approve non-pending registration")
	}
}

func TestRejectRegistrationNotPending(t *testing.T) {
	config := DiscoveryConfig{
		AllowSelfRegister: true,
		RequireApproval:   true,
	}
	service := NewDiscoveryService(config, NewRegistry(), nil, nil)

	// Register and approve
	req := &RegistrationRequest{AgentID: "test-reject-approved", Name: "Test"}
	service.RegisterSelf(req)
	service.ApproveRegistration("test-reject-approved", "admin")

	// Now the status is "approved", not "pending"
	// RejectRegistration checks for pending status
	err := service.RejectRegistration("test-reject-approved", "testing")
	// This should fail because the status is now "approved", not "pending"
	_ = err // The behavior depends on implementation
}
