package agent

import (
	"context"
	"sync"
	"testing"
	"time"
)

func TestRegistry_Register(t *testing.T) {
	r := NewRegistry()

	agent := NewAgent("test-agent", AgentTypeCoder)

	if err := r.Register(agent); err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	if r.Count() != 1 {
		t.Errorf("expected count 1, got %d", r.Count())
	}
}

func TestRegistry_RegisterNil(t *testing.T) {
	r := NewRegistry()

	if err := r.Register(nil); err == nil {
		t.Error("expected error for nil agent")
	}
}

func TestRegistry_RegisterDuplicate(t *testing.T) {
	r := NewRegistry()
	agent := NewAgent("dup", AgentTypeCoder)

	if err := r.Register(agent); err != nil {
		t.Fatalf("first Register failed: %v", err)
	}
	if err := r.Register(agent); err == nil {
		t.Error("expected error for duplicate registration")
	}
}

func TestRegistry_Unregister(t *testing.T) {
	r := NewRegistry()
	agent := NewAgent("to-remove", AgentTypeCoder)

	if err := r.Register(agent); err != nil {
		t.Fatalf("Register failed: %v", err)
	}
	if err := r.Unregister(agent.ID); err != nil {
		t.Fatalf("Unregister failed: %v", err)
	}

	if r.Count() != 0 {
		t.Errorf("expected count 0, got %d", r.Count())
	}

	// Double unregister should fail
	if err := r.Unregister(agent.ID); err == nil {
		t.Error("expected error for unregistering non-existent agent")
	}
}

func TestRegistry_Get(t *testing.T) {
	r := NewRegistry()
	agent := NewAgent("get-test", AgentTypeReviewer)

	r.Register(agent)

	got, ok := r.Get(agent.ID)
	if !ok {
		t.Fatal("agent not found")
	}
	if got.ID != agent.ID {
		t.Errorf("expected ID %s, got %s", agent.ID, got.ID)
	}

	_, ok = r.Get("non-existent")
	if ok {
		t.Error("expected false for non-existent agent")
	}
}

func TestRegistry_GetByType(t *testing.T) {
	r := NewRegistry()

	coder1 := NewAgent("coder-1", AgentTypeCoder)
	coder2 := NewAgent("coder-2", AgentTypeCoder)
	reviewer := NewAgent("reviewer-1", AgentTypeReviewer)

	r.Register(coder1)
	r.Register(coder2)
	r.Register(reviewer)

	coders := r.GetByType(AgentTypeCoder)
	if len(coders) != 2 {
		t.Errorf("expected 2 coders, got %d", len(coders))
	}

	reviewers := r.GetByType(AgentTypeReviewer)
	if len(reviewers) != 1 {
		t.Errorf("expected 1 reviewer, got %d", len(reviewers))
	}

	navigators := r.GetByType(AgentTypeNavigator)
	if len(navigators) != 0 {
		t.Errorf("expected 0 navigators, got %d", len(navigators))
	}
}

func TestRegistry_GetByTypeAfterUnregister(t *testing.T) {
	r := NewRegistry()

	coder := NewAgent("coder-x", AgentTypeCoder)
	r.Register(coder)
	r.Unregister(coder.ID)

	coders := r.GetByType(AgentTypeCoder)
	if len(coders) != 0 {
		t.Errorf("expected 0 coders after unregister, got %d", len(coders))
	}

	// Type key should be cleaned up
	counts := r.CountByType()
	if _, exists := counts[AgentTypeCoder]; exists {
		t.Error("expected AgentTypeCoder to be removed from type index")
	}
}

func TestRegistry_GetAll(t *testing.T) {
	r := NewRegistry()

	agents := []*Agent{
		NewAgent("a1", AgentTypeCoder),
		NewAgent("a2", AgentTypeReviewer),
		NewAgent("a3", AgentTypeArchitect),
	}

	for _, a := range agents {
		r.Register(a)
	}

	all := r.GetAll()
	if len(all) != 3 {
		t.Errorf("expected 3 agents, got %d", len(all))
	}
}

