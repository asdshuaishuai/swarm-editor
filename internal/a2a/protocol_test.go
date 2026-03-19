package a2a

import (
	"context"
	"fmt"
	"testing"
	"time"
)

func TestMessageCreation(t *testing.T) {
	msg := NewMessage(MessageTypeTaskRequest, "agent1", "agent2")

	if msg.ID == "" {
		t.Error("Expected message ID to be set")
	}

	if msg.Type != MessageTypeTaskRequest {
		t.Errorf("Expected type %s, got %s", MessageTypeTaskRequest, msg.Type)
	}

	if msg.From != "agent1" {
		t.Errorf("Expected From 'agent1', got %s", msg.From)
	}

	if msg.To != "agent2" {
		t.Errorf("Expected To 'agent2', got %s", msg.To)
	}

	if msg.Priority != PriorityNormal {
		t.Errorf("Expected normal priority, got %d", msg.Priority)
	}
}

func TestMessageWithPayload(t *testing.T) {
	payload := &TaskRequestPayload{
		TaskID:   "task1",
		Title:    "Test Task",
		Priority: 1,
	}

	msg := NewMessage(MessageTypeTaskRequest, "agent1", "agent2").
		WithPayload(payload)

	if len(msg.Payload) == 0 {
		t.Error("Expected payload to be set")
	}

	// Parse it back
	var parsed TaskRequestPayload
	err := msg.ParsePayload(&parsed)
	if err != nil {
		t.Errorf("Failed to parse payload: %v", err)
	}

	if parsed.TaskID != "task1" {
		t.Errorf("Expected TaskID 'task1', got %s", parsed.TaskID)
	}
}

func TestMessageWithPriority(t *testing.T) {
	msg := NewMessage(MessageTypeTaskRequest, "agent1", "agent2").
		WithPriority(PriorityCritical)

	if msg.Priority != PriorityCritical {
		t.Errorf("Expected critical priority, got %d", msg.Priority)
	}
}

func TestMessageWithCorrelation(t *testing.T) {
	msg := NewMessage(MessageTypeTaskRequest, "agent1", "agent2").
		WithCorrelation("corr-123")

	if msg.Correlation != "corr-123" {
		t.Errorf("Expected correlation 'corr-123', got %s", msg.Correlation)
	}
}

func TestMessageWithTTL(t *testing.T) {
	msg := NewMessage(MessageTypeTaskRequest, "agent1", "agent2").
		WithTTL(5 * time.Minute)

	if msg.TTL != 5*time.Minute {
		t.Errorf("Expected TTL 5m, got %v", msg.TTL)
	}
}

func TestMessageWithHeader(t *testing.T) {
	msg := NewMessage(MessageTypeTaskRequest, "agent1", "agent2").
		WithHeader("X-Custom", "value")

	if msg.Headers["X-Custom"] != "value" {
		t.Errorf("Expected header 'value', got %s", msg.Headers["X-Custom"])
	}
}

func TestMessageIsExpired(t *testing.T) {
	// Not expired
	msg1 := NewMessage(MessageTypeTaskRequest, "agent1", "agent2")
	if msg1.IsExpired() {
		t.Error("Message without TTL should not be expired")
	}

	// Expired
	msg2 := NewMessage(MessageTypeTaskRequest, "agent1", "agent2").
		WithTTL(1*time.Millisecond).
		WithHeader("skip", "") // Force timestamp to be set

	time.Sleep(10 * time.Millisecond)
	if !msg2.IsExpired() {
		t.Error("Message past TTL should be expired")
	}
}

func TestMessageIsBroadcast(t *testing.T) {
	msg1 := NewMessage(MessageTypeTaskRequest, "agent1", "broadcast")
	if !msg1.IsBroadcast() {
		t.Error("Message to 'broadcast' should be broadcast")
	}

	msg2 := NewMessage(MessageTypeTaskRequest, "agent1", "*")
	if !msg2.IsBroadcast() {
		t.Error("Message to '*' should be broadcast")
	}

	msg3 := NewMessage(MessageTypeTaskRequest, "agent1", "agent2")
	if msg3.IsBroadcast() {
		t.Error("Message to specific agent should not be broadcast")
	}
}

