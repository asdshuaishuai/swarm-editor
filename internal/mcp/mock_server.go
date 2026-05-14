package mcp

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
	"github.com/swarm-editor/swarm-editor/internal/log"
)

var mockMCPLog = log.With("component", "MockMCP")

// MockMCPServer represents a fake MCP server for testing
type MockMCPServer struct {
	listener net.Listener
	addr     string

	// Server state
	tools     []Tool
	resources []RemoteResource
	prompts   []RemotePrompt

	mu     sync.Mutex
	closed bool
}

// MockServerConfig configures the mock server
type MockServerConfig struct {
	Tools     []Tool
	Resources []RemoteResource
	Prompts   []RemotePrompt
}

// NewMockMCPServer creates a new mock MCP server using a helper script
func NewMockMCPServer(config *MockServerConfig) (*MockMCPServer, error) {
	if config == nil {
		config = &MockServerConfig{
			Tools: []Tool{
				{
					Name:        "test_tool",
					Description: "A test tool",
					InputSchema: InputSchema{
						Type: "object",
						Properties: map[string]Property{
							"input": {
								Type:        "string",
								Description: "Input parameter",
							},
						},
						Required: []string{"input"},
					},
				},
			},
		}
	}

	// Create a listener for the mock server
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("failed to create listener: %w", err)
	}

	server := &MockMCPServer{
		listener:  listener,
		addr:      listener.Addr().String(),
		tools:     config.Tools,
		resources: config.Resources,
		prompts:   config.Prompts,
	}

	// Start the server in a goroutine
	go server.run()

	return server, nil
}

// run processes incoming connections
func (s *MockMCPServer) run() {
	for {
		conn, err := s.listener.Accept()
		if err != nil {
			s.mu.Lock()
			if s.closed {
				s.mu.Unlock()
				return
			}
			s.mu.Unlock()
			continue
		}

		go s.handleConnection(conn)
	}
}

// handleConnection handles a single connection
func (s *MockMCPServer) handleConnection(conn net.Conn) {
	defer conn.Close()

	scanner := bufio.NewScanner(conn)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var msg map[string]any
		if err := json.Unmarshal(line, &msg); err != nil {
			continue
		}

		response := s.handleMessage(msg)

		if response != nil {
			responseData, _ := json.Marshal(response)
			responseData = append(responseData, '\n')
			_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if _, err := conn.Write(responseData); err != nil {
				mockMCPLog.Warn("Write error", "error", err)
			}
		}
	}
}

// handleMessage processes a single JSON-RPC message
func (s *MockMCPServer) handleMessage(msg map[string]any) map[string]any {
	method, _ := msg["method"].(string)

	response := map[string]any{
		"jsonrpc": "2.0",
	}

	if id, ok := msg["id"]; ok {
		response["id"] = id
	}

	switch method {
	case "initialize":
		response["result"] = map[string]any{
			"protocolVersion": "2024-11-05",
			"capabilities": map[string]any{
				"tools": map[string]any{
					"listChanged": false,
				},
			},
			"serverInfo": map[string]any{
				"name":    "mock-mcp-server",
				"version": "1.0.0",
			},
		}

	case "tools/list":
		response["result"] = map[string]any{
			"tools": s.tools,
		}

	case "tools/call":
		// Return a mock result
		response["result"] = map[string]any{
			"content": []map[string]any{
				{
					"type": "text",
					"text": "Mock tool result",
				},
			},
			"isError": false,
		}

	case "resources/list":
		response["result"] = map[string]any{
			"resources": s.resources,
		}

	case "resources/read":
		response["result"] = map[string]any{
			"content": []map[string]any{
				{
					"type": "text",
					"text": "Mock resource content",
				},
			},
		}

	case "prompts/list":
		response["result"] = map[string]any{
			"prompts": s.prompts,
		}

	case "prompts/get":
		response["result"] = map[string]any{
			"content": []map[string]any{
				{
					"type": "text",
					"text": "Mock prompt content",
				},
			},
		}

	case "ping":
		response["result"] = map[string]any{}

	default:
		// For notifications (no id), don't respond
		if _, hasID := msg["id"]; !hasID {
			return nil
		}
	}

	return response
}

