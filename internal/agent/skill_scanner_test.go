package agent

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"testing"
)

// helper: create a SkillScanner with a controlled homeDir and optional workspaceDir
func newTestSkillScanner(homeDir, workspaceDir string) *SkillScanner {
	return &SkillScanner{homeDir: homeDir, workspaceDir: workspaceDir}
}

// ---------- NewSkillScanner ----------

func TestSkillNewSkillScanner(t *testing.T) {
	ss := NewSkillScanner()
	if ss == nil {
		t.Fatal("expected non-nil SkillScanner")
	}
	home, _ := os.UserHomeDir()
	if ss.homeDir != home {
		t.Errorf("homeDir = %q, want %q", ss.homeDir, home)
	}
	if ss.workspaceDir != "" {
		t.Errorf("workspaceDir = %q, want empty", ss.workspaceDir)
	}
}

// ---------- SetWorkspaceDir ----------

func TestSkillSetWorkspaceDir(t *testing.T) {
	ss := NewSkillScanner()
	ss.SetWorkspaceDir("/tmp/myproject")
	if ss.workspaceDir != "/tmp/myproject" {
		t.Errorf("workspaceDir = %q, want /tmp/myproject", ss.workspaceDir)
	}
}

// ---------- skillDirsScoped ----------

func TestSkillDirsScoped_NoWorkspace(t *testing.T) {
	ss := newTestSkillScanner("/home/user", "")
	projectDirs, globalDirs := ss.skillDirsScoped()

	if len(projectDirs) != 0 {
		t.Errorf("expected 0 project dirs without workspace, got %d", len(projectDirs))
	}
	if len(globalDirs) == 0 {
		t.Error("expected global dirs even without workspace")
	}
	// Verify some expected global paths
	expectedPath := filepath.Join("/home/user", ".claude", "skills")
	found := false
	for _, d := range globalDirs {
		if d == expectedPath {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected %s in global dirs, got %v", expectedPath, globalDirs)
	}
}

func TestSkillDirsScoped_WithWorkspace(t *testing.T) {
	ss := newTestSkillScanner("/home/user", "/project")
	projectDirs, globalDirs := ss.skillDirsScoped()

	if len(projectDirs) == 0 {
		t.Error("expected project dirs with workspace set")
	}
	// Project dirs should include .claude/skills, .agents/skills, .swarm-editor/skills
	expectedSuffixes := []string{
		filepath.Join(".claude", "skills"),
		filepath.Join(".agents", "skills"),
		filepath.Join(".swarm-editor", "skills"),
	}
	for _, suffix := range expectedSuffixes {
		found := false
		for _, d := range projectDirs {
			if filepath.Base(filepath.Dir(d))+"."+filepath.Base(d) == filepath.Base(filepath.Dir(suffix))+"."+filepath.Base(suffix) {
				found = true
				break
			}
			if d == filepath.Join("/project", suffix) {
				found = true
				break
			}
		}
		if !found {
			// Try direct match
			fullExpected := filepath.Join("/project", suffix)
			foundDirect := false
			for _, d := range projectDirs {
				if d == fullExpected {
					foundDirect = true
					break
				}
			}
			if !foundDirect {
				t.Errorf("expected %s in project dirs, got %v", fullExpected, projectDirs)
			}
		}
	}
	if len(globalDirs) == 0 {
		t.Error("expected global dirs")
	}
}

func TestSkillDirsScoped_GlobalDirPaths(t *testing.T) {
	ss := newTestSkillScanner("/home/testuser", "")
	_, globalDirs := ss.skillDirsScoped()

	// Check that all global dirs are under the homeDir
	for _, d := range globalDirs {
		if d[:len("/home/testuser")] != "/home/testuser" {
			t.Errorf("global dir %q should be under homeDir /home/testuser", d)
		}
	}
}

// ---------- readSkillDescription ----------

func TestSkillReadDescription_Basic(t *testing.T) {
	dir := t.TempDir()
	manifest := filepath.Join(dir, "SKILL.md")
	content := "# My Skill\n\nThis is a great skill for testing.\n"
	if err := os.WriteFile(manifest, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	ss := newTestSkillScanner(dir, "")
	desc := ss.readSkillDescription(manifest)
	if desc != "This is a great skill for testing." {
		t.Errorf("desc = %q, want first non-header line", desc)
	}
}

func TestSkillReadDescription_EmptyFile(t *testing.T) {
	dir := t.TempDir()
	manifest := filepath.Join(dir, "SKILL.md")
	if err := os.WriteFile(manifest, []byte(""), 0644); err != nil {
		t.Fatal(err)
	}

	ss := newTestSkillScanner(dir, "")
	desc := ss.readSkillDescription(manifest)
	if desc != "" {
		t.Errorf("desc = %q, want empty for empty file", desc)
	}
}

func TestSkillReadDescription_OnlyHeaders(t *testing.T) {
	dir := t.TempDir()
	manifest := filepath.Join(dir, "SKILL.md")
	content := "# Title\n## Subtitle\n### Subsubtitle\n"
	if err := os.WriteFile(manifest, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	ss := newTestSkillScanner(dir, "")
	desc := ss.readSkillDescription(manifest)
	if desc != "" {
		t.Errorf("desc = %q, want empty for headers-only file", desc)
	}
}

func TestSkillReadDescription_Frontmatter(t *testing.T) {
	dir := t.TempDir()
	manifest := filepath.Join(dir, "SKILL.md")
	content := "---\ntitle: test\n---\nActual description line\n"
	if err := os.WriteFile(manifest, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	ss := newTestSkillScanner(dir, "")
	desc := ss.readSkillDescription(manifest)
	// readSkillDescription skips lines starting with # or ---, but "title: test"
	// is the first non-empty, non-header, non-dash line.
	if desc != "title: test" {
		t.Errorf("desc = %q, want %q", desc, "title: test")
	}
}

func TestSkillReadDescription_Nonexistent(t *testing.T) {
	ss := newTestSkillScanner("/nonexistent", "")
	desc := ss.readSkillDescription("/nonexistent/SKILL.md")
	if desc != "" {
		t.Errorf("desc = %q, want empty for nonexistent file", desc)
	}
}

// ---------- parseSkillEntry ----------

func TestSkillParseEntry_HiddenFile(t *testing.T) {
	dir := t.TempDir()
	// Create hidden file
	if err := os.WriteFile(filepath.Join(dir, ".hidden"), []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}

	ss := newTestSkillScanner(dir, "")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		skill := ss.parseSkillEntry(dir, e)
		if skill != nil {
			t.Error("hidden files should be skipped")
		}
	}
}

func TestSkillParseEntry_UnderscorePrefix(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "_helper.py"), []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}

	ss := newTestSkillScanner(dir, "")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		skill := ss.parseSkillEntry(dir, e)
		if skill != nil {
			t.Error("underscore-prefixed files should be skipped")
		}
	}
}

