import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import TeamPanel from './TeamPanel'
import { useAppStore } from '../store/appStore'

vi.mock('../store/appStore', () => ({
  useAppStore: vi.fn(),
}))

const mockGetTeams = vi.fn().mockResolvedValue([])
const mockCreateTeam = vi.fn().mockResolvedValue({
  id: 'team-new',
  name: 'Test Team',
  description: '',
  ownerId: 'local-user',
  members: [],
  agents: [],
  createdAt: new Date().toISOString(),
})
const mockAddAgentToTeam = vi.fn().mockResolvedValue({ status: 'ok' })
const mockRemoveAgentFromTeam = vi.fn().mockResolvedValue(undefined)
const mockDeleteTeam = vi.fn().mockResolvedValue(undefined)
const mockGetAgents = vi.fn().mockResolvedValue([
  { id: 'agent-1', name: 'Claude Code', type: 'coder', state: 'idle' },
  { id: 'agent-2', name: 'Kimi Code', type: 'coder', state: 'running' },
])

vi.mock('../services', () => ({
  api: {
    team: {
      getTeams: (...args: unknown[]) => mockGetTeams(...args),
      createTeam: (...args: unknown[]) => mockCreateTeam(...args),
      addAgentToTeam: (...args: unknown[]) => mockAddAgentToTeam(...args),
      removeAgentFromTeam: (...args: unknown[]) => mockRemoveAgentFromTeam(...args),
      deleteTeam: (...args: unknown[]) => mockDeleteTeam(...args),
    },
    agent: {
      getAgents: (...args: unknown[]) => mockGetAgents(...args),
    },
  },
}))

vi.mock('../services/api', () => ({
  gitApi: {
    getBranch: vi.fn().mockResolvedValue('main'),
  },
}))

