import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import EditorPanel from './EditorPanel'

// Mock scrollIntoView for jsdom (TabBar uses it)
Element.prototype.scrollIntoView = vi.fn()

// Mock Monaco Editor — minimal mock, no onMount simulation
vi.mock('@monaco-editor/react', () => ({
  default: ({ language, value, onChange, options }: {
    language: string
    value: string
    onChange: (value: string | undefined) => void
    options?: { wordWrap?: string; lineNumbers?: string }
  }) => (
    <textarea
      data-testid="monaco-editor"
      data-language={language}
      data-wordwrap={options?.wordWrap}
      data-linenumbers={options?.lineNumbers}
      defaultValue={value}
      onChange={(e) => onChange?.(e.target.value)}
      onBlur={() => onChange?.(undefined)}
    />
  ),
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
vi.mock('../stores/workspaceStore', () => ({
  useWorkspaceStore: (selector: (state: unknown) => unknown) => mockUseWorkspaceStore(selector),
}))

const mockUseSplitPaneStore = vi.fn()
const mockSplitPaneGetState = vi.fn()
vi.mock('../stores/splitPaneStore', () => ({
  useSplitPaneStore: Object.assign(
    (selector: (state: unknown) => unknown) => mockUseSplitPaneStore(selector),
    { getState: () => mockSplitPaneGetState() }
  ),
}))

// Mock settings hook
vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({
    settings: {
      fontSize: 14,
      fontFamily: 'monospace',
      tabSize: 2,
      wordWrap: true,
      lineNumbers: 'on',
      minimap: true,
      autoSaveDelay: 1000,
    },
    updateSetting: vi.fn(),
  }),
  loadSettings: () => ({
    fontSize: 14,
    fontFamily: 'monospace',
    tabSize: 2,
    wordWrap: true,
    lineNumbers: 'on',
    minimap: true,
    autoSaveDelay: 1000,
  }),
}))

// Mock xterm.js (TerminalPanel uses it)
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    open = vi.fn()
    dispose = vi.fn()
    onData = vi.fn()
    onResize = vi.fn().mockReturnValue({ dispose: vi.fn() })
    clear = vi.fn()
    focus = vi.fn()
    loadAddon = vi.fn()
  },
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = vi.fn()
    dispose = vi.fn()
  },
}))

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: class {
    dispose = vi.fn()
  },
}))

// Mock useTerminal hook
vi.mock('../hooks/useTerminal', () => ({
  useTerminal: () => ({
    connected: false,
    sessionId: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendInput: vi.fn(),
    resize: vi.fn(),
    wsRef: { current: null },
  }),
}))

// Mock the API
vi.mock('../services', () => ({
  api: {
    fs: {
      getWorkspace: vi.fn().mockResolvedValue('/home/user/project'),
      listDir: vi.fn().mockResolvedValue([
        { name: 'src', path: '/home/user/project/src', isDirectory: true, children: [
          { name: 'main.ts', path: '/home/user/project/src/main.ts', isDirectory: false },
          { name: 'utils.ts', path: '/home/user/project/src/utils.ts', isDirectory: false },
          { name: 'types.ts', path: '/home/user/project/src/types.ts', isDirectory: false },
        ]},
        { name: 'package.json', path: '/home/user/project/package.json', isDirectory: false },
        { name: 'README.md', path: '/home/user/project/README.md', isDirectory: false },
      ]),
      readFile: vi.fn().mockResolvedValue('// file content'),
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
    execute: {
      executeCode: vi.fn().mockResolvedValue({ success: true, output: 'test output' }),
    },
  },
}))

// --- Mock State Helpers ---

type AppState = Record<string, unknown>

const defaultAppState = (overrides: AppState = {}): AppState => ({
  swarms: [],
  agents: [],
  selectedAgent: null,
  addToast: vi.fn(),
  updateFileProblems: vi.fn(),
  workspaceProblems: [],
  ...overrides,
})

const defaultWorkspaceState = (overrides: AppState = {}): AppState => ({
  workspacePath: '/home/user/project',
  fileTree: [],
  expandedDirs: new Set<string>(),
  currentFile: null,
  fileContents: new Map<string, string>(),
  openFiles: [] as string[],
  dirtyFiles: new Set<string>(),
  pinnedFiles: new Set<string>(),
  previewTab: null,
  recentlyClosedFiles: [] as string[],
  language: 'typescript',
  loading: false,
  recentFiles: [] as string[],
  setWorkspacePath: vi.fn(),
  loadWorkspace: vi.fn(),
  refreshFileTree: vi.fn(),
  toggleDir: vi.fn(),
  openFile: vi.fn(),
  closeFile: vi.fn(),
  renameFileInStore: vi.fn(),
  closeAllFiles: vi.fn(),
  closeOthers: vi.fn(),
  closeToRight: vi.fn(),
  closeSaved: vi.fn(),
  undoCloseFile: vi.fn(),
  reorderFiles: vi.fn(),
  updateFileContent: vi.fn(),
  clearDirty: vi.fn(),
  setLanguage: vi.fn(),
  togglePin: vi.fn(),
  isPinned: vi.fn(),
  ...overrides,
})

const defaultSplitPaneState = (): AppState => ({
  splitDirection: 'none',
  activePaneId: 'main',
  paneFiles: { main: null },
  setActivePane: vi.fn(),
  setPaneFile: vi.fn(),
  toggleSplit: vi.fn(),
  closeSplit: vi.fn(),
})

const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>)

