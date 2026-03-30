import { useState, useEffect, useRef, useCallback } from 'react'
import { File, Folder, Search } from 'lucide-react'

export interface FileItem {
  path: string
  type: 'file' | 'folder'
  name: string
}

interface FileAutocompleteProps {
  query: string
  files: FileItem[]
  onSelect: (path: string) => void
  onClose: () => void
  position: { top: number; left: number }
  maxResults?: number
}

export function FileAutocomplete({
  query,
  files,
  onSelect,
  onClose,
  position,
  maxResults = 10,
}: FileAutocompleteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  // Filter files based on query
  const filteredFiles = files
    .filter((file) => {
      if (!query) return true
      const lowerQuery = query.toLowerCase()
      return (
        file.path.toLowerCase().includes(lowerQuery) ||
        file.name.toLowerCase().includes(lowerQuery)
      )
    })
    .slice(0, maxResults)

  // Ensure selection is within bounds (derived state)
  const safeSelectedIndex = Math.min(selectedIndex, Math.max(0, filteredFiles.length - 1))

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && safeSelectedIndex >= 0) {
      const selectedElement = listRef.current.children[safeSelectedIndex + 1] as HTMLElement // +1 for header
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [safeSelectedIndex])

  const handleSelect = useCallback((index: number) => {
    const file = filteredFiles[index]
    if (file) {
      onSelect(file.path)
      onClose()
    }
  }, [filteredFiles, onSelect, onClose])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % filteredFiles.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + filteredFiles.length) % filteredFiles.length)
        break
      case 'Enter':
        e.preventDefault()
        handleSelect(safeSelectedIndex)
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [filteredFiles.length, safeSelectedIndex, handleSelect, onClose])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (filteredFiles.length === 0) {
    return (
      <div
        className="fixed bg-mac-panel border border-glass-border rounded-mac shadow-lg p-3 text-text-secondary text-sm"
        style={{ top: position.top, left: position.left }}
      >
        <div className="flex items-center gap-2">
          <Search size={14} />
          <span>No files found matching "{query}"</span>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={listRef}
      className="fixed bg-mac-panel border border-glass-border rounded-mac shadow-lg max-h-64 overflow-y-auto min-w-64"
      style={{ top: position.top, left: position.left }}
    >
      <div className="p-2 border-b border-glass-border text-xs text-text-tertiary">
        Select file ({filteredFiles.length} results)
      </div>
      {filteredFiles.map((file, index) => (
        <div
          key={file.path}
          className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
            index === safeSelectedIndex
              ? 'bg-accent/20 text-accent'
              : 'hover:bg-card-hover'
          }`}
          onClick={() => handleSelect(index)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          {file.type === 'folder' ? (
            <Folder size={14} className="text-warning" />
          ) : (
            <File size={14} className="text-text-secondary" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate">{file.name}</div>
            <div className="text-xs text-text-tertiary truncate">{file.path}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

interface FileAutocompleteWrapperProps {
  visible: boolean
  query: string
  files: FileItem[]
  onSelect: (path: string) => void
  onClose: () => void
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement>
}

export function FileAutocompleteWrapper({
  visible,
  query,
  files,
  onSelect,
  onClose,
  inputRef,
}: FileAutocompleteWrapperProps) {
  const [position, setPosition] = useState({ top: 0, left: 0 })

  // Calculate position based on input element
  useEffect(() => {
    if (visible && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
      })
    }
  }, [visible, inputRef])

  if (!visible) return null

  return (
    <FileAutocomplete
      key={query} // Reset component state when query changes
      query={query}
      files={files}
      onSelect={onSelect}
      onClose={onClose}
      position={position}
    />
  )
}
