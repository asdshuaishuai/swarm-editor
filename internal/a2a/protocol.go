// Package a2a implements Agent-to-Agent communication protocol
// A2A enables direct peer-to-peer communication between agents
package a2a

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"sync"
	"time"
)

// MessageType defines the type of A2A message
type MessageType string

const (
	// Task-related messages
	MessageTypeTaskRequest  MessageType = "task_request"  // Request task assignment
	MessageTypeTaskAccept   MessageType = "task_accept"   // Accept task
	MessageTypeTaskReject   MessageType = "task_reject"   // Reject task
	MessageTypeTaskComplete MessageType = "task_complete" // Task completed
	MessageTypeTaskFailed   MessageType = "task_failed"   // Task failed
	MessageTypeTaskProgress MessageType = "task_progress" // Progress update

	// Coordination messages
	MessageTypeSync      MessageType = "sync"      // Sync state
	MessageTypeSyncAck   MessageType = "sync_ack"  // Sync acknowledgment
	MessageTypeBroadcast MessageType = "broadcast" // Broadcast to all
	MessageTypeMulticast MessageType = "multicast" // Multicast to group

	// Collaboration messages
	MessageTypeHelpRequest    MessageType = "help_request"    // Request assistance
	MessageTypeHelpOffer      MessageType = "help_offer"      // Offer assistance
	MessageTypeKnowledgeShare MessageType = "knowledge_share" // Share knowledge
	MessageTypeQuery          MessageType = "query"           // Query peer
	MessageTypeResponse       MessageType = "response"        // Response to query

	// Negotiation messages
	MessageTypeProposal     MessageType = "proposal"     // Propose action
	MessageTypeCounter      MessageType = "counter"      // Counter proposal
	MessageTypeAgreement    MessageType = "agreement"    // Accept proposal
	MessageTypeDisagreement MessageType = "disagreement" // Reject proposal

	// Consensus messages
	MessageTypeVoteRequest MessageType = "vote_request" // Request votes
	MessageTypeVote        MessageType = "vote"         // Cast vote
	MessageTypeVoteResult  MessageType = "vote_result"  // Vote result

	// Emergence messages (for swarm intelligence)
	MessageTypeSignal    MessageType = "signal"    // Emergent signal
	MessageTypePheromone MessageType = "pheromone" // Digital pheromone trail
	MessageTypeSwarmCmd  MessageType = "swarm_cmd" // Swarm command
)

// Priority defines message priority levels
type Priority int

const (
	PriorityLow      Priority = 0
	PriorityNormal   Priority = 1
	PriorityHigh     Priority = 2
	PriorityCritical Priority = 3
)

// Message represents an A2A message
type Message struct {
	// Identification
	ID        string      `json:"id"`
	Type      MessageType `json:"type"`
	Timestamp time.Time   `json:"timestamp"`

	// Routing
	From  string   `json:"from"`            // Sender agent ID
	To    string   `json:"to"`              // Recipient agent ID (or "broadcast")
	Group string   `json:"group,omitempty"` // Group ID for multicast
	Cc    []string `json:"cc,omitempty"`    // Carbon copy recipients

	// Content
	Subject string          `json:"subject,omitempty"`
	Payload json.RawMessage `json:"payload,omitempty"`

	// Metadata
	Priority    Priority          `json:"priority"`
	TTL         time.Duration     `json:"ttl,omitempty"`         // Time to live
	Correlation string            `json:"correlation,omitempty"` // Correlation ID for request-response
	Headers     map[string]string `json:"headers,omitempty"`

	// Routing info
	HopCount int      `json:"hopCount,omitempty"` // Number of hops (for debugging)
	Path     []string `json:"path,omitempty"`     // Message path
}

// NewMessage creates a new A2A message
func NewMessage(msgType MessageType, from, to string) *Message {
	return &Message{
		ID:        generateMessageID(),
		Type:      msgType,
		Timestamp: time.Now(),
		From:      from,
		To:        to,
		Priority:  PriorityNormal,
		Headers:   make(map[string]string),
	}
}

