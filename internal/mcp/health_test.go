package mcp

import (
	"context"
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
	client := NewClient(&ClientConfig{Name: "test"})

	// Not connected - should return unhealthy
	status := hc.CheckServer(context.Background(), client)
	if status.Healthy {
		t.Error("expected unhealthy status for disconnected client")
	}
	if status.Error == "" {
		t.Error("expected error message for disconnected client")
	}

	// Connected - should return healthy
	client.Connect(context.Background())
	status = hc.CheckServer(context.Background(), client)
	if !status.Healthy {
		t.Error("expected healthy status for connected client")
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
