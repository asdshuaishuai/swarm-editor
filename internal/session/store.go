// Package session provides session persistence for agent conversations
package session

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
)

// Validation constants
const (
	maxSessionIDLen = 256
)

// validateSessionID validates a session ID for safety
func validateSessionID(id string) error {
	if id == "" {
		return errors.New("session id is required")
	}
	if len(id) > maxSessionIDLen {
		return errors.New("session id too long")
	}
	if strings.Contains(id, "..") {
		return errors.New("session id cannot contain path traversal sequences")
	}
	if strings.ContainsAny(id, "/\\") {
		return errors.New("session id cannot contain path separators")
	}
	return nil
}

// Session represents a conversation session with an agent
type Session struct {
	ID           string         `json:"id"`
	AgentID      string         `json:"agentId"`
	CreatedAt    time.Time      `json:"createdAt"`
	UpdatedAt    time.Time      `json:"updatedAt"`
	Messages     []Message      `json:"messages"`
	Status       string         `json:"status"` // "active", "closed", "archived"
	Metadata     map[string]any `json:"metadata"`
	acpSessionID acp.SessionID  `json:"-"` // Runtime ACP session ID, not persisted
}

// Message represents a message in a session
type Message struct {
	ID        string         `json:"id"`
	Role      string         `json:"role"` // "user", "assistant", "system"
	Content   []ContentBlock `json:"content"`
	CreatedAt time.Time      `json:"createdAt"`
	Metadata  map[string]any `json:"metadata"`
}

// ContentBlock represents a block of content in a message
type ContentBlock struct {
	Type     string     `json:"type"` // "text", "resource", "image"
	Text     string     `json:"text,omitempty"`
	Resource *Resource  `json:"resource,omitempty"`
	Image    *ImageData `json:"image,omitempty"`
}

// Resource represents a resource reference
type Resource struct {
	URI      string `json:"uri"`
	MimeType string `json:"mimeType,omitempty"`
}

// ImageData represents image data
type ImageData struct {
	URL    string `json:"url,omitempty"`
	Base64 string `json:"base64,omitempty"`
	Format string `json:"format"`
}

// writeRequest represents a pending write to disk
type writeRequest struct {
	sessionID string
	data      []byte
}

// Store manages session persistence
type Store struct {
	mu         sync.RWMutex
	sessions   map[string]*Session
	byAgent    map[string][]string // agentID -> session IDs
	dataDir    string
	writeQueue chan writeRequest // sequential write queue
	writeWg    sync.WaitGroup    // tracks pending writes

	// Lifecycle management
	closed    bool
	closeChan chan struct{}  // signals writeWorker to stop
	closeWg   sync.WaitGroup // tracks writeWorker goroutine
}

// NewStore creates a new session store
func NewStore(dataDir string) (*Store, error) {
	store := &Store{
		sessions:   make(map[string]*Session),
		byAgent:    make(map[string][]string),
		dataDir:    dataDir,
		writeQueue: make(chan writeRequest, 100), // buffered for non-blocking enqueue
		closeChan:  make(chan struct{}),
	}

	// Start the sequential write worker (tracked for graceful shutdown)
	store.closeWg.Add(1)
	go store.writeWorker()

	// Load existing sessions from disk
	if err := store.loadFromDisk(); err != nil {
		// Non-fatal: just log and continue
		log.Printf("[Session] Warning: failed to load sessions from disk: %v", err)
	}

	return store, nil
}

// writeWorker processes write requests sequentially, preserving order
func (s *Store) writeWorker() {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[Session] writeWorker panic: %v", r)
		}
		s.closeWg.Done()
	}()

	for {
		select {
		case req := <-s.writeQueue:
			// MEDIUM: Ensure writeWg.Done() is always called even if writeFileSync panics.
			// Without this, a panic in writeFileSync would skip Done(), causing
			// WaitForWrites() to hang forever.
			func() {
				defer s.writeWg.Done()
				defer func() {
					if r := recover(); r != nil {
						log.Printf("[Session] writeFileSync panic (recovered): %v", r)
					}
				}()
				s.writeFileSync(req.sessionID, req.data)
			}()
		case <-s.closeChan:
			// Drain remaining writes before exiting
			for {
				select {
				case req := <-s.writeQueue:
					func() {
						defer s.writeWg.Done()
						defer func() {
							if r := recover(); r != nil {
								log.Printf("[Session] writeFileSync panic in drain (recovered): %v", r)
							}
						}()
						s.writeFileSync(req.sessionID, req.data)
					}()
				default:
					return
				}
			}
		}
	}
}