// WithPayload sets the message payload
func (m *Message) WithPayload(payload interface{}) *Message {
	data, err := json.Marshal(payload)
	if err != nil {
		// Log the error but don't fail - store error info for debugging
		m.Payload = json.RawMessage(fmt.Sprintf(`{"error": "failed to marshal payload: %s"}`, err.Error()))
		return m
	}
	m.Payload = data
	return m
}

// WithPriority sets the message priority
func (m *Message) WithPriority(p Priority) *Message {
	m.Priority = p
	return m
}

// WithCorrelation sets the correlation ID
func (m *Message) WithCorrelation(id string) *Message {
	m.Correlation = id
	return m
}

// WithTTL sets the time to live
func (m *Message) WithTTL(ttl time.Duration) *Message {
	m.TTL = ttl
	return m
}

// WithHeader adds a header
func (m *Message) WithHeader(key, value string) *Message {
	if m.Headers == nil {
		m.Headers = make(map[string]string)
	}
	m.Headers[key] = value
	return m
}

// ParsePayload parses the payload into the target
func (m *Message) ParsePayload(target interface{}) error {
	return json.Unmarshal(m.Payload, target)
}

// IsExpired checks if the message has expired
func (m *Message) IsExpired() bool {
	if m.TTL == 0 {
		return false
	}
	return time.Since(m.Timestamp) > m.TTL
}

// IsBroadcast checks if the message is a broadcast
func (m *Message) IsBroadcast() bool {
	return m.To == "broadcast" || m.To == "*"
}

// ============================================================================
// Task Payload Types
// ============================================================================

// TaskRequestPayload represents a task request
type TaskRequestPayload struct {
	TaskID       string                 `json:"taskId"`
	Title        string                 `json:"title"`
	Description  string                 `json:"description"`
	Priority     int                    `json:"priority"`
	RequiredRole string                 `json:"requiredRole,omitempty"`
	Deadline     *time.Time             `json:"deadline,omitempty"`
	Dependencies []string               `json:"dependencies,omitempty"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
}

// TaskAcceptPayload represents task acceptance
type TaskAcceptPayload struct {
	TaskID    string    `json:"taskId"`
	AgentID   string    `json:"agentId"`
	Estimate  int       `json:"estimate"` // Estimated duration in seconds
	StartTime time.Time `json:"startTime"`
}

// TaskProgressPayload represents task progress
type TaskProgressPayload struct {
	TaskID      string  `json:"taskId"`
	Progress    float64 `json:"progress"`    // 0.0 - 1.0
	Status      string  `json:"status"`      // Current status message
	CurrentStep string  `json:"currentStep"` // Current step description
}

// TaskCompletePayload represents task completion
type TaskCompletePayload struct {
	TaskID       string          `json:"taskId"`
	Result       json.RawMessage `json:"result"`
	FilesChanged []string        `json:"filesChanged,omitempty"`
	Duration     time.Duration   `json:"duration"`
}

// TaskFailedPayload represents task failure
type TaskFailedPayload struct {
	TaskID    string `json:"taskId"`
	Error     string `json:"error"`
	Retryable bool   `json:"retryable"`
}

// TaskResult represents the result of a task execution
type TaskResult struct {
	TaskID       string        `json:"taskId"`
	AgentID      string        `json:"agentId,omitempty"`
	Content      string        `json:"content,omitempty"`
	Output       string        `json:"output,omitempty"`
	FilesChanged []string      `json:"filesChanged,omitempty"`
	Artifacts    []Artifact    `json:"artifacts,omitempty"`
	Error        string        `json:"error,omitempty"`
	StartedAt    time.Time     `json:"startedAt"`
	CompletedAt  time.Time     `json:"completedAt"`
	Duration     time.Duration `json:"duration"`
}

// Artifact represents a task artifact
type Artifact struct {
	Type        string `json:"type"` // "file", "code", "documentation", "test"
	Name        string `json:"name"`
	Path        string `json:"path,omitempty"`
	Content     string `json:"content,omitempty"`
	Description string `json:"description,omitempty"`
}

// ============================================================================
// Coordination Payload Types
// ============================================================================

// SyncPayload represents a sync request
type SyncPayload struct {
	StateType string          `json:"stateType"` // "task", "agent", "swarm"
	State     json.RawMessage `json:"state"`
	Version   int64           `json:"version"`
}

// HelpRequestPayload represents a help request
type HelpRequestPayload struct {
	TaskID  string        `json:"taskId,omitempty"`
	Reason  string        `json:"reason"`
	Skills  []string      `json:"skills,omitempty"` // Required skills
	Urgency int           `json:"urgency"`          // 1-5
	Timeout time.Duration `json:"timeout,omitempty"`
}

// HelpOfferPayload represents a help offer
type HelpOfferPayload struct {
	RequestID string   `json:"requestId"`
	AgentID   string   `json:"agentId"`
	Skills    []string `json:"skills"`
	Available bool     `json:"available"`
}

// KnowledgeSharePayload represents knowledge sharing
type KnowledgeSharePayload struct {
	Type      string          `json:"type"` // "pattern", "solution", "warning", "resource"
	Title     string          `json:"title"`
	Content   json.RawMessage `json:"content"`
	Relevance []string        `json:"relevance,omitempty"` // Relevant task/agent IDs
	Expiry    *time.Time      `json:"expiry,omitempty"`
}

// QueryPayload represents a query
type QueryPayload struct {
	QueryID   string          `json:"queryId"`
	QueryType string          `json:"queryType"` // "state", "capability", "knowledge", "resource"
	Query     json.RawMessage `json:"query"`
	Timeout   time.Duration   `json:"timeout,omitempty"`
}

// ResponsePayload represents a response
type ResponsePayload struct {
	QueryID string          `json:"queryId"`
	Success bool            `json:"success"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   string          `json:"error,omitempty"`
}

