package mcp

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestNewHealthChecker(t *testing.T) {
	hc := NewHealthChecker(nil)
	if hc == nil {
		t.Fatal("NewHealthChecker returned nil")
	}
	if hc.interval != 30*time.Second {
		t.Errorf("expected default interval 30s, got %v", hc.interval)
	}
	if hc.timeout != 5*time.Second {
		t.Errorf("expected default timeout 5s, got %v", hc.timeout)
	}
}

func TestNewHealthCheckerWithConfig(t *testing.T) {
	config := &HealthCheckerConfig{
		Interval: 10 * time.Second,
		Timeout:  2 * time.Second,
	}
	hc := NewHealthChecker(config)

	if hc.interval != 10*time.Second {
		t.Errorf("expected interval 10s, got %v", hc.interval)
	}
	if hc.timeout != 2*time.Second {
		t.Errorf("expected timeout 2s, got %v", hc.timeout)
	}
}

func TestHealthCheckerStartStop(t *testing.T) {
	hc := NewHealthChecker(&HealthCheckerConfig{
		Interval: 100 * time.Millisecond,
	})

	hc.Start()
	if !hc.running {
		t.Error("expected health checker to be running")
	}

	time.Sleep(150 * time.Millisecond)

	hc.Stop()
	if hc.running {
		t.Error("expected health checker to be stopped")
	}
}

func TestHealthCheckerRegisterServer(t *testing.T) {
	hc := NewHealthChecker(nil)
	hc.RegisterServer("test-server")

	if len(hc.statuses) != 1 {
		t.Errorf("expected 1 server, got %d", len(hc.statuses))
	}
}

func TestHealthCheckerUnregisterServer(t *testing.T) {
	hc := NewHealthChecker(nil)
	hc.RegisterServer("test-server")
	hc.UnregisterServer("test-server")

	if len(hc.statuses) != 0 {
		t.Errorf("expected 0 servers, got %d", len(hc.statuses))
	}
}

func TestHealthCheckerGetStatus(t *testing.T) {
	hc := NewHealthChecker(nil)
	hc.RegisterServer("test-server")

	status := hc.GetStatus("test-server")
	if status == nil {
		t.Error("expected status for registered server")
	}

	status = hc.GetStatus("nonexistent")
	if status != nil {
		t.Error("expected nil for nonexistent server")
	}
}

func TestHealthCheckerGetAllStatuses(t *testing.T) {
	hc := NewHealthChecker(nil)
	hc.RegisterServer("server1")
	hc.RegisterServer("server2")

	statuses := hc.GetAllStatuses()
	if len(statuses) != 2 {
		t.Errorf("expected 2 statuses, got %d", len(statuses))
	}
}

func TestHealthCheckerUpdateStatus(t *testing.T) {
	changed := false
	hc := NewHealthChecker(&HealthCheckerConfig{
		OnChange: func(serverName string, status *HealthStatus) {
			changed = true
		},
	})
	hc.RegisterServer("test-server")

	newStatus := &HealthStatus{
		Healthy:     true,
		LastChecked: time.Now(),
	}
	hc.UpdateStatus("test-server", newStatus)

	if !changed {
		t.Error("expected OnChange callback to be called")
	}

	status := hc.GetStatus("test-server")
	if !status.Healthy {
		t.Error("expected status to be healthy")
	}
}

