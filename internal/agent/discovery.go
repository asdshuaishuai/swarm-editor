// Package agent provides agent discovery and auto-registration capabilities
package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"golang.org/x/text/cases"
	"golang.org/x/text/language"
)

// DiscoveryConfig configures the agent discovery service
type DiscoveryConfig struct {
	// Scan settings
	AutoScan        bool          `json:"autoScan"`
	ScanInterval    time.Duration `json:"scanInterval"`
	ScanTimeout     time.Duration `json:"scanTimeout"`
	ConcurrentScans int           `json:"concurrentScans"`

	// Auto-connect settings
	AutoConnect    bool          `json:"autoConnect"`
	ConnectTimeout time.Duration `json:"connectTimeout"`
	MaxRetries     int           `json:"maxRetries"`
	RetryDelay     time.Duration `json:"retryDelay"`

	// Discovery paths
	ConfigPaths  []string `json:"configPaths"`
	ScanCommands []string `json:"scanCommands"`

	// Network discovery
	EnableNetwork bool  `json:"enableNetwork"`
	NetworkPorts  []int `json:"networkPorts"`
	BroadcastPort int   `json:"broadcastPort"`

	// Registration
	AllowSelfRegister bool `json:"allowSelfRegister"`
	RequireApproval   bool `json:"requireApproval"`
}

// DefaultDiscoveryConfig returns default discovery configuration
func DefaultDiscoveryConfig() DiscoveryConfig {
	return DiscoveryConfig{
		AutoScan:        true,
		ScanInterval:    30 * time.Second,
		ScanTimeout:     5 * time.Second,
		ConcurrentScans: 5,
		AutoConnect:     false,
		ConnectTimeout:  10 * time.Second,
		MaxRetries:      3,
		RetryDelay:      1 * time.Second,
		ConfigPaths: []string{
			"~/.swarm-editor/agents.json",
			"~/.config/swarm-editor/agents.d",
		},
		ScanCommands: []string{
			"claude",
			"copilot",
			"cursor",
			"aider",
			"continue",
		},
		EnableNetwork:     true,
		NetworkPorts:      []int{8080, 8765, 9000},
		BroadcastPort:     8765,
		AllowSelfRegister: true,
		RequireApproval:   false,
	}
}

// DiscoveredAgent represents an agent found during discovery
type DiscoveredAgent struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	Type         string            `json:"type"`
	Endpoint     string            `json:"endpoint"`
	Command      string            `json:"command"`
	Capabilities []string          `json:"capabilities"`
	Status       DiscoveryStatus   `json:"status"`
	LastSeen     time.Time         `json:"lastSeen"`
	Latency      time.Duration     `json:"latency"`
	Metadata     map[string]string `json:"metadata"`
}

// DiscoveryStatus represents the status of a discovered agent
type DiscoveryStatus string

const (
	DiscoveryStatusAvailable   DiscoveryStatus = "available"
	DiscoveryStatusUnreachable DiscoveryStatus = "unreachable"
	DiscoveryStatusBusy        DiscoveryStatus = "busy"
	DiscoveryStatusUnknown     DiscoveryStatus = "unknown"
)

