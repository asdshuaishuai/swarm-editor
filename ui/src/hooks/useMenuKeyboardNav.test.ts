import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useMenuKeyboardNav } from './useMenuKeyboardNav'

function createMenu(items: Array<{ disabled?: boolean }> = [{}, {}]) {
  const container = document.createElement('div')
  const elements: HTMLButtonElement[] = []
  for (const item of items) {
    const btn = document.createElement('button')
    btn.setAttribute('role', 'menuitem')
    if (item.disabled) btn.setAttribute('disabled', 'true')
    container.appendChild(btn)
    elements.push(btn)
  }
  document.body.appendChild(container)
  return { container, elements }
}

function keyEvent(key: string, currentTarget: HTMLElement) {
  return {
    key,
    currentTarget,
    preventDefault: vi.fn(),
  } as unknown as React.KeyboardEvent
}

describe('useMenuKeyboardNav', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('returns a function', () => {
    const { result } = renderHook(() => useMenuKeyboardNav({ current: null }, onClose))
    expect(typeof result.current).toBe('function')
  })

  it('navigates down on ArrowDown', () => {
    const { container, elements } = createMenu()
    const focusSpy = vi.spyOn(elements[1], 'focus')
    const { result } = renderHook(() => useMenuKeyboardNav({ current: container }, onClose))

    elements[0].focus()

    result.current(keyEvent('ArrowDown', container))
    expect(focusSpy).toHaveBeenCalled()

    focusSpy.mockRestore()
  })

  it('calls onClose on Escape', () => {
    const { container } = createMenu()

    const { result } = renderHook(() => useMenuKeyboardNav({ current: container }, onClose))
    result.current(keyEvent('Escape', container))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose on Tab', () => {
    const { container } = createMenu()

    const { result } = renderHook(() => useMenuKeyboardNav({ current: container }, onClose))
    result.current(keyEvent('Tab', container))
    expect(onClose).toHaveBeenCalled()
  })

  it('navigates to Home', () => {
    const { container, elements } = createMenu()
    const focusSpy = vi.spyOn(elements[0], 'focus')
    const { result } = renderHook(() => useMenuKeyboardNav({ current: container }, onClose))

    result.current(keyEvent('Home', container))
    expect(focusSpy).toHaveBeenCalled()

    focusSpy.mockRestore()
  })

  it('navigates to End', () => {
    const { container, elements } = createMenu()
    const focusSpy = vi.spyOn(elements[1], 'focus')
    const { result } = renderHook(() => useMenuKeyboardNav({ current: container }, onClose))

    result.current(keyEvent('End', container))
    expect(focusSpy).toHaveBeenCalled()

    focusSpy.mockRestore()
  })

  it('navigates up on ArrowUp from second item to first', () => {
    const { container, elements } = createMenu()
    const focusSpy = vi.spyOn(elements[0], 'focus')
    const { result } = renderHook(() => useMenuKeyboardNav({ current: container }, onClose))

    // Focus second item, then ArrowUp should go to first
    elements[1].focus()
    result.current(keyEvent('ArrowUp', container))
    expect(focusSpy).toHaveBeenCalled()

    focusSpy.mockRestore()
  })

  it('wraps around on ArrowUp when at first item (goes to last)', () => {
    const { container, elements } = createMenu([{}, {}, {}])
    const focusSpy = vi.spyOn(elements[2], 'focus')
    const { result } = renderHook(() => useMenuKeyboardNav({ current: container }, onClose))

    // Focus first item, ArrowUp wraps to last
    elements[0].focus()
    result.current(keyEvent('ArrowUp', container))
    expect(focusSpy).toHaveBeenCalled()

    focusSpy.mockRestore()
  })

  it('wraps around on ArrowDown when at last item (goes to first)', () => {
    const { container, elements } = createMenu([{}, {}, {}])
    const focusSpy = vi.spyOn(elements[0], 'focus')
    const { result } = renderHook(() => useMenuKeyboardNav({ current: container }, onClose))

    // Focus last item, ArrowDown wraps to first
    elements[2].focus()
    result.current(keyEvent('ArrowDown', container))
    expect(focusSpy).toHaveBeenCalled()

    focusSpy.mockRestore()
  })

  it('ArrowDown focuses first item when no item is currently focused (focusedIdx < 0)', () => {
    const { container, elements } = createMenu()
    const focusSpy = vi.spyOn(elements[0], 'focus')
    const { result } = renderHook(() => useMenuKeyboardNav({ current: container }, onClose))

    // No item focused, ArrowDown should focus first
    result.current(keyEvent('ArrowDown', container))
    expect(focusSpy).toHaveBeenCalled()

    focusSpy.mockRestore()
  })

  it('ArrowUp focuses first item when focusedIdx is 0 (wraps to last)', () => {
    const { container, elements } = createMenu([{}, {}])
    const focusSpy = vi.spyOn(elements[1], 'focus')
    const { result } = renderHook(() => useMenuKeyboardNav({ current: container }, onClose))

    elements[0].focus()
    result.current(keyEvent('ArrowUp', container))
    expect(focusSpy).toHaveBeenCalled()

    focusSpy.mockRestore()
  })

  it('does nothing on unknown keys', () => {
    const { container, elements } = createMenu()
    const focusSpy = vi.spyOn(elements[0], 'focus')
    const { result } = renderHook(() => useMenuKeyboardNav({ current: container }, onClose))

    result.current(keyEvent('Enter', container))
    expect(focusSpy).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()

    focusSpy.mockRestore()
  })

  it('does nothing when there are no menuitems', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const onCloseSpy = vi.fn()
    const { result } = renderHook(() => useMenuKeyboardNav({ current: container }, onCloseSpy))

    result.current(keyEvent('ArrowDown', container))
    expect(onCloseSpy).not.toHaveBeenCalled()
  })

  it('filters out disabled menuitems from navigation', () => {
    const { container, elements } = createMenu([{}, { disabled: true }, {}])
    const focusSpy = vi.spyOn(elements[2], 'focus')
    const { result } = renderHook(() => useMenuKeyboardNav({ current: container }, onClose))

    // Focus first enabled item, ArrowDown should skip disabled second and go to third
    elements[0].focus()
    result.current(keyEvent('ArrowDown', container))
    expect(focusSpy).toHaveBeenCalled()

    focusSpy.mockRestore()
  })

  it('calls onClose with undefined when no onClose provided', () => {
    const { container } = createMenu()
    const { result } = renderHook(() => useMenuKeyboardNav({ current: container }))

    // Should not throw when onClose is undefined
    expect(() => result.current(keyEvent('Escape', container))).not.toThrow()
  })

  it('updates onClose ref when callback changes', () => {
    const { container } = createMenu()
    const onCloseFirst = vi.fn()
    const onCloseSecond = vi.fn()

    const { result, rerender } = renderHook(
      ({ cb }) => useMenuKeyboardNav({ current: container }, cb),
      { initialProps: { cb: onCloseFirst } }
    )

    rerender({ cb: onCloseSecond })

    result.current(keyEvent('Escape', container))
    expect(onCloseFirst).not.toHaveBeenCalled()
    expect(onCloseSecond).toHaveBeenCalled()
  })

  it('auto-focuses first menuitem on mount via requestAnimationFrame', () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0)
      return 0
    })
    const { container, elements } = createMenu()
    const focusSpy = vi.spyOn(elements[0], 'focus')

    renderHook(() => useMenuKeyboardNav({ current: container }, onClose))

    expect(rafSpy).toHaveBeenCalled()
    expect(focusSpy).toHaveBeenCalled()

    rafSpy.mockRestore()
    focusSpy.mockRestore()
  })

  it('does not auto-focus when container ref is null', () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame')
    renderHook(() => useMenuKeyboardNav({ current: null }, onClose))
    expect(rafSpy).not.toHaveBeenCalled()
    rafSpy.mockRestore()
  })

  it('does not auto-focus again on subsequent effects after first focus', () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0)
      return 0
    })
    const { container, elements } = createMenu()
    const focusSpy = vi.spyOn(elements[0], 'focus')

    const { rerender } = renderHook(() => useMenuKeyboardNav({ current: container }, onClose))
    // First render triggers auto-focus
    expect(focusSpy).toHaveBeenCalledTimes(1)

    // Re-render should NOT trigger auto-focus again
    rerender()
    expect(focusSpy).toHaveBeenCalledTimes(1)

    rafSpy.mockRestore()
    focusSpy.mockRestore()
  })

  it('prevents default on ArrowDown', () => {
    const { container } = createMenu()
    const { result } = renderHook(() => useMenuKeyboardNav({ current: container }, onClose))

    const preventDefault = vi.fn()
    const evt = { key: 'ArrowDown', currentTarget: container, preventDefault } as unknown as React.KeyboardEvent
    result.current(evt)
    expect(preventDefault).toHaveBeenCalled()
  })

  it('prevents default on ArrowUp', () => {
    const { container } = createMenu()
    const { result } = renderHook(() => useMenuKeyboardNav({ current: container }, onClose))

    const preventDefault = vi.fn()
    const evt = { key: 'ArrowUp', currentTarget: container, preventDefault } as unknown as React.KeyboardEvent
    result.current(evt)
    expect(preventDefault).toHaveBeenCalled()
  })
})