// ============================================================================
// Negotiation Payload Types
// ============================================================================

// ProposalPayload represents a proposal
type ProposalPayload struct {
	ProposalID   string          `json:"proposalId"`
	Type         string          `json:"type"` // "task_split", "resource_alloc", "sequence"
	Proposer     string          `json:"proposer"`
	Content      json.RawMessage `json:"content"`
	ValidUntil   time.Time       `json:"validUntil"`
	RequiresVote bool            `json:"requiresVote"`
}

// CounterProposalPayload represents a counter proposal
type CounterProposalPayload struct {
	OriginalID string          `json:"originalId"`
	CounterID  string          `json:"counterId"`
	Changes    json.RawMessage `json:"changes"`
	Reason     string          `json:"reason,omitempty"`
}

// AgreementPayload represents agreement
type AgreementPayload struct {
	ProposalID string `json:"proposalId"`
	AgentID    string `json:"agentId"`
	Terms      string `json:"terms,omitempty"`
}

// ============================================================================
// Consensus Payload Types
// ============================================================================

// VoteRequestPayload represents a vote request
type VoteRequestPayload struct {
	VoteID      string          `json:"voteId"`
	Subject     string          `json:"subject"`
	Description string          `json:"description"`
	Options     []string        `json:"options"`
	Algorithm   string          `json:"algorithm"` // "majority", "supermajority", "unanimous"
	Deadline    time.Time       `json:"deadline"`
	Context     json.RawMessage `json:"context,omitempty"`
}

// VotePayload represents a vote
type VotePayload struct {
	VoteID  string  `json:"voteId"`
	AgentID string  `json:"agentId"`
	Choice  string  `json:"choice"`
	Weight  float64 `json:"weight,omitempty"`
	Reason  string  `json:"reason,omitempty"`
}

// VoteResultPayload represents vote results
type VoteResultPayload struct {
	VoteID    string         `json:"voteId"`
	Winner    string         `json:"winner"`
	Results   map[string]int `json:"results"` // choice -> count
	Tallied   time.Time      `json:"tallied"`
	Consensus bool           `json:"consensus"`
}

// ============================================================================
// Emergence Payload Types (Swarm Intelligence)
// ============================================================================

// SignalPayload represents an emergent signal
type SignalPayload struct {
	SignalType string          `json:"signalType"`         // "attention", "alert", "resource", "danger"
	Strength   float64         `json:"strength"`           // 0.0 - 1.0
	Location   string          `json:"location,omitempty"` // Target location/area
	Data       json.RawMessage `json:"data,omitempty"`
}

