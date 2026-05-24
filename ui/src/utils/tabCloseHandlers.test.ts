import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTabCloseHandlers } from './tabCloseHandlers'

// Mock tabCloseActions
vi.mock('./tabCloseActions', () => ({
  showCloseToast: vi.fn(),
  autoSaveDirtyFiles: vi.fn(),
}))

describe('createTabCloseHandlers', () => {
  const mockCloseAllFiles = vi.fn()
  const mockCloseOthers = vi.fn()
  const mockCloseToLeft = vi.fn()
  const mockCloseToRight = vi.fn()
  const mockCloseSaved = vi.fn()
  const mockClearDirty = vi.fn()
  const mockFetchGitStatus = vi.fn()
  const mockAddToast = vi.fn()
  const mockSetDirtyClosePath = vi.fn()

  const baseOptions = {
    openFiles: ['/a.ts', '/b.ts', '/c.ts', '/d.ts'],
    currentFile: '/b.ts' as string | null,
    dirtyFiles: new Set(['/c.ts']),
    pinnedFiles: new Set(['/d.ts']),
    fileContents: new Map([['/a.ts', 'a'], ['/b.ts', 'b'], ['/c.ts', 'c']]),
    closeAllFiles: mockCloseAllFiles,
    closeOthers: mockCloseOthers,
    closeToLeft: mockCloseToLeft,
    closeToRight: mockCloseToRight,
    closeSaved: mockCloseSaved,
    clearDirty: mockClearDirty,
    fetchGitStatus: mockFetchGitStatus,
    addToast: mockAddToast,
    setDirtyClosePath: mockSetDirtyClosePath,
  }

  beforeEach(() => vi.clearAllMocks())

  it('closeAll closes non-pinned files when no dirty files', () => {
    const opts = { ...baseOptions, dirtyFiles: new Set<string>() }
    const handlers = createTabCloseHandlers(opts)
    handlers.closeAll()
    expect(mockCloseAllFiles).toHaveBeenCalled()
  })

  it('closeAll sets dirtyClosePath when dirty files exist', () => {
    const handlers = createTabCloseHandlers(baseOptions)
    handlers.closeAll()
    expect(mockSetDirtyClosePath).toHaveBeenCalledWith('__close_all__')
    expect(mockCloseAllFiles).not.toHaveBeenCalled()
  })

  it('closeSavedTabs calls closeSaved', () => {
    const handlers = createTabCloseHandlers(baseOptions)
    handlers.closeSavedTabs()
    expect(mockCloseSaved).toHaveBeenCalled()
  })

  it('closeOtherTabs calls closeOthers with current file', () => {
    const handlers = createTabCloseHandlers(baseOptions)
    handlers.closeOtherTabs()
    expect(mockCloseOthers).toHaveBeenCalledWith('/b.ts')
  })

  it('closeOtherTabs does nothing when no current file', () => {
    const opts = { ...baseOptions, currentFile: null as string | null }
    const handlers = createTabCloseHandlers(opts)
    handlers.closeOtherTabs()
    expect(mockCloseOthers).not.toHaveBeenCalled()
  })

  it('closeTabsToLeft calls closeToLeft with current file', () => {
    const handlers = createTabCloseHandlers(baseOptions)
    handlers.closeTabsToLeft()
    expect(mockCloseToLeft).toHaveBeenCalledWith('/b.ts')
  })

  it('closeTabsToRight calls closeToRight with current file', () => {
    const handlers = createTabCloseHandlers(baseOptions)
    handlers.closeTabsToRight()
    expect(mockCloseToRight).toHaveBeenCalledWith('/b.ts')
  })

  it('closeTabsToLeft does nothing when no current file', () => {
    const opts = { ...baseOptions, currentFile: null as string | null }
    const handlers = createTabCloseHandlers(opts)
    handlers.closeTabsToLeft()
    expect(mockCloseToLeft).not.toHaveBeenCalled()
  })

  it('closeTabsToRight does nothing when no current file', () => {
    const opts = { ...baseOptions, currentFile: null as string | null }
    const handlers = createTabCloseHandlers(opts)
    handlers.closeTabsToRight()
    expect(mockCloseToRight).not.toHaveBeenCalled()
  })

  it('closeTabsToLeft does nothing when current file not in list', () => {
    const opts = { ...baseOptions, currentFile: '/missing.ts' as string | null }
    const handlers = createTabCloseHandlers(opts)
    handlers.closeTabsToLeft()
    expect(mockCloseToLeft).not.toHaveBeenCalled()
  })

  it('returns all five handlers', () => {
    const handlers = createTabCloseHandlers(baseOptions)
    expect(handlers).toHaveProperty('closeAll')
    expect(handlers).toHaveProperty('closeSavedTabs')
    expect(handlers).toHaveProperty('closeOtherTabs')
    expect(handlers).toHaveProperty('closeTabsToLeft')
    expect(handlers).toHaveProperty('closeTabsToRight')
  })
})
