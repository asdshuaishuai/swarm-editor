package session

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestNewStore(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("NewStore('') failed: %v", err)
	}
	if store == nil {
		t.Fatal("Expected non-nil store")
	}
	if len(store.sessions) != 0 {
		t.Fatalf("Expected 0 sessions, got %d", len(store.sessions))
	}

	tmpDir := t.TempDir()
	store2, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore(tmpDir) failed: %v", err)
	}
	if store2 == nil {
		t.Fatal("Expected non-nil store2")
	}
}

func TestNewStore_LoadFromDisk(t *testing.T) {
	tmpDir := t.TempDir()

	session := &Session{
		ID:        "existing-session",
		AgentID:   "agent-1",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		Messages:  []Message{},
		Status:    "active",
		Metadata:  map[string]any{"key": "value"},
	}
	data, err := json.MarshalIndent(session, "", "  ")
	if err != nil {
		t.Fatalf("json.MarshalIndent failed: %v", err)
	}
	path := filepath.Join(tmpDir, "existing-session.json")
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	loaded := store.Get("existing-session")
	if loaded == nil {
		t.Fatal("Expected session to be loaded from disk")
	}
	if loaded.AgentID != "agent-1" {
		t.Errorf("AgentID = %q, want 'agent-1'", loaded.AgentID)
	}
	if loaded.Status != "active" {
		t.Errorf("Status = %q, want 'active'", loaded.Status)
	}
	if loaded.Metadata["key"] != "value" {
		t.Errorf("Metadata[key] = %v, want 'value'", loaded.Metadata["key"])
	}

	byAgent := store.ListByAgent("agent-1")
	if byAgent == nil || len(byAgent) != 1 {
		t.Errorf("ListByAgent(agent-1) len = %d, want 1", len(byAgent))
	}
	if byAgent != nil && byAgent[0].ID != "existing-session" {
		t.Errorf("byAgent[0].ID = %q, want 'existing-session'", byAgent[0].ID)
	}
}

func TestCreate(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	session := store.Create("session-1", "agent-a")
	if session == nil {
		t.Fatal("Create returned nil")
	}
	if session.ID != "session-1" {
		t.Errorf("ID = %q, want 'session-1'", session.ID)
	}
	if session.AgentID != "agent-a" {
		t.Errorf("AgentID = %q, want 'agent-a'", session.AgentID)
	}
	if session.Status != "active" {
		t.Errorf("Status = %q, want 'active'", session.Status)
	}
	if session.CreatedAt.IsZero() {
		t.Error("CreatedAt is zero")
	}
	if session.UpdatedAt.IsZero() {
		t.Error("UpdatedAt is zero")
	}
	if len(session.Messages) != 0 {
		t.Errorf("Messages len = %d, want 0", len(session.Messages))
	}

	// Verify Get
	retrieved := store.Get("session-1")
	if retrieved == nil {
		t.Error("Get(session-1) returned nil")
	}

	// Duplicate ID overwrites
	session2 := store.Create("session-1", "agent-b")
	if session2 == nil {
		t.Error("Duplicate Create returned nil")
	}

	byAgent := store.ListByAgent("agent-a")
	if len(byAgent) != 1 {
		t.Errorf("ListByAgent(agent-a) len = %d, want 1", len(byAgent))
	}
}

func TestCreate_Concurrent(t *testing.T) {
	store, _ := NewStore("")

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			s := store.Create("session-"+string(rune('0'+id%10)), "agent-x")
			if s == nil {
				t.Errorf("Create returned nil for id %d", id)
			}
		}(i)
	}
	wg.Wait()

	for i := 0; i < 50; i++ {
		s := store.Get("session-" + string(rune('0'+i%10)))
		if s == nil {
			t.Errorf("Get failed for session-%d", i)
		}
	}
}

