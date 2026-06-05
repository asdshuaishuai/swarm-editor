package api

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// mockHandler implements HandleCommand for testing
type mockHandler struct {
	fn func(method string, params json.RawMessage, clientID string) (any, error)
}

func (m *mockHandler) HandleCommand(method string, params json.RawMessage, clientID string) (any, error) {
	if m.fn != nil {
		return m.fn(method, params, clientID)
	}
	return map[string]string{"status": "ok"}, nil
}

func TestUnixSocketServer_StartStop(t *testing.T) {
	tmpDir := t.TempDir()
	sockPath := filepath.Join(tmpDir, "test.sock")

	handler := &mockHandler{}
	server := NewUnixSocketServer(sockPath, handler.HandleCommand)

	// Start the server
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := server.Start(ctx); err != nil {
		t.Fatalf("Start() failed: %v", err)
	}

	// Verify socket file exists
	if _, err := os.Stat(sockPath); os.IsNotExist(err) {
		t.Fatal("Socket file not created")
	}

	// Verify we can connect
	conn, err := net.DialTimeout("unix", sockPath, 2*time.Second)
	if err != nil {
		t.Fatalf("Failed to connect to socket: %v", err)
	}
	conn.Close()

	// Stop the server
	server.Stop()

	// Verify socket file is removed
	if _, err := os.Stat(sockPath); !os.IsNotExist(err) {
		t.Fatal("Socket file not removed after stop")
	}
}

func TestUnixSocketServer_HandleCommand(t *testing.T) {
	tmpDir := t.TempDir()
	sockPath := filepath.Join(tmpDir, "test.sock")

	handler := &mockHandler{
		fn: func(method string, params json.RawMessage, clientID string) (any, error) {
			switch method {
			case "ping":
				return map[string]string{"pong": "true"}, nil
			case "echo":
				var msg string
				if err := json.Unmarshal(params, &msg); err != nil {
					return nil, fmt.Errorf("invalid params: %w", err)
				}
				return map[string]string{"echo": msg}, nil
			default:
				return nil, fmt.Errorf("unknown method: %s", method)
			}
		},
	}

	server := NewUnixSocketServer(sockPath, handler.HandleCommand)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := server.Start(ctx); err != nil {
		t.Fatalf("Start() failed: %v", err)
	}
	defer server.Stop()

	// Connect and send a ping request
	conn, err := net.DialTimeout("unix", sockPath, 2*time.Second)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()

	// Send JSON-RPC request
	req := map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "ping",
		"params":  map[string]string{},
	}
	reqBytes, _ := json.Marshal(req)
	reqBytes = append(reqBytes, '\n')
	if _, err := conn.Write(reqBytes); err != nil {
		t.Fatalf("Failed to write request: %v", err)
	}

	// Read response
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	reader := bufio.NewReader(conn)
	line, err := reader.ReadBytes('\n')
	if err != nil {
		t.Fatalf("Failed to read response: %v", err)
	}

	var resp struct {
		JSONRPC string          `json:"jsonrpc"`
		ID      json.RawMessage `json:"id"`
		Result  json.RawMessage `json:"result"`
		Error   *WSError        `json:"error,omitempty"`
	}
	if err := json.Unmarshal(line, &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if resp.JSONRPC != "2.0" {
		t.Errorf("Expected jsonrpc=2.0, got %s", resp.JSONRPC)
	}

	if resp.Error != nil {
		t.Fatalf("Unexpected error in response: %v", resp.Error)
	}

	var result map[string]string
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		t.Fatalf("Failed to parse result: %v", err)
	}
	if result["pong"] != "true" {
		t.Errorf("Expected pong=true, got %s", result["pong"])
	}
}

