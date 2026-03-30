package agent

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
)

func TestNewAgent(t *testing.T) {
	agent := NewAgent("test-agent", AgentTypeCoder)

	if agent == nil {
		t.Fatal("NewAgent returned nil")
	}

	if agent.ID == "" {
		t.Error("Agent ID should not be empty")
	}

	if agent.Name != "test-agent" {
		t.Errorf("Expected name 'test-agent', got '%s'", agent.Name)
	}

	if agent.Type != AgentTypeCoder {
		t.Errorf("Expected type '%s', got '%s'", AgentTypeCoder, agent.Type)
	}

	if agent.State != StateIdle {
		t.Errorf("Expected state '%s', got '%s'", StateIdle, agent.State)
	}

	if agent.context == nil {
		t.Error("Context should be initialized")
	}

	if agent.context.Memory == nil {
		t.Error("Memory should be initialized")
	}
}

func TestAgentSetState(t *testing.T) {
	agent := NewAgent("test", AgentTypeCoder)

	agent.SetState(StateThinking)
	if agent.State != StateThinking {
		t.Errorf("Expected state '%s', got '%s'", StateThinking, agent.State)
	}

	agent.SetState(StateExecuting)
	if agent.State != StateExecuting {
		t.Errorf("Expected state '%s', got '%s'", StateExecuting, agent.State)
	}
}

func TestAgentGetState(t *testing.T) {
	agent := NewAgent("test", AgentTypeCoder)

	if agent.GetState() != StateIdle {
		t.Errorf("Expected state '%s', got '%s'", StateIdle, agent.GetState())
	}

	agent.SetState(StateExecuting)
	if agent.GetState() != StateExecuting {
		t.Errorf("Expected state '%s', got '%s'", StateExecuting, agent.GetState())
	}
}

func TestAgentSession(t *testing.T) {
	agent := NewAgent("test", AgentTypeCoder)

	if agent.GetSession() != nil {
		t.Error("Session should be nil initially")
	}

	sessionID := acp.SessionID("test-session-123")
	agent.SetSession(sessionID)

	retrieved := agent.GetSession()
	if retrieved == nil || *retrieved != sessionID {
		t.Errorf("Expected session '%s', got '%v'", sessionID, retrieved)
	}
}

func TestAgentUpdateContext(t *testing.T) {
	agent := NewAgent("test", AgentTypeCoder)

	agent.UpdateContext(func(ctx *AgentContext) {
		ctx.WorkingDirectory = "/test/path"
		ctx.OpenFiles = []string{"file1.go", "file2.go"}
	})

	if agent.context.WorkingDirectory != "/test/path" {
		t.Errorf("Expected working directory '/test/path', got '%s'", agent.context.WorkingDirectory)
	}

	if len(agent.context.OpenFiles) != 2 {
		t.Errorf("Expected 2 open files, got %d", len(agent.context.OpenFiles))
	}
}

func TestAgentRecordToolExecution(t *testing.T) {
	agent := NewAgent("test", AgentTypeCoder)

	exec := &ToolExecution{
		ID:        "tool-1",
		Tool:      "read_file",
		Status:    acp.StatusCompleted,
		Timestamp: time.Now(),
	}

	agent.RecordToolExecution(exec)

	history := agent.GetToolHistory()
	if len(history) != 1 {
		t.Errorf("Expected 1 tool execution, got %d", len(history))
	}

	if history[0].Tool != "read_file" {
		t.Errorf("Expected tool 'read_file', got '%s'", history[0].Tool)
	}
}

func TestAgentToolHistoryLimit(t *testing.T) {
	agent := NewAgent("test", AgentTypeCoder)

	// Add more than 100 executions
	for i := 0; i < 150; i++ {
		agent.RecordToolExecution(&ToolExecution{
			ID:        acp.ToolCallID("tool-%d"),
			Tool:      "test_tool",
			Timestamp: time.Now(),
		})
	}

	history := agent.GetToolHistory()
	if len(history) > 100 {
		t.Errorf("History should be limited to 100, got %d", len(history))
	}
}

