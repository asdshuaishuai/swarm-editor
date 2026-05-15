package api

import (
"context"
"encoding/json"
"fmt"
"strings"
"github.com/swarm-editor/swarm-editor/internal/lsp"
)

func (h *CommandHandler) handleLSPSignatureHelp(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		URI    string `json:"uri"`
		File   string `json:"file"`
		Line   int    `json:"line"`
		Column int    `json:"column"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, errNotConnected("LSP not configured")
	}

	uri := req.URI
	if uri == "" {
		uri = lsp.FileURI(h.server.workspacePath, req.File)
	}

	result, err := mgr.SignatureHelp(ctx, uri, req.File, req.Line, req.Column)
	if err != nil {
		return nil, safeError("signature help failed", err)
	}
	if result == nil {
		return map[string]any{}, nil
	}
	return result, nil
}

func (h *CommandHandler) handleLSPDocumentSymbols(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		URI  string `json:"uri"`
		File string `json:"file"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, errNotConnected("LSP not configured")
	}

	uri := req.URI
	if uri == "" {
		uri = lsp.FileURI(h.server.workspacePath, req.File)
	}

	symbols, err := mgr.DocumentSymbols(ctx, uri, req.File)
	if err != nil {
		return nil, safeError("document symbols failed", err)
	}
	if symbols == nil {
		return map[string]any{"symbols": []any{}}, nil
	}
	return map[string]any{"symbols": symbols}, nil
}

func (h *CommandHandler) handleLSPDocumentHighlight(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		URI    string `json:"uri"`
		File   string `json:"file"`
		Line   int    `json:"line"`
		Column int    `json:"column"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, errNotConnected("LSP not configured")
	}

	uri := req.URI
	if uri == "" {
		uri = lsp.FileURI(h.server.workspacePath, req.File)
	}

	highlights, err := mgr.DocumentHighlight(ctx, uri, req.File, req.Line, req.Column)
	if err != nil {
		return nil, safeError("document highlight failed", err)
	}
	if highlights == nil {
		return map[string]any{"highlights": []any{}}, nil
	}
	return map[string]any{"highlights": highlights}, nil
}

func (h *CommandHandler) handleLSPInlayHints(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		URI       string `json:"uri"`
		File      string `json:"file"`
		StartLine int    `json:"startLine"`
		EndLine   int    `json:"endLine"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, errNotConnected("LSP not configured")
	}

	uri := req.URI
	if uri == "" {
		uri = lsp.FileURI(h.server.workspacePath, req.File)
	}

	hints, err := mgr.InlayHints(ctx, uri, req.File, req.StartLine, req.EndLine)
	if err != nil {
		return nil, safeError("inlay hints failed", err)
	}
	if hints == nil {
		return map[string]any{"hints": []any{}}, nil
	}
	return map[string]any{"hints": hints}, nil
}

func (h *CommandHandler) handleLSPFoldingRanges(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		URI  string `json:"uri"`
		File string `json:"file"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, errNotConnected("LSP not configured")
	}

	uri := req.URI
	if uri == "" {
		uri = lsp.FileURI(h.server.workspacePath, req.File)
	}

	ranges, err := mgr.FoldingRanges(ctx, uri, req.File)
	if err != nil {
		return nil, safeError("folding ranges failed", err)
	}
	if ranges == nil {
		return map[string]any{"ranges": []any{}}, nil
	}
	return map[string]any{"ranges": ranges}, nil
}

func (h *CommandHandler) handleLSPWorkspaceSymbols(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Query string `json:"query"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, errNotConnected("LSP not configured")
	}

	symbols, err := mgr.WorkspaceSymbols(ctx, req.Query)
	if err != nil {
		return nil, safeError("workspace symbols failed", err)
	}
	if symbols == nil {
		return map[string]any{"symbols": []any{}}, nil
	}
	return map[string]any{"symbols": symbols}, nil
}

