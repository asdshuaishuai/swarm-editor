// Package team implements multi-team collaboration functionality
package team

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
)

// Team represents a team of agents
type Team struct {
	mu sync.RWMutex

	ID          string
	Name        string
	Description string
	Owner       string

	Members map[string]*Member
	Agents  map[acp.AgentID]*agent.Agent

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

// GetMember retrieves a member by ID
func (t *Team) GetMember(memberID string) (*Member, bool) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	member, ok := t.Members[memberID]
	return member, ok
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

// GetAgent retrieves an agent by ID
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

// GetWorkspace retrieves a workspace by ID
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

// GetActiveCursors returns all active cursor positions
func (w *Workspace) GetActiveCursors() []*CursorPosition {
	w.mu.RLock()
	defer w.mu.RUnlock()

	result := make([]*CursorPosition, 0, len(w.ActiveUsers))
	for _, cursor := range w.ActiveUsers {
		result = append(result, cursor)
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

// GetFileState returns the state of a file
func (w *Workspace) GetFileState(path string) (*FileState, bool) {
	w.mu.RLock()
	defer w.mu.RUnlock()
	state, ok := w.Files[path]
	return state, ok
}

// Manager manages all teams
type Manager struct {
	mu    sync.RWMutex
	teams map[string]*Team
}

// NewManager creates a new team manager
func NewManager() *Manager {
	return &Manager{
		teams: make(map[string]*Team),
	}
}

// CreateTeam creates a new team
func (m *Manager) CreateTeam(name, owner string) (*Team, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	id := generateTeamID()
	team := NewTeam(id, name, owner)
	m.teams[id] = team
	return team, nil
}

// GetTeam retrieves a team by ID
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
	delete(m.teams, id)
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
	m.mu.RLock()
	team, ok := m.teams[teamID]
	m.mu.RUnlock()

	if !ok {
		return fmt.Errorf("team not found")
	}

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

	// In a real implementation, this would send notifications to members
	_ = team
	return nil
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

func generateTeamID() string {
	return "team_" + time.Now().Format("20060102_150405.999999999")
}

func generateWorkspaceID() string {
	return "ws_" + time.Now().Format("150405.999999999")
}

func generateReviewID() string {
	return "review_" + time.Now().Format("150405.999999999")
}

func generateCommentID() string {
	return "comment_" + time.Now().Format("150405.999999999")
}
