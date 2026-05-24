import { create } from 'zustand'
import { fsApi, events } from '../services/api'
import { logger } from '../utils'
import { useSplitPaneStore } from './splitPaneStore'

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
}

export interface WorkspaceStore {
  // Workspace
  workspacePath: string
  setWorkspacePath: (path: string) => void
  loadWorkspace: () => Promise<void>

  // File tree
  fileTree: FileEntry[]
  expandedDirs: Set<string>
  toggleDir: (path: string) => void
  refreshFileTree: () => Promise<void>

  // Editor
  currentFile: string | null
  fileContents: Map<string, string>
  openFiles: string[]
  dirtyFiles: Set<string>
  pinnedFiles: Set<string>
  previewTab: string | null // VS Code: single-click opens as preview, double-click pins
  recentlyClosedFiles: Array<{ path: string; content: string; wasDirty: boolean }>
  mruOrder: string[] // Most Recently Used order for Ctrl+Tab (VS Code pattern)
  openFile: (path: string, options?: { preview?: boolean }) => Promise<void>
  closeFile: (path: string) => void
  renameFileInStore: (oldPath: string, newPath: string) => void
  closeAllFiles: () => void
  closeOthers: (keepPath: string) => void
  closeToLeft: (keepPath: string) => void
  closeToRight: (keepPath: string) => void
  closeSaved: () => void
  undoCloseFile: () => Promise<void>
  undoCloseFiles: () => Promise<void>
  reorderFiles: (fromIndex: number, toIndex: number) => void
  updateFileContent: (path: string, content: string) => void
  clearDirty: (path: string) => void
  togglePin: (path: string) => void
  isPinned: (path: string) => boolean

  // External file changes
  externalModifications: Set<string>
  clearExternalModification: (path: string) => void
  subscribeToFileChanges: () => () => void

  // UI state
  language: string
  setLanguage: (lang: string) => void
  loading: boolean
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspacePath: '',
  fileTree: [],
  expandedDirs: new Set<string>(),
  currentFile: null,
  fileContents: new Map<string, string>(),
  openFiles: [],
  dirtyFiles: new Set<string>(),
  pinnedFiles: new Set<string>(),
  previewTab: null,
  recentlyClosedFiles: [],
  mruOrder: [],
  language: 'typescript',
  loading: false,
  externalModifications: new Set<string>(),

  setWorkspacePath: (path) => {
    set({ workspacePath: path })
    fsApi.setWorkspace(path).catch((err) => {
      logger.debug('Workspace', 'Failed to sync workspace to backend:', err)
    })
  },

  loadWorkspace: async () => {
    try {
      const ws = await fsApi.getWorkspace()
      set({ workspacePath: ws })
      await get().refreshFileTree()
    } catch (err) {
      logger.error('Workspace', 'Failed to load workspace:', err)
    }
  },

  refreshFileTree: async () => {
    const { workspacePath } = get()
    if (!workspacePath) return

    set({ loading: true })
    try {
      const entries = await fsApi.listDir(workspacePath)
      set({ fileTree: entries })
    } catch (err) {
      logger.error('Workspace', 'Failed to refresh file tree:', err)
    } finally {
      set({ loading: false })
    }
  },

  toggleDir: (path) => {
    const expanded = new Set(get().expandedDirs)
    if (expanded.has(path)) {
      expanded.delete(path)
    } else {
      expanded.add(path)
    }
    set({ expandedDirs: expanded })
  },

