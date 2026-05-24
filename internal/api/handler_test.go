package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

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
		_, err := handler.HandleCommand("unknown_method", nil, "test")
		if err == nil {
			t.Error("Expected error for unknown method")
		}
	})

	t.Run("get_agents returns empty list", func(t *testing.T) {
		result, err := handler.HandleCommand("get_agents", nil, "test")
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
		result, err := handler.HandleCommand("get_swarms", nil, "test")
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
		result, err := handler.HandleCommand("get_teams", nil, "test")
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

		result, err := handler.HandleCommand("create_swarm", paramsJSON, "test")
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

		result, err := handler.HandleCommand("create_swarm", paramsJSON, "test")
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

		_, err := handler.HandleCommand("create_swarm", paramsJSON, "test")
		if err == nil {
			t.Error("Expected error for name too long")
		}
	})
}

func TestCommandHandler_HandleCreateTeam(t *testing.T) {
	teamMgr := team.NewManagerWithDir("")

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

		result, err := handler.HandleCommand("create_team", paramsJSON, "test")
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

		_, err := handler.HandleCommand("create_team", paramsJSON, "test")
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

		_, err := handler.HandleCommand("start_agent", paramsJSON, "test")
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

		_, err := handler.HandleCommand("get_agent", paramsJSON, "test")
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

		_, err := handler.HandleCommand("submit_task", paramsJSON, "test")
		if err == nil {
			t.Error("Expected error for non-existent swarm")
		}
	})
}

func TestCommandHandler_InvalidJSON(t *testing.T) {
	server := &WebSocketServer{}
	handler := NewCommandHandler(server)

	t.Run("invalid JSON params", func(t *testing.T) {
		_, err := handler.HandleCommand("create_swarm", []byte("invalid json"), "test")
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

		result, err := handler.HandleCommand("list_dir", paramsJSON, "test")
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

		_, err := handler.HandleCommand("get_checkpoints", paramsJSON, "test")
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
		result, err := handler.HandleCommand("get_mcp_servers", nil, "test")
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

		_, err := handler.HandleCommand("start_mcp_server", paramsJSON, "test")
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

func TestCommandHandler_HandleStopAgent(t *testing.T) {
	registry := agent.NewRegistry()
	connMgr := acp.NewConnectionManager(&acp.Config{})

	server := &WebSocketServer{
		registry:    registry,
		connManager: connMgr,
	}
	handler := NewCommandHandler(server)

	t.Run("stop non-existent agent", func(t *testing.T) {
		params := map[string]interface{}{"id": "non-existent"}
		paramsJSON, _ := json.Marshal(params)
		result, err := handler.HandleCommand("stop_agent", paramsJSON, "test")
		if err != nil {
			t.Errorf("unexpected error: %v", err)
		}
		if m, ok := result.(map[string]string); !ok || m["status"] != "stopped" {
			t.Errorf("expected stopped status, got %v", result)
		}
	})

	t.Run("stop with empty id", func(t *testing.T) {
		params := map[string]interface{}{"id": ""}
		paramsJSON, _ := json.Marshal(params)
		_, err := handler.HandleCommand("stop_agent", paramsJSON, "test")
		if err == nil {
			t.Error("expected error for empty agent id")
		}
	})

	t.Run("stop with invalid json", func(t *testing.T) {
		_, err := handler.HandleCommand("stop_agent", []byte("bad"), "test")
		if err == nil {
			t.Error("expected error for invalid json")
		}
	})
}

func TestCommandHandler_HandleRefreshAgents(t *testing.T) {
	server := &WebSocketServer{
		registry: agent.NewRegistry(),
	}
	handler := NewCommandHandler(server)

	t.Run("refresh returns empty list", func(t *testing.T) {
		result, err := handler.HandleCommand("refresh_agents", nil, "test")
		if err != nil {
			t.Errorf("unexpected error: %v", err)
		}
		agents, ok := result.([]AgentInfo)
		if !ok {
			t.Fatalf("expected []AgentInfo, got %T", result)
		}
		if len(agents) != 0 {
			t.Errorf("expected 0 agents, got %d", len(agents))
		}
	})
}

func TestCommandHandler_HandleDeleteTeam(t *testing.T) {
	t.Run("delete non-existent team succeeds (idempotent)", func(t *testing.T) {
		teamMgr := team.NewManagerWithDir("")
		server := &WebSocketServer{teamManager: teamMgr}
		handler := NewCommandHandler(server)

		params := map[string]interface{}{"id": "non-existent"}
		paramsJSON, _ := json.Marshal(params)
		result, err := handler.HandleCommand("delete_team", paramsJSON, "test")
		if err != nil {
			t.Errorf("unexpected error: %v", err)
		}
		m, ok := result.(map[string]string)
		if !ok {
			t.Fatalf("expected map, got %T", result)
		}
		if m["status"] != "deleted" {
			t.Errorf("expected status=deleted, got %s", m["status"])
		}
	})

	t.Run("delete with empty id", func(t *testing.T) {
		teamMgr := team.NewManagerWithDir("")
		server := &WebSocketServer{teamManager: teamMgr}
		handler := NewCommandHandler(server)

		params := map[string]interface{}{"id": ""}
		paramsJSON, _ := json.Marshal(params)
		_, err := handler.HandleCommand("delete_team", paramsJSON, "test")
		if err == nil {
			t.Error("expected error for empty id")
		}
	})

	t.Run("delete with invalid json", func(t *testing.T) {
		teamMgr := team.NewManagerWithDir("")
		server := &WebSocketServer{teamManager: teamMgr}
		handler := NewCommandHandler(server)

		_, err := handler.HandleCommand("delete_team", []byte("bad"), "test")
		if err == nil {
			t.Error("expected error for invalid json")
		}
	})
}

func TestCommandHandler_HandleAddAgentToTeam(t *testing.T) {
	t.Run("add agent to non-existent team", func(t *testing.T) {
		teamMgr := team.NewManagerWithDir("")
		registry := agent.NewRegistry()
		server := &WebSocketServer{teamManager: teamMgr, registry: registry}
		handler := NewCommandHandler(server)

		params := map[string]interface{}{"teamId": "non-existent", "agentId": "agent-1"}
		paramsJSON, _ := json.Marshal(params)
		_, err := handler.HandleCommand("add_agent_to_team", paramsJSON, "test")
		if err == nil {
			t.Error("expected error for non-existent team")
		}
	})

	t.Run("missing team id", func(t *testing.T) {
		server := &WebSocketServer{teamManager: team.NewManagerWithDir(""), registry: agent.NewRegistry()}
		handler := NewCommandHandler(server)

		params := map[string]interface{}{"agentId": "agent-1"}
		paramsJSON, _ := json.Marshal(params)
		_, err := handler.HandleCommand("add_agent_to_team", paramsJSON, "test")
		if err == nil {
			t.Error("expected error for missing team id")
		}
	})

	t.Run("missing agent id", func(t *testing.T) {
		server := &WebSocketServer{teamManager: team.NewManagerWithDir(""), registry: agent.NewRegistry()}
		handler := NewCommandHandler(server)

		params := map[string]interface{}{"teamId": "team-1"}
		paramsJSON, _ := json.Marshal(params)
		_, err := handler.HandleCommand("add_agent_to_team", paramsJSON, "test")
		if err == nil {
			t.Error("expected error for missing agent id")
		}
	})
}

func TestCommandHandler_HandleRemoveAgentFromTeam(t *testing.T) {
	t.Run("remove agent from non-existent team", func(t *testing.T) {
		teamMgr := team.NewManagerWithDir("")
		server := &WebSocketServer{teamManager: teamMgr}
		handler := NewCommandHandler(server)

		params := map[string]interface{}{"teamId": "non-existent", "agentId": "agent-1"}
		paramsJSON, _ := json.Marshal(params)
		_, err := handler.HandleCommand("remove_agent_from_team", paramsJSON, "test")
		if err == nil {
			t.Error("expected error for non-existent team")
		}
	})

	t.Run("missing team id", func(t *testing.T) {
		server := &WebSocketServer{teamManager: team.NewManagerWithDir("")}
		handler := NewCommandHandler(server)

		params := map[string]interface{}{"agentId": "agent-1"}
		paramsJSON, _ := json.Marshal(params)
		_, err := handler.HandleCommand("remove_agent_from_team", paramsJSON, "test")
		if err == nil {
			t.Error("expected error for missing team id")
		}
	})

	t.Run("missing agent id", func(t *testing.T) {
		server := &WebSocketServer{teamManager: team.NewManagerWithDir("")}
		handler := NewCommandHandler(server)

		params := map[string]interface{}{"teamId": "team-1"}
		paramsJSON, _ := json.Marshal(params)
		_, err := handler.HandleCommand("remove_agent_from_team", paramsJSON, "test")
		if err == nil {
			t.Error("expected error for missing agent id")
		}
	})
}

func TestCommandHandler_HandleStartSwarm(t *testing.T) {
	t.Run("start non-existent swarm", func(t *testing.T) {
		swarms := make(map[string]*swarm.Swarm)
		server := &WebSocketServer{swarms: swarms}
		handler := NewCommandHandler(server)

		params := map[string]interface{}{"id": "non-existent"}
		paramsJSON, _ := json.Marshal(params)
		_, err := handler.HandleCommand("start_swarm", paramsJSON, "test")
		if err == nil {
			t.Error("expected error for non-existent swarm")
		}
	})

	t.Run("empty swarm id", func(t *testing.T) {
		swarms := make(map[string]*swarm.Swarm)
		server := &WebSocketServer{swarms: swarms}
		handler := NewCommandHandler(server)

		params := map[string]interface{}{"id": ""}
		paramsJSON, _ := json.Marshal(params)
		_, err := handler.HandleCommand("start_swarm", paramsJSON, "test")
		if err == nil {
			t.Error("expected error for empty swarm id")
		}
	})
}

func TestCommandHandler_HandleStopSwarm(t *testing.T) {
	t.Run("stop non-existent swarm", func(t *testing.T) {
		swarms := make(map[string]*swarm.Swarm)
		server := &WebSocketServer{swarms: swarms}
		handler := NewCommandHandler(server)

		params := map[string]interface{}{"id": "non-existent"}
		paramsJSON, _ := json.Marshal(params)
		_, err := handler.HandleCommand("stop_swarm", paramsJSON, "test")
		if err == nil {
			t.Error("expected error for non-existent swarm")
		}
	})

	t.Run("empty swarm id", func(t *testing.T) {
		swarms := make(map[string]*swarm.Swarm)
		server := &WebSocketServer{swarms: swarms}
		handler := NewCommandHandler(server)

		params := map[string]interface{}{"id": ""}
		paramsJSON, _ := json.Marshal(params)
		_, err := handler.HandleCommand("stop_swarm", paramsJSON, "test")
		if err == nil {
			t.Error("expected error for empty swarm id")
		}
	})
}

func TestCommandHandler_HandleGetSwarmTasks(t *testing.T) {
	t.Run("tasks from non-existent swarm", func(t *testing.T) {
		swarms := make(map[string]*swarm.Swarm)
		server := &WebSocketServer{swarms: swarms}
		handler := NewCommandHandler(server)

		params := map[string]interface{}{"swarmId": "non-existent"}
		paramsJSON, _ := json.Marshal(params)
		_, err := handler.HandleCommand("get_swarm_tasks", paramsJSON, "test")
		if err == nil {
			t.Error("expected error for non-existent swarm")
		}
	})

	t.Run("empty swarm id", func(t *testing.T) {
		swarms := make(map[string]*swarm.Swarm)
		server := &WebSocketServer{swarms: swarms}
		handler := NewCommandHandler(server)

		params := map[string]interface{}{"swarmId": ""}
		paramsJSON, _ := json.Marshal(params)
		_, err := handler.HandleCommand("get_swarm_tasks", paramsJSON, "test")
		if err == nil {
			t.Error("expected error for empty swarm id")
		}
	})
}

func TestCommandHandler_HandleGetTeamsWithManager(t *testing.T) {
	t.Run("returns team after creation", func(t *testing.T) {
		teamMgr := team.NewManagerWithDir(t.TempDir())
		server := &WebSocketServer{teamManager: teamMgr}
		handler := NewCommandHandler(server)

		// Create a team first
		createParams := map[string]interface{}{
			"name":        "Test Team",
			"ownerId":     "user-1",
			"description": "desc",
		}
		createJSON, _ := json.Marshal(createParams)
		_, err := handler.HandleCommand("create_team", createJSON, "test")
		if err != nil {
			t.Fatalf("create_team: %v", err)
		}

		// List teams
		result, err := handler.HandleCommand("get_teams", nil, "test")
		if err != nil {
			t.Fatalf("get_teams: %v", err)
		}
		teams, ok := result.([]TeamInfo)
		if !ok {
			t.Fatalf("expected []TeamInfo, got %T", result)
		}
		if len(teams) != 1 {
			t.Fatalf("expected 1 team, got %d", len(teams))
		}
		if teams[0].Name != "Test Team" {
			t.Errorf("expected name 'Test Team', got %s", teams[0].Name)
		}
	})
}

func TestCommandHandler_HandleDeleteSwarm(t *testing.T) {
	t.Run("delete non-existent swarm is idempotent", func(t *testing.T) {
		swarms := make(map[string]*swarm.Swarm)
		server := &WebSocketServer{swarms: swarms}
		handler := NewCommandHandler(server)

		params := map[string]interface{}{"id": "non-existent"}
		paramsJSON, _ := json.Marshal(params)
		result, err := handler.HandleCommand("delete_swarm", paramsJSON, "test")
		if err != nil {
			t.Errorf("unexpected error: %v", err)
		}
		m, ok := result.(map[string]string)
		if !ok {
			t.Fatalf("expected map, got %T", result)
		}
		if m["status"] != "deleted" {
			t.Errorf("expected status=deleted, got %s", m["status"])
		}
	})

	t.Run("empty swarm id", func(t *testing.T) {
		swarms := make(map[string]*swarm.Swarm)
		server := &WebSocketServer{swarms: swarms}
		handler := NewCommandHandler(server)

		params := map[string]interface{}{"id": ""}
		paramsJSON, _ := json.Marshal(params)
		_, err := handler.HandleCommand("delete_swarm", paramsJSON, "test")
		if err == nil {
			t.Error("expected error for empty swarm id")
		}
	})
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

// ==================== Additional Handler Tests ====================

func newTestServer() *WebSocketServer {
	return &WebSocketServer{
		registry:     agent.NewRegistry(),
		connManager:  nil,
		swarms:       make(map[string]*swarm.Swarm),
		teamManager:  team.NewManagerWithDir(""),
		mcpClients:   make(map[string]*mcp.Client),
		shadowBuffer: NewShadowBuffer(),
	}
}

func newTestHandler() (*CommandHandler, *WebSocketServer) {
	server := newTestServer()
	return NewCommandHandler(server), server
}

func TestCommandHandler_HandleGetConfigPath(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("get_config_path", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	path, ok := result.(string)
	if !ok {
		t.Fatal("expected string result")
	}
	if path == "" {
		t.Error("config path should not be empty")
	}
}

func TestCommandHandler_HandleCreateSession_Validation(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		name   string
		params string
	}{
		{"empty agentId", `{"agentId": ""}`},
		{"whitespace agentId", `{"agentId": "   "}`},
		{"missing agentId", `{}`},
		{"invalid json", `invalid`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := handler.HandleCommand("create_session", json.RawMessage(tt.params), "test")
			if err == nil {
				t.Error("expected error")
			}
		})
	}
}

func TestCommandHandler_HandleCreateSession_NoConnManager(t *testing.T) {
	handler, server := newTestHandler()
	server.connManager = nil

	_, err := handler.HandleCommand("create_session", json.RawMessage(`{"agentId": "test-agent"}`), "test")
	if err == nil {
		t.Error("expected error when connManager is nil")
	}
}

func TestCommandHandler_HandleSendMessage_Validation(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		name   string
		params string
	}{
		{"empty sessionId", `{"sessionId": "", "message": "hello"}`},
		{"whitespace sessionId", `{"sessionId": "   "}`},
		{"missing sessionId", `{"message": "hello"}`},
		{"message too large", `{"sessionId": "s1", "message": "` + strings.Repeat("a", 100*1024+1) + `"}`},
		{"invalid json", `invalid`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := handler.HandleCommand("send_message", json.RawMessage(tt.params), "test")
			if err == nil {
				t.Error("expected error")
			}
		})
	}
}

func TestCommandHandler_HandleSendMessage_SessionNotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("send_message", json.RawMessage(`{"sessionId": "nonexistent", "message": "hello"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent session")
	}
}

func TestCommandHandler_HandleCloseSession_Validation(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		name   string
		params string
	}{
		{"empty sessionId", `{"sessionId": ""}`},
		{"whitespace sessionId", `{"sessionId": "   "}`},
		{"missing sessionId", `{}`},
		{"invalid json", `invalid`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := handler.HandleCommand("close_session", json.RawMessage(tt.params), "test")
			if err == nil {
				t.Error("expected error")
			}
		})
	}
}

func TestCommandHandler_HandleCloseSession_Success(t *testing.T) {
	handler, server := newTestHandler()
	server.sessionToAgent = map[string]string{"session-1": "agent-1"}

	result, err := handler.HandleCommand("close_session", json.RawMessage(`{"sessionId": "session-1"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m, ok := result.(map[string]string)
	if !ok || m["status"] != "closed" {
		t.Errorf("expected status=closed, got %v", result)
	}

	// Verify session was removed
	server.mu.RLock()
	_, exists := server.sessionToAgent["session-1"]
	server.mu.RUnlock()
	if exists {
		t.Error("session should be removed after close")
	}
}

func TestCommandHandler_HandlePermissionResponse_Validation(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		name   string
		params string
	}{
		{"empty requestId", `{"requestId": "", "approved": true, "resolvedBy": "user"}`},
		{"missing requestId", `{"approved": true, "resolvedBy": "user"}`},
		{"empty resolvedBy", `{"requestId": "r1", "approved": true, "resolvedBy": ""}`},
		{"missing resolvedBy", `{"requestId": "r1", "approved": true}`},
		{"invalid json", `invalid`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := handler.HandleCommand("permission_response", json.RawMessage(tt.params), "test")
			if err == nil {
				t.Error("expected error")
			}
		})
	}
}

func TestCommandHandler_HandlePermissionResponse_NoTeamManager(t *testing.T) {
	handler, server := newTestHandler()
	server.teamManager = nil

	_, err := handler.HandleCommand("permission_response", json.RawMessage(`{"requestId": "r1", "approved": true, "resolvedBy": "user"}`), "test")
	if err == nil {
		t.Error("expected error when teamManager is nil")
	}
}

func TestCommandHandler_HandleGetSwarm_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("get_swarm", json.RawMessage(`{"id": "nonexistent"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent swarm")
	}
}

func TestCommandHandler_HandleGetSwarm_EmptyID(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("get_swarm", json.RawMessage(`{"id": ""}`), "test")
	if err == nil {
		t.Error("expected error for empty id")
	}
}

func TestCommandHandler_HandleGetSwarm_InvalidJSON(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("get_swarm", json.RawMessage(`invalid`), "test")
	if err == nil {
		t.Error("expected error for invalid json")
	}
}

func TestCommandHandler_HandleExecuteTask_Validation(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		name   string
		params string
	}{
		{"empty swarmId", `{"swarmId": "", "taskId": "t1"}`},
		{"empty taskId", `{"swarmId": "s1", "taskId": ""}`},
		{"both empty", `{"swarmId": "  ", "taskId": "  "}`},
		{"missing fields", `{}`},
		{"invalid json", `invalid`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := handler.HandleCommand("execute_task", json.RawMessage(tt.params), "test")
			if err == nil {
				t.Error("expected error")
			}
		})
	}
}

func TestCommandHandler_HandleExecuteTask_SwarmNotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("execute_task", json.RawMessage(`{"swarmId": "nonexistent", "taskId": "t1"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent swarm")
	}
}

func TestCommandHandler_HandleStopMCPServer_Validation(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		name   string
		params string
	}{
		{"empty serverId", `{"serverId": ""}`},
		{"whitespace serverId", `{"serverId": "   "}`},
		{"missing serverId", `{}`},
		{"invalid json", `invalid`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := handler.HandleCommand("stop_mcp_server", json.RawMessage(tt.params), "test")
			if err == nil {
				t.Error("expected error")
			}
		})
	}
}