func TestGet(t *testing.T) {
	store, _ := NewStore("")

	if store.Get("nonexistent") != nil {
		t.Error("Get(nonexistent) should return nil")
	}

	store.Create("s1", "a1")
	s := store.Get("s1")
	if s == nil {
		t.Fatal("Get(s1) returned nil")
	}
	if s.ID != "s1" {
		t.Errorf("ID = %q, want 's1'", s.ID)
	}
}

func TestList(t *testing.T) {
	store, _ := NewStore("")

	list := store.List()
	if len(list) != 0 {
		t.Errorf("List() len = %d, want 0", len(list))
	}

	time.Sleep(1 * time.Millisecond)
	store.Create("s2", "a1")
	time.Sleep(1 * time.Millisecond)
	store.Create("s1", "a1")

	list = store.List()
	if len(list) != 2 {
		t.Fatalf("List() len = %d, want 2", len(list))
	}
	// Sorted by UpdatedAt descending
	if list[0].ID != "s1" {
		t.Errorf("list[0].ID = %q, want 's1' (most recent first)", list[0].ID)
	}
	if list[1].ID != "s2" {
		t.Errorf("list[1].ID = %q, want 's2'", list[1].ID)
	}
}

func TestListByAgent(t *testing.T) {
	store, _ := NewStore("")

	list := store.ListByAgent("nonexistent")
	if list != nil {
		t.Errorf("ListByAgent(nonexistent) = %v, want nil", list)
	}

	store.Create("s1", "a1")
	store.Create("s2", "a2")
	store.Create("s3", "a1")

	list = store.ListByAgent("a1")
	if list == nil {
		t.Fatal("ListByAgent(a1) returned nil")
	}
	if len(list) != 2 {
		t.Errorf("len = %d, want 2", len(list))
	}
}

func TestListByAgent_ConcurrentReads(t *testing.T) {
	store, _ := NewStore("")
	for i := 0; i < 10; i++ {
		store.Create("s-"+string(rune('0'+i)), "agent-x")
	}

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			list := store.ListByAgent("agent-x")
			if len(list) != 10 {
				t.Errorf("ListByAgent len = %d, want 10", len(list))
			}
		}()
	}
	wg.Wait()
}

func TestAddMessage(t *testing.T) {
	store, _ := NewStore("")
	store.Create("s1", "a1")

	msg := Message{
		Role:    "user",
		Content: []ContentBlock{{Type: "text", Text: "Hello"}},
	}
	err := store.AddMessage("s1", msg)
	if err != nil {
		t.Fatalf("AddMessage failed: %v", err)
	}

	session := store.Get("s1")
	if session == nil {
		t.Fatal("Get(s1) returned nil")
	}
	if len(session.Messages) != 1 {
		t.Fatalf("len(Messages) = %d, want 1", len(session.Messages))
	}
	if session.Messages[0].Role != "user" {
		t.Errorf("Role = %q, want 'user'", session.Messages[0].Role)
	}
	if session.Messages[0].Content[0].Text != "Hello" {
		t.Errorf("Content[0].Text = %q, want 'Hello'", session.Messages[0].Content[0].Text)
	}
}

func TestAddMessage_GeneratesID(t *testing.T) {
	store, _ := NewStore("")
	store.Create("s1", "a1")

	err := store.AddMessage("s1", Message{Role: "user", Content: []ContentBlock{{Type: "text", Text: "hi"}}})
	if err != nil {
		t.Fatalf("AddMessage failed: %v", err)
	}

	session := store.Get("s1")
	if session == nil {
		t.Fatal("Get(s1) returned nil")
	}
	if session.Messages[0].ID == "" {
		t.Error("Message ID should be auto-generated")
	}
	if session.Messages[0].CreatedAt.IsZero() {
		t.Error("CreatedAt should be auto-generated")
	}
}

func TestAddMessage_NotFound(t *testing.T) {
	store, _ := NewStore("")
	err := store.AddMessage("nonexistent", Message{Role: "user", Content: []ContentBlock{{Type: "text", Text: "hi"}}})
	if err == nil {
		t.Error("AddMessage to nonexistent session should error")
	}
}

