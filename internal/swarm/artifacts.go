package swarm

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
)

// WorkflowArtifactType defines the type of an artifact (Prefect 3 pattern).
// Each type has different rendering and storage semantics.
type WorkflowArtifactType string

const (
	WorkflowArtifactTypeJSON     WorkflowArtifactType = "json"
	WorkflowArtifactTypeMarkdown WorkflowArtifactType = "markdown"
	WorkflowArtifactTypeTable    WorkflowArtifactType = "table"
	WorkflowArtifactTypeLink     WorkflowArtifactType = "link"
	WorkflowArtifactTypeText     WorkflowArtifactType = "text"
	WorkflowArtifactTypeProgress WorkflowArtifactType = "progress"
)

// WorkflowArtifact represents a typed, versioned output from a workflow execution.
// Modeled after Prefect 3 Artifacts:
//   - Typed: each artifact has a type (json, markdown, table, link, text, progress)
//   - Versioned: artifacts can be updated with version history
//   - Scoped: artifacts belong to a workflow + node
//   - Queryable: artifacts can be listed and filtered
type WorkflowArtifact struct {
	ID          string               `json:"id"`
	WorkflowID  string               `json:"workflowId"`
	NodeID      string               `json:"nodeId,omitempty"`
	Key         string               `json:"key"` // unique key within workflow scope
	Type        WorkflowArtifactType `json:"type"`
	Data        any                  `json:"data"` // the actual artifact content
	Description string               `json:"description,omitempty"`
	Version     int                  `json:"version"`
	CreatedAt   time.Time            `json:"createdAt"`
	UpdatedAt   time.Time            `json:"updatedAt"`
	Metadata    map[string]string    `json:"metadata,omitempty"` // arbitrary key-value pairs

	mu sync.Mutex
}

// WorkflowArtifactStore manages artifacts with thread-safe CRUD and query operations.
// Artifacts are keyed by (workflowID, key) for uniqueness — creating an artifact
// with an existing key updates it (version increment).
type WorkflowArtifactStore struct {
	mu         sync.RWMutex
	artifacts  map[string]*WorkflowArtifact // keyed by workflowID:key
	maxPerNode int                          // max artifacts per (workflowID, nodeID), 0 = unlimited
}

// NewWorkflowArtifactStore creates a new artifact store.
func NewWorkflowArtifactStore() *WorkflowArtifactStore {
	return &WorkflowArtifactStore{
		artifacts:  make(map[string]*WorkflowArtifact),
		maxPerNode: 100,
	}
}

// SetMaxPerNode sets the maximum number of artifacts per (workflowID, nodeID) pair.
func (s *WorkflowArtifactStore) SetMaxPerNode(max int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.maxPerNode = max
}

// workflowArtifactKey generates the map key for an artifact.
func workflowArtifactKey(workflowID, key string) string {
	return workflowID + ":" + key
}

