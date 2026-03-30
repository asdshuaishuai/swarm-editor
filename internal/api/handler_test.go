package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
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
		_, err := handler.HandleCommand("stop_agent", paramsJSON)
		if err == nil {
			t.Error("expected error for non-existent agent")
		}
	})

	t.Run("stop with empty id", func(t *testing.T) {
		params := map[string]interface{}{"id": ""}
		paramsJSON, _ := json.Marshal(params)
		_, err := handler.HandleCommand("stop_agent", paramsJSON)
		if err == nil {
			t.Error("expected error for empty agent id")
		}
	})

	t.Run("stop with invalid json", func(t *testing.T) {
		_, err := handler.HandleCommand("stop_agent", []byte("bad"))
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
		result, err := handler.HandleCommand("refresh_agents", nil)
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
		result, err := handler.HandleCommand("delete_team", paramsJSON)
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
		_, err := handler.HandleCommand("delete_team", paramsJSON)
		if err == nil {
			t.Error("expected error for empty id")
		}
	})

	t.Run("delete with invalid json", func(t *testing.T) {
		teamMgr := team.NewManagerWithDir("")
		server := &WebSocketServer{teamManager: teamMgr}
		handler := NewCommandHandler(server)

		_, err := handler.HandleCommand("delete_team", []byte("bad"))
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
		_, err := handler.HandleCommand("add_agent_to_team", paramsJSON)
		if err == nil {
			t.Error("expected error for non-existent team")
		}
	})

	t.Run("missing team id", func(t *testing.T) {
		server := &WebSocketServer{teamManager: team.NewManagerWithDir(""), registry: agent.NewRegistry()}
		handler := NewCommandHandler(server)

		params := map[string]interface{}{"agentId": "agent-1"}
		paramsJSON, _ := json.Marshal(params)
		_, err := handler.HandleCommand("add_agent_to_team", paramsJSON)
		if err == nil {
			t.Error("expected error for missing team id")
		}
	})

	t.Run("missing agent id", func(t *testing.T) {
		server := &WebSocketServer{teamManager: team.NewManagerWithDir(""), registry: agent.NewRegistry()}
		handler := NewCommandHandler(server)

		params := map[string]interface{}{"teamId": "team-1"}
		paramsJSON, _ := json.Marshal(params)
		_, err := handler.HandleCommand("add_agent_to_team", paramsJSON)
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
		_, err := handler.HandleCommand("remove_agent_from_team", paramsJSON)
		if err == nil {
			t.Error("expected error for non-existent team")
		}
	})

	t.Run("missing team id", func(t *testing.T) {
		server := &WebSocketServer{teamManager: team.NewManagerWithDir("")}
		handler := NewCommandHandler(server)

		params := map[string]interface{}{"agentId": "agent-1"}
		paramsJSON, _ := json.Marshal(params)
		_, err := handler.HandleCommand("remove_agent_from_team", paramsJSON)
		if err == nil {
			t.Error("expected error for missing team id")
		}
	})

	t.Run("missing agent id", func(t *testing.T) {
		server := &WebSocketServer{teamManager: team.NewManagerWithDir("")}
		handler := NewCommandHandler(server)

		params := map[string]interface{}{"teamId": "team-1"}
		paramsJSON, _ := json.Marshal(params)
		_, err := handler.HandleCommand("remove_agent_from_team", paramsJSON)
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
		_, err := handler.HandleCommand("start_swarm", paramsJSON)
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
		_, err := handler.HandleCommand("start_swarm", paramsJSON)
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
		_, err := handler.HandleCommand("stop_swarm", paramsJSON)
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
		_, err := handler.HandleCommand("stop_swarm", paramsJSON)
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
		_, err := handler.HandleCommand("get_swarm_tasks", paramsJSON)
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
		_, err := handler.HandleCommand("get_swarm_tasks", paramsJSON)
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
		_, err := handler.HandleCommand("create_team", createJSON)
		if err != nil {
			t.Fatalf("create_team: %v", err)
		}

		// List teams
		result, err := handler.HandleCommand("get_teams", nil)
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
		result, err := handler.HandleCommand("delete_swarm", paramsJSON)
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
		_, err := handler.HandleCommand("delete_swarm", paramsJSON)
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
		registry:    agent.NewRegistry(),
		connManager: nil,
		swarms:      make(map[string]*swarm.Swarm),
		teamManager: team.NewManagerWithDir(""),
		mcpClients:  make(map[string]*mcp.Client),
	}
}