  openFile: async (path, options?: { preview?: boolean }) => {
    const { openFiles, mruOrder } = get()
    const isPreview = options?.preview !== false // Default to preview mode

    // Update MRU: move path to end (most recently used) — but NOT for preview tabs
    const newMru = mruOrder.filter(p => p !== path)
    if (!isPreview) {
      newMru.push(path)
    }

    // Already open — just switch to it and pin it (preview → permanent)
    if (openFiles.includes(path)) {
      const currentPreviewTab = get().previewTab
      set({
        currentFile: path,
        mruOrder: mruOrder.filter(p => p !== path).concat([path]), // Always add to MRU when switching to existing tab
        previewTab: isPreview ? path : (currentPreviewTab === path ? null : currentPreviewTab),
      })
      return
    }

    set({ loading: true })
    try {
      const content = await fsApi.readFile(path)
      // Re-read state after await to avoid stale snapshot race
      const freshState = get()
      const newContents = new Map(freshState.fileContents)

      // VS Code: close previous preview tab before adding new one
      let newOpenFiles = [...freshState.openFiles]
      if (freshState.previewTab && freshState.previewTab !== path && !freshState.pinnedFiles.has(freshState.previewTab)) {
        newOpenFiles = newOpenFiles.filter(f => f !== freshState.previewTab)
        newContents.delete(freshState.previewTab)
      }

      newContents.set(path, content)
      newOpenFiles.push(path)
      set({
        currentFile: path,
        fileContents: newContents,
        openFiles: newOpenFiles,
        mruOrder: newMru,
        previewTab: isPreview ? path : null,
      })

      // Infer language from extension
      const ext = path.split('.').pop()?.toLowerCase() || ''
      const langMap: Record<string, string> = {
        ts: 'typescript', tsx: 'typescript',
        js: 'javascript', jsx: 'javascript',
        go: 'go', rs: 'rust', py: 'python',
        java: 'java', c: 'c', cpp: 'cpp',
        cs: 'csharp', json: 'json', md: 'markdown',
      }
      if (langMap[ext]) {
        set({ language: langMap[ext] })
      }
    } catch (err) {
      logger.error('Workspace', 'Failed to open file:', err)
    } finally {
      set({ loading: false })
    }
  },

  closeFile: (path) => {
    const { openFiles, currentFile, dirtyFiles, fileContents, recentlyClosedFiles, pinnedFiles, mruOrder, previewTab } = get()

    // Store for undo (keep content and dirty state)
    const content = fileContents.get(path) || ''
    const wasDirty = dirtyFiles.has(path)
    const newRecentlyClosed = [
      { path, content, wasDirty },
      ...recentlyClosedFiles.slice(0, 19), // Keep last 20 closed files
    ]

    const newOpenFiles = openFiles.filter((f) => f !== path)
    const newContents = new Map(fileContents)
    newContents.delete(path)
    const newDirty = new Set(dirtyFiles)
    newDirty.delete(path)
    // Clean up pinned state when file is closed
    const newPinned = new Set(pinnedFiles)
    newPinned.delete(path)
    // VS Code behavior: focus right neighbor, or left if closing rightmost
    let newCurrentFile = currentFile
    if (currentFile === path) {
      const closedIndex = openFiles.indexOf(path)
      if (newOpenFiles.length > 0) {
        // If there's a tab at the same index (right neighbor), focus it
        // Otherwise focus the previous tab (which is now at closedIndex - 1, or last if closing rightmost)
        newCurrentFile = newOpenFiles[closedIndex] ?? newOpenFiles[newOpenFiles.length - 1]
      } else {
        newCurrentFile = null
      }
    }
    set({
      openFiles: newOpenFiles,
      fileContents: newContents,
      currentFile: newCurrentFile,
      dirtyFiles: newDirty,
      recentlyClosedFiles: newRecentlyClosed,
      pinnedFiles: newPinned,
      mruOrder: mruOrder.filter(p => p !== path),
      previewTab: previewTab === path ? null : previewTab,
    })
    // P1 fix: Clear secondary pane if it was showing the closed file
    const { paneFiles } = useSplitPaneStore.getState()
    if (paneFiles.secondary === path) {
      useSplitPaneStore.getState().setPaneFile('secondary', null)
    }
  },

