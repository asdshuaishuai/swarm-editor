# Real Terminal (xterm.js + PTY) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current log-only TerminalPanel with a real interactive terminal using xterm.js on the frontend and a Go PTY backend, matching VS Code's integrated terminal experience.

**Architecture:** The terminal uses a **dedicated WebSocket** (`/api/terminal/ws`) separate from the JSON-RPC WebSocket, because terminal data is raw binary/text (not JSON-RPC). The Go backend uses `creack/pty` to spawn shell processes with pseudo-terminal support. The frontend connects xterm.js directly to this WebSocket for low-latency bidirectional I/O.

**Tech Stack:**
- Backend: Go `creack/pty` + `gorilla/websocket` (already in go.mod)
- Frontend: `@xterm/xterm` v5 + `@xterm/addon-fit` + `@xterm/addon-web-links`
- Communication: Raw WebSocket messages (not JSON-RPC)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `internal/terminal/pty.go` | PTY process management — spawn, resize, kill shell |
| `internal/terminal/manager.go` | Terminal session lifecycle — create, list, destroy sessions |
| `internal/api/terminal.go` | HTTP handler — WebSocket upgrade, PTY↔WS bridge |
| `ui/src/components/TerminalPanel.tsx` | **Rewrite** — xterm.js terminal with tab support |
| `ui/src/hooks/useTerminal.ts` | Hook for terminal WebSocket connection + xterm lifecycle |
| `ui/src/services/terminalApi.ts` | Terminal API client — session management (HTTP) |

### Key Design Decisions

1. **Separate WebSocket** — Terminal needs raw binary flow, incompatible with JSON-RPC protocol
2. **Multiple terminal tabs** — VS Code supports N terminals; we use a session ID per tab
3. **PTY resize propagation** — xterm.js `onResize` → WebSocket → PTY window size update
4. **Shell detection** — Default to `$SHELL`, fallback to `/bin/bash`
5. **Graceful cleanup** — PTY killed on WebSocket disconnect, process group cleanup

---

## Task 1: Go Backend — PTY Process Management

**Files:**
- Create: `internal/terminal/pty.go`
- Test: `internal/terminal/pty_test.go`

- [ ] **Step 1: Write the failing test**

```go
// internal/terminal/pty_test.go
package terminal

import (
	"testing"
	"time"
)

func TestNewPtySpawnsShell(t *testing.T) {
	pty, err := NewPty("/bin/bash", "")
	if err != nil {
		t.Fatalf("NewPty failed: %v", err)
	}
	defer pty.Close()

	if pty.Pid() <= 0 {
		t.Error("expected positive PID")
	}

	// Give shell time to start
	time.Sleep(100 * time.Millisecond)

	if !pty.Alive() {
		t.Error("PTY should be alive after spawn")
	}
}

func TestPtyWriteAndRead(t *testing.T) {
	pty, err := NewPty("/bin/bash", "")
	if err != nil {
		t.Fatalf("NewPty failed: %v", err)
	}
	defer pty.Close()

	time.Sleep(100 * time.Millisecond)

	// Write a command
	_, err = pty.Write([]byte("echo hello_xterm_test\n"))
	if err != nil {
		t.Fatalf("Write failed: %v", err)
	}

	// Read output (give time for shell to process)
	time.Sleep(200 * time.Millisecond)

	buf := make([]byte, 4096)
	n, err := pty.Read(buf)
	if err != nil {
		t.Fatalf("Read failed: %v", err)
	}

	output := string(buf[:n])
	if !strings.Contains(output, "hello_xterm_test") {
		t.Errorf("expected output to contain 'hello_xterm_test', got: %s", output)
	}
}

func TestPtyResize(t *testing.T) {
	pty, err := NewPty("/bin/bash", "")
	if err != nil {
		t.Fatalf("NewPty failed: %v", err)
	}
	defer pty.Close()

	err = pty.Resize(120, 40)
	if err != nil {
		t.Fatalf("Resize failed: %v", err)
	}

	ws := pty.WindowSize()
	if ws.Cols != 120 || ws.Rows != 40 {
		t.Errorf("expected 120x40, got %dx%d", ws.Cols, ws.Rows)
	}
}

func TestPtyClose(t *testing.T) {
	pty, err := NewPty("/bin/bash", "")
	if err != nil {
		t.Fatalf("NewPty failed: %v", err)
	}

	pty.Close()

	if pty.Alive() {
		t.Error("PTY should not be alive after close")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/kelthas/code/swarm-editor && go test ./internal/terminal/... -v -run TestNewPtySpawnsShell`