func TestCommandHandler_HandleStopMCPServer_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("stop_mcp_server", json.RawMessage(`{"serverId": "nonexistent"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent server")
	}
}

func TestCommandHandler_HandleCallMCPTool_Validation(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		name   string
		params string
	}{
		{"empty serverId", `{"serverId": "", "toolName": "tool1"}`},
		{"empty toolName", `{"serverId": "s1", "toolName": ""}`},
		{"both empty", `{"serverId": "  ", "toolName": "  "}`},
		{"missing fields", `{}`},
		{"too many arguments", `{"serverId": "s1", "toolName": "t1", "arguments": {` + strings.Repeat(`"k":""`, 51) + `}}`},
		{"invalid json", `invalid`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := handler.HandleCommand("call_mcp_tool", json.RawMessage(tt.params), "test")
			if err == nil {
				t.Error("expected error")
			}
		})
	}
}

func TestCommandHandler_HandleCallMCPTool_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("call_mcp_tool", json.RawMessage(`{"serverId": "nonexistent", "toolName": "tool1"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent server")
	}
}

func TestCommandHandler_HandleScanMCPServers_NilScanner(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("scan_mcp_servers", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	servers, ok := result.([]MCPServerInfo)
	if !ok {
		t.Fatalf("expected []MCPServerInfo, got %T", result)
	}
	if len(servers) != 0 {
		t.Errorf("expected empty list for nil scanner, got %d", len(servers))
	}
}

func TestCommandHandler_HandleListMCPTools_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params string
	}{
		{"empty serverId", `{"serverId": ""}`},
		{"missing serverId", `{}`},
		{"whitespace serverId", `{"serverId": "  "}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, _ := newTestHandler()
			_, err := handler.HandleCommand("list_mcp_tools", json.RawMessage(tt.params), "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleListMCPTools_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("list_mcp_tools", json.RawMessage(`{"serverId": "nonexistent"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent server")
	}
}

func TestCommandHandler_HandleListMCPTools_Success(t *testing.T) {
	handler, server := newTestHandler()

	client := mcp.NewClient(&mcp.ClientConfig{Name: "test-srv", Command: "echo"})
	server.AddMCPClient("test-srv", client)

	result, err := handler.HandleCommand("list_mcp_tools", json.RawMessage(`{"serverId": "test-srv"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	tools, ok := result.([]map[string]any)
	if !ok {
		t.Fatalf("expected []map[string]any, got %T", result)
	}
	if tools == nil {
		t.Error("expected non-nil tools slice")
	}
}

func TestCommandHandler_HandleGetMCPServers_WithClients(t *testing.T) {
	handler, server := newTestHandler()

	client := mcp.NewClient(&mcp.ClientConfig{Name: "my-server", Command: "test-cmd"})
	server.AddMCPClient("my-server", client)

	result, err := handler.HandleCommand("get_mcp_servers", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	servers, ok := result.([]MCPServerInfo)
	if !ok {
		t.Fatalf("expected []MCPServerInfo, got %T", result)
	}
	if len(servers) != 1 {
		t.Fatalf("expected 1 server, got %d", len(servers))
	}
	if servers[0].ID != "my-server" {
		t.Errorf("expected ID my-server, got %s", servers[0].ID)
	}
	if servers[0].Status != "connected" {
		t.Errorf("expected status connected, got %s", servers[0].Status)
	}
}

func TestCommandHandler_HandleCallMCPTool_TooManyArgs(t *testing.T) {
	handler, _ := newTestHandler()

	args := make(map[string]any)
	for i := 0; i < 51; i++ {
		args[fmt.Sprintf("key%d", i)] = i
	}
	params, _ := json.Marshal(map[string]any{"serverId": "x", "toolName": "y", "arguments": args})

	_, err := handler.HandleCommand("call_mcp_tool", params, "test")
	if err == nil {
		t.Error("expected error for too many arguments")
	}
}

func TestCommandHandler_HandleGetSupervisorStats(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("get_supervisor_stats", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	stats, ok := result.(SupervisorStats)
	if !ok {
		t.Fatal("expected SupervisorStats result")
	}
	if stats.TotalAgents != 0 {
		t.Errorf("expected 0 agents, got %d", stats.TotalAgents)
	}
}

func TestCommandHandler_HandleGetSupervisorStats_NilRegistry(t *testing.T) {
	handler, server := newTestHandler()
	server.registry = nil

	result, err := handler.HandleCommand("get_supervisor_stats", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	stats, ok := result.(SupervisorStats)
	if !ok {
		t.Fatal("expected SupervisorStats result")
	}
	if stats.TotalAgents != 0 {
		t.Errorf("expected 0 agents, got %d", stats.TotalAgents)
	}
}

func TestCommandHandler_HandleGetEmergenceData_Fallback(t *testing.T) {
	handler, _ := newTestHandler()
	// No emergence service, no swarms — should return fallback data

	result, err := handler.HandleCommand("get_emergence_data", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	data, ok := result.(EmergenceData)
	if !ok {
		t.Fatal("expected EmergenceData result")
	}
	// With no swarms, all health metrics should be zero
	if data.Health.AgentUtilization != 0 {
		t.Error("expected 0 utilization with no swarms")
	}
}

func TestCommandHandler_HandleAddMCPServer_Validation(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		name   string
		params string
	}{
		{"empty name", `{"config": {"name": "", "command": "npx"}}`},
		{"empty command", `{"config": {"name": "test", "command": ""}}`},
		{"whitespace name", `{"config": {"name": "   ", "command": "npx"}}`},
		{"whitespace command", `{"config": {"name": "test", "command": "  "}}`},
		{"missing config", `{}`},
		{"invalid json", `invalid`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := handler.HandleCommand("add_mcp_server", json.RawMessage(tt.params), "test")
			if err == nil {
				t.Error("expected error")
			}
		})
	}
}

func TestCommandHandler_HandleRemoveMCPServer_Validation(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		name   string
		params string
	}{
		{"empty serverId", `{"serverId": ""}`},
		{"whitespace serverId", `{"serverId": "   "}`},
		{"missing serverId", `{}`},
		{"invalid json", `invalid`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := handler.HandleCommand("remove_mcp_server", json.RawMessage(tt.params), "test")
			if err == nil {
				t.Error("expected error")
			}
		})
	}
}

func TestCommandHandler_HandleAddAgent_Validation(t *testing.T) {
	handler, _ := newTestHandler()

	// Generate strings that exceed limits
	longID := strings.Repeat("a", 129)   // maxIDLen = 128
	longName := strings.Repeat("b", 101) // maxNameLen = 100

	tests := []struct {
		name   string
		params string
	}{
		{"empty id", `{"config": {"id": "", "name": "Test", "command": "echo"}}`},
		{"whitespace id", `{"config": {"id": "   ", "name": "Test", "command": "echo"}}`},
		{"empty name", `{"config": {"id": "a1", "name": "", "command": "echo"}}`},
		{"whitespace name", `{"config": {"id": "a1", "name": "   ", "command": "echo"}}`},
		{"missing id", `{"config": {"name": "Test", "command": "echo"}}`},
		{"missing name", `{"config": {"id": "a1", "command": "echo"}}`},
		{"missing config", `{}`},
		{"invalid json", `invalid`},
		{"id too long", fmt.Sprintf(`{"config": {"id": "%s", "name": "Test", "command": "echo"}}`, longID)},
		{"name too long", fmt.Sprintf(`{"config": {"id": "a1", "name": "%s", "command": "echo"}}`, longName)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := handler.HandleCommand("add_agent", json.RawMessage(tt.params), "test")
			if err == nil {
				t.Error("expected error")
			}
		})
	}
}

func TestCommandHandler_HandleUpdateAgent_Validation(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		name   string
		params string
	}{
		{"empty id", `{"config": {"id": ""}}`},
		{"whitespace id", `{"config": {"id": "   "}}`},
		{"missing id", `{"config": {}}`},
		{"missing config", `{}`},
		{"invalid json", `invalid`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := handler.HandleCommand("update_agent", json.RawMessage(tt.params), "test")
			if err == nil {
				t.Error("expected error")
			}
		})
	}
}

func TestCommandHandler_HandleDeleteAgent_Validation(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		name   string
		params string
	}{
		{"empty agentId", `{"agentId": ""}`},
		{"whitespace agentId", `{"agentId": "   "}`},
		{"missing agentId", `{}`},
		{"invalid json", `invalid`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := handler.HandleCommand("delete_agent", json.RawMessage(tt.params), "test")
			if err == nil {
				t.Error("expected error")
			}
		})
	}
}

// ==================== Tier 2: Swarm Success Path Tests ====================

func TestCommandHandler_HandleCreateSwarm_Success(t *testing.T) {
	handler, _ := newTestHandler()

	params := json.RawMessage(`{"name": "Test Swarm", "topology": "mesh", "strategy": "round_robin"}`)
	result, err := handler.HandleCommand("create_swarm", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(SwarmInfo)
	if !ok {
		t.Fatal("expected SwarmInfo")
	}
	if info.Name != "Test Swarm" {
		t.Errorf("Name = %q, want 'Test Swarm'", info.Name)
	}
	if info.Status != "created" {
		t.Errorf("Status = %q, want 'created'", info.Status)
	}
}

func TestCommandHandler_HandleGetSwarm_Success(t *testing.T) {
	handler, server := newTestHandler()

	// Create a swarm first
	cfg := swarm.SwarmConfig{
		ID:       "test-swarm-1",
		Name:     "Test Swarm",
		Topology: swarm.TopologyMesh,
		Strategy: swarm.StrategySequential,
	}
	sw := swarm.NewSwarm(cfg)
	server.AddSwarm(cfg.ID, sw)

	params := json.RawMessage(`{"id": "test-swarm-1"}`)
	result, err := handler.HandleCommand("get_swarm", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]any)
	if !ok {
		t.Fatal("expected map result")
	}
	if info["id"] != "test-swarm-1" {
		t.Errorf("id = %v, want 'test-swarm-1'", info["id"])
	}
	if info["name"] != "Test Swarm" {
		t.Errorf("name = %v, want 'Test Swarm'", info["name"])
	}
}

func TestCommandHandler_HandleStartSwarm_Success(t *testing.T) {
	handler, server := newTestHandler()

	cfg := swarm.SwarmConfig{ID: "swarm-start", Name: "Start Test"}
	sw := swarm.NewSwarm(cfg)
	server.AddSwarm(cfg.ID, sw)

	params := json.RawMessage(`{"id": "swarm-start"}`)
	result, err := handler.HandleCommand("start_swarm", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map[string]string, got %T", result)
	}
	if info["status"] != "started" {
		t.Errorf("status = %v, want 'started'", info["status"])
	}
}

func TestCommandHandler_HandleStopSwarm_Success(t *testing.T) {
	handler, server := newTestHandler()

	cfg := swarm.SwarmConfig{ID: "swarm-stop", Name: "Stop Test"}
	sw := swarm.NewSwarm(cfg)
	server.AddSwarm(cfg.ID, sw)

	params := json.RawMessage(`{"id": "swarm-stop"}`)
	result, err := handler.HandleCommand("stop_swarm", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map[string]string, got %T", result)
	}
	if info["status"] != "stopped" {
		t.Errorf("status = %v, want 'stopped'", info["status"])
	}
}

func TestCommandHandler_HandleGetSwarmTasks_Success(t *testing.T) {
	handler, server := newTestHandler()

	cfg := swarm.SwarmConfig{ID: "swarm-tasks", Name: "Tasks Test"}
	sw := swarm.NewSwarm(cfg)
	server.AddSwarm(cfg.ID, sw)

	params := json.RawMessage(`{"swarmId": "swarm-tasks"}`)
	result, err := handler.HandleCommand("get_swarm_tasks", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	tasks, ok := result.([]TaskInfo)
	if !ok {
		t.Fatal("expected []TaskInfo")
	}
	// Empty swarm returns empty task list
	if len(tasks) != 0 {
		t.Errorf("expected 0 tasks, got %d", len(tasks))
	}
}

func TestCommandHandler_HandleSubmitTask_Success(t *testing.T) {
	handler, server := newTestHandler()

	cfg := swarm.SwarmConfig{ID: "swarm-submit", Name: "Submit Test"}
	sw := swarm.NewSwarm(cfg)
	server.AddSwarm(cfg.ID, sw)

	params := json.RawMessage(`{"swarmId": "swarm-submit", "title": "Test task", "description": "test"}`)
	result, err := handler.HandleCommand("submit_task", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// handleSubmitTask returns TaskInfo struct
	info, ok := result.(TaskInfo)
	if !ok {
		t.Fatalf("expected TaskInfo, got %T", result)
	}
	if info.Status != "pending" {
		t.Errorf("status = %v, want 'pending'", info.Status)
	}
}

func TestCommandHandler_HandleAddAgentToTeam_Success(t *testing.T) {
	handler, server := newTestHandler()

	// Create team first (ownerId is required)
	createParams := json.RawMessage(`{"name": "Test Team", "ownerId": "owner-1"}`)
	createResult, err := handler.HandleCommand("create_team", createParams, "test")
	if err != nil {
		t.Fatalf("create_team failed: %v", err)
	}

	// Extract team ID from response
	teamInfo, ok := createResult.(TeamInfo)
	if !ok {
		t.Fatalf("expected TeamInfo, got %T", createResult)
	}

	// Create agent in registry
	ag := agent.NewAgent("Test Agent", agent.AgentTypeWorker)
	ag.ID = "test-agent"
	server.registry.Register(ag)

	// Add agent to team using the actual team ID
	params := json.RawMessage(fmt.Sprintf(`{"teamId": "%s", "agentId": "test-agent"}`, teamInfo.ID))
	result, err := handler.HandleCommand("add_agent_to_team", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map[string]string, got %T", result)
	}
	if info["status"] != "added" {
		t.Errorf("status = %v, want 'added'", info["status"])
	}
}

func TestCommandHandler_HandleRemoveAgentFromTeam_Success(t *testing.T) {
	handler, server := newTestHandler()

	// Create team first (ownerId is required)
	createParams := json.RawMessage(`{"name": "Test Team 2", "ownerId": "owner-2"}`)
	createResult, err := handler.HandleCommand("create_team", createParams, "test")
	if err != nil {
		t.Fatalf("create_team failed: %v", err)
	}

	// Extract team ID from response
	teamInfo, ok := createResult.(TeamInfo)
	if !ok {
		t.Fatalf("expected TeamInfo, got %T", createResult)
	}

	// Create agent and add to team
	ag := agent.NewAgent("Test Agent 2", agent.AgentTypeWorker)
	ag.ID = "test-agent-2"
	server.registry.Register(ag)
	addParams := json.RawMessage(fmt.Sprintf(`{"teamId": "%s", "agentId": "test-agent-2"}`, teamInfo.ID))
	_, _ = handler.HandleCommand("add_agent_to_team", addParams, "test")

	// Remove agent from team
	params := json.RawMessage(fmt.Sprintf(`{"teamId": "%s", "agentId": "test-agent-2"}`, teamInfo.ID))
	result, err := handler.HandleCommand("remove_agent_from_team", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map[string]string, got %T", result)
	}
	if info["status"] != "removed" {
		t.Errorf("status = %v, want 'removed'", info["status"])
	}
}

// ==================== Tier 4: Workflow Handler Tests ====================

func TestCommandHandler_HandleListWorkflows_Empty(t *testing.T) {
	handler, server := newTestHandler()
	server.SetOrchestrator(swarm.NewOrchestrator(nil))

	result, err := handler.HandleCommand("list_workflows", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	workflows, ok := result.([]map[string]any)
	if !ok {
		t.Fatal("expected []map[string]any")
	}
	if len(workflows) != 0 {
		t.Errorf("expected 0 workflows, got %d", len(workflows))
	}
}

func TestCommandHandler_HandleCreateWorkflow_Success(t *testing.T) {
	handler, server := newTestHandler()
	server.SetOrchestrator(swarm.NewOrchestrator(nil))

	params := json.RawMessage(`{"name": "Test Workflow", "mode": "sequential"}`)
	result, err := handler.HandleCommand("create_workflow", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]any)
	if !ok {
		t.Fatal("expected map result")
	}
	if info["name"] != "Test Workflow" {
		t.Errorf("name = %v, want 'Test Workflow'", info["name"])
	}
	if info["status"] != "draft" {
		t.Errorf("status = %v, want 'draft'", info["status"])
	}
}

func TestCommandHandler_HandleGetWorkflow_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	// Create workflow first
	wf := orch.CreateWorkflow("Get Test", swarm.ModeSequential)

	params := json.RawMessage(fmt.Sprintf(`{"id": "%s"}`, wf.ID))
	result, err := handler.HandleCommand("get_workflow", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]any)
	if !ok {
		t.Fatal("expected map result")
	}
	if info["id"] != wf.ID {
		t.Errorf("id = %v, want %s", info["id"], wf.ID)
	}
}

func TestCommandHandler_HandleUpdateWorkflow_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	// Create workflow first
	wf := orch.CreateWorkflow("Update Test", swarm.ModeSequential)

	// Update workflow requires nested "workflow" object
	params := json.RawMessage(fmt.Sprintf(`{"id": "%s", "workflow": {"name": "Updated Name"}}`, wf.ID))
	result, err := handler.HandleCommand("update_workflow", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]any)
	if !ok {
		t.Fatal("expected map result")
	}
	if info["name"] != "Updated Name" {
		t.Errorf("name = %v, want 'Updated Name'", info["name"])
	}
}

func TestCommandHandler_HandleDeleteWorkflow_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	// Create workflow first
	wf := orch.CreateWorkflow("Delete Test", swarm.ModeSequential)

	params := json.RawMessage(fmt.Sprintf(`{"id": "%s"}`, wf.ID))
	result, err := handler.HandleCommand("delete_workflow", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map[string]string, got %T", result)
	}
	if info["status"] != "deleted" {
		t.Errorf("status = %v, want 'deleted'", info["status"])
	}
}

func TestCommandHandler_HandleAddWorkflowNode_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	// Create workflow first
	wf := orch.CreateWorkflow("Node Test", swarm.ModeSequential)

	// Uses "id" not "workflowId", and node is nested
	params := json.RawMessage(fmt.Sprintf(`{"id": "%s", "node": {"type": "agent", "name": "Test Node", "agentId": "test-agent"}}`, wf.ID))
	result, err := handler.HandleCommand("add_workflow_node", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]any)
	if !ok {
		t.Fatal("expected map result")
	}
	if info["name"] != "Test Node" {
		t.Errorf("name = %v, want 'Test Node'", info["name"])
	}
}

func TestCommandHandler_HandleGetWorkflowCheckpoints_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	// Create workflow first
	wf := orch.CreateWorkflow("Checkpoint Test", swarm.ModeSequential)

	// Uses "id" not "workflowId"
	params := json.RawMessage(fmt.Sprintf(`{"id": "%s"}`, wf.ID))
	result, err := handler.HandleCommand("get_workflow_checkpoints", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Returns []map[string]any
	_, ok := result.([]map[string]any)
	if !ok {
		t.Fatalf("expected []map[string]any, got %T", result)
	}
	// Empty is valid
}

func TestCommandHandler_HandleClearNodeCache_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	params := json.RawMessage(`{"nodeId": "test-node"}`)
	result, err := handler.HandleCommand("clear_node_cache", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map[string]string, got %T", result)
	}
	if info["status"] != "ok" {
		t.Errorf("status = %v, want 'ok'", info["status"])
	}
}

func TestCommandHandler_HandleClearAllCaches_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	result, err := handler.HandleCommand("clear_all_caches", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map[string]string, got %T", result)
	}
	if info["status"] != "ok" {
		t.Errorf("status = %v, want 'ok'", info["status"])
	}
}

// ==================== Execute Workflow Tests ====================

func TestCommandHandler_HandleExecuteWorkflow_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"missing id", json.RawMessage(`{}`)},
		{"empty id", json.RawMessage(`{"id": ""}`)},
		{"whitespace id", json.RawMessage(`{"id": "   "}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, _ := newTestHandler()
			_, err := handler.HandleCommand("execute_workflow", tt.params, "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleExecuteWorkflow_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()
	// No orchestrator set

	params := json.RawMessage(`{"id": "test-workflow"}`)
	_, err := handler.HandleCommand("execute_workflow", params, "test")
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

// ==================== Automation Handler Tests ====================

func TestCommandHandler_HandleListAuditEvents_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("list_audit_events", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

func TestCommandHandler_HandleListAuditEvents_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	result, err := handler.HandleCommand("list_audit_events", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Returns []map[string]any or similar
	_ = result
}

func TestCommandHandler_HandleGetAuditStats_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("get_audit_stats", nil, "test")
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

func TestCommandHandler_HandleGetAuditStats_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	result, err := handler.HandleCommand("get_audit_stats", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Returns stats
	_ = result
}

func TestCommandHandler_HandleClearAuditLog_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("clear_audit_log", nil, "test")
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

func TestCommandHandler_HandleClearAuditLog_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	params := json.RawMessage(`{"confirm": true}`)
	result, err := handler.HandleCommand("clear_audit_log", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map[string]any, got %T", result)
	}
	if info["success"] != true {
		t.Errorf("success = %v, want true", info["success"])
	}
}

// ==================== Schedule Runner Handler Tests ====================

func TestCommandHandler_HandleStartScheduleRunner_NoRunner(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("start_schedule_runner", nil, "test")
	if err == nil {
		t.Error("expected error for missing schedule runner")
	}
}

func TestCommandHandler_HandleStartScheduleRunner_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)
	runner := swarm.NewScheduleRunner(nil, orch, nil)
	server.SetScheduleRunner(runner)

	result, err := handler.HandleCommand("start_schedule_runner", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map[string]any, got %T", result)
	}
	if info["status"] != "running" {
		t.Errorf("status = %v, want 'running'", info["status"])
	}

	// Clean up
	runner.Stop()
}

func TestCommandHandler_HandleStopScheduleRunner_NoRunner(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("stop_schedule_runner", nil, "test")
	if err == nil {
		t.Error("expected error for missing schedule runner")
	}
}

func TestCommandHandler_HandleStopScheduleRunner_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)
	runner := swarm.NewScheduleRunner(nil, orch, nil)
	runner.Start()
	server.SetScheduleRunner(runner)

	result, err := handler.HandleCommand("stop_schedule_runner", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map[string]any, got %T", result)
	}
	if info["status"] != "stopped" {
		t.Errorf("status = %v, want 'stopped'", info["status"])
	}
}

func TestCommandHandler_HandleGetScheduleRunnerStatus_NoRunner(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("get_schedule_runner_status", nil, "test")
	if err == nil {
		t.Error("expected error for missing schedule runner")
	}
}

func TestCommandHandler_HandleGetScheduleRunnerStatus_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)
	runner := swarm.NewScheduleRunner(nil, orch, nil)
	server.SetScheduleRunner(runner)

	result, err := handler.HandleCommand("get_schedule_runner_status", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map[string]any, got %T", result)
	}
	if _, exists := info["status"]; !exists {
		t.Error("expected 'status' key in result")
	}
}

