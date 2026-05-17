import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import TeamPanel from './TeamPanel'
import { useAppStore } from '../store/appStore'

vi.mock('../store/appStore', () => ({
  useAppStore: vi.fn(),
}))

vi.mock('../services', () => ({
  api: {
    team: {
      getTeams: vi.fn().mockResolvedValue([]),
      createTeam: vi.fn().mockResolvedValue({
        id: 'team-new',
        name: 'Test Team',
        ownerId: 'local-user',
        members: [],
        agents: [],
        createdAt: new Date().toISOString(),
      }),
      addAgentToTeam: vi.fn().mockResolvedValue({ status: 'ok' }),
    },
    agent: {
      getAgents: vi.fn().mockResolvedValue([
        { id: 'agent-1', name: 'Claude Code', type: 'coder', state: 'idle' },
        { id: 'agent-2', name: 'Kimi Code', type: 'coder', state: 'running' },
      ]),
    },
  },
}))

describe('TeamPanel', () => {
  const mockSetActiveTeam = vi.fn()
  const mockAddTeam = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        teams: [],
        activeTeam: null,
        setActiveTeam: mockSetActiveTeam,
        addTeam: mockAddTeam,
        agents: [],
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('renders header with title', () => {
    render(<TeamPanel />)
    expect(screen.getByText('Teams')).toBeInTheDocument()
  })

  it('renders New Team button', () => {
    render(<TeamPanel />)
    expect(screen.getByText('New Team')).toBeInTheDocument()
  })

  it('shows empty state when no teams', async () => {
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('No teams created')).toBeInTheDocument()
    })
    expect(screen.getByText('Create a team to collaborate with others')).toBeInTheDocument()
  })

  it('opens create modal when New Team clicked', () => {
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('New Team'))
    expect(screen.getByText('Create New Team')).toBeInTheDocument()
  })

  it('closes modal when Cancel clicked', () => {
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('New Team'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Create New Team')).not.toBeInTheDocument()
  })

  it('closes modal when X button clicked', () => {
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('New Team'))
    // Find the X button in the modal header
    const closeButton = document.querySelector('.hover\\:bg-card-hover.rounded-mac.transition-colors')
    expect(closeButton).toBeTruthy()
    fireEvent.click(closeButton!)
    expect(screen.queryByText('Create New Team')).not.toBeInTheDocument()
  })

  it('has team name input in create modal', () => {
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('New Team'))
    expect(screen.getByPlaceholderText('My Team')).toBeInTheDocument()
  })

  it('closes modal on Create Team click', async () => {
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('New Team'))
    const input = screen.getByPlaceholderText('My Team')
    fireEvent.change(input, { target: { value: 'Test Team' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Team' }))
    await waitFor(() => {
      expect(screen.queryByText('Create New Team')).not.toBeInTheDocument()
    })
  })

  it('does not create team with empty name', () => {
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('New Team'))
    // Try to create without entering a name
    fireEvent.click(screen.getByRole('button', { name: 'Create Team' }))
    // Modal should still be open (team not created)
    expect(screen.getByText('Create New Team')).toBeInTheDocument()
  })

  it('updates team name input', () => {
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('New Team'))
    const input = screen.getByPlaceholderText('My Team')
    fireEvent.change(input, { target: { value: 'My New Team' } })
    expect(input).toHaveValue('My New Team')
  })
})

describe('TeamPanel with teams', () => {
  const mockSetActiveTeam = vi.fn()
  const mockTeam = {
    id: '1',
    name: 'Test Team',
    description: 'A test team',
    members: [
      { id: '1', name: 'Alice', role: 'owner' as const, online: true },
      { id: '2', name: 'Bob', role: 'developer' as const, online: false },
    ],
    stats: {
      memberCount: 5,
      agentCount: 3,
      onlineMembers: 2,
      idleAgents: 1,
      workspaceCount: 4,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        teams: [mockTeam],
        activeTeam: null,
        setActiveTeam: mockSetActiveTeam,
        agents: [],
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('shows team cards', async () => {
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument()
    })
    expect(screen.getByText('A test team')).toBeInTheDocument()
  })

  it('shows team stats', async () => {
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('5 members')).toBeInTheDocument()
    })
    expect(screen.getByText('3 agents')).toBeInTheDocument()
    expect(screen.getByText('2 online')).toBeInTheDocument()
    expect(screen.getByText('1 idle')).toBeInTheDocument()
    expect(screen.getByText('4 workspaces')).toBeInTheDocument()
  })

  it('selects team when card clicked', async () => {
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Test Team'))
    expect(mockSetActiveTeam).toHaveBeenCalledWith(mockTeam)
  })

  it('expands team card to show members', async () => {
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Test Team'))
    expect(screen.getByText('Members')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('shows action buttons when expanded', async () => {
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Test Team'))
    expect(screen.getByText('Assign Agent')).toBeInTheDocument()
    expect(screen.getByText('Delete Team')).toBeInTheDocument()
  })

  it('opens assign agent modal when Assign Agent clicked', async () => {
    const mockAddToast = vi.fn()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        teams: [mockTeam],
        activeTeam: null,
        setActiveTeam: mockSetActiveTeam,
        agents: [],
        addToast: mockAddToast,
      }
      return selector ? selector(state) : state
    })
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Test Team'))
    fireEvent.click(screen.getByText('Assign Agent'))
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Assign Agent to Team' })).toBeInTheDocument()
    })
  })

  it('shows available agents in assign modal', async () => {
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Test Team'))
    fireEvent.click(screen.getByText('Assign Agent'))
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Assign Agent to Team' })).toBeInTheDocument()
    })
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    expect(screen.getByText('Kimi Code')).toBeInTheDocument()
  })

  it('closes assign agent modal when Close clicked', async () => {
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Test Team'))
    fireEvent.click(screen.getByText('Assign Agent'))
    await waitFor(() => {
      expect(screen.getByText('Claude Code')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Close'))
    expect(screen.queryByText('Claude Code')).not.toBeInTheDocument()
  })

  it('assigns agent when Add clicked', async () => {
    const { api } = await import('../services')
    const mockAddToast = vi.fn()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        teams: [mockTeam],
        activeTeam: null,
        setActiveTeam: mockSetActiveTeam,
        agents: [],
        addToast: mockAddToast,
      }
      return selector ? selector(state) : state
    })
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Test Team'))
    fireEvent.click(screen.getByText('Assign Agent'))
    await waitFor(() => {
      expect(screen.getByText('Claude Code')).toBeInTheDocument()
    })
    const addButtons = screen.getAllByText('Add')
    fireEvent.click(addButtons[0])
    await waitFor(() => {
      expect(api.team.addAgentToTeam).toHaveBeenCalledWith('1', 'agent-1')
    })
    expect(mockAddToast).toHaveBeenCalledWith('success', 'Agent assigned', 'Agent added to team successfully')
  })
})

