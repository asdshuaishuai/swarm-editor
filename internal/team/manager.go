// Package team implements multi-team collaboration functionality
package team

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
)

// ErrPermissionDenied is returned when an operation lacks required permissions.
var ErrPermissionDenied = errors.New("permission denied")

// maxRequestBodySize is the maximum allowed request body size (1MB)
const maxRequestBodySize = 1 << 20

// Team represents a team of agents
type Team struct {
	mu sync.RWMutex

	ID          string
	Name        string
	Description string
	Owner       string

	Members map[string]*Member
	Agents  map[acp.AgentID]*agent.Agent
	// AgentIDs is a list of agent IDs for JSON serialization and API compatibility
	AgentIDs []string `json:"agentIds"`

	Workspaces map[string]*Workspace

	CreatedAt time.Time
	Settings  TeamSettings
}

// Member represents a team member
type Member struct {
	ID       string       `json:"id"`
	Name     string       `json:"name"`
	Email    string       `json:"email,omitempty"`
	Role     MemberRole   `json:"role"`
	JoinedAt time.Time    `json:"joinedAt"`
	AgentID  *acp.AgentID `json:"agentId,omitempty"`
	Online   bool         `json:"online"`
	Skills   []string     `json:"skills,omitempty"`
}

// MemberRole defines the role of a team member
type MemberRole string

const (
	RoleOwner     MemberRole = "owner"
	RoleAdmin     MemberRole = "admin"
	RoleDeveloper MemberRole = "developer"
	RoleReviewer  MemberRole = "reviewer"
	RoleObserver  MemberRole = "observer"
)

// EventBroadcaster is an interface for broadcasting events to clients
type EventBroadcaster interface {
	Broadcast(eventType string, payload any)
}

// TeamSettings contains team configuration
type TeamSettings struct {
	MaxMembers         int                `json:"maxMembers"`
	MaxAgents          int                `json:"maxAgents"`
	RequireApproval    bool               `json:"requireApproval"`
	AutoAssignAgents   bool               `json:"autoAssignAgents"`
	Permissions        map[string]bool    `json:"permissions"`
	NotificationConfig NotificationConfig `json:"notificationConfig"`
}

// NotificationConfig configures notifications
type NotificationConfig struct {
	OnCommit    bool `json:"onCommit"`
	OnReview    bool `json:"onReview"`
	OnMerge     bool `json:"onMerge"`
	OnIssue     bool `json:"onIssue"`
	OnAgentTask bool `json:"onAgentTask"`
}

// NewTeam creates a new team
func NewTeam(id, name, owner string) *Team {
	return &Team{
		ID:         id,
		Name:       name,
		Owner:      owner,
		Members:    make(map[string]*Member),
		Agents:     make(map[acp.AgentID]*agent.Agent),
		Workspaces: make(map[string]*Workspace),
		CreatedAt:  time.Now(),
		Settings: TeamSettings{
			MaxMembers:       50,
			MaxAgents:        20,
			RequireApproval:  true,
			AutoAssignAgents: true,
			Permissions: map[string]bool{
				"create_workspace": true,
				"delete_workspace": false,
				"invite_member":    true,
				"assign_agent":     true,
			},
		},
	}
}

// AddMember adds a member to the team
func (t *Team) AddMember(member *Member) error {
	if member == nil {
		return fmt.Errorf("member cannot be nil")
	}
	t.mu.Lock()
	defer t.mu.Unlock()

	if len(t.Members) >= t.Settings.MaxMembers {
		return fmt.Errorf("team is full")
	}

	if _, exists := t.Members[member.ID]; exists {
		return fmt.Errorf("member already exists")
	}

	member.JoinedAt = time.Now()
	t.Members[member.ID] = member
	return nil
}

// RemoveMember removes a member from the team
func (t *Team) RemoveMember(memberID string) error {
	t.mu.Lock()
	defer t.mu.Unlock()

	if memberID == t.Owner {
		return fmt.Errorf("cannot remove team owner")
	}

	delete(t.Members, memberID)
	return nil
}

// GetMember retrieves a copy of a member by ID
// Returns a copy to prevent data races - modify via team methods instead
func (t *Team) GetMember(memberID string) (*Member, bool) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	member, ok := t.Members[memberID]
	if !ok {
		return nil, false
	}
	// Return a copy to prevent data races
	memberCopy := *member
	return &memberCopy, true
}

