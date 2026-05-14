package lsp

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/log"
)

var managerLog = log.With("component", "LSPManager")

// languageToServer maps file extensions to LSP server names.
var languageToServer = map[string]string{
	".go":   "gopls",
	".rs":   "rust-analyzer",
	".py":   "pyright",
	".ts":   "typescript-language-server",
	".tsx":  "typescript-language-server",
	".js":   "typescript-language-server",
	".jsx":  "typescript-language-server",
	".java": "jdtls",
	".c":    "clangd",
	".cpp":  "clangd",
	".cc":   "clangd",
	".cxx":  "clangd",
	".h":    "clangd",
	".hpp":  "clangd",
	".cs":   "omnisharp",
	".csx":  "omnisharp",
	".mbr":  "moon",
}

// languageIDs maps file extensions to LSP language IDs.
var languageIDs = map[string]string{
	".go":   "go",
	".rs":   "rust",
	".py":   "python",
	".ts":   "typescript",
	".tsx":  "typescriptreact",
	".js":   "javascript",
	".jsx":  "javascriptreact",
	".java": "java",
	".c":    "c",
	".cpp":  "cpp",
	".cc":   "cpp",
	".cxx":  "cpp",
	".h":    "c",
	".hpp":  "cpp",
	".cs":   "csharp",
	".csx":  "csharp",
	".mbr":  "moonbit",
}

// Manager manages LSP server instances for different languages.
type Manager struct {
	scanner *Scanner
	rootDir string

	mu          sync.RWMutex
	clients     map[string]*Client          // serverName -> client
	docVersion  map[string]int64            // uri -> document version (per-document versioning)
	diagnostics map[string][]Diagnostic     // uri -> diagnostics from LSP server
	closedDocs  map[string]struct{}         // URIs that were explicitly closed (suppress stale diagnostics)
	diagHandler func(uri string, diags []Diagnostic) // optional callback for diagnostics
}

// NewManager creates a new LSP manager.
func NewManager(rootDir string, scanner *Scanner) *Manager {
	return &Manager{
		scanner:     scanner,
		rootDir:     rootDir,
		clients:     make(map[string]*Client),
		docVersion:  make(map[string]int64),
		diagnostics: make(map[string][]Diagnostic),
		closedDocs:  make(map[string]struct{}),
	}
}

// OnDiagnostics registers a callback for when diagnostics are received.
func (m *Manager) OnDiagnostics(handler func(uri string, diags []Diagnostic)) {
	m.mu.Lock()
	m.diagHandler = handler
	m.mu.Unlock()
}

// GetLanguageID returns the LSP language ID for a file extension.
func GetLanguageID(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	if id, ok := languageIDs[ext]; ok {
		return id
	}
	return ""
}

// GetServerName returns the LSP server name for a file extension.
func GetServerName(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	if name, ok := languageToServer[ext]; ok {
		return name
	}
	return ""
}

