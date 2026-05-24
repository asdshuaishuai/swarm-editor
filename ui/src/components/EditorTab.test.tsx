import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EditorTab } from './EditorTab'

vi.mock('lucide-react', () => ({
  X: (props: any) => <svg {...props} data-testid="x-icon" />,
  Pin: (props: any) => <svg {...props} data-testid="pin-icon" />,
}))

vi.mock('../utils', () => ({
  getFileIcon: () => (props: any) => <svg {...props} data-testid="file-icon" />,
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
  it('shows filename from path', () => {
    render(<EditorTab {...defaults} />)
    expect(screen.getByText('App.tsx')).toBeInTheDocument()
  })

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
  })

  it('shows dirty indicator when isDirty', () => {
    render(<EditorTab {...defaults} isDirty />)
    expect(screen.getByTitle('Unsaved changes')).toBeInTheDocument()
  })

  it('hides dirty indicator when not dirty', () => {
    render(<EditorTab {...defaults} />)
    expect(screen.queryByTitle('Unsaved changes')).toBeNull()
  })

  it('shows pin icon instead of file icon when pinned', () => {
    render(<EditorTab {...defaults} isPinned />)
    expect(screen.getByTestId('pin-icon')).toBeInTheDocument()
  })

  it('hides close button when pinned', () => {
    render(<EditorTab {...defaults} isPinned />)
    expect(screen.queryByLabelText('Close tab')).toBeNull()
  })

  it('sets data-path attribute', () => {
    const { container } = render(<EditorTab {...defaults} />)
    expect(container.querySelector('[data-path="src/components/App.tsx"]')).toBeTruthy()
  })

  it('calls onContextMenu on right-click', () => {
    const onContextMenu = vi.fn()
    render(<EditorTab {...defaults} onContextMenu={onContextMenu} />)
    fireEvent.contextMenu(screen.getByText('App.tsx'))
    expect(onContextMenu).toHaveBeenCalledWith(expect.anything(), 'src/components/App.tsx')
  })

  it('renders with preview italic style', () => {
    const { container } = render(<EditorTab {...defaults} isPreview />)
    const tab = container.firstChild as HTMLElement
    expect(tab.className).toContain('italic')
  })

  it('calls onDoubleClick when double-clicked', () => {
    const onDoubleClick = vi.fn()
    render(<EditorTab {...defaults} onDoubleClick={onDoubleClick} />)
    fireEvent.doubleClick(screen.getByText('App.tsx'))
    expect(onDoubleClick).toHaveBeenCalled()
  })
})