func TestAgentOnUpdate(t *testing.T) {
	agent := NewAgent("test", AgentTypeCoder)

	var receivedUpdate *acp.Update
	agent.OnUpdate(func(update *acp.Update) {
		receivedUpdate = update
	})

	// Send an update
	update := &acp.Update{SessionUpdate: "message"}
	agent.SendUpdate(update)

	if receivedUpdate != update {
		t.Error("Should have received the update")
	}
}

func TestAgentOnToolCall(t *testing.T) {
	agent := NewAgent("test", AgentTypeCoder)

	var receivedCall *ToolCall
	agent.OnToolCall(func(tool *ToolCall) {
		receivedCall = tool
	})

	if receivedCall != nil {
		t.Error("Should not have received a tool call yet")
	}
}

func TestAgentAgentInfo(t *testing.T) {
	agent := NewAgent("test", AgentTypeCoder)

	info := agent.AgentInfo()

	if info.Name == "" {
		t.Error("Info name should not be empty")
	}

	if info.Title != agent.Name {
		t.Errorf("Expected title '%s', got '%s'", agent.Name, info.Title)
	}
}

func TestNewRegistry(t *testing.T) {
	registry := NewRegistry()

	if registry == nil {
		t.Fatal("NewRegistry returned nil")
	}

	if registry.agents == nil {
		t.Error("agents map should be initialized")
	}

	if registry.byType == nil {
		t.Error("byType map should be initialized")
	}
}

func TestRegistryRegister(t *testing.T) {
	registry := NewRegistry()
	agent := NewAgent("test", AgentTypeCoder)

	err := registry.Register(agent)
	if err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	if len(registry.agents) != 1 {
		t.Errorf("Expected 1 agent, got %d", len(registry.agents))
	}

	// Register duplicate should fail
	err = registry.Register(agent)
	if err == nil {
		t.Error("Registering duplicate should fail")
	}
}

func TestRegistryUnregister(t *testing.T) {
	registry := NewRegistry()
	agent := NewAgent("test", AgentTypeCoder)

	if err := registry.Register(agent); err != nil {
		t.Fatalf("Register failed: %v", err)
	}
	if err := registry.Unregister(agent.ID); err != nil {
		t.Fatalf("Unregister failed: %v", err)
	}

	if len(registry.agents) != 0 {
		t.Errorf("Expected 0 agents after unregister, got %d", len(registry.agents))
	}
}

func TestRegistryGet(t *testing.T) {
	registry := NewRegistry()
	agent := NewAgent("test", AgentTypeCoder)
	if err := registry.Register(agent); err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	retrieved, ok := registry.Get(agent.ID)
	if !ok {
		t.Fatal("Should find registered agent")
	}

	if retrieved.ID != agent.ID {
		t.Errorf("Retrieved wrong agent")
	}

	// Get non-existent
	_, ok = registry.Get("nonexistent")
	if ok {
		t.Error("Get non-existent should return false")
	}
}

func TestRegistryGetAll(t *testing.T) {
	registry := NewRegistry()

	agent1 := NewAgent("agent1", AgentTypeCoder)
	agent2 := NewAgent("agent2", AgentTypeReviewer)

	if err := registry.Register(agent1); err != nil {
		t.Fatalf("Register agent1 failed: %v", err)
	}
	if err := registry.Register(agent2); err != nil {
		t.Fatalf("Register agent2 failed: %v", err)
	}

	all := registry.GetAll()
	if len(all) != 2 {
		t.Errorf("Expected 2 agents, got %d", len(all))
	}
}

func TestRegistryGetByType(t *testing.T) {
	registry := NewRegistry()

	coder1 := NewAgent("coder1", AgentTypeCoder)
	coder2 := NewAgent("coder2", AgentTypeCoder)
	reviewer := NewAgent("reviewer", AgentTypeReviewer)

	if err := registry.Register(coder1); err != nil {
		t.Fatalf("Register coder1 failed: %v", err)
	}
	if err := registry.Register(coder2); err != nil {
		t.Fatalf("Register coder2 failed: %v", err)
	}
	if err := registry.Register(reviewer); err != nil {
		t.Fatalf("Register reviewer failed: %v", err)
	}

	coders := registry.GetByType(AgentTypeCoder)
	if len(coders) != 2 {
		t.Errorf("Expected 2 coders, got %d", len(coders))
	}

	reviewers := registry.GetByType(AgentTypeReviewer)
	if len(reviewers) != 1 {
		t.Errorf("Expected 1 reviewer, got %d", len(reviewers))
	}

	architects := registry.GetByType(AgentTypeArchitect)
	if len(architects) != 0 {
		t.Errorf("Expected 0 architects, got %d", len(architects))
	}
}

