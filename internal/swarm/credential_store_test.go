package swarm

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCredentialStore_CreateAndGet(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "credstore-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	store, err := NewCredentialStore(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	data := CredentialData{
		"api_key": "secret-key-12345",
		"api_url": "https://api.example.com",
	}

	cred, err := store.Create("GitHub API", CredTypeAPIKey, ScopeGlobal, "", data)
	if err != nil {
		t.Fatal(err)
	}

	if cred.ID == "" {
		t.Error("expected credential ID")
	}
	if cred.Name != "GitHub API" {
		t.Errorf("Name = %q, want %q", cred.Name, "GitHub API")
	}
	if cred.Type != CredTypeAPIKey {
		t.Errorf("Type = %q, want %q", cred.Type, CredTypeAPIKey)
	}
	if len(cred.EncryptedData) == 0 {
		t.Error("expected encrypted data")
	}
}

func TestCredentialStore_GetData(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "credstore-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	store, err := NewCredentialStore(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	originalData := CredentialData{
		"username": "admin",
		"password": "super-secret",
	}

	cred, err := store.Create("DB Connection", CredTypeBasicAuth, ScopeTeam, "team-123", originalData)
	if err != nil {
		t.Fatal(err)
	}

	// Retrieve decrypted data
	data, err := store.GetData(cred.ID)
	if err != nil {
		t.Fatal(err)
	}

	if data["username"] != "admin" {
		t.Errorf("username = %q, want %q", data["username"], "admin")
	}
	if data["password"] != "super-secret" {
		t.Errorf("password = %q, want %q", data["password"], "super-secret")
	}
}

func TestCredentialStore_Update(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "credstore-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	store, err := NewCredentialStore(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	cred, err := store.Create("Old Key", CredTypeAPIKey, ScopeGlobal, "", CredentialData{"key": "old-value"})
	if err != nil {
		t.Fatal(err)
	}

	// Update
	err = store.Update(cred.ID, CredentialData{"key": "new-value"})
	if err != nil {
		t.Fatal(err)
	}

	data, err := store.GetData(cred.ID)
	if err != nil {
		t.Fatal(err)
	}

	if data["key"] != "new-value" {
		t.Errorf("key = %q, want %q", data["key"], "new-value")
	}
}

func TestCredentialStore_Delete(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "credstore-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	store, err := NewCredentialStore(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	cred, err := store.Create("To Delete", CredTypeAPIKey, ScopeGlobal, "", CredentialData{"key": "val"})
	if err != nil {
		t.Fatal(err)
	}

	err = store.Delete(cred.ID)
	if err != nil {
		t.Fatal(err)
	}

	_, err = store.Get(cred.ID)
	if err != ErrCredentialNotFound {
		t.Errorf("expected ErrCredentialNotFound, got %v", err)
	}
}

func TestCredentialStore_List(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "credstore-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	store, err := NewCredentialStore(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	// Create credentials with different scopes
	_, _ = store.Create("Global 1", CredTypeAPIKey, ScopeGlobal, "", CredentialData{"k": "v"})
	_, _ = store.Create("Global 2", CredTypeAPIKey, ScopeGlobal, "", CredentialData{"k": "v"})
	_, _ = store.Create("Team A", CredTypeAPIKey, ScopeTeam, "team-a", CredentialData{"k": "v"})
	_, _ = store.Create("Team B", CredTypeAPIKey, ScopeTeam, "team-b", CredentialData{"k": "v"})
	_, _ = store.Create("Project X", CredTypeAPIKey, ScopeProject, "proj-x", CredentialData{"k": "v"})

	// List all
	all := store.List("", "")
	if len(all) != 5 {
		t.Errorf("expected 5 credentials, got %d", len(all))
	}

	// List team scope - includes global (always visible) + team-a
	teamA := store.List(ScopeTeam, "team-a")
	// Should include: Global 1, Global 2, Team A = 3
	if len(teamA) != 3 {
		t.Errorf("expected 3 credentials (global + team-a), got %d", len(teamA))
	}

	// List different team
	teamB := store.List(ScopeTeam, "team-b")
	// Should include: Global 1, Global 2, Team B = 3
	if len(teamB) != 3 {
		t.Errorf("expected 3 credentials (global + team-b), got %d", len(teamB))
	}
}

