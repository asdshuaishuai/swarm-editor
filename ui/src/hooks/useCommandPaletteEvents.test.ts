import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCommandPaletteEvents } from './useCommandPaletteEvents'

// Mock useWindowEvent to capture handlers
const eventHandlers: Record<string, (...args: any[]) => void> = {}
vi.mock('./useWindowEvent', () => ({
  useWindowEvent: (event: string, handler: (...args: any[]) => void) => {
    eventHandlers[event] = handler
  },
}))

describe('useCommandPaletteEvents', () => {
  const mockToggleSplit = vi.fn()
  const mockHandleCloseSplit = vi.fn()
  const mockSetShowFileTree = vi.fn()
  const mockSetActivityView = vi.fn()
  const mockHandleSave = vi.fn()
  const mockAddToast = vi.fn()
  const mockSetActivePane = vi.fn()

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

  it('registers event handlers on mount', () => {
    renderHook(() => useCommandPaletteEvents(baseOptions))
    expect(eventHandlers['toggle-split']).toBeDefined()
    expect(eventHandlers['close-split']).toBeDefined()
    expect(eventHandlers['save-file']).toBeDefined()
    expect(eventHandlers['toggle-source-control']).toBeDefined()
  })

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

  it('close-split calls handleCloseSplit', () => {
    renderHook(() => useCommandPaletteEvents(baseOptions))
    eventHandlers['close-split']()
    expect(mockHandleCloseSplit).toHaveBeenCalled()
  })

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

  it('toggle-source-control toggles activity view', () => {
    mockSetActivityView.mockImplementation((arg: any) => typeof arg === 'function' ? arg('sourceControl') : arg)
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

  it('open-file shows toast', () => {
    renderHook(() => useCommandPaletteEvents(baseOptions))
    eventHandlers['open-file']()
    expect(mockAddToast).toHaveBeenCalledWith('info', 'Open File', expect.any(String))
  })

  it('open-folder shows toast', () => {
    renderHook(() => useCommandPaletteEvents(baseOptions))
    eventHandlers['open-folder']()
    expect(mockAddToast).toHaveBeenCalledWith('info', 'Open Folder', expect.any(String))
  })

  it('go-to-file dispatches open-quick-open', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    renderHook(() => useCommandPaletteEvents(baseOptions))
    eventHandlers['go-to-file']()
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'open-quick-open' }))
    dispatchSpy.mockRestore()
  })

  it('find-in-files dispatches open-search-panel', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    renderHook(() => useCommandPaletteEvents(baseOptions))
    eventHandlers['find-in-files']()
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'open-search-panel' }))
    dispatchSpy.mockRestore()
  })

  it('focus-editor-group sets active pane to main for group 1', () => {
    renderHook(() => useCommandPaletteEvents(baseOptions))
    eventHandlers['focus-editor-group'](new CustomEvent('focus-editor-group', { detail: { group: 1 } }))
    expect(mockSetActivePane).toHaveBeenCalledWith('main')
  })

  it('git-checkout sets activity view to sourceControl', () => {
    renderHook(() => useCommandPaletteEvents(baseOptions))
    eventHandlers['git-checkout']()
    expect(mockSetActivityView).toHaveBeenCalledWith('sourceControl')
  })
})
