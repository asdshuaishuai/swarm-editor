package agent

import (
	"context"
	"fmt"
	"slices"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/log"
)

var lifecycleLog = log.With("component", "Lifecycle")

// Registry manages all registered agents
type Registry struct {
	mu     sync.RWMutex
	agents map[acp.AgentID]*Agent
	byType map[AgentType][]*Agent
}

// NewRegistry creates a new agent registry
func NewRegistry() *Registry {
	return &Registry{
		agents: make(map[acp.AgentID]*Agent),
		byType: make(map[AgentType][]*Agent),
	}
}

// Register adds an agent to the registry
func (r *Registry) Register(agent *Agent) error {
	if agent == nil {
		return fmt.Errorf("agent cannot be nil")
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.agents[agent.ID]; exists {
		return fmt.Errorf("agent %s already registered", agent.ID)
	}

	r.agents[agent.ID] = agent
	r.byType[agent.Type] = append(r.byType[agent.Type], agent)
	return nil
}

// Unregister removes an agent from the registry
func (r *Registry) Unregister(id acp.AgentID) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	agent, exists := r.agents[id]
	if !exists {
		return fmt.Errorf("agent %s not found", id)
	}

	delete(r.agents, id)

	// Remove from type index using slices.Delete to avoid aliasing
	typeAgents := r.byType[agent.Type]
	for i, a := range typeAgents {
		if a.ID == id {
			r.byType[agent.Type] = slices.Delete(typeAgents, i, i+1)
			if len(r.byType[agent.Type]) == 0 {
				delete(r.byType, agent.Type)
			}
			break
		}
	}

	return nil
}

// Get retrieves an agent by ID
func (r *Registry) Get(id acp.AgentID) (*Agent, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	agent, ok := r.agents[id]
	return agent, ok
}

// copyAgent creates a shallow copy of an Agent for safe read-only access.
// Note: This intentionally creates a shallow copy (not deep) because:
// 1. Agent's mutable state is protected by its own mutex
// 2. Callers use the copy for read operations (GetState, GetToolHistory)
// 3. The connection and memory pointers are shared intentionally (active object pattern)
func copyAgent(a *Agent) *Agent {
	if a == nil {
		return nil
	}
	// Create new Agent to avoid copying mutex by value
	cp := &Agent{
		ID:           a.ID,
		Name:         a.Name,
		Type:         a.Type,
		State:        a.State,
		Capabilities: a.Capabilities,
		created:      a.created,
		lastActive:   a.lastActive,
		session:      a.session,
		context:      a.context,
		shortMemory:  a.shortMemory,
		longMemory:   a.longMemory,
		conn:         a.conn,
		onUpdate:     a.onUpdate,
		onToolCall:   a.onToolCall,
	}
	// Deep copy toolHistory slice
	if a.toolHistory != nil {
		cp.toolHistory = make([]ToolExecution, len(a.toolHistory))
		copy(cp.toolHistory, a.toolHistory)
	}
	return cp
}

// GetByType retrieves all agents of a given type (returns copies)
func (r *Registry) GetByType(agentType AgentType) []*Agent {
	r.mu.RLock()
	defer r.mu.RUnlock()
	agents := r.byType[agentType]
	result := make([]*Agent, len(agents))
	for i := range agents {
		result[i] = copyAgent(agents[i])
	}
	return result
}

// GetAll returns all registered agents (returns deep copies)
func (r *Registry) GetAll() []*Agent {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]*Agent, 0, len(r.agents))
	for _, agent := range r.agents {
		result = append(result, copyAgent(agent))
	}
	return result
}

// GetIdle returns all idle agents (returns copies)
func (r *Registry) GetIdle() []*Agent {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]*Agent, 0)
	for _, agent := range r.agents {
		if agent.GetState() == StateIdle {
			result = append(result, copyAgent(agent))
		}
	}
	return result
}

// Count returns the number of registered agents
func (r *Registry) Count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.agents)
}

// CountByType returns the count of agents by type
func (r *Registry) CountByType() map[AgentType]int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make(map[AgentType]int)
	for t, agents := range r.byType {
		result[t] = len(agents)
	}
	return result
}

// Lifecycle manages agent lifecycle events
type Lifecycle struct {
	registry *Registry

	mu            sync.RWMutex
	onSpawn       func(agent *Agent)
	onTerminate   func(agent *Agent)
	onStateChange func(agent *Agent, oldState, newState AgentState)
	stopped       bool

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup // WaitGroup for monitor goroutines
}

// NewLifecycle creates a new lifecycle manager
func NewLifecycle(registry *Registry) *Lifecycle {
	if registry == nil {
		return nil
	}
	ctx, cancel := context.WithCancel(context.Background())
	return &Lifecycle{
		registry: registry,
		ctx:      ctx,
		cancel:   cancel,
	}
}

