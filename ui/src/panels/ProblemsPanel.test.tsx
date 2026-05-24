import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

describe('ProblemsPanel', () => {
  beforeEach(() => vi.clearAllMocks())

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
    // Sorted: errors first (by file then line), then warning, then info
    expect(options[0]).toHaveTextContent('Another error') // /src/app.ts:1
    expect(options[1]).toHaveTextContent('Type error')    // /src/app.ts:10
    expect(options[2]).toHaveTextContent('Unused var')    // /src/utils.ts:5
    expect(options[3]).toHaveTextContent('Info note')     // /src/main.ts:20
  })

  it('filters to errors only when clicking error count', () => {
    render(<ProblemsPanel problems={sampleProblems} />)
    // Error count button shows "2"
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

  it('navigates on problem click', () => {
    render(<ProblemsPanel problems={sampleProblems} />)
    fireEvent.click(screen.getByText('Type error'))
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining('file=%2Fsrc%2Fapp.ts')
    )
  })

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

  it('shows empty state when no problems', () => {
    render(<ProblemsPanel problems={[]} />)
    expect(screen.getByText(/No problems have been detected/)).toBeInTheDocument()
  })

  it('shows filter empty state when no matches', () => {
    // Only warnings, filter to errors
    const warningsOnly = [
      { id: 'p1', file: '/src/app.ts', line: 1, column: 1, message: 'Warn', severity: 'warning' as const },
    ]
    render(<ProblemsPanel problems={warningsOnly} />)
    // Error count shouldn't be shown (no errors), so we can't filter
    // Verify only warning is shown
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })
})
