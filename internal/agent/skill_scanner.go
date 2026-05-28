// Package agent provides skill scanning from local filesystem and agent configs
package agent

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/swarm-editor/swarm-editor/internal/log"
)

var skillLog = log.With("component", "SkillScanner")

// SkillSource indicates where a skill was discovered
type SkillSource string

const (
	SkillSourceFilesystem SkillSource = "filesystem"
	SkillSourceMCP        SkillSource = "mcp"
	SkillSourceAgent      SkillSource = "agent"
)

// SkillInfo represents a discovered skill
type SkillInfo struct {
	ID          string      `json:"id"`
	Name        string      `json:"name"`
	Description string      `json:"description,omitempty"`
	Source      SkillSource `json:"source"`
	Scope       string      `json:"scope,omitempty"` // "global" or "project"
	Path        string      `json:"path,omitempty"`
	AgentID     string      `json:"agentId,omitempty"`
	Tags        []string    `json:"tags,omitempty"`
}

// SkillScanner scans for local skills from filesystem, MCP servers, and agent configs
type SkillScanner struct {
	homeDir      string
	workspaceDir string
}

// NewSkillScanner creates a new skill scanner
func NewSkillScanner() *SkillScanner {
	home, _ := os.UserHomeDir()
	return &SkillScanner{homeDir: home}
}

// SetWorkspaceDir sets the workspace directory for project-local skill scanning
func (ss *SkillScanner) SetWorkspaceDir(dir string) {
	ss.workspaceDir = dir
}

// Scan discovers all skills from all sources
func (ss *SkillScanner) Scan() ([]SkillInfo, error) {
	var allSkills []SkillInfo

	// Scan filesystem skills
	fsSkills, err := ss.scanFilesystem()
	if err != nil {
		skillLog.Warn("filesystem skill scan failed", "error", err)
	} else {
		allSkills = append(allSkills, fsSkills...)
	}

	return allSkills, nil
}

// ScanWithAgents discovers skills from filesystem and agent capabilities
func (ss *SkillScanner) ScanWithAgents(agents []*AgentCLI) ([]SkillInfo, error) {
	allSkills, err := ss.Scan()
	if err != nil {
		return nil, err
	}

	// Extract skills from agent capabilities
	for _, a := range agents {
		for _, cap := range a.Capabilities {
			allSkills = append(allSkills, SkillInfo{
				ID:      a.ID + ":" + cap,
				Name:    cap,
				Source:  SkillSourceAgent,
				AgentID: a.ID,
				Tags:    []string{a.Provider},
			})
		}
	}

	return allSkills, nil
}

// MCPTool represents a tool from an MCP server
type MCPTool struct {
	Name        string
	Description string
}

// ScanWithMCP discovers skills from filesystem and MCP tool definitions
func (ss *SkillScanner) ScanWithMCP(mcpServers []MCPServerInfo) ([]SkillInfo, error) {
	return ss.ScanWithMCPTools(mcpServers, nil)
}

// ScanWithMCPTools discovers skills from filesystem, MCP servers, and their individual tools
func (ss *SkillScanner) ScanWithMCPTools(mcpServers []MCPServerInfo, serverTools map[string][]MCPTool) ([]SkillInfo, error) {
	allSkills, err := ss.Scan()
	if err != nil {
		return nil, err
	}

	for _, srv := range mcpServers {
		// Add server-level skill
		allSkills = append(allSkills, SkillInfo{
			ID:      "mcp:" + srv.Name,
			Name:    srv.Name,
			Source:  SkillSourceMCP,
			Path:    srv.Command,
			Tags:    []string{"mcp", srv.Type},
		})

		// Add individual tools as skills
		if tools, ok := serverTools[srv.Name]; ok {
			for _, tool := range tools {
				allSkills = append(allSkills, SkillInfo{
					ID:          "mcp:" + srv.Name + ":" + tool.Name,
					Name:        srv.Name + "/" + tool.Name,
					Description: tool.Description,
					Source:      SkillSourceMCP,
					Path:        srv.Command,
					Tags:        []string{"mcp", "tool", srv.Type},
				})
			}
		}
	}

	return allSkills, nil
}

// scanFilesystem scans known skill directories
func (ss *SkillScanner) scanFilesystem() ([]SkillInfo, error) {
	var skills []SkillInfo

	projectDirs, globalDirs := ss.skillDirsScoped()

	// Scan project dirs (highest priority)
	for _, dir := range projectDirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			skill := ss.parseSkillEntry(dir, entry)
			if skill != nil {
				skill.Scope = "project"
				skills = append(skills, *skill)
			}
		}
	}

	// Scan global dirs
	for _, dir := range globalDirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			skill := ss.parseSkillEntry(dir, entry)
			if skill != nil {
				skill.Scope = "global"
				skills = append(skills, *skill)
			}
		}
	}

	// Scan global MCP config files for MCP-based skills
	home := ss.homeDir
	globalMCPConfigs := []string{
		filepath.Join(home, ".claude", "mcp.json"),
		filepath.Join(home, ".config", "claude-code", "mcp.json"),
		filepath.Join(home, ".swarm-editor", "mcp.json"),
		// Agent primary configs with mcpServers key
		filepath.Join(home, ".claude.json"),
		filepath.Join(home, ".config", "opencode", "opencode.json"),
		filepath.Join(home, ".factory", "mcp.json"),
		filepath.Join(home, ".gemini", "antigravity", "mcp_config.json"),
	}
	for _, cfgPath := range globalMCPConfigs {
		if mcpSkills, err := ss.ScanMCPSkillsFromConfig(cfgPath); err == nil {
			for i := range mcpSkills {
				mcpSkills[i].Scope = "global"
			}
			skills = append(skills, mcpSkills...)
		}
	}

	// Scan project-level MCP configs
	if ss.workspaceDir != "" {
		projectMCPConfigs := []string{
			filepath.Join(ss.workspaceDir, ".swarm-editor", "mcp.json"),
			filepath.Join(ss.workspaceDir, ".mcp.json"),
			filepath.Join(ss.workspaceDir, ".claude", "mcp.json"),
		}
		for _, cfgPath := range projectMCPConfigs {
			if mcpSkills, err := ss.ScanMCPSkillsFromConfig(cfgPath); err == nil {
				for i := range mcpSkills {
					mcpSkills[i].Scope = "project"
				}
				skills = append(skills, mcpSkills...)
			}
		}
	}

	return skills, nil
}

