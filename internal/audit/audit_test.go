package audit

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestNewLogger(t *testing.T) {
	l := NewLogger("", 100)
	if l == nil {
		t.Fatal("expected non-nil logger")
	}
	if !l.IsEnabled() {
		t.Error("expected logger to be enabled by default")
	}
	if l.GetEventCount() != 0 {
		t.Error("expected empty logger")
	}
}

func TestLogger_Log(t *testing.T) {
	l := NewLogger("", 100)

	l.Log("api", "user1", "create", "workflow", "wf-123", map[string]any{"name": "test"}, true, "")

	if l.GetEventCount() != 1 {
		t.Fatalf("expected 1 event, got %d", l.GetEventCount())
	}

	events := l.GetEvents(nil)
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].Actor != "user1" {
		t.Errorf("expected actor user1, got %s", events[0].Actor)
	}
	if events[0].Action != "create" {
		t.Errorf("expected action create, got %s", events[0].Action)
	}
	if !events[0].Success {
		t.Error("expected success=true")
	}
	if events[0].Error != "" {
		t.Error("expected no error")
	}
}

func TestLogger_LogWithError(t *testing.T) {
	l := NewLogger("", 100)

	l.Log("api", "user1", "delete", "workflow", "wf-456", nil, false, "not found")

	events := l.GetEvents(nil)
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].Success {
		t.Error("expected success=false")
	}
	if events[0].Error != "not found" {
		t.Errorf("expected error 'not found', got %s", events[0].Error)
	}
}

func TestLogger_LogWithMetadata(t *testing.T) {
	l := NewLogger("", 100)

	l.LogWithMetadata("api", "user1", "update", "agent", "agent-1", nil, true, "", "192.168.1.1", "TestClient/1.0")

	events := l.GetEvents(nil)
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].IPAddress != "192.168.1.1" {
		t.Errorf("expected IP, got %s", events[0].IPAddress)
	}
	if events[0].UserAgent != "TestClient/1.0" {
		t.Errorf("expected UserAgent, got %s", events[0].UserAgent)
	}
}

func TestLogger_EnableDisable(t *testing.T) {
	l := NewLogger("", 100)

	l.Log("api", "user1", "create", "workflow", "wf-1", nil, true, "")
	if l.GetEventCount() != 1 {
		t.Fatalf("expected 1 event, got %d", l.GetEventCount())
	}

	l.Enable(false)
	l.Log("api", "user1", "create", "workflow", "wf-2", nil, true, "")
	if l.GetEventCount() != 1 {
		t.Errorf("expected 1 event (logging disabled), got %d", l.GetEventCount())
	}

	l.Enable(true)
	l.Log("api", "user1", "create", "workflow", "wf-3", nil, true, "")
	if l.GetEventCount() != 2 {
		t.Errorf("expected 2 events, got %d", l.GetEventCount())
	}
}

func TestLogger_Filter(t *testing.T) {
	l := NewLogger("", 100)

	l.Log("api", "user1", "create", "workflow", "wf-1", nil, true, "")
	l.Log("api", "user2", "create", "workflow", "wf-2", nil, true, "")
	l.Log("api", "user1", "delete", "workflow", "wf-3", nil, false, "error")

	// Filter by actor
	events := l.GetEvents(&Filter{Actor: "user1"})
	if len(events) != 2 {
		t.Errorf("expected 2 events for user1, got %d", len(events))
	}

	// Filter by action
	events = l.GetEvents(&Filter{Action: "create"})
	if len(events) != 2 {
		t.Errorf("expected 2 create events, got %d", len(events))
	}

	// Filter by success
	success := true
	events = l.GetEvents(&Filter{Success: &success})
	if len(events) != 2 {
		t.Errorf("expected 2 successful events, got %d", len(events))
	}

	// Filter by resource type
	events = l.GetEvents(&Filter{ResourceType: "workflow"})
	if len(events) != 3 {
		t.Errorf("expected 3 workflow events, got %d", len(events))
	}

	// Filter by resource ID
	events = l.GetEvents(&Filter{ResourceID: "wf-1"})
	if len(events) != 1 {
		t.Errorf("expected 1 event for wf-1, got %d", len(events))
	}
}

