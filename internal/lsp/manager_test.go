package lsp

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

// nopWriteCloser wraps a Writer to satisfy io.WriteCloser.
type nopWriteCloser struct {
	io.Writer
}

func (nopWriteCloser) Close() error { return nil }

// newTestManager creates a Manager with a pre-injected "initialized" client for
// the given server name. The client is backed by a pipe pair so that:
//   - writeMessageLocked can send to stdin (no nil panic)
//   - a background goroutine reads requests from the pipe and sends back nil-result
//     responses, preventing request() from hanging
//   - Close() can send the shutdown request and complete cleanly
func newTestManager(t *testing.T, serverName string) *Manager {
	t.Helper()

	m := NewManager("/tmp/test", NewScanner())
	c := NewClient()

	// Create pipe pairs: writes to stdinWriter are read by stdinReader.
	stdinReader, stdinWriter := io.Pipe()
	stdoutReader, stdoutWriter := io.Pipe()

	c.stdin = stdinWriter
	c.stdout = stdoutReader

	// Mark as initialized so GetClient returns it immediately.
	c.mu.Lock()
	c.initialized = true
	c.serverName = serverName
	c.mu.Unlock()

	// Start a fake server loop: reads requests from stdinReader, writes
	// responses to stdoutWriter.
	_, cancel := context.WithCancel(context.Background())
	c.cancel = cancel
	c.wg.Add(1)
	go fakeReadLoop(stdinReader, stdoutWriter, &c.wg)

	// Start the client's real readLoop: reads responses from stdoutReader
	// (where the fake server writes) and dispatches them to pending requests.
	c.wg.Add(1)
	go c.readLoop()

	m.mu.Lock()
	m.clients[serverName] = c
	m.mu.Unlock()

	// Register the publishDiagnostics handler (same as StartServer does).
	c.OnNotification("textDocument/publishDiagnostics", func(params json.RawMessage) {
		var pubParams PublishDiagnosticsParams
		if err := json.Unmarshal(params, &pubParams); err != nil {
			return
		}
		m.mu.Lock()
		if _, closed := m.closedDocs[pubParams.URI]; closed {
			m.mu.Unlock()
			return
		}
		m.diagnostics[pubParams.URI] = pubParams.Diagnostics
		handler := m.diagHandler
		m.mu.Unlock()
		if handler != nil {
			handler(pubParams.URI, pubParams.Diagnostics)
		}
	})

	return m
}

// fakeReadLoop reads JSON-RPC requests from the pipe and sends back nil-result
// responses. This prevents request() from hanging forever.
func fakeReadLoop(reader *io.PipeReader, writer *io.PipeWriter, wg *sync.WaitGroup) {
	defer wg.Done()
	defer writer.Close()
	defer reader.Close()

	bufReader := bufio.NewReaderSize(reader, 64*1024)

	for {
		// Read headers until empty line.
		var contentLen int
		for {
			line, err := bufReader.ReadString('\n')
			if err != nil {
				return
			}
			for len(line) > 0 && (line[len(line)-1] == '\n' || line[len(line)-1] == '\r') {
				line = line[:len(line)-1]
			}
			if line == "" {
				break
			}
			clPrefix := "Content-Length: "
			if len(line) >= len(clPrefix) && line[:len(clPrefix)] == clPrefix {
				val := line[len(clPrefix):]
				for i := 0; i < len(val); i++ {
					if val[i] >= '0' && val[i] <= '9' {
						contentLen = contentLen*10 + int(val[i]-'0')
					}
				}
			}
		}

		if contentLen <= 0 {
			continue
		}

		body := make([]byte, contentLen)
		if _, err := io.ReadFull(bufReader, body); err != nil {
			return
		}

		var req struct {
			ID     int64  `json:"id"`
			Method string `json:"method"`
		}
		if err := json.Unmarshal(body, &req); err != nil {
			continue
		}

		// Skip notifications (no ID or ID == 0).
		if req.ID == 0 {
			continue
		}

		// Send back a response with nil result.
		resp := LSPResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result:  nil,
		}
		respData, err := json.Marshal(resp)
		if err != nil {
			continue
		}

		header := "Content-Length: " + itoa(len(respData)) + "\r\n\r\n"
		if _, err := io.WriteString(writer, header); err != nil {
			return
		}
		if _, err := writer.Write(respData); err != nil {
			return
		}
	}
}

// itoa converts a non-negative int to its decimal string representation.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}

// ---------------------------------------------------------------------------
// NewManager
// ---------------------------------------------------------------------------

func TestManager_NewManager_Fields(t *testing.T) {
	m := NewManager("/workspace", NewScanner())
	defer m.Close()

	if m.RootDir() != "/workspace" {
		t.Errorf("RootDir = %q, want /workspace", m.RootDir())
	}
	if len(m.clients) != 0 {
		t.Errorf("clients map should be empty, got %d entries", len(m.clients))
	}
	if len(m.docVersion) != 0 {
		t.Errorf("docVersion map should be empty")
	}
	if len(m.diagnostics) != 0 {
		t.Errorf("diagnostics map should be empty")
	}
	if len(m.closedDocs) != 0 {
		t.Errorf("closedDocs map should be empty")
	}
	if len(m.openDocs) != 0 {
		t.Errorf("openDocs map should be empty")
	}
}

