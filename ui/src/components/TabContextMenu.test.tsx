import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TabContextMenu } from './TabContextMenu'

const undoCloseFilesMock = vi.fn()

vi.mock('../stores/workspaceStore', () => ({
  useWorkspaceStore: { getState: () => ({ undoCloseFiles: undoCloseFilesMock }) },
}))

const addToast = vi.fn()
const onClose = vi.fn()

const baseCtx = { visible: true, x: 100, y: 200, path: 'src/App.tsx' }

const defaults = {
  tabContextMenu: baseCtx,
  tabContextMenuRef: { current: null },
  tabMenuKeyDown: vi.fn(),
  openFiles: ['src/App.tsx', 'src/utils.ts', 'src/index.ts'],
  dirtyFiles: new Set<string>(),
  pinnedFiles: new Set<string>(),
  onClose,
  onCloseTab: vi.fn(),
  onCloseOthers: vi.fn(),
  onCloseToLeft: vi.fn(),
  onCloseToRight: vi.fn(),
  onCloseSaved: vi.fn(),
  onCloseAll: vi.fn(),
  onTogglePin: vi.fn(),
  onSplitRight: vi.fn(),
  onReopenClosed: vi.fn(),
  onCopyPath: vi.fn(),
  onCopyRelativePath: vi.fn(),
  onDirtyCloseAll: vi.fn(),
  addToast,
}

