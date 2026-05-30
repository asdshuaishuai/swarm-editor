package mcp

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// McpApps tracks which agents a server is enabled for
type McpApps struct {
	Claude   bool `json:"claude"`
	OpenCode bool `json:"opencode"`
	Qwen     bool `json:"qwen"`
	Kimi     bool `json:"kimi"`
}

// HasAny returns true if at least one app is enabled
func (a McpApps) HasAny() bool {
	return a.Claude || a.OpenCode || a.Qwen || a.Kimi
}

// SetEnabled sets the enabled state for a specific app
func (a *McpApps) SetEnabled(app string, enabled bool) {
	switch app {
	case "claude":
		a.Claude = enabled
	case "opencode":
		a.OpenCode = enabled
	case "qwen":
		a.Qwen = enabled
	case "kimi":
		a.Kimi = enabled
	}
}

// IsEnabled returns the enabled state for a specific app
func (a McpApps) IsEnabled(app string) bool {
	switch app {
	case "claude":
		return a.Claude
	case "opencode":
		return a.OpenCode
	case "qwen":
		return a.Qwen
	case "kimi":
		return a.Kimi
	}
	return false
}

// EnabledApps returns a list of app names that are enabled
func (a McpApps) EnabledApps() []string {
	var apps []string
	if a.Claude {
		apps = append(apps, "claude")
	}
	if a.OpenCode {
		apps = append(apps, "opencode")
	}
	if a.Qwen {
		apps = append(apps, "qwen")
	}
	if a.Kimi {
		apps = append(apps, "kimi")
	}
	return apps
}

// McpServerSpec is the connection specification for an MCP server
type McpServerSpec struct {
	Type    string            `json:"type,omitempty"` // "stdio", "http", "sse"
	Command string            `json:"command,omitempty"`
	Args    []string          `json:"args,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
	URL     string            `json:"url,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
}

// UnifiedMCPServer is the unified server entry with per-agent enable/disable
type UnifiedMCPServer struct {
	ID          string       `json:"id"`
	Name        string       `json:"name"`
	Server      McpServerSpec `json:"server"`
	Apps        McpApps      `json:"apps"`
	Description string       `json:"description,omitempty"`
	Tags        []string     `json:"tags,omitempty"`
}

// SyncResult records the outcome of syncing to a single agent
type SyncResult struct {
	App      string `json:"app"`
	Error    error  `json:"-"`
	ErrorMsg string `json:"error,omitempty"`
}

// NewSyncResult creates a SyncResult with both Error and ErrorMsg populated
func NewSyncResult(app string, err error) SyncResult {
	r := SyncResult{App: app, Error: err}
	if err != nil {
		r.ErrorMsg = err.Error()
	}
	return r
}

// Supported agent IDs
const (
	AgentClaude   = "claude"
	AgentOpenCode = "opencode"
	AgentQwen     = "qwen"
	AgentKimi     = "kimi"
)

// AllAgents returns all supported agent IDs
func AllAgents() []string {
	return []string{AgentClaude, AgentOpenCode, AgentQwen, AgentKimi}
}

// UnifiedMCPStore manages the unified MCP server registry
type UnifiedMCPStore struct {
	mu      sync.RWMutex
	path    string
	Servers map[string]*UnifiedMCPServer
}

// NewUnifiedMCPStore creates a new store backed by a JSON file
func NewUnifiedMCPStore(configDir string) *UnifiedMCPStore {
	return &UnifiedMCPStore{
		path:    filepath.Join(configDir, "mcp-servers.json"),
		Servers: make(map[string]*UnifiedMCPServer),
	}
}

// Load reads the store from disk
func (s *UnifiedMCPStore) Load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			s.Servers = make(map[string]*UnifiedMCPServer)
			return nil
		}
		return fmt.Errorf("failed to read mcp-servers.json: %w", err)
	}

	var store struct {
		Servers map[string]*UnifiedMCPServer `json:"servers"`
	}
	if err := json.Unmarshal(data, &store); err != nil {
		return fmt.Errorf("failed to parse mcp-servers.json: %w", err)
	}

	if store.Servers == nil {
		store.Servers = make(map[string]*UnifiedMCPServer)
	}
	s.Servers = store.Servers
	return nil
}

// Save writes the store to disk atomically.
// Snapshot the map under lock, then write to disk without holding the lock.
func (s *UnifiedMCPStore) Save() error {
	s.mu.RLock()
	snapshot := make(map[string]*UnifiedMCPServer, len(s.Servers))
	for k, v := range s.Servers {
		snapshot[k] = v
	}
	s.mu.RUnlock()

	if err := os.MkdirAll(filepath.Dir(s.path), 0700); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	store := struct {
		Servers map[string]*UnifiedMCPServer `json:"servers"`
	}{Servers: snapshot}

	data, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal mcp-servers.json: %w", err)
	}

	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return fmt.Errorf("failed to write mcp-servers.json: %w", err)
	}

	return os.Rename(tmp, s.path)
}

// GetAll returns all servers
func (s *UnifiedMCPStore) GetAll() map[string]*UnifiedMCPServer {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make(map[string]*UnifiedMCPServer, len(s.Servers))
	for k, v := range s.Servers {
		result[k] = v
	}
	return result
}

// Get returns a server by ID
func (s *UnifiedMCPStore) Get(id string) (*UnifiedMCPServer, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	srv, ok := s.Servers[id]
	return srv, ok
}

// Upsert adds or updates a server and syncs to enabled agents (blocking)
func (s *UnifiedMCPStore) Upsert(server *UnifiedMCPServer) error {
	if err := s.UpsertSync(server); err != nil {
		return err
	}
	results := s.SyncToEnabledAgents(server)
	for _, r := range results {
		if r.Error != nil {
			return r.Error
		}
	}
	return nil
}

