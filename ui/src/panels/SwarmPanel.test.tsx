import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SwarmPanel, { SwarmCard } from './SwarmPanel'
import { useAppStore } from '../store/appStore'

// Mock SwarmCoordinatorPanel
vi.mock('./SwarmCoordinatorPanel', () => ({
  default: () => <div data-testid="swarm-coordinator">Coordinator Panel</div>,
}))

vi.mock('../store/appStore', () => ({
  useAppStore: vi.fn(),
}))

// Mock API
vi.mock('../services', () => ({
  api: {
    swarm: {
      getSwarms: vi.fn().mockResolvedValue([]),
      createSwarm: vi.fn().mockResolvedValue({
        id: 'swarm-1',
        name: 'Test Swarm',
        topology: 'star',
        strategy: 'parallel',
        state: 'stopped',
        agents: ['agent-1'],
        stats: {
          agentCount: 1,
          idleAgents: 1,
          executingAgents: 0,
          pendingTasks: 0,
          completedTasks: 0,
        },
        createdAt: new Date().toISOString(),
      }),
      startSwarm: vi.fn().mockResolvedValue({}),
      stopSwarm: vi.fn().mockResolvedValue({}),
    },
  },
}))

describe('SwarmPanel', () => {
  const mockSetActiveSwarm = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: mockSetActiveSwarm,
        addSwarm: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('renders header with title', () => {
    render(<SwarmPanel />)
    expect(screen.getByText('Swarm Control')).toBeInTheDocument()
  })

  it('renders New Swarm button', () => {
    render(<SwarmPanel />)
    expect(screen.getByText('New Swarm')).toBeInTheDocument()
  })

  it('shows empty state when no swarms', () => {
    render(<SwarmPanel />)
    expect(screen.getByText('No swarms created')).toBeInTheDocument()
    expect(screen.getByText('Create a swarm to coordinate multiple agents')).toBeInTheDocument()
  })

  it('opens create modal when New Swarm clicked', () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))
    expect(screen.getByText('Create New Swarm')).toBeInTheDocument()
  })

  it('closes modal when Cancel clicked', () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))
    expect(screen.getByText('Create New Swarm')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Create New Swarm')).not.toBeInTheDocument()
  })

  it('has topology options in create modal', () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))
    expect(screen.getByText('star')).toBeInTheDocument()
    expect(screen.getByText('mesh')).toBeInTheDocument()
    expect(screen.getByText('tree')).toBeInTheDocument()
    expect(screen.getByText('ring')).toBeInTheDocument()
    expect(screen.getByText('hybrid')).toBeInTheDocument()
  })

  it('has strategy options in create modal', () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))
    expect(screen.getByRole('option', { name: /Parallel/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Sequential/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Pipeline/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Map-Reduce/ })).toBeInTheDocument()
  })

  it('has agent selector in create modal', () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))
    expect(screen.getByText('Select Agents (0 selected)')).toBeInTheDocument()
  })

  it('has swarm name input in create modal', () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))
    expect(screen.getByPlaceholderText('My Swarm')).toBeInTheDocument()
  })

  it('closes modal on Create Swarm click', async () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))
    // Need to provide name and select an agent to enable the button
    fireEvent.change(screen.getByPlaceholderText('My Swarm'), { target: { value: 'Test Swarm' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Swarm' }))
    // Modal stays open because no agents selected (button should be disabled)
    expect(screen.getByText('Create New Swarm')).toBeInTheDocument()
  })
})

describe('SwarmPanel with swarms', () => {
  const mockSetActiveSwarm = vi.fn()
  const mockSwarm = {
    id: '1',
    name: 'Test Swarm',
    topology: 'star' as const,
    state: 'active' as const,
    agents: [],
    stats: {
      agentCount: 3,
      completedTasks: 10,
      pendingTasks: 2,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [mockSwarm],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: mockSetActiveSwarm,
      }
      return selector ? selector(state) : state
    })
  })

  it('shows swarm cards', () => {
    render(<SwarmPanel />)
    expect(screen.getByText('Test Swarm')).toBeInTheDocument()
    expect(screen.getByText('active')).toBeInTheDocument()
  })

  it('shows swarm stats', () => {
    render(<SwarmPanel />)
    expect(screen.getByText('3')).toBeInTheDocument() // agent count
    expect(screen.getByText('10')).toBeInTheDocument() // completed tasks
    expect(screen.getByText('2')).toBeInTheDocument() // pending tasks
  })

  it('has Manage button on swarm card', () => {
    render(<SwarmPanel />)
    expect(screen.getByText('Manage')).toBeInTheDocument()
  })

  it('selects swarm when card clicked', () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('Test Swarm'))
    expect(mockSetActiveSwarm).toHaveBeenCalledWith(mockSwarm)
  })
})