// StartServer starts an LSP server for the given language.
func (m *Manager) StartServer(ctx context.Context, language string) error {
	ext := "." + language
	serverName := ""
	if name, ok := languageToServer[ext]; ok {
		serverName = name
	} else {
		// Try direct lookup by language name
		for ext2, name := range languageToServer {
			if languageIDs[ext2] == language {
				serverName = name
				break
			}
		}
	}
	if serverName == "" {
		return fmt.Errorf("no LSP server configured for language %q", language)
	}

	// Check if already running
	m.mu.RLock()
	if client, ok := m.clients[serverName]; ok && client.Initialized() {
		m.mu.RUnlock()
		return nil
	}
	m.mu.RUnlock()

	// Find server executable via scanner (scan if not yet done)
	servers := m.scanner.GetInstalledServers()
	if len(servers) == 0 {
		m.scanner.Scan(ctx) // populate installed servers cache
		servers = m.scanner.GetInstalledServers()
	}
	var server *LSPServer
	for _, s := range servers {
		if s.ServerName == serverName {
			server = s
			break
		}
	}
	if server == nil {
		return fmt.Errorf("LSP server %q is not installed", serverName)
	}

	client := NewClient()

	// Register handler for publishDiagnostics notifications
	client.OnNotification("textDocument/publishDiagnostics", func(params json.RawMessage) {
		var pubParams PublishDiagnosticsParams
		if err := json.Unmarshal(params, &pubParams); err != nil {
			clientLog.Warn("failed to unmarshal publishDiagnostics params", "error", err)
			return
		}
		m.mu.Lock()
		// Suppress stale diagnostics for closed documents (race between DidClose and async publishDiagnostics)
		if _, closed := m.closedDocs[pubParams.URI]; closed {
			m.mu.Unlock()
			return
		}
		m.diagnostics[pubParams.URI] = pubParams.Diagnostics
		handler := m.diagHandler
		m.mu.Unlock()

		managerLog.Debug("received diagnostics", "uri", pubParams.URI, "count", len(pubParams.Diagnostics))

		// Call handler outside lock
		if handler != nil {
			handler(pubParams.URI, pubParams.Diagnostics)
		}
	})

	rootURI := "file://" + m.rootDir
	if err := client.Start(ctx, server.Path, server.Args, rootURI, serverName); err != nil {
		return fmt.Errorf("start LSP server %q: %w", serverName, err)
	}

	m.mu.Lock()
	// Double-check: another goroutine may have started it
	if existing, ok := m.clients[serverName]; ok && existing.Initialized() {
		m.mu.Unlock()
		client.Close()
		return nil
	}
	m.clients[serverName] = client
	m.mu.Unlock()

	managerLog.Info("LSP server started", "server", serverName, "language", language)
	return nil
}

// StopServer stops an LSP server.
func (m *Manager) StopServer(serverName string) error {
	m.mu.Lock()
	client, ok := m.clients[serverName]
	if ok {
		delete(m.clients, serverName)
	}
	m.mu.Unlock()

	if client != nil {
		return client.Close()
	}
	return nil
}

// GetClient returns the LSP client for a file, starting it if needed.
func (m *Manager) GetClient(ctx context.Context, filename string) (*Client, error) {
	serverName := GetServerName(filename)
	if serverName == "" {
		return nil, fmt.Errorf("no LSP server for file %q", filename)
	}

	m.mu.RLock()
	client, ok := m.clients[serverName]
	m.mu.RUnlock()

	if ok && client.Initialized() {
		return client, nil
	}

	// Start the server
	language := GetLanguageID(filename)
	if language == "" {
		return nil, fmt.Errorf("unknown language for file %q", filename)
	}

	if err := m.StartServer(ctx, language); err != nil {
		return nil, err
	}

	m.mu.RLock()
	client, ok = m.clients[serverName]
	m.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("LSP server %q failed to start", serverName)
	}
	return client, nil
}

// Completion requests completions for a file at a position.
// Note: Caller must ensure DidOpen was called before this; we don't re-open here.
func (m *Manager) Completion(ctx context.Context, uri, filename string, line, column int) ([]map[string]any, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	// Use short timeout for interactive completions
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	return client.Completion(ctx, uri, line, column)
}

// Hover requests hover information for a file at a position.
func (m *Manager) Hover(ctx context.Context, uri, filename string, line, column int) (*HoverResult, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return client.Hover(ctx, uri, line, column)
}

// Definition requests go-to-definition for a file at a position.
func (m *Manager) Definition(ctx context.Context, uri, filename string, line, column int) ([]Location, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return client.Definition(ctx, uri, line, column)
}

// Implementation requests go-to-implementation for a file at a position.
func (m *Manager) Implementation(ctx context.Context, uri, filename string, line, column int) ([]Location, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return client.Implementation(ctx, uri, line, column)
}

// TypeDefinition requests go-to-type-definition for a file at a position.
func (m *Manager) TypeDefinition(ctx context.Context, uri, filename string, line, column int) ([]Location, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return client.TypeDefinition(ctx, uri, line, column)
}

// References requests find-references for a file at a position.
func (m *Manager) References(ctx context.Context, uri, filename string, line, column int) ([]Location, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return client.References(ctx, uri, line, column)
}

// SignatureHelp requests signature help for a file at a position.
func (m *Manager) SignatureHelp(ctx context.Context, uri, filename string, line, column int) (*SignatureHelp, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	return client.SignatureHelp(ctx, uri, line, column)
}

