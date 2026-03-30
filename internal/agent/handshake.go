// Package agent provides agent discovery and auto-registration capabilities
package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"slices"
	"strconv"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
)

// HandshakeManager handles ACP protocol handshakes with discovered agents
type HandshakeManager struct {
	mu          sync.RWMutex
	timeout     time.Duration
	connections map[string]*HandshakeConnection
}

// HandshakeConnection represents an established ACP connection
type HandshakeConnection struct {
	AgentID      string            `json:"agentId"`
	Name         string            `json:"name"`
	Version      string            `json:"version"`
	Protocol     string            `json:"protocol"`
	Capabilities AgentCapabilities `json:"capabilities"`
	Connected    time.Time         `json:"connected"`
	LastSeen     time.Time         `json:"lastSeen"`
	Endpoint     string            `json:"endpoint"`
}

// AgentCapabilities represents negotiated capabilities
type AgentCapabilities struct {
	// Supported ACP methods
	SupportedMethods []string `json:"supportedMethods"`

	// Content types
	SupportedContentTypes []string `json:"supportedContentTypes"`

	// Features
	Features map[string]bool `json:"features"`

	// Limits
	MaxPromptSize    int `json:"maxPromptSize"`
	MaxContextSize   int `json:"maxContextSize"`
	MaxAttachments   int `json:"maxAttachments"`
	SessionRetention int `json:"sessionRetention"` // hours
}

// HandshakeResult represents the result of a handshake
type HandshakeResult struct {
	Success      bool                 `json:"success"`
	AgentInfo    *HandshakeConnection `json:"agentInfo,omitempty"`
	Error        string               `json:"error,omitempty"`
	Negotiated   map[string]string    `json:"negotiated,omitempty"`
	ResponseTime time.Duration        `json:"responseTime"`
}

// NewHandshakeManager creates a new handshake manager
func NewHandshakeManager(timeout time.Duration) *HandshakeManager {
	if timeout == 0 {
		timeout = 10 * time.Second
	}
	return &HandshakeManager{
		timeout:     timeout,
		connections: make(map[string]*HandshakeConnection),
	}
}

// PerformHandshake performs an ACP protocol handshake with an agent
func (h *HandshakeManager) PerformHandshake(ctx context.Context, agent *DiscoveredAgent, connManager *acp.ConnectionManager) *HandshakeResult {
	start := time.Now()
	result := &HandshakeResult{}

	// Create context with timeout
	ctx, cancel := context.WithTimeout(ctx, h.timeout)
	defer cancel()

	// Try to establish ACP connection
	conn, err := connManager.Connect(ctx, agent.Endpoint)
	if err != nil {
		result.Error = fmt.Sprintf("connection failed: %v", err)
		result.ResponseTime = time.Since(start)
		return result
	}

	// Parse agent info from connection
	agentConn := &HandshakeConnection{
		AgentID:   agent.ID,
		Name:      conn.Info.Name,
		Version:   conn.Info.Version,
		Protocol:  strconv.Itoa(acp.ProtocolVersion),
		Connected: time.Now(),
		LastSeen:  time.Now(),
		Endpoint:  agent.Endpoint,
	}

	// Negotiate capabilities
	agentConn.Capabilities = h.negotiateCapabilities(conn.Capabilities)

	// Store connection
	h.mu.Lock()
	h.connections[agentConn.AgentID] = agentConn
	h.mu.Unlock()

	result.Success = true
	result.AgentInfo = agentConn
	result.ResponseTime = time.Since(start)
	result.Negotiated = map[string]string{
		"protocol":   agentConn.Protocol,
		"agent_name": conn.Info.Name,
	}

	return result
}

// negotiateCapabilities negotiates capabilities between client and agent
func (h *HandshakeManager) negotiateCapabilities(agentCaps acp.AgentCapabilities) AgentCapabilities {
	caps := AgentCapabilities{
		SupportedMethods: []string{
			acp.MethodInitialize,
			acp.MethodSessionNew,
			acp.MethodSessionLoad,
			acp.MethodSessionPrompt,
			acp.MethodSessionCancel,
		},
		SupportedContentTypes: []string{"text", "image", "audio"},
		Features:              make(map[string]bool),
		MaxPromptSize:         100000,
		MaxContextSize:        1000000,
		MaxAttachments:        10,
		SessionRetention:      24,
	}

	// Merge agent capabilities
	if agentCaps.LoadSession {
		caps.Features["load_session"] = true
	}
	if agentCaps.PromptCapabilities.Image {
		caps.Features["image"] = true
	}
	if agentCaps.PromptCapabilities.Audio {
		caps.Features["audio"] = true
	}
	if agentCaps.PromptCapabilities.EmbeddedContext {
		caps.Features["embedded_context"] = true
	}
	if agentCaps.PairProgramming {
		caps.Features["pair_programming"] = true
	}

	return caps
}

