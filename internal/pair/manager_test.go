package pair

import (
	"context"
	"testing"

	"github.com/swarm-editor/swarm-editor/internal/agent"
)

func TestNewManager(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewManager(registry)

	if m == nil {
		t.Fatal("NewManager returned nil")
	}

	if m.registry == nil {
		t.Error("registry should be set")
	}

	if m.sessions == nil {
		t.Error("sessions map should be initialized")
	}
}

func TestNewManagerNilRegistry(t *testing.T) {
	m := NewManager(nil)

	if m != nil {
		t.Error("NewManager with nil registry should return nil")
	}
}

func TestManagerCreateSession(t *testing.T) {
	registry := agent.NewRegistry()
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	registry.Register(driver)
	registry.Register(navigator)

	m := NewManager(registry)
	session, err := m.CreateSession(driver.ID, navigator.ID)

	if err != nil {
		t.Fatalf("CreateSession failed: %v", err)
	}

	if session == nil {
		t.Fatal("session should not be nil")
	}

	if session.Driver.ID != driver.ID {
		t.Errorf("Driver ID mismatch")
	}

	if session.Navigator.ID != navigator.ID {
		t.Errorf("Navigator ID mismatch")
	}
}

func TestManagerCreateSessionNonExistentDriver(t *testing.T) {
	registry := agent.NewRegistry()
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	registry.Register(navigator)

	m := NewManager(registry)
	session, _ := m.CreateSession("non-existent", navigator.ID)

	if session != nil {
		t.Error("session should be nil for non-existent driver")
	}
}

func TestManagerCreateSessionNonExistentNavigator(t *testing.T) {
	registry := agent.NewRegistry()
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	registry.Register(driver)

	m := NewManager(registry)
	session, _ := m.CreateSession(driver.ID, "non-existent")

	if session != nil {
		t.Error("session should be nil for non-existent navigator")
	}
}

func TestManagerCreateSessionSameAgent(t *testing.T) {
	registry := agent.NewRegistry()
	agent1 := agent.NewAgent("agent1", agent.AgentTypeCoder)
	registry.Register(agent1)

	m := NewManager(registry)
	session, err := m.CreateSession(agent1.ID, agent1.ID)

	if session != nil {
		t.Error("session should be nil when driver and navigator are the same")
	}
	if err != ErrSameAgent {
		t.Errorf("Expected ErrSameAgent, got: %v", err)
	}
}

func TestManagerCreateSessionAgentAlreadyInSession(t *testing.T) {
	registry := agent.NewRegistry()
	driver1 := agent.NewAgent("driver1", agent.AgentTypeCoder)
	navigator1 := agent.NewAgent("navigator1", agent.AgentTypeReviewer)
	navigator2 := agent.NewAgent("navigator2", agent.AgentTypeReviewer)
	registry.Register(driver1)
	registry.Register(navigator1)
	registry.Register(navigator2)

	m := NewManager(registry)
	_, err := m.CreateSession(driver1.ID, navigator1.ID)
	if err != nil {
		t.Fatalf("First CreateSession failed: %v", err)
	}

	// Try to create another session with driver1
	session, err := m.CreateSession(driver1.ID, navigator2.ID)
	if session != nil {
		t.Error("session should be nil when agent is already in another session")
	}
	if err != ErrAgentInSession {
		t.Errorf("Expected ErrAgentInSession, got: %v", err)
	}

	// Try to create another session with navigator1
	session, err = m.CreateSession(navigator2.ID, navigator1.ID)
	if session != nil {
		t.Error("session should be nil when agent is already in another session")
	}
	if err != ErrAgentInSession {
		t.Errorf("Expected ErrAgentInSession, got: %v", err)
	}
}

func TestManagerGetSession(t *testing.T) {
	registry := agent.NewRegistry()
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	registry.Register(driver)
	registry.Register(navigator)

	m := NewManager(registry)
	session, _ := m.CreateSession(driver.ID, navigator.ID)

	// Get existing session
	found, ok := m.GetSession(session.ID)
	if !ok {
		t.Error("session should be found")
	}
	if found.ID != session.ID {
		t.Error("session ID mismatch")
	}

	// Get non-existent session
	_, ok = m.GetSession("non-existent")
	if ok {
		t.Error("non-existent session should not be found")
	}
}

func TestManagerEndSession(t *testing.T) {
	registry := agent.NewRegistry()
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	registry.Register(driver)
	registry.Register(navigator)

	m := NewManager(registry)
	session, _ := m.CreateSession(driver.ID, navigator.ID)

	err := m.EndSession(session.ID)
	if err != nil {
		t.Errorf("EndSession should not return error for existing session: %v", err)
	}

	// Verify session is removed
	_, ok := m.GetSession(session.ID)
	if ok {
		t.Error("session should be removed after EndSession")
	}

	// EndSession for non-existent session should return error
	err = m.EndSession("non-existent")
	if err == nil {
		t.Error("EndSession should return error for non-existent session")
	}
}

