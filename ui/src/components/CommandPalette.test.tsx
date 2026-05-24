import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CommandPalette } from './CommandPalette'
import { useAppStore } from '../store/appStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { lspApi } from '../services/lspApi'

// Mock stores
const mockAppStore = {
  agents: [] as Array<{ id: string; name: string; type: string; state: string }>,
  activeSwarm: null,
  setActiveSwarm: vi.fn(),
  startAgent: vi.fn(),
  stopAgent: vi.fn(),
  addToast: vi.fn(),
}

vi.mock('../store/appStore', () => ({
  useAppStore: vi.fn(),
}))

const mockWorkspaceStore = {
  fileTree: [] as Array<{ name: string; path: string; isDirectory: boolean; children?: unknown[] }>,
  openFile: vi.fn().mockResolvedValue(undefined),
  mruOrder: [] as string[],
  workspacePath: '/test/workspace',
  currentFile: null as string | null,
  openFiles: [] as string[],
}

vi.mock('../stores/workspaceStore', () => ({
  useWorkspaceStore: vi.fn(),
}))

vi.mock('../services', () => ({
  api: {
    swarm: {
      startSwarm: vi.fn().mockResolvedValue({ id: 's1', name: 'Test Swarm', topology: 'mesh', strategy: 'balanced', status: 'running', agents: [], stats: {} }),
      stopSwarm: vi.fn().mockResolvedValue({ id: 's1', name: 'Test Swarm', topology: 'mesh', strategy: 'balanced', status: 'idle', agents: [], stats: {} }),
    },
  },
  gitApi: {},
}))

vi.mock('../services/lspApi', () => ({
  lspApi: {
    documentSymbols: vi.fn().mockResolvedValue({ symbols: [] }),
    workspaceSymbols: vi.fn().mockResolvedValue({ symbols: [] }),
  },
}))

vi.mock('../utils', () => ({
  getFileIcon: () => (props: Record<string, unknown>) => <svg {...props} data-testid="file-icon" />,
  getFileIconColor: () => 'text-text-secondary',
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('lucide-react', () => {
  const icons = [
    'Search','FileCode','Users','Network','Settings','Plus','Play','Pause','Square',
    'Command','Code','Type','Hash','List','X','ChevronRight','ChevronDown','Pin',
    'AlertCircle','ArrowRight','ArrowLeft','ArrowUp','ArrowDown','RotateCcw','Files',
    'Keyboard','GitCompare','GitBranch','Upload','Download','Archive','Undo2','Braces',
    'AlignVerticalSpaceAround','Indent','Eye','Link','Save','Sun','Clipboard',
    'ClipboardCopy','Maximize','Minimize','XCircle','RefreshCw','FileDown','Lightbulb',
    'Zap','CaseSensitive','WholeWord','Regex','Replace','Columns','TextCursorInput',
    'Highlighter','StepForward','StepBack','ChevronsUpDown','Layers','Filter','Hexagon','Box',
  ]
  const mod: Record<string, () => null> = {}
  for (const name of icons) {
    mod[name] = () => null
  }
  return mod
})

// Helper to set up store mocks
function mockStores() {
  ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector?: (state: unknown) => unknown) =>
      selector ? selector(mockAppStore) : mockAppStore
  )
  ;(useWorkspaceStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector?: (state: unknown) => unknown) =>
      selector ? selector(mockWorkspaceStore) : mockWorkspaceStore
  )
}

function openCommandPalette() {
  act(() => {
    fireEvent.keyDown(window, { key: 'P', ctrlKey: true, shiftKey: true })
  })
}

