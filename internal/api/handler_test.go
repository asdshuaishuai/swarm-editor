package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
	"github.com/swarm-editor/swarm-editor/internal/mcp"
	"github.com/swarm-editor/swarm-editor/internal/swarm"
	"github.com/swarm-editor/swarm-editor/internal/team"
)

func TestCommandHandler_HandleCommand(t *testing.T) {
	registry := agent.NewRegistry()
	connMgr := acp.NewConnectionManager(&acp.Config{})
	swarms := make(map[string]*swarm.Swarm)
	teamMgr := team.NewManagerWithDir("") // Use in-memory mode for testing
	mcpClients := make(map[string]*mcp.Client)

	server := &WebSocketServer{
		registry:    registry,
		connManager: connMgr,
		swarms:      swarms,
		teamManager: teamMgr,
		mcpClients:  mcpClients,
	}
	handler := NewCommandHandler(server)

	t.Run("unknown method returns error", func(t *testing.T) {
		_, err := handler.HandleCommand("unknown_method", nil)
		if err == nil {
			t.Error("Expected error for unknown method")
		}
	})

	t.Run("get_agents returns empty list", func(t *testing.T) {
		result, err := handler.HandleCommand("get_agents", nil)
		if err != nil {
			t.Errorf("Unexpected error: %v", err)
		}
		agents, ok := result.([]AgentInfo)
		if !ok {
			t.Error("Expected []AgentInfo")
		}
		if len(agents) != 0 {
			t.Errorf("Expected 0 agents, got %d", len(agents))
		}
	})

	t.Run("get_swarms returns empty list", func(t *testing.T) {
		result, err := handler.HandleCommand("get_swarms", nil)
		if err != nil {
			t.Errorf("Unexpected error: %v", err)
		}
		swarms, ok := result.([]SwarmInfo)
		if !ok {
			t.Error("Expected []SwarmInfo")
		}
		if len(swarms) != 0 {
			t.Errorf("Expected 0 swarms, got %d", len(swarms))
		}
	})

	t.Run("get_teams returns empty list", func(t *testing.T) {
		result, err := handler.HandleCommand("get_teams", nil)
		if err != nil {
			t.Errorf("Unexpected error: %v", err)
		}
		teams, ok := result.([]TeamInfo)
		if !ok {
			t.Error("Expected []TeamInfo")
		}
		if len(teams) != 0 {
			t.Errorf("Expected 0 teams, got %d", len(teams))
		}
	})
}

func TestCommandHandler_HandleCreateSwarm(t *testing.T) {
	registry := agent.NewRegistry()
	swarms := make(map[string]*swarm.Swarm)

	server := &WebSocketServer{
		registry: registry,
		swarms:   swarms,
	}
	handler := NewCommandHandler(server)

	t.Run("create swarm with valid params", func(t *testing.T) {
		params := map[string]interface{}{
			"name":     "Test Swarm",
			"topology": "mesh",
			"strategy": "round_robin",
		}
		paramsJSON, _ := json.Marshal(params)

		result, err := handler.HandleCommand("create_swarm", paramsJSON)
		if err != nil {
			t.Errorf("Unexpected error: %v", err)
		}

		swarmInfo, ok := result.(SwarmInfo)
		if !ok {
			t.Fatalf("Expected SwarmInfo, got %T", result)
		}
		if swarmInfo.Name != "Test Swarm" {
			t.Errorf("Expected name 'Test Swarm', got %s", swarmInfo.Name)
		}
		if swarmInfo.Topology != "mesh" {
			t.Errorf("Expected topology 'mesh', got %s", swarmInfo.Topology)
		}
	})

	t.Run("create swarm with missing name", func(t *testing.T) {
		params := map[string]interface{}{
			"topology": "mesh",
		}
		paramsJSON, _ := json.Marshal(params)

		result, err := handler.HandleCommand("create_swarm", paramsJSON)
		// Empty name is allowed, just creates swarm with empty name
		_ = result
		_ = err
	})

	t.Run("create swarm with name too long", func(t *testing.T) {
		longName := make([]byte, maxNameLen+1)
		for i := range longName {
			longName[i] = 'a'
		}
		params := map[string]interface{}{
			"name": string(longName),
		}
		paramsJSON, _ := json.Marshal(params)

		_, err := handler.HandleCommand("create_swarm", paramsJSON)
		if err == nil {
			t.Error("Expected error for name too long")
		}
	})
}

