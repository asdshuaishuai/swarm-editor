package context

import (
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"strings"
)

// extractSymbols extracts code symbols from file content
func extractSymbols(path string, content []byte) []Symbol {
	ft := detectFileType(path)

	switch ft {
	case FileTypeGo:
		return extractGoSymbols(content)
	case FileTypeTS, FileTypeTSX:
		return extractTSSymbols(content)
	case FileTypeJS, FileTypeJSX:
		return extractJSSymbols(content)
	case FileTypePython:
		return extractPythonSymbols(content)
	case FileTypeRust:
		return extractRustSymbols(content)
	default:
		return nil
	}
}

// extractImports extracts import statements from file content
func extractImports(path string, content []byte) []string {
	ft := detectFileType(path)

	switch ft {
	case FileTypeGo:
		return extractGoImports(content)
	case FileTypeTS, FileTypeTSX, FileTypeJS, FileTypeJSX:
		return extractJSImports(content)
	case FileTypePython:
		return extractPythonImports(content)
	case FileTypeRust:
		return extractRustImports(content)
	default:
		return nil
	}
}

// extractExports extracts export statements from file content
func extractExports(path string, content []byte) []string {
	ft := detectFileType(path)

	switch ft {
	case FileTypeTS, FileTypeTSX, FileTypeJS, FileTypeJSX:
		return extractJSExports(content)
	default:
		return nil
	}
}

// hashContent creates a hash of file content
func hashContent(content []byte) string {
	hash := sha256.Sum256(content)
	return hex.EncodeToString(hash[:8])
}

// ============================================================================
// Go Symbol Extraction
// ============================================================================

var (
	goFuncRegex        = regexp.MustCompile(`(?m)^(?:func\s+(?:\([^)]+\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\()`)
	goStructRegex      = regexp.MustCompile(`(?m)^type\s+([A-Za-z_][A-Za-z0-9_]*)\s+struct`)
	goInterfaceRegex   = regexp.MustCompile(`(?m)^type\s+([A-Za-z_][A-Za-z0-9_]*)\s+interface`)
	goTypeRegex        = regexp.MustCompile(`(?m)^type\s+([A-Za-z_][A-Za-z0-9_]*)\s+(?:[a-z]+)`)
	goImportBlockRegex = regexp.MustCompile(`import\s*\(([\s\S]*?)\)`)
	goSingleImportRegex = regexp.MustCompile(`import\s+"([^"]+)"`)
)

func extractGoSymbols(content []byte) []Symbol {
	var symbols []Symbol

	// Extract functions
	matches := goFuncRegex.FindAllSubmatchIndex(content, -1)
	for i := range matches {
		m := matches[i]
		startIdx := m[0]
		nameIdx := m[2]
		nameEndIdx := m[3]

		name := string(content[nameIdx:nameEndIdx])
		line := countLines(content[:startIdx])

		// Check if exported (starts with uppercase)
		exported := len(name) > 0 && name[0] >= 'A' && name[0] <= 'Z'

		// Determine if method or function
		kind := SymbolKindFunction
		text := string(content[startIdx:m[1]])
		if strings.Contains(text, "func (") {
			kind = SymbolKindMethod
		}

		symbols = append(symbols, Symbol{
			Name:     name,
			Kind:     kind,
			Line:     line + 1,
			Exported: exported,
		})
	}

	// Extract structs
	matches = goStructRegex.FindAllSubmatchIndex(content, -1)
	for i := range matches {
		m := matches[i]
		name := string(content[m[2]:m[3]])
		line := countLines(content[:m[0]])

		symbols = append(symbols, Symbol{
			Name:     name,
			Kind:     SymbolKindStruct,
			Line:     line + 1,
			Exported: len(name) > 0 && name[0] >= 'A' && name[0] <= 'Z',
		})
	}

	// Extract interfaces
	matches = goInterfaceRegex.FindAllSubmatchIndex(content, -1)
	for i := range matches {
		m := matches[i]
		name := string(content[m[2]:m[3]])
		line := countLines(content[:m[0]])

		symbols = append(symbols, Symbol{
			Name:     name,
			Kind:     SymbolKindInterface,
			Line:     line + 1,
			Exported: len(name) > 0 && name[0] >= 'A' && name[0] <= 'Z',
		})
	}

	// Extract type aliases
	matches = goTypeRegex.FindAllSubmatchIndex(content, -1)
	for i := range matches {
		m := matches[i]
		name := string(content[m[2]:m[3]])
		line := countLines(content[:m[0]])

		// Skip if already captured as struct/interface
		found := false
		for _, s := range symbols {
			if s.Name == name && s.Line == line+1 {
				found = true
				break
			}
		}
		if !found {
			symbols = append(symbols, Symbol{
				Name:     name,
				Kind:     SymbolKindType,
				Line:     line + 1,
				Exported: len(name) > 0 && name[0] >= 'A' && name[0] <= 'Z',
			})
		}
	}

	return symbols
}

