package api

import (
	"strings"
	"testing"
)

func TestShadowBuffer_StageAndGet(t *testing.T) {
	sb := NewShadowBuffer()

	id := sb.Stage("agent-1", "main.go", "old code", "new code")
	if id == "" {
		t.Fatal("expected non-empty patch ID")
	}

	p, ok := sb.Get(id)
	if !ok {
		t.Fatal("expected to find staged patch")
	}
	if p.AgentID != "agent-1" {
		t.Errorf("expected agent-1, got %s", p.AgentID)
	}
	if p.Path != "main.go" {
		t.Errorf("expected main.go, got %s", p.Path)
	}
	if p.OldContent != "old code" {
		t.Errorf("expected 'old code', got %s", p.OldContent)
	}
	if p.NewContent != "new code" {
		t.Errorf("expected 'new code', got %s", p.NewContent)
	}
}

func TestShadowBuffer_GetNotFound(t *testing.T) {
	sb := NewShadowBuffer()

	_, ok := sb.Get("nonexistent")
	if ok {
		t.Error("expected not found")
	}
}

func TestShadowBuffer_List(t *testing.T) {
	sb := NewShadowBuffer()
	sb.Stage("agent-1", "a.go", "", "a")
	sb.Stage("agent-1", "b.go", "", "b")
	sb.Stage("agent-2", "c.go", "", "c")

	all := sb.List("")
	if len(all) != 3 {
		t.Fatalf("expected 3 patches, got %d", len(all))
	}

	agent1 := sb.List("agent-1")
	if len(agent1) != 2 {
		t.Fatalf("expected 2 patches for agent-1, got %d", len(agent1))
	}

	agent2 := sb.List("agent-2")
	if len(agent2) != 1 {
		t.Fatalf("expected 1 patch for agent-2, got %d", len(agent2))
	}
}

func TestShadowBuffer_Commit(t *testing.T) {
	sb := NewShadowBuffer()
	id := sb.Stage("agent-1", "main.go", "", "code")

	if !sb.Commit(id) {
		t.Error("expected commit to succeed")
	}

	_, ok := sb.Get(id)
	if ok {
		t.Error("expected patch to be removed after commit")
	}
}

func TestShadowBuffer_CommitNotFound(t *testing.T) {
	sb := NewShadowBuffer()
	if sb.Commit("nonexistent") {
		t.Error("expected commit to fail for nonexistent patch")
	}
}

func TestShadowBuffer_Reject(t *testing.T) {
	sb := NewShadowBuffer()
	id := sb.Stage("agent-1", "main.go", "", "code")

	if !sb.Reject(id) {
		t.Error("expected reject to succeed")
	}

	_, ok := sb.Get(id)
	if ok {
		t.Error("expected patch to be removed after reject")
	}
}

func TestPendingPatch_Diff(t *testing.T) {
	p := &PendingPatch{
		Path:       "main.go",
		OldContent: "line1\nline2\nline3",
		NewContent: "line1\nmodified\nline3",
	}

	diff := p.Diff()
	if !strings.Contains(diff, "--- a/main.go") {
		t.Error("expected diff header")
	}
	if !strings.Contains(diff, "-line2") {
		t.Error("expected removed line")
	}
	if !strings.Contains(diff, "+modified") {
		t.Error("expected added line")
	}
	if !strings.Contains(diff, " line1") {
		t.Error("expected unchanged line")
	}
}

func TestPendingPatch_DiffAdditions(t *testing.T) {
	p := &PendingPatch{
		Path:       "new.go",
		OldContent: "",
		NewContent: "package main\n\nfunc main() {}",
	}

	diff := p.Diff()
	if !strings.Contains(diff, "+package main") {
		t.Error("expected added lines in diff")
	}
}

func TestPendingPatch_DiffDeletions(t *testing.T) {
	p := &PendingPatch{
		Path:       "deleted.go",
		OldContent: "package main\nfunc main() {}",
		NewContent: "",
	}

	diff := p.Diff()
	if !strings.Contains(diff, "-package main") {
		t.Error("expected removed lines in diff")
	}
}
