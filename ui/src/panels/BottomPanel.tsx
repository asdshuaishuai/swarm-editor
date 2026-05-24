import { useState, useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import TerminalPanel from './TerminalPanel'
import ProblemsPanel from './ProblemsPanel'
import { logger } from '../utils'

export default function BottomPanel() {
  const workspaceProblems = useAppStore(state => state.workspaceProblems)

  const [bottomTab, setBottomTab] = useState<'terminal' | 'problems' | 'output' | 'debug'>('terminal')
  const [showBottomPanel, setShowBottomPanel] = useState(true)
  const [bottomPanelHeight, setBottomPanelHeight] = useState(() => {
    try { const v = localStorage.getItem('bottomPanelHeight'); return v ? parseInt(v, 10) : 200 } catch { logger.debug('BottomPanel', 'localStorage read failed'); return 200 }
  })
  const [bottomPanelPreMaxHeight, setBottomPanelPreMaxHeight] = useState(200)
  const [isResizingBottom, setIsResizingBottom] = useState(false)

  // Persist panel height to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('bottomPanelHeight', String(bottomPanelHeight))
    } catch {
      logger.debug('BottomPanel', 'localStorage write failed')
    }
  }, [bottomPanelHeight])

  // Bottom panel resize handler (VS Code pattern — drag top edge to resize)
  useEffect(() => {
    if (!isResizingBottom) return

    const handleMouseMove = (e: MouseEvent) => {
      const container = document.querySelector('[data-editor-container]')
      if (!container) return
      const rect = container.getBoundingClientRect()
      const newHeight = Math.max(77, Math.min(rect.height - 100, rect.bottom - e.clientY))
      setBottomPanelHeight(newHeight)
    }

    const handleMouseUp = () => {
      setIsResizingBottom(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    const handleSelectStart = (e: Event) => e.preventDefault()

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('selectstart', handleSelectStart)
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('selectstart', handleSelectStart)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizingBottom])

  // Window events for bottom panel control
  useEffect(() => {
    const handleToggleTerminal = () => setShowBottomPanel(prev => !prev)
    const handleToggleBottomPanel = () => setShowBottomPanel(prev => !prev)
    const handleShowProblems = () => {
      setBottomTab('problems')
      setShowBottomPanel(true)
    }
    const handleToggleProblems = () => {
      setBottomTab(prev => prev === 'problems' ? 'terminal' : 'problems')
    }
    const handleToggleOutput = () => {
      setBottomTab(prev => {
        if (prev === 'output') {
          setShowBottomPanel(p => !p)
          return prev
        }
        setShowBottomPanel(true)
        return 'output'
      })
    }
    const handleToggleDebugConsole = () => {
      setBottomTab(prev => {
        if (prev === 'debug') {
          setShowBottomPanel(p => !p)
          return prev
        }
        setShowBottomPanel(true)
        return 'debug'
      })
    }

    window.addEventListener('toggle-terminal', handleToggleTerminal)
    window.addEventListener('toggle-bottom-panel', handleToggleBottomPanel)
    window.addEventListener('show-problems', handleShowProblems)
    window.addEventListener('toggle-problems', handleToggleProblems)
    window.addEventListener('toggle-output', handleToggleOutput)
    window.addEventListener('toggle-debug-console', handleToggleDebugConsole)

    return () => {
      window.removeEventListener('toggle-terminal', handleToggleTerminal)
      window.removeEventListener('toggle-bottom-panel', handleToggleBottomPanel)
      window.removeEventListener('show-problems', handleShowProblems)
      window.removeEventListener('toggle-problems', handleToggleProblems)
      window.removeEventListener('toggle-output', handleToggleOutput)
      window.removeEventListener('toggle-debug-console', handleToggleDebugConsole)
    }
  }, [])

  return (
    <>
      {/* Resize handle */}
      {showBottomPanel && (
        <div
          className={`h-1 cursor-row-resize transition-colors flex-shrink-0 ${isResizingBottom ? 'bg-accent/50' : 'hover:bg-accent/30'}`}
          onMouseDown={(e) => { e.preventDefault(); setIsResizingBottom(true) }}
          onDoubleClick={() => {
            const container = document.querySelector('[data-editor-container]')
            if (!container) return
            const rect = container.getBoundingClientRect()
            if (bottomPanelHeight >= rect.height - 100) {
              setBottomPanelHeight(bottomPanelPreMaxHeight)
            } else {
              setBottomPanelPreMaxHeight(bottomPanelHeight)
              setBottomPanelHeight(rect.height - 100)
            }
          }}
          title="Drag to resize, double-click to maximize/restore"
        />
      )}

      {/* Bottom Panel */}
      {showBottomPanel && (
        <div className="flex flex-col" style={{ height: `${bottomPanelHeight}px`, flexShrink: 0 }}>
          {/* Tab bar */}
          <div className="flex items-center gap-1 px-2 py-1 bg-mac-bg border-t border-glass-border text-xs">
            <button
              onClick={() => setBottomTab('problems')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded transition-colors ${
                bottomTab === 'problems' ? 'bg-surface text-text-primary' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <span>Problems</span>
              {workspaceProblems.length > 0 && (
                <span className={`px-1 rounded text-[10px] ${
                  workspaceProblems.some(p => p.severity === 'error') ? 'bg-error/20 text-error' : 'bg-warning/20 text-warning'
                }`}>
                  {workspaceProblems.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setBottomTab('terminal')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded transition-colors ${
                bottomTab === 'terminal' ? 'bg-surface text-text-primary' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <span>Terminal</span>
            </button>
            <button
              onClick={() => setBottomTab('output')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded transition-colors ${
                bottomTab === 'output' ? 'bg-surface text-text-primary' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <span>Output</span>
            </button>
            <button
              onClick={() => setBottomTab('debug')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded transition-colors ${
                bottomTab === 'debug' ? 'bg-surface text-text-primary' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <span>Debug Console</span>
            </button>
            <span className="ml-auto text-[10px] text-text-tertiary select-none" title="Ctrl+J or Shift+Escape to toggle">Ctrl+J</span>
          </div>
          {/* Tab content */}
          {bottomTab === 'problems' ? (
            <ProblemsPanel problems={workspaceProblems} />
          ) : bottomTab === 'output' ? (
            <div className="flex-1 flex flex-col items-center justify-center text-text-tertiary text-sm">
              <span className="opacity-60">Output panel coming soon</span>
              <span className="text-xs opacity-40 mt-1">Extension logs and task output will appear here</span>
            </div>
          ) : bottomTab === 'debug' ? (
            <div className="flex-1 flex flex-col items-center justify-center text-text-tertiary text-sm">
              <span className="opacity-60">Debug Console coming soon</span>
              <span className="text-xs opacity-40 mt-1">Debug session output will appear here</span>
            </div>
          ) : (
            <TerminalPanel />
          )}
        </div>
      )}
    </>
  )
}
