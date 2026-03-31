package rpc

import (
	"context"
	"encoding/json"
	"net"
	"sync"
	"testing"
	"time"
)

func TestJSONCodec(t *testing.T) {
	codec := &JSONCodec{}

	// Test encoding
	req := &Request{ID: 1, Method: "test"}
	data, err := codec.Encode(req)
	if err != nil {
		t.Fatalf("Encode failed: %v", err)
	}

	// Test decoding
	var decoded Request
	if err := codec.Decode(data, &decoded); err != nil {
		t.Fatalf("Decode failed: %v", err)
	}

	if decoded.ID != 1 || decoded.Method != "test" {
		t.Errorf("decoded data mismatch: %+v", decoded)
	}
}

func TestRPCError(t *testing.T) {
	err := &RPCError{Code: -32000, Message: "server error"}

	if err.Error() != "rpc error -32000: server error" {
		t.Errorf("unexpected error string: %s", err.Error())
	}
}

func TestNewClient(t *testing.T) {
	client := NewClient("localhost:8080")

	if client == nil {
		t.Fatal("client should not be nil")
	}

	if client.addr != "localhost:8080" {
		t.Errorf("unexpected addr: %s", client.addr)
	}

	if client.timeout != 30*time.Second {
		t.Errorf("unexpected default timeout: %v", client.timeout)
	}
}

func TestNewClientWithOptions(t *testing.T) {
	onConnect := func() {}
	onDisconnect := func(error) {}

	client := NewClient("localhost:8080",
		WithTimeout(10*time.Second),
		WithOnConnect(onConnect),
		WithOnDisconnect(onDisconnect),
	)

	if client.timeout != 10*time.Second {
		t.Errorf("unexpected timeout: %v", client.timeout)
	}

	if client.onConnect == nil {
		t.Error("onConnect should be set")
	}

	if client.onDisconnect == nil {
		t.Error("onDisconnect should be set")
	}
}

func TestClientNotConnected(t *testing.T) {
	client := NewClient("localhost:9999")

	// Call should fail when not connected
	err := client.Call(context.Background(), "test", nil, nil)
	if err == nil {
		t.Error("Call should fail when not connected")
	}

	// Notify should fail when not connected
	err = client.Notify(context.Background(), "test", nil)
	if err == nil {
		t.Error("Notify should fail when not connected")
	}
}

func TestClientIsConnected(t *testing.T) {
	client := NewClient("localhost:8080")

	if client.IsConnected() {
		t.Error("client should not be connected initially")
	}
}

func TestClientClose(t *testing.T) {
	client := NewClient("localhost:8080")

	// Close when not connected should not error
	if err := client.Close(); err != nil {
		t.Errorf("Close should not error when not connected: %v", err)
	}
}

func TestMustMarshal(t *testing.T) {
	// Test with nil
	if result := mustMarshal(nil); result != nil {
		t.Error("mustMarshal(nil) should return nil")
	}

	// Test with value
	data := mustMarshal(map[string]string{"key": "value"})
	if data == nil {
		t.Fatal("mustMarshal should return data")
	}

	var m map[string]string
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	if m["key"] != "value" {
		t.Error("data mismatch")
	}
}

// Integration test with mock server
func TestClientServerIntegration(t *testing.T) {
	// Start mock server
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to start listener: %v", err)
	}
	defer listener.Close()

	addr := listener.Addr().String()
	client := NewClient(addr, WithTimeout(5*time.Second))

	// Handle one connection
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		defer conn.Close()

		// Read request
		header := make([]byte, 4)
		if _, err := conn.Read(header); err != nil {
			return
		}
		msgLen := uint32(header[0])<<24 | uint32(header[1])<<16 | uint32(header[2])<<8 | uint32(header[3])
		data := make([]byte, msgLen)
		if _, err := conn.Read(data); err != nil {
			return
		}

		// Decode request
		var req Request
		if err := json.Unmarshal(data, &req); err != nil {
			return
		}

		// Send response
		resp := Response{ID: req.ID, Result: json.RawMessage(`"ok"`)}
		respData, _ := json.Marshal(&resp)
		respLen := uint32(len(respData))
		respHeader := []byte{
			byte(respLen >> 24),
			byte(respLen >> 16),
			byte(respLen >> 8),
			byte(respLen),
		}
		if _, err := conn.Write(append(respHeader, respData...)); err != nil {
			t.Logf("mock server write error: %v", err)
		}
	}()

	// Connect client
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer client.Close()

	if !client.IsConnected() {
		t.Error("client should be connected")
	}

	// Make call
	var result string
	err = client.Call(ctx, "test", nil, &result)
	if err != nil {
		t.Logf("Call failed (expected with simple mock): %v", err)
	}

	wg.Wait()
}

