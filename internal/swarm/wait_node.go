// Package swarm provides Wait/Delay Node for workflow execution.
// Inspired by n8n Wait Node and Temporal Sleep Activity:
//   - Fixed duration delay (seconds, minutes, hours)
//   - Wait until specific time
//   - Context-aware cancellation
//   - Max wait time limit for safety
package swarm

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"time"
)

const (
	// MaxWaitDuration limits the maximum wait time to prevent indefinite blocking.
	MaxWaitDuration = 24 * time.Hour
)

// WaitResult represents the output of a wait node.
type WaitResult struct {
	WaitedMs int64  `json:"waitedMs"`
	Waited   string `json:"waited"`
	Deadline string `json:"deadline,omitempty"`
	Cancelled bool  `json:"cancelled,omitempty"`
}

// ExecuteWaitNode pauses workflow execution for a specified duration.
//
// Config fields:
//   - duration (int): Wait time in seconds
//   - duration_ms (int): Wait time in milliseconds (takes precedence over duration)
//   - until (string): Wait until RFC3339 timestamp
//   - max_wait (int): Maximum wait time in seconds (default: 86400 = 24h)
//
// Only one of duration or until should be specified. If both are provided,
// duration takes precedence.
func ExecuteWaitNode(ctx context.Context, config map[string]any) (*WaitResult, error) {
	// Determine max wait time
	maxWait := getMaxWait(config)

	var waitDuration time.Duration
	var deadline time.Time
	var waitUntil bool

	// Check for duration_ms first (higher precision)
	if v, ok := config["duration_ms"]; ok {
		if ms, ok := toInt64(v); ok {
			waitDuration = time.Duration(ms) * time.Millisecond
		}
	}

	// Fall back to duration in seconds
	if waitDuration == 0 {
		if v, ok := config["duration"]; ok {
			if secs, ok := toInt64(v); ok {
				waitDuration = time.Duration(secs) * time.Second
			}
		}
	}

	// Check for wait until time
	if waitDuration == 0 {
		if v, ok := config["until"]; ok {
			if s, ok := v.(string); ok && s != "" {
				t, err := time.Parse(time.RFC3339, s)
				if err != nil {
					return nil, fmt.Errorf("wait node: invalid 'until' timestamp %q: %w", s, err)
				}
				deadline = t
				waitUntil = true
			}
		}
	}

	// No wait specified
	if waitDuration == 0 && deadline.IsZero() {
		return &WaitResult{
			WaitedMs: 0,
			Waited:   "0s",
		}, nil
	}

	// Calculate wait duration for "until" mode
	if waitUntil {
		now := time.Now()
		if deadline.Before(now) {
			return &WaitResult{
				WaitedMs: 0,
				Waited:   "0s",
				Deadline: deadline.Format(time.RFC3339),
			}, nil
		}
		waitDuration = deadline.Sub(now)
	}

	// Clamp to max wait time
	if waitDuration > maxWait {
		waitDuration = maxWait
	}

	// Clamp to minimum (1ms)
	if waitDuration < time.Millisecond {
		waitDuration = time.Millisecond
	}

	// Wait with context cancellation support
	start := time.Now()
	timer := time.NewTimer(waitDuration)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		elapsed := time.Since(start)
		return &WaitResult{
			WaitedMs:  elapsed.Milliseconds(),
			Waited:   elapsed.Truncate(time.Millisecond).String(),
			Deadline: formatDeadline(deadline, waitUntil),
			Cancelled: true,
		}, nil
	case <-timer.C:
		elapsed := time.Since(start)
		return &WaitResult{
			WaitedMs:  elapsed.Milliseconds(),
			Waited:   elapsed.Truncate(time.Millisecond).String(),
			Deadline: formatDeadline(deadline, waitUntil),
		}, nil
	}
}

// getMaxWait extracts the maximum wait time from config.
func getMaxWait(config map[string]any) time.Duration {
	if v, ok := config["max_wait"]; ok {
		if secs, ok := toInt64(v); ok && secs > 0 {
			// Cap at 24h to prevent Duration overflow (Duration is int64 nanoseconds)
			if secs > 86400 {
				secs = 86400
			}
			return time.Duration(secs) * time.Second
		}
	}
	return MaxWaitDuration
}

// formatDeadline returns the deadline string if applicable.
func formatDeadline(deadline time.Time, waitUntil bool) string {
	if waitUntil && !deadline.IsZero() {
		return deadline.Format(time.RFC3339)
	}
	return ""
}

// toInt64 converts a value to int64.
func toInt64(val any) (int64, bool) {
	switch v := val.(type) {
	case int:
		return int64(v), true
	case int64:
		return v, true
	case float64:
		if math.IsInf(v, 0) || math.IsNaN(v) {
			return 0, false
		}
		if v > float64(math.MaxInt64) || v < float64(math.MinInt64) {
			return 0, false // overflow
		}
		return int64(v), true
	case string:
		i, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			return 0, false
		}
		return i, true
	default:
		return 0, false
	}
}
