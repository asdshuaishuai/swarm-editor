// Package swarm_test demonstrates usage of the swarm package APIs.
// These examples serve as both documentation and tests.
package swarm_test

import (
	"context"
	"fmt"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/swarm"
)

// ExampleNewCircuitBreaker demonstrates creating and using a CircuitBreaker
// to protect against cascading failures when calling external services.
func ExampleNewCircuitBreaker() {
	config := swarm.CircuitBreakerConfig{
		FailureThreshold: 3,
		SuccessThreshold: 2,
		Timeout:          30 * time.Second,
		MaxConcurrent:    10,
	}
	cb := swarm.NewCircuitBreaker(config)
	defer cb.Close()

	// Check circuit state before making a request
	fmt.Println("initial state:", cb.State())

	// Allow returns true if the request should proceed
	if cb.Allow() {
		// Simulate a successful operation
		cb.RecordSuccess()
	}

	fmt.Println("circuit healthy:", cb.IsHealthy())
	// Output:
	// initial state: closed
	// circuit healthy: true
}

// ExampleCircuitBreaker_Allow demonstrates the Allow/RecordSuccess/RecordFailure
// pattern for wrapping external calls with circuit breaker protection.
func ExampleCircuitBreaker_Allow() {
	cb := swarm.NewCircuitBreaker(swarm.DefaultCircuitBreakerConfig())
	defer cb.Close()

	// Simulate making requests with the circuit breaker pattern
	makeRequest := func(success bool) error {
		if !cb.Allow() {
			return fmt.Errorf("circuit open, request rejected")
		}
		if success {
			cb.RecordSuccess()
			return nil
		}
		cb.RecordFailure()
		return fmt.Errorf("request failed")
	}

	// Successful request
	_ = makeRequest(true)
	fmt.Println("after success - state:", cb.State())

	// Trigger failures to open the circuit
	for i := 0; i < 5; i++ {
		_ = makeRequest(false)
	}

	fmt.Println("after failures - state:", cb.State())
	fmt.Println("is healthy:", cb.IsHealthy())
	// Output:
	// after success - state: closed
	// after failures - state: open
	// is healthy: false
}

// ExampleNewLoopDetector demonstrates detecting loops in agent output.
func ExampleNewLoopDetector() {
	detector := swarm.NewLoopDetector()

	outputs := []string{
		"I am thinking about the problem...",
		"I am thinking about the problem...",
		"I am thinking about the problem...",
	}

	for i, output := range outputs {
		isLoop, _ := detector.CheckOutput(output)
		if isLoop {
			fmt.Printf("loop detected at output %d\n", i+1)
			break
		}
	}

	detector.Reset()
	fmt.Println("detector reset, consecutive count:", detector.ConsecutiveCount())
	// Output:
	// loop detected at output 3
	// detector reset, consecutive count: 0
}

// ExampleFallbackChain demonstrates using FallbackChain for cascading
// agent selection with health-based failover.
func ExampleFallbackChain() {
	agents := []*acp.AgentConnection{
		{ID: "agent-1"},
		{ID: "agent-2"},
		{ID: "agent-3"},
	}

	config := swarm.DefaultFallbackConfig()
	config.MaxAttempts = 3

	chain := swarm.NewFallbackChain(
		"task-123",
		config,
		swarm.NewStaticAgentListProvider(agents),
		nil,
	)

	ctx := context.Background()

	agent, err := chain.NextAgent(ctx)
	if err == nil {
		fmt.Println("first agent:", agent.ID)
		chain.MarkAttempted(agent.ID)
	}

	agent, err = chain.NextAgent(ctx)
	if err == nil {
		fmt.Println("second agent:", agent.ID)
		chain.MarkAttempted(agent.ID)
	}

	fmt.Println("remaining attempts:", chain.RemainingAttempts())
	// Output:
	// first agent: agent-1
	// second agent: agent-2
	// remaining attempts: 1
}

// ExampleNewCompositePolicy demonstrates composing multiple termination
// conditions with AND/OR logic.
func ExampleNewCompositePolicy() {
	policy := swarm.NewCompositePolicy(swarm.TerminationOR)

	policy.Add(swarm.NewMaxTurnsCondition(10))
	policy.Add(swarm.NewNoProgressCondition())
	policy.Add(swarm.NewTimeoutCondition(5 * time.Minute))

	fmt.Println("conditions registered:", policy.ConditionCount())

	result := policy.Check(5, "some output")
	fmt.Println("at turn 5 - terminated:", result.Terminated)

	result = policy.Check(10, "final output")
	fmt.Println("at turn 10 - terminated:", result.Terminated)
	fmt.Println("reason:", result.Condition)

	policy.Reset()
	// Output:
	// conditions registered: 3
	// at turn 5 - terminated: false
	// at turn 10 - terminated: true
	// reason: max_turns
}

// ExampleNewMaxTurnsCondition demonstrates using a simple max turns condition.
func ExampleNewMaxTurnsCondition() {
	cond := swarm.NewMaxTurnsCondition(3)

	fmt.Println("condition name:", cond.Name())
	fmt.Println("at turn 2:", cond.Check(2, "").Terminated)
	fmt.Println("at turn 3:", cond.Check(3, "").Terminated)
	// Output:
	// condition name: max_turns
	// at turn 2: false
	// at turn 3: true
}

// ExampleNewTimeoutCondition demonstrates using a timeout condition.
func ExampleNewTimeoutCondition() {
	cond := swarm.NewTimeoutCondition(100 * time.Millisecond)

	fmt.Println("condition name:", cond.Name())

	result := cond.Check(1, "")
	fmt.Println("immediately - terminated:", result.Terminated)

	time.Sleep(150 * time.Millisecond)

	result = cond.Check(2, "")
	fmt.Println("after timeout - terminated:", result.Terminated)

	cond.Reset()
	// Output:
	// condition name: timeout
	// immediately - terminated: false
	// after timeout - terminated: true
}

// ExampleCircuitBreaker_OnStateChange demonstrates setting up a callback
// for circuit state transitions.
func ExampleCircuitBreaker_OnStateChange() {
	cb := swarm.NewCircuitBreaker(swarm.CircuitBreakerConfig{
		FailureThreshold: 2,
		Timeout:          1 * time.Second,
	})
	defer cb.Close()

	cb.OnStateChange(func(from, to swarm.CircuitState) {
		fmt.Printf("state change: %s -> %s\n", from, to)
	})

	cb.ForceOpen()

	fmt.Println("circuit is open:", cb.IsOpen())
	// Output:
	// state change: closed -> open
	// circuit is open: true
}