// AddAgent adds an agent to the team
func (t *Team) AddAgent(a *agent.Agent) error {
	t.mu.Lock()
	defer t.mu.Unlock()

	if a == nil {
		return fmt.Errorf("agent cannot be nil")
	}

	if len(t.Agents) >= t.Settings.MaxAgents {
		return fmt.Errorf("agent limit reached")
	}

	if _, exists := t.Agents[a.ID]; exists {
		return fmt.Errorf("agent %s already in team", a.ID)
	}

	t.Agents[a.ID] = a
	return nil
}

// RemoveAgent removes an agent from the team
func (t *Team) RemoveAgent(agentID acp.AgentID) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.Agents, agentID)
}

// GetAgent retrieves an agent by ID. Returns the internal pointer.
// The agent object has its own synchronization for concurrent access.
func (t *Team) GetAgent(agentID acp.AgentID) (*agent.Agent, bool) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	agent, ok := t.Agents[agentID]
	return agent, ok
}

// CreateWorkspace creates a new workspace
func (t *Team) CreateWorkspace(name, path string) (*Workspace, error) {
	t.mu.Lock()
	defer t.mu.Unlock()

	id := generateWorkspaceID()
	workspace := NewWorkspace(id, name, path, t.ID)
	t.Workspaces[id] = workspace
	return workspace, nil
}

// GetWorkspace retrieves a workspace by ID. Returns the internal pointer.
// The workspace has its own mutex (mu) for concurrent access.
func (t *Team) GetWorkspace(id string) (*Workspace, bool) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	workspace, ok := t.Workspaces[id]
	return workspace, ok
}

// ListWorkspaces lists all workspaces
func (t *Team) ListWorkspaces() []*Workspace {
	t.mu.RLock()
	defer t.mu.RUnlock()

	result := make([]*Workspace, 0, len(t.Workspaces))
	for _, w := range t.Workspaces {
		result = append(result, w)
	}
	return result
}

// GetStats returns team statistics
func (t *Team) GetStats() *TeamStats {
	t.mu.RLock()
	defer t.mu.RUnlock()

	onlineMembers := 0
	for _, m := range t.Members {
		if m.Online {
			onlineMembers++
		}
	}

	idleAgents := 0
	for _, a := range t.Agents {
		if a.GetState() == agent.StateIdle {
			idleAgents++
		}
	}

	return &TeamStats{
		TeamID:         t.ID,
		Name:           t.Name,
		MemberCount:    len(t.Members),
		OnlineMembers:  onlineMembers,
		AgentCount:     len(t.Agents),
		IdleAgents:     idleAgents,
		WorkspaceCount: len(t.Workspaces),
	}
}

// TeamMemberInfo is a read-only snapshot of a team member for safe external access.
type TeamMemberInfo struct {
	ID   string
	Name string
	Role string
}

// TeamSnapshot is a read-only snapshot of a team for safe external access.
type TeamSnapshot struct {
	ID          string
	Name        string
	Description string
	Owner       string
	Members     []TeamMemberInfo
	AgentIDs    []string
	CreatedAt   time.Time
}

// Snapshot returns a thread-safe copy of team fields needed for API responses.
func (t *Team) Snapshot() TeamSnapshot {
	t.mu.RLock()
	defer t.mu.RUnlock()

	members := make([]TeamMemberInfo, 0, len(t.Members))
	for _, m := range t.Members {
		members = append(members, TeamMemberInfo{
			ID:   m.ID,
			Name: m.Name,
			Role: string(m.Role),
		})
	}

	agentIDs := make([]string, 0, len(t.Agents))
	for _, a := range t.Agents {
		agentIDs = append(agentIDs, string(a.ID))
	}

	return TeamSnapshot{
		ID:          t.ID,
		Name:        t.Name,
		Description: t.Description,
		Owner:       t.Owner,
		Members:     members,
		AgentIDs:    agentIDs,
		CreatedAt:   t.CreatedAt,
	}
}

// TeamStats holds team statistics
type TeamStats struct {
	TeamID         string `json:"teamId"`
	Name           string `json:"name"`
	MemberCount    int    `json:"memberCount"`
	OnlineMembers  int    `json:"onlineMembers"`
	AgentCount     int    `json:"agentCount"`
	IdleAgents     int    `json:"idleAgents"`
	WorkspaceCount int    `json:"workspaceCount"`
}

// Workspace represents a shared workspace
type Workspace struct {
	mu sync.RWMutex

	ID     string
	Name   string
	Path   string
	TeamID string

	Files       map[string]*FileState
	ActiveUsers map[string]*CursorPosition

	Reviews map[string]*Review

	CreatedAt time.Time
	UpdatedAt time.Time
}

// FileState represents the state of a file
type FileState struct {
	Path         string    `json:"path"`
	LastModified time.Time `json:"lastModified"`
	ModifiedBy   string    `json:"modifiedBy"`
	LockedBy     string    `json:"lockedBy,omitempty"`
	HasConflict  bool      `json:"hasConflict"`
}

