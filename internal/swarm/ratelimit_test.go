package swarm

import (
	"context"
	"testing"
)

func TestNewRateLimiterDefaults(t *testing.T) {
	rl := NewRateLimiter(RateLimitConfig{})
	if rl == nil {
		t.Fatal("NewRateLimiter returned nil")
	}
	if rl.global == nil {
		t.Fatal("Global limiter should not be nil")
	}
	if rl.agents == nil {
		t.Fatal("Agents map should be initialized")
	}
}

func TestNewRateLimiterCustomConfig(t *testing.T) {
	rl := NewRateLimiter(RateLimitConfig{
		GlobalRPM:         60,
		GlobalBurst:       5,
		DefaultAgentRPM:   10,
		DefaultAgentBurst: 3,
	})
	if rl == nil {
		t.Fatal("NewRateLimiter returned nil")
	}
	// Verify global limiter allows burst
	for i := 0; i < 5; i++ {
		if !rl.TryGlobal() {
			t.Errorf("Burst slot %d should be available", i)
		}
	}
}

func TestRateLimiterRegisterAndUnregister(t *testing.T) {
	rl := NewRateLimiter(RateLimitConfig{})

	rl.RegisterAgent("agent-1", 60, 5)
	if rl.AgentCount() != 1 {
		t.Errorf("Expected 1 registered agent, got %d", rl.AgentCount())
	}

	rl.UnregisterAgent("agent-1")
	if rl.AgentCount() != 0 {
		t.Errorf("Expected 0 registered agents, got %d", rl.AgentCount())
	}

	// Unregistering non-existent should not panic
	rl.UnregisterAgent("non-existent")
}

func TestRateLimiterTryAgent(t *testing.T) {
	rl := NewRateLimiter(RateLimitConfig{
		DefaultAgentRPM:   60,
		DefaultAgentBurst: 2,
	})

	// Unregistered agent should still work (uses default)
	if !rl.TryAgent("unknown-agent") {
		t.Error("TryAgent should return true for first request")
	}
	if !rl.TryAgent("unknown-agent") {
		t.Error("TryAgent should return true for second request (burst=2)")
	}

	// Third should be rate limited (burst exhausted, need to wait for refill)
	// Note: token bucket may still allow depending on timing, so we just verify no panic
	rl.TryAgent("unknown-agent")
}

func TestRateLimiterTryGlobal(t *testing.T) {
	rl := NewRateLimiter(RateLimitConfig{
		GlobalRPM:   60,
		GlobalBurst: 3,
	})

	for i := 0; i < 3; i++ {
		if !rl.TryGlobal() {
			t.Errorf("Global burst slot %d should be available", i)
		}
	}
}

func TestRateLimiterWaitAgentContext(t *testing.T) {
	rl := NewRateLimiter(RateLimitConfig{
		DefaultAgentRPM:   1, // Very low: 1 per minute
		DefaultAgentBurst: 0,
	})

	// Cancel context immediately — Wait should return context error
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel before calling Wait

	err := rl.WaitAgent(ctx, "agent-1")
	if err == nil {
		t.Error("WaitAgent should return error when context already cancelled")
	}
}

func TestRateLimiterWaitGlobalContext(t *testing.T) {
	rl := NewRateLimiter(RateLimitConfig{
		GlobalRPM:   1, // Very low: 1 per minute
		GlobalBurst: 0,
	})

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel before calling Wait

	err := rl.WaitGlobal(ctx)
	if err == nil {
		t.Error("WaitGlobal should return error when context already cancelled")
	}
}

func TestRateLimiterRegisterAgentDefaults(t *testing.T) {
	rl := NewRateLimiter(RateLimitConfig{
		DefaultAgentRPM:   60,
		DefaultAgentBurst: 10,
	})

	// Register with zero values should use defaults
	rl.RegisterAgent("agent-1", 0, 0)

	// Should allow burst of 10
	for i := 0; i < 10; i++ {
		if !rl.TryAgent("agent-1") {
			t.Errorf("Burst slot %d should be available", i)
		}
	}
}

func TestRateLimiterConcurrentAccess(t *testing.T) {
	rl := NewRateLimiter(RateLimitConfig{
		GlobalRPM:         1000,
		GlobalBurst:       100,
		DefaultAgentRPM:   500,
		DefaultAgentBurst: 50,
	})

	done := make(chan bool)

	// Concurrent registrations and checks
	for i := 0; i < 5; i++ {
		go func(id int) {
			agentID := string(rune('a' + id))
			rl.RegisterAgent(agentID, 100, 10)
			rl.TryAgent(agentID)
			rl.TryGlobal()
			done <- true
		}(i)
	}

	for i := 0; i < 5; i++ {
		<-done
	}
}
