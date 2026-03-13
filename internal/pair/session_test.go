package pair

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
)

func TestNewPairSession(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)

	session := NewPairSession(driver, navigator)

	if session == nil {
		t.Fatal("NewPairSession returned nil")
	}

	if session.ID == "" {
		t.Error("ID should be set")
	}

	if session.State != PairStateCreated {
		t.Errorf("Expected state '%s', got '%s'", PairStateCreated, session.State)
	}

	if session.Driver.ID != driver.ID {
		t.Error("Driver mismatch")
	}

	if session.Navigator.ID != navigator.ID {
		t.Error("Navigator mismatch")
	}

	if session.CurrentRole[driver.ID] != RoleDriver {
		t.Error("Driver should have RoleDriver")
	}

	if session.CurrentRole[navigator.ID] != RoleNavigator {
		t.Error("Navigator should have RoleNavigator")
	}
}

func TestPairSessionStart(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)

	ctx := context.Background()
	err := session.Start(ctx)

	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	if session.State != PairStateActive {
		t.Errorf("Expected state '%s', got '%s'", PairStateActive, session.State)
	}

	if len(session.TurnHistory) != 1 {
		t.Errorf("Expected 1 turn after start, got %d", len(session.TurnHistory))
	}
}

func TestPairSessionPause(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	session.Start(context.Background())

	session.Pause()

	if session.State != PairStatePaused {
		t.Errorf("Expected state '%s', got '%s'", PairStatePaused, session.State)
	}
}

func TestPairSessionResume(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	session.Start(context.Background())
	session.Pause()

	session.Resume()

	if session.State != PairStateActive {
		t.Errorf("Expected state '%s', got '%s'", PairStateActive, session.State)
	}
}

func TestPairSessionEnd(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	session.Start(context.Background())

	session.End()

	if session.State != PairStateEnded {
		t.Errorf("Expected state '%s', got '%s'", PairStateEnded, session.State)
	}
}

func TestPairSessionSwitchRoles(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	session.Start(context.Background())

	originalDriverID := session.Driver.ID
	originalNavigatorID := session.Navigator.ID

	err := session.SwitchRoles()
	if err != nil {
		t.Fatalf("SwitchRoles failed: %v", err)
	}

	// Driver and Navigator should be swapped
	if session.Driver.ID != originalNavigatorID {
		t.Error("Driver should now be the original navigator")
	}

	if session.Navigator.ID != originalDriverID {
		t.Error("Navigator should now be the original driver")
	}

	if session.SwitchCount != 1 {
		t.Errorf("Expected SwitchCount 1, got %d", session.SwitchCount)
	}
}

func TestPairSessionSwitchRolesCallback(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	session.Start(context.Background())

	called := false
	session.OnSwitch(func(from, to Role, agentID acp.AgentID) {
		called = true
	})

	session.SwitchRoles()

	if !called {
		t.Error("OnSwitch callback should have been called")
	}
}

func TestPairSessionProposeEdit(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	session.Start(context.Background())

	edit := &CodeEdit{
		File:     "test.go",
		OldText:  "old",
		NewText:  "new",
		StartPos: Position{Line: 1, Column: 0},
		EndPos:   Position{Line: 1, Column: 3},
	}

	err := session.ProposeEdit(edit)
	if err != nil {
		t.Fatalf("ProposeEdit failed: %v", err)
	}

	edits := session.GetEdits()
	if len(edits) != 1 {
		t.Errorf("Expected 1 edit, got %d", len(edits))
	}

	if edits[0].ID == "" {
		t.Error("Edit ID should be set")
	}

	if edits[0].Approved {
		t.Error("Edit should not be approved initially")
	}
}

func TestPairSessionProposeEditCallback(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	session.Start(context.Background())

	called := false
	session.OnEdit(func(edit *CodeEdit) {
		called = true
	})

	edit := &CodeEdit{File: "test.go"}
	session.ProposeEdit(edit)

	if !called {
		t.Error("OnEdit callback should have been called")
	}
}

func TestPairSessionApproveEdit(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	session.Start(context.Background())

	edit := &CodeEdit{File: "test.go"}
	session.ProposeEdit(edit)

	edits := session.GetEdits()
	editID := edits[0].ID

	err := session.ApproveEdit(editID)
	if err != nil {
		t.Fatalf("ApproveEdit failed: %v", err)
	}

	edits = session.GetEdits()
	if !edits[0].Approved {
		t.Error("Edit should be approved")
	}
}

