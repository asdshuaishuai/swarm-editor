// Package pair implements pair programming functionality
package pair

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
)

// Error definitions for pair sessions
var (
	ErrSessionNotActive = errors.New("session is not active")
	ErrSessionEnded     = errors.New("session has ended")
	ErrNotDriver        = errors.New("only driver can propose edits")
	ErrNotNavigator     = errors.New("only navigator can make suggestions")
)

// Role defines the pair programming role
type Role string

const (
	RoleDriver    Role = "driver"    // Writing code
	RoleNavigator Role = "navigator" // Reviewing, suggesting
)

// Maximum sizes for history slices to prevent unbounded growth
const (
	maxTurnHistory = 100 // Maximum turns to retain
	maxEdits       = 500 // Maximum edits to retain
	maxMessages    = 200 // Maximum messages to retain
	maxSuggestions = 200 // Maximum suggestions to retain
)

// PairSessionState represents the state of a pair session
type PairSessionState string

const (
	PairStateCreated   PairSessionState = "created"   // Newly created, not started
	PairStateActive    PairSessionState = "active"    // Running
	PairStatePaused    PairSessionState = "paused"    // Paused
	PairStateSwitching PairSessionState = "switching" // Switching roles
	PairStateEnded     PairSessionState = "ended"     // Ended
)

// PairSession represents a pair programming session
type PairSession struct {
	mu sync.RWMutex

	ID        string
	SessionID acp.SessionID
	State     PairSessionState

	Driver    *agent.Agent
	Navigator *agent.Agent

	CurrentRole map[acp.AgentID]Role

	// Code context
	CurrentFile string
	CursorPos   Position
	Selection   Range

	// History
	TurnHistory []Turn
	Edits       []CodeEdit

	// Communication
	Messages    []PairMessage
	Suggestions []Suggestion

	CreatedAt   time.Time
	SwitchCount int
	MaxTurns    int
	CurrentTurn int

	ctx    context.Context
	cancel context.CancelFunc

	onEdit       func(edit *CodeEdit)
	onSuggestion func(suggestion *Suggestion)
	onSwitch     func(from, to Role, agentID acp.AgentID)
}

// Position represents a cursor position
type Position struct {
	Line   int `json:"line"`
	Column int `json:"column"`
}

// Range represents a text selection
type Range struct {
	Start Position `json:"start"`
	End   Position `json:"end"`
}

// Turn represents a pair programming turn
type Turn struct {
	AgentID     acp.AgentID  `json:"agentId"`
	Role        Role         `json:"role"`
	StartedAt   time.Time    `json:"startedAt"`
	EndedAt     time.Time    `json:"endedAt,omitempty"`
	Edits       []CodeEdit   `json:"edits,omitempty"`
	Suggestions []Suggestion `json:"suggestions,omitempty"`
}

// CodeEdit represents a code change
type CodeEdit struct {
	ID         string       `json:"id"`
	AgentID    acp.AgentID  `json:"agentId"`
	File       string       `json:"file"`
	StartPos   Position     `json:"startPos"`
	EndPos     Position     `json:"endPos"`
	OldText    string       `json:"oldText"`
	NewText    string       `json:"newText"`
	Timestamp  time.Time    `json:"timestamp"`
	Approved   bool         `json:"approved"`
	RejectedBy *acp.AgentID `json:"rejectedBy,omitempty"`
}

// Suggestion represents a code suggestion from Navigator
type Suggestion struct {
	ID         string           `json:"id"`
	FromAgent  acp.AgentID      `json:"fromAgent"`
	Type       SuggestionType   `json:"type"`
	Content    string           `json:"content"`
	File       string           `json:"file,omitempty"`
	Line       int              `json:"line,omitempty"`
	Timestamp  time.Time        `json:"timestamp"`
	Status     SuggestionStatus `json:"status"`
	AcceptedBy *acp.AgentID     `json:"acceptedBy,omitempty"`
	RejectedBy *acp.AgentID     `json:"rejectedBy,omitempty"`
}

// SuggestionType defines the type of suggestion
type SuggestionType string

