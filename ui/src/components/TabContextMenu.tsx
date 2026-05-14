import { useWorkspaceStore } from '../stores/workspaceStore'

interface TabContextMenuState {
  visible: boolean
  x: number
  y: number
  path: string | null
}

interface TabContextMenuProps {
  tabContextMenu: TabContextMenuState
  tabContextMenuRef: React.Ref<HTMLDivElement>
  tabMenuKeyDown: (e: React.KeyboardEvent) => void
  openFiles: string[]
  dirtyFiles: Set<string>
  pinnedFiles: Set<string>
  onClose: () => void
  onCloseTab: (path: string) => void
  onCloseOthers: (path: string) => void
  onCloseToLeft: (path: string) => void
  onCloseToRight: (path: string) => void
  onCloseSaved: () => void
  onCloseAll: () => void
  onTogglePin: (path: string) => void
  onSplitRight: (path: string) => void
  onReopenClosed: () => void
  onCopyPath: (path: string) => void
  onCopyRelativePath: (path: string) => void
  onDirtyCloseAll: () => void
  addToast: (type: 'info' | 'success' | 'error', title: string, message: string, options?: any) => void
}

export function TabContextMenu({
  tabContextMenu,
  tabContextMenuRef,
  tabMenuKeyDown,
  openFiles,
  dirtyFiles,
  pinnedFiles,
  onClose,
  onCloseTab,
  onCloseOthers,
  onCloseToLeft,
  onCloseToRight,
  onCloseSaved,
  onCloseAll,
  onTogglePin,
  onSplitRight,
  onReopenClosed,
  onCopyPath,
  onCopyRelativePath,
  onDirtyCloseAll,
  addToast,
}: TabContextMenuProps) {
  if (!tabContextMenu.visible || !tabContextMenu.path) return null

  const ctxIdx = openFiles.indexOf(tabContextMenu.path)
  const hasLeft = ctxIdx > 0
  const hasRight = ctxIdx >= 0 && ctxIdx < openFiles.length - 1
  const hasOthers = openFiles.length > 1
  const hasSaved = openFiles.some(f => !dirtyFiles.has(f) && f !== tabContextMenu.path)

  return (
    <div
      ref={tabContextMenuRef}
      role="menu"
      aria-label="Tab context menu"
      className="fixed z-[200] bg-mac-panel/95 border border-glass-border rounded-mac-lg shadow-mac py-1 min-w-48 backdrop-blur-xl"
      style={{ left: tabContextMenu.x, top: tabContextMenu.y }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={tabMenuKeyDown}
    >
      <button
        onClick={() => { if (tabContextMenu.path) { onCloseTab(tabContextMenu.path); onClose() } }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
        role="menuitem"
      >
        Close
      </button>
      {hasOthers && (
        <button
          onClick={() => {
            if (!tabContextMenu.path) return
            onCloseOthers(tabContextMenu.path)
            onClose()
          }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
          role="menuitem"
        >
          Close Others
        </button>
      )}
      {hasLeft && (
        <button
          onClick={() => {
            if (!tabContextMenu.path) return
            onCloseToLeft(tabContextMenu.path)
            onClose()
          }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
          role="menuitem"
        >
          Close to Left
        </button>
      )}
      {hasRight && (
        <button
          onClick={() => {
            if (!tabContextMenu.path) return
            onCloseToRight(tabContextMenu.path)
            onClose()
          }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
          role="menuitem"
        >
          Close to Right
        </button>
      )}
      {hasSaved && (
        <button
          onClick={() => {
            const count = openFiles.filter(f => !dirtyFiles.has(f) && !pinnedFiles.has(f)).length
            onCloseSaved()
            if (count > 0) {
              addToast('info', 'Saved tabs closed', `${count} tab${count > 1 ? 's' : ''} closed`, {
                actions: [{ label: 'Undo', onClick: () => { useWorkspaceStore.getState().undoCloseFiles() } }],
              })
            }
            onClose()
          }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
          role="menuitem"
        >
          Close Saved
        </button>
      )}
      <button
        onClick={() => {
          if (openFiles.some(f => dirtyFiles.has(f))) {
            onDirtyCloseAll()
          } else {
            const count = openFiles.filter(f => !pinnedFiles.has(f)).length
            onCloseAll()
            if (count > 0) {
              addToast('info', 'All tabs closed', `${count} tab${count > 1 ? 's' : ''} closed`, {
                actions: [{ label: 'Undo', onClick: () => { useWorkspaceStore.getState().undoCloseFiles() } }],
              })
            }
          }
          onClose()
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
        role="menuitem"
      >
        Close All
      </button>
      <div className="my-1 border-t border-glass-border" />
      <button
        onClick={() => {
          if (tabContextMenu.path) {
            onTogglePin(tabContextMenu.path)
          }
          onClose()
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
        role="menuitem"
      >
        {tabContextMenu.path && pinnedFiles.has(tabContextMenu.path) ? 'Unpin Tab' : 'Pin Tab'}
      </button>
      <button
        onClick={() => {
          if (tabContextMenu.path) {
            onSplitRight(tabContextMenu.path)
          }
          onClose()
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
        role="menuitem"
      >
        Split Right
      </button>
      <button
        onClick={() => {
          onReopenClosed()
          onClose()
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
        role="menuitem"
      >
        Reopen Closed Editor
      </button>
      <div className="my-1 border-t border-glass-border" />
      <button
        onClick={() => {
          if (tabContextMenu.path) {
            onCopyPath(tabContextMenu.path)
          }
          onClose()
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
        role="menuitem"
      >
        Copy Path
      </button>
      <button
        onClick={() => {
          if (tabContextMenu.path) {
            onCopyRelativePath(tabContextMenu.path)
          }
          onClose()
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-card-hover transition-colors"
        role="menuitem"
      >
        Copy Relative Path
      </button>
    </div>
  )
}