func TestPairSessionRejectEdit(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	session.Start(context.Background())

	edit := &CodeEdit{File: "test.go"}
	session.ProposeEdit(edit)

	edits := session.GetEdits()
	editID := edits[0].ID

	err := session.RejectEdit(editID, "bad code")
	if err != nil {
		t.Fatalf("RejectEdit failed: %v", err)
	}

	edits = session.GetEdits()
	if edits[0].Approved {
		t.Error("Edit should not be approved")
	}

	if edits[0].RejectedBy == nil {
		t.Error("RejectedBy should be set")
	}
}

func TestPairSessionMakeSuggestion(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	session.Start(context.Background())

	suggestion := &Suggestion{
		Type:    SuggestionCode,
		Content: "Use a map instead",
	}

	err := session.MakeSuggestion(suggestion)
	if err != nil {
		t.Fatalf("MakeSuggestion failed: %v", err)
	}

	suggestions := session.GetSuggestions()
	if len(suggestions) != 1 {
		t.Errorf("Expected 1 suggestion, got %d", len(suggestions))
	}

	if suggestions[0].ID == "" {
		t.Error("Suggestion ID should be set")
	}

	if suggestions[0].Status != SuggestionPending {
		t.Error("Suggestion should be pending initially")
	}
}

func TestPairSessionMakeSuggestionCallback(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	session.Start(context.Background())

	called := false
	session.OnSuggestion(func(s *Suggestion) {
		called = true
	})

	suggestion := &Suggestion{Type: SuggestionCode, Content: "test"}
	session.MakeSuggestion(suggestion)

	if !called {
		t.Error("OnSuggestion callback should have been called")
	}
}

func TestPairSessionAcceptSuggestion(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	session.Start(context.Background())

	suggestion := &Suggestion{Type: SuggestionCode, Content: "test"}
	session.MakeSuggestion(suggestion)

	suggestions := session.GetSuggestions()
	suggestionID := suggestions[0].ID

	err := session.AcceptSuggestion(suggestionID)
	if err != nil {
		t.Fatalf("AcceptSuggestion failed: %v", err)
	}

	suggestions = session.GetSuggestions()
	if suggestions[0].Status != SuggestionAccepted {
		t.Error("Suggestion should be accepted")
	}

	if suggestions[0].AcceptedBy == nil {
		t.Error("AcceptedBy should be set")
	}
}

func TestPairSessionRejectSuggestion(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	session.Start(context.Background())

	suggestion := &Suggestion{Type: SuggestionCode, Content: "test"}
	session.MakeSuggestion(suggestion)

	suggestions := session.GetSuggestions()
	suggestionID := suggestions[0].ID

	err := session.RejectSuggestion(suggestionID)
	if err != nil {
		t.Fatalf("RejectSuggestion failed: %v", err)
	}

	suggestions = session.GetSuggestions()
	if suggestions[0].Status != SuggestionRejected {
		t.Error("Suggestion should be rejected")
	}

	if suggestions[0].RejectedBy == nil {
		t.Error("RejectedBy should be set")
	}
}

func TestPairSessionSendMessage(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	session.Start(context.Background())

	session.SendMessage(driver.ID, "Hello navigator!")

	messages := session.GetMessages()
	if len(messages) != 1 {
		t.Errorf("Expected 1 message, got %d", len(messages))
	}

	if messages[0].From != driver.ID {
		t.Error("From should be driver")
	}

	if messages[0].To != navigator.ID {
		t.Error("To should be navigator")
	}

	if messages[0].Content != "Hello navigator!" {
		t.Errorf("Content mismatch: %s", messages[0].Content)
	}
}

func TestPairSessionSetFile(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)

	session.SetFile("main.go")

	if session.CurrentFile != "main.go" {
		t.Errorf("Expected CurrentFile 'main.go', got '%s'", session.CurrentFile)
	}
}

