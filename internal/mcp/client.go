// Package mcp provides MCP (Model Context Protocol) integration
// MCP is a JSON-RPC 2.0 based protocol for extending AI capabilities
package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
)

// Client represents an MCP client connection
type Client struct {
	mu     sync.RWMutex
	name   string
	config *ClientConfig

	// Process management
	cmd       *exec.Cmd
	process   *os.Process
	stdin     io.WriteCloser
	stdout    io.ReadCloser
	stderr    io.ReadCloser
	cancelCtx context.CancelFunc

	// wg tracks goroutines spawned for message/stderr handling
	wg sync.WaitGroup

	// Connection state
	connected   atomic.Bool
	initialized atomic.Bool

	// MCP capabilities
	capabilities *ServerCapabilities
	tools        map[string]Tool
	resources    map[string]RemoteResource
	prompts      map[string]RemotePrompt

	// Request management
	nextID  int64
	pending map[int64]chan *acp.Message
}

// ClientConfig holds MCP client configuration
type ClientConfig struct {
	Name    string            `yaml:"name"`
	Command string            `yaml:"command"`
	Args    []string          `yaml:"args"`
	Env     map[string]string `yaml:"env"`
	Timeout int               `yaml:"timeout"` // Startup timeout in seconds
}

// ServerCapabilities represents the server's capabilities
type ServerCapabilities struct {
	Tools     *ToolCapabilities     `json:"tools,omitempty"`
	Resources *ResourceCapabilities `json:"resources,omitempty"`
	Prompts   *PromptCapabilities   `json:"prompts,omitempty"`
}

// ToolCapabilities defines tool-related capabilities
type ToolCapabilities struct {
	ListChanged bool `json:"listChanged,omitempty"`
}

// ResourceCapabilities defines resource-related capabilities
type ResourceCapabilities struct {
	Subscribe   bool `json:"subscribe,omitempty"`
	ListChanged bool `json:"listChanged,omitempty"`
}

// PromptCapabilities defines prompt-related capabilities
type PromptCapabilities struct {
	ListChanged bool `json:"listChanged,omitempty"`
}

// Tool represents an MCP tool definition
type Tool struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	InputSchema InputSchema `json:"inputSchema"`
}

// InputSchema defines the input schema for a tool
type InputSchema struct {
	Type       string              `json:"type"`
	Properties map[string]Property `json:"properties"`
	Required   []string            `json:"required"`
}

// Property defines a property in the input schema
type Property struct {
	Type        string `json:"type"`
	Description string `json:"description"`
}

// ToolResult represents the result of a tool execution
type ToolResult struct {
	Content []Content `json:"content"`
	IsError bool      `json:"isError"`
}

// Content represents content in a tool result
type Content struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	Data     string `json:"data,omitempty"`
	MimeType string `json:"mimeType,omitempty"`
}