// PheromonePayload represents a digital pheromone
type PheromonePayload struct {
	PheromoneType string    `json:"pheromoneType"` // "task", "path", "danger", "resource"
	Strength      float64   `json:"strength"`
	Location      string    `json:"location"`
	CreatedAt     time.Time `json:"createdAt"`
	Decay         float64   `json:"decay"` // Decay rate per second
}

// SwarmCommandPayload represents a swarm command
type SwarmCommandPayload struct {
	Command  string          `json:"command"` // "converge", "disperse", "follow", "search"
	Target   string          `json:"target,omitempty"`
	Params   json.RawMessage `json:"params,omitempty"`
	Priority int             `json:"priority"`
}

// ============================================================================
// Helper Functions
// ============================================================================

func generateMessageID() string {
	// Add random suffix to avoid collisions in high-concurrency scenarios
	return fmt.Sprintf("msg_%d_%08x", time.Now().UnixNano(), rand.Int63())
}

// ============================================================================
// Message Router
// ============================================================================

// Router handles message routing between agents
type Router struct {
	mu sync.RWMutex

	// Agent connections
	agents map[string]*AgentEndpoint

	// Group memberships
	groups map[string][]string // group ID -> agent IDs

	// Message handlers
	handlers map[MessageType][]MessageHandler

	// Message queue for async processing
	queue chan *Message

	// Configuration
	config RouterConfig

	// Lifecycle
	running bool
	ctx     context.Context
	cancel  context.CancelFunc
	wg      sync.WaitGroup
}

// AgentEndpoint represents an agent's communication endpoint
type AgentEndpoint struct {
	ID           string
	Capabilities []string
	Status       string // "online", "busy", "offline"
	SendFunc     func(*Message) error
	LastSeen     time.Time
}

// MessageHandler handles incoming messages
type MessageHandler func(*Message) error

// RouterConfig configures the router
type RouterConfig struct {
	QueueSize   int           `json:"queueSize"`
	SendTimeout time.Duration `json:"sendTimeout"`
	RetryCount  int           `json:"retryCount"`
	RetryDelay  time.Duration `json:"retryDelay"`
}

// NewRouter creates a new A2A router
func NewRouter(config RouterConfig) *Router {
	if config.QueueSize <= 0 {
		config.QueueSize = 1000
	}
	if config.SendTimeout <= 0 {
		config.SendTimeout = 5 * time.Second
	}
	if config.RetryCount <= 0 {
		config.RetryCount = 3
	}
	if config.RetryDelay <= 0 {
		config.RetryDelay = 100 * time.Millisecond
	}

	return &Router{
		agents:   make(map[string]*AgentEndpoint),
		groups:   make(map[string][]string),
		handlers: make(map[MessageType][]MessageHandler),
		queue:    make(chan *Message, config.QueueSize),
		config:   config,
	}
}

// RegisterAgent registers an agent with the router
func (r *Router) RegisterAgent(id string, sendFunc func(*Message) error, capabilities []string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.agents[id] = &AgentEndpoint{
		ID:           id,
		Capabilities: capabilities,
		Status:       "online",
		SendFunc:     sendFunc,
		LastSeen:     time.Now(),
	}
}

// UnregisterAgent unregisters an agent
func (r *Router) UnregisterAgent(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	delete(r.agents, id)

	// Remove from all groups
	for group, members := range r.groups {
		for i, member := range members {
			if member == id {
				r.groups[group] = append(members[:i], members[i+1:]...)
				break
			}
		}
	}
}

// JoinGroup adds an agent to a group
func (r *Router) JoinGroup(agentID, groupID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.groups[groupID] = append(r.groups[groupID], agentID)
}

// LeaveGroup removes an agent from a group
func (r *Router) LeaveGroup(agentID, groupID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	members := r.groups[groupID]
	for i, member := range members {
		if member == agentID {
			r.groups[groupID] = append(members[:i], members[i+1:]...)
			break
		}
	}
}

// RegisterHandler registers a message handler for a message type
func (r *Router) RegisterHandler(msgType MessageType, handler MessageHandler) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.handlers[msgType] = append(r.handlers[msgType], handler)
}