func TestManager_NewManager_StatusEmpty(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	status := m.Status()
	if len(status) != 0 {
		t.Errorf("new manager Status() should be empty, got %d entries", len(status))
	}
}

// ---------------------------------------------------------------------------
// StopServer
// ---------------------------------------------------------------------------

func TestManager_StopServer_NotRunning(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	if err := m.StopServer("gopls"); err != nil {
		t.Errorf("StopServer on non-existent server: %v", err)
	}
}

func TestManager_StopServer_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")

	if err := m.StopServer("gopls"); err != nil {
		t.Errorf("StopServer(gopls): %v", err)
	}

	m.mu.RLock()
	_, ok := m.clients["gopls"]
	m.mu.RUnlock()
	if ok {
		t.Error("gopls should be removed from clients after StopServer")
	}
}

func TestManager_StopServer_DoubleStop(t *testing.T) {
	m := newTestManager(t, "gopls")

	if err := m.StopServer("gopls"); err != nil {
		t.Fatalf("first StopServer: %v", err)
	}
	if err := m.StopServer("gopls"); err != nil {
		t.Errorf("second StopServer: %v", err)
	}
}

// ---------------------------------------------------------------------------
// GetClient
// ---------------------------------------------------------------------------

func TestManager_GetClient_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.GetClient(context.Background(), "readme.md")
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_GetClient_NoServerInstalled(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	// gopls may or may not be installed; just verify no panic.
	_, _ = m.GetClient(context.Background(), "main.go")
}

func TestManager_GetClient_Injected(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	client, err := m.GetClient(context.Background(), "main.go")
	if err != nil {
		t.Fatalf("GetClient(main.go): %v", err)
	}
	if client == nil {
		t.Fatal("GetClient returned nil client")
	}
	if !client.Initialized() {
		t.Error("client should be initialized")
	}
}

func TestManager_GetClient_CachedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	c1, err1 := m.GetClient(context.Background(), "main.go")
	c2, err2 := m.GetClient(context.Background(), "other.go")
	if err1 != nil || err2 != nil {
		t.Fatalf("GetClient errors: %v, %v", err1, err2)
	}
	if c1 != c2 {
		t.Error("GetClient should return the same cached client for same server")
	}
}

// ---------------------------------------------------------------------------
// Hover
// ---------------------------------------------------------------------------

func TestManager_Hover_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.Hover(context.Background(), "file:///readme.md", "readme.md", 0, 0)
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_Hover_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	result, err := m.Hover(ctx, "file:///tmp/main.go", "main.go", 5, 10)
	// The fake server returns nil result, so result should be nil.
	if err != nil {
		t.Logf("Hover returned error (acceptable): %v", err)
	}
	_ = result
}

// ---------------------------------------------------------------------------
// Definition
// ---------------------------------------------------------------------------

func TestManager_Definition_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.Definition(context.Background(), "file:///data.txt", "data.txt", 0, 0)
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_Definition_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := m.Definition(ctx, "file:///tmp/main.go", "main.go", 5, 10)
	_ = err
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

func TestManager_Implementation_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.Implementation(context.Background(), "file:///readme.md", "readme.md", 0, 0)
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_Implementation_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := m.Implementation(ctx, "file:///tmp/main.go", "main.go", 3, 5)
	_ = err
}

// ---------------------------------------------------------------------------
// TypeDefinition
// ---------------------------------------------------------------------------

func TestManager_TypeDefinition_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.TypeDefinition(context.Background(), "file:///log.txt", "log.txt", 0, 0)
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_TypeDefinition_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := m.TypeDefinition(ctx, "file:///tmp/main.go", "main.go", 1, 2)
	_ = err
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

func TestManager_References_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.References(context.Background(), "file:///Makefile", "Makefile", 0, 0)
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_References_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := m.References(ctx, "file:///tmp/main.go", "main.go", 10, 3)
	_ = err
}

// ---------------------------------------------------------------------------
// SignatureHelp
// ---------------------------------------------------------------------------

func TestManager_SignatureHelp_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.SignatureHelp(context.Background(), "file:///image.png", "image.png", 0, 0)
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_SignatureHelp_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := m.SignatureHelp(ctx, "file:///tmp/main.go", "main.go", 5, 8)
	_ = err
}

// ---------------------------------------------------------------------------
// DocumentSymbols
// ---------------------------------------------------------------------------

func TestManager_DocumentSymbols_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.DocumentSymbols(context.Background(), "file:///data.csv", "data.csv")
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_DocumentSymbols_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := m.DocumentSymbols(ctx, "file:///tmp/main.go", "main.go")
	_ = err
}

// ---------------------------------------------------------------------------
// CodeActions
// ---------------------------------------------------------------------------

func TestManager_CodeActions_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.CodeActions(context.Background(), "file:///style.css", "style.css", 0, 0)
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_CodeActions_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := m.CodeActions(ctx, "file:///tmp/main.go", "main.go", 3, 5)
	_ = err
}

// ---------------------------------------------------------------------------
// Rename
// ---------------------------------------------------------------------------

func TestManager_Rename_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.Rename(context.Background(), "file:///config.yaml", "config.yaml", 0, 0, "newName")
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_Rename_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := m.Rename(ctx, "file:///tmp/main.go", "main.go", 5, 10, "newFunc")
	_ = err
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