func TestSkillParseEntry_SkillDirWithManifest(t *testing.T) {
	dir := t.TempDir()
	// Create a skill subdirectory with SKILL.md
	skillDir := filepath.Join(dir, "my-skill")
	if err := os.MkdirAll(skillDir, 0755); err != nil {
		t.Fatal(err)
	}
	manifest := filepath.Join(skillDir, "SKILL.md")
	if err := os.WriteFile(manifest, []byte("# My Skill\n\nDoes something useful.\n"), 0644); err != nil {
		t.Fatal(err)
	}

	ss := newTestSkillScanner(dir, "")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}

	found := false
	for _, e := range entries {
		skill := ss.parseSkillEntry(dir, e)
		if skill != nil && skill.Name == "my-skill" {
			found = true
			if skill.ID != "fs:my-skill" {
				t.Errorf("ID = %q, want fs:my-skill", skill.ID)
			}
			if skill.Source != SkillSourceFilesystem {
				t.Errorf("Source = %q, want filesystem", skill.Source)
			}
			if skill.Description != "Does something useful." {
				t.Errorf("Description = %q, want description from SKILL.md", skill.Description)
			}
			if skill.Path != skillDir {
				t.Errorf("Path = %q, want %q", skill.Path, skillDir)
			}
		}
	}
	if !found {
		t.Error("expected to find my-skill from SKILL.md directory")
	}
}