// RemoteResource represents a remote MCP resource (from server)
type RemoteResource struct {
	URI         string `json:"uri"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	MimeType    string `json:"mimeType,omitempty"`
}

// RemotePrompt represents a remote MCP prompt (from server)
type RemotePrompt struct {
	Name        string           `json:"name"`
	Description string           `json:"description,omitempty"`
	Arguments   []PromptArgument `json:"arguments,omitempty"`
}

// PromptArgument defines a prompt argument
type PromptArgument struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Required    bool   `json:"required,omitempty"`
}

// InitializeParams represents the initialize request parameters
type InitializeParams struct {
	ProtocolVersion string             `json:"protocolVersion"`
	Capabilities    ClientCapabilities `json:"capabilities"`
	ClientInfo      ClientInfo         `json:"clientInfo"`
}

// ClientCapabilities represents the client's capabilities
type ClientCapabilities struct {
	Roots    *RootsCapability    `json:"roots,omitempty"`
	Sampling *SamplingCapability `json:"sampling,omitempty"`
}

// RootsCapability defines roots list capability
type RootsCapability struct {
	ListChanged bool `json:"listChanged,omitempty"`
}

// SamplingCapability defines LLM sampling capability
type SamplingCapability struct{}

// ClientInfo represents client information
type ClientInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// InitializeResult represents the initialize response
type InitializeResult struct {
	ProtocolVersion string             `json:"protocolVersion"`
	Capabilities    ServerCapabilities `json:"capabilities"`
	ServerInfo      ServerInfo         `json:"serverInfo"`
}

// ServerInfo represents server information
type ServerInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// NewClient creates a new MCP client
func NewClient(config *ClientConfig) *Client {
	if config == nil {
		config = &ClientConfig{
			Name: "default",
		}
	}
	if config.Timeout == 0 {
		config.Timeout = 30 // Default 30 seconds
	}

	return &Client{
		name:      config.Name,
		config:    config,
		tools:     make(map[string]Tool),
		resources: make(map[string]RemoteResource),
		prompts:   make(map[string]RemotePrompt),
		pending:   make(map[int64]chan *acp.Message),
	}
}

// Connect establishes connection to the MCP server
func (c *Client) Connect(ctx context.Context) error {
	c.mu.Lock()

	// Check if already connected
	if c.connected.Load() {
		c.mu.Unlock()
		return fmt.Errorf("already connected to MCP server")
	}

	// Security: Validate command before execution
	if err := validateCommand(c.config.Command); err != nil {
		c.mu.Unlock()
		return fmt.Errorf("command validation failed: %w", err)
	}

	// Create context for process management (derived from parent for cancellation)
	procCtx, cancel := context.WithCancel(ctx)
	c.cancelCtx = cancel

	// Prepare environment
	env := os.Environ()
	for k, v := range c.config.Env {
		env = append(env, fmt.Sprintf("%s=%s", k, v))
	}

	// Start the MCP server process
	c.cmd = exec.CommandContext(procCtx, c.config.Command, c.config.Args...)
	c.cmd.Env = env

	// Setup pipes
	stdin, err := c.cmd.StdinPipe()
	if err != nil {
		c.mu.Unlock()
		cancel()
		return fmt.Errorf("failed to create stdin pipe: %w", err)
	}
	c.stdin = stdin

	stdout, err := c.cmd.StdoutPipe()
	if err != nil {
		c.mu.Unlock()
		cancel()
		stdin.Close()
		return fmt.Errorf("failed to create stdout pipe: %w", err)
	}
	c.stdout = stdout

	stderr, err := c.cmd.StderrPipe()
	if err != nil {
		c.mu.Unlock()
		cancel()
		stdin.Close()
		stdout.Close()
		return fmt.Errorf("failed to create stderr pipe: %w", err)
	}
	c.stderr = stderr

	// Start the process
	if err := c.cmd.Start(); err != nil {
		// Clean up pipes on start failure to prevent resource leak
		stdin.Close()
		stdout.Close()
		stderr.Close()
		c.mu.Unlock()
		cancel()
		return fmt.Errorf("failed to start MCP server process: %w", err)
	}

	c.process = c.cmd.Process

	// Start message handler
	c.wg.Add(2)
	go c.handleMessages()
	go c.handleStderr()

	c.mu.Unlock()

	// Initialize the connection
	startupCtx, startupCancel := context.WithTimeout(ctx, time.Duration(c.config.Timeout)*time.Second)
	defer startupCancel()

	if err := c.initialize(startupCtx); err != nil {
		_ = c.Disconnect() // Ignore error on cleanup
		return fmt.Errorf("MCP initialization failed: %w", err)
	}

	// List available tools
	if err := c.fetchTools(startupCtx); err != nil {
		_ = c.Disconnect() // Ignore error on cleanup
		return fmt.Errorf("failed to fetch tools: %w", err)
	}

	c.initialized.Store(true)
	c.connected.Store(true)
	return nil
}

// initialize performs the MCP initialize handshake
func (c *Client) initialize(ctx context.Context) error {
	initParams := InitializeParams{
		ProtocolVersion: "2024-11-05",
		Capabilities: ClientCapabilities{
			Roots: &RootsCapability{
				ListChanged: true,
			},
		},
		ClientInfo: ClientInfo{
			Name:    "swarm-editor",
			Version: "1.0.0",
		},
	}

	result := &InitializeResult{}
	if err := c.call(ctx, "initialize", initParams, result); err != nil {
		return err
	}

	c.mu.Lock()
	c.capabilities = &result.Capabilities
	c.mu.Unlock()

	// Send initialized notification
	return c.notify(ctx, "notifications/initialized", nil)
}

// fetchTools retrieves the list of available tools from the server
func (c *Client) fetchTools(ctx context.Context) error {
	var response struct {
		Tools []Tool `json:"tools"`
	}

	if err := c.call(ctx, "tools/list", nil, &response); err != nil {
		return err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	c.tools = make(map[string]Tool)
	for _, tool := range response.Tools {
		c.tools[tool.Name] = tool
	}

	return nil
}

// Disconnect closes the connection and terminates the process
func (c *Client) Disconnect() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Stop receiving messages
	c.connected.Store(false)
	c.initialized.Store(false)

	// Cancel process context
	if c.cancelCtx != nil {
		c.cancelCtx()
	}

	// Close pipes
	if c.stdin != nil {
		c.stdin.Close()
		c.stdin = nil
	}
	if c.stdout != nil {
		c.stdout.Close()
		c.stdout = nil
	}
	if c.stderr != nil {
		c.stderr.Close()
		c.stderr = nil
	}

	// Wait for message/stderr handler goroutines to finish
	c.wg.Wait()

	// Wait for process to terminate
	if c.process != nil {
		// Try graceful shutdown first with timeout
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		done := make(chan error, 1)
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[MCP] process.Wait panic: %v", r)
				}
			}()
			_, err := c.process.Wait()
			done <- err
		}()

		select {
		case <-done:
			// Process terminated
		case <-shutdownCtx.Done():
			// Timeout, force kill
			if err := c.process.Kill(); err != nil {
				log.Printf("[MCP] Failed to kill process: %v", err)
			}
			<-done
		}
		c.process = nil
	}

	// Close pending response channels
	for _, ch := range c.pending {
		close(ch)
	}
	c.pending = make(map[int64]chan *acp.Message)

	return nil
}

// handleMessages reads and processes messages from stdout
func (c *Client) handleMessages() {
	defer c.wg.Done()
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[MCP] handleMessages panic: %v", r)
		}
	}()
	decoder := json.NewDecoder(c.stdout)

	for {
		var msg acp.Message
		if err := decoder.Decode(&msg); err != nil {
			if c.connected.Load() {
				log.Printf("[MCP] Read error while connected: %v", err)
			}
			break
		}

		c.handleMessage(&msg)
	}
}

// handleStderr reads stderr for debugging
func (c *Client) handleStderr() {
	defer c.wg.Done()
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[MCP] handleStderr panic: %v", r)
		}
	}()
	buf := make([]byte, 4096)
	for {
		n, err := c.stderr.Read(buf)
		if err != nil {
			// Log stderr read errors for debugging
			if c.connected.Load() {
				log.Printf("[MCP] stderr read error: %v", err)
			}
			break
		}
		// Log stderr content for debugging
		if n > 0 {
			log.Printf("[MCP] stderr: %s", strings.TrimSpace(string(buf[:n])))
		}
	}
}

// handleMessage processes a single message
func (c *Client) handleMessage(msg *acp.Message) {
	// If this is a response, route to pending channel
	if msg.ID != nil && msg.Method == "" {
		c.mu.Lock()
		ch, ok := c.pending[getIDValue(msg.ID)]
		c.mu.Unlock()

		if ok {
			// Recover from panic if channel was closed by call() timeout/cancel
			// between unlock and send (TOCTOU race fix)
			func() {
				defer func() {
					if r := recover(); r != nil {
						// Channel closed, drop response silently
					}
				}()
				select {
				case ch <- msg:
				default:
					// Channel full, skip
				}
			}()
		}
	}
	// Notifications (no ID) are handled here if needed
}

// call sends a request and waits for response
func (c *Client) call(ctx context.Context, method string, params any, result any) error {
	c.mu.Lock()
	id := c.nextID
	c.nextID++

	responseChan := make(chan *acp.Message, 1)
	c.pending[id] = responseChan
	c.mu.Unlock()

	defer func() {
		c.mu.Lock()
		if _, ok := c.pending[id]; ok {
			// Only close if Disconnect hasn't already cleaned up
			delete(c.pending, id)
			// HIGH: Close channel while holding lock to prevent race with Disconnect()
			// which also closes channels under lock
			close(responseChan)
		}
		// If not in pending, Disconnect already closed this channel
		c.mu.Unlock()
	}()

	// Create request
	reqID := &acp.RequestID{Number: id, IsNum: true}
	req, err := acp.NewRequest(reqID, method, params)
	if err != nil {
		return err
	}

	// Send request (single write to prevent partial messages)
	data, err := json.Marshal(req)
	if err != nil {
		return err
	}

	// Append newline delimiter and write atomically
	data = append(data, '\n')

	c.mu.Lock()
	if c.stdin == nil {
		c.mu.Unlock()
		return fmt.Errorf("connection closed")
	}
	if _, err := c.stdin.Write(data); err != nil {
		c.mu.Unlock()
		return fmt.Errorf("failed to send request: %w", err)
	}
	c.mu.Unlock()

	// Wait for response
	select {
	case msg := <-responseChan:
		if msg.Error != nil {
			return msg.Error
		}
		if result != nil {
			return json.Unmarshal(msg.Result, result)
		}
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// notify sends a notification (no response expected)
func (c *Client) notify(ctx context.Context, method string, params any) error {
	req, err := acp.NewRequest(nil, method, params)
	if err != nil {
		return err
	}

	data, err := json.Marshal(req)
	if err != nil {
		return err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	if c.stdin == nil {
		return fmt.Errorf("connection closed")
	}

	// Append newline and write atomically
	data = append(data, '\n')
	if _, err := c.stdin.Write(data); err != nil {
		return fmt.Errorf("failed to send notification: %w", err)
	}
	return nil
}

// getIDValue extracts the numeric value from a RequestID
func getIDValue(id *acp.RequestID) int64 {
	if id.IsNum {
		return id.Number
	}
	return 0
}

// ListTools returns available tools
func (c *Client) ListTools() []Tool {
	c.mu.RLock()
	defer c.mu.RUnlock()

	tools := make([]Tool, 0, len(c.tools))
	for _, tool := range c.tools {
		tools = append(tools, tool)
	}
	return tools
}

// GetTool returns a deep copy of a specific tool by name
func (c *Client) GetTool(name string) (Tool, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	tool, ok := c.tools[name]
	if !ok {
		return Tool{}, false
	}
	// Deep copy InputSchema to prevent caller from mutating internal state
	toolCopy := tool
	if len(tool.InputSchema.Properties) > 0 {
		toolCopy.InputSchema.Properties = make(map[string]Property, len(tool.InputSchema.Properties))
		for k, v := range tool.InputSchema.Properties {
			toolCopy.InputSchema.Properties[k] = v
		}
	}
	if len(tool.InputSchema.Required) > 0 {
		toolCopy.InputSchema.Required = make([]string, len(tool.InputSchema.Required))
		copy(toolCopy.InputSchema.Required, tool.InputSchema.Required)
	}
	return toolCopy, true
}

// CallTool executes a tool
func (c *Client) CallTool(ctx context.Context, name string, args map[string]any) (*ToolResult, error) {
	if !c.connected.Load() {
		return nil, ErrNotConnected
	}

	// Check if tool exists
	if _, ok := c.GetTool(name); !ok {
		return nil, ErrToolNotFound
	}

	// Prepare call parameters
	callParams := struct {
		Name      string         `json:"name"`
		Arguments map[string]any `json:"arguments,omitempty"`
	}{
		Name:      name,
		Arguments: args,
	}

	var result ToolResult
	if err := c.call(ctx, "tools/call", callParams, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// IsConnected returns the connection status
func (c *Client) IsConnected() bool {
	return c.connected.Load()
}

// IsInitialized returns whether the client has completed initialization
func (c *Client) IsInitialized() bool {
	return c.initialized.Load()
}

// GetCapabilities returns a deep copy of the server's capabilities
func (c *Client) GetCapabilities() *ServerCapabilities {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.capabilities == nil {
		return nil
	}
	// Deep copy nested pointer types to prevent caller from mutating internal state
	capsCopy := *c.capabilities
	if c.capabilities.Tools != nil {
		toolsCopy := *c.capabilities.Tools
		capsCopy.Tools = &toolsCopy
	}
	if c.capabilities.Resources != nil {
		resCopy := *c.capabilities.Resources
		capsCopy.Resources = &resCopy
	}
	if c.capabilities.Prompts != nil {
		promptsCopy := *c.capabilities.Prompts
		capsCopy.Prompts = &promptsCopy
	}
	return &capsCopy
}

// ListResources returns available resources
func (c *Client) ListResources(ctx context.Context) ([]RemoteResource, error) {
	var response struct {
		Resources []RemoteResource `json:"resources"`
	}

	if err := c.call(ctx, "resources/list", nil, &response); err != nil {
		return nil, err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	c.resources = make(map[string]RemoteResource)
	for _, res := range response.Resources {
		c.resources[res.URI] = res
	}

	return response.Resources, nil
}

// ReadResource reads a resource's content
func (c *Client) ReadResource(ctx context.Context, uri string) (*ToolResult, error) {
	if !c.connected.Load() {
		return nil, ErrNotConnected
	}

	params := struct {
		URI string `json:"uri"`
	}{
		URI: uri,
	}

	var result ToolResult
	if err := c.call(ctx, "resources/read", params, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// ListPrompts returns available prompts
func (c *Client) ListPrompts(ctx context.Context) ([]RemotePrompt, error) {
	var response struct {
		Prompts []RemotePrompt `json:"prompts"`
	}

	if err := c.call(ctx, "prompts/list", nil, &response); err != nil {
		return nil, err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	c.prompts = make(map[string]RemotePrompt)
	for _, prompt := range response.Prompts {
		c.prompts[prompt.Name] = prompt
	}

	return response.Prompts, nil
}

// GetPrompt retrieves a prompt's content
func (c *Client) GetPrompt(ctx context.Context, name string, args map[string]string) (*ToolResult, error) {
	if !c.connected.Load() {
		return nil, ErrNotConnected
	}

	params := struct {
		Name      string            `json:"name"`
		Arguments map[string]string `json:"arguments,omitempty"`
	}{
		Name:      name,
		Arguments: args,
	}

	var result ToolResult
	if err := c.call(ctx, "prompts/get", params, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// Ping sends a ping to check server responsiveness
func (c *Client) Ping(ctx context.Context) error {
	return c.call(ctx, "ping", nil, nil)
}

// Errors
var (
	ErrNotConnected     = &MCPError{Code: -1, Message: "not connected to MCP server"}
	ErrToolNotFound     = &MCPError{Code: -2, Message: "tool not found"}
	ErrInvalidArgs      = &MCPError{Code: -3, Message: "invalid arguments"}
	ErrCommandForbidden = &MCPError{Code: -4, Message: "command not in allowed list"}
)

// MCPError represents an MCP error
type MCPError struct {
	Code    int
	Message string
}

func (e *MCPError) Error() string {
	return e.Message
}

// DefaultAllowedMCPCommands is the default whitelist of allowed MCP server commands
// These are common MCP server implementations that are considered safe
var DefaultAllowedMCPCommands = map[string]bool{
	// Node.js based MCP servers
	"npx":  true,
	"npm":  true,
	"node": true,
	// Python based MCP servers
	"python":  true,
	"python3": true,
	"uv":      true,
	"uvx":     true,
	"pip":     true,
	// Go binaries (local builds)
	"mcp-server": true,
}

// AllowedMCPCommands can be set to customize the whitelist
// If nil, DefaultAllowedMCPCommands is used
var AllowedMCPCommands map[string]bool = nil

// validateCommand checks if the command is allowed to be executed
func validateCommand(command string) error {
	if command == "" {
		return fmt.Errorf("command cannot be empty")
	}

	// Get the base command name (without path)
	baseCmd := command
	for i := len(command) - 1; i >= 0; i-- {
		if command[i] == '/' || command[i] == '\\' {
			baseCmd = command[i+1:]
			break
		}
	}

	// Use custom whitelist if set, otherwise use default
	allowed := AllowedMCPCommands
	if allowed == nil {
		allowed = DefaultAllowedMCPCommands
	}

	// Check if command is in whitelist
	if !allowed[baseCmd] {
		// Log for security audit trail
		log.Printf("[MCP] SECURITY: Blocked command execution: %s (base: %s)", command, baseCmd)
		return fmt.Errorf("%w: %s", ErrCommandForbidden, baseCmd)
	}

	return nil
}
