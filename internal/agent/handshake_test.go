package agent

import (
	"sync"
	"testing"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
)

func TestNewHandshakeManager(t *testing.T) {
	hm := NewHandshakeManager(0)
	if hm == nil {
		t.Fatal("NewHandshakeManager returned nil")
	}
	if hm.timeout != 10*time.Second {
		t.Errorf("expected default timeout 10s, got %v", hm.timeout)
	}

	hm = NewHandshakeManager(5 * time.Second)
	if hm.timeout != 5*time.Second {
		t.Errorf("expected timeout 5s, got %v", hm.timeout)
	}
}

func TestHandshakeManagerGetConnection(t *testing.T) {
	hm := NewHandshakeManager(0)

	// Non-existent connection
	conn := hm.GetConnection("nonexistent")
	if conn != nil {
		t.Error("expected nil for non-existent connection")
	}

	// Add a connection
	hm.connections["test-id"] = &HandshakeConnection{
		AgentID: "test-id",
		Name:    "Test Agent",
	}

	conn = hm.GetConnection("test-id")
	if conn == nil {
		t.Fatal("expected connection for test-id")
	}
	if conn.Name != "Test Agent" {
		t.Errorf("expected name 'Test Agent', got %q", conn.Name)
	}
}

func TestHandshakeManagerRemoveConnection(t *testing.T) {
	hm := NewHandshakeManager(0)
	hm.connections["test-id"] = &HandshakeConnection{AgentID: "test-id"}

	hm.RemoveConnection("test-id")

	if hm.GetConnection("test-id") != nil {
		t.Error("expected connection to be removed")
	}
}

func TestHandshakeManagerGetAllConnections(t *testing.T) {
	hm := NewHandshakeManager(0)
	hm.connections["agent1"] = &HandshakeConnection{AgentID: "agent1"}
	hm.connections["agent2"] = &HandshakeConnection{AgentID: "agent2"}

	connections := hm.GetAllConnections()
	if len(connections) != 2 {
		t.Errorf("expected 2 connections, got %d", len(connections))
	}
}

func TestHandshakeResult(t *testing.T) {
	result := &HandshakeResult{
		Success: true,
		AgentInfo: &HandshakeConnection{
			AgentID: "test",
			Name:    "Test",
		},
		ResponseTime: 100 * time.Millisecond,
	}

	if !result.Success {
		t.Error("expected Success to be true")
	}
	if result.AgentInfo.Name != "Test" {
		t.Errorf("expected name 'Test', got %q", result.AgentInfo.Name)
	}
}

func TestNewHeartbeatChecker(t *testing.T) {
	hc := NewHeartbeatChecker(0, 0)
	if hc == nil {
		t.Fatal("NewHeartbeatChecker returned nil")
	}
	if hc.interval != 30*time.Second {
		t.Errorf("expected default interval 30s, got %v", hc.interval)
	}
	if hc.timeout != 5*time.Second {
		t.Errorf("expected default timeout 5s, got %v", hc.timeout)
	}
}

func TestHeartbeatCheckerStartStop(t *testing.T) {
	hc := NewHeartbeatChecker(100*time.Millisecond, 50*time.Millisecond)

	hc.Start()
	if !hc.running {
		t.Error("expected heartbeat checker to be running")
	}

	time.Sleep(150 * time.Millisecond)

	hc.Stop()
	if hc.running {
		t.Error("expected heartbeat checker to be stopped")
	}
}

func TestHeartbeatCheckerRegisterAgent(t *testing.T) {
	hc := NewHeartbeatChecker(0, 0)
	hc.RegisterAgent("agent-1")

	if len(hc.connections) != 1 {
		t.Errorf("expected 1 agent, got %d", len(hc.connections))
	}
}

func TestHeartbeatCheckerUnregisterAgent(t *testing.T) {
	hc := NewHeartbeatChecker(0, 0)
	hc.RegisterAgent("agent-1")
	hc.UnregisterAgent("agent-1")

	if len(hc.connections) != 0 {
		t.Errorf("expected 0 agents, got %d", len(hc.connections))
	}
}

