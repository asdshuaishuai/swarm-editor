import { describe, it, expect, vi } from 'vitest'
import { executeEditorAction } from './monacoEditorActions'

function createMockEditor(overrides?: Record<string, unknown>) {
  const edits: Array<{ source: string; edits: unknown[] }> = []
  const positions: unknown[] = []
  const undoStops: string[] = []
  const triggered: Array<{ source: string; handlerId: string; payload: unknown }> = []

  const model = {
    getValueInRange: vi.fn((range: { startLineNumber: number; endLineNumber: number }) => {
      const lines = ['hello world', 'alpha beta', 'gamma delta']
      return lines.slice(range.startLineNumber - 1, range.endLineNumber).join('\n')
    }),
    getLineContent: vi.fn((line: number) => {
      const lines = ['hello world', 'alpha beta', 'gamma delta']
      return lines[line - 1] || ''
    }),
    getLineCount: vi.fn(() => 3),
  }

  return {
    getModel: vi.fn(() => model),
    getSelections: vi.fn(() => [{ startLineNumber: 1, startColumn: 1, endLineNumber: 3, endColumn: 12, isEmpty: () => false }]),
    getPosition: vi.fn(() => ({ lineNumber: 1, column: 5 })),
    pushUndoStop: vi.fn(() => undoStops.push('push')),
    executeEdits: vi.fn((source: string, editsList: unknown[]) => edits.push({ source, edits: editsList })),
    setPosition: vi.fn((pos: unknown) => positions.push(pos)),
    setScrollTop: vi.fn(),
    getScrollHeight: vi.fn(() => 500),
    revealLineInCenter: vi.fn(),
    focus: vi.fn(),
    trigger: vi.fn((source: string, handlerId: string, payload: unknown) => triggered.push({ source, handlerId, payload })),
    getAction: vi.fn(() => ({ run: vi.fn() })),
    _contributions: {},
    ...overrides,
    // Accessors for assertions
    _edits: edits,
    _positions: positions,
    _undoStops: undoStops,
    _triggered: triggered,
    _model: model,
  }
}

