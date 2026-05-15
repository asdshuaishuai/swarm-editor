import { useCallback } from 'react'
import type { editor } from 'monaco-editor'
import { lspApi } from '../services/lspApi'

interface UseEditorCallbacksOptions {
  activePaneId: string
  splitDirection: string
  editorRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>
  secondaryEditorRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>
  secondaryDisposablesRef: React.MutableRefObject<any[]>
  secondaryAutoSaveTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  secondaryLspOpenFileRef: React.MutableRefObject<string | null>
  closeSplit: () => void
}

export function useEditorCallbacks(options: UseEditorCallbacksOptions) {
  const {
    activePaneId, splitDirection, editorRef, secondaryEditorRef,
    secondaryDisposablesRef, secondaryAutoSaveTimeoutRef, secondaryLspOpenFileRef, closeSplit,
  } = options

  const handleFormat = useCallback(() => {
    const editor = activePaneId === 'secondary' && splitDirection !== 'none'
      ? secondaryEditorRef.current
      : editorRef.current
    if (editor) {
      const formatAction = editor.getAction('editor.action.formatDocument')
      if (formatAction) formatAction.run()
    }
  }, [activePaneId, splitDirection, editorRef, secondaryEditorRef])

  const handleCloseSplit = useCallback(() => {
    secondaryDisposablesRef.current.forEach((d: any) => d.dispose())
    secondaryDisposablesRef.current = []
    if (secondaryAutoSaveTimeoutRef.current) {
      clearTimeout(secondaryAutoSaveTimeoutRef.current)
      secondaryAutoSaveTimeoutRef.current = null
    }
    if (secondaryLspOpenFileRef.current) {
      lspApi.didClose(secondaryLspOpenFileRef.current).catch(() => {})
    }
    secondaryLspOpenFileRef.current = null
    closeSplit()
  }, [closeSplit])

  return { handleFormat, handleCloseSplit }
}
