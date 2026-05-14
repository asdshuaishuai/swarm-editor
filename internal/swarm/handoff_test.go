package swarm

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
)

func TestHandoffState(t *testing.T) {
	tests := []struct {
		state    HandoffState
		expected string
	}{
		{HandoffStatePending, "pending"},
		{HandoffStateAccepted, "accepted"},
		{HandoffStateRejected, "rejected"},
		{HandoffStateCompleted, "completed"},
	}

	for _, tt := range tests {
		t.Run(string(tt.state), func(t *testing.T) {
			if string(tt.state) != tt.expected {
				t.Errorf("expected %s, got %s", tt.expected, tt.state)
			}
		})
	}
}

func TestHandoffRequest(t *testing.T) {
	now := time.Now()
	req := &HandoffRequest{
		ID:        "test-id",
		FromAgent: "agent-1",
		ToAgent:   "agent-2",
		TaskID:    "task-1",
		Reason:    "test handoff",
		Status:    HandoffStatePending,
		CreatedAt: now,
	}

	if req.ID != "test-id" {
		t.Errorf("expected ID test-id, got %s", req.ID)
	}
	if req.FromAgent != "agent-1" {
		t.Errorf("expected FromAgent agent-1, got %s", req.FromAgent)
	}
	if req.ToAgent != "agent-2" {
		t.Errorf("expected ToAgent agent-2, got %s", req.ToAgent)
	}
	if req.Status != HandoffStatePending {
		t.Errorf("expected Status pending, got %s", req.Status)
	}
}

func TestHandoffContext(t *testing.T) {
	ctx := &HandoffContext{
		ConversationHistory: []acp.ContentBlock{
			{Type: "text", Text: "Hello"},
		},
		FilesModified: []string{"file1.go", "file2.go"},
		CurrentState:  "in_progress",
		NextSteps:     []string{"step1", "step2"},
		Instructions:  "Continue from here",
		Metadata: map[string]interface{}{
			"key": "value",
		},
	}

	if len(ctx.ConversationHistory) != 1 {
		t.Errorf("expected 1 conversation history item, got %d", len(ctx.ConversationHistory))
	}
	if len(ctx.FilesModified) != 2 {
		t.Errorf("expected 2 files modified, got %d", len(ctx.FilesModified))
	}
	if ctx.CurrentState != "in_progress" {
		t.Errorf("expected CurrentState in_progress, got %s", ctx.CurrentState)
	}
}

func TestNewHandoffManager(t *testing.T) {
	registry := agent.NewRegistry()
	hm := NewHandoffManager(registry)

	if hm == nil {
		t.Fatal("expected non-nil HandoffManager")
	}
	if hm.registry != registry {
		t.Error("registry not set correctly")
	}
	if hm.maxPendingHandoffs != 5 {
		t.Errorf("expected maxPendingHandoffs 5, got %d", hm.maxPendingHandoffs)
	}
	if hm.handoffTimeout != 30*time.Second {
		t.Errorf("expected handoffTimeout 30s, got %v", hm.handoffTimeout)
	}
}

