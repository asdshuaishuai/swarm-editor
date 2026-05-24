import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueenElectionPanel } from './QueenElectionPanel'

const mockStore = {
  queens: {} as Record<string, unknown>,
  fetchQueenStatus: vi.fn().mockResolvedValue(undefined),
  triggerElection: vi.fn().mockResolvedValue(undefined),
  abdicateQueen: vi.fn().mockResolvedValue(undefined),
  loading: false,
  error: null as string | null,
  onQueenElected: vi.fn(),
  onQueenAbdicated: vi.fn(),
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
  formatRelativeTime: vi.fn().mockReturnValue('2m ago'),
}))

describe('QueenElectionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStore.queens = {}
    mockStore.error = null
  })

  it('renders empty state when no queen', () => {
    render(<QueenElectionPanel swarmId="sw-1" />)
    expect(screen.getByText('No queen elected')).toBeInTheDocument()
  })

  it('calls fetchQueenStatus on mount', () => {
    render(<QueenElectionPanel swarmId="sw-1" />)
    expect(mockStore.fetchQueenStatus).toHaveBeenCalledWith('sw-1')
  })

  it('renders trigger election button when queen exists', () => {
    mockStore.queens = {
      'sw-1': {
        swarmId: 'sw-1',
        queenId: 'queen-a',
        backupId: '',
        state: 'stable',
        round: 1,
        electedAt: '2026-01-01T00:00:00Z',
        abdication: '',
      },
    }
    render(<QueenElectionPanel swarmId="sw-1" />)
    expect(screen.getByText('Trigger Election')).toBeInTheDocument()
  })

  it('renders abdicate queen button when queen exists', () => {
    mockStore.queens = {
      'sw-1': {
        swarmId: 'sw-1',
        queenId: 'queen-a',
        backupId: '',
        state: 'stable',
        round: 1,
        electedAt: '2026-01-01T00:00:00Z',
        abdication: '',
      },
    }
    render(<QueenElectionPanel swarmId="sw-1" />)
    expect(screen.getByText('Abdicate Queen')).toBeInTheDocument()
  })

  it('shows error message when error exists', () => {
    mockStore.error = 'Failed to fetch queen status'
    render(<QueenElectionPanel swarmId="sw-1" />)
    expect(screen.getByText('Failed to fetch queen status')).toBeInTheDocument()
  })

  it('shows queen info when queen exists', () => {
    mockStore.queens = {
      'sw-1': {
        swarmId: 'sw-1',
        queenId: 'queen-a',
        backupId: 'backup-b',
        state: 'stable',
        round: 3,
        electedAt: '2026-01-01T00:00:00Z',
        abdication: '',
      },
    }
    render(<QueenElectionPanel swarmId="sw-1" />)
    expect(screen.getByText('queen-a')).toBeInTheDocument()
    expect(screen.getByText('Stable')).toBeInTheDocument()
  })

  it('clicking trigger election calls handler', async () => {
    mockStore.queens = {
      'sw-1': {
        swarmId: 'sw-1',
        queenId: 'queen-a',
        backupId: '',
        state: 'stable',
        round: 1,
        electedAt: '2026-01-01T00:00:00Z',
        abdication: '',
      },
    }
    render(<QueenElectionPanel swarmId="sw-1" />)
    fireEvent.click(screen.getByText('Trigger Election'))
    expect(mockStore.triggerElection).toHaveBeenCalledWith('sw-1')
  })
})
