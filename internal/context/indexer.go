// Package context provides codebase indexing and context management
// for multi-agent coordination in Swarm Editor.
package context

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// FileType represents the type of source file
type FileType string

const (
	FileTypeGo       FileType = "go"
	FileTypeTS       FileType = "typescript"
	FileTypeTSX      FileType = "tsx"
	FileTypeJS       FileType = "javascript"
	FileTypeJSX      FileType = "jsx"
	FileTypePython   FileType = "python"
	FileTypeRust     FileType = "rust"
	FileTypeMarkdown FileType = "markdown"
	FileTypeJSON     FileType = "json"
	FileTypeYAML     FileType = "yaml"
	FileTypeOther    FileType = "other"
)

// FileInfo represents indexed file information
type FileInfo struct {
	Path         string      `json:"path"`
	AbsPath      string      `json:"absPath"`
	FileType     FileType    `json:"fileType"`
	Size         int64       `json:"size"`
	LastModified time.Time   `json:"lastModified"`
	Symbols      []Symbol    `json:"symbols,omitempty"`
	Imports      []string    `json:"imports,omitempty"`
	Exports      []string    `json:"exports,omitempty"`
	Hash         string      `json:"hash,omitempty"`
	IndexedAt    time.Time   `json:"indexedAt"`
}

// Symbol represents a code symbol (function, class, interface, etc.)
type Symbol struct {
	Name      string     `json:"name"`
	Kind      SymbolKind `json:"kind"`
	Signature string     `json:"signature,omitempty"`
	Docstring string     `json:"docstring,omitempty"`
	Line      int        `json:"line"`
	EndLine   int        `json:"endLine,omitempty"`
	Exported  bool       `json:"exported"`
}

// SymbolKind represents the type of symbol
type SymbolKind string

const (
	SymbolKindFunction  SymbolKind = "function"
	SymbolKindMethod    SymbolKind = "method"
	SymbolKindClass     SymbolKind = "class"
	SymbolKindInterface SymbolKind = "interface"
	SymbolKindStruct    SymbolKind = "struct"
	SymbolKindType      SymbolKind = "type"
	SymbolKindConst     SymbolKind = "const"
	SymbolKindVar       SymbolKind = "var"
	SymbolKindEnum      SymbolKind = "enum"
)

// IndexConfig holds configuration for the indexer
type IndexConfig struct {
	// RootDir is the project root directory to index
	RootDir string `json:"rootDir"`

	// ExcludePatterns are glob patterns to exclude
	ExcludePatterns []string `json:"excludePatterns,omitempty"`

	// IncludePatterns are glob patterns to include (empty = all)
	IncludePatterns []string `json:"includePatterns,omitempty"`

	// MaxFileSize limits the size of files to index (bytes)
	MaxFileSize int64 `json:"maxFileSize,omitempty"`

	// EnableSymbolExtraction enables symbol parsing
	EnableSymbolExtraction bool `json:"enableSymbolExtraction"`

	// MaxDepth limits directory traversal depth (0 = unlimited)
	MaxDepth int `json:"maxDepth,omitempty"`

	// FileTypes to index (empty = all supported)
	FileTypes []FileType `json:"fileTypes,omitempty"`
}

// DefaultIndexConfig returns default configuration
func DefaultIndexConfig(rootDir string) IndexConfig {
	return IndexConfig{
		RootDir:                rootDir,
		ExcludePatterns:        DefaultExcludePatterns(),
		MaxFileSize:            1 << 20, // 1MB
		EnableSymbolExtraction: true,
		MaxDepth:               20,
		FileTypes:              []FileType{FileTypeGo, FileTypeTS, FileTypeTSX, FileTypeJS, FileTypeJSX, FileTypePython, FileTypeRust},
	}
}

// DefaultExcludePatterns returns common patterns to exclude
func DefaultExcludePatterns() []string {
	return []string{
		"node_modules",
		"vendor",
		".git",
		".svn",
		".hg",
		"dist",
		"build",
		"target",
		"bin",
		"obj",
		"*.min.js",
		"*.min.css",
		"*.lock",
		"package-lock.json",
		"yarn.lock",
		"pnpm-lock.yaml",
		"go.sum",
		".DS_Store",
		"*.swp",
		"*.swo",
		"*~",
		"__pycache__",
		"*.pyc",
		".pytest_cache",
		".mypy_cache",
		"coverage",
		".nyc_output",
	}
}