func TestUpdateStatus(t *testing.T) {
	store, _ := NewStore("")
	store.Create("s1", "a1")

	err := store.UpdateStatus("s1", "closed")
	if err != nil {
		t.Fatalf("UpdateStatus failed: %v", err)
	}

	session := store.Get("s1")
	if session == nil {
		t.Fatal("Get(s1) returned nil")
	}
	if session.Status != "closed" {
		t.Errorf("Status = %q, want 'closed'", session.Status)
	}
}

func TestUpdateStatus_NotFound(t *testing.T) {
	store, _ := NewStore("")
	err := store.UpdateStatus("nonexistent", "closed")
	if err == nil {
		t.Error("UpdateStatus to nonexistent should error")
	}
}

func TestDelete(t *testing.T) {
	store, _ := NewStore("")
	store.Create("s1", "a1")
	store.Create("s2", "a1")

	err := store.Delete("s1")
	if err != nil {
		t.Fatalf("Delete failed: %v", err)
	}

	if store.Get("s1") != nil {
		t.Error("Get(s1) should return nil after delete")
	}
	if store.Get("s2") == nil {
		t.Error("Get(s2) should return the session")
	}

	byAgent := store.ListByAgent("a1")
	if len(byAgent) != 1 {
		t.Errorf("ListByAgent(a1) len = %d, want 1", len(byAgent))
	}
	if byAgent[0].ID != "s2" {
		t.Errorf("byAgent[0].ID = %q, want 's2'", byAgent[0].ID)
	}

	// Delete non-existent is not an error
	err = store.Delete("nonexistent")
	if err != nil {
		t.Errorf("Delete(nonexistent) should not error, got: %v", err)
	}
}

func TestDelete_Concurrent(t *testing.T) {
	store, _ := NewStore("")
	for i := 0; i < 20; i++ {
		store.Create("s-"+string(rune('0'+i)), "a1")
	}

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			store.Delete("s-" + string(rune('0'+i)))
		}(i)
	}
	wg.Wait()

	list := store.ListByAgent("a1")
	if len(list) != 0 {
		t.Errorf("ListByAgent(a1) len = %d, want 0", len(list))
	}
}

func TestDelete_ConcurrentReads(t *testing.T) {
	store, _ := NewStore("")
	for i := 0; i < 10; i++ {
		store.Create("s-"+string(rune('0'+i)), "a1")
	}

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(2)
		go func(i int) {
			defer wg.Done()
			store.Delete("s-" + string(rune('0'+i)))
		}(i)
		go func(i int) {
			defer wg.Done()
			store.ListByAgent("a1")
		}(i)
	}
	wg.Wait()
}

func TestSearch(t *testing.T) {
	store, _ := NewStore("")
	store.Create("s1", "a1")
	store.Create("s2", "a1")

	store.AddMessage("s1", Message{
		Role:    "user",
		Content: []ContentBlock{{Type: "text", Text: "How do I deploy?"}},
	})
	store.AddMessage("s2", Message{
		Role:    "assistant",
		Content: []ContentBlock{{Type: "text", Text: "You should check the logs."}},
	})

	results := store.Search("deploy")
	if results == nil || len(results) != 1 {
		t.Fatalf("Search('deploy') len = %v, want 1", len(results))
	}
	if results[0].ID != "s1" {
		t.Errorf("results[0].ID = %q, want 's1'", results[0].ID)
	}

	// Case insensitive
	results = store.Search("LOGS")
	if len(results) != 1 || results[0].ID != "s2" {
		t.Errorf("Search('LOGS') = %v, want [s2]", results)
	}

	// No match
	results = store.Search("nonexistent")
	if len(results) != 0 {
		t.Errorf("Search('nonexistent') len = %d, want 0", len(results))
	}
}

