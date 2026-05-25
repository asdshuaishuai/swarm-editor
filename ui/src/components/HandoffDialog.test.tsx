import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HandoffDialog } from './HandoffDialog'
import type { HandoffRequestData } from '../stores/handoffStore'

vi.mock('../utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockRequest: HandoffRequestData = {
  id: 'handoff-1',
  fromAgent: 'agent-alpha',
  toAgent: 'agent-beta',
  taskId: 'task-42',
  reason: 'Specialization match — agent-beta has better TypeScript coverage',
  status: 'pending',
  createdAt: new Date(),
  context: {
    instructions: 'Continue refactoring the auth module',
    filesModified: ['src/auth.ts', 'src/auth.test.ts', 'src/utils.ts'],
    nextSteps: ['Fix remaining type errors', 'Add integration test'],
    currentState: 'In progress — auth module 60% refactored',
  },
}

describe('HandoffDialog', () => {
  const onAccept = vi.fn()
  const onReject = vi.fn()
  const onClose = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  // -----------------------------------------------------------------------
  // Basic rendering
  // -----------------------------------------------------------------------

  it('renders dialog when request is provided', () => {
    render(
      <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Task Handoff Request')).toBeInTheDocument()
  })

  it('renders nothing when request is null', () => {
    const { container } = render(
      <HandoffDialog request={null} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('shows from/to agent names', () => {
    render(
      <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
    )
    expect(screen.getByText(/agent-alpha wants to transfer to agent-beta/)).toBeInTheDocument()
    expect(screen.getByText('agent-alpha')).toBeInTheDocument()
    expect(screen.getByText('agent-beta')).toBeInTheDocument()
  })

  it('shows reason field', () => {
    render(
      <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
    )
    expect(screen.getByText('Specialization match — agent-beta has better TypeScript coverage')).toBeInTheDocument()
  })

  it('shows context fields when context is provided', () => {
    render(
      <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
    )
    expect(screen.getByText('Continue refactoring the auth module')).toBeInTheDocument()
    expect(screen.getByText('src/auth.ts')).toBeInTheDocument()
    expect(screen.getByText('Fix remaining type errors')).toBeInTheDocument()
  })

  it('calls onAccept with request id and summary when Accept is clicked', () => {
    render(
      <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
    )
    fireEvent.click(screen.getByText('Accept & Transfer'))
    expect(onAccept).toHaveBeenCalledWith('handoff-1', 'Accepted. Ready to continue.')
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onAccept with custom summary when textarea has content', () => {
    render(
      <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
    )
    fireEvent.change(screen.getByPlaceholderText(/Enter a summary/), {
      target: { value: '  I will take over from here  ' },
    })
    fireEvent.click(screen.getByText('Accept & Transfer'))
    expect(onAccept).toHaveBeenCalledWith('handoff-1', 'I will take over from here')
  })

  it('calls onReject with request id when Reject is clicked', () => {
    render(
      <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
    )
    fireEvent.click(screen.getByText('Reject'))
    expect(onReject).toHaveBeenCalledWith('handoff-1', 'User rejected')
    expect(onClose).toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // Close button
  // -----------------------------------------------------------------------

  describe('close button', () => {
    it('renders close button with aria-label', () => {
      render(
        <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      expect(screen.getByLabelText('Close')).toBeInTheDocument()
    })

    it('calls onClose when close button is clicked', () => {
      render(
        <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      fireEvent.click(screen.getByLabelText('Close'))
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  // -----------------------------------------------------------------------
  // Escape key
  // -----------------------------------------------------------------------

  describe('keyboard interaction', () => {
    it('calls onClose when Escape key is pressed', () => {
      render(
        <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('does not call onClose when other keys are pressed', () => {
      render(
        <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      fireEvent.keyDown(window, { key: 'Enter' })
      fireEvent.keyDown(window, { key: 'Tab' })
      expect(onClose).not.toHaveBeenCalled()
    })

    it('calls onClose on Escape when isLoading is false', () => {
      render(
        <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      // Not loading, so Escape should work
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('removes keydown listener on unmount', () => {
      const { unmount } = render(
        <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      unmount()
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // Agent info display
  // -----------------------------------------------------------------------

  describe('agent info display', () => {
    it('shows first letter of fromAgent capitalized in avatar', () => {
      render(
        <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      // fromAgent = 'agent-alpha', first letter capitalized = 'A'
      const avatarLetters = screen.getAllByText('A')
      expect(avatarLetters.length).toBeGreaterThanOrEqual(1)
    })

    it('shows first letter of toAgent capitalized in avatar', () => {
      render(
        <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      // toAgent = 'agent-beta', first letter capitalized = 'A'
      const avatarLetters = screen.getAllByText('A')
      expect(avatarLetters.length).toBeGreaterThanOrEqual(1)
    })

    it('shows agent names in mono font', () => {
      render(
        <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      const monoElements = screen.getAllByText('agent-alpha')
      expect(monoElements[0].className).toContain('font-mono')
    })
  })

  // -----------------------------------------------------------------------
  // Context sections
  // -----------------------------------------------------------------------

  describe('context display', () => {
    it('does not show context section when context is undefined', () => {
      const requestNoContext: HandoffRequestData = {
        ...mockRequest,
        context: undefined,
      }
      render(
        <HandoffDialog request={requestNoContext} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      expect(screen.queryByText('Instructions')).not.toBeInTheDocument()
      expect(screen.queryByText(/Files \(/)).not.toBeInTheDocument()
      expect(screen.queryByText('Next Steps')).not.toBeInTheDocument()
    })

    it('does not show instructions when context.instructions is undefined', () => {
      const requestNoInstructions: HandoffRequestData = {
        ...mockRequest,
        context: {
          filesModified: ['src/test.ts'],
          nextSteps: ['Do something'],
        },
      }
      render(
        <HandoffDialog request={requestNoInstructions} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      expect(screen.queryByText('Instructions')).not.toBeInTheDocument()
      expect(screen.getByText('Next Steps')).toBeInTheDocument()
    })

    it('does not show files when filesModified is empty array', () => {
      const requestEmptyFiles: HandoffRequestData = {
        ...mockRequest,
        context: {
          instructions: 'Do the thing',
          filesModified: [],
          nextSteps: ['Step one'],
        },
      }
      render(
        <HandoffDialog request={requestEmptyFiles} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      expect(screen.queryByText(/Files \(/)).not.toBeInTheDocument()
    })

    it('shows "+N more" when more than 5 files modified', () => {
      const requestManyFiles: HandoffRequestData = {
        ...mockRequest,
        context: {
          filesModified: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'g.ts'],
          nextSteps: [],
        },
      }
      render(
        <HandoffDialog request={requestManyFiles} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      expect(screen.getByText('+2 more')).toBeInTheDocument()
    })

    it('does not show next steps when nextSteps is empty', () => {
      const requestNoNextSteps: HandoffRequestData = {
        ...mockRequest,
        context: {
          instructions: 'Do the thing',
          filesModified: ['a.ts'],
          nextSteps: [],
        },
      }
      render(
        <HandoffDialog request={requestNoNextSteps} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      expect(screen.queryByText('Next Steps')).not.toBeInTheDocument()
    })

    it('shows at most 3 next steps', () => {
      const requestManySteps: HandoffRequestData = {
        ...mockRequest,
        context: {
          instructions: 'Instructions',
          nextSteps: ['Step 1', 'Step 2', 'Step 3', 'Step 4', 'Step 5'],
        },
      }
      render(
        <HandoffDialog request={requestManySteps} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      expect(screen.getByText('Step 1')).toBeInTheDocument()
      expect(screen.getByText('Step 2')).toBeInTheDocument()
      expect(screen.getByText('Step 3')).toBeInTheDocument()
      expect(screen.queryByText('Step 4')).not.toBeInTheDocument()
      expect(screen.queryByText('Step 5')).not.toBeInTheDocument()
    })

    it('shows files count label correctly', () => {
      render(
        <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      expect(screen.getByText('Files (3)')).toBeInTheDocument()
    })

    it('shows green arrow for each next step', () => {
      render(
        <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      const arrows = screen.getAllByText('→')
      expect(arrows.length).toBe(2) // Two next steps
    })
  })

  // -----------------------------------------------------------------------
  // Summary textarea
  // -----------------------------------------------------------------------

  describe('summary textarea', () => {
    it('renders textarea with placeholder', () => {
      render(
        <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      const textarea = screen.getByPlaceholderText(/Enter a summary to help the receiving agent/)
      expect(textarea).toBeInTheDocument()
    })

    it('updates summary state on input change', () => {
      render(
        <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      const textarea = screen.getByPlaceholderText(/Enter a summary/)
      fireEvent.change(textarea, { target: { value: 'Custom summary text' } })
      expect(textarea).toHaveValue('Custom summary text')
    })
  })

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  describe('loading state', () => {
    it('buttons are not disabled when not loading', () => {
      render(
        <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      const rejectBtn = screen.getByText('Reject')
      const acceptBtn = screen.getByText('Accept & Transfer')
      expect(rejectBtn).not.toBeDisabled()
      expect(acceptBtn).not.toBeDisabled()
    })

    it('does not show spinner when not loading', () => {
      render(
        <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      const acceptBtn = screen.getByText('Accept & Transfer').closest('button')
      const spinner = acceptBtn?.querySelector('.animate-spin')
      expect(spinner).not.toBeInTheDocument()
    })

    it('shows checkmark icon in accept button when not loading', () => {
      render(
        <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      // The accept button shows a checkmark SVG when not loading
      const acceptBtn = screen.getByText('Accept & Transfer').closest('button')
      const svgIcons = acceptBtn?.querySelectorAll('svg')
      expect(svgIcons?.length).toBeGreaterThanOrEqual(1)
    })

    it('accept button has disabled styling classes', () => {
      render(
        <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      const acceptBtn = screen.getByText('Accept & Transfer')
      expect(acceptBtn.className).toContain('disabled:opacity-50')
      expect(acceptBtn.className).toContain('disabled:cursor-not-allowed')
    })
  })

  // -----------------------------------------------------------------------
  // formatDate function
  // -----------------------------------------------------------------------

  describe('formatDate (timestamp display)', () => {
    it('shows "just now" for timestamps within 60 seconds', () => {
      const recentRequest: HandoffRequestData = {
        ...mockRequest,
        createdAt: new Date(),
      }
      render(
        <HandoffDialog request={recentRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      expect(screen.getByText(/Requested just now/)).toBeInTheDocument()
    })

    it('shows minutes ago for timestamps within 60 minutes', () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
      const olderRequest: HandoffRequestData = {
        ...mockRequest,
        createdAt: fiveMinAgo,
      }
      render(
        <HandoffDialog request={olderRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      expect(screen.getByText(/Requested 5m ago/)).toBeInTheDocument()
    })

    it('shows hours ago for timestamps older than 60 minutes', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000)
      const oldRequest: HandoffRequestData = {
        ...mockRequest,
        createdAt: threeHoursAgo,
      }
      render(
        <HandoffDialog request={oldRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      expect(screen.getByText(/Requested 3h ago/)).toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  // Dialog attributes
  // -----------------------------------------------------------------------

  describe('dialog attributes', () => {
    it('has presentation role on overlay', () => {
      render(
        <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      expect(screen.getByRole('presentation')).toBeInTheDocument()
    })

    it('has aria-modal="true" on dialog', () => {
      render(
        <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      const dialog = screen.getByRole('dialog')
      expect(dialog.getAttribute('aria-modal')).toBe('true')
    })

    it('has aria-label on dialog', () => {
      render(
        <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      const dialog = screen.getByRole('dialog')
      expect(dialog.getAttribute('aria-label')).toBe('Handoff request')
    })
  })

  // -----------------------------------------------------------------------
  // Re-render behavior
  // -----------------------------------------------------------------------

  describe('re-render behavior', () => {
    it('shows dialog after rerender from null to request', () => {
      const { rerender } = render(
        <HandoffDialog request={null} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      rerender(
        <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('hides dialog after rerender from request to null', () => {
      const { rerender } = render(
        <HandoffDialog request={mockRequest} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      rerender(
        <HandoffDialog request={null} onAccept={onAccept} onReject={onReject} onClose={onClose} />,
      )
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
