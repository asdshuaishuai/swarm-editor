// Package lsp provides Language Server Protocol integration for the editor
package lsp

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"sync"
	"time"
)

// LSPStatus represents the status of an LSP server
type LSPStatus string

const (
	LSPStatusInstalled    LSPStatus = "installed"
	LSPStatusNotInstalled LSPStatus = "not_installed"
	LSPStatusRunning      LSPStatus = "running"
	LSPStatusError        LSPStatus = "error"
	LSPStatusUnknown      LSPStatus = "unknown"
)

// LSPServer represents a detected or configured LSP server
type LSPServer struct {
	ID           string         `json:"id"`
	Language     string         `json:"language"`
	ServerName   string         `json:"serverName"`
	Executable   string         `json:"executable"`
	Path         string         `json:"path"`
	Version      string         `json:"version"`
	Status       LSPStatus      `json:"status"`
	Capabilities []string       `json:"capabilities"`
	ConfigPath   string         `json:"configPath,omitempty"`
	InstallCmd   string         `json:"installCmd,omitempty"`
	LastChecked  time.Time      `json:"lastChecked"`
	Metadata     map[string]any `json:"metadata,omitempty"`
}

// KnownLSPServer defines a known LSP server configuration
type KnownLSPServer struct {
	Language     string
	ServerName   string
	Executables  []string
	InstallCmds  map[string]string // OS -> install command
	ConfigFiles  []string
	Capabilities []string
}

// KnownLSPServers is the registry of known LSP servers
var KnownLSPServers = []KnownLSPServer{
	{
		Language:    "go",
		ServerName:  "gopls",
		Executables: []string{"gopls"},
		InstallCmds: map[string]string{
			"linux":   "go install golang.org/x/tools/gopls@latest",
			"darwin":  "go install golang.org/x/tools/gopls@latest",
			"windows": "go install golang.org/x/tools/gopls@latest",
		},
		Capabilities: []string{"completion", "hover", "definition", "references", "rename", "format"},
	},
	{
		Language:    "rust",
		ServerName:  "rust-analyzer",
		Executables: []string{"rust-analyzer"},
		InstallCmds: map[string]string{
			"linux":   "rustup component add rust-analyzer",
			"darwin":  "rustup component add rust-analyzer",
			"windows": "rustup component add rust-analyzer",
		},
		Capabilities: []string{"completion", "hover", "definition", "references", "rename", "format", "codeAction"},
	},
	{
		Language:    "python",
		ServerName:  "pyright",
		Executables: []string{"pyright", "pylance"},
		InstallCmds: map[string]string{
			"linux":   "npm install -g pyright",
			"darwin":  "npm install -g pyright",
			"windows": "npm install -g pyright",
		},
		ConfigFiles:  []string{"pyrightconfig.json", "pyproject.toml"},
		Capabilities: []string{"completion", "hover", "definition", "references", "rename", "format"},
	},
	{
		Language:    "java",
		ServerName:  "jdtls",
		Executables: []string{"jdtls"},
		InstallCmds: map[string]string{
			"linux":   "See: https://download.eclipse.org/jdtls/",
			"darwin":  "See: https://download.eclipse.org/jdtls/",
			"windows": "See: https://download.eclipse.org/jdtls/",
		},
		Capabilities: []string{"completion", "hover", "definition", "references", "rename", "format", "codeAction"},
	},
	{
		Language:    "csharp",
		ServerName:  "omnisharp",
		Executables: []string{"omnisharp", "OmniSharp"},
		InstallCmds: map[string]string{
			"linux":   "dotnet tool install -g OmniSharp",
			"darwin":  "dotnet tool install -g OmniSharp",
			"windows": "dotnet tool install -g OmniSharp",
		},
		Capabilities: []string{"completion", "hover", "definition", "references", "rename", "format"},
	},
	{
		Language:    "typescript",
		ServerName:  "typescript-language-server",
		Executables: []string{"typescript-language-server", "tsserver"},
		InstallCmds: map[string]string{
			"linux":   "npm install -g typescript-language-server typescript",
			"darwin":  "npm install -g typescript-language-server typescript",
			"windows": "npm install -g typescript-language-server typescript",
		},
		Capabilities: []string{"completion", "hover", "definition", "references", "rename", "format"},
	},
	{
		Language:    "javascript",
		ServerName:  "typescript-language-server",
		Executables: []string{"typescript-language-server", "tsserver"},
		InstallCmds: map[string]string{
			"linux":   "npm install -g typescript-language-server typescript",
			"darwin":  "npm install -g typescript-language-server typescript",
			"windows": "npm install -g typescript-language-server typescript",
		},
		Capabilities: []string{"completion", "hover", "definition", "references", "rename", "format"},
	},
	{
		Language:    "moonbit",
		ServerName:  "moon",
		Executables: []string{"moon"},
		InstallCmds: map[string]string{
			"linux":   "See: https://www.moonbitlang.com/download/",
			"darwin":  "See: https://www.moonbitlang.com/download/",
			"windows": "See: https://www.moonbitlang.com/download/",
		},
		Capabilities: []string{"completion", "hover", "definition", "references", "format"},
	},
	{
		Language:    "c",
		ServerName:  "clangd",
		Executables: []string{"clangd"},
		InstallCmds: map[string]string{
			"linux":   "sudo apt install clangd",
			"darwin":  "brew install llvm",
			"windows": "winget install LLVM.LLVM",
		},
		Capabilities: []string{"completion", "hover", "definition", "references", "rename", "format"},
	},
	{
		Language:    "cpp",
		ServerName:  "clangd",
		Executables: []string{"clangd"},
		InstallCmds: map[string]string{
			"linux":   "sudo apt install clangd",
			"darwin":  "brew install llvm",
			"windows": "winget install LLVM.LLVM",
		},
		Capabilities: []string{"completion", "hover", "definition", "references", "rename", "format"},
	},
}

