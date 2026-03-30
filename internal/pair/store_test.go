package pair

import (
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/agent"
)

func TestPairStoreSave(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	session.CurrentFile = "test.go"
	session.CursorPos = Position{Line: 10, Column: 5}

	if err := store.Save(session); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	loaded, err := store.Load(session.ID)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if loaded.ID != session.ID {
		t.Errorf("Expected ID '%s', got '%s'", session.ID, loaded.ID)
	}

	if loaded.CurrentFile != "test.go" {
		t.Errorf("Expected CurrentFile 'test.go', got '%s'", loaded.CurrentFile)
	}

	if loaded.CursorPos.Line != 10 {
		t.Errorf("Expected CursorPos.Line 10, got %d", loaded.CursorPos.Line)
	}

	if loaded.CursorPos.Column != 5 {
		t.Errorf("Expected CursorPos.Column 5, got %d", loaded.CursorPos.Column)
	}
}

func TestPairStoreLoad(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	// Load non-existent session
	_, err = store.Load("non-existent")
	if err == nil {
		t.Error("Load should return error for non-existent session")
	}
}

func TestPairStoreDelete(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	store.Save(session)

	// Delete
	if err := store.Delete(session.ID); err != nil {
		t.Fatalf("Delete failed: %v", err)
	}

	// Verify deleted
	_, err = store.Load(session.ID)
	if err == nil {
		t.Error("Load should return error after delete")
	}
}

func TestPairStoreList(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	// Empty list
	ids := store.List()
	if len(ids) != 0 {
		t.Errorf("Expected 0 sessions, got %d", len(ids))
	}

	// Create multiple sessions
	for i := 0; i < 3; i++ {
		driver := agent.NewAgent("driver", agent.AgentTypeCoder)
		navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
		session := NewPairSession(driver, navigator)
		session.CurrentFile = "test.go"
		store.Save(session)
	}

	ids = store.List()
	if len(ids) != 3 {
		t.Errorf("Expected 3 sessions, got %d", len(ids))
	}
}

func TestPairStoreListByState(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	// Create sessions with different states
	for i := 0; i < 3; i++ {
		driver := agent.NewAgent("driver", agent.AgentTypeCoder)
		navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
		session := NewPairSession(driver, navigator)
		if i == 0 {
			session.State = PairStateActive
		} else if i == 1 {
			session.State = PairStatePaused
		} else {
			session.End()
		}
		store.Save(session)
	}

	active := store.ListByState(string(PairStateActive))
	if len(active) != 1 {
		t.Errorf("Expected 1 active session, got %d", len(active))
	}

	paused := store.ListByState(string(PairStatePaused))
	if len(paused) != 1 {
		t.Errorf("Expected 1 paused session, got %d", len(paused))
	}

	ended := store.ListByState(string(PairStateEnded))
	if len(ended) != 1 {
		t.Errorf("Expected 1 ended session, got %d", len(ended))
	}
}

func TestPairStoreListRecent(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	// Create sessions with slight delay
	for i := 0; i < 5; i++ {
		driver := agent.NewAgent("driver", agent.AgentTypeCoder)
		navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
		session := NewPairSession(driver, navigator)
		store.Save(session)
		time.Sleep(10 * time.Millisecond)
	}

	recent := store.ListRecent(3)
	if len(recent) != 3 {
		t.Errorf("Expected 3 recent sessions, got %d", len(recent))
	}
}

func TestPairStoreCleanup(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	// Create an old ended session
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	oldSession := NewPairSession(driver, navigator)
	oldSession.End()
	store.Save(oldSession)

	// Manually set UpdatedAt to past
	store.mu.Lock()
	if stored, ok := store.sessions[oldSession.ID]; ok {
		stored.UpdatedAt = time.Now().Add(-2 * time.Hour)
		store.saveToDisk(stored)
	}
	store.mu.Unlock()

	// Create a recent session
	driver2 := agent.NewAgent("driver2", agent.AgentTypeCoder)
	navigator2 := agent.NewAgent("navigator2", agent.AgentTypeReviewer)
	recentSession := NewPairSession(driver2, navigator2)
	store.Save(recentSession)

	// Cleanup sessions older than 1 hour
	removed, err := store.Cleanup(1 * time.Hour)
	if err != nil {
		t.Fatalf("Cleanup failed: %v", err)
	}

	if removed != 1 {
		t.Errorf("Expected 1 removed session, got %d", removed)
	}

	// Verify old session is gone
	_, err = store.Load(oldSession.ID)
	if err == nil {
		t.Error("Old session should be removed")
	}

	// Verify recent session exists
	_, err = store.Load(recentSession.ID)
	if err != nil {
		t.Error("Recent session should still exist")
	}
}

