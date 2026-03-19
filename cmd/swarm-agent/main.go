package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/config"
)

// Standalone ACP Agent that can be launched by editors
func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle shutdown signals
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		cancel()
	}()

	// Create stdio transport for ACP communication
	transport := acp.NewStdioTransport(os.Stdin, os.Stdout)
	if transport == nil {
		log.Fatal("Failed to create stdio transport")
	}

	// Create ACP server
	server := acp.NewServer(&AgentHandler{}, transport)
	if server == nil {
		log.Fatal("Failed to create ACP server")
	}

	if err := server.Start(ctx); err != nil {
		log.Fatalf("Failed to start agent: %v", err)
	}

	fmt.Fprintf(os.Stderr, "Swarm Agent started\n")

	<-ctx.Done()

	// Graceful shutdown
	server.Stop()
	fmt.Fprintf(os.Stderr, "Swarm Agent stopped\n")
}

// AgentHandler implements acp.Handler for a standalone agent
type AgentHandler struct{}

func (h *AgentHandler) Initialize(ctx context.Context, params *acp.InitializeParams) (*acp.InitializeResult, error) {
	return &acp.InitializeResult{
		ProtocolVersion: acp.ProtocolVersion,
		AgentCapabilities: acp.AgentCapabilities{
			LoadSession: true,
			PromptCapabilities: acp.PromptCapabilities{
				Image:           true,
				Audio:           false,
				EmbeddedContext: true,
			},
		},
		AgentInfo: acp.ImplementationInfo{
			Name:    "swarm-agent",
			Title:   "Swarm Standalone Agent",
			Version: config.AppVersion,
		},
		AuthMethods: []acp.AuthMethod{},
	}, nil
}

func (h *AgentHandler) Authenticate(ctx context.Context, method string, params json.RawMessage) error {
	return nil
}

func (h *AgentHandler) SessionNew(ctx context.Context, params *acp.SessionNewParams) (*acp.SessionNewResult, error) {
	sessionID := acp.GenerateSessionID()
	return &acp.SessionNewResult{
		SessionID: sessionID,
		Mode:      params.Mode,
	}, nil
}

func (h *AgentHandler) SessionLoad(ctx context.Context, params *acp.SessionLoadParams) (*acp.SessionLoadResult, error) {
	return &acp.SessionLoadResult{
		SessionID: params.SessionID,
		Mode:      acp.ModeDefault,
	}, nil
}

func (h *AgentHandler) SessionSetMode(ctx context.Context, params *acp.SessionSetModeParams) error {
	return nil
}

func (h *AgentHandler) SessionPrompt(ctx context.Context, params *acp.SessionPromptParams) (*acp.SessionPromptResult, error) {
	// Process the prompt and return a response
	// This is where the main agent logic would go

	return &acp.SessionPromptResult{
		StopReason: acp.StopEndTurn,
	}, nil
}

func (h *AgentHandler) SessionCancel(ctx context.Context, sessionID acp.SessionID) error {
	return nil
}

func (h *AgentHandler) OnUpdate(callback func(sessionID acp.SessionID, update *acp.Update)) {}

func (h *AgentHandler) OnPermissionRequest(callback func(sessionID acp.SessionID, request *acp.SessionRequestPermissionParams) (*acp.PermissionOutcome, error)) {
}

func (h *AgentHandler) SwarmCreate(ctx context.Context, params *acp.SwarmCreateParams) (*acp.SwarmCreateResult, error) {
	return nil, fmt.Errorf("standalone agent does not support swarm operations")
}

func (h *AgentHandler) SwarmStart(ctx context.Context, params *acp.SwarmStartParams) error {
	return fmt.Errorf("standalone agent does not support swarm operations")
}

func (h *AgentHandler) SwarmStop(ctx context.Context, params *acp.SwarmStopParams) error {
	return fmt.Errorf("standalone agent does not support swarm operations")
}

func (h *AgentHandler) SwarmSubmitTask(ctx context.Context, params *acp.SwarmSubmitTaskParams) (*acp.SwarmSubmitTaskResult, error) {
	return nil, fmt.Errorf("standalone agent does not support swarm operations")
}

func (h *AgentHandler) SwarmExecuteTask(ctx context.Context, params *acp.SwarmExecuteTaskParams) (*acp.SwarmTaskResult, error) {
	return nil, fmt.Errorf("standalone agent does not support swarm operations")
}

func (h *AgentHandler) SwarmGetStatus(ctx context.Context, params *acp.SwarmGetStatusParams) (*acp.SwarmStatusResult, error) {
	return nil, fmt.Errorf("standalone agent does not support swarm operations")
}