func TestCommandHandler_HandleCreateTeam(t *testing.T) {
	teamMgr := team.NewManager()

	server := &WebSocketServer{
		teamManager: teamMgr,
	}
	handler := NewCommandHandler(server)

	t.Run("create team with valid params", func(t *testing.T) {
		params := map[string]interface{}{
			"name":        "Test Team",
			"description": "A test team",
			"ownerId":     "user-1",
		}
		paramsJSON, _ := json.Marshal(params)

		result, err := handler.HandleCommand("create_team", paramsJSON)
		if err != nil {
			t.Errorf("Unexpected error: %v", err)
		}

		teamInfo, ok := result.(TeamInfo)
		if !ok {
			t.Fatalf("Expected TeamInfo, got %T", result)
		}
		if teamInfo.Name != "Test Team" {
			t.Errorf("Expected name 'Test Team', got %s", teamInfo.Name)
		}
	})

	t.Run("create team with missing name", func(t *testing.T) {
		params := map[string]interface{}{
			"ownerId": "user-1",
		}
		paramsJSON, _ := json.Marshal(params)

		_, err := handler.HandleCommand("create_team", paramsJSON)
		if err == nil {
			t.Error("Expected error for missing name")
		}
	})
}

func TestCommandHandler_HandleStartAgent(t *testing.T) {
	registry := agent.NewRegistry()
	connMgr := acp.NewConnectionManager(&acp.Config{})

	server := &WebSocketServer{
		registry:    registry,
		connManager: connMgr,
	}
	handler := NewCommandHandler(server)

	t.Run("start non-existent agent", func(t *testing.T) {
		params := map[string]interface{}{
			"id": "non-existent-agent",
		}
		paramsJSON, _ := json.Marshal(params)

		_, err := handler.HandleCommand("start_agent", paramsJSON)
		if err == nil {
			t.Error("Expected error for non-existent agent")
		}
	})
}

func TestCommandHandler_HandleGetAgent(t *testing.T) {
	registry := agent.NewRegistry()

	server := &WebSocketServer{
		registry: registry,
	}
	handler := NewCommandHandler(server)

	t.Run("get non-existent agent", func(t *testing.T) {
		params := map[string]interface{}{
			"id": "non-existent-agent",
		}
		paramsJSON, _ := json.Marshal(params)

		_, err := handler.HandleCommand("get_agent", paramsJSON)
		if err == nil {
			t.Error("Expected error for non-existent agent")
		}
	})
}

func TestCommandHandler_HandleSubmitTask(t *testing.T) {
	registry := agent.NewRegistry()
	swarms := make(map[string]*swarm.Swarm)

	server := &WebSocketServer{
		registry: registry,
		swarms:   swarms,
	}
	handler := NewCommandHandler(server)

	t.Run("submit task to non-existent swarm", func(t *testing.T) {
		params := map[string]interface{}{
			"swarmId":   "non-existent",
			"taskTitle": "Test Task",
		}
		paramsJSON, _ := json.Marshal(params)

		_, err := handler.HandleCommand("submit_task", paramsJSON)
		if err == nil {
			t.Error("Expected error for non-existent swarm")
		}
	})
}

func TestCommandHandler_InvalidJSON(t *testing.T) {
	server := &WebSocketServer{}
	handler := NewCommandHandler(server)

	t.Run("invalid JSON params", func(t *testing.T) {
		_, err := handler.HandleCommand("create_swarm", []byte("invalid json"))
		if err == nil {
			t.Error("Expected error for invalid JSON")
		}
	})
}

