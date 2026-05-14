import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useAppStore } from '../store/appStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useSplitPaneStore } from '../stores/splitPaneStore'
import { useSettings } from '../hooks/useSettings'
import { useTheme } from '../hooks/useTheme'
import { useWindowEvent } from '../hooks/useWindowEvent'
import { useEditorSettingsEvents } from '../hooks/useEditorSettingsEvents'
import { useCommandPaletteEvents } from '../hooks/useCommandPaletteEvents'
import { useDiagnostics } from '../hooks/useDiagnostics'
import { useGitDiffDecorations } from '../hooks/useGitDiffDecorations'
import { FileEntry, GitFileStatus } from '../services'
import { lspApi } from '../services/lspApi'
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
import { useMenuKeyboardNav } from '../hooks/useMenuKeyboardNav'
import { registerSwarmTheme, getMonacoTheme } from '../theme/monacoTheme'
import { LSP_LANG_MAP, buildEditorOptions } from '../utils/monaco'
import { registerLSPProviders } from '../utils/monacoLSP'
import { createEditorChangeHandler } from '../utils/monacoEditorChange'
import { handleSaveForEditor, saveFileByPath } from '../utils/editorSave'
import { registerCommonEditorCommands } from '../utils/monacoCommonCommands'
import { findSymbolPath } from '../utils/monacoSymbols'
import { navigateProblem as navigateProblemUtil } from '../utils/navigateProblem'
import { executeWithAgent as executeWithAgentUtil } from '../utils/executeWithAgent'
import { registerSecondaryContentChangeListener } from '../utils/monacoEditorMount'
import { loadFile as loadFileUtil } from '../utils/loadFile'
import { useWorkspaceInit } from '../hooks/useWorkspaceInit'
import { autoSaveDirtyFiles, saveSingleFile } from '../utils/tabCloseActions'
import { createEditorDragDropHandlers } from '../utils/editorDragDrop'
import { createTabCloseHandlers } from '../utils/tabCloseHandlers'
import { useFileWatcher } from '../hooks/useFileWatcher'
import { useGitStatus } from '../hooks/useGitStatus'
import { useEditorUIState } from '../hooks/useEditorUIState'
import { useEditorWindowEvents } from '../hooks/useEditorWindowEvents'
import { usePaneModelSync } from '../hooks/usePaneModelSync'
import { useSearchParamNavigation } from '../hooks/useSearchParamNavigation'