func TestLogger_FilterByTime(t *testing.T) {
	l := NewLogger("", 100)

	before := time.Now().Add(-time.Hour)
	l.Log("api", "user1", "create", "workflow", "wf-1", nil, true, "")
	after := time.Now().Add(time.Hour)

	// Filter with time range
	events := l.GetEvents(&Filter{StartTime: before, EndTime: after})
	if len(events) != 1 {
		t.Errorf("expected 1 event in time range, got %d", len(events))
	}

	// Filter with start time after event
	events = l.GetEvents(&Filter{StartTime: after})
	if len(events) != 0 {
		t.Errorf("expected 0 events after future time, got %d", len(events))
	}
}

func TestLogger_FilterLimit(t *testing.T) {
	l := NewLogger("", 100)

	// Log 10 events
	for i := 0; i < 10; i++ {
		l.Log("api", "user1", "create", "workflow", "wf", nil, true, "")
	}

	// Request only 5 events
	events := l.GetEvents(&Filter{Limit: 5})
	if len(events) != 5 {
		t.Errorf("expected 5 events with limit, got %d", len(events))
	}

	// Request more than available
	events = l.GetEvents(&Filter{Limit: 20})
	if len(events) != 10 {
		t.Errorf("expected 10 events (all available) with limit=20, got %d", len(events))
	}

	// Zero limit means unlimited
	events = l.GetEvents(&Filter{Limit: 0})
	if len(events) != 10 {
		t.Errorf("expected 10 events with limit=0 (unlimited), got %d", len(events))
	}
}

func TestLogger_Rotation(t *testing.T) {
	l := NewLogger("", 10) // small max size for testing

	for i := 0; i < 20; i++ {
		l.Log("api", "user1", "create", "workflow", "wf", map[string]any{"i": i}, true, "")
	}

	// Should have rotated to ~5 events (half of maxSize)
	if l.GetEventCount() > 10 {
		t.Errorf("expected rotation to reduce events, got %d", l.GetEventCount())
	}
}

func TestLogger_Clear(t *testing.T) {
	l := NewLogger("", 100)

	l.Log("api", "user1", "create", "workflow", "wf-1", nil, true, "")
	if l.GetEventCount() != 1 {
		t.Fatal("expected 1 event")
	}

	l.Clear()
	if l.GetEventCount() != 0 {
		t.Error("expected empty logger after clear")
	}
}

func TestLogger_FilePersistence(t *testing.T) {
	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "audit.log")

	l := NewLogger(filePath, 100)

	l.Log("api", "user1", "create", "workflow", "wf-1", map[string]any{"test": true}, true, "")

	// Check file was created
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		t.Fatal("expected audit log file to be created")
	}

	// Read file content
	data, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("failed to read audit file: %v", err)
	}
	if len(data) == 0 {
		t.Error("expected non-empty audit file")
	}
}

func TestLogger_MarshalJSON(t *testing.T) {
	l := NewLogger("", 100)

	l.Log("api", "user1", "create", "workflow", "wf-1", nil, true, "")

	data, err := l.MarshalJSON()
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	if len(data) == 0 {
		t.Error("expected non-empty JSON")
	}
}

func TestFilter_Match(t *testing.T) {
	now := time.Now().UTC()
	event := Event{
		Timestamp:    now,
		EventType:    "api",
		Actor:        "user1",
		Action:       "create",
		ResourceType: "workflow",
		ResourceID:   "wf-1",
		Success:      true,
	}

	tests := []struct {
		name   string
		filter Filter
		expect bool
	}{
		{"no filter", Filter{}, true},
		{"match event type", Filter{EventType: "api"}, true},
		{"wrong event type", Filter{EventType: "system"}, false},
		{"match actor", Filter{Actor: "user1"}, true},
		{"wrong actor", Filter{Actor: "user2"}, false},
		{"match resource type", Filter{ResourceType: "workflow"}, true},
		{"match resource ID", Filter{ResourceID: "wf-1"}, true},
		{"match success true", Filter{Success: ptrBool(true)}, true},
		{"match success false", Filter{Success: ptrBool(false)}, false},
		{"time range inside", Filter{StartTime: now.Add(-time.Hour), EndTime: now.Add(time.Hour)}, true},
		{"time range before", Filter{StartTime: now.Add(time.Hour), EndTime: now.Add(2 * time.Hour)}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.filter.Match(event); got != tt.expect {
				t.Errorf("expected %v, got %v", tt.expect, got)
			}
		})
	}
}