// CursorPosition represents a user's cursor position
type CursorPosition struct {
	UserID    string `json:"userId"`
	File      string `json:"file"`
	Line      int    `json:"line"`
	Column    int    `json:"column"`
	Selection *Range `json:"selection,omitempty"`
}

// Range represents a text range
type Range struct {
	StartLine   int `json:"startLine"`
	StartColumn int `json:"startColumn"`
	EndLine     int `json:"endLine"`
	EndColumn   int `json:"endColumn"`
}

// Review represents a code review
type Review struct {
	ID          string          `json:"id"`
	File        string          `json:"file"`
	Author      string          `json:"author"`
	Status      ReviewStatus    `json:"status"`
	Comments    []ReviewComment `json:"comments"`
	CreatedAt   time.Time       `json:"createdAt"`
	CompletedAt *time.Time      `json:"completedAt,omitempty"`
}

// ReviewStatus represents the status of a review
type ReviewStatus string

const (
	ReviewPending  ReviewStatus = "pending"
	ReviewApproved ReviewStatus = "approved"
	ReviewRejected ReviewStatus = "rejected"
	ReviewChanges  ReviewStatus = "changes_requested"
)

// ReviewComment represents a comment on a review
type ReviewComment struct {
	ID        string    `json:"id"`
	Author    string    `json:"author"`
	Line      int       `json:"line"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"createdAt"`
}

// NewWorkspace creates a new workspace
func NewWorkspace(id, name, path, teamID string) *Workspace {
	return &Workspace{
		ID:          id,
		Name:        name,
		Path:        path,
		TeamID:      teamID,
		Files:       make(map[string]*FileState),
		ActiveUsers: make(map[string]*CursorPosition),
		Reviews:     make(map[string]*Review),
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
}

// UpdateFile updates the state of a file
func (w *Workspace) UpdateFile(path, modifiedBy string) {
	if path == "" {
		return
	}

	w.mu.Lock()
	defer w.mu.Unlock()

	w.Files[path] = &FileState{
		Path:         path,
		LastModified: time.Now(),
		ModifiedBy:   modifiedBy,
	}
	w.UpdatedAt = time.Now()
}

// LockFile locks a file for exclusive editing
func (w *Workspace) LockFile(path, userID string) error {
	if path == "" || userID == "" {
		return fmt.Errorf("path and userID are required")
	}

	w.mu.Lock()
	defer w.mu.Unlock()

	file, ok := w.Files[path]
	if !ok {
		file = &FileState{Path: path}
		w.Files[path] = file
	}

	if file.LockedBy != "" && file.LockedBy != userID {
		return fmt.Errorf("file locked by %s", file.LockedBy)
	}

	file.LockedBy = userID
	return nil
}

// UnlockFile unlocks a file
func (w *Workspace) UnlockFile(path, userID string) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if file, ok := w.Files[path]; ok {
		if file.LockedBy == userID {
			file.LockedBy = ""
		}
	}
}

// UpdateCursor updates a user's cursor position
func (w *Workspace) UpdateCursor(userID, file string, line, column int, selection *Range) {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.ActiveUsers[userID] = &CursorPosition{
		UserID:    userID,
		File:      file,
		Line:      line,
		Column:    column,
		Selection: selection,
	}
}

// RemoveCursor removes a user's cursor position
func (w *Workspace) RemoveCursor(userID string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	delete(w.ActiveUsers, userID)
}

// GetActiveCursors returns copies of all active cursor positions
func (w *Workspace) GetActiveCursors() []*CursorPosition {
	w.mu.RLock()
	defer w.mu.RUnlock()

	result := make([]*CursorPosition, 0, len(w.ActiveUsers))
	for _, cursor := range w.ActiveUsers {
		cp := *cursor
		if cursor.Selection != nil {
			sel := *cursor.Selection
			cp.Selection = &sel
		}
		result = append(result, &cp)
	}
	return result
}

// CreateReview creates a new code review
func (w *Workspace) CreateReview(file, author string) *Review {
	if file == "" || author == "" {
		return nil
	}

	w.mu.Lock()
	defer w.mu.Unlock()

	review := &Review{
		ID:        generateReviewID(),
		File:      file,
		Author:    author,
		Status:    ReviewPending,
		Comments:  make([]ReviewComment, 0),
		CreatedAt: time.Now(),
	}
	w.Reviews[review.ID] = review
	w.UpdatedAt = time.Now()
	return review
}

