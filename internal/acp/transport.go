package acp

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"sync"
)

// maxMessageSize limits the size of messages to prevent memory exhaustion attacks
const maxMessageSize = 10 * 1024 * 1024 // 10MB

// Transport handles the underlying communication for ACP
type Transport interface {
	Send(msg *Message) error
	Receive() (*Message, error)
	Close() error
}

// StdioTransport implements Transport using stdin/stdout
type StdioTransport struct {
	reader *bufio.Reader
	writer io.Writer
	mu     sync.Mutex
	closed bool
}

// NewStdioTransport creates a new stdio transport
func NewStdioTransport(in io.Reader, out io.Writer) *StdioTransport {
	if in == nil || out == nil {
		return nil
	}
	return &StdioTransport{
		reader: bufio.NewReader(in),
		writer: out,
	}
}

// Send sends a message over stdout
func (t *StdioTransport) Send(msg *Message) error {
	if msg == nil {
		return fmt.Errorf("message cannot be nil")
	}

	t.mu.Lock()
	defer t.mu.Unlock()

	if t.closed {
		return fmt.Errorf("transport is closed")
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	// Check message size to prevent memory exhaustion attacks
	if len(data) > maxMessageSize {
		return fmt.Errorf("message too large: %d bytes (max %d)", len(data), maxMessageSize)
	}

	// Write message followed by newline
	_, err = fmt.Fprintf(t.writer, "%s\n", data)
	if err != nil {
		return fmt.Errorf("failed to write message: %w", err)
	}
	return nil
}

// Receive reads a message from stdin
func (t *StdioTransport) Receive() (*Message, error) {
	// Check closed state under lock
	t.mu.Lock()
	if t.closed {
		t.mu.Unlock()
		return nil, fmt.Errorf("transport is closed")
	}
	t.mu.Unlock()

	// Use a scanner with max token size to prevent unbounded reads.
	// bufio.ReadString('\n') can allocate unlimited memory before we check size,
	// so we use Scanner which enforces the limit upfront.
	scanner := bufio.NewScanner(t.reader)
	scanner.Buffer(make([]byte, 0, 64*1024), maxMessageSize)
	if !scanner.Scan() {
		err := scanner.Err()
		if err == nil {
			err = io.EOF
		}
		// Mark as closed on any read error (including EOF) to prevent reuse
		t.mu.Lock()
		t.closed = true
		t.mu.Unlock()
		return nil, err
	}

	line := scanner.Bytes()

	var msg Message
	if err := json.Unmarshal(line, &msg); err != nil {
		return nil, fmt.Errorf("failed to unmarshal message: %w", err)
	}

	return &msg, nil
}

// Close closes the transport
func (t *StdioTransport) Close() error {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.closed = true
	return nil
}

// WebSocketTransport implements Transport using WebSocket
type WebSocketTransport struct {
	conn interface { // WebSocket connection interface
		WriteMessage(messageType int, data []byte) error
		ReadMessage() (messageType int, p []byte, err error)
		Close() error
	}
	mu     sync.Mutex
	closed bool
}

// NewWebSocketTransport creates a new WebSocket transport
func NewWebSocketTransport(conn interface {
	WriteMessage(messageType int, data []byte) error
	ReadMessage() (messageType int, p []byte, err error)
	Close() error
}) *WebSocketTransport {
	return &WebSocketTransport{conn: conn}
}

// Send sends a message over WebSocket
func (t *WebSocketTransport) Send(msg *Message) error {
	if msg == nil {
		return fmt.Errorf("message cannot be nil")
	}

	t.mu.Lock()
	defer t.mu.Unlock()

	if t.closed {
		return fmt.Errorf("transport is closed")
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	// Check message size to prevent memory exhaustion attacks
	if len(data) > maxMessageSize {
		return fmt.Errorf("message too large: %d bytes (max %d)", len(data), maxMessageSize)
	}

	// WebSocket text message = 1
	if err := t.conn.WriteMessage(1, data); err != nil {
		return fmt.Errorf("failed to write message: %w", err)
	}
	return nil
}

// Receive reads a message from WebSocket
func (t *WebSocketTransport) Receive() (*Message, error) {
	// Check closed state under lock
	t.mu.Lock()
	if t.closed {
		t.mu.Unlock()
		return nil, fmt.Errorf("transport is closed")
	}
	t.mu.Unlock()

	_, data, err := t.conn.ReadMessage()
	if err != nil {
		// Mark as closed on any read error to prevent reuse
		t.mu.Lock()
		t.closed = true
		t.mu.Unlock()
		return nil, fmt.Errorf("failed to read message: %w", err)
	}

	// Check message size to prevent memory exhaustion
	if len(data) > maxMessageSize {
		return nil, fmt.Errorf("message too large: %d bytes (max %d)", len(data), maxMessageSize)
	}

	var msg Message
	if err := json.Unmarshal(data, &msg); err != nil {
		return nil, fmt.Errorf("failed to unmarshal message: %w", err)
	}

	return &msg, nil
}

// Close closes the WebSocket connection
func (t *WebSocketTransport) Close() error {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.closed = true
	return t.conn.Close()
}

// TCPTransport implements Transport using TCP with length-prefixed messages
type TCPTransport struct {
	conn   net.Conn
	reader *bufio.Reader
	writer *bufio.Writer
	mu     sync.Mutex
	closed bool
}

// NewTCPTransport creates a new TCP transport from an existing connection
func NewTCPTransport(conn net.Conn) *TCPTransport {
	if conn == nil {
		return nil
	}
	return &TCPTransport{
		conn:   conn,
		reader: bufio.NewReader(conn),
		writer: bufio.NewWriter(conn),
	}
}

// Send sends a message over TCP with a 4-byte length prefix
func (t *TCPTransport) Send(msg *Message) error {
	if msg == nil {
		return fmt.Errorf("message cannot be nil")
	}

	t.mu.Lock()
	defer t.mu.Unlock()

	if t.closed {
		return fmt.Errorf("transport is closed")
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	// Sanity check on message size (max 10MB, same as Receive)
	if len(data) > maxMessageSize {
		return fmt.Errorf("message too large: %d bytes (max %d)", len(data), maxMessageSize)
	}

	// Write 4-byte length prefix (big-endian)
	length := uint32(len(data))
	header := []byte{
		byte(length >> 24),
		byte(length >> 16),
		byte(length >> 8),
		byte(length),
	}

	if _, err := t.writer.Write(header); err != nil {
		return fmt.Errorf("failed to write header: %w", err)
	}

	if _, err := t.writer.Write(data); err != nil {
		return fmt.Errorf("failed to write body: %w", err)
	}

	return t.writer.Flush()
}

// Receive reads a message from TCP with a 4-byte length prefix
func (t *TCPTransport) Receive() (*Message, error) {
	t.mu.Lock()
	if t.closed {
		t.mu.Unlock()
		return nil, fmt.Errorf("transport is closed")
	}
	t.mu.Unlock()

	// Read 4-byte length prefix
	header := make([]byte, 4)
	if _, err := io.ReadFull(t.reader, header); err != nil {
		t.mu.Lock()
		t.closed = true
		t.mu.Unlock()
		return nil, err
	}

	length := uint32(header[0])<<24 | uint32(header[1])<<16 | uint32(header[2])<<8 | uint32(header[3])

	// Sanity check on message size (max 10MB)
	if length > maxMessageSize {
		// Close transport to prevent protocol desync: header was already consumed
		// but body bytes remain in the reader buffer, corrupting subsequent reads
		t.mu.Lock()
		t.closed = true
		t.mu.Unlock()
		return nil, fmt.Errorf("message too large: %d bytes (max %d)", length, maxMessageSize)
	}

	// Read message body
	body := make([]byte, length)
	if _, err := io.ReadFull(t.reader, body); err != nil {
		t.mu.Lock()
		t.closed = true
		t.mu.Unlock()
		return nil, fmt.Errorf("failed to read body: %w", err)
	}

	var msg Message
	if err := json.Unmarshal(body, &msg); err != nil {
		return nil, fmt.Errorf("failed to unmarshal message: %w", err)
	}

	return &msg, nil
}

// Close closes the TCP connection
func (t *TCPTransport) Close() error {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.closed {
		return nil
	}
	t.closed = true
	// Flush buffered writes before closing to prevent data loss
	flushErr := t.writer.Flush()
	// Always close connection even if flush fails (prevent FD leak)
	closeErr := t.conn.Close()
	if flushErr != nil {
		return flushErr
	}
	return closeErr
}
