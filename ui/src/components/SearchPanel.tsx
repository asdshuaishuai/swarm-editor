import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Search, X, ChevronRight, Loader2, Replace, Check, Clock, Filter } from 'lucide-react'
import { getFileIcon, getFileIconColor, logger } from '../utils'
import { api, ContentSearchResult } from '../services'
import { useNavigate } from 'react-router-dom'

const SEARCH_HISTORY_KEY = 'swarm-editor-search-history'
const MAX_SEARCH_HISTORY = 20
const MAX_SEARCH_HISTORY_DISPLAY = 10

interface SearchPanelProps {
  isOpen: boolean
  onClose: () => void
  initialFolder?: string
  initialReplace?: boolean
}

export function SearchPanel({ isOpen, onClose, initialFolder, initialReplace }: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ContentSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [showReplace, setShowReplace] = useState(false)
  const [replacement, setReplacement] = useState('')
  const [preserveCase, setPreserveCase] = useState(false)
  const [isReplacing, setIsReplacing] = useState(false)
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set())
  const [replaceSummary, setReplaceSummary] = useState<{ changedFiles: number } | null>(null)
  const [replaceError, setReplaceError] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(SEARCH_HISTORY_KEY)
      return stored ? JSON.parse(stored) : []
    } catch { logger.debug('SearchPanel', 'localStorage parse failed'); return [] }
  })
  const [showHistory, setShowHistory] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [includePattern, setIncludePattern] = useState('')
  const [excludePattern, setExcludePattern] = useState('')
  const [searchFolder, setSearchFolder] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const searchRequestIdRef = useRef(0) // Stale request guard for search debounce
  const resultsRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // P1: Lock background scroll when panel is open (VS Code pattern)
  useEffect(() => {
    if (isOpen) {
      const original = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = original }
    }
  }, [isOpen])

  // Sync initialFolder prop to local state
  useEffect(() => {
    if (initialFolder !== undefined) {
      setSearchFolder(initialFolder)
      setShowFilters(true)
    }
  }, [initialFolder])

  // Sync initialReplace prop — open in replace mode when Ctrl+Shift+H is used
  useEffect(() => {
    if (initialReplace) {
      setShowReplace(true)
    }
  }, [initialReplace])

  // Clear preview when query or replacement changes
  useEffect(() => {
    setReplaceSummary(null)
    setReplaceError(null)
    setSearchError(null)
    setCollapsedFiles(new Set())
  }, [query, replacement, caseSensitive, wholeWord, useRegex])

  // Search with debounce
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    const timeout = setTimeout(async () => {
      const requestId = ++searchRequestIdRef.current
      setIsSearching(true)
      setSearchError(null)
      try {
        const includeFiles = includePattern.trim() ? includePattern.trim().split(',').map(s => s.trim()).filter(Boolean) : undefined
        const excludeFiles = excludePattern.trim() ? excludePattern.trim().split(',').map(s => s.trim()).filter(Boolean) : undefined
        const folder = searchFolder.trim() || undefined
        const searchResults = await api.fs.searchContent(query, caseSensitive, undefined, { wholeWord, regex: useRegex, includeFiles, excludeFiles, folder })
        // Stale request guard — discard results from outdated requests
        if (requestId !== searchRequestIdRef.current) return
        setResults(searchResults)
        setSelectedIndex(0)
      } catch (err) {
        if (requestId !== searchRequestIdRef.current) return
        setResults([])
        if (useRegex) {
          setSearchError(err instanceof Error ? err.message : 'Search failed')
        }
      } finally {
        if (requestId === searchRequestIdRef.current) {
          setIsSearching(false)
        }
      }
    }, 300)

    return () => clearTimeout(timeout)
  }, [query, caseSensitive, wholeWord, useRegex, includePattern, excludePattern, searchFolder])

  // Focus replace input when toggled
  useEffect(() => {
    if (showReplace && replaceInputRef.current) {
      replaceInputRef.current.focus()
    }
  }, [showReplace])

  // Build search options for reuse across search and replace
  const buildSearchOptions = useCallback(() => {
    const includeFiles = includePattern.trim() ? includePattern.trim().split(',').map(s => s.trim()).filter(Boolean) : undefined
    const excludeFiles = excludePattern.trim() ? excludePattern.trim().split(',').map(s => s.trim()).filter(Boolean) : undefined
    const folder = searchFolder.trim() || undefined
    return { wholeWord, regex: useRegex, includeFiles, excludeFiles, folder }
  }, [wholeWord, useRegex, includePattern, excludePattern, searchFolder])

  const handleReplaceAll = useCallback(async () => {
    if (!query.trim()) return
    setIsReplacing(true)
    setReplaceError(null)
    try {
      // When filters are active, scope replace to only the files shown in results
      const opts = buildSearchOptions()
      const files = (opts.includeFiles || opts.excludeFiles || opts.folder)
        ? [...new Set(results.map(r => r.path))]
        : undefined
      const result = await api.fs.replaceContent(query, replacement, {
        caseSensitive,
        wholeWord,
        regex: useRegex,
        dryRun: false,
        files,
        preserveCase,
      })
      setReplaceSummary({ changedFiles: result.changedFiles })
      // Re-search to reflect changes
      const searchResults = await api.fs.searchContent(query, caseSensitive, undefined, buildSearchOptions())
      setResults(searchResults)
      setSelectedIndex(0)
    } catch (err) {
      setReplaceError(err instanceof Error ? err.message : 'Replace failed')
    } finally {
      setIsReplacing(false)
    }
  }, [query, replacement, caseSensitive, wholeWord, useRegex, buildSearchOptions, results, preserveCase])

  const handleReplaceInFile = useCallback(async (filePath: string) => {
    if (!query.trim()) return
    setIsReplacing(true)
    setReplaceError(null)
    try {
      await api.fs.replaceContent(query, replacement, {
        caseSensitive,
        wholeWord,
        regex: useRegex,
        dryRun: false,
        files: [filePath],
        preserveCase,
      })
      // Re-search to reflect changes
      const searchResults = await api.fs.searchContent(query, caseSensitive, undefined, buildSearchOptions())
      setResults(searchResults)
      setSelectedIndex(0)
    } catch (err) {
      setReplaceError(err instanceof Error ? err.message : 'Replace failed')
    } finally {
      setIsReplacing(false)
    }
  }, [query, replacement, caseSensitive, wholeWord, useRegex, buildSearchOptions, preserveCase])

  // Save search to history
  const saveToHistory = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) return
    setSearchHistory(prev => {
      const filtered = prev.filter(q => q !== searchQuery)
      const updated = [searchQuery, ...filtered].slice(0, MAX_SEARCH_HISTORY)
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updated))
      return updated
    })
  }, [])

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Escape always works
    if (e.key === 'Escape') {
      onClose()
      return
    }
    // Ctrl+Up: move focus from input to results (VS Code pattern)
    if (e.key === 'ArrowUp' && e.ctrlKey && results.length > 0) {
      e.preventDefault()
      const container = resultsRef.current
      if (container) {
        const firstResult = container.querySelector('[role="option"]') as HTMLElement | null
        if (firstResult) firstResult.focus()
      }
      return
    }
    if (results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      if (e.altKey && showReplace) {
        // Alt+Enter: Replace in current file
        e.preventDefault()
        handleReplaceInFile(results[selectedIndex].path)
      } else {
        const result = results[selectedIndex]
        saveToHistory(query)
        navigate(`/?file=${encodeURIComponent(result.path)}&line=${result.line}`)
        onClose()
      }
    }
  }, [results, selectedIndex, navigate, onClose, showReplace, query, handleReplaceInFile, saveToHistory])

  const handleResultClick = (result: ContentSearchResult) => {
    saveToHistory(query)
    navigate(`/?file=${encodeURIComponent(result.path)}&line=${result.line}`)
    onClose()
  }

  // Handle history item click
  const handleHistoryClick = (historyQuery: string) => {
    setQuery(historyQuery)
    setShowHistory(false)
  }

  // Clear search history
  const clearHistory = useCallback(() => {
    setSearchHistory([])
    localStorage.removeItem(SEARCH_HISTORY_KEY)
  }, [])

  // Group results by file (memoized — avoids recompute on every render)
  const groupedResults = useMemo(() => {
    return results.reduce<Record<string, ContentSearchResult[]>>((acc, result) => {
      if (!acc[result.path]) acc[result.path] = []
      acc[result.path].push(result)
      return acc
    }, {})
  }, [results])

  const fileCount = useMemo(() => Object.keys(groupedResults).length, [groupedResults])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[12vh] z-[100]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-mac-panel/95 border border-glass-border rounded-mac-xl w-[640px] shadow-mac backdrop-blur-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Search in files"
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-glass-border relative">
          <Search size={20} className="text-text-tertiary flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setShowHistory(true)}
            onBlur={() => setTimeout(() => setShowHistory(false), 200)}
            onKeyDown={handleKeyDown}
            placeholder="Search in files..."
            className="flex-1 bg-transparent text-text-primary placeholder-text-tertiary outline-none text-base"
          />
          {/* Search History Dropdown */}
          {showHistory && searchHistory.length > 0 && !query.trim() && (
            <div className="absolute top-full left-0 right-0 bg-mac-panel border border-glass-border rounded-b-mac-xl shadow-mac max-h-[300px] overflow-y-auto z-10">
              <div className="flex items-center justify-between px-4 py-2 border-b border-glass-border">
                <span className="text-xs text-text-tertiary">Recent searches</span>
                <button
                  onMouseDown={(e) => { e.preventDefault(); clearHistory() }}
                  className="text-xs text-text-tertiary hover:text-text-primary transition-colors"
                >
                  Clear
                </button>
              </div>
              {searchHistory.slice(0, MAX_SEARCH_HISTORY_DISPLAY).map((historyQuery, i) => (
                <button
                  key={i}
                  onMouseDown={(e) => { e.preventDefault(); handleHistoryClick(historyQuery) }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
                >
                  <Clock size={14} className="text-text-tertiary flex-shrink-0" />
                  <span className="truncate">{historyQuery}</span>
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowReplace(prev => !prev)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              showReplace ? 'bg-accent text-white' : 'bg-surface text-text-secondary hover:text-text-primary'
            }`}
            title="Toggle replace"
          >
            <Replace size={14} />
          </button>
          <button
            onClick={() => setCaseSensitive(!caseSensitive)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              caseSensitive ? 'bg-accent text-white' : 'bg-surface text-text-secondary hover:text-text-primary'
            }`}
            title="Match case"
          >
            Aa
          </button>
          <button
            onClick={() => setWholeWord(!wholeWord)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              wholeWord ? 'bg-accent text-white' : 'bg-surface text-text-secondary hover:text-text-primary'
            }`}
            title="Match whole word"
          >
            Ab
          </button>
          <button
            onClick={() => setUseRegex(!useRegex)}
            className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${
              useRegex ? 'bg-accent text-white' : 'bg-surface text-text-secondary hover:text-text-primary'
            }`}
            title="Use regular expression"
          >
            .*
          </button>
          {showReplace && (
            <button
              onClick={() => setPreserveCase(!preserveCase)}
              className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${
                preserveCase ? 'bg-accent text-white' : 'bg-surface text-text-secondary hover:text-text-primary'
              }`}
              title="Preserve Case"
            >
              AB
            </button>
          )}
          <button
            onClick={() => setShowFilters(prev => !prev)}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${
              showFilters || searchFolder ? 'bg-accent text-white' : 'bg-surface text-text-secondary hover:text-text-primary'
            }`}
            title="Filter files to include/exclude"
          >
            <Filter size={14} />
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-card-hover rounded transition-colors"
          >
            <X size={16} className="text-text-secondary" />
          </button>
        </div>

        {/* Filter Bar (VS Code pattern: include/exclude/folder) */}
        {showFilters && (
          <div className="px-4 py-2 border-b border-glass-border bg-surface/30 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-text-tertiary w-16 flex-shrink-0">Include</span>
              <input
                type="text"
                value={includePattern}
                onChange={(e) => setIncludePattern(e.target.value)}
                placeholder="*.ts, *.tsx (comma-separated)"
                className="flex-1 bg-transparent text-xs text-text-primary placeholder-text-tertiary outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-text-tertiary w-16 flex-shrink-0">Exclude</span>
              <input
                type="text"
                value={excludePattern}
                onChange={(e) => setExcludePattern(e.target.value)}
                placeholder="*.test.ts, node_modules"
                className="flex-1 bg-transparent text-xs text-text-primary placeholder-text-tertiary outline-none"
              />
            </div>
            {searchFolder && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-text-tertiary w-16 flex-shrink-0">Folder</span>
                <span className="text-xs text-accent truncate">{searchFolder}</span>
                <button
                  onClick={() => setSearchFolder('')}
                  className="p-0.5 hover:bg-card-hover rounded transition-colors flex-shrink-0"
                >
                  <X size={12} className="text-text-secondary" />
                </button>
              </div>
            )}
          </div>
        )}
        {!showFilters && searchFolder && (
          <div className="flex items-center gap-2 px-4 py-1.5 border-b border-glass-border bg-surface/30">
            <Filter size={12} className="text-accent flex-shrink-0" />
            <span className="text-xs text-accent truncate">{searchFolder}</span>
            <button
              onClick={() => setSearchFolder('')}
              className="p-0.5 hover:bg-card-hover rounded transition-colors flex-shrink-0"
            >
              <X size={12} className="text-text-secondary" />
            </button>
          </div>
        )}

        {/* Replace Input */}
        {showReplace && (
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-glass-border bg-surface/30">
            <Replace size={16} className="text-text-tertiary flex-shrink-0" />
            <input
              ref={replaceInputRef}
              type="text"
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              placeholder="Replace with..."
              className="flex-1 bg-transparent text-text-primary placeholder-text-tertiary outline-none text-sm"
            />
            <button
              onClick={handleReplaceAll}
              disabled={isReplacing || !query.trim() || results.length === 0}
              className="px-3 py-1 rounded text-xs font-medium bg-accent text-white hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isReplacing ? 'Replacing...' : 'Replace All'}
            </button>
          </div>
        )}

        {/* Replace Summary / Error */}
        {replaceSummary && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-glass-border bg-green-500/10">
            <Check size={14} className="text-green-400 flex-shrink-0" />
            <span className="text-xs text-green-300">
              Replaced in {replaceSummary.changedFiles} file{replaceSummary.changedFiles !== 1 ? 's' : ''}
            </span>
          </div>
        )}
        {replaceError && (
          <div role="alert" aria-live="polite" className="flex items-center gap-2 px-4 py-2 border-b border-glass-border bg-red-500/10">
            <X size={14} className="text-error flex-shrink-0" />
            <span className="text-xs text-error">{replaceError}</span>
          </div>
        )}

        {/* Results */}
        <div
          ref={resultsRef}
          className="max-h-[400px] overflow-y-auto"
          role="listbox"
          aria-label="Search results"
          onKeyDown={(e) => {
            // Ctrl+Down: move focus from results back to input (VS Code pattern)
            if (e.key === 'ArrowDown' && e.ctrlKey) {
              e.preventDefault()
              inputRef.current?.focus()
            }
          }}
        >
          {isSearching ? (
            <div className="px-4 py-8 text-center text-text-tertiary">
              <Loader2 size={24} className="animate-spin mx-auto mb-2" />
              <p>Searching...</p>
            </div>
          ) : searchError ? (
            <div role="alert" className="px-4 py-8 text-center text-error">
              <p className="text-sm">{searchError}</p>
              <p className="text-xs mt-1 text-text-tertiary">Check your regular expression syntax</p>
            </div>
          ) : results.length === 0 ? (
            query.trim() ? (
              <div className="px-4 py-8 text-center text-text-tertiary">
                <Search size={32} className="mx-auto mb-2 opacity-50" />
                <p>No results found</p>
              </div>
            ) : (
              <div className="px-4 py-8 text-center text-text-tertiary">
                <p>Type to search across all files</p>
                <p className="text-xs mt-1">Press Enter to open, Escape to close</p>
              </div>
            )
          ) : (
            <div className="divide-y divide-glass-border/50">
              {Object.entries(groupedResults).map(([filePath, fileResults]) => {
                // Find the first selected index for this file group
                const firstGroupIndex = results.findIndex(r => r.path === filePath)
                const isGroupSelected = selectedIndex >= firstGroupIndex && selectedIndex < firstGroupIndex + fileResults.length
                const isCollapsed = collapsedFiles.has(filePath)
                return (
                  <div key={filePath}>
                    {/* File header — click to collapse/expand */}
                    <div
                      onClick={() => setCollapsedFiles(prev => {
                        const next = new Set(prev)
                        if (next.has(filePath)) next.delete(filePath)
                        else next.add(filePath)
                        return next
                      })}
                      className={`flex items-center gap-2 px-4 py-1.5 text-xs transition-colors cursor-pointer ${
                        isGroupSelected ? 'bg-accent/10' : 'bg-surface/50'
                      }`}
                    >
                      <ChevronRight
                        size={12}
                        className={`text-text-tertiary flex-shrink-0 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                      />
                      {(() => {
                        const SearchIcon = getFileIcon(filePath)
                        return <SearchIcon size={12} className={getFileIconColor(filePath)} />
                      })()}
                      <span className="font-medium text-text-secondary truncate">{filePath}</span>
                      <span className="text-text-tertiary ml-auto flex-shrink-0">
                        {fileResults.length} match{fileResults.length !== 1 ? 'es' : ''}
                      </span>
                      {showReplace && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleReplaceInFile(filePath) }}
                          disabled={isReplacing}
                          className="px-1.5 py-0.5 rounded text-[10px] bg-surface text-text-secondary hover:text-text-primary hover:bg-card-hover disabled:opacity-40 transition-colors flex-shrink-0"
                          title="Replace all in this file"
                        >
                          Replace in file
                        </button>
                      )}
                    </div>
                    {/* Match lines — hidden when collapsed */}
                    {!isCollapsed && fileResults.map((result, index) => {
                      const globalIndex = firstGroupIndex + index
                      const isSelected = globalIndex === selectedIndex
                      return (
                        <div
                          key={`${result.path}-${result.line}`}
                          onClick={() => handleResultClick(result)}
                          className={`flex items-start gap-3 pl-8 pr-4 py-1.5 cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-accent/20 border-l-2 border-accent'
                              : 'hover:bg-card-hover border-l-2 border-transparent'
                          }`}
                          role="option"
                          aria-selected={isSelected}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleResultClick(result)
                            } else if (e.key === 'ArrowDown') {
                              e.preventDefault()
                              // Focus next result
                              const next = e.currentTarget.nextElementSibling as HTMLElement | null
                              if (next && next.getAttribute('role') === 'option') next.focus()
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault()
                              // Focus previous result
                              const prev = e.currentTarget.previousElementSibling as HTMLElement | null
                              if (prev && prev.getAttribute('role') === 'option') prev.focus()
                            }
                          }}
                        >
                          <span className="text-[11px] text-text-tertiary w-8 text-right flex-shrink-0 mt-0.5">
                            {result.line + 1}
                          </span>
                          <p className="text-xs text-text-secondary truncate flex-1 min-w-0">
                            {highlightMatch(result.content, query, caseSensitive, wholeWord, useRegex)}
                          </p>
                          <ChevronRight size={12} className="flex-shrink-0 text-text-tertiary mt-0.5" />
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-glass-border bg-surface/50 text-xs text-text-tertiary">
          <span>
            {results.length > 0
              ? `${results.length} result${results.length !== 1 ? 's' : ''} in ${fileCount} file${fileCount !== 1 ? 's' : ''}`
              : ''
            }
          </span>
          <div className="flex items-center gap-3">
            {results.length > 0 && fileCount > 1 && (
              <button
                onClick={() => setCollapsedFiles(prev => prev.size === fileCount ? new Set() : new Set(Object.keys(groupedResults)))}
                className="hover:text-text-primary transition-colors"
                title={collapsedFiles.size === fileCount ? 'Expand All' : 'Collapse All'}
              >
                {collapsedFiles.size === fileCount ? 'Expand All' : 'Collapse All'}
              </button>
            )}
            {showReplace && (
              <span><kbd className="px-1 bg-mac-sidebar rounded">Alt+↵</kbd> Replace in file</span>
            )}
            <span><kbd className="px-1 bg-mac-sidebar rounded">↑↓</kbd> Navigate</span>
            <span><kbd className="px-1 bg-mac-sidebar rounded">↵</kbd> Open</span>
            <span><kbd className="px-1 bg-mac-sidebar rounded">Esc</kbd> Close</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper to highlight all search matches in content
function highlightMatch(content: string, query: string, caseSensitive: boolean, wholeWord: boolean, useRegex: boolean): React.ReactNode {
  if (!query) return content

  let pattern: RegExp
  try {
    let patternStr = useRegex ? query : escapeRegExp(query)
    if (wholeWord && !useRegex) {
      patternStr = `\\b${patternStr}\\b`
    }
    pattern = new RegExp(patternStr, caseSensitive ? 'g' : 'gi')
  } catch {
    logger.debug('SearchPanel', 'Invalid regex pattern')
    return content
  }

  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  // Only show first 200 chars to keep results compact
  const displayContent = content.length > 200 ? content.slice(0, 200) + '...' : content
  const maxLen = Math.min(content.length, 200)

  while ((match = pattern.exec(content)) !== null && match.index < maxLen) {
    // Prevent infinite loop on zero-length matches
    if (match.index === pattern.lastIndex) pattern.lastIndex++

    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }
    parts.push(
      <span key={match.index} className="bg-accent/30 text-text-primary rounded px-0.5">
        {match[0]}
      </span>
    )
    lastIndex = match.index + match[0].length
  }

  if (parts.length === 0) return displayContent

  if (lastIndex < maxLen) {
    parts.push(content.slice(lastIndex, maxLen))
  }

  return <>{parts}</>
}

// Escape special regex characters in a string
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