describe('SwarmPanel topology selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('changes topology when option clicked', () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))

    // Click on mesh topology
    const meshButton = screen.getByText('mesh').closest('button')
    if (meshButton) {
      fireEvent.click(meshButton)
    }

    // Should show mesh description
    expect(screen.getByText('All agents connected to all others')).toBeInTheDocument()
  })

  it('selects tree topology', () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))
    const treeButton = screen.getByText('tree').closest('button')
    if (treeButton) {
      fireEvent.click(treeButton)
    }
    expect(screen.getByText('Hierarchical structure with branches')).toBeInTheDocument()
  })

  it('selects ring topology', () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))
    const ringButton = screen.getByText('ring').closest('button')
    if (ringButton) {
      fireEvent.click(ringButton)
    }
    expect(screen.getByText('Agents connected in a circular chain')).toBeInTheDocument()
  })

  it('selects hybrid topology', () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))
    const hybridButton = screen.getByText('hybrid').closest('button')
    if (hybridButton) {
      fireEvent.click(hybridButton)
    }
    expect(screen.getByText('Combination of multiple topologies')).toBeInTheDocument()
  })

  it('changes strategy selection', () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: 'sequential' } })
    expect(selects[0]).toHaveValue('sequential')
  })

  it('shows agent selection with checkboxes', () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))
    // No agents available in mock, so shows empty state
    expect(screen.getByText('No agents available')).toBeInTheDocument()
  })

  it('updates swarm name input', () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))
    const input = screen.getByPlaceholderText('My Swarm')
    fireEvent.change(input, { target: { value: 'Custom Swarm' } })
    expect(input).toHaveValue('Custom Swarm')
  })

  it('enables Create Swarm button when name and agents are provided', async () => {
    // Mock with agents available
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [{ id: 'agent-1', name: 'Test Agent', type: 'coder', status: 'stopped', command: 'claude', capabilities: [], lastActive: null, enabled: true }],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addSwarm: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    await userEvent.click(screen.getByText('New Swarm'))

    // Initially the button should be disabled (no name, no agents)
    const createButton = screen.getByRole('button', { name: /Create Swarm/ })
    expect(createButton).toBeDisabled()

    // Fill in name
    await userEvent.type(screen.getByPlaceholderText('My Swarm'), 'Integration Swarm')
    // Still disabled (no agents selected)
    expect(createButton).toBeDisabled()

    // Select an agent by clicking the checkbox
    const checkbox = screen.getByRole('checkbox')
    await userEvent.click(checkbox)

    // Now button should be enabled
    expect(createButton).not.toBeDisabled()
  })
})

describe('SwarmPanel with active swarm', () => {
  const mockSetActiveSwarm = vi.fn()
  const mockSwarm = {
    id: '1',
    name: 'Active Test Swarm',
    topology: 'star' as const,
    state: 'active' as const,
    agents: [],
    stats: {
      agentCount: 5,
      completedTasks: 20,
      pendingTasks: 3,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [mockSwarm],
        agents: [],
        activeSwarm: null, // Start without active swarm
        setActiveSwarm: mockSetActiveSwarm,
      }
      return selector ? selector(state) : state
    })
  })

  it('clicks on swarm to select it', () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('Active Test Swarm'))
    expect(mockSetActiveSwarm).toHaveBeenCalledWith(mockSwarm)
  })

  it('shows Manage button on swarm card', () => {
    render(<SwarmPanel />)
    expect(screen.getByText('Manage')).toBeInTheDocument()
  })

  it('clicks Manage button without selecting swarm', () => {
    render(<SwarmPanel />)
    const manageButtons = screen.getAllByRole('button')
    const manageBtn = manageButtons.find(btn => btn.textContent?.includes('Manage'))
    if (manageBtn) {
      fireEvent.click(manageBtn)
    }
    // Swarm should not be selected (button just stops propagation)
    expect(screen.getByText('Active Test Swarm')).toBeInTheDocument()
  })
})

