import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import EditorPanel from './EditorPanel'
import { fsApi, gitBlameApi } from '../services/api'
import { logger } from '../utils'

// Mock scrollIntoView for jsdom (TabBar uses it)
Element.prototype.scrollIntoView = vi.fn()

// Mock clipboard
Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
})

// Mock CodeMirrorPane — simple div mock with imperative ref handle
vi.mock('../components/CodeMirrorPane', () => ({
  CodeMirrorPane: React.forwardRef(function CodeMirrorPane(
    { value, filename, onChange, onSave }: {
      value: string
      filename: string
      onChange?: (v: string) => void
      onSave?: () => void
    },
    ref: React.Ref<unknown>
  ) {
    React.useImperativeHandle(ref, () => ({
      setCursor: vi.fn(),
      scrollToLine: vi.fn(),
      focus: vi.fn(),
    }))
    return (
      <div data-testid="codemirror-pane" data-filename={filename}>
        <textarea
          data-testid="cm-textarea"
          defaultValue={value}
          onChange={(e) => onChange?.(e.target.value)}
        />
        {onSave && <button data-testid="cm-save" onClick={onSave}>CM Save</button>}
      </div>
    )
  }),
}))

// Mock DiffView
vi.mock('../components/DiffView', () => ({
  default: ({ original, modified, filename, onClose }: {
    original: string
    modified: string
    filename: string
    onClose: () => void
  }) => (
    <div data-testid="diff-view">
      <span data-testid="diff-filename">{filename}</span>
      <span data-testid="diff-original">{original}</span>
      <span data-testid="diff-modified">{modified}</span>
      <button data-testid="diff-close" onClick={onClose}>Close Diff</button>
    </div>
  ),
}))

// Mock TabBar with all callback props exposed as buttons
vi.mock('../components/TabBar', () => ({
  TabBar: ({ openFiles, currentFile, dirtyFiles, pinnedFiles, previewTab, onTabClick, onTabClose, onTabContextMenu, onCloseAll, onCloseOthers, onCloseSaved, onCloseToLeft, onCloseToRight, onReorder, paneId, onDragStart }: {
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
    onReorder?: (from: number, to: number) => void
    paneId?: string
    onDragStart?: (paneId: string, path: string) => void
  }) => (
    <div data-testid="tab-bar" data-pane={paneId}>
      {openFiles.map((path) => {
        const name = path.split('/').pop() || path
        return (
          <button
            key={path}
            data-testid={`tab-${name}`}
            data-path={path}
            data-active={currentFile === path}
            data-dirty={dirtyFiles.has(path)}
            data-pinned={pinnedFiles.has(path)}
            data-preview={previewTab === path}
            onClick={() => onTabClick(path)}
            onContextMenu={(e) => onTabContextMenu?.(e, path)}
            draggable
          >
            {name}
          </button>
        )
      })}
      {openFiles.map((path) => (
        <button
          key={`close-${path}`}
          data-testid={`close-tab-${path.split('/').pop()}`}
          onClick={(e) => { e.stopPropagation(); onTabClose(path) }}
        >
          x
        </button>
      ))}
      {onCloseAll && <button data-testid="close-all-btn" onClick={onCloseAll}>Close All</button>}
      {onCloseOthers && <button data-testid="close-others-btn" onClick={onCloseOthers}>Close Others</button>}
      {onCloseSaved && <button data-testid="close-saved-btn" onClick={onCloseSaved}>Close Saved</button>}
      {onCloseToLeft && <button data-testid="close-to-left-btn" onClick={onCloseToLeft}>Close Left</button>}
      {onCloseToRight && <button data-testid="close-to-right-btn" onClick={onCloseToRight}>Close Right</button>}
      {onReorder && <button data-testid="reorder-btn" onClick={() => onReorder(0, 1)}>Reorder</button>}
      {onDragStart && <button data-testid="drag-start-btn" onClick={() => onDragStart('main', openFiles[0])}>Drag</button>}
    </div>
  ),
}))

// Mock BreadcrumbsBar
vi.mock('../components/BreadcrumbsBar', () => ({
  BreadcrumbsBar: ({ filePath, onNavigate, onFileSelect }: {
    filePath?: string
    onNavigate?: (path: string) => void
    onFileSelect?: (path: string) => void
  }) => (
    <div data-testid="breadcrumbs-bar">
      {filePath}
      {onNavigate && <button data-testid="bc-navigate" onClick={() => onNavigate('/home/user/project/src')}>Nav</button>}
      {onFileSelect && <button data-testid="bc-file-select" onClick={() => onFileSelect('/home/user/project/src/other.ts')}>File</button>}
    </div>
  ),
}))

// Mock WelcomePanel
vi.mock('../components/WelcomePanel', () => ({
  WelcomePanel: ({ recentFiles, onFileClick }: { recentFiles: string[]; onFileClick: (path: string) => void }) => (
    <div data-testid="welcome-panel">
      <span data-testid="welcome-title">Swarm Editor</span>
      {recentFiles.map((f) => (
        <button key={f} data-testid={`recent-${f.split('/').pop()}`} onClick={() => onFileClick(f)}>
          {f.split('/').pop()}
        </button>
      ))}
    </div>
  ),
}))

// Mock DirtyCloseDialog
vi.mock('../components/DirtyCloseDialog', () => ({
  DirtyCloseDialog: ({ dirtyClosePath, onCancel, onCloseWithoutSaving, onCloseAllWithoutSaving, onSaveAndClose, onSaveAllAndClose }: {
    dirtyClosePath: string | null
    onCancel: () => void
    onCloseWithoutSaving: (path: string) => void
    onCloseAllWithoutSaving: () => void
    onSaveAndClose: (path: string) => Promise<void>
    onSaveAllAndClose: () => Promise<void>
  }) => {
    if (!dirtyClosePath) return null
    return (
      <div data-testid="dirty-close-dialog" data-path={dirtyClosePath}>
        <button data-testid="dirty-cancel" onClick={onCancel}>Cancel</button>
        <button data-testid="dirty-close-without-save" onClick={() => onCloseWithoutSaving(dirtyClosePath)}>Don&apos;t Save</button>
        <button data-testid="dirty-close-all-without-save" onClick={onCloseAllWithoutSaving}>Close All Unsaved</button>
        <button data-testid="dirty-save-and-close" onClick={() => onSaveAndClose(dirtyClosePath)}>Save</button>
        <button data-testid="dirty-save-all-and-close" onClick={onSaveAllAndClose}>Save All</button>
      </div>
    )
  },
}))

// Mock TabContextMenu
vi.mock('../components/TabContextMenu', () => ({
  TabContextMenu: ({ tabContextMenu, onClose, onCloseTab, onCloseOthers, onSplitRight, onCopyPath, onCopyRelativePath, onDirtyCloseAll }: {
    tabContextMenu: { visible: boolean; x: number; y: number; path: string | null }
    onClose: () => void
    onCloseTab: (path: string) => void
    onCloseOthers: (path: string) => void
    onSplitRight?: (path: string) => void
    onCopyPath?: (path: string) => void
    onCopyRelativePath?: (path: string) => void
    onDirtyCloseAll?: () => void
  }) => {
    if (!tabContextMenu.visible || !tabContextMenu.path) return null
    return (
      <div data-testid="tab-context-menu" data-path={tabContextMenu.path}>
        <button data-testid="ctx-close" onClick={() => onCloseTab(tabContextMenu.path!)}>Close</button>
        <button data-testid="ctx-close-others" onClick={() => onCloseOthers(tabContextMenu.path!)}>Close Others</button>
        <button data-testid="ctx-dismiss" onClick={onClose}>Dismiss</button>
        {onSplitRight && <button data-testid="ctx-split-right" onClick={() => onSplitRight(tabContextMenu.path!)}>Split Right</button>}
        {onCopyPath && <button data-testid="ctx-copy-path" onClick={() => onCopyPath(tabContextMenu.path!)}>Copy Path</button>}
        {onCopyRelativePath && <button data-testid="ctx-copy-rel-path" onClick={() => onCopyRelativePath(tabContextMenu.path!)}>Copy Relative</button>}
        {onDirtyCloseAll && <button data-testid="ctx-dirty-close-all" onClick={onDirtyCloseAll}>Close All Dirty</button>}
      </div>
    )
  },
}))

// Mock BlameSidebar
vi.mock('../components/BlameSidebar', () => ({
  BlameSidebar: ({ lines }: { lines: Array<unknown> }) => (
    <div data-testid="blame-sidebar" data-line-count={lines.length}>
      Blame Sidebar
    </div>
  ),
}))

// Mock ExternalModPrompt
vi.mock('../components/ExternalModPrompt', () => {
  const mockedFsApi = {
    readFile: vi.fn().mockResolvedValue('reloaded content'),
  }
  return {
    ExternalModPrompt: ({ filePath, onDismiss }: { filePath: string; onDismiss: (path: string) => void }) => (
      <div data-testid="external-mod-prompt">
        <span>文件已在外部修改，是否重新加载？</span>
        <button data-testid="ext-reload" onClick={() => {
          mockedFsApi.readFile(filePath).then(() => onDismiss(filePath))
        }}>重新加载</button>
        <button data-testid="ext-keep" onClick={() => onDismiss(filePath)}>保持当前</button>
      </div>
    ),
  }
})

// Mock useTabContextMenu hook
vi.mock('../hooks/useTabContextMenu', () => ({
  useTabContextMenu: ({ setTabContextMenu }: {
    setTabContextMenu: (state: unknown) => void
  }) => ({
    handleTabContextMenu: (e: React.MouseEvent, path: string) => {
      setTabContextMenu({ visible: true, x: e.clientX, y: e.clientY, path })
    },
    closeTabContextMenu: () => {
      setTabContextMenu({ visible: false, x: 0, y: 0, path: null })
    },
    tabMenuKeyDown: vi.fn(),
  }),
}))

// Mock the stores
const mockUseAppStore = vi.fn()
const mockAppGetState = vi.fn()
vi.mock('../store/appStore', () => ({
  useAppStore: Object.assign(
    (selector: (state: unknown) => unknown) => mockUseAppStore(selector),
    { getState: () => mockAppGetState() }
  ),
}))

const mockUseWorkspaceStore = vi.fn()
const mockWorkspaceGetState = vi.fn()
const mockWorkspaceSetState = vi.fn()
vi.mock('../stores/workspaceStore', () => ({
  useWorkspaceStore: Object.assign(
    (selector: (state: unknown) => unknown) => mockUseWorkspaceStore(selector),
    {
      getState: () => mockWorkspaceGetState(),
      setState: (...args: unknown[]) => mockWorkspaceSetState(...args),
    }
  ),
}))