func TestHealthCheckerCheckServer(t *testing.T) {
	hc := NewHealthChecker(nil)

	// Test with disconnected client (no command)
	client := NewClient(&ClientConfig{Name: "test"})

	// Not connected - should return unhealthy
	status := hc.CheckServer(context.Background(), client)
	if status.Healthy {
		t.Error("expected unhealthy status for disconnected client")
	}
	if status.Error == "" {
		t.Error("expected error message for disconnected client")
	}

	// Test with connected client using mock server
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	mockPath := filepath.Join(dir, "mock_server.py")

	client2 := NewClient(&ClientConfig{
		Name:    "test-client",
		Command: "python3",
		Args:    []string{mockPath},
		Timeout: 5,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client2.Connect(ctx); err != nil {
		t.Fatalf("failed to connect client: %v", err)
	}
	defer func() { _ = client2.Disconnect() }()

	// Connected - should return healthy
	status = hc.CheckServer(context.Background(), client2)
	if !status.Healthy {
		t.Errorf("expected healthy status for connected client, got: %s", status.Error)
	}
}

func TestHealthStatusStruct(t *testing.T) {
	status := &HealthStatus{
		Healthy:      true,
		LastChecked:  time.Now(),
		ResponseTime: 100 * time.Millisecond,
		Details: HealthDetails{
			ToolsCount:    5,
			ServerVersion: "1.0.0",
		},
	}

	if !status.Healthy {
		t.Error("expected Healthy to be true")
	}
	if status.Details.ToolsCount != 5 {
		t.Errorf("expected ToolsCount 5, got %d", status.Details.ToolsCount)
	}
}

func TestHealthChecker_CheckAll(t *testing.T) {
	hc := NewHealthChecker(&HealthCheckerConfig{
		Interval: 50 * time.Millisecond,
	})
	hc.RegisterServer("server-a")
	hc.RegisterServer("server-b")

	// checkAll updates LastChecked for each registered server
	hc.checkAll()

	statusA := hc.GetStatus("server-a")
	if statusA == nil {
		t.Fatal("expected status for server-a")
	}
	if statusA.LastChecked.IsZero() {
		t.Error("expected LastChecked to be updated after checkAll")
	}

	statusB := hc.GetStatus("server-b")
	if statusB == nil {
		t.Fatal("expected status for server-b")
	}
}

func TestHealthChecker_CheckAll_Empty(t *testing.T) {
	hc := NewHealthChecker(nil)
	// checkAll with no registered servers should not panic
	hc.checkAll()
}

func TestHealthChecker_UpdateStatus_NoCallback(t *testing.T) {
	hc := NewHealthChecker(nil) // no OnChange callback
	hc.RegisterServer("test-server")

	newStatus := &HealthStatus{Healthy: true, LastChecked: time.Now()}
	hc.UpdateStatus("test-server", newStatus)

	status := hc.GetStatus("test-server")
	if !status.Healthy {
		t.Error("expected status to be healthy")
	}
}

func TestHealthChecker_UpdateStatus_SameHealth(t *testing.T) {
	called := false
	hc := NewHealthChecker(&HealthCheckerConfig{
		OnChange: func(serverName string, status *HealthStatus) {
			called = true
		},
	})
	hc.RegisterServer("test-server")
	// Initial status: Healthy=false
	hc.statuses["test-server"] = &HealthStatus{Healthy: false}

	// Update to same health state
	hc.UpdateStatus("test-server", &HealthStatus{Healthy: false})
	if called {
		t.Error("OnChange should NOT be called when health state doesn't change")
	}
}

// TestHealthChecker_Start_DoubleStart tests that calling Start twice is safe
func TestHealthChecker_Start_DoubleStart(t *testing.T) {
	hc := NewHealthChecker(&HealthCheckerConfig{
		Interval: 50 * time.Millisecond,
	})

	hc.Start()
	// Double start — should return immediately without panic
	hc.Start()

	// Verify still running (first Start won the race)
	hc.mu.RLock()
	running := hc.running
	hc.mu.RUnlock()
	if !running {
		t.Error("expected health checker to still be running")
	}

	time.Sleep(100 * time.Millisecond)
	hc.Stop()
}

// TestHealthChecker_Stop_DoubleStop tests that calling Stop twice is safe
func TestHealthChecker_Stop_DoubleStop(t *testing.T) {
	hc := NewHealthChecker(&HealthCheckerConfig{
		Interval: 50 * time.Millisecond,
	})
	hc.Start()
	hc.Stop()
	// Double stop — should return immediately without panic
	hc.Stop()

	hc.mu.RLock()
	running := hc.running
	hc.mu.RUnlock()
	if running {
		t.Error("expected health checker to be stopped")
	}
}

// TestHealthChecker_Stop_WithoutStart tests that calling Stop without Start is safe
func TestHealthChecker_Stop_WithoutStart(t *testing.T) {
	hc := NewHealthChecker(nil)
	// Stop without start — should not panic
	hc.Stop()

	hc.mu.RLock()
	running := hc.running
	hc.mu.RUnlock()
	if running {
		t.Error("expected health checker to be stopped")
	}
}
