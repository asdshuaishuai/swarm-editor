import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useSplitPaneStore } from '../stores/splitPaneStore'
import { fsApi, gitBlameApi, type BlameLine } from '../services/api'
import { logger } from '../utils'
import { TabBar } from '../components/TabBar'
import { BreadcrumbsBar } from '../components/BreadcrumbsBar'
import { WelcomePanel } from '../components/WelcomePanel'
import { DirtyCloseDialog } from '../components/DirtyCloseDialog'
import { TabContextMenu } from '../components/TabContextMenu'
import { CodeMirrorPane, type CodeMirrorPaneRef } from '../components/CodeMirrorPane'
import { ExternalModPrompt } from '../components/ExternalModPrompt'
import { BlameSidebar } from '../components/BlameSidebar'
import DiffView from '../components/DiffView'
import { useTabContextMenu } from '../hooks/useTabContextMenu'
import { useEditorSettings } from '../hooks/useEditorSettings'

// Diff state — when set, DiffView replaces the normal editor
interface DiffState {
  path: string
  original: string
  modified: string
}

interface EditorPanelProps {
  embedded?: boolean
}

export default function EditorPanel(_props?: EditorPanelProps) {
  // Store selectors
  const addToast = useAppStore(state => state.addToast)
  const openFiles = useWorkspaceStore(state => state.openFiles)
  const currentFile = useWorkspaceStore(state => state.currentFile)
  const fileContents = useWorkspaceStore(state => state.fileContents)
  const dirtyFiles = useWorkspaceStore(state => state.dirtyFiles)
  const pinnedFiles = useWorkspaceStore(state => state.pinnedFiles)
  const previewTab = useWorkspaceStore(state => state.previewTab)
  const openFileFromStore = useWorkspaceStore(state => state.openFile)
  const closeFile = useWorkspaceStore(state => state.closeFile)
  const closeAllFiles = useWorkspaceStore(state => state.closeAllFiles)
  const closeOthers = useWorkspaceStore(state => state.closeOthers)
  const closeToLeft = useWorkspaceStore(state => state.closeToLeft)
  const closeToRight = useWorkspaceStore(state => state.closeToRight)
  const closeSaved = useWorkspaceStore(state => state.closeSaved)
  const reorderFiles = useWorkspaceStore(state => state.reorderFiles)
  const undoCloseFile = useWorkspaceStore(state => state.undoCloseFile)
  const togglePin = useWorkspaceStore(state => state.togglePin)
  const updateFileContent = useWorkspaceStore(state => state.updateFileContent)
  const clearDirty = useWorkspaceStore(state => state.clearDirty)
  const workspacePath = useWorkspaceStore(state => state.workspacePath)
  const setWorkspacePath = useWorkspaceStore(state => state.setWorkspacePath)
  const externalModifications = useWorkspaceStore(state => state.externalModifications)
  const clearExternalModification = useWorkspaceStore(state => state.clearExternalModification)
  const subscribeToFileChanges = useWorkspaceStore(state => state.subscribeToFileChanges)

  const splitDirection = useSplitPaneStore(s => s.splitDirection)
  const activePaneId = useSplitPaneStore(s => s.activePaneId)
  const setActivePane = useSplitPaneStore(s => s.setActivePane)
  const toggleSplit = useSplitPaneStore(s => s.toggleSplit)
  const closeSplit = useSplitPaneStore(s => s.closeSplit)
  const paneFiles = useSplitPaneStore(s => s.paneFiles)
  const setPaneFile = useSplitPaneStore(s => s.setPaneFile)

  // Local UI state
  const [dirtyClosePath, setDirtyClosePath] = useState<string | null>(null)
  const [tabContextMenu, setTabContextMenu] = useState<{
    visible: boolean
    x: number
    y: number
    path: string | null
  }>({ visible: false, x: 0, y: 0, path: null })
  const tabContextMenuRef = useRef<HTMLDivElement>(null)
  const [draggedTab, setDraggedTab] = useState<{ paneId: string; path: string } | null>(null)
  const [dropTargetPane, setDropTargetPane] = useState<string | null>(null)
  const [diffState, setDiffState] = useState<DiffState | null>(null)

  // Git blame state
  const [blameEnabled, setBlameEnabled] = useState(false)
  const [blameLines, setBlameLines] = useState<BlameLine[]>([])
  const blameMountedRef = useRef(true)

  // Editor refs
  const mainEditorRef = useRef<CodeMirrorPaneRef>(null)
  const secondaryEditorRef = useRef<CodeMirrorPaneRef>(null)
  const mountedRef = useRef(true)

  // Editor settings hook — reads from localStorage, applies to CM6 via Compartments
  const { settings: editorSettings, registerAutoSave } = useEditorSettings()

  // Register auto-save callback so the hook can trigger saves periodically
  useEffect(() => {
    registerAutoSave(() => {
      // Only auto-save if there is a dirty file open
      const { currentFile: cf, dirtyFiles: df, fileContents: fc } = useWorkspaceStore.getState()
      if (cf && df.has(cf)) {
        const content = fc.get(cf)
        if (content !== undefined) {
          fsApi.writeFile(cf, content).then(() => {
            clearDirty(cf)
          }).catch((err) => {
            logger.error('Editor', 'Auto-save failed:', err)
          })
        }
      }
    })
  }, [registerAutoSave, clearDirty])
  // Derived state
  const code = currentFile ? (fileContents.get(currentFile) ?? '') : ''
  const secondaryFile = paneFiles.secondary || null
  const secondaryCode = secondaryFile ? (fileContents.get(secondaryFile) ?? '') : ''
  // Recent files for welcome panel
  const [recentFiles] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('swarm-editor-recent-files')
      return stored ? JSON.parse(stored) : []
    } catch {
      logger.debug('Editor', 'Failed to parse recent files from localStorage')
      return []
    }
  })

  // Window title
  useEffect(() => {
    if (currentFile) {
      const fileName = currentFile.split('/').pop() || currentFile
      const isDirty = dirtyFiles.has(currentFile)
      document.title = `${isDirty ? '● ' : ''}${fileName} — Swarm Editor`
    } else {
      document.title = 'Swarm Editor'
    }
  }, [currentFile, dirtyFiles])
  // Workspace init + cleanup
  useEffect(() => {
    mountedRef.current = true
    const load = async () => {
      try {
        const ws = await fsApi.getWorkspace()
        if (!mountedRef.current) return
        setWorkspacePath(ws)
      } catch (err) {
        logger.error('Editor', 'Failed to load workspace:', err)
      }
    }
    load()
    return () => { mountedRef.current = false }
  }, [setWorkspacePath])

  // Subscribe to external file change events
  useEffect(() => {
    const unsubscribe = subscribeToFileChanges()
    return unsubscribe
  }, [subscribeToFileChanges])

  // Git blame: fetch when enabled or file changes
  useEffect(() => {
    blameMountedRef.current = true
    return () => { blameMountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!blameEnabled || !currentFile) {
      setBlameLines([])
      return
    }

    let cancelled = false
    gitBlameApi.blame(currentFile)
      .then(lines => {
        if (!cancelled && blameMountedRef.current) {
          setBlameLines(lines)
        }
      })
      .catch(err => {
        logger.debug('Editor', 'Blame fetch failed:', err)
        if (!cancelled && blameMountedRef.current) {
          setBlameLines([])
        }
      })

    return () => { cancelled = true }
  }, [blameEnabled, currentFile])

  // Save handler
  const handleSave = useCallback(async () => {
    const { activePaneId: paneId, splitDirection: split } = useSplitPaneStore.getState()
    const isSecondary = paneId === 'secondary' && split !== 'none'
    const filePath = isSecondary
      ? useSplitPaneStore.getState().paneFiles.secondary
      : useWorkspaceStore.getState().currentFile
    if (!filePath) return

    const contents = useWorkspaceStore.getState().fileContents
    const content = contents.get(filePath)
    if (content === undefined) return

    try {
      await fsApi.writeFile(filePath, content)
      clearDirty(filePath)
      addToast('success', 'Saved', filePath.split('/').pop() || filePath)
    } catch (err) {
      logger.error('Editor', 'Failed to save file:', err)
      addToast('error', 'Save failed', err instanceof Error ? err.message : String(err))
    }
  }, [clearDirty, addToast])

  // Save file by path (for tab close)
  const handleSaveFileByPath = useCallback(async (filePath: string) => {
    const contents = useWorkspaceStore.getState().fileContents
    const content = contents.get(filePath)
    if (content === undefined) return

    try {
      await fsApi.writeFile(filePath, content)
      clearDirty(filePath)
    } catch (err) {
      logger.error('Editor', 'Failed to save file:', err)
    }
  }, [clearDirty])
  // Content change (main pane)
  const handleMainChange = useCallback((value: string) => {
    const file = useWorkspaceStore.getState().currentFile
    if (file) {
      updateFileContent(file, value)
    }
  }, [updateFileContent])
  // Content change (secondary pane)
  const handleSecondaryChange = useCallback((value: string) => {
    const file = useSplitPaneStore.getState().paneFiles.secondary
    if (file) {
      updateFileContent(file, value)
    }
  }, [updateFileContent])
  // Tab click
  const handleTabClick = useCallback((path: string) => {
    // Clicking a preview tab converts it to permanent
    const state = useWorkspaceStore.getState()
    if (state.previewTab === path) {
      useWorkspaceStore.setState({ previewTab: null, mruOrder: [...state.mruOrder, path] })
    }
    if (splitDirection !== 'none' && activePaneId === 'secondary') {
      setPaneFile('secondary', path)
      if (!openFiles.includes(path)) openFileFromStore(path, { preview: false })
    } else {
      openFileFromStore(path, { preview: false })
    }
  }, [openFileFromStore, splitDirection, activePaneId, setPaneFile, openFiles])
  // Tab close
  const handleTabClose = useCallback((path: string) => {
    if (dirtyFiles.has(path)) {
      setDirtyClosePath(path)
    } else {
      closeFile(path)
    }
  }, [closeFile, dirtyFiles])
  // Welcome panel file click
  const handleWelcomeFileClick = useCallback((path: string) => {
    openFileFromStore(path)
  }, [openFileFromStore])
  // Tab context menu
  const { handleTabContextMenu, closeTabContextMenu, tabMenuKeyDown } = useTabContextMenu({
    tabContextMenu, setTabContextMenu, tabContextMenuRef,
  })
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey

      if (ctrl && e.key === 's') {
        e.preventDefault()
        handleSave()
      } else if (ctrl && e.key === 'w') {
        e.preventDefault()
        const file = useWorkspaceStore.getState().currentFile
        if (file) handleTabClose(file)
      } else if (ctrl && e.shiftKey && e.key === 'T') {
        e.preventDefault()
        undoCloseFile()
      } else if (ctrl && e.key === '\\') {
        e.preventDefault()
        toggleSplit()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave, handleTabClose, undoCloseFile, toggleSplit])

  // Clear drag state on dragend
  useEffect(() => {
    const handleDragEnd = () => { setDraggedTab(null); setDropTargetPane(null) }
    window.addEventListener('dragend', handleDragEnd)
    return () => window.removeEventListener('dragend', handleDragEnd)
  }, [])

  // Goto Line: listen for 'goto-line-direct' and navigate the active editor
  useEffect(() => {
    const handleGotoLine = (e: Event) => {
      const line = (e as CustomEvent).detail?.line
      if (!line || !currentFile) return
      const { activePaneId: paneId, splitDirection: split } = useSplitPaneStore.getState()
      const ref = (paneId === 'secondary' && split !== 'none')
        ? secondaryEditorRef
        : mainEditorRef
      ref.current?.setCursor(line, 1)
      ref.current?.scrollToLine(line)
      ref.current?.focus()
    }
    window.addEventListener('goto-line-direct', handleGotoLine)
    return () => window.removeEventListener('goto-line-direct', handleGotoLine)
  }, [currentFile])

  // Diff mode: listen for 'editor:show-diff' custom event
  useEffect(() => {
    const handleShowDiff = (e: Event) => {
      const detail = (e as CustomEvent).detail as DiffState | undefined
      if (detail?.path && detail.original !== undefined && detail.modified !== undefined) {
        setDiffState(detail)
      }
    }
    window.addEventListener('editor:show-diff', handleShowDiff)
    return () => window.removeEventListener('editor:show-diff', handleShowDiff)
  }, [])

  // Close diff view handler
  const handleCloseDiff = useCallback(() => {
    setDiffState(null)
  }, [])

  // Pane focus handlers
  const handleMainPaneFocus = useCallback(() => {
    if (activePaneId !== 'main') setActivePane('main')
  }, [activePaneId, setActivePane])

  const handleSecondaryPaneFocus = useCallback(() => {
    if (activePaneId !== 'secondary') setActivePane('secondary')
  }, [activePaneId, setActivePane])

  // Close split
  const handleCloseSplit = useCallback(() => {
    closeSplit()
  }, [closeSplit])

  // Split right
  const handleSplitRight = useCallback((path: string) => {
    if (splitDirection === 'none') toggleSplit()
    setPaneFile('secondary', path)
    setActivePane('secondary')
  }, [splitDirection, toggleSplit, setPaneFile, setActivePane])

  // Tab close operations
  const handleCloseAllTabs = useCallback(() => {
    const hasDirty = openFiles.some(f => dirtyFiles.has(f))
    if (hasDirty) {
      setDirtyClosePath('__close_all__')
    } else {
      closeAllFiles()
    }
  }, [openFiles, dirtyFiles, closeAllFiles])

  const handleCloseOtherTabs = useCallback(() => {
    if (!currentFile) return
    closeOthers(currentFile)
  }, [currentFile, closeOthers])

  const handleCloseToLeft = useCallback(() => {
    if (!currentFile) return
    closeToLeft(currentFile)
  }, [currentFile, closeToLeft])

  const handleCloseToRight = useCallback(() => {
    if (!currentFile) return
    closeToRight(currentFile)
  }, [currentFile, closeToRight])

  const handleCloseSavedTabs = useCallback(() => {
    closeSaved()
  }, [closeSaved])

  // Copy path helpers
  const workspace = workspacePath

  // Drag/drop for cross-pane tab transfer
  const handleMainDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (draggedTab && draggedTab.paneId !== 'main') {
      setDropTargetPane('main')
    }
  }, [draggedTab])

  const handleMainDragLeave = useCallback(() => {
    setDropTargetPane(null)
  }, [])

  const handleMainDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDropTargetPane(null)
    if (draggedTab && draggedTab.paneId !== 'main') {
      setPaneFile('main', draggedTab.path)
      setActivePane('main')
    }
    setDraggedTab(null)
  }, [draggedTab, setPaneFile, setActivePane])

  const handleSecondaryDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (draggedTab && draggedTab.paneId !== 'secondary') {
      setDropTargetPane('secondary')
    }
  }, [draggedTab])

  const handleSecondaryDragLeave = useCallback(() => {
    setDropTargetPane(null)
  }, [])

  const handleSecondaryDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDropTargetPane(null)
    if (draggedTab && draggedTab.paneId !== 'secondary') {
      setPaneFile('secondary', draggedTab.path)
      setActivePane('secondary')
    }
    setDraggedTab(null)
  }, [draggedTab, setPaneFile, setActivePane])

  return (
    <div className="flex flex-col h-full">
      {/* Diff mode — replaces normal editor entirely */}
      {diffState ? (
        <DiffView
          original={diffState.original}
          modified={diffState.modified}
          filename={diffState.path}
          onClose={handleCloseDiff}
        />
      ) : (
      <>
      {/* Tab Bar */}
      <TabBar
        openFiles={openFiles}
        currentFile={currentFile}
        dirtyFiles={dirtyFiles}
        pinnedFiles={pinnedFiles}
        previewTab={previewTab}
        onTabClick={handleTabClick}
        onTabClose={handleTabClose}
        onCloseAll={handleCloseAllTabs}
        onCloseOthers={handleCloseOtherTabs}
        onCloseSaved={handleCloseSavedTabs}
        onCloseToLeft={currentFile && openFiles.indexOf(currentFile) > 0 ? handleCloseToLeft : undefined}
        onCloseToRight={currentFile && openFiles.indexOf(currentFile) < openFiles.length - 1 ? handleCloseToRight : undefined}
        onReorder={reorderFiles}
        onTabContextMenu={handleTabContextMenu}
        paneId="main"
        onDragStart={(paneId, path) => setDraggedTab({ paneId, path })}
      />

      {/* Breadcrumbs + Blame toggle */}
      {currentFile && (
        <div className="flex items-center justify-between">
          <BreadcrumbsBar
            filePath={currentFile}
            onNavigate={(path) => { useWorkspaceStore.getState().toggleDir(path) }}
            onFileSelect={(path) => openFileFromStore(path, { preview: false })}
          />
          <button
            onClick={() => setBlameEnabled(prev => !prev)}
            className={`px-2 py-0.5 mr-2 text-xs rounded transition-colors ${
              blameEnabled
                ? 'bg-[#58a6ff]/20 text-[#58a6ff] border border-[#58a6ff]/40'
                : 'text-[#6b7280] hover:text-[#d1d5db] hover:bg-[#21262d]'
            }`}
            title={blameEnabled ? 'Hide Blame' : 'Show Blame'}
          >
            Blame
          </button>
        </div>
      )}

      {/* External file modification prompt */}
      {currentFile && externalModifications.has(currentFile) && (
        <ExternalModPrompt filePath={currentFile} onDismiss={clearExternalModification} />
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden" data-editor-container>
        {openFiles.length === 0 ? (
          <WelcomePanel
            recentFiles={recentFiles}
            onFileClick={handleWelcomeFileClick}
          />
        ) : (
          <div className={`h-full ${splitDirection === 'horizontal' ? 'flex' : ''}`}>
            {/* Main pane */}
            <div
              className={`overflow-hidden transition-all flex ${
                splitDirection === 'horizontal' ? 'flex-1 border-r' : 'w-full h-full'
              } ${dropTargetPane === 'main' ? 'bg-[#58a6ff]/10' : ''} ${
                splitDirection !== 'none' && activePaneId === 'secondary' ? 'opacity-75' : ''
              }`}
              style={{ borderRightColor: splitDirection === 'horizontal' ? '#30363d' : undefined }}
              onFocus={handleMainPaneFocus}
              onDragOver={handleMainDragOver}
              onDragLeave={handleMainDragLeave}
              onDrop={handleMainDrop}
            >
              {/* Blame gutter sidebar */}
              {blameEnabled && <BlameSidebar lines={blameLines} />}
              <div className="flex-1 overflow-hidden">
                <CodeMirrorPane
                  ref={mainEditorRef}
                  value={code}
                  filename={currentFile || 'untitled'}
                  onChange={handleMainChange}
                  onSave={handleSave}
                  settings={editorSettings}
                />
              </div>
            </div>

            {/* Secondary pane (split editor) */}
            {splitDirection === 'horizontal' && (
              <div
                className={`flex-1 overflow-hidden flex flex-col transition-all ${
                  dropTargetPane === 'secondary' ? 'bg-[#58a6ff]/10' : ''
                } ${activePaneId === 'main' ? 'opacity-75' : ''}`}
                onFocus={handleSecondaryPaneFocus}
                onDragOver={handleSecondaryDragOver}
                onDragLeave={handleSecondaryDragLeave}
                onDrop={handleSecondaryDrop}
              >
                {/* Secondary pane header */}
                <div
                  className={`flex items-center justify-between px-2 py-0.5 border-b text-xs ${
                    dropTargetPane === 'secondary'
                      ? 'bg-[#58a6ff]/20 border-[#58a6ff]'
                      : ''
                  }`}
                  style={{
                    background: dropTargetPane === 'secondary' ? undefined : '#161b22',
                    borderBottomColor: dropTargetPane === 'secondary' ? undefined : '#30363d',
                  }}
                >
                  <span className="truncate" style={{ color: dropTargetPane === 'secondary' ? '#58a6ff' : '#d1d5db' }}>
                    {dropTargetPane === 'secondary'
                      ? 'Drop to open in this pane'
                      : secondaryFile ? secondaryFile.split('/').pop() : 'No file open'}
                  </span>
                  <button
                    onClick={handleCloseSplit}
                    className="p-0.5 hover:bg-[#21262d] rounded transition-colors"
                    title="Close split"
                    style={{ color: '#6b7280' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="6" cy="6" r="5" />
                      <path d="M4 4l4 4M8 4l-4 4" />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <CodeMirrorPane
                    ref={secondaryEditorRef}
                    value={secondaryCode}
                    filename={secondaryFile || 'untitled'}
                    onChange={handleSecondaryChange}
                    onSave={handleSave}
                    settings={editorSettings}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tab Context Menu */}
      <TabContextMenu
        tabContextMenu={tabContextMenu}
        tabContextMenuRef={tabContextMenuRef}
        tabMenuKeyDown={tabMenuKeyDown}
        openFiles={openFiles}
        dirtyFiles={dirtyFiles}
        pinnedFiles={pinnedFiles}
        onClose={closeTabContextMenu}
        onCloseTab={handleTabClose}
        onCloseOthers={closeOthers}
        onCloseToLeft={closeToLeft}
        onCloseToRight={closeToRight}
        onCloseSaved={closeSaved}
        onCloseAll={closeAllFiles}
        onTogglePin={togglePin}
        onSplitRight={handleSplitRight}
        onReopenClosed={undoCloseFile}
        onCopyPath={(path) => {
          navigator.clipboard.writeText(path)
          addToast('success', 'Copied', 'Path copied to clipboard')
        }}
        onCopyRelativePath={(path) => {
          if (workspace) {
            const rel = path.replace(workspace, '').replace(/^\//, '')
            navigator.clipboard.writeText(rel)
            addToast('success', 'Copied', 'Relative path copied')
          }
        }}
        onDirtyCloseAll={() => setDirtyClosePath('__close_all__')}
        addToast={addToast}
      />

      {/* Dirty file close confirmation */}
      <DirtyCloseDialog
        dirtyClosePath={dirtyClosePath}
        openFiles={openFiles}
        dirtyFiles={dirtyFiles}
        onCancel={() => setDirtyClosePath(null)}
        onCloseWithoutSaving={(path) => {
          setDirtyClosePath(null)
          closeFile(path)
        }}
        onCloseAllWithoutSaving={() => {
          setDirtyClosePath(null)
          closeAllFiles()
        }}
        onSaveAndClose={async (path) => {
          setDirtyClosePath(null)
          await handleSaveFileByPath(path)
          closeFile(path)
        }}
        onSaveAllAndClose={async () => {
          const dirtyPaths = openFiles.filter(f => dirtyFiles.has(f))
          for (const p of dirtyPaths) {
            await handleSaveFileByPath(p)
          }
          setDirtyClosePath(null)
          closeAllFiles()
        }}
      />
      </>
      )}
    </div>
  )
}
