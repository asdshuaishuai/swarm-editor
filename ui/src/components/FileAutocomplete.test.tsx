import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FileAutocomplete, FileAutocompleteWrapper } from './FileAutocomplete'
import type { FileItem } from './FileAutocomplete'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  File: (props: Record<string, unknown>) => <svg data-testid="file-icon" {...props} />,
  Folder: (props: Record<string, unknown>) => <svg data-testid="folder-icon" {...props} />,
  Search: (props: Record<string, unknown>) => <svg data-testid="search-icon" {...props} />,
}))

const sampleFiles: FileItem[] = [
  { path: '/src/index.ts', type: 'file', name: 'index.ts' },
  { path: '/src/components/App.tsx', type: 'file', name: 'App.tsx' },
  { path: '/src/utils', type: 'folder', name: 'utils' },
  { path: '/src/components/Button.tsx', type: 'file', name: 'Button.tsx' },
  { path: '/README.md', type: 'file', name: 'README.md' },
]

describe('FileAutocomplete', () => {
  const onSelect = vi.fn()
  const onClose = vi.fn()
  const position = { top: 100, left: 50 }

  beforeEach(() => {
    vi.clearAllMocks()
    // scrollIntoView is not implemented in jsdom
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('renders file list with files', () => {
    render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    expect(screen.getByText(/5 results/)).toBeInTheDocument()
    expect(screen.getByText('index.ts')).toBeInTheDocument()
    expect(screen.getByText('App.tsx')).toBeInTheDocument()
    expect(screen.getByText('Button.tsx')).toBeInTheDocument()
  })

  it('filters files by query', () => {
    render(
      <FileAutocomplete query="button" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    expect(screen.getByText('Button.tsx')).toBeInTheDocument()
    expect(screen.queryByText('index.ts')).toBeNull()
    expect(screen.queryByText('App.tsx')).toBeNull()
  })

  it('shows empty state when no files match', () => {
    render(
      <FileAutocomplete query="zzznonexistent" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    expect(screen.getByText(/No files found matching/)).toBeInTheDocument()
    expect(screen.getByText(/zzznonexistent/)).toBeInTheDocument()
  })

  it('calls onSelect and onClose when a file is clicked', () => {
    render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    fireEvent.click(screen.getByText('index.ts'))
    expect(onSelect).toHaveBeenCalledWith('/src/index.ts')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape key', () => {
    render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('selects item on Enter key', () => {
    render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    // First item should be selected by default
    expect(onSelect).toHaveBeenCalledWith('/src/index.ts')
    expect(onClose).toHaveBeenCalled()
  })

  it('navigates with arrow keys', () => {
    render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    // Arrow down to second item
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown' })
    })
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    // Second item is App.tsx
    expect(onSelect).toHaveBeenCalledWith('/src/components/App.tsx')
  })

  it('respects maxResults prop', () => {
    render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} maxResults={2} />
    )
    expect(screen.getByText(/2 results/)).toBeInTheDocument()
  })

  // --- New tests for expanded coverage ---

  it('renders folder icon for folder items', () => {
    render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    // utils is a folder
    const folderIcons = screen.getAllByTestId('folder-icon')
    expect(folderIcons.length).toBeGreaterThanOrEqual(1)
  })

  it('renders file icon for file items', () => {
    render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    const fileIcons = screen.getAllByTestId('file-icon')
    expect(fileIcons.length).toBeGreaterThanOrEqual(1)
  })

  it('renders search icon in empty state', () => {
    render(
      <FileAutocomplete query="nonexistent" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    expect(screen.getByTestId('search-icon')).toBeInTheDocument()
  })

  it('filters files by path substring', () => {
    render(
      <FileAutocomplete query="components" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    expect(screen.getByText('App.tsx')).toBeInTheDocument()
    expect(screen.getByText('Button.tsx')).toBeInTheDocument()
    expect(screen.queryByText('index.ts')).toBeNull()
  })

  it('filters files case-insensitively', () => {
    render(
      <FileAutocomplete query="BUTTON" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    expect(screen.getByText('Button.tsx')).toBeInTheDocument()
  })

  it('shows all files when query is empty', () => {
    render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    expect(screen.getByText(/5 results/)).toBeInTheDocument()
    expect(screen.getByText('README.md')).toBeInTheDocument()
  })

  it('navigates with ArrowUp wrapping to last item', () => {
    render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    // ArrowUp from first item wraps to last
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp' })
    })
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    // Last item is README.md
    expect(onSelect).toHaveBeenCalledWith('/README.md')
  })

  it('navigates multiple arrow down and up correctly', () => {
    render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    // Down 3 times: index 0 -> 1 -> 2 -> 3
    act(() => { fireEvent.keyDown(window, { key: 'ArrowDown' }) })
    act(() => { fireEvent.keyDown(window, { key: 'ArrowDown' }) })
    act(() => { fireEvent.keyDown(window, { key: 'ArrowDown' }) })
    // Then up once: 3 -> 2
    act(() => { fireEvent.keyDown(window, { key: 'ArrowUp' }) })
    act(() => { fireEvent.keyDown(window, { key: 'Enter' }) })
    // index 2 = utils folder
    expect(onSelect).toHaveBeenCalledWith('/src/utils')
  })

  it('handles ArrowDown wrapping from last to first', () => {
    render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    // Navigate to last item (4 arrow downs from index 0: 0->1->2->3->4)
    act(() => { fireEvent.keyDown(window, { key: 'ArrowDown' }) })
    act(() => { fireEvent.keyDown(window, { key: 'ArrowDown' }) })
    act(() => { fireEvent.keyDown(window, { key: 'ArrowDown' }) })
    act(() => { fireEvent.keyDown(window, { key: 'ArrowDown' }) })
    // One more down wraps to first
    act(() => { fireEvent.keyDown(window, { key: 'ArrowDown' }) })
    act(() => { fireEvent.keyDown(window, { key: 'Enter' }) })
    expect(onSelect).toHaveBeenCalledWith('/src/index.ts')
  })

  it('updates selection index on mouse enter', () => {
    render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    // Hover over last item
    fireEvent.mouseEnter(screen.getByText('README.md'))
    // Enter should select it
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    expect(onSelect).toHaveBeenCalledWith('/README.md')
  })

  it('calls scrollIntoView on selected element', () => {
    render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('handles click on folder item', () => {
    render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    fireEvent.click(screen.getByText('utils'))
    expect(onSelect).toHaveBeenCalledWith('/src/utils')
    expect(onClose).toHaveBeenCalled()
  })

  it('displays file path below file name', () => {
    render(
      <FileAutocomplete query="index" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    expect(screen.getByText('/src/index.ts')).toBeInTheDocument()
  })

  it('applies position styles', () => {
    const { container } = render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={{ top: 200, left: 30 }} />
    )
    const panel = container.firstChild as HTMLElement
    expect(panel).toBeTruthy()
    expect(panel.style.top).toBe('200px')
    expect(panel.style.left).toBe('30px')
  })

  it('handles empty files array with no query', () => {
    render(
      <FileAutocomplete query="" files={[]} onSelect={onSelect} onClose={onClose} position={position} />
    )
    expect(screen.getByText(/No files found matching/)).toBeInTheDocument()
  })

  it('handles filtered results becoming empty', () => {
    const { rerender } = render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    expect(screen.getByText(/5 results/)).toBeInTheDocument()
    // Rerender with query that matches nothing
    rerender(
      <FileAutocomplete query="xyz123" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    expect(screen.getByText(/No files found matching/)).toBeInTheDocument()
  })

  it('clamps selectedIndex when filtered results shrink', () => {
    const { rerender } = render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    // Navigate to last item (index 4)
    act(() => { fireEvent.keyDown(window, { key: 'ArrowDown' }) })
    act(() => { fireEvent.keyDown(window, { key: 'ArrowDown' }) })
    act(() => { fireEvent.keyDown(window, { key: 'ArrowDown' }) })
    act(() => { fireEvent.keyDown(window, { key: 'ArrowDown' }) })
    // Rerender with only 2 results - selectedIndex should clamp
    rerender(
      <FileAutocomplete query="tsx" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    // Should render without errors and select within bounds
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    // Should select last of the filtered results
    expect(onSelect).toHaveBeenCalled()
  })

  it('ignores unknown key presses', () => {
    render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    act(() => {
      fireEvent.keyDown(window, { key: 'Tab' })
    })
    expect(onSelect).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('removes keydown listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    removeSpy.mockRestore()
  })

  it('renders with single file', () => {
    const singleFile: FileItem[] = [{ path: '/src/main.ts', type: 'file', name: 'main.ts' }]
    render(
      <FileAutocomplete query="" files={singleFile} onSelect={onSelect} onClose={onClose} position={position} />
    )
    expect(screen.getByText(/1 results/)).toBeInTheDocument()
    expect(screen.getByText('main.ts')).toBeInTheDocument()
  })

  it('selects file via mouse after keyboard navigation', () => {
    render(
      <FileAutocomplete query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    // Arrow down to index 2
    act(() => { fireEvent.keyDown(window, { key: 'ArrowDown' }) })
    act(() => { fireEvent.keyDown(window, { key: 'ArrowDown' }) })
    // Now click a different item
    fireEvent.click(screen.getByText('README.md'))
    expect(onSelect).toHaveBeenCalledWith('/README.md')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows empty state with empty query and empty files', () => {
    render(
      <FileAutocomplete query="" files={[]} onSelect={onSelect} onClose={onClose} position={position} />
    )
    expect(screen.getByText(/No files found matching/)).toBeInTheDocument()
  })

  it('handles query matching only folder', () => {
    render(
      <FileAutocomplete query="utils" files={sampleFiles} onSelect={onSelect} onClose={onClose} position={position} />
    )
    expect(screen.getByText('utils')).toBeInTheDocument()
    expect(screen.getByText(/1 results/)).toBeInTheDocument()
  })
})

describe('FileAutocompleteWrapper', () => {
  const onSelect = vi.fn()
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('returns null when visible is false', () => {
    const inputRef = { current: document.createElement('input') }
    const { container } = render(
      <FileAutocompleteWrapper visible={false} query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} inputRef={inputRef} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders FileAutocomplete when visible is true', () => {
    const inputEl = document.createElement('input')
    document.body.appendChild(inputEl)
    const inputRef = { current: inputEl }
    render(
      <FileAutocompleteWrapper visible={true} query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} inputRef={inputRef} />
    )
    expect(screen.getByText(/5 results/)).toBeInTheDocument()
    document.body.removeChild(inputEl)
  })

  it('calculates position from input element', () => {
    const inputEl = document.createElement('input')
    // Mock getBoundingClientRect
    inputEl.getBoundingClientRect = vi.fn(() => ({
      bottom: 200,
      left: 50,
      top: 170,
      right: 500,
      width: 450,
      height: 30,
      x: 50,
      y: 170,
      toJSON: () => {},
    }))
    document.body.appendChild(inputEl)
    const inputRef = { current: inputEl }
    const { container } = render(
      <FileAutocompleteWrapper visible={true} query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} inputRef={inputRef} />
    )
    const panel = container.querySelector('.fixed') as HTMLElement
    expect(panel).toBeTruthy()
    expect(panel.style.top).toBe('204px') // bottom + 4
    expect(panel.style.left).toBe('50px')
    document.body.removeChild(inputEl)
  })

  it('handles null inputRef gracefully', () => {
    const inputRef = { current: null }
    render(
      <FileAutocompleteWrapper visible={true} query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} inputRef={inputRef} />
    )
    // Should render but with position 0,0 since no input element
    expect(screen.getByText(/5 results/)).toBeInTheDocument()
  })

  it('resets component when query changes (key prop)', () => {
    const inputEl = document.createElement('input')
    document.body.appendChild(inputEl)
    const inputRef = { current: inputEl }
    const { rerender } = render(
      <FileAutocompleteWrapper visible={true} query="a" files={sampleFiles} onSelect={onSelect} onClose={onClose} inputRef={inputRef} />
    )
    rerender(
      <FileAutocompleteWrapper visible={true} query="b" files={sampleFiles} onSelect={onSelect} onClose={onClose} inputRef={inputRef} />
    )
    // Component re-renders successfully with new query
    expect(screen.getByText(/results/)).toBeInTheDocument()
    document.body.removeChild(inputEl)
  })

  it('updates position when visibility toggles', () => {
    const inputEl = document.createElement('input')
    inputEl.getBoundingClientRect = vi.fn(() => ({
      bottom: 300,
      left: 100,
      top: 270,
      right: 600,
      width: 500,
      height: 30,
      x: 100,
      y: 270,
      toJSON: () => {},
    }))
    document.body.appendChild(inputEl)
    const inputRef = { current: inputEl }
    const { rerender } = render(
      <FileAutocompleteWrapper visible={false} query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} inputRef={inputRef} />
    )
    // Make visible
    rerender(
      <FileAutocompleteWrapper visible={true} query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} inputRef={inputRef} />
    )
    const panel = document.querySelector('.fixed') as HTMLElement
    expect(panel).toBeTruthy()
    expect(panel.style.top).toBe('304px')
    document.body.removeChild(inputEl)
  })

  it('passes onSelect and onClose to FileAutocomplete', () => {
    const inputEl = document.createElement('input')
    document.body.appendChild(inputEl)
    const inputRef = { current: inputEl }
    render(
      <FileAutocompleteWrapper visible={true} query="" files={sampleFiles} onSelect={onSelect} onClose={onClose} inputRef={inputRef} />
    )
    fireEvent.click(screen.getByText('index.ts'))
    expect(onSelect).toHaveBeenCalledWith('/src/index.ts')
    expect(onClose).toHaveBeenCalled()
    document.body.removeChild(inputEl)
  })
})