func ptrBool(b bool) *bool {
	return &b
}

func TestRedactEvent(t *testing.T) {
	tests := []struct {
		name    string
		details map[string]any
		want    map[string]any
	}{
		{
			name:    "nil details",
			details: nil,
			want:    nil,
		},
		{
			name:    "empty details",
			details: map[string]any{},
			want:    map[string]any{},
		},
		{
			name: "redact password key",
			details: map[string]any{
				"password": "super_secret_123",
				"name":     "test",
			},
			want: map[string]any{
				"password": "[REDACTED]",
				"name":     "test",
			},
		},
		{
			name: "redact token key",
			details: map[string]any{
				"access_token": "ghp_xxxx",
			},
			want: map[string]any{
				"access_token": "[REDACTED]",
			},
		},
		{
			name: "redact api_key key",
			details: map[string]any{
				"api_key": "sk-xxxx",
			},
			want: map[string]any{
				"api_key": "[REDACTED]",
			},
		},
		{
			name: "case insensitive key matching",
			details: map[string]any{
				"API_KEY": "sk-xxxx",
			},
			want: map[string]any{
				"API_KEY": "[REDACTED]",
			},
		},
		{
			name: "non-sensitive keys preserved",
			details: map[string]any{
				"username": "admin",
				"count":    42,
			},
			want: map[string]any{
				"username": "admin",
				"count":    42,
			},
		},
		{
			name: "redact string values containing key=value patterns",
			details: map[string]any{
				"config": "password=hunter2, user=admin",
			},
			want: map[string]any{
				"config": "password=[REDACTED], user=admin",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			event := Event{Details: tt.details}
			got := redactEvent(event)
			if tt.want == nil {
				if got.Details != nil {
					t.Errorf("expected nil details, got %v", got.Details)
				}
				return
			}
			if len(got.Details) != len(tt.want) {
				t.Errorf("expected %d details, got %d", len(tt.want), len(got.Details))
			}
			for k, wantV := range tt.want {
				gotV, ok := got.Details[k]
				if !ok {
					t.Errorf("missing key %q", k)
					continue
				}
				if gotV != wantV {
					t.Errorf("key %q: expected %v, got %v", k, wantV, gotV)
				}
			}
		})
	}
}

func TestRedactEvent_DoesNotModifyOriginal(t *testing.T) {
	details := map[string]any{
		"password": "secret123",
		"name":     "test",
	}
	event := Event{Details: details}
	redactEvent(event)
	// Original should be unchanged
	if details["password"] != "secret123" {
		t.Error("redactEvent should not modify original Details map")
	}
}

func TestRedactString(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "no sensitive content",
			input: "hello world",
			want:  "hello world",
		},
		{
			name:  "password with equals",
			input: "password=hunter2",
			want:  "password=[REDACTED]",
		},
		{
			name:  "token with colon",
			input: "token: abc123",
			want:  "token: [REDACTED]",
		},
		{
			name:  "multiple sensitive values",
			input: "password=x, token=y",
			want:  "password=[REDACTED], token=[REDACTED]",
		},
		{
			name:  "non-sensitive key not redacted",
			input: "username=admin",
			want:  "username=admin",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := redactString(tt.input); got != tt.want {
				t.Errorf("expected %q, got %q", tt.want, got)
			}
		})
	}
}

func TestFindValueStart(t *testing.T) {
	tests := []struct {
		name       string
		input      string
		patternIdx int
		pattern    string
		want       int
	}{
		{"pattern found at start", "password=secret", 0, "password", 9},
		{"pattern found in middle", "user=admin password=secret", 11, "password", 20},
		{"pattern not found", "user=admin", 0, "token", -1},
		{"pattern at end without separator", "user=admin password", 11, "password", -1},
		{"pattern with colon separator", "token: value", 0, "token", 7},
		{"pattern with equals separator", `key="value"`, 0, "key", 5},
		{"empty string", "", 0, "password", -1},
		{"pattern at end of string", "prefix password", 7, "password", -1}, // no separator after pattern
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := findValueStart(tt.input, tt.patternIdx, tt.pattern); got != tt.want {
				t.Errorf("findValueStart(%q, %d, %q) = %d, want %d", tt.input, tt.patternIdx, tt.pattern, got, tt.want)
			}
		})
	}
}

