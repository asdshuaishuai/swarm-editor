import type { editor } from 'monaco-editor'
import { registerSwarmTheme, getMonacoTheme } from '../theme/monacoTheme'
import { registerLSPProviders } from './monacoLSP'
import { registerCommonEditorCommands } from './monacoCommonCommands'
import { registerSecondaryContentChangeListener } from './monacoEditorMount'

interface EditorMountRefs {
  editorRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>
  monacoRef: React.MutableRefObject<typeof import('monaco-editor') | null>
  providerDisposablesRef: React.MutableRefObject<any[]>
  inlayHintsRef: React.MutableRefObject<boolean>
  lspInitiatedEditRef: React.MutableRefObject<boolean>
  lspOpenFileRef: React.MutableRefObject<string | null>
  lspPendingChangesRef: React.MutableRefObject<any[]>
}

interface EditorMountOptions extends EditorMountRefs {
  settings: any
  updateSetting: (key: string, value: any) => void
  onSave: () => void
  onAccessibilityHelp: () => void
  onFocusOutline: () => void
  onNavigateProblem: (direction: 1 | -1) => void
  effectiveTheme: 'dark' | 'light'
  isMain: boolean
  // Secondary-only
  secondaryDisposablesRef?: React.MutableRefObject<any[]>
  secondaryLspInitiatedEditRef?: React.MutableRefObject<boolean>
  secondaryLspPendingChangesRef?: React.MutableRefObject<any[]>
  setActivePane?: (paneId: string) => void
}

export function createEditorMountHandler(options: EditorMountOptions) {
  const {
    editorRef, monacoRef, providerDisposablesRef,
    inlayHintsRef, lspInitiatedEditRef, lspOpenFileRef, lspPendingChangesRef,
    settings, updateSetting, onSave, onAccessibilityHelp, onFocusOutline, onNavigateProblem,
    effectiveTheme, isMain,
    secondaryDisposablesRef, secondaryLspInitiatedEditRef, secondaryLspPendingChangesRef, setActivePane,
  } = options

  return (editor: editor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) => {
    editorRef.current = editor

    if (isMain) {
      monacoRef.current = monaco
      registerSwarmTheme(monaco)
      monaco.editor.setTheme(getMonacoTheme(effectiveTheme))
      providerDisposablesRef.current.forEach(d => d.dispose())
      providerDisposablesRef.current = []
    }

    const disposables: any[] = []

    // Track focus for active pane switching (replaces 200ms polling)
    if (setActivePane) {
      disposables.push(
        editor.onDidFocusEditorWidget(() => { setActivePane(isMain ? 'main' : 'secondary') })
      )
    }

    if (isMain) {
      registerLSPProviders(monaco, editor, disposables, {
        inlayHintsRef,
        lspInitiatedEditRef,
        lspOpenFileRef,
        lspPendingChangesRef,
      })
    } else {
      secondaryDisposablesRef!.current.forEach((d: any) => d.dispose())
      secondaryDisposablesRef!.current = []

      registerSecondaryContentChangeListener({
        editor,
        disposables: secondaryDisposablesRef!.current,
        secondaryLspInitiatedEditRef: secondaryLspInitiatedEditRef!,
        secondaryLspPendingChangesRef: secondaryLspPendingChangesRef!,
      })
    }

    const targetDisposables = isMain ? disposables : secondaryDisposablesRef!.current

    registerCommonEditorCommands({
      editor,
      monaco,
      disposables: targetDisposables,
      settings,
      updateSetting,
      onSave,
      onAccessibilityHelp,
      onFocusOutline,
      onNavigateProblem,
    })

    if (isMain) {
      providerDisposablesRef.current = disposables
    }
  }
}
