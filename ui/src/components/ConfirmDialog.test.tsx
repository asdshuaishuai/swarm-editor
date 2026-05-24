import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmDialog } from './ConfirmDialog'

vi.mock('lucide-react', () => ({
  AlertTriangle: () => <svg data-testid="alert-icon" />,
}))

describe('ConfirmDialog', () => {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it('renders title and message', () => {
    render(<ConfirmDialog title="Delete file?" message="This cannot be undone." onConfirm={onConfirm} onCancel={onCancel} />)
    expect(screen.getByText('Delete file?')).toBeInTheDocument()
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument()
  })

  it('renders default button labels', () => {
    render(<ConfirmDialog title="Test" message="msg" onConfirm={onConfirm} onCancel={onCancel} />)
    expect(screen.getByText('Confirm')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('renders custom button labels', () => {
    render(<ConfirmDialog title="Test" message="msg" confirmLabel="Delete" cancelLabel="Keep" onConfirm={onConfirm} onCancel={onCancel} />)
    expect(screen.getByText('Delete')).toBeInTheDocument()
    expect(screen.getByText('Keep')).toBeInTheDocument()
  })

  it('calls onConfirm when confirm clicked', () => {
    render(<ConfirmDialog title="Test" message="msg" onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('Confirm'))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('calls onCancel when cancel clicked', () => {
    render(<ConfirmDialog title="Test" message="msg" onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalled()
  })

  it('has alertdialog role', () => {
    render(<ConfirmDialog title="Test" message="msg" onConfirm={onConfirm} onCancel={onCancel} />)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('sets aria-label to title', () => {
    render(<ConfirmDialog title="My Dialog" message="msg" onConfirm={onConfirm} onCancel={onCancel} />)
    expect(screen.getByRole('alertdialog').getAttribute('aria-label')).toBe('My Dialog')
  })
})
