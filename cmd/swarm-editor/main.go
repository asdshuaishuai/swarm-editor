package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
	"github.com/swarm-editor/swarm-editor/internal/config"
	"github.com/swarm-editor/swarm-editor/internal/mcp"
	"github.com/swarm-editor/swarm-editor/internal/pair"
	"github.com/swarm-editor/swarm-editor/internal/swarm"
	"github.com/swarm-editor/swarm-editor/internal/team"
)

func main() {
	// Create context with cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle shutdown signals
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		fmt.Println("\nShutting down...")
		cancel()
	}()

	// Initialize components
	fmt.Println("Starting Swarm Editor...")

	// Initialize agent registry
	registry := agent.NewRegistry()
	lifecycle := agent.NewLifecycle(registry)

	// Spawn initial agents
	coder := lifecycle.Spawn("Coder-1", agent.AgentTypeCoder)
	reviewer := lifecycle.Spawn("Reviewer-1", agent.AgentTypeReviewer)
	architect := lifecycle.Spawn("Architect-1", agent.AgentTypeArchitect)

	fmt.Printf("Spawned agents: %s, %s, %s\n", coder.ID, reviewer.ID, architect.ID)

	// Load ACP configuration and initialize ConnectionManager
	// This connects to external coding agents (Claude Code CLI, Copilot, etc.)
	acpConfig, err := acp.LoadConfig("")
	if err != nil {
		log.Printf("Warning: Failed to load ACP config: %v, using defaults", err)
		acpConfig = acp.NewConfig()
	}
	connManager := acp.NewConnectionManager(acpConfig)

	// Connect to all enabled external agents
	if err := connManager.ConnectAll(ctx); err != nil {
		log.Printf("Warning: Some agents failed to connect: %v", err)
	}
	fmt.Printf("ConnectionManager initialized with %d connections\n", len(connManager.ListConnections()))

	// Initialize swarm orchestrator with Queen Bee model
	swarmConfig := swarm.SwarmConfig{
		ID:       "swarm-1",
		Name:     "Main Swarm",
		Topology: swarm.TopologyStar,
		Strategy: swarm.StrategyParallel,
	}
	mainSwarm := swarm.NewSwarm(swarmConfig)
	mainSwarm.AddAgent(coder)
	mainSwarm.AddAgent(reviewer)
	mainSwarm.AddAgent(architect)
	mainSwarm.SetCoordinator(architect)

	if err := mainSwarm.Start(ctx); err != nil {
		log.Fatalf("Failed to start swarm: %v", err)
	}
	fmt.Println("Swarm started successfully")

	// Initialize pair programming manager
	pairManager := pair.NewManager(registry)

	// Initialize team manager
	teamManager := team.NewManager()
	myTeam, err := teamManager.CreateTeam("Development Team", "owner-1")
	if err != nil {
		log.Fatalf("Failed to create team: %v", err)
	}
	if err := myTeam.AddMember(&team.Member{
		ID:   "user-1",
		Name: "Developer",
		Role: team.RoleDeveloper,
	}); err != nil {
		log.Printf("Warning: failed to add member: %v", err)
	}
	if err := myTeam.AddAgent(coder); err != nil {
		log.Printf("Warning: failed to add coder agent: %v", err)
	}
	if err := myTeam.AddAgent(reviewer); err != nil {
		log.Printf("Warning: failed to add reviewer agent: %v", err)
	}

	fmt.Printf("Team '%s' created with %d members\n", myTeam.Name, len(myTeam.Members))

	// Initialize ACP server
	transport := acp.NewStdioTransport(os.Stdin, os.Stdout)
	if transport == nil {
		log.Fatal("Failed to create stdio transport")
	}

	handler := &ACPServerHandler{
		registry:    registry,
		swarm:       mainSwarm,
		pairManager: pairManager,
		teamManager: teamManager,
		swarms:      make(map[string]*swarm.Swarm),
		connManager: connManager,
		// MCP client management - maintains active MCP server connections
		mcpClients: make(map[string]*mcp.Client),
	}
	acpServer := acp.NewServer(handler, transport)
	if acpServer == nil {
		log.Fatal("Failed to create ACP server")
	}

	if err := acpServer.Start(ctx); err != nil {
		log.Fatalf("Failed to start ACP server: %v", err)
	}
	fmt.Println("ACP server started")

	// Print stats
	stats := mainSwarm.GetStats()
	fmt.Printf("Swarm Stats: %+v\n", stats)

	// Wait for shutdown
	<-ctx.Done()

	// Graceful shutdown with timeout (Temporal-inspired worker.Shutdown pattern)
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutdownCancel()

	fmt.Println("Stopping swarm...")
	if err := mainSwarm.Stop(); err != nil {
		log.Printf("Warning: swarm stop error: %v", err)
	}

	// Stop any dynamically created swarms
	handler.swarmMutex.RLock()
	for id, s := range handler.swarms {
		if err := s.Stop(); err != nil {
			log.Printf("Warning: swarm %s stop error: %v", id, err)
		}
	}
	handler.swarmMutex.RUnlock()

	// Disconnect MCP clients
	handler.mcpClientsMutex.Lock()
	for id, client := range handler.mcpClients {
		if client != nil {
			if err := client.Disconnect(); err != nil {
				log.Printf("Warning: MCP client %s disconnect error: %v", id, err)
			}
		}
		delete(handler.mcpClients, id)
	}
	handler.mcpClientsMutex.Unlock()

	fmt.Println("Disconnecting external agents...")
	connManager.DisconnectAll()
	fmt.Println("Stopping ACP server...")
	if err := acpServer.Stop(); err != nil {
		log.Printf("Warning: ACP server stop error: %v", err)
	}

	// Wait for shutdown timeout or all goroutines to finish
	select {
	case <-shutdownCtx.Done():
		log.Println("Warning: graceful shutdown timed out after 15s")
	default:
		fmt.Println("Swarm Editor stopped")
	}
}

