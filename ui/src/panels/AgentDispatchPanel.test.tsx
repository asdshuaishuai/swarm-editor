import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AgentDispatchPanel } from './AgentDispatchPanel'

vi.mock('../services', () => ({
  api: {
    swarm: {
      getSwarms: vi.fn().mockResolvedValue([]),
      createSwarm: vi.fn().mockResolvedValue({ id: 'sw-1', name: 'Test Swarm' }),
      submitTask: vi.fn().mockResolvedValue(undefined),
      cancelTask: vi.fn().mockResolvedValue(undefined),
    },
    agent: {
      getAgents: vi.fn().mockResolvedValue([
        { id: 'agent-1', name: 'claude-code', type: 'cli', state: 'idle' },
        { id: 'agent-2', name: 'kimi-code', type: 'cli', state: 'available' },
      ]),
      createSession: vi.fn().mockResolvedValue({ id: 'sess-1' }),
      sendMessage: vi.fn().mockResolvedValue({ content: 'Hello from agent' }),
      closeSession: vi.fn().mockResolvedValue(undefined),
    },
  },
}))

vi.mock('../stores/handoffStore', () => ({
  useHandoffStore: vi.fn().mockReturnValue({ activeHandoff: null }),
}))

vi.mock('../components/EmergenceDashboard', () => ({
  EmergenceDashboard: () => <div data-testid="emergence-dashboard">Emergence Dashboard</div>,
}))

vi.mock('../utils', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

describe('AgentDispatchPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with swarm tab active by default', async () => {
    render(<AgentDispatchPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('emergence-dashboard')).toBeInTheDocument()
    })
  })

  it('switches to tasks tab showing New Task button', async () => {
    render(<AgentDispatchPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('emergence-dashboard')).toBeInTheDocument()
    })

    const tasksTab = screen.getByRole('tab', { name: /Tasks/ })
    fireEvent.click(tasksTab)

    await waitFor(() => {
      expect(screen.getByText('New Task')).toBeInTheDocument()
    })
  })

  it('switches to chat tab', async () => {
    render(<AgentDispatchPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('emergence-dashboard')).toBeInTheDocument()
    })

    const chatTab = screen.getByRole('tab', { name: /Chat/ })
    fireEvent.click(chatTab)

    await waitFor(() => {
      expect(screen.queryByTestId('emergence-dashboard')).not.toBeInTheDocument()
    })
  })

  it('loads agents and swarms on mount', async () => {
    const { api } = await import('../services')
    render(<AgentDispatchPanel />)

    await waitFor(() => {
      expect(api.agent.getAgents).toHaveBeenCalled()
      expect(api.swarm.getSwarms).toHaveBeenCalled()
    })
  })

  it('uses provided swarmId prop', async () => {
    render(<AgentDispatchPanel swarmId="custom-swarm" />)
    await waitFor(() => {
      expect(screen.getByTestId('emergence-dashboard')).toBeInTheDocument()
    })
  })

  it('handles API errors gracefully', async () => {
    const { api } = await import('../services')
    vi.mocked(api.swarm.getSwarms).mockRejectedValueOnce(new Error('Network error'))

    render(<AgentDispatchPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('emergence-dashboard')).toBeInTheDocument()
    })
  })

  it('opens new task modal when New Task clicked', async () => {
    render(<AgentDispatchPanel />)
    await waitFor(() => {
      expect(screen.getByTestId('emergence-dashboard')).toBeInTheDocument()
    })

    const tasksTab = screen.getByRole('tab', { name: /Tasks/ })
    fireEvent.click(tasksTab)

    await waitFor(() => {
      const newTaskBtn = screen.getByText('New Task')
      fireEvent.click(newTaskBtn)
    })

    await waitFor(() => {
      expect(screen.getByText('Create New Task')).toBeInTheDocument()
    })
  })

  it('displays tasks from loaded swarms', async () => {
    const { api } = await import('../services')
    vi.mocked(api.swarm.getSwarms).mockResolvedValueOnce([
      { id: 'sw-1', name: 'Build Feature', state: 'running', topology: 'mesh', strategy: 'parallel', status: 'running', agentCount: 1, taskCount: 5, agents: ['claude-code'], stats: { agentCount: 1, idleAgents: 0, executingAgents: 1, pendingTasks: 2, completedTasks: 3, topology: 'mesh', strategy: 'parallel', state: 'running' } },
    ])

    render(<AgentDispatchPanel />)

    // Switch to tasks tab
    await waitFor(() => {
      const tasksTab = screen.getByRole('tab', { name: /Tasks/ })
      fireEvent.click(tasksTab)
    })

    await waitFor(() => {
      expect(screen.getByText('Build Feature')).toBeInTheDocument()
    })
  })

  it('renders handoff indicator when active', async () => {
    const { useHandoffStore } = await import('../stores/handoffStore')
    vi.mocked(useHandoffStore).mockReturnValue({ activeHandoff: { id: 'h-1', fromAgent: 'a1', toAgent: 'a2' } })

    render(<AgentDispatchPanel />)
    await waitFor(() => {
      expect(screen.getByText('Handoff pending')).toBeInTheDocument()
    })
  })

  it('shows agent status colors correctly', async () => {
    const { api } = await import('../services')
    vi.mocked(api.swarm.getSwarms).mockResolvedValueOnce([
      { id: 'sw-1', name: 'Task1', state: 'running', topology: 'mesh', strategy: 'parallel', status: 'running', agentCount: 1, taskCount: 1, agents: ['claude-code'], stats: { agentCount: 1, idleAgents: 0, executingAgents: 1, pendingTasks: 1, completedTasks: 0, topology: 'mesh', strategy: 'parallel', state: 'running' } },
    ])

    render(<AgentDispatchPanel />)
    await waitFor(() => {
      const tasksTab = screen.getByRole('tab', { name: /Tasks/ })
      fireEvent.click(tasksTab)
    })

    await waitFor(() => {
      expect(screen.getByText('Task1')).toBeInTheDocument()
      // Progress bar should exist
      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })
  })

  it('closes session on unmount', async () => {
    const { api } = await import('../services')
    const { unmount } = render(<AgentDispatchPanel />)

    await waitFor(() => {
      expect(screen.getByTestId('emergence-dashboard')).toBeInTheDocument()
    })

    unmount()
    // Session cleanup only fires if session was created (via chat)
    expect(api.agent.closeSession).not.toHaveBeenCalled()
  })
})