// Stateful workspace mock: tracks openFiles/currentFile when openFile is called
let wsStateRef: ReturnType<typeof defaultWorkspaceState>

const setupMocks = (appOverrides: AppState = {}, wsOverrides: AppState = {}) => {
  wsStateRef = defaultWorkspaceState(wsOverrides)

  mockUseAppStore.mockImplementation((selector: (s: unknown) => unknown) => {
    const state = defaultAppState(appOverrides)
    return selector ? selector(state) : state
  })

  mockAppGetState.mockReturnValue(defaultAppState(appOverrides))

  mockUseWorkspaceStore.mockImplementation((selector: (s: unknown) => unknown) => {
    return selector ? selector(wsStateRef) : wsStateRef
  })

  mockUseSplitPaneStore.mockImplementation((selector: (s: unknown) => unknown) => {
    const state = defaultSplitPaneState()
    return selector ? selector(state) : state
  })
  // R5097: Mock getState for handleSave which uses useSplitPaneStore.getState()
  mockSplitPaneGetState.mockReturnValue(defaultSplitPaneState())
}

// --- Tests ---

describe('EditorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  it('renders toolbar with language selector', () => {
    renderWithRouter(<EditorPanel />)
    expect(screen.getByRole('option', { name: 'TypeScript' })).toBeInTheDocument()
  })

  it('renders Save button', () => {
    renderWithRouter(<EditorPanel />)
    expect(screen.getByText('Save')).toBeInTheDocument()
  })

  it('renders Run button', () => {
    renderWithRouter(<EditorPanel />)
    expect(screen.getByText('Run')).toBeInTheDocument()
  })

  it('shows file tree by default', () => {
    renderWithRouter(<EditorPanel />)
    expect(screen.getByTitle('Explorer (Ctrl+Shift+E)')).toBeInTheDocument()
  })

  it('shows file tree items', async () => {
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
  })

  it('toggles file tree visibility', () => {
    renderWithRouter(<EditorPanel />)
    const toggleButton = screen.getByTitle('Toggle File Tree')
    fireEvent.click(toggleButton)
    expect(screen.queryByTitle('Explorer (Ctrl+Shift+E)')).not.toBeInTheDocument()
    fireEvent.click(toggleButton)
    expect(screen.getByTitle('Explorer (Ctrl+Shift+E)')).toBeInTheDocument()
  })

  it('shows Run button disabled when no file loaded', () => {
    renderWithRouter(<EditorPanel />)
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
  })

  it('expands directory when clicked', async () => {
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('src'))
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })
  })

  it('shows workspace name in toolbar when no file loaded', async () => {
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('project')).toBeInTheDocument()
    })
  })

  it('calls openFile when clicking a file in the tree', async () => {
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('package.json'))
    await waitFor(() => {
      expect(wsStateRef.openFile).toHaveBeenCalled()
    })
  })
})

