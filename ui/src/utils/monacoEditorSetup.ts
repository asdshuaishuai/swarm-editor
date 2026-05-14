import type { editor } from 'monaco-editor'
import { useAppStore } from '../store/appStore'

export function registerEditorStatusTracking(
  editor: editor.IStandaloneCodeEditor,
  disposables: any[],
) {
  const updateCursorPosition = () => {
    const position = editor.getPosition()
    if (position) {
      useAppStore.getState().setEditorCursorPosition({
        line: position.lineNumber,
        column: position.column,
      })
    }
    const selection = editor.getSelection()
    if (selection && !selection.isEmpty()) {
      const model = editor.getModel()
      const selectedText = model?.getValueInRange(selection) || ''
      const lineCount = selection.endLineNumber - selection.startLineNumber + 1
      useAppStore.getState().setEditorSelection({
        lineCount,
        charCount: selectedText.length,
      })
    } else {
      useAppStore.getState().setEditorSelection(null)
    }
  }

  disposables.push(editor.onDidChangeCursorPosition(updateCursorPosition))
  disposables.push(editor.onDidChangeCursorSelection(updateCursorPosition))
  updateCursorPosition()

  const model = editor.getModel()
  if (model) {
    const langId = model.getLanguageId()
    useAppStore.getState().setEditorLanguage(langId)
    disposables.push(model.onDidChangeLanguage(() => {
      useAppStore.getState().setEditorLanguage(model.getLanguageId())
    }))

    const detectIndent = () => {
      const content = model.getValue()
      const lines = content.split('\n').slice(0, 100)
      let spacesCount = 0
      let tabsCount = 0
      const spaceSizes: Record<number, number> = {}

      for (const line of lines) {
        const indent = line.match(/^[\t ]+/)?.[0]
        if (!indent) continue
        if (indent.startsWith('\t')) {
          tabsCount++
        } else {
          spacesCount++
          const size = indent.length
          spaceSizes[size] = (spaceSizes[size] || 0) + 1
        }
      }

      if (tabsCount > spacesCount) {
        useAppStore.getState().setEditorIndent({ type: 'tabs', size: 4 })
      } else if (spacesCount > 0) {
        const sorted = Object.entries(spaceSizes).sort((a, b) => b[1] - a[1])
        const mostCommon = sorted[0] ? parseInt(sorted[0][0]) : 2
        const size = mostCommon <= 3 ? 2 : mostCommon <= 6 ? 4 : mostCommon <= 10 ? 8 : mostCommon
        useAppStore.getState().setEditorIndent({ type: 'spaces', size })
      }
    }
    detectIndent()
  }
}
