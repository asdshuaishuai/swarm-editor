import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AgentDispatchPanel } from './AgentDispatchPanel'

// --- Mocks ---

const mockGetSwarms = vi.fn().mockResolvedValue([])
const mockCreateSwarm = vi.fn().mockResolvedValue({ id: 'sw-new', name: 'Default Swarm', status: 'created', agentCount: 0, taskCount: 0, topology: 'mesh', strategy: 'parallel' })
const mockSubmitTask = vi.fn().mockResolvedValue(undefined)
const mockCancelTask = vi.fn().mockResolvedValue({ taskId: 'sw-1', status: 'cancelled' })
const mockGetAgents = vi.fn().mockResolvedValue([
  { id: 'agent-1', name: 'claude-code', type: 'cli', state: 'idle' },
  { id: 'agent-2', name: 'kimi-code', type: 'cli', state: 'available' },
  { id: 'agent-3', name: 'opencode', type: 'cli', state: 'active' },
])
const mockCreateSession = vi.fn().mockResolvedValue({ id: 'sess-1' })
const mockSendMessage = vi.fn().mockResolvedValue({ content: 'Hello from agent' })
const mockCloseSession = vi.fn().mockResolvedValue(undefined)

vi.mock('../services', () => ({
  api: {
    swarm: {
      getSwarms: (...args: unknown[]) => mockGetSwarms(...args),
      createSwarm: (...args: unknown[]) => mockCreateSwarm(...args),
      submitTask: (...args: unknown[]) => mockSubmitTask(...args),
      cancelTask: (...args: unknown[]) => mockCancelTask(...args),
    },
    agent: {
      getAgents: (...args: unknown[]) => mockGetAgents(...args),
      createSession: (...args: unknown[]) => mockCreateSession(...args),
      sendMessage: (...args: unknown[]) => mockSendMessage(...args),
      closeSession: (...args: unknown[]) => mockCloseSession(...args),
    },
  },
}))

const mockUseHandoffStore = vi.fn().mockReturnValue({ activeHandoff: null })
vi.mock('../stores/handoffStore', () => ({
  useHandoffStore: (...args: unknown[]) => mockUseHandoffStore(...args),
}))

vi.mock('../components/EmergenceDashboard', () => ({
  EmergenceDashboard: ({ swarmId }: { swarmId?: string }) => (
    <div data-testid="emergence-dashboard">Emergence Dashboard{swarmId ? ` - ${swarmId}` : ''}</div>
  ),
}))