func (h *CommandHandler) handleLSPCodeActions(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		URI    string `json:"uri"`
		File   string `json:"file"`
		Line   int    `json:"line"`
		Column int    `json:"column"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, errNotConnected("LSP not configured")
	}

	uri := req.URI
	if uri == "" {
		uri = lsp.FileURI(h.server.workspacePath, req.File)
	}

	actions, err := mgr.CodeActions(ctx, uri, req.File, req.Line, req.Column)
	if err != nil {
		return nil, safeError("code actions failed", err)
	}
	if actions == nil {
		return map[string]any{"actions": []any{}}, nil
	}
	return map[string]any{"actions": actions}, nil
}

func (h *CommandHandler) handleLSPRename(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		URI     string `json:"uri"`
		File    string `json:"file"`
		Line    int    `json:"line"`
		Column  int    `json:"column"`
		NewName string `json:"newName"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" || req.NewName == "" {
		return nil, errValidation("file and newName are required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, errNotConnected("LSP not configured")
	}

	uri := req.URI
	if uri == "" {
		uri = lsp.FileURI(h.server.workspacePath, req.File)
	}

	edit, err := mgr.Rename(ctx, uri, req.File, req.Line, req.Column, req.NewName)
	if err != nil {
		return nil, safeError("rename failed", err)
	}
	if edit == nil {
		return map[string]any{"edit": nil}, nil
	}
	return map[string]any{"edit": edit}, nil
}

func (h *CommandHandler) handleLSPFormatting(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		URI         string `json:"uri"`
		File        string `json:"file"`
		TabSize     int    `json:"tabSize"`
		InsertSpaces bool  `json:"insertSpaces"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, errNotConnected("LSP not configured")
	}

	uri := req.URI
	if uri == "" {
		uri = lsp.FileURI(h.server.workspacePath, req.File)
	}

	// Use editor settings, fall back to sensible defaults
	tabSize := req.TabSize
	if tabSize <= 0 {
		tabSize = 2
	}
	opts := lsp.FormattingOptions{
		TabSize:      tabSize,
		InsertSpaces: req.InsertSpaces,
	}

	edit, err := mgr.Formatting(ctx, uri, req.File, opts)
	if err != nil {
		return nil, safeError("formatting failed", err)
	}
	if edit == nil {
		return map[string]any{"edit": nil}, nil
	}
	return map[string]any{"edit": edit}, nil
}

func (h *CommandHandler) handleLSPRangeFormatting(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		URI          string `json:"uri"`
		File         string `json:"file"`
		TabSize      int    `json:"tabSize"`
		InsertSpaces bool   `json:"insertSpaces"`
		StartLine    int    `json:"startLine"`
		StartCol     int    `json:"startCol"`
		EndLine      int    `json:"endLine"`
		EndCol       int    `json:"endCol"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, errNotConnected("LSP not configured")
	}

	uri := req.URI
	if uri == "" {
		uri = lsp.FileURI(h.server.workspacePath, req.File)
	}

	tabSize := req.TabSize
	if tabSize <= 0 {
		tabSize = 2
	}
	opts := lsp.FormattingOptions{
		TabSize:      tabSize,
		InsertSpaces: req.InsertSpaces,
	}

	edit, err := mgr.RangeFormatting(ctx, uri, req.File, req.StartLine, req.StartCol, req.EndLine, req.EndCol, opts)
	if err != nil {
		return nil, safeError("range formatting failed", err)
	}
	if edit == nil {
		return map[string]any{"edit": nil}, nil
	}
	return map[string]any{"edit": edit}, nil
}

func (h *CommandHandler) handleLSPSelectionRange(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		URI       string           `json:"uri"`
		File      string           `json:"file"`
		Positions []lsp.Position   `json:"positions"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, errNotConnected("LSP not configured")
	}

	uri := req.URI
	if uri == "" {
		uri = lsp.FileURI(h.server.workspacePath, req.File)
	}

	ranges, err := mgr.SelectionRanges(ctx, uri, req.File, req.Positions)
	if err != nil {
		return nil, safeError("selection range failed", err)
	}
	return map[string]any{"ranges": ranges}, nil
}

func (h *CommandHandler) handleLSPOnTypeFormatting(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		URI          string `json:"uri"`
		File         string `json:"file"`
		Line         int    `json:"line"`
		Column       int    `json:"column"`
		TriggerChar  string `json:"triggerChar"`
		TabSize      int    `json:"tabSize"`
		InsertSpaces bool   `json:"insertSpaces"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}
	if req.TriggerChar == "" {
		return nil, errValidation("triggerChar is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, errNotConnected("LSP not configured")
	}

	uri := req.URI
	if uri == "" {
		uri = lsp.FileURI(h.server.workspacePath, req.File)
	}

	tabSize := req.TabSize
	if tabSize <= 0 {
		tabSize = 2
	}
	opts := lsp.FormattingOptions{
		TabSize:      tabSize,
		InsertSpaces: req.InsertSpaces,
	}

	edit, err := mgr.OnTypeFormatting(ctx, uri, req.File, req.Line, req.Column, req.TriggerChar, opts)
	if err != nil {
		return nil, safeError("on-type formatting failed", err)
	}
	if edit == nil {
		return map[string]any{"edit": nil}, nil
	}
	return map[string]any{"edit": edit}, nil
}