// GetCommand returns the exec.Cmd config to connect to this server
func (s *MockMCPServer) GetCommand() string {
	// Use nc (netcat) to connect to the mock server
	return fmt.Sprintf("nc %s", s.addr)
}

// GetAddr returns the server address
func (s *MockMCPServer) GetAddr() string {
	return s.addr
}

// Close stops the mock server
func (s *MockMCPServer) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return nil
	}

	s.closed = true
	return s.listener.Close()
}

// WaitForReady waits until the server is ready to accept connections
func (s *MockMCPServer) WaitForReady() error {
	// Try to connect to verify the server is ready
	for i := 0; i < 10; i++ {
		conn, err := net.Dial("tcp", s.addr)
		if err == nil {
			conn.Close()
			return nil
		}
		time.Sleep(50 * time.Millisecond)
	}
	return fmt.Errorf("server not ready")
}

// ==================== Alternative: Script-based Mock Server ====================

// CreateMockServerScript creates a simple bash script that acts as an MCP server
func CreateMockServerScript(path string) error {
	script := `#!/bin/bash
# Mock MCP Server for testing

# Handle JSON-RPC requests line by line
while IFS= read -r line; do
    # Parse the method using grep/sed for simplicity
    method=$(echo "$line" | grep -o '"method":"[^"]*"' | cut -d'"' -f4)

    # Extract ID if present
    id=$(echo "$line" | grep -o '"id":[0-9]*' | grep -o '[0-9]*')

    case "$method" in
        "initialize")
            cat <<EOF
{"jsonrpc":"2.0","id":$id,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"mock-mcp-server","version":"1.0.0"}}}
EOF
            ;;
        "tools/list")
            cat <<EOF
{"jsonrpc":"2.0","id":$id,"result":{"tools":[{"name":"test_tool","description":"A test tool","inputSchema":{"type":"object","properties":{"input":{"type":"string","description":"Input parameter"}},"required":["input"]}}]}}
EOF
            ;;
        "tools/call")
            cat <<EOF
{"jsonrpc":"2.0","id":$id,"result":{"content":[{"type":"text","text":"Mock tool result"}],"isError":false}}
EOF
            ;;
        "ping")
            cat <<EOF
{"jsonrpc":"2.0","id":$id,"result":{}}
EOF
            ;;
        "notifications/initialized")
            # Notification, no response
            ;;
        *)
            # Unknown method, return empty result
            if [ -n "$id" ]; then
                cat <<EOF
{"jsonrpc":"2.0","id":$id,"result":{}}
EOF
            fi
            ;;
    esac
done
`
	return os.WriteFile(path, []byte(script), 0755)
}

// MockServerViaScript returns a ClientConfig that uses a script-based mock server
func MockServerViaScript(scriptPath string) (*ClientConfig, error) {
	if err := CreateMockServerScript(scriptPath); err != nil {
		return nil, err
	}

	return &ClientConfig{
		Name:    "mock-test-client",
		Command: scriptPath,
		Timeout: 5,
	}, nil
}

// ==================== In-Process Mock (no external process) ====================

// InProcessMock creates an in-memory mock that uses pipes for testing
type InProcessMock struct {
	stdin  io.ReadCloser
	stdout io.WriteCloser
	server *mockServerCore
	cancel chan struct{}
}

// mockServerCore handles the MCP protocol
type mockServerCore struct {
	tools []Tool
}

func (m *InProcessMock) run() {
	decoder := json.NewDecoder(m.stdin)
	encoder := json.NewEncoder(m.stdout)

	for {
		select {
		case <-m.cancel:
			return
		default:
		}

		var msg map[string]any
		if err := decoder.Decode(&msg); err != nil {
			continue
		}

		response := m.server.handleMessage(msg)
		if response != nil {
			if err := encoder.Encode(response); err != nil {
				mockMCPLog.Error("Encode error", "error", err)
			}
		}
	}
}

