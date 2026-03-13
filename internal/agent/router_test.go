package agent

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/swarm-editor/swarm-editor/internal/acp"
)

func TestNewRouter(t *testing.T) {
	router := NewRouter()

	if router == nil {
		t.Fatal("NewRouter returned nil")
	}

	if router.agents == nil {
		t.Error("agents map should be initialized")
	}

	if router.sessions == nil {
		t.Error("sessions map should be initialized")
	}

	if router.handlers == nil {
		t.Error("handlers map should be initialized")
	}
}

func TestRouterRegisterAgent(t *testing.T) {
	router := NewRouter()
	agent := NewAgent("test", AgentTypeCoder)

	router.RegisterAgent(agent)

	if len(router.agents) != 1 {
		t.Errorf("Expected 1 agent, got %d", len(router.agents))
	}

	if router.agents[agent.ID] != agent {
		t.Error("Agent not registered correctly")
	}
}

func TestRouterUnregisterAgent(t *testing.T) {
	router := NewRouter()
	agent := NewAgent("test", AgentTypeCoder)

	router.RegisterAgent(agent)
	router.UnregisterAgent(agent.ID)

	if len(router.agents) != 0 {
		t.Errorf("Expected 0 agents after unregister, got %d", len(router.agents))
	}
}

func TestRouterBindSession(t *testing.T) {
	router := NewRouter()
	sessionID := acp.SessionID("session-1")
	agentIDs := []acp.AgentID{"agent-1", "agent-2"}

	router.BindSession(sessionID, agentIDs)

	result := router.GetSessionAgents(sessionID)
	if len(result) != 2 {
		t.Errorf("Expected 2 agents in session, got %d", len(result))
	}
}

func TestRouterGetSessionAgentsEmpty(t *testing.T) {
	router := NewRouter()

	result := router.GetSessionAgents("non-existent")
	if result != nil {
		t.Errorf("Expected nil for non-existent session, got %v", result)
	}
}

func TestRouterRoute(t *testing.T) {
	router := NewRouter()
	agent := NewAgent("test", AgentTypeCoder)

	// Set up update handler to capture the message
	var receivedUpdate *acp.Update
	agent.OnUpdate(func(update *acp.Update) {
		receivedUpdate = update
	})

	router.RegisterAgent(agent)

	msg := &RoutedMessage{
		From: "sender",
		To:   agent.ID,
		Type: MessageTypeTask,
	}

	err := router.Route(context.Background(), msg)
	if err != nil {
		t.Fatalf("Route failed: %v", err)
	}

	if receivedUpdate == nil {
		t.Error("Should have received update")
	}

	if receivedUpdate.SessionUpdate != string(MessageTypeTask) {
		t.Errorf("Expected SessionUpdate '%s', got '%s'", MessageTypeTask, receivedUpdate.SessionUpdate)
	}
}

func TestRouterRouteNonExistent(t *testing.T) {
	router := NewRouter()

	msg := &RoutedMessage{
		From: "sender",
		To:   "non-existent",
		Type: MessageTypeTask,
	}

	err := router.Route(context.Background(), msg)
	if err == nil {
		t.Fatal("Route should return error for non-existent agent")
	}
	if !errors.Is(err, ErrAgentNotFound) {
		t.Errorf("Expected ErrAgentNotFound, got: %v", err)
	}
}

func TestRouterRouteEmptyDestination(t *testing.T) {
	router := NewRouter()
	agent := NewAgent("test", AgentTypeCoder)
	router.RegisterAgent(agent)

	msg := &RoutedMessage{
		From: "sender",
		To:   "", // Empty destination
		Type: MessageTypeTask,
	}

	err := router.Route(context.Background(), msg)
	if err == nil {
		t.Fatal("Route should return error for empty destination")
	}
}

