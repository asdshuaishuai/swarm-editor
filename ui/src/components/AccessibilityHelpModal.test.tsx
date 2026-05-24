import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AccessibilityHelpModal } from './AccessibilityHelpModal'

describe('AccessibilityHelpModal', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the modal with Accessibility Help title', () => {
    render(<AccessibilityHelpModal onClose={onClose} />)
    expect(screen.getByText('Accessibility Help')).toBeInTheDocument()
  })

  it('has role="dialog" and aria-modal="true"', () => {
    render(<AccessibilityHelpModal onClose={onClose} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'Accessibility Help')
  })

  it('renders all keyboard shortcut sections', () => {
    render(<AccessibilityHelpModal onClose={onClose} />)
    expect(screen.getByText('Navigation')).toBeInTheDocument()
    expect(screen.getByText('Editor')).toBeInTheDocument()
    expect(screen.getByText('Multi-Cursor')).toBeInTheDocument()
    expect(screen.getByText('Accessibility')).toBeInTheDocument()
  })

  it('calls onClose when clicking the close button', () => {
    render(<AccessibilityHelpModal onClose={onClose} />)
    const closeBtn = screen.getByLabelText('Close')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when clicking the backdrop overlay', () => {
    render(<AccessibilityHelpModal onClose={onClose} />)
    // The outer div (backdrop) has onClick={onClose}
    const backdrop = screen.getByRole('dialog').parentElement!
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when clicking inside the dialog content', () => {
    render(<AccessibilityHelpModal onClose={onClose} />)
    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when pressing Escape', () => {
    render(<AccessibilityHelpModal onClose={onClose} />)
    const backdrop = screen.getByRole('dialog').parentElement!
    fireEvent.keyDown(backdrop, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('displays expected keyboard shortcuts', () => {
    render(<AccessibilityHelpModal onClose={onClose} />)
    expect(screen.getByText('Go to File')).toBeInTheDocument()
    expect(screen.getByText('Command Palette')).toBeInTheDocument()
    expect(screen.getByText('Toggle Sidebar')).toBeInTheDocument()
    expect(screen.getByText('Find')).toBeInTheDocument()
  })
})