// ACPServerHandler implements acp.Handler
type ACPServerHandler struct {
	registry    *agent.Registry
	swarm       *swarm.Swarm
	pairManager *pair.Manager
	teamManager *team.Manager
	swarms      map[string]*swarm.Swarm
	swarmMutex  sync.RWMutex

	// ConnectionManager manages external ACP agent connections
	connManager *acp.ConnectionManager

	// MCP clients manages MCP server connections
	mcpClients      map[string]*mcp.Client
	mcpClientsMutex sync.RWMutex

	// Callbacks for updates and permissions
	updateCallback     func(sessionID acp.SessionID, update *acp.Update)
	permissionCallback func(sessionID acp.SessionID, request *acp.SessionRequestPermissionParams) (*acp.PermissionOutcome, error)
	callbackMutex      sync.RWMutex
}

func (h *ACPServerHandler) Initialize(ctx context.Context, params *acp.InitializeParams) (*acp.InitializeResult, error) {
	return &acp.InitializeResult{
		ProtocolVersion: acp.ProtocolVersion,
		AgentCapabilities: acp.AgentCapabilities{
			LoadSession: true,
			PromptCapabilities: acp.PromptCapabilities{
				Image:           true,
				Audio:           false,
				EmbeddedContext: true,
			},
			SwarmMode: &acp.SwarmCapabilities{
				MaxAgents:     10,
				Topologies:    []string{"star", "mesh", "tree", "ring"},
				TaskDecompose: true,
				Consensus:     true,
			},
			PairProgramming:   true,
			TeamCollaboration: true,
		},
		AgentInfo: acp.ImplementationInfo{
			Name:    config.AppName,
			Title:   "Swarm Editor Agent",
			Version: config.AppVersion,
		},
		AuthMethods: []acp.AuthMethod{},
	}, nil
}

func (h *ACPServerHandler) Authenticate(ctx context.Context, method string, params json.RawMessage) error {
	return nil
}

func (h *ACPServerHandler) SessionNew(ctx context.Context, params *acp.SessionNewParams) (*acp.SessionNewResult, error) {
	sessionID := acp.GenerateSessionID()
	return &acp.SessionNewResult{
		SessionID: sessionID,
		Mode:      params.Mode,
	}, nil
}

func (h *ACPServerHandler) SessionLoad(ctx context.Context, params *acp.SessionLoadParams) (*acp.SessionLoadResult, error) {
	return &acp.SessionLoadResult{
		SessionID: params.SessionID,
		Mode:      acp.ModeDefault,
	}, nil
}

func (h *ACPServerHandler) SessionSetMode(ctx context.Context, params *acp.SessionSetModeParams) error {
	return nil
}

