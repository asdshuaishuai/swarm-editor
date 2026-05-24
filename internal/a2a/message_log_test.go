package a2a

import (
	"encoding/json"
	"sync"
	"testing"
)

func TestMessageLog_NewDefault(t *testing.T) {
	log := NewMessageLog(0)
	if log == nil {
		t.Fatal("expected non-nil log")
	}
	if log.cap != 1000 {
		t.Errorf("expected default capacity 1000, got %d", log.cap)
	}
}

func TestMessageLog_NewCustomCapacity(t *testing.T) {
	log := NewMessageLog(50)
	if log.cap != 50 {
		t.Errorf("expected capacity 50, got %d", log.cap)
	}
}

func TestMessageLog_AppendAndRecent(t *testing.T) {
	log := NewMessageLog(10)
	msg := &Message{
		ID:      "m1",
		Type:    MessageTypeTaskRequest,
		From:    "agent-1",
		To:      "agent-2",
		Payload: json.RawMessage(`{"key":"value"}`),
	}
	log.Append(msg)

	entries := log.Recent(1)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].ID != "m1" {
		t.Errorf("expected ID m1, got %s", entries[0].ID)
	}
	if entries[0].From != "agent-1" {
		t.Errorf("expected From agent-1, got %s", entries[0].From)
	}
	if entries[0].Type != MessageTypeTaskRequest {
		t.Errorf("expected type request, got %s", entries[0].Type)
	}
}

func TestMessageLog_AppendNil(t *testing.T) {
	log := NewMessageLog(10)
	log.Append(nil)
	if log.Len() != 0 {
		t.Error("expected 0 entries after appending nil")
	}
}

func TestMessageLog_Overflow(t *testing.T) {
	log := NewMessageLog(3)
	for i := 0; i < 5; i++ {
		log.Append(&Message{ID: string(rune('a' + i)), Type: MessageTypeTaskRequest, From: "a", To: "b"})
	}
	if log.Len() != 3 {
		t.Errorf("expected 3 entries (capacity), got %d", log.Len())
	}
	entries := log.Recent(10)
	if entries[0].ID != "c" {
		t.Errorf("expected oldest entry 'c', got %s", entries[0].ID)
	}
	if entries[2].ID != "e" {
		t.Errorf("expected newest entry 'e', got %s", entries[2].ID)
	}
}

func TestMessageLog_RecentZero(t *testing.T) {
	log := NewMessageLog(5)
	log.Append(&Message{ID: "m1", Type: MessageTypeTaskRequest, From: "a", To: "b"})
	entries := log.Recent(0)
	if len(entries) != 1 {
		t.Errorf("expected 1 entry (n=0 returns all), got %d", len(entries))
	}
}

func TestMessageLog_RecentMoreThanCount(t *testing.T) {
	log := NewMessageLog(5)
	log.Append(&Message{ID: "m1", Type: MessageTypeTaskRequest, From: "a", To: "b"})
	entries := log.Recent(100)
	if len(entries) != 1 {
		t.Errorf("expected 1 entry, got %d", len(entries))
	}
}

func TestMessageLog_Len(t *testing.T) {
	log := NewMessageLog(10)
	if log.Len() != 0 {
		t.Error("expected 0 initially")
	}
	log.Append(&Message{ID: "m1", Type: MessageTypeTaskRequest, From: "a", To: "b"})
	log.Append(&Message{ID: "m2", Type: MessageTypeTaskComplete, From: "b", To: "a"})
	if log.Len() != 2 {
		t.Errorf("expected 2, got %d", log.Len())
	}
}

func TestMessageLog_Clear(t *testing.T) {
	log := NewMessageLog(10)
	log.Append(&Message{ID: "m1", Type: MessageTypeTaskRequest, From: "a", To: "b"})
	log.Clear()
	if log.Len() != 0 {
		t.Errorf("expected 0 after clear, got %d", log.Len())
	}
}

func TestMessageLog_Stats(t *testing.T) {
	log := NewMessageLog(10)
	log.Append(&Message{ID: "m1", Type: MessageTypeTaskRequest, From: "a", To: "b"})
	log.Append(&Message{ID: "m2", Type: MessageTypeTaskRequest, From: "b", To: "a"})
	log.Append(&Message{ID: "m3", Type: MessageTypeTaskComplete, From: "a", To: "b"})

	stats := log.Stats()
	if stats["totalEntries"] != 3 {
		t.Errorf("expected totalEntries=3, got %v", stats["totalEntries"])
	}
	byType, ok := stats["byType"].(map[string]int)
	if !ok {
		t.Fatal("expected byType to be map[string]int")
	}
	if byType[string(MessageTypeTaskRequest)] != 2 {
		t.Errorf("expected 2 requests, got %d", byType[string(MessageTypeTaskRequest)])
	}
	if byType[string(MessageTypeTaskComplete)] != 1 {
		t.Errorf("expected 1 complete, got %d", byType[string(MessageTypeTaskComplete)])
	}
}

func TestMessageLog_Group(t *testing.T) {
	log := NewMessageLog(10)
	log.Append(&Message{ID: "m1", Type: MessageTypeTaskRequest, From: "a", To: "b", Group: "team-1"})
	entries := log.Recent(1)
	if entries[0].Group != "team-1" {
		t.Errorf("expected group team-1, got %s", entries[0].Group)
	}
}

func TestMessageLog_ConcurrentAccess(t *testing.T) {
	log := NewMessageLog(100)
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			log.Append(&Message{ID: string(rune(id)), Type: MessageTypeTaskRequest, From: "a", To: "b"})
		}(i)
	}
	wg.Wait()
	if log.Len() != 50 {
		t.Errorf("expected 50 entries, got %d", log.Len())
	}
}

func TestMessageLog_SingleCapacity(t *testing.T) {
	log := NewMessageLog(1)
	log.Append(&Message{ID: "m1", Type: MessageTypeTaskRequest, From: "a", To: "b"})
	log.Append(&Message{ID: "m2", Type: MessageTypeTaskComplete, From: "b", To: "a"})
	if log.Len() != 1 {
		t.Errorf("expected 1 entry, got %d", log.Len())
	}
	entries := log.Recent(1)
	if entries[0].ID != "m2" {
		t.Errorf("expected newest m2, got %s", entries[0].ID)
	}
}
