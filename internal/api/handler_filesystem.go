package api

import (
"context"
"encoding/json"
"fmt"
"io"
"os"
"os/exec"
"path/filepath"
"regexp"
"runtime"
"slices"
"strings"
)

func (h *CommandHandler) handleListDir(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	// Validate and clean path
	relPath := filepath.Clean(req.Path)
	if relPath == "" || relPath == "." {
		relPath = "."
	}

	// Security: Reject file operations if workspace path is not configured
	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	// Use workspace path if set
	path := filepath.Join(h.server.workspacePath, relPath)
	// Security: Verify resolved path is still within workspace
	// Use EvalSymlinks to resolve symlinks and prevent traversal via symlinks
	absPath, err := filepath.EvalSymlinks(path)
	if err != nil {
		return nil, errValidation("invalid path")
	}
	absWorkspace, err := filepath.EvalSymlinks(h.server.workspacePath)
	if err != nil {
		return nil, errNotConnected("invalid workspace configuration")
	}
	if !strings.HasPrefix(absPath, absWorkspace+string(filepath.Separator)) && absPath != absWorkspace {
		return nil, errValidation("access denied: path outside workspace")
	}

	// Read directory (use absPath to follow symlinks correctly)
	entries, err := os.ReadDir(absPath)
	if err != nil {
		return nil, safeError("failed to read directory", err)
	}

	// Build file entries
	var result []FileInfo
	for _, entry := range entries {
		// Use cleaned relative path (not raw req.Path) to prevent path traversal in metadata
		fullPath := filepath.Join(relPath, entry.Name())
		result = append(result, FileInfo{
			Name:        entry.Name(),
			Path:        fullPath,
			IsDirectory: entry.IsDir(),
		})
	}

	// Sort: directories first, then alphabetically within each group (VS Code/Cursor pattern)
	slices.SortFunc(result, func(a, b FileInfo) int {
		if a.IsDirectory != b.IsDirectory {
			if a.IsDirectory {
				return -1
			}
			return 1
		}
		// Case-insensitive alphabetical sort within same type
		aLower := strings.ToLower(a.Name)
		bLower := strings.ToLower(b.Name)
		if aLower < bLower {
			return -1
		}
		if aLower > bLower {
			return 1
		}
		return 0
	})

	return result, nil
}

