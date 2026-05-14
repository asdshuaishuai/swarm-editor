import { showCloseToast, autoSaveDirtyFiles } from './tabCloseActions'

interface TabCloseHandlerOptions {
  openFiles: string[]
  currentFile: string | null
  dirtyFiles: Set<string>
  pinnedFiles: Set<string>
  fileContents: Map<string, string>
  closeAllFiles: () => void
  closeOthers: (path: string) => void
  closeToLeft: (path: string) => void
  closeToRight: (path: string) => void
  closeSaved: () => void
  clearDirty: (path: string) => void
  fetchGitStatus: () => void
  addToast: (type: 'info' | 'error', title: string, message?: string, options?: any) => void
  setDirtyClosePath: (path: string | null) => void
}

export function createTabCloseHandlers(options: TabCloseHandlerOptions) {
  const {
    openFiles, currentFile, dirtyFiles, pinnedFiles, fileContents,
    closeAllFiles, closeOthers, closeToLeft, closeToRight, closeSaved,
    clearDirty, fetchGitStatus, addToast, setDirtyClosePath,
  } = options

  const closeAll = () => {
    const filesToClose = openFiles.filter(f => !pinnedFiles.has(f))
    if (filesToClose.some(f => dirtyFiles.has(f))) {
      setDirtyClosePath('__close_all__')
    } else {
      closeAllFiles()
      showCloseToast({ count: filesToClose.length, label: 'All tabs', addToast })
    }
  }

  const closeSavedTabs = () => {
    const count = openFiles.filter(f => dirtyFiles.has(f) || pinnedFiles.has(f)).length
    const savedCount = openFiles.length - count
    closeSaved()
    showCloseToast({ count: savedCount, label: 'Saved tabs', addToast })
  }

  const closeOtherTabs = () => {
    if (!currentFile) return
    const count = openFiles.filter(f => f !== currentFile && !pinnedFiles.has(f)).length
    closeOthers(currentFile)
    showCloseToast({ count, label: 'Other tabs', addToast })
  }

  const closeTabsToLeft = () => {
    if (!currentFile) return
    const keepIndex = openFiles.indexOf(currentFile)
    if (keepIndex === -1) return
    const dirtyToLeft = openFiles.slice(0, keepIndex).filter(f => dirtyFiles.has(f))
    autoSaveDirtyFiles({ paths: dirtyToLeft, fileContents, clearDirty, fetchGitStatus, addToast })
    closeToLeft(currentFile)
    showCloseToast({ count: keepIndex, label: 'Tabs to left', addToast })
  }

  const closeTabsToRight = () => {
    if (!currentFile) return
    const keepIndex = openFiles.indexOf(currentFile)
    if (keepIndex === -1) return
    const count = openFiles.length - keepIndex - 1
    const dirtyToRight = openFiles.slice(keepIndex + 1).filter(f => dirtyFiles.has(f))
    autoSaveDirtyFiles({ paths: dirtyToRight, fileContents, clearDirty, fetchGitStatus, addToast })
    closeToRight(currentFile)
    showCloseToast({ count, label: 'Tabs to right', addToast })
  }

  return { closeAll, closeSavedTabs, closeOtherTabs, closeTabsToLeft, closeTabsToRight }
}