func (h *CommandHandler) handleLSPSemanticTokens(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		URI  string `json:"uri"`
		File string `json:"file"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, nil // LSP not configured, silently ignore
	}

	uri := req.URI
	if uri == "" {
		uri = lsp.FileURI(h.server.workspacePath, req.File)
	}

	tokens, err := mgr.SemanticTokens(ctx, uri, req.File)
	if err != nil {
		return nil, safeError("semantic tokens failed", err)
	}
	return map[string]any{"tokens": tokens}, nil
}

func (h *CommandHandler) handleLSPSemanticTokensRange(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		URI       string `json:"uri"`
		File      string `json:"file"`
		StartLine int    `json:"startLine"`
		StartCol  int    `json:"startCol"`
		EndLine   int    `json:"endLine"`
		EndCol    int    `json:"endCol"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, nil
	}

	uri := req.URI
	if uri == "" {
		uri = lsp.FileURI(h.server.workspacePath, req.File)
	}

	tokens, err := mgr.SemanticTokensRange(ctx, uri, req.File, req.StartLine, req.StartCol, req.EndLine, req.EndCol)
	if err != nil {
		return nil, safeError("semantic tokens range failed", err)
	}
	return map[string]any{"tokens": tokens}, nil
}

func (h *CommandHandler) handleLSPSemanticTokensLegend(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		File string `json:"file"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, nil
	}

	legend := mgr.GetSemanticTokensLegend(req.File)
	if legend == nil {
		return map[string]any{"legend": nil}, nil
	}
	return map[string]any{
		"legend": map[string]any{
			"tokenTypes":     legend.TokenTypes,
			"tokenModifiers": legend.TokenModifiers,
		},
	}, nil
}

func (h *CommandHandler) handleLSPDocumentLinks(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		URI  string `json:"uri"`
		File string `json:"file"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, nil
	}

	uri := req.URI
	if uri == "" {
		uri = lsp.FileURI(h.server.workspacePath, req.File)
	}

	links, err := mgr.DocumentLinks(ctx, uri, req.File)
	if err != nil {
		return nil, safeError("document links failed", err)
	}
	return map[string]any{"links": links}, nil
}

func (h *CommandHandler) handleLSPCodeLenses(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		URI  string `json:"uri"`
		File string `json:"file"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, nil
	}

	uri := req.URI
	if uri == "" {
		uri = lsp.FileURI(h.server.workspacePath, req.File)
	}

	lenses, err := mgr.CodeLenses(ctx, uri, req.File)
	if err != nil {
		return nil, safeError("code lenses failed", err)
	}
	return map[string]any{"lenses": lenses}, nil
}

func (h *CommandHandler) handlePrepareCallHierarchy(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		URI    string `json:"uri"`
		File   string `json:"file"`
		Line   int    `json:"line"`
		Column int    `json:"column"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	// Input validation
	req.File = strings.TrimSpace(req.File)
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, nil
	}

	uri := req.URI
	if uri == "" {
		uri = lsp.FileURI(h.server.workspacePath, req.File)
	}

	items, err := mgr.PrepareCallHierarchy(ctx, uri, req.File, req.Line, req.Column)
	if err != nil {
		return nil, safeError("prepare call hierarchy failed", err)
	}
	return items, nil
}

func (h *CommandHandler) handleCallHierarchyIncomingCalls(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		File string         `json:"file"`
		Item map[string]any `json:"item"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, nil
	}

	item := mapToCallHierarchyItem(req.Item)
	calls, err := mgr.CallHierarchyIncomingCalls(ctx, req.File, item)
	if err != nil {
		return nil, safeError("call hierarchy incoming calls failed", err)
	}
	return calls, nil
}

func (h *CommandHandler) handleCallHierarchyOutgoingCalls(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		File string         `json:"file"`
		Item map[string]any `json:"item"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, nil
	}

	item := mapToCallHierarchyItem(req.Item)
	calls, err := mgr.CallHierarchyOutgoingCalls(ctx, req.File, item)
	if err != nil {
		return nil, safeError("call hierarchy outgoing calls failed", err)
	}
	return calls, nil
}

