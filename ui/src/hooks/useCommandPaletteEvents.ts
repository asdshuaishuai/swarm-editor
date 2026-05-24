import { useRef } from 'react'
import { useWindowEvent } from './useWindowEvent'

interface UseCommandPaletteEventsOptions {
  currentFile: string | null
  showFileTree: boolean
  splitDirection: string
  editorRef: React.MutableRefObject<any>
  toggleSplit: () => void
  handleCloseSplit: () => void
  setShowFileTree: React.Dispatch<React.SetStateAction<boolean>>
  setActivityView: React.Dispatch<React.SetStateAction<string>>
  setActivePane: (pane: string) => void
  handleSave: () => void
  addToast: (type: 'info' | 'success' | 'error' | 'warning', title: string, message?: string, opts?: Record<string, unknown>) => void
}

/**
 * Listen for command palette and keyboard shortcut events that control
 * split panes, file operations, and editor navigation.
 */
export function useCommandPaletteEvents(options: UseCommandPaletteEventsOptions) {
  // Keep refs to avoid stale closures in the single useEffect approach
  const optsRef = useRef(options)
  optsRef.current = options

  useWindowEvent('toggle-split', () => {
    if (optsRef.current.currentFile) {
      optsRef.current.toggleSplit()
    }
  }, [])

  useWindowEvent('close-split', () => {
    optsRef.current.handleCloseSplit()
  }, [])

  useWindowEvent('toggle-source-control', () => {
    if (!optsRef.current.showFileTree) {
      optsRef.current.setShowFileTree(true)
    }
    optsRef.current.setActivityView(prev => prev === 'sourceControl' ? 'explorer' : 'sourceControl')
  }, [])

  useWindowEvent('save-file', () => {
    if (optsRef.current.currentFile) {
      optsRef.current.handleSave()
    }
  }, [])

  useWindowEvent('go-to-line', () => {
    if (optsRef.current.editorRef.current) {
      optsRef.current.editorRef.current.getAction('editor.action.gotoLine')?.run()
    }
  }, [])

  useWindowEvent('goto-line-direct', (e: Event) => {
    const line = (e as CustomEvent).detail?.line
    const { editorRef: er, currentFile: cf, addToast: at } = optsRef.current
    if (!line || !er.current) return
    if (!cf) { at('info', 'Go to Line', 'Open a file first'); return }
    er.current.revealLineInCenter(line)
    er.current.setPosition({ lineNumber: line, column: 1 })
    er.current.focus()
  }, [])

  useWindowEvent('open-file', () => {
    optsRef.current.addToast('info', 'Open File', 'Use the file explorer to open files')
  }, [])

  useWindowEvent('open-folder', () => {
    optsRef.current.addToast('info', 'Open Folder', 'Use File > Open Folder menu')
  }, [])

  useWindowEvent('go-to-file', () => {
    window.dispatchEvent(new CustomEvent('open-quick-open'))
  }, [])

  useWindowEvent('find-in-files', () => {
    window.dispatchEvent(new CustomEvent('open-search-panel'))
  }, [])

  useWindowEvent('replace-in-files', () => {
    window.dispatchEvent(new CustomEvent('open-search-panel', { detail: { replaceMode: true } }))
  }, [])

  useWindowEvent('git-checkout', () => {
    if (!optsRef.current.showFileTree) {
      optsRef.current.setShowFileTree(true)
    }
    optsRef.current.setActivityView('sourceControl')
  }, [])

  useWindowEvent('focus-editor-group', (e: Event) => {
    const group = (e as CustomEvent).detail?.group as number
    if (group === 1) {
      optsRef.current.setActivePane('main')
    } else if (group === 2 && optsRef.current.splitDirection !== 'none') {
      optsRef.current.setActivePane('secondary')
    }
  }, [])
}