func TestManager_Formatting_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.Formatting(context.Background(), "file:///doc.pdf", "doc.pdf", FormattingOptions{TabSize: 4, InsertSpaces: true})
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_Formatting_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := m.Formatting(ctx, "file:///tmp/main.go", "main.go", FormattingOptions{TabSize: 4})
	_ = err
}

// ---------------------------------------------------------------------------
// RangeFormatting
// ---------------------------------------------------------------------------

func TestManager_RangeFormatting_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.RangeFormatting(context.Background(), "file:///archive.zip", "archive.zip", 0, 0, 10, 50, FormattingOptions{TabSize: 2})
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_RangeFormatting_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := m.RangeFormatting(ctx, "file:///tmp/main.go", "main.go", 1, 0, 10, 80, FormattingOptions{TabSize: 4})
	_ = err
}

// ---------------------------------------------------------------------------
// SelectionRanges
// ---------------------------------------------------------------------------

func TestManager_SelectionRanges_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.SelectionRanges(context.Background(), "file:///unknown.xyz", "unknown.xyz", []Position{{Line: 0, Character: 0}})
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_SelectionRanges_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := m.SelectionRanges(ctx, "file:///tmp/main.go", "main.go",
		[]Position{{Line: 5, Character: 10}})
	_ = err
}

// ---------------------------------------------------------------------------
// OnTypeFormatting
// ---------------------------------------------------------------------------

func TestManager_OnTypeFormatting_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.OnTypeFormatting(context.Background(), "file:///unknown.bin", "unknown.bin", 0, 0, "\n", FormattingOptions{TabSize: 4})
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_OnTypeFormatting_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := m.OnTypeFormatting(ctx, "file:///tmp/main.go", "main.go", 5, 10, "}", FormattingOptions{TabSize: 4})
	_ = err
}

// ---------------------------------------------------------------------------
// DocumentHighlight
// ---------------------------------------------------------------------------

func TestManager_DocumentHighlight_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.DocumentHighlight(context.Background(), "file:///image.jpg", "image.jpg", 0, 0)
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_DocumentHighlight_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := m.DocumentHighlight(ctx, "file:///tmp/main.go", "main.go", 8, 15)
	_ = err
}

// ---------------------------------------------------------------------------
// InlayHints
// ---------------------------------------------------------------------------

func TestManager_InlayHints_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.InlayHints(context.Background(), "file:///audio.mp3", "audio.mp3", 0, 100)
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_InlayHints_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := m.InlayHints(ctx, "file:///tmp/main.go", "main.go", 0, 50)
	_ = err
}

// ---------------------------------------------------------------------------
// FoldingRanges
// ---------------------------------------------------------------------------

func TestManager_FoldingRanges_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.FoldingRanges(context.Background(), "file:///video.mp4", "video.mp4")
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_FoldingRanges_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := m.FoldingRanges(ctx, "file:///tmp/main.go", "main.go")
	_ = err
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

func TestManager_Completion_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.Completion(context.Background(), "file:///data.bin", "data.bin", 0, 0, 1, "")
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_Completion_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := m.Completion(ctx, "file:///tmp/main.go", "main.go", 5, 10, 1, "")
	_ = err
}

// ---------------------------------------------------------------------------
// WorkspaceSymbols
// ---------------------------------------------------------------------------

func TestManager_WorkspaceSymbols_NoServer(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.WorkspaceSymbols(context.Background(), "main")
	if err == nil {
		t.Error("expected error when no LSP server is available")
	}
}

func TestManager_WorkspaceSymbols_WithClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := m.WorkspaceSymbols(ctx, "main")
	_ = err
}

// ---------------------------------------------------------------------------
// SemanticTokens / SemanticTokensRange
// ---------------------------------------------------------------------------

func TestManager_SemanticTokens_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.SemanticTokens(context.Background(), "file:///data.json", "data.json")
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_SemanticTokens_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := m.SemanticTokens(ctx, "file:///tmp/main.go", "main.go")
	_ = err
}

func TestManager_SemanticTokensRange_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.SemanticTokensRange(context.Background(), "file:///data.toml", "data.toml", 0, 0, 10, 50)
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

// ---------------------------------------------------------------------------
// GetSemanticTokensLegend
// ---------------------------------------------------------------------------

func TestManager_GetSemanticTokensLegend_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	legend := m.GetSemanticTokensLegend("unknown.xyz")
	if legend != nil {
		t.Error("expected nil legend for unknown file")
	}
}

// ---------------------------------------------------------------------------
// DocumentLinks
// ---------------------------------------------------------------------------

func TestManager_DocumentLinks_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.DocumentLinks(context.Background(), "file:///image.bmp", "image.bmp")
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_DocumentLinks_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := m.DocumentLinks(ctx, "file:///tmp/main.go", "main.go")
	_ = err
}

// ---------------------------------------------------------------------------
// CodeLenses
// ---------------------------------------------------------------------------

func TestManager_CodeLenses_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.CodeLenses(context.Background(), "file:///style.less", "style.less")
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_CodeLenses_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := m.CodeLenses(ctx, "file:///tmp/main.go", "main.go")
	_ = err
}

// ---------------------------------------------------------------------------
// CallHierarchy
// ---------------------------------------------------------------------------

func TestManager_PrepareCallHierarchy_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.PrepareCallHierarchy(context.Background(), "file:///data.sql", "data.sql", 0, 0)
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_PrepareCallHierarchy_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := m.PrepareCallHierarchy(ctx, "file:///tmp/main.go", "main.go", 5, 10)
	_ = err
}

