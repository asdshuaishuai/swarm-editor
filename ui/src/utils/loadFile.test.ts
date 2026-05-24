import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadFile } from './loadFile'

vi.mock('.', () => ({
  logger: { error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}))

vi.mock('../stores/splitPaneStore', () => ({
  useSplitPaneStore: {
    getState: vi.fn(() => ({ activePaneId: 'main' })),
  },
}))

describe('loadFile', () => {
  const setup = () => {
    const openFile = vi.fn().mockResolvedValue(undefined)
    const setPaneFile = vi.fn()
    const setRecentFiles = vi.fn((updater: string[] | ((prev: string[]) => string[])) =>
      typeof updater === 'function' ? updater(['old.ts']) : updater,
    )
    const addToast = vi.fn()
    const mountedRef = { current: true }
    const setLoading = vi.fn()

    return {
      openFile, setPaneFile, setRecentFiles, addToast, mountedRef, setLoading,
    }
  }

  beforeEach(() => {
    localStorage.clear()
  })

  it('opens file with preview mode', async () => {
    const opts = setup()
    await loadFile({ path: '/test.ts', splitDirection: 'none', ...opts })
    expect(opts.openFile).toHaveBeenCalledWith('/test.ts', { preview: true })
  })

  it('sets pane file when split is active', async () => {
    const opts = setup()
    await loadFile({ path: '/test.ts', splitDirection: 'horizontal', ...opts })
    expect(opts.setPaneFile).toHaveBeenCalledWith('main', '/test.ts')
  })

  it('does not set pane file when split is none', async () => {
    const opts = setup()
    await loadFile({ path: '/test.ts', splitDirection: 'none', ...opts })
    expect(opts.setPaneFile).not.toHaveBeenCalled()
  })

  it('updates recent files via updater function', async () => {
    const opts = setup()
    await loadFile({ path: '/test.ts', splitDirection: 'none', ...opts })
    expect(opts.setRecentFiles).toHaveBeenCalled()
    const updater = opts.setRecentFiles.mock.calls[0][0] as (prev: string[]) => string[]
    const result = updater(['other.ts', '/test.ts'])
    expect(result[0]).toBe('/test.ts')
    expect(result).toHaveLength(2)
  })

  it('trims recent files to max 10', async () => {
    const opts = setup()
    await loadFile({ path: '/test.ts', splitDirection: 'none', ...opts })
    const updater = opts.setRecentFiles.mock.calls[0][0] as (prev: string[]) => string[]
    const prev = Array.from({ length: 12 }, (_, i) => `/file${i}.ts`)
    const result = updater(prev)
    expect(result).toHaveLength(10)
  })

  it('shows error toast on failure', async () => {
    const opts = setup()
    opts.openFile.mockRejectedValueOnce(new Error('file not found'))
    await loadFile({ path: '/missing.ts', splitDirection: 'none', ...opts })
    expect(opts.addToast).toHaveBeenCalledWith('error', 'Failed to load file', 'file not found')
  })

  it('does not show toast if unmounted after error', async () => {
    const opts = setup()
    opts.openFile.mockRejectedValueOnce(new Error('fail'))
    opts.mountedRef.current = false
    await loadFile({ path: '/missing.ts', splitDirection: 'none', ...opts })
    expect(opts.addToast).not.toHaveBeenCalled()
  })

  it('sets loading true then false when mounted', async () => {
    const opts = setup()
    await loadFile({ path: '/test.ts', splitDirection: 'none', ...opts })
    expect(opts.setLoading).toHaveBeenCalledWith(true)
    expect(opts.setLoading).toHaveBeenCalledWith(false)
  })

  it('does not set loading false if unmounted during finally', async () => {
    const opts = setup()
    // mountedRef changes between await and finally
    opts.openFile.mockImplementationOnce(async () => {
      opts.mountedRef.current = false
    })
    await loadFile({ path: '/test.ts', splitDirection: 'none', ...opts })
    const falseCalls = opts.setLoading.mock.calls.filter(c => c[0] === false)
    expect(falseCalls).toHaveLength(0)
  })
})
