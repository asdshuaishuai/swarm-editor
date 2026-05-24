import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OutlinePanel } from './OutlinePanel'

const mockDocumentSymbols = vi.fn()
vi.mock('../services/lspApi', () => ({
  lspApi: {
    documentSymbols: (...args: any[]) => mockDocumentSymbols(...args),
  },
}))

vi.mock('lucide-react', () => ({
  ChevronRight: () => <span data-testid="chevron-right" />,
  ChevronDown: () => <span data-testid="chevron-down" />,
  Box: () => <span data-testid="box" />,
  Code: () => <span data-testid="code" />,
  Type: () => <span data-testid="type" />,
  List: () => <span data-testid="list" />,
  FileCode: () => <span data-testid="filecode" />,
  Layers: () => <span data-testid="layers" />,
  Hexagon: () => <span data-testid="hexagon" />,
  Braces: () => <span data-testid="braces" />,
  Zap: () => <span data-testid="zap" />,
  Search: () => <span data-testid="search" />,
  ChevronsDownUp: () => <span data-testid="chevrons-downup" />,
}))

describe('OutlinePanel', () => {
  const onSymbolClick = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockDocumentSymbols.mockResolvedValue({ symbols: [] })
  })

  it('shows "No file open" when filePath is null', () => {
    render(<OutlinePanel filePath={null} onSymbolClick={onSymbolClick} />)
    expect(screen.getByText('No file open')).toBeInTheDocument()
  })

  it('shows "Outline" header', () => {
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    expect(screen.getByText('Outline')).toBeInTheDocument()
  })

  it('calls lspApi.documentSymbols with file path', async () => {
    mockDocumentSymbols.mockResolvedValue({ symbols: [] })
    render(<OutlinePanel filePath="src/App.tsx" onSymbolClick={onSymbolClick} />)
    await waitFor(() => {
      expect(mockDocumentSymbols).toHaveBeenCalledWith('src/App.tsx')
    })
  })

  it('shows loading state', () => {
    mockDocumentSymbols.mockReturnValue(new Promise(() => {}))
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows symbols after loading', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [
        {
          name: 'App',
          kind: 5, // Class
          range: { start: { line: 1, character: 0 }, end: { line: 10, character: 1 } },
          selectionRange: { start: { line: 1, character: 6 }, end: { line: 1, character: 9 } },
          children: [],
        },
      ],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('App')
    expect(screen.getByText('1 symbols')).toBeInTheDocument()
  })

  it('calls onSymbolClick when symbol clicked', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [
        {
          name: 'myFunc',
          kind: 12, // Function
          range: { start: { line: 5, character: 0 }, end: { line: 8, character: 1 } },
          selectionRange: { start: { line: 5, character: 16 }, end: { line: 5, character: 22 } },
          children: [],
        },
      ],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('myFunc')
    fireEvent.click(screen.getByText('myFunc'))
    expect(onSymbolClick).toHaveBeenCalledWith(5, 16)
  })

  it('shows error state on API failure', async () => {
    mockDocumentSymbols.mockRejectedValue(new Error('LSP error'))
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('Failed to load symbols')
  })

  it('shows "No symbols found" when empty', async () => {
    mockDocumentSymbols.mockResolvedValue({ symbols: [] })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('No symbols found')
  })

  it('expands children when parent has children', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [
        {
          name: 'MyClass',
          kind: 5,
          range: { start: { line: 0, character: 0 }, end: { line: 20, character: 1 } },
          selectionRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 13 } },
          children: [
            {
              name: 'method',
              kind: 6,
              range: { start: { line: 3, character: 2 }, end: { line: 5, character: 3 } },
              selectionRange: { start: { line: 3, character: 10 }, end: { line: 3, character: 16 } },
              children: [],
            },
          ],
        },
      ],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    // Parent is auto-expanded (first level), so child should be visible
    await screen.findByText('MyClass')
    expect(screen.getByText('method')).toBeInTheDocument()
  })

  it('filters symbols by text', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [
        {
          name: 'AppComponent',
          kind: 5,
          range: { start: { line: 0, character: 0 }, end: { line: 10, character: 1 } },
          selectionRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 17 } },
          children: [],
        },
        {
          name: 'Helper',
          kind: 12,
          range: { start: { line: 12, character: 0 }, end: { line: 15, character: 1 } },
          selectionRange: { start: { line: 12, character: 16 }, end: { line: 12, character: 22 } },
          children: [],
        },
      ],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('AppComponent')
    fireEvent.change(screen.getByPlaceholderText('Filter symbols...'), { target: { value: 'app' } })
    expect(screen.getByText('AppComponent')).toBeInTheDocument()
    expect(screen.queryByText('Helper')).toBeNull()
  })

  it('shows "No symbols match filter" when filter has no matches', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [
        {
          name: 'Foo',
          kind: 5,
          range: { start: { line: 0, character: 0 }, end: { line: 5, character: 1 } },
          selectionRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 9 } },
          children: [],
        },
      ],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('Foo')
    fireEvent.change(screen.getByPlaceholderText('Filter symbols...'), { target: { value: 'xyz' } })
    expect(screen.getByText('No symbols match filter')).toBeInTheDocument()
  })

  it('has role=tree on symbol list', async () => {
    mockDocumentSymbols.mockResolvedValue({ symbols: [] })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('No symbols found')
    expect(screen.getByRole('tree')).toBeInTheDocument()
  })

  it('collapses all when collapse button clicked', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [
        {
          name: 'Parent',
          kind: 5,
          range: { start: { line: 0, character: 0 }, end: { line: 20, character: 1 } },
          selectionRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 12 } },
          children: [
            {
              name: 'child1',
              kind: 6,
              range: { start: { line: 3, character: 2 }, end: { line: 5, character: 3 } },
              selectionRange: { start: { line: 3, character: 10 }, end: { line: 3, character: 16 } },
              children: [],
            },
          ],
        },
      ],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('child1')
    fireEvent.click(screen.getByLabelText('Collapse all symbols'))
    // After collapse, child should be hidden
    expect(screen.queryByText('child1')).toBeNull()
  })
})
