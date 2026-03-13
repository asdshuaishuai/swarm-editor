package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	"github.com/swarm-editor/swarm-editor/internal/acp"
)

// Error definitions for router
var (
	ErrAgentNotFound     = errors.New("agent not found")
	ErrSessionNotFound   = errors.New("session not found")
	ErrNoAgentsInSession = errors.New("no agents in session")
)

// Router handles message routing between agents
type Router struct {
	mu       sync.RWMutex
	agents   map[acp.AgentID]*Agent
	sessions map[acp.SessionID][]acp.AgentID
	handlers map[string]MessageHandler
}

// MessageHandler handles routed messages
type MessageHandler func(ctx context.Context, msg *RoutedMessage) error

// RoutedMessage represents a message with routing information
type RoutedMessage struct {
	ID        string
	From      acp.AgentID
	To        acp.AgentID // Empty for broadcast
	SessionID acp.SessionID
	Type      MessageType
	Payload   json.RawMessage
	Timestamp int64
}

// MessageType defines the type of routed message
type MessageType string

const (
	MessageTypeTask      MessageType = "task"
	MessageTypeResult    MessageType = "result"
	MessageTypeQuery     MessageType = "query"
	MessageTypeResponse  MessageType = "response"
	MessageTypeBroadcast MessageType = "broadcast"
	MessageTypeConsensus MessageType = "consensus"
	MessageTypeSync      MessageType = "sync"
)

// NewRouter creates a new message router
func NewRouter() *Router {
	return &Router{
		agents:   make(map[acp.AgentID]*Agent),
		sessions: make(map[acp.SessionID][]acp.AgentID),
		handlers: make(map[string]MessageHandler),
	}
}

// RegisterAgent registers an agent with the router
func (r *Router) RegisterAgent(agent *Agent) {
	if agent == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.agents[agent.ID] = agent
}

// UnregisterAgent removes an agent from the router
func (r *Router) UnregisterAgent(id acp.AgentID) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.agents, id)
}

// BindSession binds agents to a session
func (r *Router) BindSession(sessionID acp.SessionID, agentIDs []acp.AgentID) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sessions[sessionID] = agentIDs
}

// GetSessionAgents returns agents bound to a session
func (r *Router) GetSessionAgents(sessionID acp.SessionID) []acp.AgentID {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.sessions[sessionID]
}

// Route sends a message to a specific agent
// Returns ErrAgentNotFound if the target agent is not registered
func (r *Router) Route(ctx context.Context, msg *RoutedMessage) error {
	if msg == nil {
		return fmt.Errorf("message cannot be nil")
	}
	if msg.To == "" {
		return fmt.Errorf("message destination cannot be empty")
	}

	r.mu.RLock()
	agent, ok := r.agents[msg.To]
	r.mu.RUnlock()

	if !ok {
		return fmt.Errorf("%w: %s", ErrAgentNotFound, msg.To)
	}

	// Deliver message via agent's update callback
	agent.SendUpdate(&acp.Update{
		SessionUpdate: string(msg.Type),
		AgentID:       msg.From,
	})

	return nil
}

// Broadcast sends a message to all agents in a session
func (r *Router) Broadcast(ctx context.Context, msg *RoutedMessage) error {
	if msg == nil {
		return nil
	}
	r.mu.RLock()
	agentIDs := r.sessions[msg.SessionID]
	agents := make([]*Agent, 0, len(agentIDs))
	for _, id := range agentIDs {
		if agent, ok := r.agents[id]; ok {
			agents = append(agents, agent)
		}
	}
	r.mu.RUnlock()

	for _, agent := range agents {
		if agent.ID != msg.From { // Don't send to sender
			agent.SendUpdate(&acp.Update{
				SessionUpdate: string(MessageTypeBroadcast),
				AgentID:       msg.From,
			})
		}
	}

	return nil
}

// BroadcastToAll sends a message to all registered agents
func (r *Router) BroadcastToAll(ctx context.Context, msg *RoutedMessage) error {
	if msg == nil {
		return nil
	}
	r.mu.RLock()
	agents := make([]*Agent, 0, len(r.agents))
	for _, agent := range r.agents {
		agents = append(agents, agent)
	}
	r.mu.RUnlock()

	for _, agent := range agents {
		if agent.ID != msg.From {
			agent.SendUpdate(&acp.Update{
				SessionUpdate: string(MessageTypeBroadcast),
				AgentID:       msg.From,
			})
		}
	}

	return nil
}

// RegisterHandler registers a handler for a message type
func (r *Router) RegisterHandler(msgType MessageType, handler MessageHandler) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.handlers[string(msgType)] = handler
}

// Handle processes incoming messages
func (r *Router) Handle(ctx context.Context, msg *RoutedMessage) error {
	if msg == nil {
		return nil
	}

	r.mu.RLock()
	handler, ok := r.handlers[string(msg.Type)]
	r.mu.RUnlock()

	if !ok {
		return nil // No handler registered
	}

	return handler(ctx, msg)
}

// FanOut sends a message to multiple agents and collects responses
func (r *Router) FanOut(ctx context.Context, to []acp.AgentID, msg *RoutedMessage) (<-chan *RoutedMessage, error) {
	if len(to) == 0 || msg == nil {
		results := make(chan *RoutedMessage)
		close(results)
		return results, nil
	}
	results := make(chan *RoutedMessage, len(to))

	go func() {
		defer close(results)
		var wg sync.WaitGroup

		for _, agentID := range to {
			wg.Add(1)
			go func(id acp.AgentID) {
				defer wg.Done()

				r.mu.RLock()
				ag, ok := r.agents[id]
				r.mu.RUnlock()

				if ok && ag != nil {
					// Simulate response
					results <- &RoutedMessage{
						From:    id,
						To:      msg.From,
						Type:    MessageTypeResponse,
						Payload: json.RawMessage(`{"status":"received"}`),
					}
				}
			}(agentID)
		}

		wg.Wait()
	}()

	return results, nil
}

// RoundRobin selects agents in round-robin fashion
type RoundRobin struct {
	mu     sync.Mutex
	agents []*Agent
	index  int
}

// NewRoundRobin creates a round-robin selector
func NewRoundRobin(agents []*Agent) *RoundRobin {
	return &RoundRobin{
		agents: agents,
	}
}

// Next returns the next agent in rotation
func (rr *RoundRobin) Next() *Agent {
	rr.mu.Lock()
	defer rr.mu.Unlock()

	if len(rr.agents) == 0 {
		return nil
	}

	agent := rr.agents[rr.index]
	rr.index = (rr.index + 1) % len(rr.agents)
	return agent
}

// LeastLoaded selects the agent with least current load
type LeastLoaded struct {
	mu     sync.RWMutex
	agents []*Agent
}

// NewLeastLoaded creates a least-loaded selector
func NewLeastLoaded(agents []*Agent) *LeastLoaded {
	return &LeastLoaded{agents: agents}
}

// Select returns the agent with least load (fewest tool executions)
func (ll *LeastLoaded) Select() *Agent {
	ll.mu.RLock()
	defer ll.mu.RUnlock()

	if len(ll.agents) == 0 {
		return nil
	}

	var selected *Agent
	minLoad := int(^uint(0) >> 1) // Max int

	for _, agent := range ll.agents {
		load := len(agent.GetToolHistory())
		if load < minLoad {
			minLoad = load
			selected = agent
		}
	}

	return selected
}