Expected: FAIL — package doesn't exist

- [ ] **Step 3: Install dependency + write implementation**

Run: `cd /home/kelthas/code/swarm-editor && go get creack/pty@latest`

```go
// internal/terminal/pty.go
package terminal

import (
	"os"
	"os/exec"
	"sync"

	"github.com/creack/pty"
)

// Pty wraps a pseudo-terminal process
type Pty struct {
	ptmx    *os.File
	cmd     *exec.Cmd
	pid     int
	mu      sync.Mutex
	alive   bool
	cols    uint16
	rows    uint16
}

// WindowSize holds terminal dimensions
type WindowSize struct {
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

// NewPty spawns a shell in a new pseudo-terminal
// shell is the path to the shell binary (e.g., "/bin/bash")
// initialDir is the working directory (empty = current)
func NewPty(shell string, initialDir string) (*Pty, error) {
	if shell == "" {
		shell = os.Getenv("SHELL")
		if shell == "" {
			shell = "/bin/bash"
		}
	}

	cmd := exec.Command(shell)
	if initialDir != "" {
		cmd.Dir = initialDir
	}
	cmd.Env = os.Environ()

	ptmx, err := pty.Start(cmd)
	if err != nil {
		return nil, err
	}

	ws, err := pty.GetsizeFull(ptmx)
	if err != nil {
		ws = &pty.Winsize{Cols: 80, Rows: 24}
	}

	return &Pty{
		ptmx:  ptmx,
		cmd:   cmd,
		pid:   cmd.Process.Pid,
		alive: true,
		cols:  ws.Cols,
		rows:  ws.Rows,
	}, nil
}

// Pid returns the process ID
func (p *Pty) Pid() int { return p.pid }

// Alive returns whether the PTY process is still running
func (p *Pty) Alive() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.alive
}

// Read reads from the PTY (non-blocking)
func (p *Pty) Read(buf []byte) (int, error) {
	return p.ptmx.Read(buf)
}

// Write writes to the PTY
func (p *Pty) Write(data []byte) (int, error) {
	return p.ptmx.Write(data)
}

// Resize changes the terminal window size
func (p *Pty) Resize(cols, rows uint16) error {
	p.mu.Lock()
	p.cols = cols
	p.rows = rows
	p.mu.Unlock()

	return pty.Setsize(p.ptmx, &pty.Winsize{Cols: cols, Rows: rows})
}

// WindowSize returns current terminal dimensions
func (p *Pty) WindowSize() WindowSize {
	p.mu.Lock()
	defer p.mu.Unlock()
	return WindowSize{Cols: p.cols, Rows: p.rows}
}

// Close kills the process and closes the PTY
func (p *Pty) Close() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if !p.alive {
		return nil
	}
	p.alive = false

	if p.cmd.Process != nil {
		p.cmd.Process.Kill()
	}
	return p.ptmx.Close()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/kelthas/code/swarm-editor && go test ./internal/terminal/... -v`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add internal/terminal/pty.go internal/terminal/pty_test.go go.mod go.sum
git commit -m "feat(terminal): add PTY process management with creack/pty"
```

---

## Task 2: Go Backend — Terminal Session Manager

**Files:**
- Create: `internal/terminal/manager.go`
- Test: `internal/terminal/manager_test.go`

- [ ] **Step 1: Write the failing test**

```go
// internal/terminal/manager_test.go
package terminal

import (
	"testing"
)

func TestManagerCreateAndList(t *testing.T) {
	m := NewManager("/tmp")
	if len(m.List()) != 0 {
		t.Error("new manager should have no sessions")
	}

	sess, err := m.Create("/bin/bash", "/tmp")
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	sessions := m.List()
	if len(sessions) != 1 {
		t.Errorf("expected 1 session, got %d", len(sessions))
	}

	if sessions[0].ID != sess.ID {
		t.Error("session ID mismatch")
	}
}