func TestSearch_Concurrent(t *testing.T) {
	store, _ := NewStore("")
	for i := 0; i < 10; i++ {
		store.Create("s-"+string(rune('0'+i)), "a1")
		store.AddMessage("s-"+string(rune('0'+i)), Message{
			Role:    "user",
			Content: []ContentBlock{{Type: "text", Text: "Message " + string(rune('0'+i))}},
		})
	}

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			store.Search("Message " + string(rune('0'+i%10)))
		}(i)
	}
	wg.Wait()
}

func TestSearch_NoDuplicates(t *testing.T) {
	store, _ := NewStore("")
	store.Create("s1", "a1")

	// Add multiple messages matching the same query in the same session
	store.AddMessage("s1", Message{
		Role:    "user",
		Content: []ContentBlock{{Type: "text", Text: "deploy the app"}},
	})
	store.AddMessage("s1", Message{
		Role:    "assistant",
		Content: []ContentBlock{{Type: "text", Text: "deploy to production"}},
	})

	results := store.Search("deploy")
	if len(results) != 1 {
		t.Errorf("Search should return 1 unique session, got %d", len(results))
	}
	if results[0].ID != "s1" {
		t.Errorf("expected session s1, got %s", results[0].ID)
	}
}

func TestGetStats(t *testing.T) {
	store, _ := NewStore("")

	stats := store.GetStats()
	if stats.TotalSessions != 0 {
		t.Errorf("TotalSessions = %d, want 0", stats.TotalSessions)
	}
	if stats.ActiveSessions != 0 {
		t.Errorf("ActiveSessions = %d, want 0", stats.ActiveSessions)
	}

	store.Create("s1", "a1")
	store.Create("s2", "a1")
	store.Create("s3", "a2")
	store.AddMessage("s1", Message{Role: "user", Content: []ContentBlock{{Type: "text", Text: "hi"}}})
	store.AddMessage("s1", Message{Role: "user", Content: []ContentBlock{{Type: "text", Text: "hi2"}}})
	store.UpdateStatus("s2", "closed")

	stats = store.GetStats()
	if stats.TotalSessions != 3 {
		t.Errorf("TotalSessions = %d, want 3", stats.TotalSessions)
	}
	if stats.ActiveSessions != 2 { // s1 + s3 (s2 is closed)
		t.Errorf("ActiveSessions = %d, want 2", stats.ActiveSessions)
	}
	if stats.TotalMessages != 2 {
		t.Errorf("TotalMessages = %d, want 2", stats.TotalMessages)
	}
	if stats.AgentCount != 2 {
		t.Errorf("AgentCount = %d, want 2", stats.AgentCount)
	}
}

func TestGetStats_Concurrent(t *testing.T) {
	store, _ := NewStore("")
	for i := 0; i < 20; i++ {
		store.Create("s-"+string(rune('0'+i)), "a1")
	}

	var wg sync.WaitGroup
	for i := 0; i < 30; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			stats := store.GetStats()
			if stats.TotalSessions != 20 {
				t.Errorf("TotalSessions = %d, want 20", stats.TotalSessions)
			}
		}()
	}
	wg.Wait()
}

func TestSetAndGetACPSessionID(t *testing.T) {
	store, _ := NewStore("")
	store.Create("s1", "a1")

	err := store.SetACPSessionID("s1", "acp-session-123")
	if err != nil {
		t.Fatalf("SetACPSessionID failed: %v", err)
	}

	id, err := store.GetACPSessionID("s1")
	if err != nil {
		t.Fatalf("GetACPSessionID failed: %v", err)
	}
	if string(id) != "acp-session-123" {
		t.Errorf("GetACPSessionID = %q, want 'acp-session-123'", string(id))
	}
}

func TestSetACPSessionID_NotFound(t *testing.T) {
	store, _ := NewStore("")
	err := store.SetACPSessionID("nonexistent", "acp-123")
	if err == nil {
		t.Error("SetACPSessionID to nonexistent should error")
	}
}

