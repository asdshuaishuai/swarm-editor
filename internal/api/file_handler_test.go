package api

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestCommandHandler_ReadFile(t *testing.T) {
	// Create a temp directory as workspace
	tmpDir := t.TempDir()

	// Create a test file
	testFile := filepath.Join(tmpDir, "test.txt")
	if err := os.WriteFile(testFile, []byte("hello world"), 0644); err != nil {
		t.Fatal(err)
	}

	// Create a subdirectory
	subDir := filepath.Join(tmpDir, "sub")
	if err := os.MkdirAll(subDir, 0755); err != nil {
		t.Fatal(err)
	}

	server := &WebSocketServer{workspacePath: tmpDir}
	handler := NewCommandHandler(server)

	t.Run("read file successfully", func(t *testing.T) {
		params, _ := json.Marshal(map[string]string{"path": "test.txt"})
		result, err := handler.HandleCommand("read_file", params)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		m, ok := result.(map[string]string)
		if !ok {
			t.Fatal("expected map[string]string")
		}
		if m["content"] != "hello world" {
			t.Errorf("expected 'hello world', got %q", m["content"])
		}
	})

	t.Run("read file in subdirectory", func(t *testing.T) {
		nestedFile := filepath.Join(subDir, "nested.go")
		os.WriteFile(nestedFile, []byte("package sub"), 0644)
		params, _ := json.Marshal(map[string]string{"path": "sub/nested.go"})
		result, err := handler.HandleCommand("read_file", params)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		m := result.(map[string]string)
		if m["content"] != "package sub" {
			t.Errorf("expected 'package sub', got %q", m["content"])
		}
	})

	t.Run("reject path traversal", func(t *testing.T) {
		params, _ := json.Marshal(map[string]string{"path": "../../etc/passwd"})
		_, err := handler.HandleCommand("read_file", params)
		if err == nil {
			t.Error("expected error for path traversal attempt")
		}
	})

	t.Run("reject non-existent file", func(t *testing.T) {
		params, _ := json.Marshal(map[string]string{"path": "nonexistent.txt"})
		_, err := handler.HandleCommand("read_file", params)
		if err == nil {
			t.Error("expected error for non-existent file")
		}
	})

	t.Run("reject directory", func(t *testing.T) {
		params, _ := json.Marshal(map[string]string{"path": "sub"})
		_, err := handler.HandleCommand("read_file", params)
		if err == nil {
			t.Error("expected error when path is a directory")
		}
	})

	t.Run("reject when workspace not configured", func(t *testing.T) {
		emptyServer := &WebSocketServer{workspacePath: ""}
		emptyHandler := NewCommandHandler(emptyServer)
		params, _ := json.Marshal(map[string]string{"path": "test.txt"})
		_, err := emptyHandler.HandleCommand("read_file", params)
		if err == nil {
			t.Error("expected error when workspace not configured")
		}
	})

	t.Run("reject invalid JSON", func(t *testing.T) {
		_, err := handler.HandleCommand("read_file", []byte("invalid"))
		if err == nil {
			t.Error("expected error for invalid JSON")
		}
	})
}