// AddReviewComment adds a comment to a review
func (w *Workspace) AddReviewComment(reviewID, author string, line int, content string) error {
	if reviewID == "" {
		return fmt.Errorf("reviewID is required")
	}
	if author == "" {
		return fmt.Errorf("author is required")
	}
	if content == "" {
		return fmt.Errorf("content is required")
	}

	w.mu.Lock()
	defer w.mu.Unlock()

	review, ok := w.Reviews[reviewID]
	if !ok {
		return fmt.Errorf("review not found")
	}

	comment := ReviewComment{
		ID:        generateCommentID(),
		Author:    author,
		Line:      line,
		Content:   content,
		CreatedAt: time.Now(),
	}
	review.Comments = append(review.Comments, comment)
	w.UpdatedAt = time.Now()
	return nil
}

// CompleteReview completes a review
func (w *Workspace) CompleteReview(reviewID string, status ReviewStatus) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if review, ok := w.Reviews[reviewID]; ok {
		review.Status = status
		now := time.Now()
		review.CompletedAt = &now
		w.UpdatedAt = now
	}
}

// GetFileState returns a copy of the file state
func (w *Workspace) GetFileState(path string) (*FileState, bool) {
	w.mu.RLock()
	defer w.mu.RUnlock()
	state, ok := w.Files[path]
	if !ok {
		return nil, false
	}
	cp := *state
	return &cp, true
}

// Manager manages all teams
type Manager struct {
	mu         sync.RWMutex
	teams      map[string]*Team
	storageDir string
	// Indexes for quick lookup
	byUser  map[string][]string // userID -> team IDs
	byAgent map[string][]string // agentID -> team IDs
	// Event broadcasting
	broadcaster EventBroadcaster
	// Permission management for human-in-the-loop
	permManager *PermissionManager
}

// NewManager creates a new team manager with persistence
func NewManager() *Manager {
	// Get config directory for persistence
	configDir := getConfigDir()
	storageDir := filepath.Join(configDir, "teams")
	return NewManagerWithDir(storageDir)
}

// NewManagerWithDir creates a new team manager with a custom storage directory
// If storageDir is empty, the manager operates in memory-only mode (no persistence)
func NewManagerWithDir(storageDir string) *Manager {
	// Ensure directory exists if specified
	if storageDir != "" {
		if err := os.MkdirAll(storageDir, 0755); err != nil {
			// Log warning but continue with in-memory only mode
			log.Printf("[Team] Warning: Failed to create teams storage directory: %v", err)
			storageDir = "" // Disable persistence on error
		}
	}

	m := &Manager{
		teams:       make(map[string]*Team),
		storageDir:  storageDir,
		byUser:      make(map[string][]string),
		byAgent:     make(map[string][]string),
		permManager: NewPermissionManager(60 * time.Second),
	}

	// Setup permission request broadcasting to hub
	m.permManager.OnRequest(func(req *PermissionRequest) {
		// Capture broadcaster under RLock to avoid race with SetBroadcaster
		m.mu.RLock()
		broadcaster := m.broadcaster
		m.mu.RUnlock()
		if broadcaster != nil {
			broadcaster.Broadcast("permission_request", map[string]any{
				"id":          req.ID,
				"permission":  req.Permission,
				"requesterId": req.RequesterID,
				"agentId":     req.AgentID,
				"reason":      req.Reason,
				"context":     req.Context,
				"createdAt":   req.CreatedAt,
				"expiresAt":   req.ExpiresAt,
			})
		}
	})

	// Load existing teams from disk
	m.loadFromDisk()

	return m
}

// PermissionManager returns the permission manager for human-in-the-loop
func (m *Manager) PermissionManager() *PermissionManager {
	return m.permManager
}

// Close stops the permission manager cleanup goroutine and releases resources
// HIGH: Without this, the permManager's cleanupExpired goroutine runs indefinitely
func (m *Manager) Close() {
	m.permManager.Stop()
}

// getConfigDir returns the configuration directory
func getConfigDir() string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return ".swarm-editor"
	}
	return filepath.Join(homeDir, ".swarm-editor")
}

