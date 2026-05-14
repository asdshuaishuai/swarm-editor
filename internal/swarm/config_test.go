package swarm

import (
	"testing"
	"time"
)

func TestTestSchedulerConfig(t *testing.T) {
	cfg := TestSchedulerConfig()
	if cfg.TaskTimeout >= time.Second {
		t.Error("TestSchedulerConfig TaskTimeout should be sub-second for fast tests")
	}
	if cfg.RebalanceInterval >= time.Second {
		t.Error("TestSchedulerConfig RebalanceInterval should be sub-second")
	}
	if cfg.RetryDelay >= time.Second {
		t.Error("TestSchedulerConfig RetryDelay should be sub-second")
	}
	if cfg.MaxConcurrentTasks <= 0 {
		t.Error("TestSchedulerConfig MaxConcurrentTasks should be positive")
	}
	if cfg.LoadBalanceStrategy == "" {
		t.Error("TestSchedulerConfig LoadBalanceStrategy should not be empty")
	}
}

func TestTestCircuitBreakerConfig(t *testing.T) {
	cfg := TestCircuitBreakerConfig()
	if cfg.Timeout >= time.Second {
		t.Error("TestCircuitBreakerConfig Timeout should be sub-second")
	}
	cb := NewCircuitBreaker(cfg)
	defer cb.Close()
	if !cb.IsHealthy() {
		t.Error("new circuit breaker should be healthy")
	}
}

func TestTestConsensusConfig(t *testing.T) {
	cfg := TestConsensusConfig()
	if cfg.DefaultTimeout >= time.Second {
		t.Error("TestConsensusConfig DefaultTimeout should be sub-second")
	}
	if cfg.DefaultAlgorithm != ConsensusSimpleMajority {
		t.Errorf("expected algorithm %s, got %s", ConsensusSimpleMajority, cfg.DefaultAlgorithm)
	}
	if cfg.MinAgreement <= 0 || cfg.MinAgreement > 1 {
		t.Error("TestConsensusConfig MinAgreement should be in (0, 1]")
	}
}

func TestTestTimeoutPolicy(t *testing.T) {
	policy := TestTimeoutPolicy()
	if policy.StartToClose >= time.Second {
		t.Error("TestTimeoutPolicy StartToClose should be sub-second")
	}
	if policy.ScheduleToStart >= time.Second {
		t.Error("TestTimeoutPolicy ScheduleToStart should be sub-second")
	}
	if policy.Heartbeat >= time.Second {
		t.Error("TestTimeoutPolicy Heartbeat should be sub-second")
	}
	if policy.HeartbeatTimeout >= time.Second {
		t.Error("TestTimeoutPolicy HeartbeatTimeout should be sub-second")
	}
}

func TestTestSupervisorConfig(t *testing.T) {
	cfg := TestSupervisorConfig()
	if cfg.CheckInterval >= time.Second {
		t.Error("TestSupervisorConfig CheckInterval should be sub-second")
	}
	if cfg.HeartbeatTimeout >= time.Second {
		t.Error("TestSupervisorConfig HeartbeatTimeout should be sub-second")
	}
	if cfg.StuckThreshold >= time.Second {
		t.Error("TestSupervisorConfig StuckThreshold should be sub-second")
	}
	if cfg.RecoveryTimeout >= time.Second {
		t.Error("TestSupervisorConfig RecoveryTimeout should be sub-second")
	}
}

func TestTestFallbackConfig(t *testing.T) {
	cfg := TestFallbackConfig()
	if cfg.PerAttemptTimeout >= time.Second {
		t.Error("TestFallbackConfig PerAttemptTimeout should be sub-second")
	}
	if cfg.MaxAttempts <= 0 {
		t.Error("TestFallbackConfig MaxAttempts should be positive")
	}
	if cfg.Strategy != FallbackByHealthScore {
		t.Errorf("expected strategy %s, got %s", FallbackByHealthScore, cfg.Strategy)
	}
}

func TestTestRateLimitConfig(t *testing.T) {
	cfg := TestRateLimitConfig()
	if cfg.GlobalRPM <= 0 {
		t.Error("TestRateLimitConfig GlobalRPM should be positive")
	}
	if cfg.GlobalBurst <= 0 {
		t.Error("TestRateLimitConfig GlobalBurst should be positive")
	}
	if cfg.DefaultAgentRPM <= 0 {
		t.Error("TestRateLimitConfig DefaultAgentRPM should be positive")
	}
	if cfg.DefaultAgentBurst <= 0 {
		t.Error("TestRateLimitConfig DefaultAgentBurst should be positive")
	}
}