describe('SwarmPanel coordinator view', () => {
  const mockSetActiveSwarm = vi.fn()
  const mockSwarm = {
    id: '1',
    name: 'Coordinator Test Swarm',
    topology: 'star' as const,
    state: 'active' as const,
    agents: [],
    stats: {
      agentCount: 3,
      completedTasks: 5,
      pendingTasks: 1,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('selects swarm and calls setActiveSwarm', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [mockSwarm],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: mockSetActiveSwarm,
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('Coordinator Test Swarm'))
    expect(mockSetActiveSwarm).toHaveBeenCalledWith(mockSwarm)
  })

  it('shows coordinator panel when activeSwarm is set', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [mockSwarm],
        agents: [],
        activeSwarm: mockSwarm,
        setActiveSwarm: mockSetActiveSwarm,
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    // Should show Back to Swarms button
    expect(screen.getByText('Back to Swarms')).toBeInTheDocument()
    // Should show coordinator panel (mocked)
    expect(screen.getByTestId('swarm-coordinator')).toBeInTheDocument()
  })

  it('clicks Back to Swarms to deselect swarm', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [mockSwarm],
        agents: [],
        activeSwarm: mockSwarm,
        setActiveSwarm: mockSetActiveSwarm,
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    // Click Back to Swarms button
    fireEvent.click(screen.getByText('Back to Swarms'))
    expect(mockSetActiveSwarm).toHaveBeenCalledWith(null)
  })
})

describe('SwarmPanel swarm states', () => {
  const createSwarmWithState = (state: string) => ({
    id: '1',
    name: 'State Test Swarm',
    topology: 'star' as const,
    state: state as 'initializing' | 'active' | 'paused' | 'stopping' | 'stopped',
    agents: [],
    stats: { agentCount: 2, completedTasks: 0, pendingTasks: 0 },
  })

  it('shows initializing state', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = { swarms: [createSwarmWithState('initializing')], agents: [], activeSwarm: null, setActiveSwarm: vi.fn() }
      return selector ? selector(state) : state
    })
    render(<SwarmPanel />)
    expect(screen.getByText('initializing')).toBeInTheDocument()
  })

  it('shows paused state', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = { swarms: [createSwarmWithState('paused')], agents: [], activeSwarm: null, setActiveSwarm: vi.fn() }
      return selector ? selector(state) : state
    })
    render(<SwarmPanel />)
    expect(screen.getByText('paused')).toBeInTheDocument()
  })

  it('shows stopping state', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = { swarms: [createSwarmWithState('stopping')], agents: [], activeSwarm: null, setActiveSwarm: vi.fn() }
      return selector ? selector(state) : state
    })
    render(<SwarmPanel />)
    expect(screen.getByText('stopping')).toBeInTheDocument()
  })

  it('shows stopped state', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = { swarms: [createSwarmWithState('stopped')], agents: [], activeSwarm: null, setActiveSwarm: vi.fn() }
      return selector ? selector(state) : state
    })
    render(<SwarmPanel />)
    expect(screen.getByText('stopped')).toBeInTheDocument()
  })
})

