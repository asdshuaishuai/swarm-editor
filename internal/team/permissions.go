// Package team implements team permission management
package team

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"
	"time"

	"github.com/swarm-editor/swarm-editor/internal/log"
)

var permLog = log.With("component", "PermissionManager")

// Permission represents a permission type
type Permission string

// resolvedRequestStaleness is the duration after which resolved requests are cleaned up
const resolvedRequestStaleness = 5 * time.Minute

const (
	PermInviteMember    Permission = "invite_member"
	PermRemoveMember    Permission = "remove_member"
	PermAssignAgent     Permission = "assign_agent"
	PermCreateWorkspace Permission = "create_workspace"
	PermDeleteWorkspace Permission = "delete_workspace"
	PermManageSettings  Permission = "manage_settings"
	PermViewLogs        Permission = "view_logs"
	PermExecuteTasks    Permission = "execute_tasks"
)

// rolePermissions maps roles to their permissions
var rolePermissions = map[MemberRole][]Permission{
	RoleOwner: {
		PermInviteMember, PermRemoveMember, PermAssignAgent,
		PermCreateWorkspace, PermDeleteWorkspace, PermManageSettings,
		PermViewLogs, PermExecuteTasks,
	},
	RoleAdmin: {
		PermInviteMember, PermRemoveMember, PermAssignAgent,
		PermCreateWorkspace, PermDeleteWorkspace,
		PermViewLogs, PermExecuteTasks,
	},
	RoleDeveloper: {
		PermAssignAgent, PermCreateWorkspace,
		PermViewLogs, PermExecuteTasks,
	},
	RoleReviewer: {
		PermViewLogs, PermExecuteTasks,
	},
	RoleObserver: {
		PermViewLogs,
	},
}

// HasPermission checks if a role has a specific permission
func HasPermission(role MemberRole, permission Permission) bool {
	permissions, ok := rolePermissions[role]
	if !ok {
		return false
	}

	for _, p := range permissions {
		if p == permission {
			return true
		}
	}
	return false
}

// GetPermissions returns all permissions for a role
func GetPermissions(role MemberRole) []Permission {
	permissions, ok := rolePermissions[role]
	if !ok {
		return nil
	}
	return permissions
}

// AllPermissions returns all defined permissions
func AllPermissions() []Permission {
	return []Permission{
		PermInviteMember,
		PermRemoveMember,
		PermAssignAgent,
		PermCreateWorkspace,
		PermDeleteWorkspace,
		PermManageSettings,
		PermViewLogs,
		PermExecuteTasks,
	}
}

// === Interactive Permission Management (Human-in-the-loop) ===

// PermissionRequestStatus represents the status of a permission request
type PermissionRequestStatus string

const (
	StatusPending   PermissionRequestStatus = "pending"
	StatusApproved  PermissionRequestStatus = "approved"
	StatusDenied    PermissionRequestStatus = "denied"
	StatusExpired   PermissionRequestStatus = "expired"
	StatusCancelled PermissionRequestStatus = "cancelled"
)

// PermissionRequest represents an interactive permission request
type PermissionRequest struct {
	ID          string                  `json:"id"`
	Permission  Permission              `json:"permission"`
	RequesterID string                  `json:"requesterId"`
	AgentID     string                  `json:"agentId,omitempty"`
	Reason      string                  `json:"reason"`
	Context     map[string]any          `json:"context,omitempty"`
	Status      PermissionRequestStatus `json:"status"`
	CreatedAt   time.Time               `json:"createdAt"`
	ExpiresAt   time.Time               `json:"expiresAt"`
	ResolvedAt  *time.Time              `json:"resolvedAt,omitempty"`
	ResolvedBy  string                  `json:"resolvedBy,omitempty"`
	DenyReason  string                  `json:"denyReason,omitempty"`
}

// PermissionManager manages interactive permission requests
type PermissionManager struct {
	mu         sync.RWMutex
	requests   map[string]*PermissionRequest
	pending    chan *PermissionRequest
	responses  map[string]chan *PermissionResponse
	timeout    time.Duration
	onRequest  func(*PermissionRequest)
	onResponse func(*PermissionRequest)
	cancel     context.CancelFunc
	wg         sync.WaitGroup // tracks cleanup goroutine
}

// PermissionResponse represents a response to a permission request
type PermissionResponse struct {
	RequestID  string `json:"requestId"`
	Approved   bool   `json:"approved"`
	ResolvedBy string `json:"resolvedBy"`
	Reason     string `json:"reason,omitempty"`
}

