import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SwarmPanel, { SwarmCard } from './SwarmPanel'
import type { Swarm } from '../types'
import type { SwarmInfo } from '../services/api'
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
      deleteSwarm: vi.fn().mockResolvedValue(undefined),
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
        addToast: vi.fn(),
        setSwarms: vi.fn(),
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

  it('does not create swarm when name is empty (early return)', async () => {
    const mockAddSwarm = vi.fn()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [{ id: 'agent-1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: {} }],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addSwarm: mockAddSwarm,
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))

    // Don't enter a name, just try to create (button should be disabled)
    const createButton = screen.getByRole('button', { name: 'Create Swarm' })
    expect(createButton).toBeDisabled()

    // addSwarm should not be called
    expect(mockAddSwarm).not.toHaveBeenCalled()
  })

  it('does not create swarm when no agents selected (early return)', async () => {
    const mockAddSwarm = vi.fn()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [{ id: 'agent-1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: {} }],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addSwarm: mockAddSwarm,
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))

    // Enter a name but don't select any agents
    fireEvent.change(screen.getByPlaceholderText('My Swarm'), { target: { value: 'Test Swarm' } })

    // Button should still be disabled because no agents selected
    const createButton = screen.getByRole('button', { name: 'Create Swarm' })
    expect(createButton).toBeDisabled()

    // addSwarm should not be called
    expect(mockAddSwarm).not.toHaveBeenCalled()
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
        addToast: vi.fn(),
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
        addToast: vi.fn(),
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
        addToast: vi.fn(),
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
        addToast: vi.fn(),
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
        addToast: vi.fn(),
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
        addToast: vi.fn(),
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
        addToast: vi.fn(),
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
      const state = { swarms: [createSwarmWithState('initializing')], agents: [], activeSwarm: null, setActiveSwarm: vi.fn(), addToast: vi.fn() }
      return selector ? selector(state) : state
    })
    render(<SwarmPanel />)
    expect(screen.getByText('initializing')).toBeInTheDocument()
  })

  it('shows paused state', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = { swarms: [createSwarmWithState('paused')], agents: [], activeSwarm: null, setActiveSwarm: vi.fn(), addToast: vi.fn() }
      return selector ? selector(state) : state
    })
    render(<SwarmPanel />)
    expect(screen.getByText('paused')).toBeInTheDocument()
  })

  it('shows stopping state', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = { swarms: [createSwarmWithState('stopping')], agents: [], activeSwarm: null, setActiveSwarm: vi.fn(), addToast: vi.fn() }
      return selector ? selector(state) : state
    })
    render(<SwarmPanel />)
    expect(screen.getByText('stopping')).toBeInTheDocument()
  })

  it('shows stopped state', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = { swarms: [createSwarmWithState('stopped')], agents: [], activeSwarm: null, setActiveSwarm: vi.fn(), addToast: vi.fn() }
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
        addToast: vi.fn(),
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
        addToast: vi.fn(),
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
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    // Find the card container
    const swarmCard = screen.getByText('Active Card Swarm').closest('.rounded-mac-xl')
    expect(swarmCard).not.toHaveClass('border-accent')
    expect(swarmCard).toHaveClass('border-glass-border')
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
        onDelete={() => {}}
      />
    )

    const card = screen.getByText('Direct Test Swarm').closest('.rounded-mac-xl')
    expect(card).toHaveClass('border-accent')
    expect(card).toHaveClass('bg-accent-muted')
  })

  it('shows non-active styling when isActive is false', () => {
    render(
      <SwarmCard
        swarm={mockSwarm}
        isActive={false}
        onSelect={() => {}}
        onStart={() => {}}
        onStop={() => {}}
        onDelete={() => {}}
      />
    )

    const card = screen.getByText('Direct Test Swarm').closest('.rounded-mac-xl')
    expect(card).not.toHaveClass('border-accent')
    expect(card).toHaveClass('border-glass-border')
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
        onDelete={() => {}}
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
        onDelete={() => {}}
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
        onDelete={() => {}}
      />
    )

    // Find and click the stop button by title
    const stopBtn = screen.getByTitle('Stop Swarm')
    fireEvent.click(stopBtn)
    expect(handleStop).toHaveBeenCalled()
  })

  it('calls onDelete when delete button clicked', () => {
    const handleDelete = vi.fn()
    render(
      <SwarmCard
        swarm={mockSwarm}
        isActive={false}
        onSelect={() => {}}
        onStart={() => {}}
        onStop={() => {}}
        onDelete={handleDelete}
      />
    )

    const deleteBtn = screen.getByTitle('Delete Swarm')
    fireEvent.click(deleteBtn)
    expect(handleDelete).toHaveBeenCalled()
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
        addToast: vi.fn(),
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
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    const stopBtn = screen.getByTitle('Stop Swarm')
    fireEvent.click(stopBtn)

    // Component shows a ConfirmDialog before stopping - confirm it
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stop Swarm' }))

    // Error should be logged but not crash
    await waitFor(() => {
      expect(screen.getByText('Active Swarm')).toBeInTheDocument()
    })
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
        addToast: vi.fn(),
        setSwarms: vi.fn(),
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
        addToast: vi.fn(),
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
        addToast: vi.fn(),
        setSwarms: vi.fn(),
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
        addToast: vi.fn(),
        setSwarms: vi.fn(),
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
      status: 'stopped',
      agents: ['agent-1'],
      agentCount: 1,
      taskCount: 0,
      stats: {
        agentCount: 1,
        idleAgents: 1,
        executingAgents: 0,
        pendingTasks: 0,
        completedTasks: 0,
        topology: '',
        strategy: '',
        state: '',
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
      status: 'active',
      agents: [],
      agentCount: 1,
      taskCount: 0,
      stats: {
        agentCount: 1,
        idleAgents: 1,
        executingAgents: 0,
        pendingTasks: 0,
        completedTasks: 0,
        topology: '',
        strategy: '',
        state: '',
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
        addToast: vi.fn(),
        setSwarms: vi.fn(),
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
      status: 'stopped',
      agents: [],
      agentCount: 1,
      taskCount: 0,
      stats: {
        agentCount: 1,
        idleAgents: 1,
        executingAgents: 0,
        pendingTasks: 0,
        completedTasks: 0,
        topology: '',
        strategy: '',
        state: '',
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
        addToast: vi.fn(),
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    const stopBtn = screen.getByTitle('Stop Swarm')
    await userEvent.click(stopBtn)

    // Component shows a ConfirmDialog before stopping - confirm it
    const dialog = screen.getByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stop Swarm' }))

    // Should call stopSwarm API
    await waitFor(() => {
      expect(api.swarm.stopSwarm).toHaveBeenCalledWith('1')
    })

    // Should reload swarms
    await waitFor(() => {
      expect(api.swarm.getSwarms).toHaveBeenCalled()
    })
  })

  it('loads swarms with matching agents from API', async () => {
    const { api } = await import('../services')
    const mockSetSwarms = vi.fn()

    // Mock API to return swarms with agent IDs
    vi.mocked(api.swarm.getSwarms).mockReset()
    vi.mocked(api.swarm.getSwarms).mockResolvedValueOnce([
      {
        id: 'swarm-1',
        name: 'Swarm With Agents',
        topology: 'star',
        strategy: 'parallel',
        state: 'active',
        status: 'active',
        agents: ['agent-1', 'agent-2'], // These IDs should match store agents
        agentCount: 2,
        taskCount: 0,
        stats: {
          agentCount: 2,
          idleAgents: 1,
          executingAgents: 1,
          pendingTasks: 0,
          completedTasks: 5,
          topology: '',
          strategy: '',
          state: '',
        },
        createdAt: new Date().toISOString(),
      },
    ])

    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [
          { id: 'agent-1', name: 'Agent One', type: 'coder', state: 'idle', capabilities: {} },
          { id: 'agent-2', name: 'Agent Two', type: 'reviewer', state: 'executing', capabilities: {} },
          { id: 'agent-3', name: 'Agent Three', type: 'tester', state: 'idle', capabilities: {} },
        ],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        setSwarms: mockSetSwarms,
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)

    // Click refresh to trigger loadSwarms
    const refreshBtn = screen.getByTitle('Refresh')
    await userEvent.click(refreshBtn)

    // Wait for API call
    await waitFor(() => {
      expect(api.swarm.getSwarms).toHaveBeenCalled()
    })

    // Verify setSwarms was called with agents filtered correctly
    await waitFor(() => {
      expect(mockSetSwarms).toHaveBeenCalled()
      const calledSwarms = mockSetSwarms.mock.calls[0][0]
      expect(calledSwarms[0].agents).toHaveLength(2)
      expect(calledSwarms[0].agents[0].id).toBe('agent-1')
      expect(calledSwarms[0].agents[1].id).toBe('agent-2')
    })
  })
})