// Scanner scans for installed LSP servers
type Scanner struct {
	mu             sync.RWMutex
	servers        map[string]*LSPServer
	paths          []string
	onDetected     func(*LSPServer)
	onStatusChange func(id string, status LSPStatus)
}

// NewScanner creates a new LSP scanner
func NewScanner() *Scanner {
	return &Scanner{
		servers: make(map[string]*LSPServer),
		paths:   getPaths(),
	}
}

// getPaths returns the system PATH directories
func getPaths() []string {
	pathEnv := os.Getenv("PATH")
	var paths []string

	// Add common locations
	commonPaths := []string{
		"/usr/local/bin",
		"/usr/bin",
		"/opt/homebrew/bin",
		"/opt/local/bin",
	}

	if runtime.GOOS == "windows" {
		commonPaths = append(commonPaths,
			`C:\Program Files`,
			`C:\Program Files (x86)`,
			filepath.Join(os.Getenv("LOCALAPPDATA"), "Programs"),
		)
	}

	// Add Go bin path
	if goPath := os.Getenv("GOPATH"); goPath != "" {
		commonPaths = append(commonPaths, filepath.Join(goPath, "bin"))
	}
	if goBin := os.Getenv("GOBIN"); goBin != "" {
		commonPaths = append(commonPaths, goBin)
	}

	// Add Cargo bin path (Rust)
	if homeDir, err := os.UserHomeDir(); err == nil {
		commonPaths = append(commonPaths, filepath.Join(homeDir, ".cargo", "bin"))
	}

	// Add npm global bin path
	if npmPrefix, err := exec.LookPath("npm"); err == nil {
		if output, err := exec.Command(npmPrefix, "prefix", "-g").Output(); err == nil {
			npmGlobalBin := filepath.Join(strings.TrimSpace(string(output)), "bin")
			commonPaths = append(commonPaths, npmGlobalBin)
		}
	}

	// Add PATH directories
	for _, p := range strings.Split(pathEnv, string(os.PathListSeparator)) {
		if p != "" {
			paths = append(paths, p)
		}
	}

	// Add common paths
	for _, p := range commonPaths {
		if !containsPath(paths, p) {
			paths = append(paths, p)
		}
	}

	return paths
}

func containsPath(paths []string, p string) bool {
	return slices.Contains(paths, p)
}

// OnDetected sets the callback for when an LSP server is detected
func (s *Scanner) OnDetected(fn func(*LSPServer)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onDetected = fn
}

// OnStatusChange sets the callback for status changes
func (s *Scanner) OnStatusChange(fn func(string, LSPStatus)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onStatusChange = fn
}

