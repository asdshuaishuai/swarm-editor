import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ExplorerPanel from './ExplorerPanel'

const mockListDir = vi.fn()
const mockRename = vi.fn()

vi.mock('../services', () => ({
  api: {
    fs: {
      listDir: (...args: unknown[]) => mockListDir(...args),
      renameFile: (...args: unknown[]) => mockRename(...args),
    },
  },
  gitApi: {
    getBranch: vi.fn().mockResolvedValue('main'),
  },
}))

vi.mock('../hooks/useMenuKeyboardNav', () => ({
  useMenuKeyboardNav: () => ({ currentIndex: -1, setCurrentIndex: vi.fn() }),
}))

const defaultProps = {
  workspace: '/project',
  currentFile: null,
  gitStatusMap: {},
  openFiles: [],
  dirtyFiles: new Set<string>(),
  onOpenFile: vi.fn(),
  onCloseFile: vi.fn(),
  onToast: vi.fn(),
  onRefreshGitStatus: vi.fn(),
  onRenameFileInStore: vi.fn(),
}

describe('ExplorerPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListDir.mockResolvedValue([
      { name: 'src', isDirectory: true, path: 'src' },
      { name: 'main.ts', isDirectory: false, path: 'main.ts' },
    ])
  })

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

  it('opens file on click', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('main.ts'))
    expect(defaultProps.onOpenFile).toHaveBeenCalledWith('main.ts', { preview: true })
  })

  it('shows filter input', async () => {
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Filter files...')).toBeInTheDocument()
    })
  })

  it('handles listDir error gracefully', async () => {
    mockListDir.mockRejectedValueOnce(new Error('Permission denied'))
    render(<ExplorerPanel {...defaultProps} />)
    await waitFor(() => {
      expect(mockListDir).toHaveBeenCalled()
    })
    // Should not crash — error is logged via logger
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
})
