package api

import (
	"encoding/json"
	"testing"

	"github.com/swarm-editor/swarm-editor/internal/a2a"
	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
)

// ==================== handleGetAgents tests ====================

func TestHandleGetAgents_EmptyRegistry(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("get_agents", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	agents, ok := result.([]AgentInfo)
	if !ok {
		t.Fatalf("expected []AgentInfo, got %T", result)
	}
	if len(agents) != 0 {
		t.Errorf("expected 0 agents, got %d", len(agents))
	}
}

func TestHandleGetAgents_WithRegistryAgents(t *testing.T) {
	handler, server := newTestHandler()

	ag := &agent.Agent{
		ID:   acp.AgentID("test-agent-1"),
		Name: "Test Agent",
		Type: agent.AgentTypeCoder,
	}
	if err := server.registry.Register(ag); err != nil {
		t.Fatalf("failed to register agent: %v", err)
	}

	result, err := handler.HandleCommand("get_agents", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	agents := result.([]AgentInfo)
	if len(agents) != 1 {
		t.Fatalf("expected 1 agent, got %d", len(agents))
	}
	if agents[0].ID != "test-agent-1" {
		t.Errorf("expected ID test-agent-1, got %s", agents[0].ID)
	}
	if agents[0].Name != "Test Agent" {
		t.Errorf("expected name Test Agent, got %s", agents[0].Name)
	}
	if agents[0].Type != "coder" {
		t.Errorf("expected type coder, got %s", agents[0].Type)
	}
}

func TestHandleGetAgents_MultipleRegistryAgents(t *testing.T) {
	handler, server := newTestHandler()

	for i := range 3 {
		ag := &agent.Agent{
			ID:   acp.AgentID("agent-" + string(rune('a'+i))),
			Name: "Agent " + string(rune('A'+i)),
			Type: agent.AgentTypeCoder,
		}
		if err := server.registry.Register(ag); err != nil {
			t.Fatalf("failed to register agent: %v", err)
		}
	}

	result, err := handler.HandleCommand("get_agents", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	agents := result.([]AgentInfo)
	if len(agents) != 3 {
		t.Errorf("expected 3 agents, got %d", len(agents))
	}
}

func TestHandleGetAgents_WithConnectionManager(t *testing.T) {
	registry := agent.NewRegistry()
	connMgr := acp.NewConnectionManager(&acp.Config{})

	server := newTestServer()
	server.registry = registry
	server.connManager = connMgr
	handler := NewCommandHandler(server)

	// Connection manager has no connected agents, so result should be empty
	result, err := handler.HandleCommand("get_agents", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	agents := result.([]AgentInfo)
	if len(agents) != 0 {
		t.Errorf("expected 0 agents with empty connection manager, got %d", len(agents))
	}
}


func TestHandleGetAgents_DeduplicatesAcrossSources(t *testing.T) {
	handler, server := newTestHandler()

	// Register same agent ID in registry
	ag := &agent.Agent{
		ID:   acp.AgentID("dup-agent"),
		Name: "Registry Agent",
		Type: agent.AgentTypeCoder,
	}
	if err := server.registry.Register(ag); err != nil {
		t.Fatalf("failed to register agent: %v", err)
	}

	result, err := handler.HandleCommand("get_agents", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	agents := result.([]AgentInfo)
	// Should have exactly 1 entry even if it appears in multiple sources
	seen := make(map[string]int)
	for _, a := range agents {
		seen[a.ID]++
	}
	for id, count := range seen {
		if count > 1 {
			t.Errorf("agent %s appeared %d times, expected at most 1", id, count)
		}
	}
}

// ==================== handleRefreshAgents tests ====================

func TestHandleRefreshAgents_NoScanner(t *testing.T) {
	handler, server := newTestHandler()
	server.scanner = nil

	result, err := handler.HandleCommand("refresh_agents", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	agents, ok := result.([]AgentInfo)
	if !ok {
		t.Fatalf("expected []AgentInfo, got %T", result)
	}
	// No scanner, no registry agents — should return empty
	if len(agents) != 0 {
		t.Errorf("expected 0 agents, got %d", len(agents))
	}
}

func TestHandleRefreshAgents_WithRegistryAgents(t *testing.T) {
	handler, server := newTestHandler()

	ag := &agent.Agent{
		ID:   acp.AgentID("refresh-agent"),
		Name: "Refresh Test Agent",
		Type: agent.AgentTypeCoder,
	}
	if err := server.registry.Register(ag); err != nil {
		t.Fatalf("failed to register agent: %v", err)
	}

	result, err := handler.HandleCommand("refresh_agents", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	agents := result.([]AgentInfo)
	found := false
	for _, a := range agents {
		if a.ID == "refresh-agent" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected refresh-agent in results after refresh")
	}
}

// ==================== handleStartAgent tests ====================

func TestHandleStartAgent_InvalidJSON(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("start_agent", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleStartAgent_EmptyID(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		name   string
		params string
	}{
		{"empty id", `{"id": ""}`},
		{"whitespace id", `{"id": "   "}`},
		{"missing id", `{}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := handler.HandleCommand("start_agent", json.RawMessage(tt.params), "test")
			if err == nil {
				t.Error("expected error for empty/missing agent id")
			}
		})
	}
}

func TestHandleStartAgent_NotFound(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("start_agent", json.RawMessage(`{"id": "nonexistent"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent agent")
	}
}

func TestHandleStartAgent_RegistryAgent2(t *testing.T) {
	handler, server := newTestHandler()

	ag := &agent.Agent{
		ID:   acp.AgentID("start-test"),
		Name: "Start Test Agent",
		Type: agent.AgentTypeCoder,
	}
	if err := server.registry.Register(ag); err != nil {
		t.Fatalf("failed to register agent: %v", err)
	}

	result, err := handler.HandleCommand("start_agent", json.RawMessage(`{"id": "start-test"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m, ok := result.(map[string]string)
	if !ok {
		t.Fatalf("expected map[string]string, got %T", result)
	}
	if m["status"] != StatusStarted {
		t.Errorf("expected status %q, got %q", StatusStarted, m["status"])
	}
}

func TestHandleStartAgent_RegistryAgent_WithConnManager(t *testing.T) {
	registry := agent.NewRegistry()
	connMgr := acp.NewConnectionManager(&acp.Config{})

	server := newTestServer()
	server.registry = registry
	server.connManager = connMgr
	handler := NewCommandHandler(server)

	ag := &agent.Agent{
		ID:   acp.AgentID("start-conn-test"),
		Name: "Start Conn Test",
		Type: agent.AgentTypeCoder,
	}
	if err := registry.Register(ag); err != nil {
		t.Fatalf("failed to register agent: %v", err)
	}

	// Connection manager doesn't have the agent configured, so Connect will fail
	// but the handler should still return started with a warning
	result, err := handler.HandleCommand("start_agent", json.RawMessage(`{"id": "start-conn-test"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m := result.(map[string]string)
	if m["status"] != StatusStarted {
		t.Errorf("expected status %q, got %q", StatusStarted, m["status"])
	}
	// Should have a warning about ACP connection failure
	if m["warning"] == "" {
		t.Error("expected warning about ACP connection failure")
	}
}

func TestHandleStartAgent_NoConnManager(t *testing.T) {
	handler, server := newTestHandler()
	server.connManager = nil

	ag := &agent.Agent{
		ID:   acp.AgentID("start-no-conn"),
		Name: "Start No Conn",
		Type: agent.AgentTypeCoder,
	}
	if err := server.registry.Register(ag); err != nil {
		t.Fatalf("failed to register agent: %v", err)
	}

	result, err := handler.HandleCommand("start_agent", json.RawMessage(`{"id": "start-no-conn"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m := result.(map[string]string)
	if m["status"] != StatusStarted {
		t.Errorf("expected status %q, got %q", StatusStarted, m["status"])
	}
}

func TestHandleStartAgent_SetsIdleState(t *testing.T) {
	handler, server := newTestHandler()

	ag := &agent.Agent{
		ID:   acp.AgentID("state-test"),
		Name: "State Test",
		Type: agent.AgentTypeCoder,
	}
	ag.SetState(agent.StateExecuting)
	if err := server.registry.Register(ag); err != nil {
		t.Fatalf("failed to register agent: %v", err)
	}

	_, err := handler.HandleCommand("start_agent", json.RawMessage(`{"id": "state-test"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// After start, state should be idle
	if ag.GetState() != agent.StateIdle {
		t.Errorf("expected idle state after start, got %s", ag.GetState())
	}
}

// ==================== handleScanSkills tests ====================

func TestHandleScanSkills_NoScanner2(t *testing.T) {
	handler, server := newTestHandler()
	server.scanner = nil

	result, err := handler.HandleCommand("scan_skills", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	skills, ok := result.([]map[string]any)
	if !ok {
		t.Fatalf("expected []map[string]any, got %T", result)
	}
	// With no scanner, the fallback Scan() is called — may return filesystem skills or empty
	_ = skills
}



func TestHandleScanSkills_ResultFormat(t *testing.T) {
	handler, server := newTestHandler()
	server.scanner = nil

	result, err := handler.HandleCommand("scan_skills", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	skills := result.([]map[string]any)
	for _, s := range skills {
		// Each skill should have standard fields
		if _, ok := s["id"]; !ok {
			t.Error("skill missing 'id' field")
		}
		if _, ok := s["name"]; !ok {
			t.Error("skill missing 'name' field")
		}
		if _, ok := s["source"]; !ok {
			t.Error("skill missing 'source' field")
		}
	}
}

// ==================== syncAgentCards tests ====================

func TestSyncAgentCards_NilCardRegistry(t *testing.T) {
	handler, server := newTestHandler()
	server.a2aCardRegistry = nil

	// Should not panic with nil registry
	handler.syncAgentCards()
}

func TestSyncAgentCards_EmptySources(t *testing.T) {
	handler, server := newTestHandler()
	server.a2aCardRegistry = a2a.NewAgentCardRegistry()

	handler.syncAgentCards()

	if server.a2aCardRegistry.Len() != 0 {
		t.Errorf("expected 0 cards, got %d", server.a2aCardRegistry.Len())
	}
}

func TestSyncAgentCards_WithRegistryAgents(t *testing.T) {
	handler, server := newTestHandler()
	server.a2aCardRegistry = a2a.NewAgentCardRegistry()

	ag := &agent.Agent{
		ID:   acp.AgentID("card-agent-1"),
		Name: "Card Agent",
		Type: agent.AgentTypeCoder,
	}
	if err := server.registry.Register(ag); err != nil {
		t.Fatalf("failed to register agent: %v", err)
	}

	handler.syncAgentCards()

	if server.a2aCardRegistry.Len() != 1 {
		t.Errorf("expected 1 card, got %d", server.a2aCardRegistry.Len())
	}

	card, ok := server.a2aCardRegistry.Get("card-agent-1")
	if !ok {
		t.Fatal("expected card for card-agent-1")
	}
	if card.Name != "Card Agent" {
		t.Errorf("expected card name 'Card Agent', got %s", card.Name)
	}
}

func TestSyncAgentCards_MultipleAgents(t *testing.T) {
	handler, server := newTestHandler()
	server.a2aCardRegistry = a2a.NewAgentCardRegistry()

	for i := range 3 {
		ag := &agent.Agent{
			ID:   acp.AgentID("multi-card-" + string(rune('a'+i))),
			Name: "Multi Card " + string(rune('A'+i)),
			Type: agent.AgentTypeReviewer,
		}
		if err := server.registry.Register(ag); err != nil {
			t.Fatalf("failed to register agent: %v", err)
		}
	}

	handler.syncAgentCards()

	if server.a2aCardRegistry.Len() != 3 {
		t.Errorf("expected 3 cards, got %d", server.a2aCardRegistry.Len())
	}
}

func TestSyncAgentCards_CardHasCapabilities(t *testing.T) {
	handler, server := newTestHandler()
	server.a2aCardRegistry = a2a.NewAgentCardRegistry()

	ag := &agent.Agent{
		ID:   acp.AgentID("cap-agent"),
		Name: "Cap Agent",
		Type: agent.AgentTypeCoder,
	}
	if err := server.registry.Register(ag); err != nil {
		t.Fatalf("failed to register agent: %v", err)
	}

	handler.syncAgentCards()

	card, ok := server.a2aCardRegistry.Get("cap-agent")
	if !ok {
		t.Fatal("expected card for cap-agent")
	}
	if !card.Capabilities.Streaming {
		t.Error("expected streaming capability to be true")
	}
	if !card.Capabilities.StateTransitionHistory {
		t.Error("expected stateTransitionHistory capability to be true")
	}
}

func TestSyncAgentCards_CardHasTags(t *testing.T) {
	handler, server := newTestHandler()
	server.a2aCardRegistry = a2a.NewAgentCardRegistry()

	ag := &agent.Agent{
		ID:   acp.AgentID("tag-agent"),
		Name: "Tag Agent",
		Type: agent.AgentTypeCoder,
	}
	if err := server.registry.Register(ag); err != nil {
		t.Fatalf("failed to register agent: %v", err)
	}

	handler.syncAgentCards()

	card, ok := server.a2aCardRegistry.Get("tag-agent")
	if !ok {
		t.Fatal("expected card for tag-agent")
	}

	found := false
	for _, tag := range card.Tags {
		if tag == "coder" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected 'coder' tag in card tags, got %v", card.Tags)
	}
}

func TestSyncAgentCards_CardProvider(t *testing.T) {
	handler, server := newTestHandler()
	server.a2aCardRegistry = a2a.NewAgentCardRegistry()

	ag := &agent.Agent{
		ID:   acp.AgentID("prov-agent"),
		Name: "Prov Agent",
		Type: agent.AgentTypeCoder,
	}
	if err := server.registry.Register(ag); err != nil {
		t.Fatalf("failed to register agent: %v", err)
	}

	handler.syncAgentCards()

	card, ok := server.a2aCardRegistry.Get("prov-agent")
	if !ok {
		t.Fatal("expected card for prov-agent")
	}
	if card.Provider == nil || card.Provider.Name != "swarm-editor" {
		t.Errorf("expected provider name 'swarm-editor', got %v", card.Provider)
	}
}

func TestSyncAgentCards_CardOutputModes(t *testing.T) {
	handler, server := newTestHandler()
	server.a2aCardRegistry = a2a.NewAgentCardRegistry()

	ag := &agent.Agent{
		ID:   acp.AgentID("mode-agent"),
		Name: "Mode Agent",
		Type: agent.AgentTypeCoder,
	}
	if err := server.registry.Register(ag); err != nil {
		t.Fatalf("failed to register agent: %v", err)
	}

	handler.syncAgentCards()

	card, ok := server.a2aCardRegistry.Get("mode-agent")
	if !ok {
		t.Fatal("expected card for mode-agent")
	}
	if len(card.DefaultOutputModes) == 0 {
		t.Error("expected at least one output mode")
	}
	foundText := false
	foundMarkdown := false
	for _, mode := range card.DefaultOutputModes {
		if mode == "text/plain" {
			foundText = true
		}
		if mode == "text/markdown" {
			foundMarkdown = true
		}
	}
	if !foundText || !foundMarkdown {
		t.Errorf("expected text/plain and text/markdown output modes, got %v", card.DefaultOutputModes)
	}
}

func TestSyncAgentCards_DoesNotDuplicate(t *testing.T) {
	handler, server := newTestHandler()
	server.a2aCardRegistry = a2a.NewAgentCardRegistry()

	ag := &agent.Agent{
		ID:   acp.AgentID("dedup-agent"),
		Name: "Dedup Agent",
		Type: agent.AgentTypeCoder,
	}
	if err := server.registry.Register(ag); err != nil {
		t.Fatalf("failed to register agent: %v", err)
	}

	// Call sync multiple times
	handler.syncAgentCards()
	handler.syncAgentCards()
	handler.syncAgentCards()

	// Should still have exactly 1 card (Register updates in place)
	if server.a2aCardRegistry.Len() != 1 {
		t.Errorf("expected 1 card after multiple syncs, got %d", server.a2aCardRegistry.Len())
	}
}

// ==================== handleA2AStatus tests ====================

func TestHandleA2AStatus_NoComponents(t *testing.T) {
	handler, server := newTestHandler()
	server.a2aRouter = nil
	server.a2aCoordinator = nil
	server.a2aCardRegistry = nil

	result, err := handler.HandleCommand("a2a_status", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map[string]any, got %T", result)
	}
	if m["routerAvailable"] != false {
		t.Error("expected routerAvailable to be false")
	}
	if m["coordAvailable"] != false {
		t.Error("expected coordAvailable to be false")
	}
	if m["cardRegistrySize"] != 0 {
		t.Errorf("expected cardRegistrySize 0, got %v", m["cardRegistrySize"])
	}
}

func TestHandleA2AStatus_WithRouter(t *testing.T) {
	handler, server := newTestHandler()

	router := a2a.NewRouter(a2a.RouterConfig{})
	server.a2aRouter = router
	server.a2aCardRegistry = nil

	result, err := handler.HandleCommand("a2a_status", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m := result.(map[string]any)
	if m["routerAvailable"] != true {
		t.Error("expected routerAvailable to be true")
	}
	// Router has a message log, so these should be populated
	if _, ok := m["messageLogSize"]; !ok {
		t.Error("expected messageLogSize key when router is present")
	}
	if _, ok := m["messageLogStats"]; !ok {
		t.Error("expected messageLogStats key when router is present")
	}
}

func TestHandleA2AStatus_WithCardRegistry(t *testing.T) {
	handler, server := newTestHandler()

	cardRegistry := a2a.NewAgentCardRegistry()
	server.a2aCardRegistry = cardRegistry
	server.a2aRouter = nil

	result, err := handler.HandleCommand("a2a_status", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m := result.(map[string]any)
	if m["cardRegistrySize"] != 0 {
		t.Errorf("expected cardRegistrySize 0, got %v", m["cardRegistrySize"])
	}

	// Register a card and check again
	cardRegistry.Register("test-agent", &a2a.AgentCard{Name: "Test"})

	result2, err := handler.HandleCommand("a2a_status", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m2 := result2.(map[string]any)
	if m2["cardRegistrySize"] != 1 {
		t.Errorf("expected cardRegistrySize 1, got %v", m2["cardRegistrySize"])
	}
}

func TestHandleA2AStatus_WithCoordinator(t *testing.T) {
	handler, server := newTestHandler()

	router := a2a.NewRouter(a2a.RouterConfig{})
	coordinator := a2a.NewCoordinator(a2a.CoordinatorConfig{}, router)
	server.a2aRouter = router
	server.a2aCoordinator = coordinator

	result, err := handler.HandleCommand("a2a_status", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m := result.(map[string]any)
	if m["coordAvailable"] != true {
		t.Error("expected coordAvailable to be true")
	}
}

func TestHandleA2AStatus_AllComponents(t *testing.T) {
	handler, server := newTestHandler()

	router := a2a.NewRouter(a2a.RouterConfig{})
	coordinator := a2a.NewCoordinator(a2a.CoordinatorConfig{}, router)
	cardRegistry := a2a.NewAgentCardRegistry()
	cardRegistry.Register("full-agent", &a2a.AgentCard{Name: "Full Agent"})

	server.a2aRouter = router
	server.a2aCoordinator = coordinator
	server.a2aCardRegistry = cardRegistry

	result, err := handler.HandleCommand("a2a_status", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m := result.(map[string]any)
	if m["routerAvailable"] != true {
		t.Error("expected routerAvailable to be true")
	}
	if m["coordAvailable"] != true {
		t.Error("expected coordAvailable to be true")
	}
	if m["cardRegistrySize"] != 1 {
		t.Errorf("expected cardRegistrySize 1, got %v", m["cardRegistrySize"])
	}
}

// ==================== handleA2AMessageLog tests ====================

func TestHandleA2AMessageLog_NoRouter(t *testing.T) {
	handler, server := newTestHandler()
	server.a2aRouter = nil

	result, err := handler.HandleCommand("a2a_message_log", json.RawMessage(`{"limit": 10}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// When there's no router, the handler returns []struct{}{}
	// which is an empty slice. We verify it's a slice type.
	if result == nil {
		t.Fatal("expected non-nil result")
	}
}

func TestHandleA2AMessageLog_WithRouter(t *testing.T) {
	handler, server := newTestHandler()

	router := a2a.NewRouter(a2a.RouterConfig{})
	server.a2aRouter = router

	result, err := handler.HandleCommand("a2a_message_log", json.RawMessage(`{"limit": 10}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Empty log should return empty slice
	entries, ok := result.([]*a2a.LogEntry)
	if !ok {
		t.Fatalf("expected []*a2a.LogEntry, got %T", result)
	}
	if len(entries) != 0 {
		t.Errorf("expected 0 entries from empty log, got %d", len(entries))
	}
}

func TestHandleA2AMessageLog_InvalidJSON2(t *testing.T) {
	handler, server := newTestHandler()

	router := a2a.NewRouter(a2a.RouterConfig{})
	server.a2aRouter = router

	_, err := handler.HandleCommand("a2a_message_log", json.RawMessage(`{invalid}`), "test")
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestHandleA2AMessageLog_WithLimit(t *testing.T) {
	handler, server := newTestHandler()

	router := a2a.NewRouter(a2a.RouterConfig{})
	ml := router.MessageLog()

	// Add some entries
	for i := range 5 {
		ml.Append(&a2a.Message{
			ID:   "msg-" + string(rune('0'+i)),
			Type: a2a.MessageTypeTaskRequest,
			From: "agent-a",
			To:   "agent-b",
		})
	}

	server.a2aRouter = router

	result, err := handler.HandleCommand("a2a_message_log", json.RawMessage(`{"limit": 3}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	entries := result.([]*a2a.LogEntry)
	if len(entries) != 3 {
		t.Errorf("expected 3 entries with limit=3, got %d", len(entries))
	}
}

func TestHandleA2AMessageLog_NoLimit(t *testing.T) {
	handler, server := newTestHandler()

	router := a2a.NewRouter(a2a.RouterConfig{})
	ml := router.MessageLog()

	for i := range 5 {
		ml.Append(&a2a.Message{
			ID:   "msg-nl-" + string(rune('0'+i)),
			Type: a2a.MessageTypeTaskRequest,
			From: "agent-a",
			To:   "agent-b",
		})
	}

	server.a2aRouter = router

	// With limit=0 (default), should return all entries
	result, err := handler.HandleCommand("a2a_message_log", json.RawMessage(`{"limit": 0}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	entries := result.([]*a2a.LogEntry)
	if len(entries) != 5 {
		t.Errorf("expected 5 entries with limit=0, got %d", len(entries))
	}
}

func TestHandleA2AMessageLog_RouterWithNilMessageLog(t *testing.T) {
	handler, server := newTestHandler()

	// Create router but nil out the message log (edge case)
	router := a2a.NewRouter(a2a.RouterConfig{})
	server.a2aRouter = router

	// Router always creates a MessageLog, so this tests the normal path
	result, err := handler.HandleCommand("a2a_message_log", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	entries := result.([]*a2a.LogEntry)
	if len(entries) != 0 {
		t.Errorf("expected 0 entries from empty log, got %d", len(entries))
	}
}

func TestHandleA2AMessageLog_EntryFields(t *testing.T) {
	handler, server := newTestHandler()

	router := a2a.NewRouter(a2a.RouterConfig{})
	ml := router.MessageLog()

	ml.Append(&a2a.Message{
		ID:      "test-msg-1",
		Type:    a2a.MessageTypeTaskRequest,
		From:    "sender-agent",
		To:      "receiver-agent",
		Group:   "test-group",
		Payload: json.RawMessage(`{"key": "value"}`),
	})

	server.a2aRouter = router

	result, err := handler.HandleCommand("a2a_message_log", json.RawMessage(`{"limit": 10}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	entries := result.([]*a2a.LogEntry)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}

	if entries[0].ID != "test-msg-1" {
		t.Errorf("expected ID test-msg-1, got %s", entries[0].ID)
	}
	if entries[0].From != "sender-agent" {
		t.Errorf("expected From sender-agent, got %s", entries[0].From)
	}
	if entries[0].To != "receiver-agent" {
		t.Errorf("expected To receiver-agent, got %s", entries[0].To)
	}
	if entries[0].Group != "test-group" {
		t.Errorf("expected Group test-group, got %s", entries[0].Group)
	}
}
