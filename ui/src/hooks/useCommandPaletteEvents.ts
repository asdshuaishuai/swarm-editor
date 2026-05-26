import { useRef } from 'react'
import { useWindowEvent } from './useWindowEvent'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { logger } from '../utils'

interface UseCommandPaletteEventsOptions {
  currentFile: string | null
  showFileTree: boolean
  splitDirection: string
  editorRef: React.MutableRefObject<{ getAction(id: string): { run(): void } | null; revealLineInCenter(line: number): void; setPosition(pos: { lineNumber: number; column: number }): void; focus(): void } | null>
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

  useWindowEvent('open-file', async () => {
    try {
      const selected = await openDialog({ multiple: false, directory: false, title: 'Open File' })
      if (typeof selected === 'string' && selected) {
        const { workspacePath, openFile } = useWorkspaceStore.getState()
        // Normalize path separators (Tauri returns native separators)
        const normalizedSelected = selected.replace(/\\/g, '/')
        const normalizedWorkspace = workspacePath ? workspacePath.replace(/\\/g, '/') : ''
        let path = normalizedSelected
        if (normalizedWorkspace && normalizedSelected.startsWith(normalizedWorkspace + '/')) {
          path = normalizedSelected.slice(normalizedWorkspace.length + 1)
        } else if (normalizedWorkspace && normalizedSelected !== normalizedWorkspace) {
          // File outside workspace — warn user and skip
          optsRef.current.addToast('warning', 'File outside workspace', 'Selected file is not within the current workspace')
          return
        }
        openFile(path)
      }
    } catch (err) {
      logger.debug('CommandPalette', 'File dialog cancelled or failed:', err)
    }
  }, [])

  useWindowEvent('open-folder', async () => {
    try {
      const selected = await openDialog({ directory: true, title: 'Open Folder' })
      if (typeof selected === 'string' && selected) {
        useWorkspaceStore.getState().setWorkspacePath(selected)
        optsRef.current.addToast('success', 'Workspace Opened', selected)
      }
    } catch (err) {
      logger.debug('CommandPalette', 'Folder dialog cancelled or failed:', err)
    }
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