func (h *CommandHandler) handleSearchFiles(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Query string `json:"query"`
		Limit int    `json:"limit"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if req.Query == "" {
		return map[string][]FileInfo{"files": {}}, nil
	}
	if req.Limit <= 0 || req.Limit > 100 {
		req.Limit = 50
	}

	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	query := strings.ToLower(req.Query)
	var results []FileInfo

	err := filepath.WalkDir(h.server.workspacePath, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil // skip errors (permission denied, etc.)
		}
		if ctx.Err() != nil {
			return ctx.Err() // respect cancellation
		}

		// Skip excluded directories
		if d.IsDir() && searchExcludeDirs[d.Name()] {
			return filepath.SkipDir
		}
		// Skip hidden directories (except top-level)
		if d.IsDir() && strings.HasPrefix(d.Name(), ".") && path != h.server.workspacePath {
			return filepath.SkipDir
		}
		// Only match files, not directories
		if d.IsDir() {
			return nil
		}

		relPath, err := filepath.Rel(h.server.workspacePath, path)
		if err != nil {
			return nil
		}

		// Match query against filename (case-insensitive)
		if strings.Contains(strings.ToLower(filepath.Base(relPath)), query) {
			results = append(results, FileInfo{
				Name:        d.Name(),
				Path:        relPath,
				IsDirectory: false,
			})
			if len(results) >= req.Limit {
				return io.EOF
			}
		}

		return nil
	})

	if err != nil && err != io.EOF {
		return nil, safeError("file search failed", err)
	}

	if results == nil {
		results = []FileInfo{}
	}
	return map[string][]FileInfo{"files": results}, nil
}

func (h *CommandHandler) handleSearchContent(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Query         string   `json:"query"`
		CaseSensitive bool     `json:"caseSensitive"`
		WholeWord     bool     `json:"wholeWord"`
		Regex         bool     `json:"regex"`
		Limit         int      `json:"limit"`
		IncludeFiles  []string `json:"includeFiles"`
		ExcludeFiles  []string `json:"excludeFiles"`
		Folder        string   `json:"folder"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if req.Query == "" {
		return map[string][]ContentSearchResult{"results": {}}, nil
	}
	if req.Limit <= 0 || req.Limit > 500 {
		req.Limit = 100
	}

	// Compile include/exclude glob patterns
	var includePatterns, excludePatterns []string
	for _, p := range req.IncludeFiles {
		if p != "" {
			includePatterns = append(includePatterns, p)
		}
	}
	for _, p := range req.ExcludeFiles {
		if p != "" {
			excludePatterns = append(excludePatterns, p)
		}
	}

	// Validate regex if requested
	var regexPattern *regexp.Regexp
	if req.Regex {
		pattern := req.Query
		if !req.CaseSensitive {
			pattern = "(?i)" + pattern
		}
		var err error
		regexPattern, err = regexp.Compile(pattern)
		if err != nil {
			return nil, fmt.Errorf("invalid regex: %w", err)
		}
	}

	// Build whole-word pattern if needed (non-regex)
	if req.WholeWord && !req.Regex {
		req.Query = `\b` + regexp.QuoteMeta(req.Query) + `\b`
		req.Regex = true
		var err error
		pattern := req.Query
		if !req.CaseSensitive {
			pattern = "(?i)" + pattern
		}
		regexPattern, err = regexp.Compile(pattern)
		if err != nil {
			return nil, fmt.Errorf("invalid regex: %w", err)
		}
	}

	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	// Determine search root (folder restriction)
	searchRoot := h.server.workspacePath
	if req.Folder != "" {
		// Clean folder path to prevent path traversal (e.g. "../" or absolute paths)
		// filepath.Join discards base if child starts with "/", so we must clean first.
		cleanFolder := filepath.Clean(req.Folder)
		if !strings.HasPrefix(cleanFolder, "..") && !filepath.IsAbs(cleanFolder) {
			folderPath := filepath.Join(h.server.workspacePath, cleanFolder)
			if abs, err := filepath.Abs(folderPath); err == nil {
				folderPath = abs
			}
			// Safety: ensure folder is within workspace
			if strings.HasPrefix(folderPath, filepath.Clean(h.server.workspacePath)+string(os.PathSeparator)) {
				searchRoot = folderPath
			}
		}
	}

	var results []ContentSearchResult

	err := filepath.WalkDir(searchRoot, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil // skip errors
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}

		// Skip excluded directories
		if d.IsDir() && searchExcludeDirs[d.Name()] {
			return filepath.SkipDir
		}
		// Skip hidden directories
		if d.IsDir() && strings.HasPrefix(d.Name(), ".") && path != searchRoot {
			return filepath.SkipDir
		}
		// Only search files
		if d.IsDir() {
			return nil
		}

		// Apply include/exclude patterns (glob matching on relative path)
		relPath, relErr := filepath.Rel(h.server.workspacePath, path)
		if relErr != nil {
			return nil
		}
		if len(includePatterns) > 0 {
			matched := false
			for _, pat := range includePatterns {
				if m, _ := filepath.Match(pat, filepath.Base(path)); m {
					matched = true
					break
				}
				if m, _ := filepath.Match(pat, relPath); m {
					matched = true
					break
				}
			}
			if !matched {
				return nil
			}
		}
		if len(excludePatterns) > 0 {
			for _, pat := range excludePatterns {
				if m, _ := filepath.Match(pat, filepath.Base(path)); m {
					return nil
				}
				if m, _ := filepath.Match(pat, relPath); m {
					return nil
				}
			}
		}

		// Skip binary files by extension
		ext := strings.ToLower(filepath.Ext(d.Name()))
		if isBinaryExt(ext) {
			return nil
		}

		// Read file content
		content, err := os.ReadFile(path)
		if err != nil {
			return nil // skip unreadable files
		}

		// Skip if file looks binary
		if isBinaryContent(content) {
			return nil
		}

		// relPath already computed above for include/exclude matching

		// Search line by line
		lines := strings.Split(string(content), "\n")
		for lineNum, line := range lines {
			var col int
			var matched bool
			if regexPattern != nil {
				loc := regexPattern.FindStringIndex(line)
				if loc != nil {
					matched = true
					col = loc[0]
				}
			} else {
				searchLine := line
				q := req.Query
				if !req.CaseSensitive {
					searchLine = strings.ToLower(line)
					q = strings.ToLower(q)
				}
				idx := strings.Index(searchLine, q)
				if idx >= 0 {
					matched = true
					col = idx
				}
			}
			if matched {
				results = append(results, ContentSearchResult{
					Path:    relPath,
					Line:    lineNum,
					Column:  col,
					Content: strings.TrimSpace(line),
				})
				if len(results) >= req.Limit {
					return io.EOF
				}
			}
		}

		return nil
	})

	if err != nil && err != io.EOF {
		return nil, safeError("content search failed", err)
	}

	if results == nil {
		results = []ContentSearchResult{}
	}
	return map[string][]ContentSearchResult{"results": results}, nil
}