func TestUnixSocketServer_EchoCommand(t *testing.T) {
	tmpDir := t.TempDir()
	sockPath := filepath.Join(tmpDir, "test.sock")

	handler := &mockHandler{
		fn: func(method string, params json.RawMessage, clientID string) (any, error) {
			if method == "echo" {
				var msg string
				if err := json.Unmarshal(params, &msg); err != nil {
					return nil, fmt.Errorf("invalid params: %w", err)
				}
				return map[string]string{"echo": msg}, nil
			}
			return nil, fmt.Errorf("unknown method: %s", method)
		},
	}

	server := NewUnixSocketServer(sockPath, handler.HandleCommand)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := server.Start(ctx); err != nil {
		t.Fatalf("Start() failed: %v", err)
	}
	defer server.Stop()

	conn, err := net.DialTimeout("unix", sockPath, 2*time.Second)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()

	// Send echo request with a string parameter
	msgContent := "hello world"
	req := map[string]any{
		"jsonrpc": "2.0",
		"id":      42,
		"method":  "echo",
		"params":  msgContent,
	}
	reqBytes, _ := json.Marshal(req)
	reqBytes = append(reqBytes, '\n')
	if _, err := conn.Write(reqBytes); err != nil {
		t.Fatalf("Failed to write request: %v", err)
	}

	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	reader := bufio.NewReader(conn)
	line, err := reader.ReadBytes('\n')
	if err != nil {
		t.Fatalf("Failed to read response: %v", err)
	}

	var resp struct {
		JSONRPC string          `json:"jsonrpc"`
		ID      json.RawMessage `json:"id"`
		Result  json.RawMessage `json:"result"`
		Error   *WSError        `json:"error,omitempty"`
	}
	if err := json.Unmarshal(line, &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if resp.Error != nil {
		t.Fatalf("Unexpected error: %v", resp.Error)
	}

	var result map[string]string
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		t.Fatalf("Failed to parse result: %v", err)
	}
	if result["echo"] != "hello world" {
		t.Errorf("Expected echo=hello world, got %s", result["echo"])
	}
}

func TestUnixSocketServer_ErrorResponse(t *testing.T) {
	tmpDir := t.TempDir()
	sockPath := filepath.Join(tmpDir, "test.sock")

	handler := &mockHandler{
		fn: func(method string, params json.RawMessage, clientID string) (any, error) {
			return nil, NewAPIError(CodeMethodNotFound, "unknown method: "+method)
		},
	}

	server := NewUnixSocketServer(sockPath, handler.HandleCommand)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := server.Start(ctx); err != nil {
		t.Fatalf("Start() failed: %v", err)
	}
	defer server.Stop()

	conn, err := net.DialTimeout("unix", sockPath, 2*time.Second)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()

	req := map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "nonexistent",
		"params":  map[string]string{},
	}
	reqBytes, _ := json.Marshal(req)
	reqBytes = append(reqBytes, '\n')
	if _, err := conn.Write(reqBytes); err != nil {
		t.Fatalf("Failed to write request: %v", err)
	}

	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	reader := bufio.NewReader(conn)
	line, err := reader.ReadBytes('\n')
	if err != nil {
		t.Fatalf("Failed to read response: %v", err)
	}

	var resp struct {
		JSONRPC string          `json:"jsonrpc"`
		ID      json.RawMessage `json:"id"`
		Error   *WSError        `json:"error,omitempty"`
	}
	if err := json.Unmarshal(line, &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if resp.Error == nil {
		t.Fatal("Expected error response, got none")
	}
	if resp.Error.Code != CodeMethodNotFound {
		t.Errorf("Expected error code %d, got %d", CodeMethodNotFound, resp.Error.Code)
	}
}

func TestUnixSocketServer_MultipleClients(t *testing.T) {
	tmpDir := t.TempDir()
	sockPath := filepath.Join(tmpDir, "test.sock")

	handler := &mockHandler{
		fn: func(method string, params json.RawMessage, clientID string) (any, error) {
			return map[string]string{"client": clientID}, nil
		},
	}

	server := NewUnixSocketServer(sockPath, handler.HandleCommand)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := server.Start(ctx); err != nil {
		t.Fatalf("Start() failed: %v", err)
	}
	defer server.Stop()

	// Connect two clients
	conn1, err := net.DialTimeout("unix", sockPath, 2*time.Second)
	if err != nil {
		t.Fatalf("Failed to connect client 1: %v", err)
	}
	defer conn1.Close()

	conn2, err := net.DialTimeout("unix", sockPath, 2*time.Second)
	if err != nil {
		t.Fatalf("Failed to connect client 2: %v", err)
	}
	defer conn2.Close()

	// Both send requests
	for i, conn := range []net.Conn{conn1, conn2} {
		req := map[string]any{
			"jsonrpc": "2.0",
			"id":      i + 1,
			"method":  "ping",
			"params":  map[string]string{},
		}
		reqBytes, _ := json.Marshal(req)
		reqBytes = append(reqBytes, '\n')
		if _, err := conn.Write(reqBytes); err != nil {
			t.Fatalf("Failed to write request from client %d: %v", i+1, err)
		}
	}

	// Both read responses
	for i, conn := range []net.Conn{conn1, conn2} {
		conn.SetReadDeadline(time.Now().Add(5 * time.Second))
		reader := bufio.NewReader(conn)
		_, err := reader.ReadBytes('\n')
		if err != nil {
			t.Fatalf("Failed to read response from client %d: %v", i+1, err)
		}
	}
}
