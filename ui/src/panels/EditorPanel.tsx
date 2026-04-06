import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useSearchParams } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useSplitPaneStore } from '../stores/splitPaneStore'
import { useSettings } from '../hooks/useSettings'
import { useTheme } from '../hooks/useTheme'
import {
  PanelLeft, Play, Save, ChevronRight, ChevronDown, Folder, FileText, X, Zap,
  FilePlus, FolderPlus, Copy, Trash2, Pencil, Clipboard, Columns2, XCircle,
  ChevronsDownUp, ChevronsUpDown, AlertTriangle, Search, GitCompare, GitBranch, Files,
  Wand2, MoreHorizontal, Map as MapIcon, WrapText, FolderOpen,
  ListTree, // VS Code outline panel icon
  Scissors, ClipboardPaste,
} from 'lucide-react'
import { api, FileEntry, gitApi, GitFileStatus } from '../services'
import { lspApi } from '../services/lspApi'
import { getWebSocketClient } from '../services/websocket'
import TerminalPanel from './TerminalPanel'
import ProblemsPanel from './ProblemsPanel'
import { TabBar } from '../components/TabBar'
import { BreadcrumbsBar } from '../components/BreadcrumbsBar'
import { WelcomePanel } from '../components/WelcomePanel'
import { ConfirmDialog } from '../components/ConfirmDialog'
import DiffEditorPanel from '../components/DiffEditorPanel'
import SourceControlPanel from '../components/SourceControlPanel'
import { OutlinePanel } from '../components/OutlinePanel'
import { gitDiffApi } from '../services/api'
import { logger, getFileIcon, getFileIconColor } from '../utils'
import { useMenuKeyboardNav } from '../hooks/useMenuKeyboardNav'
import { registerSwarmTheme, getMonacoTheme } from '../theme/monacoTheme'

// Single source of truth for LSP language support (extension → LSP language ID)
const LSP_LANG_MAP: Record<string, string> = {
  'go': 'go', 'rs': 'rust', 'py': 'python',
  'ts': 'typescript', 'tsx': 'typescriptreact',
  'js': 'javascript', 'jsx': 'javascriptreact',
  'java': 'java', 'c': 'c', 'cpp': 'cpp',
  'cs': 'csharp', 'cc': 'cpp', 'h': 'c', 'hpp': 'cpp',
}

function getLSPLanguageId(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  return LSP_LANG_MAP[ext] || null
}

function hasLSPSupport(filePath: string): boolean {
  return getLSPLanguageId(filePath) !== null
}

// Shared Monaco editor options (DRY — used by both main and secondary pane)
function buildEditorOptions(overrides: { minimapEnabled?: boolean; [key: string]: any } = {}): any {
  const { minimapEnabled, ...rest } = overrides
  return {
    fontSize: 14,
    fontFamily: 'JetBrains Mono, Fira Code, monospace',
    fontLigatures: true,
    minimap: { enabled: minimapEnabled ?? true, renderCharacters: true, maxColumn: 80 },
    scrollBeyondLastLine: true,
    smoothScrolling: true,
    cursorSmoothCaretAnimation: 'off',
    cursorBlinking: 'blink',
    automaticLayout: true,
    dragAndDrop: true,
    tabSize: 2,
    insertSpaces: true,
    wordWrap: 'on',
    lineNumbers: 'on',
    renderWhitespace: 'selection',
    renderLineHighlight: 'all',
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true, indentation: true, highlightActiveBracketPair: true, highlightActiveIndentation: true },
    stickyScroll: { enabled: true },
    padding: { top: 16, bottom: 16 },
    autoClosingBrackets: 'always',
    autoClosingQuotes: 'always',
    autoClosingDelete: 'always',
    autoSurround: 'languageDefined',
    linkedEditing: true,
    find: { addExtraSpaceOnTop: false, autoFindInSelection: 'multiline', seedSearchStringFromSelection: 'selection' },
    suggest: {
      preview: true, showMethods: true, showFunctions: true, showConstructors: true,
      showFields: true, showVariables: true, showClasses: true, showStructs: true,
      showInterfaces: true, showModules: true, showProperties: true, showEvents: true,
      showOperators: true, showUnits: true, showValues: true, showConstants: true,
      showEnums: true, showEnumMembers: true, showKeywords: true, showWords: true,
      showColors: true, showFiles: true, showReferences: true, showFolders: true,
      showTypeParameters: true, showSnippets: true, showInlineSuggestions: true,
    },
    inlineSuggest: { enabled: true },
    parameterHints: { enabled: true },
    autoIndent: 'full',
    formatOnPaste: true,
    selectionHighlight: true,
    occurrencesHighlight: 'singleFile',
    roundedSelection: true,
    overviewRulerBorder: false,
    hideCursorInOverviewRuler: true,
    renderLineHighlightOnlyWhenFocus: false,
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    ...rest,
  }
}

// Convert LSP SelectionRange tree to Monaco SelectionRange[] (flat array, smallest to largest)
// Monaco expects SelectionRange[][] — outer array per position, inner array is expand chain
// LSP returns { range, parent: { range, parent: ... } } — linked tree from inner to outer
function convertSelectionRangeChain(sr: any, monacoInstance: any): any[] {
  const chain: any[] = []
  let current: any = sr
  while (current) {
    chain.push({
      range: new monacoInstance.Range(
        current.range.start.line + 1, current.range.start.character + 1,
        current.range.end.line + 1, current.range.end.character + 1,
      ),
    })
    current = current.parent
  }
  // chain is now [innermost, ..., outermost] — Monaco expects this order for expand selection
  return chain
}