// ==================== Resume Workflow Handler Tests ====================

func TestCommandHandler_HandleResumeWorkflow_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"missing id", json.RawMessage(`{}`)},
		{"empty id", json.RawMessage(`{"id": ""}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, server := newTestHandler()
			orch := swarm.NewOrchestrator(nil)
			server.SetOrchestrator(orch)

			_, err := handler.HandleCommand("resume_workflow", tt.params, "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleResumeWorkflow_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	params := json.RawMessage(`{"id": "test-workflow"}`)
	_, err := handler.HandleCommand("resume_workflow", params, "test")
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

// ==================== Add Workflow Edge Handler Tests ====================

func TestCommandHandler_HandleAddWorkflowEdge_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"missing workflowId", json.RawMessage(`{"from": "a", "to": "b"}`)},
		{"missing from", json.RawMessage(`{"workflowId": "wf", "to": "b"}`)},
		{"missing to", json.RawMessage(`{"workflowId": "wf", "from": "a"}`)},
		{"empty workflowId", json.RawMessage(`{"workflowId": "", "from": "a", "to": "b"}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, server := newTestHandler()
			orch := swarm.NewOrchestrator(nil)
			server.SetOrchestrator(orch)

			_, err := handler.HandleCommand("add_workflow_edge", tt.params, "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleAddWorkflowEdge_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	params := json.RawMessage(`{"workflowId": "test-wf", "from": "a", "to": "b"}`)
	_, err := handler.HandleCommand("add_workflow_edge", params, "test")
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

func TestCommandHandler_HandleAddWorkflowEdge_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	// Create workflow and add nodes
	wf := orch.CreateWorkflow("Edge Test", swarm.ModeSequential)
	wf.AddNode(&swarm.WorkflowNode{ID: "node-a", Type: "agent"})
	wf.AddNode(&swarm.WorkflowNode{ID: "node-b", Type: "agent"})

	// Add edge
	params := json.RawMessage(fmt.Sprintf(`{"id": "%s", "edge": {"from": "node-a", "to": "node-b", "condition": "success", "label": "on success"}}`, wf.ID))
	result, err := handler.HandleCommand("add_workflow_edge", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]any)
	if !ok {
		t.Fatal("expected map result")
	}
	if info["from"] != "node-a" {
		t.Errorf("from = %v, want 'node-a'", info["from"])
	}
	if info["to"] != "node-b" {
		t.Errorf("to = %v, want 'node-b'", info["to"])
	}
	if info["condition"] != "success" {
		t.Errorf("condition = %v, want 'success'", info["condition"])
	}
	if info["label"] != "on success" {
		t.Errorf("label = %v, want 'on success'", info["label"])
	}
}

// ==================== Restore Workflow Tests ====================

func TestCommandHandler_HandleRestoreWorkflow_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"missing id", json.RawMessage(`{"checkpointId": "cp-1"}`)},
		{"empty id", json.RawMessage(`{"id": "", "checkpointId": "cp-1"}`)},
		{"whitespace id", json.RawMessage(`{"id": "   ", "checkpointId": "cp-1"}`)},
		{"missing checkpointId", json.RawMessage(`{"id": "wf-1"}`)},
		{"empty checkpointId", json.RawMessage(`{"id": "wf-1", "checkpointId": ""}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, server := newTestHandler()
			orch := swarm.NewOrchestrator(nil)
			server.SetOrchestrator(orch)

			_, err := handler.HandleCommand("restore_workflow", tt.params, "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleRestoreWorkflow_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	params := json.RawMessage(`{"id": "wf-1", "checkpointId": "cp-1"}`)
	_, err := handler.HandleCommand("restore_workflow", params, "test")
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

func TestCommandHandler_HandleRestoreWorkflow_NotFound(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	params := json.RawMessage(`{"id": "nonexistent-wf", "checkpointId": "cp-1"}`)
	_, err := handler.HandleCommand("restore_workflow", params, "test")
	if err == nil {
		t.Error("expected error for non-existent workflow/checkpoint")
	}
}

// ==================== Get Workflow Report Tests ====================

func TestCommandHandler_HandleGetWorkflowReport_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"missing id", json.RawMessage(`{}`)},
		{"empty id", json.RawMessage(`{"id": ""}`)},
		{"whitespace id", json.RawMessage(`{"id": "   "}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, server := newTestHandler()
			orch := swarm.NewOrchestrator(nil)
			server.SetOrchestrator(orch)

			_, err := handler.HandleCommand("get_workflow_report", tt.params, "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleGetWorkflowReport_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	params := json.RawMessage(`{"id": "wf-1"}`)
	_, err := handler.HandleCommand("get_workflow_report", params, "test")
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

func TestCommandHandler_HandleGetWorkflowReport_NotFound(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	params := json.RawMessage(`{"id": "nonexistent-wf"}`)
	_, err := handler.HandleCommand("get_workflow_report", params, "test")
	if err == nil {
		t.Error("expected error for non-existent workflow")
	}
}

// ==================== API Error Tests ====================

func TestAPIError_Error(t *testing.T) {
	err := NewAPIError(CodeNotFound, "resource not found")
	if err.Error() != "resource not found" {
		t.Errorf("Error() = %q, want 'resource not found'", err.Error())
	}
}

func TestAPIError_ErrorMethods(t *testing.T) {
	tests := []struct {
		name     string
		err      *APIError
		expected string
	}{
		{"not found", errNotFound("test resource"), "test resource"},
		{"validation", errValidation("invalid input"), "invalid input"},
		{"not connected", errNotConnected("service unavailable"), "service unavailable"},
		{"limit exceeded", errLimitExceeded("rate limit hit"), "rate limit hit"},
		{"unauthorized", errUnauthorized("access denied"), "access denied"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.err.Message != tt.expected {
				t.Errorf("Message = %q, want %q", tt.err.Message, tt.expected)
			}
			if tt.err.Error() != tt.expected {
				t.Errorf("Error() = %q, want %q", tt.err.Error(), tt.expected)
			}
		})
	}
}

func TestAPIError_Codes(t *testing.T) {
	tests := []struct {
		name     string
		err      *APIError
		expected int
	}{
		{"not found", errNotFound(""), CodeNotFound},
		{"validation", errValidation(""), CodeValidation},
		{"not connected", errNotConnected(""), CodeNotConnected},
		{"limit exceeded", errLimitExceeded(""), CodeLimitExceeded},
		{"unauthorized", errUnauthorized(""), CodeUnauthorized},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.err.Code != tt.expected {
				t.Errorf("Code = %d, want %d", tt.err.Code, tt.expected)
			}
		})
	}
}

// ==================== Emergence Service with Components Tests ====================

func TestEmergenceService_CollectHealthMetrics_WithScheduler(t *testing.T) {
	connMgr := acp.NewConnectionManager(nil)
	scheduler := swarm.NewScheduler(swarm.SchedulerConfig{}, connMgr)
	svc := NewEmergenceService(nil, scheduler, nil)

	data := svc.GetData()
	if data == nil {
		t.Fatal("GetData should return non-nil data")
	}

	// Should have health metrics from scheduler
	if data.Health.CollaborationIdx < 0 {
		t.Error("CollaborationIdx should be non-negative")
	}
}

func TestEmergenceService_CollectHealthMetrics_WithCoordinator(t *testing.T) {
	connMgr := acp.NewConnectionManager(nil)
	coordinator := swarm.NewCoordinator(swarm.CoordinatorConfig{}, connMgr)
	svc := NewEmergenceService(nil, nil, coordinator)

	data := svc.GetData()
	if data == nil {
		t.Fatal("GetData should return non-nil data")
	}

	// Should have health metrics from coordinator
	if data.Health.AgentUtilization < 0 {
		t.Error("AgentUtilization should be non-negative")
	}
}

func TestEmergenceService_CollectHealthMetrics_AllComponents(t *testing.T) {
	registry := agent.NewRegistry()
	lifecycle := agent.NewLifecycle(registry)
	supervisor := swarm.NewSupervisor(swarm.SupervisorConfig{}, registry, lifecycle)
	connMgr := acp.NewConnectionManager(nil)
	scheduler := swarm.NewScheduler(swarm.SchedulerConfig{}, connMgr)
	coordinator := swarm.NewCoordinator(swarm.CoordinatorConfig{}, connMgr)

	svc := NewEmergenceService(supervisor, scheduler, coordinator)

	data := svc.GetData()
	if data == nil {
		t.Fatal("GetData should return non-nil data")
	}

	// Should have health metrics from all components
	if data.Health.OverallScore < 0 {
		t.Error("OverallScore should be non-negative")
	}
}

func TestEmergenceService_CollectAgentNodes_WithSupervisor(t *testing.T) {
	registry := agent.NewRegistry()
	lifecycle := agent.NewLifecycle(registry)
	supervisor := swarm.NewSupervisor(swarm.SupervisorConfig{}, registry, lifecycle)
	svc := NewEmergenceService(supervisor, nil, nil)

	data := svc.GetData()
	if data == nil {
		t.Fatal("GetData should return non-nil data")
	}

	// Agents list should not be nil
	if data.Agents == nil {
		t.Error("Agents should not be nil")
	}
}

// ==================== WebSocket Server Setter Tests ====================

func TestWebSocketServer_AddSupervisor(t *testing.T) {
	server := newTestServer()
	server.supervisors = make(map[string]*swarm.Supervisor)
	registry := agent.NewRegistry()
	lifecycle := agent.NewLifecycle(registry)
	supervisor := swarm.NewSupervisor(swarm.SupervisorConfig{}, registry, lifecycle)

	server.AddSupervisor("test-sup", supervisor)
	// Should not panic
}

func TestWebSocketServer_RemoveSupervisor(t *testing.T) {
	server := newTestServer()
	server.supervisors = make(map[string]*swarm.Supervisor)
	registry := agent.NewRegistry()
	lifecycle := agent.NewLifecycle(registry)
	supervisor := swarm.NewSupervisor(swarm.SupervisorConfig{}, registry, lifecycle)

	server.AddSupervisor("test-sup", supervisor)
	server.RemoveSupervisor("test-sup")
	// Should not panic
}

func TestWebSocketServer_Hub(t *testing.T) {
	server := newTestServer()
	hub := server.Hub()
	if hub != nil {
		t.Error("Hub should be nil before Run()")
	}
}

func TestWebSocketServer_AddMCPClient(t *testing.T) {
	server := newTestServer()
	client := mcp.NewClient(&mcp.ClientConfig{Name: "test-mcp", Command: "echo"})
	server.AddMCPClient("test-mcp", client)

	// Verify client was added
	clients := server.ListMCPClients()
	if len(clients) != 1 {
		t.Errorf("expected 1 MCP client, got %d", len(clients))
	}
}

// ==================== workflowToMap Tests ====================

func TestWorkflowToMap_Nil(t *testing.T) {
	result := workflowToMap(nil)
	if result != nil {
		t.Error("workflowToMap(nil) should return nil")
	}
}

func TestWorkflowToMap_Basic(t *testing.T) {
	orch := swarm.NewOrchestrator(nil)
	w := orch.CreateWorkflow("test-wf", swarm.ModeSequential)
	w.SetDescription("test description")

	result := workflowToMap(w)

	if result == nil {
		t.Fatal("workflowToMap should return non-nil")
	}
	if result["name"] != "test-wf" {
		t.Errorf("name = %v, want 'test-wf'", result["name"])
	}
	if result["description"] != "test description" {
		t.Errorf("description = %v, want 'test description'", result["description"])
	}
	if result["mode"] != "sequential" {
		t.Errorf("mode = %v, want 'sequential'", result["mode"])
	}
	if result["status"] != "draft" {
		t.Errorf("status = %v, want 'draft'", result["status"])
	}
}

func TestWorkflowToMap_WithNodes(t *testing.T) {
	orch := swarm.NewOrchestrator(nil)
	w := orch.CreateWorkflow("test-wf", swarm.ModeParallel)

	// Add node with optional fields
	now := time.Now()
	w.AddNode(&swarm.WorkflowNode{
		ID:          "node-1",
		Name:        "Agent 1",
		AgentID:     "agent-1",
		Type:        "agent",
		Status:      swarm.TaskStatusRunning,
		Position:    swarm.Position{X: 100, Y: 200},
		SubgraphID:  "subgraph-1",
		Config:      map[string]any{"key": "value"},
		Result:      map[string]any{"output": "data"},
		StartedAt:   &now,
		CompletedAt: &now,
		DependsOn:   []string{"node-0"},
	})

	result := workflowToMap(w)

	nodes, ok := result["nodes"].([]map[string]any)
	if !ok || len(nodes) != 1 {
		t.Fatalf("expected 1 node, got %v", result["nodes"])
	}

	node := nodes[0]
	if node["id"] != "node-1" {
		t.Errorf("node id = %v, want 'node-1'", node["id"])
	}
	if node["subgraphId"] != "subgraph-1" {
		t.Error("subgraphId should be set")
	}
	if node["config"] == nil {
		t.Error("config should be set")
	}
	if node["result"] == nil {
		t.Error("result should be set")
	}
	if node["startedAt"] == nil {
		t.Error("startedAt should be set")
	}
	if node["completedAt"] == nil {
		t.Error("completedAt should be set")
	}
	if node["dependsOn"] == nil {
		t.Error("dependsOn should be set")
	}
}

func TestWorkflowToMap_WithInterruptFields(t *testing.T) {
	orch := swarm.NewOrchestrator(nil)
	w := orch.CreateWorkflow("interrupt-wf", swarm.ModeSequential)

	w.AddNode(&swarm.WorkflowNode{
		ID:              "interrupt-node",
		Type:            "agent",
		Interrupt:       true,
		InterruptBefore: true,
		InterruptAfter:  true,
		ResumeInput:     map[string]any{"input": "value"},
		InterruptActions: []swarm.InterruptAction{
			{ID: "approve", Label: "Approve"},
			{ID: "reject", Label: "Reject"},
		},
		ChosenAction: "approve",
	})

	result := workflowToMap(w)

	nodes := result["nodes"].([]map[string]any)
	node := nodes[0]

	if node["interrupt"] != true {
		t.Error("interrupt should be true")
	}
	if node["interruptBefore"] != true {
		t.Error("interruptBefore should be true")
	}
	if node["interruptAfter"] != true {
		t.Error("interruptAfter should be true")
	}
	if node["resumeInput"] == nil {
		t.Error("resumeInput should be set")
	}
	if node["interruptActions"] == nil {
		t.Error("interruptActions should be set")
	}
	if node["chosenAction"] != "approve" {
		t.Error("chosenAction should be 'approve'")
	}
}

func TestWorkflowToMap_WithEdges(t *testing.T) {
	orch := swarm.NewOrchestrator(nil)
	w := orch.CreateWorkflow("edge-wf", swarm.ModeSequential)

	w.AddNode(&swarm.WorkflowNode{ID: "n1", Type: "agent"})
	w.AddNode(&swarm.WorkflowNode{ID: "n2", Type: "agent"})
	w.AddEdge(&swarm.WorkflowEdge{
		ID:        "e1",
		From:      "n1",
		To:        "n2",
		Condition: "success",
		Label:     "on success",
	})

	result := workflowToMap(w)

	edges, ok := result["edges"].([]map[string]any)
	if !ok || len(edges) != 1 {
		t.Fatalf("expected 1 edge, got %v", result["edges"])
	}

	edge := edges[0]
	if edge["id"] != "e1" {
		t.Errorf("edge id = %v, want 'e1'", edge["id"])
	}
	if edge["from"] != "n1" {
		t.Errorf("edge from = %v, want 'n1'", edge["from"])
	}
	if edge["to"] != "n2" {
		t.Errorf("edge to = %v, want 'n2'", edge["to"])
	}
	if edge["condition"] != "success" {
		t.Errorf("edge condition = %v, want 'success'", edge["condition"])
	}
	if edge["label"] != "on success" {
		t.Errorf("edge label = %v, want 'on success'", edge["label"])
	}
}

func TestWorkflowToMap_InterruptedState(t *testing.T) {
	orch := swarm.NewOrchestrator(nil)
	w := orch.CreateWorkflow("interrupted-wf", swarm.ModeSequential)

	// Set interrupted state directly
	w.InterruptedNodeID = "node-2"
	w.InterruptPhase = "before"

	result := workflowToMap(w)

	if result["interruptedNodeId"] != "node-2" {
		t.Errorf("interruptedNodeId = %v, want 'node-2'", result["interruptedNodeId"])
	}
	if result["interruptPhase"] != "before" {
		t.Errorf("interruptPhase = %v, want 'before'", result["interruptPhase"])
	}
}

// ==================== File System Handler Tests ====================

func TestCommandHandler_HandleWriteFile_Success(t *testing.T) {
	handler, server := newTestHandler()
	tmpDir := t.TempDir()
	server.workspacePath = tmpDir

	params := json.RawMessage(`{"path": "subdir/test.txt", "content": "hello world"}`)
	result, err := handler.HandleCommand("write_file", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	resultMap, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map[string]string, got %T", result)
	}
	if resultMap["status"] != "written" {
		t.Errorf("expected status 'written', got %s", resultMap["status"])
	}

	// Verify file exists with correct content
	content, err := os.ReadFile(filepath.Join(tmpDir, "subdir", "test.txt"))
	if err != nil {
		t.Fatalf("failed to read created file: %v", err)
	}
	if string(content) != "hello world" {
		t.Errorf("expected content 'hello world', got %s", string(content))
	}
}

