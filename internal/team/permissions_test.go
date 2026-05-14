package team

import (
	"sync"
	"testing"
	"time"
)

func TestNewPermissionManager(t *testing.T) {
	pm := NewPermissionManager(30 * time.Second)
	if pm == nil {
		t.Fatal("NewPermissionManager returned nil")
	}
	if pm.requests == nil {
		t.Error("requests map not initialized")
	}
	if pm.timeout != 30*time.Second {
		t.Errorf("expected timeout 30s, got %v", pm.timeout)
	}
}

func TestNewPermissionManagerDefaultTimeout(t *testing.T) {
	pm := NewPermissionManager(0)
	if pm.timeout != 60*time.Second {
		t.Errorf("expected default timeout 60s, got %v", pm.timeout)
	}
}

func TestRequestPermission(t *testing.T) {
	pm := NewPermissionManager(30 * time.Second)

	req := pm.RequestPermission(PermExecuteTasks, "user-1", "agent-1", "Need to execute task", map[string]any{"task": "build"})

	if req.ID == "" {
		t.Error("request ID should not be empty")
	}
	if req.Permission != PermExecuteTasks {
		t.Errorf("expected permission %s, got %s", PermExecuteTasks, req.Permission)
	}
	if req.RequesterID != "user-1" {
		t.Errorf("expected requester 'user-1', got '%s'", req.RequesterID)
	}
	if req.Status != StatusPending {
		t.Errorf("expected status pending, got %s", req.Status)
	}
}

func TestRespondToRequest(t *testing.T) {
	pm := NewPermissionManager(30 * time.Second)

	req := pm.RequestPermission(PermExecuteTasks, "user-1", "agent-1", "Need to execute task", nil)

	err := pm.RespondToRequest(req.ID, true, "admin-1", "")
	if err != nil {
		t.Errorf("RespondToRequest failed: %v", err)
	}

	// Verify request was updated
	updated, ok := pm.GetRequest(req.ID)
	if !ok {
		t.Fatal("request not found")
	}
	if updated.Status != StatusApproved {
		t.Errorf("expected status approved, got %s", updated.Status)
	}
	if updated.ResolvedBy != "admin-1" {
		t.Errorf("expected resolvedBy 'admin-1', got '%s'", updated.ResolvedBy)
	}
}

func TestRespondToRequestDenied(t *testing.T) {
	pm := NewPermissionManager(30 * time.Second)

	req := pm.RequestPermission(PermExecuteTasks, "user-1", "agent-1", "Need to execute task", nil)

	err := pm.RespondToRequest(req.ID, false, "admin-1", "Not authorized")
	if err != nil {
		t.Errorf("RespondToRequest failed: %v", err)
	}

	updated, _ := pm.GetRequest(req.ID)
	if updated.Status != StatusDenied {
		t.Errorf("expected status denied, got %s", updated.Status)
	}
	if updated.DenyReason != "Not authorized" {
		t.Errorf("expected deny reason 'Not authorized', got '%s'", updated.DenyReason)
	}
}

func TestRespondToRequestNotFound(t *testing.T) {
	pm := NewPermissionManager(30 * time.Second)

	err := pm.RespondToRequest("nonexistent", true, "admin-1", "")
	if err != ErrRequestNotFound {
		t.Errorf("expected ErrRequestNotFound, got %v", err)
	}
}

func TestRespondToRequestAlreadyResolved(t *testing.T) {
	pm := NewPermissionManager(30 * time.Second)

	req := pm.RequestPermission(PermExecuteTasks, "user-1", "agent-1", "Need to execute task", nil)
	_ = pm.RespondToRequest(req.ID, true, "admin-1", "")

	// Try to respond again
	err := pm.RespondToRequest(req.ID, false, "admin-2", "Changed mind")
	if err != ErrRequestAlreadyResolved {
		t.Errorf("expected ErrRequestAlreadyResolved, got %v", err)
	}
}

func TestCancelRequest(t *testing.T) {
	pm := NewPermissionManager(30 * time.Second)

	req := pm.RequestPermission(PermExecuteTasks, "user-1", "agent-1", "Need to execute task", nil)

	err := pm.CancelRequest(req.ID)
	if err != nil {
		t.Errorf("CancelRequest failed: %v", err)
	}

	updated, _ := pm.GetRequest(req.ID)
	if updated.Status != StatusCancelled {
		t.Errorf("expected status cancelled, got %s", updated.Status)
	}
}