// DiscoveryService handles agent discovery and registration
type DiscoveryService struct {
	mu sync.RWMutex

	config      DiscoveryConfig
	registry    *Registry
	lifecycle   *Lifecycle
	connManager *acp.ConnectionManager

	// Discovered agents
	discovered map[string]*DiscoveredAgent

	// Pending registrations
	pending map[string]*RegistrationRequest

	// Callbacks
	onDiscovered func(agent *DiscoveredAgent)
	onConnected  func(agent *DiscoveredAgent, acpAgent *Agent)
	onFailed     func(agent *DiscoveredAgent, err error)

	// Lifecycle
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// RegistrationRequest represents a pending registration request
type RegistrationRequest struct {
	AgentID    string    `json:"agentId"`
	Name       string    `json:"name"`
	Endpoint   string    `json:"endpoint"`
	Requested  time.Time `json:"requested"`
	Status     string    `json:"status"` // "pending", "approved", "rejected"
	ApprovedBy string    `json:"approvedBy,omitempty"`
}

// NewDiscoveryService creates a new discovery service
func NewDiscoveryService(
	config DiscoveryConfig,
	registry *Registry,
	lifecycle *Lifecycle,
	connManager *acp.ConnectionManager,
) *DiscoveryService {
	if registry == nil {
		registry = NewRegistry()
	}
	if connManager == nil {
		connManager = acp.NewConnectionManager(nil)
	}

	return &DiscoveryService{
		config:      config,
		registry:    registry,
		lifecycle:   lifecycle,
		connManager: connManager,
		discovered:  make(map[string]*DiscoveredAgent),
		pending:     make(map[string]*RegistrationRequest),
	}
}

// Start starts the discovery service
func (d *DiscoveryService) Start(ctx context.Context) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	if d.cancel != nil {
		return fmt.Errorf("discovery service already running")
	}

	d.ctx, d.cancel = context.WithCancel(ctx)

	// Start periodic scan
	if d.config.AutoScan {
		d.wg.Add(1)
		go d.scanLoop()
	}

	// Start network listener for self-registration
	if d.config.EnableNetwork && d.config.AllowSelfRegister {
		d.wg.Add(1)
		go d.networkListener()
	}

	log.Printf("[Discovery] Service started with autoScan=%v, enableNetwork=%v",
		d.config.AutoScan, d.config.EnableNetwork)

	return nil
}

// Stop stops the discovery service
func (d *DiscoveryService) Stop() {
	d.mu.Lock()
	if d.cancel != nil {
		d.cancel()
		d.cancel = nil
		d.ctx = nil
	}
	d.mu.Unlock()

	d.wg.Wait()
	log.Printf("[Discovery] Service stopped")
}

// scanLoop periodically scans for agents
func (d *DiscoveryService) scanLoop() {
	defer d.wg.Done()

	ticker := time.NewTicker(d.config.ScanInterval)
	defer ticker.Stop()

	// Initial scan
	d.Scan()

	for {
		d.mu.RLock()
		ctx := d.ctx
		d.mu.RUnlock()

		if ctx == nil {
			return
		}

		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			d.Scan()
		}
	}
}

// Scan performs a full discovery scan
func (d *DiscoveryService) Scan() []*DiscoveredAgent {
	log.Printf("[Discovery] Starting scan...")

	var discovered []*DiscoveredAgent
	var mu sync.Mutex
	var wg sync.WaitGroup

	// Scan command-line agents
	wg.Add(1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[Discovery] scanCommands panic: %v", r)
			}
			wg.Done()
		}()
		agents := d.scanCommands()
		mu.Lock()
		discovered = append(discovered, agents...)
		mu.Unlock()
	}()

	// Scan config files
	wg.Add(1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[Discovery] scanConfigFiles panic: %v", r)
			}
			wg.Done()
		}()
		agents := d.scanConfigFiles()
		mu.Lock()
		discovered = append(discovered, agents...)
		mu.Unlock()
	}()

	// Scan network
	if d.config.EnableNetwork {
		wg.Add(1)
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[Discovery] scanNetwork panic: %v", r)
				}
				wg.Done()
			}()
			agents := d.scanNetwork()
			mu.Lock()
			discovered = append(discovered, agents...)
			mu.Unlock()
		}()
	}

	wg.Wait()

	// Update discovered map
	d.mu.Lock()
	for _, agent := range discovered {
		agent.LastSeen = time.Now()
		d.discovered[agent.ID] = agent

		// Notify callback (tracked by d.wg to prevent leak on Stop)
		// Pass agent as parameter to avoid loop variable capture bug
		if d.onDiscovered != nil {
			d.wg.Add(1)
			go func(a *DiscoveredAgent) {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("[Discovery] onDiscovered callback panic: %v", r)
					}
					d.wg.Done()
				}()
				d.onDiscovered(a)
			}(agent)
		}

		// Auto-connect if enabled (tracked by d.wg to prevent leak on Stop)
		// Pass agent as parameter to avoid loop variable capture bug
		if d.config.AutoConnect && agent.Status == DiscoveryStatusAvailable {
			d.wg.Add(1)
			go func(a *DiscoveredAgent) {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("[Discovery] Auto-connect panic for %s: %v", a.ID, r)
					}
					d.wg.Done()
				}()
				if _, err := d.Connect(a); err != nil {
					log.Printf("[Discovery] Auto-connect failed for %s: %v", a.ID, err)
				}
			}(agent)
		}
	}
	d.mu.Unlock()

	log.Printf("[Discovery] Scan complete, found %d agents", len(discovered))
	return discovered
}

