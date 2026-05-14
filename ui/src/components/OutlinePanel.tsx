import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ChevronRight, ChevronDown, Box, Code, Type, List, FileCode,
  Layers, Hexagon, Braces, Zap, Search, ChevronsDownUp
} from 'lucide-react'
import { lspApi } from '../services/lspApi'

// LSP SymbolKind enum (subset we care about)
const SymbolKind = {
  File: 1,
  Module: 2,
  Namespace: 3,
  Package: 4,
  Class: 5,
  Method: 6,
  Property: 7,
  Field: 8,
  Constructor: 9,
  Enum: 10,
  Interface: 11,
  Function: 12,
  Variable: 13,
  Constant: 14,
  String: 15,
  Number: 16,
  Boolean: 17,
  Array: 18,
  Object: 19,
  Key: 20,
  Null: 21,
  EnumMember: 22,
  Struct: 23,
  Event: 24,
  Operator: 25,
  TypeParameter: 26,
}

interface DocumentSymbol {
  name: string
  detail?: string
  kind: number
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
  selectionRange: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
  children?: DocumentSymbol[]
}

interface OutlinePanelProps {
  filePath: string | null
  onSymbolClick: (_line: number, _column: number) => void
}

// Get icon for symbol kind
function getSymbolIcon(kind: number): React.ReactNode {
  switch (kind) {
    case SymbolKind.Class:
      return <Hexagon size={14} className="text-amber-400" />
    case SymbolKind.Interface:
      return <Layers size={14} className="text-cyan-400" />
    case SymbolKind.Method:
    case SymbolKind.Function:
    case SymbolKind.Constructor:
      return <Code size={14} className="text-purple-400" />
    case SymbolKind.Property:
    case SymbolKind.Field:
      return <Braces size={14} className="text-blue-400" />
    case SymbolKind.Variable:
      return <Type size={14} className="text-blue-300" />
    case SymbolKind.Constant:
      return <Zap size={14} className="text-green-400" />
    case SymbolKind.Enum:
      return <List size={14} className="text-orange-400" />
    case SymbolKind.EnumMember:
      return <List size={14} className="text-orange-300" />
    case SymbolKind.Struct:
      return <Box size={14} className="text-teal-400" />
    case SymbolKind.Module:
    case SymbolKind.Namespace:
    case SymbolKind.Package:
      return <Layers size={14} className="text-yellow-400" />
    case SymbolKind.Event:
      return <Zap size={14} className="text-red-400" />
    case SymbolKind.TypeParameter:
      return <Type size={14} className="text-pink-400" />
    default:
      return <FileCode size={14} className="text-text-tertiary" />
  }
}

// Get kind name for tooltip
function getKindName(kind: number): string {
  const names: Record<number, string> = {
    [SymbolKind.Class]: 'Class',
    [SymbolKind.Interface]: 'Interface',
    [SymbolKind.Method]: 'Method',
    [SymbolKind.Function]: 'Function',
    [SymbolKind.Constructor]: 'Constructor',
    [SymbolKind.Property]: 'Property',
    [SymbolKind.Field]: 'Field',
    [SymbolKind.Variable]: 'Variable',
    [SymbolKind.Constant]: 'Constant',
    [SymbolKind.Enum]: 'Enum',
    [SymbolKind.EnumMember]: 'Enum Member',
    [SymbolKind.Struct]: 'Struct',
    [SymbolKind.Module]: 'Module',
    [SymbolKind.Namespace]: 'Namespace',
    [SymbolKind.Package]: 'Package',
    [SymbolKind.Event]: 'Event',
    [SymbolKind.TypeParameter]: 'Type Parameter',
  }
  return names[kind] || 'Symbol'
}

