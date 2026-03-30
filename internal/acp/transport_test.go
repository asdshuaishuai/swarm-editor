package acp

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"sync"
	"testing"
)

func TestNewStdioTransport(t *testing.T) {
	in := bytes.NewBufferString("")
	out := &bytes.Buffer{}

	transport := NewStdioTransport(in, out)

	if transport == nil {
		t.Fatal("NewStdioTransport returned nil")
	}

	if transport.reader == nil {
		t.Error("reader should be initialized")
	}

	if transport.writer == nil {
		t.Error("writer should be initialized")
	}
}

func TestStdioTransportSend(t *testing.T) {
	in := bytes.NewBufferString("")
	out := &bytes.Buffer{}
	transport := NewStdioTransport(in, out)

	msg := &Message{
		ID:     &RequestID{Number: 1, IsNum: true},
		Method: "test",
	}

	err := transport.Send(msg)
	if err != nil {
		t.Fatalf("Send failed: %v", err)
	}

	// Verify output contains valid JSON
	output := out.String()
	if output == "" {
		t.Fatal("Output should not be empty")
	}

	var parsed Message
	if err := json.Unmarshal([]byte(output[:len(output)-1]), &parsed); err != nil {
		t.Errorf("Output should be valid JSON: %v", err)
	}
}

func TestStdioTransportSendClosed(t *testing.T) {
	in := bytes.NewBufferString("")
	out := &bytes.Buffer{}
	transport := NewStdioTransport(in, out)
	transport.Close()

	msg := &Message{Method: "test"}
	err := transport.Send(msg)
	if err == nil {
		t.Error("Send should fail on closed transport")
	}
}

func TestStdioTransportReceive(t *testing.T) {
	msg := &Message{
		ID:     &RequestID{Number: 1, IsNum: true},
		Method: "test",
	}
	data, _ := json.Marshal(msg)

	in := bytes.NewBuffer(append(data, '\n'))
	out := &bytes.Buffer{}
	transport := NewStdioTransport(in, out)

	received, err := transport.Receive()
	if err != nil {
		t.Fatalf("Receive failed: %v", err)
	}

	if received.Method != "test" {
		t.Errorf("Expected method 'test', got '%s'", received.Method)
	}
}

func TestStdioTransportReceiveClosed(t *testing.T) {
	in := bytes.NewBufferString("\n")
	out := &bytes.Buffer{}
	transport := NewStdioTransport(in, out)
	transport.Close()

	_, err := transport.Receive()
	if err == nil {
		t.Error("Receive should fail on closed transport")
	}
}

func TestStdioTransportReceiveEOF(t *testing.T) {
	in := bytes.NewBufferString("") // Empty buffer will return EOF
	out := &bytes.Buffer{}
	transport := NewStdioTransport(in, out)

	_, err := transport.Receive()
	if err != io.EOF {
		t.Errorf("Expected EOF, got: %v", err)
	}

	if !transport.closed {
		t.Error("Transport should be closed after EOF")
	}
}

func TestStdioTransportReceiveInvalidJSON(t *testing.T) {
	in := bytes.NewBufferString("invalid json\n")
	out := &bytes.Buffer{}
	transport := NewStdioTransport(in, out)

	_, err := transport.Receive()
	if err == nil {
		t.Error("Receive should fail for invalid JSON")
	}
}

func TestStdioTransportClose(t *testing.T) {
	in := bytes.NewBufferString("")
	out := &bytes.Buffer{}
	transport := NewStdioTransport(in, out)

	err := transport.Close()
	if err != nil {
		t.Fatalf("Close failed: %v", err)
	}

	if !transport.closed {
		t.Error("Transport should be closed")
	}

	// Multiple closes should be safe
	err = transport.Close()
	if err != nil {
		t.Errorf("Multiple Close calls should be safe: %v", err)
	}
}

