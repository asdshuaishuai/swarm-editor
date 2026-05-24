import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import ProblemsPanel from './ProblemsPanel'

Element.prototype.scrollIntoView = vi.fn()

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../utils', () => ({
  getFileIcon: () => () => 'icon',
  getFileIconColor: () => 'text-blue-400',
}))

vi.mock('lucide-react', () => ({
  AlertCircle: () => 'icon',
  AlertTriangle: () => 'icon',
  Info: () => 'icon',
  ChevronUp: () => 'icon',
  ChevronDown: () => 'icon',
}))

const sampleProblems = [
  { id: 'p1', file: '/src/app.ts', line: 10, column: 5, message: 'Type error', severity: 'error' as const },
  { id: 'p2', file: '/src/utils.ts', line: 5, column: 1, message: 'Unused var', severity: 'warning' as const },
  { id: 'p3', file: '/src/main.ts', line: 20, column: 3, message: 'Info note', severity: 'info' as const },
  { id: 'p4', file: '/src/app.ts', line: 1, column: 1, message: 'Another error', severity: 'error' as const },
]

// Helper: find the collapse button (ChevronDown) in expanded mode header
function getCollapseButton(): HTMLElement {
  // The collapse button is the last button in the header (.border-b) div
  const header = document.querySelector('.border-b')
  if (!header) throw new Error('Header not found')
  const buttons = header.querySelectorAll('button')
  return buttons[buttons.length - 1]
}

// Helper: find the expand button (ChevronUp) in collapsed view
function getExpandButton(): HTMLElement {
  // In collapsed mode, the expand button is the last button
  const buttons = screen.getAllByRole('button')
  return buttons[buttons.length - 1]
}

