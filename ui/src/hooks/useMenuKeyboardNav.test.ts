import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useMenuKeyboardNav } from './useMenuKeyboardNav'

describe('useMenuKeyboardNav', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('returns a function', () => {
    const { result } = renderHook(() => useMenuKeyboardNav({ current: null }, onClose))
    expect(typeof result.current).toBe('function')
  })

  it('navigates down on ArrowDown', () => {
    const container = document.createElement('div')
    const item1 = document.createElement('button')
    item1.setAttribute('role', 'menuitem')
    const item2 = document.createElement('button')
    item2.setAttribute('role', 'menuitem')
    container.appendChild(item1)
    container.appendChild(item2)
    document.body.appendChild(container)

    const focusSpy = vi.spyOn(item2, 'focus')
    const { result } = renderHook(() => useMenuKeyboardNav({ current: container }, onClose))

    // Focus first item
    vi.spyOn(item1, 'focus')
    item1.focus()

    result.current({ key: 'ArrowDown', currentTarget: container, preventDefault: vi.fn() } as any)
    expect(focusSpy).toHaveBeenCalled()

    document.body.removeChild(container)
    focusSpy.mockRestore()
  })

  it('calls onClose on Escape', () => {
    const container = document.createElement('div')
    const item = document.createElement('button')
    item.setAttribute('role', 'menuitem')
    container.appendChild(item)

    const { result } = renderHook(() => useMenuKeyboardNav({ current: container }, onClose))
    result.current({ key: 'Escape', currentTarget: container, preventDefault: vi.fn() } as any)
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose on Tab', () => {
    const container = document.createElement('div')
    const item = document.createElement('button')
    item.setAttribute('role', 'menuitem')
    container.appendChild(item)

    const { result } = renderHook(() => useMenuKeyboardNav({ current: container }, onClose))
    result.current({ key: 'Tab', currentTarget: container, preventDefault: vi.fn() } as any)
    expect(onClose).toHaveBeenCalled()
  })

  it('navigates to Home', () => {
    const container = document.createElement('div')
    const item1 = document.createElement('button')
    item1.setAttribute('role', 'menuitem')
    const item2 = document.createElement('button')
    item2.setAttribute('role', 'menuitem')
    container.appendChild(item1)
    container.appendChild(item2)
    document.body.appendChild(container)

    const focusSpy = vi.spyOn(item1, 'focus')
    const { result } = renderHook(() => useMenuKeyboardNav({ current: container }, onClose))

    result.current({ key: 'Home', currentTarget: container, preventDefault: vi.fn() } as any)
    expect(focusSpy).toHaveBeenCalled()

    document.body.removeChild(container)
    focusSpy.mockRestore()
  })

  it('navigates to End', () => {
    const container = document.createElement('div')
    const item1 = document.createElement('button')
    item1.setAttribute('role', 'menuitem')
    const item2 = document.createElement('button')
    item2.setAttribute('role', 'menuitem')
    container.appendChild(item1)
    container.appendChild(item2)
    document.body.appendChild(container)

    const focusSpy = vi.spyOn(item2, 'focus')
    const { result } = renderHook(() => useMenuKeyboardNav({ current: container }, onClose))

    result.current({ key: 'End', currentTarget: container, preventDefault: vi.fn() } as any)
    expect(focusSpy).toHaveBeenCalled()

    document.body.removeChild(container)
    focusSpy.mockRestore()
  })
})
