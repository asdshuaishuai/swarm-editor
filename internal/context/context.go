package context

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"
)

// ContextManager provides codebase context for Agent interactions
type ContextManager struct {
	indexer *Indexer

	mu          sync.RWMutex
	recentFiles []string // Recently accessed files
	maxRecent   int
}

// NewContextManager creates a new context manager
func NewContextManager(indexer *Indexer) *ContextManager {
	return &ContextManager{
		indexer:     indexer,
		recentFiles: make([]string, 0, 20),
		maxRecent:   20,
	}
}

// AgentContext represents context to be provided to an Agent
type AgentContext struct {
	// Project info
	ProjectRoot   string    `json:"projectRoot"`
	IndexedAt     time.Time `json:"indexedAt"`
	TotalFiles    int       `json:"totalFiles"`
	TotalSymbols  int       `json:"totalSymbols"`

	// Requested context
	Files    []*FileInfo `json:"files,omitempty"`
	Symbols  []Symbol    `json:"symbols,omitempty"`
	Imports  []string    `json:"imports,omitempty"`

	// Search results
	SearchResults []*FileInfo `json:"searchResults,omitempty"`

	// Recent files
	RecentFiles []string `json:"recentFiles,omitempty"`

	// Token budget info
	EstimatedTokens int `json:"estimatedTokens,omitempty"`
}

// ContextRequest represents a request for context
type ContextRequest struct {
	// File paths to include
	FilePaths []string `json:"filePaths,omitempty"`

	// Symbol names to lookup
	SymbolNames []string `json:"symbolNames,omitempty"`

	// Search query
	SearchQuery string `json:"searchQuery,omitempty"`

	// Max files to return
	MaxFiles int `json:"maxFiles,omitempty"`

	// Max tokens budget (for estimation)
	MaxTokens int `json:"maxTokens,omitempty"`

	// Include recent files
	IncludeRecent bool `json:"includeRecent,omitempty"`

	// File types to filter
	FileTypes []FileType `json:"fileTypes,omitempty"`
}

// GetContext retrieves context based on the request
func (cm *ContextManager) GetContext(ctx context.Context, req ContextRequest) (*AgentContext, error) {
	result := &AgentContext{
		Files:      make([]*FileInfo, 0),
		Symbols:    make([]Symbol, 0),
		RecentFiles: make([]string, 0),
	}

	if cm.indexer == nil {
		return result, nil
	}

	// Get stats
	stats := cm.indexer.GetStats()
	result.ProjectRoot = cm.indexer.config.RootDir
	result.IndexedAt = stats.LastIndexed
	result.TotalFiles = stats.TotalFiles
	result.TotalSymbols = stats.TotalSymbols

	// Track seen files to avoid duplicates
	seen := make(map[string]bool)

	// Add requested files
	for _, path := range req.FilePaths {
		if req.MaxFiles > 0 && len(result.Files) >= req.MaxFiles {
			break
		}

		file := cm.indexer.GetFile(path)
		if file != nil && !seen[file.Path] {
			result.Files = append(result.Files, file)
			seen[file.Path] = true
		}
	}

	// Add files containing requested symbols
	for _, name := range req.SymbolNames {
		if req.MaxFiles > 0 && len(result.Files) >= req.MaxFiles {
			break
		}

		files := cm.indexer.SearchSymbols(name, 5)
		for _, file := range files {
			if !seen[file.Path] {
				result.Files = append(result.Files, file)
				seen[file.Path] = true

				// Add matching symbols
				for _, sym := range file.Symbols {
					if strings.Contains(strings.ToLower(sym.Name), strings.ToLower(name)) {
						result.Symbols = append(result.Symbols, sym)
					}
				}
			}
		}
	}

	// Add search results
	if req.SearchQuery != "" {
		limit := 10
		if req.MaxFiles > 0 {
			limit = req.MaxFiles
		}
		result.SearchResults = cm.indexer.SearchSymbols(req.SearchQuery, limit)
	}

	// Add recent files
	if req.IncludeRecent {
		cm.mu.RLock()
		result.RecentFiles = make([]string, len(cm.recentFiles))
		copy(result.RecentFiles, cm.recentFiles)
		cm.mu.RUnlock()
	}

	// Estimate tokens
	result.EstimatedTokens = cm.estimateTokens(result)

	return result, nil
}

// RecordAccess records a file access for recent file tracking
func (cm *ContextManager) RecordAccess(path string) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	// Remove if already exists
	for i, p := range cm.recentFiles {
		if p == path {
			cm.recentFiles = append(cm.recentFiles[:i], cm.recentFiles[i+1:]...)
			break
		}
	}

	// Add to front
	cm.recentFiles = append([]string{path}, cm.recentFiles...)

	// Trim to max
	if len(cm.recentFiles) > cm.maxRecent {
		cm.recentFiles = cm.recentFiles[:cm.maxRecent]
	}
}

