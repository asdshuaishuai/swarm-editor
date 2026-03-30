// Package rpc provides RPC client implementation for swarm communication
package rpc

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"sync"
	"time"
)

// Default maximum message size (10MB)
const defaultMaxMsgSize = 10 << 20

// Client represents an RPC client
type Client struct {
	mu           sync.RWMutex
	conn         net.Conn
	addr         string
	timeout      time.Duration
	connected    bool
	codec        Codec
	pending      map[uint64]*pendingCall
	nextID       uint64
	onConnect    func()
	onDisconnect func(error)
	maxMsgSize   uint32 // Maximum message size to prevent OOM (default 10MB)
	wg           sync.WaitGroup
}

// Codec defines the interface for encoding/decoding messages
type Codec interface {
	Encode(msg any) ([]byte, error)
	Decode(data []byte, msg any) error
}

// pendingCall represents a pending RPC call
type pendingCall struct {
	done chan struct{}
	resp any
	err  error
}

// Request represents an RPC request
type Request struct {
	ID      uint64          `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
	Timeout time.Duration   `json:"timeout,omitempty"`
}

// Response represents an RPC response
type Response struct {
	ID     uint64          `json:"id"`
	Result json.RawMessage `json:"result,omitempty"`
	Error  *RPCError       `json:"error,omitempty"`
}

// RPCError represents an RPC error
type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    []byte `json:"data,omitempty"`
}

// Error implements the error interface
func (e *RPCError) Error() string {
	return fmt.Sprintf("rpc error %d: %s", e.Code, e.Message)
}

// JSONCodec is the default JSON codec
type JSONCodec struct{}

// Encode encodes a message to JSON
func (c *JSONCodec) Encode(msg any) ([]byte, error) {
	return json.Marshal(msg)
}

// Decode decodes JSON to a message
func (c *JSONCodec) Decode(data []byte, msg any) error {
	return json.Unmarshal(data, msg)
}

// NewClient creates a new RPC client
func NewClient(addr string, opts ...ClientOption) *Client {
	client := &Client{
		addr:       addr,
		timeout:    30 * time.Second,
		codec:      &JSONCodec{},
		pending:    make(map[uint64]*pendingCall),
		maxMsgSize: defaultMaxMsgSize,
	}

	for _, opt := range opts {
		opt(client)
	}

	return client
}

// ClientOption is a client configuration option
type ClientOption func(*Client)

// WithTimeout sets the client timeout
func WithTimeout(timeout time.Duration) ClientOption {
	return func(c *Client) {
		c.timeout = timeout
	}
}

// WithCodec sets the client codec
func WithCodec(codec Codec) ClientOption {
	return func(c *Client) {
		c.codec = codec
	}
}

// WithOnConnect sets the connect callback
func WithOnConnect(fn func()) ClientOption {
	return func(c *Client) {
		c.onConnect = fn
	}
}

// WithOnDisconnect sets the disconnect callback
func WithOnDisconnect(fn func(error)) ClientOption {
	return func(c *Client) {
		c.onDisconnect = fn
	}
}

// WithMaxMsgSize sets the maximum message size (to prevent OOM attacks)
func WithMaxMsgSize(size uint32) ClientOption {
	return func(c *Client) {
		c.maxMsgSize = size
	}
}

// Connect connects to the RPC server
func (c *Client) Connect(ctx context.Context) error {
	c.mu.Lock()

	if c.connected {
		c.mu.Unlock()
		return fmt.Errorf("already connected")
	}

	dialer := &net.Dialer{
		Timeout: c.timeout,
	}

	conn, err := dialer.DialContext(ctx, "tcp", c.addr)
	if err != nil {
		c.mu.Unlock()
		return fmt.Errorf("dial failed: %w", err)
	}

	c.conn = conn
	c.connected = true

	// Snapshot callback before unlocking
	onConnect := c.onConnect

	c.mu.Unlock()

	// Start read loop
	c.wg.Add(1)
	go func() {
		defer c.wg.Done()
		c.readLoop()
	}()

	// Invoke callback outside lock
	if onConnect != nil {
		onConnect()
	}

	return nil
}

// Close closes the client connection
func (c *Client) Close() error {
	c.mu.Lock()

	if !c.connected {
		c.mu.Unlock()
		return nil
	}

	c.connected = false

	// Cancel all pending calls
	for _, call := range c.pending {
		call.err = fmt.Errorf("connection closed")
		close(call.done)
	}
	c.pending = make(map[uint64]*pendingCall)

	var connErr error
	if c.conn != nil {
		connErr = c.conn.Close()
	}
	c.mu.Unlock()

	// Wait for readLoop to exit after closing conn
	c.wg.Wait()

	return connErr
}

// Call makes an RPC call
func (c *Client) Call(ctx context.Context, method string, params, result any) error {
	c.mu.Lock()
	if !c.connected {
		c.mu.Unlock()
		return fmt.Errorf("not connected")
	}

	id := c.nextID
	c.nextID++
	call := &pendingCall{
		done: make(chan struct{}),
	}
	c.pending[id] = call
	c.mu.Unlock()

	// Create request
	paramsData, err := safeMarshal(params)
	if err != nil {
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
		return err
	}
	req := &Request{
		ID:     id,
		Method: method,
		Params: paramsData,
	}

	// Send request
	if err := c.send(req); err != nil {
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
		return err
	}

	// Wait for response
	select {
	case <-call.done:
		if call.err != nil {
			return call.err
		}
		if result != nil && call.resp != nil {
			// Copy response to result
			respBytes, err := json.Marshal(call.resp)
			if err != nil {
				return err
			}
			return json.Unmarshal(respBytes, result)
		}
		return nil
	case <-ctx.Done():
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
		return ctx.Err()
	}
}

// Notify sends a one-way notification (no response expected)
func (c *Client) Notify(ctx context.Context, method string, params any) error {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.connected {
		return fmt.Errorf("not connected")
	}

	paramsData, err := safeMarshal(params)
	if err != nil {
		return err
	}
	req := &Request{
		ID:     0, // Notifications use ID 0
		Method: method,
		Params: paramsData,
	}

	return c.send(req)
}

// send sends a message
func (c *Client) send(req *Request) error {
	data, err := c.codec.Encode(req)
	if err != nil {
		return fmt.Errorf("encode failed: %w", err)
	}

	// Add length prefix
	len := uint32(len(data))
	header := make([]byte, 4)
	header[0] = byte(len >> 24)
	header[1] = byte(len >> 16)
	header[2] = byte(len >> 8)
	header[3] = byte(len)

	// MEDIUM: Hold lock during write to prevent TOCTOU race with Close()
	// (conn could become nil between RUnlock and Write)
	c.mu.RLock()
	defer c.mu.RUnlock()

	if c.conn == nil {
		return fmt.Errorf("not connected")
	}

	_, err = c.conn.Write(append(header, data...))
	return err
}

// readLoop reads responses from the connection
func (c *Client) readLoop() {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[RPC] readLoop panic: %v", r)
		}
	}()
	header := make([]byte, 4)

	for {
		// Snapshot conn under lock to prevent race with Close()
		c.mu.RLock()
		conn := c.conn
		c.mu.RUnlock()

		if conn == nil {
			return
		}

		// Read length header
		_, err := io.ReadFull(conn, header)
		if err != nil {
			c.handleDisconnect(err)
			return
		}

		len := uint32(header[0])<<24 | uint32(header[1])<<16 | uint32(header[2])<<8 | uint32(header[3])

		// Security: Check message size to prevent OOM attacks
		c.mu.RLock()
		maxSize := c.maxMsgSize
		c.mu.RUnlock()
		if len > maxSize {
			c.handleDisconnect(fmt.Errorf("message size %d exceeds maximum %d", len, maxSize))
			return
		}

		data := make([]byte, len)

		// Read message body
		_, err = io.ReadFull(conn, data)
		if err != nil {
			c.handleDisconnect(err)
			return
		}

		// Decode response
		var resp Response
		if err := c.codec.Decode(data, &resp); err != nil {
			continue
		}

		// Handle response
		c.mu.RLock()
		call, ok := c.pending[resp.ID]
		c.mu.RUnlock()

		if ok {
			// Atomically delete from pending and check ownership to prevent
			// double-close race with Close()/handleDisconnect():
			// RLock→RLock gap allows Close to close(call.done) first.
			c.mu.Lock()
			if current, exists := c.pending[resp.ID]; exists && current == call {
				delete(c.pending, resp.ID)
				c.mu.Unlock()

				call.resp = resp.Result
				if resp.Error != nil {
					call.err = resp.Error
				}
				close(call.done)
			} else {
				// Close already handled this call; skip
				c.mu.Unlock()
			}
		}
	}
}

// handleDisconnect handles disconnection
func (c *Client) handleDisconnect(err error) {
	c.mu.Lock()

	if !c.connected {
		c.mu.Unlock()
		return
	}
	c.connected = false

	// Cancel pending calls
	for _, call := range c.pending {
		call.err = err
		close(call.done)
	}
	c.pending = make(map[uint64]*pendingCall)

	// Snapshot callback before unlocking
	onDisconnect := c.onDisconnect

	c.mu.Unlock()

	// Invoke callback outside lock
	if onDisconnect != nil {
		onDisconnect(err)
	}
}

// IsConnected returns whether the client is connected
func (c *Client) IsConnected() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.connected
}

// safeMarshal marshals params, returning error on failure
func safeMarshal(v any) (json.RawMessage, error) {
	if v == nil {
		return nil, nil
	}
	data, err := json.Marshal(v)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal params: %w", err)
	}
	return json.RawMessage(data), nil
}

// mustMarshal marshals params, panicking on failure (for tests and simple cases)
func mustMarshal(v any) json.RawMessage {
	data, err := safeMarshal(v)
	if err != nil {
		panic(err)
	}
	return data
}