func TestManagerGetActiveSessions(t *testing.T) {
	registry := agent.NewRegistry()
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	registry.Register(driver)
	registry.Register(navigator)

	m := NewManager(registry)

	// No active sessions initially
	active := m.GetActiveSessions()
	if len(active) != 0 {
		t.Errorf("Expected 0 active sessions, got %d", len(active))
	}

	// Create session
	session, _ := m.CreateSession(driver.ID, navigator.ID)
	session.Start(context.Background())

	active = m.GetActiveSessions()
	if len(active) != 1 {
		t.Errorf("Expected 1 active session, got %d", len(active))
	}

	// Pause session
	session.Pause()
	active = m.GetActiveSessions()
	if len(active) != 0 {
		t.Errorf("Expected 0 active sessions after pause, got %d", len(active))
	}
}

func TestManagerAutoPair(t *testing.T) {
	registry := agent.NewRegistry()

	// Add 4 idle agents
	for i := 0; i < 4; i++ {
		a := agent.NewAgent("agent", agent.AgentTypeCoder)
		registry.Register(a)
	}

	m := NewManager(registry)
	sessions, err := m.AutoPair(context.Background())

	if err != nil {
		t.Fatalf("AutoPair failed: %v", err)
	}

	// Should create 2 pairs from 4 agents
	if len(sessions) != 2 {
		t.Errorf("Expected 2 sessions, got %d", len(sessions))
	}
}

func TestManagerAutoPairInsufficientAgents(t *testing.T) {
	registry := agent.NewRegistry()

	// Only 1 agent
	a := agent.NewAgent("agent", agent.AgentTypeCoder)
	registry.Register(a)

	m := NewManager(registry)
	sessions, _ := m.AutoPair(context.Background())

	if sessions != nil {
		t.Error("AutoPair should return nil with insufficient agents")
	}
}

func TestManagerGetAgentSession(t *testing.T) {
	registry := agent.NewRegistry()
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	registry.Register(driver)
	registry.Register(navigator)

	m := NewManager(registry)
	m.CreateSession(driver.ID, navigator.ID)

	// Find by driver ID
	found := m.GetAgentSessionInfo(driver.ID)
	if found == nil {
		t.Error("should find session by driver ID")
	}

	// Find by navigator ID
	found = m.GetAgentSessionInfo(navigator.ID)
	if found == nil {
		t.Error("should find session by navigator ID")
	}

	// Non-participant
	found = m.GetAgentSessionInfo("non-existent")
	if found != nil {
		t.Error("should not find session for non-participant")
	}
}

func TestManagerGetStats(t *testing.T) {
	registry := agent.NewRegistry()
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	registry.Register(driver)
	registry.Register(navigator)

	m := NewManager(registry)

	// No sessions
	stats := m.GetStats()
	if len(stats) != 0 {
		t.Errorf("Expected 0 stats, got %d", len(stats))
	}

	// Create session
	session, _ := m.CreateSession(driver.ID, navigator.ID)
	session.Start(context.Background())

	stats = m.GetStats()
	if len(stats) != 1 {
		t.Errorf("Expected 1 stat, got %d", len(stats))
	}

	if stats[0].SessionID != session.ID {
		t.Error("stat session ID mismatch")
	}
}

func TestManagerBroadcastToSession(t *testing.T) {
	registry := agent.NewRegistry()
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	registry.Register(driver)
	registry.Register(navigator)

	m := NewManager(registry)
	session, _ := m.CreateSession(driver.ID, navigator.ID)
	session.Start(context.Background())

	// Broadcast message
	m.BroadcastToSession(session.ID, driver.ID, "Hello!")

	// Verify message was sent
	messages := session.GetMessages()
	if len(messages) != 1 {
		t.Errorf("Expected 1 message, got %d", len(messages))
	}

	if messages[0].Content != "Hello!" {
		t.Errorf("Expected content 'Hello!', got '%s'", messages[0].Content)
	}
}

func TestManagerBroadcastToNonExistentSession(t *testing.T) {
	registry := agent.NewRegistry()
	m := NewManager(registry)

	// Should not panic - broadcast to non-existent session
	m.BroadcastToSession("non-existent", "agent1", "Hello!")

	// Verify no panic occurred
	if m == nil {
		t.Error("Manager should still exist")
	}
}