describe('TabContextMenu', () => {
  beforeEach(() => vi.clearAllMocks())

  // --- Rendering ---

  it('renders nothing when not visible', () => {
    render(<TabContextMenu {...defaults} tabContextMenu={{ visible: false, x: 0, y: 0, path: null }} />)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('renders nothing when path is null', () => {
    render(<TabContextMenu {...defaults} tabContextMenu={{ visible: true, x: 0, y: 0, path: null }} />)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('renders context menu when visible with path', () => {
    render(<TabContextMenu {...defaults} />)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByText('Close')).toBeInTheDocument()
  })

  it('has correct aria-label', () => {
    render(<TabContextMenu {...defaults} />)
    expect(screen.getByRole('menu')).toHaveAttribute('aria-label', 'Tab context menu')
  })

  it('positions menu at x,y', () => {
    render(<TabContextMenu {...defaults} />)
    const menu = screen.getByRole('menu')
    expect(menu.style.left).toBe('100px')
    expect(menu.style.top).toBe('200px')
  })

  it('applies ref to menu container', () => {
    const ref = { current: null }
    render(<TabContextMenu {...defaults} tabContextMenuRef={ref} />)
    expect(ref.current).toBe(screen.getByRole('menu'))
  })

  it('calls tabMenuKeyDown on keydown', () => {
    const keyDown = vi.fn()
    render(<TabContextMenu {...defaults} tabMenuKeyDown={keyDown} />)
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    expect(keyDown).toHaveBeenCalled()
  })

  it('stopPropagation on click', () => {
    const parentClick = vi.fn()
    render(
      <div onClick={parentClick}>
        <TabContextMenu {...defaults} />
      </div>
    )
    fireEvent.click(screen.getByRole('menu'))
    expect(parentClick).not.toHaveBeenCalled()
  })

  // --- Close ---

  it('calls onCloseTab and onClose when Close clicked', () => {
    render(<TabContextMenu {...defaults} />)
    fireEvent.click(screen.getByText('Close'))
    expect(defaults.onCloseTab).toHaveBeenCalledWith('src/App.tsx')
    expect(onClose).toHaveBeenCalled()
  })

  // --- Close Others ---

  it('shows Close Others when multiple tabs', () => {
    render(<TabContextMenu {...defaults} />)
    expect(screen.getByText('Close Others')).toBeInTheDocument()
  })

  it('hides Close Others for single tab', () => {
    render(<TabContextMenu {...defaults} openFiles={['src/App.tsx']} />)
    expect(screen.queryByText('Close Others')).toBeNull()
  })

  it('calls onCloseOthers and onClose when Close Others clicked', () => {
    render(<TabContextMenu {...defaults} />)
    fireEvent.click(screen.getByText('Close Others'))
    expect(defaults.onCloseOthers).toHaveBeenCalledWith('src/App.tsx')
    expect(onClose).toHaveBeenCalled()
  })

  // --- Close to Left ---

  it('shows Close to Left when not first tab', () => {
    render(<TabContextMenu {...defaults} tabContextMenu={{ visible: true, x: 0, y: 0, path: 'src/utils.ts' }} />)
    expect(screen.getByText('Close to Left')).toBeInTheDocument()
  })

  it('hides Close to Left for first tab', () => {
    render(<TabContextMenu {...defaults} />)
    expect(screen.queryByText('Close to Left')).toBeNull()
  })

  it('calls onCloseToLeft and onClose when Close to Left clicked', () => {
    render(<TabContextMenu {...defaults} tabContextMenu={{ visible: true, x: 0, y: 0, path: 'src/utils.ts' }} />)
    fireEvent.click(screen.getByText('Close to Left'))
    expect(defaults.onCloseToLeft).toHaveBeenCalledWith('src/utils.ts')
    expect(onClose).toHaveBeenCalled()
  })

  // --- Close to Right ---

  it('shows Close to Right when not last tab', () => {
    render(<TabContextMenu {...defaults} />)
    expect(screen.getByText('Close to Right')).toBeInTheDocument()
  })

  it('hides Close to Right for last tab', () => {
    render(<TabContextMenu {...defaults} tabContextMenu={{ visible: true, x: 0, y: 0, path: 'src/index.ts' }} />)
    expect(screen.queryByText('Close to Right')).toBeNull()
  })

  it('calls onCloseToRight and onClose when Close to Right clicked', () => {
    render(<TabContextMenu {...defaults} />)
    fireEvent.click(screen.getByText('Close to Right'))
    expect(defaults.onCloseToRight).toHaveBeenCalledWith('src/App.tsx')
    expect(onClose).toHaveBeenCalled()
  })

  // --- Close Saved ---

  it('shows Close Saved when there are saved files besides current', () => {
    render(<TabContextMenu {...defaults} />)
    expect(screen.getByText('Close Saved')).toBeInTheDocument()
  })

  it('hides Close Saved when all other files are dirty', () => {
    render(
      <TabContextMenu
        {...defaults}
        dirtyFiles={new Set(['src/utils.ts', 'src/index.ts'])}
      />
    )
    expect(screen.queryByText('Close Saved')).toBeNull()
  })

  it('hides Close Saved when only one file', () => {
    render(<TabContextMenu {...defaults} openFiles={['src/App.tsx']} />)
    expect(screen.queryByText('Close Saved')).toBeNull()
  })

  it('calls onCloseSaved and shows toast with count when Close Saved clicked', () => {
    // 3 files, none dirty, none pinned => count = 3
    render(<TabContextMenu {...defaults} />)
    fireEvent.click(screen.getByText('Close Saved'))
    expect(defaults.onCloseSaved).toHaveBeenCalled()
    expect(addToast).toHaveBeenCalledWith('info', 'Saved tabs closed', '3 tabs closed', expect.objectContaining({
      actions: expect.arrayContaining([expect.objectContaining({ label: 'Undo' })]),
    }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows singular toast when exactly 1 saved unpinned file', () => {
    // 2 files, 1 is pinned => count = 1
    render(
      <TabContextMenu
        {...defaults}
        openFiles={['src/App.tsx', 'src/utils.ts']}
        pinnedFiles={new Set(['src/App.tsx'])}
      />
    )
    fireEvent.click(screen.getByText('Close Saved'))
    expect(addToast).toHaveBeenCalledWith('info', 'Saved tabs closed', '1 tab closed', expect.anything())
  })

  // --- Close All ---

  it('calls onDirtyCloseAll when dirty files exist and Close All clicked', () => {
    render(
      <TabContextMenu
        {...defaults}
        dirtyFiles={new Set(['src/utils.ts'])}
      />
    )
    fireEvent.click(screen.getByText('Close All'))
    expect(defaults.onDirtyCloseAll).toHaveBeenCalled()
    expect(defaults.onCloseAll).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onCloseAll and shows toast when no dirty files and Close All clicked', () => {
    render(<TabContextMenu {...defaults} />)
    fireEvent.click(screen.getByText('Close All'))
    expect(defaults.onCloseAll).toHaveBeenCalled()
    expect(defaults.onDirtyCloseAll).not.toHaveBeenCalled()
    expect(addToast).toHaveBeenCalledWith('info', 'All tabs closed', expect.stringContaining('tabs closed'), expect.anything())
    expect(onClose).toHaveBeenCalled()
  })

  it('shows singular toast for Close All with 1 unpinned file', () => {
    render(
      <TabContextMenu
        {...defaults}
        openFiles={['src/App.tsx']}
        pinnedFiles={new Set<string>()}
      />
    )
    fireEvent.click(screen.getByText('Close All'))
    expect(addToast).toHaveBeenCalledWith('info', 'All tabs closed', '1 tab closed', expect.anything())
  })

  it('does not show toast for Close All when all files are pinned', () => {
    render(
      <TabContextMenu
        {...defaults}
        openFiles={['src/App.tsx']}
        pinnedFiles={new Set(['src/App.tsx'])}
      />
    )
    fireEvent.click(screen.getByText('Close All'))
    expect(addToast).not.toHaveBeenCalled()
  })

  // --- Pin Tab ---

  it('shows Pin Tab when not pinned', () => {
    render(<TabContextMenu {...defaults} />)
    expect(screen.getByText('Pin Tab')).toBeInTheDocument()
  })

  it('shows Unpin Tab when pinned', () => {
    render(<TabContextMenu {...defaults} pinnedFiles={new Set(['src/App.tsx'])} />)
    expect(screen.getByText('Unpin Tab')).toBeInTheDocument()
  })

  it('calls onTogglePin and onClose when Pin Tab clicked', () => {
    render(<TabContextMenu {...defaults} />)
    fireEvent.click(screen.getByText('Pin Tab'))
    expect(defaults.onTogglePin).toHaveBeenCalledWith('src/App.tsx')
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onTogglePin and onClose when Unpin Tab clicked', () => {
    render(<TabContextMenu {...defaults} pinnedFiles={new Set(['src/App.tsx'])} />)
    fireEvent.click(screen.getByText('Unpin Tab'))
    expect(defaults.onTogglePin).toHaveBeenCalledWith('src/App.tsx')
    expect(onClose).toHaveBeenCalled()
  })

  // --- Split Right ---

  it('calls onSplitRight and onClose when Split Right clicked', () => {
    render(<TabContextMenu {...defaults} />)
    fireEvent.click(screen.getByText('Split Right'))
    expect(defaults.onSplitRight).toHaveBeenCalledWith('src/App.tsx')
    expect(onClose).toHaveBeenCalled()
  })

  // --- Reopen Closed ---

  it('calls onReopenClosed and onClose when Reopen Closed Editor clicked', () => {
    render(<TabContextMenu {...defaults} />)
    fireEvent.click(screen.getByText('Reopen Closed Editor'))
    expect(defaults.onReopenClosed).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  // --- Copy Path ---

  it('calls onCopyPath and onClose when Copy Path clicked', () => {
    render(<TabContextMenu {...defaults} />)
    fireEvent.click(screen.getByText('Copy Path'))
    expect(defaults.onCopyPath).toHaveBeenCalledWith('src/App.tsx')
    expect(onClose).toHaveBeenCalled()
  })

  // --- Copy Relative Path ---

  it('calls onCopyRelativePath and onClose when Copy Relative Path clicked', () => {
    render(<TabContextMenu {...defaults} />)
    fireEvent.click(screen.getByText('Copy Relative Path'))
    expect(defaults.onCopyRelativePath).toHaveBeenCalledWith('src/App.tsx')
    expect(onClose).toHaveBeenCalled()
  })

  // --- Separator dividers ---

  it('renders two separator dividers', () => {
    render(<TabContextMenu {...defaults} />)
    const dividers = screen.getByRole('menu').querySelectorAll('.border-t')
    expect(dividers.length).toBe(2)
  })

  // --- Edge cases ---

  it('handles path not in openFiles gracefully', () => {
    render(
      <TabContextMenu
        {...defaults}
        tabContextMenu={{ visible: true, x: 0, y: 0, path: 'unknown.ts' }}
        openFiles={['src/App.tsx']}
      />
    )
    // hasOthers = false (only 1 file), so Close Others is hidden
    expect(screen.queryByText('Close Others')).toBeNull()
    // hasLeft = false (indexOf returns -1, -1 > 0 is false)
    expect(screen.queryByText('Close to Left')).toBeNull()
    // hasRight = false (-1 >= 0 is true but -1 < 0 is false... wait: -1 < 1-1=0 is false too)
    // Actually: ctxIdx = -1, hasRight = -1 >= 0 && -1 < 1 = true && false = false
    expect(screen.queryByText('Close to Right')).toBeNull()
  })

  it('Undo action in Close Saved toast calls undoCloseFiles', () => {
    render(<TabContextMenu {...defaults} />)
    fireEvent.click(screen.getByText('Close Saved'))
    const toastCall = addToast.mock.calls[0]
    const toastOptions = toastCall[3]
    expect(toastOptions.actions[0].label).toBe('Undo')
    toastOptions.actions[0].onClick()
    expect(undoCloseFilesMock).toHaveBeenCalled()
  })

  it('Undo action in Close All toast calls undoCloseFiles', () => {
    render(<TabContextMenu {...defaults} />)
    fireEvent.click(screen.getByText('Close All'))
    const toastCall = addToast.mock.calls[0]
    const toastOptions = toastCall[3]
    expect(toastOptions.actions[0].label).toBe('Undo')
    toastOptions.actions[0].onClick()
    expect(undoCloseFilesMock).toHaveBeenCalled()
  })

  // --- All menu items are menuitem role ---

  it('all buttons have menuitem role', () => {
    render(<TabContextMenu {...defaults} />)
    const items = screen.getAllByRole('menuitem')
    // Close, Close Others, Close to Right, Close Saved, Close All, Pin Tab, Split Right, Reopen Closed, Copy Path, Copy Relative Path = 10
    expect(items.length).toBeGreaterThanOrEqual(8)
    for (const item of items) {
      expect(item.tagName).toBe('BUTTON')
    }
  })
})
