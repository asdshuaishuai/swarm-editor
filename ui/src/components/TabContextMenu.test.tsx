import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TabContextMenu } from './TabContextMenu'

vi.mock('../stores/workspaceStore', () => ({
  useWorkspaceStore: { getState: () => ({ undoCloseFiles: vi.fn() }) },
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

  it('renders nothing when not visible', () => {
    render(<TabContextMenu {...defaults} tabContextMenu={{ visible: false, x: 0, y: 0, path: null }} />)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('renders context menu when visible', () => {
    render(<TabContextMenu {...defaults} />)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByText('Close')).toBeInTheDocument()
  })

  it('positions menu at x,y', () => {
    render(<TabContextMenu {...defaults} />)
    const menu = screen.getByRole('menu')
    expect(menu.style.left).toBe('100px')
    expect(menu.style.top).toBe('200px')
  })

  it('calls onCloseTab and onClose when Close clicked', () => {
    render(<TabContextMenu {...defaults} />)
    fireEvent.click(screen.getByText('Close'))
    expect(defaults.onCloseTab).toHaveBeenCalledWith('src/App.tsx')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows Close Others when multiple tabs', () => {
    render(<TabContextMenu {...defaults} />)
    expect(screen.getByText('Close Others')).toBeInTheDocument()
  })

  it('hides Close Others for single tab', () => {
    render(<TabContextMenu {...defaults} openFiles={['src/App.tsx']} />)
    expect(screen.queryByText('Close Others')).toBeNull()
  })

  it('shows Close to Left when not first tab', () => {
    render(<TabContextMenu {...defaults} tabContextMenu={{ visible: true, x: 0, y: 0, path: 'src/utils.ts' }} />)
    expect(screen.getByText('Close to Left')).toBeInTheDocument()
  })

  it('hides Close to Left for first tab', () => {
    render(<TabContextMenu {...defaults} />)
    expect(screen.queryByText('Close to Left')).toBeNull()
  })

  it('shows Pin Tab when not pinned', () => {
    render(<TabContextMenu {...defaults} />)
    expect(screen.getByText('Pin Tab')).toBeInTheDocument()
  })

  it('shows Unpin Tab when pinned', () => {
    render(<TabContextMenu {...defaults} pinnedFiles={new Set(['src/App.tsx'])} />)
    expect(screen.getByText('Unpin Tab')).toBeInTheDocument()
  })

  it('calls onTogglePin and onClose when Pin clicked', () => {
    render(<TabContextMenu {...defaults} />)
    fireEvent.click(screen.getByText('Pin Tab'))
    expect(defaults.onTogglePin).toHaveBeenCalledWith('src/App.tsx')
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onCopyPath when Copy Path clicked', () => {
    render(<TabContextMenu {...defaults} />)
    fireEvent.click(screen.getByText('Copy Path'))
    expect(defaults.onCopyPath).toHaveBeenCalledWith('src/App.tsx')
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onCopyRelativePath when Copy Relative Path clicked', () => {
    render(<TabContextMenu {...defaults} />)
    fireEvent.click(screen.getByText('Copy Relative Path'))
    expect(defaults.onCopyRelativePath).toHaveBeenCalledWith('src/App.tsx')
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onSplitRight when Split Right clicked', () => {
    render(<TabContextMenu {...defaults} />)
    fireEvent.click(screen.getByText('Split Right'))
    expect(defaults.onSplitRight).toHaveBeenCalledWith('src/App.tsx')
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onReopenClosed when Reopen Closed Editor clicked', () => {
    render(<TabContextMenu {...defaults} />)
    fireEvent.click(screen.getByText('Reopen Closed Editor'))
    expect(defaults.onReopenClosed).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('shows Close to Right when not last tab', () => {
    render(<TabContextMenu {...defaults} />)
    expect(screen.getByText('Close to Right')).toBeInTheDocument()
  })

  it('hides Close to Right for last tab', () => {
    render(<TabContextMenu {...defaults} tabContextMenu={{ visible: true, x: 0, y: 0, path: 'src/index.ts' }} />)
    expect(screen.queryByText('Close to Right')).toBeNull()
  })
})