func TestCredentialStore_Persistence(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "credstore-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	// Create first store
	store1, err := NewCredentialStore(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	cred, err := store1.Create("Persistent", CredTypeAPIKey, ScopeGlobal, "", CredentialData{"key": "persistent-value"})
	if err != nil {
		t.Fatal(err)
	}

	// Create second store (should load existing)
	store2, err := NewCredentialStore(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	// Verify credential loaded
	data, err := store2.GetData(cred.ID)
	if err != nil {
		t.Fatal(err)
	}

	if data["key"] != "persistent-value" {
		t.Errorf("key = %q, want %q", data["key"], "persistent-value")
	}
}

func TestCredentialStore_Expiration(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "credstore-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	store, err := NewCredentialStore(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	// Create credential expiring soon
	cred1, _ := store.Create("Expiring Soon", CredTypeAPIKey, ScopeGlobal, "", CredentialData{"k": "v"})
	expiresSoon := time.Now().Add(24 * time.Hour)
	store.SetExpiresAt(cred1.ID, expiresSoon)

	// Create credential expiring far in future
	cred2, _ := store.Create("Expiring Later", CredTypeAPIKey, ScopeGlobal, "", CredentialData{"k": "v"})
	expiresLater := time.Now().Add(30 * 24 * time.Hour)
	store.SetExpiresAt(cred2.ID, expiresLater)

	// Get expiring within 48 hours
	expiring := store.GetExpiring(48 * time.Hour)
	if len(expiring) != 1 {
		t.Errorf("expected 1 expiring credential, got %d", len(expiring))
	}
	if len(expiring) > 0 && expiring[0].ID != cred1.ID {
		t.Errorf("expected cred1 to be expiring, got %s", expiring[0].ID)
	}
}

func TestCredentialStore_NotFound(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "credstore-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	store, err := NewCredentialStore(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	_, err = store.Get("nonexistent")
	if err != ErrCredentialNotFound {
		t.Errorf("expected ErrCredentialNotFound, got %v", err)
	}

	_, err = store.GetData("nonexistent")
	if err != ErrCredentialNotFound {
		t.Errorf("expected ErrCredentialNotFound, got %v", err)
	}

	err = store.Update("nonexistent", CredentialData{"k": "v"})
	if err != ErrCredentialNotFound {
		t.Errorf("expected ErrCredentialNotFound, got %v", err)
	}

	err = store.Delete("nonexistent")
	if err != ErrCredentialNotFound {
		t.Errorf("expected ErrCredentialNotFound, got %v", err)
	}
}

func TestCredentialStore_Encryption(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "credstore-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	store, err := NewCredentialStore(tmpDir)
	if err != nil {
		t.Fatal(err)
	}

	secret := "super-secret-api-key-12345"
	cred, err := store.Create("Test", CredTypeAPIKey, ScopeGlobal, "", CredentialData{"secret": secret})
	if err != nil {
		t.Fatal(err)
	}

	// Verify encrypted data doesn't contain plaintext
	encData := string(cred.EncryptedData)
	if len(encData) > len(secret) && containsSubstring(encData, secret) {
		t.Error("encrypted data contains plaintext secret")
	}

	// Verify file on disk also doesn't contain plaintext
	fileData, err := os.ReadFile(filepath.Join(tmpDir, cred.ID+".json"))
	if err != nil {
		t.Fatal(err)
	}
	if containsSubstring(string(fileData), secret) {
		t.Error("file on disk contains plaintext secret")
	}
}

func containsSubstring(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsSubstring(s[1:], substr))
}
