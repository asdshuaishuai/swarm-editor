import { useEffect } from 'react'
import type { editor } from 'monaco-editor'
import { lspApi } from '../services/lspApi'
import { getLSPLanguageId, LSP_LANG_MAP } from '../utils/monaco'
import { fetchDocumentSymbols as fetchDocumentSymbolsUtil } from '../utils/fetchDocumentSymbols'

interface PaneModelSyncOptions {
  filePath: string | null
  fileContents: Map<string, string>
  language: string | null // null = derive from file extension
  editorRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>
  monacoRef: React.MutableRefObject<typeof import('monaco-editor') | null>
  modelCacheRef: React.MutableRefObject<Map<string, editor.ITextModel>>
  viewStateMapRef: React.MutableRefObject<Map<string, editor.ICodeEditorViewState>>
  lspOpenFileRef: React.MutableRefObject<string | null>
  lspIncrementalRef: React.MutableRefObject<boolean>
  fetchDiagnostics: () => void
  setSymbols: (symbols: any[]) => void
}

export function usePaneModelSync(options: PaneModelSyncOptions) {
  const {
    filePath, fileContents, language,
    editorRef, monacoRef, modelCacheRef, viewStateMapRef,
    lspOpenFileRef, lspIncrementalRef,
    fetchDiagnostics, setSymbols,
  } = options

  // Close LSP file when filePath becomes null
  useEffect(() => {
    if (!filePath && lspOpenFileRef.current) {
      lspApi.didClose(lspOpenFileRef.current).catch(() => {})
      lspOpenFileRef.current = null
    }
  }, [filePath])

  // Switch editor model when filePath changes (includes LSP sync)
  useEffect(() => {
    if (!filePath || !editorRef.current || !monacoRef.current) return
    const content = fileContents.get(filePath)
    if (content === undefined) return
    const lang = language ?? (LSP_LANG_MAP[filePath.split('.').pop()?.toLowerCase() || ''] || 'plaintext')
    const uri = monacoRef.current.Uri.file(filePath)
    const cachedModel = modelCacheRef.current.get(filePath)
    const existingModel = cachedModel ?? monacoRef.current.editor.getModel(uri)
    const model = existingModel ?? monacoRef.current.editor.createModel(content, lang, uri)
    if (!cachedModel) modelCacheRef.current.set(filePath, model)

    if (model && editorRef.current.getModel() !== model) {
      const oldModel = editorRef.current.getModel()
      if (oldModel) {
        const vs = editorRef.current.saveViewState()
        if (vs) viewStateMapRef.current.set(oldModel.uri.toString(), vs)
      }
      editorRef.current.setModel(model)
      const saved = viewStateMapRef.current.get(model.uri.toString())
      if (saved) {
        editorRef.current.restoreViewState(saved)
      }
    }

    // LSP document sync
    const lspLang = getLSPLanguageId(filePath)
    if (lspLang && model) {
      if (lspOpenFileRef.current && lspOpenFileRef.current !== filePath) {
        lspApi.didClose(lspOpenFileRef.current).catch(() => {})
        monacoRef.current.editor.setModelMarkers(model, 'lsp', [])
      }
      lspOpenFileRef.current = filePath
      lspIncrementalRef.current = false
      lspApi.didOpen(`file://${filePath}`, filePath, lspLang, content).catch(() => {})
      lspApi.supportsIncrementalSync(filePath).then((r: any) => {
        lspIncrementalRef.current = !!r?.supported
      }).catch(() => { lspIncrementalRef.current = false })
      setTimeout(() => fetchDiagnostics(), 500)
      fetchDocumentSymbolsUtil({ filePath, setSymbols })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, fileContents, language])
}
