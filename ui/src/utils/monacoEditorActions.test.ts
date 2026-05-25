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

    it('does nothing when built-in action not found', () => {
      const editor = createMockEditor({ getAction: vi.fn(() => null) })
      expect(() => executeEditorAction(editor, 'editor.action.nonexistent')).not.toThrow()
    })
  })

  // ---------------------------------------------------------------
  // Sort lines edge cases
  // ---------------------------------------------------------------
  describe('sort lines edge cases', () => {
    it('sorts ascending with multiple selections', () => {
      const editor = createMockEditor({
        getSelections: vi.fn(() => [
          { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 6, isEmpty: () => false },
          { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 12, isEmpty: () => false },
        ]),
      })
      executeEditorAction(editor, 'editor.action.sortLinesAscending')
      expect(editor.executeEdits).toHaveBeenCalledTimes(2)
    })

    it('sorts descending produces reverse order', () => {
      const editor = createMockEditor({
        getSelections: vi.fn(() => [{ startLineNumber: 1, startColumn: 1, endLineNumber: 3, endColumn: 12, isEmpty: () => false }]),
      })
      editor._model.getValueInRange = vi.fn(() => 'gamma\nbeta\nalpha')
      executeEditorAction(editor, 'editor.action.sortLinesDescending')
      const editArgs = editor._edits[0]?.edits[0] as { text: string }
      expect(editArgs.text).toBe('gamma\nbeta\nalpha')
    })

    it('does nothing when getSelections returns null', () => {
      const editor = createMockEditor({ getSelections: vi.fn(() => null) })
      executeEditorAction(editor, 'editor.action.sortLinesAscending')
      expect(editor.executeEdits).not.toHaveBeenCalled()
    })

    it('pushes undo stops around sort edits', () => {
      const editor = createMockEditor()
      executeEditorAction(editor, 'editor.action.sortLinesAscending')
      expect(editor._undoStops.length).toBeGreaterThanOrEqual(2)
    })
  })

  // ---------------------------------------------------------------
  // Transform case edge cases
  // ---------------------------------------------------------------
  describe('transform case edge cases', () => {
    it('does nothing if no model for transform', () => {
      const editor = createMockEditor({ getModel: vi.fn(() => null) })
      executeEditorAction(editor, 'editor.action.transformToUppercase')
      expect(editor.executeEdits).not.toHaveBeenCalled()
    })

    it('does nothing if no selections for transform', () => {
      const editor = createMockEditor({ getSelections: vi.fn(() => null) })
      executeEditorAction(editor, 'editor.action.transformToUppercase')
      expect(editor.executeEdits).not.toHaveBeenCalled()
    })

    it('does nothing if empty selections array for transform', () => {
      const editor = createMockEditor({ getSelections: vi.fn(() => []) })
      executeEditorAction(editor, 'editor.action.transformToUppercase')
      expect(editor.executeEdits).not.toHaveBeenCalled()
    })

    it('pushes undo stops around transform edits', () => {
      const editor = createMockEditor({
        getSelections: vi.fn(() => [{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5, isEmpty: () => false }]),
      })
      editor._model.getValueInRange = vi.fn(() => 'hello')
      executeEditorAction(editor, 'editor.action.transformToUppercase')
      expect(editor._undoStops.length).toBeGreaterThanOrEqual(2)
    })

    it('handles mixed case to lowercase', () => {
      const editor = createMockEditor({
        getSelections: vi.fn(() => [{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 8, isEmpty: () => false }]),
      })
      editor._model.getValueInRange = vi.fn(() => 'HeLLo')
      executeEditorAction(editor, 'editor.action.transformToLowercase')
      const editArgs = editor._edits[0]?.edits[0] as { text: string }
      expect(editArgs.text).toBe('hello')
    })

    it('skips multiple empty selections but processes non-empty ones', () => {
      const editor = createMockEditor({
        getSelections: vi.fn(() => [
          { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1, isEmpty: () => true },
          { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5, isEmpty: () => false },
        ]),
      })
      editor._model.getValueInRange = vi.fn(() => 'hello')
      executeEditorAction(editor, 'editor.action.transformToUppercase')
      // Only the non-empty selection should produce an edit
      expect(editor.executeEdits).toHaveBeenCalledTimes(1)
    })
  })

  // ---------------------------------------------------------------
  // Transpose letters edge cases
  // ---------------------------------------------------------------
  describe('transpose letters edge cases', () => {
    it('does nothing if no model', () => {
      const editor = createMockEditor({ getModel: vi.fn(() => null) })
      executeEditorAction(editor, 'editor.action.transposeLetters')
      expect(editor.executeEdits).not.toHaveBeenCalled()
    })

    it('does nothing if no position', () => {
      const editor = createMockEditor({ getPosition: vi.fn(() => null) })
      executeEditorAction(editor, 'editor.action.transposeLetters')
      expect(editor.executeEdits).not.toHaveBeenCalled()
    })

    it('transposes at column 2 (minimum valid position)', () => {
      const editor = createMockEditor({
        getPosition: vi.fn(() => ({ lineNumber: 1, column: 2 })),
      })
      editor._model.getLineContent = vi.fn(() => 'ab')
      executeEditorAction(editor, 'editor.action.transposeLetters')
      expect(editor.executeEdits).toHaveBeenCalledWith('transpose', expect.any(Array))
      const editArgs = editor._edits[0]?.edits[0] as { text: string }
      expect(editArgs.text).toBe('ba')
    })

    it('transposes at end of line', () => {
      const editor = createMockEditor({
        getPosition: vi.fn(() => ({ lineNumber: 1, column: 5 })),
      })
      editor._model.getLineContent = vi.fn(() => 'abcde')
      executeEditorAction(editor, 'editor.action.transposeLetters')
      const editArgs = editor._edits[0]?.edits[0] as { text: string }
      // col=5, slice(3,5)='de', transposed='ed'
      expect(editArgs.text).toBe('ed')
    })

    it('does nothing when column equals line length + 1', () => {
      const editor = createMockEditor({
        getPosition: vi.fn(() => ({ lineNumber: 1, column: 6 })),
      })
      editor._model.getLineContent = vi.fn(() => 'abcde')
      executeEditorAction(editor, 'editor.action.transposeLetters')
      expect(editor.executeEdits).not.toHaveBeenCalled()
    })

    it('updates position after transposing', () => {
      const editor = createMockEditor()
      editor._model.getLineContent = vi.fn(() => 'abcdef')
      executeEditorAction(editor, 'editor.action.transposeLetters')
      expect(editor.setPosition).toHaveBeenCalledWith({ lineNumber: 1, column: 6 })
    })

    it('uses correct range in edit', () => {
      const editor = createMockEditor()
      editor._model.getLineContent = vi.fn(() => 'abcdef')
      executeEditorAction(editor, 'editor.action.transposeLetters')
      const editArgs = editor._edits[0]?.edits[0] as { range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }; text: string }
      expect(editArgs.range).toEqual({
        startLineNumber: 1,
        startColumn: 4,
        endLineNumber: 1,
        endColumn: 6,
      })
    })
  })

  // ---------------------------------------------------------------
  // Cursor navigation edge cases
  // ---------------------------------------------------------------
  describe('cursor navigation edge cases', () => {
    it('cursorTop reveals line 1 in center', () => {
      const editor = createMockEditor()
      executeEditorAction(editor, 'cursorTop')
      expect(editor.revealLineInCenter).toHaveBeenCalledWith(1)
    })

    it('cursorBottom handles single line document', () => {
      const editor = createMockEditor({
        getModel: vi.fn(() => ({
          ...createMockEditor()._model,
          getLineCount: vi.fn(() => 1),
        })),
      })
      executeEditorAction(editor, 'cursorBottom')
      expect(editor.setPosition).toHaveBeenCalledWith({ lineNumber: 1, column: 1 })
      expect(editor.revealLineInCenter).toHaveBeenCalledWith(1)
    })

    it('cursorBottom handles null model', () => {
      const editor = createMockEditor({ getModel: vi.fn(() => null) })
      executeEditorAction(editor, 'cursorBottom')
      expect(editor.setPosition).toHaveBeenCalledWith({ lineNumber: 1, column: 1 })
    })
  })

  // ---------------------------------------------------------------
  // Scroll actions edge cases
  // ---------------------------------------------------------------
  describe('scroll actions edge cases', () => {
    it('scrollToTop focuses editor', () => {
      const editor = createMockEditor()
      executeEditorAction(editor, 'editor.action.scrollToTop')
      expect(editor.focus).toHaveBeenCalled()
    })

    it('scrollToBottom focuses editor', () => {
      const editor = createMockEditor()
      executeEditorAction(editor, 'editor.action.scrollToBottom')
      expect(editor.focus).toHaveBeenCalled()
    })

    it('scrollToBottom uses scroll height from editor', () => {
      const editor = createMockEditor({ getScrollHeight: vi.fn(() => 1200) })
      executeEditorAction(editor, 'editor.action.scrollToBottom')
      expect(editor.setScrollTop).toHaveBeenCalledWith(1200)
    })
  })

  // ---------------------------------------------------------------
  // Find toggle actions
  // ---------------------------------------------------------------
  describe('find toggle actions', () => {
    it('toggles case sensitive from false to true', () => {
      const change = vi.fn()
      const editor = createMockEditor({
        _contributions: {
          'editor.contrib.findController': {
            getState: () => ({ matchCase: false, wholeWord: false, regex: false, change }),
          },
        },
      })
      executeEditorAction(editor, 'editor.action.toggleFindCaseSensitive')
      expect(change).toHaveBeenCalledWith({ matchCase: true }, true)
    })

    it('toggles case sensitive from true to false', () => {
      const change = vi.fn()
      const editor = createMockEditor({
        _contributions: {
          'editor.contrib.findController': {
            getState: () => ({ matchCase: true, wholeWord: false, regex: false, change }),
          },
        },
      })
      executeEditorAction(editor, 'editor.action.toggleFindCaseSensitive')
      expect(change).toHaveBeenCalledWith({ matchCase: false }, true)
    })

    it('toggles whole word from false to true', () => {
      const change = vi.fn()
      const editor = createMockEditor({
        _contributions: {
          'editor.contrib.findController': {
            getState: () => ({ matchCase: false, wholeWord: false, regex: false, change }),
          },
        },
      })
      executeEditorAction(editor, 'editor.action.toggleFindWholeWord')
      expect(change).toHaveBeenCalledWith({ wholeWord: true }, true)
    })

    it('toggles whole word from true to false', () => {
      const change = vi.fn()
      const editor = createMockEditor({
        _contributions: {
          'editor.contrib.findController': {
            getState: () => ({ matchCase: false, wholeWord: true, regex: false, change }),
          },
        },
      })
      executeEditorAction(editor, 'editor.action.toggleFindWholeWord')
      expect(change).toHaveBeenCalledWith({ wholeWord: false }, true)
    })

    it('toggles regex from false to true', () => {
      const change = vi.fn()
      const editor = createMockEditor({
        _contributions: {
          'editor.contrib.findController': {
            getState: () => ({ matchCase: false, wholeWord: false, regex: false, change }),
          },
        },
      })
      executeEditorAction(editor, 'editor.action.toggleFindRegex')
      expect(change).toHaveBeenCalledWith({ regex: true }, true)
    })

    it('toggles regex from true to false', () => {
      const change = vi.fn()
      const editor = createMockEditor({
        _contributions: {
          'editor.contrib.findController': {
            getState: () => ({ matchCase: false, wholeWord: false, regex: true, change }),
          },
        },
      })
      executeEditorAction(editor, 'editor.action.toggleFindRegex')
      expect(change).toHaveBeenCalledWith({ regex: false }, true)
    })

    it('does nothing when find controller contribution is missing', () => {
      const editor = createMockEditor({ _contributions: {} })
      expect(() => executeEditorAction(editor, 'editor.action.toggleFindCaseSensitive')).not.toThrow()
      expect(() => executeEditorAction(editor, 'editor.action.toggleFindWholeWord')).not.toThrow()
      expect(() => executeEditorAction(editor, 'editor.action.toggleFindRegex')).not.toThrow()
    })

    it('does nothing when _contributions is undefined', () => {
      const editor = createMockEditor({ _contributions: undefined })
      expect(() => executeEditorAction(editor, 'editor.action.toggleFindCaseSensitive')).not.toThrow()
    })
  })

  // ---------------------------------------------------------------
  // Action delegation edge cases
  // ---------------------------------------------------------------
  describe('action delegation edge cases', () => {
    it('handles null action for goToTypeDefinition gracefully', () => {
      const editor = createMockEditor({ getAction: vi.fn(() => null) })
      expect(() => executeEditorAction(editor, 'editor.action.goToTypeDefinition')).not.toThrow()
    })

    it('handles null action for goToReferences gracefully', () => {
      const editor = createMockEditor({ getAction: vi.fn(() => null) })
      expect(() => executeEditorAction(editor, 'editor.action.goToReferences')).not.toThrow()
    })

    it('handles null action for indentLines gracefully', () => {
      const editor = createMockEditor({ getAction: vi.fn(() => null) })
      expect(() => executeEditorAction(editor, 'editor.action.indentLines')).not.toThrow()
    })

    it('handles null action for outdentLines gracefully', () => {
      const editor = createMockEditor({ getAction: vi.fn(() => null) })
      expect(() => executeEditorAction(editor, 'editor.action.outdentLines')).not.toThrow()
    })
  })

  // ---------------------------------------------------------------
  // Sort with single line selection
  // ---------------------------------------------------------------
  describe('sort lines single line', () => {
    it('sorts a single line ascending (no-op on single line)', () => {
      const editor = createMockEditor({
        getSelections: vi.fn(() => [{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 12, isEmpty: () => false }]),
      })
      editor._model.getValueInRange = vi.fn(() => 'hello world')
      executeEditorAction(editor, 'editor.action.sortLinesAscending')
      expect(editor.executeEdits).toHaveBeenCalledWith('sortLines', expect.any(Array))
    })
  })

  // ---------------------------------------------------------------
  // Transform with multiple selections
  // ---------------------------------------------------------------
  describe('transform case multiple selections', () => {
    it('transforms multiple selections to uppercase', () => {
      let callCount = 0
      const editor = createMockEditor({
        getSelections: vi.fn(() => [
          { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5, isEmpty: () => false },
          { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 5, isEmpty: () => false },
        ]),
      })
      editor._model.getValueInRange = vi.fn(() => {
        callCount++
        return callCount === 1 ? 'hello' : 'world'
      })
      executeEditorAction(editor, 'editor.action.transformToUppercase')
      expect(editor.executeEdits).toHaveBeenCalledTimes(2)
    })
  })
})