describe('ProblemsPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  // ---------------------------------------------------------------------------
  // Basic rendering
  // ---------------------------------------------------------------------------
  describe('rendering', () => {
    it('renders problem count in All button', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      expect(screen.getByText('All')).toBeInTheDocument()
      expect(screen.getByText('(4)')).toBeInTheDocument()
    })

    it('renders problem messages', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      expect(screen.getByText('Type error')).toBeInTheDocument()
      expect(screen.getByText('Unused var')).toBeInTheDocument()
      expect(screen.getByText('Info note')).toBeInTheDocument()
    })

    it('sorts errors first then warnings then info', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      const options = screen.getAllByRole('option')
      expect(options[0]).toHaveTextContent('Another error')
      expect(options[1]).toHaveTextContent('Type error')
      expect(options[2]).toHaveTextContent('Unused var')
      expect(options[3]).toHaveTextContent('Info note')
    })

    it('shows empty state when no problems', () => {
      render(<ProblemsPanel problems={[]} />)
      expect(screen.getByText(/No problems have been detected/)).toBeInTheDocument()
    })

    it('shows filter empty state when no matches', () => {
      const warningsOnly = [
        { id: 'p1', file: '/src/app.ts', line: 1, column: 1, message: 'Warn', severity: 'warning' as const },
      ]
      render(<ProblemsPanel problems={warningsOnly} />)
      expect(screen.getAllByRole('option')).toHaveLength(1)
    })

    it('renders with default height style', () => {
      const { container } = render(<ProblemsPanel problems={sampleProblems} />)
      const panelDiv = container.querySelector('[class*="bg-mac-bg"]') as HTMLElement
      expect(panelDiv.style.height).toBe('200px')
    })

    it('renders with custom defaultHeight', () => {
      const { container } = render(<ProblemsPanel problems={sampleProblems} defaultHeight={300} />)
      const panelDiv = container.querySelector('[class*="bg-mac-bg"]') as HTMLElement
      expect(panelDiv.style.height).toBe('300px')
    })

    it('renders problem with source', () => {
      const problemsWithSource = [
        { id: 'p1', file: '/src/app.ts', line: 5, column: 1, message: 'TS error', severity: 'error' as const, source: 'typescript' },
      ]
      render(<ProblemsPanel problems={problemsWithSource} />)
      expect(screen.getByText('(typescript)')).toBeInTheDocument()
    })

    it('renders problem without source — no parentheses shown', () => {
      const problemsNoSource = [
        { id: 'p1', file: '/src/app.ts', line: 5, column: 1, message: 'TS error', severity: 'error' as const },
      ]
      render(<ProblemsPanel problems={problemsNoSource} />)
      expect(screen.queryByText('(typescript)')).not.toBeInTheDocument()
    })

    it('renders hint severity', () => {
      const hintProblems = [
        { id: 'h1', file: '/src/app.ts', line: 1, column: 1, message: 'Hint msg', severity: 'hint' as const },
      ]
      render(<ProblemsPanel problems={hintProblems} />)
      expect(screen.getByText('Hint msg')).toBeInTheDocument()
    })

    it('renders listbox with aria-label', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      expect(screen.getByRole('listbox', { name: 'Problems list' })).toBeInTheDocument()
    })

    it('renders line and column numbers (1-indexed)', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      expect(screen.getByText('[11, 6]')).toBeInTheDocument()
    })

    it('renders file paths in problem items', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      const files = screen.getAllByText('/src/app.ts')
      expect(files.length).toBeGreaterThan(0)
    })
  })

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------
  describe('filtering', () => {
    it('filters to errors only when clicking error count', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      const errorBtn = screen.getByText('2')
      fireEvent.click(errorBtn)
      const options = screen.getAllByRole('option')
      expect(options).toHaveLength(2)
      expect(options.every(o => o.textContent?.includes('error') || o.textContent?.includes('Error'))).toBe(true)
    })

    it('filters to warnings only when clicking warning count', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      const warningBtn = screen.getByText('1')
      fireEvent.click(warningBtn)
      const options = screen.getAllByRole('option')
      expect(options).toHaveLength(1)
      expect(options[0]).toHaveTextContent('Unused var')
    })

    it('resets filter when clicking All', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      fireEvent.click(screen.getByText('2'))
      expect(screen.getAllByRole('option')).toHaveLength(2)
      fireEvent.click(screen.getByText('All'))
      expect(screen.getAllByRole('option')).toHaveLength(4)
    })

    it('updates focusedIndex reset when filter changes results', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      const listbox = screen.getByRole('listbox')
      fireEvent.keyDown(listbox, { key: 'ArrowDown' })
      fireEvent.keyDown(listbox, { key: 'ArrowDown' })
      fireEvent.keyDown(listbox, { key: 'ArrowDown' })
      // Filter to errors only (2 items) — focusedIndex 3 >= length 2, resets to -1
      fireEvent.click(screen.getByText('2'))
      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })

    it('does not show error count button when no errors', () => {
      const warningsOnly = [
        { id: 'p1', file: '/src/app.ts', line: 1, column: 1, message: 'Warn', severity: 'warning' as const },
      ]
      render(<ProblemsPanel problems={warningsOnly} />)
      // Error count button should not be visible. Warning count (1) should be visible.
      // The header left-side div has: All button + warning count button (no error count)
      // There's no separate "2" text since errorCount is 0
      const allButton = screen.getByText('All')
      const leftDiv = allButton.closest('div') // flex items-center gap-4
      // Should have "All" button + warning button = 2 buttons in left div
      const filterButtons = leftDiv?.querySelectorAll('button')
      expect(filterButtons?.length).toBe(2) // All + warning
    })

    it('does not show warning count button when no warnings', () => {
      const errorsOnly = [
        { id: 'p1', file: '/src/app.ts', line: 1, column: 1, message: 'Error', severity: 'error' as const },
      ]
      render(<ProblemsPanel problems={errorsOnly} />)
      const allButton = screen.getByText('All')
      const leftDiv = allButton.closest('div') // flex items-center gap-4
      // Should have "All" button + error count button = 2 in left div
      const filterButtons = leftDiv?.querySelectorAll('button')
      expect(filterButtons?.length).toBe(2) // All + error
    })
  })

  // ---------------------------------------------------------------------------
  // Navigation / clicking
  // ---------------------------------------------------------------------------
  describe('navigation', () => {
    it('navigates on problem click', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      fireEvent.click(screen.getByText('Type error'))
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringContaining('file=%2Fsrc%2Fapp.ts')
      )
    })

    it('navigates with line number in URL', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      fireEvent.click(screen.getByText('Type error'))
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringContaining('line=10')
      )
    })

    it('sets focusedIndex on problem click', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      const options = screen.getAllByRole('option')
      fireEvent.click(options[1])
      expect(options[1]).toHaveAttribute('aria-selected', 'true')
    })
  })

  // ---------------------------------------------------------------------------
  // Keyboard navigation
  // ---------------------------------------------------------------------------
  describe('keyboard navigation', () => {
    it('navigates on Enter key after ArrowDown', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      const listbox = screen.getByRole('listbox')
      fireEvent.keyDown(listbox, { key: 'ArrowDown' })
      fireEvent.keyDown(listbox, { key: 'Enter' })
      expect(mockNavigate).toHaveBeenCalled()
    })

    it('ArrowDown wraps from last to first', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      const listbox = screen.getByRole('listbox')
      fireEvent.keyDown(listbox, { key: 'End' })
      fireEvent.keyDown(listbox, { key: 'ArrowDown' })
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    })

    it('ArrowUp wraps from first to last', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      const listbox = screen.getByRole('listbox')
      fireEvent.keyDown(listbox, { key: 'ArrowUp' })
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    })

    it('Home key focuses first item', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      const listbox = screen.getByRole('listbox')
      fireEvent.keyDown(listbox, { key: 'End' })
      fireEvent.keyDown(listbox, { key: 'Home' })
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    })

    it('End key focuses last item', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      const listbox = screen.getByRole('listbox')
      fireEvent.keyDown(listbox, { key: 'End' })
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    })

    it('Enter does nothing when no item is focused', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      const listbox = screen.getByRole('listbox')
      fireEvent.keyDown(listbox, { key: 'Enter' })
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('ArrowDown advances focused index', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      const listbox = screen.getByRole('listbox')
      fireEvent.keyDown(listbox, { key: 'ArrowDown' })
      const options = screen.getAllByRole('option')
      expect(options[0]).toHaveAttribute('aria-selected', 'true')
    })

    it('ArrowUp from middle goes to previous', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      const listbox = screen.getByRole('listbox')
      fireEvent.keyDown(listbox, { key: 'ArrowDown' })
      fireEvent.keyDown(listbox, { key: 'ArrowDown' })
      fireEvent.keyDown(listbox, { key: 'ArrowDown' })
      fireEvent.keyDown(listbox, { key: 'ArrowUp' })
      const options = screen.getAllByRole('option')
      expect(options[1]).toHaveAttribute('aria-selected', 'true')
    })

    it('ignores unrecognized keys', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      const listbox = screen.getByRole('listbox')
      fireEvent.keyDown(listbox, { key: 'Escape' })
      fireEvent.keyDown(listbox, { key: 'Tab' })
      const options = screen.getAllByRole('option')
      expect(options.every(o => o.getAttribute('aria-selected') !== 'true')).toBe(true)
    })

    it('keyboard does nothing when list is empty', () => {
      render(<ProblemsPanel problems={[]} />)
      const listbox = screen.getByRole('listbox')
      fireEvent.keyDown(listbox, { key: 'ArrowDown' })
      fireEvent.keyDown(listbox, { key: 'ArrowUp' })
      fireEvent.keyDown(listbox, { key: 'Home' })
      fireEvent.keyDown(listbox, { key: 'End' })
      fireEvent.keyDown(listbox, { key: 'Enter' })
    })

    it('updates aria-activedescendant on focus change', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      const listbox = screen.getByRole('listbox')
      // Sorted: p4 (Another error), p1 (Type error), p2 (Unused var), p3 (Info note)
      fireEvent.keyDown(listbox, { key: 'ArrowDown' })
      expect(listbox).toHaveAttribute('aria-activedescendant', 'problem-p4')
    })

    it('clears aria-activedescendant when no item focused', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      const listbox = screen.getByRole('listbox')
      expect(listbox.hasAttribute('aria-activedescendant')).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Collapse / Expand
  // ---------------------------------------------------------------------------
  describe('collapse and expand', () => {
    it('collapses panel when collapse button is clicked', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      fireEvent.click(getCollapseButton())
      // After collapse, should show "Problems" text in collapsed bar
      expect(screen.getByText('Problems')).toBeInTheDocument()
      // Listbox should not be visible
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })

    it('shows error count badge in collapsed view', () => {
      const { container } = render(<ProblemsPanel problems={sampleProblems} />)
      fireEvent.click(getCollapseButton())
      // In collapsed view, the error count is rendered inside a span with class text-error
      const errorSpan = container.querySelector('.text-error')
      expect(errorSpan).toBeInTheDocument()
      expect(errorSpan?.textContent).toContain('2')
    })

    it('shows warning count badge in collapsed view when warnings exist', () => {
      const { container } = render(<ProblemsPanel problems={sampleProblems} />)
      fireEvent.click(getCollapseButton())
      // In collapsed view, the warning count is rendered inside a span with class text-warning
      const warnSpan = container.querySelector('.text-warning')
      expect(warnSpan).toBeInTheDocument()
      expect(warnSpan?.textContent).toContain('1')
    })

    it('expands panel when expand button is clicked', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      fireEvent.click(getCollapseButton())
      // Now in collapsed mode, click expand (last button)
      fireEvent.click(getExpandButton())
      // Should be expanded — listbox present
      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })

    it('maintains filter state in collapsed view', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      // Filter to errors
      fireEvent.click(screen.getByText('2'))
      // Collapse
      fireEvent.click(getCollapseButton())
      // Filter is still 'errors' internally, collapsed view shows Problems
      expect(screen.getByText('Problems')).toBeInTheDocument()
    })

    it('clicking Problems button in collapsed view resets filter', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      fireEvent.click(getCollapseButton())
      // In collapsed view, the "Problems" button resets filter to 'all'
      const problemsBtn = screen.getByText('Problems').closest('button')
      expect(problemsBtn).toBeInTheDocument()
      fireEvent.click(problemsBtn!)
      // Still collapsed but filter is 'all'
      expect(screen.getByText('Problems')).toBeInTheDocument()
    })

    it('expands from collapsed view via expand button', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      // Filter to errors, then collapse
      fireEvent.click(screen.getByText('2'))
      fireEvent.click(getCollapseButton())
      // First reset filter via "Problems" button, then expand
      const problemsBtn = screen.getByText('Problems').closest('button')
      fireEvent.click(problemsBtn!)
      // Click expand
      fireEvent.click(getExpandButton())
      // Panel should be expanded with all 4 problems
      expect(screen.getByRole('listbox')).toBeInTheDocument()
      expect(screen.getAllByRole('option')).toHaveLength(4)
    })

    it('keeps filter state when expanding without resetting', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      // Filter to errors, then collapse
      fireEvent.click(screen.getByText('2'))
      fireEvent.click(getCollapseButton())
      // Click expand directly without resetting filter
      fireEvent.click(getExpandButton())
      // Panel expanded but filter is still 'errors' (2 items)
      expect(screen.getByRole('listbox')).toBeInTheDocument()
      expect(screen.getAllByRole('option')).toHaveLength(2)
    })

    it('shows total count in collapsed view', () => {
      render(<ProblemsPanel problems={sampleProblems} />)
      fireEvent.click(getCollapseButton())
      expect(screen.getByText('(4)')).toBeInTheDocument()
    })

    it('does not show error count badge in collapsed view when no errors', () => {
      const warningsOnly = [
        { id: 'p1', file: '/src/app.ts', line: 1, column: 1, message: 'Warn', severity: 'warning' as const },
      ]
      const { container } = render(<ProblemsPanel problems={warningsOnly} />)
      fireEvent.click(getCollapseButton())
      // Should show "Problems" text but no error badge
      expect(screen.getByText('Problems')).toBeInTheDocument()
      // No text-error element
      expect(container.querySelector('.text-error')).not.toBeInTheDocument()
      // Should show warning badge
      const warnSpan = container.querySelector('.text-warning')
      expect(warnSpan).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Resize
  // ---------------------------------------------------------------------------
  describe('resize', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('renders resize handle', () => {
      const { container } = render(<ProblemsPanel problems={sampleProblems} />)
      const resizeHandle = container.querySelector('.cursor-ns-resize')
      expect(resizeHandle).toBeInTheDocument()
    })

    it('starts resize on mousedown on handle', () => {
      const { container } = render(<ProblemsPanel problems={sampleProblems} />)
      const resizeHandle = container.querySelector('.cursor-ns-resize') as HTMLElement
      fireEvent.mouseDown(resizeHandle, { clientY: 200 })
      fireEvent.mouseMove(document, { clientY: 180 })
      act(() => { vi.advanceTimersByTime(0) })
      // Height should increase: resizeStartHeight 200 + (200-180) = 220
      const panelDiv = container.querySelector('[class*="bg-mac-bg"]') as HTMLElement
      expect(panelDiv.style.height).toBe('220px')
    })

    it('clamps height to minHeight on resize', () => {
      const { container } = render(<ProblemsPanel problems={sampleProblems} defaultHeight={200} minHeight={100} />)
      const resizeHandle = container.querySelector('.cursor-ns-resize') as HTMLElement
      fireEvent.mouseDown(resizeHandle, { clientY: 200 })
      fireEvent.mouseMove(document, { clientY: 500 })
      act(() => { vi.advanceTimersByTime(0) })
      const panelDiv = container.querySelector('[class*="bg-mac-bg"]') as HTMLElement
      expect(panelDiv.style.height).toBe('100px')
    })

    it('clamps height to maxHeight on resize', () => {
      const { container } = render(<ProblemsPanel problems={sampleProblems} defaultHeight={200} maxHeight={300} />)
      const resizeHandle = container.querySelector('.cursor-ns-resize') as HTMLElement
      fireEvent.mouseDown(resizeHandle, { clientY: 200 })
      fireEvent.mouseMove(document, { clientY: -200 })
      act(() => { vi.advanceTimersByTime(0) })
      const panelDiv = container.querySelector('[class*="bg-mac-bg"]') as HTMLElement
      expect(panelDiv.style.height).toBe('300px')
    })

    it('stops resizing on mouseup', () => {
      const { container } = render(<ProblemsPanel problems={sampleProblems} defaultHeight={200} />)
      const resizeHandle = container.querySelector('.cursor-ns-resize') as HTMLElement
      fireEvent.mouseDown(resizeHandle, { clientY: 200 })
      fireEvent.mouseUp(document)
      act(() => { vi.advanceTimersByTime(0) })
      const panelDiv = container.querySelector('[class*="bg-mac-bg"]') as HTMLElement
      const heightBefore = panelDiv.style.height
      fireEvent.mouseMove(document, { clientY: 100 })
      act(() => { vi.advanceTimersByTime(0) })
      expect(panelDiv.style.height).toBe(heightBefore)
    })

    it('cleans up event listeners on unmount while resizing', () => {
      const { container, unmount } = render(<ProblemsPanel problems={sampleProblems} />)
      const resizeHandle = container.querySelector('.cursor-ns-resize') as HTMLElement
      fireEvent.mouseDown(resizeHandle, { clientY: 200 })
      expect(() => unmount()).not.toThrow()
    })

    it('respects custom minHeight and maxHeight props', () => {
      const { container } = render(
        <ProblemsPanel problems={sampleProblems} defaultHeight={150} minHeight={120} maxHeight={400} />
      )
      const panelDiv = container.querySelector('[class*="bg-mac-bg"]') as HTMLElement
      expect(panelDiv.style.height).toBe('150px')
    })

    it('computes list height as panel height minus 50', () => {
      render(<ProblemsPanel problems={sampleProblems} defaultHeight={250} />)
      const listbox = screen.getByRole('listbox')
      expect(listbox.style.height).toBe('200px')
    })
  })

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------
  describe('edge cases', () => {
    it('handles problems with same file and line', () => {
      const sameFileProblems = [
        { id: 'p1', file: '/src/app.ts', line: 5, column: 1, message: 'Error A', severity: 'error' as const },
        { id: 'p2', file: '/src/app.ts', line: 5, column: 2, message: 'Error B', severity: 'error' as const },
      ]
      render(<ProblemsPanel problems={sameFileProblems} />)
      const options = screen.getAllByRole('option')
      expect(options).toHaveLength(2)
    })

    it('sorts by file name when same severity', () => {
      const problems = [
        { id: 'p1', file: '/src/z.ts', line: 1, column: 1, message: 'Z error', severity: 'error' as const },
        { id: 'p2', file: '/src/a.ts', line: 1, column: 1, message: 'A error', severity: 'error' as const },
      ]
      render(<ProblemsPanel problems={problems} />)
      const options = screen.getAllByRole('option')
      expect(options[0]).toHaveTextContent('A error')
      expect(options[1]).toHaveTextContent('Z error')
    })

    it('renders empty problems with aria-live="polite"', () => {
      render(<ProblemsPanel problems={[]} />)
      const emptyDiv = screen.getByText(/No problems have been detected/)
      expect(emptyDiv).toHaveAttribute('aria-live', 'polite')
    })

    it('handles only warnings with no errors or info', () => {
      const warningsOnly = [
        { id: 'p1', file: '/src/app.ts', line: 1, column: 1, message: 'Warn', severity: 'warning' as const },
      ]
      render(<ProblemsPanel problems={warningsOnly} />)
      expect(screen.getAllByRole('option')).toHaveLength(1)
    })
  })
})
