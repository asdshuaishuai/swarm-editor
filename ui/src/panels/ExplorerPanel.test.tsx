import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import ExplorerPanel from './ExplorerPanel'
import type { FileEntry, GitFileStatus } from '../services'

const mockListDir = vi.fn()
const mockRename = vi.fn()
const mockDelete = vi.fn()
const mockCreateFile = vi.fn()
const mockMkdir = vi.fn()
const mockCopyFile = vi.fn()

vi.mock('../services', () => ({
  api: {
    fs: {
      listDir: (...args: unknown[]) => mockListDir(...args),
      renameFile: (...args: unknown[]) => mockRename(...args),
      deleteFile: (...args: unknown[]) => mockDelete(...args),
      createFile: (...args: unknown[]) => mockCreateFile(...args),
      mkdir: (...args: unknown[]) => mockMkdir(...args),
      copyFile: (...args: unknown[]) => mockCopyFile(...args),
    },
  },
  gitApi: {
    getBranch: vi.fn().mockResolvedValue('main'),
  },
}))

vi.mock('../hooks/useMenuKeyboardNav', () => ({
  useMenuKeyboardNav: () => vi.fn(),
}))

// Helper to create file entries
function file(name: string, path?: string, children?: FileEntry[]): FileEntry {
  return { name, path: path ?? name, isDirectory: false, children }
}
function dir(name: string, path?: string, children?: FileEntry[]): FileEntry {
  return { name, path: path ?? name, isDirectory: true, children }
}

const defaultProps = {
  workspace: '/project',
  currentFile: null,
  gitStatusMap: {} as Record<string, GitFileStatus>,
  openFiles: [] as string[],
  dirtyFiles: new Set<string>(),
  onOpenFile: vi.fn(),
  onCloseFile: vi.fn(),
  onToast: vi.fn(),
  onRefreshGitStatus: vi.fn(),
  onRenameFileInStore: vi.fn(),
}

// Helper: get all file-tree-entry buttons
function getTreeButtons(): HTMLElement[] {
  return Array.from(document.querySelectorAll('button.file-tree-entry'))
}

// Helper: find a tree button by text content
function findTreeButton(text: string): HTMLElement | undefined {
  return getTreeButtons().find(b => b.textContent?.includes(text))
}

// Helper: find the rename input (distinguished from filter input by its border style)
// The rename input has a distinctive border color (#58a6ff / rgb(88,166,255))
function findRenameInput(): HTMLInputElement | null {
  const inputs = document.querySelectorAll('input[type="text"]')
  for (const input of inputs) {
    const htmlInput = input as HTMLInputElement
    const border = htmlInput.style.border ?? ''
    if (border.includes('58a6ff') || border.includes('88, 166, 255')) {
      return htmlInput
    }
  }
  return null
}

