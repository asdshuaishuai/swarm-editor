package lsp

import (
	"context"
	"encoding/json"
	"testing"
)

func TestLanguageMapping(t *testing.T) {
	tests := []struct {
		file     string
		lang     string
		server   string
	}{
		{"main.go", "go", "gopls"},
		{"lib.rs", "rust", "rust-analyzer"},
		{"app.py", "python", "pyright"},
		{"index.ts", "typescript", "typescript-language-server"},
		{"App.tsx", "typescriptreact", "typescript-language-server"},
		{"server.js", "javascript", "typescript-language-server"},
		{"Main.java", "java", "jdtls"},
		{"hello.c", "c", "clangd"},
		{"main.cpp", "cpp", "clangd"},
		{"Program.cs", "csharp", "omnisharp"},
		{"readme.md", "", ""},
		{"Makefile", "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.file, func(t *testing.T) {
			lang := GetLanguageID(tt.file)
			if lang != tt.lang {
				t.Errorf("GetLanguageID(%q) = %q, want %q", tt.file, lang, tt.lang)
			}
			server := GetServerName(tt.file)
			if server != tt.server {
				t.Errorf("GetServerName(%q) = %q, want %q", tt.file, server, tt.server)
			}
		})
	}
}

func TestClientNotInitialized(t *testing.T) {
	c := NewClient()
	if c.Initialized() {
		t.Error("new client should not be initialized")
	}
}

func TestClientCapabilities(t *testing.T) {
	c := NewClient()
	caps := c.Capabilities()
	if len(caps) != 0 {
		t.Error("new client should have empty capabilities")
	}
}

func TestClientNotificationBeforeStart(t *testing.T) {
	c := NewClient()
	// Should not panic when sending notification to unstarted client
	c.DidOpen("file:///test.go", "go", "package main")
	c.DidChange("test.go", "package main", 1)
	c.DidClose("test.go")
}

func TestFileURI(t *testing.T) {
	tests := []struct {
		workspace string
		rel       string
		want      string
	}{
		{"/home/user/project", "main.go", "file:///home/user/project/main.go"},
		{"/home/user/project", "src/main.go", "file:///home/user/project/src/main.go"},
	}

	for _, tt := range tests {
		got := FileURI(tt.workspace, tt.rel)
		if got != tt.want {
			t.Errorf("FileURI(%q, %q) = %q, want %q", tt.workspace, tt.rel, got, tt.want)
		}
	}
}

func TestResolveWorkspacePath(t *testing.T) {
	// Should not panic on empty input
	path := ResolveWorkspacePath("")
	if path == "" {
		t.Error("ResolveWorkspacePath should not return empty string")
	}

	// Should return the start dir when no markers found
	path = ResolveWorkspacePath("/tmp")
	if path != "/tmp" {
		t.Errorf("ResolveWorkspacePath(/tmp) = %q, want /tmp", path)
	}
}

func TestLSPRequestJSON(t *testing.T) {
	req := LSPRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  "initialize",
		Params:  map[string]any{"processId": nil},
	}
	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if decoded["method"] != "initialize" {
		t.Errorf("method = %v, want initialize", decoded["method"])
	}
}

func TestLSPResponseJSON(t *testing.T) {
	resp := LSPResponse{
		JSONRPC: "2.0",
		ID:      1,
		Result:  map[string]any{"capabilities": map[string]any{"completionProvider": true}},
	}
	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded LSPResponse
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if decoded.ID != 1 {
		t.Errorf("id = %v, want 1", decoded.ID)
	}
}

func TestParseLocations(t *testing.T) {
	// Test nil
	locations := parseLocations(nil)
	if locations != nil {
		t.Error("parseLocations(nil) should return nil")
	}

	// Test single location
	single := map[string]any{
		"uri": "file:///test.go",
		"range": map[string]any{
			"start": map[string]any{"line": 1.0, "character": 0.0},
			"end":   map[string]any{"line": 1.0, "character": 5.0},
		},
	}
	locations = parseLocations(single)
	if len(locations) != 1 {
		t.Fatalf("len = %d, want 1", len(locations))
	}
	if locations[0].URI != "file:///test.go" {
		t.Errorf("uri = %q, want file:///test.go", locations[0].URI)
	}

	// Test array of locations
	arr := []any{single}
	locations = parseLocations(arr)
	if len(locations) != 1 {
		t.Fatalf("len = %d, want 1", len(locations))
	}
}

func TestConvertCompletionItems(t *testing.T) {
	items := []any{
		map[string]any{"label": "foo", "kind": 6.0},
		map[string]any{"label": "bar", "kind": 3.0},
	}
	result := convertCompletionItems(items)
	if len(result) != 2 {
		t.Fatalf("len = %d, want 2", len(result))
	}
	if result[0]["label"] != "foo" {
		t.Errorf("label = %v, want foo", result[0]["label"])
	}
}

func TestClientCloseIdempotent(t *testing.T) {
	c := NewClient()
	// Close should not panic on unstarted client
	if err := c.Close(); err != nil {
		t.Errorf("Close() on unstarted client: %v", err)
	}
	// Second close should be no-op
	if err := c.Close(); err != nil {
		t.Errorf("Close() again: %v", err)
	}
}

func TestManagerNewManager(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	if m.RootDir() != "/tmp" {
		t.Errorf("RootDir = %q, want /tmp", m.RootDir())
	}
	status := m.Status()
	if len(status) != 0 {
		t.Errorf("new manager should have no servers, got %d", len(status))
	}
	if err := m.Close(); err != nil {
		t.Errorf("Close() on new manager: %v", err)
	}
}

func TestManagerUnknownLanguage(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.GetClient(context.Background(), "readme.md")
	if err == nil {
		t.Error("expected error for unknown language")
	}

	_, err = m.Completion(context.Background(), "file:///readme.md", "readme.md", 0, 0)
	if err == nil {
		t.Error("expected error for unknown language")
	}
}

func TestManagerDidChangeUnknownLanguage(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	// Should not panic for unknown languages
	m.DidChange("readme.md", "content")
	m.DidClose("readme.md")
}

func TestManagerCloseIdempotent(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	if err := m.Close(); err != nil {
		t.Errorf("first Close(): %v", err)
	}
	if err := m.Close(); err != nil {
		t.Errorf("second Close(): %v", err)
	}
}