func TestManager_CallHierarchyIncomingCalls_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	item := CallHierarchyItem{Name: "foo", URI: "file:///tmp/main.go"}
	_, err := m.CallHierarchyIncomingCalls(context.Background(), "unknown.bin", item)
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_CallHierarchyIncomingCalls_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	item := CallHierarchyItem{Name: "foo", URI: "file:///tmp/main.go"}
	_, err := m.CallHierarchyIncomingCalls(ctx, "main.go", item)
	_ = err
}

func TestManager_CallHierarchyOutgoingCalls_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	item := CallHierarchyItem{Name: "foo", URI: "file:///tmp/main.go"}
	_, err := m.CallHierarchyOutgoingCalls(context.Background(), "unknown.bin", item)
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_CallHierarchyOutgoingCalls_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	item := CallHierarchyItem{Name: "foo", URI: "file:///tmp/main.go"}
	_, err := m.CallHierarchyOutgoingCalls(ctx, "main.go", item)
	_ = err
}

// ---------------------------------------------------------------------------
// TypeHierarchy
// ---------------------------------------------------------------------------

func TestManager_PrepareTypeHierarchy_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	_, err := m.PrepareTypeHierarchy(context.Background(), "file:///data.xml", "data.xml", 0, 0)
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_PrepareTypeHierarchy_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := m.PrepareTypeHierarchy(ctx, "file:///tmp/main.go", "main.go", 5, 10)
	_ = err
}

func TestManager_TypeHierarchySupertypes_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	item := TypeHierarchyItem{Name: "MyStruct"}
	_, err := m.TypeHierarchySupertypes(context.Background(), "unknown.bin", item)
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_TypeHierarchySubtypes_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	item := TypeHierarchyItem{Name: "MyStruct"}
	_, err := m.TypeHierarchySubtypes(context.Background(), "unknown.bin", item)
	if err == nil {
		t.Error("expected error for unknown file extension")
	}
}

func TestManager_TypeHierarchySupertypes_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	item := TypeHierarchyItem{Name: "MyStruct"}
	_, err := m.TypeHierarchySupertypes(ctx, "main.go", item)
	_ = err
}

func TestManager_TypeHierarchySubtypes_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	item := TypeHierarchyItem{Name: "MyStruct"}
	_, err := m.TypeHierarchySubtypes(ctx, "main.go", item)
	_ = err
}

// ---------------------------------------------------------------------------
// DidOpen / DidChange / DidClose / DidSave
// ---------------------------------------------------------------------------

func TestManager_DidOpen_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	m.DidOpen(context.Background(), "file:///readme.md", "readme.md", "content")
}

func TestManager_DidChange_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	m.DidChange("readme.md", "new content")
}

func TestManager_DidClose_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	m.DidClose("readme.md")
}

func TestManager_DidSave_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	text := "saved content"
	m.DidSave("readme.md", &text)
}

func TestManager_DidSave_UnknownFile_NilText(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	m.DidSave("readme.md", nil)
}

func TestManager_DidChangeIncremental_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	m.DidChangeIncremental("readme.md", nil)
}

func TestManager_DidChangeIncremental_WithClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	m.DidOpen(context.Background(), "file:///tmp/main.go", "main.go", "package main")

	changes := []TextDocumentContentChangeEvent{
		{
			Range: &Range{
				Start: Position{Line: 0, Character: 12},
				End:   Position{Line: 0, Character: 12},
			},
			Text: "\n",
		},
	}
	m.DidChangeIncremental("main.go", changes)

	uri := toFileURI("main.go")
	m.mu.RLock()
	v := m.docVersion[uri]
	m.mu.RUnlock()
	if v != 1 {
		t.Errorf("docVersion = %d, want 1", v)
	}
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

func TestManager_GetDiagnostics_Empty(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	diags := m.GetDiagnostics("file:///tmp/main.go")
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics, got %d", len(diags))
	}
}

func TestManager_GetAllDiagnostics_Empty(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	all := m.GetAllDiagnostics()
	if len(all) != 0 {
		t.Errorf("expected empty map, got %d entries", len(all))
	}
}

func TestManager_Diagnostics_AfterClose(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	// Use the URI that DidClose will generate via toFileURI.
	filename := "/tmp/test_diag_main.go"
	uri := toFileURI(filename)

	m.mu.Lock()
	m.diagnostics[uri] = []Diagnostic{
		{Message: "test diagnostic", Severity: SeverityError},
	}
	m.mu.Unlock()

	diags := m.GetDiagnostics(uri)
	if len(diags) != 1 {
		t.Fatalf("expected 1 diagnostic, got %d", len(diags))
	}

	m.DidClose(filename)

	diags = m.GetDiagnostics(uri)
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics after DidClose, got %d", len(diags))
	}
}

func TestManager_GetAllDiagnostics_Multiple(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	m.mu.Lock()
	m.diagnostics["file:///a.go"] = []Diagnostic{{Message: "err1"}}
	m.diagnostics["file:///b.go"] = []Diagnostic{{Message: "err2"}, {Message: "err3"}}
	m.mu.Unlock()

	all := m.GetAllDiagnostics()
	if len(all) != 2 {
		t.Fatalf("expected 2 URIs, got %d", len(all))
	}
	if len(all["file:///a.go"]) != 1 {
		t.Errorf("expected 1 diag for a.go, got %d", len(all["file:///a.go"]))
	}
	if len(all["file:///b.go"]) != 2 {
		t.Errorf("expected 2 diags for b.go, got %d", len(all["file:///b.go"]))
	}
}

