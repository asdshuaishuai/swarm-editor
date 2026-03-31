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
