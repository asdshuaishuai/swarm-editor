package acp

import (
	"context"
)

// NewTestConnection creates a fully connected AgentConnection backed by InmemTransport.
// This is the Go equivalent of hashicorp/raft's TestTransport: it provides a real
// working connection for unit testing without real processes, pipes, or network.
//
// The returned connection is in StateConnected state with a fully initialized Client.
// Caller must call the returned cleanup to stop all resources.
//
// This function is intended for use in tests only.
func NewTestConnection(id string) (*AgentConnection, *MockHandler, func()) {
	clientTransport, serverTransport := NewInmemTransportPair()

	c := NewClient(clientTransport)
	h := &MockHandler{}
	s := NewServer(h, serverTransport)

	ctx, cancel := context.WithCancel(context.Background())

	c.Start(ctx)
	s.Start(ctx)

	c.Initialize(ctx, &InitializeParams{
		ProtocolVersion: ProtocolVersion,
		ClientInfo:      ImplementationInfo{Name: "test", Version: "0.1.0"},
	})

	conn := &AgentConnection{
		ID:       id,
		State:    StateConnected,
		client:   c,
		sessions: make(map[SessionID]*AgentSession),
		ctx:      ctx,
		cancel:   cancel,
	}

	cleanup := func() {
		c.Stop()
		s.Stop()
		cancel()
	}

	return conn, h, cleanup
}

// RegisterTestConnection registers a pre-created test connection with the ConnectionManager.
// This allows tests to set up a fully connected agent without needing real processes.
// The caller is responsible for calling the connection's cleanup function.
func (m *ConnectionManager) RegisterTestConnection(conn *AgentConnection) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.connections[conn.ID] = conn
}
