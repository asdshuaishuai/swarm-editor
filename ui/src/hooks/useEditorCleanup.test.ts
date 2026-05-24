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

function makeRefs() {
  return {
    mountedRef: { current: false },
    lspDebounceRef: { current: null as ReturnType<typeof setTimeout> | null },
    autoSaveTimeoutRef: { current: null as ReturnType<typeof setTimeout> | null },
    lspOpenFileRef: { current: null as string | null },
    secondaryLspDebounceRef: { current: null as ReturnType<typeof setTimeout> | null },
    secondaryAutoSaveTimeoutRef: { current: null as ReturnType<typeof setTimeout> | null },
    secondaryLspOpenFileRef: { current: null as string | null },
    providerDisposablesRef: { current: [] as any[] },
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
})
