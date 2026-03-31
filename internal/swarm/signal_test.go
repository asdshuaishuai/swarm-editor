package swarm

import (
	"context"
	"testing"
	"time"
)

func TestSignalBus_SendAndDrain(t *testing.T) {
	sb := NewSignalBus()

	sig := &Signal{
		Name:   "pause",
		Input:  "pause_reason",
		Source: "test",
	}

	err := sb.SendSignal("wf-1", sig)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if count := sb.GetPendingSignalCount("wf-1"); count != 1 {
		t.Errorf("expected 1 pending signal, got %d", count)
	}

	signals := sb.DrainSignals("wf-1")
	if len(signals) != 1 {
		t.Fatalf("expected 1 signal, got %d", len(signals))
	}
	if signals[0].Name != "pause" {
		t.Errorf("expected signal name 'pause', got %q", signals[0].Name)
	}

	// Drain should return empty after first drain
	signals = sb.DrainSignals("wf-1")
	if len(signals) != 0 {
		t.Errorf("expected 0 signals after drain, got %d", len(signals))
	}
}

func TestSignalBus_SendSignalValidation(t *testing.T) {
	sb := NewSignalBus()

	// Empty workflow ID
	err := sb.SendSignal("", &Signal{Name: "test"})
	if err == nil {
		t.Error("expected error for empty workflow ID")
	}

	// Nil signal
	err = sb.SendSignal("wf-1", nil)
	if err == nil {
		t.Error("expected error for nil signal")
	}

	// Empty name
	err = sb.SendSignal("wf-1", &Signal{Name: ""})
	if err == nil {
		t.Error("expected error for empty signal name")
	}

	// Auto-set timestamp - verify on stored copy, not caller's object
	// (MEDIUM fix: SendSignal deep copies to avoid data race on caller's mutable object)
	sig := &Signal{Name: "test"}
	if !sig.Timestamp.IsZero() {
		t.Error("timestamp should be zero before send")
	}
	sb.SendSignal("wf-2", sig)
	// Caller's signal should NOT be modified (deep copy pattern)
	if !sig.Timestamp.IsZero() {
		t.Error("caller's signal timestamp should NOT be modified - SendSignal uses deep copy")
	}
	// Stored signal should have timestamp set
	signals := sb.DrainSignals("wf-2")
	if len(signals) != 1 {
		t.Fatalf("expected 1 signal, got %d", len(signals))
	}
	if signals[0].Timestamp.IsZero() {
		t.Error("stored signal timestamp should be set after send")
	}
}

func TestSignalBus_MaxBufferedSignals(t *testing.T) {
	sb := NewSignalBus()
	sb.SetMaxBufferedSignals(3)

	for i := 0; i < 5; i++ {
		sb.SendSignal("wf-1", &Signal{Name: "sig", Input: i})
	}

	// Should only keep last 3
	if count := sb.GetPendingSignalCount("wf-1"); count != 3 {
		t.Errorf("expected 3 buffered signals (max), got %d", count)
	}

	signals := sb.DrainSignals("wf-1")
	// Check that the first two were dropped (we sent 0,1,2,3,4, kept 2,3,4)
	if len(signals) != 3 {
		t.Fatalf("expected 3 signals, got %d", len(signals))
	}
	if signals[0].Input != 2 {
		t.Errorf("expected first buffered signal input to be 2, got %v", signals[0].Input)
	}
}

func TestSignalBus_SetMaxBufferedSignals_EdgeCases(t *testing.T) {
	sb := NewSignalBus()

	// Zero should default to 1
	sb.SetMaxBufferedSignals(0)
	sb.SendSignal("wf-1", &Signal{Name: "a"})
	sb.SendSignal("wf-1", &Signal{Name: "b"})
	if count := sb.GetPendingSignalCount("wf-1"); count != 1 {
		t.Errorf("expected 1 buffered signal (max=0→1), got %d", count)
	}
	sb.DrainSignals("wf-1")

	// Negative should default to 1
	sb.SetMaxBufferedSignals(-5)
	sb.SendSignal("wf-1", &Signal{Name: "c"})
	sb.SendSignal("wf-1", &Signal{Name: "d"})
	if count := sb.GetPendingSignalCount("wf-1"); count != 1 {
		t.Errorf("expected 1 buffered signal (max=-5→1), got %d", count)
	}
}

func TestSignalBus_ProcessSignals(t *testing.T) {
	sb := NewSignalBus()

	handlerCalled := false
	sb.RegisterSignalHandler("pause", func(ctx context.Context, w *Workflow, sig *Signal) error {
		handlerCalled = true
		return nil
	})

	// Send signal
	sb.SendSignal("wf-1", &Signal{Name: "pause"})

	// Process signals (no workflow needed, handler doesn't use it)
	w := &Workflow{ID: "wf-1"}

	err := sb.ProcessSignals(context.Background(), w)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !handlerCalled {
		t.Error("signal handler should have been called")
	}
}