func TestGetACPSessionID_NotFound(t *testing.T) {
	store, _ := NewStore("")
	_, err := store.GetACPSessionID("nonexistent")
	if err == nil {
		t.Error("GetACPSessionID to nonexistent should error")
	}
}

func TestPersistToDisk(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore failed: %v", err)
	}

	store.Create("s1", "a1")
	store.AddMessage("s1", Message{Role: "user", Content: []ContentBlock{{Type: "text", Text: "hello"}}})
	store.UpdateStatus("s1", "closed")

	// Poll until the session file on disk has status "closed" AND the message
	// (race detector slows goroutines ~10x, making fixed sleep unreliable)
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		path := filepath.Join(tmpDir, "s1.json")
		data, err := os.ReadFile(path)
		if err == nil {
			var session Session
			if json.Unmarshal(data, &session) == nil && session.Status == "closed" && len(session.Messages) >= 1 {
				break
			}
		}
		time.Sleep(50 * time.Millisecond)
	}

	// Reload from disk
	store2, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore reload failed: %v", err)
	}

	session := store2.Get("s1")
	if session == nil {
		t.Fatal("Reloaded session s1 is nil")
	}
	if session.Status != "closed" {
		t.Errorf("Status = %q, want 'closed'", session.Status)
	}
	if len(session.Messages) != 1 {
		t.Errorf("len(Messages) = %d, want 1", len(session.Messages))
	}
	if len(session.Messages) > 0 && session.Messages[0].Content[0].Text != "hello" {
		t.Errorf("Content[0].Text = %q, want 'hello'", session.Messages[0].Content[0].Text)
	}
}

func TestPersistToDisk_Delete(t *testing.T) {
	tmpDir := t.TempDir()
	store, _ := NewStore("")
	store.Create("s1", "a1")
	time.Sleep(50 * time.Millisecond)
	store.Delete("s1")
	time.Sleep(100 * time.Millisecond)

	store2, _ := NewStore(tmpDir)
	if store2.Get("s1") != nil {
		t.Error("Deleted session should not reload from disk")
	}
}

func TestPersistToDisk_Concurrent(t *testing.T) {
	tmpDir := t.TempDir()
	store, _ := NewStore(tmpDir)

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			store.Create("s-"+string(rune('0'+i)), "a1")
			store.AddMessage("s-"+string(rune('0'+i)), Message{
				Role:    "user",
				Content: []ContentBlock{{Type: "text", Text: "msg"}},
			})
		}(i)
	}
	wg.Wait()

	// Poll for all 10 valid session files (race detector slows I/O by ~10x)
	deadline := time.Now().Add(15 * time.Second)
	var lastErr string
	for time.Now().Before(deadline) {
		entries, err := os.ReadDir(tmpDir)
		if err == nil {
			validCount := 0
			for _, e := range entries {
				if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
					continue
				}
				// Verify file content is valid JSON
				data, readErr := os.ReadFile(filepath.Join(tmpDir, e.Name()))
				if readErr == nil {
					var session Session
					if json.Unmarshal(data, &session) == nil {
						validCount++
					}
				}
			}
			if validCount >= 10 {
				break
			}
			lastErr = fmt.Sprintf("only %d valid files after %v", validCount, time.Since(time.Now().Add(-15*time.Second)))
		}
		time.Sleep(100 * time.Millisecond)
	}
	if lastErr != "" {
		t.Logf("Warning: %s", lastErr)
	}

	store2, _ := NewStore(tmpDir)
	if len(store2.List()) != 10 {
		t.Errorf("Reloaded store has %d sessions, want 10", len(store2.List()))
	}
}

// Benchmark tests
func BenchmarkCreate(b *testing.B) {
	store, _ := NewStore("")
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		store.Create("s-"+string(rune('0'+(i%10))), "a1")
	}
}

func BenchmarkListByAgent(b *testing.B) {
	store, _ := NewStore("")
	for i := 0; i < 100; i++ {
		store.Create("s-"+string(rune('0'+(i%10))), "a1")
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		store.ListByAgent("a1")
	}
}

