import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DirtyCloseDialog } from './DirtyCloseDialog'

vi.mock('lucide-react', () => ({
  AlertTriangle: () => <svg data-testid="alert-icon" />,
}))

const defaults = {
  dirtyClosePath: 'src/App.tsx' as string | null,
  openFiles: ['src/App.tsx', 'src/utils.ts'],
  dirtyFiles: new Set(['src/App.tsx']),
  onCancel: vi.fn(),
  onCloseWithoutSaving: vi.fn(),
  onCloseAllWithoutSaving: vi.fn(),
  onSaveAndClose: vi.fn().mockResolvedValue(undefined),
  onSaveAllAndClose: vi.fn().mockResolvedValue(undefined),
}

describe('DirtyCloseDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders nothing when dirtyClosePath is null', () => {
    render(<DirtyCloseDialog {...defaults} dirtyClosePath={null} />)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('shows save dialog for single file', () => {
    render(<DirtyCloseDialog {...defaults} />)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('Save changes?')).toBeInTheDocument()
    expect(screen.getByText('App.tsx')).toBeInTheDocument()
  })

  it('shows dirty count for close-all mode', () => {
    render(<DirtyCloseDialog {...defaults} dirtyClosePath="__close_all__" />)
    expect(screen.getByText(/unsaved changes in 1 file/)).toBeInTheDocument()
  })

  it('calls onCancel when Cancel clicked', () => {
    render(<DirtyCloseDialog {...defaults} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(defaults.onCancel).toHaveBeenCalled()
  })

  it('calls onCloseWithoutSaving when Dont Save clicked', () => {
    render(<DirtyCloseDialog {...defaults} />)
    fireEvent.click(screen.getByText("Don't Save"))
    expect(defaults.onCloseWithoutSaving).toHaveBeenCalledWith('src/App.tsx')
  })

  it('calls onSaveAndClose when Save clicked', () => {
    render(<DirtyCloseDialog {...defaults} />)
    fireEvent.click(screen.getByText('Save'))
    expect(defaults.onSaveAndClose).toHaveBeenCalledWith('src/App.tsx')
  })

  it('calls onCloseAllWithoutSaving in close-all mode', () => {
    render(<DirtyCloseDialog {...defaults} dirtyClosePath="__close_all__" />)
    fireEvent.click(screen.getByText("Don't Save"))
    expect(defaults.onCloseAllWithoutSaving).toHaveBeenCalled()
  })

  it('calls onSaveAllAndClose in close-all mode', () => {
    render(<DirtyCloseDialog {...defaults} dirtyClosePath="__close_all__" />)
    fireEvent.click(screen.getByText('Save All'))
    expect(defaults.onSaveAllAndClose).toHaveBeenCalled()
  })

  it('shows Save button for single file', () => {
    render(<DirtyCloseDialog {...defaults} />)
    expect(screen.getByText('Save')).toBeInTheDocument()
  })

  it('shows Save All button for close-all', () => {
    render(<DirtyCloseDialog {...defaults} dirtyClosePath="__close_all__" />)
    expect(screen.getByText('Save All')).toBeInTheDocument()
  })
})