func TestPairSessionSetCursor(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)

	pos := Position{Line: 10, Column: 5}
	session.SetCursor(pos)

	if session.CursorPos.Line != 10 || session.CursorPos.Column != 5 {
		t.Errorf("CursorPos mismatch: %+v", session.CursorPos)
	}
}

func TestPairSessionSetSelection(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)

	r := Range{
		Start: Position{Line: 1, Column: 0},
		End:   Position{Line: 5, Column: 10},
	}
	session.SetSelection(r)

	if session.Selection.Start.Line != 1 || session.Selection.End.Line != 5 {
		t.Errorf("Selection mismatch: %+v", session.Selection)
	}
}

func TestPairSessionGetState(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)

	// Initial state is created
	if session.GetState() != PairStateCreated {
		t.Errorf("Expected state '%s', got '%s'", PairStateCreated, session.GetState())
	}

	// After start, state is active
	session.Start(context.Background())
	if session.GetState() != PairStateActive {
		t.Errorf("Expected state '%s', got '%s'", PairStateActive, session.GetState())
	}

	session.Pause()
	if session.GetState() != PairStatePaused {
		t.Errorf("Expected state '%s', got '%s'", PairStatePaused, session.GetState())
	}
}

func TestPairSessionGetRoles(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)

	roles := session.GetRoles()

	if roles[driver.ID] != RoleDriver {
		t.Error("Driver should have RoleDriver")
	}

	if roles[navigator.ID] != RoleNavigator {
		t.Error("Navigator should have RoleNavigator")
	}
}

func TestPairSessionStats(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	session.Start(context.Background())

	// Add some activity
	session.ProposeEdit(&CodeEdit{File: "test.go"})
	edits := session.GetEdits()
	session.ApproveEdit(edits[0].ID)

	session.MakeSuggestion(&Suggestion{Type: SuggestionCode, Content: "test"})
	suggestions := session.GetSuggestions()
	session.AcceptSuggestion(suggestions[0].ID)

	session.SendMessage(driver.ID, "Hello!")

	session.SwitchRoles()

	stats := session.Stats()

	if stats.SessionID != session.ID {
		t.Error("SessionID mismatch")
	}

	if stats.DriverID != string(session.Driver.ID) {
		t.Error("DriverID mismatch")
	}

	if stats.SwitchCount != 1 {
		t.Errorf("Expected SwitchCount 1, got %d", stats.SwitchCount)
	}

	if stats.TotalEdits != 1 {
		t.Errorf("Expected TotalEdits 1, got %d", stats.TotalEdits)
	}

	if stats.ApprovedEdits != 1 {
		t.Errorf("Expected ApprovedEdits 1, got %d", stats.ApprovedEdits)
	}

	if stats.TotalSuggestions != 1 {
		t.Errorf("Expected TotalSuggestions 1, got %d", stats.TotalSuggestions)
	}

	if stats.AcceptedSuggestions != 1 {
		t.Errorf("Expected AcceptedSuggestions 1, got %d", stats.AcceptedSuggestions)
	}

	if stats.MessageCount != 1 {
		t.Errorf("Expected MessageCount 1, got %d", stats.MessageCount)
	}

	if stats.Duration <= 0 {
		t.Error("Duration should be positive")
	}
}

func TestPairSessionStatsRejected(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	session.Start(context.Background())

	session.ProposeEdit(&CodeEdit{File: "test.go"})
	edits := session.GetEdits()
	session.RejectEdit(edits[0].ID, "bad")

	session.MakeSuggestion(&Suggestion{Type: SuggestionCode, Content: "test"})
	suggestions := session.GetSuggestions()
	session.RejectSuggestion(suggestions[0].ID)

	stats := session.Stats()

	if stats.RejectedEdits != 1 {
		t.Errorf("Expected RejectedEdits 1, got %d", stats.RejectedEdits)
	}

	if stats.RejectedSuggestions != 1 {
		t.Errorf("Expected RejectedSuggestions 1, got %d", stats.RejectedSuggestions)
	}
}

func TestRoleConstants(t *testing.T) {
	if RoleDriver != "driver" {
		t.Errorf("RoleDriver should be 'driver', got '%s'", RoleDriver)
	}

	if RoleNavigator != "navigator" {
		t.Errorf("RoleNavigator should be 'navigator', got '%s'", RoleNavigator)
	}
}

