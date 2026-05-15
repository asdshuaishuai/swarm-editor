import { useRef, useEffect } from 'react'
import type { editor } from 'monaco-editor'
import { useWindowEvent } from './useWindowEvent'
import { api } from '../services'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { LSP_LANG_MAP } from '../utils/monaco'
import { lspApi } from '../services/lspApi'
import { executeEditorAction } from '../utils/monacoEditorActions'

interface UseEditorWindowEventsOptions {
  // Tab management
  currentFile: string | null
  dirtyFiles: Set<string>
  openFiles: string[]
  closeFile: (path: string) => void
  togglePin: (path: string) => void
  setDirtyClosePath: (path: string | null) => void
  handleCloseAllTabs: () => void
  handleCloseSavedTabs: () => void
  handleCloseOtherTabs: () => void
  handleCloseToRight: () => void

  // UI state
  showFileTree: boolean
  setShowFileTree: (v: boolean | ((prev: boolean) => boolean)) => void
  setShowAccessibilityHelp: (v: boolean) => void
  setExpandedDirs: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void

  // Git
  gitStatusMap: Record<string, any>
  handleOpenDiff: (path: string) => void

  // Editor refs
  editorRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>
  modelCacheRef: React.MutableRefObject<Map<string, editor.ITextModel>>
  navigateProblemRef: React.MutableRefObject<(editor: editor.IStandaloneCodeEditor, curFile: string | null, direction?: 1 | -1) => void>

  // LSP refs
  lspOpenFileRef: React.MutableRefObject<string | null>
  secondaryLspOpenFileRef: React.MutableRefObject<string | null>
  lspIncrementalRef: React.MutableRefObject<boolean>
  secondaryLspIncrementalRef: React.MutableRefObject<boolean>
  fetchDiagnostics: () => void
  fetchSecondaryDiagnostics: () => void

  // Store
  fileContents: Map<string, string>
  addToast: (type: 'info' | 'success' | 'error', title: string, message?: string, options?: any) => string
}