// NewPermissionManager creates a new permission manager
func NewPermissionManager(timeout time.Duration) *PermissionManager {
	if timeout == 0 {
		timeout = 60 * time.Second
	}
	ctx, cancel := context.WithCancel(context.Background())
	pm := &PermissionManager{
		requests:  make(map[string]*PermissionRequest),
		pending:   make(chan *PermissionRequest, 100),
		responses: make(map[string]chan *PermissionResponse),
		timeout:   timeout,
		cancel:    cancel,
	}
	pm.wg.Add(1)
	go pm.cleanupExpired(ctx)
	return pm
}

// Stop stops the cleanup goroutine and waits for it to finish
func (pm *PermissionManager) Stop() {
	pm.cancel()
	pm.wg.Wait()
}

// cleanupExpired periodically removes expired requests to prevent memory leaks
func (pm *PermissionManager) cleanupExpired(ctx context.Context) {
	defer pm.wg.Done()
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			pm.cleanupOnce()
		}
	}
}

// cleanupOnce performs a single pass over all requests, expiring pending ones
// that have passed their deadline and removing old resolved requests.
func (pm *PermissionManager) cleanupOnce() {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	now := time.Now()
	for id, req := range pm.requests {
		if req.Status == StatusPending && now.After(req.ExpiresAt) {
			req.Status = StatusExpired
			req.ResolvedAt = &now
		}
		// Remove old resolved requests (older than staleness threshold)
		if req.ResolvedAt != nil && now.Sub(*req.ResolvedAt) > resolvedRequestStaleness {
			delete(pm.requests, id)
			if ch, ok := pm.responses[id]; ok {
				close(ch)
				delete(pm.responses, id)
			}
		}
	}
}

// RequestPermission creates a new permission request
func (pm *PermissionManager) RequestPermission(perm Permission, requesterID, agentID, reason string, context map[string]any) *PermissionRequest {
	pm.mu.Lock()

	req := &PermissionRequest{
		ID:          generateRequestID(),
		Permission:  perm,
		RequesterID: requesterID,
		AgentID:     agentID,
		Reason:      reason,
		Context:     context,
		Status:      StatusPending,
		CreatedAt:   time.Now(),
		ExpiresAt:   time.Now().Add(pm.timeout),
	}

	pm.requests[req.ID] = req
	pm.responses[req.ID] = make(chan *PermissionResponse, 1)

	// Capture callback and pending channel under lock to avoid race
	onRequest := pm.onRequest
	pendingCh := pm.pending
	pm.mu.Unlock()

	// Notify listener (outside lock)
	if onRequest != nil {
		go func(callback func(*PermissionRequest)) {
			defer func() {
				if r := recover(); r != nil {
					permLog.Error("onRequest callback panic", "panic", r)
				}
			}()
			callback(req)
		}(onRequest)
	}

	// Send to pending channel (non-blocking, channel is thread-safe)
	select {
	case pendingCh <- req:
	default:
		// Channel full, request is still tracked
	}

	return req
}

// WaitForResponse waits for a response to a permission request
func (pm *PermissionManager) WaitForResponse(requestID string) (*PermissionResponse, bool) {
	pm.mu.RLock()
	ch, ok := pm.responses[requestID]
	timeout := pm.timeout // Capture timeout under lock
	pm.mu.RUnlock()

	if !ok {
		return nil, false
	}

	timer := time.NewTimer(timeout)
	defer timer.Stop()

	select {
	case resp, open := <-ch:
		if !open {
			return nil, false
		}
		return resp, true
	case <-timer.C:
		pm.expireRequest(requestID)
		return &PermissionResponse{
			RequestID: requestID,
			Approved:  false,
			Reason:    "request expired",
		}, false
	}
}