func TestRequestHandoff(t *testing.T) {
	registry := agent.NewRegistry()

	// Add test agents
	agent1 := agent.NewAgent("Test Agent 1", agent.AgentTypeCoder)
	agent2 := agent.NewAgent("Test Agent 2", agent.AgentTypeCoder)
	registry.Register(agent1)
	registry.Register(agent2)

	hm := NewHandoffManager(registry)

	ctx := context.Background()
	handoffCtx := &HandoffContext{
		CurrentState: "test",
	}

	req, err := hm.RequestHandoff(ctx, string(agent1.ID), string(agent2.ID), "task-1", "test reason", handoffCtx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if req.FromAgent != string(agent1.ID) {
		t.Errorf("expected FromAgent %s, got %s", agent1.ID, req.FromAgent)
	}
	if req.ToAgent != string(agent2.ID) {
		t.Errorf("expected ToAgent %s, got %s", agent2.ID, req.ToAgent)
	}
	if req.TaskID != "task-1" {
		t.Errorf("expected TaskID task-1, got %s", req.TaskID)
	}
	if req.Status != HandoffStatePending {
		t.Errorf("expected Status pending, got %s", req.Status)
	}

	// Check it's in pending
	pending := hm.GetPendingHandoffs()
	if len(pending) != 1 {
		t.Errorf("expected 1 pending handoff, got %d", len(pending))
	}
}

func TestRequestHandoffSourceAgentNotFound(t *testing.T) {
	registry := agent.NewRegistry()
	agent2 := agent.NewAgent("Test Agent 2", agent.AgentTypeCoder)
	registry.Register(agent2)

	hm := NewHandoffManager(registry)

	ctx := context.Background()
	_, err := hm.RequestHandoff(ctx, "agent-1", string(agent2.ID), "task-1", "test", nil)
	if err == nil {
		t.Error("expected error for non-existent source agent")
	}
}

func TestRequestHandoffTargetAgentNotFound(t *testing.T) {
	registry := agent.NewRegistry()
	agent1 := agent.NewAgent("Test Agent 1", agent.AgentTypeCoder)
	registry.Register(agent1)

	hm := NewHandoffManager(registry)

	ctx := context.Background()
	_, err := hm.RequestHandoff(ctx, string(agent1.ID), "agent-2", "task-1", "test", nil)
	if err == nil {
		t.Error("expected error for non-existent target agent")
	}
}

func TestRequestHandoffTooManyPending(t *testing.T) {
	registry := agent.NewRegistry()

	// Add agents
	agent1 := agent.NewAgent("Test Agent 1", agent.AgentTypeCoder)
	agent2 := agent.NewAgent("Test Agent 2", agent.AgentTypeCoder)
	registry.Register(agent1)
	registry.Register(agent2)

	hm := NewHandoffManager(registry)
	hm.maxPendingHandoffs = 2

	ctx := context.Background()

	// Create max pending handoffs
	for i := 0; i < 2; i++ {
		_, err := hm.RequestHandoff(ctx, string(agent1.ID), string(agent2.ID), "task-1", "test", nil)
		if err != nil {
			t.Fatalf("unexpected error on handoff %d: %v", i, err)
		}
	}

	// Next should fail
	_, err := hm.RequestHandoff(ctx, string(agent1.ID), string(agent2.ID), "task-1", "test", nil)
	if err == nil {
		t.Error("expected error for too many pending handoffs")
	}
}

func TestAcceptHandoff(t *testing.T) {
	registry := agent.NewRegistry()

	agent1 := agent.NewAgent("Test Agent 1", agent.AgentTypeCoder)
	agent2 := agent.NewAgent("Test Agent 2", agent.AgentTypeCoder)
	registry.Register(agent1)
	registry.Register(agent2)

	hm := NewHandoffManager(registry)

	ctx := context.Background()
	req, _ := hm.RequestHandoff(ctx, string(agent1.ID), string(agent2.ID), "task-1", "test", nil)

	err := hm.AcceptHandoff(ctx, req.ID, "accepted summary")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Check moved to active
	if len(hm.GetPendingHandoffs()) != 0 {
		t.Error("handoff should not be in pending")
	}
	active := hm.GetActiveHandoffs()
	if len(active) != 1 {
		t.Errorf("expected 1 active handoff, got %d", len(active))
	}
	if active[0].Status != HandoffStateAccepted {
		t.Errorf("expected Status accepted, got %s", active[0].Status)
	}
}

func TestAcceptHandoffNotFound(t *testing.T) {
	registry := agent.NewRegistry()
	hm := NewHandoffManager(registry)

	ctx := context.Background()
	err := hm.AcceptHandoff(ctx, "non-existent", "summary")
	if err == nil {
		t.Error("expected error for non-existent handoff")
	}
}

func TestRejectHandoff(t *testing.T) {
	registry := agent.NewRegistry()

	agent1 := agent.NewAgent("Test Agent 1", agent.AgentTypeCoder)
	agent2 := agent.NewAgent("Test Agent 2", agent.AgentTypeCoder)
	registry.Register(agent1)
	registry.Register(agent2)

	hm := NewHandoffManager(registry)

	ctx := context.Background()
	req, _ := hm.RequestHandoff(ctx, string(agent1.ID), string(agent2.ID), "task-1", "test", nil)

	err := hm.RejectHandoff(ctx, req.ID, "rejection reason")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Check removed from pending
	if len(hm.GetPendingHandoffs()) != 0 {
		t.Error("handoff should not be in pending after rejection")
	}
	if len(hm.GetActiveHandoffs()) != 0 {
		t.Error("handoff should not be in active after rejection")
	}
}

func TestRejectHandoffNotFound(t *testing.T) {
	registry := agent.NewRegistry()
	hm := NewHandoffManager(registry)

	ctx := context.Background()
	err := hm.RejectHandoff(ctx, "non-existent", "reason")
	if err == nil {
		t.Error("expected error for non-existent handoff")
	}
}

func TestCompleteHandoff(t *testing.T) {
	registry := agent.NewRegistry()

	agent1 := agent.NewAgent("Test Agent 1", agent.AgentTypeCoder)
	agent2 := agent.NewAgent("Test Agent 2", agent.AgentTypeCoder)
	registry.Register(agent1)
	registry.Register(agent2)

	hm := NewHandoffManager(registry)

	ctx := context.Background()
	req, _ := hm.RequestHandoff(ctx, string(agent1.ID), string(agent2.ID), "task-1", "test", nil)
	hm.AcceptHandoff(ctx, req.ID, "summary")

	err := hm.CompleteHandoff(ctx, req.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Check stats
	stats := hm.GetHandoffStats()
	if stats[HandoffStateCompleted] != 1 {
		t.Errorf("expected 1 completed, got %d", stats[HandoffStateCompleted])
	}
	if stats[HandoffStateAccepted] != 0 {
		t.Errorf("expected 0 active, got %d", stats[HandoffStateAccepted])
	}
}

func TestCompleteHandoffNotFound(t *testing.T) {
	registry := agent.NewRegistry()
	hm := NewHandoffManager(registry)

	ctx := context.Background()
	err := hm.CompleteHandoff(ctx, "non-existent")
	if err == nil {
		t.Error("expected error for non-existent handoff")
	}
}

func TestHandoffCallbacks(t *testing.T) {
	registry := agent.NewRegistry()

	agent1 := agent.NewAgent("Test Agent 1", agent.AgentTypeCoder)
	agent2 := agent.NewAgent("Test Agent 2", agent.AgentTypeCoder)
	registry.Register(agent1)
	registry.Register(agent2)

	hm := NewHandoffManager(registry)

	var requested, accepted, completed, rejected bool
	var mu sync.Mutex

	hm.onHandoffRequested = func(req *HandoffRequest) {
		mu.Lock()
		requested = true
		mu.Unlock()
	}
	hm.onHandoffAccepted = func(req *HandoffRequest) {
		mu.Lock()
		accepted = true
		mu.Unlock()
	}
	hm.onHandoffCompleted = func(req *HandoffRequest) {
		mu.Lock()
		completed = true
		mu.Unlock()
	}
	hm.onHandoffRejected = func(req *HandoffRequest) {
		mu.Lock()
		rejected = true
		mu.Unlock()
	}

	ctx := context.Background()

	// Test request callback
	req, _ := hm.RequestHandoff(ctx, string(agent1.ID), string(agent2.ID), "task-1", "test", nil)
	if !requested {
		t.Error("onHandoffRequested callback not called")
	}

	// Test accept callback
	hm.AcceptHandoff(ctx, req.ID, "summary")
	if !accepted {
		t.Error("onHandoffAccepted callback not called")
	}

	// Test complete callback
	hm.CompleteHandoff(ctx, req.ID)
	if !completed {
		t.Error("onHandoffCompleted callback not called")
	}

	// Test reject callback
	req2, _ := hm.RequestHandoff(ctx, string(agent1.ID), string(agent2.ID), "task-2", "test", nil)
	hm.RejectHandoff(ctx, req2.ID, "reason")
	if !rejected {
		t.Error("onHandoffRejected callback not called")
	}
}

func TestHandoffTimeout(t *testing.T) {
	registry := agent.NewRegistry()

	agent1 := agent.NewAgent("Test Agent 1", agent.AgentTypeCoder)
	agent2 := agent.NewAgent("Test Agent 2", agent.AgentTypeCoder)
	registry.Register(agent1)
	registry.Register(agent2)

	hm := NewHandoffManager(registry)
	hm.handoffTimeout = 100 * time.Millisecond

	var rejected bool
	var mu sync.Mutex
	hm.onHandoffRejected = func(req *HandoffRequest) {
		mu.Lock()
		rejected = true
		mu.Unlock()
	}

	ctx := context.Background()
	hm.RequestHandoff(ctx, string(agent1.ID), string(agent2.ID), "task-1", "test", nil)

	// Wait for timeout
	time.Sleep(150 * time.Millisecond)

	mu.Lock()
	defer mu.Unlock()
	if !rejected {
		t.Error("expected handoff to be rejected after timeout")
	}
}

func TestGetHandoffStats(t *testing.T) {
	registry := agent.NewRegistry()

	agent1 := agent.NewAgent("Test Agent 1", agent.AgentTypeCoder)
	agent2 := agent.NewAgent("Test Agent 2", agent.AgentTypeCoder)
	registry.Register(agent1)
	registry.Register(agent2)

	hm := NewHandoffManager(registry)

	ctx := context.Background()

	// Create handoffs in different states
	req1, _ := hm.RequestHandoff(ctx, string(agent1.ID), string(agent2.ID), "task-1", "test", nil)
	_, _ = hm.RequestHandoff(ctx, string(agent1.ID), string(agent2.ID), "task-2", "test", nil)
	hm.AcceptHandoff(ctx, req1.ID, "summary")
	hm.CompleteHandoff(ctx, req1.ID)

	stats := hm.GetHandoffStats()
	if stats[HandoffStatePending] != 1 {
		t.Errorf("expected 1 pending, got %d", stats[HandoffStatePending])
	}
	if stats[HandoffStateCompleted] != 1 {
		t.Errorf("expected 1 completed, got %d", stats[HandoffStateCompleted])
	}
}

func TestGenerateHandoffID(t *testing.T) {
	id1 := generateHandoffID()
	id2 := generateHandoffID()

	if id1 == id2 {
		t.Error("expected different IDs")
	}
	if len(id1) < 10 {
		t.Errorf("ID too short: %s", id1)
	}
}

func TestHandoffResponse(t *testing.T) {
	resp := &HandoffResponse{
		RequestID:  "req-1",
		Accepted:   true,
		Message:    "test message",
		Summary:    "test summary",
		ReceivedAt: time.Now(),
	}

	if resp.RequestID != "req-1" {
		t.Errorf("expected RequestID req-1, got %s", resp.RequestID)
	}
	if !resp.Accepted {
		t.Error("expected Accepted true")
	}
}

// --- Handoff Hook Tests ---

func TestHandoffHook_BeforeAllow(t *testing.T) {
	registry := agent.NewRegistry()
	a1 := agent.NewAgent("Agent 1", agent.AgentTypeCoder)
	a2 := agent.NewAgent("Agent 2", agent.AgentTypeCoder)
	registry.Register(a1)
	registry.Register(a2)

	hm := NewHandoffManager(registry)
	hookCalled := false
	hm.SetOnBeforeHandoff(func(_ context.Context, req *HandoffRequest) (bool, *HandoffContext, error) {
		hookCalled = true
		return true, nil, nil
	})

	_, err := hm.RequestHandoff(context.Background(), string(a1.ID), string(a2.ID), "task-1", "test", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !hookCalled {
		t.Error("pre-handoff hook should have been called")
	}
}

func TestHandoffHook_BeforeAbort(t *testing.T) {
	registry := agent.NewRegistry()
	a1 := agent.NewAgent("Agent 1", agent.AgentTypeCoder)
	a2 := agent.NewAgent("Agent 2", agent.AgentTypeCoder)
	registry.Register(a1)
	registry.Register(a2)

	hm := NewHandoffManager(registry)
	hm.SetOnBeforeHandoff(func(_ context.Context, req *HandoffRequest) (bool, *HandoffContext, error) {
		return false, nil, nil
	})

	_, err := hm.RequestHandoff(context.Background(), string(a1.ID), string(a2.ID), "task-1", "test", nil)
	if err == nil {
		t.Fatal("expected error when hook aborts")
	}
	if err.Error() != "handoff rejected by pre-handoff hook" {
		t.Errorf("unexpected error: %v", err)
	}

	// Should not create a pending handoff
	stats := hm.GetHandoffStats()
	if stats[HandoffStatePending] != 0 {
		t.Errorf("expected 0 pending, got %d", stats[HandoffStatePending])
	}
}

func TestHandoffHook_BeforeModifyContext(t *testing.T) {
	registry := agent.NewRegistry()
	a1 := agent.NewAgent("Agent 1", agent.AgentTypeCoder)
	a2 := agent.NewAgent("Agent 2", agent.AgentTypeCoder)
	registry.Register(a1)
	registry.Register(a2)

	hm := NewHandoffManager(registry)
	hm.SetOnBeforeHandoff(func(_ context.Context, req *HandoffRequest) (bool, *HandoffContext, error) {
		modified := &HandoffContext{
			Instructions: "injected by hook",
			ContextVariables: map[string]any{
				"injected": true,
			},
		}
		return true, modified, nil
	})

	req, err := hm.RequestHandoff(context.Background(), string(a1.ID), string(a2.ID), "task-1", "test", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if req.Context == nil {
		t.Fatal("expected context to be set by hook")
	}
	if req.Context.Instructions != "injected by hook" {
		t.Errorf("expected hook-modified instructions, got %q", req.Context.Instructions)
	}
	if req.Context.ContextVariables["injected"] != true {
		t.Error("expected hook-injected context variable")
	}
}

func TestHandoffHook_BeforeError(t *testing.T) {
	registry := agent.NewRegistry()
	a1 := agent.NewAgent("Agent 1", agent.AgentTypeCoder)
	a2 := agent.NewAgent("Agent 2", agent.AgentTypeCoder)
	registry.Register(a1)
	registry.Register(a2)

	hm := NewHandoffManager(registry)
	hm.SetOnBeforeHandoff(func(_ context.Context, req *HandoffRequest) (bool, *HandoffContext, error) {
		return false, nil, fmt.Errorf("validation failed")
	})

	_, err := hm.RequestHandoff(context.Background(), string(a1.ID), string(a2.ID), "task-1", "test", nil)
	if err == nil {
		t.Fatal("expected error from hook")
	}
}

func TestHandoffHook_AfterComplete(t *testing.T) {
	registry := agent.NewRegistry()
	a1 := agent.NewAgent("Agent 1", agent.AgentTypeCoder)
	a2 := agent.NewAgent("Agent 2", agent.AgentTypeCoder)
	registry.Register(a1)
	registry.Register(a2)

	hm := NewHandoffManager(registry)

	var capturedSuccess bool
	var capturedReq *HandoffRequest
	var mu sync.Mutex
	hm.SetOnAfterHandoff(func(_ context.Context, req *HandoffRequest, success bool) {
		mu.Lock()
		defer mu.Unlock()
		capturedReq = req
		capturedSuccess = success
	})

	// Request handoff
	req, err := hm.RequestHandoff(context.Background(), string(a1.ID), string(a2.ID), "task-1", "test", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Accept
	err = hm.AcceptHandoff(context.Background(), req.ID, "accepted")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Complete
	err = hm.CompleteHandoff(context.Background(), req.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if !capturedSuccess {
		t.Error("expected success=true for completed handoff")
	}
	if capturedReq == nil || capturedReq.ID != req.ID {
		t.Error("after hook should have received the completed request")
	}
}

func TestHandoffHook_AfterReject(t *testing.T) {
	registry := agent.NewRegistry()
	a1 := agent.NewAgent("Agent 1", agent.AgentTypeCoder)
	a2 := agent.NewAgent("Agent 2", agent.AgentTypeCoder)
	registry.Register(a1)
	registry.Register(a2)

	hm := NewHandoffManager(registry)

	var capturedSuccess bool
	var mu sync.Mutex
	hm.SetOnAfterHandoff(func(_ context.Context, req *HandoffRequest, success bool) {
		mu.Lock()
		defer mu.Unlock()
		capturedSuccess = success
	})

	req, err := hm.RequestHandoff(context.Background(), string(a1.ID), string(a2.ID), "task-1", "test", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	err = hm.RejectHandoff(context.Background(), req.ID, "nope")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if capturedSuccess {
		t.Error("expected success=false for rejected handoff")
	}
}

func TestHandoffHook_NoHookSet(t *testing.T) {
	registry := agent.NewRegistry()
	a1 := agent.NewAgent("Agent 1", agent.AgentTypeCoder)
	a2 := agent.NewAgent("Agent 2", agent.AgentTypeCoder)
	registry.Register(a1)
	registry.Register(a2)

	hm := NewHandoffManager(registry)
	// No hooks set — should work normally

	req, err := hm.RequestHandoff(context.Background(), string(a1.ID), string(a2.ID), "task-1", "test", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	err = hm.AcceptHandoff(context.Background(), req.ID, "ok")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	err = hm.CompleteHandoff(context.Background(), req.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// --- MergeContextVariables Tests ---

func TestMergeContextVariables_EmptyNewVars(t *testing.T) {
	hc := &HandoffContext{
		ContextVariables: map[string]any{"existing": "value"},
	}

	result := hc.MergeContextVariables(nil)
	if result["existing"] != "value" {
		t.Error("nil newVars should not modify existing")
	}

	result = hc.MergeContextVariables(map[string]any{})
	if result["existing"] != "value" {
		t.Error("empty newVars should not modify existing")
	}
}

func TestMergeContextVariables_NilExisting(t *testing.T) {
	hc := &HandoffContext{}

	result := hc.MergeContextVariables(map[string]any{"new": "value"})
	if result["new"] != "value" {
		t.Error("should add new key when existing is nil")
	}
}

func TestMergeContextVariables_OverwriteNonSlice(t *testing.T) {
	hc := &HandoffContext{
		ContextVariables: map[string]any{"key": "old"},
	}

	result := hc.MergeContextVariables(map[string]any{"key": "new"})
	if result["key"] != "new" {
		t.Errorf("expected overwrite, got %v", result["key"])
	}
}

func TestMergeContextVariables_ConcatenateSlices(t *testing.T) {
	hc := &HandoffContext{
		ContextVariables: map[string]any{
			"items": []any{"a", "b"},
		},
	}

	result := hc.MergeContextVariables(map[string]any{
		"items": []any{"c", "d"},
	})

	items, ok := result["items"].([]any)
	if !ok {
		t.Fatal("expected []any")
	}
	if len(items) != 4 {
		t.Errorf("expected 4 items, got %d", len(items))
	}
	if items[0] != "a" || items[3] != "d" {
		t.Errorf("unexpected slice contents: %v", items)
	}
}

func TestMergeContextVariables_ConcatenateStringSlices(t *testing.T) {
	hc := &HandoffContext{
		ContextVariables: map[string]any{
			"files": []string{"a.go", "b.go"},
		},
	}

	result := hc.MergeContextVariables(map[string]any{
		"files": []string{"c.go"},
	})

	files, ok := result["files"].([]any)
	if !ok {
		t.Fatal("expected []any")
	}
	if len(files) != 3 {
		t.Errorf("expected 3 files, got %d", len(files))
	}
}

func TestMergeContextVariables_MixedTypes(t *testing.T) {
	hc := &HandoffContext{
		ContextVariables: map[string]any{
			"items": []any{"a"},
			"count": 1,
		},
	}

	result := hc.MergeContextVariables(map[string]any{
		"items": []any{"b"},
		"count": 2,
		"new":   "value",
	})

	items := result["items"].([]any)
	if len(items) != 2 {
		t.Errorf("expected 2 items, got %d", len(items))
	}
	if result["count"] != 2 {
		t.Error("count should be overwritten")
	}
	if result["new"] != "value" {
		t.Error("new key should be added")
	}
}

func TestMergeContextVariables_SliceAndNonSlice(t *testing.T) {
	hc := &HandoffContext{
		ContextVariables: map[string]any{
			"key": []any{"a"},
		},
	}

	// Slice overwritten by non-slice
	result := hc.MergeContextVariables(map[string]any{
		"key": "string",
	})
	if result["key"] != "string" {
		t.Error("non-slice should overwrite slice")
	}

	// Non-slice overwritten by slice
	hc2 := &HandoffContext{
		ContextVariables: map[string]any{
			"key": "string",
		},
	}
	result2 := hc2.MergeContextVariables(map[string]any{
		"key": []any{"a"},
	})
	slice, ok := result2["key"].([]any)
	if !ok || len(slice) != 1 {
		t.Error("slice should overwrite non-slice")
	}
}

// --- HandoffManager.Close Tests ---

func TestHandoffManager_Close(t *testing.T) {
	registry := agent.NewRegistry()
	a1 := agent.NewAgent("Agent 1", agent.AgentTypeCoder)
	a2 := agent.NewAgent("Agent 2", agent.AgentTypeCoder)
	registry.Register(a1)
	registry.Register(a2)

	hm := NewHandoffManager(registry)
	hm.handoffTimeout = 100 * time.Millisecond

	// Start a handoff (spawns waitForResponse goroutine)
	_, err := hm.RequestHandoff(context.Background(), string(a1.ID), string(a2.ID), "task-1", "test", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Close should wait for goroutine to finish
	start := time.Now()
	hm.Close()
	elapsed := time.Since(start)

	// Close should complete within reasonable time
	if elapsed > 500*time.Millisecond {
		t.Errorf("Close took too long: %v", elapsed)
	}
}

// --- Handoff Depth Limit Tests ---

func TestHandoffManager_DepthLimitReached(t *testing.T) {
	registry := agent.NewRegistry()
	a1 := agent.NewAgent("Agent 1", agent.AgentTypeCoder)
	a2 := agent.NewAgent("Agent 2", agent.AgentTypeCoder)
	registry.Register(a1)
	registry.Register(a2)

	hm := NewHandoffManager(registry)
	hm.SetMaxDepth(2) // Set low limit for testing

	// Simulate depth limit reached by manually setting depth
	taskID := "task-depth-test"
	hm.mu.Lock()
	hm.handoffDepth[taskID] = 2 // At limit
	hm.mu.Unlock()

	_, err := hm.RequestHandoff(context.Background(), string(a1.ID), string(a2.ID), taskID, "test", nil)
	if err == nil {
		t.Error("expected error when depth limit reached")
	}
	if !strings.Contains(err.Error(), "depth limit") {
		t.Errorf("expected depth limit error, got: %v", err)
	}
}

func TestHandoffManager_DepthIncrementOnComplete(t *testing.T) {
	registry := agent.NewRegistry()
	a1 := agent.NewAgent("Agent 1", agent.AgentTypeCoder)
	a2 := agent.NewAgent("Agent 2", agent.AgentTypeCoder)
	registry.Register(a1)
	registry.Register(a2)

	hm := NewHandoffManager(registry)
	hm.handoffTimeout = 50 * time.Millisecond

	taskID := "task-depth-increment"
	req, err := hm.RequestHandoff(context.Background(), string(a1.ID), string(a2.ID), taskID, "test", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Accept and complete
	hm.AcceptHandoff(context.Background(), req.ID, "ok")
	hm.CompleteHandoff(context.Background(), req.ID)

	// After a normal completion (not hitting maxDepth), depth tracking is cleaned up
	// to prevent memory leak. GetHandoffDepth returns 0 for non-existent entries.
	if hm.GetHandoffDepth(taskID) != 0 {
		t.Errorf("expected depth 0 after complete (cleaned up), got %d", hm.GetHandoffDepth(taskID))
	}
}

// --- Handoff to Self Tests ---

func TestHandoffManager_HandoffToSelf(t *testing.T) {
	registry := agent.NewRegistry()
	a1 := agent.NewAgent("Agent 1", agent.AgentTypeCoder)
	registry.Register(a1)

	hm := NewHandoffManager(registry)

	// Handoff to self should be allowed (for testing purposes)
	// In production, this might be rejected by a pre-handoff hook
	_, err := hm.RequestHandoff(context.Background(), string(a1.ID), string(a1.ID), "task-self", "self handoff", nil)
	if err != nil {
		t.Logf("handoff to self returned error: %v (may be expected)", err)
	}
}

// --- Concurrent Handoff Tests ---

func TestHandoffManager_ConcurrentHandoffs(t *testing.T) {
	registry := agent.NewRegistry()
	a1 := agent.NewAgent("Agent 1", agent.AgentTypeCoder)
	a2 := agent.NewAgent("Agent 2", agent.AgentTypeCoder)
	registry.Register(a1)
	registry.Register(a2)

	hm := NewHandoffManager(registry)
	hm.handoffTimeout = 100 * time.Millisecond

	// Start multiple concurrent handoffs
	var wg sync.WaitGroup
	errors := make(chan error, 5)

	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			_, err := hm.RequestHandoff(context.Background(), string(a1.ID), string(a2.ID), fmt.Sprintf("task-concurrent-%d", idx), "concurrent test", nil)
			if err != nil {
				errors <- err
			}
		}(i)
	}

	wg.Wait()
	close(errors)

	// Count successful handoffs
	successCount := 5
	for err := range errors {
		if err != nil {
			successCount--
		}
	}

	// All should succeed (different task IDs)
	if successCount != 5 {
		t.Errorf("expected 5 successful concurrent handoffs, got %d", successCount)
	}
}

// ==================== Handoff Utility Tests ====================

func TestHandoffContext_GetContextVariable_Nil(t *testing.T) {
	hc := &HandoffContext{}
	val, ok := hc.GetContextVariable("key")
	if ok || val != nil {
		t.Error("expected false, nil for nil ContextVariables")
	}
}

func TestHandoffContext_GetContextVariable_Found(t *testing.T) {
	hc := &HandoffContext{
		ContextVariables: map[string]any{"key": "value"},
	}
	val, ok := hc.GetContextVariable("key")
	if !ok || val != "value" {
		t.Error("expected true, 'value'")
	}
}

func TestHandoffContext_GetContextVariable_NotFound(t *testing.T) {
	hc := &HandoffContext{
		ContextVariables: map[string]any{"key": "value"},
	}
	_, ok := hc.GetContextVariable("missing")
	if ok {
		t.Error("expected false for missing key")
	}
}

func TestHandoffContext_SetContextVariable_NilMap(t *testing.T) {
	hc := &HandoffContext{}
	hc.SetContextVariable("key", "value")
	if hc.ContextVariables == nil {
		t.Error("ContextVariables should be initialized")
	}
	if hc.ContextVariables["key"] != "value" {
		t.Error("value should be set")
	}
}

func TestHandoffContext_SetContextVariable_Existing(t *testing.T) {
	hc := &HandoffContext{
		ContextVariables: map[string]any{"key": "old"},
	}
	hc.SetContextVariable("key", "new")
	if hc.ContextVariables["key"] != "new" {
		t.Error("value should be overwritten")
	}
}

func TestHandoffManager_IsTaskDepthBlocked(t *testing.T) {
	hm := NewHandoffManager(nil)

	if hm.IsTaskDepthBlocked("task-1") {
		t.Error("task should not be blocked initially")
	}

	hm.handoffDepthBlocked["task-1"] = struct{}{}
	if !hm.IsTaskDepthBlocked("task-1") {
		t.Error("task should be blocked after setting")
	}
}

func TestHandoffManager_ClearTaskDepthTracking(t *testing.T) {
	hm := NewHandoffManager(nil)
	hm.handoffDepth["task-1"] = 3
	hm.handoffDepthBlocked["task-1"] = struct{}{}

	hm.ClearTaskDepthTracking("task-1")

	if len(hm.handoffDepth) != 0 {
		t.Error("handoffDepth should be cleared for task-1")
	}
	if len(hm.handoffDepthBlocked) != 0 {
		t.Error("handoffDepthBlocked should be cleared for task-1")
	}
}

func TestHandoffManager_GetHandoffTimeout(t *testing.T) {
	hm := NewHandoffManager(nil)
	if hm.GetHandoffTimeout() != 30*time.Second {
		t.Errorf("default timeout = %v, want 30s", hm.GetHandoffTimeout())
	}
}

func TestHandoffManager_SetHandoffTimeout(t *testing.T) {
	hm := NewHandoffManager(nil)
	hm.SetHandoffTimeout(60 * time.Second)
	if hm.GetHandoffTimeout() != 60*time.Second {
		t.Errorf("timeout = %v, want 60s", hm.GetHandoffTimeout())
	}
}

func TestHandoffManager_SetOnHandoffRequested(t *testing.T) {
	hm := NewHandoffManager(nil)
	called := false
	hm.SetOnHandoffRequested(func(req *HandoffRequest) { called = true })
	if hm.onHandoffRequested == nil {
		t.Error("callback should be set")
	}
	_ = called
}

func TestHandoffManager_SetOnHandoffAccepted(t *testing.T) {
	hm := NewHandoffManager(nil)
	hm.SetOnHandoffAccepted(func(req *HandoffRequest) {})
	if hm.onHandoffAccepted == nil {
		t.Error("callback should be set")
	}
}

func TestHandoffManager_SetOnHandoffCompleted(t *testing.T) {
	hm := NewHandoffManager(nil)
	hm.SetOnHandoffCompleted(func(req *HandoffRequest) {})
	if hm.onHandoffCompleted == nil {
		t.Error("callback should be set")
	}
}

func TestHandoffManager_SetOnHandoffRejected(t *testing.T) {
	hm := NewHandoffManager(nil)
	hm.SetOnHandoffRejected(func(req *HandoffRequest) {})
	if hm.onHandoffRejected == nil {
		t.Error("callback should be set")
	}
}

func TestHandoffManager_SetBroadcaster(t *testing.T) {
	hm := NewHandoffManager(nil)
	hm.SetBroadcaster(nil) // Should not panic
}

func TestHandoffManager_SetBroadcaster_WithBroadcaster(t *testing.T) {
	registry := agent.NewRegistry()
	agent1 := agent.NewAgent("agent-1", agent.AgentTypeCoder)
	agent2 := agent.NewAgent("agent-2", agent.AgentTypeCoder)
	registry.Register(agent1)
	registry.Register(agent2)

	hm := NewHandoffManager(registry)

	// Track callback invocations
	var mu sync.Mutex
	var requestedCount, completedCount int

	hm.mu.Lock()
	hm.onHandoffRequested = func(req *HandoffRequest) {
		mu.Lock()
		defer mu.Unlock()
		requestedCount++
	}
	hm.onHandoffCompleted = func(req *HandoffRequest) {
		mu.Lock()
		defer mu.Unlock()
		completedCount++
	}
	hm.mu.Unlock()

	// Request a handoff → should trigger callback
	ctx := context.Background()
	req, err := hm.RequestHandoff(ctx, string(agent1.ID), string(agent2.ID), "task-1", "test reason", nil)
	if err != nil {
		t.Fatalf("RequestHandoff failed: %v", err)
	}

	mu.Lock()
	if requestedCount != 1 {
		t.Errorf("expected 1 requested callback, got %d", requestedCount)
	}
	mu.Unlock()

	// Complete handoff → should trigger completed callback
	hm.AcceptHandoff(ctx, req.ID, "summary")
	hm.CompleteHandoff(ctx, req.ID)

	mu.Lock()
	if completedCount != 1 {
		t.Errorf("expected 1 completed callback, got %d", completedCount)
	}
	mu.Unlock()

	// Set broadcaster to nil → should clear callbacks (no panic)
	hm.SetBroadcaster(nil)
}

func TestCompleteHandoff_MaxDepth(t *testing.T) {
	registry := agent.NewRegistry()
	agent1 := agent.NewAgent("agent-1", agent.AgentTypeCoder)
	agent2 := agent.NewAgent("agent-2", agent.AgentTypeCoder)
	registry.Register(agent1)
	registry.Register(agent2)

	hm := NewHandoffManager(registry)
	hm.SetMaxDepth(2) // Set low maxDepth for testing

	ctx := context.Background()

	// Complete handoff for task-1: depth becomes 1, then cleaned up (else branch)
	req1, err := hm.RequestHandoff(ctx, string(agent1.ID), string(agent2.ID), "task-1", "test", nil)
	if err != nil {
		t.Fatalf("RequestHandoff failed: %v", err)
	}
	hm.AcceptHandoff(ctx, req1.ID, "summary")
	if err := hm.CompleteHandoff(ctx, req1.ID); err != nil {
		t.Fatalf("CompleteHandoff failed: %v", err)
	}

	// After completion, depth is cleaned up (else branch in CompleteHandoff)
	hm.mu.RLock()
	_, inDepth := hm.handoffDepth["task-1"]
	_, blocked := hm.handoffDepthBlocked["task-1"]
	hm.mu.RUnlock()

	if inDepth {
		t.Error("expected handoffDepth to be cleaned up after completion (else branch)")
	}
	if blocked {
		t.Error("expected task-1 to NOT be blocked (depth < maxDepth)")
	}

	// New handoff for task-1 should succeed (depth was reset)
	_, err = hm.RequestHandoff(ctx, string(agent1.ID), string(agent2.ID), "task-1", "test", nil)
	if err != nil {
		t.Errorf("expected handoff to succeed after depth cleanup, got: %v", err)
	}
}

func TestCompleteHandoff_CompletedEviction(t *testing.T) {
	registry := agent.NewRegistry()
	agent1 := agent.NewAgent("agent-1", agent.AgentTypeCoder)
	agent2 := agent.NewAgent("agent-2", agent.AgentTypeCoder)
	registry.Register(agent1)
	registry.Register(agent2)

	hm := NewHandoffManager(registry)
	ctx := context.Background()

	// Add more than 200 completed handoffs to trigger eviction
	completed := 0
	for i := range 210 {
		req, err := hm.RequestHandoff(ctx, string(agent1.ID), string(agent2.ID), fmt.Sprintf("task-%d", i), "test", nil)
		if err != nil {
			t.Fatalf("RequestHandoff %d failed: %v", i, err)
		}
		if err := hm.AcceptHandoff(ctx, req.ID, "summary"); err != nil {
			t.Fatalf("AcceptHandoff %d failed: %v", i, err)
		}
		if err := hm.CompleteHandoff(ctx, req.ID); err != nil {
			t.Fatalf("CompleteHandoff %d failed: %v", i, err)
		}
		completed++
	}

	if completed != 210 {
		t.Fatalf("expected 210 completed handoffs, got %d", completed)
	}

	// Completed handoffs should be pruned to ~100 (200/2)
	hm.mu.RLock()
	completedCount := len(hm.completed)
	hm.mu.RUnlock()

	// Eviction triggers at 201st completion (len > 200): removes 101 oldest, leaves 100
	// Then 9 more completions add 9 entries: 100 + 9 = 109
	if completedCount != 109 {
		t.Errorf("expected completed count 109, got %d", completedCount)
	}
}

func TestHandoffContext_DeepCopy_Nil(t *testing.T) {
	var hc *HandoffContext
	cp := hc.DeepCopy()
	if cp != nil {
		t.Error("expected nil for nil input")
	}
}

func TestHandoffContext_DeepCopy_Empty(t *testing.T) {
	hc := &HandoffContext{}
	cp := hc.DeepCopy()
	if cp == nil {
		t.Fatal("expected non-nil copy")
	}
	if cp.CurrentState != "" {
		t.Errorf("CurrentState = %q, want empty", cp.CurrentState)
	}
	if cp.ConversationHistory != nil {
		t.Error("ConversationHistory should be nil for empty input")
	}
	if cp.Metadata != nil {
		t.Error("Metadata should be nil for empty input")
	}
}

func TestHandoffContext_DeepCopy_Full(t *testing.T) {
	hc := &HandoffContext{
		ConversationHistory: []acp.ContentBlock{
			{Type: "text", Text: "hello"},
			{Type: "text", Text: "world"},
		},
		FilesModified:    []string{"a.go", "b.go"},
		CurrentState:     "active",
		NextSteps:        []string{"step1", "step2"},
		Instructions:     "continue",
		Metadata:         map[string]any{"key": "value"},
		ContextVariables: map[string]any{"count": 42},
	}
	cp := hc.DeepCopy()

	// Verify values copied
	if cp.CurrentState != "active" {
		t.Errorf("CurrentState = %q, want 'active'", cp.CurrentState)
	}
	if len(cp.ConversationHistory) != 2 {
		t.Errorf("ConversationHistory len = %d, want 2", len(cp.ConversationHistory))
	}
	if len(cp.FilesModified) != 2 {
		t.Errorf("FilesModified len = %d, want 2", len(cp.FilesModified))
	}
	if len(cp.NextSteps) != 2 {
		t.Errorf("NextSteps len = %d, want 2", len(cp.NextSteps))
	}
	if cp.Instructions != "continue" {
		t.Errorf("Instructions = %q, want 'continue'", cp.Instructions)
	}

	// Verify independence - modify original
	hc.ConversationHistory[0].Text = "modified"
	hc.FilesModified[0] = "modified.go"
	hc.NextSteps[0] = "modified"
	hc.Metadata["key"] = "modified"
	hc.ContextVariables["count"] = 99

	if cp.ConversationHistory[0].Text == "modified" {
		t.Error("ConversationHistory should be independent copy")
	}
	if cp.FilesModified[0] == "modified.go" {
		t.Error("FilesModified should be independent copy")
	}
	if cp.NextSteps[0] == "modified" {
		t.Error("NextSteps should be independent copy")
	}
	if cp.Metadata["key"] == "modified" {
		t.Error("Metadata should be independent copy")
	}
	if cp.ContextVariables["count"] == 99 {
		t.Error("ContextVariables should be independent copy")
	}
}

func TestHandoffRequest_DeepCopy_Nil(t *testing.T) {
	var r *HandoffRequest
	cp := r.DeepCopy()
	if cp != nil {
		t.Error("expected nil for nil input")
	}
}

func TestHandoffRequest_DeepCopy_Full(t *testing.T) {
	now := time.Now()
	r := &HandoffRequest{
		ID:        "req-1",
		FromAgent: "agent-a",
		ToAgent:   "agent-b",
		TaskID:    "task-1",
		Reason:    "specialization",
		Context: &HandoffContext{
			CurrentState: "working",
			Metadata:     map[string]any{"info": "data"},
		},
		Status:    HandoffStatePending,
		CreatedAt: now,
	}
	cp := r.DeepCopy()

	if cp.ID != "req-1" {
		t.Errorf("ID = %q, want 'req-1'", cp.ID)
	}
	if cp.Context.CurrentState != "working" {
		t.Errorf("Context.CurrentState = %q, want 'working'", cp.Context.CurrentState)
	}

	// Verify independence
	r.Context.Metadata["info"] = "modified"
	if cp.Context.Metadata["info"] == "modified" {
		t.Error("Context should be deep copied")
	}
}
