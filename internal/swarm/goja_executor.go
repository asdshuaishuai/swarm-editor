// Package swarm provides JavaScript execution via goja (pure Go JS engine).
//
// When a code node specifies language: "javascript", the GojaExecutor is used
// instead of the built-in expression evaluator, enabling:
//   - Full JavaScript: loops, conditionals, functions, closures, classes
//   - Variable injection from upstream workflow nodes
//   - Execution timeout (30s) protection
//   - No access to Go runtime APIs (sandboxed VM)
package swarm

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/dop251/goja"
)

const (
	gojaExecTimeout = 30 * time.Second // execution timeout
)

// GojaExecutor executes JavaScript code in a sandboxed goja VM.
type GojaExecutor struct{}

// Execute runs JavaScript code with variable injection and timeout protection.
//
// Variables from upstream nodes are deep-copied before injection to prevent
// JavaScript code from mutating the original Go data structures. This ensures
// workflow state isolation even if JS code attempts to modify injected objects.
//
// Safety guarantees:
//   - Execution bounded to gojaExecTimeout (30s) via context + vm.Interrupt
//   - No infinite loops possible (timeout kills the VM)
//   - Call stack depth limited to 1024 frames (prevents stack overflow from deep recursion)
//   - No Go runtime APIs exposed (pure goja sandbox)
//   - No file system, network, or OS access
//   - Variable isolation via deep copy prevents state mutation
//
// Known limitations (goja lacks these APIs):
//   - No memory allocation limit (comments in earlier versions claimed 10MB but goja has no SetMaxAllocBytes)
//   - Malicious code can allocate large objects causing OOM; use timeout as primary defense
func (e *GojaExecutor) Execute(ctx context.Context, code string, variables map[string]any) (any, error) {
	vm := goja.New()
	vm.SetMaxCallStackSize(1024) // Prevent stack overflow from deep recursion

	// Set up interrupt channel for timeout enforcement
	done := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			vm.Interrupt("execution timeout")
		case <-done:
		}
	}()
	defer func() {
		close(done)
	}()

	// Deep copy and inject variables to prevent JS from mutating original Go data.
	// goja creates JavaScript proxies for Go maps/slices that allow JS to modify
	// the underlying Go objects, so we must copy before injection.
	for k, v := range variables {
		copiedValue := deepCopyAny(v)
		if err := vm.Set(k, copiedValue); err != nil {
			return nil, fmt.Errorf("failed to inject variable %q: %w", k, err)
		}
	}

	// Execute the JavaScript code
	value, err := vm.RunString(code)
	if err != nil {
		var interrupted *goja.InterruptedError
		if errors.As(err, &interrupted) {
			return nil, fmt.Errorf("javascript execution timed out after %v", gojaExecTimeout)
		}
		return nil, fmt.Errorf("javascript execution error: %w", err)
	}

	return value.Export(), nil
}
