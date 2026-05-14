import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { FileEntry, GitFileStatus } from '../services'
import { api } from '../services'
import { logger, getFileIcon, getFileIconColor } from '../utils'
import { useMenuKeyboardNav } from '../hooks/useMenuKeyboardNav'
import {
  Folder, FilePlus, FolderPlus, ChevronsUpDown, ChevronsDownUp,
  Search, X, ChevronRight, ChevronDown, FileText,
} from 'lucide-react'

interface ExplorerPanelProps {
  workspace: string
  currentFile: string | null
  gitStatusMap: Record<string, GitFileStatus>
  openFiles: string[]
  dirtyFiles: Set<string>
  onOpenFile: (path: string, options?: { preview?: boolean }) => void
  onCloseFile: (path: string) => void
  onToast: (type: 'success' | 'error' | 'info' | 'warning', title: string, message?: string) => void
  onRefreshGitStatus: () => void
  onRenameFileInStore: (oldPath: string, newPath: string) => void
  onSetPaneFile?: (paneId: string, path: string) => void
  onFileTreeChange?: (entries: FileEntry[]) => void
  onExpandedDirsChange?: (dirs: Set<string>) => void
}

export default function ExplorerPanel({
  workspace,
  currentFile,
  gitStatusMap,
  openFiles,
  dirtyFiles,
  onOpenFile,
  onCloseFile,
  onToast,
  onRefreshGitStatus,
  onRenameFileInStore,
  onSetPaneFile,
  onFileTreeChange,
  onExpandedDirsChange,
}: ExplorerPanelProps) {
  const [fileTree, setFileTree] = useState<FileEntry[]>([])
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [fileTreeFilter, setFileTreeFilter] = useState('')
  const [loading, setLoading] = useState(false)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean
    x: number
    y: number
    entry: FileEntry | null
  }>({ visible: false, x: 0, y: 0, entry: null })
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // Rename state
  const [renamingEntry, setRenamingEntry] = useState<FileEntry | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // New file/folder dialog state
  const [newFileDialog, setNewFileDialog] = useState<{ parentPath: string; isFolder: boolean } | null>(null)
  const [newFileName, setNewFileName] = useState('')

  // Clipboard for cut/copy/paste
  const [fileClipboard, setFileClipboard] = useState<{ path: string; isDirectory: boolean; operation: 'copy' | 'cut' } | null>(null)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; name: string } | null>(null)

  const fileMenuKeyDown = useMenuKeyboardNav(contextMenuRef, closeContextMenu)

  // Load initial file tree
  useEffect(() => {
    if (!workspace) return
    refreshFileTree()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace])

  const refreshFileTree = useCallback(async () => {
    if (!workspace) return
    try {
      const entries = await api.fs.listDir(workspace)
      setFileTree(entries)
      onFileTreeChange?.(entries)
    } catch (err) {
      logger.error('Explorer', 'Failed to refresh file tree:', err)
    }
  }, [workspace, onFileTreeChange])

  const toggleDir = useCallback(async (entry: FileEntry) => {
    if (!entry.isDirectory) return
    const newExpanded = new Set(expandedDirs)
    if (newExpanded.has(entry.path)) {
      newExpanded.delete(entry.path)
    } else {
      newExpanded.add(entry.path)
      if (!entry.children || entry.children.length === 0) {
        try {
          const children = await api.fs.listDir(entry.path)
          setFileTree(prev => {
            const updateChildren = (entries: FileEntry[], path: string): FileEntry[] => {
              return entries.map(e => {
                if (e.path === path && e.isDirectory) {
                  return { ...e, children }
                }
                if (e.isDirectory && e.children) {
                  return { ...e, children: updateChildren(e.children, path) }
                }
                return e
              })
            }
            return updateChildren(prev, entry.path)
          })
        } catch (err) {
          logger.error('Explorer', 'Failed to load directory:', err)
        }
      }
    }
    setExpandedDirs(newExpanded)
    onExpandedDirsChange?.(newExpanded)
  }, [expandedDirs, onExpandedDirsChange])

  const loadFile = useCallback(async (entry: FileEntry) => {
    if (entry.isDirectory) {
      toggleDir(entry)
      return
    }
    try {
      setLoading(true)
      onOpenFile(entry.path, { preview: true })
      onSetPaneFile?.('main', entry.path)
    } catch (err) {
      logger.error('Explorer', 'Failed to load file:', err)
      onToast('error', 'Failed to load file', err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [onOpenFile, onSetPaneFile, onToast, toggleDir])

  const handleContextMenu = (e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, entry })
  }

  function closeContextMenu() {
    setContextMenu({ visible: false, x: 0, y: 0, entry: null })
  }

  const handleNewFile = (isFolder: boolean) => {
    const parentPath = contextMenu.entry?.isDirectory
      ? contextMenu.entry.path
      : contextMenu.entry?.path.split('/').slice(0, -1).join('/') || workspace
    setNewFileDialog({ parentPath, isFolder })
    setNewFileName('')
    closeContextMenu()
  }

  const handleRename = () => {
    if (contextMenu.entry) {
      setRenamingEntry(contextMenu.entry)
      setRenameValue(contextMenu.entry.name)
    }
    closeContextMenu()
  }

  const handleDelete = () => {
    const entry = contextMenu.entry
    if (!entry) return
    closeContextMenu()
    setDeleteTarget({ path: entry.path, name: entry.name })
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    if (dirtyFiles.has(deleteTarget.path)) {
      // Cannot delete dirty file — let parent handle this
      onToast('warning', 'Unsaved changes', `Save ${deleteTarget.name} before deleting`)
      setDeleteTarget(null)
      return
    }
    try {
      await api.fs.deleteFile(deleteTarget.path)
      refreshFileTree()
      if (openFiles.includes(deleteTarget.path)) {
        onCloseFile(deleteTarget.path)
      }
      onToast('success', 'Deleted', deleteTarget.name)
      onRefreshGitStatus()
    } catch (err) {
      onToast('error', 'Delete failed', err instanceof Error ? err.message : String(err))
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleCopyPath = () => {
    const entry = contextMenu.entry
    if (entry) {
      navigator.clipboard.writeText(entry.path)
      onToast('success', 'Copied', 'Full path copied to clipboard')
    }
    closeContextMenu()
  }

  const handleCopyRelativePath = () => {
    const entry = contextMenu.entry
    if (entry && workspace) {
      const relPath = entry.path.replace(workspace, '').replace(/^\//, '')
      navigator.clipboard.writeText(relPath)
      onToast('success', 'Copied', 'Relative path copied to clipboard')
    }
    closeContextMenu()
  }

  const handleCutFile = () => {
    const entry = contextMenu.entry
    if (entry) {
      setFileClipboard({ path: entry.path, isDirectory: entry.isDirectory, operation: 'cut' })
      onToast('info', 'Cut', `${entry.isDirectory ? 'Folder' : 'File'} cut: ${entry.name}`)
    }
    closeContextMenu()
  }

  const handleCopyFile = () => {
    const entry = contextMenu.entry
    if (entry) {
      setFileClipboard({ path: entry.path, isDirectory: entry.isDirectory, operation: 'copy' })
      onToast('info', 'Copied', `${entry.isDirectory ? 'Folder' : 'File'} copied: ${entry.name}`)
    }
    closeContextMenu()
  }

  const handlePasteFile = async () => {
    const entry = contextMenu.entry
    if (!fileClipboard || !entry) return
    const targetDir = entry.isDirectory ? entry.path : entry.path.split('/').slice(0, -1).join('/')
    const fileName = fileClipboard.path.split('/').pop()!
    const destPath = targetDir ? `${targetDir}/${fileName}` : fileName

    try {
      if (fileClipboard.operation === 'copy') {
        await api.fs.copyFile(fileClipboard.path, destPath)
        onToast('success', 'Pasted', `${fileClipboard.isDirectory ? 'Folder' : 'File'} pasted: ${fileName}`)
        setFileClipboard(null)
      } else {
        await api.fs.renameFile(fileClipboard.path, destPath)
        setFileClipboard(null)
        onToast('success', 'Moved', `${fileClipboard.isDirectory ? 'Folder' : 'File'} moved: ${fileName}`)
        if (openFiles.includes(fileClipboard.path)) {
          onRenameFileInStore(fileClipboard.path, destPath)
        }
      }
      refreshFileTree()
      onRefreshGitStatus()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('not found') || msg.includes('source')) {
        onToast('warning', 'Paste failed', 'The file has been deleted or moved since you copied it')
        setFileClipboard(null)
      } else {
        onToast('error', 'Paste failed', msg)
      }
    }
    closeContextMenu()
  }

  const submitRename = async () => {
    if (!renamingEntry || !renameValue.trim()) {
      setRenamingEntry(null)
      setRenameValue('')
      return
    }
    const newName = renameValue.trim()
    const parentPath = renamingEntry.path.split('/').slice(0, -1).join('/')
    const newPath = parentPath ? `${parentPath}/${newName}` : newName

    try {
      await api.fs.renameFile(renamingEntry.path, newPath)
      refreshFileTree()
      onRefreshGitStatus()
      if (openFiles.includes(renamingEntry.path)) {
        onRenameFileInStore(renamingEntry.path, newPath)
      }
      onToast('success', 'Renamed', `${renamingEntry.name} → ${newName}`)
    } catch (err) {
      onToast('error', 'Rename failed', err instanceof Error ? err.message : String(err))
    }
    setRenamingEntry(null)
    setRenameValue('')
  }

  const submitNewFile = async () => {
    if (!newFileDialog || !newFileName.trim()) return
    const name = newFileName.trim()
    const path = newFileDialog.parentPath ? `${newFileDialog.parentPath}/${name}` : name

    try {
      if (newFileDialog.isFolder) {
        await api.fs.mkdir(path)
      } else {
        await api.fs.createFile(path)
      }
      refreshFileTree()
      onRefreshGitStatus()
      onToast('success', 'Created', `${newFileDialog.isFolder ? 'Folder' : 'File'}: ${name}`)
      if (!newFileDialog.isFolder) {
        onOpenFile(path)
      }
    } catch (err) {
      onToast('error', 'Create failed', err instanceof Error ? err.message : String(err))
    }
    setNewFileDialog(null)
    setNewFileName('')
  }

  // Auto-expand all directories when filter is active
  useEffect(() => {
    if (fileTreeFilter.trim()) {
      const expandAll = (entries: FileEntry[], paths: string[]) => {
        for (const entry of entries) {
          if (entry.isDirectory && entry.children?.length) {
            paths.push(entry.path)
            expandAll(entry.children, paths)
          }
        }
      }
      const allPaths: string[] = []
      expandAll(fileTree, allPaths)
      setExpandedDirs(new Set(allPaths))
      onExpandedDirsChange?.(new Set(allPaths))
    }
  }, [fileTreeFilter, fileTree, onExpandedDirsChange])

  // Reveal active file in file tree
  useEffect(() => {
    if (!currentFile) return
    const parts = currentFile.split('/')
    const parentPaths: string[] = []
    for (let i = 1; i < parts.length; i++) {
      parentPaths.push(parts.slice(0, i).join('/'))
    }
    setExpandedDirs(prev => {
      const next = new Set(prev)
      let changed = false
      for (const p of parentPaths) {
        if (!next.has(p)) {
          next.add(p)
          changed = true
        }
      }
      return changed ? next : prev
    })
    onExpandedDirsChange?.(new Set([...parentPaths]))
    requestAnimationFrame(() => {
      const activeBtn = document.querySelector('[data-active-file="true"]')
      activeBtn?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }, [currentFile, onExpandedDirsChange])

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu.visible) return
    const handleClick = () => closeContextMenu()
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') closeContextMenu() }
    const stopNativePropagation = (e: Event) => e.stopPropagation()
    const menuRef = contextMenuRef.current
    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleEscape)
    menuRef?.addEventListener('click', stopNativePropagation, true)
    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleEscape)
      menuRef?.removeEventListener('click', stopNativePropagation, true)
    }
  }, [contextMenu.visible])

  const filteredFileTree = useMemo(() => {
    const q = fileTreeFilter.toLowerCase().trim()
    if (!q) return fileTree
    const filterEntries = (entries: FileEntry[]): FileEntry[] => {
      const result: FileEntry[] = []
      for (const entry of entries) {
        if (entry.isDirectory) {
          const filteredChildren = filterEntries(entry.children || [])
          if (filteredChildren.length > 0 || entry.name.toLowerCase().includes(q)) {
            result.push({ ...entry, children: filteredChildren.length > 0 ? filteredChildren : entry.children })
          }
        } else {
          if (entry.name.toLowerCase().includes(q)) {
            result.push(entry)
          }
        }
      }
      return result
    }
    return filterEntries(fileTree)
  }, [fileTree, fileTreeFilter])

  const getIconComponent = (filename: string) => getFileIcon(filename)
  const getIconColor = (filename: string) => getFileIconColor(filename)

  const renderFileTree = (entries: FileEntry[], level: number = 0) => {
    return entries.map((entry) => {
      const isExpanded = expandedDirs.has(entry.path)
      const isActive = currentFile === entry.path
      const isRenaming = renamingEntry?.path === entry.path

      const Icon = entry.isDirectory ? Folder : getIconComponent(entry.name)
      const iconColor = entry.isDirectory ? 'text-accent' : getIconColor(entry.name)

      return (
        <div key={entry.path}>
          {isRenaming ? (
            <div className="flex items-center px-2 py-1.5" style={{ paddingLeft: `${level * 12 + 8}px` }}>
              <Icon size={14} className={`mr-2 ${iconColor}`} />
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitRename()
                  if (e.key === 'Escape') { setRenamingEntry(null); setRenameValue('') }
                }}
                onBlur={submitRename}
                autoFocus
                className="flex-1 bg-surface border border-accent rounded px-1 text-sm text-text-primary outline-none"
              />
            </div>
          ) : (
            <button
              onClick={() => loadFile(entry)}
              onDoubleClick={() => {
                if (!entry.isDirectory) {
                  onOpenFile(entry.path, { preview: false })
                }
              }}
              onContextMenu={(e) => handleContextMenu(e, entry)}
              draggable={!entry.isDirectory}
              onDragStart={(e) => {
                if (entry.isDirectory) return
                e.dataTransfer.setData('text/plain', entry.path)
                e.dataTransfer.setData('application/json', JSON.stringify({ type: 'file', path: entry.path }))
                e.dataTransfer.effectAllowed = 'move'
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  const container = e.currentTarget.closest('.file-tree-container')
                  const buttons = container?.querySelectorAll('button.file-tree-entry')
                  if (buttons && buttons.length > 0) {
                    const currentIndex = Array.from(buttons).indexOf(e.currentTarget)
                    const nextIndex = e.key === 'ArrowDown'
                      ? Math.min(currentIndex + 1, buttons.length - 1)
                      : Math.max(currentIndex - 1, 0)
                    ;(buttons[nextIndex] as HTMLElement)?.focus()
                  }
                } else if (e.key === 'ArrowRight' && entry.isDirectory) {
                  e.preventDefault()
                  if (!expandedDirs.has(entry.path)) {
                    toggleDir(entry)
                    requestAnimationFrame(() => {
                      const container = e.currentTarget.closest('.file-tree-container')
                      const buttons = container?.querySelectorAll('button.file-tree-entry')
                      if (buttons) {
                        const currentIndex = Array.from(buttons).indexOf(e.currentTarget)
                        if (currentIndex < buttons.length - 1) {
                          (buttons[currentIndex + 1] as HTMLElement)?.focus()
                        }
                      }
                    })
                  } else {
                    const container = e.currentTarget.closest('.file-tree-container')
                    const buttons = container?.querySelectorAll('button.file-tree-entry')
                    if (buttons) {
                      const currentIndex = Array.from(buttons).indexOf(e.currentTarget)
                      if (currentIndex < buttons.length - 1) {
                        (buttons[currentIndex + 1] as HTMLElement)?.focus()
                      }
                    }
                  }
                } else if (e.key === 'ArrowLeft' && entry.isDirectory) {
                  e.preventDefault()
                  if (expandedDirs.has(entry.path)) {
                    toggleDir(entry)
                  }
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  loadFile(entry)
                } else if (e.key === 'F2') {
                  e.preventDefault()
                  setRenamingEntry(entry)
                  setRenameValue(entry.name)
                } else if (e.key === 'Delete') {
                  e.preventDefault()
                  setDeleteTarget({ path: entry.path, name: entry.name })
                } else if (e.key === ' ' && entry.isDirectory) {
                  e.preventDefault()
                  toggleDir(entry)
                } else if (e.key === 'Home') {
                  e.preventDefault()
                  const container = e.currentTarget.closest('.file-tree-container')
                  const buttons = container?.querySelectorAll('button.file-tree-entry')
                  if (buttons && buttons.length > 0) {
                    (buttons[0] as HTMLElement)?.focus()
                  }
                } else if (e.key === 'End') {
                  e.preventDefault()
                  const container = e.currentTarget.closest('.file-tree-container')
                  const buttons = container?.querySelectorAll('button.file-tree-entry')
                  if (buttons && buttons.length > 0) {
                    (buttons[buttons.length - 1] as HTMLElement)?.focus()
                  }
                }
              }}
              data-active-file={isActive ? 'true' : undefined}
              tabIndex={0}
              className={`file-tree-entry w-full flex items-center px-2 py-1.5 text-left text-sm transition-all duration-150 rounded-mac ${
                isActive ? 'bg-accent-muted text-text-primary' : 'text-text-secondary hover:bg-card-hover hover:text-text-primary'
              }`}
              style={{ paddingLeft: `${level * 12 + 8}px` }}
            >
              {entry.isDirectory && (
                <span
                  className="mr-1 cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); toggleDir(entry); }}
                  aria-label={isExpanded ? `Collapse ${entry.name}` : `Expand ${entry.name}`}
                  aria-expanded={isExpanded}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); toggleDir(entry) } }}
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
              )}
              <Icon size={14} className={`mr-2 ${iconColor}`} />
              <span className="truncate flex-1">{entry.name}</span>
              {!entry.isDirectory && gitStatusMap[entry.path] && (
                <span className={`text-[10px] font-bold ml-auto px-1 ${
                  gitStatusMap[entry.path].staged ? 'text-green-400' : 'text-yellow-400'
                }`} title={gitStatusMap[entry.path].status}>
                  {gitStatusMap[entry.path].status === '??' ? 'U' : gitStatusMap[entry.path].status}
                </span>
              )}
            </button>
          )}
          {entry.isDirectory && isExpanded && entry.children && entry.children.length > 0 && (
            <div>
              {renderFileTree(entry.children, level + 1)}
            </div>
          )}
        </div>
      )
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="panel-header flex items-center justify-between shrink-0">
        <span>Files</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => { setNewFileDialog({ parentPath: workspace, isFolder: false }); setNewFileName('') }}
            className="p-0.5 hover:bg-card-hover rounded transition-colors"
            title="New File"
          >
            <FilePlus size={12} className="text-text-tertiary" />
          </button>
          <button
            onClick={() => { setNewFileDialog({ parentPath: workspace, isFolder: true }); setNewFileName('') }}
            className="p-0.5 hover:bg-card-hover rounded transition-colors"
            title="New Folder"
          >
            <FolderPlus size={12} className="text-text-tertiary" />
          </button>
          <button
            onClick={() => {
              const expandAll = (entries: FileEntry[], paths: string[]) => {
                for (const entry of entries) {
                  if (entry.isDirectory && entry.children?.length) {
                    paths.push(entry.path)
                    expandAll(entry.children, paths)
                  }
                }
              }
              const allPaths: string[] = []
              expandAll(fileTree, allPaths)
              setExpandedDirs(new Set(allPaths))
            }}
            className="p-0.5 hover:bg-card-hover rounded transition-colors"
            title="Expand All"
          >
            <ChevronsUpDown size={12} className="text-text-tertiary" />
          </button>
          <button
            onClick={() => setExpandedDirs(new Set())}
            className="p-0.5 hover:bg-card-hover rounded transition-colors"
            title="Collapse All"
          >
            <ChevronsDownUp size={12} className="text-text-tertiary" />
          </button>
        </div>
      </div>

      {/* Filter */}
      {fileTree.length > 0 && (
        <div className="px-2 pb-1 shrink-0">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-surface rounded-mac text-text-tertiary">
            <Search size={12} />
            <input
              type="text"
              value={fileTreeFilter}
              onChange={(e) => setFileTreeFilter(e.target.value)}
              placeholder="Filter files..."
              className="flex-1 bg-transparent text-xs text-text-primary placeholder-text-tertiary outline-none"
            />
            {fileTreeFilter && (
              <button onClick={() => setFileTreeFilter('')} className="hover:text-text-primary" aria-label="Clear filter" title="Clear filter">
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* File tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 file-tree-container">
        {loading && fileTree.length === 0 ? (
          <div className="text-xs text-text-tertiary p-2">Loading...</div>
        ) : (
          renderFileTree(filteredFileTree, 0)
        )}
      </div>

      {/* Context Menu */}
      {contextMenu.visible && contextMenu.entry && (
        <div
          ref={contextMenuRef}
          onKeyDown={fileMenuKeyDown}
          className="fixed bg-panel-bg border border-glass-border rounded-mac shadow-mac py-1 z-50 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button onClick={() => { onOpenFile(contextMenu.entry!.path); closeContextMenu() }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-card-hover flex items-center gap-2">
            <FileText size={14} /> Open
          </button>
          {contextMenu.entry.isDirectory && (
            <button onClick={() => handleNewFile(false)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-card-hover flex items-center gap-2">
              <FilePlus size={14} /> New File
            </button>
          )}
          {contextMenu.entry.isDirectory && (
            <button onClick={() => handleNewFile(true)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-card-hover flex items-center gap-2">
              <FolderPlus size={14} /> New Folder
            </button>
          )}
          <div className="my-1 border-t border-glass-border" />
          <button onClick={handleCutFile} className="w-full text-left px-3 py-1.5 text-sm hover:bg-card-hover flex items-center gap-2">
            <span>Cut</span>
          </button>
          <button onClick={handleCopyFile} className="w-full text-left px-3 py-1.5 text-sm hover:bg-card-hover flex items-center gap-2">
            <span>Copy</span>
          </button>
          <button onClick={handlePasteFile} className="w-full text-left px-3 py-1.5 text-sm hover:bg-card-hover flex items-center gap-2">
            <span>Paste</span>
          </button>
          <div className="my-1 border-t border-glass-border" />
          <button onClick={handleRename} className="w-full text-left px-3 py-1.5 text-sm hover:bg-card-hover flex items-center gap-2">
            <span>Rename</span>
          </button>
          <button onClick={handleDelete} className="w-full text-left px-3 py-1.5 text-sm hover:bg-card-hover text-error flex items-center gap-2">
            <span>Delete</span>
          </button>
          <div className="my-1 border-t border-glass-border" />
          <button onClick={handleCopyPath} className="w-full text-left px-3 py-1.5 text-sm hover:bg-card-hover flex items-center gap-2">
            <span>Copy Path</span>
          </button>
          <button onClick={handleCopyRelativePath} className="w-full text-left px-3 py-1.5 text-sm hover:bg-card-hover flex items-center gap-2">
            <span>Copy Relative Path</span>
          </button>
        </div>
      )}

      {/* New File/Folder Dialog */}
      {newFileDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-panel-bg border border-glass-border rounded-mac-xl p-4 w-96 max-w-md shadow-mac" role="dialog" aria-modal="true">
            <h3 className="text-lg font-semibold text-text-primary mb-3">
              {newFileDialog.isFolder ? 'New Folder' : 'New File'}
            </h3>
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitNewFile() }}
              placeholder={newFileDialog.isFolder ? 'folder-name' : 'file-name.ext'}
              autoFocus
              className="w-full bg-surface border border-glass-border rounded-mac px-3 py-2 text-sm text-text-primary placeholder-text-tertiary outline-none focus:border-accent mb-4"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setNewFileDialog(null); setNewFileName('') }} className="px-3 py-1.5 text-sm rounded-mac hover:bg-card-hover text-text-secondary">
                Cancel
              </button>
              <button onClick={submitNewFile} className="px-3 py-1.5 text-sm rounded-mac bg-accent text-white hover:bg-accent/90">
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-panel-bg border border-glass-border rounded-mac-xl p-4 w-96 max-w-md shadow-mac" role="dialog" aria-modal="true">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-mac shrink-0 bg-warning/20">
                <span className="text-warning text-lg">!</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-text-primary">Delete {deleteTarget.name}?</h3>
                <p className="text-sm text-text-secondary mt-1">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-3 py-1.5 text-sm rounded-mac hover:bg-card-hover text-text-secondary">
                Cancel
              </button>
              <button onClick={confirmDelete} className="px-3 py-1.5 text-sm rounded-mac bg-error text-white hover:bg-error/90">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