// ---------------------------------------------------------------------------
// OnDiagnostics callback
// ---------------------------------------------------------------------------

func TestManager_OnDiagnostics_Callback(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	var receivedURI string
	var receivedDiags []Diagnostic
	var wg sync.WaitGroup
	wg.Add(1)

	m.OnDiagnostics(func(uri string, diags []Diagnostic) {
		receivedURI = uri
		receivedDiags = diags
		wg.Done()
	})

	m.mu.Lock()
	uri := "file:///tmp/main.go"
	diags := []Diagnostic{{Message: "unused variable", Severity: SeverityWarning}}
	m.diagnostics[uri] = diags
	handler := m.diagHandler
	m.mu.Unlock()

	if handler != nil {
		handler(uri, diags)
	}

	wg.Wait()

	if receivedURI != uri {
		t.Errorf("callback uri = %q, want %q", receivedURI, uri)
	}
	if len(receivedDiags) != 1 {
		t.Fatalf("callback diags count = %d, want 1", len(receivedDiags))
	}
	if receivedDiags[0].Message != "unused variable" {
		t.Errorf("callback diag message = %q, want %q", receivedDiags[0].Message, "unused variable")
	}
}

// ---------------------------------------------------------------------------
// SupportsIncrementalSync
// ---------------------------------------------------------------------------

func TestManager_SupportsIncrementalSync_UnknownFile(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	if m.SupportsIncrementalSync("readme.md") {
		t.Error("should return false for unknown file")
	}
}

func TestManager_SupportsIncrementalSync_NoClient(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	if m.SupportsIncrementalSync("main.go") {
		t.Error("should return false when no client exists")
	}
}

func TestManager_SupportsIncrementalSync_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	if m.SupportsIncrementalSync("main.go") {
		t.Error("injected client should not support incremental sync by default")
	}
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

func TestManager_Status_WithInjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	status := m.Status()
	if len(status) != 1 {
		t.Fatalf("expected 1 status entry, got %d", len(status))
	}
	if status[0]["server"] != "gopls" {
		t.Errorf("server = %v, want gopls", status[0]["server"])
	}
	if status[0]["initialized"] != true {
		t.Error("initialized should be true")
	}
}

// ---------------------------------------------------------------------------
// Close
// ---------------------------------------------------------------------------

func TestManager_Close_Idempotent(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	if err := m.Close(); err != nil {
		t.Errorf("first Close(): %v", err)
	}
	if err := m.Close(); err != nil {
		t.Errorf("second Close(): %v", err)
	}
}

func TestManager_Close_WithInjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	if err := m.Close(); err != nil {
		t.Errorf("Close(): %v", err)
	}
}

// ---------------------------------------------------------------------------
// DidOpen tracking (openDocs for crash recovery)
// ---------------------------------------------------------------------------

func TestManager_DidOpen_TracksOpenDocs(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	uri := "file:///tmp/test_open_docs.go"
	m.DidOpen(context.Background(), uri, "/tmp/test_open_docs.go", "package main")

	m.mu.RLock()
	doc, ok := m.openDocs[uri]
	m.mu.RUnlock()

	if !ok {
		t.Fatal("expected openDocs entry")
	}
	if doc.language != "go" {
		t.Errorf("language = %q, want go", doc.language)
	}
	if doc.content != "package main" {
		t.Errorf("content = %q, want 'package main'", doc.content)
	}
}

func TestManager_DidChange_UpdatesTrackedContent(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	filename := "/tmp/test_change_content.go"
	uri := toFileURI(filename)

	m.DidOpen(context.Background(), uri, filename, "package main")
	m.DidChange(filename, "package main\n\nfunc main() {}")

	m.mu.RLock()
	doc, ok := m.openDocs[uri]
	m.mu.RUnlock()

	if !ok {
		t.Fatal("expected openDocs entry after DidChange")
	}
	if doc.content != "package main\n\nfunc main() {}" {
		t.Errorf("content not updated, got %q", doc.content)
	}
}

func TestManager_DidClose_ClearsTracking(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	filename := "/tmp/test_close_tracking.go"
	uri := toFileURI(filename)

	m.DidOpen(context.Background(), uri, filename, "package main")
	m.DidClose(filename)

	m.mu.RLock()
	_, openOk := m.openDocs[uri]
	_, closedOk := m.closedDocs[uri]
	m.mu.RUnlock()

	if openOk {
		t.Error("openDocs should be cleared after DidClose")
	}
	if !closedOk {
		t.Error("closedDocs should have entry after DidClose")
	}
}

// ---------------------------------------------------------------------------
// toFileURI
// ---------------------------------------------------------------------------

func TestToFileURI(t *testing.T) {
	got := toFileURI("/tmp/main.go")
	if got != "file:///tmp/main.go" {
		t.Errorf("toFileURI(/tmp/main.go) = %q, want file:///tmp/main.go", got)
	}

	got = toFileURI("relative.go")
	if len(got) < 8 || got[:7] != "file://" {
		t.Errorf("toFileURI(relative.go) should start with file://, got %q", got)
	}
}

