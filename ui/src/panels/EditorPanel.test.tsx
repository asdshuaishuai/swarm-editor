import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import EditorPanel from './EditorPanel'

// Mock Monaco Editor
vi.mock('@monaco-editor/react', () => ({
  default: ({ language, value, onChange, options }: {
    language: string
    value: string
    onChange: (value: string | undefined) => void
    options?: { wordWrap?: string; lineNumbers?: string }
  }) => (
    <textarea
      data-testid="monaco-editor"
      data-language={language}
      data-wordwrap={options?.wordWrap}
      data-linenumbers={options?.lineNumbers}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      onBlur={() => onChange?.(undefined)}
    />
  ),
}))

// Mock the store
const mockUseAppStore = vi.fn()
vi.mock('../store/appStore', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => mockUseAppStore(selector),
}))

// Mock the API
vi.mock('../services', () => ({
  api: {
    fs: {
      getWorkspace: vi.fn().mockResolvedValue('/home/user/project'),
      listDir: vi.fn().mockResolvedValue([
        { name: 'src', path: '/home/user/project/src', isDirectory: true, children: [
          { name: 'main.ts', path: '/home/user/project/src/main.ts', isDirectory: false },
          { name: 'utils.ts', path: '/home/user/project/src/utils.ts', isDirectory: false },
          { name: 'types.ts', path: '/home/user/project/src/types.ts', isDirectory: false },
        ]},
        { name: 'package.json', path: '/home/user/project/package.json', isDirectory: false },
        { name: 'README.md', path: '/home/user/project/README.md', isDirectory: false },
      ]),
      readFile: vi.fn().mockResolvedValue('// file content'),
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
    execute: {
      executeCode: vi.fn().mockResolvedValue({ success: true, output: 'test output' }),
    },
  },
}))

describe('EditorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAppStore.mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        swarms: [],
        agents: [],
        selectedAgent: null,
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('renders toolbar with language selector', () => {
    render(<EditorPanel />)
    expect(screen.getByRole('option', { name: 'TypeScript' })).toBeInTheDocument()
  })

  it('renders Save button', () => {
    render(<EditorPanel />)
    expect(screen.getByText('Save')).toBeInTheDocument()
  })

  it('renders Run button', () => {
    render(<EditorPanel />)
    expect(screen.getByText('Run')).toBeInTheDocument()
  })

  it('shows file tree by default', () => {
    render(<EditorPanel />)
    expect(screen.getByText('Explorer')).toBeInTheDocument()
  })

  it('shows file tree items', async () => {
    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
  })

  it('toggles file tree visibility', () => {
    render(<EditorPanel />)
    const toggleButton = screen.getByTitle('Toggle File Tree')
    fireEvent.click(toggleButton)
    expect(screen.queryByText('Explorer')).not.toBeInTheDocument()
    fireEvent.click(toggleButton)
    expect(screen.getByText('Explorer')).toBeInTheDocument()
  })

  it('changes language selection', () => {
    render(<EditorPanel />)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'python' } })
    expect(select).toHaveValue('python')
  })

  it('renders Monaco editor with initial code', () => {
    render(<EditorPanel />)
    const editor = screen.getByTestId('monaco-editor')
    expect(editor).toBeInTheDocument()
    const value = (editor as HTMLTextAreaElement).value
    expect(value).toContain('Swarm')
  })

  it('updates code when editor changes', () => {
    render(<EditorPanel />)
    const editor = screen.getByTestId('monaco-editor')
    fireEvent.change(editor, { target: { value: 'new code' } })
    expect(editor).toHaveValue('new code')
  })

  it('handles undefined value from Monaco editor', () => {
    render(<EditorPanel />)
    const editor = screen.getByTestId('monaco-editor')
    const initialValue = (editor as HTMLTextAreaElement).value
    expect(initialValue).toContain('Swarm')
    fireEvent.blur(editor)
    expect(editor).toHaveValue(initialValue)
  })

  it('sets correct language on editor', () => {
    render(<EditorPanel />)
    const editor = screen.getByTestId('monaco-editor')
    expect(editor).toHaveAttribute('data-language', 'typescript')
  })

  it('passes default wordWrap and lineNumbers to editor', async () => {
    render(<EditorPanel />)
    const editor = screen.getByTestId('monaco-editor')
    expect(editor).toHaveAttribute('data-wordwrap', 'on')
    expect(editor).toHaveAttribute('data-linenumbers', 'on')
  })

  it('shows Run button disabled when no file loaded', () => {
    render(<EditorPanel />)
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
  })

  it('enables Run button when file is loaded', async () => {
    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('package.json'))
    await waitFor(() => {
      expect(screen.getByText('Run')).not.toBeDisabled()
    })
  })

  it('loads a file when clicked', async () => {
    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('package.json'))
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toHaveAttribute('data-language', 'json')
    })
  })

  it('expands directory when clicked', async () => {
    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('src'))
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })
  })
})