func TestSkillParseEntry_ScriptFile(t *testing.T) {
	dir := t.TempDir()
	for _, ext := range []string{".sh", ".py", ".js", ".ts"} {
		filename := "run-tool" + ext
		if err := os.WriteFile(filepath.Join(dir, filename), []byte("#!/bin/sh"), 0644); err != nil {
			t.Fatal(err)
		}
	}

	ss := newTestSkillScanner(dir, "")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}

	count := 0
	for _, e := range entries {
		skill := ss.parseSkillEntry(dir, e)
		if skill != nil {
			count++
			if skill.Source != SkillSourceFilesystem {
				t.Errorf("Source = %q, want filesystem", skill.Source)
			}
			if skill.ID != "fs:"+e.Name() {
				t.Errorf("ID = %q, want fs:%s", skill.ID, e.Name())
			}
			if skill.Name != "run-tool" {
				t.Errorf("Name = %q, want run-tool", skill.Name)
			}
		}
	}
	if count != 4 {
		t.Errorf("found %d script skills, want 4", count)
	}
}

func TestSkillParseEntry_NonSkillFile(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "readme.txt"), []byte("hello"), 0644); err != nil {
		t.Fatal(err)
	}

	ss := newTestSkillScanner(dir, "")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		skill := ss.parseSkillEntry(dir, e)
		if skill != nil {
			t.Error("non-skill file should not produce a SkillInfo")
		}
	}
}

func TestSkillParseEntry_DirWithoutManifest(t *testing.T) {
	dir := t.TempDir()
	sub := filepath.Join(dir, "empty-dir")
	if err := os.MkdirAll(sub, 0755); err != nil {
		t.Fatal(err)
	}

	ss := newTestSkillScanner(dir, "")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		skill := ss.parseSkillEntry(dir, e)
		if skill != nil {
			t.Error("dir without SKILL.md should not produce a SkillInfo")
		}
	}
}

func TestSkillParseEntry_Symlink(t *testing.T) {
	dir := t.TempDir()
	// Create real skill dir
	realSkill := filepath.Join(dir, "real-skill")
	if err := os.MkdirAll(realSkill, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(realSkill, "SKILL.md"), []byte("# Real\n\nA real skill.\n"), 0644); err != nil {
		t.Fatal(err)
	}
	// Create symlink
	linkPath := filepath.Join(dir, "linked-skill")
	if err := os.Symlink(realSkill, linkPath); err != nil {
		t.Skipf("symlinks not supported: %v", err)
	}

	ss := newTestSkillScanner(dir, "")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}

	found := false
	for _, e := range entries {
		skill := ss.parseSkillEntry(dir, e)
		if skill != nil && skill.Name == "linked-skill" {
			found = true
			if skill.Description != "A real skill." {
				t.Errorf("Description = %q, want A real skill.", skill.Description)
			}
		}
	}
	if !found {
		t.Error("expected to find linked-skill via symlink")
	}
}

// ---------- Scan ----------

func TestSkillScan_EmptyDirs(t *testing.T) {
	dir := t.TempDir()
	ss := newTestSkillScanner(dir, "")
	skills, err := ss.Scan()
	if err != nil {
		t.Fatal(err)
	}
	if len(skills) != 0 {
		t.Errorf("expected 0 skills from empty dirs, got %d", len(skills))
	}
}

