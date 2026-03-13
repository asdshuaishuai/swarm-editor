package utils

import (
	"bytes"
	"context"
	"strings"
	"testing"
	"time"
)

func TestLogLevelString(t *testing.T) {
	tests := []struct {
		level    LogLevel
		expected string
	}{
		{LogLevelDebug, "DEBUG"},
		{LogLevelInfo, "INFO"},
		{LogLevelWarn, "WARN"},
		{LogLevelError, "ERROR"},
		{LogLevel(99), "UNKNOWN"},
	}

	for _, tt := range tests {
		if got := tt.level.String(); got != tt.expected {
			t.Errorf("LogLevel(%d).String() = %s, want %s", tt.level, got, tt.expected)
		}
	}
}

func TestNewLogger(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := NewLogger(buf, LogLevelInfo)

	if logger == nil {
		t.Fatal("logger should not be nil")
	}

	if logger.level != LogLevelInfo {
		t.Errorf("expected level %d, got %d", LogLevelInfo, logger.level)
	}
}

func TestLoggerSetLevel(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := NewLogger(buf, LogLevelInfo)

	logger.SetLevel(LogLevelDebug)
	if logger.level != LogLevelDebug {
		t.Errorf("expected level %d, got %d", LogLevelDebug, logger.level)
	}
}

func TestLoggerSetOutput(t *testing.T) {
	buf1 := &bytes.Buffer{}
	buf2 := &bytes.Buffer{}
	logger := NewLogger(buf1, LogLevelInfo)

	logger.SetOutput(buf2)
	logger.Info("test")

	if buf1.Len() > 0 {
		t.Error("original buffer should be empty")
	}
	if buf2.Len() == 0 {
		t.Error("new buffer should have content")
	}
}

func TestLoggerSetPrefix(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := NewLogger(buf, LogLevelInfo)

	logger.SetPrefix("[TEST]")
	logger.Info("message")

	if !strings.Contains(buf.String(), "[TEST]") {
		t.Error("output should contain prefix")
	}
}

func TestLoggerWithField(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := NewLogger(buf, LogLevelInfo)

	logger2 := logger.WithField("key", "value")
	if logger2 == nil {
		t.Fatal("WithField should return non-nil logger")
	}

	logger2.Info("test")

	output := buf.String()
	if !strings.Contains(output, "key=value") {
		t.Errorf("output should contain 'key=value', got: %s", output)
	}
}

func TestLoggerWithFields(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := NewLogger(buf, LogLevelInfo)

	fields := map[string]interface{}{
		"key1": "value1",
		"key2": 42,
	}

	logger2 := logger.WithFields(fields)
	logger2.Info("test")

	output := buf.String()
	if !strings.Contains(output, "key1=value1") {
		t.Errorf("output should contain 'key1=value1', got: %s", output)
	}
	if !strings.Contains(output, "key2=42") {
		t.Errorf("output should contain 'key2=42', got: %s", output)
	}
}

func TestLoggerLevelFiltering(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := NewLogger(buf, LogLevelWarn)

	logger.Debug("debug message")
	logger.Info("info message")
	logger.Warn("warn message")
	logger.Error("error message")

	output := buf.String()
	if strings.Contains(output, "debug message") {
		t.Error("debug should be filtered at Warn level")
	}
	if strings.Contains(output, "info message") {
		t.Error("info should be filtered at Warn level")
	}
	if !strings.Contains(output, "warn message") {
		t.Error("warn should be logged at Warn level")
	}
	if !strings.Contains(output, "error message") {
		t.Error("error should be logged at Warn level")
	}
}

func TestLoggerWithContext(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := NewLogger(buf, LogLevelInfo)

	ctx := context.Background()
	ctx = WithRequestID(ctx, "req-123")
	ctx = WithSessionID(ctx, "sess-456")
	ctx = WithAgentID(ctx, "agent-789")

	logger2 := logger.WithContext(ctx)
	logger2.Info("test")

	output := buf.String()
	if !strings.Contains(output, "request_id=req-123") {
		t.Errorf("output should contain request_id, got: %s", output)
	}
	if !strings.Contains(output, "session_id=sess-456") {
		t.Errorf("output should contain session_id, got: %s", output)
	}
	if !strings.Contains(output, "agent_id=agent-789") {
		t.Errorf("output should contain agent_id, got: %s", output)
	}
}

func TestLoggerInfo(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := NewLogger(buf, LogLevelInfo)

	logger.Info("test message")

	output := buf.String()
	if !strings.Contains(output, "[INFO]") {
		t.Error("output should contain [INFO]")
	}
	if !strings.Contains(output, "test message") {
		t.Error("output should contain message")
	}
}

func TestLoggerDebug(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := NewLogger(buf, LogLevelDebug)

	logger.Debug("debug message")

	output := buf.String()
	if !strings.Contains(output, "[DEBUG]") {
		t.Error("output should contain [DEBUG]")
	}
}

func TestLoggerWarn(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := NewLogger(buf, LogLevelInfo)

	logger.Warn("warning message")

	output := buf.String()
	if !strings.Contains(output, "[WARN]") {
		t.Error("output should contain [WARN]")
	}
}

func TestLoggerError(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := NewLogger(buf, LogLevelInfo)

	logger.Error("error message")

	output := buf.String()
	if !strings.Contains(output, "[ERROR]") {
		t.Error("output should contain [ERROR]")
	}
}