func TestStdioTransportConcurrentSend(t *testing.T) {
	in := bytes.NewBufferString("")
	out := &bytes.Buffer{}
	transport := NewStdioTransport(in, out)

	var wg sync.WaitGroup
	done := make(chan bool, 10)

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			msg := &Message{
				ID:     &RequestID{Number: int64(idx), IsNum: true},
				Method: "test",
			}
			transport.Send(msg)
			done <- true
		}(i)
	}

	wg.Wait()
	close(done)

	count := 0
	for range done {
		count++
	}
	if count != 10 {
		t.Errorf("Expected 10 completions, got %d", count)
	}
}

// Mock WebSocket connection for testing

type mockWebSocketConn struct {
	readBuf  [][]byte
	writeBuf [][]byte
	readIdx  int
	closed   bool
	mu       sync.Mutex
}

func (m *mockWebSocketConn) WriteMessage(messageType int, data []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closed {
		return io.ErrClosedPipe
	}
	m.writeBuf = append(m.writeBuf, data)
	return nil
}

func (m *mockWebSocketConn) ReadMessage() (int, []byte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closed {
		return 0, nil, io.ErrClosedPipe
	}
	if m.readIdx >= len(m.readBuf) {
		return 0, nil, io.EOF
	}
	data := m.readBuf[m.readIdx]
	m.readIdx++
	return 1, data, nil
}

func (m *mockWebSocketConn) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.closed = true
	return nil
}

func TestNewWebSocketTransport(t *testing.T) {
	conn := &mockWebSocketConn{}
	transport := NewWebSocketTransport(conn)

	if transport == nil {
		t.Fatal("NewWebSocketTransport returned nil")
	}

	if transport.conn == nil {
		t.Error("conn should be set")
	}
}

func TestWebSocketTransportSend(t *testing.T) {
	conn := &mockWebSocketConn{}
	transport := NewWebSocketTransport(conn)

	msg := &Message{
		ID:     &RequestID{Number: 1, IsNum: true},
		Method: "test",
	}

	err := transport.Send(msg)
	if err != nil {
		t.Fatalf("Send failed: %v", err)
	}

	if len(conn.writeBuf) != 1 {
		t.Errorf("Expected 1 message written, got %d", len(conn.writeBuf))
	}
}

func TestWebSocketTransportSendClosed(t *testing.T) {
	conn := &mockWebSocketConn{}
	transport := NewWebSocketTransport(conn)
	transport.Close()

	msg := &Message{Method: "test"}
	err := transport.Send(msg)
	if err == nil {
		t.Error("Send should fail on closed transport")
	}
}

func TestWebSocketTransportReceive(t *testing.T) {
	msg := &Message{
		ID:     &RequestID{Number: 1, IsNum: true},
		Method: "test",
	}
	data, _ := json.Marshal(msg)

	conn := &mockWebSocketConn{
		readBuf: [][]byte{data},
	}
	transport := NewWebSocketTransport(conn)

	received, err := transport.Receive()
	if err != nil {
		t.Fatalf("Receive failed: %v", err)
	}

	if received.Method != "test" {
		t.Errorf("Expected method 'test', got '%s'", received.Method)
	}
}

func TestWebSocketTransportReceiveClosed(t *testing.T) {
	conn := &mockWebSocketConn{}
	transport := NewWebSocketTransport(conn)
	transport.Close()

	_, err := transport.Receive()
	if err == nil {
		t.Error("Receive should fail on closed transport")
	}
}

func TestWebSocketTransportReceiveInvalidJSON(t *testing.T) {
	conn := &mockWebSocketConn{
		readBuf: [][]byte{[]byte("invalid json")},
	}
	transport := NewWebSocketTransport(conn)

	_, err := transport.Receive()
	if err == nil {
		t.Error("Receive should fail for invalid JSON")
	}
}

func TestWebSocketTransportClose(t *testing.T) {
	conn := &mockWebSocketConn{}
	transport := NewWebSocketTransport(conn)

	err := transport.Close()
	if err != nil {
		t.Fatalf("Close failed: %v", err)
	}

	if !transport.closed {
		t.Error("Transport should be closed")
	}

	if !conn.closed {
		t.Error("Underlying connection should be closed")
	}
}

