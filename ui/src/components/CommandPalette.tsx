import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Search,
  Code,
  Type,
  List,
  Braces,
  Command,
  Hexagon,
  Layers,
  Zap,
  Box,
} from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { getFileIcon, getFileIconColor, logger } from '../utils'
import { lspApi } from '../services/lspApi'
import { useCommandActions } from './CommandPaletteCommands'

interface PaletteItem {
  id: string
  label: React.ReactNode
  description?: React.ReactNode
  icon: React.ReactNode
  shortcut?: string
  action: () => void
  isFile?: boolean
  filePath?: string
}

function flattenFileTree(entries: import('../stores/workspaceStore').FileEntry[]): Array<{ name: string; path: string }> {
  const result: Array<{ name: string; path: string }> = []
  for (const entry of entries) {
    if (entry.isDirectory && entry.children) {
      result.push(...flattenFileTree(entry.children))
    } else if (!entry.isDirectory) {
      result.push({ name: entry.name, path: entry.path })
    }
  }
  return result
}

function fuzzyScore(query: string, text: string): number {
  const lowerQuery = query.toLowerCase()
  const lowerText = text.toLowerCase()
  let qi = 0
  let score = 0
  let lastMatchIdx = -1
  for (let ti = 0; ti < lowerText.length && qi < lowerQuery.length; ti++) {
    if (lowerText[ti] === lowerQuery[qi]) {
      score += ti === lastMatchIdx + 1 ? 2 : 1
      if (ti === 0 || lowerText[ti - 1] === ' ' || lowerText[ti - 1] === '-' || lowerText[ti - 1] === '_') score += 3
      lastMatchIdx = ti
      qi++
    }
  }
  return qi === lowerQuery.length ? score : -1
}

// Get matched character indices for highlighting (VS Code pattern)
function getFuzzyMatchIndices(query: string, text: string): number[] {
  const lowerQuery = query.toLowerCase()
  const lowerText = text.toLowerCase()
  const indices: number[] = []
  let qi = 0
  for (let ti = 0; ti < lowerText.length && qi < lowerQuery.length; ti++) {
    if (lowerText[ti] === lowerQuery[qi]) {
      indices.push(ti)
      qi++
    }
  }
  return indices
}

// Render text with highlighted fuzzy matches
function highlightFuzzyMatch(text: string, indices: number[]): React.ReactNode {
  if (indices.length === 0) return text
  const result: React.ReactNode[] = []
  let lastIdx = 0
  for (const idx of indices) {
    if (idx > lastIdx) {
      result.push(<span key={`text-${lastIdx}`}>{text.slice(lastIdx, idx)}</span>)
    }
    result.push(<span key={`match-${idx}`} className="text-accent font-semibold">{text[idx]}</span>)
    lastIdx = idx + 1
  }
  if (lastIdx < text.length) {
    result.push(<span key={`text-${lastIdx}`}>{text.slice(lastIdx)}</span>)
  }
  return result
}

