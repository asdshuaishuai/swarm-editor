import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import SymbolOutline from './SymbolOutline'

const mockDocumentSymbols = vi.fn()
vi.mock('../services/lspApi', () => ({
  lspApi: {
    documentSymbols: (...args: any[]) => mockDocumentSymbols(...args),
  },
}))

vi.mock('lucide-react', () => ({
  Search: () => <span data-testid="search" />,
  X: () => <span data-testid="x-icon" />,
  ChevronRight: () => <span data-testid="chevron-r" />,
  ChevronDown: () => <span data-testid="chevron-d" />,
}))

const mockWorkspace = { currentFile: 'src/App.tsx' as string | null }
vi.mock('../stores/workspaceStore', () => ({
  useWorkspaceStore: (selector: any) => selector(mockWorkspace),
}))

describe('SymbolOutline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockDocumentSymbols.mockResolvedValue({ symbols: [] })
    mockWorkspace.currentFile = 'src/App.tsx'
  })

  afterEach(() => vi.useRealTimers())

  it('renders Document Symbols header', () => {
    render(<SymbolOutline />)
    expect(screen.getByText('Document Symbols')).toBeInTheDocument()
  })

  it('shows "Open a file to see symbols" when no file', () => {
    mockWorkspace.currentFile = null
    render(<SymbolOutline />)
    expect(screen.getByText('Open a file to see symbols')).toBeInTheDocument()
  })

  it('calls lspApi.documentSymbols after debounce', async () => {
    render(<SymbolOutline />)
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(mockDocumentSymbols).toHaveBeenCalledWith('src/App.tsx')
  })

  it('shows loading state before symbols arrive', () => {
    mockDocumentSymbols.mockReturnValue(new Promise(() => {}))
    render(<SymbolOutline />)
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByText('Loading symbols...')).toBeInTheDocument()
  })

  it('displays symbols after loading', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [
        { name: 'MyClass', kind: 5, range: { start: { line: 0, character: 0 }, end: { line: 10, character: 1 } }, selectionRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 13 } } },
      ],
    })
    render(<SymbolOutline />)
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(screen.getByText('MyClass')).toBeInTheDocument()
  })

  it('shows symbol line number', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [
        { name: 'foo', kind: 12, range: { start: { line: 4, character: 0 }, end: { line: 8, character: 1 } }, selectionRange: { start: { line: 4, character: 0 }, end: { line: 4, character: 3 } } },
      ],
    })
    render(<SymbolOutline />)
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(screen.getByText('foo')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument() // line 4 + 1
  })

  it('dispatches goto-line-direct on symbol click', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [
        { name: 'bar', kind: 6, range: { start: { line: 9, character: 0 }, end: { line: 12, character: 1 } }, selectionRange: { start: { line: 9, character: 0 }, end: { line: 9, character: 3 } } },
      ],
    })
    const dispatchSpy = vi.spyOn(document, 'dispatchEvent')
    render(<SymbolOutline />)
    await act(() => vi.advanceTimersByTimeAsync(1000))
    fireEvent.click(screen.getByText('bar'))
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(CustomEvent))
    dispatchSpy.mockRestore()
  })

  it('shows "No symbols found" when empty', async () => {
    mockDocumentSymbols.mockResolvedValue({ symbols: [] })
    render(<SymbolOutline />)
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(screen.getByText('No symbols found')).toBeInTheDocument()
  })

  it('filters symbols by search text', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [
        { name: 'AlphaClass', kind: 5, range: { start: { line: 0, character: 0 }, end: { line: 5, character: 1 } } },
        { name: 'BetaHelper', kind: 12, range: { start: { line: 7, character: 0 }, end: { line: 10, character: 1 } } },
      ],
    })
    render(<SymbolOutline />)
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(screen.getByText('AlphaClass')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Filter symbols...'), { target: { value: 'alpha' } })
    expect(screen.getByText('AlphaClass')).toBeInTheDocument()
    expect(screen.queryByText('BetaHelper')).toBeNull()
  })
})