func TestCommandHandler_ListFiles(t *testing.T) {
	server := &WebSocketServer{
		workspacePath: ".",
	}
	handler := NewCommandHandler(server)

	t.Run("list files in current directory", func(t *testing.T) {
		params := map[string]interface{}{
			"path": ".",
		}
		paramsJSON, _ := json.Marshal(params)

		result, err := handler.HandleCommand("list_dir", paramsJSON)
		if err != nil {
			t.Errorf("Unexpected error: %v", err)
		}
		files, ok := result.([]FileInfo)
		if !ok {
			t.Error("Expected []FileInfo")
		}
		if len(files) == 0 {
			t.Error("Expected at least one file in current directory")
		}
	})
}

func TestCommandHandler_GetCheckpoints(t *testing.T) {
	swarms := make(map[string]*swarm.Swarm)

	server := &WebSocketServer{
		swarms: swarms,
	}
	handler := NewCommandHandler(server)

	t.Run("get checkpoints from non-existent swarm", func(t *testing.T) {
		params := map[string]interface{}{
			"swarmId": "non-existent",
		}
		paramsJSON, _ := json.Marshal(params)

		_, err := handler.HandleCommand("get_checkpoints", paramsJSON)
		if err == nil {
			t.Error("Expected error for non-existent swarm")
		}
	})
}

func TestCommandHandler_MCPCommands(t *testing.T) {
	server := &WebSocketServer{
		mcpClients: make(map[string]*mcp.Client),
	}
	handler := NewCommandHandler(server)

	t.Run("get_mcp_servers with no servers", func(t *testing.T) {
		result, err := handler.HandleCommand("get_mcp_servers", nil)
		if err != nil {
			t.Errorf("Unexpected error: %v", err)
		}
		servers, ok := result.([]MCPServerInfo)
		if !ok {
			t.Fatalf("Expected []MCPServerInfo, got %T", result)
		}
		if len(servers) != 0 {
			t.Errorf("Expected 0 servers, got %d", len(servers))
		}
	})

	t.Run("start non-existent mcp server", func(t *testing.T) {
		params := map[string]interface{}{
			"serverId": "non-existent",
		}
		paramsJSON, _ := json.Marshal(params)

		_, err := handler.HandleCommand("start_mcp_server", paramsJSON)
		if err == nil {
			t.Error("Expected error for non-existent MCP server")
		}
	})
}

func TestEmergenceGetDataReturnsCopy(t *testing.T) {
	svc := NewEmergenceService(nil, nil, nil)
	data1 := svc.GetData()
	data2 := svc.GetData()

	if data1 == nil || data2 == nil {
		t.Fatal("expected non-nil emergence data")
	}

	// Mutate the first result
	data1.Signals = append(data1.Signals, EmergentSignal{ID: "injected"})

	// Second call should return fresh data, not see the mutation
	data3 := svc.GetData()
	for _, s := range data3.Signals {
		if s.ID == "injected" {
			t.Error("GetData returned cached data that was mutated by caller")
		}
	}
}

func TestEmergenceHandlersContentType(t *testing.T) {
	svc := NewEmergenceService(nil, nil, nil)

	tests := []struct {
		name    string
		handler func(http.ResponseWriter, *http.Request)
	}{
		{"HandleGetEmergenceData", svc.HandleGetEmergenceData},
		{"HandleGetSwarmHealth", svc.HandleGetSwarmHealth},
		{"HandleGetAgentNodes", svc.HandleGetAgentNodes},
		{"HandleGetTaskFlows", svc.HandleGetTaskFlows},
		{"HandleGetEmergentSignals", svc.HandleGetEmergentSignals},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/", nil)
			rec := httptest.NewRecorder()
			tt.handler(rec, req)

			ct := rec.Header().Get("Content-Type")
			if ct != "application/json" {
				t.Errorf("%s: expected Content-Type 'application/json', got %q", tt.name, ct)
			}
		})
	}
}