// GetConnection returns a connection by agent ID
func (h *HandshakeManager) GetConnection(agentID string) *HandshakeConnection {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.connections[agentID]
}

// RemoveConnection removes a connection
func (h *HandshakeManager) RemoveConnection(agentID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.connections, agentID)
}

// GetAllConnections returns all active connections
func (h *HandshakeManager) GetAllConnections() []*HandshakeConnection {
	h.mu.RLock()
	defer h.mu.RUnlock()

	connections := make([]*HandshakeConnection, 0, len(h.connections))
	for _, conn := range h.connections {
		connections = append(connections, conn)
	}
	return connections
}

// HeartbeatChecker monitors agent health via heartbeats
type HeartbeatChecker struct {
	mu          sync.RWMutex
	interval    time.Duration
	timeout     time.Duration
	connections map[string]*HeartbeatStatus
	onUnhealthy func(agentID string, err error)
	running     bool
	stopChan    chan struct{}
}

// HeartbeatStatus represents the heartbeat status of an agent
type HeartbeatStatus struct {
	AgentID       string        `json:"agentId"`
	LastHeartbeat time.Time     `json:"lastHeartbeat"`
	LastLatency   time.Duration `json:"lastLatency"`
	Consecutive   int           `json:"consecutive"` // consecutive failures
	Healthy       bool          `json:"healthy"`
}

// NewHeartbeatChecker creates a new heartbeat checker
func NewHeartbeatChecker(interval, timeout time.Duration) *HeartbeatChecker {
	if interval == 0 {
		interval = 30 * time.Second
	}
	if timeout == 0 {
		timeout = 5 * time.Second
	}
	return &HeartbeatChecker{
		interval:    interval,
		timeout:     timeout,
		connections: make(map[string]*HeartbeatStatus),
		stopChan:    make(chan struct{}),
	}
}

// Start starts the heartbeat checker
func (hc *HeartbeatChecker) Start() {
	hc.mu.Lock()
	if hc.running {
		hc.mu.Unlock()
		return
	}
	// Recreate stopChan in case it was closed by a previous Stop()
	hc.stopChan = make(chan struct{})
	hc.running = true
	hc.mu.Unlock()

	go hc.checkLoop()
}

// Stop stops the heartbeat checker
func (hc *HeartbeatChecker) Stop() {
	hc.mu.Lock()
	defer hc.mu.Unlock()

	if !hc.running {
		return
	}

	close(hc.stopChan)
	hc.running = false
}

// checkLoop runs the periodic heartbeat check
func (hc *HeartbeatChecker) checkLoop() {
	ticker := time.NewTicker(hc.interval)
	defer ticker.Stop()

	for {
		select {
		case <-hc.stopChan:
			return
		case <-ticker.C:
			hc.checkAll()
		}
	}
}

// checkAll sends heartbeats to all registered agents
func (hc *HeartbeatChecker) checkAll() {
	hc.mu.RLock()
	agentIDs := make([]string, 0, len(hc.connections))
	for id := range hc.connections {
		agentIDs = append(agentIDs, id)
	}
	hc.mu.RUnlock()

	for _, agentID := range agentIDs {
		// Note: In real implementation, this would send actual heartbeat
		// For now, we just update the status
		hc.mu.Lock()
		if status, ok := hc.connections[agentID]; ok {
			status.LastHeartbeat = time.Now()
			status.Healthy = true
			status.Consecutive = 0
		}
		hc.mu.Unlock()
	}
}

// RegisterAgent registers an agent for heartbeat monitoring
func (hc *HeartbeatChecker) RegisterAgent(agentID string) {
	hc.mu.Lock()
	defer hc.mu.Unlock()

	hc.connections[agentID] = &HeartbeatStatus{
		AgentID:       agentID,
		LastHeartbeat: time.Now(),
		Healthy:       true,
	}
}

// UnregisterAgent removes an agent from heartbeat monitoring
func (hc *HeartbeatChecker) UnregisterAgent(agentID string) {
	hc.mu.Lock()
	defer hc.mu.Unlock()

	delete(hc.connections, agentID)
}

// CheckHeartbeat performs an immediate heartbeat check
func (hc *HeartbeatChecker) CheckHeartbeat(ctx context.Context, agentID string, connManager *acp.ConnectionManager) *HeartbeatStatus {
	hc.mu.RLock()
	_, ok := hc.connections[agentID]
	hc.mu.RUnlock()

	if !ok {
		return nil
	}

	start := time.Now()

	// Create context with timeout
	ctx, cancel := context.WithTimeout(ctx, hc.timeout)
	defer cancel()

	// Get connection
	conn, exists := connManager.GetConnection(agentID)
	if !exists {
		hc.recordFailure(agentID, fmt.Errorf("connection not found"))
		return hc.GetStatus(agentID)
	}

	// Check if connection is in connected state
	if conn.GetState() != acp.StateConnected {
		hc.recordFailure(agentID, fmt.Errorf("connection not in connected state"))
		return hc.GetStatus(agentID)
	}

	// Update status
	hc.mu.Lock()
	if status, ok := hc.connections[agentID]; ok {
		status.LastHeartbeat = time.Now()
		status.LastLatency = time.Since(start)
		status.Healthy = true
		status.Consecutive = 0
	}
	hc.mu.Unlock()

	_ = ctx // Context used for timeout
	return hc.GetStatus(agentID)
}

