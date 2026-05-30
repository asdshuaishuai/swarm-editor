import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { FileEntry, GitFileStatus } from '../services'
import { api, gitApi } from '../services'
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
  const [currentBranch, setCurrentBranch] = useState('main')

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

  useEffect(() => {
    if (!workspace) return
    gitApi.getBranch().then(b => setCurrentBranch(b || 'main')).catch(() => logger.debug('Explorer', 'Failed to get git branch'))
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
      const iconColor = entry.isDirectory ? 'text-yellow-600' : getIconColor(entry.name)

      return (
        <div key={entry.path}>
          {isRenaming ? (
            <div className="flex items-center px-2 py-1.5" style={{ paddingLeft: `${level * 16 + 8}px` }}>
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
                className="flex-1 rounded px-1 text-xs font-mono outline-none focus:outline-none" style={{ background: '#0d1117', border: '1px solid #58a6ff', color: '#d0d7de' }}
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
              className={`file-tree-entry w-full flex items-center py-1 px-1.5 gap-1.5 text-left text-xs font-mono transition-all duration-150 rounded ${
                isActive ? 'bg-[rgba(88,166,255,0.1)] text-white' : 'hover:bg-[#21262d] hover:text-white'
              }`}
              style={{ color: isActive ? undefined : '#d0d7de', paddingLeft: `${level * 16 + 6}px`, borderLeft: level > 0 ? '1px solid #30363d' : undefined, marginLeft: level > 0 ? '8px' : undefined }}
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
                  {isExpanded ? <ChevronDown size={14} style={{ color: "#6b7280" }} /> : <ChevronRight size={14} style={{ color: "#6b7280" }} />}
                </span>
              )}
              <Icon size={14} className={`mr-2 ${iconColor}`} />
              <span className="truncate flex-1">{entry.name}</span>
              {!entry.isDirectory && gitStatusMap[entry.path] && (
                <span className={`text-[9px] font-semibold font-sans ml-auto px-1 rounded ${
                  gitStatusMap[entry.path].staged ? 'bg-[rgba(5,46,22,0.4)] text-green-400' : 'bg-[rgba(66,32,6,0.2)] text-yellow-400'
                }`} style={{ opacity: 0.8 }} title={gitStatusMap[entry.path].status}>
                  {gitStatusMap[entry.path].status === 'M' ? 'Modified' : gitStatusMap[entry.path].status === '??' ? 'Untracked' : gitStatusMap[entry.path].status === 'A' ? 'Added' : gitStatusMap[entry.path].status === 'D' ? 'Deleted' : gitStatusMap[entry.path].status}
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

  // Empty workspace: show open folder prompt
  if (!workspace) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 p-4" style={{ color: '#6b7280' }}>
        <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
        </svg>
        <span className="text-xs text-center">尚未打开工作区</span>
        <span className="text-[10px] text-center">点击菜单 文件 → 打开文件夹</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header — 匹配设计稿: 工作區樹狀圖 */}
      <div className="p-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider sticky top-0 z-10 shrink-0" style={{ color: '#6b7280', background: '#0d1117' }}>
        <span className="flex items-center gap-1.5">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#58a6ff' }}>
            <path d="M12 1l-3.5 5h2.5l-3 5h2.5l-4 7h5v3h2v-3h5l-4-7h2.5l-3-5h2.5z"/>
          </svg>
          工作区树状图 (Workspace)
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setNewFileDialog({ parentPath: workspace, isFolder: false }); setNewFileName('') }}
            className="p-0.5 rounded transition-colors hover:text-white cursor-pointer"
            style={{ color: "#6b7280" }}
            title="新建文件"
          >
            <FilePlus size={12} />
          </button>
          <button
            onClick={() => { setNewFileDialog({ parentPath: workspace, isFolder: true }); setNewFileName('') }}
            className="p-0.5 rounded transition-colors hover:text-white cursor-pointer"
            style={{ color: "#6b7280" }}
            title="新建文件夹"
          >
            <FolderPlus size={12} />
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
            className="p-0.5 rounded transition-colors hover:text-white cursor-pointer"
            style={{ color: "#6b7280" }}
            title="展开全部"
          >
            <ChevronsUpDown size={12} />
          </button>
          <button
            onClick={() => setExpandedDirs(new Set())}
            className="p-0.5 rounded transition-colors hover:text-white cursor-pointer"
            style={{ color: "#6b7280" }}
            title="折叠全部"
          >
            <ChevronsDownUp size={12} />
          </button>
        </div>
      </div>

      {/* Filter */}
      {fileTree.length > 0 && (
        <div className="px-2 pb-1 shrink-0">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px]" style={{ background: '#0d1117', color: '#6b7280' }}>
            <Search size={12} />
            <input
              type="text"
              value={fileTreeFilter}
              onChange={(e) => setFileTreeFilter(e.target.value)}
              placeholder="Filter files..."
              className="flex-1 bg-transparent text-xs outline-none" style={{ color: '#d0d7de' }}
            />
            {fileTreeFilter && (
              <button onClick={() => setFileTreeFilter('')} aria-label="Clear filter" title="Clear filter" style={{ color: '#6b7280' }} className="hover:text-white">
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* File tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 file-tree-container">
        {loading && fileTree.length === 0 ? (
          <div className="text-xs p-2" style={{ color: '#6b7280' }}>Loading...</div>
        ) : (
          renderFileTree(filteredFileTree, 0)
        )}
      </div>

      {/* Git & Worktree 变动 — 匹配设计稿 h-2/5 bg-[#11151c]/60 */}
      <div className="h-2/5 flex flex-col overflow-y-auto" style={{ background: 'rgba(17,21,28,0.6)', borderTop: '1px solid #30363d' }}>
          <div className="p-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider sticky top-0 z-10" style={{ color: '#6b7280', background: '#0d1117', borderBottom: '1px solid #30363d' }}>
            <span className="flex items-center gap-1.5">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ color: '#c084fc' }} strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 3v12M18 9a3 3 0 100 6 3 3 0 000-6M6 21a3 3 0 100-6 3 3 0 000 6M6 15c6 0 8-6 12-6" />
              </svg>
              Git & Worktree 变动
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded font-mono" style={{ color: '#c084fc', background: 'rgba(88,28,135,0.4)', border: '1px solid rgba(88,28,135,0.5)' }}>
              Worktree 模式
            </span>
          </div>
          <div className="p-2 text-xs font-mono space-y-2 overflow-y-auto" style={{ maxHeight: '40%', minHeight: '80px' }}>
            {/* Worktree card — 匹配设计稿 bg-slate-900/80 */}
            <div className="p-2 rounded" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #30363d' }}>
              <div className="flex items-center justify-between mb-1" style={{ color: '#9ca3af' }}>
                <span>作用中 Worktree:</span>
                <span className="px-1.5 rounded text-[10px] text-white" style={{ background: '#581c87' }}>{currentBranch}</span>
              </div>
              <div className="text-[10px] flex items-center gap-1" style={{ color: '#6b7280' }}>
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                </svg>
                <span className="truncate">{workspace || '/workspace'}</span>
              </div>
            </div>

            {/* Diff file list */}
            <div className="space-y-1">
              <div className="text-[10px] uppercase font-bold tracking-wider px-1" style={{ color: '#6b7280' }}>本机未提交变更</div>
              {Object.entries(gitStatusMap).map(([filePath, status]) => {
                const fileName = filePath.split('/').pop() || filePath
                const isModified = status.status === 'M'
                const isAdded = status.status === 'A' || status.status === '??'
                const FileIcon = getFileIcon(fileName)
                const fileColor = getFileIconColor(fileName)
                return (
                  <div
                    key={filePath}
                    className="flex items-center justify-between py-1 px-1.5 rounded cursor-pointer hover:bg-[#21262d] transition"
                    style={{
                      background: isModified ? 'rgba(66,32,6,0.2)' : undefined,
                      border: isModified ? '1px solid rgba(113,63,18,0.3)' : undefined,
                      color: isAdded ? '#9ca3af' : '#d0d7de',
                      opacity: isAdded ? 0.65 : 1,
                    }}
                    onClick={() => onOpenFile(filePath)}
                  >
                    <span className="flex items-center gap-1.5 truncate flex-1 max-w-[130px]">
                      <FileIcon size={12} className={fileColor} />
                      <span className="truncate">{fileName}</span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {isModified && (
                        <span className="text-[9px] px-1 rounded font-sans font-semibold" style={{ color: '#fbbf24', background: '#422006', border: '1px solid rgba(113,63,18,0.5)' }}>查看差异</span>
                      )}
                      <span className={`text-[10px] font-bold ${isModified ? 'text-yellow-500' : isAdded ? 'text-green-500' : 'text-yellow-400'}`}>
                        {status.status === '??' ? 'U' : status.status}
                      </span>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

      {/* Context Menu */}
      {contextMenu.visible && contextMenu.entry && (
        <div
          ref={contextMenuRef}
          onKeyDown={fileMenuKeyDown}
          className="fixed rounded-lg shadow-xl py-1 z-50 min-w-[160px]" style={{ background: '#1a1f26', border: '1px solid #30363d', left: contextMenu.x, top: contextMenu.y }}
        >
          <button onClick={() => { onOpenFile(contextMenu.entry!.path); closeContextMenu() }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-[#21262d] flex items-center gap-2" style={{ color: '#d0d7de' }}>
            <FileText size={14} /> Open
          </button>
          {contextMenu.entry.isDirectory && (
            <button onClick={() => handleNewFile(false)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-[#21262d] flex items-center gap-2" style={{ color: '#d0d7de' }}>
              <FilePlus size={14} /> New File
            </button>
          )}
          {contextMenu.entry.isDirectory && (
            <button onClick={() => handleNewFile(true)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-[#21262d] flex items-center gap-2" style={{ color: '#d0d7de' }}>
              <FolderPlus size={14} /> New Folder
            </button>
          )}
          <div className="my-1" style={{ borderTop: '1px solid #30363d' }} />
          <button onClick={handleCutFile} className="w-full text-left px-3 py-1.5 text-sm hover:bg-[#21262d] flex items-center gap-2" style={{ color: '#d0d7de' }}>
            <span>Cut</span>
          </button>
          <button onClick={handleCopyFile} className="w-full text-left px-3 py-1.5 text-sm hover:bg-[#21262d] flex items-center gap-2" style={{ color: '#d0d7de' }}>
            <span>Copy</span>
          </button>
          <button onClick={handlePasteFile} className="w-full text-left px-3 py-1.5 text-sm hover:bg-[#21262d] flex items-center gap-2" style={{ color: '#d0d7de' }}>
            <span>Paste</span>
          </button>
          <div className="my-1" style={{ borderTop: '1px solid #30363d' }} />
          <button onClick={handleRename} className="w-full text-left px-3 py-1.5 text-sm hover:bg-[#21262d] flex items-center gap-2" style={{ color: '#d0d7de' }}>
            <span>Rename</span>
          </button>
          <button onClick={handleDelete} className="w-full text-left px-3 py-1.5 text-sm hover:bg-[#21262d] flex items-center gap-2" style={{ color: '#f85149' }}>
            <span>Delete</span>
          </button>
          <div className="my-1" style={{ borderTop: '1px solid #30363d' }} />
          <button onClick={handleCopyPath} className="w-full text-left px-3 py-1.5 text-sm hover:bg-[#21262d] flex items-center gap-2" style={{ color: '#d0d7de' }}>
            <span>Copy Path</span>
          </button>
          <button onClick={handleCopyRelativePath} className="w-full text-left px-3 py-1.5 text-sm hover:bg-[#21262d] flex items-center gap-2" style={{ color: '#d0d7de' }}>
            <span>Copy Relative Path</span>
          </button>
        </div>
      )}

      {/* New File/Folder Dialog */}
      {newFileDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="rounded-xl p-4 w-96 max-w-md shadow-2xl" style={{ background: '#1a1f26', border: '1px solid #30363d' }} role="dialog" aria-modal="true">
            <h3 className="text-lg font-semibold mb-3" style={{ color: '#d0d7de' }}>
              {newFileDialog.isFolder ? 'New Folder' : 'New File'}
            </h3>
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitNewFile() }}
              placeholder={newFileDialog.isFolder ? 'folder-name' : 'file-name.ext'}
              autoFocus
              className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-4" style={{ background: '#0d1117', border: '1px solid #30363d', color: '#d0d7de' }}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setNewFileDialog(null); setNewFileName('') }} className="px-3 py-1.5 text-sm rounded hover:bg-[#21262d]" style={{ color: '#9ca3af' }}>
                Cancel
              </button>
              <button onClick={submitNewFile} className="px-3 py-1.5 text-sm rounded" style={{ background: '#58a6ff', color: '#fff' }}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="rounded-xl p-4 w-96 max-w-md shadow-2xl" style={{ background: '#1a1f26', border: '1px solid #30363d' }} role="dialog" aria-modal="true">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded shrink-0" style={{ background: 'rgba(234,179,8,0.15)' }}>
                <span style={{ color: '#eab308' }} className="text-lg">!</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold" style={{ color: '#d0d7de' }}>Delete {deleteTarget.name}?</h3>
                <p className="text-sm mt-1" style={{ color: '#9ca3af' }}>This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-3 py-1.5 text-sm rounded hover:bg-[#21262d]" style={{ color: '#9ca3af' }}>
                Cancel
              </button>
              <button onClick={confirmDelete} className="px-3 py-1.5 text-sm rounded" style={{ background: '#f85149', color: '#fff' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
