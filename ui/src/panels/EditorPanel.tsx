import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useAppStore } from '../store/appStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useSplitPaneStore } from '../stores/splitPaneStore'
import { useWindowEvent } from '../hooks/useWindowEvent'
import { useEditorSettingsEvents } from '../hooks/useEditorSettingsEvents'
import { useCommandPaletteEvents } from '../hooks/useCommandPaletteEvents'
import { useDiagnostics } from '../hooks/useDiagnostics'
import { useGitDiffDecorations } from '../hooks/useGitDiffDecorations'
import { FileEntry, GitFileStatus } from '../services'
import BottomPanel from './BottomPanel'
import ExplorerPanel from './ExplorerPanel'
import { TabBar } from '../components/TabBar'
import { BreadcrumbsBar } from '../components/BreadcrumbsBar'
import { WelcomePanel } from '../components/WelcomePanel'
import { AccessibilityHelpModal } from '../components/AccessibilityHelpModal'
import { AgentSelectorModal } from '../components/AgentSelectorModal'
import { DirtyCloseDialog } from '../components/DirtyCloseDialog'
import { TabContextMenu } from '../components/TabContextMenu'
import { EditorToolbar } from '../components/EditorToolbar'
import { EditorBreadcrumbs } from '../components/EditorBreadcrumbs'
import { SecondaryEditorPane } from '../components/SecondaryEditorPane'
import { PrimaryEditorPane } from '../components/PrimaryEditorPane'
import { ActivityBar } from '../components/ActivityBar'
import DiffEditorPanel from '../components/DiffEditorPanel'
import SourceControlPanel from '../components/SourceControlPanel'
import { OutlinePanel } from '../components/OutlinePanel'
import { gitDiffApi } from '../services/api'
import { getMonacoTheme } from '../theme/monacoTheme'
import { LSP_LANG_MAP, buildEditorOptions } from '../utils/monaco'
import { createEditorMountHandler } from '../utils/monacoEditorMountFactory'
import { createEditorChangeHandler } from '../utils/monacoEditorChange'
import { findSymbolPath } from '../utils/monacoSymbols'
import { navigateProblem as navigateProblemUtil } from '../utils/navigateProblem'
import { executeWithAgent as executeWithAgentUtil } from '../utils/executeWithAgent'
import { loadFile as loadFileUtil } from '../utils/loadFile'
import { useWorkspaceInit } from '../hooks/useWorkspaceInit'
import { autoSaveDirtyFiles, saveSingleFile } from '../utils/tabCloseActions'
import { createEditorDragDropHandlers } from '../utils/editorDragDrop'
import { createTabCloseHandlers } from '../utils/tabCloseHandlers'
import { useFileWatcher } from '../hooks/useFileWatcher'
import { useGitStatus } from '../hooks/useGitStatus'
import { useEditorUIState } from '../hooks/useEditorUIState'
import { useEditorRefs } from '../hooks/useEditorRefs'
import { useEditorWindowEvents } from '../hooks/useEditorWindowEvents'
import { usePaneModelSync } from '../hooks/usePaneModelSync'
import { useSearchParamNavigation } from '../hooks/useSearchParamNavigation'
import { useEditorStores } from '../hooks/useEditorStores'
import { useEditorCallbacks } from '../hooks/useEditorCallbacks'
import { useEditorCleanup } from '../hooks/useEditorCleanup'
import { useEditorSaveHandlers } from '../hooks/useEditorSaveHandlers'
import { useTabContextMenu } from '../hooks/useTabContextMenu'

