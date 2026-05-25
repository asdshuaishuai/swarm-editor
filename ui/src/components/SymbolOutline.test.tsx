import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import SymbolOutline from './SymbolOutline'

const mockDocumentSymbols = vi.fn()
vi.mock('../services/lspApi', () => ({
  lspApi: {
    documentSymbols: (...args: unknown[]) => mockDocumentSymbols(...args),
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
  useWorkspaceStore: (selector: (s: typeof mockWorkspace) => unknown) => selector(mockWorkspace),
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

  // ---------------------------------------------------------------
  // Nested children rendering (line 124-125)
  // ---------------------------------------------------------------
  describe('nested symbols', () => {
    it('renders child symbols under a parent', async () => {
      mockDocumentSymbols.mockResolvedValue({
        symbols: [
          {
            name: 'ParentClass',
            kind: 5,
            range: { start: { line: 0, character: 0 }, end: { line: 20, character: 1 } },
            children: [
              { name: 'childMethod', kind: 6, range: { start: { line: 3, character: 4 }, end: { line: 8, character: 5 } } },
              { name: 'childProp', kind: 7, range: { start: { line: 1, character: 4 }, end: { line: 1, character: 20 } } },
            ],
          },
        ],
      })
      render(<SymbolOutline />)
      await act(() => vi.advanceTimersByTimeAsync(1000))
      expect(screen.getByText('ParentClass')).toBeInTheDocument()
      expect(screen.getByText('childMethod')).toBeInTheDocument()
      expect(screen.getByText('childProp')).toBeInTheDocument()
    })

    it('hides children when collapse button is clicked', async () => {
      mockDocumentSymbols.mockResolvedValue({
        symbols: [
          {
            name: 'MyClass',
            kind: 5,
            range: { start: { line: 0, character: 0 }, end: { line: 20, character: 1 } },
            children: [
              { name: 'hiddenMethod', kind: 6, range: { start: { line: 5, character: 4 }, end: { line: 10, character: 5 } } },
            ],
          },
        ],
      })
      render(<SymbolOutline />)
      await act(() => vi.advanceTimersByTimeAsync(1000))
      expect(screen.getByText('hiddenMethod')).toBeInTheDocument()

      // Find the collapse button next to the parent symbol
      // The parent row has a chevron-down button (since it has children and is expanded)
      const chevronButtons = screen.getAllByTestId('chevron-d')
      fireEvent.click(chevronButtons[0])

      // After collapsing, child should be hidden and chevron-right shown
      expect(screen.queryByText('hiddenMethod')).toBeNull()
      expect(screen.getByTestId('chevron-r')).toBeInTheDocument()
    })

    it('shows children again after toggling collapse twice', async () => {
      mockDocumentSymbols.mockResolvedValue({
        symbols: [
          {
            name: 'Container',
            kind: 23,
            range: { start: { line: 0, character: 0 }, end: { line: 15, character: 1 } },
            children: [
              { name: 'inner', kind: 6, range: { start: { line: 2, character: 4 }, end: { line: 5, character: 5 } } },
            ],
          },
        ],
      })
      render(<SymbolOutline />)
      await act(() => vi.advanceTimersByTimeAsync(1000))
      expect(screen.getByText('inner')).toBeInTheDocument()

      // Collapse
      const chevronButtons = screen.getAllByTestId('chevron-d')
      fireEvent.click(chevronButtons[0])
      expect(screen.queryByText('inner')).toBeNull()

      // Expand again
      const expandButtons = screen.getAllByTestId('chevron-r')
      fireEvent.click(expandButtons[0])
      expect(screen.getByText('inner')).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------
  // fetchSymbols error handling (line 144-145)
  // ---------------------------------------------------------------
  describe('error handling', () => {
    it('handles fetchSymbols rejection gracefully', async () => {
      mockDocumentSymbols.mockRejectedValue(new Error('Network error'))
      render(<SymbolOutline />)
      await act(() => vi.advanceTimersByTimeAsync(1000))
      // Should show "No symbols found" after error
      expect(screen.getByText('No symbols found')).toBeInTheDocument()
    })

    it('clears symbols on error', async () => {
      // First load symbols successfully
      mockDocumentSymbols.mockResolvedValueOnce({
        symbols: [
          { name: 'Loaded', kind: 12, range: { start: { line: 0, character: 0 }, end: { line: 5, character: 1 } } },
        ],
      })
      const { unmount } = render(<SymbolOutline />)
      await act(() => vi.advanceTimersByTimeAsync(1000))
      expect(screen.getByText('Loaded')).toBeInTheDocument()

      // Unmount first instance and render new one with failing mock
      unmount()
      mockDocumentSymbols.mockRejectedValue(new Error('LSP crashed'))
      render(<SymbolOutline />)
      await act(() => vi.advanceTimersByTimeAsync(1000))
      // Symbols should be cleared (empty after error)
      expect(screen.getByText('No symbols found')).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------
  // Clear filter button (line 187)
  // ---------------------------------------------------------------
  describe('clear filter', () => {
    it('clears filter when X button is clicked', async () => {
      mockDocumentSymbols.mockResolvedValue({
        symbols: [
          { name: 'AlphaClass', kind: 5, range: { start: { line: 0, character: 0 }, end: { line: 5, character: 1 } } },
          { name: 'BetaHelper', kind: 12, range: { start: { line: 7, character: 0 }, end: { line: 10, character: 1 } } },
        ],
      })
      render(<SymbolOutline />)
      await act(() => vi.advanceTimersByTimeAsync(1000))

      // Apply a filter
      const input = screen.getByPlaceholderText('Filter symbols...')
      fireEvent.change(input, { target: { value: 'alpha' } })
      expect(screen.getByText('AlphaClass')).toBeInTheDocument()
      expect(screen.queryByText('BetaHelper')).toBeNull()

      // Click clear button (X icon)
      const clearButton = screen.getByTestId('x-icon').closest('button')
      expect(clearButton).toBeTruthy()
      fireEvent.click(clearButton!)

      // Both symbols should be visible again
      expect(screen.getByText('AlphaClass')).toBeInTheDocument()
      expect(screen.getByText('BetaHelper')).toBeInTheDocument()
    })

    it('does not show clear button when filter is empty', async () => {
      mockDocumentSymbols.mockResolvedValue({
        symbols: [
          { name: 'SomeFunc', kind: 12, range: { start: { line: 0, character: 0 }, end: { line: 3, character: 1 } } },
        ],
      })
      render(<SymbolOutline />)
      await act(() => vi.advanceTimersByTimeAsync(1000))
      // X button should not be present when filter is empty
      expect(screen.queryByTestId('x-icon')).toBeNull()
    })
  })

  // ---------------------------------------------------------------
  // Additional coverage: various symbol kinds, normalizeSymbols edge cases
  // ---------------------------------------------------------------
  describe('symbol kind badges', () => {
    it('renders unknown symbol kind with default badge', async () => {
      mockDocumentSymbols.mockResolvedValue({
        symbols: [
          { name: 'unknownThing', kind: 99, range: { start: { line: 0, character: 0 }, end: { line: 1, character: 1 } } },
        ],
      })
      render(<SymbolOutline />)
      await act(() => vi.advanceTimersByTimeAsync(1000))
      expect(screen.getByText('unknownThing')).toBeInTheDocument()
      // Default badge letter is 'S'
      expect(screen.getByText('S')).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------
  // File change debounce and cleanup
  // ---------------------------------------------------------------
  describe('file change debounce', () => {
    it('debounces fetchSymbols when file changes', async () => {
      mockDocumentSymbols.mockResolvedValue({
        symbols: [{ name: 'Symbol', kind: 12, range: { start: { line: 0, character: 0 }, end: { line: 1, character: 1 } } }],
      })

      render(<SymbolOutline />)
      await act(() => vi.advanceTimersByTimeAsync(1000))

      // Initial fetch was made
      expect(mockDocumentSymbols).toHaveBeenCalledTimes(1)

      // Change file and advance less than debounce time
      mockWorkspace.currentFile = 'src/NewFile.ts'
      const { rerender } = render(<SymbolOutline />)
      await act(() => vi.advanceTimersByTimeAsync(500))

      // File changed again before debounce fires — clear the old timeout
      mockWorkspace.currentFile = 'src/FinalFile.ts'
      rerender(<SymbolOutline />)
      await act(() => vi.advanceTimersByTimeAsync(1000))

      // Second fetch for the new file
      expect(mockDocumentSymbols).toHaveBeenCalledTimes(2)
      expect(mockDocumentSymbols).toHaveBeenCalledWith('src/FinalFile.ts')
    })

    it('clears symbols when currentFile becomes null', async () => {
      mockDocumentSymbols.mockResolvedValue({
        symbols: [
          { name: 'Existing', kind: 12, range: { start: { line: 0, character: 0 }, end: { line: 1, character: 1 } } },
        ],
      })
      render(<SymbolOutline />)
      await act(() => vi.advanceTimersByTimeAsync(1000))
      expect(screen.getByText('Existing')).toBeInTheDocument()

      // Set file to null - triggers the early return in useEffect which sets symbols to []
      mockWorkspace.currentFile = null
      // Re-render to pick up the store change
      render(<SymbolOutline />)
      expect(screen.getByText('Open a file to see symbols')).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------
  // Filter edge cases: filterSymbols with child matches
  // ---------------------------------------------------------------
  describe('filter edge cases', () => {
    it('shows parent when child matches filter even if parent name does not', async () => {
      mockDocumentSymbols.mockResolvedValue({
        symbols: [
          {
            name: 'ParentClass',
            kind: 5,
            range: { start: { line: 0, character: 0 }, end: { line: 20, character: 1 } },
            children: [
              { name: 'specificMethod', kind: 6, range: { start: { line: 5, character: 4 }, end: { line: 10, character: 5 } } },
            ],
          },
        ],
      })
      render(<SymbolOutline />)
      await act(() => vi.advanceTimersByTimeAsync(1000))

      // Filter by child name
      fireEvent.change(screen.getByPlaceholderText('Filter symbols...'), { target: { value: 'specific' } })
      // Parent should be shown (because child matches), child should be shown
      expect(screen.getByText('specificMethod')).toBeInTheDocument()
      expect(screen.getByText('ParentClass')).toBeInTheDocument()
    })

    it('shows "No matching symbols" when filter matches nothing', async () => {
      mockDocumentSymbols.mockResolvedValue({
        symbols: [
          { name: 'Alpha', kind: 12, range: { start: { line: 0, character: 0 }, end: { line: 1, character: 1 } } },
        ],
      })
      render(<SymbolOutline />)
      await act(() => vi.advanceTimersByTimeAsync(1000))

      fireEvent.change(screen.getByPlaceholderText('Filter symbols...'), { target: { value: 'nonexistent' } })
      expect(screen.getByText('No matching symbols')).toBeInTheDocument()
    })

    it('shows all children when parent name matches filter', async () => {
      mockDocumentSymbols.mockResolvedValue({
        symbols: [
          {
            name: 'MyClass',
            kind: 5,
            range: { start: { line: 0, character: 0 }, end: { line: 20, character: 1 } },
            children: [
              { name: 'methodA', kind: 6, range: { start: { line: 3, character: 4 }, end: { line: 8, character: 5 } } },
              { name: 'methodB', kind: 6, range: { start: { line: 10, character: 4 }, end: { line: 15, character: 5 } } },
            ],
          },
        ],
      })
      render(<SymbolOutline />)
      await act(() => vi.advanceTimersByTimeAsync(1000))

      // Filter matches parent name — all children should still be shown
      fireEvent.change(screen.getByPlaceholderText('Filter symbols...'), { target: { value: 'class' } })
      expect(screen.getByText('MyClass')).toBeInTheDocument()
      expect(screen.getByText('methodA')).toBeInTheDocument()
      expect(screen.getByText('methodB')).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------
  // normalizeSymbols edge cases
  // ---------------------------------------------------------------
  describe('normalizeSymbols', () => {
    it('handles symbols with missing fields gracefully', async () => {
      mockDocumentSymbols.mockResolvedValue({
        symbols: [
          { kind: 5, range: {} }, // missing name, partial range
          { name: 'Second' }, // missing kind and range
        ],
      })
      render(<SymbolOutline />)
      await act(() => vi.advanceTimersByTimeAsync(1000))
      // Should not crash; symbol with empty name still renders
      expect(screen.getByText('Second')).toBeInTheDocument()
    })

    it('uses selectionRange fallback when range is missing', async () => {
      mockDocumentSymbols.mockResolvedValue({
        symbols: [
          {
            name: 'FallbackSymbol',
            kind: 12,
            selectionRange: { start: { line: 7, character: 2 } },
          },
        ],
      })
      render(<SymbolOutline />)
      await act(() => vi.advanceTimersByTimeAsync(1000))
      expect(screen.getByText('FallbackSymbol')).toBeInTheDocument()
      // Line should be selectionRange.start.line + 1 = 8
      expect(screen.getByText('8')).toBeInTheDocument()
    })
  })
})