func (h *CommandHandler) handleReplaceContent(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Query         string   `json:"query"`
		Replacement   string   `json:"replacement"`
		CaseSensitive bool     `json:"caseSensitive"`
		WholeWord     bool     `json:"wholeWord"`
		Regex         bool     `json:"regex"`
		DryRun        bool     `json:"dryRun"`
		Files         []string `json:"files"` // empty = all files
		PreserveCase  bool     `json:"preserveCase"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if req.Query == "" {
		return nil, safeError("empty query", nil)
	}

	// Validate regex if requested
	var regexPattern *regexp.Regexp
	if req.Regex {
		pattern := req.Query
		if !req.CaseSensitive {
			pattern = "(?i)" + pattern
		}
		var err error
		regexPattern, err = regexp.Compile(pattern)
		if err != nil {
			return nil, fmt.Errorf("invalid regex: %w", err)
		}
	}

	// Build whole-word pattern if needed (non-regex)
	if req.WholeWord && !req.Regex {
		req.Query = `\b` + regexp.QuoteMeta(req.Query) + `\b`
		req.Regex = true
		var err error
		pattern := req.Query
		if !req.CaseSensitive {
			pattern = "(?i)" + pattern
		}
		regexPattern, err = regexp.Compile(pattern)
		if err != nil {
			return nil, fmt.Errorf("invalid regex: %w", err)
		}
	}

	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	// Build file set if specific files requested
	targetFiles := make(map[string]bool)
	for _, f := range req.Files {
		targetFiles[f] = true
	}

	var results []ReplaceResult
	changedFiles := make(map[string]bool)

	err := filepath.WalkDir(h.server.workspacePath, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}

		if d.IsDir() && searchExcludeDirs[d.Name()] {
			return filepath.SkipDir
		}
		if d.IsDir() && strings.HasPrefix(d.Name(), ".") && path != h.server.workspacePath {
			return filepath.SkipDir
		}
		if d.IsDir() {
			return nil
		}

		ext := strings.ToLower(filepath.Ext(d.Name()))
		if isBinaryExt(ext) {
			return nil
		}

		content, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		if isBinaryContent(content) {
			return nil
		}

		relPath, err := filepath.Rel(h.server.workspacePath, path)
		if err != nil {
			return nil
		}

		// Skip if specific files requested and this isn't one
		if len(targetFiles) > 0 && !targetFiles[relPath] {
			return nil
		}

		fileChanged := false
		lines := strings.Split(string(content), "\n")
		for lineNum, line := range lines {
			var col int
			var matched bool
			var newLine string

			if regexPattern != nil {
				// Regex-based matching and replacement
				loc := regexPattern.FindStringIndex(line)
				if loc != nil {
					matched = true
					col = loc[0]
					newLine = regexPattern.ReplaceAllString(line, req.Replacement)
				}
			} else {
				// Simple string matching
				searchLine := line
				q := req.Query
				if !req.CaseSensitive {
					searchLine = strings.ToLower(line)
					q = strings.ToLower(q)
				}
				col = strings.Index(searchLine, q)
				if col >= 0 {
					matched = true
					// Use ReplaceAll to replace ALL occurrences on this line
					if req.CaseSensitive {
						newLine = strings.ReplaceAll(line, req.Query, req.Replacement)
					} else if req.PreserveCase {
						newLine = caseInsensitiveReplaceAllWithCasePreserve(line, req.Query, req.Replacement)
					} else {
						// Case-insensitive replace all
						newLine = caseInsensitiveReplaceAll(line, req.Query, req.Replacement)
					}
				}
			}

			if matched {
				results = append(results, ReplaceResult{
					Path:    relPath,
					Line:    lineNum,
					Column:  col,
					OldLine: line,
					NewLine: newLine,
				})
				if !req.DryRun {
					lines[lineNum] = newLine
					fileChanged = true
				}
			}
		}

		if fileChanged && !req.DryRun {
			// Security: Validate resolved path is still within workspace (symlink check)
			absPath, err := filepath.EvalSymlinks(path)
			if err != nil {
				// File may have been removed — skip
				return nil
			}
			absWorkspace, err := filepath.EvalSymlinks(h.server.workspacePath)
			if err != nil {
				return fmt.Errorf("invalid workspace configuration: %w", err)
			}
			if !strings.HasPrefix(absPath, absWorkspace+string(filepath.Separator)) && absPath != absWorkspace {
				return fmt.Errorf("access denied: path %s resolved outside workspace", relPath)
			}

			// Atomic write (temp file + rename) to prevent partial writes
			dir := filepath.Dir(absPath)
			tmpFile, err := os.CreateTemp(dir, ".swarm-replace-*.tmp")
			if err != nil {
				return fmt.Errorf("failed to create temp file for %s: %w", relPath, err)
			}
			tmpPath := tmpFile.Name()
			newContent := strings.Join(lines, "\n")
			if _, err := tmpFile.Write([]byte(newContent)); err != nil {
				tmpFile.Close()
				os.Remove(tmpPath)
				return fmt.Errorf("failed to write temp file for %s: %w", relPath, err)
			}
			if err := tmpFile.Close(); err != nil {
				os.Remove(tmpPath)
				return fmt.Errorf("failed to close temp file for %s: %w", relPath, err)
			}
			if err := os.Rename(tmpPath, absPath); err != nil {
				os.Remove(tmpPath)
				return fmt.Errorf("failed to write %s: %w", relPath, err)
			}
			changedFiles[relPath] = true
		}

		return nil
	})

	if err != nil && err != io.EOF {
		return nil, safeError("replace failed", err)
	}

	if results == nil {
		results = []ReplaceResult{}
	}
	return map[string]any{
		"results":       results,
		"changedFiles":  len(changedFiles),
		"dryRun":        req.DryRun,
	}, nil
}

func (h *CommandHandler) handleReadFile(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	// Validate path
	if req.Path == "" {
		return nil, errValidation("path is required")
	}

	path := filepath.Clean(req.Path)

	// Security: Require workspace path to be set
	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	path = filepath.Join(h.server.workspacePath, path)
	// Security: Verify resolved path is still within workspace
	// Use EvalSymlinks to resolve symlinks and prevent traversal via symlinks
	absPath, err := filepath.EvalSymlinks(path)
	if err != nil {
		return nil, errValidation("invalid path")
	}
	absWorkspace, err := filepath.EvalSymlinks(h.server.workspacePath)
	if err != nil {
		return nil, errValidation("invalid workspace configuration")
	}
	if !strings.HasPrefix(absPath, absWorkspace+string(filepath.Separator)) && absPath != absWorkspace {
		return nil, errUnauthorized("access denied: path outside workspace")
	}

	// Check if file exists (use absPath to follow symlinks correctly)
	info, err := os.Stat(absPath)
	if err != nil {
		return nil, errNotFound("file")
	}

	if info.IsDir() {
		return nil, errValidation("path is a directory, not a file")
	}

	// Limit file size to prevent memory exhaustion
	const maxFileSize = 10 << 20 // 10 MB
	if info.Size() > maxFileSize {
		return nil, errValidation(fmt.Sprintf("file too large: %d bytes (max %d)", info.Size(), maxFileSize))
	}

	// Read file content (use absPath to follow symlinks correctly)
	content, err := os.ReadFile(absPath)
	if err != nil {
		return nil, safeError("failed to read file", err)
	}

	return map[string]string{"content": string(content)}, nil
}

func (h *CommandHandler) handleWriteFile(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	// Validate path
	if req.Path == "" {
		return nil, errValidation("path is required")
	}

	path := filepath.Clean(req.Path)

	// Security: Require workspace path to be set
	if h.server.workspacePath == "" {
		return nil, errNotConnected("workspace not configured")
	}

	path = filepath.Join(h.server.workspacePath, path)
	// Security: Verify resolved path is still within workspace
	// Use EvalSymlinks to resolve symlinks and prevent traversal via symlinks
	// For writes, the file may not exist yet, so eval the parent directory
	absWorkspace, err := filepath.EvalSymlinks(h.server.workspacePath)
	if err != nil {
		return nil, errNotConnected("invalid workspace configuration")
	}
	// Eval parent dir to catch symlinks in intermediate path components
	parentDir := filepath.Dir(path)
	absParent, err := filepath.EvalSymlinks(parentDir)
	if err != nil {
		// Parent doesn't exist yet — fall back to Abs for validation,
		// but verify no ".." components in the cleaned path that could escape workspace
		absParent, err = filepath.Abs(parentDir)
		if err != nil {
			return nil, errValidation("invalid path")
		}
		// When EvalSymlinks fails, check that no path component is ".."
		// to prevent traversal via non-existent directories
		relPath, relErr := filepath.Rel(absWorkspace, absParent)
		if relErr != nil || strings.HasPrefix(relPath, "..") {
			return nil, errValidation("access denied: path outside workspace")
		}
	}
	if !strings.HasPrefix(absParent, absWorkspace+string(filepath.Separator)) && absParent != absWorkspace {
		return nil, errValidation("access denied: path outside workspace")
	}

	// Limit content size to prevent memory/disk exhaustion
	const maxWriteSize = 10 << 20 // 10 MB
	if len(req.Content) > maxWriteSize {
		return nil, errValidation("content too large")
	}

	// Ensure parent directory exists
	if mkdirErr := os.MkdirAll(absParent, 0755); mkdirErr != nil {
		return nil, safeError("failed to create directory", mkdirErr)
	}
	// Re-validate after MkdirAll in case a symlink was created in the interim
	if postMkdirAbs, err := filepath.EvalSymlinks(parentDir); err == nil {
		if !strings.HasPrefix(postMkdirAbs, absWorkspace+string(filepath.Separator)) && postMkdirAbs != absWorkspace {
			return nil, errValidation("access denied: path outside workspace")
		}
	}

	// Write file atomically (temp file + rename) to prevent partial writes
	// and concurrent reads seeing corrupted data
	absPath := filepath.Join(absParent, filepath.Base(path))
	tmpFile, err := os.CreateTemp(absParent, ".swarm-write-*.tmp")
	if err != nil {
		return nil, safeError("failed to create temp file", err)
	}
	tmpPath := tmpFile.Name()
	if _, err := tmpFile.Write([]byte(req.Content)); err != nil {
		tmpFile.Close()
		os.Remove(tmpPath)
		return nil, safeError("failed to write temp file", err)
	}
	if err := tmpFile.Close(); err != nil {
		os.Remove(tmpPath)
		return nil, safeError("failed to close temp file", err)
	}
	// Rename is atomic on POSIX systems
	if err := os.Rename(tmpPath, absPath); err != nil {
		os.Remove(tmpPath)
		return nil, safeError("failed to rename file", err)
	}

	return map[string]string{"status": "written"}, nil
}

func (h *CommandHandler) handleDeleteFile(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if req.Path == "" {
		return nil, errValidation("path is required")
	}

	path, err := h.safePath(req.Path)
	if err != nil {
		return nil, err
	}

	// Check if path exists
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, errValidation("file not found")
		}
		return nil, safeError("failed to stat file", err)
	}

	// Delete file or directory
	if info.IsDir() {
		if err := os.RemoveAll(path); err != nil {
			return nil, safeError("failed to remove directory", err)
		}
	} else {
		if err := os.Remove(path); err != nil {
			return nil, safeError("failed to remove file", err)
		}
	}

	return map[string]string{"status": "deleted"}, nil
}

func (h *CommandHandler) handleRenameFile(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		OldPath string `json:"oldPath"`
		NewPath string `json:"newPath"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if req.OldPath == "" || req.NewPath == "" {
		return nil, errValidation("oldPath and newPath are required")
	}

	oldPath, err := h.safePath(req.OldPath)
	if err != nil {
		return nil, err
	}

	newPath, err := h.safePath(req.NewPath)
	if err != nil {
		return nil, err
	}

	// Check if source exists
	if _, err := os.Stat(oldPath); err != nil {
		if os.IsNotExist(err) {
			return nil, errValidation("source file not found")
		}
		return nil, safeError("failed to stat source file", err)
	}

	// Check if destination already exists
	if _, err := os.Stat(newPath); err == nil {
		return nil, errValidation("destination already exists")
	}

	// Ensure parent directory exists for destination
	if err := os.MkdirAll(filepath.Dir(newPath), 0755); err != nil {
		return nil, safeError("failed to create parent directory", err)
	}

	// Rename
	if err := os.Rename(oldPath, newPath); err != nil {
		return nil, safeError("failed to rename file", err)
	}

	return map[string]string{"status": "renamed"}, nil
}

