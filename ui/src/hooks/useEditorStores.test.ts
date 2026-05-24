import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useEditorStores } from './useEditorStores'
import { useAppStore } from '../store/appStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useSplitPaneStore } from '../stores/splitPaneStore'

const mockAppStore = {
  swarms: [],
  addToast: vi.fn(),
  updateFileProblems: vi.fn(),
  workspaceProblems: [],
  editorCursorPosition: { line: 1, column: 1 },
}

vi.mock('../store/appStore', () => ({
  useAppStore: vi.fn(),
}))

const mockWorkspaceStore = {
  openFiles: [],
  currentFile: null,
  fileContents: {},
  dirtyFiles: new Set<string>(),
  pinnedFiles: new Set<string>(),
  previewTab: null,
  language: 'typescript',
  openFile: vi.fn(),
  closeFile: vi.fn(),
  closeAllFiles: vi.fn(),
  closeOthers: vi.fn(),
  closeToLeft: vi.fn(),
  closeToRight: vi.fn(),
  closeSaved: vi.fn(),
  reorderFiles: vi.fn(),
  undoCloseFile: vi.fn(),
  togglePin: vi.fn(),
  updateFileContent: vi.fn(),
  clearDirty: vi.fn(),
  setLanguage: vi.fn(),
}

vi.mock('../stores/workspaceStore', () => ({
  useWorkspaceStore: vi.fn(),
}))

const mockSplitPaneStore = {
  splitDirection: 'horizontal' as const,
  activePaneId: 'main' as const,
  setActivePane: vi.fn(),
  toggleSplit: vi.fn(),
  closeSplit: vi.fn(),
  paneFiles: { main: [] },
  setPaneFile: vi.fn(),
}

vi.mock('../stores/splitPaneStore', () => ({
  useSplitPaneStore: vi.fn(),
}))

vi.mock('./useSettings', () => ({
  useSettings: () => ({
    settings: { fontSize: 14, fontFamily: 'monospace', tabSize: 2, wordWrap: 'off', lineNumbers: true, autoSave: false },
    updateSetting: vi.fn(),
  }),
}))

vi.mock('./useTheme', () => ({
  useTheme: () => ({ effectiveTheme: 'dark' }),
}))

function mockStores() {
  ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (sel?: (s: any) => any) => sel ? sel(mockAppStore) : mockAppStore
  )
  ;(useWorkspaceStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (sel?: (s: any) => any) => sel ? sel(mockWorkspaceStore) : mockWorkspaceStore
  )
  ;(useSplitPaneStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (sel?: (s: any) => any) => sel ? sel(mockSplitPaneStore) : mockSplitPaneStore
  )
}

describe('useEditorStores', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStores()
  })

  it('returns swarms from appStore', () => {
    const { result } = renderHook(() => useEditorStores())
    expect(result.current.swarms).toEqual([])
  })

  it('returns settings and updateSetting', () => {
    const { result } = renderHook(() => useEditorStores())
    expect(result.current.settings.fontSize).toBe(14)
    expect(typeof result.current.updateSetting).toBe('function')
  })

  it('returns effectiveTheme', () => {
    const { result } = renderHook(() => useEditorStores())
    expect(result.current.effectiveTheme).toBe('dark')
  })

  it('returns workspace file state', () => {
    const { result } = renderHook(() => useEditorStores())
    expect(result.current.openFiles).toEqual([])
    expect(result.current.currentFile).toBeNull()
    expect(result.current.fileContents).toEqual({})
  })

  it('returns workspace actions', () => {
    const { result } = renderHook(() => useEditorStores())
    expect(typeof result.current.openFileFromStore).toBe('function')
    expect(typeof result.current.closeFile).toBe('function')
    expect(typeof result.current.closeAllFiles).toBe('function')
    expect(typeof result.current.reorderFiles).toBe('function')
  })

  it('returns split pane state', () => {
    const { result } = renderHook(() => useEditorStores())
    expect(result.current.splitDirection).toBe('horizontal')
    expect(result.current.activePaneId).toBe('main')
  })

  it('returns split pane actions', () => {
    const { result } = renderHook(() => useEditorStores())
    expect(typeof result.current.setActivePane).toBe('function')
    expect(typeof result.current.toggleSplit).toBe('function')
    expect(typeof result.current.closeSplit).toBe('function')
    expect(typeof result.current.setPaneFile).toBe('function')
  })

  it('returns cursor position', () => {
    const { result } = renderHook(() => useEditorStores())
    expect(result.current.cursorPosition).toEqual({ line: 1, column: 1 })
  })
})
