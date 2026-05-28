package agent

import (
	"encoding/json"
	"fmt"
	"maps"
	"os"
	"path/filepath"
	"sync"
)

// SkillApps tracks which agents a skill is enabled for
type SkillApps struct {
	Claude   bool `json:"claude"`
	OpenCode bool `json:"opencode"`
	Qwen     bool `json:"qwen"`
	Kimi     bool `json:"kimi"`
}

// HasAny returns true if at least one app is enabled
func (a SkillApps) HasAny() bool {
	return a.Claude || a.OpenCode || a.Qwen || a.Kimi
}

// SetEnabled sets the enabled state for a specific app
func (a *SkillApps) SetEnabled(app string, enabled bool) {
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
func (a SkillApps) IsEnabled(app string) bool {
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
func (a SkillApps) EnabledApps() []string {
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

// UnifiedSkill is the unified skill entry with per-agent enable/disable
type UnifiedSkill struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	Source      string    `json:"source"` // "filesystem", "mcp", "agent"
	Scope       string    `json:"scope,omitempty"`
	Path        string    `json:"path,omitempty"`
	AgentID     string    `json:"agentId,omitempty"`
	Tags        []string  `json:"tags,omitempty"`
	Apps        SkillApps `json:"apps"`
}

// UnifiedSkillStore manages the unified skill registry
type UnifiedSkillStore struct {
	mu      sync.RWMutex
	path    string
	homeDir string
	Skills  map[string]*UnifiedSkill
}

// NewUnifiedSkillStore creates a new store backed by a JSON file
func NewUnifiedSkillStore(configDir string) *UnifiedSkillStore {
	home, _ := os.UserHomeDir()
	return &UnifiedSkillStore{
		path:    filepath.Join(configDir, "skills.json"),
		homeDir: home,
		Skills:  make(map[string]*UnifiedSkill),
	}
}

// Load reads the store from disk
func (s *UnifiedSkillStore) Load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			s.Skills = make(map[string]*UnifiedSkill)
			return nil
		}
		return fmt.Errorf("failed to read skills.json: %w", err)
	}

	var store struct {
		Skills map[string]*UnifiedSkill `json:"skills"`
	}
	if err := json.Unmarshal(data, &store); err != nil {
		return fmt.Errorf("failed to parse skills.json: %w", err)
	}

	if store.Skills == nil {
		store.Skills = make(map[string]*UnifiedSkill)
	}
	s.Skills = store.Skills
	return nil
}

// Save writes the store to disk atomically
func (s *UnifiedSkillStore) Save() error {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if err := os.MkdirAll(filepath.Dir(s.path), 0700); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	store := struct {
		Skills map[string]*UnifiedSkill `json:"skills"`
	}{Skills: s.Skills}

	data, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal skills.json: %w", err)
	}

	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return fmt.Errorf("failed to write skills.json: %w", err)
	}

	return os.Rename(tmp, s.path)
}

// GetAll returns all skills
func (s *UnifiedSkillStore) GetAll() map[string]*UnifiedSkill {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make(map[string]*UnifiedSkill, len(s.Skills))
	maps.Copy(result, s.Skills)
	return result
}

// Get returns a skill by ID
func (s *UnifiedSkillStore) Get(id string) (*UnifiedSkill, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	skill, ok := s.Skills[id]
	return skill, ok
}

// Upsert adds or updates a skill and syncs symlinks to enabled agents
func (s *UnifiedSkillStore) Upsert(skill *UnifiedSkill) error {
	s.mu.Lock()
	s.Skills[skill.ID] = skill
	s.mu.Unlock()

	if err := s.Save(); err != nil {
		return err
	}

	return s.syncToEnabledAgents(skill)
}

// Delete removes a skill from the store and all agent skill dirs
func (s *UnifiedSkillStore) Delete(id string) error {
	s.mu.Lock()
	skill, exists := s.Skills[id]
	if !exists {
		s.mu.Unlock()
		return fmt.Errorf("skill %s not found", id)
	}
	delete(s.Skills, id)
	s.mu.Unlock()

	if err := s.Save(); err != nil {
		return err
	}

	// Remove symlinks from all agent skill dirs
	for _, app := range skill.Apps.EnabledApps() {
		_ = s.removeSymlink(skill.Name, app)
	}

	return nil
}

