import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { SearchPanel } from './SearchPanel'

const mockSearchContent = vi.fn().mockResolvedValue([])
const mockReplaceContent = vi.fn().mockResolvedValue({ changedFiles: 0 })
const mockNavigate = vi.fn()

// Mock the services barrel
vi.mock('../services', () => ({
  api: {
    fs: {
      searchContent: (...args: unknown[]) => mockSearchContent(...args),
      replaceContent: (...args: unknown[]) => mockReplaceContent(...args),
    },
  },
  agentApi: {},
  swarmApi: {},
  teamApi: {},
  mcpApi: {},
  backendApi: {},
  events: {},
  lspApi: {},
  getWebSocketClient: {},
  initializeWebSocket: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../utils', () => ({
  getFileIcon: () => 'svg',
  getFileIconColor: () => 'text-blue-400',
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('lucide-react', () => ({
  Search: () => 'svg',
  X: () => 'svg',
  ChevronRight: () => 'svg',
  Loader2: () => 'svg',
  Replace: () => 'svg',
  Check: () => 'svg',
  Clock: () => 'svg',
  Filter: () => 'svg',
}))

describe('SearchPanel', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockSearchContent.mockResolvedValue([])
    mockReplaceContent.mockResolvedValue({ changedFiles: 0 })
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // --- Rendering ---

  it('returns null when not open', () => {
    const { container } = render(<SearchPanel isOpen={false} onClose={onClose} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders dialog when open', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: 'Search in files' })).toBeInTheDocument()
  })

  it('renders search input with correct placeholder', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    expect(screen.getByPlaceholderText('Search in files...')).toBeInTheDocument()
  })

  it('renders all toggle buttons', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    expect(screen.getByTitle('Toggle replace')).toBeInTheDocument()
    expect(screen.getByTitle('Match case')).toBeInTheDocument()
    expect(screen.getByTitle('Match whole word')).toBeInTheDocument()
    expect(screen.getByTitle('Use regular expression')).toBeInTheDocument()
    expect(screen.getByTitle('Filter files to include/exclude')).toBeInTheDocument()
  })

  it('renders close button that calls onClose', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    // The X close button is the last button in the search bar
    const dialog = screen.getByRole('dialog')
    const firstRow = dialog.querySelector('.flex.items-center.gap-3')
    const buttons = firstRow!.querySelectorAll('button')
    // Last button in the input row is the X close button
    const closeBtn = buttons[buttons.length - 1]
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })

  it('renders empty state when no query', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    expect(screen.getByText('Type to search across all files')).toBeInTheDocument()
    expect(screen.getByText('Press Enter to open, Escape to close')).toBeInTheDocument()
  })

  it('renders keyboard hints in footer', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    expect(screen.getByText('Navigate')).toBeInTheDocument()
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('Close')).toBeInTheDocument()
  })

  // --- Keyboard interactions ---

  it('closes on Escape key', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.keyDown(screen.getByPlaceholderText('Search in files...'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on backdrop click', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByRole('presentation'))
    expect(onClose).toHaveBeenCalled()
  })

  it('does not close when clicking inside dialog', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })

  // --- Search functionality ---

  it('triggers search on query input after debounce', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/app.ts', line: 10, content: 'const x = hello' },
    ])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await waitFor(() => {
      expect(mockSearchContent).toHaveBeenCalledWith('hello', false, undefined, expect.objectContaining({ wholeWord: false, regex: false }))
    })
  })

  it('clears results when query is cleared', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/app.ts', line: 10, content: 'hello' },
    ])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    // Clear query
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: '' } })

    await waitFor(() => {
      expect(screen.getByText('Type to search across all files')).toBeInTheDocument()
    })
  })

  it('displays search results grouped by file', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/app.ts', line: 10, content: 'const x = hello' },
      { path: '/src/app.ts', line: 20, content: 'hello world' },
    ])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await waitFor(() => {
      expect(screen.getByText('/src/app.ts')).toBeInTheDocument()
    })
    expect(screen.getByText('2 matches')).toBeInTheDocument()
  })

  it('shows results from multiple files', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/app.ts', line: 10, content: 'hello' },
      { path: '/src/utils.ts', line: 5, content: 'hello' },
    ])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await waitFor(() => {
      expect(screen.getByText('/src/app.ts')).toBeInTheDocument()
      expect(screen.getByText('/src/utils.ts')).toBeInTheDocument()
    })
  })

  it('shows no results message when search returns empty', async () => {
    mockSearchContent.mockResolvedValueOnce([])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'xyz' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await waitFor(() => {
      expect(mockSearchContent).toHaveBeenCalled()
    })
    expect(screen.getByText('No results found')).toBeInTheDocument()
  })

  it('shows result count in footer', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/app.ts', line: 10, content: 'hello' },
      { path: '/src/utils.ts', line: 5, content: 'hello' },
    ])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await waitFor(() => {
      expect(screen.getByText(/2 results in 2 files/)).toBeInTheDocument()
    })
  })

  it('shows singular result count for one result', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/app.ts', line: 10, content: 'hello' },
    ])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await waitFor(() => {
      expect(screen.getByText(/1 result in 1 file/)).toBeInTheDocument()
    })
  })

  it('shows loading spinner while searching', async () => {
    let resolveSearch: (value: unknown[]) => void
    mockSearchContent.mockImplementationOnce(() => new Promise(r => { resolveSearch = r }))
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    expect(screen.getByText('Searching...')).toBeInTheDocument()

    await act(async () => {
      resolveSearch([])
    })

    await waitFor(() => {
      expect(screen.queryByText('Searching...')).not.toBeInTheDocument()
    })
  })

  // --- Navigation ---

  it('navigates on result click', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/app.ts', line: 10, content: 'hello' },
    ])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    const option = await screen.findByRole('option')
    fireEvent.click(option)
    expect(mockNavigate).toHaveBeenCalledWith('/?file=%2Fsrc%2Fapp.ts&line=10')
    expect(onClose).toHaveBeenCalled()
  })

  it('navigates on Enter key with result selected', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/app.ts', line: 10, content: 'hello' },
    ])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await screen.findByRole('option')
    fireEvent.keyDown(screen.getByPlaceholderText('Search in files...'), { key: 'Enter' })
    expect(mockNavigate).toHaveBeenCalledWith('/?file=%2Fsrc%2Fapp.ts&line=10')
    expect(onClose).toHaveBeenCalled()
  })

  it('navigates down with ArrowDown key', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/a.ts', line: 1, content: 'hello' },
      { path: '/src/b.ts', line: 2, content: 'hello' },
    ])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await screen.findAllByRole('option')
    const input = screen.getByPlaceholderText('Search in files...')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    // Should update selected index without error
    expect(input).toBeInTheDocument()
  })

  it('navigates up with ArrowUp key', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/a.ts', line: 1, content: 'hello' },
      { path: '/src/b.ts', line: 2, content: 'hello' },
    ])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await screen.findAllByRole('option')
    const input = screen.getByPlaceholderText('Search in files...')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    // Should not go below 0
    expect(input).toBeInTheDocument()
  })

  // --- Toggle buttons ---

  it('shows replace input when toggled', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Toggle replace'))
    expect(screen.getByPlaceholderText('Replace with...')).toBeInTheDocument()
  })

  it('hides replace input when toggled off', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Toggle replace'))
    expect(screen.getByPlaceholderText('Replace with...')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('Toggle replace'))
    expect(screen.queryByPlaceholderText('Replace with...')).not.toBeInTheDocument()
  })

  it('toggles case sensitive', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    const btn = screen.getByTitle('Match case')
    expect(btn.textContent).toBe('Aa')
    fireEvent.click(btn)
    expect(btn.className).toContain('bg-accent')
  })

  it('toggles whole word', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    const btn = screen.getByTitle('Match whole word')
    fireEvent.click(btn)
    expect(btn.className).toContain('bg-accent')
  })

  it('toggles regex', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    const btn = screen.getByTitle('Use regular expression')
    expect(btn.textContent).toContain('.*')
    fireEvent.click(btn)
    expect(btn.className).toContain('bg-accent')
  })

  it('toggles preserve case when replace is visible', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Toggle replace'))
    const btn = screen.getByTitle('Preserve Case')
    expect(btn.textContent).toBe('AB')
    fireEvent.click(btn)
    expect(btn.className).toContain('bg-accent')
  })

  // --- Filter bar ---

  it('shows filter bar when filter button clicked', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Filter files to include/exclude'))
    expect(screen.getByPlaceholderText('*.ts, *.tsx (comma-separated)')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('*.test.ts, node_modules')).toBeInTheDocument()
  })

  it('hides filter bar when toggled off', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Filter files to include/exclude'))
    expect(screen.getByPlaceholderText('*.ts, *.tsx (comma-separated)')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('Filter files to include/exclude'))
    expect(screen.queryByPlaceholderText('*.ts, *.tsx (comma-separated)')).not.toBeInTheDocument()
  })

  it('shows include and exclude labels in filter bar', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Filter files to include/exclude'))
    expect(screen.getByText('Include')).toBeInTheDocument()
    expect(screen.getByText('Exclude')).toBeInTheDocument()
  })

  // --- Initial props ---

  it('sets initial folder from prop', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} initialFolder="/src" />)
    expect(screen.getByText('/src')).toBeInTheDocument()
  })

  it('shows folder in filter bar when initialFolder is set', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} initialFolder="/src" />)
    expect(screen.getByText('Folder')).toBeInTheDocument()
  })

  it('opens in replace mode from initialReplace prop', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} initialReplace={true} />)
    expect(screen.getByPlaceholderText('Replace with...')).toBeInTheDocument()
  })

  // --- Search history ---

  it('loads search history from localStorage', () => {
    localStorage.setItem('swarm-editor-search-history', JSON.stringify(['test1', 'test2']))
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    // Focus input to show history
    fireEvent.focus(screen.getByPlaceholderText('Search in files...'))
    expect(screen.getByText('Recent searches')).toBeInTheDocument()
    expect(screen.getByText('test1')).toBeInTheDocument()
    expect(screen.getByText('test2')).toBeInTheDocument()
  })

  it('clears search history', () => {
    localStorage.setItem('swarm-editor-search-history', JSON.stringify(['test1']))
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.focus(screen.getByPlaceholderText('Search in files...'))
    fireEvent.mouseDown(screen.getByText('Clear'))
    expect(screen.queryByText('test1')).not.toBeInTheDocument()
    expect(localStorage.getItem('swarm-editor-search-history')).toBeNull()
  })

  it('clicks history item to set query', () => {
    localStorage.setItem('swarm-editor-search-history', JSON.stringify(['oldQuery']))
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.focus(screen.getByPlaceholderText('Search in files...'))
    fireEvent.mouseDown(screen.getByText('oldQuery'))
    expect(screen.getByPlaceholderText('Search in files...')).toHaveValue('oldQuery')
  })

  it('saves query to history on result click', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/app.ts', line: 10, content: 'hello' },
    ])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    const option = await screen.findByRole('option')
    fireEvent.click(option)

    const stored = JSON.parse(localStorage.getItem('swarm-editor-search-history') || '[]')
    expect(stored).toContain('hello')
  })

  it('does not show history when query is non-empty', () => {
    localStorage.setItem('swarm-editor-search-history', JSON.stringify(['test1']))
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'x' } })
    fireEvent.focus(screen.getByPlaceholderText('Search in files...'))
    expect(screen.queryByText('Recent searches')).not.toBeInTheDocument()
  })

  // --- Replace functionality ---

  it('shows Replace All button when replace is toggled', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Toggle replace'))
    expect(screen.getByText('Replace All')).toBeInTheDocument()
  })

  it('Replace All button is disabled when no query', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Toggle replace'))
    expect(screen.getByText('Replace All')).toBeDisabled()
  })

  it('Replace All button is disabled when no results', async () => {
    mockSearchContent.mockResolvedValueOnce([])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Toggle replace'))
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await waitFor(() => {
      expect(mockSearchContent).toHaveBeenCalled()
    })
    expect(screen.getByText('Replace All')).toBeDisabled()
  })

  it('performs replace all on click', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/app.ts', line: 10, content: 'hello' },
    ])
    mockReplaceContent.mockResolvedValueOnce({ changedFiles: 1 })
    mockSearchContent.mockResolvedValueOnce([]) // re-search after replace

    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Toggle replace'))
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })
    fireEvent.change(screen.getByPlaceholderText('Replace with...'), { target: { value: 'world' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await screen.findByRole('option')
    fireEvent.click(screen.getByText('Replace All'))

    await waitFor(() => {
      expect(mockReplaceContent).toHaveBeenCalledWith('hello', 'world', expect.objectContaining({
        caseSensitive: false,
        wholeWord: false,
        regex: false,
        dryRun: false,
        preserveCase: false,
      }))
    })
  })

  it('shows replace summary after successful replace', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/app.ts', line: 10, content: 'hello' },
    ])
    mockReplaceContent.mockResolvedValueOnce({ changedFiles: 3 })
    mockSearchContent.mockResolvedValueOnce([])

    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Toggle replace'))
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await screen.findByRole('option')
    fireEvent.click(screen.getByText('Replace All'))

    await waitFor(() => {
      expect(screen.getByText(/Replaced in 3 files/)).toBeInTheDocument()
    })
  })

  it('shows singular replace summary for 1 file', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/app.ts', line: 10, content: 'hello' },
    ])
    mockReplaceContent.mockResolvedValueOnce({ changedFiles: 1 })
    mockSearchContent.mockResolvedValueOnce([])

    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Toggle replace'))
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await screen.findByRole('option')
    fireEvent.click(screen.getByText('Replace All'))

    await waitFor(() => {
      expect(screen.getByText(/Replaced in 1 file$/)).toBeInTheDocument()
    })
  })

  it('shows error on replace failure', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/app.ts', line: 10, content: 'hello' },
    ])
    mockReplaceContent.mockRejectedValueOnce(new Error('Permission denied'))

    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Toggle replace'))
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await screen.findByRole('option')
    fireEvent.click(screen.getByText('Replace All'))

    await waitFor(() => {
      expect(screen.getByText('Permission denied')).toBeInTheDocument()
    })
  })

  it('shows replacing state during replace', async () => {
    let resolveReplace: (value: unknown) => void
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/app.ts', line: 10, content: 'hello' },
    ])
    mockReplaceContent.mockImplementationOnce(() => new Promise(r => { resolveReplace = r }))

    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Toggle replace'))
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await screen.findByRole('option')
    fireEvent.click(screen.getByText('Replace All'))

    await waitFor(() => {
      expect(screen.getByText('Replacing...')).toBeInTheDocument()
    })

    await act(async () => {
      resolveReplace({ changedFiles: 1 })
    })
  })

  it('handles Alt+Enter to replace in file', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/app.ts', line: 10, content: 'hello' },
    ])
    mockReplaceContent.mockResolvedValueOnce({ changedFiles: 1 })
    mockSearchContent.mockResolvedValueOnce([])

    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Toggle replace'))
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await screen.findByRole('option')
    const input = screen.getByPlaceholderText('Search in files...')
    fireEvent.keyDown(input, { key: 'Enter', altKey: true })

    await waitFor(() => {
      expect(mockReplaceContent).toHaveBeenCalled()
    })
  })

  it('shows Replace in file button per file group in replace mode', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/app.ts', line: 10, content: 'hello' },
    ])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Toggle replace'))
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await screen.findByRole('option')
    expect(screen.getByTitle('Replace all in this file')).toBeInTheDocument()
  })

  it('performs replace in single file', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/app.ts', line: 10, content: 'hello' },
    ])
    mockReplaceContent.mockResolvedValueOnce({ changedFiles: 1 })
    mockSearchContent.mockResolvedValueOnce([])

    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Toggle replace'))
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await screen.findByRole('option')
    fireEvent.click(screen.getByTitle('Replace all in this file'))

    await waitFor(() => {
      expect(mockReplaceContent).toHaveBeenCalledWith('hello', '', expect.objectContaining({
        files: ['/src/app.ts'],
      }))
    })
  })

  // --- Error handling ---

  it('shows search error for invalid regex', async () => {
    mockSearchContent.mockRejectedValueOnce(new Error('Invalid regular expression'))

    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Use regular expression'))
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: '[invalid' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await waitFor(() => {
      expect(screen.getByText('Invalid regular expression')).toBeInTheDocument()
    })
    expect(screen.getByText('Check your regular expression syntax')).toBeInTheDocument()
  })

  // --- File collapse/expand ---

  it('toggles file group collapse on file header click', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/app.ts', line: 10, content: 'hello' },
      { path: '/src/app.ts', line: 20, content: 'hello there' },
    ])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await screen.findAllByRole('option')
    // Initially expanded - should see both options
    expect(screen.getAllByRole('option')).toHaveLength(2)

    // Click file header to collapse
    fireEvent.click(screen.getByText('/src/app.ts'))
    // Match lines hidden when collapsed
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('shows Collapse All button when multiple files', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/a.ts', line: 1, content: 'hello' },
      { path: '/src/b.ts', line: 2, content: 'hello' },
    ])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await screen.findAllByRole('option')
    expect(screen.getByTitle('Collapse All')).toBeInTheDocument()
  })

  it('collapses all files on Collapse All click', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/a.ts', line: 1, content: 'hello' },
      { path: '/src/b.ts', line: 2, content: 'hello' },
    ])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await screen.findAllByRole('option')
    fireEvent.click(screen.getByTitle('Collapse All'))
    // All options should be hidden
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('does not show Collapse All with single file', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/a.ts', line: 1, content: 'hello' },
    ])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await screen.findByRole('option')
    expect(screen.queryByTitle('Collapse All')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Expand All')).not.toBeInTheDocument()
  })

  // --- Search with options ---

  it('passes case sensitive option to search', async () => {
    mockSearchContent.mockResolvedValueOnce([])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Match case'))
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'Hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await waitFor(() => {
      expect(mockSearchContent).toHaveBeenCalledWith('Hello', true, undefined, expect.objectContaining({ wholeWord: false, regex: false }))
    })
  })

  it('passes whole word option to search', async () => {
    mockSearchContent.mockResolvedValueOnce([])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Match whole word'))
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await waitFor(() => {
      expect(mockSearchContent).toHaveBeenCalledWith('hello', false, undefined, expect.objectContaining({ wholeWord: true, regex: false }))
    })
  })

  it('passes regex option to search', async () => {
    mockSearchContent.mockResolvedValueOnce([])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Use regular expression'))
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello.*world' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await waitFor(() => {
      expect(mockSearchContent).toHaveBeenCalledWith('hello.*world', false, undefined, expect.objectContaining({ wholeWord: false, regex: true }))
    })
  })

  it('passes include and exclude filters to search', async () => {
    mockSearchContent.mockResolvedValueOnce([])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Filter files to include/exclude'))
    fireEvent.change(screen.getByPlaceholderText('*.ts, *.tsx (comma-separated)'), { target: { value: '*.ts, *.tsx' } })
    fireEvent.change(screen.getByPlaceholderText('*.test.ts, node_modules'), { target: { value: 'node_modules' } })
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await waitFor(() => {
      expect(mockSearchContent).toHaveBeenCalledWith('hello', false, undefined, expect.objectContaining({
        includeFiles: ['*.ts', '*.tsx'],
        excludeFiles: ['node_modules'],
      }))
    })
  })

  it('clears folder when X button is clicked', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} initialFolder="/src" />)
    expect(screen.getByText('/src')).toBeInTheDocument()
    // Find the X button next to the folder path (small X with size 12)
    const folderSection = screen.getByText('Folder').closest('div')
    const xBtn = folderSection?.querySelector('button')
    if (xBtn) fireEvent.click(xBtn)
    expect(screen.queryByText('/src')).not.toBeInTheDocument()
  })

  it('shows Alt+Enter hint when replace mode is active', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Toggle replace'))
    expect(screen.getByText('Replace in file')).toBeInTheDocument()
  })

  // --- Body scroll lock ---

  it('locks body scroll when open', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('restores body scroll when unmounted', () => {
    document.body.style.overflow = 'auto'
    const { unmount } = render(<SearchPanel isOpen={true} onClose={onClose} />)
    unmount()
    expect(document.body.style.overflow).toBe('auto')
  })

  // --- Stale request guard ---

  it('discards stale search results', async () => {
    let resolveFirst: (value: unknown[]) => void
    let resolveSecond: (value: unknown[]) => void
    mockSearchContent
      .mockImplementationOnce(() => new Promise(r => { resolveFirst = r }))
      .mockImplementationOnce(() => new Promise(r => { resolveSecond = r }))

    render(<SearchPanel isOpen={true} onClose={onClose} />)

    // First search
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'first' } })
    await act(async () => { vi.advanceTimersByTime(350) })

    // Second search (should supersede first)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'second' } })
    await act(async () => { vi.advanceTimersByTime(350) })

    // Resolve second first (so first is stale)
    await act(async () => { resolveSecond([{ path: '/b.ts', line: 1, content: 'second' }]) })

    // Now resolve first (stale — should be discarded)
    await act(async () => { resolveFirst([{ path: '/a.ts', line: 1, content: 'first' }]) })

    // Should show second results, not first
    await waitFor(() => {
      expect(screen.getByText('/b.ts')).toBeInTheDocument()
    })
    expect(screen.queryByText('/a.ts')).not.toBeInTheDocument()
  })

  // --- Result line numbers ---

  it('displays line numbers (1-indexed) in results', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/app.ts', line: 9, content: 'hello' },
    ])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    await screen.findByRole('option')
    // line is 9 but displayed as line+1 = 10
    expect(screen.getByText('10')).toBeInTheDocument()
  })
})