func (h *CommandHandler) handlePrepareTypeHierarchy(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		URI    string `json:"uri"`
		File   string `json:"file"`
		Line   int    `json:"line"`
		Column int    `json:"column"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	req.File = strings.TrimSpace(req.File)
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, nil
	}

	uri := req.URI
	if uri == "" {
		uri = lsp.FileURI(h.server.workspacePath, req.File)
	}

	items, err := mgr.PrepareTypeHierarchy(ctx, uri, req.File, req.Line, req.Column)
	if err != nil {
		return nil, safeError("prepare type hierarchy failed", err)
	}
	return items, nil
}

func (h *CommandHandler) handleTypeHierarchySupertypes(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		File string         `json:"file"`
		Item map[string]any `json:"item"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, nil
	}

	item := mapToTypeHierarchyItem(req.Item)
	items, err := mgr.TypeHierarchySupertypes(ctx, req.File, item)
	if err != nil {
		return nil, safeError("type hierarchy supertypes failed", err)
	}
	return items, nil
}

func (h *CommandHandler) handleTypeHierarchySubtypes(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		File string         `json:"file"`
		Item map[string]any `json:"item"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, nil
	}

	item := mapToTypeHierarchyItem(req.Item)
	items, err := mgr.TypeHierarchySubtypes(ctx, req.File, item)
	if err != nil {
		return nil, safeError("type hierarchy subtypes failed", err)
	}
	return items, nil
}

func (h *CommandHandler) handleLSPDiagnostics(_ context.Context, params json.RawMessage) (any, error) {
	mgr := h.server.LSPManager()
	if mgr == nil {
		return map[string]any{"diagnostics": map[string]any{}}, nil
	}

	var req struct {
		URI string `json:"uri"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, fmt.Errorf("invalid lsp_diagnostics params: %w", err)
	}

	if req.URI == "" {
		// Return all diagnostics
		return map[string]any{"diagnostics": mgr.GetAllDiagnostics()}, nil
	}

	return map[string]any{"diagnostics": map[string]any{req.URI: mgr.GetDiagnostics(req.URI)}}, nil
}


func (h *CommandHandler) handleLSPCompletion(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		URI             string `json:"uri"`
		File            string `json:"file"`
		Line            int    `json:"line"`
		Column          int    `json:"column"`
		TriggerKind     int    `json:"triggerKind"`
		TriggerCharacter string `json:"triggerCharacter"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, errNotConnected("LSP not configured")
	}

	uri := req.URI
	if uri == "" {
		uri = lsp.FileURI(h.server.workspacePath, req.File)
	}

	// Default to Invoked (1) if not specified
	triggerKind := req.TriggerKind
	if triggerKind == 0 {
		triggerKind = 1
	}

	items, err := mgr.Completion(ctx, uri, req.File, req.Line, req.Column, triggerKind, req.TriggerCharacter)
	if err != nil {
		return nil, safeError("completion failed", err)
	}
	return map[string]any{"items": items}, nil
}

func (h *CommandHandler) handleLSPHover(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		URI    string `json:"uri"`
		File   string `json:"file"`
		Line   int    `json:"line"`
		Column int    `json:"column"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, errNotConnected("LSP not configured")
	}

	uri := req.URI
	if uri == "" {
		uri = lsp.FileURI(h.server.workspacePath, req.File)
	}

	result, err := mgr.Hover(ctx, uri, req.File, req.Line, req.Column)
	if err != nil {
		return nil, safeError("hover failed", err)
	}
	if result == nil {
		return map[string]any{"contents": nil}, nil
	}
	return result, nil
}

func (h *CommandHandler) handleLSPDefinition(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		URI    string `json:"uri"`
		File   string `json:"file"`
		Line   int    `json:"line"`
		Column int    `json:"column"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, errNotConnected("LSP not configured")
	}

	uri := req.URI
	if uri == "" {
		uri = lsp.FileURI(h.server.workspacePath, req.File)
	}

	locations, err := mgr.Definition(ctx, uri, req.File, req.Line, req.Column)
	if err != nil {
		return nil, safeError("definition failed", err)
	}
	return map[string]any{"locations": locations}, nil
}

func (h *CommandHandler) handleLSPImplementation(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		URI    string `json:"uri"`
		File   string `json:"file"`
		Line   int    `json:"line"`
		Column int    `json:"column"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, errNotConnected("LSP not configured")
	}

	uri := req.URI
	if uri == "" {
		uri = lsp.FileURI(h.server.workspacePath, req.File)
	}

	locations, err := mgr.Implementation(ctx, uri, req.File, req.Line, req.Column)
	if err != nil {
		return nil, safeError("implementation failed", err)
	}
	return map[string]any{"locations": locations}, nil
}

