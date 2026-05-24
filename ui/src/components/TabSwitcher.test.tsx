import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TabSwitcher, setTabMovesFocus, getTabMovesFocus } from './TabSwitcher'

const mockOpenFile = vi.fn().mockResolvedValue(undefined)
const mockCloseFile = vi.fn()
const mockReorderFiles = vi.fn()
const mockUndoCloseFile = vi.fn().mockResolvedValue(undefined)

const storeState = {
  openFiles: ['/src/app.ts', '/src/utils.ts', '/src/main.ts'],
  mruOrder: ['/src/app.ts', '/src/utils.ts', '/src/main.ts'],
  currentFile: '/src/app.ts',
  dirtyFiles: new Set(['/src/utils.ts']),
  pinnedFiles: new Set(['/src/main.ts']),
  openFile: mockOpenFile,
  closeFile: mockCloseFile,
  reorderFiles: mockReorderFiles,
  undoCloseFile: mockUndoCloseFile,
}

vi.mock('../stores/workspaceStore', () => ({
  useWorkspaceStore: Object.assign(
    (selector: any) => selector(storeState),
    { getState: () => storeState }
  ),
}))

vi.mock('../utils', () => ({
  getFileIcon: () => 'svg',
  getFileIconColor: () => 'text-blue-400',
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

describe('TabSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setTabMovesFocus(false)
    // Reset store state
    storeState.currentFile = '/src/app.ts'
    storeState.dirtyFiles = new Set(['/src/utils.ts'])
    storeState.pinnedFiles = new Set(['/src/main.ts'])
  })

  it('returns null when not visible', () => {
    const { container } = render(<TabSwitcher />)
    expect(container.innerHTML).toBe('')
  })

  it('shows overlay on Ctrl+Tab', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    expect(screen.getByRole('dialog', { name: 'Open editors' })).toBeInTheDocument()
  })

  it('displays open files in the list', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    expect(screen.getByText('app.ts')).toBeInTheDocument()
    expect(screen.getByText('utils.ts')).toBeInTheDocument()
    expect(screen.getByText('main.ts')).toBeInTheDocument()
  })

  it('shows file count in header', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    expect(screen.getByText(/Open Editors \(3\)/)).toBeInTheDocument()
  })

  it('shows dirty indicator for unsaved files', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    expect(screen.getByTitle('Unsaved changes')).toBeInTheDocument()
  })

  it('shows pinned indicator for pinned files', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    expect(screen.getByTitle('Pinned')).toBeInTheDocument()
  })

  it('shows directory paths', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    expect(screen.getAllByText('/src').length).toBeGreaterThan(0)
  })

  it('dismisses on Escape', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('activates selected tab on Ctrl release', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    fireEvent(document, new KeyboardEvent('keyup', { key: 'Control', bubbles: true }))
    expect(mockOpenFile).toHaveBeenCalled()
  })

  it('cycles forward with repeated Ctrl+Tab', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    const options = screen.getAllByRole('option')
    const selected = options.find(o => o.getAttribute('aria-selected') === 'true')
    expect(selected).toBeTruthy()
  })

  it('closes current tab on Ctrl+W', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, bubbles: true }))
    expect(mockCloseFile).toHaveBeenCalledWith('/src/app.ts')
  })

  it('dispatches close-current-tab for dirty files on Ctrl+W', () => {
    storeState.currentFile = '/src/utils.ts'
    storeState.dirtyFiles = new Set(['/src/utils.ts'])
    storeState.pinnedFiles = new Set()
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, bubbles: true }))
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'close-current-tab' }))
    dispatchSpy.mockRestore()
  })

  it('toggles tabMovesFocus with Ctrl+M', () => {
    render(<TabSwitcher />)
    expect(getTabMovesFocus()).toBe(false)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'm', ctrlKey: true, bubbles: true }))
    expect(getTabMovesFocus()).toBe(true)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'm', ctrlKey: true, bubbles: true }))
    expect(getTabMovesFocus()).toBe(false)
  })

  it('reopens closed tab on Ctrl+Shift+T', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'T', ctrlKey: true, shiftKey: true, bubbles: true }))
    expect(mockUndoCloseFile).toHaveBeenCalled()
  })
})
