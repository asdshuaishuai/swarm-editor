import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmDialog } from './ConfirmDialog'

vi.mock('lucide-react', () => ({
  AlertTriangle: ({ className }: { className?: string }) => <svg data-testid="alert-icon" className={className} />,
}))

describe('ConfirmDialog', () => {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  // -----------------------------------------------------------------------
  // Basic rendering
  // -----------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // Variant styling
  // -----------------------------------------------------------------------

  describe('variant styling', () => {
    it('applies danger variant classes by default', () => {
      render(<ConfirmDialog title="Test" message="msg" onConfirm={onConfirm} onCancel={onCancel} />)
      const alertIcon = screen.getByTestId('alert-icon')
      const iconWrapper = alertIcon.parentElement
      expect(iconWrapper?.className).toContain('bg-error/20')
      expect(alertIcon.getAttribute('class')).toContain('text-error')

      const confirmBtn = screen.getByText('Confirm')
      expect(confirmBtn.className).toContain('bg-error/80')
      expect(confirmBtn.className).toContain('hover:bg-error')
    })

    it('applies warning variant classes when variant="warning"', () => {
      render(<ConfirmDialog title="Test" message="msg" variant="warning" onConfirm={onConfirm} onCancel={onCancel} />)
      const alertIcon = screen.getByTestId('alert-icon')
      const iconWrapper = alertIcon.parentElement
      expect(iconWrapper?.className).toContain('bg-warning/20')
      expect(alertIcon.getAttribute('class')).toContain('text-warning')

      const confirmBtn = screen.getByText('Confirm')
      expect(confirmBtn.className).toContain('bg-warning/80')
      expect(confirmBtn.className).toContain('hover:bg-warning')
    })
  })

  // -----------------------------------------------------------------------
  // Escape key
  // -----------------------------------------------------------------------

  describe('keyboard interaction', () => {
    it('calls onCancel when Escape key is pressed', () => {
      render(<ConfirmDialog title="Test" message="msg" onConfirm={onConfirm} onCancel={onCancel} />)
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(onCancel).toHaveBeenCalledTimes(1)
    })

    it('does not call onCancel for other key presses', () => {
      render(<ConfirmDialog title="Test" message="msg" onConfirm={onConfirm} onCancel={onCancel} />)
      fireEvent.keyDown(window, { key: 'Enter' })
      fireEvent.keyDown(window, { key: 'Tab' })
      expect(onCancel).not.toHaveBeenCalled()
    })

    it('removes keydown listener on unmount', () => {
      const { unmount } = render(
        <ConfirmDialog title="Test" message="msg" onConfirm={onConfirm} onCancel={onCancel} />,
      )
      unmount()
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(onCancel).not.toHaveBeenCalled()
    })

    it('updates escape handler when onCancel changes', () => {
      const newOnCancel = vi.fn()
      const { rerender } = render(
        <ConfirmDialog title="Test" message="msg" onConfirm={onConfirm} onCancel={onCancel} />,
      )
      rerender(<ConfirmDialog title="Test" message="msg" onConfirm={onConfirm} onCancel={newOnCancel} />)
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(newOnCancel).toHaveBeenCalledTimes(1)
      expect(onCancel).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // Auto-focus
  // -----------------------------------------------------------------------

  describe('auto-focus', () => {
    it('auto-focuses the cancel button on mount', () => {
      render(<ConfirmDialog title="Test" message="msg" onConfirm={onConfirm} onCancel={onCancel} />)
      const cancelBtn = screen.getByText('Cancel')
      expect(document.activeElement).toBe(cancelBtn)
    })
  })

  // -----------------------------------------------------------------------
  // Overlay & layout
  // -----------------------------------------------------------------------

  describe('overlay & layout', () => {
    it('renders a fixed overlay with presentation role', () => {
      render(<ConfirmDialog title="Test" message="msg" onConfirm={onConfirm} onCancel={onCancel} />)
      const overlay = screen.getByRole('presentation')
      expect(overlay).toBeInTheDocument()
      expect(overlay.className).toContain('fixed')
    })

    it('has aria-modal="true" on the dialog', () => {
      render(<ConfirmDialog title="Test" message="msg" onConfirm={onConfirm} onCancel={onCancel} />)
      const dialog = screen.getByRole('alertdialog')
      expect(dialog.getAttribute('aria-modal')).toBe('true')
    })
  })

  // -----------------------------------------------------------------------
  // Re-render behavior
  // -----------------------------------------------------------------------

  describe('re-render behavior', () => {
    it('updates title and message on rerender', () => {
      const { rerender } = render(
        <ConfirmDialog title="First" message="First message" onConfirm={onConfirm} onCancel={onCancel} />,
      )
      expect(screen.getByText('First')).toBeInTheDocument()
      expect(screen.getByText('First message')).toBeInTheDocument()

      rerender(
        <ConfirmDialog title="Second" message="Second message" onConfirm={onConfirm} onCancel={onCancel} />,
      )
      expect(screen.getByText('Second')).toBeInTheDocument()
      expect(screen.getByText('Second message')).toBeInTheDocument()
      expect(screen.queryByText('First')).not.toBeInTheDocument()
    })

    it('updates button labels on rerender', () => {
      const { rerender } = render(
        <ConfirmDialog title="Test" message="msg" confirmLabel="Yes" cancelLabel="No" onConfirm={onConfirm} onCancel={onCancel} />,
      )
      expect(screen.getByText('Yes')).toBeInTheDocument()
      expect(screen.getByText('No')).toBeInTheDocument()

      rerender(
        <ConfirmDialog title="Test" message="msg" confirmLabel="OK" cancelLabel="Dismiss" onConfirm={onConfirm} onCancel={onCancel} />,
      )
      expect(screen.getByText('OK')).toBeInTheDocument()
      expect(screen.getByText('Dismiss')).toBeInTheDocument()
    })
  })
})