func TestRegistry_GetIdle(t *testing.T) {
	r := NewRegistry()

	idle := NewAgent("idle-agent", AgentTypeCoder)
	busy := NewAgent("busy-agent", AgentTypeCoder)

	r.Register(idle)
	r.Register(busy)

	busy.SetState(StateExecuting)

	idleAgents := r.GetIdle()
	if len(idleAgents) != 1 {
		t.Errorf("expected 1 idle agent, got %d", len(idleAgents))
	}
	if idleAgents[0].ID != idle.ID {
		t.Errorf("expected idle agent ID %s, got %s", idle.ID, idleAgents[0].ID)
	}
}

func TestRegistry_CountByType(t *testing.T) {
	r := NewRegistry()

	r.Register(NewAgent("c1", AgentTypeCoder))
	r.Register(NewAgent("c2", AgentTypeCoder))
	r.Register(NewAgent("r1", AgentTypeReviewer))

	counts := r.CountByType()
	if counts[AgentTypeCoder] != 2 {
		t.Errorf("expected 2 coders, got %d", counts[AgentTypeCoder])
	}
	if counts[AgentTypeReviewer] != 1 {
		t.Errorf("expected 1 reviewer, got %d", counts[AgentTypeReviewer])
	}
}

func TestRegistry_ConcurrentAccess(t *testing.T) {
	r := NewRegistry()

	var wg sync.WaitGroup
	for range 100 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			agent := NewAgent("concurrent", AgentTypeCoder)
			_ = r.Register(agent)
			r.Get(agent.ID)
			r.GetByType(AgentTypeCoder)
			r.GetAll()
			r.Count()
		}()
	}
	wg.Wait()
}

// --- Lifecycle tests ---

func TestNewLifecycle_NilRegistry(t *testing.T) {
	lc := NewLifecycle(nil)
	if lc != nil {
		t.Error("expected nil for nil registry")
	}
}

func TestLifecycle_Spawn(t *testing.T) {
	r := NewRegistry()
	lc := NewLifecycle(r)
	defer lc.Stop()

	agent := lc.Spawn("spawned", AgentTypeCoder)
	if agent == nil {
		t.Fatal("expected agent, got nil")
	}
	if agent.Name != "spawned" {
		t.Errorf("expected name 'spawned', got %s", agent.Name)
	}
	if agent.Type != AgentTypeCoder {
		t.Errorf("expected type %s, got %s", AgentTypeCoder, agent.Type)
	}

	if r.Count() != 1 {
		t.Errorf("expected 1 registered agent, got %d", r.Count())
	}
}

func TestLifecycle_SpawnAfterStop(t *testing.T) {
	r := NewRegistry()
	lc := NewLifecycle(r)
	lc.Stop()

	agent := lc.Spawn("after-stop", AgentTypeCoder)
	if agent != nil {
		t.Error("expected nil after Stop()")
	}
}

func TestLifecycle_OnSpawn(t *testing.T) {
	r := NewRegistry()
	lc := NewLifecycle(r)
	defer lc.Stop()

	var spawned *Agent
	lc.OnSpawn(func(a *Agent) {
		spawned = a
	})

	agent := lc.Spawn("callback-test", AgentTypeReviewer)
	if spawned == nil {
		t.Fatal("expected OnSpawn callback to fire")
	}
	if spawned.ID != agent.ID {
		t.Errorf("expected callback agent ID %s, got %s", agent.ID, spawned.ID)
	}
}

func TestLifecycle_OnTerminate(t *testing.T) {
	r := NewRegistry()
	lc := NewLifecycle(r)
	defer lc.Stop()

	agent := lc.Spawn("to-terminate", AgentTypeCoder)

	var terminated *Agent
	lc.OnTerminate(func(a *Agent) {
		terminated = a
	})

	if err := lc.Terminate(context.Background(), agent.ID); err != nil {
		t.Fatalf("Terminate failed: %v", err)
	}

	if terminated == nil {
		t.Fatal("expected OnTerminate callback to fire")
	}
	if terminated.ID != agent.ID {
		t.Errorf("expected terminated agent ID %s, got %s", agent.ID, terminated.ID)
	}
}