func TestRouterCreation(t *testing.T) {
	router := NewRouter(RouterConfig{})

	if router == nil {
		t.Fatal("Expected router to be created")
	}

	// Check defaults
	if router.config.QueueSize != 1000 {
		t.Errorf("Expected default queue size 1000, got %d", router.config.QueueSize)
	}
}

func TestRouterAgentRegistration(t *testing.T) {
	router := NewRouter(RouterConfig{})

	received := make(chan *Message, 1)
	router.RegisterAgent("agent1", func(m *Message) error {
		received <- m
		return nil
	}, []string{"coding", "testing"})

	status, ok := router.GetAgentStatus("agent1")
	if !ok {
		t.Error("Expected agent to be registered")
	}
	if status != "online" {
		t.Errorf("Expected status 'online', got %s", status)
	}

	// Check capabilities
	agents := router.GetAgentsByCapability("coding")
	if len(agents) != 1 || agents[0] != "agent1" {
		t.Error("Expected agent1 to have coding capability")
	}

	router.UnregisterAgent("agent1")
	_, ok = router.GetAgentStatus("agent1")
	if ok {
		t.Error("Expected agent to be unregistered")
	}
}

func TestRouterGroupMembership(t *testing.T) {
	router := NewRouter(RouterConfig{})

	router.RegisterAgent("agent1", func(m *Message) error { return nil }, nil)
	router.RegisterAgent("agent2", func(m *Message) error { return nil }, nil)

	router.JoinGroup("agent1", "team-alpha")
	router.JoinGroup("agent2", "team-alpha")

	// Test leave group
	router.LeaveGroup("agent1", "team-alpha")
}

func TestRouterMessageHandler(t *testing.T) {
	router := NewRouter(RouterConfig{})

	handled := make(chan *Message, 1)
	router.RegisterHandler(MessageTypeTaskRequest, func(m *Message) error {
		handled <- m
		return nil
	})

	// Process a message
	msg := NewMessage(MessageTypeTaskRequest, "agent1", "agent2")
	router.processMessage(msg)

	select {
	case h := <-handled:
		if h.ID != msg.ID {
			t.Error("Handler received wrong message")
		}
	case <-time.After(100 * time.Millisecond):
		t.Error("Handler was not called")
	}
}

func TestRouterSend(t *testing.T) {
	router := NewRouter(RouterConfig{})

	received := make(chan *Message, 1)
	router.RegisterAgent("agent2", func(m *Message) error {
		received <- m
		return nil
	}, nil)

	msg := NewMessage(MessageTypeTaskRequest, "agent1", "agent2")

	err := router.Send(msg)
	if err != nil {
		t.Errorf("Failed to send message: %v", err)
	}

	select {
	case r := <-received:
		if r.ID != msg.ID {
			t.Error("Received wrong message")
		}
	case <-time.After(100 * time.Millisecond):
		t.Error("Message was not received")
	}
}

func TestRouterSendToUnknownAgent(t *testing.T) {
	router := NewRouter(RouterConfig{})

	msg := NewMessage(MessageTypeTaskRequest, "agent1", "unknown")
	err := router.Send(msg)

	if err == nil {
		t.Error("Expected error when sending to unknown agent")
	}
}

func TestRouterExpiredMessage(t *testing.T) {
	router := NewRouter(RouterConfig{})

	router.RegisterAgent("agent2", func(m *Message) error {
		return nil
	}, nil)

	// Create expired message
	msg := NewMessage(MessageTypeTaskRequest, "agent1", "agent2").
		WithTTL(1 * time.Millisecond)

	time.Sleep(10 * time.Millisecond)

	err := router.Send(msg)
	if err == nil {
		t.Error("Expected error for expired message")
	}
}

func TestRouterGetOnlineAgents(t *testing.T) {
	router := NewRouter(RouterConfig{})

	router.RegisterAgent("agent1", func(m *Message) error { return nil }, nil)
	router.RegisterAgent("agent2", func(m *Message) error { return nil }, nil)

	online := router.GetOnlineAgents()
	if len(online) != 2 {
		t.Errorf("Expected 2 online agents, got %d", len(online))
	}
}