// ToggleApp enables or disables a skill for a specific agent
func (s *UnifiedSkillStore) ToggleApp(id string, app string, enabled bool) error {
	s.mu.Lock()
	skill, exists := s.Skills[id]
	if !exists {
		s.mu.Unlock()
		return fmt.Errorf("skill %s not found", id)
	}
	skill.Apps.SetEnabled(app, enabled)
	s.mu.Unlock()

	if err := s.Save(); err != nil {
		return err
	}

	if enabled {
		return s.createSymlink(skill, app)
	}
	return s.removeSymlink(skill.Name, app)
}

// ImportFromScanned imports discovered skills into the unified store.
// It auto-detects which agent directories the skill already exists in.
func (s *UnifiedSkillStore) ImportFromScanned(scanned []SkillInfo) int {
	s.mu.Lock()
	defer s.mu.Unlock()

	imported := 0
	for _, sc := range scanned {
		id := sc.ID
		if _, ok := s.Skills[id]; ok {
			continue // Already exists
		}
		skill := &UnifiedSkill{
			ID:          sc.ID,
			Name:        sc.Name,
			Description: sc.Description,
			Source:      string(sc.Source),
			Scope:       sc.Scope,
			Path:        sc.Path,
			AgentID:     sc.AgentID,
			Tags:        sc.Tags,
		}

		// Auto-detect which agent dirs this skill is already present in
		if sc.Path != "" {
			for _, app := range []string{"claude", "opencode", "qwen", "kimi"} {
				skillDir := s.agentSkillDir(app)
				if skillDir == "" {
					continue
				}
				linkPath := filepath.Join(skillDir, sc.Name)
				// Check if symlink or directory exists in agent's skill dir
				if _, err := os.Stat(linkPath); err == nil {
					skill.Apps.SetEnabled(app, true)
				}
			}
		}

		s.Skills[id] = skill
		imported++
	}

	if imported > 0 {
		_ = s.Save()
	}

	return imported
}

// syncToEnabledAgents creates symlinks for all enabled apps
func (s *UnifiedSkillStore) syncToEnabledAgents(skill *UnifiedSkill) error {
	var firstErr error
	for _, app := range skill.Apps.EnabledApps() {
		if err := s.createSymlink(skill, app); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

// agentSkillDir returns the skill directory path for a given agent
func (s *UnifiedSkillStore) agentSkillDir(app string) string {
	switch app {
	case "claude":
		return filepath.Join(s.homeDir, ".claude", "skills")
	case "opencode":
		return filepath.Join(s.homeDir, ".config", "opencode", "skills")
	case "qwen":
		return filepath.Join(s.homeDir, ".qwen", "skills")
	case "kimi":
		return filepath.Join(s.homeDir, ".kimi", "skills")
	}
	return ""
}

// createSymlink creates a symlink in the agent's skill directory
func (s *UnifiedSkillStore) createSymlink(skill *UnifiedSkill, app string) error {
	if skill.Path == "" {
		return nil // No source path, can't symlink
	}

	skillDir := s.agentSkillDir(app)
	if skillDir == "" {
		return nil
	}

	// Ensure directory exists
	if err := os.MkdirAll(skillDir, 0755); err != nil {
		return fmt.Errorf("failed to create skill dir %s: %w", skillDir, err)
	}

	linkPath := filepath.Join(skillDir, skill.Name)

	// Remove existing if present
	if _, err := os.Lstat(linkPath); err == nil {
		if err := os.Remove(linkPath); err != nil {
			return fmt.Errorf("failed to remove existing symlink: %w", err)
		}
	}

	// Create symlink
	if err := os.Symlink(skill.Path, linkPath); err != nil {
		return fmt.Errorf("failed to create symlink %s → %s: %w", linkPath, skill.Path, err)
	}

	skillLog.Info("created skill symlink", "skill", skill.Name, "app", app, "target", skill.Path)
	return nil
}

// removeSymlink removes a symlink from the agent's skill directory
func (s *UnifiedSkillStore) removeSymlink(skillName string, app string) error {
	skillDir := s.agentSkillDir(app)
	if skillDir == "" {
		return nil
	}

	linkPath := filepath.Join(skillDir, skillName)

	// Check if it's a symlink we manage
	target, err := os.Readlink(linkPath)
	if err != nil {
		return nil // Not a symlink or doesn't exist
	}

	// Verify it's a symlink (not a regular file)
	info, err := os.Lstat(linkPath)
	if err != nil || info.Mode()&os.ModeSymlink == 0 {
		return nil
	}

	_ = target // We could verify the target matches, but just remove it

	if err := os.Remove(linkPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to remove symlink %s: %w", linkPath, err)
	}

	skillLog.Info("removed skill symlink", "skill", skillName, "app", app)
	return nil
}