// Start starts the router
func (r *Router) Start(ctx context.Context) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.running {
		return fmt.Errorf("router already running")
	}

	r.ctx, r.cancel = context.WithCancel(ctx)
	r.running = true

	r.wg.Add(1)
	go r.processQueue()

	return nil
}

// Stop stops the router
func (r *Router) Stop() {
	r.mu.Lock()
	if !r.running {
		r.mu.Unlock()
		return
	}
	r.running = false
	if r.cancel != nil {
		r.cancel()
	}
	r.mu.Unlock()

	r.wg.Wait()
}

// Send sends a message to a specific agent
func (r *Router) Send(msg *Message) error {
	r.mu.RLock()
	defer r.mu.RUnlock()

	// Check if expired
	if msg.IsExpired() {
		return fmt.Errorf("message expired")
	}

	// Check if broadcast
	if msg.IsBroadcast() {
		return r.broadcast(msg)
	}

	// Check if multicast
	if msg.Group != "" {
		return r.multicast(msg)
	}

	// Direct message
	agent, ok := r.agents[msg.To]
	if !ok {
		return fmt.Errorf("agent not found: %s", msg.To)
	}

	return r.sendWithRetry(agent, msg)
}

// sendWithRetry sends a message with retry logic
func (r *Router) sendWithRetry(agent *AgentEndpoint, msg *Message) error {
	var lastErr error

	for i := 0; i < r.config.RetryCount; i++ {
		err := agent.SendFunc(msg)
		if err == nil {
			return nil
		}
		lastErr = err
		time.Sleep(r.config.RetryDelay)
	}

	return fmt.Errorf("failed after %d retries: %w", r.config.RetryCount, lastErr)
}

// broadcast sends a message to all agents
func (r *Router) broadcast(msg *Message) error {
	var errors []error

	for _, agent := range r.agents {
		if agent.ID == msg.From {
			continue // Don't send to self
		}

		if err := r.sendWithRetry(agent, msg); err != nil {
			errors = append(errors, err)
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("%d send failures", len(errors))
	}
	return nil
}

// multicast sends a message to a group
func (r *Router) multicast(msg *Message) error {
	members, ok := r.groups[msg.Group]
	if !ok {
		return fmt.Errorf("group not found: %s", msg.Group)
	}

	var errors []error
	for _, memberID := range members {
		agent, ok := r.agents[memberID]
		if !ok {
			continue
		}

		if err := r.sendWithRetry(agent, msg); err != nil {
			errors = append(errors, err)
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("%d send failures", len(errors))
	}
	return nil
}

// Enqueue adds a message to the processing queue
func (r *Router) Enqueue(msg *Message) error {
	select {
	case r.queue <- msg:
		return nil
	default:
		return fmt.Errorf("message queue full")
	}
}

// processQueue processes messages from the queue
func (r *Router) processQueue() {
	defer r.wg.Done()

	for {
		select {
		case <-r.ctx.Done():
			return
		case msg := <-r.queue:
			r.processMessage(msg)
		}
	}
}

// processMessage processes a single message
func (r *Router) processMessage(msg *Message) {
	r.mu.RLock()
	handlers := r.handlers[msg.Type]
	r.mu.RUnlock()

	for _, handler := range handlers {
		if err := handler(msg); err != nil {
			// Log error but continue processing
		}
	}
}

// GetAgentStatus returns the status of an agent
func (r *Router) GetAgentStatus(id string) (string, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	agent, ok := r.agents[id]
	if !ok {
		return "", false
	}
	return agent.Status, true
}

// GetOnlineAgents returns all online agents
func (r *Router) GetOnlineAgents() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var online []string
	for id, agent := range r.agents {
		if agent.Status == "online" {
			online = append(online, id)
		}
	}
	return online
}

// GetAgentsByCapability returns agents with a specific capability
func (r *Router) GetAgentsByCapability(capability string) []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var matches []string
	for id, agent := range r.agents {
		for _, cap := range agent.Capabilities {
			if cap == capability {
				matches = append(matches, id)
				break
			}
		}
	}
	return matches
}
