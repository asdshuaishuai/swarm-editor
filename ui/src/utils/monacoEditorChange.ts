import { lspApi } from '../services/lspApi'

interface EditorChangeRefs {
  lspInitiatedEditRef: React.MutableRefObject<boolean>
  externalReloadRef: React.MutableRefObject<boolean>
  lspDebounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  lspOpenFileRef: React.MutableRefObject<string | null>
  lspPendingChangesRef: React.MutableRefObject<any[]>
  lspIncrementalRef: React.MutableRefObject<boolean>
  autoSaveTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
}

interface EditorChangeDeps {
  autoSave: boolean
  autoSaveDelay: number
  updateFileContent: (path: string, value: string) => void
  saveFileByPath: (path: string) => Promise<void>
  dirtyFiles: Set<string>
}

/**
 * Factory for editor change handlers.
 * DRYs up the identical LSP debounce + auto-save logic used by both main and secondary panes.
 */
export function createEditorChangeHandler(
  getFilePath: () => string | null | undefined,
  refs: EditorChangeRefs,
  deps: EditorChangeDeps,
) {
  return (value: string | undefined) => {
    const filePath = getFilePath()
    if (value === undefined || !filePath) return

    // Skip updateFileContent if edit was initiated by LSP (format-on-save, rename, code actions)
    // or external file reload — to avoid marking the file as dirty
    if (refs.lspInitiatedEditRef.current || refs.externalReloadRef.current) return
    deps.updateFileContent(filePath, value)

    // Debounced LSP didChange (500ms after last keystroke)
    // P1 fix: Capture content at debounce time, not execution time
    // (if user switches tabs before debounce fires, we still want to sync the correct file's content)
    if (refs.lspDebounceRef.current) clearTimeout(refs.lspDebounceRef.current)
    if (refs.lspOpenFileRef.current) {
      const lspFilePath = refs.lspOpenFileRef.current // Capture at debounce time
      const capturedContent = value // Capture content at debounce time
      refs.lspDebounceRef.current = setTimeout(() => {
        const pending = refs.lspPendingChangesRef.current
        refs.lspPendingChangesRef.current = []
        if (refs.lspIncrementalRef.current && pending.length > 0) {
          // Incremental sync: send only the deltas (Cursor/Windsurf pattern)
          lspApi.didChangeIncremental(lspFilePath, pending).catch(() => {})
        } else {
          // Full sync fallback
          lspApi.didChange(lspFilePath, capturedContent).catch(() => {})
        }
      }, 500)
    }

    // Auto-save with debounce (VS Code/Cursor pattern)
    // P1 fix: Capture file path at debounce time, not execution time
    // (if user switches tabs before debounce fires, we still want to save the edited file)
    if (deps.autoSave) {
      if (refs.autoSaveTimeoutRef.current) clearTimeout(refs.autoSaveTimeoutRef.current)
      const fileToSave = filePath // Capture at debounce time
      const isDirty = deps.dirtyFiles.has(fileToSave) // P2 fix: Also capture dirty state at debounce time
      refs.autoSaveTimeoutRef.current = setTimeout(() => {
        // P2 fix: Check dirty state captured at debounce time
        if (isDirty) {
          deps.saveFileByPath(fileToSave)
        }
      }, deps.autoSaveDelay || 1000)
    }
  }
}
