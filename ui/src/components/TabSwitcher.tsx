import { useState, useEffect, useRef, useCallback } from 'react'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { getFileIcon, getFileIconColor, logger } from '../utils'

// Tab focus mode state (module-level, shared across components)
let tabMovesFocus = false
const tabFocusListeners = new Set<() => void>()

export function setTabMovesFocus(value: boolean) {
  tabMovesFocus = value
  document.documentElement.dataset.tabMovesFocus = value ? 'true' : ''
  tabFocusListeners.forEach(fn => fn())
}

export function getTabMovesFocus(): boolean {
  return tabMovesFocus
}

export function onTabFocusModeChange(fn: () => void): () => void {
  tabFocusListeners.add(fn)
  return () => tabFocusListeners.delete(fn)
}

/**
 * Ctrl+Tab Tab Switcher overlay — VS Code pattern.
 * Shows a list of open tabs. Hold Ctrl+Tab to cycle forward, Ctrl+Shift+Tab for reverse.
 * Release Ctrl to switch to the selected tab.
 *
 * Key Insight #42: VS Code's tab switcher is an overlay, not a modal. It appears on
 * Ctrl+Tab, cycles through open tabs while Ctrl is held, and activates on keyup of Ctrl.
 * This is the standard "quick switch" pattern used by all major IDEs.
 *
 * Key Insight #44: Ctrl+M toggles Tab key behavior between inserting a tab character
 * and moving focus to the next UI element. This is a WCAG 2.1 essential pattern —
 * without it, keyboard-only users cannot Tab out of the editor. When active, the
 * Tab key is intercepted at the capture phase and prevented from reaching the editor.
 *
 * Key Insight #45: Ctrl+Shift+PgUp/PgDn moves the active tab left/right in the tab bar.
 * This is a VS Code standard for reorganizing tabs without a mouse. The reorderFiles
 * store method handles the actual array mutation.
 */
