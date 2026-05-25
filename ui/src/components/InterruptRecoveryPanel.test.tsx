import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { InterruptRecoveryPanel } from './InterruptRecoveryPanel'
import { logger, formatRelativeTime } from '../utils'

const mockUnsubFn = vi.fn()

const mockStore = {
  checkpoints: [] as unknown[],
  fetchCheckpoints: vi.fn().mockResolvedValue(undefined),
  resumeTask: vi.fn().mockResolvedValue(undefined),
  recoverTask: vi.fn().mockResolvedValue(undefined),
  loading: false,
  error: null as string | null,
  onAgentInterrupted: vi.fn(),
  onTaskResumed: vi.fn(),
}

const mockSubscribe = vi.fn().mockReturnValue(mockUnsubFn)

vi.mock('../stores/swarmAlgorithmStore', () => ({
  useSwarmAlgorithmStore: (selector?: (s: typeof mockStore) => unknown) =>
    selector ? selector(mockStore) : mockStore,
}))

vi.mock('../services', () => ({
  api: {
    events: {
      subscribe: (...args: unknown[]) => mockSubscribe(...args),
    },
  },
}))

vi.mock('../utils', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  formatRelativeTime: vi.fn().mockReturnValue('1m ago'),
}))

const makeCheckpoint = (overrides: Partial<{
  checkpointId: string
  taskId: string
  agentId: string
  reason: string
  strategy: string
  partialResult: string
  savedAt: string
  retryCount: number
  recovered: boolean
}> = {}) => ({
  checkpointId: 'cp-1',
  taskId: 'task-1',
  agentId: 'agent-1',
  reason: 'timeout exceeded',
  strategy: 'retry',
  partialResult: '',
  savedAt: '2026-01-01T00:00:00Z',
  retryCount: 0,
  recovered: false,
  ...overrides,
})