// CreateOrUpdate creates a new artifact or updates an existing one.
// If an artifact with the same (workflowID, key) exists, its version is incremented
// and data is replaced. Returns the (possibly new) artifact.
func (s *WorkflowArtifactStore) CreateOrUpdate(artifact *WorkflowArtifact) (*WorkflowArtifact, error) {
	if artifact.ID == "" {
		artifact.ID = fmt.Sprintf("art-%s", uuid.New().String()[:8])
	}
	if artifact.WorkflowID == "" {
		return nil, fmt.Errorf("workflowID is required")
	}
	if artifact.Key == "" {
		return nil, fmt.Errorf("key is required")
	}
	if artifact.Type == "" {
		artifact.Type = WorkflowArtifactTypeJSON
	}

	key := workflowArtifactKey(artifact.WorkflowID, artifact.Key)
	now := time.Now()

	s.mu.Lock()
	defer s.mu.Unlock()

	existing, ok := s.artifacts[key]
	if ok {
		// Update existing artifact (version increment, preserve ID)
		existing.mu.Lock()
		existing.Type = artifact.Type
		existing.Data = deepCopyAny(artifact.Data) // Deep copy to prevent external mutation
		existing.Description = artifact.Description
		existing.Version++
		existing.UpdatedAt = now
		if artifact.Metadata != nil {
			// Deep copy metadata map
			existing.Metadata = make(map[string]string, len(artifact.Metadata))
			for k, v := range artifact.Metadata {
				existing.Metadata[k] = v
			}
		}
		existing.mu.Unlock()
		return snapshotWorkflowArtifact(existing), nil
	}

	// New artifact - create a deep copy to prevent external mutation
	newArtifact := &WorkflowArtifact{
		ID:          fmt.Sprintf("art-%s", uuid.New().String()[:8]),
		WorkflowID:  artifact.WorkflowID,
		NodeID:      artifact.NodeID,
		Key:         artifact.Key,
		Type:        artifact.Type,
		Data:        deepCopyAny(artifact.Data),
		Description: artifact.Description,
		Version:     0,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if artifact.Metadata != nil {
		newArtifact.Metadata = make(map[string]string, len(artifact.Metadata))
		for k, v := range artifact.Metadata {
			newArtifact.Metadata[k] = v
		}
	} else {
		newArtifact.Metadata = make(map[string]string)
	}
	s.artifacts[key] = newArtifact
	return snapshotWorkflowArtifact(newArtifact), nil
}

// Get retrieves an artifact by workflowID and key.
func (s *WorkflowArtifactStore) Get(workflowID, key string) *WorkflowArtifact {
	s.mu.RLock()
	defer s.mu.RUnlock()
	a, ok := s.artifacts[workflowArtifactKey(workflowID, key)]
	if !ok {
		return nil
	}
	return snapshotWorkflowArtifact(a)
}

// GetByID retrieves an artifact by its ID.
func (s *WorkflowArtifactStore) GetByID(id string) *WorkflowArtifact {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, a := range s.artifacts {
		a.mu.Lock()
		aID := a.ID
		a.mu.Unlock()
		if aID == id {
			return snapshotWorkflowArtifact(a)
		}
	}
	return nil
}

// ListByWorkflow returns all artifacts for a workflow, optionally filtered by nodeID.
func (s *WorkflowArtifactStore) ListByWorkflow(workflowID string, nodeID string) []*WorkflowArtifact {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*WorkflowArtifact
	for _, a := range s.artifacts {
		a.mu.Lock()
		wfID := a.WorkflowID
		nID := a.NodeID
		a.mu.Unlock()
		if wfID != workflowID {
			continue
		}
		if nodeID != "" && nID != nodeID {
			continue
		}
		result = append(result, snapshotWorkflowArtifact(a))
	}
	return result
}

// Delete removes an artifact by workflowID and key. Returns true if the artifact existed.
func (s *WorkflowArtifactStore) Delete(workflowID, key string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, existed := s.artifacts[workflowArtifactKey(workflowID, key)]
	delete(s.artifacts, workflowArtifactKey(workflowID, key))
	return existed
}

// DeleteByWorkflow removes all artifacts for a workflow.
func (s *WorkflowArtifactStore) DeleteByWorkflow(workflowID string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	count := 0
	for k, a := range s.artifacts {
		a.mu.Lock()
		wfID := a.WorkflowID
		a.mu.Unlock()
		if wfID == workflowID {
			delete(s.artifacts, k)
			count++
		}
	}
	return count
}

// Prune removes oldest artifacts when the per-node limit is exceeded.
// Call periodically to prevent unbounded growth.
func (s *WorkflowArtifactStore) Prune() int {
	if s.maxPerNode <= 0 {
		return 0
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Group artifacts by (workflowID, nodeID)
	groups := make(map[string][]*WorkflowArtifact)
	for _, a := range s.artifacts {
		a.mu.Lock()
		wfID := a.WorkflowID
		nID := a.NodeID
		a.mu.Unlock()
		groupKey := wfID
		if nID != "" {
			groupKey = wfID + ":" + nID
		}
		groups[groupKey] = append(groups[groupKey], a)
	}

	pruned := 0
	for _, group := range groups {
		if len(group) > s.maxPerNode {
			// Snapshot timestamps then sort by creation time (oldest first)
			type indexed struct {
				artifact *WorkflowArtifact
				created  time.Time
			}
			snapshots := make([]indexed, len(group))
			for i, a := range group {
				a.mu.Lock()
				snapshots[i] = indexed{artifact: a, created: a.CreatedAt}
				a.mu.Unlock()
			}
			for i := 0; i < len(snapshots); i++ {
				for j := i + 1; j < len(snapshots); j++ {
					if snapshots[i].created.After(snapshots[j].created) {
						snapshots[i], snapshots[j] = snapshots[j], snapshots[i]
					}
				}
			}
			// Remove oldest entries beyond limit (keep newest)
			for _, snap := range snapshots[:len(snapshots)-s.maxPerNode] {
				a := snap.artifact
				a.mu.Lock()
				key := workflowArtifactKey(a.WorkflowID, a.Key)
				a.mu.Unlock()
				delete(s.artifacts, key)
				pruned++
			}
		}
	}
	return pruned
}

// Count returns the total number of artifacts.
func (s *WorkflowArtifactStore) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.artifacts)
}