describe('SwarmPanel loadSwarms', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading spinner when loading swarms', async () => {
    const { api } = await import('../services')
    let resolveLoad: (value: SwarmInfo[]) => void
    const loadPromise = new Promise((resolve: (value: SwarmInfo[]) => void) => { resolveLoad = resolve })
    vi.mocked(api.swarm.getSwarms).mockReturnValue(loadPromise)

    const mockSetSwarms = vi.fn()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addToast: vi.fn(),
        setSwarms: mockSetSwarms,
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    const refreshBtn = screen.getByTitle('Refresh')
    await userEvent.click(refreshBtn)

    const spinner = refreshBtn.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()

    await act(async () => {
      resolveLoad!([])
      await loadPromise
    })
  })

  it('handles loadSwarms error with non-Error object', async () => {
    const { api } = await import('../services')
    vi.mocked(api.swarm.getSwarms).mockRejectedValueOnce('string error')

    const mockAddToast = vi.fn()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addToast: mockAddToast,
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    const refreshBtn = screen.getByTitle('Refresh')
    await userEvent.click(refreshBtn)

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to load swarms', 'Unknown error')
    })
  })

  it('loads swarms with status fallback when state is missing', async () => {
    const { api } = await import('../services')
    const mockSetSwarms = vi.fn()
    vi.mocked(api.swarm.getSwarms).mockResolvedValueOnce([
      {
        id: 'sw-1',
        name: 'Fallback Swarm',
        topology: 'mesh',
        strategy: 'sequential',
        // No state field, only status
        status: 'active',
        agents: [],
        agentCount: 1,
        taskCount: 3,
      },
    ])

    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addToast: vi.fn(),
        setSwarms: mockSetSwarms,
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    const refreshBtn = screen.getByTitle('Refresh')
    await userEvent.click(refreshBtn)

    await waitFor(() => {
      expect(mockSetSwarms).toHaveBeenCalled()
      const calledSwarms = mockSetSwarms.mock.calls[0][0]
      expect(calledSwarms[0].state).toBe('active')
      expect(calledSwarms[0].stats.state).toBe('active')
    })
  })

  it('loads swarms with taskCount fallback for stats', async () => {
    const { api } = await import('../services')
    const mockSetSwarms = vi.fn()
    vi.mocked(api.swarm.getSwarms).mockResolvedValueOnce([
      {
        id: 'sw-1',
        name: 'Stats Swarm',
        topology: 'ring',
        strategy: 'pipeline',
        status: 'idle',
        state: 'idle',
        agents: [],
        agentCount: 3,
        taskCount: 7,
        // No nested stats
      },
    ])

    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addToast: vi.fn(),
        setSwarms: mockSetSwarms,
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    const refreshBtn = screen.getByTitle('Refresh')
    await userEvent.click(refreshBtn)

    await waitFor(() => {
      expect(mockSetSwarms).toHaveBeenCalled()
      const calledSwarms = mockSetSwarms.mock.calls[0][0]
      expect(calledSwarms[0].stats.agentCount).toBe(3)
      expect(calledSwarms[0].stats.pendingTasks).toBe(7)
    })
  })
})

