import type { editor } from 'monaco-editor'
import { api } from '../services'
import { lspApi } from '../services/lspApi'
import { hasLSPSupport } from './monaco'
import { logger } from './index'

interface SaveForEditorOptions {
  editorInstance: editor.IStandaloneCodeEditor | null
  lspOpenFileRef: React.MutableRefObject<string | null>
  lspDebounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  lspPendingChangesRef: React.MutableRefObject<any[]>
  lspInitiatedEditRef: React.MutableRefObject<boolean>
  monacoRef: React.MutableRefObject<typeof import('monaco-editor') | null>
  mountedRef: React.MutableRefObject<boolean>
  modelCacheRef: React.MutableRefObject<Map<string, editor.ITextModel>>
  updateFileContent: (path: string, value: string) => void
  clearDirty: (path: string) => void
  fetchGitStatusRef: React.MutableRefObject<() => Promise<void>>
  setLoading: (loading: boolean) => void
  addToast: (type: 'success' | 'error' | 'info' | 'warning', title: string, message?: string, opts?: any) => void
}

/**
 * Save the current file from a specific editor instance.
 * Handles format-on-save via LSP and dirty state clearing.
 */
export async function handleSaveForEditor(options: SaveForEditorOptions) {
  const {
    editorInstance,
    lspOpenFileRef,
    lspDebounceRef,
    lspPendingChangesRef,
    lspInitiatedEditRef,
    monacoRef,
    mountedRef,
    modelCacheRef,
    updateFileContent,
    clearDirty,
    fetchGitStatusRef,
    setLoading,
    addToast,
  } = options

  const model = editorInstance?.getModel()
  const filePath = model?.uri.path.replace(/^\//, '') || null
  if (!filePath || !model) return

  try {
    setLoading(true)

    const modelContent = model.getValue()
    let saveCode = modelContent

    // Format-on-save via LSP
    if (lspOpenFileRef.current && hasLSPSupport(lspOpenFileRef.current) && monacoRef.current) {
      if (lspDebounceRef.current) {
        clearTimeout(lspDebounceRef.current)
        lspDebounceRef.current = null
        lspPendingChangesRef.current = []
        lspApi.didChange(lspOpenFileRef.current, modelContent).catch(() => {})
      }
      try {
        const tabSize = model.getOptions()?.tabSize ?? 2
        const insertSpaces = model.getOptions()?.insertSpaces ?? true
        const result = await lspApi.formatting(lspOpenFileRef.current, undefined, tabSize, insertSpaces)
        const edit = result.edit
        if (edit && edit.changes && edit.changes.length > 0) {
          const allEdits: any[] = []
          for (const change of edit.changes) {
            for (const e of (change.edits || [])) {
              allEdits.push({
                range: new (monacoRef.current as any).Range(
                  e.range.start.line + 1, e.range.start.character + 1,
                  e.range.end.line + 1, e.range.end.character + 1,
                ),
                text: e.newText,
              })
            }
          }
          if (allEdits.length > 0) {
            lspInitiatedEditRef.current = true
            model.pushEditOperations([], allEdits, () => [])
            lspInitiatedEditRef.current = false
            saveCode = model.getValue()
          }
        }
      } catch {
        // Formatting failed — save unformatted
        // P1 fix: Reset flag on failure (was leaving it stuck true permanently)
        lspInitiatedEditRef.current = false
      }
    }

    await api.fs.writeFile(filePath, saveCode)
    if (!mountedRef.current) return

    if (saveCode !== modelContent) {
      updateFileContent(filePath, saveCode)
      const cachedModel = modelCacheRef.current.get(filePath)
      if (cachedModel) cachedModel.setValue(saveCode)
    }

    clearDirty(filePath)

    if (lspOpenFileRef.current) {
      lspApi.didSave(lspOpenFileRef.current, saveCode).catch(() => {})
    }
    fetchGitStatusRef.current() // Refresh git status after save
    addToast('success', 'File saved', filePath.split('/').pop())
  } catch (err) {
    logger.error('Editor', 'Failed to save file:', err)
    if (!mountedRef.current) return
    addToast('error', 'Save failed', err instanceof Error ? err.message : String(err))
  } finally {
    if (mountedRef.current) setLoading(false)
  }
}

interface SaveFileByPathOptions {
  filePath: string
  modelCacheRef: React.MutableRefObject<Map<string, editor.ITextModel>>
  fileContents: Map<string, string>
  mountedRef: React.MutableRefObject<boolean>
  clearDirty: (path: string) => void
  updateFileContent: (path: string, value: string) => void
  lspOpenFileRef: React.MutableRefObject<string | null>
  secondaryLspOpenFileRef: React.MutableRefObject<string | null>
  fetchGitStatusRef: React.MutableRefObject<() => Promise<void>>
  setLoading: (loading: boolean) => void
  addToast: (type: 'success' | 'error' | 'info' | 'warning', title: string, message?: string, opts?: any) => void
}

/**
 * Save a specific file by path using its cached Monaco model.
 * Used for auto-save when user may have switched tabs.
 */
export async function saveFileByPath(options: SaveFileByPathOptions) {
  const {
    filePath,
    modelCacheRef,
    fileContents,
    mountedRef,
    clearDirty,
    updateFileContent,
    lspOpenFileRef,
    secondaryLspOpenFileRef,
    fetchGitStatusRef,
    setLoading,
    addToast,
  } = options

  const model = modelCacheRef.current.get(filePath)
  if (!model) return

  const content = model.getValue()
  const oldContent = fileContents.get(filePath)

  if (content === oldContent) return // No changes

  setLoading(true)
  try {
    await api.fs.writeFile(filePath, content)
    clearDirty(filePath)
    updateFileContent(filePath, content)
    // P1 fix: Send LSP didSave if this file is currently LSP-tracked
    if (lspOpenFileRef.current === filePath || secondaryLspOpenFileRef.current === filePath) {
      lspApi.didSave(filePath, content).catch(() => {})
    }
    fetchGitStatusRef.current() // Refresh git status after save
    addToast('success', 'Auto-saved', filePath.split('/').pop())
  } catch (err) {
    logger.error('Editor', 'Failed to auto-save file:', err)
    addToast('error', 'Auto-save failed', err instanceof Error ? err.message : String(err))
  } finally {
    if (mountedRef.current) setLoading(false)
  }
}