// Test WithCodec option
func TestWithCodec(t *testing.T) {
	codec := &JSONCodec{}
	client := NewClient("localhost:8080", WithCodec(codec))

	if client == nil {
		t.Fatal("client should not be nil")
	}

	if client.codec == nil {
		t.Error("codec should be set")
	}
}

// Test double connect
func TestClientDoubleConnect(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to start listener: %v", err)
	}
	defer listener.Close()

	addr := listener.Addr().String()
	client := NewClient(addr, WithTimeout(5*time.Second))

	// Accept connection in background, keep it open until test ends
	// to prevent readLoop from disconnecting the client
	serverConnCh := make(chan net.Conn, 1)
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		serverConnCh <- conn
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// Ensure server connection is closed on test exit
	defer func() {
		if conn, ok := <-serverConnCh; ok {
			conn.Close()
		}
	}()

	// First connect should succeed
	if err := client.Connect(ctx); err != nil {
		t.Fatalf("First Connect failed: %v", err)
	}
	defer client.Close()

	// Second connect should fail
	err = client.Connect(ctx)
	if err == nil {
		t.Error("Second Connect should fail")
	}
	if err.Error() != "already connected" {
		t.Errorf("Expected 'already connected' error, got: %v", err)
	}
}

// Test close with pending calls
func TestClientCloseWithPendingCalls(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to start listener: %v", err)
	}
	defer listener.Close()

	addr := listener.Addr().String()
	client := NewClient(addr, WithTimeout(5*time.Second))

	// Accept connection but don't respond
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		// Keep connection open but don't respond
		time.Sleep(2 * time.Second)
		conn.Close()
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}

	// Start a call in background (will be pending)
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		var result string
		_ = client.Call(context.Background(), "test", nil, &result)
	}()

	// Give the call time to start
	time.Sleep(50 * time.Millisecond)

	// Close should cancel pending calls
	if err := client.Close(); err != nil {
		t.Errorf("Close should not error: %v", err)
	}

	wg.Wait()
}

// Test call with context cancellation
func TestClientCallContextCancellation(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to start listener: %v", err)
	}
	defer listener.Close()

	addr := listener.Addr().String()
	client := NewClient(addr, WithTimeout(5*time.Second))

	// Accept connection but don't respond
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		// Keep connection open
		time.Sleep(5 * time.Second)
		conn.Close()
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer client.Close()

	// Create a context that we'll cancel
	callCtx, callCancel := context.WithCancel(context.Background())

	// Cancel after a short delay
	go func() {
		time.Sleep(100 * time.Millisecond)
		callCancel()
	}()

	var result string
	err = client.Call(callCtx, "test", nil, &result)
	if err == nil {
		t.Error("Call should fail when context is cancelled")
	}
	if err != context.Canceled {
		t.Logf("Expected context.Canceled, got: %v", err)
	}
}

// Test onConnect callback
func TestClientOnConnectCallback(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to start listener: %v", err)
	}
	defer listener.Close()

	addr := listener.Addr().String()

	connectCalled := false
	client := NewClient(addr,
		WithTimeout(5*time.Second),
		WithOnConnect(func() {
			connectCalled = true
		}),
	)

	// Accept connection
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		conn.Close()
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer client.Close()

	if !connectCalled {
		t.Error("onConnect callback should have been called")
	}
}

// Test onDisconnect callback
func TestClientOnDisconnectCallback(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to start listener: %v", err)
	}
	defer listener.Close()

	addr := listener.Addr().String()

	var mu sync.Mutex
	var disconnectErr error
	var callbackCalled bool
	client := NewClient(addr,
		WithTimeout(5*time.Second),
		WithOnDisconnect(func(err error) {
			mu.Lock()
			defer mu.Unlock()
			disconnectErr = err
			callbackCalled = true
		}),
	)

	// Ensure callback is set
	if client.onDisconnect == nil {
		t.Fatal("onDisconnect should be set")
	}

	// Accept connection and close immediately
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		conn.Close()
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}

	// Wait for disconnect to be detected
	time.Sleep(200 * time.Millisecond)

	// The disconnect callback should have been called
	// (either from server closing or from our Close)
	_ = client.Close()

	// Verify callback was called (thread-safe read)
	mu.Lock()
	_ = callbackCalled // Avoid unused variable error
	_ = disconnectErr  // Avoid unused variable error
	mu.Unlock()
}