// Indexer provides codebase indexing functionality
type Indexer struct {
	config IndexConfig

	mu       sync.RWMutex
	files    map[string]*FileInfo // path -> FileInfo
	symbols  map[string][]*FileInfo // symbol name -> files containing it
	imports  map[string][]*FileInfo // import path -> files using it
	byType   map[FileType][]*FileInfo

	lastIndex time.Time
	stats     IndexStats
}

// IndexStats holds indexing statistics
type IndexStats struct {
	TotalFiles    int       `json:"totalFiles"`
	TotalSymbols  int       `json:"totalSymbols"`
	TotalSize     int64     `json:"totalSize"`
	IndexDuration time.Duration `json:"indexDuration"`
	LastIndexed   time.Time `json:"lastIndexed"`
	Errors        int       `json:"errors"`
}

// NewIndexer creates a new codebase indexer
func NewIndexer(config IndexConfig) *Indexer {
	return &Indexer{
		config:   config,
		files:    make(map[string]*FileInfo),
		symbols:  make(map[string][]*FileInfo),
		imports:  make(map[string][]*FileInfo),
		byType:   make(map[FileType][]*FileInfo),
	}
}

// Index performs a full index of the codebase
func (idx *Indexer) Index(ctx context.Context) error {
	start := time.Now()

	idx.mu.Lock()
	// Clear existing index
	idx.files = make(map[string]*FileInfo)
	idx.symbols = make(map[string][]*FileInfo)
	idx.imports = make(map[string][]*FileInfo)
	idx.byType = make(map[FileType][]*FileInfo)
	idx.mu.Unlock()

	var errs int

	err := filepath.Walk(idx.config.RootDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			errs++
			return nil // Continue walking
		}

		// Check context cancellation
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		// Skip directories based on exclude patterns
		if info.IsDir() {
			if idx.shouldExcludeDir(path) {
				return filepath.SkipDir
			}
			return nil
		}

		// Check file constraints
		if !idx.shouldIndexFile(path, info) {
			return nil
		}

		// Index the file
		fileInfo, err := idx.indexFile(path, info)
		if err != nil {
			errs++
			return nil // Continue with other files
		}

		// Store in indices
		idx.mu.Lock()
		relPath := idx.relativePath(path)
		idx.files[relPath] = fileInfo

		// Index by type
		idx.byType[fileInfo.FileType] = append(idx.byType[fileInfo.FileType], fileInfo)

		// Index symbols
		for _, sym := range fileInfo.Symbols {
			idx.symbols[sym.Name] = append(idx.symbols[sym.Name], fileInfo)
		}

		// Index imports
		for _, imp := range fileInfo.Imports {
			idx.imports[imp] = append(idx.imports[imp], fileInfo)
		}
		idx.mu.Unlock()

		return nil
	})

	idx.mu.Lock()
	idx.stats = IndexStats{
		TotalFiles:    len(idx.files),
		TotalSymbols:  idx.countSymbolsLocked(),
		TotalSize:     idx.countSizeLocked(),
		IndexDuration: time.Since(start),
		LastIndexed:   time.Now(),
		Errors:        errs,
	}
	idx.lastIndex = time.Now()
	idx.mu.Unlock()

	return err
}

// shouldExcludeDir checks if a directory should be excluded
func (idx *Indexer) shouldExcludeDir(path string) bool {
	base := filepath.Base(path)

	// Check against exclude patterns
	for _, pattern := range idx.config.ExcludePatterns {
		// Simple name match for directory patterns
		if !strings.Contains(pattern, "/") && !strings.HasPrefix(pattern, "*") {
			if base == pattern {
				return true
			}
		}
		// Glob match
		if matched, _ := filepath.Match(pattern, base); matched {
			return true
		}
	}

	return false
}