func TestRouterBroadcast(t *testing.T) {
	router := NewRouter()

	// Create agents
	agent1 := NewAgent("agent1", AgentTypeCoder)
	agent2 := NewAgent("agent2", AgentTypeCoder)

	var received1, received2 bool
	agent1.OnUpdate(func(update *acp.Update) {
		received1 = true
	})
	agent2.OnUpdate(func(update *acp.Update) {
		received2 = true
	})

	router.RegisterAgent(agent1)
	router.RegisterAgent(agent2)

	sessionID := acp.SessionID("session-1")
	router.BindSession(sessionID, []acp.AgentID{agent1.ID, agent2.ID})

	msg := &RoutedMessage{
		From:      agent1.ID,
		SessionID: sessionID,
		Type:      MessageTypeBroadcast,
	}

	err := router.Broadcast(context.Background(), msg)
	if err != nil {
		t.Fatalf("Broadcast failed: %v", err)
	}

	// Agent1 should not receive (it's the sender)
	if received1 {
		t.Error("Agent1 should not receive broadcast from itself")
	}

	// Agent2 should receive
	if !received2 {
		t.Error("Agent2 should have received broadcast")
	}
}

func TestRouterBroadcastToAll(t *testing.T) {
	router := NewRouter()

	// Create agents
	agent1 := NewAgent("agent1", AgentTypeCoder)
	agent2 := NewAgent("agent2", AgentTypeCoder)

	var received1, received2 bool
	agent1.OnUpdate(func(update *acp.Update) {
		received1 = true
	})
	agent2.OnUpdate(func(update *acp.Update) {
		received2 = true
	})

	router.RegisterAgent(agent1)
	router.RegisterAgent(agent2)

	msg := &RoutedMessage{
		From: "external",
		Type: MessageTypeBroadcast,
	}

	err := router.BroadcastToAll(context.Background(), msg)
	if err != nil {
		t.Fatalf("BroadcastToAll failed: %v", err)
	}

	if !received1 || !received2 {
		t.Error("Both agents should have received broadcast")
	}
}

func TestRouterRegisterHandler(t *testing.T) {
	router := NewRouter()

	called := false
	handler := func(ctx context.Context, msg *RoutedMessage) error {
		called = true
		return nil
	}

	router.RegisterHandler(MessageTypeTask, handler)

	msg := &RoutedMessage{
		Type: MessageTypeTask,
	}

	err := router.Handle(context.Background(), msg)
	if err != nil {
		t.Fatalf("Handle failed: %v", err)
	}

	if !called {
		t.Error("Handler should have been called")
	}
}

func TestRouterHandleNoHandler(t *testing.T) {
	router := NewRouter()

	msg := &RoutedMessage{
		Type: MessageTypeTask,
	}

	err := router.Handle(context.Background(), msg)
	if err != nil {
		t.Fatalf("Handle should not error when no handler: %v", err)
	}
}

func TestRouterFanOut(t *testing.T) {
	router := NewRouter()

	agent1 := NewAgent("agent1", AgentTypeCoder)
	agent2 := NewAgent("agent2", AgentTypeCoder)

	router.RegisterAgent(agent1)
	router.RegisterAgent(agent2)

	msg := &RoutedMessage{
		From: "sender",
		Type: MessageTypeTask,
	}

	results, err := router.FanOut(context.Background(), []acp.AgentID{agent1.ID, agent2.ID}, msg)
	if err != nil {
		t.Fatalf("FanOut failed: %v", err)
	}

	count := 0
	for range results {
		count++
	}

	if count != 2 {
		t.Errorf("Expected 2 results, got %d", count)
	}
}

func TestRouterFanOutWithNonExistent(t *testing.T) {
	router := NewRouter()

	agent1 := NewAgent("agent1", AgentTypeCoder)
	router.RegisterAgent(agent1)

	msg := &RoutedMessage{
		From: "sender",
		Type: MessageTypeTask,
	}

	results, err := router.FanOut(context.Background(), []acp.AgentID{agent1.ID, "non-existent"}, msg)
	if err != nil {
		t.Fatalf("FanOut failed: %v", err)
	}

	count := 0
	for range results {
		count++
	}

	// Only agent1 should respond
	if count != 1 {
		t.Errorf("Expected 1 result, got %d", count)
	}
}

func TestNewRoundRobin(t *testing.T) {
	agents := []*Agent{
		NewAgent("agent1", AgentTypeCoder),
		NewAgent("agent2", AgentTypeCoder),
	}

	rr := NewRoundRobin(agents)

	if rr == nil {
		t.Fatal("NewRoundRobin returned nil")
	}

	if len(rr.agents) != 2 {
		t.Errorf("Expected 2 agents, got %d", len(rr.agents))
	}
}