// recordFailure records a heartbeat failure
func (hc *HeartbeatChecker) recordFailure(agentID string, err error) {
	hc.mu.Lock()
	defer hc.mu.Unlock()

	if status, ok := hc.connections[agentID]; ok {
		status.Consecutive++
		status.Healthy = false

		// Notify callback after 3 consecutive failures
		if status.Consecutive >= 3 && hc.onUnhealthy != nil {
			go hc.onUnhealthy(agentID, err)
		}
	}
}

// GetStatus returns a copy of the heartbeat status for an agent
func (hc *HeartbeatChecker) GetStatus(agentID string) *HeartbeatStatus {
	hc.mu.RLock()
	defer hc.mu.RUnlock()

	if status, ok := hc.connections[agentID]; ok {
		cp := *status
		return &cp
	}
	return nil
}

// GetAllStatuses returns copies of all heartbeat statuses
func (hc *HeartbeatChecker) GetAllStatuses() map[string]*HeartbeatStatus {
	hc.mu.RLock()
	defer hc.mu.RUnlock()

	result := make(map[string]*HeartbeatStatus, len(hc.connections))
	for k, v := range hc.connections {
		cp := *v
		result[k] = &cp
	}
	return result
}

// OnUnhealthy registers a callback for unhealthy agent notifications
func (hc *HeartbeatChecker) OnUnhealthy(fn func(agentID string, err error)) {
	hc.mu.Lock()
	defer hc.mu.Unlock()
	hc.onUnhealthy = fn
}

// CapabilityNegotiator handles capability negotiation between agents
type CapabilityNegotiator struct {
	mu            sync.RWMutex
	localCaps     AgentCapabilities
	remoteCaps    map[string]AgentCapabilities
	negotiatedOps map[string][]string // agentID -> supported operations
}

// NewCapabilityNegotiator creates a new capability negotiator
func NewCapabilityNegotiator(localCaps AgentCapabilities) *CapabilityNegotiator {
	return &CapabilityNegotiator{
		localCaps:     localCaps,
		remoteCaps:    make(map[string]AgentCapabilities),
		negotiatedOps: make(map[string][]string),
	}
}

// Negotiate negotiates capabilities with a remote agent
func (n *CapabilityNegotiator) Negotiate(agentID string, remoteCaps AgentCapabilities) []string {
	n.mu.Lock()
	defer n.mu.Unlock()

	// Store remote capabilities
	n.remoteCaps[agentID] = remoteCaps

	// Find common operations
	supportedOps := []string{}

	// Check method support
	for _, method := range n.localCaps.SupportedMethods {
		for _, remoteMethod := range remoteCaps.SupportedMethods {
			if method == remoteMethod {
				supportedOps = append(supportedOps, method)
			}
		}
	}

	// Check feature support
	for feature, enabled := range n.localCaps.Features {
		if enabled && remoteCaps.Features[feature] {
			supportedOps = append(supportedOps, "feature:"+feature)
		}
	}

	n.negotiatedOps[agentID] = supportedOps

	log.Printf("[Negotiator] Negotiated %d operations with agent %s", len(supportedOps), agentID)

	return supportedOps
}

// GetNegotiatedOperations returns negotiated operations for an agent
func (n *CapabilityNegotiator) GetNegotiatedOperations(agentID string) []string {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return n.negotiatedOps[agentID]
}

// GetRemoteCapabilities returns remote agent capabilities
func (n *CapabilityNegotiator) GetRemoteCapabilities(agentID string) *AgentCapabilities {
	n.mu.RLock()
	defer n.mu.RUnlock()

	if caps, ok := n.remoteCaps[agentID]; ok {
		return &caps
	}
	return nil
}

// CanPerform checks if an operation can be performed with an agent
func (n *CapabilityNegotiator) CanPerform(agentID, operation string) bool {
	n.mu.RLock()
	defer n.mu.RUnlock()

	return slices.Contains(n.negotiatedOps[agentID], operation)
}

// ToJSON converts capabilities to JSON
func (c *AgentCapabilities) ToJSON() ([]byte, error) {
	return json.Marshal(c)
}

// FromJSON parses capabilities from JSON
func (c *AgentCapabilities) FromJSON(data []byte) error {
	return json.Unmarshal(data, c)
}