// UpsertSync saves a server to disk without syncing to agent configs
func (s *UnifiedMCPStore) UpsertSync(server *UnifiedMCPServer) error {
	s.mu.Lock()
	s.Servers[server.ID] = server
	s.mu.Unlock()
	return s.Save()
}

// SyncToEnabledAgents concurrently syncs a server to all enabled agent configs
func (s *UnifiedMCPStore) SyncToEnabledAgents(server *UnifiedMCPServer) []SyncResult {
	apps := server.Apps.EnabledApps()
	if len(apps) == 0 {
		return nil
	}

	results := make([]SyncResult, len(apps))
	var wg sync.WaitGroup

	for i, app := range apps {
		wg.Add(1)
		go func(idx int, appName string) {
			defer wg.Done()
			err := SyncToAgent(server, appName)
			results[idx] = NewSyncResult(appName, err)
		}(i, app)
	}

	wg.Wait()

	for _, r := range results {
		if r.Error != nil {
			mcpLog.Warn("agent sync failed", "server", server.ID, "app", r.App, "error", r.Error)
		}
	}

	return results
}

// Delete removes a server from the store and all agent configs (blocking)
func (s *UnifiedMCPStore) Delete(id string) error {
	server, err := s.DeleteSync(id)
	if err != nil {
		return err
	}
	_ = s.RemoveFromAllAgents(server.Name, server.Apps.EnabledApps())
	return nil
}

// DeleteSync removes a server from disk without touching agent configs
func (s *UnifiedMCPStore) DeleteSync(id string) (*UnifiedMCPServer, error) {
	s.mu.Lock()
	server, exists := s.Servers[id]
	if !exists {
		s.mu.Unlock()
		return nil, fmt.Errorf("server %s not found", id)
	}
	delete(s.Servers, id)
	s.mu.Unlock()

	if err := s.Save(); err != nil {
		return nil, err
	}
	return server, nil
}

// ToggleApp enables or disables a server for a specific agent
func (s *UnifiedMCPStore) ToggleApp(id string, app string, enabled bool) error {
	s.mu.Lock()
	server, exists := s.Servers[id]
	if !exists {
		s.mu.Unlock()
		return fmt.Errorf("server %s not found", id)
	}
	server.Apps.SetEnabled(app, enabled)
	s.mu.Unlock()

	if err := s.Save(); err != nil {
		return err
	}

	if enabled {
		return SyncToAgent(server, app)
	}
	return RemoveFromAgent(server.Name, app)
}

// ImportFromScanned imports discovered MCP servers into the unified store.
// It deduplicates by name and sets apps based on the source field.
func (s *UnifiedMCPStore) ImportFromScanned(scanned []ScannedServer) int {
	s.mu.Lock()
	defer s.mu.Unlock()

	imported := 0
	for _, sc := range scanned {
		id := sc.Name
		if existing, ok := s.Servers[id]; ok {
			// Already exists — just set the app flag
			app := sourceToApp(sc.Source)
			if app != "" {
				existing.Apps.SetEnabled(app, true)
			}
		} else {
			// New server
			app := sourceToApp(sc.Source)
			apps := McpApps{}
			if app != "" {
				apps.SetEnabled(app, true)
			}
			s.Servers[id] = &UnifiedMCPServer{
				ID:   id,
				Name: sc.Name,
				Server: McpServerSpec{
					Type:    sc.Type,
					Command: sc.Command,
					Args:    sc.Args,
					Env:     sc.Env,
					URL:     sc.URL,
					Headers: sc.Headers,
				},
				Apps: apps,
			}
			imported++
		}
	}

	if imported > 0 {
		_ = s.Save()
	}

	return imported
}

// RemoveFromAllAgents concurrently removes a server from all agent configs
func (s *UnifiedMCPStore) RemoveFromAllAgents(serverName string, apps []string) []SyncResult {
	if len(apps) == 0 {
		return nil
	}

	results := make([]SyncResult, len(apps))
	var wg sync.WaitGroup

	for i, app := range apps {
		wg.Add(1)
		go func(idx int, appName string) {
			defer wg.Done()
			err := RemoveFromAgent(serverName, appName)
			results[idx] = NewSyncResult(appName, err)
		}(i, app)
	}

	wg.Wait()
	return results
}

// ToggleAppSync updates the app toggle on disk without syncing
func (s *UnifiedMCPStore) ToggleAppSync(id string, app string, enabled bool) error {
	s.mu.Lock()
	server, exists := s.Servers[id]
	if !exists {
		s.mu.Unlock()
		return fmt.Errorf("server %s not found", id)
	}
	server.Apps.SetEnabled(app, enabled)
	s.mu.Unlock()
	return s.Save()
}

// ScannedServer is a lightweight type for import from discovery results
type ScannedServer struct {
	Name    string
	Type    string
	Command string
	Args    []string
	Env     map[string]string
	URL     string
	Headers map[string]string
	Source  string
}

// sourceToApp maps a discovery source string to an agent ID
func sourceToApp(source string) string {
	switch {
	case source == "claude" || source == "claude-code":
		return AgentClaude
	case source == "opencode":
		return AgentOpenCode
	case source == "qwen" || source == "qwen-code":
		return AgentQwen
	case source == "kimi" || source == "kimi-code":
		return AgentKimi
	case len(source) > 7 && source[:7] == "global:":
		// global:claude → claude
		return source[7:]
	default:
		return ""
	}
}