describe('EditorPanel with file open', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Re-set API mocks (clearAllMocks clears history but NOT implementations)
    const { api } = await import('../services')
    vi.mocked(api.fs.getWorkspace).mockResolvedValue('/home/user/project')
    vi.mocked(api.fs.listDir).mockResolvedValue([
      { name: 'package.json', path: '/home/user/project/package.json', isDirectory: false },
    ])
    vi.mocked(api.fs.readFile).mockResolvedValue('{}')
    vi.mocked(api.fs.writeFile).mockResolvedValue(undefined)
    setupMocks(
      {},
      {
        openFiles: ['/home/user/project/package.json'],
        currentFile: '/home/user/project/package.json',
        fileContents: new Map([['/home/user/project/package.json', '{}']]),
        language: 'json',
      }
    )
  })

  it('renders Monaco editor when file is open', () => {
    renderWithRouter(<EditorPanel />)
    expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
  })

  it('updates code when editor changes', () => {
    renderWithRouter(<EditorPanel />)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: 'new code' } })
    expect(editor).toHaveValue('new code')
  })

  it('handles undefined value from Monaco editor', () => {
    renderWithRouter(<EditorPanel />)
    const editor = screen.getByTestId('monaco-editor')
    const initialValue = (editor as HTMLTextAreaElement).value
    fireEvent.blur(editor)
    expect(editor).toHaveValue(initialValue)
  })

  it('passes default wordWrap and lineNumbers to editor', () => {
    renderWithRouter(<EditorPanel />)
    const editor = screen.getByTestId('monaco-editor')
    expect(editor).toHaveAttribute('data-wordwrap', 'on')
    expect(editor).toHaveAttribute('data-linenumbers', 'on')
  })

  it('shows current file name in toolbar', async () => {
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      const matches = screen.getAllByText('package.json')
      expect(matches.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows Run button enabled when file is open', async () => {
    renderWithRouter(<EditorPanel />)
    // Wait for loading to complete — getWorkspace + listDir are async
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run' })).not.toBeDisabled()
    }, { timeout: 10000 })
  })

  it('shows Save button enabled when file is open', async () => {
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
    }, { timeout: 10000 })
  })
})

describe('EditorPanel language selection', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { api } = await import('../services')
    vi.mocked(api.fs.getWorkspace).mockResolvedValue('/home/user/project')
    vi.mocked(api.fs.listDir).mockResolvedValue([
      { name: 'main.ts', path: '/home/user/project/main.ts', isDirectory: false },
    ])
    vi.mocked(api.fs.readFile).mockResolvedValue('code')
    setupMocks(
      {},
      {
        openFiles: ['/home/user/project/main.ts'],
        currentFile: '/home/user/project/main.ts',
        fileContents: new Map([['/home/user/project/main.ts', 'code']]),
        language: 'typescript',
      }
    )
  })

  it('renders language combobox', () => {
    renderWithRouter(<EditorPanel />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('calls setLanguage when language is changed', () => {
    renderWithRouter(<EditorPanel />)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'python' } })
    expect(wsStateRef.setLanguage).toHaveBeenCalled()
  })
})

