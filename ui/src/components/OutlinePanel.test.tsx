import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OutlinePanel } from './OutlinePanel'

const mockDocumentSymbols = vi.fn()
vi.mock('../services/lspApi', () => ({
  lspApi: {
    documentSymbols: (...args: string[]) => mockDocumentSymbols(...args),
  },
}))

vi.mock('../utils', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('lucide-react', () => ({
  ChevronRight: (props: Record<string, unknown>) => <span data-testid="chevron-right" {...props} />,
  ChevronDown: (props: Record<string, unknown>) => <span data-testid="chevron-down" {...props} />,
  Box: (props: Record<string, unknown>) => <span data-testid="box" {...props} />,
  Code: (props: Record<string, unknown>) => <span data-testid="code" {...props} />,
  Type: (props: Record<string, unknown>) => <span data-testid="type" {...props} />,
  List: (props: Record<string, unknown>) => <span data-testid="list" {...props} />,
  FileCode: (props: Record<string, unknown>) => <span data-testid="filecode" {...props} />,
  Layers: (props: Record<string, unknown>) => <span data-testid="layers" {...props} />,
  Hexagon: (props: Record<string, unknown>) => <span data-testid="hexagon" {...props} />,
  Braces: (props: Record<string, unknown>) => <span data-testid="braces" {...props} />,
  Zap: (props: Record<string, unknown>) => <span data-testid="zap" {...props} />,
  Search: (props: Record<string, unknown>) => <span data-testid="search" {...props} />,
  ChevronsDownUp: (props: Record<string, unknown>) => <span data-testid="chevrons-downup" {...props} />,
}))

interface TestSymbol {
  name: string
  kind: number
  range: { start: { line: number; character: number }; end: { line: number; character: number } }
  selectionRange: { start: { line: number; character: number }; end: { line: number; character: number } }
  children: TestSymbol[]
  detail?: string
}

const makeSymbol = (
  name: string,
  kind: number,
  line = 0,
  children: TestSymbol[] = [],
  detail?: string
): TestSymbol => ({
  name,
  kind,
  range: { start: { line, character: 0 }, end: { line: line + 10, character: 1 } },
  selectionRange: { start: { line, character: 6 }, end: { line, character: 6 + name.length } },
  children,
  ...(detail ? { detail } : {}),
})

describe('OutlinePanel', () => {
  const onSymbolClick = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockDocumentSymbols.mockResolvedValue({ symbols: [] })
  })

  // ========== No file open ==========

  it('shows "No file open" when filePath is null', () => {
    render(<OutlinePanel filePath={null} onSymbolClick={onSymbolClick} />)
    expect(screen.getByText('No file open')).toBeInTheDocument()
  })

  it('shows "Outline" header when no file open', () => {
    render(<OutlinePanel filePath={null} onSymbolClick={onSymbolClick} />)
    expect(screen.getByText('Outline')).toBeInTheDocument()
  })

  // ========== Header ==========

  it('shows "Outline" header with file', () => {
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    const headers = screen.getAllByText('Outline')
    expect(headers.length).toBeGreaterThan(0)
  })

  // ========== Loading State ==========

  it('shows loading state', () => {
    mockDocumentSymbols.mockReturnValue(new Promise(() => {}))
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows spinner during loading', () => {
    mockDocumentSymbols.mockReturnValue(new Promise(() => {}))
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    const spinner = document.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  // ========== API Call ==========

  it('calls lspApi.documentSymbols with file path', async () => {
    mockDocumentSymbols.mockResolvedValue({ symbols: [] })
    render(<OutlinePanel filePath="src/App.tsx" onSymbolClick={onSymbolClick} />)
    await waitFor(() => {
      expect(mockDocumentSymbols).toHaveBeenCalledWith('src/App.tsx')
    })
  })

  it('clears symbols when filePath becomes null', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('Foo', 5)],
    })
    const { rerender } = render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('Foo')

    rerender(<OutlinePanel filePath={null} onSymbolClick={onSymbolClick} />)
    expect(screen.getByText('No file open')).toBeInTheDocument()
    expect(screen.queryByText('Foo')).toBeNull()
  })

  // ========== Symbol Rendering ==========

  it('shows symbols after loading', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('App', 5)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('App')
    expect(screen.getByText('1 symbols')).toBeInTheDocument()
  })

  it('shows correct symbol count including children', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [
        makeSymbol('Parent', 5, 0, [
          makeSymbol('child1', 6, 3),
          makeSymbol('child2', 12, 8, [
            makeSymbol('nested', 13, 10),
          ]),
        ]),
      ],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('4 symbols')
  })

  it('shows "No symbols found" when empty', async () => {
    mockDocumentSymbols.mockResolvedValue({ symbols: [] })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('No symbols found')
  })

  it('shows symbol detail when present', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('myVar', 13, 0, [], ': string')],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText(': string')
  })

  // ========== Symbol Click ==========

  it('calls onSymbolClick when symbol clicked', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('myFunc', 12, 5)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('myFunc')
    fireEvent.click(screen.getByText('myFunc'))
    expect(onSymbolClick).toHaveBeenCalledWith(5, 6)
  })

  // ========== Error State ==========

  it('shows error state on API failure', async () => {
    mockDocumentSymbols.mockRejectedValue(new Error('LSP error'))
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('Failed to load symbols')
  })

  it('clears error on re-fetch', async () => {
    mockDocumentSymbols.mockRejectedValueOnce(new Error('LSP error'))
    const { rerender } = render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('Failed to load symbols')

    mockDocumentSymbols.mockResolvedValue({ symbols: [makeSymbol('Foo', 5)] })
    rerender(<OutlinePanel filePath="test2.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('Foo')
    expect(screen.queryByText('Failed to load symbols')).toBeNull()
  })

  // ========== Tree Structure ==========

  it('expands children when parent has children', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [
        makeSymbol('MyClass', 5, 0, [
          makeSymbol('method', 6, 3),
        ]),
      ],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('MyClass')
    expect(screen.getByText('method')).toBeInTheDocument()
  })

  it('has role=tree on symbol list', async () => {
    mockDocumentSymbols.mockResolvedValue({ symbols: [] })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('No symbols found')
    expect(screen.getByRole('tree')).toBeInTheDocument()
  })

  it('renders treeitem role for each symbol', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [
        makeSymbol('Foo', 5),
        makeSymbol('Bar', 12),
      ],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('Foo')
    const items = screen.getAllByRole('treeitem')
    expect(items.length).toBe(2)
  })

  // ========== Collapse/Expand ==========

  it('collapses all when collapse button clicked', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [
        makeSymbol('Parent', 5, 0, [
          makeSymbol('child1', 6, 3),
        ]),
      ],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('child1')
    fireEvent.click(screen.getByLabelText('Collapse all symbols'))
    expect(screen.queryByText('child1')).toBeNull()
  })

  it('toggles individual symbol expand/collapse', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [
        makeSymbol('Parent', 5, 0, [
          makeSymbol('child1', 6, 3),
        ]),
      ],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('child1')
    // child1 is visible (auto-expanded first level)
    // Click collapse button
    const expandBtn = screen.getByLabelText('Collapse')
    fireEvent.click(expandBtn)
    // child1 should now be hidden
    expect(screen.queryByText('child1')).toBeNull()
    // Now click expand button
    const expandBtnAgain = screen.getByLabelText('Expand')
    fireEvent.click(expandBtnAgain)
    expect(screen.getByText('child1')).toBeInTheDocument()
  })

  // ========== Filter ==========

  it('filters symbols by text', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [
        makeSymbol('AppComponent', 5),
        makeSymbol('Helper', 12),
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
      symbols: [makeSymbol('Foo', 5)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('Foo')
    fireEvent.change(screen.getByPlaceholderText('Filter symbols...'), { target: { value: 'xyz' } })
    expect(screen.getByText('No symbols match filter')).toBeInTheDocument()
  })

  it('includes parent symbol when child matches filter', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [
        makeSymbol('Parent', 5, 0, [
          makeSymbol('childMatch', 6, 3),
          makeSymbol('childOther', 12, 8),
        ]),
      ],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('Parent')
    fireEvent.change(screen.getByPlaceholderText('Filter symbols...'), { target: { value: 'match' } })
    expect(screen.getByText('Parent')).toBeInTheDocument()
    expect(screen.getByText('childMatch')).toBeInTheDocument()
    expect(screen.queryByText('childOther')).toBeNull()
  })

  it('resets filter when file changes', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('Foo', 5)],
    })
    const { rerender } = render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('Foo')
    fireEvent.change(screen.getByPlaceholderText('Filter symbols...'), { target: { value: 'xyz' } })
    expect(screen.getByText('No symbols match filter')).toBeInTheDocument()

    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('Bar', 12)],
    })
    rerender(<OutlinePanel filePath="test2.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('Bar')
    // Filter should have been reset
    const filterInput = screen.getByPlaceholderText('Filter symbols...') as HTMLInputElement
    expect(filterInput.value).toBe('')
  })

  it('shows filter input with correct aria-label', () => {
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    expect(screen.getByLabelText('Filter symbols')).toBeInTheDocument()
  })

  // ========== Keyboard Navigation ==========

  it('handles Enter key to click symbol', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('myFunc', 12, 5)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('myFunc')
    // onKeyDown is on the inner div with tabIndex=0
    const focusableDiv = screen.getByLabelText('Function myFunc')
    fireEvent.keyDown(focusableDiv, { key: 'Enter' })
    expect(onSymbolClick).toHaveBeenCalledWith(5, 6)
  })

  it('handles Space key to click symbol', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('myFunc', 12, 5)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('myFunc')
    const focusableDiv = screen.getByLabelText('Function myFunc')
    fireEvent.keyDown(focusableDiv, { key: ' ' })
    expect(onSymbolClick).toHaveBeenCalledWith(5, 6)
  })

  it('handles ArrowRight to expand collapsed parent', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [
        makeSymbol('Parent', 5, 0, [
          makeSymbol('child1', 6, 3),
        ]),
      ],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('child1')
    // Collapse first
    fireEvent.click(screen.getByLabelText('Collapse all symbols'))
    expect(screen.queryByText('child1')).toBeNull()
    // Now expand with ArrowRight on the inner focusable div
    const focusableDiv = screen.getByLabelText('Class Parent')
    fireEvent.keyDown(focusableDiv, { key: 'ArrowRight' })
    expect(screen.getByText('child1')).toBeInTheDocument()
  })

  it('handles ArrowLeft to collapse expanded parent', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [
        makeSymbol('Parent', 5, 0, [
          makeSymbol('child1', 6, 3),
        ]),
      ],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('child1')
    // child1 is visible (auto-expanded)
    const focusableDiv = screen.getByLabelText('Class Parent')
    fireEvent.keyDown(focusableDiv, { key: 'ArrowLeft' })
    expect(screen.queryByText('child1')).toBeNull()
  })

  it('does nothing on ArrowRight when symbol has no children', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('simple', 13)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('simple')
    const focusableDiv = screen.getByLabelText('Variable simple')
    fireEvent.keyDown(focusableDiv, { key: 'ArrowRight' })
    expect(screen.getByText('simple')).toBeInTheDocument()
  })

  it('does nothing on ArrowLeft when already collapsed', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('simple', 13)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('simple')
    const focusableDiv = screen.getByLabelText('Variable simple')
    fireEvent.keyDown(focusableDiv, { key: 'ArrowLeft' })
    expect(screen.getByText('simple')).toBeInTheDocument()
  })

  it('ignores other keys on keyDown', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('myFunc', 12, 5)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('myFunc')
    const focusableDiv = screen.getByLabelText('Function myFunc')
    fireEvent.keyDown(focusableDiv, { key: 'Tab' })
    expect(onSymbolClick).not.toHaveBeenCalled()
  })

  // ========== Symbol Icons (kind coverage) ==========

  it('renders icon for Class (kind 5)', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('MyClass', 5)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('MyClass')
    expect(screen.getByTestId('hexagon')).toBeInTheDocument()
  })

  it('renders icon for Interface (kind 11)', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('IFoo', 11)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('IFoo')
    expect(screen.getByTestId('layers')).toBeInTheDocument()
  })

  it('renders icon for Method (kind 6)', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('doStuff', 6)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('doStuff')
    expect(screen.getByTestId('code')).toBeInTheDocument()
  })

  it('renders icon for Function (kind 12)', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('helper', 12)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('helper')
    expect(screen.getByTestId('code')).toBeInTheDocument()
  })

  it('renders icon for Constructor (kind 9)', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('constructor', 9)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('constructor')
    expect(screen.getByTestId('code')).toBeInTheDocument()
  })

  it('renders icon for Property (kind 7)', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('name', 7)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('name')
    expect(screen.getByTestId('braces')).toBeInTheDocument()
  })

  it('renders icon for Field (kind 8)', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('count', 8)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('count')
    expect(screen.getByTestId('braces')).toBeInTheDocument()
  })

  it('renders icon for Variable (kind 13)', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('myVar', 13)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('myVar')
    expect(screen.getByTestId('type')).toBeInTheDocument()
  })

  it('renders icon for Constant (kind 14)', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('MAX', 14)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('MAX')
    expect(screen.getByTestId('zap')).toBeInTheDocument()
  })

  it('renders icon for Enum (kind 10)', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('Color', 10)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('Color')
    expect(screen.getByTestId('list')).toBeInTheDocument()
  })

  it('renders icon for EnumMember (kind 22)', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('Red', 22)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('Red')
    expect(screen.getByTestId('list')).toBeInTheDocument()
  })

  it('renders icon for Struct (kind 23)', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('Config', 23)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('Config')
    expect(screen.getByTestId('box')).toBeInTheDocument()
  })

  it('renders icon for Module (kind 2)', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('mod', 2)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('mod')
    expect(screen.getByTestId('layers')).toBeInTheDocument()
  })

  it('renders icon for Namespace (kind 3)', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('ns', 3)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('ns')
    expect(screen.getByTestId('layers')).toBeInTheDocument()
  })

  it('renders icon for Package (kind 4)', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('pkg', 4)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('pkg')
    expect(screen.getByTestId('layers')).toBeInTheDocument()
  })

  it('renders icon for Event (kind 24)', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('onClick', 24)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('onClick')
    expect(screen.getByTestId('zap')).toBeInTheDocument()
  })

  it('renders icon for TypeParameter (kind 26)', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('T', 26)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('T')
    expect(screen.getByTestId('type')).toBeInTheDocument()
  })

  it('renders default FileCode icon for unknown kind', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('unknown', 99)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('unknown')
    expect(screen.getByTestId('filecode')).toBeInTheDocument()
  })

  // ========== getKindName tooltip ==========

  it('sets correct aria-label for Class symbol', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('MyClass', 5)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('MyClass')
    expect(screen.getByLabelText('Class MyClass')).toBeInTheDocument()
  })

  it('sets correct aria-label for Function symbol', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('helper', 12)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('helper')
    expect(screen.getByLabelText('Function helper')).toBeInTheDocument()
  })

  it('sets correct aria-label for Method symbol', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('doStuff', 6)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('doStuff')
    expect(screen.getByLabelText('Method doStuff')).toBeInTheDocument()
  })

  it('sets correct aria-label for unknown kind', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('mystery', 99)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('mystery')
    expect(screen.getByLabelText('Symbol mystery')).toBeInTheDocument()
  })

  it('sets correct aria-label for Constructor symbol', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('new', 9)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('new')
    expect(screen.getByLabelText('Constructor new')).toBeInTheDocument()
  })

  it('sets correct aria-label for Property symbol', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('name', 7)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('name')
    expect(screen.getByLabelText('Property name')).toBeInTheDocument()
  })

  it('sets correct aria-label for Field symbol', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('count', 8)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('count')
    expect(screen.getByLabelText('Field count')).toBeInTheDocument()
  })

  it('sets correct aria-label for Variable symbol', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('x', 13)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('x')
    expect(screen.getByLabelText('Variable x')).toBeInTheDocument()
  })

  it('sets correct aria-label for Constant symbol', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('PI', 14)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('PI')
    expect(screen.getByLabelText('Constant PI')).toBeInTheDocument()
  })

  it('sets correct aria-label for Enum symbol', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('Color', 10)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('Color')
    expect(screen.getByLabelText('Enum Color')).toBeInTheDocument()
  })

  it('sets correct aria-label for EnumMember symbol', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('Red', 22)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('Red')
    expect(screen.getByLabelText('Enum Member Red')).toBeInTheDocument()
  })

  it('sets correct aria-label for Struct symbol', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('Config', 23)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('Config')
    expect(screen.getByLabelText('Struct Config')).toBeInTheDocument()
  })

  it('sets correct aria-label for Module symbol', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('mod', 2)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('mod')
    expect(screen.getByLabelText('Module mod')).toBeInTheDocument()
  })

  it('sets correct aria-label for Namespace symbol', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('ns', 3)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('ns')
    expect(screen.getByLabelText('Namespace ns')).toBeInTheDocument()
  })

  it('sets correct aria-label for Package symbol', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('pkg', 4)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('pkg')
    expect(screen.getByLabelText('Package pkg')).toBeInTheDocument()
  })

  it('sets correct aria-label for Event symbol', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('click', 24)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('click')
    expect(screen.getByLabelText('Event click')).toBeInTheDocument()
  })

  it('sets correct aria-label for TypeParameter symbol', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('T', 26)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('T')
    expect(screen.getByLabelText('Type Parameter T')).toBeInTheDocument()
  })

  // ========== aria-expanded on treeitem ==========

  it('sets aria-expanded on parent treeitem', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [
        makeSymbol('Parent', 5, 0, [
          makeSymbol('child1', 6, 3),
        ]),
      ],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('Parent')
    // The outer div has role=treeitem and aria-expanded
    const treeitems = screen.getAllByRole('treeitem')
    const parentItem = treeitems[0]
    expect(parentItem).toHaveAttribute('aria-expanded', 'true')
  })

  it('does not set aria-expanded on leaf treeitem', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [makeSymbol('leaf', 13)],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('leaf')
    const leafItem = screen.getByLabelText('Variable leaf')
    expect(leafItem).not.toHaveAttribute('aria-expanded')
  })

  // ========== Multiple symbols ==========

  it('renders multiple top-level symbols', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [
        makeSymbol('Foo', 5),
        makeSymbol('Bar', 12),
        makeSymbol('baz', 13),
      ],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('Foo')
    expect(screen.getByText('Bar')).toBeInTheDocument()
    expect(screen.getByText('baz')).toBeInTheDocument()
    expect(screen.getByText('3 symbols')).toBeInTheDocument()
  })

  // ========== Refetch on filePath change ==========

  it('refetches symbols when filePath changes', async () => {
    mockDocumentSymbols.mockResolvedValue({ symbols: [makeSymbol('Foo', 5)] })
    const { rerender } = render(<OutlinePanel filePath="file1.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('Foo')

    mockDocumentSymbols.mockResolvedValue({ symbols: [makeSymbol('Bar', 12)] })
    rerender(<OutlinePanel filePath="file2.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('Bar')
    expect(screen.queryByText('Foo')).toBeNull()
    expect(mockDocumentSymbols).toHaveBeenCalledTimes(2)
  })

  // ========== Deep nesting ==========

  it('handles deeply nested symbols', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [
        makeSymbol('L0', 5, 0, [
          makeSymbol('L1', 6, 3, [
            makeSymbol('L2', 12, 6, [
              makeSymbol('L3', 13, 9),
            ]),
          ]),
        ]),
      ],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    // L0 is auto-expanded (first level), L1 should be visible
    await screen.findByText('L0')
    expect(screen.getByText('L1')).toBeInTheDocument()
    // L1 is NOT auto-expanded (only first level auto-expands)
    expect(screen.queryByText('L2')).toBeNull()
  })

  // ========== loading state with aria-live ==========

  it('loading state has aria-live attribute', () => {
    mockDocumentSymbols.mockReturnValue(new Promise(() => {}))
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    const loadingEl = screen.getByText('Loading...').closest('div')
    expect(loadingEl).toHaveAttribute('aria-live', 'polite')
  })

  // ========== error state with role=alert ==========

  it('error state has role=alert', async () => {
    mockDocumentSymbols.mockRejectedValue(new Error('fail'))
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('Failed to load symbols')
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  // ========== Symbol without children field ==========

  it('handles symbols without children field', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [{
        name: 'NoChildren',
        kind: 13,
        range: { start: { line: 0, character: 0 }, end: { line: 1, character: 1 } },
        selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
      }],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('NoChildren')
    // Should not have expand/collapse button (no children)
    expect(screen.queryByLabelText('Collapse')).toBeNull()
    expect(screen.queryByLabelText('Expand')).toBeNull()
  })

  // ========== Empty filter text returns all symbols ==========

  it('shows all symbols when filter is whitespace-only', async () => {
    mockDocumentSymbols.mockResolvedValue({
      symbols: [
        makeSymbol('Foo', 5),
        makeSymbol('Bar', 12),
      ],
    })
    render(<OutlinePanel filePath="test.ts" onSymbolClick={onSymbolClick} />)
    await screen.findByText('Foo')
    fireEvent.change(screen.getByPlaceholderText('Filter symbols...'), { target: { value: '   ' } })
    expect(screen.getByText('Foo')).toBeInTheDocument()
    expect(screen.getByText('Bar')).toBeInTheDocument()
  })
})