func TestSkillScan_WithFilesystemSkills(t *testing.T) {
	home := t.TempDir()
	workspace := t.TempDir()

	// Create global skill
	globalSkillDir := filepath.Join(home, ".claude", "skills", "global-skill")
	if err := os.MkdirAll(globalSkillDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(globalSkillDir, "SKILL.md"), []byte("# Global\n\nA global skill.\n"), 0644); err != nil {
		t.Fatal(err)
	}

	// Create project skill
	projSkillDir := filepath.Join(workspace, ".claude", "skills", "proj-skill")
	if err := os.MkdirAll(projSkillDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(projSkillDir, "SKILL.md"), []byte("# Project\n\nA project skill.\n"), 0644); err != nil {
		t.Fatal(err)
	}

	ss := newTestSkillScanner(home, workspace)
	skills, err := ss.Scan()
	if err != nil {
		t.Fatal(err)
	}

	if len(skills) < 2 {
		t.Fatalf("expected at least 2 skills, got %d: %+v", len(skills), skills)
	}

	names := make(map[string]bool)
	for _, s := range skills {
		names[s.Name] = true
	}
	if !names["global-skill"] {
		t.Error("expected global-skill in results")
	}
	if !names["proj-skill"] {
		t.Error("expected proj-skill in results")
	}

	// Verify scopes
	for _, s := range skills {
		if s.Name == "global-skill" && s.Scope != "global" {
			t.Errorf("global-skill scope = %q, want global", s.Scope)
		}
		if s.Name == "proj-skill" && s.Scope != "project" {
			t.Errorf("proj-skill scope = %q, want project", s.Scope)
		}
	}
}