func TestPairStoreGetStats(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	// Create sessions with different states
	for i := 0; i < 3; i++ {
		driver := agent.NewAgent("driver", agent.AgentTypeCoder)
		navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
		session := NewPairSession(driver, navigator)
		if i == 0 {
			session.State = PairStateActive
		} else if i == 1 {
			session.State = PairStatePaused
		} else {
			session.End()
		}
		store.Save(session)
	}

	stats := store.GetStats()
	if stats.TotalSessions != 3 {
		t.Errorf("Expected 3 total sessions, got %d", stats.TotalSessions)
	}

	if stats.Active != 1 {
		t.Errorf("Expected 1 active session, got %d", stats.Active)
	}

	if stats.Paused != 1 {
		t.Errorf("Expected 1 paused session, got %d", stats.Paused)
	}

	if stats.Ended != 1 {
		t.Errorf("Expected 1 ended session, got %d", stats.Ended)
	}
}

func TestPairStoreExportImport(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	session.CurrentFile = "export_test.go"
	store.Save(session)

	// Export
	data, err := store.Export(session.ID)
	if err != nil {
		t.Fatalf("Export failed: %v", err)
	}

	// Verify it's valid JSON
	var parsed StoredSession
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Export data is not valid JSON: %v", err)
	}

	// Delete original
	store.Delete(session.ID)

	// Import
	imported, err := store.Import(data)
	if err != nil {
		t.Fatalf("Import failed: %v", err)
	}

	if imported.ID != session.ID {
		t.Errorf("Imported ID mismatch")
	}

	if imported.CurrentFile != "export_test.go" {
		t.Errorf("Imported CurrentFile mismatch")
	}
}

func TestPairStoreConcurrentAccess(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	var wg sync.WaitGroup
	errCh := make(chan error, 10)

	// Concurrent saves
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			driver := agent.NewAgent("driver", agent.AgentTypeCoder)
			navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
			session := NewPairSession(driver, navigator)
			if err := store.Save(session); err != nil {
				errCh <- err
			}
		}(i)
	}

	wg.Wait()
	close(errCh)

	for err := range errCh {
		t.Errorf("Concurrent save error: %v", err)
	}

	// Verify all sessions saved
	if len(store.List()) != 10 {
		t.Errorf("Expected 10 sessions, got %d", len(store.List()))
	}
}

func TestPairStoreRestore(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)

	session := NewPairSession(driver, navigator)
	session.CurrentFile = "restore_test.go"
	session.CursorPos = Position{Line: 10, Column: 5}
	store.Save(session)

	// Create new agent instances for restore
	newDriver := agent.NewAgent("driver", agent.AgentTypeCoder)
	newNavigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)

	// Restore
	restored, err := store.Restore(session.ID, newDriver, newNavigator)
	if err != nil {
		t.Fatalf("Restore failed: %v", err)
	}

	if restored.ID != session.ID {
		t.Errorf("Restored ID mismatch")
	}

	if restored.CurrentFile != "restore_test.go" {
		t.Errorf("Restored CurrentFile mismatch")
	}

	if restored.CursorPos.Line != 10 || restored.CursorPos.Column != 5 {
		t.Errorf("Restored CursorPos mismatch: Line=%d, Column=%d", restored.CursorPos.Line, restored.CursorPos.Column)
	}
}