describe('executeEditorAction', () => {
  describe('sort lines', () => {
    it('sorts lines ascending', () => {
      const editor = createMockEditor()
      executeEditorAction(editor, 'editor.action.sortLinesAscending')
      expect(editor.executeEdits).toHaveBeenCalledWith('sortLines', expect.any(Array))
      const editArgs = editor._edits[0]?.edits[0] as { text: string }
      expect(editArgs.text).toBeDefined()
    })

    it('sorts lines descending', () => {
      const editor = createMockEditor()
      executeEditorAction(editor, 'editor.action.sortLinesDescending')
      expect(editor.executeEdits).toHaveBeenCalledWith('sortLines', expect.any(Array))
    })

    it('does nothing if no model', () => {
      const editor = createMockEditor({ getModel: vi.fn(() => null) })
      executeEditorAction(editor, 'editor.action.sortLinesAscending')
      expect(editor.executeEdits).not.toHaveBeenCalled()
    })

    it('does nothing if no selections', () => {
      const editor = createMockEditor({ getSelections: vi.fn(() => []) })
      executeEditorAction(editor, 'editor.action.sortLinesAscending')
      expect(editor.executeEdits).not.toHaveBeenCalled()
    })
  })

  describe('transform case', () => {
    it('transforms to uppercase', () => {
      const editor = createMockEditor({
        getSelections: vi.fn(() => [{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5, isEmpty: () => false }]),
      })
      editor._model.getValueInRange = vi.fn(() => 'hello')
      executeEditorAction(editor, 'editor.action.transformToUppercase')
      expect(editor.executeEdits).toHaveBeenCalledWith('transformCase', expect.any(Array))
      const editArgs = editor._edits[0]?.edits[0] as { text: string }
      expect(editArgs.text).toBe('HELLO')
    })

    it('transforms to lowercase', () => {
      const editor = createMockEditor({
        getSelections: vi.fn(() => [{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5, isEmpty: () => false }]),
      })
      editor._model.getValueInRange = vi.fn(() => 'HELLO')
      executeEditorAction(editor, 'editor.action.transformToLowercase')
      const editArgs = editor._edits[0]?.edits[0] as { text: string }
      expect(editArgs.text).toBe('hello')
    })

    it('skips empty selections', () => {
      const editor = createMockEditor({
        getSelections: vi.fn(() => [{ startLineNumber: 1, startColumn: 5, endLineNumber: 1, endColumn: 5, isEmpty: () => true }]),
      })
      executeEditorAction(editor, 'editor.action.transformToUppercase')
      expect(editor.executeEdits).not.toHaveBeenCalled()
    })
  })

  describe('transpose letters', () => {
    it('swaps two adjacent characters at cursor', () => {
      const editor = createMockEditor()
      editor._model.getLineContent = vi.fn(() => 'abcdef')
      executeEditorAction(editor, 'editor.action.transposeLetters')
      expect(editor.executeEdits).toHaveBeenCalledWith('transpose', expect.any(Array))
      const editArgs = editor._edits[0]?.edits[0] as { text: string }
      // col=5, slice(3,5) = 'de', transposed = 'ed'
      expect(editArgs.text).toBe('ed')
    })

    it('does nothing at column 1', () => {
      const editor = createMockEditor({
        getPosition: vi.fn(() => ({ lineNumber: 1, column: 1 })),
      })
      executeEditorAction(editor, 'editor.action.transposeLetters')
      expect(editor.executeEdits).not.toHaveBeenCalled()
    })

    it('does nothing past end of line', () => {
      const editor = createMockEditor({
        getPosition: vi.fn(() => ({ lineNumber: 1, column: 20 })),
      })
      editor._model.getLineContent = vi.fn(() => 'short')
      executeEditorAction(editor, 'editor.action.transposeLetters')
      expect(editor.executeEdits).not.toHaveBeenCalled()
    })
  })

  describe('cursor navigation', () => {
    it('moves cursor to top', () => {
      const editor = createMockEditor()
      executeEditorAction(editor, 'cursorTop')
      expect(editor.setPosition).toHaveBeenCalledWith({ lineNumber: 1, column: 1 })
      expect(editor.focus).toHaveBeenCalled()
    })

    it('moves cursor to bottom', () => {
      const editor = createMockEditor()
      executeEditorAction(editor, 'cursorBottom')
      expect(editor.setPosition).toHaveBeenCalledWith({ lineNumber: 3, column: 1 })
      expect(editor.focus).toHaveBeenCalled()
    })
  })

  describe('scroll actions', () => {
    it('scrolls to top', () => {
      const editor = createMockEditor()
      executeEditorAction(editor, 'editor.action.scrollToTop')
      expect(editor.setScrollTop).toHaveBeenCalledWith(0)
    })

    it('scrolls to bottom', () => {
      const editor = createMockEditor()
      executeEditorAction(editor, 'editor.action.scrollToBottom')
      expect(editor.setScrollTop).toHaveBeenCalledWith(500)
    })
  })

  describe('undo/redo', () => {
    it('triggers undo', () => {
      const editor = createMockEditor()
      executeEditorAction(editor, 'undo')
      expect(editor.trigger).toHaveBeenCalledWith('keyboard', 'undo', null)
    })

    it('triggers redo', () => {
      const editor = createMockEditor()
      executeEditorAction(editor, 'redo')
      expect(editor.trigger).toHaveBeenCalledWith('keyboard', 'redo', null)
    })
  })

  describe('action delegation', () => {
    it('delegates goToTypeDefinition to revealTypeDefinition', () => {
      const mockAction = { run: vi.fn() }
      const editor = createMockEditor({ getAction: vi.fn(() => mockAction) })
      executeEditorAction(editor, 'editor.action.goToTypeDefinition')
      expect(editor.getAction).toHaveBeenCalledWith('editor.action.revealTypeDefinition')
      expect(mockAction.run).toHaveBeenCalled()
    })

    it('delegates goToReferences to referenceSearch.trigger', () => {
      const mockAction = { run: vi.fn() }
      const editor = createMockEditor({ getAction: vi.fn(() => mockAction) })
      executeEditorAction(editor, 'editor.action.goToReferences')
      expect(editor.getAction).toHaveBeenCalledWith('editor.action.referenceSearch.trigger')
    })

    it('delegates indentLines to indent action', () => {
      const mockAction = { run: vi.fn() }
      const editor = createMockEditor({ getAction: vi.fn(() => mockAction) })
      executeEditorAction(editor, 'editor.action.indentLines')
      expect(editor.getAction).toHaveBeenCalledWith('editor.action.indent')
    })

    it('delegates outdentLines to outdent action', () => {
      const mockAction = { run: vi.fn() }
      const editor = createMockEditor({ getAction: vi.fn(() => mockAction) })
      executeEditorAction(editor, 'editor.action.outdentLines')
      expect(editor.getAction).toHaveBeenCalledWith('editor.action.outdent')
    })

    it('falls back to built-in Monaco action for unknown actions', () => {
      const mockAction = { run: vi.fn() }
      const editor = createMockEditor({ getAction: vi.fn(() => mockAction) })
      executeEditorAction(editor, 'editor.action.someUnknownAction')
      expect(editor.getAction).toHaveBeenCalledWith('editor.action.someUnknownAction')
      expect(mockAction.run).toHaveBeenCalled()
    })
  })
})