// writeFileSync writes data to disk synchronously (called by writeWorker)
func (s *Store) writeFileSync(sessionID string, data []byte) {
	if s.dataDir == "" {
		return
	}
	path := filepath.Join(s.dataDir, sessionID+".json")
	// Atomic write: write to temp file then rename
	tmp, err := os.CreateTemp(s.dataDir, sessionID+".*.tmp")
	if err != nil {
		log.Printf("[Session] Failed to create temp file for %s: %v", sessionID, err)
		return
	}
	// Restrict permissions for session data
	if err := tmp.Chmod(0600); err != nil {
		log.Printf("[Session] Failed to set permissions on temp file for %s: %v", sessionID, err)
	}
	tmpPath := tmp.Name()
	_, err = tmp.Write(data)
	if err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		log.Printf("[Session] Failed to write temp file for %s: %v", sessionID, err)
		return
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		log.Printf("[Session] Failed to close temp file for %s: %v", sessionID, err)
		return
	}
	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		log.Printf("[Session] Failed to rename temp file for %s: %v", sessionID, err)
		return
	}
}

// loadFromDisk loads all sessions from the data directory
func (s *Store) loadFromDisk() error {
	if s.dataDir == "" {
		return nil
	}

	// Ensure directory exists
	if err := os.MkdirAll(s.dataDir, 0755); err != nil {
		return fmt.Errorf("failed to create data directory: %w", err)
	}

	// Read all session files
	entries, err := os.ReadDir(s.dataDir)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("failed to read data directory: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}

		path := filepath.Join(s.dataDir, entry.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			log.Printf("[Session] Warning: failed to read session file %s: %v", path, err)
			continue
		}

		var session Session
		if err := json.Unmarshal(data, &session); err != nil {
			log.Printf("[Session] Warning: failed to parse session file %s: %v", path, err)
			continue
		}

		// Validate session ID to prevent path traversal from crafted files
		if err := validateSessionID(session.ID); err != nil {
			log.Printf("[Session] Warning: skipping session with invalid ID from file %s: %v", entry.Name(), err)
			continue
		}

		s.sessions[session.ID] = &session
		s.byAgent[session.AgentID] = append(s.byAgent[session.AgentID], session.ID)
	}

	return nil
}

// enqueueWrite queues a write to be processed sequentially by the write worker.
// This preserves write order, preventing later operations from being written before earlier ones.
// IMPORTANT: Caller must NOT hold s.mu lock when calling this (to avoid deadlock with writeWorker).
func (s *Store) enqueueWrite(sessionID string, data []byte) {
	if s.dataDir == "" {
		return
	}
	s.writeWg.Add(1)
	select {
	case s.writeQueue <- writeRequest{sessionID: sessionID, data: data}:
	default:
		// Queue full — drop write to prevent blocking callers holding s.mu.
		// This may lose the latest write, but prevents latency spikes.
		s.writeWg.Done()
		log.Printf("[Session] write queue full, dropping write for session %s", sessionID)
	}
}

// WaitForWrites blocks until all pending writes complete (for testing)
func (s *Store) WaitForWrites() {
	s.writeWg.Wait()
}

// Close gracefully shuts down the store, completing all pending writes
func (s *Store) Close() error {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return nil
	}
	s.closed = true
	s.mu.Unlock()

	// Signal writeWorker to stop and wait for it
	close(s.closeChan)
	s.closeWg.Wait()

	return nil
}

// deleteFromDisk removes a session file from disk
func (s *Store) deleteFromDisk(sessionID string) error {
	if s.dataDir == "" {
		return nil
	}

	path := filepath.Join(s.dataDir, sessionID+".json")
	if err := os.Remove(path); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("failed to delete session file: %w", err)
	}

	return nil
}

