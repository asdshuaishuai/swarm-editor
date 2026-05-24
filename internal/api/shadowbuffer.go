package api

import (
	"strings"
	"sync"
	"time"
)

// PendingPatch represents a code change staged in the shadow buffer.
type PendingPatch struct {
	ID        string    `json:"id"`
	AgentID   string    `json:"agentId"`
	Path      string    `json:"path"`
	OldContent string   `json:"oldContent"`
	NewContent string   `json:"newContent"`
	CreatedAt time.Time `json:"createdAt"`
}

// ShadowBuffer holds pending code patches before they are written to disk.
type ShadowBuffer struct {
	mu     sync.RWMutex
	patches map[string]*PendingPatch // keyed by patch ID
	nextID  int
}

// NewShadowBuffer creates a shadow buffer for code change double-buffering.
func NewShadowBuffer() *ShadowBuffer {
	return &ShadowBuffer{
		patches: make(map[string]*PendingPatch),
	}
}

// Stage adds a pending patch and returns its ID.
func (sb *ShadowBuffer) Stage(agentID, path, oldContent, newContent string) string {
	sb.mu.Lock()
	defer sb.mu.Unlock()

	sb.nextID++
	id := agentID + "-" + path + "-" + time.Now().Format("20060102-150405")

	sb.patches[id] = &PendingPatch{
		ID:         id,
		AgentID:    agentID,
		Path:       path,
		OldContent: oldContent,
		NewContent: newContent,
		CreatedAt:  time.Now(),
	}
	return id
}

// Get retrieves a pending patch by ID.
func (sb *ShadowBuffer) Get(id string) (*PendingPatch, bool) {
	sb.mu.RLock()
	defer sb.mu.RUnlock()
	p, ok := sb.patches[id]
	return p, ok
}

// List returns all pending patches, optionally filtered by agentID.
func (sb *ShadowBuffer) List(agentID string) []*PendingPatch {
	sb.mu.RLock()
	defer sb.mu.RUnlock()

	result := make([]*PendingPatch, 0)
	for _, p := range sb.patches {
		if agentID == "" || p.AgentID == agentID {
			result = append(result, p)
		}
	}
	return result
}

// Commit removes a patch from the buffer (approved and written to disk).
func (sb *ShadowBuffer) Commit(id string) bool {
	sb.mu.Lock()
	defer sb.mu.Unlock()
	if _, ok := sb.patches[id]; ok {
		delete(sb.patches, id)
		return true
	}
	return false
}

// Reject removes a patch without writing (discarded).
func (sb *ShadowBuffer) Reject(id string) bool {
	return sb.Commit(id) // same operation: remove from buffer
}

// Diff returns a unified diff between old and new content for a patch.
func (p *PendingPatch) Diff() string {
	oldLines := strings.Split(p.OldContent, "\n")
	newLines := strings.Split(p.NewContent, "\n")

	var sb strings.Builder
	sb.WriteString("--- a/" + p.Path + "\n")
	sb.WriteString("+++ b/" + p.Path + "\n")

	maxLen := len(oldLines)
	if len(newLines) > maxLen {
		maxLen = len(newLines)
	}

	for i := 0; i < maxLen; i++ {
		oldLine := ""
		newLine := ""
		if i < len(oldLines) {
			oldLine = oldLines[i]
		}
		if i < len(newLines) {
			newLine = newLines[i]
		}

		if oldLine != newLine {
			if oldLine != "" {
				sb.WriteString("-" + oldLine + "\n")
			}
			if newLine != "" {
				sb.WriteString("+" + newLine + "\n")
			}
		} else {
			sb.WriteString(" " + oldLine + "\n")
		}
	}
	return sb.String()
}