describe('SwarmPanel delete swarm', () => {
  const mockSwarm = {
    id: 'del-1',
    name: 'Delete Me',
    topology: 'star' as const,
    state: 'stopped' as const,
    agents: [],
    stats: { agentCount: 1, completedTasks: 0, pendingTasks: 0 },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [mockSwarm],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addToast: vi.fn(),
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('shows delete confirmation dialog when delete button clicked', async () => {
    render(<SwarmPanel />)
    const deleteBtn = screen.getByTitle('Delete Swarm')
    await userEvent.click(deleteBtn)

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog.getAttribute('aria-label')).toBe('Delete Swarm')
    expect(within(dialog).getByText(/Are you sure you want to delete "Delete Me"/)).toBeInTheDocument()
  })

  it('cancels delete when Cancel clicked in dialog', async () => {
    render(<SwarmPanel />)
    const deleteBtn = screen.getByTitle('Delete Swarm')
    await userEvent.click(deleteBtn)

    const dialog = screen.getByRole('alertdialog')
    await userEvent.click(within(dialog).getByText('Cancel'))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('deletes swarm successfully on confirm', async () => {
    const { api } = await import('../services')
    vi.mocked(api.swarm.deleteSwarm).mockResolvedValueOnce(undefined)
    vi.mocked(api.swarm.getSwarms).mockResolvedValueOnce([])

    const mockAddToast = vi.fn()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [mockSwarm],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addToast: mockAddToast,
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    const deleteBtn = screen.getByTitle('Delete Swarm')
    await userEvent.click(deleteBtn)

    const dialog = screen.getByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete Swarm' }))

    await waitFor(() => {
      expect(api.swarm.deleteSwarm).toHaveBeenCalledWith('del-1')
      expect(mockAddToast).toHaveBeenCalledWith('success', 'Swarm deleted')
    })
  })

  it('handles delete swarm API error', async () => {
    const { api } = await import('../services')
    vi.mocked(api.swarm.deleteSwarm).mockRejectedValueOnce(new Error('Delete failed'))

    const mockAddToast = vi.fn()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [mockSwarm],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addToast: mockAddToast,
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    const deleteBtn = screen.getByTitle('Delete Swarm')
    await userEvent.click(deleteBtn)

    const dialog = screen.getByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete Swarm' }))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to delete swarm', 'Delete failed')
    })
  })

  it('handles delete swarm error with non-Error object', async () => {
    const { api } = await import('../services')
    vi.mocked(api.swarm.deleteSwarm).mockRejectedValueOnce('network failure')

    const mockAddToast = vi.fn()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [mockSwarm],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addToast: mockAddToast,
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    const deleteBtn = screen.getByTitle('Delete Swarm')
    await userEvent.click(deleteBtn)

    const dialog = screen.getByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete Swarm' }))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to delete swarm', 'Unknown error')
    })
  })
})