const (
	SuggestionCode     SuggestionType = "code"
	SuggestionComment  SuggestionType = "comment"
	SuggestionRefactor SuggestionType = "refactor"
	SuggestionTest     SuggestionType = "test"
	SuggestionQuestion SuggestionType = "question"
)

// SuggestionStatus represents the status of a suggestion
type SuggestionStatus string

const (
	SuggestionPending  SuggestionStatus = "pending"
	SuggestionAccepted SuggestionStatus = "accepted"
	SuggestionRejected SuggestionStatus = "rejected"
)

// PairMessage represents a message between pair partners
type PairMessage struct {
	ID        string      `json:"id"`
	From      acp.AgentID `json:"from"`
	To        acp.AgentID `json:"to"`
	Content   string      `json:"content"`
	Timestamp time.Time   `json:"timestamp"`
}

// NewPairSession creates a new pair programming session
func NewPairSession(driver, navigator *agent.Agent) *PairSession {
	// Handle nil agents gracefully
	if driver == nil || navigator == nil {
		return nil
	}

	return &PairSession{
		ID:        generatePairID(),
		State:     PairStateCreated,
		Driver:    driver,
		Navigator: navigator,
		CurrentRole: map[acp.AgentID]Role{
			driver.ID:    RoleDriver,
			navigator.ID: RoleNavigator,
		},
		TurnHistory: make([]Turn, 0),
		Edits:       make([]CodeEdit, 0),
		Messages:    make([]PairMessage, 0),
		Suggestions: make([]Suggestion, 0),
		CreatedAt:   time.Now(),
		MaxTurns:    10,
	}
}

// Start starts the pair session
func (p *PairSession) Start(ctx context.Context) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.State == PairStateActive {
		return errors.New("session is already active")
	}

	if p.State != PairStateCreated {
		return errors.New("session cannot be started from current state")
	}

	if p.Driver == nil {
		return errors.New("cannot start session: driver not set")
	}

	p.ctx, p.cancel = context.WithCancel(ctx)
	p.State = PairStateActive

	// Set initial turn
	p.startTurnLocked(p.Driver.ID)

	return nil
}

// Pause pauses the pair session
func (p *PairSession) Pause() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.State = PairStatePaused
}

// Resume resumes the pair session
func (p *PairSession) Resume() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.State = PairStateActive
}

// End ends the pair session
func (p *PairSession) End() {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.cancel != nil {
		p.cancel()
	}
	p.State = PairStateEnded
}

// SwitchRoles switches the driver/navigator roles
func (p *PairSession) SwitchRoles() error {
	p.mu.Lock()

	if p.State != PairStateActive {
		p.mu.Unlock()
		return ErrSessionNotActive
	}

	if p.Driver == nil || p.Navigator == nil {
		p.mu.Unlock()
		return errors.New("cannot switch roles: driver or navigator not set")
	}

	p.State = PairStateSwitching

	// Swap roles
	p.CurrentRole[p.Driver.ID] = RoleNavigator
	p.CurrentRole[p.Navigator.ID] = RoleDriver

	p.Driver, p.Navigator = p.Navigator, p.Driver

	p.SwitchCount++
	p.State = PairStateActive

	// Snapshot callback under lock, invoke outside lock to prevent deadlock
	// After swap, p.Driver is the agent who WAS Navigator (now becoming Driver)
	onSwitch := p.onSwitch
	newDriverID := p.Driver.ID
	p.mu.Unlock()

	if onSwitch != nil {
		onSwitch(RoleNavigator, RoleDriver, newDriverID)
	}

	return nil
}

