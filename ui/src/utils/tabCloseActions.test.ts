import { describe, it, expect, vi } from 'vitest'
import { showCloseToast, autoSaveDirtyFiles, saveSingleFile } from './tabCloseActions'

vi.mock('../services', () => ({
  api: {
    fs: {
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
  },
}))

vi.mock('../stores/workspaceStore', () => ({
  useWorkspaceStore: {
    getState: vi.fn(() => ({
      undoCloseFiles: vi.fn(),
    })),
  },
}))

describe('showCloseToast', () => {
  it('shows toast with count and undo action when count > 0', () => {
    const addToast = vi.fn()
    showCloseToast({ count: 3, label: 'Tabs', addToast })
    expect(addToast).toHaveBeenCalledWith('info', 'Tabs closed', '3 tabs closed', expect.objectContaining({
      actions: expect.arrayContaining([
        expect.objectContaining({ label: 'Undo' }),
      ]),
    }))
  })

  it('uses singular form for count=1', () => {
    const addToast = vi.fn()
    showCloseToast({ count: 1, label: 'Tab', addToast })
    expect(addToast).toHaveBeenCalledWith('info', 'Tab closed', '1 tab closed', expect.any(Object))
  })

  it('does nothing when count=0', () => {
    const addToast = vi.fn()
    showCloseToast({ count: 0, label: 'Tabs', addToast })
    expect(addToast).not.toHaveBeenCalled()
  })
})

describe('saveSingleFile', () => {
  it('writes content and clears dirty state', async () => {
    const { api } = await import('../services')
    const clearDirty = vi.fn()
    const addToast = vi.fn()
    const contents = new Map([['/a.ts', 'content']])

    saveSingleFile({ path: '/a.ts', fileContents: contents, clearDirty, addToast })

    expect(api.fs.writeFile).toHaveBeenCalledWith('/a.ts', 'content')
    // clearDirty called synchronously (fire-and-forget write)
    expect(clearDirty).toHaveBeenCalledWith('/a.ts')
    expect(addToast).not.toHaveBeenCalled()
  })

  it('skips files with no content in map', () => {
    const clearDirty = vi.fn()
    const addToast = vi.fn()
    const contents = new Map<string, string>()

    saveSingleFile({ path: '/missing.ts', fileContents: contents, clearDirty, addToast })

    expect(clearDirty).not.toHaveBeenCalled()
    expect(addToast).not.toHaveBeenCalled()
  })

  it('shows error toast when write fails', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.writeFile).mockRejectedValueOnce(new Error('disk full'))
    const clearDirty = vi.fn()
    const addToast = vi.fn()
    const contents = new Map([['/fail.ts', 'x']])

    saveSingleFile({ path: '/fail.ts', fileContents: contents, clearDirty, addToast })

    // Wait for rejected promise to trigger catch
    await vi.waitFor(() => {
      expect(addToast).toHaveBeenCalledWith('error', 'Auto-save failed', expect.stringContaining('disk full'))
    })
  })
})

describe('autoSaveDirtyFiles', () => {
  it('saves all dirty files and refreshes git status', () => {
    const clearDirty = vi.fn()
    const fetchGitStatus = vi.fn()
    const addToast = vi.fn()
    const contents = new Map([
      ['/a.ts', 'content-a'],
      ['/b.ts', 'content-b'],
    ])

    autoSaveDirtyFiles({
      paths: ['/a.ts', '/b.ts'],
      fileContents: contents,
      clearDirty,
      fetchGitStatus,
      addToast,
    })

    expect(clearDirty).toHaveBeenCalledTimes(2)
    expect(fetchGitStatus).toHaveBeenCalledTimes(1)
  })

  it('does nothing when paths is empty', () => {
    const fetchGitStatus = vi.fn()
    autoSaveDirtyFiles({
      paths: [],
      fileContents: new Map(),
      clearDirty: vi.fn(),
      fetchGitStatus,
      addToast: vi.fn(),
    })
    expect(fetchGitStatus).not.toHaveBeenCalled()
  })
})
