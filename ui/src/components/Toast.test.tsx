import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ToastContainer, type Toast } from './Toast'
import ToastItemDefault from './Toast'

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

describe('ToastItem actions', () => {
  const mockOnDismiss = vi.fn()
  const mockActionClick = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders action buttons when actions are provided', () => {
    const toast: Toast = {
      id: 'action-toast',
      type: 'info',
      title: 'Action Toast',
      actions: [
        { label: 'Confirm', onClick: mockActionClick },
        { label: 'Cancel', onClick: vi.fn() },
      ],
    }
    render(<ToastContainer toasts={[toast]} onDismiss={mockOnDismiss} />)

    expect(screen.getByText('Confirm')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('does not render action buttons when actions is undefined', () => {
    const toast: Toast = {
      id: 'no-action-toast',
      type: 'success',
      title: 'No Actions',
    }
    render(<ToastContainer toasts={[toast]} onDismiss={mockOnDismiss} />)

    expect(screen.queryByText('Confirm')).not.toBeInTheDocument()
  })

  it('does not render action buttons when actions is empty array', () => {
    const toast: Toast = {
      id: 'empty-action-toast',
      type: 'success',
      title: 'Empty Actions',
      actions: [],
    }
    render(<ToastContainer toasts={[toast]} onDismiss={mockOnDismiss} />)

    // Only the dismiss button should be present
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1) // only the dismiss (X) button
  })

  it('calls action onClick and then onDismiss when action button is clicked', () => {
    const toast: Toast = {
      id: 'action-toast',
      type: 'info',
      title: 'Action Toast',
      actions: [
        { label: 'Confirm', onClick: mockActionClick },
      ],
    }
    render(<ToastContainer toasts={[toast]} onDismiss={mockOnDismiss} />)

    fireEvent.click(screen.getByText('Confirm'))

    expect(mockActionClick).toHaveBeenCalledTimes(1)
    expect(mockOnDismiss).toHaveBeenCalledWith('action-toast')
  })

  it('renders first action button with accent styling class', () => {
    const toast: Toast = {
      id: 'action-toast',
      type: 'info',
      title: 'Action Toast',
      actions: [
        { label: 'Primary', onClick: vi.fn() },
        { label: 'Secondary', onClick: vi.fn() },
      ],
    }
    render(<ToastContainer toasts={[toast]} onDismiss={mockOnDismiss} />)

    const primaryBtn = screen.getByText('Primary')
    const secondaryBtn = screen.getByText('Secondary')

    // First action gets accent styling
    expect(primaryBtn.className).toContain('bg-accent/20')
    expect(primaryBtn.className).toContain('text-accent')

    // Second action gets default styling
    expect(secondaryBtn.className).toContain('bg-surface')
    expect(secondaryBtn.className).toContain('text-text-secondary')
  })

  it('renders multiple action buttons and each works independently', () => {
    const action1 = vi.fn()
    const action2 = vi.fn()
    const toast: Toast = {
      id: 'multi-action-toast',
      type: 'warning',
      title: 'Multi Action',
      actions: [
        { label: 'Retry', onClick: action1 },
        { label: 'Dismiss', onClick: action2 },
      ],
    }
    render(<ToastContainer toasts={[toast]} onDismiss={mockOnDismiss} />)

    fireEvent.click(screen.getByText('Retry'))
    expect(action1).toHaveBeenCalledTimes(1)
    expect(mockOnDismiss).toHaveBeenCalledWith('multi-action-toast')

    // Reset and click second action
    mockOnDismiss.mockClear()
    fireEvent.click(screen.getByText('Dismiss'))
    expect(action2).toHaveBeenCalledTimes(1)
    expect(mockOnDismiss).toHaveBeenCalledWith('multi-action-toast')
  })
})

describe('ToastItem direct', () => {
  const mockOnDismiss = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders ToastItem directly with title and message', () => {
    const toast: Toast = {
      id: 'direct-toast',
      type: 'error',
      title: 'Direct Title',
      message: 'Direct message body',
    }
    render(<ToastItemDefault toast={toast} onDismiss={mockOnDismiss} />)

    expect(screen.getByText('Direct Title')).toBeInTheDocument()
    expect(screen.getByText('Direct message body')).toBeInTheDocument()
  })

  it('clears auto-dismiss timer on unmount', async () => {
    const toast: Toast = {
      id: 'unmount-toast',
      type: 'info',
      title: 'Unmount Test',
      duration: 3000,
    }
    const { unmount } = render(<ToastItemDefault toast={toast} onDismiss={mockOnDismiss} />)

    // Advance partially through the timer
    await vi.advanceTimersByTimeAsync(1500)
    expect(mockOnDismiss).not.toHaveBeenCalled()

    // Unmount before timer fires
    unmount()

    // Advance past the original timer
    await vi.advanceTimersByTimeAsync(2000)
    expect(mockOnDismiss).not.toHaveBeenCalled()
  })

  it('does not fire timer when both persistent and non-zero duration', async () => {
    const toast: Toast = {
      id: 'persistent-toast',
      type: 'warning',
      title: 'Persistent',
      persistent: true,
      duration: 1000,
    }
    render(<ToastItemDefault toast={toast} onDismiss={mockOnDismiss} />)

    await vi.advanceTimersByTimeAsync(5000)
    expect(mockOnDismiss).not.toHaveBeenCalled()
  })
})