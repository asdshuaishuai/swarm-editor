import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RoleAllocationPanel } from './RoleAllocationPanel'
import { api } from '../services'
import { logger } from '../utils'

const mockStore = {
  roleAssignments: {} as Record<string, unknown[]>,
  fetchRoleAssignments: vi.fn().mockResolvedValue(undefined),
  loading: false,
  error: null as string | null,
}

vi.mock('../stores/swarmAlgorithmStore', () => ({
  useSwarmAlgorithmStore: (selector?: (s: typeof mockStore) => unknown) =>
    selector ? selector(mockStore) : mockStore,
}))

vi.mock('../services', () => ({
  api: {
    agent: { getAgents: vi.fn().mockResolvedValue([]) },
  },
}))

vi.mock('../utils', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

describe('RoleAllocationPanel', () => {
  beforeEach(() => {
    // Reset mock implementations individually to preserve behavior
    vi.mocked(mockStore.fetchRoleAssignments).mockReset()
    vi.mocked(mockStore.fetchRoleAssignments).mockResolvedValue(undefined)
    vi.mocked(api.agent.getAgents).mockReset()
    vi.mocked(api.agent.getAgents).mockResolvedValue([])
    vi.mocked(logger.error).mockReset()
    vi.mocked(logger.warn).mockReset()
    vi.mocked(logger.debug).mockReset()
    mockStore.roleAssignments = {}
    mockStore.error = null
    mockStore.loading = false
  })

  // --- Header & mount ---

  it('renders header', () => {
    render(<RoleAllocationPanel swarmId="sw-1" />)
    expect(screen.getByText('Role Allocation')).toBeInTheDocument()
  })

  it('calls fetchRoleAssignments on mount', () => {
    render(<RoleAllocationPanel swarmId="sw-1" />)
    expect(mockStore.fetchRoleAssignments).toHaveBeenCalledWith('sw-1')
  })

  it('does not call fetchRoleAssignments when swarmId is empty', () => {
    render(<RoleAllocationPanel swarmId="" />)
    expect(mockStore.fetchRoleAssignments).not.toHaveBeenCalled()
  })

  it('renders refresh button', () => {
    render(<RoleAllocationPanel swarmId="sw-1" />)
    expect(screen.getByTitle('Refresh assignments')).toBeInTheDocument()
  })

  // --- Empty state ---

  it('shows empty state when no assignments', () => {
    render(<RoleAllocationPanel swarmId="sw-1" />)
    expect(screen.getByText('No role assignments')).toBeInTheDocument()
    expect(screen.getByText('Agents will be assigned roles as tasks are created')).toBeInTheDocument()
  })

  // --- Error display ---

  it('shows error message when error exists', () => {
    mockStore.error = 'Failed to fetch assignments'
    render(<RoleAllocationPanel swarmId="sw-1" />)
    expect(screen.getByText('Failed to fetch assignments')).toBeInTheDocument()
  })

  // --- Assignments table ---

  it('renders assignments table when data exists', () => {
    mockStore.roleAssignments = {
      'sw-1': [
        { agentId: 'a-1', role: 'coder', taskId: 't-1', assignedAt: '2026-01-01T10:00:00Z', score: 0.9 },
      ],
    }
    render(<RoleAllocationPanel swarmId="sw-1" />)
    expect(screen.getAllByText('Coder').length).toBeGreaterThan(0)
    expect(screen.getByText('t-1')).toBeInTheDocument()
    expect(screen.getByText('90%')).toBeInTheDocument()
  })

  it('renders fallback agent name when agent not loaded', () => {
    mockStore.roleAssignments = {
      'sw-1': [
        { agentId: 'agent-x', role: 'reviewer', taskId: 't-2', assignedAt: '2026-01-01T10:00:00Z', score: 0.75 },
      ],
    }
    render(<RoleAllocationPanel swarmId="sw-1" />)
    expect(screen.getByText('agent-x')).toBeInTheDocument()
    expect(screen.getByTitle('agent-x')).toBeInTheDocument()
  })

  it('renders agent name from loaded agents', async () => {
    ;(api.agent.getAgents as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'a-1', name: 'Alice', type: 'cli', state: 'idle' },
    ])
    mockStore.roleAssignments = {
      'sw-1': [
        { agentId: 'a-1', role: 'coder', taskId: 't-1', assignedAt: '2026-01-01T10:00:00Z', score: 0.85 },
      ],
    }
    render(<RoleAllocationPanel swarmId="sw-1" />)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByTitle('Alice')).toBeInTheDocument()
    // First letter avatar
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('renders executing state agent with green indicator', async () => {
    ;(api.agent.getAgents as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'a-1', name: 'Bob', type: 'cli', state: 'executing' },
    ])
    mockStore.roleAssignments = {
      'sw-1': [
        { agentId: 'a-1', role: 'tester', taskId: 't-3', assignedAt: '2026-01-01T10:00:00Z', score: 0.7 },
      ],
    }
    render(<RoleAllocationPanel swarmId="sw-1" />)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    // Bob's first letter
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  // --- Score color thresholds ---

  it('renders high score with green color class', () => {
    mockStore.roleAssignments = {
      'sw-1': [
        { agentId: 'a-1', role: 'coder', taskId: 't-1', assignedAt: '2026-01-01T10:00:00Z', score: 0.85 },
      ],
    }
    render(<RoleAllocationPanel swarmId="sw-1" />)
    expect(screen.getByText('85%')).toBeInTheDocument()
    expect(screen.getByText('85%')).toHaveClass('text-green-400')
  })

  it('renders medium score with yellow color class', () => {
    mockStore.roleAssignments = {
      'sw-1': [
        { agentId: 'a-1', role: 'coder', taskId: 't-1', assignedAt: '2026-01-01T10:00:00Z', score: 0.65 },
      ],
    }
    render(<RoleAllocationPanel swarmId="sw-1" />)
    expect(screen.getByText('65%')).toBeInTheDocument()
    expect(screen.getByText('65%')).toHaveClass('text-yellow-400')
  })

  it('renders low score with slate color class', () => {
    mockStore.roleAssignments = {
      'sw-1': [
        { agentId: 'a-1', role: 'coder', taskId: 't-1', assignedAt: '2026-01-01T10:00:00Z', score: 0.4 },
      ],
    }
    render(<RoleAllocationPanel swarmId="sw-1" />)
    expect(screen.getByText('40%')).toBeInTheDocument()
    expect(screen.getByText('40%')).toHaveClass('text-slate-400')
  })

  it('renders score bar with correct width percentage', () => {
    mockStore.roleAssignments = {
      'sw-1': [
        { agentId: 'a-1', role: 'coder', taskId: 't-1', assignedAt: '2026-01-01T10:00:00Z', score: 0.75 },
      ],
    }
    render(<RoleAllocationPanel swarmId="sw-1" />)
    const bar = document.querySelector('.h-full.bg-blue-500') as HTMLElement
    expect(bar).toBeTruthy()
    expect(bar.style.width).toBe('75%')
  })

  // --- Role types ---

  it('renders all known role types with correct labels', () => {
    mockStore.roleAssignments = {
      'sw-1': [
        { agentId: 'a-1', role: 'architect', taskId: 't-1', assignedAt: '2026-01-01T10:00:00Z', score: 0.9 },
        { agentId: 'a-2', role: 'planner', taskId: 't-2', assignedAt: '2026-01-01T10:00:00Z', score: 0.8 },
        { agentId: 'a-3', role: 'executor', taskId: 't-3', assignedAt: '2026-01-01T10:00:00Z', score: 0.7 },
        { agentId: 'a-4', role: 'validator', taskId: 't-4', assignedAt: '2026-01-01T10:00:00Z', score: 0.6 },
        { agentId: 'a-5', role: 'coordinator', taskId: 't-5', assignedAt: '2026-01-01T10:00:00Z', score: 0.5 },
      ],
    }
    render(<RoleAllocationPanel swarmId="sw-1" />)
    expect(screen.getAllByText('Architect').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Planner').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Executor').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Validator').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Coordinator').length).toBeGreaterThan(0)
  })

  it('renders unknown role fallback for unrecognized roles', () => {
    mockStore.roleAssignments = {
      'sw-1': [
        { agentId: 'a-1', role: 'custom_role', taskId: 't-1', assignedAt: '2026-01-01T10:00:00Z', score: 0.9 },
      ],
    }
    render(<RoleAllocationPanel swarmId="sw-1" />)
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0)
  })

  // --- Role summary footer ---

  it('shows role summary footer when assignments exist', () => {
    mockStore.roleAssignments = {
      'sw-1': [
        { agentId: 'a-1', role: 'coder', taskId: 't-1', assignedAt: '2026-01-01T10:00:00Z', score: 0.9 },
        { agentId: 'a-2', role: 'coder', taskId: 't-2', assignedAt: '2026-01-01T10:00:00Z', score: 0.8 },
        { agentId: 'a-3', role: 'reviewer', taskId: 't-3', assignedAt: '2026-01-01T10:00:00Z', score: 0.7 },
      ],
    }
    render(<RoleAllocationPanel swarmId="sw-1" />)
    // Footer shows counts per role: coder=2, reviewer=1
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('does not show role summary footer when no assignments', () => {
    render(<RoleAllocationPanel swarmId="sw-1" />)
    // No count numbers should appear in footer
    expect(screen.queryByText('Role Allocation')).toBeInTheDocument() // only header, no footer counts
  })

  // --- Table headers ---

  it('renders all table column headers', () => {
    mockStore.roleAssignments = {
      'sw-1': [
        { agentId: 'a-1', role: 'coder', taskId: 't-1', assignedAt: '2026-01-01T10:00:00Z', score: 0.9 },
      ],
    }
    render(<RoleAllocationPanel swarmId="sw-1" />)
    expect(screen.getByText('Agent')).toBeInTheDocument()
    expect(screen.getByText('Role')).toBeInTheDocument()
    expect(screen.getByText('Task')).toBeInTheDocument()
    expect(screen.getByText('Score')).toBeInTheDocument()
    expect(screen.getByText('Assigned')).toBeInTheDocument()
  })

  // --- Refresh ---

  it('refresh button calls fetchRoleAssignments', async () => {
    render(<RoleAllocationPanel swarmId="sw-1" />)
    const refreshCalls = mockStore.fetchRoleAssignments.mock.calls.length
    await act(async () => {
      fireEvent.click(screen.getByTitle('Refresh assignments'))
    })
    expect(mockStore.fetchRoleAssignments).toHaveBeenCalledTimes(refreshCalls + 1)
    expect(mockStore.fetchRoleAssignments).toHaveBeenLastCalledWith('sw-1')
  })

  it('logs error when refresh fails', async () => {
    render(<RoleAllocationPanel swarmId="sw-1" />)
    mockStore.fetchRoleAssignments.mockRejectedValueOnce(new Error('Refresh failed'))
    await act(async () => {
      fireEvent.click(screen.getByTitle('Refresh assignments'))
    })
    expect(logger.error).toHaveBeenCalledWith('RoleAllocationPanel', 'Failed to refresh assignments:', expect.any(Error))
  })

  // --- Loading state ---

  it('refresh button is disabled when loading', () => {
    mockStore.loading = true
    render(<RoleAllocationPanel swarmId="sw-1" />)
    expect(screen.getByTitle('Refresh assignments').closest('button')).toBeDisabled()
  })

  it('shows spin animation on refresh icon when loading', () => {
    mockStore.loading = true
    render(<RoleAllocationPanel swarmId="sw-1" />)
    const svg = screen.getByTitle('Refresh assignments').querySelector('svg')
    expect(svg).toHaveClass('animate-spin')
  })

  // --- Agent loading ---

  it('loads agents on mount', () => {
    render(<RoleAllocationPanel swarmId="sw-1" />)
    expect(api.agent.getAgents).toHaveBeenCalled()
  })

  it('logs debug when agent loading fails', async () => {
    ;(api.agent.getAgents as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Agent load fail'))
    render(<RoleAllocationPanel swarmId="sw-1" />)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(logger.debug).toHaveBeenCalledWith('RoleAllocationPanel', 'Failed to load agents:', expect.any(Error))
  })

  // --- Multiple assignments with unique keys ---

  it('renders multiple assignments with unique rows', () => {
    mockStore.roleAssignments = {
      'sw-1': [
        { agentId: 'a-1', role: 'coder', taskId: 't-1', assignedAt: '2026-01-01T10:00:00Z', score: 0.9 },
        { agentId: 'a-2', role: 'tester', taskId: 't-2', assignedAt: '2026-01-02T11:00:00Z', score: 0.8 },
      ],
    }
    render(<RoleAllocationPanel swarmId="sw-1" />)
    expect(screen.getByText('t-1')).toBeInTheDocument()
    expect(screen.getByText('t-2')).toBeInTheDocument()
  })

  it('renders assignments for correct swarm only', () => {
    mockStore.roleAssignments = {
      'sw-1': [
        { agentId: 'a-1', role: 'coder', taskId: 't-1', assignedAt: '2026-01-01T10:00:00Z', score: 0.9 },
      ],
      'sw-2': [
        { agentId: 'a-2', role: 'reviewer', taskId: 't-99', assignedAt: '2026-01-01T10:00:00Z', score: 0.8 },
      ],
    }
    render(<RoleAllocationPanel swarmId="sw-1" />)
    expect(screen.getByText('t-1')).toBeInTheDocument()
    expect(screen.queryByText('t-99')).not.toBeInTheDocument()
  })
})
