// Package terminal provides PTY (pseudo-terminal) process management
// for spawning and controlling shell processes.
package terminal

import (
	"os"
	"os/exec"
	"sync"

	"github.com/creack/pty"
)

// WindowSize represents the terminal dimensions.
type WindowSize struct {
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

// Pty wraps a pseudo-terminal process with synchronized access.
type Pty struct {
	ptmx  *os.File
	cmd   *exec.Cmd
	pid   int
	mu    sync.Mutex
	alive bool
	cols  uint16
	rows  uint16
}

// NewPty creates a new PTY session with the given shell and working directory.
// If shell is empty, it defaults to $SHELL or /bin/bash.
func NewPty(shell string, initialDir string) (*Pty, error) {
	if shell == "" {
		shell = os.Getenv("SHELL")
		if shell == "" {
			shell = "/bin/bash"
		}
	}

	cmd := exec.Command(shell)
	if initialDir != "" {
		cmd.Dir = initialDir
	}
	cmd.Env = os.Environ()

	ptmx, err := pty.Start(cmd)
	if err != nil {
		return nil, err
	}

	ws, err := pty.GetsizeFull(ptmx)
	if err != nil {
		// If we can't read the size, use sensible defaults.
		ws = &pty.Winsize{Cols: 80, Rows: 24}
	}

	return &Pty{
		ptmx:  ptmx,
		cmd:   cmd,
		pid:   cmd.Process.Pid,
		alive: true,
		cols:  ws.Cols,
		rows:  ws.Rows,
	}, nil
}

// Pid returns the process ID of the shell running in the PTY.
func (p *Pty) Pid() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.pid
}

// Alive reports whether the PTY process is still running.
func (p *Pty) Alive() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.alive
}

// Read reads data from the PTY master side.
func (p *Pty) Read(buf []byte) (int, error) {
	return p.ptmx.Read(buf)
}

// Write writes data to the PTY master side.
func (p *Pty) Write(data []byte) (int, error) {
	return p.ptmx.Write(data)
}

// Resize changes the terminal dimensions.
func (p *Pty) Resize(cols, rows uint16) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if !p.alive {
		return os.ErrClosed
	}

	if err := pty.Setsize(p.ptmx, &pty.Winsize{Cols: cols, Rows: rows}); err != nil {
		return err
	}

	p.cols = cols
	p.rows = rows
	return nil
}

// WindowSize returns the current terminal dimensions.
func (p *Pty) WindowSize() WindowSize {
	p.mu.Lock()
	defer p.mu.Unlock()
	return WindowSize{Cols: p.cols, Rows: p.rows}
}

// Close terminates the PTY process and closes the file descriptor.
// It is safe to call multiple times.
func (p *Pty) Close() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if !p.alive {
		return nil
	}

	p.alive = false

	if p.cmd.Process != nil {
		p.cmd.Process.Kill()
	}
	if err := p.ptmx.Close(); err != nil {
		return err
	}

	return nil
}