// Spawn creates and registers a new agent
func (l *Lifecycle) Spawn(name string, agentType AgentType) *Agent {
	l.mu.Lock()
	if l.stopped {
		l.mu.Unlock()
		return nil
	}
	agent := NewAgent(name, agentType)

	// Register while holding lock to prevent race with Stop()
	if err := l.registry.Register(agent); err != nil {
		// Agent already registered, return the existing one
		if existing, ok := l.registry.Get(agent.ID); ok {
			l.mu.Unlock()
			return existing
		}
		l.mu.Unlock()
		return agent
	}
	// Track goroutine under lock before releasing to prevent race with Stop()
	// (Stop calls wg.Wait() after releasing mu, must see our wg.Add)
	l.wg.Add(1)
	l.mu.Unlock()

	go l.monitorAgent(agent)

	l.mu.RLock()
	fn := l.onSpawn
	l.mu.RUnlock()

	if fn != nil {
		fn(agent)
	}

	return agent
}

// Terminate gracefully terminates an agent
func (l *Lifecycle) Terminate(ctx context.Context, id acp.AgentID) error {
	agent, ok := l.registry.Get(id)
	if !ok {
		return fmt.Errorf("agent not found: %s", id)
	}

	// Wait for agent to finish current task or timeout
	agent.SetState(StateIdle)

	if err := l.registry.Unregister(id); err != nil {
		lifecycleLog.Warn("Failed to unregister agent", "agent_id", id, "error", err)
	}

	l.mu.RLock()
	fn := l.onTerminate
	l.mu.RUnlock()

	if fn != nil {
		fn(agent)
	}

	return nil
}

// OnSpawn registers a callback for agent spawn events
func (l *Lifecycle) OnSpawn(fn func(agent *Agent)) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.onSpawn = fn
}

// OnTerminate registers a callback for agent termination events
func (l *Lifecycle) OnTerminate(fn func(agent *Agent)) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.onTerminate = fn
}

// OnStateChange registers a callback for state change events
func (l *Lifecycle) OnStateChange(fn func(agent *Agent, oldState, newState AgentState)) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.onStateChange = fn
}

// Stop stops the lifecycle manager and all agent monitors
func (l *Lifecycle) Stop() {
	l.mu.Lock()
	l.stopped = true
	l.mu.Unlock()

	if l.cancel != nil {
		l.cancel()
	}
	// Wait for all monitor goroutines to complete
	l.wg.Wait()
}

func (l *Lifecycle) monitorAgent(agent *Agent) {
	defer l.wg.Done()
	defer func() {
		if r := recover(); r != nil {
			lifecycleLog.Error("monitorAgent panic", "agent_id", agent.ID, "panic", r)
		}
	}()
	lastState := agent.GetState()
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-l.ctx.Done():
			// Lifecycle is shutting down
			return
		case <-ticker.C:
			currentState := agent.GetState()
			if currentState != lastState {
				l.mu.RLock()
				fn := l.onStateChange
				l.mu.RUnlock()

				if fn != nil {
					fn(agent, lastState, currentState)
				}
				lastState = currentState
			}

			// Check if agent is still registered
			if _, ok := l.registry.Get(agent.ID); !ok {
				return
			}
		}
	}
}

// Pool manages a pool of agents for a specific purpose
type Pool struct {
	mu      sync.Mutex
	agents  []*Agent
	ready   chan *Agent
	maxSize int
}

// NewPool creates a new agent pool
func NewPool(maxSize int) *Pool {
	return &Pool{
		agents:  make([]*Agent, 0),
		ready:   make(chan *Agent, maxSize),
		maxSize: maxSize,
	}
}

// Add adds an agent to the pool
func (p *Pool) Add(agent *Agent) error {
	if agent == nil {
		return fmt.Errorf("agent cannot be nil")
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	if len(p.agents) >= p.maxSize {
		return fmt.Errorf("pool is full")
	}

	p.agents = append(p.agents, agent)
	p.ready <- agent
	return nil
}

// Acquire gets an available agent from the pool
func (p *Pool) Acquire(ctx context.Context) (*Agent, error) {
	select {
	case agent := <-p.ready:
		return agent, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// Release returns an agent to the pool
// Uses non-blocking send to prevent deadlock if pool is full
func (p *Pool) Release(agent *Agent) {
	agent.SetState(StateIdle)
	select {
	case p.ready <- agent:
		// Successfully returned to pool
	default:
		// Channel full (shouldn't happen in normal operation)
		// Agent is still in the pool's agents slice, just not in ready channel
	}
}

// Size returns the current pool size
func (p *Pool) Size() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.agents)
}

// SetBroadcaster sets the state change broadcaster on all agents in the registry.
func (r *Registry) SetBroadcaster(b StateBroadcaster) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, a := range r.agents {
		a.SetBroadcaster(b)
	}
}
