import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCommandPaletteEvents } from './useCommandPaletteEvents'

// Mock useWindowEvent to capture handlers
const eventHandlers: Record<string, (...args: unknown[]) => void> = {}
vi.mock('./useWindowEvent', () => ({
  useWindowEvent: (event: string, handler: (...args: unknown[]) => void) => {
    eventHandlers[event] = handler
  },
}))

// Mock Tauri dialog plugin
const mockOpenDialog = vi.fn()
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => mockOpenDialog(...args),
}))

// Mock workspace store
const mockSetWorkspacePath = vi.fn()
const mockOpenFile = vi.fn()
vi.mock('../stores/workspaceStore', () => ({
  useWorkspaceStore: Object.assign(
    () => ({ setWorkspacePath: mockSetWorkspacePath, openFile: mockOpenFile, workspacePath: '/workspace' }),
    { getState: () => ({ setWorkspacePath: mockSetWorkspacePath, openFile: mockOpenFile, workspacePath: '/workspace' }) },
  ),
}))

describe('useCommandPaletteEvents', () => {
  const mockToggleSplit = vi.fn()
  const mockHandleCloseSplit = vi.fn()
  const mockSetShowFileTree = vi.fn()
  const mockSetActivityView = vi.fn()
  const mockHandleSave = vi.fn()
  const mockAddToast = vi.fn()
  const mockSetActivePane = vi.fn()
  const mockRunAction = vi.fn()
  const mockRevealLineInCenter = vi.fn()
  const mockSetPosition = vi.fn()
  const mockFocus = vi.fn()

  const createEditorRef = () => ({
    current: {
      getAction: vi.fn().mockReturnValue({ run: mockRunAction }),
      revealLineInCenter: mockRevealLineInCenter,
      setPosition: mockSetPosition,
      focus: mockFocus,
    },
  })

  const baseOptions = {
    currentFile: '/src/app.ts' as string | null,
    showFileTree: true,
    splitDirection: 'horizontal' as string,
    editorRef: { current: null },
    toggleSplit: mockToggleSplit,
    handleCloseSplit: mockHandleCloseSplit,
    setShowFileTree: mockSetShowFileTree,
    setActivityView: mockSetActivityView,
    setActivePane: mockSetActivePane,
    handleSave: mockHandleSave,
    addToast: mockAddToast,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------
  it('registers event handlers on mount', () => {
    renderHook(() => useCommandPaletteEvents(baseOptions))
    expect(eventHandlers['toggle-split']).toBeDefined()
    expect(eventHandlers['close-split']).toBeDefined()
    expect(eventHandlers['save-file']).toBeDefined()
    expect(eventHandlers['toggle-source-control']).toBeDefined()
  })

  it('registers all expected event handlers', () => {
    renderHook(() => useCommandPaletteEvents(baseOptions))
    const expectedEvents = [
      'toggle-split', 'close-split', 'toggle-source-control', 'save-file',
      'go-to-line', 'goto-line-direct', 'open-file', 'open-folder',
      'go-to-file', 'find-in-files', 'replace-in-files', 'git-checkout',
      'focus-editor-group',
    ]
    for (const evt of expectedEvents) {
      expect(eventHandlers[evt]).toBeDefined()
    }
  })

  // ---------------------------------------------------------------------------
  // toggle-split
  // ---------------------------------------------------------------------------
  it('toggle-split calls toggleSplit when file is open', () => {
    renderHook(() => useCommandPaletteEvents(baseOptions))
    eventHandlers['toggle-split']()
    expect(mockToggleSplit).toHaveBeenCalled()
  })

  it('toggle-split does nothing when no file open', () => {
    const opts = { ...baseOptions, currentFile: null }
    renderHook(() => useCommandPaletteEvents(opts))
    eventHandlers['toggle-split']()
    expect(mockToggleSplit).not.toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // close-split
  // ---------------------------------------------------------------------------
  it('close-split calls handleCloseSplit', () => {
    renderHook(() => useCommandPaletteEvents(baseOptions))
    eventHandlers['close-split']()
    expect(mockHandleCloseSplit).toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // save-file
  // ---------------------------------------------------------------------------
  it('save-file calls handleSave when file is open', () => {
    renderHook(() => useCommandPaletteEvents(baseOptions))
    eventHandlers['save-file']()
    expect(mockHandleSave).toHaveBeenCalled()
  })

  it('save-file does nothing when no file open', () => {
    const opts = { ...baseOptions, currentFile: null }
    renderHook(() => useCommandPaletteEvents(opts))
    eventHandlers['save-file']()
    expect(mockHandleSave).not.toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // toggle-source-control
  // ---------------------------------------------------------------------------
  it('toggle-source-control toggles activity view', () => {
    mockSetActivityView.mockImplementation((arg: unknown) => typeof arg === 'function' ? (arg as (prev: string) => string)('sourceControl') : arg)
    renderHook(() => useCommandPaletteEvents(baseOptions))
    eventHandlers['toggle-source-control']()
    expect(mockSetActivityView).toHaveBeenCalled()
  })

  it('toggle-source-control shows file tree when hidden', () => {
    const opts = { ...baseOptions, showFileTree: false }
    renderHook(() => useCommandPaletteEvents(opts))
    eventHandlers['toggle-source-control']()
    expect(mockSetShowFileTree).toHaveBeenCalledWith(true)
  })

  it('toggle-source-control does not show file tree when already visible', () => {
    renderHook(() => useCommandPaletteEvents({ ...baseOptions, showFileTree: true }))
    eventHandlers['toggle-source-control']()
    expect(mockSetShowFileTree).not.toHaveBeenCalled()
  })

  it('toggle-source-control switches from sourceControl to explorer', () => {
    mockSetActivityView.mockImplementation((arg: unknown) => {
      if (typeof arg === 'function') return (arg as (prev: string) => string)('sourceControl')
      return arg
    })
    renderHook(() => useCommandPaletteEvents(baseOptions))
    eventHandlers['toggle-source-control']()
    // The functional updater should be called with 'sourceControl' as prev,
    // causing it to return 'explorer'
    const updater = mockSetActivityView.mock.calls[0][0] as (prev: string) => string
    expect(updater('sourceControl')).toBe('explorer')
  })

  it('toggle-source-control switches from explorer to sourceControl', () => {
    renderHook(() => useCommandPaletteEvents(baseOptions))
    eventHandlers['toggle-source-control']()
    const updater = mockSetActivityView.mock.calls[0][0] as (prev: string) => string
    expect(updater('explorer')).toBe('sourceControl')
  })

  it('toggle-source-control switches from other views to sourceControl', () => {
    renderHook(() => useCommandPaletteEvents(baseOptions))
    eventHandlers['toggle-source-control']()
    const updater = mockSetActivityView.mock.calls[0][0] as (prev: string) => string
    expect(updater('search')).toBe('sourceControl')
    expect(updater('extensions')).toBe('sourceControl')
  })

  // ---------------------------------------------------------------------------
  // go-to-line
  // ---------------------------------------------------------------------------
  it('go-to-line runs editor action when editor is available', () => {
    const editorRef = createEditorRef()
    const opts = { ...baseOptions, editorRef }
    renderHook(() => useCommandPaletteEvents(opts))
    eventHandlers['go-to-line']()
    expect(editorRef.current.getAction).toHaveBeenCalledWith('editor.action.gotoLine')
    expect(mockRunAction).toHaveBeenCalled()
  })

  it('go-to-line does nothing when editor is null', () => {
    const opts = { ...baseOptions, editorRef: { current: null } }
    renderHook(() => useCommandPaletteEvents(opts))
    eventHandlers['go-to-line']()
    expect(mockRunAction).not.toHaveBeenCalled()
  })

  it('go-to-line handles getAction returning null', () => {
    const editorRef = {
      current: {
        getAction: vi.fn().mockReturnValue(null),
        revealLineInCenter: mockRevealLineInCenter,
        setPosition: mockSetPosition,
        focus: mockFocus,
      },
    }
    const opts = { ...baseOptions, editorRef }
    renderHook(() => useCommandPaletteEvents(opts))
    // Should not throw
    eventHandlers['go-to-line']()
    expect(editorRef.current.getAction).toHaveBeenCalledWith('editor.action.gotoLine')
  })

  // ---------------------------------------------------------------------------
  // goto-line-direct
  // ---------------------------------------------------------------------------
  it('goto-line-direct does nothing when no line in detail', () => {
    const editorRef = createEditorRef()
    const opts = { ...baseOptions, editorRef }
    renderHook(() => useCommandPaletteEvents(opts))
    eventHandlers['goto-line-direct'](new CustomEvent('goto-line-direct'))
    expect(mockRevealLineInCenter).not.toHaveBeenCalled()
  })

  it('goto-line-direct does nothing when editor is null', () => {
    const opts = { ...baseOptions, editorRef: { current: null } }
    renderHook(() => useCommandPaletteEvents(opts))
    eventHandlers['goto-line-direct'](new CustomEvent('goto-line-direct', { detail: { line: 10 } }))
    expect(mockRevealLineInCenter).not.toHaveBeenCalled()
  })

  it('goto-line-direct shows toast when no file open', () => {
    const editorRef = createEditorRef()
    const opts = { ...baseOptions, currentFile: null, editorRef }
    renderHook(() => useCommandPaletteEvents(opts))
    eventHandlers['goto-line-direct'](new CustomEvent('goto-line-direct', { detail: { line: 10 } }))
    expect(mockAddToast).toHaveBeenCalledWith('info', 'Go to Line', 'Open a file first')
  })

  it('goto-line-direct navigates to line when file is open', () => {
    const editorRef = createEditorRef()
    const opts = { ...baseOptions, editorRef }
    renderHook(() => useCommandPaletteEvents(opts))
    eventHandlers['goto-line-direct'](new CustomEvent('goto-line-direct', { detail: { line: 42 } }))
    expect(mockRevealLineInCenter).toHaveBeenCalledWith(42)
    expect(mockSetPosition).toHaveBeenCalledWith({ lineNumber: 42, column: 1 })
    expect(mockFocus).toHaveBeenCalled()
  })

  it('goto-line-direct does nothing when line is 0 (falsy)', () => {
    const editorRef = createEditorRef()
    const opts = { ...baseOptions, editorRef }
    renderHook(() => useCommandPaletteEvents(opts))
    eventHandlers['goto-line-direct'](new CustomEvent('goto-line-direct', { detail: { line: 0 } }))
    expect(mockRevealLineInCenter).not.toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // open-file / open-folder
  // ---------------------------------------------------------------------------
  it('open-file calls Tauri dialog', async () => {
    mockOpenDialog.mockResolvedValueOnce('/workspace/src/main.ts')
    renderHook(() => useCommandPaletteEvents(baseOptions))
    await eventHandlers['open-file']()
    expect(mockOpenDialog).toHaveBeenCalledWith(expect.objectContaining({ multiple: false, directory: false }))
    expect(mockOpenFile).toHaveBeenCalledWith('src/main.ts')
  })

  it('open-file strips workspace prefix on Unix paths', async () => {
    mockOpenDialog.mockResolvedValueOnce('/workspace/deep/sub/file.go')
    renderHook(() => useCommandPaletteEvents(baseOptions))
    await eventHandlers['open-file']()
    expect(mockOpenFile).toHaveBeenCalledWith('deep/sub/file.go')
  })

  it('open-file strips workspace prefix on Windows paths', async () => {
    // Tauri returns Windows-native separators; workspace mock uses /workspace
    // so we simulate a backslash-style path that should still be normalized
    mockOpenDialog.mockResolvedValueOnce('\\workspace\\src\\main.ts')
    renderHook(() => useCommandPaletteEvents(baseOptions))
    await eventHandlers['open-file']()
    expect(mockOpenFile).toHaveBeenCalledWith('src/main.ts')
  })

  it('open-file rejects files outside workspace', async () => {
    mockOpenDialog.mockResolvedValueOnce('/elsewhere/foreign.txt')
    renderHook(() => useCommandPaletteEvents(baseOptions))
    await eventHandlers['open-file']()
    expect(mockOpenFile).not.toHaveBeenCalled()
    expect(mockAddToast).toHaveBeenCalledWith('warning', 'File outside workspace', expect.any(String))
  })

  it('open-file handles cancellation', async () => {
    mockOpenDialog.mockResolvedValueOnce(null)
    renderHook(() => useCommandPaletteEvents(baseOptions))
    await eventHandlers['open-file']()
    expect(mockOpenFile).not.toHaveBeenCalled()
  })

  it('open-folder calls Tauri dialog and sets workspace', async () => {
    mockOpenDialog.mockResolvedValueOnce('/home/user/project')
    renderHook(() => useCommandPaletteEvents(baseOptions))
    await eventHandlers['open-folder']()
    expect(mockOpenDialog).toHaveBeenCalledWith(expect.objectContaining({ directory: true }))
    expect(mockSetWorkspacePath).toHaveBeenCalledWith('/home/user/project')
    expect(mockAddToast).toHaveBeenCalledWith('success', 'Workspace Opened', '/home/user/project')
  })

  it('open-folder handles cancellation', async () => {
    mockOpenDialog.mockResolvedValueOnce(null)
    renderHook(() => useCommandPaletteEvents(baseOptions))
    await eventHandlers['open-folder']()
    expect(mockSetWorkspacePath).not.toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // go-to-file
  // ---------------------------------------------------------------------------
  it('go-to-file dispatches open-quick-open', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    renderHook(() => useCommandPaletteEvents(baseOptions))
    eventHandlers['go-to-file']()
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'open-quick-open' }))
    dispatchSpy.mockRestore()
  })

  // ---------------------------------------------------------------------------
  // find-in-files
  // ---------------------------------------------------------------------------
  it('find-in-files dispatches open-search-panel', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    renderHook(() => useCommandPaletteEvents(baseOptions))
    eventHandlers['find-in-files']()
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'open-search-panel' }))
    dispatchSpy.mockRestore()
  })

  // ---------------------------------------------------------------------------
  // replace-in-files
  // ---------------------------------------------------------------------------
  it('replace-in-files dispatches open-search-panel with replaceMode', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    renderHook(() => useCommandPaletteEvents(baseOptions))
    eventHandlers['replace-in-files']()
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'open-search-panel',
      })
    )
    // Verify the detail contains replaceMode
    const dispatchedEvent = dispatchSpy.mock.calls[0][0] as CustomEvent
    expect(dispatchedEvent.detail).toEqual({ replaceMode: true })
    dispatchSpy.mockRestore()
  })

  // ---------------------------------------------------------------------------
  // git-checkout
  // ---------------------------------------------------------------------------
  it('git-checkout sets activity view to sourceControl', () => {
    renderHook(() => useCommandPaletteEvents(baseOptions))
    eventHandlers['git-checkout']()
    expect(mockSetActivityView).toHaveBeenCalledWith('sourceControl')
  })

  it('git-checkout shows file tree when hidden', () => {
    const opts = { ...baseOptions, showFileTree: false }
    renderHook(() => useCommandPaletteEvents(opts))
    eventHandlers['git-checkout']()
    expect(mockSetShowFileTree).toHaveBeenCalledWith(true)
  })

  it('git-checkout does not set file tree when already visible', () => {
    renderHook(() => useCommandPaletteEvents({ ...baseOptions, showFileTree: true }))
    eventHandlers['git-checkout']()
    expect(mockSetShowFileTree).not.toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // focus-editor-group
  // ---------------------------------------------------------------------------
  it('focus-editor-group sets active pane to main for group 1', () => {
    renderHook(() => useCommandPaletteEvents(baseOptions))
    eventHandlers['focus-editor-group'](new CustomEvent('focus-editor-group', { detail: { group: 1 } }))
    expect(mockSetActivePane).toHaveBeenCalledWith('main')
  })

  it('focus-editor-group sets active pane to secondary for group 2 with split', () => {
    renderHook(() => useCommandPaletteEvents({ ...baseOptions, splitDirection: 'horizontal' }))
    eventHandlers['focus-editor-group'](new CustomEvent('focus-editor-group', { detail: { group: 2 } }))
    expect(mockSetActivePane).toHaveBeenCalledWith('secondary')
  })

  it('focus-editor-group does nothing for group 2 when no split', () => {
    renderHook(() => useCommandPaletteEvents({ ...baseOptions, splitDirection: 'none' }))
    eventHandlers['focus-editor-group'](new CustomEvent('focus-editor-group', { detail: { group: 2 } }))
    expect(mockSetActivePane).not.toHaveBeenCalled()
  })

  it('focus-editor-group does nothing for group 3', () => {
    renderHook(() => useCommandPaletteEvents(baseOptions))
    eventHandlers['focus-editor-group'](new CustomEvent('focus-editor-group', { detail: { group: 3 } }))
    expect(mockSetActivePane).not.toHaveBeenCalled()
  })

  it('focus-editor-group does nothing for group 0', () => {
    renderHook(() => useCommandPaletteEvents(baseOptions))
    eventHandlers['focus-editor-group'](new CustomEvent('focus-editor-group', { detail: { group: 0 } }))
    expect(mockSetActivePane).not.toHaveBeenCalled()
  })

  it('focus-editor-group does nothing when no detail', () => {
    renderHook(() => useCommandPaletteEvents(baseOptions))
    eventHandlers['focus-editor-group'](new CustomEvent('focus-editor-group'))
    expect(mockSetActivePane).not.toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // Ref staleness
  // ---------------------------------------------------------------------------
  it('uses latest options via ref after re-render', () => {
    const { rerender } = renderHook(
      (opts) => useCommandPaletteEvents(opts),
      { initialProps: baseOptions }
    )
    // Re-render with different options
    const updatedOptions = { ...baseOptions, currentFile: null }
    rerender(updatedOptions)
    // Now toggle-split should not call toggleSplit because currentFile is null
    eventHandlers['toggle-split']()
    expect(mockToggleSplit).not.toHaveBeenCalled()
  })
})
