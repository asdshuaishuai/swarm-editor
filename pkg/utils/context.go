package utils

import (
	"context"
	"time"
)

// ContextWithTimeout creates a context with timeout, handling zero/negative durations
func ContextWithTimeout(parent context.Context, timeout time.Duration) (context.Context, context.CancelFunc) {
	if timeout <= 0 {
		// No timeout - return a cancelable context
		return context.WithCancel(parent)
	}
	return context.WithTimeout(parent, timeout)
}

// ContextWithDeadline creates a context with deadline, handling zero time
func ContextWithDeadline(parent context.Context, deadline time.Time) (context.Context, context.CancelFunc) {
	if deadline.IsZero() {
		return context.WithCancel(parent)
	}
	return context.WithDeadline(parent, deadline)
}

// MergeContexts creates a context that is cancelled when either parent is cancelled.
// IMPORTANT: The returned cancel function MUST be called to prevent goroutine leaks
// if neither parent context will be cancelled during the lifetime of the program.
func MergeContexts(ctx1, ctx2 context.Context) (context.Context, context.CancelFunc) {
	ctx, cancel := context.WithCancel(ctx1)

	go func() {
		defer func() {
			if r := recover(); r != nil {
				// Panic in context merging is unusual but we must still call cancel
				// to prevent context leak
				cancel()
			}
		}()
		select {
		case <-ctx1.Done():
			cancel()
		case <-ctx2.Done():
			cancel()
		case <-ctx.Done():
			// Caller cancelled via the returned cancel func
		}
	}()

	return ctx, cancel
}

// ContextWithValue is a type-safe helper for context values
func ContextWithValue(parent context.Context, key string, value any) context.Context {
	return context.WithValue(parent, contextKey(key), value)
}

// ValueFromContext retrieves a typed value from context
func ValueFromContext[T any](ctx context.Context, key string) (T, bool) {
	var zero T
	val := ctx.Value(contextKey(key))
	if val == nil {
		return zero, false
	}
	typed, ok := val.(T)
	return typed, ok
}

type contextKey string

// Context keys
const (
	ContextKeyRequestID  contextKey = "requestID"
	ContextKeySessionID  contextKey = "sessionID"
	ContextKeyAgentID    contextKey = "agentID"
	ContextKeyUserID     contextKey = "userID"
	ContextKeyTraceID    contextKey = "traceID"
	ContextKeyStartTime  contextKey = "startTime"
	ContextKeyMiddleware contextKey = "middleware"
)

// WithRequestID adds request ID to context
func WithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, ContextKeyRequestID, id)
}

// GetRequestID retrieves request ID from context
func GetRequestID(ctx context.Context) string {
	if id, ok := ctx.Value(ContextKeyRequestID).(string); ok {
		return id
	}
	return ""
}

// WithSessionID adds session ID to context
func WithSessionID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, ContextKeySessionID, id)
}

// GetSessionID retrieves session ID from context
func GetSessionID(ctx context.Context) string {
	if id, ok := ctx.Value(ContextKeySessionID).(string); ok {
		return id
	}
	return ""
}

// WithAgentID adds agent ID to context
func WithAgentID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, ContextKeyAgentID, id)
}

// GetAgentID retrieves agent ID from context
func GetAgentID(ctx context.Context) string {
	if id, ok := ctx.Value(ContextKeyAgentID).(string); ok {
		return id
	}
	return ""
}

// WithStartTime adds start time to context
func WithStartTime(ctx context.Context, t time.Time) context.Context {
	return context.WithValue(ctx, ContextKeyStartTime, t)
}

// GetStartTime retrieves start time from context
func GetStartTime(ctx context.Context) time.Time {
	if t, ok := ctx.Value(ContextKeyStartTime).(time.Time); ok {
		return t
	}
	return time.Time{}
}

// Elapsed returns time elapsed since start time in context
func Elapsed(ctx context.Context) time.Duration {
	start := GetStartTime(ctx)
	if start.IsZero() {
		return 0
	}
	return time.Since(start)
}
