import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EditorToolbar } from './EditorToolbar'

vi.mock('lucide-react', () => ({
  PanelLeft: () => <svg data-testid="panel-icon" />,
  Columns2: () => <svg data-testid="cols-icon" />,
  Wand2: () => <svg data-testid="wand-icon" />,
  Save: () => <svg data-testid="save-icon" />,
  Play: () => <svg data-testid="play-icon" />,
  MoreHorizontal: () => <svg data-testid="more-icon" />,
  Map: () => <svg data-testid="map-icon" />,
  WrapText: () => <svg data-testid="wrap-icon" />,
}))

const defaults = {
  showFileTree: true,
  onToggleFileTree: vi.fn(),
  currentFile: 'src/App.tsx' as string | null,
  workspace: '/home/user/project',
  language: 'typescript',
  onLanguageChange: vi.fn(),
  loading: false,
  splitDirection: 'none',
  onToggleSplit: vi.fn(),
  onFormat: vi.fn(),
  onSave: vi.fn(),
  onRun: vi.fn(),
  settings: { minimap: true, wordWrap: false },
  updateSetting: vi.fn(),
}

describe('EditorToolbar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows current filename', () => {
    render(<EditorToolbar {...defaults} />)
    expect(screen.getByText('App.tsx')).toBeInTheDocument()
  })

  it('shows workspace name when no file open', () => {
    render(<EditorToolbar {...defaults} currentFile={null} />)
    expect(screen.getByText('project')).toBeInTheDocument()
  })

  it('calls onToggleFileTree when toggle button clicked', () => {
    render(<EditorToolbar {...defaults} />)
    fireEvent.click(screen.getByLabelText('Toggle file tree'))
    expect(defaults.onToggleFileTree).toHaveBeenCalled()
  })

  it('sets aria-expanded on toggle button', () => {
    render(<EditorToolbar {...defaults} showFileTree={true} />)
    expect(screen.getByLabelText('Toggle file tree').getAttribute('aria-expanded')).toBe('true')
  })

  it('calls onSave when Save clicked', () => {
    render(<EditorToolbar {...defaults} />)
    fireEvent.click(screen.getByText('Save'))
    expect(defaults.onSave).toHaveBeenCalled()
  })

  it('calls onRun when Run clicked', () => {
    render(<EditorToolbar {...defaults} />)
    fireEvent.click(screen.getByText('Run'))
    expect(defaults.onRun).toHaveBeenCalled()
  })

  it('calls onToggleSplit when split clicked', () => {
    render(<EditorToolbar {...defaults} />)
    fireEvent.click(screen.getByTitle('Split Editor (Ctrl+\\\\)'))
    expect(defaults.onToggleSplit).toHaveBeenCalled()
  })

  it('calls onFormat when format clicked', () => {
    render(<EditorToolbar {...defaults} />)
    fireEvent.click(screen.getByTitle('Format Document (Shift+Alt+F)'))
    expect(defaults.onFormat).toHaveBeenCalled()
  })

  it('calls onLanguageChange when language select changes', () => {
    render(<EditorToolbar {...defaults} />)
    fireEvent.change(screen.getByDisplayValue('TypeScript'), { target: { value: 'go' } })
    expect(defaults.onLanguageChange).toHaveBeenCalledWith('go')
  })

  it('disables buttons when no file is open', () => {
    render(<EditorToolbar {...defaults} currentFile={null} />)
    expect(screen.getByText('Save').closest('button')?.disabled).toBe(true)
    expect(screen.getByText('Run').closest('button')?.disabled).toBe(true)
  })

  it('disables buttons when loading', () => {
    render(<EditorToolbar {...defaults} loading={true} />)
    expect(screen.getByText('Save').closest('button')?.disabled).toBe(true)
  })

  it('shows more actions menu on click', () => {
    render(<EditorToolbar {...defaults} />)
    fireEvent.click(screen.getByLabelText('More actions'))
    expect(screen.getByText('Minimap')).toBeInTheDocument()
    expect(screen.getByText('Word Wrap')).toBeInTheDocument()
  })

  it('shows minimap on/off state', () => {
    render(<EditorToolbar {...defaults} settings={{ minimap: true, wordWrap: false }} />)
    fireEvent.click(screen.getByLabelText('More actions'))
    expect(screen.getByText('On')).toBeInTheDocument()
  })

  it('calls updateSetting when minimap toggled', () => {
    render(<EditorToolbar {...defaults} />)
    fireEvent.click(screen.getByLabelText('More actions'))
    fireEvent.click(screen.getByText('Minimap'))
    expect(defaults.updateSetting).toHaveBeenCalledWith('minimap', false)
  })

  it('calls updateSetting when word wrap toggled', () => {
    render(<EditorToolbar {...defaults} />)
    fireEvent.click(screen.getByLabelText('More actions'))
    fireEvent.click(screen.getByText('Word Wrap'))
    expect(defaults.updateSetting).toHaveBeenCalledWith('wordWrap', true)
  })

  it('renders language select with multiple options', () => {
    render(<EditorToolbar {...defaults} />)
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
    expect(screen.getByText('Python')).toBeInTheDocument()
    expect(screen.getByText('Go')).toBeInTheDocument()
  })
})
