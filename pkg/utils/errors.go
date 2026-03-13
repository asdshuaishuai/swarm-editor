// Package utils provides common utilities for swarm-editor
package utils

import (
	"errors"
	"fmt"
	"runtime"
	"strings"
)

// Common errors
var (
	ErrNotFound      = errors.New("not found")
	ErrAlreadyExists = errors.New("already exists")
	ErrInvalidArg    = errors.New("invalid argument")
	ErrTimeout       = errors.New("timeout")
	ErrCanceled      = errors.New("canceled")
	ErrNotReady      = errors.New("not ready")
	ErrUnauthorized  = errors.New("unauthorized")
)

// AppError represents an application-level error with type and message
type AppError struct {
	Type    string `json:"error"`
	Message string `json:"message"`
}

// Error implements the error interface
func (e *AppError) Error() string {
	return e.Message
}

// GetType returns the error type
func (e *AppError) GetType() string {
	return e.Type
}

// NewAppError creates a new application error
func NewAppError(errorType, message string) *AppError {
	return &AppError{
		Type:    errorType,
		Message: message,
	}
}

// WrapError wraps an error with context information
func WrapError(err error, message string) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("%s: %w", message, err)
}

// WrapErrorf wraps an error with formatted context
func WrapErrorf(err error, format string, args ...interface{}) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("%s: %w", fmt.Sprintf(format, args...), err)
}

// StackError contains error with stack trace
type StackError struct {
	err   error
	stack []string
}

// Error implements error interface
func (e *StackError) Error() string {
	return e.err.Error()
}

// Unwrap implements errors.Unwrap
func (e *StackError) Unwrap() error {
	return e.err
}

// Stack returns the stack trace
func (e *StackError) Stack() []string {
	return e.stack
}

// NewStackError creates a new error with stack trace
func NewStackError(err error) *StackError {
	if err == nil {
		return nil
	}

	const depth = 32
	var pcs [depth]uintptr
	n := runtime.Callers(3, pcs[:])

	stack := make([]string, 0, n)
	frames := runtime.CallersFrames(pcs[:n])
	for {
		frame, more := frames.Next()
		if !strings.Contains(frame.File, "runtime/") {
			stack = append(stack, fmt.Sprintf("%s:%d %s", frame.File, frame.Line, frame.Function))
		}
		if !more {
			break
		}
	}

	return &StackError{err: err, stack: stack}
}

// MultiError combines multiple errors into one
type MultiError struct {
	errors []error
}

// Add adds an error to the multi-error
func (m *MultiError) Add(err error) {
	if err != nil {
		m.errors = append(m.errors, err)
	}
}

// Error implements error interface
func (m *MultiError) Error() string {
	if len(m.errors) == 0 {
		return ""
	}
	if len(m.errors) == 1 {
		return m.errors[0].Error()
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("%d errors: ", len(m.errors)))
	for i, err := range m.errors {
		if i > 0 {
			sb.WriteString("; ")
		}
		sb.WriteString(err.Error())
	}
	return sb.String()
}

// Errors returns all errors
func (m *MultiError) Errors() []error {
	return m.errors
}

// HasErrors returns true if there are any errors
func (m *MultiError) HasErrors() bool {
	return len(m.errors) > 0
}

// ToError returns the multi-error if there are errors, nil otherwise
func (m *MultiError) ToError() error {
	if len(m.errors) == 0 {
		return nil
	}
	return m
}

// IsAny checks if err is any of the targets
func IsAny(err error, targets ...error) bool {
	for _, target := range targets {
		if errors.Is(err, target) {
			return true
		}
	}
	return false
}

// AsAny checks if err can be cast to any of the target types
func AsAny(err error, targets ...interface{}) bool {
	for _, target := range targets {
		if errors.As(err, target) {
			return true
		}
	}
	return false
}