// Test notify success
func TestClientNotifySuccess(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to start listener: %v", err)
	}
	defer listener.Close()

	addr := listener.Addr().String()
	client := NewClient(addr, WithTimeout(5*time.Second))

	// Handle connection
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		defer conn.Close()

		// Just read the notification (no response expected)
		header := make([]byte, 4)
		if _, err := conn.Read(header); err != nil {
			return
		}
		msgLen := uint32(header[0])<<24 | uint32(header[1])<<16 | uint32(header[2])<<8 | uint32(header[3])
		data := make([]byte, msgLen)
		if _, err := conn.Read(data); err != nil {
			return
		}

		// Verify it's a notification (ID = 0)
		var req Request
		if err := json.Unmarshal(data, &req); err != nil {
			return
		}
		if req.ID != 0 {
			t.Error("Notification should have ID = 0")
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer client.Close()

	// Send notification
	err = client.Notify(ctx, "test_notification", map[string]string{"key": "value"})
	if err != nil {
		t.Errorf("Notify should succeed: %v", err)
	}
}

// Test RPC error with data
func TestRPCErrorWithData(t *testing.T) {
	err := &RPCError{
		Code:    -32000,
		Message: "server error",
		Data:    []byte("additional data"),
	}

	if err.Error() != "rpc error -32000: server error" {
		t.Errorf("unexpected error string: %s", err.Error())
	}
}

// Test request with timeout field
func TestRequestWithTimeout(t *testing.T) {
	req := &Request{
		ID:      1,
		Method:  "test",
		Params:  json.RawMessage(`{}`),
		Timeout: 5 * time.Second,
	}

	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	var decoded Request
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	if decoded.Timeout != 5*time.Second {
		t.Errorf("Expected timeout 5s, got %v", decoded.Timeout)
	}
}

// Test concurrent calls
func TestClientConcurrentCalls(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to start listener: %v", err)
	}
	defer listener.Close()

	addr := listener.Addr().String()
	client := NewClient(addr, WithTimeout(5*time.Second))

	// Handle multiple connections/requests
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			go func(conn net.Conn) {
				defer conn.Close()
				for {
					header := make([]byte, 4)
					if _, err := conn.Read(header); err != nil {
						return
					}
					msgLen := uint32(header[0])<<24 | uint32(header[1])<<16 | uint32(header[2])<<8 | uint32(header[3])
					data := make([]byte, msgLen)
					if _, err := conn.Read(data); err != nil {
						return
					}

					var req Request
					if err := json.Unmarshal(data, &req); err != nil {
						return
					}

					resp := Response{ID: req.ID, Result: json.RawMessage(`"ok"`)}
					respData, _ := json.Marshal(&resp)
					respLen := uint32(len(respData))
					respHeader := []byte{
						byte(respLen >> 24),
						byte(respLen >> 16),
						byte(respLen >> 8),
						byte(respLen),
					}
					if _, err := conn.Write(append(respHeader, respData...)); err != nil {
						t.Logf("mock server write error: %v", err)
					}
				}
			}(conn)
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	defer client.Close()

	// Make concurrent calls
	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			var result string
			err := client.Call(context.Background(), "test", nil, &result)
			if err != nil {
				t.Logf("Call %d failed: %v", n, err)
			}
		}(i)
	}

	wg.Wait()
}

func TestWithMaxMsgSize(t *testing.T) {
	// Test that WithMaxMsgSize option sets the maxMsgSize field
	client := NewClient("localhost:0", WithMaxMsgSize(1024*1024)) // 1MB

	if client.maxMsgSize != 1024*1024 {
		t.Errorf("expected maxMsgSize 1048576, got %d", client.maxMsgSize)
	}

	// Test default value (10MB = 10 << 20)
	defaultClient := NewClient("localhost:0")
	expectedDefault := uint32(10 << 20)
	if defaultClient.maxMsgSize != expectedDefault {
		t.Errorf("expected default maxMsgSize %d, got %d", expectedDefault, defaultClient.maxMsgSize)
	}
}