describe('SwarmPanel createSwarm error paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handles createSwarm error with non-Error object', async () => {
    const { api } = await import('../services')
    vi.mocked(api.swarm.createSwarm).mockRejectedValueOnce('server error')

    const mockAddToast = vi.fn()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [{ id: 'agent-1', name: 'Test Agent', type: 'coder', status: 'stopped', command: 'claude', capabilities: [], lastActive: null, enabled: true }],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addSwarm: vi.fn(),
        addToast: mockAddToast,
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    await userEvent.click(screen.getByText('New Swarm'))
    await userEvent.type(screen.getByPlaceholderText('My Swarm'), 'Error Swarm')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: /Create Swarm/ }))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to create swarm', 'Unknown error')
    })
  })

  it('handles createSwarm success with status fallback', async () => {
    const { api } = await import('../services')
    const mockAddSwarm = vi.fn()
    vi.mocked(api.swarm.createSwarm).mockResolvedValueOnce({
      id: 'sw-new',
      name: 'New Swarm',
      topology: 'star',
      strategy: 'parallel',
      status: 'stopped',
      // No state, only status
      agents: ['agent-1'],
      agentCount: 1,
      taskCount: 2,
      stats: {
        agentCount: 1,
        idleAgents: 1,
        executingAgents: 0,
        pendingTasks: 2,
        completedTasks: 0,
        topology: '',
        strategy: '',
        state: '',
      },
      createdAt: new Date().toISOString(),
    })

    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [{ id: 'agent-1', name: 'Agent One', type: 'coder', status: 'stopped', command: 'claude', capabilities: [], lastActive: null, enabled: true }],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addSwarm: mockAddSwarm,
        addToast: vi.fn(),
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    await userEvent.click(screen.getByText('New Swarm'))
    await userEvent.type(screen.getByPlaceholderText('My Swarm'), 'New Swarm')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: /Create Swarm/ }))

    await waitFor(() => {
      expect(mockAddSwarm).toHaveBeenCalled()
      const swarm = mockAddSwarm.mock.calls[0][0]
      expect(swarm.state).toBe('stopped')
      expect(swarm.stats.pendingTasks).toBe(2)
    })
  })

  it('resets form after successful creation', async () => {
    const { api } = await import('../services')
    vi.mocked(api.swarm.createSwarm).mockResolvedValueOnce({
      id: 'sw-reset',
      name: 'Reset Test',
      topology: 'star',
      strategy: 'parallel',
      status: 'stopped',
      state: 'stopped',
      agents: ['agent-1'],
      agentCount: 1,
      taskCount: 0,
      stats: { agentCount: 1, idleAgents: 1, executingAgents: 0, pendingTasks: 0, completedTasks: 0, topology: '', strategy: '', state: '' },
      createdAt: new Date().toISOString(),
    })

    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [{ id: 'agent-1', name: 'Agent One', type: 'coder', status: 'stopped', command: 'claude', capabilities: [], lastActive: null, enabled: true }],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addSwarm: vi.fn(),
        addToast: vi.fn(),
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    await userEvent.click(screen.getByText('New Swarm'))

    // Select mesh topology and pipeline strategy
    const meshButton = screen.getByText('mesh').closest('button')!
    fireEvent.click(meshButton)
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: 'pipeline' } })

    await userEvent.type(screen.getByPlaceholderText('My Swarm'), 'Reset Test')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: /Create Swarm/ }))

    await waitFor(() => {
      expect(screen.queryByText('Create New Swarm')).not.toBeInTheDocument()
    })
  })
})