// ---------------------------------------------------------------------------
// DocVersion incrementing
// ---------------------------------------------------------------------------

func TestManager_DidChange_IncrementsVersion(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	uri := toFileURI("main.go")

	m.DidChange("main.go", "v1")
	m.DidChange("main.go", "v2")
	m.DidChange("main.go", "v3")

	m.mu.RLock()
	v := m.docVersion[uri]
	m.mu.RUnlock()

	if v != 3 {
		t.Errorf("docVersion = %d, want 3", v)
	}
}

// ---------------------------------------------------------------------------
// Multiple languages
// ---------------------------------------------------------------------------

func TestManager_MultipleLanguages(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	// Don't defer m.Close() -- we use nopWriteCloser clients without readLoop,
	// so Close() would hang. Instead, clean up manually.
	// The Manager has no real servers to shut down.

	// Inject clients for different servers (no fake readLoop needed for GetClient tests).
	for _, name := range []string{"gopls", "rust-analyzer", "pyright"} {
		c := NewClient()
		c.stdin = nopWriteCloser{Writer: io.Discard}
		c.mu.Lock()
		c.initialized = true
		c.serverName = name
		c.closed = true // prevent Close() from trying to send shutdown
		c.mu.Unlock()
		m.mu.Lock()
		m.clients[name] = c
		m.mu.Unlock()
	}

	tests := []struct {
		filename   string
		serverName string
	}{
		{"main.go", "gopls"},
		{"lib.rs", "rust-analyzer"},
		{"app.py", "pyright"},
	}

	for _, tt := range tests {
		client, err := m.GetClient(context.Background(), tt.filename)
		if err != nil {
			t.Errorf("GetClient(%q): %v", tt.filename, err)
			continue
		}
		if client.ServerName() != tt.serverName {
			t.Errorf("GetClient(%q) server = %q, want %q", tt.filename, client.ServerName(), tt.serverName)
		}
	}
}

// ---------------------------------------------------------------------------
// ResolveWorkspacePath
// ---------------------------------------------------------------------------

func TestManager_ResolveWorkspacePath_Empty(t *testing.T) {
	path := ResolveWorkspacePath("")
	if path == "" {
		t.Error("ResolveWorkspacePath should not return empty string")
	}
}

func TestManager_ResolveWorkspacePath_NoMarkers(t *testing.T) {
	path := ResolveWorkspacePath("/tmp")
	if path != "/tmp" {
		t.Errorf("ResolveWorkspacePath(/tmp) = %q, want /tmp", path)
	}
}

func TestManager_ResolveWorkspacePath_CurrentDir(t *testing.T) {
	cwd, _ := os.Getwd()
	path := ResolveWorkspacePath(cwd)
	// ResolveWorkspacePath walks up to find project markers (go.mod, .git, etc.)
	// so it may return a parent directory, not cwd itself.
	if path == "" {
		t.Error("ResolveWorkspacePath should not return empty string")
	}
}

// ---------------------------------------------------------------------------
// StartServer additional coverage
// ---------------------------------------------------------------------------

func TestManager_StartServer_UnknownLanguage(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	err := m.StartServer(context.Background(), "cobol")
	if err == nil {
		t.Error("expected error for unknown language")
	}
	if !strings.Contains(err.Error(), "no LSP server configured") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestManager_StartServer_LanguageByID(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	// "go" is the language ID for .go files. StartServer should resolve it
	// through the languageIDs reverse lookup. Whether it succeeds or fails
	// depends on whether gopls is installed; just verify no panic.
	_ = m.StartServer(context.Background(), "go")
}

func TestManager_StartServer_AlreadyInitialized(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	// The client is already initialized; StartServer should return nil.
	err := m.StartServer(context.Background(), "go")
	if err != nil {
		t.Errorf("StartServer on already-initialized client: %v", err)
	}
}

func TestManager_StartServer_NotInstalled(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	err := m.StartServer(context.Background(), "python")
	if err == nil {
		t.Error("expected error when pyright not installed")
	}
}

// ---------------------------------------------------------------------------
// GetClient additional coverage
// ---------------------------------------------------------------------------

func TestManager_GetClient_UninitializedClient(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	// Inject an uninitialized client for gopls.
	c := NewClient()
	c.mu.Lock()
	c.initialized = false
	c.serverName = "gopls"
	c.closed = true // prevent Close from sending shutdown
	c.mu.Unlock()

	m.mu.Lock()
	m.clients["gopls"] = c
	m.mu.Unlock()

	// GetClient should try to StartServer. Whether it succeeds depends on
	// whether gopls is installed. Just verify no panic.
	_, _ = m.GetClient(context.Background(), "main.go")
}

// ---------------------------------------------------------------------------
// Diagnostics notification handler (publishDiagnostics)
// ---------------------------------------------------------------------------

func TestManager_DiagnosticsNotification_StoresDiagnostics(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	uri := "file:///tmp/test_diag.go"

	// Simulate a publishDiagnostics notification being received by the client.
	// We'll call the notification handler directly.
	m.mu.RLock()
	client := m.clients["gopls"]
	m.mu.RUnlock()

	diagParams := PublishDiagnosticsParams{
		URI: uri,
		Diagnostics: []Diagnostic{
			{Message: "unused import", Severity: SeverityWarning},
			{Message: "syntax error", Severity: SeverityError},
		},
	}
	params, _ := json.Marshal(diagParams)

	// Get the registered handler and call it.
	client.mu.Lock()
	handler := client.handlers["textDocument/publishDiagnostics"]
	client.mu.Unlock()

	if handler == nil {
		t.Fatal("publishDiagnostics handler not registered")
	}

	handler(params)

	diags := m.GetDiagnostics(uri)
	if len(diags) != 2 {
		t.Fatalf("expected 2 diagnostics, got %d", len(diags))
	}
	if diags[0].Message != "unused import" {
		t.Errorf("diag[0] message = %q, want 'unused import'", diags[0].Message)
	}
	if diags[1].Message != "syntax error" {
		t.Errorf("diag[1] message = %q, want 'syntax error'", diags[1].Message)
	}
}

func TestManager_DiagnosticsNotification_SuppressesClosedDoc(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	uri := "file:///tmp/closed_doc.go"

	// Mark the document as closed.
	m.mu.Lock()
	m.closedDocs[uri] = struct{}{}
	m.mu.Unlock()

	// Send a publishDiagnostics notification for the closed document.
	m.mu.RLock()
	client := m.clients["gopls"]
	m.mu.RUnlock()

	diagParams := PublishDiagnosticsParams{
		URI: uri,
		Diagnostics: []Diagnostic{
			{Message: "stale diagnostic", Severity: SeverityError},
		},
	}
	params, _ := json.Marshal(diagParams)

	client.mu.Lock()
	handler := client.handlers["textDocument/publishDiagnostics"]
	client.mu.Unlock()

	handler(params)

	// Diagnostics should be suppressed for closed docs.
	diags := m.GetDiagnostics(uri)
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics for closed doc, got %d", len(diags))
	}
}

