package log

import (
	"bytes"
	"log"
	"strings"
	"testing"
)

func TestStdlibAdapter(t *testing.T) {
	var buf bytes.Buffer
	l := NewStdlibAdapter(log.New(&buf, "", 0))

	l.Info("hello world")
	if output := buf.String(); !strings.Contains(output, "[INFO] hello world") {
		t.Errorf("expected [INFO] hello world, got %q", output)
	}

	buf.Reset()
	l.Warn("something happened", "key", "value")
	if output := buf.String(); !strings.Contains(output, "[WARN] something happened key=value") {
		t.Errorf("expected key=value in output, got %q", output)
	}

	buf.Reset()
	l.Error("failure", "err", "timeout", "retries", 3)
	if output := buf.String(); !strings.Contains(output, "err=timeout retries=3") {
		t.Errorf("expected key=value pairs, got %q", output)
	}
}

func TestStdlibAdapterWith(t *testing.T) {
	var buf bytes.Buffer
	base := NewStdlibAdapter(log.New(&buf, "", 0))
	l := base.With("component", "scheduler", "trace_id", "abc-123")

	l.Info("task started", "task_id", "t1")
	output := buf.String()
	if !strings.Contains(output, "component=scheduler") {
		t.Errorf("expected component=scheduler in output, got %q", output)
	}
	if !strings.Contains(output, "trace_id=abc-123") {
		t.Errorf("expected trace_id in output, got %q", output)
	}
	if !strings.Contains(output, "task_id=t1") {
		t.Errorf("expected task_id=t1 in output, got %q", output)
	}
}

func TestStdlibAdapterWithChaining(t *testing.T) {
	var buf bytes.Buffer
	base := NewStdlibAdapter(log.New(&buf, "", 0))
	l1 := base.With("component", "scheduler")
	l2 := l1.With("agent_id", "a1")

	l2.Info("executing")
	output := buf.String()
	if !strings.Contains(output, "component=scheduler agent_id=a1") {
		t.Errorf("expected both fields, got %q", output)
	}

	// Original logger should not have agent_id
	buf.Reset()
	l1.Info("different")
	output = buf.String()
	if strings.Contains(output, "agent_id") {
		t.Errorf("original logger should not have agent_id, got %q", output)
	}
}

func TestStdlibAdapterOddKeyvals(t *testing.T) {
	var buf bytes.Buffer
	l := NewStdlibAdapter(log.New(&buf, "", 0))

	// Odd number of keyvals — trailing key should be included
	l.Info("test", "key1", "val1", "orphan")
	output := buf.String()
	if !strings.Contains(output, "key1=val1") {
		t.Errorf("expected key1=val1, got %q", output)
	}
	if !strings.Contains(output, "orphan") {
		t.Errorf("expected orphan trailing key, got %q", output)
	}
}

func TestNopLogger(t *testing.T) {
	n := NopLogger{}
	// Should not panic
	n.Debug("debug")
	n.Info("info")
	n.Warn("warn")
	n.Error("error")
	n2 := n.With("key", "value")
	n2.Info("should not appear")
}

func TestNopLoggerReturns(t *testing.T) {
	// Verify NopLogger methods return expected values
	n := NopLogger{}

	// With should return the same NopLogger
	n2 := n.With("key", "value")
	if n2 != n {
		t.Error("NopLogger.With should return itself")
	}

	// Test that all methods can be called without panic
	n.Debug("test", "key", "value")
	n.Info("test", "key", "value")
	n.Warn("test", "key", "value")
	n.Error("test", "key", "value")
}

func TestLevelString(t *testing.T) {
	tests := []struct {
		level    Level
		expected string
	}{
		{DebugLevel, "DEBUG"},
		{InfoLevel, "INFO"},
		{WarnLevel, "WARN"},
		{ErrorLevel, "ERROR"},
		{Level(999), "LEVEL(999)"},
	}

	for _, tt := range tests {
		t.Run(tt.expected, func(t *testing.T) {
			if got := tt.level.String(); got != tt.expected {
				t.Errorf("Level(%d).String() = %q, want %q", tt.level, got, tt.expected)
			}
		})
	}
}

func TestOutputFormat(t *testing.T) {
	// Save and restore level
	oldLevel := GetLevel()
	defer SetLevel(oldLevel)
	SetLevel(DebugLevel) // Enable all levels for this test

	var buf bytes.Buffer
	base := NewStdlibAdapter(log.New(&buf, "", 0))
	l := base.With("component", "Scheduler", "trace_id", "abc-123")

	l.Info("task started", "task_id", "t1", "agent_id", "a1")
	l.Warn("retry exceeded", "task_id", "t1", "retries", 5)
	l.Error("execution failed", "task_id", "t1", "error", "timeout after 30s")
	l.Debug("cache hit", "node_id", "n1")

	t.Logf("Output:\n%s", buf.String())

	// Verify structured fields are present
	output := buf.String()
	if !strings.Contains(output, "component=Scheduler") {
		t.Error("missing component field")
	}
	if !strings.Contains(output, "trace_id=abc-123") {
		t.Error("missing trace_id")
	}
	if !strings.Contains(output, "[INFO]") {
		t.Error("missing INFO level")
	}
	if !strings.Contains(output, "[WARN]") {
		t.Error("missing WARN level")
	}
	if !strings.Contains(output, "[ERROR]") {
		t.Error("missing ERROR level")
	}
	if !strings.Contains(output, "[DEBUG]") {
		t.Error("missing DEBUG level")
	}
	if !strings.Contains(output, "task_id=t1") {
		t.Error("missing task_id")
	}
	if !strings.Contains(output, "retries=5") {
		t.Error("missing retries")
	}
}