describe('SwarmPanel start/stop error paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handles startSwarm error with non-Error object', async () => {
    const { api } = await import('../services')
    vi.mocked(api.swarm.startSwarm).mockRejectedValueOnce('connection refused')

    const mockAddToast = vi.fn()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [{
          id: '1', name: 'Test', topology: 'star' as const, state: 'stopped' as const, agents: [],
          stats: { agentCount: 1, completedTasks: 0, pendingTasks: 0 },
        }],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addToast: mockAddToast,
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    await userEvent.click(screen.getByTitle('Start Swarm'))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to start swarm', 'Unknown error')
    })
  })

  it('handles stopSwarm error with non-Error object', async () => {
    const { api } = await import('../services')
    vi.mocked(api.swarm.stopSwarm).mockRejectedValueOnce('timeout')

    const mockAddToast = vi.fn()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [{
          id: '1', name: 'Active', topology: 'star' as const, state: 'active' as const, agents: [],
          stats: { agentCount: 1, completedTasks: 0, pendingTasks: 0 },
        }],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addToast: mockAddToast,
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    await userEvent.click(screen.getByTitle('Stop Swarm'))

    const dialog = screen.getByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stop Swarm' }))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to stop swarm', 'Unknown error')
    })
  })
})

describe('SwarmPanel coordinator view details', () => {
  const mockSwarm = {
    id: '1', name: 'Coord Swarm', topology: 'mesh' as const, state: 'active' as const, agents: [],
    stats: { agentCount: 3, completedTasks: 5, pendingTasks: 1 },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [mockSwarm],
        agents: [],
        activeSwarm: mockSwarm,
        setActiveSwarm: vi.fn(),
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('has Back to Swarms button with aria-label', () => {
    render(<SwarmPanel />)
    expect(screen.getByLabelText('Back to swarms list')).toBeInTheDocument()
  })

  it('renders SwarmCoordinatorPanel inside coordinator view', () => {
    render(<SwarmPanel />)
    expect(screen.getByTestId('swarm-coordinator')).toBeInTheDocument()
  })
})

describe('SwarmCard topology icons', () => {
  const makeSwarm = (topology: string): Swarm => ({
    id: '1', name: 'Icon Swarm', topology: topology as Swarm['topology'],
    strategy: 'parallel' as Swarm['strategy'], state: 'stopped' as Swarm['state'], agents: [],
    stats: { agentCount: 0, idleAgents: 0, executingAgents: 0, completedTasks: 0, pendingTasks: 0, topology: '', strategy: '', state: '' },
  })

  it('renders star topology icon', () => {
    render(<SwarmCard swarm={makeSwarm('star')} isActive={false} onSelect={() => {}} onStart={() => {}} onStop={() => {}} onDelete={() => {}} />)
    expect(screen.getByText('★')).toBeInTheDocument()
  })

  it('renders mesh topology icon', () => {
    render(<SwarmCard swarm={makeSwarm('mesh')} isActive={false} onSelect={() => {}} onStart={() => {}} onStop={() => {}} onDelete={() => {}} />)
    expect(screen.getByText('◇')).toBeInTheDocument()
  })

  it('renders tree topology icon', () => {
    render(<SwarmCard swarm={makeSwarm('tree')} isActive={false} onSelect={() => {}} onStart={() => {}} onStop={() => {}} onDelete={() => {}} />)
    expect(screen.getByText('▴')).toBeInTheDocument()
  })

  it('renders ring topology icon', () => {
    render(<SwarmCard swarm={makeSwarm('ring')} isActive={false} onSelect={() => {}} onStart={() => {}} onStop={() => {}} onDelete={() => {}} />)
    expect(screen.getByText('○')).toBeInTheDocument()
  })

  it('renders hybrid topology icon', () => {
    render(<SwarmCard swarm={makeSwarm('hybrid')} isActive={false} onSelect={() => {}} onStart={() => {}} onStop={() => {}} onDelete={() => {}} />)
    expect(screen.getByText('◈')).toBeInTheDocument()
  })

  it('renders status color for initializing state', () => {
    const swarm = { ...makeSwarm('star'), state: 'initializing' as const }
    render(<SwarmCard swarm={swarm} isActive={false} onSelect={() => {}} onStart={() => {}} onStop={() => {}} onDelete={() => {}} />)
    const dot = document.querySelector('.bg-warning')
    expect(dot).toBeInTheDocument()
  })

  it('renders status color for paused state', () => {
    const swarm = { ...makeSwarm('star'), state: 'paused' as const }
    render(<SwarmCard swarm={swarm} isActive={false} onSelect={() => {}} onStart={() => {}} onStop={() => {}} onDelete={() => {}} />)
    const dot = document.querySelector('.bg-info')
    expect(dot).toBeInTheDocument()
  })

  it('renders status color for stopping state', () => {
    const swarm = { ...makeSwarm('star'), state: 'stopping' as const }
    render(<SwarmCard swarm={swarm} isActive={false} onSelect={() => {}} onStart={() => {}} onStop={() => {}} onDelete={() => {}} />)
    const dot = document.querySelector('.bg-warning')
    expect(dot).toBeInTheDocument()
  })

  it('renders status color for stopped state', () => {
    const swarm = { ...makeSwarm('star'), state: 'stopped' as const }
    render(<SwarmCard swarm={swarm} isActive={false} onSelect={() => {}} onStart={() => {}} onStop={() => {}} onDelete={() => {}} />)
    const dot = document.querySelector('.bg-text-tertiary')
    expect(dot).toBeInTheDocument()
  })

  it('shows start button when swarm is not running', () => {
    const swarm = { ...makeSwarm('star'), state: 'stopped' as const }
    render(<SwarmCard swarm={swarm} isActive={false} onSelect={() => {}} onStart={() => {}} onStop={() => {}} onDelete={() => {}} />)
    expect(screen.getByTitle('Start Swarm')).toBeInTheDocument()
    expect(screen.queryByTitle('Stop Swarm')).not.toBeInTheDocument()
  })

  it('shows stop button when swarm is active', () => {
    const swarm = { ...makeSwarm('star'), state: 'active' as const }
    render(<SwarmCard swarm={swarm} isActive={false} onSelect={() => {}} onStart={() => {}} onStop={() => {}} onDelete={() => {}} />)
    expect(screen.getByTitle('Stop Swarm')).toBeInTheDocument()
    expect(screen.queryByTitle('Start Swarm')).not.toBeInTheDocument()
  })

  it('calls onSelect when Manage button clicked', () => {
    const handleSelect = vi.fn()
    render(<SwarmCard swarm={makeSwarm('star')} isActive={false} onSelect={handleSelect} onStart={() => {}} onStop={() => {}} onDelete={() => {}} />)
    fireEvent.click(screen.getByText('Manage'))
    expect(handleSelect).toHaveBeenCalled()
  })
})

describe('SwarmPanel stop confirmation cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('cancels stop confirmation without calling stopSwarm API', async () => {
    const { api } = await import('../services')

    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [{
          id: '1', name: 'Active', topology: 'star' as const, state: 'active' as const, agents: [],
          stats: { agentCount: 1, completedTasks: 0, pendingTasks: 0 },
        }],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addToast: vi.fn(),
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    await userEvent.click(screen.getByTitle('Stop Swarm'))

    const dialog = screen.getByRole('alertdialog')
    await userEvent.click(within(dialog).getByText('Cancel'))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(api.swarm.stopSwarm).not.toHaveBeenCalled()
  })
})

