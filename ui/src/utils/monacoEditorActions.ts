interface EditorSelection {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
  isEmpty(): boolean
}

interface EditorPosition {
  lineNumber: number
  column: number
}

interface EditorModel {
  getValueInRange(range: EditorSelection): string
  getLineContent(line: number): string
  getLineCount(): number
}

interface EditorAction {
  run(): void
}

interface EditorInstance {
  getModel(): EditorModel | null
  getSelections(): EditorSelection[] | null
  pushUndoStop(): void
  executeEdits(source: string, edits: Array<{ range: EditorSelection | { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }; text: string }>): void
  getPosition(): EditorPosition | null
  setPosition(pos: { lineNumber: number; column: number }): void
  setScrollTop(scrollTop: number): void
  getScrollHeight(): number
  revealLineInCenter(line: number): void
  focus(): void
  getAction(id: string): EditorAction | null
  trigger(source: string, handlerId: string, payload: unknown): void
  _contributions?: Record<string, { getState(): { matchCase: boolean; wholeWord: boolean; regex: boolean; change(opts: Record<string, boolean>, b: boolean): void } }>
}

/**
 * Execute a VS Code-style editor action on a Monaco editor instance.
 * Handles both built-in Monaco actions and custom implementations.
 */
export function executeEditorAction(editor: EditorInstance, actionId: string) {
  // Custom implementations for actions not available in Monaco standalone
  switch (actionId) {
    case 'editor.action.sortLinesAscending':
    case 'editor.action.sortLinesDescending': {
      const model = editor.getModel()
      if (!model) break
      const selections = editor.getSelections()
      if (!selections?.length) break
      const asc = actionId === 'editor.action.sortLinesAscending'
      editor.pushUndoStop()
      for (const sel of selections) {
        const text = model.getValueInRange(sel)
        const lines = text.split('\n').sort((a: string, b: string) => asc ? a.localeCompare(b) : b.localeCompare(a))
        editor.executeEdits('sortLines', [{ range: sel, text: lines.join('\n') }])
      }
      editor.pushUndoStop()
      return
    }
    case 'editor.action.transformToUppercase':
    case 'editor.action.transformToLowercase': {
      const model = editor.getModel()
      if (!model) break
      const selections = editor.getSelections()
      if (!selections?.length) break
      const upper = actionId === 'editor.action.transformToUppercase'
      editor.pushUndoStop()
      for (const sel of selections) {
        if (sel.isEmpty()) continue
        const text = model.getValueInRange(sel)
        editor.executeEdits('transformCase', [{ range: sel, text: upper ? text.toUpperCase() : text.toLowerCase() }])
      }
      editor.pushUndoStop()
      return
    }
    case 'editor.action.transposeLetters': {
      const model = editor.getModel()
      if (!model) break
      const pos = editor.getPosition()
      if (!pos) break
      const lineContent = model.getLineContent(pos.lineNumber)
      const col = pos.column
      if (col < 2 || col > lineContent.length) break
      const chars = lineContent.slice(col - 2, col)
      editor.executeEdits('transpose', [{
        range: { startLineNumber: pos.lineNumber, startColumn: col - 1, endLineNumber: pos.lineNumber, endColumn: col + 1 },
        text: chars[1] + chars[0],
      }])
      editor.setPosition({ lineNumber: pos.lineNumber, column: col + 1 })
      return
    }
    case 'cursorTop': {
      editor.setPosition({ lineNumber: 1, column: 1 })
      editor.revealLineInCenter(1)
      editor.focus()
      return
    }
    case 'cursorBottom': {
      const lineCount = editor.getModel()?.getLineCount() ?? 1
      editor.setPosition({ lineNumber: lineCount, column: 1 })
      editor.revealLineInCenter(lineCount)
      editor.focus()
      return
    }
    case 'editor.action.scrollToTop':
      editor.setScrollTop(0)
      editor.focus()
      return
    case 'editor.action.scrollToBottom':
      editor.setScrollTop(editor.getScrollHeight())
      editor.focus()
      return
    case 'editor.action.toggleFindCaseSensitive':
    case 'editor.action.toggleFindWholeWord':
    case 'editor.action.toggleFindRegex': {
      // Use Monaco's find controller to toggle find options
      const findController = editor._contributions?.['editor.contrib.findController']
      if (findController) {
        const findState = findController.getState()
        switch (actionId) {
          case 'editor.action.toggleFindCaseSensitive':
            findState.change({ matchCase: !findState.matchCase }, true)
            break
          case 'editor.action.toggleFindWholeWord':
            findState.change({ wholeWord: !findState.wholeWord }, true)
            break
          case 'editor.action.toggleFindRegex':
            findState.change({ regex: !findState.regex }, true)
            break
        }
      }
      return
    }
    case 'undo':
      editor.trigger('keyboard', 'undo', null)
      return
    case 'redo':
      editor.trigger('keyboard', 'redo', null)
      return
    // Fix wrong Monaco action IDs
    case 'editor.action.goToTypeDefinition':
      editor.getAction('editor.action.revealTypeDefinition')?.run()
      return
    case 'editor.action.goToReferences':
      editor.getAction('editor.action.referenceSearch.trigger')?.run()
      return
    case 'editor.action.indentLines':
      editor.getAction('editor.action.indent')?.run()
      return
    case 'editor.action.outdentLines':
      editor.getAction('editor.action.outdent')?.run()
      return
  }

  // Default: try Monaco built-in action
  const action = editor.getAction(actionId)
  if (action) action.run()
}
