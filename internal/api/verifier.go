package api

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// LinterConfig defines a linter command for a file type.
type LinterConfig struct {
	Name      string
	Command   string
	Args      []string
	Timeout   time.Duration
	FileTypes []string
}

// VerifyResult holds the outcome of a verification run.
type VerifyResult struct {
	State  VerificationState
	Errors []VerificationError
}

// Verifier runs lint/compile checks after patch commit.
type Verifier struct {
	workspacePath string
	linters       map[string][]LinterConfig
}

// NewVerifier creates a verifier with default linter configs.
func NewVerifier(workspacePath string) *Verifier {
	return &Verifier{
		workspacePath: workspacePath,
		linters:       defaultLinters(),
	}
}

func defaultLinters() map[string][]LinterConfig {
	return map[string][]LinterConfig{
		".go": {
			{
				Name:    "go vet",
				Command: "go",
				Args:    []string{"vet", "./..."},
				Timeout: 30 * time.Second,
			},
		},
		".ts": {
			{
				Name:    "tsc",
				Command: "npx",
				Args:    []string{"tsc", "--noEmit"},
				Timeout: 30 * time.Second,
			},
		},
		".py": {
			{
				Name:    "pylint",
				Command: "pylint",
				Args:    []string{"--output-format=text"},
				Timeout: 30 * time.Second,
			},
		},
	}
}

// Verify runs linters matching the given file path.
func (v *Verifier) Verify(ctx context.Context, filePath string) VerifyResult {
	ext := filepath.Ext(filePath)
	configs, ok := v.linters[ext]
	if !ok {
		return VerifyResult{State: VerifyPassed}
	}

	var allErrors []VerificationError
	for _, cfg := range configs {
		errors := v.runLinter(ctx, cfg, filePath)
		allErrors = append(allErrors, errors...)
	}

	if len(allErrors) == 0 {
		return VerifyResult{State: VerifyPassed}
	}
	return VerifyResult{State: VerifyFailed, Errors: allErrors}
}

func (v *Verifier) runLinter(ctx context.Context, cfg LinterConfig, filePath string) []VerificationError {
	lintCtx, cancel := context.WithTimeout(ctx, cfg.Timeout)
	defer cancel()

	cmd := exec.CommandContext(lintCtx, cfg.Command, cfg.Args...)
	cmd.Dir = v.workspacePath

	output, err := cmd.CombinedOutput()
	if err == nil {
		return nil
	}

	return parseLinterOutput(cfg.Name, filePath, string(output))
}

func parseLinterOutput(source, filePath, output string) []VerificationError {
	var errors []VerificationError
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		ve := parseLinterLine(source, line)
		if ve != nil {
			errors = append(errors, *ve)
		}
	}
	return errors
}

// parseLinterLine parses a single error line.
// Formats:
//   go vet:  file.go:10: message
//   tsc:     file.ts(10,5): error TS1234: message
//   pylint:  file.py:10: [C0114] message
func parseLinterLine(source, line string) *VerificationError {
	parts := strings.SplitN(line, ":", 3)
	if len(parts) >= 3 {
		file := strings.TrimSpace(parts[0])
		var lineNum int
		fmt.Sscanf(strings.TrimSpace(parts[1]), "%d", &lineNum)
		msg := strings.TrimSpace(parts[2])
		if lineNum > 0 && msg != "" {
			return &VerificationError{
				File:    file,
				Line:    lineNum,
				Message: msg,
				Source:  source,
			}
		}
	}
	if line != "" {
		return &VerificationError{
			Message: line,
			Source:  source,
		}
	}
	return nil
}