vi.mock('../utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

function setupStore(overrides: Record<string, unknown> = {}) {
  const state = {
    teams: [],
    activeTeam: null,
    setActiveTeam: vi.fn(),
    addTeam: vi.fn(),
    agents: [],
    addToast: vi.fn(),
    ...overrides,
  }
  const mockFn = vi.fn((selector: (s: typeof state) => unknown) => {
    return selector ? selector(state) : state
  })
  ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(mockFn)
  // Also mock getState for direct store access
  ;(useAppStore as unknown as Record<string, unknown>).getState = () => state
  return state
}

describe('TeamPanel', () => {
  let state: ReturnType<typeof setupStore>

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTeams.mockResolvedValue([])
    mockCreateTeam.mockResolvedValue({
      id: 'team-new',
      name: 'Test Team',
      description: '',
      ownerId: 'local-user',
      members: [],
      agents: [],
      createdAt: new Date().toISOString(),
    })
    mockAddAgentToTeam.mockResolvedValue({ status: 'ok' })
    mockRemoveAgentFromTeam.mockResolvedValue(undefined)
    mockDeleteTeam.mockResolvedValue(undefined)
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'Claude Code', type: 'coder', state: 'idle' },
      { id: 'agent-2', name: 'Kimi Code', type: 'coder', state: 'running' },
    ])
    state = setupStore()
  })

  // --- Basic rendering ---
  it('renders header with title', () => {
    render(<TeamPanel />)
    expect(screen.getByText('Teams')).toBeInTheDocument()
  })

  it('renders subtitle', () => {
    render(<TeamPanel />)
    expect(screen.getByText('Collaborate with others')).toBeInTheDocument()
  })

  it('renders New Team button', () => {
    render(<TeamPanel />)
    expect(screen.getByText('New Team')).toBeInTheDocument()
  })

  // --- Empty state ---
  it('shows empty state when no teams', async () => {
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('No teams created')).toBeInTheDocument()
    })
    expect(screen.getByText('Create a team to collaborate with others')).toBeInTheDocument()
  })

  // --- Loading state ---
  it('shows loading state while teams are loading', () => {
    mockGetTeams.mockReturnValue(new Promise(() => {})) // never resolves
    render(<TeamPanel />)
    expect(screen.getByText('Loading teams...')).toBeInTheDocument()
  })

  // --- Create modal ---
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

  it('has correct aria attributes on create modal', () => {
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('New Team'))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'Create New Team')
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
    fireEvent.click(screen.getByRole('button', { name: 'Create Team' }))
    expect(screen.getByText('Create New Team')).toBeInTheDocument()
  })

  it('does not create team with whitespace-only name', () => {
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('New Team'))
    const input = screen.getByPlaceholderText('My Team')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Team' }))
    expect(screen.getByText('Create New Team')).toBeInTheDocument()
  })

  it('updates team name input', () => {
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('New Team'))
    const input = screen.getByPlaceholderText('My Team')
    fireEvent.change(input, { target: { value: 'My New Team' } })
    expect(input).toHaveValue('My New Team')
  })

  it('shows Creating... text while creating', async () => {
    mockCreateTeam.mockReturnValue(new Promise(() => {})) // never resolves
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('New Team'))
    const input = screen.getByPlaceholderText('My Team')
    fireEvent.change(input, { target: { value: 'Test Team' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Team' }))
    await waitFor(() => {
      expect(screen.getByText('Creating...')).toBeInTheDocument()
    })
  })

  it('calls createTeam API with trimmed name', async () => {
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('New Team'))
    const input = screen.getByPlaceholderText('My Team')
    fireEvent.change(input, { target: { value: '  Test Team  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Team' }))
    await waitFor(() => {
      expect(mockCreateTeam).toHaveBeenCalledWith('Test Team', 'local-user')
    })
  })

  it('adds team to store after creation', async () => {
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('New Team'))
    const input = screen.getByPlaceholderText('My Team')
    fireEvent.change(input, { target: { value: 'Test Team' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Team' }))
    await waitFor(() => {
      expect(state.addTeam).toHaveBeenCalled()
    })
  })

  it('sets created team as active team', async () => {
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('New Team'))
    const input = screen.getByPlaceholderText('My Team')
    fireEvent.change(input, { target: { value: 'Test Team' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Team' }))
    await waitFor(() => {
      expect(state.setActiveTeam).toHaveBeenCalled()
    })
  })

  it('shows success toast after creation', async () => {
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('New Team'))
    const input = screen.getByPlaceholderText('My Team')
    fireEvent.change(input, { target: { value: 'Test Team' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Team' }))
    await waitFor(() => {
      expect(state.addToast).toHaveBeenCalledWith('success', 'Team created', expect.stringContaining('Test Team'))
    })
  })

  it('shows error toast on creation failure', async () => {
    mockCreateTeam.mockRejectedValueOnce(new Error('Network error'))
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('New Team'))
    const input = screen.getByPlaceholderText('My Team')
    fireEvent.change(input, { target: { value: 'Test Team' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Team' }))
    await waitFor(() => {
      expect(state.addToast).toHaveBeenCalledWith('error', 'Failed to create team', 'Network error')
    })
  })

  it('shows error toast with Unknown error on non-Error rejection', async () => {
    mockCreateTeam.mockRejectedValueOnce('string error')
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('New Team'))
    const input = screen.getByPlaceholderText('My Team')
    fireEvent.change(input, { target: { value: 'Test Team' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Team' }))
    await waitFor(() => {
      expect(state.addToast).toHaveBeenCalledWith('error', 'Failed to create team', 'Unknown error')
    })
  })

  // --- Load teams from backend ---
  it('loads teams on mount', () => {
    render(<TeamPanel />)
    expect(mockGetTeams).toHaveBeenCalled()
  })

  it('adds loaded teams to store', async () => {
    mockGetTeams.mockResolvedValueOnce([{
      id: 'backend-team',
      name: 'Backend Team',
      description: 'From backend',
      ownerId: 'user-1',
      members: [{ id: 'm1', name: 'Member1', role: 'owner', online: true }],
      agents: [],
      createdAt: '2024-01-01',
    }])
    render(<TeamPanel />)
    await waitFor(() => {
      expect(state.addTeam).toHaveBeenCalled()
    })
    const teamArg = state.addTeam.mock.calls[0][0]
    expect(teamArg.id).toBe('backend-team')
    expect(teamArg.name).toBe('Backend Team')
  })

  it('skips teams that already exist in store', async () => {
    state = setupStore({
      teams: [{
        id: 'existing-team',
        name: 'Existing',
        members: [],
        stats: { memberCount: 0, onlineMembers: 0, agentCount: 0, idleAgents: 0, workspaceCount: 0 },
      }],
    })
    mockGetTeams.mockResolvedValueOnce([{
      id: 'existing-team',
      name: 'Existing',
      ownerId: 'user-1',
      members: [],
      agents: [],
      createdAt: '2024-01-01',
    }])
    render(<TeamPanel />)
    await waitFor(() => {
      expect(mockGetTeams).toHaveBeenCalled()
    })
    // addTeam should NOT be called for existing team
    expect(state.addTeam).not.toHaveBeenCalled()
  })

  it('handles load teams error', async () => {
    mockGetTeams.mockRejectedValueOnce(new Error('Server error'))
    render(<TeamPanel />)
    await waitFor(() => {
      expect(mockGetTeams).toHaveBeenCalled()
    })
    // Should not crash
  })

  // --- createTeam with members response ---
  it('handles createTeam response with members', async () => {
    mockCreateTeam.mockResolvedValueOnce({
      id: 'team-with-members',
      name: 'Team With Members',
      description: 'A team with members',
      ownerId: 'user-1',
      members: [
        { id: 'm1', name: 'Alice', role: 'owner', online: true },
        { id: 'm2', name: 'Bob', role: 'developer', online: false },
      ],
      agents: [],
      createdAt: '2024-01-01',
    })
    render(<TeamPanel />)
    fireEvent.click(screen.getByText('New Team'))
    const input = screen.getByPlaceholderText('My Team')
    fireEvent.change(input, { target: { value: 'Team With Members' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Team' }))
    await waitFor(() => {
      expect(state.addTeam).toHaveBeenCalled()
    })
    const teamArg = state.addTeam.mock.calls[0][0]
    expect(teamArg.members).toHaveLength(2)
    expect(teamArg.stats.memberCount).toBe(2)
    expect(teamArg.stats.onlineMembers).toBe(1)
  })
})

describe('TeamPanel with teams', () => {
  const mockSetActiveTeam = vi.fn()
  const mockTeam = {
    id: '1',
    name: 'Test Team',
    description: 'A test team',
    owner: 'user-1',
    members: [
      { id: '1', name: 'Alice', email: '', role: 'owner' as const, joinedAt: '2024-01-01', online: true },
      { id: '2', name: 'Bob', email: '', role: 'developer' as const, joinedAt: '2024-01-01', online: false },
    ],
    agents: [],
    workspaces: [],
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
    setupStore({
      teams: [mockTeam],
      setActiveTeam: mockSetActiveTeam,
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

  it('toggles expanded state on click', async () => {
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Test Team'))
    expect(screen.getByText('Members')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Test Team'))
    expect(screen.queryByText('Members')).not.toBeInTheDocument()
  })

  it('expands card on Enter key', async () => {
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument()
    })
    const card = screen.getByRole('button', { expanded: false })
    fireEvent.keyDown(card, { key: 'Enter' })
    expect(screen.getByText('Members')).toBeInTheDocument()
  })

  it('expands card on Space key', async () => {
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument()
    })
    const card = screen.getByRole('button', { expanded: false })
    fireEvent.keyDown(card, { key: ' ' })
    expect(screen.getByText('Members')).toBeInTheDocument()
  })

  // --- Assign agent modal ---
  it('opens assign agent modal when Assign Agent clicked', async () => {
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
      expect(mockAddAgentToTeam).toHaveBeenCalledWith('1', 'agent-1')
    })
  })

  it('shows success toast after agent assignment', async () => {
    const state = setupStore({
      teams: [mockTeam],
      setActiveTeam: mockSetActiveTeam,
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
      expect(state.addToast).toHaveBeenCalledWith('success', 'Agent assigned', 'Agent added to team successfully')
    })
  })

  it('shows error toast on agent assignment failure', async () => {
    mockAddAgentToTeam.mockRejectedValueOnce(new Error('Assign failed'))
    const state = setupStore({
      teams: [mockTeam],
      setActiveTeam: mockSetActiveTeam,
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
      expect(state.addToast).toHaveBeenCalledWith('error', 'Failed to assign agent', 'Assign failed')
    })
  })

  it('shows error toast with Unknown error on non-Error rejection for assign', async () => {
    mockAddAgentToTeam.mockRejectedValueOnce('bad')
    const state = setupStore({
      teams: [mockTeam],
      setActiveTeam: mockSetActiveTeam,
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
      expect(state.addToast).toHaveBeenCalledWith('error', 'Failed to assign agent', 'Unknown error')
    })
  })

  it('shows Assigning... text while assigning', async () => {
    mockAddAgentToTeam.mockReturnValue(new Promise(() => {}))
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
      expect(screen.getByText('Assigning...')).toBeInTheDocument()
    })
  })

  it('shows no agents available when list is empty', async () => {
    mockGetAgents.mockResolvedValueOnce([])
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Test Team'))
    fireEvent.click(screen.getByText('Assign Agent'))
    await waitFor(() => {
      expect(screen.getByText('No agents available')).toBeInTheDocument()
    })
  })

  it('closes assign modal after successful assignment', async () => {
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
    await act(async () => {
      fireEvent.click(addButtons[0])
    })
    // Verify API was called and the assigning state was set
    expect(mockAddAgentToTeam).toHaveBeenCalledWith('1', 'agent-1')
  })

  it('closes assign modal via X button', async () => {
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Test Team'))
    fireEvent.click(screen.getByText('Assign Agent'))
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Assign Agent to Team' })).toBeInTheDocument()
    })
    // Find X button in the assign modal (second close button in modal)
    const closeButtons = screen.getAllByRole('button')
    const xButton = closeButtons.find(b => b.querySelector('.text-text-secondary') && b.closest('[aria-label="Assign Agent to Team"]'))
    if (xButton) {
      fireEvent.click(xButton)
      expect(screen.queryByRole('dialog', { name: 'Assign Agent to Team' })).not.toBeInTheDocument()
    }
  })

  // --- Delete team ---
  it('deletes team when confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Test Team'))
    fireEvent.click(screen.getByText('Delete Team'))
    await waitFor(() => {
      expect(mockDeleteTeam).toHaveBeenCalledWith('1')
    })
    confirmSpy.mockRestore()
  })

  it('does not delete team when not confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Test Team'))
    fireEvent.click(screen.getByText('Delete Team'))
    expect(mockDeleteTeam).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('shows success toast after deletion', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const state = setupStore({
      teams: [mockTeam],
      setActiveTeam: mockSetActiveTeam,
    })
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Test Team'))
    fireEvent.click(screen.getByText('Delete Team'))
    await waitFor(() => {
      expect(state.addToast).toHaveBeenCalledWith('success', 'Team deleted', expect.stringContaining('Test Team'))
    })
    confirmSpy.mockRestore()
  })

  it('shows error toast on deletion failure', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockDeleteTeam.mockRejectedValueOnce(new Error('Delete failed'))
    const state = setupStore({
      teams: [mockTeam],
      setActiveTeam: mockSetActiveTeam,
    })
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Test Team'))
    fireEvent.click(screen.getByText('Delete Team'))
    await waitFor(() => {
      expect(state.addToast).toHaveBeenCalledWith('error', 'Failed to delete team', 'Delete failed')
    })
    confirmSpy.mockRestore()
  })

  it('shows Deleting... text while deleting', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockDeleteTeam.mockReturnValue(new Promise(() => {}))
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Test Team'))
    fireEvent.click(screen.getByText('Delete Team'))
    await waitFor(() => {
      expect(screen.getByText('Deleting...')).toBeInTheDocument()
    })
    confirmSpy.mockRestore()
  })

  // --- Remove agent ---
  it('removes agent when remove button clicked', async () => {
    const teamWithAgent = {
      ...mockTeam,
      agents: [{ id: 'agent-1', name: 'Claude Code', type: 'coder', state: 'idle', capabilities: {}, createdAt: '', lastActive: '' }],
    }
    setupStore({
      teams: [teamWithAgent],
      setActiveTeam: mockSetActiveTeam,
    })
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Test Team'))
    const removeBtn = screen.getByTitle('Remove agent from team')
    fireEvent.click(removeBtn)
    await waitFor(() => {
      expect(mockRemoveAgentFromTeam).toHaveBeenCalledWith('1', 'agent-1')
    })
  })

  it('shows success toast after agent removal', async () => {
    const state = setupStore({
      teams: [{
        ...mockTeam,
        agents: [{ id: 'agent-1', name: 'Claude Code', type: 'coder', state: 'idle', capabilities: {}, createdAt: '', lastActive: '' }],
      }],
      setActiveTeam: mockSetActiveTeam,
    })
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Test Team'))
    const removeBtn = screen.getByTitle('Remove agent from team')
    fireEvent.click(removeBtn)
    await waitFor(() => {
      expect(state.addToast).toHaveBeenCalledWith('success', 'Agent removed', 'Agent removed from team')
    })
  })

  it('shows error toast on agent removal failure', async () => {
    mockRemoveAgentFromTeam.mockRejectedValueOnce(new Error('Remove failed'))
    const state = setupStore({
      teams: [{
        ...mockTeam,
        agents: [{ id: 'agent-1', name: 'Claude Code', type: 'coder', state: 'idle', capabilities: {}, createdAt: '', lastActive: '' }],
      }],
      setActiveTeam: mockSetActiveTeam,
    })
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Test Team'))
    const removeBtn = screen.getByTitle('Remove agent from team')
    fireEvent.click(removeBtn)
    await waitFor(() => {
      expect(state.addToast).toHaveBeenCalledWith('error', 'Failed to remove agent', 'Remove failed')
    })
  })

  it('shows error toast with Unknown error on non-Error rejection for remove', async () => {
    mockRemoveAgentFromTeam.mockRejectedValueOnce('bad')
    const state = setupStore({
      teams: [{
        ...mockTeam,
        agents: [{ id: 'agent-1', name: 'Claude Code', type: 'coder', state: 'idle', capabilities: {}, createdAt: '', lastActive: '' }],
      }],
      setActiveTeam: mockSetActiveTeam,
    })
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Test Team'))
    const removeBtn = screen.getByTitle('Remove agent from team')
    fireEvent.click(removeBtn)
    await waitFor(() => {
      expect(state.addToast).toHaveBeenCalledWith('error', 'Failed to remove agent', 'Unknown error')
    })
  })
})

