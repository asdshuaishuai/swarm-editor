import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, fireEvent } from '@testing-library/react'
import { useTabContextMenu } from './useTabContextMenu'

describe('useTabContextMenu', () => {
  let setTabContextMenu: (state: { visible: boolean; x: number; y: number; path: string | null }) => void
  let tabContextMenuRef: { current: HTMLDivElement | null }

  beforeEach(() => {
    setTabContextMenu = vi.fn()
    tabContextMenuRef = { current: null }
  })

  it('handleTabContextMenu sets position and path', () => {
    const { result } = renderHook(() =>
      useTabContextMenu({
        tabContextMenu: { visible: false, x: 0, y: 0, path: null },
        setTabContextMenu,
        tabContextMenuRef,
      }),
    )

    const event = { clientX: 100, clientY: 200 } as React.MouseEvent
    act(() => {
      result.current.handleTabContextMenu(event, '/file.ts')
    })

    expect(setTabContextMenu).toHaveBeenCalledWith({
      visible: true,
      x: 100,
      y: 200,
      path: '/file.ts',
    })
  })

  it('closeTabContextMenu hides menu', () => {
    const { result } = renderHook(() =>
      useTabContextMenu({
        tabContextMenu: { visible: true, x: 100, y: 200, path: '/file.ts' },
        setTabContextMenu,
        tabContextMenuRef,
      }),
    )

    act(() => {
      result.current.closeTabContextMenu()
    })

    expect(setTabContextMenu).toHaveBeenCalledWith({
      visible: false,
      x: 0,
      y: 0,
      path: null,
    })
  })

  it('closes on document click when visible', () => {
    renderHook(() =>
      useTabContextMenu({
        tabContextMenu: { visible: true, x: 100, y: 200, path: '/file.ts' },
        setTabContextMenu,
        tabContextMenuRef,
      }),
    )

    act(() => {
      fireEvent.click(document)
    })

    expect(setTabContextMenu).toHaveBeenCalledWith({
      visible: false,
      x: 0,
      y: 0,
      path: null,
    })
  })

  it('closes on Escape key when visible', () => {
    renderHook(() =>
      useTabContextMenu({
        tabContextMenu: { visible: true, x: 100, y: 200, path: '/file.ts' },
        setTabContextMenu,
        tabContextMenuRef,
      }),
    )

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })

    expect(setTabContextMenu).toHaveBeenCalledWith({
      visible: false,
      x: 0,
      y: 0,
      path: null,
    })
  })

  it('does not add listeners when not visible', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')

    renderHook(() =>
      useTabContextMenu({
        tabContextMenu: { visible: false, x: 0, y: 0, path: null },
        setTabContextMenu,
        tabContextMenuRef,
      }),
    )

    expect(addSpy).not.toHaveBeenCalledWith('click', expect.anything())
    addSpy.mockRestore()
  })

  it('tabMenuKeyDown is a function', () => {
    const { result } = renderHook(() =>
      useTabContextMenu({
        tabContextMenu: { visible: false, x: 0, y: 0, path: null },
        setTabContextMenu,
        tabContextMenuRef,
      }),
    )

    expect(result.current.tabMenuKeyDown).toBeTypeOf('function')
  })
})