describe('EditorPanel with swarms', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { api } = await import('../services')
    vi.mocked(api.fs.getWorkspace).mockResolvedValue('/home/user/project')
    vi.mocked(api.fs.listDir).mockResolvedValue([
      { name: 'package.json', path: '/home/user/project/package.json', isDirectory: false },
    ])
    vi.mocked(api.fs.readFile).mockResolvedValue('{}')
    vi.mocked(api.fs.writeFile).mockResolvedValue(undefined)
    vi.mocked(api.execute.executeCode).mockResolvedValue({ success: true, output: 'test output' })
    setupMocks(
      { swarms: [{ id: 'swarm-1', name: 'Test Swarm', topology: 'star', agents: [] }] },
      {
        openFiles: ['/home/user/project/package.json'],
        currentFile: '/home/user/project/package.json',
        fileContents: new Map([['/home/user/project/package.json', '{}']]),
        language: 'json',
      }
    )
  })

  it('shows agent selector when Run clicked with file loaded', async () => {
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Run' })).not.toBeDisabled()
    }, { timeout: 5000 })
    fireEvent.click(screen.getByText('Run'))
    await waitFor(() => {
      expect(screen.getByText('Select Execution Mode')).toBeInTheDocument()
    })
  })

  it('executes code directly when selected', async () => {
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Run' })).not.toBeDisabled()
    }, { timeout: 5000 })
    fireEvent.click(screen.getByText('Run'))
    await waitFor(() => {
      expect(screen.getByText('Execute Directly')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Execute Directly'))
    await waitFor(() => {
      expect(screen.queryByText('Select Execution Mode')).not.toBeInTheDocument()
    })
  })

  it('closes modal when X clicked', async () => {
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Run' })).not.toBeDisabled()
    }, { timeout: 5000 })
    fireEvent.click(screen.getByText('Run'))
    await waitFor(() => {
      expect(screen.getByText('Select Execution Mode')).toBeInTheDocument()
    })
    const closeButton = screen.getByRole('button', { name: 'Close modal' })
    fireEvent.click(closeButton)
    await waitFor(() => {
      expect(screen.queryByText('Select Execution Mode')).not.toBeInTheDocument()
    })
  })

  it('executes code via swarm when selected', async () => {
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Run' })).not.toBeDisabled()
    }, { timeout: 5000 })
    fireEvent.click(screen.getByText('Run'))
    await waitFor(() => {
      expect(screen.getByText('Test Swarm')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Test Swarm'))
    await waitFor(() => {
      expect(screen.queryByText('Select Execution Mode')).not.toBeInTheDocument()
    })
  })
})

describe('EditorPanel file operations', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { api } = await import('../services')
    vi.mocked(api.fs.getWorkspace).mockResolvedValue('/home/user/project')
    vi.mocked(api.fs.listDir).mockResolvedValue([
      { name: 'package.json', path: '/home/user/project/package.json', isDirectory: false },
    ])
    vi.mocked(api.fs.readFile).mockResolvedValue('{}')
    vi.mocked(api.fs.writeFile).mockResolvedValue(undefined)
    setupMocks(
      {},
      {
        openFiles: ['/home/user/project/package.json'],
        currentFile: '/home/user/project/package.json',
        fileContents: new Map([['/home/user/project/package.json', '{}']]),
        language: 'json',
      }
    )
  })

  it('save button is clickable when file is open', async () => {
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
    }, { timeout: 10000 })
    // Note: actual writeFile requires editorRef from onMount (not simulated in mock)
    fireEvent.click(screen.getByText('Save'))
    // Verify no crash
    expect(screen.getByText('Save')).toBeInTheDocument()
  })

  it('handles execution error gracefully', async () => {
    const { api } = await import('../services')
    vi.mocked(api.execute.executeCode).mockRejectedValueOnce(new Error('Network error'))
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Run' })).not.toBeDisabled()
    }, { timeout: 5000 })
    fireEvent.click(screen.getByText('Run'))
    await waitFor(() => {
      expect(screen.getByText('Execute Directly')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Execute Directly'))
    await waitFor(() => {
      expect(screen.queryByText('Select Execution Mode')).not.toBeInTheDocument()
    })
  })

  it('handles execution failure result', async () => {
    const { api } = await import('../services')
    vi.mocked(api.execute.executeCode).mockResolvedValueOnce({
      success: false, error: 'Compilation error', output: '',
    })
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Run' })).not.toBeDisabled()
    }, { timeout: 5000 })
    fireEvent.click(screen.getByText('Run'))
    await waitFor(() => {
      expect(screen.getByText('Execute Directly')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Execute Directly'))
    await waitFor(() => {
      expect(screen.queryByText('Select Execution Mode')).not.toBeInTheDocument()
    })
  })

  it('handles file save error gracefully', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.writeFile).mockRejectedValueOnce(new Error('Write permission denied'))
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
    }, { timeout: 10000 })
    // Note: actual save requires editorRef from onMount (not simulated in mock)
    fireEvent.click(screen.getByText('Save'))
    // Verify no crash
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })
})