// Scan scans for all known LSP servers
func (s *Scanner) Scan(ctx context.Context) ([]*LSPServer, error) {
	var wg sync.WaitGroup
	results := make(chan *LSPServer, len(KnownLSPServers))

	for _, known := range KnownLSPServers {
		wg.Add(1)
		go func(k KnownLSPServer) {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[LSP Scanner] scanServer panic for %q: %v", k.ServerName, r)
				}
				wg.Done()
			}()
			if server := s.scanServer(ctx, k); server != nil {
				results <- server
			}
		}(known)
	}

	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[LSP Scanner] Wait group cleanup panic: %v", r)
			}
		}()
		wg.Wait()
		close(results)
	}()

	// Collect results
	var detected []*LSPServer
	for server := range results {
		detected = append(detected, server)
	}

	// Store results under lock
	s.mu.Lock()
	for _, server := range detected {
		s.servers[server.ID] = server
	}
	// Snapshot callback to call outside lock
	onDetected := s.onDetected
	s.mu.Unlock()

	// Fire callbacks outside lock to prevent deadlock
	if onDetected != nil {
		for _, server := range detected {
			onDetected(server)
		}
	}

	return detected, nil
}

// scanServer scans for a specific LSP server
func (s *Scanner) scanServer(ctx context.Context, known KnownLSPServer) *LSPServer {
	// Try each executable name
	for _, execName := range known.Executables {
		execPath, err := s.findExecutable(execName)
		if err != nil {
			continue
		}

		server := &LSPServer{
			ID:           fmt.Sprintf("%s-%d", known.ServerName, time.Now().Unix()),
			Language:     known.Language,
			ServerName:   known.ServerName,
			Executable:   execName,
			Path:         execPath,
			Status:       LSPStatusInstalled,
			Capabilities: known.Capabilities,
			LastChecked:  time.Now(),
			Metadata:     make(map[string]any),
		}

		// Get version
		if version, err := s.getVersion(ctx, execPath); err == nil {
			server.Version = version
		}

		// Get install command for current OS
		if installCmd, ok := known.InstallCmds[runtime.GOOS]; ok {
			server.InstallCmd = installCmd
		}

		// Find config file
		if configPath := s.findConfig(known); configPath != "" {
			server.ConfigPath = configPath
		}

		return server
	}

	// Server not found, return entry with not_installed status
	return &LSPServer{
		ID:           fmt.Sprintf("%s-%d", known.ServerName, time.Now().Unix()),
		Language:     known.Language,
		ServerName:   known.ServerName,
		Status:       LSPStatusNotInstalled,
		Capabilities: known.Capabilities,
		LastChecked:  time.Now(),
		Metadata:     make(map[string]any),
	}
}

// findExecutable finds an executable in PATH
func (s *Scanner) findExecutable(name string) (string, error) {
	// Check if it's already an absolute path
	if filepath.IsAbs(name) {
		if _, err := os.Stat(name); err == nil {
			return name, nil
		}
		return "", fmt.Errorf("executable not found: %s", name)
	}

	// MEDIUM FIX: Capture paths snapshot under RLock to prevent data race with Refresh
	s.mu.RLock()
	paths := make([]string, len(s.paths))
	copy(paths, s.paths)
	s.mu.RUnlock()

	// Search in PATH
	for _, dir := range paths {
		path := filepath.Join(dir, name)
		if runtime.GOOS == "windows" {
			path += ".exe"
		}
		if _, err := os.Stat(path); err == nil {
			return path, nil
		}
	}

	return "", fmt.Errorf("executable not found: %s", name)
}

// getVersion gets the version of an LSP server
func (s *Scanner) getVersion(ctx context.Context, execPath string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// Try common version flags
	flags := []string{"--version", "-v", "version"}
	const maxVersionOutput = 64 * 1024 // 64KB limit for version output

	for _, flag := range flags {
		cmd := exec.CommandContext(ctx, execPath, flag)
		output, err := cmd.CombinedOutput()
		if err == nil && len(output) > 0 {
			if len(output) > maxVersionOutput {
				output = output[:maxVersionOutput]
			}
			version := strings.TrimSpace(string(output))
			// Clean up version string
			version = strings.Split(version, "\n")[0]
			return version, nil
		}
	}

	return "", fmt.Errorf("could not determine version")
}

