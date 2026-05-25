package api

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestNewVerifier(t *testing.T) {
	v := NewVerifier("/tmp")
	if v.workspacePath != "/tmp" {
		t.Errorf("expected /tmp, got %s", v.workspacePath)
	}
	if len(v.linters) == 0 {
		t.Error("expected default linters to be configured")
	}
}

func TestVerifier_NoLinterForUnknownExt(t *testing.T) {
	v := NewVerifier(t.TempDir())
	result := v.Verify(context.Background(), "readme.xyz")
	if result.State != VerifyPassed {
		t.Errorf("expected passed for unknown ext, got %s", result.State)
	}
}

func TestVerifier_GoVet(t *testing.T) {
	dir := t.TempDir()
	goFile := filepath.Join(dir, "main.go")
	content := "package main\n\nfunc main() {}\n"
	if err := os.WriteFile(goFile, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	v := NewVerifier(dir)
	result := v.Verify(context.Background(), goFile)
	t.Logf("result: state=%s errors=%d", result.State, len(result.Errors))
}

func TestParseLinterLine_GoVet(t *testing.T) {
	ve := parseLinterLine("go vet", "main.go:10: unreachable code")
	if ve == nil {
		t.Fatal("expected non-nil")
	}
	if ve.Line != 10 {
		t.Errorf("expected line 10, got %d", ve.Line)
	}
	if ve.Source != "go vet" {
		t.Errorf("expected 'go vet', got %s", ve.Source)
	}
}

func TestParseLinterLine_Empty(t *testing.T) {
	ve := parseLinterLine("go vet", "")
	if ve != nil {
		t.Error("expected nil for empty line")
	}
}

func TestParseLinterLine_NoLineNum(t *testing.T) {
	ve := parseLinterLine("go vet", "some random text without colons")
	if ve == nil {
		t.Fatal("expected non-nil fallback")
	}
	if ve.Source != "go vet" {
		t.Errorf("expected 'go vet', got %s", ve.Source)
	}
	if ve.Message != "some random text without colons" {
		t.Errorf("unexpected message: %s", ve.Message)
	}
}

func TestParseLinterOutput_MultiLine(t *testing.T) {
	output := "main.go:5: undefined: foo\nmain.go:8: unused variable\n"
	errors := parseLinterOutput("go vet", "main.go", output)
	if len(errors) != 2 {
		t.Fatalf("expected 2 errors, got %d", len(errors))
	}
	if errors[0].Line != 5 {
		t.Errorf("expected line 5, got %d", errors[0].Line)
	}
	if errors[1].Line != 8 {
		t.Errorf("expected line 8, got %d", errors[1].Line)
	}
}

func TestParseLinterOutput_Empty(t *testing.T) {
	errors := parseLinterOutput("go vet", "main.go", "")
	if len(errors) != 0 {
		t.Errorf("expected 0 errors, got %d", len(errors))
	}
}

func TestParseLinterOutput_SingleLine(t *testing.T) {
	errors := parseLinterOutput("go vet", "main.go", "main.go:3: syntax error\n")
	if len(errors) != 1 {
		t.Fatalf("expected 1 error, got %d", len(errors))
	}
	if errors[0].Line != 3 {
		t.Errorf("expected line 3, got %d", errors[0].Line)
	}
}
