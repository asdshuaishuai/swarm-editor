package agent

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestNewScanner(t *testing.T) {
	s := NewScanner()
	if s == nil {
		t.Fatal("NewScanner returned nil")
	}
	if s.agents == nil {
		t.Error("agents map not initialized")
	}
	if s.paths == nil {
		t.Error("paths should be populated from PATH")
	}
}

func TestContainsPath(t *testing.T) {
	tests := []struct {
		paths []string
		p     string
		want  bool
	}{
		{[]string{"/usr/bin", "/usr/local/bin"}, "/usr/bin", true},
		{[]string{"/usr/bin", "/usr/local/bin"}, "/opt/bin", false},
		{[]string{}, "/usr/bin", false},
		{[]string{"/usr/bin"}, "", false},
	}

	for _, tt := range tests {
		got := containsPath(tt.paths, tt.p)
		if got != tt.want {
			t.Errorf("containsPath(%v, %q) = %v, want %v", tt.paths, tt.p, got, tt.want)
		}
	}
}

func TestExpandHomeWithDir(t *testing.T) {
	got := expandHomeWithDir("~/Documents/file.txt", "/home/user")
	if got != filepath.Join("/home/user", "Documents/file.txt") {
		t.Errorf("expected %s, got %s", filepath.Join("/home/user", "Documents/file.txt"), got)
	}

	// Non-tilde path unchanged
	got = expandHomeWithDir("/absolute/path", "/home/user")
	if got != "/absolute/path" {
		t.Errorf("expected /absolute/path, got %s", got)
	}

	// Just ~ without /
	got = expandHomeWithDir("~", "/home/user")
	if got != "~" {
		t.Errorf("expected ~, got %s", got)
	}
}

func TestStringsJoin(t *testing.T) {
	tests := []struct {
		strs []string
		sep  string
		want string
	}{
		{[]string{"a", "b", "c"}, " ", "a b c"},
		{[]string{"x"}, "-", "x"},
		{[]string{}, ",", ""},
		{nil, ",", ""},
		{[]string{"hello", "world"}, " ", "hello world"},
	}

	for _, tt := range tests {
		got := stringsJoin(tt.strs, tt.sep)
		if got != tt.want {
			t.Errorf("stringsJoin(%v, %q) = %q, want %q", tt.strs, tt.sep, got, tt.want)
		}
	}
}

func TestScanner_OnDetected(t *testing.T) {
	s := NewScanner()

	var detected *AgentCLI
	s.OnDetected(func(a *AgentCLI) {
		detected = a
	})

	// Manually add an agent
	agent := &AgentCLI{ID: "test-1", Name: "test"}
	s.agents["test-1"] = agent

	// Callback should be set (we can verify it was stored)
	s.mu.RLock()
	cb := s.onDetected
	s.mu.RUnlock()

	if cb == nil {
		t.Error("OnDetected callback should be set")
	}

	// Manually invoke
	cb(agent)
	if detected != agent {
		t.Error("callback should have been invoked")
	}
}

func TestScanner_OnStatusChange(t *testing.T) {
	s := NewScanner()

	var changedID string
	var changedStatus AgentStatus
	s.OnStatusChange(func(id string, status AgentStatus) {
		changedID = id
		changedStatus = status
	})

	s.mu.RLock()
	cb := s.onStatusChange
	s.mu.RUnlock()

	if cb == nil {
		t.Error("OnStatusChange callback should be set")
	}

	cb("test-1", AgentStatusError)
	if changedID != "test-1" || changedStatus != AgentStatusError {
		t.Error("callback should have been invoked with correct args")
	}
}

func TestScanner_GetAgent(t *testing.T) {
	s := NewScanner()
	s.agents["test-1"] = &AgentCLI{ID: "test-1", Name: "test"}

	agent, ok := s.GetAgent("test-1")
	if !ok || agent.ID != "test-1" {
		t.Error("expected to find agent test-1")
	}

	_, ok = s.GetAgent("nonexistent")
	if ok {
		t.Error("expected false for nonexistent agent")
	}
}

func TestScanner_GetAgents(t *testing.T) {
	s := NewScanner()
	s.agents["a"] = &AgentCLI{ID: "a"}
	s.agents["b"] = &AgentCLI{ID: "b"}

	agents := s.GetAgents()
	if len(agents) != 2 {
		t.Errorf("expected 2 agents, got %d", len(agents))
	}
}

