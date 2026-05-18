package api

import (
	"encoding/json"
	"io"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"

	"github.com/swarm-editor/swarm-editor/internal/log"
)

var termLog = log.With("component", "TerminalWS")

// TerminalMessage is a JSON control message over the terminal WebSocket.
type TerminalMessage struct {
	Type string `json:"type"` // "input", "resize", "ping"
	Data string `json:"data,omitempty"`
	Cols uint16 `json:"cols,omitempty"`
	Rows uint16 `json:"rows,omitempty"`
}

// HandleTerminalWebSocket upgrades HTTP to WebSocket and bridges PTY I/O.
// This is a SEPARATE WebSocket from the JSON-RPC one -- terminal needs raw binary flow.
func (s *WebSocketServer) HandleTerminalWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		termLog.Error("WebSocket upgrade failed", "error", err)
		return
	}
	defer conn.Close()

	// Parse session ID from query: /api/terminal/ws?session=term_xxxx
	sessionID := r.URL.Query().Get("session")
	if sessionID == "" {
		// Create a new session
		sess, err := s.terminalMgr.Create("", s.workspacePath)
		if err != nil {
			termLog.Error("Session create failed", "error", err)
			return
		}
		sessionID = sess.ID
		if err := conn.WriteJSON(map[string]string{"type": "session", "id": sessionID}); err != nil {
			termLog.Error("Failed to send session ID", "error", err)
			return
		}
	}

	sess, ok := s.terminalMgr.Get(sessionID)
	if !ok {
		conn.WriteJSON(map[string]string{"type": "error", "message": "session not found"})
		return
	}
	pty := sess.Pty

	// Write mutex prevents concurrent WebSocket writes from PTY output goroutine
	// and pong/control responses (gorilla/websocket is not safe for concurrent writes)
	var writeMu sync.Mutex
	var once sync.Once
	done := make(chan struct{})

	// PTY -> WebSocket: read PTY output and forward as binary frames
	go func() {
		defer once.Do(func() { close(done) })
		buf := make([]byte, 4096)
		for {
			n, err := pty.Read(buf)
			if err != nil {
				if err != io.EOF {
					termLog.Error("PTY read error", "session", sessionID, "error", err)
				}
				return
			}
			if n > 0 {
				writeMu.Lock()
				err := conn.WriteMessage(websocket.BinaryMessage, buf[:n])
				writeMu.Unlock()
				if err != nil {
					return
				}
			}
		}
	}()

	// WebSocket -> PTY: read client messages and forward to PTY
	go func() {
		defer once.Do(func() { close(done) })
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			// Try JSON control message first
			var tm TerminalMessage
			if json.Unmarshal(msg, &tm) == nil && tm.Type != "" {
				switch tm.Type {
				case "resize":
					pty.Resize(tm.Cols, tm.Rows)
				case "input":
					pty.Write([]byte(tm.Data))
				case "ping":
					writeMu.Lock()
					conn.WriteJSON(map[string]string{"type": "pong"})
					writeMu.Unlock()
				}
				continue
			}
			// Raw binary input (keystrokes)
			pty.Write(msg)
		}
	}()

	<-done
	s.terminalMgr.Destroy(sessionID)
	termLog.Info("Terminal session closed", "session", sessionID)
}