func TestSkillScan_ScriptFiles(t *testing.T) {
	home := t.TempDir()
	skillDir := filepath.Join(home, ".claude", "skills")
	if err := os.MkdirAll(skillDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(skillDir, "deploy.sh"), []byte("#!/bin/sh"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(skillDir, "analyze.py"), []byte("# python"), 0644); err != nil {
		t.Fatal(err)
	}

	ss := newTestSkillScanner(home, "")
	skills, err := ss.Scan()
	if err != nil {
		t.Fatal(err)
	}

	names := make(map[string]bool)
	for _, s := range skills {
		names[s.Name] = true
	}
	if !names["deploy"] {
		t.Error("expected 'deploy' (from deploy.sh) in results")
	}
	if !names["analyze"] {
		t.Error("expected 'analyze' (from analyze.py) in results")
	}
}

func TestSkillScan_NonexistentDirs(t *testing.T) {
	ss := newTestSkillScanner("/nonexistent/path", "/nonexistent/workspace")
	skills, err := ss.Scan()
	if err != nil {
		t.Fatal(err)
	}
	if len(skills) != 0 {
		t.Errorf("expected 0 skills from nonexistent dirs, got %d", len(skills))
	}
}

// ---------- ScanWithAgents ----------

func TestSkillScanWithAgents(t *testing.T) {
	dir := t.TempDir()
	ss := newTestSkillScanner(dir, "")

	agents := []*AgentCLI{
		{
			ID:           "claude-code",
			Capabilities: []string{"code-generation", "refactoring"},
			Provider:     "anthropic",
		},
		{
			ID:           "gemini-cli",
			Capabilities: []string{"code-review"},
			Provider:     "google",
		},
	}

	skills, err := ss.ScanWithAgents(agents)
	if err != nil {
		t.Fatal(err)
	}

	if len(skills) != 3 {
		t.Fatalf("expected 3 agent skills, got %d", len(skills))
	}

	ids := make(map[string]bool)
	for _, s := range skills {
		ids[s.ID] = true
		if s.Source != SkillSourceAgent {
			t.Errorf("skill %q Source = %q, want agent", s.ID, s.Source)
		}
	}
	if !ids["claude-code:code-generation"] {
		t.Error("expected claude-code:code-generation")
	}
	if !ids["claude-code:refactoring"] {
		t.Error("expected claude-code:refactoring")
	}
	if !ids["gemini-cli:code-review"] {
		t.Error("expected gemini-cli:code-review")
	}

	// Verify tags contain provider
	for _, s := range skills {
		if s.AgentID == "claude-code" {
			found := false
			for _, tag := range s.Tags {
				if tag == "anthropic" {
					found = true
				}
			}
			if !found {
				t.Errorf("claude-code skill tags = %v, want 'anthropic' tag", s.Tags)
			}
		}
	}
}

func TestSkillScanWithAgents_EmptyCapabilities(t *testing.T) {
	dir := t.TempDir()
	ss := newTestSkillScanner(dir, "")

	agents := []*AgentCLI{
		{ID: "agent1", Capabilities: nil, Provider: "test"},
	}

	skills, err := ss.ScanWithAgents(agents)
	if err != nil {
		t.Fatal(err)
	}
	if len(skills) != 0 {
		t.Errorf("expected 0 skills for agent with no capabilities, got %d", len(skills))
	}
}

func TestSkillScanWithAgents_CombinedWithFilesystem(t *testing.T) {
	home := t.TempDir()
	skillDir := filepath.Join(home, ".claude", "skills")
	if err := os.MkdirAll(skillDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(skillDir, "tool.sh"), []byte("#!/bin/sh"), 0644); err != nil {
		t.Fatal(err)
	}

	ss := newTestSkillScanner(home, "")
	agents := []*AgentCLI{
		{ID: "agent1", Capabilities: []string{"cap1"}, Provider: "test"},
	}

	skills, err := ss.ScanWithAgents(agents)
	if err != nil {
		t.Fatal(err)
	}

	if len(skills) < 2 {
		t.Fatalf("expected at least 2 skills (filesystem + agent), got %d", len(skills))
	}

	sources := make(map[SkillSource]bool)
	for _, s := range skills {
		sources[s.Source] = true
	}
	if !sources[SkillSourceFilesystem] {
		t.Error("expected filesystem skills")
	}
	if !sources[SkillSourceAgent] {
		t.Error("expected agent skills")
	}
}

// ---------- ScanWithMCP ----------

func TestSkillScanWithMCP(t *testing.T) {
	dir := t.TempDir()
	ss := newTestSkillScanner(dir, "")

	servers := []MCPServerInfo{
		{Name: "filesystem", Command: "npx", Type: "stdio"},
		{Name: "github", Command: "npx", Type: "stdio"},
	}

	skills, err := ss.ScanWithMCP(servers)
	if err != nil {
		t.Fatal(err)
	}

	if len(skills) != 2 {
		t.Fatalf("expected 2 MCP skills, got %d", len(skills))
	}

	names := make(map[string]bool)
	for _, s := range skills {
		names[s.Name] = true
		if s.Source != SkillSourceMCP {
			t.Errorf("Source = %q, want mcp", s.Source)
		}
		if s.ID != "mcp:"+s.Name {
			t.Errorf("ID = %q, want mcp:%s", s.ID, s.Name)
		}
	}
	if !names["filesystem"] {
		t.Error("expected filesystem MCP skill")
	}
	if !names["github"] {
		t.Error("expected github MCP skill")
	}
}

func TestSkillScanWithMCP_Empty(t *testing.T) {
	dir := t.TempDir()
	ss := newTestSkillScanner(dir, "")

	skills, err := ss.ScanWithMCP(nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(skills) != 0 {
		t.Errorf("expected 0 skills for nil MCP servers, got %d", len(skills))
	}
}

// ---------- ScanWithMCPTools ----------

func TestSkillScanWithMCPTools(t *testing.T) {
	dir := t.TempDir()
	ss := newTestSkillScanner(dir, "")

	servers := []MCPServerInfo{
		{Name: "filesystem", Command: "npx", Type: "stdio"},
	}

	serverTools := map[string][]MCPTool{
		"filesystem": {
			{Name: "read_file", Description: "Read a file"},
			{Name: "write_file", Description: "Write a file"},
		},
	}

	skills, err := ss.ScanWithMCPTools(servers, serverTools)
	if err != nil {
		t.Fatal(err)
	}

	// 1 server + 2 tools = 3
	if len(skills) != 3 {
		t.Fatalf("expected 3 skills (1 server + 2 tools), got %d", len(skills))
	}

	ids := make(map[string]bool)
	for _, s := range skills {
		ids[s.ID] = true
	}
	if !ids["mcp:filesystem"] {
		t.Error("expected mcp:filesystem server skill")
	}
	if !ids["mcp:filesystem:read_file"] {
		t.Error("expected mcp:filesystem:read_file tool skill")
	}
	if !ids["mcp:filesystem:write_file"] {
		t.Error("expected mcp:filesystem:write_file tool skill")
	}

	// Check tool descriptions
	for _, s := range skills {
		if s.Name == "filesystem/read_file" {
			if s.Description != "Read a file" {
				t.Errorf("read_file description = %q, want 'Read a file'", s.Description)
			}
		}
	}
}

func TestSkillScanWithMCPTools_NoTools(t *testing.T) {
	dir := t.TempDir()
	ss := newTestSkillScanner(dir, "")

	servers := []MCPServerInfo{
		{Name: "test", Command: "test-cmd", Type: "http"},
	}

	skills, err := ss.ScanWithMCPTools(servers, nil)
	if err != nil {
		t.Fatal(err)
	}

	if len(skills) != 1 {
		t.Fatalf("expected 1 server skill (no tools), got %d", len(skills))
	}
	if skills[0].ID != "mcp:test" {
		t.Errorf("ID = %q, want mcp:test", skills[0].ID)
	}
}

func TestSkillScanWithMCPTools_ToolsForWrongServer(t *testing.T) {
	dir := t.TempDir()
	ss := newTestSkillScanner(dir, "")

	servers := []MCPServerInfo{
		{Name: "server-a", Command: "a", Type: "stdio"},
	}

	serverTools := map[string][]MCPTool{
		"server-b": {{Name: "tool1", Description: "d1"}},
	}

	skills, err := ss.ScanWithMCPTools(servers, serverTools)
	if err != nil {
		t.Fatal(err)
	}

	// Only server-a skill, no tools (they're for server-b)
	if len(skills) != 1 {
		t.Fatalf("expected 1 skill (server only, tools for different server), got %d", len(skills))
	}
}

// ---------- scanFilesystem ----------

func TestSkillScanFilesystem_MCPConfigGlobal(t *testing.T) {
	home := t.TempDir()

	// Create global MCP config
	mcpDir := filepath.Join(home, ".claude")
	if err := os.MkdirAll(mcpDir, 0755); err != nil {
		t.Fatal(err)
	}

	config := map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"test-server": map[string]interface{}{
				"command": "npx",
				"args":    []string{"-y", "@test/mcp-server"},
				"type":    "stdio",
			},
		},
	}
	data, _ := json.Marshal(config)
	if err := os.WriteFile(filepath.Join(mcpDir, "mcp.json"), data, 0644); err != nil {
		t.Fatal(err)
	}

	ss := newTestSkillScanner(home, "")
	skills, err := ss.scanFilesystem()
	if err != nil {
		t.Fatal(err)
	}

	found := false
	for _, s := range skills {
		if s.Name == "test-server" {
			found = true
			if s.Scope != "global" {
				t.Errorf("scope = %q, want global", s.Scope)
			}
			if s.Source != SkillSourceMCP {
				t.Errorf("source = %q, want mcp", s.Source)
			}
		}
	}
	if !found {
		t.Errorf("expected test-server from global MCP config, got %d skills", len(skills))
	}
}