func (h *CommandHandler) handleCreateFile(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if req.Path == "" {
		return nil, errValidation("path is required")
	}

	path, err := h.safePath(req.Path)
	if err != nil {
		return nil, err
	}

	// Check if file already exists
	if _, err := os.Stat(path); err == nil {
		return nil, errValidation("file already exists")
	}

	// Ensure parent directory exists
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return nil, safeError("failed to create parent directory", err)
	}

	// Create empty file
	file, err := os.Create(path)
	if err != nil {
		return nil, safeError("failed to create file", err)
	}
	file.Close()

	return map[string]string{"status": "created"}, nil
}

func (h *CommandHandler) handleCopyFile(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		SrcPath string `json:"srcPath"`
		DstPath string `json:"dstPath"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if req.SrcPath == "" || req.DstPath == "" {
		return nil, errValidation("srcPath and dstPath are required")
	}

	srcPath, err := h.safePath(req.SrcPath)
	if err != nil {
		return nil, err
	}

	dstPath, err := h.safePath(req.DstPath)
	if err != nil {
		return nil, err
	}

	// Prevent copying onto itself (after path normalization)
	if filepath.Clean(srcPath) == filepath.Clean(dstPath) {
		return nil, errValidation("cannot copy file onto itself")
	}

	srcInfo, err := os.Stat(srcPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, errValidation("source not found")
		}
		return nil, safeError("failed to stat source", err)
	}

	// If destination exists and is a directory, append source basename
	if info, err := os.Stat(dstPath); err == nil && info.IsDir() {
		dstPath = filepath.Join(dstPath, filepath.Base(srcPath))
	}

	// Re-check self-copy after resolving destination directory
	if filepath.Clean(srcPath) == filepath.Clean(dstPath) {
		return nil, errValidation("cannot copy file onto itself")
	}

	// Check destination doesn't already exist
	if _, err := os.Stat(dstPath); err == nil {
		return nil, errValidation("destination already exists")
	}

	// Ensure parent directory exists
	if err := os.MkdirAll(filepath.Dir(dstPath), 0755); err != nil {
		return nil, safeError("failed to create parent directory", err)
	}

	if srcInfo.IsDir() {
		err = filepath.WalkDir(srcPath, func(path string, d os.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			rel, _ := filepath.Rel(srcPath, path)
			dst := filepath.Join(dstPath, rel)

			if d.IsDir() {
				return os.MkdirAll(dst, 0755)
			}

			// Copy file with explicit close to avoid FD leak in large directories
			return copyFileContents(path, dst, srcInfo.Mode())
		})
	} else {
		err = copyFileContents(srcPath, dstPath, srcInfo.Mode())
	}

	if err != nil {
		return nil, safeError("failed to copy file", err)
	}

	return map[string]string{"status": "copied"}, nil
}

func (h *CommandHandler) handleMkdir(ctx context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	if req.Path == "" {
		return nil, errValidation("path is required")
	}

	path, err := h.safePath(req.Path)
	if err != nil {
		return nil, err
	}

	// Check if already exists
	if info, err := os.Stat(path); err == nil {
		if info.IsDir() {
			return nil, errValidation("directory already exists")
		}
		return nil, errValidation("file exists with same name")
	}

	// Create directory
	if err := os.MkdirAll(path, 0755); err != nil {
		return nil, safeError("failed to create directory", err)
	}

	return map[string]string{"status": "created"}, nil
}

func (h *CommandHandler) handleRevealFile(_ context.Context, params json.RawMessage) (any, error) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.Unmarshal(params, &req); err != nil {
		return nil, safeUnmarshalError(err)
	}

	// Validate path using h.safePath (security: prevents path traversal)
	path, err := h.safePath(req.Path)
	if err != nil {
		return nil, err
	}

	// Ensure path exists
	if _, err := os.Stat(path); err != nil {
		return nil, fmt.Errorf("path does not exist: %s", path)
	}

	// Use OS-specific command to reveal file
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		// macOS: open -R reveals the file in Finder
		cmd = exec.Command("open", "-R", path)
	case "windows":
		// Windows: explorer /select, reveals the file
		cmd = exec.Command("explorer", "/select,", path)
	default:
		// Linux: xdg-open opens the containing folder
		dir := filepath.Dir(path)
		cmd = exec.Command("xdg-open", dir)
	}

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("failed to reveal file: %w", err)
	}

	return map[string]bool{"success": true}, nil
}