// RespondToRequest responds to a permission request
func (pm *PermissionManager) RespondToRequest(requestID string, approved bool, resolvedBy, reason string) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	req, ok := pm.requests[requestID]
	if !ok {
		return ErrRequestNotFound
	}

	if req.Status != StatusPending {
		return ErrRequestAlreadyResolved
	}

	now := time.Now()
	req.Status = StatusApproved
	if !approved {
		req.Status = StatusDenied
	}
	req.ResolvedAt = &now
	req.ResolvedBy = resolvedBy
	req.DenyReason = reason

	// Send response to waiting channel
	if ch, ok := pm.responses[requestID]; ok {
		resp := &PermissionResponse{
			RequestID:  requestID,
			Approved:   approved,
			ResolvedBy: resolvedBy,
			Reason:     reason,
		}
		select {
		case ch <- resp:
		default:
		}
		// Clean up response channel to prevent memory leak
		close(ch)
		delete(pm.responses, requestID)
	}

	// Capture callback under lock to avoid race with OnResponse() setter
	onResponse := pm.onResponse
	// Callback is invoked outside lock to prevent deadlock
	if onResponse != nil {
		go func(callback func(*PermissionRequest)) {
			defer func() {
				if r := recover(); r != nil {
					permLog.Error("onResponse callback panic", "panic", r)
				}
			}()
			callback(req)
		}(onResponse)
	}

	return nil
}

// GetRequest retrieves a permission request by ID. Returns a deep copy to prevent mutation.
func (pm *PermissionManager) GetRequest(requestID string) (*PermissionRequest, bool) {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	req, ok := pm.requests[requestID]
	if !ok {
		return nil, false
	}
	return pm.copyRequest(req), true
}

// copyRequest creates a deep copy of a PermissionRequest, including the Context map.
func (pm *PermissionManager) copyRequest(req *PermissionRequest) *PermissionRequest {
	cp := *req
	// Deep copy Context map to prevent caller from mutating internal state
	if req.Context != nil {
		cp.Context = deepCopyMapAny(req.Context)
	}
	return &cp
}

// GetPendingRequests returns all pending requests. Returns deep copies to prevent mutation.
func (pm *PermissionManager) GetPendingRequests() []*PermissionRequest {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	pending := make([]*PermissionRequest, 0)
	for _, req := range pm.requests {
		if req.Status == StatusPending {
			pending = append(pending, pm.copyRequest(req))
		}
	}
	return pending
}

// CancelRequest cancels a pending request
func (pm *PermissionManager) CancelRequest(requestID string) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	req, ok := pm.requests[requestID]
	if !ok {
		return ErrRequestNotFound
	}

	if req.Status != StatusPending {
		return ErrRequestAlreadyResolved
	}

	now := time.Now()
	req.Status = StatusCancelled
	req.ResolvedAt = &now

	// Clean up response channel to prevent memory leak
	if ch, ok := pm.responses[requestID]; ok {
		close(ch)
		delete(pm.responses, requestID)
	}

	return nil
}

// OnRequest registers a callback for new permission requests
func (pm *PermissionManager) OnRequest(fn func(*PermissionRequest)) {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	pm.onRequest = fn
}

// OnResponse registers a callback for permission responses
func (pm *PermissionManager) OnResponse(fn func(*PermissionRequest)) {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	pm.onResponse = fn
}

// PendingChannel returns the channel for pending requests
func (pm *PermissionManager) PendingChannel() <-chan *PermissionRequest {
	return pm.pending
}

// expireRequest marks a request as expired
func (pm *PermissionManager) expireRequest(requestID string) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if req, ok := pm.requests[requestID]; ok && req.Status == StatusPending {
		now := time.Now()
		req.Status = StatusExpired
		req.ResolvedAt = &now
	}
}

// generateRequestID generates a unique request ID using crypto/rand.
// Panics on crypto/rand failure as this indicates a critical system problem.
func generateRequestID() string {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		panic(fmt.Errorf("crypto/rand failed: %w", err))
	}
	return "perm_" + hex.EncodeToString(b)
}

// deepCopyMapAny recursively deep copies a map[string]any.
// Defined locally to avoid cross-package dependency on internal/swarm.
func deepCopyMapAny(m map[string]any) map[string]any {
	if m == nil {
		return nil
	}
	cp := make(map[string]any, len(m))
	for k, v := range m {
		switch val := v.(type) {
		case map[string]any:
			cp[k] = deepCopyMapAny(val)
		case []any:
			slice := make([]any, len(val))
			for i, elem := range val {
				switch e := elem.(type) {
				case map[string]any:
					slice[i] = deepCopyMapAny(e)
				default:
					slice[i] = e
				}
			}
			cp[k] = slice
		default:
			cp[k] = v // string, number, bool, nil — immutable
		}
	}
	return cp
}

// Error definitions
var (
	ErrRequestNotFound        = fmt.Errorf("permission request not found")
	ErrRequestAlreadyResolved = fmt.Errorf("permission request already resolved")
)