// MarshalJSON returns the full artifact store as JSON.
func (s *WorkflowArtifactStore) MarshalJSON() ([]byte, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	artifacts := make([]*WorkflowArtifact, 0, len(s.artifacts))
	for _, a := range s.artifacts {
		artifacts = append(artifacts, snapshotWorkflowArtifact(a))
	}
	return json.Marshal(map[string]any{
		"artifacts": artifacts,
		"count":     len(artifacts),
	})
}

// snapshotWorkflowArtifact creates a safe copy of an artifact for read-only use.
// Performs a deep copy of map and slice Data fields to prevent mutation leaks.
func snapshotWorkflowArtifact(a *WorkflowArtifact) *WorkflowArtifact {
	a.mu.Lock()
	defer a.mu.Unlock()
	metadata := make(map[string]string, len(a.Metadata))
	for k, v := range a.Metadata {
		metadata[k] = v
	}
	return &WorkflowArtifact{
		ID:          a.ID,
		WorkflowID:  a.WorkflowID,
		NodeID:      a.NodeID,
		Key:         a.Key,
		Type:        a.Type,
		Data:        deepCopyAny(a.Data),
		Description: a.Description,
		Version:     a.Version,
		CreatedAt:   a.CreatedAt,
		UpdatedAt:   a.UpdatedAt,
		Metadata:    metadata,
	}
}

// deepCopyAny performs a true deep copy for common Data types.
// Recursively copies nested maps and slices to prevent data pollution.
// For other types (string, number, bool, nil), returns as-is (immutable).
func deepCopyAny(v any) any {
	if v == nil {
		return nil
	}
	switch val := v.(type) {
	case map[string]any:
		cp := make(map[string]any, len(val))
		for k, v2 := range val {
			cp[k] = deepCopyAny(v2) // recursive deep copy
		}
		return cp
	case map[string]string:
		cp := make(map[string]string, len(val))
		for k, v2 := range val {
			cp[k] = v2 // string is immutable, no need to recurse
		}
		return cp
	case []any:
		cp := make([]any, len(val))
		for i, v2 := range val {
			cp[i] = deepCopyAny(v2) // recursive deep copy
		}
		return cp
	case []string:
		cp := make([]string, len(val))
		copy(cp, val) // string elements are immutable
		return cp
	case []int:
		cp := make([]int, len(val))
		copy(cp, val)
		return cp
	case []float64:
		cp := make([]float64, len(val))
		copy(cp, val)
		return cp
	case []bool:
		cp := make([]bool, len(val))
		copy(cp, val)
		return cp
	case []map[string]any:
		cp := make([]map[string]any, len(val))
		for i, m := range val {
			if m == nil {
				cp[i] = nil
			} else {
				// Safe assertion: m is map[string]any in this case branch, deepCopyAny preserves type
				cp[i] = deepCopyAny(m).(map[string]any) //nolint:errcheck
			}
		}
		return cp
	case map[string]int:
		cp := make(map[string]int, len(val))
		for k, v2 := range val {
			cp[k] = v2
		}
		return cp
	case map[string]float64:
		cp := make(map[string]float64, len(val))
		for k, v2 := range val {
			cp[k] = v2
		}
		return cp
	default:
		return v // string, number, bool, nil — immutable
	}
}