func extractGoImports(content []byte) []string {
	var imports []string

	// Single imports
	singleImports := goSingleImportRegex.FindAllSubmatch(content, -1)
	for _, m := range singleImports {
		imports = append(imports, string(m[1]))
	}

	// Block imports
	if match := goImportBlockRegex.FindSubmatch(content); match != nil {
		lines := strings.Split(string(match[1]), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "//") {
				continue
			}
			// Handle aliased imports: alias "path"
			if idx := strings.Index(line, `"`); idx >= 0 {
				endIdx := strings.LastIndex(line, `"`)
				if endIdx > idx {
					imports = append(imports, line[idx+1:endIdx])
				}
			}
		}
	}

	return imports
}

// ============================================================================
// TypeScript/JavaScript Symbol Extraction
// ============================================================================

var (
	tsFuncRegex      = regexp.MustCompile(`(?m)(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(`)
	tsArrowFuncRegex = regexp.MustCompile(`(?m)(?:export\s+)?(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_][A-Za-z0-9_]*)\s*=>`)
	tsClassRegex     = regexp.MustCompile(`(?m)(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)`)
	tsInterfaceRegex = regexp.MustCompile(`(?m)(?:export\s+)?interface\s+([A-Za-z_][A-Za-z0-9_]*)`)
	tsTypeRegex      = regexp.MustCompile(`(?m)(?:export\s+)?type\s+([A-Za-z_][A-Za-z0-9_]*)\s*=`)
	tsEnumRegex         = regexp.MustCompile(`(?m)(?:export\s+)?enum\s+([A-Za-z_][A-Za-z0-9_]*)`)
	jsImportRegex       = regexp.MustCompile(`import\s+[^"']*from\s+["']([^"']+)["']`)
	jsDynamicImportRegex = regexp.MustCompile(`import\s*\(\s*["']([^"']+)["']\s*\)`)
	jsRequireRegex      = regexp.MustCompile(`require\s*\(\s+["']([^"']+)["']\s*\)`)
	jsNamedExportRegex  = regexp.MustCompile(`export\s+(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_][A-Za-z0-9_]*)`)
)

func extractTSSymbols(content []byte) []Symbol {
	var symbols []Symbol

	// Functions
	matches := tsFuncRegex.FindAllSubmatchIndex(content, -1)
	for i := range matches {
		m := matches[i]
		name := string(content[m[2]:m[3]])
		line := countLines(content[:m[0]])
		symbols = append(symbols, Symbol{
			Name:     name,
			Kind:     SymbolKindFunction,
			Line:     line + 1,
			Exported: strings.Contains(string(content[m[0]:m[1]]), "export"),
		})
	}

	// Arrow functions
	matches = tsArrowFuncRegex.FindAllSubmatchIndex(content, -1)
	for i := range matches {
		m := matches[i]
		name := string(content[m[2]:m[3]])
		line := countLines(content[:m[0]])
		symbols = append(symbols, Symbol{
			Name:     name,
			Kind:     SymbolKindFunction,
			Line:     line + 1,
			Exported: strings.Contains(string(content[m[0]:m[1]]), "export"),
		})
	}

	// Classes
	matches = tsClassRegex.FindAllSubmatchIndex(content, -1)
	for i := range matches {
		m := matches[i]
		name := string(content[m[2]:m[3]])
		line := countLines(content[:m[0]])
		symbols = append(symbols, Symbol{
			Name:     name,
			Kind:     SymbolKindClass,
			Line:     line + 1,
			Exported: strings.Contains(string(content[m[0]:m[1]]), "export"),
		})
	}

	// Interfaces
	matches = tsInterfaceRegex.FindAllSubmatchIndex(content, -1)
	for i := range matches {
		m := matches[i]
		name := string(content[m[2]:m[3]])
		line := countLines(content[:m[0]])
		symbols = append(symbols, Symbol{
			Name:     name,
			Kind:     SymbolKindInterface,
			Line:     line + 1,
			Exported: strings.Contains(string(content[m[0]:m[1]]), "export"),
		})
	}

	// Type aliases
	matches = tsTypeRegex.FindAllSubmatchIndex(content, -1)
	for i := range matches {
		m := matches[i]
		name := string(content[m[2]:m[3]])
		line := countLines(content[:m[0]])
		symbols = append(symbols, Symbol{
			Name:     name,
			Kind:     SymbolKindType,
			Line:     line + 1,
			Exported: strings.Contains(string(content[m[0]:m[1]]), "export"),
		})
	}

	// Enums
	matches = tsEnumRegex.FindAllSubmatchIndex(content, -1)
	for i := range matches {
		m := matches[i]
		name := string(content[m[2]:m[3]])
		line := countLines(content[:m[0]])
		symbols = append(symbols, Symbol{
			Name:     name,
			Kind:     SymbolKindEnum,
			Line:     line + 1,
			Exported: strings.Contains(string(content[m[0]:m[1]]), "export"),
		})
	}

	return symbols
}