func TestPairStateConstants(t *testing.T) {
	states := []PairSessionState{
		PairStateActive,
		PairStatePaused,
		PairStateSwitching,
		PairStateEnded,
	}

	for _, state := range states {
		if state == "" {
			t.Error("State should not be empty")
		}
	}
}

func TestSuggestionTypeConstants(t *testing.T) {
	types := []SuggestionType{
		SuggestionCode,
		SuggestionComment,
		SuggestionRefactor,
		SuggestionTest,
		SuggestionQuestion,
	}

	for _, s := range types {
		if s == "" {
			t.Error("SuggestionType should not be empty")
		}
	}
}

func TestSuggestionStatusConstants(t *testing.T) {
	statuses := []SuggestionStatus{
		SuggestionPending,
		SuggestionAccepted,
		SuggestionRejected,
	}

	for _, s := range statuses {
		if s == "" {
			t.Error("SuggestionStatus should not be empty")
		}
	}
}

func TestPairStatsJSON(t *testing.T) {
	stats := &PairStats{
		SessionID:           "session-1",
		State:               "active",
		DriverID:            "driver-1",
		NavigatorID:         "navigator-1",
		SwitchCount:         2,
		TotalEdits:          10,
		ApprovedEdits:       8,
		RejectedEdits:       2,
		TotalSuggestions:    5,
		AcceptedSuggestions: 3,
		RejectedSuggestions: 2,
		MessageCount:        20,
		Duration:            5 * time.Minute,
	}

	data, err := json.Marshal(stats)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed PairStats
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.SessionID != "session-1" {
		t.Error("SessionID mismatch")
	}

	if parsed.SwitchCount != 2 {
		t.Error("SwitchCount mismatch")
	}
}

func TestCodeEditJSON(t *testing.T) {
	edit := &CodeEdit{
		ID:        "edit-1",
		AgentID:   "agent-1",
		File:      "test.go",
		StartPos:  Position{Line: 1, Column: 0},
		EndPos:    Position{Line: 2, Column: 10},
		OldText:   "old",
		NewText:   "new",
		Approved:  true,
		Timestamp: time.Now(),
	}

	data, err := json.Marshal(edit)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed CodeEdit
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.ID != "edit-1" {
		t.Error("ID mismatch")
	}

	if parsed.File != "test.go" {
		t.Error("File mismatch")
	}
}

func TestSuggestionJSON(t *testing.T) {
	agentID := acp.AgentID("agent-1")
	suggestion := &Suggestion{
		ID:        "sugg-1",
		FromAgent: agentID,
		Type:      SuggestionCode,
		Content:   "Refactor this",
		File:      "test.go",
		Line:      10,
		Timestamp: time.Now(),
		Status:    SuggestionPending,
	}

	data, err := json.Marshal(suggestion)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed Suggestion
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.ID != "sugg-1" {
		t.Error("ID mismatch")
	}

	if parsed.Type != SuggestionCode {
		t.Error("Type mismatch")
	}
}

func TestPairMessageJSON(t *testing.T) {
	msg := PairMessage{
		ID:        "msg-1",
		From:      "driver-1",
		To:        "navigator-1",
		Content:   "Hello!",
		Timestamp: time.Now(),
	}

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed PairMessage
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.ID != "msg-1" {
		t.Error("ID mismatch")
	}

	if parsed.Content != "Hello!" {
		t.Error("Content mismatch")
	}
}

func TestTurnJSON(t *testing.T) {
	turn := Turn{
		AgentID:   "agent-1",
		Role:      RoleDriver,
		StartedAt: time.Now(),
		EndedAt:   time.Now().Add(5 * time.Minute),
	}

	data, err := json.Marshal(turn)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed Turn
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.AgentID != "agent-1" {
		t.Error("AgentID mismatch")
	}

	if parsed.Role != RoleDriver {
		t.Error("Role mismatch")
	}
}

func TestPositionJSON(t *testing.T) {
	pos := Position{Line: 10, Column: 5}

	data, err := json.Marshal(pos)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed Position
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.Line != 10 || parsed.Column != 5 {
		t.Errorf("Position mismatch: %+v", parsed)
	}
}