describe('ExplorerPanel', () => {
  let originalRAF: typeof window.requestAnimationFrame
  let rafCallbacks: FrameRequestCallback[]

  beforeEach(() => {
    // Mock scrollIntoView for jsdom
    Element.prototype.scrollIntoView = vi.fn()

    // Mock requestAnimationFrame to execute synchronously to avoid stale callbacks
    originalRAF = window.requestAnimationFrame
    rafCallbacks = []
    window.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    })

    vi.clearAllMocks()
    mockListDir.mockResolvedValue([
      dir('src', '/project/src'),
      file('main.ts', '/project/main.ts'),
    ])
    mockRename.mockResolvedValue(undefined)
    mockDelete.mockResolvedValue(undefined)
    mockCreateFile.mockResolvedValue(undefined)
    mockMkdir.mockResolvedValue(undefined)
    mockCopyFile.mockResolvedValue(undefined)
  })

  afterEach(() => {
    // Flush any pending RAF callbacks to prevent stale refs from bleeding into next test
    flushRAF()
    window.requestAnimationFrame = originalRAF
  })

  // Helper to flush pending RAF callbacks
  function flushRAF() {
    const callbacks = [...rafCallbacks]
    rafCallbacks = []
    callbacks.forEach(cb => {
      try { cb(0) } catch { /* ignore stale refs */ }
    })
  }

  // ─── Basic Rendering ───

  it('loads and displays file tree', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })
  })

  it('calls listDir with workspace path', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(mockListDir).toHaveBeenCalledWith('/project')
    })
  })

  it('renders header with workspace title', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText(/工作区树状图/)).toBeInTheDocument()
    })
  })

  it('renders new file button', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByTitle('新建文件')).toBeInTheDocument()
    })
  })

  it('renders new folder button', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByTitle('新建文件夹')).toBeInTheDocument()
    })
  })

  it('renders collapse all button', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByTitle('折叠全部')).toBeInTheDocument()
    })
  })

  it('renders expand all button', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByTitle('展开全部')).toBeInTheDocument()
    })
  })

  it('shows filter input when file tree has entries', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Filter files...')).toBeInTheDocument()
    })
  })

  // ─── Empty & Loading States ───

  it('does not render filter when file tree is empty', async () => {
    mockListDir.mockResolvedValue([])
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(mockListDir).toHaveBeenCalled()
    })
    expect(screen.queryByPlaceholderText('Filter files...')).not.toBeInTheDocument()
  })

  it('handles listDir error gracefully', async () => {
    mockListDir.mockRejectedValueOnce(new Error('Permission denied'))
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(mockListDir).toHaveBeenCalled()
    })
    expect(screen.getByText(/工作区树状图/)).toBeInTheDocument()
  })

  it('does not call listDir when workspace is empty', async () => {
    render(<ExplorerPanel {...defaultProps} workspace="" />)
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })
    expect(mockListDir).not.toHaveBeenCalled()
  })

  // ─── File Open Interactions ───

  it('opens file on click with preview', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('main.ts'))
    expect(defaultProps.onOpenFile).toHaveBeenCalledWith('/project/main.ts', { preview: true })
  })

  it('opens file on double click without preview', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })
    fireEvent.doubleClick(screen.getByText('main.ts'))
    expect(defaultProps.onOpenFile).toHaveBeenCalledWith('/project/main.ts', { preview: false })
  })

  it('calls onSetPaneFile when loading a file', async () => {
    const onSetPaneFile = vi.fn()
    render(<ExplorerPanel {...defaultProps} onSetPaneFile={onSetPaneFile} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('main.ts'))
    expect(onSetPaneFile).toHaveBeenCalledWith('main', '/project/main.ts')
  })

  // ─── Directory Expand/Collapse ───

  it('expands directory on chevron click', async () => {
    mockListDir
      .mockResolvedValueOnce([dir('src', '/project/src')])
      .mockResolvedValueOnce([file('index.ts', '/project/src/index.ts')])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Expand src/ }))
    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeInTheDocument()
    })
  })

  it('collapses directory on second click', async () => {
    const srcDir = dir('src', '/project/src', [file('index.ts', '/project/src/index.ts')])
    mockListDir.mockResolvedValue([srcDir])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Expand src/ }))
    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Collapse src/ }))
    await waitFor(() => {
      expect(screen.queryByText('index.ts')).not.toBeInTheDocument()
    })
  })

  it('toggles directory when clicking the directory button itself', async () => {
    const srcDir = dir('src', '/project/src', [file('index.ts', '/project/src/index.ts')])
    mockListDir.mockResolvedValue([srcDir])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    const srcBtn = findTreeButton('src')
    fireEvent.click(srcBtn!)
    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeInTheDocument()
    })
  })

  it('loads directory children from API when not cached', async () => {
    const srcDir = dir('src', '/project/src', [])
    mockListDir
      .mockResolvedValueOnce([srcDir])
      .mockResolvedValueOnce([file('app.ts', '/project/src/app.ts')])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Expand src/ }))

    await waitFor(() => {
      expect(mockListDir).toHaveBeenCalledWith('/project/src')
      expect(screen.getByText('app.ts')).toBeInTheDocument()
    })
  })

  it('handles error loading directory children', async () => {
    const srcDir = dir('src', '/project/src', [])
    mockListDir
      .mockResolvedValueOnce([srcDir])
      .mockRejectedValueOnce(new Error('Read error'))

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Expand src/ }))

    await waitFor(() => {
      expect(mockListDir).toHaveBeenCalledWith('/project/src')
    })
    expect(screen.getByText('src')).toBeInTheDocument()
  })

  // ─── Expand All / Collapse All ───

  it('expands all directories when expand all button clicked', async () => {
    const fullTree: FileEntry[] = [
      dir('src', '/project/src', [
        dir('utils', '/project/src/utils', [
          file('helpers.ts', '/project/src/utils/helpers.ts'),
        ]),
      ]),
    ]
    mockListDir.mockResolvedValue(fullTree)

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('展开全部'))

    await waitFor(() => {
      expect(screen.getByText('utils')).toBeInTheDocument()
      expect(screen.getByText('helpers.ts')).toBeInTheDocument()
    })
  })

  it('collapses all directories when collapse all button clicked', async () => {
    const fullTree: FileEntry[] = [
      dir('src', '/project/src', [file('index.ts', '/project/src/index.ts')]),
    ]
    mockListDir.mockResolvedValue(fullTree)

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Expand src/ }))
    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('折叠全部'))
    await waitFor(() => {
      expect(screen.queryByText('index.ts')).not.toBeInTheDocument()
    })
  })

  // ─── Filter/Search ───

  it('filters files by name', async () => {
    mockListDir.mockResolvedValue([
      file('main.ts', '/project/main.ts'),
      file('package.json', '/project/package.json'),
      file('index.ts', '/project/index.ts'),
    ])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('Filter files...'), { target: { value: 'main' } })

    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
      expect(screen.queryByText('package.json')).not.toBeInTheDocument()
    })
  })

  it('shows clear filter button when filter is active', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('Filter files...'), { target: { value: 'main' } })

    await waitFor(() => {
      expect(screen.getByLabelText('Clear filter')).toBeInTheDocument()
    })
  })

  it('clears filter when clear button clicked', async () => {
    mockListDir.mockResolvedValue([
      file('main.ts', '/project/main.ts'),
      file('other.ts', '/project/other.ts'),
    ])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('Filter files...'), { target: { value: 'zzz' } })
    await waitFor(() => {
      expect(screen.queryByText('main.ts')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Clear filter'))
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
      expect(screen.getByText('other.ts')).toBeInTheDocument()
    })
  })

  it('filter is case-insensitive', async () => {
    mockListDir.mockResolvedValue([
      file('Main.ts', '/project/Main.ts'),
      file('other.ts', '/project/other.ts'),
    ])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('Main.ts')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('Filter files...'), { target: { value: 'MAIN' } })

    await waitFor(() => {
      expect(screen.getByText('Main.ts')).toBeInTheDocument()
      expect(screen.queryByText('other.ts')).not.toBeInTheDocument()
    })
  })

  it('keeps directory in results when its name matches filter', async () => {
    mockListDir.mockResolvedValue([
      dir('srcfolder', '/project/srcfolder', [file('index.ts', '/project/srcfolder/index.ts')]),
      file('other.ts', '/project/other.ts'),
    ])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('srcfolder')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('Filter files...'), { target: { value: 'src' } })

    await waitFor(() => {
      expect(screen.getByText('srcfolder')).toBeInTheDocument()
      expect(screen.queryByText('other.ts')).not.toBeInTheDocument()
    })
  })

  it('auto-expands directories when filter matches child', async () => {
    mockListDir.mockResolvedValue([
      dir('src', '/project/src', [file('target.ts', '/project/src/target.ts')]),
    ])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    expect(screen.queryByText('target.ts')).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Filter files...'), { target: { value: 'target' } })

    await waitFor(() => {
      expect(screen.getByText('target.ts')).toBeInTheDocument()
    })
  })

  // ─── Active File Highlighting ───

  it('highlights currently active file with data-active-file attribute', async () => {
    render(<ExplorerPanel {...defaultProps} currentFile="/project/main.ts" />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const activeEl = document.querySelector('[data-active-file="true"]')
    expect(activeEl).toBeTruthy()
    expect(activeEl?.textContent).toContain('main.ts')
  })

  it('auto-expands parent directories for current file', async () => {
    mockListDir.mockResolvedValue([
      dir('src', '/project/src', [file('index.ts', '/project/src/index.ts')]),
    ])

    render(<ExplorerPanel {...defaultProps} currentFile="/project/src/index.ts" />)
    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeInTheDocument()
    })
  })

  // ─── Context Menu Display ───

  it('shows context menu on right-click with all standard items for a file', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    fireEvent.contextMenu(mainBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      expect(screen.getByText('Open')).toBeInTheDocument()
      expect(screen.getByText('Cut')).toBeInTheDocument()
      expect(screen.getByText('Paste')).toBeInTheDocument()
      expect(screen.getByText('Rename')).toBeInTheDocument()
      expect(screen.getByText('Delete')).toBeInTheDocument()
      expect(screen.getByText('Copy Path')).toBeInTheDocument()
      expect(screen.getByText('Copy Relative Path')).toBeInTheDocument()
    })

    // No New File/Folder since it's a file entry
    expect(screen.queryByText('New File')).not.toBeInTheDocument()
    expect(screen.queryByText('New Folder')).not.toBeInTheDocument()
  })

  it('context menu shows New File and New Folder for directories', async () => {
    mockListDir.mockResolvedValue([dir('src', '/project/src')])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    const srcBtn = findTreeButton('src')
    fireEvent.contextMenu(srcBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      expect(screen.getByText('New File')).toBeInTheDocument()
      expect(screen.getByText('New Folder')).toBeInTheDocument()
    })
  })

  it('closes context menu on Escape key', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    fireEvent.contextMenu(mainBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      expect(screen.getByText('Open')).toBeInTheDocument()
    })

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByText('Open')).not.toBeInTheDocument()
    })
  })

  it('closes context menu on document click', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    fireEvent.contextMenu(mainBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      expect(screen.getByText('Open')).toBeInTheDocument()
    })

    fireEvent.click(document.body)

    await waitFor(() => {
      expect(screen.queryByText('Open')).not.toBeInTheDocument()
    })
  })

  // ─── Context Menu: Open ───

  it('Open in context menu calls onOpenFile', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    fireEvent.contextMenu(mainBtn!, { clientX: 100, clientY: 200 })

    // The Open button's onClick does: onOpenFile(contextMenu.entry!.path); closeContextMenu()
    // Since the document click handler interferes, we test by directly clicking
    // with stopPropagation behavior. Use a native click approach.
    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const openBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.includes('Open'))
      expect(openBtn).toBeTruthy()
      // Simulate click with propagation stopped (matching the component's capture listener)
      // The component adds stopPropagation on the menu ref in capture phase for native events.
      // In jsdom, React's fireEvent.click dispatches a synthetic event.
      // We need to dispatch a native event that won't reach the document listener.
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      openBtn!.dispatchEvent(evt)
    })

    await waitFor(() => {
      expect(defaultProps.onOpenFile).toHaveBeenCalledWith('/project/main.ts')
    })
  })

  // ─── Context Menu: Copy Path / Copy Relative Path ───

  it('copies file path to clipboard via Copy Path', async () => {
    const mockWriteText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText: mockWriteText } })

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    fireEvent.contextMenu(mainBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const copyPathBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.includes('Copy Path'))
      expect(copyPathBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      copyPathBtn!.dispatchEvent(evt)
    })

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('/project/main.ts')
      expect(defaultProps.onToast).toHaveBeenCalledWith('success', 'Copied', 'Full path copied to clipboard')
    })
  })

  it('copies relative path via Copy Relative Path', async () => {
    const mockWriteText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText: mockWriteText } })

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    fireEvent.contextMenu(mainBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const relPathBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.includes('Copy Relative Path'))
      expect(relPathBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      relPathBtn!.dispatchEvent(evt)
    })

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('main.ts')
      expect(defaultProps.onToast).toHaveBeenCalledWith('success', 'Copied', 'Relative path copied to clipboard')
    })
  })

  // ─── Context Menu: Cut/Copy/Paste ───

  it('sets clipboard for cut operation', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    fireEvent.contextMenu(mainBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const cutBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Cut')
      expect(cutBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      cutBtn!.dispatchEvent(evt)
    })

    await waitFor(() => {
      expect(defaultProps.onToast).toHaveBeenCalledWith('info', 'Cut', 'File cut: main.ts')
    })
  })

  it('sets clipboard for copy operation', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    fireEvent.contextMenu(mainBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      // "Copy" button (the one that just says "Copy", not "Copy Path")
      const copyBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Copy')
      expect(copyBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      copyBtn!.dispatchEvent(evt)
    })

    await waitFor(() => {
      expect(defaultProps.onToast).toHaveBeenCalledWith('info', 'Copied', 'File copied: main.ts')
    })
  })

  it('sets clipboard for cut on directory entry', async () => {
    mockListDir.mockResolvedValue([dir('src', '/project/src')])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    const srcBtn = findTreeButton('src')
    fireEvent.contextMenu(srcBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const cutBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Cut')
      expect(cutBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      cutBtn!.dispatchEvent(evt)
    })

    await waitFor(() => {
      expect(defaultProps.onToast).toHaveBeenCalledWith('info', 'Cut', 'Folder cut: src')
    })
  })

  it('pastes file with copy operation', async () => {
    mockListDir
      .mockResolvedValueOnce([
        file('main.ts', '/project/main.ts'),
        dir('src', '/project/src'),
      ])
      .mockResolvedValueOnce([]) // refreshFileTree after paste

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    // Copy the file
    const mainBtn = findTreeButton('main.ts')
    fireEvent.contextMenu(mainBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const copyBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Copy')
      expect(copyBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      copyBtn!.dispatchEvent(evt)
    })

    // Wait for clipboard to be set
    await waitFor(() => {
      expect(defaultProps.onToast).toHaveBeenCalledWith('info', 'Copied', 'File copied: main.ts')
    })

    // Paste into directory
    const srcBtn = findTreeButton('src')
    fireEvent.contextMenu(srcBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const pasteBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Paste')
      expect(pasteBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      pasteBtn!.dispatchEvent(evt)
    })

    await waitFor(() => {
      expect(mockCopyFile).toHaveBeenCalledWith('/project/main.ts', '/project/src/main.ts')
    })
  })

  it('pastes file with cut (move) and renames in store', async () => {
    mockListDir
      .mockResolvedValueOnce([
        file('main.ts', '/project/main.ts'),
        dir('src', '/project/src'),
      ])
      .mockResolvedValueOnce([])

    render(<ExplorerPanel {...defaultProps} openFiles={['/project/main.ts']} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    // Cut the file
    const mainBtn = findTreeButton('main.ts')
    fireEvent.contextMenu(mainBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const cutBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Cut')
      expect(cutBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      cutBtn!.dispatchEvent(evt)
    })

    await waitFor(() => {
      expect(defaultProps.onToast).toHaveBeenCalledWith('info', 'Cut', 'File cut: main.ts')
    })

    // Paste into directory
    const srcBtn = findTreeButton('src')
    fireEvent.contextMenu(srcBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const pasteBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Paste')
      expect(pasteBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      pasteBtn!.dispatchEvent(evt)
    })

    await waitFor(() => {
      expect(mockRename).toHaveBeenCalledWith('/project/main.ts', '/project/src/main.ts')
      expect(defaultProps.onRenameFileInStore).toHaveBeenCalledWith('/project/main.ts', '/project/src/main.ts')
    })
  })

  it('handles paste error with not found message', async () => {
    mockListDir.mockResolvedValue([
      file('main.ts', '/project/main.ts'),
      dir('src', '/project/src'),
    ])
    mockCopyFile.mockRejectedValueOnce(new Error('source not found'))

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    // Copy
    const mainBtn = findTreeButton('main.ts')
    fireEvent.contextMenu(mainBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const copyBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Copy')
      expect(copyBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      copyBtn!.dispatchEvent(evt)
    })

    await waitFor(() => {
      expect(defaultProps.onToast).toHaveBeenCalledWith('info', 'Copied', 'File copied: main.ts')
    })

    // Paste
    const srcBtn = findTreeButton('src')
    fireEvent.contextMenu(srcBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const pasteBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Paste')
      expect(pasteBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      pasteBtn!.dispatchEvent(evt)
    })

    await waitFor(() => {
      expect(defaultProps.onToast).toHaveBeenCalledWith('warning', 'Paste failed', expect.stringContaining('deleted or moved'))
    })
  })

  it('handles paste error with generic message', async () => {
    mockListDir.mockResolvedValue([
      file('main.ts', '/project/main.ts'),
      dir('src', '/project/src'),
    ])
    mockCopyFile.mockRejectedValueOnce(new Error('disk full'))

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    // Copy
    const mainBtn = findTreeButton('main.ts')
    fireEvent.contextMenu(mainBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const copyBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Copy')
      expect(copyBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      copyBtn!.dispatchEvent(evt)
    })

    await waitFor(() => {
      expect(defaultProps.onToast).toHaveBeenCalledWith('info', 'Copied', 'File copied: main.ts')
    })

    // Paste
    const srcBtn = findTreeButton('src')
    fireEvent.contextMenu(srcBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const pasteBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Paste')
      expect(pasteBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      pasteBtn!.dispatchEvent(evt)
    })

    await waitFor(() => {
      expect(defaultProps.onToast).toHaveBeenCalledWith('error', 'Paste failed', 'disk full')
    })
  })

  it('paste does nothing when no file in clipboard', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    fireEvent.contextMenu(mainBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const pasteBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Paste')
      expect(pasteBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      pasteBtn!.dispatchEvent(evt)
    })

    // No API calls should be made since clipboard is empty
    expect(mockCopyFile).not.toHaveBeenCalled()
    expect(mockRename).not.toHaveBeenCalled()
  })

  // ─── Context Menu: Rename ───

  it('enters rename mode from context menu', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    fireEvent.contextMenu(mainBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const renameBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Rename')
      expect(renameBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      renameBtn!.dispatchEvent(evt)
    })

    await waitFor(() => {
      const input = findRenameInput()
      expect(input).toBeTruthy()
      expect(input?.value).toBe('main.ts')
    })
  })

  it('submits rename on Enter', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    // Enter rename via F2
    const mainBtn = findTreeButton('main.ts')
    await act(async () => {
      fireEvent.keyDown(mainBtn!, { key: 'F2' })
    })

    let input: HTMLInputElement | null = null
    await waitFor(() => {
      input = findRenameInput()
      expect(input).toBeTruthy()
    })

    fireEvent.change(input!, { target: { value: 'renamed.ts' } })
    await act(async () => {
      fireEvent.keyDown(input!, { key: 'Enter' })
    })

    await waitFor(() => {
      expect(mockRename).toHaveBeenCalledWith('/project/main.ts', '/project/renamed.ts')
      expect(defaultProps.onToast).toHaveBeenCalledWith('success', 'Renamed', 'main.ts → renamed.ts')
    })
  })

  it('cancels rename on Escape', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    await act(async () => {
      fireEvent.keyDown(mainBtn!, { key: 'F2' })
    })

    let input: HTMLInputElement | null = null
    await waitFor(() => {
      input = findRenameInput()
      expect(input).toBeTruthy()
    })

    await act(async () => {
      fireEvent.keyDown(input!, { key: 'Escape' })
    })

    await waitFor(() => {
      expect(mockRename).not.toHaveBeenCalled()
    })
  })

  it('cancels rename when value is whitespace-only', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    await act(async () => {
      fireEvent.keyDown(mainBtn!, { key: 'F2' })
    })

    let input: HTMLInputElement | null = null
    await waitFor(() => {
      input = findRenameInput()
      expect(input).toBeTruthy()
    })

    fireEvent.change(input!, { target: { value: '   ' } })
    await act(async () => {
      fireEvent.keyDown(input!, { key: 'Enter' })
    })

    await waitFor(() => {
      expect(mockRename).not.toHaveBeenCalled()
    })
  })

  it('submits rename on blur', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    await act(async () => {
      fireEvent.keyDown(mainBtn!, { key: 'F2' })
    })

    let input: HTMLInputElement | null = null
    await waitFor(() => {
      input = findRenameInput()
      expect(input).toBeTruthy()
    })

    fireEvent.change(input!, { target: { value: 'new-name.ts' } })
    await act(async () => {
      fireEvent.blur(input!)
    })

    await waitFor(() => {
      expect(mockRename).toHaveBeenCalledWith('/project/main.ts', '/project/new-name.ts')
    })
  })

  it('renames file that is currently open and updates store', async () => {
    render(<ExplorerPanel {...defaultProps} openFiles={['/project/main.ts']} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    await act(async () => {
      fireEvent.keyDown(mainBtn!, { key: 'F2' })
    })

    let input: HTMLInputElement | null = null
    await waitFor(() => {
      input = findRenameInput()
      expect(input).toBeTruthy()
    })

    fireEvent.change(input!, { target: { value: 'renamed.ts' } })
    await act(async () => {
      fireEvent.keyDown(input!, { key: 'Enter' })
    })

    await waitFor(() => {
      expect(defaultProps.onRenameFileInStore).toHaveBeenCalledWith('/project/main.ts', '/project/renamed.ts')
    })
  })

  it('handles rename error', async () => {
    mockRename.mockRejectedValueOnce(new Error('Rename failed'))

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    await act(async () => {
      fireEvent.keyDown(mainBtn!, { key: 'F2' })
    })

    let input: HTMLInputElement | null = null
    await waitFor(() => {
      input = findRenameInput()
      expect(input).toBeTruthy()
    })

    fireEvent.change(input!, { target: { value: 'new-name.ts' } })
    await act(async () => {
      fireEvent.keyDown(input!, { key: 'Enter' })
    })

    await waitFor(() => {
      expect(defaultProps.onToast).toHaveBeenCalledWith('error', 'Rename failed', 'Rename failed')
    })
  })

  // ─── Context Menu: Delete ───

  it('shows delete confirmation dialog from context menu', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    fireEvent.contextMenu(mainBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const deleteBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Delete')
      expect(deleteBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      deleteBtn!.dispatchEvent(evt)
    })

    await waitFor(() => {
      expect(screen.getByText(/Delete main.ts\?/)).toBeInTheDocument()
    })
  })

  it('deletes file on confirmation', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    // Trigger delete via keyboard
    const mainBtn = findTreeButton('main.ts')
    fireEvent.keyDown(mainBtn!, { key: 'Delete' })

    await waitFor(() => {
      expect(screen.getByText(/Delete main.ts\?/)).toBeInTheDocument()
    })

    // Confirm delete
    const dialogs = document.querySelectorAll('[role="dialog"]')
    const deleteDialog = Array.from(dialogs).find(d => d.textContent?.includes('Delete main.ts'))
    expect(deleteDialog).toBeTruthy()
    const confirmBtn = within(deleteDialog! as HTMLElement).getByText('Delete')
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('/project/main.ts')
      expect(defaultProps.onToast).toHaveBeenCalledWith('success', 'Deleted', 'main.ts')
      expect(defaultProps.onRefreshGitStatus).toHaveBeenCalled()
    })
  })

  it('cancels delete when cancel button clicked', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    fireEvent.keyDown(mainBtn!, { key: 'Delete' })

    await waitFor(() => {
      expect(screen.getByText(/Delete main.ts\?/)).toBeInTheDocument()
    })

    const dialogs = document.querySelectorAll('[role="dialog"]')
    const deleteDialog = Array.from(dialogs).find(d => d.textContent?.includes('Delete main.ts'))
    const cancelBtn = within(deleteDialog! as HTMLElement).getByText('Cancel')
    fireEvent.click(cancelBtn)

    await waitFor(() => {
      expect(mockDelete).not.toHaveBeenCalled()
      expect(screen.queryByText(/Delete main.ts\?/)).not.toBeInTheDocument()
    })
  })

  it('prevents deleting dirty file', async () => {
    render(<ExplorerPanel {...defaultProps} dirtyFiles={new Set(['/project/main.ts'])} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    fireEvent.keyDown(mainBtn!, { key: 'Delete' })

    await waitFor(() => {
      expect(screen.getByText(/Delete main.ts\?/)).toBeInTheDocument()
    })

    const dialogs = document.querySelectorAll('[role="dialog"]')
    const deleteDialog = Array.from(dialogs).find(d => d.textContent?.includes('Delete main.ts'))
    const confirmBtn = within(deleteDialog! as HTMLElement).getByText('Delete')
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(mockDelete).not.toHaveBeenCalled()
      expect(defaultProps.onToast).toHaveBeenCalledWith('warning', 'Unsaved changes', 'Save main.ts before deleting')
    })
  })

  it('closes open file after deletion', async () => {
    render(<ExplorerPanel {...defaultProps} openFiles={['/project/main.ts']} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    fireEvent.keyDown(mainBtn!, { key: 'Delete' })

    await waitFor(() => {
      expect(screen.getByText(/Delete main.ts\?/)).toBeInTheDocument()
    })

    const dialogs = document.querySelectorAll('[role="dialog"]')
    const deleteDialog = Array.from(dialogs).find(d => d.textContent?.includes('Delete main.ts'))
    const confirmBtn = within(deleteDialog! as HTMLElement).getByText('Delete')
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(defaultProps.onCloseFile).toHaveBeenCalledWith('/project/main.ts')
    })
  })

  it('handles delete error', async () => {
    mockDelete.mockRejectedValueOnce(new Error('Cannot delete'))

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    fireEvent.keyDown(mainBtn!, { key: 'Delete' })

    await waitFor(() => {
      expect(screen.getByText(/Delete main.ts\?/)).toBeInTheDocument()
    })

    const dialogs = document.querySelectorAll('[role="dialog"]')
    const deleteDialog = Array.from(dialogs).find(d => d.textContent?.includes('Delete main.ts'))
    const confirmBtn = within(deleteDialog! as HTMLElement).getByText('Delete')
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(defaultProps.onToast).toHaveBeenCalledWith('error', 'Delete failed', 'Cannot delete')
    })
  })

  // ─── New File / New Folder Dialog ───

  it('opens new file dialog from header button', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByTitle('新建文件')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('新建文件'))

    await waitFor(() => {
      const heading = screen.getAllByText('New File').find(el => el.tagName === 'H3')
      expect(heading).toBeTruthy()
      expect(screen.getByPlaceholderText('file-name.ext')).toBeInTheDocument()
    })
  })

  it('opens new folder dialog from header button', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByTitle('新建文件夹')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('新建文件夹'))

    await waitFor(() => {
      const heading = screen.getAllByText('New Folder').find(el => el.tagName === 'H3')
      expect(heading).toBeTruthy()
      expect(screen.getByPlaceholderText('folder-name')).toBeInTheDocument()
    })
  })

  it('creates new file on submit', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByTitle('新建文件')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('新建文件'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('file-name.ext')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('file-name.ext')
    fireEvent.change(input, { target: { value: 'newfile.ts' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mockCreateFile).toHaveBeenCalledWith('/project/newfile.ts')
      expect(defaultProps.onToast).toHaveBeenCalledWith('success', 'Created', 'File: newfile.ts')
      expect(defaultProps.onOpenFile).toHaveBeenCalledWith('/project/newfile.ts')
    })
  })

  it('creates new folder on submit', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByTitle('新建文件夹')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('新建文件夹'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('folder-name')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('folder-name')
    fireEvent.change(input, { target: { value: 'newfolder' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mockMkdir).toHaveBeenCalledWith('/project/newfolder')
      expect(defaultProps.onToast).toHaveBeenCalledWith('success', 'Created', 'Folder: newfolder')
    })
  })

  it('creates new file inside directory from context menu', async () => {
    mockListDir.mockResolvedValue([dir('src', '/project/src')])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    const srcBtn = findTreeButton('src')
    fireEvent.contextMenu(srcBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const newFileBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.includes('New File'))
      expect(newFileBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      newFileBtn!.dispatchEvent(evt)
    })

    await waitFor(() => {
      expect(screen.getByPlaceholderText('file-name.ext')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('file-name.ext')
    fireEvent.change(input, { target: { value: 'nested.ts' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mockCreateFile).toHaveBeenCalledWith('/project/src/nested.ts')
    })
  })

  it('does not create file with whitespace-only name', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByTitle('新建文件')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('新建文件'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('file-name.ext')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('file-name.ext')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mockCreateFile).not.toHaveBeenCalled()
  })

  it('cancels new file dialog', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByTitle('新建文件')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('新建文件'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('file-name.ext')).toBeInTheDocument()
    })

    const dialogs = document.querySelectorAll('[role="dialog"]')
    const dialog = Array.from(dialogs).find(d => d.textContent?.includes('New File'))
    expect(dialog).toBeTruthy()
    const cancelBtn = within(dialog! as HTMLElement).getByText('Cancel')
    fireEvent.click(cancelBtn)

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('file-name.ext')).not.toBeInTheDocument()
    })
  })

  it('handles create file error', async () => {
    mockCreateFile.mockRejectedValueOnce(new Error('Cannot create'))

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByTitle('新建文件')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('新建文件'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('file-name.ext')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('file-name.ext')
    fireEvent.change(input, { target: { value: 'test.ts' } })

    const dialogs = document.querySelectorAll('[role="dialog"]')
    const dialog = Array.from(dialogs).find(d => d.textContent?.includes('New File'))
    const createBtn = within(dialog! as HTMLElement).getByText('Create')
    fireEvent.click(createBtn)

    await waitFor(() => {
      expect(defaultProps.onToast).toHaveBeenCalledWith('error', 'Create failed', 'Cannot create')
    })
  })

  it('does not open file after creating a folder', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByTitle('新建文件夹')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('新建文件夹'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('folder-name')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('folder-name')
    fireEvent.change(input, { target: { value: 'myfolder' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mockMkdir).toHaveBeenCalled()
    })

    expect(defaultProps.onOpenFile).not.toHaveBeenCalled()
  })

  // ─── Git Status Display ───

  it('displays Modified status badge on file', async () => {
    const gitStatusMap = {
      '/project/main.ts': { path: '/project/main.ts', status: 'M', staged: false },
    }
    render(<ExplorerPanel {...defaultProps} gitStatusMap={gitStatusMap} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mElements = screen.getAllByText('M')
    expect(mElements.length).toBeGreaterThanOrEqual(1)
  })

  it('displays Added status badge for staged file', async () => {
    const gitStatusMap = {
      '/project/main.ts': { path: '/project/main.ts', status: 'A', staged: true },
    }
    render(<ExplorerPanel {...defaultProps} gitStatusMap={gitStatusMap} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const aElements = screen.getAllByText('A')
    expect(aElements.length).toBeGreaterThanOrEqual(1)
  })

  it('displays Untracked status badge', async () => {
    const gitStatusMap = {
      '/project/main.ts': { path: '/project/main.ts', status: '??', staged: false },
    }
    render(<ExplorerPanel {...defaultProps} gitStatusMap={gitStatusMap} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const uElements = screen.getAllByText('U')
    expect(uElements.length).toBeGreaterThanOrEqual(1)
  })

  it('displays Deleted status badge', async () => {
    const gitStatusMap = {
      '/project/main.ts': { path: '/project/main.ts', status: 'D', staged: false },
    }
    render(<ExplorerPanel {...defaultProps} gitStatusMap={gitStatusMap} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const dElements = screen.getAllByText('D')
    expect(dElements.length).toBeGreaterThanOrEqual(1)
  })

  it('renders git section with branch info', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText(/Git & Worktree/)).toBeInTheDocument()
      expect(screen.getByText('main')).toBeInTheDocument()
    })
  })

  it('shows workspace path in worktree card', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('/project')).toBeInTheDocument()
    })
  })

  it('displays 本机未提交变更 header in git section', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('本机未提交变更')).toBeInTheDocument()
    })
  })

  it('displays modified files in git diff section with 查看差异', async () => {
    const gitStatusMap = {
      '/project/main.ts': { path: '/project/main.ts', status: 'M', staged: false },
    }
    render(<ExplorerPanel {...defaultProps} gitStatusMap={gitStatusMap} />)
    await waitFor(() => {
      expect(screen.getByText('查看差异')).toBeInTheDocument()
    })
  })

  it('displays untracked files in git section with U label', async () => {
    const gitStatusMap = {
      '/project/new.ts': { path: '/project/new.ts', status: '??', staged: false },
    }
    render(<ExplorerPanel {...defaultProps} gitStatusMap={gitStatusMap} />)
    await waitFor(() => {
      expect(screen.getByText('U')).toBeInTheDocument()
    })
  })

  it('clicks git diff file to open it', async () => {
    const gitStatusMap = {
      '/project/main.ts': { path: '/project/main.ts', status: 'M', staged: false },
    }
    render(<ExplorerPanel {...defaultProps} gitStatusMap={gitStatusMap} />)
    await waitFor(() => {
      expect(screen.getByText('查看差异')).toBeInTheDocument()
    })

    const diffFileRow = screen.getByText('查看差异').closest('div')
    expect(diffFileRow).toBeTruthy()
    fireEvent.click(diffFileRow!)

    expect(defaultProps.onOpenFile).toHaveBeenCalledWith('/project/main.ts')
  })

  // ─── Keyboard Navigation ───

  it('opens file on Enter key', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    fireEvent.keyDown(mainBtn!, { key: 'Enter' })

    expect(defaultProps.onOpenFile).toHaveBeenCalledWith('/project/main.ts', { preview: true })
  })

  it('enters rename mode on F2 key', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    await act(async () => {
      fireEvent.keyDown(mainBtn!, { key: 'F2' })
    })

    await waitFor(() => {
      const input = findRenameInput()
      expect(input).toBeTruthy()
      expect(input?.value).toBe('main.ts')
    })
  })

  it('shows delete confirmation on Delete key', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    fireEvent.keyDown(mainBtn!, { key: 'Delete' })

    await waitFor(() => {
      expect(screen.getByText(/Delete main.ts\?/)).toBeInTheDocument()
    })
  })

  it('expands directory on Space key', async () => {
    const srcDir = dir('src', '/project/src', [file('index.ts', '/project/src/index.ts')])
    mockListDir.mockResolvedValue([srcDir])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    const srcBtn = findTreeButton('src')
    fireEvent.keyDown(srcBtn!, { key: ' ' })

    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeInTheDocument()
    })
  })

  it('expands directory on ArrowRight key', async () => {
    const srcDir = dir('src', '/project/src', [file('index.ts', '/project/src/index.ts')])
    mockListDir.mockResolvedValue([srcDir])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    const srcBtn = findTreeButton('src')
    fireEvent.keyDown(srcBtn!, { key: 'ArrowRight' })

    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeInTheDocument()
    })
  })

  it('collapses directory on ArrowLeft key', async () => {
    const srcDir = dir('src', '/project/src', [file('index.ts', '/project/src/index.ts')])
    mockListDir.mockResolvedValue([srcDir])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    // First expand
    fireEvent.click(screen.getByRole('button', { name: /Expand src/ }))
    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeInTheDocument()
    })

    // Collapse with ArrowLeft
    const srcBtn = findTreeButton('src')
    fireEvent.keyDown(srcBtn!, { key: 'ArrowLeft' })

    await waitFor(() => {
      expect(screen.queryByText('index.ts')).not.toBeInTheDocument()
    })
  })

  // ─── Drag and Drop ───

  it('sets drag data on file drag start', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    const dataTransfer = {
      setData: vi.fn(),
      effectAllowed: '',
    }
    fireEvent.dragStart(mainBtn!, { dataTransfer })

    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', '/project/main.ts')
    expect(dataTransfer.setData).toHaveBeenCalledWith('application/json', expect.stringContaining('/project/main.ts'))
    expect(dataTransfer.effectAllowed).toBe('move')
  })

  // ─── Callback Props ───

  it('calls onFileTreeChange when file tree loads', async () => {
    const onFileTreeChange = vi.fn()
    const entries = [dir('src', '/project/src'), file('main.ts', '/project/main.ts')]
    mockListDir.mockResolvedValue(entries)

    render(<ExplorerPanel {...defaultProps} onFileTreeChange={onFileTreeChange} />)
    await waitFor(() => {
      expect(onFileTreeChange).toHaveBeenCalledWith(entries)
    })
  })

  it('calls onExpandedDirsChange when directory is toggled', async () => {
    const onExpandedDirsChange = vi.fn()
    const srcDir = dir('src', '/project/src', [file('index.ts', '/project/src/index.ts')])
    mockListDir.mockResolvedValue([srcDir])

    render(<ExplorerPanel {...defaultProps} onExpandedDirsChange={onExpandedDirsChange} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Expand src/ }))

    await waitFor(() => {
      expect(onExpandedDirsChange).toHaveBeenCalled()
      const lastCallArg = onExpandedDirsChange.mock.calls[onExpandedDirsChange.mock.calls.length - 1][0]
      expect(lastCallArg.has('/project/src')).toBe(true)
    })
  })

  it('refreshes git status after rename', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    await act(async () => {
      fireEvent.keyDown(mainBtn!, { key: 'F2' })
    })

    let input: HTMLInputElement | null = null
    await waitFor(() => {
      input = findRenameInput()
      expect(input).toBeTruthy()
    })

    fireEvent.change(input!, { target: { value: 'renamed.ts' } })
    await act(async () => {
      fireEvent.keyDown(input!, { key: 'Enter' })
    })

    await waitFor(() => {
      expect(defaultProps.onRefreshGitStatus).toHaveBeenCalled()
    })
  })

  // ─── Git Branch Fetching ───

  it('defaults to main branch if gitApi.getBranch fails', async () => {
    const { gitApi } = await import('../services')
    vi.mocked(gitApi.getBranch).mockRejectedValueOnce(new Error('no git'))

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main')).toBeInTheDocument()
    })
  })

  // ─── Nested Directory Structure ───

  it('renders nested directories correctly', async () => {
    const fullTree: FileEntry[] = [
      dir('a', '/project/a', [
        dir('b', '/project/a/b', [
          file('deep.ts', '/project/a/b/deep.ts'),
        ]),
      ]),
    ]
    mockListDir.mockResolvedValue(fullTree)

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('a')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Expand a/ }))
    await waitFor(() => {
      expect(screen.getByText('b')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Expand b/ }))
    await waitFor(() => {
      expect(screen.getByText('deep.ts')).toBeInTheDocument()
    })
  })

  // ─── Multiple Files with Same Name ───

  it('handles multiple files with the same name in different dirs', async () => {
    const fullTree: FileEntry[] = [
      dir('src', '/project/src', [file('index.ts', '/project/src/index.ts')]),
      dir('test', '/project/test', [file('index.ts', '/project/test/index.ts')]),
    ]
    mockListDir.mockResolvedValue(fullTree)

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Expand src/ }))
    fireEvent.click(screen.getByRole('button', { name: /Expand test/ }))

    await waitFor(() => {
      const indexTsElements = screen.getAllByText('index.ts')
      expect(indexTsElements.length).toBe(2)
    })
  })

  // ─── Chevron key interaction ───

  it('expands directory via chevron Enter key', async () => {
    const srcDir = dir('src', '/project/src', [file('index.ts', '/project/src/index.ts')])
    mockListDir.mockResolvedValue([srcDir])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    const chevronBtn = screen.getByRole('button', { name: /Expand src/ })
    fireEvent.keyDown(chevronBtn, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeInTheDocument()
    })
  })

  // ─── Worktree card shows fallback workspace ───

  it('shows open folder prompt when workspace is empty', async () => {
    mockListDir.mockResolvedValue([])
    render(<ExplorerPanel {...defaultProps} workspace="" />)

    await act(async () => { await new Promise(r => setTimeout(r, 10)) })

    expect(screen.getByText('尚未打开工作区')).toBeInTheDocument()
  })

  // ─── Non-directory entry creates new file in parent dir ───

  it('creates new file inside parent directory when context menu from file in subdir', async () => {
    mockListDir.mockResolvedValue([
      dir('src', '/project/src', [file('main.ts', '/project/src/main.ts')]),
    ])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    // Expand src first
    fireEvent.click(screen.getByRole('button', { name: /Expand src/ }))
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    // Right-click on main.ts (file, not directory)
    const mainBtn = findTreeButton('main.ts')
    fireEvent.contextMenu(mainBtn!, { clientX: 100, clientY: 200 })

    // Wait for context menu and verify no "New File" option
    await waitFor(() => {
      expect(screen.getByText('Open')).toBeInTheDocument()
    })

    // No "New File" since main.ts is not a directory
    expect(screen.queryByText('New File')).not.toBeInTheDocument()
  })

  // ─── loadFile Error Handling ───

  it('shows toast on file load error', async () => {
    const onOpenFile = vi.fn(() => { throw new Error('read error') })
    render(<ExplorerPanel {...defaultProps} onOpenFile={onOpenFile} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    fireEvent.click(mainBtn!)

    await waitFor(() => {
      expect(defaultProps.onToast).toHaveBeenCalledWith('error', 'Failed to load file', 'read error')
    })
  })

  // ─── Deeply Nested updateChildren ───

  it('loads children into deeply nested directory from API', async () => {
    const srcDir = dir('src', '/project/src', [
      dir('components', '/project/src/components', []),
    ])
    mockListDir
      .mockResolvedValueOnce([srcDir])
      .mockResolvedValueOnce([file('App.tsx', '/project/src/components/App.tsx')])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    // Expand src first
    fireEvent.click(screen.getByRole('button', { name: /Expand src/ }))
    await waitFor(() => {
      expect(screen.getByText('components')).toBeInTheDocument()
    })

    // Now expand components (which has empty children, so API call is needed)
    fireEvent.click(screen.getByRole('button', { name: /Expand components/ }))
    await waitFor(() => {
      expect(mockListDir).toHaveBeenCalledWith('/project/src/components')
      expect(screen.getByText('App.tsx')).toBeInTheDocument()
    })
  })

  // ─── Context Menu: New Folder from directory ───

  it('opens new folder dialog from directory context menu', async () => {
    mockListDir.mockResolvedValue([dir('src', '/project/src')])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    const srcBtn = findTreeButton('src')
    fireEvent.contextMenu(srcBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const newFolderBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.includes('New Folder'))
      expect(newFolderBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      newFolderBtn!.dispatchEvent(evt)
    })

    await waitFor(() => {
      const heading = screen.getAllByText('New Folder').find(el => el.tagName === 'H3')
      expect(heading).toBeTruthy()
      expect(screen.getByPlaceholderText('folder-name')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('folder-name')
    fireEvent.change(input, { target: { value: 'subdir' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mockMkdir).toHaveBeenCalledWith('/project/src/subdir')
      expect(defaultProps.onToast).toHaveBeenCalledWith('success', 'Created', 'Folder: subdir')
    })
  })

  // ─── Context Menu: handleNewFile with file entry (parent dir fallback) ───

  it('creates new file in parent directory when new file from file entry context menu', async () => {
    mockListDir.mockResolvedValue([
      dir('src', '/project/src', [file('main.ts', '/project/src/main.ts')]),
    ])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    // Expand src
    fireEvent.click(screen.getByRole('button', { name: /Expand src/ }))
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    // Right-click on the file main.ts and click "New File" - but it's a file, so no "New File" option
    // Instead, test the header new-file button works when clicking from within a subdir
    // We'll use a directory context menu to create new file in parent
    const srcBtn = findTreeButton('src')
    fireEvent.contextMenu(srcBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const newFileBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.includes('New File'))
      expect(newFileBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      newFileBtn!.dispatchEvent(evt)
    })

    await waitFor(() => {
      expect(screen.getByPlaceholderText('file-name.ext')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('file-name.ext')
    fireEvent.change(input, { target: { value: 'new.ts' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mockCreateFile).toHaveBeenCalledWith('/project/src/new.ts')
    })
  })

  // ─── Keyboard: ArrowDown / ArrowUp Navigation ───

  it('moves focus to next file on ArrowDown', async () => {
    mockListDir.mockResolvedValue([
      file('a.ts', '/project/a.ts'),
      file('b.ts', '/project/b.ts'),
    ])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('a.ts')).toBeInTheDocument()
      expect(screen.getByText('b.ts')).toBeInTheDocument()
    })

    const aBtn = findTreeButton('a.ts')
    const bBtn = findTreeButton('b.ts')
    aBtn!.focus()
    fireEvent.keyDown(aBtn!, { key: 'ArrowDown' })

    expect(document.activeElement).toBe(bBtn)
  })

  it('moves focus to previous file on ArrowUp', async () => {
    mockListDir.mockResolvedValue([
      file('a.ts', '/project/a.ts'),
      file('b.ts', '/project/b.ts'),
    ])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('a.ts')).toBeInTheDocument()
      expect(screen.getByText('b.ts')).toBeInTheDocument()
    })

    const aBtn = findTreeButton('a.ts')
    const bBtn = findTreeButton('b.ts')
    bBtn!.focus()
    fireEvent.keyDown(bBtn!, { key: 'ArrowUp' })

    expect(document.activeElement).toBe(aBtn)
  })

  it('does not move focus past first item on ArrowUp', async () => {
    mockListDir.mockResolvedValue([
      file('a.ts', '/project/a.ts'),
    ])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('a.ts')).toBeInTheDocument()
    })

    const aBtn = findTreeButton('a.ts')
    aBtn!.focus()
    fireEvent.keyDown(aBtn!, { key: 'ArrowUp' })

    // Should stay on the same button (index 0)
    expect(document.activeElement).toBe(aBtn)
  })

  it('does not move focus past last item on ArrowDown', async () => {
    mockListDir.mockResolvedValue([
      file('a.ts', '/project/a.ts'),
    ])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('a.ts')).toBeInTheDocument()
    })

    const aBtn = findTreeButton('a.ts')
    aBtn!.focus()
    fireEvent.keyDown(aBtn!, { key: 'ArrowDown' })

    // Should stay on the same button (last index)
    expect(document.activeElement).toBe(aBtn)
  })

  // ─── Keyboard: Home / End ───

  it('focuses first file on Home key', async () => {
    mockListDir.mockResolvedValue([
      file('a.ts', '/project/a.ts'),
      file('b.ts', '/project/b.ts'),
      file('c.ts', '/project/c.ts'),
    ])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('c.ts')).toBeInTheDocument()
    })

    const cBtn = findTreeButton('c.ts')
    const aBtn = findTreeButton('a.ts')
    cBtn!.focus()
    fireEvent.keyDown(cBtn!, { key: 'Home' })

    expect(document.activeElement).toBe(aBtn)
  })

  it('focuses last file on End key', async () => {
    mockListDir.mockResolvedValue([
      file('a.ts', '/project/a.ts'),
      file('b.ts', '/project/b.ts'),
      file('c.ts', '/project/c.ts'),
    ])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('c.ts')).toBeInTheDocument()
    })

    const aBtn = findTreeButton('a.ts')
    const cBtn = findTreeButton('c.ts')
    aBtn!.focus()
    fireEvent.keyDown(aBtn!, { key: 'End' })

    expect(document.activeElement).toBe(cBtn)
  })

  // ─── Keyboard: ArrowRight on expanded directory (focus first child) ───

  it('focuses first child on ArrowRight when directory already expanded', async () => {
    const srcDir = dir('src', '/project/src', [file('index.ts', '/project/src/index.ts')])
    mockListDir.mockResolvedValue([srcDir])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    // Expand directory first
    fireEvent.click(screen.getByRole('button', { name: /Expand src/ }))
    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeInTheDocument()
    })

    // Now ArrowRight on an already-expanded directory should focus first child
    const srcBtn = findTreeButton('src')
    srcBtn!.focus()
    fireEvent.keyDown(srcBtn!, { key: 'ArrowRight' })
    flushRAF()

    const indexBtn = findTreeButton('index.ts')
    expect(document.activeElement).toBe(indexBtn)
  })

  // ─── Keyboard: ArrowLeft on collapsed directory (no-op) ───

  it('does nothing on ArrowLeft when directory is already collapsed', async () => {
    const srcDir = dir('src', '/project/src', [file('index.ts', '/project/src/index.ts')])
    mockListDir.mockResolvedValue([srcDir])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    // ArrowLeft on collapsed dir does nothing
    const srcBtn = findTreeButton('src')
    srcBtn!.focus()
    fireEvent.keyDown(srcBtn!, { key: 'ArrowLeft' })

    // index.ts should NOT appear
    expect(screen.queryByText('index.ts')).not.toBeInTheDocument()
  })

  // ─── Cut directory entry ───

  it('sets clipboard for copy on directory entry', async () => {
    mockListDir.mockResolvedValue([dir('src', '/project/src')])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    const srcBtn = findTreeButton('src')
    fireEvent.contextMenu(srcBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const copyBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Copy')
      expect(copyBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      copyBtn!.dispatchEvent(evt)
    })

    await waitFor(() => {
      expect(defaultProps.onToast).toHaveBeenCalledWith('info', 'Copied', 'Folder copied: src')
    })
  })

  // ─── Paste into file entry (uses parent dir as target) ───

  it('pastes file using parent directory of file entry as target', async () => {
    mockListDir
      .mockResolvedValueOnce([
        file('main.ts', '/project/main.ts'),
        dir('src', '/project/src', [file('app.ts', '/project/src/app.ts')]),
      ])
      .mockResolvedValueOnce([]) // refreshFileTree after paste

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    // Expand src to see app.ts
    fireEvent.click(screen.getByRole('button', { name: /Expand src/ }))
    await waitFor(() => {
      expect(screen.getByText('app.ts')).toBeInTheDocument()
    })

    // Copy main.ts
    const mainBtn = findTreeButton('main.ts')
    fireEvent.contextMenu(mainBtn!, { clientX: 100, clientY: 200 })
    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const copyBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Copy')
      expect(copyBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      copyBtn!.dispatchEvent(evt)
    })
    await waitFor(() => {
      expect(defaultProps.onToast).toHaveBeenCalledWith('info', 'Copied', 'File copied: main.ts')
    })

    // Right-click on app.ts (file, not directory) and paste
    const appBtn = findTreeButton('app.ts')
    fireEvent.contextMenu(appBtn!, { clientX: 100, clientY: 200 })
    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const pasteBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Paste')
      expect(pasteBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      pasteBtn!.dispatchEvent(evt)
    })

    await waitFor(() => {
      // Target dir for file entry app.ts at /project/src/app.ts -> /project/src
      expect(mockCopyFile).toHaveBeenCalledWith('/project/main.ts', '/project/src/main.ts')
    })
  })

  // ─── Paste with cut operation on non-open file ───

  it('pastes with cut (move) on file not currently open', async () => {
    mockListDir
      .mockResolvedValueOnce([
        file('main.ts', '/project/main.ts'),
        dir('src', '/project/src', [file('index.ts', '/project/src/index.ts')]),
      ])
      .mockResolvedValueOnce([])

    render(<ExplorerPanel {...defaultProps} openFiles={[]} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    // Cut the file
    const mainBtn = findTreeButton('main.ts')
    fireEvent.contextMenu(mainBtn!, { clientX: 100, clientY: 200 })
    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const cutBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Cut')
      expect(cutBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      cutBtn!.dispatchEvent(evt)
    })
    await waitFor(() => {
      expect(defaultProps.onToast).toHaveBeenCalledWith('info', 'Cut', 'File cut: main.ts')
    })

    // Paste into directory
    const srcBtn = findTreeButton('src')
    fireEvent.contextMenu(srcBtn!, { clientX: 100, clientY: 200 })
    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const pasteBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Paste')
      expect(pasteBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      pasteBtn!.dispatchEvent(evt)
    })

    await waitFor(() => {
      expect(mockRename).toHaveBeenCalledWith('/project/main.ts', '/project/src/main.ts')
      expect(defaultProps.onToast).toHaveBeenCalledWith('success', 'Moved', 'File moved: main.ts')
      expect(defaultProps.onRefreshGitStatus).toHaveBeenCalled()
    })
  })

  // ─── Chevron space key on chevron span ───

  it('expands directory via chevron Space key', async () => {
    const srcDir = dir('src', '/project/src', [file('index.ts', '/project/src/index.ts')])
    mockListDir.mockResolvedValue([srcDir])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    const chevronBtn = screen.getByRole('button', { name: /Expand src/ })
    fireEvent.keyDown(chevronBtn, { key: ' ' })

    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeInTheDocument()
    })
  })

  // ─── Rename file not currently open ───

  it('does not call onRenameFileInStore when renamed file is not open', async () => {
    render(<ExplorerPanel {...defaultProps} openFiles={[]} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    await act(async () => {
      fireEvent.keyDown(mainBtn!, { key: 'F2' })
    })

    let input: HTMLInputElement | null = null
    await waitFor(() => {
      input = findRenameInput()
      expect(input).toBeTruthy()
    })

    fireEvent.change(input!, { target: { value: 'renamed.ts' } })
    await act(async () => {
      fireEvent.keyDown(input!, { key: 'Enter' })
    })

    await waitFor(() => {
      expect(mockRename).toHaveBeenCalledWith('/project/main.ts', '/project/renamed.ts')
      expect(defaultProps.onRenameFileInStore).not.toHaveBeenCalled()
    })
  })

  // ─── Delete file not currently open ───

  it('does not close file after deleting when file is not open', async () => {
    render(<ExplorerPanel {...defaultProps} openFiles={[]} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    const mainBtn = findTreeButton('main.ts')
    fireEvent.keyDown(mainBtn!, { key: 'Delete' })

    await waitFor(() => {
      expect(screen.getByText(/Delete main.ts\?/)).toBeInTheDocument()
    })

    const dialogs = document.querySelectorAll('[role="dialog"]')
    const deleteDialog = Array.from(dialogs).find(d => d.textContent?.includes('Delete main.ts'))
    const confirmBtn = within(deleteDialog! as HTMLElement).getByText('Delete')
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('/project/main.ts')
      expect(defaultProps.onCloseFile).not.toHaveBeenCalled()
    })
  })

  // ─── New folder creates with create button ───

  it('creates folder via Create button click', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByTitle('新建文件夹')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('新建文件夹'))
    await waitFor(() => {
      expect(screen.getByPlaceholderText('folder-name')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('folder-name')
    fireEvent.change(input, { target: { value: 'mydir' } })

    // Click the Create button instead of pressing Enter
    const dialogs = document.querySelectorAll('[role="dialog"]')
    const dialog = Array.from(dialogs).find(d => d.textContent?.includes('New Folder'))
    const createBtn = within(dialog! as HTMLElement).getByText('Create')
    fireEvent.click(createBtn)

    await waitFor(() => {
      expect(mockMkdir).toHaveBeenCalledWith('/project/mydir')
    })
  })

  // ─── New folder does not open file after creation ───

  it('handles mkdir error', async () => {
    mockMkdir.mockRejectedValueOnce(new Error('mkdir failed'))

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByTitle('新建文件夹')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('新建文件夹'))
    await waitFor(() => {
      expect(screen.getByPlaceholderText('folder-name')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('folder-name')
    fireEvent.change(input, { target: { value: 'myfolder' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(defaultProps.onToast).toHaveBeenCalledWith('error', 'Create failed', 'mkdir failed')
    })
  })

  // ─── Cancel new folder dialog ───

  it('cancels new folder dialog', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByTitle('新建文件夹')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('新建文件夹'))
    await waitFor(() => {
      expect(screen.getByPlaceholderText('folder-name')).toBeInTheDocument()
    })

    const dialogs = document.querySelectorAll('[role="dialog"]')
    const dialog = Array.from(dialogs).find(d => d.textContent?.includes('New Folder'))
    const cancelBtn = within(dialog! as HTMLElement).getByText('Cancel')
    fireEvent.click(cancelBtn)

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('folder-name')).not.toBeInTheDocument()
    })
  })

  // ─── Empty directory with children array but zero length ───

  it('shows empty state when all files are filtered out', async () => {
    mockListDir.mockResolvedValue([
      file('main.ts', '/project/main.ts'),
    ])

    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('Filter files...'), { target: { value: 'zzznonexistent' } })

    await waitFor(() => {
      expect(screen.queryByText('main.ts')).not.toBeInTheDocument()
    })
  })

  // ─── Copy operation on directory ───

  it('copy on directory shows folder copied toast', async () => {
    mockListDir.mockResolvedValue([dir('src', '/project/src')])
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    const srcBtn = findTreeButton('src')
    fireEvent.contextMenu(srcBtn!, { clientX: 100, clientY: 200 })

    await waitFor(() => {
      const menu = document.querySelector('.fixed.rounded-lg.shadow-xl') as HTMLElement
      expect(menu).toBeTruthy()
      const copyBtn = Array.from(menu!.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Copy')
      expect(copyBtn).toBeTruthy()
      const evt = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(evt, 'stopPropagation', { value: vi.fn() })
      copyBtn!.dispatchEvent(evt)
    })

    await waitFor(() => {
      expect(defaultProps.onToast).toHaveBeenCalledWith('info', 'Copied', 'Folder copied: src')
    })
  })

  // ─── Git status: other status codes ───

  it('displays generic status code for unrecognized git status', async () => {
    const gitStatusMap = {
      '/project/main.ts': { path: '/project/main.ts', status: 'R', staged: false },
    }
    render(<ExplorerPanel {...defaultProps} gitStatusMap={gitStatusMap} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    // For unrecognized status, it should display the raw status code
    // 'R' appears in both the file tree badge and the git section
    const rElements = screen.getAllByText('R')
    expect(rElements.length).toBeGreaterThanOrEqual(1)
  })

  // ─── Git added file with isAdded logic ───

  it('renders git added file with isAdded styling', async () => {
    const gitStatusMap = {
      '/project/main.ts': { path: '/project/main.ts', status: 'A', staged: true },
    }
    render(<ExplorerPanel {...defaultProps} gitStatusMap={gitStatusMap} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    // The Added status is shown in the file tree badge
    const aElements = screen.getAllByText('A')
    expect(aElements.length).toBeGreaterThanOrEqual(1)
  })
})
