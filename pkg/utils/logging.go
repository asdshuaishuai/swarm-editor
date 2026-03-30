package utils

import (
	"context"
	"fmt"
	"io"
	"log"
	"maps"
	"os"
	"strings"
	"sync"
)

// LogLevel represents log severity
type LogLevel int

const (
	LogLevelDebug LogLevel = iota
	LogLevelInfo
	LogLevelWarn
	LogLevelError
)

// String returns the string representation of log level
func (l LogLevel) String() string {
	switch l {
	case LogLevelDebug:
		return "DEBUG"
	case LogLevelInfo:
		return "INFO"
	case LogLevelWarn:
		return "WARN"
	case LogLevelError:
		return "ERROR"
	default:
		return "UNKNOWN"
	}
}

// Logger provides structured logging
type Logger struct {
	mu     sync.Mutex
	level  LogLevel
	out    io.Writer
	prefix string
	fields map[string]any
}

// NewLogger creates a new logger
func NewLogger(out io.Writer, level LogLevel) *Logger {
	if out == nil {
		out = os.Stderr
	}
	return &Logger{
		level:  level,
		out:    out,
		fields: make(map[string]any),
	}
}

// DefaultLogger returns the default logger
var DefaultLogger = NewLogger(os.Stderr, LogLevelInfo)

// SetLevel sets the minimum log level
func (l *Logger) SetLevel(level LogLevel) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.level = level
}

// SetOutput sets the output writer
func (l *Logger) SetOutput(out io.Writer) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.out = out
}

// SetPrefix sets the log prefix
func (l *Logger) SetPrefix(prefix string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.prefix = prefix
}

// WithField returns a new logger with an added field
func (l *Logger) WithField(key string, value any) *Logger {
	l.mu.Lock()
	defer l.mu.Unlock()

	newFields := make(map[string]any, len(l.fields)+1)
	maps.Copy(newFields, l.fields)
	newFields[key] = value

	return &Logger{
		level:  l.level,
		out:    l.out,
		prefix: l.prefix,
		fields: newFields,
	}
}

// WithFields returns a new logger with added fields
func (l *Logger) WithFields(fields map[string]any) *Logger {
	l.mu.Lock()
	defer l.mu.Unlock()

	newFields := make(map[string]any, len(l.fields)+len(fields))
	maps.Copy(newFields, l.fields)
	maps.Copy(newFields, fields)

	return &Logger{
		level:  l.level,
		out:    l.out,
		prefix: l.prefix,
		fields: newFields,
	}
}

// WithContext returns a logger with context information
func (l *Logger) WithContext(ctx context.Context) *Logger {
	logger := l
	if requestID := GetRequestID(ctx); requestID != "" {
		logger = logger.WithField("request_id", requestID)
	}
	if sessionID := GetSessionID(ctx); sessionID != "" {
		logger = logger.WithField("session_id", sessionID)
	}
	if agentID := GetAgentID(ctx); agentID != "" {
		logger = logger.WithField("agent_id", agentID)
	}
	return logger
}

// log writes a log entry
func (l *Logger) log(level LogLevel, format string, args ...any) {
	if level < l.level {
		return
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	// Build log entry
	msg := fmt.Sprintf(format, args...)
	entry := fmt.Sprintf("[%s] %s", level.String(), msg)

	if l.prefix != "" {
		entry = l.prefix + " " + entry
	}

	// Add fields
	if len(l.fields) > 0 {
		var sb strings.Builder
		for k, v := range l.fields {
			sb.WriteString(" ")
			sb.WriteString(k)
			fmt.Fprintf(&sb, "=%v", v)
		}
		entry += sb.String()
	}

	fmt.Fprintln(l.out, entry)
}

// Debug logs a debug message
func (l *Logger) Debug(format string, args ...any) {
	l.log(LogLevelDebug, format, args...)
}

// Info logs an info message
func (l *Logger) Info(format string, args ...any) {
	l.log(LogLevelInfo, format, args...)
}

// Warn logs a warning message
func (l *Logger) Warn(format string, args ...any) {
	l.log(LogLevelWarn, format, args...)
}

// Error logs an error message
func (l *Logger) Error(format string, args ...any) {
	l.log(LogLevelError, format, args...)
}

// ErrorWithError logs an error with error value
func (l *Logger) ErrorWithError(err error, format string, args ...any) {
	l.log(LogLevelError, format+": %v", append(args, err)...)
}

// Fatal logs an error and exits
func (l *Logger) Fatal(format string, args ...any) {
	l.log(LogLevelError, format, args...)
	os.Exit(1)
}

// Package-level convenience functions

// Debug logs a debug message using default logger
func Debug(format string, args ...any) {
	DefaultLogger.Debug(format, args...)
}

// Info logs an info message using default logger
func Info(format string, args ...any) {
	DefaultLogger.Info(format, args...)
}

// Warn logs a warning message using default logger
func Warn(format string, args ...any) {
	DefaultLogger.Warn(format, args...)
}

// Error logs an error message using default logger
func Error(format string, args ...any) {
	DefaultLogger.Error(format, args...)
}

// Fatal logs an error and exits using default logger
func Fatal(format string, args ...any) {
	DefaultLogger.Fatal(format, args...)
}

// WithField returns a new logger with an added field using default logger
func WithField(key string, value any) *Logger {
	return DefaultLogger.WithField(key, value)
}

// WithFields returns a new logger with added fields using default logger
func WithFields(fields map[string]any) *Logger {
	return DefaultLogger.WithFields(fields)
}

// WithContext returns a logger with context using default logger
func WithContext(ctx context.Context) *Logger {
	return DefaultLogger.WithContext(ctx)
}

// SetLogLevel sets the default logger level
func SetLogLevel(level LogLevel) {
	DefaultLogger.SetLevel(level)
}

// init ensures standard log package uses our output
func init() {
	log.SetOutput(os.Stderr)
	log.SetFlags(0)
}
