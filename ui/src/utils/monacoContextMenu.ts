import type { editor } from 'monaco-editor'

export function createEditorContextMenuActions(
  editor: editor.IStandaloneCodeEditor,
  monaco: any,
  settings: { fontSize: number },
  updateSetting: (key: string, value: any) => void,
) {
  return [
    {
      id: 'cut',
      label: 'Cut',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX],
      contextMenuGroupId: '9_cutcopypaste',
      run: () => {
        editor.focus()
        document.execCommand('cut')
      },
    },
    {
      id: 'copy',
      label: 'Copy',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC],
      contextMenuGroupId: '9_cutcopypaste',
      run: () => {
        editor.focus()
        document.execCommand('copy')
      },
    },
    {
      id: 'paste',
      label: 'Paste',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV],
      contextMenuGroupId: '9_cutcopypaste',
      run: async () => {
        editor.focus()
        try {
          const text = await navigator.clipboard.readText()
          if (text) {
            const selection = editor.getSelection()
            if (selection) {
              editor.executeEdits('paste', [{
                range: selection,
                text: text,
              }])
            }
          }
        } catch {
          document.execCommand('paste')
        }
      },
    },
    {
      id: 'go-to-definition',
      label: 'Go to Definition',
      keybindings: [monaco.KeyCode.F12],
      contextMenuGroupId: 'navigation',
      run: () => {
        const action = editor.getAction('editor.action.revealDefinition')
        if (action) action.run()
      },
    },
    {
      id: 'peek-definition',
      label: 'Peek Definition',
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.F12],
      contextMenuGroupId: 'navigation',
      run: () => {
        const action = editor.getAction('editor.action.peekDefinition')
        if (action) action.run()
      },
    },
    {
      id: 'go-to-references',
      label: 'Go to References',
      keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F12],
      contextMenuGroupId: 'navigation',
      run: () => {
        const action = editor.getAction('editor.action.findReferences')
        if (action) action.run()
      },
    },
    {
      id: 'go-to-type-definition',
      label: 'Go to Type Definition',
      contextMenuGroupId: 'navigation',
      run: () => {
        const action = editor.getAction('editor.action.revealTypeDefinition')
        if (action) action.run()
      },
    },
    {
      id: 'go-to-implementation',
      label: 'Go to Implementation',
      contextMenuGroupId: 'navigation',
      run: () => {
        const action = editor.getAction('editor.action.goToImplementation')
        if (action) action.run()
      },
    },
    {
      id: 'rename-symbol',
      label: 'Rename Symbol',
      keybindings: [monaco.KeyCode.F2],
      contextMenuGroupId: 'navigation',
      run: () => {
        const action = editor.getAction('editor.action.rename')
        if (action) action.run()
      },
    },
    {
      id: 'format-document',
      label: 'Format Document',
      keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
      contextMenuGroupId: 'formatting',
      run: () => {
        const action = editor.getAction('editor.action.formatDocument')
        if (action) action.run()
      },
    },
    {
      id: 'format-selection',
      label: 'Format Selection',
      contextMenuGroupId: 'formatting',
      run: () => {
        const action = editor.getAction('editor.action.formatSelection')
        if (action) action.run()
      },
    },
    {
      id: 'increase-font-size',
      label: 'Increase Font Size',
      contextMenuGroupId: 'font',
      run: () => {
        const newSize = Math.min(32, settings.fontSize + 2)
        updateSetting('fontSize', newSize)
      },
    },
    {
      id: 'decrease-font-size',
      label: 'Decrease Font Size',
      contextMenuGroupId: 'font',
      run: () => {
        const newSize = Math.max(8, settings.fontSize - 2)
        updateSetting('fontSize', newSize)
      },
    },
    {
      id: 'reset-font-size',
      label: 'Reset Font Size',
      contextMenuGroupId: 'font',
      run: () => {
        updateSetting('fontSize', 14)
      },
    },
  ]
}