func TestHeartbeatCheckerGetStatus(t *testing.T) {
	hc := NewHeartbeatChecker(0, 0)
	hc.RegisterAgent("agent-1")

	status := hc.GetStatus("agent-1")
	if status == nil {
		t.Fatal("expected status for registered agent")
	}
	if !status.Healthy {
		t.Error("expected agent to be healthy initially")
	}

	status = hc.GetStatus("nonexistent")
	if status != nil {
		t.Error("expected nil for non-existent agent")
	}
}

func TestHeartbeatCheckerGetAllStatuses(t *testing.T) {
	hc := NewHeartbeatChecker(0, 0)
	hc.RegisterAgent("agent-1")
	hc.RegisterAgent("agent-2")

	statuses := hc.GetAllStatuses()
	if len(statuses) != 2 {
		t.Errorf("expected 2 statuses, got %d", len(statuses))
	}
}

func TestHeartbeatCheckerRecordFailure(t *testing.T) {
	var mu sync.Mutex
	unhealthyCalled := false
	hc := NewHeartbeatChecker(0, 0)
	hc.OnUnhealthy(func(agentID string, err error) {
		mu.Lock()
		unhealthyCalled = true
		mu.Unlock()
	})
	hc.RegisterAgent("agent-1")

	// Record failures
	for i := 0; i < 3; i++ {
		hc.recordFailure("agent-1", nil)
	}

	// Wait for goroutines to complete
	time.Sleep(50 * time.Millisecond)

	status := hc.GetStatus("agent-1")
	if status.Consecutive != 3 {
		t.Errorf("expected 3 consecutive failures, got %d", status.Consecutive)
	}
	if status.Healthy {
		t.Error("expected agent to be unhealthy after failures")
	}

	// Check if unhealthy callback was called (should be called after 3 consecutive failures)
	mu.Lock()
	called := unhealthyCalled
	mu.Unlock()
	if !called {
		t.Error("expected OnUnhealthy callback to be called after 3 consecutive failures")
	}
}

func TestHeartbeatStatusStruct(t *testing.T) {
	status := &HeartbeatStatus{
		AgentID:       "test",
		LastHeartbeat: time.Now(),
		LastLatency:   50 * time.Millisecond,
		Consecutive:   0,
		Healthy:       true,
	}

	if status.AgentID != "test" {
		t.Errorf("expected AgentID 'test', got %q", status.AgentID)
	}
	if !status.Healthy {
		t.Error("expected Healthy to be true")
	}
}

func TestNewCapabilityNegotiator(t *testing.T) {
	localCaps := AgentCapabilities{
		SupportedMethods: []string{"initialize", "session/new"},
		Features:         map[string]bool{"image": true},
	}

	cn := NewCapabilityNegotiator(localCaps)
	if cn == nil {
		t.Fatal("NewCapabilityNegotiator returned nil")
	}
}

func TestCapabilityNegotiatorNegotiate(t *testing.T) {
	localCaps := AgentCapabilities{
		SupportedMethods: []string{"initialize", "session/new", "session/prompt"},
		Features:         map[string]bool{"image": true, "audio": false},
	}

	cn := NewCapabilityNegotiator(localCaps)

	remoteCaps := AgentCapabilities{
		SupportedMethods: []string{"initialize", "session/new", "session/cancel"},
		Features:         map[string]bool{"image": true, "audio": true},
	}

	ops := cn.Negotiate("agent-1", remoteCaps)

	// Should have common methods: initialize, session/new
	// Should have common features: image
	methodCount := 0
	featureCount := 0
	for _, op := range ops {
		if op == "initialize" || op == "session/new" {
			methodCount++
		}
		if op == "feature:image" {
			featureCount++
		}
	}

	if methodCount != 2 {
		t.Errorf("expected 2 common methods, got %d", methodCount)
	}
	if featureCount != 1 {
		t.Errorf("expected 1 common feature, got %d", featureCount)
	}
}

func TestCapabilityNegotiatorGetNegotiatedOperations(t *testing.T) {
	localCaps := AgentCapabilities{
		SupportedMethods: []string{"initialize"},
	}

	cn := NewCapabilityNegotiator(localCaps)
	cn.Negotiate("agent-1", AgentCapabilities{
		SupportedMethods: []string{"initialize"},
	})

	ops := cn.GetNegotiatedOperations("agent-1")
	if len(ops) == 0 {
		t.Error("expected negotiated operations")
	}

	ops = cn.GetNegotiatedOperations("nonexistent")
	if ops != nil {
		t.Error("expected nil for non-existent agent")
	}
}