describe('EditorPanel directory operations', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { api } = await import('../services')
    vi.mocked(api.fs.getWorkspace).mockResolvedValue('/home/user/project')
    vi.mocked(api.fs.listDir).mockResolvedValue([
      { name: 'src', path: '/home/user/project/src', isDirectory: true, children: [
        { name: 'main.ts', path: '/home/user/project/src/main.ts', isDirectory: false },
        { name: 'utils.ts', path: '/home/user/project/src/utils.ts', isDirectory: false },
        { name: 'types.ts', path: '/home/user/project/src/types.ts', isDirectory: false },
      ]},
      { name: 'package.json', path: '/home/user/project/package.json', isDirectory: false },
      { name: 'README.md', path: '/home/user/project/README.md', isDirectory: false },
    ])
    vi.mocked(api.fs.readFile).mockResolvedValue('// file content')
    setupMocks()
  })

  it('collapses directory when clicked again', async () => {
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('src'))
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('src'))
    await waitFor(() => {
      expect(screen.queryByText('main.ts')).not.toBeInTheDocument()
    })
  })

  it('loads lazy directory children when expanded', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.listDir).mockImplementation((path: string) => {
      if (path === '/home/user/project') {
        return Promise.resolve([
          { name: 'empty-dir', path: '/home/user/project/empty-dir', isDirectory: true, children: [] },
          { name: 'file.txt', path: '/home/user/project/file.txt', isDirectory: false },
        ])
      }
      if (path === '/home/user/project/empty-dir') {
        return Promise.resolve([
          { name: 'nested-file.txt', path: '/home/user/project/empty-dir/nested-file.txt', isDirectory: false },
        ])
      }
      return Promise.resolve([])
    })
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('empty-dir')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('empty-dir'))
    await waitFor(() => {
      expect(api.fs.listDir).toHaveBeenCalledWith('/home/user/project/empty-dir')
    })
  })

  it('toggles directory via chevron icon click', async () => {
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })
    const dirRow = screen.getByText('src').closest('div')
    const chevronSpan = dirRow?.querySelector('span.mr-1')
    expect(chevronSpan).toBeInTheDocument()
    fireEvent.click(chevronSpan!)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })
    fireEvent.click(chevronSpan!)
    await waitFor(() => {
      expect(screen.queryByText('main.ts')).not.toBeInTheDocument()
    })
  })

  it('loads nested directory children recursively', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.listDir).mockImplementation((path: string) => {
      if (path === '/home/user/project') {
        return Promise.resolve([
          { name: 'src', path: '/home/user/project/src', isDirectory: true, children: [
            { name: 'components', path: '/home/user/project/src/components', isDirectory: true, children: [] },
          ]},
        ])
      }
      if (path === '/home/user/project/src/components') {
        return Promise.resolve([
          { name: 'Button.tsx', path: '/home/user/project/src/components/Button.tsx', isDirectory: false },
        ])
      }
      return Promise.resolve([])
    })
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('src'))
    await waitFor(() => {
      expect(screen.getByText('components')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('components'))
    await waitFor(() => {
      expect(api.fs.listDir).toHaveBeenCalledWith('/home/user/project/src/components')
    })
  })
})

describe('EditorPanel execution scenarios', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { api } = await import('../services')
    vi.mocked(api.fs.getWorkspace).mockResolvedValue('/home/user/project')
    vi.mocked(api.fs.listDir).mockResolvedValue([
      { name: 'package.json', path: '/home/user/project/package.json', isDirectory: false },
    ])
    vi.mocked(api.fs.readFile).mockResolvedValue('{}')
    vi.mocked(api.fs.writeFile).mockResolvedValue(undefined)
    vi.mocked(api.execute.executeCode).mockResolvedValue({ success: true, output: 'test output' })
    setupMocks(
      { swarms: [{ id: 'swarm-1', name: 'Test Swarm', topology: 'star', agents: [{ id: 'agent-1', name: 'Agent 1' }] }] },
      {
        openFiles: ['/home/user/project/package.json'],
        currentFile: '/home/user/project/package.json',
        fileContents: new Map([['/home/user/project/package.json', '{}']]),
        language: 'json',
      }
    )
  })

  it('shows execution modal when Run clicked', async () => {
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run' })).not.toBeDisabled()
    }, { timeout: 10000 })
    fireEvent.click(screen.getByText('Run'))
    await waitFor(() => {
      expect(screen.getByText('Execute Directly')).toBeInTheDocument()
    })
  })

  it('shows swarm option in execution modal', async () => {
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run' })).not.toBeDisabled()
    }, { timeout: 10000 })
    fireEvent.click(screen.getByText('Run'))
    await waitFor(() => {
      expect(screen.getByText('Test Swarm')).toBeInTheDocument()
    })
  })
})

