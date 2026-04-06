package terminal

import (
	"strings"
	"testing"
	"time"
)

func TestNewPtySpawnsShell(t *testing.T) {
	p, err := NewPty("/bin/bash", "")
	if err != nil {
		t.Fatalf("NewPty failed: %v", err)
	}
	defer p.Close()

	if p.Pid() <= 0 {
		t.Errorf("expected Pid > 0, got %d", p.Pid())
	}
	if !p.Alive() {
		t.Error("expected Alive() to be true")
	}
}

func TestPtyWriteAndRead(t *testing.T) {
	p, err := NewPty("/bin/bash", "")
	if err != nil {
		t.Fatalf("NewPty failed: %v", err)
	}
	defer p.Close()

	marker := "hello_xterm_test"
	_, err = p.Write([]byte("echo " + marker + "\n"))
	if err != nil {
		t.Fatalf("Write failed: %v", err)
	}

	// Give the shell time to execute and produce output.
	time.Sleep(200 * time.Millisecond)

	buf := make([]byte, 4096)
	n, err := p.Read(buf)
	if err != nil {
		t.Fatalf("Read failed: %v", err)
	}

	output := string(buf[:n])
	if !strings.Contains(output, marker) {
		t.Errorf("expected output to contain %q, got %q", marker, output)
	}
}

func TestPtyResize(t *testing.T) {
	p, err := NewPty("/bin/bash", "")
	if err != nil {
		t.Fatalf("NewPty failed: %v", err)
	}
	defer p.Close()

	err = p.Resize(120, 40)
	if err != nil {
		t.Fatalf("Resize failed: %v", err)
	}

	ws := p.WindowSize()
	if ws.Cols != 120 {
		t.Errorf("expected Cols=120, got %d", ws.Cols)
	}
	if ws.Rows != 40 {
		t.Errorf("expected Rows=40, got %d", ws.Rows)
	}
}

func TestPtyClose(t *testing.T) {
	p, err := NewPty("/bin/bash", "")
	if err != nil {
		t.Fatalf("NewPty failed: %v", err)
	}

	if !p.Alive() {
		t.Error("expected Alive() true before Close")
	}

	err = p.Close()
	if err != nil {
		t.Fatalf("Close failed: %v", err)
	}

	if p.Alive() {
		t.Error("expected Alive() false after Close")
	}

	// Idempotent: second Close should not error.
	err = p.Close()
	if err != nil {
		t.Errorf("second Close should not error, got: %v", err)
	}
}
