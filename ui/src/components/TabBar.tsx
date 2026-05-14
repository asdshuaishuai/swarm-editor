import React, { useRef, useEffect, useState, useCallback } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { EditorTab } from './EditorTab'
import { useMenuKeyboardNav } from '../hooks/useMenuKeyboardNav'

interface TabBarProps {
  openFiles: string[]
  currentFile: string | null
  dirtyFiles: Set<string>
  pinnedFiles: Set<string>
  previewTab?: string | null
  onTabClick: (path: string) => void
  onTabClose: (path: string) => void
  onTabContextMenu?: (e: React.MouseEvent, path: string) => void
  onCloseAll?: () => void
  onCloseOthers?: () => void
  onCloseSaved?: () => void
  onCloseToLeft?: () => void
  onCloseToRight?: () => void
  onReorder?: (fromIndex: number, toIndex: number) => void
  paneId?: string // Which pane this TabBar belongs to (for cross-pane drag)
  onDragStart?: (paneId: string, path: string) => void // Notify parent of drag start
  onKeyDown?: (e: React.KeyboardEvent, path: string) => void // P1: keyboard navigation
  onRename?: (path: string) => void // R5098: Double-click to rename
 }

export function TabBar({ openFiles, currentFile, dirtyFiles, pinnedFiles, previewTab, onTabClick, onTabClose, onTabContextMenu, onCloseAll, onCloseOthers, onCloseSaved, onCloseToLeft, onCloseToRight, onReorder, paneId = 'main', onDragStart, onKeyDown, onRename }: TabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showTabMenu, setShowTabMenu] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragImageRef = useRef<HTMLImageElement | null>(null)

  // Scroll active tab into view
  useEffect(() => {
    if (currentFile && scrollRef.current) {
      const activeTab = scrollRef.current.querySelector(`[data-path="${CSS.escape(currentFile)}"]`)
      activeTab?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [currentFile])

  const handleDragStart = useCallback((e: React.DragEvent, index: number, path: string) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    // Pass both index (for within-pane reorder) and path (for cross-pane transfer)
    e.dataTransfer.setData('application/json', JSON.stringify({ index, path, paneId }))
    e.dataTransfer.setData('text/plain', path) // Fallback
    // Notify parent of drag start (for cross-pane drop zones)
    onDragStart?.(paneId, path)
    // Create transparent drag image once and reuse
    if (!dragImageRef.current) {
      const img = new Image()
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
      dragImageRef.current = img
    }
    e.dataTransfer.setDragImage(dragImageRef.current, 0, 0)
  }, [paneId, onDragStart])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragIndex !== null && dragIndex !== index) {
      setDragOverIndex(index)
    }
  }, [dragIndex])

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, toIndex: number) => {
    e.preventDefault()
    setDragOverIndex(null)
    if (dragIndex !== null && dragIndex !== toIndex) {
      onReorder?.(dragIndex, toIndex)
    }
    setDragIndex(null)
  }, [dragIndex, onReorder])

  const handleDragEnd = useCallback(() => {
    setDragIndex(null)
    setDragOverIndex(null)
  }, [])

  const tabMenuRef = useRef<HTMLDivElement>(null)
  const menuKeyDown = useMenuKeyboardNav(tabMenuRef, () => setShowTabMenu(false))

  // P1: Keyboard navigation handler (VS Code/Cursor pattern)
  const handleTabKeyDown = useCallback((e: React.KeyboardEvent, path: string, index: number) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const direction = e.key === 'ArrowLeft' ? -1 : 1
      // VS Code: ArrowLeft/Right does NOT wrap — stops at first/last tab
      const newIndex = index + direction
      if (newIndex < 0 || newIndex >= openFiles.length) return
      const newPath = openFiles[newIndex]
      onTabClick(newPath)
      // Focus the new tab after navigation
      setTimeout(() => {
        const tabElement = scrollRef.current?.querySelector(`[data-path="${CSS.escape(newPath)}"]`)
        ;(tabElement as HTMLElement)?.focus()
      }, 0)
    } else if (e.key === 'Home') {
      // P2: Home key - go to first tab
      e.preventDefault()
      const firstPath = openFiles[0]
      onTabClick(firstPath)
      setTimeout(() => {
        const tabElement = scrollRef.current?.querySelector(`[data-path="${CSS.escape(firstPath)}"]`)
        ;(tabElement as HTMLElement)?.focus()
      }, 0)
    } else if (e.key === 'End') {
      // P2: End key - go to last tab
      e.preventDefault()
      const lastPath = openFiles[openFiles.length - 1]
      onTabClick(lastPath)
      setTimeout(() => {
        const tabElement = scrollRef.current?.querySelector(`[data-path="${CSS.escape(lastPath)}"]`)
        ;(tabElement as HTMLElement)?.focus()
      }, 0)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onTabClick(path)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      // P1 fix: Don't close pinned tabs via keyboard
      if (!pinnedFiles.has(path)) {
        e.preventDefault()
        onTabClose(path)
      }
    }
    onKeyDown?.(e, path)
  }, [openFiles, pinnedFiles, onTabClick, onTabClose, onKeyDown])

  if (openFiles.length === 0) return null

  return (
    <div className="flex items-center bg-panel-bg/50 border-b border-glass-border" role="tablist" aria-label="Editor tabs">
      {/* R5098: Tab scroll left button - VS Code pattern */}
      <button
        onClick={() => { if (scrollRef.current) scrollRef.current.scrollLeft -= 100 }}
        className="px-1 py-1 text-text-tertiary hover:text-text-primary hover:bg-card-hover transition-colors flex-shrink-0"
        title="Scroll tabs left"
        aria-label="Scroll tabs left"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 2L4 6L8 10" />
        </svg>
      </button>
      {/* Tab strip */}
      <div
        ref={scrollRef}
        className="flex-1 flex items-center overflow-x-auto"
        style={{ scrollbarWidth: 'thin' }}
        onWheel={(e) => {
          if (scrollRef.current) {
            scrollRef.current.scrollLeft += e.deltaY
          }
        }}
      >
        {openFiles.map((path, index) => {
          const isPinned = pinnedFiles.has(path)
          // Show separator between pinned and unpinned sections
          const showSeparator = index > 0 && isPinned !== pinnedFiles.has(openFiles[index - 1])
          return (
            <React.Fragment key={path}>
              {showSeparator && (
                <div className="w-px h-4 bg-glass-border mx-0.5 flex-shrink-0" />
              )}
              <div
                data-path={path}
                role="tab"
                aria-selected={currentFile === path}
                aria-label={path.split('/').pop() || path}
                title={path}
                tabIndex={currentFile === path ? 0 : -1}
                onKeyDown={(e) => handleTabKeyDown(e, path, index)}
                draggable
                onDragStart={(e) => handleDragStart(e, index, path)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={`relative flex items-center ${dragIndex === index ? 'opacity-50' : ''} ${dragOverIndex === index && dragIndex !== null ? (dragIndex < index ? 'border-l-2 border-l-accent' : 'border-r-2 border-r-accent') : ''}`}
              >
                <EditorTab
                  path={path}
                  isActive={currentFile === path}
                  isDirty={dirtyFiles.has(path)}
                  isPinned={isPinned}
                  isPreview={previewTab === path && !isPinned}
                  onClick={() => onTabClick(path)}
                  onClose={() => onTabClose(path)}
                  onContextMenu={onTabContextMenu}
                  onDoubleClick={onRename ? () => onRename(path) : undefined}
                />
              </div>
            </React.Fragment>
          )
        })}
      </div>
      {/* R5098: Tab scroll right button - VS Code pattern */}
      <button
        onClick={() => { if (scrollRef.current) scrollRef.current.scrollLeft += 100 }}
        className="px-1 py-1 text-text-tertiary hover:text-text-primary hover:bg-card-hover transition-colors flex-shrink-0"
        title="Scroll tabs right"
        aria-label="Scroll tabs right"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 2L8 6L4 10" />
        </svg>
      </button>
      {/* Tab actions - VS Code/Cursor pattern */}
      {openFiles.length > 1 && (
        <div className="relative">
          <button
            onClick={() => setShowTabMenu(prev => !prev)}
            className="px-2 py-1 text-xs text-text-tertiary hover:text-text-primary hover:bg-card-hover transition-colors"
            title="Tab Actions"
            aria-label="Tab actions menu"
            aria-haspopup="menu"
            aria-expanded={showTabMenu}
          >
            <MoreHorizontal size={12} />
          </button>
          {showTabMenu && (
            <div
              ref={tabMenuRef}
              role="menu"
              aria-label="Tab actions"
              className="absolute right-0 top-full z-50 bg-mac-panel/95 border border-glass-border rounded-mac shadow-mac py-1 min-w-40 backdrop-blur-xl"
              onKeyDown={menuKeyDown}
            >
              <button
                role="menuitem"
                onClick={() => { onCloseOthers?.(); setShowTabMenu(false) }}
                className="w-full text-left px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
                title="Close all tabs except this one"
              >
                Close Others
              </button>
              <button
                role="menuitem"
                onClick={() => { onCloseToLeft?.(); setShowTabMenu(false) }}
                className="w-full text-left px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
                title="Close tabs to the left of this one"
              >
                Close to Left
              </button>
              <button
                role="menuitem"
                onClick={() => { onCloseToRight?.(); setShowTabMenu(false) }}
                className="w-full text-left px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
                title="Close tabs to the right of this one"
              >
                Close to Right
              </button>
              <button
                role="menuitem"
                onClick={() => { onCloseSaved?.(); setShowTabMenu(false) }}
                className="w-full text-left px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
                title="Close all tabs without unsaved changes"
              >
                Close Saved
              </button>
              <div className="my-1 border-t border-glass-border" role="separator" />
              <button
                role="menuitem"
                onClick={() => { onCloseAll?.(); setShowTabMenu(false) }}
                className="w-full text-left px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
                title="Close all open tabs"
              >
                Close All
              </button>
            </div>
          )}
        </div>
      )}
      {/* Click outside to close menu */}
      {showTabMenu && <div className="fixed inset-0 z-40" onClick={() => setShowTabMenu(false)} aria-hidden="true" />}
    </div>
  )
}
