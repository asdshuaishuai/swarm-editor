package api

import (
"context"
"encoding/json"
"fmt"
"os"
"os/exec"
"path/filepath"
"regexp"
"strconv"
"strings"
)

func (h *CommandHandler) handleGitStatus(ctx context.Context, params json.RawMessage) (any, error) {
	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	// Run git status --porcelain=v1 in the workspace
	cmd := exec.CommandContext(ctx, "git", "status", "--porcelain=v1")
	cmd.Dir = h.server.workspacePath
	output, err := cmd.Output()
	if err != nil {
		// Not a git repo — return empty status
		return map[string]any{"files": []any{}}, nil
	}

	type FileStatus struct {
		Path string `json:"path"`
		Status string `json:"status"` // M, A, D, R, U, ??
		Staged bool `json:"staged"`
	}

	var files []FileStatus
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, line := range lines {
		if len(line) < 4 {
			continue
		}
		xy := line[:2]
		path := line[3:]
		// Remove quotes from renamed files
		path = strings.TrimPrefix(path, `"`)
		path = strings.TrimSuffix(path, `"`)
		// Handle renamed files (R old -> new)
		if strings.Contains(path, " -> ") {
			path = strings.SplitN(path, " -> ", 2)[1]
		}

		x := xy[0]
		y := xy[1]

		// Determine status and whether staged
		status := "??"
		staged := false
		switch {
		case x == 'M' || y == 'M':
			status = "M"
			staged = x == 'M'
		case x == 'A' || y == 'A':
			status = "A"
			staged = x == 'A'
		case x == 'D' || y == 'D':
			status = "D"
			staged = x == 'D'
		case x == 'R' || y == 'R':
			status = "R"
			staged = x == 'R'
		case y == '?':
			status = "??"
		case x == 'U' || y == 'U':
			status = "U"
			staged = x == 'U'
		}

		files = append(files, FileStatus{Path: path, Status: status, Staged: staged})
	}

	return map[string]any{"files": files}, nil
}

func (h *CommandHandler) handleGitDiff(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Path   string `json:"path"`
		Staged bool   `json:"staged"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.Path == "" {
		return nil, errValidation("path is required")
	}
	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	relPath := filepath.Clean(req.Path)
	absPath, err := h.safePath(relPath)
	if err != nil {
		return nil, err
	}

	// Get HEAD version (original)
	showCmd := exec.CommandContext(ctx, "git", "show", "HEAD:"+relPath)
	showCmd.Dir = h.server.workspacePath
	headData, _ := showCmd.Output()
	originalContent := string(headData)

	// Get modified version
	var modifiedContent string
	if req.Staged {
		// Staged diff: compare HEAD vs index (staged version)
		indexCmd := exec.CommandContext(ctx, "git", "show", ":"+relPath)
		indexCmd.Dir = h.server.workspacePath
		indexData, err := indexCmd.Output()
		if err == nil {
			modifiedContent = string(indexData)
		}
	} else {
		// Working tree diff: compare HEAD vs working tree
		currentData, err := os.ReadFile(absPath)
		if err == nil {
			modifiedContent = string(currentData)
		}
	}

	return map[string]any{
		"original": originalContent,
		"modified": modifiedContent,
		"path":     relPath,
	}, nil
}

func (h *CommandHandler) handleGitStage(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Path string `json:"path"` // empty = stage all
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	var args []string
	if req.Path == "" {
		args = []string{"add", "-A"}
	} else {
		relPath := filepath.Clean(req.Path)
		if _, err := h.safePath(relPath); err != nil {
			return nil, err
		}
		args = []string{"add", "--", relPath}
	}

	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = h.server.workspacePath
	if output, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("git add failed: %s: %w", strings.TrimSpace(string(output)), err)
	}

	// Return updated git status
	return h.handleGitStatus(ctx, json.RawMessage("{}"))
}

func (h *CommandHandler) handleGitUnstage(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Path string `json:"path"` // empty = unstage all
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	var args []string
	if req.Path == "" {
		args = []string{"reset", "HEAD", "--", "."}
	} else {
		relPath := filepath.Clean(req.Path)
		if _, err := h.safePath(relPath); err != nil {
			return nil, err
		}
		args = []string{"restore", "--staged", "--", relPath}
	}

	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = h.server.workspacePath
	if output, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("git unstage failed: %s: %w", strings.TrimSpace(string(output)), err)
	}

	return h.handleGitStatus(ctx, json.RawMessage("{}"))
}

func (h *CommandHandler) handleGitCommit(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Message string `json:"message"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.Message == "" {
		return nil, errValidation("commit message is required")
	}
	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	cmd := exec.CommandContext(ctx, "git", "commit", "-m", req.Message)
	cmd.Dir = h.server.workspacePath
	if output, err := cmd.CombinedOutput(); err != nil {
		out := strings.TrimSpace(string(output))
		return nil, fmt.Errorf("git commit failed: %s: %w", out, err)
	}

	// Get the commit hash
	hashCmd := exec.CommandContext(ctx, "git", "rev-parse", "HEAD")
	hashCmd.Dir = h.server.workspacePath
	hashData, _ := hashCmd.Output()
	commitHash := strings.TrimSpace(string(hashData))

	return map[string]any{
		"hash":    commitHash,
		"message": req.Message,
	}, nil
}

