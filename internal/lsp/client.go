// Package lsp provides LSP (Language Server Protocol) client integration.
//
// Architecture:
//   - Client manages a single LSP server process via stdio
//   - Manager routes requests to the correct client by file language
//   - WebSocket handlers expose LSP operations to the frontend
//
// LSP base protocol (Content-Length header + CRLF + JSON body):
//
//	Content-Length: <len>\r\n
//	\r\n
//	<JSON-RPC body>
package lsp

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/log"
)

var clientLog = log.With("component", "LSPClient")

// LSP errors
var (
	ErrClientClosed    = errors.New("lsp client closed")
	ErrNotInitialized  = errors.New("lsp client not initialized")
	ErrServerCrashed   = errors.New("lsp server crashed")
	ErrRequestTimeout  = errors.New("lsp request timed out")
	ErrRequestFailed   = errors.New("lsp request failed")
	ErrAlreadyRunning  = errors.New("lsp client already running")
)

const (
	// maxMessageSize limits LSP message size (10MB)
	maxMessageSize = 10 << 20
	// defaultRequestTimeout is the timeout for LSP requests
	defaultRequestTimeout = 10 * time.Second
	// initTimeout is the timeout for initialize handshake
	initTimeout = 30 * time.Second
	// shutdownTimeout is the timeout for graceful shutdown
	shutdownTimeout = 5 * time.Second
)

// LSPRequest is a JSON-RPC request sent to the LSP server.
type LSPRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int64  `json:"id,omitempty"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

// LSPResponse is a JSON-RPC response from the LSP server.
type LSPResponse struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int64  `json:"id,omitempty"`
	Result  any    `json:"result,omitempty"`
	Error   *LSPError `json:"error,omitempty"`
}

// LSPError is a JSON-RPC error.
type LSPError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

// LSPNotification is a JSON-RPC notification (no ID).
type LSPNotification struct {
	JSONRPC string `json:"jsonrpc"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

// Client manages a single LSP server process.
type Client struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout io.ReadCloser

	mu        sync.Mutex
	closed    bool
	closing   bool // true during Close() to allow shutdown request
	nextID    atomic.Int64
	pending   map[int64]chan *LSPResponse
	handlers  map[string]func(params json.RawMessage)

	initialized    bool
	serverName     string            // identifies which LSP server (gopls, rust-analyzer, etc.)
	capabilities   map[string]any
	supportsIncremental bool // true if server reports textDocumentSync.change >= 2
	semanticTokensLegend *SemanticTokensLegend // server's legend for semantic token decoding

	wg     sync.WaitGroup
	cancel context.CancelFunc
}

// NewClient creates a new LSP client (not yet started).
func NewClient() *Client {
	return &Client{
		pending:     make(map[int64]chan *LSPResponse),
		handlers:    make(map[string]func(params json.RawMessage)),
		capabilities: make(map[string]any),
	}
}

// getInitializationOptions returns server-specific initialization options.
// Each LSP server has its own options format - this function returns the
// correct options for the given server name.
func getInitializationOptions(serverName string) map[string]any {
	switch serverName {
	case "gopls":
		// gopls requires "semanticTokens": true to produce token data (R4971)
		// and uses "hints" for inlay hint configuration (R4962)
		return map[string]any{
			"semanticTokens": true,
			"hints": map[string]any{
				"assignVariableTypes":    true,
				"compositeLiteralFields": true,
				"constantValues":         true,
				"functionTypeParameters": true,
				"parameterNames":         true,
				"rangeVariableTypes":     true,
			},
		}
	case "rust-analyzer":
		return map[string]any{
			"cargo": map[string]any{
				"loadOutDirsFromCheck": true,
			},
			"procMacro": map[string]any{
				"enable": true,
			},
		}
	case "pyright":
		return map[string]any{
			"python": map[string]any{
				"analysis": map[string]any{
					"typeCheckingMode": "basic",
				},
			},
		}
	case "typescript-language-server", "ts_ls":
		return map[string]any{
			"preferences": map[string]any{
				"includeInlayParameterNameHints": "all",
			},
		}
	default:
		// No server-specific options
		return nil
	}
}

// Start launches the LSP server process and begins reading messages.
// serverName identifies which LSP server (gopls, rust-analyzer, etc.) for server-specific behavior.
func (c *Client) Start(ctx context.Context, serverPath string, args []string, rootURI, serverName string) error {
	c.mu.Lock()
	if c.initialized {
		c.mu.Unlock()
		return ErrAlreadyRunning
	}
	c.serverName = serverName
	c.mu.Unlock()

	ctx, cancel := context.WithCancel(ctx)
	c.cancel = cancel

	// Build server args: use provided args, or default to --stdio
	var serverArgs []string
	if args != nil {
		serverArgs = make([]string, len(args))
		copy(serverArgs, args)
	} else {
		serverArgs = []string{"--stdio"}
	}
	c.cmd = exec.CommandContext(ctx, serverPath, serverArgs...)

	stdinPipe, err := c.cmd.StdinPipe()
	if err != nil {
		cancel()
		return fmt.Errorf("create stdin pipe: %w", err)
	}
	c.stdin = stdinPipe

	stdoutPipe, err := c.cmd.StdoutPipe()
	if err != nil {
		cancel()
		stdinPipe.Close()
		return fmt.Errorf("create stdout pipe: %w", err)
	}
	c.stdout = stdoutPipe

	// Redirect stderr to log
	stderrPipe, err := c.cmd.StderrPipe()
	if err == nil {
		c.wg.Add(1)
		go func() {
			defer c.wg.Done()
			scanner := bufio.NewScanner(stderrPipe)
			scanner.Buffer(make([]byte, 0, 4096), 64*1024)
			for scanner.Scan() {
				clientLog.Debug("server stderr", "line", scanner.Text())
			}
		}()
	}

	if err := c.cmd.Start(); err != nil {
		cancel()
		return fmt.Errorf("start LSP server %q: %w", serverPath, err)
	}

	clientLog.Info("LSP server started", "path", serverPath, "pid", c.cmd.Process.Pid)

	// Start reading responses
	c.wg.Add(1)
	go c.readLoop()

	// Perform initialize handshake
	initParams := map[string]any{
		"processId": nil, // let server know we manage the process
		"rootUri":   rootURI,
		"capabilities": map[string]any{
			"textDocument": map[string]any{
				"completion": map[string]any{
					"completionItem": map[string]any{
						"snippetSupport":          true,
						"documentationFormat":     []string{"plaintext", "markdown"},
						"preselectSupport":        true,
						"insertReplaceSupport":    true,
						"labelDetailsSupport":     true,
					},
					"contextSupport": true,
				},
				"hover": map[string]any{
					"contentFormat": []string{"plaintext", "markdown"},
				},
				"definition":                map[string]any{"linkSupport": true},
				"references":                map[string]any{},
				"signatureHelp":             map[string]any{},
				"documentHighlight":         map[string]any{},
				"documentSymbol":            map[string]any{"hierarchicalDocumentSymbolSupport": true},
				"codeAction": map[string]any{
					"codeActionLiteralSupport": map[string]any{
						"codeActionKind": map[string]any{
							"valueSet": []string{
								"quickfix", "refactor", "refactor.extract", "refactor.inline",
								"refactor.rewrite", "source", "source.organizeImports",
							},
						},
					},
				},
				"rename": map[string]any{
					"prepareSupport": true,
				},
				"formatting":              map[string]any{},
				"inlayHint":               map[string]any{},
				"publishDiagnostics": map[string]any{
					"relatedInformation": true,
					"tagSupport": map[string]any{
						"valueSet": []int{1, 2}, // Deprecated, Unnecessary
					},
				},
			},
		},
	}

	// Add server-specific initialization options
	if initOpts := getInitializationOptions(c.serverName); initOpts != nil {
		initParams["initializationOptions"] = initOpts
	}

	initCtx, initCancel := context.WithTimeout(ctx, initTimeout)
	defer initCancel()

	result, err := c.request(initCtx, "initialize", initParams)
	if err != nil {
		c.Close()
		return fmt.Errorf("LSP initialize: %w", err)
	}

	// Store server capabilities
	if resultMap, ok := result.(map[string]any); ok {
		if caps, ok := resultMap["capabilities"].(map[string]any); ok {
			c.mu.Lock()
			c.capabilities = caps
			// Detect incremental sync support (textDocumentSync.change >= 2)
			if tds, ok := caps["textDocumentSync"].(map[string]any); ok {
				if change, ok := tds["change"].(float64); ok && change >= 2 {
					c.supportsIncremental = true
				}
			} else if tds, ok := caps["textDocumentSync"].(float64); ok && tds >= 2 {
				c.supportsIncremental = true
			}
			// Extract semantic tokens legend for per-server token decoding
			if stp, ok := caps["semanticTokensProvider"].(map[string]any); ok {
				if legend, ok := stp["legend"].(map[string]any); ok {
					c.semanticTokensLegend = &SemanticTokensLegend{}
					if types, ok := legend["tokenTypes"].([]any); ok {
						for _, t := range types {
							if s, ok := t.(string); ok {
								c.semanticTokensLegend.TokenTypes = append(c.semanticTokensLegend.TokenTypes, s)
							}
						}
					}
					if mods, ok := legend["tokenModifiers"].([]any); ok {
						for _, m := range mods {
							if s, ok := m.(string); ok {
								c.semanticTokensLegend.TokenModifiers = append(c.semanticTokensLegend.TokenModifiers, s)
							}
						}
					}
					clientLog.Debug("stored semantic tokens legend",
						"server", c.serverName,
						"tokenTypes", len(c.semanticTokensLegend.TokenTypes),
						"tokenModifiers", len(c.semanticTokensLegend.TokenModifiers))
				}
			}
			c.mu.Unlock()
		}
	}

	// Send initialized notification
	c.notify("initialized", map[string]any{})

	c.mu.Lock()
	c.initialized = true
	c.mu.Unlock()

	clientLog.Info("LSP client initialized", "path", serverPath)
	return nil
}

