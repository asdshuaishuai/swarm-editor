/**
 * DiffView component — side-by-side or unified diff view using @codemirror/merge.
 *
 * Displays git file diff comparison with:
 * - Side-by-side (MergeView) and unified modes
 * - Chunk navigation (prev/next)
 * - Diff stats (+N/-N) in header
 * - Dark theme matching Swarm Editor palette
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { MergeView, unifiedMergeView, goToNextChunk, goToPreviousChunk, getChunks } from '@codemirror/merge'
import { EditorView } from '@codemirror/view'
import { EditorState, Extension } from '@codemirror/state'
import { basicSetup } from '@codemirror/basic-setup'

import { swarmDarkTheme } from '../utils/codemirrorTheme'
import { getLanguageExtension } from '../utils/codemirrorSetup'
import { logger } from '../utils'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface DiffViewProps {
  /** git HEAD content */
  original: string
  /** working tree content */
  modified: string
  /** filename for language detection */
  filename: string
  /** explicit language override */
  language?: string
  /** close diff view */
  onClose: () => void
}

// Unified diff theme for inline mode
const unifiedDiffTheme = EditorView.theme({
  '.cm-deletedLine': {
    backgroundColor: 'rgba(248, 81, 73, 0.15)',
  },
  '.cm-deletedText': {
    backgroundColor: 'rgba(248, 81, 73, 0.25)',
    textDecoration: 'line-through',
  },
  '.cm-insertedLine': {
    backgroundColor: 'rgba(46, 160, 67, 0.15)',
  },
  '.cm-insertedText': {
    backgroundColor: 'rgba(46, 160, 67, 0.25)',
  },
  '.cm-changedLine': {
    backgroundColor: 'rgba(46, 160, 67, 0.15)',
  },
  '.cm-changedText': {
    backgroundColor: 'rgba(46, 160, 67, 0.25)',
  },
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute diff stats: lines added and removed */
function computeDiffStats(original: string, modified: string): { added: number; removed: number } {
  const origLines = original.split('\n')
  const modLines = modified.split('\n')

  // Simple line-based diff using longest common subsequence
  const m = origLines.length
  const n = modLines.length

  // For very large files, use a simpler heuristic
  if (m * n > 10_000_000) {
    // Fallback: just count unique lines
    const origSet = new Set(origLines)
    const modSet = new Set(modLines)
    let added = 0
    let removed = 0
    for (const line of modLines) {
      if (!origSet.has(line)) added++
    }
    for (const line of origLines) {
      if (!modSet.has(line)) removed++
    }
    return { added, removed }
  }

  // LCS dynamic programming
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origLines[i - 1] === modLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to count additions and removals
  let added = 0
  let removed = 0
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === modLines[j - 1]) {
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      added++
      j--
    } else {
      removed++
      i--
    }
  }

  return { added, removed }
}

