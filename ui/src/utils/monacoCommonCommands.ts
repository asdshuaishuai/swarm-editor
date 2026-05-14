import { getVSCodeKeybindings } from './monacoKeybindings'
import { createEditorContextMenuActions } from './monacoContextMenu'
import { registerEditorStatusTracking } from './monacoEditorSetup'

interface RegisterCommonEditorCommandsOptions {
  editor: any
  monaco: any
  disposables: any[]
  settings: any
  updateSetting: (key: string, value: any) => void
  onSave: () => void
  onAccessibilityHelp: () => void
  onFocusOutline: () => void
  onNavigateProblem: (direction: 1 | -1) => void
}

/**
 * Register common editor keybindings and commands shared between main and secondary panes.
 * Includes: VS Code keybindings, Ctrl+S save, Ctrl+G no-op, Ctrl+Shift+O outline,
 * Alt+F1 accessibility, F8/Shift+F8 problem navigation, context menu, status tracking.
 */
export function registerCommonEditorCommands(options: RegisterCommonEditorCommandsOptions) {
  const {
    editor,
    monaco,
    disposables,
    settings,
    updateSetting,
    onSave,
    onAccessibilityHelp,
    onFocusOutline,
    onNavigateProblem,
  } = options

  // VS Code keybindings for multi-cursor and line operations
  for (const kb of getVSCodeKeybindings(monaco)) {
    disposables.push(editor.addCommand(kb.key, () => {
      const action = editor.getAction(kb.id)
      if (action) action.run()
    }))
  }

  // Save: Ctrl+S
  disposables.push(editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, onSave))

  // Suppress Monaco's built-in Ctrl+G (gotoLine) — App.tsx handles via 'open-goto-line' CustomEvent
  disposables.push(editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG, () => {
    // no-op: App.tsx dispatches 'open-goto-line' which CommandPalette handles
  }))

  // Focus outline panel (Ctrl+Shift+O)
  disposables.push(editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyO, onFocusOutline))

  // Alt+F1 Accessibility Help
  disposables.push(editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.F1, onAccessibilityHelp))

  // Navigate problems (F8 / Shift+F8)
  disposables.push(editor.addCommand(monaco.KeyCode.F8, () => onNavigateProblem(1)))
  disposables.push(editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.F8, () => onNavigateProblem(-1)))

  // Toggle Full Screen (F11)
  disposables.push(editor.addCommand(monaco.KeyCode.F11, () => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      document.documentElement.requestFullscreen()
    }
  }))

  // Select All (Ctrl+A)
  disposables.push(editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyA, () => {
    const action = editor.getAction('editor.action.selectAll')
    if (action) action.run()
  }))

  // Context menu actions (right-click menu)
  const contextMenuActions = createEditorContextMenuActions(editor, monaco, settings, updateSetting)
  for (const action of contextMenuActions) {
    disposables.push(editor.addAction(action))
  }

  // Track cursor position, selection, language, and indentation for StatusBar
  registerEditorStatusTracking(editor, disposables)
}
