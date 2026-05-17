import { useCallback } from 'react'
import type { editor } from 'monaco-editor'
import { lspApi } from '../services/lspApi'
import { getWebSocketClient } from '../services/websocket'
import { logger } from '../utils'

export function useDiagnostics(
  monacoRef: React.MutableRefObject<any>,
  editorRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>,
  secondaryEditorRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>,
  lspOpenFileRef: React.MutableRefObject<string | null>,
  secondaryLspOpenFileRef: React.MutableRefObject<string | null>,
  updateFileProblems: (filePath: string, problems: any[]) => void,
) {
  // Apply diagnostics markers to a specific editor instance
  const applyMarkersToEditor = useCallback((ed: editor.IStandaloneCodeEditor | null, monaco: any, diags: any[]) => {
    if (!ed || !monaco) return
    const model = ed.getModel()
    if (!model) return

    const severityMap: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 4 }
    const markers: editor.IMarkerData[] = diags.map((d: any) => ({
      severity: severityMap[d.severity] ?? 1,
      message: d.message,
      startLineNumber: d.range.start.line + 1,
      startColumn: d.range.start.character + 1,
      endLineNumber: d.range.end.line + 1,
      endColumn: d.range.end.character + 1,
      source: d.source,
    }))
    monaco.editor.setModelMarkers(model, 'lsp', markers)
  }, [])

  const applyDiagnosticsMarkers = useCallback((diags: any[], fileUri?: string) => {
    if (!monacoRef.current) return

    const severityNameMap: Record<number, 'error' | 'warning' | 'info' | 'hint'> = {
      1: 'error', 2: 'warning', 3: 'info', 4: 'hint'
    }

    const filePath = fileUri?.replace(/^file:\/\//, '') || lspOpenFileRef.current

    // P1 fix: Only apply diagnostics to editor if it's showing the file the diagnostics are for
    const mainModel = editorRef.current?.getModel()
    const mainModelPath = mainModel?.uri.path.replace(/^\//, '')
    if (mainModelPath === filePath) {
      applyMarkersToEditor(editorRef.current, monacoRef.current, diags)
    }

    const secondaryModel = secondaryEditorRef.current?.getModel()
    const secondaryModelPath = secondaryModel?.uri.path.replace(/^\//, '')
    if (secondaryModelPath === filePath) {
      applyMarkersToEditor(secondaryEditorRef.current, monacoRef.current, diags)
    }

    if (filePath) {
      const problems = diags.map((d: any, i: number) => ({
        id: `${filePath}-${i}`,
        file: filePath,
        line: d.range.start.line,
        column: d.range.start.character,
        message: d.message,
        severity: severityNameMap[d.severity] ?? 'info',
        source: d.source,
      }))
      updateFileProblems(filePath, problems)
    }
  }, [updateFileProblems, applyMarkersToEditor, monacoRef, editorRef, secondaryEditorRef, lspOpenFileRef])

  const fetchDiagnostics = useCallback(async () => {
    if (!lspOpenFileRef.current) return
    try {
      const uri = `file://${lspOpenFileRef.current}`
      const result = await lspApi.diagnostics(uri)
      applyDiagnosticsMarkers(result.diagnostics?.[uri] || [], uri)
    } catch (e) {
      logger.debug('Diagnostics', 'Failed to fetch diagnostics', e)
    }
  }, [applyDiagnosticsMarkers, lspOpenFileRef])

  const fetchSecondaryDiagnostics = useCallback(async () => {
    if (!secondaryLspOpenFileRef.current) return
    try {
      const uri = `file://${secondaryLspOpenFileRef.current}`
      const result = await lspApi.diagnostics(uri)
      applyDiagnosticsMarkers(result.diagnostics?.[uri] || [], uri)
    } catch (e) {
      logger.debug('Diagnostics', 'Failed to fetch diagnostics', e)
    }
  }, [applyDiagnosticsMarkers, secondaryLspOpenFileRef])

  // Subscribe to push-based diagnostics from WebSocket
  const subscribeToDiagnostics = useCallback(() => {
    const ws = getWebSocketClient()
    const unsubscribe = ws.subscribe('lsp_diagnostics_update', (data: any) => {
      if (!data?.uri) return
      const mainPath = lspOpenFileRef.current ? `file://${lspOpenFileRef.current}` : ''
      const secondaryPath = secondaryLspOpenFileRef.current ? `file://${secondaryLspOpenFileRef.current}` : ''
      if (data.uri === mainPath || data.uri === secondaryPath) {
        applyDiagnosticsMarkers(data.diagnostics || [], data.uri)
      }
    })
    return unsubscribe
  }, [applyDiagnosticsMarkers, lspOpenFileRef, secondaryLspOpenFileRef])

  return {
    applyMarkersToEditor,
    applyDiagnosticsMarkers,
    fetchDiagnostics,
    fetchSecondaryDiagnostics,
    subscribeToDiagnostics,
  }
}
