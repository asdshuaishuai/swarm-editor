package acp

import (
	"context"
	"sync"
	"testing"
	"time"
)

func makeID(n int64) *RequestID {
	return &RequestID{Number: n, IsNum: true}
}

func TestInmemTransportPair_BasicSendReceive(t *testing.T) {
	client, server := NewInmemTransportPair()

	msg := &Message{
		JSONRPC: "2.0",
		ID:      makeID(1),
		Method:  "test",
	}

	if err := client.Send(msg); err != nil {
		t.Fatalf("client.Send failed: %v", err)
	}

	received, err := server.Receive()
	if err != nil {
		t.Fatalf("server.Receive failed: %v", err)
	}
	if received.ID.Number != msg.ID.Number {
		t.Errorf("expected ID %d, got %d", msg.ID.Number, received.ID.Number)
	}
}

func TestInmemTransportPair_Bidirectional(t *testing.T) {
	client, server := NewInmemTransportPair()

	// Server → Client
	serverMsg := &Message{JSONRPC: "2.0", ID: makeID(1), Method: "initialize"}
	if err := server.Send(serverMsg); err != nil {
		t.Fatalf("server.Send failed: %v", err)
	}
	got, err := client.Receive()
	if err != nil {
		t.Fatalf("client.Receive failed: %v", err)
	}
	if got.Method != "initialize" {
		t.Errorf("expected method 'initialize', got %s", got.Method)
	}

	// Client → Server
	clientMsg := &Message{JSONRPC: "2.0", ID: makeID(2), Method: "session/new"}
	if err = client.Send(clientMsg); err != nil {
		t.Fatalf("client.Send failed: %v", err)
	}
	got, err = server.Receive()
	if err != nil {
		t.Fatalf("server.Receive failed: %v", err)
	}
	if got.Method != "session/new" {
		t.Errorf("expected method 'session/new', got %s", got.Method)
	}
}

func TestInmemTransport_SendNil(t *testing.T) {
	client, _ := NewInmemTransportPair()

	if err := client.Send(nil); err == nil {
		t.Error("expected error for nil message")
	}
}

func TestInmemTransport_SendAfterClose(t *testing.T) {
	client, _ := NewInmemTransportPair()
	client.Close()

	msg := &Message{JSONRPC: "2.0", ID: makeID(1)}
	if err := client.Send(msg); err == nil {
		t.Error("expected error after Close")
	}
}

func TestInmemTransport_ReceiveAfterClose(t *testing.T) {
	client, _ := NewInmemTransportPair()
	client.Close()

	_, err := client.Receive()
	if err == nil {
		t.Error("expected error after Close")
	}
}

func TestInmemTransport_CloseIdempotent(t *testing.T) {
	client, _ := NewInmemTransportPair()

	if err := client.Close(); err != nil {
		t.Fatalf("first Close failed: %v", err)
	}
	if err := client.Close(); err != nil {
		t.Fatalf("second Close failed: %v", err)
	}
}

func TestInmemTransport_ConcurrentSendReceive(t *testing.T) {
	client, server := NewInmemTransportPair()

	var wg sync.WaitGroup
	const n = 100

	// Send n messages from client to server
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := range n {
			msg := &Message{JSONRPC: "2.0", ID: makeID(int64(i)), Method: "test"}
			if err := client.Send(msg); err != nil {
				t.Errorf("client.Send(%d) failed: %v", i, err)
				return
			}
		}
	}()

	// Receive n messages on server
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := range n {
			msg, err := server.Receive()
			if err != nil {
				t.Errorf("server.Receive(%d) failed: %v", i, err)
				return
			}
			if msg.ID.Number != int64(i) {
				t.Errorf("expected ID %d, got %d", i, msg.ID.Number)
				return
			}
		}
	}()

	wg.Wait()
}

