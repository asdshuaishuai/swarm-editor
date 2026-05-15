import { useCallback } from 'react'
import type { editor } from 'monaco-editor'
import { useAppStore } from '../store/appStore'
import { useSplitPaneStore } from '../stores/splitPaneStore'
import { handleSaveForEditor, saveFileByPath } from '../utils/editorSave'

interface EditorSaveRefs {
  editorRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>
  secondaryEditorRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>
  monacoRef: React.MutableRefObject<typeof import('monaco-editor') | null>
  mountedRef: React.MutableRefObject<boolean>
  modelCacheRef: React.MutableRefObject<Map<string, editor.ITextModel>>
  lspOpenFileRef: React.MutableRefObject<string | null>
  secondaryLspOpenFileRef: React.MutableRefObject<string | null>
  lspDebounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  secondaryLspDebounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  lspPendingChangesRef: React.MutableRefObject<any[]>
  secondaryLspPendingChangesRef: React.MutableRefObject<any[]>
  lspInitiatedEditRef: React.MutableRefObject<boolean>
  secondaryLspInitiatedEditRef: React.MutableRefObject<boolean>
  fetchGitStatusRef: React.MutableRefObject<() => Promise<void>>
}

interface UseEditorSaveHandlersOptions extends EditorSaveRefs {
  fileContents: Map<string, string>
  updateFileContent: (path: string, content: string) => void
  clearDirty: (path: string) => void
  setLoading: (loading: boolean) => void
}

export function useEditorSaveHandlers(options: UseEditorSaveHandlersOptions) {
  const {
    editorRef, secondaryEditorRef, monacoRef, mountedRef, modelCacheRef,
    lspOpenFileRef, secondaryLspOpenFileRef, lspDebounceRef, secondaryLspDebounceRef,
    lspPendingChangesRef, secondaryLspPendingChangesRef,
    lspInitiatedEditRef, secondaryLspInitiatedEditRef,
    fetchGitStatusRef, fileContents, updateFileContent, clearDirty, setLoading,
  } = options

  const handleSave = useCallback(async () => {
    const { activePaneId: paneId, splitDirection: split } = useSplitPaneStore.getState()
    const isSecondary = paneId === 'secondary' && split !== 'none'
    await handleSaveForEditor({
      editorInstance: isSecondary ? secondaryEditorRef.current : editorRef.current,
      lspOpenFileRef: isSecondary ? secondaryLspOpenFileRef : lspOpenFileRef,
      lspDebounceRef: isSecondary ? secondaryLspDebounceRef : lspDebounceRef,
      lspPendingChangesRef: isSecondary ? secondaryLspPendingChangesRef : lspPendingChangesRef,
      lspInitiatedEditRef: isSecondary ? secondaryLspInitiatedEditRef : lspInitiatedEditRef,
      monacoRef, mountedRef, modelCacheRef,
      updateFileContent, clearDirty, fetchGitStatusRef, setLoading,
      addToast: useAppStore.getState().addToast,
    })
  }, [editorRef, secondaryEditorRef, monacoRef, mountedRef, modelCacheRef,
    lspOpenFileRef, secondaryLspOpenFileRef, lspDebounceRef, secondaryLspDebounceRef,
    lspPendingChangesRef, secondaryLspPendingChangesRef,
    lspInitiatedEditRef, secondaryLspInitiatedEditRef,
    fetchGitStatusRef, updateFileContent, clearDirty, setLoading])

  const handleSaveFileByPath = useCallback(async (filePath: string) => {
    await saveFileByPath({
      filePath, modelCacheRef, fileContents, mountedRef,
      clearDirty, updateFileContent, lspOpenFileRef, secondaryLspOpenFileRef,
      fetchGitStatusRef, setLoading,
      addToast: useAppStore.getState().addToast,
    })
  }, [modelCacheRef, fileContents, mountedRef, clearDirty, updateFileContent,
    lspOpenFileRef, secondaryLspOpenFileRef, fetchGitStatusRef, setLoading])

  return { handleSave, handleSaveFileByPath }
}