// ProposeEdit proposes a code edit (Driver)
func (p *PairSession) ProposeEdit(edit *CodeEdit) error {
	if edit == nil {
		return errors.New("edit cannot be nil")
	}

	p.mu.Lock()

	if p.State != PairStateActive {
		state := p.State // capture before unlock to avoid data race
		p.mu.Unlock()
		return fmt.Errorf("cannot propose edit: session is %s", state)
	}

	// Guard against nil Driver (defensive programming)
	if p.Driver == nil {
		p.mu.Unlock()
		return errors.New("cannot propose edit: driver not set")
	}

	edit.ID = generateEditID()
	edit.Timestamp = time.Now()
	edit.AgentID = p.Driver.ID
	edit.Approved = false

	p.Edits = append(p.Edits, *edit)

	// Trim old edits if exceeding limit
	if len(p.Edits) > maxEdits {
		p.Edits = p.Edits[len(p.Edits)-maxEdits:]
	}

	// Snapshot callback under lock, invoke outside lock to prevent deadlock
	onEdit := p.onEdit
	p.mu.Unlock()

	if onEdit != nil {
		onEdit(edit)
	}

	return nil
}

// ApproveEdit approves a proposed edit (Navigator)
func (p *PairSession) ApproveEdit(editID string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	for i := range p.Edits {
		if p.Edits[i].ID == editID {
			p.Edits[i].Approved = true
			return nil
		}
	}

	return nil
}

// RejectEdit rejects a proposed edit (Navigator)
func (p *PairSession) RejectEdit(editID string, reason string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	// Guard against nil Navigator (defensive programming)
	if p.Navigator == nil {
		return errors.New("cannot reject edit: navigator not set")
	}

	for i := range p.Edits {
		if p.Edits[i].ID == editID {
			p.Edits[i].Approved = false
			p.Edits[i].RejectedBy = &p.Navigator.ID
			return nil
		}
	}

	return nil
}

// MakeSuggestion makes a suggestion (Navigator)
func (p *PairSession) MakeSuggestion(suggestion *Suggestion) error {
	if suggestion == nil {
		return errors.New("suggestion cannot be nil")
	}

	p.mu.Lock()

	if p.State != PairStateActive {
		state := p.State // capture before unlock to avoid data race
		p.mu.Unlock()
		return fmt.Errorf("cannot make suggestion: session is %s", state)
	}

	// Guard against nil Navigator (defensive programming)
	if p.Navigator == nil {
		p.mu.Unlock()
		return errors.New("cannot make suggestion: navigator not set")
	}

	suggestion.ID = generateSuggestionID()
	suggestion.FromAgent = p.Navigator.ID
	suggestion.Timestamp = time.Now()
	suggestion.Status = SuggestionPending

	p.Suggestions = append(p.Suggestions, *suggestion)

	// Trim old suggestions if exceeding limit
	if len(p.Suggestions) > maxSuggestions {
		p.Suggestions = p.Suggestions[len(p.Suggestions)-maxSuggestions:]
	}

	// Snapshot callback under lock, invoke outside lock to prevent deadlock
	onSuggestion := p.onSuggestion
	p.mu.Unlock()

	if onSuggestion != nil {
		onSuggestion(suggestion)
	}

	return nil
}

// AcceptSuggestion accepts a suggestion (Driver)
func (p *PairSession) AcceptSuggestion(suggestionID string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	// Guard against nil Driver (defensive programming)
	if p.Driver == nil {
		return errors.New("cannot accept suggestion: driver not set")
	}

	for i := range p.Suggestions {
		if p.Suggestions[i].ID == suggestionID {
			p.Suggestions[i].Status = SuggestionAccepted
			p.Suggestions[i].AcceptedBy = &p.Driver.ID
			return nil
		}
	}

	return nil
}

// RejectSuggestion rejects a suggestion (Driver)
func (p *PairSession) RejectSuggestion(suggestionID string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	// Guard against nil Driver (defensive programming)
	if p.Driver == nil {
		return errors.New("cannot reject suggestion: driver not set")
	}

	for i := range p.Suggestions {
		if p.Suggestions[i].ID == suggestionID {
			p.Suggestions[i].Status = SuggestionRejected
			p.Suggestions[i].RejectedBy = &p.Driver.ID
			return nil
		}
	}

	return nil
}

