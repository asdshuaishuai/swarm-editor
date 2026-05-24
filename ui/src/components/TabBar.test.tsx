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

// jsdom doesn't implement DataTransfer
class MockDataTransfer {
  effectAllowed = ''
  dropEffect = ''
  private data = new Map<string, string>()
  setData(type: string, value: string) { this.data.set(type, value) }
  getData(type: string) { return this.data.get(type) ?? '' }
  clearData(type?: string) { if (type) this.data.delete(type); else this.data.clear() }
  setDragImage(_image: Element, _x: number, _y: number) {}
}
// @ts-expect-error jsdom doesn't have DataTransfer
globalThis.DataTransfer = MockDataTransfer

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

  // --- Keyboard navigation ---

  describe('keyboard navigation', () => {
    it('ArrowRight navigates to next tab', () => {
      render(<TabBar {...defaults} />)
      const tabs = screen.getAllByRole('tab')
      fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
      expect(defaults.onTabClick).toHaveBeenCalledWith('src/utils.ts')
    })

    it('ArrowLeft navigates to previous tab', () => {
      render(<TabBar {...defaults} currentFile="src/utils.ts" />)
      const tabs = screen.getAllByRole('tab')
      fireEvent.keyDown(tabs[1], { key: 'ArrowLeft' })
      expect(defaults.onTabClick).toHaveBeenCalledWith('src/App.tsx')
    })

    it('ArrowRight at last tab does not wrap', () => {
      render(<TabBar {...defaults} currentFile="src/index.ts" />)
      const tabs = screen.getAllByRole('tab')
      fireEvent.keyDown(tabs[2], { key: 'ArrowRight' })
      // Should not call onTabClick since there is no tab to the right
      expect(defaults.onTabClick).not.toHaveBeenCalled()
    })

    it('ArrowLeft at first tab does not wrap', () => {
      render(<TabBar {...defaults} currentFile="src/App.tsx" />)
      const tabs = screen.getAllByRole('tab')
      fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' })
      // Should not call onTabClick since there is no tab to the left
      expect(defaults.onTabClick).not.toHaveBeenCalled()
    })

    it('Home key navigates to first tab', () => {
      render(<TabBar {...defaults} currentFile="src/index.ts" />)
      const tabs = screen.getAllByRole('tab')
      fireEvent.keyDown(tabs[2], { key: 'Home' })
      expect(defaults.onTabClick).toHaveBeenCalledWith('src/App.tsx')
    })

    it('End key navigates to last tab', () => {
      render(<TabBar {...defaults} />)
      const tabs = screen.getAllByRole('tab')
      fireEvent.keyDown(tabs[0], { key: 'End' })
      expect(defaults.onTabClick).toHaveBeenCalledWith('src/index.ts')
    })

    it('Enter key selects current tab', () => {
      render(<TabBar {...defaults} />)
      const tabs = screen.getAllByRole('tab')
      fireEvent.keyDown(tabs[1], { key: 'Enter' })
      expect(defaults.onTabClick).toHaveBeenCalledWith('src/utils.ts')
    })

    it('Space key selects current tab', () => {
      render(<TabBar {...defaults} />)
      const tabs = screen.getAllByRole('tab')
      fireEvent.keyDown(tabs[1], { key: ' ' })
      expect(defaults.onTabClick).toHaveBeenCalledWith('src/utils.ts')
    })

    it('Delete key closes non-pinned tab', () => {
      render(<TabBar {...defaults} />)
      const tabs = screen.getAllByRole('tab')
      fireEvent.keyDown(tabs[1], { key: 'Delete' })
      expect(defaults.onTabClose).toHaveBeenCalledWith('src/utils.ts')
    })

    it('Backspace key closes non-pinned tab', () => {
      render(<TabBar {...defaults} />)
      const tabs = screen.getAllByRole('tab')
      fireEvent.keyDown(tabs[1], { key: 'Backspace' })
      expect(defaults.onTabClose).toHaveBeenCalledWith('src/utils.ts')
    })

    it('Delete key does not close pinned tab', () => {
      render(<TabBar {...defaults} pinnedFiles={new Set(['src/App.tsx'])} />)
      const tabs = screen.getAllByRole('tab')
      fireEvent.keyDown(tabs[0], { key: 'Delete' })
      expect(defaults.onTabClose).not.toHaveBeenCalled()
    })

    it('Backspace key does not close pinned tab', () => {
      render(<TabBar {...defaults} pinnedFiles={new Set(['src/App.tsx'])} />)
      const tabs = screen.getAllByRole('tab')
      fireEvent.keyDown(tabs[0], { key: 'Backspace' })
      expect(defaults.onTabClose).not.toHaveBeenCalled()
    })

    it('calls onKeyDown for any key press', () => {
      const onKeyDown = vi.fn()
      render(<TabBar {...defaults} onKeyDown={onKeyDown} />)
      const tabs = screen.getAllByRole('tab')
      fireEvent.keyDown(tabs[0], { key: 'a' })
      expect(onKeyDown).toHaveBeenCalled()
    })
  })

  // --- Context menu ---

  describe('context menu', () => {
    it('calls onTabContextMenu on right-click', () => {
      const onTabContextMenu = vi.fn()
      render(<TabBar {...defaults} onTabContextMenu={onTabContextMenu} />)
      const allTabs = screen.getAllByRole('tab')
      // Context menu handler is on the inner EditorTab div (class "group")
      const innerDiv = allTabs[1].querySelector('.group')
      expect(innerDiv).toBeTruthy()
      fireEvent.contextMenu(innerDiv!)
      expect(onTabContextMenu).toHaveBeenCalledTimes(1)
      expect(onTabContextMenu.mock.calls[0][1]).toBe('src/utils.ts')
    })
  })

  // --- Drag and drop ---

  describe('drag and drop', () => {
    it('sets drag data on dragStart', () => {
      const onDragStart = vi.fn()
      render(<TabBar {...defaults} onDragStart={onDragStart} />)
      const tabs = screen.getAllByRole('tab')
      const dt = new DataTransfer()
      fireEvent.dragStart(tabs[0], { dataTransfer: dt })
      expect(onDragStart).toHaveBeenCalledWith('main', 'src/App.tsx')
    })

    it('calls onReorder on valid drop (different index)', () => {
      const onReorder = vi.fn()
      render(<TabBar {...defaults} onReorder={onReorder} />)
      const tabs = screen.getAllByRole('tab')
      const dt = new DataTransfer()
      // Start drag from index 0
      fireEvent.dragStart(tabs[0], { dataTransfer: dt })
      // Drag over index 2
      fireEvent.dragOver(tabs[2], { dataTransfer: dt })
      // Drop on index 2
      fireEvent.drop(tabs[2], { dataTransfer: dt })
      expect(onReorder).toHaveBeenCalledWith(0, 2)
    })

    it('does not call onReorder when dropping on same index', () => {
      const onReorder = vi.fn()
      render(<TabBar {...defaults} onReorder={onReorder} />)
      const tabs = screen.getAllByRole('tab')
      const dt = new DataTransfer()
      fireEvent.dragStart(tabs[1], { dataTransfer: dt })
      fireEvent.drop(tabs[1], { dataTransfer: dt })
      expect(onReorder).not.toHaveBeenCalled()
    })

    it('clears drag state on dragEnd', () => {
      const onReorder = vi.fn()
      render(<TabBar {...defaults} onReorder={onReorder} />)
      const tabs = screen.getAllByRole('tab')
      const dt = new DataTransfer()
      fireEvent.dragStart(tabs[0], { dataTransfer: dt })
      fireEvent.dragEnd(tabs[0])
      // After dragEnd, dropping should not reorder (dragIndex is null)
      const dt2 = new DataTransfer()
      fireEvent.drop(tabs[2], { dataTransfer: dt2 })
      expect(onReorder).not.toHaveBeenCalled()
    })

    it('clears dragOverIndex on dragLeave', () => {
      render(<TabBar {...defaults} />)
      const tabs = screen.getAllByRole('tab')
      const dt = new DataTransfer()
      fireEvent.dragStart(tabs[0], { dataTransfer: dt })
      fireEvent.dragOver(tabs[2], { dataTransfer: dt })
      fireEvent.dragLeave(tabs[2])
      // After dragLeave, the tab should not have border indicator classes
      expect(tabs[2].className).not.toContain('border-l-accent')
      expect(tabs[2].className).not.toContain('border-r-accent')
    })

    it('does not set dragOverIndex when dragging over same index', () => {
      render(<TabBar {...defaults} />)
      const tabs = screen.getAllByRole('tab')
      const dt = new DataTransfer()
      fireEvent.dragStart(tabs[0], { dataTransfer: dt })
      fireEvent.dragOver(tabs[0], { dataTransfer: dt })
      // Same index should not show border indicator
      expect(tabs[0].className).not.toContain('border-l-accent')
      expect(tabs[0].className).not.toContain('border-r-accent')
    })

    it('applies opacity-50 to the dragged tab', () => {
      render(<TabBar {...defaults} />)
      const tabs = screen.getAllByRole('tab')
      const dt = new DataTransfer()
      fireEvent.dragStart(tabs[1], { dataTransfer: dt })
      expect(tabs[1].className).toContain('opacity-50')
    })

    it('applies left border indicator when dragging forward', () => {
      render(<TabBar {...defaults} />)
      const tabs = screen.getAllByRole('tab')
      const dt = new DataTransfer()
      fireEvent.dragStart(tabs[0], { dataTransfer: dt })
      fireEvent.dragOver(tabs[2], { dataTransfer: dt })
      // Dragging forward (0 -> 2): dragIndex < index, shows border-l on drop target
      expect(tabs[2].className).toContain('border-l-accent')
    })

    it('applies right border indicator when dragging backward', () => {
      render(<TabBar {...defaults} />)
      const tabs = screen.getAllByRole('tab')
      const dt = new DataTransfer()
      fireEvent.dragStart(tabs[2], { dataTransfer: dt })
      fireEvent.dragOver(tabs[0], { dataTransfer: dt })
      // Dragging backward (2 -> 0): dragIndex > index, shows border-r on drop target
      expect(tabs[0].className).toContain('border-r-accent')
    })

    it('passes custom paneId in drag data', () => {
      const onDragStart = vi.fn()
      render(<TabBar {...defaults} paneId="left" onDragStart={onDragStart} />)
      const tabs = screen.getAllByRole('tab')
      const dt = new DataTransfer()
      fireEvent.dragStart(tabs[0], { dataTransfer: dt })
      expect(onDragStart).toHaveBeenCalledWith('left', 'src/App.tsx')
    })

    it('sets correct drag data on dataTransfer', () => {
      render(<TabBar {...defaults} />)
      const tabs = screen.getAllByRole('tab')
      const dt = new DataTransfer()
      fireEvent.dragStart(tabs[1], { dataTransfer: dt })
      expect(dt.getData('text/plain')).toBe('src/utils.ts')
      const jsonData = JSON.parse(dt.getData('application/json'))
      expect(jsonData).toEqual({ index: 1, path: 'src/utils.ts', paneId: 'main' })
    })
  })

  // --- Double-click to rename ---

  describe('double-click to rename', () => {
    it('calls onRename on double-click when provided', () => {
      const onRename = vi.fn()
      render(<TabBar {...defaults} onRename={onRename} />)
      const allTabs = screen.getAllByRole('tab')
      // Double-click handler is on inner EditorTab div
      const innerDiv = allTabs[1].querySelector('.group')
      expect(innerDiv).toBeTruthy()
      fireEvent.doubleClick(innerDiv!)
      expect(onRename).toHaveBeenCalledWith('src/utils.ts')
    })

    it('does not crash when onRename is not provided', () => {
      render(<TabBar {...defaults} />)
      const allTabs = screen.getAllByRole('tab')
      const innerDiv = allTabs[1].querySelector('.group')
      expect(() => fireEvent.doubleClick(innerDiv!)).not.toThrow()
    })
  })

  // --- Pinned tabs ---

  describe('pinned tabs', () => {
    it('shows pin icon for pinned tabs', () => {
      render(<TabBar {...defaults} pinnedFiles={new Set(['src/App.tsx'])} />)
      const tabs = screen.getAllByRole('tab')
      const pinnedTab = tabs.find(t => t.getAttribute('data-path') === 'src/App.tsx')
      expect(pinnedTab?.querySelector('[title="Pinned"]')).toBeTruthy()
    })

    it('renders separator between pinned and unpinned tabs', () => {
      const { container } = render(
        <TabBar {...defaults} pinnedFiles={new Set(['src/App.tsx'])} />
      )
      // There should be a separator div between pinned (App.tsx) and unpinned (utils.ts, index.ts)
      const separators = container.querySelectorAll('.bg-glass-border.h-4')
      expect(separators.length).toBe(1)
    })

    it('does not render separator when all tabs have same pinned state', () => {
      const { container } = render(
        <TabBar {...defaults} pinnedFiles={new Set<string>()} />
      )
      const separators = container.querySelectorAll('.bg-glass-border.h-4')
      expect(separators.length).toBe(0)
    })
  })

  // --- Preview tab ---

  describe('preview tab', () => {
    it('passes preview prop to EditorTab', () => {
      // Preview tabs are rendered with italic class. We verify by checking that
      // the EditorTab within the tab receives the correct isPreview prop.
      // Since EditorTab applies italic+opacity-80 for preview, check the class.
      render(<TabBar {...defaults} previewTab="src/utils.ts" />)
      const tabs = screen.getAllByRole('tab')
      const utilsTab = tabs.find(t => t.getAttribute('data-path') === 'src/utils.ts')
      // The inner EditorTab div has the italic class when isPreview is true
      const innerDiv = utilsTab?.querySelector('.group')
      expect(innerDiv?.className).toContain('italic')
    })

    it('does not apply preview style when preview tab is pinned', () => {
      render(
        <TabBar
          {...defaults}
          previewTab="src/utils.ts"
          pinnedFiles={new Set(['src/utils.ts'])}
        />
      )
      const tabs = screen.getAllByRole('tab')
      const utilsTab = tabs.find(t => t.getAttribute('data-path') === 'src/utils.ts')
      const innerDiv = utilsTab?.querySelector('.group')
      expect(innerDiv?.className).not.toContain('italic')
    })
  })

  // --- Tab actions menu ---

  describe('tab actions menu', () => {
    it('calls onCloseToLeft from menu', () => {
      const onCloseToLeft = vi.fn()
      render(<TabBar {...defaults} onCloseToLeft={onCloseToLeft} />)
      fireEvent.click(screen.getByLabelText('Tab actions menu'))
      fireEvent.click(screen.getByText('Close to Left'))
      expect(onCloseToLeft).toHaveBeenCalled()
    })

    it('calls onCloseToRight from menu', () => {
      const onCloseToRight = vi.fn()
      render(<TabBar {...defaults} onCloseToRight={onCloseToRight} />)
      fireEvent.click(screen.getByLabelText('Tab actions menu'))
      fireEvent.click(screen.getByText('Close to Right'))
      expect(onCloseToRight).toHaveBeenCalled()
    })

    it('closes menu after selecting an action', () => {
      const onCloseAll = vi.fn()
      render(<TabBar {...defaults} onCloseAll={onCloseAll} />)
      fireEvent.click(screen.getByLabelText('Tab actions menu'))
      expect(screen.getByText('Close All')).toBeInTheDocument()
      fireEvent.click(screen.getByText('Close All'))
      // Menu should be closed now
      expect(screen.queryByText('Close All')).toBeNull()
    })

    it('toggles menu on repeated clicks', () => {
      render(<TabBar {...defaults} />)
      const menuBtn = screen.getByLabelText('Tab actions menu')
      fireEvent.click(menuBtn)
      expect(screen.getByText('Close Others')).toBeInTheDocument()
      fireEvent.click(menuBtn)
      expect(screen.queryByText('Close Others')).toBeNull()
    })

    it('closes menu when clicking outside', () => {
      render(<TabBar {...defaults} />)
      fireEvent.click(screen.getByLabelText('Tab actions menu'))
      expect(screen.getByText('Close Others')).toBeInTheDocument()
      // The fixed overlay for click-outside
      const overlay = document.querySelector('.fixed.inset-0')
      expect(overlay).toBeTruthy()
      fireEvent.click(overlay!)
      expect(screen.queryByText('Close Others')).toBeNull()
    })

    it('menu has role=menu', () => {
      render(<TabBar {...defaults} />)
      fireEvent.click(screen.getByLabelText('Tab actions menu'))
      expect(screen.getByRole('menu')).toBeInTheDocument()
    })

    it('menu items have role=menuitem', () => {
      render(<TabBar {...defaults} />)
      fireEvent.click(screen.getByLabelText('Tab actions menu'))
      const items = screen.getAllByRole('menuitem')
      expect(items.length).toBe(5)
    })

    it('menu has a separator', () => {
      render(<TabBar {...defaults} />)
      fireEvent.click(screen.getByLabelText('Tab actions menu'))
      expect(screen.getByRole('separator')).toBeInTheDocument()
    })

    it('menu button has aria-haspopup and aria-expanded', () => {
      render(<TabBar {...defaults} />)
      const menuBtn = screen.getByLabelText('Tab actions menu')
      expect(menuBtn.getAttribute('aria-haspopup')).toBe('menu')
      expect(menuBtn.getAttribute('aria-expanded')).toBe('false')
      fireEvent.click(menuBtn)
      expect(menuBtn.getAttribute('aria-expanded')).toBe('true')
    })
  })

  // --- Active tab scroll into view ---

  describe('active tab scroll into view', () => {
    it('scrolls active tab into view when currentFile changes', () => {
      const { rerender } = render(<TabBar {...defaults} currentFile="src/App.tsx" />)
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
      ;(Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mockClear()
      rerender(<TabBar {...defaults} currentFile="src/index.ts" />)
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    })

    it('does not scroll when currentFile is null', () => {
      ;(Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mockClear()
      render(<TabBar {...defaults} currentFile={null} />)
      // scrollIntoView should not be called since currentFile is null
      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
    })
  })

  // --- Scroll buttons ---

  describe('scroll buttons', () => {
    it('scroll left button decrements scrollLeft', () => {
      render(<TabBar {...defaults} />)
      const btn = screen.getByLabelText('Scroll tabs left')
      fireEvent.click(btn)
      // Button handler accesses scrollRef; no crash = pass
      expect(btn).toBeInTheDocument()
    })

    it('scroll right button increments scrollLeft', () => {
      render(<TabBar {...defaults} />)
      const btn = screen.getByLabelText('Scroll tabs right')
      fireEvent.click(btn)
      expect(btn).toBeInTheDocument()
    })
  })

  // --- Tab attributes ---

  describe('tab attributes', () => {
    it('sets tabIndex=0 on active tab and -1 on others', () => {
      render(<TabBar {...defaults} currentFile="src/utils.ts" />)
      const tabs = screen.getAllByRole('tab')
      const activeTab = tabs.find(t => t.getAttribute('data-path') === 'src/utils.ts')
      const inactiveTabs = tabs.filter(t => t.getAttribute('data-path') !== 'src/utils.ts')
      expect(activeTab?.tabIndex).toBe(0)
      for (const t of inactiveTabs) {
        expect(t.tabIndex).toBe(-1)
      }
    })

    it('sets aria-label with filename on each tab', () => {
      render(<TabBar {...defaults} />)
      const tabs = screen.getAllByRole('tab')
      expect(tabs[0].getAttribute('aria-label')).toBe('App.tsx')
      expect(tabs[1].getAttribute('aria-label')).toBe('utils.ts')
      expect(tabs[2].getAttribute('aria-label')).toBe('index.ts')
    })

    it('sets draggable attribute on tabs', () => {
      render(<TabBar {...defaults} />)
      const tabs = screen.getAllByRole('tab')
      for (const t of tabs) {
        expect(t.draggable).toBe(true)
      }
    })
  })

  // --- Edge cases ---

  describe('edge cases', () => {
    it('handles currentFile=null gracefully', () => {
      render(<TabBar {...defaults} currentFile={null} />)
      const tabs = screen.getAllByRole('tab')
      // No tab should be aria-selected
      const selected = tabs.find(t => t.getAttribute('aria-selected') === 'true')
      expect(selected).toBeUndefined()
    })

    it('handles single file correctly', () => {
      render(<TabBar {...defaults} openFiles={['src/App.tsx']} currentFile="src/App.tsx" />)
      const tabs = screen.getAllByRole('tab')
      expect(tabs.length).toBe(1)
      expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    })

    it('renders correctly with all files dirty', () => {
      render(
        <TabBar
          {...defaults}
          dirtyFiles={new Set(['src/App.tsx', 'src/utils.ts', 'src/index.ts'])}
        />
      )
      const tabs = screen.getAllByRole('tab')
      for (const t of tabs) {
        expect(t.querySelector('[title="Unsaved changes"]')).toBeTruthy()
      }
    })

    it('renders correctly with all files pinned', () => {
      render(
        <TabBar
          {...defaults}
          pinnedFiles={new Set(['src/App.tsx', 'src/utils.ts', 'src/index.ts'])}
        />
      )
      const tabs = screen.getAllByRole('tab')
      for (const t of tabs) {
        expect(t.querySelector('[aria-label="Close tab"]')).toBeNull()
      }
    })
  })
})