func extractJSSymbols(content []byte) []Symbol {
	return extractTSSymbols(content)
}

func extractJSImports(content []byte) []string {
	var imports []string

	// ES6 imports: import ... from "module"
	for _, m := range jsImportRegex.FindAllSubmatch(content, -1) {
		imports = append(imports, string(m[1]))
	}

	// Dynamic imports: import("module")
	for _, m := range jsDynamicImportRegex.FindAllSubmatch(content, -1) {
		imports = append(imports, string(m[1]))
	}

	// CommonJS require: require("module")
	for _, m := range jsRequireRegex.FindAllSubmatch(content, -1) {
		imports = append(imports, string(m[1]))
	}

	return imports
}

func extractJSExports(content []byte) []string {
	var exports []string

	// Named exports
	for _, m := range jsNamedExportRegex.FindAllSubmatch(content, -1) {
		exports = append(exports, string(m[1]))
	}

	return exports
}

// ============================================================================
// Python Symbol Extraction
// ============================================================================

var (
	pyFuncRegex        = regexp.MustCompile(`(?m)^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(`)
	pyAsyncFuncRegex   = regexp.MustCompile(`(?m)^async\s+def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(`)
	pyClassRegex       = regexp.MustCompile(`(?m)^class\s+([A-Za-z_][A-Za-z0-9_]*)`)
	pyImportRegex      = regexp.MustCompile(`^import\s+([A-Za-z_][A-Za-z0-9_.]*)`)
	pyFromImportRegex  = regexp.MustCompile(`^from\s+([A-Za-z_][A-Za-z0-9_.]*)\s+import`)
)

func extractPythonSymbols(content []byte) []Symbol {
	var symbols []Symbol

	// Regular functions
	matches := pyFuncRegex.FindAllSubmatchIndex(content, -1)
	for i := range matches {
		m := matches[i]
		name := string(content[m[2]:m[3]])
		line := countLines(content[:m[0]])
		symbols = append(symbols, Symbol{
			Name:     name,
			Kind:     SymbolKindFunction,
			Line:     line + 1,
			Exported: !strings.HasPrefix(name, "_"),
		})
	}

	// Async functions
	matches = pyAsyncFuncRegex.FindAllSubmatchIndex(content, -1)
	for i := range matches {
		m := matches[i]
		name := string(content[m[2]:m[3]])
		line := countLines(content[:m[0]])
		symbols = append(symbols, Symbol{
			Name:     name,
			Kind:     SymbolKindFunction,
			Line:     line + 1,
			Exported: !strings.HasPrefix(name, "_"),
		})
	}

	// Classes
	matches = pyClassRegex.FindAllSubmatchIndex(content, -1)
	for i := range matches {
		m := matches[i]
		name := string(content[m[2]:m[3]])
		line := countLines(content[:m[0]])
		symbols = append(symbols, Symbol{
			Name:     name,
			Kind:     SymbolKindClass,
			Line:     line + 1,
			Exported: !strings.HasPrefix(name, "_"),
		})
	}

	return symbols
}