func TestSkillScanFilesystem_MCPConfigProject(t *testing.T) {
	home := t.TempDir()
	workspace := t.TempDir()

	// Create project MCP config
	seDir := filepath.Join(workspace, ".swarm-editor")
	if err := os.MkdirAll(seDir, 0755); err != nil {
		t.Fatal(err)
	}

	config := map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"project-mcp": map[string]interface{}{
				"command": "node",
				"type":    "stdio",
			},
		},
	}
	data, _ := json.Marshal(config)
	if err := os.WriteFile(filepath.Join(seDir, "mcp.json"), data, 0644); err != nil {
		t.Fatal(err)
	}

	ss := newTestSkillScanner(home, workspace)
	skills, err := ss.scanFilesystem()
	if err != nil {
		t.Fatal(err)
	}

	found := false
	for _, s := range skills {
		if s.Name == "project-mcp" {
			found = true
			if s.Scope != "project" {
				t.Errorf("scope = %q, want project", s.Scope)
			}
		}
	}
	if !found {
		t.Errorf("expected project-mcp from project MCP config, got %d skills", len(skills))
	}
}

func TestSkillScanFilesystem_MultipleSources(t *testing.T) {
	home := t.TempDir()
	workspace := t.TempDir()

	// Global skill dir
	globalSkillDir := filepath.Join(home, ".claude", "skills", "g-skill")
	if err := os.MkdirAll(globalSkillDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(globalSkillDir, "SKILL.md"), []byte("# G\n\nGlobal skill.\n"), 0644); err != nil {
		t.Fatal(err)
	}

	// Project skill dir
	projSkillDir := filepath.Join(workspace, ".swarm-editor", "skills", "p-skill")
	if err := os.MkdirAll(projSkillDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(projSkillDir, "SKILL.md"), []byte("# P\n\nProject skill.\n"), 0644); err != nil {
		t.Fatal(err)
	}

	// Global MCP config
	mcpDir := filepath.Join(home, ".swarm-editor")
	if err := os.MkdirAll(mcpDir, 0755); err != nil {
		t.Fatal(err)
	}
	mcpConfig := map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"mcp-global": map[string]interface{}{
				"command": "npx",
				"type":    "stdio",
			},
		},
	}
	data, _ := json.Marshal(mcpConfig)
	if err := os.WriteFile(filepath.Join(mcpDir, "mcp.json"), data, 0644); err != nil {
		t.Fatal(err)
	}

	// Project MCP config
	projMCPDir := filepath.Join(workspace, ".mcp.json")
	projConfig := map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"mcp-proj": map[string]interface{}{
				"command": "node",
				"type":    "http",
			},
		},
	}
	pData, _ := json.Marshal(projConfig)
	if err := os.WriteFile(projMCPDir, pData, 0644); err != nil {
		t.Fatal(err)
	}

	ss := newTestSkillScanner(home, workspace)
	skills, err := ss.scanFilesystem()
	if err != nil {
		t.Fatal(err)
	}

	if len(skills) < 4 {
		t.Fatalf("expected at least 4 skills, got %d", len(skills))
	}

	names := make(map[string]string)
	for _, s := range skills {
		names[s.Name] = s.Scope
	}
	if _, ok := names["g-skill"]; !ok {
		t.Error("expected g-skill")
	}
	if _, ok := names["p-skill"]; !ok {
		t.Error("expected p-skill")
	}
	if _, ok := names["mcp-global"]; !ok {
		t.Error("expected mcp-global")
	}
	if _, ok := names["mcp-proj"]; !ok {
		t.Error("expected mcp-proj")
	}

	if names["g-skill"] != "global" {
		t.Errorf("g-skill scope = %q, want global", names["g-skill"])
	}
	if names["p-skill"] != "project" {
		t.Errorf("p-skill scope = %q, want project", names["p-skill"])
	}
	if names["mcp-global"] != "global" {
		t.Errorf("mcp-global scope = %q, want global", names["mcp-global"])
	}
	if names["mcp-proj"] != "project" {
		t.Errorf("mcp-proj scope = %q, want project", names["mcp-proj"])
	}
}

