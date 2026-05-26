package a2a

import (
	"encoding/json"
	"testing"
)

func TestNewCodePatchMessage(t *testing.T) {
	patch := CodePatchPayload{
		PatchID:    "p-1",
		Path:       "src/main.go",
		OldContent: "old",
		NewContent: "new",
		Language:   "go",
		Reason:     "fix bug",
	}
	msg := NewCodePatchMessage("gemini", "claude-code", patch)
	if msg.Type != MessageTypeCodePatch {
		t.Errorf("expected code_patch, got %s", msg.Type)
	}
	if msg.From != "gemini" || msg.To != "claude-code" {
		t.Errorf("from/to mismatch: %s -> %s", msg.From, msg.To)
	}
	if msg.Priority != PriorityHigh {
		t.Errorf("expected high priority, got %v", msg.Priority)
	}
	if msg.Subject != "patch:src/main.go" {
		t.Errorf("unexpected subject: %s", msg.Subject)
	}
	if msg.TTL == 0 {
		t.Error("expected non-zero TTL")
	}
}

func TestNewCodePatchMessage_PayloadRoundtrip(t *testing.T) {
	patch := CodePatchPayload{
		PatchID: "p-2", Path: "a.go", OldContent: "x", NewContent: "y",
	}
	msg := NewCodePatchMessage("a", "b", patch)
	if len(msg.Payload) == 0 {
		t.Fatal("payload empty")
	}
	got, err := ParseCodePatchPayload(msg)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got.PatchID != "p-2" || got.Path != "a.go" {
		t.Errorf("roundtrip mismatch: %+v", got)
	}
	if got.OldContent != "x" || got.NewContent != "y" {
		t.Errorf("content mismatch: old=%q new=%q", got.OldContent, got.NewContent)
	}
}

func TestParseCodePatchPayload_WrongType(t *testing.T) {
	msg := NewMessage(MessageTypeTaskRequest, "a", "b")
	if _, err := ParseCodePatchPayload(msg); err == nil {
		t.Error("expected error for wrong message type")
	}
}

func TestParseCodePatchPayload_Nil(t *testing.T) {
	if _, err := ParseCodePatchPayload(nil); err == nil {
		t.Error("expected error for nil message")
	}
}

func TestParseCodePatchPayload_EmptyPayload(t *testing.T) {
	msg := NewMessage(MessageTypeCodePatch, "a", "b")
	if _, err := ParseCodePatchPayload(msg); err == nil {
		t.Error("expected error for empty payload")
	}
}

func TestParseCodePatchPayload_MissingPath(t *testing.T) {
	msg := NewMessage(MessageTypeCodePatch, "a", "b")
	msg.Payload = json.RawMessage(`{"patchId":"p-1"}`)
	if _, err := ParseCodePatchPayload(msg); err == nil {
		t.Error("expected error for missing path")
	}
}

func TestNewCodePatchAckMessage(t *testing.T) {
	msg := NewCodePatchAckMessage("claude", "gemini", CodePatchAckPayload{
		PatchID: "p-1", Accepted: true,
	})
	if msg.Type != MessageTypeCodePatchAck {
		t.Errorf("expected code_patch_ack, got %s", msg.Type)
	}
	got, err := ParseCodePatchAckPayload(msg)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got.PatchID != "p-1" || !got.Accepted {
		t.Errorf("ack mismatch: %+v", got)
	}
}

func TestParseCodePatchAckPayload_WrongType(t *testing.T) {
	msg := NewMessage(MessageTypeCodePatch, "a", "b")
	if _, err := ParseCodePatchAckPayload(msg); err == nil {
		t.Error("expected error for wrong type")
	}
}

func TestSendCodePatch_ValidationErrors(t *testing.T) {
	cases := []struct {
		name      string
		router    *Router
		from, to  string
		patch     CodePatchPayload
		expectErr bool
	}{
		{"nil-router", nil, "a", "b", CodePatchPayload{Path: "x.go"}, true},
		{"empty-from", &Router{}, "", "b", CodePatchPayload{Path: "x.go"}, true},
		{"empty-to", &Router{}, "a", "", CodePatchPayload{Path: "x.go"}, true},
		{"empty-path", &Router{}, "a", "b", CodePatchPayload{}, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := SendCodePatch(c.router, c.from, c.to, c.patch)
			if (err != nil) != c.expectErr {
				t.Errorf("expectErr=%v got err=%v", c.expectErr, err)
			}
		})
	}
}

func TestCodePatchPayload_JSONRoundtrip(t *testing.T) {
	p := CodePatchPayload{
		PatchID: "id", Path: "p", OldContent: "o", NewContent: "n",
		Language: "go", Reason: "test",
	}
	data, err := json.Marshal(p)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var back CodePatchPayload
	if err := json.Unmarshal(data, &back); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if back != p {
		t.Errorf("roundtrip mismatch: %+v vs %+v", back, p)
	}
}
