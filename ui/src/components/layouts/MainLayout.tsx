import { ReactNode, useState, useRef, useEffect } from 'react'
import { WorktreePanel } from '../../panels/WorktreePanel'
import { SupervisorPanel } from '../../panels/SupervisorPanel'
import { BottomTabPanel } from '../../panels/BottomTabPanel'

interface MainLayoutProps {
  children: ReactNode
}

export default function MainLayout({ children }: MainLayoutProps) {
  const [leftPanelWidth, setLeftPanelWidth] = useState(180)
  const [rightPanelWidth, setRightPanelWidth] = useState(280)
  const [bottomPanelHeight, setBottomPanelHeight] = useState(200)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [bottomCollapsed, setBottomCollapsed] = useState(false)

  // Store resize handlers in refs for proper cleanup on unmount
  const leftResizeMoveRef = useRef<((e: MouseEvent) => void) | null>(null)
  const leftResizeUpRef = useRef<(() => void) | null>(null)
  const rightResizeMoveRef = useRef<((e: MouseEvent) => void) | null>(null)
  const rightResizeUpRef = useRef<(() => void) | null>(null)
  const bottomResizeMoveRef = useRef<((e: MouseEvent) => void) | null>(null)
  const bottomResizeUpRef = useRef<(() => void) | null>(null)

  // Cleanup: remove any dangling resize listeners on unmount
  useEffect(() => {
    return () => {
      if (leftResizeMoveRef.current) document.removeEventListener('mousemove', leftResizeMoveRef.current)
      if (leftResizeUpRef.current) document.removeEventListener('mouseup', leftResizeUpRef.current)
      if (rightResizeMoveRef.current) document.removeEventListener('mousemove', rightResizeMoveRef.current)
      if (rightResizeUpRef.current) document.removeEventListener('mouseup', rightResizeUpRef.current)
      if (bottomResizeMoveRef.current) document.removeEventListener('mousemove', bottomResizeMoveRef.current)
      if (bottomResizeUpRef.current) document.removeEventListener('mouseup', bottomResizeUpRef.current)
    }
  }, [])

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0b] text-text-primary overflow-hidden">
      {/* Modern Title Bar */}
      <div className="h-8 bg-[#0f0f10] flex items-center px-3 border-b border-[#1f1f21] shrink-0">
        {/* Left: Panel Toggles */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setLeftCollapsed(!leftCollapsed)}
            className={`p-1 rounded transition-colors ${leftCollapsed ? 'bg-slate-700' : 'hover:bg-slate-800'}`}
            title="Toggle Worktree Panel"
            aria-label="Toggle Worktree Panel"
            aria-expanded={!leftCollapsed}
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>
        </div>

        {/* Center: App Title */}
        <div className="flex-1 text-center">
          <span className="text-xs text-slate-400 font-medium tracking-wide">Swarm Editor</span>
        </div>

        {/* Right: Supervisor Toggle */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setBottomCollapsed(!bottomCollapsed)}
            className={`p-1 rounded transition-colors ${bottomCollapsed ? 'bg-slate-700' : 'hover:bg-slate-800'}`}
            title="Toggle Bottom Panel"
            aria-label="Toggle Bottom Panel"
            aria-expanded={!bottomCollapsed}
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            onClick={() => setRightCollapsed(!rightCollapsed)}
            className={`p-1 rounded transition-colors ${rightCollapsed ? 'bg-slate-700' : 'hover:bg-slate-800'}`}
            title="Toggle Supervisor Panel"
            aria-label="Toggle Supervisor Panel"
            aria-expanded={!rightCollapsed}
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Worktree Panel */}
        <div
          className={`transition-all duration-300 ease-in-out shrink-0 ${
            leftCollapsed ? 'w-0' : ''
          }`}
          style={{ width: leftCollapsed ? 0 : leftPanelWidth }}
        >
          {!leftCollapsed && (
            <div className="h-full relative group">
              <WorktreePanel />
              {/* Resize Handle */}
              <div
                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors opacity-0 group-hover:opacity-100"
                onMouseDown={(e) => {
                  const startX = e.clientX
                  const startWidth = leftPanelWidth

                  const handleMouseMove = (ev: MouseEvent) => {
                    const newWidth = Math.max(150, Math.min(400, startWidth + (ev.clientX - startX)))
                    setLeftPanelWidth(newWidth)
                  }
                  const handleMouseUp = () => {
                    if (leftResizeMoveRef.current) {
                      document.removeEventListener('mousemove', leftResizeMoveRef.current)
                      leftResizeMoveRef.current = null
                    }
                    if (leftResizeUpRef.current) {
                      document.removeEventListener('mouseup', leftResizeUpRef.current)
                      leftResizeUpRef.current = null
                    }
                  }

                  leftResizeMoveRef.current = handleMouseMove
                  leftResizeUpRef.current = handleMouseUp
                  document.addEventListener('mousemove', handleMouseMove)
                  document.addEventListener('mouseup', handleMouseUp)
                }}
              />
            </div>
          )}
        </div>

        {/* Center: Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden border-x border-[#1f1f21]">
          {/* Editor Area */}
          <div className="flex-1 overflow-hidden">
            <main className="h-full overflow-hidden">
              {children}
            </main>
          </div>
        </div>

        {/* Right: Supervisor Panel */}
        <div
          className={`transition-all duration-300 ease-in-out shrink-0 ${
            rightCollapsed ? 'w-0' : ''
          }`}
          style={{ width: rightCollapsed ? 0 : rightPanelWidth }}
        >
          {!rightCollapsed && (
            <div className="h-full relative group">
              <SupervisorPanel />
              {/* Resize Handle */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors opacity-0 group-hover:opacity-100"
                onMouseDown={(e) => {
                  const startX = e.clientX
                  const startWidth = rightPanelWidth

                  const handleMouseMove = (ev: MouseEvent) => {
                    const newWidth = Math.max(200, Math.min(500, startWidth - (ev.clientX - startX)))
                    setRightPanelWidth(newWidth)
                  }
                  const handleMouseUp = () => {
                    if (rightResizeMoveRef.current) {
                      document.removeEventListener('mousemove', rightResizeMoveRef.current)
                      rightResizeMoveRef.current = null
                    }
                    if (rightResizeUpRef.current) {
                      document.removeEventListener('mouseup', rightResizeUpRef.current)
                      rightResizeUpRef.current = null
                    }
                  }

                  rightResizeMoveRef.current = handleMouseMove
                  rightResizeUpRef.current = handleMouseUp
                  document.addEventListener('mousemove', handleMouseMove)
                  document.addEventListener('mouseup', handleMouseUp)
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Tab Panel (Agents + Console) */}
      {!bottomCollapsed && (
        <div
          className="transition-all duration-300 ease-in-out shrink-0"
          style={{ height: bottomPanelHeight }}
        >
          <div className="h-full relative group">
            <BottomTabPanel height={bottomPanelHeight} />
            {/* Resize Handle */}
            <div
              className="absolute top-0 left-0 right-0 h-1 cursor-row-resize hover:bg-blue-500/50 transition-colors opacity-0 group-hover:opacity-100"
              onMouseDown={(e) => {
                const startY = e.clientY
                const startHeight = bottomPanelHeight

                const handleMouseMove = (ev: MouseEvent) => {
                  const newHeight = Math.max(100, Math.min(500, startHeight - (ev.clientY - startY)))
                  setBottomPanelHeight(newHeight)
                }
                const handleMouseUp = () => {
                  if (bottomResizeMoveRef.current) {
                    document.removeEventListener('mousemove', bottomResizeMoveRef.current)
                    bottomResizeMoveRef.current = null
                  }
                  if (bottomResizeUpRef.current) {
                    document.removeEventListener('mouseup', bottomResizeUpRef.current)
                    bottomResizeUpRef.current = null
                  }
                }

                bottomResizeMoveRef.current = handleMouseMove
                bottomResizeUpRef.current = handleMouseUp
                document.addEventListener('mousemove', handleMouseMove)
                document.addEventListener('mouseup', handleMouseUp)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}