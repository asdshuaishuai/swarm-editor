package api

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"

	"github.com/swarm-editor/swarm-editor/internal/log"
)

var ussLog = log.With("component", "UnixSocket")

// UnixSocketHandler is the function signature for handling commands over Unix socket.
type UnixSocketHandler func(method string, params json.RawMessage, clientID string) (any, error)

// UnixSocketRequest is the JSON-RPC 2.0 request format over Unix socket.
type UnixSocketRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// UnixSocketResponse is the JSON-RPC 2.0 response format over Unix socket.
type UnixSocketResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *WSError        `json:"error,omitempty"`
}

// UnixSocketServer listens on a Unix domain socket and dispatches JSON-RPC 2.0
// requests to the provided handler. Uses newline-delimited frames for simplicity.
type UnixSocketServer struct {
	sockPath string
	handler  UnixSocketHandler
	listener net.Listener
	mu       sync.Mutex
	ctx      context.Context
	cancel   context.CancelFunc
	wg       sync.WaitGroup
	nextID   atomic.Int64
}

// NewUnixSocketServer creates a new Unix socket server at the given path.
func NewUnixSocketServer(sockPath string, handler UnixSocketHandler) *UnixSocketServer {
	return &UnixSocketServer{
		sockPath: sockPath,
		handler:  handler,
	}
}

// Start begins listening on the Unix socket. It removes any stale socket file first.
func (s *UnixSocketServer) Start(ctx context.Context) error {
	s.mu.Lock()
	s.ctx, s.cancel = context.WithCancel(ctx)
	s.mu.Unlock()

	// Ensure parent directory exists
	if err := os.MkdirAll(filepath.Dir(s.sockPath), 0o755); err != nil {
		return fmt.Errorf("failed to create socket directory: %w", err)
	}

	// Remove stale socket file
	if err := os.Remove(s.sockPath); err != nil && !os.IsNotExist(err) {
		ussLog.Warn("Failed to remove stale socket", "path", s.sockPath, "error", err)
	}

	ln, err := net.Listen("unix", s.sockPath)
	if err != nil {
		return fmt.Errorf("failed to listen on unix socket %s: %w", s.sockPath, err)
	}

	// Set socket permissions to user-only (0600) for security
	if err := os.Chmod(s.sockPath, 0o600); err != nil {
		ln.Close()
		return fmt.Errorf("failed to set socket permissions: %w", err)
	}

	s.listener = ln
	ussLog.Info("Unix socket server started", "path", s.sockPath)

	s.wg.Add(1)
	go s.acceptLoop()

	return nil
}

// Stop gracefully shuts down the server: cancel context, close listener, wait, remove socket.
func (s *UnixSocketServer) Stop() {
	s.mu.Lock()
	if s.cancel != nil {
		s.cancel()
	}
	ln := s.listener
	s.mu.Unlock()

	if ln != nil {
		ln.Close()
	}

	s.wg.Wait()

	// Clean up socket file
	if err := os.Remove(s.sockPath); err != nil && !os.IsNotExist(err) {
		ussLog.Warn("Failed to remove socket file on stop", "path", s.sockPath, "error", err)
	}

	ussLog.Info("Unix socket server stopped", "path", s.sockPath)
}

// acceptLoop accepts incoming connections and dispatches them to handleConn.
func (s *UnixSocketServer) acceptLoop() {
	defer s.wg.Done()

	for {
		conn, err := s.listener.Accept()
		if err != nil {
			// Check if we're shutting down
			select {
			case <-s.ctx.Done():
				return
			default:
			}
			ussLog.Warn("Accept error", "error", err)
			continue
		}

		s.wg.Add(1)
		go func() {
			defer s.wg.Done()
			s.handleConn(conn)
		}()
	}
}

// handleConn reads newline-delimited JSON-RPC requests and writes responses.
func (s *UnixSocketServer) handleConn(conn net.Conn) {
	defer conn.Close()

	clientID := fmt.Sprintf("unix_%d", s.nextID.Add(1))
	reader := bufio.NewReader(conn)

	for {
		select {
		case <-s.ctx.Done():
			return
		default:
		}

		line, err := reader.ReadBytes('\n')
		if err != nil {
			select {
			case <-s.ctx.Done():
				return
			default:
			}
			// EOF or read error — connection closed
			ussLog.Debug("Client disconnected", "client_id", clientID)
			return
		}

		var req UnixSocketRequest
		if err := json.Unmarshal(line, &req); err != nil {
			s.writeResponse(conn, &UnixSocketResponse{
				JSONRPC: "2.0",
				Error: &WSError{
					Code:    CodeParseError,
					Message: "Parse error",
				},
			})
			continue
		}

		// Handle the command
		result, cmdErr := s.handler(req.Method, req.Params, clientID)
		if cmdErr != nil {
			errCode := CodeInternalError
			errMsg := "internal error"
			if apiErr, ok := cmdErr.(*APIError); ok {
				errCode = apiErr.Code
				errMsg = apiErr.Message
			} else {
				errMsg = cmdErr.Error()
			}
			s.writeResponse(conn, &UnixSocketResponse{
				JSONRPC: "2.0",
				ID:      req.ID,
				Error: &WSError{
					Code:    errCode,
					Message: errMsg,
				},
			})
			continue
		}

		// Marshal result
		resultData, err := json.Marshal(result)
		if err != nil {
			s.writeResponse(conn, &UnixSocketResponse{
				JSONRPC: "2.0",
				ID:      req.ID,
				Error: &WSError{
					Code:    CodeInternalError,
					Message: "Failed to marshal result",
				},
			})
			continue
		}

		s.writeResponse(conn, &UnixSocketResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result:  resultData,
		})
	}
}

// writeResponse marshals and writes a response with a newline delimiter.
func (s *UnixSocketServer) writeResponse(conn net.Conn, resp *UnixSocketResponse) {
	data, err := json.Marshal(resp)
	if err != nil {
		ussLog.Error("Failed to marshal response", "error", err)
		return
	}
	data = append(data, '\n')
	if _, err := conn.Write(data); err != nil {
		ussLog.Debug("Failed to write response", "error", err)
	}
}