func TestManagerGetAndDestroy(t *testing.T) {
	m := NewManager("/tmp")

	sess, _ := m.Create("/bin/bash", "/tmp")

	got, ok := m.Get(sess.ID)
	if !ok {
		t.Error("Get should find session")
	}
	if got.ID != sess.ID {
		t.Error("session ID mismatch")
	}

	m.Destroy(sess.ID)

	_, ok = m.Get(sess.ID)
	if ok {
		t.Error("Get should not find destroyed session")
	}
}

func TestManagerDestroyAll(t *testing.T) {
	m := NewManager("/tmp")
	m.Create("/bin/bash", "/tmp")
	m.Create("/bin/bash", "/tmp")

	if len(m.List()) != 2 {
		t.Error("expected 2 sessions")
	}

	m.DestroyAll()

	if len(m.List()) != 0 {
		t.Error("expected 0 sessions after DestroyAll")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/kelthas/code/swarm-editor && go test ./internal/terminal/... -v -run TestManagerCreateAndList`
Expected: FAIL — undefined: NewManager

- [ ] **Step 3: Write implementation**

```go
// internal/terminal/manager.go
package terminal

import (
	"fmt"
	"sync"

	"github.com/google/uuid"
)

// Session represents a terminal session
type Session struct {
	ID   string    `json:"id"`
	Pty  *Pty      `json:"-"`
	Dir  string    `json:"dir"`
	Shell string   `json:"shell"`
}

// Manager manages multiple terminal sessions
type Manager struct {
	mu       sync.RWMutex
	sessions map[string]*Session
	workDir  string
}

// NewManager creates a terminal session manager
func NewManager(workDir string) *Manager {
	return &Manager{
		sessions: make(map[string]*Session),
		workDir:  workDir,
	}
}

// Create spawns a new terminal session
func (m *Manager) Create(shell string, dir string) (*Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if dir == "" {
		dir = m.workDir
	}

	pty, err := NewPty(shell, dir)
	if err != nil {
		return nil, fmt.Errorf("failed to create PTY: %w", err)
	}

	id := "term_" + uuid.New().String()[:8]
	sess := &Session{
		ID:    id,
		Pty:   pty,
		Dir:   dir,
		Shell: shell,
	}
	m.sessions[id] = sess
	return sess, nil
}

// Get returns a session by ID
func (m *Manager) Get(id string) (*Session, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	sess, ok := m.sessions[id]
	return sess, ok
}

// List returns all active sessions
func (m *Manager) List() []*Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make([]*Session, 0, len(m.sessions))
	for _, s := range m.sessions {
		result = append(result, s)
	}
	return result
}

// Destroy closes and removes a session
func (m *Manager) Destroy(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if sess, ok := m.sessions[id]; ok {
		sess.Pty.Close()
		delete(m.sessions, id)
	}
}

// DestroyAll closes all sessions
func (m *Manager) DestroyAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for id, sess := range m.sessions {
		sess.Pty.Close()
		delete(m.sessions, id)
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/kelthas/code/swarm-editor && go test ./internal/terminal/... -v`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add internal/terminal/manager.go internal/terminal/manager_test.go
git commit -m "feat(terminal): add session manager for multi-tab terminal support"
```

---

## Task 3: Go Backend — Terminal WebSocket Handler

**Files:**
- Create: `internal/api/terminal.go`
- Modify: `internal/api/handler.go` (register route)
- Modify: `cmd/swarm-editor/main.go` (wire Manager)

- [ ] **Step 1: Write terminal WebSocket handler**

```go
// internal/api/terminal.go
package api

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"

	"github.com/swarm-editor/swarm-editor/internal/terminal"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// TerminalMessage is the JSON message sent over the terminal WebSocket
type TerminalMessage struct {
	Type string `json:"type"` // "input", "resize", "ping"
	// input
	Data string `json:"data,omitempty"`
	// resize
	Cols uint16 `json:"cols,omitempty"`
	Rows uint16 `json:"rows,omitempty"`
}

// HandleTerminalWebSocket upgrades HTTP to WebSocket and bridges PTY I/O
func (s *WebSocketServer) HandleTerminalWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("terminal ws upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	// Parse session ID from query: /api/terminal/ws?session=term_xxxx
	sessionID := r.URL.Query().Get("session")
	if sessionID == "" {
		// Create a new session
		sess, err := s.terminalMgr.Create("", s.workDir)
		if err != nil {
			log.Printf("terminal create failed: %v", err)
			return
		}
		sessionID = sess.ID
		// Send session ID back
		conn.WriteJSON(map[string]string{"type": "session", "id": sessionID})
	}

	sess, ok := s.terminalMgr.Get(sessionID)
	if !ok {
		conn.WriteJSON(map[string]string{"type": "error", "message": "session not found"})
		return
	}

	pty := sess.Pty

	var once sync.Once
	done := make(chan struct{})

	// PTY → WebSocket (read from PTY, write to WS)
	go func() {
		defer once.Do(func() { close(done) })
		buf := make([]byte, 4096)
		for {
			n, err := pty.Read(buf)
			if err != nil {
				if err != io.EOF {
					log.Printf("terminal read error: %v", err)
				}
				return
			}
			if n > 0 {
				if err := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); err != nil {
					return
				}
			}
		}
	}()

	// WebSocket → PTY (read from WS, write to PTY)
	go func() {
		defer once.Do(func() { close(done) })
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}

			// Try JSON message (resize, etc.)
			var tm TerminalMessage
			if json.Unmarshal(msg, &tm) == nil && tm.Type != "" {
				switch tm.Type {
				case "resize":
					pty.Resize(tm.Cols, tm.Rows)
				case "input":
					pty.Write([]byte(tm.Data))
				case "ping":
					conn.WriteJSON(map[string]string{"type": "pong"})
				}
				continue
			}

			// Raw binary input (keystrokes)
			pty.Write(msg)
		}
	}()

	<-done
	s.terminalMgr.Destroy(sessionID)
}
```

- [ ] **Step 2: Register route in WebSocket server**

Add to `WebSocketServer` struct and initialization:
- Add `terminalMgr *terminal.Manager` and `workDir string` fields
- Add `HandleTerminalWebSocket` as `GET /api/terminal/ws`

- [ ] **Step 3: Wire Manager in main.go**

In `cmd/swarm-editor/main.go`, create Manager with workspace directory and pass to WebSocketServer.

- [ ] **Step 4: Verify Go build**

Run: `cd /home/kelthas/code/swarm-editor && go build ./...`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/api/terminal.go internal/api/handler.go cmd/swarm-editor/main.go
git commit -m "feat(terminal): add WebSocket handler bridging PTY and xterm.js"
```

---

## Task 4: Frontend — Install xterm.js Dependencies

**Files:**
- Modify: `ui/package.json`

- [ ] **Step 1: Install xterm.js packages**

Run: `cd /home/kelthas/code/swarm-editor/ui && npm install @xterm/xterm @xterm/addon-fit @xterm/addon-web-links`

- [ ] **Step 2: Verify installation**

Run: `cd /home/kelthas/code/swarm-editor/ui && npm list @xterm/xterm @xterm/addon-fit @xterm/addon-web-links`
Expected: All three packages listed

- [ ] **Step 3: Commit**

```bash
git add ui/package.json ui/package-lock.json
git commit -m "feat(terminal): install xterm.js v5 with fit and web-links addons"
```

---

## Task 5: Frontend — Terminal Hook (useTerminal)

**Files:**
- Create: `ui/src/hooks/useTerminal.ts`
- Test: `ui/src/hooks/useTerminal.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// ui/src/hooks/useTerminal.test.ts
import { renderHook, act } from '@testing-library/react'
import { useTerminal } from './useTerminal'

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = []
  url: string
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((ev: { data: ArrayBuffer }) => void) | null = null
  onerror: (() => void) | null = null
  readyState = 0
  CLOSED = 3

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
    setTimeout(() => { this.readyState = 1; this.onopen?.() }, 0)
  }

  send(data: ArrayBuffer | string) {}
  close() { this.readyState = this.CLOSED; this.onclose?.() }

  static clear() { MockWebSocket.instances = [] }
}

