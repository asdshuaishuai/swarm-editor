// Package swarm implements a secure credential store for API keys and secrets.
// Inspired by n8n's Credentials Vault with scoped encryption.
//
// Security model:
//   - Credentials are encrypted at rest using AES-256-GCM
//   - Each credential has a scope (global/team/project) for access control
//   - Node configs reference credentials by ID, never embed secrets
//   - Master key can be provided via env var or generated on first use
package swarm

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/swarm-editor/swarm-editor/internal/log"
)

var credentialLog = log.With("component", "CredentialStore")

// CredentialScope defines access level for a credential.
type CredentialScope string

const (
	ScopeGlobal  CredentialScope = "global"  // Available to all workflows
	ScopeTeam    CredentialScope = "team"    // Available to team members
	ScopeProject CredentialScope = "project" // Available to specific project
)

// CredentialType defines the kind of credential.
type CredentialType string

const (
	CredTypeAPIKey    CredentialType = "api_key"
	CredTypeOAuth2    CredentialType = "oauth2"
	CredTypeBasicAuth CredentialType = "basic_auth"
	CredTypeSSHKey    CredentialType = "ssh_key"
	CredTypeCustom    CredentialType = "custom"
)

// Credential represents a stored secret with metadata.
type Credential struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Type        CredentialType  `json:"type"`
	Scope       CredentialScope `json:"scope"`
	ScopeID     string          `json:"scopeId,omitempty"` // Team ID or Project ID
	Description string          `json:"description,omitempty"`
	// EncryptedData contains the encrypted secret (JSON-encoded map)
	EncryptedData []byte `json:"encryptedData"`
	// CreatedAt/UpdatedAt for audit
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
	// ExpiresAt for rotation tracking
	ExpiresAt *time.Time `json:"expiresAt,omitempty"`
}

// CredentialData is the plaintext structure stored encrypted.
type CredentialData map[string]string

// CredentialStore manages encrypted credentials.
type CredentialStore struct {
	mu      sync.RWMutex
	dataDir string
	gcm     cipher.AEAD
	creds   map[string]*Credential
}

// ErrCredentialNotFound is returned when credential doesn't exist.
var ErrCredentialNotFound = errors.New("credential not found")

// ErrDecryptionFailed is returned when decryption fails.
var ErrDecryptionFailed = errors.New("decryption failed")

// masterKeyEnvVar is the environment variable for the encryption key.
const masterKeyEnvVar = "SWARM_CREDENTIAL_KEY"

// NewCredentialStore creates a new credential store.
// If SWARM_CREDENTIAL_KEY env var is set, uses that as master key.
// Otherwise, generates a new key and stores it in dataDir/master.key.
func NewCredentialStore(dataDir string) (*CredentialStore, error) {
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		return nil, fmt.Errorf("create credential dir: %w", err)
	}

	// Get or create master key
	key, err := getOrCreateMasterKey(dataDir)
	if err != nil {
		return nil, fmt.Errorf("init master key: %w", err)
	}

	// Create AES-GCM cipher
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("create cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create GCM: %w", err)
	}

	store := &CredentialStore{
		dataDir: dataDir,
		gcm:     gcm,
		creds:   make(map[string]*Credential),
	}

	// Load existing credentials
	if err := store.loadAll(); err != nil {
		credentialLog.Warn("Failed to load some credentials", "error", err)
	}

	return store, nil
}

// getOrCreateMasterKey returns the master encryption key.
func getOrCreateMasterKey(dataDir string) ([]byte, error) {
	// Priority 1: Environment variable
	if keyHex := os.Getenv(masterKeyEnvVar); keyHex != "" {
		// Expect hex-encoded 32-byte key (64 hex chars)
		key, err := hex.DecodeString(keyHex)
		if err != nil {
			return nil, fmt.Errorf("parse SWARM_CREDENTIAL_KEY: %w (expected 64 hex chars)", err)
		}
		if len(key) != 32 {
			return nil, fmt.Errorf("parse SWARM_CREDENTIAL_KEY: got %d bytes, expected 32", len(key))
		}
		return key, nil
	}

	// Priority 2: File-based key
	keyPath := filepath.Join(dataDir, "master.key")
	if data, err := os.ReadFile(keyPath); err == nil && len(data) == 32 {
		return data, nil
	}

	// Generate new key
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, fmt.Errorf("generate key: %w", err)
	}

	// Save with restricted permissions
	if err := os.WriteFile(keyPath, key, 0600); err != nil {
		return nil, fmt.Errorf("save master key: %w", err)
	}

	credentialLog.Info("Generated new master key", "path", keyPath)
	return key, nil
}

// loadAll loads all credentials from disk.
func (s *CredentialStore) loadAll() error {
	entries, err := os.ReadDir(s.dataDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(s.dataDir, entry.Name()))
		if err != nil {
			continue
		}
		var cred Credential
		if err := json.Unmarshal(data, &cred); err != nil {
			continue
		}
		s.creds[cred.ID] = &cred
	}

	credentialLog.Info("Loaded credentials", "count", len(s.creds))
	return nil
}

