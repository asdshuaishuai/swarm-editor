package terminal

import (
	"fmt"
	"sync"

	"github.com/google/uuid"
)

// Session represents a single terminal session backed by a PTY.
type Session struct {
	ID    string `json:"id"`
	Pty   *Pty   `json:"-"`
	Dir   string `json:"dir"`
	Shell string `json:"shell"`
}

// Manager manages multiple terminal sessions with thread-safe access.
type Manager struct {
	mu       sync.RWMutex
	sessions map[string]*Session
	workDir  string
}

// NewManager creates a new session manager. The workDir is used as the
// default directory for sessions that don't specify one.
func NewManager(workDir string) *Manager {
	return &Manager{
		sessions: make(map[string]*Session),
		workDir:  workDir,
	}
}

// Create spawns a new terminal session. If dir is empty, workDir is used.
// If shell is empty, the PTY layer selects a default ($SHELL or /bin/bash).
func (m *Manager) Create(shell string, dir string) (*Session, error) {
	if dir == "" {
		dir = m.workDir
	}

	id := "term_" + uuid.New().String()[:8]

	p, err := NewPty(shell, dir)
	if err != nil {
		return nil, fmt.Errorf("create pty: %w", err)
	}

	s := &Session{
		ID:    id,
		Pty:   p,
		Dir:   dir,
		Shell: shell,
	}

	m.mu.Lock()
	m.sessions[id] = s
	m.mu.Unlock()

	return s, nil
}

// Get returns a session by its ID.
func (m *Manager) Get(id string) (*Session, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s, ok := m.sessions[id]
	return s, ok
}

// List returns a copy of all active sessions.
func (m *Manager) List() []*Session {
	m.mu.RLock()
	defer m.mu.RUnlock()

	out := make([]*Session, 0, len(m.sessions))
	for _, s := range m.sessions {
		out = append(out, s)
	}
	return out
}

// Destroy closes the PTY for the given session and removes it from the map.
func (m *Manager) Destroy(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if s, ok := m.sessions[id]; ok {
		_ = s.Pty.Close()
		delete(m.sessions, id)
	}
}

// DestroyAll closes all PTYs and clears the session map.
func (m *Manager) DestroyAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, s := range m.sessions {
		_ = s.Pty.Close()
	}
	clear(m.sessions)
}
