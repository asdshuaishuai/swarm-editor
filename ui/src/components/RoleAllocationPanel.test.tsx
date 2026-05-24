import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RoleAllocationPanel } from './RoleAllocationPanel'

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
    vi.clearAllMocks()
    mockStore.roleAssignments = {}
    mockStore.error = null
  })

  it('renders header', () => {
    render(<RoleAllocationPanel swarmId="sw-1" />)
    expect(screen.getByText('Role Allocation')).toBeInTheDocument()
  })

  it('shows empty state when no assignments', () => {
    render(<RoleAllocationPanel swarmId="sw-1" />)
    expect(screen.getByText('No role assignments')).toBeInTheDocument()
  })

  it('calls fetchRoleAssignments on mount', () => {
    render(<RoleAllocationPanel swarmId="sw-1" />)
    expect(mockStore.fetchRoleAssignments).toHaveBeenCalledWith('sw-1')
  })

  it('renders refresh button', () => {
    render(<RoleAllocationPanel swarmId="sw-1" />)
    expect(screen.getByTitle('Refresh assignments')).toBeInTheDocument()
  })

  it('shows error message when error exists', () => {
    mockStore.error = 'Failed to fetch assignments'
    render(<RoleAllocationPanel swarmId="sw-1" />)
    expect(screen.getByText('Failed to fetch assignments')).toBeInTheDocument()
  })

  it('renders assignments table when data exists', () => {
    mockStore.roleAssignments = {
      'sw-1': [
        { agentId: 'a-1', role: 'coder', taskId: 't-1', assignedAt: '2026-01-01', score: 0.9 },
      ],
    }
    render(<RoleAllocationPanel swarmId="sw-1" />)
    expect(screen.getAllByText('Coder').length).toBeGreaterThan(0)
    expect(screen.getByText('t-1')).toBeInTheDocument()
  })
})