func BenchmarkGetStats(b *testing.B) {
	store, _ := NewStore("")
	for i := 0; i < 100; i++ {
		store.Create("s-"+string(rune('0'+(i%10))), "a1")
		store.AddMessage("s-"+string(rune('0'+(i%10))), Message{
			Role:    "user",
			Content: []ContentBlock{{Type: "text", Text: "msg"}},
		})
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		store.GetStats()
	}
}

func TestClose_Idempotent(t *testing.T) {
	store, _ := NewStore("")
	if err := store.Close(); err != nil {
		t.Fatalf("Close failed: %v", err)
	}
	// Second close should be no-op
	if err := store.Close(); err != nil {
		t.Fatalf("second Close should not error, got: %v", err)
	}
}

func TestClose_AfterCreate(t *testing.T) {
	store, _ := NewStore("")
	store.Create("s1", "a1")
	if err := store.Close(); err != nil {
		t.Fatalf("Close failed: %v", err)
	}
}

func TestWaitForWrites(t *testing.T) {
	store, _ := NewStore("")
	store.Create("s1", "a1")
	store.AddMessage("s1", Message{Role: "user", Content: []ContentBlock{{Type: "text", Text: "hello"}}})
	// WaitForWrites should not block indefinitely
	store.WaitForWrites()
}

func TestWaitForWrites_Empty(t *testing.T) {
	store, _ := NewStore("")
	store.WaitForWrites()
}

func TestCreate_InvalidSessionID(t *testing.T) {
	tests := []struct {
		name string
		id   string
	}{
		{"empty", ""},
		{"path traversal", "../etc/passwd"},
		{"forward slash", "foo/bar"},
		{"backslash", "foo\\bar"},
		{"too long", strings.Repeat("a", 257)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store, _ := NewStore("")
			session := store.Create(tt.id, "a1")
			if session != nil {
				t.Errorf("Create(%q) should return nil for invalid ID", tt.id)
			}
		})
	}
}

func TestAddMessage_StoreClosed(t *testing.T) {
	store, _ := NewStore("")
	store.Create("s1", "a1")
	store.Close()
	err := store.AddMessage("s1", Message{Role: "user", Content: []ContentBlock{{Type: "text", Text: "hi"}}})
	if err == nil {
		t.Error("AddMessage on closed store should error")
	}
}

func TestUpdateStatus_StoreClosed(t *testing.T) {
	store, _ := NewStore("")
	store.Create("s1", "a1")
	store.Close()
	err := store.UpdateStatus("s1", "closed")
	if err == nil {
		t.Error("UpdateStatus on closed store should error")
	}
}

func TestLoadFromDisk_InvalidJSON(t *testing.T) {
	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "bad-session.json")
	if err := os.WriteFile(path, []byte("not json{{{"), 0644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	if store.Get("bad-session") != nil {
		t.Error("invalid JSON session should not be loaded")
	}
}

func TestLoadFromDisk_InvalidSessionID(t *testing.T) {
	tmpDir := t.TempDir()
	session := &Session{
		ID:        "../etc/passwd",
		AgentID:   "evil",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		Messages:  []Message{},
		Status:    "active",
		Metadata:  map[string]any{},
	}
	data, _ := json.Marshal(session)
	path := filepath.Join(tmpDir, "evil.json")
	os.WriteFile(path, data, 0644)

	store, _ := NewStore(tmpDir)
	if store.Get("../etc/passwd") != nil {
		t.Error("session with path traversal ID should be skipped")
	}
}

func TestLoadFromDisk_NonJSONFiles(t *testing.T) {
	tmpDir := t.TempDir()
	os.WriteFile(filepath.Join(tmpDir, "readme.txt"), []byte("hello"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "data.csv"), []byte("a,b"), 0644)

	store, _ := NewStore(tmpDir)
	if len(store.List()) != 0 {
		t.Error("non-JSON files should be skipped")
	}
}

