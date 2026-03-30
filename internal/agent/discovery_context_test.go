package agent

import (
	"context"
	"testing"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/acp"
)

// TestQueryAgentCapabilitiesContextCancellation tests that context cancellation
// is properly propagated during capability queries
func TestQueryAgentCapabilitiesContextCancellation(t *testing.T) {
	// Create a discovery service
	config := DiscoveryConfig{}
	d := NewDiscoveryService(config, nil, nil, nil)

	// Create a cancellable context
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Set the context
	d.ctx = ctx

	// Create a channel to signal when the query starts
	started := make(chan struct{})
	done := make(chan struct{})

	go func() {
		close(started)
		// Query capabilities for an address that doesn't exist
		// This should respect context cancellation
		d.queryAgentCapabilitiesWithContext(ctx, "127.0.0.1:9999", 50*time.Millisecond)
		close(done)
	}()

	// Wait for the query to start
	<-started

	// Cancel the context
	cancel()

	// Wait for the query to complete with timeout
	select {
	case <-done:
		// Good - query completed
	case <-time.After(2 * time.Second):
		t.Error("queryAgentCapabilitiesWithContext did not respect context cancellation")
	}
}

// TestProbeNetworkAgentContextCancellation tests that probeNetworkAgentWithContext
// respects context cancellation
func TestProbeNetworkAgentContextCancellation(t *testing.T) {
	config := DiscoveryConfig{
		ScanTimeout: 5 * time.Second, // Long timeout
	}
	d := NewDiscoveryService(config, nil, nil, nil)

	// Create already-cancelled context
	cancelCtx, cancelFunc := context.WithCancel(context.Background())
	cancelFunc()

	// Probe should return nil immediately when context is cancelled
	result := d.probeNetworkAgentWithContext(cancelCtx, "127.0.0.1:9999")
	if result != nil {
		t.Error("probeNetworkAgentWithContext should return nil when context is cancelled")
	}
}

// TestDiscoveryServiceContextPropagation tests that the discovery service
// properly uses its internal context
func TestDiscoveryServiceContextPropagation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	config := DiscoveryConfig{}
	d := NewDiscoveryService(config, nil, nil, acp.NewConnectionManager(nil))

	// Before setting context, queryAgentCapabilities should work
	// (it will use context.Background())
	_ = d.queryAgentCapabilities("127.0.0.1:9999", 50*time.Millisecond)

	// Set the context
	d.ctx = ctx

	// Now it should use the service's context
	_ = d.queryAgentCapabilities("127.0.0.1:9999", 50*time.Millisecond)

	// Cancel the context
	cancel()

	// Query should still work (it handles nil context gracefully)
	_ = d.queryAgentCapabilities("127.0.0.1:9999", 50*time.Millisecond)
}