// DocumentSymbols requests document symbols for outline view.
func (m *Manager) DocumentSymbols(ctx context.Context, uri, filename string) ([]DocumentSymbol, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return client.DocumentSymbols(ctx, uri)
}

// CodeActions requests code actions (quick fixes) for a file at a position.
func (m *Manager) CodeActions(ctx context.Context, uri, filename string, line, column int) ([]CodeAction, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return client.CodeActions(ctx, uri, line, column)
}

// Rename sends a textDocument/rename request.
func (m *Manager) Rename(ctx context.Context, uri, filename string, line, column int, newName string) (*WorkspaceEdit, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return client.Rename(ctx, uri, line, column, newName)
}

// Formatting sends a textDocument/formatting request.
func (m *Manager) Formatting(ctx context.Context, uri, filename string, opts FormattingOptions) (*WorkspaceEdit, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return client.Formatting(ctx, uri, opts)
}

// RangeFormatting sends a textDocument/rangeFormatting request.
func (m *Manager) RangeFormatting(ctx context.Context, uri, filename string, startLine, startCol, endLine, endCol int, opts FormattingOptions) (*WorkspaceEdit, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return client.RangeFormatting(ctx, uri, startLine, startCol, endLine, endCol, opts)
}

// SelectionRanges sends a textDocument/selectionRange request.
func (m *Manager) SelectionRanges(ctx context.Context, uri, filename string, positions []Position) ([]SelectionRange, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return client.SelectionRanges(ctx, uri, positions)
}

// OnTypeFormatting sends a textDocument/onTypeFormatting request.
func (m *Manager) OnTypeFormatting(ctx context.Context, uri, filename string, line, column int, triggerChar string, opts FormattingOptions) (*WorkspaceEdit, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return client.OnTypeFormatting(ctx, uri, line, column, triggerChar, opts)
}

// DocumentHighlight sends a textDocument/documentHighlight request.
func (m *Manager) DocumentHighlight(ctx context.Context, uri, filename string, line, column int) ([]DocumentHighlight, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return client.DocumentHighlight(ctx, uri, line, column)
}

// InlayHints sends a textDocument/inlayHint request.
func (m *Manager) InlayHints(ctx context.Context, uri, filename string, startLine, endLine int) ([]InlayHint, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return client.InlayHints(ctx, uri, startLine, endLine)
}

// FoldingRanges sends a textDocument/foldingRange request.
func (m *Manager) FoldingRanges(ctx context.Context, uri, filename string) ([]FoldingRange, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return client.FoldingRanges(ctx, uri)
}

// WorkspaceSymbols sends a workspace/symbol request.
func (m *Manager) WorkspaceSymbols(ctx context.Context, query string) ([]WorkspaceSymbol, error) {
	// Get any client (gopls handles workspace-wide search)
	m.mu.RLock()
	var client *Client
	for _, c := range m.clients {
		if c.Initialized() {
			client = c
			break
		}
	}
	m.mu.RUnlock()

	if client == nil {
		return nil, fmt.Errorf("no LSP server available for workspace symbols")
	}

	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	return client.WorkspaceSymbols(ctx, query)
}

// SemanticTokens requests semantic tokens for a file (full document).
func (m *Manager) SemanticTokens(ctx context.Context, uri, filename string) (*SemanticTokens, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return client.SemanticTokens(ctx, uri)
}

// SemanticTokensRange requests semantic tokens for a range.
func (m *Manager) SemanticTokensRange(ctx context.Context, uri, filename string, startLine, startChar, endLine, endChar int) (*SemanticTokens, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return client.SemanticTokensRange(ctx, uri, startLine, startChar, endLine, endChar)
}

// GetSemanticTokensLegend returns the semantic tokens legend for the LSP server
// handling the given file. This is needed for Monaco to correctly decode token data.
func (m *Manager) GetSemanticTokensLegend(filename string) *SemanticTokensLegend {
	client, err := m.GetClient(context.Background(), filename)
	if err != nil {
		return nil
	}
	return client.SemanticTokensLegend()
}

// DocumentLinks requests document links (clickable URLs, package imports, etc.)
func (m *Manager) DocumentLinks(ctx context.Context, uri, filename string) ([]DocumentLink, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return client.DocumentLinks(ctx, uri)
}