// loadFromDisk loads all teams from disk
func (m *Manager) loadFromDisk() {
	if m.storageDir == "" {
		return
	}

	files, err := os.ReadDir(m.storageDir)
	if err != nil {
		return // No teams yet
	}

	for _, file := range files {
		if filepath.Ext(file.Name()) != ".json" {
			continue
		}

		path := filepath.Join(m.storageDir, file.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}

		var team Team
		if err := json.Unmarshal(data, &team); err != nil {
			continue
		}

		// Validate team ID to prevent path traversal from crafted filenames
		// Team IDs must be alphanumeric with underscores/hyphens, matching generateTeamID format
		if team.ID == "" || !isValidTeamID(team.ID) {
			log.Printf("[Team] Skipping team with invalid ID from file %s", file.Name())
			continue
		}

		// Initialize maps if they're nil
		if team.Members == nil {
			team.Members = make(map[string]*Member)
		}
		if team.Agents == nil {
			team.Agents = make(map[acp.AgentID]*agent.Agent)
		}
		if team.Workspaces == nil {
			team.Workspaces = make(map[string]*Workspace)
		}

		m.teams[team.ID] = &team

		// Rebuild indexes
		for memberID := range team.Members {
			m.byUser[memberID] = append(m.byUser[memberID], team.ID)
		}
		for agentID := range team.Agents {
			m.byAgent[string(agentID)] = append(m.byAgent[string(agentID)], team.ID)
		}
	}
}

// saveToDisk saves a team to disk
func (m *Manager) saveToDisk(team *Team) error {
	if m.storageDir == "" {
		return nil // In-memory only mode
	}

	data, err := json.MarshalIndent(team, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal team: %w", err)
	}

	path := filepath.Join(m.storageDir, team.ID+".json")
	// Write to temp file first, then rename for atomicity (prevents corruption on crash)
	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0600); err != nil {
		return fmt.Errorf("failed to write team file: %w", err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		// Clean up temp file on rename failure
		os.Remove(tmpPath)
		return fmt.Errorf("failed to rename team file: %w", err)
	}

	return nil
}

// deleteFromDisk removes a team from disk
func (m *Manager) deleteFromDisk(teamID string) error {
	if m.storageDir == "" {
		return nil
	}

	// Validate teamID to prevent path traversal (defense-in-depth)
	if strings.Contains(teamID, "..") || strings.ContainsAny(teamID, "/\\") {
		return nil
	}

	path := filepath.Join(m.storageDir, teamID+".json")
	return os.Remove(path)
}

// CreateTeam creates a new team
func (m *Manager) CreateTeam(name, owner string) (*Team, error) {
	return m.CreateTeamWithDesc(name, "", owner)
}

// CreateTeamWithDesc creates a new team with description
func (m *Manager) CreateTeamWithDesc(name, description, owner string) (*Team, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	id := generateTeamID()
	team := NewTeam(id, name, owner)
	team.Description = description
	m.teams[id] = team

	// Persist to disk
	if err := m.saveToDisk(team); err != nil {
		log.Printf("[Team] Warning: Failed to persist team %s: %v", id, err)
	}

	return team, nil
}

// GetTeam retrieves a team by ID. Returns the internal pointer for efficiency
// since teams have their own mutex for internal state management.
// For safe concurrent access, use team methods instead of direct field access.
func (m *Manager) GetTeam(id string) (*Team, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	team, ok := m.teams[id]
	return team, ok
}

// DeleteTeam deletes a team
func (m *Manager) DeleteTeam(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	team, ok := m.teams[id]
	if !ok {
		return
	}

	// Snapshot team data under team.mu to avoid data race
	team.mu.RLock()
	memberIDs := make([]string, 0, len(team.Members))
	for memberID := range team.Members {
		memberIDs = append(memberIDs, memberID)
	}
	agentIDs := make([]string, 0, len(team.Agents)+len(team.AgentIDs))
	for agentID := range team.Agents {
		agentIDs = append(agentIDs, string(agentID))
	}
	agentIDs = append(agentIDs, team.AgentIDs...)
	team.mu.RUnlock()

	// Clean up byUser index using snapshot
	for _, memberID := range memberIDs {
		if ids, ok := m.byUser[memberID]; ok {
			newIDs := removeStringFromSlice(ids, id)
			if len(newIDs) == 0 {
				delete(m.byUser, memberID)
			} else {
				m.byUser[memberID] = newIDs
			}
		}
	}

	// Clean up byAgent index using snapshot
	for _, agentID := range agentIDs {
		if ids, ok := m.byAgent[agentID]; ok {
			newIDs := removeStringFromSlice(ids, id)
			if len(newIDs) == 0 {
				delete(m.byAgent, agentID)
			} else {
				m.byAgent[agentID] = newIDs
			}
		}
	}

	// Remove from memory
	delete(m.teams, id)

	// Remove from disk
	if err := m.deleteFromDisk(id); err != nil {
		log.Printf("[Team] Warning: failed to delete team %s from disk: %v", id, err)
	}
}

// ListTeams lists all teams
func (m *Manager) ListTeams() []*Team {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*Team, 0, len(m.teams))
	for _, team := range m.teams {
		result = append(result, team)
	}
	return result
}

