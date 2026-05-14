// Package log provides a minimal structured logging interface inspired by
// Temporal SDK (go.temporal.io/sdk) and Grafana Alloy (github.com/grafana/alloy).
//
// Design goals:
//   - Interface-based: swap implementations without code changes
//   - Key-value pairs: structured fields via With() and per-call keyvals
//   - Zero migration cost: StdlibAdapter wraps log.Printf for existing code
//   - Future-proof: slog/zap adapters can be added later
//
// Usage:
//
//	logger := log.Default()
//	logger = logger.With("component", "scheduler")
//	logger.Info("task started", "task_id", taskID, "agent_id", agentID)
package log

import (
	"fmt"
	"log"
	"os"
	"sync"
)

// Level represents a log severity level.
type Level int

const (
	// DebugLevel logs are typically voluminous, and are usually disabled in production.
	DebugLevel Level = iota
	// InfoLevel is the default logging priority.
	InfoLevel
	// WarnLevel logs are more important than Info, but don't need individual human review.
	WarnLevel
	// ErrorLevel logs are high-priority. If an application is running smoothly, it shouldn't generate any error-level logs.
	ErrorLevel
)

// String returns the string representation of the level.
func (l Level) String() string {
	switch l {
	case DebugLevel:
		return "DEBUG"
	case InfoLevel:
		return "INFO"
	case WarnLevel:
		return "WARN"
	case ErrorLevel:
		return "ERROR"
	default:
		return fmt.Sprintf("LEVEL(%d)", l)
	}
}

// Logger is the core logging interface. Inspired by Temporal's Logger and
// go-kit/log's key-value pair style.
//
// All methods accept alternating key-value pairs for structured fields.
// Implementations should handle odd-length keyvals gracefully (ignore trailing key).
type Logger interface {
	// Debug logs a debug-level message with optional key-value pairs.
	Debug(msg string, keyvals ...any)

	// Info logs an info-level message with optional key-value pairs.
	Info(msg string, keyvals ...any)

	// Warn logs a warning-level message with optional key-value pairs.
	Warn(msg string, keyvals ...any)

	// Error logs an error-level message with optional key-value pairs.
	Error(msg string, keyvals ...any)

	// With returns a new Logger with the given key-value pairs attached to all future log output.
	// The returned Logger shares no state with the original.
	With(keyvals ...any) Logger
}

// global is the package-level default logger. Uses sync.Once for thread-safe init.
var (
	global       Logger
	globalOnce   sync.Once
	globalMu     sync.RWMutex // protects global after init
	globalLevel  Level        = InfoLevel
	globalLevelMu sync.RWMutex
)

// Default returns the package-level default logger.
// On first call, initializes with a StdlibAdapter wrapping os.Stderr.
func Default() Logger {
	globalOnce.Do(func() {
		global = NewStdlibAdapter(log.New(os.Stderr, "", log.LstdFlags|log.Lmsgprefix))
	})
	globalMu.RLock()
	defer globalMu.RUnlock()
	return global
}

// SetDefault replaces the package-level default logger.
// This must be called before any logging occurs, typically in main().
func SetDefault(l Logger) {
	globalOnce.Do(func() {}) // ensure init has run
	globalMu.Lock()
	global = l
	globalMu.Unlock()
}

// SetLevel sets the minimum log level for the package-level logger.
// Logs below this level are discarded. Default is InfoLevel.
func SetLevel(level Level) {
	globalLevelMu.Lock()
	globalLevel = level
	globalLevelMu.Unlock()
}

// GetLevel returns the current minimum log level.
func GetLevel() Level {
	globalLevelMu.RLock()
	defer globalLevelMu.RUnlock()
	return globalLevel
}

// shouldLog returns true if the given level should be logged.
func shouldLog(level Level) bool {
	globalLevelMu.RLock()
	defer globalLevelMu.RUnlock()
	return level >= globalLevel
}

