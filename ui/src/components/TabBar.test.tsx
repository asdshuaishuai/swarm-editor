import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TabBar } from './TabBar'

vi.mock('lucide-react', () => ({
  MoreHorizontal: () => <svg data-testid="more-icon" />,
  X: () => <svg data-testid="x-icon" />,
  Pin: () => <svg data-testid="pin-icon" />,
}))

vi.mock('../utils', () => ({
  getFileIcon: () => (props: any) => <svg {...props} data-testid="file-icon" />,
  getFileIconColor: () => '',
}))

vi.mock('../hooks/useMenuKeyboardNav', () => ({
  useMenuKeyboardNav: () => vi.fn(),
}))

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn()

const defaults = {
  openFiles: ['src/App.tsx', 'src/utils.ts', 'src/index.ts'],
  currentFile: 'src/App.tsx' as string | null,
  dirtyFiles: new Set<string>(),
  pinnedFiles: new Set<string>(),
  onTabClick: vi.fn(),
  onTabClose: vi.fn(),
}

describe('TabBar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders nothing when openFiles is empty', () => {
    const { container } = render(<TabBar {...defaults} openFiles={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders a tab for each open file', () => {
    render(<TabBar {...defaults} />)
    expect(screen.getByTitle('src/App.tsx')).toBeInTheDocument()
    expect(screen.getByTitle('src/utils.ts')).toBeInTheDocument()
    expect(screen.getByTitle('src/index.ts')).toBeInTheDocument()
  })

  it('shows filename (not full path) in each tab', () => {
    render(<TabBar {...defaults} />)
    expect(screen.getByText('App.tsx')).toBeInTheDocument()
    expect(screen.getByText('utils.ts')).toBeInTheDocument()
    expect(screen.getByText('index.ts')).toBeInTheDocument()
  })

  it('marks the current file as aria-selected', () => {
    render(<TabBar {...defaults} currentFile="src/utils.ts" />)
    const tabs = screen.getAllByRole('tab')
    const selected = tabs.find(t => t.getAttribute('aria-selected') === 'true')
    expect(selected?.getAttribute('data-path')).toBe('src/utils.ts')
  })

  it('calls onTabClick when a tab is clicked', () => {
    render(<TabBar {...defaults} />)
    fireEvent.click(screen.getByText('utils.ts'))
    expect(defaults.onTabClick).toHaveBeenCalledWith('src/utils.ts')
  })

  it('calls onTabClose when close button is clicked', () => {
    render(<TabBar {...defaults} />)
    const closeButtons = screen.getAllByLabelText('Close tab')
    fireEvent.click(closeButtons[1])
    expect(defaults.onTabClose).toHaveBeenCalledWith('src/utils.ts')
  })

  it('shows dirty indicator for modified files', () => {
    render(<TabBar {...defaults} dirtyFiles={new Set(['src/utils.ts'])} />)
    const tabs = screen.getAllByRole('tab')
    const utilsTab = tabs.find(t => t.getAttribute('data-path') === 'src/utils.ts')
    expect(utilsTab?.querySelector('[title="Unsaved changes"]')).toBeTruthy()
  })

  it('does not show close button for pinned tabs', () => {
    render(<TabBar {...defaults} pinnedFiles={new Set(['src/App.tsx'])} />)
    const tabs = screen.getAllByRole('tab')
    const pinnedTab = tabs.find(t => t.getAttribute('data-path') === 'src/App.tsx')
    expect(pinnedTab?.querySelector('[aria-label="Close tab"]')).toBeNull()
  })

  it('shows tab actions menu when MoreHorizontal is clicked (multiple tabs)', () => {
    render(<TabBar {...defaults} />)
    const menuBtn = screen.getByLabelText('Tab actions menu')
    fireEvent.click(menuBtn)
    expect(screen.getByText('Close Others')).toBeInTheDocument()
    expect(screen.getByText('Close All')).toBeInTheDocument()
  })

  it('does not show tab actions menu for single tab', () => {
    render(<TabBar {...defaults} openFiles={['src/App.tsx']} />)
    expect(screen.queryByLabelText('Tab actions menu')).toBeNull()
  })

  it('calls onCloseAll from menu', () => {
    const onCloseAll = vi.fn()
    render(<TabBar {...defaults} onCloseAll={onCloseAll} />)
    fireEvent.click(screen.getByLabelText('Tab actions menu'))
    fireEvent.click(screen.getByText('Close All'))
    expect(onCloseAll).toHaveBeenCalled()
  })

  it('calls onCloseOthers from menu', () => {
    const onCloseOthers = vi.fn()
    render(<TabBar {...defaults} onCloseOthers={onCloseOthers} />)
    fireEvent.click(screen.getByLabelText('Tab actions menu'))
    fireEvent.click(screen.getByText('Close Others'))
    expect(onCloseOthers).toHaveBeenCalled()
  })

  it('calls onCloseSaved from menu', () => {
    const onCloseSaved = vi.fn()
    render(<TabBar {...defaults} onCloseSaved={onCloseSaved} />)
    fireEvent.click(screen.getByLabelText('Tab actions menu'))
    fireEvent.click(screen.getByText('Close Saved'))
    expect(onCloseSaved).toHaveBeenCalled()
  })

  it('renders scroll left and right buttons', () => {
    render(<TabBar {...defaults} />)
    expect(screen.getByLabelText('Scroll tabs left')).toBeInTheDocument()
    expect(screen.getByLabelText('Scroll tabs right')).toBeInTheDocument()
  })

  it('has role=tablist', () => {
    render(<TabBar {...defaults} />)
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })
})