// GetUserTeams returns all teams a user belongs to
func (m *Manager) GetUserTeams(userID string) []*Team {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*Team, 0)
	for _, team := range m.teams {
		if _, ok := team.GetMember(userID); ok {
			result = append(result, team)
		}
	}
	return result
}

// AssignAgentToTeam assigns an agent to a team
func (m *Manager) AssignAgentToTeam(teamID string, a *agent.Agent) error {
	if a == nil {
		return fmt.Errorf("agent cannot be nil")
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	team, ok := m.teams[teamID]
	if !ok {
		return fmt.Errorf("team not found")
	}

	// Use team's internal lock for AddAgent operation
	// Note: team.AddAgent has its own lock, but we hold Manager lock to prevent TOCTOU
	return team.AddAgent(a)
}

// BroadcastToTeam sends a message to all members of a team
func (m *Manager) BroadcastToTeam(teamID string, message json.RawMessage) error {
	m.mu.RLock()
	team, ok := m.teams[teamID]
	m.mu.RUnlock()

	if !ok {
		return fmt.Errorf("team not found")
	}

	// Broadcast via WebSocket hub if available
	// Capture broadcaster under RLock to avoid race with SetBroadcaster
	m.mu.RLock()
	broadcaster := m.broadcaster
	m.mu.RUnlock()
	if broadcaster != nil {
		broadcaster.Broadcast("team_message", map[string]any{
			"teamId":   teamID,
			"teamName": team.Name,
			"message":  message,
		})
	}

	return nil
}

// SetBroadcaster sets the event broadcaster for team notifications
func (m *Manager) SetBroadcaster(broadcaster EventBroadcaster) {
	m.mu.Lock()
	m.broadcaster = broadcaster
	m.mu.Unlock()
}

// GetAllStats returns statistics for all teams
func (m *Manager) GetAllStats() []*TeamStats {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*TeamStats, 0, len(m.teams))
	for _, team := range m.teams {
		result = append(result, team.GetStats())
	}
	return result
}

// HasPermission checks if a user has a specific permission in a team
func (m *Manager) HasPermission(teamID, userID string, permission Permission) bool {
	m.mu.RLock()
	team, ok := m.teams[teamID]
	if !ok {
		m.mu.RUnlock()
		return false
	}
	m.mu.RUnlock()

	// Use team's GetMember which properly locks team.mu
	member, ok := team.GetMember(userID)
	if !ok {
		return false
	}

	return HasPermission(member.Role, permission)
}

// AddMemberWithPermission adds a member with permission check
func (m *Manager) AddMemberWithPermission(teamID, userID string, role MemberRole, addedBy string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	team, ok := m.teams[teamID]
	if !ok {
		return fmt.Errorf("team not found")
	}

	// Verify adder has permission
	if !m.hasPermissionInternalLocked(team, addedBy, PermInviteMember) {
		return ErrPermissionDenied
	}

	// Check if already a member (use GetMember to properly acquire team.mu)
	if _, exists := team.GetMember(userID); exists {
		return fmt.Errorf("user is already a member")
	}

	// Add member using team method to properly acquire team.mu (CRITICAL: data race fix)
	member := &Member{
		ID:   userID,
		Role: role,
	}
	if err := team.AddMember(member); err != nil {
		return err
	}

	// Update index
	m.byUser[userID] = append(m.byUser[userID], teamID)

	// Persist
	if err := m.saveToDisk(team); err != nil {
		log.Printf("[Team] Warning: failed to persist team %s: %v", teamID, err)
	}

	return nil
}

// RemoveMemberWithPermission removes a member with permission check
func (m *Manager) RemoveMemberWithPermission(teamID, userID, removedBy string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	team, ok := m.teams[teamID]
	if !ok {
		return fmt.Errorf("team not found")
	}

	// Can't remove the owner
	if userID == team.Owner {
		return fmt.Errorf("cannot remove team owner")
	}

	// Verify remover has permission
	if !m.hasPermissionInternalLocked(team, removedBy, PermRemoveMember) {
		return ErrPermissionDenied
	}

	// Remove from team (use RemoveMember to properly acquire team.mu - CRITICAL: data race fix)
	if err := team.RemoveMember(userID); err != nil {
		return err
	}

	// Update index (use helper to avoid memory leak from append)
	if ids, ok := m.byUser[userID]; ok {
		newIDs := removeStringFromSlice(ids, teamID)
		if len(newIDs) == 0 {
			delete(m.byUser, userID)
		} else {
			m.byUser[userID] = newIDs
		}
	}

	// Persist
	if err := m.saveToDisk(team); err != nil {
		log.Printf("[Team] Warning: failed to persist team %s: %v", teamID, err)
	}

	return nil
}