describe('MemberRow', () => {
  const mockTeam = {
    id: '1',
    name: 'Team',
    description: '',
    members: [
      { id: '1', name: 'Alice', role: 'owner' as const, online: true },
      { id: '2', name: 'Bob', role: 'developer' as const, online: false },
      { id: '3', name: 'Charlie', role: 'admin' as const, online: true },
      { id: '4', name: 'Diana', role: 'reviewer' as const, online: false },
      { id: '5', name: 'Eve', role: 'observer' as const, online: true },
    ],
    stats: {
      memberCount: 5,
      agentCount: 0,
      onlineMembers: 3,
      idleAgents: 0,
      workspaceCount: 0,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        teams: [mockTeam],
        activeTeam: null,
        setActiveTeam: vi.fn(),
        agents: [],
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('displays member names', async () => {
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Team'))
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Charlie')).toBeInTheDocument()
  })

  it('displays member roles', async () => {
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Team'))
    expect(screen.getByText('owner')).toBeInTheDocument()
    expect(screen.getByText('developer')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('reviewer')).toBeInTheDocument()
    expect(screen.getByText('observer')).toBeInTheDocument()
  })
})

describe('TeamCard with active state', () => {
  const mockTeam = {
    id: '1',
    name: 'Active Team',
    description: 'An active team',
    members: [],
    stats: {
      memberCount: 1,
      agentCount: 0,
      onlineMembers: 0,
      idleAgents: 0,
      workspaceCount: 0,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows active styling when team is selected', async () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        teams: [mockTeam],
        activeTeam: mockTeam,
        setActiveTeam: vi.fn(),
        agents: [],
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Active Team')).toBeInTheDocument()
    })
    const teamCard = screen.getByText('Active Team').closest('.rounded-mac-xl')
    expect(teamCard).toHaveClass('border-accent')
    expect(teamCard).toHaveClass('bg-accent-muted')
  })
})

describe('TeamCard with many members', () => {
  const mockTeamWithManyMembers = {
    id: '1',
    name: 'Large Team',
    description: 'A team with many members',
    members: [
      { id: '1', name: 'Member 1', role: 'owner' as const, online: true },
      { id: '2', name: 'Member 2', role: 'developer' as const, online: false },
      { id: '3', name: 'Member 3', role: 'developer' as const, online: true },
      { id: '4', name: 'Member 4', role: 'developer' as const, online: false },
      { id: '5', name: 'Member 5', role: 'developer' as const, online: true },
      { id: '6', name: 'Member 6', role: 'developer' as const, online: false },
      { id: '7', name: 'Member 7', role: 'observer' as const, online: true },
    ],
    stats: {
      memberCount: 7,
      agentCount: 0,
      onlineMembers: 4,
      idleAgents: 0,
      workspaceCount: 0,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        teams: [mockTeamWithManyMembers],
        activeTeam: null,
        setActiveTeam: vi.fn(),
        agents: [],
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('shows +N more members button when more than 5 members', async () => {
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Large Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Large Team'))
    expect(screen.getByText('+2 more members')).toBeInTheDocument()
  })

  it('shows only first 5 members', async () => {
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Large Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Large Team'))
    expect(screen.getByText('Member 1')).toBeInTheDocument()
    expect(screen.getByText('Member 5')).toBeInTheDocument()
    expect(screen.queryByText('Member 6')).not.toBeInTheDocument()
    expect(screen.queryByText('Member 7')).not.toBeInTheDocument()
  })
})