// Create creates a new session
func (s *Store) Create(id, agentID string) *Session {
	// Validate session ID for safety
	if err := validateSessionID(id); err != nil {
		log.Printf("[Session] Invalid session id rejected: %v", err)
		return nil
	}

	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return nil
	}

	now := time.Now()
	session := &Session{
		ID:        id,
		AgentID:   agentID,
		CreatedAt: now,
		UpdatedAt: now,
		Messages:  make([]Message, 0),
		Status:    "active",
		Metadata:  make(map[string]any),
	}

	s.sessions[id] = session
	s.byAgent[agentID] = append(s.byAgent[agentID], id)

	// Create a copy for serialization outside lock
	sessionCopy := copySession(session)
	s.mu.Unlock()

	// Marshal outside lock to avoid blocking other goroutines
	if sessionCopy != nil {
		data, err := json.MarshalIndent(sessionCopy, "", "  ")
		if err != nil {
			log.Printf("[Session] Failed to marshal session %s: %v", id, err)
		} else {
			s.enqueueWrite(id, data)
		}
	}

	return sessionCopy
}

// Get retrieves a session by ID. Returns a deep copy to prevent mutation of internal state.
func (s *Store) Get(id string) *Session {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if session, ok := s.sessions[id]; ok {
		return copySession(session)
	}
	return nil
}

// List returns all sessions. Returns deep copies to prevent mutation of internal state.
func (s *Store) List() []*Session {
	s.mu.RLock()
	defer s.mu.RUnlock()

	sessions := make([]*Session, 0, len(s.sessions))
	for _, session := range s.sessions {
		sessions = append(sessions, copySession(session))
	}

	// Sort by updated time descending
	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].UpdatedAt.After(sessions[j].UpdatedAt)
	})

	return sessions
}

// ListByAgent returns all sessions for a specific agent. Returns deep copies.
func (s *Store) ListByAgent(agentID string) []*Session {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ids, ok := s.byAgent[agentID]
	if !ok {
		return nil
	}

	sessions := make([]*Session, 0, len(ids))
	for _, id := range ids {
		if session, ok := s.sessions[id]; ok {
			sessions = append(sessions, copySession(session))
		}
	}

	// Sort by updated time descending
	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].UpdatedAt.After(sessions[j].UpdatedAt)
	})

	return sessions
}

// AddMessage adds a message to a session
func (s *Store) AddMessage(sessionID string, message Message) error {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return fmt.Errorf("store is closed")
	}

	session, ok := s.sessions[sessionID]
	if !ok {
		s.mu.Unlock()
		return fmt.Errorf("session not found")
	}

	if message.ID == "" {
		message.ID = fmt.Sprintf("%s-%d", sessionID, len(session.Messages)+1)
	}
	if message.CreatedAt.IsZero() {
		message.CreatedAt = time.Now()
	}
	if message.Metadata == nil {
		message.Metadata = make(map[string]any)
	}

	session.Messages = append(session.Messages, message)

	// Limit message history to prevent memory leak (keep last 1000 messages per session)
	const maxMessagesPerSession = 1000
	if len(session.Messages) > maxMessagesPerSession {
		session.Messages = session.Messages[len(session.Messages)-maxMessagesPerSession:]
	}

	session.UpdatedAt = time.Now()

	// MEDIUM FIX: Copy session and enqueue write outside lock
	// (enqueueWrite doc says caller must NOT hold s.mu)
	sessionCopy := copySession(session)
	s.mu.Unlock()

	if sessionCopy != nil {
		data, err := json.MarshalIndent(sessionCopy, "", "  ")
		if err != nil {
			log.Printf("[Session] Failed to marshal session %s: %v", sessionID, err)
		} else {
			s.enqueueWrite(sessionID, data)
		}
	}

	return nil
}

