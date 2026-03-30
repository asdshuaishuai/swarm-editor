package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
	"github.com/swarm-editor/swarm-editor/internal/swarm"
)

func TestNewEmergenceService(t *testing.T) {
	svc := NewEmergenceService(nil, nil, nil)
	if svc == nil {
		t.Fatal("NewEmergenceService returned nil")
	}
}

func TestEmergenceService_GetData_NoCache(t *testing.T) {
	svc := NewEmergenceService(nil, nil, nil)

	data := svc.GetData()
	if data == nil {
		t.Fatal("GetData should return non-nil data")
	}
}

func TestEmergenceService_GetData_CacheHit(t *testing.T) {
	svc := NewEmergenceService(nil, nil, nil)

	// First call populates cache
	data1 := svc.GetData()
	if data1 == nil {
		t.Fatal("first GetData should return non-nil data")
	}

	// Second call within 5 seconds should use cache
	data2 := svc.GetData()
	if data2 == nil {
		t.Fatal("second GetData should return non-nil data")
	}
}

func TestEmergenceService_copyEmergenceData_Nil(t *testing.T) {
	svc := NewEmergenceService(nil, nil, nil)

	result := svc.copyEmergenceData(nil)
	if result != nil {
		t.Error("copyEmergenceData(nil) should return nil")
	}
}

func TestEmergenceService_copyEmergenceData_Basic(t *testing.T) {
	svc := NewEmergenceService(nil, nil, nil)

	original := &EmergenceData{
		Health: SwarmHealth{
			OverallScore:     0.9,
			AgentUtilization: 0.5,
		},
		Agents: []AgentNode{
			{ID: "agent-1", Name: "Agent 1"},
			{ID: "agent-2", Name: "Agent 2"},
		},
		Flows: []TaskFlow{
			{ID: "flow-1", Status: "running"},
		},
		Signals: []EmergentSignal{
			{Type: "coordination", Message: "test signal"},
		},
	}

	copied := svc.copyEmergenceData(original)

	// Verify copy is independent
	copied.Health.OverallScore = 0.1
	if original.Health.OverallScore == 0.1 {
		t.Error("copy should be independent from original")
	}

	// Modify slice in copy
	copied.Agents[0].Name = "Modified"
	if original.Agents[0].Name == "Modified" {
		t.Error("slice copy should be independent")
	}
}

func TestEmergenceService_copyEmergenceData_EmptySlices(t *testing.T) {
	svc := NewEmergenceService(nil, nil, nil)

	original := &EmergenceData{
		Health:  SwarmHealth{},
		Agents:  nil,
		Flows:   nil,
		Signals: nil,
	}

	copied := svc.copyEmergenceData(original)
	if copied == nil {
		t.Fatal("copy should not be nil")
	}
}

func TestEmergenceService_collectHealthMetrics_NoSupervisor(t *testing.T) {
	svc := NewEmergenceService(nil, nil, nil)

	health := svc.collectHealthMetrics()
	// Should return zero-valued SwarmHealth
	if health.CongestionLevel < 0 {
		t.Error("CongestionLevel should be non-negative")
	}
}

func TestEmergenceService_collectAgentNodes_NoSupervisor(t *testing.T) {
	svc := NewEmergenceService(nil, nil, nil)

	agents := svc.collectAgentNodes()
	if agents == nil {
		t.Error("collectAgentNodes should return non-nil slice")
	}
}

func TestEmergenceService_collectTaskFlows_NoScheduler(t *testing.T) {
	svc := NewEmergenceService(nil, nil, nil)

	flows := svc.collectTaskFlows()
	if flows == nil {
		t.Error("collectTaskFlows should return non-nil slice")
	}
}

func TestEmergenceService_collectEmergentSignals_NoCoordinator(t *testing.T) {
	svc := NewEmergenceService(nil, nil, nil)

	signals := svc.collectEmergentSignals()
	if signals == nil {
		t.Error("collectEmergentSignals should return non-nil slice")
	}
}

func TestEmergenceService_WithSupervisor(t *testing.T) {
	registry := agent.NewRegistry()
	lifecycle := agent.NewLifecycle(registry)
	supervisor := swarm.NewSupervisor(swarm.SupervisorConfig{}, registry, lifecycle)
	svc := NewEmergenceService(supervisor, nil, nil)

	data := svc.GetData()
	if data == nil {
		t.Fatal("GetData should return non-nil data")
	}
}

