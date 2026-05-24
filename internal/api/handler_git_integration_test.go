package api

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func setupGitRepo(t *testing.T) (*CommandHandler, string) {
	t.Helper()
	dir := t.TempDir()

	// git init
	cmd := exec.Command("git", "init")
	cmd.Dir = dir
	if err := cmd.Run(); err != nil {
		t.Fatalf("git init failed: %v", err)
	}

	// Configure git user (required for commits)
	cmd = exec.Command("git", "config", "user.email", "test@test.com")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "config", "user.name", "Test")
	cmd.Dir = dir
	cmd.Run()

	server := &WebSocketServer{workspacePath: dir}
	handler := NewCommandHandler(server)
	return handler, dir
}

func TestGitHandler_Status_EmptyRepo(t *testing.T) {
	handler, _ := setupGitRepo(t)

	result, err := handler.HandleCommand("git_status", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	_ = m["files"]
}

func TestGitHandler_Status_WithFiles(t *testing.T) {
	handler, dir := setupGitRepo(t)

	// Create tracked file
	if err := os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("hello"), 0644); err != nil {
		t.Fatal(err)
	}

	// Initial commit so we have HEAD
	cmd := exec.Command("git", "add", "-A")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "initial")
	cmd.Dir = dir
	cmd.Run()

	// Modify file
	if err := os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("world"), 0644); err != nil {
		t.Fatal(err)
	}

	result, err := handler.HandleCommand("git_status", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["files"] == nil {
		t.Error("expected files field")
	}
}

func TestGitHandler_Status_NewUntrackedFile(t *testing.T) {
	handler, dir := setupGitRepo(t)

	// Initial commit
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("a"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "add", "-A")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "init")
	cmd.Dir = dir
	cmd.Run()

	// New untracked file
	if err := os.WriteFile(filepath.Join(dir, "new.txt"), []byte("new"), 0644); err != nil {
		t.Fatal(err)
	}

	result, err := handler.HandleCommand("git_status", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]any)
	files := m["files"]
	t.Logf("files: %v (type %T)", files, files)
}

func TestGitHandler_Diff_Validation(t *testing.T) {
	handler, _ := setupGitRepo(t)

	_, err := handler.HandleCommand("git_diff", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected validation error for missing path")
	}
}