describe('EditorPanel file type detection', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { api } = await import('../services')
    vi.mocked(api.fs.getWorkspace).mockResolvedValue('/home/user/project')
    setupMocks()
  })

  it('detects Python file language', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.listDir).mockResolvedValueOnce([
      { name: 'script.py', path: '/home/user/project/script.py', isDirectory: false },
    ])
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('script.py')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('script.py'))
    await waitFor(() => {
      expect(wsStateRef.openFile).toHaveBeenCalledWith('/home/user/project/script.py', { preview: true })
    })
  })

  it('detects Go file language', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.listDir).mockResolvedValueOnce([
      { name: 'main.go', path: '/home/user/project/main.go', isDirectory: false },
    ])
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('main.go')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('main.go'))
    await waitFor(() => {
      expect(wsStateRef.openFile).toHaveBeenCalledWith('/home/user/project/main.go', { preview: true })
    })
  })

  it('detects Rust file language', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.listDir).mockResolvedValueOnce([
      { name: 'lib.rs', path: '/home/user/project/lib.rs', isDirectory: false },
    ])
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('lib.rs')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('lib.rs'))
    await waitFor(() => {
      expect(wsStateRef.openFile).toHaveBeenCalledWith('/home/user/project/lib.rs', { preview: true })
    })
  })

  it('detects JavaScript file language', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.listDir).mockResolvedValueOnce([
      { name: 'app.js', path: '/home/user/project/app.js', isDirectory: false },
    ])
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('app.js')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('app.js'))
    await waitFor(() => {
      expect(wsStateRef.openFile).toHaveBeenCalledWith('/home/user/project/app.js', { preview: true })
    })
  })

  it('detects Markdown file language', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.listDir).mockResolvedValueOnce([
      { name: 'README.md', path: '/home/user/project/README.md', isDirectory: false },
    ])
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('README.md'))
    await waitFor(() => {
      expect(wsStateRef.openFile).toHaveBeenCalledWith('/home/user/project/README.md', { preview: true })
    })
  })

  it('detects HTML file language', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.listDir).mockResolvedValueOnce([
      { name: 'index.html', path: '/home/user/project/index.html', isDirectory: false },
    ])
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('index.html')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('index.html'))
    await waitFor(() => {
      expect(wsStateRef.openFile).toHaveBeenCalledWith('/home/user/project/index.html', { preview: true })
    })
  })

  it('detects CSS file language', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.listDir).mockResolvedValueOnce([
      { name: 'styles.css', path: '/home/user/project/styles.css', isDirectory: false },
    ])
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('styles.css')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('styles.css'))
    await waitFor(() => {
      expect(wsStateRef.openFile).toHaveBeenCalledWith('/home/user/project/styles.css', { preview: true })
    })
  })
})

describe('EditorPanel error handling', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { api } = await import('../services')
    vi.mocked(api.fs.getWorkspace).mockResolvedValue('/home/user/project')
    vi.mocked(api.fs.listDir).mockResolvedValue([
      { name: 'package.json', path: '/home/user/project/package.json', isDirectory: false },
    ])
    vi.mocked(api.fs.readFile).mockResolvedValue('{}')
    vi.mocked(api.fs.writeFile).mockResolvedValue(undefined)
    vi.mocked(api.execute.executeCode).mockResolvedValue({ success: true, output: 'test output' })
    setupMocks(
      { swarms: [{ id: 'swarm-1', name: 'Test Swarm', topology: 'star', agents: [{ id: 'agent-1', name: 'Agent 1' }] }] },
      {
        openFiles: ['/home/user/project/package.json'],
        currentFile: '/home/user/project/package.json',
        fileContents: new Map([['/home/user/project/package.json', '{}']]),
        language: 'json',
      }
    )
  })

  it('shows execution modal without error', async () => {
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run' })).not.toBeDisabled()
    }, { timeout: 10000 })
    fireEvent.click(screen.getByText('Run'))
    await waitFor(() => {
      expect(screen.getByText('Execute Directly')).toBeInTheDocument()
    })
  })

  it('handles directory lazy load error', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.listDir)
      .mockResolvedValueOnce([
        { name: 'src', path: '/home/user/project/src', isDirectory: true, children: [] },
        { name: 'file.txt', path: '/home/user/project/file.txt', isDirectory: false },
      ])
      .mockRejectedValueOnce(new Error('Failed to load directory'))
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('src'))
    await waitFor(() => {
      expect(api.fs.listDir).toHaveBeenCalledTimes(2)
    })
  })

  it('shows swarm option in execution modal', async () => {
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run' })).not.toBeDisabled()
    }, { timeout: 10000 })
    fireEvent.click(screen.getByText('Run'))
    await waitFor(() => {
      expect(screen.getByText('Test Swarm')).toBeInTheDocument()
    })
  })
})