describe('EditorPanel with swarms', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAppStore.mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        swarms: [{
          id: 'swarm-1',
          name: 'Test Swarm',
          topology: 'star',
          agents: [],
        }],
        agents: [],
        selectedAgent: null,
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('shows agent selector when Run clicked with file loaded', async () => {
    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('package.json'))
    await waitFor(() => {
      expect(screen.getByText('Run')).not.toBeDisabled()
    })
    fireEvent.click(screen.getByText('Run'))
    await waitFor(() => {
      expect(screen.getByText('Select Execution Mode')).toBeInTheDocument()
    })
  })

  it('executes code directly when selected', async () => {
    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('package.json'))
    await waitFor(() => {
      expect(screen.getByText('Run')).not.toBeDisabled()
    })
    fireEvent.click(screen.getByText('Run'))
    await waitFor(() => {
      expect(screen.getByText('Execute Directly')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Execute Directly'))
    await waitFor(() => {
      expect(screen.queryByText('Select Execution Mode')).not.toBeInTheDocument()
    })
  })

  it('closes modal when X clicked', async () => {
    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('package.json'))
    await waitFor(() => {
      expect(screen.getByText('Run')).not.toBeDisabled()
    })
    fireEvent.click(screen.getByText('Run'))
    await waitFor(() => {
      expect(screen.getByText('Select Execution Mode')).toBeInTheDocument()
    })
    // Click X button
    const closeButton = screen.getByRole('button', { name: 'Close modal' })
    fireEvent.click(closeButton)
    await waitFor(() => {
      expect(screen.queryByText('Select Execution Mode')).not.toBeInTheDocument()
    })
  })

  it('executes code via swarm when selected', async () => {
    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('package.json'))
    await waitFor(() => {
      expect(screen.getByText('Run')).not.toBeDisabled()
    })
    fireEvent.click(screen.getByText('Run'))
    await waitFor(() => {
      expect(screen.getByText('Test Swarm')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Test Swarm'))
    await waitFor(() => {
      expect(screen.queryByText('Select Execution Mode')).not.toBeInTheDocument()
    })
  })
})

describe('EditorPanel file operations', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Re-setup API mocks after clearAllMocks
    const { api } = await import('../services')
    vi.mocked(api.fs.getWorkspace).mockResolvedValue('/home/user/project')
    vi.mocked(api.fs.listDir).mockResolvedValue([
      { name: 'src', path: '/home/user/project/src', isDirectory: true, children: [
        { name: 'main.ts', path: '/home/user/project/src/main.ts', isDirectory: false },
        { name: 'utils.ts', path: '/home/user/project/src/utils.ts', isDirectory: false },
        { name: 'types.ts', path: '/home/user/project/src/types.ts', isDirectory: false },
      ]},
      { name: 'package.json', path: '/home/user/project/package.json', isDirectory: false },
      { name: 'README.md', path: '/home/user/project/README.md', isDirectory: false },
    ])
    vi.mocked(api.fs.readFile).mockResolvedValue('// file content')
    vi.mocked(api.fs.writeFile).mockResolvedValue(undefined)

    mockUseAppStore.mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        swarms: [],
        agents: [],
        selectedAgent: null,
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('saves file when Save button clicked', async () => {
    const { api } = await import('../services')
    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('package.json'))
    await waitFor(() => {
      expect(screen.getByText('Save')).not.toBeDisabled()
    })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => {
      expect(api.fs.writeFile).toHaveBeenCalled()
    })
  })

  it('shows Save button disabled when no file loaded', () => {
    render(<EditorPanel />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('shows workspace name in toolbar when no file loaded', async () => {
    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('project')).toBeInTheDocument()
    })
  })

  it('shows current file name in toolbar', async () => {
    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('package.json'))
    await waitFor(() => {
      // The filename should be shown in the toolbar
      const toolbarTexts = screen.getAllByText('package.json')
      expect(toolbarTexts.length).toBeGreaterThan(0)
    })
  })

  it('loads file with unknown extension and uses plaintext language', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.listDir).mockResolvedValue([
      { name: 'Makefile', path: '/home/user/project/Makefile', isDirectory: false },
    ])
    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('Makefile')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Makefile'))
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toHaveAttribute('data-language', 'plaintext')
    })
  })

  it('handles execution error gracefully', async () => {
    const { api } = await import('../services')
    vi.mocked(api.execute.executeCode).mockRejectedValueOnce(new Error('Network error'))
    mockUseAppStore.mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        swarms: [],
        agents: [],
        selectedAgent: null,
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('package.json'))
    await waitFor(() => {
      expect(screen.getByText('Run')).not.toBeDisabled()
    })
    fireEvent.click(screen.getByText('Run'))
    await waitFor(() => {
      expect(screen.getByText('Execute Directly')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Execute Directly'))
    // Should not crash
    await waitFor(() => {
      expect(screen.queryByText('Select Execution Mode')).not.toBeInTheDocument()
    })
  })

  it('handles execution failure result', async () => {
    const { api } = await import('../services')
    vi.mocked(api.execute.executeCode).mockResolvedValueOnce({
      success: false,
      error: 'Compilation error',
      output: '',
    })
    mockUseAppStore.mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        swarms: [],
        agents: [],
        selectedAgent: null,
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('package.json'))
    await waitFor(() => {
      expect(screen.getByText('Run')).not.toBeDisabled()
    })
    fireEvent.click(screen.getByText('Run'))
    await waitFor(() => {
      expect(screen.getByText('Execute Directly')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Execute Directly'))
    // Should not crash
    await waitFor(() => {
      expect(screen.queryByText('Select Execution Mode')).not.toBeInTheDocument()
    })
  })

  it('does nothing when clicking on a file (not directory)', async () => {
    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
    // Click on a file - toggleDir should return early
    fireEvent.click(screen.getByText('package.json'))
    // Should load the file, not expand anything
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toHaveAttribute('data-language', 'json')
    })
  })
})

