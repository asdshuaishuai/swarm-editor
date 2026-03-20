package agent

import (
	"context"
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
