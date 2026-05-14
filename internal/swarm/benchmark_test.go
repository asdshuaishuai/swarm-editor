package swarm

import (
	"context"
	"testing"

	"github.com/swarm-editor/swarm-editor/internal/acp"
)

// ============================================================
// CircuitBreaker Benchmarks
// ============================================================

// BenchmarkCircuitBreakerAllow benchmarks the Allow() method
// which is called on every request
func BenchmarkCircuitBreakerAllow(b *testing.B) {
	cb := NewCircuitBreaker(DefaultCircuitBreakerConfig())
	defer cb.Close()

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = cb.Allow()
	}
}

// BenchmarkCircuitBreakerAllowParallel benchmarks Allow() under parallel load
func BenchmarkCircuitBreakerAllowParallel(b *testing.B) {
	cb := NewCircuitBreaker(DefaultCircuitBreakerConfig())
	defer cb.Close()

	b.ReportAllocs()
	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			_ = cb.Allow()
		}
	})
}

// BenchmarkCircuitBreakerRecordSuccess benchmarks RecordSuccess()
// which is called after every successful task
func BenchmarkCircuitBreakerRecordSuccess(b *testing.B) {
	cb := NewCircuitBreaker(DefaultCircuitBreakerConfig())
	defer cb.Close()

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if cb.Allow() {
			cb.RecordSuccess()
		}
	}
}

// BenchmarkCircuitBreakerRecordFailure benchmarks RecordFailure()
// which is called after every failed task
func BenchmarkCircuitBreakerRecordFailure(b *testing.B) {
	cb := NewCircuitBreaker(DefaultCircuitBreakerConfig())
	defer cb.Close()

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if cb.Allow() {
			cb.RecordFailure()
		}
	}
}

// BenchmarkCircuitBreakerFullCycle benchmarks a complete request cycle
// Allow -> success/failure -> record
func BenchmarkCircuitBreakerFullCycle(b *testing.B) {
	cb := NewCircuitBreaker(DefaultCircuitBreakerConfig())
	defer cb.Close()

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if cb.Allow() {
			if i%10 == 0 { // 10% failure rate
				cb.RecordFailure()
			} else {
				cb.RecordSuccess()
			}
		}
	}
}

// ============================================================
// LoopDetector Benchmarks
// ============================================================

// BenchmarkLoopDetectorCheckOutput benchmarks the CheckOutput() method
// which is called on every agent output
func BenchmarkLoopDetectorCheckOutput(b *testing.B) {
	ld := NewLoopDetector()
	content := "This is a sample agent output that needs to be checked for loops. " +
		"It contains multiple words and should be hashed for comparison."

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = ld.CheckOutput(content)
	}
}

// BenchmarkLoopDetectorCheckOutputShort benchmarks with short content
func BenchmarkLoopDetectorCheckOutputShort(b *testing.B) {
	ld := NewLoopDetector()
	content := "short output"

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = ld.CheckOutput(content)
	}
}

// BenchmarkLoopDetectorCheckOutputLong benchmarks with long content
func BenchmarkLoopDetectorCheckOutputLong(b *testing.B) {
	ld := NewLoopDetector()
	// Simulate a long agent response (~1KB)
	content := ""
	for i := 0; i < 50; i++ {
		content += "This is a longer line of text that simulates agent output. "
	}

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = ld.CheckOutput(content)
	}
}

// BenchmarkLoopDetectorCheckOutputWithReset benchmarks with periodic reset
// (simulating per-task usage)
func BenchmarkLoopDetectorCheckOutputWithReset(b *testing.B) {
	ld := NewLoopDetector()
	content := "sample output for benchmark"

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = ld.CheckOutput(content)
		if i%10 == 0 {
			ld.Reset()
		}
	}
}

// ============================================================
// FallbackChain Benchmarks
// ============================================================

// benchAgentListProvider is a mock implementation for benchmarking
type benchAgentListProvider struct {
	agents []*acp.AgentConnection
}

func (m *benchAgentListProvider) GetAgents() []*acp.AgentConnection {
	return m.agents
}

// benchHealthProvider is a mock implementation for benchmarking
type benchHealthProvider struct {
	scores map[string]float64
}

func (m *benchHealthProvider) GetHealth(agentID string) *AgentHealth {
	if score, ok := m.scores[agentID]; ok {
		return &AgentHealth{Score: score}
	}
	return &AgentHealth{Score: 0.5}
}

// BenchmarkFallbackChainNextAgent benchmarks NextAgent() for load balancing
func BenchmarkFallbackChainNextAgent(b *testing.B) {
	mockAgents := &benchAgentListProvider{
		agents: []*acp.AgentConnection{
			{ID: "agent-1"},
			{ID: "agent-2"},
			{ID: "agent-3"},
			{ID: "agent-4"},
			{ID: "agent-5"},
		},
	}
	mockHealth := &benchHealthProvider{
		scores: map[string]float64{
			"agent-1": 0.9,
			"agent-2": 0.8,
			"agent-3": 0.7,
			"agent-4": 0.6,
			"agent-5": 0.5,
		},
	}

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		fc := NewFallbackChain("task-"+string(rune(i)), DefaultFallbackConfig(), mockAgents, mockHealth)
		ctx := context.Background()
		_, _ = fc.NextAgent(ctx)
	}
}

// BenchmarkFallbackChainNextAgentLargePool benchmarks with many agents
func BenchmarkFallbackChainNextAgentLargePool(b *testing.B) {
	// Create 50 agents
	agents := make([]*acp.AgentConnection, 50)
	scores := make(map[string]float64, 50)
	for i := 0; i < 50; i++ {
		id := "agent-" + string(rune('0'+i%10)) + string(rune('0'+i/10))
		agents[i] = &acp.AgentConnection{ID: id}
		scores[id] = 0.5 + float64(i%50)/100.0
	}

	mockAgents := &benchAgentListProvider{agents: agents}
	mockHealth := &benchHealthProvider{scores: scores}

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		fc := NewFallbackChain("task-"+string(rune(i)), DefaultFallbackConfig(), mockAgents, mockHealth)
		ctx := context.Background()
		_, _ = fc.NextAgent(ctx)
	}
}

// BenchmarkFallbackChainNextAgentByRole benchmarks with role-based strategy
func BenchmarkFallbackChainNextAgentByRole(b *testing.B) {
	mockAgents := &benchAgentListProvider{
		agents: []*acp.AgentConnection{
			{ID: "agent-1"},
			{ID: "agent-2"},
			{ID: "agent-3"},
		},
	}
	mockHealth := &benchHealthProvider{
		scores: map[string]float64{
			"agent-1": 0.9,
			"agent-2": 0.8,
			"agent-3": 0.7,
		},
	}

	config := FallbackConfig{
		MaxAttempts:       3,
		Strategy:          FallbackByRole,
		RequiredMinHealth: 0.5,
		AgentPreference:   []string{"agent-2", "agent-1", "agent-3"},
	}

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		fc := NewFallbackChain("task-"+string(rune(i)), config, mockAgents, mockHealth)
		ctx := context.Background()
		_, _ = fc.NextAgent(ctx)
	}
}