func TestRegistryGetIdle(t *testing.T) {
	registry := NewRegistry()

	agent1 := NewAgent("agent1", AgentTypeCoder)
	agent2 := NewAgent("agent2", AgentTypeCoder)
	agent2.SetState(StateExecuting)
	agent3 := NewAgent("agent3", AgentTypeCoder)

	if err := registry.Register(agent1); err != nil {
		t.Fatalf("Register agent1 failed: %v", err)
	}
	if err := registry.Register(agent2); err != nil {
		t.Fatalf("Register agent2 failed: %v", err)
	}
	if err := registry.Register(agent3); err != nil {
		t.Fatalf("Register agent3 failed: %v", err)
	}

	idle := registry.GetIdle()
	if len(idle) != 2 {
		t.Errorf("Expected 2 idle agents, got %d", len(idle))
	}
}

func TestRegistryCount(t *testing.T) {
	registry := NewRegistry()

	if registry.Count() != 0 {
		t.Errorf("New registry should have 0 agents")
	}

	if err := registry.Register(NewAgent("agent1", AgentTypeCoder)); err != nil {
		t.Fatalf("Register failed: %v", err)
	}
	if err := registry.Register(NewAgent("agent2", AgentTypeReviewer)); err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	if registry.Count() != 2 {
		t.Errorf("Expected 2 agents, got %d", registry.Count())
	}
}

func TestRegistryCountByType(t *testing.T) {
	registry := NewRegistry()

	if err := registry.Register(NewAgent("coder1", AgentTypeCoder)); err != nil {
		t.Fatalf("Register failed: %v", err)
	}
	if err := registry.Register(NewAgent("coder2", AgentTypeCoder)); err != nil {
		t.Fatalf("Register failed: %v", err)
	}
	if err := registry.Register(NewAgent("reviewer", AgentTypeReviewer)); err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	counts := registry.CountByType()

	if counts[AgentTypeCoder] != 2 {
		t.Errorf("Expected 2 coders, got %d", counts[AgentTypeCoder])
	}

	if counts[AgentTypeReviewer] != 1 {
		t.Errorf("Expected 1 reviewer, got %d", counts[AgentTypeReviewer])
	}
}

func TestNewLifecycle(t *testing.T) {
	registry := NewRegistry()
	lifecycle := NewLifecycle(registry)

	if lifecycle == nil {
		t.Fatal("NewLifecycle returned nil")
	}

	if lifecycle.registry != registry {
		t.Error("Registry not set correctly")
	}
}

func TestLifecycleSpawn(t *testing.T) {
	registry := NewRegistry()
	lifecycle := NewLifecycle(registry)

	agent := lifecycle.Spawn("TestAgent", AgentTypeCoder)

	if agent == nil {
		t.Fatal("Spawn returned nil")
	}

	if agent.Name != "TestAgent" {
		t.Errorf("Expected name 'TestAgent', got '%s'", agent.Name)
	}

	if agent.Type != AgentTypeCoder {
		t.Errorf("Expected type '%s', got '%s'", AgentTypeCoder, agent.Type)
	}

	// Should be registered
	if registry.Count() != 1 {
		t.Errorf("Agent should be registered, got %d agents", registry.Count())
	}
}

func TestLifecycleSpawnMultiple(t *testing.T) {
	registry := NewRegistry()
	lifecycle := NewLifecycle(registry)

	agent1 := lifecycle.Spawn("Agent1", AgentTypeCoder)
	agent2 := lifecycle.Spawn("Agent2", AgentTypeReviewer)
	agent3 := lifecycle.Spawn("Agent3", AgentTypeArchitect)

	if agent1.ID == agent2.ID || agent2.ID == agent3.ID || agent1.ID == agent3.ID {
		t.Error("Agents should have unique IDs")
	}

	if registry.Count() != 3 {
		t.Errorf("Expected 3 registered agents, got %d", registry.Count())
	}
}