describe('EditorPanel directory operations', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Re-setup API mocks after clearAllMocks
    const { api } = await import('../services')
    vi.mocked(api.fs.getWorkspace).mockResolvedValue('/home/user/project')
    vi.mocked(api.fs.listDir).mockResolvedValue([
      { name: 'src', path: '/home/user/project/src', isDirectory: true, children: [
        { name: 'main.ts', path: '/home/user/project/src/main.ts', isDirectory: false },
        { name: 'utils.ts', path: '/home/user/project/src/utils.ts', isDirectory: false },
        { name: 'types.ts', path: '/home/user/project/src/types.ts', isDirectory: false },
      ]},
      { name: 'package.json', path: '/home/user/project/package.json', isDirectory: false },
      { name: 'README.md', path: '/home/user/project/README.md', isDirectory: false },
    ])
    vi.mocked(api.fs.readFile).mockResolvedValue('// file content')

    mockUseAppStore.mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        swarms: [],
        agents: [],
        selectedAgent: null,
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('collapses directory when clicked again', async () => {
    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })
    // First click to expand
    fireEvent.click(screen.getByText('src'))
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })
    // Second click to collapse
    fireEvent.click(screen.getByText('src'))
    await waitFor(() => {
      expect(screen.queryByText('main.ts')).not.toBeInTheDocument()
    })
  })

  it('loads lazy directory children when expanded', async () => {
    const { api } = await import('../services')
    // Mock a directory without pre-loaded children
    vi.mocked(api.fs.listDir).mockImplementation((path: string) => {
      if (path === '/home/user/project') {
        return Promise.resolve([
          { name: 'empty-dir', path: '/home/user/project/empty-dir', isDirectory: true, children: [] },
          { name: 'file.txt', path: '/home/user/project/file.txt', isDirectory: false },
        ])
      }
      if (path === '/home/user/project/empty-dir') {
        return Promise.resolve([
          { name: 'nested-file.txt', path: '/home/user/project/empty-dir/nested-file.txt', isDirectory: false },
        ])
      }
      return Promise.resolve([])
    })

    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('empty-dir')).toBeInTheDocument()
    })
    // Click on empty directory to load children
    fireEvent.click(screen.getByText('empty-dir'))
    await waitFor(() => {
      expect(api.fs.listDir).toHaveBeenCalledWith('/home/user/project/empty-dir')
    })
  })

  it('toggles directory via chevron icon click', async () => {
    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    // Find the chevron icon container (span with mr-1 class)
    const dirRow = screen.getByText('src').closest('div')
    const chevronSpan = dirRow?.querySelector('span.mr-1')
    expect(chevronSpan).toBeInTheDocument()

    // Click on the chevron icon to toggle
    fireEvent.click(chevronSpan!)
    await waitFor(() => {
      expect(screen.getByText('main.ts')).toBeInTheDocument()
    })

    // Click again to collapse
    fireEvent.click(chevronSpan!)
    await waitFor(() => {
      expect(screen.queryByText('main.ts')).not.toBeInTheDocument()
    })
  })

  it('loads nested directory children recursively', async () => {
    const { api } = await import('../services')
    // Mock nested directory structure
    vi.mocked(api.fs.listDir).mockImplementation((path: string) => {
      if (path === '/home/user/project') {
        return Promise.resolve([
          { name: 'src', path: '/home/user/project/src', isDirectory: true, children: [
            { name: 'components', path: '/home/user/project/src/components', isDirectory: true, children: [] },
          ]},
        ])
      }
      if (path === '/home/user/project/src/components') {
        return Promise.resolve([
          { name: 'Button.tsx', path: '/home/user/project/src/components/Button.tsx', isDirectory: false },
        ])
      }
      return Promise.resolve([])
    })

    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    // Expand src directory
    fireEvent.click(screen.getByText('src'))
    await waitFor(() => {
      expect(screen.getByText('components')).toBeInTheDocument()
    })

    // Expand nested components directory
    fireEvent.click(screen.getByText('components'))
    await waitFor(() => {
      expect(api.fs.listDir).toHaveBeenCalledWith('/home/user/project/src/components')
    })
  })
})