// Symbol tree node component with ARIA accessibility (R5084)
function SymbolNode({
  symbol,
  depth,
  onSymbolClick,
  expandedSymbols,
  toggleSymbol
}: {
  symbol: DocumentSymbol
  depth: number
  onSymbolClick: (_line: number, _column: number) => void
  expandedSymbols: Set<string>
  toggleSymbol: (_id: string) => void
}) {
  const hasChildren = symbol.children && symbol.children.length > 0
  const symbolId = `${symbol.name}-${depth}-${symbol.range.start.line}`
  const isExpanded = expandedSymbols.has(symbolId)

  const handleClick = () => {
    onSymbolClick(symbol.selectionRange.start.line, symbol.selectionRange.start.character)
  }

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleSymbol(symbolId)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    } else if (e.key === 'ArrowRight' && hasChildren && !isExpanded) {
      e.preventDefault()
      toggleSymbol(symbolId)
    } else if (e.key === 'ArrowLeft' && isExpanded) {
      e.preventDefault()
      toggleSymbol(symbolId)
    }
  }

  return (
    <div role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined}>
      <div
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="flex items-center gap-1 px-1 py-0.5 rounded cursor-pointer hover:bg-card-hover group transition-colors outline-none focus:bg-accent/20 focus:ring-1 focus:ring-accent"
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={handleClick}
        aria-label={`${getKindName(symbol.kind)} ${symbol.name}`}
      >
        {hasChildren ? (
          <button
            onClick={handleToggle}
            tabIndex={-1}
            className="p-0 hover:bg-card-hover rounded transition-colors"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ChevronDown size={12} className="text-text-tertiary" />
            ) : (
              <ChevronRight size={12} className="text-text-tertiary" />
            )}
          </button>
        ) : (
          <span className="w-3" aria-hidden="true" />
        )}
        <span className="flex-shrink-0" title={getKindName(symbol.kind)}>
          {getSymbolIcon(symbol.kind)}
        </span>
        <span className="text-xs text-text-primary truncate flex-1 ml-1" title={symbol.name}>
          {symbol.name}
        </span>
        {symbol.detail && (
          <span className="text-[10px] text-text-tertiary truncate max-w-[100px]" title={symbol.detail}>
            {symbol.detail}
          </span>
        )}
      </div>
      {hasChildren && isExpanded && (
        <div role="group">
          {symbol.children!.map((child, index) => (
            <SymbolNode
              key={`${child.name}-${index}`}
              symbol={child}
              depth={depth + 1}
              onSymbolClick={onSymbolClick}
              expandedSymbols={expandedSymbols}
              toggleSymbol={toggleSymbol}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function OutlinePanel({ filePath, onSymbolClick }: OutlinePanelProps) {
  const [symbols, setSymbols] = useState<DocumentSymbol[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedSymbols, setExpandedSymbols] = useState<Set<string>>(new Set())
  const [filterText, setFilterText] = useState('')

  // Reset filter when file changes
  useEffect(() => {
    setFilterText('')
  }, [filePath])

  useEffect(() => {
    if (!filePath) {
      setSymbols([])
      return
    }

    const fetchSymbols = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await lspApi.documentSymbols(filePath)
        setSymbols(result.symbols || [])
        // Auto-expand first level
        const firstLevelIds = new Set<string>()
        ;(result.symbols || []).forEach((s: DocumentSymbol) => {
          firstLevelIds.add(`${s.name}-0-${s.range.start.line}`)
        })
        setExpandedSymbols(firstLevelIds)
      } catch {
        setError('Failed to load symbols')
        setSymbols([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchSymbols()
  }, [filePath])

  const toggleSymbol = (id: string) => {
    setExpandedSymbols(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Count total symbols
  const symbolCount = useMemo(() => {
    const count = (syms: DocumentSymbol[]): number => {
      return syms.reduce((acc, s) => acc + 1 + (s.children ? count(s.children) : 0), 0)
    }
    return count(symbols)
  }, [symbols])

  // Filter symbols by text (R5085)
  const filteredSymbols = useMemo(() => {
    if (!filterText.trim()) return symbols

    const lowerFilter = filterText.toLowerCase()

    const filterSymbols = (syms: DocumentSymbol[]): DocumentSymbol[] => {
      return syms.reduce<DocumentSymbol[]>((acc, sym) => {
        const nameMatches = sym.name.toLowerCase().includes(lowerFilter)
        const filteredChildren = sym.children ? filterSymbols(sym.children) : []

        if (nameMatches || filteredChildren.length > 0) {
          acc.push({
            ...sym,
            children: filteredChildren.length > 0 ? filteredChildren : sym.children
          })
        }
        return acc
      }, [])
    }

    return filterSymbols(symbols)
  }, [symbols, filterText])

  // Collapse all symbols (R5085)
  const collapseAll = useCallback(() => {
    setExpandedSymbols(new Set())
  }, [])

  if (!filePath) {
    return (
      <div className="flex flex-col h-full">
        <div className="panel-header flex items-center justify-between shrink-0">
          <span>Outline</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-text-tertiary text-xs p-4">
          No file open
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="panel-header flex items-center justify-between shrink-0">
        <span>Outline</span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-tertiary mr-1">
            {symbolCount} symbols
          </span>
          <button
            onClick={collapseAll}
            className="p-1 hover:bg-card-hover rounded transition-colors"
            title="Collapse All"
            aria-label="Collapse all symbols"
          >
            <ChevronsDownUp size={12} className="text-text-tertiary" />
          </button>
        </div>
      </div>
      {/* Filter input (R5085) */}
      <div className="px-2 py-1 border-b border-border shrink-0">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter symbols..."
            className="w-full bg-input border border-border rounded text-xs px-6 py-1 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
            aria-label="Filter symbols"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1" role="tree" aria-label="Document symbols">
        {isLoading ? (
          <div className="flex items-center justify-center p-4 text-text-tertiary text-xs" aria-live="polite">
            <div className="animate-spin w-4 h-4 border-2 border-accent border-t-transparent rounded-full mr-2" />
            Loading...
          </div>
        ) : error ? (
          <div className="text-center text-error text-xs p-4" role="alert">
            {error}
          </div>
        ) : filteredSymbols.length === 0 ? (
          <div className="text-center text-text-tertiary text-xs p-4" aria-live="polite">
            {filterText ? 'No symbols match filter' : 'No symbols found'}
          </div>
        ) : (
          filteredSymbols.map((symbol, index) => (
            <SymbolNode
              key={`${symbol.name}-${index}`}
              symbol={symbol}
              depth={0}
              onSymbolClick={onSymbolClick}
              expandedSymbols={expandedSymbols}
              toggleSymbol={toggleSymbol}
            />
          ))
        )}
      </div>
    </div>
  )
}