func (h *ACPServerHandler) SessionPrompt(ctx context.Context, params *acp.SessionPromptParams) (*acp.SessionPromptResult, error) {
	// Dispatch to external coding agents via ConnectionManager
	// Swarm Editor is an aggregation/scheduling platform, not an LLM executor.
	// Real coding agents (Claude Code CLI, Copilot, Cursor) handle LLM calls.

	// Get connected external agents
	connectedAgents := h.connManager.GetConnected()
	if len(connectedAgents) == 0 {
		return nil, fmt.Errorf("no external agents connected - please connect an ACP-compatible agent")
	}

	// Use the first available connected agent
	agentConn := connectedAgents[0]

	// Create session with the external agent
	session, err := agentConn.CreateSession(ctx, acp.ModeDefault)
	if err != nil {
		return nil, fmt.Errorf("failed to create session with external agent: %w", err)
	}

	// Send prompt to external agent
	result, err := agentConn.SendPrompt(ctx, session.ID, params.Prompt)
	if err != nil {
		return nil, fmt.Errorf("failed to send prompt to external agent: %w", err)
	}

	return result, nil
}

func (h *ACPServerHandler) SessionCancel(ctx context.Context, sessionID acp.SessionID) error {
	return nil
}

func (h *ACPServerHandler) OnUpdate(callback func(sessionID acp.SessionID, update *acp.Update)) {
	h.callbackMutex.Lock()
	defer h.callbackMutex.Unlock()
	h.updateCallback = callback
}

func (h *ACPServerHandler) OnPermissionRequest(callback func(sessionID acp.SessionID, request *acp.SessionRequestPermissionParams) (*acp.PermissionOutcome, error)) {
	h.callbackMutex.Lock()
	defer h.callbackMutex.Unlock()
	h.permissionCallback = callback
}

// parseTopology converts string to TopologyType
func parseTopology(topology string) swarm.TopologyType {
	switch topology {
	case "star":
		return swarm.TopologyStar
	case "mesh":
		return swarm.TopologyMesh
	case "tree":
		return swarm.TopologyTree
	case "ring":
		return swarm.TopologyRing
	case "hybrid":
		return swarm.TopologyHybrid
	default:
		return swarm.TopologyStar
	}
}

// parseStrategy converts string to TaskStrategy
func parseStrategy(strategy string) swarm.TaskStrategy {
	switch strategy {
	case "parallel":
		return swarm.StrategyParallel
	case "sequential":
		return swarm.StrategySequential
	case "pipeline":
		return swarm.StrategyPipeline
	case "mapreduce":
		return swarm.StrategyMapReduce
	default:
		return swarm.StrategyParallel
	}
}

// SwarmCreate creates a new swarm
func (h *ACPServerHandler) SwarmCreate(ctx context.Context, params *acp.SwarmCreateParams) (*acp.SwarmCreateResult, error) {
	// Create swarm config
	config := swarm.SwarmConfig{
		ID:       fmt.Sprintf("swarm_%d", time.Now().UnixNano()),
		Name:     params.Name,
		Topology: parseTopology(params.Topology),
		Strategy: parseStrategy(params.Strategy),
	}

	// Create new swarm
	s := swarm.NewSwarm(config)

	// Add agents to swarm
	for _, agentID := range params.AgentIDs {
		ag, ok := h.registry.Get(acp.AgentID(agentID))
		if ok && ag != nil {
			s.AddAgent(ag)
		}
	}

	// Store swarm
	h.swarmMutex.Lock()
	h.swarms[s.ID] = s
	h.swarmMutex.Unlock()

	return &acp.SwarmCreateResult{SwarmID: s.ID}, nil
}

// SwarmStart starts a swarm
func (h *ACPServerHandler) SwarmStart(ctx context.Context, params *acp.SwarmStartParams) error {
	h.swarmMutex.RLock()
	s, ok := h.swarms[params.SwarmID]
	h.swarmMutex.RUnlock()

	if !ok {
		return fmt.Errorf("swarm not found: %s", params.SwarmID)
	}

	return s.Start(ctx)
}

