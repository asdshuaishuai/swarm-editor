package api

import (
	"encoding/json"
	"testing"
)

// testLSPValidation tests that LSP handlers properly validate required parameters.
func TestLSPHandler_NilManager(t *testing.T) {
	handler, _ := newTestHandler()

	// All these handlers should return "LSP not configured" when manager is nil
	tests := []struct {
		cmd    string
		params string
	}{
		{"lsp_completion", `{"file":"f.ts","line":0,"column":0}`},
		{"lsp_hover", `{"file":"f.ts","line":0,"column":0}`},
		{"lsp_definition", `{"file":"f.ts","line":0,"column":0}`},
		{"lsp_implementation", `{"file":"f.ts","line":0,"column":0}`},
		{"lsp_type_definition", `{"file":"f.ts","line":0,"column":0}`},
		{"lsp_references", `{"file":"f.ts","line":0,"column":0}`},
		{"lsp_signature_help", `{"file":"f.ts","line":0,"column":0}`},
		{"lsp_document_symbols", `{"file":"f.ts"}`},
		{"lsp_document_highlight", `{"file":"f.ts","line":0,"column":0}`},
		{"lsp_code_actions", `{"file":"f.ts","line":0,"column":0}`},
		{"lsp_inlay_hints", `{"file":"f.ts"}`},
		{"lsp_folding_ranges", `{"file":"f.ts"}`},
		{"lsp_workspace_symbols", `{"query":"test"}`},
		{"lsp_rename", `{"file":"f.ts","line":0,"column":0,"newName":"x"}`},
		{"lsp_formatting", `{"file":"f.ts"}`},
		{"lsp_range_formatting", `{"file":"f.ts","startLine":0,"endLine":1}`},
		{"lsp_selection_range", `{"file":"f.ts","line":0,"column":0}`},
		{"lsp_on_type_formatting", `{"file":"f.ts","line":0,"column":0,"ch":""}`},
		{"lsp_semantic_tokens", `{"file":"f.ts"}`},
		{"lsp_semantic_tokens_range", `{"file":"f.ts","startLine":0,"endLine":1}`},
		{"lsp_document_links", `{"file":"f.ts"}`},
		{"lsp_code_lenses", `{"file":"f.ts"}`},
		{"lsp_prepare_call_hierarchy", `{"file":"f.ts","line":0,"column":0}`},
		{"lsp_call_hierarchy_incoming_calls", `{"file":"f.ts","line":0,"column":0}`},
		{"lsp_call_hierarchy_outgoing_calls", `{"file":"f.ts","line":0,"column":0}`},
		{"lsp_prepare_type_hierarchy", `{"file":"f.ts","line":0,"column":0}`},
		{"lsp_type_hierarchy_supertypes", `{"file":"f.ts","line":0,"column":0}`},
		{"lsp_type_hierarchy_subtypes", `{"file":"f.ts","line":0,"column":0}`},
		{"lsp_did_open", `{"file":"f.ts","language":"typescript","content":""}`},
		{"lsp_did_change", `{"file":"f.ts","content":""}`},
		{"lsp_did_change_incremental", `{"file":"f.ts","changes":[]}`},
		{"lsp_did_close", `{"file":"f.ts"}`},
		{"lsp_did_save", `{"file":"f.ts"}`},
	}

	for _, tt := range tests {
		t.Run(tt.cmd+"_nil_mgr", func(t *testing.T) {
			_, err := handler.HandleCommand(tt.cmd, json.RawMessage(tt.params), "test")
			if err == nil {
				t.Error("expected error for nil LSP manager")
			}
		})
	}
}

