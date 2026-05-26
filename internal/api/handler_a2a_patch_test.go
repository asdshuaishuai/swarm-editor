package api

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/a2a"
)

func newPatchTestServer(t *testing.T) *WebSocketServer {
	t.Helper()
	router := a2a.NewRouter(a2a.RouterConfig{
		QueueSize:   100,
		SendTimeout: time.Second,
		RetryCount:  1,
		RetryDelay:  10 * time.Millisecond,
	})
	if err := router.Start(context.Background()); err != nil {
		t.Fatalf("start router: %v", err)
	}
	t.Cleanup(func() { router.Stop() })
	server := &WebSocketServer{
		workspacePath: t.TempDir(),
		shadowBuffer:  NewShadowBuffer(),
		a2aRouter:     router,
	}
	server.RegisterCodePatchHandler()
	return server
}

// waitForPatch polls the shadow buffer until a patch appears for agentID
// or the deadline expires. Needed because Enqueue → processQueue is async.
func waitForPatch(t *testing.T, sb *ShadowBuffer, agentID string) {
	t.Helper()
	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		if len(sb.List(agentID)) > 0 {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestHandleA2ASendPatch_Success(t *testing.T) {
	server := newPatchTestServer(t)
	handler := NewCommandHandler(server)

	result, err := handler.HandleCommand("a2a_send_patch", json.RawMessage(`{
		"from":"gemini","to":"claude-code","path":"src/main.go",
		"oldContent":"old","newContent":"new","language":"go","reason":"fix bug"
	}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]any)
	if m["status"] != "sent" {
		t.Errorf("expected sent, got %v", m["status"])
	}
	if m["messageId"] == nil || m["messageId"] == "" {
		t.Error("expected non-empty messageId")
	}

	// Receiver's shadow buffer should have the patch — staged via handler
	waitForPatch(t, server.shadowBuffer, "claude-code")
	patches := server.shadowBuffer.List("claude-code")
	if len(patches) != 1 {
		t.Fatalf("expected 1 patch in shadow buffer, got %d", len(patches))
	}
	if patches[0].Path != "src/main.go" || patches[0].NewContent != "new" {
		t.Errorf("patch mismatch: %+v", patches[0])
	}
}

func TestHandleA2ASendPatch_MissingFrom(t *testing.T) {
	server := newPatchTestServer(t)
	handler := NewCommandHandler(server)
	_, err := handler.HandleCommand("a2a_send_patch", json.RawMessage(
		`{"to":"b","path":"x.go"}`), "test")
	if err == nil {
		t.Error("expected error for missing from")
	}
}

func TestHandleA2ASendPatch_MissingTo(t *testing.T) {
	server := newPatchTestServer(t)
	handler := NewCommandHandler(server)
	_, err := handler.HandleCommand("a2a_send_patch", json.RawMessage(
		`{"from":"a","path":"x.go"}`), "test")
	if err == nil {
		t.Error("expected error for missing to")
	}
}

func TestHandleA2ASendPatch_MissingPath(t *testing.T) {
	server := newPatchTestServer(t)
	handler := NewCommandHandler(server)
	_, err := handler.HandleCommand("a2a_send_patch", json.RawMessage(
		`{"from":"a","to":"b"}`), "test")
	if err == nil {
		t.Error("expected error for missing path")
	}
}

func TestHandleA2ASendPatch_NoRouter(t *testing.T) {
	server := &WebSocketServer{
		workspacePath: t.TempDir(),
		shadowBuffer:  NewShadowBuffer(),
	}
	handler := NewCommandHandler(server)
	_, err := handler.HandleCommand("a2a_send_patch", json.RawMessage(
		`{"from":"a","to":"b","path":"x.go","oldContent":"","newContent":"new"}`), "test")
	if err == nil {
		t.Error("expected error when router missing")
	}
}

func TestHandleA2ASendPatch_StagesInReceiverBuffer(t *testing.T) {
	server := newPatchTestServer(t)
	handler := NewCommandHandler(server)
	_, err := handler.HandleCommand("a2a_send_patch", json.RawMessage(`{
		"from":"a1","to":"a2","path":"f.go","oldContent":"old","newContent":"new"
	}`), "test")
	if err != nil {
		t.Fatal(err)
	}
	waitForPatch(t, server.shadowBuffer, "a2")
	// Sender should NOT see it (it's the receiver's buffer)
	if got := server.shadowBuffer.List("a1"); len(got) != 0 {
		t.Errorf("sender should have 0 patches, got %d", len(got))
	}
	if got := server.shadowBuffer.List("a2"); len(got) != 1 {
		t.Errorf("receiver should have 1 patch, got %d", len(got))
	}
}

func TestHandleA2ASendPatch_SingleStageNotDouble(t *testing.T) {
	// Regression test for Fix #10: ensure we don't double-stage when both
	// the handler path and the (former) direct stage path are active.
	server := newPatchTestServer(t)
	handler := NewCommandHandler(server)

	for i := 0; i < 3; i++ {
		_, err := handler.HandleCommand("a2a_send_patch", json.RawMessage(`{
			"from":"a","to":"b","path":"file.go","oldContent":"o","newContent":"n"
		}`), "test")
		if err != nil {
			t.Fatal(err)
		}
	}

	waitForPatch(t, server.shadowBuffer, "b")
	// 3 sends → 3 patches, not 6
	got := server.shadowBuffer.List("b")
	deadline := time.Now().Add(200 * time.Millisecond)
	for time.Now().Before(deadline) && len(got) < 3 {
		time.Sleep(10 * time.Millisecond)
		got = server.shadowBuffer.List("b")
	}
	if len(got) != 3 {
		t.Errorf("expected 3 patches (no double stage), got %d", len(got))
	}
}