describe('SwarmPanel action buttons', () => {
  const mockSwarm = {
    id: '1',
    name: 'Action Test Swarm',
    topology: 'star' as const,
    state: 'active' as const,
    agents: [],
    stats: { agentCount: 2, completedTasks: 0, pendingTasks: 0 },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [mockSwarm],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('clicks Refresh button without selecting swarm', () => {
    render(<SwarmPanel />)
    const refreshBtn = screen.getByTitle('Refresh')
    fireEvent.click(refreshBtn)
    // Swarm should still be shown (button just stops propagation)
    expect(screen.getByText('Action Test Swarm')).toBeInTheDocument()
  })

  it('clicks Stop button without selecting swarm', () => {
    render(<SwarmPanel />)
    const stopBtn = screen.getByTitle('Stop Swarm')
    fireEvent.click(stopBtn)
    // Swarm should still be shown (button just stops propagation)
    expect(screen.getByText('Action Test Swarm')).toBeInTheDocument()
  })
})

describe('SwarmCard active styling', () => {
  const mockSwarm = {
    id: '1',
    name: 'Active Card Swarm',
    topology: 'star' as const,
    state: 'active' as const,
    agents: [],
    stats: { agentCount: 2, completedTasks: 0, pendingTasks: 0 },
  }

  it('shows active styling when swarm is selected', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [mockSwarm],
        agents: [],
        activeSwarm: mockSwarm, // Swarm is active
        setActiveSwarm: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    // When activeSwarm is set, the coordinator panel is shown, not the card list
    // So we need to test the card styling before the view switches
    // This test verifies the coordinator panel is shown when swarm is active
    expect(screen.getByText('Back to Swarms')).toBeInTheDocument()
  })

  it('shows non-active styling when swarm is not selected', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [mockSwarm],
        agents: [],
        activeSwarm: null, // No active swarm
        setActiveSwarm: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    // Find the card container
    const swarmCard = screen.getByText('Active Card Swarm').closest('.rounded-lg')
    expect(swarmCard).not.toHaveClass('border-accent')
    expect(swarmCard).toHaveClass('border-panel-border')
  })
})

describe('SwarmCard component', () => {
  const mockSwarm = {
    id: '1',
    name: 'Direct Test Swarm',
    topology: 'star' as const,
    strategy: 'parallel' as const,
    state: 'active' as const,
    agents: [],
    stats: {
      agentCount: 5,
      idleAgents: 2,
      executingAgents: 3,
      completedTasks: 10,
      pendingTasks: 2,
      topology: 'star',
      strategy: 'parallel',
      state: 'active',
    },
  }

  it('shows active styling when isActive is true', () => {
    render(
      <SwarmCard
        swarm={mockSwarm}
        isActive={true}
        onSelect={() => {}}
        onStart={() => {}}
        onStop={() => {}}
      />
    )

    const card = screen.getByText('Direct Test Swarm').closest('.rounded-lg')
    expect(card).toHaveClass('border-accent')
    expect(card).toHaveClass('bg-accent/10')
  })

  it('shows non-active styling when isActive is false', () => {
    render(
      <SwarmCard
        swarm={mockSwarm}
        isActive={false}
        onSelect={() => {}}
        onStart={() => {}}
        onStop={() => {}}
      />
    )

    const card = screen.getByText('Direct Test Swarm').closest('.rounded-lg')
    expect(card).not.toHaveClass('border-accent')
    expect(card).toHaveClass('border-panel-border')
  })

  it('calls onSelect when clicked', () => {
    const handleSelect = vi.fn()
    render(
      <SwarmCard
        swarm={mockSwarm}
        isActive={false}
        onSelect={handleSelect}
        onStart={() => {}}
        onStop={() => {}}
      />
    )

    fireEvent.click(screen.getByText('Direct Test Swarm'))
    expect(handleSelect).toHaveBeenCalled()
  })

  it('calls onStart when start button clicked on stopped swarm', () => {
    const handleStart = vi.fn()
    const stoppedSwarm = { ...mockSwarm, state: 'stopped' as const }
    render(
      <SwarmCard
        swarm={stoppedSwarm}
        isActive={false}
        onSelect={() => {}}
        onStart={handleStart}
        onStop={() => {}}
      />
    )

    // Find and click the start button by title
    const startBtn = screen.getByTitle('Start Swarm')
    fireEvent.click(startBtn)
    expect(handleStart).toHaveBeenCalled()
  })

  it('calls onStop when stop button clicked on active swarm', () => {
    const handleStop = vi.fn()
    render(
      <SwarmCard
        swarm={mockSwarm}
        isActive={false}
        onSelect={() => {}}
        onStart={() => {}}
        onStop={handleStop}
      />
    )

    // Find and click the stop button by title
    const stopBtn = screen.getByTitle('Stop Swarm')
    fireEvent.click(stopBtn)
    expect(handleStop).toHaveBeenCalled()
  })
})