function openQuickOpen() {
  act(() => {
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
  })
}

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStores()
    mockWorkspaceStore.fileTree = []
    mockWorkspaceStore.mruOrder = []
    mockWorkspaceStore.workspacePath = '/test/workspace'
    mockWorkspaceStore.currentFile = null
    mockWorkspaceStore.openFiles = []
    mockAppStore.agents = []
  })

  // --- Default rendering ---

  it('renders nothing when closed (default state)', () => {
    const { container } = render(<CommandPalette />)
    expect(container.innerHTML).toBe('')
  })

  // --- Opening with keyboard shortcuts ---

  it('opens on Ctrl+Shift+P', () => {
    render(<CommandPalette />)
    openCommandPalette()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Type a command/i)).toBeInTheDocument()
  })

  it('opens Quick Open mode on Ctrl+P', () => {
    render(<CommandPalette />)
    openQuickOpen()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Go to File/i)).toBeInTheDocument()
  })

  it('opens with meta key instead of ctrl', () => {
    render(<CommandPalette />)
    act(() => {
      fireEvent.keyDown(window, { key: 'P', metaKey: true, shiftKey: true })
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('opens Quick Open with meta key', () => {
    render(<CommandPalette />)
    act(() => {
      fireEvent.keyDown(window, { key: 'p', metaKey: true })
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  // --- Closing ---

  it('closes on Escape', () => {
    render(<CommandPalette />)
    openCommandPalette()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on backdrop click', () => {
    render(<CommandPalette />)
    openCommandPalette()
    const backdrop = screen.getByRole('presentation')
    fireEvent.click(backdrop)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  // --- Mode switching when already open ---

  it('switches from Quick Open to command mode on Ctrl+Shift+P', () => {
    render(<CommandPalette />)
    openQuickOpen()
    expect(screen.getByPlaceholderText(/Go to File/i)).toBeInTheDocument()
    act(() => {
      fireEvent.keyDown(window, { key: 'P', ctrlKey: true, shiftKey: true })
    })
    expect(screen.getByPlaceholderText(/Type a command/i)).toBeInTheDocument()
  })

  it('closes when pressing Ctrl+Shift+P in command mode', () => {
    render(<CommandPalette />)
    openCommandPalette()
    act(() => {
      fireEvent.keyDown(window, { key: 'P', ctrlKey: true, shiftKey: true })
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes when pressing Ctrl+P in Quick Open mode', () => {
    render(<CommandPalette />)
    openQuickOpen()
    act(() => {
      fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('switches from command mode to Quick Open on Ctrl+P', () => {
    render(<CommandPalette />)
    openCommandPalette()
    act(() => {
      fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    })
    expect(screen.getByPlaceholderText(/Go to File/i)).toBeInTheDocument()
  })

  // --- Command filtering ---

  it('filters commands by query', () => {
    render(<CommandPalette />)
    openCommandPalette()
    const input = screen.getByPlaceholderText(/Type a command/i)
    fireEvent.change(input, { target: { value: 'Toggle Minimap' } })
    expect(screen.getByText('Toggle Minimap')).toBeInTheDocument()
    expect(screen.queryByText('Go to Editor')).toBeNull()
  })

  it('shows no results message for non-matching query', () => {
    render(<CommandPalette />)
    openCommandPalette()
    const input = screen.getByPlaceholderText(/Type a command/i)
    fireEvent.change(input, { target: { value: 'xyznonexistent' } })
    expect(screen.getByText(/No commands found/i)).toBeInTheDocument()
  })

  it('shows all commands when query is empty in command mode', () => {
    render(<CommandPalette />)
    openCommandPalette()
    const items = screen.getByRole('dialog').querySelectorAll('.cursor-pointer')
    expect(items.length).toBeGreaterThan(10)
  })

  it('shows all commands when ">" prefix with no search term', () => {
    render(<CommandPalette />)
    openCommandPalette()
    const input = screen.getByPlaceholderText(/Type a command/i)
    fireEvent.change(input, { target: { value: '>' } })
    const items = screen.getByRole('dialog').querySelectorAll('.cursor-pointer')
    expect(items.length).toBeGreaterThan(10)
  })

  it('filters commands with ">" prefix', () => {
    render(<CommandPalette />)
    openCommandPalette()
    const input = screen.getByPlaceholderText(/Type a command/i)
    fireEvent.change(input, { target: { value: '>Toggle Minimap' } })
    expect(screen.getByText('Toggle Minimap')).toBeInTheDocument()
  })

  // --- Quick Open file mode ---

  it('shows no matching files when file tree is empty', () => {
    render(<CommandPalette />)
    openQuickOpen()
    expect(screen.getByText(/No matching files/i)).toBeInTheDocument()
  })

  it('shows recently opened files when Quick Open with no query', () => {
    mockWorkspaceStore.mruOrder = ['/test/workspace/file1.ts', '/test/workspace/file2.ts']
    mockWorkspaceStore.fileTree = [
      { name: 'file1.ts', path: '/test/workspace/file1.ts', isDirectory: false },
      { name: 'file2.ts', path: '/test/workspace/file2.ts', isDirectory: false },
    ]
    render(<CommandPalette />)
    openQuickOpen()
    expect(screen.getByText('recently opened')).toBeInTheDocument()
    const items = screen.getByRole('dialog').querySelectorAll('.cursor-pointer')
    expect(items.length).toBe(2)
  })

  it('filters files by fuzzy match in Quick Open', () => {
    mockWorkspaceStore.fileTree = [
      { name: 'app.tsx', path: '/test/workspace/app.tsx', isDirectory: false },
      { name: 'utils.ts', path: '/test/workspace/utils.ts', isDirectory: false },
      { name: 'index.ts', path: '/test/workspace/index.ts', isDirectory: false },
    ]
    mockWorkspaceStore.mruOrder = []
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByPlaceholderText(/Go to File/i)
    fireEvent.change(input, { target: { value: 'app' } })
    // Text is split across spans for fuzzy highlighting, use container query
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('app.tsx')
    expect(dialog.textContent).not.toContain('utils.ts')
  })

  it('flattens nested directory file tree', () => {
    mockWorkspaceStore.fileTree = [
      {
        name: 'src',
        path: '/test/workspace/src',
        isDirectory: true,
        children: [
          { name: 'main.ts', path: '/test/workspace/src/main.ts', isDirectory: false },
        ],
      },
      { name: 'root.txt', path: '/test/workspace/root.txt', isDirectory: false },
    ]
    mockWorkspaceStore.mruOrder = []
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByPlaceholderText(/Go to File/i)
    fireEvent.change(input, { target: { value: 'main' } })
    // Text is split across spans for fuzzy highlighting
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('main.ts')
  })

  it('opens file on clicking a file item', () => {
    mockWorkspaceStore.fileTree = [
      { name: 'test.ts', path: '/test/workspace/test.ts', isDirectory: false },
    ]
    mockWorkspaceStore.mruOrder = []
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByPlaceholderText(/Go to File/i)
    fireEvent.change(input, { target: { value: 'test' } })
    // Click the first cursor-pointer item (the file item)
    const item = screen.getByRole('dialog').querySelector('.cursor-pointer')!
    fireEvent.click(item)
    expect(mockWorkspaceStore.openFile).toHaveBeenCalledWith('/test/workspace/test.ts')
  })

  it('shows relative path stripping workspace prefix', () => {
    mockWorkspaceStore.workspacePath = '/test/workspace'
    mockWorkspaceStore.fileTree = [
      { name: 'app.tsx', path: '/test/workspace/src/app.tsx', isDirectory: false },
    ]
    mockWorkspaceStore.mruOrder = []
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByPlaceholderText(/Go to File/i)
    fireEvent.change(input, { target: { value: 'app' } })
    const dialog = screen.getByRole('dialog')
    // Description should show relative path (stripped prefix)
    expect(dialog.textContent).toContain('src/app.tsx')
  })

  // --- Keyboard navigation ---

  it('navigates items with ArrowDown', () => {
    render(<CommandPalette />)
    openCommandPalette()
    const items = screen.getByRole('dialog').querySelectorAll('.cursor-pointer')
    expect(items[0]).toHaveClass('bg-accent/20')
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown' })
    })
    expect(items[1]).toHaveClass('bg-accent/20')
  })

  it('wraps from last to first on ArrowDown', () => {
    render(<CommandPalette />)
    openCommandPalette()
    const items = screen.getByRole('dialog').querySelectorAll('.cursor-pointer')
    // Go to last item with ArrowUp
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp' })
    })
    const lastItem = items[items.length - 1]
    expect(lastItem).toHaveClass('bg-accent/20')
    // ArrowDown from last wraps to first
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown' })
    })
    expect(items[0]).toHaveClass('bg-accent/20')
  })

  it('navigates items with ArrowUp and wraps to end', () => {
    render(<CommandPalette />)
    openCommandPalette()
    const items = screen.getByRole('dialog').querySelectorAll('.cursor-pointer')
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp' })
    })
    const lastItem = items[items.length - 1]
    expect(lastItem).toHaveClass('bg-accent/20')
  })

  it('executes selected command on Enter', () => {
    render(<CommandPalette />)
    openCommandPalette()
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('clicks on a menu item executes action and closes', () => {
    render(<CommandPalette />)
    openCommandPalette()
    const items = screen.getByRole('dialog').querySelectorAll('.cursor-pointer')
    fireEvent.click(items[0])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  // --- Go to Line mode ---

  it('opens Go to Line mode on open-goto-line event', () => {
    render(<CommandPalette />)
    act(() => {
      window.dispatchEvent(new Event('open-goto-line'))
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // Query starts with ':', so isGoToLine requires length > 1, initially just ':'
    // So placeholder falls through to isQuickOpen -> 'Go to File...'
    expect(screen.getByPlaceholderText(/Go to File/i)).toBeInTheDocument()
  })

  it('shows Go to Line placeholder when typing :NNN', () => {
    render(<CommandPalette />)
    act(() => {
      window.dispatchEvent(new Event('open-goto-line'))
    })
    const input = screen.getByRole('dialog').querySelector('input')!
    // Type a number after the ':' prefix
    fireEvent.change(input, { target: { value: ':42' } })
    expect(screen.getByPlaceholderText(/Go to Line/i)).toBeInTheDocument()
  })

  it('shows Go to Line info text when :NNN is entered', () => {
    render(<CommandPalette />)
    act(() => {
      window.dispatchEvent(new Event('open-goto-line'))
    })
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: ':42' } })
    expect(screen.getByText('Go to Line 42')).toBeInTheDocument()
    expect(screen.getByText('Press Enter to jump')).toBeInTheDocument()
  })

  it('dispatches goto-line-direct on Enter with :NNN', () => {
    const listener = vi.fn()
    document.addEventListener('goto-line-direct', listener)
    render(<CommandPalette />)
    act(() => {
      window.dispatchEvent(new Event('open-goto-line'))
    })
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: ':42' } })
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    expect(listener).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    document.removeEventListener('goto-line-direct', listener)
  })

  it('does nothing on Enter with invalid line number', () => {
    const listener = vi.fn()
    document.addEventListener('goto-line-direct', listener)
    render(<CommandPalette />)
    act(() => {
      window.dispatchEvent(new Event('open-goto-line'))
    })
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: ':abc' } })
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    expect(listener).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    document.removeEventListener('goto-line-direct', listener)
  })

  it('does nothing on Enter with :0 (zero line)', () => {
    const listener = vi.fn()
    document.addEventListener('goto-line-direct', listener)
    render(<CommandPalette />)
    act(() => {
      window.dispatchEvent(new Event('open-goto-line'))
    })
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: ':0' } })
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    expect(listener).not.toHaveBeenCalled()
    document.removeEventListener('goto-line-direct', listener)
  })

  it('shows commands matching : in quick open with : prefix', () => {
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByPlaceholderText(/Go to File/i)
    fireEvent.change(input, { target: { value: ':' } })
    // With just :, isFileMode=false, isCommandMode=false, hasReservedPrefix=true
    // So commands are filtered with query ':', which fuzzy-matches "Git:" commands
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('Git: Push')
  })

  // --- Go to Symbol mode (@) ---

  it('executes Go to Symbol in File command (closes palette)', async () => {
    render(<CommandPalette />)
    openCommandPalette()
    const input = screen.getByPlaceholderText(/Type a command/i)
    fireEvent.change(input, { target: { value: 'Go to Symbol in File' } })
    // Clicking a command item always closes the palette
    // The action runs but the click handler also closes
    fireEvent.click(screen.getByText('Go to Symbol in File...'))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('fetches document symbols when in symbol mode with current file', async () => {
    mockWorkspaceStore.currentFile = '/test/workspace/app.tsx'
    vi.mocked(lspApi.documentSymbols).mockResolvedValue({
      symbols: [
        {
          name: 'MyComponent',
          kind: 5,
          range: { start: { line: 10, character: 0 }, end: { line: 10, character: 0 } }, selectionRange: { start: { line: 10, character: 0 }, end: { line: 10, character: 0 } },
          children: [
            { name: 'render', kind: 6, range: { start: { line: 15, character: 4 }, end: { line: 15, character: 4 } }, selectionRange: { start: { line: 15, character: 4 }, end: { line: 15, character: 4 } } },
          ],
        },
      ],
    })
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: '@' } })

    await waitFor(() => {
      expect(lspApi.documentSymbols).toHaveBeenCalledWith('/test/workspace/app.tsx')
    })
    await waitFor(() => {
      expect(screen.getByText('MyComponent')).toBeInTheDocument()
      expect(screen.getByText('render')).toBeInTheDocument()
    })
  })

  it('shows Open a file first when no current file in symbol mode', () => {
    mockWorkspaceStore.currentFile = null
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: '@' } })
    expect(screen.getByText('Open a file first')).toBeInTheDocument()
  })

  it('shows No symbols found when symbols array is empty', async () => {
    mockWorkspaceStore.currentFile = '/test/workspace/app.tsx'
    vi.mocked(lspApi.documentSymbols).mockResolvedValue({ symbols: [] })
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: '@' } })

    await waitFor(() => {
      expect(lspApi.documentSymbols).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(screen.getByText('No symbols found')).toBeInTheDocument()
    })
  })

  it('shows Loading symbols while fetching', async () => {
    mockWorkspaceStore.currentFile = '/test/workspace/app.tsx'
    let resolveSymbols: (value: { symbols: import('../services/lspApi').DocumentSymbol[] }) => void
    vi.mocked(lspApi.documentSymbols).mockReturnValue(new Promise((resolve) => {
      resolveSymbols = resolve
    }))
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: '@' } })

    await waitFor(() => {
      expect(screen.getByText('Loading symbols...')).toBeInTheDocument()
    })
    resolveSymbols!({ symbols: [] })
  })

  it('filters symbols by search term after @', async () => {
    mockWorkspaceStore.currentFile = '/test/workspace/app.tsx'
    vi.mocked(lspApi.documentSymbols).mockResolvedValue({
      symbols: [
        { name: 'MyComponent', kind: 5, range: { start: { line: 10, character: 0 }, end: { line: 10, character: 0 } }, selectionRange: { start: { line: 10, character: 0 }, end: { line: 10, character: 0 } } },
        { name: 'helper', kind: 12, range: { start: { line: 20, character: 0 }, end: { line: 20, character: 0 } }, selectionRange: { start: { line: 20, character: 0 }, end: { line: 20, character: 0 } } },
      ],
    })
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: '@comp' } })

    await waitFor(() => {
      expect(screen.getByText('MyComponent')).toBeInTheDocument()
      expect(screen.queryByText('helper')).toBeNull()
    })
  })

  it('dispatches goto-line-direct on symbol click', async () => {
    mockWorkspaceStore.currentFile = '/test/workspace/app.tsx'
    vi.mocked(lspApi.documentSymbols).mockResolvedValue({
      symbols: [
        { name: 'MyFunc', kind: 12, range: { start: { line: 5, character: 0 }, end: { line: 5, character: 0 } }, selectionRange: { start: { line: 5, character: 0 }, end: { line: 5, character: 0 } } },
      ],
    })
    const listener = vi.fn()
    document.addEventListener('goto-line-direct', listener)
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: '@' } })

    await waitFor(() => {
      expect(screen.getByText('MyFunc')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('MyFunc'))
    expect(listener).toHaveBeenCalled()
    document.removeEventListener('goto-line-direct', listener)
  })

  it('handles document symbols API error gracefully', async () => {
    mockWorkspaceStore.currentFile = '/test/workspace/app.tsx'
    vi.mocked(lspApi.documentSymbols).mockRejectedValue(new Error('LSP error'))
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: '@' } })

    await waitFor(() => {
      expect(screen.getByText('No symbols found')).toBeInTheDocument()
    })
  })

  it('cancels document symbols request when mode changes', async () => {
    mockWorkspaceStore.currentFile = '/test/workspace/app.tsx'
    let resolveSymbols: (value: { symbols: import('../services/lspApi').DocumentSymbol[] }) => void
    vi.mocked(lspApi.documentSymbols).mockReturnValue(new Promise((resolve) => {
      resolveSymbols = resolve
    }))
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: '@' } })
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    // Resolve later — should not cause issues (cancelled)
    resolveSymbols!({ symbols: [] })
  })

  // --- Go to Workspace Symbol mode (#) ---

  it('executes Go to Symbol in Workspace command (closes palette)', async () => {
    render(<CommandPalette />)
    openCommandPalette()
    const input = screen.getByPlaceholderText(/Type a command/i)
    fireEvent.change(input, { target: { value: 'Go to Symbol in Workspace' } })
    fireEvent.click(screen.getByText('Go to Symbol in Workspace...'))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('shows Type to search workspace symbols in # mode with empty search', () => {
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: '#' } })
    expect(screen.getByText('Type to search workspace symbols')).toBeInTheDocument()
  })

  it('fetches workspace symbols when typing after #', async () => {
    vi.mocked(lspApi.workspaceSymbols).mockResolvedValue({
      symbols: [
        {
          name: 'WorkspaceClass',
          kind: 5,
          location: { uri: 'file:///test/workspace/app.tsx', range: { start: { line: 3, character: 0 }, end: { line: 3, character: 0 } } },
        },
      ],
    })
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: '#Work' } })

    await waitFor(() => {
      expect(lspApi.workspaceSymbols).toHaveBeenCalledWith('Work')
    })
    await waitFor(() => {
      expect(screen.getByText('WorkspaceClass')).toBeInTheDocument()
    })
  })

  it('shows Searching workspace symbols while loading', async () => {
    let resolveWs: (value: { symbols: import('../services/lspApi').WorkspaceSymbol[] }) => void
    vi.mocked(lspApi.workspaceSymbols).mockReturnValue(new Promise((resolve) => {
      resolveWs = resolve
    }))
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: '#test' } })

    await waitFor(() => {
      expect(screen.getByText('Searching workspace symbols...')).toBeInTheDocument()
    })
    resolveWs!({ symbols: [] })
  })

  it('handles workspace symbols API error gracefully', async () => {
    vi.mocked(lspApi.workspaceSymbols).mockRejectedValue(new Error('WS error'))
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: '#test' } })

    await waitFor(() => {
      expect(screen.getByText('No symbols found')).toBeInTheDocument()
    })
  })

  it('opens file and dispatches goto-line on workspace symbol click', async () => {
    vi.mocked(lspApi.workspaceSymbols).mockResolvedValue({
      symbols: [
        {
          name: 'MyClass',
          kind: 5,
          location: { uri: 'file:///test/workspace/app.tsx', range: { start: { line: 10, character: 0 }, end: { line: 10, character: 0 } } },
        },
      ],
    })
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: '#My' } })

    await waitFor(() => {
      expect(screen.getByText('MyClass')).toBeInTheDocument()
    })
    const listener = vi.fn()
    document.addEventListener('goto-line-direct', listener)
    fireEvent.click(screen.getByText('MyClass'))
    expect(mockWorkspaceStore.openFile).toHaveBeenCalled()
    await waitFor(() => {
      expect(listener).toHaveBeenCalled()
    })
    document.removeEventListener('goto-line-direct', listener)
  })

  it('shows workspace symbol file path in description', async () => {
    vi.mocked(lspApi.workspaceSymbols).mockResolvedValue({
      symbols: [
        {
          name: 'SomeFunc',
          kind: 12,
          location: { uri: 'file:///test/project/utils.ts', range: { start: { line: 5, character: 0 }, end: { line: 5, character: 0 } } },
        },
      ],
    })
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: '#Some' } })

    await waitFor(() => {
      expect(screen.getByText('SomeFunc')).toBeInTheDocument()
      // Description shows file name and line
      expect(screen.getByText(/utils.ts.*Line 6/)).toBeInTheDocument()
    })
  })

  it('cancels workspace symbols request when mode changes', async () => {
    let resolveWs: (value: { symbols: import('../services/lspApi').WorkspaceSymbol[] }) => void
    vi.mocked(lspApi.workspaceSymbols).mockReturnValue(new Promise((resolve) => {
      resolveWs = resolve
    }))
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: '#test' } })
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    resolveWs!({ symbols: [] })
  })

  // --- open-quick-open event ---

  it('opens Quick Open on open-quick-open event', () => {
    render(<CommandPalette />)
    act(() => {
      window.dispatchEvent(new Event('open-quick-open'))
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Go to File/i)).toBeInTheDocument()
  })

  // --- Selection reset on filter change ---

  it('resets selected index when filtered results change', () => {
    render(<CommandPalette />)
    openCommandPalette()
    const input = screen.getByPlaceholderText(/Type a command/i)
    fireEvent.change(input, { target: { value: 'Toggle' } })
    const items = screen.getByRole('dialog').querySelectorAll('.cursor-pointer')
    expect(items[0]).toHaveClass('bg-accent/20')
  })

  // --- Footer ---

  it('shows keyboard hints in footer', () => {
    render(<CommandPalette />)
    openCommandPalette()
    expect(screen.getByText('Navigate')).toBeInTheDocument()
    expect(screen.getByText('Select')).toBeInTheDocument()
    expect(screen.getByText('Close')).toBeInTheDocument()
  })

  it('shows Commands label in footer when in Quick Open mode', () => {
    render(<CommandPalette />)
    openQuickOpen()
    // In Quick Open mode, the right side of footer shows "Commands"
    const allCommands = screen.getAllByText('Commands')
    expect(allCommands.length).toBeGreaterThanOrEqual(1)
  })

  it('shows Toggle label in footer when in command mode', () => {
    render(<CommandPalette />)
    openCommandPalette()
    expect(screen.getByText('Toggle')).toBeInTheDocument()
  })

  it('shows > Commands shortcut in footer in Quick Open mode', () => {
    render(<CommandPalette />)
    openQuickOpen()
    const dialog = screen.getByRole('dialog')
    const footer = dialog.querySelector('.border-t')
    expect(footer).toBeInTheDocument()
    // The > Commands hint is visible in non-command mode
    expect(footer!.textContent).toContain('Commands')
  })

  // --- Placeholder text variations ---

  it('shows correct placeholder in symbol mode', () => {
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: '@' } })
    expect(screen.getByPlaceholderText(/symbol/i)).toBeInTheDocument()
  })

  it('shows correct placeholder when # with search text', async () => {
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByRole('dialog').querySelector('input')!
    await act(async () => {
      fireEvent.change(input, { target: { value: '#My' } })
    })
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Symbol in Workspace/i)).toBeInTheDocument()
    })
  })

  // --- Fuzzy matching edge cases ---

  it('fuzzy matches by file path not just name', () => {
    mockWorkspaceStore.fileTree = [
      { name: 'app.tsx', path: '/test/workspace/components/app.tsx', isDirectory: false },
      { name: 'app.tsx', path: '/test/workspace/pages/app.tsx', isDirectory: false },
    ]
    mockWorkspaceStore.mruOrder = []
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByPlaceholderText(/Go to File/i)
    fireEvent.change(input, { target: { value: 'comp' } })
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('app.tsx')
    // Should show the one in components/
    expect(dialog.textContent).toContain('components/app.tsx')
  })

  it('shows no results message in file mode with non-matching query', () => {
    mockWorkspaceStore.fileTree = [
      { name: 'app.tsx', path: '/test/workspace/app.tsx', isDirectory: false },
    ]
    mockWorkspaceStore.mruOrder = []
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByPlaceholderText(/Go to File/i)
    fireEvent.change(input, { target: { value: 'zzzz' } })
    expect(screen.getByText(/No matching files/i)).toBeInTheDocument()
  })

  // --- Symbol kind icons ---

  it('renders symbols with different kinds', async () => {
    mockWorkspaceStore.currentFile = '/test/workspace/app.tsx'
    vi.mocked(lspApi.documentSymbols).mockResolvedValue({
      symbols: [
        { name: 'MyClass', kind: 5, range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, selectionRange: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } } },
        { name: 'myFunc', kind: 12, range: { start: { line: 5, character: 0 }, end: { line: 5, character: 0 } }, selectionRange: { start: { line: 5, character: 0 }, end: { line: 5, character: 0 } } },
        { name: 'myVar', kind: 13, range: { start: { line: 10, character: 0 }, end: { line: 10, character: 0 } }, selectionRange: { start: { line: 10, character: 0 }, end: { line: 10, character: 0 } } },
        { name: 'MY_CONST', kind: 14, range: { start: { line: 15, character: 0 }, end: { line: 15, character: 0 } }, selectionRange: { start: { line: 15, character: 0 }, end: { line: 15, character: 0 } } },
        { name: 'MyEnum', kind: 10, range: { start: { line: 20, character: 0 }, end: { line: 20, character: 0 } }, selectionRange: { start: { line: 20, character: 0 }, end: { line: 20, character: 0 } } },
        { name: 'MyStruct', kind: 23, range: { start: { line: 25, character: 0 }, end: { line: 25, character: 0 } }, selectionRange: { start: { line: 25, character: 0 }, end: { line: 25, character: 0 } } },
        { name: 'Unknown', kind: 99, range: { start: { line: 30, character: 0 }, end: { line: 30, character: 0 } }, selectionRange: { start: { line: 30, character: 0 }, end: { line: 30, character: 0 } } },
      ],
    })
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: '@' } })

    await waitFor(() => {
      expect(screen.getByText('MyClass')).toBeInTheDocument()
      expect(screen.getByText('myFunc')).toBeInTheDocument()
      expect(screen.getByText('myVar')).toBeInTheDocument()
      expect(screen.getByText('MY_CONST')).toBeInTheDocument()
      expect(screen.getByText('MyEnum')).toBeInTheDocument()
      expect(screen.getByText('MyStruct')).toBeInTheDocument()
      expect(screen.getByText('Unknown')).toBeInTheDocument()
    })
  })

  it('shows symbol line number in description', async () => {
    mockWorkspaceStore.currentFile = '/test/workspace/app.tsx'
    vi.mocked(lspApi.documentSymbols).mockResolvedValue({
      symbols: [
        { name: 'MyFunc', kind: 12, range: { start: { line: 5, character: 0 }, end: { line: 5, character: 0 } }, selectionRange: { start: { line: 5, character: 0 }, end: { line: 5, character: 0 } } },
      ],
    })
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: '@' } })

    await waitFor(() => {
      expect(screen.getByText('Line 6')).toBeInTheDocument()
    })
  })

  it('shows symbol detail in description when available', async () => {
    mockWorkspaceStore.currentFile = '/test/workspace/app.tsx'
    vi.mocked(lspApi.documentSymbols).mockResolvedValue({
      symbols: [
        { name: 'MyFunc', kind: 12, detail: '(param: string): void', range: { start: { line: 5, character: 0 }, end: { line: 5, character: 0 } }, selectionRange: { start: { line: 5, character: 0 }, end: { line: 5, character: 0 } } },
      ],
    })
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: '@' } })

    await waitFor(() => {
      expect(screen.getByText('(param: string): void')).toBeInTheDocument()
    })
  })

  // --- Dialog props ---

  it('dialog has aria-modal=true', () => {
    render(<CommandPalette />)
    openCommandPalette()
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
  })

  it('dialog has aria-label', () => {
    render(<CommandPalette />)
    openCommandPalette()
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Command palette')
  })

  // --- ESC key label ---

  it('shows ESC keyboard shortcut in search bar', () => {
    render(<CommandPalette />)
    openCommandPalette()
    expect(screen.getByText('ESC')).toBeInTheDocument()
  })

  // --- Shortcut display in items ---

  it('shows shortcut for commands that have one', () => {
    render(<CommandPalette />)
    openCommandPalette()
    const input = screen.getByPlaceholderText(/Type a command/i)
    fireEvent.change(input, { target: { value: 'Go to Settings' } })
    expect(screen.getByText('Ctrl+,')).toBeInTheDocument()
  })

  // --- Multiple Enter presses ---

  it('does nothing on Enter with no selected item (empty results)', () => {
    render(<CommandPalette />)
    openCommandPalette()
    const input = screen.getByPlaceholderText(/Type a command/i)
    fireEvent.change(input, { target: { value: 'zzzznothing' } })
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  // --- Agent commands ---

  it('shows agent commands when agents exist', () => {
    mockAppStore.agents = [
      { id: 'agent1', name: 'TestAgent', type: 'test', state: 'idle' },
    ]
    render(<CommandPalette />)
    openCommandPalette()
    const input = screen.getByPlaceholderText(/Type a command/i)
    fireEvent.change(input, { target: { value: 'Start Agent' } })
    expect(screen.getByText(/Start Agent: TestAgent/)).toBeInTheDocument()
  })

  // --- Multiple key presses ignored when closed ---

  it('ignores arrow keys when palette is closed', () => {
    render(<CommandPalette />)
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown' })
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('ignores Enter when palette is closed', () => {
    render(<CommandPalette />)
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('ignores Escape when palette is closed', () => {
    render(<CommandPalette />)
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  // --- Workspace symbol with no URI ---

  it('shows Line only for workspace symbol without uri', async () => {
    vi.mocked(lspApi.workspaceSymbols).mockResolvedValue({
      symbols: [
        {
          name: 'NoUriSymbol',
          kind: 12,
          location: { uri: '', range: { start: { line: 3, character: 0 }, end: { line: 3, character: 0 } } },
        },
      ],
    })
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: '#No' } })

    await waitFor(() => {
      expect(screen.getByText('NoUriSymbol')).toBeInTheDocument()
      expect(screen.getByText('Line 4')).toBeInTheDocument()
    })
  })

  // --- Fuzzy highlight rendering ---

  it('renders highlighted fuzzy matches in file names', () => {
    mockWorkspaceStore.fileTree = [
      { name: 'app.tsx', path: '/test/workspace/app.tsx', isDirectory: false },
    ]
    mockWorkspaceStore.mruOrder = []
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByPlaceholderText(/Go to File/i)
    fireEvent.change(input, { target: { value: 'ap' } })
    // Fuzzy match highlights should create accent spans
    const dialog = screen.getByRole('dialog')
    const accentSpans = dialog.querySelectorAll('.text-accent.font-semibold')
    expect(accentSpans.length).toBeGreaterThan(0)
  })

  // --- Symbols are available hint ---

  it('shows Symbols are available hint when no file is open', () => {
    mockWorkspaceStore.currentFile = null
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: '@' } })
    expect(screen.getByText('Symbols are available for the active file')).toBeInTheDocument()
  })

  // --- Search across all files hint ---

  it('shows workspace search hint in workspace symbol mode', () => {
    render(<CommandPalette />)
    openQuickOpen()
    const input = screen.getByRole('dialog').querySelector('input')!
    fireEvent.change(input, { target: { value: '#' } })
    expect(screen.getByText('Search across all files in the workspace')).toBeInTheDocument()
  })
})