// CodeLenses requests code lenses (inline actionable indicators) for a document.
func (m *Manager) CodeLenses(ctx context.Context, uri, filename string) ([]CodeLens, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return client.CodeLenses(ctx, uri)
}

// PrepareCallHierarchy prepares call hierarchy for a symbol at the given position.
func (m *Manager) PrepareCallHierarchy(ctx context.Context, uri, filename string, line, column int) ([]CallHierarchyItem, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return client.PrepareCallHierarchy(ctx, uri, line, column)
}

// CallHierarchyIncomingCalls returns incoming calls for a call hierarchy item.
func (m *Manager) CallHierarchyIncomingCalls(ctx context.Context, filename string, item CallHierarchyItem) ([]CallHierarchyIncomingCall, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	return client.CallHierarchyIncomingCalls(ctx, item)
}

// CallHierarchyOutgoingCalls returns outgoing calls for a call hierarchy item.
func (m *Manager) CallHierarchyOutgoingCalls(ctx context.Context, filename string, item CallHierarchyItem) ([]CallHierarchyOutgoingCall, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	return client.CallHierarchyOutgoingCalls(ctx, item)
}

// PrepareTypeHierarchy prepares type hierarchy for a symbol at the given position.
func (m *Manager) PrepareTypeHierarchy(ctx context.Context, uri, filename string, line, column int) ([]TypeHierarchyItem, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return client.PrepareTypeHierarchy(ctx, uri, line, column)
}

// TypeHierarchySupertypes returns supertypes (parent types/interfaces) for a type hierarchy item.
func (m *Manager) TypeHierarchySupertypes(ctx context.Context, filename string, item TypeHierarchyItem) ([]TypeHierarchyItem, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	return client.TypeHierarchySupertypes(ctx, item)
}

// TypeHierarchySubtypes returns subtypes (child types/implementations) for a type hierarchy item.
func (m *Manager) TypeHierarchySubtypes(ctx context.Context, filename string, item TypeHierarchyItem) ([]TypeHierarchyItem, error) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	return client.TypeHierarchySubtypes(ctx, item)
}

// GetDiagnostics returns the diagnostics for a URI.
func (m *Manager) GetDiagnostics(uri string) []Diagnostic {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.diagnostics[uri]
}

// GetAllDiagnostics returns all diagnostics.
func (m *Manager) GetAllDiagnostics() map[string][]Diagnostic {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make(map[string][]Diagnostic, len(m.diagnostics))
	for uri, diags := range m.diagnostics {
		result[uri] = append([]Diagnostic(nil), diags...)
	}
	return result
}

// DidOpen notifies the appropriate LSP server that a document was opened.
func (m *Manager) DidOpen(ctx context.Context, uri, filename, content string) {
	client, err := m.GetClient(ctx, filename)
	if err != nil {
		return
	}
	// Remove from closed set so diagnostics flow again
	m.mu.Lock()
	delete(m.closedDocs, uri)
	m.mu.Unlock()
	client.DidOpen(uri, GetLanguageID(filename), content)
}

// DidChange notifies the appropriate LSP server that a document was changed (full sync).
func (m *Manager) DidChange(filename string, content string) {
	serverName := GetServerName(filename)
	if serverName == "" {
		return
	}

	m.mu.RLock()
	client, ok := m.clients[serverName]
	m.mu.RUnlock()

	if !ok {
		return
	}

	uri := toFileURI(filename)

	m.mu.Lock()
	m.docVersion[uri]++
	version := m.docVersion[uri]
	m.mu.Unlock()

	client.DidChange(uri, content, int(version))
}

// DidChangeIncremental notifies the appropriate LSP server with incremental changes.
func (m *Manager) DidChangeIncremental(filename string, changes []TextDocumentContentChangeEvent) {
	serverName := GetServerName(filename)
	if serverName == "" {
		return
	}

	m.mu.RLock()
	client, ok := m.clients[serverName]
	m.mu.RUnlock()

	if !ok {
		return
	}

	uri := toFileURI(filename)

	m.mu.Lock()
	m.docVersion[uri]++
	version := m.docVersion[uri]
	m.mu.Unlock()

	client.DidChangeIncremental(uri, int(version), changes)
}

