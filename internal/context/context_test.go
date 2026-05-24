package context

import (
	"context"
	"encoding/json"
	"os"
	"testing"
)

func TestContextManager_NilIndexer_Methods(t *testing.T) {
	cm := NewContextManager(nil)

	t.Run("FormatAsJSON", func(t *testing.T) {
		ctx := &AgentContext{ProjectRoot: "/test"}
		data, err := cm.FormatAsJSON(ctx)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		var parsed map[string]any
		if err := json.Unmarshal(data, &parsed); err != nil {
			t.Fatalf("invalid JSON: %v", err)
		}
		if parsed["projectRoot"] != "/test" {
			t.Errorf("expected projectRoot /test, got %v", parsed["projectRoot"])
		}
	})

	t.Run("RefreshIndex nil indexer", func(t *testing.T) {
		err := cm.RefreshIndex(context.Background())
		if err == nil {
			t.Error("expected error for nil indexer")
		}
	})

	t.Run("GetIndexerStats nil indexer", func(t *testing.T) {
		stats := cm.GetIndexerStats()
		if stats.TotalFiles != 0 || stats.TotalSymbols != 0 {
			t.Errorf("expected zero stats, got %+v", stats)
		}
	})

	t.Run("Search nil indexer", func(t *testing.T) {
		results := cm.Search("test", 10)
		if results != nil {
			t.Errorf("expected nil, got %v", results)
		}
	})

	t.Run("GetFileSymbols nil indexer", func(t *testing.T) {
		symbols := cm.GetFileSymbols("test.go")
		if symbols != nil {
			t.Errorf("expected nil, got %v", symbols)
		}
	})

	t.Run("ListFilesByType nil indexer", func(t *testing.T) {
		files := cm.ListFilesByType(FileTypeGo)
		if files != nil {
			t.Errorf("expected nil, got %v", files)
		}
	})

	t.Run("ResolveReference nil indexer", func(t *testing.T) {
		file := cm.ResolveReference("mypkg.MyFunc")
		if file != nil {
			t.Errorf("expected nil, got %v", file)
		}
	})

	t.Run("GetContext nil indexer", func(t *testing.T) {
		ctx, err := cm.GetContext(context.Background(), ContextRequest{
			FilePaths:   []string{"test.go"},
			SymbolNames: []string{"MyFunc"},
			SearchQuery: "test",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		// Nil indexer returns empty context — no ProjectRoot, no files, no symbols
		if ctx.ProjectRoot != "" {
			t.Errorf("expected empty ProjectRoot for nil indexer, got %q", ctx.ProjectRoot)
		}
		if len(ctx.Files) != 0 {
			t.Errorf("expected no files for nil indexer, got %d", len(ctx.Files))
		}
		if len(ctx.Symbols) != 0 {
			t.Errorf("expected no symbols for nil indexer, got %d", len(ctx.Symbols))
		}
	})
}

func TestContextManager_WithIndexer_ResolveReference(t *testing.T) {
	// Create a Go file in a temp dir, then index that dir
	dir := t.TempDir()
	goFile := dir + "/main.go"
	content := []byte("package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println(\"hello\")\n}\n")
	if err := writeFile(t, goFile, content); err != nil {
		t.Fatalf("write: %v", err)
	}

	idx := NewIndexer(IndexConfig{RootDir: dir, EnableSymbolExtraction: true})
	cm := NewContextManager(idx)

	if err := idx.Index(context.Background()); err != nil {
		t.Fatalf("index: %v", err)
	}

	// Test GetFileSymbols on an indexed file
	symbols := cm.GetFileSymbols("main.go")
	found := false
	for _, s := range symbols {
		if s.Name == "main" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected to find 'main' symbol in main.go")
	}

	// Test ListFiles
	files := idx.ListFiles()
	if len(files) == 0 {
		t.Fatal("expected at least 1 file after indexing")
	}

	// Test GetFilesByImport
	importFiles := idx.GetFilesByImport("fmt")
	if len(importFiles) != 1 {
		t.Errorf("expected 1 file importing 'fmt', got %d", len(importFiles))
	}

	// Test ResolveReference - symbol found
	file := cm.ResolveReference("main")
	if file == nil {
		t.Error("expected to resolve 'main' symbol")
	}

	// Test ResolveReference - import found
	file = cm.ResolveReference("fmt")
	if file == nil {
		t.Error("expected to resolve 'fmt' import")
	}

	// Test ResolveReference - not found
	file = cm.ResolveReference("nonexistent")
	if file != nil {
		t.Error("expected nil for nonexistent reference")
	}
}

func TestContextManager_RecordAccess(t *testing.T) {
	cm := NewContextManager(nil)

	// Access some files
	cm.RecordAccess("file1.go")
	cm.RecordAccess("file2.go")
	cm.RecordAccess("file3.go")

	recent := cm.recentFiles
	if len(recent) != 3 {
		t.Errorf("expected 3 recent files, got %d", len(recent))
	}
}

func TestContextManager_RecentFiles_Limit(t *testing.T) {
	cm := NewContextManager(nil)
	// Override maxRecent for test
	cm.maxRecent = 2

	// Record access to different files — same path deduplicates
	cm.RecordAccess("file1.go")
	cm.RecordAccess("file2.go")
	cm.RecordAccess("file3.go")

	recent := cm.recentFiles
	if len(recent) != 2 {
		t.Errorf("expected 2 recent files (max limit), got %d", len(recent))
	}
	// Most recent should be first
	if recent[0] != "file3.go" {
		t.Errorf("expected file3.go first, got %s", recent[0])
	}
}

// writeFile is a test helper
func writeFile(t *testing.T, path string, data []byte) error {
	t.Helper()
	return os.WriteFile(path, data, 0644)
}

func TestContextManager_GetContext_WithIndexer(t *testing.T) {
	dir := t.TempDir()
	goFile := dir + "/main.go"
	content := []byte("package main\n\nimport \"fmt\"\n\nfunc main() {}\nfunc Helper() {}\n")
	if err := writeFile(t, goFile, content); err != nil {
		t.Fatalf("write: %v", err)
	}

	idx := NewIndexer(IndexConfig{RootDir: dir, EnableSymbolExtraction: true})
	cm := NewContextManager(idx)

	if err := idx.Index(context.Background()); err != nil {
		t.Fatalf("index: %v", err)
	}

	t.Run("with file paths", func(t *testing.T) {
		ctx, err := cm.GetContext(context.Background(), ContextRequest{
			FilePaths: []string{"main.go"},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if ctx.ProjectRoot != dir {
			t.Errorf("expected project root %s, got %s", dir, ctx.ProjectRoot)
		}
		if ctx.TotalFiles != 1 {
			t.Errorf("expected 1 total file, got %d", ctx.TotalFiles)
		}
		if len(ctx.Files) != 1 {
			t.Errorf("expected 1 file, got %d", len(ctx.Files))
		}
	})

	t.Run("with symbol names", func(t *testing.T) {
		ctx, err := cm.GetContext(context.Background(), ContextRequest{
			SymbolNames: []string{"main"},
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(ctx.Files) == 0 {
			t.Error("expected files for symbol 'main'")
		}
		if len(ctx.Symbols) == 0 {
			t.Error("expected symbols for 'main'")
		}
	})

	t.Run("with search query", func(t *testing.T) {
		ctx, err := cm.GetContext(context.Background(), ContextRequest{
			SearchQuery: "main",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(ctx.SearchResults) == 0 {
			t.Error("expected search results")
		}
	})

	t.Run("with max files limit", func(t *testing.T) {
		ctx, err := cm.GetContext(context.Background(), ContextRequest{
			FilePaths:   []string{"main.go"},
			SymbolNames: []string{"main"},
			MaxFiles:    1,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(ctx.Files) > 1 {
			t.Errorf("expected at most 1 file, got %d", len(ctx.Files))
		}
	})

	t.Run("with include recent", func(t *testing.T) {
		cm.RecordAccess("main.go")
		ctx, err := cm.GetContext(context.Background(), ContextRequest{
			IncludeRecent: true,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(ctx.RecentFiles) == 0 {
			t.Error("expected recent files")
		}
	})
}

func TestContextManager_FormatForPrompt(t *testing.T) {
	cm := NewContextManager(nil)
	ctx := &AgentContext{
		ProjectRoot:  "/test",
		TotalFiles:   5,
		TotalSymbols: 10,
		Files: []*FileInfo{
			{
				Path:     "main.go",
				FileType: "go",
				Size:     100,
				Symbols: []Symbol{
					{Name: "main", Kind: "function", Exported: false},
					{Name: "Helper", Kind: "function", Exported: true},
				},
			},
		},
		RecentFiles: []string{"main.go"},
	}

	result := cm.FormatForPrompt(ctx)
	if result == "" {
		t.Error("expected non-empty prompt")
	}
	if !contains(result, "# Codebase Context") {
		t.Error("expected header in prompt")
	}
	if !contains(result, "/test") {
		t.Error("expected project root in prompt")
	}
	if !contains(result, "main.go") {
		t.Error("expected file path in prompt")
	}
	if !contains(result, "main") {
		t.Error("expected symbol name in prompt")
	}
	if !contains(result, "(exported)") {
		t.Error("expected exported annotation in prompt")
	}
}

func TestContextManager_FormatForPrompt_Empty(t *testing.T) {
	cm := NewContextManager(nil)
	ctx := &AgentContext{}
	result := cm.FormatForPrompt(ctx)
	if result == "" {
		t.Error("expected non-empty prompt even for empty context")
	}
}

func TestContextManager_EstimateTokens(t *testing.T) {
	cm := NewContextManager(nil)
	ctx := &AgentContext{
		Files: []*FileInfo{
			{Path: "a.go", Symbols: make([]Symbol, 5), Imports: []string{"fmt", "os"}},
		},
		SearchResults: []*FileInfo{
			{Path: "b.go"},
		},
		RecentFiles: []string{"a.go", "b.go"},
	}
	tokens := cm.estimateTokens(ctx)
	if tokens <= 0 {
		t.Errorf("expected positive token estimate, got %d", tokens)
	}
}

func TestContextManager_ListFilesByType_WithIndexer(t *testing.T) {
	dir := t.TempDir()
	if err := writeFile(t, dir+"/main.go", []byte("package main")); err != nil {
		t.Fatal(err)
	}
	if err := writeFile(t, dir+"/app.ts", []byte("const x = 1")); err != nil {
		t.Fatal(err)
	}

	idx := NewIndexer(IndexConfig{RootDir: dir, EnableSymbolExtraction: true})
	cm := NewContextManager(idx)
	if err := idx.Index(context.Background()); err != nil {
		t.Fatal(err)
	}

	goFiles := cm.ListFilesByType(FileTypeGo)
	if len(goFiles) != 1 {
		t.Errorf("expected 1 Go file, got %d", len(goFiles))
	}

	tsFiles := cm.ListFilesByType(FileTypeTS)
	if len(tsFiles) != 1 {
		t.Errorf("expected 1 TS file, got %d", len(tsFiles))
	}
}

func TestContextManager_RefreshIndex_WithIndexer(t *testing.T) {
	dir := t.TempDir()
	if err := writeFile(t, dir+"/main.go", []byte("package main")); err != nil {
		t.Fatal(err)
	}

	idx := NewIndexer(IndexConfig{RootDir: dir})
	cm := NewContextManager(idx)

	err := cm.RefreshIndex(context.Background())
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestContextManager_Search_WithIndexer(t *testing.T) {
	dir := t.TempDir()
	if err := writeFile(t, dir+"/main.go", []byte("package main\nfunc myFunc() {}")); err != nil {
		t.Fatal(err)
	}

	idx := NewIndexer(IndexConfig{RootDir: dir, EnableSymbolExtraction: true})
	cm := NewContextManager(idx)
	if err := idx.Index(context.Background()); err != nil {
		t.Fatal(err)
	}

	results := cm.Search("myFunc", 10)
	if len(results) == 0 {
		t.Error("expected search results for 'myFunc'")
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsStr(s, substr))
}

func containsStr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