// Create stores a new credential.
func (s *CredentialStore) Create(name string, credType CredentialType, scope CredentialScope, scopeID string, data CredentialData) (*Credential, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	encrypted, err := s.encrypt(data)
	if err != nil {
		return nil, fmt.Errorf("encrypt credential: %w", err)
	}

	now := time.Now()
	cred := &Credential{
		ID:            "cred_" + uuid.New().String()[:8],
		Name:          name,
		Type:          credType,
		Scope:         scope,
		ScopeID:       scopeID,
		EncryptedData: encrypted,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	if err := s.save(cred); err != nil {
		return nil, err
	}

	s.creds[cred.ID] = cred
	credentialLog.Info("Created credential", "id", cred.ID, "type", credType, "scope", scope)
	return cred, nil
}

// Get retrieves a credential by ID (returns metadata only, not decrypted data).
func (s *CredentialStore) Get(id string) (*Credential, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	cred, ok := s.creds[id]
	if !ok {
		return nil, ErrCredentialNotFound
	}
	return cred, nil
}

// GetData decrypts and returns credential data.
// This is the sensitive operation - only call when actually needed.
func (s *CredentialStore) GetData(id string) (CredentialData, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	cred, ok := s.creds[id]
	if !ok {
		return nil, ErrCredentialNotFound
	}

	data, err := s.decrypt(cred.EncryptedData)
	if err != nil {
		return nil, ErrDecryptionFailed
	}

	return data, nil
}

// Update modifies an existing credential.
func (s *CredentialStore) Update(id string, data CredentialData) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	cred, ok := s.creds[id]
	if !ok {
		return ErrCredentialNotFound
	}

	encrypted, err := s.encrypt(data)
	if err != nil {
		return fmt.Errorf("encrypt credential: %w", err)
	}

	cred.EncryptedData = encrypted
	cred.UpdatedAt = time.Now()

	return s.save(cred)
}

// Delete removes a credential.
func (s *CredentialStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.creds[id]; !ok {
		return ErrCredentialNotFound
	}

	path := filepath.Join(s.dataDir, id+".json")
	// Remove file first, then update map (prevents stale file reload on failure)
	err := os.Remove(path)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove credential file: %w", err)
	}

	delete(s.creds, id)
	return nil
}

// List returns all credentials (metadata only, no decrypted data).
func (s *CredentialStore) List(scope CredentialScope, scopeID string) []*Credential {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*Credential
	for _, cred := range s.creds {
		// Global scope is always visible
		if scope == "" || cred.Scope == ScopeGlobal {
			result = append(result, cred)
			continue
		}
		// Match scope and scopeID
		if cred.Scope == scope && (scopeID == "" || cred.ScopeID == scopeID) {
			result = append(result, cred)
		}
	}
	return result
}

// Rotate re-encrypts a credential with new data (for key rotation).
func (s *CredentialStore) Rotate(id string, newData CredentialData) error {
	return s.Update(id, newData)
}

// encrypt encrypts credential data using AES-GCM.
func (s *CredentialStore) encrypt(data CredentialData) ([]byte, error) {
	plaintext, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}

	// Generate random nonce
	nonce := make([]byte, s.gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}

	// Encrypt and prepend nonce
	ciphertext := s.gcm.Seal(nil, nonce, plaintext, nil)
	return append(nonce, ciphertext...), nil
}

// decrypt decrypts credential data using AES-GCM.
func (s *CredentialStore) decrypt(encrypted []byte) (CredentialData, error) {
	if len(encrypted) < s.gcm.NonceSize() {
		return nil, errors.New("ciphertext too short")
	}

	nonce := encrypted[:s.gcm.NonceSize()]
	ciphertext := encrypted[s.gcm.NonceSize():]

	plaintext, err := s.gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, err
	}

	var data CredentialData
	if err := json.Unmarshal(plaintext, &data); err != nil {
		return nil, err
	}

	return data, nil
}

// save persists a credential to disk using atomic write (temp + rename).
func (s *CredentialStore) save(cred *Credential) error {
	data, err := json.Marshal(cred)
	if err != nil {
		return err
	}

	path := filepath.Join(s.dataDir, cred.ID+".json")
	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0600); err != nil {
		return fmt.Errorf("write credential temp file: %w", err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath) // Clean up temp file on failure
		return fmt.Errorf("rename credential file: %w", err)
	}
	return nil
}

// SetExpiresAt sets the expiration time for rotation tracking.
func (s *CredentialStore) SetExpiresAt(id string, expiresAt time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	cred, ok := s.creds[id]
	if !ok {
		return ErrCredentialNotFound
	}

	cred.ExpiresAt = &expiresAt
	cred.UpdatedAt = time.Now()
	return s.save(cred)
}

// GetExpiring returns credentials expiring within the given duration.
func (s *CredentialStore) GetExpiring(within time.Duration) []*Credential {
	s.mu.RLock()
	defer s.mu.RUnlock()

	threshold := time.Now().Add(within)
	var result []*Credential
	for _, cred := range s.creds {
		if cred.ExpiresAt != nil && cred.ExpiresAt.Before(threshold) {
			result = append(result, cred)
		}
	}
	return result
}