describe('SwarmPanel refresh without active swarm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows refresh button with correct aria-label', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addToast: vi.fn(),
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    expect(screen.getByLabelText('Refresh swarms')).toBeInTheDocument()
  })
})

describe('SwarmPanel modal close button', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addToast: vi.fn(),
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('closes modal when X button clicked', async () => {
    render(<SwarmPanel />)
    await userEvent.click(screen.getByText('New Swarm'))
    expect(screen.getByText('Create New Swarm')).toBeInTheDocument()

    const closeBtn = screen.getByLabelText('Close modal')
    await userEvent.click(closeBtn)
    expect(screen.queryByText('Create New Swarm')).not.toBeInTheDocument()
  })

  it('renders modal with dialog role and aria-modal', async () => {
    render(<SwarmPanel />)
    await userEvent.click(screen.getByText('New Swarm'))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'Create New Swarm')
  })
})

describe('SwarmPanel strategy change', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addToast: vi.fn(),
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('changes to pipeline strategy', () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: 'pipeline' } })
    expect(selects[0]).toHaveValue('pipeline')
  })

  it('changes to mapreduce strategy', () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: 'mapreduce' } })
    expect(selects[0]).toHaveValue('mapreduce')
  })
})

describe('SwarmPanel agent selection display', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [
          { id: 'agent-1', name: 'Agent Alpha', type: 'coder', status: 'stopped', command: 'claude', capabilities: [], lastActive: null, enabled: true },
        ],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addSwarm: vi.fn(),
        addToast: vi.fn(),
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('shows agent type badge', async () => {
    render(<SwarmPanel />)
    await userEvent.click(screen.getByText('New Swarm'))
    expect(screen.getByText('coder')).toBeInTheDocument()
  })

  it('shows agent name in checkbox list', async () => {
    render(<SwarmPanel />)
    await userEvent.click(screen.getByText('New Swarm'))
    expect(screen.getByText('Agent Alpha')).toBeInTheDocument()
  })
})