// AddAgentWithPermission adds an agent with permission check
func (m *Manager) AddAgentWithPermission(teamID, agentID, addedBy string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	team, ok := m.teams[teamID]
	if !ok {
		return fmt.Errorf("team not found")
	}

	// Verify adder has permission
	if !m.hasPermissionInternalLocked(team, addedBy, PermAssignAgent) {
		return ErrPermissionDenied
	}

	// Check if already added and append atomically under team's lock
	// to prevent race with Team methods that may access AgentIDs
	team.mu.Lock()
	alreadyAdded := slices.Contains(team.AgentIDs, agentID)
	if !alreadyAdded {
		team.AgentIDs = append(team.AgentIDs, agentID)
	}
	team.mu.Unlock()
	if alreadyAdded {
		return nil // Already added
	}

	// Update index
	m.byAgent[agentID] = append(m.byAgent[agentID], teamID)

	// Persist
	if err := m.saveToDisk(team); err != nil {
		log.Printf("[Team] Warning: failed to persist team %s: %v", teamID, err)
	}

	return nil
}

// RemoveAgentWithPermission removes an agent with permission check
func (m *Manager) RemoveAgentWithPermission(teamID, agentID, removedBy string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	team, ok := m.teams[teamID]
	if !ok {
		return fmt.Errorf("team not found")
	}

	// Verify remover has permission
	if !m.hasPermissionInternalLocked(team, removedBy, PermAssignAgent) {
		return ErrPermissionDenied
	}

	// Remove agent under team's lock to prevent race with Team methods
	team.mu.Lock()
	team.AgentIDs = removeStringFromSlice(team.AgentIDs, agentID)
	team.mu.Unlock()

	// Update index
	if ids, ok := m.byAgent[agentID]; ok {
		newIDs := removeStringFromSlice(ids, teamID)
		if len(newIDs) == 0 {
			delete(m.byAgent, agentID)
		} else {
			m.byAgent[agentID] = newIDs
		}
	}

	// Persist
	if err := m.saveToDisk(team); err != nil {
		log.Printf("[Team] Warning: failed to persist team %s: %v", teamID, err)
	}

	return nil
}

// hasPermissionInternalLocked checks permission with proper team locking.
// Must be called while holding m.mu. Acquires team.mu.RLock() to safely access team.Members.
func (m *Manager) hasPermissionInternalLocked(team *Team, userID string, permission Permission) bool {
	team.mu.RLock()
	member, ok := team.Members[userID]
	team.mu.RUnlock()
	if !ok {
		return false
	}
	return HasPermission(member.Role, permission)
}

// HTTP Handlers

// HandleListTeams handles GET /teams
func (m *Manager) HandleListTeams(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	teams := m.ListTeams()
	if err := json.NewEncoder(w).Encode(teams); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
	}
}

// HandleGetTeam handles GET /teams/{id}
func (m *Manager) HandleGetTeam(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "team id required", http.StatusBadRequest)
		return
	}

	team, ok := m.GetTeam(id)
	if !ok {
		http.Error(w, "team not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(team); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
	}
}

// HandleCreateTeam handles POST /teams
func (m *Manager) HandleCreateTeam(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodySize)

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Owner       string `json:"ownerId"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Name == "" || req.Owner == "" {
		http.Error(w, "name and ownerId required", http.StatusBadRequest)
		return
	}

	team, err := m.CreateTeamWithDesc(req.Name, req.Description, req.Owner)
	if err != nil {
		http.Error(w, "failed to create team", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(team); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
	}
}

// HandleAddMember handles POST /teams/{id}/members
func (m *Manager) HandleAddMember(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("id")
	if teamID == "" {
		http.Error(w, "team id required", http.StatusBadRequest)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodySize)

	var req struct {
		UserID  string     `json:"userId"`
		Role    MemberRole `json:"role"`
		AddedBy string     `json:"addedBy"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := m.AddMemberWithPermission(teamID, req.UserID, req.Role, req.AddedBy); err != nil {
		if errors.Is(err, ErrPermissionDenied) {
			http.Error(w, err.Error(), http.StatusForbidden)
		} else {
			http.Error(w, "bad request", http.StatusBadRequest)
		}
		return
	}

	w.WriteHeader(http.StatusOK)
}

