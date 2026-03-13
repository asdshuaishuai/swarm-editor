import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import EditorPanel from './EditorPanel'

// Mock Monaco Editor
vi.mock('@monaco-editor/react', () => ({
  default: ({ language, value, onChange }: {
    language: string
    value: string
    onChange: (value: string | undefined) => void
  }) => (
    <textarea
      data-testid="monaco-editor"
      data-language={language}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}))

// Mock the store
vi.mock('../store/appStore', () => ({
  useAppStore: vi.fn(() => ({
    agents: [],
    selectedAgent: null,
  })),
}))

describe('EditorPanel', () => {
  it('renders toolbar with language selector', () => {
    render(<EditorPanel />)
    expect(screen.getByRole('option', { name: 'TypeScript' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'JavaScript' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Python' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Go' })).toBeInTheDocument()
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
    expect(screen.getByText('EXPLORER')).toBeInTheDocument()
  })

  it('shows file tree items', () => {
    render(<EditorPanel />)
    expect(screen.getByText('src')).toBeInTheDocument()
    expect(screen.getByText('main.ts')).toBeInTheDocument()
    expect(screen.getByText('utils.ts')).toBeInTheDocument()
    expect(screen.getByText('package.json')).toBeInTheDocument()
    expect(screen.getByText('README.md')).toBeInTheDocument()
  })

  it('toggles file tree visibility', () => {
    render(<EditorPanel />)
    const toggleButton = screen.getByTitle('Toggle File Tree')
    fireEvent.click(toggleButton)
    expect(screen.queryByText('EXPLORER')).not.toBeInTheDocument()
    // Click again to show
    fireEvent.click(toggleButton)
    expect(screen.getByText('EXPLORER')).toBeInTheDocument()
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

  it('sets correct language on editor', () => {
    render(<EditorPanel />)
    const editor = screen.getByTestId('monaco-editor')
    expect(editor).toHaveAttribute('data-language', 'typescript')
  })
})

describe('FileTreeNode', () => {
  it('renders folder with correct styling', () => {
    render(<EditorPanel />)
    const srcFolder = screen.getByText('src').closest('div')
    expect(srcFolder).toHaveClass('cursor-pointer')
  })

  it('renders active file with accent styling', () => {
    render(<EditorPanel />)
    const mainFile = screen.getByText('main.ts').closest('div')
    expect(mainFile).toHaveClass('bg-accent/20')
  })
})