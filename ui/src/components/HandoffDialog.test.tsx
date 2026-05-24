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
})