export default function EditorPanel() {
  // All store selectors consolidated (app, workspace, splitPane, settings, theme)
  const {
    swarms, addToast, updateFileProblems, workspaceProblems,
    settings, updateSetting, effectiveTheme, cursorPosition,
    openFiles, currentFile, fileContents, dirtyFiles, pinnedFiles,
    previewTab, wsLanguage, openFileFromStore, closeFile,
    closeAllFiles, closeOthers, closeToLeft, closeToRight, closeSaved,
    reorderFiles, undoCloseFile, togglePin, updateFileContent, clearDirty, setLanguage,
    splitDirection, activePaneId, setActivePane, toggleSplit, closeSplit, paneFiles, setPaneFile,
  } = useEditorStores()

  // R5169: Ref for inlayHints setting (avoid stale closure in Monaco provider)
  const inlayHintsRef = useRef(settings.inlayHints)
  useEffect(() => { inlayHintsRef.current = settings.inlayHints }, [settings.inlayHints])

  // UI state: sidebar, tabs, drag-drop, context menus, dialogs
  const {
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
  } = useEditorUIState()

  // Git status for file tree decorations (VS Code/Cursor pattern)
  const [gitStatusMap, setGitStatusMap] = useState<Record<string, GitFileStatus>>({})

  // Document symbols for breadcrumb navigation (VS Code/Cursor pattern)
  // P1 fix: Separate symbols per pane (was sharing between main/secondary)
  const [documentSymbols, setDocumentSymbols] = useState<any[]>([])
  const [secondaryDocumentSymbols, setSecondaryDocumentSymbols] = useState<any[]>([])

  // Derived: current file content
  const code = currentFile ? (fileContents.get(currentFile) ?? '') : ''
  const language = currentFile ? wsLanguage : 'plaintext'

  // Window title: show current file name (VS Code pattern: "filename — Swarm Editor")
  useEffect(() => {
    if (currentFile) {
      const fileName = currentFile.split('/').pop() || currentFile
      const isDirty = dirtyFiles.has(currentFile)
      document.title = `${isDirty ? '● ' : ''}${fileName} — Swarm Editor`
    } else {
      document.title = 'Swarm Editor'
    }
  }, [currentFile, dirtyFiles])

  // Split editor: active pane's file
  const secondaryFile = paneFiles.secondary || null
  const secondaryCode = secondaryFile ? (fileContents.get(secondaryFile) ?? '') : ''
  const secondaryLang = secondaryFile
    ? (() => {
        const ext = secondaryFile.split('.').pop()?.toLowerCase() || ''
        return LSP_LANG_MAP[ext] || 'plaintext'
      })()
    : 'plaintext'

  // Recent files for welcome panel
  const [recentFiles, setRecentFiles] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('swarm-editor-recent-files')
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })

  // All editor refs (main + secondary pane)
  const {
    modelCacheRef, editorRef, monacoRef, mountedRef,
    lspDebounceRef, autoSaveTimeoutRef, lspOpenFileRef,
    lspIncrementalRef, lspPendingChangesRef, lspInitiatedEditRef,
    externalReloadRef, providerDisposablesRef, viewStateMapRef,
    secondaryEditorRef, secondaryLspOpenFileRef, secondaryLspDebounceRef,
    secondaryLspIncrementalRef, secondaryLspPendingChangesRef,
    secondaryLspInitiatedEditRef, secondaryAutoSaveTimeoutRef, secondaryDisposablesRef,
  } = useEditorRefs()

  // Format + close-split callbacks (shared editor actions)
  const { handleFormat, handleCloseSplit } = useEditorCallbacks({
    activePaneId, splitDirection, editorRef, secondaryEditorRef,
    secondaryDisposablesRef, secondaryAutoSaveTimeoutRef, secondaryLspOpenFileRef, closeSplit,
  })

  // R5080/R5083: Git diff gutter decorations (VS Code/Cursor pattern)
  useGitDiffDecorations(editorRef, secondaryEditorRef, monacoRef, currentFile, secondaryFile, splitDirection, gitStatusMap)

  // Compute breadcrumb symbols based on cursor position
  // P1 fix: Use correct symbols based on active pane (was always using main pane symbols)
  const breadcrumbSymbols = useMemo(() => {
    const symbols = activePaneId === 'secondary' ? secondaryDocumentSymbols : documentSymbols
    if (!cursorPosition || !symbols.length) return []
    return findSymbolPath(symbols, cursorPosition.line, cursorPosition.column)
  }, [cursorPosition, documentSymbols, secondaryDocumentSymbols, activePaneId])

  // R5093: Navigate between problems (F8/Shift+F8) - VS Code pattern
  const navigateProblem = useCallback((editorInstance: editor.IStandaloneCodeEditor, curFile: string | null, direction: 1 | -1 = 1) => {
    navigateProblemUtil({ editorInstance, curFile, direction, workspaceProblems, openFile: openFileFromStore })
  }, [workspaceProblems, openFileFromStore])

  // Ref to avoid stale closure in addCommand handlers (onMount runs once)
  const navigateProblemRef = useRef(navigateProblem)
  navigateProblemRef.current = navigateProblem

  // Open file and scroll to line when URL ?file=&line= params change
  useSearchParamNavigation({ currentFile, editorRef, openFile: openFileFromStore })

  // Dispose models for closed files
  useEffect(() => {
    const openPaths = new Set(openFiles)
    // Don't dispose models still in use by secondary pane (split editor)
    if (secondaryFile) openPaths.add(secondaryFile)
    for (const [path, model] of modelCacheRef.current) {
      if (!openPaths.has(path)) {
        model.dispose()
        modelCacheRef.current.delete(path)
        viewStateMapRef.current.delete(path)
      }
    }
  }, [openFiles, secondaryFile])

  // Tab click handler — switch to already-open file
  const handleTabClick = useCallback((path: string) => {
    // VS Code: clicking a preview tab converts it to permanent
    const state = useWorkspaceStore.getState()
    if (state.previewTab === path) {
      useWorkspaceStore.setState({ previewTab: null, mruOrder: [...state.mruOrder, path] })
    }
    if (splitDirection !== 'none' && activePaneId === 'secondary') {
      // In split mode, open file in the active pane
      setPaneFile('secondary', path)
      // Also ensure file is in openFiles
      if (!openFiles.includes(path)) openFileFromStore(path, { preview: false })
    } else {
      openFileFromStore(path, { preview: false })
    }
  }, [openFileFromStore, splitDirection, activePaneId, setPaneFile, openFiles])

  // Tab close handler
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

  // Open diff view for a file (git HEAD vs working tree)
  const handleOpenDiff = useCallback(async (filePath: string) => {
    try {
      const result = await gitDiffApi.getFileDiff(filePath)
      setDiffView({
        original: result.original,
        modified: result.modified,
        language: wsLanguage || 'plaintext',
        filePath: result.path,
      })
    } catch {
      // Not a git repo or file has no history — ignore
    }
  }, [wsLanguage])

  // Diagnostics management (LSP markers + problems)
  const {
    fetchDiagnostics,
    fetchSecondaryDiagnostics,
    subscribeToDiagnostics,
  } = useDiagnostics(monacoRef, editorRef, secondaryEditorRef, lspOpenFileRef, secondaryLspOpenFileRef, updateFileProblems)

  // Subscribe to push-based diagnostics from WebSocket (Cursor/Windsurf pattern)
  useEffect(() => {
    return subscribeToDiagnostics()
  }, [subscribeToDiagnostics])

  // Pane model switching + LSP sync (main and secondary)
  usePaneModelSync({
    filePath: currentFile, fileContents, language: wsLanguage,
    editorRef, monacoRef, modelCacheRef, viewStateMapRef,
    lspOpenFileRef, lspIncrementalRef,
    fetchDiagnostics, setSymbols: setDocumentSymbols,
  })
  usePaneModelSync({
    filePath: secondaryFile, fileContents, language: null,
    editorRef: secondaryEditorRef, monacoRef, modelCacheRef, viewStateMapRef,
    lspOpenFileRef: secondaryLspOpenFileRef, lspIncrementalRef: secondaryLspIncrementalRef,
    fetchDiagnostics: fetchSecondaryDiagnostics, setSymbols: setSecondaryDocumentSymbols,
  })

  // Sync Monaco theme when app theme changes (VS Code pattern — live theme switch)
  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(getMonacoTheme(effectiveTheme))
    }
  }, [effectiveTheme])

  // Track mounted state + cleanup on unmount
  useEditorCleanup({
    mountedRef, lspDebounceRef, autoSaveTimeoutRef, lspOpenFileRef,
    secondaryLspDebounceRef, secondaryAutoSaveTimeoutRef, secondaryLspOpenFileRef,
    providerDisposablesRef,
  })

  // Git status polling for file tree decorations (VS Code/Cursor pattern)
  const fetchGitStatusRef = useGitStatus({ workspace, setGitStatusMap })

  // Listen for external git status refresh requests (CommandPalette git: pull, SourceControlPanel, etc.)
  useWindowEvent('refresh-git-status', () => { fetchGitStatusRef.current() }, [])

  // P1 UX: File watcher - detect external changes to open files (VS Code/Cursor pattern)
  useFileWatcher({
    openFiles, currentFile, secondaryFile, workspace,
    updateFileContent, clearDirty, externalReloadRef,
    editorRef, secondaryEditorRef, monacoRef,
  })

  // P1 UX: Handle editor setting toggle events from CommandPalette
  useEditorSettingsEvents({ settings, updateSetting: updateSetting as (key: string, value: any) => void })

  // Tab close handlers (extracted to utility)
  const tabCloseHandlers = useMemo(() => createTabCloseHandlers({
    openFiles, currentFile, dirtyFiles, pinnedFiles, fileContents,
    closeAllFiles, closeOthers, closeToLeft, closeToRight, closeSaved,
    clearDirty, fetchGitStatus: () => fetchGitStatusRef.current(), addToast, setDirtyClosePath,
  }), [openFiles, currentFile, dirtyFiles, pinnedFiles, fileContents, closeAllFiles, closeOthers, closeToLeft, closeToRight, closeSaved, clearDirty, addToast])
  const { closeAll: handleCloseAllTabs, closeSavedTabs: handleCloseSavedTabs, closeOtherTabs: handleCloseOtherTabs, closeTabsToLeft: handleCloseToLeft, closeTabsToRight: handleCloseToRight } = tabCloseHandlers

  // Window event handlers (CommandPalette, keyboard shortcuts, LSP reconnect)
  useEditorWindowEvents({
    currentFile, dirtyFiles, openFiles, closeFile, togglePin, setDirtyClosePath,
    handleCloseAllTabs, handleCloseSavedTabs, handleCloseOtherTabs, handleCloseToRight,
    showFileTree, setShowFileTree, setShowAccessibilityHelp, setExpandedDirs,
    gitStatusMap, handleOpenDiff,
    editorRef, modelCacheRef, navigateProblemRef,
    lspOpenFileRef, secondaryLspOpenFileRef,
    lspIncrementalRef, secondaryLspIncrementalRef,
    fetchDiagnostics, fetchSecondaryDiagnostics,
    fileContents, addToast,
  })

  useWorkspaceInit({ mountedRef, setLoading, setWorkspace, addToast })

  const loadFile = async (entry: FileEntry) => {
    loadFileUtil({
      path: entry.path, splitDirection, mountedRef, setLoading,
      openFile: openFileFromStore, setPaneFile, setRecentFiles,
      addToast: (type, title, message) => addToast(type, title, message),
    })
  }

  // Save handlers (split-aware save + per-file auto-save)
  const { handleSave, handleSaveFileByPath } = useEditorSaveHandlers({
    editorRef, secondaryEditorRef, monacoRef, mountedRef, modelCacheRef,
    lspOpenFileRef, secondaryLspOpenFileRef,
    lspDebounceRef, secondaryLspDebounceRef,
    lspPendingChangesRef, secondaryLspPendingChangesRef,
    lspInitiatedEditRef, secondaryLspInitiatedEditRef,
    fetchGitStatusRef, fileContents, updateFileContent, clearDirty,
    setLoading,
  })

  // Monaco Editor mount handlers (main + secondary)
  const handleEditorMount: OnMount = createEditorMountHandler({
    editorRef, monacoRef, providerDisposablesRef,
    inlayHintsRef, lspInitiatedEditRef, lspOpenFileRef, lspPendingChangesRef,
    settings, updateSetting: updateSetting as (key: string, value: any) => void,
    onSave: handleSave,
    onAccessibilityHelp: () => setShowAccessibilityHelp(true),
    onFocusOutline: () => { setShowFileTree(true); setActivityView('outline') },
    onNavigateProblem: (direction) => navigateProblemRef.current(editorRef.current!, currentFile, direction),
    effectiveTheme: effectiveTheme as 'dark' | 'light', isMain: true,
    setActivePane,
  })

  // Command palette / keyboard shortcut events
  useCommandPaletteEvents({
    currentFile,
    showFileTree,
    splitDirection,
    editorRef,
    toggleSplit,
    handleCloseSplit,
    setShowFileTree,
    setActivityView: setActivityView as React.Dispatch<React.SetStateAction<string>>,
    setActivePane,
    handleSave,
    addToast,
  })

  const handleRun = () => {
    if (!currentFile) return
    setShowAgentSelector(true)
  }

  const executeWithAgent = async (swarmId?: string) => {
    if (!currentFile) return
    await executeWithAgentUtil({
      currentFile, code, language, swarmId, swarms,
      mountedRef, setLoading,
      addToast: useAppStore.getState().addToast,
      onDone: () => setShowAgentSelector(false),
    })
  }

  const handleEditorChange = createEditorChangeHandler(
    () => currentFile,
    {
      lspInitiatedEditRef,
      externalReloadRef,
      lspDebounceRef,
      lspOpenFileRef,
      lspPendingChangesRef,
      lspIncrementalRef,
      autoSaveTimeoutRef,
    },
    {
      autoSave: settings.autoSave,
      autoSaveDelay: settings.autoSaveDelay,
      updateFileContent,
      saveFileByPath: handleSaveFileByPath,
      dirtyFiles,
    },
  )

  // Secondary pane editor mount (split editor)
  const handleSecondaryEditorMount: OnMount = createEditorMountHandler({
    editorRef: secondaryEditorRef, monacoRef, providerDisposablesRef,
    inlayHintsRef, lspInitiatedEditRef: secondaryLspInitiatedEditRef,
    lspOpenFileRef: secondaryLspOpenFileRef, lspPendingChangesRef: secondaryLspPendingChangesRef,
    settings, updateSetting: updateSetting as (key: string, value: any) => void,
    onSave: handleSave,
    onAccessibilityHelp: () => setShowAccessibilityHelp(true),
    onFocusOutline: () => { setShowFileTree(true); setActivityView('outline') },
    onNavigateProblem: (direction) => navigateProblemRef.current(secondaryEditorRef.current!, secondaryFile, direction),
    effectiveTheme: effectiveTheme as 'dark' | 'light', isMain: false,
    secondaryDisposablesRef, secondaryLspInitiatedEditRef, secondaryLspPendingChangesRef, setActivePane,
  })

  // Secondary pane editor change handler
  const handleSecondaryEditorChange = createEditorChangeHandler(
    () => useSplitPaneStore.getState().paneFiles.secondary,
    {
      lspInitiatedEditRef: secondaryLspInitiatedEditRef,
      externalReloadRef,
      lspDebounceRef: secondaryLspDebounceRef,
      lspOpenFileRef: secondaryLspOpenFileRef,
      lspPendingChangesRef: secondaryLspPendingChangesRef,
      lspIncrementalRef: secondaryLspIncrementalRef,
      autoSaveTimeoutRef: secondaryAutoSaveTimeoutRef,
    },
    {
      autoSave: settings.autoSave,
      autoSaveDelay: settings.autoSaveDelay,
      updateFileContent,
      saveFileByPath: handleSaveFileByPath,
      dirtyFiles,
    },
  )

  // Tab context menu state + handlers (VS Code/Cursor pattern)
  const { handleTabContextMenu, closeTabContextMenu, tabMenuKeyDown } = useTabContextMenu({
    tabContextMenu, setTabContextMenu, tabContextMenuRef,
  })

  // Shared Monaco editor options (deduplicated for main + secondary panes)
  const editorOptions = useMemo(() => buildEditorOptions({
    fontSize: settings.fontSize,
    fontFamily: settings.fontFamily,
    tabSize: settings.tabSize,
    wordWrap: settings.wordWrap ? 'on' : 'off',
    lineNumbers: settings.lineNumbers,
    minimapEnabled: settings.minimap,
    bracketPairColorization: { enabled: settings.bracketPairColorization },
    guides: settings.indentGuides
      ? { bracketPairs: true, indentation: true, highlightActiveBracketPair: true, highlightActiveIndentation: true }
      : { bracketPairs: false, indentation: false, highlightActiveBracketPair: false, highlightActiveIndentation: false },
    stickyScroll: { enabled: settings.stickyScroll },
    renderWhitespace: settings.renderWhitespace,
    cursorBlinking: settings.cursorBlinking,
    cursorStyle: settings.cursorStyle,
    smoothScrolling: settings.smoothScrolling,
    cursorSmoothCaretAnimation: settings.cursorSmoothCaretAnimation ? 'on' : 'off',
    linkedEditing: settings.linkedEditing,
    scrollBeyondLastLine: settings.scrollBeyondLastLine,
    formatOnPaste: settings.formatOnPaste,
    mouseWheelZoom: settings.mouseWheelZoom,
    semanticHighlighting: settings.semanticHighlighting,
    quickSuggestions: settings.quickSuggestions,
    acceptSuggestionOnEnter: settings.acceptSuggestionOnEnter,
    tabCompletion: settings.tabCompletion,
    wordBasedSuggestions: settings.wordBasedSuggestions,
    suggestOnTriggerCharacters: settings.suggestOnTriggerCharacters,
  }), [settings])

  // Navigate active editor to a symbol position (shared by OutlinePanel + EditorBreadcrumbs)
  const navigateToPosition = useCallback((line: number, column: number) => {
    const activeEditor = activePaneId === 'secondary' ? secondaryEditorRef.current : editorRef.current
    if (activeEditor) {
      activeEditor.revealLineInCenter(line + 1)
      activeEditor.setPosition({ lineNumber: line + 1, column: column + 1 })
      activeEditor.focus()
    }
  }, [activePaneId])

  // Pane drag/drop handlers (cross-pane tab drag support)
  const mainDragDrop = useMemo(() => createEditorDragDropHandlers({
    paneId: 'main', draggedTab, setDropTargetPane, setDraggedTab,
    setPaneFile, setActivePane,
    onLoadFile: (path) => loadFile({ path, name: path.split('/').pop() || '', isDirectory: false }),
  }), [draggedTab, setPaneFile, setActivePane, loadFile])

  const secondaryDragDrop = useMemo(() => createEditorDragDropHandlers({
    paneId: 'secondary', draggedTab, setDropTargetPane, setDraggedTab,
    setPaneFile, setActivePane,
  }), [draggedTab, setPaneFile, setActivePane])

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <EditorToolbar
        showFileTree={showFileTree}
        onToggleFileTree={() => setShowFileTree(!showFileTree)}
        currentFile={currentFile}
        workspace={workspace}
        language={language}
        onLanguageChange={setLanguage}
        loading={loading}
        splitDirection={splitDirection}
        onToggleSplit={() => toggleSplit()}
        onFormat={handleFormat}
        onSave={handleSave}
        onRun={handleRun}
        settings={settings}
        updateSetting={updateSetting as (key: string, value: boolean) => void}
      />

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

      {/* Breadcrumbs — VS Code pattern (R5169: respect breadcrumbs setting) */}
      {currentFile && settings.breadcrumbs && (
        <BreadcrumbsBar
          filePath={currentFile}
          fileTree={fileTree}
          onNavigate={(dirPath) => {
            // Navigate to the directory — open it in file tree and show first file
            if (!expandedDirs.has(dirPath)) {
              setExpandedDirs(prev => new Set([...prev, dirPath]))
            }
          }}
          onFileSelect={(path) => {
            openFileFromStore(path, { preview: false })
          }}
        />
      )}

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: Explorer or Source Control */}
        {showFileTree && (
          <div className="flex flex-shrink-0">
            <ActivityBar
              activityView={activityView}
              onViewChange={setActivityView}
              gitStatusCount={Object.keys(gitStatusMap).length}
              errorCount={workspaceProblems.filter(p => p.severity === 'error').length}
            />
            {/* Sidebar Content */}
            <div className="bg-panel-bg/30 border-r border-glass-border overflow-hidden flex flex-col" style={{ width: `${sidebarWidth}px` }}>

            {activityView === 'explorer' ? (
              <ExplorerPanel
                workspace={workspace}
                currentFile={currentFile}
                gitStatusMap={gitStatusMap}
                openFiles={openFiles}
                dirtyFiles={dirtyFiles}
                onOpenFile={openFileFromStore}
                onCloseFile={closeFile}
                onToast={(type, title, message) => addToast(type, title, message)}
                onRefreshGitStatus={() => fetchGitStatusRef.current()}
                onRenameFileInStore={(oldPath, newPath) => useWorkspaceStore.getState().renameFileInStore(oldPath, newPath)}
                onSetPaneFile={setPaneFile}
                onFileTreeChange={setFileTree}
                onExpandedDirsChange={setExpandedDirs}
              />
            ) : activityView === 'sourceControl' ? (
              <div className="flex-1 overflow-hidden">
                <SourceControlPanel
                  onStatusChange={(files) => {
                    const map: Record<string, GitFileStatus> = {}
                    for (const f of files) { map[f.path] = f }
                    setGitStatusMap(map)
                  }}
                  onOpenFile={(path) => openFileFromStore(path, { preview: false })}
                />
              </div>
            ) : activityView === 'outline' ? (
              <div className="flex-1 overflow-hidden">
                <OutlinePanel
                  filePath={currentFile}
                  onSymbolClick={navigateToPosition}
                />
              </div>
            ) : null}
            </div>
          </div>
        )}

        {/* Sidebar resize handle (VS Code pattern — drag to resize, double-click to reset) */}
        {showFileTree && (
          <div
            className={`w-1 cursor-col-resize transition-colors flex-shrink-0 ${isResizingSidebar ? 'bg-accent/50' : 'hover:bg-accent/30'}`}
            onMouseDown={(e) => { e.preventDefault(); setIsResizingSidebar(true) }}
            onDoubleClick={() => setSidebarWidth(208)}
            title="Drag to resize, double-click to reset"
          />
        )}

        {/* Editor and Terminal Container */}
        <div className="flex-1 flex flex-col overflow-hidden" data-editor-container>
          {/* Conditional: Welcome or Editor */}
          {openFiles.length === 0 ? (
            <WelcomePanel
              recentFiles={recentFiles}
              onFileClick={handleWelcomeFileClick}
            />
          ) : (
            <>
              {/* Breadcrumb Navigation with LSP symbols (VS Code/Cursor pattern) */}
              {currentFile && (
                <EditorBreadcrumbs
                  currentFile={currentFile}
                  breadcrumbSymbols={breadcrumbSymbols}
                  gitStatusMap={gitStatusMap}
                  hasDiffView={!!diffView}
                  onOpenDiff={handleOpenDiff}
                  onNavigateToSymbol={(line, column) => {
                    navigateToPosition(line, column)
                  }}
                  onExpandDirectory={(dirPath) => {
                    setExpandedDirs(prev => {
                      const next = new Set(prev)
                      const segs = dirPath.split('/')
                      for (let i = 0; i < segs.length; i++) next.add(segs.slice(0, i + 1).join('/'))
                      return next
                    })
                  }}
                  onShowFileTree={() => setShowFileTree(true)}
                />
              )}
          {diffView ? (
            <div className="flex-1 overflow-hidden">
              <DiffEditorPanel
                original={diffView.original}
                modified={diffView.modified}
                language={diffView.language}
                filePath={diffView.filePath}
                onClose={() => setDiffView(null)}
              />
            </div>
          ) : (
          <div className={`flex-1 overflow-hidden ${splitDirection === 'horizontal' ? 'flex' : ''}`}>
            {/* Main pane */}
            <PrimaryEditorPane
              language={language}
              value={code}
              onChange={handleEditorChange}
              onMount={handleEditorMount}
              options={editorOptions}
              splitDirection={splitDirection}
              isDropTarget={dropTargetPane === 'main'}
              isInactive={splitDirection !== 'none' && activePaneId === 'secondary'}
              onDragOver={mainDragDrop.onDragOver}
              onDragLeave={mainDragDrop.onDragLeave}
              onDrop={mainDragDrop.onDrop}
            />
            {/* Secondary pane (split editor) */}
            {splitDirection === 'horizontal' && (
              <SecondaryEditorPane
                filePath={secondaryFile}
                language={secondaryLang}
                value={secondaryCode}
                onChange={handleSecondaryEditorChange}
                onMount={handleSecondaryEditorMount}
                options={editorOptions}
                isDropTarget={dropTargetPane === 'secondary'}
                isInactive={activePaneId === 'main'}
                onDragOver={secondaryDragDrop.onDragOver}
                onDragLeave={secondaryDragDrop.onDragLeave}
                onDrop={secondaryDragDrop.onDrop}
                onClose={handleCloseSplit}
              />
            )}
          </div>
          )}
            </>
          )}

          <BottomPanel />
        </div>
      </div>

      {/* R5128: Alt+F1 Accessibility Help Dialog (VS Code P1 pattern) */}
      {showAccessibilityHelp && (
        <AccessibilityHelpModal onClose={() => setShowAccessibilityHelp(false)} />
      )}

      {/* Agent Selector Modal */}
      {showAgentSelector && (
        <AgentSelectorModal
          swarms={swarms}
          onSelect={executeWithAgent}
          onClose={() => setShowAgentSelector(false)}
        />
      )}

      {/* Tab Context Menu (VS Code/Cursor pattern) */}
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
        onSplitRight={(path) => {
          if (splitDirection === 'none') toggleSplit()
          setPaneFile('secondary', path)
          setActivePane('secondary')
        }}
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

      {/* Dirty file close confirmation (VS Code/Cursor pattern — Save / Don't Save / Cancel) */}
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
          if (path === currentFile) {
            await handleSave()
          } else {
            saveSingleFile({ path, fileContents, clearDirty, addToast })
            fetchGitStatusRef.current()
          }
          closeFile(path)
        }}
        onSaveAllAndClose={async () => {
          const dirtyPaths = openFiles.filter(f => dirtyFiles.has(f))
          autoSaveDirtyFiles({ paths: dirtyPaths, fileContents, clearDirty, fetchGitStatus: () => fetchGitStatusRef.current(), addToast })
          setDirtyClosePath(null)
          closeAllFiles()
        }}
      />
    </div>
  )
}