func TestGetPendingRequests(t *testing.T) {
	pm := NewPermissionManager(30 * time.Second)

	// Create multiple requests
	_ = pm.RequestPermission(PermExecuteTasks, "user-1", "agent-1", "task 1", nil)
	_ = pm.RequestPermission(PermCreateWorkspace, "user-2", "agent-2", "workspace", nil)

	pending := pm.GetPendingRequests()
	if len(pending) != 2 {
		t.Errorf("expected 2 pending requests, got %d", len(pending))
	}
}

func TestGetPendingRequestsExcludesResolved(t *testing.T) {
	pm := NewPermissionManager(30 * time.Second)

	req1 := pm.RequestPermission(PermExecuteTasks, "user-1", "agent-1", "task 1", nil)
	_ = pm.RequestPermission(PermCreateWorkspace, "user-2", "agent-2", "workspace", nil)

	// Approve first request
	_ = pm.RespondToRequest(req1.ID, true, "admin-1", "")

	pending := pm.GetPendingRequests()
	if len(pending) != 1 {
		t.Errorf("expected 1 pending request, got %d", len(pending))
	}
}

func TestOnRequestCallback(t *testing.T) {
	pm := NewPermissionManager(30 * time.Second)

	var received *PermissionRequest
	var mu sync.Mutex
	pm.OnRequest(func(req *PermissionRequest) {
		mu.Lock()
		defer mu.Unlock()
		received = req
	})

	req := pm.RequestPermission(PermExecuteTasks, "user-1", "agent-1", "task", nil)

	// Wait for callback
	time.Sleep(10 * time.Millisecond)

	mu.Lock()
	if received == nil {
		t.Error("callback not received")
	} else if received.ID != req.ID {
		t.Errorf("expected request ID %s, got %s", req.ID, received.ID)
	}
	mu.Unlock()
}

func TestWaitForResponse(t *testing.T) {
	pm := NewPermissionManager(5 * time.Second)

	req := pm.RequestPermission(PermExecuteTasks, "user-1", "agent-1", "task", nil)

	var wg sync.WaitGroup
	var response *PermissionResponse
	var ok bool

	wg.Add(1)
	go func() {
		defer wg.Done()
		response, ok = pm.WaitForResponse(req.ID)
	}()

	// Respond after a short delay
	time.Sleep(50 * time.Millisecond)
	_ = pm.RespondToRequest(req.ID, true, "admin-1", "")

	wg.Wait()

	if !ok {
		t.Error("WaitForResponse returned false")
	}
	if response == nil {
		t.Fatal("response is nil")
	}
	if !response.Approved {
		t.Error("expected approved response")
	}
}

func TestWaitForResponseTimeout(t *testing.T) {
	pm := NewPermissionManager(100 * time.Millisecond)

	req := pm.RequestPermission(PermExecuteTasks, "user-1", "agent-1", "task", nil)

	start := time.Now()
	response, ok := pm.WaitForResponse(req.ID)
	elapsed := time.Since(start)

	if ok {
		t.Error("expected timeout (ok=false)")
	}
	if response == nil {
		t.Fatal("response is nil")
	}
	if response.Approved {
		t.Error("expected not approved on timeout")
	}
	if elapsed < 90*time.Millisecond {
		t.Errorf("timeout too short: %v", elapsed)
	}
}

func TestRespondToRequest_CleansChannel(t *testing.T) {
	pm := NewPermissionManager(30 * time.Second)

	req := pm.RequestPermission(PermExecuteTasks, "user-1", "agent-1", "task", nil)

	// Respond to the request
	err := pm.RespondToRequest(req.ID, true, "admin-1", "")
	if err != nil {
		t.Fatalf("RespondToRequest failed: %v", err)
	}

	// Verify the request status was updated
	updated, _ := pm.GetRequest(req.ID)
	if updated.Status != StatusApproved {
		t.Errorf("expected status approved, got %s", updated.Status)
	}

	// The response channel should be cleaned up (not in pm.responses)
	pm.mu.RLock()
	_, channelExists := pm.responses[req.ID]
	pm.mu.RUnlock()

	if channelExists {
		t.Error("response channel should be cleaned up after RespondToRequest")
	}
}

// --- HasPermission Tests ---

func TestHasPermission_OwnerHasAll(t *testing.T) {
	// Owner should have all permissions
	allPerms := AllPermissions()
	for _, perm := range allPerms {
		if !HasPermission(RoleOwner, perm) {
			t.Errorf("Owner should have permission %s", perm)
		}
	}
}

