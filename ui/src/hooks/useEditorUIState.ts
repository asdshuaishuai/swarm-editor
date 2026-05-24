import { useState, useEffect, useRef } from 'react'
import type { FileEntry } from '../services'
import { logger } from '../utils'

export function useEditorUIState() {
  const [showFileTree, setShowFileTree] = useState(true)
  const [activityView, setActivityView] = useState<'explorer' | 'search' | 'sourceControl' | 'outline'>('explorer')
  const [fileTree, setFileTree] = useState<FileEntry[]>([])
  const [workspace, setWorkspace] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [diffView, setDiffView] = useState<{ original: string; modified: string; language: string; filePath: string } | null>(null)
  const [showAgentSelector, setShowAgentSelector] = useState(false)
  const [showAccessibilityHelp, setShowAccessibilityHelp] = useState(false)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [dirtyClosePath, setDirtyClosePath] = useState<string | null>(null)

  // Resizable sidebar (VS Code pattern — drag edge to resize, persisted to localStorage)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try { const v = localStorage.getItem('sidebarWidth'); return v ? parseInt(v, 10) : 208 } catch { logger.debug('useEditorUIState', 'localStorage read failed'); return 208 }
  })
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)

  // Persist sidebar width to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('sidebarWidth', String(sidebarWidth))
    } catch {
      logger.debug('useEditorUIState', 'localStorage write failed')
    }
  }, [sidebarWidth])

  // Sidebar resize handler (VS Code pattern — drag edge to resize)
  useEffect(() => {
    if (!isResizingSidebar) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(170, Math.min(500, e.clientX - 48))
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizingSidebar(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    const handleSelectStart = (e: Event) => e.preventDefault()

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('selectstart', handleSelectStart)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('selectstart', handleSelectStart)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizingSidebar])

  // Tab context menu state (VS Code/Cursor pattern)
  const [tabContextMenu, setTabContextMenu] = useState<{
    visible: boolean
    x: number
    y: number
    path: string | null
  }>({ visible: false, x: 0, y: 0, path: null })
  const tabContextMenuRef = useRef<HTMLDivElement>(null)

  // Cross-pane tab drag state (VS Code/Cursor pattern - P1 feature)
  const [draggedTab, setDraggedTab] = useState<{ paneId: string; path: string } | null>(null)
  const [dropTargetPane, setDropTargetPane] = useState<string | null>(null)

  // Clear drag state on dragend (cross-pane drag support)
  useEffect(() => {
    const handleDragEnd = () => {
      setDraggedTab(null)
      setDropTargetPane(null)
    }
    window.addEventListener('dragend', handleDragEnd)
    return () => window.removeEventListener('dragend', handleDragEnd)
  }, [])

  // Clamp tab context menu to viewport
  useEffect(() => {
    if (!tabContextMenu.visible || !tabContextMenuRef.current) return
    const rect = tabContextMenuRef.current.getBoundingClientRect()
    const menu = tabContextMenuRef.current
    if (rect.right > window.innerWidth) {
      menu.style.left = `${window.innerWidth - rect.width - 8}px`
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${window.innerHeight - rect.height - 8}px`
    }
  }, [tabContextMenu.visible, tabContextMenu.x, tabContextMenu.y, tabContextMenuRef])

  return {
    showFileTree, setShowFileTree,
    activityView, setActivityView,
    fileTree, setFileTree,
    workspace, setWorkspace,
    loading, setLoading,
    diffView, setDiffView,
    showAgentSelector, setShowAgentSelector,
    showAccessibilityHelp, setShowAccessibilityHelp,
    expandedDirs, setExpandedDirs,
    dirtyClosePath, setDirtyClosePath,
    sidebarWidth, setSidebarWidth,
    isResizingSidebar, setIsResizingSidebar,
    tabContextMenu, setTabContextMenu,
    tabContextMenuRef,
    draggedTab, setDraggedTab,
    dropTargetPane, setDropTargetPane,
  }
}
