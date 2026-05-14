import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { AlertCircle, AlertTriangle, Info, ChevronUp, ChevronDown } from 'lucide-react'
import { getFileIcon, getFileIconColor } from '../utils'
import { useNavigate } from 'react-router-dom'

export interface ProblemItem {
  id: string
  file: string
  line: number
  column: number
  message: string
  severity: 'error' | 'warning' | 'info' | 'hint'
  source?: string
}

interface ProblemsPanelProps {
  problems: ProblemItem[]
  defaultHeight?: number
  minHeight?: number
  maxHeight?: number
}

export default function ProblemsPanel({
  problems,
  defaultHeight = 200,
  minHeight = 100,
  maxHeight = 500,
}: ProblemsPanelProps) {
  const [height, setHeight] = useState(defaultHeight)
  const [isResizing, setIsResizing] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [filter, setFilter] = useState<'all' | 'errors' | 'warnings'>('all')
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const resizeStartY = useRef(0)
  const resizeStartHeight = useRef(0)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Filter and sort problems (memoized) — VS Code pattern: errors first, then warnings, then info
  const filteredProblems = useMemo(() => {
    const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2, hint: 3 }
    let filtered = problems
    if (filter === 'errors') filtered = problems.filter(p => p.severity === 'error')
    else if (filter === 'warnings') filtered = problems.filter(p => p.severity === 'warning')
    return [...filtered].sort((a, b) => {
      const sevDiff = (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4)
      if (sevDiff !== 0) return sevDiff
      // Same severity: sort by file, then line
      if (a.file !== b.file) return a.file.localeCompare(b.file)
      return a.line - b.line
    })
  }, [problems, filter])

  // Count by severity (memoized)
  const errorCount = useMemo(() => problems.filter(p => p.severity === 'error').length, [problems])
  const warningCount = useMemo(() => problems.filter(p => p.severity === 'warning').length, [problems])

  // R5094: Reset focused index when filter changes (derived, not via useEffect to avoid cascading render)
  const activeFocusedIndex = focusedIndex < filteredProblems.length ? focusedIndex : -1

  const handleProblemClick = useCallback((problem: ProblemItem) => {
    navigate(`/?file=${encodeURIComponent(problem.file)}&line=${problem.line}`)
  }, [navigate])

  // R5094: Keyboard navigation (VS Code pattern — arrow keys + Enter)
  const handleListKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (filteredProblems.length === 0) return
    const current = activeFocusedIndex
    let next = current
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        next = current < filteredProblems.length - 1 ? current + 1 : 0
        break
      case 'ArrowUp':
        e.preventDefault()
        next = current > 0 ? current - 1 : filteredProblems.length - 1
        break
      case 'Home':
        e.preventDefault()
        next = 0
        break
      case 'End':
        e.preventDefault()
        next = filteredProblems.length - 1
        break
      case 'Enter':
        if (current >= 0 && current < filteredProblems.length) {
          handleProblemClick(filteredProblems[current])
        }
        return
      default:
        return
    }
    setFocusedIndex(next)
    // Scroll focused item into view
    const container = listRef.current
    if (!container) return
    const items = container.querySelectorAll('[role="listitem"]')
    if (items[next]) {
      items[next].scrollIntoView({ block: 'nearest' })
    }
  }, [filteredProblems, activeFocusedIndex, handleProblemClick])

  // Handle resize
  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = resizeStartY.current - e.clientY
      const newHeight = Math.min(maxHeight, Math.max(minHeight, resizeStartHeight.current + deltaY))
      setHeight(newHeight)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, minHeight, maxHeight])

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    resizeStartY.current = e.clientY
    resizeStartHeight.current = height
  }

  const getSeverityIcon = (severity: ProblemItem['severity']) => {
    switch (severity) {
      case 'error':
        return <AlertCircle size={14} className="text-error" />
      case 'warning':
        return <AlertTriangle size={14} className="text-warning" />
      case 'info':
        return <Info size={14} className="text-info" />
      default:
        return <Info size={14} className="text-text-tertiary" />
    }
  }

  if (isCollapsed) {
    return (
      <div className="flex items-center justify-between px-4 py-1.5 bg-mac-bg border-t border-glass-border">
        <div className="flex items-center gap-4 text-xs">
          <button
            onClick={() => setFilter('all')}
            className={`flex items-center gap-1 ${filter === 'all' ? 'text-text-primary' : 'text-text-secondary'}`}
          >
            <span>Problems</span>
            <span className="text-text-tertiary">({problems.length})</span>
          </button>
          {errorCount > 0 && (
            <span className="flex items-center gap-1 text-error">
              <AlertCircle size={12} />
              {errorCount}
            </span>
          )}
          {warningCount > 0 && (
            <span className="flex items-center gap-1 text-warning">
              <AlertTriangle size={12} />
              {warningCount}
            </span>
          )}
        </div>
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-1 hover:bg-card-hover rounded transition-colors"
        >
          <ChevronUp size={14} className="text-text-secondary" />
        </button>
      </div>
    )
  }

  return (
    <div className="bg-mac-bg border-t border-glass-border" style={{ height }}>
      {/* Resize handle */}
      <div
        className="h-1 cursor-ns-resize hover:bg-accent/30 transition-colors"
        onMouseDown={handleResizeStart}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-glass-border">
        <div className="flex items-center gap-4 text-xs">
          <button
            onClick={() => setFilter('all')}
            className={`flex items-center gap-1 ${filter === 'all' ? 'text-text-primary font-medium' : 'text-text-secondary hover:text-text-primary'}`}
          >
            <span>All</span>
            <span className="text-text-tertiary">({problems.length})</span>
          </button>
          {errorCount > 0 && (
            <button
              onClick={() => setFilter('errors')}
              className={`flex items-center gap-1 ${filter === 'errors' ? 'text-error font-medium' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <AlertCircle size={12} />
              <span>{errorCount}</span>
            </button>
          )}
          {warningCount > 0 && (
            <button
              onClick={() => setFilter('warnings')}
              className={`flex items-center gap-1 ${filter === 'warnings' ? 'text-warning font-medium' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <AlertTriangle size={12} />
              <span>{warningCount}</span>
            </button>
          )}
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1 hover:bg-card-hover rounded transition-colors"
        >
          <ChevronDown size={14} className="text-text-secondary" />
        </button>
      </div>

      {/* Problems list */}
      <div
        ref={listRef}
        className="overflow-y-auto outline-none"
        style={{ height: height - 50 }}
        role="listbox"
        aria-label="Problems list"
        aria-activedescendant={activeFocusedIndex >= 0 ? `problem-${filteredProblems[activeFocusedIndex]?.id}` : undefined}
        tabIndex={0}
        onKeyDown={handleListKeyDown}
      >
        {filteredProblems.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-text-tertiary" aria-live="polite">
            {problems.length === 0 ? 'No problems have been detected in the workspace.' : 'No problems match the current filter.'}
          </div>
        ) : (
          <div className="divide-y divide-glass-border">
            {filteredProblems.map((problem, index) => (
              <div
                key={problem.id}
                id={`problem-${problem.id}`}
                role="option"
                aria-selected={index === activeFocusedIndex}
                onClick={() => {
                  setFocusedIndex(index)
                  handleProblemClick(problem)
                }}
                className={`flex items-start gap-3 px-4 py-2 cursor-pointer transition-colors ${index === activeFocusedIndex ? 'bg-card-hover' : 'hover:bg-card-hover'}`}
              >
                <div className="mt-0.5">{getSeverityIcon(problem.severity)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text-primary truncate">{problem.message}</p>
                  <p className="text-xs text-text-tertiary flex items-center gap-1 mt-0.5">
                    {(() => { const PIcon = getFileIcon(problem.file); return <PIcon size={10} className={getFileIconColor(problem.file)} /> })()}
                    <span className="truncate">{problem.file}</span>
                    <span className="flex-shrink-0">[{problem.line + 1}, {problem.column + 1}]</span>
                    {problem.source && <span className="flex-shrink-0">({problem.source})</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
