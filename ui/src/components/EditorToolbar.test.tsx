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

  // ---------------------------------------------------------------
  // More actions menu — close behavior
  // ---------------------------------------------------------------
  describe('more actions menu close behavior', () => {
    it('closes more actions menu on Escape key', () => {
      render(<EditorToolbar {...defaults} />)
      fireEvent.click(screen.getByLabelText('More actions'))
      expect(screen.getByText('Minimap')).toBeInTheDocument()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByText('Minimap')).not.toBeInTheDocument()
    })

    it('closes more actions menu on outside click', () => {
      render(<EditorToolbar {...defaults} />)
      fireEvent.click(screen.getByLabelText('More actions'))
      expect(screen.getByText('Minimap')).toBeInTheDocument()
      fireEvent.mouseDown(document.body)
      expect(screen.queryByText('Minimap')).not.toBeInTheDocument()
    })

    it('toggles more actions menu open and closed', () => {
      render(<EditorToolbar {...defaults} />)
      // Open
      fireEvent.click(screen.getByLabelText('More actions'))
      expect(screen.getByText('Minimap')).toBeInTheDocument()
      // Close by clicking button again
      fireEvent.click(screen.getByLabelText('More actions'))
      expect(screen.queryByText('Minimap')).not.toBeInTheDocument()
    })

    it('closes menu after clicking minimap toggle', () => {
      render(<EditorToolbar {...defaults} />)
      fireEvent.click(screen.getByLabelText('More actions'))
      fireEvent.click(screen.getByText('Minimap'))
      expect(defaults.updateSetting).toHaveBeenCalledWith('minimap', false)
      // Menu should be closed
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('closes menu after clicking word wrap toggle', () => {
      render(<EditorToolbar {...defaults} />)
      fireEvent.click(screen.getByLabelText('More actions'))
      fireEvent.click(screen.getByText('Word Wrap'))
      expect(defaults.updateSetting).toHaveBeenCalledWith('wordWrap', true)
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('removes event listeners when menu closes', () => {
      const addSpy = vi.spyOn(document, 'addEventListener')
      const removeSpy = vi.spyOn(document, 'removeEventListener')
      const { rerender } = render(<EditorToolbar {...defaults} />)
      // Open menu
      fireEvent.click(screen.getByLabelText('More actions'))
      expect(addSpy).toHaveBeenCalledWith('mousedown', expect.any(Function))
      expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
      // Close menu
      fireEvent.keyDown(document, { key: 'Escape' })
      // Rerender to trigger cleanup
      rerender(<EditorToolbar {...defaults} />)
      expect(removeSpy).toHaveBeenCalledWith('mousedown', expect.any(Function))
      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
      addSpy.mockRestore()
      removeSpy.mockRestore()
    })
  })

  // ---------------------------------------------------------------
  // Minimap and word wrap state display
  // ---------------------------------------------------------------
  describe('minimap and word wrap display', () => {
    it('shows On for minimap when enabled', () => {
      render(<EditorToolbar {...defaults} settings={{ minimap: true, wordWrap: false }} />)
      fireEvent.click(screen.getByLabelText('More actions'))
      // Minimap is On, Word Wrap is Off
      const onLabels = screen.getAllByText('On')
      expect(onLabels.length).toBe(1)
    })

    it('shows Off for minimap when disabled', () => {
      render(<EditorToolbar {...defaults} settings={{ minimap: false, wordWrap: false }} />)
      fireEvent.click(screen.getByLabelText('More actions'))
      const offLabels = screen.getAllByText('Off')
      expect(offLabels.length).toBe(2)
    })

    it('shows On for word wrap when enabled', () => {
      render(<EditorToolbar {...defaults} settings={{ minimap: false, wordWrap: true }} />)
      fireEvent.click(screen.getByLabelText('More actions'))
      const onLabels = screen.getAllByText('On')
      expect(onLabels.length).toBe(1)
    })

    it('toggles minimap from false to true', () => {
      render(<EditorToolbar {...defaults} settings={{ minimap: false, wordWrap: false }} />)
      fireEvent.click(screen.getByLabelText('More actions'))
      fireEvent.click(screen.getByText('Minimap'))
      expect(defaults.updateSetting).toHaveBeenCalledWith('minimap', true)
    })

    it('toggles word wrap from true to false', () => {
      render(<EditorToolbar {...defaults} settings={{ minimap: false, wordWrap: true }} />)
      fireEvent.click(screen.getByLabelText('More actions'))
      fireEvent.click(screen.getByText('Word Wrap'))
      expect(defaults.updateSetting).toHaveBeenCalledWith('wordWrap', false)
    })
  })

  // ---------------------------------------------------------------
  // Split direction styling
  // ---------------------------------------------------------------
  describe('split direction styling', () => {
    it('applies accent styles when split is active', () => {
      render(<EditorToolbar {...defaults} splitDirection="horizontal" />)
      const splitBtn = screen.getByTitle('Split Editor (Ctrl+\\\\)')
      expect(splitBtn.className).toContain('bg-accent')
    })

    it('does not apply accent styles when split is none', () => {
      render(<EditorToolbar {...defaults} splitDirection="none" />)
      const splitBtn = screen.getByTitle('Split Editor (Ctrl+\\\\)')
      expect(splitBtn.className).not.toContain('bg-accent')
    })
  })

  // ---------------------------------------------------------------
  // Button disabled states
  // ---------------------------------------------------------------
  describe('button disabled states', () => {
    it('disables format button when no file is open', () => {
      render(<EditorToolbar {...defaults} currentFile={null} />)
      expect(screen.getByTitle('Format Document (Shift+Alt+F)').closest('button')?.disabled).toBe(true)
    })

    it('disables split button when no file is open', () => {
      render(<EditorToolbar {...defaults} currentFile={null} />)
      expect(screen.getByTitle('Split Editor (Ctrl+\\\\)').closest('button')?.disabled).toBe(true)
    })

    it('disables format button when loading', () => {
      render(<EditorToolbar {...defaults} loading={true} />)
      expect(screen.getByTitle('Format Document (Shift+Alt+F)').closest('button')?.disabled).toBe(true)
    })

    it('disables split button when loading', () => {
      render(<EditorToolbar {...defaults} loading={true} />)
      expect(screen.getByTitle('Split Editor (Ctrl+\\\\)').closest('button')?.disabled).toBe(true)
    })

    it('enables all action buttons when file is open and not loading', () => {
      render(<EditorToolbar {...defaults} currentFile="test.ts" loading={false} />)
      expect(screen.getByTitle('Split Editor (Ctrl+\\\\)').closest('button')?.disabled).toBe(false)
      expect(screen.getByTitle('Format Document (Shift+Alt+F)').closest('button')?.disabled).toBe(false)
      expect(screen.getByText('Save').closest('button')?.disabled).toBe(false)
      expect(screen.getByText('Run').closest('button')?.disabled).toBe(false)
    })
  })

  // ---------------------------------------------------------------
  // Language select options
  // ---------------------------------------------------------------
  describe('language select', () => {
    it('renders all language options', () => {
      render(<EditorToolbar {...defaults} />)
      const select = screen.getByDisplayValue('TypeScript')
      expect(select).toBeInTheDocument()
      const options = select.querySelectorAll('option')
      expect(options.length).toBe(20)
    })

    it('displays current language value', () => {
      render(<EditorToolbar {...defaults} language="python" />)
      expect(screen.getByDisplayValue('Python')).toBeInTheDocument()
    })

    it('calls onLanguageChange with javascriptreact', () => {
      render(<EditorToolbar {...defaults} />)
      fireEvent.change(screen.getByDisplayValue('TypeScript'), { target: { value: 'javascriptreact' } })
      expect(defaults.onLanguageChange).toHaveBeenCalledWith('javascriptreact')
    })

    it('calls onLanguageChange with rust', () => {
      render(<EditorToolbar {...defaults} />)
      fireEvent.change(screen.getByDisplayValue('TypeScript'), { target: { value: 'rust' } })
      expect(defaults.onLanguageChange).toHaveBeenCalledWith('rust')
    })

    it('calls onLanguageChange with sql', () => {
      render(<EditorToolbar {...defaults} />)
      fireEvent.change(screen.getByDisplayValue('TypeScript'), { target: { value: 'sql' } })
      expect(defaults.onLanguageChange).toHaveBeenCalledWith('sql')
    })

    it('calls onLanguageChange with plaintext', () => {
      render(<EditorToolbar {...defaults} />)
      fireEvent.change(screen.getByDisplayValue('TypeScript'), { target: { value: 'plaintext' } })
      expect(defaults.onLanguageChange).toHaveBeenCalledWith('plaintext')
    })
  })

  // ---------------------------------------------------------------
  // Filename display edge cases
  // ---------------------------------------------------------------
  describe('filename display', () => {
    it('shows just filename for deeply nested path', () => {
      render(<EditorToolbar {...defaults} currentFile="src/components/panels/DeepPanel.tsx" />)
      expect(screen.getByText('DeepPanel.tsx')).toBeInTheDocument()
    })

    it('shows workspace name ending with slash', () => {
      render(<EditorToolbar {...defaults} currentFile={null} workspace="/home/user/my-app" />)
      expect(screen.getByText('my-app')).toBeInTheDocument()
    })

    it('shows bare filename without path', () => {
      render(<EditorToolbar {...defaults} currentFile="README.md" />)
      expect(screen.getByText('README.md')).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------
  // ARIA attributes
  // ---------------------------------------------------------------
  describe('ARIA attributes', () => {
    it('has aria-expanded=false on file tree toggle when collapsed', () => {
      render(<EditorToolbar {...defaults} showFileTree={false} />)
      expect(screen.getByLabelText('Toggle file tree').getAttribute('aria-expanded')).toBe('false')
    })

    it('more actions button has aria-haspopup=menu', () => {
      render(<EditorToolbar {...defaults} />)
      expect(screen.getByLabelText('More actions').getAttribute('aria-haspopup')).toBe('menu')
    })

    it('more actions button has aria-expanded when open', () => {
      render(<EditorToolbar {...defaults} />)
      fireEvent.click(screen.getByLabelText('More actions'))
      expect(screen.getByLabelText('More actions').getAttribute('aria-expanded')).toBe('true')
    })

    it('more actions button has aria-expanded false when closed', () => {
      render(<EditorToolbar {...defaults} />)
      expect(screen.getByLabelText('More actions').getAttribute('aria-expanded')).toBe('false')
    })

    it('menu items have role=menuitem', () => {
      render(<EditorToolbar {...defaults} />)
      fireEvent.click(screen.getByLabelText('More actions'))
      const items = screen.getAllByRole('menuitem')
      expect(items.length).toBe(2)
    })

    it('menu has role=menu', () => {
      render(<EditorToolbar {...defaults} />)
      fireEvent.click(screen.getByLabelText('More actions'))
      expect(screen.getByRole('menu')).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------
  // Outside click not on menu
  // ---------------------------------------------------------------
  describe('outside click handling', () => {
    it('does not close menu when clicking inside the menu', () => {
      render(<EditorToolbar {...defaults} />)
      fireEvent.click(screen.getByLabelText('More actions'))
      const menu = screen.getByRole('menu')
      // Clicking inside the menu should not close it
      fireEvent.mouseDown(menu)
      expect(screen.getByRole('menu')).toBeInTheDocument()
    })
  })
})