// Close gracefully shuts down the LSP server.
func (c *Client) Close() error {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return nil
	}
	c.closing = true // allow shutdown request through
	c.mu.Unlock()

	// Send shutdown request (must happen before closing pipes)
	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	_, err := c.request(ctx, "shutdown", nil)
	if err != nil {
		clientLog.Warn("LSP shutdown request failed", "error", err)
	}

	// Send exit notification
	c.notify("exit", nil)

	// Now fully close
	c.mu.Lock()
	c.closed = true
	c.initialized = false
	// Drain pending requests so callers don't hang
	for id, ch := range c.pending {
		delete(c.pending, id)
		select {
		case ch <- nil:
		default:
		}
	}
	c.mu.Unlock()

	// Cancel context to kill process if still running
	if c.cancel != nil {
		c.cancel()
	}

	// Close pipes
	if c.stdin != nil {
		c.stdin.Close()
	}
	if c.stdout != nil {
		c.stdout.Close()
	}

	// Wait for read loop to finish
	c.wg.Wait()

	// Wait for process to exit
	if c.cmd != nil && c.cmd.Process != nil {
		c.cmd.Process.Kill()
		c.cmd.Wait()
	}

	return nil
}

// Initialized returns whether the client has completed the LSP handshake.
func (c *Client) Initialized() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.initialized
}

// Capabilities returns the server capabilities from the initialize response.
func (c *Client) Capabilities() map[string]any {
	c.mu.Lock()
	defer c.mu.Unlock()
	result := make(map[string]any, len(c.capabilities))
	for k, v := range c.capabilities {
		result[k] = v
	}
	return result
}

// ServerName returns the name of the LSP server (e.g., "gopls", "rust-analyzer").
func (c *Client) ServerName() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.serverName
}

// SemanticTokensLegend returns the server's semantic tokens legend for decoding token data.
// Returns nil if the server does not support semantic tokens or hasn't provided a legend.
func (c *Client) SemanticTokensLegend() *SemanticTokensLegend {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.semanticTokensLegend == nil {
		return nil
	}
	// Return a copy to prevent mutation
	legend := &SemanticTokensLegend{
		TokenTypes:     make([]string, len(c.semanticTokensLegend.TokenTypes)),
		TokenModifiers: make([]string, len(c.semanticTokensLegend.TokenModifiers)),
	}
	copy(legend.TokenTypes, c.semanticTokensLegend.TokenTypes)
	copy(legend.TokenModifiers, c.semanticTokensLegend.TokenModifiers)
	return legend
}

// OnNotification registers a handler for LSP server notifications.
func (c *Client) OnNotification(method string, handler func(params json.RawMessage)) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.handlers[method] = handler
}

// Completion sends a textDocument/completion request.
func (c *Client) Completion(ctx context.Context, uri string, line, column int, triggerKind int, triggerChar string) ([]map[string]any, error) {
	context := map[string]any{
		"triggerKind": triggerKind,
	}
	if triggerKind == 2 && triggerChar != "" {
		context["triggerCharacter"] = triggerChar
	}
	params := map[string]any{
		"textDocument": map[string]any{"uri": uri},
		"position":     map[string]any{"line": line, "character": column},
		"context":      context,
	}

	result, err := c.request(ctx, "textDocument/completion", params)
	if err != nil {
		return nil, err
	}

	// Completion results can be an array or a CompletionList
	switch items := result.(type) {
	case []any:
		return convertCompletionItems(items), nil
	case map[string]any:
		if rawItems, ok := items["items"].([]any); ok {
			return convertCompletionItems(rawItems), nil
		}
	}
	return nil, nil
}

// Hover sends a textDocument/hover request.
func (c *Client) Hover(ctx context.Context, uri string, line, column int) (*HoverResult, error) {
	params := map[string]any{
		"textDocument": map[string]any{"uri": uri},
		"position":     map[string]any{"line": line, "character": column},
	}

	result, err := c.request(ctx, "textDocument/hover", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil // no hover info
	}

	hover, ok := result.(map[string]any)
	if !ok {
		return nil, nil
	}

	return &HoverResult{
		Contents: hover["contents"],
		Range:    hover["range"],
	}, nil
}