func TestCommandHandler_WriteFile(t *testing.T) {
	tmpDir := t.TempDir()

	server := &WebSocketServer{workspacePath: tmpDir}
	handler := NewCommandHandler(server)

	t.Run("write file successfully", func(t *testing.T) {
		params, _ := json.Marshal(map[string]string{
			"path":    "newfile.txt",
			"content": "hello from test",
		})
		result, err := handler.HandleCommand("write_file", params)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		m, ok := result.(map[string]string)
		if !ok {
			t.Fatal("expected map[string]string")
		}
		if m["status"] != "written" {
			t.Errorf("expected 'written', got %q", m["status"])
		}

		// Verify file was written
		content, err := os.ReadFile(filepath.Join(tmpDir, "newfile.txt"))
		if err != nil {
			t.Fatal(err)
		}
		if string(content) != "hello from test" {
			t.Errorf("file content mismatch: %q", string(content))
		}
	})

	t.Run("write file to subdirectory", func(t *testing.T) {
		params, _ := json.Marshal(map[string]string{
			"path":    "subdir/deep.txt",
			"content": "nested content",
		})
		_, err := handler.HandleCommand("write_file", params)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		content, err := os.ReadFile(filepath.Join(tmpDir, "subdir", "deep.txt"))
		if err != nil {
			t.Fatal(err)
		}
		if string(content) != "nested content" {
			t.Errorf("file content mismatch: %q", string(content))
		}
	})

	t.Run("overwrite existing file", func(t *testing.T) {
		params, _ := json.Marshal(map[string]string{
			"path":    "overwrite.txt",
			"content": "first",
		})
		handler.HandleCommand("write_file", params)

		params, _ = json.Marshal(map[string]string{
			"path":    "overwrite.txt",
			"content": "second",
		})
		handler.HandleCommand("write_file", params)

		content, err := os.ReadFile(filepath.Join(tmpDir, "overwrite.txt"))
		if err != nil {
			t.Fatal(err)
		}
		if string(content) != "second" {
			t.Errorf("expected 'second', got %q", string(content))
		}
	})

	t.Run("reject path traversal", func(t *testing.T) {
		params, _ := json.Marshal(map[string]string{
			"path":    "../../etc/evil.txt",
			"content": "malicious",
		})
		_, err := handler.HandleCommand("write_file", params)
		if err == nil {
			t.Error("expected error for path traversal attempt")
		}

		// Verify no file was created outside workspace
		if _, err := os.Stat("/tmp/evil.txt"); err == nil {
			t.Error("file was created outside workspace!")
		}
	})

	t.Run("reject empty path", func(t *testing.T) {
		params, _ := json.Marshal(map[string]string{
			"path":    "",
			"content": "data",
		})
		_, err := handler.HandleCommand("write_file", params)
		if err == nil {
			t.Error("expected error for empty path")
		}
	})

	t.Run("reject when workspace not configured", func(t *testing.T) {
		emptyServer := &WebSocketServer{workspacePath: ""}
		emptyHandler := NewCommandHandler(emptyServer)
		params, _ := json.Marshal(map[string]string{
			"path":    "test.txt",
			"content": "data",
		})
		_, err := emptyHandler.HandleCommand("write_file", params)
		if err == nil {
			t.Error("expected error when workspace not configured")
		}
	})
}

func TestCommandHandler_ListDir(t *testing.T) {
	tmpDir := t.TempDir()

	// Create test structure
	os.MkdirAll(filepath.Join(tmpDir, "src"), 0755)
	os.WriteFile(filepath.Join(tmpDir, "README.md"), []byte("# Test"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "src", "main.go"), []byte("package main"), 0644)

	server := &WebSocketServer{workspacePath: tmpDir}
	handler := NewCommandHandler(server)

	t.Run("list root directory", func(t *testing.T) {
		params, _ := json.Marshal(map[string]string{"path": "."})
		result, err := handler.HandleCommand("list_dir", params)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		files, ok := result.([]FileInfo)
		if !ok {
			t.Fatal("expected []FileInfo")
		}
		if len(files) < 2 {
			t.Errorf("expected at least 2 entries, got %d", len(files))
		}

		// Check that both files and directories are present
		hasReadme := false
		hasSrc := false
		for _, f := range files {
			if f.Name == "README.md" {
				hasReadme = true
			}
			if f.Name == "src" && f.IsDirectory {
				hasSrc = true
			}
		}
		if !hasReadme {
			t.Error("expected README.md in listing")
		}
		if !hasSrc {
			t.Error("expected src directory in listing")
		}
	})

	t.Run("list subdirectory", func(t *testing.T) {
		params, _ := json.Marshal(map[string]string{"path": "src"})
		result, err := handler.HandleCommand("list_dir", params)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		files := result.([]FileInfo)
		if len(files) != 1 {
			t.Errorf("expected 1 entry in src, got %d", len(files))
		}
		if files[0].Name != "main.go" {
			t.Errorf("expected main.go, got %s", files[0].Name)
		}
	})

	t.Run("reject non-existent directory", func(t *testing.T) {
		params, _ := json.Marshal(map[string]string{"path": "nonexistent"})
		_, err := handler.HandleCommand("list_dir", params)
		if err == nil {
			t.Error("expected error for non-existent directory")
		}
	})

	t.Run("reject path traversal", func(t *testing.T) {
		params, _ := json.Marshal(map[string]string{"path": "../../etc"})
		_, err := handler.HandleCommand("list_dir", params)
		if err == nil {
			t.Error("expected error for path traversal attempt")
		}
	})
}
