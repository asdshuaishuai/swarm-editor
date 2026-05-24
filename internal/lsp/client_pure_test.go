package lsp

import (
	"testing"
)

func TestGetInitializationOptions_Gopls(t *testing.T) {
	opts := getInitializationOptions("gopls")
	if opts == nil {
		t.Fatal("expected non-nil options for gopls")
	}
	if opts["semanticTokens"] != true {
		t.Error("expected semanticTokens=true for gopls")
	}
	hints, ok := opts["hints"].(map[string]any)
	if !ok {
		t.Fatal("expected hints map for gopls")
	}
	if hints["parameterNames"] != true {
		t.Error("expected parameterNames=true in gopls hints")
	}
}

func TestGetInitializationOptions_RustAnalyzer(t *testing.T) {
	opts := getInitializationOptions("rust-analyzer")
	if opts == nil {
		t.Fatal("expected non-nil options for rust-analyzer")
	}
	cargo, ok := opts["cargo"].(map[string]any)
	if !ok {
		t.Fatal("expected cargo map for rust-analyzer")
	}
	if cargo["loadOutDirsFromCheck"] != true {
		t.Error("expected loadOutDirsFromCheck=true")
	}
}

func TestGetInitializationOptions_Pyright(t *testing.T) {
	opts := getInitializationOptions("pyright")
	if opts == nil {
		t.Fatal("expected non-nil options for pyright")
	}
	python, ok := opts["python"].(map[string]any)
	if !ok {
		t.Fatal("expected python map for pyright")
	}
	analysis := python["analysis"].(map[string]any)
	if analysis["typeCheckingMode"] != "basic" {
		t.Error("expected typeCheckingMode=basic")
	}
}

func TestGetInitializationOptions_TypeScript(t *testing.T) {
	opts := getInitializationOptions("typescript-language-server")
	if opts == nil {
		t.Fatal("expected non-nil options for typescript-language-server")
	}
	prefs, ok := opts["preferences"].(map[string]any)
	if !ok {
		t.Fatal("expected preferences map")
	}
	if prefs["includeInlayParameterNameHints"] != "all" {
		t.Error("expected includeInlayParameterNameHints=all")
	}
}

func TestGetInitializationOptions_TsLS(t *testing.T) {
	opts := getInitializationOptions("ts_ls")
	if opts == nil {
		t.Fatal("expected non-nil options for ts_ls")
	}
}

func TestGetInitializationOptions_Unknown(t *testing.T) {
	opts := getInitializationOptions("unknown-server")
	if opts != nil {
		t.Error("expected nil for unknown server")
	}
}

func TestParseWorkspaceEditFromChanges(t *testing.T) {
	items := []any{
		map[string]any{
			"uri": "file:///test.go",
			"edits": []any{
				map[string]any{
					"newText": "hello",
					"range": map[string]any{
						"start": map[string]any{"line": 1, "character": 0},
						"end":   map[string]any{"line": 1, "character": 5},
					},
				},
			},
		},
	}
	we := parseWorkspaceEditFromChanges(items)
	if we == nil {
		t.Fatal("expected non-nil WorkspaceEdit")
	}
	if len(we.Changes) != 1 {
		t.Fatalf("expected 1 change, got %d", len(we.Changes))
	}
	if we.Changes[0].URI != "file:///test.go" {
		t.Errorf("expected URI file:///test.go, got %s", we.Changes[0].URI)
	}
	if len(we.Changes[0].Edits) != 1 {
		t.Fatalf("expected 1 edit, got %d", len(we.Changes[0].Edits))
	}
	if we.Changes[0].Edits[0].NewText != "hello" {
		t.Errorf("expected newText 'hello', got '%s'", we.Changes[0].Edits[0].NewText)
	}
}

func TestParseWorkspaceEditFromChanges_Empty(t *testing.T) {
	we := parseWorkspaceEditFromChanges(nil)
	if we == nil {
		t.Fatal("expected non-nil WorkspaceEdit for nil input")
	}
	if len(we.Changes) != 0 {
		t.Errorf("expected 0 changes, got %d", len(we.Changes))
	}
}

func TestParseWorkspaceEditFromChanges_InvalidItem(t *testing.T) {
	items := []any{"not a map"}
	we := parseWorkspaceEditFromChanges(items)
	if len(we.Changes) != 0 {
		t.Errorf("expected 0 changes for invalid item, got %d", len(we.Changes))
	}
}

func TestParseWorkspaceEdit(t *testing.T) {
	m := map[string]any{
		"changes": map[string]any{
			"file:///a.go": []any{
				map[string]any{
					"newText": "fixed",
					"range": map[string]any{
						"start": map[string]any{"line": 0, "character": 0},
						"end":   map[string]any{"line": 0, "character": 3},
					},
				},
			},
		},
	}
	we := parseWorkspaceEdit(m)
	if we == nil {
		t.Fatal("expected non-nil WorkspaceEdit")
	}
	if len(we.Changes) != 1 {
		t.Fatalf("expected 1 change, got %d", len(we.Changes))
	}
	if we.Changes[0].URI != "file:///a.go" {
		t.Errorf("expected URI file:///a.go, got %s", we.Changes[0].URI)
	}
}

func TestParseWorkspaceEdit_NoChanges(t *testing.T) {
	we := parseWorkspaceEdit(map[string]any{})
	if len(we.Changes) != 0 {
		t.Errorf("expected 0 changes, got %d", len(we.Changes))
	}
}

func TestClient_ServerName(t *testing.T) {
	c := NewClient()
	if c.ServerName() != "" {
		t.Error("expected empty server name for new client")
	}
}

func TestClient_SemanticTokensLegend_Nil(t *testing.T) {
	c := NewClient()
	if c.SemanticTokensLegend() != nil {
		t.Error("expected nil legend for new client")
	}
}