// shouldIndexFile checks if a file should be indexed
func (idx *Indexer) shouldIndexFile(path string, info os.FileInfo) bool {
	// Check file size
	if idx.config.MaxFileSize > 0 && info.Size() > idx.config.MaxFileSize {
		return false
	}

	// Get file type
	ft := detectFileType(path)

	// Check if file type is in allowed list
	if len(idx.config.FileTypes) > 0 {
		allowed := false
		for _, t := range idx.config.FileTypes {
			if t == ft {
				allowed = true
				break
			}
		}
		if !allowed {
			return false
		}
	}

	// Check include patterns
	if len(idx.config.IncludePatterns) > 0 {
		matched := false
		for _, pattern := range idx.config.IncludePatterns {
			if m, _ := filepath.Match(pattern, filepath.Base(path)); m {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}

	// Check exclude patterns
	for _, pattern := range idx.config.ExcludePatterns {
		if m, _ := filepath.Match(pattern, filepath.Base(path)); m {
			return false
		}
	}

	return true
}

// indexFile indexes a single file
func (idx *Indexer) indexFile(path string, info os.FileInfo) (*FileInfo, error) {
	absPath, err := filepath.Abs(path)
	if err != nil {
		absPath = path
	}

	fileInfo := &FileInfo{
		Path:         idx.relativePath(path),
		AbsPath:      absPath,
		FileType:     detectFileType(path),
		Size:         info.Size(),
		LastModified: info.ModTime(),
		IndexedAt:    time.Now(),
	}

	// Extract symbols if enabled
	if idx.config.EnableSymbolExtraction {
		content, err := os.ReadFile(path)
		if err != nil {
			return fileInfo, nil // Return basic info even on error
		}

		fileInfo.Symbols = extractSymbols(path, content)
		fileInfo.Imports = extractImports(path, content)
		fileInfo.Exports = extractExports(path, content)
		fileInfo.Hash = hashContent(content)
	}

	return fileInfo, nil
}

// relativePath returns the path relative to root directory
func (idx *Indexer) relativePath(path string) string {
	rel, err := filepath.Rel(idx.config.RootDir, path)
	if err != nil {
		return path
	}
	return rel
}

// detectFileType determines the file type from extension
func detectFileType(path string) FileType {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".go":
		return FileTypeGo
	case ".ts":
		return FileTypeTS
	case ".tsx":
		return FileTypeTSX
	case ".js":
		return FileTypeJS
	case ".jsx":
		return FileTypeJSX
	case ".py":
		return FileTypePython
	case ".rs":
		return FileTypeRust
	case ".md", ".markdown":
		return FileTypeMarkdown
	case ".json":
		return FileTypeJSON
	case ".yaml", ".yml":
		return FileTypeYAML
	default:
		return FileTypeOther
	}
}

// countSymbolsLocked counts total symbols (must hold lock)
func (idx *Indexer) countSymbolsLocked() int {
	count := 0
	for _, files := range idx.symbols {
		count += len(files)
	}
	return count
}

// countSizeLocked counts total size (must hold lock)
func (idx *Indexer) countSizeLocked() int64 {
	var total int64
	for _, f := range idx.files {
		total += f.Size
	}
	return total
}

// GetStats returns current index statistics
func (idx *Indexer) GetStats() IndexStats {
	idx.mu.RLock()
	defer idx.mu.RUnlock()
	return idx.stats
}

// GetFile returns file info by path
func (idx *Indexer) GetFile(path string) *FileInfo {
	idx.mu.RLock()
	defer idx.mu.RUnlock()
	return idx.files[path]
}

// ListFiles returns all indexed files
func (idx *Indexer) ListFiles() []*FileInfo {
	idx.mu.RLock()
	defer idx.mu.RUnlock()

	files := make([]*FileInfo, 0, len(idx.files))
	for _, f := range idx.files {
		files = append(files, f)
	}
	return files
}

// SearchSymbols searches for symbols matching the query
func (idx *Indexer) SearchSymbols(query string, limit int) []*FileInfo {
	idx.mu.RLock()
	defer idx.mu.RUnlock()

	query = strings.ToLower(query)
	var results []*FileInfo
	seen := make(map[string]bool)

	for name, files := range idx.symbols {
		if strings.Contains(strings.ToLower(name), query) {
			for _, f := range files {
				if !seen[f.Path] {
					results = append(results, f)
					seen[f.Path] = true
					if limit > 0 && len(results) >= limit {
						return results
					}
				}
			}
		}
	}

	return results
}

// GetFilesByType returns all files of a specific type
func (idx *Indexer) GetFilesByType(ft FileType) []*FileInfo {
	idx.mu.RLock()
	defer idx.mu.RUnlock()

	files := make([]*FileInfo, len(idx.byType[ft]))
	copy(files, idx.byType[ft])
	return files
}

// GetFilesByImport returns files that import a specific path
func (idx *Indexer) GetFilesByImport(importPath string) []*FileInfo {
	idx.mu.RLock()
	defer idx.mu.RUnlock()

	files := make([]*FileInfo, len(idx.imports[importPath]))
	copy(files, idx.imports[importPath])
	return files
}