// FormatForPrompt formats context as a string for Agent prompts
func (cm *ContextManager) FormatForPrompt(ctx *AgentContext) string {
	var sb strings.Builder

	sb.WriteString("# Codebase Context\n\n")

	// Project overview
	sb.WriteString(fmt.Sprintf("## Project Overview\n"))
	sb.WriteString(fmt.Sprintf("- Root: %s\n", ctx.ProjectRoot))
	sb.WriteString(fmt.Sprintf("- Files: %d indexed\n", ctx.TotalFiles))
	sb.WriteString(fmt.Sprintf("- Symbols: %d found\n\n", ctx.TotalSymbols))

	// File contents
	if len(ctx.Files) > 0 {
		sb.WriteString("## Referenced Files\n\n")
		for _, file := range ctx.Files {
			sb.WriteString(fmt.Sprintf("### %s\n", file.Path))
			sb.WriteString(fmt.Sprintf("Type: %s | Size: %d bytes\n\n", file.FileType, file.Size))

			if len(file.Symbols) > 0 {
				sb.WriteString("**Symbols:**\n")
				for _, sym := range file.Symbols {
					exported := ""
					if sym.Exported {
						exported = " (exported)"
					}
					sb.WriteString(fmt.Sprintf("- %s %s%s\n", sym.Kind, sym.Name, exported))
				}
				sb.WriteString("\n")
			}

			if len(file.Imports) > 0 {
				sb.WriteString("**Imports:**\n")
				for _, imp := range file.Imports {
					sb.WriteString(fmt.Sprintf("- %s\n", imp))
				}
				sb.WriteString("\n")
			}
		}
	}

	// Search results summary
	if len(ctx.SearchResults) > 0 {
		sb.WriteString("## Search Results\n\n")
		for _, file := range ctx.SearchResults {
			sb.WriteString(fmt.Sprintf("- %s (%d symbols)\n", file.Path, len(file.Symbols)))
		}
		sb.WriteString("\n")
	}

	// Recent files
	if len(ctx.RecentFiles) > 0 {
		sb.WriteString("## Recent Files\n\n")
		for _, path := range ctx.RecentFiles {
			sb.WriteString(fmt.Sprintf("- %s\n", path))
		}
		sb.WriteString("\n")
	}

	sb.WriteString(fmt.Sprintf("*Estimated tokens: ~%d*\n", ctx.EstimatedTokens))

	return sb.String()
}

// FormatAsJSON formats context as JSON
func (cm *ContextManager) FormatAsJSON(ctx *AgentContext) ([]byte, error) {
	return json.MarshalIndent(ctx, "", "  ")
}

// estimateTokens estimates token count for context
func (cm *ContextManager) estimateTokens(ctx *AgentContext) int {
	// Rough estimation: ~4 characters per token
	chars := 0

	// Base overhead
	chars += 200

	// Files
	for _, file := range ctx.Files {
		chars += len(file.Path) * 2
		chars += len(file.Symbols) * 50 // ~50 chars per symbol
		chars += len(file.Imports) * 30
	}

	// Search results
	for _, file := range ctx.SearchResults {
		chars += len(file.Path) * 2
	}

	// Recent files
	for _, path := range ctx.RecentFiles {
		chars += len(path)
	}

	return chars / 4
}

// RefreshIndex refreshes the codebase index
func (cm *ContextManager) RefreshIndex(ctx context.Context) error {
	if cm.indexer == nil {
		return fmt.Errorf("indexer not configured")
	}
	return cm.indexer.Index(ctx)
}

// GetIndexerStats returns current indexing statistics
func (cm *ContextManager) GetIndexerStats() IndexStats {
	if cm.indexer == nil {
		return IndexStats{}
	}
	return cm.indexer.GetStats()
}

// Search performs a quick search across the codebase
func (cm *ContextManager) Search(query string, limit int) []*FileInfo {
	if cm.indexer == nil {
		return nil
	}
	return cm.indexer.SearchSymbols(query, limit)
}

// GetFileSymbols returns symbols in a specific file
func (cm *ContextManager) GetFileSymbols(path string) []Symbol {
	if cm.indexer == nil {
		return nil
	}

	file := cm.indexer.GetFile(path)
	if file == nil {
		return nil
	}

	cm.RecordAccess(path)
	return file.Symbols
}

// ListFilesByType lists all files of a specific type
func (cm *ContextManager) ListFilesByType(ft FileType) []*FileInfo {
	if cm.indexer == nil {
		return nil
	}
	return cm.indexer.GetFilesByType(ft)
}

// ResolveReference attempts to resolve a symbol or import reference
func (cm *ContextManager) ResolveReference(ref string) *FileInfo {
	if cm.indexer == nil {
		return nil
	}

	// Try as symbol name first
	files := cm.indexer.SearchSymbols(ref, 1)
	if len(files) > 0 {
		return files[0]
	}

	// Try as import path
	files = cm.indexer.GetFilesByImport(ref)
	if len(files) > 0 {
		return files[0]
	}

	return nil
}
