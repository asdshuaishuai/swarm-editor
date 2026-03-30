package swarm

import (
	"context"
	"testing"
	"time"
)

func TestPropagationFrom_NilContext(t *testing.T) {
	pc := PropagationFrom(context.Background())
	if pc != nil {
		t.Fatal("expected nil propagation from empty context")
	}
}

func TestWithPropagation_RoundTrip(t *testing.T) {
	original := NewPropagationContext("trace_123")
	original.TaskLineage = []string{"task_1"}
	original.AgentChain = []string{"agent_A"}
	original.Labels = map[string]string{"env": "test"}

	ctx := WithPropagation(context.Background(), original)
	retrieved := PropagationFrom(ctx)

	if retrieved == nil {
		t.Fatal("expected non-nil propagation")
	}
	if retrieved.TraceID != "trace_123" {
		t.Fatalf("expected trace_123, got %s", retrieved.TraceID)
	}
	if len(retrieved.TaskLineage) != 1 || retrieved.TaskLineage[0] != "task_1" {
		t.Fatalf("unexpected lineage: %v", retrieved.TaskLineage)
	}
	if retrieved.Labels["env"] != "test" {
		t.Fatalf("expected env=test, got %s", retrieved.Labels["env"])
	}
}

func TestNewPropagationContext_AutoGenerateID(t *testing.T) {
	pc := NewPropagationContext("")
	if pc.TraceID == "" {
		t.Fatal("expected auto-generated trace ID")
	}
	if pc.TraceID[:6] != "trace_" {
		t.Fatalf("unexpected trace ID format: %s", pc.TraceID)
	}
}

func TestPropagationContext_Child(t *testing.T) {
	parent := NewPropagationContext("trace_parent")
	parent.TaskLineage = []string{"task_1"}
	parent.AgentChain = []string{"agent_A"}
	parent.Labels = map[string]string{"key": "value"}

	child := parent.Child("task_2", "agent_B")

	if child.TraceID != "trace_parent" {
		t.Fatalf("child should inherit trace ID, got %s", child.TraceID)
	}
	if len(child.TaskLineage) != 2 {
		t.Fatalf("expected 2 lineage entries, got %d", len(child.TaskLineage))
	}
	if child.TaskLineage[0] != "task_1" || child.TaskLineage[1] != "task_2" {
		t.Fatalf("unexpected lineage: %v", child.TaskLineage)
	}
	if len(child.AgentChain) != 2 {
		t.Fatalf("expected 2 agent chain entries, got %d", len(child.AgentChain))
	}
	// Labels should be copied, not shared
	child.Labels["key"] = "modified"
	if parent.Labels["key"] != "value" {
		t.Fatal("modifying child labels should not affect parent")
	}
}

func TestPropagationContext_PropagateDeadline(t *testing.T) {
	pc := &PropagationContext{
		Deadline: time.Now().Add(5 * time.Second),
	}

	ctx, cancel := pc.PropagateDeadline(context.Background())
	defer cancel()

	deadline, ok := ctx.Deadline()
	if !ok {
		t.Fatal("expected deadline to be set")
	}
	if deadline.Before(time.Now()) {
		t.Fatal("deadline should be in the future")
	}
}

func TestPropagationContext_PropagateDeadline_Zero(t *testing.T) {
	pc := &PropagationContext{}

	ctx, cancel := pc.PropagateDeadline(context.Background())
	defer cancel()

	_, ok := ctx.Deadline()
	if ok {
		t.Fatal("expected no deadline when Deadline is zero")
	}
}

func TestPropagationContext_RecordAgent(t *testing.T) {
	pc := NewPropagationContext("")
	pc.RecordAgent("agent_A")
	pc.RecordAgent("agent_B")
	pc.RecordAgent("agent_A") // duplicate

	if len(pc.AgentChain) != 2 {
		t.Fatalf("expected 2 unique agents, got %d", len(pc.AgentChain))
	}
	if pc.AgentChain[0] != "agent_A" || pc.AgentChain[1] != "agent_B" {
		t.Fatalf("unexpected agent chain: %v", pc.AgentChain)
	}
}

func TestPropagationContext_DeepChild(t *testing.T) {
	root := NewPropagationContext("trace_root")
	child1 := root.Child("task_1", "agent_1")
	child2 := child1.Child("task_2", "agent_2")

	if len(child2.TaskLineage) != 2 {
		t.Fatalf("expected 2 lineage entries, got %d", len(child2.TaskLineage))
	}
	if len(child2.AgentChain) != 2 {
		t.Fatalf("expected 2 agent chain entries, got %d", len(child2.AgentChain))
	}
	if child2.ParentSpan != "/task_1/task_2" {
		t.Fatalf("unexpected parent span: %s", child2.ParentSpan)
	}
}