func (h *CommandHandler) handleGitDiscard(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.Path == "" {
		return nil, errValidation("path is required")
	}
	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	relPath := filepath.Clean(req.Path)
	absPath, err := h.safePath(relPath)
	if err != nil {
		return nil, err
	}

	// Discard working tree changes
	cmd := exec.CommandContext(ctx, "git", "restore", "--", relPath)
	cmd.Dir = h.server.workspacePath
	if output, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("git restore failed: %s: %w", strings.TrimSpace(string(output)), err)
	}

	// If file was untracked, remove it
	if _, statErr := os.Stat(absPath); statErr == nil {
		// Check if file is untracked by checking if it exists in HEAD
		showCmd := exec.CommandContext(ctx, "git", "show", "HEAD:"+relPath)
		showCmd.Dir = h.server.workspacePath
		if err := showCmd.Run(); err != nil {
			// File doesn't exist in HEAD — it's untracked, remove it
			os.Remove(absPath)
		}
	}

	return h.handleGitStatus(ctx, json.RawMessage("{}"))
}

func (h *CommandHandler) handleGitLog(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Path  string `json:"path"`
		Limit int    `json:"limit"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	limit := req.Limit
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	args := []string{"log", "--pretty=format:%H|%s|%an|%ar", fmt.Sprintf("-%d", limit)}
	if req.Path != "" {
		relPath := filepath.Clean(req.Path)
		if _, err := h.safePath(relPath); err != nil {
			return nil, err
		}
		args = append(args, "--", relPath)
	}

	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = h.server.workspacePath
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("git log failed: %w", err)
	}

	type CommitEntry struct {
		Hash    string `json:"hash"`
		Message string `json:"message"`
		Author  string `json:"author"`
		Date    string `json:"date"`
	}

	var commits []CommitEntry
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "|", 4)
		if len(parts) < 4 {
			continue
		}
		commits = append(commits, CommitEntry{
			Hash:    parts[0][:7], // short hash
			Message: parts[1],
			Author:  parts[2],
			Date:    parts[3],
		})
	}

	return map[string]any{"commits": commits}, nil
}

func (h *CommandHandler) handleGitBranch(ctx context.Context, params json.RawMessage) (any, error) {
	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	cmd := exec.CommandContext(ctx, "git", "branch", "--show-current")
	cmd.Dir = h.server.workspacePath
	output, err := cmd.Output()
	if err != nil {
		// Not on a branch (detached HEAD or not a git repo)
		return map[string]any{"branch": ""}, nil
	}

	branch := strings.TrimSpace(string(output))
	return map[string]any{"branch": branch}, nil
}

func (h *CommandHandler) handleGitBranchList(ctx context.Context, params json.RawMessage) (any, error) {
	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	cmd := exec.CommandContext(ctx, "git", "branch", "--list", "--no-color")
	cmd.Dir = h.server.workspacePath
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to list branches: %w", err)
	}

	currentBranch, _ := h.getCurrentBranch(ctx)
	var branches []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(string(output)), "\n") {
		if line == "" {
			continue
		}
		line = strings.TrimSpace(line)
		isCurrent := strings.HasPrefix(line, "* ")
		name := strings.TrimPrefix(line, "* ")
		name = strings.TrimSpace(name)
		branches = append(branches, map[string]any{
			"name":      name,
			"current":   isCurrent,
			"isActive":  name == currentBranch,
		})
	}

	return map[string]any{"branches": branches}, nil
}

func (h *CommandHandler) handleGitBranchCreate(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Name    string `json:"name"`
		Checkout bool  `json:"checkout"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.Name == "" {
		return nil, errValidation("branch name is required")
	}
	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	args := []string{"branch", req.Name}
	if req.Checkout {
		args = []string{"checkout", "-b", req.Name}
	}

	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = h.server.workspacePath
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed to create branch: %s: %w", strings.TrimSpace(string(output)), err)
	}

	return map[string]any{"branch": req.Name, "checkout": req.Checkout}, nil
}

func (h *CommandHandler) handleGitBranchCheckout(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.Name == "" {
		return nil, errValidation("branch name is required")
	}
	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	cmd := exec.CommandContext(ctx, "git", "checkout", req.Name)
	cmd.Dir = h.server.workspacePath
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed to checkout branch: %s: %w", strings.TrimSpace(string(output)), err)
	}

	return map[string]any{"branch": req.Name}, nil
}