// Symbol kind icons (LSP SymbolKind enum)
const SymbolKindIcons: Record<number, { icon: typeof Code; color: string }> = {
  5: { icon: Hexagon, color: 'text-amber-400' },       // Class
  11: { icon: Layers, color: 'text-cyan-400' },       // Interface
  6: { icon: Code, color: 'text-purple-400' },        // Method
  12: { icon: Code, color: 'text-purple-400' },       // Function
  9: { icon: Code, color: 'text-purple-400' },        // Constructor
  7: { icon: Braces, color: 'text-blue-400' },        // Property
  8: { icon: Braces, color: 'text-blue-400' },        // Field
  13: { icon: Type, color: 'text-blue-300' },         // Variable
  14: { icon: Zap, color: 'text-green-400' },         // Constant
  10: { icon: List, color: 'text-orange-400' },       // Enum
  22: { icon: List, color: 'text-orange-300' },       // EnumMember
  23: { icon: Box, color: 'text-teal-400' },          // Struct
  2: { icon: Layers, color: 'text-yellow-400' },      // Module
  3: { icon: Layers, color: 'text-yellow-400' },      // Namespace
  4: { icon: Layers, color: 'text-yellow-400' },      // Package
  24: { icon: Zap, color: 'text-red-400' },           // Event
  26: { icon: Type, color: 'text-pink-400' },         // TypeParameter
}
function getSymbolIcon(kind: number): React.ReactNode {
  const entry = SymbolKindIcons[kind]
  if (!entry) return <Braces size={16} className="text-text-tertiary" />
  const Icon = entry.icon
  return <Icon size={16} className={entry.color} />
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isQuickOpen, setIsQuickOpen] = useState(false)
  const prevFilteredLengthRef = useRef(0)

  const openSymbolMode = useCallback(() => { setIsOpen(true); setIsQuickOpen(true); setQuery('@') }, [])
  const openWorkspaceSymbolMode = useCallback(() => { setIsOpen(true); setIsQuickOpen(true); setQuery('#') }, [])
  const commands = useCommandActions(openSymbolMode, openWorkspaceSymbolMode)

  // Derive mode from query
  const isCommandMode = query.startsWith('>')
  const commandQuery = isCommandMode ? query.slice(1) : ''
  // Reserved prefixes in Quick Open: > commands, @ file symbols, # workspace symbols, : goto line
  const isGoToLine = isQuickOpen && query.startsWith(':') && query.length > 1
  const isSymbolMode = isQuickOpen && query.startsWith('@')
  const isWorkspaceSymbolMode = isQuickOpen && query.startsWith('#')
  const hasReservedPrefix = isSymbolMode || isWorkspaceSymbolMode || query.startsWith(':')
  const isFileMode = isQuickOpen && !isCommandMode && !hasReservedPrefix

  // Filter files from workspace for Quick Open (Ctrl+P)
  const fileTree = useWorkspaceStore((s) => s.fileTree)
  const openFile = useWorkspaceStore((s) => s.openFile)
  const mruOrder = useWorkspaceStore((s) => s.mruOrder)
  const workspacePath = useWorkspaceStore((s) => s.workspacePath)

  // Cache flattened file list — only recompute when fileTree changes
  const allFiles = useMemo(() => flattenFileTree(fileTree), [fileTree])

  const filteredFiles = useMemo(() => {
    // In file mode with no query: show MRU (recently opened files) — VS Code pattern
    if (isFileMode && query.length === 0) {
      return mruOrder.slice(0, 15).map(path => {
        const name = path.split('/').pop() || path
        return { name, path, score: 0, nameIndices: [], pathIndices: [] }
      })
    }
    // In file mode with query: fuzzy search all files
    if (isFileMode) {
      return allFiles
        .map((f) => {
          const nameScore = fuzzyScore(query, f.name)
          const pathScore = fuzzyScore(query, f.path)
          const useName = nameScore >= pathScore
          return {
            ...f,
            score: Math.max(nameScore, pathScore),
            nameIndices: useName ? getFuzzyMatchIndices(query, f.name) : [],
            pathIndices: useName ? getFuzzyMatchIndices(query, f.path) : getFuzzyMatchIndices(query, f.path),
          }
        })
        .filter((f) => f.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 50)
    }
    return []
  }, [isFileMode, query, allFiles, mruOrder])

  // Go to Symbol (@ prefix) — fetch LSP document symbols for current file
  const currentFile = useWorkspaceStore((s) => s.currentFile)
  const [docSymbols, setDocSymbols] = useState<Array<{ name: string; kind: number; detail?: string; line: number; column: number }>>([])
  const [symbolsLoading, setSymbolsLoading] = useState(false)

  // Fetch symbols when in symbol mode - this is a legitimate data-fetching effect
  useEffect(() => {
    // Reset state when leaving symbol mode or changing file
    // This is intentional: we clear cached symbols when the mode/file changes
    if (!isSymbolMode || !currentFile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDocSymbols([])
      setSymbolsLoading(false)
      return
    }
    let cancelled = false
    setSymbolsLoading(true)
    lspApi.documentSymbols(currentFile).then(result => {
      if (cancelled) return
      // Flatten nested children into a flat list
      const flat: typeof docSymbols = []
      const walk = (symbols: unknown[], depth: number) => {
        for (const s of symbols) {
          const sym = s as { name: string; kind: number; detail?: string; range?: { start?: { line?: number; character?: number } }; children?: unknown[] }
          flat.push({ name: sym.name, kind: sym.kind, detail: sym.detail, line: sym.range?.start?.line ?? 0, column: sym.range?.start?.character ?? 0 })
          if (sym.children) walk(sym.children, depth + 1)
        }
      }
      walk(result.symbols || [], 0)
      setDocSymbols(flat)
      setSymbolsLoading(false)
    }).catch(() => {
      if (!cancelled) { setDocSymbols([]); setSymbolsLoading(false) }
      logger.debug('CommandPalette', 'document symbols failed')
    })
    return () => { cancelled = true }
  }, [isSymbolMode, currentFile])

  const filteredSymbols = useMemo(() => {
    if (!isSymbolMode) return []
    const search = query.slice(1).trim()
    if (!search) return docSymbols.slice(0, 30)
    return docSymbols
      .map(s => ({ ...s, score: fuzzyScore(search, s.name) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
  }, [isSymbolMode, query, docSymbols])

  // Go to Symbol in Workspace (# prefix) — search LSP workspace symbols
  const [workspaceSymbols, setWorkspaceSymbols] = useState<Array<{ name: string; kind: number; detail?: string; uri: string; line: number; column: number }>>([])
  const [workspaceSymbolsLoading, setWorkspaceSymbolsLoading] = useState(false)

  useEffect(() => {
    // Reset state when leaving workspace symbol mode - intentional state sync
    if (!isWorkspaceSymbolMode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWorkspaceSymbols([])
      setWorkspaceSymbolsLoading(false)
      return
    }
    const search = query.slice(1).trim()
    if (!search) {
      setWorkspaceSymbols([])
      return
    }
    let cancelled = false
    setWorkspaceSymbolsLoading(true)
    lspApi.workspaceSymbols(search).then(result => {
      if (cancelled) return
      const symbols = (result.symbols || []).map((s: { name: string; kind: number; detail?: string; location?: { uri: string; range?: { start?: { line?: number; character?: number } } } }) => ({
        name: s.name,
        kind: s.kind,
        detail: s.detail,
        uri: s.location?.uri || '',
        line: s.location?.range?.start?.line ?? 0,
        column: s.location?.range?.start?.character ?? 0,
      }))
      setWorkspaceSymbols(symbols.slice(0, 50))
      setWorkspaceSymbolsLoading(false)
    }).catch(() => {
      if (!cancelled) { setWorkspaceSymbols([]); setWorkspaceSymbolsLoading(false) }
      logger.debug('CommandPalette', 'workspace symbols failed')
    })
    return () => { cancelled = true }
  }, [isWorkspaceSymbolMode, query])

  const filteredWorkspaceSymbols = useMemo(() => {
    if (!isWorkspaceSymbolMode) return []
    // Already filtered by LSP query, just apply fuzzy scoring for ordering
    const search = query.slice(1).trim()
    return workspaceSymbols
      .map(s => ({ ...s, score: fuzzyScore(search, s.name) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
  }, [isWorkspaceSymbolMode, query, workspaceSymbols])

  // Filter commands based on query with fuzzy scoring
  const filteredCommands = useMemo(() => {
    if (!query) return commands
    if (isFileMode) return []
    const searchQuery = isCommandMode ? commandQuery : query
    if (!searchQuery) return commands
    return commands
      .map((cmd) => {
        const score = fuzzyScore(searchQuery, cmd.label)
        const descScore = cmd.description ? fuzzyScore(searchQuery, cmd.description) : -1
        return { cmd, score: Math.max(score, descScore) }
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.cmd)
  }, [commands, query, isCommandMode, commandQuery, isFileMode])

  // Unified items for rendering
  const filteredItems: PaletteItem[] = useMemo(() => {
    if (isFileMode) {
      const prefix = workspacePath ? workspacePath.replace(/\/$/, '') + '/' : ''
      return filteredFiles.map((f) => {
        const Icon = getFileIcon(f.name)
        const iconColor = getFileIconColor(f.name)
        const relativePath = prefix && f.path.startsWith(prefix) ? f.path.slice(prefix.length) : f.path
        return {
          id: f.path,
          label: highlightFuzzyMatch(f.name, f.nameIndices),
          description: highlightFuzzyMatch(relativePath, f.pathIndices),
          icon: <Icon size={16} className={iconColor} />,
          action: () => { openFile(f.path).catch((e) => { logger.warn('CommandPalette', `Failed to open ${f.path}`, e) }) },
          isFile: true,
          filePath: f.path,
        }
      })
    }
    if (isSymbolMode) {
      return filteredSymbols.map((s, i) => ({
        id: `symbol-${i}`,
        label: s.name,
        description: s.detail || `Line ${s.line + 1}`,
        icon: getSymbolIcon(s.kind),
        action: () => {
          if (currentFile) {
            document.dispatchEvent(new CustomEvent('goto-line-direct', { detail: { line: s.line + 1 } }))
          }
        },
      }))
    }
    if (isWorkspaceSymbolMode) {
      return filteredWorkspaceSymbols.map((s, i) => ({
        id: `ws-symbol-${i}`,
        label: s.name,
        description: s.uri ? `${decodeURIComponent(s.uri.replace(/^file:\/\//, '').split('/').pop() || '')} — Line ${s.line + 1}` : `Line ${s.line + 1}`,
        icon: getSymbolIcon(s.kind),
        action: () => {
          if (s.uri) {
            // Convert file:// URI to path
            const filePath = s.uri.replace(/^file:\/\//, '')
            openFile(decodeURIComponent(filePath)).catch((e) => { logger.warn('CommandPalette', `Failed to open symbol file`, e) })
            setTimeout(() => {
              document.dispatchEvent(new CustomEvent('goto-line-direct', { detail: { line: s.line + 1 } }))
            }, 100)
          }
        },
      }))
    }
    return filteredCommands
  }, [isFileMode, isSymbolMode, isWorkspaceSymbolMode, filteredFiles, filteredSymbols, filteredWorkspaceSymbols, filteredCommands, openFile, workspacePath, currentFile])

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Toggle command palette (Ctrl+Shift+P)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault()
        setIsOpen((prev) => {
          if (prev) {
            // If already open in Quick Open mode, switch to command mode
            if (isQuickOpen) {
              setIsQuickOpen(false)
              setQuery('')
              return true
            }
            return false
          }
          setIsQuickOpen(false)
          return true
        })
        setQuery('')
        return
      }

      // Quick Open (Ctrl+P)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'p') {
        e.preventDefault()
        setIsOpen((prev) => {
          if (prev) {
            // If already open in Quick Open mode, close it — VS Code pattern
            if (isQuickOpen) {
              setQuery('')
              setIsQuickOpen(false)
              return false
            }
            // If open in command mode, switch to Quick Open
            setIsQuickOpen(true)
            setQuery('')
            return true
          }
          setIsQuickOpen(true)
          return true
        })
        setQuery('')
        return
      }

      if (!isOpen) return

      // Navigate results
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) =>
          prev < filteredItems.length - 1 ? prev + 1 : 0
        )
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredItems.length - 1
        )
      } else if (e.key === 'Enter') {
        e.preventDefault()
        // Go to Line via :NNN in Quick Open — VS Code pattern (direct jump, not widget)
        if (isGoToLine) {
          const lineNum = parseInt(query.slice(1), 10)
          if (!isNaN(lineNum) && lineNum > 0) {
            document.dispatchEvent(new CustomEvent('goto-line-direct', { detail: { line: lineNum } }))
            setIsOpen(false)
            setQuery('')
            setIsQuickOpen(false)
          }
          return
        }
        const selected = filteredItems[selectedIndex]
        if (selected) {
          selected.action()
          setIsOpen(false)
          setQuery('')
          setIsQuickOpen(false)
        }
      } else if (e.key === 'Escape') {
        setIsOpen(false)
        setQuery('')
        setIsQuickOpen(false)
      }
    },
    [isOpen, filteredItems, selectedIndex, isQuickOpen, isGoToLine, query]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Listen for open-goto-line from App.tsx (Ctrl+G) and StatusBar click
  useEffect(() => {
    const handleOpenGoToLine = () => {
      setIsOpen(true)
      setIsQuickOpen(true)
      setQuery(':')
    }
    window.addEventListener('open-goto-line', handleOpenGoToLine)
    return () => window.removeEventListener('open-goto-line', handleOpenGoToLine)
  }, [])

  // R5183: Listen for open-quick-open from go-to-file command
  useEffect(() => {
    const handleOpenQuickOpen = () => {
      setIsOpen(true)
      setIsQuickOpen(true)
      setQuery('')
    }
    window.addEventListener('open-quick-open', handleOpenQuickOpen)
    return () => window.removeEventListener('open-quick-open', handleOpenQuickOpen)
  }, [])

  // Reset selection when filtered results change
  useEffect(() => {
    if (prevFilteredLengthRef.current !== filteredItems.length) {
      prevFilteredLengthRef.current = filteredItems.length
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIndex(0)
    }
  }, [filteredItems.length])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh] z-[100]"
      onClick={() => {
        setIsOpen(false)
        setQuery('')
        setIsQuickOpen(false)
      }}
      role="presentation"
    >
      <div
        className="bg-mac-panel/95 border border-glass-border rounded-mac-xl w-[560px] shadow-mac backdrop-blur-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-glass-border">
          <Search size={20} className="text-text-tertiary" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              isCommandMode ? 'Type a command...' :
              isSymbolMode ? 'Go to Symbol in File (@symbol)...' :
              isWorkspaceSymbolMode ? 'Go to Symbol in Workspace (#symbol)...' :
              isGoToLine ? 'Go to Line (:number)...' :
              isQuickOpen ? 'Go to File...' : 'Type a command or search...'
            }
            className="flex-1 bg-transparent text-text-primary placeholder-text-tertiary outline-none text-base"
            aria-label={isSymbolMode ? 'Search file symbols' : isWorkspaceSymbolMode ? 'Search workspace symbols' : isFileMode ? 'Search files' : 'Search commands'}
            autoFocus
          />
          <kbd className="px-2 py-0.5 bg-surface rounded text-xs text-text-secondary font-mono">
            ESC
          </kbd>
        </div>

        {/* Command List */}
        <div className="max-h-[400px] overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-text-tertiary">
              {isGoToLine ? (
                <>
                  <p className="text-sm">Go to Line {query.slice(1)}</p>
                  <p className="text-xs mt-1">Press Enter to jump</p>
                </>
              ) : isSymbolMode ? (
                <>
                  <p className="text-sm">{symbolsLoading ? 'Loading symbols...' : !currentFile ? 'Open a file first' : 'No symbols found'}</p>
                  {!currentFile && <p className="text-xs mt-1">Symbols are available for the active file</p>}
                </>
              ) : isWorkspaceSymbolMode ? (
                <>
                  <p className="text-sm">{workspaceSymbolsLoading ? 'Searching workspace symbols...' : query.length <= 1 ? 'Type to search workspace symbols' : 'No symbols found'}</p>
                  <p className="text-xs mt-1">Search across all files in the workspace</p>
                </>
              ) : (
                <>
                  <Search size={32} className="mx-auto mb-2 opacity-50" />
                  <p>
                    {isFileMode ? 'No matching files' :
                     query.startsWith(':') ? 'Type a line number after :' :
                     'No commands found'}
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              {isFileMode && query.length === 0 && filteredItems.length > 0 && (
                <div className="px-4 py-1.5 text-xs text-text-tertiary font-medium uppercase tracking-wider">
                  recently opened
                </div>
              )}
              {filteredItems.map((item, index) => (
              <div
                key={item.id}
                onClick={() => {
                  item.action()
                  setIsOpen(false)
                  setQuery('')
                  setIsQuickOpen(false)
                }}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                  index === selectedIndex
                    ? 'bg-accent/20 border-l-2 border-accent'
                    : 'hover:bg-card-hover border-l-2 border-transparent'
                }`}
              >
                <div className={`p-1.5 rounded-mac ${item.isFile ? '' : 'bg-surface'}`}>{item.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">{item.label}</p>
                  {item.description && (
                    <p className="text-xs text-text-secondary truncate">{item.description}</p>
                  )}
                </div>
                {item.shortcut && (
                  <kbd className="px-2 py-0.5 bg-surface rounded text-xs text-text-secondary font-mono">
                    {item.shortcut}
                  </kbd>
                )}
              </div>
            ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-glass-border bg-surface/50 text-xs text-text-tertiary">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1 bg-mac-sidebar rounded">↑↓</kbd> Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 bg-mac-sidebar rounded">↵</kbd> Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 bg-mac-sidebar rounded">Esc</kbd> Close
            </span>
            {!isCommandMode && (
              <span className="flex items-center gap-1">
                <kbd className="px-1 bg-mac-sidebar rounded">&gt;</kbd> Commands
              </span>
            )}
          </div>
          <span className="flex items-center gap-1">
            <Command size={12} />
            <kbd className="px-1 bg-mac-sidebar rounded">⇧</kbd>
            <kbd className="px-1 bg-mac-sidebar rounded">P</kbd>
            {isQuickOpen ? 'Commands' : 'Toggle'}
          </span>
        </div>
      </div>
    </div>
  )
}