func TestLSPHandler_Validation(t *testing.T) {
	handler, _ := newTestHandler()

	tests := []struct {
		cmd    string
		params string
	}{
		// Missing file parameter
		{"lsp_completion", `{}`},
		{"lsp_hover", `{}`},
		{"lsp_definition", `{}`},
		{"lsp_implementation", `{}`},
		{"lsp_type_definition", `{}`},
		{"lsp_references", `{}`},
		{"lsp_signature_help", `{}`},
		{"lsp_document_symbols", `{}`},
		{"lsp_document_highlight", `{}`},
		{"lsp_code_actions", `{}`},
		{"lsp_inlay_hints", `{}`},
		{"lsp_folding_ranges", `{}`},
		{"lsp_rename", `{}`},
		{"lsp_formatting", `{}`},
		{"lsp_range_formatting", `{}`},
		{"lsp_selection_range", `{}`},
		{"lsp_on_type_formatting", `{}`},
		{"lsp_semantic_tokens", `{}`},
		{"lsp_semantic_tokens_range", `{}`},
		{"lsp_document_links", `{}`},
		{"lsp_code_lenses", `{}`},
		{"lsp_prepare_call_hierarchy", `{}`},
		{"lsp_call_hierarchy_incoming_calls", `{}`},
		{"lsp_call_hierarchy_outgoing_calls", `{}`},
		{"lsp_prepare_type_hierarchy", `{}`},
		{"lsp_type_hierarchy_supertypes", `{}`},
		{"lsp_type_hierarchy_subtypes", `{}`},
		{"lsp_did_open", `{}`},
		{"lsp_did_change", `{}`},
		{"lsp_did_change_incremental", `{}`},
		{"lsp_did_close", `{}`},
		{"lsp_did_save", `{}`},
		// Empty file parameter
		{"lsp_completion", `{"file":""}`},
		{"lsp_hover", `{"file":""}`},
		// Invalid JSON
		{"lsp_completion", `{invalid}`},
		{"lsp_hover", `{invalid}`},
	}

	for _, tt := range tests {
		t.Run(tt.cmd+"_invalid", func(t *testing.T) {
			_, err := handler.HandleCommand(tt.cmd, json.RawMessage(tt.params), "test")
			if err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestLSPStatus_NilManager(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("lsp_status", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	servers, ok := m["servers"].([]any)
	if !ok {
		t.Fatalf("expected []any for servers, got %T", m["servers"])
	}
	if len(servers) != 0 {
		t.Errorf("expected empty servers, got %d", len(servers))
	}
}

func TestLSPSupportsIncremental_NilManager(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("lsp_supports_incremental", json.RawMessage(`{"file":"test.ts"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m, ok := result.(map[string]bool)
	if !ok {
		t.Fatalf("expected map[string]bool, got %T", result)
	}
	if m["supported"] != false {
		t.Error("expected supported=false for nil manager")
	}
}

func TestLSPSupportsIncremental_EmptyFile(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("lsp_supports_incremental", json.RawMessage(`{"file":""}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m, ok := result.(map[string]bool)
	if !ok {
		t.Fatalf("expected map[string]bool, got %T", result)
	}
	if m["supported"] != false {
		t.Error("expected supported=false for empty file")
	}
}

func TestLSPDiagnostics_NilManager(t *testing.T) {
	handler, _ := newTestHandler()

	result, err := handler.HandleCommand("lsp_diagnostics", json.RawMessage(`{"file":"test.ts"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	diags, ok := m["diagnostics"]
	if !ok {
		t.Fatal("expected diagnostics field")
	}
	diagMap, ok := diags.(map[string]any)
	if !ok {
		t.Fatalf("expected map for diagnostics, got %T", diags)
	}
	if len(diagMap) != 0 {
		t.Errorf("expected empty diagnostics map, got %d entries", len(diagMap))
	}
}

func TestLSPSemanticTokensLegend_NilManager(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("lsp_semantic_tokens_legend", json.RawMessage(`{"file":"test.ts"}`), "test")
	if err == nil {
		t.Error("expected error for nil LSP manager")
	}
}

func TestLSPWorkspaceSymbols_NilManager(t *testing.T) {
	handler, _ := newTestHandler()

	_, err := handler.HandleCommand("lsp_workspace_symbols", json.RawMessage(`{"query":"test"}`), "test")
	if err == nil {
		t.Error("expected error for nil LSP manager")
	}
}