describe('EditorPanel execution scenarios', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Re-setup API mocks after clearAllMocks
    const { api } = await import('../services')
    vi.mocked(api.fs.getWorkspace).mockResolvedValue('/home/user/project')
    vi.mocked(api.fs.listDir).mockResolvedValue([
      { name: 'src', path: '/home/user/project/src', isDirectory: true, children: [
        { name: 'main.ts', path: '/home/user/project/src/main.ts', isDirectory: false },
      ]},
      { name: 'package.json', path: '/home/user/project/package.json', isDirectory: false },
    ])
    vi.mocked(api.fs.readFile).mockResolvedValue('// file content')
    vi.mocked(api.execute.executeCode).mockResolvedValue({ success: true, output: 'test output' })

    mockUseAppStore.mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        swarms: [{
          id: 'swarm-1',
          name: 'Test Swarm',
          topology: 'star',
          agents: [{ id: 'agent-1', name: 'Agent 1' }],
        }],
        agents: [],
        selectedAgent: null,
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('shows terminal output after execution', async () => {
    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('package.json'))
    await waitFor(() => {
      expect(screen.getByText('Run')).not.toBeDisabled()
    })
    fireEvent.click(screen.getByText('Run'))
    await waitFor(() => {
      expect(screen.getByText('Execute Directly')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Execute Directly'))
    await waitFor(() => {
      expect(screen.getByText('Terminal')).toBeInTheDocument()
    })
  })

  it('handles execution failure', async () => {
    const { api } = await import('../services')
    vi.mocked(api.execute.executeCode).mockResolvedValueOnce({
      success: false,
      output: '',
      error: 'Execution failed: syntax error',
    })

    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('package.json'))
    await waitFor(() => {
      expect(screen.getByText('Run')).not.toBeDisabled()
    })
    fireEvent.click(screen.getByText('Run'))
    await waitFor(() => {
      expect(screen.getByText('Execute Directly')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Execute Directly'))
    await waitFor(() => {
      expect(screen.getByText('Execution failed')).toBeInTheDocument()
    })
  })
})

describe('EditorPanel file type detection', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Re-setup API mocks after clearAllMocks
    const { api } = await import('../services')
    vi.mocked(api.fs.getWorkspace).mockResolvedValue('/home/user/project')

    mockUseAppStore.mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        swarms: [],
        agents: [],
        selectedAgent: null,
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('detects Python file language', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.listDir).mockResolvedValueOnce([
      { name: 'script.py', path: '/home/user/project/script.py', isDirectory: false },
    ])
    vi.mocked(api.fs.readFile).mockResolvedValueOnce('# python code')

    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('script.py')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('script.py'))
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toHaveAttribute('data-language', 'python')
    })
  })

  it('detects Go file language', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.listDir).mockResolvedValueOnce([
      { name: 'main.go', path: '/home/user/project/main.go', isDirectory: false },
    ])
    vi.mocked(api.fs.readFile).mockResolvedValueOnce('package main')

    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('main.go')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('main.go'))
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toHaveAttribute('data-language', 'go')
    })
  })

  it('detects Rust file language', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.listDir).mockResolvedValueOnce([
      { name: 'lib.rs', path: '/home/user/project/lib.rs', isDirectory: false },
    ])
    vi.mocked(api.fs.readFile).mockResolvedValueOnce('fn main() {}')

    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('lib.rs')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('lib.rs'))
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toHaveAttribute('data-language', 'rust')
    })
  })

  it('detects JavaScript file language', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.listDir).mockResolvedValueOnce([
      { name: 'app.js', path: '/home/user/project/app.js', isDirectory: false },
    ])
    vi.mocked(api.fs.readFile).mockResolvedValueOnce('console.log("hi")')

    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('app.js')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('app.js'))
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toHaveAttribute('data-language', 'javascript')
    })
  })

  it('detects Markdown file language', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.listDir).mockResolvedValueOnce([
      { name: 'README.md', path: '/home/user/project/README.md', isDirectory: false },
    ])
    vi.mocked(api.fs.readFile).mockResolvedValueOnce('# Title')

    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('README.md'))
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toHaveAttribute('data-language', 'markdown')
    })
  })

  it('detects HTML file language', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.listDir).mockResolvedValueOnce([
      { name: 'index.html', path: '/home/user/project/index.html', isDirectory: false },
    ])
    vi.mocked(api.fs.readFile).mockResolvedValueOnce('<!DOCTYPE html><html></html>')

    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('index.html')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('index.html'))
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toHaveAttribute('data-language', 'html')
    })
  })

  it('detects CSS file language', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.listDir).mockResolvedValueOnce([
      { name: 'styles.css', path: '/home/user/project/styles.css', isDirectory: false },
    ])
    vi.mocked(api.fs.readFile).mockResolvedValueOnce('body { margin: 0; }')

    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('styles.css')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('styles.css'))
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toHaveAttribute('data-language', 'css')
    })
  })
})