// scanCommands scans for command-line agent tools
func (d *DiscoveryService) scanCommands() []*DiscoveredAgent {
	var agents []*DiscoveredAgent

	d.mu.RLock()
	parentCtx := d.ctx
	d.mu.RUnlock()

	if parentCtx == nil {
		return agents
	}

	for _, cmd := range d.config.ScanCommands {
		// Check if command exists
		path, err := exec.LookPath(cmd)
		if err != nil {
			continue
		}

		ctx, cancel := context.WithTimeout(parentCtx, d.config.ScanTimeout)

		// Try to get version/capabilities
		execCmd := exec.CommandContext(ctx, cmd, "--version")
		output, err := execCmd.CombinedOutput()
		cancel() // Cancel immediately after use, not deferred in loop
		if err != nil {
			continue
		}

		agent := &DiscoveredAgent{
			ID:           fmt.Sprintf("cmd-%s", cmd),
			Name:         fmt.Sprintf("%s (CLI)", cases.Title(language.English).String(cmd)),
			Type:         "coder",
			Endpoint:     path,
			Command:      cmd,
			Capabilities: d.inferCapabilities(cmd),
			Status:       DiscoveryStatusAvailable,
			Latency:      0,
			Metadata: map[string]string{
				"version": strings.TrimSpace(string(output)),
				"path":    path,
			},
		}

		agents = append(agents, agent)
	}

	return agents
}

// scanConfigFiles scans configuration files for agent definitions
func (d *DiscoveryService) scanConfigFiles() []*DiscoveredAgent {
	var agents []*DiscoveredAgent

	for _, configPath := range d.config.ConfigPaths {
		// Expand home directory
		path := expandHome(configPath)

		// Check if it's a directory or file
		info, err := os.Stat(path)
		if err != nil {
			continue
		}

		if info.IsDir() {
			// Scan directory for config files
			files, err := os.ReadDir(path)
			if err != nil {
				continue
			}

			for _, file := range files {
				if strings.HasSuffix(file.Name(), ".json") {
					fileAgents := d.parseConfigFile(filepath.Join(path, file.Name()))
					agents = append(agents, fileAgents...)
				}
			}
		} else {
			// Parse single config file
			fileAgents := d.parseConfigFile(path)
			agents = append(agents, fileAgents...)
		}
	}

	return agents
}

// parseConfigFile parses a configuration file for agent definitions
func (d *DiscoveryService) parseConfigFile(path string) []*DiscoveredAgent {
	var agents []*DiscoveredAgent

	data, err := os.ReadFile(path)
	if err != nil {
		return agents
	}

	// Try to parse as array of agents
	var agentConfigs []struct {
		ID           string            `json:"id"`
		Name         string            `json:"name"`
		Type         string            `json:"type"`
		Command      string            `json:"command"`
		Capabilities []string          `json:"capabilities"`
		Endpoint     string            `json:"endpoint"`
		Metadata     map[string]string `json:"metadata"`
	}

	if err := json.Unmarshal(data, &agentConfigs); err != nil {
		// Try single agent config
		var singleConfig struct {
			ID           string            `json:"id"`
			Name         string            `json:"name"`
			Type         string            `json:"type"`
			Command      string            `json:"command"`
			Capabilities []string          `json:"capabilities"`
			Endpoint     string            `json:"endpoint"`
			Metadata     map[string]string `json:"metadata"`
		}

		if err := json.Unmarshal(data, &singleConfig); err != nil {
			return agents
		}

		agentConfigs = []struct {
			ID           string            `json:"id"`
			Name         string            `json:"name"`
			Type         string            `json:"type"`
			Command      string            `json:"command"`
			Capabilities []string          `json:"capabilities"`
			Endpoint     string            `json:"endpoint"`
			Metadata     map[string]string `json:"metadata"`
		}{singleConfig}
	}

	for _, cfg := range agentConfigs {
		agent := &DiscoveredAgent{
			ID:           cfg.ID,
			Name:         cfg.Name,
			Type:         cfg.Type,
			Endpoint:     cfg.Endpoint,
			Command:      cfg.Command,
			Capabilities: cfg.Capabilities,
			Status:       DiscoveryStatusUnknown,
			Metadata:     cfg.Metadata,
		}

		// Verify agent is reachable
		if d.verifyAgent(agent) {
			agent.Status = DiscoveryStatusAvailable
		} else {
			agent.Status = DiscoveryStatusUnreachable
		}

		agents = append(agents, agent)
	}

	return agents
}