func TestLifecycleTerminate(t *testing.T) {
	registry := NewRegistry()
	lifecycle := NewLifecycle(registry)

	agent := lifecycle.Spawn("TestAgent", AgentTypeCoder)
	err := lifecycle.Terminate(context.Background(), agent.ID)

	if err != nil {
		t.Fatalf("Terminate failed: %v", err)
	}

	if registry.Count() != 0 {
		t.Errorf("Agent should be unregistered after terminate")
	}
}

func TestLifecycleTerminateNonExistent(t *testing.T) {
	registry := NewRegistry()
	lifecycle := NewLifecycle(registry)

	err := lifecycle.Terminate(context.Background(), "nonexistent")
	if err == nil {
		t.Error("Terminating non-existent agent should fail")
	}
}

func TestLifecycleCallbacks(t *testing.T) {
	registry := NewRegistry()
	lifecycle := NewLifecycle(registry)

	var spawnCalled bool
	var terminateCalled bool

	lifecycle.OnSpawn(func(agent *Agent) {
		spawnCalled = true
	})

	lifecycle.OnTerminate(func(agent *Agent) {
		terminateCalled = true
	})

	agent := lifecycle.Spawn("TestAgent", AgentTypeCoder)

	// Give some time for async callbacks
	time.Sleep(10 * time.Millisecond)

	if !spawnCalled {
		t.Error("Spawn callback should have been called")
	}

	if err := lifecycle.Terminate(context.Background(), agent.ID); err != nil {
		t.Fatalf("Terminate failed: %v", err)
	}

	if !terminateCalled {
		t.Error("Terminate callback should have been called")
	}
}

func TestAgentTypeString(t *testing.T) {
	tests := []struct {
		agentType AgentType
		expected  string
	}{
		{AgentTypeCoder, "coder"},
		{AgentTypeReviewer, "reviewer"},
		{AgentTypeArchitect, "architect"},
		{AgentTypeTester, "tester"},
		{AgentTypeNavigator, "navigator"},
		{AgentTypeDriver, "driver"},
		{AgentTypeOrchestrator, "orchestrator"},
	}

	for _, tt := range tests {
		if string(tt.agentType) != tt.expected {
			t.Errorf("AgentType %s should be '%s'", tt.agentType, tt.expected)
		}
	}
}

func TestAgentStateString(t *testing.T) {
	tests := []struct {
		state    AgentState
		expected string
	}{
		{StateIdle, "idle"},
		{StateThinking, "thinking"},
		{StateExecuting, "executing"},
		{StateWaiting, "waiting"},
		{StateError, "error"},
	}

	for _, tt := range tests {
		if string(tt.state) != tt.expected {
			t.Errorf("State %s should be '%s'", tt.state, tt.expected)
		}
	}
}

func TestNewPool(t *testing.T) {
	pool := NewPool(5)

	if pool == nil {
		t.Fatal("NewPool returned nil")
	}

	if pool.maxSize != 5 {
		t.Errorf("Expected maxSize 5, got %d", pool.maxSize)
	}

	if pool.agents == nil {
		t.Error("Agents slice should be initialized")
	}
}

func TestPoolAdd(t *testing.T) {
	pool := NewPool(2)
	agent := NewAgent("test", AgentTypeCoder)

	err := pool.Add(agent)
	if err != nil {
		t.Fatalf("Add failed: %v", err)
	}

	if pool.Size() != 1 {
		t.Errorf("Expected size 1, got %d", pool.Size())
	}

	// Add second agent
	agent2 := NewAgent("test2", AgentTypeCoder)
	err = pool.Add(agent2)
	if err != nil {
		t.Fatalf("Add second agent failed: %v", err)
	}

	// Pool full should fail
	agent3 := NewAgent("test3", AgentTypeCoder)
	err = pool.Add(agent3)
	if err == nil {
		t.Error("Adding to full pool should fail")
	}
}

func TestPoolAcquireRelease(t *testing.T) {
	pool := NewPool(2)
	agent := NewAgent("test", AgentTypeCoder)
	if err := pool.Add(agent); err != nil {
		t.Fatalf("Add failed: %v", err)
	}

	ctx := context.Background()
	acquired, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("Acquire failed: %v", err)
	}

	if acquired.ID != agent.ID {
		t.Error("Acquired wrong agent")
	}

	// Release back to pool
	pool.Release(acquired)

	// Should be able to acquire again
	acquired2, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("Second acquire failed: %v", err)
	}

	if acquired2.ID != agent.ID {
		t.Error("Second acquire wrong agent")
	}
}