  renameFileInStore: (oldPath, newPath) => {
    const { openFiles, fileContents, currentFile, dirtyFiles, pinnedFiles, recentlyClosedFiles, mruOrder } = get()

    // Update openFiles array
    const newOpenFiles = openFiles.map(f => f === oldPath ? newPath : f)

    // Move content to new path
    const newContents = new Map(fileContents)
    const content = newContents.get(oldPath)
    if (content !== undefined) {
      newContents.delete(oldPath)
      newContents.set(newPath, content)
    }

    // Move dirty state
    const newDirty = new Set(dirtyFiles)
    if (newDirty.has(oldPath)) {
      newDirty.delete(oldPath)
      newDirty.add(newPath)
    }

    // Move pinned state
    const newPinned = new Set(pinnedFiles)
    if (newPinned.has(oldPath)) {
      newPinned.delete(oldPath)
      newPinned.add(newPath)
    }

    // P2 fix: Update recentlyClosedFiles paths
    const newRecentlyClosed = recentlyClosedFiles.map(entry =>
      entry.path === oldPath ? { ...entry, path: newPath } : entry
    )

    set({
      openFiles: newOpenFiles,
      fileContents: newContents,
      currentFile: currentFile === oldPath ? newPath : currentFile,
      dirtyFiles: newDirty,
      pinnedFiles: newPinned,
      recentlyClosedFiles: newRecentlyClosed,
      mruOrder: mruOrder.map(p => p === oldPath ? newPath : p),
    })

    // P1 fix: Update secondary pane if showing the renamed file
    const { paneFiles } = useSplitPaneStore.getState()
    if (paneFiles.secondary === oldPath) {
      useSplitPaneStore.getState().setPaneFile('secondary', newPath)
    }
  },

  closeAllFiles: () => {
    const { openFiles, fileContents, dirtyFiles, recentlyClosedFiles, pinnedFiles, mruOrder } = get()

    // VS Code behavior: pinned files are NOT closed by Close All
    const toClose = openFiles.filter(f => !pinnedFiles.has(f))

    // Store closed files for potential undo
    const closedFiles = toClose.map(path => ({
      path,
      content: fileContents.get(path) || '',
      wasDirty: dirtyFiles.has(path),
    }))

    const newContents = new Map<string, string>()
    const newDirty = new Set<string>()
    for (const f of pinnedFiles) {
      if (openFiles.includes(f)) {
        const c = fileContents.get(f)
        if (c !== undefined) newContents.set(f, c)
        if (dirtyFiles.has(f)) newDirty.add(f)
      }
    }

    set({
      openFiles: [...pinnedFiles].filter(f => openFiles.includes(f)),
      fileContents: newContents,
      currentFile: pinnedFiles.size > 0 ? [...pinnedFiles][0] : null,
      dirtyFiles: newDirty,
      recentlyClosedFiles: [...closedFiles, ...recentlyClosedFiles].slice(0, 20),
      mruOrder: mruOrder.filter(p => pinnedFiles.has(p)),
    })

    // P1 fix: Clear secondary pane if its file was closed
    const { paneFiles } = useSplitPaneStore.getState()
    if (paneFiles.secondary && toClose.includes(paneFiles.secondary)) {
      useSplitPaneStore.getState().setPaneFile('secondary', null)
    }
  },

  closeOthers: (keepPath: string) => {
    const { openFiles, fileContents, dirtyFiles, currentFile, recentlyClosedFiles, pinnedFiles, mruOrder } = get()
    // VS Code behavior: pinned files are NOT closed by Close Others
    // VS Code behavior: dirty files are NOT closed by Close Others (preserved)
    // VS Code behavior: all kept editors are auto-pinned
    const toClose = openFiles.filter(f => f !== keepPath && !pinnedFiles.has(f) && !dirtyFiles.has(f))
    const newPinned = new Set([...pinnedFiles, keepPath]) // Auto-pin kept editor
    const newOpenFiles = openFiles.filter(f => f === keepPath || pinnedFiles.has(f) || dirtyFiles.has(f))
    const newContents = new Map<string, string>()
    const newDirty = new Set<string>()
    for (const f of newOpenFiles) {
      const c = fileContents.get(f)
      if (c !== undefined) newContents.set(f, c)
      if (dirtyFiles.has(f)) newDirty.add(f)
    }

    const closedFiles = toClose.map(path => ({
      path,
      content: fileContents.get(path) || '',
      wasDirty: dirtyFiles.has(path),
    }))

    set({
      openFiles: newOpenFiles,
      fileContents: newContents,
      currentFile: currentFile && newOpenFiles.includes(currentFile) ? currentFile : keepPath,
      dirtyFiles: newDirty,
      recentlyClosedFiles: [...closedFiles, ...recentlyClosedFiles].slice(0, 20),
      pinnedFiles: newPinned,
      mruOrder: mruOrder.filter(p => newOpenFiles.includes(p)),
    })

    // P1 fix: Clear secondary pane if its file was closed
    const paneState = useSplitPaneStore.getState()
    if (paneState.paneFiles.secondary && toClose.includes(paneState.paneFiles.secondary)) {
      useSplitPaneStore.getState().setPaneFile('secondary', null)
    }
  },