// findConfig finds the config file for an LSP server
func (s *Scanner) findConfig(known KnownLSPServer) string {
	// Check current directory and parent directories
	dir, err := os.Getwd()
	if err != nil {
		return ""
	}

	for i := 0; i < 10; i++ { // Max 10 levels up
		for _, configFile := range known.ConfigFiles {
			path := filepath.Join(dir, configFile)
			if _, err := os.Stat(path); err == nil {
				return path
			}
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}

	return ""
}

// copyServer returns a shallow copy of LSPServer to prevent mutation of internal state
func copyServer(s *LSPServer) *LSPServer {
	copied := *s
	if copied.Capabilities != nil {
		copied.Capabilities = make([]string, len(s.Capabilities))
		copy(copied.Capabilities, s.Capabilities)
	}
	if copied.Metadata != nil {
		copied.Metadata = make(map[string]any, len(s.Metadata))
		for k, v := range s.Metadata {
			copied.Metadata[k] = v
		}
	}
	return &copied
}

// GetServer returns an LSP server by ID
func (s *Scanner) GetServer(id string) (*LSPServer, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	server, ok := s.servers[id]
	if !ok {
		return nil, false
	}
	return copyServer(server), true
}

// GetServers returns all detected LSP servers
func (s *Scanner) GetServers() []*LSPServer {
	s.mu.RLock()
	defer s.mu.RUnlock()

	servers := make([]*LSPServer, 0, len(s.servers))
	for _, server := range s.servers {
		servers = append(servers, copyServer(server))
	}
	return servers
}

// GetServersByLanguage returns LSP servers by language
func (s *Scanner) GetServersByLanguage(language string) []*LSPServer {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var servers []*LSPServer
	for _, server := range s.servers {
		if server.Language == language {
			servers = append(servers, copyServer(server))
		}
	}
	return servers
}

// GetInstalledServers returns only installed LSP servers
func (s *Scanner) GetInstalledServers() []*LSPServer {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var servers []*LSPServer
	for _, server := range s.servers {
		if server.Status == LSPStatusInstalled || server.Status == LSPStatusRunning {
			servers = append(servers, copyServer(server))
		}
	}
	return servers
}

// GetMissingServers returns LSP servers that are not installed
func (s *Scanner) GetMissingServers() []*LSPServer {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var servers []*LSPServer
	for _, server := range s.servers {
		if server.Status == LSPStatusNotInstalled {
			servers = append(servers, copyServer(server))
		}
	}
	return servers
}

// Refresh rescans for LSP servers
func (s *Scanner) Refresh(ctx context.Context) ([]*LSPServer, error) {
	s.mu.Lock()
	s.servers = make(map[string]*LSPServer)
	s.paths = getPaths()
	s.mu.Unlock()

	return s.Scan(ctx)
}

// InstallServer attempts to install an LSP server
// SECURITY: InstallCmd is validated against a whitelist of known-safe prefixes
func (s *Scanner) InstallServer(ctx context.Context, serverID string) error {
	// HIGH: Copy server under lock to prevent data race with concurrent Scan/Refresh
	s.mu.RLock()
	server, ok := s.servers[serverID]
	if !ok {
		s.mu.RUnlock()
		return fmt.Errorf("server not found: %s", serverID)
	}
	serverCopy := copyServer(server)
	s.mu.RUnlock()

	if serverCopy.InstallCmd == "" {
		return fmt.Errorf("no install command available for %q", serverCopy.ServerName)
	}

	// Check if it's a reference to documentation
	if strings.HasPrefix(serverCopy.InstallCmd, "See:") {
		return fmt.Errorf("manual installation required: %s", serverCopy.InstallCmd)
	}

	// Security: Validate install command against known-safe prefixes
	if !isSafeInstallCommand(serverCopy.InstallCmd) {
		return fmt.Errorf("install command rejected: unsafe command detected")
	}

	// Execute install command
	ctx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "powershell", "-Command", serverCopy.InstallCmd)
	} else {
		cmd = exec.CommandContext(ctx, "sh", "-c", serverCopy.InstallCmd)
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("installation failed: %w\n%s", err, string(output))
	}

	// Refresh to detect newly installed server
	if _, err := s.Refresh(ctx); err != nil {
		return fmt.Errorf("refresh failed: %w", err)
	}

	return nil
}

// safeInstallPrefixes lists allowed command prefixes for LSP server installation
var safeInstallPrefixes = []string{
	"go install ",
	"npm install ",
	"pip install ",
	"pip3 install ",
	"rustup ",
	"cargo install ",
	"dotnet tool install ",
	"brew install ",
	"apt install ",
	"yum install ",
	"dnf install ",
	"winget install ",
	"snap install ",
}

// isSafeInstallCommand validates an install command against known-safe prefixes
// and ensures no shell metacharacters are present that could enable command injection.
func isSafeInstallCommand(cmd string) bool {
	// Check for shell metacharacters that could enable command injection
	dangerousChars := []string{";", "&&", "||", "|", "`", "$(", "${", ">", "<", "\n", "\r"}
	for _, dangerous := range dangerousChars {
		if strings.Contains(cmd, dangerous) {
			return false
		}
	}

	for _, prefix := range safeInstallPrefixes {
		if strings.HasPrefix(cmd, prefix) {
			return true
		}
	}
	return false
}