// SendMessage sends a message between partners
func (p *PairSession) SendMessage(from acp.AgentID, content string) error {
	p.mu.Lock()

	if p.State != PairStateActive {
		state := p.State // capture before unlock to avoid data race
		p.mu.Unlock()
		return fmt.Errorf("cannot send message: session is %s", state)
	}

	if p.Driver == nil || p.Navigator == nil {
		p.mu.Unlock()
		return errors.New("cannot send message: driver or navigator not set")
	}

	var to acp.AgentID
	if from == p.Driver.ID {
		to = p.Navigator.ID
	} else {
		to = p.Driver.ID
	}

	msg := PairMessage{
		ID:        generateMessageID(),
		From:      from,
		To:        to,
		Content:   content,
		Timestamp: time.Now(),
	}

	p.Messages = append(p.Messages, msg)

	// Trim old messages if exceeding limit
	if len(p.Messages) > maxMessages {
		p.Messages = p.Messages[len(p.Messages)-maxMessages:]
	}

	p.mu.Unlock()
	return nil
}

// SetFile sets the current file being edited
func (p *PairSession) SetFile(file string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.CurrentFile = file
}

// SetCursor sets the cursor position
func (p *PairSession) SetCursor(pos Position) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.CursorPos = pos
}

// SetSelection sets the text selection
func (p *PairSession) SetSelection(r Range) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.Selection = r
}

// GetState returns the current session state
func (p *PairSession) GetState() PairSessionState {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.State
}

// GetRoles returns the current role assignments
func (p *PairSession) GetRoles() map[acp.AgentID]Role {
	p.mu.RLock()
	defer p.mu.RUnlock()
	result := make(map[acp.AgentID]Role)
	for k, v := range p.CurrentRole {
		result[k] = v
	}
	return result
}

// GetEdits returns all edits
func (p *PairSession) GetEdits() []CodeEdit {
	p.mu.RLock()
	defer p.mu.RUnlock()
	result := make([]CodeEdit, len(p.Edits))
	copy(result, p.Edits)
	return result
}

// GetSuggestions returns all suggestions
func (p *PairSession) GetSuggestions() []Suggestion {
	p.mu.RLock()
	defer p.mu.RUnlock()
	result := make([]Suggestion, len(p.Suggestions))
	copy(result, p.Suggestions)
	return result
}

// GetMessages returns all messages
func (p *PairSession) GetMessages() []PairMessage {
	p.mu.RLock()
	defer p.mu.RUnlock()
	result := make([]PairMessage, len(p.Messages))
	copy(result, p.Messages)
	return result
}

// OnEdit registers a callback for edit events
func (p *PairSession) OnEdit(fn func(edit *CodeEdit)) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.onEdit = fn
}

// OnSuggestion registers a callback for suggestion events
func (p *PairSession) OnSuggestion(fn func(suggestion *Suggestion)) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.onSuggestion = fn
}

// OnSwitch registers a callback for role switch events
func (p *PairSession) OnSwitch(fn func(from, to Role, agentID acp.AgentID)) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.onSwitch = fn
}

// Stats returns session statistics
func (p *PairSession) Stats() *PairStats {
	p.mu.RLock()
	defer p.mu.RUnlock()

	approvedEdits := 0
	rejectedEdits := 0
	for _, edit := range p.Edits {
		if edit.Approved {
			approvedEdits++
		} else if edit.RejectedBy != nil {
			rejectedEdits++
		}
	}

	acceptedSuggestions := 0
	rejectedSuggestions := 0
	for _, s := range p.Suggestions {
		if s.Status == SuggestionAccepted {
			acceptedSuggestions++
		} else if s.Status == SuggestionRejected {
			rejectedSuggestions++
		}
	}

	var driverID, navigatorID string
	if p.Driver != nil {
		driverID = string(p.Driver.ID)
	}
	if p.Navigator != nil {
		navigatorID = string(p.Navigator.ID)
	}

	return &PairStats{
		SessionID:           p.ID,
		State:               string(p.State),
		DriverID:            driverID,
		NavigatorID:         navigatorID,
		SwitchCount:         p.SwitchCount,
		TotalEdits:          len(p.Edits),
		ApprovedEdits:       approvedEdits,
		RejectedEdits:       rejectedEdits,
		TotalSuggestions:    len(p.Suggestions),
		AcceptedSuggestions: acceptedSuggestions,
		RejectedSuggestions: rejectedSuggestions,
		MessageCount:        len(p.Messages),
		Duration:            time.Since(p.CreatedAt),
	}
}