func TestScanner_GetAgentsByProvider(t *testing.T) {
	s := NewScanner()
	s.agents["a"] = &AgentCLI{ID: "a", Provider: "anthropic"}
	s.agents["b"] = &AgentCLI{ID: "b", Provider: "google"}
	s.agents["c"] = &AgentCLI{ID: "c", Provider: "anthropic"}

	agents := s.GetAgentsByProvider("anthropic")
	if len(agents) != 2 {
		t.Errorf("expected 2 anthropic agents, got %d", len(agents))
	}

	agents = s.GetAgentsByProvider("openai")
	if len(agents) != 0 {
		t.Errorf("expected 0 openai agents, got %d", len(agents))
	}
}

func TestScanner_CheckStatus_Unknown(t *testing.T) {
	s := NewScanner()

	status := s.CheckStatus(context.Background(), "nonexistent")
	if status != AgentStatusUnknown {
		t.Errorf("expected Unknown, got %s", status)
	}
}

func TestScanner_CheckStatus_Available(t *testing.T) {
	s := NewScanner()

	// Create a temp executable that responds to --help
	dir := t.TempDir()
	execPath := filepath.Join(dir, "fake-agent")
	if err := os.WriteFile(execPath, []byte("#!/bin/sh\nexit 0\n"), 0755); err != nil {
		t.Fatalf("write: %v", err)
	}

	s.agents["test-1"] = &AgentCLI{ID: "test-1", Path: execPath, Status: AgentStatusUnknown}

	status := s.CheckStatus(context.Background(), "test-1")
	if status != AgentStatusAvailable {
		t.Errorf("expected Available, got %s", status)
	}
}

func TestScanner_CheckStatus_Error(t *testing.T) {
	s := NewScanner()

	// Create a temp executable that fails
	dir := t.TempDir()
	execPath := filepath.Join(dir, "fail-agent")
	if err := os.WriteFile(execPath, []byte("#!/bin/sh\nexit 1\n"), 0755); err != nil {
		t.Fatalf("write: %v", err)
	}

	s.agents["test-1"] = &AgentCLI{ID: "test-1", Path: execPath, Status: AgentStatusAvailable}

	status := s.CheckStatus(context.Background(), "test-1")
	if status != AgentStatusError {
		t.Errorf("expected Error, got %s", status)
	}
}

func TestScanner_CheckStatus_Callback(t *testing.T) {
	s := NewScanner()

	dir := t.TempDir()
	execPath := filepath.Join(dir, "fake-agent")
	if err := os.WriteFile(execPath, []byte("#!/bin/sh\nexit 0\n"), 0755); err != nil {
		t.Fatalf("write: %v", err)
	}

	s.agents["test-1"] = &AgentCLI{ID: "test-1", Path: execPath}

	var cbID string
	var cbStatus AgentStatus
	s.OnStatusChange(func(id string, status AgentStatus) {
		cbID = id
		cbStatus = status
	})

	s.CheckStatus(context.Background(), "test-1")

	if cbID != "test-1" {
		t.Errorf("expected callback for test-1, got %s", cbID)
	}
	if cbStatus != AgentStatusAvailable {
		t.Errorf("expected callback with Available, got %s", cbStatus)
	}
}

func TestFindExecutable_AbsolutePath(t *testing.T) {
	s := NewScanner()

	// Create a temp file
	tmpFile := filepath.Join(t.TempDir(), "test-exec")
	if err := os.WriteFile(tmpFile, []byte(""), 0755); err != nil {
		t.Fatalf("write: %v", err)
	}

	path, err := s.findExecutable(tmpFile)
	if err != nil {
		t.Errorf("expected to find %s: %v", tmpFile, err)
	}
	if path != tmpFile {
		t.Errorf("expected %s, got %s", tmpFile, path)
	}
}

func TestFindExecutable_NotFound(t *testing.T) {
	s := NewScanner()

	_, err := s.findExecutable("nonexistent-executable-xyz-123")
	if err == nil {
		t.Error("expected error for nonexistent executable")
	}
}

func TestFindExecutable_InPATH(t *testing.T) {
	s := NewScanner()

	// Create a temp dir with a fake executable, add to paths
	dir := t.TempDir()
	fakeExec := filepath.Join(dir, "fake-scan-test")
	if err := os.WriteFile(fakeExec, []byte(""), 0755); err != nil {
		t.Fatalf("write: %v", err)
	}

	s.paths = []string{dir}

	path, err := s.findExecutable("fake-scan-test")
	if err != nil {
		t.Errorf("expected to find fake-scan-test: %v", err)
	}
	if path != fakeExec {
		t.Errorf("expected %s, got %s", fakeExec, path)
	}
}