func TestManager_DiagnosticsNotification_InvalidJSON(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	m.mu.RLock()
	client := m.clients["gopls"]
	m.mu.RUnlock()

	client.mu.Lock()
	handler := client.handlers["textDocument/publishDiagnostics"]
	client.mu.Unlock()

	// Invalid JSON should not panic.
	handler([]byte("not valid json"))

	// Verify no diagnostics were stored.
	all := m.GetAllDiagnostics()
	if len(all) != 0 {
		t.Errorf("expected 0 diagnostics after invalid JSON, got %d URIs", len(all))
	}
}

func TestManager_DiagnosticsNotification_WithCallback(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	var receivedURI string
	var receivedDiags []Diagnostic
	var wg sync.WaitGroup
	wg.Add(1)

	m.OnDiagnostics(func(uri string, diags []Diagnostic) {
		receivedURI = uri
		receivedDiags = diags
		wg.Done()
	})

	uri := "file:///tmp/callback_test.go"

	m.mu.RLock()
	client := m.clients["gopls"]
	m.mu.RUnlock()

	diagParams := PublishDiagnosticsParams{
		URI: uri,
		Diagnostics: []Diagnostic{
			{Message: "test callback", Severity: SeverityHint},
		},
	}
	params, _ := json.Marshal(diagParams)

	client.mu.Lock()
	handler := client.handlers["textDocument/publishDiagnostics"]
	client.mu.Unlock()

	handler(params)
	wg.Wait()

	if receivedURI != uri {
		t.Errorf("callback uri = %q, want %q", receivedURI, uri)
	}
	if len(receivedDiags) != 1 || receivedDiags[0].Message != "test callback" {
		t.Errorf("callback diags = %v, want one diag with 'test callback'", receivedDiags)
	}
}

// ---------------------------------------------------------------------------
// DidOpen / DidChange / DidClose / DidSave with injected client
// ---------------------------------------------------------------------------

func TestManager_DidOpen_WithClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	uri := "file:///tmp/test_didopen.go"
	m.DidOpen(context.Background(), uri, "/tmp/test_didopen.go", "package main\n")

	m.mu.RLock()
	doc, ok := m.openDocs[uri]
	m.mu.RUnlock()

	if !ok {
		t.Fatal("openDocs should have entry after DidOpen")
	}
	if doc.language != "go" {
		t.Errorf("language = %q, want 'go'", doc.language)
	}
}

func TestManager_DidChange_WithClient_NoOpenDoc(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	// DidChange without prior DidOpen -- should not panic,
	// just increment version.
	filename := "/tmp/no_open.go"
	m.DidChange(filename, "new content")

	uri := toFileURI(filename)
	m.mu.RLock()
	v := m.docVersion[uri]
	m.mu.RUnlock()

	if v != 1 {
		t.Errorf("docVersion = %d, want 1", v)
	}
}

func TestManager_DidClose_WithClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	filename := "/tmp/test_close.go"
	uri := toFileURI(filename)

	// Add some state to clean up.
	m.mu.Lock()
	m.diagnostics[uri] = []Diagnostic{{Message: "err"}}
	m.openDocs[uri] = openDocInfo{uri: uri, language: "go", content: "x", filename: filename}
	m.mu.Unlock()

	m.DidClose(filename)

	m.mu.RLock()
	_, hasDiag := m.diagnostics[uri]
	_, hasOpen := m.openDocs[uri]
	_, hasClosed := m.closedDocs[uri]
	v := m.docVersion[uri]
	m.mu.RUnlock()

	if hasDiag {
		t.Error("diagnostics should be cleared after DidClose")
	}
	if hasOpen {
		t.Error("openDocs should be cleared after DidClose")
	}
	if !hasClosed {
		t.Error("closedDocs should have entry after DidClose")
	}
	if v != 0 {
		t.Errorf("docVersion should be cleared, got %d", v)
	}
}