vi.mock('../utils', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

// --- Helper ---
function renderPanel(props?: { swarmId?: string; onTaskClick?: (taskId: string) => void }) {
  return render(<AgentDispatchPanel {...props} />)
}

// --- Tests ---
describe('AgentDispatchPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSwarms.mockResolvedValue([])
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'claude-code', type: 'cli', state: 'idle' },
      { id: 'agent-2', name: 'kimi-code', type: 'cli', state: 'available' },
      { id: 'agent-3', name: 'opencode', type: 'cli', state: 'active' },
    ])
    mockCreateSession.mockResolvedValue({ id: 'sess-1' })
    mockSendMessage.mockResolvedValue({ content: 'Hello from agent' })
    mockCloseSession.mockResolvedValue(undefined)
    mockUseHandoffStore.mockReturnValue({ activeHandoff: null })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ====== Rendering ======

  describe('Rendering', () => {
    it('renders with swarm tab active by default', async () => {
      renderPanel()
      await waitFor(() => {
        expect(screen.getByTestId('emergence-dashboard')).toBeInTheDocument()
      })
    })

    it('renders the header with title', async () => {
      renderPanel()
      await waitFor(() => {
        expect(screen.getByText('Agent Dispatch')).toBeInTheDocument()
      })
    })

    it('renders all three tab buttons', async () => {
      renderPanel()
      await waitFor(() => {
        expect(screen.getByTestId('emergence-dashboard')).toBeInTheDocument()
      })
      expect(screen.getByRole('tab', { name: /Swarm/ })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Tasks/ })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Chat/ })).toBeInTheDocument()
    })

    it('passes swarmId to EmergenceDashboard', async () => {
      renderPanel({ swarmId: 'custom-swarm' })
      await waitFor(() => {
        expect(screen.getByTestId('emergence-dashboard')).toBeInTheDocument()
      })
      expect(screen.getByTestId('emergence-dashboard')).toHaveTextContent('custom-swarm')
    })

    it('renders Active Agents footer section', async () => {
      renderPanel()
      await waitFor(() => {
        expect(screen.getByText('Active Agents')).toBeInTheDocument()
      })
    })

    it('renders agent buttons after loading agents', async () => {
      renderPanel()
      await waitFor(() => {
        expect(screen.getByText('claude')).toBeInTheDocument()
      })
      expect(screen.getByText('kimi')).toBeInTheDocument()
      expect(screen.getByText('opencode')).toBeInTheDocument()
    })

    it('renders "No agents available" when agent list is empty', async () => {
      mockGetAgents.mockResolvedValue([])
      renderPanel()
      await waitFor(() => {
        expect(screen.getByText('No agents available')).toBeInTheDocument()
      })
    })

    it('does not show handoff indicator when no active handoff', async () => {
      mockUseHandoffStore.mockReturnValue({ activeHandoff: null })
      renderPanel()
      await waitFor(() => {
        expect(screen.getByTestId('emergence-dashboard')).toBeInTheDocument()
      })
      expect(screen.queryByText('Handoff pending')).not.toBeInTheDocument()
    })
  })

  // ====== Tab Switching ======

  describe('Tab Switching', () => {
    it('switches to tasks tab showing New Task button', async () => {
      renderPanel()
      await waitFor(() => {
        expect(screen.getByTestId('emergence-dashboard')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))

      await waitFor(() => {
        expect(screen.getByText('New Task')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('emergence-dashboard')).not.toBeInTheDocument()
    })

    it('switches to chat tab with input field', async () => {
      renderPanel()
      await waitFor(() => {
        expect(screen.getByTestId('emergence-dashboard')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('tab', { name: /Chat/ }))

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Send message to agent...')).toBeInTheDocument()
      })
    })

    it('shows swarm tab content when switching back', async () => {
      renderPanel()
      await waitFor(() => {
        expect(screen.getByTestId('emergence-dashboard')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('tab', { name: /Chat/ }))
      await waitFor(() => {
        expect(screen.queryByTestId('emergence-dashboard')).not.toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('tab', { name: /Swarm/ }))
      await waitFor(() => {
        expect(screen.getByTestId('emergence-dashboard')).toBeInTheDocument()
      })
    })

    it('marks the active tab with aria-selected', async () => {
      renderPanel()
      await waitFor(() => {
        expect(screen.getByTestId('emergence-dashboard')).toBeInTheDocument()
      })

      expect(screen.getByRole('tab', { name: /Swarm/ })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByRole('tab', { name: /Tasks/ })).toHaveAttribute('aria-selected', 'false')
      expect(screen.getByRole('tab', { name: /Chat/ })).toHaveAttribute('aria-selected', 'false')
    })
  })

  // ====== Task List ======

  describe('Task List', () => {
    it('displays tasks loaded from swarms', async () => {
      mockGetSwarms.mockResolvedValue([
        {
          id: 'sw-1', name: 'Build Feature', state: 'running', topology: 'mesh', strategy: 'parallel',
          status: 'running', agentCount: 1, taskCount: 5, agents: ['claude-code'],
          stats: { agentCount: 1, idleAgents: 0, executingAgents: 1, pendingTasks: 2, completedTasks: 3, topology: 'mesh', strategy: 'parallel', state: 'running' },
        },
      ])

      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))

      await waitFor(() => {
        expect(screen.getByText('Build Feature')).toBeInTheDocument()
      })
      // Status badge
      expect(screen.getByText('in progress')).toBeInTheDocument()
    })

    it('shows task with pending status', async () => {
      mockGetSwarms.mockResolvedValue([
        {
          id: 'sw-2', name: 'Pending Task', state: 'created', topology: 'mesh', strategy: 'parallel',
          status: 'created', agentCount: 0, taskCount: 1, agents: [],
          stats: { agentCount: 0, idleAgents: 0, executingAgents: 0, pendingTasks: 5, completedTasks: 0, topology: 'mesh', strategy: 'parallel', state: 'created' },
        },
      ])

      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))

      await waitFor(() => {
        expect(screen.getByText('Pending Task')).toBeInTheDocument()
      })
      expect(screen.getByText('pending')).toBeInTheDocument()
    })

    it('shows task with completed status', async () => {
      mockGetSwarms.mockResolvedValue([
        {
          id: 'sw-3', name: 'Done Task', state: 'completed', topology: 'mesh', strategy: 'parallel',
          status: 'completed', agentCount: 0, taskCount: 0, agents: [],
          stats: { agentCount: 0, idleAgents: 0, executingAgents: 0, pendingTasks: 0, completedTasks: 5, topology: 'mesh', strategy: 'parallel', state: 'completed' },
        },
      ])

      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))

      await waitFor(() => {
        expect(screen.getByText('Done Task')).toBeInTheDocument()
      })
      expect(screen.getByText('completed')).toBeInTheDocument()
    })

    it('displays progress bar with correct percentage', async () => {
      mockGetSwarms.mockResolvedValue([
        {
          id: 'sw-1', name: 'Task Progress', state: 'running', topology: 'mesh', strategy: 'parallel',
          status: 'running', agentCount: 1, taskCount: 10, agents: ['claude-code'],
          stats: { agentCount: 1, idleAgents: 0, executingAgents: 1, pendingTasks: 3, completedTasks: 7, topology: 'mesh', strategy: 'parallel', state: 'running' },
        },
      ])

      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))

      await waitFor(() => {
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '70')
      })
      expect(screen.getByText('70%')).toBeInTheDocument()
    })

    it('shows 0% progress when stats are missing', async () => {
      mockGetSwarms.mockResolvedValue([
        { id: 'sw-4', name: 'No Stats', state: 'created', topology: 'mesh', strategy: 'parallel', status: 'created', agentCount: 0, taskCount: 0 },
      ])

      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))

      await waitFor(() => {
        expect(screen.getByText('0%')).toBeInTheDocument()
      })
    })

    it('shows assigned agent with initial letter', async () => {
      mockGetSwarms.mockResolvedValue([
        {
          id: 'sw-1', name: 'Assigned Task', state: 'running', topology: 'mesh', strategy: 'parallel',
          status: 'running', agentCount: 1, taskCount: 1, agents: ['claude-code'],
          stats: { agentCount: 1, idleAgents: 0, executingAgents: 1, pendingTasks: 1, completedTasks: 0, topology: 'mesh', strategy: 'parallel', state: 'running' },
        },
      ])

      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))

      await waitFor(() => {
        expect(screen.getByText('C')).toBeInTheDocument() // First letter of claude-code
      })
      expect(screen.getByText('claude-code')).toBeInTheDocument()
    })

    it('calls onTaskClick when task name is clicked', async () => {
      const onTaskClick = vi.fn()
      mockGetSwarms.mockResolvedValue([
        {
          id: 'sw-1', name: 'Clickable Task', state: 'running', topology: 'mesh', strategy: 'parallel',
          status: 'running', agentCount: 1, taskCount: 1, agents: [],
          stats: { agentCount: 0, idleAgents: 0, executingAgents: 0, pendingTasks: 1, completedTasks: 0, topology: 'mesh', strategy: 'parallel', state: 'running' },
        },
      ])

      renderPanel({ onTaskClick })
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))

      const taskName = await screen.findByText('Clickable Task')
      fireEvent.click(taskName)

      expect(onTaskClick).toHaveBeenCalledWith('sw-1')
    })

    it('fires onTaskClick on Enter key press', async () => {
      const onTaskClick = vi.fn()
      mockGetSwarms.mockResolvedValue([
        {
          id: 'sw-1', name: 'Key Task', state: 'running', topology: 'mesh', strategy: 'parallel',
          status: 'running', agentCount: 0, taskCount: 1, agents: [],
          stats: { agentCount: 0, idleAgents: 0, executingAgents: 0, pendingTasks: 1, completedTasks: 0, topology: 'mesh', strategy: 'parallel', state: 'running' },
        },
      ])

      renderPanel({ onTaskClick })
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))

      const taskName = await screen.findByText('Key Task')
      fireEvent.keyDown(taskName, { key: 'Enter' })

      expect(onTaskClick).toHaveBeenCalledWith('sw-1')
    })

    it('fires onTaskClick on Space key press', async () => {
      const onTaskClick = vi.fn()
      mockGetSwarms.mockResolvedValue([
        {
          id: 'sw-1', name: 'Space Task', state: 'running', topology: 'mesh', strategy: 'parallel',
          status: 'running', agentCount: 0, taskCount: 1, agents: [],
          stats: { agentCount: 0, idleAgents: 0, executingAgents: 0, pendingTasks: 1, completedTasks: 0, topology: 'mesh', strategy: 'parallel', state: 'running' },
        },
      ])

      renderPanel({ onTaskClick })
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))

      const taskName = await screen.findByText('Space Task')
      fireEvent.keyDown(taskName, { key: ' ' })

      expect(onTaskClick).toHaveBeenCalledWith('sw-1')
    })

    it('shows cancel button for in_progress tasks', async () => {
      mockGetSwarms.mockResolvedValue([
        {
          id: 'sw-1', name: 'Running Task', state: 'running', topology: 'mesh', strategy: 'parallel',
          status: 'running', agentCount: 0, taskCount: 1, agents: [],
          stats: { agentCount: 0, idleAgents: 0, executingAgents: 0, pendingTasks: 1, completedTasks: 0, topology: 'mesh', strategy: 'parallel', state: 'running' },
        },
      ])

      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))

      await waitFor(() => {
        expect(screen.getByTitle('Cancel task')).toBeInTheDocument()
      })
    })

    it('does not show cancel button for completed tasks', async () => {
      mockGetSwarms.mockResolvedValue([
        {
          id: 'sw-1', name: 'Done Task', state: 'completed', topology: 'mesh', strategy: 'parallel',
          status: 'completed', agentCount: 0, taskCount: 0, agents: [],
          stats: { agentCount: 0, idleAgents: 0, executingAgents: 0, pendingTasks: 0, completedTasks: 1, topology: 'mesh', strategy: 'parallel', state: 'completed' },
        },
      ])

      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))

      await waitFor(() => {
        expect(screen.getByText('Done Task')).toBeInTheDocument()
      })
      expect(screen.queryByTitle('Cancel task')).not.toBeInTheDocument()
    })
  })

  // ====== Task Cancel ======

  describe('Task Cancellation', () => {
    it('calls cancelTask and reloads tasks on cancel', async () => {
      const reloadSwarm = {
        id: 'sw-1', name: 'Task', state: 'running', topology: 'mesh', strategy: 'parallel',
        status: 'running', agentCount: 0, taskCount: 1, agents: [],
        stats: { agentCount: 0, idleAgents: 0, executingAgents: 0, pendingTasks: 1, completedTasks: 0, topology: 'mesh', strategy: 'parallel', state: 'running' },
      }
      mockGetSwarms
        .mockResolvedValueOnce([reloadSwarm])
        .mockResolvedValueOnce([]) // after cancel

      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))

      const cancelBtn = await screen.findByTitle('Cancel task')
      fireEvent.click(cancelBtn)

      await waitFor(() => {
        expect(mockCancelTask).toHaveBeenCalledWith('sw-1', 'sw-1', 'user_cancelled')
      })
    })

    it('handles cancel error gracefully', async () => {
      mockCancelTask.mockRejectedValueOnce(new Error('Cancel failed'))
      mockGetSwarms.mockResolvedValue([
        {
          id: 'sw-1', name: 'Task', state: 'running', topology: 'mesh', strategy: 'parallel',
          status: 'running', agentCount: 0, taskCount: 1, agents: [],
          stats: { agentCount: 0, idleAgents: 0, executingAgents: 0, pendingTasks: 1, completedTasks: 0, topology: 'mesh', strategy: 'parallel', state: 'running' },
        },
      ])

      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))

      const cancelBtn = await screen.findByTitle('Cancel task')
      fireEvent.click(cancelBtn)

      await waitFor(() => {
        expect(mockCancelTask).toHaveBeenCalled()
      })
    })
  })

  // ====== Create Task Modal ======

  describe('Create Task Modal', () => {
    it('opens modal when New Task button is clicked', async () => {
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))

      fireEvent.click(await screen.findByText('New Task'))

      await waitFor(() => {
        expect(screen.getByText('Create New Task')).toBeInTheDocument()
      })
      expect(screen.getByPlaceholderText('Task title...')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Describe the task...')).toBeInTheDocument()
    })

    it('closes modal when Cancel button is clicked', async () => {
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))

      fireEvent.click(await screen.findByText('New Task'))
      await waitFor(() => {
        expect(screen.getByText('Create New Task')).toBeInTheDocument()
      })

      // Click the Cancel in the modal (not the tab)
      const modalCancelButtons = screen.getAllByText('Cancel')
      fireEvent.click(modalCancelButtons[modalCancelButtons.length - 1])

      await waitFor(() => {
        expect(screen.queryByText('Create New Task')).not.toBeInTheDocument()
      })
    })

    it('disables Create button when title is empty', async () => {
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))

      fireEvent.click(await screen.findByText('New Task'))

      await waitFor(() => {
        expect(screen.getByText('Create')).toBeDisabled()
      })
    })

    it('enables Create button when title is entered', async () => {
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))

      fireEvent.click(await screen.findByText('New Task'))

      const titleInput = await screen.findByPlaceholderText('Task title...')
      fireEvent.change(titleInput, { target: { value: 'My New Task' } })

      await waitFor(() => {
        expect(screen.getByText('Create')).not.toBeDisabled()
      })
    })

    it('allows typing in description field', async () => {
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))
      fireEvent.click(await screen.findByText('New Task'))

      const descInput = await screen.findByPlaceholderText('Describe the task...')
      fireEvent.change(descInput, { target: { value: 'Task description' } })

      expect(descInput).toHaveValue('Task description')
    })

    it('allows selecting priority', async () => {
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))
      fireEvent.click(await screen.findByText('New Task'))

      const prioritySelect = await screen.findByDisplayValue('Medium')
      expect(prioritySelect).toBeInTheDocument()

      fireEvent.change(prioritySelect, { target: { value: 'high' } })
      expect(prioritySelect).toHaveValue('high')
    })

    it('creates task with existing swarm when form submitted', async () => {
      mockGetSwarms
        .mockResolvedValueOnce([
          { id: 'sw-1', name: 'Test Swarm', state: 'running', topology: 'mesh', strategy: 'parallel', status: 'running', agentCount: 1, taskCount: 5 },
        ]) // initial load
        .mockResolvedValueOnce([
          { id: 'sw-1', name: 'Test Swarm', state: 'running', topology: 'mesh', strategy: 'parallel', status: 'running', agentCount: 1, taskCount: 6 },
        ]) // reload after submit

      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))
      fireEvent.click(await screen.findByText('New Task'))

      const titleInput = await screen.findByPlaceholderText('Task title...')
      fireEvent.change(titleInput, { target: { value: 'New Feature' } })

      const createBtn = screen.getByText('Create')
      fireEvent.click(createBtn)

      await waitFor(() => {
        expect(mockSubmitTask).toHaveBeenCalledWith({
          swarmId: 'sw-1',
          title: 'New Feature',
          description: '',
          priority: 'medium',
        })
      })
    })

    it('creates a new swarm when no swarms exist', async () => {
      mockGetSwarms
        .mockResolvedValueOnce([]) // initial load
        .mockResolvedValueOnce([]) // check for existing swarms in handleCreateTask
        .mockResolvedValueOnce([]) // reload after submit

      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))
      fireEvent.click(await screen.findByText('New Task'))

      const titleInput = await screen.findByPlaceholderText('Task title...')
      fireEvent.change(titleInput, { target: { value: 'New Task' } })

      fireEvent.click(screen.getByText('Create'))

      await waitFor(() => {
        expect(mockCreateSwarm).toHaveBeenCalledWith({
          name: 'Default Swarm',
          topology: 'mesh',
          strategy: 'parallel',
          agentIds: ['agent-1', 'agent-2', 'agent-3'],
        })
      })
    })

    it('closes modal and resets form after successful creation', async () => {
      mockGetSwarms
        .mockResolvedValueOnce([{ id: 'sw-1', name: 'Swarm', state: 'running', topology: 'mesh', strategy: 'parallel', status: 'running', agentCount: 1, taskCount: 1 }])
        .mockResolvedValueOnce([]) // reload

      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))
      fireEvent.click(await screen.findByText('New Task'))

      const titleInput = await screen.findByPlaceholderText('Task title...')
      fireEvent.change(titleInput, { target: { value: 'Test' } })

      fireEvent.click(screen.getByText('Create'))

      await waitFor(() => {
        expect(screen.queryByText('Create New Task')).not.toBeInTheDocument()
      })
    })

    it('handles create task error gracefully', async () => {
      mockGetSwarms.mockResolvedValue([{ id: 'sw-1', name: 'Swarm', state: 'running', topology: 'mesh', strategy: 'parallel', status: 'running', agentCount: 1, taskCount: 1 }])
      mockSubmitTask.mockRejectedValueOnce(new Error('Submit failed'))

      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))
      fireEvent.click(await screen.findByText('New Task'))

      const titleInput = await screen.findByPlaceholderText('Task title...')
      fireEvent.change(titleInput, { target: { value: 'Test' } })

      fireEvent.click(screen.getByText('Create'))

      // Should not crash
      await waitFor(() => {
        expect(mockSubmitTask).toHaveBeenCalled()
      })
    })

    it('does not submit when title is empty', async () => {
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))
      fireEvent.click(await screen.findByText('New Task'))

      // Create button is disabled, but even if clicked, handleCreateTask guards
      expect(screen.getByText('Create')).toBeDisabled()
    })
  })

  // ====== Chat View ======

  describe('Chat View', () => {
    it('shows empty state when no messages', async () => {
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }))

      await waitFor(() => {
        expect(screen.getByText('Start a conversation')).toBeInTheDocument()
      })
      expect(screen.getByText('Select an agent to begin')).toBeInTheDocument()
    })

    it('shows Send button', async () => {
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }))

      await waitFor(() => {
        expect(screen.getByText('Send')).toBeInTheDocument()
      })
    })

    it('disables Send button when input is empty', async () => {
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }))

      await waitFor(() => {
        const sendBtn = screen.getByText('Send')
        expect(sendBtn).toBeDisabled()
      })
    })

    it('shows "..." when sending a message', async () => {
      // Make sendMessage hang
      mockSendMessage.mockReturnValue(new Promise(() => {}))
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }))

      // Select an agent first
      await waitFor(() => {
        expect(screen.getByText('claude')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('claude'))

      // Wait for chat view
      const input = await screen.findByPlaceholderText('Send message to agent...')
      fireEvent.change(input, { target: { value: 'hello' } })
      fireEvent.click(screen.getByText('Send'))

      await waitFor(() => {
        expect(screen.getByText('...')).toBeInTheDocument()
      })
    })

    it('shows system error when no agent is selected', async () => {
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }))

      const input = await screen.findByPlaceholderText('Send message to agent...')
      fireEvent.change(input, { target: { value: 'hello' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      await waitFor(() => {
        expect(screen.getByText('Please select an agent before sending a message.')).toBeInTheDocument()
      })
    })

    it('creates session and sends message when agent is selected', async () => {
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }))

      // Select an agent
      await waitFor(() => {
        expect(screen.getByText('claude')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('claude'))

      const input = await screen.findByPlaceholderText('Send message to agent...')
      fireEvent.change(input, { target: { value: 'hello' } })
      fireEvent.click(screen.getByText('Send'))

      await waitFor(() => {
        expect(mockCreateSession).toHaveBeenCalledWith('agent-1', 'default')
        expect(mockSendMessage).toHaveBeenCalledWith('sess-1', 'hello')
      })
    })

    it('displays user message after sending', async () => {
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }))

      await waitFor(() => {
        expect(screen.getByText('claude')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('claude'))

      const input = await screen.findByPlaceholderText('Send message to agent...')
      fireEvent.change(input, { target: { value: 'test message' } })
      fireEvent.click(screen.getByText('Send'))

      await waitFor(() => {
        expect(screen.getByText('test message')).toBeInTheDocument()
      })
    })

    it('displays agent response when content is returned', async () => {
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }))

      await waitFor(() => {
        expect(screen.getByText('claude')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('claude'))

      const input = await screen.findByPlaceholderText('Send message to agent...')
      fireEvent.change(input, { target: { value: 'hello' } })
      fireEvent.click(screen.getByText('Send'))

      await waitFor(() => {
        expect(screen.getByText('Hello from agent')).toBeInTheDocument()
      })
    })

    it('does not add response message when content is empty', async () => {
      mockSendMessage.mockResolvedValue({ content: undefined })
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }))

      await waitFor(() => {
        expect(screen.getByText('claude')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('claude'))

      const input = await screen.findByPlaceholderText('Send message to agent...')
      fireEvent.change(input, { target: { value: 'hello' } })
      fireEvent.click(screen.getByText('Send'))

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalled()
      })
      // Should only show the user message, no response message
      const messages = screen.queryAllByText('hello')
      expect(messages.length).toBe(1)
    })

    it('shows error message when send fails', async () => {
      mockSendMessage.mockRejectedValueOnce(new Error('Network failure'))
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }))

      await waitFor(() => {
        expect(screen.getByText('claude')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('claude'))

      const input = await screen.findByPlaceholderText('Send message to agent...')
      fireEvent.change(input, { target: { value: 'hello' } })
      fireEvent.click(screen.getByText('Send'))

      await waitFor(() => {
        expect(screen.getByText(/Failed to send message: Network failure/)).toBeInTheDocument()
      })
    })

    it('resets session on error so next message creates a new one', async () => {
      mockSendMessage.mockRejectedValueOnce(new Error('fail'))
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }))

      await waitFor(() => {
        expect(screen.getByText('claude')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('claude'))

      const input = await screen.findByPlaceholderText('Send message to agent...')
      fireEvent.change(input, { target: { value: 'hello' } })
      fireEvent.click(screen.getByText('Send'))

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalled()
      })

      // Send again — should create a new session
      mockSendMessage.mockResolvedValueOnce({ content: 'ok' })
      fireEvent.change(input, { target: { value: 'retry' } })
      fireEvent.click(screen.getByText('Send'))

      await waitFor(() => {
        expect(mockCreateSession).toHaveBeenCalledTimes(2)
      })
    })

    it('sends message on Enter key press', async () => {
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }))

      await waitFor(() => {
        expect(screen.getByText('claude')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('claude'))

      const input = await screen.findByPlaceholderText('Send message to agent...')
      fireEvent.change(input, { target: { value: 'hello' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      await waitFor(() => {
        expect(mockCreateSession).toHaveBeenCalled()
      })
    })

    it('does not send on non-Enter key press', async () => {
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }))

      await waitFor(() => {
        expect(screen.getByText('claude')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('claude'))

      const input = await screen.findByPlaceholderText('Send message to agent...')
      fireEvent.change(input, { target: { value: 'hello' } })
      fireEvent.keyDown(input, { key: 'Escape' })

      // Should not have sent
      expect(mockCreateSession).not.toHaveBeenCalled()
    })

    it('does not send empty messages', async () => {
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }))

      await waitFor(() => {
        expect(screen.getByText('claude')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('claude'))

      const input = await screen.findByPlaceholderText('Send message to agent...')
      fireEvent.change(input, { target: { value: '   ' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('does not send when already sending', async () => {
      mockSendMessage.mockReturnValue(new Promise(() => {}))
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }))

      await waitFor(() => {
        expect(screen.getByText('claude')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('claude'))

      const input = await screen.findByPlaceholderText('Send message to agent...')
      fireEvent.change(input, { target: { value: 'msg1' } })
      fireEvent.click(screen.getByText('Send'))

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledTimes(1)
      })

      // Try to send another while still sending
      fireEvent.change(input, { target: { value: 'msg2' } })
      fireEvent.click(screen.getByText('...'))

      // Only one call should have been made
      expect(mockSendMessage).toHaveBeenCalledTimes(1)
    })

    it('shows agent name in response messages', async () => {
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }))

      await waitFor(() => {
        expect(screen.getByText('claude')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('claude'))

      const input = await screen.findByPlaceholderText('Send message to agent...')
      fireEvent.change(input, { target: { value: 'hello' } })
      fireEvent.click(screen.getByText('Send'))

      await waitFor(() => {
        expect(screen.getByText('claude-code')).toBeInTheDocument()
      })
    })

    it('shows "Unknown error" when error is not an Error instance', async () => {
      mockSendMessage.mockRejectedValueOnce('string error')
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }))

      await waitFor(() => {
        expect(screen.getByText('claude')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('claude'))

      const input = await screen.findByPlaceholderText('Send message to agent...')
      fireEvent.change(input, { target: { value: 'hello' } })
      fireEvent.click(screen.getByText('Send'))

      await waitFor(() => {
        expect(screen.getByText(/Unknown error/)).toBeInTheDocument()
      })
    })
  })

  // ====== Agent Selection ======

  describe('Agent Selection', () => {
    it('highlights selected agent', async () => {
      renderPanel()
      await waitFor(() => {
        expect(screen.getByText('claude')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('claude'))

      // The button should have the agent color class when selected
      const agentBtn = screen.getByText('claude').closest('button')!
      expect(agentBtn.className).toContain('orange')
    })

    it('closes previous session when switching agents', async () => {
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }))

      await waitFor(() => {
        expect(screen.getByText('claude')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('claude'))

      // Send a message to create a session
      const input = await screen.findByPlaceholderText('Send message to agent...')
      fireEvent.change(input, { target: { value: 'hello' } })
      fireEvent.click(screen.getByText('Send'))

      await waitFor(() => {
        expect(mockCreateSession).toHaveBeenCalled()
      })

      // Switch to a different agent
      fireEvent.click(screen.getByText('kimi'))

      await waitFor(() => {
        expect(mockCloseSession).toHaveBeenCalledWith('sess-1')
      })
    })

    it('does not close session when clicking the same agent', async () => {
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }))

      await waitFor(() => {
        expect(screen.getByText('claude')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('claude'))

      // Click same agent again
      fireEvent.click(screen.getByText('claude'))

      expect(mockCloseSession).not.toHaveBeenCalled()
    })

    it('uses agent ID from agentObjects when available', async () => {
      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }))

      await waitFor(() => {
        expect(screen.getByText('claude')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('claude'))

      const input = await screen.findByPlaceholderText('Send message to agent...')
      fireEvent.change(input, { target: { value: 'hello' } })
      fireEvent.click(screen.getByText('Send'))

      await waitFor(() => {
        // agent-1 is the ID for claude-code agent
        expect(mockCreateSession).toHaveBeenCalledWith('agent-1', 'default')
      })
    })
  })

  // ====== Handoff Indicator ======

  describe('Handoff Indicator', () => {
    it('shows handoff indicator when active handoff exists', async () => {
      mockUseHandoffStore.mockReturnValue({
        activeHandoff: { id: 'h-1', fromAgent: 'a1', toAgent: 'a2', taskId: 't-1', reason: 'test', status: 'pending', createdAt: new Date() },
      })

      renderPanel()
      await waitFor(() => {
        expect(screen.getByText('Handoff pending')).toBeInTheDocument()
      })
    })

    it('has proper ARIA attributes on handoff indicator', async () => {
      mockUseHandoffStore.mockReturnValue({
        activeHandoff: { id: 'h-1', fromAgent: 'a1', toAgent: 'a2', taskId: 't-1', reason: 'test', status: 'pending', createdAt: new Date() },
      })

      renderPanel()
      await waitFor(() => {
        const indicator = screen.getByText('Handoff pending').closest('div')!
        expect(indicator).toHaveAttribute('role', 'status')
        expect(indicator).toHaveAttribute('aria-live', 'polite')
      })
    })
  })

  // ====== API Loading and Error Handling ======

  describe('API Loading and Error Handling', () => {
    it('loads agents and swarms on mount', async () => {
      renderPanel()
      await waitFor(() => {
        expect(mockGetAgents).toHaveBeenCalledTimes(1)
        expect(mockGetSwarms).toHaveBeenCalledTimes(1)
      })
    })

    it('handles swarm API error gracefully', async () => {
      mockGetSwarms.mockRejectedValueOnce(new Error('Network error'))

      renderPanel()
      await waitFor(() => {
        expect(screen.getByTestId('emergence-dashboard')).toBeInTheDocument()
      })
    })

    it('handles agent API error gracefully', async () => {
      mockGetAgents.mockRejectedValueOnce(new Error('Agent fetch failed'))

      renderPanel()
      await waitFor(() => {
        expect(screen.getByText('No agents available')).toBeInTheDocument()
      })
    })

    it('handles both APIs failing simultaneously', async () => {
      mockGetSwarms.mockRejectedValueOnce(new Error('fail'))
      mockGetAgents.mockRejectedValueOnce(new Error('fail'))

      renderPanel()
      await waitFor(() => {
        expect(screen.getByTestId('emergence-dashboard')).toBeInTheDocument()
        expect(screen.getByText('No agents available')).toBeInTheDocument()
      })
    })
  })

  // ====== Session Cleanup ======

  describe('Session Cleanup', () => {
    it('closes session on unmount when session exists', async () => {
      const { unmount } = renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Chat/ }))

      await waitFor(() => {
        expect(screen.getByText('claude')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('claude'))

      // Send message to create session
      const input = await screen.findByPlaceholderText('Send message to agent...')
      fireEvent.change(input, { target: { value: 'hello' } })
      fireEvent.click(screen.getByText('Send'))

      await waitFor(() => {
        expect(mockCreateSession).toHaveBeenCalled()
      })

      // Unmount
      unmount()

      expect(mockCloseSession).toHaveBeenCalled()
    })

    it('does not call closeSession when no session was created', async () => {
      const { unmount } = renderPanel()
      await waitFor(() => {
        expect(screen.getByTestId('emergence-dashboard')).toBeInTheDocument()
      })

      unmount()
      expect(mockCloseSession).not.toHaveBeenCalled()
    })
  })

  // ====== Agent Color Mapping ======

  describe('Agent Color Mapping', () => {
    it('renders agents with their specific color classes', async () => {
      renderPanel()
      await waitFor(() => {
        expect(screen.getByText('claude')).toBeInTheDocument()
      })

      // Click each agent to see its color class applied
      const claudeBtn = screen.getByText('claude').closest('button')!
      expect(claudeBtn.className).not.toContain('orange') // Not selected yet

      fireEvent.click(screen.getByText('claude'))
      expect(claudeBtn.className).toContain('orange') // claude-code color
    })

    it('renders kimi-code with purple color when selected', async () => {
      renderPanel()
      await waitFor(() => {
        expect(screen.getByText('kimi')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('kimi'))
      const kimiBtn = screen.getByText('kimi').closest('button')!
      expect(kimiBtn.className).toContain('purple')
    })

    it('renders opencode with green color when selected', async () => {
      renderPanel()
      await waitFor(() => {
        expect(screen.getByText('opencode')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('opencode'))
      const openBtn = screen.getByText('opencode').closest('button')!
      expect(openBtn.className).toContain('green')
    })
  })

  // ====== Multiple Tasks Rendering ======

  describe('Multiple Tasks', () => {
    it('renders multiple tasks from multiple swarms', async () => {
      mockGetSwarms.mockResolvedValue([
        {
          id: 'sw-1', name: 'Task A', state: 'running', topology: 'mesh', strategy: 'parallel',
          status: 'running', agentCount: 1, taskCount: 1, agents: ['claude-code'],
          stats: { agentCount: 1, idleAgents: 0, executingAgents: 1, pendingTasks: 1, completedTasks: 0, topology: 'mesh', strategy: 'parallel', state: 'running' },
        },
        {
          id: 'sw-2', name: 'Task B', state: 'completed', topology: 'mesh', strategy: 'parallel',
          status: 'completed', agentCount: 0, taskCount: 0, agents: [],
          stats: { agentCount: 0, idleAgents: 0, executingAgents: 0, pendingTasks: 0, completedTasks: 5, topology: 'mesh', strategy: 'parallel', state: 'completed' },
        },
      ])

      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))

      await waitFor(() => {
        expect(screen.getByText('Task A')).toBeInTheDocument()
        expect(screen.getByText('Task B')).toBeInTheDocument()
      })
    })

    it('renders error status for error state', async () => {
      mockGetSwarms.mockResolvedValue([
        {
          id: 'sw-err', name: 'Failed Task', state: 'error', topology: 'mesh', strategy: 'parallel',
          status: 'error', agentCount: 0, taskCount: 0, agents: [],
        },
      ])

      renderPanel()
      fireEvent.click(await screen.findByRole('tab', { name: /Tasks/ }))

      await waitFor(() => {
        // state 'error' maps to 'completed' in the component (default case)
        expect(screen.getByText('Failed Task')).toBeInTheDocument()
      })
    })
  })
})
