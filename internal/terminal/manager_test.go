package terminal

import (
	"strings"
	"testing"
)

func TestManagerCreateAndList(t *testing.T) {
	m := NewManager("/tmp")

	sessions := m.List()
	if len(sessions) != 0 {
		t.Fatalf("expected 0 sessions, got %d", len(sessions))
	}

	s, err := m.Create("/bin/bash", "")
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	defer m.DestroyAll()

	if !strings.HasPrefix(s.ID, "term_") {
		t.Errorf("expected ID to start with term_, got %q", s.ID)
	}
	if s.Dir != "/tmp" {
		t.Errorf("expected Dir=/tmp, got %q", s.Dir)
	}

	sessions = m.List()
	if len(sessions) != 1 {
		t.Fatalf("expected 1 session, got %d", len(sessions))
	}
	if sessions[0].ID != s.ID {
		t.Errorf("expected ID %q, got %q", s.ID, sessions[0].ID)
	}
}

func TestManagerGetAndDestroy(t *testing.T) {
	m := NewManager("/tmp")

	s, err := m.Create("/bin/bash", "")
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	defer m.DestroyAll()

	got, ok := m.Get(s.ID)
	if !ok {
		t.Fatal("Get returned not found for existing session")
	}
	if got.ID != s.ID {
		t.Errorf("expected ID %q, got %q", s.ID, got.ID)
	}

	m.Destroy(s.ID)

	_, ok = m.Get(s.ID)
	if ok {
		t.Error("Get should return not found after Destroy")
	}
}

func TestManagerDestroyAll(t *testing.T) {
	m := NewManager("/tmp")

	_, err := m.Create("/bin/bash", "")
	if err != nil {
		t.Fatalf("Create 1 failed: %v", err)
	}
	_, err = m.Create("/bin/bash", "")
	if err != nil {
		t.Fatalf("Create 2 failed: %v", err)
	}

	if len(m.List()) != 2 {
		t.Fatalf("expected 2 sessions, got %d", len(m.List()))
	}

	m.DestroyAll()

	if len(m.List()) != 0 {
		t.Fatalf("expected 0 sessions after DestroyAll, got %d", len(m.List()))
	}
}