func TestManager_DidSave_WithClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	text := "package main\n"
	// Should not panic.
	m.DidSave("/tmp/test_save.go", &text)
	m.DidSave("/tmp/test_save.go", nil)
}

func TestManager_DidChangeIncremental_NoClient(t *testing.T) {
	m := NewManager("/tmp", NewScanner())
	defer m.Close()

	// No client for gopls -- should return early without panic.
	m.DidChangeIncremental("main.go", []TextDocumentContentChangeEvent{
		{Text: "change"},
	})
}

func TestManager_SupportsIncrementalSync_WithInjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	// Injected client has supportsIncremental=false by default.
	if m.SupportsIncrementalSync("main.go") {
		t.Error("should not support incremental sync by default")
	}
}

// ---------------------------------------------------------------------------
// FileURI helper
// ---------------------------------------------------------------------------

func TestFileURI_WorkspaceRelative(t *testing.T) {
	got := FileURI("/workspace", "src/main.go")
	want := "file:///workspace/src/main.go"
	if got != want {
		t.Errorf("FileURI(/workspace, src/main.go) = %q, want %q", got, want)
	}
}

// ---------------------------------------------------------------------------
// GetServerName / GetLanguageID edge cases
// ---------------------------------------------------------------------------

func TestGetServerName_Known(t *testing.T) {
	tests := []struct {
		filename string
		server   string
	}{
		{"main.go", "gopls"},
		{"lib.rs", "rust-analyzer"},
		{"app.py", "pyright"},
		{"index.ts", "typescript-language-server"},
		{"Component.tsx", "typescript-language-server"},
		{"app.js", "typescript-language-server"},
		{"App.jsx", "typescript-language-server"},
		{"Main.java", "jdtls"},
		{"main.c", "clangd"},
		{"main.cpp", "clangd"},
		{"main.cc", "clangd"},
		{"main.cxx", "clangd"},
		{"header.h", "clangd"},
		{"header.hpp", "clangd"},
		{"Program.cs", "omnisharp"},
		{"Script.csx", "omnisharp"},
		{"app.mbr", "moon"},
	}
	for _, tt := range tests {
		got := GetServerName(tt.filename)
		if got != tt.server {
			t.Errorf("GetServerName(%q) = %q, want %q", tt.filename, got, tt.server)
		}
	}
}

func TestGetServerName_Unknown(t *testing.T) {
	got := GetServerName("readme.md")
	if got != "" {
		t.Errorf("GetServerName(readme.md) = %q, want empty", got)
	}
}

func TestGetLanguageID_Known(t *testing.T) {
	tests := []struct {
		filename string
		lang     string
	}{
		{"main.go", "go"},
		{"lib.rs", "rust"},
		{"app.py", "python"},
		{"index.ts", "typescript"},
		{"Component.tsx", "typescriptreact"},
		{"app.js", "javascript"},
		{"App.jsx", "javascriptreact"},
		{"Main.java", "java"},
		{"main.c", "c"},
		{"main.cpp", "cpp"},
		{"Program.cs", "csharp"},
		{"app.mbr", "moonbit"},
	}
	for _, tt := range tests {
		got := GetLanguageID(tt.filename)
		if got != tt.lang {
			t.Errorf("GetLanguageID(%q) = %q, want %q", tt.filename, got, tt.lang)
		}
	}
}

func TestGetLanguageID_Unknown(t *testing.T) {
	got := GetLanguageID("data.csv")
	if got != "" {
		t.Errorf("GetLanguageID(data.csv) = %q, want empty", got)
	}
}

// ---------------------------------------------------------------------------
// SemanticTokensRange with injected client
// ---------------------------------------------------------------------------

func TestManager_SemanticTokensRange_InjectedClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	_, err := m.SemanticTokensRange(ctx, "file:///tmp/main.go", "main.go", 0, 0, 10, 50)
	_ = err
}

// ---------------------------------------------------------------------------
// GetSemanticTokensLegend with injected client
// ---------------------------------------------------------------------------

func TestManager_GetSemanticTokensLegend_WithClient(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	// Injected client has no semanticTokensLegend set, so should return nil.
	legend := m.GetSemanticTokensLegend("main.go")
	if legend != nil {
		t.Error("expected nil legend for client without semantic tokens support")
	}
}

// ---------------------------------------------------------------------------
// DidOpen clears closedDocs
// ---------------------------------------------------------------------------

func TestManager_DidOpen_ClearsClosedDocs(t *testing.T) {
	m := newTestManager(t, "gopls")
	defer m.Close()

	uri := "file:///tmp/reopen.go"
	filename := "/tmp/reopen.go"

	// Simulate a previous close.
	m.mu.Lock()
	m.closedDocs[uri] = struct{}{}
	m.mu.Unlock()

	// Re-opening should clear the closedDocs entry.
	m.DidOpen(context.Background(), uri, filename, "package main")

	m.mu.RLock()
	_, closed := m.closedDocs[uri]
	m.mu.RUnlock()

	if closed {
		t.Error("closedDocs should be cleared after DidOpen")
	}
}