  closeToLeft: (keepPath: string) => {
    const { openFiles, fileContents, dirtyFiles, currentFile, recentlyClosedFiles, pinnedFiles, mruOrder } = get()
    const keepIndex = openFiles.indexOf(keepPath)
    if (keepIndex <= 0 || !keepPath) return
    // VS Code behavior: pinned files are NOT closed by Close to Left
    // VS Code behavior: active editor is auto-pinned
    const toClose = openFiles.slice(0, keepIndex).filter(f => !pinnedFiles.has(f) && !dirtyFiles.has(f))
    const newPinned = new Set([...pinnedFiles, keepPath]) // Auto-pin active editor
    const newOpenFiles = [...openFiles.slice(0, keepIndex).filter(f => pinnedFiles.has(f) || dirtyFiles.has(f)), ...openFiles.slice(keepIndex)]
    const newContents = new Map<string, string>()
    const newDirty = new Set<string>()
    for (const f of newOpenFiles) {
      const c = fileContents.get(f)
      if (c !== undefined) newContents.set(f, c)
      if (dirtyFiles.has(f)) newDirty.add(f)
    }

    const closedFiles = toClose.map(path => ({
      path,
      content: fileContents.get(path) || '',
      wasDirty: dirtyFiles.has(path),
    }))

    set({
      openFiles: newOpenFiles,
      fileContents: newContents,
      currentFile: currentFile && newOpenFiles.includes(currentFile) ? currentFile : keepPath,
      dirtyFiles: newDirty,
      recentlyClosedFiles: [...closedFiles, ...recentlyClosedFiles].slice(0, 20),
      pinnedFiles: newPinned,
      mruOrder: mruOrder.filter(p => newOpenFiles.includes(p)),
    })

    // P1 fix: Clear secondary pane if its file was closed
    const paneState = useSplitPaneStore.getState()
    if (paneState.paneFiles.secondary && toClose.includes(paneState.paneFiles.secondary)) {
      useSplitPaneStore.getState().setPaneFile('secondary', null)
    }
  },

  closeToRight: (keepPath: string) => {
    const { openFiles, fileContents, dirtyFiles, currentFile, recentlyClosedFiles, pinnedFiles, mruOrder } = get()
    const keepIndex = openFiles.indexOf(keepPath)
    if (keepIndex === -1 || keepIndex >= openFiles.length - 1 || !keepPath) return
    // VS Code behavior: pinned files are NOT closed by Close to Right
    // VS Code behavior: active editor is auto-pinned
    const toClose = openFiles.slice(keepIndex + 1).filter(f => !pinnedFiles.has(f) && !dirtyFiles.has(f))
    const newPinned = new Set([...pinnedFiles, keepPath]) // Auto-pin active editor
    const newOpenFiles = [...openFiles.slice(0, keepIndex + 1), ...openFiles.slice(keepIndex + 1).filter(f => pinnedFiles.has(f) || dirtyFiles.has(f))]
    const newContents = new Map<string, string>()
    const newDirty = new Set<string>()
    for (const f of newOpenFiles) {
      const c = fileContents.get(f)
      if (c !== undefined) newContents.set(f, c)
      if (dirtyFiles.has(f)) newDirty.add(f)
    }

    const closedFiles = toClose.map(path => ({
      path,
      content: fileContents.get(path) || '',
      wasDirty: dirtyFiles.has(path),
    }))

    set({
      openFiles: newOpenFiles,
      fileContents: newContents,
      currentFile: currentFile && newOpenFiles.includes(currentFile) ? currentFile : keepPath,
      dirtyFiles: newDirty,
      recentlyClosedFiles: [...closedFiles, ...recentlyClosedFiles].slice(0, 20),
      pinnedFiles: newPinned,
      mruOrder: mruOrder.filter(p => newOpenFiles.includes(p)),
    })

    // P1 fix: Clear secondary pane if its file was closed
    const paneState = useSplitPaneStore.getState()
    if (paneState.paneFiles.secondary && toClose.includes(paneState.paneFiles.secondary)) {
      useSplitPaneStore.getState().setPaneFile('secondary', null)
    }
  },