func TestRoundRobinNext(t *testing.T) {
	agents := []*Agent{
		NewAgent("agent1", AgentTypeCoder),
		NewAgent("agent2", AgentTypeCoder),
	}

	rr := NewRoundRobin(agents)

	// First call
	first := rr.Next()
	if first == nil {
		t.Fatal("First Next returned nil")
	}

	// Second call
	second := rr.Next()
	if second == nil {
		t.Fatal("Second Next returned nil")
	}

	// Should cycle back
	third := rr.Next()
	if third == nil {
		t.Fatal("Third Next returned nil")
	}

	// Third should equal first (cycling)
	if third.ID != first.ID {
		t.Error("RoundRobin should cycle back to first agent")
	}
}

func TestRoundRobinEmpty(t *testing.T) {
	rr := NewRoundRobin(nil)

	agent := rr.Next()
	if agent != nil {
		t.Error("Next should return nil for empty agents")
	}
}

func TestNewLeastLoaded(t *testing.T) {
	agents := []*Agent{
		NewAgent("agent1", AgentTypeCoder),
		NewAgent("agent2", AgentTypeCoder),
	}

	ll := NewLeastLoaded(agents)

	if ll == nil {
		t.Fatal("NewLeastLoaded returned nil")
	}

	if len(ll.agents) != 2 {
		t.Errorf("Expected 2 agents, got %d", len(ll.agents))
	}
}

func TestLeastLoadedSelect(t *testing.T) {
	agent1 := NewAgent("agent1", AgentTypeCoder)
	agent2 := NewAgent("agent2", AgentTypeCoder)

	// Make agent1 have more load
	agent1.toolHistory = []ToolExecution{
		{ID: "tool1"},
		{ID: "tool2"},
	}

	agents := []*Agent{agent1, agent2}
	ll := NewLeastLoaded(agents)

	selected := ll.Select()
	if selected == nil {
		t.Fatal("Select returned nil")
	}

	// Agent2 should be selected (less load)
	if selected.ID != agent2.ID {
		t.Errorf("Expected agent2 (less load), got %s", selected.ID)
	}
}

func TestLeastLoadedSelectEmpty(t *testing.T) {
	ll := NewLeastLoaded(nil)

	agent := ll.Select()
	if agent != nil {
		t.Error("Select should return nil for empty agents")
	}
}

func TestMessageTypeConstants(t *testing.T) {
	types := []MessageType{
		MessageTypeTask,
		MessageTypeResult,
		MessageTypeQuery,
		MessageTypeResponse,
		MessageTypeBroadcast,
		MessageTypeConsensus,
		MessageTypeSync,
	}

	for _, mt := range types {
		if mt == "" {
			t.Error("MessageType should not be empty")
		}
	}
}

func TestRoutedMessageJSON(t *testing.T) {
	msg := &RoutedMessage{
		ID:        "msg-1",
		From:      "agent-1",
		To:        "agent-2",
		SessionID: "session-1",
		Type:      MessageTypeTask,
		Payload:   json.RawMessage(`{"key": "value"}`),
		Timestamp: 1234567890,
	}

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed RoutedMessage
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.ID != "msg-1" {
		t.Error("ID mismatch")
	}

	if parsed.Type != MessageTypeTask {
		t.Error("Type mismatch")
	}
}

func TestRouterConcurrentAccess(t *testing.T) {
	router := NewRouter()
	done := make(chan bool)

	// Concurrent registrations
	for i := 0; i < 10; i++ {
		go func() {
			agent := NewAgent("agent", AgentTypeCoder)
			router.RegisterAgent(agent)
			done <- true
		}()
	}

	// Concurrent reads
	for i := 0; i < 10; i++ {
		go func() {
			router.GetSessionAgents("nonexistent") // Safe read access
			done <- true
		}()
	}

	// Wait for all goroutines
	for i := 0; i < 20; i++ {
		<-done
	}
}

// Edge case tests

func TestRouterRegisterNilAgent(t *testing.T) {
	router := NewRouter()

	// Should not panic
	router.RegisterAgent(nil)

	if len(router.agents) != 0 {
		t.Error("Nil agent should not be registered")
	}
}