// Parse LSP WorkspaceEdit into Monaco TextEdit[] for a single model
// P2 fix: Filter by file URI - WorkspaceEdit.changes is keyed by URI string
function parseWorkspaceEdits(model: any, edit: any, monacoInstance: any): any[] {
  if (!edit?.changes) return []
  const edits: any[] = []
  const modelUri = model?.uri?.toString()
  if (!modelUri) return []

  // LSP WorkspaceEdit.changes is { [uri: string]: TextEdit[] }
  // Only process edits for this model's file
  const fileEdits = edit.changes[modelUri]
  if (!fileEdits) return []

  for (const e of fileEdits) {
    edits.push({
      range: new monacoInstance.Range(
        e.range.start.line + 1, e.range.start.character + 1,
        e.range.end.line + 1, e.range.end.character + 1,
      ),
      text: e.newText,
    })
  }
  return edits
}

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

  // Bottom panel tab state
  const [bottomTab, setBottomTab] = useState<'terminal' | 'problems' | 'output' | 'debug' | 'search'>('terminal')
  const [showBottomPanel, setShowBottomPanel] = useState(true)
  const [showFileTree, setShowFileTree] = useState(true)
  // Activity Bar view: 'explorer' | 'search' | 'sourceControl' | null (null = sidebar hidden)
  const [activityView, setActivityView] = useState<'explorer' | 'search' | 'sourceControl' | 'outline'>('explorer')
  const [fileTree, setFileTree] = useState<FileEntry[]>([])
  const [workspace, setWorkspace] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const [diffView, setDiffView] = useState<{ original: string; modified: string; language: string; filePath: string } | null>(null)
  const [showAgentSelector, setShowAgentSelector] = useState(false)
  const [showAccessibilityHelp, setShowAccessibilityHelp] = useState(false)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [fileTreeFilter, setFileTreeFilter] = useState('')
  const [showMoreActions, setShowMoreActions] = useState(false)
  const moreActionsRef = useRef<HTMLDivElement>(null)
  const moreActionsMenuRef = useRef<HTMLDivElement>(null)
  const moreActionsKeyDown = useMenuKeyboardNav(moreActionsMenuRef, () => setShowMoreActions(false))

  // R5080: Git diff gutter decoration IDs (Monaco deltaDecorations pattern)
  const gitDiffDecorationIdsRef = useRef<string[]>([])
  const secondaryGitDiffDecorationIdsRef = useRef<string[]>([])

  // File tree context menu state (P1 feature - Cursor/VS Code pattern)
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean
    x: number
    y: number
    entry: FileEntry | null
  }>({ visible: false, x: 0, y: 0, entry: null })
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; name: string } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // File tree clipboard for Cut/Copy/Paste (VS Code pattern)
  const [fileClipboard, setFileClipboard] = useState<{ path: string; isDirectory: boolean; operation: 'copy' | 'cut' } | null>(null)

  // Resizable sidebar (VS Code pattern — drag edge to resize, persisted to localStorage)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try { const v = localStorage.getItem('sidebarWidth'); return v ? parseInt(v, 10) : 208 } catch { return 208 }
  })
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)

  // Resizable bottom panel (VS Code pattern — drag top edge to resize, persisted to localStorage)
  const [bottomPanelHeight, setBottomPanelHeight] = useState(() => {
    try { const v = localStorage.getItem('bottomPanelHeight'); return v ? parseInt(v, 10) : 200 } catch { return 200 }
  })
  const [bottomPanelPreMaxHeight, setBottomPanelPreMaxHeight] = useState(200)
  const [isResizingBottom, setIsResizingBottom] = useState(false)

  // Persist panel sizes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('sidebarWidth', String(sidebarWidth))
    } catch {
      // Silently ignore localStorage errors
    }
  }, [sidebarWidth])
  useEffect(() => {
    try {
      localStorage.setItem('bottomPanelHeight', String(bottomPanelHeight))
    } catch {
      // Silently ignore localStorage errors
    }
  }, [bottomPanelHeight])

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

  // Clamp context menu to viewport
  useEffect(() => {
    if (!contextMenu.visible || !contextMenuRef.current) return
    const rect = contextMenuRef.current.getBoundingClientRect()
    const menu = contextMenuRef.current
    if (rect.right > window.innerWidth) {
      menu.style.left = `${window.innerWidth - rect.width - 8}px`
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${window.innerHeight - rect.height - 8}px`
    }
  }, [contextMenu.visible, contextMenu.x, contextMenu.y])
  const [renamingEntry, setRenamingEntry] = useState<FileEntry | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [newFileDialog, setNewFileDialog] = useState<{ parentPath: string; isFolder: boolean } | null>(null)
  const [newFileName, setNewFileName] = useState('')
  const [dirtyClosePath, setDirtyClosePath] = useState<string | null>(null)

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

  // R5080/R5083: Update git diff gutter decorations (VS Code/Cursor pattern)
  // Supports both main and secondary panes
  const updateGitDiffDecorations = useCallback(async (filePath: string | null, isSecondary: boolean = false) => {
    const editor = isSecondary ? secondaryEditorRef.current : editorRef.current
    const monaco = monacoRef.current
    const decorationIdsRef = isSecondary ? secondaryGitDiffDecorationIdsRef : gitDiffDecorationIdsRef

    if (!editor || !monaco || !filePath) {
      // Clear decorations when no file
      if (editor && decorationIdsRef.current.length > 0) {
        decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, [])
      }
      return
    }

    const status = gitStatusMap[filePath]
    // Only show decorations for tracked files with changes (not untracked)
    if (!status || status.status === '??') {
      if (decorationIdsRef.current.length > 0) {
        decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, [])
      }
      return
    }

    try {
      const result = await gitDiffApi.getLineDiff(filePath, status.staged)
      const decorations = result.ranges.map((range) => {
        const isAdded = range.type === 'added'
        const isRemoved = range.type === 'removed'
        const startLine = isRemoved ? range.startOld : range.startNew
        const endLine = isRemoved ? range.endOld : range.endNew

        // Skip invalid ranges
        if (startLine <= 0 || endLine <= 0) return null

        const gutterClass = isAdded
          ? 'git-diff-added-gutter'
          : isRemoved
            ? 'git-diff-removed-gutter'
            : 'git-diff-modified-gutter'

        const lineClass = isAdded
          ? 'git-diff-added-line'
          : isRemoved
            ? 'git-diff-removed-line'
            : 'git-diff-modified-line'

        // R5123: Add overview ruler colors for minimap visibility
        const overviewRulerColor = isAdded
          ? '#2ea043'
          : isRemoved
            ? '#f85149'
            : '#e3b341'

        return {
          range: new monaco.Range(startLine, 1, endLine, 1),
          options: {
            isWholeLine: true,
            linesDecorationsClassName: gutterClass,
            className: lineClass,
            overviewRuler: {
              color: overviewRulerColor,
              darkColor: overviewRulerColor,
              position: monaco.editor.OverviewRulerLane.Left,
            },
          },
        }
      }).filter(Boolean)

      decorationIdsRef.current = editor.deltaDecorations(
        decorationIdsRef.current,
        decorations as any[],
      )
    } catch {
      // Git diff unavailable — clear decorations silently
      if (decorationIdsRef.current.length > 0) {
        decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, [])
      }
    }
  }, [gitStatusMap])

  // R5080: Update decorations when main file changes or git status changes
  useEffect(() => {
    updateGitDiffDecorations(currentFile, false)
  }, [currentFile, gitStatusMap, updateGitDiffDecorations])

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

  // R5083: Update decorations for secondary pane
  useEffect(() => {
    if (splitDirection === 'horizontal' && secondaryFile) {
      updateGitDiffDecorations(secondaryFile, true)
    }
  }, [secondaryFile, gitStatusMap, splitDirection, updateGitDiffDecorations])

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

  // Get or create Monaco model for a file (preserves undo history per file)
  const getOrCreateModel = useCallback((path: string, content: string, lang: string) => {
    if (!monacoRef.current) return null
    const monaco = monacoRef.current
    const uri = monaco.Uri.file(path)

    const cachedModel = modelCacheRef.current.get(path)
    if (cachedModel) return cachedModel

    const existingModel = monaco.editor.getModel(uri)
    if (existingModel) {
      modelCacheRef.current.set(path, existingModel)
      return existingModel
    }

    const newModel = monaco.editor.createModel(content, lang, uri)
    modelCacheRef.current.set(path, newModel)
    return newModel
  }, [])

  // P1 fix: Close LSP file when currentFile becomes null (all tabs closed)
  // This must be a separate useEffect because the main effect exits early when currentFile is null
  useEffect(() => {
    if (!currentFile && lspOpenFileRef.current) {
      lspApi.didClose(lspOpenFileRef.current).catch(() => {})
      lspOpenFileRef.current = null
    }
  }, [currentFile])

  // Switch editor model when currentFile changes (includes LSP sync)
  useEffect(() => {
    if (!currentFile || !editorRef.current || !monacoRef.current) return
    const content = fileContents.get(currentFile)
    if (content === undefined) return
    const model = getOrCreateModel(currentFile, content, wsLanguage)
    if (model && editorRef.current.getModel() !== model) {
      // VS Code: save view state of old file before switching
      const oldModel = editorRef.current.getModel()
      if (oldModel) {
        const vs = editorRef.current.saveViewState()
        if (vs) viewStateMapRef.current.set(oldModel.uri.toString(), vs)
      }
      editorRef.current.setModel(model)
      // VS Code: restore view state of new file
      const saved = viewStateMapRef.current.get(model.uri.toString())
      if (saved) {
        editorRef.current.restoreViewState(saved)
      }
    }

    // LSP document sync: close old file, open new file
    const lspLang = getLSPLanguageId(currentFile)

    if (lspLang && model) {
      // Close previous file and clear its markers (if different from current)
      if (lspOpenFileRef.current && lspOpenFileRef.current !== currentFile) {
        lspApi.didClose(lspOpenFileRef.current).catch(() => {})
        monacoRef.current.editor.setModelMarkers(model, 'lsp', [])
      }
      // Open new file
      lspOpenFileRef.current = currentFile
      lspIncrementalRef.current = false
      // Don't clear lspPendingChangesRef here — only clear on explicit didOpen
      lspApi.didOpen(`file://${currentFile}`, currentFile, lspLang, content).catch(() => {})
      // Check if server supports incremental sync
      lspApi.supportsIncrementalSync(currentFile).then((r: any) => {
        lspIncrementalRef.current = !!r?.supported
      }).catch(() => { lspIncrementalRef.current = false })
      // Fetch diagnostics after gopls has time to analyze
      setTimeout(() => fetchDiagnostics(), 500)
      // Fetch document symbols for breadcrumb navigation
      fetchDocumentSymbols(currentFile)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchDiagnostics is stable (useCallback)
  }, [currentFile, fileContents, wsLanguage, getOrCreateModel])

  // Fetch document symbols for breadcrumb navigation (VS Code/Cursor pattern)
  // P1 fix: Added isSecondary parameter to track per-pane symbols
  const fetchDocumentSymbols = async (filePath: string, isSecondary: boolean = false) => {
    if (!hasLSPSupport(filePath)) {
      if (isSecondary) {
        setSecondaryDocumentSymbols([])
      } else {
        setDocumentSymbols([])
      }
      return
    }
    try {
      const result = await lspApi.documentSymbols(filePath)
      if (result?.symbols?.length) {
        if (isSecondary) {
          setSecondaryDocumentSymbols(result.symbols)
        } else {
          setDocumentSymbols(result.symbols)
        }
      } else {
        if (isSecondary) {
          setSecondaryDocumentSymbols([])
        } else {
          setDocumentSymbols([])
        }
      }
    } catch {
      if (isSecondary) {
        setSecondaryDocumentSymbols([])
      } else {
        setDocumentSymbols([])
      }
    }
  }

  // Find symbol path for cursor position (returns chain from root to containing symbol)
  const findSymbolPath = useCallback((symbols: any[], line: number, column: number): any[] => {
    for (const sym of symbols) {
      // Guard against malformed LSP data (null range, missing properties, non-numeric values)
      if (!sym?.range?.start || !sym?.range?.end) continue
      if (typeof sym.range.start.line !== 'number' || typeof sym.range.end.line !== 'number') continue
      if (typeof sym.range.start.character !== 'number' || typeof sym.range.end.character !== 'number') continue
      const startLine = sym.range.start.line + 1
      const endLine = sym.range.end.line + 1
      const startCol = sym.range.start.character + 1
      const endCol = sym.range.end.character + 1

      // Check if cursor is within this symbol's range
      if (line >= startLine && line <= endLine) {
        if (line === startLine && column < startCol) continue
        if (line === endLine && column > endCol) continue

        // Cursor is in this symbol - check children for more specific scope
        if (sym.children?.length) {
          const childPath = findSymbolPath(sym.children, line, column)
          if (childPath.length) {
            return [sym, ...childPath]
          }
        }
        // No child contains cursor - this is the innermost containing symbol
        return [sym]
      }
    }
    return []
  }, [])

  // Compute breadcrumb symbols based on cursor position
  // P1 fix: Use correct symbols based on active pane (was always using main pane symbols)
  const breadcrumbSymbols = useMemo(() => {
    const symbols = activePaneId === 'secondary' ? secondaryDocumentSymbols : documentSymbols
    if (!cursorPosition || !symbols.length) return []
    return findSymbolPath(symbols, cursorPosition.line, cursorPosition.column)
  }, [cursorPosition, documentSymbols, secondaryDocumentSymbols, activePaneId, findSymbolPath])

  // R5093: Navigate between problems (F8/Shift+F8) - VS Code pattern
  const navigateProblem = useCallback((editorInstance: editor.IStandaloneCodeEditor, curFile: string | null, direction: 1 | -1 = 1) => {
    if (workspaceProblems.length === 0) return
    const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2, hint: 3 }
    const sorted = [...workspaceProblems].sort((a, b) => {
      if (a.file !== b.file) return a.file.localeCompare(b.file)
      if (severityOrder[a.severity] !== severityOrder[b.severity]) return severityOrder[a.severity] - severityOrder[b.severity]
      return a.line - b.line || a.column - b.column
    })
    const pos = editorInstance.getPosition()
    let idx = -1
    if (pos && curFile) {
      if (direction === 1) {
        idx = sorted.findIndex(p =>
          p.file > curFile ||
          p.file === curFile && p.line > pos.lineNumber - 1 ||
          p.file === curFile && p.line === pos.lineNumber - 1 && p.column > pos.column
        )
      } else {
        idx = sorted.findIndex(p =>
          p.file > curFile ||
          p.file === curFile && p.line > pos.lineNumber - 1 ||
          p.file === curFile && p.line === pos.lineNumber - 1 && p.column > pos.column
        )
        idx = idx <= 0 ? sorted.length - 1 : idx - 1
      }
    }
    if (idx < 0) idx = direction === 1 ? 0 : sorted.length - 1
    const problem = sorted[idx]
    setBottomTab('problems')
    setShowBottomPanel(true)
    if (problem.file !== curFile) {
      openFileFromStore(problem.file).then(() => {
        // R5097: Use the editor instance passed in, not hardcoded editorRef
        if (editorInstance) {
          editorInstance.revealLineInCenter(problem.line + 1)
          editorInstance.setPosition({ lineNumber: problem.line + 1, column: problem.column + 1 })
          editorInstance.focus()
        }
      })
    } else {
      editorInstance.revealLineInCenter(problem.line + 1)
      editorInstance.setPosition({ lineNumber: problem.line + 1, column: problem.column + 1 })
      editorInstance.focus()
    }
  }, [workspaceProblems, openFileFromStore])

  // Ref to avoid stale closure in addCommand handlers (onMount runs once)
  const navigateProblemRef = useRef(navigateProblem)
  navigateProblemRef.current = navigateProblem

  // Open file and scroll to line when URL ?file=&line= params change (Problems panel, search results)
  const [searchParams] = useSearchParams()
  useEffect(() => {
    const fileParam = searchParams.get('file')
    const lineParam = searchParams.get('line')

    if (fileParam && fileParam !== currentFile) {
      // Open the file first, then scroll to line after it loads
      openFileFromStore(fileParam).then(() => {
        if (lineParam && editorRef.current) {
          const line = parseInt(lineParam, 10)
          if (!isNaN(line) && line >= 0) {
            editorRef.current.revealLineInCenter(line + 1)
            editorRef.current.setPosition({ lineNumber: line + 1, column: 1 })
            editorRef.current.focus()
          }
        }
      })
    } else if (lineParam && editorRef.current) {
      const line = parseInt(lineParam, 10)
      if (!isNaN(line) && line >= 0) {
        editorRef.current.revealLineInCenter(line + 1)
        editorRef.current.setPosition({ lineNumber: line + 1, column: 1 })
        editorRef.current.focus()
      }
    }
  }, [searchParams, currentFile, openFileFromStore])

  // P1 fix: Close LSP file when secondaryFile becomes null (secondary pane closed)
  // This must be a separate useEffect because the main effect exits early when secondaryFile is null
  useEffect(() => {
    if (!secondaryFile && secondaryLspOpenFileRef.current) {
      lspApi.didClose(secondaryLspOpenFileRef.current).catch(() => {})
      secondaryLspOpenFileRef.current = null
    }
  }, [secondaryFile])

  // Secondary pane: switch editor model when secondaryFile changes (split editor)
  useEffect(() => {
    if (!secondaryFile || !secondaryEditorRef.current || !monacoRef.current) return
    const content = fileContents.get(secondaryFile)
    if (content === undefined) return
    const ext = secondaryFile.split('.').pop()?.toLowerCase() || ''
    const lang = LSP_LANG_MAP[ext] || 'plaintext'
    const model = getOrCreateModel(secondaryFile, content, lang)
    if (model && secondaryEditorRef.current.getModel() !== model) {
      const oldModel = secondaryEditorRef.current.getModel()
      if (oldModel) {
        const vs = secondaryEditorRef.current.saveViewState()
        if (vs) viewStateMapRef.current.set(oldModel.uri.toString(), vs)
      }
      secondaryEditorRef.current.setModel(model)
      const saved = viewStateMapRef.current.get(model.uri.toString())
      if (saved) {
        secondaryEditorRef.current.restoreViewState(saved)
      }
    }

    // LSP document sync for secondary pane
    const lspLang = getLSPLanguageId(secondaryFile)

    if (lspLang && model) {
      if (secondaryLspOpenFileRef.current && secondaryLspOpenFileRef.current !== secondaryFile) {
        lspApi.didClose(secondaryLspOpenFileRef.current).catch(() => {})
        // P2 fix: Clear stale diagnostics when switching files (was missing in secondary pane)
        monacoRef.current?.editor.setModelMarkers(model, 'lsp', [])
      }
      secondaryLspOpenFileRef.current = secondaryFile
      secondaryLspIncrementalRef.current = false
      lspApi.didOpen(`file://${secondaryFile}`, secondaryFile, lspLang, content).catch(() => {})
      lspApi.supportsIncrementalSync(secondaryFile).then((r: any) => {
        secondaryLspIncrementalRef.current = !!r?.supported
      }).catch(() => { secondaryLspIncrementalRef.current = false })
      // P1 fix: Fetch diagnostics for secondary pane file (was missing)
      setTimeout(() => fetchSecondaryDiagnostics(), 500)
      // P2 fix: Fetch document symbols for breadcrumb navigation (was missing in secondary pane)
      // P1 fix: Pass isSecondary=true to store in separate state
      fetchDocumentSymbols(secondaryFile, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchSecondaryDiagnostics is stable (useCallback)
  }, [secondaryFile, fileContents, getOrCreateModel])

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

  // Apply diagnostics markers to a specific editor instance (split editor support)
  const applyMarkersToEditor = useCallback((ed: editor.IStandaloneCodeEditor | null, monaco: any, diags: any[]) => {
    if (!ed || !monaco) return
    const model = ed.getModel()
    if (!model) return

    const severityMap: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 4 }
    const markers: editor.IMarkerData[] = diags.map((d: any) => ({
      severity: severityMap[d.severity] ?? 1,
      message: d.message,
      startLineNumber: d.range.start.line + 1,
      startColumn: d.range.start.character + 1,
      endLineNumber: d.range.end.line + 1,
      endColumn: d.range.end.character + 1,
      source: d.source,
    }))
    monaco.editor.setModelMarkers(model, 'lsp', markers)
  }, [])

  const applyDiagnosticsMarkers = useCallback((diags: any[], fileUri?: string) => {
    if (!monacoRef.current) return

    const severityNameMap: Record<number, 'error' | 'warning' | 'info' | 'hint'> = {
      1: 'error', 2: 'warning', 3: 'info', 4: 'hint'
    }

    const filePath = fileUri?.replace(/^file:\/\//, '') || lspOpenFileRef.current

    // P1 fix: Only apply diagnostics to editor if it's showing the file the diagnostics are for
    // Main editor
    const mainModel = editorRef.current?.getModel()
    const mainModelPath = mainModel?.uri.path.replace(/^\//, '')
    if (mainModelPath === filePath) {
      applyMarkersToEditor(editorRef.current, monacoRef.current, diags)
    }

    // Secondary editor - only apply if showing the same file
    const secondaryModel = secondaryEditorRef.current?.getModel()
    const secondaryModelPath = secondaryModel?.uri.path.replace(/^\//, '')
    if (secondaryModelPath === filePath) {
      applyMarkersToEditor(secondaryEditorRef.current, monacoRef.current, diags)
    }

    // Update workspace problems store
    if (filePath) {
      const problems = diags.map((d: any, i: number) => ({
        id: `${filePath}-${i}`,
        file: filePath,
        line: d.range.start.line,
        column: d.range.start.character,
        message: d.message,
        severity: severityNameMap[d.severity] ?? 'info',
        source: d.source,
      }))
      updateFileProblems(filePath, problems)
    }
  }, [updateFileProblems, applyMarkersToEditor])

  // Fetch diagnostics from backend (fallback for initial load and WS reconnect)
  const fetchDiagnostics = useCallback(async () => {
    if (!lspOpenFileRef.current) return
    try {
      const uri = `file://${lspOpenFileRef.current}`
      const result = await lspApi.diagnostics(uri)
      applyDiagnosticsMarkers(result.diagnostics?.[uri] || [], uri)
    } catch {
      // Silently ignore — push will handle it
    }
  }, [applyDiagnosticsMarkers])

  // P1 fix: Fetch diagnostics for secondary pane file (was missing)
  const fetchSecondaryDiagnostics = useCallback(async () => {
    if (!secondaryLspOpenFileRef.current) return
    try {
      const uri = `file://${secondaryLspOpenFileRef.current}`
      const result = await lspApi.diagnostics(uri)
      applyDiagnosticsMarkers(result.diagnostics?.[uri] || [], uri)
    } catch {
      // Silently ignore — push will handle it
    }
  }, [applyDiagnosticsMarkers])

  // Subscribe to push-based diagnostics from WebSocket (Cursor/Windsurf pattern)
  useEffect(() => {
    const ws = getWebSocketClient()
    const unsubscribe = ws.subscribe('lsp_diagnostics_update', (data: any) => {
      if (!data?.uri) return
      // Only apply if at least one pane shows this file (function handles both panes internally)
      const mainPath = lspOpenFileRef.current ? `file://${lspOpenFileRef.current}` : ''
      const secondaryPath = secondaryLspOpenFileRef.current ? `file://${secondaryLspOpenFileRef.current}` : ''
      if (data.uri === mainPath || data.uri === secondaryPath) {
        applyDiagnosticsMarkers(data.diagnostics || [], data.uri)
      }
    })
    return unsubscribe
  }, [applyDiagnosticsMarkers])

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

    // Register LSP completion provider
    disposables.push(monaco.languages.registerCompletionItemProvider('*', {
      triggerCharacters: ['.', '(', '"', "'", '/', '@', '<', ' '],
      provideCompletionItems: async (model: any, position: any, _context: any, token: any) => {
        const filePath = model.uri.path.replace(/^\//, '')
        if (!hasLSPSupport(filePath)) return { suggestions: [] }
        try {
          const result = await lspApi.completion(filePath, position.lineNumber - 1, position.column - 1)
          if (token?.isCancellationRequested) return { suggestions: [] }
          return {
            suggestions: (result.items || []).map((item: any, i: number) => {
              const suggestion: any = {
                label: item.label || '',
                kind: item.kind ?? 1,
                detail: item.detail,
                documentation: item.documentation,
                insertText: item.insertText || item.label || '',
                sortText: String(i).padStart(6, '0'),
              }
              // LSP snippet support (insertTextFormat: 2 = snippet with tab stops)
              if (item.insertTextFormat === 2) {
                suggestion.insertTextRules = 4 // monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
              }
              // Use LSP-provided range for precise text replacement
              if (item.range) {
                suggestion.range = new monaco.Range(
                  item.range.start.line + 1, item.range.start.character + 1,
                  item.range.end.line + 1, item.range.end.character + 1,
                )
              }
              // Allow fuzzy-matched items to pass Monaco's filter
              if (item.filterText) {
                suggestion.filterText = item.filterText
              }
              return suggestion
            }),
          }
        } catch {
          return { suggestions: [] }
        }
      },
    }))

    // Register LSP hover provider
    disposables.push(monaco.languages.registerHoverProvider('*', {
      provideHover: async (model: any, position: any, token: any) => {
        const filePath = model.uri.path.replace(/^\//, '')
        if (!hasLSPSupport(filePath)) return null
        try {
          const result = await lspApi.hover(filePath, position.lineNumber - 1, position.column - 1)
          if (token?.isCancellationRequested) return null
          if (!result || !result.contents) return null
          const contents = typeof result.contents === 'string'
            ? [{ value: result.contents }]
            : Array.isArray(result.contents)
              ? result.contents.map((c: any) => typeof c === 'string' ? { value: c } : c)
              : [{ value: String(result.contents) }]
          return { contents }
        } catch {
          return null
        }
      },
    }))

    // Register LSP definition provider
    disposables.push(monaco.languages.registerDefinitionProvider('*', {
      provideDefinition: async (model: any, position: any, token: any) => {
        const filePath = model.uri.path.replace(/^\//, '')
        if (!hasLSPSupport(filePath)) return null
        try {
          const result = await lspApi.definition(filePath, position.lineNumber - 1, position.column - 1)
          if (token?.isCancellationRequested) return null
          if (!result?.locations?.length) return null
          return result.locations.map((loc: any) => ({
            uri: monaco.Uri.parse(loc.uri),
            range: new monaco.Range(
              loc.range.start.line + 1, loc.range.start.character + 1,
              loc.range.end.line + 1, loc.range.end.character + 1,
            ),
          }))
        } catch {
          return null
        }
      },
    }))

    // Register LSP implementation provider (go to impl — Cursor/Windsurf pattern)
    disposables.push(monaco.languages.registerImplementationProvider('*', {
      provideImplementation: async (model: any, position: any, token: any) => {
        const filePath = model.uri.path.replace(/^\//, '')
        if (!hasLSPSupport(filePath)) return null
        try {
          const result = await lspApi.implementation(filePath, position.lineNumber - 1, position.column - 1)
          if (token?.isCancellationRequested) return null
          if (!result?.locations?.length) return null
          return result.locations.map((loc: any) => ({
            uri: monaco.Uri.parse(loc.uri),
            range: new monaco.Range(
              loc.range.start.line + 1, loc.range.start.character + 1,
              loc.range.end.line + 1, loc.range.end.character + 1,
            ),
          }))
        } catch {
          return null
        }
      },
    }))

    // Register LSP type definition provider (go to type — Cursor/Windsurf pattern)
    disposables.push(monaco.languages.registerTypeDefinitionProvider('*', {
      provideTypeDefinition: async (model: any, position: any, token: any) => {
        const filePath = model.uri.path.replace(/^\//, '')
        if (!hasLSPSupport(filePath)) return null
        try {
          const result = await lspApi.typeDefinition(filePath, position.lineNumber - 1, position.column - 1)
          if (token?.isCancellationRequested) return null
          if (!result?.locations?.length) return null
          return result.locations.map((loc: any) => ({
            uri: monaco.Uri.parse(loc.uri),
            range: new monaco.Range(
              loc.range.start.line + 1, loc.range.start.character + 1,
              loc.range.end.line + 1, loc.range.end.character + 1,
            ),
          }))
        } catch {
          return null
        }
      },
    }))

    // Register LSP references provider
    disposables.push(monaco.languages.registerReferenceProvider('*', {
      provideReferences: async (model: any, position: any, _context: any, token: any) => {
        const filePath = model.uri.path.replace(/^\//, '')
        if (!hasLSPSupport(filePath)) return null
        try {
          const result = await lspApi.references(filePath, position.lineNumber - 1, position.column - 1)
          if (token?.isCancellationRequested) return null
          if (!result?.locations?.length) return null
          return result.locations.map((loc: any) => ({
            uri: monaco.Uri.parse(loc.uri),
            range: new monaco.Range(
              loc.range.start.line + 1, loc.range.start.character + 1,
              loc.range.end.line + 1, loc.range.end.character + 1,
            ),
          }))
        } catch {
          return null
        }
      },
    }))

    // Register LSP signature help provider
    disposables.push(monaco.languages.registerSignatureHelpProvider('*', {
      signatureHelpTriggerCharacters: ['(', ','],
      signatureHelpRetriggerCharacters: [','],
      provideSignatureHelp: async (model: any, position: any, token: any) => {
        const filePath = model.uri.path.replace(/^\//, '')
        if (!hasLSPSupport(filePath)) return null
        try {
          const result = await lspApi.signatureHelp(filePath, position.lineNumber - 1, position.column - 1)
          if (token?.isCancellationRequested) return null
          if (!result?.signatures?.length) return null
          return {
            value: {
              signatures: result.signatures.map((sig: any) => ({
                label: sig.label,
                documentation: sig.documentation
                  ? (typeof sig.documentation === 'string' ? { value: sig.documentation } : sig.documentation)
                  : undefined,
                parameters: sig.parameters?.map((param: any) => ({
                  label: param.label,
                  documentation: param.documentation
                    ? (typeof param.documentation === 'string' ? { value: param.documentation } : param.documentation)
                    : undefined,
                })),
              })),
              activeSignature: result.activeSignature ?? 0,
              activeParameter: result.activeParameter ?? 0,
            },
            dispose() {},
          }
        } catch {
          return null
        }
      },
    }))

    // Register command for code action edit application (guards against stale incremental changes)
    disposables.push(monaco.editor.registerCommand('swarm.applyCodeAction', (_accessor: any, workspaceEdit: any) => {
      if (!editorRef.current || !monacoRef.current) return
      lspInitiatedEditRef.current = true
      try {
        const m = monacoRef.current as any
        if (!workspaceEdit?.changes) return
        for (const change of workspaceEdit.changes) {
          if (!change.uri || !change.edits) continue
          const targetModel = m.editor.getModel(m.Uri.parse(change.uri))
          if (targetModel) {
            const edits = change.edits.map((e: any) => ({
              range: new m.Range(
                e.range.start.line + 1, e.range.start.character + 1,
                e.range.end.line + 1, e.range.end.character + 1,
              ),
              text: e.newText,
            }))
            targetModel.pushEditOperations([], edits, () => [])
          }
        }
      } finally {
        lspInitiatedEditRef.current = false
      }
    }))

    // Register LSP code actions provider (lightbulb quick fixes — Cursor/Windsurf pattern)
    disposables.push(monaco.languages.registerCodeActionProvider('*', {
      provideCodeActions: async (model: any, range: any, token: any) => {
        const filePath = model.uri.path.replace(/^\//, '')
        if (!hasLSPSupport(filePath)) return { actions: [] } as any
        try {
          const result = await lspApi.codeActions(filePath, range.startLineNumber - 1, range.startColumn - 1)
          if (token?.isCancellationRequested) return { actions: [] } as any
          const actions = (result.actions || []).map((action: any) => {
            // Route edits through guarded command to prevent stale incremental changes
            if (action.edit && action.edit.changes && action.edit.changes.length > 0) {
              return {
                title: action.title || '',
                kind: action.kind,
                command: { id: 'swarm.applyCodeAction', arguments: [action.edit] },
                diagnostics: action.diagnostics,
                isPreferred: action.isPreferred,
              }
            }
            return {
              title: action.title || '',
              kind: action.kind,
              edit: action.edit,
              command: action.command,
              diagnostics: action.diagnostics,
              isPreferred: action.isPreferred,
            }
          })
          return { actions } as any
        } catch {
          return { actions: [] } as any
        }
      },
    }))

    // Register LSP rename provider (F2 rename — Cursor/Windsurf pattern)
    disposables.push(monaco.languages.registerRenameProvider('*', {
      provideRenameEdits: async (model: any, position: any, newName: string, token: any) => {
        const filePath = model.uri.path.replace(/^\//, '')
        if (!hasLSPSupport(filePath)) return null
        try {
          const result = await lspApi.rename(filePath, position.lineNumber - 1, position.column - 1, newName)
          if (token?.isCancellationRequested) return null
          const edit = result.edit
          if (!edit || !edit.changes || edit.changes.length === 0) return null
          // Convert WorkspaceEdit to Monaco rename edits
          const edits: Record<string, any[]> = {}
          for (const change of edit.changes) {
            const uri = monaco.Uri.parse(change.uri)
            edits[uri.toString()] = (change.edits || []).map((e: any) => ({
              range: new monaco.Range(
                e.range.start.line + 1,
                e.range.start.character + 1,
                e.range.end.line + 1,
                e.range.end.character + 1,
              ),
              text: e.newText,
            }))
          }
          // Flag prevents onDidChangeModelContent from accumulating rename edits
          // as stale incremental changes (prevents LSP server state corruption)
          lspInitiatedEditRef.current = true
          setTimeout(() => { lspInitiatedEditRef.current = false }, 0)
          return edits
        } catch {
          return null
        }
      },
    }))

    // Register LSP document highlight provider (symbol occurrence highlighting — Cursor/Windsurf pattern)
    disposables.push(monaco.languages.registerDocumentHighlightProvider('*', {
      provideDocumentHighlights: async (model: any, position: any, token: any) => {
        const filePath = model.uri.path.replace(/^\//, '')
        if (!hasLSPSupport(filePath)) return null
        try {
          const result = await lspApi.documentHighlight(filePath, position.lineNumber - 1, position.column - 1)
          if (token?.isCancellationRequested) return null
          if (!result?.highlights?.length) return null
          return result.highlights.map((h: any) => ({
            range: new monaco.Range(
              h.range.start.line + 1, h.range.start.character + 1,
              h.range.end.line + 1, h.range.end.character + 1,
            ),
            kind: h.kind ?? 1,
          }))
        } catch {
          return null
        }
      },
    }))

    // Register LSP document symbol provider (outline view, breadcrumb navigation — Cursor/Windsurf pattern)
    // Provides symbols for the file outline (functions, classes, variables, etc.)
    disposables.push(monaco.languages.registerDocumentSymbolProvider('*', {
      displayName: 'LSP',
      provideDocumentSymbols: async (model: any, token: any) => {
        const filePath = model.uri.path.replace(/^\//, '')
        if (!hasLSPSupport(filePath)) return null
        try {
          const result = await lspApi.documentSymbols(filePath)
          if (token?.isCancellationRequested) return null
          if (!result?.symbols?.length) return null

          // Convert LSP DocumentSymbol[] to Monaco DocumentSymbol[]
          const convertSymbol = (sym: any): any => {
            const range = new monaco.Range(
              sym.range.start.line + 1, sym.range.start.character + 1,
              sym.range.end.line + 1, sym.range.end.character + 1,
            )
            const selectionRange = sym.selectionRange
              ? new monaco.Range(
                  sym.selectionRange.start.line + 1, sym.selectionRange.start.character + 1,
                  sym.selectionRange.end.line + 1, sym.selectionRange.end.character + 1,
                )
              : range

            return {
              name: sym.name,
              detail: sym.detail || '',
              kind: sym.kind || 1, // Monaco SymbolKind
              tags: sym.tags || [],
              range,
              selectionRange,
              children: sym.children?.map(convertSymbol) || [],
            }
          }

          return result.symbols.map(convertSymbol)
        } catch {
          return null
        }
      },
    }))

    // Register LSP link provider (clickable URLs, package imports — Cursor/Windsurf pattern)
    // Enables Ctrl+click on URLs in comments and package import paths
    disposables.push(monaco.languages.registerLinkProvider('*', {
      provideLinks: async (model: any, token: any) => {
        const filePath = model.uri.path.replace(/^\//, '')
        if (!hasLSPSupport(filePath)) return null
        try {
          const result = await lspApi.documentLinks(filePath)
          if (token?.isCancellationRequested) return null
          if (!result?.links?.length) return null

          const links = result.links.map((link: any) => ({
            range: new monaco.Range(
              link.range.start.line + 1, link.range.start.character + 1,
              link.range.end.line + 1, link.range.end.character + 1,
            ),
            url: link.target || undefined,
            tooltip: link.tooltip || undefined,
          }))
          return { links }
        } catch {
          return null
        }
      },
    }))

    // Register LSP code lens provider (inline actionable indicators — Cursor/Windsurf pattern)
    // Shows "N references", "Run test", etc. inline in the editor
    disposables.push(monaco.languages.registerCodeLensProvider('*', {
      provideCodeLenses: async (model: any, token: any) => {
        const filePath = model.uri.path.replace(/^\//, '')
        if (!hasLSPSupport(filePath)) return { lenses: [] }
        try {
          const result = await lspApi.codeLenses(filePath)
          if (token?.isCancellationRequested) return { lenses: [] }
          if (!result?.lenses?.length) return { lenses: [] }

          const lenses = result.lenses.map((lens: any) => ({
            range: new monaco.Range(
              lens.range.start.line + 1, lens.range.start.character + 1,
              lens.range.end.line + 1, lens.range.end.character + 1,
            ),
            command: lens.command ? {
              id: lens.command.command,
              title: lens.command.title,
              arguments: lens.command.arguments,
            } : undefined,
          }))
          return { lenses, dispose: () => {} }
        } catch {
          return { lenses: [] }
        }
      },
      resolveCodeLens: async (_model: any, codeLens: any, _token: any) => {
        // Resolve code lens if needed (some LSP servers return unresolved lenses)
        return codeLens
      },
    }))

    // Register LSP inlay hints provider (type annotations, parameter names — Cursor/Windsurf pattern)
    disposables.push(monaco.languages.registerInlayHintsProvider('*', {
      provideInlayHints: async (model: any, range: any, token: any) => {
        // R5169: Respect inlayHints setting — read from ref to avoid stale closure
        if (!inlayHintsRef.current) return { hints: [] }
        const filePath = model.uri.path.replace(/^\//, '')
        if (!hasLSPSupport(filePath)) return { hints: [] }
        try {
          const result = await lspApi.inlayHints(
            filePath,
            range.startLineNumber - 1,
            range.endLineNumber - 1,
          )
          if (token?.isCancellationRequested) return { hints: [] }
          const hints = (result.hints || []).map((h: any) => ({
            position: new (monaco as any).Position(h.position.line + 1, h.position.character + 1),
            label: h.label,
            kind: h.kind === 2 ? 2 /* InlayHintKind.Parameter */ : 1 /* InlayHintKind.Type */,
            tooltip: h.tooltip || undefined,
            paddingLeft: h.paddingLeft || false,
            paddingRight: h.paddingRight || false,
          }))
          return { hints, dispose: () => {} }
        } catch {
          return { hints: [] }
        }
      },
    }))

    // Register LSP folding range provider (code folding — Cursor/Windsurf pattern)
    disposables.push(monaco.languages.registerFoldingRangeProvider('*', {
      provideFoldingRanges: async (model: any, _context: any, token: any) => {
        const filePath = model.uri.path.replace(/^\//, '')
        if (!hasLSPSupport(filePath)) return []
        try {
          const result = await lspApi.foldingRanges(filePath)
          if (token?.isCancellationRequested) return []
          const ranges = (result.ranges || []).map((r: any) => ({
            start: r.startLine + 1,
            end: r.endLine + 1,
            kind: r.kind === 1 ? 1 /* FoldingRangeKind.Comment */
                 : r.kind === 2 ? 2 /* FoldingRangeKind.Imports */
                 : r.kind === 3 ? 3 /* FoldingRangeKind.Region */
                 : undefined,
          }))
          return ranges
        } catch {
          return []
        }
      },
    }))

    // Note: Workspace symbols requires a QuickPick-style UI component, not a Monaco provider.
    // The lspApi.workspaceSymbols() is available for future UI implementation (Ctrl+T search).

    // Register LSP selection range provider (expand selection — Cursor/Windsurf pattern)
    // Supports Ctrl+Shift+→ to intelligently expand selection: word → expression → statement → function
    disposables.push(monaco.languages.registerSelectionRangeProvider('*', {
      provideSelectionRanges: async (model: any, positions: any[], token: any) => {
        const filePath = model.uri.path.replace(/^\//, '')
        if (!hasLSPSupport(filePath)) return []
        try {
          const lspPositions = positions.map((p: any) => ({
            line: p.lineNumber - 1,
            character: p.column - 1,
          }))
          const result = await lspApi.selectionRange(filePath, lspPositions)
          if (token?.isCancellationRequested) return []
          if (!result?.ranges?.length) return []

          // Convert LSP SelectionRange tree to Monaco SelectionRange[][]
          // LSP returns one SelectionRange per position, each with parent chain
          // Monaco expects SelectionRange[][] — outer array per position, inner array is expand chain
          const chains: any[][] = result.ranges.map((sr: any) => convertSelectionRangeChain(sr, monaco))
          return chains
        } catch {
          return []
        }
      },
    }))

    // Register LSP range formatting provider (format selection — Cursor/Windsurf pattern)
    disposables.push(monaco.languages.registerDocumentRangeFormattingEditProvider('*', {
      displayName: 'LSP',
      provideDocumentRangeFormattingEdits: async (model: any, range: any, options: any, token: any) => {
        const filePath = model.uri.path.replace(/^\//, '')
        if (!hasLSPSupport(filePath)) return null
        try {
          const result = await lspApi.rangeFormatting(
            filePath,
            range.startLineNumber - 1,
            range.startColumn - 1,
            range.endLineNumber - 1,
            range.endColumn - 1,
            undefined,
            options.tabSize,
            options.insertSpaces,
          )
          if (token?.isCancellationRequested) return null
          if (!result?.edit) return null

          const edits = parseWorkspaceEdits(model, result.edit, monaco)
          return edits.length > 0 ? edits : null
        } catch {
          return null
        }
      },
    }))

    // Register LSP on-type formatting provider (auto-format on trigger chars — Cursor/Windsurf pattern)
    // Note: gopls does NOT support onTypeFormattingProvider. This is infrastructure for other LSP servers.
    // Trigger chars typically include: '}' for braces, ';' for statements, '\n' for newlines
    disposables.push(monaco.languages.registerOnTypeFormattingEditProvider('*', {
      displayName: 'LSP',
      triggerCharacters: ['}', ';', '\n'],
      provideOnTypeFormattingEdits: async (model: any, position: any, ch: string, options: any, token: any) => {
        const filePath = model.uri.path.replace(/^\//, '')
        if (!hasLSPSupport(filePath)) return null
        try {
          const result = await lspApi.onTypeFormatting(
            filePath,
            position.lineNumber - 1,
            position.column - 1,
            ch,
            undefined,
            options.tabSize,
            options.insertSpaces,
          )
          if (token?.isCancellationRequested) return null
          if (!result?.edit) return null

          const edits = parseWorkspaceEdits(model, result.edit, monaco)
          return edits.length > 0 ? edits : null
        } catch {
          return null
        }
      },
    }))

    // Register LSP semantic tokens provider (LSP-driven syntax highlighting — Cursor/Windsurf pattern)
    // Monaco requires per-language providers because each LSP server has a different legend.
    // We lazily register providers when a file of that language is first opened.

    // Default legend (gopls) used before LSP server provides its legend
    const defaultLegend = {
      tokenTypes: [
        'namespace', 'type', 'typeParameter', 'parameter', 'variable',
        'function', 'method', 'macro', 'keyword', 'comment',
        'string', 'number', 'operator', 'label',
      ],
      tokenModifiers: [
        'definition', 'readonly', 'defaultLibrary',
        'array', 'bool', 'chan', 'format', 'interface',
        'map', 'number', 'pointer', 'signature', 'slice', 'string', 'struct',
      ],
    }

    // Track which languages have providers registered
    const registeredLanguages = new Set<string>()

    // Register semantic tokens provider for a specific language with its legend
    const registerSemanticTokensProvider = (languageId: string, legend: { tokenTypes: string[]; tokenModifiers: string[] }) => {
      if (registeredLanguages.has(languageId)) return
      registeredLanguages.add(languageId)

      // Register full document provider
      disposables.push(monaco.languages.registerDocumentSemanticTokensProvider(languageId, {
        displayName: `LSP-${languageId}`,
        getLegend: () => legend,
        provideDocumentSemanticTokens: async (model: any, _lastResultId: string | null, token: any) => {
          const filePath = model.uri.path.replace(/^\//, '')
          if (!hasLSPSupport(filePath)) return null
          try {
            const result = await lspApi.semanticTokens(filePath)
            if (token?.isCancellationRequested) return null
            if (!result?.tokens?.data) return null

            return {
              resultId: result.tokens.resultId,
              data: new Uint32Array(result.tokens.data),
            }
          } catch {
            return null
          }
        },
        releaseDocumentSemanticTokens: () => {},
      }))

      // Register range provider
      disposables.push(monaco.languages.registerDocumentRangeSemanticTokensProvider(languageId, {
        displayName: `LSP-${languageId}`,
        getLegend: () => legend,
        provideDocumentRangeSemanticTokens: async (model: any, range: any, token: any) => {
          const filePath = model.uri.path.replace(/^\//, '')
          if (!hasLSPSupport(filePath)) return null
          try {
            const result = await lspApi.semanticTokensRange(
              filePath,
              range.startLineNumber - 1,
              range.startColumn - 1,
              range.endLineNumber - 1,
              range.endColumn - 1,
            )
            if (token?.isCancellationRequested) return null
            if (!result?.tokens?.data) return null

            return {
              resultId: result.tokens.resultId,
              data: new Uint32Array(result.tokens.data),
            }
          } catch {
            return null
          }
        },
      }))
    }

    // Register Go with default legend immediately (most common use case)
    // NOTE: For simplicity, we use gopls legend for all languages. This works for gopls.
    // For other LSP servers (rust-analyzer, pyright), the legend may not match perfectly,
    // but semantic tokens will still be highlighted (just potentially with wrong types).
    // TODO: Per-server legend handling for multi-language workspaces
    registerSemanticTokensProvider('go', defaultLegend)
    // Skip changes from LSP-initiated edits (formatting, rename, code actions)
    // to prevent sending stale edits back to the LSP server as incremental changes
    disposables.push(editor.onDidChangeModelContent((e: any) => {
      if (!lspOpenFileRef.current || !hasLSPSupport(lspOpenFileRef.current)) return
      if (lspInitiatedEditRef.current) return
      // Capture all changes for this edit batch
      const changes = e.changes?.map((ch: any) => ({
        range: ch.range ? {
          start: { line: ch.range.startLineNumber - 1, character: ch.range.startColumn - 1 },
          end: { line: ch.range.endLineNumber - 1, character: ch.range.endColumn - 1 },
        } : undefined,
        rangeLength: ch.rangeLength,
        text: ch.text,
      })) || []
      if (changes.length > 0) {
        lspPendingChangesRef.current.push(...changes)
      }
    }))

    // P1 UX: Keybindings for multi-cursor and line operations (Cursor/Windsurf pattern)
    // Use addCommand to bind keys directly to built-in actions
    // Commands are automatically cleaned up when editor is disposed
    const editorKeybindings = [
      { id: 'editor.action.addSelectionToNextFindMatch', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD },
      { id: 'editor.action.insertCursorAbove', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.UpArrow },
      { id: 'editor.action.insertCursorBelow', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.DownArrow },
      { id: 'editor.action.selectHighlights', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyL },
      { id: 'editor.action.deleteLines', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyK },
      { id: 'editor.action.deleteWordLeft', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Backspace },
      { id: 'editor.action.deleteWordRight', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Delete },
      { id: 'editor.action.insertLineBefore', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter },
      { id: 'editor.action.insertLineAfter', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter },
      { id: 'editor.action.moveLinesUpAction', key: monaco.KeyMod.Alt | monaco.KeyCode.UpArrow },
      { id: 'editor.action.moveLinesDownAction', key: monaco.KeyMod.Alt | monaco.KeyCode.DownArrow },
      { id: 'editor.action.copyLinesUpAction', key: monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.UpArrow },
      { id: 'editor.action.copyLinesDownAction', key: monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.DownArrow },
      { id: 'editor.action.commentLine', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash },
      { id: 'editor.action.blockComment', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Slash },
      { id: 'editor.action.outdent', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.BracketLeft },
      { id: 'editor.action.indent', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.BracketRight },
      { id: 'editor.action.revealDefinition', key: monaco.KeyCode.F12 },
      { id: 'editor.action.peekDefinition', key: monaco.KeyMod.Alt | monaco.KeyCode.F12 },
      { id: 'editor.action.revealTypeDefinition', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.F12 },
      { id: 'editor.action.referenceSearch.trigger', key: monaco.KeyMod.Shift | monaco.KeyCode.F12 },
      { id: 'editor.action.jumpToBracket', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Backslash },
      // R5127: Removed gotoLine keybinding — handled by App.tsx via 'open-goto-line' CustomEvent
      { id: 'editor.action.rename', key: monaco.KeyCode.F2 },
      { id: 'editor.action.formatDocument', key: monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF },
      // R5131: Format Selection chord (Ctrl+K Ctrl+F) — VS Code standard
      { id: 'editor.action.formatSelection', key: monaco.KeyChord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF) },
      { id: 'editor.action.startFindReplaceAction', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH },
      // R5131: Missing VS Code keybindings
      { id: 'editor.action.cursorUndo', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyU },
      { id: 'editor.action.quickFix', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Period },
      // R5123: Explicit find next/prev (F3/Shift+F3) for robustness
      { id: 'editor.action.nextMatchFindAction', key: monaco.KeyCode.F3 },
      { id: 'editor.action.previousMatchFindAction', key: monaco.KeyMod.Shift | monaco.KeyCode.F3 },
      { id: 'editor.foldAll', key: monaco.KeyChord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit0) },
      { id: 'editor.unfoldAll', key: monaco.KeyChord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyJ) },
      { id: 'editor.foldLevel1', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit1 },
      { id: 'editor.foldLevel2', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit2 },
      { id: 'editor.foldLevel3', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit3 },
      // R5122: Missing VS Code fold commands
      { id: 'editor.foldRecursively', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.BracketLeft },
      { id: 'editor.unfoldRecursively', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.BracketRight },
      { id: 'editor.fold', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.BracketLeft },
      { id: 'editor.unfold', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.BracketRight },
      { id: 'editor.action.smartSelect.expand', key: monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.RightArrow },
      { id: 'editor.action.smartSelect.shrink', key: monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.LeftArrow },
      // R5079: VS Code standard - Ctrl+L expands line selection
      { id: 'editor.action.expandLineSelection', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL },
      // R5124: Missing VS Code multi-cursor commands
      { id: 'editor.action.addCursorsToLineEnds', key: monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyI },
      { id: 'editor.action.addSelectionToPreviousFindMatch', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyD },
      { id: 'editor.action.changeAll', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.F2 },
      // R5124: Missing VS Code line commands
      // joinLines removed from Ctrl+J — VS Code uses Ctrl+J for Toggle Panel, not joinLines
      // R5125: Selection command (no Monaco default — genuinely useful)
      { id: 'editor.action.selectToBracket', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.Backslash },
      // R5127 audit: Removed dirtydiff.previous/next — NOT in Monaco standalone (VS Code extension only)
      // R5127 audit: Removed toggleTabFocusMode, wordHighlight.next/prev, showContextMenu — Monaco defaults match
    ]
    for (const kb of editorKeybindings) {
      disposables.push(editor.addCommand(kb.key, () => {
        const action = editor.getAction(kb.id)
        if (action) action.run()
      }))
    }

    // Save: Ctrl+S - needs custom handler (format-on-save)
    disposables.push(editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSave()
    }))

    // R5132: Ctrl+Shift+T is handled by TabSwitcher (capture phase) which calls undoCloseFile() directly
    // App.tsx no longer dispatches 'reopen-closed-tab' CustomEvent (was dead code — TabSwitcher catches it first)

    // R5127: Removed Ctrl+B addCommand — handled by App.tsx via 'toggle-sidebar' CustomEvent
    // Double-fire bug: toggle(!prev) called twice = no net change

    // R5127: Suppress Monaco's built-in Ctrl+G (gotoLine) — App.tsx handles via 'open-goto-line' CustomEvent
    // Without this, Monaco's default gotoLine AND CommandPalette's goto both open simultaneously
    disposables.push(editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG, () => {
      // no-op: App.tsx dispatches 'open-goto-line' which CommandPalette handles
    }))

    // R5128: Alt+F1 Accessibility Help (VS Code P1 pattern)
    disposables.push(editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.F1, () => {
      setShowAccessibilityHelp(true)
    }))

    // R5086: Focus outline panel (Ctrl+Shift+O) - VS Code pattern
    disposables.push(editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyO, () => {
      setShowFileTree(true)
      setActivityView('outline')
    }))

    // R5127: Removed Ctrl+\ addCommand — handled by App.tsx via 'toggle-split' CustomEvent
    // R5127: Removed Ctrl+Shift+E addCommand — handled by App.tsx via 'focus-file-tree' CustomEvent
    // R5127: Removed Ctrl+Shift+G addCommand — handled by App.tsx via 'toggle-source-control' CustomEvent

    // R5093: Navigate problems (F8 / Shift+F8) - VS Code pattern
    disposables.push(editor.addCommand(monaco.KeyCode.F8, () => navigateProblemRef.current(editor, currentFile)))
    disposables.push(editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.F8, () => navigateProblemRef.current(editor, currentFile, -1)))
    // R5127: Removed Ctrl+Shift+M addCommand — handled by App.tsx via 'show-problems' CustomEvent

    // R5171: Toggle Full Screen (F11 - browser/VS Code pattern)
    disposables.push(editor.addCommand(monaco.KeyCode.F11, () => {
      if (document.fullscreenElement) {
        document.exitFullscreen()
      } else {
        document.documentElement.requestFullscreen()
      }
    }))

    // R5172: Select All (Ctrl+A - VS Code pattern)
    disposables.push(editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyA, () => {
      const action = editor.getAction('editor.action.selectAll')
      if (action) action.run()
    }))

    // P1 UX: Context menu actions (right-click menu — Cursor/Windsurf pattern)
    // Use editor.addAction() to add items to the context menu
    const contextMenuActions = [
      {
        id: 'cut',
        label: 'Cut',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX],
        contextMenuGroupId: '9_cutcopypaste',
        run: () => {
          editor.focus()
          document.execCommand('cut')
        },
      },
      {
        id: 'copy',
        label: 'Copy',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC],
        contextMenuGroupId: '9_cutcopypaste',
        run: () => {
          editor.focus()
          document.execCommand('copy')
        },
      },
      {
        id: 'paste',
        label: 'Paste',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV],
        contextMenuGroupId: '9_cutcopypaste',
        run: async () => {
          editor.focus()
          try {
            const text = await navigator.clipboard.readText()
            if (text) {
              const selection = editor.getSelection()
              if (selection) {
                editor.executeEdits('paste', [{
                  range: selection,
                  text: text,
                }])
              }
            }
          } catch {
            // Fallback to browser execCommand
            document.execCommand('paste')
          }
        },
      },
      {
        id: 'go-to-definition',
        label: 'Go to Definition',
        keybindings: [monaco.KeyCode.F12],
        contextMenuGroupId: 'navigation',
        run: () => {
          const position = editor.getPosition()
          if (position) {
            // Trigger the definition provider
            const model = editor.getModel()
            if (model) {
              const word = model.getWordAtPosition(position)
              if (word) {
                // Use the built-in definition action
                const action = editor.getAction('editor.action.revealDefinition')
                if (action) action.run()
              }
            }
          }
        },
      },
      {
        id: 'peek-definition',
        label: 'Peek Definition',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.F12],
        contextMenuGroupId: 'navigation',
        run: () => {
          const action = editor.getAction('editor.action.peekDefinition')
          if (action) action.run()
        },
      },
      {
        id: 'go-to-references',
        label: 'Go to References',
        keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F12],
        contextMenuGroupId: 'navigation',
        run: () => {
          const action = editor.getAction('editor.action.findReferences')
          if (action) action.run()
        },
      },
      // R5120: Go to Type Definition (VS Code pattern)
      {
        id: 'go-to-type-definition',
        label: 'Go to Type Definition',
        contextMenuGroupId: 'navigation',
        run: () => {
          const action = editor.getAction('editor.action.revealTypeDefinition')
          if (action) action.run()
        },
      },
      // R5120: Go to Implementation (VS Code pattern)
      {
        id: 'go-to-implementation',
        label: 'Go to Implementation',
        contextMenuGroupId: 'navigation',
        run: () => {
          const action = editor.getAction('editor.action.goToImplementation')
          if (action) action.run()
        },
      },
      {
        id: 'rename-symbol',
        label: 'Rename Symbol',
        keybindings: [monaco.KeyCode.F2],
        contextMenuGroupId: 'navigation',
        run: () => {
          const action = editor.getAction('editor.action.rename')
          if (action) action.run()
        },
      },
      {
        id: 'format-document',
        label: 'Format Document',
        keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
        contextMenuGroupId: 'formatting',
        run: () => {
          const action = editor.getAction('editor.action.formatDocument')
          if (action) action.run()
        },
      },
      // R5120: Format Selection (VS Code pattern)
      {
        id: 'format-selection',
        label: 'Format Selection',
        contextMenuGroupId: 'formatting',
        run: () => {
          const action = editor.getAction('editor.action.formatSelection')
          if (action) action.run()
        },
      },
      // P1 UX: Font size adjustment (Cursor/Windsurf pattern)
      // Note: keybindings handled globally by App.tsx to avoid double-fire
      {
        id: 'increase-font-size',
        label: 'Increase Font Size',
        contextMenuGroupId: 'font',
        run: () => {
          const newSize = Math.min(32, settings.fontSize + 2)
          updateSetting('fontSize', newSize)
        },
      },
      {
        id: 'decrease-font-size',
        label: 'Decrease Font Size',
        contextMenuGroupId: 'font',
        run: () => {
          const newSize = Math.max(8, settings.fontSize - 2)
          updateSetting('fontSize', newSize)
        },
      },
      {
        id: 'reset-font-size',
        label: 'Reset Font Size',
        contextMenuGroupId: 'font',
        run: () => {
          updateSetting('fontSize', 14)
        },
      },
    ]

    for (const action of contextMenuActions) {
      disposables.push(editor.addAction(action))
    }

    // Track cursor position and selection for StatusBar
    const updateCursorPosition = () => {
      const position = editor.getPosition()
      if (position) {
        useAppStore.getState().setEditorCursorPosition({
          line: position.lineNumber,
          column: position.column,
        })
      }
      const selection = editor.getSelection()
      if (selection && !selection.isEmpty()) {
        const model = editor.getModel()
        const selectedText = model?.getValueInRange(selection) || ''
        const lineCount = selection.endLineNumber - selection.startLineNumber + 1
        useAppStore.getState().setEditorSelection({
          lineCount,
          charCount: selectedText.length,
        })
      } else {
        useAppStore.getState().setEditorSelection(null)
      }
    }

    disposables.push(editor.onDidChangeCursorPosition(updateCursorPosition))
    disposables.push(editor.onDidChangeCursorSelection(updateCursorPosition))

    // Initial position update
    updateCursorPosition()

    // Track language for StatusBar
    const model = editor.getModel()
    if (model) {
      const langId = model.getLanguageId()
      useAppStore.getState().setEditorLanguage(langId)
      disposables.push(model.onDidChangeLanguage(() => {
        useAppStore.getState().setEditorLanguage(model.getLanguageId())
      }))

      // P2 fix: Detect indentation from file content (VS Code pattern)
      const detectIndent = () => {
        const content = model.getValue()
        const lines = content.split('\n').slice(0, 100) // Check first 100 lines
        let spacesCount = 0
        let tabsCount = 0
        const spaceSizes: Record<number, number> = {}

        for (const line of lines) {
          const indent = line.match(/^[\t ]+/)?.[0]
          if (!indent) continue
          if (indent.startsWith('\t')) {
            tabsCount++
          } else {
            spacesCount++
            const size = indent.length
            spaceSizes[size] = (spaceSizes[size] || 0) + 1
          }
        }

        // Determine indentation type and size
        if (tabsCount > spacesCount) {
          useAppStore.getState().setEditorIndent({ type: 'tabs', size: 4 })
        } else if (spacesCount > 0) {
          // Find most common space size (prefer 2, 4, 8)
          const sorted = Object.entries(spaceSizes).sort((a, b) => b[1] - a[1])
          const mostCommon = sorted[0] ? parseInt(sorted[0][0]) : 2
          // Round to nearest common size
          const size = mostCommon <= 3 ? 2 : mostCommon <= 6 ? 4 : mostCommon <= 10 ? 8 : mostCommon
          useAppStore.getState().setEditorIndent({ type: 'spaces', size })
        }
        // Default is already set in store (spaces: 2)
      }
      detectIndent()
    }

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
  const fetchGitStatusRef = useRef<() => Promise<void>>(async () => {})
  useEffect(() => {
    if (!workspace) return

    const fetchGitStatus = async () => {
      try {
        const files = await gitApi.getStatus()
        const map: Record<string, GitFileStatus> = {}
        for (const f of files) {
          map[f.path] = f
        }
        setGitStatusMap(map)
      } catch {
        // Not a git repo or git unavailable
      }
    }

    fetchGitStatusRef.current = fetchGitStatus
    fetchGitStatus()
    const interval = setInterval(fetchGitStatus, 10000) // Poll every 10s
    return () => clearInterval(interval)
  }, [workspace])

  // Listen for external git status refresh requests (CommandPalette git: pull, SourceControlPanel, etc.)
  useEffect(() => {
    const handler = () => { fetchGitStatusRef.current() }
    window.addEventListener('refresh-git-status', handler)
    return () => window.removeEventListener('refresh-git-status', handler)
  }, [])

  // P1 UX: File watcher - detect external changes to open files (VS Code/Cursor pattern)
  useEffect(() => {
    if (openFiles.length === 0 || !workspace) return

    const checkForExternalChanges = async () => {
      // Read latest state from store (avoids stale closure)
      const { fileContents: latestContents, dirtyFiles: latestDirty } = useWorkspaceStore.getState()
      for (const filePath of openFiles) {
        try {
          const currentContent = latestContents.get(filePath)
          if (currentContent === undefined) continue

          const diskContent = await api.fs.readFile(filePath)
          if (diskContent !== currentContent && !latestDirty.has(filePath)) {
            // File was modified externally and user hasn't changed it locally
            // Auto-reload the content
            updateFileContent(filePath, diskContent)
            clearDirty(filePath)

            // Suppress onChange dirty marking during external reload
            externalReloadRef.current = true
            try {
              // Update Monaco model if this is the current file
              if (currentFile === filePath && editorRef.current && monacoRef.current) {
                const model = editorRef.current.getModel()
                if (model) {
                  const currentValue = model.getValue()
                  if (currentValue !== diskContent) {
                    model.setValue(diskContent)
                  }
                }
              }
              // Update Monaco model if this is the secondary pane file (split editor)
              if (secondaryFile === filePath && secondaryEditorRef.current && monacoRef.current) {
                const model = secondaryEditorRef.current.getModel()
                if (model) {
                  const currentValue = model.getValue()
                  if (currentValue !== diskContent) {
                    model.setValue(diskContent)
                  }
                }
              }
            } finally {
              externalReloadRef.current = false
            }
          }
        } catch {
          // File may have been deleted or is inaccessible
        }
      }
    }

    // Check every 5 seconds for external changes
    const interval = setInterval(checkForExternalChanges, 5000)
    return () => clearInterval(interval)
  }, [openFiles, currentFile, secondaryFile, workspace, updateFileContent, clearDirty])

  // P1 UX: Handle editor setting toggle events from CommandPalette
  useEffect(() => {
    const handleToggleSetting = (e: CustomEvent<{ setting: string }>) => {
      const { setting } = e.detail
      if (setting === 'minimap') {
        updateSetting('minimap', !settings.minimap)
      } else if (setting === 'wordWrap') {
        updateSetting('wordWrap', !settings.wordWrap)
      } else if (setting === 'lineNumbers') {
        // Cycle: on → off → relative → on
        const next = settings.lineNumbers === 'on' ? 'off' : settings.lineNumbers === 'off' ? 'relative' : 'on'
        updateSetting('lineNumbers', next)
      } else if (setting === 'bracketPairColorization') {
        updateSetting('bracketPairColorization', !settings.bracketPairColorization)
      } else if (setting === 'stickyScroll') {
        updateSetting('stickyScroll', !settings.stickyScroll)
      } else if (setting === 'indentGuides') {
        updateSetting('indentGuides', !settings.indentGuides)
      } else if (setting === 'renderWhitespace') {
        const modes = ['none', 'boundary', 'selection', 'trailing', 'all'] as const
        const idx = modes.indexOf(settings.renderWhitespace)
        updateSetting('renderWhitespace', modes[(idx + 1) % modes.length])
      } else if (setting === 'smoothScrolling') {
        updateSetting('smoothScrolling', !settings.smoothScrolling)
      } else if (setting === 'linkedEditing') {
        updateSetting('linkedEditing', !settings.linkedEditing)
      } else if (setting === 'inlayHints') {
        updateSetting('inlayHints', !settings.inlayHints)
      } else if (setting === 'breadcrumbs') {
        updateSetting('breadcrumbs', !settings.breadcrumbs)
      }
    }

    const handleAdjustFontSize = (e: CustomEvent<{ delta?: number; reset?: boolean }>) => {
      if (e.detail.reset) {
        updateSetting('fontSize', 14)
      } else {
        const newSize = Math.max(8, Math.min(32, settings.fontSize + (e.detail.delta || 0)))
        updateSetting('fontSize', newSize)
      }
    }

    // R5168: Reset font size (VS Code Ctrl+0 pattern)
    const handleResetFontSize = () => {
      updateSetting('fontSize', 14)
    }

    // Ctrl+mouse wheel zoom (VS Code/Cursor pattern)
    const handleWheelZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const delta = e.deltaY < 0 ? 1 : -1
        const newSize = Math.max(8, Math.min(32, settings.fontSize + delta))
        updateSetting('fontSize', newSize)
      }
    }

    window.addEventListener('toggle-editor-setting', handleToggleSetting as EventListener)
    window.addEventListener('adjust-font-size', handleAdjustFontSize as EventListener)
    window.addEventListener('reset-font-size', handleResetFontSize)
    window.addEventListener('wheel', handleWheelZoom, { passive: false })
    return () => {
      window.removeEventListener('toggle-editor-setting', handleToggleSetting as EventListener)
      window.removeEventListener('adjust-font-size', handleAdjustFontSize as EventListener)
      window.removeEventListener('reset-font-size', handleResetFontSize)
      window.removeEventListener('wheel', handleWheelZoom)
    }
  }, [settings.minimap, settings.wordWrap, settings.lineNumbers, settings.bracketPairColorization, settings.stickyScroll, settings.indentGuides, settings.renderWhitespace, settings.smoothScrolling, settings.linkedEditing, settings.fontSize, updateSetting])

  // P1 UX: Handle panel toggle events from CommandPalette
  useEffect(() => {
    const handleCloseAllTabs = () => {
      // P1 fix: Only check dirty files that will actually be closed (non-pinned)
      // closeAllFiles protects pinned files, so dirty pinned files won't be closed
      const filesToClose = openFiles.filter(f => !pinnedFiles.has(f))
      if (filesToClose.some(f => dirtyFiles.has(f))) {
        setDirtyClosePath('__close_all__')
      } else {
        const count = filesToClose.length
        closeAllFiles()
        if (count > 0) {
          addToast('info', 'All tabs closed', `${count} tab${count > 1 ? 's' : ''} closed`, {
            actions: [{ label: 'Undo', onClick: () => { useWorkspaceStore.getState().undoCloseFiles() } }],
          })
        }
      }
    }

    const handleToggleSidebar = () => {
      setShowFileTree(prev => !prev)
    }

    const handleCloseCurrentTab = () => {
      if (currentFile) {
        if (dirtyFiles.has(currentFile)) {
          setDirtyClosePath(currentFile)
        } else {
          closeFile(currentFile)
        }
      }
    }

    window.addEventListener('close-all-tabs', handleCloseAllTabs)
    window.addEventListener('toggle-sidebar', handleToggleSidebar)
    // R5132: Removed 'reopen-closed-tab' listener — CustomEvent is never dispatched
    // (TabSwitcher catches Ctrl+Shift+T in capture phase, calls undoCloseFile() directly)
    window.addEventListener('close-current-tab', handleCloseCurrentTab)

    const handlePinCurrentTab = () => {
      if (currentFile) togglePin(currentFile)
    }
    window.addEventListener('pin-current-tab', handlePinCurrentTab)

    const handleToggleProblems = () => {
      setBottomTab(prev => prev === 'problems' ? 'terminal' : 'problems')
    }
    window.addEventListener('toggle-problems', handleToggleProblems)

    const handleCloseSavedTabs = () => {
      const count = openFiles.filter(f => dirtyFiles.has(f) || pinnedFiles.has(f)).length
      const savedCount = openFiles.length - count
      closeSaved()
      if (savedCount > 0) {
        addToast('info', 'Saved tabs closed', `${savedCount} tab${savedCount > 1 ? 's' : ''} closed`, {
          actions: [{ label: 'Undo', onClick: () => { useWorkspaceStore.getState().undoCloseFiles() } }],
        })
      }
    }
    const handleCloseOtherTabs = () => {
      if (currentFile) {
        const count = openFiles.filter(f => f !== currentFile && !pinnedFiles.has(f)).length
        closeOthers(currentFile)
        if (count > 0) {
          addToast('info', 'Other tabs closed', `${count} tab${count > 1 ? 's' : ''} closed`, {
            actions: [{ label: 'Undo', onClick: () => { useWorkspaceStore.getState().undoCloseFiles() } }],
          })
        }
      }
    }
    const handleCloseToRight = () => {
      if (currentFile) closeToRight(currentFile)
    }
    window.addEventListener('close-saved-tabs', handleCloseSavedTabs)
    window.addEventListener('close-other-tabs', handleCloseOtherTabs)
    window.addEventListener('close-to-right', handleCloseToRight)
    return () => {
      window.removeEventListener('close-all-tabs', handleCloseAllTabs)
      window.removeEventListener('toggle-sidebar', handleToggleSidebar)
      window.removeEventListener('close-current-tab', handleCloseCurrentTab)
      window.removeEventListener('pin-current-tab', handlePinCurrentTab)
      window.removeEventListener('toggle-problems', handleToggleProblems)
      window.removeEventListener('close-saved-tabs', handleCloseSavedTabs)
      window.removeEventListener('close-other-tabs', handleCloseOtherTabs)
      window.removeEventListener('close-to-right', handleCloseToRight)
    }
  }, [closeAllFiles, undoCloseFile, openFiles, dirtyFiles, currentFile, closeFile, closeSaved, closeOthers, closeToLeft, closeToRight, togglePin, pinnedFiles])

  // Sidebar resize handler (VS Code pattern — drag edge to resize)
  useEffect(() => {
    if (!isResizingSidebar) return

    const handleMouseMove = (e: MouseEvent) => {
      // Activity bar is 48px (w-12), sidebar starts after that
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

  // Split editor events
  useEffect(() => {
    const handleToggleSplit = () => {
      if (currentFile) {
        toggleSplit()
      }
    }
    const handleToggleTerminal = () => setShowBottomPanel(prev => !prev)
    const handleToggleBottomPanel = () => setShowBottomPanel(prev => !prev)
    const handleToggleSourceControl = () => {
      if (!showFileTree) setShowFileTree(true)
      setActivityView(prev => prev === 'sourceControl' ? 'explorer' : 'sourceControl')
    }
    // R5093: Ctrl+Shift+M — Show Problems panel (VS Code standard)
    const handleShowProblems = () => {
      setBottomTab('problems')
      setShowBottomPanel(true)
    }
    // R5175: Toggle Output panel
    const handleToggleOutput = () => {
      if (bottomTab === 'output') {
        setShowBottomPanel(prev => !prev)
      } else {
        setBottomTab('output')
        setShowBottomPanel(true)
      }
    }
    // R5175: Toggle Debug Console
    const handleToggleDebugConsole = () => {
      if (bottomTab === 'debug') {
        setShowBottomPanel(prev => !prev)
      } else {
        setBottomTab('debug')
        setShowBottomPanel(true)
      }
    }
    // R5175: Save file command - direct call to handleSave (Ctrl+S behavior)
    const handleSaveFile = () => {
      if (currentFile) {
        handleSave()
      }
    }
    // R5175: Go to line
    const handleGoToLine = () => {
      if (editorRef.current) {
        editorRef.current.getAction('editor.action.gotoLine')?.run()
      }
    }
    // R5177: Go to line directly (from Quick Open :NNN — no widget, just reveal)
    const handleGoToLineDirect = (e: Event) => {
      const line = (e as CustomEvent).detail?.line
      if (!line || !editorRef.current) return
      if (!currentFile) { addToast('info', 'Go to Line', 'Open a file first'); return }
      editorRef.current.revealLineInCenter(line)
      editorRef.current.setPosition({ lineNumber: line, column: 1 })
      editorRef.current.focus()
    }
    // R5175: Placeholder handlers for features needing backend/dialog support
    const handleOpenFile = () => addToast('info', 'Open File', 'Use the file explorer to open files')
    const handleOpenFolder = () => addToast('info', 'Open Folder', 'Use File > Open Folder menu')
    const handleGoToFile = () => addToast('info', 'Go to File', 'Use the file explorer or Ctrl+P quick open')
    const handleFindInFiles = () => { setBottomTab('search'); setShowBottomPanel(true) }
    const handleReplaceInFiles = () => { setBottomTab('search'); setShowBottomPanel(true) }
    const handleGitCheckout = () => addToast('info', 'Git Checkout', 'Use the Source Control panel to switch branches')
    // R5108: Ctrl+1/Ctrl+2 — Focus editor group (VS Code pattern)
    const handleFocusEditorGroup = (e: Event) => {
      const group = (e as CustomEvent).detail?.group as number
      if (group === 1) {
        setActivePane('main')
      } else if (group === 2 && splitDirection !== 'none') {
        setActivePane('secondary')
      }
    }
    window.addEventListener('toggle-split', handleToggleSplit)
    window.addEventListener('close-split', handleCloseSplit)
    window.addEventListener('toggle-terminal', handleToggleTerminal)
    window.addEventListener('toggle-bottom-panel', handleToggleBottomPanel)
    window.addEventListener('toggle-source-control', handleToggleSourceControl)
    window.addEventListener('show-problems', handleShowProblems)
    window.addEventListener('focus-editor-group', handleFocusEditorGroup)
    // R5175: New command handlers
    window.addEventListener('save-file', handleSaveFile)
    window.addEventListener('toggle-output', handleToggleOutput)
    window.addEventListener('toggle-debug-console', handleToggleDebugConsole)
    window.addEventListener('go-to-line', handleGoToLine)
    window.addEventListener('goto-line-direct', handleGoToLineDirect)
    window.addEventListener('open-file', handleOpenFile)
    window.addEventListener('open-folder', handleOpenFolder)
    window.addEventListener('go-to-file', handleGoToFile)
    window.addEventListener('find-in-files', handleFindInFiles)
    window.addEventListener('replace-in-files', handleReplaceInFiles)
    window.addEventListener('git-checkout', handleGitCheckout)
    return () => {
      window.removeEventListener('toggle-split', handleToggleSplit)
      window.removeEventListener('close-split', handleCloseSplit)
      window.removeEventListener('toggle-terminal', handleToggleTerminal)
      window.removeEventListener('toggle-bottom-panel', handleToggleBottomPanel)
      window.removeEventListener('focus-editor-group', handleFocusEditorGroup)
      window.removeEventListener('toggle-source-control', handleToggleSourceControl)
      window.removeEventListener('show-problems', handleShowProblems)
      window.removeEventListener('save-file', handleSaveFile)
      window.removeEventListener('toggle-output', handleToggleOutput)
      window.removeEventListener('toggle-debug-console', handleToggleDebugConsole)
      window.removeEventListener('go-to-line', handleGoToLine)
      window.removeEventListener('goto-line-direct', handleGoToLineDirect)
      window.removeEventListener('open-file', handleOpenFile)
      window.removeEventListener('open-folder', handleOpenFolder)
      window.removeEventListener('go-to-file', handleGoToFile)
      window.removeEventListener('find-in-files', handleFindInFiles)
      window.removeEventListener('replace-in-files', handleReplaceInFiles)
      window.removeEventListener('git-checkout', handleGitCheckout)
    }
  }, [toggleSplit, handleCloseSplit, currentFile, showFileTree, setShowFileTree, setActivityView, setActivePane, splitDirection, bottomTab, setBottomTab, setShowBottomPanel, addToast])

  // P1 fix: Re-send LSP didOpen after WebSocket reconnect (LSP server may have lost state)
  useEffect(() => {
    const handleReconnect = () => {
      // Reset incremental sync state — full sync needed after reconnect
      lspIncrementalRef.current = false
      secondaryLspIncrementalRef.current = false
      // Re-send didOpen for tracked files
      const files = fileContents
      if (lspOpenFileRef.current && files.has(lspOpenFileRef.current)) {
        const ext = lspOpenFileRef.current.split('.').pop()?.toLowerCase() || ''
        const lang = LSP_LANG_MAP[ext] || 'plaintext'
        lspApi.didOpen(`file://${lspOpenFileRef.current}`, lspOpenFileRef.current, lang, files.get(lspOpenFileRef.current) || '').catch(() => {})
      }
      if (secondaryLspOpenFileRef.current && files.has(secondaryLspOpenFileRef.current)) {
        const ext = secondaryLspOpenFileRef.current.split('.').pop()?.toLowerCase() || ''
        const lang = LSP_LANG_MAP[ext] || 'plaintext'
        lspApi.didOpen(`file://${secondaryLspOpenFileRef.current}`, secondaryLspOpenFileRef.current, lang, files.get(secondaryLspOpenFileRef.current) || '').catch(() => {})
      }
      // Re-fetch diagnostics for tracked files
      setTimeout(() => fetchDiagnostics(), 500)
      setTimeout(() => fetchSecondaryDiagnostics(), 500)
    }
    window.addEventListener('ws-reconnect', handleReconnect)
    return () => window.removeEventListener('ws-reconnect', handleReconnect)
  }, [fileContents]) // eslint-disable-line react-hooks/exhaustive-deps

  // R5177: Warn before closing browser tab with unsaved changes — VS Code pattern
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyFiles.size > 0) {
        e.preventDefault()
        // Modern browsers require returnValue to be set
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirtyFiles])

  // Tab switching (Ctrl+Tab / Ctrl+Shift+Tab — VS Code standard)
  useEffect(() => {
    const handleSwitchTab = (e: Event) => {
      const { direction } = (e as CustomEvent).detail || {}
      const allOpen = [...openFiles]
      if (allOpen.length <= 1) return
      const activePaneFile = activePaneId === 'secondary' ? secondaryFile : currentFile
      const currentIdx = allOpen.indexOf(activePaneFile || '')
      if (currentIdx === -1) return
      let nextIdx: number
      if (direction === 'prev') {
        nextIdx = currentIdx - 1 < 0 ? allOpen.length - 1 : currentIdx - 1
      } else {
        nextIdx = (currentIdx + 1) % allOpen.length
      }
      const nextFile = allOpen[nextIdx]
      if (activePaneId === 'secondary') {
        setPaneFile('secondary', nextFile)
      } else {
        handleTabClick(nextFile)
      }
    }
    window.addEventListener('switch-tab', handleSwitchTab)
    return () => window.removeEventListener('switch-tab', handleSwitchTab)
  }, [openFiles, currentFile, secondaryFile, activePaneId, handleTabClick, setPaneFile])

  // New file shortcut (Ctrl+Shift+N)
  useEffect(() => {
    const handleNewFile = () => {
      if (workspace) {
        setNewFileDialog({ parentPath: workspace, isFolder: false })
        setNewFileName('')
      }
    }
    window.addEventListener('new-file', handleNewFile)
    return () => window.removeEventListener('new-file', handleNewFile)
  }, [workspace])

  // R5166: Save All shortcut (Ctrl+K S) — VS Code pattern
  useEffect(() => {
    const handleSaveAll = async () => {
      const { dirtyFiles: currentDirty, fileContents: currentContents } = useWorkspaceStore.getState()
      const dirtyPaths = Array.from(currentDirty)
      for (const path of dirtyPaths) {
        const model = modelCacheRef.current.get(path)
        const content = model ? model.getValue() : currentContents.get(path)
        if (content !== undefined) {
          try {
            await api.fs.writeFile(path, content)
            // Remove from dirty set
            useWorkspaceStore.setState(state => {
              const newDirty = new Set(state.dirtyFiles)
              newDirty.delete(path)
              return { dirtyFiles: newDirty }
            })
          } catch {
            // Silently ignore save errors
          }
        }
      }
    }
    window.addEventListener('save-all', handleSaveAll)
    return () => window.removeEventListener('save-all', handleSaveAll)
  }, [])

  // R5167: Format Document command
  useEffect(() => {
    const handleFormatDocument = () => {
      if (editorRef.current) {
        const action = editorRef.current.getAction('editor.action.formatDocument')
        if (action) action.run()
      }
    }
    window.addEventListener('format-document', handleFormatDocument)
    return () => window.removeEventListener('format-document', handleFormatDocument)
  }, [openFiles])

  // R5168: Fold/Unfold All commands
  useEffect(() => {
    const handleFoldAll = () => {
      if (editorRef.current) {
        const action = editorRef.current.getAction('editor.foldAll')
        if (action) action.run()
      }
    }
    const handleUnfoldAll = () => {
      if (editorRef.current) {
        const action = editorRef.current.getAction('editor.unfoldAll')
        if (action) action.run()
      }
    }
    window.addEventListener('fold-all', handleFoldAll)
    window.addEventListener('unfold-all', handleUnfoldAll)
    return () => {
      window.removeEventListener('fold-all', handleFoldAll)
      window.removeEventListener('unfold-all', handleUnfoldAll)
    }
  }, [openFiles])

  // R5173: Revert File (discard unsaved changes)
  useEffect(() => {
    const handleRevertFile = async () => {
      if (!currentFile) return
      try {
        const originalContent = await api.fs.readFile(currentFile)
        if (originalContent === undefined) return
        // Update editor with original content
        if (editorRef.current) {
          editorRef.current.setValue(originalContent)
          // Clear dirty flag via store
          useWorkspaceStore.getState().clearDirty(currentFile)
          addToast('success', 'File reverted', 'Changes discarded')
        }
      } catch (err) {
        addToast('error', 'Failed to revert', err instanceof Error ? err.message : 'Unknown error')
      }
    }
    window.addEventListener('revert-file', handleRevertFile)
    return () => {
      window.removeEventListener('revert-file', handleRevertFile)
    }
  }, [currentFile, addToast])

  // Focus file tree shortcut (Ctrl+Shift+E)
  useEffect(() => {
    const handleFocusFileTree = () => {
      if (!showFileTree) setShowFileTree(true)
      // Focus the first file tree entry or the active file
      const firstEntry = document.querySelector('[data-active-file="true"]') as HTMLElement
        || document.querySelector('.file-tree-entry') as HTMLElement
      firstEntry?.focus()
    }
    const handleAccessibilityHelp = () => setShowAccessibilityHelp(true)
    const handleOpenDiffEvent = (e: Event) => {
      const detailPath = (e as CustomEvent).detail?.path
      const targetPath = detailPath || currentFile
      if (targetPath && gitStatusMap[targetPath]) {
        handleOpenDiff(targetPath)
      }
    }
    const handleSelectAll = () => {
      if (editorRef.current) {
        const action = editorRef.current.getAction('editor.action.selectAll')
        if (action) action.run()
      }
    }
    // R5174: Generic editor-action handler (VS Code Monaco actions)
    // Handles both real Monaco actions and custom implementations for VS Code extension-level actions
    const handleEditorAction = (e: Event) => {
      const actionId = (e as CustomEvent).detail?.actionId
      if (!actionId || !editorRef.current) return
      const editor = editorRef.current

      // Custom implementations for actions not available in Monaco standalone
      switch (actionId) {
        case 'editor.action.sortLinesAscending':
        case 'editor.action.sortLinesDescending': {
          const model = editor.getModel()
          if (!model) break
          const selections = editor.getSelections()
          if (!selections?.length) break
          const asc = actionId === 'editor.action.sortLinesAscending'
          editor.pushUndoStop()
          for (const sel of selections) {
            const text = model.getValueInRange(sel)
            const lines = text.split('\n').sort((a, b) => asc ? a.localeCompare(b) : b.localeCompare(a))
            editor.executeEdits('sortLines', [{ range: sel, text: lines.join('\n') }])
          }
          editor.pushUndoStop()
          return
        }
        case 'editor.action.transformToUppercase':
        case 'editor.action.transformToLowercase': {
          const model = editor.getModel()
          if (!model) break
          const selections = editor.getSelections()
          if (!selections?.length) break
          const upper = actionId === 'editor.action.transformToUppercase'
          editor.pushUndoStop()
          for (const sel of selections) {
            if (sel.isEmpty()) continue
            const text = model.getValueInRange(sel)
            editor.executeEdits('transformCase', [{ range: sel, text: upper ? text.toUpperCase() : text.toLowerCase() }])
          }
          editor.pushUndoStop()
          return
        }
        case 'editor.action.transposeLetters': {
          const model = editor.getModel()
          if (!model) break
          const pos = editor.getPosition()
          if (!pos) break
          const lineContent = model.getLineContent(pos.lineNumber)
          const col = pos.column
          if (col < 2 || col > lineContent.length) break
          const chars = lineContent.slice(col - 2, col)
          editor.executeEdits('transpose', [{
            range: { startLineNumber: pos.lineNumber, startColumn: col - 1, endLineNumber: pos.lineNumber, endColumn: col + 1 },
            text: chars[1] + chars[0],
          }])
          editor.setPosition({ lineNumber: pos.lineNumber, column: col + 1 })
          return
        }
        case 'cursorTop': {
          editor.setPosition({ lineNumber: 1, column: 1 })
          editor.revealLineInCenter(1)
          editor.focus()
          return
        }
        case 'cursorBottom': {
          const lineCount = editor.getModel()?.getLineCount() ?? 1
          editor.setPosition({ lineNumber: lineCount, column: 1 })
          editor.revealLineInCenter(lineCount)
          editor.focus()
          return
        }
        case 'editor.action.scrollToTop':
          editor.setScrollTop(0)
          editor.focus()
          return
        case 'editor.action.scrollToBottom':
          editor.setScrollTop(editor.getScrollHeight())
          editor.focus()
          return
        case 'editor.action.toggleFindCaseSensitive':
        case 'editor.action.toggleFindWholeWord':
        case 'editor.action.toggleFindRegex': {
          // Use Monaco's find controller to toggle find options
          const findController = (editor as any)._contributions?.['editor.contrib.findController']
          if (findController) {
            const findState = findController.getState()
            switch (actionId) {
              case 'editor.action.toggleFindCaseSensitive':
                findState.change({ matchCase: !findState.matchCase }, true)
                break
              case 'editor.action.toggleFindWholeWord':
                findState.change({ wholeWord: !findState.wholeWord }, true)
                break
              case 'editor.action.toggleFindRegex':
                findState.change({ regex: !findState.regex }, true)
                break
            }
          }
          return
        }
        case 'undo':
          editor.trigger('keyboard', 'undo', null)
          return
        case 'redo':
          editor.trigger('keyboard', 'redo', null)
          return
        // Fix wrong Monaco action IDs
        case 'editor.action.goToTypeDefinition':
          editor.getAction('editor.action.revealTypeDefinition')?.run()
          return
        case 'editor.action.goToReferences':
          editor.getAction('editor.action.referenceSearch.trigger')?.run()
          return
        case 'editor.action.indentLines':
          editor.getAction('editor.action.indent')?.run()
          return
        case 'editor.action.outdentLines':
          editor.getAction('editor.action.outdent')?.run()
          return
      }

      // Default: try Monaco built-in action
      const action = editor.getAction(actionId)
      if (action) action.run()
    }

    window.addEventListener('focus-file-tree', handleFocusFileTree)
    window.addEventListener('open-accessibility-help', handleAccessibilityHelp)
    window.addEventListener('open-diff', handleOpenDiffEvent)
    window.addEventListener('select-all', handleSelectAll)
    window.addEventListener('editor-action', handleEditorAction)
    // R5174c: Navigate problems from Command Palette
    const handleNextProblem = () => {
      if (editorRef.current) navigateProblemRef.current(editorRef.current, currentFile)
    }
    const handlePrevProblem = () => {
      if (editorRef.current) navigateProblemRef.current(editorRef.current, currentFile, -1)
    }
    window.addEventListener('navigate-next-problem', handleNextProblem)
    window.addEventListener('navigate-previous-problem', handlePrevProblem)
    return () => {
      window.removeEventListener('focus-file-tree', handleFocusFileTree)
      window.removeEventListener('open-accessibility-help', handleAccessibilityHelp)
      window.removeEventListener('open-diff', handleOpenDiffEvent)
      window.removeEventListener('select-all', handleSelectAll)
      window.removeEventListener('editor-action', handleEditorAction)
      window.removeEventListener('navigate-next-problem', handleNextProblem)
      window.removeEventListener('navigate-previous-problem', handlePrevProblem)
    }
  }, [showFileTree, setShowFileTree, currentFile, gitStatusMap, handleOpenDiff])

  // Reveal active file in file tree (VS Code pattern)
  useEffect(() => {
    const handleRevealActiveFile = () => {
      if (!currentFile || !showFileTree) {
        // Show file tree if hidden
        setShowFileTree(true)
      }
      // Expand parent directories
      const parts = currentFile?.split('/') || []
      const parentPaths: string[] = []
      for (let i = 1; i < parts.length; i++) {
        parentPaths.push(parts.slice(0, i).join('/'))
      }
      setExpandedDirs(prev => {
        const next = new Set(prev)
        for (const p of parentPaths) {
          next.add(p)
        }
        return next
      })
      // Scroll to active file after render
      requestAnimationFrame(() => {
        const activeBtn = document.querySelector('[data-active-file="true"]') as HTMLElement
        activeBtn?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        activeBtn?.focus()
      })
    }
    window.addEventListener('reveal-active-file', handleRevealActiveFile)
    return () => window.removeEventListener('reveal-active-file', handleRevealActiveFile)
  }, [currentFile, showFileTree, setShowFileTree])

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

  // Close context menu on click outside or Escape
  useEffect(() => {
    const handleClickOutside = () => closeContextMenu()
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu()
    }
    // Stop native click propagation on menu container so clicks inside don't trigger document listener
    const stopNativePropagation = (e: Event) => e.stopPropagation()
    // Capture ref at effect setup time for cleanup
    const menuRef = contextMenuRef.current
    if (contextMenu.visible) {
      document.addEventListener('click', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
      menuRef?.addEventListener('click', stopNativePropagation, true)
      return () => {
        document.removeEventListener('click', handleClickOutside)
        document.removeEventListener('keydown', handleEscape)
        menuRef?.removeEventListener('click', stopNativePropagation, true)
      }
    }
  }, [contextMenu.visible])

  // Close more actions dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreActionsRef.current && !moreActionsRef.current.contains(e.target as Node)) {
        setShowMoreActions(false)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMoreActions(false)
    }
    if (showMoreActions) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('keydown', handleEscape)
      }
    }
  }, [showMoreActions])

  useEffect(() => {
    const loadWorkspace = async () => {
      try {
        setLoading(true)
        const ws = await api.fs.getWorkspace()
        if (!mountedRef.current) return
        setWorkspace(ws)
        const entries = await api.fs.listDir(ws)
        if (!mountedRef.current) return
        setFileTree(entries)
      } catch (err) {
        logger.error('Editor', 'Failed to load workspace:', err)
        if (!mountedRef.current) return
        addToast('error', 'Failed to load workspace', err instanceof Error ? err.message : String(err))
      } finally {
        if (mountedRef.current) {
          setLoading(false)
        }
      }
    }
    loadWorkspace()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadFile = async (entry: FileEntry) => {
    if (entry.isDirectory) {
      toggleDir(entry)
      return
    }

    try {
      setLoading(true)

      // Open file as preview (VS Code: single-click = preview, double-click = permanent)
      await openFileFromStore(entry.path, { preview: true })

      // In split mode, also set the file in the active pane
      if (splitDirection !== 'none') {
        const paneId = useSplitPaneStore.getState().activePaneId
        setPaneFile(paneId, entry.path)
      }

      // Update recent files
      setRecentFiles(prev => {
        const filtered = prev.filter(f => f !== entry.path)
        const updated = [entry.path, ...filtered].slice(0, 10)
        try {
          localStorage.setItem('swarm-editor-recent-files', JSON.stringify(updated))
        } catch { /* ignore storage quota errors */ }
        return updated
      })
    } catch (err) {
      logger.error('Editor', 'Failed to load file:', err)
      if (!mountedRef.current) return
      addToast('error', 'Failed to load file', err instanceof Error ? err.message : String(err))
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }

  // Parameterized save that works with any editor instance (split editor support)
  const handleSaveForEditor = async (
    editorInstance: editor.IStandaloneCodeEditor | null,
    lspOpenFileRefParam: React.MutableRefObject<string | null>,
    lspDebounceRefParam: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
    lspPendingChangesRefParam: React.MutableRefObject<any[]>,
    lspInitiatedEditRefParam: React.MutableRefObject<boolean>,
  ) => {
    const model = editorInstance?.getModel()
    const filePath = model?.uri.path.replace(/^\//, '') || null
    if (!filePath || !model) return

    try {
      setLoading(true)

      const modelContent = model.getValue()
      let saveCode = modelContent

      // Format-on-save via LSP
      if (lspOpenFileRefParam.current && hasLSPSupport(lspOpenFileRefParam.current) && monacoRef.current) {
        if (lspDebounceRefParam.current) {
          clearTimeout(lspDebounceRefParam.current)
          lspDebounceRefParam.current = null
          lspPendingChangesRefParam.current = []
          lspApi.didChange(lspOpenFileRefParam.current, modelContent).catch(() => {})
        }
        try {
          const tabSize = model.getOptions()?.tabSize ?? 2
          const insertSpaces = model.getOptions()?.insertSpaces ?? true
          const result = await lspApi.formatting(lspOpenFileRefParam.current, undefined, tabSize, insertSpaces)
          const edit = result.edit
          if (edit && edit.changes && edit.changes.length > 0) {
            const allEdits: any[] = []
            for (const change of edit.changes) {
              for (const e of (change.edits || [])) {
                allEdits.push({
                  range: new (monacoRef.current as any).Range(
                    e.range.start.line + 1, e.range.start.character + 1,
                    e.range.end.line + 1, e.range.end.character + 1,
                  ),
                  text: e.newText,
                })
              }
            }
            if (allEdits.length > 0) {
              lspInitiatedEditRefParam.current = true
              model.pushEditOperations([], allEdits, () => [])
              lspInitiatedEditRefParam.current = false
              saveCode = model.getValue()
            }
          }
        } catch {
          // Formatting failed — save unformatted
          // P1 fix: Reset flag on failure (was leaving it stuck true permanently)
          lspInitiatedEditRefParam.current = false
        }
      }

      await api.fs.writeFile(filePath, saveCode)
      if (!mountedRef.current) return

      if (saveCode !== modelContent) {
        updateFileContent(filePath, saveCode)
        const cachedModel = modelCacheRef.current.get(filePath)
        if (cachedModel) cachedModel.setValue(saveCode)
      }

      clearDirty(filePath)

      if (lspOpenFileRefParam.current) {
        lspApi.didSave(lspOpenFileRefParam.current, saveCode).catch(() => {})
      }
      fetchGitStatusRef.current() // Refresh git status after save
      useAppStore.getState().addToast('success', 'File saved', filePath.split('/').pop())
    } catch (err) {
      logger.error('Editor', 'Failed to save file:', err)
      if (!mountedRef.current) return
      useAppStore.getState().addToast('error', 'Save failed', err instanceof Error ? err.message : String(err))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  const handleSave = async () => {
    // Save the active pane's editor (split-aware)
    // R5097: Use getState() to avoid stale closure in addCommand handlers
    const { activePaneId: paneId, splitDirection: split } = useSplitPaneStore.getState()
    const isSecondary = paneId === 'secondary' && split !== 'none'
    await handleSaveForEditor(
      isSecondary ? secondaryEditorRef.current : editorRef.current,
      isSecondary ? secondaryLspOpenFileRef : lspOpenFileRef,
      isSecondary ? secondaryLspDebounceRef : lspDebounceRef,
      isSecondary ? secondaryLspPendingChangesRef : lspPendingChangesRef,
      isSecondary ? secondaryLspInitiatedEditRef : lspInitiatedEditRef,
    )
  }

  // P1 fix: Save a specific file by path (for auto-save when user may have switched tabs)
  const saveFileByPath = async (filePath: string) => {
    const model = modelCacheRef.current.get(filePath)
    if (!model) return

    const content = model.getValue()
    const oldContent = fileContents.get(filePath)

    if (content === oldContent) return // No changes

    setLoading(true)
    try {
      await api.fs.writeFile(filePath, content)
      clearDirty(filePath)
      // P1 fix: Update fileContents via store (not direct Map mutation which bypasses React re-render)
      const store = useWorkspaceStore.getState()
      const newContents = new Map(store.fileContents)
      newContents.set(filePath, content)
      useWorkspaceStore.setState({ fileContents: newContents })
      // P1 fix: Send LSP didSave if this file is currently LSP-tracked
      if (lspOpenFileRef.current === filePath || secondaryLspOpenFileRef.current === filePath) {
        lspApi.didSave(filePath, content).catch(() => {})
      }
      fetchGitStatusRef.current() // Refresh git status after save
      useAppStore.getState().addToast('success', 'Auto-saved', filePath.split('/').pop())
    } catch (err) {
      logger.error('Editor', 'Failed to auto-save file:', err)
      useAppStore.getState().addToast('error', 'Auto-save failed', err instanceof Error ? err.message : String(err))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  const handleRun = () => {
    if (!currentFile) return
    setShowAgentSelector(true)
  }

  const executeWithAgent = async (swarmId?: string) => {
    if (!currentFile) return

    const swarm = swarmId ? swarms.find(s => s.id === swarmId) : null
    const execMode = swarm ? `via ${swarm.name}` : 'directly'
    useAppStore.getState().addToast('info', 'Executing', `${currentFile.split('/').pop()} (${execMode})`)

    try {
      setLoading(true)
      const result = await api.execute.executeCode(
        currentFile,
        code,
        language,
        swarmId
      )

      if (!mountedRef.current) return

      if (result.success) {
        useAppStore.getState().addToast('success', 'Execution completed', result.output)
      } else {
        useAppStore.getState().addToast('error', 'Execution failed', result.error || result.output)
      }
    } catch (err) {
      logger.error('Editor', 'Failed to execute code:', err)
      if (!mountedRef.current) return
      useAppStore.getState().addToast('error', 'Execution error', err instanceof Error ? err.message : String(err))
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        setShowAgentSelector(false)
      }
    }
  }

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined && currentFile) {
      // Skip updateFileContent if edit was initiated by LSP (format-on-save, rename, code actions)
      // or external file reload — to avoid marking the file as dirty
      if (lspInitiatedEditRef.current || externalReloadRef.current) return
      updateFileContent(currentFile, value)

      // Debounced LSP didChange (500ms after last keystroke)
      // P1 fix: Capture content at debounce time, not execution time
      // (if user switches tabs before debounce fires, we still want to sync the correct file's content)
      if (lspDebounceRef.current) clearTimeout(lspDebounceRef.current)
      if (lspOpenFileRef.current) {
        const lspFilePath = lspOpenFileRef.current // Capture at debounce time
        const capturedContent = value // Capture content at debounce time
        lspDebounceRef.current = setTimeout(() => {
          const pending = lspPendingChangesRef.current
          lspPendingChangesRef.current = []
          if (lspIncrementalRef.current && pending.length > 0) {
            // Incremental sync: send only the deltas (Cursor/Windsurf pattern)
            lspApi.didChangeIncremental(lspFilePath, pending).catch(() => {})
          } else {
            // Full sync fallback
            lspApi.didChange(lspFilePath, capturedContent).catch(() => {})
          }
        }, 500)
      }

      // Auto-save with debounce (VS Code/Cursor pattern)
      // P1 fix: Capture file path at debounce time, not execution time
      // (if user switches tabs before debounce fires, we still want to save the edited file)
      if (settings.autoSave) {
        if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current)
        const fileToSave = currentFile // Capture at debounce time
        const isDirty = dirtyFiles.has(fileToSave) // P2 fix: Also capture dirty state at debounce time
        autoSaveTimeoutRef.current = setTimeout(() => {
          // P2 fix: Check settings again inside timeout (user might have disabled auto-save during debounce)
          if (isDirty) {
            saveFileByPath(fileToSave)
          }
        }, settings.autoSaveDelay || 1000)
      }
    }
  }

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
    secondaryDisposablesRef.current.push(
      editor.onDidChangeModelContent((e: any) => {
      const paneFile = useSplitPaneStore.getState().paneFiles.secondary
      if (!paneFile || !hasLSPSupport(paneFile)) return
      if (secondaryLspInitiatedEditRef.current) return
      const changes = e.changes?.map((ch: any) => ({
        range: ch.range ? {
          start: { line: ch.range.startLineNumber - 1, character: ch.range.startColumn - 1 },
          end: { line: ch.range.endLineNumber - 1, character: ch.range.endColumn - 1 },
        } : undefined,
        rangeLength: ch.rangeLength,
        text: ch.text,
      })) || []
      if (changes.length > 0) {
        secondaryLspPendingChangesRef.current.push(...changes)
      }
    })
    )

    // Basic keybindings for secondary pane (same as main pane)
    secondaryDisposablesRef.current.push(editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSaveForEditor(editor, secondaryLspOpenFileRef, secondaryLspDebounceRef, secondaryLspPendingChangesRef, secondaryLspInitiatedEditRef)
    }))
    // R5127: Removed Ctrl+Shift+T addCommand (secondary) — handled by App.tsx CustomEvent
    // R5127: Removed Ctrl+B addCommand (secondary) — handled by App.tsx CustomEvent
    // R5127: Suppress Monaco's built-in Ctrl+G (secondary) — same as main pane
    secondaryDisposablesRef.current.push(editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG, () => {
      // no-op: App.tsx dispatches 'open-goto-line' which CommandPalette handles
    }))
    // R5086: Focus outline panel (Ctrl+Shift+O) - VS Code pattern (secondary pane)
    secondaryDisposablesRef.current.push(editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyO, () => {
      setShowFileTree(true)
      setActivityView('outline')
    }))
    // R5127: Removed Ctrl+\ addCommand (secondary) — handled by App.tsx via 'toggle-split' CustomEvent
    // R5127: Removed Ctrl+Shift+E addCommand (secondary) — handled by App.tsx CustomEvent
    // R5127: Removed Ctrl+Shift+G addCommand (secondary) — handled by App.tsx CustomEvent
    // R5128: Alt+F1 Accessibility Help (secondary pane)
    secondaryDisposablesRef.current.push(editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.F1, () => {
      setShowAccessibilityHelp(true)
    }))
    // R5093: Navigate problems (F8 / Shift+F8) - VS Code pattern (secondary pane)
    secondaryDisposablesRef.current.push(editor.addCommand(monaco.KeyCode.F8, () => navigateProblemRef.current(editor, secondaryFile)))
    secondaryDisposablesRef.current.push(editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.F8, () => navigateProblemRef.current(editor, secondaryFile, -1)))
    // R5127: Removed Ctrl+Shift+M addCommand (secondary) — handled by App.tsx via 'show-problems' CustomEvent
    const secondaryKeybindings = [
      { id: 'editor.action.addSelectionToNextFindMatch', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD },
      { id: 'editor.action.insertCursorAbove', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.UpArrow },
      { id: 'editor.action.insertCursorBelow', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.DownArrow },
      { id: 'editor.action.selectHighlights', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyL },
      { id: 'editor.action.deleteLines', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyK },
      { id: 'editor.action.deleteWordLeft', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Backspace },
      { id: 'editor.action.deleteWordRight', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Delete },
      { id: 'editor.action.insertLineBefore', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter },
      { id: 'editor.action.insertLineAfter', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter },
      { id: 'editor.action.moveLinesUpAction', key: monaco.KeyMod.Alt | monaco.KeyCode.UpArrow },
      { id: 'editor.action.moveLinesDownAction', key: monaco.KeyMod.Alt | monaco.KeyCode.DownArrow },
      { id: 'editor.action.copyLinesUpAction', key: monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.UpArrow },
      { id: 'editor.action.copyLinesDownAction', key: monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.DownArrow },
      { id: 'editor.action.commentLine', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash },
      { id: 'editor.action.blockComment', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Slash },
      { id: 'editor.action.outdent', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.BracketLeft },
      { id: 'editor.action.indent', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.BracketRight },
      { id: 'editor.action.revealDefinition', key: monaco.KeyCode.F12 },
      { id: 'editor.action.peekDefinition', key: monaco.KeyMod.Alt | monaco.KeyCode.F12 },
      { id: 'editor.action.revealTypeDefinition', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.F12 },
      { id: 'editor.action.referenceSearch.trigger', key: monaco.KeyMod.Shift | monaco.KeyCode.F12 },
      { id: 'editor.action.jumpToBracket', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Backslash },
      // R5127: Removed gotoLine keybinding — handled by App.tsx via 'open-goto-line' CustomEvent
      { id: 'editor.action.rename', key: monaco.KeyCode.F2 },
      { id: 'editor.action.formatDocument', key: monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF },
      // R5131: Format Selection chord (Ctrl+K Ctrl+F) — VS Code standard
      { id: 'editor.action.formatSelection', key: monaco.KeyChord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF) },
      { id: 'editor.action.startFindReplaceAction', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH },
      // R5131: Missing VS Code keybindings
      { id: 'editor.action.cursorUndo', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyU },
      { id: 'editor.action.quickFix', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Period },
      // R5123: Explicit find next/prev (F3/Shift+F3) for robustness
      { id: 'editor.action.nextMatchFindAction', key: monaco.KeyCode.F3 },
      { id: 'editor.action.previousMatchFindAction', key: monaco.KeyMod.Shift | monaco.KeyCode.F3 },
      { id: 'editor.foldAll', key: monaco.KeyChord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit0) },
      { id: 'editor.unfoldAll', key: monaco.KeyChord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyJ) },
      { id: 'editor.foldLevel1', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit1 },
      { id: 'editor.foldLevel2', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit2 },
      { id: 'editor.foldLevel3', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit3 },
      // R5122: Missing VS Code fold commands
      { id: 'editor.foldRecursively', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.BracketLeft },
      { id: 'editor.unfoldRecursively', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.BracketRight },
      { id: 'editor.fold', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.BracketLeft },
      { id: 'editor.unfold', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.BracketRight },
      { id: 'editor.action.smartSelect.expand', key: monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.RightArrow },
      { id: 'editor.action.smartSelect.shrink', key: monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.LeftArrow },
      // R5079: VS Code standard - Ctrl+L expands line selection
      { id: 'editor.action.expandLineSelection', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL },
      // R5124: Missing VS Code multi-cursor commands
      { id: 'editor.action.addCursorsToLineEnds', key: monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyI },
      { id: 'editor.action.addSelectionToPreviousFindMatch', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyD },
      { id: 'editor.action.changeAll', key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.F2 },
      // R5124: Missing VS Code line commands
      // joinLines removed from Ctrl+J — VS Code uses Ctrl+J for Toggle Panel, not joinLines
      // R5125: Selection command (no Monaco default — genuinely useful)
      { id: 'editor.action.selectToBracket', key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.Backslash },
      // R5127 audit: Removed dirtydiff.previous/next — NOT in Monaco standalone (VS Code extension only)
      // R5127 audit: Removed toggleTabFocusMode, wordHighlight.next/prev, showContextMenu — Monaco defaults match
    ]
    for (const kb of secondaryKeybindings) {
      secondaryDisposablesRef.current.push(editor.addCommand(kb.key, () => {
        const action = editor.getAction(kb.id)
        if (action) action.run()
      }))
    }

    // P2 fix: Context menu actions for secondary pane (same as main pane)
    const secondaryContextMenuActions = [
      {
        id: 'cut',
        label: 'Cut',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX],
        contextMenuGroupId: '9_cutcopypaste',
        run: () => {
          editor.focus()
          document.execCommand('cut')
        },
      },
      {
        id: 'copy',
        label: 'Copy',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC],
        contextMenuGroupId: '9_cutcopypaste',
        run: () => {
          editor.focus()
          document.execCommand('copy')
        },
      },
      {
        id: 'paste',
        label: 'Paste',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV],
        contextMenuGroupId: '9_cutcopypaste',
        run: async () => {
          editor.focus()
          try {
            const text = await navigator.clipboard.readText()
            if (text) {
              const selection = editor.getSelection()
              if (selection) {
                editor.executeEdits('paste', [{
                  range: selection,
                  text: text,
                }])
              }
            }
          } catch {
            document.execCommand('paste')
          }
        },
      },
      {
        id: 'go-to-definition',
        label: 'Go to Definition',
        keybindings: [monaco.KeyCode.F12],
        contextMenuGroupId: 'navigation',
        run: () => {
          const action = editor.getAction('editor.action.revealDefinition')
          if (action) action.run()
        },
      },
      {
        id: 'peek-definition',
        label: 'Peek Definition',
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.F12],
        contextMenuGroupId: 'navigation',
        run: () => {
          const action = editor.getAction('editor.action.peekDefinition')
          if (action) action.run()
        },
      },
      {
        id: 'go-to-references',
        label: 'Go to References',
        keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F12],
        contextMenuGroupId: 'navigation',
        run: () => {
          const action = editor.getAction('editor.action.findReferences')
          if (action) action.run()
        },
      },
      // R5127: Missing context menu items in secondary pane (parity with main)
      {
        id: 'go-to-type-definition',
        label: 'Go to Type Definition',
        contextMenuGroupId: 'navigation',
        run: () => {
          const action = editor.getAction('editor.action.revealTypeDefinition')
          if (action) action.run()
        },
      },
      {
        id: 'go-to-implementation',
        label: 'Go to Implementation',
        contextMenuGroupId: 'navigation',
        run: () => {
          const action = editor.getAction('editor.action.goToImplementation')
          if (action) action.run()
        },
      },
      {
        id: 'rename-symbol',
        label: 'Rename Symbol',
        keybindings: [monaco.KeyCode.F2],
        contextMenuGroupId: 'navigation',
        run: () => {
          const action = editor.getAction('editor.action.rename')
          if (action) action.run()
        },
      },
      {
        id: 'format-document',
        label: 'Format Document',
        keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
        contextMenuGroupId: 'formatting',
        run: () => {
          const action = editor.getAction('editor.action.formatDocument')
          if (action) action.run()
        },
      },
      // R5127: Format Selection (parity with main pane)
      {
        id: 'format-selection',
        label: 'Format Selection',
        contextMenuGroupId: 'formatting',
        run: () => {
          const action = editor.getAction('editor.action.formatSelection')
          if (action) action.run()
        },
      },
      // R5097: Font size adjustment (same as main pane)
      // Note: keybindings handled globally by App.tsx to avoid double-fire
      {
        id: 'increase-font-size',
        label: 'Increase Font Size',
        contextMenuGroupId: 'font',
        run: () => {
          const newSize = Math.min(32, settings.fontSize + 2)
          updateSetting('fontSize', newSize)
        },
      },
      {
        id: 'decrease-font-size',
        label: 'Decrease Font Size',
        contextMenuGroupId: 'font',
        run: () => {
          const newSize = Math.max(8, settings.fontSize - 2)
          updateSetting('fontSize', newSize)
        },
      },
      {
        id: 'reset-font-size',
        label: 'Reset Font Size',
        contextMenuGroupId: 'font',
        run: () => {
          updateSetting('fontSize', 14)
        },
      },
    ]
    for (const action of secondaryContextMenuActions) {
      secondaryDisposablesRef.current.push(editor.addAction(action))
    }

    // Cursor position and selection tracking for StatusBar
    const updateCursorPosition = () => {
      const position = editor.getPosition()
      if (position) {
        useAppStore.getState().setEditorCursorPosition({ line: position.lineNumber, column: position.column })
      }
      const selection = editor.getSelection()
      if (selection && !selection.isEmpty()) {
        const model = editor.getModel()
        const selectedText = model?.getValueInRange(selection) || ''
        const lineCount = selection.endLineNumber - selection.startLineNumber + 1
        useAppStore.getState().setEditorSelection({
          lineCount,
          charCount: selectedText.length,
        })
      } else {
        useAppStore.getState().setEditorSelection(null)
      }
    }

    secondaryDisposablesRef.current.push(editor.onDidChangeCursorPosition(updateCursorPosition))
    secondaryDisposablesRef.current.push(editor.onDidChangeCursorSelection(updateCursorPosition))

    // Initial position update
    updateCursorPosition()

    // Track language and detect indentation for StatusBar (same as main pane)
    const model = editor.getModel()
    if (model) {
      const langId = model.getLanguageId()
      useAppStore.getState().setEditorLanguage(langId)
      secondaryDisposablesRef.current.push(model.onDidChangeLanguage(() => {
        useAppStore.getState().setEditorLanguage(model.getLanguageId())
      }))

      // Detect indentation from file content
      const detectIndent = () => {
        const content = model.getValue()
        const lines = content.split('\n').slice(0, 100)
        let spacesCount = 0
        let tabsCount = 0
        const spaceSizes: Record<number, number> = {}

        for (const line of lines) {
          const indent = line.match(/^[\t ]+/)?.[0]
          if (!indent) continue
          if (indent.startsWith('\t')) {
            tabsCount++
          } else {
            spacesCount++
            const size = indent.length
            spaceSizes[size] = (spaceSizes[size] || 0) + 1
          }
        }

        if (tabsCount > spacesCount) {
          useAppStore.getState().setEditorIndent({ type: 'tabs', size: 4 })
        } else if (spacesCount > 0) {
          const sorted = Object.entries(spaceSizes).sort((a, b) => b[1] - a[1])
          const mostCommon = sorted[0] ? parseInt(sorted[0][0]) : 2
          const size = mostCommon <= 3 ? 2 : mostCommon <= 6 ? 4 : mostCommon <= 10 ? 8 : mostCommon
          useAppStore.getState().setEditorIndent({ type: 'spaces', size })
        }
      }
      detectIndent()
    }
  }

  // Secondary pane editor change handler
  const handleSecondaryEditorChange = (value: string | undefined) => {
    const paneFile = useSplitPaneStore.getState().paneFiles.secondary
    if (value !== undefined && paneFile) {
      // Skip updateFileContent if edit was initiated by LSP or external reload
      if (secondaryLspInitiatedEditRef.current || externalReloadRef.current) return
      updateFileContent(paneFile, value)

      // Debounced LSP didChange
      // P1 fix: Capture content at debounce time, not execution time
      if (secondaryLspDebounceRef.current) clearTimeout(secondaryLspDebounceRef.current)
      if (secondaryLspOpenFileRef.current) {
        const lspFilePath = secondaryLspOpenFileRef.current // Capture at debounce time
        const capturedContent = value // Capture content at debounce time
        secondaryLspDebounceRef.current = setTimeout(() => {
          const pending = secondaryLspPendingChangesRef.current
          secondaryLspPendingChangesRef.current = []
          if (secondaryLspIncrementalRef.current && pending.length > 0) {
            lspApi.didChangeIncremental(lspFilePath, pending).catch(() => {})
          } else {
            lspApi.didChange(lspFilePath, capturedContent).catch(() => {})
          }
        }, 500)
      }

      // Auto-save
      // P1 fix: Capture file path and dirty state at debounce time, not execution time
      if (settings.autoSave) {
        if (secondaryAutoSaveTimeoutRef.current) clearTimeout(secondaryAutoSaveTimeoutRef.current)
        const fileToSave = paneFile // Capture at debounce time
        const isDirty = dirtyFiles.has(fileToSave) // P1 fix: Also capture dirty state
        secondaryAutoSaveTimeoutRef.current = setTimeout(() => {
          // P1 fix: Check settings again inside timeout (user might have disabled auto-save during debounce)
          if (isDirty) {
            saveFileByPath(fileToSave)
          }
        }, settings.autoSaveDelay || 1000)
      }
    }
  }

  // File tree context menu handlers (P1 feature - Cursor/VS Code pattern)
  const handleContextMenu = (e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, entry })
  }

  const closeContextMenu = () => {
    setContextMenu({ visible: false, x: 0, y: 0, entry: null })
  }

  const fileMenuKeyDown = useMenuKeyboardNav(contextMenuRef, closeContextMenu)

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

  const handleNewFile = (isFolder: boolean) => {
    const parentPath = contextMenu.entry?.isDirectory
      ? contextMenu.entry.path
      : contextMenu.entry?.path.split('/').slice(0, -1).join('/') || workspace
    setNewFileDialog({ parentPath, isFolder })
    setNewFileName('')
    closeContextMenu()
  }

  const handleRename = () => {
    if (contextMenu.entry) {
      setRenamingEntry(contextMenu.entry)
      setRenameValue(contextMenu.entry.name)
    }
    closeContextMenu()
  }

  const handleDelete = () => {
    const entry = contextMenu.entry
    if (!entry) return
    closeContextMenu()
    setDeleteTarget({ path: entry.path, name: entry.name })
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    // P1 fix: Warn if file has unsaved changes before deleting (data loss prevention)
    if (dirtyFiles.has(deleteTarget.path)) {
      setDirtyClosePath(deleteTarget.path)
      setDeleteTarget(null)
      return
    }
    try {
      await api.fs.deleteFile(deleteTarget.path)
      refreshFileTree()
      // Close the file if it's open
      if (openFiles.includes(deleteTarget.path)) {
        closeFile(deleteTarget.path)
      }
      addToast('success', 'Deleted', deleteTarget.name)
      fetchGitStatusRef.current()
    } catch (err) {
      addToast('error', 'Delete failed', err instanceof Error ? err.message : String(err))
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleCopyPath = () => {
    const entry = contextMenu.entry
    if (entry) {
      navigator.clipboard.writeText(entry.path)
      addToast('success', 'Copied', 'Full path copied to clipboard')
    }
    closeContextMenu()
  }

  const handleCopyRelativePath = () => {
    const entry = contextMenu.entry
    if (entry && workspace) {
      const relPath = entry.path.replace(workspace, '').replace(/^\//, '')
      navigator.clipboard.writeText(relPath)
      addToast('success', 'Copied', 'Relative path copied to clipboard')
    }
    closeContextMenu()
  }

  const handleCutFile = () => {
    const entry = contextMenu.entry
    if (entry) {
      setFileClipboard({ path: entry.path, isDirectory: entry.isDirectory, operation: 'cut' })
      addToast('info', 'Cut', `${entry.isDirectory ? 'Folder' : 'File'} cut: ${entry.name}`)
    }
    closeContextMenu()
  }

  const handleCopyFile = () => {
    const entry = contextMenu.entry
    if (entry) {
      setFileClipboard({ path: entry.path, isDirectory: entry.isDirectory, operation: 'copy' })
      addToast('info', 'Copied', `${entry.isDirectory ? 'Folder' : 'File'} copied: ${entry.name}`)
    }
    closeContextMenu()
  }

  const handlePasteFile = async () => {
    const entry = contextMenu.entry
    if (!fileClipboard || !entry) return
    const targetDir = entry.isDirectory ? entry.path : entry.path.split('/').slice(0, -1).join('/')
    const fileName = fileClipboard.path.split('/').pop()!
    const destPath = targetDir ? `${targetDir}/${fileName}` : fileName

    // VS Code: validate source still exists before paste
    try {
      if (fileClipboard.operation === 'copy') {
        await api.fs.copyFile(fileClipboard.path, destPath)
        addToast('success', 'Pasted', `${fileClipboard.isDirectory ? 'Folder' : 'File'} pasted: ${fileName}`)
        // VS Code: copy is NOT sticky — clear after paste
        setFileClipboard(null)
      } else {
        // Cut = rename (move)
        await api.fs.renameFile(fileClipboard.path, destPath)
        setFileClipboard(null)
        addToast('success', 'Moved', `${fileClipboard.isDirectory ? 'Folder' : 'File'} moved: ${fileName}`)
        // Update store if the moved file was open
        if (openFiles.includes(fileClipboard.path)) {
          useWorkspaceStore.getState().renameFileInStore(fileClipboard.path, destPath)
        }
      }
      refreshFileTree()
      fetchGitStatusRef.current()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('not found') || msg.includes('source')) {
        addToast('warning', 'Paste failed', 'The file has been deleted or moved since you copied it')
        setFileClipboard(null)
      } else {
        addToast('error', 'Paste failed', msg)
      }
    }
    closeContextMenu()
  }

  const submitRename = async () => {
    if (!renamingEntry || !renameValue.trim()) {
      // Dismiss rename input on empty/invalid value (onBlur case)
      setRenamingEntry(null)
      setRenameValue('')
      return
    }
    const newName = renameValue.trim()
    const parentPath = renamingEntry.path.split('/').slice(0, -1).join('/')
    const newPath = parentPath ? `${parentPath}/${newName}` : newName

    try {
      await api.fs.renameFile(renamingEntry.path, newPath)
      refreshFileTree()
      fetchGitStatusRef.current() // Refresh git status after rename
      // Update open file path in store (openFiles, fileContents, currentFile, dirtyFiles)
      if (openFiles.includes(renamingEntry.path)) {
        useWorkspaceStore.getState().renameFileInStore(renamingEntry.path, newPath)
        // P1 fix: Dispose old model and create new one with correct URI
        // (Monaco models have immutable URIs — can't just update the cache key)
        const cachedModel = modelCacheRef.current.get(renamingEntry.path)
        if (cachedModel && monacoRef.current) {
          const content = cachedModel.getValue()
          const ext = newPath.split('.').pop()?.toLowerCase() || ''
          const lang = LSP_LANG_MAP[ext] || 'plaintext'
          modelCacheRef.current.delete(renamingEntry.path)
          cachedModel.dispose()
          const newModel = monacoRef.current.editor.createModel(content, lang, monacoRef.current.Uri.file(newPath))
          modelCacheRef.current.set(newPath, newModel)
          // Update editor to use new model
          if (editorRef.current && currentFile === renamingEntry.path) {
            editorRef.current.setModel(newModel)
          }
        }
      }
      addToast('success', 'Renamed', `${renamingEntry.name} → ${newName}`)
    } catch (err) {
      addToast('error', 'Rename failed', err instanceof Error ? err.message : String(err))
    }
    setRenamingEntry(null)
    setRenameValue('')
  }

  const submitNewFile = async () => {
    if (!newFileDialog || !newFileName.trim()) return
    const name = newFileName.trim()
    const path = newFileDialog.parentPath
      ? `${newFileDialog.parentPath}/${name}`
      : name

    try {
      if (newFileDialog.isFolder) {
        await api.fs.mkdir(path)
      } else {
        await api.fs.createFile(path)
      }
      refreshFileTree()
      fetchGitStatusRef.current() // Refresh git status after create
      addToast('success', 'Created', `${newFileDialog.isFolder ? 'Folder' : 'File'}: ${name}`)
      // Auto-open new file
      if (!newFileDialog.isFolder) {
        openFileFromStore(path)
      }
    } catch (err) {
      addToast('error', 'Create failed', err instanceof Error ? err.message : String(err))
    }
    setNewFileDialog(null)
    setNewFileName('')
  }

  const refreshFileTree = async () => {
    if (!workspace) return
    try {
      const entries = await api.fs.listDir(workspace)
      setFileTree(entries)
    } catch (err) {
      logger.error('Editor', 'Failed to refresh file tree:', err)
    }
  }

  const toggleDir = async (entry: FileEntry) => {
    if (!entry.isDirectory) return

    const newExpanded = new Set(expandedDirs)
    if (newExpanded.has(entry.path)) {
      newExpanded.delete(entry.path)
    } else {
      newExpanded.add(entry.path)
      if (!entry.children || entry.children.length === 0) {
        try {
          const children = await api.fs.listDir(entry.path)
          // Use functional update to avoid stale closure over fileTree
          setFileTree(prev => {
            const updateChildren = (entries: FileEntry[], path: string): FileEntry[] => {
              return entries.map(e => {
                if (e.path === path && e.isDirectory) {
                  return { ...e, children }
                }
                if (e.isDirectory && e.children) {
                  return { ...e, children: updateChildren(e.children, path) }
                }
                return e
              })
            }
            return updateChildren(prev, entry.path)
          })
        } catch (err) {
          logger.error('Editor', 'Failed to load directory:', err)
        }
      }
    }
    setExpandedDirs(newExpanded)
  }

  // File-type-specific icons (shared utility — VS Code/Cursor pattern)
  const getIconComponent = (filename: string) => getFileIcon(filename)
  const getIconColor = (filename: string) => getFileIconColor(filename)

  // Filter file tree: keep entries whose name matches query, plus parent directories
  const filteredFileTree = useMemo(() => {
    const q = fileTreeFilter.toLowerCase().trim()
    if (!q) return fileTree
    const filterEntries = (entries: FileEntry[]): FileEntry[] => {
      const result: FileEntry[] = []
      for (const entry of entries) {
        if (entry.isDirectory) {
          const filteredChildren = filterEntries(entry.children || [])
          if (filteredChildren.length > 0 || entry.name.toLowerCase().includes(q)) {
            result.push({ ...entry, children: filteredChildren.length > 0 ? filteredChildren : entry.children })
          }
        } else {
          if (entry.name.toLowerCase().includes(q)) {
            result.push(entry)
          }
        }
      }
      return result
    }
    return filterEntries(fileTree)
  }, [fileTree, fileTreeFilter])

  // Auto-expand all directories when filter is active
  useEffect(() => {
    if (fileTreeFilter.trim()) {
      const expandAll = (entries: FileEntry[], paths: string[]) => {
        for (const entry of entries) {
          if (entry.isDirectory && entry.children?.length) {
            paths.push(entry.path)
            expandAll(entry.children, paths)
          }
        }
      }
      const allPaths: string[] = []
      expandAll(fileTree, allPaths)
      setExpandedDirs(new Set(allPaths))
    }
  }, [fileTreeFilter, fileTree])

  // Reveal active file in file tree (VS Code/Cursor pattern)
  useEffect(() => {
    if (!currentFile || !showFileTree) return
    const parts = currentFile.split('/')
    const parentPaths: string[] = []
    for (let i = 1; i < parts.length; i++) {
      parentPaths.push(parts.slice(0, i).join('/'))
    }
    setExpandedDirs(prev => {
      const next = new Set(prev)
      let changed = false
      for (const p of parentPaths) {
        if (!next.has(p)) {
          next.add(p)
          changed = true
        }
      }
      return changed ? next : prev
    })
    // Scroll active file into view after render
    requestAnimationFrame(() => {
      const activeBtn = document.querySelector('[data-active-file="true"]')
      activeBtn?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }, [currentFile, showFileTree])

  // P1: Escape returns focus from file tree to editor (VS Code pattern)
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const activeEl = document.activeElement
      if (!activeEl) return
      // Don't intercept if focus is on an input (e.g., rename input)
      if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') return
      // Check if focus is inside the file tree
      const fileTreeContainer = activeEl.closest('.file-tree-container')
      if (fileTreeContainer) {
        e.preventDefault()
        e.stopPropagation()
        // Focus the Monaco editor
        editorRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleEscape, true)
    return () => document.removeEventListener('keydown', handleEscape, true)
  }, [])


  const renderFileTree = (entries: FileEntry[], level: number = 0) => {
    return entries.map((entry) => {
      const isExpanded = expandedDirs.has(entry.path)
      const isActive = currentFile === entry.path
      const isRenaming = renamingEntry?.path === entry.path

      const Icon = entry.isDirectory ? Folder : getIconComponent(entry.name)
      const iconColor = entry.isDirectory ? 'text-accent' : getIconColor(entry.name)

      return (
        <div key={entry.path}>
          {isRenaming ? (
            <div className="flex items-center px-2 py-1.5" style={{ paddingLeft: `${level * 12 + 8}px` }}>
              <Icon size={14} className={`mr-2 ${iconColor}`} />
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitRename()
                  if (e.key === 'Escape') { setRenamingEntry(null); setRenameValue('') }
                }}
                onBlur={submitRename}
                autoFocus
                className="flex-1 bg-surface border border-accent rounded px-1 text-sm text-text-primary outline-none"
              />
            </div>
          ) : (
            <button
              onClick={() => loadFile(entry)}
              onDoubleClick={() => {
                // VS Code: double-click pins the preview tab (converts to permanent)
                if (!entry.isDirectory) {
                  const state = useWorkspaceStore.getState()
                  if (state.previewTab === entry.path) {
                    useWorkspaceStore.setState({ previewTab: null, mruOrder: [...state.mruOrder, entry.path] })
                  }
                }
              }}
              onContextMenu={(e) => handleContextMenu(e, entry)}
              draggable={!entry.isDirectory}
              onDragStart={(e) => {
                if (entry.isDirectory) return
                e.dataTransfer.setData('text/plain', entry.path)
                e.dataTransfer.setData('application/json', JSON.stringify({ type: 'file', path: entry.path }))
                e.dataTransfer.effectAllowed = 'move'
              }}
              onKeyDown={(e) => {
                // P1 UX: Keyboard navigation for file tree (VS Code pattern)
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  const container = e.currentTarget.closest('.file-tree-container')
                  const buttons = container?.querySelectorAll('button.file-tree-entry')
                  if (buttons && buttons.length > 0) {
                    const currentIndex = Array.from(buttons).indexOf(e.currentTarget)
                    const nextIndex = e.key === 'ArrowDown'
                      ? Math.min(currentIndex + 1, buttons.length - 1)
                      : Math.max(currentIndex - 1, 0)
                    ;(buttons[nextIndex] as HTMLElement)?.focus()
                  }
                } else if (e.key === 'ArrowRight' && entry.isDirectory) {
                  // P1: ArrowRight expands collapsed folder (VS Code pattern)
                  e.preventDefault()
                  if (!expandedDirs.has(entry.path)) {
                    toggleDir(entry)
                    // Focus first child after React re-renders the tree
                    requestAnimationFrame(() => {
                      const container = e.currentTarget.closest('.file-tree-container')
                      const buttons = container?.querySelectorAll('button.file-tree-entry')
                      if (buttons) {
                        const currentIndex = Array.from(buttons).indexOf(e.currentTarget)
                        if (currentIndex < buttons.length - 1) {
                          (buttons[currentIndex + 1] as HTMLElement)?.focus()
                        }
                      }
                    })
                  } else {
                    // Already expanded: focus first child
                    const container = e.currentTarget.closest('.file-tree-container')
                    const buttons = container?.querySelectorAll('button.file-tree-entry')
                    if (buttons) {
                      const currentIndex = Array.from(buttons).indexOf(e.currentTarget)
                      if (currentIndex < buttons.length - 1) {
                        (buttons[currentIndex + 1] as HTMLElement)?.focus()
                      }
                    }
                  }
                } else if (e.key === 'ArrowLeft' && entry.isDirectory) {
                  // P1: ArrowLeft collapses expanded folder (VS Code pattern)
                  e.preventDefault()
                  if (expandedDirs.has(entry.path)) {
                    toggleDir(entry)
                  }
                } else if (e.key === 'Enter') {
                  // P1: Enter opens file or toggles directory (VS Code pattern)
                  e.preventDefault()
                  loadFile(entry)
                } else if (e.key === 'F2') {
                  // P1: F2 to rename file or folder (VS Code pattern)
                  e.preventDefault()
                  setRenamingEntry(entry)
                  setRenameValue(entry.name)
                } else if (e.key === 'Delete') {
                  // P1: Delete to delete file or folder (VS Code pattern)
                  e.preventDefault()
                  setDeleteTarget({ path: entry.path, name: entry.name })
                } else if (e.key === ' ' && entry.isDirectory) {
                  // P2 UX: Space to toggle directory (VS Code pattern)
                  e.preventDefault()
                  toggleDir(entry)
                } else if (e.key === 'Home') {
                  // P2: Home focuses first item (VS Code pattern)
                  e.preventDefault()
                  const container = e.currentTarget.closest('.file-tree-container')
                  const buttons = container?.querySelectorAll('button.file-tree-entry')
                  if (buttons && buttons.length > 0) {
                    (buttons[0] as HTMLElement)?.focus()
                  }
                } else if (e.key === 'End') {
                  // P2: End focuses last item (VS Code pattern)
                  e.preventDefault()
                  const container = e.currentTarget.closest('.file-tree-container')
                  const buttons = container?.querySelectorAll('button.file-tree-entry')
                  if (buttons && buttons.length > 0) {
                    (buttons[buttons.length - 1] as HTMLElement)?.focus()
                  }
                }
              }}
              data-active-file={isActive ? 'true' : undefined}
              tabIndex={0}
              className={`file-tree-entry w-full flex items-center px-2 py-1.5 text-left text-sm transition-all duration-150 rounded-mac ${
                isActive ? 'bg-accent-muted text-text-primary' : 'text-text-secondary hover:bg-card-hover hover:text-text-primary'
              }`}
              style={{ paddingLeft: `${level * 12 + 8}px` }}
            >
              {entry.isDirectory && (
                <span
                  className="mr-1 cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); toggleDir(entry); }}
                  aria-label={isExpanded ? `Collapse ${entry.name}` : `Expand ${entry.name}`}
                  aria-expanded={isExpanded}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); toggleDir(entry) } }}
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
              )}
              <Icon size={14} className={`mr-2 ${iconColor}`} />
              <span className="truncate flex-1">{entry.name}</span>
              {/* Git status indicator (VS Code/Cursor pattern) */}
              {!entry.isDirectory && gitStatusMap[entry.path] && (
                <span className={`text-[10px] font-bold ml-auto px-1 ${
                  gitStatusMap[entry.path].staged ? 'text-green-400' : 'text-yellow-400'
                }`} title={gitStatusMap[entry.path].status}>
                  {gitStatusMap[entry.path].status === '??' ? 'U' : gitStatusMap[entry.path].status}
                </span>
              )}
            </button>
          )}
          {entry.isDirectory && isExpanded && entry.children && entry.children.length > 0 && (
            <div>
              {renderFileTree(entry.children, level + 1)}
            </div>
          )}
        </div>
      )
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-panel-bg/50 border-b border-glass-border">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFileTree(!showFileTree)}
            className="p-1.5 hover:bg-card-hover rounded-mac transition-colors duration-200"
            title="Toggle File Tree"
            aria-label="Toggle file tree"
            aria-expanded={showFileTree}
          >
            <PanelLeft size={16} className="text-text-secondary" />
          </button>

          <div className="flex items-center gap-3 ml-2">
            <span className="text-sm text-text-primary font-medium truncate max-w-48">
              {currentFile ? currentFile.split('/').pop() : workspace.split('/').pop()}
            </span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="input-mac py-0.5 min-w-0"
            >
              <option value="typescript">TypeScript</option>
              <option value="typescriptreact">TypeScript React</option>
              <option value="javascript">JavaScript</option>
              <option value="javascriptreact">JavaScript React</option>
              <option value="python">Python</option>
              <option value="go">Go</option>
              <option value="rust">Rust</option>
              <option value="java">Java</option>
              <option value="c">C</option>
              <option value="cpp">C++</option>
              <option value="csharp">C#</option>
              <option value="json">JSON</option>
              <option value="yaml">YAML</option>
              <option value="markdown">Markdown</option>
              <option value="html">HTML</option>
              <option value="css">CSS</option>
              <option value="scss">SCSS</option>
              <option value="shell">Shell</option>
              <option value="sql">SQL</option>
              <option value="plaintext">Plain Text</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleSplit()}
            disabled={!currentFile || loading}
            className={`btn-secondary ${splitDirection !== 'none' ? 'bg-accent/20 border-accent' : ''}`}
            title="Split Editor (Ctrl+\\)"
          >
            <Columns2 size={14} />
          </button>

          <button
            onClick={handleFormat}
            disabled={!currentFile || loading}
            className="btn-secondary"
            title="Format Document (Shift+Alt+F)"
          >
            <Wand2 size={14} />
          </button>

          <button
            onClick={handleSave}
            disabled={!currentFile || loading}
            className="btn-secondary"
          >
            <Save size={14} />
            <span>Save</span>
          </button>

          <button
            onClick={handleRun}
            disabled={!currentFile || loading}
            className="btn-primary"
          >
            <Play size={14} />
            <span>Run</span>
          </button>

          {/* More Actions dropdown */}
          <div className="relative" ref={moreActionsRef}>
            <button
              onClick={() => setShowMoreActions(!showMoreActions)}
              className="p-1.5 hover:bg-card-hover rounded transition-colors"
              title="More Actions"
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={showMoreActions}
            >
              <MoreHorizontal size={16} className="text-text-secondary" />
            </button>
            {showMoreActions && (
              <div ref={moreActionsMenuRef} role="menu" id="more-actions-menu" className="absolute right-0 top-full mt-1 w-48 bg-card border border-glass-border rounded-mac shadow-lg z-50 py-1" onKeyDown={moreActionsKeyDown}>
                <button
                  onClick={() => { updateSetting('minimap', !settings.minimap); setShowMoreActions(false) }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-card-hover transition-colors"
                  role="menuitem"
                >
                  <MapIcon size={14} />
                  <span>Minimap</span>
                  <span className="ml-auto text-text-tertiary">{settings.minimap ? 'On' : 'Off'}</span>
                </button>
                <button
                  onClick={() => { updateSetting('wordWrap', !settings.wordWrap); setShowMoreActions(false) }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-secondary hover:bg-card-hover transition-colors"
                  role="menuitem"
                >
                  <WrapText size={14} />
                  <span>Word Wrap</span>
                  <span className="ml-auto text-text-tertiary">{settings.wordWrap ? 'On' : 'Off'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <TabBar
        openFiles={openFiles}
        currentFile={currentFile}
        dirtyFiles={dirtyFiles}
        pinnedFiles={pinnedFiles}
        previewTab={previewTab}
        onTabClick={handleTabClick}
        onTabClose={handleTabClose}
        onCloseAll={() => {
          if (openFiles.some(f => dirtyFiles.has(f))) {
            setDirtyClosePath('__close_all__')
          } else {
            const count = openFiles.filter(f => !pinnedFiles.has(f)).length
            closeAllFiles()
            if (count > 0) {
              addToast('info', 'All tabs closed', `${count} tab${count > 1 ? 's' : ''} closed`, {
                actions: [{ label: 'Undo', onClick: () => { useWorkspaceStore.getState().undoCloseFiles() } }],
              })
            }
          }
        }}
        onCloseOthers={() => {
          if (!currentFile) return
          const count = openFiles.filter(f => f !== currentFile && !pinnedFiles.has(f)).length
          closeOthers(currentFile)
          if (count > 0) {
            addToast('info', 'Other tabs closed', `${count} tab${count > 1 ? 's' : ''} closed`, {
              actions: [{ label: 'Undo', onClick: () => { useWorkspaceStore.getState().undoCloseFiles() } }],
            })
          }
        }}
        onCloseSaved={() => {
          const count = openFiles.filter(f => !dirtyFiles.has(f) && !pinnedFiles.has(f)).length
          closeSaved()
          if (count > 0) {
            addToast('info', 'Saved tabs closed', `${count} tab${count > 1 ? 's' : ''} closed`, {
              actions: [{ label: 'Undo', onClick: () => { useWorkspaceStore.getState().undoCloseFiles() } }],
            })
          }
        }}
        onCloseToLeft={currentFile && openFiles.indexOf(currentFile) > 0 ? () => {
          if (currentFile) {
            const keepIndex = openFiles.indexOf(currentFile)
            if (keepIndex === -1) return
            const count = keepIndex
            const dirtyToLeft = openFiles.slice(0, keepIndex).filter(f => dirtyFiles.has(f))
            if (dirtyToLeft.length > 0) {
              for (const path of dirtyToLeft) {
                const content = fileContents.get(path)
                if (content !== undefined) {
                  api.fs.writeFile(path, content).catch((err) => {
                    addToast('error', 'Auto-save failed', `Failed to save ${path.split('/').pop()}: ${err instanceof Error ? err.message : String(err)}`)
                  })
                  clearDirty(path)
                }
              }
              fetchGitStatusRef.current()
            }
            closeToLeft(currentFile)
            if (count > 0) {
              addToast('info', 'Tabs to left closed', `${count} tab${count > 1 ? 's' : ''} closed`, {
                actions: [{ label: 'Undo', onClick: () => { useWorkspaceStore.getState().undoCloseFiles() } }],
              })
            }
          }
        } : undefined}
        onCloseToRight={currentFile && openFiles.indexOf(currentFile) < openFiles.length - 1 ? () => {
          if (currentFile) {
            const keepIndex = openFiles.indexOf(currentFile)
            if (keepIndex === -1) return
            const count = openFiles.length - keepIndex - 1
            const dirtyToRight = openFiles.slice(keepIndex + 1).filter(f => dirtyFiles.has(f))
            if (dirtyToRight.length > 0) {
              for (const path of dirtyToRight) {
                const content = fileContents.get(path)
                if (content !== undefined) {
                  api.fs.writeFile(path, content).catch((err) => {
                    addToast('error', 'Auto-save failed', `Failed to save ${path.split('/').pop()}: ${err instanceof Error ? err.message : String(err)}`)
                  })
                  clearDirty(path)
                }
              }
              fetchGitStatusRef.current()
            }
            closeToRight(currentFile)
            if (count > 0) {
              addToast('info', 'Tabs to right closed', `${count} tab${count > 1 ? 's' : ''} closed`, {
                actions: [{ label: 'Undo', onClick: () => { useWorkspaceStore.getState().undoCloseFiles() } }],
              })
            }
          }
        } : undefined}
        onReorder={reorderFiles}
        onTabContextMenu={handleTabContextMenu}
        paneId="main"
        onDragStart={(paneId, path) => setDraggedTab({ paneId, path })}
        onRename={(path) => {
          // R5098: Double-click to rename - VS Code pattern
          setRenamingEntry({ name: path.split('/').pop() || path, path, isDirectory: false })
          setRenameValue(path.split('/').pop() || path)
        }}
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
            {/* Activity Bar — VS Code style vertical icon strip */}
            <div className="w-12 bg-panel-bg/50 border-r border-glass-border flex flex-col items-center pt-1 shrink-0">
              <button
                onClick={() => setActivityView('explorer')}
                className={`w-12 h-12 flex items-center justify-center transition-colors relative ${
                  activityView === 'explorer' ? 'text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
                }`}
                title="Explorer (Ctrl+Shift+E)"
              >
                {activityView === 'explorer' && <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-accent rounded-r" />}
                <Files size={24} />
              </button>
              <button
                onClick={() => setActivityView('sourceControl')}
                className={`w-12 h-12 flex items-center justify-center transition-colors relative ${
                  activityView === 'sourceControl' ? 'text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
                }`}
                title="Source Control (Ctrl+Shift+G)"
              >
                {activityView === 'sourceControl' && <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-accent rounded-r" />}
                <GitBranch size={24} />
                {Object.keys(gitStatusMap).length > 0 && (
                  <span className="absolute top-1 right-1 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-accent/80 text-white text-[9px] font-bold leading-none px-0.5">
                    {Object.keys(gitStatusMap).length > 999 ? `${Math.floor(Object.keys(gitStatusMap).length / 1000)}K` : Object.keys(gitStatusMap).length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActivityView('outline')}
                className={`w-12 h-12 flex items-center justify-center transition-colors relative ${
                  activityView === 'outline' ? 'text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
                }`}
                title="Problems & Outline (Ctrl+Shift+O)"
              >
                {activityView === 'outline' && <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-accent rounded-r" />}
                <ListTree size={24} />
                {(() => {
                  const errors = workspaceProblems.filter(p => p.severity === 'error').length
                  return errors > 0 ? (
                    <span className="absolute top-1 right-1 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-error/80 text-white text-[9px] font-bold leading-none px-0.5">
                      {errors > 99 ? '99+' : errors}
                    </span>
                  ) : null
                })()}
              </button>
            </div>
            {/* Sidebar Content */}
            <div className="bg-panel-bg/30 border-r border-glass-border overflow-hidden flex flex-col" style={{ width: `${sidebarWidth}px` }}>

            {activityView === 'explorer' ? (
              <>
                <div className="panel-header flex items-center justify-between shrink-0">
                  <span>Files</span>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => { setNewFileDialog({ parentPath: workspace, isFolder: false }); setNewFileName('') }}
                      className="p-0.5 hover:bg-card-hover rounded transition-colors"
                      title="New File"
                    >
                      <FilePlus size={12} className="text-text-tertiary" />
                    </button>
                    <button
                      onClick={() => { setNewFileDialog({ parentPath: workspace, isFolder: true }); setNewFileName('') }}
                      className="p-0.5 hover:bg-card-hover rounded transition-colors"
                      title="New Folder"
                    >
                      <FolderPlus size={12} className="text-text-tertiary" />
                    </button>
                    <button
                      onClick={() => {
                        // R5100: Expand All - VS Code pattern
                        const expandAll = (entries: FileEntry[], paths: string[]) => {
                          for (const entry of entries) {
                            if (entry.isDirectory && entry.children?.length) {
                              paths.push(entry.path)
                              expandAll(entry.children, paths)
                            }
                          }
                        }
                        const allPaths: string[] = []
                        expandAll(fileTree, allPaths)
                        setExpandedDirs(new Set(allPaths))
                      }}
                      className="p-0.5 hover:bg-card-hover rounded transition-colors"
                      title="Expand All"
                    >
                      <ChevronsUpDown size={12} className="text-text-tertiary" />
                    </button>
                    <button
                      onClick={() => setExpandedDirs(new Set())}
                      className="p-0.5 hover:bg-card-hover rounded transition-colors"
                      title="Collapse All"
                    >
                      <ChevronsDownUp size={12} className="text-text-tertiary" />
                    </button>
                  </div>
                </div>
                {/* File tree filter */}
                {fileTree.length > 0 && (
                  <div className="px-2 pb-1 shrink-0">
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-surface rounded-mac text-text-tertiary">
                      <Search size={12} />
                      <input
                        type="text"
                        value={fileTreeFilter}
                        onChange={(e) => setFileTreeFilter(e.target.value)}
                        placeholder="Filter files..."
                        className="flex-1 bg-transparent text-xs text-text-primary placeholder-text-tertiary outline-none"
                      />
                      {fileTreeFilter && (
                        <button onClick={() => setFileTreeFilter('')} className="hover:text-text-primary" aria-label="Clear filter" title="Clear filter">
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto p-2 space-y-0.5 file-tree-container">
                  {loading && fileTree.length === 0 ? (
                    <div className="text-xs text-text-tertiary p-2">Loading...</div>
                  ) : (
                    renderFileTree(filteredFileTree, 0)
                  )}
                </div>
              </>
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
            <div className="flex items-center gap-1 px-3 py-1 bg-mac-bg/50 border-b border-glass-border text-xs text-text-secondary overflow-x-auto">
              {currentFile.split('/').map((segment, index, segments) => {
                const pathUpToHere = segments.slice(0, index + 1).join('/')
                const isLast = index === segments.length - 1
                const isFolder = !isLast

                const handleBreadcrumbClick = () => {
                  if (isFolder) {
                    // Expand file tree to show this folder — must expand all parent dirs too
                    const newExpanded = new Set(expandedDirs)
                    for (let i = 0; i <= index; i++) {
                      newExpanded.add(segments.slice(0, i + 1).join('/'))
                    }
                    setExpandedDirs(newExpanded)
                    setShowFileTree(true)
                  }
                  // For files, we're already on this file - no action needed
                }

                return (
                  <span key={index} className="flex items-center gap-1 whitespace-nowrap">
                    {index > 0 && <ChevronRight size={10} className="text-text-tertiary flex-shrink-0" />}
                    <button
                      onClick={isFolder ? handleBreadcrumbClick : undefined}
                      className={`${
                        isLast && !breadcrumbSymbols.length ? 'text-text-primary font-medium' : 'text-text-secondary hover:text-text-primary hover:bg-card-hover px-1 rounded cursor-pointer'
                      } ${isFolder ? 'transition-colors' : ''}`}
                      title={pathUpToHere}
                      disabled={!isFolder}
                    >
                      {segment}
                    </button>
                  </span>
                )
              })}
              {/* LSP symbol breadcrumbs (show scope containing cursor) */}
              {breadcrumbSymbols.map((sym, symIndex) => (
                <span key={`symbol-${symIndex}`} className="flex items-center gap-1 whitespace-nowrap">
                  <ChevronRight size={10} className="text-text-tertiary flex-shrink-0" />
                  <button
                    onClick={() => {
                      // R5097: Navigate in the active pane's editor
                      const activeEditor = activePaneId === 'secondary' ? secondaryEditorRef.current : editorRef.current
                      if (activeEditor && sym.selectionRange) {
                        const { start, end } = sym.selectionRange
                        activeEditor.setSelection({
                          startLineNumber: start.line + 1,
                          startColumn: start.character + 1,
                          endLineNumber: end.line + 1,
                          endColumn: end.character + 1,
                        })
                        activeEditor.revealRangeInCenter({
                          startLineNumber: start.line + 1,
                          startColumn: start.character + 1,
                          endLineNumber: end.line + 1,
                          endColumn: end.character + 1,
                        })
                        activeEditor.focus()
                      }
                    }}
                    className={`${
                      symIndex === breadcrumbSymbols.length - 1
                        ? 'text-text-primary font-medium'
                        : 'text-text-secondary hover:text-text-primary hover:bg-card-hover px-1 rounded cursor-pointer'
                    } transition-colors`}
                    title={`${sym.kind || 'Symbol'}: ${sym.name}${sym.detail ? ` — ${sym.detail}` : ''}`}
                  >
                    {sym.name}
                  </button>
                </span>
              ))}
              {/* Open Diff button — show when current file has git changes */}
              {gitStatusMap[currentFile] && !diffView && (
                <button
                  onClick={() => handleOpenDiff(currentFile!)}
                  className="flex items-center gap-1.5 px-2 py-0.5 text-xs text-text-secondary hover:text-accent hover:bg-accent/10 rounded-mac transition-colors ml-auto mr-2"
                  title="Open diff view (HEAD vs Working Tree)"
                >
                  <GitCompare size={13} />
                  Diff
                </button>
              )}
            </div>
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
            <div
              className={`overflow-hidden transition-all ${splitDirection === 'horizontal' ? 'flex-1 border-r border-glass-border' : 'w-full h-full'} ${dropTargetPane === 'main' ? 'bg-accent/10' : ''} ${splitDirection !== 'none' && activePaneId === 'secondary' ? 'opacity-75' : ''}`}
              onDragOver={(e) => {
                // Accept drags from file tree or from secondary pane tabs
                const hasFileData = e.dataTransfer.types.includes('application/json')
                if (hasFileData || (draggedTab && draggedTab.paneId === 'secondary')) {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setDropTargetPane('main')
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDropTargetPane(null)
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                setDropTargetPane(null)
                // Check for file tree drag
                const fileTreeData = e.dataTransfer.getData('application/json')
                if (fileTreeData) {
                  try {
                    const data = JSON.parse(fileTreeData)
                    if (data.type === 'file' && data.path) {
                      // Open file from tree in main pane
                      loadFile({ path: data.path, name: data.path.split('/').pop() || '', isDirectory: false })
                      setDraggedTab(null)
                      return
                    }
                  } catch { /* ignore parse errors */ }
                }
                // Handle tab drag from secondary pane
                if (draggedTab && draggedTab.paneId === 'secondary') {
                  setPaneFile('main', draggedTab.path)
                  setActivePane('main')
                }
                setDraggedTab(null)
              }}
            >
              <Editor
                height="100%"
                language={language}
                value={code}
                onChange={handleEditorChange}
                onMount={handleEditorMount}
                options={buildEditorOptions({
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
                  // R5121: VS Code parity settings
                  smoothScrolling: settings.smoothScrolling,
                  cursorSmoothCaretAnimation: settings.cursorSmoothCaretAnimation ? 'on' : 'off',
                  linkedEditing: settings.linkedEditing,
                  scrollBeyondLastLine: settings.scrollBeyondLastLine,
                  formatOnPaste: settings.formatOnPaste,
                  mouseWheelZoom: settings.mouseWheelZoom,
                  semanticHighlighting: settings.semanticHighlighting,
                  // R5122: Autocomplete settings
                  quickSuggestions: settings.quickSuggestions,
                  acceptSuggestionOnEnter: settings.acceptSuggestionOnEnter,
                  tabCompletion: settings.tabCompletion,
                  wordBasedSuggestions: settings.wordBasedSuggestions,
                  suggestOnTriggerCharacters: settings.suggestOnTriggerCharacters,
                })}
              />
            </div>
            {/* Secondary pane (split editor) */}
            {splitDirection === 'horizontal' && (
              <div
                className={`flex-1 overflow-hidden flex flex-col transition-all ${dropTargetPane === 'secondary' ? 'bg-accent/10' : ''} ${activePaneId === 'main' ? 'opacity-75' : ''}`}
                onDragOver={(e) => {
                  // Accept drags from file tree or from main pane tabs
                  const hasFileData = e.dataTransfer.types.includes('application/json')
                  if (hasFileData || (draggedTab && draggedTab.paneId !== 'secondary')) {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDropTargetPane('secondary')
                  }
                }}
                onDragLeave={(e) => {
                  // Only clear if leaving the pane entirely (to child)
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDropTargetPane(null)
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  setDropTargetPane(null)
                  // Check for file tree drag first
                  const fileTreeData = e.dataTransfer.getData('application/json')
                  if (fileTreeData) {
                    try {
                      const data = JSON.parse(fileTreeData)
                      if (data.type === 'file' && data.path) {
                        // Open file from tree in this pane
                        setPaneFile('secondary', data.path)
                        setActivePane('secondary')
                        setDraggedTab(null)
                        return
                      }
                    } catch { /* ignore parse errors */ }
                  }
                  // Otherwise handle tab drag
                  if (draggedTab && draggedTab.paneId === 'main') {
                    // Move tab from main pane to secondary pane
                    setPaneFile('secondary', draggedTab.path)
                    setActivePane('secondary')
                  }
                  setDraggedTab(null)
                }}
              >
                <div className={`flex items-center justify-between px-2 py-0.5 border-b border-glass-border text-xs transition-colors ${dropTargetPane === 'secondary' ? 'bg-accent/20 border-accent' : 'bg-panel-bg/30'}`}>
                  <span className={`truncate ${dropTargetPane === 'secondary' ? 'text-accent font-medium' : 'text-text-secondary'}`}>
                    {dropTargetPane === 'secondary' ? 'Drop to open in this pane' : secondaryFile ? secondaryFile.split('/').pop() : 'No file open'}
                  </span>
                  <button
                    onClick={handleCloseSplit}
                    className="p-0.5 hover:bg-card-hover rounded transition-colors"
                    title="Close split"
                  >
                    <XCircle size={12} className="text-text-tertiary" />
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <Editor
                    height="100%"
                    language={secondaryLang}
                    value={secondaryCode}
                    onChange={handleSecondaryEditorChange}
                    onMount={handleSecondaryEditorMount}
                    options={buildEditorOptions({
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
                      // R5121: VS Code parity settings
                      smoothScrolling: settings.smoothScrolling,
                      cursorSmoothCaretAnimation: settings.cursorSmoothCaretAnimation ? 'on' : 'off',
                      linkedEditing: settings.linkedEditing,
                      scrollBeyondLastLine: settings.scrollBeyondLastLine,
                      formatOnPaste: settings.formatOnPaste,
                      mouseWheelZoom: settings.mouseWheelZoom,
                      semanticHighlighting: settings.semanticHighlighting,
                      // R5122: Autocomplete settings
                      quickSuggestions: settings.quickSuggestions,
                      acceptSuggestionOnEnter: settings.acceptSuggestionOnEnter,
                      tabCompletion: settings.tabCompletion,
                      wordBasedSuggestions: settings.wordBasedSuggestions,
                      suggestOnTriggerCharacters: settings.suggestOnTriggerCharacters,
                    })}
                  />
                </div>
              </div>
            )}
          </div>
          )}
            </>
          )}

          {/* Bottom Panel resize handle (VS Code pattern — drag to resize, double-click to maximize/restore) */}
          {showBottomPanel && (
            <div
              className={`h-1 cursor-row-resize transition-colors flex-shrink-0 ${isResizingBottom ? 'bg-accent/50' : 'hover:bg-accent/30'}`}
              onMouseDown={(e) => { e.preventDefault(); setIsResizingBottom(true) }}
              onDoubleClick={() => {
                const container = document.querySelector('[data-editor-container]')
                if (!container) return
                const rect = container.getBoundingClientRect()
                if (bottomPanelHeight >= rect.height - 100) {
                  // Currently maximized — restore to pre-max height
                  setBottomPanelHeight(bottomPanelPreMaxHeight)
                } else {
                  // Maximize — save current height and fill container
                  setBottomPanelPreMaxHeight(bottomPanelHeight)
                  setBottomPanelHeight(rect.height - 100)
                }
              }}
              title="Drag to resize, double-click to maximize/restore"
            />
          )}

          {/* Bottom Panel - Problems + Terminal tabs */}
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
              <span className="ml-auto text-[10px] text-text-tertiary select-none" title="Ctrl+J or Shift+Escape to toggle">Ctrl+J</span>
            </div>
            {/* Tab content */}
            {bottomTab === 'problems' ? (
              <ProblemsPanel problems={workspaceProblems} />
            ) : (
              <TerminalPanel />
            )}
          </div>
          )}
        </div>
      </div>

      {/* R5128: Alt+F1 Accessibility Help Dialog (VS Code P1 pattern) */}
      {showAccessibilityHelp && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={() => setShowAccessibilityHelp(false)} onKeyDown={(e) => { if (e.key === 'Escape') setShowAccessibilityHelp(false) }}>
          <div className="bg-panel-bg border border-glass-border rounded-mac-xl p-5 w-[480px] max-w-lg shadow-mac max-h-[80vh] overflow-y-auto" role="dialog" aria-modal="true" aria-label="Accessibility Help" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-text-primary">Accessibility Help</h3>
              <button onClick={() => setShowAccessibilityHelp(false)} className="p-1 hover:bg-card-hover rounded-mac transition-colors" aria-label="Close">
                <X size={16} className="text-text-tertiary" />
              </button>
            </div>
            <div className="space-y-4 text-sm">
              <div>
                <h4 className="text-xs font-semibold text-text-tertiary uppercase mb-2">Navigation</h4>
                <div className="space-y-1">
                  <div className="flex justify-between"><span className="text-text-secondary">Go to File</span><kbd className="text-text-tertiary">Ctrl+P</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Go to Symbol</span><kbd className="text-text-tertiary">@ in Quick Open</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Workspace Symbol</span><kbd className="text-text-tertiary">@ in Quick Open</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Go to Line</span><kbd className="text-text-tertiary">: in Quick Open</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Quick Fix</span><kbd className="text-text-tertiary">Ctrl+.</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Rename Symbol</span><kbd className="text-text-tertiary">F2</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Go to Definition</span><kbd className="text-text-tertiary">F12</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Peek Definition</span><kbd className="text-text-tertiary">Alt+F12</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Go to References</span><kbd className="text-text-tertiary">Shift+F12</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Find</span><kbd className="text-text-tertiary">Ctrl+F</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Find Next/Prev</span><kbd className="text-text-tertiary">F3 / Shift+F3</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Replace</span><kbd className="text-text-tertiary">Ctrl+H</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Search in Files</span><kbd className="text-text-tertiary">Ctrl+Shift+F</kbd></div>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-text-tertiary uppercase mb-2">Editor</h4>
                <div className="space-y-1">
                  <div className="flex justify-between"><span className="text-text-secondary">Command Palette</span><kbd className="text-text-tertiary">Ctrl+Shift+P</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Toggle Sidebar</span><kbd className="text-text-tertiary">Ctrl+B</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Toggle Bottom Panel</span><kbd className="text-text-tertiary">Ctrl+J</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Toggle Terminal</span><kbd className="text-text-tertiary">Ctrl+`</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Split Editor</span><kbd className="text-text-tertiary">Ctrl+\\</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Close Tab</span><kbd className="text-text-tertiary">Ctrl+W</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Reopen Closed Tab</span><kbd className="text-text-tertiary">Ctrl+Shift+T</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Toggle Word Wrap</span><kbd className="text-text-tertiary">Alt+Z</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Select to Bracket</span><kbd className="text-text-tertiary">Ctrl+Shift+Alt+\\</kbd></div>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-text-tertiary uppercase mb-2">Multi-Cursor</h4>
                <div className="space-y-1">
                  <div className="flex justify-between"><span className="text-text-secondary">Add Cursor Above/Below</span><kbd className="text-text-tertiary">Ctrl+Alt+Up/Down</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Add Next Occurrence</span><kbd className="text-text-tertiary">Ctrl+D</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Select All Occurrences</span><kbd className="text-text-tertiary">Ctrl+Shift+L</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Undo Last Cursor</span><kbd className="text-text-tertiary">Ctrl+U</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Add Cursors to Line Ends</span><kbd className="text-text-tertiary">Shift+Alt+I</kbd></div>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-text-tertiary uppercase mb-2">Accessibility</h4>
                <div className="space-y-1">
                  <div className="flex justify-between"><span className="text-text-secondary">Show Accessibility Help</span><kbd className="text-text-tertiary">Alt+F1</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Toggle Tab Focus Mode</span><kbd className="text-text-tertiary">Ctrl+M</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Open Context Menu</span><kbd className="text-text-tertiary">Shift+F10</kbd></div>
                  <div className="flex justify-between"><span className="text-text-secondary">Navigate Problems</span><kbd className="text-text-tertiary">F8 / Shift+F8</kbd></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Agent Selector Modal */}
      {showAgentSelector && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-panel-bg border border-glass-border rounded-mac-xl p-4 w-96 max-w-md shadow-mac" role="dialog" aria-modal="true" aria-label="Select Execution Mode">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Zap size={18} className="text-accent" />
                Select Execution Mode
              </h3>
              <button
                onClick={() => setShowAgentSelector(false)}
                className="p-1 hover:bg-card-hover rounded-mac transition-colors"
                aria-label="Close modal"
              >
                <X size={18} className="text-text-secondary" />
              </button>
            </div>

            <div className="space-y-2 mb-4">
              {swarms.length > 0 ? (
                swarms.map((swarm) => (
                  <button
                    key={swarm.id}
                    onClick={() => executeWithAgent(swarm.id)}
                    className="w-full text-left px-4 py-3 rounded-mac hover:bg-card-hover transition-colors group"
                  >
                    <div className="font-medium text-text-primary">{swarm.name}</div>
                    <div className="text-xs text-text-secondary mt-0.5">
                      {swarm.agents.length} agents • {swarm.topology}
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-sm text-text-tertiary py-2">
                  No swarms available. Create one in the Swarm panel.
                </div>
              )}
            </div>

            <div className="border-t border-glass-border pt-3">
              <button
                onClick={() => executeWithAgent(undefined)}
                className="w-full text-left px-4 py-3 rounded-mac hover:bg-card-hover transition-colors"
              >
                <div className="font-medium text-text-primary">Execute Directly</div>
                <div className="text-xs text-text-secondary mt-0.5">
                  Run without agent coordination
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Context Menu (VS Code/Cursor pattern) */}
      {tabContextMenu.visible && tabContextMenu.path && (() => {
        const ctxIdx = openFiles.indexOf(tabContextMenu.path)
        const hasLeft = ctxIdx > 0
        const hasRight = ctxIdx >= 0 && ctxIdx < openFiles.length - 1
        const hasOthers = openFiles.length > 1
        const hasSaved = openFiles.some(f => !dirtyFiles.has(f) && f !== tabContextMenu.path)
        return (
        <div
          ref={tabContextMenuRef}
          role="menu"
          aria-label="Tab context menu"
          className="fixed z-[200] bg-mac-panel/95 border border-glass-border rounded-mac-lg shadow-mac py-1 min-w-48 backdrop-blur-xl"
          style={{ left: tabContextMenu.x, top: tabContextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={tabMenuKeyDown}
        >
          <button
            onClick={() => { if (tabContextMenu.path) { handleTabClose(tabContextMenu.path); closeTabContextMenu() } }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
            role="menuitem"
          >
            Close
          </button>
          {hasOthers && (
          <button
            onClick={() => {
              if (!tabContextMenu.path) return
              closeOthers(tabContextMenu.path)
              closeTabContextMenu()
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
            role="menuitem"
          >
            Close Others
          </button>
          )}
          {hasLeft && (
          <button
            onClick={() => {
              if (!tabContextMenu.path) return
              closeToLeft(tabContextMenu.path)
              closeTabContextMenu()
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
            role="menuitem"
          >
            Close to Left
          </button>
          )}
          {hasRight && (
          <button
            onClick={() => {
              if (!tabContextMenu.path) return
              closeToRight(tabContextMenu.path)
              closeTabContextMenu()
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
            role="menuitem"
          >
            Close to Right
          </button>
          )}
          {hasSaved && (
          <button
            onClick={() => {
              const count = openFiles.filter(f => !dirtyFiles.has(f) && !pinnedFiles.has(f)).length
              closeSaved()
              if (count > 0) {
                addToast('info', 'Saved tabs closed', `${count} tab${count > 1 ? 's' : ''} closed`, {
                  actions: [{ label: 'Undo', onClick: () => { useWorkspaceStore.getState().undoCloseFiles() } }],
                })
              }
              closeTabContextMenu()
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
            role="menuitem"
          >
            Close Saved
          </button>
          )}
          <button
            onClick={() => {
              if (openFiles.some(f => dirtyFiles.has(f))) {
                setDirtyClosePath('__close_all__')
              } else {
                const count = openFiles.filter(f => !pinnedFiles.has(f)).length
                closeAllFiles()
                if (count > 0) {
                  addToast('info', 'All tabs closed', `${count} tab${count > 1 ? 's' : ''} closed`, {
                    actions: [{ label: 'Undo', onClick: () => { useWorkspaceStore.getState().undoCloseFiles() } }],
                  })
                }
              }
              closeTabContextMenu()
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
            role="menuitem"
          >
            Close All
          </button>
          <div className="my-1 border-t border-glass-border" />
          <button
            onClick={() => {
              if (tabContextMenu.path) {
                togglePin(tabContextMenu.path)
              }
              closeTabContextMenu()
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
            role="menuitem"
          >
            {tabContextMenu.path && pinnedFiles.has(tabContextMenu.path) ? 'Unpin Tab' : 'Pin Tab'}
          </button>
          <button
            onClick={() => {
              if (tabContextMenu.path) {
                // Open file in split editor (VS Code pattern)
                if (splitDirection === 'none') {
                  toggleSplit()
                }
                setPaneFile('secondary', tabContextMenu.path)
                setActivePane('secondary')
              }
              closeTabContextMenu()
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
            role="menuitem"
          >
            Split Right
          </button>
          <button
            onClick={() => {
              undoCloseFile()
              closeTabContextMenu()
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
            role="menuitem"
          >
            Reopen Closed Editor
          </button>
          <div className="my-1 border-t border-glass-border" />
          <button
            onClick={() => {
              if (tabContextMenu.path) {
                navigator.clipboard.writeText(tabContextMenu.path)
                addToast('success', 'Copied', 'Path copied to clipboard')
              }
              closeTabContextMenu()
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
            role="menuitem"
          >
            Copy Path
          </button>
          <button
            onClick={() => {
              if (workspace && tabContextMenu.path) {
                const rel = tabContextMenu.path.replace(workspace, '').replace(/^\//, '')
                navigator.clipboard.writeText(rel)
                addToast('success', 'Copied', 'Relative path copied')
              }
              closeTabContextMenu()
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
            role="menuitem"
          >
            Copy Relative Path
          </button>
        </div>
        )
      })()}

      {/* File Tree Context Menu (P1 feature - Cursor/VS Code pattern) */}
      {contextMenu.visible && contextMenu.entry && (
        <div
          ref={contextMenuRef}
          role="menu"
          aria-label="File context menu"
          className="fixed z-[200] bg-mac-panel/95 border border-glass-border rounded-mac-lg shadow-mac py-1 min-w-48 backdrop-blur-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={fileMenuKeyDown}
        >
          {!contextMenu.entry.isDirectory && (
            <>
              <button
                onClick={() => {
                  loadFile(contextMenu.entry!)
                  closeContextMenu()
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
                role="menuitem"
              >
                <FileText size={14} />
                <span>Open</span>
              </button>
              <button
                onClick={() => {
                  if (splitDirection === 'none') {
                    useSplitPaneStore.getState().setSplitDirection('horizontal')
                  }
                  setPaneFile('secondary', contextMenu.entry!.path)
                  setActivePane('secondary')
                  closeContextMenu()
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
                role="menuitem"
              >
                <Columns2 size={14} />
                <span>Open to the Side</span>
              </button>
              <div className="my-1 border-t border-glass-border" />
            </>
          )}
          {/* New File / New Folder — VS Code shows these for both files and directories */}
          <button
            onClick={() => handleNewFile(false)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
            role="menuitem"
          >
            <FilePlus size={14} />
            <span>New File</span>
          </button>
          <button
            onClick={() => handleNewFile(true)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
            role="menuitem"
          >
            <FolderPlus size={14} />
            <span>New Folder</span>
          </button>
          <div className="my-1 border-t border-glass-border" />
          <button
            onClick={handleRename}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
            role="menuitem"
          >
            <Pencil size={14} />
            <span>Rename</span>
          </button>
          <button
            onClick={handleDelete}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-error hover:bg-error/10 transition-colors"
            role="menuitem"
          >
            <Trash2 size={14} />
            <span>Delete</span>
          </button>
          <div className="my-1 border-t border-glass-border" />
          {/* Cut/Copy/Paste — VS Code standard file operations */}
          <button
            onClick={handleCutFile}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
            role="menuitem"
          >
            <Scissors size={14} />
            <span>Cut</span>
            <span className="ml-auto text-[10px] text-text-tertiary">Ctrl+X</span>
          </button>
          <button
            onClick={handleCopyFile}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
            role="menuitem"
          >
            <Copy size={14} />
            <span>Copy</span>
            <span className="ml-auto text-[10px] text-text-tertiary">Ctrl+C</span>
          </button>
          {fileClipboard && (
            <button
              onClick={handlePasteFile}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
              role="menuitem"
            >
              <ClipboardPaste size={14} />
              <span>Paste</span>
              <span className="ml-auto text-[10px] text-text-tertiary">Ctrl+V</span>
            </button>
          )}
          <div className="my-1 border-t border-glass-border" />
          <button
            onClick={handleCopyPath}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
            role="menuitem"
          >
            <Clipboard size={14} />
            <span>Copy Path</span>
          </button>
          <button
            onClick={handleCopyRelativePath}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
            role="menuitem"
          >
            <Copy size={14} />
            <span>Copy Relative Path</span>
          </button>
          <button
            onClick={() => {
              if (contextMenu.entry?.path) {
                api.fs.revealFile(contextMenu.entry.path).catch((err) => {
                  addToast('error', 'Reveal Failed', err instanceof Error ? err.message : 'Could not reveal file')
                })
              }
              closeContextMenu()
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
            role="menuitem"
          >
            <FolderOpen size={14} />
            <span>Reveal in File Explorer</span>
          </button>
          <button
            onClick={() => {
              const entryPath = contextMenu.entry?.path
              if (!entryPath) return
              // For files, search in parent directory; for directories, search in the directory itself
              const targetPath = contextMenu.entry?.isDirectory ? entryPath : entryPath.split('/').slice(0, -1).join('/')
              if (!targetPath) return
              const relPath = targetPath.startsWith(workspace + '/')
                ? targetPath.slice(workspace.length + 1)
                : targetPath
              window.dispatchEvent(new CustomEvent('search-in-folder', { detail: { folder: relPath } }))
              closeContextMenu()
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
            role="menuitem"
          >
            <Search size={14} />
            <span>Find in Folder</span>
          </button>
          {/* Open Diff — VS Code: show for modified/tracked files in context menu */}
          {!contextMenu.entry.isDirectory && gitStatusMap[contextMenu.entry.path] && (
            <button
              onClick={() => {
                const entryPath = contextMenu.entry?.path
                if (entryPath) {
                  window.dispatchEvent(new CustomEvent('open-diff', { detail: { path: entryPath } }))
                  closeContextMenu()
                }
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
              role="menuitem"
            >
              <GitCompare size={14} />
              <span>Open Diff</span>
            </button>
          )}
        </div>
      )}

      {/* New File/Folder Dialog */}
      {newFileDialog && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200]"
          onClick={() => setNewFileDialog(null)}
        >
          <div
            className="bg-mac-panel/95 border border-glass-border rounded-mac-xl p-4 w-80 shadow-mac backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-medium text-text-primary mb-3">
              {newFileDialog.isFolder ? 'New Folder' : 'New File'}
            </h3>
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitNewFile()
                if (e.key === 'Escape') setNewFileDialog(null)
              }}
              placeholder={newFileDialog.isFolder ? 'folder-name' : 'file-name.ts'}
              autoFocus
              className="w-full bg-surface border border-glass-border rounded-mac px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setNewFileDialog(null)}
                className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitNewFile}
                className="px-3 py-1.5 text-sm bg-accent text-white rounded-mac hover:bg-accent/90 transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dirty file close confirmation (VS Code/Cursor pattern — Save / Don't Save / Cancel) */}
      {dirtyClosePath && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200]"
          onClick={() => { setDirtyClosePath(null) }}
        >
          <div
            className="bg-mac-panel/95 border border-glass-border rounded-mac-xl p-5 w-[400px] shadow-mac backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-mac shrink-0 bg-warning/20">
                <AlertTriangle size={24} className="text-warning" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-text-primary mb-1">Save changes?</h3>
                <p className="text-sm text-text-secondary">
                  {dirtyClosePath === '__close_all__'
                    ? `You have unsaved changes in ${openFiles.filter(f => dirtyFiles.has(f)).length} file(s). Save all before closing?`
                    : <>Do you want to save changes to <span className="text-text-primary font-medium">{dirtyClosePath.split('/').pop()}</span>?</>
                  }
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setDirtyClosePath(null) }}
                className="px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary bg-slate-800 hover:bg-slate-700 rounded-mac transition-colors"
              >
                Cancel
              </button>
              {dirtyClosePath === '__close_all__' ? (
                <button
                  onClick={() => {
                    setDirtyClosePath(null)
                    closeAllFiles()
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary bg-slate-800 hover:bg-slate-700 rounded-mac transition-colors"
                >
                  Don't Save
                </button>
              ) : (
                <button
                  onClick={() => {
                    const path = dirtyClosePath
                    setDirtyClosePath(null)
                    closeFile(path)
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary bg-slate-800 hover:bg-slate-700 rounded-mac transition-colors"
                >
                  Don't Save
                </button>
              )}
              {dirtyClosePath === '__close_all__' ? (
                <button
                  onClick={async () => {
                    // Save all dirty files, then close all
                    const dirtyPaths = openFiles.filter(f => dirtyFiles.has(f))
                    for (const path of dirtyPaths) {
                      const content = fileContents.get(path)
                      if (content !== undefined) {
                        await api.fs.writeFile(path, content)
                        clearDirty(path)
                      }
                    }
                    fetchGitStatusRef.current()
                    setDirtyClosePath(null)
                    closeAllFiles()
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent/90 rounded-mac transition-colors"
                >
                  Save All
                </button>
              ) : (
                <button
                  onClick={async () => {
                    const path = dirtyClosePath
                    setDirtyClosePath(null)
                    if (path === currentFile) {
                      await handleSave()
                    } else {
                      const content = fileContents.get(path)
                      if (content !== undefined) {
                        await api.fs.writeFile(path, content)
                        clearDirty(path)
                        fetchGitStatusRef.current()
                      }
                    }
                    closeFile(path)
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent/90 rounded-mac transition-colors"
                >
                Save
              </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete"
          message={`Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