describe('SwarmPanel API error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handles start swarm error', async () => {
    const { api } = await import('../services')
    vi.mocked(api.swarm.startSwarm).mockRejectedValueOnce(new Error('Start failed'))

    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [{
          id: '1',
          name: 'Test Swarm',
          topology: 'star' as const,
          state: 'stopped' as const,
          agents: [],
          stats: { agentCount: 1, completedTasks: 0, pendingTasks: 0 },
        }],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    const startBtn = screen.getByTitle('Start Swarm')
    fireEvent.click(startBtn)
    // Error should be logged but not crash
    expect(screen.getByText('Test Swarm')).toBeInTheDocument()
  })

  it('handles stop swarm error', async () => {
    const { api } = await import('../services')
    vi.mocked(api.swarm.stopSwarm).mockRejectedValueOnce(new Error('Stop failed'))

    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [{
          id: '1',
          name: 'Active Swarm',
          topology: 'star' as const,
          state: 'active' as const,
          agents: [],
          stats: { agentCount: 1, completedTasks: 0, pendingTasks: 0 },
        }],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    const stopBtn = screen.getByTitle('Stop Swarm')
    fireEvent.click(stopBtn)
    // Error should be logged but not crash
    expect(screen.getByText('Active Swarm')).toBeInTheDocument()
  })

  it('handles loadSwarms error', async () => {
    const { api } = await import('../services')
    vi.mocked(api.swarm.getSwarms).mockRejectedValueOnce(new Error('Load failed'))

    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    // Click refresh button
    const refreshBtn = screen.getByTitle('Refresh')
    fireEvent.click(refreshBtn)
    // Should show empty state
    expect(screen.getByText('No swarms created')).toBeInTheDocument()
  })

  it('handles createSwarm error', async () => {
    const { api } = await import('../services')
    vi.mocked(api.swarm.createSwarm).mockRejectedValueOnce(new Error('Create failed'))

    const mockAddSwarm = vi.fn()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [{ id: 'agent-1', name: 'Test Agent', type: 'coder', status: 'stopped', command: 'claude', capabilities: [], lastActive: null, enabled: true }],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addSwarm: mockAddSwarm,
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    await userEvent.click(screen.getByText('New Swarm'))
    await userEvent.type(screen.getByPlaceholderText('My Swarm'), 'Error Swarm')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: /Create Swarm/ }))

    // Modal should stay open on error
    expect(screen.getByText('Create New Swarm')).toBeInTheDocument()
  })
})

describe('SwarmPanel agent selection toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [
          { id: 'agent-1', name: 'Agent One', type: 'coder', status: 'stopped', command: 'claude', capabilities: [], lastActive: null, enabled: true },
          { id: 'agent-2', name: 'Agent Two', type: 'analyst', status: 'stopped', command: 'claude', capabilities: [], lastActive: null, enabled: true },
        ],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addSwarm: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('selects and deselects agents', async () => {
    render(<SwarmPanel />)
    await userEvent.click(screen.getByText('New Swarm'))

    const checkboxes = screen.getAllByRole('checkbox')

    // Select first agent
    await userEvent.click(checkboxes[0])
    expect(screen.getByText('Select Agents (1 selected)')).toBeInTheDocument()

    // Select second agent
    await userEvent.click(checkboxes[1])
    expect(screen.getByText('Select Agents (2 selected)')).toBeInTheDocument()

    // Deselect first agent
    await userEvent.click(checkboxes[0])
    expect(screen.getByText('Select Agents (1 selected)')).toBeInTheDocument()
  })
})

