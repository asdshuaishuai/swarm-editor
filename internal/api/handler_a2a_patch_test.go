package api

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/swarm-editor/swarm-editor/internal/a2a"
)

func newPatchTestServer(t *testing.T) *WebSocketServer {
	t.Helper()
	router := a2a.NewRouter(a2a.RouterConfig{})
	if err := router.Start(context.Background()); err != nil {
		t.Fatalf("start router: %v", err)
	}
	t.Cleanup(func() { router.Stop() })
	return &WebSocketServer{
		workspacePath: t.TempDir(),
		shadowBuffer:  NewShadowBuffer(),
		a2aRouter:     router,
	}
}

func TestHandleA2ASendPatch_Success(t *testing.T) {
	server := newPatchTestServer(t)
	noop := func(*a2a.Message) error { return nil }
	server.a2aRouter.RegisterAgent("gemini", noop, nil)
	server.a2aRouter.RegisterAgent("claude-code", noop, nil)
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

	// Receiver's shadow buffer should have the patch
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
	noop := func(*a2a.Message) error { return nil }
	server.a2aRouter.RegisterAgent("a1", noop, nil)
	server.a2aRouter.RegisterAgent("a2", noop, nil)
	handler := NewCommandHandler(server)
	_, err := handler.HandleCommand("a2a_send_patch", json.RawMessage(`{
		"from":"a1","to":"a2","path":"f.go","oldContent":"old","newContent":"new"
	}`), "test")
	if err != nil {
		t.Fatal(err)
	}
	// Sender should NOT see it (it's the receiver's buffer)
	if got := server.shadowBuffer.List("a1"); len(got) != 0 {
		t.Errorf("sender should have 0 patches, got %d", len(got))
	}
	if got := server.shadowBuffer.List("a2"); len(got) != 1 {
		t.Errorf("receiver should have 1 patch, got %d", len(got))
	}
}
