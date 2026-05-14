import React from 'react'

interface DragDropHandlers {
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}

interface CreateDragDropOptions {
  paneId: 'main' | 'secondary'
  draggedTab: { paneId: string; path: string } | null
  setDropTargetPane: (paneId: string | null) => void
  setDraggedTab: (tab: { paneId: string; path: string } | null) => void
  setPaneFile: (paneId: string, path: string) => void
  setActivePane: (paneId: string) => void
  onLoadFile?: (path: string) => void
}

export function createEditorDragDropHandlers(options: CreateDragDropOptions): DragDropHandlers {
  const { paneId, draggedTab, setDropTargetPane, setDraggedTab, setPaneFile, setActivePane, onLoadFile } = options
  const otherPane = paneId === 'main' ? 'secondary' : 'main'

  return {
    onDragOver: (e: React.DragEvent) => {
      const hasFileData = e.dataTransfer.types.includes('application/json')
      if (hasFileData || (draggedTab && draggedTab.paneId === otherPane)) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDropTargetPane(paneId)
      }
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setDropTargetPane(null)
      }
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setDropTargetPane(null)
      const fileTreeData = e.dataTransfer.getData('application/json')
      if (fileTreeData) {
        try {
          const data = JSON.parse(fileTreeData)
          if (data.type === 'file' && data.path) {
            if (paneId === 'main' && onLoadFile) {
              onLoadFile(data.path)
            } else {
              setPaneFile(paneId, data.path)
              setActivePane(paneId)
            }
            setDraggedTab(null)
            return
          }
        } catch { /* ignore parse errors */ }
      }
      if (draggedTab && draggedTab.paneId === otherPane) {
        setPaneFile(paneId, draggedTab.path)
        setActivePane(paneId)
      }
      setDraggedTab(null)
    },
  }
}
