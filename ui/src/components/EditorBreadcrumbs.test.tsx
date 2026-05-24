import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EditorBreadcrumbs } from './EditorBreadcrumbs'

vi.mock('lucide-react', () => ({
  ChevronRight: () => <span data-testid="chevron" />,
  GitCompare: () => <span data-testid="git-compare" />,
}))

const defaults = {
  currentFile: 'src/components/App.tsx',
  breadcrumbSymbols: [] as any[],
  gitStatusMap: {} as Record<string, { status: string }>,
  hasDiffView: false,
  onOpenDiff: vi.fn(),
  onNavigateToSymbol: vi.fn(),
  onExpandDirectory: vi.fn(),
  onShowFileTree: vi.fn(),
}

describe('EditorBreadcrumbs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders path segments', () => {
    render(<EditorBreadcrumbs {...defaults} />)
    expect(screen.getByText('src')).toBeInTheDocument()
    expect(screen.getByText('components')).toBeInTheDocument()
    expect(screen.getByText('App.tsx')).toBeInTheDocument()
  })

  it('renders chevrons between segments', () => {
    render(<EditorBreadcrumbs {...defaults} />)
    expect(screen.getAllByTestId('chevron').length).toBe(2)
  })

  it('calls onExpandDirectory and onShowFileTree when folder clicked', () => {
    render(<EditorBreadcrumbs {...defaults} />)
    fireEvent.click(screen.getByText('src'))
    expect(defaults.onExpandDirectory).toHaveBeenCalledWith('src')
    expect(defaults.onShowFileTree).toHaveBeenCalled()
  })

  it('does not call onExpandDirectory when file name clicked', () => {
    render(<EditorBreadcrumbs {...defaults} />)
    fireEvent.click(screen.getByText('App.tsx'))
    expect(defaults.onExpandDirectory).not.toHaveBeenCalled()
  })

  it('shows file name with title tooltip', () => {
    render(<EditorBreadcrumbs {...defaults} />)
    expect(screen.getByTitle('src/components/App.tsx')).toBeInTheDocument()
  })

  it('renders LSP symbol breadcrumbs', () => {
    const symbols = [
      { name: 'MyClass', kind: 'Class', selectionRange: { start: { line: 5, character: 0 }, end: { line: 50, character: 1 } } },
      { name: 'render', kind: 'Method', detail: '(): JSX.Element', selectionRange: { start: { line: 10, character: 2 }, end: { line: 20, character: 3 } } },
    ]
    render(<EditorBreadcrumbs {...defaults} breadcrumbSymbols={symbols} />)
    expect(screen.getByText('MyClass')).toBeInTheDocument()
    expect(screen.getByText('render')).toBeInTheDocument()
  })

  it('calls onNavigateToSymbol when symbol clicked', () => {
    const symbols = [
      { name: 'foo', selectionRange: { start: { line: 3, character: 5 }, end: { line: 3, character: 8 } } },
    ]
    render(<EditorBreadcrumbs {...defaults} breadcrumbSymbols={symbols} />)
    fireEvent.click(screen.getByText('foo'))
    expect(defaults.onNavigateToSymbol).toHaveBeenCalledWith(3, 5)
  })

  it('does not call onNavigateToSymbol when symbol has no selectionRange', () => {
    const symbols = [{ name: 'bar' }]
    render(<EditorBreadcrumbs {...defaults} breadcrumbSymbols={symbols} />)
    fireEvent.click(screen.getByText('bar'))
    expect(defaults.onNavigateToSymbol).not.toHaveBeenCalled()
  })

  it('shows Diff button when file has git status and no diff view', () => {
    render(
      <EditorBreadcrumbs
        {...defaults}
        gitStatusMap={{ 'src/components/App.tsx': { status: 'M' } }}
        hasDiffView={false}
      />,
    )
    expect(screen.getByText('Diff')).toBeInTheDocument()
  })

  it('hides Diff button when no git status', () => {
    render(<EditorBreadcrumbs {...defaults} />)
    expect(screen.queryByText('Diff')).toBeNull()
  })

  it('hides Diff button when hasDiffView is true', () => {
    render(
      <EditorBreadcrumbs
        {...defaults}
        gitStatusMap={{ 'src/components/App.tsx': { status: 'M' } }}
        hasDiffView={true}
      />,
    )
    expect(screen.queryByText('Diff')).toBeNull()
  })

  it('calls onOpenDiff when Diff button clicked', () => {
    render(
      <EditorBreadcrumbs
        {...defaults}
        gitStatusMap={{ 'src/components/App.tsx': { status: 'M' } }}
      />,
    )
    fireEvent.click(screen.getByText('Diff'))
    expect(defaults.onOpenDiff).toHaveBeenCalledWith('src/components/App.tsx')
  })

  it('handles single-segment file path', () => {
    render(<EditorBreadcrumbs {...defaults} currentFile="README.md" />)
    expect(screen.getByText('README.md')).toBeInTheDocument()
    expect(screen.queryByTestId('chevron')).toBeNull()
  })

  it('shows symbol title with kind and detail', () => {
    const symbols = [{ name: 'fn', kind: 'Function', detail: '(x: number): void' }]
    render(<EditorBreadcrumbs {...defaults} breadcrumbSymbols={symbols} />)
    expect(screen.getByTitle('Function: fn — (x: number): void')).toBeInTheDocument()
  })
})