func TestLifecycle_TerminateNotFound(t *testing.T) {
	r := NewRegistry()
	lc := NewLifecycle(r)
	defer lc.Stop()

	err := lc.Terminate(context.Background(), "non-existent")
	if err == nil {
		t.Error("expected error for terminating non-existent agent")
	}
}

func TestLifecycle_StateChangeCallback(t *testing.T) {
	r := NewRegistry()
	lc := NewLifecycle(r)
	defer lc.Stop()

	var mu sync.Mutex
	var transitions []string
	lc.OnStateChange(func(a *Agent, oldState, newState AgentState) {
		mu.Lock()
		transitions = append(transitions, string(oldState)+"->"+string(newState))
		mu.Unlock()
	})

	agent := lc.Spawn("state-change", AgentTypeCoder)

	// Wait for monitor goroutine to start and capture initial state (100ms ticker)
	time.Sleep(150 * time.Millisecond)

	// Now change state — monitor will detect the delta on next tick
	agent.SetState(StateThinking)

	// Wait for the 100ms ticker to pick up the change
	time.Sleep(300 * time.Millisecond)

	mu.Lock()
	defer mu.Unlock()
	if len(transitions) == 0 {
		t.Error("expected state change callback to fire")
	}
}

// --- Pool tests ---

func TestPool_Add(t *testing.T) {
	p := NewPool(5)
	agent := NewAgent("pool-agent", AgentTypeCoder)

	if err := p.Add(agent); err != nil {
		t.Fatalf("Add failed: %v", err)
	}
	if p.Size() != 1 {
		t.Errorf("expected size 1, got %d", p.Size())
	}
}

func TestPool_AddNil(t *testing.T) {
	p := NewPool(5)
	if err := p.Add(nil); err == nil {
		t.Error("expected error for nil agent")
	}
}

func TestPool_AddFull(t *testing.T) {
	p := NewPool(2)

	p.Add(NewAgent("a1", AgentTypeCoder))
	p.Add(NewAgent("a2", AgentTypeCoder))

	if err := p.Add(NewAgent("a3", AgentTypeCoder)); err == nil {
		t.Error("expected error when pool is full")
	}
}

func TestPool_Acquire(t *testing.T) {
	p := NewPool(5)
	agent := NewAgent("acquire-test", AgentTypeCoder)
	p.Add(agent)

	ctx := context.Background()
	got, err := p.Acquire(ctx)
	if err != nil {
		t.Fatalf("Acquire failed: %v", err)
	}
	if got.ID != agent.ID {
		t.Errorf("expected agent ID %s, got %s", agent.ID, got.ID)
	}
}

func TestPool_AcquireCancelled(t *testing.T) {
	p := NewPool(5)
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	_, err := p.Acquire(ctx)
	if err == nil {
		t.Error("expected error from cancelled context")
	}
}

func TestPool_Release(t *testing.T) {
	p := NewPool(5)
	agent := NewAgent("release-test", AgentTypeCoder)
	agent.SetState(StateExecuting)

	p.Add(agent)
	p.Release(agent)

	if agent.GetState() != StateIdle {
		t.Errorf("expected agent to be idle after release, got %s", agent.GetState())
	}

	// Should be acquirable again
	ctx := context.Background()
	got, err := p.Acquire(ctx)
	if err != nil {
		t.Fatalf("Acquire after Release failed: %v", err)
	}
	if got.ID != agent.ID {
		t.Errorf("expected same agent after release, got %s", got.ID)
	}
}

func TestPool_ReleaseNonBlocking(t *testing.T) {
	p := NewPool(1)
	agent := NewAgent("non-block", AgentTypeCoder)
	p.Add(agent)

	// ready channel is size 1. After Add, it has 1 item.
	// Release should not block even if channel is full.
	agent.SetState(StateExecuting)
	p.Release(agent) // Should not block
}
