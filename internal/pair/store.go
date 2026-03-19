// Package pair implements session persistence
package pair

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
)

// validSessionIDRegex validates session IDs to prevent path traversal
// Allows alphanumeric, dash, underscore, and dot (for timestamp-based IDs)
var validSessionIDRegex = regexp.MustCompile(`^[a-zA-Z0-9_.-]+$`)

// validateSessionID checks if a session ID is safe to use in file paths
func validateSessionID(id string) error {
	if id == "" {
		return fmt.Errorf("session ID cannot be empty")
	}
	if len(id) > 128 {
		return fmt.Errorf("session ID too long (max 128 characters)")
	}
	if !validSessionIDRegex.MatchString(id) {
		return fmt.Errorf("session ID contains invalid characters (only alphanumeric, dash, and underscore allowed)")
	}
	return nil
}

// Store manages session persistence
type Store struct {
	mu sync.RWMutex

	basePath string
	sessions map[string]*StoredSession
}

// StoredSession represents a session stored on disk
type StoredSession struct {
	ID          string         `json:"id"`
	SessionID   string         `json:"sessionId"`
	DriverID    string         `json:"driverId"`
	NavigatorID string         `json:"navigatorId"`
	State       string         `json:"state"`
	TurnHistory []Turn         `json:"turnHistory"`
	Edits       []CodeEdit     `json:"edits"`
	Messages    []PairMessage  `json:"messages"`
	Suggestions []Suggestion   `json:"suggestions"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
	SwitchCount int            `json:"switchCount"`
	CurrentFile string         `json:"currentFile"`
	CursorPos   Position       `json:"cursorPos"`
	Selection   Range          `json:"selection"`
	Metadata    map[string]any `json:"metadata,omitempty"`
}

// NewStore creates a new session store
func NewStore(basePath string) (*Store, error) {
	if basePath == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return nil, fmt.Errorf("failed to get home directory: %w", err)
		}
		basePath = filepath.Join(home, ".swarm-editor", "sessions")
	}

	// Ensure directory exists with restricted permissions (session data may be sensitive)
	if err := os.MkdirAll(basePath, 0700); err != nil {
		return nil, fmt.Errorf("failed to create sessions directory: %w", err)
	}

	store := &Store{
		basePath: basePath,
		sessions: make(map[string]*StoredSession),
	}

	// Load existing sessions
	if err := store.loadAll(); err != nil {
		// Non-fatal: just start with empty store
		log.Printf("Warning: failed to load existing sessions: %v", err)
	}

	return store, nil
}

// Save persists a pair session
func (s *Store) Save(session *PairSession) error {
	if session == nil {
		return fmt.Errorf("session cannot be nil")
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	stored := &StoredSession{
		ID:          session.ID,
		SessionID:   string(session.SessionID),
		DriverID:    string(session.Driver.ID),
		NavigatorID: string(session.Navigator.ID),
		State:       string(session.State),
		TurnHistory: session.TurnHistory,
		Edits:       session.Edits,
		Messages:    session.Messages,
		Suggestions: session.Suggestions,
		CreatedAt:   session.CreatedAt,
		UpdatedAt:   time.Now(),
		SwitchCount: session.SwitchCount,
		CurrentFile: session.CurrentFile,
		CursorPos:   session.CursorPos,
		Selection:   session.Selection,
		Metadata:    make(map[string]any),
	}

	// Store in memory
	s.sessions[session.ID] = stored

	// Persist to disk
	return s.saveToDisk(stored)
}

// Load loads a session by ID
func (s *Store) Load(id string) (*StoredSession, error) {
	if err := validateSessionID(id); err != nil {
		return nil, fmt.Errorf("invalid session ID: %w", err)
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	session, ok := s.sessions[id]
	if !ok {
		return nil, fmt.Errorf("session not found: %s", id)
	}

	return session, nil
}

// Delete removes a session
func (s *Store) Delete(id string) error {
	if err := validateSessionID(id); err != nil {
		return fmt.Errorf("invalid session ID: %w", err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Remove from memory
	delete(s.sessions, id)

	// Remove from disk
	filename := s.sessionPath(id)
	if err := os.Remove(filename); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete session file: %w", err)
	}

	return nil
}

// List returns all stored session IDs
func (s *Store) List() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ids := make([]string, 0, len(s.sessions))
	for id := range s.sessions {
		ids = append(ids, id)
	}
	return ids
}

// ListByState returns sessions in a specific state
func (s *Store) ListByState(state string) []*StoredSession {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*StoredSession
	for _, session := range s.sessions {
		if session.State == state {
			result = append(result, session)
		}
	}
	return result
}

// ListRecent returns the most recent N sessions
func (s *Store) ListRecent(limit int) []*StoredSession {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Collect all sessions
	sessions := make([]*StoredSession, 0, len(s.sessions))
	for _, session := range s.sessions {
		sessions = append(sessions, session)
	}

	// Sort by updated time (most recent first) using efficient sort
	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].UpdatedAt.After(sessions[j].UpdatedAt)
	})

	// Limit results
	if limit > 0 && len(sessions) > limit {
		sessions = sessions[:limit]
	}

	return sessions
}

// Cleanup removes old completed sessions
func (s *Store) Cleanup(maxAge time.Duration) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	cutoff := time.Now().Add(-maxAge)
	removed := 0

	for id, session := range s.sessions {
		if session.State == string(PairStateEnded) && session.UpdatedAt.Before(cutoff) {
			delete(s.sessions, id)
			filename := s.sessionPath(id)
			if err := os.Remove(filename); err != nil && !os.IsNotExist(err) {
				return removed, fmt.Errorf("failed to delete session %s: %w", id, err)
			}
			removed++
		}
	}

	return removed, nil
}

// GetStats returns store statistics
func (s *Store) GetStats() *StoreStats {
	s.mu.RLock()
	defer s.mu.RUnlock()

	active := 0
	paused := 0
	ended := 0

	for _, session := range s.sessions {
		switch session.State {
		case string(PairStateActive):
			active++
		case string(PairStatePaused):
			paused++
		case string(PairStateEnded):
			ended++
		}
	}

	return &StoreStats{
		TotalSessions: len(s.sessions),
		Active:        active,
		Paused:        paused,
		Ended:         ended,
	}
}

// StoreStats holds store statistics
type StoreStats struct {
	TotalSessions int `json:"totalSessions"`
	Active        int `json:"active"`
	Paused        int `json:"paused"`
	Ended         int `json:"ended"`
}

// saveToDisk saves a session to disk
func (s *Store) saveToDisk(session *StoredSession) error {
	filename := s.sessionPath(session.ID)

	data, err := json.MarshalIndent(session, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal session: %w", err)
	}

	// Write to temp file first, then rename for atomicity
	// Use restricted permissions for session data
	tempFile := filename + ".tmp"
	if err := os.WriteFile(tempFile, data, 0600); err != nil {
		return fmt.Errorf("failed to write session file: %w", err)
	}

	if err := os.Rename(tempFile, filename); err != nil {
		os.Remove(tempFile)
		return fmt.Errorf("failed to rename session file: %w", err)
	}

	return nil
}

// loadAll loads all sessions from disk
func (s *Store) loadAll() error {
	entries, err := os.ReadDir(s.basePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("failed to read sessions directory: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		filename := filepath.Join(s.basePath, entry.Name())
		data, err := os.ReadFile(filename)
		if err != nil {
			continue // Skip files we can't read
		}

		var session StoredSession
		if err := json.Unmarshal(data, &session); err != nil {
			continue // Skip files we can't parse
		}

		s.sessions[session.ID] = &session
	}

	return nil
}

// sessionPath returns the file path for a session
func (s *Store) sessionPath(id string) string {
	return filepath.Join(s.basePath, id+".json")
}

// Export exports a session to JSON
func (s *Store) Export(id string) ([]byte, error) {
	session, err := s.Load(id)
	if err != nil {
		return nil, err
	}

	return json.MarshalIndent(session, "", "  ")
}

// Import imports a session from JSON
func (s *Store) Import(data []byte) (*StoredSession, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("data cannot be empty")
	}
	if len(data) > 10*1024*1024 { // 10MB limit
		return nil, fmt.Errorf("data too large (max 10MB)")
	}

	var session StoredSession
	if err := json.Unmarshal(data, &session); err != nil {
		return nil, fmt.Errorf("failed to parse session: %w", err)
	}

	// Validate session ID to prevent path traversal
	if err := validateSessionID(session.ID); err != nil {
		return nil, fmt.Errorf("invalid session ID in imported data: %w", err)
	}

	s.mu.Lock()
	s.sessions[session.ID] = &session
	s.mu.Unlock()

	if err := s.saveToDisk(&session); err != nil {
		return nil, err
	}

	return &session, nil
}

// Restore restores a stored session to an active PairSession
func (s *Store) Restore(id string, driver, navigator *agent.Agent) (*PairSession, error) {
	if driver == nil || navigator == nil {
		return nil, fmt.Errorf("driver and navigator cannot be nil")
	}

	stored, err := s.Load(id)
	if err != nil {
		return nil, err
	}

	session := &PairSession{
		ID:        stored.ID,
		SessionID: acp.SessionID(stored.SessionID),
		State:     PairSessionState(stored.State),
		Driver:    driver,
		Navigator: navigator,
		CurrentRole: map[acp.AgentID]Role{
			acp.AgentID(driver.ID):    RoleDriver,
			acp.AgentID(navigator.ID): RoleNavigator,
		},
		TurnHistory: stored.TurnHistory,
		Edits:       stored.Edits,
		Messages:    stored.Messages,
		Suggestions: stored.Suggestions,
		CreatedAt:   stored.CreatedAt,
		SwitchCount: stored.SwitchCount,
		CurrentFile: stored.CurrentFile,
		CursorPos:   stored.CursorPos,
		Selection:   stored.Selection,
	}

	return session, nil
}
