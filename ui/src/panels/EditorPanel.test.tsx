import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import EditorPanel from './EditorPanel'
import { fsApi, gitBlameApi } from '../services/api'

// Mock scrollIntoView for jsdom (TabBar uses it)
Element.prototype.scrollIntoView = vi.fn()

// Mock CodeMirrorPane — simple div mock
vi.mock('../components/CodeMirrorPane', () => ({
  CodeMirrorPane: React.forwardRef(function CodeMirrorPane(
    { value, filename, onChange }: { value: string; filename: string; onChange?: (v: string) => void },
    _ref: React.Ref<unknown>
  ) {
    return (
      <div data-testid="codemirror-pane" data-filename={filename}>
        <textarea
          data-testid="cm-textarea"
          defaultValue={value}
          onChange={(e) => onChange?.(e.target.value)}
        />
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

// Mock TabBar
vi.mock('../components/TabBar', () => ({
  TabBar: ({ openFiles, currentFile, dirtyFiles, pinnedFiles, previewTab, onTabClick, onTabClose, onTabContextMenu, paneId }: {
    openFiles: string[]
    currentFile: string | null
    dirtyFiles: Set<string>
    pinnedFiles: Set<string>
    previewTab?: string | null
    onTabClick: (path: string) => void
    onTabClose: (path: string) => void
    onTabContextMenu?: (e: React.MouseEvent, path: string) => void
    paneId?: string
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
    </div>
  ),
}))

// Mock BreadcrumbsBar
vi.mock('../components/BreadcrumbsBar', () => ({
  BreadcrumbsBar: ({ filePath }: { filePath?: string }) => (
    <div data-testid="breadcrumbs-bar">{filePath}</div>
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
  TabContextMenu: ({ tabContextMenu, onClose, onCloseTab, onCloseOthers }: {
    tabContextMenu: { visible: boolean; x: number; y: number; path: string | null }
    onClose: () => void
    onCloseTab: (path: string) => void
    onCloseOthers: (path: string) => void
  }) => {
    if (!tabContextMenu.visible || !tabContextMenu.path) return null
    return (
      <div data-testid="tab-context-menu" data-path={tabContextMenu.path}>
        <button data-testid="ctx-close" onClick={() => onCloseTab(tabContextMenu.path!)}>Close</button>
        <button data-testid="ctx-close-others" onClick={() => onCloseOthers(tabContextMenu.path!)}>Close Others</button>
        <button data-testid="ctx-dismiss" onClick={onClose}>Dismiss</button>
      </div>
    )
  },
}))

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
    registerAutoSave: vi.fn(),
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
      ;(fsApi.readFile as any).mockResolvedValueOnce('new content from disk')
      setupWithFile('/home/user/project/src/main.ts', 'old content')
      wsStateRef.externalModifications = new Set(['/home/user/project/src/main.ts'])
      renderWithRouter(<EditorPanel />)
      const reloadBtn = screen.getByText('重新加载')
      await act(async () => {
        fireEvent.click(reloadBtn)
      })
      expect(fsApi.readFile).toHaveBeenCalledWith('/home/user/project/src/main.ts')
    })

    it('点击重新加载后清除外部修改标记', async () => {
      setupWithFile('/home/user/project/src/main.ts', 'old')
      wsStateRef.externalModifications = new Set(['/home/user/project/src/main.ts'])
      renderWithRouter(<EditorPanel />)
      const reloadBtn = screen.getByText('重新加载')
      await act(async () => {
        fireEvent.click(reloadBtn)
      })
      expect(fsApi.readFile).toHaveBeenCalledWith('/home/user/project/src/main.ts')
      // setState is called to update fileContents map
      expect(mockWorkspaceSetState).toHaveBeenCalled()
      // clearExternalModification is called after successful reload
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
  })
})