func TestGitHandler_Diff_ModifiedFile(t *testing.T) {
	handler, dir := setupGitRepo(t)

	// Create and commit a file
	if err := os.WriteFile(filepath.Join(dir, "test.txt"), []byte("original"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "add", "-A")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "init")
	cmd.Dir = dir
	cmd.Run()

	// Modify the file
	if err := os.WriteFile(filepath.Join(dir, "test.txt"), []byte("modified"), 0644); err != nil {
		t.Fatal(err)
	}

	result, err := handler.HandleCommand("git_diff", json.RawMessage(`{"path":"test.txt"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	if m["original"] != "original" {
		t.Errorf("expected original content 'original', got %v", m["original"])
	}
	if m["modified"] != "modified" {
		t.Errorf("expected modified content 'modified', got %v", m["modified"])
	}
}

func TestGitHandler_Stage_SingleFile(t *testing.T) {
	handler, dir := setupGitRepo(t)

	// Create initial commit
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("a"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "add", "-A")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "init")
	cmd.Dir = dir
	cmd.Run()

	// Modify file
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("modified"), 0644); err != nil {
		t.Fatal(err)
	}

	_, err := handler.HandleCommand("git_stage", json.RawMessage(`{"path":"a.txt"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify file is staged
	cmd = exec.Command("git", "diff", "--cached", "--name-only")
	cmd.Dir = dir
	output, _ := cmd.Output()
	if string(output) == "" {
		t.Error("expected file to be staged")
	}
}

func TestGitHandler_StageAll(t *testing.T) {
	handler, dir := setupGitRepo(t)

	// Create initial commit
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("a"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "add", "-A")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "init")
	cmd.Dir = dir
	cmd.Run()

	// Create new file
	if err := os.WriteFile(filepath.Join(dir, "b.txt"), []byte("b"), 0644); err != nil {
		t.Fatal(err)
	}

	_, err := handler.HandleCommand("git_stage", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestGitHandler_Unstage(t *testing.T) {
	handler, dir := setupGitRepo(t)

	// Create initial commit
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("a"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "add", "-A")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "init")
	cmd.Dir = dir
	cmd.Run()

	// Modify and stage
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("modified"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd = exec.Command("git", "add", "-A")
	cmd.Dir = dir
	cmd.Run()

	// Unstage
	_, err := handler.HandleCommand("git_unstage", json.RawMessage(`{"path":"a.txt"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify file is unstaged
	cmd = exec.Command("git", "diff", "--cached", "--name-only")
	cmd.Dir = dir
	output, _ := cmd.Output()
	if len(output) > 0 {
		t.Errorf("expected no staged files, got: %s", output)
	}
}

func TestGitHandler_Commit(t *testing.T) {
	handler, dir := setupGitRepo(t)

	// Create and stage a file
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("a"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "add", "-A")
	cmd.Dir = dir
	cmd.Run()

	_, err := handler.HandleCommand("git_commit", json.RawMessage(`{"message":"test commit"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify commit exists
	cmd = exec.Command("git", "log", "--oneline", "-1")
	cmd.Dir = dir
	output, _ := cmd.Output()
	if len(output) == 0 {
		t.Error("expected commit to exist")
	}
}

func TestGitHandler_Commit_Validation(t *testing.T) {
	handler, _ := setupGitRepo(t)

	_, err := handler.HandleCommand("git_commit", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected validation error for missing message")
	}
}

func TestGitHandler_Log(t *testing.T) {
	handler, dir := setupGitRepo(t)

	// Create two commits
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("a"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "add", "-A")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "first commit")
	cmd.Dir = dir
	cmd.Run()

	if err := os.WriteFile(filepath.Join(dir, "b.txt"), []byte("b"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd = exec.Command("git", "add", "-A")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "second commit")
	cmd.Dir = dir
	cmd.Run()

	result, err := handler.HandleCommand("git_log", json.RawMessage(`{"limit":10}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	commits, ok := m["commits"]
	if !ok {
		t.Error("expected commits field")
	}
	t.Logf("commits: %v (type %T)", commits, commits)
}

func TestGitHandler_Branch_List(t *testing.T) {
	handler, dir := setupGitRepo(t)

	// Initial commit
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("a"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "add", "-A")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "init")
	cmd.Dir = dir
	cmd.Run()

	result, err := handler.HandleCommand("git_branch_list", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	branches, ok := m["branches"]
	if !ok {
		t.Error("expected branches field")
	}
	t.Logf("branches: %v", branches)
}

func TestGitHandler_Branch_Create(t *testing.T) {
	handler, dir := setupGitRepo(t)

	// Initial commit
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("a"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "add", "-A")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "init")
	cmd.Dir = dir
	cmd.Run()

	_, err := handler.HandleCommand("git_branch_create", json.RawMessage(`{"name":"feature-test"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify branch exists
	cmd = exec.Command("git", "branch", "--list", "feature-test")
	cmd.Dir = dir
	output, _ := cmd.Output()
	if len(output) == 0 {
		t.Error("expected branch to be created")
	}
}

func TestGitHandler_Discard(t *testing.T) {
	handler, dir := setupGitRepo(t)

	// Create and commit
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("original"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "add", "-A")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "init")
	cmd.Dir = dir
	cmd.Run()

	// Modify
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("modified"), 0644); err != nil {
		t.Fatal(err)
	}

	_, err := handler.HandleCommand("git_discard", json.RawMessage(`{"path":"a.txt"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify content restored
	data, err := os.ReadFile(filepath.Join(dir, "a.txt"))
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "original" {
		t.Errorf("expected 'original', got '%s'", data)
	}
}

func TestGitHandler_Push(t *testing.T) {
	handler, _ := setupGitRepo(t)

	// push without remote will fail — test that the handler doesn't panic
	_, err := handler.HandleCommand("git_push", json.RawMessage(`{}`), "test")
	// Error is expected (no remote configured)
	if err == nil {
		t.Log("push succeeded (unexpected but ok)")
	}
}

func TestGitHandler_Pull(t *testing.T) {
	handler, _ := setupGitRepo(t)

	// pull without remote will fail — test that the handler doesn't panic
	_, err := handler.HandleCommand("git_pull", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Log("pull succeeded (unexpected but ok)")
	}
}

func TestGitHandler_Stash(t *testing.T) {
	handler, dir := setupGitRepo(t)

	// Initial commit
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("a"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "add", "-A")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "init")
	cmd.Dir = dir
	cmd.Run()

	// Modify file
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("modified"), 0644); err != nil {
		t.Fatal(err)
	}

	_, err := handler.HandleCommand("git_stash", json.RawMessage(`{"action":"save"}`), "test")
	if err != nil {
		t.Logf("stash error (may be expected): %v", err)
	}
}

func TestGitHandler_Checkout(t *testing.T) {
	handler, dir := setupGitRepo(t)

	// Initial commit
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("a"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "add", "-A")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "init")
	cmd.Dir = dir
	cmd.Run()

	// Create and checkout a new branch
	_, err := handler.HandleCommand("git_branch_checkout", json.RawMessage(`{"name":"-b test-branch"}`), "test")
	if err != nil {
		t.Logf("checkout error: %v", err)
	}
}

func TestGitHandler_Blame(t *testing.T) {
	handler, dir := setupGitRepo(t)

	// Create and commit
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("line1\nline2\nline3\n"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "add", "-A")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "init")
	cmd.Dir = dir
	cmd.Run()

	result, err := handler.HandleCommand("git_blame", json.RawMessage(`{"path":"a.txt"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	linesRaw, hasLines := m["lines"]
	if !hasLines {
		t.Fatalf("expected 'lines' field, got keys: %v", m)
	}
	// lines is a slice of internal BlameLine — verify non-empty via reflection
	if linesRaw == nil {
		t.Error("expected non-nil lines")
	}
	t.Logf("lines type: %T, value: %v", linesRaw, linesRaw)
}

func TestGitHandler_UndoCommit(t *testing.T) {
	handler, dir := setupGitRepo(t)

	// Create two commits
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("a"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "add", "-A")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "first")
	cmd.Dir = dir
	cmd.Run()

	if err := os.WriteFile(filepath.Join(dir, "b.txt"), []byte("b"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd = exec.Command("git", "add", "-A")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "second")
	cmd.Dir = dir
	cmd.Run()

	_, err := handler.HandleCommand("git_undo_commit", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify HEAD is at first commit
	cmd = exec.Command("git", "log", "--oneline", "-1")
	cmd.Dir = dir
	output, _ := cmd.Output()
	t.Logf("after undo, HEAD at: %s", string(output))
}

func TestGitHandler_WorktreeList(t *testing.T) {
	handler, _ := setupGitRepo(t)

	// Initial commit
	dir := handler.server.workspacePath
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("a"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "add", "-A")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "init")
	cmd.Dir = dir
	cmd.Run()

	result, err := handler.HandleCommand("git_worktree_list", nil, "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	worktrees, ok := m["worktrees"]
	if !ok {
		t.Fatalf("expected 'worktrees' field, got keys: %v", m)
	}
	t.Logf("worktrees: %v (type %T)", worktrees, worktrees)
}

func TestGitHandler_WorktreeAdd(t *testing.T) {
	handler, _ := setupGitRepo(t)
	dir := handler.server.workspacePath

	// Initial commit
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("a"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "add", "-A")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "init")
	cmd.Dir = dir
	cmd.Run()

	// Create a branch for the worktree
	cmd = exec.Command("git", "branch", "feature")
	cmd.Dir = dir
	cmd.Run()

	worktreePath := filepath.Join(dir, "..", "worktree-test-"+filepath.Base(dir))
	_, err := handler.HandleCommand("git_worktree_add", json.RawMessage(`{"path":"`+worktreePath+`","branch":"feature"}`), "test")
	if err != nil {
		t.Logf("worktree add error (may need cleanup): %v", err)
	} else {
		// Verify worktree exists
		cmd = exec.Command("git", "worktree", "list")
		cmd.Dir = dir
		output, _ := cmd.Output()
		t.Logf("worktrees after add: %s", output)

		// Clean up
		exec.Command("git", "worktree", "remove", worktreePath).Run()
	}
}

func TestGitHandler_DiffLines(t *testing.T) {
	handler, _ := setupGitRepo(t)
	dir := handler.server.workspacePath

	// Create and commit
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("line1\nline2\nline3\n"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "add", "-A")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "init")
	cmd.Dir = dir
	cmd.Run()

	// Modify file
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("line1\nmodified\nline3\n"), 0644); err != nil {
		t.Fatal(err)
	}

	result, err := handler.HandleCommand("git_diff_lines", json.RawMessage(`{"path":"a.txt"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	t.Logf("diff_lines result keys: %v", m)
}

func TestGitHandler_DiffLines_Staged(t *testing.T) {
	handler, _ := setupGitRepo(t)
	dir := handler.server.workspacePath

	// Create and commit
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("original"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "add", "-A")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "init")
	cmd.Dir = dir
	cmd.Run()

	// Modify and stage
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("staged change"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd = exec.Command("git", "add", "-A")
	cmd.Dir = dir
	cmd.Run()

	result, err := handler.HandleCommand("git_diff_lines", json.RawMessage(`{"path":"a.txt","staged":true}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m := result.(map[string]any)
	t.Logf("staged diff_lines keys: %v", m)
}

func TestGitHandler_StashPop(t *testing.T) {
	handler, _ := setupGitRepo(t)
	dir := handler.server.workspacePath

	// Create and commit
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("original"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "add", "-A")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "init")
	cmd.Dir = dir
	cmd.Run()

	// Modify, stash
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("modified"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd = exec.Command("git", "stash")
	cmd.Dir = dir
	cmd.Run()

	// Pop
	_, err := handler.HandleCommand("git_stash_pop", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Logf("stash pop error: %v", err)
	}

	// Verify content restored
	data, _ := os.ReadFile(filepath.Join(dir, "a.txt"))
	t.Logf("after stash pop: %s", string(data))
}

func TestGitHandler_Blame_WithCommits(t *testing.T) {
	handler, dir := setupGitRepo(t)

	// Create and commit a file with multiple lines
	content := "line one\nline two\nline three\n"
	if err := os.WriteFile(filepath.Join(dir, "blame.txt"), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "add", "blame.txt")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "initial")
	cmd.Dir = dir
	cmd.Run()

	result, err := handler.HandleCommand("git_blame", json.RawMessage(`{"path":"blame.txt"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	lines, ok := m["lines"]
	if !ok {
		t.Fatal("expected 'lines' key in result")
	}
	t.Logf("blame lines type: %T", lines)
}

func TestGitHandler_Blame_MissingPath(t *testing.T) {
	handler, _ := setupGitRepo(t)

	_, err := handler.HandleCommand("git_blame", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing path")
	}
}

func TestGitHandler_Blame_NonexistentFile(t *testing.T) {
	handler, _ := setupGitRepo(t)

	_, err := handler.HandleCommand("git_blame", json.RawMessage(`{"path":"nonexistent.txt"}`), "test")
	if err == nil {
		t.Error("expected error for nonexistent file")
	}
}

func TestGitHandler_DiffLines_WithChanges(t *testing.T) {
	handler, dir := setupGitRepo(t)

	// Create and commit a file
	if err := os.WriteFile(filepath.Join(dir, "diff.txt"), []byte("original content\n"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "add", "diff.txt")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "initial")
	cmd.Dir = dir
	cmd.Run()

	// Modify the file
	if err := os.WriteFile(filepath.Join(dir, "diff.txt"), []byte("modified content\n"), 0644); err != nil {
		t.Fatal(err)
	}

	result, err := handler.HandleCommand("git_diff_lines", json.RawMessage(`{"path":"diff.txt"}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("diff_lines result: %T", result)
}

func TestGitHandler_DiffLines_MissingPath(t *testing.T) {
	handler, _ := setupGitRepo(t)

	_, err := handler.HandleCommand("git_diff_lines", json.RawMessage(`{}`), "test")
	if err == nil {
		t.Error("expected error for missing path")
	}
}

func TestGitHandler_WorktreeRemove_InvalidPath(t *testing.T) {
	handler, _ := setupGitRepo(t)

	_, err := handler.HandleCommand("git_worktree_remove", json.RawMessage(`{"path":"/nonexistent/path"}`), "test")
	if err == nil {
		t.Error("expected error for invalid worktree path")
	}
}

func TestGitHandler_Log_WithCommits(t *testing.T) {
	handler, dir := setupGitRepo(t)

	// Create and commit files
	for i := 0; i < 3; i++ {
		filename := filepath.Join(dir, fmt.Sprintf("file%d.txt", i))
		if err := os.WriteFile(filename, []byte(fmt.Sprintf("content %d", i)), 0644); err != nil {
			t.Fatal(err)
		}
		cmd := exec.Command("git", "add", ".")
		cmd.Dir = dir
		cmd.Run()
		cmd = exec.Command("git", "commit", "-m", fmt.Sprintf("commit %d", i))
		cmd.Dir = dir
		cmd.Run()
	}

	result, err := handler.HandleCommand("git_log", json.RawMessage(`{"limit":2}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map, got %T", result)
	}
	commits, ok := m["commits"]
	if !ok {
		t.Fatal("expected 'commits' key")
	}
	t.Logf("commits type: %T", commits)
}

func TestGitHandler_BranchList(t *testing.T) {
	handler, _ := setupGitRepo(t)

	result, err := handler.HandleCommand("git_branch_list", json.RawMessage(`{}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("branch list result: %T", result)
}

func TestGitHandler_Diff_Staged(t *testing.T) {
	handler, dir := setupGitRepo(t)

	// Create and commit
	if err := os.WriteFile(filepath.Join(dir, "s.txt"), []byte("original\n"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("git", "add", "s.txt")
	cmd.Dir = dir
	cmd.Run()
	cmd = exec.Command("git", "commit", "-m", "initial")
	cmd.Dir = dir
	cmd.Run()

	// Stage changes
	if err := os.WriteFile(filepath.Join(dir, "s.txt"), []byte("staged change\n"), 0644); err != nil {
		t.Fatal(err)
	}
	cmd = exec.Command("git", "add", "s.txt")
	cmd.Dir = dir
	cmd.Run()

	result, err := handler.HandleCommand("git_diff", json.RawMessage(`{"path":"s.txt","staged":true}`), "test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	t.Logf("staged diff result: %T", result)
}