// HandleRemoveMember handles DELETE /teams/{id}/members/{userId}
func (m *Manager) HandleRemoveMember(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("id")
	userID := r.PathValue("userId")
	removedBy := r.URL.Query().Get("removedBy")

	if teamID == "" || userID == "" || removedBy == "" {
		http.Error(w, "team id, user id, and removedBy required", http.StatusBadRequest)
		return
	}

	if err := m.RemoveMemberWithPermission(teamID, userID, removedBy); err != nil {
		if errors.Is(err, ErrPermissionDenied) {
			http.Error(w, err.Error(), http.StatusForbidden)
		} else {
			http.Error(w, "bad request", http.StatusBadRequest)
		}
		return
	}

	w.WriteHeader(http.StatusOK)
}

// HandleAddAgent handles POST /teams/{id}/agents
func (m *Manager) HandleAddAgent(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("id")
	if teamID == "" {
		http.Error(w, "team id required", http.StatusBadRequest)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodySize)

	var req struct {
		AgentID string `json:"agentId"`
		AddedBy string `json:"addedBy"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := m.AddAgentWithPermission(teamID, req.AgentID, req.AddedBy); err != nil {
		if errors.Is(err, ErrPermissionDenied) {
			http.Error(w, err.Error(), http.StatusForbidden)
		} else {
			http.Error(w, "bad request", http.StatusBadRequest)
		}
		return
	}

	w.WriteHeader(http.StatusOK)
}

// HandleRemoveAgent handles DELETE /teams/{id}/agents/{agentId}
func (m *Manager) HandleRemoveAgent(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("id")
	agentID := r.PathValue("agentId")
	removedBy := r.URL.Query().Get("removedBy")

	if teamID == "" || agentID == "" || removedBy == "" {
		http.Error(w, "team id, agent id, and removedBy required", http.StatusBadRequest)
		return
	}

	if err := m.RemoveAgentWithPermission(teamID, agentID, removedBy); err != nil {
		if errors.Is(err, ErrPermissionDenied) {
			http.Error(w, err.Error(), http.StatusForbidden)
		} else {
			http.Error(w, "bad request", http.StatusBadRequest)
		}
		return
	}

	w.WriteHeader(http.StatusOK)
}

// HandleGetTeamStats handles GET /teams/{id}/stats
func (m *Manager) HandleGetTeamStats(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("id")
	if teamID == "" {
		http.Error(w, "team id required", http.StatusBadRequest)
		return
	}

	team, ok := m.GetTeam(teamID)
	if !ok {
		http.Error(w, "team not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(team.GetStats()); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
	}
}

// HandleDeleteTeam handles DELETE /teams/{id}
func (m *Manager) HandleDeleteTeam(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("id")
	deletedBy := r.URL.Query().Get("deletedBy")

	if teamID == "" || deletedBy == "" {
		http.Error(w, "team id and deletedBy required", http.StatusBadRequest)
		return
	}

	team, ok := m.GetTeam(teamID)
	if !ok {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Only owner can delete
	if team.Owner != deletedBy {
		http.Error(w, "only owner can delete team", http.StatusForbidden)
		return
	}

	m.DeleteTeam(teamID)
	w.WriteHeader(http.StatusOK)
}

// generateRandomID creates a cryptographically secure random ID suffix
func generateRandomID() string {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		// Fallback to uuid if crypto/rand fails (should not happen)
		return uuid.New().String()[:8]
	}
	return hex.EncodeToString(b)
}

func generateTeamID() string {
	return fmt.Sprintf("team_%s_%s", uuid.New().String()[:8], generateRandomID())
}

func generateWorkspaceID() string {
	return fmt.Sprintf("ws_%s_%s", uuid.New().String()[:8], generateRandomID())
}

func generateReviewID() string {
	return fmt.Sprintf("review_%s_%s", uuid.New().String()[:8], generateRandomID())
}

func generateCommentID() string {
	return fmt.Sprintf("comment_%s_%s", uuid.New().String()[:8], generateRandomID())
}

// removeStringFromSlice removes a string from a slice without memory leak
// by creating a new slice with reduced capacity
func removeStringFromSlice(slice []string, item string) []string {
	for i, v := range slice {
		if v == item {
			// Create new slice with exact capacity to avoid memory leak
			newSlice := make([]string, 0, len(slice)-1)
			newSlice = append(newSlice, slice[:i]...)
			newSlice = append(newSlice, slice[i+1:]...)
			return newSlice
		}
	}
	return slice
}

// validTeamIDPattern matches the format produced by generateTeamID: team_{timestamp}_{hex}
var validTeamIDPattern = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_-]*$`)

// isValidTeamID validates that a team ID contains only safe characters.
// This prevents path traversal attacks from crafted filenames on disk.
func isValidTeamID(id string) bool {
	if len(id) == 0 || len(id) > 128 {
		return false
	}
	return validTeamIDPattern.MatchString(id)
}