func TestPairStorePersistenceAcrossInstances(t *testing.T) {
	tmpDir := t.TempDir()

	// First instance
	store1, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore 1 failed: %v", err)
	}

	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	session.CurrentFile = "persist_test.go"
	store1.Save(session)

	// Second instance (should load existing)
	store2, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore 2 failed: %v", err)
	}

	loaded, err := store2.Load(session.ID)
	if err != nil {
		t.Fatalf("Load from second instance failed: %v", err)
	}

	if loaded.CurrentFile != "persist_test.go" {
		t.Errorf("Persisted CurrentFile mismatch")
	}
}

func TestStoredSessionJSON(t *testing.T) {
	session := &StoredSession{
		ID:          "test-session",
		SessionID:   string(acp.SessionID("session-123")),
		DriverID:    "driver-1",
		NavigatorID: "navigator-1",
		State:       string(PairStateActive),
		TurnHistory: []Turn{
			{AgentID: acp.AgentID("driver-1"), Role: RoleDriver, StartedAt: time.Now()},
		},
		Edits:       []CodeEdit{},
		Messages:    []PairMessage{},
		Suggestions: []Suggestion{},
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
		SwitchCount: 2,
		CurrentFile: "test.go",
		CursorPos:   Position{Line: 10, Column: 5},
		Selection:   Range{Start: Position{Line: 1, Column: 0}, End: Position{Line: 5, Column: 10}},
	}

	// Marshal to JSON
	data, err := json.MarshalIndent(session, "", "  ")
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	// Unmarshal back
	var parsed StoredSession
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if parsed.ID != session.ID {
		t.Errorf("ID mismatch")
	}

	if parsed.CurrentFile != "test.go" {
		t.Errorf("CurrentFile mismatch")
	}

	if parsed.CursorPos.Line != 10 {
		t.Errorf("CursorPos.Line mismatch")
	}

	if parsed.SwitchCount != 2 {
		t.Errorf("SwitchCount mismatch")
	}
}

func TestPairStoreExportNonExistent(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	_, err = store.Export("non-existent")
	if err == nil {
		t.Error("Export should return error for non-existent session")
	}
}

func TestPairStoreImportInvalid(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	_, err = store.Import([]byte("invalid json"))
	if err == nil {
		t.Error("Import should return error for invalid JSON")
	}
}

func TestPairStoreRestoreNonExistent(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)

	_, err = store.Restore("non-existent", driver, navigator)
	if err == nil {
		t.Error("Restore should return error for non-existent session")
	}
}

func TestNewStoreWithEmptyPath(t *testing.T) {
	// Test NewStore with empty path - uses home directory
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("NewStore with empty path failed: %v", err)
	}

	if store == nil {
		t.Fatal("Store should not be nil")
	}

	// Verify the path was set to home directory
	if store.basePath == "" {
		t.Error("basePath should be set")
	}

	// Clean up - remove the test directory
	// Note: This creates ~/.swarm-editor/sessions which is expected behavior
}

func TestPairStoreDeleteNonExistent(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	// Delete non-existent should NOT return error (silently ignores)
	err = store.Delete("non-existent")
	if err != nil {
		t.Errorf("Delete should not return error for non-existent session: %v", err)
	}
}

func TestPairStoreSaveAndLoadWithMetadata(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)

	// Add some turns
	session.TurnHistory = []Turn{
		{AgentID: driver.ID, Role: RoleDriver, StartedAt: time.Now()},
		{AgentID: navigator.ID, Role: RoleNavigator, StartedAt: time.Now()},
	}
	session.SwitchCount = 1

	// Save
	if err := store.Save(session); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	// Load
	loaded, err := store.Load(session.ID)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if len(loaded.TurnHistory) != 2 {
		t.Errorf("Expected 2 turns, got %d", len(loaded.TurnHistory))
	}

	if loaded.SwitchCount != 1 {
		t.Errorf("Expected SwitchCount 1, got %d", loaded.SwitchCount)
	}
}

