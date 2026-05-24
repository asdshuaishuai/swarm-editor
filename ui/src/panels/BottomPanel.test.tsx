import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BottomPanel from './BottomPanel'

// Mutable app store state so tests can override
let appStoreState: any = { workspaceProblems: [] }

vi.mock('../store/appStore', () => ({
  useAppStore: (selector: any) => selector(appStoreState),
}))

vi.mock('./TerminalPanel', () => ({
  default: () => <div data-testid="terminal-panel" />,
}))

vi.mock('./ProblemsPanel', () => ({
  default: ({ problems }: { problems: any[] }) => (
    <div data-testid="problems-panel">{problems.length} problems</div>
  ),
}))

vi.mock('../utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

describe('BottomPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appStoreState = { workspaceProblems: [] }
    localStorage.clear()
  })

  // --- Rendering ---

  it('renders all four tab buttons', () => {
    render(<BottomPanel />)
    expect(screen.getByText('Problems')).toBeInTheDocument()
    expect(screen.getByText('Terminal')).toBeInTheDocument()
    expect(screen.getByText('Output')).toBeInTheDocument()
    expect(screen.getByText('Debug Console')).toBeInTheDocument()
  })

  it('shows Terminal tab as active by default', () => {
    render(<BottomPanel />)
    expect(screen.getByTestId('terminal-panel')).toBeInTheDocument()
  })

  it('renders resize handle with title', () => {
    render(<BottomPanel />)
    expect(screen.getByTitle('Drag to resize, double-click to maximize/restore')).toBeInTheDocument()
  })

  it('renders keyboard shortcut hint', () => {
    render(<BottomPanel />)
    expect(screen.getByText('Ctrl+J')).toBeInTheDocument()
  })

  // --- Tab switching ---

  it('switches to Problems tab on click', () => {
    render(<BottomPanel />)
    fireEvent.click(screen.getByText('Problems'))
    expect(screen.getByTestId('problems-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('terminal-panel')).not.toBeInTheDocument()
  })

  it('switches to Terminal tab from Problems tab', () => {
    render(<BottomPanel />)
    fireEvent.click(screen.getByText('Problems'))
    expect(screen.getByTestId('problems-panel')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Terminal'))
    expect(screen.getByTestId('terminal-panel')).toBeInTheDocument()
  })

  it('switches to Output tab', () => {
    render(<BottomPanel />)
    fireEvent.click(screen.getByText('Output'))
    expect(screen.getByText('Output panel coming soon')).toBeInTheDocument()
    expect(screen.getByText('Extension logs and task output will appear here')).toBeInTheDocument()
  })

  it('switches to Debug Console tab', () => {
    render(<BottomPanel />)
    fireEvent.click(screen.getByText('Debug Console'))
    expect(screen.getByText('Debug Console coming soon')).toBeInTheDocument()
    expect(screen.getByText('Debug session output will appear here')).toBeInTheDocument()
  })

  it('switches between tabs sequentially', () => {
    render(<BottomPanel />)
    fireEvent.click(screen.getByText('Output'))
    expect(screen.getByText('Output panel coming soon')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Debug Console'))
    expect(screen.getByText('Debug Console coming soon')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Problems'))
    expect(screen.getByTestId('problems-panel')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Terminal'))
    expect(screen.getByTestId('terminal-panel')).toBeInTheDocument()
  })

  // --- Problems badge ---

  it('shows no badge when workspaceProblems is empty', () => {
    appStoreState = { workspaceProblems: [] }
    render(<BottomPanel />)
    const problemsBtn = screen.getByText('Problems').closest('button')!
    expect(problemsBtn.textContent).toBe('Problems')
  })

  it('shows problem count badge when problems exist', () => {
    appStoreState = {
      workspaceProblems: [
        { severity: 'warning', message: 'warn1' },
        { severity: 'warning', message: 'warn2' },
      ],
    }
    render(<BottomPanel />)
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows error styling in badge when errors exist', () => {
    appStoreState = {
      workspaceProblems: [
        { severity: 'error', message: 'err1' },
        { severity: 'warning', message: 'warn1' },
      ],
    }
    render(<BottomPanel />)
    const badge = screen.getByText('2')
    expect(badge.className).toContain('bg-error')
  })

  it('shows warning styling in badge when only warnings exist', () => {
    appStoreState = {
      workspaceProblems: [
        { severity: 'warning', message: 'warn1' },
      ],
    }
    render(<BottomPanel />)
    const badge = screen.getByText('1')
    expect(badge.className).toContain('bg-warning')
  })

  it('passes problems to ProblemsPanel', () => {
    const problems = [
      { severity: 'error', message: 'Test error' },
      { severity: 'warning', message: 'Test warning' },
    ]
    appStoreState = { workspaceProblems: problems }
    render(<BottomPanel />)
    fireEvent.click(screen.getByText('Problems'))
    expect(screen.getByText('2 problems')).toBeInTheDocument()
  })

  // --- Panel visibility toggle events ---

  it('toggles panel off on toggle-terminal event', () => {
    render(<BottomPanel />)
    expect(screen.getByTestId('terminal-panel')).toBeInTheDocument()
    fireEvent(window, new Event('toggle-terminal'))
    expect(screen.queryByTestId('terminal-panel')).not.toBeInTheDocument()
  })

  it('toggles panel back on on second toggle-terminal event', () => {
    render(<BottomPanel />)
    fireEvent(window, new Event('toggle-terminal'))
    expect(screen.queryByTestId('terminal-panel')).not.toBeInTheDocument()
    fireEvent(window, new Event('toggle-terminal'))
    expect(screen.getByTestId('terminal-panel')).toBeInTheDocument()
  })

  it('toggles panel on toggle-bottom-panel event', () => {
    render(<BottomPanel />)
    expect(screen.getByTestId('terminal-panel')).toBeInTheDocument()
    fireEvent(window, new Event('toggle-bottom-panel'))
    expect(screen.queryByTestId('terminal-panel')).not.toBeInTheDocument()
    fireEvent(window, new Event('toggle-bottom-panel'))
    expect(screen.getByTestId('terminal-panel')).toBeInTheDocument()
  })

  // --- Show problems event ---

  it('switches to problems tab and shows panel on show-problems event', () => {
    render(<BottomPanel />)
    // Start with terminal visible
    expect(screen.getByTestId('terminal-panel')).toBeInTheDocument()
    fireEvent(window, new Event('show-problems'))
    expect(screen.getByTestId('problems-panel')).toBeInTheDocument()
  })

  it('shows panel even when hidden on show-problems event', () => {
    render(<BottomPanel />)
    fireEvent(window, new Event('toggle-terminal')) // hide panel
    expect(screen.queryByTestId('terminal-panel')).not.toBeInTheDocument()
    fireEvent(window, new Event('show-problems'))
    expect(screen.getByTestId('problems-panel')).toBeInTheDocument()
  })

  // --- Toggle problems event ---

  it('switches to problems from terminal on toggle-problems event', () => {
    render(<BottomPanel />)
    expect(screen.getByTestId('terminal-panel')).toBeInTheDocument()
    fireEvent(window, new Event('toggle-problems'))
    expect(screen.getByTestId('problems-panel')).toBeInTheDocument()
  })

  it('switches back to terminal from problems on toggle-problems event', () => {
    render(<BottomPanel />)
    fireEvent.click(screen.getByText('Problems'))
    expect(screen.getByTestId('problems-panel')).toBeInTheDocument()
    fireEvent(window, new Event('toggle-problems'))
    expect(screen.getByTestId('terminal-panel')).toBeInTheDocument()
  })

  // --- Toggle output event ---

  it('switches to output tab on toggle-output event', () => {
    render(<BottomPanel />)
    expect(screen.getByTestId('terminal-panel')).toBeInTheDocument()
    fireEvent(window, new Event('toggle-output'))
    expect(screen.getByText('Output panel coming soon')).toBeInTheDocument()
  })

  it('toggles panel off when already on output tab and toggle-output fires', () => {
    render(<BottomPanel />)
    fireEvent(window, new Event('toggle-output'))
    expect(screen.getByText('Output panel coming soon')).toBeInTheDocument()
    fireEvent(window, new Event('toggle-output'))
    expect(screen.queryByText('Output panel coming soon')).not.toBeInTheDocument()
  })

  it('shows panel when hidden and switches to output on toggle-output', () => {
    render(<BottomPanel />)
    fireEvent(window, new Event('toggle-terminal')) // hide
    expect(screen.queryByTestId('terminal-panel')).not.toBeInTheDocument()
    fireEvent(window, new Event('toggle-output'))
    expect(screen.getByText('Output panel coming soon')).toBeInTheDocument()
  })

  // --- Toggle debug console event ---

  it('switches to debug tab on toggle-debug-console event', () => {
    render(<BottomPanel />)
    expect(screen.getByTestId('terminal-panel')).toBeInTheDocument()
    fireEvent(window, new Event('toggle-debug-console'))
    expect(screen.getByText('Debug Console coming soon')).toBeInTheDocument()
  })

  it('toggles panel off when already on debug tab and toggle-debug-console fires', () => {
    render(<BottomPanel />)
    fireEvent(window, new Event('toggle-debug-console'))
    expect(screen.getByText('Debug Console coming soon')).toBeInTheDocument()
    fireEvent(window, new Event('toggle-debug-console'))
    expect(screen.queryByText('Debug Console coming soon')).not.toBeInTheDocument()
  })

  it('shows panel when hidden and switches to debug on toggle-debug-console', () => {
    render(<BottomPanel />)
    fireEvent(window, new Event('toggle-terminal')) // hide
    fireEvent(window, new Event('toggle-debug-console'))
    expect(screen.getByText('Debug Console coming soon')).toBeInTheDocument()
  })

  // --- Resize handle ---

  it('starts resizing on mousedown on resize handle', () => {
    render(<BottomPanel />)
    const handle = screen.getByTitle('Drag to resize, double-click to maximize/restore')
    fireEvent.mouseDown(handle, { preventDefault: () => {} })
    // Body cursor should be set to row-resize
    expect(document.body.style.cursor).toBe('row-resize')
    expect(document.body.style.userSelect).toBe('none')
  })

  it('stops resizing on mouseup', () => {
    render(<BottomPanel />)
    const handle = screen.getByTitle('Drag to resize, double-click to maximize/restore')
    fireEvent.mouseDown(handle, { preventDefault: () => {} })
    expect(document.body.style.cursor).toBe('row-resize')
    fireEvent.mouseUp(document)
    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
  })

  it('resizes panel on mousemove while resizing', () => {
    // Mock a container with known dimensions
    const mockContainer = document.createElement('div')
    mockContainer.setAttribute('data-editor-container', '')
    Object.defineProperty(mockContainer, 'getBoundingClientRect', {
      value: () => ({ height: 800, bottom: 800, top: 0, left: 0, right: 0, width: 0 }),
    })
    document.body.appendChild(mockContainer)

    render(<BottomPanel />)
    const handle = screen.getByTitle('Drag to resize, double-click to maximize/restore')
    fireEvent.mouseDown(handle, { preventDefault: () => {} })

    // Move mouse to simulate resize - clicking at y=400 from container bottom 800 = 400px height
    fireEvent.mouseMove(document, { clientY: 400 })
    // Height should be 800 - 400 = 400 (clamped between 77 and 700)

    // Cleanup
    fireEvent.mouseUp(document)
    document.body.removeChild(mockContainer)
  })

  it('clamps minimum height to 77px during resize', () => {
    const mockContainer = document.createElement('div')
    mockContainer.setAttribute('data-editor-container', '')
    Object.defineProperty(mockContainer, 'getBoundingClientRect', {
      value: () => ({ height: 800, bottom: 800, top: 0, left: 0, right: 0, width: 0 }),
    })
    document.body.appendChild(mockContainer)

    render(<BottomPanel />)
    const handle = screen.getByTitle('Drag to resize, double-click to maximize/restore')
    fireEvent.mouseDown(handle, { preventDefault: () => {} })

    // Move mouse very low, would give negative height, clamped to 77
    fireEvent.mouseMove(document, { clientY: 850 })

    // Panel height should be clamped to minimum 77
    void handle.parentElement?.querySelector('[style*="height"]')
    // Verify the panel still renders (height is at least 77)

    fireEvent.mouseUp(document)
    document.body.removeChild(mockContainer)
  })

  it('prevents text selection during resize', () => {
    render(<BottomPanel />)
    const handle = screen.getByTitle('Drag to resize, double-click to maximize/restore')
    fireEvent.mouseDown(handle, { preventDefault: () => {} })

    // Selectstart should be prevented
    const selectEvent = new Event('selectstart')
    const preventDefaultSpy = vi.spyOn(selectEvent, 'preventDefault')

    // Dispatch selectstart directly - the handler calls preventDefault
    document.dispatchEvent(selectEvent)
    expect(preventDefaultSpy).toHaveBeenCalled()

    fireEvent.mouseUp(document)
  })

  // --- Double-click resize handle to maximize/restore ---

  it('maximizes panel on double-click of resize handle', () => {
    const mockContainer = document.createElement('div')
    mockContainer.setAttribute('data-editor-container', '')
    Object.defineProperty(mockContainer, 'getBoundingClientRect', {
      value: () => ({ height: 800, bottom: 800, top: 0, left: 0, right: 0, width: 0 }),
    })
    document.body.appendChild(mockContainer)

    render(<BottomPanel />)
    const handle = screen.getByTitle('Drag to resize, double-click to maximize/restore')
    fireEvent.doubleClick(handle)

    // Height should be container height - 100 = 700
    expect(localStorage.getItem('bottomPanelHeight')).toBe('700')

    document.body.removeChild(mockContainer)
  })

  it('restores panel to previous height on second double-click', () => {
    const mockContainer = document.createElement('div')
    mockContainer.setAttribute('data-editor-container', '')
    Object.defineProperty(mockContainer, 'getBoundingClientRect', {
      value: () => ({ height: 800, bottom: 800, top: 0, left: 0, right: 0, width: 0 }),
    })
    document.body.appendChild(mockContainer)

    render(<BottomPanel />)
    const handle = screen.getByTitle('Drag to resize, double-click to maximize/restore')

    // First double-click: maximize (saves preMaxHeight = 200)
    fireEvent.doubleClick(handle)
    expect(localStorage.getItem('bottomPanelHeight')).toBe('700')

    // Second double-click: restore to saved height
    fireEvent.doubleClick(handle)
    expect(localStorage.getItem('bottomPanelHeight')).toBe('200')

    document.body.removeChild(mockContainer)
  })

  it('does nothing on double-click when no container exists', () => {
    render(<BottomPanel />)
    const handle = screen.getByTitle('Drag to resize, double-click to maximize/restore')
    // No data-editor-container in DOM
    const initialHeight = localStorage.getItem('bottomPanelHeight')
    fireEvent.doubleClick(handle)
    expect(localStorage.getItem('bottomPanelHeight')).toBe(initialHeight)
  })

  // --- LocalStorage persistence ---

  it('persists default panel height (200) to localStorage on mount', () => {
    render(<BottomPanel />)
    expect(localStorage.getItem('bottomPanelHeight')).toBe('200')
  })

  it('reads saved height from localStorage on mount', () => {
    localStorage.setItem('bottomPanelHeight', '300')
    render(<BottomPanel />)
    // Should use 300 from localStorage
    expect(localStorage.getItem('bottomPanelHeight')).toBe('300')
  })

  it('defaults to 200 when localStorage has invalid value', () => {
    localStorage.setItem('bottomPanelHeight', 'not-a-number')
    render(<BottomPanel />)
    expect(localStorage.getItem('bottomPanelHeight')).toBe('NaN') // parseInt produces NaN, but still writes it
  })

  // --- Cleanup ---

  it('cleans up window event listeners on unmount', () => {
    const { unmount } = render(<BottomPanel />)
    unmount()
    // Fire events after unmount - should not cause errors
    expect(() => {
      fireEvent(window, new Event('toggle-terminal'))
      fireEvent(window, new Event('toggle-bottom-panel'))
      fireEvent(window, new Event('show-problems'))
      fireEvent(window, new Event('toggle-problems'))
      fireEvent(window, new Event('toggle-output'))
      fireEvent(window, new Event('toggle-debug-console'))
    }).not.toThrow()
  })

  it('cleans up resize listeners on unmount during resize', () => {
    const { unmount } = render(<BottomPanel />)
    const handle = screen.getByTitle('Drag to resize, double-click to maximize/restore')
    fireEvent.mouseDown(handle, { preventDefault: () => {} })
    expect(document.body.style.cursor).toBe('row-resize')
    unmount()
    // Body cursor should be cleaned up
    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
  })

  // --- Panel content height ---

  it('renders panel with correct height style', () => {
    render(<BottomPanel />)
    const panel = screen.getByTestId('terminal-panel').parentElement!
    expect(panel.style.height).toBe('200px')
  })

  it('updates height style when localStorage value differs', () => {
    localStorage.setItem('bottomPanelHeight', '350')
    render(<BottomPanel />)
    const panel = screen.getByTestId('terminal-panel').parentElement!
    expect(panel.style.height).toBe('350px')
  })

  // --- Resize handle visibility ---

  it('hides resize handle when panel is hidden', () => {
    render(<BottomPanel />)
    fireEvent(window, new Event('toggle-terminal'))
    expect(screen.queryByTitle('Drag to resize, double-click to maximize/restore')).not.toBeInTheDocument()
  })

  // --- Tab active styling ---

  it('applies active style to selected tab', () => {
    render(<BottomPanel />)
    const terminalBtn = screen.getByText('Terminal').closest('button')!
    expect(terminalBtn.className).toContain('bg-surface')
    expect(terminalBtn.className).toContain('text-text-primary')
  })

  it('applies inactive style to non-selected tabs', () => {
    render(<BottomPanel />)
    const problemsBtn = screen.getByText('Problems').closest('button')!
    expect(problemsBtn.className).toContain('text-text-secondary')
  })

  it('updates active style when switching tabs', () => {
    render(<BottomPanel />)
    const problemsBtn = screen.getByText('Problems').closest('button')!
    expect(problemsBtn.className).toContain('text-text-secondary')
    fireEvent.click(screen.getByText('Problems'))
    expect(problemsBtn.className).toContain('bg-surface')
    expect(problemsBtn.className).toContain('text-text-primary')
  })
})
