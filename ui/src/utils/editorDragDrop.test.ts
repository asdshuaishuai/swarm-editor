import { describe, it, expect, vi } from 'vitest'
import { createEditorDragDropHandlers } from './editorDragDrop'

function createMockEvent(overrides: Record<string, unknown> = {}) {
  return {
    preventDefault: vi.fn(),
    dataTransfer: {
      types: [] as string[],
      getData: vi.fn(() => ''),
      dropEffect: '',
    },
    currentTarget: {
      contains: vi.fn(() => false),
    },
    relatedTarget: null as Node | null,
    ...overrides,
  } as any
}

describe('createEditorDragDropHandlers', () => {
  const setup = (paneId: 'main' | 'secondary' = 'main') => {
    const setDropTargetPane = vi.fn()
    const setDraggedTab = vi.fn()
    const setPaneFile = vi.fn()
    const setActivePane = vi.fn()
    const onLoadFile = vi.fn()

    return {
      setDropTargetPane,
      setDraggedTab,
      setPaneFile,
      setActivePane,
      onLoadFile,
      handlers: createEditorDragDropHandlers({
        paneId,
        draggedTab: null,
        setDropTargetPane,
        setDraggedTab,
        setPaneFile,
        setActivePane,
        onLoadFile,
      }),
    }
  }

  describe('onDragOver', () => {
    it('accepts drag with file data transfer', () => {
      const { handlers, setDropTargetPane } = setup()
      const e = createMockEvent({
        dataTransfer: { types: ['application/json'], getData: vi.fn(), dropEffect: '' },
      })
      handlers.onDragOver(e)
      expect(e.preventDefault).toHaveBeenCalled()
      expect(setDropTargetPane).toHaveBeenCalledWith('main')
    })

    it('ignores drag without file data or cross-pane tab', () => {
      const { handlers, setDropTargetPane } = setup()
      const e = createMockEvent({
        dataTransfer: { types: ['text/plain'], getData: vi.fn(), dropEffect: '' },
      })
      handlers.onDragOver(e)
      expect(e.preventDefault).not.toHaveBeenCalled()
      expect(setDropTargetPane).not.toHaveBeenCalled()
    })

    it('accepts cross-pane tab drag', () => {
      const setDropTargetPane = vi.fn()
      const handlers = createEditorDragDropHandlers({
        paneId: 'main',
        draggedTab: { paneId: 'secondary', path: '/a.ts' },
        setDropTargetPane,
        setDraggedTab: vi.fn(),
        setPaneFile: vi.fn(),
        setActivePane: vi.fn(),
      })
      const e = createMockEvent({
        dataTransfer: { types: ['text/plain'], getData: vi.fn(), dropEffect: '' },
      })
      handlers.onDragOver(e)
      expect(e.preventDefault).toHaveBeenCalled()
      expect(setDropTargetPane).toHaveBeenCalledWith('main')
    })
  })

  describe('onDragLeave', () => {
    it('clears drop target when leaving the element', () => {
      const { handlers, setDropTargetPane } = setup()
      const e = createMockEvent()
      handlers.onDragLeave(e)
      expect(setDropTargetPane).toHaveBeenCalledWith(null)
    })

    it('does not clear if moving to a child element', () => {
      const { handlers, setDropTargetPane } = setup()
      const e = createMockEvent({
        currentTarget: { contains: vi.fn(() => true) },
      })
      handlers.onDragLeave(e)
      expect(setDropTargetPane).not.toHaveBeenCalled()
    })
  })

  describe('onDrop', () => {
    it('handles file tree drop with application/json', () => {
      const { handlers, setDraggedTab, setPaneFile, setActivePane } = setup('secondary')
      const e = createMockEvent({
        dataTransfer: {
          types: ['application/json'],
          getData: vi.fn(() => JSON.stringify({ type: 'file', path: '/dropped.ts' })),
          dropEffect: '',
        },
      })
      handlers.onDrop(e)
      expect(e.preventDefault).toHaveBeenCalled()
      expect(setPaneFile).toHaveBeenCalledWith('secondary', '/dropped.ts')
      expect(setActivePane).toHaveBeenCalledWith('secondary')
      expect(setDraggedTab).toHaveBeenCalledWith(null)
    })

    it('handles file tree drop on main pane with onLoadFile', () => {
      const { handlers, onLoadFile, setPaneFile } = setup('main')
      const e = createMockEvent({
        dataTransfer: {
          types: ['application/json'],
          getData: vi.fn(() => JSON.stringify({ type: 'file', path: '/main.ts' })),
          dropEffect: '',
        },
      })
      handlers.onDrop(e)
      expect(onLoadFile).toHaveBeenCalledWith('/main.ts')
      expect(setPaneFile).not.toHaveBeenCalled()
    })

    it('handles cross-pane tab drop', () => {
      const setDraggedTab = vi.fn()
      const setPaneFile = vi.fn()
      const setActivePane = vi.fn()
      const handlers = createEditorDragDropHandlers({
        paneId: 'main',
        draggedTab: { paneId: 'secondary', path: '/cross.ts' },
        setDropTargetPane: vi.fn(),
        setDraggedTab,
        setPaneFile,
        setActivePane,
      })
      const e = createMockEvent({
        dataTransfer: { types: [], getData: vi.fn(() => ''), dropEffect: '' },
      })
      handlers.onDrop(e)
      expect(setPaneFile).toHaveBeenCalledWith('main', '/cross.ts')
      expect(setActivePane).toHaveBeenCalledWith('main')
      expect(setDraggedTab).toHaveBeenCalledWith(null)
    })

    it('ignores invalid JSON data', () => {
      const { handlers, setPaneFile } = setup('secondary')
      const e = createMockEvent({
        dataTransfer: {
          types: ['application/json'],
          getData: vi.fn(() => 'not-json'),
          dropEffect: '',
        },
      })
      handlers.onDrop(e)
      // No file opened, but draggedTab cleared
      expect(setPaneFile).not.toHaveBeenCalled()
    })

    it('ignores JSON without file type', () => {
      const { handlers, setPaneFile } = setup('secondary')
      const e = createMockEvent({
        dataTransfer: {
          types: ['application/json'],
          getData: vi.fn(() => JSON.stringify({ type: 'folder', path: '/src' })),
          dropEffect: '',
        },
      })
      handlers.onDrop(e)
      expect(setPaneFile).not.toHaveBeenCalled()
    })
  })
})
