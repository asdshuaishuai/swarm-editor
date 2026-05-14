import { useMemo } from 'react'
import { X, Pin } from 'lucide-react'
import { getFileIcon, getFileIconColor } from '../utils'

interface EditorTabProps {
  path: string
  isActive: boolean
  isDirty: boolean
  isPinned?: boolean
  isPreview?: boolean
  onClick: () => void
  onClose: (_e: React.MouseEvent) => void
  onContextMenu?: (_e: React.MouseEvent, _path: string) => void
  onDoubleClick?: () => void // R5098: Double-click to rename
}

export function EditorTab({ path, isActive, isDirty, isPinned, isPreview, onClick, onClose, onContextMenu, onDoubleClick }: EditorTabProps) {
  const filename = path.split('/').pop() || path
  // Memoize icon lookup to satisfy ESLint - getFileIcon returns cached component from static map
  const { Icon, iconColor } = useMemo(() => ({
    Icon: getFileIcon(filename),
    iconColor: getFileIconColor(filename),
  }), [filename])

  return (
    <div
      data-path={path}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onAuxClick={(e) => { if (e.button === 1 && !isPinned) { e.preventDefault(); e.stopPropagation(); onClose(e) } }}
      onContextMenu={onContextMenu ? (e) => { e.preventDefault(); onContextMenu(e, path) } : undefined}
      className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none
        border-b-2 transition-colors min-w-[100px] max-w-[180px]
        ${isActive
          ? 'bg-accent/10 border-accent text-text-primary'
          : 'bg-transparent border-transparent hover:bg-surface text-text-secondary hover:text-text-primary'
        }
        ${isPinned ? 'pr-2' : ''}
        ${isPreview && !isPinned && !isDirty ? 'italic opacity-80' : ''}`}
    >
      {isPinned ? (
        <span title="Pinned"><Pin size={12} className="flex-shrink-0 text-accent rotate-[-45deg]" /></span>
      ) : (
        <Icon size={14} className={`flex-shrink-0 ${iconColor}`} />
      )}
      <span className="truncate text-sm flex-1">{filename}</span>
      {isDirty && (
        <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" title="Unsaved changes" />
      )}
      {!isPinned && (
        <button
          onClick={(e) => { e.stopPropagation(); onClose(e) }}
          // VS Code: always show close button on active tab; hover-only on inactive tabs
          className={`p-0.5 hover:bg-error/20 rounded transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          title="Close"
          aria-label="Close tab"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
