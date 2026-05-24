import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SearchPanel } from './SearchPanel'

const mockSearchContent = vi.fn().mockResolvedValue([])
const mockReplaceContent = vi.fn().mockResolvedValue({ changedFiles: 0 })
const mockNavigate = vi.fn()

// Mock the services barrel — SearchPanel imports { api, ContentSearchResult } from '../services'
vi.mock('../services', () => ({
  api: {
    fs: {
      searchContent: (...args: any[]) => mockSearchContent(...args),
      replaceContent: (...args: any[]) => mockReplaceContent(...args),
    },
  },
  // ContentSearchResult is a type-only import, not needed at runtime
  // Other barrel exports not needed by this component
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
    mockSearchContent.mockResolvedValue([])
    localStorage.clear()
  })

  it('returns null when not open', () => {
    const { container } = render(<SearchPanel isOpen={false} onClose={onClose} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders dialog when open', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: 'Search in files' })).toBeInTheDocument()
  })

  it('renders search input', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    expect(screen.getByPlaceholderText('Search in files...')).toBeInTheDocument()
  })

  it('renders toggle buttons', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    expect(screen.getByTitle('Toggle replace')).toBeInTheDocument()
    expect(screen.getByTitle('Match case')).toBeInTheDocument()
    expect(screen.getByTitle('Match whole word')).toBeInTheDocument()
    expect(screen.getByTitle('Use regular expression')).toBeInTheDocument()
    expect(screen.getByTitle('Filter files to include/exclude')).toBeInTheDocument()
  })

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

  it('shows empty state when no query', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    expect(screen.getByText('Type to search across all files')).toBeInTheDocument()
  })

  it('triggers search on query input', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/app.ts', line: 10, content: 'const x = hello' },
    ])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })
    await waitFor(() => {
      expect(mockSearchContent).toHaveBeenCalledWith('hello', false, undefined, expect.objectContaining({ wholeWord: false, regex: false }))
    })
  })

  it('displays search results', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/app.ts', line: 10, content: 'const x = hello' },
      { path: '/src/app.ts', line: 20, content: 'hello world' },
    ])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })
    await waitFor(() => {
      expect(screen.getByText('/src/app.ts')).toBeInTheDocument()
    })
    expect(screen.getByText('2 matches')).toBeInTheDocument()
  })

  it('shows no results message', async () => {
    mockSearchContent.mockResolvedValueOnce([])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'xyz' } })
    await waitFor(() => {
      expect(mockSearchContent).toHaveBeenCalled()
    })
    expect(screen.getByText('No results found')).toBeInTheDocument()
  })

  it('shows replace input when toggled', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Toggle replace'))
    expect(screen.getByPlaceholderText('Replace with...')).toBeInTheDocument()
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

  it('shows filter bar when filter button clicked', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByTitle('Filter files to include/exclude'))
    expect(screen.getByPlaceholderText('*.ts, *.tsx (comma-separated)')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('*.test.ts, node_modules')).toBeInTheDocument()
  })

  it('navigates on result click', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/app.ts', line: 10, content: 'hello' },
    ])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })
    const option = await screen.findByRole('option')
    fireEvent.click(option)
    expect(mockNavigate).toHaveBeenCalledWith('/?file=%2Fsrc%2Fapp.ts&line=10')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows result count in footer', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { path: '/src/app.ts', line: 10, content: 'hello' },
      { path: '/src/utils.ts', line: 5, content: 'hello' },
    ])
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Search in files...'), { target: { value: 'hello' } })
    await waitFor(() => {
      expect(screen.getByText(/2 results in 2 files/)).toBeInTheDocument()
    })
  })

  it('sets initial folder from prop', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} initialFolder="/src" />)
    expect(screen.getByText('/src')).toBeInTheDocument()
  })

  it('opens in replace mode from prop', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} initialReplace={true} />)
    expect(screen.getByPlaceholderText('Replace with...')).toBeInTheDocument()
  })

  it('shows keyboard hints in footer', () => {
    render(<SearchPanel isOpen={true} onClose={onClose} />)
    expect(screen.getByText('Navigate')).toBeInTheDocument()
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('Close')).toBeInTheDocument()
  })
})