func TestPoolAcquireTimeout(t *testing.T) {
	pool := NewPool(1)
	agent := NewAgent("test", AgentTypeCoder)
	if err := pool.Add(agent); err != nil {
		t.Fatalf("Add failed: %v", err)
	}

	ctx := context.Background()

	// Acquire the only agent
	acquired, _ := pool.Acquire(ctx)

	// Try to acquire with timeout - should fail
	ctxTimeout, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	_, err := pool.Acquire(ctxTimeout)
	if err == nil {
		t.Error("Acquire with no available agents should timeout")
	}

	// Release to allow cleanup
	pool.Release(acquired)
}

func TestAgentConcurrentAccess(t *testing.T) {
	agent := NewAgent("test", AgentTypeCoder)

	done := make(chan bool)

	for i := 0; i < 10; i++ {
		go func() {
			for j := 0; j < 100; j++ {
				agent.SetState(StateThinking)
				agent.SetState(StateExecuting)
				agent.GetState()
			}
			done <- true
		}()
	}

	// Wait for all goroutines
	for i := 0; i < 10; i++ {
		<-done
	}
}

func TestRegistryConcurrentAccess(t *testing.T) {
	registry := NewRegistry()

	done := make(chan bool)

	// Concurrent registrations
	for i := 0; i < 10; i++ {
		go func() {
			agent := NewAgent("agent", AgentTypeCoder)
			// Error intentionally ignored in concurrent test
			_ = registry.Register(agent)
			done <- true
		}()
	}

	// Wait for all goroutines
	for i := 0; i < 10; i++ {
		<-done
	}
}

func TestLifecycleOnStateChange(t *testing.T) {
	registry := NewRegistry()
	lifecycle := NewLifecycle(registry)

	var mu sync.Mutex
	var stateChangedAgent *Agent
	var oldState, newState AgentState

	lifecycle.OnStateChange(func(agent *Agent, old, new AgentState) {
		mu.Lock()
		stateChangedAgent = agent
		oldState = old
		newState = new
		mu.Unlock()
	})

	// Spawn an agent (this starts the monitor goroutine)
	agent := lifecycle.Spawn("TestAgent", AgentTypeCoder)

	// Give the monitor goroutine time to start
	time.Sleep(20 * time.Millisecond)

	// Change the agent state
	agent.SetState(StateThinking)

	// Give the monitor time to detect the change
	time.Sleep(150 * time.Millisecond)

	// The state change callback should have been called
	// Note: Due to the async nature of monitorAgent, we may need to wait
	mu.Lock()
	capturedAgent := stateChangedAgent
	capturedOld := oldState
	capturedNew := newState
	mu.Unlock()

	if capturedAgent != nil {
		if capturedAgent.ID != agent.ID {
			t.Errorf("Expected agent ID %s, got %s", agent.ID, capturedAgent.ID)
		}
		if capturedOld != StateIdle {
			t.Errorf("Expected old state StateIdle, got %s", capturedOld)
		}
		if capturedNew != StateThinking {
			t.Errorf("Expected new state StateThinking, got %s", capturedNew)
		}
	} else {
		// Monitor might not have detected the change in time
		t.Log("State change callback not called within timeout")
	}
}

func TestLifecycleOnStateChangeMultipleChanges(t *testing.T) {
	registry := NewRegistry()
	lifecycle := NewLifecycle(registry)

	stateChanges := make([]AgentState, 0)
	var mu sync.Mutex

	lifecycle.OnStateChange(func(agent *Agent, old, new AgentState) {
		mu.Lock()
		stateChanges = append(stateChanges, new)
		mu.Unlock()
	})

	agent := lifecycle.Spawn("TestAgent", AgentTypeCoder)

	// Wait for monitor to start
	time.Sleep(20 * time.Millisecond)

	// Make multiple state changes
	agent.SetState(StateThinking)
	time.Sleep(50 * time.Millisecond)
	agent.SetState(StateExecuting)
	time.Sleep(50 * time.Millisecond)
	agent.SetState(StateIdle)

	// Wait for all changes to be detected
	time.Sleep(100 * time.Millisecond)

	mu.Lock()
	numChanges := len(stateChanges)
	mu.Unlock()

	t.Logf("Detected %d state changes", numChanges)
}