// SwarmStop stops a swarm
func (h *ACPServerHandler) SwarmStop(ctx context.Context, params *acp.SwarmStopParams) error {
	h.swarmMutex.RLock()
	s, ok := h.swarms[params.SwarmID]
	h.swarmMutex.RUnlock()

	if !ok {
		return fmt.Errorf("swarm not found: %s", params.SwarmID)
	}

	return s.Stop()
}

// SwarmSubmitTask submits a task to a swarm
func (h *ACPServerHandler) SwarmSubmitTask(ctx context.Context, params *acp.SwarmSubmitTaskParams) (*acp.SwarmSubmitTaskResult, error) {
	h.swarmMutex.RLock()
	s, ok := h.swarms[params.SwarmID]
	h.swarmMutex.RUnlock()

	if !ok {
		return nil, fmt.Errorf("swarm not found: %s", params.SwarmID)
	}

	// Create task
	taskID := fmt.Sprintf("task_%d", time.Now().UnixNano())
	task := &swarm.Task{
		ID:          taskID,
		Title:       params.Title,
		Description: params.Description,
		Prompt:      params.Prompt,
	}

	// Set priority if provided
	switch params.Priority {
	case 1:
		task.Priority = swarm.PriorityLow
	case 2:
		task.Priority = swarm.PriorityMedium
	case 3:
		task.Priority = swarm.PriorityHigh
	default:
		task.Priority = swarm.PriorityMedium
	}

	if err := s.SubmitTask(ctx, task); err != nil {
		return nil, err
	}

	return &acp.SwarmSubmitTaskResult{TaskID: taskID}, nil
}

// SwarmExecuteTask executes a task in a swarm
func (h *ACPServerHandler) SwarmExecuteTask(ctx context.Context, params *acp.SwarmExecuteTaskParams) (*acp.SwarmTaskResult, error) {
	h.swarmMutex.RLock()
	s, ok := h.swarms[params.SwarmID]
	h.swarmMutex.RUnlock()

	if !ok {
		return nil, fmt.Errorf("swarm not found: %s", params.SwarmID)
	}

	// Get the task from the swarm
	task := s.GetTask(params.TaskID)
	if task == nil {
		return nil, fmt.Errorf("task not found: %s in swarm: %s", params.TaskID, params.SwarmID)
	}

	result, err := s.ExecuteTask(ctx, task)
	if err != nil {
		return nil, err
	}

	return &acp.SwarmTaskResult{
		TaskID: params.TaskID,
		Status: "completed",
		Output: result.Content,
		AgentResults: map[string]acp.AgentTaskResult{
			result.AgentID: {
				AgentID:    result.AgentID,
				Status:     "completed",
				Output:     result.Content,
				DurationMs: result.Duration.Milliseconds(),
			},
		},
	}, nil
}

// SwarmGetStatus gets swarm status
func (h *ACPServerHandler) SwarmGetStatus(ctx context.Context, params *acp.SwarmGetStatusParams) (*acp.SwarmStatusResult, error) {
	h.swarmMutex.RLock()
	s, ok := h.swarms[params.SwarmID]
	h.swarmMutex.RUnlock()

	if !ok {
		return nil, fmt.Errorf("swarm not found: %s", params.SwarmID)
	}

	stats := s.GetStats()

	return &acp.SwarmStatusResult{
		SwarmID:         params.SwarmID,
		State:           stats.State,
		AgentCount:      stats.AgentCount,
		IdleAgents:      stats.IdleAgents,
		ExecutingAgents: stats.ExecutingAgents,
		PendingTasks:    stats.PendingTasks,
		CompletedTasks:  stats.CompletedTasks,
		Topology:        stats.Topology,
		Strategy:        stats.Strategy,
	}, nil
}

