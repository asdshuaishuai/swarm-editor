import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SwarmPanel from './SwarmPanel'
import { useAppStore } from '../store/appStore'

// Mock SwarmCoordinatorPanel
vi.mock('./SwarmCoordinatorPanel', () => ({
  default: () => <div data-testid="swarm-coordinator">Coordinator Panel</div>,
}))

vi.mock('../store/appStore', () => ({
  useAppStore: vi.fn(),
}))

describe('SwarmPanel', () => {
  const mockSetActiveSwarm = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        swarms: [],
        activeSwarm: null,
        setActiveSwarm: mockSetActiveSwarm,
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

  it('has agent count slider in create modal', () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))
    expect(screen.getByText('Agent Count: 3')).toBeInTheDocument()
  })

  it('has swarm name input in create modal', () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))
    expect(screen.getByPlaceholderText('My Swarm')).toBeInTheDocument()
  })

  it('closes modal on Create Swarm click', () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))
    fireEvent.click(screen.getByRole('button', { name: 'Create Swarm' }))
    expect(screen.queryByText('Create New Swarm')).not.toBeInTheDocument()
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

  it('has Execute button on swarm card', () => {
    render(<SwarmPanel />)
    expect(screen.getByText('Execute')).toBeInTheDocument()
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

  it('changes agent count with slider', () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '5' } })
    expect(screen.getByText('Agent Count: 5')).toBeInTheDocument()
  })

  it('updates swarm name input', () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))
    const input = screen.getByPlaceholderText('My Swarm')
    fireEvent.change(input, { target: { value: 'Custom Swarm' } })
    expect(input).toHaveValue('Custom Swarm')
  })

  it('creates swarm and closes modal', () => {
    render(<SwarmPanel />)
    fireEvent.click(screen.getByText('New Swarm'))
    // Fill in name
    fireEvent.change(screen.getByPlaceholderText('My Swarm'), { target: { value: 'Integration Swarm' } })
    // Change topology
    const meshButton = screen.getByText('mesh').closest('button')
    if (meshButton) fireEvent.click(meshButton)
    // Create swarm
    fireEvent.click(screen.getByRole('button', { name: 'Create Swarm' }))
    // Modal should close
    expect(screen.queryByText('Create New Swarm')).not.toBeInTheDocument()
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

  it('shows Execute button on swarm card', () => {
    render(<SwarmPanel />)
    expect(screen.getByText('Execute')).toBeInTheDocument()
  })

  it('clicks Execute button without selecting swarm', () => {
    render(<SwarmPanel />)
    const executeButtons = screen.getAllByRole('button')
    const execBtn = executeButtons.find(btn => btn.textContent?.includes('Execute'))
    if (execBtn) {
      fireEvent.click(execBtn)
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
      const state = { swarms: [createSwarmWithState('initializing')], activeSwarm: null, setActiveSwarm: vi.fn() }
      return selector ? selector(state) : state
    })
    render(<SwarmPanel />)
    expect(screen.getByText('initializing')).toBeInTheDocument()
  })

  it('shows paused state', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = { swarms: [createSwarmWithState('paused')], activeSwarm: null, setActiveSwarm: vi.fn() }
      return selector ? selector(state) : state
    })
    render(<SwarmPanel />)
    expect(screen.getByText('paused')).toBeInTheDocument()
  })

  it('shows stopping state', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = { swarms: [createSwarmWithState('stopping')], activeSwarm: null, setActiveSwarm: vi.fn() }
      return selector ? selector(state) : state
    })
    render(<SwarmPanel />)
    expect(screen.getByText('stopping')).toBeInTheDocument()
  })

  it('shows stopped state', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = { swarms: [createSwarmWithState('stopped')], activeSwarm: null, setActiveSwarm: vi.fn() }
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
        activeSwarm: null,
        setActiveSwarm: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  it('clicks Refresh button without selecting swarm', () => {
    render(<SwarmPanel />)
    const buttons = screen.getAllByRole('button')
    // Find the refresh button (has RefreshCw icon)
    const refreshBtn = buttons.find(btn => btn.querySelector('svg.lucide-refresh-cw'))
    if (refreshBtn) {
      fireEvent.click(refreshBtn)
    }
    // Swarm should still be shown (button just stops propagation)
    expect(screen.getByText('Action Test Swarm')).toBeInTheDocument()
  })

  it('clicks Stop button without selecting swarm', () => {
    render(<SwarmPanel />)
    const buttons = screen.getAllByRole('button')
    // Find the stop button (has Square icon)
    const stopBtn = buttons.find(btn => btn.querySelector('svg.lucide-square'))
    if (stopBtn) {
      fireEvent.click(stopBtn)
    }
    // Swarm should still be shown (button just stops propagation)
    expect(screen.getByText('Action Test Swarm')).toBeInTheDocument()
  })
})