func TestRangeJSON(t *testing.T) {
	r := Range{
		Start: Position{Line: 1, Column: 0},
		End:   Position{Line: 5, Column: 10},
	}

	data, err := json.Marshal(r)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var parsed Range
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.Start.Line != 1 || parsed.End.Line != 5 {
		t.Errorf("Range mismatch: %+v", parsed)
	}
}

func TestPairSessionDoubleStart(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)

	ctx := context.Background()

	// First start should succeed
	err := session.Start(ctx)
	if err != nil {
		t.Fatalf("First Start failed: %v", err)
	}

	// Second start should fail
	err = session.Start(ctx)
	if err == nil {
		t.Error("Second Start should return error")
	}

	// Clean up
	session.End()
}

func TestPairSessionStartAfterPause(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)

	ctx := context.Background()
	session.Start(ctx)
	session.Pause()

	// Start after pause should fail (session is paused, not active)
	err := session.Start(ctx)
	if err == nil {
		t.Error("Start on paused session should return error")
	}

	// Resume should work
	session.Resume()
	if session.State != PairStateActive {
		t.Error("Session should be active after Resume")
	}
}

func TestPairSessionConcurrentAccess(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)

	ctx := context.Background()
	session.Start(ctx)
	defer session.End()

	done := make(chan bool)

	// Concurrent state changes
	for i := 0; i < 10; i++ {
		go func() {
			for j := 0; j < 100; j++ {
				session.Pause()
				session.Resume()
				_ = session.GetState()
			}
			done <- true
		}()
	}

	// Concurrent message sending
	for i := 0; i < 5; i++ {
		go func() {
			for j := 0; j < 50; j++ {
				session.SendMessage(driver.ID, "test message")
			}
			done <- true
		}()
	}

	// Wait for all goroutines (10 state + 5 message = 15)
	for i := 0; i < 15; i++ {
		<-done
	}
}

// Edge case tests for nil checks

func TestNewPairSessionNilDriver(t *testing.T) {
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)

	// Should return nil when driver is nil
	session := NewPairSession(nil, navigator)
	if session != nil {
		t.Error("NewPairSession should return nil when driver is nil")
	}
}

func TestNewPairSessionNilNavigator(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)

	// Should return nil when navigator is nil
	session := NewPairSession(driver, nil)
	if session != nil {
		t.Error("NewPairSession should return nil when navigator is nil")
	}
}

func TestNewPairSessionBothNil(t *testing.T) {
	// Should return nil when both are nil
	session := NewPairSession(nil, nil)
	if session != nil {
		t.Error("NewPairSession should return nil when both agents are nil")
	}
}

func TestPairSessionProposeNilEdit(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	session.Start(context.Background())

	// Should return error for nil edit
	err := session.ProposeEdit(nil)
	if err == nil {
		t.Error("ProposeEdit should return error for nil edit")
	}

	// No edits should be recorded
	edits := session.GetEdits()
	if len(edits) != 0 {
		t.Errorf("Expected 0 edits after nil edit, got %d", len(edits))
	}
}

func TestPairSessionMakeNilSuggestion(t *testing.T) {
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	session.Start(context.Background())

	// Should return error for nil suggestion
	err := session.MakeSuggestion(nil)
	if err == nil {
		t.Error("MakeSuggestion should return error for nil suggestion")
	}

	// No suggestions should be recorded
	suggestions := session.GetSuggestions()
	if len(suggestions) != 0 {
		t.Errorf("Expected 0 suggestions after nil suggestion, got %d", len(suggestions))
	}
}

func TestPairSessionStatsWithNilAgents(t *testing.T) {
	// Create a session and manually set agents to nil to test Stats robustness
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	session.Start(context.Background())

	// Manually set agents to nil (simulating edge case)
	session.mu.Lock()
	session.Driver = nil
	session.Navigator = nil
	session.mu.Unlock()

	// Stats should not panic and should return empty strings for IDs
	stats := session.Stats()
	if stats == nil {
		t.Fatal("Stats should not return nil")
	}

	if stats.DriverID != "" {
		t.Errorf("Expected empty DriverID when driver is nil, got '%s'", stats.DriverID)
	}

	if stats.NavigatorID != "" {
		t.Errorf("Expected empty NavigatorID when navigator is nil, got '%s'", stats.NavigatorID)
	}
}