// MCPStartServer starts an MCP server
func (h *ACPServerHandler) MCPStartServer(ctx context.Context, params *acp.MCPStartServerParams) (*acp.MCPServerStatus, error) {
	// Check if already connected
	h.mcpClientsMutex.RLock()
	if client, exists := h.mcpClients[params.ServerID]; exists && client != nil {
		h.mcpClientsMutex.RUnlock()
		// Return existing connection status
		tools := client.ListTools()
		var acpTools []acp.Tool
		for _, t := range tools {
			inputSchemaBytes, err := json.Marshal(t.InputSchema)
			if err != nil {
				log.Printf("[MCP] Failed to marshal input schema for tool %s: %v", t.Name, err)
				continue
			}
			acpTools = append(acpTools, acp.Tool{
				Name:        t.Name,
				Description: t.Description,
				InputSchema: inputSchemaBytes,
			})
		}
		return &acp.MCPServerStatus{
			ServerID: params.ServerID,
			Name:     params.ServerID,
			Status:   "connected",
			Tools:    acpTools,
			Error:    "",
		}, nil
	}
	h.mcpClientsMutex.RUnlock()

	// Load config to find the MCP server
	cfg, err := acp.LoadConfig("")
	if err != nil {
		return nil, fmt.Errorf("failed to load config: %w", err)
	}

	// Find the server config
	var serverConfig *acp.MCPServerConfig
	for _, s := range cfg.DefaultMCPSettings.CustomMCPServers {
		if s.Name == params.ServerID {
			serverConfig = &s
			break
		}
	}

	if serverConfig == nil {
		return nil, fmt.Errorf("MCP server not found: %s", params.ServerID)
	}

	// Create and connect MCP client
	mcpConfig := &mcp.ClientConfig{
		Name:    serverConfig.Name,
		Command: serverConfig.Command,
		Args:    serverConfig.Args,
		Env:     serverConfig.Env,
		Timeout: 30, // 30 seconds startup timeout
	}

	client := mcp.NewClient(mcpConfig)

	// Connect to the MCP server
	if err := client.Connect(ctx); err != nil {
		return &acp.MCPServerStatus{
			ServerID: params.ServerID,
			Name:     serverConfig.Name,
			Status:   "error",
			Tools:    nil,
			Error:    fmt.Sprintf("Failed to connect: %v", err),
		}, nil
	}

	// Store the client
	h.mcpClientsMutex.Lock()
	h.mcpClients[params.ServerID] = client
	h.mcpClientsMutex.Unlock()

	// Get available tools
	tools := client.ListTools()
	var acpTools []acp.Tool
	for _, t := range tools {
		inputSchemaBytes, err := json.Marshal(t.InputSchema)
		if err != nil {
			log.Printf("[MCP] Failed to marshal input schema for tool %s: %v", t.Name, err)
			continue
		}
		acpTools = append(acpTools, acp.Tool{
			Name:        t.Name,
			Description: t.Description,
			InputSchema: inputSchemaBytes,
		})
	}

	log.Printf("MCP server %s started with %d tools", params.ServerID, len(tools))

	return &acp.MCPServerStatus{
		ServerID: params.ServerID,
		Name:     serverConfig.Name,
		Status:   "connected",
		Tools:    acpTools,
		Error:    "",
	}, nil
}

// MCPStopServer stops an MCP server
func (h *ACPServerHandler) MCPStopServer(ctx context.Context, params *acp.MCPStopServerParams) (*acp.MCPServerStatus, error) {
	h.mcpClientsMutex.Lock()
	defer h.mcpClientsMutex.Unlock()

	client, exists := h.mcpClients[params.ServerID]
	if !exists {
		return &acp.MCPServerStatus{
			ServerID: params.ServerID,
			Name:     params.ServerID,
			Status:   "disconnected",
			Tools:    nil,
			Error:    "",
		}, nil
	}

	// Disconnect and remove from cache
	if client != nil {
		if err := client.Disconnect(); err != nil {
			log.Printf("Warning: MCP client disconnect error: %v", err)
		}
	}
	delete(h.mcpClients, params.ServerID)

	log.Printf("MCP server %s stopped", params.ServerID)

	return &acp.MCPServerStatus{
		ServerID: params.ServerID,
		Name:     params.ServerID,
		Status:   "disconnected",
		Tools:    nil,
		Error:    "",
	}, nil
}

