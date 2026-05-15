import { useAppStore } from '../store/appStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useSplitPaneStore } from '../stores/splitPaneStore'
import { useSettings } from './useSettings'
import { useTheme } from './useTheme'

/**
 * Consolidates all Zustand store selectors used by EditorPanel.
 * Keeps the component body clean — one destructuring call replaces ~65 lines of selectors.
 */
export function useEditorStores() {
  const swarms = useAppStore(state => state.swarms)
  const addToast = useAppStore(state => state.addToast)
  const updateFileProblems = useAppStore(state => state.updateFileProblems)
  const workspaceProblems = useAppStore(state => state.workspaceProblems)
  const { settings, updateSetting } = useSettings()
  const { effectiveTheme } = useTheme()
  const cursorPosition = useAppStore(state => state.editorCursorPosition)

  const openFiles = useWorkspaceStore(state => state.openFiles)
  const currentFile = useWorkspaceStore(state => state.currentFile)
  const fileContents = useWorkspaceStore(state => state.fileContents)
  const dirtyFiles = useWorkspaceStore(state => state.dirtyFiles)
  const pinnedFiles = useWorkspaceStore(state => state.pinnedFiles)
  const previewTab = useWorkspaceStore(state => state.previewTab)
  const wsLanguage = useWorkspaceStore(state => state.language)
  const openFileFromStore = useWorkspaceStore(state => state.openFile)
  const closeFile = useWorkspaceStore(state => state.closeFile)
  const closeAllFiles = useWorkspaceStore(state => state.closeAllFiles)
  const closeOthers = useWorkspaceStore(state => state.closeOthers)
  const closeToLeft = useWorkspaceStore(state => state.closeToLeft)
  const closeToRight = useWorkspaceStore(state => state.closeToRight)
  const closeSaved = useWorkspaceStore(state => state.closeSaved)
  const reorderFiles = useWorkspaceStore(state => state.reorderFiles)
  const undoCloseFile = useWorkspaceStore(state => state.undoCloseFile)
  const togglePin = useWorkspaceStore(state => state.togglePin)
  const updateFileContent = useWorkspaceStore(state => state.updateFileContent)
  const clearDirty = useWorkspaceStore(state => state.clearDirty)
  const setLanguage = useWorkspaceStore(state => state.setLanguage)

  const splitDirection = useSplitPaneStore(s => s.splitDirection)
  const activePaneId = useSplitPaneStore(s => s.activePaneId)
  const setActivePane = useSplitPaneStore(s => s.setActivePane)
  const toggleSplit = useSplitPaneStore(s => s.toggleSplit)
  const closeSplit = useSplitPaneStore(s => s.closeSplit)
  const paneFiles = useSplitPaneStore(s => s.paneFiles)
  const setPaneFile = useSplitPaneStore(s => s.setPaneFile)

  return {
    swarms, addToast, updateFileProblems, workspaceProblems,
    settings, updateSetting, effectiveTheme, cursorPosition,
    openFiles, currentFile, fileContents, dirtyFiles, pinnedFiles,
    previewTab, wsLanguage, openFileFromStore, closeFile,
    closeAllFiles, closeOthers, closeToLeft, closeToRight, closeSaved,
    reorderFiles, undoCloseFile, togglePin, updateFileContent, clearDirty, setLanguage,
    splitDirection, activePaneId, setActivePane, toggleSplit, closeSplit, paneFiles, setPaneFile,
  }
}