func newTestHandler() (*CommandHandler, *WebSocketServer) {
	server := newTestServer()
	return NewCommandHandler(server), server
}

func TestCommandHandler_HandleGetConfigPath(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("get_config_path", nil)
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
			_, err := handler.HandleCommand("create_session", json.RawMessage(tt.params))
			if err == nil {
				t.Error("expected error")
			}
		})
	}
}

func TestCommandHandler_HandleCreateSession_NoConnManager(t *testing.T) {
	handler, server := newTestHandler()
	server.connManager = nil

	_, err := handler.HandleCommand("create_session", json.RawMessage(`{"agentId": "test-agent"}`))
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
			_, err := handler.HandleCommand("send_message", json.RawMessage(tt.params))
			if err == nil {
				t.Error("expected error")
			}
		})
	}
}

func TestCommandHandler_HandleSendMessage_SessionNotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("send_message", json.RawMessage(`{"sessionId": "nonexistent", "message": "hello"}`))
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
			_, err := handler.HandleCommand("close_session", json.RawMessage(tt.params))
			if err == nil {
				t.Error("expected error")
			}
		})
	}
}

func TestCommandHandler_HandleCloseSession_Success(t *testing.T) {
	handler, server := newTestHandler()
	server.sessionToAgent = map[string]string{"session-1": "agent-1"}

	result, err := handler.HandleCommand("close_session", json.RawMessage(`{"sessionId": "session-1"}`))
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
			_, err := handler.HandleCommand("permission_response", json.RawMessage(tt.params))
			if err == nil {
				t.Error("expected error")
			}
		})
	}
}

func TestCommandHandler_HandlePermissionResponse_NoTeamManager(t *testing.T) {
	handler, server := newTestHandler()
	server.teamManager = nil

	_, err := handler.HandleCommand("permission_response", json.RawMessage(`{"requestId": "r1", "approved": true, "resolvedBy": "user"}`))
	if err == nil {
		t.Error("expected error when teamManager is nil")
	}
}

func TestCommandHandler_HandleGetSwarm_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("get_swarm", json.RawMessage(`{"id": "nonexistent"}`))
	if err == nil {
		t.Error("expected error for nonexistent swarm")
	}
}

func TestCommandHandler_HandleGetSwarm_EmptyID(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("get_swarm", json.RawMessage(`{"id": ""}`))
	if err == nil {
		t.Error("expected error for empty id")
	}
}

func TestCommandHandler_HandleGetSwarm_InvalidJSON(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("get_swarm", json.RawMessage(`invalid`))
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
			_, err := handler.HandleCommand("execute_task", json.RawMessage(tt.params))
			if err == nil {
				t.Error("expected error")
			}
		})
	}
}

func TestCommandHandler_HandleExecuteTask_SwarmNotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("execute_task", json.RawMessage(`{"swarmId": "nonexistent", "taskId": "t1"}`))
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
			_, err := handler.HandleCommand("stop_mcp_server", json.RawMessage(tt.params))
			if err == nil {
				t.Error("expected error")
			}
		})
	}
}

func TestCommandHandler_HandleStopMCPServer_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("stop_mcp_server", json.RawMessage(`{"serverId": "nonexistent"}`))
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
			_, err := handler.HandleCommand("call_mcp_tool", json.RawMessage(tt.params))
			if err == nil {
				t.Error("expected error")
			}
		})
	}
}

func TestCommandHandler_HandleCallMCPTool_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("call_mcp_tool", json.RawMessage(`{"serverId": "nonexistent", "toolName": "tool1"}`))
	if err == nil {
		t.Error("expected error for nonexistent server")
	}
}

func TestCommandHandler_HandleGetSupervisorStats(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("get_supervisor_stats", nil)
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

	result, err := handler.HandleCommand("get_supervisor_stats", nil)
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

	result, err := handler.HandleCommand("get_emergence_data", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	data, ok := result.(EmergenceData)
	if !ok {
		t.Fatal("expected EmergenceData result")
	}
	if data.Health.OverallScore == 0 {
		t.Error("fallback should set default health score")
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
			_, err := handler.HandleCommand("add_mcp_server", json.RawMessage(tt.params))
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
			_, err := handler.HandleCommand("remove_mcp_server", json.RawMessage(tt.params))
			if err == nil {
				t.Error("expected error")
			}
		})
	}
}

