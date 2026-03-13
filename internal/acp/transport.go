package acp

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"sync"
)

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

	// Write message followed by newline
	_, err = fmt.Fprintf(t.writer, "%s\n", data)
	return err
}

// Receive reads a message from stdin
func (t *StdioTransport) Receive() (*Message, error) {
	if t.closed {
		return nil, fmt.Errorf("transport is closed")
	}

	line, err := t.reader.ReadString('\n')
	if err != nil {
		if err == io.EOF {
			t.closed = true
		}
		return nil, err
	}

	var msg Message
	if err := json.Unmarshal([]byte(line), &msg); err != nil {
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
		return err
	}

	// WebSocket text message = 1
	return t.conn.WriteMessage(1, data)
}

// Receive reads a message from WebSocket
func (t *WebSocketTransport) Receive() (*Message, error) {
	if t.closed {
		return nil, fmt.Errorf("transport is closed")
	}

	_, data, err := t.conn.ReadMessage()
	if err != nil {
		return nil, err
	}

	var msg Message
	if err := json.Unmarshal(data, &msg); err != nil {
		return nil, err
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
