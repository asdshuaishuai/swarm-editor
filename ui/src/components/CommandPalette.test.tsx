import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CommandPalette } from './CommandPalette'
import { useAppStore } from '../store/appStore'
import { useWorkspaceStore } from '../stores/workspaceStore'

// Mock stores
const mockAppStore = {
  agents: [],
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
  fileTree: [],
  openFile: vi.fn().mockResolvedValue(undefined),
  mruOrder: [],
  workspacePath: '/test/workspace',
  currentFile: null,
  openFiles: [],
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
  getFileIcon: () => (props: any) => <svg {...props} data-testid="file-icon" />,
  getFileIconColor: () => 'text-text-secondary',
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('lucide-react', () => {
  const MockIcon = (_props: any) => null
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
  const mod: Record<string, any> = {}
  for (const name of icons) {
    mod[name] = MockIcon
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

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStores()
  })

  it('renders nothing when closed (default state)', () => {
    const { container } = render(<CommandPalette />)
    expect(container.innerHTML).toBe('')
  })

  it('opens on Ctrl+Shift+P', () => {
    render(<CommandPalette />)
    act(() => {
      fireEvent.keyDown(window, { key: 'P', ctrlKey: true, shiftKey: true })
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/command/i)).toBeInTheDocument()
  })

  it('closes on Escape', () => {
    render(<CommandPalette />)
    // Open first
    act(() => {
      fireEvent.keyDown(window, { key: 'P', ctrlKey: true, shiftKey: true })
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // Close
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on backdrop click', () => {
    render(<CommandPalette />)
    act(() => {
      fireEvent.keyDown(window, { key: 'P', ctrlKey: true, shiftKey: true })
    })
    const backdrop = screen.getByRole('presentation')
    fireEvent.click(backdrop)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('filters commands by query', () => {
    render(<CommandPalette />)
    act(() => {
      fireEvent.keyDown(window, { key: 'P', ctrlKey: true, shiftKey: true })
    })
    const input = screen.getByPlaceholderText(/command/i)
    fireEvent.change(input, { target: { value: 'Toggle Minimap' } })
    // Should show matching command
    expect(screen.getByText('Toggle Minimap')).toBeInTheDocument()
    // Should not show unrelated commands
    expect(screen.queryByText('Go to Editor')).toBeNull()
  })

  it('shows no results message for non-matching query', () => {
    render(<CommandPalette />)
    act(() => {
      fireEvent.keyDown(window, { key: 'P', ctrlKey: true, shiftKey: true })
    })
    const input = screen.getByPlaceholderText(/command/i)
    fireEvent.change(input, { target: { value: 'xyznonexistent' } })
    expect(screen.getByText(/No commands found/i)).toBeInTheDocument()
  })

  it('opens Quick Open mode on Ctrl+P', () => {
    render(<CommandPalette />)
    act(() => {
      fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Go to File/i)).toBeInTheDocument()
  })

  it('navigates items with arrow keys and selects with Enter', () => {
    render(<CommandPalette />)
    act(() => {
      fireEvent.keyDown(window, { key: 'P', ctrlKey: true, shiftKey: true })
    })
    // The first item should be selected by default; ArrowDown moves selection
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown' })
    })
    // Enter should close the palette (executing the selected action)
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