func TestFindValueEnd(t *testing.T) {
	tests := []struct {
		name  string
		input string
		pos   int
		want  int
	}{
		{"simple value", "password=secret", 9, 15},
		{"value with comma", "key=value,other=data", 4, 9},
		{"value with space", "key=value other", 4, 9},
		{"value at end", "token=xyz", 6, 9},
		{"pos beyond string", "short", 10, 10},
		{"value with quote at end", `key=value"`, 4, 9}, // quote stops the scan
		{"empty after pos", "key=", 4, 4},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := findValueEnd(tt.input, tt.pos); got != tt.want {
				t.Errorf("findValueEnd(%q, %d) = %d, want %d", tt.input, tt.pos, got, tt.want)
			}
		})
	}
}

func TestLogger_AppendToFile_InvalidPath(t *testing.T) {
	// Test appendToFile with an invalid file path (directory that doesn't exist)
	// This tests the error path where os.OpenFile fails
	l := NewLogger("/nonexistent/directory/audit.log", 100)

	// Log should still succeed in memory even if file write fails
	l.Log("api", "user1", "create", "workflow", "wf-1", nil, true, "")

	// Event should be in memory
	if l.GetEventCount() != 1 {
		t.Errorf("expected 1 event in memory, got %d", l.GetEventCount())
	}
}

func TestLogger_AppendToFile_MarshalError(t *testing.T) {
	// Test appendToFile with a value that cannot be marshaled to JSON
	// Create a circular reference which causes json.Marshal to fail
	type Circular struct {
		Self *Circular
	}
	circular := &Circular{}
	circular.Self = circular

	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "audit.log")
	l := NewLogger(filePath, 100)

	// Log with circular reference in details - should trigger marshal error path
	l.Log("api", "user1", "create", "workflow", "wf-1", map[string]any{"circular": circular}, true, "")

	// Event should still be in memory (file write may have failed silently)
	if l.GetEventCount() != 1 {
		t.Errorf("expected 1 event in memory, got %d", l.GetEventCount())
	}
}

func TestLogger_Rotate_LargeEvents(t *testing.T) {
	// Test rotation with large number of events
	l := NewLogger("", 20)

	for i := 0; i < 100; i++ {
		l.Log("api", "user1", "create", "workflow", "wf", map[string]any{"index": i}, true, "")
	}

	// Should have rotated - count should be less than 100
	if l.GetEventCount() > 50 {
		t.Errorf("expected rotation to reduce events, got %d", l.GetEventCount())
	}
}

func TestCopyMapAny(t *testing.T) {
	tests := []struct {
		name string
		src  map[string]any
		want map[string]any
	}{
		{"nil map", nil, nil},
		{"empty map", map[string]any{}, map[string]any{}},
		{"simple map", map[string]any{"key": "value"}, map[string]any{"key": "value"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := copyMapAny(tt.src)

			if tt.want == nil {
				if got != nil {
					t.Errorf("expected nil, got %v", got)
				}
				return
			}

			// Verify contents match
			for k, v := range tt.want {
				if got[k] != v {
					t.Errorf("key %q: expected %v, got %v", k, v, got[k])
				}
			}

			// Verify it's a copy (modifying copy doesn't affect original)
			if len(got) > 0 {
				got["__test_key__"] = "test"
				if _, exists := tt.src["__test_key__"]; exists {
					t.Error("modifying copy should not affect original")
				}
			}
		})
	}
}

func TestCopyMapAny_Nested(t *testing.T) {
	src := map[string]any{"outer": map[string]any{"inner": 123}}
	got := copyMapAny(src)

	if len(got) != len(src) {
		t.Errorf("expected %d keys, got %d", len(src), len(got))
	}

	// Verify nested structure exists
	outer, ok := got["outer"].(map[string]any)
	if !ok {
		t.Fatal("expected 'outer' to be a map")
	}
	if outer["inner"] != 123 {
		t.Errorf("expected inner=123, got %v", outer["inner"])
	}
}
