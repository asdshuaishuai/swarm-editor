// Package api provides HTTP handlers for the swarm editor
package api

import (
	"encoding/json"
	"fmt"
	"maps"
	"net/http"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"
)

// Workspace represents a workspace in the editor
type Workspace struct {
	ID        string              `json:"id"`
	Name      string              `json:"name"`
	Path      string              `json:"path"`
	CreatedAt time.Time           `json:"createdAt"`
	UpdatedAt time.Time           `json:"updatedAt"`
	Files     []WorkspaceFileInfo `json:"files"`
	OpenFiles []string            `json:"openFiles"`
	Cursors   map[string]Cursor   `json:"cursors"`   // userID -> Cursor
	FileLocks map[string]string   `json:"fileLocks"` // filePath -> userID
	Metadata  map[string]any      `json:"metadata"`
}

// WorkspaceFileInfo represents information about a file in workspace
type WorkspaceFileInfo struct {
	Path     string    `json:"path"`
	Name     string    `json:"name"`
	Size     int64     `json:"size"`
	Modified time.Time `json:"modified"`
	IsDir    bool      `json:"isDir"`
}

// Cursor represents a user's cursor position
type Cursor struct {
	UserID    string `json:"userId"`
	FilePath  string `json:"filePath"`
	Line      int    `json:"line"`
	Column    int    `json:"column"`
	UpdatedAt int64  `json:"updatedAt"` // Unix timestamp
}

// WorkspaceManager manages workspaces
type WorkspaceManager struct {
	mu         sync.RWMutex
	workspaces map[string]*Workspace
	byPath     map[string]string // path -> workspaceID
}

// NewWorkspaceManager creates a new workspace manager
func NewWorkspaceManager() *WorkspaceManager {
	return &WorkspaceManager{
		workspaces: make(map[string]*Workspace),
		byPath:     make(map[string]string),
	}
}

// Create creates a new workspace
func (m *WorkspaceManager) Create(id, name, path string) *Workspace {
	m.mu.Lock()
	defer m.mu.Unlock()

	workspace := &Workspace{
		ID:        id,
		Name:      name,
		Path:      path,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		Files:     make([]WorkspaceFileInfo, 0),
		OpenFiles: make([]string, 0),
		Cursors:   make(map[string]Cursor),
		FileLocks: make(map[string]string),
		Metadata:  make(map[string]any),
	}

	m.workspaces[id] = workspace
	m.byPath[path] = id

	return workspace
}

// Get retrieves a workspace by ID. Returns a copy to prevent mutation of internal state.
func (m *WorkspaceManager) Get(id string) *Workspace {
	m.mu.RLock()
	defer m.mu.RUnlock()
	w, ok := m.workspaces[id]
	if !ok {
		return nil
	}
	return copyWorkspace(w)
}

// GetByPath retrieves a workspace by path. Returns a copy to prevent mutation.
func (m *WorkspaceManager) GetByPath(path string) *Workspace {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if id, ok := m.byPath[path]; ok {
		return copyWorkspace(m.workspaces[id])
	}
	return nil
}

// List returns copies of all workspaces
func (m *WorkspaceManager) List() []*Workspace {
	m.mu.RLock()
	defer m.mu.RUnlock()

	workspaces := make([]*Workspace, 0, len(m.workspaces))
	for _, w := range m.workspaces {
		workspaces = append(workspaces, copyWorkspace(w))
	}
	return workspaces
}

// copyWorkspace creates a deep copy of a workspace
func copyWorkspace(w *Workspace) *Workspace {
	if w == nil {
		return nil
	}
	cp := *w
	if w.Files != nil {
		cp.Files = make([]WorkspaceFileInfo, len(w.Files))
		copy(cp.Files, w.Files)
	}
	if w.OpenFiles != nil {
		cp.OpenFiles = make([]string, len(w.OpenFiles))
		copy(cp.OpenFiles, w.OpenFiles)
	}
	if w.Cursors != nil {
		cp.Cursors = make(map[string]Cursor, len(w.Cursors))
		maps.Copy(cp.Cursors, w.Cursors)
	}
	if w.FileLocks != nil {
		cp.FileLocks = make(map[string]string, len(w.FileLocks))
		maps.Copy(cp.FileLocks, w.FileLocks)
	}
	if w.Metadata != nil {
		cp.Metadata = deepCopyMapAny(w.Metadata)
	}
	return &cp
}

// deepCopyMapAny creates a deep copy of map[string]any to prevent external mutation
func deepCopyMapAny(src map[string]any) map[string]any {
	if src == nil {
		return nil
	}
	dst := make(map[string]any, len(src))
	for k, v := range src {
		dst[k] = deepCopyAnyValue(v)
	}
	return dst
}