describe('InterruptRecoveryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStore.checkpoints = []
    mockStore.error = null
    mockStore.loading = false
  })

  // ── Basic rendering ──

  it('renders header', () => {
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.getByText('Interrupts & Recovery')).toBeInTheDocument()
  })

  it('shows empty state when no checkpoints', () => {
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.getByText('No active interrupts')).toBeInTheDocument()
    expect(screen.getByText('All tasks are running smoothly')).toBeInTheDocument()
  })

  it('shows active count as 0 when no checkpoints', () => {
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.getByText('0 active')).toBeInTheDocument()
  })

  it('does not render recovered section when no recovered checkpoints', () => {
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.queryByText('Recovered')).not.toBeInTheDocument()
  })

  // ── fetchCheckpoints on mount ──

  it('calls fetchCheckpoints on mount with swarmId', () => {
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(mockStore.fetchCheckpoints).toHaveBeenCalledWith('sw-1')
  })

  it('does not call fetchCheckpoints when swarmId is empty', () => {
    render(<InterruptRecoveryPanel swarmId="" />)
    expect(mockStore.fetchCheckpoints).not.toHaveBeenCalled()
  })

  // ── Error display ──

  it('shows error message when error exists', () => {
    mockStore.error = 'Failed to fetch checkpoints'
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.getByText('Failed to fetch checkpoints')).toBeInTheDocument()
  })

  it('does not show error section when error is null', () => {
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    const errorEl = screen.queryByText(/Failed to fetch/)
    expect(errorEl).not.toBeInTheDocument()
  })

  // ── Checkpoint card rendering ──

  it('renders checkpoint card with taskId and reason label', () => {
    mockStore.checkpoints = [makeCheckpoint()]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.getByText('task-1')).toBeInTheDocument()
    expect(screen.getByText('Timeout')).toBeInTheDocument()
  })

  it('shows active count matching non-recovered checkpoints', () => {
    mockStore.checkpoints = [
      makeCheckpoint({ checkpointId: 'cp-1' }),
      makeCheckpoint({ checkpointId: 'cp-2', recovered: true }),
    ]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.getByText('1 active')).toBeInTheDocument()
  })

  it('renders multiple active checkpoint cards', () => {
    mockStore.checkpoints = [
      makeCheckpoint({ checkpointId: 'cp-1', taskId: 't-1' }),
      makeCheckpoint({ checkpointId: 'cp-2', taskId: 't-2' }),
    ]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.getByText('t-1')).toBeInTheDocument()
    expect(screen.getByText('t-2')).toBeInTheDocument()
  })

  it('displays agentId in mono font', () => {
    mockStore.checkpoints = [makeCheckpoint({ agentId: 'my-agent-42' })]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.getByText('my-agent-42')).toBeInTheDocument()
  })

  it('calls formatRelativeTime with checkpoint savedAt date', () => {
    mockStore.checkpoints = [makeCheckpoint({ savedAt: '2026-03-15T10:30:00Z' })]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(formatRelativeTime).toHaveBeenCalledWith(new Date('2026-03-15T10:30:00Z'))
  })

  // ── Retry count display ──

  it('shows retry count when retryCount > 0', () => {
    mockStore.checkpoints = [makeCheckpoint({ retryCount: 3 })]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Retry Count')).toBeInTheDocument()
  })

  it('hides retry count when retryCount is 0', () => {
    mockStore.checkpoints = [makeCheckpoint({ retryCount: 0 })]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.queryByText('Retry Count')).not.toBeInTheDocument()
  })

  // ── Partial result display ──

  it('shows partial result when present', () => {
    mockStore.checkpoints = [makeCheckpoint({ partialResult: 'Halfway done with task' })]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.getByText('Partial Result')).toBeInTheDocument()
    expect(screen.getByText('Halfway done with task')).toBeInTheDocument()
  })

  it('hides partial result section when empty', () => {
    mockStore.checkpoints = [makeCheckpoint({ partialResult: '' })]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.queryByText('Partial Result')).not.toBeInTheDocument()
  })

  // ── Reason config mapping ──

  it('maps network reason correctly', () => {
    mockStore.checkpoints = [makeCheckpoint({ reason: 'network failure' })]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.getByText('Network')).toBeInTheDocument()
  })

  it('maps crash reason correctly', () => {
    mockStore.checkpoints = [makeCheckpoint({ reason: 'process crashed' })]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.getByText('Crash')).toBeInTheDocument()
  })

  it('maps token_limit reason via token keyword', () => {
    mockStore.checkpoints = [makeCheckpoint({ reason: 'token exceeded limit' })]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.getByText('Token Limit')).toBeInTheDocument()
  })

  it('maps token_limit reason via limit keyword', () => {
    mockStore.checkpoints = [makeCheckpoint({ reason: 'hit the limit' })]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.getByText('Token Limit')).toBeInTheDocument()
  })

  it('maps manual reason correctly', () => {
    mockStore.checkpoints = [makeCheckpoint({ reason: 'manual stop' })]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.getByText('Manual')).toBeInTheDocument()
  })

  it('maps unknown reason correctly', () => {
    mockStore.checkpoints = [makeCheckpoint({ reason: 'something weird happened' })]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })

  it('maps reason case-insensitively', () => {
    mockStore.checkpoints = [makeCheckpoint({ reason: 'TIMEOUT' })]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.getByText('Timeout')).toBeInTheDocument()
  })

  // ── Resume button ──

  it('calls resumeTask when Resume button is clicked', async () => {
    const cp = makeCheckpoint()
    mockStore.checkpoints = [cp]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    const resumeBtn = screen.getByText('Resume')
    await act(async () => {
      fireEvent.click(resumeBtn)
    })
    expect(mockStore.resumeTask).toHaveBeenCalledWith('cp-1', 'agent-1')
  })

  it('logs error when resumeTask throws', async () => {
    const error = new Error('resume failed')
    mockStore.resumeTask.mockRejectedValueOnce(error)
    const cp = makeCheckpoint()
    mockStore.checkpoints = [cp]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    await act(async () => {
      fireEvent.click(screen.getByText('Resume'))
    })
    expect(logger.error).toHaveBeenCalledWith('InterruptRecoveryPanel', 'Failed to resume task:', error)
  })

  it('disables Resume and Recover buttons when loading is true', () => {
    mockStore.loading = true
    mockStore.checkpoints = [makeCheckpoint()]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    const resumeBtn = screen.getByText('Resume')
    const recoverBtn = screen.getByText('Recover')
    expect(resumeBtn).toBeDisabled()
    expect(recoverBtn).toBeDisabled()
  })

  // ── Recovery dialog ──

  it('opens recovery dialog when Recover button is clicked', async () => {
    mockStore.checkpoints = [makeCheckpoint({ taskId: 'task-open-dialog' })]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    await act(async () => {
      fireEvent.click(screen.getByText('Recover'))
    })
    expect(screen.getByText('Recover Task')).toBeInTheDocument()
    expect(screen.getAllByText('task-open-dialog').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Choose a recovery strategy:')).toBeInTheDocument()
  })

  it('shows all four strategy options in the dialog', async () => {
    mockStore.checkpoints = [makeCheckpoint()]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    await act(async () => {
      fireEvent.click(screen.getByText('Recover'))
    })
    expect(screen.getByText('Retry Same Agent')).toBeInTheDocument()
    expect(screen.getByText('Reassign')).toBeInTheDocument()
    expect(screen.getByText('Escalate')).toBeInTheDocument()
    expect(screen.getByText('Skip')).toBeInTheDocument()
  })

  it('selects retry strategy by default', async () => {
    mockStore.checkpoints = [makeCheckpoint()]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    await act(async () => {
      fireEvent.click(screen.getByText('Recover'))
    })
    // The retry option should be selected (has blue styling)
    const retryBtn = screen.getByText('Retry Same Agent').closest('button')
    expect(retryBtn?.className).toContain('bg-blue-500/20')
  })

  it('switches strategy when a different option is clicked', async () => {
    mockStore.checkpoints = [makeCheckpoint()]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    await act(async () => {
      fireEvent.click(screen.getByText('Recover'))
    })
    // Click "Reassign" option
    await act(async () => {
      fireEvent.click(screen.getByText('Reassign'))
    })
    const reassignBtn = screen.getByText('Reassign').closest('button')
    expect(reassignBtn?.className).toContain('bg-blue-500/20')
  })

  it('closes dialog when Cancel is clicked', async () => {
    mockStore.checkpoints = [makeCheckpoint()]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    await act(async () => {
      fireEvent.click(screen.getByText('Recover'))
    })
    expect(screen.getByText('Recover Task')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByText('Cancel'))
    })
    expect(screen.queryByText('Recover Task')).not.toBeInTheDocument()
  })

  it('calls recoverTask with selected strategy and closes dialog', async () => {
    const cp = makeCheckpoint()
    mockStore.checkpoints = [cp]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    await act(async () => {
      fireEvent.click(screen.getByText('Recover'))
    })
    // Select "escalate" strategy
    await act(async () => {
      fireEvent.click(screen.getByText('Escalate'))
    })
    // Click the "Recover" button in the dialog (not the card button)
    const dialogRecoverBtns = screen.getAllByText('Recover')
    // The dialog's Recover button is the last one rendered
    await act(async () => {
      fireEvent.click(dialogRecoverBtns[dialogRecoverBtns.length - 1])
    })
    expect(mockStore.recoverTask).toHaveBeenCalledWith('cp-1', 'escalate')
    expect(screen.queryByText('Recover Task')).not.toBeInTheDocument()
  })

  it('logs error when recoverTask throws', async () => {
    const error = new Error('recover failed')
    mockStore.recoverTask.mockRejectedValueOnce(error)
    const cp = makeCheckpoint()
    mockStore.checkpoints = [cp]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    await act(async () => {
      fireEvent.click(screen.getByText('Recover'))
    })
    const dialogRecoverBtns = screen.getAllByText('Recover')
    await act(async () => {
      fireEvent.click(dialogRecoverBtns[dialogRecoverBtns.length - 1])
    })
    expect(logger.error).toHaveBeenCalledWith('InterruptRecoveryPanel', 'Failed to recover task:', error)
    // Dialog should remain open on error
    expect(screen.getByText('Recover Task')).toBeInTheDocument()
  })

  it('disables Recover button in dialog when loading', async () => {
    mockStore.loading = true
    mockStore.checkpoints = [makeCheckpoint()]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    // Card Recover button opens dialog, but it's disabled when loading
    const recoverBtns = screen.getAllByText('Recover')
    expect(recoverBtns[0]).toBeDisabled()
  })

  // ── Recovered checkpoints section ──

  it('shows recovered section when recovered checkpoints exist', () => {
    mockStore.checkpoints = [
      makeCheckpoint({ checkpointId: 'cp-1', taskId: 't-active' }),
      makeCheckpoint({ checkpointId: 'cp-2', taskId: 't-recovered', recovered: true }),
    ]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.getByText('1 recovered')).toBeInTheDocument()
    expect(screen.getByText('t-recovered')).toBeInTheDocument()
  })

  it('shows correct recovered count', () => {
    mockStore.checkpoints = [
      makeCheckpoint({ checkpointId: 'cp-1' }),
      makeCheckpoint({ checkpointId: 'cp-2', recovered: true }),
      makeCheckpoint({ checkpointId: 'cp-3', recovered: true }),
    ]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.getByText('2 recovered')).toBeInTheDocument()
  })

  it('does not show recovered count when no recovered checkpoints', () => {
    mockStore.checkpoints = [makeCheckpoint()]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.queryByText(/recovered/)).not.toBeInTheDocument()
  })

  // ── Event subscriptions ──

  it('subscribes to agent_interrupted, task_resumed, and task_recovered events', () => {
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(mockSubscribe).toHaveBeenCalledTimes(3)
    const eventNames = (mockSubscribe as Mock).mock.calls.map((call: unknown[]) => call[0])
    expect(eventNames).toContain('agent_interrupted')
    expect(eventNames).toContain('task_resumed')
    expect(eventNames).toContain('task_recovered')
  })

  it('unsubscribes from all events on unmount', () => {
    const { unmount } = render(<InterruptRecoveryPanel swarmId="sw-1" />)
    unmount()
    // Each subscribe returned mockUnsubFn, so it should be called 3 times on unmount
    expect(mockUnsubFn).toHaveBeenCalledTimes(3)
  })

  it('calls onAgentInterrupted and refetches on agent_interrupted event for matching swarmId', () => {
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    // Find the agent_interrupted callback
    const interruptedCall = (mockSubscribe as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'agent_interrupted'
    )
    const handler = interruptedCall?.[1] as (data: unknown) => void

    act(() => {
      handler({ swarmId: 'sw-1', checkpointId: 'cp-new' })
    })
    expect(mockStore.onAgentInterrupted).toHaveBeenCalledWith({ swarmId: 'sw-1', checkpointId: 'cp-new' })
    expect(mockStore.fetchCheckpoints).toHaveBeenCalledWith('sw-1')
  })

  it('does not refetch on agent_interrupted event for different swarmId', () => {
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    const interruptedCall = (mockSubscribe as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'agent_interrupted'
    )
    const handler = interruptedCall?.[1] as (data: unknown) => void

    // Clear initial mount fetchCheckpoints call
    mockStore.fetchCheckpoints.mockClear()

    act(() => {
      handler({ swarmId: 'sw-other', checkpointId: 'cp-new' })
    })
    expect(mockStore.onAgentInterrupted).toHaveBeenCalled()
    expect(mockStore.fetchCheckpoints).not.toHaveBeenCalled()
  })

  it('calls onTaskResumed on task_resumed event', () => {
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    const resumedCall = (mockSubscribe as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'task_resumed'
    )
    const handler = resumedCall?.[1] as (data: unknown) => void

    act(() => {
      handler({ taskId: 't-1' })
    })
    expect(mockStore.onTaskResumed).toHaveBeenCalledWith({ taskId: 't-1' })
  })

  it('calls onTaskResumed and refetches on task_recovered event for matching swarmId', () => {
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    const recoveredCall = (mockSubscribe as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'task_recovered'
    )
    const handler = recoveredCall?.[1] as (data: unknown) => void

    act(() => {
      handler({ swarmId: 'sw-1' })
    })
    expect(mockStore.onTaskResumed).toHaveBeenCalledWith({ swarmId: 'sw-1' })
    expect(mockStore.fetchCheckpoints).toHaveBeenCalledWith('sw-1')
  })

  it('does not refetch on task_recovered event for different swarmId', () => {
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    const recoveredCall = (mockSubscribe as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'task_recovered'
    )
    const handler = recoveredCall?.[1] as (data: unknown) => void

    mockStore.fetchCheckpoints.mockClear()

    act(() => {
      handler({ swarmId: 'sw-other' })
    })
    expect(mockStore.onTaskResumed).toHaveBeenCalled()
    expect(mockStore.fetchCheckpoints).not.toHaveBeenCalled()
  })

  // ── Strategy descriptions ──

  it('shows strategy descriptions in the recovery dialog', async () => {
    mockStore.checkpoints = [makeCheckpoint()]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    await act(async () => {
      fireEvent.click(screen.getByText('Recover'))
    })
    expect(screen.getByText('Retry with the same agent')).toBeInTheDocument()
    expect(screen.getByText('Assign to a different agent')).toBeInTheDocument()
    expect(screen.getByText('Escalate to supervisor')).toBeInTheDocument()
    expect(screen.getByText('Skip this task')).toBeInTheDocument()
  })

  // ── Strategy selection with checkmark ──

  it('renders checkmark for selected strategy only', async () => {
    mockStore.checkpoints = [makeCheckpoint()]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    await act(async () => {
      fireEvent.click(screen.getByText('Recover'))
    })
    // Default selection is "retry". The SVG checkmark path is "M9 16.17..."
    const svgElements = document.querySelectorAll('svg path[d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"]')
    expect(svgElements.length).toBe(1)
  })

  // ── Recovery dialog shows task info ──

  it('shows the checkpoint taskId in the recovery dialog', async () => {
    mockStore.checkpoints = [makeCheckpoint({ taskId: 'my-special-task' })]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    await act(async () => {
      fireEvent.click(screen.getByText('Recover'))
    })
    // The dialog shows the taskId in a separate section
    const taskLabels = screen.getAllByText('my-special-task')
    expect(taskLabels.length).toBeGreaterThanOrEqual(1)
  })

  // ── Multiple checkpoint interaction ──

  it('can open recovery dialog for different checkpoints sequentially', async () => {
    mockStore.checkpoints = [
      makeCheckpoint({ checkpointId: 'cp-1', taskId: 'task-first' }),
      makeCheckpoint({ checkpointId: 'cp-2', taskId: 'task-second' }),
    ]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)

    // Open dialog for first checkpoint
    const recoverButtons = screen.getAllByText('Recover')
    await act(async () => {
      fireEvent.click(recoverButtons[0])
    })
    expect(screen.getByText('Recover Task')).toBeInTheDocument()

    // Close it
    await act(async () => {
      fireEvent.click(screen.getByText('Cancel'))
    })

    // Open dialog for second checkpoint
    const recoverButtonsAgain = screen.getAllByText('Recover')
    await act(async () => {
      fireEvent.click(recoverButtonsAgain[1])
    })
    expect(screen.getByText('Recover Task')).toBeInTheDocument()
  })

  // ── SVG icon in empty state ──

  it('renders SVG icon in empty state', () => {
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    const svg = document.querySelector('svg path[d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"]')
    expect(svg).toBeInTheDocument()
  })
})
