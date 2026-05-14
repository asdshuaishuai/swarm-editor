package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/log"
)

var routerLog = log.With("component", "Router")

// Error definitions for router
var (
	ErrAgentNotFound     = errors.New("agent not found")
	ErrSessionNotFound   = errors.New("session not found")
	ErrNoAgentsInSession = errors.New("no agents in session")
)

// Router handles message routing between agents
type Router struct {
	mu         sync.RWMutex
	agents     map[acp.AgentID]*Agent
	sessions   map[acp.SessionID][]acp.AgentID
	handlers   map[string]MessageHandler
	middleware []Middleware // Ordered list of middleware (AutoGen reply chain pattern)
}

// MessageHandler handles routed messages
type MessageHandler func(ctx context.Context, msg *RoutedMessage) error

// Middleware wraps a handler to add pre/post processing (chain of responsibility pattern)
// Inspired by AutoGen's register_reply function chain
type Middleware func(next MessageHandler) MessageHandler

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

// UnbindSession removes a session binding
func (r *Router) UnbindSession(sessionID acp.SessionID) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.sessions, sessionID)
}

// GetSessionAgents returns a copy of agents bound to a session
func (r *Router) GetSessionAgents(sessionID acp.SessionID) []acp.AgentID {
	r.mu.RLock()
	defer r.mu.RUnlock()
	agents := r.sessions[sessionID]
	if agents == nil {
		return nil
	}
	result := make([]acp.AgentID, len(agents))
	copy(result, agents)
	return result
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

// Use adds middleware to the router's processing chain
// Middleware is applied in LIFO order (last registered runs first)
// This follows the AutoGen reply function chain pattern
func (r *Router) Use(mw Middleware) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.middleware = append(r.middleware, mw)
}

// Handle processes incoming messages through the middleware chain
func (r *Router) Handle(ctx context.Context, msg *RoutedMessage) error {
	if msg == nil {
		return nil
	}

	r.mu.RLock()
	handler, ok := r.handlers[string(msg.Type)]
	middleware := make([]Middleware, len(r.middleware))
	copy(middleware, r.middleware)
	r.mu.RUnlock()

	if !ok {
		return nil // No handler registered
	}

	// Apply middleware in reverse order (LIFO) to form chain of responsibility
	// e.g., Use(A) then Use(B) results in B(A(handler))
	for i := len(middleware) - 1; i >= 0; i-- {
		handler = middleware[i](handler)
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
		defer func() {
			if r := recover(); r != nil {
				routerLog.Error("FanOut outer goroutine panic", "panic", r)
			}
			close(results)
		}()
		var wg sync.WaitGroup

		for _, agentID := range to {
			wg.Add(1)
			go func(id acp.AgentID) {
				defer func() {
					if r := recover(); r != nil {
						routerLog.Error("FanOut agent panic", "agent_id", id, "panic", r)
					}
					wg.Done()
				}()

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