func (s *mockServerCore) handleMessage(msg map[string]any) map[string]any {
	method, _ := msg["method"].(string)

	response := map[string]any{
		"jsonrpc": "2.0",
	}

	if id, ok := msg["id"]; ok {
		response["id"] = id
	}

	switch method {
	case "initialize":
		response["result"] = map[string]any{
			"protocolVersion": "2024-11-05",
			"capabilities": map[string]any{
				"tools": map[string]any{
					"listChanged": false,
				},
			},
			"serverInfo": map[string]any{
				"name":    "in-process-mock-server",
				"version": "1.0.0",
			},
		}

	case "tools/list":
		response["result"] = map[string]any{
			"tools": s.tools,
		}

	case "tools/call":
		response["result"] = map[string]any{
			"content": []map[string]any{
				{
					"type": "text",
					"text": "Mock tool result",
				},
			},
			"isError": false,
		}

	case "ping":
		response["result"] = map[string]any{}
	}

	return response
}

func (m *InProcessMock) Close() {
	close(m.cancel)
	m.stdin.Close()
	m.stdout.Close()
}

// NewTestClientPair creates a client and in-process mock server connected by pipes
// This is the preferred way to test MCP client without external processes
//
// io.Pipe() returns (PipeReader, PipeWriter) where:
// - PipeReader implements io.ReadCloser (has Read and Close)
// - PipeWriter implements io.WriteCloser (has Write and Close)
//
// For client->server communication: client writes, server reads
//   - Client needs WriteCloser -> use PipeWriter
//   - Server needs ReadCloser -> use PipeReader
func NewTestClientPair(tools []Tool) (*Client, *InProcessMock, error) {
	if tools == nil {
		tools = []Tool{
			{
				Name:        "test_tool",
				Description: "A test tool",
				InputSchema: InputSchema{
					Type: "object",
					Properties: map[string]Property{
						"input": {
							Type:        "string",
							Description: "Input parameter",
						},
					},
					Required: []string{"input"},
				},
			},
		}
	}

	// Create pipes for bidirectional communication
	// Client writes to clientToServerWriter, server reads from clientToServerReader
	clientToServerReader, clientToServerWriter := io.Pipe()
	// Server writes to serverToClientWriter, client reads from serverToClientReader
	serverToClientReader, serverToClientWriter := io.Pipe()

	mock := &InProcessMock{
		stdin:  clientToServerReader, // Server reads from client
		stdout: serverToClientWriter, // Server writes to client
		server: &mockServerCore{
			tools: tools,
		},
		cancel: make(chan struct{}),
	}

	go mock.run()

	// Create client with pipe connections
	client := &Client{
		name:    "test-client",
		config:  &ClientConfig{Name: "test", Timeout: 5},
		tools:   make(map[string]Tool),
		pending: make(map[int64]chan *acp.Message),
		stdin:   clientToServerWriter, // Client writes to server
		stdout:  serverToClientReader, // Client reads from server
		stderr:  &nullReadCloser{},    // Discard stderr
	}

	// Initialize the client directly
	if err := mockInitializeClient(client); err != nil {
		mock.Close()
		return nil, nil, err
	}

	return client, mock, nil
}

// mockInitializeClient simulates the initialization handshake
func mockInitializeClient(client *Client) error {
	client.connected.Store(true)
	client.initialized.Store(true)

	// Add tools to client
	for _, tool := range mockDefaultTools {
		client.tools[tool.Name] = tool
	}

	return nil
}

var mockDefaultTools = []Tool{
	{
		Name:        "test_tool",
		Description: "A test tool",
		InputSchema: InputSchema{
			Type: "object",
			Properties: map[string]Property{
				"input": {
					Type:        "string",
					Description: "Input parameter",
				},
			},
			Required: []string{"input"},
		},
	},
}

// nullReadCloser is a ReadCloser that always returns EOF
type nullReadCloser struct{}

func (n *nullReadCloser) Read(p []byte) (int, error) {
	return 0, io.EOF
}

func (n *nullReadCloser) Close() error {
	return nil
}