func TestRouterRouteNilMessage(t *testing.T) {
	router := NewRouter()

	err := router.Route(context.Background(), nil)
	if err == nil {
		t.Error("Route should return error for nil message")
	}
}

func TestRouterBroadcastNilMessage(t *testing.T) {
	router := NewRouter()

	// Should not panic
	err := router.Broadcast(context.Background(), nil)
	if err != nil {
		t.Errorf("Broadcast should not error for nil message: %v", err)
	}
}

func TestRouterBroadcastToAllNilMessage(t *testing.T) {
	router := NewRouter()

	// Should not panic
	err := router.BroadcastToAll(context.Background(), nil)
	if err != nil {
		t.Errorf("BroadcastToAll should not error for nil message: %v", err)
	}
}

func TestRouterFanOutEmptyList(t *testing.T) {
	router := NewRouter()

	msg := &RoutedMessage{
		From: "sender",
		Type: MessageTypeTask,
	}

	results, err := router.FanOut(context.Background(), []acp.AgentID{}, msg)
	if err != nil {
		t.Fatalf("FanOut failed: %v", err)
	}

	count := 0
	for range results {
		count++
	}

	if count != 0 {
		t.Errorf("Expected 0 results for empty list, got %d", count)
	}
}

func TestRouterFanOutNilMessage(t *testing.T) {
	router := NewRouter()
	agent := NewAgent("agent1", AgentTypeCoder)
	router.RegisterAgent(agent)

	results, err := router.FanOut(context.Background(), []acp.AgentID{agent.ID}, nil)
	if err != nil {
		t.Fatalf("FanOut failed: %v", err)
	}

	count := 0
	for range results {
		count++
	}

	if count != 0 {
		t.Errorf("Expected 0 results for nil message, got %d", count)
	}
}

func TestRouterConcurrentBroadcast(t *testing.T) {
	router := NewRouter()

	// Create multiple agents
	for i := 0; i < 5; i++ {
		agent := NewAgent("agent", AgentTypeCoder)
		router.RegisterAgent(agent)
	}

	sessionID := acp.SessionID("session-1")
	agentIDs := make([]acp.AgentID, 0)
	for id := range router.agents {
		agentIDs = append(agentIDs, id)
	}
	router.BindSession(sessionID, agentIDs)

	done := make(chan bool)

	// Concurrent broadcasts
	for i := 0; i < 10; i++ {
		go func(idx int) {
			msg := &RoutedMessage{
				From:      "external",
				SessionID: sessionID,
				Type:      MessageTypeBroadcast,
			}
			router.Broadcast(context.Background(), msg)
			done <- true
		}(i)
	}

	// Wait for all goroutines
	for i := 0; i < 10; i++ {
		<-done
	}
}

func TestRoundRobinConcurrentAccess(t *testing.T) {
	agents := []*Agent{
		NewAgent("agent1", AgentTypeCoder),
		NewAgent("agent2", AgentTypeCoder),
		NewAgent("agent3", AgentTypeCoder),
	}

	rr := NewRoundRobin(agents)
	done := make(chan *Agent, 100)

	// Concurrent Next calls
	for i := 0; i < 50; i++ {
		go func() {
			agent := rr.Next()
			done <- agent
		}()
	}

	// Collect results
	results := make(map[acp.AgentID]int)
	for i := 0; i < 50; i++ {
		agent := <-done
		if agent != nil {
			results[agent.ID]++
		}
	}

	// Each agent should be selected roughly equally
	for _, count := range results {
		if count < 10 || count > 25 {
			t.Logf("Uneven distribution: %d", count)
		}
	}
}

func TestLeastLoadedConcurrentAccess(t *testing.T) {
	agents := []*Agent{
		NewAgent("agent1", AgentTypeCoder),
		NewAgent("agent2", AgentTypeCoder),
	}

	ll := NewLeastLoaded(agents)
	done := make(chan bool, 100)

	// Concurrent Select calls
	for i := 0; i < 50; i++ {
		go func() {
			ll.Select()
			done <- true
		}()
	}

	// Wait for all goroutines
	for i := 0; i < 50; i++ {
		<-done
	}
}