// MCPCallTool calls a tool on an MCP server
func (h *ACPServerHandler) MCPCallTool(ctx context.Context, params *acp.MCPCallToolParams) (*acp.MCPCallToolResult, error) {
	// Try to use cached client first
	h.mcpClientsMutex.RLock()
	cachedClient, clientExists := h.mcpClients[params.ServerID]
	h.mcpClientsMutex.RUnlock()

	if clientExists && cachedClient != nil {
		// Use the cached client
		result, err := cachedClient.CallTool(ctx, params.ToolName, params.Arguments)
		if err != nil {
			return &acp.MCPCallToolResult{
				Content: []acp.MCPContent{
					{Type: "text", Text: err.Error()},
				},
				IsError: true,
			}, nil
		}

		// Convert result to ACP format
		var content []acp.MCPContent
		for _, c := range result.Content {
			content = append(content, acp.MCPContent{
				Type:     c.Type,
				Text:     c.Text,
				Data:     c.Data,
				MimeType: c.MimeType,
			})
		}

		return &acp.MCPCallToolResult{
			Content: content,
			IsError: result.IsError,
		}, nil
	}

	// Fallback: Create temporary connection if no cached client exists
	// This handles the case where the server wasn't explicitly started
	cfg, err := acp.LoadConfig("")
	if err != nil {
		return nil, fmt.Errorf("failed to load config: %w", err)
	}

	// Find the server config
	var serverConfig *acp.MCPServerConfig
	for _, s := range cfg.DefaultMCPSettings.CustomMCPServers {
		if s.Name == params.ServerID {
			serverConfig = &s
			break
		}
	}

	if serverConfig == nil {
		return nil, fmt.Errorf("MCP server not found: %s", params.ServerID)
	}

	// Create MCP client config
	mcpConfig := &mcp.ClientConfig{
		Name:    serverConfig.Name,
		Command: serverConfig.Command,
		Args:    serverConfig.Args,
		Env:     serverConfig.Env,
	}

	client := mcp.NewClient(mcpConfig)

	// Connect to the MCP server
	if err := client.Connect(ctx); err != nil {
		return nil, fmt.Errorf("failed to connect to MCP server: %w", err)
	}
	defer func() {
		if err := client.Disconnect(); err != nil {
			log.Printf("Warning: MCP client disconnect error: %v", err)
		}
	}()

	// Call the tool
	result, err := client.CallTool(ctx, params.ToolName, params.Arguments)
	if err != nil {
		return &acp.MCPCallToolResult{
			Content: []acp.MCPContent{
				{Type: "text", Text: err.Error()},
			},
			IsError: true,
		}, nil
	}

	// Convert result to ACP format
	var content []acp.MCPContent
	for _, c := range result.Content {
		content = append(content, acp.MCPContent{
			Type:     c.Type,
			Text:     c.Text,
			Data:     c.Data,
			MimeType: c.MimeType,
		})
	}

	return &acp.MCPCallToolResult{
		Content: content,
		IsError: result.IsError,
	}, nil
}

// MCPListTools lists available tools on an MCP server
func (h *ACPServerHandler) MCPListTools(ctx context.Context, params *acp.MCPListToolsParams) (*acp.MCPListToolsResult, error) {
	// Load config to find the MCP server
	cfg, err := acp.LoadConfig("")
	if err != nil {
		return nil, fmt.Errorf("failed to load config: %w", err)
	}

	// Find the server config
	var serverConfig *acp.MCPServerConfig
	for _, s := range cfg.DefaultMCPSettings.CustomMCPServers {
		if s.Name == params.ServerID {
			serverConfig = &s
			break
		}
	}

	if serverConfig == nil {
		return nil, fmt.Errorf("MCP server not found: %s", params.ServerID)
	}

	// Create MCP client and list tools
	mcpConfig := &mcp.ClientConfig{
		Name:    serverConfig.Name,
		Command: serverConfig.Command,
		Args:    serverConfig.Args,
		Env:     serverConfig.Env,
	}

	client := mcp.NewClient(mcpConfig)

	// Connect to the MCP server
	if err := client.Connect(ctx); err != nil {
		return nil, fmt.Errorf("failed to connect to MCP server: %w", err)
	}
	defer func() {
		if err := client.Disconnect(); err != nil {
			log.Printf("Warning: MCP client disconnect error: %v", err)
		}
	}()

	// List tools
	tools := client.ListTools()

	// Convert to ACP format
	var acpTools []acp.Tool
	for _, t := range tools {
		// Convert InputSchema to json.RawMessage
		inputSchemaBytes, err := json.Marshal(t.InputSchema)
		if err != nil {
			return nil, fmt.Errorf("marshal input schema for tool %s: %w", t.Name, err)
		}
		acpTools = append(acpTools, acp.Tool{
			Name:        t.Name,
			Description: t.Description,
			InputSchema: inputSchemaBytes,
		})
	}

	return &acp.MCPListToolsResult{
		Tools: acpTools,
	}, nil
}