func TestLoadFromDisk_Subdirectories(t *testing.T) {
	tmpDir := t.TempDir()
	os.MkdirAll(filepath.Join(tmpDir, "subdir"), 0755)

	store, _ := NewStore(tmpDir)
	if len(store.List()) != 0 {
		t.Error("subdirectories should be skipped")
	}
}

func TestDeleteFromDisk_Nonexistent(t *testing.T) {
	tmpDir := t.TempDir()
	store, _ := NewStore(tmpDir)
	// deleteFromDisk on a nonexistent file should not error
	// We can't call it directly, but Delete on nonexistent session is already tested
	store.Delete("nonexistent-session")
}

func TestDeleteFromDisk_WithDisk(t *testing.T) {
	tmpDir := t.TempDir()
	store, _ := NewStore(tmpDir)
	store.Create("s1", "a1")
	store.WaitForWrites()

	// Verify file exists
	path := filepath.Join(tmpDir, "s1.json")
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("expected s1.json to exist: %v", err)
	}

	store.Delete("s1")

	// File should be removed
	if _, err := os.Stat(path); err == nil {
		t.Error("s1.json should be deleted after Delete")
	}
}

func TestWriteFileSync_EmptyDataDir(t *testing.T) {
	store, _ := NewStore("")
	// With empty dataDir, writes should be silently skipped
	store.Create("s1", "a1")
	store.WaitForWrites()
}

func TestEnqueueWrite_EmptyDataDir(t *testing.T) {
	store, _ := NewStore("")
	// enqueueWrite with empty dataDir is a no-op
	store.WaitForWrites()
}

func TestValidateSessionID(t *testing.T) {
	tests := []struct {
		id    string
		valid bool
	}{
		{"session-1", true},
		{"abc_123", true},
		{"", false},
		{strings.Repeat("a", 256), true},      // exactly at limit
		{strings.Repeat("a", 257), false},     // over limit
		{"../etc/passwd", false},              // path traversal
		{"foo/bar", false},                    // forward slash
		{"foo\\bar", false},                   // backslash
		{"normal-session-id", true},
	}
	for _, tt := range tests {
		t.Run(tt.id, func(t *testing.T) {
			err := validateSessionID(tt.id)
			if tt.valid && err != nil {
				t.Errorf("validateSessionID(%q) unexpected error: %v", tt.id, err)
			}
			if !tt.valid && err == nil {
				t.Errorf("validateSessionID(%q) expected error, got nil", tt.id)
			}
		})
	}
}

func TestCopySession(t *testing.T) {
	original := &Session{
		ID:        "copy-test",
		AgentID:   "agent-1",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		Status:    "active",
		Messages: []Message{
			{ID: "m1", Role: "user", Content: []ContentBlock{{Type: "text", Text: "hello"}}},
		},
		Metadata: map[string]any{"key": "value"},
	}

	copy := copySession(original)
	if copy == nil {
		t.Fatal("copySession returned nil")
	}
	if copy.ID != original.ID {
		t.Errorf("copy.ID = %q, want %q", copy.ID, original.ID)
	}
	if copy.Status != original.Status {
		t.Errorf("copy.Status = %q, want %q", copy.Status, original.Status)
	}
	if len(copy.Messages) != len(original.Messages) {
		t.Errorf("copy.Messages len = %d, want %d", len(copy.Messages), len(original.Messages))
	}

	// Verify deep copy — mutating original should not affect copy
	original.Messages[0].Content[0].Text = "modified"
	if copy.Messages[0].Content[0].Text == "modified" {
		t.Error("copy should be independent of original")
	}
}

