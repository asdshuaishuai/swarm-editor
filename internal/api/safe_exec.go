package api

import (
	"context"
	"fmt"
	"os/exec"
	"slices"
	"strings"
)

// safeExec creates an exec.Cmd with basic safety checks.
// name must be a bare command name (no path separators).
func safeExec(ctx context.Context, name string, args ...string) (*exec.Cmd, error) {
	if name == "" {
		return nil, fmt.Errorf("command name is required")
	}
	if strings.ContainsAny(name, `/\`) {
		return nil, fmt.Errorf("command name must not contain path separators: %s", name)
	}
	if slices.Contains(args, "") {
		return nil, fmt.Errorf("command arguments must not be empty")
	}
	return exec.CommandContext(ctx, name, args...), nil
}