// Debug is a convenience function that calls Default().Debug.
func Debug(msg string, keyvals ...any) { Default().Debug(msg, keyvals...) }

// Info is a convenience function that calls Default().Info.
func Info(msg string, keyvals ...any) { Default().Info(msg, keyvals...) }

// Warn is a convenience function that calls Default().Warn.
func Warn(msg string, keyvals ...any) { Default().Warn(msg, keyvals...) }

// Error is a convenience function that calls Default().Error.
func Error(msg string, keyvals ...any) { Default().Error(msg, keyvals...) }

// With is a convenience function that calls Default().With.
func With(keyvals ...any) Logger { return Default().With(keyvals...) }

// StdlibAdapter wraps a standard library *log.Logger to implement Logger.
// This provides zero-cost migration — existing log.Printf calls continue to work
// while new code can use the structured interface.
//
// Output format: [LEVEL] prefix message key1=val1 key2=val2
type StdlibAdapter struct {
	logger *log.Logger
	prefix string
	fields []any
	mu     sync.Mutex
}

// NewStdlibAdapter creates a Logger backed by the standard library.
func NewStdlibAdapter(l *log.Logger) *StdlibAdapter {
	return &StdlibAdapter{logger: l}
}

// Debug implements Logger.
func (a *StdlibAdapter) Debug(msg string, keyvals ...any) {
	if !shouldLog(DebugLevel) {
		return
	}
	a.log("DEBUG", msg, keyvals)
}

// Info implements Logger.
func (a *StdlibAdapter) Info(msg string, keyvals ...any) {
	if !shouldLog(InfoLevel) {
		return
	}
	a.log("INFO", msg, keyvals)
}

// Warn implements Logger.
func (a *StdlibAdapter) Warn(msg string, keyvals ...any) {
	if !shouldLog(WarnLevel) {
		return
	}
	a.log("WARN", msg, keyvals)
}

// Error implements Logger.
func (a *StdlibAdapter) Error(msg string, keyvals ...any) {
	if !shouldLog(ErrorLevel) {
		return
	}
	a.log("ERROR", msg, keyvals)
}

// With implements Logger. Returns a new adapter with appended fields.
func (a *StdlibAdapter) With(keyvals ...any) Logger {
	return &StdlibAdapter{
		logger: a.logger,
		prefix: a.prefix,
		fields: appendFields(a.fields, keyvals),
	}
}

func (a *StdlibAdapter) log(level, msg string, keyvals []any) {
	a.mu.Lock()
	defer a.mu.Unlock()

	allFields := appendFields(a.fields, keyvals)
	var formatted string
	if a.prefix != "" {
		formatted = fmt.Sprintf("[%s] %s %s", level, a.prefix, msg)
	} else {
		formatted = fmt.Sprintf("[%s] %s", level, msg)
	}
	for i := 0; i+1 < len(allFields); i += 2 {
		formatted += fmt.Sprintf(" %v=%v", allFields[i], allFields[i+1])
	}
	if len(allFields)%2 != 0 {
		formatted += fmt.Sprintf(" %v", allFields[len(allFields)-1])
	}
	a.logger.Printf("%s", formatted)
}

// appendFields appends new keyvals to existing fields, returning a new slice.
// Always copies to prevent shared backing arrays between parent/child loggers.
func appendFields(existing, newFields []any) []any {
	result := make([]any, len(existing), len(existing)+len(newFields))
	copy(result, existing)
	return append(result, newFields...)
}

// NopLogger is a Logger that discards all output. Useful for tests.
type NopLogger struct{}

// Debug implements Logger.
func (NopLogger) Debug(string, ...any) {}

// Info implements Logger.
func (NopLogger) Info(string, ...any) {}

// Warn implements Logger.
func (NopLogger) Warn(string, ...any) {}

// Error implements Logger.
func (NopLogger) Error(string, ...any) {}

// With implements Logger.
func (n NopLogger) With(...any) Logger { return n }
