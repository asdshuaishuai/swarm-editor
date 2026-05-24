import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BottomPanel from './BottomPanel'

vi.mock('../store/appStore', () => ({
  useAppStore: (selector: any) => selector({ workspaceProblems: [] }),
}))

vi.mock('./TerminalPanel', () => ({
  default: () => <div data-testid="terminal-panel" />,
}))

vi.mock('./ProblemsPanel', () => ({
  default: ({ problems }: { problems: any[] }) => <div data-testid="problems-panel">{problems.length} problems</div>,
}))

describe('BottomPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders tab buttons', () => {
    render(<BottomPanel />)
    expect(screen.getByText('Problems')).toBeInTheDocument()
    expect(screen.getByText('Terminal')).toBeInTheDocument()
    expect(screen.getByText('Output')).toBeInTheDocument()
    expect(screen.getByText('Debug Console')).toBeInTheDocument()
  })

  it('shows terminal by default', () => {
    render(<BottomPanel />)
    expect(screen.getByTestId('terminal-panel')).toBeInTheDocument()
  })

  it('switches to problems tab', () => {
    render(<BottomPanel />)
    fireEvent.click(screen.getByText('Problems'))
    expect(screen.getByTestId('problems-panel')).toBeInTheDocument()
  })

  it('switches to output tab', () => {
    render(<BottomPanel />)
    fireEvent.click(screen.getByText('Output'))
    expect(screen.getByText('Output panel coming soon')).toBeInTheDocument()
  })

  it('switches to debug console tab', () => {
    render(<BottomPanel />)
    fireEvent.click(screen.getByText('Debug Console'))
    expect(screen.getByText('Debug Console coming soon')).toBeInTheDocument()
  })

  it('shows resize handle', () => {
    render(<BottomPanel />)
    expect(screen.getByTitle('Drag to resize, double-click to maximize/restore')).toBeInTheDocument()
  })

  it('shows keyboard shortcut hint', () => {
    render(<BottomPanel />)
    expect(screen.getByText('Ctrl+J')).toBeInTheDocument()
  })

  it('toggles panel visibility on toggle-terminal event', () => {
    render(<BottomPanel />)
    expect(screen.getByTestId('terminal-panel')).toBeInTheDocument()
    fireEvent(window, new Event('toggle-terminal'))
    expect(screen.queryByTestId('terminal-panel')).toBeNull()
  })

  it('shows problems tab on show-problems event', () => {
    render(<BottomPanel />)
    fireEvent(window, new Event('show-problems'))
    expect(screen.getByTestId('problems-panel')).toBeInTheDocument()
  })

  it('persists panel height to localStorage', () => {
    render(<BottomPanel />)
    expect(localStorage.getItem('bottomPanelHeight')).toBe('200')
  })
})