func TestSignalBus_ProcessSignals_NoSignals(t *testing.T) {
	sb := NewSignalBus()

	w := &Workflow{ID: "wf-1"}

	err := sb.ProcessSignals(context.Background(), w)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestSignalBus_Query(t *testing.T) {
	sb := NewSignalBus()

	sb.RegisterQueryHandler("status", func(ctx context.Context, w *Workflow, req *QueryRequest) (*QueryResponse, error) {
		return &QueryResponse{
			Result: map[string]string{"status": w.Status},
		}, nil
	})

	w := &Workflow{ID: "wf-1", Status: "running"}

	resp, err := sb.Query(context.Background(), w, &QueryRequest{QueryType: "status"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp == nil {
		t.Fatal("expected non-nil response")
	}
	if resp.Timestamp.IsZero() {
		t.Error("timestamp should be set")
	}
}

func TestSignalBus_Query_UnknownType(t *testing.T) {
	sb := NewSignalBus()

	w := &Workflow{ID: "wf-1"}
	resp, err := sb.Query(context.Background(), w, &QueryRequest{QueryType: "unknown"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Error == "" {
		t.Error("expected error for unknown query type")
	}
}

func TestSignalBus_Query_Validation(t *testing.T) {
	sb := NewSignalBus()

	_, err := sb.Query(context.Background(), nil, &QueryRequest{QueryType: "test"})
	if err == nil {
		t.Error("expected error for nil workflow")
	}

	_, err = sb.Query(context.Background(), &Workflow{}, nil)
	if err == nil {
		t.Error("expected error for nil request")
	}

	_, err = sb.Query(context.Background(), &Workflow{}, &QueryRequest{})
	if err == nil {
		t.Error("expected error for empty query type")
	}
}

func TestOrchestrator_GetSignalBus(t *testing.T) {
	orch := NewOrchestrator(nil)
	bus := orch.GetSignalBus()

	if bus == nil {
		t.Fatal("expected non-nil signal bus")
	}

	// Send a signal
	bus.SendSignal("test", &Signal{Name: "test"})
	if count := bus.GetPendingSignalCount("test"); count != 1 {
		t.Errorf("expected 1 pending signal, got %d", count)
	}
}

func TestSignalBus_PeekSignals(t *testing.T) {
	sb := NewSignalBus()
	sb.SendSignal("wf1", &Signal{Name: "sig1"})
	sb.SendSignal("wf1", &Signal{Name: "sig2"})

	// Peek should return copy without removing
	peeked := sb.PeekSignals("wf1")
	if len(peeked) != 2 {
		t.Fatalf("expected 2 peeked signals, got %d", len(peeked))
	}

	// Original should still be there
	if count := sb.GetPendingSignalCount("wf1"); count != 2 {
		t.Errorf("expected 2 pending after peek, got %d", count)
	}

	// Drain should still work
	drained := sb.DrainSignals("wf1")
	if len(drained) != 2 {
		t.Errorf("expected 2 drained signals, got %d", len(drained))
	}
	if sb.GetPendingSignalCount("wf1") != 0 {
		t.Error("expected 0 pending after drain")
	}
}

func TestSignalBus_RemoveSignal(t *testing.T) {
	sb := NewSignalBus()
	sb.SendSignal("wf1", &Signal{Name: "sig1"})
	sb.SendSignal("wf1", &Signal{Name: "sig2"})
	sb.SendSignal("wf1", &Signal{Name: "sig3"})

	// Remove middle signal
	removed := sb.RemoveSignal("wf1", "sig2")
	if !removed {
		t.Error("expected sig2 to be removed")
	}

	// Verify remaining signals
	if count := sb.GetPendingSignalCount("wf1"); count != 2 {
		t.Errorf("expected 2 remaining, got %d", count)
	}

	// Remove non-existent
	removed = sb.RemoveSignal("wf1", "nonexistent")
	if removed {
		t.Error("expected false for non-existent signal")
	}
}

func TestSignal_DeepCopy_Nil(t *testing.T) {
	var s *Signal
	cp := s.DeepCopy()
	if cp != nil {
		t.Error("expected nil for nil input")
	}
}

func TestSignal_DeepCopy_Simple(t *testing.T) {
	now := time.Now()
	s := &Signal{
		Name:      "test-signal",
		Input:     "simple-string",
		Timestamp: now,
		Source:    "external",
	}
	cp := s.DeepCopy()

	if cp.Name != "test-signal" {
		t.Errorf("Name = %q, want 'test-signal'", cp.Name)
	}
	if cp.Input != "simple-string" {
		t.Errorf("Input = %q, want 'simple-string'", cp.Input)
	}
	if cp.Source != "external" {
		t.Errorf("Source = %q, want 'external'", cp.Source)
	}
	if !cp.Timestamp.Equal(now) {
		t.Error("Timestamp should match")
	}
}

func TestSignal_DeepCopy_MapInput(t *testing.T) {
	s := &Signal{
		Name:  "map-signal",
		Input: map[string]any{"key": "value", "nested": map[string]any{"inner": 42}},
	}
	cp := s.DeepCopy()

	// Verify values
	inputMap := cp.Input.(map[string]any)
	if inputMap["key"] != "value" {
		t.Error("key should be copied")
	}

	// Verify independence
	originalMap := s.Input.(map[string]any)
	originalMap["key"] = "modified"
	originalMap["nested"].(map[string]any)["inner"] = 99

	cpMap := cp.Input.(map[string]any)
	if cpMap["key"] == "modified" {
		t.Error("map input should be deep copied")
	}
	if cpMap["nested"].(map[string]any)["inner"] == 99 {
		t.Error("nested map should be deep copied")
	}
}

func TestSignal_DeepCopy_NilInput(t *testing.T) {
	s := &Signal{
		Name:  "nil-input",
		Input: nil,
	}
	cp := s.DeepCopy()
	if cp.Input != nil {
		t.Error("nil Input should remain nil")
	}
}

func TestSignal_DeepCopy_SliceInput(t *testing.T) {
	s := &Signal{
		Name:  "slice-signal",
		Input: []any{1, 2, 3},
	}
	cp := s.DeepCopy()
	cpSlice := cp.Input.([]any)
	if len(cpSlice) != 3 {
		t.Errorf("slice len = %d, want 3", len(cpSlice))
	}

	// Verify independence
	s.Input.([]any)[0] = 999
	if cpSlice[0] == 999 {
		t.Error("slice input should be deep copied")
	}
}
