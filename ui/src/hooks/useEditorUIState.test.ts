import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEditorUIState } from './useEditorUIState'

describe('useEditorUIState', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns all expected state properties', () => {
    const { result } = renderHook(() => useEditorUIState())
    const state = result.current
    expect(state.showFileTree).toBe(true)
    expect(state.activityView).toBe('explorer')
    expect(state.fileTree).toEqual([])
    expect(state.workspace).toBe('')
    expect(state.loading).toBe(false)
    expect(state.diffView).toBeNull()
    expect(state.showAgentSelector).toBe(false)
    expect(state.showAccessibilityHelp).toBe(false)
    expect(state.expandedDirs).toBeInstanceOf(Set)
    expect(state.dirtyClosePath).toBeNull()
    expect(state.sidebarWidth).toBe(208)
    expect(state.isResizingSidebar).toBe(false)
    expect(state.tabContextMenu.visible).toBe(false)
    expect(state.draggedTab).toBeNull()
    expect(state.dropTargetPane).toBeNull()
  })

  it('reads sidebarWidth from localStorage', () => {
    localStorage.setItem('sidebarWidth', '300')
    const { result } = renderHook(() => useEditorUIState())
    expect(result.current.sidebarWidth).toBe(300)
  })

  it('handles invalid localStorage sidebarWidth gracefully (returns NaN since source does not guard)', () => {
    localStorage.setItem('sidebarWidth', 'not-a-number')
    const { result } = renderHook(() => useEditorUIState())
    // Source code: v ? parseInt(v, 10) : 208 — 'not-a-number' is truthy, so parseInt returns NaN
    expect(result.current.sidebarWidth).toBeNaN()
  })

  it('persists sidebarWidth to localStorage on change', () => {
    const { result } = renderHook(() => useEditorUIState())
    act(() => {
      result.current.setSidebarWidth(350)
    })
    expect(localStorage.getItem('sidebarWidth')).toBe('350')
    expect(result.current.sidebarWidth).toBe(350)
  })

  it('handles sidebar resize via mouse events', () => {
    const { result } = renderHook(() => useEditorUIState())

    act(() => {
      result.current.setIsResizingSidebar(true)
    })
    expect(result.current.isResizingSidebar).toBe(true)

    // Simulate mouse move
    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 300 }))
    })
    expect(result.current.sidebarWidth).toBe(252) // 300 - 48 = 252

    // Simulate mouse up
    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup'))
    })
    expect(result.current.isResizingSidebar).toBe(false)
  })

  it('clamps sidebar width between 170 and 500 during resize', () => {
    const { result } = renderHook(() => useEditorUIState())

    act(() => {
      result.current.setIsResizingSidebar(true)
    })

    // Too small
    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100 }))
    })
    expect(result.current.sidebarWidth).toBe(170) // max(170, 100 - 48) = 170

    // Too large
    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 700 }))
    })
    expect(result.current.sidebarWidth).toBe(500) // min(500, 700 - 48) = 500

    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup'))
    })
  })

  it('clears drag state on window dragend event', () => {
    const { result } = renderHook(() => useEditorUIState())

    act(() => {
      result.current.setDraggedTab({ paneId: 'left', path: '/foo.ts' })
      result.current.setDropTargetPane('right')
    })
    expect(result.current.draggedTab).toEqual({ paneId: 'left', path: '/foo.ts' })
    expect(result.current.dropTargetPane).toBe('right')

    act(() => {
      window.dispatchEvent(new Event('dragend'))
    })
    expect(result.current.draggedTab).toBeNull()
    expect(result.current.dropTargetPane).toBeNull()
  })

  it('toggles showFileTree state', () => {
    const { result } = renderHook(() => useEditorUIState())
    expect(result.current.showFileTree).toBe(true)
    act(() => {
      result.current.setShowFileTree(false)
    })
    expect(result.current.showFileTree).toBe(false)
  })
})
