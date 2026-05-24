import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, createEvent } from '@testing-library/react'
import { EditorTab } from './EditorTab'

vi.mock('lucide-react', () => ({
  X: (props: Record<string, unknown>) => <svg {...props} data-testid="x-icon" />,
  Pin: (props: Record<string, unknown>) => <svg {...props} data-testid="pin-icon" />,
}))

vi.mock('../utils', () => ({
  getFileIcon: () => (props: Record<string, unknown>) => <svg {...props} data-testid="file-icon" />,
  getFileIconColor: () => '',
}))

const defaults = {
  path: 'src/components/App.tsx',
  isActive: false,
  isDirty: false,
  onClick: vi.fn(),
  onClose: vi.fn(),
}

describe('EditorTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // --- Rendering ---

  it('shows filename from path', () => {
    render(<EditorTab {...defaults} />)
    expect(screen.getByText('App.tsx')).toBeInTheDocument()
  })

  it('shows filename for path without directory', () => {
    render(<EditorTab {...defaults} path="readme.md" />)
    expect(screen.getByText('readme.md')).toBeInTheDocument()
  })

  it('renders file icon when not pinned', () => {
    render(<EditorTab {...defaults} />)
    expect(screen.getByTestId('file-icon')).toBeInTheDocument()
  })

  it('renders pin icon instead of file icon when pinned', () => {
    render(<EditorTab {...defaults} isPinned />)
    expect(screen.getByTestId('pin-icon')).toBeInTheDocument()
    expect(screen.queryByTestId('file-icon')).toBeNull()
  })

  it('pin icon has "Pinned" title', () => {
    render(<EditorTab {...defaults} isPinned />)
    expect(screen.getByTitle('Pinned')).toBeInTheDocument()
  })

  // --- Data attributes ---

  it('sets data-path attribute', () => {
    const { container } = render(<EditorTab {...defaults} />)
    expect(container.querySelector('[data-path="src/components/App.tsx"]')).toBeTruthy()
  })

  it('sets data-path for simple filename', () => {
    const { container } = render(<EditorTab {...defaults} path="foo.ts" />)
    expect(container.querySelector('[data-path="foo.ts"]')).toBeTruthy()
  })

  // --- Click interactions ---

  it('calls onClick when clicked', () => {
    render(<EditorTab {...defaults} />)
    fireEvent.click(screen.getByText('App.tsx'))
    expect(defaults.onClick).toHaveBeenCalled()
  })

  it('calls onClose when close button clicked', () => {
    render(<EditorTab {...defaults} />)
    fireEvent.click(screen.getByLabelText('Close tab'))
    expect(defaults.onClose).toHaveBeenCalled()
  })

  it('close button stopPropagation prevents tab click', () => {
    const onClick = vi.fn()
    render(<EditorTab {...defaults} onClick={onClick} />)
    fireEvent.click(screen.getByLabelText('Close tab'))
    expect(defaults.onClose).toHaveBeenCalled()
    expect(onClick).not.toHaveBeenCalled()
  })

  // --- Dirty state ---

  it('shows dirty indicator when isDirty', () => {
    render(<EditorTab {...defaults} isDirty />)
    expect(screen.getByTitle('Unsaved changes')).toBeInTheDocument()
  })

  it('hides dirty indicator when not dirty', () => {
    render(<EditorTab {...defaults} />)
    expect(screen.queryByTitle('Unsaved changes')).toBeNull()
  })

  it('dirty indicator has correct styling classes', () => {
    render(<EditorTab {...defaults} isDirty />)
    const dot = screen.getByTitle('Unsaved changes')
    expect(dot.className).toContain('bg-accent')
  })

  // --- Pinned state ---

  it('hides close button when pinned', () => {
    render(<EditorTab {...defaults} isPinned />)
    expect(screen.queryByLabelText('Close tab')).toBeNull()
  })

  it('shows close button when not pinned', () => {
    render(<EditorTab {...defaults} />)
    expect(screen.getByLabelText('Close tab')).toBeInTheDocument()
  })

  // --- Active state ---

  it('applies active styles when isActive', () => {
    const { container } = render(<EditorTab {...defaults} isActive />)
    const tab = container.firstChild as HTMLElement
    expect(tab.className).toContain('bg-accent/10')
    expect(tab.className).toContain('border-accent')
  })

  it('applies inactive styles when not active', () => {
    const { container } = render(<EditorTab {...defaults} />)
    const tab = container.firstChild as HTMLElement
    expect(tab.className).toContain('bg-transparent')
    expect(tab.className).toContain('border-transparent')
  })

  it('close button is fully visible on active tab', () => {
    render(<EditorTab {...defaults} isActive />)
    const closeBtn = screen.getByLabelText('Close tab')
    expect(closeBtn.className).toContain('opacity-100')
  })

  it('close button is hidden by default on inactive tab', () => {
    render(<EditorTab {...defaults} />)
    const closeBtn = screen.getByLabelText('Close tab')
    expect(closeBtn.className).toContain('opacity-0')
  })

  // --- Preview state ---

  it('renders with preview italic style', () => {
    const { container } = render(<EditorTab {...defaults} isPreview />)
    const tab = container.firstChild as HTMLElement
    expect(tab.className).toContain('italic')
  })

  it('preview tab has reduced opacity', () => {
    const { container } = render(<EditorTab {...defaults} isPreview />)
    const tab = container.firstChild as HTMLElement
    expect(tab.className).toContain('opacity-80')
  })

  it('preview style not applied when pinned', () => {
    const { container } = render(<EditorTab {...defaults} isPreview isPinned />)
    const tab = container.firstChild as HTMLElement
    expect(tab.className).not.toContain('italic')
  })

  it('preview style not applied when dirty', () => {
    const { container } = render(<EditorTab {...defaults} isPreview isDirty />)
    const tab = container.firstChild as HTMLElement
    expect(tab.className).not.toContain('italic')
  })

  // --- Context menu ---

  it('calls onContextMenu on right-click', () => {
    const onContextMenu = vi.fn()
    render(<EditorTab {...defaults} onContextMenu={onContextMenu} />)
    fireEvent.contextMenu(screen.getByText('App.tsx'))
    expect(onContextMenu).toHaveBeenCalledWith(expect.anything(), 'src/components/App.tsx')
  })

  it('prevents default on context menu', () => {
    const onContextMenu = vi.fn()
    const { container } = render(<EditorTab {...defaults} onContextMenu={onContextMenu} />)
    const tab = container.firstChild as HTMLElement
    const event = createEvent.contextMenu(tab)
    fireEvent(tab, event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('does not set contextMenu handler when onContextMenu is undefined', () => {
    const { container } = render(<EditorTab {...defaults} />)
    const tab = container.firstChild as HTMLElement
    expect(tab.oncontextmenu).toBeNull()
  })

  // --- Double click ---

  it('calls onDoubleClick when double-clicked', () => {
    const onDoubleClick = vi.fn()
    render(<EditorTab {...defaults} onDoubleClick={onDoubleClick} />)
    fireEvent.doubleClick(screen.getByText('App.tsx'))
    expect(onDoubleClick).toHaveBeenCalled()
  })

  // --- Middle mouse button (onAuxClick) ---
  // React registers onAuxClick via event delegation on the root. We simulate by
  // dispatching an auxclick event (lowercase) which is what React's DOM plugin listens for.

  it('calls onClose on middle mouse click (button 1)', () => {
    const onClose = vi.fn()
    render(<EditorTab {...defaults} onClose={onClose} />)
    const filename = screen.getByText('App.tsx')
    const tab = filename.closest('[data-path]') as HTMLElement
    const event = new window.MouseEvent('auxclick', { bubbles: true, button: 1 })
    tab.dispatchEvent(event)
    expect(onClose).toHaveBeenCalled()
  })

  it('does not call onClose on middle click when pinned', () => {
    const onClose = vi.fn()
    render(<EditorTab {...defaults} isPinned onClose={onClose} />)
    const filename = screen.getByText('App.tsx')
    const tab = filename.closest('[data-path]') as HTMLElement
    const event = new window.MouseEvent('auxclick', { bubbles: true, button: 1 })
    tab.dispatchEvent(event)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not call onClose on non-middle mouse auxclick', () => {
    const onClose = vi.fn()
    render(<EditorTab {...defaults} onClose={onClose} />)
    const filename = screen.getByText('App.tsx')
    const tab = filename.closest('[data-path]') as HTMLElement
    const event = new window.MouseEvent('auxclick', { bubbles: true, button: 2 })
    tab.dispatchEvent(event)
    expect(onClose).not.toHaveBeenCalled()
  })

  // --- Close button title ---

  it('close button has "Close" title', () => {
    render(<EditorTab {...defaults} />)
    const closeBtn = screen.getByLabelText('Close tab')
    expect(closeBtn).toHaveAttribute('title', 'Close')
  })

  // --- Pinned class ---

  it('applies pinned padding class when pinned', () => {
    const { container } = render(<EditorTab {...defaults} isPinned />)
    const tab = container.firstChild as HTMLElement
    expect(tab.className).toContain('pr-2')
  })
})