// PairStats holds pair session statistics
type PairStats struct {
	SessionID           string        `json:"sessionId"`
	State               string        `json:"state"`
	DriverID            string        `json:"driverId"`
	NavigatorID         string        `json:"navigatorId"`
	SwitchCount         int           `json:"switchCount"`
	TotalEdits          int           `json:"totalEdits"`
	ApprovedEdits       int           `json:"approvedEdits"`
	RejectedEdits       int           `json:"rejectedEdits"`
	TotalSuggestions    int           `json:"totalSuggestions"`
	AcceptedSuggestions int           `json:"acceptedSuggestions"`
	RejectedSuggestions int           `json:"rejectedSuggestions"`
	MessageCount        int           `json:"messageCount"`
	Duration            time.Duration `json:"duration"`
}

func (p *PairSession) startTurnLocked(agentID acp.AgentID) {
	turn := Turn{
		AgentID:   agentID,
		Role:      p.CurrentRole[agentID],
		StartedAt: time.Now(),
	}
	p.TurnHistory = append(p.TurnHistory, turn)
	p.CurrentTurn++

	// Trim old turn history if exceeding limit
	if len(p.TurnHistory) > maxTurnHistory {
		p.TurnHistory = p.TurnHistory[len(p.TurnHistory)-maxTurnHistory:]
	}
}

func generatePairID() string {
	return "pair_" + uuid.New().String()[:8]
}

func generateEditID() string {
	return "edit_" + uuid.New().String()[:8]
}

func generateSuggestionID() string {
	return "sugg_" + uuid.New().String()[:8]
}

func generateMessageID() string {
	return "msg_" + uuid.New().String()[:8]
}

// copyPairSession creates a deep copy of a PairSession for safe read-only access.
// This prevents callers from mutating internal state.
func copyPairSession(p *PairSession) *PairSession {
	if p == nil {
		return nil
	}

	// Create new PairSession to avoid copying mutex by value
	cp := &PairSession{
		ID:          p.ID,
		SessionID:   p.SessionID,
		State:       p.State,
		CurrentFile: p.CurrentFile,
		CursorPos:   p.CursorPos,
		Selection:   p.Selection,
		CreatedAt:   p.CreatedAt,
		SwitchCount: p.SwitchCount,
		MaxTurns:    p.MaxTurns,
		CurrentTurn: p.CurrentTurn,
		// ctx and cancel intentionally not copied - they're runtime state
		// callbacks intentionally not copied - they're function pointers
	}

	// Copy Driver and Navigator (shallow copy is fine - they're managed by Registry)
	if p.Driver != nil {
		cp.Driver = p.Driver
	}
	if p.Navigator != nil {
		cp.Navigator = p.Navigator
	}

	// Deep copy CurrentRole map
	if p.CurrentRole != nil {
		cp.CurrentRole = make(map[acp.AgentID]Role, len(p.CurrentRole))
		for k, v := range p.CurrentRole {
			cp.CurrentRole[k] = v
		}
	}

	// Deep copy TurnHistory slice
	if p.TurnHistory != nil {
		cp.TurnHistory = make([]Turn, len(p.TurnHistory))
		copy(cp.TurnHistory, p.TurnHistory)
	}

	// Deep copy Edits slice
	if p.Edits != nil {
		cp.Edits = make([]CodeEdit, len(p.Edits))
		copy(cp.Edits, p.Edits)
	}

	// Deep copy Messages slice
	if p.Messages != nil {
		cp.Messages = make([]PairMessage, len(p.Messages))
		copy(cp.Messages, p.Messages)
	}

	// Deep copy Suggestions slice
	if p.Suggestions != nil {
		cp.Suggestions = make([]Suggestion, len(p.Suggestions))
		copy(cp.Suggestions, p.Suggestions)
	}

	return cp
}