// scanNetwork scans network ports for agents
func (d *DiscoveryService) scanNetwork() []*DiscoveredAgent {
	var agents []*DiscoveredAgent

	// Capture ctx under lock to avoid race with Stop()
	d.mu.RLock()
	ctx := d.ctx
	d.mu.RUnlock()
	if ctx == nil {
		ctx = context.Background()
	}

	for _, port := range d.config.NetworkPorts {
		select {
		case <-ctx.Done():
			return agents // Early return on context cancellation
		default:
		}

		// Check localhost first
		addr := fmt.Sprintf("127.0.0.1:%d", port)
		if agent := d.probeNetworkAgentWithContext(ctx, addr); agent != nil {
			agents = append(agents, agent)
		}
	}

	return agents
}

// probeNetworkAgent probes a network address for an agent
func (d *DiscoveryService) probeNetworkAgent(addr string) *DiscoveredAgent {
	// Capture ctx under lock to avoid race with Stop()
	d.mu.RLock()
	ctx := d.ctx
	d.mu.RUnlock()
	if ctx == nil {
		ctx = context.Background()
	}
	return d.probeNetworkAgentWithContext(ctx, addr)
}

// probeNetworkAgentWithContext probes a network address with context support
func (d *DiscoveryService) probeNetworkAgentWithContext(ctx context.Context, addr string) *DiscoveredAgent {
	start := time.Now()

	// Check context before dialing
	select {
	case <-ctx.Done():
		return nil
	default:
	}

	// Try to connect
	conn, err := net.DialTimeout("tcp", addr, d.config.ScanTimeout)
	if err != nil {
		return nil
	}
	conn.Close()

	latency := time.Since(start)

	// Query agent capabilities via ACP protocol if available
	// For non-ACP agents, we use a default "remote" capability
	capabilities := d.queryAgentCapabilities(addr, latency)
	if len(capabilities) == 0 {
		capabilities = []string{"remote"}
	}

	agent := &DiscoveredAgent{
		ID:           fmt.Sprintf("net-%s", strings.ReplaceAll(addr, ":", "-")),
		Name:         fmt.Sprintf("Agent at %s", addr),
		Type:         "remote",
		Endpoint:     addr,
		Command:      "",
		Capabilities: capabilities,
		Status:       DiscoveryStatusAvailable,
		Latency:      latency,
		Metadata: map[string]string{
			"address": addr,
		},
	}

	return agent
}

// queryAgentCapabilities attempts to query an agent's capabilities over TCP
// Returns empty slice if the agent doesn't support capability queries
func (d *DiscoveryService) queryAgentCapabilities(addr string, latency time.Duration) []string {
	// Capture ctx under lock to avoid race with Stop()
	d.mu.RLock()
	ctx := d.ctx
	d.mu.RUnlock()
	if ctx == nil {
		ctx = context.Background()
	}
	return d.queryAgentCapabilitiesWithContext(ctx, addr, latency)
}

