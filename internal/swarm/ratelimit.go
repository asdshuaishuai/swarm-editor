package swarm

import (
	"context"
	"sync"

	"golang.org/x/time/rate"
)

// RateLimitConfig configures rate limiting for the swarm scheduler.
// Inspired by CrewAI's per-agent rate limiting and LangGraph's max_concurrency.
type RateLimitConfig struct {
	// GlobalRPM is the maximum number of task dispatches per minute across all agents.
	GlobalRPM int `json:"globalRPM"`
	// GlobalBurst is the maximum burst size for global dispatches.
	GlobalBurst int `json:"globalBurst"`
	// DefaultAgentRPM is the default per-agent requests per minute.
	DefaultAgentRPM int `json:"defaultAgentRPM"`
	// DefaultAgentBurst is the default per-agent burst size.
	DefaultAgentBurst int `json:"defaultAgentBurst"`
}

// DefaultRateLimitConfig returns sensible defaults for rate limiting.
func DefaultRateLimitConfig() RateLimitConfig {
	return RateLimitConfig{
		GlobalRPM:         120,
		GlobalBurst:       20,
		DefaultAgentRPM:   30,
		DefaultAgentBurst: 10,
	}
}

// RateLimiter provides per-agent and global rate limiting for task dispatches.
// Uses token bucket algorithm (golang.org/x/time/rate) for smooth throttling.
type RateLimiter struct {
	mu sync.RWMutex

	config RateLimitConfig

	// Global rate limiter
	global *rate.Limiter

	// Per-agent rate limiters
	agents map[string]*rate.Limiter
}

// NewRateLimiter creates a new RateLimiter with the given config.
func NewRateLimiter(config RateLimitConfig) *RateLimiter {
	if config.GlobalRPM <= 0 {
		config.GlobalRPM = DefaultRateLimitConfig().GlobalRPM
	}
	if config.GlobalBurst <= 0 {
		config.GlobalBurst = DefaultRateLimitConfig().GlobalBurst
	}
	if config.DefaultAgentRPM <= 0 {
		config.DefaultAgentRPM = DefaultRateLimitConfig().DefaultAgentRPM
	}
	if config.DefaultAgentBurst <= 0 {
		config.DefaultAgentBurst = DefaultRateLimitConfig().DefaultAgentBurst
	}

	rps := float64(config.GlobalRPM) / 60.0
	return &RateLimiter{
		config: config,
		global: rate.NewLimiter(rate.Limit(rps), config.GlobalBurst),
		agents: make(map[string]*rate.Limiter),
	}
}

// RegisterAgent registers a per-agent rate limiter. If rpm <= 0, uses default.
func (rl *RateLimiter) RegisterAgent(agentID string, rpm, burst int) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	if rpm <= 0 {
		rpm = rl.config.DefaultAgentRPM
	}
	if burst <= 0 {
		burst = rl.config.DefaultAgentBurst
	}

	rps := float64(rpm) / 60.0
	rl.agents[agentID] = rate.NewLimiter(rate.Limit(rps), burst)
}

// UnregisterAgent removes the per-agent rate limiter.
func (rl *RateLimiter) UnregisterAgent(agentID string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	delete(rl.agents, agentID)
}

// WaitGlobal blocks until a global rate limit token is available or context is cancelled.
func (rl *RateLimiter) WaitGlobal(ctx context.Context) error {
	return rl.global.Wait(ctx)
}

// WaitAgent blocks until a per-agent rate limit token is available or context is cancelled.
// If no per-agent limiter is registered, uses the default.
func (rl *RateLimiter) WaitAgent(ctx context.Context, agentID string) error {
	limiter := rl.getOrCreateAgentLimiter(agentID)
	return limiter.Wait(ctx)
}

// TryGlobal checks if a global token is available without blocking.
func (rl *RateLimiter) TryGlobal() bool {
	return rl.global.Allow()
}

// TryAgent checks if a per-agent token is available without blocking.
func (rl *RateLimiter) TryAgent(agentID string) bool {
	limiter := rl.getOrCreateAgentLimiter(agentID)
	return limiter.Allow()
}

// getOrCreateAgentLimiter returns the per-agent limiter, creating a default one if needed.
func (rl *RateLimiter) getOrCreateAgentLimiter(agentID string) *rate.Limiter {
	rl.mu.RLock()
	limiter, ok := rl.agents[agentID]
	rl.mu.RUnlock()

	if ok {
		return limiter
	}

	// Create default limiter (double-checked locking pattern)
	rl.mu.Lock()
	defer rl.mu.Unlock()
	if existing, ok := rl.agents[agentID]; ok {
		return existing
	}

	rps := float64(rl.config.DefaultAgentRPM) / 60.0
	limiter = rate.NewLimiter(rate.Limit(rps), rl.config.DefaultAgentBurst)
	rl.agents[agentID] = limiter
	return limiter
}

// AgentCount returns the number of registered agent limiters.
func (rl *RateLimiter) AgentCount() int {
	rl.mu.RLock()
	defer rl.mu.RUnlock()
	return len(rl.agents)
}