func (h *CommandHandler) handleGitPush(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Remote string `json:"remote"`
		Branch string `json:"branch"`
		Force  bool   `json:"force"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	remote := req.Remote
	if remote == "" {
		remote = "origin"
	}

	args := []string{"push", remote}
	if req.Branch != "" {
		args = append(args, req.Branch)
	}
	if req.Force {
		args = append(args, "--force")
	}
	// Set upstream for first push
	args = append(args, "--set-upstream")

	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = h.server.workspacePath
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("push failed: %s: %w", strings.TrimSpace(string(output)), err)
	}

	return map[string]any{"output": strings.TrimSpace(string(output))}, nil
}

func (h *CommandHandler) handleGitPull(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Remote string `json:"remote"`
		Branch string `json:"branch"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	remote := req.Remote
	if remote == "" {
		remote = "origin"
	}

	args := []string{"pull", remote}
	if req.Branch != "" {
		args = append(args, req.Branch)
	}

	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = h.server.workspacePath
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("pull failed: %s: %w", strings.TrimSpace(string(output)), err)
	}

	return map[string]any{"output": strings.TrimSpace(string(output))}, nil
}

func (h *CommandHandler) handleGitStash(ctx context.Context, params json.RawMessage) (any, error) {
	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	cmd := exec.CommandContext(ctx, "git", "stash", "push", "-m", "auto-stash")
	cmd.Dir = h.server.workspacePath
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("stash failed: %s: %w", strings.TrimSpace(string(output)), err)
	}

	return map[string]any{"output": strings.TrimSpace(string(output))}, nil
}

func (h *CommandHandler) handleGitStashPop(ctx context.Context, params json.RawMessage) (any, error) {
	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	cmd := exec.CommandContext(ctx, "git", "stash", "pop")
	cmd.Dir = h.server.workspacePath
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("stash pop failed: %s: %w", strings.TrimSpace(string(output)), err)
	}

	return map[string]any{"output": strings.TrimSpace(string(output))}, nil
}

func (h *CommandHandler) handleGitUndoCommit(ctx context.Context, params json.RawMessage) (any, error) {
	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	cmd := exec.CommandContext(ctx, "git", "reset", "--soft", "HEAD~1")
	cmd.Dir = h.server.workspacePath
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("undo commit failed: %s: %w", strings.TrimSpace(string(output)), err)
	}

	return map[string]any{"output": strings.TrimSpace(string(output))}, nil
}

func (h *CommandHandler) handleGitDiffLines(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Path   string `json:"path"`
		Staged bool   `json:"staged"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}
	if req.Path == "" {
		return nil, errValidation("path is required")
	}
	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	// Validate path
	relPath := filepath.Clean(req.Path)
	if _, err := h.safePath(relPath); err != nil {
		return nil, err
	}

	// Run git diff with no context (-U0) to get minimal diff hunks
	var args []string
	if req.Staged {
		args = []string{"diff", "-U0", "--staged", "--", relPath}
	} else {
		args = []string{"diff", "-U0", "--", relPath}
	}

	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = h.server.workspacePath
	output, err := cmd.Output()
	if err != nil {
		// No diff (file not changed) — return empty ranges
		return map[string]any{"ranges": []any{}, "path": relPath}, nil
	}

	// Parse unified diff output to extract line ranges
	// Format: @@ -start,count +start,count @@
	type DiffRange struct {
		StartOld int    `json:"startOld"` // 1-indexed, original file line
		EndOld   int    `json:"endOld"`   // 1-indexed, inclusive
		StartNew int    `json:"startNew"` // 1-indexed, modified file line
		EndNew   int    `json:"endNew"`   // 1-indexed, inclusive
		Type     string `json:"type"`     // "added" | "removed" | "modified"
	}

	var ranges []DiffRange
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")

	// Regex to parse @@ -start,count +start,count @@ headers
	hunkRegex := regexp.MustCompile(`^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@`)

	for _, line := range lines {
		if strings.HasPrefix(line, "@@") {
			matches := hunkRegex.FindStringSubmatch(line)
			if matches == nil {
				continue
			}

			// Parse old range (start,count)
			startOld, _ := strconv.Atoi(matches[1])
			countOld := 0
			if matches[2] != "" {
				countOld, _ = strconv.Atoi(matches[2])
			}

			// Parse new range (start,count)
			startNew, _ := strconv.Atoi(matches[3])
			countNew := 0
			if matches[4] != "" {
				countNew, _ = strconv.Atoi(matches[4])
			}

			// Calculate end lines (inclusive)
			endOld := startOld
			if countOld > 0 {
				endOld = startOld + countOld - 1
			}
			endNew := startNew
			if countNew > 0 {
				endNew = startNew + countNew - 1
			}

			// Determine type based on what changed
			diffType := "modified"
			if countOld == 0 && countNew > 0 {
				diffType = "added"
			} else if countNew == 0 && countOld > 0 {
				diffType = "removed"
			}

			// Only add if there's an actual change
			if countOld > 0 || countNew > 0 {
				ranges = append(ranges, DiffRange{
					StartOld: startOld,
					EndOld:   endOld,
					StartNew: startNew,
					EndNew:   endNew,
					Type:     diffType,
				})
			}
		}
	}

	return map[string]any{"ranges": ranges, "path": relPath}, nil
}

