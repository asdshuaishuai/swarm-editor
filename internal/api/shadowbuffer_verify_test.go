package api

import (
	"testing"
)

func TestPendingPatch_VerifyState(t *testing.T) {
	p := &PendingPatch{
		ID:          "test-1",
		VerifyState: VerifyPending,
	}
	if p.VerifyState != VerifyPending {
		t.Errorf("expected pending, got %s", p.VerifyState)
	}
}

func TestPendingPatch_VerifyErrors(t *testing.T) {
	p := &PendingPatch{
		VerifyState: VerifyFailed,
		VerifyErrors: []VerificationError{
			{File: "main.go", Line: 10, Message: "unused variable", Source: "go vet"},
		},
	}
	if len(p.VerifyErrors) != 1 {
		t.Fatalf("expected 1 error, got %d", len(p.VerifyErrors))
	}
	if p.VerifyErrors[0].Source != "go vet" {
		t.Errorf("expected 'go vet', got %s", p.VerifyErrors[0].Source)
	}
}

func TestVerificationState_Values(t *testing.T) {
	states := []VerificationState{VerifyPending, VerifyRunning, VerifyPassed, VerifyFailed, VerifyEscalated}
	for _, s := range states {
		if string(s) == "" {
			t.Error("verification state should not be empty")
		}
	}
}