// SupportsIncrementalSync returns true if the LSP server for this file supports incremental sync.
func (m *Manager) SupportsIncrementalSync(filename string) bool {
	serverName := GetServerName(filename)
	if serverName == "" {
		return false
	}

	m.mu.RLock()
	client, ok := m.clients[serverName]
	m.mu.RUnlock()

	if !ok {
		return false
	}

	return client.SupportsIncrementalSync()
}

// DidClose notifies the appropriate LSP server that a document was closed.
func (m *Manager) DidClose(filename string) {
	serverName := GetServerName(filename)
	if serverName == "" {
		return
	}

	m.mu.RLock()
	client, ok := m.clients[serverName]
	m.mu.RUnlock()

	if !ok {
		return
	}
	uri := toFileURI(filename)
	client.DidClose(uri)

	m.mu.Lock()
	delete(m.docVersion, uri)
	delete(m.diagnostics, uri)
	m.closedDocs[uri] = struct{}{} // suppress stale diagnostics after close
	m.mu.Unlock()
}

// DidSave notifies the appropriate LSP server that a document was saved.
func (m *Manager) DidSave(filename string, text *string) {
	serverName := GetServerName(filename)
	if serverName == "" {
		return
	}

	m.mu.RLock()
	client, ok := m.clients[serverName]
	m.mu.RUnlock()

	if !ok {
		return
	}
	uri := toFileURI(filename)
	client.DidSave(uri, text)
}

// toFileURI converts a filename to an absolute file:// URI.
// If the filename is relative, it is resolved against the current working directory.
func toFileURI(filename string) string {
	if !filepath.IsAbs(filename) {
		if abs, err := filepath.Abs(filename); err == nil {
			filename = abs
		}
	}
	return "file://" + filename
}

// FileURI converts a workspace-relative file path to a file:// URI.
func FileURI(workspacePath, relPath string) string {
	absPath := filepath.Join(workspacePath, relPath)
	if !filepath.IsAbs(absPath) {
		absPath, _ = filepath.Abs(absPath)
	}
	return "file://" + absPath
}

// Close stops all LSP servers.
func (m *Manager) Close() error {
	m.mu.Lock()
	clients := make(map[string]*Client, len(m.clients))
	for k, v := range m.clients {
		clients[k] = v
		delete(m.clients, k)
	}
	m.mu.Unlock()

	var errs []string
	for name, client := range clients {
		if err := client.Close(); err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", name, err))
		}
	}

	if len(errs) > 0 {
		return fmt.Errorf("LSP shutdown errors: %s", strings.Join(errs, "; "))
	}
	return nil
}

// Status returns the status of all managed LSP servers.
func (m *Manager) Status() []map[string]any {
	m.mu.RLock()
	defer m.mu.RUnlock()

	status := make([]map[string]any, 0, len(m.clients))
	for name, client := range m.clients {
		entry := map[string]any{
			"server":      name,
			"initialized": client.Initialized(),
		}
		if caps := client.Capabilities(); len(caps) > 0 {
			entry["capabilities"] = caps
		}
		status = append(status, entry)
	}
	return status
}

// RootDir returns the workspace root directory.
func (m *Manager) RootDir() string {
	return m.rootDir
}

// ResolveWorkspacePath finds the workspace root by searching for known markers.
func ResolveWorkspacePath(startDir string) string {
	dir := startDir
	if dir == "" {
		dir, _ = os.Getwd()
	}
	if dir == "" {
		return "."
	}

	markers := []string{
		".git",
		"go.mod",
		"package.json",
		"Cargo.toml",
		"pyproject.toml",
		"pom.xml",
		"*.sln",
	}

	for i := 0; i < 20; i++ { // max 20 levels up
		for _, marker := range markers {
			if strings.Contains(marker, "*") {
				matches, _ := filepath.Glob(filepath.Join(dir, marker))
				if len(matches) > 0 {
					return dir
				}
			} else {
				if _, err := os.Stat(filepath.Join(dir, marker)); err == nil {
					return dir
				}
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}

	return startDir
}
