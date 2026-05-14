import { useMemo, useRef, useCallback, useState, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import type { FileEntry } from '../services'
import { getFileIcon, getFileIconColor } from '../utils'
import { useMenuKeyboardNav } from '../hooks/useMenuKeyboardNav'

interface BreadcrumbsBarProps {
  filePath?: string
  fileTree?: FileEntry[]
  onNavigate?: (_path: string) => void
  onFileSelect?: (_path: string) => void
}

// Get siblings at a given directory path from the file tree
function getSiblingsAtPath(fileTree: FileEntry[], dirPath: string): FileEntry[] {
  if (dirPath === '' || dirPath === '/') {
    return fileTree
  }
  for (const entry of fileTree) {
    if (entry.path === dirPath && entry.isDirectory && entry.children) {
      return entry.children
    }
    if (entry.isDirectory && entry.children) {
      const result = getSiblingsAtPath(entry.children, dirPath)
      if (result.length > 0) return result
    }
  }
  return []
}

/**
 * File path breadcrumbs — VS Code pattern.
 * Shows file path segments separated by chevrons. Click a segment to navigate.
 * Hover shows dropdown with sibling files (VS Code pattern).
 * W3C ARIA pattern: <nav> with aria-label, aria-current="page" on current item.
 * Keyboard navigation: ArrowLeft/Right to move focus, Enter/Space to select.
 */
export function BreadcrumbsBar({ filePath, fileTree = [], onNavigate, onFileSelect }: BreadcrumbsBarProps) {
  const navRef = useRef<HTMLElement>(null)
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const menuKeyDown = useMenuKeyboardNav(dropdownRef, () => setActiveDropdown(null))

  const segments = useMemo(() => {
    if (!filePath) return []
    return filePath.split('/').filter(Boolean)
  }, [filePath])

  // Close dropdown on click outside
  useEffect(() => {
    if (activeDropdown === null) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [activeDropdown])

  const handleClick = useCallback((index: number) => {
    const isLast = index === segments.length - 1
    if (isLast) return // Don't open dropdown for the file itself
    if (activeDropdown === index) {
      setActiveDropdown(null)
      return
    }
    setActiveDropdown(index)
  }, [activeDropdown, segments.length])

  // Double-click navigates to directory (original behavior)
  const handleDoubleClick = useCallback((index: number) => {
    setActiveDropdown(null)
    const targetPath = segments.slice(0, index + 1).join('/')
    if (targetPath !== filePath && onNavigate) {
      onNavigate(targetPath)
    }
  }, [segments, filePath, onNavigate])

  const handleFileClick = useCallback((path: string) => {
    setActiveDropdown(null)
    if (onFileSelect) {
      onFileSelect(path)
    }
  }, [onFileSelect])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const buttons = navRef.current?.querySelectorAll<HTMLButtonElement>('button')
    if (!buttons || buttons.length === 0) return

    const focusedIdx = Array.from(buttons).indexOf(document.activeElement as HTMLButtonElement)

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const nextIdx = (focusedIdx + 1) % buttons.length
      buttons[nextIdx]?.focus()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const prevIdx = (focusedIdx - 1 + buttons.length) % buttons.length
      buttons[prevIdx]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      buttons[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      buttons[buttons.length - 1]?.focus()
    } else if (e.key === 'Escape') {
      setActiveDropdown(null)
    }
  }, [])

  // Get siblings for the active dropdown
  const dropdownSiblings = useMemo(() => {
    if (activeDropdown === null) return []
    const dirPath = segments.slice(0, activeDropdown).join('/')
    return getSiblingsAtPath(fileTree, dirPath)
  }, [activeDropdown, segments, fileTree])

  if (!filePath || segments.length === 0) return null

  return (
    <nav
      ref={navRef}
      aria-label="Breadcrumb"
      onKeyDown={handleKeyDown}
      className="flex items-center gap-0.5 px-4 py-1 text-xs border-b border-glass-border bg-mac-sidebar/30 text-text-secondary min-h-[22px] overflow-hidden flex-shrink-0"
    >
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1
        const path = segments.slice(0, index + 1).join('/')
        const isDropdownOpen = activeDropdown === index

        return (
          <div key={path} className="flex items-center gap-0.5 relative">
            {index > 0 && (
              <span aria-hidden="true" className="text-text-tertiary text-[10px]">/</span>
            )}
            <button
              onClick={() => handleClick(index)}
              onDoubleClick={() => handleDoubleClick(index)}
              tabIndex={isLast ? 0 : -1}
              className={`hover:text-text-primary transition-colors truncate max-w-[120px] focus:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded-sm flex items-center gap-0.5 ${isLast ? 'text-text-primary font-medium' : ''} ${isDropdownOpen ? 'bg-card-hover rounded-sm' : ''}`}
              aria-current={isLast ? 'page' : undefined}
              aria-haspopup="menu"
              aria-expanded={isDropdownOpen}
              title={path}
            >
              {segment}
              <ChevronDown size={10} className={`text-text-tertiary flex-shrink-0 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {isDropdownOpen && dropdownSiblings.length > 0 && (
              <>
                <div
                  ref={dropdownRef}
                  role="menu"
                  aria-label={`Files in ${segments.slice(0, index).join('/') || 'root'}`}
                  className="absolute top-full left-0 mt-0.5 min-w-[180px] max-h-[200px] overflow-y-auto bg-mac-panel/95 border border-glass-border rounded-mac shadow-mac backdrop-blur-xl z-50 py-1"
                  onKeyDown={menuKeyDown}
                >
                  {dropdownSiblings.map(entry => {
                    const Icon = getFileIcon(entry.name)
                    const iconColor = getFileIconColor(entry.name)
                    return (
                      <button
                        key={entry.path}
                        role="menuitem"
                        tabIndex={-1}
                        onClick={() => handleFileClick(entry.path)}
                        className={`w-full flex items-center gap-2 px-3 py-1 text-xs hover:bg-card-hover transition-colors text-left ${entry.path === filePath ? 'bg-accent/10 text-text-primary' : 'text-text-secondary'}`}
                      >
                        <Icon size={12} className={`flex-shrink-0 ${iconColor}`} />
                        <span className="truncate">{entry.name}</span>
                        {entry.isDirectory && <span className="ml-auto text-text-tertiary text-[10px]">folder</span>}
                      </button>
                    )
                  })}
                </div>
                <div className="fixed inset-0 z-40" onClick={() => setActiveDropdown(null)} aria-hidden="true" />
              </>
            )}
          </div>
        )
      })}
    </nav>
  )
}