export function useEditorWindowEvents(options: UseEditorWindowEventsOptions) {
  const {
    currentFile, dirtyFiles, openFiles, closeFile, togglePin, setDirtyClosePath,
    handleCloseAllTabs, handleCloseSavedTabs, handleCloseOtherTabs, handleCloseToRight,
    showFileTree, setShowFileTree, setShowAccessibilityHelp, setExpandedDirs,
    gitStatusMap, handleOpenDiff,
    editorRef, modelCacheRef, navigateProblemRef,
    lspOpenFileRef, secondaryLspOpenFileRef,
    lspIncrementalRef, secondaryLspIncrementalRef,
    fetchDiagnostics, fetchSecondaryDiagnostics,
    fileContents, addToast,
  } = options

  // Keep a ref to latest fileContents to avoid re-registering ws-reconnect on every keystroke
  const fileContentsRef = useRef(fileContents)
  useEffect(() => { fileContentsRef.current = fileContents }, [fileContents])

  useWindowEvent('close-all-tabs', handleCloseAllTabs, [handleCloseAllTabs])
  useWindowEvent('toggle-sidebar', () => { setShowFileTree(prev => !prev) }, [])
  useWindowEvent('close-current-tab', () => {
    if (currentFile) {
      if (dirtyFiles.has(currentFile)) {
        setDirtyClosePath(currentFile)
      } else {
        closeFile(currentFile)
      }
    }
  }, [currentFile, dirtyFiles, closeFile])
  useWindowEvent('pin-current-tab', () => { if (currentFile) togglePin(currentFile) }, [currentFile, togglePin])
  useWindowEvent('close-saved-tabs', handleCloseSavedTabs, [handleCloseSavedTabs])
  useWindowEvent('close-other-tabs', handleCloseOtherTabs, [handleCloseOtherTabs])
  useWindowEvent('close-to-right', handleCloseToRight, [handleCloseToRight])

  // P1 fix: Re-send LSP didOpen after WebSocket reconnect
  useWindowEvent('ws-reconnect', () => {
    lspIncrementalRef.current = false
    secondaryLspIncrementalRef.current = false
    const files = fileContentsRef.current
    if (lspOpenFileRef.current && files.has(lspOpenFileRef.current)) {
      const ext = lspOpenFileRef.current.split('.').pop()?.toLowerCase() || ''
      const lang = LSP_LANG_MAP[ext] || 'plaintext'
      lspApi.didOpen(`file://${lspOpenFileRef.current}`, lspOpenFileRef.current, lang, files.get(lspOpenFileRef.current) || '').catch(() => {})
    }
    if (secondaryLspOpenFileRef.current && files.has(secondaryLspOpenFileRef.current)) {
      const ext = secondaryLspOpenFileRef.current.split('.').pop()?.toLowerCase() || ''
      const lang = LSP_LANG_MAP[ext] || 'plaintext'
      lspApi.didOpen(`file://${secondaryLspOpenFileRef.current}`, secondaryLspOpenFileRef.current, lang, files.get(secondaryLspOpenFileRef.current) || '').catch(() => {})
    }
    setTimeout(() => fetchDiagnostics(), 500)
    setTimeout(() => fetchSecondaryDiagnostics(), 500)
  }, [])

  // Warn before closing browser tab with unsaved changes
  useWindowEvent('beforeunload', (e: BeforeUnloadEvent) => {
    if (dirtyFiles.size > 0) {
      e.preventDefault()
      e.returnValue = ''
    }
  }, [dirtyFiles])

  // Save All shortcut (Ctrl+K S)
  useWindowEvent('save-all', async () => {
    const { dirtyFiles: currentDirty, fileContents: currentContents } = useWorkspaceStore.getState()
    const dirtyPaths = Array.from(currentDirty)
    for (const path of dirtyPaths) {
      const model = modelCacheRef.current.get(path)
      const content = model ? model.getValue() : currentContents.get(path)
      if (content !== undefined) {
        try {
          await api.fs.writeFile(path, content)
          useWorkspaceStore.setState(state => {
            const newDirty = new Set(state.dirtyFiles)
            newDirty.delete(path)
            return { dirtyFiles: newDirty }
          })
        } catch {
          // Silently ignore save errors
        }
      }
    }
  }, [])

  // Format Document command
  useWindowEvent('format-document', () => {
    if (editorRef.current) {
      const action = editorRef.current.getAction('editor.action.formatDocument')
      if (action) action.run()
    }
  }, [openFiles])

  // Fold/Unfold All commands
  useWindowEvent('fold-all', () => {
    if (editorRef.current) {
      const action = editorRef.current.getAction('editor.foldAll')
      if (action) action.run()
    }
  }, [openFiles])
  useWindowEvent('unfold-all', () => {
    if (editorRef.current) {
      const action = editorRef.current.getAction('editor.unfoldAll')
      if (action) action.run()
    }
  }, [openFiles])

  // Revert File (discard unsaved changes)
  useWindowEvent('revert-file', async () => {
    if (!currentFile) return
    try {
      const originalContent = await api.fs.readFile(currentFile)
      if (originalContent === undefined) return
      if (editorRef.current) {
        editorRef.current.setValue(originalContent)
        useWorkspaceStore.getState().clearDirty(currentFile)
        addToast('success', 'File reverted', 'Changes discarded')
      }
    } catch (err) {
      addToast('error', 'Failed to revert', err instanceof Error ? err.message : 'Unknown error')
    }
  }, [currentFile, addToast])

  // Focus file tree shortcut (Ctrl+Shift+E)
  useWindowEvent('focus-file-tree', () => {
    if (!showFileTree) setShowFileTree(true)
    const firstEntry = document.querySelector('[data-active-file="true"]') as HTMLElement
      || document.querySelector('.file-tree-entry') as HTMLElement
    firstEntry?.focus()
  }, [showFileTree, setShowFileTree])
  useWindowEvent('open-accessibility-help', () => setShowAccessibilityHelp(true), [])
  useWindowEvent('open-diff', (e: Event) => {
    const detailPath = (e as CustomEvent).detail?.path
    const targetPath = detailPath || currentFile
    if (targetPath && gitStatusMap[targetPath]) {
      handleOpenDiff(targetPath)
    }
  }, [currentFile, gitStatusMap, handleOpenDiff])
  useWindowEvent('select-all', () => {
    if (editorRef.current) {
      const action = editorRef.current.getAction('editor.action.selectAll')
      if (action) action.run()
    }
  }, [])
  useWindowEvent('editor-action', (e: Event) => {
    const actionId = (e as CustomEvent).detail?.actionId
    if (!actionId || !editorRef.current) return
    executeEditorAction(editorRef.current, actionId)
  }, [])

  // Navigate problems from Command Palette
  useWindowEvent('navigate-next-problem', () => {
    if (editorRef.current) navigateProblemRef.current(editorRef.current, currentFile)
  }, [currentFile])
  useWindowEvent('navigate-previous-problem', () => {
    if (editorRef.current) navigateProblemRef.current(editorRef.current, currentFile, -1)
  }, [currentFile])

  // Reveal active file in file tree
  useWindowEvent('reveal-active-file', () => {
    if (!currentFile || !showFileTree) {
      setShowFileTree(true)
    }
    const parts = currentFile?.split('/') || []
    const parentPaths: string[] = []
    for (let i = 1; i < parts.length; i++) {
      parentPaths.push(parts.slice(0, i).join('/'))
    }
    setExpandedDirs(prev => {
      const next = new Set(prev)
      for (const p of parentPaths) {
        next.add(p)
      }
      return next
    })
    requestAnimationFrame(() => {
      const activeBtn = document.querySelector('[data-active-file="true"]') as HTMLElement
      activeBtn?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      activeBtn?.focus()
    })
  }, [currentFile, showFileTree, setShowFileTree])
}