export function TabSwitcher() {
  const [visible, setVisible] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const ctrlHeldRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Use ref for values needed in capture handlers to avoid stale closures
  const visibleRef = useRef(visible)
  const selectedIndexRef = useRef(selectedIndex)

  // Update refs after render to avoid ESLint warning
  useEffect(() => {
    visibleRef.current = visible
    selectedIndexRef.current = selectedIndex
  }, [visible, selectedIndex])

  const openFiles = useWorkspaceStore(state => state.openFiles)
  const mruOrder = useWorkspaceStore(state => state.mruOrder)
  const currentFile = useWorkspaceStore(state => state.currentFile)
  const dirtyFiles = useWorkspaceStore(state => state.dirtyFiles)
  const pinnedFiles = useWorkspaceStore(state => state.pinnedFiles)
  const openFile = useWorkspaceStore(state => state.openFile)
  const closeFile = useWorkspaceStore(state => state.closeFile)
  const reorderFiles = useWorkspaceStore(state => state.reorderFiles)

  const openFileRef = useRef(openFile)
  const closeFileRef = useRef(closeFile)
  const reorderFilesRef = useRef(reorderFiles)

  // Update refs after render to avoid ESLint warning
  useEffect(() => {
    openFileRef.current = openFile
    closeFileRef.current = closeFile
    reorderFilesRef.current = reorderFiles
  }, [openFile, closeFile, reorderFiles])

  useEffect(() => {
    visibleRef.current = visible
    selectedIndexRef.current = selectedIndex
  }, [visible, selectedIndex])

  // File-type icon helper (shared utility)
  const getIcon = useCallback((filename: string) => getFileIcon(filename), [])
  const getIconColor = useCallback((filename: string) => getFileIconColor(filename), [])

  // Single stable capture handler — reads current state from refs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape: dismiss tab switcher overlay
      if (e.key === 'Escape' && visibleRef.current) {
        e.preventDefault()
        e.stopPropagation()
        ctrlHeldRef.current = false
        setVisible(false)
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
        return
      }

      // Ctrl+Tab: show and cycle forward (VS Code MRU pattern)
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        ctrlHeldRef.current = true

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }

        const allFiles = useWorkspaceStore.getState().openFiles
        const mruOrder = useWorkspaceStore.getState().mruOrder
        const cur = useWorkspaceStore.getState().currentFile
        // MRU order: most recently used files first, filtered to currently open files
        // Fallback to openFiles order if MRU is empty (first launch)
        const mruFiltered = mruOrder.filter(p => allFiles.includes(p))
        const files = mruFiltered.length > 0 ? mruFiltered : allFiles

        if (!visibleRef.current) {
          setVisible(true)
          const currentIdx = files.indexOf(cur || '')
          const nextIdx = e.shiftKey
            ? (currentIdx - 1 + files.length) % files.length
            : (currentIdx + 1) % files.length
          setSelectedIndex(nextIdx)
        } else {
          setSelectedIndex(prev => {
            const next = e.shiftKey
              ? (prev - 1 + files.length) % files.length
              : (prev + 1) % files.length
            return next
          })
        }
        return
      }

      // Ctrl+W: close current tab (when switcher not visible)
      if (e.ctrlKey && e.key === 'w' && !visibleRef.current) {
        e.preventDefault()
        e.stopPropagation()
        const cur = useWorkspaceStore.getState().currentFile
        const pinned = useWorkspaceStore.getState().pinnedFiles
        const dirty = useWorkspaceStore.getState().dirtyFiles
        if (cur && !pinned.has(cur)) {
          if (dirty.has(cur)) {
            // Delegate dirty check to EditorPanel's handleCloseCurrentTab
            window.dispatchEvent(new CustomEvent('close-current-tab'))
          } else {
            closeFileRef.current(cur)
          }
        }
        return
      }

      // Ctrl+Shift+T: Reopen last closed tab (VS Code pattern)
      if (e.ctrlKey && e.shiftKey && e.key === 'T' && !visibleRef.current) {
        e.preventDefault()
        e.stopPropagation()
        useWorkspaceStore.getState().undoCloseFile().catch((e) => { logger.warn('TabSwitcher', 'Failed to reopen tab', e) })
        return
      }

      // Ctrl+M: Toggle Tab Moves Focus (VS Code pattern, WCAG 2.1 essential)
      if (e.ctrlKey && e.key === 'm') {
        e.preventDefault()
        setTabMovesFocus(!tabMovesFocus)
        return
      }

      // Navigate Back: Ctrl+Alt+Left (VS Code pattern — Ctrl+- conflicts with zoom)
      if (e.ctrlKey && e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        window.history.back()
        return
      }

      // Navigate Forward: Ctrl+Alt+Right (VS Code pattern)
      if (e.ctrlKey && e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        window.history.forward()
        return
      }

      // Shift+Escape: Toggle bottom panel (Zed/Windsurf pattern)
      // Don't fire if a modal/dialog is open — let the modal handle Escape first
      if (e.shiftKey && e.key === 'Escape' && !document.querySelector('[role="dialog"]')) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('toggle-bottom-panel'))
        return
      }

      // Ctrl+1: Focus first editor group (VS Code pattern)
      if (e.ctrlKey && e.key === '1') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('focus-editor-group', { detail: { group: 1 } }))
        return
      }

      // Ctrl+2: Focus second editor group (VS Code pattern)
      if (e.ctrlKey && e.key === '2') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('focus-editor-group', { detail: { group: 2 } }))
        return
      }

      // Ctrl+PageUp/PageDown: Switch to previous/next tab (VS Code pattern — no wrap)
      if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'PageUp' || e.key === 'PageDown')) {
        e.preventDefault()
        const files = useWorkspaceStore.getState().openFiles
        const cur = useWorkspaceStore.getState().currentFile
        if (!cur || files.length <= 1) return
        const idx = files.indexOf(cur)
        if (idx === -1) return
        // VS Code: Ctrl+PageUp/PageDown does NOT wrap — stops at first/last tab
        const newIdx = e.key === 'PageUp' ? idx - 1 : idx + 1
        if (newIdx < 0 || newIdx >= files.length) return
        useWorkspaceStore.getState().openFile(files[newIdx]).catch((e) => { logger.warn('TabSwitcher', 'Failed to open tab', e) })
        return
      }

      // Alt+1-9: Jump to tab N (VS Code pattern)
      if (e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
        const tabNum = parseInt(e.key, 10)
        if (tabNum >= 1 && tabNum <= 9) {
          e.preventDefault()
          const files = useWorkspaceStore.getState().openFiles
          if (tabNum <= files.length) {
            useWorkspaceStore.getState().openFile(files[tabNum - 1]).catch((e) => { logger.warn('TabSwitcher', 'Failed to open tab', e) })
          }
          return
        }
      }

      // Ctrl+Shift+PageUp/PageDown: Move tab left/right (VS Code pattern)
      if (e.ctrlKey && e.shiftKey && (e.key === 'PageUp' || e.key === 'PageDown')) {
        e.preventDefault()
        const files = useWorkspaceStore.getState().openFiles
        const cur = useWorkspaceStore.getState().currentFile
        if (!cur) return
        const idx = files.indexOf(cur)
        if (idx === -1) return
        if (e.key === 'PageUp' && idx > 0) {
          reorderFilesRef.current(idx, idx - 1)
        } else if (e.key === 'PageDown' && idx < files.length - 1) {
          reorderFilesRef.current(idx, idx + 1)
        }
        return
      }

      // When tabMovesFocus is active, intercept Tab to prevent editor from consuming it
      if (tabMovesFocus && e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const target = e.target as HTMLElement
        if (target.closest('.cm-editor')) {
          e.preventDefault()
          e.stopPropagation()
          // Find all focusable elements and move focus to next/prev outside editor
          const allFocusable = Array.from(document.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          ))
          const currentIdx = allFocusable.indexOf(target)
          if (currentIdx === -1) return

          const direction = e.shiftKey ? -1 : 1
          for (let i = 1; i < allFocusable.length; i++) {
            const checkIdx = ((currentIdx + i * direction) % allFocusable.length + allFocusable.length) % allFocusable.length
            if (!allFocusable[checkIdx].closest('.cm-editor')) {
              allFocusable[checkIdx].focus()
              return
            }
          }
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' && ctrlHeldRef.current) {
        ctrlHeldRef.current = false

        if (visibleRef.current) {
          const allFiles = useWorkspaceStore.getState().openFiles
          const mruOrder = useWorkspaceStore.getState().mruOrder
          const cur = useWorkspaceStore.getState().currentFile
          // Same fallback logic as keydown handler
          const mruFiltered = mruOrder.filter(p => allFiles.includes(p))
          const files = mruFiltered.length > 0 ? mruFiltered : allFiles
          const targetPath = files[selectedIndexRef.current]
          if (targetPath && targetPath !== cur) {
            openFileRef.current(targetPath)
          }
          setVisible(false)
        }
      }
    }

    // All handlers in capture phase to reliably beat editor Tab handling
    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('keyup', handleKeyUp)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('keyup', handleKeyUp)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, []) // Stable — reads current state via refs and useWorkspaceStore.getState()

  // MRU order for display: most recently used first, filtered to currently open files
  // Fallback to openFiles order if MRU is empty (first launch)
  const mruFiles = mruOrder.filter(p => openFiles.includes(p))
  const displayFiles = mruFiles.length > 0 ? mruFiles : openFiles

  if (!visible || openFiles.length === 0) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[20vh] bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-label="Open editors"
      aria-modal="true"
    >
      <div className="w-[500px] max-h-[50vh] bg-mac-panel/95 border border-glass-border rounded-mac shadow-mac backdrop-blur-xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-2 border-b border-glass-border text-xs text-text-tertiary font-medium">
          Open Editors ({openFiles.length})
        </div>
        {/* Tab list */}
        <ul
          role="listbox"
          aria-label="Open editors"
          className="py-1 overflow-y-auto max-h-[40vh]"
        >
          {displayFiles.map((path, index) => {
            const filename = path.split('/').pop() || path
            const dirPath = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : ''
            const Icon = getIcon(filename)
            const iconColor = getIconColor(filename)
            const isActive = path === currentFile
            const isDirty = dirtyFiles.has(path)
            const isPinned = pinnedFiles.has(path)
            const isSelected = index === selectedIndex

            return (
              <li
                key={path}
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                className={`flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-accent/20 text-text-primary'
                    : isActive
                      ? 'bg-card-hover/50 text-text-primary'
                      : 'text-text-secondary hover:bg-card-hover/30'
                }`}
              >
                <Icon size={16} className={`flex-shrink-0 ${iconColor}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm truncate">{filename}</span>
                    {isDirty && (
                      <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" title="Unsaved changes" />
                    )}
                    {isPinned && (
                      <span className="text-[10px] text-text-tertiary flex-shrink-0" title="Pinned">&#x1F4CC;</span>
                    )}
                  </div>
                  {dirPath && (
                    <div className="text-[11px] text-text-tertiary truncate">{dirPath}</div>
                  )}
                </div>
                {isSelected && (
                  <span className="text-[10px] text-accent flex-shrink-0">Ctrl released to open</span>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