func TestPayloadTypes(t *testing.T) {
	tests := []struct {
		name    string
		payload interface{}
	}{
		{"TaskRequest", &TaskRequestPayload{TaskID: "t1"}},
		{"TaskAccept", &TaskAcceptPayload{TaskID: "t1", AgentID: "a1"}},
		{"TaskProgress", &TaskProgressPayload{TaskID: "t1", Progress: 0.5}},
		{"TaskComplete", &TaskCompletePayload{TaskID: "t1"}},
		{"TaskFailed", &TaskFailedPayload{TaskID: "t1", Error: "err"}},
		{"Sync", &SyncPayload{StateType: "task"}},
		{"HelpRequest", &HelpRequestPayload{Reason: "need help"}},
		{"HelpOffer", &HelpOfferPayload{RequestID: "r1"}},
		{"KnowledgeShare", &KnowledgeSharePayload{Type: "pattern"}},
		{"Query", &QueryPayload{QueryID: "q1", QueryType: "state"}},
		{"Response", &ResponsePayload{QueryID: "q1", Success: true}},
		{"Proposal", &ProposalPayload{ProposalID: "p1"}},
		{"CounterProposal", &CounterProposalPayload{OriginalID: "p1"}},
		{"Agreement", &AgreementPayload{ProposalID: "p1"}},
		{"VoteRequest", &VoteRequestPayload{VoteID: "v1"}},
		{"Vote", &VotePayload{VoteID: "v1"}},
		{"VoteResult", &VoteResultPayload{VoteID: "v1"}},
		{"Signal", &SignalPayload{SignalType: "alert"}},
		{"Pheromone", &PheromonePayload{PheromoneType: "task"}},
		{"SwarmCommand", &SwarmCommandPayload{Command: "converge"}},
		{"TaskResult", &TaskResult{TaskID: "t1", AgentID: "a1"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			msg := NewMessage(MessageTypeTaskRequest, "from", "to").
				WithPayload(tt.payload)

			if len(msg.Payload) == 0 {
				t.Errorf("Payload not set for %s", tt.name)
			}
		})
	}
}

func TestRouterStartStop(t *testing.T) {
	router := NewRouter(RouterConfig{})

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	err := router.Start(ctx)
	if err != nil {
		t.Fatalf("Failed to start router: %v", err)
	}

	// Starting again should fail
	err = router.Start(context.Background())
	if err == nil {
		t.Error("Expected error when starting already running router")
	}

	// Stop should work
	router.Stop()

	// Stopping again should be safe
	router.Stop()
}

func TestRouterBroadcast(t *testing.T) {
	router := NewRouter(RouterConfig{})

	receivedCount := 0
	// Register multiple agents
	router.RegisterAgent("agent1", func(m *Message) error {
		receivedCount++
		return nil
	}, nil)
	router.RegisterAgent("agent2", func(m *Message) error {
		receivedCount++
		return nil
	}, nil)
	router.RegisterAgent("agent3", func(m *Message) error {
		receivedCount++
		return nil
	}, nil)

	// Send broadcast
	msg := NewMessage(MessageTypeBroadcast, "agent1", "broadcast")
	err := router.Send(msg)
	if err != nil {
		t.Errorf("Broadcast failed: %v", err)
	}

	if receivedCount != 2 { // Not 3 because sender is excluded
		t.Errorf("Expected 2 recipients, got %d", receivedCount)
	}
}

func TestRouterMulticast(t *testing.T) {
	router := NewRouter(RouterConfig{})

	receivedCount := 0
	// Register agents
	router.RegisterAgent("agent1", func(m *Message) error {
		receivedCount++
		return nil
	}, nil)
	router.RegisterAgent("agent2", func(m *Message) error {
		receivedCount++
		return nil
	}, nil)

	// Create group
	router.JoinGroup("agent1", "team-alpha")
	router.JoinGroup("agent2", "team-alpha")

	// Send multicast
	msg := NewMessage(MessageTypeMulticast, "coordinator", "ignored").
		WithPayload(map[string]string{"data": "test"})
	msg.Group = "team-alpha"

	err := router.Send(msg)
	if err != nil {
		t.Errorf("Multicast failed: %v", err)
	}

	if receivedCount != 2 {
		t.Errorf("Expected 2 recipients, got %d", receivedCount)
	}
}