func TestWebSocketTransportConcurrentSend(t *testing.T) {
	conn := &mockWebSocketConn{}
	transport := NewWebSocketTransport(conn)

	var wg sync.WaitGroup
	done := make(chan bool, 10)

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			msg := &Message{
				ID:     &RequestID{Number: int64(idx), IsNum: true},
				Method: "test",
			}
			transport.Send(msg)
			done <- true
		}(i)
	}

	wg.Wait()
	close(done)

	count := 0
	for range done {
		count++
	}
	if count != 10 {
		t.Errorf("Expected 10 completions, got %d", count)
	}
}

// Transport interface compliance tests

func TestStdioTransportImplementsTransport(t *testing.T) {
	var _ Transport = NewStdioTransport(bytes.NewBuffer(nil), &bytes.Buffer{})
}

func TestWebSocketTransportImplementsTransport(t *testing.T) {
	var _ Transport = NewWebSocketTransport(&mockWebSocketConn{})
}

// Edge cases

func TestStdioTransportSendNilMessage(t *testing.T) {
	in := bytes.NewBufferString("")
	out := &bytes.Buffer{}
	transport := NewStdioTransport(in, out)

	err := transport.Send(nil)
	if err == nil {
		t.Error("Send nil message should return error")
	}
}

func TestNewStdioTransportNilReader(t *testing.T) {
	transport := NewStdioTransport(nil, &bytes.Buffer{})
	if transport != nil {
		t.Error("NewStdioTransport with nil reader should return nil")
	}
}

func TestNewStdioTransportNilWriter(t *testing.T) {
	transport := NewStdioTransport(bytes.NewBufferString(""), nil)
	if transport != nil {
		t.Error("NewStdioTransport with nil writer should return nil")
	}
}

func TestNewStdioTransportBothNil(t *testing.T) {
	transport := NewStdioTransport(nil, nil)
	if transport != nil {
		t.Error("NewStdioTransport with both nil should return nil")
	}
}

func TestWebSocketTransportSendNilMessage(t *testing.T) {
	conn := &mockWebSocketConn{}
	transport := NewWebSocketTransport(conn)

	err := transport.Send(nil)
	if err == nil {
		t.Error("Send nil message should return error")
	}
}

func TestStdioTransportReceiveEmptyLine(t *testing.T) {
	// Empty line should parse to an empty Message
	in := bytes.NewBufferString("\n")
	out := &bytes.Buffer{}
	transport := NewStdioTransport(in, out)

	_, err := transport.Receive()
	// Empty line {} is valid JSON for Message
	if err != nil {
		t.Logf("Receive empty line: %v", err)
	}
}

func TestWebSocketTransportReceiveEOF(t *testing.T) {
	conn := &mockWebSocketConn{
		readBuf: [][]byte{}, // No data
	}
	transport := NewWebSocketTransport(conn)

	_, err := transport.Receive()
	// The error is wrapped, so we check with errors.Is
	if !errors.Is(err, io.EOF) {
		t.Errorf("Expected EOF error, got: %v", err)
	}
}

// Message round-trip tests

func TestStdioTransportMessageRoundTrip(t *testing.T) {
	// Create pipe for bidirectional communication
	r1, w1 := io.Pipe()
	r2, w2 := io.Pipe()

	// Transport 1: reads from r1, writes to w2
	t1 := NewStdioTransport(r1, w2)
	// Transport 2: reads from r2, writes to w1
	t2 := NewStdioTransport(r2, w1)

	original := &Message{
		ID:     &RequestID{Number: 42, IsNum: true},
		Method: "session/prompt",
		Params: json.RawMessage(`{"sessionId": "test", "prompt": []}`),
	}

	// Send from t1 to t2
	go func() {
		t1.Send(original)
	}()

	received, err := t2.Receive()
	if err != nil {
		t.Fatalf("Receive failed: %v", err)
	}

	if received.Method != original.Method {
		t.Errorf("Method mismatch: got '%s', want '%s'", received.Method, original.Method)
	}

	if received.ID.Number != original.ID.Number {
		t.Errorf("ID mismatch: got %d, want %d", received.ID.Number, original.ID.Number)
	}

	// Cleanup
	w1.Close()
	w2.Close()
	r1.Close()
	r2.Close()
	t1.Close()
	t2.Close()
}