// ---------------------------------------------------------------------------
// DiffView Component
// ---------------------------------------------------------------------------
export default function DiffView({ original, modified, filename, language, onClose }: DiffViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mergeViewRef = useRef<MergeView | null>(null)
  const unifiedEditorRef = useRef<EditorView | null>(null)
  const [mode, setMode] = useState<'side-by-side' | 'unified'>('side-by-side')
  const [chunkIndex, setChunkIndex] = useState(0)
  const [totalChunks, setTotalChunks] = useState(0)
  const mountedRef = useRef(true)

  // Diff stats
  const stats = useMemo(() => computeDiffStats(original, modified), [original, modified])

  // Language extensions
  const langExts = useMemo(() => {
    const target = language || filename
    return getLanguageExtension(target)
  }, [filename, language])

  // Shared extensions for both editors
  const sharedExtensions = useMemo((): Extension[] => [
    basicSetup,
    swarmDarkTheme,
    ...langExts,
    EditorState.readOnly.of(true),
    EditorView.theme({
      '&': { height: '100%' },
      '.cm-scroller': { overflow: 'auto' },
    }),
  ], [langExts])

  // Count chunks
  const refreshChunkCount = useCallback(() => {
    if (mode === 'side-by-side' && mergeViewRef.current) {
      setTotalChunks(mergeViewRef.current.chunks.length)
    } else if (mode === 'unified' && unifiedEditorRef.current) {
      const result = getChunks(unifiedEditorRef.current.state)
      setTotalChunks(result ? result.chunks.length : 0)
    }
  }, [mode])

  // Create side-by-side MergeView
  useEffect(() => {
    if (mode !== 'side-by-side') return
    if (!containerRef.current) return

    // Destroy previous instance
    if (mergeViewRef.current) {
      mergeViewRef.current.a.destroy()
      mergeViewRef.current.b.destroy()
      mergeViewRef.current = null
    }

    try {
      const mv = new MergeView({
        a: {
          doc: original,
          extensions: sharedExtensions,
        },
        b: {
          doc: modified,
          extensions: sharedExtensions,
        },
        parent: containerRef.current,
        orientation: 'a-b',
        highlightChanges: true,
        gutter: true,
        collapseUnchanged: {
          margin: 3,
          minSize: 4,
        },
      })

      mergeViewRef.current = mv

      // Apply diff theme to the merge view container
      const dom = mv.dom
      dom.classList.add('cm-mergeView')
      dom.style.height = '100%'

      // Apply additional diff styling via CSS injection
      const styleEl = document.createElement('style')
      styleEl.textContent = `
        .cm-mergeView .cm-line.cm-changedLine,
        .cm-mergeView .cm-changedLine {
          background: rgba(46, 160, 67, 0.15) !important;
          border-left: 3px solid rgba(46, 160, 67, 0.6) !important;
        }
        .cm-mergeView .cm-changedText {
          background: rgba(46, 160, 67, 0.25) !important;
        }
        .cm-mergeView .cm-deletedLine {
          background: rgba(248, 81, 73, 0.15) !important;
          border-left: 3px solid rgba(248, 81, 73, 0.6) !important;
        }
        .cm-mergeView .cm-deletedText {
          background: rgba(248, 81, 73, 0.25) !important;
          text-decoration: line-through;
        }
        .cm-mergeView .cm-insertedLine {
          background: rgba(46, 160, 67, 0.15) !important;
          border-left: 3px solid rgba(46, 160, 67, 0.6) !important;
        }
        .cm-mergeView .cm-insertedText {
          background: rgba(46, 160, 67, 0.25) !important;
        }
        .cm-mergeView .cm-gutter .cm-changedLineGutter {
          background: rgba(46, 160, 67, 0.15) !important;
        }
        .cm-mergeView .cm-collapsedLines {
          background: #161b22;
          border: 1px solid #30363d;
          border-radius: 3px;
          color: #58a6ff;
          cursor: pointer;
        }
        .cm-mergeView .cm-collapsedLines:hover {
          background: #21262d;
        }
        .cm-mergeView table {
          width: 100%;
          height: 100%;
          border-collapse: collapse;
        }
        .cm-mergeView td {
          width: 50%;
          vertical-align: top;
          border-right: 1px solid #30363d;
        }
        .cm-mergeView td:last-child {
          border-right: none;
        }
        .cm-mergeView .cm-editor {
          height: 100%;
        }
        .cm-mergeView .cm-scroller {
          overflow: auto !important;
        }
      `
      containerRef.current.appendChild(styleEl)

      // Update chunk count after initialization
      requestAnimationFrame(() => {
        if (mountedRef.current && mergeViewRef.current) {
          setTotalChunks(mergeViewRef.current.chunks.length)
        }
      })

    } catch (err) {
      logger.error('DiffView', 'Failed to create MergeView:', err)
    }

    return () => {
      // Cleanup: remove injected styles
      if (containerRef.current) {
        const styles = containerRef.current.querySelectorAll('style')
        styles.forEach(s => s.remove())
      }
    }
  }, [mode, original, modified, sharedExtensions])

  // Create unified diff view
  useEffect(() => {
    if (mode !== 'unified') return
    if (!containerRef.current) return

    // Destroy previous instance
    if (unifiedEditorRef.current) {
      unifiedEditorRef.current.destroy()
      unifiedEditorRef.current = null
    }

    try {
      const state = EditorState.create({
        doc: modified,
        extensions: [
          basicSetup,
          swarmDarkTheme,
          unifiedDiffTheme,
          ...langExts,
          EditorState.readOnly.of(true),
          EditorView.theme({
            '&': { height: '100%' },
            '.cm-scroller': { overflow: 'auto' },
          }),
          unifiedMergeView({
            original: original,
            highlightChanges: true,
            gutter: true,
            syntaxHighlightDeletions: true,
          }),
          // Inject diff colors via CSS
          EditorView.baseTheme({
            '&dark .cm-deletedLine': { backgroundColor: 'rgba(248, 81, 73, 0.15)' },
            '&dark .cm-deletedText': { backgroundColor: 'rgba(248, 81, 73, 0.25)' },
            '&dark .cm-insertedLine': { backgroundColor: 'rgba(46, 160, 67, 0.15)' },
            '&dark .cm-insertedText': { backgroundColor: 'rgba(46, 160, 67, 0.25)' },
            '&dark .cm-changedLine': { backgroundColor: 'rgba(46, 160, 67, 0.15)' },
            '&dark .cm-changedText': { backgroundColor: 'rgba(46, 160, 67, 0.25)' },
          }),
        ],
      })

      const view = new EditorView({
        state,
        parent: containerRef.current,
      })

      unifiedEditorRef.current = view

      // Count chunks
      requestAnimationFrame(() => {
        if (mountedRef.current && unifiedEditorRef.current) {
          const result = getChunks(unifiedEditorRef.current.state)
          setTotalChunks(result ? result.chunks.length : 0)
        }
      })

    } catch (err) {
      logger.error('DiffView', 'Failed to create unified view:', err)
    }

    return () => {
      if (unifiedEditorRef.current) {
        unifiedEditorRef.current.destroy()
        unifiedEditorRef.current = null
      }
    }
  }, [mode, original, modified, langExts])

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (mergeViewRef.current) {
        try {
          mergeViewRef.current.a.destroy()
          mergeViewRef.current.b.destroy()
        } catch (err) { logger.debug('DiffView', 'merge view destroy failed', err) }
        mergeViewRef.current = null
      }
      if (unifiedEditorRef.current) {
        try {
          unifiedEditorRef.current.destroy()
        } catch (err) { logger.debug('DiffView', 'unified editor destroy failed', err) }
        unifiedEditorRef.current = null
      }
    }
  }, [])

  // Navigation handlers
  const handleNextChunk = useCallback(() => {
    if (mode === 'side-by-side' && mergeViewRef.current) {
      goToNextChunk(mergeViewRef.current.b)
      refreshChunkCount()
    } else if (mode === 'unified' && unifiedEditorRef.current) {
      goToNextChunk(unifiedEditorRef.current)
      refreshChunkCount()
    }
  }, [mode, refreshChunkCount])

  const handlePrevChunk = useCallback(() => {
    if (mode === 'side-by-side' && mergeViewRef.current) {
      goToPreviousChunk(mergeViewRef.current.b)
      refreshChunkCount()
    } else if (mode === 'unified' && unifiedEditorRef.current) {
      goToPreviousChunk(unifiedEditorRef.current)
      refreshChunkCount()
    }
  }, [mode, refreshChunkCount])

  const handleToggleMode = useCallback(() => {
    setMode(prev => prev === 'side-by-side' ? 'unified' : 'side-by-side')
    setChunkIndex(0)
  }, [])

  const fileName = filename.split('/').pop() || filename

  return (
    <div className="flex flex-col h-full" style={{ background: '#0d1117' }}>
      {/* Header bar */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 border-b shrink-0"
        style={{
          background: '#161b22',
          borderBottomColor: '#30363d',
        }}
      >
        {/* Filename */}
        <span className="text-xs font-medium truncate" style={{ color: '#d1d5db' }}>
          {fileName}
        </span>

        {/* Diff stats */}
        <span className="flex items-center gap-1 text-xs shrink-0">
          <span style={{ color: '#3fb950' }}>+{stats.added}</span>
          <span style={{ color: '#f85149' }}>-{stats.removed}</span>
        </span>

        {/* Chunk navigation */}
        <span className="flex items-center gap-1 ml-auto shrink-0">
          <span className="text-[10px] mr-1" style={{ color: '#6b7280' }}>
            {totalChunks > 0 ? `${chunkIndex + 1}/${totalChunks}` : '0/0'}
          </span>
          <button
            onClick={handlePrevChunk}
            className="p-0.5 rounded transition-colors hover:bg-[#21262d]"
            style={{ color: '#8b949e' }}
            title="Previous change (Alt+F5)"
            disabled={totalChunks === 0}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M10.5 2.5L5 8l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            onClick={handleNextChunk}
            className="p-0.5 rounded transition-colors hover:bg-[#21262d]"
            style={{ color: '#8b949e' }}
            title="Next change (F5)"
            disabled={totalChunks === 0}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M5.5 2.5L11 8l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </span>

        {/* Mode toggle */}
        <button
          onClick={handleToggleMode}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors hover:bg-[#21262d]"
          style={{ color: '#8b949e' }}
          title={mode === 'side-by-side' ? 'Switch to unified view' : 'Switch to side-by-side view'}
        >
          {mode === 'side-by-side' ? (
            /* Unified icon: single column */
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="1" width="12" height="14" rx="1" />
              <line x1="2" y1="5" x2="14" y2="5" strokeDasharray="2 2" />
            </svg>
          ) : (
            /* Split icon: two columns */
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="1" y="1" width="6" height="14" rx="1" />
              <rect x="9" y="1" width="6" height="14" rx="1" />
            </svg>
          )}
        </button>

        {/* Close button */}
        <button
          onClick={onClose}
          className="p-0.5 rounded transition-colors hover:bg-[#21262d]"
          style={{ color: '#6b7280' }}
          title="Close diff view"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Diff content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden"
        style={{ background: '#0d1117' }}
      />
    </div>
  )
}