func (h *CommandHandler) handleLSPTypeDefinition(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		URI    string `json:"uri"`
		File   string `json:"file"`
		Line   int    `json:"line"`
		Column int    `json:"column"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, errNotConnected("LSP not configured")
	}

	uri := req.URI
	if uri == "" {
		uri = lsp.FileURI(h.server.workspacePath, req.File)
	}

	locations, err := mgr.TypeDefinition(ctx, uri, req.File, req.Line, req.Column)
	if err != nil {
		return nil, safeError("type definition failed", err)
	}
	return map[string]any{"locations": locations}, nil
}

func (h *CommandHandler) handleLSPReferences(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		URI    string `json:"uri"`
		File   string `json:"file"`
		Line   int    `json:"line"`
		Column int    `json:"column"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, errNotConnected("LSP not configured")
	}

	uri := req.URI
	if uri == "" {
		uri = lsp.FileURI(h.server.workspacePath, req.File)
	}

	locations, err := mgr.References(ctx, uri, req.File, req.Line, req.Column)
	if err != nil {
		return nil, safeError("references failed", err)
	}
	return map[string]any{"locations": locations}, nil
}

func (h *CommandHandler) handleLSPDidOpen(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		URI      string `json:"uri"`
		File     string `json:"file"`
		Language string `json:"language"`
		Content  string `json:"content"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, nil // LSP not configured, silently ignore
	}

	uri := req.URI
	if uri == "" {
		uri = lsp.FileURI(h.server.workspacePath, req.File)
	}

	mgr.DidOpen(ctx, uri, req.File, req.Content)
	return map[string]bool{"ok": true}, nil
}

func (h *CommandHandler) handleLSPDidChange(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		File    string `json:"file"`
		Content string `json:"content"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, nil
	}

	mgr.DidChange(req.File, req.Content)
	return map[string]bool{"ok": true}, nil
}

func (h *CommandHandler) handleLSPDidChangeIncremental(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		File    string `json:"file"`
		Changes []struct {
			Range       *struct {
				Start struct{ Line, Character int }
				End   struct{ Line, Character int }
			} `json:"range,omitempty"`
			RangeLength *int    `json:"rangeLength,omitempty"`
			Text        string  `json:"text"`
		} `json:"changes"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" || len(req.Changes) == 0 {
		return nil, errValidation("file and changes are required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, nil
	}

	changes := make([]lsp.TextDocumentContentChangeEvent, len(req.Changes))
	for i, ch := range req.Changes {
		changes[i] = lsp.TextDocumentContentChangeEvent{Text: ch.Text}
		if ch.Range != nil {
			changes[i].Range = &lsp.Range{
				Start: lsp.Position{Line: ch.Range.Start.Line, Character: ch.Range.Start.Character},
				End:   lsp.Position{Line: ch.Range.End.Line, Character: ch.Range.End.Character},
			}
		}
		if ch.RangeLength != nil {
			changes[i].RangeLength = ch.RangeLength
		}
	}

	mgr.DidChangeIncremental(req.File, changes)
	return map[string]bool{"ok": true}, nil
}

func (h *CommandHandler) handleLSPDidClose(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		File string `json:"file"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, nil
	}

	mgr.DidClose(req.File)
	return map[string]bool{"ok": true}, nil
}

func (h *CommandHandler) handleLSPDidSave(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		File string  `json:"file"`
		Text *string `json:"text"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.File == "" {
		return nil, errValidation("file is required")
	}

	mgr := h.server.LSPManager()
	if mgr == nil {
		return nil, nil
	}

	mgr.DidSave(req.File, req.Text)
	return map[string]bool{"ok": true}, nil
}

func (h *CommandHandler) handleLSPStatus(_ context.Context, _ json.RawMessage) (any, error) {
	mgr := h.server.LSPManager()
	if mgr == nil {
		return map[string]any{"servers": []any{}}, nil
	}
	return map[string]any{
		"servers":  mgr.Status(),
		"rootDir": mgr.RootDir(),
	}, nil
}

func (h *CommandHandler) handleLSPSupportsIncremental(_ context.Context, params json.RawMessage) (any, error) {
	var req struct {
		File string `json:"file"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	mgr := h.server.LSPManager()
	if mgr == nil || req.File == "" {
		return map[string]bool{"supported": false}, nil
	}

	return map[string]bool{"supported": mgr.SupportsIncrementalSync(req.File)}, nil
}