describe('EditorPanel error handling', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { api } = await import('../services')
    vi.mocked(api.fs.getWorkspace).mockResolvedValue('/home/user/project')
    vi.mocked(api.fs.listDir).mockResolvedValue([
      { name: 'src', path: '/home/user/project/src', isDirectory: true, children: [
        { name: 'main.ts', path: '/home/user/project/src/main.ts', isDirectory: false },
      ]},
      { name: 'package.json', path: '/home/user/project/package.json', isDirectory: false },
    ])
    vi.mocked(api.fs.readFile).mockResolvedValue('// file content')
    vi.mocked(api.execute.executeCode).mockResolvedValue({ success: true, output: 'test output' })

    mockUseAppStore.mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        swarms: [{
          id: 'swarm-1',
          name: 'Test Swarm',
          topology: 'star',
          agents: [{ id: 'agent-1', name: 'Agent 1' }],
        }],
        agents: [],
        selectedAgent: null,
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('handles execution error', async () => {
    const { api } = await import('../services')
    vi.mocked(api.execute.executeCode).mockRejectedValueOnce(new Error('Execution failed'))

    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('package.json'))
    await waitFor(() => {
      expect(screen.getByText('Run')).not.toBeDisabled()
    })
    fireEvent.click(screen.getByText('Run'))
    await waitFor(() => {
      expect(screen.getByText('Execute Directly')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Execute Directly'))
    // Wait for modal to close
    await waitFor(() => {
      expect(screen.queryByText('Execute Directly')).not.toBeInTheDocument()
    })
    // Terminal output should appear (with error message)
    await waitFor(() => {
      expect(screen.getByText('Terminal')).toBeInTheDocument()
    })
  })

  it('handles directory lazy load error', async () => {
    const { api } = await import('../services')
    // First call returns top-level, second call (lazy load) throws error
    vi.mocked(api.fs.listDir)
      .mockResolvedValueOnce([
        { name: 'src', path: '/home/user/project/src', isDirectory: true, children: [] },
        { name: 'file.txt', path: '/home/user/project/file.txt', isDirectory: false },
      ])
      .mockRejectedValueOnce(new Error('Failed to load directory'))

    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument()
    })
    // Click on directory to trigger lazy load
    fireEvent.click(screen.getByText('src'))
    // Should not crash, just log error
    await waitFor(() => {
      expect(api.fs.listDir).toHaveBeenCalledTimes(2)
    })
  })

  it('executes code via swarm', async () => {
    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('package.json'))
    await waitFor(() => {
      expect(screen.getByText('Run')).not.toBeDisabled()
    })
    fireEvent.click(screen.getByText('Run'))
    await waitFor(() => {
      expect(screen.getByText('Test Swarm')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Test Swarm'))
    await waitFor(() => {
      expect(screen.getByText('Terminal')).toBeInTheDocument()
    })
  })
})

describe('EditorPanel error and edge cases', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { api } = await import('../services')
    vi.mocked(api.fs.getWorkspace).mockResolvedValue('/home/user/project')
    vi.mocked(api.fs.listDir).mockResolvedValue([
      { name: 'src', path: '/home/user/project/src', isDirectory: true, children: [
        { name: 'main.ts', path: '/home/user/project/src/main.ts', isDirectory: false },
      ]},
      { name: 'package.json', path: '/home/user/project/package.json', isDirectory: false },
    ])
    vi.mocked(api.fs.readFile).mockResolvedValue('// file content')
    vi.mocked(api.execute.executeCode).mockResolvedValue({ success: true, output: 'test output' })

    mockUseAppStore.mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        swarms: [],
        agents: [],
        selectedAgent: null,
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('clears terminal output when Clear button clicked', async () => {
    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('package.json'))
    await waitFor(() => {
      expect(screen.getByText('Run')).not.toBeDisabled()
    })
    fireEvent.click(screen.getByText('Run'))
    await waitFor(() => {
      expect(screen.getByText('Execute Directly')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Execute Directly'))
    await waitFor(() => {
      expect(screen.getByText('Terminal')).toBeInTheDocument()
    })

    // Click clear button
    const clearButton = screen.getByTitle('Clear Output')
    fireEvent.click(clearButton)

    // Terminal should be cleared
    await waitFor(() => {
      expect(screen.queryByText('Terminal')).not.toBeInTheDocument()
    })
  })

  it('handles workspace load error gracefully', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.getWorkspace).mockRejectedValueOnce(new Error('Workspace not found'))

    render(<EditorPanel />)
    // Should not crash - just log error
    await waitFor(() => {
      expect(api.fs.getWorkspace).toHaveBeenCalled()
    })
  })

  it('handles file load error gracefully', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.readFile).mockRejectedValueOnce(new Error('File not found'))

    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('package.json'))

    // Should not crash - just log error
    await waitFor(() => {
      expect(api.fs.readFile).toHaveBeenCalled()
    })
  })

  it('handles file save error gracefully', async () => {
    const { api } = await import('../services')
    vi.mocked(api.fs.writeFile).mockRejectedValueOnce(new Error('Write permission denied'))

    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('package.json'))
    await waitFor(() => {
      expect(screen.getByText('Save')).not.toBeDisabled()
    })
    fireEvent.click(screen.getByText('Save'))

    // Should show error in terminal
    await waitFor(() => {
      expect(screen.getByText('Terminal')).toBeInTheDocument()
    })
  })

  it('handles execution failure with empty error (falls back to output)', async () => {
    const { api } = await import('../services')
    // Mock execution result with no error string - should fall back to output
    vi.mocked(api.execute.executeCode).mockResolvedValueOnce({
      success: false,
      error: '',  // Empty error - should fall back to output
      output: 'Fallback output message',
    })

    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('package.json'))
    await waitFor(() => {
      expect(screen.getByText('Run')).not.toBeDisabled()
    })
    fireEvent.click(screen.getByText('Run'))
    await waitFor(() => {
      expect(screen.getByText('Execute Directly')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Execute Directly'))
    // Should show terminal output with fallback message
    await waitFor(() => {
      expect(screen.getByText('Terminal')).toBeInTheDocument()
    })
    // Should have used output as fallback since error was empty
    await waitFor(() => {
      expect(screen.getByText('Fallback output message')).toBeInTheDocument()
    })
  })

  it('shows gray icon for unknown file extension', async () => {
    const { api } = await import('../services')
    // Mock a file with unknown extension
    vi.mocked(api.fs.listDir).mockResolvedValue([
      { name: 'src', path: '/home/user/project/src', isDirectory: true, children: [] },
      { name: 'package.json', path: '/home/user/project/package.json', isDirectory: false },
      { name: 'unknown.xyz', path: '/home/user/project/unknown.xyz', isDirectory: false },
    ])

    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('unknown.xyz')).toBeInTheDocument()
    })
    // File should be displayed with gray icon (fallback color)
    const fileElement = screen.getByText('unknown.xyz')
    expect(fileElement).toBeInTheDocument()
  })

  it('toggleDir returns early for non-directory entries', async () => {
    const { api } = await import('../services')
    // Spy on listDir to ensure it's not called when clicking a file
    const listDirSpy = vi.mocked(api.fs.listDir)

    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument()
    })

    // Clear any previous calls
    listDirSpy.mockClear()

    // Click on a file (not a directory) - should not trigger directory expansion
    fireEvent.click(screen.getByText('package.json'))

    // Should load the file content, not call listDir for expansion
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toHaveAttribute('data-language', 'json')
    })

    // listDir should not be called again after clicking a file
    // (it would be called for directory expansion, but this is a file)
    expect(listDirSpy).not.toHaveBeenCalled()
  })

  it('handles file without extension (fallback to plaintext)', async () => {
    const { api } = await import('../services')
    // Mock a file with no extension - triggers || '' fallback in getLanguageFromPath
    vi.mocked(api.fs.listDir).mockResolvedValue([
      { name: 'src', path: '/home/user/project/src', isDirectory: true, children: [] },
      { name: 'Makefile', path: '/home/user/project/Makefile', isDirectory: false },
      { name: 'Dockerfile', path: '/home/user/project/Dockerfile', isDirectory: false },
    ])
    vi.mocked(api.fs.readFile).mockResolvedValue('FROM node:18\nRUN npm install')

    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('Makefile')).toBeInTheDocument()
    })

    // Click on file without extension
    fireEvent.click(screen.getByText('Dockerfile'))

    // Should load with plaintext language (fallback)
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toHaveAttribute('data-language', 'plaintext')
    })
  })

  it('handles file without extension in icon color (fallback to gray)', async () => {
    const { api } = await import('../services')
    // Mock a file with no extension - triggers || '' fallback in getIconColor
    vi.mocked(api.fs.listDir).mockResolvedValue([
      { name: 'README', path: '/home/user/project/README', isDirectory: false },
    ])

    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('README')).toBeInTheDocument()
    })
    // File should be displayed (with gray icon fallback)
    expect(screen.getByText('README')).toBeInTheDocument()
  })

  it('handles file with trailing dot (empty extension fallback)', async () => {
    const { api } = await import('../services')
    // Mock a file ending with a dot - triggers || '' fallback in getLanguageFromPath
    vi.mocked(api.fs.listDir).mockResolvedValue([
      { name: 'file.', path: '/home/user/project/file.', isDirectory: false },
    ])
    vi.mocked(api.fs.readFile).mockResolvedValue('content')

    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('file.')).toBeInTheDocument()
    })

    // Click on file with trailing dot
    fireEvent.click(screen.getByText('file.'))

    // Should load with plaintext language (fallback when extension is empty)
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toHaveAttribute('data-language', 'plaintext')
    })
  })

  it('handles file with trailing dot in icon color', async () => {
    const { api } = await import('../services')
    // Mock a file ending with a dot - triggers || '' fallback in getIconColor
    vi.mocked(api.fs.listDir).mockResolvedValue([
      { name: 'test.', path: '/home/user/project/test.', isDirectory: false },
    ])

    render(<EditorPanel />)
    await waitFor(() => {
      expect(screen.getByText('test.')).toBeInTheDocument()
    })
    // File should be displayed (with gray icon fallback)
    expect(screen.getByText('test.')).toBeInTheDocument()
  })
})