// UpdateStatus updates a session's status
func (s *Store) UpdateStatus(sessionID, status string) error {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return fmt.Errorf("store is closed")
	}

	session, ok := s.sessions[sessionID]
	if !ok {
		s.mu.Unlock()
		return fmt.Errorf("session not found")
	}

	session.Status = status
	session.UpdatedAt = time.Now()

	// MEDIUM FIX: Copy session and enqueue write outside lock
	// (enqueueWrite doc says caller must NOT hold s.mu)
	sessionCopy := copySession(session)
	s.mu.Unlock()

	if sessionCopy != nil {
		data, err := json.MarshalIndent(sessionCopy, "", "  ")
		if err != nil {
			log.Printf("[Session] Failed to marshal session %s: %v", sessionID, err)
		} else {
			s.enqueueWrite(sessionID, data)
		}
	}

	return nil
}

// Delete removes a session
func (s *Store) Delete(sessionID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	session, ok := s.sessions[sessionID]
	if !ok {
		return nil // Already gone
	}

	// Remove from byAgent index (avoid memory leak by creating new slice)
	if ids, ok := s.byAgent[session.AgentID]; ok {
		newIDs := make([]string, 0, len(ids)-1)
		for _, id := range ids {
			if id != sessionID {
				newIDs = append(newIDs, id)
			}
		}
		if len(newIDs) == 0 {
			delete(s.byAgent, session.AgentID)
		} else {
			s.byAgent[session.AgentID] = newIDs
		}
	}

	delete(s.sessions, sessionID)

	// Remove from disk synchronously to avoid TOCTOU race
	// (concurrent Create with same ID could have file deleted)
	if err := s.deleteFromDisk(sessionID); err != nil {
		log.Printf("[Session] Failed to delete session %s from disk: %v", sessionID, err)
	}

	return nil
}

// SetACPSessionID sets the runtime ACP session ID
func (s *Store) SetACPSessionID(sessionID string, acpSessionID acp.SessionID) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	session, ok := s.sessions[sessionID]
	if !ok {
		return fmt.Errorf("session not found")
	}

	session.acpSessionID = acpSessionID
	return nil
}

// GetACPSessionID gets the runtime ACP session ID
func (s *Store) GetACPSessionID(sessionID string) (acp.SessionID, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	session, ok := s.sessions[sessionID]
	if !ok {
		return "", fmt.Errorf("session not found")
	}

	return session.acpSessionID, nil
}

// Search searches sessions by content
func (s *Store) Search(query string) []*Session {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query = strings.ToLower(query)
	var results []*Session
	seen := make(map[string]struct{}, len(s.sessions))

	for _, session := range s.sessions {
		if _, exists := seen[session.ID]; exists {
			continue
		}
		// Search in messages
		for _, msg := range session.Messages {
			for _, block := range msg.Content {
				if block.Type == "text" && strings.Contains(strings.ToLower(block.Text), query) {
					results = append(results, copySession(session))
					seen[session.ID] = struct{}{}
					break
				}
			}
			if _, exists := seen[session.ID]; exists {
				break
			}
		}
	}

	// Sort by relevance (updated time)
	sort.Slice(results, func(i, j int) bool {
		return results[i].UpdatedAt.After(results[j].UpdatedAt)
	})

	return results
}

// GetStats returns store statistics
func (s *Store) GetStats() StoreStats {
	s.mu.RLock()
	defer s.mu.RUnlock()

	activeCount := 0
	totalMessages := 0
	for _, session := range s.sessions {
		if session.Status == "active" {
			activeCount++
		}
		totalMessages += len(session.Messages)
	}

	return StoreStats{
		TotalSessions:  len(s.sessions),
		ActiveSessions: activeCount,
		TotalMessages:  totalMessages,
		AgentCount:     len(s.byAgent),
	}
}

// StoreStats holds store statistics
type StoreStats struct {
	TotalSessions  int `json:"totalSessions"`
	ActiveSessions int `json:"activeSessions"`
	TotalMessages  int `json:"totalMessages"`
	AgentCount     int `json:"agentCount"`
}

// copySession creates a deep copy of a Session via JSON round-trip.
// This prevents callers from mutating internal state.
func copySession(s *Session) *Session {
	data, err := json.Marshal(s)
	if err != nil {
		return nil
	}
	cp := &Session{}
	if err := json.Unmarshal(data, cp); err != nil {
		return nil
	}
	return cp
}