func TestEmergenceService_WithScheduler(t *testing.T) {
	connMgr := acp.NewConnectionManager(nil)
	scheduler := swarm.NewScheduler(swarm.SchedulerConfig{}, connMgr)
	svc := NewEmergenceService(nil, scheduler, nil)

	data := svc.GetData()
	if data == nil {
		t.Fatal("GetData should return non-nil data")
	}

	// Should have task flows
	if data.Flows == nil {
		t.Error("Flows should not be nil")
	}
}

func TestEmergenceService_WithCoordinator(t *testing.T) {
	connMgr := acp.NewConnectionManager(nil)
	coordinator := swarm.NewCoordinator(swarm.CoordinatorConfig{}, connMgr)
	svc := NewEmergenceService(nil, nil, coordinator)

	data := svc.GetData()
	if data == nil {
		t.Fatal("GetData should return non-nil data")
	}

	// Should have emergent signals
	if data.Signals == nil {
		t.Error("Signals should not be nil")
	}
}

func TestEmergenceService_CacheExpiration(t *testing.T) {
	svc := NewEmergenceService(nil, nil, nil)
	svc.cache = &EmergenceData{Health: SwarmHealth{OverallScore: 0.99}}
	svc.lastUpdate = time.Now().Add(-10 * time.Second) // 10 seconds ago

	// Should refresh cache since it's expired (> 5 seconds)
	data := svc.GetData()
	if data == nil {
		t.Fatal("GetData should return non-nil data")
	}
}

// HTTP Handler tests

func TestEmergenceService_HandleGetEmergenceData_Success(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/emergence", nil)
	rec := httptest.NewRecorder()

	svc := NewEmergenceService(nil, nil, nil)
	svc.HandleGetEmergenceData(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
}

func TestEmergenceService_HandleGetSwarmHealth_Success(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/emergence/health", nil)
	rec := httptest.NewRecorder()

	svc := NewEmergenceService(nil, nil, nil)
	svc.HandleGetSwarmHealth(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
}

func TestEmergenceService_HandleGetAgentNodes_Success(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/emergence/agents", nil)
	rec := httptest.NewRecorder()

	svc := NewEmergenceService(nil, nil, nil)
	svc.HandleGetAgentNodes(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
}

func TestEmergenceService_HandleGetTaskFlows_Success(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/emergence/flows", nil)
	rec := httptest.NewRecorder()

	svc := NewEmergenceService(nil, nil, nil)
	svc.HandleGetTaskFlows(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
}

func TestEmergenceService_HandleGetEmergentSignals_Success(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/emergence/signals", nil)
	rec := httptest.NewRecorder()

	svc := NewEmergenceService(nil, nil, nil)
	svc.HandleGetEmergentSignals(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
}

func TestEmergenceService_HandleGetEmergenceData_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/emergence", nil)
	rec := httptest.NewRecorder()

	svc := NewEmergenceService(nil, nil, nil)
	svc.HandleGetEmergenceData(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected status 405, got %d", rec.Code)
	}
}

func TestEmergenceService_HandleGetSwarmHealth_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/emergence/health", nil)
	rec := httptest.NewRecorder()

	svc := NewEmergenceService(nil, nil, nil)
	svc.HandleGetSwarmHealth(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected status 405, got %d", rec.Code)
	}
}

func TestEmergenceService_HandleGetAgentNodes_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest("DELETE", "/api/emergence/agents", nil)
	rec := httptest.NewRecorder()

	svc := NewEmergenceService(nil, nil, nil)
	svc.HandleGetAgentNodes(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected status 405, got %d", rec.Code)
	}
}

func TestEmergenceService_HandleGetTaskFlows_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest("PUT", "/api/emergence/flows", nil)
	rec := httptest.NewRecorder()

	svc := NewEmergenceService(nil, nil, nil)
	svc.HandleGetTaskFlows(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected status 405, got %d", rec.Code)
	}
}

func TestEmergenceService_HandleGetEmergentSignals_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/emergence/signals", nil)
	rec := httptest.NewRecorder()

	svc := NewEmergenceService(nil, nil, nil)
	svc.HandleGetEmergentSignals(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected status 405, got %d", rec.Code)
	}
}