// ---------- ScanMCPSkillsFromConfig ----------

func TestSkillScanMCPSkillsFromConfig(t *testing.T) {
	dir := t.TempDir()

	config := map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"server-a": map[string]interface{}{
				"command": "npx",
				"args":    []string{"-y", "@a/server"},
				"type":    "stdio",
			},
			"server-b": map[string]interface{}{
				"command": "node",
				"type":    "http",
			},
		},
	}
	data, _ := json.Marshal(config)
	cfgPath := filepath.Join(dir, "mcp.json")
	if err := os.WriteFile(cfgPath, data, 0644); err != nil {
		t.Fatal(err)
	}

	ss := newTestSkillScanner(dir, "")
	skills, err := ss.ScanMCPSkillsFromConfig(cfgPath)
	if err != nil {
		t.Fatal(err)
	}

	if len(skills) != 2 {
		t.Fatalf("expected 2 MCP skills, got %d", len(skills))
	}

	sort.Slice(skills, func(i, j int) bool {
		return skills[i].Name < skills[j].Name
	})

	if skills[0].Name != "server-a" {
		t.Errorf("skills[0].Name = %q, want server-a", skills[0].Name)
	}
	if skills[0].Source != SkillSourceMCP {
		t.Errorf("skills[0].Source = %q, want mcp", skills[0].Source)
	}
	if skills[0].Path != "npx" {
		t.Errorf("skills[0].Path = %q, want npx", skills[0].Path)
	}
	if skills[1].Name != "server-b" {
		t.Errorf("skills[1].Name = %q, want server-b", skills[1].Name)
	}
}