func TestRouterMulticastUnknownGroup(t *testing.T) {
	router := NewRouter(RouterConfig{})

	msg := NewMessage(MessageTypeMulticast, "agent1", "ignored")
	msg.Group = "unknown-group"

	err := router.Send(msg)
	if err == nil {
		t.Error("Expected error for unknown group")
	}
}

func TestRouterEnqueue(t *testing.T) {
	router := NewRouter(RouterConfig{})

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	err := router.Start(ctx)
	if err != nil {
		t.Fatalf("Failed to start router: %v", err)
	}
	defer router.Stop()

	// Register handler
	handled := make(chan *Message, 1)
	router.RegisterHandler(MessageTypeTaskRequest, func(m *Message) error {
		handled <- m
		return nil
	})

	// Enqueue message
	msg := NewMessage(MessageTypeTaskRequest, "agent1", "agent2")
	err = router.Enqueue(msg)
	if err != nil {
		t.Errorf("Enqueue failed: %v", err)
	}

	// Wait for processing
	select {
	case <-handled:
		// Good
	case <-time.After(100 * time.Millisecond):
		t.Error("Message was not processed")
	}
}

func TestRouterEnqueueFull(t *testing.T) {
	router := NewRouter(RouterConfig{QueueSize: 1})

	// Fill the queue
	msg := NewMessage(MessageTypeTaskRequest, "agent1", "agent2")
	_ = router.Enqueue(msg)

	// Next enqueue should fail
	msg2 := NewMessage(MessageTypeTaskRequest, "agent2", "agent3")
	err := router.Enqueue(msg2)
	if err == nil {
		t.Error("Expected error when queue is full")
	}
}

func TestRouterSendWithRetry(t *testing.T) {
	router := NewRouter(RouterConfig{RetryCount: 3, RetryDelay: 10 * time.Millisecond})

	attempts := 0
	router.RegisterAgent("agent1", func(m *Message) error {
		attempts++
		if attempts < 3 {
			return fmt.Errorf("temporary error")
		}
		return nil
	}, nil)

	msg := NewMessage(MessageTypeTaskRequest, "sender", "agent1")
	err := router.Send(msg)
	if err != nil {
		t.Errorf("Send with retry failed: %v", err)
	}

	if attempts != 3 {
		t.Errorf("Expected 3 attempts, got %d", attempts)
	}
}

func TestRouterSendWithRetryFail(t *testing.T) {
	router := NewRouter(RouterConfig{RetryCount: 2, RetryDelay: 10 * time.Millisecond})

	router.RegisterAgent("agent1", func(m *Message) error {
		return fmt.Errorf("permanent error")
	}, nil)

	msg := NewMessage(MessageTypeTaskRequest, "sender", "agent1")
	err := router.Send(msg)
	if err == nil {
		t.Error("Expected error after all retries failed")
	}
}

func TestRouterBroadcastWithError(t *testing.T) {
	router := NewRouter(RouterConfig{})

	router.RegisterAgent("agent1", func(m *Message) error {
		return nil
	}, nil)
	router.RegisterAgent("agent2", func(m *Message) error {
		return fmt.Errorf("send error")
	}, nil)

	msg := NewMessage(MessageTypeBroadcast, "sender", "broadcast")
	err := router.Send(msg)
	if err == nil {
		t.Error("Expected error when some broadcasts fail")
	}
}

func TestMessageWithPayloadError(t *testing.T) {
	// Create a payload that can't be marshaled
	badPayload := make(chan int) // channels can't be marshaled to JSON

	msg := NewMessage(MessageTypeTaskRequest, "from", "to").
		WithPayload(badPayload)

	// Should contain error message instead of crashing
	if msg.Payload == nil {
		t.Error("Expected payload to contain error message")
	}
}