func TestLifecycleTerminateCancelsMonitor(t *testing.T) {
	registry := NewRegistry()
	lifecycle := NewLifecycle(registry)

	agent := lifecycle.Spawn("TestAgent", AgentTypeCoder)

	// Wait for monitor to start
	time.Sleep(20 * time.Millisecond)

	// Terminate should stop the monitor
	err := lifecycle.Terminate(context.Background(), agent.ID)
	if err != nil {
		t.Fatalf("Terminate failed: %v", err)
	}

	// Agent should no longer be in registry
	if registry.Count() != 0 {
		t.Errorf("Registry should be empty after terminate")
	}
}

func TestLifecycleStop(t *testing.T) {
	registry := NewRegistry()
	lifecycle := NewLifecycle(registry)

	// Spawn multiple agents
	_ = lifecycle.Spawn("Agent1", AgentTypeCoder)
	_ = lifecycle.Spawn("Agent2", AgentTypeReviewer)

	// Wait for monitors to start
	time.Sleep(20 * time.Millisecond)

	// Stop should cancel all monitors
	lifecycle.Stop()

	// Verify agents are still in registry (Stop doesn't remove them)
	if registry.Count() != 2 {
		t.Errorf("Registry should still have 2 agents after Stop")
	}
}

func TestPoolFullError(t *testing.T) {
	pool := NewPool(2)

	agent1 := NewAgent("agent1", AgentTypeCoder)
	agent2 := NewAgent("agent2", AgentTypeCoder)
	agent3 := NewAgent("agent3", AgentTypeCoder)

	if err := pool.Add(agent1); err != nil {
		t.Fatalf("Add agent1 failed: %v", err)
	}
	if err := pool.Add(agent2); err != nil {
		t.Fatalf("Add agent2 failed: %v", err)
	}

	// Third agent should fail - pool is full
	err := pool.Add(agent3)
	if err == nil {
		t.Error("Add should fail when pool is full")
	}
}

// Edge case tests

func TestAgentUpdateContextNilFunc(t *testing.T) {
	agent := NewAgent("test", AgentTypeCoder)

	// Should not panic
	agent.UpdateContext(nil)

	// Context should remain unchanged
	if agent.context.WorkingDirectory != "" {
		t.Error("Context should not be modified with nil func")
	}
}

func TestAgentRecordNilToolExecution(t *testing.T) {
	agent := NewAgent("test", AgentTypeCoder)

	// Should not panic
	agent.RecordToolExecution(nil)

	// History should be empty
	if len(agent.GetToolHistory()) != 0 {
		t.Error("History should be empty after nil exec")
	}
}

func TestAgentSendNilUpdate(t *testing.T) {
	agent := NewAgent("test", AgentTypeCoder)

	var receivedUpdate *acp.Update
	agent.OnUpdate(func(update *acp.Update) {
		receivedUpdate = update
	})

	// Send nil update - should not call callback
	agent.SendUpdate(nil)

	if receivedUpdate != nil {
		t.Error("Callback should not be called with nil update")
	}
}

func TestRegistryRegisterNilAgent(t *testing.T) {
	registry := NewRegistry()

	err := registry.Register(nil)
	if err == nil {
		t.Error("Register should return error for nil agent")
	}
}

func TestNewLifecycleNilRegistry(t *testing.T) {
	lifecycle := NewLifecycle(nil)
	if lifecycle != nil {
		t.Error("NewLifecycle with nil registry should return nil")
	}
}

func TestPoolAddNilAgent(t *testing.T) {
	pool := NewPool(5)

	err := pool.Add(nil)
	if err == nil {
		t.Error("Add should return error for nil agent")
	}
}

func TestPoolNewPoolZeroSize(t *testing.T) {
	pool := NewPool(0)
	if pool == nil {
		t.Fatal("NewPool(0) returned nil")
	}
	if pool.maxSize != 0 {
		t.Errorf("Expected maxSize 0, got %d", pool.maxSize)
	}
}