func TestSkillScanMCPSkillsFromConfig_Nonexistent(t *testing.T) {
	ss := newTestSkillScanner("/nonexistent", "")
	skills, err := ss.ScanMCPSkillsFromConfig("/nonexistent/mcp.json")
	if err == nil {
		t.Error("expected error for nonexistent config")
	}
	if skills != nil {
		t.Errorf("expected nil skills, got %v", skills)
	}
}

func TestSkillScanMCPSkillsFromConfig_InvalidJSON(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "mcp.json")
	if err := os.WriteFile(cfgPath, []byte("not valid json"), 0644); err != nil {
		t.Fatal(err)
	}

	ss := newTestSkillScanner(dir, "")
	skills, err := ss.ScanMCPSkillsFromConfig(cfgPath)
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
	if skills != nil {
		t.Errorf("expected nil skills for invalid JSON, got %v", skills)
	}
}

func TestSkillScanMCPSkillsFromConfig_Empty(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "mcp.json")
	if err := os.WriteFile(cfgPath, []byte("{}"), 0644); err != nil {
		t.Fatal(err)
	}

	ss := newTestSkillScanner(dir, "")
	skills, err := ss.ScanMCPSkillsFromConfig(cfgPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(skills) != 0 {
		t.Errorf("expected 0 skills for empty config, got %d", len(skills))
	}
}

func TestSkillScanMCPSkillsFromConfig_NoMCPServersKey(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "mcp.json")
	data, _ := json.Marshal(map[string]interface{}{"other": "data"})
	if err := os.WriteFile(cfgPath, data, 0644); err != nil {
		t.Fatal(err)
	}

	ss := newTestSkillScanner(dir, "")
	skills, err := ss.ScanMCPSkillsFromConfig(cfgPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(skills) != 0 {
		t.Errorf("expected 0 skills for config without mcpServers, got %d", len(skills))
	}
}

// ---------- Integration: Scan with mixed sources ----------

func TestSkillScan_Integration(t *testing.T) {
	home := t.TempDir()
	workspace := t.TempDir()

	// Filesystem skills (global)
	fsDir := filepath.Join(home, ".claude", "skills")
	if err := os.MkdirAll(fsDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(fsDir, "build.sh"), []byte("#!/bin/sh"), 0644); err != nil {
		t.Fatal(err)
	}

	// Filesystem skills (project)
	projFsDir := filepath.Join(workspace, ".swarm-editor", "skills", "review")
	if err := os.MkdirAll(projFsDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(projFsDir, "SKILL.md"), []byte("# Review\n\nCode review skill.\n"), 0644); err != nil {
		t.Fatal(err)
	}

	ss := newTestSkillScanner(home, workspace)

	// Scan + agents + MCP
	agents := []*AgentCLI{
		{ID: "agent1", Capabilities: []string{"edit"}, Provider: "test"},
	}
	mcpServers := []MCPServerInfo{
		{Name: "mcp-srv", Command: "npx", Type: "stdio"},
	}
	serverTools := map[string][]MCPTool{
		"mcp-srv": {{Name: "tool1", Description: "desc1"}},
	}

	skills, err := ss.ScanWithMCPTools(mcpServers, serverTools)
	if err != nil {
		t.Fatal(err)
	}
	// Also add agent skills
	skillsWithAgents, err := ss.ScanWithAgents(agents)
	if err != nil {
		t.Fatal(err)
	}

	// Verify ScanWithMCPTools includes filesystem + MCP
	mcpSkillsFound := false
	fsSkillsFound := false
	for _, s := range skills {
		if s.Source == SkillSourceMCP {
			mcpSkillsFound = true
		}
		if s.Source == SkillSourceFilesystem {
			fsSkillsFound = true
		}
	}
	if !mcpSkillsFound {
		t.Error("expected MCP skills in ScanWithMCPTools result")
	}
	if !fsSkillsFound {
		t.Error("expected filesystem skills in ScanWithMCPTools result")
	}

	// Verify ScanWithAgents includes agent skills
	agentFound := false
	for _, s := range skillsWithAgents {
		if s.Source == SkillSourceAgent {
			agentFound = true
		}
	}
	if !agentFound {
		t.Error("expected agent skills in ScanWithAgents result")
	}
}