func TestSetDefault(t *testing.T) {
	// Save and restore
	old := global
	defer func() { global = old }()

	SetDefault(NopLogger{})
	if Default() != (NopLogger{}) {
		t.Error("expected NopLogger after SetDefault")
	}
}

func TestConvenienceFunctions(t *testing.T) {
	// Save and restore
	oldLevel := GetLevel()
	defer SetLevel(oldLevel)

	var buf bytes.Buffer
	SetDefault(NewStdlibAdapter(log.New(&buf, "", 0)))
	SetLevel(DebugLevel)

	// Test convenience functions
	Debug("debug message", "key", "debug-val")
	Info("info message", "key", "info-val")
	Warn("warn message", "key", "warn-val")
	Error("error message", "key", "error-val")

	output := buf.String()
	if !strings.Contains(output, "[DEBUG] debug message") {
		t.Error("missing debug message")
	}
	if !strings.Contains(output, "[INFO] info message") {
		t.Error("missing info message")
	}
	if !strings.Contains(output, "[WARN] warn message") {
		t.Error("missing warn message")
	}
	if !strings.Contains(output, "[ERROR] error message") {
		t.Error("missing error message")
	}

	// Test With convenience
	buf.Reset()
	logger := With("component", "test")
	logger.Info("with test")
	output = buf.String()
	if !strings.Contains(output, "component=test") {
		t.Error("missing component from With()")
	}
}

func TestConcurrency(t *testing.T) {
	var buf bytes.Buffer
	base := NewStdlibAdapter(log.New(&buf, "", 0))
	l := base.With("component", "stress")

	done := make(chan struct{})
	for i := 0; i < 100; i++ {
		go func(id int) {
			defer func() { done <- struct{}{} }()
			l.Info("concurrent", "id", id)
		}(i)
	}
	for i := 0; i < 100; i++ {
		<-done
	}

	// Should not panic
	output := buf.String()
	if !strings.Contains(output, "component=stress") {
		t.Error("missing component field")
	}
}

func TestLevelFiltering(t *testing.T) {
	// Save and restore level
	oldLevel := GetLevel()
	defer SetLevel(oldLevel)

	var buf bytes.Buffer
	base := NewStdlibAdapter(log.New(&buf, "", 0))

	// Test WarnLevel filtering
	SetLevel(WarnLevel)
	buf.Reset()
	base.Debug("debug msg")
	base.Info("info msg")
	base.Warn("warn msg")
	base.Error("error msg")

	output := buf.String()
	if strings.Contains(output, "debug msg") {
		t.Error("debug should be filtered at WarnLevel")
	}
	if strings.Contains(output, "info msg") {
		t.Error("info should be filtered at WarnLevel")
	}
	if !strings.Contains(output, "warn msg") {
		t.Error("warn should appear at WarnLevel")
	}
	if !strings.Contains(output, "error msg") {
		t.Error("error should appear at WarnLevel")
	}

	// Test ErrorLevel filtering
	SetLevel(ErrorLevel)
	buf.Reset()
	base.Debug("debug msg 2")
	base.Info("info msg 2")
	base.Warn("warn msg 2")
	base.Error("error msg 2")

	output = buf.String()
	if strings.Contains(output, "debug msg 2") || strings.Contains(output, "info msg 2") || strings.Contains(output, "warn msg 2") {
		t.Error("only error should appear at ErrorLevel")
	}
	if !strings.Contains(output, "error msg 2") {
		t.Error("error should appear at ErrorLevel")
	}

	// Test DebugLevel (all levels)
	SetLevel(DebugLevel)
	buf.Reset()
	base.Debug("debug msg 3")
	base.Info("info msg 3")
	base.Warn("warn msg 3")
	base.Error("error msg 3")

	output = buf.String()
	if !strings.Contains(output, "debug msg 3") || !strings.Contains(output, "info msg 3") || !strings.Contains(output, "warn msg 3") || !strings.Contains(output, "error msg 3") {
		t.Error("all levels should appear at DebugLevel")
	}
}

func TestLevelFilteringConcurrency(t *testing.T) {
	// Test concurrent SetLevel calls with concurrent logging
	oldLevel := GetLevel()
	defer SetLevel(oldLevel)

	var buf bytes.Buffer
	base := NewStdlibAdapter(log.New(&buf, "", 0))

	done := make(chan struct{})

	// Writer goroutines
	for i := 0; i < 50; i++ {
		go func(id int) {
			defer func() { done <- struct{}{} }()
			for j := 0; j < 10; j++ {
				base.Debug("debug", "id", id, "iter", j)
				base.Info("info", "id", id, "iter", j)
				base.Warn("warn", "id", id, "iter", j)
				base.Error("error", "id", id, "iter", j)
			}
		}(i)
	}

	// Level changer goroutines
	for i := 0; i < 5; i++ {
		go func() {
			defer func() { done <- struct{}{} }()
			for j := 0; j < 20; j++ {
				SetLevel(Level(j % 4))
			}
		}()
	}

	// Wait for all goroutines
	for i := 0; i < 55; i++ {
		<-done
	}

	// Should not panic or race
}