// deepCopyAnyValue recursively deep copies any value
func deepCopyAnyValue(v any) any {
	if v == nil {
		return nil
	}
	switch val := v.(type) {
	case map[string]any:
		return deepCopyMapAny(val)
	case []any:
		dst := make([]any, len(val))
		for i, elem := range val {
			dst[i] = deepCopyAnyValue(elem)
		}
		return dst
	case map[string]string:
		dst := make(map[string]string, len(val))
		maps.Copy(dst, val)
		return dst
	case []string:
		dst := slices.Clone(val)
		return dst
	case int, int64, float64, bool, string, time.Time:
		return v // immutable, return as-is
	default:
		// For other types, try JSON round-trip for deep copy
		// If that fails, return as-is (shallow copy as fallback)
		data, err := json.Marshal(v)
		if err != nil {
			return v
		}
		var copied any
		if err := json.Unmarshal(data, &copied); err != nil {
			return v
		}
		return copied
	}
}

// Delete removes a workspace
func (m *WorkspaceManager) Delete(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if w, ok := m.workspaces[id]; ok {
		delete(m.byPath, w.Path)
	}
	delete(m.workspaces, id)
}

// LockFile locks a file for a user
func (m *WorkspaceManager) LockFile(workspaceID, filePath, userID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	workspace, ok := m.workspaces[workspaceID]
	if !ok {
		return fmt.Errorf("workspace not found")
	}

	// Normalize path to prevent duplicate locks for same file
	normalizedPath := filepath.Clean(filePath)

	// Check if file is already locked
	if lockOwner, locked := workspace.FileLocks[normalizedPath]; locked && lockOwner != userID {
		return fmt.Errorf("file is locked by another user")
	}

	workspace.FileLocks[normalizedPath] = userID
	workspace.UpdatedAt = time.Now()
	return nil
}

// UnlockFile releases a file lock
func (m *WorkspaceManager) UnlockFile(workspaceID, filePath, userID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	workspace, ok := m.workspaces[workspaceID]
	if !ok {
		return fmt.Errorf("workspace not found")
	}

	// Normalize path for consistent lookup
	normalizedPath := filepath.Clean(filePath)

	// Verify lock ownership
	if lockOwner, locked := workspace.FileLocks[normalizedPath]; locked {
		if lockOwner != userID {
			return fmt.Errorf("file is locked by another user")
		}
		delete(workspace.FileLocks, normalizedPath)
		workspace.UpdatedAt = time.Now()
	}

	return nil
}

// UpdateCursor updates a user's cursor position
func (m *WorkspaceManager) UpdateCursor(workspaceID, userID string, cursor Cursor) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	workspace, ok := m.workspaces[workspaceID]
	if !ok {
		return fmt.Errorf("workspace not found")
	}

	cursor.UserID = userID
	cursor.UpdatedAt = time.Now().Unix()
	workspace.Cursors[userID] = cursor
	workspace.UpdatedAt = time.Now()

	return nil
}

// GetCursors returns all cursor positions for a workspace
func (m *WorkspaceManager) GetCursors(workspaceID string) ([]Cursor, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	workspace, ok := m.workspaces[workspaceID]
	if !ok {
		return nil, fmt.Errorf("workspace not found")
	}

	cursors := make([]Cursor, 0, len(workspace.Cursors))
	for _, cursor := range workspace.Cursors {
		cursors = append(cursors, cursor)
	}
	return cursors, nil
}

// UpdateFiles updates the file list for a workspace
func (m *WorkspaceManager) UpdateFiles(workspaceID string, files []WorkspaceFileInfo) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	workspace, ok := m.workspaces[workspaceID]
	if !ok {
		return fmt.Errorf("workspace not found")
	}

	workspace.Files = files
	workspace.UpdatedAt = time.Now()
	return nil
}

// AddOpenFile adds a file to the open files list
func (m *WorkspaceManager) AddOpenFile(workspaceID, filePath string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	workspace, ok := m.workspaces[workspaceID]
	if !ok {
		return fmt.Errorf("workspace not found")
	}

	// Check if already open
	if slices.Contains(workspace.OpenFiles, filePath) {
		return nil
	}

	workspace.OpenFiles = append(workspace.OpenFiles, filePath)
	workspace.UpdatedAt = time.Now()
	return nil
}

// RemoveOpenFile removes a file from the open files list
func (m *WorkspaceManager) RemoveOpenFile(workspaceID, filePath string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	workspace, ok := m.workspaces[workspaceID]
	if !ok {
		return fmt.Errorf("workspace not found")
	}

	for i, f := range workspace.OpenFiles {
		if f == filePath {
			workspace.OpenFiles = append(workspace.OpenFiles[:i], workspace.OpenFiles[i+1:]...)
			workspace.UpdatedAt = time.Now()
			break
		}
	}

	return nil
}

// HTTP Handlers