func TestMessageStruct(t *testing.T) {
	msg := Message{
		ID:        "msg-1",
		Role:      "user",
		CreatedAt: time.Now(),
		Metadata:  map[string]any{"source": "test"},
		Content: []ContentBlock{
			{Type: "text", Text: "hello"},
			{Type: "resource", Resource: &Resource{URI: "file:///test.go", MimeType: "text/x-go"}},
			{Type: "image", Image: &ImageData{URL: "http://example.com/img.png", Format: "png"}},
		},
	}
	if msg.ID != "msg-1" {
		t.Errorf("expected msg-1, got %s", msg.ID)
	}
	if len(msg.Content) != 3 {
		t.Errorf("expected 3 content blocks, got %d", len(msg.Content))
	}
}

func TestStoreStats_Struct(t *testing.T) {
	stats := StoreStats{
		TotalSessions:  10,
		ActiveSessions: 5,
		TotalMessages:  100,
		AgentCount:     3,
	}
	if stats.TotalSessions != 10 || stats.ActiveSessions != 5 {
		t.Error("StoreStats fields mismatch")
	}
}

func TestAddMessage_MetadataInitialized(t *testing.T) {
	store, _ := NewStore("")
	store.Create("s1", "a1")

	// Message with nil metadata should get auto-initialized
	err := store.AddMessage("s1", Message{Role: "user", Content: []ContentBlock{{Type: "text", Text: "hi"}}})
	if err != nil {
		t.Fatalf("AddMessage failed: %v", err)
	}

	session := store.Get("s1")
	if session == nil {
		t.Fatal("Get returned nil")
	}
	if session.Messages[0].Metadata == nil {
		t.Error("message Metadata should be auto-initialized")
	}
}

var _ = sort.IsSorted // Ensure sort is used

func TestStore_WriteFileSync_Success(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	sessionID := "test-session-1"
	data := []byte(`{"id":"test-session-1","status":"active"}`)

	store.writeFileSync(sessionID, data)

	// Verify file was created
	path := filepath.Join(tmpDir, sessionID+".json")
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("file not created: %v", err)
	}
	if string(content) != string(data) {
		t.Errorf("file content mismatch: got %q, want %q", string(content), string(data))
	}
}

func TestStore_WriteFileSync_EmptyDataDir(t *testing.T) {
	// Store with empty dataDir should not write
	store, err := NewStore("")
	if err != nil {
		t.Fatal(err)
	}

	// This should return early without error
	store.writeFileSync("test-session", []byte("data"))
	// No assertion needed - just ensuring no panic
}

func TestStore_WriteFileSync_InvalidDataDir(t *testing.T) {
	// Create a file where directory should be
	tmpFile, err := os.CreateTemp("", "store_test_*.json")
	if err != nil {
		t.Fatal(err)
	}
	tmpPath := tmpFile.Name()
	tmpFile.Close()
	defer os.Remove(tmpPath)

	// Create store with a path that's a file, not directory
	store := &Store{
		dataDir: tmpPath, // This is a file, not a directory
	}

	// writeFileSync should handle the error gracefully
	store.writeFileSync("test-session", []byte("data"))
	// No panic = success
}

func TestStore_WriteFileSync_Overwrite(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	sessionID := "overwrite-test"

	// First write
	store.writeFileSync(sessionID, []byte(`{"version":1}`))

	// Second write should overwrite
	store.writeFileSync(sessionID, []byte(`{"version":2}`))

	// Verify content is from second write
	path := filepath.Join(tmpDir, sessionID+".json")
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("file not found: %v", err)
	}
	if !strings.Contains(string(content), `"version":2`) {
		t.Errorf("expected version:2, got %s", string(content))
	}
}

func TestStore_WriteFileSync_FilePermissions(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := NewStore(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	sessionID := "perm-test"
	store.writeFileSync(sessionID, []byte(`{"id":"perm-test"}`))

	path := filepath.Join(tmpDir, sessionID+".json")
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("file not found: %v", err)
	}

	// File should have restricted permissions (0600)
	expectedPerm := os.FileMode(0600)
	if info.Mode().Perm() != expectedPerm {
		t.Errorf("expected permissions %o, got %o", expectedPerm, info.Mode().Perm())
	}
}