func extractPythonImports(content []byte) []string {
	var imports []string

	// import X
	for _, m := range pyImportRegex.FindAllSubmatch(content, -1) {
		imports = append(imports, string(m[1]))
	}

	// from X import Y
	for _, m := range pyFromImportRegex.FindAllSubmatch(content, -1) {
		imports = append(imports, string(m[1]))
	}

	return imports
}

// ============================================================================
// Rust Symbol Extraction
// ============================================================================

var (
	rustFnRegex     = regexp.MustCompile(`(?m)(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\(`)
	rustStructRegex = regexp.MustCompile(`(?m)(?:pub\s+)?struct\s+([A-Za-z_][A-Za-z0-9_]*)`)
	rustEnumRegex   = regexp.MustCompile(`(?m)(?:pub\s+)?enum\s+([A-Za-z_][A-Za-z0-9_]*)`)
	rustTraitRegex  = regexp.MustCompile(`(?m)(?:pub\s+)?trait\s+([A-Za-z_][A-Za-z0-9_]*)`)
	rustTypeRegex   = regexp.MustCompile(`(?m)(?:pub\s+)?type\s+([A-Za-z_][A-Za-z0-9_]*)\s*=`)
	rustUseRegex    = regexp.MustCompile(`^use\s+([A-Za-z_:]+)`)
)

func extractRustSymbols(content []byte) []Symbol {
	var symbols []Symbol

	// Functions
	matches := rustFnRegex.FindAllSubmatchIndex(content, -1)
	for i := range matches {
		m := matches[i]
		name := string(content[m[2]:m[3]])
		line := countLines(content[:m[0]])
		symbols = append(symbols, Symbol{
			Name:     name,
			Kind:     SymbolKindFunction,
			Line:     line + 1,
			Exported: strings.Contains(string(content[m[0]:m[1]]), "pub"),
		})
	}

	// Structs
	matches = rustStructRegex.FindAllSubmatchIndex(content, -1)
	for i := range matches {
		m := matches[i]
		name := string(content[m[2]:m[3]])
		line := countLines(content[:m[0]])
		symbols = append(symbols, Symbol{
			Name:     name,
			Kind:     SymbolKindStruct,
			Line:     line + 1,
			Exported: strings.Contains(string(content[m[0]:m[1]]), "pub"),
		})
	}

	// Enums
	matches = rustEnumRegex.FindAllSubmatchIndex(content, -1)
	for i := range matches {
		m := matches[i]
		name := string(content[m[2]:m[3]])
		line := countLines(content[:m[0]])
		symbols = append(symbols, Symbol{
			Name:     name,
			Kind:     SymbolKindEnum,
			Line:     line + 1,
			Exported: strings.Contains(string(content[m[0]:m[1]]), "pub"),
		})
	}

	// Traits
	matches = rustTraitRegex.FindAllSubmatchIndex(content, -1)
	for i := range matches {
		m := matches[i]
		name := string(content[m[2]:m[3]])
		line := countLines(content[:m[0]])
		symbols = append(symbols, Symbol{
			Name:     name,
			Kind:     SymbolKindInterface,
			Line:     line + 1,
			Exported: strings.Contains(string(content[m[0]:m[1]]), "pub"),
		})
	}

	// Type aliases
	matches = rustTypeRegex.FindAllSubmatchIndex(content, -1)
	for i := range matches {
		m := matches[i]
		name := string(content[m[2]:m[3]])
		line := countLines(content[:m[0]])
		symbols = append(symbols, Symbol{
			Name:     name,
			Kind:     SymbolKindType,
			Line:     line + 1,
			Exported: strings.Contains(string(content[m[0]:m[1]]), "pub"),
		})
	}

	return symbols
}

func extractRustImports(content []byte) []string {
	var imports []string

	// use statements
	for _, m := range rustUseRegex.FindAllSubmatch(content, -1) {
		imports = append(imports, string(m[1]))
	}

	return imports
}

// ============================================================================
// Helper Functions
// ============================================================================

// countLines counts the number of newlines in content
func countLines(content []byte) int {
	return strings.Count(string(content), "\n")
}
