import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ToastContainer, type Toast } from './Toast'

// Mock the utils module
vi.mock('../utils', () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(' '),
}))

describe('ToastContainer', () => {
  const mockOnDismiss = vi.fn()
  const defaultToast: Toast = {
    id: 'test-toast',
    type: 'success',
    title: 'Test Toast',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders null when no toasts', () => {
    const { container } = render(<ToastContainer toasts={[]} onDismiss={mockOnDismiss} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders null when toasts is undefined', () => {
    const { container } = render(<ToastContainer toasts={undefined as unknown as Toast[]} onDismiss={mockOnDismiss} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders toast with title', () => {
    render(<ToastContainer toasts={[defaultToast]} onDismiss={mockOnDismiss} />)
    expect(screen.getByText('Test Toast')).toBeInTheDocument()
  })

  it('renders toast with message when provided', () => {
    const toast: Toast = { ...defaultToast, message: 'Test message' }
    render(<ToastContainer toasts={[toast]} onDismiss={mockOnDismiss} />)
    expect(screen.getByText('Test message')).toBeInTheDocument()
  })

  it('renders toast without message when not provided', () => {
    render(<ToastContainer toasts={[defaultToast]} onDismiss={mockOnDismiss} />)
    expect(screen.getByText('Test Toast')).toBeInTheDocument()
    expect(screen.queryByText('Test message')).not.toBeInTheDocument()
  })

  it('renders all toasts', () => {
    const toasts: Toast[] = [
      { id: 'toast-1', type: 'success', title: 'Success Toast' },
      { id: 'toast-2', type: 'error', title: 'Error Toast' },
    ]
    render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />)
    expect(screen.getByText('Success Toast')).toBeInTheDocument()
    expect(screen.getByText('Error Toast')).toBeInTheDocument()
  })

  it('renders with default position (bottom-right)', () => {
    render(<ToastContainer toasts={[defaultToast]} onDismiss={mockOnDismiss} />)
    const container = screen.getByLabelText('Notifications')
    expect(container.className).toContain('bottom-12')
    expect(container.className).toContain('right-4')
  })

  it('renders with top-right position', () => {
    render(<ToastContainer toasts={[defaultToast]} onDismiss={mockOnDismiss} position="top-right" />)
    const container = screen.getByLabelText('Notifications')
    expect(container.className).toContain('top-4')
    expect(container.className).toContain('right-4')
  })

  it('renders with top-left position', () => {
    render(<ToastContainer toasts={[defaultToast]} onDismiss={mockOnDismiss} position="top-left" />)
    const container = screen.getByLabelText('Notifications')
    expect(container.className).toContain('top-4')
    expect(container.className).toContain('left-4')
  })

  it('renders with bottom-left position', () => {
    render(<ToastContainer toasts={[defaultToast]} onDismiss={mockOnDismiss} position="bottom-left" />)
    const container = screen.getByLabelText('Notifications')
    expect(container.className).toContain('bottom-12')
    expect(container.className).toContain('left-4')
  })

  it('has correct aria attributes', () => {
    render(<ToastContainer toasts={[defaultToast]} onDismiss={mockOnDismiss} />)
    const container = screen.getByLabelText('Notifications')
    expect(container).toHaveAttribute('aria-live', 'polite')
  })

  it('renders with role alert', () => {
    render(<ToastContainer toasts={[defaultToast]} onDismiss={mockOnDismiss} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('calls onDismiss when dismiss button is clicked', () => {
    render(<ToastContainer toasts={[defaultToast]} onDismiss={mockOnDismiss} />)
    const dismissBtn = screen.getByLabelText('Dismiss')
    fireEvent.click(dismissBtn)
    expect(mockOnDismiss).toHaveBeenCalledWith('test-toast')
  })

  it('auto-dismisses after default duration (5000ms)', async () => {
    render(<ToastContainer toasts={[defaultToast]} onDismiss={mockOnDismiss} />)
    expect(mockOnDismiss).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(5000)
    expect(mockOnDismiss).toHaveBeenCalledWith('test-toast')
  })

  it('auto-dismisses after custom duration', async () => {
    const toast: Toast = { ...defaultToast, duration: 3000 }
    render(<ToastContainer toasts={[toast]} onDismiss={mockOnDismiss} />)

    await vi.advanceTimersByTimeAsync(3000)
    expect(mockOnDismiss).toHaveBeenCalledWith('test-toast')
  })

  it('does not auto-dismiss when persistent', async () => {
    const toast: Toast = { ...defaultToast, persistent: true }
    render(<ToastContainer toasts={[toast]} onDismiss={mockOnDismiss} />)

    await vi.advanceTimersByTimeAsync(10000)
    expect(mockOnDismiss).not.toHaveBeenCalled()
  })

  it('does not auto-dismiss when duration is 0', async () => {
    const toast: Toast = { ...defaultToast, duration: 0 }
    render(<ToastContainer toasts={[toast]} onDismiss={mockOnDismiss} />)

    await vi.advanceTimersByTimeAsync(10000)
    expect(mockOnDismiss).not.toHaveBeenCalled()
  })

  it('passes onDismiss to each ToastItem', () => {
    const toasts: Toast[] = [
      { id: 'toast-1', type: 'success', title: 'Toast 1' },
      { id: 'toast-2', type: 'error', title: 'Toast 2' },
    ]
    render(<ToastContainer toasts={toasts} onDismiss={mockOnDismiss} />)
    const dismissButtons = screen.getAllByLabelText('Dismiss')
    fireEvent.click(dismissButtons[0])
    expect(mockOnDismiss).toHaveBeenCalledWith('toast-1')
  })

  // Test all toast types render correctly
  const toastTypes: Array<'success' | 'error' | 'warning' | 'info'> = ['success', 'error', 'warning', 'info']

  toastTypes.forEach((type) => {
    it(`renders ${type} toast type correctly`, () => {
      const toast: Toast = { id: `${type}-toast`, type, title: `${type} title` }
      render(<ToastContainer toasts={[toast]} onDismiss={mockOnDismiss} />)
      expect(screen.getByText(`${type} title`)).toBeInTheDocument()
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})