// Definition sends a textDocument/definition request.
func (c *Client) Definition(ctx context.Context, uri string, line, column int) ([]Location, error) {
	params := map[string]any{
		"textDocument": map[string]any{"uri": uri},
		"position":     map[string]any{"line": line, "character": column},
	}

	result, err := c.request(ctx, "textDocument/definition", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	return parseLocations(result), nil
}

// Implementation sends a textDocument/implementation request.
func (c *Client) Implementation(ctx context.Context, uri string, line, column int) ([]Location, error) {
	params := map[string]any{
		"textDocument": map[string]any{"uri": uri},
		"position":     map[string]any{"line": line, "character": column},
	}

	result, err := c.request(ctx, "textDocument/implementation", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	return parseLocations(result), nil
}

// TypeDefinition sends a textDocument/typeDefinition request.
func (c *Client) TypeDefinition(ctx context.Context, uri string, line, column int) ([]Location, error) {
	params := map[string]any{
		"textDocument": map[string]any{"uri": uri},
		"position":     map[string]any{"line": line, "character": column},
	}

	result, err := c.request(ctx, "textDocument/typeDefinition", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	return parseLocations(result), nil
}

// References sends a textDocument/references request.
func (c *Client) References(ctx context.Context, uri string, line, column int) ([]Location, error) {
	params := map[string]any{
		"textDocument": map[string]any{"uri": uri},
		"position":     map[string]any{"line": line, "character": column},
		"context":      map[string]any{"includeDeclaration": true},
	}

	result, err := c.request(ctx, "textDocument/references", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	return parseLocations(result), nil
}

// SignatureHelp sends a textDocument/signatureHelp request.
func (c *Client) SignatureHelp(ctx context.Context, uri string, line, column int) (*SignatureHelp, error) {
	params := map[string]any{
		"textDocument": map[string]any{"uri": uri},
		"position":     map[string]any{"line": line, "character": column},
	}

	result, err := c.request(ctx, "textDocument/signatureHelp", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	m, ok := result.(map[string]any)
	if !ok {
		return nil, nil
	}

	return parseSignatureHelp(m), nil
}

// DidOpen notifies the server that a document was opened.
func (c *Client) DidOpen(uri, language, content string) {
	c.notify("textDocument/didOpen", map[string]any{
		"textDocument": map[string]any{
			"uri":        uri,
			"languageId": language,
			"version":    0,
			"text":       content,
		},
	})
}

// SupportsIncrementalSync returns true if the server supports incremental document sync.
func (c *Client) SupportsIncrementalSync() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.supportsIncremental
}

// TextDocumentContentChangeEvent represents a change event for incremental sync.
type TextDocumentContentChangeEvent struct {
	Range       *Range `json:"range,omitempty"`
	RangeLength *int   `json:"rangeLength,omitempty"`
	Text        string `json:"text"`
}

// DidChange notifies the server that a document was changed (full sync).
func (c *Client) DidChange(uri, content string, version int) {
	c.notify("textDocument/didChange", map[string]any{
		"textDocument": map[string]any{
			"uri":     uri,
			"version": version,
		},
		"contentChanges": []map[string]any{
			{"text": content}, // full sync
		},
	})
}

// DidChangeIncremental notifies the server with incremental changes.
func (c *Client) DidChangeIncremental(uri string, version int, changes []TextDocumentContentChangeEvent) {
	changeEvents := make([]map[string]any, len(changes))
	for i, ch := range changes {
		evt := map[string]any{"text": ch.Text}
		if ch.Range != nil {
			evt["range"] = map[string]any{
				"start": map[string]any{"line": ch.Range.Start.Line, "character": ch.Range.Start.Character},
				"end":   map[string]any{"line": ch.Range.End.Line, "character": ch.Range.End.Character},
			}
			if ch.RangeLength != nil {
				evt["rangeLength"] = *ch.RangeLength
			}
		}
		changeEvents[i] = evt
	}
	c.notify("textDocument/didChange", map[string]any{
		"textDocument": map[string]any{
			"uri":     uri,
			"version": version,
		},
		"contentChanges": changeEvents,
	})
}

// DidClose notifies the server that a document was closed.
func (c *Client) DidClose(uri string) {
	c.notify("textDocument/didClose", map[string]any{
		"textDocument": map[string]any{"uri": uri},
	})
}

// DidSave notifies the server that a document was saved.
func (c *Client) DidSave(uri string, text *string) {
	params := map[string]any{
		"textDocument": map[string]any{"uri": uri},
	}
	if text != nil {
		params["text"] = *text
	}
	c.notify("textDocument/didSave", params)
}

// CodeAction represents a code action (quick fix).
type CodeAction struct {
	Title       string   `json:"title"`
	Kind        string   `json:"kind,omitempty"`
	Diagnostics []any    `json:"diagnostics,omitempty"`
	Edit        *WorkspaceEdit `json:"edit,omitempty"`
	Command     any      `json:"command,omitempty"`
}

// WorkspaceEdit represents edits across multiple files.
type WorkspaceEdit struct {
	Changes []TextDocumentEdit `json:"changes,omitempty"`
}

// TextDocumentEdit represents edits to a single document.
type TextDocumentEdit struct {
	URI    string          `json:"uri"`
	Edits  []TextEdit      `json:"edits"`
}

// TextEdit represents a single text edit operation.
type TextEdit struct {
	Range   Range  `json:"range"`
	NewText string `json:"newText"`
}

// CodeActions sends a textDocument/codeAction request.
func (c *Client) CodeActions(ctx context.Context, uri string, line, column int) ([]CodeAction, error) {
	params := map[string]any{
		"textDocument": map[string]any{"uri": uri},
		"range":         map[string]any{"start": map[string]any{"line": line, "character": column}, "end": map[string]any{"line": line, "character": column + 1}},
		"context":      map[string]any{"diagnostics": []any{}},
	}

	result, err := c.request(ctx, "textDocument/codeAction", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	switch items := result.(type) {
	case []any:
		return parseCodeActions(items), nil
	}
	return nil, nil
}

// Rename sends a textDocument/rename request.
func (c *Client) Rename(ctx context.Context, uri string, line, column int, newName string) (*WorkspaceEdit, error) {
	params := map[string]any{
		"textDocument": map[string]any{"uri": uri},
		"position":     map[string]any{"line": line, "character": column},
		"newName":     newName,
	}

	result, err := c.request(ctx, "textDocument/rename", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	if m, ok := result.(map[string]any); ok {
		if changes, ok := m["documentChanges"].([]any); ok {
			return parseWorkspaceEditFromChanges(changes), nil
		}
		return parseWorkspaceEdit(m), nil
	}
	return nil, nil
}

// FormattingOptions holds textDocument/formatting options.
type FormattingOptions struct {
	TabSize      int  `json:"tabSize"`
	InsertSpaces bool `json:"insertSpaces"`
}

// Formatting sends a textDocument/formatting request.
func (c *Client) Formatting(ctx context.Context, uri string, opts FormattingOptions) (*WorkspaceEdit, error) {
	params := map[string]any{
		"textDocument": map[string]any{"uri": uri},
		"options":      opts,
	}

	result, err := c.request(ctx, "textDocument/formatting", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	if m, ok := result.(map[string]any); ok {
		if changes, ok := m["documentChanges"].([]any); ok {
			return parseWorkspaceEditFromChanges(changes), nil
		}
		return parseWorkspaceEdit(m), nil
	}
	return nil, nil
}

// RangeFormatting sends a textDocument/rangeFormatting request.
func (c *Client) RangeFormatting(ctx context.Context, uri string, startLine, startCol, endLine, endCol int, opts FormattingOptions) (*WorkspaceEdit, error) {
	params := map[string]any{
		"textDocument": map[string]any{"uri": uri},
		"range": map[string]any{
			"start": map[string]any{"line": startLine, "character": startCol},
			"end":   map[string]any{"line": endLine, "character": endCol},
		},
		"options": opts,
	}

	result, err := c.request(ctx, "textDocument/rangeFormatting", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	if m, ok := result.(map[string]any); ok {
		if changes, ok := m["documentChanges"].([]any); ok {
			return parseWorkspaceEditFromChanges(changes), nil
		}
		return parseWorkspaceEdit(m), nil
	}
	return nil, nil
}

// OnTypeFormatting sends a textDocument/onTypeFormatting request.
func (c *Client) OnTypeFormatting(ctx context.Context, uri string, line, column int, triggerChar string, opts FormattingOptions) (*WorkspaceEdit, error) {
	params := map[string]any{
		"textDocument": map[string]any{"uri": uri},
		"position":     map[string]any{"line": line, "character": column},
		"ch":           triggerChar,
		"options":       opts,
	}

	result, err := c.request(ctx, "textDocument/onTypeFormatting", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	if m, ok := result.(map[string]any); ok {
		if changes, ok := m["documentChanges"].([]any); ok {
			return parseWorkspaceEditFromChanges(changes), nil
		}
		return parseWorkspaceEdit(m), nil
	}
	return nil, nil
}

// SelectionRange represents a range that can be selected, with optional parent for expand-selection.
type SelectionRange struct {
	Range  Range          `json:"range"`
	Parent *SelectionRange `json:"parent,omitempty"`
}

// SelectionRanges sends a textDocument/selectionRange request.
func (c *Client) SelectionRanges(ctx context.Context, uri string, positions []Position) ([]SelectionRange, error) {
	posParams := make([]map[string]any, len(positions))
	for i, p := range positions {
		posParams[i] = map[string]any{"line": p.Line, "character": p.Character}
	}

	params := map[string]any{
		"textDocument": map[string]any{"uri": uri},
		"positions":    posParams,
	}

	result, err := c.request(ctx, "textDocument/selectionRange", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	items, ok := result.([]any)
	if !ok {
		return nil, nil
	}

	ranges := make([]SelectionRange, 0, len(items))
	for _, item := range items {
		if m, ok := item.(map[string]any); ok {
			sr := parseSelectionRange(m)
			ranges = append(ranges, sr)
		}
	}
	return ranges, nil
}

// parseSelectionRange recursively parses a SelectionRange from LSP response.
func parseSelectionRange(m map[string]any) SelectionRange {
	sr := SelectionRange{}
	if r, ok := m["range"].(map[string]any); ok {
		sr.Range = parseRange(r)
	}
	if parent, ok := m["parent"].(map[string]any); ok {
		parsed := parseSelectionRange(parent)
		sr.Parent = &parsed
	}
	return sr
}

// DocumentHighlight represents a highlighted occurrence of a symbol.
type DocumentHighlight struct {
	Range Range `json:"range"`
	Kind  int    `json:"kind,omitempty"` // 1=Text, 2=Read, 3=Write
}

// SemanticTokens represents LSP semantic tokens for syntax highlighting.
type SemanticTokens struct {
	ResultID string `json:"resultId,omitempty"`
	Data    []uint32 `json:"data"` // encoded tokens: [deltaLine, deltaStartChar, length, tokenType, tokenModifiers]
}

// SemanticTokensLegend contains the token types and modifiers supported by the server.
type SemanticTokensLegend struct {
	TokenTypes     []string `json:"tokenTypes"`
	TokenModifiers []string `json:"tokenModifiers"`
}

// InlayHint represents an inline hint (type annotation, parameter name, etc.).
type InlayHint struct {
	Position    Position `json:"position"`
	Label       string   `json:"label"`
	Kind        int      `json:"kind,omitempty"` // 1=Type, 2=Parameter
	Tooltip     string   `json:"tooltip,omitempty"`
	PaddingLeft bool     `json:"paddingLeft,omitempty"`
	PaddingRight bool    `json:"paddingRight,omitempty"`
}

// DocumentHighlight sends a textDocument/documentHighlight request.
func (c *Client) DocumentHighlight(ctx context.Context, uri string, line, column int) ([]DocumentHighlight, error) {
	params := map[string]any{
		"textDocument": map[string]any{"uri": uri},
		"position":     map[string]any{"line": line, "character": column},
	}

	result, err := c.request(ctx, "textDocument/documentHighlight", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	switch items := result.(type) {
	case []any:
		highlights := make([]DocumentHighlight, 0, len(items))
		for _, item := range items {
			m, ok := item.(map[string]any)
			if !ok {
				continue
			}
			dh := DocumentHighlight{}
			if r, ok := m["range"].(map[string]any); ok {
				dh.Range = parseRange(r)
			}
			if kind, ok := m["kind"].(float64); ok {
				dh.Kind = int(kind)
			}
			highlights = append(highlights, dh)
		}
		return highlights, nil
	}
	return nil, nil
}

// DocumentLink represents a clickable link in a document (e.g., URL in comment, package import).
type DocumentLink struct {
	Range   Range  `json:"range"`
	Target  string `json:"target,omitempty"`
	Tooltip string `json:"tooltip,omitempty"`
}

// DocumentLinks sends a textDocument/documentLink request.
func (c *Client) DocumentLinks(ctx context.Context, uri string) ([]DocumentLink, error) {
	params := map[string]any{
		"textDocument": map[string]any{"uri": uri},
	}

	result, err := c.request(ctx, "textDocument/documentLink", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	switch items := result.(type) {
	case []any:
		links := make([]DocumentLink, 0, len(items))
		for _, item := range items {
			m, ok := item.(map[string]any)
			if !ok {
				continue
			}
			link := DocumentLink{}
			if r, ok := m["range"].(map[string]any); ok {
				link.Range = parseRange(r)
			}
			if target, ok := m["target"].(string); ok {
				link.Target = target
			}
			if tooltip, ok := m["tooltip"].(string); ok {
				link.Tooltip = tooltip
			}
			links = append(links, link)
		}
		return links, nil
	}
	return nil, nil
}

// CodeLens represents a code lens item from the LSP server.
type CodeLens struct {
	Range       Range `json:"range"`
	Command     *Command `json:"command,omitempty"`
	Data        any `json:"data,omitempty"`
}

// Command represents an LSP command.
type Command struct {
	Title     string   `json:"title"`
	Command   string   `json:"command"`
	Arguments []any    `json:"arguments,omitempty"`
}

// CodeLenses sends a textDocument/codeLens request.
func (c *Client) CodeLenses(ctx context.Context, uri string) ([]CodeLens, error) {
	params := map[string]any{
		"textDocument": map[string]any{"uri": uri},
	}

	result, err := c.request(ctx, "textDocument/codeLens", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	switch items := result.(type) {
	case []any:
		lenses := make([]CodeLens, 0, len(items))
		for _, item := range items {
			m, ok := item.(map[string]any)
			if !ok {
				continue
			}
			lens := CodeLens{}
			if r, ok := m["range"].(map[string]any); ok {
				lens.Range = parseRange(r)
			}
			if cmd, ok := m["command"].(map[string]any); ok {
				lens.Command = &Command{}
				if title, ok := cmd["title"].(string); ok {
					lens.Command.Title = title
				}
				if cmdName, ok := cmd["command"].(string); ok {
					lens.Command.Command = cmdName
				}
				if args, ok := cmd["arguments"].([]any); ok {
					lens.Command.Arguments = args
				}
			}
			if data, ok := m["data"]; ok {
				lens.Data = data
			}
			lenses = append(lenses, lens)
		}
		return lenses, nil
	}
	return nil, nil
}

// InlayHints sends a textDocument/inlayHint request.
func (c *Client) InlayHints(ctx context.Context, uri string, startLine, endLine int) ([]InlayHint, error) {
	params := map[string]any{
		"textDocument": map[string]any{"uri": uri},
		"range": map[string]any{
			"start": map[string]any{"line": startLine, "character": 0},
			"end":   map[string]any{"line": endLine, "character": 0},
		},
	}

	result, err := c.request(ctx, "textDocument/inlayHint", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	switch items := result.(type) {
	case []any:
		hints := make([]InlayHint, 0, len(items))
		for _, item := range items {
			m, ok := item.(map[string]any)
			if !ok {
				continue
			}
			ih := InlayHint{}
			if p, ok := m["position"].(map[string]any); ok {
				ih.Position = parsePosition(p)
			}
			// Label can be string or array of label parts
			if label, ok := m["label"].(string); ok {
				ih.Label = label
			} else if parts, ok := m["label"].([]any); ok {
				for _, part := range parts {
					if pm, ok := part.(map[string]any); ok {
						if v, ok := pm["value"].(string); ok {
							ih.Label += v
						}
					} else if s, ok := part.(string); ok {
						ih.Label += s
					}
				}
			}
			if kind, ok := m["kind"].(float64); ok {
				ih.Kind = int(kind)
			}
			if tooltip, ok := m["tooltip"].(string); ok {
				ih.Tooltip = tooltip
			}
			if pl, ok := m["paddingLeft"].(bool); ok {
				ih.PaddingLeft = pl
			}
			if pr, ok := m["paddingRight"].(bool); ok {
				ih.PaddingRight = pr
			}
			hints = append(hints, ih)
		}
		return hints, nil
	}
	return nil, nil
}

// DocumentSymbol represents a symbol in a document (for outline view).
type DocumentSymbol struct {
	Name          string           `json:"name"`
	Detail        string           `json:"detail,omitempty"`
	Kind          int              `json:"kind"`
	Range         Range            `json:"range"`
	SelectionRange Range            `json:"selectionRange"`
	Children      []DocumentSymbol `json:"children,omitempty"`
}

// FoldingRange represents a foldable region in a document.
type FoldingRange struct {
	StartLine      int `json:"startLine"`
	EndLine        int `json:"endLine"`
	StartCharacter int `json:"startCharacter,omitempty"`
	EndCharacter   int `json:"endCharacter,omitempty"`
	Kind          int `json:"kind,omitempty"` // 1=Comment, 2=Imports, 3=Region
}

// DocumentSymbols sends a textDocument/documentSymbol request.
func (c *Client) DocumentSymbols(ctx context.Context, uri string) ([]DocumentSymbol, error) {
	params := map[string]any{
		"textDocument": map[string]any{"uri": uri},
	}

	result, err := c.request(ctx, "textDocument/documentSymbol", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	// Result can be DocumentSymbol[] or SymbolInformation[]
	switch items := result.(type) {
	case []any:
		return parseDocumentSymbols(items), nil
	}
	return nil, nil
}

// FoldingRanges sends a textDocument/foldingRange request.
func (c *Client) FoldingRanges(ctx context.Context, uri string) ([]FoldingRange, error) {
	params := map[string]any{
		"textDocument": map[string]any{"uri": uri},
	}

	result, err := c.request(ctx, "textDocument/foldingRange", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	switch items := result.(type) {
	case []any:
		ranges := make([]FoldingRange, 0, len(items))
		for _, item := range items {
			m, ok := item.(map[string]any)
			if !ok {
				continue
			}
			fr := FoldingRange{}
			if v, ok := m["startLine"].(float64); ok {
				fr.StartLine = int(v)
			}
			if v, ok := m["endLine"].(float64); ok {
				fr.EndLine = int(v)
			}
			if v, ok := m["startCharacter"].(float64); ok {
				fr.StartCharacter = int(v)
			}
			if v, ok := m["endCharacter"].(float64); ok {
				fr.EndCharacter = int(v)
			}
			if v, ok := m["kind"].(string); ok {
				switch v {
				case "comment":
					fr.Kind = 1
				case "imports":
					fr.Kind = 2
				case "region":
					fr.Kind = 3
				}
			}
			ranges = append(ranges, fr)
		}
		return ranges, nil
	}
	return nil, nil
}

// WorkspaceSymbol represents a symbol found via workspace/symbol search.
type WorkspaceSymbol struct {
	Name          string `json:"name"`
	Kind          int    `json:"kind"`
	ContainerName string `json:"containerName,omitempty"`
	Location      Location `json:"location"`
}

// WorkspaceSymbols sends a workspace/symbol request.
func (c *Client) WorkspaceSymbols(ctx context.Context, query string) ([]WorkspaceSymbol, error) {
	params := map[string]any{
		"query": query,
	}

	result, err := c.request(ctx, "workspace/symbol", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	switch items := result.(type) {
	case []any:
		symbols := make([]WorkspaceSymbol, 0, len(items))
		for _, item := range items {
			m, ok := item.(map[string]any)
			if !ok {
				continue
			}
			ws := WorkspaceSymbol{}
			if name, ok := m["name"].(string); ok {
				ws.Name = name
			}
			if kind, ok := m["kind"].(float64); ok {
				ws.Kind = int(kind)
			}
			if cn, ok := m["containerName"].(string); ok {
				ws.ContainerName = cn
			}
			// Location can be Location or LocationLink
			if loc, ok := m["location"].(map[string]any); ok {
				ws.Location = parseLocation(loc)
			}
			symbols = append(symbols, ws)
		}
		return symbols, nil
	}
	return nil, nil
}

// SemanticTokens sends a textDocument/semanticTokens/full request.
func (c *Client) SemanticTokens(ctx context.Context, uri string) (*SemanticTokens, error) {
	params := map[string]any{
		"textDocument": map[string]any{"uri": uri},
	}

	result, err := c.request(ctx, "textDocument/semanticTokens/full", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	m, ok := result.(map[string]any)
	if !ok {
		return nil, nil
	}

	st := &SemanticTokens{}
	if resultID, ok := m["resultId"].(string); ok {
		st.ResultID = resultID
	}
	if data, ok := m["data"].([]any); ok {
		st.Data = make([]uint32, 0, len(data))
		for _, v := range data {
			if f, ok := v.(float64); ok {
				st.Data = append(st.Data, uint32(f))
			}
		}
	}
	return st, nil
}

// SemanticTokensRange sends a textDocument/semanticTokens/range request.
func (c *Client) SemanticTokensRange(ctx context.Context, uri string, startLine, startChar, endLine, endChar int) (*SemanticTokens, error) {
	params := map[string]any{
		"textDocument": map[string]any{"uri": uri},
		"range": map[string]any{
			"start": map[string]any{"line": startLine, "character": startChar},
			"end":   map[string]any{"line": endLine, "character": endChar},
		},
	}

	result, err := c.request(ctx, "textDocument/semanticTokens/range", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	m, ok := result.(map[string]any)
	if !ok {
		return nil, nil
	}

	st := &SemanticTokens{}
	if resultID, ok := m["resultId"].(string); ok {
		st.ResultID = resultID
	}
	if data, ok := m["data"].([]any); ok {
		st.Data = make([]uint32, 0, len(data))
		for _, v := range data {
			if f, ok := v.(float64); ok {
				st.Data = append(st.Data, uint32(f))
			}
		}
	}
	return st, nil
}

// CallHierarchyItem represents an item in the call hierarchy.
type CallHierarchyItem struct {
	Name           string   `json:"name"`
	Kind           int      `json:"kind"`
	Tags           []int    `json:"tags,omitempty"`
	Detail         string   `json:"detail,omitempty"`
	URI            string   `json:"uri"`
	Range          Range    `json:"range"`
	SelectionRange Range    `json:"selectionRange"`
	Data           any      `json:"data,omitempty"`
}

// CallHierarchyIncomingCall represents an incoming call in the hierarchy.
type CallHierarchyIncomingCall struct {
	From           CallHierarchyItem `json:"from"`
	FromRanges     []Range           `json:"fromRanges"`
}

// CallHierarchyOutgoingCall represents an outgoing call in the hierarchy.
type CallHierarchyOutgoingCall struct {
	To             CallHierarchyItem `json:"to"`
	FromRanges     []Range           `json:"fromRanges"`
}

// PrepareCallHierarchy sends a textDocument/prepareCallHierarchy request.
func (c *Client) PrepareCallHierarchy(ctx context.Context, uri string, line, column int) ([]CallHierarchyItem, error) {
	params := map[string]any{
		"textDocument": map[string]any{"uri": uri},
		"position":     map[string]any{"line": line, "character": column},
	}

	result, err := c.request(ctx, "textDocument/prepareCallHierarchy", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	items, ok := result.([]any)
	if !ok {
		return nil, nil
	}

	var hierarchyItems []CallHierarchyItem
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		chi := parseCallHierarchyItem(m)
		hierarchyItems = append(hierarchyItems, chi)
	}
	return hierarchyItems, nil
}

// CallHierarchyIncomingCalls sends a callHierarchy/incomingCalls request.
func (c *Client) CallHierarchyIncomingCalls(ctx context.Context, item CallHierarchyItem) ([]CallHierarchyIncomingCall, error) {
	params := map[string]any{
		"item": map[string]any{
			"name":            item.Name,
			"kind":            item.Kind,
			"tags":            item.Tags,
			"detail":          item.Detail,
			"uri":             item.URI,
			"range":           item.Range,
			"selectionRange":  item.SelectionRange,
			"data":            item.Data,
		},
	}

	result, err := c.request(ctx, "callHierarchy/incomingCalls", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	items, ok := result.([]any)
	if !ok {
		return nil, nil
	}

	var calls []CallHierarchyIncomingCall
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		call := parseCallHierarchyIncomingCall(m)
		calls = append(calls, call)
	}
	return calls, nil
}

// CallHierarchyOutgoingCalls sends a callHierarchy/outgoingCalls request.
func (c *Client) CallHierarchyOutgoingCalls(ctx context.Context, item CallHierarchyItem) ([]CallHierarchyOutgoingCall, error) {
	params := map[string]any{
		"item": map[string]any{
			"name":            item.Name,
			"kind":            item.Kind,
			"tags":            item.Tags,
			"detail":          item.Detail,
			"uri":             item.URI,
			"range":           item.Range,
			"selectionRange":  item.SelectionRange,
			"data":            item.Data,
		},
	}

	result, err := c.request(ctx, "callHierarchy/outgoingCalls", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	items, ok := result.([]any)
	if !ok {
		return nil, nil
	}

	var calls []CallHierarchyOutgoingCall
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		call := parseCallHierarchyOutgoingCall(m)
		calls = append(calls, call)
	}
	return calls, nil
}

func parseCallHierarchyItem(m map[string]any) CallHierarchyItem {
	item := CallHierarchyItem{}
	if name, ok := m["name"].(string); ok {
		item.Name = name
	}
	if kind, ok := m["kind"].(float64); ok {
		item.Kind = int(kind)
	}
	if detail, ok := m["detail"].(string); ok {
		item.Detail = detail
	}
	if uri, ok := m["uri"].(string); ok {
		item.URI = uri
	}
	if r, ok := m["range"].(map[string]any); ok {
		item.Range = parseRange(r)
	}
	if sr, ok := m["selectionRange"].(map[string]any); ok {
		item.SelectionRange = parseRange(sr)
	}
	if tags, ok := m["tags"].([]any); ok {
		item.Tags = make([]int, 0, len(tags))
		for _, t := range tags {
			if f, ok := t.(float64); ok {
				item.Tags = append(item.Tags, int(f))
			}
		}
	}
	if data, ok := m["data"]; ok {
		item.Data = data
	}
	return item
}

func parseCallHierarchyIncomingCall(m map[string]any) CallHierarchyIncomingCall {
	call := CallHierarchyIncomingCall{}
	if from, ok := m["from"].(map[string]any); ok {
		call.From = parseCallHierarchyItem(from)
	}
	if ranges, ok := m["fromRanges"].([]any); ok {
		call.FromRanges = make([]Range, 0, len(ranges))
		for _, r := range ranges {
			if rm, ok := r.(map[string]any); ok {
				call.FromRanges = append(call.FromRanges, parseRange(rm))
			}
		}
	}
	return call
}

func parseCallHierarchyOutgoingCall(m map[string]any) CallHierarchyOutgoingCall {
	call := CallHierarchyOutgoingCall{}
	if to, ok := m["to"].(map[string]any); ok {
		call.To = parseCallHierarchyItem(to)
	}
	if ranges, ok := m["fromRanges"].([]any); ok {
		call.FromRanges = make([]Range, 0, len(ranges))
		for _, r := range ranges {
			if rm, ok := r.(map[string]any); ok {
				call.FromRanges = append(call.FromRanges, parseRange(rm))
			}
		}
	}
	return call
}

// TypeHierarchyItem represents an item in the type hierarchy.
type TypeHierarchyItem struct {
	Name           string   `json:"name"`
	Kind           int      `json:"kind"`
	Tags           []int    `json:"tags,omitempty"`
	Detail         string   `json:"detail,omitempty"`
	URI            string   `json:"uri"`
	Range          Range    `json:"range"`
	SelectionRange Range    `json:"selectionRange"`
	Data           any      `json:"data,omitempty"`
}

// PrepareTypeHierarchy sends a textDocument/prepareTypeHierarchy request.
func (c *Client) PrepareTypeHierarchy(ctx context.Context, uri string, line, column int) ([]TypeHierarchyItem, error) {
	params := map[string]any{
		"textDocument": map[string]any{"uri": uri},
		"position":     map[string]any{"line": line, "character": column},
	}

	result, err := c.request(ctx, "textDocument/prepareTypeHierarchy", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	items, ok := result.([]any)
	if !ok {
		return nil, nil
	}

	var hierarchyItems []TypeHierarchyItem
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		 thi := parseTypeHierarchyItem(m)
		hierarchyItems = append(hierarchyItems, thi)
	}
	return hierarchyItems, nil
}

// TypeHierarchySupertypes sends a typeHierarchy/supertypes request.
func (c *Client) TypeHierarchySupertypes(ctx context.Context, item TypeHierarchyItem) ([]TypeHierarchyItem, error) {
	params := map[string]any{
		"item": map[string]any{
			"name":            item.Name,
			"kind":            item.Kind,
			"tags":            item.Tags,
			"detail":          item.Detail,
			"uri":             item.URI,
			"range":           item.Range,
			"selectionRange":  item.SelectionRange,
			"data":            item.Data,
		},
	}

	result, err := c.request(ctx, "typeHierarchy/supertypes", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	items, ok := result.([]any)
	if !ok {
		return nil, nil
	}

	var supertypes []TypeHierarchyItem
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		supertypes = append(supertypes, parseTypeHierarchyItem(m))
	}
	return supertypes, nil
}

// TypeHierarchySubtypes sends a typeHierarchy/subtypes request.
func (c *Client) TypeHierarchySubtypes(ctx context.Context, item TypeHierarchyItem) ([]TypeHierarchyItem, error) {
	params := map[string]any{
		"item": map[string]any{
			"name":            item.Name,
			"kind":            item.Kind,
			"tags":            item.Tags,
			"detail":          item.Detail,
			"uri":             item.URI,
			"range":           item.Range,
			"selectionRange":  item.SelectionRange,
			"data":            item.Data,
		},
	}

	result, err := c.request(ctx, "typeHierarchy/subtypes", params)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}

	items, ok := result.([]any)
	if !ok {
		return nil, nil
	}

	var subtypes []TypeHierarchyItem
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		subtypes = append(subtypes, parseTypeHierarchyItem(m))
	}
	return subtypes, nil
}

func parseTypeHierarchyItem(m map[string]any) TypeHierarchyItem {
	item := TypeHierarchyItem{}
	if name, ok := m["name"].(string); ok {
		item.Name = name
	}
	if kind, ok := m["kind"].(float64); ok {
		item.Kind = int(kind)
	}
	if detail, ok := m["detail"].(string); ok {
		item.Detail = detail
	}
	if uri, ok := m["uri"].(string); ok {
		item.URI = uri
	}
	if r, ok := m["range"].(map[string]any); ok {
		item.Range = parseRange(r)
	}
	if sr, ok := m["selectionRange"].(map[string]any); ok {
		item.SelectionRange = parseRange(sr)
	}
	if tags, ok := m["tags"].([]any); ok {
		item.Tags = make([]int, 0, len(tags))
		for _, t := range tags {
			if f, ok := t.(float64); ok {
				item.Tags = append(item.Tags, int(f))
			}
		}
	}
	if data, ok := m["data"]; ok {
		item.Data = data
	}
	return item
}

// HoverResult represents a hover response from the LSP server.
type HoverResult struct {
	Contents any   `json:"contents"`
	Range    any   `json:"range"`
}

// Location represents a location in a document.
type Location struct {
	URI   string `json:"uri"`
	Range Range  `json:"range"`
}

// Range represents a range in a text document.
type Range struct {
	Start Position `json:"start"`
	End   Position `json:"end"`
}

// Position represents a position in a text document.
type Position struct {
	Line      int `json:"line"`
	Character int `json:"character"`
}

// DiagnosticSeverity indicates the severity of a diagnostic.
type DiagnosticSeverity int

const (
	SeverityError       DiagnosticSeverity = 1
	SeverityWarning     DiagnosticSeverity = 2
	SeverityInformation DiagnosticSeverity = 3
	SeverityHint        DiagnosticSeverity = 4
)

// Diagnostic represents a diagnostic item from the LSP server.
type Diagnostic struct {
	Range           Range               `json:"range"`
	Severity        DiagnosticSeverity  `json:"severity,omitempty"`
	Code            any                 `json:"code,omitempty"` // string | int
	Source          string              `json:"source,omitempty"`
	Message         string              `json:"message"`
	RelatedInfo     []DiagnosticRelated `json:"relatedInformation,omitempty"`
	Tags            []int               `json:"tags,omitempty"`
	Data            any                 `json:"data,omitempty"`
}

// DiagnosticRelated represents related diagnostic information.
type DiagnosticRelated struct {
	Location Location `json:"location"`
	Message  string   `json:"message"`
}

// PublishDiagnosticsParams represents the params for textDocument/publishDiagnostics.
type PublishDiagnosticsParams struct {
	URI         string       `json:"uri"`
	Version     int          `json:"version,omitempty"`
	Diagnostics []Diagnostic `json:"diagnostics"`
}

// SignatureHelp represents a signature help response.
type SignatureHelp struct {
	Signatures      []SignatureInformation `json:"signatures"`
	ActiveSignature int                    `json:"activeSignature"`
	ActiveParameter int                    `json:"activeParameter"`
}

// SignatureInformation represents a function signature.
type SignatureInformation struct {
	Label         string               `json:"label"`
	Documentation any                  `json:"documentation,omitempty"`
	Parameters    []ParameterInformation `json:"parameters,omitempty"`
}

// ParameterInformation represents a parameter in a signature.
type ParameterInformation struct {
	Label         string `json:"label"`
	Documentation any    `json:"documentation,omitempty"`
}

// request sends a JSON-RPC request and waits for the response.
func (c *Client) request(ctx context.Context, method string, params any) (any, error) {
	if !c.Initialized() && method != "initialize" {
		return nil, ErrNotInitialized
	}

	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return nil, ErrClientClosed
	}

	id := c.nextID.Add(1)
	respCh := make(chan *LSPResponse, 1)
	c.pending[id] = respCh

	// Send request while holding lock to prevent concurrent writes to stdin
	req := LSPRequest{
		JSONRPC: "2.0",
		ID:      id,
		Method:  method,
		Params:  params,
	}
	err := c.writeMessageLocked(req)
	c.mu.Unlock()

	if err != nil {
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
		return nil, err
	}

	// Wait for response with context timeout
	timeout := defaultRequestTimeout
	if deadline, ok := ctx.Deadline(); ok {
		if remaining := time.Until(deadline); remaining > 0 {
			timeout = remaining
		}
	}

	select {
	case resp := <-respCh:
		if resp.Error != nil {
			return nil, fmt.Errorf("%w: [%d] %s", ErrRequestFailed, resp.Error.Code, resp.Error.Message)
		}
		return resp.Result, nil
	case <-time.After(timeout):
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
		return nil, ErrRequestTimeout
	case <-ctx.Done():
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
		// Notify LSP server to stop processing this request
		c.notify("$/cancelRequest", map[string]any{"id": id})
		return nil, ctx.Err()
	}
}

// notify sends a JSON-RPC notification (no response expected).
func (c *Client) notify(method string, params any) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed || c.stdin == nil {
		return
	}
	notif := LSPNotification{
		JSONRPC: "2.0",
		Method:  method,
		Params:  params,
	}
	if err := c.writeMessageLocked(notif); err != nil {
		clientLog.Warn("failed to send notification", "method", method, "error", err)
	}
}

// writeMessageLocked writes a JSON-RPC message using LSP base protocol framing.
// Caller must hold c.mu.
func (c *Client) writeMessageLocked(msg any) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	if len(data) > maxMessageSize {
		return fmt.Errorf("message too large: %d bytes", len(data))
	}

	header := fmt.Sprintf("Content-Length: %d\r\n\r\n", len(data))
	if _, err := io.WriteString(c.stdin, header); err != nil {
		return fmt.Errorf("write header: %w", err)
	}
	if _, err := c.stdin.Write(data); err != nil {
		return fmt.Errorf("write body: %w", err)
	}
	return nil
}

// readLoop reads LSP messages from the server and dispatches them.
func (c *Client) readLoop() {
	defer c.wg.Done()
	defer func() {
		// Mark as not-initialized when readLoop exits (server crash or pipe close)
		c.mu.Lock()
		if !c.closed {
			c.initialized = false
		}
		// P0 fix: Drain all pending requests so callers don't hang until context timeout
		for id, ch := range c.pending {
			delete(c.pending, id)
			select {
			case ch <- &LSPResponse{Error: &LSPError{Code: -32001, Message: "LSP server disconnected"}}:
			default:
			}
		}
		c.mu.Unlock()
	}()

	reader := bufio.NewReaderSize(c.stdout, 64*1024)
	for {
		// Read Content-Length header
		msg, err := c.readMessage(reader)
		if err != nil {
			if !errors.Is(err, io.EOF) && !errors.Is(err, ErrClientClosed) && !errors.Is(err, os.ErrClosed) {
				clientLog.Error("read error", "error", err)
			}
			return
		}

		// Parse as raw JSON to determine type
		var raw map[string]json.RawMessage
		if err := json.Unmarshal(msg, &raw); err != nil {
			clientLog.Warn("invalid JSON from server", "error", err)
			continue
		}

		// Check if it has an ID (response) or not (notification)
		if _, hasID := raw["id"]; hasID {
			var resp LSPResponse
			if err := json.Unmarshal(msg, &resp); err != nil {
				continue
			}
			c.handleResponse(resp)
		} else {
			c.handleNotification(raw)
		}
	}
}

// readMessage reads a single LSP base protocol message.
func (c *Client) readMessage(reader *bufio.Reader) ([]byte, error) {
	// Read headers until empty line
	var contentLen int
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return nil, err
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			break // end of headers
		}
		if strings.HasPrefix(strings.ToLower(line), "content-length:") {
			val := strings.TrimSpace(line[len("content-length:"):])
			contentLen, err = strconv.Atoi(val)
			if err != nil {
				return nil, fmt.Errorf("invalid Content-Length: %q", val)
			}
		}
	}

	if contentLen <= 0 || contentLen > maxMessageSize {
		return nil, fmt.Errorf("invalid content length: %d", contentLen)
	}

	// Read body
	body := make([]byte, contentLen)
	if _, err := io.ReadFull(reader, body); err != nil {
		return nil, err
	}
	return body, nil
}

// handleResponse dispatches a response to the pending request.
func (c *Client) handleResponse(resp LSPResponse) {
	c.mu.Lock()
	ch, ok := c.pending[resp.ID]
	if ok {
		delete(c.pending, resp.ID)
	}
	c.mu.Unlock()

	if !ok {
		return // no pending request for this ID
	}

	select {
	case ch <- &resp:
	default:
		// Channel full (shouldn't happen with buffered=1), drop
		clientLog.Warn("dropped response for pending request", "id", resp.ID)
	}
}

// handleNotification dispatches a server notification to registered handlers.
func (c *Client) handleNotification(raw map[string]json.RawMessage) {
	var method string
	if m, ok := raw["method"]; ok {
		json.Unmarshal(m, &method)
	}

	c.mu.Lock()
	handler, ok := c.handlers[method]
	c.mu.Unlock()

	if !ok || handler == nil {
		return
	}

	if params, ok := raw["params"]; ok {
		handler(params)
	}
}

// convertCompletionItems converts raw completion items to a common format.
func convertCompletionItems(items []any) []map[string]any {
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if m, ok := item.(map[string]any); ok {
			result = append(result, m)
		}
	}
	return result
}

// parseLocations parses LSP Location results (single or array).
func parseLocations(result any) []Location {
	switch v := result.(type) {
	case []any:
		var locs []Location
		for _, item := range v {
			if m, ok := item.(map[string]any); ok {
				loc := parseLocation(m)
				if loc.URI != "" {
					locs = append(locs, loc)
				}
			}
		}
		return locs
	case map[string]any:
		loc := parseLocation(v)
		if loc.URI != "" {
			return []Location{loc}
		}
	}
	return nil
}

func parseLocation(m map[string]any) Location {
	loc := Location{}
	if uri, ok := m["uri"].(string); ok {
		loc.URI = uri
	}
	if r, ok := m["range"].(map[string]any); ok {
		loc.Range = parseRange(r)
	}
	return loc
}

func parseRange(m map[string]any) Range {
	r := Range{}
	if s, ok := m["start"].(map[string]any); ok {
		r.Start = parsePosition(s)
	}
	if e, ok := m["end"].(map[string]any); ok {
		r.End = parsePosition(e)
	}
	return r
}

func parsePosition(m map[string]any) Position {
	p := Position{}
	if line, ok := m["line"].(float64); ok {
		p.Line = int(line)
	}
	if ch, ok := m["character"].(float64); ok {
		p.Character = int(ch)
	}
	return p
}

func parseSignatureHelp(m map[string]any) *SignatureHelp {
	sh := &SignatureHelp{}
	if activeSig, ok := m["activeSignature"].(float64); ok {
		sh.ActiveSignature = int(activeSig)
	}
	if activeParam, ok := m["activeParameter"].(float64); ok {
		sh.ActiveParameter = int(activeParam)
	}
	if sigs, ok := m["signatures"].([]any); ok {
		for _, sig := range sigs {
			if sm, ok := sig.(map[string]any); ok {
				sh.Signatures = append(sh.Signatures, parseSignatureInformation(sm))
			}
		}
	}
	return sh
}

func parseSignatureInformation(m map[string]any) SignatureInformation {
	si := SignatureInformation{}
	if label, ok := m["label"].(string); ok {
		si.Label = label
	}
	si.Documentation = m["documentation"]
	if params, ok := m["parameters"].([]any); ok {
		for _, p := range params {
			if pm, ok := p.(map[string]any); ok {
				pi := ParameterInformation{}
				if label, ok := pm["label"].(string); ok {
					pi.Label = label
				}
				pi.Documentation = pm["documentation"]
				si.Parameters = append(si.Parameters, pi)
			}
		}
	}
	return si
}

func parseDocumentSymbols(items []any) []DocumentSymbol {
	var symbols []DocumentSymbol
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		// DocumentSymbol has "range", SymbolInformation has "location"
		if _, hasRange := m["range"]; hasRange {
			// Hierarchical DocumentSymbol format
			ds := DocumentSymbol{
				Name:   stringValue(m, "name"),
				Detail: stringValue(m, "detail"),
			}
			if kind, ok := m["kind"].(float64); ok {
				ds.Kind = int(kind)
			}
			if r, ok := m["range"].(map[string]any); ok {
				ds.Range = parseRange(r)
			}
			if sr, ok := m["selectionRange"].(map[string]any); ok {
				ds.SelectionRange = parseRange(sr)
			}
			if children, ok := m["children"].([]any); ok {
				ds.Children = parseDocumentSymbols(children)
			}
			symbols = append(symbols, ds)
		} else if _, hasLoc := m["location"]; hasLoc {
			// Flat SymbolInformation format (used by gopls)
			ds := DocumentSymbol{
				Name:   stringValue(m, "name"),
				Detail: stringValue(m, "containerName"),
			}
			if kind, ok := m["kind"].(float64); ok {
				ds.Kind = int(kind)
			}
			if loc, ok := m["location"].(map[string]any); ok {
				if r, ok := loc["range"].(map[string]any); ok {
					ds.Range = parseRange(r)
					ds.SelectionRange = ds.Range
				}
			}
			symbols = append(symbols, ds)
		}
	}
	return symbols
}

func stringValue(m map[string]any, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

func parseCodeActions(items []any) []CodeAction {
	var actions []CodeAction
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		ca := CodeAction{
			Title: stringValue(m, "title"),
			Kind:  stringValue(m, "kind"),
		}
		if diags, ok := m["diagnostics"].([]any); ok {
			ca.Diagnostics = diags
		}
		if edit, ok := m["edit"].(map[string]any); ok {
			ca.Edit = parseWorkspaceEdit(edit)
		}
		if cmd, ok := m["command"]; ok {
			ca.Command = cmd
		}
		actions = append(actions, ca)
	}
	return actions
}

// parseWorkspaceEditFromChanges parses the documentChanges format from LSP responses.
// documentChanges is an array of TextDocumentEdit objects (each with uri + edits).
func parseWorkspaceEditFromChanges(items []any) *WorkspaceEdit {
	we := &WorkspaceEdit{}
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		tde := TextDocumentEdit{
			URI: stringValue(m, "uri"),
		}
		if edits, ok := m["edits"].([]any); ok {
			for _, e := range edits {
				em, ok := e.(map[string]any)
				if !ok {
					continue
				}
				te := TextEdit{
					NewText: stringValue(em, "newText"),
				}
				if r, ok := em["range"].(map[string]any); ok {
					te.Range = parseRange(r)
				}
				tde.Edits = append(tde.Edits, te)
			}
		}
		we.Changes = append(we.Changes, tde)
	}
	return we
}

func parseWorkspaceEdit(m map[string]any) *WorkspaceEdit {
	we := &WorkspaceEdit{}
	// LSP spec: changes is { [uri: string]: TextEdit[] } (map, not array)
	if changesMap, ok := m["changes"].(map[string]any); ok {
		for uri, editsRaw := range changesMap {
			editsArr, ok := editsRaw.([]any)
			if !ok {
				continue
			}
			tde := TextDocumentEdit{URI: uri}
			for _, e := range editsArr {
				em, ok := e.(map[string]any)
				if !ok {
					continue
				}
				te := TextEdit{
					NewText: stringValue(em, "newText"),
				}
				if r, ok := em["range"].(map[string]any); ok {
					te.Range = parseRange(r)
				}
				tde.Edits = append(tde.Edits, te)
			}
			we.Changes = append(we.Changes, tde)
		}
	}
	return we
}