// queryAgentCapabilitiesWithContext queries agent capabilities with context support
func (d *DiscoveryService) queryAgentCapabilitiesWithContext(ctx context.Context, addr string, latency time.Duration) []string {
	var capabilities []string

	// Fast response indicates the agent is responsive
	if latency < 100*time.Millisecond {
		capabilities = append(capabilities, "fast_response")
	}

	// Check context before dialing
	select {
	case <-ctx.Done():
		return capabilities
	default:
	}

	// Try to query actual capabilities via ACP over TCP
	queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	conn, err := net.DialTimeout("tcp", addr, 3*time.Second)
	if err != nil {
		// Agent doesn't support TCP connections, return inferred capabilities
		return capabilities
	}
	defer conn.Close()

	// Create ACP client over TCP transport
	transport := acp.NewTCPTransport(conn)
	if transport == nil {
		return capabilities
	}

	client := acp.NewClient(transport)
	if client == nil {
		transport.Close()
		return capabilities
	}

	// Start the client's read loop
	if err := client.Start(queryCtx); err != nil {
		client.Stop()
		return capabilities
	}
	defer func() {
		if err := client.Stop(); err != nil {
			log.Printf("[Discovery] Client stop error: %v", err)
		}
	}()

	// Query capabilities via Initialize
	result, err := client.Initialize(queryCtx, &acp.InitializeParams{
		ProtocolVersion:    acp.ProtocolVersion,
		ClientCapabilities: acp.ClientCapabilities{},
		ClientInfo: acp.ImplementationInfo{
			Name:    "swarm-editor",
			Version: "1.0.0",
		},
	})
	if err != nil {
		return capabilities
	}

	// Extract capabilities from result
	if result.AgentCapabilities.TeamCollaboration {
		capabilities = append(capabilities, "team_collaboration")
	}
	if result.AgentCapabilities.PairProgramming {
		capabilities = append(capabilities, "pair_programming")
	}
	if result.AgentCapabilities.SwarmMode != nil {
		capabilities = append(capabilities, "swarm_mode")
	}
	if result.AgentCapabilities.PromptCapabilities.Image {
		capabilities = append(capabilities, "image_support")
	}
	if result.AgentCapabilities.PromptCapabilities.Audio {
		capabilities = append(capabilities, "audio_support")
	}
	if result.AgentCapabilities.MCP.HTTP {
		capabilities = append(capabilities, "mcp_http")
	}

	return capabilities
}

// verifyAgent verifies an agent is reachable
func (d *DiscoveryService) verifyAgent(agent *DiscoveredAgent) bool {
	if agent.Command == "" {
		return agent.Status == DiscoveryStatusAvailable
	}

	d.mu.RLock()
	ctx := d.ctx
	d.mu.RUnlock()

	if ctx == nil {
		ctx = context.Background()
	}

	verifyCtx, cancel := context.WithTimeout(ctx, d.config.ScanTimeout)
	defer cancel()

	cmd := exec.CommandContext(verifyCtx, agent.Command, "--help")
	return cmd.Run() == nil
}

// Connect connects to a discovered agent
func (d *DiscoveryService) Connect(agent *DiscoveredAgent) (*Agent, error) {
	log.Printf("[Discovery] Connecting to agent: %s (%s)", agent.Name, agent.Endpoint)

	var acpAgent *Agent
	var err error

	for i := 0; i < d.config.MaxRetries; i++ {
		acpAgent, err = d.tryConnect(agent)
		if err == nil {
			break
		}

		log.Printf("[Discovery] Connection attempt %d/%d failed: %v", i+1, d.config.MaxRetries, err)

		if i < d.config.MaxRetries-1 {
			// Capture ctx under lock to avoid race with Stop()
			d.mu.RLock()
			ctx := d.ctx
			d.mu.RUnlock()
			if ctx == nil {
				return nil, fmt.Errorf("discovery service stopped")
			}

			timer := time.NewTimer(d.config.RetryDelay)
			select {
			case <-ctx.Done():
				timer.Stop()
				return nil, ctx.Err()
			case <-timer.C:
				// Timer fired, continue to next retry
			}
		}
	}

	if err != nil {
		d.mu.Lock()
		agent.Status = DiscoveryStatusUnreachable
		d.mu.Unlock()

		if d.onFailed != nil {
			d.wg.Add(1)
			go func() {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("[Discovery] onFailed callback panic for %q: %v", agent.Name, r)
					}
					d.wg.Done()
				}()
				d.onFailed(agent, err)
			}()
		}

		return nil, fmt.Errorf("failed to connect after %d retries: %w", d.config.MaxRetries, err)
	}

	d.mu.Lock()
	agent.Status = DiscoveryStatusAvailable
	d.mu.Unlock()

	// Register with lifecycle
	if d.lifecycle != nil {
		d.lifecycle.Spawn(agent.Name, AgentTypeCoder)
	}

	if d.onConnected != nil {
		d.wg.Add(1)
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[Discovery] onConnected callback panic for %q: %v", agent.Name, r)
				}
				d.wg.Done()
			}()
			d.onConnected(agent, acpAgent)
		}()
	}

	log.Printf("[Discovery] Successfully connected to agent: %s", agent.Name)
	return acpAgent, nil
}