func TestCommandHandler_HandleWriteFile_EdgeCases(t *testing.T) {
	handler, server := newTestHandler()
	tmpDir := t.TempDir()
	server.workspacePath = tmpDir

	t.Run("path traversal attempt", func(t *testing.T) {
		params := json.RawMessage(`{"path": "../etc/passwd", "content": "malicious"}`)
		_, err := handler.HandleCommand("write_file", params, "test")
		if err == nil {
			t.Fatal("expected error for path traversal")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeValidation {
			t.Errorf("expected CodeValidation (%d), got %d", CodeValidation, apiErr.Code)
		}
		if !strings.Contains(apiErr.Message, "access denied") {
			t.Errorf("expected 'access denied' in message, got %s", apiErr.Message)
		}
	})

	t.Run("content too large", func(t *testing.T) {
		largeContent := strings.Repeat("x", 10*1024*1024+1) // 10MB + 1 byte
		params := map[string]interface{}{
			"path":    "large.txt",
			"content": largeContent,
		}
		paramsJSON, _ := json.Marshal(params)
		_, err := handler.HandleCommand("write_file", paramsJSON, "test")
		if err == nil {
			t.Fatal("expected error for content too large")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeValidation {
			t.Errorf("expected CodeValidation (%d), got %d", CodeValidation, apiErr.Code)
		}
		if !strings.Contains(apiErr.Message, "content too large") {
			t.Errorf("expected 'content too large' in message, got %s", apiErr.Message)
		}
	})

	t.Run("empty path", func(t *testing.T) {
		params := json.RawMessage(`{"path": "", "content": "test"}`)
		_, err := handler.HandleCommand("write_file", params, "test")
		if err == nil {
			t.Fatal("expected error for empty path")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeValidation {
			t.Errorf("expected CodeValidation (%d), got %d", CodeValidation, apiErr.Code)
		}
		if !strings.Contains(apiErr.Message, "path is required") {
			t.Errorf("expected 'path is required' in message, got %s", apiErr.Message)
		}
	})

	t.Run("workspace not configured", func(t *testing.T) {
		handlerNoWorkspace, serverNoWorkspace := newTestHandler()
		serverNoWorkspace.workspacePath = ""
		params := json.RawMessage(`{"path": "test.txt", "content": "test"}`)
		_, err := handlerNoWorkspace.HandleCommand("write_file", params, "test")
		if err == nil {
			t.Fatal("expected error for workspace not configured")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeNotConnected {
			t.Errorf("expected CodeNotConnected (%d), got %d", CodeNotConnected, apiErr.Code)
		}
		if !strings.Contains(apiErr.Message, "workspace not configured") {
			t.Errorf("expected 'workspace not configured' in message, got %s", apiErr.Message)
		}
	})
}

func TestCommandHandler_HandleListDir_Success(t *testing.T) {
	handler, server := newTestHandler()
	tmpDir := t.TempDir()
	server.workspacePath = tmpDir

	// Create test structure
	os.MkdirAll(filepath.Join(tmpDir, "subdir"), 0755)
	os.WriteFile(filepath.Join(tmpDir, "file.txt"), []byte("test"), 0644)

	params := json.RawMessage(`{"path": "."}`)
	result, err := handler.HandleCommand("list_dir", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	files, ok := result.([]FileInfo)
	if !ok {
		t.Fatalf("expected []FileInfo, got %T", result)
	}

	// Check that we have both the directory and file
	foundSubdir := false
	foundFile := false
	for _, f := range files {
		if f.Name == "subdir" && f.IsDirectory {
			foundSubdir = true
		}
		if f.Name == "file.txt" && !f.IsDirectory {
			foundFile = true
		}
	}
	if !foundSubdir {
		t.Error("expected to find 'subdir' directory")
	}
	if !foundFile {
		t.Error("expected to find 'file.txt' file")
	}
}

func TestCommandHandler_HandleListDir_EdgeCases(t *testing.T) {
	handler, server := newTestHandler()
	tmpDir := t.TempDir()
	server.workspacePath = tmpDir

	t.Run("path traversal", func(t *testing.T) {
		params := json.RawMessage(`{"path": "../.."}`)
		_, err := handler.HandleCommand("list_dir", params, "test")
		if err == nil {
			t.Fatal("expected error for path traversal")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeValidation {
			t.Errorf("expected CodeValidation (%d), got %d", CodeValidation, apiErr.Code)
		}
		if !strings.Contains(apiErr.Message, "access denied") {
			t.Errorf("expected 'access denied' in message, got %s", apiErr.Message)
		}
	})

	t.Run("workspace not configured", func(t *testing.T) {
		handlerNoWorkspace, serverNoWorkspace := newTestHandler()
		serverNoWorkspace.workspacePath = ""
		params := json.RawMessage(`{"path": "."}`)
		_, err := handlerNoWorkspace.HandleCommand("list_dir", params, "test")
		if err == nil {
			t.Fatal("expected error for workspace not configured")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeNotConnected {
			t.Errorf("expected CodeNotConnected (%d), got %d", CodeNotConnected, apiErr.Code)
		}
	})

	t.Run("non-existent path", func(t *testing.T) {
		params := json.RawMessage(`{"path": "nonexistent"}`)
		_, err := handler.HandleCommand("list_dir", params, "test")
		if err == nil {
			t.Fatal("expected error for non-existent path")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		// Could be validation (invalid path from EvalSymlinks) or internal error
		if apiErr.Code != CodeValidation && apiErr.Code != CodeInternalError {
			t.Errorf("expected CodeValidation or CodeInternalError, got %d", apiErr.Code)
		}
	})
}

func TestCommandHandler_HandleReadFile_Success(t *testing.T) {
	handler, server := newTestHandler()
	tmpDir := t.TempDir()
	server.workspacePath = tmpDir

	// Create test file
	expectedContent := "test file content\nwith multiple lines"
	os.WriteFile(filepath.Join(tmpDir, "test.txt"), []byte(expectedContent), 0644)

	params := json.RawMessage(`{"path": "test.txt"}`)
	result, err := handler.HandleCommand("read_file", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	resultMap, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map[string]string, got %T", result)
	}
	if resultMap["content"] != expectedContent {
		t.Errorf("expected content %q, got %q", expectedContent, resultMap["content"])
	}
}

func TestCommandHandler_HandleReadFile_EdgeCases(t *testing.T) {
	handler, server := newTestHandler()
	tmpDir := t.TempDir()
	server.workspacePath = tmpDir

	t.Run("directory instead of file", func(t *testing.T) {
		os.MkdirAll(filepath.Join(tmpDir, "mydir"), 0755)
		params := json.RawMessage(`{"path": "mydir"}`)
		_, err := handler.HandleCommand("read_file", params, "test")
		if err == nil {
			t.Fatal("expected error for directory")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeValidation {
			t.Errorf("expected CodeValidation (%d), got %d", CodeValidation, apiErr.Code)
		}
		if !strings.Contains(apiErr.Message, "directory") {
			t.Errorf("expected 'directory' in message, got %s", apiErr.Message)
		}
	})

	t.Run("path traversal", func(t *testing.T) {
		params := json.RawMessage(`{"path": "../etc/passwd"}`)
		_, err := handler.HandleCommand("read_file", params, "test")
		if err == nil {
			t.Fatal("expected error for path traversal")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		// Path traversal returns validation error (invalid path) when workspace checks fail
		if apiErr.Code != CodeValidation && apiErr.Code != CodeUnauthorized {
			t.Errorf("expected CodeValidation or CodeUnauthorized, got %d", apiErr.Code)
		}
	})

	t.Run("file too large", func(t *testing.T) {
		largeContent := make([]byte, 10*1024*1024+1) // 10MB + 1 byte
		os.WriteFile(filepath.Join(tmpDir, "large.txt"), largeContent, 0644)
		params := json.RawMessage(`{"path": "large.txt"}`)
		_, err := handler.HandleCommand("read_file", params, "test")
		if err == nil {
			t.Fatal("expected error for file too large")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeValidation {
			t.Errorf("expected CodeValidation (%d), got %d", CodeValidation, apiErr.Code)
		}
		if !strings.Contains(apiErr.Message, "file too large") {
			t.Errorf("expected 'file too large' in message, got %s", apiErr.Message)
		}
	})

	t.Run("empty path", func(t *testing.T) {
		params := json.RawMessage(`{"path": ""}`)
		_, err := handler.HandleCommand("read_file", params, "test")
		if err == nil {
			t.Fatal("expected error for empty path")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeValidation {
			t.Errorf("expected CodeValidation (%d), got %d", CodeValidation, apiErr.Code)
		}
	})

	t.Run("workspace not configured", func(t *testing.T) {
		handlerNoWorkspace, serverNoWorkspace := newTestHandler()
		serverNoWorkspace.workspacePath = ""
		params := json.RawMessage(`{"path": "test.txt"}`)
		_, err := handlerNoWorkspace.HandleCommand("read_file", params, "test")
		if err == nil {
			t.Fatal("expected error for workspace not configured")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeNotConnected {
			t.Errorf("expected CodeNotConnected (%d), got %d", CodeNotConnected, apiErr.Code)
		}
	})

	t.Run("file not found", func(t *testing.T) {
		params := json.RawMessage(`{"path": "nonexistent.txt"}`)
		_, err := handler.HandleCommand("read_file", params, "test")
		if err == nil {
			t.Fatal("expected error for file not found")
		}
		// Non-existent file returns validation error (invalid path)
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeValidation && apiErr.Code != CodeNotFound {
			t.Errorf("expected CodeValidation or CodeNotFound, got %d", apiErr.Code)
		}
	})
}

func TestCommandHandler_HandleExecuteTask_EdgeCases(t *testing.T) {
	handler, _ := newTestHandler()

	t.Run("missing swarmId", func(t *testing.T) {
		params := json.RawMessage(`{"taskId": "task-1"}`)
		_, err := handler.HandleCommand("execute_task", params, "test")
		if err == nil {
			t.Fatal("expected error for missing swarmId")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeValidation {
			t.Errorf("expected CodeValidation (%d), got %d", CodeValidation, apiErr.Code)
		}
		if !strings.Contains(apiErr.Message, "swarm id is required") {
			t.Errorf("expected 'swarm id is required' in message, got %s", apiErr.Message)
		}
	})

	t.Run("missing taskId", func(t *testing.T) {
		params := json.RawMessage(`{"swarmId": "swarm-1"}`)
		_, err := handler.HandleCommand("execute_task", params, "test")
		if err == nil {
			t.Fatal("expected error for missing taskId")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeValidation {
			t.Errorf("expected CodeValidation (%d), got %d", CodeValidation, apiErr.Code)
		}
		if !strings.Contains(apiErr.Message, "task id is required") {
			t.Errorf("expected 'task id is required' in message, got %s", apiErr.Message)
		}
	})

	t.Run("swarm not found", func(t *testing.T) {
		params := json.RawMessage(`{"swarmId": "nonexistent", "taskId": "task-1"}`)
		_, err := handler.HandleCommand("execute_task", params, "test")
		if err == nil {
			t.Fatal("expected error for swarm not found")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeNotFound {
			t.Errorf("expected CodeNotFound (%d), got %d", CodeNotFound, apiErr.Code)
		}
		if !strings.Contains(apiErr.Message, "swarm") || !strings.Contains(apiErr.Message, "not found") {
			t.Errorf("expected 'swarm ... not found' in message, got %s", apiErr.Message)
		}
	})

	t.Run("task not found in existing swarm", func(t *testing.T) {
		// Create a real swarm
		createParams := map[string]interface{}{
			"name":     "Test Swarm",
			"topology": "mesh",
			"strategy": "round_robin",
		}
		createParamsJSON, _ := json.Marshal(createParams)
		result, err := handler.HandleCommand("create_swarm", createParamsJSON, "test")
		if err != nil {
			t.Fatalf("failed to create swarm: %v", err)
		}
		swarmInfo := result.(SwarmInfo)

		params := json.RawMessage(`{"swarmId": "` + swarmInfo.ID + `", "taskId": "nonexistent-task"}`)
		_, err = handler.HandleCommand("execute_task", params, "test")
		if err == nil {
			t.Fatal("expected error for task not found")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeNotFound {
			t.Errorf("expected CodeNotFound (%d), got %d", CodeNotFound, apiErr.Code)
		}
		if !strings.Contains(apiErr.Message, "task") || !strings.Contains(apiErr.Message, "not found") {
			t.Errorf("expected 'task ... not found' in message, got %s", apiErr.Message)
		}
	})
}

func TestCommandHandler_HandleStopMCPServer_EdgeCases(t *testing.T) {
	handler, _ := newTestHandler()

	t.Run("missing serverId", func(t *testing.T) {
		params := json.RawMessage(`{}`)
		_, err := handler.HandleCommand("stop_mcp_server", params, "test")
		if err == nil {
			t.Fatal("expected error for missing serverId")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeValidation {
			t.Errorf("expected CodeValidation (%d), got %d", CodeValidation, apiErr.Code)
		}
		if !strings.Contains(apiErr.Message, "serverId is required") {
			t.Errorf("expected 'serverId is required' in message, got %s", apiErr.Message)
		}
	})

	t.Run("server not found", func(t *testing.T) {
		params := json.RawMessage(`{"serverId": "nonexistent-server"}`)
		_, err := handler.HandleCommand("stop_mcp_server", params, "test")
		if err == nil {
			t.Fatal("expected error for server not found")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeNotFound {
			t.Errorf("expected CodeNotFound (%d), got %d", CodeNotFound, apiErr.Code)
		}
		if !strings.Contains(apiErr.Message, "MCP server not found") {
			t.Errorf("expected 'MCP server not found' in message, got %s", apiErr.Message)
		}
	})

	t.Run("empty serverId", func(t *testing.T) {
		params := json.RawMessage(`{"serverId": "   "}`)
		_, err := handler.HandleCommand("stop_mcp_server", params, "test")
		if err == nil {
			t.Fatal("expected error for empty serverId")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeValidation {
			t.Errorf("expected CodeValidation (%d), got %d", CodeValidation, apiErr.Code)
		}
	})
}

func TestCommandHandler_HandleRestoreWorkflow_EdgeCases(t *testing.T) {
	handler, _ := newTestHandler()

	t.Run("missing workflow id", func(t *testing.T) {
		params := json.RawMessage(`{"checkpointId": "cp-1"}`)
		_, err := handler.HandleCommand("restore_workflow", params, "test")
		if err == nil {
			t.Fatal("expected error for missing workflow id")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeValidation {
			t.Errorf("expected CodeValidation (%d), got %d", CodeValidation, apiErr.Code)
		}
		if !strings.Contains(apiErr.Message, "workflow id is required") {
			t.Errorf("expected 'workflow id is required' in message, got %s", apiErr.Message)
		}
	})

	t.Run("empty workflow id", func(t *testing.T) {
		params := json.RawMessage(`{"id": "   ", "checkpointId": "cp-1"}`)
		_, err := handler.HandleCommand("restore_workflow", params, "test")
		if err == nil {
			t.Fatal("expected error for empty workflow id")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeValidation {
			t.Errorf("expected CodeValidation (%d), got %d", CodeValidation, apiErr.Code)
		}
	})

	t.Run("missing checkpoint id", func(t *testing.T) {
		params := json.RawMessage(`{"id": "wf-1"}`)
		_, err := handler.HandleCommand("restore_workflow", params, "test")
		if err == nil {
			t.Fatal("expected error for missing checkpoint id")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeValidation {
			t.Errorf("expected CodeValidation (%d), got %d", CodeValidation, apiErr.Code)
		}
		if !strings.Contains(apiErr.Message, "checkpoint id is required") {
			t.Errorf("expected 'checkpoint id is required' in message, got %s", apiErr.Message)
		}
	})

	t.Run("orchestrator not configured", func(t *testing.T) {
		params := json.RawMessage(`{"id": "wf-1", "checkpointId": "cp-1"}`)
		_, err := handler.HandleCommand("restore_workflow", params, "test")
		if err == nil {
			t.Fatal("expected error for orchestrator not configured")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeNotConnected {
			t.Errorf("expected CodeNotConnected (%d), got %d", CodeNotConnected, apiErr.Code)
		}
		if !strings.Contains(apiErr.Message, "orchestrator not configured") {
			t.Errorf("expected 'orchestrator not configured' in message, got %s", apiErr.Message)
		}
	})
}

func TestCommandHandler_HandleGetWorkflowReport_EdgeCases(t *testing.T) {
	handler, _ := newTestHandler()

	t.Run("missing workflow id", func(t *testing.T) {
		params := json.RawMessage(`{}`)
		_, err := handler.HandleCommand("get_workflow_report", params, "test")
		if err == nil {
			t.Fatal("expected error for missing workflow id")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeValidation {
			t.Errorf("expected CodeValidation (%d), got %d", CodeValidation, apiErr.Code)
		}
		if !strings.Contains(apiErr.Message, "workflow id is required") {
			t.Errorf("expected 'workflow id is required' in message, got %s", apiErr.Message)
		}
	})

	t.Run("empty workflow id", func(t *testing.T) {
		params := json.RawMessage(`{"id": "   "}`)
		_, err := handler.HandleCommand("get_workflow_report", params, "test")
		if err == nil {
			t.Fatal("expected error for empty workflow id")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeValidation {
			t.Errorf("expected CodeValidation (%d), got %d", CodeValidation, apiErr.Code)
		}
	})

	t.Run("orchestrator not configured", func(t *testing.T) {
		params := json.RawMessage(`{"id": "wf-1"}`)
		_, err := handler.HandleCommand("get_workflow_report", params, "test")
		if err == nil {
			t.Fatal("expected error for orchestrator not configured")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeNotConnected {
			t.Errorf("expected CodeNotConnected (%d), got %d", CodeNotConnected, apiErr.Code)
		}
	})

	t.Run("workflow with no report", func(t *testing.T) {
		// Create server with orchestrator
		registry := agent.NewRegistry()
		swarms := make(map[string]*swarm.Swarm)
		teamMgr := team.NewManagerWithDir("")
		mcpClients := make(map[string]*mcp.Client)

		server := &WebSocketServer{
			registry:    registry,
			connManager: nil,
			swarms:      swarms,
			teamManager: teamMgr,
			mcpClients:  mcpClients,
		}
		// Note: orchestrator is nil by default, so this test is same as "orchestrator not configured"
		// When orchestrator is configured but workflow has no report, it returns NotFound
		handlerWithOrch := NewCommandHandler(server)

		params := json.RawMessage(`{"id": "wf-no-report"}`)
		_, err := handlerWithOrch.HandleCommand("get_workflow_report", params, "test")
		if err == nil {
			t.Fatal("expected error")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		// With no orchestrator, should get NotConnected
		if apiErr.Code != CodeNotConnected {
			t.Errorf("expected CodeNotConnected (%d), got %d", CodeNotConnected, apiErr.Code)
		}
	})
}

// ==================== MCP Server Handler Tests ====================

func setupConfigDir(t *testing.T) (restore func()) {
	t.Helper()
	origDir := acp.ConfigDir
	tmpDir := t.TempDir()
	acp.ConfigDir = tmpDir
	return func() { acp.ConfigDir = origDir }
}

func TestCommandHandler_HandleAddMCPServer(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		restore := setupConfigDir(t)
		defer restore()

		handler, _ := newTestHandler()
		params := json.RawMessage(`{"config":{"name":"test-mcp","command":"npx","args":["-y","@modelcontextprotocol/server-test"]}}`)
		result, err := handler.HandleCommand("add_mcp_server", params, "test")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		m, ok := result.(map[string]any)
		if !ok {
			t.Fatalf("expected map, got %T", result)
		}
		if m["name"] != "test-mcp" {
			t.Errorf("expected name 'test-mcp', got %v", m["name"])
		}
		if m["status"] != "disconnected" {
			t.Errorf("expected status 'disconnected', got %v", m["status"])
		}
	})

	t.Run("missing name", func(t *testing.T) {
		restore := setupConfigDir(t)
		defer restore()

		handler, _ := newTestHandler()
		params := json.RawMessage(`{"config":{"command":"npx"}}`)
		_, err := handler.HandleCommand("add_mcp_server", params, "test")
		if err == nil {
			t.Fatal("expected error for missing name")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeValidation {
			t.Errorf("expected CodeValidation, got %d", apiErr.Code)
		}
	})

	t.Run("missing command", func(t *testing.T) {
		restore := setupConfigDir(t)
		defer restore()

		handler, _ := newTestHandler()
		params := json.RawMessage(`{"config":{"name":"test"}}`)
		_, err := handler.HandleCommand("add_mcp_server", params, "test")
		if err == nil {
			t.Fatal("expected error for missing command")
		}
	})

	t.Run("invalid json", func(t *testing.T) {
		restore := setupConfigDir(t)
		defer restore()

		handler, _ := newTestHandler()
		_, err := handler.HandleCommand("add_mcp_server", json.RawMessage(`{invalid}`), "test")
		if err == nil {
			t.Fatal("expected error for invalid json")
		}
	})

	t.Run("with env vars", func(t *testing.T) {
		restore := setupConfigDir(t)
		defer restore()

		handler, _ := newTestHandler()
		params := json.RawMessage(`{"config":{"name":"env-mcp","command":"node","env":{"API_KEY":"test123"}}}`)
		result, err := handler.HandleCommand("add_mcp_server", params, "test")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		m, ok := result.(map[string]any)
		if !ok {
			t.Fatalf("expected map, got %T", result)
		}
		if m["name"] != "env-mcp" {
			t.Errorf("expected name 'env-mcp', got %v", m["name"])
		}
	})
}

func TestCommandHandler_HandleRemoveMCPServer(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		restore := setupConfigDir(t)
		defer restore()

		handler, _ := newTestHandler()

		// First add a server
		addParams := json.RawMessage(`{"config":{"name":"remove-test","command":"npx"}}`)
		if _, err := handler.HandleCommand("add_mcp_server", addParams, "test"); err != nil {
			t.Fatalf("failed to add server: %v", err)
		}

		// Now remove it
		removeParams := json.RawMessage(`{"serverId":"remove-test"}`)
		result, err := handler.HandleCommand("remove_mcp_server", removeParams, "test")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		m, ok := result.(map[string]string)
		if !ok {
			t.Fatalf("expected map[string]string, got %T", result)
		}
		if m["status"] != "removed" {
			t.Errorf("expected status 'removed', got %s", m["status"])
		}
		if m["id"] != "remove-test" {
			t.Errorf("expected id 'remove-test', got %s", m["id"])
		}
	})

	t.Run("not found", func(t *testing.T) {
		restore := setupConfigDir(t)
		defer restore()

		handler, _ := newTestHandler()
		params := json.RawMessage(`{"serverId":"nonexistent"}`)
		_, err := handler.HandleCommand("remove_mcp_server", params, "test")
		if err == nil {
			t.Fatal("expected error for nonexistent server")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeNotFound {
			t.Errorf("expected CodeNotFound, got %d", apiErr.Code)
		}
	})

	t.Run("missing server id", func(t *testing.T) {
		restore := setupConfigDir(t)
		defer restore()

		handler, _ := newTestHandler()
		params := json.RawMessage(`{"serverId":"  "}`)
		_, err := handler.HandleCommand("remove_mcp_server", params, "test")
		if err == nil {
			t.Fatal("expected error for missing server id")
		}
	})

	t.Run("invalid json", func(t *testing.T) {
		restore := setupConfigDir(t)
		defer restore()

		handler, _ := newTestHandler()
		_, err := handler.HandleCommand("remove_mcp_server", json.RawMessage(`{invalid}`), "test")
		if err == nil {
			t.Fatal("expected error for invalid json")
		}
	})
}

// ==================== Agent Config Handler Tests ====================

func TestCommandHandler_HandleAddAgent(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		restore := setupConfigDir(t)
		defer restore()

		handler, _ := newTestHandler()
		params := json.RawMessage(`{"config":{"id":"test-agent","name":"Test Agent","command":"claude"}}`)
		result, err := handler.HandleCommand("add_agent", params, "test")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		m, ok := result.(map[string]any)
		if !ok {
			t.Fatalf("expected map, got %T", result)
		}
		if m["id"] != "test-agent" {
			t.Errorf("expected id 'test-agent', got %v", m["id"])
		}
		if m["name"] != "Test Agent" {
			t.Errorf("expected name 'Test Agent', got %v", m["name"])
		}
		if m["type"] != "acp" {
			t.Errorf("expected type 'acp', got %v", m["type"])
		}
	})

	t.Run("missing id", func(t *testing.T) {
		restore := setupConfigDir(t)
		defer restore()

		handler, _ := newTestHandler()
		params := json.RawMessage(`{"config":{"name":"Test"}}`)
		_, err := handler.HandleCommand("add_agent", params, "test")
		if err == nil {
			t.Fatal("expected error for missing id")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeValidation {
			t.Errorf("expected CodeValidation, got %d", apiErr.Code)
		}
	})

	t.Run("missing name", func(t *testing.T) {
		restore := setupConfigDir(t)
		defer restore()

		handler, _ := newTestHandler()
		params := json.RawMessage(`{"config":{"id":"test"}}`)
		_, err := handler.HandleCommand("add_agent", params, "test")
		if err == nil {
			t.Fatal("expected error for missing name")
		}
	})

	t.Run("id too long", func(t *testing.T) {
		restore := setupConfigDir(t)
		defer restore()

		handler, _ := newTestHandler()
		longID := strings.Repeat("a", 256)
		params := json.RawMessage(fmt.Sprintf(`{"config":{"id":"%s","name":"Test"}}`, longID))
		_, err := handler.HandleCommand("add_agent", params, "test")
		if err == nil {
			t.Fatal("expected error for too long id")
		}
	})

	t.Run("name too long", func(t *testing.T) {
		restore := setupConfigDir(t)
		defer restore()

		handler, _ := newTestHandler()
		longName := strings.Repeat("a", 256)
		params := json.RawMessage(fmt.Sprintf(`{"config":{"id":"test","name":"%s"}}`, longName))
		_, err := handler.HandleCommand("add_agent", params, "test")
		if err == nil {
			t.Fatal("expected error for too long name")
		}
	})

	t.Run("invalid json", func(t *testing.T) {
		restore := setupConfigDir(t)
		defer restore()

		handler, _ := newTestHandler()
		_, err := handler.HandleCommand("add_agent", json.RawMessage(`{invalid}`), "test")
		if err == nil {
			t.Fatal("expected error for invalid json")
		}
	})
}

func TestCommandHandler_HandleUpdateAgent(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		restore := setupConfigDir(t)
		defer restore()

		handler, _ := newTestHandler()

		// First add an agent
		addParams := json.RawMessage(`{"config":{"id":"upd-agent","name":"Original","command":"claude"}}`)
		if _, err := handler.HandleCommand("add_agent", addParams, "test"); err != nil {
			t.Fatalf("failed to add agent: %v", err)
		}

		// Now update it
		updateParams := json.RawMessage(`{"config":{"id":"upd-agent","name":"Updated","command":"claude","description":"updated desc"}}`)
		result, err := handler.HandleCommand("update_agent", updateParams, "test")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		m, ok := result.(map[string]any)
		if !ok {
			t.Fatalf("expected map, got %T", result)
		}
		if m["name"] != "Updated" {
			t.Errorf("expected name 'Updated', got %v", m["name"])
		}
	})

	t.Run("missing id", func(t *testing.T) {
		restore := setupConfigDir(t)
		defer restore()

		handler, _ := newTestHandler()
		params := json.RawMessage(`{"config":{"name":"Test"}}`)
		_, err := handler.HandleCommand("update_agent", params, "test")
		if err == nil {
			t.Fatal("expected error for missing id")
		}
	})

	t.Run("agent not found", func(t *testing.T) {
		restore := setupConfigDir(t)
		defer restore()

		handler, _ := newTestHandler()
		params := json.RawMessage(`{"config":{"id":"nonexistent","name":"Test"}}`)
		_, err := handler.HandleCommand("update_agent", params, "test")
		if err == nil {
			t.Fatal("expected error for nonexistent agent")
		}
	})

	t.Run("invalid json", func(t *testing.T) {
		restore := setupConfigDir(t)
		defer restore()

		handler, _ := newTestHandler()
		_, err := handler.HandleCommand("update_agent", json.RawMessage(`{invalid}`), "test")
		if err == nil {
			t.Fatal("expected error for invalid json")
		}
	})
}

func TestCommandHandler_HandleDeleteAgent(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		restore := setupConfigDir(t)
		defer restore()

		handler, _ := newTestHandler()

		// First add an agent
		addParams := json.RawMessage(`{"config":{"id":"del-agent","name":"Delete Me","command":"claude"}}`)
		if _, err := handler.HandleCommand("add_agent", addParams, "test"); err != nil {
			t.Fatalf("failed to add agent: %v", err)
		}

		// Now delete it
		deleteParams := json.RawMessage(`{"id":"del-agent"}`)
		result, err := handler.HandleCommand("delete_agent", deleteParams, "test")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		m, ok := result.(map[string]string)
		if !ok {
			t.Fatalf("expected map[string]string, got %T", result)
		}
		if m["status"] != "deleted" {
			t.Errorf("expected status 'deleted', got %s", m["status"])
		}
	})

	t.Run("missing id", func(t *testing.T) {
		restore := setupConfigDir(t)
		defer restore()

		handler, _ := newTestHandler()
		params := json.RawMessage(`{"id":""}`)
		_, err := handler.HandleCommand("delete_agent", params, "test")
		if err == nil {
			t.Fatal("expected error for missing id")
		}
	})

	t.Run("agent not found", func(t *testing.T) {
		restore := setupConfigDir(t)
		defer restore()

		handler, _ := newTestHandler()
		params := json.RawMessage(`{"id":"nonexistent"}`)
		_, err := handler.HandleCommand("delete_agent", params, "test")
		if err == nil {
			t.Fatal("expected error for nonexistent agent")
		}
	})

	t.Run("invalid json", func(t *testing.T) {
		restore := setupConfigDir(t)
		defer restore()

		handler, _ := newTestHandler()
		_, err := handler.HandleCommand("delete_agent", json.RawMessage(`{invalid}`), "test")
		if err == nil {
			t.Fatal("expected error for invalid json")
		}
	})
}

func TestCommandHandler_HandleGetAgents(t *testing.T) {
	handler, server := newTestHandler()

	// Register an agent in the registry
	a := agent.NewAgent("test-agent", agent.AgentTypeCoder)
	server.registry.Register(a)

	result, err := handler.HandleCommand("get_agents", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	arr, ok := result.([]AgentInfo)
	if !ok {
		t.Fatalf("expected []AgentInfo, got %T", result)
	}
	if len(arr) == 0 {
		t.Error("expected at least one agent")
	}

	// Find our agent by name (ID is auto-generated)
	found := false
	for _, info := range arr {
		if info.Name == "test-agent" {
			found = true
			if info.Type != string(agent.AgentTypeCoder) {
				t.Errorf("expected type 'coder', got %s", info.Type)
			}
			if info.State != string(agent.StateIdle) {
				t.Errorf("expected state 'idle', got %s", info.State)
			}
		}
	}
	if !found {
		t.Error("test-agent not found in results")
	}
}

func TestCommandHandler_HandleGetAgents_NilRegistry(t *testing.T) {
	server := &WebSocketServer{registry: nil}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("get_agents", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	arr, ok := result.([]AgentInfo)
	if !ok {
		t.Fatalf("expected []AgentInfo, got %T", result)
	}
	if len(arr) != 0 {
		t.Errorf("expected empty list for nil registry, got %d agents", len(arr))
	}
}

// ==================== Agent Handler Coverage Tests ====================

func TestCommandHandler_HandleGetAgent_Validation(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		name   string
		params string
	}{
		{"empty id", `{"id": ""}`},
		{"whitespace id", `{"id": "   "}`},
		{"missing id", `{}`},
		{"invalid json", `invalid`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := handler.HandleCommand("get_agent", json.RawMessage(tt.params), "test")
			if err == nil {
				t.Error("expected error")
			}
		})
	}
}

func TestCommandHandler_HandleGetAgent_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("get_agent", json.RawMessage(`{"id": "nonexistent-agent"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent agent")
	}
}

func TestCommandHandler_HandleGetAgent_NilRegistry(t *testing.T) {
	server := &WebSocketServer{registry: nil}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("get_agent", json.RawMessage(`{"id": "test-agent"}`), "test")
	if err == nil {
		t.Error("expected error when registry is nil")
	}
}

func TestCommandHandler_HandleGetAgent_Success(t *testing.T) {
	handler, server := newTestHandler()

	// Register an agent
	a := agent.NewAgent("test-get-agent", agent.AgentTypeCoder)
	server.registry.Register(a)

	result, err := handler.HandleCommand("get_agent", json.RawMessage(`{"id": "`+string(a.ID)+`"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(AgentInfo)
	if !ok {
		t.Fatalf("expected AgentInfo, got %T", result)
	}
	if info.Name != "test-get-agent" {
		t.Errorf("expected name 'test-get-agent', got %s", info.Name)
	}
}

func TestCommandHandler_HandleStartAgent_Validation(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		name   string
		params string
	}{
		{"empty id", `{"id": ""}`},
		{"whitespace id", `{"id": "   "}`},
		{"missing id", `{}`},
		{"invalid json", `invalid`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := handler.HandleCommand("start_agent", json.RawMessage(tt.params), "test")
			if err == nil {
				t.Error("expected error")
			}
		})
	}
}

func TestCommandHandler_HandleStartAgent_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("start_agent", json.RawMessage(`{"id": "nonexistent-agent"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent agent")
	}
}

func TestCommandHandler_HandleStartAgent_NilRegistry(t *testing.T) {
	server := &WebSocketServer{registry: nil}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("start_agent", json.RawMessage(`{"id": "test-agent"}`), "test")
	if err == nil {
		t.Error("expected error when registry is nil")
	}
}

func TestCommandHandler_HandleStartAgent_Success(t *testing.T) {
	handler, server := newTestHandler()

	// Register an agent
	a := agent.NewAgent("test-start-agent", agent.AgentTypeCoder)
	server.registry.Register(a)

	result, err := handler.HandleCommand("start_agent", json.RawMessage(`{"id": "`+string(a.ID)+`"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map[string]string, got %T", result)
	}
	if m["status"] != "started" {
		t.Errorf("expected status 'started', got %s", m["status"])
	}
}

func TestCommandHandler_HandleStopAgent_Validation(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		name   string
		params string
	}{
		{"empty id", `{"id": ""}`},
		{"whitespace id", `{"id": "   "}`},
		{"missing id", `{}`},
		{"invalid json", `invalid`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := handler.HandleCommand("stop_agent", json.RawMessage(tt.params), "test")
			if err == nil {
				t.Error("expected error")
			}
		})
	}
}

func TestCommandHandler_HandleStopAgent_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("stop_agent", json.RawMessage(`{"id": "nonexistent-agent"}`), "test")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if m, ok := result.(map[string]string); !ok || m["status"] != "stopped" {
		t.Errorf("expected stopped status, got %v", result)
	}
}

func TestCommandHandler_HandleStopAgent_NilRegistry(t *testing.T) {
	server := &WebSocketServer{registry: nil}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("stop_agent", json.RawMessage(`{"id": "test-agent"}`), "test")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if m, ok := result.(map[string]string); !ok || m["status"] != "stopped" {
		t.Errorf("expected stopped status, got %v", result)
	}
}

func TestCommandHandler_HandleStopAgent_Success(t *testing.T) {
	handler, server := newTestHandler()

	// Register an agent
	a := agent.NewAgent("test-stop-agent", agent.AgentTypeCoder)
	server.registry.Register(a)

	result, err := handler.HandleCommand("stop_agent", json.RawMessage(`{"id": "`+string(a.ID)+`"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map[string]string, got %T", result)
	}
	if m["status"] != "stopped" {
		t.Errorf("expected status 'stopped', got %s", m["status"])
	}
}

// ==================== Session Handler Coverage Tests ====================

func TestCommandHandler_HandleCreateSession_AgentNotConnected(t *testing.T) {
	handler, server := newTestHandler()
	// connManager is nil by default in newTestHandler, so set a non-nil one
	// that doesn't have the agent connected
	server.connManager = acp.NewConnectionManager(&acp.Config{})

	_, err := handler.HandleCommand("create_session", json.RawMessage(`{"agentId": "disconnected-agent"}`), "test")
	if err == nil {
		t.Error("expected error when agent is not connected")
	}
}

func TestCommandHandler_HandleCreateSession_Success(t *testing.T) {
	handler, server := newTestHandler()

	// Set up a real test connection
	cm := acp.NewConnectionManager(&acp.Config{})
	conn, _, cleanup := acp.NewTestConnection("test-agent")
	defer cleanup()
	cm.RegisterTestConnection(conn)
	server.connManager = cm

	result, err := handler.HandleCommand("create_session", json.RawMessage(`{"agentId": "test-agent", "mode": "editing"}`), "test")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	info, ok := result.(SessionInfo)
	if !ok {
		t.Fatal("expected SessionInfo result")
	}
	if info.AgentID != "test-agent" {
		t.Errorf("expected agentId test-agent, got %s", info.AgentID)
	}
	if info.Mode != "editing" {
		t.Errorf("expected mode editing, got %s", info.Mode)
	}
	if info.ID == "" {
		t.Error("expected non-empty session ID")
	}
	if info.CreatedAt == "" {
		t.Error("expected non-empty createdAt")
	}

	// Verify session -> agent mapping was stored
	server.mu.RLock()
	mapped, exists := server.sessionToAgent[info.ID]
	server.mu.RUnlock()
	if !exists {
		t.Error("expected session to agent mapping to be stored")
	}
	if mapped != "test-agent" {
		t.Errorf("expected mapped agent test-agent, got %s", mapped)
	}
}

func TestCommandHandler_HandleCreateSession_SessionModes(t *testing.T) {
	tests := []struct {
		mode string
	}{
		{"planning"},
		{"editing"},
		{"code"},
		{"reviewing"},
		{"review"},
		{"pair_driver"},
		{"pair_navigator"},
		{"swarm"},
		{"default"},
		{""},
	}

	for _, tt := range tests {
		t.Run("mode_"+tt.mode, func(t *testing.T) {
			handler, server := newTestHandler()
			cm := acp.NewConnectionManager(&acp.Config{})
			conn, _, cleanup := acp.NewTestConnection("mode-agent")
			defer cleanup()
			cm.RegisterTestConnection(conn)
			server.connManager = cm

			params := fmt.Sprintf(`{"agentId": "mode-agent", "mode": %q}`, tt.mode)
			result, err := handler.HandleCommand("create_session", json.RawMessage(params), "test")
			if err != nil {
				t.Fatalf("unexpected error for mode %q: %v", tt.mode, err)
			}
			if result == nil {
				t.Fatal("expected non-nil result")
			}
		})
	}
}

func TestCommandHandler_HandleCreateSession_MaxSessions(t *testing.T) {
	handler, server := newTestHandler()

	cm := acp.NewConnectionManager(&acp.Config{})
	conn, _, cleanup := acp.NewTestConnection("max-agent")
	defer cleanup()
	cm.RegisterTestConnection(conn)
	server.connManager = cm

	// Fill up sessionToAgent to maxSessions
	server.mu.Lock()
	server.sessionToAgent = make(map[string]string, maxSessions)
	for i := 0; i < maxSessions; i++ {
		server.sessionToAgent[fmt.Sprintf("sess-%d", i)] = "agent"
	}
	server.mu.Unlock()

	_, err := handler.HandleCommand("create_session", json.RawMessage(`{"agentId": "max-agent"}`), "test")
	if err == nil {
		t.Error("expected error when max sessions reached")
	}
	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		t.Errorf("expected APIError, got %T: %v", err, err)
	}
}

func TestCommandHandler_HandleSendMessage_NoConnManager(t *testing.T) {
	handler, server := newTestHandler()
	server.connManager = nil
	// Set up a session mapping
	server.sessionToAgent = map[string]string{"session-1": "agent-1"}

	_, err := handler.HandleCommand("send_message", json.RawMessage(`{"sessionId": "session-1", "message": "hello"}`), "test")
	if err == nil {
		t.Error("expected error when connManager is nil")
	}
}

func TestCommandHandler_HandleSendMessage_AgentNotConnected(t *testing.T) {
	handler, server := newTestHandler()
	// Set up a session mapping but no connected agent
	server.sessionToAgent = map[string]string{"session-1": "agent-1"}
	server.connManager = acp.NewConnectionManager(&acp.Config{})

	_, err := handler.HandleCommand("send_message", json.RawMessage(`{"sessionId": "session-1", "message": "hello"}`), "test")
	if err == nil {
		t.Error("expected error when agent is not connected")
	}
}

// ==================== Permission Handler Coverage Tests ====================

func TestCommandHandler_HandlePermissionResponse_NilPermissionManager(t *testing.T) {
	handler, server := newTestHandler()
	// teamManager exists but has no permission manager
	server.teamManager = team.NewManagerWithDir("")

	_, err := handler.HandleCommand("permission_response", json.RawMessage(`{"requestId": "r1", "approved": true, "resolvedBy": "user"}`), "test")
	if err == nil {
		t.Error("expected error when permission manager is nil")
	}
}

// ==================== Supervisor Handler Coverage Tests ====================

func TestCommandHandler_HandleGetSupervisorStats_WithAgents(t *testing.T) {
	handler, server := newTestHandler()

	// Register agents in different states
	idleAgent := agent.NewAgent("idle-agent", agent.AgentTypeCoder)
	server.registry.Register(idleAgent)

	thinkingAgent := agent.NewAgent("thinking-agent", agent.AgentTypeCoder)
	thinkingAgent.SetState(agent.StateThinking)
	server.registry.Register(thinkingAgent)

	errorAgent := agent.NewAgent("error-agent", agent.AgentTypeCoder)
	errorAgent.SetState(agent.StateError)
	server.registry.Register(errorAgent)

	result, err := handler.HandleCommand("get_supervisor_stats", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	stats, ok := result.(SupervisorStats)
	if !ok {
		t.Fatalf("expected SupervisorStats, got %T", result)
	}

	if stats.TotalAgents != 3 {
		t.Errorf("expected 3 total agents, got %d", stats.TotalAgents)
	}
	if stats.HealthyAgents != 2 {
		t.Errorf("expected 2 healthy agents (idle + thinking), got %d", stats.HealthyAgents)
	}
	if stats.BusyAgents != 1 {
		t.Errorf("expected 1 busy agent (thinking), got %d", stats.BusyAgents)
	}
	if stats.UnhealthyAgents != 1 {
		t.Errorf("expected 1 unhealthy agent (error), got %d", stats.UnhealthyAgents)
	}
}

func TestCommandHandler_HandleGetSupervisorStats_ExecutingAgent(t *testing.T) {
	handler, server := newTestHandler()

	// Register an executing agent
	executingAgent := agent.NewAgent("executing-agent", agent.AgentTypeCoder)
	executingAgent.SetState(agent.StateExecuting)
	server.registry.Register(executingAgent)

	result, err := handler.HandleCommand("get_supervisor_stats", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	stats, ok := result.(SupervisorStats)
	if !ok {
		t.Fatalf("expected SupervisorStats, got %T", result)
	}

	if stats.TotalAgents != 1 {
		t.Errorf("expected 1 total agent, got %d", stats.TotalAgents)
	}
	if stats.HealthyAgents != 1 {
		t.Errorf("expected 1 healthy agent, got %d", stats.HealthyAgents)
	}
	if stats.BusyAgents != 1 {
		t.Errorf("expected 1 busy agent, got %d", stats.BusyAgents)
	}
}

// ==================== Workflow Handler Validation Tests ====================

func TestCommandHandler_HandleListWorkflows_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("list_workflows", nil, "test")
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected APIError, got %T", err)
	}
	if apiErr.Code != CodeNotConnected {
		t.Errorf("expected CodeNotConnected, got %d", apiErr.Code)
	}
}

func TestCommandHandler_HandleCreateWorkflow_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"empty name", json.RawMessage(`{"name": ""}`)},
		{"whitespace name", json.RawMessage(`{"name": "   "}`)},
		{"name too long", json.RawMessage(fmt.Sprintf(`{"name": "%s"}`, strings.Repeat("a", 101)))},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, server := newTestHandler()
			orch := swarm.NewOrchestrator(nil)
			server.SetOrchestrator(orch)

			_, err := handler.HandleCommand("create_workflow", tt.params, "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleCreateWorkflow_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	params := json.RawMessage(`{"name": "Test Workflow"}`)
	_, err := handler.HandleCommand("create_workflow", params, "test")
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

func TestCommandHandler_HandleGetWorkflow_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"empty id", json.RawMessage(`{"id": ""}`)},
		{"whitespace id", json.RawMessage(`{"id": "   "}`)},
		{"missing id", json.RawMessage(`{}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, server := newTestHandler()
			orch := swarm.NewOrchestrator(nil)
			server.SetOrchestrator(orch)

			_, err := handler.HandleCommand("get_workflow", tt.params, "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleGetWorkflow_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	params := json.RawMessage(`{"id": "test-workflow"}`)
	_, err := handler.HandleCommand("get_workflow", params, "test")
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

func TestCommandHandler_HandleGetWorkflow_NotFound(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	params := json.RawMessage(`{"id": "nonexistent-workflow"}`)
	_, err := handler.HandleCommand("get_workflow", params, "test")
	if err == nil {
		t.Error("expected error for nonexistent workflow")
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected APIError, got %T", err)
	}
	if apiErr.Code != CodeNotFound {
		t.Errorf("expected CodeNotFound, got %d", apiErr.Code)
	}
}

func TestCommandHandler_HandleUpdateWorkflow_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"empty id", json.RawMessage(`{"id": "", "workflow": {"name": "Updated"}}`)},
		{"whitespace id", json.RawMessage(`{"id": "   ", "workflow": {"name": "Updated"}}`)},
		{"missing id", json.RawMessage(`{"workflow": {"name": "Updated"}}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, server := newTestHandler()
			orch := swarm.NewOrchestrator(nil)
			server.SetOrchestrator(orch)

			_, err := handler.HandleCommand("update_workflow", tt.params, "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleUpdateWorkflow_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	params := json.RawMessage(`{"id": "test-workflow", "workflow": {"name": "Updated"}}`)
	_, err := handler.HandleCommand("update_workflow", params, "test")
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

func TestCommandHandler_HandleUpdateWorkflow_NotFound(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	params := json.RawMessage(`{"id": "nonexistent-workflow", "workflow": {"name": "Updated"}}`)
	_, err := handler.HandleCommand("update_workflow", params, "test")
	if err == nil {
		t.Error("expected error for nonexistent workflow")
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected APIError, got %T", err)
	}
	if apiErr.Code != CodeNotFound {
		t.Errorf("expected CodeNotFound, got %d", apiErr.Code)
	}
}

func TestCommandHandler_HandleUpdateWorkflow_WithDescription(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	wf := orch.CreateWorkflow("Test", swarm.ModeSequential)

	params := json.RawMessage(fmt.Sprintf(`{"id": "%s", "workflow": {"name": "Updated Name", "description": "Updated Description"}}`, wf.ID))
	result, err := handler.HandleCommand("update_workflow", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]any)
	if !ok {
		t.Fatal("expected map result")
	}
	if info["name"] != "Updated Name" {
		t.Errorf("name = %v, want 'Updated Name'", info["name"])
	}
	if info["description"] != "Updated Description" {
		t.Errorf("description = %v, want 'Updated Description'", info["description"])
	}
}

func TestCommandHandler_HandleDeleteWorkflow_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"empty id", json.RawMessage(`{"id": ""}`)},
		{"whitespace id", json.RawMessage(`{"id": "   "}`)},
		{"missing id", json.RawMessage(`{}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, server := newTestHandler()
			orch := swarm.NewOrchestrator(nil)
			server.SetOrchestrator(orch)

			_, err := handler.HandleCommand("delete_workflow", tt.params, "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleDeleteWorkflow_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	params := json.RawMessage(`{"id": "test-workflow"}`)
	_, err := handler.HandleCommand("delete_workflow", params, "test")
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

func TestCommandHandler_HandleDeleteWorkflow_NotFound(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	params := json.RawMessage(`{"id": "nonexistent-workflow"}`)
	_, err := handler.HandleCommand("delete_workflow", params, "test")
	if err == nil {
		t.Error("expected error for nonexistent workflow")
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected APIError, got %T", err)
	}
	if apiErr.Code != CodeNotFound {
		t.Errorf("expected CodeNotFound, got %d", apiErr.Code)
	}
}

func TestCommandHandler_HandleExecuteWorkflow_NotFound(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	params := json.RawMessage(`{"id": "nonexistent-workflow"}`)
	_, err := handler.HandleCommand("execute_workflow", params, "test")
	if err == nil {
		t.Error("expected error for nonexistent workflow")
	}
}

func TestCommandHandler_HandleGetWorkflowCheckpoints_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"empty id", json.RawMessage(`{"id": ""}`)},
		{"whitespace id", json.RawMessage(`{"id": "   "}`)},
		{"missing id", json.RawMessage(`{}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, server := newTestHandler()
			orch := swarm.NewOrchestrator(nil)
			server.SetOrchestrator(orch)

			_, err := handler.HandleCommand("get_workflow_checkpoints", tt.params, "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleGetWorkflowCheckpoints_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	params := json.RawMessage(`{"id": "test-workflow"}`)
	_, err := handler.HandleCommand("get_workflow_checkpoints", params, "test")
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

func TestCommandHandler_HandleClearNodeCache_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"empty nodeId", json.RawMessage(`{"nodeId": ""}`)},
		{"whitespace nodeId", json.RawMessage(`{"nodeId": "   "}`)},
		{"missing nodeId", json.RawMessage(`{}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, server := newTestHandler()
			orch := swarm.NewOrchestrator(nil)
			server.SetOrchestrator(orch)

			_, err := handler.HandleCommand("clear_node_cache", tt.params, "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleClearNodeCache_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	params := json.RawMessage(`{"nodeId": "test-node"}`)
	_, err := handler.HandleCommand("clear_node_cache", params, "test")
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

func TestCommandHandler_HandleClearAllCaches_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("clear_all_caches", nil, "test")
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

func TestCommandHandler_HandleAddWorkflowNode_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"empty workflow id", json.RawMessage(`{"id": "", "node": {"name": "Test Node"}}`)},
		{"whitespace workflow id", json.RawMessage(`{"id": "   ", "node": {"name": "Test Node"}}`)},
		{"empty node name", json.RawMessage(`{"id": "wf-1", "node": {"name": ""}}`)},
		{"whitespace node name", json.RawMessage(`{"id": "wf-1", "node": {"name": "   "}}`)},
		{"missing workflow id", json.RawMessage(`{"node": {"name": "Test Node"}}`)},
		{"missing node name", json.RawMessage(`{"id": "wf-1"}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, server := newTestHandler()
			orch := swarm.NewOrchestrator(nil)
			server.SetOrchestrator(orch)

			_, err := handler.HandleCommand("add_workflow_node", tt.params, "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleAddWorkflowNode_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	params := json.RawMessage(`{"id": "test-workflow", "node": {"name": "Test Node"}}`)
	_, err := handler.HandleCommand("add_workflow_node", params, "test")
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

func TestCommandHandler_HandleAddWorkflowNode_WorkflowNotFound(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	params := json.RawMessage(`{"id": "nonexistent-workflow", "node": {"name": "Test Node"}}`)
	_, err := handler.HandleCommand("add_workflow_node", params, "test")
	if err == nil {
		t.Error("expected error for nonexistent workflow")
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected APIError, got %T", err)
	}
	if apiErr.Code != CodeNotFound {
		t.Errorf("expected CodeNotFound, got %d", apiErr.Code)
	}
}

func TestCommandHandler_HandleAddWorkflowNode_WithCustomType(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	wf := orch.CreateWorkflow("Node Type Test", swarm.ModeSequential)

	params := json.RawMessage(fmt.Sprintf(`{"id": "%s", "node": {"type": "condition", "name": "Condition Node", "agentId": "test-agent"}}`, wf.ID))
	result, err := handler.HandleCommand("add_workflow_node", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]any)
	if !ok {
		t.Fatal("expected map result")
	}
	if info["type"] != "condition" {
		t.Errorf("type = %v, want 'condition'", info["type"])
	}
}

func TestCommandHandler_HandleAddWorkflowEdge_WorkflowNotFound(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	params := json.RawMessage(`{"id": "nonexistent-workflow", "edge": {"from": "node-a", "to": "node-b"}}`)
	_, err := handler.HandleCommand("add_workflow_edge", params, "test")
	if err == nil {
		t.Error("expected error for nonexistent workflow")
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected APIError, got %T", err)
	}
	if apiErr.Code != CodeNotFound {
		t.Errorf("expected CodeNotFound, got %d", apiErr.Code)
	}
}

func TestCommandHandler_HandleResumeWorkflow_Error(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	// Try to resume a non-existent workflow
	params := json.RawMessage(`{"id": "nonexistent-workflow", "input": {}}`)
	_, err := handler.HandleCommand("resume_workflow", params, "test")
	if err == nil {
		t.Error("expected error for nonexistent workflow")
	}
}

// ==================== Additional Swarm Handler Coverage Tests ====================

func TestCommandHandler_HandleGetSwarms_WithSwarms(t *testing.T) {
	handler, server := newTestHandler()

	// Create and add swarms
	cfg1 := swarm.SwarmConfig{ID: "swarm-1", Name: "Test Swarm 1", Topology: swarm.TopologyMesh}
	cfg2 := swarm.SwarmConfig{ID: "swarm-2", Name: "Test Swarm 2", Topology: swarm.TopologyStar}
	sw1 := swarm.NewSwarm(cfg1)
	sw2 := swarm.NewSwarm(cfg2)
	server.AddSwarm("swarm-1", sw1)
	server.AddSwarm("swarm-2", sw2)

	result, err := handler.HandleCommand("get_swarms", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	swarms, ok := result.([]SwarmInfo)
	if !ok {
		t.Fatalf("expected []SwarmInfo, got %T", result)
	}
	if len(swarms) != 2 {
		t.Errorf("expected 2 swarms, got %d", len(swarms))
	}

	// Verify swarm data
	foundSwarm1 := false
	foundSwarm2 := false
	for _, s := range swarms {
		if s.ID == "swarm-1" {
			foundSwarm1 = true
			if s.Name != "Test Swarm 1" {
				t.Errorf("swarm-1 name = %q, want 'Test Swarm 1'", s.Name)
			}
		}
		if s.ID == "swarm-2" {
			foundSwarm2 = true
			if s.Name != "Test Swarm 2" {
				t.Errorf("swarm-2 name = %q, want 'Test Swarm 2'", s.Name)
			}
		}
	}
	if !foundSwarm1 {
		t.Error("swarm-1 not found in results")
	}
	if !foundSwarm2 {
		t.Error("swarm-2 not found in results")
	}
}

func TestCommandHandler_HandleCreateSwarm_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"empty name", json.RawMessage(`{"name": "", "topology": "mesh"}`)},
		{"whitespace name", json.RawMessage(`{"name": "   ", "topology": "mesh"}`)},
		{"missing name", json.RawMessage(`{"topology": "mesh"}`)},
		{"name too long", json.RawMessage(fmt.Sprintf(`{"name": "%s", "topology": "mesh"}`, strings.Repeat("a", 101)))},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, _ := newTestHandler()
			_, err := handler.HandleCommand("create_swarm", tt.params, "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleStartSwarm_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"empty id", json.RawMessage(`{"id": ""}`)},
		{"whitespace id", json.RawMessage(`{"id": "   "}`)},
		{"missing id", json.RawMessage(`{}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, _ := newTestHandler()
			_, err := handler.HandleCommand("start_swarm", tt.params, "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleStartSwarm_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("start_swarm", json.RawMessage(`{"id": "nonexistent"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent swarm")
	}
}

func TestCommandHandler_HandleStopSwarm_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"empty id", json.RawMessage(`{"id": ""}`)},
		{"whitespace id", json.RawMessage(`{"id": "   "}`)},
		{"missing id", json.RawMessage(`{}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, _ := newTestHandler()
			_, err := handler.HandleCommand("stop_swarm", tt.params, "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleStopSwarm_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("stop_swarm", json.RawMessage(`{"id": "nonexistent"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent swarm")
	}
}

func TestCommandHandler_HandleGetSwarmTasks_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"empty swarmId", json.RawMessage(`{"swarmId": ""}`)},
		{"whitespace swarmId", json.RawMessage(`{"swarmId": "   "}`)},
		{"missing swarmId", json.RawMessage(`{}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, _ := newTestHandler()
			_, err := handler.HandleCommand("get_swarm_tasks", tt.params, "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleGetSwarmTasks_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("get_swarm_tasks", json.RawMessage(`{"swarmId": "nonexistent"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent swarm")
	}
}

func TestCommandHandler_HandleSubmitTask_Validation(t *testing.T) {
	longTitle := strings.Repeat("a", 201)
	longDesc := strings.Repeat("b", 5001)

	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"empty swarmId", json.RawMessage(`{"swarmId": "", "title": "test"}`)},
		{"missing swarmId", json.RawMessage(`{"title": "test"}`)},
		{"title too long", json.RawMessage(fmt.Sprintf(`{"swarmId": "swarm-1", "title": "%s"}`, longTitle))},
		{"description too long", json.RawMessage(fmt.Sprintf(`{"swarmId": "swarm-1", "title": "test", "description": "%s"}`, longDesc))},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, _ := newTestHandler()
			_, err := handler.HandleCommand("submit_task", tt.params, "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleSubmitTask_SwarmNotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("submit_task", json.RawMessage(`{"swarmId": "nonexistent", "title": "test task"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent swarm")
	}
}

func TestCommandHandler_HandleSubmitTask_WithPriority(t *testing.T) {
	handler, server := newTestHandler()

	cfg := swarm.SwarmConfig{ID: "swarm-priority", Name: "Priority Test"}
	sw := swarm.NewSwarm(cfg)
	server.AddSwarm(cfg.ID, sw)

	params := json.RawMessage(`{"swarmId": "swarm-priority", "title": "High Priority Task", "description": "test", "priority": "high"}`)
	result, err := handler.HandleCommand("submit_task", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(TaskInfo)
	if !ok {
		t.Fatalf("expected TaskInfo, got %T", result)
	}
	if info.Title != "High Priority Task" {
		t.Errorf("title = %v, want 'High Priority Task'", info.Title)
	}
}

// ==================== Additional Team Handler Coverage Tests ====================

func TestCommandHandler_HandleGetTeams_NilTeamManager(t *testing.T) {
	server := &WebSocketServer{teamManager: nil}
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("get_teams", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	teams, ok := result.([]TeamInfo)
	if !ok {
		t.Fatalf("expected []TeamInfo, got %T", result)
	}
	if len(teams) != 0 {
		t.Errorf("expected empty list for nil teamManager, got %d teams", len(teams))
	}
}

func TestCommandHandler_HandleGetTeams_WithTeams(t *testing.T) {
	handler, _ := newTestHandler()

	// Create teams via the handler
	_, err := handler.HandleCommand("create_team", json.RawMessage(`{"name": "Team Alpha", "ownerId": "owner-1"}`), "test")
	if err != nil {
		t.Fatalf("failed to create team 1: %v", err)
	}
	_, err = handler.HandleCommand("create_team", json.RawMessage(`{"name": "Team Beta", "ownerId": "owner-2"}`), "test")
	if err != nil {
		t.Fatalf("failed to create team 2: %v", err)
	}

	result, err := handler.HandleCommand("get_teams", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	teams, ok := result.([]TeamInfo)
	if !ok {
		t.Fatalf("expected []TeamInfo, got %T", result)
	}
	if len(teams) != 2 {
		t.Errorf("expected 2 teams, got %d", len(teams))
	}

	// Verify team names exist
	foundAlpha := false
	foundBeta := false
	for _, team := range teams {
		if team.Name == "Team Alpha" {
			foundAlpha = true
		}
		if team.Name == "Team Beta" {
			foundBeta = true
		}
	}
	if !foundAlpha {
		t.Error("Team Alpha not found")
	}
	if !foundBeta {
		t.Error("Team Beta not found")
	}
}

func TestCommandHandler_HandleCreateTeam_Validation(t *testing.T) {
	longName := strings.Repeat("a", 101)
	longDesc := strings.Repeat("b", 5001)

	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"empty name", json.RawMessage(`{"name": "", "ownerId": "owner-1"}`)},
		{"missing name", json.RawMessage(`{"ownerId": "owner-1"}`)},
		{"empty ownerId", json.RawMessage(`{"name": "Test Team", "ownerId": ""}`)},
		{"missing ownerId", json.RawMessage(`{"name": "Test Team"}`)},
		{"name too long", json.RawMessage(fmt.Sprintf(`{"name": "%s", "ownerId": "owner-1"}`, longName))},
		{"description too long", json.RawMessage(fmt.Sprintf(`{"name": "Test", "ownerId": "owner-1", "description": "%s"}`, longDesc))},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, _ := newTestHandler()
			_, err := handler.HandleCommand("create_team", tt.params, "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleCreateTeam_NilTeamManager(t *testing.T) {
	server := &WebSocketServer{teamManager: nil}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("create_team", json.RawMessage(`{"name": "Test", "ownerId": "owner-1"}`), "test")
	if err == nil {
		t.Error("expected error for nil teamManager")
	}
}

func TestCommandHandler_HandleDeleteTeam_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"empty id", json.RawMessage(`{"id": ""}`)},
		{"whitespace id", json.RawMessage(`{"id": "   "}`)},
		{"missing id", json.RawMessage(`{}`)},
		{"id too long", json.RawMessage(fmt.Sprintf(`{"id": "%s"}`, strings.Repeat("a", 129)))},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, _ := newTestHandler()
			_, err := handler.HandleCommand("delete_team", tt.params, "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleDeleteTeam_NilTeamManager(t *testing.T) {
	server := &WebSocketServer{teamManager: nil}
	handler := NewCommandHandler(server)

	_, err := handler.HandleCommand("delete_team", json.RawMessage(`{"id": "team-1"}`), "test")
	if err == nil {
		t.Error("expected error for nil teamManager")
	}
}

func TestCommandHandler_HandleAddAgentToTeam_Validation(t *testing.T) {
	longID := strings.Repeat("a", 129)

	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"empty teamId", json.RawMessage(`{"teamId": "", "agentId": "agent-1"}`)},
		{"empty agentId", json.RawMessage(`{"teamId": "team-1", "agentId": ""}`)},
		{"missing teamId", json.RawMessage(`{"agentId": "agent-1"}`)},
		{"missing agentId", json.RawMessage(`{"teamId": "team-1"}`)},
		{"teamId too long", json.RawMessage(fmt.Sprintf(`{"teamId": "%s", "agentId": "agent-1"}`, longID))},
		{"agentId too long", json.RawMessage(fmt.Sprintf(`{"teamId": "team-1", "agentId": "%s"}`, longID))},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, _ := newTestHandler()
			_, err := handler.HandleCommand("add_agent_to_team", tt.params, "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleAddAgentToTeam_TeamNotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("add_agent_to_team", json.RawMessage(`{"teamId": "nonexistent", "agentId": "agent-1"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent team")
	}
}

func TestCommandHandler_HandleAddAgentToTeam_AgentNotFound(t *testing.T) {
	handler, _ := newTestHandler()

	// Create team first
	_, err := handler.HandleCommand("create_team", json.RawMessage(`{"name": "Test Team", "ownerId": "owner-1"}`), "test")
	if err != nil {
		t.Fatalf("failed to create team: %v", err)
	}

	// Get the team ID
	tm := handler.server.TeamManager()
	teams := tm.ListTeams()
	if len(teams) == 0 {
		t.Fatal("no teams created")
	}
	teamID := teams[0].ID

	_, err = handler.HandleCommand("add_agent_to_team", json.RawMessage(fmt.Sprintf(`{"teamId": "%s", "agentId": "nonexistent"}`, teamID)), "test")
	if err == nil {
		t.Error("expected error for nonexistent agent")
	}
}

func TestCommandHandler_HandleRemoveAgentFromTeam_Validation(t *testing.T) {
	longID := strings.Repeat("a", 129)

	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"empty teamId", json.RawMessage(`{"teamId": "", "agentId": "agent-1"}`)},
		{"empty agentId", json.RawMessage(`{"teamId": "team-1", "agentId": ""}`)},
		{"missing teamId", json.RawMessage(`{"agentId": "agent-1"}`)},
		{"missing agentId", json.RawMessage(`{"teamId": "team-1"}`)},
		{"teamId too long", json.RawMessage(fmt.Sprintf(`{"teamId": "%s", "agentId": "agent-1"}`, longID))},
		{"agentId too long", json.RawMessage(fmt.Sprintf(`{"teamId": "team-1", "agentId": "%s"}`, longID))},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, _ := newTestHandler()
			_, err := handler.HandleCommand("remove_agent_from_team", tt.params, "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleRemoveAgentFromTeam_TeamNotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("remove_agent_from_team", json.RawMessage(`{"teamId": "nonexistent", "agentId": "agent-1"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent team")
	}
}

// ==================== Additional MCP Handler Coverage Tests ====================

func TestCommandHandler_HandleStartMCPServer_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"empty serverId", json.RawMessage(`{"serverId": ""}`)},
		{"whitespace serverId", json.RawMessage(`{"serverId": "   "}`)},
		{"missing serverId", json.RawMessage(`{}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, _ := newTestHandler()
			_, err := handler.HandleCommand("start_mcp_server", tt.params, "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleStartMCPServer_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("start_mcp_server", json.RawMessage(`{"serverId": "nonexistent"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent server")
	}
}

// ==================== Additional Emergence Handler Coverage Tests ====================

func TestCommandHandler_HandleGetEmergenceData_WithSwarms(t *testing.T) {
	handler, server := newTestHandler()

	// Create and add swarms with agents
	cfg := swarm.SwarmConfig{ID: "emergence-swarm", Name: "Emergence Test", Topology: swarm.TopologyMesh}
	sw := swarm.NewSwarm(cfg)

	// Add agents to the swarm
	ag1 := agent.NewAgent("Agent 1", agent.AgentTypeWorker)
	ag1.ID = "agent-1"
	ag2 := agent.NewAgent("Agent 2", agent.AgentTypeWorker)
	ag2.ID = "agent-2"
	sw.AddAgent(ag1)
	sw.AddAgent(ag2)

	server.AddSwarm("emergence-swarm", sw)

	result, err := handler.HandleCommand("get_emergence_data", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	data, ok := result.(EmergenceData)
	if !ok {
		t.Fatalf("expected EmergenceData, got %T", result)
	}

	// Should have coordinator and agent nodes
	if len(data.Agents) < 1 {
		t.Error("expected at least one agent node (coordinator)")
	}

	// Should have flows
	if len(data.Flows) < 1 {
		t.Error("expected at least one task flow")
	}

	// Health metrics should be computed from swarm data
	// With 2 idle agents and no tasks: utilization=0, overallScore=0
	if data.Health.AgentUtilization != 0 {
		t.Errorf("expected 0 utilization for idle swarm, got %f", data.Health.AgentUtilization)
	}
	if data.Health.CongestionLevel != 0 {
		t.Errorf("expected 0 congestion for idle swarm, got %f", data.Health.CongestionLevel)
	}
}

// ==================== Get/Delete Swarm Handler Coverage Tests ====================

func TestCommandHandler_HandleGetSwarm_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"empty id", json.RawMessage(`{"id": ""}`)},
		{"whitespace id", json.RawMessage(`{"id": "   "}`)},
		{"missing id", json.RawMessage(`{}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, _ := newTestHandler()
			_, err := handler.HandleCommand("get_swarm", tt.params, "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleDeleteSwarm_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"empty id", json.RawMessage(`{"id": ""}`)},
		{"whitespace id", json.RawMessage(`{"id": "   "}`)},
		{"missing id", json.RawMessage(`{}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, _ := newTestHandler()
			_, err := handler.HandleCommand("delete_swarm", tt.params, "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleDeleteSwarm_Success(t *testing.T) {
	handler, server := newTestHandler()

	cfg := swarm.SwarmConfig{ID: "delete-swarm", Name: "Delete Test"}
	sw := swarm.NewSwarm(cfg)
	server.AddSwarm(cfg.ID, sw)

	params := json.RawMessage(`{"id": "delete-swarm"}`)
	result, err := handler.HandleCommand("delete_swarm", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map[string]string, got %T", result)
	}
	if info["status"] != "deleted" {
		t.Errorf("status = %v, want 'deleted'", info["status"])
	}

	// Verify swarm was deleted
	if _, exists := server.GetSwarm("delete-swarm"); exists {
		t.Error("swarm should have been deleted")
	}
}

// ==================== Round 4799: Additional Coverage ====================

func TestCommandHandler_HandleGetTeams_WithConnManager(t *testing.T) {
	server := newTestServer()
	// Set a non-nil connManager to cover the connManager != nil branch
	server.connManager = acp.NewConnectionManager(&acp.Config{})
	handler := NewCommandHandler(server)

	// Create a team with a member that has no connection
	tm := server.TeamManager()
	tmTeam, err := tm.CreateTeam("conn-test", "owner-1")
	if err != nil {
		t.Fatalf("failed to create team: %v", err)
	}
	if err := tmTeam.AddMember(&team.Member{
		ID:   "agent-no-conn",
		Name: "NoConn Agent",
		Role: team.RoleDeveloper,
	}); err != nil {
		t.Fatalf("failed to add member: %v", err)
	}

	result, err := handler.HandleCommand("get_teams", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	teams, ok := result.([]TeamInfo)
	if !ok {
		t.Fatalf("expected []TeamInfo, got %T", result)
	}
	if len(teams) != 1 {
		t.Fatalf("expected 1 team, got %d", len(teams))
	}
	if len(teams[0].Members) != 1 {
		t.Fatalf("expected 1 member, got %d", len(teams[0].Members))
	}
	// Member has no connection, so Online should be false
	if teams[0].Members[0].Online {
		t.Error("member should not be online (no connection)")
	}
}

func TestCommandHandler_HandleGetTeams_EmptyConnManager(t *testing.T) {
	server := newTestServer()
	server.connManager = acp.NewConnectionManager(&acp.Config{})
	handler := NewCommandHandler(server)

	// Create a team with no members
	_, err := server.TeamManager().CreateTeam("empty-team", "owner-1")
	if err != nil {
		t.Fatalf("failed to create team: %v", err)
	}

	result, err := handler.HandleCommand("get_teams", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	teams, ok := result.([]TeamInfo)
	if !ok {
		t.Fatalf("expected []TeamInfo, got %T", result)
	}
	if len(teams) != 1 {
		t.Fatalf("expected 1 team, got %d", len(teams))
	}
	if len(teams[0].Members) != 0 {
		t.Errorf("expected 0 members, got %d", len(teams[0].Members))
	}
}

func TestCommandHandler_HandleWriteFile_SymlinkTraversal(t *testing.T) {
	dir := t.TempDir()
	server := newTestServer()
	server.workspacePath = dir
	handler := NewCommandHandler(server)

	t.Run("path traversal via symlink", func(t *testing.T) {
		// Create a symlink inside workspace pointing outside
		if err := os.Symlink(dir, filepath.Join(dir, "escape")); err != nil {
			t.Skip("symlink creation failed")
		}

		params, _ := json.Marshal(map[string]string{
			"path":    "escape/../../etc/passwd_test",
			"content": "test",
		})
		_, err := handler.HandleCommand("write_file", params, "test")
		if err == nil {
			t.Error("expected error for symlink traversal")
		}
	})
}

func TestCommandHandler_HandleWriteFile_ContentTooLarge(t *testing.T) {
	dir := t.TempDir()
	server := newTestServer()
	server.workspacePath = dir
	handler := NewCommandHandler(server)

	largeContent := strings.Repeat("x", 10<<20+1) // 10MB + 1 byte
	params, _ := json.Marshal(map[string]string{
		"path":    "test.txt",
		"content": largeContent,
	})
	_, err := handler.HandleCommand("write_file", params, "test")
	if err == nil {
		t.Error("expected error for content too large")
	}
}

func TestCommandHandler_HandleWriteFile_NestedDir(t *testing.T) {
	dir := t.TempDir()
	server := newTestServer()
	server.workspacePath = dir
	handler := NewCommandHandler(server)

	params, _ := json.Marshal(map[string]string{
		"path":    "sub/dir/deep/file.txt",
		"content": "nested content",
	})
	result, err := handler.HandleCommand("write_file", params, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	status, ok := result.(map[string]string)
	if !ok || status["status"] != "written" {
		t.Error("expected status 'written'")
	}

	// Verify file exists with correct content
	data, err := os.ReadFile(filepath.Join(dir, "sub/dir/deep/file.txt"))
	if err != nil {
		t.Fatalf("failed to read written file: %v", err)
	}
	if string(data) != "nested content" {
		t.Errorf("expected 'nested content', got %q", string(data))
	}
}

func TestCommandHandler_HandleGetAgents_WithRegisteredAgent(t *testing.T) {
	handler, server := newTestHandler()

	// Register an agent via the registry
	ag := agent.NewAgent("test-agent-1", agent.AgentTypeCoder)
	server.registry.Register(ag)

	result, err := handler.HandleCommand("get_agents", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	agents, ok := result.([]AgentInfo)
	if !ok {
		t.Fatalf("expected []AgentInfo, got %T", result)
	}
	if len(agents) != 1 {
		t.Fatalf("expected 1 agent, got %d", len(agents))
	}
}

func TestCommandHandler_HandleExportWorkflow_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	wf := orch.CreateWorkflow("export-test", swarm.ModeSequential)
	wf.AddNode(&swarm.WorkflowNode{ID: "n1", Name: "Step 1", Type: "agent"})

	params := json.RawMessage(fmt.Sprintf(`{"id": "%s"}`, wf.ID))
	result, err := handler.HandleCommand("export_workflow", params, "test")
	if err != nil {
		t.Fatalf("export workflow: %v", err)
	}

	m, ok := result.(map[string]any)
	if !ok {
		t.Fatal("expected map result")
	}
	if m["format"] != "json" {
		t.Errorf("format = %v, want json", m["format"])
	}
	if m["size"] == nil {
		t.Error("missing size field")
	}
}

func TestCommandHandler_HandleImportWorkflow_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	// Create a workflow, export it, then import
	wf := orch.CreateWorkflow("original", swarm.ModeSequential)
	wf.AddNode(&swarm.WorkflowNode{ID: "n1", Name: "Step 1", Type: "agent"})

	exportResult, err := handler.HandleCommand("export_workflow", json.RawMessage(fmt.Sprintf(`{"id": "%s"}`, wf.ID)), "test")
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	data := exportResult.(map[string]any)["data"].(string)

	params := json.RawMessage(fmt.Sprintf(`{"name": "imported", "data": %s}`, string(data)))
	importResult, err := handler.HandleCommand("import_workflow", params, "test")
	if err != nil {
		t.Fatalf("import workflow: %v", err)
	}

	m, ok := importResult.(map[string]any)
	if !ok {
		t.Fatal("expected map result")
	}
	if m["id"] == wf.ID {
		t.Error("imported workflow should have different ID")
	}
}

func TestCommandHandler_HandleImportWorkflow_SizeLimit(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	// Create payload larger than 1MB limit
	largeData := strings.Repeat("x", 2<<20) // 2MB
	params := json.RawMessage(fmt.Sprintf(`{"name": "big", "data": %q}`, largeData))
	_, err := handler.HandleCommand("import_workflow", params, "test")
	if err == nil {
		t.Fatal("expected error for oversized import payload")
	}
}

func TestCommandHandler_HandleValidateWorkflow_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	wf := orch.CreateWorkflow("valid", swarm.ModeSequential)
	wf.AddNode(&swarm.WorkflowNode{ID: "n1", Name: "Start", Type: "agent"})
	wf.AddNode(&swarm.WorkflowNode{ID: "n2", Name: "End", Type: "agent"})
	wf.AddEdge(&swarm.WorkflowEdge{ID: "e1", From: "n1", To: "n2"})

	params := json.RawMessage(fmt.Sprintf(`{"id": "%s"}`, wf.ID))
	result, err := handler.HandleCommand("validate_workflow", params, "test")
	if err != nil {
		t.Fatalf("validate workflow: %v", err)
	}

	m := result.(map[string]any)
	if m["valid"] != true {
		t.Errorf("expected valid=true, got %v", m["valid"])
	}
}

func TestCommandHandler_HandleValidateWorkflow_Invalid(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	// Create a workflow with duplicate node IDs via direct manipulation
	wf := orch.CreateWorkflow("invalid", swarm.ModeSequential)
	wf.AddNode(&swarm.WorkflowNode{ID: "n1", Name: "A", Type: "agent"})
	wf.AddNode(&swarm.WorkflowNode{ID: "n1", Name: "B", Type: "agent"})

	params := json.RawMessage(fmt.Sprintf(`{"id": "%s"}`, wf.ID))
	result, err := handler.HandleCommand("validate_workflow", params, "test")
	if err != nil {
		t.Fatalf("validate workflow: %v", err)
	}

	m := result.(map[string]any)
	if m["valid"] != false {
		t.Errorf("expected valid=false, got %v", m["valid"])
	}
}

func TestCommandHandler_HandleGetWorkflowStatus_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	wf := orch.CreateWorkflow("status-test", swarm.ModeSequential)
	wf.AddNode(&swarm.WorkflowNode{ID: "n1", Name: "Step 1", Type: "agent"})
	wf.AddNode(&swarm.WorkflowNode{ID: "n2", Name: "Step 2", Type: "agent"})
	wf.AddEdge(&swarm.WorkflowEdge{ID: "e1", From: "n1", To: "n2"})

	params := json.RawMessage(fmt.Sprintf(`{"id": "%s"}`, wf.ID))
	result, err := handler.HandleCommand("get_workflow_status", params, "test")
	if err != nil {
		t.Fatalf("get workflow status: %v", err)
	}

	status, ok := result.(*swarm.WorkflowStatus)
	if !ok {
		t.Fatal("expected WorkflowStatus result")
	}
	if status.ID != wf.ID {
		t.Errorf("ID = %q, want %q", status.ID, wf.ID)
	}
	if status.Name != "status-test" {
		t.Errorf("Name = %q, want %q", status.Name, "status-test")
	}
	if status.NodeCount != 2 {
		t.Errorf("NodeCount = %d, want 2", status.NodeCount)
	}
	if status.EdgeCount != 1 {
		t.Errorf("EdgeCount = %d, want 1", status.EdgeCount)
	}
	if len(status.NodeStatuses) != 2 {
		t.Fatalf("NodeStatuses = %d, want 2", len(status.NodeStatuses))
	}
	if status.NodeStatuses[0].Name != "Step 1" {
		t.Errorf("node 0 name = %q, want Step 1", status.NodeStatuses[0].Name)
	}
}

func TestCommandHandler_HandleGetWorkflowStatus_NotFound(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	params := json.RawMessage(`{"id": "nonexistent"}`)
	_, err := handler.HandleCommand("get_workflow_status", params, "test")
	if err == nil {
		t.Fatal("expected error for nonexistent workflow")
	}
}

func TestCommandHandler_HandleSearchFiles_Success(t *testing.T) {
	handler, server := newTestHandler()
	tmpDir := t.TempDir()
	server.workspacePath = tmpDir

	// Create test structure
	os.MkdirAll(filepath.Join(tmpDir, "src"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "node_modules", "pkg"), 0755) // should be excluded
	os.WriteFile(filepath.Join(tmpDir, "main.go"), []byte("package main"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "utils.go"), []byte("package main"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "src", "app.ts"), []byte("console.log"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "node_modules", "pkg", "index.js"), []byte("module"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "README.md"), []byte("# readme"), 0644)

	t.Run("search by name", func(t *testing.T) {
		params := json.RawMessage(`{"query": ".go"}`)
		result, err := handler.HandleCommand("search_files", params, "test")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		resultMap, ok := result.(map[string][]FileInfo)
		if !ok {
			t.Fatalf("expected map[string][]FileInfo, got %T", result)
		}

		files := resultMap["files"]
		if len(files) < 2 {
			t.Errorf("expected at least 2 .go files, got %d", len(files))
		}

		// Verify node_modules is excluded
		for _, f := range files {
			if strings.Contains(f.Path, "node_modules") {
				t.Errorf("node_modules should be excluded, got %s", f.Path)
			}
		}
	})

	t.Run("case insensitive search", func(t *testing.T) {
		params := json.RawMessage(`{"query": "README"}`)
		result, err := handler.HandleCommand("search_files", params, "test")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		resultMap := result.(map[string][]FileInfo)
		files := resultMap["files"]
		if len(files) != 1 {
			t.Fatalf("expected 1 README.md, got %d", len(files))
		}
		if files[0].Name != "README.md" {
			t.Errorf("expected README.md, got %s", files[0].Name)
		}
	})

	t.Run("limit results", func(t *testing.T) {
		params := json.RawMessage(`{"query": "", "limit": 1}`)
		result, err := handler.HandleCommand("search_files", params, "test")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		resultMap := result.(map[string][]FileInfo)
		files := resultMap["files"]
		if len(files) != 0 {
			t.Errorf("expected 0 results for empty query, got %d", len(files))
		}
	})

	t.Run("subdirectory files found", func(t *testing.T) {
		params := json.RawMessage(`{"query": "app.ts"}`)
		result, err := handler.HandleCommand("search_files", params, "test")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		resultMap := result.(map[string][]FileInfo)
		files := resultMap["files"]
		if len(files) != 1 {
			t.Fatalf("expected 1 result, got %d", len(files))
		}
		if files[0].Path != filepath.Join("src", "app.ts") {
			t.Errorf("expected src/app.ts, got %s", files[0].Path)
		}
	})
}

func TestCommandHandler_HandleSearchFiles_EdgeCases(t *testing.T) {
	handler, server := newTestHandler()
	tmpDir := t.TempDir()
	server.workspacePath = tmpDir

	t.Run("workspace not configured", func(t *testing.T) {
		handlerNoWS, serverNoWS := newTestHandler()
		serverNoWS.workspacePath = ""
		params := json.RawMessage(`{"query": "test"}`)
		_, err := handlerNoWS.HandleCommand("search_files", params, "test")
		if err == nil {
			t.Fatal("expected error for workspace not configured")
		}
		apiErr, ok := err.(*APIError)
		if !ok {
			t.Fatalf("expected APIError, got %T", err)
		}
		if apiErr.Code != CodeNotConnected {
			t.Errorf("expected CodeNotConnected (%d), got %d", CodeNotConnected, apiErr.Code)
		}
	})

	t.Run("no matches", func(t *testing.T) {
		os.WriteFile(filepath.Join(tmpDir, "existing.txt"), []byte("data"), 0644)
		params := json.RawMessage(`{"query": "nonexistent_file_xyz"}`)
		result, err := handler.HandleCommand("search_files", params, "test")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		resultMap := result.(map[string][]FileInfo)
		if len(resultMap["files"]) != 0 {
			t.Errorf("expected 0 results, got %d", len(resultMap["files"]))
		}
	})

	t.Run("hidden directories excluded", func(t *testing.T) {
		os.MkdirAll(filepath.Join(tmpDir, ".hidden", "sub"), 0755)
		os.WriteFile(filepath.Join(tmpDir, ".hidden", "sub", "secret.txt"), []byte("secret"), 0644)
		os.WriteFile(filepath.Join(tmpDir, "visible.txt"), []byte("visible"), 0644)

		params := json.RawMessage(`{"query": ".txt"}`)
		result, err := handler.HandleCommand("search_files", params, "test")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		resultMap := result.(map[string][]FileInfo)
		for _, f := range resultMap["files"] {
			if strings.Contains(f.Path, ".hidden") {
				t.Errorf("hidden directory should be excluded, got %s", f.Path)
			}
		}
	})
}

func TestCommandHandler_HandleGetSessions_Empty(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("get_sessions", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	sessions, ok := result.([]SessionInfo)
	if !ok {
		t.Fatal("expected []SessionInfo result")
	}
	if len(sessions) != 0 {
		t.Errorf("expected 0 sessions, got %d", len(sessions))
	}
}

func TestCommandHandler_HandleGetSessions_WithSessions(t *testing.T) {
	handler, server := newTestHandler()

	server.sessionToAgent = map[string]string{
		"s1": "agent-1",
		"s2": "agent-2",
	}
	server.sessionToMode = map[string]string{
		"s1": "editing",
		"s2": "review",
	}

	result, err := handler.HandleCommand("get_sessions", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	sessions, ok := result.([]SessionInfo)
	if !ok {
		t.Fatal("expected []SessionInfo result")
	}
	if len(sessions) != 2 {
		t.Fatalf("expected 2 sessions, got %d", len(sessions))
	}

	byID := map[string]SessionInfo{}
	for _, s := range sessions {
		byID[s.ID] = s
	}
	if byID["s1"].AgentID != "agent-1" || byID["s1"].Mode != "editing" {
		t.Errorf("session s1: expected agent-1/editing, got %s/%s", byID["s1"].AgentID, byID["s1"].Mode)
	}
	if byID["s2"].AgentID != "agent-2" || byID["s2"].Mode != "review" {
		t.Errorf("session s2: expected agent-2/review, got %s/%s", byID["s2"].AgentID, byID["s2"].Mode)
	}
}

// --- Workspace handler tests ---

func TestCommandHandler_HandleGetWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("get_workspace", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m, ok := result.(map[string]string)
	if !ok {
		t.Fatal("expected map[string]string")
	}
	if _, exists := m["path"]; !exists {
		t.Error("expected 'path' key in result")
	}
}

func TestCommandHandler_HandleSetWorkspace(t *testing.T) {
	handler, server := newTestHandler()

	result, err := handler.HandleCommand("set_workspace", json.RawMessage(`{"path":"/tmp/test-ws"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m, ok := result.(map[string]string)
	if !ok {
		t.Fatal("expected map[string]string")
	}
	if m["path"] != "/tmp/test-ws" {
		t.Errorf("expected path /tmp/test-ws, got %s", m["path"])
	}
	if server.workspacePath != "/tmp/test-ws" {
		t.Errorf("server workspacePath not updated: %s", server.workspacePath)
	}
}

func TestCommandHandler_HandleSetWorkspace_EmptyPath(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("set_workspace", json.RawMessage(`{"path":""}`), "test")
	if err == nil {
		t.Fatal("expected error for empty path")
	}
}

func TestCommandHandler_HandleSetWorkspace_InvalidJSON(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("set_workspace", json.RawMessage(`invalid`), "test")
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

// --- Git handler tests ---

func TestCommandHandler_HandleGitStatus_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("git_status", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Fatal("expected error for no workspace")
	}
}

func TestCommandHandler_HandleGitStatus_NonGitDir(t *testing.T) {
	dir := t.TempDir()
	handler, server := newTestHandler()
	server.SetWorkspace(dir)

	result, err := handler.HandleCommand("git_status", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m, ok := result.(map[string]any)
	if !ok {
		t.Fatal("expected map")
	}
	files, ok := m["files"].([]any)
	if !ok {
		t.Fatal("expected files array")
	}
	if len(files) != 0 {
		t.Errorf("expected empty files for non-git dir, got %d", len(files))
	}
}

func TestCommandHandler_HandleGitBranch_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("git_branch", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Fatal("expected error for no workspace")
	}
}

func TestCommandHandler_HandleGitBranch_NonGitDir(t *testing.T) {
	dir := t.TempDir()
	handler, server := newTestHandler()
	server.SetWorkspace(dir)

	result, err := handler.HandleCommand("git_branch", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m, ok := result.(map[string]any)
	if !ok {
		t.Fatal("expected map")
	}
	if m["branch"] != "" {
		t.Errorf("expected empty branch for non-git dir, got %v", m["branch"])
	}
}

func TestCommandHandler_HandleGitLog_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("git_log", json.RawMessage(`{"limit":10}`), "test")
	if err == nil {
		t.Fatal("expected error for no workspace")
	}
}

func TestCommandHandler_HandleGitDiff_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("git_diff", json.RawMessage(`{"path":"test.go"}`), "test")
	if err == nil {
		t.Fatal("expected error for no workspace")
	}
}

func TestCommandHandler_HandleGitDiff_NoPath(t *testing.T) {
	dir := t.TempDir()
	handler, server := newTestHandler()
	server.SetWorkspace(dir)

	_, err := handler.HandleCommand("git_diff", json.RawMessage(`{"path":""}`), "test")
	if err == nil {
		t.Fatal("expected error for empty path")
	}
}

func TestCommandHandler_HandleGitCommit_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("git_commit", json.RawMessage(`{"message":"test"}`), "test")
	if err == nil {
		t.Fatal("expected error for no workspace")
	}
}

func TestCommandHandler_HandleGitCommit_NoMessage(t *testing.T) {
	dir := t.TempDir()
	handler, server := newTestHandler()
	server.SetWorkspace(dir)

	_, err := handler.HandleCommand("git_commit", json.RawMessage(`{"message":""}`), "test")
	if err == nil {
		t.Fatal("expected error for empty message")
	}
}

func TestCommandHandler_HandleGitStage_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("git_stage", json.RawMessage(`{"path":"test.go"}`), "test")
	if err == nil {
		t.Fatal("expected error for no workspace")
	}
}

func TestCommandHandler_HandleGitPush_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("git_push", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Fatal("expected error for no workspace")
	}
}

func TestCommandHandler_HandleGitPull_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("git_pull", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Fatal("expected error for no workspace")
	}
}

func TestCommandHandler_HandleGitBlame_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("git_blame", json.RawMessage(`{"path":"test.go"}`), "test")
	if err == nil {
		t.Fatal("expected error for no workspace")
	}
}

func TestCommandHandler_HandleGitBlame_NoPath(t *testing.T) {
	dir := t.TempDir()
	handler, server := newTestHandler()
	server.SetWorkspace(dir)

	_, err := handler.HandleCommand("git_blame", json.RawMessage(`{"path":""}`), "test")
	if err == nil {
		t.Fatal("expected error for empty path")
	}
}

func TestCommandHandler_HandleGitWorktreeList_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("git_worktree_list", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Fatal("expected error for no workspace")
	}
}

func TestCommandHandler_HandleGitWorktreeAdd_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("git_worktree_add", json.RawMessage(`{"path":"/tmp/wt"}`), "test")
	if err == nil {
		t.Fatal("expected error for no workspace")
	}
}

func TestCommandHandler_HandleGitWorktreeAdd_NoPath(t *testing.T) {
	dir := t.TempDir()
	handler, server := newTestHandler()
	server.SetWorkspace(dir)

	_, err := handler.HandleCommand("git_worktree_add", json.RawMessage(`{"path":""}`), "test")
	if err == nil {
		t.Fatal("expected error for empty path")
	}
}

func TestCommandHandler_HandleGitWorktreeRemove_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("git_worktree_remove", json.RawMessage(`{"path":"/tmp/wt"}`), "test")
	if err == nil {
		t.Fatal("expected error for no workspace")
	}
}

func TestCommandHandler_HandleGitWorktreeRemove_NoPath(t *testing.T) {
	dir := t.TempDir()
	handler, server := newTestHandler()
	server.SetWorkspace(dir)

	_, err := handler.HandleCommand("git_worktree_remove", json.RawMessage(`{"path":""}`), "test")
	if err == nil {
		t.Fatal("expected error for empty path")
	}
}

func TestCommandHandler_HandleGitDiffLines_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("git_diff_lines", json.RawMessage(`{"path":"test.go"}`), "test")
	if err == nil {
		t.Fatal("expected error for no workspace")
	}
}

func TestCommandHandler_HandleGitDiffLines_NoPath(t *testing.T) {
	dir := t.TempDir()
	handler, server := newTestHandler()
	server.SetWorkspace(dir)

	_, err := handler.HandleCommand("git_diff_lines", json.RawMessage(`{"path":""}`), "test")
	if err == nil {
		t.Fatal("expected error for empty path")
	}
}

func TestCommandHandler_HandleGitStash_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("git_stash", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Fatal("expected error for no workspace")
	}
}

func TestCommandHandler_HandleGitStashPop_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("git_stash_pop", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Fatal("expected error for no workspace")
	}
}

func TestCommandHandler_HandleGitUndoCommit_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("git_undo_commit", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Fatal("expected error for no workspace")
	}
}

func TestCommandHandler_HandleGitBranchList_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("git_branch_list", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Fatal("expected error for no workspace")
	}
}

func TestCommandHandler_HandleGitBranchCreate_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("git_branch_create", json.RawMessage(`{"name":"feature"}`), "test")
	if err == nil {
		t.Fatal("expected error for no workspace")
	}
}

func TestCommandHandler_HandleGitBranchCreate_NoName(t *testing.T) {
	dir := t.TempDir()
	handler, server := newTestHandler()
	server.SetWorkspace(dir)

	_, err := handler.HandleCommand("git_branch_create", json.RawMessage(`{"name":""}`), "test")
	if err == nil {
		t.Fatal("expected error for empty name")
	}
}

func TestCommandHandler_HandleGitBranchCheckout_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("git_branch_checkout", json.RawMessage(`{"name":"main"}`), "test")
	if err == nil {
		t.Fatal("expected error for no workspace")
	}
}

func TestCommandHandler_HandleGitBranchCheckout_NoName(t *testing.T) {
	dir := t.TempDir()
	handler, server := newTestHandler()
	server.SetWorkspace(dir)

	_, err := handler.HandleCommand("git_branch_checkout", json.RawMessage(`{"name":""}`), "test")
	if err == nil {
		t.Fatal("expected error for empty name")
	}
}

func TestCommandHandler_HandleGitDiscard_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("git_discard", json.RawMessage(`{"path":"test.go"}`), "test")
	if err == nil {
		t.Fatal("expected error for no workspace")
	}
}

func TestCommandHandler_HandleGitDiscard_NoPath(t *testing.T) {
	dir := t.TempDir()
	handler, server := newTestHandler()
	server.SetWorkspace(dir)

	_, err := handler.HandleCommand("git_discard", json.RawMessage(`{"path":""}`), "test")
	if err == nil {
		t.Fatal("expected error for empty path")
	}
}

func TestCommandHandler_HandleGitUnstage_NoWorkspace(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("git_unstage", json.RawMessage(`{"path":"test.go"}`), "test")
	if err == nil {
		t.Fatal("expected error for no workspace")
	}
}

// ==================== Filesystem Handler Coverage Tests ====================

func TestCommandHandler_HandleMkdir(t *testing.T) {
	tmpDir := t.TempDir()
	handler, server := newTestHandler()
	server.workspacePath = tmpDir

	_, err := handler.HandleCommand("mkdir", json.RawMessage(`{"path":"subdir"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(tmpDir, "subdir")); os.IsNotExist(err) {
		t.Error("expected directory to exist")
	}
}

func TestCommandHandler_HandleMkdir_Validation(t *testing.T) {
	handler, _ := newTestHandler()
	_, err := handler.HandleCommand("mkdir", json.RawMessage(`{"path":""}`), "test")
	if err == nil {
		t.Error("expected error for empty path")
	}
}

func TestCommandHandler_HandleCreateFile(t *testing.T) {
	tmpDir := t.TempDir()
	handler, server := newTestHandler()
	server.workspacePath = tmpDir

	_, err := handler.HandleCommand("create_file", json.RawMessage(`{"path":"newfile.txt"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(tmpDir, "newfile.txt")); os.IsNotExist(err) {
		t.Error("expected file to exist")
	}
}

func TestCommandHandler_HandleDeleteFile(t *testing.T) {
	tmpDir := t.TempDir()
	handler, server := newTestHandler()
	server.workspacePath = tmpDir
	os.WriteFile(filepath.Join(tmpDir, "delme.txt"), []byte("x"), 0644)

	_, err := handler.HandleCommand("delete_file", json.RawMessage(`{"path":"delme.txt"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(tmpDir, "delme.txt")); !os.IsNotExist(err) {
		t.Error("expected file to be deleted")
	}
}

func TestCommandHandler_HandleRenameFile(t *testing.T) {
	tmpDir := t.TempDir()
	handler, server := newTestHandler()
	server.workspacePath = tmpDir
	os.WriteFile(filepath.Join(tmpDir, "old.txt"), []byte("data"), 0644)

	_, err := handler.HandleCommand("rename_file", json.RawMessage(`{"oldPath":"old.txt","newPath":"new.txt"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(tmpDir, "new.txt")); os.IsNotExist(err) {
		t.Error("expected new file to exist")
	}
}

func TestCommandHandler_HandleCopyFile(t *testing.T) {
	tmpDir := t.TempDir()
	handler, server := newTestHandler()
	server.workspacePath = tmpDir
	os.WriteFile(filepath.Join(tmpDir, "src.txt"), []byte("copy me"), 0644)

	_, err := handler.HandleCommand("copy_file", json.RawMessage(`{"srcPath":"src.txt","dstPath":"dst.txt"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(tmpDir, "dst.txt"))
	if err != nil || string(data) != "copy me" {
		t.Errorf("expected 'copy me', got %q, err=%v", string(data), err)
	}
}

func TestCommandHandler_HandleReplaceContent(t *testing.T) {
	tmpDir := t.TempDir()
	handler, server := newTestHandler()
	server.workspacePath = tmpDir
	os.WriteFile(filepath.Join(tmpDir, "replace.txt"), []byte("hello world"), 0644)

	_, err := handler.HandleCommand("replace_content", json.RawMessage(`{"query":"hello","replacement":"hi","dryRun":true}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// ==================== A2A Handler Coverage Tests ====================

func TestCommandHandler_HandleA2AStatus(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("a2a_status", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if _, exists := m["routerAvailable"]; !exists {
		t.Error("expected 'routerAvailable' key in a2a_status response")
	}
}

func TestCommandHandler_HandleA2AMessageLog(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("a2a_message_log", json.RawMessage(`{"limit":50}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result == nil {
		t.Error("expected non-nil result")
	}
}

// ==================== Swarm Task Handler Coverage Tests ====================

func TestCommandHandler_HandleAssignTask(t *testing.T) {
	handler, server := newTestHandler()
	cfg := swarm.SwarmConfig{ID: "sw1", Name: "test", Topology: "star", Strategy: "round_robin"}
	sw := swarm.NewSwarm(cfg)
	server.swarms["sw1"] = sw
	sw.SubmitTask(context.Background(), &swarm.Task{ID: "t1", Title: "test", State: swarm.TaskStatePending})

	_, err := handler.HandleCommand("assign_task", json.RawMessage(`{"swarmId":"sw1","taskId":"t1","agentId":"agent-1"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestCommandHandler_HandleAssignTask_Validation(t *testing.T) {
	handler, _ := newTestHandler()
	_, err := handler.HandleCommand("assign_task", json.RawMessage(`{"swarmId":"","taskId":"t1","agentId":"a1"}`), "test")
	if err == nil {
		t.Error("expected error for empty swarmId")
	}
}

func TestCommandHandler_HandleCancelTask(t *testing.T) {
	handler, server := newTestHandler()
	cfg := swarm.SwarmConfig{ID: "sw1", Name: "test", Topology: "star", Strategy: "round_robin"}
	sw := swarm.NewSwarm(cfg)
	server.swarms["sw1"] = sw
	sw.SubmitTask(context.Background(), &swarm.Task{ID: "t1", Title: "test", State: swarm.TaskStatePending})

	_, err := handler.HandleCommand("cancel_task", json.RawMessage(`{"swarmId":"sw1","taskId":"t1"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestCommandHandler_HandleGetConsensus(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("get_consensus", json.RawMessage(`{"swarmId":""}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if _, exists := m["consensus"]; !exists {
		t.Error("expected 'consensus' key")
	}
}

func TestCommandHandler_HandleResolveHandoff(t *testing.T) {
	handler, _ := newTestHandler()
	_, err := handler.HandleCommand("resolve_handoff", json.RawMessage(`{"requestId":""}`), "test")
	if err == nil {
		t.Error("expected error for empty requestId")
	}
}

// ==================== Misc Handler Coverage Tests ====================

func TestCommandHandler_HandleScanSkills(t *testing.T) {
	handler, _ := newTestHandler()
	result, err := handler.HandleCommand("scan_skills", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result == nil {
		t.Error("expected non-nil result")
	}
}

func TestCommandHandler_HandleSaveCustomInstructions(t *testing.T) {
	tmpDir := t.TempDir()
	handler, server := newTestHandler()
	server.workspacePath = tmpDir

	_, err := handler.HandleCommand("save_custom_instructions", json.RawMessage(`{"content":"do stuff"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestCommandHandler_HandleGetCustomInstructions(t *testing.T) {
	tmpDir := t.TempDir()
	handler, server := newTestHandler()
	server.workspacePath = tmpDir

	result, err := handler.HandleCommand("get_custom_instructions", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result == nil {
		t.Error("expected non-nil result")
	}
}

func TestCommandHandler_HandleExecuteCode(t *testing.T) {
	handler, _ := newTestHandler()
	_, err := handler.HandleCommand("execute_code", json.RawMessage(`{"content":"print(1)","language":"python","filePath":"test.py"}`), "test")
	if err != nil {
		// Expected: no agent available
		result, _ := handler.HandleCommand("execute_code", json.RawMessage(`{"content":"print(1)","language":"python","filePath":"test.py"}`), "test")
		m, ok := result.(map[string]any)
		if !ok {
			t.Fatalf("expected map result, got %T", result)
		}
		if success, _ := m["success"].(bool); success {
			t.Error("expected success=false when no agents connected")
		}
	}
}

func TestCommandHandler_HandleListMcpTools(t *testing.T) {
	handler, _ := newTestHandler()
	_, err := handler.HandleCommand("list_mcp_tools", json.RawMessage(`{"serverId":""}`), "test")
	if err == nil {
		t.Error("expected error for empty serverId")
	}
}

func TestCommandHandler_HandleScanMcpServers(t *testing.T) {
	handler, _ := newTestHandler()
	result, err := handler.HandleCommand("scan_mcp_servers", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result == nil {
		t.Error("expected non-nil result")
	}
}

func TestCommandHandler_HandleSearchContent(t *testing.T) {
	tmpDir := t.TempDir()
	handler, server := newTestHandler()
	server.workspacePath = tmpDir
	os.WriteFile(filepath.Join(tmpDir, "test.txt"), []byte("hello world"), 0644)

	result, err := handler.HandleCommand("search_content", json.RawMessage(`{"query":"hello","path":"."}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result == nil {
		t.Error("expected non-nil result")
	}
}

func TestCommandHandler_HandleTestAgent(t *testing.T) {
	handler, _ := newTestHandler()
	_, err := handler.HandleCommand("test_agent", json.RawMessage(`{"id":""}`), "test")
	if err == nil {
		t.Error("expected error for empty id")
	}
}
