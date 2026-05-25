import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useEditorCleanup } from './useEditorCleanup'

vi.mock('../services/lspApi', () => ({
  lspApi: {
    didClose: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../utils', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

interface Disposable {
  dispose(): void
}

function makeRefs() {
  return {
    mountedRef: { current: false },
    lspDebounceRef: { current: null as ReturnType<typeof setTimeout> | null },
    autoSaveTimeoutRef: { current: null as ReturnType<typeof setTimeout> | null },
    lspOpenFileRef: { current: null as string | null },
    secondaryLspDebounceRef: { current: null as ReturnType<typeof setTimeout> | null },
    secondaryAutoSaveTimeoutRef: { current: null as ReturnType<typeof setTimeout> | null },
    secondaryLspOpenFileRef: { current: null as string | null },
    providerDisposablesRef: { current: [] as Disposable[] },
  }
}

describe('useEditorCleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets mountedRef to true on mount', () => {
    const refs = makeRefs()
    renderHook(() => useEditorCleanup(refs))
    expect(refs.mountedRef.current).toBe(true)
  })

  it('sets mountedRef to false on unmount', () => {
    const refs = makeRefs()
    const { unmount } = renderHook(() => useEditorCleanup(refs))
    unmount()
    expect(refs.mountedRef.current).toBe(false)
  })

  it('clears lspDebounce timeout on unmount', () => {
    const refs = makeRefs()
    const fakeTimeout = setTimeout(() => {}, 10000) as unknown as ReturnType<typeof setTimeout>
    refs.lspDebounceRef.current = fakeTimeout
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const { unmount } = renderHook(() => useEditorCleanup(refs))
    unmount()
    expect(clearTimeoutSpy).toHaveBeenCalledWith(fakeTimeout)
    clearTimeoutSpy.mockRestore()
  })

  it('clears autoSaveTimeout on unmount', () => {
    const refs = makeRefs()
    const fakeTimeout = setTimeout(() => {}, 10000) as unknown as ReturnType<typeof setTimeout>
    refs.autoSaveTimeoutRef.current = fakeTimeout
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const { unmount } = renderHook(() => useEditorCleanup(refs))
    unmount()
    expect(clearTimeoutSpy).toHaveBeenCalledWith(fakeTimeout)
    clearTimeoutSpy.mockRestore()
  })

  it('closes LSP file on unmount if lspOpenFileRef is set', async () => {
    const { lspApi } = await import('../services/lspApi')
    const refs = makeRefs()
    refs.lspOpenFileRef.current = '/path/to/file.ts'
    const { unmount } = renderHook(() => useEditorCleanup(refs))
    unmount()
    expect(lspApi.didClose).toHaveBeenCalledWith('/path/to/file.ts')
  })

  it('does not call didClose if lspOpenFileRef is null', async () => {
    const { lspApi } = await import('../services/lspApi')
    const refs = makeRefs()
    const { unmount } = renderHook(() => useEditorCleanup(refs))
    unmount()
    expect(lspApi.didClose).not.toHaveBeenCalled()
  })

  it('disposes provider disposables on unmount', () => {
    const dispose = vi.fn()
    const refs = makeRefs()
    refs.providerDisposablesRef.current = [{ dispose }, { dispose }]
    const { unmount } = renderHook(() => useEditorCleanup(refs))
    unmount()
    expect(dispose).toHaveBeenCalledTimes(2)
    expect(refs.providerDisposablesRef.current).toEqual([])
  })

  it('clears secondary debounce timeout on unmount', () => {
    const refs = makeRefs()
    const fakeTimeout = setTimeout(() => {}, 10000) as unknown as ReturnType<typeof setTimeout>
    refs.secondaryLspDebounceRef.current = fakeTimeout
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const { unmount } = renderHook(() => useEditorCleanup(refs))
    unmount()
    expect(clearTimeoutSpy).toHaveBeenCalledWith(fakeTimeout)
    clearTimeoutSpy.mockRestore()
  })

  it('closes secondary LSP file on unmount', async () => {
    const { lspApi } = await import('../services/lspApi')
    const refs = makeRefs()
    refs.secondaryLspOpenFileRef.current = '/secondary/file.ts'
    const { unmount } = renderHook(() => useEditorCleanup(refs))
    unmount()
    expect(lspApi.didClose).toHaveBeenCalledWith('/secondary/file.ts')
  })

  it('clears secondary autoSave timeout on unmount', () => {
    const refs = makeRefs()
    const fakeTimeout = setTimeout(() => {}, 10000) as unknown as ReturnType<typeof setTimeout>
    refs.secondaryAutoSaveTimeoutRef.current = fakeTimeout
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const { unmount } = renderHook(() => useEditorCleanup(refs))
    unmount()
    expect(clearTimeoutSpy).toHaveBeenCalledWith(fakeTimeout)
    clearTimeoutSpy.mockRestore()
  })

  it('logs debug when primary LSP didClose rejects', async () => {
    const { lspApi } = await import('../services/lspApi')
    const { logger } = await import('../utils')
    const rejectPromise = Promise.reject(new Error('LSP error'))
    ;(lspApi.didClose as ReturnType<typeof vi.fn>).mockReturnValueOnce(rejectPromise)
    const refs = makeRefs()
    refs.lspOpenFileRef.current = '/reject/primary.ts'
    const { unmount } = renderHook(() => useEditorCleanup(refs))
    unmount()
    try { await rejectPromise } catch { /* swallow */ }
    expect(logger.debug).toHaveBeenCalledWith('EditorCleanup', 'Failed to close LSP')
  })

  it('logs debug when secondary LSP didClose rejects', async () => {
    const { lspApi } = await import('../services/lspApi')
    const { logger } = await import('../utils')
    const rejectPromise = Promise.reject(new Error('LSP error'))
    ;(lspApi.didClose as ReturnType<typeof vi.fn>).mockReturnValueOnce(rejectPromise)
    const refs = makeRefs()
    refs.secondaryLspOpenFileRef.current = '/reject/secondary.ts'
    const { unmount } = renderHook(() => useEditorCleanup(refs))
    unmount()
    try { await rejectPromise } catch { /* swallow */ }
    expect(logger.debug).toHaveBeenCalledWith('EditorCleanup', 'Failed to close secondary LSP')
  })

  it('does not clear timeouts when refs are null', () => {
    const refs = makeRefs()
    // All timeout refs remain null (default)
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const { unmount } = renderHook(() => useEditorCleanup(refs))
    unmount()
    // clearTimeout should not have been called for null refs
    expect(clearTimeoutSpy).not.toHaveBeenCalled()
    clearTimeoutSpy.mockRestore()
  })

  it('clears all timeouts simultaneously on unmount', () => {
    const refs = makeRefs()
    const t1 = setTimeout(() => {}, 10000) as unknown as ReturnType<typeof setTimeout>
    const t2 = setTimeout(() => {}, 10000) as unknown as ReturnType<typeof setTimeout>
    const t3 = setTimeout(() => {}, 10000) as unknown as ReturnType<typeof setTimeout>
    const t4 = setTimeout(() => {}, 10000) as unknown as ReturnType<typeof setTimeout>
    refs.lspDebounceRef.current = t1
    refs.autoSaveTimeoutRef.current = t2
    refs.secondaryLspDebounceRef.current = t3
    refs.secondaryAutoSaveTimeoutRef.current = t4
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const { unmount } = renderHook(() => useEditorCleanup(refs))
    unmount()
    expect(clearTimeoutSpy).toHaveBeenCalledWith(t1)
    expect(clearTimeoutSpy).toHaveBeenCalledWith(t2)
    expect(clearTimeoutSpy).toHaveBeenCalledWith(t3)
    expect(clearTimeoutSpy).toHaveBeenCalledWith(t4)
    clearTimeoutSpy.mockRestore()
  })

  it('handles empty provider disposables gracefully', () => {
    const refs = makeRefs()
    refs.providerDisposablesRef.current = []
    const { unmount } = renderHook(() => useEditorCleanup(refs))
    unmount()
    expect(refs.providerDisposablesRef.current).toEqual([])
  })
})
