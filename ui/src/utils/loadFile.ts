import { logger } from '.'
import { useSplitPaneStore } from '../stores/splitPaneStore'

interface LoadFileOptions {
  path: string
  splitDirection: string
  mountedRef: React.MutableRefObject<boolean>
  setLoading: (loading: boolean) => void
  openFile: (path: string, options?: { preview?: boolean }) => Promise<void>
  setPaneFile: (paneId: string, path: string) => void
  setRecentFiles: React.Dispatch<React.SetStateAction<string[]>>
  addToast: (type: 'error', title: string, message?: string) => void
}

export async function loadFile(options: LoadFileOptions) {
  const { path, splitDirection, mountedRef, setLoading, openFile, setPaneFile, setRecentFiles, addToast } = options

  try {
    setLoading(true)

    await openFile(path, { preview: true })

    if (splitDirection !== 'none') {
      const paneId = useSplitPaneStore.getState().activePaneId
      setPaneFile(paneId, path)
    }

    setRecentFiles(prev => {
      const filtered = prev.filter(f => f !== path)
      const updated = [path, ...filtered].slice(0, 10)
      try {
        localStorage.setItem('swarm-editor-recent-files', JSON.stringify(updated))
      } catch { /* storage quota — non-critical */ }
      return updated
    })
  } catch (err) {
    logger.error('Editor', 'Failed to load file:', err)
    if (!mountedRef.current) return
    addToast('error', 'Failed to load file', err instanceof Error ? err.message : String(err))
  } finally {
    if (mountedRef.current) {
      setLoading(false)
    }
  }
}