func TestCommandHandler_HandleAddAgent_Validation(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		name   string
		params string
	}{
		{"empty id", `{"config": {"id": "", "name": "Test", "command": "echo"}}`},
		{"empty name", `{"config": {"id": "a1", "name": "", "command": "echo"}}`},
		{"missing id", `{"config": {"name": "Test", "command": "echo"}}`},
		{"missing name", `{"config": {"id": "a1", "command": "echo"}}`},
		{"missing config", `{}`},
		{"invalid json", `invalid`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := handler.HandleCommand("add_agent", json.RawMessage(tt.params))
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
			_, err := handler.HandleCommand("update_agent", json.RawMessage(tt.params))
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
			_, err := handler.HandleCommand("delete_agent", json.RawMessage(tt.params))
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
	result, err := handler.HandleCommand("create_swarm", params)
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
	result, err := handler.HandleCommand("get_swarm", params)
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
	result, err := handler.HandleCommand("start_swarm", params)
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
	result, err := handler.HandleCommand("stop_swarm", params)
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
	result, err := handler.HandleCommand("get_swarm_tasks", params)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	tasks, ok := result.(map[string]any)
	if !ok {
		t.Fatal("expected map[string]any")
	}
	// Check that expected keys exist
	if _, ok := tasks["pending"]; !ok {
		t.Error("expected 'pending' key")
	}
	if _, ok := tasks["completed"]; !ok {
		t.Error("expected 'completed' key")
	}
}

func TestCommandHandler_HandleSubmitTask_Success(t *testing.T) {
	handler, server := newTestHandler()

	cfg := swarm.SwarmConfig{ID: "swarm-submit", Name: "Submit Test"}
	sw := swarm.NewSwarm(cfg)
	server.AddSwarm(cfg.ID, sw)

	params := json.RawMessage(`{"swarmId": "swarm-submit", "title": "Test task", "description": "test"}`)
	result, err := handler.HandleCommand("submit_task", params)
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
	createResult, err := handler.HandleCommand("create_team", createParams)
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
	result, err := handler.HandleCommand("add_agent_to_team", params)
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
	createResult, err := handler.HandleCommand("create_team", createParams)
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
	_, _ = handler.HandleCommand("add_agent_to_team", addParams)

	// Remove agent from team
	params := json.RawMessage(fmt.Sprintf(`{"teamId": "%s", "agentId": "test-agent-2"}`, teamInfo.ID))
	result, err := handler.HandleCommand("remove_agent_from_team", params)
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

	result, err := handler.HandleCommand("list_workflows", nil)
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
	result, err := handler.HandleCommand("create_workflow", params)
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
	result, err := handler.HandleCommand("get_workflow", params)
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
	result, err := handler.HandleCommand("update_workflow", params)
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
	result, err := handler.HandleCommand("delete_workflow", params)
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
	result, err := handler.HandleCommand("add_workflow_node", params)
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
	result, err := handler.HandleCommand("get_workflow_checkpoints", params)
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
	result, err := handler.HandleCommand("clear_node_cache", params)
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

	result, err := handler.HandleCommand("clear_all_caches", nil)
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
			_, err := handler.HandleCommand("execute_workflow", tt.params)
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
	_, err := handler.HandleCommand("execute_workflow", params)
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

// ==================== Automation Handler Tests ====================

func TestCommandHandler_HandleListAutomations_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()
	// No orchestrator set

	_, err := handler.HandleCommand("list_automations", nil)
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

func TestCommandHandler_HandleListAutomations_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	result, err := handler.HandleCommand("list_automations", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	list, ok := result.([]map[string]any)
	if !ok {
		t.Fatalf("expected []map[string]any, got %T", result)
	}
	// Empty list is valid
	if list == nil {
		t.Error("expected non-nil slice")
	}
}

func TestCommandHandler_HandleAddAutomation_Validation(t *testing.T) {
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

			_, err := handler.HandleCommand("add_automation", tt.params)
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleAddAutomation_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	params := json.RawMessage(`{"id": "test-auto", "name": "Test", "trigger": {"type": "task_complete"}, "actions": []}`)
	_, err := handler.HandleCommand("add_automation", params)
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

func TestCommandHandler_HandleAddAutomation_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	params := json.RawMessage(`{"id": "test-auto", "name": "Test Automation", "trigger": {"type": "task_complete"}, "actions": [], "enabled": true}`)
	result, err := handler.HandleCommand("add_automation", params)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map[string]string, got %T", result)
	}
	if info["id"] != "test-auto" {
		t.Errorf("id = %v, want 'test-auto'", info["id"])
	}
	if info["status"] != "added" {
		t.Errorf("status = %v, want 'added'", info["status"])
	}
}

func TestCommandHandler_HandleAddAutomation_InvalidCooldown(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	params := json.RawMessage(`{"id": "test-auto", "cooldown": "invalid"}`)
	_, err := handler.HandleCommand("add_automation", params)
	if err == nil {
		t.Error("expected error for invalid cooldown")
	}
}

func TestCommandHandler_HandleRemoveAutomation_Validation(t *testing.T) {
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

			_, err := handler.HandleCommand("remove_automation", tt.params)
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleRemoveAutomation_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	// Add automation first
	addParams := json.RawMessage(`{"id": "test-remove", "name": "Test", "trigger": {"type": "task_complete"}, "actions": []}`)
	handler.HandleCommand("add_automation", addParams)

	params := json.RawMessage(`{"id": "test-remove"}`)
	result, err := handler.HandleCommand("remove_automation", params)
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

func TestCommandHandler_HandleEnableAutomation_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"missing id", json.RawMessage(`{"enabled": true}`)},
		{"empty id", json.RawMessage(`{"id": "", "enabled": true}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, server := newTestHandler()
			orch := swarm.NewOrchestrator(nil)
			server.SetOrchestrator(orch)

			_, err := handler.HandleCommand("enable_automation", tt.params)
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleEnableAutomation_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	// Add automation first
	addParams := json.RawMessage(`{"id": "test-enable", "name": "Test", "trigger": {"type": "task_complete"}, "actions": []}`)
	handler.HandleCommand("add_automation", addParams)

	params := json.RawMessage(`{"id": "test-enable", "enabled": false}`)
	result, err := handler.HandleCommand("enable_automation", params)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map[string]string, got %T", result)
	}
	if info["status"] != "updated" {
		t.Errorf("status = %v, want 'updated'", info["status"])
	}
}

// ==================== Artifact Handler Tests ====================

func TestCommandHandler_HandleListArtifacts_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	// Returns empty list without error when no orchestrator
	result, err := handler.HandleCommand("list_artifacts", json.RawMessage(`{"workflowId": "test"}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	list, ok := result.([]any)
	if !ok {
		t.Fatalf("expected []any, got %T", result)
	}
	if len(list) != 0 {
		t.Errorf("expected empty list, got %d items", len(list))
	}
}

func TestCommandHandler_HandleListArtifacts_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	result, err := handler.HandleCommand("list_artifacts", json.RawMessage(`{"workflowId": "test-wf"}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Can be []*swarm.WorkflowArtifact or []any
	_ = result
	// Empty list is valid
}

func TestCommandHandler_HandleGetArtifact_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"missing workflowId", json.RawMessage(`{"key": "test"}`)},
		{"missing key", json.RawMessage(`{"workflowId": "test"}`)},
		{"empty workflowId", json.RawMessage(`{"workflowId": "", "key": "test"}`)},
		{"empty key", json.RawMessage(`{"workflowId": "test", "key": ""}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, server := newTestHandler()
			orch := swarm.NewOrchestrator(nil)
			server.SetOrchestrator(orch)

			_, err := handler.HandleCommand("get_artifact", tt.params)
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleGetArtifact_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	// Test with non-existent artifact - should return error
	params := json.RawMessage(`{"workflowId": "test-wf", "key": "nonexistent"}`)
	_, err := handler.HandleCommand("get_artifact", params)
	// This should return an error since artifact doesn't exist
	if err == nil {
		t.Error("expected error for non-existent artifact")
	}
}

func TestCommandHandler_HandleCreateArtifact_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"missing workflowId", json.RawMessage(`{"key": "test", "data": {}}`)},
		{"missing key", json.RawMessage(`{"workflowId": "test", "data": {}}`)},
		{"empty workflowId", json.RawMessage(`{"workflowId": "", "key": "test", "data": {}}`)},
		{"empty key", json.RawMessage(`{"workflowId": "test", "key": "", "data": {}}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, server := newTestHandler()
			orch := swarm.NewOrchestrator(nil)
			server.SetOrchestrator(orch)

			_, err := handler.HandleCommand("create_artifact", tt.params)
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleCreateArtifact_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	params := json.RawMessage(`{"workflowId": "test-wf", "key": "test-key", "data": {"result": 42}}`)
	result, err := handler.HandleCommand("create_artifact", params)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Result can be map[string]any or *swarm.WorkflowArtifact
	_ = result
}

func TestCommandHandler_HandleDeleteArtifact_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"missing workflowId", json.RawMessage(`{"key": "test"}`)},
		{"missing key", json.RawMessage(`{"workflowId": "test"}`)},
		{"empty workflowId", json.RawMessage(`{"workflowId": "", "key": "test"}`)},
		{"empty key", json.RawMessage(`{"workflowId": "test", "key": ""}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, server := newTestHandler()
			orch := swarm.NewOrchestrator(nil)
			server.SetOrchestrator(orch)

			_, err := handler.HandleCommand("delete_artifact", tt.params)
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleDeleteArtifact_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	params := json.RawMessage(`{"workflowId": "test-wf", "key": "test-key"}`)
	result, err := handler.HandleCommand("delete_artifact", params)
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

// ==================== Variable Handler Tests ====================

func TestCommandHandler_HandleListVariables_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("list_variables", json.RawMessage(`{"workflowId": "test-wf"}`))
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

func TestCommandHandler_HandleListVariables_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	result, err := handler.HandleCommand("list_variables", json.RawMessage(`{"workflowId": "test-wf"}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Can be []swarm.WorkflowVariable or []any
	_ = result
}

func TestCommandHandler_HandleAddVariable_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"missing workflowId", json.RawMessage(`{"key": "TEST", "value": "test"}`)},
		{"missing key", json.RawMessage(`{"workflowId": "wf", "value": "test"}`)},
		{"empty workflowId", json.RawMessage(`{"workflowId": "", "key": "TEST", "value": "test"}`)},
		{"empty key", json.RawMessage(`{"workflowId": "wf", "key": "", "value": "test"}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, server := newTestHandler()
			orch := swarm.NewOrchestrator(nil)
			server.SetOrchestrator(orch)

			_, err := handler.HandleCommand("add_variable", tt.params)
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleAddVariable_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	params := json.RawMessage(`{"workflowId": "test-wf", "key": "TEST_VAR", "name": "Test Var", "value": "test_value"}`)
	result, err := handler.HandleCommand("add_variable", params)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map[string]string, got %T", result)
	}
	if info["key"] != "TEST_VAR" {
		t.Errorf("key = %v, want 'TEST_VAR'", info["key"])
	}
}

func TestCommandHandler_HandleRemoveVariable_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"missing workflowId", json.RawMessage(`{"variableId": "var-1"}`)},
		{"missing variableId", json.RawMessage(`{"workflowId": "wf"}`)},
		{"empty workflowId", json.RawMessage(`{"workflowId": "", "variableId": "var-1"}`)},
		{"empty variableId", json.RawMessage(`{"workflowId": "wf", "variableId": ""}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, server := newTestHandler()
			orch := swarm.NewOrchestrator(nil)
			server.SetOrchestrator(orch)

			_, err := handler.HandleCommand("remove_variable", tt.params)
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleRemoveVariable_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	// Add variable first
	addResult, _ := handler.HandleCommand("add_variable", json.RawMessage(`{"workflowId": "test-wf", "key": "REMOVE_VAR", "value": "test"}`))
	varID := addResult.(map[string]string)["id"]

	params := json.RawMessage(fmt.Sprintf(`{"workflowId": "test-wf", "variableId": "%s"}`, varID))
	result, err := handler.HandleCommand("remove_variable", params)
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

func TestCommandHandler_HandleSetVariableValue_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"missing workflowId", json.RawMessage(`{"key": "TEST", "value": "test"}`)},
		{"missing key", json.RawMessage(`{"workflowId": "wf", "value": "test"}`)},
		{"empty workflowId", json.RawMessage(`{"workflowId": "", "key": "TEST", "value": "test"}`)},
		{"empty key", json.RawMessage(`{"workflowId": "wf", "key": "", "value": "test"}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, server := newTestHandler()
			orch := swarm.NewOrchestrator(nil)
			server.SetOrchestrator(orch)

			_, err := handler.HandleCommand("set_variable_value", tt.params)
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleSetVariableValue_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	// Add variable first
	handler.HandleCommand("add_variable", json.RawMessage(`{"workflowId": "test-wf", "key": "SET_VAR", "value": "old"}`))

	params := json.RawMessage(`{"workflowId": "test-wf", "key": "SET_VAR", "value": "new_value"}`)
	result, err := handler.HandleCommand("set_variable_value", params)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map[string]string, got %T", result)
	}
	if info["status"] != "updated" {
		t.Errorf("status = %v, want 'updated'", info["status"])
	}
}

func TestCommandHandler_HandleResolveVariables_Validation(t *testing.T) {
	tests := []struct {
		name   string
		params json.RawMessage
	}{
		{"missing workflowId", json.RawMessage(`{"template": "test"}`)},
		{"empty workflowId", json.RawMessage(`{"workflowId": "", "template": "test"}`)},
		{"invalid json", json.RawMessage(`{invalid}`)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler, server := newTestHandler()
			orch := swarm.NewOrchestrator(nil)
			server.SetOrchestrator(orch)

			_, err := handler.HandleCommand("resolve_variables", tt.params)
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleResolveVariables_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	// Add variable first
	handler.HandleCommand("add_variable", json.RawMessage(`{"workflowId": "test-wf", "key": "NAME", "value": "World"}`))

	params := json.RawMessage(`{"workflowId": "test-wf", "template": "Hello {{NAME}}!"}`)
	result, err := handler.HandleCommand("resolve_variables", params)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	info, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map[string]string, got %T", result)
	}
	if info["result"] != "Hello World!" {
		t.Errorf("result = %v, want 'Hello World!'", info["result"])
	}
}

// ==================== Audit Handler Tests ====================

func TestCommandHandler_HandleListAuditEvents_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("list_audit_events", json.RawMessage(`{}`))
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

func TestCommandHandler_HandleListAuditEvents_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	result, err := handler.HandleCommand("list_audit_events", json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Returns []map[string]any or similar
	_ = result
}

func TestCommandHandler_HandleGetAuditStats_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("get_audit_stats", nil)
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

func TestCommandHandler_HandleGetAuditStats_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	result, err := handler.HandleCommand("get_audit_stats", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Returns stats
	_ = result
}

func TestCommandHandler_HandleClearAuditLog_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("clear_audit_log", nil)
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

func TestCommandHandler_HandleClearAuditLog_Success(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	params := json.RawMessage(`{"confirm": true}`)
	result, err := handler.HandleCommand("clear_audit_log", params)
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

	_, err := handler.HandleCommand("start_schedule_runner", nil)
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

	result, err := handler.HandleCommand("start_schedule_runner", nil)
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

	_, err := handler.HandleCommand("stop_schedule_runner", nil)
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

	result, err := handler.HandleCommand("stop_schedule_runner", nil)
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

	_, err := handler.HandleCommand("get_schedule_runner_status", nil)
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

	result, err := handler.HandleCommand("get_schedule_runner_status", nil)
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

			_, err := handler.HandleCommand("resume_workflow", tt.params)
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleResumeWorkflow_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	params := json.RawMessage(`{"id": "test-workflow"}`)
	_, err := handler.HandleCommand("resume_workflow", params)
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

			_, err := handler.HandleCommand("add_workflow_edge", tt.params)
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleAddWorkflowEdge_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	params := json.RawMessage(`{"workflowId": "test-wf", "from": "a", "to": "b"}`)
	_, err := handler.HandleCommand("add_workflow_edge", params)
	if err == nil {
		t.Error("expected error for missing orchestrator")
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

			_, err := handler.HandleCommand("restore_workflow", tt.params)
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleRestoreWorkflow_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	params := json.RawMessage(`{"id": "wf-1", "checkpointId": "cp-1"}`)
	_, err := handler.HandleCommand("restore_workflow", params)
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

func TestCommandHandler_HandleRestoreWorkflow_NotFound(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	params := json.RawMessage(`{"id": "nonexistent-wf", "checkpointId": "cp-1"}`)
	_, err := handler.HandleCommand("restore_workflow", params)
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

			_, err := handler.HandleCommand("get_workflow_report", tt.params)
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestCommandHandler_HandleGetWorkflowReport_NoOrchestrator(t *testing.T) {
	handler, _ := newTestHandler()

	params := json.RawMessage(`{"id": "wf-1"}`)
	_, err := handler.HandleCommand("get_workflow_report", params)
	if err == nil {
		t.Error("expected error for missing orchestrator")
	}
}

func TestCommandHandler_HandleGetWorkflowReport_NotFound(t *testing.T) {
	handler, server := newTestHandler()
	orch := swarm.NewOrchestrator(nil)
	server.SetOrchestrator(orch)

	params := json.RawMessage(`{"id": "nonexistent-wf"}`)
	_, err := handler.HandleCommand("get_workflow_report", params)
	if err == nil {
		t.Error("expected error for non-existent workflow")
	}
}
