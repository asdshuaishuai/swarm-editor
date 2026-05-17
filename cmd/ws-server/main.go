package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
	"github.com/swarm-editor/swarm-editor/internal/api"
	"github.com/swarm-editor/swarm-editor/internal/mcp"
	"github.com/swarm-editor/swarm-editor/internal/swarm"
	"github.com/swarm-editor/swarm-editor/internal/team"
)

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		fmt.Println("\nShutting down...")
		cancel()
	}()

	// Initialize components
	registry := agent.NewRegistry()

	// Load ACP config and connect to external agents
	acpConfig, err := acp.LoadConfig("")
	if err != nil {
		fmt.Printf("Warning: Failed to load ACP config: %v, using defaults\n", err)
		acpConfig = acp.NewConfig()
	}
	connManager := acp.NewConnectionManager(acpConfig)
	if connectErr := connManager.ConnectAll(ctx); connectErr != nil {
		fmt.Printf("Warning: Some agents failed to connect: %v\n", connectErr)
	}
	fmt.Printf("ConnectionManager: %d connections\n", len(connManager.ListConnections()))

	// Team manager
	teamManager := team.NewManager()

	// Create WebSocket server
	cfg := &api.WebSocketConfig{
		Addr:           ":8080",
		Registry:       registry,
		ConnManager:    connManager,
		Swarms:         make(map[string]*swarm.Swarm),
		Supervisors:    make(map[string]*swarm.Supervisor),
		TeamManager:    teamManager,
		MCPClients:     make(map[string]*mcp.Client),
		WorkspacePath:  ".",
	}

	s := api.NewWebSocketServer(cfg)
	fmt.Println("Starting WebSocket server on :8080...")
	if err := s.Start(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "Server error: %v\n", err)
		os.Exit(1)
	}
}
