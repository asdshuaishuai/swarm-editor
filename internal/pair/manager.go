package pair

import (
	"context"
	"errors"
	"sync"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
)

// Error definitions for pair manager
var (
	ErrDriverNotFound    = errors.New("driver agent not found")
	ErrNavigatorNotFound = errors.New("navigator agent not found")
	ErrNotEnoughAgents   = errors.New("not enough idle agents for pairing")
	ErrSameAgent         = errors.New("driver and navigator cannot be the same agent")
	ErrAgentInSession    = errors.New("agent is already in another session")
)

// Manager manages pair programming sessions
type Manager struct {
	mu       sync.RWMutex
	sessions map[string]*PairSession
	registry *agent.Registry
}

// NewManager creates a new pair programming manager
func NewManager(registry *agent.Registry) *Manager {
	if registry == nil {
		return nil
	}
	return &Manager{
		sessions: make(map[string]*PairSession),
		registry: registry,
	}
}

// CreateSession creates a new pair programming session
func (m *Manager) CreateSession(driverID, navigatorID acp.AgentID) (*PairSession, error) {
	// Check if driver and navigator are the same agent
	if driverID == navigatorID {
		return nil, ErrSameAgent
	}

	// Check if driver is already in a session
	if existingSession := m.GetAgentSession(driverID); existingSession != nil {
		return nil, ErrAgentInSession
	}

	// Check if navigator is already in a session
	if existingSession := m.GetAgentSession(navigatorID); existingSession != nil {
		return nil, ErrAgentInSession
	}

	driver, ok := m.registry.Get(driverID)
	if !ok {
		return nil, ErrDriverNotFound
	}

	navigator, ok := m.registry.Get(navigatorID)
	if !ok {
		return nil, ErrNavigatorNotFound
	}

	session := NewPairSession(driver, navigator)

	m.mu.Lock()
	m.sessions[session.ID] = session
	m.mu.Unlock()

	return session, nil
}

// GetSession retrieves a session by ID
func (m *Manager) GetSession(id string) (*PairSession, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	session, ok := m.sessions[id]
	return session, ok
}

// EndSession ends and removes a session
// Returns an error if the session is not found
func (m *Manager) EndSession(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	session, ok := m.sessions[id]
	if !ok {
		return errors.New("session not found")
	}

	session.End()
	delete(m.sessions, id)
	return nil
}

// GetActiveSessions returns all active sessions
func (m *Manager) GetActiveSessions() []*PairSession {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*PairSession, 0)
	for _, session := range m.sessions {
		if session.GetState() == PairStateActive {
			result = append(result, session)
		}
	}
	return result
}

// AutoPair automatically pairs available agents
func (m *Manager) AutoPair(ctx context.Context) ([]*PairSession, error) {
	idleAgents := m.registry.GetIdle()
	if len(idleAgents) < 2 {
		return nil, nil
	}

	var created []*PairSession

	for i := 0; i < len(idleAgents)-1; i += 2 {
		driver := idleAgents[i]
		navigator := idleAgents[i+1]

		session, err := m.CreateSession(driver.ID, navigator.ID)
		if err != nil {
			continue
		}

		if err := session.Start(ctx); err != nil {
			continue
		}

		created = append(created, session)
	}

	return created, nil
}

// GetAgentSession returns the session an agent is participating in
func (m *Manager) GetAgentSession(agentID acp.AgentID) *PairSession {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, session := range m.sessions {
		if session.Driver.ID == agentID || session.Navigator.ID == agentID {
			return session
		}
	}
	return nil
}

// GetStats returns statistics for all sessions
func (m *Manager) GetStats() []*PairStats {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*PairStats, 0, len(m.sessions))
	for _, session := range m.sessions {
		result = append(result, session.Stats())
	}
	return result
}

// BroadcastToSession sends a message to all participants in a session
func (m *Manager) BroadcastToSession(sessionID string, from acp.AgentID, message string) {
	m.mu.RLock()
	session, ok := m.sessions[sessionID]
	m.mu.RUnlock()

	if ok {
		session.SendMessage(from, message)
	}
}