func TestCapabilityNegotiatorGetRemoteCapabilities(t *testing.T) {
	localCaps := AgentCapabilities{}
	cn := NewCapabilityNegotiator(localCaps)

	remoteCaps := AgentCapabilities{
		SupportedMethods: []string{"initialize"},
	}
	cn.Negotiate("agent-1", remoteCaps)

	caps := cn.GetRemoteCapabilities("agent-1")
	if caps == nil {
		t.Fatal("expected remote capabilities")
	}
	if len(caps.SupportedMethods) != 1 {
		t.Errorf("expected 1 method, got %d", len(caps.SupportedMethods))
	}

	caps = cn.GetRemoteCapabilities("nonexistent")
	if caps != nil {
		t.Error("expected nil for non-existent agent")
	}
}

func TestCapabilityNegotiatorCanPerform(t *testing.T) {
	localCaps := AgentCapabilities{
		SupportedMethods: []string{"initialize", "session/new"},
	}

	cn := NewCapabilityNegotiator(localCaps)
	cn.Negotiate("agent-1", AgentCapabilities{
		SupportedMethods: []string{"initialize"},
	})

	if !cn.CanPerform("agent-1", "initialize") {
		t.Error("expected CanPerform to return true for 'initialize'")
	}
	if cn.CanPerform("agent-1", "session/new") {
		t.Error("expected CanPerform to return false for 'session/new' (not negotiated)")
	}
}

func TestAgentCapabilitiesJSON(t *testing.T) {
	caps := AgentCapabilities{
		SupportedMethods:      []string{"initialize", "session/new"},
		SupportedContentTypes: []string{"text", "image"},
		Features:              map[string]bool{"image": true, "audio": false},
		MaxPromptSize:         100000,
	}

	// To JSON
	data, err := caps.ToJSON()
	if err != nil {
		t.Errorf("ToJSON failed: %v", err)
	}

	// From JSON
	var parsed AgentCapabilities
	if err := parsed.FromJSON(data); err != nil {
		t.Errorf("FromJSON failed: %v", err)
	}

	if parsed.MaxPromptSize != 100000 {
		t.Errorf("expected MaxPromptSize 100000, got %d", parsed.MaxPromptSize)
	}
	if !parsed.Features["image"] {
		t.Error("expected image feature to be true")
	}
	if parsed.Features["audio"] {
		t.Error("expected audio feature to be false")
	}
}

func TestHandshakeConnectionStruct(t *testing.T) {
	conn := &HandshakeConnection{
		AgentID:   "test-agent",
		Name:      "Test Agent",
		Version:   "1.0.0",
		Protocol:  "2024-11-05",
		Connected: time.Now(),
		Endpoint:  "localhost:8080",
	}

	if conn.AgentID != "test-agent" {
		t.Errorf("expected AgentID 'test-agent', got %q", conn.AgentID)
	}
	if conn.Protocol != "2024-11-05" {
		t.Errorf("expected Protocol '2024-11-05', got %q", conn.Protocol)
	}
}

func TestHandshakeManagerNegotiateCapabilities(t *testing.T) {
	hm := NewHandshakeManager(0)

	// Test with various agent capabilities
	testCases := []struct {
		name     string
		agentCap acp.AgentCapabilities
		expected []string
	}{
		{
			name:     "empty capabilities",
			agentCap: acp.AgentCapabilities{},
			expected: []string{},
		},
		{
			name: "image support",
			agentCap: acp.AgentCapabilities{
				PromptCapabilities: acp.PromptCapabilities{Image: true},
			},
			expected: []string{"image"},
		},
		{
			name: "pair programming",
			agentCap: acp.AgentCapabilities{
				PairProgramming: true,
			},
			expected: []string{"pair_programming"},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			caps := hm.negotiateCapabilities(tc.agentCap)

			for _, expected := range tc.expected {
				if !caps.Features[expected] {
					t.Errorf("expected feature %q to be true", expected)
				}
			}
		})
	}
}