vi.stubGlobal('WebSocket', MockWebSocket)

describe('useTerminal', () => {
  beforeEach(() => { MockWebSocket.clear() })

  it('should initialize with disconnected state', () => {
    const { result } = renderHook(() => useTerminal())
    expect(result.current.connected).toBe(false)
    expect(result.current.sessionId).toBeNull()
  })

  it('should connect and set sessionId', async () => {
    const { result } = renderHook(() => useTerminal())
    await act(async () => {
      result.current.connect()
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(result.current.connected).toBe(true)
    expect(result.current.sessionId).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/kelthas/code/swarm-editor/ui && npx vitest run src/hooks/useTerminal.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// ui/src/hooks/useTerminal.ts
import { useState, useCallback, useRef } from 'react'

interface UseTerminalReturn {
  connected: boolean
  sessionId: string | null
  connect: (existingSessionId?: string) => void
  disconnect: () => void
  sendInput: (data: string) => void
  resize: (cols: number, rows: number) => void
  wsRef: React.MutableRefObject<WebSocket | null>
}

export function useTerminal(): UseTerminalReturn {
  const [connected, setConnected] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const connect = useCallback((existingSessionId?: string) => {
    if (wsRef.current) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = existingSessionId
      ? `${protocol}//${window.location.host}/api/terminal/ws?session=${existingSessionId}`
      : `${protocol}//${window.location.host}/api/terminal/ws`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      setConnected(true)
    }

    ws.onmessage = (ev) => {
      // Handle JSON control messages
      if (typeof ev.data === 'string') {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.type === 'session') {
            setSessionId(msg.id)
          }
          return
        } catch {
          // Not JSON, fall through
        }
      }
      // Binary data handled by xterm directly via wsRef
    }

    ws.onclose = () => {
      setConnected(false)
      wsRef.current = null
    }

    ws.onerror = () => {
      setConnected(false)
      wsRef.current = null
    }
  }, [])

  const disconnect = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
    setConnected(false)
    setSessionId(null)
  }, [])

  const sendInput = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input', data }))
    }
  }, [])

  const resize = useCallback((cols: number, rows: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }))
    }
  }, [])

  return { connected, sessionId, connect, disconnect, sendInput, resize, wsRef }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/kelthas/code/swarm-editor/ui && npx vitest run src/hooks/useTerminal.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ui/src/hooks/useTerminal.ts ui/src/hooks/useTerminal.test.ts