// tryConnect attempts a single connection
func (d *DiscoveryService) tryConnect(agent *DiscoveredAgent) (*Agent, error) {
	d.mu.RLock()
	parentCtx := d.ctx
	d.mu.RUnlock()

	if parentCtx == nil {
		return nil, fmt.Errorf("discovery service stopped")
	}

	ctx, cancel := context.WithTimeout(parentCtx, d.config.ConnectTimeout)
	defer cancel()

	// Create ACP connection via ConnectionManager
	conn, err := d.connManager.Connect(ctx, agent.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection: %w", err)
	}

	// Wait for connection to be established (poll for up to ConnectTimeout)
	waitCtx, waitCancel := context.WithTimeout(ctx, d.config.ConnectTimeout)
	defer waitCancel()

	pollTicker := time.NewTicker(100 * time.Millisecond)
	defer pollTicker.Stop()

	for {
		state := conn.GetState()
		if state == acp.StateConnected {
			break
		}
		if state == acp.StateError {
			return nil, fmt.Errorf("connection failed")
		}

		select {
		case <-waitCtx.Done():
			return nil, fmt.Errorf("connection timeout")
		case <-pollTicker.C:
			// Continue waiting
		}
	}

	// Create agent from connection with proper memory initialization
	acpAgent := &Agent{
		ID:           acp.AgentID(agent.ID),
		Name:         agent.Name,
		Type:         AgentTypeCoder,
		Capabilities: conn.Capabilities,
		shortMemory:  NewShortTermMemory(100),
		longMemory:   NewLongTermMemory(0),
	}

	// Associate connection with agent for Execute() to use
	acpAgent.SetConnection(conn)

	// Register agent with registry
	if d.registry != nil {
		if err := d.registry.Register(acpAgent); err != nil {
			// Log warning but continue - connection is still valid
			log.Printf("[Discovery] Warning: failed to register agent %s: %v", agent.ID, err)
		}
	}

	return acpAgent, nil
}

// RegisterSelf handles self-registration requests from agents
func (d *DiscoveryService) RegisterSelf(req *RegistrationRequest) error {
	// Snapshot callback and agent under lock, invoke outside to prevent deadlock
	var (
		agent        *DiscoveredAgent
		onDiscovered func(*DiscoveredAgent)
		validationErr error
	)

	d.mu.Lock()
	{
		if !d.config.AllowSelfRegister {
			validationErr = fmt.Errorf("self-registration is not allowed")
		} else if req.AgentID == "" {
			validationErr = fmt.Errorf("agent_id is required")
		} else if req.Name == "" {
			validationErr = fmt.Errorf("name is required")
		} else if len(req.AgentID) > 256 {
			validationErr = fmt.Errorf("agent_id too long (max 256)")
		} else if len(req.Name) > 256 {
			validationErr = fmt.Errorf("name too long (max 256)")
		} else if len(req.Endpoint) > 1024 {
			validationErr = fmt.Errorf("endpoint too long (max 1024)")
		} else if _, exists := d.discovered[req.AgentID]; exists {
			validationErr = fmt.Errorf("agent already registered: %s", req.AgentID)
		} else if pending, exists := d.pending[req.AgentID]; exists {
			validationErr = fmt.Errorf("registration already pending: %s (status: %s)", req.AgentID, pending.Status)
		} else if d.config.RequireApproval {
			// Require approval path
			req.Status = "pending"
			d.pending[req.AgentID] = req
			log.Printf("[Discovery] Registration pending approval: %q", req.AgentID)
		} else {
			// Auto-approve path
			req.Status = "approved"
			d.pending[req.AgentID] = req

			// Add to discovered
			agent = &DiscoveredAgent{
				ID:       req.AgentID,
				Name:     req.Name,
				Endpoint: req.Endpoint,
				Status:   DiscoveryStatusAvailable,
				LastSeen: time.Now(),
			}
			d.discovered[req.AgentID] = agent

			log.Printf("[Discovery] Agent self-registered: %q", req.AgentID)

			onDiscovered = d.onDiscovered
		}
	}
	d.mu.Unlock()

	if validationErr != nil {
		return validationErr
	}

	// Invoke callback outside lock to prevent deadlock
	if onDiscovered != nil {
		d.wg.Add(1)
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[Discovery] RegisterSelf onDiscovered callback panic for %q: %v", agent.Name, r)
				}
				d.wg.Done()
			}()
			onDiscovered(agent)
		}()
	}

	return nil
}

