// Package rpc provides RPC client implementation for swarm communication
package rpc

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"sync"
	"time"
)

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
}

// Codec defines the interface for encoding/decoding messages
type Codec interface {
	Encode(msg interface{}) ([]byte, error)
	Decode(data []byte, msg interface{}) error
}

// pendingCall represents a pending RPC call
type pendingCall struct {
	done chan struct{}
	resp interface{}
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
func (c *JSONCodec) Encode(msg interface{}) ([]byte, error) {
	return json.Marshal(msg)
}

// Decode decodes JSON to a message
func (c *JSONCodec) Decode(data []byte, msg interface{}) error {
	return json.Unmarshal(data, msg)
}

// NewClient creates a new RPC client
func NewClient(addr string, opts ...ClientOption) *Client {
	client := &Client{
		addr:    addr,
		timeout: 30 * time.Second,
		codec:   &JSONCodec{},
		pending: make(map[uint64]*pendingCall),
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

// Connect connects to the RPC server
func (c *Client) Connect(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.connected {
		return fmt.Errorf("already connected")
	}

	dialer := &net.Dialer{
		Timeout: c.timeout,
	}

	conn, err := dialer.DialContext(ctx, "tcp", c.addr)
	if err != nil {
		return fmt.Errorf("dial failed: %w", err)
	}

	c.conn = conn
	c.connected = true

	// Start read loop
	go c.readLoop()

	if c.onConnect != nil {
		c.onConnect()
	}

	return nil
}

// Close closes the client connection
func (c *Client) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.connected {
		return nil
	}

	c.connected = false

	// Cancel all pending calls
	for _, call := range c.pending {
		call.err = fmt.Errorf("connection closed")
		close(call.done)
	}
	c.pending = make(map[uint64]*pendingCall)

	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

// Call makes an RPC call
func (c *Client) Call(ctx context.Context, method string, params, result interface{}) error {
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
	req := &Request{
		ID:     id,
		Method: method,
		Params: mustMarshal(params),
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
func (c *Client) Notify(ctx context.Context, method string, params interface{}) error {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.connected {
		return fmt.Errorf("not connected")
	}

	req := &Request{
		ID:     0, // Notifications use ID 0
		Method: method,
		Params: mustMarshal(params),
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

	c.mu.RLock()
	conn := c.conn
	c.mu.RUnlock()

	if conn == nil {
		return fmt.Errorf("not connected")
	}

	_, err = conn.Write(append(header, data...))
	return err
}

// readLoop reads responses from the connection
func (c *Client) readLoop() {
	header := make([]byte, 4)

	for {
		// Read length header
		_, err := io.ReadFull(c.conn, header)
		if err != nil {
			c.handleDisconnect(err)
			return
		}

		len := uint32(header[0])<<24 | uint32(header[1])<<16 | uint32(header[2])<<8 | uint32(header[3])
		data := make([]byte, len)

		// Read message body
		_, err = io.ReadFull(c.conn, data)
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
			call.resp = resp.Result
			if resp.Error != nil {
				call.err = resp.Error
			}
			close(call.done)

			c.mu.Lock()
			delete(c.pending, resp.ID)
			c.mu.Unlock()
		}
	}
}

// handleDisconnect handles disconnection
func (c *Client) handleDisconnect(err error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.connected {
		return
	}
	c.connected = false

	// Cancel pending calls
	for _, call := range c.pending {
		call.err = err
		close(call.done)
	}
	c.pending = make(map[uint64]*pendingCall)

	if c.onDisconnect != nil {
		c.onDisconnect(err)
	}
}

// IsConnected returns whether the client is connected
func (c *Client) IsConnected() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.connected
}

// mustMarshal marshals params, handling nil case
func mustMarshal(v interface{}) json.RawMessage {
	if v == nil {
		return nil
	}
	data, err := json.Marshal(v)
	if err != nil {
		return json.RawMessage(fmt.Sprintf(`marshal error: %s`, err))
	}
	return data
}
