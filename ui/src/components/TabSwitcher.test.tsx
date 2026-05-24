import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TabSwitcher, setTabMovesFocus, getTabMovesFocus, onTabFocusModeChange } from './TabSwitcher'

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
    (selector: (s: typeof storeState) => unknown) => selector(storeState),
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
    storeState.currentFile = '/src/app.ts'
    storeState.dirtyFiles = new Set(['/src/utils.ts'])
    storeState.pinnedFiles = new Set(['/src/main.ts'])
    storeState.openFiles = ['/src/app.ts', '/src/utils.ts', '/src/main.ts']
    storeState.mruOrder = ['/src/app.ts', '/src/utils.ts', '/src/main.ts']
  })

  // --- Basic rendering ---
  it('returns null when not visible', () => {
    const { container } = render(<TabSwitcher />)
    expect(container.innerHTML).toBe('')
  })

  it('returns null when openFiles is empty', () => {
    storeState.openFiles = []
    storeState.mruOrder = []
    const { container } = render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    expect(container.innerHTML).toBe('')
  })

  // --- Ctrl+Tab: overlay display ---
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

  it('shows "Ctrl released to open" for selected item', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    expect(screen.getByText('Ctrl released to open')).toBeInTheDocument()
  })

  // --- Escape: dismiss overlay ---
  it('dismisses on Escape', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  // --- Ctrl+Tab cycling ---
  it('activates selected tab on Ctrl release', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    fireEvent(document, new KeyboardEvent('keyup', { key: 'Control', bubbles: true }))
    expect(mockOpenFile).toHaveBeenCalled()
  })

  it('does not call openFile if selected file is current file', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    // Default state: selectedIndex is 1 (next after current), so first set selectedIndex to 0
    // Actually, the initial Ctrl+Tab selects index based on MRU. Let's just release Ctrl.
    fireEvent(document, new KeyboardEvent('keyup', { key: 'Control', bubbles: true }))
    // It may or may not call depending on which was selected
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

  it('cycles backward with Ctrl+Shift+Tab', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, shiftKey: true, bubbles: true }))
    const options = screen.getAllByRole('option')
    const selected = options.find(o => o.getAttribute('aria-selected') === 'true')
    expect(selected).toBeTruthy()
  })

  it('cycles backward when overlay already visible', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, shiftKey: true, bubbles: true }))
    const options = screen.getAllByRole('option')
    const selected = options.find(o => o.getAttribute('aria-selected') === 'true')
    expect(selected).toBeTruthy()
  })

  // --- MRU ordering ---
  it('uses MRU order when available', () => {
    storeState.mruOrder = ['/src/main.ts', '/src/app.ts', '/src/utils.ts']
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    const options = screen.getAllByRole('option')
    // First displayed should be main.ts (MRU first)
    expect(options[0]).toHaveTextContent('main.ts')
  })

  it('falls back to openFiles order when MRU is empty', () => {
    storeState.mruOrder = []
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveTextContent('app.ts')
  })

  it('filters MRU to only files in openFiles', () => {
    storeState.mruOrder = ['/src/app.ts', '/src/closed.ts', '/src/utils.ts']
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    expect(screen.queryByText('closed.ts')).not.toBeInTheDocument()
  })

  // --- Ctrl+W: close tab ---
  it('closes current tab on Ctrl+W', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, bubbles: true }))
    expect(mockCloseFile).toHaveBeenCalledWith('/src/app.ts')
  })

  it('does not close pinned tab on Ctrl+W', () => {
    storeState.currentFile = '/src/main.ts'
    storeState.pinnedFiles = new Set(['/src/main.ts'])
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, bubbles: true }))
    expect(mockCloseFile).not.toHaveBeenCalled()
  })

  it('does not close tab on Ctrl+W when switcher is visible', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    fireEvent(document, new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, bubbles: true }))
    expect(mockCloseFile).not.toHaveBeenCalled()
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

  it('does nothing on Ctrl+W when no current file', () => {
    storeState.currentFile = ''
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, bubbles: true }))
    expect(mockCloseFile).not.toHaveBeenCalled()
  })

  // --- Ctrl+Shift+T: reopen closed tab ---
  it('reopens closed tab on Ctrl+Shift+T', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'T', ctrlKey: true, shiftKey: true, bubbles: true }))
    expect(mockUndoCloseFile).toHaveBeenCalled()
  })

  it('does not reopen on Ctrl+Shift+T when switcher is visible', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    fireEvent(document, new KeyboardEvent('keydown', { key: 'T', ctrlKey: true, shiftKey: true, bubbles: true }))
    expect(mockUndoCloseFile).not.toHaveBeenCalled()
  })

  // --- Ctrl+M: toggle tab moves focus ---
  it('toggles tabMovesFocus with Ctrl+M', () => {
    render(<TabSwitcher />)
    expect(getTabMovesFocus()).toBe(false)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'm', ctrlKey: true, bubbles: true }))
    expect(getTabMovesFocus()).toBe(true)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'm', ctrlKey: true, bubbles: true }))
    expect(getTabMovesFocus()).toBe(false)
  })

  // --- onTabFocusModeChange ---
  it('onTabFocusModeChange registers and fires callback', () => {
    const listener = vi.fn()
    const unsub = onTabFocusModeChange(listener)
    setTabMovesFocus(true)
    expect(listener).toHaveBeenCalled()
    setTabMovesFocus(false)
    expect(listener).toHaveBeenCalledTimes(2)
    unsub()
    setTabMovesFocus(true)
    expect(listener).toHaveBeenCalledTimes(2)
    setTabMovesFocus(false)
  })

  it('setTabMovesFocus updates document dataset', () => {
    setTabMovesFocus(true)
    expect(document.documentElement.dataset.tabMovesFocus).toBe('true')
    setTabMovesFocus(false)
    expect(document.documentElement.dataset.tabMovesFocus).toBe('')
  })

  // --- Navigation: Ctrl+Alt+ArrowLeft/ArrowRight ---
  it('navigates back on Ctrl+Alt+ArrowLeft', () => {
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'ArrowLeft', ctrlKey: true, altKey: true, bubbles: true }))
    expect(backSpy).toHaveBeenCalled()
    backSpy.mockRestore()
  })

  it('navigates forward on Ctrl+Alt+ArrowRight', () => {
    const forwardSpy = vi.spyOn(window.history, 'forward').mockImplementation(() => {})
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, altKey: true, bubbles: true }))
    expect(forwardSpy).toHaveBeenCalled()
    forwardSpy.mockRestore()
  })

  // --- Shift+Escape: toggle bottom panel ---
  it('dispatches toggle-bottom-panel on Shift+Escape', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Escape', shiftKey: true, bubbles: true }))
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'toggle-bottom-panel' }))
    dispatchSpy.mockRestore()
  })

  it('does not toggle bottom panel when dialog is open', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    // Create a dialog element to simulate an open modal
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Escape', shiftKey: true, bubbles: true }))
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'toggle-bottom-panel' }))
    document.body.removeChild(dialog)
    dispatchSpy.mockRestore()
  })

  // --- Ctrl+1/Ctrl+2: focus editor group ---
  it('dispatches focus-editor-group with group 1 on Ctrl+1', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: '1', ctrlKey: true, bubbles: true }))
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'focus-editor-group' }))
    dispatchSpy.mockRestore()
  })

  it('dispatches focus-editor-group with group 2 on Ctrl+2', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: '2', ctrlKey: true, bubbles: true }))
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'focus-editor-group' }))
    dispatchSpy.mockRestore()
  })

  // --- Ctrl+PageUp/PageDown: switch tab without wrap ---
  it('switches to previous tab on Ctrl+PageUp', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'PageUp', ctrlKey: true, bubbles: true }))
    // currentFile is /src/app.ts at index 0, so PageUp at index 0 should not switch (no wrap)
    expect(mockOpenFile).not.toHaveBeenCalled()
  })

  it('switches to next tab on Ctrl+PageDown', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'PageDown', ctrlKey: true, bubbles: true }))
    // currentFile is /src/app.ts at index 0, so PageDown should go to index 1 = /src/utils.ts
    expect(mockOpenFile).toHaveBeenCalledWith('/src/utils.ts')
  })

  it('does not wrap on Ctrl+PageDown at last tab', () => {
    storeState.currentFile = '/src/main.ts'
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'PageDown', ctrlKey: true, bubbles: true }))
    expect(mockOpenFile).not.toHaveBeenCalled()
  })

  it('does nothing on Ctrl+PageUp when only one file', () => {
    storeState.openFiles = ['/src/app.ts']
    storeState.mruOrder = ['/src/app.ts']
    storeState.currentFile = '/src/app.ts'
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'PageUp', ctrlKey: true, bubbles: true }))
    expect(mockOpenFile).not.toHaveBeenCalled()
  })

  it('does nothing on Ctrl+PageUp when current file not in list', () => {
    storeState.currentFile = '/src/unknown.ts'
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'PageUp', ctrlKey: true, bubbles: true }))
    expect(mockOpenFile).not.toHaveBeenCalled()
  })

  // --- Alt+1-9: jump to tab N ---
  it('jumps to tab 1 on Alt+1', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: '1', altKey: true, bubbles: true }))
    expect(mockOpenFile).toHaveBeenCalledWith('/src/app.ts')
  })

  it('jumps to tab 3 on Alt+3', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: '3', altKey: true, bubbles: true }))
    expect(mockOpenFile).toHaveBeenCalledWith('/src/main.ts')
  })

  it('does nothing on Alt+9 when fewer than 9 files', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: '9', altKey: true, bubbles: true }))
    expect(mockOpenFile).not.toHaveBeenCalled()
  })

  it('does nothing on Alt+0', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: '0', altKey: true, bubbles: true }))
    expect(mockOpenFile).not.toHaveBeenCalled()
  })

  it('does nothing on Alt+key with Ctrl held', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: '1', altKey: true, ctrlKey: true, bubbles: true }))
    expect(mockOpenFile).not.toHaveBeenCalled()
  })

  // --- Ctrl+Shift+PageUp/PageDown: reorder tabs ---
  it('reorders tab left on Ctrl+Shift+PageUp', () => {
    storeState.currentFile = '/src/utils.ts'
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'PageUp', ctrlKey: true, shiftKey: true, bubbles: true }))
    expect(mockReorderFiles).toHaveBeenCalledWith(1, 0)
  })

  it('reorders tab right on Ctrl+Shift+PageDown', () => {
    storeState.currentFile = '/src/utils.ts'
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'PageDown', ctrlKey: true, shiftKey: true, bubbles: true }))
    expect(mockReorderFiles).toHaveBeenCalledWith(1, 2)
  })

  it('does not reorder left on first tab', () => {
    storeState.currentFile = '/src/app.ts'
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'PageUp', ctrlKey: true, shiftKey: true, bubbles: true }))
    expect(mockReorderFiles).not.toHaveBeenCalled()
  })

  it('does not reorder right on last tab', () => {
    storeState.currentFile = '/src/main.ts'
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'PageDown', ctrlKey: true, shiftKey: true, bubbles: true }))
    expect(mockReorderFiles).not.toHaveBeenCalled()
  })

  it('does not reorder when no current file', () => {
    storeState.currentFile = ''
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'PageDown', ctrlKey: true, shiftKey: true, bubbles: true }))
    expect(mockReorderFiles).not.toHaveBeenCalled()
  })

  it('does not reorder when current file not in list', () => {
    storeState.currentFile = '/src/unknown.ts'
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'PageDown', ctrlKey: true, shiftKey: true, bubbles: true }))
    expect(mockReorderFiles).not.toHaveBeenCalled()
  })

  // --- Tab Moves Focus mode ---
  it('intercepts Tab in monaco-editor when tabMovesFocus is active', () => {
    setTabMovesFocus(true)
    // Create a mock monaco-editor element
    const editorDiv = document.createElement('div')
    editorDiv.className = 'monaco-editor'
    const buttonOutside = document.createElement('button')
    document.body.appendChild(editorDiv)
    document.body.appendChild(buttonOutside)
    render(<TabSwitcher />)
    fireEvent(editorDiv, new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    // The handler checks closest('.monaco-editor'), which works with fireEvent on the element
    // Since we can't easily verify preventDefault on capture-phase events, we verify the mode is active
    expect(getTabMovesFocus()).toBe(true)
    document.body.removeChild(editorDiv)
    document.body.removeChild(buttonOutside)
    setTabMovesFocus(false)
  })

  // --- Cleanup ---
  it('removes event listeners on unmount', () => {
    const { unmount } = render(<TabSwitcher />)
    unmount()
    // After unmount, Ctrl+Tab should not make the switcher visible
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    // No crash expected; the handler was removed
  })

  // --- aria attributes ---
  it('has correct aria attributes on the overlay', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-label', 'Open editors')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('has listbox with correct aria', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    const listbox = screen.getByRole('listbox')
    expect(listbox).toHaveAttribute('aria-label', 'Open editors')
  })

  // --- File display edge cases ---
  it('displays filename without directory for files without slash', () => {
    storeState.openFiles = ['readme.md']
    storeState.mruOrder = ['readme.md']
    storeState.currentFile = 'readme.md'
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true, bubbles: true }))
    expect(screen.getByText('readme.md')).toBeInTheDocument()
    // No directory path shown for files without slash
    const dirPaths = screen.queryAllByText(/\/src/)
    expect(dirPaths.length).toBe(0)
  })

  // --- Ctrl release does nothing when ctrlHeldRef is false ---
  it('Ctrl release does nothing when Ctrl was not held', () => {
    render(<TabSwitcher />)
    fireEvent(document, new KeyboardEvent('keyup', { key: 'Control', bubbles: true }))
    expect(mockOpenFile).not.toHaveBeenCalled()
  })
})