// ApproveRegistration approves a pending registration
func (d *DiscoveryService) ApproveRegistration(agentID, approvedBy string) error {
	// Snapshot callback under lock, invoke outside lock to prevent deadlock
	var (
		agent         *DiscoveredAgent
		onDiscovered  func(*DiscoveredAgent)
		validationErr error
	)

	d.mu.Lock()
	{
		req, exists := d.pending[agentID]
		if !exists {
			validationErr = fmt.Errorf("no pending registration for: %s", agentID)
		} else if req.Status != "pending" {
			validationErr = fmt.Errorf("registration not pending: %s", req.Status)
		} else {
			req.Status = "approved"
			req.ApprovedBy = approvedBy

			// Add to discovered
			agent = &DiscoveredAgent{
				ID:       req.AgentID,
				Name:     req.Name,
				Endpoint: req.Endpoint,
				Status:   DiscoveryStatusAvailable,
				LastSeen: time.Now(),
			}
			d.discovered[agentID] = agent

			// Remove from pending to prevent memory leak
			delete(d.pending, agentID)

			onDiscovered = d.onDiscovered
		}
	}
	d.mu.Unlock()

	if validationErr != nil {
		return validationErr
	}

	log.Printf("[Discovery] Registration approved: %q by %q", agentID, approvedBy)

	if onDiscovered != nil {
		d.wg.Add(1)
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[Discovery] ApproveRegistration onDiscovered callback panic for %q: %v", agent.Name, r)
				}
				d.wg.Done()
			}()
			onDiscovered(agent)
		}()
	}

	return nil
}

// RejectRegistration rejects a pending registration
func (d *DiscoveryService) RejectRegistration(agentID, reason string) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	req, exists := d.pending[agentID]
	if !exists {
		return fmt.Errorf("no pending registration for: %s", agentID)
	}

	req.Status = "rejected"
	log.Printf("[Discovery] Registration rejected: %q (reason: %q)", agentID, reason)

	delete(d.pending, agentID)

	return nil
}

// GetDiscovered returns copies of all discovered agents
func (d *DiscoveryService) GetDiscovered() []*DiscoveredAgent {
	d.mu.RLock()
	defer d.mu.RUnlock()

	agents := make([]*DiscoveredAgent, 0, len(d.discovered))
	for _, agent := range d.discovered {
		cp := *agent // Value copy to prevent mutation of internal state
		// MEDIUM: Deep copy Metadata map to prevent shared mutation
		if agent.Metadata != nil {
			cp.Metadata = make(map[string]string, len(agent.Metadata))
			for k, v := range agent.Metadata {
				cp.Metadata[k] = v
			}
		}
		agents = append(agents, &cp)
	}

	return agents
}

// GetPending returns copies of all pending registrations
func (d *DiscoveryService) GetPending() []*RegistrationRequest {
	d.mu.RLock()
	defer d.mu.RUnlock()

	requests := make([]*RegistrationRequest, 0, len(d.pending))
	for _, req := range d.pending {
		if req.Status == "pending" {
			// MEDIUM: Value copy to prevent mutation of internal state
			cp := *req
			requests = append(requests, &cp)
		}
	}

	return requests
}

// networkListener listens for self-registration requests
func (d *DiscoveryService) networkListener() {
	defer d.wg.Done()

	d.mu.RLock()
	ctx := d.ctx
	d.mu.RUnlock()

	if ctx == nil {
		return
	}

	addr := fmt.Sprintf(":%d", d.config.BroadcastPort)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		log.Printf("[Discovery] Failed to start network listener: %v", err)
		return
	}
	defer listener.Close()

	log.Printf("[Discovery] Network listener started on %s", addr)

	// Track cleanup goroutine to prevent leak on Stop
	d.wg.Add(1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[Discovery] Network listener cleanup panic: %v", r)
			}
			d.wg.Done()
		}()
		<-ctx.Done()
		listener.Close()
	}()

	for {
		conn, err := listener.Accept()
		if err != nil {
			select {
			case <-ctx.Done():
				return
			default:
				continue
			}
		}

		d.wg.Add(1)
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[Discovery] handleRegistration panic: %v", r)
				}
				d.wg.Done()
			}()
			d.handleRegistration(conn)
		}()
	}
}

