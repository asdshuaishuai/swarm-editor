import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueenElectionPanel } from './QueenElectionPanel'
import { api } from '../services'
import { logger, formatRelativeTime } from '../utils'

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

type SubscribeCallback = (data: unknown) => void
const eventSubscriptions = new Map<string, SubscribeCallback>()

function subscribeImpl(event: string, cb: SubscribeCallback) {
  eventSubscriptions.set(event, cb)
  return vi.fn()
}

vi.mock('../stores/swarmAlgorithmStore', () => ({
  useSwarmAlgorithmStore: (selector?: (s: typeof mockStore) => unknown) =>
    selector ? selector(mockStore) : mockStore,
}))

vi.mock('../services', () => ({
  api: {
    events: {
      subscribe: vi.fn(),
    },
  },
}))

vi.mock('../utils', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  formatRelativeTime: vi.fn().mockReturnValue('2m ago'),
}))

function makeQueen(overrides: Record<string, unknown> = {}) {
  return {
    swarmId: 'sw-1',
    queenId: 'queen-a',
    backupId: '',
    state: 'stable' as const,
    round: 1,
    electedAt: '2026-01-01T00:00:00Z',
    abdication: '',
    ...overrides,
  }
}

function setQueen(overrides: Record<string, unknown> = {}) {
  mockStore.queens = { 'sw-1': makeQueen(overrides) }
}

