import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InterruptRecoveryPanel } from './InterruptRecoveryPanel'

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

vi.mock('../stores/swarmAlgorithmStore', () => ({
  useSwarmAlgorithmStore: (selector?: (s: typeof mockStore) => unknown) =>
    selector ? selector(mockStore) : mockStore,
}))

vi.mock('../services', () => ({
  api: {
    events: {
      subscribe: vi.fn().mockReturnValue(vi.fn()),
    },
  },
}))

vi.mock('../utils', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  formatRelativeTime: vi.fn().mockReturnValue('1m ago'),
}))

describe('InterruptRecoveryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStore.checkpoints = []
    mockStore.error = null
  })

  it('renders header', () => {
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.getByText('Interrupts & Recovery')).toBeInTheDocument()
  })

  it('shows empty state when no checkpoints', () => {
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.getByText('No active interrupts')).toBeInTheDocument()
  })

  it('calls fetchCheckpoints on mount', () => {
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(mockStore.fetchCheckpoints).toHaveBeenCalledWith('sw-1')
  })

  it('shows error message when error exists', () => {
    mockStore.error = 'Failed to fetch checkpoints'
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.getByText('Failed to fetch checkpoints')).toBeInTheDocument()
  })

  it('renders checkpoint cards when data exists', () => {
    mockStore.checkpoints = [
      {
        checkpointId: 'cp-1',
        taskId: 't-1',
        agentId: 'a-1',
        reason: 'timeout exceeded',
        strategy: 'retry',
        partialResult: '',
        savedAt: '2026-01-01T00:00:00Z',
        retryCount: 2,
        recovered: false,
      },
    ]
    render(<InterruptRecoveryPanel swarmId="sw-1" />)
    expect(screen.getByText('t-1')).toBeInTheDocument()
    expect(screen.getByText('Timeout')).toBeInTheDocument()
  })
})
