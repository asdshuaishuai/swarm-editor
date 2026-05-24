import { api } from '../services'
import { useWorkspaceStore } from '../stores/workspaceStore'
import type { Toast } from '../components/Toast'

interface CloseToastOptions {
  count: number
  label: string
  addToast: (type: 'info' | 'error', title: string, message?: string, options?: Partial<Toast>) => void
}

export function showCloseToast(options: CloseToastOptions) {
  const { count, label, addToast } = options
  if (count > 0) {
    addToast('info', `${label} closed`, `${count} tab${count > 1 ? 's' : ''} closed`, {
      actions: [{ label: 'Undo', onClick: () => { useWorkspaceStore.getState().undoCloseFiles() } }],
    })
  }
}

interface AutoSaveDirtyOptions {
  paths: string[]
  fileContents: Map<string, string>
  clearDirty: (path: string) => void
  fetchGitStatus: () => void
  addToast: (type: 'error', title: string, message?: string) => void
}

export function autoSaveDirtyFiles(options: AutoSaveDirtyOptions) {
  const { paths, fileContents, clearDirty, fetchGitStatus, addToast } = options
  if (paths.length === 0) return

  for (const path of paths) {
    saveSingleFile({ path, fileContents, clearDirty, addToast })
  }
  fetchGitStatus()
}

interface SaveSingleFileOptions {
  path: string
  fileContents: Map<string, string>
  clearDirty: (path: string) => void
  addToast: (type: 'error', title: string, message?: string) => void
}

export function saveSingleFile(options: SaveSingleFileOptions) {
  const { path, fileContents, clearDirty, addToast } = options
  const content = fileContents.get(path)
  if (content !== undefined) {
    api.fs.writeFile(path, content).catch((err) => {
      addToast('error', 'Auto-save failed', `Failed to save ${path.split('/').pop()}: ${err instanceof Error ? err.message : String(err)}`)
    })
    clearDirty(path)
  }
}