  closeSaved: () => {
    const { openFiles, fileContents, dirtyFiles, currentFile, recentlyClosedFiles, pinnedFiles, mruOrder } = get()
    // VS Code behavior: pinned files are NOT closed by Close Saved
    const toClose = openFiles.filter(f => !dirtyFiles.has(f) && !pinnedFiles.has(f))
    const newOpenFiles = openFiles.filter(f => dirtyFiles.has(f) || pinnedFiles.has(f))
    const newContents = new Map<string, string>()
    const newDirty = new Set<string>()
    for (const f of newOpenFiles) {
      const c = fileContents.get(f)
      if (c !== undefined) newContents.set(f, c)
      if (dirtyFiles.has(f)) newDirty.add(f)
    }

    const closedFiles = toClose.map(path => ({
      path,
      content: fileContents.get(path) || '',
      wasDirty: false,
    }))

    set({
      openFiles: newOpenFiles,
      fileContents: newContents,
      currentFile: newOpenFiles.length > 0 ? (newOpenFiles.includes(currentFile || '') ? currentFile : newOpenFiles[newOpenFiles.length - 1]) : null,
      dirtyFiles: newDirty,
      recentlyClosedFiles: [...closedFiles, ...recentlyClosedFiles].slice(0, 20),
      mruOrder: mruOrder.filter(p => newOpenFiles.includes(p)),
    })

    // P1 fix: Clear secondary pane if its file was closed
    const paneState = useSplitPaneStore.getState()
    if (paneState.paneFiles.secondary && toClose.includes(paneState.paneFiles.secondary)) {
      useSplitPaneStore.getState().setPaneFile('secondary', null)
    }
  },

  undoCloseFile: async () => {
    const { recentlyClosedFiles, openFiles, fileContents, dirtyFiles, mruOrder } = get()

    if (recentlyClosedFiles.length === 0) return

    const lastClosed = recentlyClosedFiles[0]
    const newRecentlyClosed = recentlyClosedFiles.slice(1)

    // Don't reopen if already open
    if (openFiles.includes(lastClosed.path)) {
      set({ recentlyClosedFiles: newRecentlyClosed })
      return
    }

    // Restore file with saved content
    const newContents = new Map(fileContents)
    newContents.set(lastClosed.path, lastClosed.content)
    const newDirty = new Set(dirtyFiles)
    if (lastClosed.wasDirty) {
      newDirty.add(lastClosed.path)
    }

    // Update MRU: add reopened file to end
    const newMru = mruOrder.filter(p => p !== lastClosed.path)
    newMru.push(lastClosed.path)

    set({
      openFiles: [...openFiles, lastClosed.path],
      fileContents: newContents,
      currentFile: lastClosed.path,
      dirtyFiles: newDirty,
      recentlyClosedFiles: newRecentlyClosed,
      mruOrder: newMru,
    })
  },

  undoCloseFiles: async () => {
    const { recentlyClosedFiles, openFiles, fileContents, dirtyFiles, mruOrder } = get()
    if (recentlyClosedFiles.length === 0) return

    const newContents = new Map(fileContents)
    const newDirty = new Set(dirtyFiles)
    const newOpen = [...openFiles]
    const newMru = [...mruOrder]
    const restored: string[] = []
    const skippedPaths = new Set<string>()

    // Restore all recently closed files in reverse order (most recent last)
    for (const entry of [...recentlyClosedFiles].reverse()) {
      if (!newOpen.includes(entry.path)) {
        newContents.set(entry.path, entry.content)
        if (entry.wasDirty) newDirty.add(entry.path)
        newOpen.push(entry.path)
        newMru.push(entry.path)
        restored.push(entry.path)
      } else {
        skippedPaths.add(entry.path)
      }
    }

    // Only remove entries that were actually restored, keep skipped ones
    const remainingClosed = recentlyClosedFiles.filter(e => skippedPaths.has(e.path))

    set({
      openFiles: newOpen,
      fileContents: newContents,
      currentFile: restored[restored.length - 1] || get().currentFile,
      dirtyFiles: newDirty,
      recentlyClosedFiles: remainingClosed,
      mruOrder: newMru,
    })
  },