func TestPairStoreListRecentWithLimit(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	// Create no sessions
	recent := store.ListRecent(10)
	if len(recent) != 0 {
		t.Errorf("Expected 0 recent sessions, got %d", len(recent))
	}

	// Create sessions
	for i := 0; i < 5; i++ {
		driver := agent.NewAgent("driver", agent.AgentTypeCoder)
		navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
		session := NewPairSession(driver, navigator)
		store.Save(session)
		time.Sleep(10 * time.Millisecond)
	}

	// List recent with limit larger than available
	recent = store.ListRecent(10)
	if len(recent) != 5 {
		t.Errorf("Expected 5 recent sessions, got %d", len(recent))
	}
}

func TestPairStoreCleanupNoSessions(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	// Cleanup with no sessions
	removed, err := store.Cleanup(1 * time.Hour)
	if err != nil {
		t.Fatalf("Cleanup failed: %v", err)
	}

	if removed != 0 {
		t.Errorf("Expected 0 removed, got %d", removed)
	}
}

func TestPairStoreCleanupActiveSessions(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	// Create an active session (should not be cleaned up)
	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	session.State = PairStateActive
	store.Save(session)

	// Cleanup
	removed, err := store.Cleanup(1 * time.Millisecond)
	if err != nil {
		t.Fatalf("Cleanup failed: %v", err)
	}

	// Active sessions should not be removed
	if removed != 0 {
		t.Errorf("Expected 0 removed (active sessions not cleaned), got %d", removed)
	}
}

// Edge case tests

func TestPairStoreSaveNilSession(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	err = store.Save(nil)
	if err == nil {
		t.Error("Save should return error for nil session")
	}
}

func TestPairStoreImportEmptyData(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	_, err = store.Import([]byte{})
	if err == nil {
		t.Error("Import should return error for empty data")
	}
}

func TestPairStoreImportNilData(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	_, err = store.Import(nil)
	if err == nil {
		t.Error("Import should return error for nil data")
	}
}

func TestPairStoreRestoreNilDriver(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	store.Save(session)

	_, err = store.Restore(session.ID, nil, navigator)
	if err == nil {
		t.Error("Restore should return error for nil driver")
	}
}

func TestPairStoreRestoreNilNavigator(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	store.Save(session)

	_, err = store.Restore(session.ID, driver, nil)
	if err == nil {
		t.Error("Restore should return error for nil navigator")
	}
}

func TestPairStoreRestoreNilBoth(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeReviewer)
	session := NewPairSession(driver, navigator)
	store.Save(session)

	_, err = store.Restore(session.ID, nil, nil)
	if err == nil {
		t.Error("Restore should return error for nil driver and navigator")
	}
}

func TestPairStoreSaveRejectsInvalidID(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	driver := agent.NewAgent("driver", agent.AgentTypeCoder)
	navigator := agent.NewAgent("navigator", agent.AgentTypeCoder)

	tests := []struct {
		name string
		id   string
	}{
		{"path traversal", "../../etc/passwd"},
		{"empty", ""},
		{"slash", "foo/bar"},
		{"backslash", "foo\\bar"},
		{"null byte", "foo\x00bar"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			session := NewPairSession(driver, navigator)
			session.ID = tt.id
			err := store.Save(session)
			if err == nil {
				t.Errorf("Save(%q) expected error, got nil", tt.id)
			}
		})
	}
}

func TestValidateSessionID(t *testing.T) {
	// Create a valid max-length ID
	maxLenID := ""
	for i := 0; i < 128; i++ {
		maxLenID += "a"
	}
	tooLongID := maxLenID + "b"

	tests := []struct {
		name    string
		id      string
		wantErr bool
	}{
		{"valid simple", "session-123", false},
		{"valid with underscore", "session_123", false},
		{"valid with dot", "session.123", false},
		{"valid alphanumeric", "abc123DEF", false},
		{"empty string", "", true},
		{"path traversal", "../etc/passwd", true},
		{"with slash", "session/123", true},
		{"with backslash", "session\\123", true},
		{"with space", "session 123", true},
		{"too long", tooLongID, true},
		{"max length", maxLenID, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateSessionID(tt.id)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateSessionID(%q) error = %v, wantErr %v", tt.id, err, tt.wantErr)
			}
		})
	}
}
