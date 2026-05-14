package acp

import (
	"fmt"
	"io"
	"sync"
)

// InmemTransport implements Transport using in-memory channels.
// Use NewInmemTransportPair to create a connected pair — one for
// the client side, one for the server side. Messages sent on one
// end are received on the other, and vice versa.
//
// This is the Go equivalent of hashicorp/raft's InmemTransport,
// enabling full ACP protocol testing without real processes, pipes,
// or network connections.
type InmemTransport struct {
	sendCh    chan *Message
	recvCh    chan *Message
	closeCh   chan struct{}
	closeOnce *sync.Once // shared between the pair

	mu     sync.Mutex
	closed bool
}

// NewInmemTransportPair creates two connected InmemTransports.
// Messages sent on 'client' are received on 'server', and vice versa.
// Closing either end unblocks Receive on both ends.
func NewInmemTransportPair() (client, server *InmemTransport) {
	closeCh := make(chan struct{})
	once := &sync.Once{}
	c2s := make(chan *Message, 64) // client → server
	s2c := make(chan *Message, 64) // server → client
	client = &InmemTransport{sendCh: c2s, recvCh: s2c, closeCh: closeCh, closeOnce: once}
	server = &InmemTransport{sendCh: s2c, recvCh: c2s, closeCh: closeCh, closeOnce: once}
	return client, server
}

// Send writes a message to the transport.
// Returns error if the transport is closed.
func (t *InmemTransport) Send(msg *Message) error {
	if msg == nil {
		return fmt.Errorf("message cannot be nil")
	}

	t.mu.Lock()
	if t.closed {
		t.mu.Unlock()
		return fmt.Errorf("transport is closed: %w", ErrTransportClosed)
	}
	t.mu.Unlock()

	select {
	case t.sendCh <- msg:
		return nil
	case <-t.closeCh:
		return fmt.Errorf("transport is closed: %w", ErrTransportClosed)
	}
}

// Receive reads a message from the transport.
// Blocks until a message is available or the transport is closed.
// Returns io.EOF on close so readLoop treats it as a clean shutdown.
func (t *InmemTransport) Receive() (*Message, error) {
	select {
	case msg, ok := <-t.recvCh:
		if !ok {
			return nil, io.EOF
		}
		return msg, nil
	case <-t.closeCh:
		return nil, io.EOF
	}
}

// Close closes the transport pair.
// After Close, both Send and Receive return errors on both ends,
// and any blocked Receive calls are unblocked.
// Safe to call from either end — uses sync.Once internally.
func (t *InmemTransport) Close() error {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.closed {
		return nil
	}
	t.closed = true
	t.closeOnce.Do(func() { close(t.closeCh) })
	return nil
}