git commit -m "feat(terminal): add useTerminal hook for WebSocket connection management"
```

---

## Task 6: Frontend — Rewrite TerminalPanel with xterm.js

**Files:**
- Modify: `ui/src/panels/TerminalPanel.tsx` (complete rewrite)
- Modify: `ui/src/panels/TerminalPanel.test.tsx` (update tests)

- [ ] **Step 1: Rewrite TerminalPanel**

Key implementation points:
- Replace log-based rendering with xterm.js `Terminal` instance
- Use `useTerminal` hook for WebSocket lifecycle
- Use `@xterm/addon-fit` for auto-resize on panel resize
- Use `@xterm/addon-web-links` for clickable URLs
- Keep existing resize handle, collapse, and header bar UI
- Add "+" button to create new terminal tabs
- Support multiple terminal sessions (tabs in header)
- Apply theme: `xterm` dark theme matching Swarm Editor's dark mode

```typescript
// Pseudocode structure:
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { useTerminal } from '../hooks/useTerminal'
import '@xterm/xterm/css/xterm.css'

// Props: keep existing resize props, add sessions management
// State: sessions array, activeSessionId
// Refs: terminalRef (xterm Terminal instance), containerRef (DOM element)

// useEffect: on mount, create xterm Terminal, attach addons, connect WS
// useEffect: bridge WS binary messages → xterm.write()
// useEffect: bridge xterm.onData() → sendInput()
// useEffect: fit addon on resize
// Cleanup: dispose terminal + addons on unmount
```

- [ ] **Step 2: Update tests**

Existing tests check for `TerminalEntry[]` props. Update to test new xterm-based rendering:
- Test that terminal container is rendered
- Test connect/disconnect lifecycle
- Test that `onClose` callback works

- [ ] **Step 3: Run tests**

Run: `cd /home/kelthas/code/swarm-editor/ui && npx vitest run src/panels/TerminalPanel.test.ts`
Expected: PASS

- [ ] **Step 4: Run TypeScript check**

Run: `cd /home/kelthas/code/swarm-editor/ui && npx tsc --noEmit`
Expected: PASS (no errors)

- [ ] **Step 5: Commit**

```bash
git add ui/src/panels/TerminalPanel.tsx ui/src/panels/TerminalPanel.test.tsx
git commit -m "feat(terminal): rewrite TerminalPanel with xterm.js real PTY terminal"
```

---

## Task 7: Integration — Wire TerminalPanel in EditorPanel

**Files:**
- Modify: `ui/src/panels/EditorPanel.tsx` (update TerminalPanel usage)

- [ ] **Step 1: Update TerminalPanel props in EditorPanel**

The current `EditorPanel.tsx` passes `entries` and `onClear` props to `TerminalPanel`. The new xterm-based TerminalPanel manages its own state internally via WebSocket. Update the import and remove the old props:

- Remove `terminalEntries` state and `addTerminalEntry` calls
- Change `<TerminalPanel entries={...} onClear={...} />` to `<TerminalPanel onClose={...} />`
- Keep the `showTerminal` toggle logic

- [ ] **Step 2: Update other TerminalPanel consumers**

Check for any other files that import or render `TerminalPanel`:
- `ui/src/components/layouts/MainLayout.tsx` — may also render TerminalPanel

- [ ] **Step 3: Run full test suite**

Run: `cd /home/kelthas/code/swarm-editor/ui && npm run test`
Expected: 906/906 PASS (or higher with new tests)

- [ ] **Step 4: Run Go build**

Run: `cd /home/kelthas/code/swarm-editor && go build ./...`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ui/src/panels/EditorPanel.tsx
git commit -m "feat(terminal): integrate xterm TerminalPanel in EditorPanel"
```

