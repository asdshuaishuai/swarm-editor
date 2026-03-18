import { useState, useEffect, useRef } from 'react'
import { X, Trash2, ChevronUp, ChevronDown, Terminal } from 'lucide-react'

export interface TerminalEntry {
  id: string
  type: 'info' | 'success' | 'error' | 'warning' | 'command'
  message: string
  timestamp: Date
  details?: string
}

interface TerminalPanelProps {
  entries: TerminalEntry[]
  onClear: () => void
  onClose?: () => void
  defaultHeight?: number
  minHeight?: number
  maxHeight?: number
}

export default function TerminalPanel({
  entries,
  onClear,
  onClose,
  defaultHeight = 200,
  minHeight = 100,
  maxHeight = 500,
}: TerminalPanelProps) {
  const [height, setHeight] = useState(defaultHeight)
  const [isResizing, setIsResizing] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const outputRef = useRef<HTMLDivElement>(null)
  const resizeStartY = useRef(0)
  const resizeStartHeight = useRef(0)

  // Auto-scroll to bottom when new entries are added
  useEffect(() => {
    if (outputRef.current && !isCollapsed) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [entries, isCollapsed])

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

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed)
  }

  const getEntryColor = (type: TerminalEntry['type']) => {
    switch (type) {
      case 'success':
        return 'text-green-400'
      case 'error':
        return 'text-red-400'
      case 'warning':
        return 'text-yellow-400'
      case 'command':
        return 'text-cyan-400'
      default:
        return 'text-gray-300'
    }
  }

  const getEntryIcon = (type: TerminalEntry['type']) => {
    switch (type) {
      case 'success':
        return '✓'
      case 'error':
        return '✗'
      case 'warning':
        return '⚠'
      case 'command':
        return '>'
      default:
        return '●'
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  if (entries.length === 0) {
    return null
  }

  return (
    <div
      className={`flex flex-col bg-gray-900 border-t border-gray-700 ${isResizing ? 'select-none' : ''}`}
      style={{ height: isCollapsed ? 'auto' : height }}
    >
      {/* Resize Handle */}
      {!isCollapsed && (
        <div
          className="h-1 bg-gray-700 hover:bg-accent cursor-ns-resize transition-colors"
          onMouseDown={handleResizeStart}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <Terminal size={14} className="text-accent" />
          <span className="text-xs font-semibold text-gray-300">Terminal Output</span>
          <span className="text-xs text-gray-500">({entries.length} entries)</span>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={onClear}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
            title="Clear Output"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={toggleCollapse}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            {isCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
              title="Close"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Output Area */}
      {!isCollapsed && (
        <div
          ref={outputRef}
          className="flex-1 overflow-y-auto font-mono text-xs p-2 space-y-1"
        >
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-start">
              <span className="text-gray-500 mr-2 shrink-0">
                [{formatTime(entry.timestamp)}]
              </span>
              <span className={`mr-2 shrink-0 ${getEntryColor(entry.type)}`}>
                {getEntryIcon(entry.type)}
              </span>
              <div className="flex-1">
                <span className={getEntryColor(entry.type)}>{entry.message}</span>
                {entry.details && (
                  <pre className="mt-1 p-2 bg-gray-800 rounded text-gray-400 whitespace-pre-wrap overflow-x-auto">
                    {entry.details}
                  </pre>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
