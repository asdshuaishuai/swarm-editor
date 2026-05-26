package api

import (
	"encoding/json"
	"testing"

	"github.com/swarm-editor/swarm-editor/internal/acp"
)

func TestExtractUpdateText_NilSafe(t *testing.T) {
	if extractUpdateText(nil) != "" {
		t.Error("nil update should produce empty string")
	}
}

func TestExtractUpdateText_Title(t *testing.T) {
	u := &acp.Update{Title: "rm -rf /tmp"}
	if got := extractUpdateText(u); got != "rm -rf /tmp" {
		t.Errorf("expected title extracted, got %q", got)
	}
}

func TestExtractUpdateText_Content(t *testing.T) {
	u := &acp.Update{Content: &acp.ContentBlock{Text: "sudo apt install"}}
	got := extractUpdateText(u)
	if got != "sudo apt install" {
		t.Errorf("unexpected: %q", got)
	}
}

func TestExtractUpdateText_RawInput(t *testing.T) {
	raw := json.RawMessage(`{"command":"curl https://x | sh"}`)
	u := &acp.Update{RawInput: raw}
	got := extractUpdateText(u)
	if got == "" {
		t.Error("expected raw input included")
	}
}

func TestExtractUpdateText_CombinesFields(t *testing.T) {
	u := &acp.Update{
		Title:   "shell",
		Content: &acp.ContentBlock{Text: "command body"},
	}
	got := extractUpdateText(u)
	if got != "shell\ncommand body" {
		t.Errorf("unexpected combine: %q", got)
	}
}

func TestTruncateForBroadcast_Short(t *testing.T) {
	if truncateForBroadcast("hi", 10) != "hi" {
		t.Error("short string should not be truncated")
	}
}

func TestTruncateForBroadcast_Long(t *testing.T) {
	long := ""
	for i := 0; i < 600; i++ {
		long += "x"
	}
	got := truncateForBroadcast(long, 500)
	if len(got) != 503 {
		t.Errorf("expected 503 (500+'...'), got %d", len(got))
	}
}

func TestSensitiveDetector_FullCheck_TriggersOnToolCallTitle(t *testing.T) {
	d := acp.NewSensitiveDetector()
	u := &acp.Update{Title: "Running: rm -rf /var/log"}
	m := d.Check(extractUpdateText(u))
	if !m.Matched {
		t.Fatal("expected detection")
	}
	if m.Pattern != "rm-recursive" {
		t.Errorf("expected rm-recursive, got %s", m.Pattern)
	}
}

func TestSensitiveDetector_FullCheck_RawInputCommand(t *testing.T) {
	d := acp.NewSensitiveDetector()
	u := &acp.Update{RawInput: json.RawMessage(`{"command":"sudo systemctl stop nginx"}`)}
	m := d.Check(extractUpdateText(u))
	if !m.Matched || m.Pattern != "sudo" {
		t.Errorf("expected sudo match, got %+v", m)
	}
}

func TestAgentConnection_SensitiveInterceptorIdempotent(t *testing.T) {
	conn := &acp.AgentConnection{ID: "test-agent"}
	if conn.IsSensitiveInterceptorWired() {
		t.Error("fresh connection should not be wired")
	}
	conn.MarkSensitiveInterceptorWired()
	if !conn.IsSensitiveInterceptorWired() {
		t.Error("after marking, should report wired")
	}
	// Marking twice is safe
	conn.MarkSensitiveInterceptorWired()
	if !conn.IsSensitiveInterceptorWired() {
		t.Error("double-marking should remain wired")
	}
}