---

## Task 8: Theme Integration — xterm Color Scheme

**Files:**
- Modify: `ui/src/panels/TerminalPanel.tsx` (add theme support)
- Modify: `ui/src/theme/monacoTheme.ts` (export terminal theme)

- [ ] **Step 1: Add xterm theme to monacoTheme.ts**

Create a matching terminal color scheme based on existing Swarm Editor theme variables:

```typescript
export const xtermTheme: ITerminalOptions = {
  theme: {
    background: '#1e1e2e',      // bg-mac-bg
    foreground: '#cdd6f4',      // text-primary
    cursor: '#89b4fa',          // accent blue
    cursorAccent: '#1e1e2e',
    selectionBackground: '#45475a80',
    black: '#45475a',
    red: '#f38ba8',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    blue: '#89b4fa',
    magenta: '#f5c2e7',
    cyan: '#94e2d5',
    white: '#bac2de',
    brightBlack: '#585b70',
    brightRed: '#f38ba8',
    brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af',
    brightBlue: '#89b4fa',
    brightMagenta: '#f5c2e7',
    brightCyan: '#94e2d5',
    brightWhite: '#a6adc8',
  },
}
```

- [ ] **Step 2: Apply theme in TerminalPanel**

Pass theme options when creating xterm Terminal instance. Support both dark and light modes via `useTheme()`.

- [ ] **Step 3: Commit**

```bash
git add ui/src/theme/monacoTheme.ts ui/src/panels/TerminalPanel.tsx
git commit -m "feat(terminal): add matching xterm color theme for dark/light modes"
```

---

## Task 9: Final Verification

- [ ] **Step 1: Full test suite**

Run: `cd /home/kelthas/code/swarm-editor/ui && npm run test`
Expected: All tests PASS

- [ ] **Step 2: Go build + tests**

Run: `cd /home/kelthas/code/swarm-editor && go build ./... && go test ./...`
Expected: All PASS

- [ ] **Step 3: TypeScript + ESLint**

Run: `cd /home/kelthas/code/swarm-editor/ui && npx tsc --noEmit && npx eslint src --max-warnings 0`
Expected: Clean

- [ ] **Step 4: Manual smoke test**

1. Start backend: `go run ./cmd/swarm-editor`
2. Start frontend: `cd ui && npm run dev`
3. Open browser → Ctrl+` to toggle terminal
4. Verify: shell prompt appears, commands execute, resize works, close works

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| `creack/pty` not available on all platforms | Fallback to `os/exec` without PTY (no resize support) |
| WebSocket binary framing issues | Use consistent BinaryMessage type, test with xterm.js |
| xterm.js v5 API changes | Pin version in package.json |
| Terminal sessions leak on disconnect | Manager tracks sessions, cleanup on WS close |
| Large output buffering | Use bounded read buffer (4KB), xterm.js handles rendering |