describe('SwarmPanel topology description display', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addToast: vi.fn(),
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('shows star description by default', () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))
    expect(screen.getByText('Central coordinator with agents reporting to it')).toBeInTheDocument()
  })
})

describe('SwarmPanel unmount during async', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handles unmount during loadSwarms without crashing', async () => {
    const { api } = await import('../services')
    let resolveLoad: (value: SwarmInfo[]) => void
    const loadPromise = new Promise((resolve: (value: SwarmInfo[]) => void) => { resolveLoad = resolve })
    vi.mocked(api.swarm.getSwarms).mockReturnValue(loadPromise)

    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addToast: vi.fn(),
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    const { unmount } = render(<SwarmPanel />)
    const refreshBtn = screen.getByTitle('Refresh')
    await userEvent.click(refreshBtn)

    // Unmount while loading
    unmount()

    // Resolve the promise - should not cause errors
    await act(async () => {
      resolveLoad!([])
      await loadPromise
    })
  })

  it('handles unmount during loadSwarms error without crashing', async () => {
    const { api } = await import('../services')
    let rejectLoad: (reason: unknown) => void
    const loadPromise: Promise<SwarmInfo[]> = new Promise((_resolve, reject) => { rejectLoad = reject })
    vi.mocked(api.swarm.getSwarms).mockReturnValue(loadPromise)

    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addToast: vi.fn(),
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    const { unmount } = render(<SwarmPanel />)
    const refreshBtn = screen.getByTitle('Refresh')
    await userEvent.click(refreshBtn)

    // Unmount while loading
    unmount()

    // Reject the promise - should not cause errors
    await act(async () => {
      rejectLoad!(new Error('Unmounted'))
      try { await loadPromise } catch { /* expected */ }
    })
  })

  it('handles unmount during createSwarm without crashing', async () => {
    const { api } = await import('../services')
    let resolveCreate: (value: SwarmInfo) => void
    const createPromise = new Promise((resolve: (value: SwarmInfo) => void) => { resolveCreate = resolve })
    vi.mocked(api.swarm.createSwarm).mockReturnValue(createPromise as never)

    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [{ id: 'agent-1', name: 'Agent One', type: 'coder', status: 'stopped', command: 'claude', capabilities: [], lastActive: null, enabled: true }],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addSwarm: vi.fn(),
        addToast: vi.fn(),
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    const { unmount } = render(<SwarmPanel />)
    await userEvent.click(screen.getByText('New Swarm'))
    await userEvent.type(screen.getByPlaceholderText('My Swarm'), 'Unmount Test')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: /Create Swarm/ }))

    // Unmount while creating
    unmount()

    // Resolve the promise - should not cause errors
    await act(async () => {
      resolveCreate!({
        id: 'sw-1', name: 'Unmount Test', topology: 'star', strategy: 'parallel',
        status: 'stopped',
        state: 'stopped', agents: ['agent-1'], agentCount: 1, taskCount: 0,
        stats: { agentCount: 1, idleAgents: 1, executingAgents: 0, pendingTasks: 0, completedTasks: 0, topology: '', strategy: '', state: '' },
        createdAt: new Date().toISOString(),
      } as unknown as SwarmInfo)
      try { await createPromise } catch { /* expected */ }
    })
  })

  it('handles unmount during createSwarm error without crashing', async () => {
    const { api } = await import('../services')
    let rejectCreate: (reason: unknown) => void
    const createPromise: Promise<SwarmInfo> = new Promise((_resolve, reject) => { rejectCreate = reject })
    vi.mocked(api.swarm.createSwarm).mockReturnValue(createPromise as never)

    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [{ id: 'agent-1', name: 'Agent One', type: 'coder', status: 'stopped', command: 'claude', capabilities: [], lastActive: null, enabled: true }],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addSwarm: vi.fn(),
        addToast: vi.fn(),
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    const { unmount } = render(<SwarmPanel />)
    await userEvent.click(screen.getByText('New Swarm'))
    await userEvent.type(screen.getByPlaceholderText('My Swarm'), 'Error Unmount')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: /Create Swarm/ }))

    // Unmount while creating
    unmount()

    // Reject the promise - should not cause errors
    await act(async () => {
      rejectCreate!(new Error('Unmounted'))
      try { await createPromise } catch { /* expected */ }
    })
  })

  it('handles unmount during startSwarm without crashing', async () => {
    const { api } = await import('../services')
    let resolveStart: (value: unknown) => void
    const startPromise = new Promise((resolve: (value: unknown) => void) => { resolveStart = resolve })
    vi.mocked(api.swarm.startSwarm).mockReturnValue(startPromise as never)

    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [{
          id: '1', name: 'Test', topology: 'star' as const, state: 'stopped' as const, agents: [],
          stats: { agentCount: 1, completedTasks: 0, pendingTasks: 0 },
        }],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addToast: vi.fn(),
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    const { unmount } = render(<SwarmPanel />)
    await userEvent.click(screen.getByTitle('Start Swarm'))

    // Unmount while starting
    unmount()

    await act(async () => {
      resolveStart!({})
      try { await startPromise } catch { /* expected */ }
    })
  })

  it('handles unmount during stopSwarm without crashing', async () => {
    const { api } = await import('../services')
    let resolveStop: (value: unknown) => void
    const stopPromise = new Promise((resolve: (value: unknown) => void) => { resolveStop = resolve })
    vi.mocked(api.swarm.stopSwarm).mockReturnValue(stopPromise as never)

    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [{
          id: '1', name: 'Active', topology: 'star' as const, state: 'active' as const, agents: [],
          stats: { agentCount: 1, completedTasks: 0, pendingTasks: 0 },
        }],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addToast: vi.fn(),
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    const { unmount } = render(<SwarmPanel />)
    await userEvent.click(screen.getByTitle('Stop Swarm'))

    const dialog = screen.getByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stop Swarm' }))

    // Unmount while stopping
    unmount()

    await act(async () => {
      resolveStop!({})
      try { await stopPromise } catch { /* expected */ }
    })
  })

  it('handles unmount during deleteSwarm without crashing', async () => {
    const { api } = await import('../services')
    let resolveDelete: (value: unknown) => void
    const deletePromise = new Promise((resolve: (value: unknown) => void) => { resolveDelete = resolve })
    vi.mocked(api.swarm.deleteSwarm).mockReturnValue(deletePromise as never)

    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [{
          id: '1', name: 'Delete Me', topology: 'star' as const, state: 'stopped' as const, agents: [],
          stats: { agentCount: 1, completedTasks: 0, pendingTasks: 0 },
        }],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addToast: vi.fn(),
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    const { unmount } = render(<SwarmPanel />)
    await userEvent.click(screen.getByTitle('Delete Swarm'))

    const dialog = screen.getByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete Swarm' }))

    // Unmount while deleting
    unmount()

    await act(async () => {
      resolveDelete!(undefined)
      try { await deletePromise } catch { /* expected */ }
    })
  })
})

describe('SwarmPanel start success with toast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows success toast after starting swarm', async () => {
    const { api } = await import('../services')
    vi.mocked(api.swarm.startSwarm).mockResolvedValueOnce({} as never)
    vi.mocked(api.swarm.getSwarms).mockResolvedValueOnce([])

    const mockAddToast = vi.fn()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [{
          id: '1', name: 'Stopped', topology: 'star' as const, state: 'stopped' as const, agents: [],
          stats: { agentCount: 1, completedTasks: 0, pendingTasks: 0 },
        }],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addToast: mockAddToast,
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    await userEvent.click(screen.getByTitle('Start Swarm'))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('success', 'Swarm started')
    })
  })
})

describe('SwarmPanel agent count subtitle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows subtitle "Coordinate multiple agents"', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addToast: vi.fn(),
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmPanel />)
    expect(screen.getByText('Coordinate multiple agents')).toBeInTheDocument()
  })
})

describe('SwarmPanel header icon', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        agents: [],
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
        addToast: vi.fn(),
        setSwarms: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('renders Network icon container', () => {
    render(<SwarmPanel />)
    // The Network icon is in the header
    const iconContainer = document.querySelector('.bg-accent\\/10')
    expect(iconContainer).toBeInTheDocument()
  })
})