describe('QueenElectionPanel', () => {
  beforeEach(() => {
    // Restore the subscribe implementation before each test
    ;(api.events.subscribe as ReturnType<typeof vi.fn>).mockImplementation(subscribeImpl)
    // Clear call history on mocks but not implementations
    vi.mocked(mockStore.fetchQueenStatus).mockClear()
    vi.mocked(mockStore.fetchQueenStatus).mockResolvedValue(undefined)
    vi.mocked(mockStore.triggerElection).mockClear()
    vi.mocked(mockStore.triggerElection).mockResolvedValue(undefined)
    vi.mocked(mockStore.abdicateQueen).mockClear()
    vi.mocked(mockStore.abdicateQueen).mockResolvedValue(undefined)
    vi.mocked(mockStore.onQueenElected).mockClear()
    vi.mocked(mockStore.onQueenAbdicated).mockClear()
    vi.mocked(logger.error).mockClear()
    vi.mocked(logger.warn).mockClear()
    vi.mocked(logger.debug).mockClear()
    vi.mocked(formatRelativeTime).mockClear()
    vi.mocked(formatRelativeTime).mockReturnValue('2m ago')
    mockStore.queens = {}
    mockStore.error = null
    mockStore.loading = false
    eventSubscriptions.clear()
  })

  afterEach(() => {
    // Clean up rendered components
  })

  // --- Mount & empty state ---

  it('renders empty state when no queen', () => {
    render(<QueenElectionPanel swarmId="sw-1" />)
    expect(screen.getByText('No queen elected')).toBeInTheDocument()
    expect(screen.getByText('Trigger an election to select a queen agent')).toBeInTheDocument()
  })

  it('calls fetchQueenStatus on mount', () => {
    render(<QueenElectionPanel swarmId="sw-1" />)
    expect(mockStore.fetchQueenStatus).toHaveBeenCalledWith('sw-1')
  })

  it('does not call fetchQueenStatus when swarmId is empty', () => {
    render(<QueenElectionPanel swarmId="" />)
    expect(mockStore.fetchQueenStatus).not.toHaveBeenCalled()
  })

  // --- Error display ---

  it('shows error message when error exists', () => {
    mockStore.error = 'Failed to fetch queen status'
    render(<QueenElectionPanel swarmId="sw-1" />)
    expect(screen.getByText('Failed to fetch queen status')).toBeInTheDocument()
  })

  // --- Queen info display ---

  it('shows queen info when queen exists', () => {
    setQueen({ backupId: 'backup-b', round: 3 })
    render(<QueenElectionPanel swarmId="sw-1" />)
    expect(screen.getByText('queen-a')).toBeInTheDocument()
    expect(screen.getByText('Stable')).toBeInTheDocument()
    expect(screen.getByText('backup-b')).toBeInTheDocument()
    expect(screen.getByText('#3')).toBeInTheDocument()
    expect(screen.getByText('Current Queen')).toBeInTheDocument()
  })

  it('shows None when backupId is empty', () => {
    setQueen({ backupId: '' })
    render(<QueenElectionPanel swarmId="sw-1" />)
    expect(screen.getByText('None')).toBeInTheDocument()
  })

  it('displays abdication reason when present', () => {
    setQueen({ abdication: 'Node unreachable' })
    render(<QueenElectionPanel swarmId="sw-1" />)
    expect(screen.getByText('Node unreachable')).toBeInTheDocument()
  })

  it('does not display abdication section when empty', () => {
    setQueen({ abdication: '' })
    render(<QueenElectionPanel swarmId="sw-1" />)
    expect(screen.queryByText('Abdication')).not.toBeInTheDocument()
  })

  it('renders pending state label', () => {
    setQueen({ state: 'pending' })
    render(<QueenElectionPanel swarmId="sw-1" />)
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('renders failed state label', () => {
    setQueen({ state: 'failed' })
    render(<QueenElectionPanel swarmId="sw-1" />)
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  // --- Trigger Election ---

  it('clicking trigger election calls handler', () => {
    setQueen()
    render(<QueenElectionPanel swarmId="sw-1" />)
    fireEvent.click(screen.getByText('Trigger Election'))
    expect(mockStore.triggerElection).toHaveBeenCalledWith('sw-1')
  })

  it('trigger election button is disabled when loading', () => {
    setQueen()
    mockStore.loading = true
    render(<QueenElectionPanel swarmId="sw-1" />)
    expect(screen.getByText('Trigger Election').closest('button')).toBeDisabled()
  })

  it('logs error when trigger election fails', async () => {
    setQueen()
    mockStore.triggerElection.mockRejectedValueOnce(new Error('Network error'))
    render(<QueenElectionPanel swarmId="sw-1" />)
    await act(async () => {
      fireEvent.click(screen.getByText('Trigger Election'))
    })
    expect(logger.error).toHaveBeenCalledWith('QueenElectionPanel', 'Failed to trigger election:', expect.any(Error))
  })

  // --- Abdicate dialog ---

  it('opens abdicate dialog when abdicate button is clicked', () => {
    setQueen()
    render(<QueenElectionPanel swarmId="sw-1" />)
    fireEvent.click(screen.getByText('Abdicate Queen'))
    expect(screen.getByText('Provide a reason for abdicating the current queen. This will trigger a new election.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Reason for abdication...')).toBeInTheDocument()
  })

  it('abdicate queen button is disabled when loading', () => {
    setQueen()
    mockStore.loading = true
    render(<QueenElectionPanel swarmId="sw-1" />)
    expect(screen.getByText('Abdicate Queen').closest('button')).toBeDisabled()
  })

  it('abdicate queen button is disabled when queenId is empty', () => {
    setQueen({ queenId: '' })
    render(<QueenElectionPanel swarmId="sw-1" />)
    expect(screen.getByText('Abdicate Queen').closest('button')).toBeDisabled()
  })

  it('abdicate dialog submit button is disabled when reason is empty', () => {
    setQueen()
    render(<QueenElectionPanel swarmId="sw-1" />)
    fireEvent.click(screen.getByText('Abdicate Queen'))
    const dialogButtons = screen.getAllByText('Abdicate')
    const submitButton = dialogButtons.find((el) => el.tagName === 'BUTTON')
    expect(submitButton).toBeDisabled()
  })

  it('abdicate dialog submit button is enabled when reason is provided', () => {
    setQueen()
    render(<QueenElectionPanel swarmId="sw-1" />)
    fireEvent.click(screen.getByText('Abdicate Queen'))
    fireEvent.change(screen.getByPlaceholderText('Reason for abdication...'), { target: { value: 'Resigning' } })
    const dialogButtons = screen.getAllByText('Abdicate')
    const submitButton = dialogButtons.find((el) => el.tagName === 'BUTTON')
    expect(submitButton).not.toBeDisabled()
  })

  it('does not call abdicateQueen when reason is whitespace-only', () => {
    setQueen()
    render(<QueenElectionPanel swarmId="sw-1" />)
    fireEvent.click(screen.getByText('Abdicate Queen'))
    fireEvent.change(screen.getByPlaceholderText('Reason for abdication...'), { target: { value: '   ' } })
    const dialogButtons = screen.getAllByText('Abdicate')
    const submitButton = dialogButtons.find((el) => el.tagName === 'BUTTON') as HTMLButtonElement
    expect(submitButton).toBeDisabled()
  })

  it('calls abdicateQueen with reason on submit', async () => {
    setQueen()
    render(<QueenElectionPanel swarmId="sw-1" />)
    fireEvent.click(screen.getByText('Abdicate Queen'))
    fireEvent.change(screen.getByPlaceholderText('Reason for abdication...'), { target: { value: 'Moving on' } })
    const dialogButtons = screen.getAllByText('Abdicate')
    const submitButton = dialogButtons.find((el) => el.tagName === 'BUTTON') as HTMLButtonElement
    await act(async () => {
      fireEvent.click(submitButton)
    })
    expect(mockStore.abdicateQueen).toHaveBeenCalledWith('sw-1', 'Moving on')
  })

  it('closes abdicate dialog on cancel', () => {
    setQueen()
    render(<QueenElectionPanel swarmId="sw-1" />)
    fireEvent.click(screen.getByText('Abdicate Queen'))
    expect(screen.getByPlaceholderText('Reason for abdication...')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByPlaceholderText('Reason for abdication...')).not.toBeInTheDocument()
  })

  it('closes abdicate dialog after successful abdication', async () => {
    setQueen()
    render(<QueenElectionPanel swarmId="sw-1" />)
    fireEvent.click(screen.getByText('Abdicate Queen'))
    fireEvent.change(screen.getByPlaceholderText('Reason for abdication...'), { target: { value: 'Done' } })
    const dialogButtons = screen.getAllByText('Abdicate')
    const submitButton = dialogButtons.find((el) => el.tagName === 'BUTTON') as HTMLButtonElement
    await act(async () => {
      fireEvent.click(submitButton)
    })
    expect(screen.queryByPlaceholderText('Reason for abdication...')).not.toBeInTheDocument()
  })

  it('logs error when abdication fails', async () => {
    setQueen()
    mockStore.abdicateQueen.mockRejectedValueOnce(new Error('Abdicate fail'))
    render(<QueenElectionPanel swarmId="sw-1" />)
    fireEvent.click(screen.getByText('Abdicate Queen'))
    fireEvent.change(screen.getByPlaceholderText('Reason for abdication...'), { target: { value: 'Reason' } })
    const dialogButtons = screen.getAllByText('Abdicate')
    const submitButton = dialogButtons.find((el) => el.tagName === 'BUTTON') as HTMLButtonElement
    await act(async () => {
      fireEvent.click(submitButton)
    })
    expect(logger.error).toHaveBeenCalledWith('QueenElectionPanel', 'Failed to abdicate queen:', expect.any(Error))
  })

  // --- Event subscriptions ---

  it('subscribes to queen_elected, queen_abdicated, and backup_activated events', () => {
    render(<QueenElectionPanel swarmId="sw-1" />)
    expect(api.events.subscribe).toHaveBeenCalledWith('queen_elected', expect.any(Function))
    expect(api.events.subscribe).toHaveBeenCalledWith('queen_abdicated', expect.any(Function))
    expect(api.events.subscribe).toHaveBeenCalledWith('backup_activated', expect.any(Function))
  })

  it('unsubscribes from events on unmount', () => {
    const unsubFns = [vi.fn(), vi.fn(), vi.fn()]
    let callIdx = 0
    ;(api.events.subscribe as ReturnType<typeof vi.fn>).mockImplementation(() => unsubFns[callIdx++])
    const { unmount } = render(<QueenElectionPanel swarmId="sw-1" />)
    unmount()
    unsubFns.forEach((fn) => expect(fn).toHaveBeenCalled())
  })

  it('adds election event to history on queen_elected matching swarmId', () => {
    setQueen()
    render(<QueenElectionPanel swarmId="sw-1" />)
    const cb = eventSubscriptions.get('queen_elected')
    expect(cb).toBeDefined()
    act(() => {
      cb!({ swarmId: 'sw-1', queenId: 'queen-b', round: 2, electedAt: '2026-01-02T00:00:00Z' })
    })
    expect(screen.getByText('Election History')).toBeInTheDocument()
    expect(screen.getByText('queen-b')).toBeInTheDocument()
    expect(mockStore.onQueenElected).toHaveBeenCalledWith({ swarmId: 'sw-1', queenId: 'queen-b', round: 2, electedAt: '2026-01-02T00:00:00Z' })
  })

  it('ignores queen_elected event for different swarmId', () => {
    setQueen()
    render(<QueenElectionPanel swarmId="sw-1" />)
    const cb = eventSubscriptions.get('queen_elected')
    act(() => {
      cb!({ swarmId: 'sw-other', queenId: 'queen-b', round: 2, electedAt: '2026-01-02T00:00:00Z' })
    })
    expect(screen.queryByText('Election History')).not.toBeInTheDocument()
  })

  it('adds abdicated event to history with reason', () => {
    setQueen()
    render(<QueenElectionPanel swarmId="sw-1" />)
    const cb = eventSubscriptions.get('queen_abdicated')
    act(() => {
      cb!({ swarmId: 'sw-1', queenId: 'queen-a', reason: 'Failed health check', timestamp: '2026-01-03T00:00:00Z' })
    })
    expect(screen.getByText('Election History')).toBeInTheDocument()
    expect(screen.getByText('(Failed health check)')).toBeInTheDocument()
    expect(mockStore.onQueenAbdicated).toHaveBeenCalled()
  })

  it('adds backup_activated event to history', () => {
    setQueen()
    render(<QueenElectionPanel swarmId="sw-1" />)
    const cb = eventSubscriptions.get('backup_activated')
    act(() => {
      cb!({ swarmId: 'sw-1', queenId: 'backup-b', timestamp: '2026-01-04T00:00:00Z' })
    })
    expect(screen.getByText('Election History')).toBeInTheDocument()
    expect(screen.getByText('backup-b')).toBeInTheDocument()
  })

  it('caps election history at 5 events', () => {
    setQueen()
    render(<QueenElectionPanel swarmId="sw-1" />)
    const cb = eventSubscriptions.get('queen_elected')
    for (let i = 0; i < 7; i++) {
      act(() => {
        cb!({ swarmId: 'sw-1', queenId: `queen-${i}`, round: i, electedAt: `2026-01-0${i + 1}T00:00:00Z` })
      })
    }
    const historyItems = screen.getAllByText(/queen-\d/)
    expect(historyItems.length).toBe(5)
  })

  it('does not show election history when empty', () => {
    setQueen()
    render(<QueenElectionPanel swarmId="sw-1" />)
    expect(screen.queryByText('Election History')).not.toBeInTheDocument()
  })

  // --- formatRelativeTime integration ---

  it('calls formatRelativeTime for electedAt', () => {
    setQueen({ electedAt: '2026-03-15T12:00:00Z' })
    render(<QueenElectionPanel swarmId="sw-1" />)
    expect(formatRelativeTime).toHaveBeenCalled()
  })

  // --- Queen from different swarm ---

  it('shows empty state when queen is for different swarm', () => {
    mockStore.queens = {
      'sw-other': makeQueen(),
    }
    render(<QueenElectionPanel swarmId="sw-1" />)
    expect(screen.getByText('No queen elected')).toBeInTheDocument()
  })
})