// HandleListWorkspaces handles GET /workspaces
func (m *WorkspaceManager) HandleListWorkspaces(w http.ResponseWriter, r *http.Request) {
	workspaces := m.List()
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(workspaces); err != nil {
		apiError(w, err, "failed to encode workspaces", http.StatusInternalServerError)
	}
}

// HandleGetWorkspace handles GET /workspaces/{id}
func (m *WorkspaceManager) HandleGetWorkspace(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "workspace id required", http.StatusBadRequest)
		return
	}

	workspace := m.Get(id)
	if workspace == nil {
		http.Error(w, "workspace not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(workspace); err != nil {
		apiError(w, err, "failed to encode workspace", http.StatusInternalServerError)
	}
}

// HandleCreateWorkspace handles POST /workspaces
func (m *WorkspaceManager) HandleCreateWorkspace(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID   string `json:"id"`
		Name string `json:"name"`
		Path string `json:"path"`
	}

	if !decodeJSON(w, r, &req) {
		return
	}

	if req.ID == "" || req.Path == "" {
		http.Error(w, "id and path required", http.StatusBadRequest)
		return
	}

	// Resolve and validate path to prevent traversal attacks
	absPath, err := filepath.Abs(req.Path)
	if err != nil {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}
	// Reject paths containing traversal sequences
	if strings.Contains(absPath, "..") {
		http.Error(w, "path traversal is not allowed", http.StatusBadRequest)
		return
	}

	workspace := m.Create(req.ID, req.Name, absPath)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(workspace); err != nil {
		apiError(w, err, "failed to encode workspace", http.StatusInternalServerError)
	}
}

// HandleLockFile handles POST /workspaces/{id}/lock
func (m *WorkspaceManager) HandleLockFile(w http.ResponseWriter, r *http.Request) {
	workspaceID := r.PathValue("id")
	if workspaceID == "" {
		http.Error(w, "workspace id required", http.StatusBadRequest)
		return
	}

	var req struct {
		FilePath string `json:"filePath"`
		UserID   string `json:"userId"`
	}

	if !decodeJSON(w, r, &req) {
		return
	}

	if strings.TrimSpace(req.FilePath) == "" {
		http.Error(w, "filePath is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.UserID) == "" {
		http.Error(w, "userId is required", http.StatusBadRequest)
		return
	}

	if err := m.LockFile(workspaceID, req.FilePath, req.UserID); err != nil {
		apiError(w, err, "failed to lock file", http.StatusConflict)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// HandleUnlockFile handles DELETE /workspaces/{id}/lock
func (m *WorkspaceManager) HandleUnlockFile(w http.ResponseWriter, r *http.Request) {
	workspaceID := r.PathValue("id")
	if workspaceID == "" {
		http.Error(w, "workspace id required", http.StatusBadRequest)
		return
	}

	var req struct {
		FilePath string `json:"filePath"`
		UserID   string `json:"userId"`
	}

	if !decodeJSON(w, r, &req) {
		return
	}

	if strings.TrimSpace(req.FilePath) == "" {
		http.Error(w, "filePath is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.UserID) == "" {
		http.Error(w, "userId is required", http.StatusBadRequest)
		return
	}

	if err := m.UnlockFile(workspaceID, req.FilePath, req.UserID); err != nil {
		apiError(w, err, "failed to unlock file", http.StatusConflict)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// HandleUpdateCursor handles POST /workspaces/{id}/cursor
func (m *WorkspaceManager) HandleUpdateCursor(w http.ResponseWriter, r *http.Request) {
	workspaceID := r.PathValue("id")
	if workspaceID == "" {
		http.Error(w, "workspace id required", http.StatusBadRequest)
		return
	}

	var req struct {
		UserID   string `json:"userId"`
		FilePath string `json:"filePath"`
		Line     int    `json:"line"`
		Column   int    `json:"column"`
	}

	if !decodeJSON(w, r, &req) {
		return
	}

	if strings.TrimSpace(req.UserID) == "" {
		http.Error(w, "userId is required", http.StatusBadRequest)
		return
	}

	cursor := Cursor{
		FilePath: req.FilePath,
		Line:     req.Line,
		Column:   req.Column,
	}

	if err := m.UpdateCursor(workspaceID, req.UserID, cursor); err != nil {
		apiError(w, err, "failed to update cursor", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// HandleGetCursors handles GET /workspaces/{id}/cursors
func (m *WorkspaceManager) HandleGetCursors(w http.ResponseWriter, r *http.Request) {
	workspaceID := r.PathValue("id")
	if workspaceID == "" {
		http.Error(w, "workspace id required", http.StatusBadRequest)
		return
	}

	cursors, err := m.GetCursors(workspaceID)
	if err != nil {
		apiError(w, err, "failed to get cursors", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(cursors); err != nil {
		apiError(w, err, "failed to encode cursors", http.StatusInternalServerError)
	}
}
