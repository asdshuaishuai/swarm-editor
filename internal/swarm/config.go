// Package swarm provides test configuration helpers.
// Test configs use extremely short timeouts (50ms-200ms) so tests run fast
// without real waits. Pattern from hashicorp/raft inmemConfig().
// NOT safe for production use.
package swarm

import "time"

// TestSchedulerConfig returns a SchedulerConfig optimized for fast tests.
// All timeouts are sub-second to make tests run quickly.
func TestSchedulerConfig() SchedulerConfig {
	return SchedulerConfig{
		MaxConcurrentTasks:  10,
		TaskTimeout:         200 * time.Millisecond, // vs 30m in production
		RetryCount:          1,
		RetryDelay:          10 * time.Millisecond,
		LoadBalanceStrategy: "round_robin",
		OverloadThreshold:   0.9,
		RebalanceInterval:   100 * time.Millisecond, // vs 30s in production
	}
}

// TestCircuitBreakerConfig returns a CircuitBreakerConfig for fast tests.
func TestCircuitBreakerConfig() CircuitBreakerConfig {
	return CircuitBreakerConfig{
		FailureThreshold: 2,
		SuccessThreshold: 1,
		Timeout:          50 * time.Millisecond, // vs 30s in production
		MaxConcurrent:    10,
	}
}

// TestConsensusConfig returns a ConsensusConfig for fast tests.
func TestConsensusConfig() ConsensusConfig {
	return ConsensusConfig{
		DefaultAlgorithm: ConsensusSimpleMajority,
		DefaultTimeout:   50 * time.Millisecond, // vs seconds in production
		MinAgreement:     0.5,
		MaxRetries:       2,
		EvaluationDelay:  10 * time.Millisecond,
	}
}

// TestTimeoutPolicy returns a TimeoutPolicy for fast tests.
func TestTimeoutPolicy() TimeoutPolicy {
	return TimeoutPolicy{
		ScheduleToStart:  100 * time.Millisecond, // vs 5m in production
		StartToClose:     200 * time.Millisecond, // vs 30m in production
		Heartbeat:        50 * time.Millisecond,  // vs 30s in production
		HeartbeatTimeout: 30 * time.Millisecond,  // vs 10s in production
	}
}

// TestSupervisorConfig returns a SupervisorConfig for fast tests.
func TestSupervisorConfig() SupervisorConfig {
	return SupervisorConfig{
		CheckInterval:    50 * time.Millisecond,  // vs 30s in production
		HeartbeatTimeout: 100 * time.Millisecond, // vs 60s in production
		StuckThreshold:   200 * time.Millisecond, // vs 2m in production
		RecoveryTimeout:  200 * time.Millisecond, // vs 2m in production
		HealthThreshold:  0.5,
	}
}

// TestFallbackConfig returns a FallbackConfig for fast tests.
func TestFallbackConfig() FallbackConfig {
	return FallbackConfig{
		MaxAttempts:       2,
		Strategy:          FallbackByHealthScore,
		RequiredMinHealth: 0.5,
		PerAttemptTimeout: 50 * time.Millisecond, // vs 2m in production
	}
}

// TestRateLimitConfig returns a RateLimitConfig for fast tests.
func TestRateLimitConfig() RateLimitConfig {
	return RateLimitConfig{
		GlobalRPM:         1000,
		GlobalBurst:       100,
		DefaultAgentRPM:   500,
		DefaultAgentBurst: 50,
	}
}