func TestHasPermission_AdminHasMost(t *testing.T) {
	// Admin should have most permissions except manage_settings
	if !HasPermission(RoleAdmin, PermInviteMember) {
		t.Error("Admin should have PermInviteMember")
	}
	if !HasPermission(RoleAdmin, PermRemoveMember) {
		t.Error("Admin should have PermRemoveMember")
	}
	if !HasPermission(RoleAdmin, PermDeleteWorkspace) {
		t.Error("Admin should have PermDeleteWorkspace")
	}
	if HasPermission(RoleAdmin, PermManageSettings) {
		t.Error("Admin should NOT have PermManageSettings")
	}
}

func TestHasPermission_DeveloperHasLimited(t *testing.T) {
	// Developer has limited permissions
	if !HasPermission(RoleDeveloper, PermAssignAgent) {
		t.Error("Developer should have PermAssignAgent")
	}
	if HasPermission(RoleDeveloper, PermRemoveMember) {
		t.Error("Developer should NOT have PermRemoveMember")
	}
	if HasPermission(RoleDeveloper, PermDeleteWorkspace) {
		t.Error("Developer should NOT have PermDeleteWorkspace")
	}
}

func TestHasPermission_ReviewerHasRead(t *testing.T) {
	// Reviewer has read-only permissions
	if !HasPermission(RoleReviewer, PermViewLogs) {
		t.Error("Reviewer should have PermViewLogs")
	}
	if HasPermission(RoleReviewer, PermAssignAgent) {
		t.Error("Reviewer should NOT have PermAssignAgent")
	}
}

func TestHasPermission_ObserverMinimal(t *testing.T) {
	// Observer has minimal permissions
	if !HasPermission(RoleObserver, PermViewLogs) {
		t.Error("Observer should have PermViewLogs")
	}
	if HasPermission(RoleObserver, PermAssignAgent) {
		t.Error("Observer should NOT have PermAssignAgent")
	}
}

func TestHasPermission_InvalidRole(t *testing.T) {
	if HasPermission(MemberRole("invalid"), PermViewLogs) {
		t.Error("Invalid role should have no permissions")
	}
}

func TestGetPermissions_ReturnsCorrectPermissions(t *testing.T) {
	perms := GetPermissions(RoleOwner)
	if perms == nil {
		t.Fatal("expected permissions for owner")
	}

	// Verify Owner has all permissions
	allPerms := AllPermissions()
	for _, p := range allPerms {
		found := false
		for _, gp := range perms {
			if gp == p {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("Owner should have permission %s", p)
		}
	}
}

func TestGetPermissions_InvalidRole(t *testing.T) {
	perms := GetPermissions(MemberRole("invalid"))
	if perms != nil {
		t.Error("invalid role should return nil permissions")
	}
}

func TestAllPermissions(t *testing.T) {
	perms := AllPermissions()
	if len(perms) == 0 {
		t.Error("AllPermissions should return at least one permission")
	}

	// Check that specific permissions are included
	found := false
	for _, p := range perms {
		if p == PermInviteMember {
			found = true
			break
		}
	}
	if !found {
		t.Error("AllPermissions should include PermInviteMember")
	}
}

func TestOnResponse(t *testing.T) {
	pm := NewPermissionManager(30 * time.Second)

	var called bool
	pm.OnResponse(func(req *PermissionRequest) {
		called = true
	})
	_ = called // Just verify no panic
}

func TestPendingChannel(t *testing.T) {
	pm := NewPermissionManager(30 * time.Second)
	ch := pm.PendingChannel()
	if ch == nil {
		t.Error("PendingChannel should return non-nil channel")
	}
}

func TestDeepCopyMapAny(t *testing.T) {
	// Nil map
	if deepCopyMapAny(nil) != nil {
		t.Error("nil map should return nil")
	}

	// Simple map
	orig := map[string]any{"key": "value", "num": 42}
	cp := deepCopyMapAny(orig)
	if cp["key"] != "value" || cp["num"] != 42 {
		t.Error("simple copy mismatch")
	}

	// Nested map
	orig2 := map[string]any{"nested": map[string]any{"inner": "data"}}
	cp2 := deepCopyMapAny(orig2)
	inner := cp2["nested"].(map[string]any)
	if inner["inner"] != "data" {
		t.Error("nested copy mismatch")
	}

	// Verify independence
	orig2["nested"].(map[string]any)["inner"] = "modified"
	if inner["inner"] == "modified" {
		t.Error("deep copy should be independent")
	}

	// Slice with nested maps
	orig3 := map[string]any{"items": []any{map[string]any{"a": 1}, "string_val"}}
	cp3 := deepCopyMapAny(orig3)
	items := cp3["items"].([]any)
	if len(items) != 2 {
		t.Errorf("expected 2 items, got %d", len(items))
	}
}
