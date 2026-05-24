// Package api provides file watching for workspace directory changes.
package api

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"

	"github.com/swarm-editor/swarm-editor/internal/log"
)

var fwLog = log.With("component", "FileWatcher")

// FileEventType describes the kind of file system change.
type FileEventType string

const (
	FileChanged FileEventType = "workspace_file_changed"
	FileCreated FileEventType = "workspace_file_created"
	FileDeleted FileEventType = "workspace_file_deleted"
)

// FileEvent represents a single file system change broadcast to clients.
type FileEvent struct {
	Path      string `json:"path"`
	EventType string `json:"eventType"`
	GitStatus string `json:"gitStatus,omitempty"`
	Timestamp string `json:"timestamp"`
}

// FileWatcher watches a workspace directory and broadcasts file change events.
type FileWatcher struct {
	watcher   *fsnotify.Watcher
	hub       *ClientHub
	workspace string

	// debounce coalesces rapid events for the same file
	debounce   map[string]time.Time
	debounceMu sync.Mutex

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// NewFileWatcher creates a new FileWatcher. It does not start watching until
// Watch is called.
func NewFileWatcher(hub *ClientHub) *FileWatcher {
	return &FileWatcher{
		hub:     hub,
		debounce: make(map[string]time.Time),
	}
}

// Watch starts watching the given directory. If a previous watch is active it
// is stopped first. The watcher monitors the workspace root recursively.
func (fw *FileWatcher) Watch(workspace string) error {
	fw.Stop()

	if workspace == "" {
		return nil
	}

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}

	if err := watcher.Add(workspace); err != nil {
		watcher.Close()
		return err
	}

	// Recursively add subdirectories for full coverage
	addSubdirs(watcher, workspace)

	fwLog.Info("Watching workspace", "dir", workspace)

	ctx, cancel := context.WithCancel(context.Background())

	fw.watcher = watcher
	fw.workspace = workspace
	fw.ctx = ctx
	fw.cancel = cancel

	fw.wg.Add(1)
	go fw.eventLoop()

	return nil
}

// Stop stops the file watcher and releases resources.
func (fw *FileWatcher) Stop() {
	if fw.cancel != nil {
		fw.cancel()
	}
	fw.wg.Wait()

	if fw.watcher != nil {
		fw.watcher.Close()
		fw.watcher = nil
	}
	fw.workspace = ""
	fw.cancel = nil
}

// eventLoop reads events from the fsnotify watcher, classifies them, and
// broadcasts to connected clients via the hub.
func (fw *FileWatcher) eventLoop() {
	defer fw.wg.Done()

	// Debounce interval — events for the same file within this window are coalesced.
	const debounceInterval = 100 * time.Millisecond

	for {
		select {
		case <-fw.ctx.Done():
			return

		case event, ok := <-fw.watcher.Events:
			if !ok {
				return
			}
			// Auto-watch new directories
			if event.Has(fsnotify.Create) {
				if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
					if !isNoisePath(event.Name) {
						_ = fw.watcher.Add(event.Name)
					}
				}
			}
			fw.handleEvent(event, debounceInterval)

		case err, ok := <-fw.watcher.Errors:
			if !ok {
				return
			}
			fwLog.Warn("Watcher error", "error", err)
		}
	}
}

// handleEvent classifies a single fsnotify event and broadcasts it.
func (fw *FileWatcher) handleEvent(event fsnotify.Event, debounceInterval time.Duration) {
	// Skip irrelevant events (chmod, xattr, etc.)
	if !event.Has(fsnotify.Create) && !event.Has(fsnotify.Write) && !event.Has(fsnotify.Remove) && !event.Has(fsnotify.Rename) {
		return
	}

	// Resolve to absolute path
	absPath := event.Name
	if !filepath.IsAbs(absPath) {
		absPath = filepath.Join(fw.workspace, absPath)
	}

	// Filter out common noise directories
	if isNoisePath(absPath) {
		return
	}

	// Debounce: skip if we recently processed an event for this path
	fw.debounceMu.Lock()
	if last, ok := fw.debounce[absPath]; ok && time.Since(last) < debounceInterval {
		fw.debounceMu.Unlock()
		return
	}
	fw.debounce[absPath] = time.Now()
	fw.debounceMu.Unlock()

	// Classify the event
	var eventType FileEventType
	var gitStatus string
	switch {
	case event.Has(fsnotify.Create):
		eventType = FileCreated
		gitStatus = "Added"
	case event.Has(fsnotify.Write):
		eventType = FileChanged
		gitStatus = "Modified"
	case event.Has(fsnotify.Remove) || event.Has(fsnotify.Rename):
		eventType = FileDeleted
		gitStatus = "Deleted"
	default:
		return
	}

	// Compute relative path from workspace root
	relPath := absPath
	if strings.HasPrefix(absPath, fw.workspace) {
		relPath = strings.TrimPrefix(absPath, fw.workspace)
		relPath = strings.TrimPrefix(relPath, string(filepath.Separator))
	}

	payload := FileEvent{
		Path:      relPath,
		EventType: string(eventType),
		GitStatus: gitStatus,
		Timestamp: time.Now().Format(time.RFC3339Nano),
	}

	fw.hub.Broadcast(string(eventType), payload)
}

// isNoisePath returns true for paths that should not generate events.
func isNoisePath(path string) bool {
	// Check each path component
	parts := strings.Split(filepath.ToSlash(path), "/")
	for _, part := range parts {
		switch part {
		case ".git", "node_modules", ".cache", "__pycache__",
			".next", "dist", "build", "target", "vendor",
			".idea", ".vscode", ".terraform", "bin":
			return true
		}
	}
	return false
}

// addSubdirs recursively adds all non-noise subdirectories to the watcher.
func addSubdirs(watcher *fsnotify.Watcher, root string) {
	filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil || !d.IsDir() {
			return nil
		}
		if isNoisePath(path) {
			return filepath.SkipDir
		}
		if path != root {
			_ = watcher.Add(path)
		}
		return nil
	})
}
