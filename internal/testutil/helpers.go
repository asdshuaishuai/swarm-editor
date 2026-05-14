// Package testutil provides shared test utilities.
// Patterns adopted from nats-io/nats.go and hashicorp/raft.
package testutil

import (
	"runtime"
	"testing"
	"time"
)

// Wait waits for the channel to receive a value within the default timeout.
// Pattern from nats-io/nats.go test/helper_test.go
func Wait(ch chan bool) bool {
	return WaitTime(ch, 5*time.Second)
}

// WaitTime waits for the channel to receive a value within the specified timeout.
func WaitTime(ch chan bool, timeout time.Duration) bool {
	select {
	case <-ch:
		return true
	case <-time.After(timeout):
		return false
	}
}

// StackFatalf is like t.Fatalf but includes the full goroutine stack trace.
// Critical for debugging failures in concurrent tests.
// Pattern from nats-io/nats.go.
func StackFatalf(t testing.TB, f string, args ...any) {
	t.Helper()
	buf := make([]byte, 1024*1024) // 1MB buffer for large stacks
	n := runtime.Stack(buf, true)
	t.Fatalf(f+"\n\nGoroutine stack:\n%s", append(args, string(buf[:n]))...)
}

// CheckErrChannel non-blocking checks an error channel.
// Returns the error if one was sent, nil otherwise.
func CheckErrChannel(errCh chan error) error {
	select {
	case err := <-errCh:
		return err
	default:
		return nil
	}
}

// WaitOnChannel waits for a channel to receive an expected value.
// Generic version from nats-io/nats.go pattern.
func WaitOnChannel[T comparable](t testing.TB, ch <-chan T, expected T, timeout time.Duration) {
	t.Helper()
	select {
	case got := <-ch:
		if got != expected {
			t.Fatalf("expected %v, got %v", expected, got)
		}
	case <-time.After(timeout):
		t.Fatalf("timeout waiting for %v on channel", expected)
	}
}

// Eventually waits for a condition to become true, polling at the given interval.
// Useful for async/concurrent tests where exact timing is unknown.
func Eventually(t testing.TB, condition func() bool, waitFor time.Duration, tick time.Duration) {
	t.Helper()
	deadline := time.Now().Add(waitFor)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(tick)
	}
	t.Fatalf("condition never became true within %v", waitFor)
}

// Never asserts that a condition never becomes true within the duration.
func Never(t testing.TB, condition func() bool, waitFor time.Duration, tick time.Duration) {
	t.Helper()
	deadline := time.Now().Add(waitFor)
	for time.Now().Before(deadline) {
		if condition() {
			t.Fatalf("condition became true unexpectedly")
		}
		time.Sleep(tick)
	}
}