func TestLoggerFormattedOutput(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := NewLogger(buf, LogLevelInfo)

	logger.Info("formatted %s: %d", "count", 42)

	output := buf.String()
	if !strings.Contains(output, "formatted count: 42") {
		t.Errorf("output should contain formatted message, got: %s", output)
	}
}

// Package-level function tests
func TestPackageLevelFunctions(t *testing.T) {
	// Save original logger
	original := DefaultLogger
	defer func() { DefaultLogger = original }()

	// Set up test logger
	buf := &bytes.Buffer{}
	DefaultLogger = NewLogger(buf, LogLevelDebug)

	Debug("debug test")
	if !strings.Contains(buf.String(), "debug test") {
		t.Error("Debug should work")
	}

	buf.Reset()
	Info("info test")
	if !strings.Contains(buf.String(), "info test") {
		t.Error("Info should work")
	}

	buf.Reset()
	Warn("warn test")
	if !strings.Contains(buf.String(), "warn test") {
		t.Error("Warn should work")
	}

	buf.Reset()
	Error("error test")
	if !strings.Contains(buf.String(), "error test") {
		t.Error("Error should work")
	}
}

func TestSetLogLevel(t *testing.T) {
	original := DefaultLogger
	defer func() { DefaultLogger = original }()

	buf := &bytes.Buffer{}
	DefaultLogger = NewLogger(buf, LogLevelInfo)

	SetLogLevel(LogLevelDebug)
	if DefaultLogger.level != LogLevelDebug {
		t.Error("SetLogLevel should change default logger level")
	}
}

func TestPackageLevelWithField(t *testing.T) {
	original := DefaultLogger
	defer func() { DefaultLogger = original }()

	buf := &bytes.Buffer{}
	DefaultLogger = NewLogger(buf, LogLevelInfo)

	logger := WithField("test_key", "test_value")
	logger.Info("message")

	if !strings.Contains(buf.String(), "test_key=test_value") {
		t.Error("WithField should work at package level")
	}
}

func TestPackageLevelWithFields(t *testing.T) {
	original := DefaultLogger
	defer func() { DefaultLogger = original }()

	buf := &bytes.Buffer{}
	DefaultLogger = NewLogger(buf, LogLevelInfo)

	logger := WithFields(map[string]interface{}{"key": "value"})
	logger.Info("message")

	if !strings.Contains(buf.String(), "key=value") {
		t.Error("WithFields should work at package level")
	}
}

func TestPackageLevelWithContext(t *testing.T) {
	original := DefaultLogger
	defer func() { DefaultLogger = original }()

	buf := &bytes.Buffer{}
	DefaultLogger = NewLogger(buf, LogLevelInfo)

	ctx := context.Background()
	ctx = WithRequestID(ctx, "req-123")

	logger := WithContext(ctx)
	logger.Info("message")

	if !strings.Contains(buf.String(), "request_id=req-123") {
		t.Error("WithContext should work at package level")
	}
}

func TestLoggerConcurrent(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := NewLogger(buf, LogLevelInfo)

	// Test concurrent logging
	done := make(chan bool)
	for i := 0; i < 10; i++ {
		go func(n int) {
			for j := 0; j < 10; j++ {
				logger.Info("message %d-%d", n, j)
			}
			done <- true
		}(i)
	}

	// Wait for all goroutines
	for i := 0; i < 10; i++ {
		<-done
	}

	// Should not panic or race
}

func TestLoggerEmptyFields(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := NewLogger(buf, LogLevelInfo)

	// Logger with no fields
	logger.Info("no fields")
	output := buf.String()
	if !strings.Contains(output, "no fields") {
		t.Error("should log without fields")
	}
}

func TestLoggerNestedFields(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := NewLogger(buf, LogLevelInfo)

	logger2 := logger.WithField("key1", "value1")
	logger3 := logger2.WithField("key2", "value2")

	logger3.Info("nested")

	output := buf.String()
	if !strings.Contains(output, "key1=value1") {
		t.Error("should contain first field")
	}
	if !strings.Contains(output, "key2=value2") {
		t.Error("should contain second field")
	}
}

func TestLoggerElapsed(t *testing.T) {
	ctx := context.Background()
	ctx = WithStartTime(ctx, time.Now().Add(-50*time.Millisecond))

	elapsed := Elapsed(ctx)
	if elapsed < 40*time.Millisecond || elapsed > 100*time.Millisecond {
		t.Errorf("elapsed should be around 50ms, got %v", elapsed)
	}
}

func TestLoggerErrorWithError(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := NewLogger(buf, LogLevelInfo)

	testErr := context.Canceled
	logger.ErrorWithError(testErr, "operation failed")

	output := buf.String()
	if !strings.Contains(output, "[ERROR]") {
		t.Error("output should contain [ERROR]")
	}
	if !strings.Contains(output, "operation failed") {
		t.Error("output should contain message")
	}
	if !strings.Contains(output, "context canceled") {
		t.Error("output should contain error message")
	}
}

func TestLoggerErrorWithErrorWithArgs(t *testing.T) {
	buf := &bytes.Buffer{}
	logger := NewLogger(buf, LogLevelInfo)

	testErr := context.DeadlineExceeded
	logger.ErrorWithError(testErr, "task %s timed out", "upload")

	output := buf.String()
	if !strings.Contains(output, "task upload timed out") {
		t.Error("output should contain formatted message")
	}
	if !strings.Contains(output, "context deadline exceeded") {
		t.Error("output should contain error message")
	}
}
