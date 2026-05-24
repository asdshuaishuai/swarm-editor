import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useWindowEvent } from './useWindowEvent'

describe('useWindowEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('adds event listener on mount', () => {
    const handler = vi.fn()
    const addSpy = vi.spyOn(window, 'addEventListener')
    renderHook(() => useWindowEvent('resize', handler))
    expect(addSpy).toHaveBeenCalledWith('resize', handler, undefined)
    addSpy.mockRestore()
  })

  it('removes event listener on unmount', () => {
    const handler = vi.fn()
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useWindowEvent('resize', handler))
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('resize', handler, undefined)
    removeSpy.mockRestore()
  })

  it('passes options to addEventListener', () => {
    const handler = vi.fn()
    const addSpy = vi.spyOn(window, 'addEventListener')
    const opts: AddEventListenerOptions = { capture: true, passive: false }
    renderHook(() => useWindowEvent('keydown', handler, [], opts))
    expect(addSpy).toHaveBeenCalledWith('keydown', handler, opts)
    addSpy.mockRestore()
  })

  it('re-registers when deps change', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { rerender } = renderHook(
      ({ msg }: { msg: string }) => useWindowEvent('custom', () => console.log(msg), [msg]),
      { initialProps: { msg: 'a' } }
    )
    rerender({ msg: 'b' })
    expect(removeSpy).toHaveBeenCalled()
    expect(addSpy).toHaveBeenCalledTimes(2)
    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('supports custom event names', () => {
    const handler = vi.fn()
    const addSpy = vi.spyOn(window, 'addEventListener')
    renderHook(() => useWindowEvent('my-custom-event', handler))
    expect(addSpy).toHaveBeenCalledWith('my-custom-event', handler, undefined)
    addSpy.mockRestore()
  })

  it('handler receives events', () => {
    const handler = vi.fn()
    renderHook(() => useWindowEvent('resize', handler))
    window.dispatchEvent(new Event('resize'))
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