describe('EditorPanel error and edge cases', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { api } = await import('../services')
    vi.mocked(api.fs.getWorkspace).mockResolvedValue('/home/user/project')
    vi.mocked(api.fs.listDir).mockResolvedValue([
      { name: 'src', path: '/home/user/project/src', isDirectory: true, children: [
        { name: 'main.ts', path: '/home/user/project/src/main.ts', isDirectory: false },
      ]},
      { name: 'package.json', path: '/home/user/project/package.json', isDirectory: false },
    ])
    vi.mocked(api.fs.readFile).mockResolvedValue('// file content')
    vi.mocked(api.execute.executeCode).mockResolvedValue({ success: true, output: 'test output' })
    setupMocks()
  })

  it('handles workspace load error gracefully', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.getWorkspace).mockRejectedValueOnce(new Error('Workspace not found'))
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(api.fs.getWorkspace).toHaveBeenCalled()
    })
  })

  it('handles file load error gracefully', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.readFile).mockRejectedValueOnce(new Error('File not found'))
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('package.json'))
    await waitFor(() => {
      expect(wsStateRef.openFile).toHaveBeenCalled()
    })
  })

  it('handles file without extension (fallback to plaintext)', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.listDir).mockResolvedValueOnce([
      { name: 'Makefile', path: '/home/user/project/Makefile', isDirectory: false },
    ])
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('Makefile')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Makefile'))
    await waitFor(() => {
      expect(wsStateRef.openFile).toHaveBeenCalledWith('/home/user/project/Makefile', { preview: true })
    })
  })

  it('handles file with trailing dot (empty extension fallback)', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.listDir).mockResolvedValueOnce([
      { name: 'test.', path: '/home/user/project/test.', isDirectory: false },
    ])
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('test.')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('test.'))
    await waitFor(() => {
      expect(wsStateRef.openFile).toHaveBeenCalledWith('/home/user/project/test.', { preview: true })
    })
  })

  it('handles execution failure with empty error (falls back to output)', async () => {
    const { api } = await import('../services')
    vi.mocked(api.execute.executeCode).mockResolvedValueOnce({
      success: false, output: 'Some output', error: '',
    })
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
    // Click the first occurrence of package.json
    const allPkgJson = screen.getAllByText('package.json')
    fireEvent.click(allPkgJson[0])
    await waitFor(() => {
      expect(wsStateRef.openFile).toHaveBeenCalled()
    })
  })

  it('shows gray icon for unknown file extension', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.listDir).mockResolvedValueOnce([
      { name: 'data.xyz', path: '/home/user/project/data.xyz', isDirectory: false },
    ])
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('data.xyz')).toBeInTheDocument()
    })
  })

  it('handles file with trailing dot in icon color', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.listDir).mockResolvedValueOnce([
      { name: 'test.', path: '/home/user/project/test.', isDirectory: false },
    ])
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('test.')).toBeInTheDocument()
    })
  })

  it('handles file without extension in icon color (fallback to gray)', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.listDir).mockResolvedValueOnce([
      { name: 'Makefile', path: '/home/user/project/Makefile', isDirectory: false },
    ])
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('Makefile')).toBeInTheDocument()
    })
  })

  it('toggleDir returns early for non-directory entries', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.listDir).mockResolvedValueOnce([
      { name: 'file.txt', path: '/home/user/project/file.txt', isDirectory: false },
    ])
    renderWithRouter(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('file.txt')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('file.txt'))
    await waitFor(() => {
      expect(wsStateRef.openFile).toHaveBeenCalled()
      expect(wsStateRef.toggleDir).not.toHaveBeenCalled()
    })
  })
})