// skillDirsScoped returns project and global skill directory paths separately
func (ss *SkillScanner) skillDirsScoped() (projectDirs []string, globalDirs []string) {
	// Project-local skill directories (highest priority)
	if ss.workspaceDir != "" {
		projectDirs = append(projectDirs,
			filepath.Join(ss.workspaceDir, ".claude", "skills"),
			filepath.Join(ss.workspaceDir, ".agents", "skills"),
			filepath.Join(ss.workspaceDir, ".swarm-editor", "skills"),
		)
	}

	if runtime.GOOS == "windows" {
		appData := os.Getenv("APPDATA")
		if appData != "" {
			globalDirs = append(globalDirs,
				filepath.Join(appData, "claude", "skills"),
				filepath.Join(appData, "claude-code", "skills"),
			)
		}
	} else {
		globalDirs = append(globalDirs,
			filepath.Join(ss.homeDir, ".claude", "skills"),
			filepath.Join(ss.homeDir, ".config", "claude-code", "skills"),
			filepath.Join(ss.homeDir, ".agents", "skills"),
			filepath.Join(ss.homeDir, ".config", "cursor", "skills"),
			filepath.Join(ss.homeDir, ".swarm-editor", "skills"),
			filepath.Join(ss.homeDir, ".cline", "skills"),
			filepath.Join(ss.homeDir, ".qwen", "skills"),
			filepath.Join(ss.homeDir, ".kimi", "skills"),
			filepath.Join(ss.homeDir, ".config", "opencode", "skills"),
		)
	}

	return projectDirs, globalDirs
}

// parseSkillEntry parses a single skill directory entry
func (ss *SkillScanner) parseSkillEntry(parentDir string, entry os.DirEntry) *SkillInfo {
	name := entry.Name()

	// Skip hidden files and non-skill entries
	if strings.HasPrefix(name, ".") || strings.HasPrefix(name, "_") {
		return nil
	}

	skillPath := filepath.Join(parentDir, entry.Name())

	// If it's a symlink, resolve it
	if entry.Type()&os.ModeSymlink != 0 {
		resolved, err := os.Readlink(skillPath)
		if err == nil {
			skillPath = resolved
		}
	}

	// Check for SKILL.md (standard skill manifest)
	manifestPath := filepath.Join(skillPath, "SKILL.md")
	if _, err := os.Stat(manifestPath); err == nil {
		desc := ss.readSkillDescription(manifestPath)
		return &SkillInfo{
			ID:          "fs:" + name,
			Name:        name,
			Description: desc,
			Source:      SkillSourceFilesystem,
			Path:        skillPath,
			Tags:        []string{"local"},
		}
	}

	// If it's a file (not directory), check if it's a skill script
	if !entry.IsDir() {
		ext := filepath.Ext(name)
		if ext == ".sh" || ext == ".py" || ext == ".js" || ext == ".ts" {
			return &SkillInfo{
				ID:     "fs:" + name,
				Name:   strings.TrimSuffix(name, ext),
				Source: SkillSourceFilesystem,
				Path:   skillPath,
				Tags:   []string{"local", strings.TrimPrefix(ext, ".")},
			}
		}
	}

	return nil
}

// readSkillDescription reads the description from SKILL.md
func (ss *SkillScanner) readSkillDescription(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}

	// Extract first non-empty, non-header line as description
	lines := strings.SplitN(string(data), "\n", 10)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "---") {
			continue
		}
		return line
	}

	return ""
}

// ScanMCPSkillsFromConfig discovers MCP skills from a standalone mcp.json config
func (ss *SkillScanner) ScanMCPSkillsFromConfig(configPath string) ([]SkillInfo, error) {
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, err
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}

	var skills []SkillInfo
	addServer := func(name string, srv struct {
		Command string   `json:"command"`
		Args    []string `json:"args"`
		Type    string   `json:"type"`
	}) {
		skills = append(skills, SkillInfo{
			ID:     "mcp:" + name,
			Name:   name,
			Source: SkillSourceMCP,
			Path:   srv.Command,
			Tags:   []string{"mcp", srv.Type},
		})
	}

	// Standard format: {"mcpServers": {...}}
	if rawServers, ok := raw["mcpServers"]; ok {
		var servers map[string]struct {
			Command string   `json:"command"`
			Args    []string `json:"args"`
			Type    string   `json:"type"`
		}
		if err := json.Unmarshal(rawServers, &servers); err == nil {
			for name, srv := range servers {
				addServer(name, srv)
			}
		}
	}

	// Nested format (e.g., opencode): {"mcp": {"mcpServers": {...}}}
	if rawMcp, ok := raw["mcp"]; ok {
		var mcp struct {
			MCPServers map[string]struct {
				Command string   `json:"command"`
				Args    []string `json:"args"`
				Type    string   `json:"type"`
			} `json:"mcpServers"`
		}
		if err := json.Unmarshal(rawMcp, &mcp); err == nil {
			for name, srv := range mcp.MCPServers {
				addServer(name, srv)
			}
		}
	}

	return skills, nil
}
