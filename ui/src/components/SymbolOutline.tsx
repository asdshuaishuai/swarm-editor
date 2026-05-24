/**
 * SymbolOutline — Collapsible tree of LSP document symbols.
 *
 * Fetches symbols via lspApi.documentSymbols, renders them as a
 * searchable, collapsible tree. Clicking a symbol dispatches
 * 'goto-line-direct' to navigate the editor.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { lspApi } from '../services/lspApi'
import { Search, X, ChevronRight, ChevronDown } from 'lucide-react'
import { logger } from '../utils'

interface SymbolInfo {
  name: string
  kind: number
  range: { startLine: number; startChar: number; endLine: number; endChar: number }
  children?: SymbolInfo[]
  containerName?: string
}

// LSP SymbolKind → badge letter + color
const KIND_BADGE: Record<number, { letter: string; color: string }> = {
  5:  { letter: 'C', color: '#58a6ff' },  // Class — blue
  6:  { letter: 'M', color: '#c084fc' },  // Method — purple
  9:  { letter: 'M', color: '#c084fc' },  // Constructor
  12: { letter: 'F', color: '#fbbf24' },  // Function — yellow
  11: { letter: 'I', color: '#22d3ee' },  // Interface — cyan
  13: { letter: 'V', color: '#58a6ff' },  // Variable — blue
  14: { letter: 'K', color: '#f97316' },  // Constant — orange
  10: { letter: 'E', color: '#4ade80' },  // Enum — green
  22: { letter: 'E', color: '#4ade80' },  // EnumMember
  23: { letter: 'S', color: '#58a6ff' },  // Struct — blue
  2:  { letter: 'M', color: '#6b7280' },  // Module
  3:  { letter: 'N', color: '#6b7280' },  // Namespace
  24: { letter: 'E', color: '#f87171' },  // Event
  8:  { letter: 'P', color: '#58a6ff' },  // Field
  7:  { letter: 'P', color: '#58a6ff' },  // Property
  25: { letter: 'T', color: '#f472b6' },  // TypeParameter
}

function getBadge(kind: number) {
  return KIND_BADGE[kind] ?? { letter: 'S', color: '#8b949e' }
}

interface LSPSymbol {
  name?: string
  kind?: number
  range?: { start?: { line?: number; character?: number }; end?: { line?: number; character?: number } }
  selectionRange?: { start?: { line?: number; character?: number } }
  children?: LSPSymbol[]
  containerName?: string
}

// Flatten LSP response into SymbolInfo[]
function normalizeSymbols(raw: LSPSymbol[]): SymbolInfo[] {
  return raw.map((s) => ({
    name: s.name || '',
    kind: s.kind ?? 0,
    range: {
      startLine: s.range?.start?.line ?? s.selectionRange?.start?.line ?? 0,
      startChar: s.range?.start?.character ?? 0,
      endLine: s.range?.end?.line ?? 0,
      endChar: s.range?.end?.character ?? 0,
    },
    children: s.children?.length ? normalizeSymbols(s.children) : undefined,
    containerName: s.containerName,
  }))
}

// Filter symbols recursively by search query
function filterSymbols(symbols: SymbolInfo[], query: string): SymbolInfo[] {
  const q = query.toLowerCase()
  return symbols.reduce<SymbolInfo[]>((acc, sym) => {
    const nameMatch = sym.name.toLowerCase().includes(q)
    const filteredChildren = sym.children ? filterSymbols(sym.children, q) : []
    if (nameMatch || filteredChildren.length > 0) {
      acc.push({ ...sym, children: nameMatch ? sym.children : filteredChildren })
    }
    return acc
  }, [])
}

interface SymbolNodeProps {
  symbol: SymbolInfo
  depth: number
  onGoto: (line: number) => void
}

function SymbolNode({ symbol, depth, onGoto }: SymbolNodeProps) {
  const [collapsed, setCollapsed] = useState(false)
  const hasChildren = symbol.children && symbol.children.length > 0
  const badge = getBadge(symbol.kind)

  return (
    <div>
      <div
        className="flex items-center gap-1 py-0.5 px-1 rounded cursor-pointer hover:bg-[#21262d] transition-colors"
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => onGoto(symbol.range.startLine + 1)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed) }}
            className="p-0 bg-transparent border-none cursor-pointer"
            style={{ color: '#6b7280' }}
          >
            {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
        ) : (
          <span style={{ width: 12, display: 'inline-block' }} />
        )}
        <span
          className="text-[10px] font-bold font-mono rounded px-1 shrink-0"
          style={{ color: badge.color, background: `${badge.color}18`, border: `1px solid ${badge.color}30` }}
        >
          {badge.letter}
        </span>
        <span className="text-xs truncate" style={{ color: '#d1d5db' }}>{symbol.name}</span>
        <span className="text-[10px] ml-auto shrink-0" style={{ color: '#8b949e' }}>
          {symbol.range.startLine + 1}
        </span>
      </div>
      {hasChildren && !collapsed && symbol.children!.map((child, i) => (
        <SymbolNode key={`${child.name}-${i}`} symbol={child} depth={depth + 1} onGoto={onGoto} />
      ))}
    </div>
  )
}

export default function SymbolOutline() {
  const currentFile = useWorkspaceStore(s => s.currentFile)
  const [symbols, setSymbols] = useState<SymbolInfo[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchSymbols = useCallback(async (file: string) => {
    setLoading(true)
    try {
      const result = await lspApi.documentSymbols(file)
      setSymbols(normalizeSymbols(result.symbols || []))
    } catch {
      logger.debug('SymbolOutline', 'Failed to fetch symbols')
      setSymbols([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-refresh when file changes (debounce 1s)
  useEffect(() => {
    if (!currentFile) { setSymbols([]); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSymbols(currentFile), 1000)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [currentFile, fetchSymbols])

  const handleGoto = useCallback((line: number) => {
    document.dispatchEvent(new CustomEvent('goto-line-direct', { detail: { line } }))
  }, [])

  const filtered = filter ? filterSymbols(symbols, filter) : symbols

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider shrink-0" style={{ color: '#6b7280' }}>
        <span>Document Symbols</span>
        <span className="text-[9px]" style={{ color: '#8b949e' }}>{symbols.length}</span>
      </div>

      {/* Search */}
      {symbols.length > 0 && (
        <div className="px-2 pb-1 shrink-0">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px]" style={{ background: '#0d1117', color: '#6b7280' }}>
            <Search size={12} />
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter symbols..."
              className="flex-1 bg-transparent text-xs outline-none"
              style={{ color: '#d1d5db' }}
            />
            {filter && (
              <button onClick={() => setFilter('')} style={{ color: '#6b7280' }} className="hover:text-white">
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto px-1">
        {loading && symbols.length === 0 ? (
          <div className="text-xs p-2" style={{ color: '#6b7280' }}>Loading symbols...</div>
        ) : !currentFile ? (
          <div className="text-xs p-2" style={{ color: '#8b949e' }}>Open a file to see symbols</div>
        ) : filtered.length === 0 ? (
          <div className="text-xs p-2" style={{ color: '#8b949e' }}>{symbols.length === 0 ? 'No symbols found' : 'No matching symbols'}</div>
        ) : (
          filtered.map((sym, i) => (
            <SymbolNode key={`${sym.name}-${i}`} symbol={sym} depth={0} onGoto={handleGoto} />
          ))
        )}
      </div>
    </div>
  )
}