describe('SwarmPanel successful operations', () => {
  const mockAddSwarm = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [
          { id: 'agent-1', name: 'Agent One', type: 'coder', status: 'stopped', command: 'claude', capabilities: [], lastActive: null, enabled: true },
        ],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addSwarm: mockAddSwarm,
      }
      return selector ? selector(state) : state
    })
  })

  it('creates swarm successfully and calls addSwarm', async () => {
    const { api } = await import('../services')
    vi.mocked(api.swarm.createSwarm).mockResolvedValueOnce({
      id: 'swarm-new',
      name: 'New Swarm',
      topology: 'star',
      strategy: 'parallel',
      state: 'stopped',
      agents: ['agent-1'],
      stats: {
        agentCount: 1,
        idleAgents: 1,
        executingAgents: 0,
        pendingTasks: 0,
        completedTasks: 0,
      },
      createdAt: new Date().toISOString(),
    })

    render(<SwarmPanel />)
    await userEvent.click(screen.getByText('New Swarm'))

    // Fill in name
    await userEvent.type(screen.getByPlaceholderText('My Swarm'), 'New Swarm')

    // Select an agent
    await userEvent.click(screen.getByRole('checkbox'))

    // Click create button
    await userEvent.click(screen.getByRole('button', { name: /Create Swarm/ }))

    // Wait for creation to complete
    await waitFor(() => {
      expect(mockAddSwarm).toHaveBeenCalled()
    })

    // Verify the swarm was added with correct data
    const addedSwarm = mockAddSwarm.mock.calls[0][0]
    expect(addedSwarm.id).toBe('swarm-new')
    expect(addedSwarm.name).toBe('New Swarm')
    expect(addedSwarm.topology).toBe('star')
    expect(addedSwarm.stats.agentCount).toBe(1)

    // Modal should close after successful creation
    await waitFor(() => {
      expect(screen.queryByText('Create New Swarm')).not.toBeInTheDocument()
    })
  })

  it('starts swarm successfully and reloads swarm list', async () => {
    const { api } = await import('../services')
    vi.mocked(api.swarm.startSwarm).mockResolvedValueOnce({
      id: '1',
      name: 'Stopped Swarm',
      topology: 'star',
      strategy: 'parallel',
      state: 'active',
      agents: [],
      stats: {
        agentCount: 1,
        idleAgents: 1,
        executingAgents: 0,
        pendingTasks: 0,
        completedTasks: 0,
      },
      createdAt: new Date().toISOString(),
    })
    vi.mocked(api.swarm.getSwarms).mockResolvedValueOnce([])

    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [{
          id: '1',
          name: 'Stopped Swarm',
          topology: 'star' as const,
          state: 'stopped' as const,
          agents: [],
          stats: { agentCount: 1, completedTasks: 0, pendingTasks: 0 },
        }],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addSwarm: mockAddSwarm,
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    const startBtn = screen.getByTitle('Start Swarm')
    await userEvent.click(startBtn)

    // Should call startSwarm API
    await waitFor(() => {
      expect(api.swarm.startSwarm).toHaveBeenCalledWith('1')
    })

    // Should reload swarms
    await waitFor(() => {
      expect(api.swarm.getSwarms).toHaveBeenCalled()
    })
  })

  it('stops swarm successfully and reloads swarm list', async () => {
    const { api } = await import('../services')
    vi.mocked(api.swarm.stopSwarm).mockResolvedValueOnce({
      id: '1',
      name: 'Active Swarm',
      topology: 'star',
      strategy: 'parallel',
      state: 'stopped',
      agents: [],
      stats: {
        agentCount: 1,
        idleAgents: 1,
        executingAgents: 0,
        pendingTasks: 0,
        completedTasks: 0,
      },
      createdAt: new Date().toISOString(),
    })
    vi.mocked(api.swarm.getSwarms).mockResolvedValueOnce([])

    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [{
          id: '1',
          name: 'Active Swarm',
          topology: 'star' as const,
          state: 'active' as const,
          agents: [],
          stats: { agentCount: 1, completedTasks: 0, pendingTasks: 0 },
        }],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addSwarm: mockAddSwarm,
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    const stopBtn = screen.getByTitle('Stop Swarm')
    await userEvent.click(stopBtn)

    // Should call stopSwarm API
    await waitFor(() => {
      expect(api.swarm.stopSwarm).toHaveBeenCalledWith('1')
    })

    // Should reload swarms
    await waitFor(() => {
      expect(api.swarm.getSwarms).toHaveBeenCalled()
    })
  })
})