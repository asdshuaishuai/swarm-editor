import { useRef } from 'react'
import type { editor } from 'monaco-editor'

export function useEditorRefs() {
  // Monaco model cache (per-file undo history)
  const modelCacheRef = useRef<Map<string, editor.ITextModel>>(new Map())
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null)
  const mountedRef = useRef(true)
  const lspDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lspOpenFileRef = useRef<string | null>(null)
  const lspIncrementalRef = useRef(false)
  const lspPendingChangesRef = useRef<any[]>([])
  const lspInitiatedEditRef = useRef(false)
  const externalReloadRef = useRef(false)
  const providerDisposablesRef = useRef<any[]>([])
  const viewStateMapRef = useRef<Map<string, editor.ICodeEditorViewState>>(new Map())

  // Secondary pane refs (for split editor)
  const secondaryEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const secondaryLspOpenFileRef = useRef<string | null>(null)
  const secondaryLspDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const secondaryLspIncrementalRef = useRef(false)
  const secondaryLspPendingChangesRef = useRef<any[]>([])
  const secondaryLspInitiatedEditRef = useRef(false)
  const secondaryAutoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const secondaryDisposablesRef = useRef<any[]>([])

  return {
    modelCacheRef, editorRef, monacoRef, mountedRef,
    lspDebounceRef, autoSaveTimeoutRef, lspOpenFileRef,
    lspIncrementalRef, lspPendingChangesRef, lspInitiatedEditRef,
    externalReloadRef, providerDisposablesRef, viewStateMapRef,
    secondaryEditorRef, secondaryLspOpenFileRef, secondaryLspDebounceRef,
    secondaryLspIncrementalRef, secondaryLspPendingChangesRef,
    secondaryLspInitiatedEditRef, secondaryAutoSaveTimeoutRef, secondaryDisposablesRef,
  }
}
