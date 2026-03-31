package utils

import (
	"errors"
	"os"
	"testing"
)

func TestAppError(t *testing.T) {
	err := NewAppError("not_found", "item not found")
	if err == nil {
		t.Fatal("expected error")
	}

	// Error() method returns the message
	if err.Error() != "item not found" {
		t.Errorf("expected 'item not found', got '%s'", err.Error())
	}

	// GetType returns the error type
	if err.GetType() != "not_found" {
		t.Errorf("expected error type 'not_found', got '%s'", err.GetType())
	}
}

func TestCommonErrors(t *testing.T) {
	commonErrors := []error{
		ErrNotFound,
		ErrAlreadyExists,
		ErrInvalidArg,
		ErrTimeout,
		ErrCanceled,
		ErrNotReady,
		ErrUnauthorized,
	}

	for _, err := range commonErrors {
		if err == nil {
			t.Error("common error should not be nil")
		}
		if err.Error() == "" {
			t.Error("common error should have a message")
		}
	}
}

func TestWrapError(t *testing.T) {
	original := errors.New("original error")
	wrapped := WrapError(original, "context")

	if wrapped == nil {
		t.Fatal("expected wrapped error")
	}

	if !errors.Is(wrapped, original) {
		t.Error("wrapped error should contain original")
	}

	// Test nil error
	nilWrapped := WrapError(nil, "context")
	if nilWrapped != nil {
		t.Error("wrapping nil should return nil")
	}
}

func TestWrapErrorf(t *testing.T) {
	original := errors.New("original error")
	wrapped := WrapErrorf(original, "operation %s failed", "test")

	if wrapped == nil {
		t.Fatal("expected wrapped error")
	}

	if !errors.Is(wrapped, original) {
		t.Error("wrapped error should contain original")
	}

	// Test nil error
	nilWrapped := WrapErrorf(nil, "context %s", "test")
	if nilWrapped != nil {
		t.Error("wrapping nil should return nil")
	}
}

func TestStackError(t *testing.T) {
	original := errors.New("original error")
	stackErr := NewStackError(original)

	if stackErr == nil {
		t.Fatal("expected stack error")
	}

	if stackErr.Error() != "original error" {
		t.Errorf("expected 'original error', got '%s'", stackErr.Error())
	}

	if stackErr.Unwrap() != original {
		t.Error("Unwrap should return original error")
	}

	if len(stackErr.Stack()) == 0 {
		t.Error("stack should have frames")
	}

	// Test nil error
	nilStack := NewStackError(nil)
	if nilStack != nil {
		t.Error("NewStackError with nil should return nil")
	}
}

func TestMultiError(t *testing.T) {
	multi := &MultiError{}

	if multi.HasErrors() {
		t.Error("empty MultiError should not have errors")
	}

	if multi.Error() != "" {
		t.Error("empty MultiError should return empty string")
	}

	multi.Add(errors.New("error 1"))
	multi.Add(errors.New("error 2"))

	if !multi.HasErrors() {
		t.Error("MultiError should have errors after Add")
	}

	if len(multi.Errors()) != 2 {
		t.Errorf("expected 2 errors, got %d", len(multi.Errors()))
	}

	if multi.Error() == "" {
		t.Error("MultiError should not return empty string")
	}
}

func TestMultiErrorToError(t *testing.T) {
	multi := &MultiError{}

	if multi.ToError() != nil {
		t.Error("empty MultiError should return nil")
	}

	multi.Add(errors.New("error"))
	if multi.ToError() == nil {
		t.Error("MultiError with errors should return error")
	}
}

func TestMultiErrorAddNil(t *testing.T) {
	multi := &MultiError{}
	multi.Add(nil)

	if multi.HasErrors() {
		t.Error("MultiError should not add nil errors")
	}
}

func TestIsAny(t *testing.T) {
	err := ErrNotFound

	if !IsAny(err, ErrNotFound, ErrTimeout) {
		t.Error("IsAny should find matching error")
	}

	if IsAny(err, ErrTimeout, ErrCanceled) {
		t.Error("IsAny should not find non-matching error")
	}
}

func TestAsAny(t *testing.T) {
	err := NewAppError("test", "test error")

	var appErr *AppError
	if !AsAny(err, &appErr) {
		t.Error("AsAny should cast to AppError")
	}

	if appErr.Message != "test error" {
		t.Errorf("expected 'test error', got '%s'", appErr.Message)
	}

	// Test failure case - no matching type
	var pathErr *os.PathError // non-matching type
	if AsAny(err, &pathErr) {
		t.Error("AsAny should return false for non-matching type")
	}
}
