import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../services/api', () => ({
  fsApi: {
    getWorkspace: vi.fn().mockResolvedValue('/project'),
    setWorkspace: vi.fn().mockResolvedValue(undefined),
    listDir: vi.fn().mockResolvedValue([
      { name: 'src', path: '/project/src', isDirectory: true },
      { name: 'index.ts', path: '/project/index.ts', isDirectory: false },
    ]),
    readFile: vi.fn().mockResolvedValue('file content'),
  },
  events: {
    subscribe: vi.fn().mockReturnValue(() => {}),
  },
}))

vi.mock('../utils', () => ({
  logger: { error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}))

vi.mock('./splitPaneStore', () => ({
  useSplitPaneStore: {
    getState: vi.fn().mockReturnValue({
      paneFiles: { secondary: null },
      setPaneFile: vi.fn(),
    }),
  },
}))

import { useWorkspaceStore } from './workspaceStore'
import { fsApi, events } from '../services/api'
import { useSplitPaneStore } from './splitPaneStore'

// Helper to capture the fileChangeHandler from subscribeToFileChanges
function captureFileChangeHandler(): (payload: unknown) => void {
  // Clear previous subscribe calls
  vi.mocked(events.subscribe).mockClear()
  // subscribeToFileChanges calls events.subscribe 3 times with the same handler
  useWorkspaceStore.getState().subscribeToFileChanges()
  // The first call's second arg is the handler
  const calls = vi.mocked(events.subscribe).mock.calls
  return calls[0][1] as (payload: unknown) => void
}

// Helper to reset store state between tests
function resetStore() {
  useWorkspaceStore.setState({
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
  })
}

describe('workspaceStore', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
  })

  describe('setWorkspacePath', () => {
    it('sets workspace path', () => {
      useWorkspaceStore.getState().setWorkspacePath('/new/path')
      expect(useWorkspaceStore.getState().workspacePath).toBe('/new/path')
    })
  })

  describe('toggleDir', () => {
    it('adds path to expandedDirs when not expanded', () => {
      useWorkspaceStore.getState().toggleDir('/project/src')
      expect(useWorkspaceStore.getState().expandedDirs.has('/project/src')).toBe(true)
    })

    it('removes path from expandedDirs when already expanded', () => {
      useWorkspaceStore.getState().toggleDir('/project/src')
      useWorkspaceStore.getState().toggleDir('/project/src')
      expect(useWorkspaceStore.getState().expandedDirs.has('/project/src')).toBe(false)
    })
  })

  describe('loadWorkspace', () => {
    it('loads workspace and refreshes file tree', async () => {
      await useWorkspaceStore.getState().loadWorkspace()
      const state = useWorkspaceStore.getState()
      expect(state.workspacePath).toBe('/project')
      expect(state.fileTree).toHaveLength(2)
    })
  })

  describe('openFile', () => {
    it('opens a file and adds to openFiles', async () => {
      await useWorkspaceStore.getState().openFile('/project/index.ts')
      const state = useWorkspaceStore.getState()
      expect(state.openFiles).toContain('/project/index.ts')
      expect(state.currentFile).toBe('/project/index.ts')
      expect(state.fileContents.get('/project/index.ts')).toBe('file content')
    })

    it('sets previewTab for preview mode', async () => {
      await useWorkspaceStore.getState().openFile('/project/index.ts', { preview: true })
      expect(useWorkspaceStore.getState().previewTab).toBe('/project/index.ts')
    })

    it('clears previewTab for non-preview mode', async () => {
      await useWorkspaceStore.getState().openFile('/project/index.ts', { preview: false })
      expect(useWorkspaceStore.getState().previewTab).toBeNull()
    })

    it('infers language from extension', async () => {
      await useWorkspaceStore.getState().openFile('/project/index.ts')
      expect(useWorkspaceStore.getState().language).toBe('typescript')
    })

    it('switches to already open file without re-reading', async () => {
      await useWorkspaceStore.getState().openFile('/project/index.ts')
      await useWorkspaceStore.getState().openFile('/project/index.ts')
      expect(useWorkspaceStore.getState().openFiles).toHaveLength(1)
    })

    it('concurrent openFile calls do not lose content (race condition fix)', async () => {
      // Open two files concurrently — both should end up in openFiles
      await Promise.all([
        useWorkspaceStore.getState().openFile('/project/a.ts', { preview: false }),
        useWorkspaceStore.getState().openFile('/project/b.ts', { preview: false }),
      ])
      const state = useWorkspaceStore.getState()
      expect(state.openFiles).toContain('/project/a.ts')
      expect(state.openFiles).toContain('/project/b.ts')
      expect(state.fileContents.get('/project/a.ts')).toBe('file content')
      expect(state.fileContents.get('/project/b.ts')).toBe('file content')
    })

    it('replaces preview tab when opening new file', async () => {
      await useWorkspaceStore.getState().openFile('/project/a.ts', { preview: true })
      expect(useWorkspaceStore.getState().previewTab).toBe('/project/a.ts')
      await useWorkspaceStore.getState().openFile('/project/b.ts', { preview: true })
      const state = useWorkspaceStore.getState()
      // Preview tab should switch to b, and a should be closed (not pinned)
      expect(state.previewTab).toBe('/project/b.ts')
      expect(state.openFiles).toContain('/project/b.ts')
    })
  })

  describe('closeFile', () => {
    it('removes file from openFiles', async () => {
      await useWorkspaceStore.getState().openFile('/project/index.ts', { preview: false })
      useWorkspaceStore.getState().closeFile('/project/index.ts')
      const state = useWorkspaceStore.getState()
      expect(state.openFiles).not.toContain('/project/index.ts')
      expect(state.currentFile).toBeNull()
    })

    it('stores closed file in recentlyClosedFiles', async () => {
      await useWorkspaceStore.getState().openFile('/project/index.ts', { preview: false })
      useWorkspaceStore.getState().closeFile('/project/index.ts')
      expect(useWorkspaceStore.getState().recentlyClosedFiles).toHaveLength(1)
      expect(useWorkspaceStore.getState().recentlyClosedFiles[0].path).toBe('/project/index.ts')
    })

    it('focuses right neighbor when closing current file', async () => {
      await useWorkspaceStore.getState().openFile('/project/a.ts', { preview: false })
      await useWorkspaceStore.getState().openFile('/project/b.ts', { preview: false })
      await useWorkspaceStore.getState().openFile('/project/c.ts', { preview: false })
      useWorkspaceStore.setState({ currentFile: '/project/b.ts' })
      useWorkspaceStore.getState().closeFile('/project/b.ts')
      expect(useWorkspaceStore.getState().currentFile).toBe('/project/c.ts')
    })

    it('removes from dirtyFiles and pinnedFiles', async () => {
      await useWorkspaceStore.getState().openFile('/project/index.ts', { preview: false })
      useWorkspaceStore.getState().updateFileContent('/project/index.ts', 'dirty')
      useWorkspaceStore.getState().togglePin('/project/index.ts')
      useWorkspaceStore.getState().closeFile('/project/index.ts')
      const state = useWorkspaceStore.getState()
      expect(state.dirtyFiles.has('/project/index.ts')).toBe(false)
      expect(state.pinnedFiles.has('/project/index.ts')).toBe(false)
    })
  })

  describe('closeAllFiles', () => {
    it('closes all unpinned files', async () => {
      await useWorkspaceStore.getState().openFile('/project/a.ts', { preview: false })
      await useWorkspaceStore.getState().openFile('/project/b.ts', { preview: false })
      useWorkspaceStore.getState().togglePin('/project/a.ts')
      useWorkspaceStore.getState().closeAllFiles()
      const state = useWorkspaceStore.getState()
      expect(state.openFiles).toEqual(['/project/a.ts'])
      expect(state.currentFile).toBe('/project/a.ts')
    })

    it('preserves pinned files content', async () => {
      await useWorkspaceStore.getState().openFile('/project/a.ts', { preview: false })
      useWorkspaceStore.getState().updateFileContent('/project/a.ts', 'pinned content')
      useWorkspaceStore.getState().togglePin('/project/a.ts')
      useWorkspaceStore.getState().closeAllFiles()
      expect(useWorkspaceStore.getState().fileContents.get('/project/a.ts')).toBe('pinned content')
    })
  })

  describe('closeOthers', () => {
    it('keeps specified file and closes others', async () => {
      await useWorkspaceStore.getState().openFile('/project/a.ts', { preview: false })
      await useWorkspaceStore.getState().openFile('/project/b.ts', { preview: false })
      await useWorkspaceStore.getState().openFile('/project/c.ts', { preview: false })
      useWorkspaceStore.getState().closeOthers('/project/b.ts')
      const state = useWorkspaceStore.getState()
      expect(state.openFiles).toContain('/project/b.ts')
      expect(state.currentFile).toBe('/project/b.ts')
    })

    it('auto-pins kept file', async () => {
      await useWorkspaceStore.getState().openFile('/project/a.ts', { preview: false })
      await useWorkspaceStore.getState().openFile('/project/b.ts', { preview: false })
      useWorkspaceStore.getState().closeOthers('/project/b.ts')
      expect(useWorkspaceStore.getState().pinnedFiles.has('/project/b.ts')).toBe(true)
    })

    it('preserves dirty files', async () => {
      await useWorkspaceStore.getState().openFile('/project/a.ts', { preview: false })
      await useWorkspaceStore.getState().openFile('/project/b.ts', { preview: false })
      useWorkspaceStore.getState().updateFileContent('/project/a.ts', 'dirty')
      useWorkspaceStore.getState().closeOthers('/project/b.ts')
      expect(useWorkspaceStore.getState().openFiles).toContain('/project/a.ts')
    })
  })

  describe('closeToLeft', () => {
    it('closes files to the left of specified file', async () => {
      await useWorkspaceStore.getState().openFile('/project/a.ts', { preview: false })
      await useWorkspaceStore.getState().openFile('/project/b.ts', { preview: false })
      await useWorkspaceStore.getState().openFile('/project/c.ts', { preview: false })
      useWorkspaceStore.getState().closeToLeft('/project/c.ts')
      const state = useWorkspaceStore.getState()
      expect(state.openFiles).toEqual(['/project/c.ts'])
    })
  })

  describe('closeToRight', () => {
    it('closes files to the right of specified file', async () => {
      await useWorkspaceStore.getState().openFile('/project/a.ts', { preview: false })
      await useWorkspaceStore.getState().openFile('/project/b.ts', { preview: false })
      await useWorkspaceStore.getState().openFile('/project/c.ts', { preview: false })
      useWorkspaceStore.getState().closeToRight('/project/a.ts')
      const state = useWorkspaceStore.getState()
      expect(state.openFiles).toEqual(['/project/a.ts'])
    })
  })

  describe('closeSaved', () => {
    it('closes only non-dirty, non-pinned files', async () => {
      await useWorkspaceStore.getState().openFile('/project/a.ts', { preview: false })
      await useWorkspaceStore.getState().openFile('/project/b.ts', { preview: false })
      await useWorkspaceStore.getState().openFile('/project/c.ts', { preview: false })
      useWorkspaceStore.getState().updateFileContent('/project/b.ts', 'dirty')
      useWorkspaceStore.getState().closeSaved()
      const state = useWorkspaceStore.getState()
      expect(state.openFiles).toContain('/project/b.ts')
      expect(state.openFiles).not.toContain('/project/a.ts')
      expect(state.openFiles).not.toContain('/project/c.ts')
    })
  })

  describe('undoCloseFile', () => {
    it('reopens last closed file', async () => {
      await useWorkspaceStore.getState().openFile('/project/index.ts', { preview: false })
      useWorkspaceStore.getState().closeFile('/project/index.ts')
      await useWorkspaceStore.getState().undoCloseFile()
      const state = useWorkspaceStore.getState()
      expect(state.openFiles).toContain('/project/index.ts')
      expect(state.currentFile).toBe('/project/index.ts')
    })

    it('restores dirty state', async () => {
      await useWorkspaceStore.getState().openFile('/project/index.ts', { preview: false })
      useWorkspaceStore.getState().updateFileContent('/project/index.ts', 'dirty')
      useWorkspaceStore.getState().closeFile('/project/index.ts')
      await useWorkspaceStore.getState().undoCloseFile()
      expect(useWorkspaceStore.getState().dirtyFiles.has('/project/index.ts')).toBe(true)
    })

    it('does nothing when no recently closed files', async () => {
      await useWorkspaceStore.getState().undoCloseFile()
      expect(useWorkspaceStore.getState().openFiles).toHaveLength(0)
    })
  })

  describe('undoCloseFiles', () => {
    it('reopens all recently closed files', async () => {
      await useWorkspaceStore.getState().openFile('/project/a.ts', { preview: false })
      await useWorkspaceStore.getState().openFile('/project/b.ts', { preview: false })
      useWorkspaceStore.getState().closeFile('/project/a.ts')
      useWorkspaceStore.getState().closeFile('/project/b.ts')
      await useWorkspaceStore.getState().undoCloseFiles()
      const state = useWorkspaceStore.getState()
      expect(state.openFiles).toContain('/project/a.ts')
      expect(state.openFiles).toContain('/project/b.ts')
    })
  })

  describe('reorderFiles', () => {
    it('moves file from one position to another', async () => {
      await useWorkspaceStore.getState().openFile('/project/a.ts', { preview: false })
      await useWorkspaceStore.getState().openFile('/project/b.ts', { preview: false })
      await useWorkspaceStore.getState().openFile('/project/c.ts', { preview: false })
      useWorkspaceStore.getState().reorderFiles(0, 2)
      expect(useWorkspaceStore.getState().openFiles).toEqual(['/project/b.ts', '/project/c.ts', '/project/a.ts'])
    })

    it('does nothing for invalid indices', async () => {
      await useWorkspaceStore.getState().openFile('/project/a.ts', { preview: false })
      useWorkspaceStore.getState().reorderFiles(-1, 5)
      expect(useWorkspaceStore.getState().openFiles).toEqual(['/project/a.ts'])
    })
  })

  describe('updateFileContent', () => {
    it('updates content and marks as dirty', async () => {
      await useWorkspaceStore.getState().openFile('/project/index.ts', { preview: false })
      useWorkspaceStore.getState().updateFileContent('/project/index.ts', 'new content')
      const state = useWorkspaceStore.getState()
      expect(state.fileContents.get('/project/index.ts')).toBe('new content')
      expect(state.dirtyFiles.has('/project/index.ts')).toBe(true)
    })

    it('converts preview tab to permanent', async () => {
      await useWorkspaceStore.getState().openFile('/project/index.ts', { preview: true })
      expect(useWorkspaceStore.getState().previewTab).toBe('/project/index.ts')
      useWorkspaceStore.getState().updateFileContent('/project/index.ts', 'edited')
      expect(useWorkspaceStore.getState().previewTab).toBeNull()
    })
  })

  describe('clearDirty', () => {
    it('removes file from dirtyFiles', async () => {
      await useWorkspaceStore.getState().openFile('/project/index.ts')
      useWorkspaceStore.getState().updateFileContent('/project/index.ts', 'dirty')
      useWorkspaceStore.getState().clearDirty('/project/index.ts')
      expect(useWorkspaceStore.getState().dirtyFiles.has('/project/index.ts')).toBe(false)
    })
  })

  describe('togglePin', () => {
    it('pins a file and moves it to front', async () => {
      await useWorkspaceStore.getState().openFile('/project/a.ts')
      await useWorkspaceStore.getState().openFile('/project/b.ts')
      useWorkspaceStore.getState().togglePin('/project/b.ts')
      const state = useWorkspaceStore.getState()
      expect(state.pinnedFiles.has('/project/b.ts')).toBe(true)
      expect(state.openFiles[0]).toBe('/project/b.ts')
    })

    it('unpins a file', async () => {
      await useWorkspaceStore.getState().openFile('/project/a.ts')
      useWorkspaceStore.getState().togglePin('/project/a.ts')
      useWorkspaceStore.getState().togglePin('/project/a.ts')
      expect(useWorkspaceStore.getState().pinnedFiles.has('/project/a.ts')).toBe(false)
    })
  })

  describe('isPinned', () => {
    it('returns true for pinned files', async () => {
      await useWorkspaceStore.getState().openFile('/project/a.ts')
      useWorkspaceStore.getState().togglePin('/project/a.ts')
      expect(useWorkspaceStore.getState().isPinned('/project/a.ts')).toBe(true)
    })

    it('returns false for unpinned files', () => {
      expect(useWorkspaceStore.getState().isPinned('/project/a.ts')).toBe(false)
    })
  })

  describe('renameFileInStore', () => {
    it('renames file in openFiles', async () => {
      await useWorkspaceStore.getState().openFile('/project/old.ts')
      useWorkspaceStore.getState().renameFileInStore('/project/old.ts', '/project/new.ts')
      const state = useWorkspaceStore.getState()
      expect(state.openFiles).toContain('/project/new.ts')
      expect(state.openFiles).not.toContain('/project/old.ts')
    })

    it('moves content to new path', async () => {
      await useWorkspaceStore.getState().openFile('/project/old.ts')
      useWorkspaceStore.getState().updateFileContent('/project/old.ts', 'content')
      useWorkspaceStore.getState().renameFileInStore('/project/old.ts', '/project/new.ts')
      expect(useWorkspaceStore.getState().fileContents.get('/project/new.ts')).toBe('content')
      expect(useWorkspaceStore.getState().fileContents.has('/project/old.ts')).toBe(false)
    })

    it('updates currentFile if it was renamed', async () => {
      await useWorkspaceStore.getState().openFile('/project/old.ts')
      useWorkspaceStore.getState().renameFileInStore('/project/old.ts', '/project/new.ts')
      expect(useWorkspaceStore.getState().currentFile).toBe('/project/new.ts')
    })

    it('moves dirty state', async () => {
      await useWorkspaceStore.getState().openFile('/project/old.ts')
      useWorkspaceStore.getState().updateFileContent('/project/old.ts', 'dirty')
      useWorkspaceStore.getState().renameFileInStore('/project/old.ts', '/project/new.ts')
      expect(useWorkspaceStore.getState().dirtyFiles.has('/project/new.ts')).toBe(true)
      expect(useWorkspaceStore.getState().dirtyFiles.has('/project/old.ts')).toBe(false)
    })

    it('moves pinned state', async () => {
      await useWorkspaceStore.getState().openFile('/project/old.ts')
      useWorkspaceStore.getState().togglePin('/project/old.ts')
      useWorkspaceStore.getState().renameFileInStore('/project/old.ts', '/project/new.ts')
      expect(useWorkspaceStore.getState().pinnedFiles.has('/project/new.ts')).toBe(true)
      expect(useWorkspaceStore.getState().pinnedFiles.has('/project/old.ts')).toBe(false)
    })
  })

  describe('setLanguage', () => {
    it('sets language', () => {
      useWorkspaceStore.getState().setLanguage('go')
      expect(useWorkspaceStore.getState().language).toBe('go')
    })
  })

  describe('reorderFiles', () => {
    beforeEach(() => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
        fileContents: new Map([
          ['/project/a.ts', 'a'],
          ['/project/b.ts', 'b'],
          ['/project/c.ts', 'c'],
        ]),
      })
    })

    it('reorders files within bounds', () => {
      const before = [...useWorkspaceStore.getState().openFiles]
      useWorkspaceStore.getState().reorderFiles(0, 2)
      const after = useWorkspaceStore.getState().openFiles
      expect(after[2]).toBe(before[0])
      expect(after[0]).toBe(before[1])
    })

    it('does nothing with negative fromIndex', () => {
      const before = [...useWorkspaceStore.getState().openFiles]
      useWorkspaceStore.getState().reorderFiles(-1, 1)
      expect(useWorkspaceStore.getState().openFiles).toEqual(before)
    })

    it('does nothing with out-of-bounds toIndex', () => {
      const before = [...useWorkspaceStore.getState().openFiles]
      useWorkspaceStore.getState().reorderFiles(0, 100)
      expect(useWorkspaceStore.getState().openFiles).toEqual(before)
    })

    it('does nothing with out-of-bounds fromIndex', () => {
      const before = [...useWorkspaceStore.getState().openFiles]
      useWorkspaceStore.getState().reorderFiles(100, 0)
      expect(useWorkspaceStore.getState().openFiles).toEqual(before)
    })

    it('does nothing with negative toIndex', () => {
      const before = [...useWorkspaceStore.getState().openFiles]
      useWorkspaceStore.getState().reorderFiles(0, -1)
      expect(useWorkspaceStore.getState().openFiles).toEqual(before)
    })
  })

  describe('isPinned', () => {
    it('returns false for unpinned file', async () => {
      resetStore()
      await useWorkspaceStore.getState().openFile('/project/a.ts')
      expect(useWorkspaceStore.getState().isPinned('/project/a.ts')).toBe(false)
    })

    it('returns true for pinned file', async () => {
      resetStore()
      await useWorkspaceStore.getState().openFile('/project/a.ts')
      useWorkspaceStore.getState().togglePin('/project/a.ts')
      expect(useWorkspaceStore.getState().isPinned('/project/a.ts')).toBe(true)
    })
  })

  describe('clearExternalModification', () => {
    it('removes path from external modifications', () => {
      resetStore()
      useWorkspaceStore.setState({ externalModifications: new Set(['/project/a.ts', '/project/b.ts']) })
      useWorkspaceStore.getState().clearExternalModification('/project/a.ts')
      expect(useWorkspaceStore.getState().externalModifications.has('/project/a.ts')).toBe(false)
      expect(useWorkspaceStore.getState().externalModifications.has('/project/b.ts')).toBe(true)
    })

    it('does nothing for path not in set', () => {
      resetStore()
      useWorkspaceStore.setState({ externalModifications: new Set(['/project/a.ts']) })
      useWorkspaceStore.getState().clearExternalModification('/project/c.ts')
      expect(useWorkspaceStore.getState().externalModifications.size).toBe(1)
    })
  })

  describe('subscribeToFileChanges', () => {
    it('returns cleanup function', () => {
      resetStore()
      const cleanup = useWorkspaceStore.getState().subscribeToFileChanges()
      expect(typeof cleanup).toBe('function')
      cleanup()
    })

    it('subscribes to workspace_file_changed, workspace_file_deleted, workspace_file_created events', () => {
      resetStore()
      useWorkspaceStore.getState().subscribeToFileChanges()
      expect(events.subscribe).toHaveBeenCalledWith('workspace_file_changed', expect.any(Function))
      expect(events.subscribe).toHaveBeenCalledWith('workspace_file_deleted', expect.any(Function))
      expect(events.subscribe).toHaveBeenCalledWith('workspace_file_created', expect.any(Function))
    })

    it('marks open non-dirty file as externally modified on workspace_file_changed', () => {
      resetStore()
      const handler = captureFileChangeHandler()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts'],
        dirtyFiles: new Set<string>(),
        workspacePath: '/project',
      })
      handler({ path: '/project/a.ts', eventType: 'workspace_file_changed' })
      expect(useWorkspaceStore.getState().externalModifications.has('/project/a.ts')).toBe(true)
    })

    it('does not mark dirty file as externally modified on workspace_file_changed', () => {
      resetStore()
      const handler = captureFileChangeHandler()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts'],
        dirtyFiles: new Set(['/project/a.ts']),
        workspacePath: '/project',
      })
      handler({ path: '/project/a.ts', eventType: 'workspace_file_changed' })
      expect(useWorkspaceStore.getState().externalModifications.has('/project/a.ts')).toBe(false)
    })

    it('does not mark closed file as externally modified on workspace_file_changed', () => {
      resetStore()
      const handler = captureFileChangeHandler()
      useWorkspaceStore.setState({
        openFiles: ['/project/b.ts'],
        dirtyFiles: new Set<string>(),
        workspacePath: '/project',
      })
      handler({ path: '/project/a.ts', eventType: 'workspace_file_changed' })
      expect(useWorkspaceStore.getState().externalModifications.size).toBe(0)
    })

    it('ignores events without path', () => {
      resetStore()
      const handler = captureFileChangeHandler()
      handler({ eventType: 'workspace_file_changed' })
      expect(useWorkspaceStore.getState().externalModifications.size).toBe(0)
    })

    it('refreshes file tree on workspace_file_deleted', async () => {
      resetStore()
      const handler = captureFileChangeHandler()
      useWorkspaceStore.setState({ workspacePath: '/project' })
      handler({ path: '/project/a.ts', eventType: 'workspace_file_deleted' })
      // fsApi.listDir was called by refreshFileTree

      expect(fsApi.listDir).toHaveBeenCalledWith('/project')
    })

    it('refreshes file tree on workspace_file_created', async () => {
      resetStore()
      const handler = captureFileChangeHandler()
      useWorkspaceStore.setState({ workspacePath: '/project' })
      handler({ path: '/project/a.ts', eventType: 'workspace_file_created' })

      expect(fsApi.listDir).toHaveBeenCalledWith('/project')
    })
  })

  describe('setWorkspacePath', () => {
    it('syncs workspace to backend via fsApi.setWorkspace', async () => {
      resetStore()
      useWorkspaceStore.getState().setWorkspacePath('/my/project')

      expect(fsApi.setWorkspace).toHaveBeenCalledWith('/my/project')
      expect(useWorkspaceStore.getState().workspacePath).toBe('/my/project')
    })

    it('handles fsApi.setWorkspace rejection gracefully', async () => {
      resetStore()

      const failingSetWorkspace = vi.fn().mockRejectedValue(new Error('sync failed'))
      vi.mocked(fsApi).setWorkspace = failingSetWorkspace
      // Should not throw
      useWorkspaceStore.getState().setWorkspacePath('/fail/path')
      // Wait for the promise to settle
      await new Promise(r => setTimeout(r, 10))
      expect(useWorkspaceStore.getState().workspacePath).toBe('/fail/path')
      // Restore mock
      vi.mocked(fsApi).setWorkspace = vi.fn().mockResolvedValue(undefined)
    })
  })

  describe('loadWorkspace', () => {
    it('handles loadWorkspace error gracefully', async () => {
      resetStore()

      vi.mocked(fsApi).getWorkspace = vi.fn().mockRejectedValue(new Error('load failed'))
      await useWorkspaceStore.getState().loadWorkspace()
      // Should not throw, workspacePath remains unchanged
      expect(useWorkspaceStore.getState().workspacePath).toBe('')
      // Restore mock
      vi.mocked(fsApi).getWorkspace = vi.fn().mockResolvedValue('/project')
    })
  })

  describe('refreshFileTree', () => {
    it('does nothing when workspacePath is empty', async () => {
      resetStore()
      useWorkspaceStore.setState({ workspacePath: '' })
      await useWorkspaceStore.getState().refreshFileTree()

      expect(fsApi.listDir).not.toHaveBeenCalled()
    })

    it('handles listDir error gracefully', async () => {
      resetStore()

      vi.mocked(fsApi).listDir = vi.fn().mockRejectedValue(new Error('dir failed'))
      useWorkspaceStore.setState({ workspacePath: '/project' })
      await useWorkspaceStore.getState().refreshFileTree()
      expect(useWorkspaceStore.getState().loading).toBe(false)
      expect(useWorkspaceStore.getState().fileTree).toEqual([])
      // Restore mock
      vi.mocked(fsApi).listDir = vi.fn().mockResolvedValue([])
    })
  })

  describe('openFile language inference', () => {
    it('infers javascript from .js extension', async () => {
      resetStore()

      vi.mocked(fsApi).readFile = vi.fn().mockResolvedValue('js content')
      await useWorkspaceStore.getState().openFile('/project/app.js')
      expect(useWorkspaceStore.getState().language).toBe('javascript')
      vi.mocked(fsApi).readFile = vi.fn().mockResolvedValue('file content')
    })

    it('infers python from .py extension', async () => {
      resetStore()

      vi.mocked(fsApi).readFile = vi.fn().mockResolvedValue('py content')
      await useWorkspaceStore.getState().openFile('/project/main.py')
      expect(useWorkspaceStore.getState().language).toBe('python')
      vi.mocked(fsApi).readFile = vi.fn().mockResolvedValue('file content')
    })

    it('infers go from .go extension', async () => {
      resetStore()

      vi.mocked(fsApi).readFile = vi.fn().mockResolvedValue('go content')
      await useWorkspaceStore.getState().openFile('/project/main.go')
      expect(useWorkspaceStore.getState().language).toBe('go')
      vi.mocked(fsApi).readFile = vi.fn().mockResolvedValue('file content')
    })

    it('infers json from .json extension', async () => {
      resetStore()

      vi.mocked(fsApi).readFile = vi.fn().mockResolvedValue('{}')
      await useWorkspaceStore.getState().openFile('/project/pkg.json')
      expect(useWorkspaceStore.getState().language).toBe('json')
      vi.mocked(fsApi).readFile = vi.fn().mockResolvedValue('file content')
    })

    it('does not change language for unknown extension', async () => {
      resetStore()

      vi.mocked(fsApi).readFile = vi.fn().mockResolvedValue('binary')
      useWorkspaceStore.setState({ language: 'typescript' })
      await useWorkspaceStore.getState().openFile('/project/data.bin')
      expect(useWorkspaceStore.getState().language).toBe('typescript')
      vi.mocked(fsApi).readFile = vi.fn().mockResolvedValue('file content')
    })

    it('handles file with no extension', async () => {
      resetStore()

      vi.mocked(fsApi).readFile = vi.fn().mockResolvedValue('makefile content')
      useWorkspaceStore.setState({ language: 'typescript' })
      await useWorkspaceStore.getState().openFile('/project/Makefile')
      expect(useWorkspaceStore.getState().language).toBe('typescript')
      vi.mocked(fsApi).readFile = vi.fn().mockResolvedValue('file content')
    })
  })

  describe('closeFile secondary pane integration', () => {
    it('clears secondary pane when closed file was in it', async () => {
      resetStore()

      const mockSetPaneFile = vi.fn()
      vi.mocked(useSplitPaneStore).getState = vi.fn().mockReturnValue({
        paneFiles: { secondary: '/project/a.ts' },
        setPaneFile: mockSetPaneFile,
      })
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts'],
        currentFile: '/project/a.ts',
        fileContents: new Map([['/project/a.ts', 'a'], ['/project/b.ts', 'b']]),
        dirtyFiles: new Set<string>(),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts'],
        previewTab: null,
      })
      useWorkspaceStore.getState().closeFile('/project/a.ts')
      expect(mockSetPaneFile).toHaveBeenCalledWith('secondary', null)
      // Restore
      vi.mocked(useSplitPaneStore).getState = vi.fn().mockReturnValue({
        paneFiles: { secondary: null },
        setPaneFile: vi.fn(),
      })
    })

    it('does not clear secondary pane when closed file was not in it', async () => {
      resetStore()

      const mockSetPaneFile = vi.fn()
      vi.mocked(useSplitPaneStore).getState = vi.fn().mockReturnValue({
        paneFiles: { secondary: '/project/c.ts' },
        setPaneFile: mockSetPaneFile,
      })
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts'],
        currentFile: '/project/a.ts',
        fileContents: new Map([['/project/a.ts', 'a'], ['/project/b.ts', 'b']]),
        dirtyFiles: new Set<string>(),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts'],
        previewTab: null,
      })
      useWorkspaceStore.getState().closeFile('/project/a.ts')
      expect(mockSetPaneFile).not.toHaveBeenCalled()
      // Restore
      vi.mocked(useSplitPaneStore).getState = vi.fn().mockReturnValue({
        paneFiles: { secondary: null },
        setPaneFile: vi.fn(),
      })
    })

    it('focuses left neighbor when closing rightmost tab', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts'],
        currentFile: '/project/b.ts',
        fileContents: new Map([['/project/a.ts', 'a'], ['/project/b.ts', 'b']]),
        dirtyFiles: new Set<string>(),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts'],
        previewTab: null,
      })
      useWorkspaceStore.getState().closeFile('/project/b.ts')
      expect(useWorkspaceStore.getState().currentFile).toBe('/project/a.ts')
    })

    it('clears previewTab when closing preview file', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts'],
        currentFile: '/project/a.ts',
        fileContents: new Map([['/project/a.ts', 'a']]),
        dirtyFiles: new Set<string>(),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts'],
        previewTab: '/project/a.ts',
      })
      useWorkspaceStore.getState().closeFile('/project/a.ts')
      expect(useWorkspaceStore.getState().previewTab).toBeNull()
    })
  })

  describe('renameFileInStore secondary pane', () => {
    it('updates secondary pane when renamed file was in it', async () => {
      resetStore()

      const mockSetPaneFile = vi.fn()
      vi.mocked(useSplitPaneStore).getState = vi.fn().mockReturnValue({
        paneFiles: { secondary: '/project/old.ts' },
        setPaneFile: mockSetPaneFile,
      })
      useWorkspaceStore.setState({
        openFiles: ['/project/old.ts'],
        fileContents: new Map([['/project/old.ts', 'content']]),
        currentFile: '/project/old.ts',
        dirtyFiles: new Set<string>(),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/old.ts'],
      })
      useWorkspaceStore.getState().renameFileInStore('/project/old.ts', '/project/new.ts')
      expect(mockSetPaneFile).toHaveBeenCalledWith('secondary', '/project/new.ts')
      // Restore
      vi.mocked(useSplitPaneStore).getState = vi.fn().mockReturnValue({
        paneFiles: { secondary: null },
        setPaneFile: vi.fn(),
      })
    })

    it('updates recentlyClosedFiles paths on rename', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/old.ts'],
        fileContents: new Map([['/project/old.ts', 'content']]),
        currentFile: '/project/old.ts',
        dirtyFiles: new Set<string>(),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [{ path: '/project/old.ts', content: 'old', wasDirty: false }],
        mruOrder: ['/project/old.ts'],
      })
      useWorkspaceStore.getState().renameFileInStore('/project/old.ts', '/project/new.ts')
      expect(useWorkspaceStore.getState().recentlyClosedFiles[0].path).toBe('/project/new.ts')
    })

    it('does not update secondary pane when renamed file was not in it', async () => {
      resetStore()

      const mockSetPaneFile = vi.fn()
      vi.mocked(useSplitPaneStore).getState = vi.fn().mockReturnValue({
        paneFiles: { secondary: '/project/other.ts' },
        setPaneFile: mockSetPaneFile,
      })
      useWorkspaceStore.setState({
        openFiles: ['/project/old.ts'],
        fileContents: new Map([['/project/old.ts', 'content']]),
        currentFile: '/project/old.ts',
        dirtyFiles: new Set<string>(),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/old.ts'],
      })
      useWorkspaceStore.getState().renameFileInStore('/project/old.ts', '/project/new.ts')
      expect(mockSetPaneFile).not.toHaveBeenCalled()
      // Restore
      vi.mocked(useSplitPaneStore).getState = vi.fn().mockReturnValue({
        paneFiles: { secondary: null },
        setPaneFile: vi.fn(),
      })
    })

    it('does not change currentFile when renaming a different file', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts'],
        fileContents: new Map([['/project/a.ts', 'a'], ['/project/b.ts', 'b']]),
        currentFile: '/project/a.ts',
        dirtyFiles: new Set<string>(),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts'],
      })
      useWorkspaceStore.getState().renameFileInStore('/project/b.ts', '/project/c.ts')
      expect(useWorkspaceStore.getState().currentFile).toBe('/project/a.ts')
    })
  })

  describe('closeAllFiles secondary pane integration', () => {
    it('clears secondary pane when its file is among closed', async () => {
      resetStore()

      const mockSetPaneFile = vi.fn()
      vi.mocked(useSplitPaneStore).getState = vi.fn().mockReturnValue({
        paneFiles: { secondary: '/project/b.ts' },
        setPaneFile: mockSetPaneFile,
      })
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts'],
        fileContents: new Map([['/project/a.ts', 'a'], ['/project/b.ts', 'b']]),
        currentFile: '/project/a.ts',
        dirtyFiles: new Set<string>(),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts'],
      })
      useWorkspaceStore.getState().closeAllFiles()
      expect(mockSetPaneFile).toHaveBeenCalledWith('secondary', null)
      // Restore
      vi.mocked(useSplitPaneStore).getState = vi.fn().mockReturnValue({
        paneFiles: { secondary: null },
        setPaneFile: vi.fn(),
      })
    })

    it('keeps pinned dirty files content and dirty state', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts'],
        fileContents: new Map([['/project/a.ts', 'dirty a'], ['/project/b.ts', 'clean b']]),
        currentFile: '/project/a.ts',
        dirtyFiles: new Set(['/project/a.ts']),
        pinnedFiles: new Set(['/project/a.ts']),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts'],
      })
      useWorkspaceStore.getState().closeAllFiles()
      const state = useWorkspaceStore.getState()
      expect(state.openFiles).toEqual(['/project/a.ts'])
      expect(state.fileContents.get('/project/a.ts')).toBe('dirty a')
      expect(state.dirtyFiles.has('/project/a.ts')).toBe(true)
    })
  })

  describe('closeOthers edge cases', () => {
    it('switches currentFile to kept file when current is closed', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
        fileContents: new Map([['/project/a.ts', 'a'], ['/project/b.ts', 'b'], ['/project/c.ts', 'c']]),
        currentFile: '/project/a.ts',
        dirtyFiles: new Set<string>(),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
      })
      useWorkspaceStore.getState().closeOthers('/project/b.ts')
      expect(useWorkspaceStore.getState().currentFile).toBe('/project/b.ts')
    })

    it('clears secondary pane when its file is closed', async () => {
      resetStore()

      const mockSetPaneFile = vi.fn()
      vi.mocked(useSplitPaneStore).getState = vi.fn().mockReturnValue({
        paneFiles: { secondary: '/project/a.ts' },
        setPaneFile: mockSetPaneFile,
      })
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts'],
        fileContents: new Map([['/project/a.ts', 'a'], ['/project/b.ts', 'b']]),
        currentFile: '/project/b.ts',
        dirtyFiles: new Set<string>(),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts'],
      })
      useWorkspaceStore.getState().closeOthers('/project/b.ts')
      expect(mockSetPaneFile).toHaveBeenCalledWith('secondary', null)
      // Restore
      vi.mocked(useSplitPaneStore).getState = vi.fn().mockReturnValue({
        paneFiles: { secondary: null },
        setPaneFile: vi.fn(),
      })
    })

    it('preserves dirty files that are not the kept file', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
        fileContents: new Map([['/project/a.ts', 'dirty a'], ['/project/b.ts', 'b'], ['/project/c.ts', 'c']]),
        currentFile: '/project/b.ts',
        dirtyFiles: new Set(['/project/a.ts']),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
      })
      useWorkspaceStore.getState().closeOthers('/project/b.ts')
      const state = useWorkspaceStore.getState()
      expect(state.openFiles).toContain('/project/a.ts')
      expect(state.openFiles).toContain('/project/b.ts')
      expect(state.dirtyFiles.has('/project/a.ts')).toBe(true)
    })
  })

  describe('closeToLeft edge cases', () => {
    it('does nothing when keepIndex is 0', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
        fileContents: new Map([['/project/a.ts', 'a'], ['/project/b.ts', 'b'], ['/project/c.ts', 'c']]),
        currentFile: '/project/b.ts',
        dirtyFiles: new Set<string>(),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
      })
      useWorkspaceStore.getState().closeToLeft('/project/a.ts')
      expect(useWorkspaceStore.getState().openFiles).toHaveLength(3)
    })

    it('clears secondary pane when its file is closed to left', async () => {
      resetStore()

      const mockSetPaneFile = vi.fn()
      vi.mocked(useSplitPaneStore).getState = vi.fn().mockReturnValue({
        paneFiles: { secondary: '/project/a.ts' },
        setPaneFile: mockSetPaneFile,
      })
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
        fileContents: new Map([['/project/a.ts', 'a'], ['/project/b.ts', 'b'], ['/project/c.ts', 'c']]),
        currentFile: '/project/b.ts',
        dirtyFiles: new Set<string>(),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
      })
      useWorkspaceStore.getState().closeToLeft('/project/c.ts')
      expect(mockSetPaneFile).toHaveBeenCalledWith('secondary', null)
      // Restore
      vi.mocked(useSplitPaneStore).getState = vi.fn().mockReturnValue({
        paneFiles: { secondary: null },
        setPaneFile: vi.fn(),
      })
    })

    it('preserves pinned files to the left', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
        fileContents: new Map([['/project/a.ts', 'a'], ['/project/b.ts', 'b'], ['/project/c.ts', 'c']]),
        currentFile: '/project/c.ts',
        dirtyFiles: new Set<string>(),
        pinnedFiles: new Set(['/project/a.ts']),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
      })
      useWorkspaceStore.getState().closeToLeft('/project/c.ts')
      const state = useWorkspaceStore.getState()
      expect(state.openFiles).toContain('/project/a.ts')
      expect(state.openFiles).toContain('/project/c.ts')
      expect(state.openFiles).not.toContain('/project/b.ts')
    })

    it('preserves dirty files to the left', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
        fileContents: new Map([['/project/a.ts', 'a'], ['/project/b.ts', 'b'], ['/project/c.ts', 'c']]),
        currentFile: '/project/c.ts',
        dirtyFiles: new Set(['/project/a.ts']),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
      })
      useWorkspaceStore.getState().closeToLeft('/project/c.ts')
      const state = useWorkspaceStore.getState()
      expect(state.openFiles).toContain('/project/a.ts')
      expect(state.openFiles).toContain('/project/c.ts')
      expect(state.openFiles).not.toContain('/project/b.ts')
    })

    it('switches currentFile to kept file when current is closed', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
        fileContents: new Map([['/project/a.ts', 'a'], ['/project/b.ts', 'b'], ['/project/c.ts', 'c']]),
        currentFile: '/project/a.ts',
        dirtyFiles: new Set<string>(),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
      })
      useWorkspaceStore.getState().closeToLeft('/project/c.ts')
      expect(useWorkspaceStore.getState().currentFile).toBe('/project/c.ts')
    })

    it('auto-pins the kept file', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
        fileContents: new Map([['/project/a.ts', 'a'], ['/project/b.ts', 'b'], ['/project/c.ts', 'c']]),
        currentFile: '/project/c.ts',
        dirtyFiles: new Set<string>(),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
      })
      useWorkspaceStore.getState().closeToLeft('/project/c.ts')
      expect(useWorkspaceStore.getState().pinnedFiles.has('/project/c.ts')).toBe(true)
    })
  })

  describe('closeToRight edge cases', () => {
    it('does nothing when keepPath is last file', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts'],
        fileContents: new Map([['/project/a.ts', 'a'], ['/project/b.ts', 'b']]),
        currentFile: '/project/a.ts',
        dirtyFiles: new Set<string>(),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts'],
      })
      useWorkspaceStore.getState().closeToRight('/project/b.ts')
      expect(useWorkspaceStore.getState().openFiles).toHaveLength(2)
    })

    it('does nothing when keepPath not found', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts'],
        fileContents: new Map([['/project/a.ts', 'a']]),
        currentFile: '/project/a.ts',
        dirtyFiles: new Set<string>(),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts'],
      })
      useWorkspaceStore.getState().closeToRight('/project/nonexistent.ts')
      expect(useWorkspaceStore.getState().openFiles).toHaveLength(1)
    })

    it('clears secondary pane when its file is closed to right', async () => {
      resetStore()

      const mockSetPaneFile = vi.fn()
      vi.mocked(useSplitPaneStore).getState = vi.fn().mockReturnValue({
        paneFiles: { secondary: '/project/c.ts' },
        setPaneFile: mockSetPaneFile,
      })
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
        fileContents: new Map([['/project/a.ts', 'a'], ['/project/b.ts', 'b'], ['/project/c.ts', 'c']]),
        currentFile: '/project/a.ts',
        dirtyFiles: new Set<string>(),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
      })
      useWorkspaceStore.getState().closeToRight('/project/a.ts')
      expect(mockSetPaneFile).toHaveBeenCalledWith('secondary', null)
      // Restore
      vi.mocked(useSplitPaneStore).getState = vi.fn().mockReturnValue({
        paneFiles: { secondary: null },
        setPaneFile: vi.fn(),
      })
    })

    it('preserves pinned files to the right', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
        fileContents: new Map([['/project/a.ts', 'a'], ['/project/b.ts', 'b'], ['/project/c.ts', 'c']]),
        currentFile: '/project/a.ts',
        dirtyFiles: new Set<string>(),
        pinnedFiles: new Set(['/project/c.ts']),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
      })
      useWorkspaceStore.getState().closeToRight('/project/a.ts')
      const state = useWorkspaceStore.getState()
      expect(state.openFiles).toContain('/project/a.ts')
      expect(state.openFiles).toContain('/project/c.ts')
      expect(state.openFiles).not.toContain('/project/b.ts')
    })

    it('preserves dirty files to the right', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
        fileContents: new Map([['/project/a.ts', 'a'], ['/project/b.ts', 'b'], ['/project/c.ts', 'c']]),
        currentFile: '/project/a.ts',
        dirtyFiles: new Set(['/project/c.ts']),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
      })
      useWorkspaceStore.getState().closeToRight('/project/a.ts')
      const state = useWorkspaceStore.getState()
      expect(state.openFiles).toContain('/project/a.ts')
      expect(state.openFiles).toContain('/project/c.ts')
      expect(state.openFiles).not.toContain('/project/b.ts')
    })

    it('switches currentFile to kept file when current is closed', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
        fileContents: new Map([['/project/a.ts', 'a'], ['/project/b.ts', 'b'], ['/project/c.ts', 'c']]),
        currentFile: '/project/c.ts',
        dirtyFiles: new Set<string>(),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
      })
      useWorkspaceStore.getState().closeToRight('/project/a.ts')
      expect(useWorkspaceStore.getState().currentFile).toBe('/project/a.ts')
    })

    it('auto-pins the kept file', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
        fileContents: new Map([['/project/a.ts', 'a'], ['/project/b.ts', 'b'], ['/project/c.ts', 'c']]),
        currentFile: '/project/a.ts',
        dirtyFiles: new Set<string>(),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
      })
      useWorkspaceStore.getState().closeToRight('/project/a.ts')
      expect(useWorkspaceStore.getState().pinnedFiles.has('/project/a.ts')).toBe(true)
    })
  })

  describe('closeSaved edge cases', () => {
    it('sets currentFile to last remaining when current was closed', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
        fileContents: new Map([['/project/a.ts', 'a'], ['/project/b.ts', 'dirty b'], ['/project/c.ts', 'c']]),
        currentFile: '/project/a.ts',
        dirtyFiles: new Set(['/project/b.ts']),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
      })
      useWorkspaceStore.getState().closeSaved()
      expect(useWorkspaceStore.getState().currentFile).toBe('/project/b.ts')
    })

    it('keeps currentFile when it is a dirty file', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts'],
        fileContents: new Map([['/project/a.ts', 'dirty a'], ['/project/b.ts', 'b']]),
        currentFile: '/project/a.ts',
        dirtyFiles: new Set(['/project/a.ts']),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts'],
      })
      useWorkspaceStore.getState().closeSaved()
      expect(useWorkspaceStore.getState().currentFile).toBe('/project/a.ts')
    })

    it('clears secondary pane when its file is closed', async () => {
      resetStore()

      const mockSetPaneFile = vi.fn()
      vi.mocked(useSplitPaneStore).getState = vi.fn().mockReturnValue({
        paneFiles: { secondary: '/project/c.ts' },
        setPaneFile: mockSetPaneFile,
      })
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
        fileContents: new Map([['/project/a.ts', 'a'], ['/project/b.ts', 'dirty b'], ['/project/c.ts', 'c']]),
        currentFile: '/project/b.ts',
        dirtyFiles: new Set(['/project/b.ts']),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
      })
      useWorkspaceStore.getState().closeSaved()
      expect(mockSetPaneFile).toHaveBeenCalledWith('secondary', null)
      // Restore
      vi.mocked(useSplitPaneStore).getState = vi.fn().mockReturnValue({
        paneFiles: { secondary: null },
        setPaneFile: vi.fn(),
      })
    })

    it('sets currentFile to null when all files are saved', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts'],
        fileContents: new Map([['/project/a.ts', 'a'], ['/project/b.ts', 'b']]),
        currentFile: '/project/a.ts',
        dirtyFiles: new Set<string>(),
        pinnedFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: ['/project/a.ts', '/project/b.ts'],
      })
      useWorkspaceStore.getState().closeSaved()
      expect(useWorkspaceStore.getState().currentFile).toBeNull()
    })
  })

  describe('undoCloseFile edge cases', () => {
    it('does not reopen if file is already open', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts'],
        fileContents: new Map([['/project/a.ts', 'a']]),
        dirtyFiles: new Set<string>(),
        recentlyClosedFiles: [{ path: '/project/a.ts', content: 'a', wasDirty: false }],
        mruOrder: ['/project/a.ts'],
      })
      await useWorkspaceStore.getState().undoCloseFile()
      expect(useWorkspaceStore.getState().openFiles).toEqual(['/project/a.ts'])
      expect(useWorkspaceStore.getState().recentlyClosedFiles).toHaveLength(0)
    })

    it('restores dirty state on undo', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: [],
        fileContents: new Map<string, string>(),
        dirtyFiles: new Set<string>(),
        recentlyClosedFiles: [{ path: '/project/a.ts', content: 'dirty content', wasDirty: true }],
        mruOrder: [],
      })
      await useWorkspaceStore.getState().undoCloseFile()
      const state = useWorkspaceStore.getState()
      expect(state.dirtyFiles.has('/project/a.ts')).toBe(true)
      expect(state.fileContents.get('/project/a.ts')).toBe('dirty content')
      expect(state.mruOrder).toContain('/project/a.ts')
    })
  })

  describe('undoCloseFiles edge cases', () => {
    it('skips files that are already open', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts'],
        fileContents: new Map([['/project/a.ts', 'a']]),
        dirtyFiles: new Set<string>(),
        recentlyClosedFiles: [
          { path: '/project/a.ts', content: 'old a', wasDirty: false },
          { path: '/project/b.ts', content: 'b', wasDirty: false },
        ],
        mruOrder: ['/project/a.ts'],
      })
      await useWorkspaceStore.getState().undoCloseFiles()
      const state = useWorkspaceStore.getState()
      // a.ts was already open, so its entry stays in recentlyClosedFiles
      expect(state.openFiles).toEqual(['/project/a.ts', '/project/b.ts'])
      expect(state.currentFile).toBe('/project/b.ts')
      expect(state.recentlyClosedFiles).toHaveLength(1)
      expect(state.recentlyClosedFiles[0].path).toBe('/project/a.ts')
    })

    it('handles empty recentlyClosedFiles', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: [],
        fileContents: new Map<string, string>(),
        dirtyFiles: new Set<string>(),
        recentlyClosedFiles: [],
        mruOrder: [],
        currentFile: null,
      })
      await useWorkspaceStore.getState().undoCloseFiles()
      expect(useWorkspaceStore.getState().openFiles).toHaveLength(0)
    })

    it('restores dirty state for multiple files', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: [],
        fileContents: new Map<string, string>(),
        dirtyFiles: new Set<string>(),
        recentlyClosedFiles: [
          { path: '/project/a.ts', content: 'dirty a', wasDirty: true },
          { path: '/project/b.ts', content: 'clean b', wasDirty: false },
        ],
        mruOrder: [],
      })
      await useWorkspaceStore.getState().undoCloseFiles()
      const state = useWorkspaceStore.getState()
      expect(state.dirtyFiles.has('/project/a.ts')).toBe(true)
      expect(state.dirtyFiles.has('/project/b.ts')).toBe(false)
    })
  })

  describe('reorderFiles pinned area boundaries', () => {
    it('prevents pinned tab from moving into unpinned area', () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/pinned.ts', '/project/unpinned.ts'],
        pinnedFiles: new Set(['/project/pinned.ts']),
        fileContents: new Map([['/project/pinned.ts', 'p'], ['/project/unpinned.ts', 'u']]),
      })
      // Try to move pinned tab to index 1 (unpinned area)
      useWorkspaceStore.getState().reorderFiles(0, 1)
      expect(useWorkspaceStore.getState().openFiles).toEqual(['/project/pinned.ts', '/project/unpinned.ts'])
    })

    it('prevents unpinned tab from moving into pinned area', () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/pinned.ts', '/project/unpinned.ts'],
        pinnedFiles: new Set(['/project/pinned.ts']),
        fileContents: new Map([['/project/pinned.ts', 'p'], ['/project/unpinned.ts', 'u']]),
      })
      // Try to move unpinned tab to index 0 (pinned area)
      useWorkspaceStore.getState().reorderFiles(1, 0)
      expect(useWorkspaceStore.getState().openFiles).toEqual(['/project/pinned.ts', '/project/unpinned.ts'])
    })

    it('allows reordering within pinned area', () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts', '/project/b.ts', '/project/c.ts'],
        pinnedFiles: new Set(['/project/a.ts', '/project/b.ts']),
        fileContents: new Map([['/project/a.ts', 'a'], ['/project/b.ts', 'b'], ['/project/c.ts', 'c']]),
      })
      // Move a.ts (pinned) to index 1 (still in pinned area: 0..1)
      useWorkspaceStore.getState().reorderFiles(0, 1)
      expect(useWorkspaceStore.getState().openFiles).toEqual(['/project/b.ts', '/project/a.ts', '/project/c.ts'])
    })

    it('allows reordering within unpinned area', () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/pinned.ts', '/project/a.ts', '/project/b.ts'],
        pinnedFiles: new Set(['/project/pinned.ts']),
        fileContents: new Map([['/project/pinned.ts', 'p'], ['/project/a.ts', 'a'], ['/project/b.ts', 'b']]),
      })
      // Move a.ts (unpinned, index 1) to index 2 (still unpinned area: 1+)
      useWorkspaceStore.getState().reorderFiles(1, 2)
      expect(useWorkspaceStore.getState().openFiles).toEqual(['/project/pinned.ts', '/project/b.ts', '/project/a.ts'])
    })
  })

  describe('updateFileContent MRU', () => {
    it('adds path to MRU if not already present', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts'],
        fileContents: new Map([['/project/a.ts', 'a']]),
        dirtyFiles: new Set<string>(),
        mruOrder: [],
        previewTab: null,
      })
      useWorkspaceStore.getState().updateFileContent('/project/a.ts', 'edited')
      expect(useWorkspaceStore.getState().mruOrder).toContain('/project/a.ts')
    })

    it('does not duplicate path in MRU if already present', async () => {
      resetStore()
      useWorkspaceStore.setState({
        openFiles: ['/project/a.ts'],
        fileContents: new Map([['/project/a.ts', 'a']]),
        dirtyFiles: new Set<string>(),
        mruOrder: ['/project/a.ts'],
        previewTab: null,
      })
      useWorkspaceStore.getState().updateFileContent('/project/a.ts', 'edited')
      const mru = useWorkspaceStore.getState().mruOrder
      expect(mru.filter(p => p === '/project/a.ts')).toHaveLength(1)
    })
  })

  describe('openFile error handling', () => {
    it('handles readFile error gracefully', async () => {
      resetStore()

      vi.mocked(fsApi).readFile = vi.fn().mockRejectedValue(new Error('read failed'))
      useWorkspaceStore.setState({ workspacePath: '/project' })
      await useWorkspaceStore.getState().openFile('/project/broken.ts')
      expect(useWorkspaceStore.getState().loading).toBe(false)
      expect(useWorkspaceStore.getState().openFiles).not.toContain('/project/broken.ts')
      // Restore
      vi.mocked(fsApi).readFile = vi.fn().mockResolvedValue('file content')
    })
  })

  describe('openFile existing file branch', () => {
    it('switching to existing file updates MRU even in preview', async () => {
      resetStore()
      // Open a.ts permanently (non-preview)
      await useWorkspaceStore.getState().openFile('/project/a.ts', { preview: false })
      // Open b.ts as preview
      await useWorkspaceStore.getState().openFile('/project/b.ts', { preview: true })
      // Switch back to a.ts via openFile (already open, preview=true)
      await useWorkspaceStore.getState().openFile('/project/a.ts', { preview: true })
      const state = useWorkspaceStore.getState()
      expect(state.currentFile).toBe('/project/a.ts')
      expect(state.mruOrder).toContain('/project/a.ts')
    })

    it('switching to existing preview tab keeps it as preview', async () => {
      resetStore()
      await useWorkspaceStore.getState().openFile('/project/a.ts', { preview: true })
      // Switch back to same file with preview
      await useWorkspaceStore.getState().openFile('/project/a.ts', { preview: true })
      expect(useWorkspaceStore.getState().previewTab).toBe('/project/a.ts')
    })

    it('switching to existing non-preview clears preview if it was preview', async () => {
      resetStore()
      await useWorkspaceStore.getState().openFile('/project/a.ts', { preview: true })
      expect(useWorkspaceStore.getState().previewTab).toBe('/project/a.ts')
      // Pin it via non-preview open
      await useWorkspaceStore.getState().openFile('/project/a.ts', { preview: false })
      expect(useWorkspaceStore.getState().previewTab).toBeNull()
    })
  })
})