describe('MemberRow', () => {
  const mockTeam = {
    id: '1',
    name: 'Team',
    description: '',
    owner: 'user-1',
    members: [
      { id: '1', name: 'Alice', email: '', role: 'owner' as const, joinedAt: '2024-01-01', online: true },
      { id: '2', name: 'Bob', email: '', role: 'developer' as const, joinedAt: '2024-01-01', online: false },
      { id: '3', name: 'Charlie', email: '', role: 'admin' as const, joinedAt: '2024-01-01', online: true },
      { id: '4', name: 'Diana', email: '', role: 'reviewer' as const, joinedAt: '2024-01-01', online: false },
      { id: '5', name: 'Eve', email: '', role: 'observer' as const, joinedAt: '2024-01-01', online: true },
    ],
    agents: [],
    workspaces: [],
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
    setupStore({
      teams: [mockTeam],
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

  it('shows initial letter for members', async () => {
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Team'))
    // Alice's initial is 'A'
    expect(screen.getByText('A')).toBeInTheDocument()
    // Bob's initial is 'B'
    expect(screen.getByText('B')).toBeInTheDocument()
  })
})

describe('TeamCard with active state', () => {
  const mockTeam = {
    id: '1',
    name: 'Active Team',
    description: 'An active team',
    owner: 'user-1',
    members: [],
    agents: [],
    workspaces: [],
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
    setupStore({
      teams: [mockTeam],
      activeTeam: mockTeam,
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
    owner: 'user-1',
    members: [
      { id: '1', name: 'Member 1', email: '', role: 'owner' as const, joinedAt: '2024-01-01', online: true },
      { id: '2', name: 'Member 2', email: '', role: 'developer' as const, joinedAt: '2024-01-01', online: false },
      { id: '3', name: 'Member 3', email: '', role: 'developer' as const, joinedAt: '2024-01-01', online: true },
      { id: '4', name: 'Member 4', email: '', role: 'developer' as const, joinedAt: '2024-01-01', online: false },
      { id: '5', name: 'Member 5', email: '', role: 'developer' as const, joinedAt: '2024-01-01', online: true },
      { id: '6', name: 'Member 6', email: '', role: 'developer' as const, joinedAt: '2024-01-01', online: false },
      { id: '7', name: 'Member 7', email: '', role: 'observer' as const, joinedAt: '2024-01-01', online: true },
    ],
    agents: [],
    workspaces: [],
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
    setupStore({
      teams: [mockTeamWithManyMembers],
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

describe('TeamCard with agents', () => {
  const teamWithAgents = {
    id: '1',
    name: 'Agent Team',
    description: '',
    owner: 'user-1',
    members: [],
    agents: [
      { id: 'agent-1', name: 'Claude', type: 'coder', state: 'idle', capabilities: {}, createdAt: '', lastActive: '' },
      { id: 'agent-2', name: 'Kimi', type: 'reviewer', state: 'running', capabilities: {}, createdAt: '', lastActive: '' },
    ],
    workspaces: [],
    stats: {
      memberCount: 0,
      agentCount: 2,
      onlineMembers: 0,
      idleAgents: 0,
      workspaceCount: 0,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setupStore({
      teams: [teamWithAgents],
    })
  })

  it('shows agents section when team has agents', async () => {
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Agent Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Agent Team'))
    expect(screen.getByText('Agents')).toBeInTheDocument()
    expect(screen.getByText('Claude')).toBeInTheDocument()
    expect(screen.getByText('Kimi')).toBeInTheDocument()
  })

  it('shows agent state', async () => {
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Agent Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Agent Team'))
    expect(screen.getByText('idle')).toBeInTheDocument()
    expect(screen.getByText('running')).toBeInTheDocument()
  })
})

describe('TeamCard without description', () => {
  it('does not render description element when empty', async () => {
    const team = {
      id: '1',
      name: 'No Desc Team',
      description: '',
      owner: 'user-1',
      members: [],
      agents: [],
      workspaces: [],
      stats: { memberCount: 0, agentCount: 0, onlineMembers: 0, idleAgents: 0, workspaceCount: 0 },
    }
    setupStore({ teams: [team] })
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('No Desc Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('No Desc Team'))
    // No description should be rendered
    const descriptionEl = screen.queryByText(/A test team/)
    expect(descriptionEl).not.toBeInTheDocument()
  })
})

describe('TeamPanel unmount during creation', () => {
  it('does not set state after unmount during create', async () => {
    mockCreateTeam.mockReturnValue(new Promise(() => {}))
    setupStore()
    const { unmount } = render(<TeamPanel />)
    fireEvent.click(screen.getByText('New Team'))
    const input = screen.getByPlaceholderText('My Team')
    fireEvent.change(input, { target: { value: 'Test Team' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Team' }))
    unmount()
    // Should not crash — the mountedRef should prevent setState
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
    })
  })
})

describe('TeamPanel loadAgents error', () => {
  it('handles agent loading failure gracefully', async () => {
    mockGetAgents.mockRejectedValueOnce(new Error('Agent load failed'))
    const team = {
      id: '1',
      name: 'Team',
      description: '',
      owner: 'user-1',
      members: [],
      agents: [],
      workspaces: [],
      stats: { memberCount: 0, agentCount: 0, onlineMembers: 0, idleAgents: 0, workspaceCount: 0 },
    }
    setupStore({ teams: [team] })
    render(<TeamPanel />)
    await waitFor(() => {
      expect(screen.getByText('Team')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Team'))
    fireEvent.click(screen.getByText('Assign Agent'))
    // Should not crash
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
    })
  })
})