export default function EditorPanel() {
  const swarms = useAppStore(state => state.swarms)
  const addToast = useAppStore(state => state.addToast)
  const updateFileProblems = useAppStore(state => state.updateFileProblems)
  const workspaceProblems = useAppStore(state => state.workspaceProblems)
  const { settings, updateSetting } = useSettings()
  const { effectiveTheme } = useTheme()

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
  const cursorPosition = useAppStore(state => state.editorCursorPosition)

  // workspaceStore — multi-file tabs
  const openFiles = useWorkspaceStore(state => state.openFiles)
  const currentFile = useWorkspaceStore(state => state.currentFile)
  const fileContents = useWorkspaceStore(state => state.fileContents)
  const dirtyFiles = useWorkspaceStore(state => state.dirtyFiles)
  const pinnedFiles = useWorkspaceStore(state => state.pinnedFiles)
  const previewTab = useWorkspaceStore(state => state.previewTab)
  const wsLanguage = useWorkspaceStore(state => state.language)
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

  // splitPaneStore — split editor state
  const splitDirection = useSplitPaneStore(s => s.splitDirection)
  const activePaneId = useSplitPaneStore(s => s.activePaneId)
  const setActivePane = useSplitPaneStore(s => s.setActivePane)
  const toggleSplit = useSplitPaneStore(s => s.toggleSplit)
  const closeSplit = useSplitPaneStore(s => s.closeSplit)
  const paneFiles = useSplitPaneStore(s => s.paneFiles)
  const setPaneFile = useSplitPaneStore(s => s.setPaneFile)
  const updateFileContent = useWorkspaceStore(state => state.updateFileContent)
  const clearDirty = useWorkspaceStore(state => state.clearDirty)
  const setLanguage = useWorkspaceStore(state => state.setLanguage)

  // Format document handler (VS Code/Cursor pattern)
  const handleFormat = useCallback(() => {
    const editor = activePaneId === 'secondary' && splitDirection !== 'none'
      ? secondaryEditorRef.current
      : editorRef.current
    if (editor) {
      const formatAction = editor.getAction('editor.action.formatDocument')
      if (formatAction) {
        formatAction.run()
      }
    }
  }, [activePaneId, splitDirection])

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

  // Monaco model cache (per-file undo history)
  const modelCacheRef = useRef<Map<string, editor.ITextModel>>(new Map())
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null)
  const mountedRef = useRef(true)
  const lspDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lspOpenFileRef = useRef<string | null>(null)
  const lspIncrementalRef = useRef(false)
  const lspPendingChangesRef = useRef<any[]>([])
  const lspInitiatedEditRef = useRef(false) // true while LSP edit is being applied to model
  const externalReloadRef = useRef(false) // true while external file reload is being applied to model
  const providerDisposablesRef = useRef<any[]>([])
  const viewStateMapRef = useRef<Map<string, editor.ICodeEditorViewState>>(new Map()) // VS Code: remember scroll/cursor per file

  // Secondary pane refs (for split editor)
  const secondaryEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const secondaryLspOpenFileRef = useRef<string | null>(null)
  const secondaryLspDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const secondaryLspIncrementalRef = useRef(false)
  const secondaryLspPendingChangesRef = useRef<any[]>([])
  const secondaryLspInitiatedEditRef = useRef(false)
  const secondaryAutoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const secondaryDisposablesRef = useRef<any[]>([])

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

  // P1 fix: Handle close split with proper LSP cleanup (was bypassed by X button)
  const handleCloseSplit = useCallback(() => {
    // Dispose secondary editor listeners before closing
    secondaryDisposablesRef.current.forEach((d: any) => d.dispose())
    secondaryDisposablesRef.current = []
    // P2 fix: Clear pending auto-save timeout (was leaving dangling timeout)
    if (secondaryAutoSaveTimeoutRef.current) {
      clearTimeout(secondaryAutoSaveTimeoutRef.current)
      secondaryAutoSaveTimeoutRef.current = null
    }
    // P1 fix: Send didClose before clearing reference (was missing)
    if (secondaryLspOpenFileRef.current) {
      lspApi.didClose(secondaryLspOpenFileRef.current).catch(() => {})
    }
    // Clear secondary LSP file reference (fix: stale state on reopen)
    secondaryLspOpenFileRef.current = null
    closeSplit()
  }, [closeSplit])

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

  // Monaco Editor 初始化 - 注册自定义主题 + LSP providers
  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    registerSwarmTheme(monaco)
    monaco.editor.setTheme(getMonacoTheme(effectiveTheme))

    // Dispose previous providers to prevent duplicates on remount
    providerDisposablesRef.current.forEach(d => d.dispose())
    providerDisposablesRef.current = []

    const disposables: any[] = []

    registerLSPProviders(monaco, editor, disposables, {
      inlayHintsRef,
      lspInitiatedEditRef,
      lspOpenFileRef,
      lspPendingChangesRef,
    })
    // Register common keybindings shared with secondary pane
    registerCommonEditorCommands({
      editor,
      monaco,
      disposables,
      settings,
      updateSetting: updateSetting as (key: string, value: any) => void,
      onSave: handleSave,
      onAccessibilityHelp: () => setShowAccessibilityHelp(true),
      onFocusOutline: () => { setShowFileTree(true); setActivityView('outline') },
      onNavigateProblem: (direction) => navigateProblemRef.current(editor, currentFile, direction),
    })

    providerDisposablesRef.current = disposables
  }

  // Track mounted state to prevent setState on unmounted component
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (lspDebounceRef.current) clearTimeout(lspDebounceRef.current)
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current)
      // Main pane LSP cleanup (P2 fix: was missing)
      if (lspOpenFileRef.current) {
        lspApi.didClose(lspOpenFileRef.current).catch(() => {})
      }
      // Secondary pane cleanup
      if (secondaryLspDebounceRef.current) clearTimeout(secondaryLspDebounceRef.current)
      if (secondaryAutoSaveTimeoutRef.current) clearTimeout(secondaryAutoSaveTimeoutRef.current)
      if (secondaryLspOpenFileRef.current) {
        lspApi.didClose(secondaryLspOpenFileRef.current).catch(() => {})
      }
      // Dispose LSP providers to prevent leaks on remount
      providerDisposablesRef.current.forEach(d => d.dispose())
      providerDisposablesRef.current = []
    }
  }, [])

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

  // Main editor focus tracking
  useEffect(() => {
    const checkFocus = () => {
      if (editorRef.current?.hasTextFocus()) {
        setActivePane('main')
      }
    }
    const interval = setInterval(checkFocus, 200)
    return () => clearInterval(interval)
  }, [setActivePane])

  useWorkspaceInit({ mountedRef, setLoading, setWorkspace, addToast })

  const loadFile = async (entry: FileEntry) => {
    loadFileUtil({
      path: entry.path, splitDirection, mountedRef, setLoading,
      openFile: openFileFromStore, setPaneFile, setRecentFiles,
      addToast: (type, title, message) => addToast(type, title, message),
    })
  }

  const handleSave = async () => {
    // Save the active pane's editor (split-aware)
    // R5097: Use getState() to avoid stale closure in addCommand handlers
    const { activePaneId: paneId, splitDirection: split } = useSplitPaneStore.getState()
    const isSecondary = paneId === 'secondary' && split !== 'none'
    await handleSaveForEditor({
      editorInstance: isSecondary ? secondaryEditorRef.current : editorRef.current,
      lspOpenFileRef: isSecondary ? secondaryLspOpenFileRef : lspOpenFileRef,
      lspDebounceRef: isSecondary ? secondaryLspDebounceRef : lspDebounceRef,
      lspPendingChangesRef: isSecondary ? secondaryLspPendingChangesRef : lspPendingChangesRef,
      lspInitiatedEditRef: isSecondary ? secondaryLspInitiatedEditRef : lspInitiatedEditRef,
      monacoRef,
      mountedRef,
      modelCacheRef,
      updateFileContent,
      clearDirty,
      fetchGitStatusRef,
      setLoading,
      addToast: useAppStore.getState().addToast,
    })
  }

  // P1 fix: Save a specific file by path (for auto-save when user may have switched tabs)
  const handleSaveFileByPath = async (filePath: string) => {
    await saveFileByPath({
      filePath,
      modelCacheRef,
      fileContents,
      mountedRef,
      clearDirty,
      updateFileContent,
      lspOpenFileRef,
      secondaryLspOpenFileRef,
      fetchGitStatusRef,
      setLoading,
      addToast: useAppStore.getState().addToast,
    })
  }

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
  const handleSecondaryEditorMount: OnMount = (editor, monaco) => {
    secondaryEditorRef.current = editor

    // Clear previous secondary disposables
    secondaryDisposablesRef.current.forEach((d: any) => d.dispose())
    secondaryDisposablesRef.current = []

    // Focus tracking — set this pane as active when focused
    secondaryDisposablesRef.current.push(
      editor.onDidFocusEditorWidget(() => {
        setActivePane('secondary')
      })
    )

    // Per-pane content change listener for incremental LSP sync
    registerSecondaryContentChangeListener({
      editor,
      disposables: secondaryDisposablesRef.current,
      secondaryLspInitiatedEditRef,
      secondaryLspPendingChangesRef,
    })

    // Register common keybindings shared with main pane
    registerCommonEditorCommands({
      editor,
      monaco,
      disposables: secondaryDisposablesRef.current,
      settings,
      updateSetting: updateSetting as (key: string, value: any) => void,
      onSave: () => handleSaveForEditor({
        editorInstance: editor,
        lspOpenFileRef: secondaryLspOpenFileRef,
        lspDebounceRef: secondaryLspDebounceRef,
        lspPendingChangesRef: secondaryLspPendingChangesRef,
        lspInitiatedEditRef: secondaryLspInitiatedEditRef,
        monacoRef,
        mountedRef,
        modelCacheRef,
        updateFileContent,
        clearDirty,
        fetchGitStatusRef,
        setLoading,
        addToast: useAppStore.getState().addToast,
      }),
      onAccessibilityHelp: () => setShowAccessibilityHelp(true),
      onFocusOutline: () => { setShowFileTree(true); setActivityView('outline') },
      onNavigateProblem: (direction) => navigateProblemRef.current(editor, secondaryFile, direction),
    })
  }

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

  // File tree context menu handlers (P1 feature - Cursor/VS Code pattern)
  const handleTabContextMenu = (e: React.MouseEvent, path: string) => {
    setTabContextMenu({ visible: true, x: e.clientX, y: e.clientY, path })
  }

  const closeTabContextMenu = () => {
    setTabContextMenu({ visible: false, x: 0, y: 0, path: null })
  }

  const tabMenuKeyDown = useMenuKeyboardNav(tabContextMenuRef, closeTabContextMenu)

  // Close tab context menu on click outside / Escape
  useEffect(() => {
    if (!tabContextMenu.visible) return
    const handleClick = () => closeTabContextMenu()
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') closeTabContextMenu() }
    const stopNativePropagation = (e: Event) => e.stopPropagation()
    // Capture ref at effect setup time for cleanup
    const menuRef = tabContextMenuRef.current
    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleEscape)
    menuRef?.addEventListener('click', stopNativePropagation, true)
    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleEscape)
      menuRef?.removeEventListener('click', stopNativePropagation, true)
    }
  }, [tabContextMenu.visible])

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
                  onSymbolClick={(line, column) => {
                    // R5097: Navigate in the active pane's editor
                    const activeEditor = activePaneId === 'secondary' ? secondaryEditorRef.current : editorRef.current
                    if (activeEditor) {
                      activeEditor.revealLineInCenter(line + 1)
                      activeEditor.setPosition({
                        lineNumber: line + 1,
                        column: column + 1
                      })
                      activeEditor.focus()
                    }
                  }}
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
                    const activeEditor = activePaneId === 'secondary' ? secondaryEditorRef.current : editorRef.current
                    if (activeEditor) {
                      activeEditor.setSelection({
                        startLineNumber: line + 1,
                        startColumn: column + 1,
                        endLineNumber: line + 1,
                        endColumn: column + 1,
                      })
                      activeEditor.revealRangeInCenter({
                        startLineNumber: line + 1,
                        startColumn: column + 1,
                        endLineNumber: line + 1,
                        endColumn: column + 1,
                      })
                      activeEditor.focus()
                    }
                  }}
                  onExpandDirectory={(dirPath) => {
                    const segs = dirPath.split('/')
                    const newExpanded = new Set(expandedDirs)
                    for (let i = 0; i < segs.length; i++) {
                      newExpanded.add(segs.slice(0, i + 1).join('/'))
                    }
                    setExpandedDirs(newExpanded)
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