  reorderFiles: (fromIndex, toIndex) => {
    const { openFiles, pinnedFiles } = get()
    if (fromIndex < 0 || fromIndex >= openFiles.length || toIndex < 0 || toIndex >= openFiles.length) return

    const movingPath = openFiles[fromIndex]
    if (!movingPath) return

    // Count pinned files to find the boundary
    const pinnedCount = [...openFiles].filter(f => pinnedFiles.has(f)).length

    // VS Code behavior: pinned tabs stay at the left, unpinned at the right
    // Prevent dragging pinned tabs into unpinned area and vice versa
    const isPinnedTab = pinnedFiles.has(movingPath)
    if (isPinnedTab) {
      // Pinned tabs can only be reordered within pinned area (indices 0 to pinnedCount-1)
      if (toIndex >= pinnedCount) return
    } else {
      // Unpinned tabs can only be reordered within unpinned area (indices pinnedCount+)
      if (toIndex < pinnedCount) return
    }

    const newFiles = [...openFiles]
    const [moved] = newFiles.splice(fromIndex, 1)
    newFiles.splice(toIndex, 0, moved)
    set({ openFiles: newFiles })
  },

  updateFileContent: (path, content) => {
    const newContents = new Map(get().fileContents)
    newContents.set(path, content)
    const newDirty = new Set(get().dirtyFiles)
    newDirty.add(path)
    // VS Code: editing a preview tab converts it to permanent (clear previewTab)
    const state = get()
    set({
      fileContents: newContents,
      dirtyFiles: newDirty,
      previewTab: state.previewTab === path ? null : state.previewTab,
      mruOrder: state.mruOrder.includes(path) ? state.mruOrder : [...state.mruOrder, path],
    })
  },

  clearDirty: (path) => {
    const newDirty = new Set(get().dirtyFiles)
    newDirty.delete(path)
    set({ dirtyFiles: newDirty })
  },

  setLanguage: (lang) => set({ language: lang }),

  togglePin: (path) => {
    const { openFiles, pinnedFiles } = get()
    const newPinned = new Set(pinnedFiles)

    if (newPinned.has(path)) {
      // Unpin: just remove from pinned set, keep in place
      newPinned.delete(path)
      set({ pinnedFiles: newPinned })
    } else {
      // Pin: add to pinned set and move to front
      newPinned.add(path)
      // Reorder: pinned files go to the left, maintaining relative order
      const pinnedList = openFiles.filter(f => newPinned.has(f))
      const unpinnedList = openFiles.filter(f => !newPinned.has(f))
      // Ensure newly pinned file is at the end of pinned section
      const orderedPinned = pinnedList.filter(f => f !== path).concat([path])
      set({
        pinnedFiles: newPinned,
        openFiles: [...orderedPinned, ...unpinnedList]
      })
    }
  },

  isPinned: (path) => {
    return get().pinnedFiles.has(path)
  },

  clearExternalModification: (path) => {
    const newMods = new Set(get().externalModifications)
    newMods.delete(path)
    set({ externalModifications: newMods })
  },

  subscribeToFileChanges: () => {
    const cleanups: Array<() => void> = []

    const fileChangeHandler = (payload: unknown) => {
      const event = payload as { path: string; eventType: string }
      if (!event?.path) return

      const state = get()

      if (event.eventType === 'workspace_file_changed') {
        // Only mark as externally modified if the file is currently open
        if (state.openFiles.includes(event.path)) {
          // Don't mark if the file is dirty (user has unsaved edits)
          if (!state.dirtyFiles.has(event.path)) {
            const newMods = new Set(state.externalModifications)
            newMods.add(event.path)
            set({ externalModifications: newMods })
          }
        }
      } else if (event.eventType === 'workspace_file_deleted') {
        // File deleted externally — refresh file tree
        get().refreshFileTree()
      } else if (event.eventType === 'workspace_file_created') {
        // New file created externally — refresh file tree
        get().refreshFileTree()
      }
    }

    cleanups.push(events.subscribe('workspace_file_changed', fileChangeHandler))
    cleanups.push(events.subscribe('workspace_file_deleted', fileChangeHandler))
    cleanups.push(events.subscribe('workspace_file_created', fileChangeHandler))

    return () => {
      for (const cleanup of cleanups) {
        cleanup()
      }
    }
  },
}))