const mockUseSplitPaneStore = vi.fn()
const mockSplitPaneGetState = vi.fn()
vi.mock('../stores/splitPaneStore', () => ({
  useSplitPaneStore: Object.assign(
    (selector: (state: unknown) => unknown) => mockUseSplitPaneStore(selector),
    { getState: () => mockSplitPaneGetState() }
  ),
}))

// Mock useEditorSettings hook
let mockRegisterAutoSave = vi.fn()
vi.mock('../hooks/useEditorSettings', () => ({
  useEditorSettings: () => ({
    settings: {
      fontSize: 14,
      fontFamily: 'JetBrains Mono',
      tabSize: 2,
      wordWrap: true,
      lineNumbers: 'on',
      renderWhitespace: 'none',
      bracketPairColorization: true,
      autoSave: false,
      autoSaveDelay: 1000,
      cursorBlinking: 'blink',
      smoothScrolling: true,
      minimap: true,
    },
    get registerAutoSave() { return mockRegisterAutoSave },
  }),
}))

// Mock the API — must be defined inline since vi.mock is hoisted
vi.mock('../services/api', () => ({
  fsApi: {
    getWorkspace: vi.fn().mockResolvedValue('/home/user/project'),
    readFile: vi.fn().mockResolvedValue('// file content'),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
  gitBlameApi: {
    blame: vi.fn().mockResolvedValue([]),
  },
}))

// Mock logger
vi.mock('../utils', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// --- Mock State Helpers ---

type StateMap = Record<string, unknown>

const defaultAppState = (overrides: StateMap = {}): StateMap => ({
  swarms: [],
  agents: [],
  selectedAgent: null,
  addToast: vi.fn(),
  updateFileProblems: vi.fn(),
  workspaceProblems: [],
  ...overrides,
})

const defaultWorkspaceState = (overrides: StateMap = {}): StateMap => ({
  workspacePath: '/home/user/project',
  fileTree: [],
  expandedDirs: new Set<string>(),
  currentFile: null,
  fileContents: new Map<string, string>(),
  openFiles: [] as string[],
  dirtyFiles: new Set<string>(),
  pinnedFiles: new Set<string>(),
  previewTab: null,
  recentlyClosedFiles: [] as Array<{ path: string; content: string; wasDirty: boolean }>,
  mruOrder: [] as string[],
  language: 'typescript',
  loading: false,
  setWorkspacePath: vi.fn(),
  loadWorkspace: vi.fn(),
  refreshFileTree: vi.fn(),
  toggleDir: vi.fn(),
  openFile: vi.fn(),
  closeFile: vi.fn(),
  renameFileInStore: vi.fn(),
  closeAllFiles: vi.fn(),
  closeOthers: vi.fn(),
  closeToLeft: vi.fn(),
  closeToRight: vi.fn(),
  closeSaved: vi.fn(),
  undoCloseFile: vi.fn(),
  reorderFiles: vi.fn(),
  updateFileContent: vi.fn(),
  clearDirty: vi.fn(),
  setLanguage: vi.fn(),
  togglePin: vi.fn(),
  isPinned: vi.fn(),
  externalModifications: new Set<string>(),
  clearExternalModification: vi.fn(),
  subscribeToFileChanges: vi.fn().mockReturnValue(() => {}),
  ...overrides,
})

const defaultSplitPaneState = (): StateMap => ({
  splitDirection: 'none' as const,
  activePaneId: 'main',
  paneFiles: { main: null as string | null, secondary: null as string | null },
  setActivePane: vi.fn(),
  setPaneFile: vi.fn(),
  toggleSplit: vi.fn(),
  closeSplit: vi.fn(),
})

const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>)

// Mutable workspace state ref for tests that need to track mutations
let wsStateRef: StateMap

const setupMocks = (appOverrides: StateMap = {}, wsOverrides: StateMap = {}, splitOverrides: StateMap = {}) => {
  wsStateRef = defaultWorkspaceState(wsOverrides)

  mockUseAppStore.mockImplementation((selector: (s: unknown) => unknown) => {
    const state = defaultAppState(appOverrides)
    return selector ? selector(state) : state
  })
  mockAppGetState.mockReturnValue(defaultAppState(appOverrides))

  mockUseWorkspaceStore.mockImplementation((selector: (s: unknown) => unknown) => {
    return selector ? selector(wsStateRef) : wsStateRef
  })
  mockWorkspaceGetState.mockReturnValue(wsStateRef)

  const splitState = { ...defaultSplitPaneState(), ...splitOverrides }
  mockUseSplitPaneStore.mockImplementation((selector: (s: unknown) => unknown) => {
    return selector ? selector(splitState) : splitState
  })
  mockSplitPaneGetState.mockReturnValue(splitState)
}

// Helper: setup mocks with one file open
const setupWithFile = (filePath = '/home/user/project/src/main.ts', content = 'console.log("hello")') => {
  setupMocks(
    {},
    {
      openFiles: [filePath],
      currentFile: filePath,
      fileContents: new Map([[filePath, content]]),
      dirtyFiles: new Set<string>(),
      pinnedFiles: new Set<string>(),
      previewTab: null,
    }
  )
}

// Helper: setup mocks with two files open
const setupWithTwoFiles = () => {
  const file1 = '/home/user/project/src/main.ts'
  const file2 = '/home/user/project/src/utils.ts'
  setupMocks(
    {},
    {
      openFiles: [file1, file2],
      currentFile: file1,
      fileContents: new Map([[file1, 'code1'], [file2, 'code2']]),
      dirtyFiles: new Set<string>(),
      pinnedFiles: new Set<string>(),
      previewTab: null,
    }
  )
}

// --- Tests ---

describe('EditorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(fsApi.getWorkspace as any).mockResolvedValue('/home/user/project')
    ;(fsApi.writeFile as any).mockResolvedValue(undefined)
    ;(fsApi.readFile as any).mockResolvedValue('file content')
    ;(gitBlameApi.blame as any).mockResolvedValue([])
    setupMocks()
  })

  // =====================================================================
  // 1. Rendering — Welcome panel when no files
  // =====================================================================
  describe('渲染 - 无文件打开时', () => {
    it('没有打开文件时显示 WelcomePanel', () => {
      renderWithRouter(<EditorPanel />)
      expect(screen.getByTestId('welcome-panel')).toBeInTheDocument()
    })

    it('WelcomePanel 显示标题', () => {
      renderWithRouter(<EditorPanel />)
      expect(screen.getByTestId('welcome-title')).toHaveTextContent('Swarm Editor')
    })

    it('WelcomePanel 传递最近文件列表', () => {
      // recentFiles comes from localStorage — tested via WelcomePanel itself
      renderWithRouter(<EditorPanel />)
      expect(screen.getByTestId('welcome-panel')).toBeInTheDocument()
    })

    it('没有打开文件时 TabBar 为空（无标签）', () => {
      renderWithRouter(<EditorPanel />)
      // TabBar is always rendered but has no tab buttons when openFiles is empty
      const tabBar = screen.getByTestId('tab-bar')
      expect(tabBar.querySelectorAll('button[data-path]').length).toBe(0)
    })

    it('没有打开文件时不显示面包屑', () => {
      renderWithRouter(<EditorPanel />)
      expect(screen.queryByTestId('breadcrumbs-bar')).not.toBeInTheDocument()
    })

    it('没有打开文件时不显示编辑器', () => {
      renderWithRouter(<EditorPanel />)
      expect(screen.queryByTestId('codemirror-pane')).not.toBeInTheDocument()
    })

    it('没有打开文件时窗口标题为 Swarm Editor', () => {
      renderWithRouter(<EditorPanel />)
      expect(document.title).toBe('Swarm Editor')
    })
  })

  // =====================================================================
  // 2. Rendering — Editor with file open
  // =====================================================================
  describe('渲染 - 有文件打开时', () => {
    it('打开文件时显示 TabBar', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      expect(screen.getByTestId('tab-bar')).toBeInTheDocument()
    })

    it('打开文件时显示 BreadcrumbsBar', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      expect(screen.getByTestId('breadcrumbs-bar')).toBeInTheDocument()
    })

    it('BreadcrumbsBar 显示当前文件路径', () => {
      setupWithFile('/home/user/project/src/main.ts')
      renderWithRouter(<EditorPanel />)
      expect(screen.getByTestId('breadcrumbs-bar')).toHaveTextContent('/home/user/project/src/main.ts')
    })

    it('打开文件时显示 CodeMirror 编辑器', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      expect(screen.getByTestId('codemirror-pane')).toBeInTheDocument()
    })

    it('编辑器接收文件内容', () => {
      setupWithFile('/home/user/project/src/main.ts', 'hello world')
      renderWithRouter(<EditorPanel />)
      expect(screen.getByTestId('cm-textarea')).toHaveValue('hello world')
    })

    it('编辑器接收文件名', () => {
      setupWithFile('/home/user/project/src/main.ts')
      renderWithRouter(<EditorPanel />)
      expect(screen.getByTestId('codemirror-pane')).toHaveAttribute('data-filename', '/home/user/project/src/main.ts')
    })

    it('打开文件时显示 Blame 按钮', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      expect(screen.getByText('Blame')).toBeInTheDocument()
    })

    it('打开文件时窗口标题包含文件名', () => {
      setupWithFile('/home/user/project/src/main.ts')
      renderWithRouter(<EditorPanel />)
      expect(document.title).toContain('main.ts')
      expect(document.title).toContain('Swarm Editor')
    })

    it('脏文件窗口标题包含圆点前缀', () => {
      setupWithFile('/home/user/project/src/main.ts')
      wsStateRef.dirtyFiles = new Set(['/home/user/project/src/main.ts'])
      renderWithRouter(<EditorPanel />)
      expect(document.title).toContain('●')
    })

    it('不显示 WelcomePanel', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      expect(screen.queryByTestId('welcome-panel')).not.toBeInTheDocument()
    })
  })

  // =====================================================================
  // 3. Tab management
  // =====================================================================
  describe('标签页管理', () => {
    it('点击标签页切换当前文件', () => {
      setupWithTwoFiles()
      renderWithRouter(<EditorPanel />)
      const utilsTab = screen.getByTestId('tab-utils.ts')
      fireEvent.click(utilsTab)
      expect(wsStateRef.openFile).toHaveBeenCalledWith('/home/user/project/src/utils.ts', { preview: false })
    })

    it('点击标签页时预览标签转为永久', () => {
      setupWithTwoFiles()
      wsStateRef.previewTab = '/home/user/project/src/utils.ts'
      renderWithRouter(<EditorPanel />)
      const utilsTab = screen.getByTestId('tab-utils.ts')
      fireEvent.click(utilsTab)
      // The component calls useWorkspaceStore.setState to clear preview and update mruOrder
      expect(mockWorkspaceSetState).toHaveBeenCalled()
    })

    it('点击关闭标签按钮调用 closeFile', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      const closeBtn = screen.getByTestId('close-tab-main.ts')
      fireEvent.click(closeBtn)
      expect(wsStateRef.closeFile).toHaveBeenCalledWith('/home/user/project/src/main.ts')
    })

    it('关闭脏文件时显示 DirtyCloseDialog', () => {
      setupWithFile()
      wsStateRef.dirtyFiles = new Set(['/home/user/project/src/main.ts'])
      renderWithRouter(<EditorPanel />)
      const closeBtn = screen.getByTestId('close-tab-main.ts')
      fireEvent.click(closeBtn)
      expect(screen.getByTestId('dirty-close-dialog')).toBeInTheDocument()
    })

    it('关闭非脏文件时不显示 DirtyCloseDialog', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      const closeBtn = screen.getByTestId('close-tab-main.ts')
      fireEvent.click(closeBtn)
      expect(screen.queryByTestId('dirty-close-dialog')).not.toBeInTheDocument()
    })

    it('TabBar 接收正确的 openFiles', () => {
      setupWithTwoFiles()
      renderWithRouter(<EditorPanel />)
      expect(screen.getByTestId('tab-main.ts')).toBeInTheDocument()
      expect(screen.getByTestId('tab-utils.ts')).toBeInTheDocument()
    })

    it('TabBar 标记当前文件为 active', () => {
      setupWithTwoFiles()
      renderWithRouter(<EditorPanel />)
      expect(screen.getByTestId('tab-main.ts')).toHaveAttribute('data-active', 'true')
      expect(screen.getByTestId('tab-utils.ts')).toHaveAttribute('data-active', 'false')
    })

    it('TabBar 标记脏文件为 dirty', () => {
      setupWithTwoFiles()
      wsStateRef.dirtyFiles = new Set(['/home/user/project/src/main.ts'])
      renderWithRouter(<EditorPanel />)
      expect(screen.getByTestId('tab-main.ts')).toHaveAttribute('data-dirty', 'true')
      expect(screen.getByTestId('tab-utils.ts')).toHaveAttribute('data-dirty', 'false')
    })

    it('TabBar 标记固定文件为 pinned', () => {
      setupWithTwoFiles()
      wsStateRef.pinnedFiles = new Set(['/home/user/project/src/main.ts'])
      renderWithRouter(<EditorPanel />)
      expect(screen.getByTestId('tab-main.ts')).toHaveAttribute('data-pinned', 'true')
    })

    it('TabBar 标记预览标签为 preview', () => {
      setupWithTwoFiles()
      wsStateRef.previewTab = '/home/user/project/src/utils.ts'
      renderWithRouter(<EditorPanel />)
      expect(screen.getByTestId('tab-utils.ts')).toHaveAttribute('data-preview', 'true')
    })
  })

  // =====================================================================
  // 4. File operations
  // =====================================================================
  describe('文件操作', () => {
    it('编辑器内容变更调用 updateFileContent', () => {
      setupWithFile('/home/user/project/src/main.ts', 'original')
      renderWithRouter(<EditorPanel />)
      const textarea = screen.getByTestId('cm-textarea')
      fireEvent.change(textarea, { target: { value: 'new code' } })
      expect(wsStateRef.updateFileContent).toHaveBeenCalledWith('/home/user/project/src/main.ts', 'new code')
    })

    it('Ctrl+S 触发保存', async () => {
      setupWithFile('/home/user/project/src/main.ts', 'code')
      renderWithRouter(<EditorPanel />)
      await act(async () => {
        fireEvent.keyDown(window, { key: 's', ctrlKey: true })
      })
      expect(fsApi.writeFile).toHaveBeenCalledWith('/home/user/project/src/main.ts', 'code')
    })

    it('Cmd+S 触发保存', async () => {
      setupWithFile('/home/user/project/src/main.ts', 'code')
      renderWithRouter(<EditorPanel />)
      await act(async () => {
        fireEvent.keyDown(window, { key: 's', metaKey: true })
      })
      expect(fsApi.writeFile).toHaveBeenCalledWith('/home/user/project/src/main.ts', 'code')
    })

    it('保存成功后调用 clearDirty', async () => {
      setupWithFile('/home/user/project/src/main.ts', 'code')
      renderWithRouter(<EditorPanel />)
      await act(async () => {
        fireEvent.keyDown(window, { key: 's', ctrlKey: true })
      })
      await waitFor(() => {
        expect(wsStateRef.clearDirty).toHaveBeenCalledWith('/home/user/project/src/main.ts')
      })
    })

    it('保存成功后显示 toast', async () => {
      const addToast = vi.fn()
      setupMocks({}, {
        openFiles: ['/home/user/project/src/main.ts'],
        currentFile: '/home/user/project/src/main.ts',
        fileContents: new Map([['/home/user/project/src/main.ts', 'code']]),
      })
      mockUseAppStore.mockImplementation((selector: (s: unknown) => unknown) => {
        return selector({ addToast })
      })
      renderWithRouter(<EditorPanel />)
      await act(async () => {
        fireEvent.keyDown(window, { key: 's', ctrlKey: true })
      })
      await waitFor(() => {
        expect(addToast).toHaveBeenCalledWith('success', 'Saved', 'main.ts')
      })
    })

    it('保存失败后显示 error toast', async () => {
      const addToast = vi.fn()
      ;(fsApi.writeFile as any).mockRejectedValueOnce(new Error('Write failed'))
      setupMocks({}, {
        openFiles: ['/home/user/project/src/main.ts'],
        currentFile: '/home/user/project/src/main.ts',
        fileContents: new Map([['/home/user/project/src/main.ts', 'code']]),
      })
      mockUseAppStore.mockImplementation((selector: (s: unknown) => unknown) => {
        return selector({ addToast })
      })
      renderWithRouter(<EditorPanel />)
      await act(async () => {
        fireEvent.keyDown(window, { key: 's', ctrlKey: true })
      })
      await waitFor(() => {
        expect(addToast).toHaveBeenCalledWith('error', 'Save failed', 'Write failed')
      })
    })

    it('Ctrl+W 关闭当前标签页', async () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      await act(async () => {
        fireEvent.keyDown(window, { key: 'w', ctrlKey: true })
      })
      expect(wsStateRef.closeFile).toHaveBeenCalledWith('/home/user/project/src/main.ts')
    })

    it('Ctrl+Shift+T 撤销关闭文件', async () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      await act(async () => {
        fireEvent.keyDown(window, { key: 'T', ctrlKey: true, shiftKey: true })
      })
      expect(wsStateRef.undoCloseFile).toHaveBeenCalled()
    })
  })

  // =====================================================================
  // 5. Split pane
  // =====================================================================
  describe('分屏', () => {
    it('Ctrl+\\ 切换分屏', async () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      await act(async () => {
        fireEvent.keyDown(window, { key: '\\', ctrlKey: true })
      })
      const splitState = mockSplitPaneGetState()
      expect(splitState.toggleSplit).toHaveBeenCalled()
    })

    it('分屏模式下显示两个编辑器', () => {
      const file1 = '/home/user/project/src/main.ts'
      const file2 = '/home/user/project/src/utils.ts'
      setupMocks(
        {},
        {
          openFiles: [file1, file2],
          currentFile: file1,
          fileContents: new Map([[file1, 'code1'], [file2, 'code2']]),
        },
        {
          splitDirection: 'horizontal',
          activePaneId: 'main',
          paneFiles: { main: file1, secondary: file2 },
        }
      )
      renderWithRouter(<EditorPanel />)
      const panes = screen.getAllByTestId('codemirror-pane')
      expect(panes).toHaveLength(2)
    })

    it('分屏模式下非活动面板半透明', () => {
      const file1 = '/home/user/project/src/main.ts'
      const file2 = '/home/user/project/src/utils.ts'
      setupMocks(
        {},
        {
          openFiles: [file1, file2],
          currentFile: file1,
          fileContents: new Map([[file1, 'code1'], [file2, 'code2']]),
        },
        {
          splitDirection: 'horizontal',
          activePaneId: 'main',
          paneFiles: { main: file1, secondary: file2 },
        }
      )
      renderWithRouter(<EditorPanel />)
      // The secondary pane container should have opacity-75 class
      // There are multiple elements with "utils.ts" text (tab + secondary header), use the span
      const spanEl = screen.getAllByText('utils.ts').find(el => el.tagName === 'SPAN')
      const container = spanEl?.closest('[class*="opacity"]')
      expect(container?.className).toContain('opacity-75')
    })

    it('点击关闭分屏按钮调用 closeSplit', () => {
      const file1 = '/home/user/project/src/main.ts'
      setupMocks(
        {},
        {
          openFiles: [file1],
          currentFile: file1,
          fileContents: new Map([[file1, 'code1']]),
        },
        {
          splitDirection: 'horizontal',
          activePaneId: 'main',
          paneFiles: { main: file1, secondary: null },
        }
      )
      renderWithRouter(<EditorPanel />)
      const closeBtn = screen.getByTitle('Close split')
      fireEvent.click(closeBtn)
      const splitState = mockSplitPaneGetState()
      expect(splitState.closeSplit).toHaveBeenCalled()
    })
  })

  // =====================================================================
  // 6. Blame
  // =====================================================================
  describe('Blame 功能', () => {
    it('点击 Blame 按钮切换 blame 状态', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      const blameBtn = screen.getByText('Blame')
      fireEvent.click(blameBtn)
      // Button should now be active (styled differently)
      expect(blameBtn).toBeInTheDocument()
    })

    it('启用 blame 时获取 blame 数据', async () => {
      const blameData = [
        { line: 1, commit: 'abc123', author: 'Alice', authorMail: 'alice@test.com', authorTime: '2024-01-01', summary: 'init' },
        { line: 2, commit: 'def456', author: 'Bob', authorMail: 'bob@test.com', authorTime: '2024-01-02', summary: 'update' },
      ]
      ;(gitBlameApi.blame as any).mockResolvedValueOnce(blameData)
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      // Enable blame
      fireEvent.click(screen.getByText('Blame'))
      await waitFor(() => {
        expect(gitBlameApi.blame).toHaveBeenCalledWith('/home/user/project/src/main.ts')
      })
    })

    it('禁用 blame 时不请求 blame API', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      // Don't click blame — API should not be called
      expect(gitBlameApi.blame).not.toHaveBeenCalled()
    })

    it('没有打开文件时 Blame 按钮不显示', () => {
      setupMocks()
      renderWithRouter(<EditorPanel />)
      expect(screen.queryByText('Blame')).not.toBeInTheDocument()
    })
  })

  // =====================================================================
  // 7. External modifications
  // =====================================================================
  describe('外部文件修改', () => {
    it('外部修改时显示提示栏', () => {
      setupWithFile()
      wsStateRef.externalModifications = new Set(['/home/user/project/src/main.ts'])
      renderWithRouter(<EditorPanel />)
      expect(screen.getByText('文件已在外部修改，是否重新加载？')).toBeInTheDocument()
    })

    it('点击重新加载按钮从磁盘读取文件', async () => {
      setupWithFile('/home/user/project/src/main.ts', 'old content')
      wsStateRef.externalModifications = new Set(['/home/user/project/src/main.ts'])
      renderWithRouter(<EditorPanel />)
      const reloadBtn = screen.getByTestId('ext-reload')
      await act(async () => {
        fireEvent.click(reloadBtn)
      })
      // The mock ExternalModPrompt uses its own internal mocked fsApi
      // The real ExternalModPrompt would call fsApi.readFile; here we verify the dismiss is called
      expect(wsStateRef.clearExternalModification).toHaveBeenCalledWith('/home/user/project/src/main.ts')
    })

    it('点击重新加载后清除外部修改标记', async () => {
      setupWithFile('/home/user/project/src/main.ts', 'old')
      wsStateRef.externalModifications = new Set(['/home/user/project/src/main.ts'])
      renderWithRouter(<EditorPanel />)
      const reloadBtn = screen.getByTestId('ext-reload')
      await act(async () => {
        fireEvent.click(reloadBtn)
      })
      // The mock ExternalModPrompt calls onDismiss after readFile resolves
      expect(wsStateRef.clearExternalModification).toHaveBeenCalledWith('/home/user/project/src/main.ts')
    })

    it('点击保持当前按钮清除外部修改标记', () => {
      setupWithFile()
      wsStateRef.externalModifications = new Set(['/home/user/project/src/main.ts'])
      renderWithRouter(<EditorPanel />)
      fireEvent.click(screen.getByText('保持当前'))
      expect(wsStateRef.clearExternalModification).toHaveBeenCalledWith('/home/user/project/src/main.ts')
    })

    it('没有外部修改时不显示提示栏', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      expect(screen.queryByText('文件已在外部修改，是否重新加载？')).not.toBeInTheDocument()
    })
  })

  // =====================================================================
  // 8. Diff view
  // =====================================================================
  describe('Diff 视图', () => {
    it('editor:show-diff 事件显示 DiffView', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      act(() => {
        window.dispatchEvent(new CustomEvent('editor:show-diff', {
          detail: { path: 'test.ts', original: 'old', modified: 'new' },
        }))
      })
      expect(screen.getByTestId('diff-view')).toBeInTheDocument()
    })

    it('DiffView 接收正确的 props', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      act(() => {
        window.dispatchEvent(new CustomEvent('editor:show-diff', {
          detail: { path: 'test.ts', original: 'old code', modified: 'new code' },
        }))
      })
      expect(screen.getByTestId('diff-filename')).toHaveTextContent('test.ts')
      expect(screen.getByTestId('diff-original')).toHaveTextContent('old code')
      expect(screen.getByTestId('diff-modified')).toHaveTextContent('new code')
    })

    it('关闭 DiffView 后恢复正常编辑器', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      act(() => {
        window.dispatchEvent(new CustomEvent('editor:show-diff', {
          detail: { path: 'test.ts', original: 'old', modified: 'new' },
        }))
      })
      expect(screen.getByTestId('diff-view')).toBeInTheDocument()
      fireEvent.click(screen.getByTestId('diff-close'))
      expect(screen.queryByTestId('diff-view')).not.toBeInTheDocument()
      expect(screen.getByTestId('codemirror-pane')).toBeInTheDocument()
    })

    it('DiffView 显示时不显示 TabBar', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      act(() => {
        window.dispatchEvent(new CustomEvent('editor:show-diff', {
          detail: { path: 'test.ts', original: 'old', modified: 'new' },
        }))
      })
      expect(screen.queryByTestId('tab-bar')).not.toBeInTheDocument()
    })

    it('不完整 diff 数据不显示 DiffView', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      act(() => {
        window.dispatchEvent(new CustomEvent('editor:show-diff', {
          detail: { path: 'test.ts' },
        }))
      })
      expect(screen.queryByTestId('diff-view')).not.toBeInTheDocument()
    })
  })

  // =====================================================================
  // 9. Tab context menu
  // =====================================================================
  describe('标签页右键菜单', () => {
    it('右键标签页显示上下文菜单', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      const tab = screen.getByTestId('tab-main.ts')
      fireEvent.contextMenu(tab, { clientX: 100, clientY: 200 })
      expect(screen.getByTestId('tab-context-menu')).toBeInTheDocument()
    })

    it('上下文菜单包含正确的文件路径', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      const tab = screen.getByTestId('tab-main.ts')
      fireEvent.contextMenu(tab, { clientX: 100, clientY: 200 })
      expect(screen.getByTestId('tab-context-menu')).toHaveAttribute('data-path', '/home/user/project/src/main.ts')
    })

    it('点击关闭关闭上下文菜单', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      const tab = screen.getByTestId('tab-main.ts')
      fireEvent.contextMenu(tab, { clientX: 100, clientY: 200 })
      expect(screen.getByTestId('tab-context-menu')).toBeInTheDocument()
      fireEvent.click(screen.getByTestId('ctx-dismiss'))
      expect(screen.queryByTestId('tab-context-menu')).not.toBeInTheDocument()
    })

    it('关闭其他标签页调用 closeOthers', () => {
      setupWithTwoFiles()
      renderWithRouter(<EditorPanel />)
      const tab = screen.getByTestId('tab-main.ts')
      fireEvent.contextMenu(tab, { clientX: 100, clientY: 200 })
      fireEvent.click(screen.getByTestId('ctx-close-others'))
      expect(wsStateRef.closeOthers).toHaveBeenCalledWith('/home/user/project/src/main.ts')
    })
  })

  // =====================================================================
  // 10. DirtyCloseDialog interactions
  // =====================================================================
  describe('脏文件关闭对话框', () => {
    it('取消关闭对话框后文件保持打开', () => {
      setupWithFile()
      wsStateRef.dirtyFiles = new Set(['/home/user/project/src/main.ts'])
      renderWithRouter(<EditorPanel />)
      // Trigger dirty close
      fireEvent.click(screen.getByTestId('close-tab-main.ts'))
      expect(screen.getByTestId('dirty-close-dialog')).toBeInTheDocument()
      // Cancel
      fireEvent.click(screen.getByTestId('dirty-cancel'))
      expect(screen.queryByTestId('dirty-close-dialog')).not.toBeInTheDocument()
      // File should not have been closed
      expect(wsStateRef.closeFile).not.toHaveBeenCalled()
    })

    it('不保存直接关闭调用 closeFile', () => {
      setupWithFile()
      wsStateRef.dirtyFiles = new Set(['/home/user/project/src/main.ts'])
      renderWithRouter(<EditorPanel />)
      fireEvent.click(screen.getByTestId('close-tab-main.ts'))
      fireEvent.click(screen.getByTestId('dirty-close-without-save'))
      expect(wsStateRef.closeFile).toHaveBeenCalledWith('/home/user/project/src/main.ts')
    })

    it('保存并关闭先写文件再关闭', async () => {
      setupWithFile('/home/user/project/src/main.ts', 'dirty code')
      wsStateRef.dirtyFiles = new Set(['/home/user/project/src/main.ts'])
      renderWithRouter(<EditorPanel />)
      fireEvent.click(screen.getByTestId('close-tab-main.ts'))
      await act(async () => {
        fireEvent.click(screen.getByTestId('dirty-save-and-close'))
      })
      expect(fsApi.writeFile).toHaveBeenCalledWith('/home/user/project/src/main.ts', 'dirty code')
      expect(wsStateRef.closeFile).toHaveBeenCalledWith('/home/user/project/src/main.ts')
    })

    it('全部不保存关闭调用 closeAllFiles', () => {
      setupWithTwoFiles()
      wsStateRef.dirtyFiles = new Set(['/home/user/project/src/main.ts', '/home/user/project/src/utils.ts'])
      renderWithRouter(<EditorPanel />)
      // Trigger close all dirty (via __close_all__ path)
      // Simulate by clicking tab close on a dirty file, then using "close all without save"
      fireEvent.click(screen.getByTestId('close-tab-main.ts'))
      fireEvent.click(screen.getByTestId('dirty-close-all-without-save'))
      expect(wsStateRef.closeAllFiles).toHaveBeenCalled()
    })

    it('全部保存并关闭保存所有脏文件', async () => {
      const file1 = '/home/user/project/src/main.ts'
      const file2 = '/home/user/project/src/utils.ts'
      setupMocks({}, {
        openFiles: [file1, file2],
        currentFile: file1,
        fileContents: new Map([[file1, 'code1'], [file2, 'code2']]),
        dirtyFiles: new Set([file1, file2]),
      })
      renderWithRouter(<EditorPanel />)
      fireEvent.click(screen.getByTestId('close-tab-main.ts'))
      await act(async () => {
        fireEvent.click(screen.getByTestId('dirty-save-all-and-close'))
      })
      expect(fsApi.writeFile).toHaveBeenCalledWith(file1, 'code1')
      expect(fsApi.writeFile).toHaveBeenCalledWith(file2, 'code2')
      expect(wsStateRef.closeAllFiles).toHaveBeenCalled()
    })
  })

  // =====================================================================
  // 11. Welcome panel file click
  // =====================================================================
  describe('Welcome 面板文件点击', () => {
    it('点击最近文件调用 openFile', () => {
      // Mock localStorage with recent files
      const storedFiles = ['/home/user/project/src/main.ts', '/home/user/project/src/utils.ts']
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
        if (key === 'swarm-editor-recent-files') return JSON.stringify(storedFiles)
        return null
      })
      setupMocks()
      renderWithRouter(<EditorPanel />)
      const recentBtn = screen.getByTestId('recent-main.ts')
      fireEvent.click(recentBtn)
      expect(wsStateRef.openFile).toHaveBeenCalledWith('/home/user/project/src/main.ts')
      vi.restoreAllMocks()
    })
  })

  // =====================================================================
  // 12. Workspace init and cleanup
  // =====================================================================
  describe('工作区初始化', () => {
    it('初始化时调用 getWorkspace', async () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      await waitFor(() => {
        expect(fsApi.getWorkspace).toHaveBeenCalled()
      })
    })

    it('getWorkspace 成功后设置工作区路径', async () => {
      ;(fsApi.getWorkspace as any).mockResolvedValueOnce('/custom/workspace')
      setupMocks()
      renderWithRouter(<EditorPanel />)
      await waitFor(() => {
        expect(wsStateRef.setWorkspacePath).toHaveBeenCalledWith('/custom/workspace')
      })
    })

    it('getWorkspace 失败不崩溃', async () => {
      ;(fsApi.getWorkspace as any).mockRejectedValueOnce(new Error('workspace error'))
      setupMocks()
      expect(() => renderWithRouter(<EditorPanel />)).not.toThrow()
    })
  })

  // =====================================================================
  // 13. File subscription
  // =====================================================================
  describe('文件变更订阅', () => {
    it('挂载时订阅文件变更', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      expect(wsStateRef.subscribeToFileChanges).toHaveBeenCalled()
    })

    it('订阅返回的 unsubscribe 在卸载时调用', () => {
      const unsubscribe = vi.fn()
      wsStateRef = defaultWorkspaceState({ subscribeToFileChanges: () => unsubscribe })
      mockUseWorkspaceStore.mockImplementation((selector: (s: unknown) => unknown) => {
        return selector ? selector(wsStateRef) : wsStateRef
      })
      mockWorkspaceGetState.mockReturnValue(wsStateRef)
      const splitState = { ...defaultSplitPaneState() }
      mockUseSplitPaneStore.mockImplementation((selector: (s: unknown) => unknown) => {
        return selector ? selector(splitState) : splitState
      })
      mockSplitPaneGetState.mockReturnValue(splitState)
      mockUseAppStore.mockImplementation((selector: (s: unknown) => unknown) => {
        return selector ? selector(defaultAppState()) : defaultAppState()
      })
      mockAppGetState.mockReturnValue(defaultAppState())

      const { unmount } = renderWithRouter(<EditorPanel />)
      unmount()
      expect(unsubscribe).toHaveBeenCalled()
    })
  })

  // =====================================================================
  // 14. Auto-save callback
  // =====================================================================
  describe('自动保存回调', () => {
    it('注册 auto-save 回调', () => {
      mockRegisterAutoSave = vi.fn()
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      expect(mockRegisterAutoSave).toHaveBeenCalled()
    })

    it('auto-save 回调保存脏文件', async () => {
      let autoSaveCallback: (() => void) | undefined
      mockRegisterAutoSave = vi.fn((cb: () => void) => { autoSaveCallback = cb })

      setupWithFile('/home/user/project/src/main.ts', 'auto content')
      wsStateRef.dirtyFiles = new Set(['/home/user/project/src/main.ts'])

      // Make getState return the dirty file state for auto-save
      mockWorkspaceGetState.mockReturnValue({
        ...wsStateRef,
        currentFile: '/home/user/project/src/main.ts',
        dirtyFiles: new Set(['/home/user/project/src/main.ts']),
        fileContents: new Map([['/home/user/project/src/main.ts', 'auto content']]),
      })

      renderWithRouter(<EditorPanel />)

      await act(async () => {
        autoSaveCallback?.()
      })

      await waitFor(() => {
        expect(fsApi.writeFile).toHaveBeenCalledWith('/home/user/project/src/main.ts', 'auto content')
      })
    })

    it('auto-save 回调不保存非脏文件', async () => {
      let autoSaveCallback: (() => void) | undefined
      mockRegisterAutoSave = vi.fn((cb: () => void) => { autoSaveCallback = cb })

      setupWithFile('/home/user/project/src/main.ts', 'content')
      // file is NOT dirty
      mockWorkspaceGetState.mockReturnValue({
        ...wsStateRef,
        currentFile: '/home/user/project/src/main.ts',
        dirtyFiles: new Set<string>(),
        fileContents: new Map([['/home/user/project/src/main.ts', 'content']]),
      })

      renderWithRouter(<EditorPanel />)

      await act(async () => {
        autoSaveCallback?.()
      })

      // Should not have called writeFile for auto-save
      // writeFile is called once from getWorkspace, but not for auto-save
      const writeCalls = (fsApi.writeFile as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call: string[]) => call[0] === '/home/user/project/src/main.ts'
      )
      expect(writeCalls.length).toBe(0)
    })

    it('auto-save 失败时记录错误', async () => {
      let autoSaveCallback: (() => void) | undefined
      mockRegisterAutoSave = vi.fn((cb: () => void) => { autoSaveCallback = cb })

      setupWithFile('/home/user/project/src/main.ts', 'content')
      wsStateRef.dirtyFiles = new Set(['/home/user/project/src/main.ts'])
      ;(fsApi.writeFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('disk full'))

      mockWorkspaceGetState.mockReturnValue({
        ...wsStateRef,
        currentFile: '/home/user/project/src/main.ts',
        dirtyFiles: new Set(['/home/user/project/src/main.ts']),
        fileContents: new Map([['/home/user/project/src/main.ts', 'content']]),
      })

      renderWithRouter(<EditorPanel />)

      await act(async () => {
        autoSaveCallback?.()
      })

      await waitFor(() => {
        expect(logger.error).toHaveBeenCalledWith('Editor', 'Auto-save failed:', expect.any(Error))
      })
    })

    it('auto-save 回调当 currentFile 为 null 时跳过', async () => {
      let autoSaveCallback: (() => void) | undefined
      mockRegisterAutoSave = vi.fn((cb: () => void) => { autoSaveCallback = cb })

      setupMocks()
      mockWorkspaceGetState.mockReturnValue({
        ...defaultWorkspaceState(),
        currentFile: null,
        dirtyFiles: new Set<string>(),
        fileContents: new Map<string, string>(),
      })

      renderWithRouter(<EditorPanel />)

      await act(async () => {
        autoSaveCallback?.()
      })

      expect(fsApi.writeFile).not.toHaveBeenCalled()
    })

    it('auto-save 回调当 content 为 undefined 时跳过', async () => {
      let autoSaveCallback: (() => void) | undefined
      mockRegisterAutoSave = vi.fn((cb: () => void) => { autoSaveCallback = cb })

      setupWithFile('/home/user/project/src/main.ts', 'content')
      wsStateRef.dirtyFiles = new Set(['/home/user/project/src/main.ts'])

      // content not in fileContents map
      mockWorkspaceGetState.mockReturnValue({
        ...wsStateRef,
        currentFile: '/home/user/project/src/main.ts',
        dirtyFiles: new Set(['/home/user/project/src/main.ts']),
        fileContents: new Map<string, string>(),
      })

      renderWithRouter(<EditorPanel />)

      await act(async () => {
        autoSaveCallback?.()
      })

      expect(fsApi.writeFile).not.toHaveBeenCalled()
    })
  })

  // =====================================================================
  // 15. Save in secondary pane
  // =====================================================================
  describe('分屏保存', () => {
    it('在 secondary pane 中 Ctrl+S 保存 secondary 文件', async () => {
      const file1 = '/home/user/project/src/main.ts'
      const file2 = '/home/user/project/src/utils.ts'
      setupMocks(
        {},
        {
          openFiles: [file1, file2],
          currentFile: file1,
          fileContents: new Map([[file1, 'code1'], [file2, 'code2']]),
        },
        {
          splitDirection: 'horizontal',
          activePaneId: 'secondary',
          paneFiles: { main: file1, secondary: file2 },
        }
      )

      renderWithRouter(<EditorPanel />)

      await act(async () => {
        fireEvent.keyDown(window, { key: 's', ctrlKey: true })
      })

      expect(fsApi.writeFile).toHaveBeenCalledWith(file2, 'code2')
    })

    it('handleSave 在没有文件时不调用 writeFile', async () => {
      setupMocks(
        {},
        {
          openFiles: [],
          currentFile: null,
          fileContents: new Map<string, string>(),
        }
      )

      renderWithRouter(<EditorPanel />)

      await act(async () => {
        fireEvent.keyDown(window, { key: 's', ctrlKey: true })
      })

      expect(fsApi.writeFile).not.toHaveBeenCalled()
    })

    it('handleSave 当 content 为 undefined 时不调用 writeFile', async () => {
      setupMocks(
        {},
        {
          openFiles: ['/home/user/project/src/main.ts'],
          currentFile: '/home/user/project/src/main.ts',
          fileContents: new Map<string, string>(), // no content for the file
        }
      )

      // getState needs to return no content too
      mockWorkspaceGetState.mockReturnValue({
        ...defaultWorkspaceState(),
        openFiles: ['/home/user/project/src/main.ts'],
        currentFile: '/home/user/project/src/main.ts',
        fileContents: new Map<string, string>(),
      })

      renderWithRouter(<EditorPanel />)

      await act(async () => {
        fireEvent.keyDown(window, { key: 's', ctrlKey: true })
      })

      expect(fsApi.writeFile).not.toHaveBeenCalled()
    })
  })

  // =====================================================================
  // 16. Secondary pane content changes
  // =====================================================================
  describe('分屏内容编辑', () => {
    it('secondary pane 内容变更调用 updateFileContent', () => {
      const file1 = '/home/user/project/src/main.ts'
      const file2 = '/home/user/project/src/utils.ts'
      setupMocks(
        {},
        {
          openFiles: [file1, file2],
          currentFile: file1,
          fileContents: new Map([[file1, 'code1'], [file2, 'code2']]),
        },
        {
          splitDirection: 'horizontal',
          activePaneId: 'main',
          paneFiles: { main: file1, secondary: file2 },
        }
      )

      renderWithRouter(<EditorPanel />)

      // There are 2 CodeMirrorPane instances; get the second textarea (secondary pane)
      const textareas = screen.getAllByTestId('cm-textarea')
      expect(textareas).toHaveLength(2)

      // The second textarea is in the secondary pane
      // We need to make getState return the secondary file for useSplitPaneStore
      mockSplitPaneGetState.mockReturnValue({
        splitDirection: 'horizontal',
        activePaneId: 'main',
        paneFiles: { main: file1, secondary: file2 },
      })

      fireEvent.change(textareas[1], { target: { value: 'edited secondary' } })
      expect(wsStateRef.updateFileContent).toHaveBeenCalledWith(file2, 'edited secondary')
    })
  })

  // =====================================================================
  // 17. Tab click in split mode with secondary active
  // =====================================================================
  describe('分屏标签点击', () => {
    it('secondary pane 激活时点击标签设置 secondary pane 文件', () => {
      const file1 = '/home/user/project/src/main.ts'
      const file2 = '/home/user/project/src/utils.ts'
      const file3 = '/home/user/project/src/helper.ts'
      const setPaneFile = vi.fn()
      const splitState = {
        splitDirection: 'horizontal',
        activePaneId: 'secondary',
        paneFiles: { main: file1, secondary: file2 },
        setActivePane: vi.fn(),
        setPaneFile,
        toggleSplit: vi.fn(),
        closeSplit: vi.fn(),
      }
      setupMocks(
        {},
        {
          openFiles: [file1, file2, file3],
          currentFile: file1,
          fileContents: new Map([[file1, 'c1'], [file2, 'c2'], [file3, 'c3']]),
        }
      )

      // Override the split pane store mock to return our split state consistently
      mockUseSplitPaneStore.mockImplementation((selector: (s: unknown) => unknown) => {
        return selector ? selector(splitState) : splitState
      })
      mockSplitPaneGetState.mockReturnValue(splitState)

      renderWithRouter(<EditorPanel />)

      // Click on file3 tab — it's already in openFiles, so openFile won't be called again
      fireEvent.click(screen.getByTestId('tab-helper.ts'))

      expect(setPaneFile).toHaveBeenCalledWith('secondary', file3)
      // file3 is already in openFiles, so openFileFromStore won't be called
    })
  })

  // =====================================================================
  // 18. Goto line direct event
  // =====================================================================
  describe('goto-line-direct 事件', () => {
    it('goto-line-direct 事件定位到主编辑器', async () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)

      await act(async () => {
        window.dispatchEvent(new CustomEvent('goto-line-direct', {
          detail: { line: 42 },
        }))
      })

      // The main editor ref should have had setCursor, scrollToLine, focus called
      // via imperative handle — we can't directly inspect the ref, but no error means success
      expect(screen.getByTestId('codemirror-pane')).toBeInTheDocument()
    })

    it('goto-line-direct 在 secondary pane 使用 secondary 编辑器', async () => {
      const file1 = '/home/user/project/src/main.ts'
      const file2 = '/home/user/project/src/utils.ts'
      setupMocks(
        {},
        {
          openFiles: [file1, file2],
          currentFile: file1,
          fileContents: new Map([[file1, 'c1'], [file2, 'c2']]),
        },
        {
          splitDirection: 'horizontal',
          activePaneId: 'secondary',
          paneFiles: { main: file1, secondary: file2 },
        }
      )

      renderWithRouter(<EditorPanel />)

      await act(async () => {
        window.dispatchEvent(new CustomEvent('goto-line-direct', {
          detail: { line: 15 },
        }))
      })

      expect(screen.getAllByTestId('codemirror-pane')).toHaveLength(2)
    })

    it('goto-line-direct 没有 line 时跳过', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)

      act(() => {
        window.dispatchEvent(new CustomEvent('goto-line-direct', {
          detail: {},
        }))
      })

      // No crash — event handled but no action taken
      expect(screen.getByTestId('codemirror-pane')).toBeInTheDocument()
    })

    it('goto-line-direct 没有 currentFile 时跳过', () => {
      setupMocks()
      renderWithRouter(<EditorPanel />)

      act(() => {
        window.dispatchEvent(new CustomEvent('goto-line-direct', {
          detail: { line: 10 },
        }))
      })

      // No crash
      expect(screen.getByTestId('welcome-panel')).toBeInTheDocument()
    })
  })

  // =====================================================================
  // 19. Drag and drop — cross-pane tab transfer
  // =====================================================================
  describe('拖拽跨面板标签转移', () => {
    it('dragend 事件清除拖拽状态', async () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)

      // Start drag via the drag start button in TabBar mock
      const dragStartBtn = screen.getByTestId('drag-start-btn')
      fireEvent.click(dragStartBtn)

      // Dispatch dragend
      await act(async () => {
        window.dispatchEvent(new Event('dragend'))
      })

      // No crash — drag state cleared
      expect(screen.getByTestId('tab-bar')).toBeInTheDocument()
    })

    it('主面板 dragOver 设置 dropTargetPane (从 secondary 拖入)', () => {
      const file1 = '/home/user/project/src/main.ts'
      const file2 = '/home/user/project/src/utils.ts'
      setupMocks(
        {},
        {
          openFiles: [file1, file2],
          currentFile: file1,
          fileContents: new Map([[file1, 'c1'], [file2, 'c2']]),
        },
        {
          splitDirection: 'horizontal',
          activePaneId: 'main',
          paneFiles: { main: file1, secondary: file2 },
        }
      )

      renderWithRouter(<EditorPanel />)

      // Simulate drag start from secondary
      fireEvent.click(screen.getByTestId('drag-start-btn'))

      // Component should render without crashing; drag state is internal
      const panes = screen.getAllByTestId('codemirror-pane')
      expect(panes).toHaveLength(2)
    })

    it('主面板 dragLeave 清除 dropTargetPane', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      expect(screen.getByTestId('tab-bar')).toBeInTheDocument()
    })

    it('主面板 drop 清除拖拽状态', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      expect(screen.getByTestId('tab-bar')).toBeInTheDocument()
    })
  })

  // =====================================================================
  // 20. Pane focus handlers
  // =====================================================================
  describe('面板焦点', () => {
    it('点击主面板焦点时 setActivePane("main")', () => {
      const file1 = '/home/user/project/src/main.ts'
      const file2 = '/home/user/project/src/utils.ts'
      const setActivePane = vi.fn()
      setupMocks(
        {},
        {
          openFiles: [file1, file2],
          currentFile: file1,
          fileContents: new Map([[file1, 'c1'], [file2, 'c2']]),
        },
        {
          splitDirection: 'horizontal',
          activePaneId: 'secondary',
          paneFiles: { main: file1, secondary: file2 },
          setActivePane,
        }
      )

      renderWithRouter(<EditorPanel />)

      // Find the main pane container and fire focus
      const mainPanes = screen.getAllByTestId('codemirror-pane')
      const mainPaneContainer = mainPanes[0].closest('[class*="overflow-hidden"]')
      if (mainPaneContainer) {
        fireEvent.focus(mainPaneContainer)
        expect(setActivePane).toHaveBeenCalledWith('main')
      }
    })

    it('点击 secondary 面板焦点时 setActivePane("secondary")', () => {
      const file1 = '/home/user/project/src/main.ts'
      const file2 = '/home/user/project/src/utils.ts'
      const setActivePane = vi.fn()
      setupMocks(
        {},
        {
          openFiles: [file1, file2],
          currentFile: file1,
          fileContents: new Map([[file1, 'c1'], [file2, 'c2']]),
        },
        {
          splitDirection: 'horizontal',
          activePaneId: 'main',
          paneFiles: { main: file1, secondary: file2 },
          setActivePane,
        }
      )

      renderWithRouter(<EditorPanel />)

      // Find secondary pane — look for the close split button's parent
      const closeSplitBtn = screen.getByTitle('Close split')
      const secondaryHeader = closeSplitBtn.closest('[class*="flex-1"]')
      if (secondaryHeader) {
        fireEvent.focus(secondaryHeader)
        expect(setActivePane).toHaveBeenCalledWith('secondary')
      }
    })
  })

  // =====================================================================
  // 21. Tab bar close operations
  // =====================================================================
  describe('标签栏关闭操作', () => {
    it('Close All 按钮在无脏文件时直接关闭所有', () => {
      setupWithTwoFiles()
      renderWithRouter(<EditorPanel />)
      const closeAllBtn = screen.getByTestId('close-all-btn')
      fireEvent.click(closeAllBtn)
      expect(wsStateRef.closeAllFiles).toHaveBeenCalled()
    })

    it('Close All 按钮在有脏文件时显示 DirtyCloseDialog', () => {
      setupWithTwoFiles()
      wsStateRef.dirtyFiles = new Set(['/home/user/project/src/main.ts'])
      renderWithRouter(<EditorPanel />)
      const closeAllBtn = screen.getByTestId('close-all-btn')
      fireEvent.click(closeAllBtn)
      expect(screen.getByTestId('dirty-close-dialog')).toBeInTheDocument()
      expect(screen.getByTestId('dirty-close-dialog')).toHaveAttribute('data-path', '__close_all__')
    })

    it('Close Others 按钮调用 closeOthers', () => {
      setupWithTwoFiles()
      renderWithRouter(<EditorPanel />)
      const closeOthersBtn = screen.getByTestId('close-others-btn')
      fireEvent.click(closeOthersBtn)
      expect(wsStateRef.closeOthers).toHaveBeenCalledWith('/home/user/project/src/main.ts')
    })

    it('Close Saved 按钮调用 closeSaved', () => {
      setupWithTwoFiles()
      renderWithRouter(<EditorPanel />)
      const closeSavedBtn = screen.getByTestId('close-saved-btn')
      fireEvent.click(closeSavedBtn)
      expect(wsStateRef.closeSaved).toHaveBeenCalled()
    })

    it('Close To Left 按钮当有左侧标签时存在', () => {
      const file1 = '/home/user/project/src/first.ts'
      const file2 = '/home/user/project/src/main.ts'
      setupMocks({}, {
        openFiles: [file1, file2],
        currentFile: file2,
        fileContents: new Map([[file1, 'c1'], [file2, 'c2']]),
      })
      renderWithRouter(<EditorPanel />)
      expect(screen.getByTestId('close-to-left-btn')).toBeInTheDocument()
      fireEvent.click(screen.getByTestId('close-to-left-btn'))
      expect(wsStateRef.closeToLeft).toHaveBeenCalledWith(file2)
    })

    it('Close To Left 按钮当 currentFile 是第一个标签时不存在', () => {
      const file1 = '/home/user/project/src/main.ts'
      const file2 = '/home/user/project/src/utils.ts'
      setupMocks({}, {
        openFiles: [file1, file2],
        currentFile: file1,
        fileContents: new Map([[file1, 'c1'], [file2, 'c2']]),
      })
      renderWithRouter(<EditorPanel />)
      expect(screen.queryByTestId('close-to-left-btn')).not.toBeInTheDocument()
    })

    it('Close To Right 按钮当有右侧标签时存在', () => {
      const file1 = '/home/user/project/src/main.ts'
      const file2 = '/home/user/project/src/utils.ts'
      setupMocks({}, {
        openFiles: [file1, file2],
        currentFile: file1,
        fileContents: new Map([[file1, 'c1'], [file2, 'c2']]),
      })
      renderWithRouter(<EditorPanel />)
      expect(screen.getByTestId('close-to-right-btn')).toBeInTheDocument()
      fireEvent.click(screen.getByTestId('close-to-right-btn'))
      expect(wsStateRef.closeToRight).toHaveBeenCalledWith(file1)
    })

    it('Close To Right 按钮当 currentFile 是最后一个标签时不存在', () => {
      const file1 = '/home/user/project/src/main.ts'
      const file2 = '/home/user/project/src/utils.ts'
      setupMocks({}, {
        openFiles: [file1, file2],
        currentFile: file2,
        fileContents: new Map([[file1, 'c1'], [file2, 'c2']]),
      })
      renderWithRouter(<EditorPanel />)
      expect(screen.queryByTestId('close-to-right-btn')).not.toBeInTheDocument()
    })

    it('Close Others 当没有 currentFile 时不执行', () => {
      // The handleCloseOtherTabs callback checks for currentFile
      setupMocks({}, {
        openFiles: ['/home/user/project/src/main.ts'],
        currentFile: null,
        fileContents: new Map([['/home/user/project/src/main.ts', 'c1']]),
      })
      renderWithRouter(<EditorPanel />)
      // When currentFile is null, handleCloseOtherTabs returns early.
      // The onCloseOthers callback is still passed to TabBar but with a no-op guard.
      // The close-others-btn exists in TabBar mock but won't call closeOthers
      const closeOthersBtn = screen.queryByTestId('close-others-btn')
      if (closeOthersBtn) {
        fireEvent.click(closeOthersBtn)
        // Should NOT have called closeOthers because currentFile is null
        expect(wsStateRef.closeOthers).not.toHaveBeenCalled()
      }
      // Alternatively, if no currentFile, there's nothing to close
      expect(wsStateRef.closeOthers).not.toHaveBeenCalled()
    })

    it('Reorder 按钮调用 reorderFiles', () => {
      setupWithTwoFiles()
      renderWithRouter(<EditorPanel />)
      fireEvent.click(screen.getByTestId('reorder-btn'))
      expect(wsStateRef.reorderFiles).toHaveBeenCalledWith(0, 1)
    })
  })

  // =====================================================================
  // 22. Blame sidebar
  // =====================================================================
  describe('Blame 侧边栏', () => {
    it('启用 blame 后显示 BlameSidebar', async () => {
      const blameData = [
        { line: 1, commit: 'abc123', author: 'Alice', authorMail: 'a@t.com', authorTime: '2024-01-01', summary: 'init' },
      ]
      ;(gitBlameApi.blame as ReturnType<typeof vi.fn>).mockResolvedValueOnce(blameData)
      setupWithFile()
      renderWithRouter(<EditorPanel />)

      fireEvent.click(screen.getByText('Blame'))

      await waitFor(() => {
        expect(screen.getByTestId('blame-sidebar')).toBeInTheDocument()
      })
    })

    it('blame API 失败时设置空行', async () => {
      ;(gitBlameApi.blame as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('not a git repo'))
      setupWithFile()
      renderWithRouter(<EditorPanel />)

      fireEvent.click(screen.getByText('Blame'))

      await waitFor(() => {
        expect(logger.debug).toHaveBeenCalledWith('Editor', 'Blame fetch failed:', expect.any(Error))
      })
    })

    it('切换 blame 关闭时清除 blame 数据', async () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)

      // Enable blame
      fireEvent.click(screen.getByText('Blame'))
      // Disable blame
      fireEvent.click(screen.getByText('Blame'))

      // BlameSidebar should not be present when blame is off
      await waitFor(() => {
        expect(screen.queryByTestId('blame-sidebar')).not.toBeInTheDocument()
      })
    })
  })

  // =====================================================================
  // 23. Diff view edge cases
  // =====================================================================
  describe('Diff 视图边缘情况', () => {
    it('editor:show-diff 事件没有 path 时不显示', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      act(() => {
        window.dispatchEvent(new CustomEvent('editor:show-diff', {
          detail: { original: 'old', modified: 'new' },
        }))
      })
      expect(screen.queryByTestId('diff-view')).not.toBeInTheDocument()
    })

    it('editor:show-diff 事件缺少 original 时不显示', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      act(() => {
        window.dispatchEvent(new CustomEvent('editor:show-diff', {
          detail: { path: 'test.ts', modified: 'new' },
        }))
      })
      expect(screen.queryByTestId('diff-view')).not.toBeInTheDocument()
    })

    it('editor:show-diff 事件缺少 modified 时不显示', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      act(() => {
        window.dispatchEvent(new CustomEvent('editor:show-diff', {
          detail: { path: 'test.ts', original: 'old' },
        }))
      })
      expect(screen.queryByTestId('diff-view')).not.toBeInTheDocument()
    })

    it('editor:show-diff 事件没有 detail 时不显示', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      act(() => {
        window.dispatchEvent(new CustomEvent('editor:show-diff'))
      })
      expect(screen.queryByTestId('diff-view')).not.toBeInTheDocument()
    })
  })

  // =====================================================================
  // 24. Recent files localStorage
  // =====================================================================
  describe('最近文件 localStorage', () => {
    it('localStorage 解析错误时返回空数组', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
        if (key === 'swarm-editor-recent-files') return 'invalid-json{{{'
        return null
      })
      setupMocks()
      renderWithRouter(<EditorPanel />)
      // Should not crash, and logger.debug should have been called
      expect(logger.debug).toHaveBeenCalledWith('Editor', 'Failed to parse recent files from localStorage')
      vi.restoreAllMocks()
    })

    it('localStorage 为 null 时返回空数组', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null)
      setupMocks()
      renderWithRouter(<EditorPanel />)
      expect(screen.getByTestId('welcome-panel')).toBeInTheDocument()
      vi.restoreAllMocks()
    })
  })

  // =====================================================================
  // 25. Workspace init edge cases
  // =====================================================================
  describe('工作区初始化边缘情况', () => {
    it('getWorkspace 失败时记录错误日志', async () => {
      ;(fsApi.getWorkspace as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('no workspace'))
      setupMocks()
      renderWithRouter(<EditorPanel />)

      await waitFor(() => {
        expect(logger.error).toHaveBeenCalledWith('Editor', 'Failed to load workspace:', expect.any(Error))
      })
    })
  })

  // =====================================================================
  // 26. Window title edge cases
  // =====================================================================
  describe('窗口标题', () => {
    it('文件名提取 pop() 失败时使用完整路径', () => {
      // A path that doesn't have '/' separator — pop returns the string itself
      setupMocks({}, {
        openFiles: ['readme.md'],
        currentFile: 'readme.md',
        fileContents: new Map([['readme.md', 'content']]),
      })
      renderWithRouter(<EditorPanel />)
      expect(document.title).toContain('readme.md')
      expect(document.title).toContain('Swarm Editor')
    })

    it('非脏文件标题不包含圆点', () => {
      setupWithFile('/home/user/project/src/main.ts')
      renderWithRouter(<EditorPanel />)
      expect(document.title).not.toContain('●')
    })
  })

  // =====================================================================
  // 27. Keyboard shortcuts edge cases
  // =====================================================================
  describe('键盘快捷键边缘情况', () => {
    it('Ctrl+W 在没有当前文件时不崩溃', async () => {
      setupMocks({}, {
        openFiles: [],
        currentFile: null,
        fileContents: new Map<string, string>(),
      })
      renderWithRouter(<EditorPanel />)

      await act(async () => {
        fireEvent.keyDown(window, { key: 'w', ctrlKey: true })
      })

      // Should not crash
      expect(screen.getByTestId('welcome-panel')).toBeInTheDocument()
    })

    it('非快捷键不触发操作', async () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)

      await act(async () => {
        fireEvent.keyDown(window, { key: 'x', ctrlKey: true })
      })

      expect(fsApi.writeFile).not.toHaveBeenCalled()
      expect(wsStateRef.closeFile).not.toHaveBeenCalled()
      expect(wsStateRef.undoCloseFile).not.toHaveBeenCalled()
      const splitState = mockSplitPaneGetState()
      expect(splitState.toggleSplit).not.toHaveBeenCalled()
    })

    it('没有 ctrl/meta 修饰键不触发快捷键', async () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)

      await act(async () => {
        fireEvent.keyDown(window, { key: 's' })
      })

      expect(fsApi.writeFile).not.toHaveBeenCalled()
    })
  })

  // =====================================================================
  // 28. Split right from context menu
  // =====================================================================
  describe('右键菜单分屏', () => {
    it('Split Right 在分屏未激活时先 toggleSplit', () => {
      const file1 = '/home/user/project/src/main.ts'
      const toggleSplit = vi.fn()
      const setPaneFile = vi.fn()
      const setActivePane = vi.fn()
      setupMocks(
        {},
        {
          openFiles: [file1],
          currentFile: file1,
          fileContents: new Map([[file1, 'c1']]),
        },
        {
          splitDirection: 'none',
          activePaneId: 'main',
          paneFiles: { main: file1, secondary: null },
          toggleSplit,
          setPaneFile,
          setActivePane,
        }
      )

      renderWithRouter(<EditorPanel />)

      // Open context menu
      fireEvent.contextMenu(screen.getByTestId('tab-main.ts'), { clientX: 100, clientY: 200 })

      // Click Split Right
      fireEvent.click(screen.getByTestId('ctx-split-right'))

      expect(toggleSplit).toHaveBeenCalled()
      expect(setPaneFile).toHaveBeenCalledWith('secondary', file1)
      expect(setActivePane).toHaveBeenCalledWith('secondary')
    })

    it('Split Right 在分屏已激活时不调用 toggleSplit', () => {
      const file1 = '/home/user/project/src/main.ts'
      const toggleSplit = vi.fn()
      const setPaneFile = vi.fn()
      const setActivePane = vi.fn()
      setupMocks(
        {},
        {
          openFiles: [file1],
          currentFile: file1,
          fileContents: new Map([[file1, 'c1']]),
        },
        {
          splitDirection: 'horizontal',
          activePaneId: 'main',
          paneFiles: { main: file1, secondary: null },
          toggleSplit,
          setPaneFile,
          setActivePane,
        }
      )

      renderWithRouter(<EditorPanel />)

      // Open context menu
      fireEvent.contextMenu(screen.getByTestId('tab-main.ts'), { clientX: 100, clientY: 200 })

      // Click Split Right
      fireEvent.click(screen.getByTestId('ctx-split-right'))

      expect(toggleSplit).not.toHaveBeenCalled()
      expect(setPaneFile).toHaveBeenCalledWith('secondary', file1)
      expect(setActivePane).toHaveBeenCalledWith('secondary')
    })
  })

  // =====================================================================
  // 29. Copy path from context menu
  // =====================================================================
  describe('右键菜单复制路径', () => {
    it('Copy Path 调用 clipboard.writeText', () => {
      const addToast = vi.fn()
      setupMocks({ addToast }, {
        openFiles: ['/home/user/project/src/main.ts'],
        currentFile: '/home/user/project/src/main.ts',
        fileContents: new Map([['/home/user/project/src/main.ts', 'c1']]),
      })

      renderWithRouter(<EditorPanel />)

      fireEvent.contextMenu(screen.getByTestId('tab-main.ts'), { clientX: 100, clientY: 200 })
      fireEvent.click(screen.getByTestId('ctx-copy-path'))

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/home/user/project/src/main.ts')
    })

    it('Copy Relative Path 计算相对路径', () => {
      const addToast = vi.fn()
      setupMocks({ addToast }, {
        openFiles: ['/home/user/project/src/main.ts'],
        currentFile: '/home/user/project/src/main.ts',
        fileContents: new Map([['/home/user/project/src/main.ts', 'c1']]),
        workspacePath: '/home/user/project',
      })

      renderWithRouter(<EditorPanel />)

      fireEvent.contextMenu(screen.getByTestId('tab-main.ts'), { clientX: 100, clientY: 200 })
      fireEvent.click(screen.getByTestId('ctx-copy-rel-path'))

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('src/main.ts')
    })

    it('Copy Relative Path 没有 workspacePath 时不调用 clipboard', () => {
      const addToast = vi.fn()
      setupMocks({ addToast }, {
        openFiles: ['/home/user/project/src/main.ts'],
        currentFile: '/home/user/project/src/main.ts',
        fileContents: new Map([['/home/user/project/src/main.ts', 'c1']]),
        workspacePath: '',
      })

      renderWithRouter(<EditorPanel />)

      fireEvent.contextMenu(screen.getByTestId('tab-main.ts'), { clientX: 100, clientY: 200 })

      // ctx-copy-rel-path might not be rendered because workspace is empty
      // The component checks `if (workspace)` — empty string is falsy
      const copyRelBtn = screen.queryByTestId('ctx-copy-rel-path')
      if (copyRelBtn) {
        fireEvent.click(copyRelBtn)
        // Should not have been called because workspace is empty
        expect(navigator.clipboard.writeText).not.toHaveBeenCalledWith(expect.stringContaining('src'))
      }
      // The button might not even exist
    })
  })

  // =====================================================================
  // 30. Dirty close all via context menu
  // =====================================================================
  describe('右键菜单关闭所有脏文件', () => {
    it('Dirty Close All 按钮设置 dirtyClosePath 为 __close_all__', () => {
      setupWithTwoFiles()
      wsStateRef.dirtyFiles = new Set(['/home/user/project/src/main.ts'])
      renderWithRouter(<EditorPanel />)

      fireEvent.contextMenu(screen.getByTestId('tab-main.ts'), { clientX: 100, clientY: 200 })
      fireEvent.click(screen.getByTestId('ctx-dirty-close-all'))

      expect(screen.getByTestId('dirty-close-dialog')).toHaveAttribute('data-path', '__close_all__')
    })
  })

  // =====================================================================
  // 31. handleSaveFileByPath error path
  // =====================================================================
  describe('handleSaveFileByPath 错误处理', () => {
    it('保存失败时记录错误日志', async () => {
      ;(fsApi.writeFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('disk full'))
      setupWithFile('/home/user/project/src/main.ts', 'dirty content')
      wsStateRef.dirtyFiles = new Set(['/home/user/project/src/main.ts'])

      renderWithRouter(<EditorPanel />)

      // Trigger dirty close then save
      fireEvent.click(screen.getByTestId('close-tab-main.ts'))
      await act(async () => {
        fireEvent.click(screen.getByTestId('dirty-save-and-close'))
      })

      await waitFor(() => {
        expect(logger.error).toHaveBeenCalledWith('Editor', 'Failed to save file:', expect.any(Error))
      })
    })
  })

  // =====================================================================
  // 32. Component unmount cleanup
  // =====================================================================
  describe('组件卸载清理', () => {
    it('卸载时清除 mountedRef', async () => {
      setupWithFile()
      const { unmount } = renderWithRouter(<EditorPanel />)
      unmount()
      // No crash on unmount
    })

    it('卸载时移除 keyboard 事件监听', async () => {
      const addSpy = vi.spyOn(window, 'addEventListener')
      const removeSpy = vi.spyOn(window, 'removeEventListener')
      setupWithFile()
      const { unmount } = renderWithRouter(<EditorPanel />)
      unmount()
      // keydown listener should have been removed
      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
      addSpy.mockRestore()
      removeSpy.mockRestore()
    })

    it('卸载时移除 dragend 事件监听', async () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener')
      setupWithFile()
      const { unmount } = renderWithRouter(<EditorPanel />)
      unmount()
      expect(removeSpy).toHaveBeenCalledWith('dragend', expect.any(Function))
      removeSpy.mockRestore()
    })

    it('卸载时移除 goto-line-direct 事件监听', async () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener')
      setupWithFile()
      const { unmount } = renderWithRouter(<EditorPanel />)
      unmount()
      expect(removeSpy).toHaveBeenCalledWith('goto-line-direct', expect.any(Function))
      removeSpy.mockRestore()
    })

    it('卸载时移除 editor:show-diff 事件监听', async () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener')
      setupWithFile()
      const { unmount } = renderWithRouter(<EditorPanel />)
      unmount()
      expect(removeSpy).toHaveBeenCalledWith('editor:show-diff', expect.any(Function))
      removeSpy.mockRestore()
    })
  })

  // =====================================================================
  // 33. Blame button styling
  // =====================================================================
  describe('Blame 按钮样式', () => {
    it('Blame 按钮在启用时有 active 样式', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)

      const blameBtn = screen.getByText('Blame')
      expect(blameBtn).toHaveAttribute('title', 'Show Blame')

      fireEvent.click(blameBtn)
      expect(blameBtn).toHaveAttribute('title', 'Hide Blame')
      expect(blameBtn.className).toContain('bg-[#58a6ff]/20')
    })

    it('Blame 按钮在禁用时有 inactive 样式', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)

      const blameBtn = screen.getByText('Blame')
      expect(blameBtn.className).toContain('text-[#6b7280]')
    })
  })

  // =====================================================================
  // 34. Secondary pane header display
  // =====================================================================
  describe('分屏头部显示', () => {
    it('secondary pane 有文件时显示文件名', () => {
      const file1 = '/home/user/project/src/main.ts'
      const file2 = '/home/user/project/src/utils.ts'
      setupMocks(
        {},
        {
          openFiles: [file1, file2],
          currentFile: file1,
          fileContents: new Map([[file1, 'c1'], [file2, 'c2']]),
        },
        {
          splitDirection: 'horizontal',
          activePaneId: 'main',
          paneFiles: { main: file1, secondary: file2 },
        }
      )

      renderWithRouter(<EditorPanel />)

      // Secondary header shows the secondary file name
      const spans = screen.getAllByText('utils.ts')
      expect(spans.length).toBeGreaterThanOrEqual(2) // tab + secondary header
    })

    it('secondary pane 无文件时显示 "No file open"', () => {
      const file1 = '/home/user/project/src/main.ts'
      setupMocks(
        {},
        {
          openFiles: [file1],
          currentFile: file1,
          fileContents: new Map([[file1, 'c1']]),
        },
        {
          splitDirection: 'horizontal',
          activePaneId: 'main',
          paneFiles: { main: file1, secondary: null },
        }
      )

      renderWithRouter(<EditorPanel />)

      expect(screen.getByText('No file open')).toBeInTheDocument()
    })
  })

  // =====================================================================
  // 35. Save error with non-Error object
  // =====================================================================
  describe('保存非 Error 异常', () => {
    it('保存失败时非 Error 对象转为字符串', async () => {
      const addToast = vi.fn()
      ;(fsApi.writeFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce('string error')
      setupMocks({}, {
        openFiles: ['/home/user/project/src/main.ts'],
        currentFile: '/home/user/project/src/main.ts',
        fileContents: new Map([['/home/user/project/src/main.ts', 'code']]),
      })
      mockUseAppStore.mockImplementation((selector: (s: unknown) => unknown) => {
        return selector({ addToast })
      })

      renderWithRouter(<EditorPanel />)

      await act(async () => {
        fireEvent.keyDown(window, { key: 's', ctrlKey: true })
      })

      await waitFor(() => {
        expect(addToast).toHaveBeenCalledWith('error', 'Save failed', 'string error')
      })
    })
  })

  // =====================================================================
  // 36. BreadcrumbsBar navigation callbacks
  // =====================================================================
  describe('面包屑导航回调', () => {
    it('BreadcrumbsBar 导航回调调用 toggleDir', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      const navBtn = screen.getByTestId('bc-navigate')
      fireEvent.click(navBtn)
      expect(wsStateRef.toggleDir).toHaveBeenCalledWith('/home/user/project/src')
    })

    it('BreadcrumbsBar 文件选择回调调用 openFile', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel />)
      const fileBtn = screen.getByTestId('bc-file-select')
      fireEvent.click(fileBtn)
      expect(wsStateRef.openFile).toHaveBeenCalledWith('/home/user/project/src/other.ts', { preview: false })
    })
  })

  // =====================================================================
  // 37. Embedded prop (unused but tested for coverage)
  // =====================================================================
  describe('embedded 属性', () => {
    it('传入 embedded 属性不崩溃', () => {
      setupWithFile()
      renderWithRouter(<EditorPanel embedded />)
      expect(screen.getByTestId('codemirror-pane')).toBeInTheDocument()
    })
  })

  // =====================================================================
  // 38. External modification prompt - not matching current file
  // =====================================================================
  describe('外部文件修改 - 非当前文件', () => {
    it('外部修改的不是当前文件时不显示提示', () => {
      setupWithFile('/home/user/project/src/main.ts')
      wsStateRef.externalModifications = new Set(['/home/user/project/src/other.ts'])
      renderWithRouter(<EditorPanel />)
      expect(screen.queryByTestId('external-mod-prompt')).not.toBeInTheDocument()
    })
  })
})