// handleRegistration handles an incoming registration request
func (d *DiscoveryService) handleRegistration(conn net.Conn) {
	defer conn.Close()

	// Set read deadline
	if err := conn.SetReadDeadline(time.Now().Add(10 * time.Second)); err != nil {
		log.Printf("[Discovery] Failed to set read deadline: %v", err)
	}

	// Read registration request (limit to 1MB to prevent memory exhaustion)
	var req RegistrationRequest
	decoder := json.NewDecoder(io.LimitReader(conn, 1<<20))
	if err := decoder.Decode(&req); err != nil {
		log.Printf("[Discovery] Invalid registration request: %v", err)
		return
	}

	req.Requested = time.Now()

	// Process registration
	if err := d.RegisterSelf(&req); err != nil {
		log.Printf("[Discovery] Registration failed: %v", err)
		// Safe JSON encoding to prevent injection
		errResp := map[string]string{"status": "error", "message": "registration failed"}
		if errData, marshalErr := json.Marshal(errResp); marshalErr == nil {
			if _, writeErr := conn.Write(errData); writeErr != nil {
				log.Printf("[Discovery] Failed to write error response: %v", writeErr)
			}
		}
		return
	}

	// Send response
	response := map[string]string{
		"status":  "success",
		"message": "Registration accepted",
	}

	if d.config.RequireApproval {
		response["message"] = "Registration pending approval"
	}

	data, err := json.Marshal(response)
	if err != nil {
		log.Printf("[Discovery] Failed to marshal response: %v", err)
		return
	}
	if _, err := conn.Write(data); err != nil {
		log.Printf("[Discovery] Failed to send registration response: %v", err)
	}
}

// inferCapabilities infers capabilities from command name
func (d *DiscoveryService) inferCapabilities(cmd string) []string {
	capabilities := []string{"worker"}

	switch cmd {
	case "claude":
		capabilities = append(capabilities, "role:coder", "role:architect", "coordinator")
	case "copilot":
		capabilities = append(capabilities, "role:coder")
	case "cursor":
		capabilities = append(capabilities, "role:coder", "role:reviewer")
	case "aider":
		capabilities = append(capabilities, "role:coder", "role:reviewer")
	case "continue":
		capabilities = append(capabilities, "role:coder")
	}

	return capabilities
}

// parseCapabilities parses capability strings
func parseCapabilities(caps []string) acp.AgentCapabilities {
	result := acp.AgentCapabilities{
		LoadSession: true,
		PromptCapabilities: acp.PromptCapabilities{
			Image:           true,
			Audio:           false,
			EmbeddedContext: true,
		},
		MCP: acp.MCPCapabilities{
			HTTP: true,
			SSE:  true,
		},
		PairProgramming: true,
	}

	// Check for coordinator capability and enable team collaboration
	for _, cap := range caps {
		if cap == "coordinator" {
			result.TeamCollaboration = true
		}
	}

	return result
}

// expandHome expands ~ to home directory
func expandHome(path string) string {
	if strings.HasPrefix(path, "~/") {
		home, _ := os.UserHomeDir()
		return filepath.Join(home, path[2:])
	}
	return path
}

// Callbacks

// OnDiscovered registers a callback for agent discovery events
func (d *DiscoveryService) OnDiscovered(fn func(agent *DiscoveredAgent)) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.onDiscovered = fn
}

// OnConnected registers a callback for agent connection events
func (d *DiscoveryService) OnConnected(fn func(agent *DiscoveredAgent, acpAgent *Agent)) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.onConnected = fn
}

// OnFailed registers a callback for connection failure events
func (d *DiscoveryService) OnFailed(fn func(agent *DiscoveredAgent, err error)) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.onFailed = fn
}
