import { useEffect } from 'react'
import { api } from '../services/api'
import { useWorkspaceStore } from '../stores/workspaceStore'

interface UseFileWatcherOptions {
  openFiles: string[]
  currentFile: string | null
  secondaryFile: string | null
  workspace: string | null
  updateFileContent: (path: string, content: string) => void
  clearDirty: (path: string) => void
  externalReloadRef: React.MutableRefObject<boolean>
  editorRef: React.MutableRefObject<any>
  secondaryEditorRef: React.MutableRefObject<any>
  monacoRef: React.MutableRefObject<any>
}

export function useFileWatcher(options: UseFileWatcherOptions) {
  const {
    openFiles, currentFile, secondaryFile, workspace,
    updateFileContent, clearDirty, externalReloadRef,
    editorRef, secondaryEditorRef, monacoRef,
  } = options

  useEffect(() => {
    if (openFiles.length === 0 || !workspace) return

    const checkForExternalChanges = async () => {
      const { fileContents: latestContents, dirtyFiles: latestDirty } = useWorkspaceStore.getState()
      for (const filePath of openFiles) {
        try {
          const currentContent = latestContents.get(filePath)
          if (currentContent === undefined) continue

          const diskContent = await api.fs.readFile(filePath)
          if (diskContent !== currentContent && !latestDirty.has(filePath)) {
            updateFileContent(filePath, diskContent)
            clearDirty(filePath)

            externalReloadRef.current = true
            try {
              if (currentFile === filePath && editorRef.current && monacoRef.current) {
                const model = editorRef.current.getModel()
                if (model && model.getValue() !== diskContent) {
                  model.setValue(diskContent)
                }
              }
              if (secondaryFile === filePath && secondaryEditorRef.current && monacoRef.current) {
                const model = secondaryEditorRef.current.getModel()
                if (model && model.getValue() !== diskContent) {
                  model.setValue(diskContent)
                }
              }
            } finally {
              externalReloadRef.current = false
            }
          }
        } catch {
          // File may have been deleted or is inaccessible
        }
      }
    }

    const interval = setInterval(checkForExternalChanges, 5000)
    return () => clearInterval(interval)
  }, [openFiles, currentFile, secondaryFile, workspace, updateFileContent, clearDirty, externalReloadRef, editorRef, secondaryEditorRef, monacoRef])
}