func TestInmemTransport_WithClientServer(t *testing.T) {
	clientTransport, serverTransport := NewInmemTransportPair()

	// Create a client with the client-side transport
	c := NewClient(clientTransport)
	if c == nil {
		t.Fatal("NewClient returned nil")
	}

	// Create a server: NewServer(handler, transport)
	handler := &MockHandler{}
	s := NewServer(handler, serverTransport)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if err := c.Start(ctx); err != nil {
		t.Fatalf("client.Start failed: %v", err)
	}
	defer c.Stop()

	if err := s.Start(ctx); err != nil {
		t.Fatalf("server.Start failed: %v", err)
	}
	defer s.Stop()

	// Perform initialize handshake
	result, err := c.Initialize(ctx, &InitializeParams{
		ProtocolVersion: ProtocolVersion,
		ClientInfo: ImplementationInfo{
			Name:    "test-client",
			Version: "0.1.0",
		},
	})
	if err != nil {
		t.Fatalf("Initialize failed: %v", err)
	}
	if result == nil {
		t.Fatal("Initialize returned nil result")
	}
}

func TestInmemTransport_WithClientSession(t *testing.T) {
	clientTransport, serverTransport := NewInmemTransportPair()

	c := NewClient(clientTransport)
	handler := &MockHandler{}
	s := NewServer(handler, serverTransport)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	c.Start(ctx)
	defer c.Stop()
	s.Start(ctx)
	defer s.Stop()

	// Initialize
	if _, err := c.Initialize(ctx, &InitializeParams{
		ProtocolVersion: ProtocolVersion,
		ClientInfo:      ImplementationInfo{Name: "test", Version: "0.1.0"},
	}); err != nil {
		t.Fatalf("Initialize failed: %v", err)
	}

	// Create session
	sessionResult, err := c.SessionNew(ctx, &SessionNewParams{Mode: ModeDefault})
	if err != nil {
		t.Fatalf("SessionNew failed: %v", err)
	}
	if sessionResult.SessionID == "" {
		t.Error("expected non-empty session ID")
	}
}

func TestInmemTransport_BufferedSend(t *testing.T) {
	client, server := NewInmemTransportPair()

	// Send multiple messages without receiving — should buffer in channel
	for i := range 10 {
		if err := client.Send(&Message{JSONRPC: "2.0", ID: makeID(int64(i))}); err != nil {
			t.Fatalf("Send(%d) failed: %v", i, err)
		}
	}

	// Receive all
	for i := range 10 {
		msg, err := server.Receive()
		if err != nil {
			t.Fatalf("Receive(%d) failed: %v", i, err)
		}
		if msg.ID.Number != int64(i) {
			t.Errorf("expected ID %d, got %d", i, msg.ID.Number)
		}
	}
}

func TestInmemTransport_CloseDuringReceive(t *testing.T) {
	client, server := NewInmemTransportPair()

	errCh := make(chan error, 1)
	go func() {
		_, err := server.Receive()
		errCh <- err
	}()

	// Give the goroutine time to block on receive
	time.Sleep(20 * time.Millisecond)

	// Closing either end unblocks the other's Receive
	client.Close()

	select {
	case err := <-errCh:
		if err == nil {
			t.Error("expected error when transport closed during receive")
		}
	case <-time.After(time.Second):
		t.Error("timeout waiting for receive to return after close")
	}
}

func TestInmemTransport_CloseUnblocksBothEnds(t *testing.T) {
	client, server := NewInmemTransportPair()

	// Block both sides on receive
	clientErr := make(chan error, 1)
	serverErr := make(chan error, 1)
	go func() { _, err := client.Receive(); clientErr <- err }()
	go func() { _, err := server.Receive(); serverErr <- err }()

	time.Sleep(20 * time.Millisecond)

	// Closing one end unblocks both
	server.Close()

	for i, ch := range []chan error{clientErr, serverErr} {
		select {
		case err := <-ch:
			if err == nil {
				t.Errorf("end %d: expected error after close", i)
			}
		case <-time.After(time.Second):
			t.Errorf("end %d: timeout after close", i)
		}
	}
}
