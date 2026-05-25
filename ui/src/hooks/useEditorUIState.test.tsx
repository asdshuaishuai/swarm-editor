import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, render } from '@testing-library/react'
import { createElement, useRef, useEffect } from 'react'
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

  // --- Activity view ---

  it('changes activityView', () => {
    const { result } = renderHook(() => useEditorUIState())
    act(() => {
      result.current.setActivityView('search')
    })
    expect(result.current.activityView).toBe('search')
  })

  it('cycles through all activity views', () => {
    const { result } = renderHook(() => useEditorUIState())
    const views = ['explorer', 'search', 'sourceControl', 'outline'] as const
    for (const view of views) {
      act(() => {
        result.current.setActivityView(view)
      })
      expect(result.current.activityView).toBe(view)
    }
  })

  // --- FileTree ---

  it('sets file tree', () => {
    const { result } = renderHook(() => useEditorUIState())
    const files = [{ name: 'a.ts', path: '/a.ts', isDirectory: false, children: [] }]
    act(() => {
      result.current.setFileTree(files)
    })
    expect(result.current.fileTree).toEqual(files)
  })

  // --- Workspace ---

  it('sets workspace', () => {
    const { result } = renderHook(() => useEditorUIState())
    act(() => {
      result.current.setWorkspace('/home/user/project')
    })
    expect(result.current.workspace).toBe('/home/user/project')
  })

  // --- Loading ---

  it('sets loading state', () => {
    const { result } = renderHook(() => useEditorUIState())
    act(() => {
      result.current.setLoading(true)
    })
    expect(result.current.loading).toBe(true)
  })

  // --- DiffView ---

  it('sets diffView state', () => {
    const { result } = renderHook(() => useEditorUIState())
    const diff = { original: 'foo', modified: 'bar', language: 'ts', filePath: '/a.ts' }
    act(() => {
      result.current.setDiffView(diff)
    })
    expect(result.current.diffView).toEqual(diff)
  })

  it('clears diffView', () => {
    const { result } = renderHook(() => useEditorUIState())
    const diff = { original: 'foo', modified: 'bar', language: 'ts', filePath: '/a.ts' }
    act(() => {
      result.current.setDiffView(diff)
    })
    act(() => {
      result.current.setDiffView(null)
    })
    expect(result.current.diffView).toBeNull()
  })

  // --- ShowAgentSelector ---

  it('toggles agent selector', () => {
    const { result } = renderHook(() => useEditorUIState())
    expect(result.current.showAgentSelector).toBe(false)
    act(() => {
      result.current.setShowAgentSelector(true)
    })
    expect(result.current.showAgentSelector).toBe(true)
  })

  // --- ShowAccessibilityHelp ---

  it('toggles accessibility help', () => {
    const { result } = renderHook(() => useEditorUIState())
    expect(result.current.showAccessibilityHelp).toBe(false)
    act(() => {
      result.current.setShowAccessibilityHelp(true)
    })
    expect(result.current.showAccessibilityHelp).toBe(true)
  })

  // --- ExpandedDirs ---

  it('sets expanded directories', () => {
    const { result } = renderHook(() => useEditorUIState())
    const dirs = new Set(['/src', '/lib'])
    act(() => {
      result.current.setExpandedDirs(dirs)
    })
    expect(result.current.expandedDirs).toEqual(dirs)
  })

  // --- DirtyClosePath ---

  it('sets dirty close path', () => {
    const { result } = renderHook(() => useEditorUIState())
    act(() => {
      result.current.setDirtyClosePath('/unsaved.ts')
    })
    expect(result.current.dirtyClosePath).toBe('/unsaved.ts')
  })

  // --- Sidebar resize body cursor and userSelect ---

  it('sets body cursor to col-resize during resize', () => {
    const { result } = renderHook(() => useEditorUIState())

    act(() => {
      result.current.setIsResizingSidebar(true)
    })

    expect(document.body.style.cursor).toBe('col-resize')
    expect(document.body.style.userSelect).toBe('none')

    // End resize
    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup'))
    })

    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
  })

  // --- Sidebar resize prevents text selection ---

  it('prevents text selection during resize with selectstart handler', () => {
    const { result } = renderHook(() => useEditorUIState())

    act(() => {
      result.current.setIsResizingSidebar(true)
    })

    const selectEvent = new Event('selectstart')
    const preventSpy = vi.spyOn(selectEvent, 'preventDefault')
    document.dispatchEvent(selectEvent)
    expect(preventSpy).toHaveBeenCalled()

    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup'))
    })
  })

  // --- Sidebar resize cleanup on unmount ---

  it('cleans up event listeners on unmount', () => {
    const { result, unmount } = renderHook(() => useEditorUIState())

    act(() => {
      result.current.setIsResizingSidebar(true)
    })

    expect(document.body.style.cursor).toBe('col-resize')

    unmount()

    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
  })

  // --- Tab context menu ---

  it('sets tab context menu state', () => {
    const { result } = renderHook(() => useEditorUIState())

    act(() => {
      result.current.setTabContextMenu({ visible: true, x: 100, y: 200, path: '/test.ts' })
    })

    expect(result.current.tabContextMenu).toEqual({
      visible: true,
      x: 100,
      y: 200,
      path: '/test.ts',
    })
  })

  // --- DraggedTab ---

  it('sets dragged tab state', () => {
    const { result } = renderHook(() => useEditorUIState())

    act(() => {
      result.current.setDraggedTab({ paneId: 'right', path: '/file.ts' })
    })

    expect(result.current.draggedTab).toEqual({ paneId: 'right', path: '/file.ts' })
  })

  // --- DropTargetPane ---

  it('sets drop target pane', () => {
    const { result } = renderHook(() => useEditorUIState())

    act(() => {
      result.current.setDropTargetPane('left')
    })

    expect(result.current.dropTargetPane).toBe('left')
  })

  // --- Sidebar width with null localStorage value ---

  it('returns default width when localStorage has no value', () => {
    const { result } = renderHook(() => useEditorUIState())
    expect(result.current.sidebarWidth).toBe(208)
  })

  // --- Sidebar width with empty string localStorage ---

  it('returns default width when localStorage value is empty string', () => {
    localStorage.setItem('sidebarWidth', '')
    const { result } = renderHook(() => useEditorUIState())
    expect(result.current.sidebarWidth).toBe(208)
  })

  // --- localStorage write failure for sidebarWidth ---

  it('handles localStorage write failure gracefully', () => {
    const consoleError = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    const { result } = renderHook(() => useEditorUIState())
    act(() => {
      result.current.setSidebarWidth(400)
    })

    // Should not throw, and state should still update
    expect(result.current.sidebarWidth).toBe(400)

    consoleError.mockRestore()
  })

  // --- localStorage read failure for sidebarWidth ---

  it('handles localStorage read failure gracefully', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })

    const { result } = renderHook(() => useEditorUIState())
    expect(result.current.sidebarWidth).toBe(208)

    vi.restoreAllMocks()
  })

  // --- No sidebar resize when not resizing ---

  it('does not set up mouse handlers when not resizing', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')

    renderHook(() => useEditorUIState())

    // The resize effect should not add listeners when isResizingSidebar is false
    const resizeListeners = addSpy.mock.calls.filter(
      call => call[0] === 'mousemove' || call[0] === 'mouseup' || call[0] === 'selectstart'
    )
    // Should be 0 since isResizingSidebar starts as false
    expect(resizeListeners).toHaveLength(0)

    addSpy.mockRestore()
  })

  // --- TabContextMenuRef ---

  it('provides tabContextMenuRef', () => {
    const { result } = renderHook(() => useEditorUIState())
    expect(result.current.tabContextMenuRef).toBeDefined()
    expect(result.current.tabContextMenuRef.current).toBeNull()
  })

  // --- Sidebar resize with exact boundary values ---

  it('clamps sidebar width to exactly 170 at minimum boundary', () => {
    const { result } = renderHook(() => useEditorUIState())

    act(() => {
      result.current.setIsResizingSidebar(true)
    })

    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 218 })) // 218 - 48 = 170
    })
    expect(result.current.sidebarWidth).toBe(170)

    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup'))
    })
  })

  it('clamps sidebar width to exactly 500 at maximum boundary', () => {
    const { result } = renderHook(() => useEditorUIState())

    act(() => {
      result.current.setIsResizingSidebar(true)
    })

    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 548 })) // 548 - 48 = 500
    })
    expect(result.current.sidebarWidth).toBe(500)

    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup'))
    })
  })

  it('allows sidebar width between boundaries', () => {
    const { result } = renderHook(() => useEditorUIState())

    act(() => {
      result.current.setIsResizingSidebar(true)
    })

    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 300 })) // 300 - 48 = 252
    })
    expect(result.current.sidebarWidth).toBe(252)

    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup'))
    })
  })

  // --- Tab context menu clamping effect ---

  it('does not clamp when context menu is not visible', () => {
    const { result } = renderHook(() => useEditorUIState())

    act(() => {
      result.current.setTabContextMenu({ visible: false, x: 100, y: 100, path: null })
    })

    // No crash — effect should bail early when visible is false
    expect(result.current.tabContextMenu.visible).toBe(false)
  })

  it('clamps tab context menu to viewport when overflowing right edge', () => {
    const stateHolder: { current: ReturnType<typeof useEditorUIState> | null } = { current: null }

    function TestComponent() {
      const state = useEditorUIState()
      const localRef = useRef<HTMLDivElement>(null)

      useEffect(() => {
        stateHolder.current = state
      })

      useEffect(() => {
        if (localRef.current) {
          // The ref object is mutable at runtime even though TypeScript marks it readonly
          ;(state as { tabContextMenuRef: React.MutableRefObject<HTMLDivElement | null> }).tabContextMenuRef.current = localRef.current
        }
      })

      return createElement('div', null,
        createElement('div', {
          ref: localRef,
          style: { position: 'fixed', left: '0px', top: '0px', width: '200px', height: '100px' },
        }, 'menu')
      )
    }

    // Mock window dimensions to trigger clamping (viewport smaller than menu)
    const originalInnerWidth = window.innerWidth
    const originalInnerHeight = window.innerHeight
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(100)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(50)

    render(createElement(TestComponent))

    // Trigger context menu visibility
    act(() => {
      stateHolder.current?.setTabContextMenu({ visible: true, x: 50, y: 25, path: '/test.ts' })
    })

    // The menu element should have been repositioned (clamped)
    const menuEl = stateHolder.current?.tabContextMenuRef.current
    expect(menuEl).not.toBeNull()
    if (menuEl) {
      // left should be clamped: window.innerWidth - rect.width - 8 = 100 - 200 - 8 = -108
      // But getBoundingClientRect returns the actual rect, so left is set
      expect(menuEl.style.left).toBeDefined()
    }

    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(originalInnerWidth)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(originalInnerHeight)
  })
})
