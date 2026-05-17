import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../services/api', () => ({
  fsApi: {
    getWorkspace: vi.fn().mockResolvedValue('/project'),
    listDir: vi.fn().mockResolvedValue([
      { name: 'src', path: '/project/src', isDirectory: true },
      { name: 'index.ts', path: '/project/index.ts', isDirectory: false },
    ]),
    readFile: vi.fn().mockResolvedValue('file content'),
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
})