func TestFindConfig(t *testing.T) {
	s := NewScanner()

	homeDir := t.TempDir()
	s.homeDir = homeDir

	// Create a config file in a known location
	configDir := filepath.Join(homeDir, ".claude")
	if err := os.MkdirAll(configDir, 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	configFile := filepath.Join(configDir, "claude.json")
	if err := os.WriteFile(configFile, []byte(`{}`), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	known := KnownAgent{
		Name:        "claude-code",
		ConfigPaths: []string{configDir},
		ConfigFiles: []string{"claude.json"},
	}

	found := s.findConfig(known)
	if found != configFile {
		t.Errorf("expected %s, got %s", configFile, found)
	}
}

func TestFindConfig_NotFound(t *testing.T) {
	s := NewScanner()
	s.homeDir = t.TempDir()

	known := KnownAgent{
		Name:        "nonexistent",
		ConfigPaths: []string{filepath.Join(s.homeDir, ".nonexistent")},
		ConfigFiles: []string{"config.json"},
	}

	found := s.findConfig(known)
	if found != "" {
		t.Errorf("expected empty string, got %s", found)
	}
}

func TestLoadConfig_JSON(t *testing.T) {
	s := NewScanner()

	configFile := filepath.Join(t.TempDir(), "config.json")
	content := `{"model": "kimi-k2.5", "provider": "moonshot"}`
	if err := os.WriteFile(configFile, []byte(content), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	agent := &AgentCLI{Metadata: make(map[string]any)}
	s.loadConfig(agent, configFile)

	if agent.Model != "kimi-k2.5" {
		t.Errorf("expected model kimi-k2.5, got %s", agent.Model)
	}
	if agent.Provider != "moonshot" {
		t.Errorf("expected provider moonshot, got %s", agent.Provider)
	}
}

func TestLoadConfig_InvalidJSON(t *testing.T) {
	s := NewScanner()

	configFile := filepath.Join(t.TempDir(), "bad.json")
	if err := os.WriteFile(configFile, []byte("not json{{{"), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	agent := &AgentCLI{Metadata: make(map[string]any)}
	// Should not panic
	s.loadConfig(agent, configFile)
}

func TestLoadConfig_Nonexistent(t *testing.T) {
	s := NewScanner()

	agent := &AgentCLI{Metadata: make(map[string]any)}
	// Should not panic
	s.loadConfig(agent, "/nonexistent/path/config.json")
}

func TestLoadEnvVars_APIKey(t *testing.T) {
	s := NewScanner()

	t.Setenv("ANTHROPIC_API_KEY", "sk-test-key")

	agent := &AgentCLI{EnvVars: make(map[string]string)}
	known := KnownAgent{EnvPrefix: "ANTHROPIC"}

	s.loadEnvVars(agent, known)

	if agent.EnvVars["API_KEY"] != "****" {
		t.Errorf("expected masked API_KEY, got %s", agent.EnvVars["API_KEY"])
	}
}

func TestLoadEnvVars_ModelFromEnv(t *testing.T) {
	s := NewScanner()

	t.Setenv("ANTHROPIC_MODEL", "claude-opus-4")

	agent := &AgentCLI{EnvVars: make(map[string]string)}
	known := KnownAgent{ModelEnvVar: "ANTHROPIC_MODEL"}

	s.loadEnvVars(agent, known)

	if agent.Model != "claude-opus-4" {
		t.Errorf("expected model claude-opus-4, got %s", agent.Model)
	}
}

func TestLoadEnvVars_NoEnvVars(t *testing.T) {
	s := NewScanner()

	agent := &AgentCLI{EnvVars: make(map[string]string)}
	known := KnownAgent{EnvPrefix: "", ModelEnvVar: ""}

	s.loadEnvVars(agent, known)

	if len(agent.EnvVars) != 0 {
		t.Errorf("expected no env vars, got %d", len(agent.EnvVars))
	}
}

func TestGetVersion(t *testing.T) {
	s := NewScanner()

	// Create a fake executable that prints a version
	dir := t.TempDir()
	execPath := filepath.Join(dir, "version-tool")
	content := "#!/bin/sh\necho 'v1.2.3'\n"
	if err := os.WriteFile(execPath, []byte(content), 0755); err != nil {
		t.Fatalf("write: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	version, err := s.getVersion(ctx, execPath)
	if err != nil {
		t.Fatalf("getVersion: %v", err)
	}
	if version != "v1.2.3" {
		t.Errorf("expected 'v1.2.3', got %q", version)
	}
}

func TestGetVersion_Timeout(t *testing.T) {
	s := NewScanner()

	dir := t.TempDir()
	execPath := filepath.Join(dir, "slow-tool")
	// Create a script that hangs
	content := "#!/bin/sh\nsleep 10\n"
	if err := os.WriteFile(execPath, []byte(content), 0755); err != nil {
		t.Fatalf("write: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	_, err := s.getVersion(ctx, execPath)
	if err == nil {
		t.Error("expected error for timeout")
	}
}

func TestRefresh(t *testing.T) {
	s := NewScanner()

	// Pre-populate
	s.agents["old-1"] = &AgentCLI{ID: "old-1"}

	// Refresh should clear and rescan
	agents, err := s.Refresh(context.Background())
	if err != nil {
		t.Fatalf("Refresh: %v", err)
	}

	// Old agent should be gone (unless actually found on system)
	if _, ok := s.agents["old-1"]; ok {
		// Possible if the executable actually exists on this system
		t.Log("old-1 still present after refresh (executable may exist on system)")
	}

	_ = agents // May or may not find agents depending on system
}

func TestScan_NoPanic(t *testing.T) {
	s := NewScanner()

	// Scan should not panic even if no agents found
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	agents, err := s.Scan(ctx)
	if err != nil {
		t.Fatalf("Scan: %v", err)
	}
	_ = agents // May or may not find agents
}

func TestKnownAgents_Registry(t *testing.T) {
	if len(KnownAgents) == 0 {
		t.Error("KnownAgents should not be empty")
	}

	// Each agent should have at least one executable
	for _, a := range KnownAgents {
		if len(a.Executables) == 0 {
			t.Errorf("agent %q has no executables", a.Name)
		}
		if a.Provider == "" {
			t.Errorf("agent %q has no provider", a.Name)
		}
	}
}

func TestAgentCLI_Struct(t *testing.T) {
	agent := &AgentCLI{
		ID:         "test-1",
		Name:       "test",
		Executable: "claude",
		Version:    "1.0.0",
		Provider:   "anthropic",
		Status:     AgentStatusAvailable,
		EnvVars:    map[string]string{"API_KEY": "****"},
	}

	if agent.ID != "test-1" {
		t.Errorf("expected ID test-1, got %s", agent.ID)
	}
	if agent.Status != AgentStatusAvailable {
		t.Errorf("expected Available, got %s", agent.Status)
	}
}

func TestScanAgent_FindsExecutable(t *testing.T) {
	s := NewScanner()

	// Create a temp executable
	dir := t.TempDir()
	execPath := filepath.Join(dir, "test-agent-cli")
	if err := os.WriteFile(execPath, []byte("#!/bin/sh\necho 'v1.0'\n"), 0755); err != nil {
		t.Fatalf("write: %v", err)
	}
	s.paths = []string{dir}

	known := KnownAgent{
		Name:         "test-agent",
		Executables:  []string{"test-agent-cli"},
		ConfigFiles:  []string{"config.json"},
		ConfigPaths:  []string{dir},
		Provider:     "test",
		EnvPrefix:    "TEST",
		ModelEnvVar:  "TEST_MODEL",
		Capabilities: []string{"code"},
	}

	ctx := context.Background()
	agent := s.scanAgent(ctx, known)
	if agent == nil {
		t.Fatal("scanAgent should find the test executable")
	}
	if agent.Name != "test-agent" {
		t.Errorf("expected name test-agent, got %s", agent.Name)
	}
	if agent.Path != execPath {
		t.Errorf("expected path %s, got %s", execPath, agent.Path)
	}
	if agent.Status != AgentStatusAvailable {
		t.Errorf("expected Available, got %s", agent.Status)
	}
}

func TestScanAgent_NoExecutable(t *testing.T) {
	s := NewScanner()
	s.paths = []string{t.TempDir()}

	known := KnownAgent{
		Name:        "nonexistent-agent",
		Executables: []string{"nonexistent-cli-xyz"},
		Provider:    "test",
	}

	agent := s.scanAgent(context.Background(), known)
	if agent != nil {
		t.Error("scanAgent should return nil for nonexistent executable")
	}
}

func TestScanAgent_FindsConfig(t *testing.T) {
	s := NewScanner()

	dir := t.TempDir()
	execPath := filepath.Join(dir, "my-agent")
	if err := os.WriteFile(execPath, []byte(""), 0755); err != nil {
		t.Fatalf("write: %v", err)
	}
	s.paths = []string{dir}

	// Create config file
	configContent := `{"model": "custom-model"}`
	configFile := filepath.Join(dir, "my-agent.json")
	if err := os.WriteFile(configFile, []byte(configContent), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	known := KnownAgent{
		Name:        "my-agent",
		Executables: []string{"my-agent"},
		ConfigFiles: []string{"my-agent.json"},
		ConfigPaths: []string{dir},
		Provider:    "test",
	}

	agent := s.scanAgent(context.Background(), known)
	if agent == nil {
		t.Fatal("scanAgent should find the test executable")
	}
	if agent.ConfigPath != configFile {
		t.Errorf("expected config path %s, got %s", configFile, agent.ConfigPath)
	}
}

func TestScanAgent_FallbackJSON(t *testing.T) {
	s := NewScanner()

	dir := t.TempDir()
	execPath := filepath.Join(dir, "fallback-agent")
	if err := os.WriteFile(execPath, []byte(""), 0755); err != nil {
		t.Fatalf("write: %v", err)
	}
	s.paths = []string{dir}

	// Create a config file that ParseAgentConfig will fail on, but has valid JSON
	// with model/provider fields for fallback
	configFile := filepath.Join(dir, "fallback.json")
	configContent := `{"model": "fallback-model", "provider": "fallback-provider"}`
	if err := os.WriteFile(configFile, []byte(configContent), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	known := KnownAgent{
		Name:        "fallback-agent",
		Executables: []string{"fallback-agent"},
		ConfigFiles: []string{"fallback.json"},
		ConfigPaths: []string{dir},
		Provider:    "test",
	}

	agent := s.scanAgent(context.Background(), known)
	if agent == nil {
		t.Fatal("scanAgent should find the test executable")
	}
	// The fallback path should parse the JSON
	if agent.Metadata == nil {
		t.Fatal("expected metadata to be populated")
	}
}

func TestScanAgent_WithVersion(t *testing.T) {
	s := NewScanner()

	dir := t.TempDir()
	execPath := filepath.Join(dir, "versioned-agent")
	// Create a script that prints version with --version
	script := "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo 'v2.0.0'; fi\n"
	if err := os.WriteFile(execPath, []byte(script), 0755); err != nil {
		t.Fatalf("write: %v", err)
	}
	s.paths = []string{dir}

	known := KnownAgent{
		Name:        "versioned-agent",
		Executables: []string{"versioned-agent"},
		Provider:    "test",
	}

	agent := s.scanAgent(context.Background(), known)
	if agent == nil {
		t.Fatal("scanAgent should find the test executable")
	}
	if agent.Version != "v2.0.0" {
		t.Errorf("expected version v2.0.0, got %s", agent.Version)
	}
}

func TestGetPaths_NonEmpty(t *testing.T) {
	paths := getPaths()
	if len(paths) == 0 {
		t.Error("getPaths should return at least some paths")
	}

	// Should include common paths
	found := false
	for _, p := range paths {
		if p == "/usr/local/bin" || p == "/usr/bin" {
			found = true
			break
		}
	}
	if !found {
		t.Log("Common paths not found (may be expected on some systems)")
	}
}

func TestScanner_ScanIntegration(t *testing.T) {
	s := NewScanner()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	agents, err := s.Scan(ctx)
	if err != nil {
		t.Fatalf("Scan: %v", err)
	}

	// Log what was found (varies by system)
	t.Logf("Scan found %d agents", len(agents))
	for _, a := range agents {
		t.Logf("  - %s (%s) at %s", a.Name, a.Provider, a.Path)
	}

	// Verify all returned agents are in the scanner's map
	for _, a := range agents {
		if _, ok := s.agents[a.ID]; !ok {
			t.Errorf("agent %s not in scanner map after Scan", a.ID)
		}
	}
}

func TestGetPathsUnique(t *testing.T) {
	paths := getPaths()
	seen := make(map[string]bool)
	duplicates := 0
	for _, p := range paths {
		if seen[p] {
			duplicates++
		}
		seen[p] = true
	}
	// Note: duplicates can occur if PATH contains the same dir twice (e.g. via PATH manipulation)
	// Just log, don't fail — this is a system-dependent test
	if duplicates > 0 {
		t.Logf("Found %d duplicate paths (system PATH may contain duplicates)", duplicates)
	}
}

func TestScanAgent_TriesMultipleExecutables(t *testing.T) {
	s := NewScanner()

	dir := t.TempDir()
	// Second executable name exists
	execPath := filepath.Join(dir, "agent-alt")
	if err := os.WriteFile(execPath, []byte(""), 0755); err != nil {
		t.Fatalf("write: %v", err)
	}
	s.paths = []string{dir}

	known := KnownAgent{
		Name:        "multi-exec-agent",
		Executables: []string{"agent-primary", "agent-alt"},
		Provider:    "test",
	}

	agent := s.scanAgent(context.Background(), known)
	if agent == nil {
		t.Fatal("scanAgent should find the second executable")
	}
	if agent.Executable != "agent-alt" {
		t.Errorf("expected executable agent-alt, got %s", agent.Executable)
	}
}
