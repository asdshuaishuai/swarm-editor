import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import TeamPanel from './TeamPanel'
import { useAppStore } from '../store/appStore'

vi.mock('../store/appStore', () => ({
  useAppStore: vi.fn(),
}))

describe('TeamPanel', () => {
  const mockSetActiveTeam = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        teams: [],
        activeTeam: null,
        setActiveTeam: mockSetActiveTeam,
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

  it('shows empty state when no teams', () => {
    render(<TeamPanel />)
    expect(screen.getByText('No teams created')).toBeInTheDocument()
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

  it('has team name input in create modal', () => {
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('New Team'))
    expect(screen.getByPlaceholderText('My Team')).toBeInTheDocument()
  })

  it('closes modal on Create Team click', () => {
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('New Team'))
    fireEvent.click(screen.getByRole('button', { name: 'Create Team' }))
    expect(screen.queryByText('Create New Team')).not.toBeInTheDocument()
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
      }
      return selector ? selector(state) : state
    })
  })

  it('shows team cards', () => {
    render(<TeamPanel />)
    expect(screen.getByText('Test Team')).toBeInTheDocument()
    expect(screen.getByText('A test team')).toBeInTheDocument()
  })

  it('shows team stats', () => {
    render(<TeamPanel />)
    expect(screen.getByText('5 members')).toBeInTheDocument()
    expect(screen.getByText('3 agents')).toBeInTheDocument()
    expect(screen.getByText('2 online')).toBeInTheDocument()
    expect(screen.getByText('1 idle agents')).toBeInTheDocument()
    expect(screen.getByText('4 workspaces')).toBeInTheDocument()
  })

  it('selects team when card clicked', () => {
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('Test Team'))
    expect(mockSetActiveTeam).toHaveBeenCalledWith(mockTeam)
  })

  it('expands team card to show members', () => {
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('Test Team'))
    expect(screen.getByText('MEMBERS')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('shows action buttons when expanded', () => {
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('Test Team'))
    expect(screen.getByText('Invite')).toBeInTheDocument()
    expect(screen.getByText('Workspaces')).toBeInTheDocument()
    expect(screen.getByText('Assign Agent')).toBeInTheDocument()
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
      }
      return selector ? selector(state) : state
    })
  })

  it('displays member names', () => {
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('Team'))
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Charlie')).toBeInTheDocument()
  })

  it('displays member roles', () => {
    render(<TeamPanel />)
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

  it('shows active styling when team is selected', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        teams: [mockTeam],
        activeTeam: mockTeam,
        setActiveTeam: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<TeamPanel />)
    // Find the card container (has rounded-lg class)
    const teamCard = screen.getByText('Active Team').closest('.rounded-lg')
    expect(teamCard).toHaveClass('border-accent')
    expect(teamCard).toHaveClass('bg-accent/10')
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
      }
      return selector ? selector(state) : state
    })
  })

  it('shows +N more members button when more than 5 members', () => {
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('Large Team'))
    expect(screen.getByText('+2 more members')).toBeInTheDocument()
  })

  it('shows only first 5 members', () => {
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('Large Team'))
    expect(screen.getByText('Member 1')).toBeInTheDocument()
    expect(screen.getByText('Member 5')).toBeInTheDocument()
    // Member 6 and 7 should not be visible individually
    expect(screen.queryByText('Member 6')).not.toBeInTheDocument()
    expect(screen.queryByText('Member 7')).not.toBeInTheDocument()
  })
})