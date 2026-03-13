package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
	"github.com/swarm-editor/swarm-editor/internal/llm"
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

	// Initialize LLM provider registry
	llmRegistry := llm.NewRegistry()
	mockProvider := llm.NewMockProvider("mock")
	llmRegistry.Register(mockProvider)

	// Initialize swarm orchestrator
	swarmConfig := swarm.SwarmConfig{
		ID:                 "swarm-1",
		Name:               "Main Swarm",
		Topology:           swarm.TopologyStar,
		Strategy:           swarm.StrategyParallel,
		ConsensusThreshold: 0.6,
		VotingTimeout:      30 * time.Second,
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
	myTeam.AddMember(&team.Member{
		ID:   "user-1",
		Name: "Developer",
		Role: team.RoleDeveloper,
	})
	myTeam.AddAgent(coder)
	myTeam.AddAgent(reviewer)

	fmt.Printf("Team '%s' created with %d members\n", myTeam.Name, len(myTeam.Members))

	// Initialize ACP server
	transport := acp.NewStdioTransport(os.Stdin, os.Stdout)
	if transport == nil {
		log.Fatal("Failed to create stdio transport")
	}

	acpServer := acp.NewServer(&ACPServerHandler{
		registry:    registry,
		swarm:       mainSwarm,
		pairManager: pairManager,
		teamManager: teamManager,
		llmRegistry: llmRegistry,
	}, transport)
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

	// Graceful shutdown
	fmt.Println("Stopping swarm...")
	mainSwarm.Stop()
	fmt.Println("Stopping ACP server...")
	acpServer.Stop()
	fmt.Println("Swarm Editor stopped")
}

// ACPServerHandler implements acp.Handler
type ACPServerHandler struct {
	registry    *agent.Registry
	swarm       *swarm.Swarm
	pairManager *pair.Manager
	teamManager *team.Manager
	llmRegistry *llm.Registry
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
			Name:    "swarm-editor",
			Title:   "Swarm Editor Agent",
			Version: "0.1.0",
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
	// Get default LLM provider
	provider := h.llmRegistry.GetDefault()
	if provider == nil {
		return nil, fmt.Errorf("no LLM provider available")
	}

	// Convert prompt to LLM messages
	messages := llm.ConvertACPPromptToLLMMessages(params.Prompt)

	// Generate response
	req := &llm.GenerateRequest{
		Model:    "default",
		Messages: messages,
	}
	resp, err := provider.Generate(ctx, req)
	if err != nil {
		return nil, err
	}

	return &acp.SessionPromptResult{
		StopReason: acp.StopReason(resp.StopReason),
	}, nil
}

func (h *ACPServerHandler) SessionCancel(ctx context.Context, sessionID acp.SessionID) error {
	return nil
}

func (h *ACPServerHandler) OnUpdate(callback func(sessionID acp.SessionID, update *acp.Update)) {
	// Register update callback
}

func (h *ACPServerHandler) OnPermissionRequest(callback func(sessionID acp.SessionID, request *acp.SessionRequestPermissionParams) (*acp.PermissionOutcome, error)) {
	// Register permission callback
}
