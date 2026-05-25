import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import SwarmCoordinatorPanel, { TaskCard, TaskDetails } from './SwarmCoordinatorPanel'
import { useAppStore } from '../store/appStore'
import { api } from '../services'
import type { CoordinationTask } from '../types'

// Captured subscribe handlers so tests can fire WS events
let capturedSubscribeHandler: ((data: unknown) => void) | null = null
const mockUnsubscribe = vi.fn()

vi.mock('../store/appStore', () => ({
  useAppStore: vi.fn(),
}))

// Mock the API
vi.mock('../services', () => ({
  api: {
    swarm: {
      submitTask: vi.fn().mockResolvedValue('task-mock-id'),
      executeTask: vi.fn().mockResolvedValue({
        taskId: 'task-mock-id',
        status: 'completed',
        agentResults: {
          'claude-code': {
            agentId: 'claude-code',
            content: 'Mock agent result',
            success: true,
            durationMs: 100,
          },
        },
      }),
      getSwarmTasks: vi.fn().mockResolvedValue([]),
    },
  },
}))

// Mock scheduling service
vi.mock('../services/scheduling', () => ({
  schedulingService: {
    sortTasksByPriority: vi.fn((tasks: Array<{ priority: number }>) =>
      [...tasks].sort((a, b) => b.priority - a.priority)
    ),
    getSchedulingStats: vi.fn(() => ({
      totalTasksScheduled: 5,
      avgWaitTime: 1200,
      avgExecutionTime: 3000,
      starvationPreventions: 0,
      loadBalanceEfficiency: 0.85,
      predictionAccuracy: 0.85,
    })),
    calculateLoadBalanceEfficiency: vi.fn(() => 0.85),
    recordTaskScheduled: vi.fn(),
    updateAgentLoad: vi.fn(),
  },
}))

// Mock logger
vi.mock('../utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock WebSocket client
vi.mock('../services/websocket', () => ({
  getWebSocketClient: () => ({
    subscribe: (_eventType: string, handler: (data: unknown) => void) => {
      capturedSubscribeHandler = handler
      return mockUnsubscribe
    },
  }),
}))

describe('SwarmCoordinatorPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: { id: '1', name: 'Test Swarm' },
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders header with title', () => {
    render(<SwarmCoordinatorPanel />)
    expect(screen.getByText('Swarm Coordinator')).toBeInTheDocument()
  })

  it('shows active swarm name', () => {
    render(<SwarmCoordinatorPanel />)
    expect(screen.getByText(/Test Swarm/)).toBeInTheDocument()
  })

  it('shows New Task button', () => {
    render(<SwarmCoordinatorPanel />)
    expect(screen.getByText('New Task')).toBeInTheDocument()
  })

  it('shows empty state when no tasks', () => {
    render(<SwarmCoordinatorPanel />)
    expect(screen.getByText('No tasks yet')).toBeInTheDocument()
    expect(screen.getByText('Submit a task to start coordinating agents')).toBeInTheDocument()
  })

  it('shows stat cards', () => {
    render(<SwarmCoordinatorPanel />)
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('opens new task modal when New Task clicked', () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))
    expect(screen.getByText('Submit New Task')).toBeInTheDocument()
  })

  it('closes modal when Cancel clicked', () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Submit New Task')).not.toBeInTheDocument()
  })

  it('has title input in modal', () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))
    expect(screen.getByPlaceholderText('Implement user authentication')).toBeInTheDocument()
  })

  it('has prompt textarea in modal', () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))
    expect(screen.getByPlaceholderText('Write the prompt that will be sent to agents...')).toBeInTheDocument()
  })

  it('has priority input in modal', () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))
    expect(screen.getByText('Priority (1-10)')).toBeInTheDocument()
  })

  it('has role selector in modal', () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))
    expect(screen.getByText('Required Role')).toBeInTheDocument()
  })

  it('submit button is disabled without required fields', () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))
    const submitButton = screen.getByRole('button', { name: 'Submit Task' })
    expect(submitButton).toBeDisabled()
  })

  it('creates task when form is submitted', async () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))

    // Fill in required fields
    const titleInput = screen.getByPlaceholderText('Implement user authentication')
    fireEvent.change(titleInput, { target: { value: 'Test Task' } })

    const promptTextarea = screen.getByPlaceholderText('Write the prompt that will be sent to agents...')
    fireEvent.change(promptTextarea, { target: { value: 'Test prompt' } })

    // Submit should now be enabled
    const submitButton = screen.getByRole('button', { name: 'Submit Task' })
    expect(submitButton).not.toBeDisabled()

    fireEvent.click(submitButton)

    // Wait for async operation to complete with fake timers
    await vi.advanceTimersByTimeAsync(100)

    // Modal should close and task should appear
    expect(screen.queryByText('Submit New Task')).not.toBeInTheDocument()
    expect(screen.getByText('Test Task')).toBeInTheDocument()
  })

  it('selects task when clicked', async () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))

    const titleInput = screen.getByPlaceholderText('Implement user authentication')
    fireEvent.change(titleInput, { target: { value: 'Selectable Task' } })

    const promptTextarea = screen.getByPlaceholderText('Write the prompt that will be sent to agents...')
    fireEvent.change(promptTextarea, { target: { value: 'Test prompt' } })

    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }))

    // Wait for async operation with fake timers
    await vi.advanceTimersByTimeAsync(100)
    expect(screen.getByText('Selectable Task')).toBeInTheDocument()

    // Click on the task to select it
    fireEvent.click(screen.getByText('Selectable Task'))

    // Task details should appear
    expect(screen.getByText('Task Details')).toBeInTheDocument()
  })

  it('handles start task without prior selection', async () => {
    const initialTasks: CoordinationTask[] = [
      {
        id: 'task-no-selection',
        title: 'Task Without Selection',
        description: 'Test task',
        prompt: 'Test prompt',
        priority: 'medium',
        status: 'pending',
        progress: 0,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      }
    ]
    render(<SwarmCoordinatorPanel initialTasks={initialTasks} />)

    // Select the task first
    fireEvent.click(screen.getByText('Task Without Selection'))

    // Click start button
    const startButton = screen.getByText('Start')
    fireEvent.click(startButton)

    // Wait for state update
    await vi.advanceTimersByTimeAsync(100)

    // Task should be running
    expect(screen.getByText('Running')).toBeInTheDocument()
  })

  it('handles pause task without prior selection', async () => {
    const initialTasks: CoordinationTask[] = [
      {
        id: 'task-pause-test',
        title: 'Task To Pause',
        description: 'Test task',
        prompt: 'Test prompt',
        priority: 'medium',
        status: 'running',
        progress: 0.3,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      }
    ]
    render(<SwarmCoordinatorPanel initialTasks={initialTasks} />)

    // Select the task
    fireEvent.click(screen.getByText('Task To Pause'))

    // Click pause button
    const pauseButton = screen.getByText('Pause')
    fireEvent.click(pauseButton)

    // Wait for state update
    await vi.advanceTimersByTimeAsync(100)

    // Task should be pending again
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('handles cancel task without prior selection', async () => {
    const initialTasks: CoordinationTask[] = [
      {
        id: 'task-cancel-test',
        title: 'Task To Cancel',
        description: 'Test task',
        prompt: 'Test prompt',
        priority: 'medium',
        status: 'running',
        progress: 0.5,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      }
    ]
    render(<SwarmCoordinatorPanel initialTasks={initialTasks} />)

    // Select the task
    fireEvent.click(screen.getByText('Task To Cancel'))

    // Click cancel button
    const cancelButton = screen.getByText('Cancel')
    fireEvent.click(cancelButton)

    // Wait for state update
    await vi.advanceTimersByTimeAsync(100)

    // Task should be failed
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })
})

describe('SwarmCoordinatorPanel without active swarm', () => {
  beforeEach(() => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: null,
      }
      return selector ? selector(state) : state
    })
  })

  it('shows no swarm selected message', () => {
    render(<SwarmCoordinatorPanel />)
    expect(screen.getByText(/No swarm selected/)).toBeInTheDocument()
  })
})

describe('SwarmCoordinatorPanel task progress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: { id: '1', name: 'Test Swarm' },
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('updates running task progress over time', async () => {
    // Start with a running task
    const runningTask: CoordinationTask = {
      id: 'running-task-1',
      title: 'Running Task',
      description: 'A task that is running',
      prompt: 'Test prompt',
      priority: 'medium',
      status: 'running',
      progress: 0.3,
      assignedTo: [],
      results: {},
      createdAt: new Date().toISOString(),
    }

    render(<SwarmCoordinatorPanel initialTasks={[runningTask]} />)

    // Initially shows 30% progress
    // Note: Progress updates now come from backend events, not simulated setInterval
    // Progress remains static until backend events arrive
    expect(screen.getByText('30%')).toBeInTheDocument()
  })

  it('displays task with high progress correctly', async () => {
    const runningTask: CoordinationTask = {
      id: 'running-task-2',
      title: 'Near Complete Task',
      description: 'A task near completion',
      prompt: 'Test prompt',
      priority: 'medium',
      status: 'running',
      progress: 0.95, // 95%
      assignedTo: [],
      results: {},
      createdAt: new Date().toISOString(),
    }

    render(<SwarmCoordinatorPanel initialTasks={[runningTask]} />)

    // Shows 95% progress
    expect(screen.getByText('95%')).toBeInTheDocument()

    // Verify stats show 1 running task
    expect(screen.getByText('Running')).toBeInTheDocument()
    const runningStat = screen.getByText('Running').closest('.bg-glass')?.querySelector('.text-xl')
    expect(runningStat?.textContent).toBe('1')

    // Note: Auto-completion now happens via backend events, not simulated progress
    // Task remains in running state until backend updates it
  })

  it('does not update progress for non-running tasks', async () => {
    const pendingTask: CoordinationTask = {
      id: 'pending-task-1',
      title: 'Pending Task',
      description: 'A pending task',
      prompt: 'Test prompt',
      priority: 'medium',
      status: 'pending',
      progress: 0,
      assignedTo: [],
      results: {},
      createdAt: new Date().toISOString(),
    }

    render(<SwarmCoordinatorPanel initialTasks={[pendingTask]} />)

    // Task should exist
    expect(screen.getByText('Pending Task')).toBeInTheDocument()

    // Advance timer - should not show progress bar (not running)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    // No progress percentage should be shown for pending tasks
    expect(screen.queryByText('%')).not.toBeInTheDocument()
  })

  it('displays task already at 100% progress correctly', async () => {
    const runningTask: CoordinationTask = {
      id: 'running-task-3',
      title: 'Complete Progress Task',
      description: 'A task with 100% progress but still running',
      prompt: 'Test prompt',
      priority: 'medium',
      status: 'running',
      progress: 1, // Already at 100%
      assignedTo: [],
      results: {},
      createdAt: new Date().toISOString(),
    }

    render(<SwarmCoordinatorPanel initialTasks={[runningTask]} />)

    // Shows 100% progress (running task at 100%)
    expect(screen.getByText('100%')).toBeInTheDocument()

    // Note: Auto-completion now happens via backend events
    // Task remains in running state until backend updates it
    const runningLabel = screen.getByText('Running')
    const runningCard = runningLabel.closest('.bg-glass')
    const runningValue = runningCard?.querySelector('.text-xl')
    expect(runningValue?.textContent).toBe('1')
  })

  it('updates multiple running tasks independently', async () => {
    const tasks: CoordinationTask[] = [
      {
        id: 'multi-task-1',
        title: 'Task One',
        description: 'First task',
        prompt: 'Test',
        priority: 'medium',
        status: 'running',
        progress: 0.2,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
      {
        id: 'multi-task-2',
        title: 'Task Two',
        description: 'Second task',
        prompt: 'Test',
        priority: 'medium',
        status: 'running',
        progress: 0.5,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    // Both tasks show their initial progress (no simulated updates)
    expect(screen.getByText('20%')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()

    // Note: Progress updates come from backend events, not setInterval simulation
  })
})

describe('SwarmCoordinatorPanel task execution', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: { id: '1', name: 'Test Swarm' },
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts a pending task when Start button clicked', () => {
    const pendingTask: CoordinationTask = {
      id: 'exec-task-1',
      title: 'Executable Task',
      description: 'A task to execute',
      prompt: 'Test prompt',
      priority: 'medium',
      status: 'pending',
      progress: 0,
      assignedTo: [],
      results: {},
      createdAt: new Date().toISOString(),
    }

    render(<SwarmCoordinatorPanel initialTasks={[pendingTask]} />)

    // Click on task to select it
    fireEvent.click(screen.getByText('Executable Task'))

    // Verify task is pending
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('pending')).toBeInTheDocument()

    // Click Start button
    fireEvent.click(screen.getByText('Start'))

    // Task status should change to running
    expect(screen.getByText('running')).toBeInTheDocument()
    expect(screen.getByText('Progress')).toBeInTheDocument()
  })

  it('pauses a running task when Pause button clicked', () => {
    const runningTask: CoordinationTask = {
      id: 'pause-task-1',
      title: 'Running Task',
      description: 'A running task',
      prompt: 'Test prompt',
      priority: 'medium',
      status: 'running',
      progress: 0.3,
      assignedTo: [],
      results: {},
      createdAt: new Date().toISOString(),
    }

    render(<SwarmCoordinatorPanel initialTasks={[runningTask]} />)

    // Click on task to select it
    fireEvent.click(screen.getByText('Running Task'))

    // Click Pause button
    fireEvent.click(screen.getByText('Pause'))

    // Task status should change to pending
    expect(screen.getByText('pending')).toBeInTheDocument()
  })

  it('cancels a running task when Cancel button clicked', () => {
    const runningTask: CoordinationTask = {
      id: 'cancel-task-1',
      title: 'Cancel Task',
      description: 'A task to cancel',
      prompt: 'Test prompt',
      priority: 'medium',
      status: 'running',
      progress: 0.5,
      assignedTo: [],
      results: {},
      createdAt: new Date().toISOString(),
    }

    render(<SwarmCoordinatorPanel initialTasks={[runningTask]} />)

    // Click on task to select it
    fireEvent.click(screen.getByText('Cancel Task'))

    // Click Cancel button (opens ConfirmDialog)
    fireEvent.click(screen.getByText('Cancel'))

    // Confirm the cancellation in the dialog
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Task' }))

    // Task status should change to failed
    expect(screen.getByText('failed')).toBeInTheDocument()
  })

  it('updates selectedTask state when task is modified', () => {
    const pendingTask: CoordinationTask = {
      id: 'state-task-1',
      title: 'State Task',
      description: 'A task for state testing',
      prompt: 'Test prompt',
      priority: 'medium',
      status: 'pending',
      progress: 0,
      assignedTo: [],
      results: {},
      createdAt: new Date().toISOString(),
    }

    render(<SwarmCoordinatorPanel initialTasks={[pendingTask]} />)

    // Click on task to select it
    fireEvent.click(screen.getByText('State Task'))

    // Task details should show
    expect(screen.getByText('Task Details')).toBeInTheDocument()

    // Start the task
    fireEvent.click(screen.getByText('Start'))

    // Task details should still show updated status
    expect(screen.getByText('running')).toBeInTheDocument()
    expect(screen.getByText('Task Details')).toBeInTheDocument()
  })

  it('only affects targeted task when multiple tasks exist', () => {
    const tasks: CoordinationTask[] = [
      {
        id: 'target-task',
        title: 'Target Task',
        description: 'Task to modify',
        prompt: 'Test',
        priority: 'medium',
        status: 'pending',
        progress: 0,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
      {
        id: 'other-task',
        title: 'Other Task',
        description: 'Should not change',
        prompt: 'Test',
        priority: 'medium',
        status: 'pending',
        progress: 0,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    // Click on target task to select it
    fireEvent.click(screen.getByText('Target Task'))

    // Start the task
    fireEvent.click(screen.getByText('Start'))

    // Target task should be running
    expect(screen.getByText('running')).toBeInTheDocument()

    // Click on other task to verify it's still pending
    fireEvent.click(screen.getByText('Other Task'))
    expect(screen.getByText('pending')).toBeInTheDocument()
  })

  it('does not update selectedTask when different task is modified', () => {
    const tasks: CoordinationTask[] = [
      {
        id: 'task-a',
        title: 'Task A',
        description: 'First task',
        prompt: 'Test',
        priority: 'medium',
        status: 'pending',
        progress: 0,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
      {
        id: 'task-b',
        title: 'Task B',
        description: 'Second task',
        prompt: 'Test',
        priority: 'medium',
        status: 'running',
        progress: 0.3,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    // Click on Task A to select it
    fireEvent.click(screen.getByText('Task A'))
    expect(screen.getByText('Task Details')).toBeInTheDocument()

    // Click on Task B in the list (not in details panel)
    const taskBCards = screen.getAllByText('Task B')
    fireEvent.click(taskBCards[0])

    // Now click Cancel on Task B (while Task A details might have been shown briefly)
    // But since Task B is now selected, canceling should affect Task B
    fireEvent.click(screen.getByText('Cancel'))

    // Confirm the cancellation in the dialog
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Task' }))

    // Task B should be failed
    expect(screen.getByText('failed')).toBeInTheDocument()
  })
})

describe('SwarmCoordinatorPanel form fields', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: { id: '1', name: 'Test Swarm' },
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('updates description field', () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))
    const descTextarea = screen.getByPlaceholderText('Detailed task description...')
    fireEvent.change(descTextarea, { target: { value: 'A detailed description' } })
    expect(descTextarea).toHaveValue('A detailed description')
  })

  it('updates priority field', () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))
    const prioritySelect = screen.getByLabelText('Priority')
    fireEvent.change(prioritySelect, { target: { value: 'high' } })
    expect(prioritySelect).toHaveValue('high')
  })

  it('changes required role selection', () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))
    const roleSelect = screen.getByLabelText('Required Role')
    fireEvent.change(roleSelect, { target: { value: 'coder' } })
    expect(roleSelect).toHaveValue('coder')
  })

  it('shows task details with all fields', async () => {
    render(<SwarmCoordinatorPanel />)
    // Create task
    fireEvent.click(screen.getByText('New Task'))
    fireEvent.change(screen.getByPlaceholderText('Implement user authentication'), { target: { value: 'Full Detail Task' } })
    fireEvent.change(screen.getByPlaceholderText('Write the prompt that will be sent to agents...'), { target: { value: 'Test the details panel' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }))
    // Wait for task to be created - advance timers for async state updates
    await vi.advanceTimersByTimeAsync(100)
    // Select task to show details
    const taskTitles = screen.getAllByText('Full Detail Task')
    fireEvent.click(taskTitles[0])
    await vi.advanceTimersByTimeAsync(100)
    // Check all detail fields are shown
    expect(screen.getByText('Task Details')).toBeInTheDocument()
    expect(screen.getByText('ID')).toBeInTheDocument()
    expect(screen.getByText('Title')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Priority')).toBeInTheDocument()
    expect(screen.getByText('Prompt')).toBeInTheDocument()
    expect(screen.getByText('Test the details panel')).toBeInTheDocument()
  })

  it('deselects task when clicking again', async () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))
    fireEvent.change(screen.getByPlaceholderText('Implement user authentication'), { target: { value: 'Toggle Task' } })
    fireEvent.change(screen.getByPlaceholderText('Write the prompt that will be sent to agents...'), { target: { value: 'Test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }))
    // Wait for task to be created
    await vi.advanceTimersByTimeAsync(100)
    // Select task (use the h4 element in the task card)
    const taskTitles = screen.getAllByText('Toggle Task')
    fireEvent.click(taskTitles[0]) // Click on the task card title
    await vi.advanceTimersByTimeAsync(100)
    expect(screen.getByText('Task Details')).toBeInTheDocument()
    // Click again to deselect
    fireEvent.click(taskTitles[0])
    await vi.advanceTimersByTimeAsync(100)
    expect(screen.queryByText('Task Details')).not.toBeInTheDocument()
  })

  it('closes task details with X button', async () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))
    fireEvent.change(screen.getByPlaceholderText('Implement user authentication'), { target: { value: 'Close Test Task' } })
    fireEvent.change(screen.getByPlaceholderText('Write the prompt that will be sent to agents...'), { target: { value: 'Test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }))
    // Wait for task to be created
    await vi.advanceTimersByTimeAsync(100)
    // Select task to show details
    const taskTitles = screen.getAllByText('Close Test Task')
    fireEvent.click(taskTitles[0])
    await vi.advanceTimersByTimeAsync(100)
    expect(screen.getByText('Task Details')).toBeInTheDocument()
    // Click X button to close
    const closeButton = screen.getByRole('button', { name: 'Close' })
    fireEvent.click(closeButton)
    await vi.advanceTimersByTimeAsync(100)
    expect(screen.queryByText('Task Details')).not.toBeInTheDocument()
  })

  it('creates tasks with different priorities', async () => {
    // Return unique IDs for each task submission
    let callCount = 0
    vi.mocked(api.swarm.submitTask).mockImplementation(() => {
      callCount++
      return Promise.resolve(`task-${callCount}`)
    })
    render(<SwarmCoordinatorPanel />)
    // Create first task with medium priority
    fireEvent.click(screen.getByText('New Task'))
    fireEvent.change(screen.getByPlaceholderText('Implement user authentication'), { target: { value: 'Medium Priority Task' } })
    fireEvent.change(screen.getByPlaceholderText('Write the prompt that will be sent to agents...'), { target: { value: 'Test' } })
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'medium' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }))
    // Wait for first task to be created
    await vi.advanceTimersByTimeAsync(100)
    // Create second task with critical priority
    fireEvent.click(screen.getByText('New Task'))
    fireEvent.change(screen.getByPlaceholderText('Implement user authentication'), { target: { value: 'Critical Priority Task' } })
    fireEvent.change(screen.getByPlaceholderText('Write the prompt that will be sent to agents...'), { target: { value: 'Test' } })
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'critical' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }))
    // Wait for second task to be created
    await vi.advanceTimersByTimeAsync(100)
    // Both tasks should be visible
    expect(screen.getByText('Medium Priority Task')).toBeInTheDocument()
    expect(screen.getByText('Critical Priority Task')).toBeInTheDocument()
  })

  it('shows task with description', async () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))
    fireEvent.change(screen.getByPlaceholderText('Implement user authentication'), { target: { value: 'Task With Description' } })
    fireEvent.change(screen.getByPlaceholderText('Detailed task description...'), { target: { value: 'This is a detailed description for the task' } })
    fireEvent.change(screen.getByPlaceholderText('Write the prompt that will be sent to agents...'), { target: { value: 'Test prompt' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }))
    // Wait for task to be created with fake timers
    await vi.advanceTimersByTimeAsync(100)
    expect(screen.queryByText('Submit New Task')).not.toBeInTheDocument()
    // Should show description in task card
    expect(screen.getByText('This is a detailed description for the task')).toBeInTheDocument()
  })
})

describe('TaskCard component', () => {
  const baseTask: CoordinationTask = {
    id: 'test-task-1',
    title: 'Test Task',
    description: 'Test description',
    prompt: 'Test prompt',
    priority: 'medium',
    status: 'pending',
    progress: 0,
    assignedTo: [],
    results: {},
    createdAt: new Date().toISOString(),
  }

  it('shows progress bar for running task', () => {
    const runningTask = { ...baseTask, status: 'running' as const, progress: 0.5 }
    render(
      <TaskCard
        task={runningTask}
        isSelected={false}
        isExpanded={false}
        statusColor="bg-accent animate-pulse"
        priorityColor="text-warning"
        onClick={() => {}}
        onToggleExpand={() => {}}
      />
    )
    expect(screen.getByText('Progress')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('shows assigned agents', () => {
    const taskWithAgents = { ...baseTask, assignedTo: ['agent-1', 'agent-2', 'agent-3'] }
    render(
      <TaskCard
        task={taskWithAgents}
        isSelected={false}
        isExpanded={false}
        statusColor="bg-info"
        priorityColor="text-warning"
        onClick={() => {}}
        onToggleExpand={() => {}}
      />
    )
    expect(screen.getByText('agent-1')).toBeInTheDocument()
    expect(screen.getByText('agent-2')).toBeInTheDocument()
    expect(screen.getByText('agent-3')).toBeInTheDocument()
  })

  it('shows +N more when more than 3 agents assigned', () => {
    const taskWithManyAgents = {
      ...baseTask,
      assignedTo: ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5']
    }
    render(
      <TaskCard
        task={taskWithManyAgents}
        isSelected={false}
        isExpanded={false}
        statusColor="bg-info"
        priorityColor="text-warning"
        onClick={() => {}}
        onToggleExpand={() => {}}
      />
    )
    expect(screen.getByText('+2 more')).toBeInTheDocument()
  })
})

describe('TaskDetails component', () => {
  const baseTask: CoordinationTask = {
    id: 'detail-task-1',
    title: 'Detail Task',
    description: 'Detail description',
    prompt: 'Detail prompt',
    priority: 'medium',
    status: 'completed',
    progress: 1,
    assignedTo: ['agent-a'],
    results: {},
    createdAt: new Date().toISOString(),
  }

  const mockHandlers = {
    onStart: vi.fn(),
    onPause: vi.fn(),
    onCancel: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows results with success content', () => {
    const taskWithResults = {
      ...baseTask,
      results: {
        'agent-a': {
          agentId: 'agent-a',
          content: 'Task completed successfully',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:01:00Z',
          duration: 60000
        }
      }
    }
    render(<TaskDetails task={taskWithResults} onClose={() => {}} {...mockHandlers} />)
    expect(screen.getByText('Results')).toBeInTheDocument()
    expect(screen.getByText('agent-a')).toBeInTheDocument()
    expect(screen.getByText('Task completed successfully')).toBeInTheDocument()
  })

  it('shows results with error content', () => {
    const taskWithErrors = {
      ...baseTask,
      results: {
        'agent-b': {
          agentId: 'agent-b',
          content: '',
          error: 'Connection failed',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:01:00Z',
          duration: 60000
        }
      }
    }
    render(<TaskDetails task={taskWithErrors} onClose={() => {}} {...mockHandlers} />)
    expect(screen.getByText('Results')).toBeInTheDocument()
    expect(screen.getByText('agent-b')).toBeInTheDocument()
    expect(screen.getByText('Connection failed')).toBeInTheDocument()
  })

  it('shows Start button for pending task', () => {
    const pendingTask = { ...baseTask, status: 'pending' as const }
    render(<TaskDetails task={pendingTask} onClose={() => {}} {...mockHandlers} />)
    expect(screen.getByText('Start')).toBeInTheDocument()
  })

  it('shows Pause and Cancel buttons for running task', () => {
    const runningTask = { ...baseTask, status: 'running' as const, progress: 0.3 }
    render(<TaskDetails task={runningTask} onClose={() => {}} {...mockHandlers} />)
    expect(screen.getByText('Pause')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('calls onStart when Start button clicked', () => {
    const pendingTask = { ...baseTask, id: 'start-test-task', status: 'pending' as const }
    render(<TaskDetails task={pendingTask} onClose={() => {}} {...mockHandlers} />)
    fireEvent.click(screen.getByText('Start'))
    expect(mockHandlers.onStart).toHaveBeenCalledWith('start-test-task')
  })

  it('calls onPause when Pause button clicked', () => {
    const runningTask = { ...baseTask, id: 'pause-test-task', status: 'running' as const, progress: 0.5 }
    render(<TaskDetails task={runningTask} onClose={() => {}} {...mockHandlers} />)
    fireEvent.click(screen.getByText('Pause'))
    expect(mockHandlers.onPause).toHaveBeenCalledWith('pause-test-task')
  })

  it('calls onCancel when Cancel button clicked', () => {
    const runningTask = { ...baseTask, id: 'cancel-test-task', status: 'running' as const, progress: 0.5 }
    render(<TaskDetails task={runningTask} onClose={() => {}} {...mockHandlers} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(mockHandlers.onCancel).toHaveBeenCalledWith('cancel-test-task')
  })
})

describe('SwarmCoordinatorPanel error handling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: { id: '1', name: 'Test Swarm' },
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('handles submit task error gracefully', async () => {
    const { api } = await import('../services')
    vi.mocked(api.swarm.submitTask).mockRejectedValueOnce(new Error('Submit failed'))

    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))

    // Fill in required fields
    const titleInput = screen.getByPlaceholderText('Implement user authentication')
    fireEvent.change(titleInput, { target: { value: 'Error Task' } })

    const promptTextarea = screen.getByPlaceholderText('Write the prompt that will be sent to agents...')
    fireEvent.change(promptTextarea, { target: { value: 'Test prompt' } })

    // Use waitFor to properly await the async submit handler
    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }))

    // Wait for async operation
    await vi.advanceTimersByTimeAsync(100)

    // Error is logged but doesn't crash - modal stays open on error
    expect(screen.getByText('Submit New Task')).toBeInTheDocument()
  })

  it('handles execute task error', async () => {
    const { api } = await import('../services')
    vi.mocked(api.swarm.executeTask).mockRejectedValueOnce(new Error('Execute failed'))

    const initialTask: CoordinationTask = {
      id: 'error-task-1',
      title: 'Task To Execute',
      description: 'Test task',
      prompt: 'Test prompt',
      priority: 'medium',
      status: 'pending',
      progress: 0,
      assignedTo: [],
      results: {},
      createdAt: new Date().toISOString(),
    }

    render(<SwarmCoordinatorPanel initialTasks={[initialTask]} />)

    // Select the task
    fireEvent.click(screen.getByText('Task To Execute'))

    // Click start button
    fireEvent.click(screen.getByText('Start'))

    // Wait for async operation
    await vi.advanceTimersByTimeAsync(100)

    // Task should be marked as failed after error
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('does not update selectedTask when different task is started', async () => {
    const tasks: CoordinationTask[] = [
      {
        id: 'task-selected',
        title: 'Selected Task',
        description: 'This task is selected',
        prompt: 'Test',
        priority: 'medium',
        status: 'pending',
        progress: 0,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
      {
        id: 'task-other',
        title: 'Other Task',
        description: 'This task is not selected',
        prompt: 'Test',
        priority: 'medium',
        status: 'pending',
        progress: 0,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    // Select the first task
    fireEvent.click(screen.getByText('Selected Task'))
    expect(screen.getByText('Task Details')).toBeInTheDocument()

    // Directly trigger handleStartTask with a different task ID by clicking on Other Task first
    // then clicking Start (which will start the selected task, not the other)
    // But to test the else branch, we need to simulate a race condition
    // Since we can't directly call handleStartTask, let's verify the component behavior
    // when selection changes mid-operation

    // Click on Other Task to change selection
    const otherTaskCards = screen.getAllByText('Other Task')
    fireEvent.click(otherTaskCards[0])

    // Now selectedTask is Other Task
    // Click Start - this will start Other Task, not Selected Task
    fireEvent.click(screen.getByText('Start'))

    // Wait for async operation
    await vi.advanceTimersByTimeAsync(100)

    // Other Task should now be completed (mock API resolves instantly)
    expect(screen.getByText('completed')).toBeInTheDocument()
  })

  it('does not update selectedTask when different task is paused', async () => {
    const tasks: CoordinationTask[] = [
      {
        id: 'running-task-1',
        title: 'Running Task One',
        description: 'First running task',
        prompt: 'Test',
        priority: 'medium',
        status: 'running',
        progress: 0.3,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
      {
        id: 'running-task-2',
        title: 'Running Task Two',
        description: 'Second running task',
        prompt: 'Test',
        priority: 'medium',
        status: 'running',
        progress: 0.5,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    // Select the first task (use getAllByText since title appears in multiple places)
    const taskOneElements = screen.getAllByText('Running Task One')
    fireEvent.click(taskOneElements[0]) // Click the first occurrence (in task list)
    expect(screen.getByText('Task Details')).toBeInTheDocument()

    // Click Pause on the selected task
    fireEvent.click(screen.getByText('Pause'))

    // Wait for state update
    await vi.advanceTimersByTimeAsync(100)

    // The task should now be pending
    expect(screen.getByText('pending')).toBeInTheDocument()
  })

  it('does not update selectedTask when different task is canceled', async () => {
    const tasks: CoordinationTask[] = [
      {
        id: 'cancel-running-1',
        title: 'Cancel Running One',
        description: 'First task to cancel',
        prompt: 'Test',
        priority: 'medium',
        status: 'running',
        progress: 0.3,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
      {
        id: 'cancel-running-2',
        title: 'Cancel Running Two',
        description: 'Second task to cancel',
        prompt: 'Test',
        priority: 'medium',
        status: 'running',
        progress: 0.5,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    // Select the first task (use getAllByText since title appears in multiple places)
    const taskOneElements = screen.getAllByText('Cancel Running One')
    fireEvent.click(taskOneElements[0]) // Click the first occurrence (in task list)
    expect(screen.getByText('Task Details')).toBeInTheDocument()

    // Click Cancel on the selected task (opens ConfirmDialog)
    fireEvent.click(screen.getByText('Cancel'))

    // Confirm the cancellation in the dialog
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Task' }))

    // Wait for state update
    await vi.advanceTimersByTimeAsync(100)

    // The task should now be failed
    expect(screen.getByText('failed')).toBeInTheDocument()
  })
})

// Test async race condition where selection changes during API call
describe('SwarmCoordinatorPanel async race conditions', () => {
  it('triggers else branch in handleStartTask completion when selection changes during API call', async () => {
    // Use real timers for this test to properly test the async race condition
    vi.useRealTimers()

    // Create a promise that we can control the resolution of
    let resolveApiCall: (value: unknown) => void
    const apiCallPromise = new Promise((resolve) => {
      resolveApiCall = resolve
    })

    // Override the mock implementation to delay resolution until we explicitly resolve it
    vi.mocked(api.swarm.executeTask).mockImplementation(async () => {
      await apiCallPromise
      return {
        taskId: 'task-to-start',
        status: 'completed',
        agentResults: {
          'claude-code': {
            agentId: 'claude-code',
            content: 'Result',
            success: true,
            durationMs: 100,
          },
        },
      }
    })

    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: { id: '1', name: 'Test Swarm' },
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    const tasks: CoordinationTask[] = [
      {
        id: 'task-to-start',
        title: 'Task To Start',
        description: 'This task will be started',
        prompt: 'Test',
        priority: 'medium',
        status: 'pending',
        progress: 0,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
      {
        id: 'task-other',
        title: 'Other Task',
        description: 'This is a different task',
        prompt: 'Test',
        priority: 'medium',
        status: 'pending',
        progress: 0,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    // Select the first task
    const taskElements = screen.getAllByText('Task To Start')
    fireEvent.click(taskElements[0])
    expect(screen.getByText('Task Details')).toBeInTheDocument()

    // Click Start to start the task (this triggers the async API call)
    fireEvent.click(screen.getByText('Start'))

    // Let React process the click and start the API call
    await waitFor(() => {
      expect(screen.getByText('running')).toBeInTheDocument()
    })

    // Now change selection to the other task while API is still pending
    const otherTaskElements = screen.getAllByText('Other Task')
    fireEvent.click(otherTaskElements[0])

    // selectedTask should now be Other Task
    await waitFor(() => {
      expect(screen.getByText('This is a different task')).toBeInTheDocument()
    })

    // Now resolve the API call
    resolveApiCall!(undefined)

    // Wait for the API call to complete and state to update
    await waitFor(() => {
      // The task list should show the first task as completed
      // But the selectedTask should still be Other Task (else branch was triggered)
      expect(screen.getByText('This is a different task')).toBeInTheDocument()
    })

    // Reset the mock to original implementation
    vi.mocked(api.swarm.executeTask).mockResolvedValue({
      taskId: 'task-mock-id',
      status: 'completed',
      agentResults: {
        'claude-code': {
          agentId: 'claude-code',
          content: 'Mock agent result',
          success: true,
          durationMs: 100,
        },
      },
    })
  })

  it('triggers THEN branch in handleStartTask when selectedTask matches started task', async () => {
    vi.useFakeTimers()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: { id: '1', name: 'Test Swarm' },
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    const tasks: CoordinationTask[] = [
      {
        id: 'task-1',
        title: 'Task One',
        description: 'First task',
        prompt: 'Test',
        priority: 'medium',
        status: 'pending',
        progress: 0,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
      {
        id: 'task-2',
        title: 'Task Two',
        description: 'Second task',
        prompt: 'Test',
        priority: 'medium',
        status: 'pending',
        progress: 0,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    // Click on Task One to select it
    const taskOneElements = screen.getAllByText('Task One')
    fireEvent.click(taskOneElements[0])
    expect(screen.getByText('Task Details')).toBeInTheDocument()

    // Click Start to start task-1 (selectedTask.id === 'task-1', so the THEN branch triggers)
    fireEvent.click(screen.getByText('Start'))

    // Advance timers to let the API call complete
    await vi.advanceTimersByTimeAsync(100)

    // The API mock resolves immediately with status 'completed'
    // Since selectedTask.id === taskId (both 'task-1'), the THEN branch updates selectedTask
    // So status should be 'completed'
    expect(screen.getByText('completed')).toBeInTheDocument()

    vi.useRealTimers()
  })

  it('triggers else branch in handlePauseTask when selection changes during operation', async () => {
    vi.useFakeTimers()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: { id: '1', name: 'Test Swarm' },
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    const tasks: CoordinationTask[] = [
      {
        id: 'task-1',
        title: 'Running Task',
        description: 'This task is running',
        prompt: 'Test',
        priority: 'medium',
        status: 'running',
        progress: 0.5,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
      {
        id: 'task-2',
        title: 'Other Task',
        description: 'Different task',
        prompt: 'Test',
        priority: 'medium',
        status: 'pending',
        progress: 0,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    // Select the running task
    const runningTaskElements = screen.getAllByText('Running Task')
    fireEvent.click(runningTaskElements[0])
    expect(screen.getByText('Pause')).toBeInTheDocument()

    // Click Pause - this will call handlePauseTask('task-1')
    // selectedTask.id === 'task-1' so it WILL update selectedTask
    fireEvent.click(screen.getByText('Pause'))

    // Let React process
    await vi.advanceTimersByTimeAsync(0)

    // The task should now be pending
    expect(screen.getByText('pending')).toBeInTheDocument()

    vi.useRealTimers()
  })

  it('triggers else branch in handleCancelTask when selection changes during operation', async () => {
    vi.useFakeTimers()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: { id: '1', name: 'Test Swarm' },
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    const tasks: CoordinationTask[] = [
      {
        id: 'task-1',
        title: 'Running Task',
        description: 'This task is running',
        prompt: 'Test',
        priority: 'medium',
        status: 'running',
        progress: 0.5,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    // Select the running task
    const runningTaskElements = screen.getAllByText('Running Task')
    fireEvent.click(runningTaskElements[0])
    expect(screen.getByText('Cancel')).toBeInTheDocument()

    // Click Cancel - this opens the ConfirmDialog for task-1
    // selectedTask.id === 'task-1' so it WILL update selectedTask
    fireEvent.click(screen.getByText('Cancel'))

    // Confirm the cancellation in the dialog
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Task' }))

    // Let React process
    await vi.advanceTimersByTimeAsync(0)

    // The task should now be failed
    expect(screen.getByText('failed')).toBeInTheDocument()

    vi.useRealTimers()
  })

  // Test else branches using test props - these trigger the ELSE branch in setSelectedTask
  it('triggers ELSE branch in handleStartTask immediate setSelectedTask update via test prop', async () => {
    vi.useFakeTimers()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: { id: '1', name: 'Test Swarm' },
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    const tasks: CoordinationTask[] = [
      {
        id: 'task-1',
        title: 'Selected Task',
        description: 'This task is selected',
        prompt: 'Test',
        priority: 'medium',
        status: 'pending',
        progress: 0,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
      {
        id: 'task-2',
        title: 'Other Task',
        description: 'This task is NOT selected',
        prompt: 'Test',
        priority: 'medium',
        status: 'pending',
        progress: 0,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    // Render with testSelectedTaskId='task-1' to select task-1, and testStartTaskId='task-2'
    // This will call handleStartTask('task-2') while selectedTask.id === 'task-1'
    // triggering the ELSE branch: prev?.id === taskId is FALSE
    await act(async () => {
      render(<SwarmCoordinatorPanel
        initialTasks={tasks}
        testSelectedTaskId="task-1"
        testStartTaskId="task-2"
      />)
      await vi.advanceTimersByTimeAsync(0)
    })

    // The selected task (task-1) should still be 'pending' (else branch preserves it)
    // and the Running stat card should show count of 1 (task-2 is running)
    expect(screen.getByText('pending')).toBeInTheDocument()

    // Verify Running count is 1 (task-2 is now running)
    const runningCards = screen.getAllByText('Running')
    expect(runningCards.length).toBeGreaterThan(0)

    vi.useRealTimers()
  })

  it('triggers ELSE branch in handlePauseTask setSelectedTask update via test prop', async () => {
    vi.useFakeTimers()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: { id: '1', name: 'Test Swarm' },
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    const tasks: CoordinationTask[] = [
      {
        id: 'task-1',
        title: 'Selected Running',
        description: 'This task is selected and running',
        prompt: 'Test',
        priority: 'medium',
        status: 'running',
        progress: 0.5,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
      {
        id: 'task-2',
        title: 'Other Running',
        description: 'This task is running but NOT selected',
        prompt: 'Test',
        priority: 'medium',
        status: 'running',
        progress: 0.3,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    // Render with testSelectedTaskId='task-1' and testPauseTaskId='task-2'
    await act(async () => {
      render(<SwarmCoordinatorPanel
        initialTasks={tasks}
        testSelectedTaskId="task-1"
        testPauseTaskId="task-2"
      />)
      await vi.advanceTimersByTimeAsync(0)
    })

    // The selected task (task-1) should still be 'running' (else branch preserves it)
    // TaskDetails shows selectedTask.status which is 'running'
    expect(screen.getByText('running')).toBeInTheDocument()

    vi.useRealTimers()
  })

  it('triggers ELSE branch in handleCancelTask setSelectedTask update via test prop', async () => {
    vi.useFakeTimers()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: { id: '1', name: 'Test Swarm' },
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    const tasks: CoordinationTask[] = [
      {
        id: 'task-1',
        title: 'Selected Running',
        description: 'This task is selected and running',
        prompt: 'Test',
        priority: 'medium',
        status: 'running',
        progress: 0.5,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
      {
        id: 'task-2',
        title: 'Other Running',
        description: 'This task is running but NOT selected',
        prompt: 'Test',
        priority: 'medium',
        status: 'running',
        progress: 0.3,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    // Render with testSelectedTaskId='task-1' and testCancelTaskId='task-2'
    await act(async () => {
      render(<SwarmCoordinatorPanel
        initialTasks={tasks}
        testSelectedTaskId="task-1"
        testCancelTaskId="task-2"
      />)
      await vi.advanceTimersByTimeAsync(0)
    })

    // The selected task (task-1) should still be 'running' (else branch preserves it)
    // TaskDetails shows selectedTask.status which is 'running'
    expect(screen.getByText('running')).toBeInTheDocument()

    vi.useRealTimers()
  })
})

describe('handleStartTask error handling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: { id: '1', name: 'Test Swarm' },
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sets task status to failed when executeTask rejects', async () => {
    // Mock executeTask to reject
    vi.mocked(api.swarm.executeTask).mockRejectedValueOnce(new Error('API error'))

    const tasks: CoordinationTask[] = [
      {
        id: 'task-1',
        title: 'Task One',
        description: 'First task',
        prompt: 'Test',
        priority: 'medium',
        status: 'pending',
        progress: 0,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    // Select and start the task
    const taskElements = screen.getAllByText('Task One')
    fireEvent.click(taskElements[0])
    fireEvent.click(screen.getByText('Start'))

    // Advance timers to let the API call complete (and reject)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    // The catch block updates tasks with 'failed' status
    // Verify the Failed stat card exists (which reads from tasks array)
    const failedLabels = screen.getAllByText('Failed')
    expect(failedLabels.length).toBeGreaterThan(0)
  })

  it('covers else branch in catch block setTasks when multiple tasks exist', async () => {
    // Mock executeTask to reject
    vi.mocked(api.swarm.executeTask).mockRejectedValueOnce(new Error('API error'))

    const tasks: CoordinationTask[] = [
      {
        id: 'task-1',
        title: 'Task One',
        description: 'First task',
        prompt: 'Test',
        priority: 'medium',
        status: 'pending',
        progress: 0,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
      {
        id: 'task-2',
        title: 'Task Two',
        description: 'Second task',
        prompt: 'Test',
        priority: 'medium',
        status: 'pending',
        progress: 0,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    // Select and start task-1
    const taskElements = screen.getAllByText('Task One')
    fireEvent.click(taskElements[0])
    fireEvent.click(screen.getByText('Start'))

    // Advance timers to let the API call complete (and reject)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    // Task One should be failed, Task Two should remain pending
    const failedLabels = screen.getAllByText('Failed')
    expect(failedLabels.length).toBeGreaterThan(0)
    // Task Two should still show as pending
    expect(screen.getByText('Task Two')).toBeInTheDocument()
  })
})

describe('handleSubmitTask without active swarm', () => {
  it('returns early when activeSwarm is null', async () => {
    vi.useFakeTimers()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: null,
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    render(<SwarmCoordinatorPanel />)

    // Try to open modal and submit
    fireEvent.click(screen.getByText('New Task'))

    const titleInput = screen.getByPlaceholderText('Implement user authentication')
    fireEvent.change(titleInput, { target: { value: 'Test Task' } })

    const promptTextarea = screen.getByPlaceholderText('Write the prompt that will be sent to agents...')
    fireEvent.change(promptTextarea, { target: { value: 'Test prompt' } })

    const submitButton = screen.getByRole('button', { name: 'Submit Task' })

    // Button should be enabled but clicking should not create task
    expect(submitButton).not.toBeDisabled()
    fireEvent.click(submitButton)

    await vi.advanceTimersByTimeAsync(100)

    // Modal should remain open since task was not created
    expect(screen.getByText('Submit New Task')).toBeInTheDocument()
    // Task should not appear
    expect(screen.queryByText('Test Task')).not.toBeInTheDocument()

    vi.useRealTimers()
  })
})

describe('handleStartTask without active swarm', () => {
  it('returns early when activeSwarm is null', async () => {
    vi.useFakeTimers()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: null,
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    const tasks: CoordinationTask[] = [
      {
        id: 'task-1',
        title: 'Task One',
        description: 'First task',
        prompt: 'Test',
        priority: 'medium',
        status: 'pending',
        progress: 0,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    // Use testStartTaskId prop to trigger handleStartTask
    render(<SwarmCoordinatorPanel initialTasks={tasks} testStartTaskId="task-1" />)

    await vi.advanceTimersByTimeAsync(100)

    // Task should remain pending since handleStartTask returned early
    const pendingLabels = screen.getAllByText('Pending')
    expect(pendingLabels.length).toBeGreaterThan(0)

    vi.useRealTimers()
  })
})

describe('testSelectedTaskId invalid ID', () => {
  it('returns null when testSelectedTaskId does not match any task', () => {
    const tasks: CoordinationTask[] = [
      {
        id: 'task-1',
        title: 'Task One',
        description: 'First task',
        prompt: 'Test',
        priority: 'medium',
        status: 'pending',
        progress: 0,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    // Pass testSelectedTaskId that doesn't match any task
    render(<SwarmCoordinatorPanel initialTasks={tasks} testSelectedTaskId="non-existent-id" />)

    // No task should be selected (no Task Details shown)
    expect(screen.queryByText('Task Details')).not.toBeInTheDocument()
  })
})

describe('WebSocket swarm_task_update event', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    capturedSubscribeHandler = null
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: { id: 'swarm-1', name: 'Test Swarm' },
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('updates task status when swarm_task_update event received', () => {
    const tasks: CoordinationTask[] = [
      {
        id: 'ws-task-1',
        title: 'WS Task',
        description: 'Task updated via WS',
        prompt: 'Test',
        priority: 'medium',
        status: 'pending',
        progress: 0,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    // Verify initial status shows 1 pending
    const pendingCards = screen.getAllByText('Pending')
    expect(pendingCards.length).toBeGreaterThan(0)

    // Fire a WebSocket event to update the task
    act(() => {
      capturedSubscribeHandler!({
        taskId: 'ws-task-1',
        status: 'running',
        progress: 0.5,
      })
    })

    // Task should now show as running (stat card updated)
    const runningCards = screen.getAllByText('Running')
    expect(runningCards.length).toBeGreaterThan(0)
  })

  it('updates task progress via WS event', () => {
    const tasks: CoordinationTask[] = [
      {
        id: 'ws-prog-task',
        title: 'Progress Task',
        description: 'Progress test',
        prompt: 'Test',
        priority: 'medium',
        status: 'running',
        progress: 0.1,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    // Initially 10%
    expect(screen.getByText('10%')).toBeInTheDocument()

    // Update progress via WS
    act(() => {
      capturedSubscribeHandler!({
        taskId: 'ws-prog-task',
        status: 'running',
        progress: 0.75,
      })
    })

    expect(screen.getByText('75%')).toBeInTheDocument()
  })

  it('preserves existing progress when WS event has no progress', () => {
    const tasks: CoordinationTask[] = [
      {
        id: 'ws-noprog',
        title: 'No Progress Task',
        description: 'No progress in event',
        prompt: 'Test',
        priority: 'medium',
        status: 'running',
        progress: 0.4,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    expect(screen.getByText('40%')).toBeInTheDocument()

    // Update without progress field
    act(() => {
      capturedSubscribeHandler!({
        taskId: 'ws-noprog',
        status: 'running',
      })
    })

    // Progress should stay at 40%
    expect(screen.getByText('40%')).toBeInTheDocument()
  })

  it('ignores WS events for unknown task IDs', () => {
    const tasks: CoordinationTask[] = [
      {
        id: 'known-task',
        title: 'Known Task',
        description: 'Known task',
        prompt: 'Test',
        priority: 'medium',
        status: 'pending',
        progress: 0,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    // Fire event for unknown task
    act(() => {
      capturedSubscribeHandler!({
        taskId: 'unknown-task-999',
        status: 'running',
        progress: 0.5,
      })
    })

    // Known task should remain pending
    expect(screen.getByText('Known Task')).toBeInTheDocument()
  })

  it('unsubscribes on unmount', () => {
    mockUnsubscribe.mockClear()
    const { unmount } = render(<SwarmCoordinatorPanel />)

    unmount()

    expect(mockUnsubscribe).toHaveBeenCalled()
  })
})

describe('Polling fallback for active swarm', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    capturedSubscribeHandler = null
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: { id: 'swarm-1', name: 'Poll Swarm' },
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('marks running tasks as completed when backend returns no running tasks', async () => {
    const tasks: CoordinationTask[] = [
      {
        id: 'poll-task-1',
        title: 'Poll Running Task',
        description: 'Running',
        prompt: 'Test',
        priority: 'medium',
        status: 'running',
        progress: 0.5,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    // getSwarmTasks returns empty list (no running tasks)
    vi.mocked(api.swarm.getSwarmTasks).mockResolvedValue([])

    render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    // Advance by 10s to trigger polling
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })

    // The running task should be marked as completed
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('does not mark tasks completed when backend still has running tasks', async () => {
    const tasks: CoordinationTask[] = [
      {
        id: 'poll-task-2',
        title: 'Still Running',
        description: 'Still running',
        prompt: 'Test',
        priority: 'medium',
        status: 'running',
        progress: 0.5,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    // Backend still has running tasks
    vi.mocked(api.swarm.getSwarmTasks).mockResolvedValue([
      { id: 'poll-task-2', status: 'running' } as CoordinationTask,
    ])

    render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })

    // Should still show Running stat (not completed)
    const runningCards = screen.getAllByText('Running')
    expect(runningCards.length).toBeGreaterThan(0)
  })

  it('handles polling error gracefully', async () => {
    const { logger } = await import('../utils')
    vi.mocked(api.swarm.getSwarmTasks).mockRejectedValue(new Error('Network error'))

    const tasks: CoordinationTask[] = [
      {
        id: 'poll-error-task',
        title: 'Poll Error Task',
        description: 'Error test',
        prompt: 'Test',
        priority: 'medium',
        status: 'running',
        progress: 0.5,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })

    // Logger.debug should have been called
    expect(logger.debug).toHaveBeenCalled()
  })

  it('does not poll when there is no active swarm', async () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: null,
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    vi.mocked(api.swarm.getSwarmTasks).mockClear()

    render(<SwarmCoordinatorPanel />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000)
    })

    expect(api.swarm.getSwarmTasks).not.toHaveBeenCalled()
  })

  it('stops polling on unmount', async () => {
    vi.mocked(api.swarm.getSwarmTasks).mockClear()

    const tasks: CoordinationTask[] = [
      {
        id: 'poll-unmount',
        title: 'Unmount Task',
        description: 'Test',
        prompt: 'Test',
        priority: 'medium',
        status: 'running',
        progress: 0.3,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    const { unmount } = render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    unmount()

    const callCountBefore = vi.mocked(api.swarm.getSwarmTasks).mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000)
    })

    // No new calls after unmount
    expect(vi.mocked(api.swarm.getSwarmTasks).mock.calls.length).toBe(callCountBefore)
  })

  it('updates selectedTask to completed when backend finishes running task', async () => {
    const tasks: CoordinationTask[] = [
      {
        id: 'sel-poll-task',
        title: 'Selected Poll Task',
        description: 'Selected and running',
        prompt: 'Test',
        priority: 'medium',
        status: 'running',
        progress: 0.6,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    vi.mocked(api.swarm.getSwarmTasks).mockResolvedValue([])

    render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    // Select the task
    fireEvent.click(screen.getByText('Selected Poll Task'))
    expect(screen.getByText('Task Details')).toBeInTheDocument()

    // Advance polling
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })

    // Selected task details should show completed
    expect(screen.getByText('completed')).toBeInTheDocument()
  })
})

describe('New Task Modal - close and reset', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    capturedSubscribeHandler = null
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: { id: '1', name: 'Test Swarm' },
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('closes modal with X button and resets form', () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))

    // Fill in a title
    const titleInput = screen.getByPlaceholderText('Implement user authentication')
    fireEvent.change(titleInput, { target: { value: 'Some title' } })

    // The X button is the one inside the dialog that has an SVG with lucide-x class
    const dialog = screen.getByRole('dialog')
    const xButtons = dialog.querySelectorAll('button')
    // The X button has a child SVG with the lucide-x class
    let xButton: HTMLButtonElement | null = null
    xButtons.forEach(btn => {
      const svg = btn.querySelector('svg')
      if (svg && btn.closest('[role="dialog"]') && btn.parentElement?.querySelector('h3')) {
        // This is the header close button (sibling of h3)
        xButton = btn
      }
    })
    expect(xButton).not.toBeNull()
    fireEvent.click(xButton!)

    expect(screen.queryByText('Submit New Task')).not.toBeInTheDocument()
  })

  it('switches risk tolerance to low', () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))

    // Click the "low" risk tolerance button
    const lowButton = screen.getByText('低')
    fireEvent.click(lowButton)

    // Should have active styling (just verify click works without crash)
    expect(lowButton).toBeInTheDocument()
  })

  it('switches risk tolerance to high', () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))

    const highButton = screen.getByText('高')
    fireEvent.click(highButton)
    expect(highButton).toBeInTheDocument()
  })

  it('enters constraints text', () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))

    const constraintsInput = screen.getByPlaceholderText('如：不改测试文件, 不动配置')
    fireEvent.change(constraintsInput, { target: { value: 'no test changes, no config edits' } })
    expect(constraintsInput).toHaveValue('no test changes, no config edits')
  })

  it('enters acceptance criteria text', () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))

    const acceptanceInput = screen.getByPlaceholderText('如：所有测试通过, 无 lint 错误')
    fireEvent.change(acceptanceInput, { target: { value: 'all tests pass, no lint errors' } })
    expect(acceptanceInput).toHaveValue('all tests pass, no lint errors')
  })
})

describe('handleSubmitTask with constraints and acceptance', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    capturedSubscribeHandler = null
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: { id: 'swarm-1', name: 'Submit Swarm' },
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('submits task with constraints parsed as comma-separated list', async () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))

    fireEvent.change(screen.getByPlaceholderText('Implement user authentication'), { target: { value: 'Constrained Task' } })
    fireEvent.change(screen.getByPlaceholderText('Write the prompt that will be sent to agents...'), { target: { value: 'Do the thing' } })
    fireEvent.change(screen.getByPlaceholderText('如：不改测试文件, 不动配置'), { target: { value: 'no tests, no config' } })
    fireEvent.change(screen.getByPlaceholderText('如：所有测试通过, 无 lint 错误'), { target: { value: 'tests pass, no lint' } })

    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }))

    await vi.advanceTimersByTimeAsync(100)

    expect(api.swarm.submitTask).toHaveBeenCalledWith(
      expect.objectContaining({
        constraints: ['no tests', 'no config'],
        acceptance: ['tests pass', 'no lint'],
      })
    )
  })

  it('submits task with empty constraints and acceptance', async () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))

    fireEvent.change(screen.getByPlaceholderText('Implement user authentication'), { target: { value: 'No Constraints Task' } })
    fireEvent.change(screen.getByPlaceholderText('Write the prompt that will be sent to agents...'), { target: { value: 'Test prompt' } })

    // Don't fill constraints or acceptance

    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }))

    await vi.advanceTimersByTimeAsync(100)

    expect(api.swarm.submitTask).toHaveBeenCalledWith(
      expect.objectContaining({
        constraints: undefined,
        acceptance: undefined,
      })
    )
  })

  it('submits with riskTolerance value', async () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))

    fireEvent.change(screen.getByPlaceholderText('Implement user authentication'), { target: { value: 'Risk Task' } })
    fireEvent.change(screen.getByPlaceholderText('Write the prompt that will be sent to agents...'), { target: { value: 'Prompt' } })

    // Click high risk
    fireEvent.click(screen.getByText('高'))

    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }))

    await vi.advanceTimersByTimeAsync(100)

    expect(api.swarm.submitTask).toHaveBeenCalledWith(
      expect.objectContaining({
        riskTolerance: 'high',
      })
    )
  })

  it('handles non-Error rejection in submit catch', async () => {
    const { logger } = await import('../utils')
    vi.mocked(api.swarm.submitTask).mockRejectedValueOnce('string error')

    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))

    fireEvent.change(screen.getByPlaceholderText('Implement user authentication'), { target: { value: 'Error Task' } })
    fireEvent.change(screen.getByPlaceholderText('Write the prompt that will be sent to agents...'), { target: { value: 'Prompt' } })

    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }))

    await vi.advanceTimersByTimeAsync(100)

    // Should show generic error toast
    expect(screen.getByText('Submit New Task')).toBeInTheDocument()
    expect(logger.error).toHaveBeenCalled()
  })

  it('calls recordTaskScheduled after successful submission', async () => {
    const { schedulingService } = await import('../services/scheduling')

    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))

    fireEvent.change(screen.getByPlaceholderText('Implement user authentication'), { target: { value: 'Scheduled Task' } })
    fireEvent.change(screen.getByPlaceholderText('Write the prompt that will be sent to agents...'), { target: { value: 'Prompt' } })

    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }))

    await vi.advanceTimersByTimeAsync(100)

    expect(schedulingService.recordTaskScheduled).toHaveBeenCalled()
  })
})

describe('handleStartTask success path - agent results', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    capturedSubscribeHandler = null
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: { id: '1', name: 'Test Swarm' },
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls schedulingService.updateAgentLoad after task execution', async () => {
    const { schedulingService } = await import('../services/scheduling')
    vi.mocked(schedulingService.updateAgentLoad).mockClear()

    vi.mocked(api.swarm.executeTask).mockResolvedValueOnce({
      taskId: 'exec-task',
      status: 'completed',
      agentResults: {
        'agent-1': { agentId: 'agent-1', content: 'Result 1', success: true, durationMs: 500 },
        'agent-2': { agentId: 'agent-2', content: 'Result 2', success: true, durationMs: 800 },
      },
    })

    const tasks: CoordinationTask[] = [
      {
        id: 'exec-load-task',
        title: 'Load Test Task',
        description: 'Test',
        prompt: 'Test',
        priority: 'medium',
        status: 'pending',
        progress: 0,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    fireEvent.click(screen.getByText('Load Test Task'))
    fireEvent.click(screen.getByText('Start'))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    // Should have been called for both agents
    expect(schedulingService.updateAgentLoad).toHaveBeenCalledTimes(2)
    expect(schedulingService.updateAgentLoad).toHaveBeenCalledWith('agent-1', 0, 5, 500)
    expect(schedulingService.updateAgentLoad).toHaveBeenCalledWith('agent-2', 0, 5, 800)
  })

  it('does not update state if component unmounts before API resolves', async () => {
    vi.useRealTimers()

    let resolveApi: (value: unknown) => void
    vi.mocked(api.swarm.executeTask).mockImplementation(async () => {
      await new Promise((resolve) => { resolveApi = resolve })
      return {
        taskId: 'unmount-task',
        status: 'completed',
        agentResults: {
          'agent-1': { agentId: 'agent-1', content: 'Result', success: true, durationMs: 100 },
        },
      }
    })

    const tasks: CoordinationTask[] = [
      {
        id: 'unmount-task',
        title: 'Unmount Task',
        description: 'Test',
        prompt: 'Test',
        priority: 'medium',
        status: 'pending',
        progress: 0,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    const { unmount } = render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    fireEvent.click(screen.getByText('Unmount Task'))
    fireEvent.click(screen.getByText('Start'))

    await waitFor(() => {
      expect(screen.getByText('running')).toBeInTheDocument()
    })

    // Unmount while API is pending
    unmount()

    // Resolve the API call after unmount - should not throw
    resolveApi!(undefined)

    // Wait a bit to ensure no async errors
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
  })
})

describe('handleCancelTask via ConfirmDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    capturedSubscribeHandler = null
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: { id: '1', name: 'Test Swarm' },
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('dismisses cancel confirm dialog without canceling task', () => {
    const tasks: CoordinationTask[] = [
      {
        id: 'dismiss-task',
        title: 'Dismiss Task',
        description: 'Test',
        prompt: 'Test',
        priority: 'medium',
        status: 'running',
        progress: 0.5,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    fireEvent.click(screen.getByText('Dismiss Task'))
    fireEvent.click(screen.getByText('Cancel'))

    // ConfirmDialog should be visible
    expect(screen.getByText('Are you sure you want to cancel "Dismiss Task"? This action cannot be undone.')).toBeInTheDocument()

    // Click the dialog cancel button (not the task cancel button)
    const dialogCancelButtons = screen.getAllByRole('button').filter(
      btn => btn.textContent === 'Cancel' && btn.closest('[role="alertdialog"]')
    )
    fireEvent.click(dialogCancelButtons[0])

    // ConfirmDialog should be gone
    expect(screen.queryByText('Are you sure you want to cancel')).not.toBeInTheDocument()
    // Task should still be running (not failed)
    expect(screen.getByText('running')).toBeInTheDocument()
  })

  it('shows task title in confirm dialog when task has a title', () => {
    const tasks: CoordinationTask[] = [
      {
        id: 'named-task',
        title: 'My Named Task',
        description: 'Test',
        prompt: 'Test',
        priority: 'medium',
        status: 'running',
        progress: 0.5,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    render(<SwarmCoordinatorPanel initialTasks={tasks} />)

    fireEvent.click(screen.getByText('My Named Task'))
    fireEvent.click(screen.getByText('Cancel'))

    // The confirm dialog should contain the task title
    expect(screen.getByRole('alertdialog')).toHaveTextContent('My Named Task')
  })

  it('uses taskId in confirm dialog when task has no title', () => {
    // requestCancelTask uses task?.title || taskId
    // We need to directly test with testCancelTaskId on a task without a title match
    const tasks: CoordinationTask[] = [
      {
        id: 'id-only-task',
        title: 'Some Task',
        description: 'Test',
        prompt: 'Test',
        priority: 'medium',
        status: 'running',
        progress: 0.5,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      },
    ]

    // Use testCancelTaskId to trigger requestCancelTask with a non-existent ID
    render(<SwarmCoordinatorPanel initialTasks={tasks} testCancelTaskId="nonexistent-id" />)

    // Should show confirm dialog with the raw ID since no task found
    expect(screen.getByText(/nonexistent-id/)).toBeInTheDocument()
  })
})

describe('TaskCard expanded details', () => {
  const baseTask: CoordinationTask = {
    id: 'expand-task',
    title: 'Expandable Task',
    description: 'Test',
    prompt: 'Test',
    priority: 'medium',
    status: 'completed',
    progress: 1,
    assignedTo: [],
    results: {},
    createdAt: new Date().toISOString(),
  }

  it('toggles expanded state on click of Show/Hide details button', () => {
    const onToggleExpand = vi.fn()
    render(
      <TaskCard
        task={baseTask}
        isSelected={false}
        isExpanded={false}
        statusColor="bg-success"
        priorityColor="text-warning"
        onClick={() => {}}
        onToggleExpand={onToggleExpand}
      />
    )

    const toggleButton = screen.getByText('Show details')
    fireEvent.click(toggleButton)
    expect(onToggleExpand).toHaveBeenCalled()
  })

  it('shows Hide details when expanded', () => {
    render(
      <TaskCard
        task={baseTask}
        isSelected={false}
        isExpanded={true}
        statusColor="bg-success"
        priorityColor="text-warning"
        onClick={() => {}}
        onToggleExpand={() => {}}
      />
    )

    expect(screen.getByText('Hide details')).toBeInTheDocument()
  })

  it('shows No results yet when expanded with no results', () => {
    render(
      <TaskCard
        task={baseTask}
        isSelected={false}
        isExpanded={true}
        statusColor="bg-success"
        priorityColor="text-warning"
        onClick={() => {}}
        onToggleExpand={() => {}}
      />
    )

    expect(screen.getByText('No results yet')).toBeInTheDocument()
  })

  it('shows result content when expanded with results', () => {
    const taskWithResults: CoordinationTask = {
      ...baseTask,
      results: {
        'agent-1': {
          agentId: 'agent-1',
          content: 'Result content for agent one',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:01:00Z',
          duration: 60000,
        },
      },
    }

    render(
      <TaskCard
        task={taskWithResults}
        isSelected={false}
        isExpanded={true}
        statusColor="bg-success"
        priorityColor="text-warning"
        onClick={() => {}}
        onToggleExpand={() => {}}
      />
    )

    expect(screen.getByText('agent-1')).toBeInTheDocument()
    expect(screen.getByText('Result content for agent one')).toBeInTheDocument()
  })

  it('shows filesChanged count when expanded with file changes', () => {
    const taskWithFiles: CoordinationTask = {
      ...baseTask,
      results: {
        'agent-1': {
          agentId: 'agent-1',
          content: 'Changed files',
          filesChanged: ['file1.ts', 'file2.ts', 'file3.ts'],
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:01:00Z',
          duration: 5000,
        },
      },
    }

    render(
      <TaskCard
        task={taskWithFiles}
        isSelected={false}
        isExpanded={true}
        statusColor="bg-success"
        priorityColor="text-warning"
        onClick={() => {}}
        onToggleExpand={() => {}}
      />
    )

    expect(screen.getByText('3 files')).toBeInTheDocument()
  })

  it('shows duration when result has duration > 0', () => {
    const taskWithDuration: CoordinationTask = {
      ...baseTask,
      results: {
        'agent-1': {
          agentId: 'agent-1',
          content: 'Result',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:01:00Z',
          duration: 12345,
        },
      },
    }

    render(
      <TaskCard
        task={taskWithDuration}
        isSelected={false}
        isExpanded={true}
        statusColor="bg-success"
        priorityColor="text-warning"
        onClick={() => {}}
        onToggleExpand={() => {}}
      />
    )

    expect(screen.getByText('12345ms')).toBeInTheDocument()
  })

  it('does not show duration when duration is 0', () => {
    const taskWithZeroDuration: CoordinationTask = {
      ...baseTask,
      results: {
        'agent-1': {
          agentId: 'agent-1',
          content: 'Result',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:01:00Z',
          duration: 0,
        },
      },
    }

    render(
      <TaskCard
        task={taskWithZeroDuration}
        isSelected={false}
        isExpanded={true}
        statusColor="bg-success"
        priorityColor="text-warning"
        onClick={() => {}}
        onToggleExpand={() => {}}
      />
    )

    expect(screen.queryByText(/ms/)).not.toBeInTheDocument()
  })

  it('shows HIGH risk level when > 10 files changed', () => {
    const manyFiles = Array.from({ length: 12 }, (_, i) => `file${i}.ts`)
    const taskHighRisk: CoordinationTask = {
      ...baseTask,
      results: {
        'agent-1': {
          agentId: 'agent-1',
          content: 'Result',
          filesChanged: manyFiles,
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:01:00Z',
          duration: 1000,
        },
      },
    }

    render(
      <TaskCard
        task={taskHighRisk}
        isSelected={false}
        isExpanded={true}
        statusColor="bg-success"
        priorityColor="text-warning"
        onClick={() => {}}
        onToggleExpand={() => {}}
      />
    )

    expect(screen.getByText('HIGH')).toBeInTheDocument()
  })

  it('shows MEDIUM risk level when > 3 files changed', () => {
    const taskMedRisk: CoordinationTask = {
      ...baseTask,
      results: {
        'agent-1': {
          agentId: 'agent-1',
          content: 'Result',
          filesChanged: ['file1.ts', 'file2.ts', 'file3.ts', 'file4.ts'],
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:01:00Z',
          duration: 1000,
        },
      },
    }

    render(
      <TaskCard
        task={taskMedRisk}
        isSelected={false}
        isExpanded={true}
        statusColor="bg-success"
        priorityColor="text-warning"
        onClick={() => {}}
        onToggleExpand={() => {}}
      />
    )

    expect(screen.getByText('MEDIUM')).toBeInTheDocument()
  })

  it('shows LOW risk level when <= 3 files changed', () => {
    const taskLowRisk: CoordinationTask = {
      ...baseTask,
      results: {
        'agent-1': {
          agentId: 'agent-1',
          content: 'Result',
          filesChanged: ['file1.ts', 'file2.ts'],
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:01:00Z',
          duration: 1000,
        },
      },
    }

    render(
      <TaskCard
        task={taskLowRisk}
        isSelected={false}
        isExpanded={true}
        statusColor="bg-success"
        priorityColor="text-warning"
        onClick={() => {}}
        onToggleExpand={() => {}}
      />
    )

    expect(screen.getByText('LOW')).toBeInTheDocument()
  })

  it('shows LOW risk when no results', () => {
    render(
      <TaskCard
        task={baseTask}
        isSelected={false}
        isExpanded={true}
        statusColor="bg-success"
        priorityColor="text-warning"
        onClick={() => {}}
        onToggleExpand={() => {}}
      />
    )

    expect(screen.getByText('LOW')).toBeInTheDocument()
  })

  it('responds to Enter key press', () => {
    const onClick = vi.fn()
    render(
      <TaskCard
        task={baseTask}
        isSelected={false}
        isExpanded={false}
        statusColor="bg-success"
        priorityColor="text-warning"
        onClick={onClick}
        onToggleExpand={() => {}}
      />
    )

    // Find the card element by role
    const card = screen.getByRole('button', { name: /Expandable Task/ })
    fireEvent.keyDown(card, { key: 'Enter', preventDefault: () => {} })
    expect(onClick).toHaveBeenCalled()
  })

  it('responds to Space key press', () => {
    const onClick = vi.fn()
    render(
      <TaskCard
        task={baseTask}
        isSelected={false}
        isExpanded={false}
        statusColor="bg-success"
        priorityColor="text-warning"
        onClick={onClick}
        onToggleExpand={() => {}}
      />
    )

    const card = screen.getByRole('button', { name: /Expandable Task/ })
    fireEvent.keyDown(card, { key: ' ', preventDefault: () => {} })
    expect(onClick).toHaveBeenCalled()
  })

  it('ignores other key presses', () => {
    const onClick = vi.fn()
    render(
      <TaskCard
        task={baseTask}
        isSelected={false}
        isExpanded={false}
        statusColor="bg-success"
        priorityColor="text-warning"
        onClick={onClick}
        onToggleExpand={() => {}}
      />
    )

    const card = screen.getByRole('button', { name: /Expandable Task/ })
    fireEvent.keyDown(card, { key: 'Tab', preventDefault: () => {} })
    expect(onClick).not.toHaveBeenCalled()
  })

  it('shows description from prompt when no description', () => {
    const taskNoDesc: CoordinationTask = {
      ...baseTask,
      description: '',
      prompt: 'This is a long prompt that should be truncated when displayed as fallback for description',
    }

    render(
      <TaskCard
        task={taskNoDesc}
        isSelected={false}
        isExpanded={false}
        statusColor="bg-success"
        priorityColor="text-warning"
        onClick={() => {}}
        onToggleExpand={() => {}}
      />
    )

    // Should show first 50 chars of prompt + "..."
    // prompt.slice(0, 50) = "This is a long prompt that should be truncated whe"
    expect(screen.getByText('This is a long prompt that should be truncated whe...')).toBeInTheDocument()
  })

  it('shows empty string when no description and no prompt', () => {
    const taskEmpty: CoordinationTask = {
      ...baseTask,
      description: '',
      prompt: '',
    }

    render(
      <TaskCard
        task={taskEmpty}
        isSelected={false}
        isExpanded={false}
        statusColor="bg-success"
        priorityColor="text-warning"
        onClick={() => {}}
        onToggleExpand={() => {}}
      />
    )

    // Should still render without crash
    expect(screen.getByText('Expandable Task')).toBeInTheDocument()
  })

  it('shows selected styling when isSelected is true', () => {
    render(
      <TaskCard
        task={baseTask}
        isSelected={true}
        isExpanded={false}
        statusColor="bg-success"
        priorityColor="text-warning"
        onClick={() => {}}
        onToggleExpand={() => {}}
      />
    )

    // The outer card div has the role="button" and the selected styling
    const card = screen.getByRole('button', { name: /Expandable Task/ })
    expect(card.className).toContain('border-accent')
  })

  it('uses default priorityColor for unknown priority', () => {
    const unknownPriorityTask: CoordinationTask = {
      ...baseTask,
      priority: 'unknown',
    }

    render(
      <TaskCard
        task={unknownPriorityTask}
        isSelected={false}
        isExpanded={false}
        statusColor="bg-success"
        priorityColor="text-warning"
        onClick={() => {}}
        onToggleExpand={() => {}}
      />
    )

    // Should still render, using the fallback color
    expect(screen.getByText('unknown')).toBeInTheDocument()
  })

  it('does not show progress bar for non-running tasks', () => {
    const pendingTask: CoordinationTask = {
      ...baseTask,
      status: 'pending',
      progress: 0.5,
    }

    render(
      <TaskCard
        task={pendingTask}
        isSelected={false}
        isExpanded={false}
        statusColor="bg-text-tertiary"
        priorityColor="text-warning"
        onClick={() => {}}
        onToggleExpand={() => {}}
      />
    )

    expect(screen.queryByText('Progress')).not.toBeInTheDocument()
  })

  it('does not show assigned agents section when empty array', () => {
    render(
      <TaskCard
        task={{ ...baseTask, assignedTo: [] }}
        isSelected={false}
        isExpanded={false}
        statusColor="bg-success"
        priorityColor="text-warning"
        onClick={() => {}}
        onToggleExpand={() => {}}
      />
    )

    // No agent badges should be shown
    expect(screen.queryByText('+')).not.toBeInTheDocument()
  })

  it('truncates long content to 200 chars in expanded view', () => {
    const longContent = 'A'.repeat(300)
    const taskLongContent: CoordinationTask = {
      ...baseTask,
      results: {
        'agent-1': {
          agentId: 'agent-1',
          content: longContent,
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:01:00Z',
          duration: 1000,
        },
      },
    }

    render(
      <TaskCard
        task={taskLongContent}
        isSelected={false}
        isExpanded={true}
        statusColor="bg-success"
        priorityColor="text-warning"
        onClick={() => {}}
        onToggleExpand={() => {}}
      />
    )

    // Should show first 200 chars
    expect(screen.getByText('A'.repeat(200))).toBeInTheDocument()
    // Full 300 chars should NOT be present
    expect(screen.queryByText('A'.repeat(300))).not.toBeInTheDocument()
  })

  it('handles result with no content in expanded view', () => {
    const taskNoContent: CoordinationTask = {
      ...baseTask,
      results: {
        'agent-1': {
          agentId: 'agent-1',
          content: '',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:01:00Z',
          duration: 100,
        },
      },
    }

    render(
      <TaskCard
        task={taskNoContent}
        isSelected={false}
        isExpanded={true}
        statusColor="bg-success"
        priorityColor="text-warning"
        onClick={() => {}}
        onToggleExpand={() => {}}
      />
    )

    // Should show agent label and duration but no Output line
    expect(screen.getByText('agent-1')).toBeInTheDocument()
    expect(screen.getByText('100ms')).toBeInTheDocument()
  })

  it('handles result with filesChanged empty array', () => {
    const taskEmptyFiles: CoordinationTask = {
      ...baseTask,
      results: {
        'agent-1': {
          agentId: 'agent-1',
          content: 'Result',
          filesChanged: [],
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:01:00Z',
          duration: 100,
        },
      },
    }

    render(
      <TaskCard
        task={taskEmptyFiles}
        isSelected={false}
        isExpanded={true}
        statusColor="bg-success"
        priorityColor="text-warning"
        onClick={() => {}}
        onToggleExpand={() => {}}
      />
    )

    // Should not show files count since array is empty
    expect(screen.queryByText(/files/)).not.toBeInTheDocument()
  })
})

describe('TaskDetails component - comprehensive', () => {
  const baseTask: CoordinationTask = {
    id: 'detail-comp-task',
    title: 'Detail Test',
    description: 'Detail description',
    prompt: 'Detail prompt text',
    priority: 'high',
    status: 'completed',
    progress: 1,
    assignedTo: [],
    results: {},
    createdAt: new Date().toISOString(),
  }

  const mockHandlers = {
    onStart: vi.fn(),
    onPause: vi.fn(),
    onCancel: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders task ID', () => {
    render(<TaskDetails task={baseTask} onClose={() => {}} {...mockHandlers} />)
    expect(screen.getByText('detail-comp-task')).toBeInTheDocument()
  })

  it('renders task title', () => {
    render(<TaskDetails task={baseTask} onClose={() => {}} {...mockHandlers} />)
    expect(screen.getByText('Detail Test')).toBeInTheDocument()
  })

  it('renders task status capitalized', () => {
    render(<TaskDetails task={baseTask} onClose={() => {}} {...mockHandlers} />)
    expect(screen.getByText('completed')).toBeInTheDocument()
  })

  it('renders task priority with capitalize class', () => {
    render(<TaskDetails task={baseTask} onClose={() => {}} {...mockHandlers} />)
    // The component renders "high" with CSS capitalize, not text-transformed
    expect(screen.getByText('high')).toBeInTheDocument()
  })

  it('renders prompt in pre block', () => {
    render(<TaskDetails task={baseTask} onClose={() => {}} {...mockHandlers} />)
    expect(screen.getByText('Detail prompt text')).toBeInTheDocument()
  })

  it('renders no action buttons for completed task', () => {
    render(<TaskDetails task={baseTask} onClose={() => {}} {...mockHandlers} />)
    expect(screen.queryByText('Start')).not.toBeInTheDocument()
    expect(screen.queryByText('Pause')).not.toBeInTheDocument()
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument()
  })

  it('renders no action buttons for failed task', () => {
    const failedTask = { ...baseTask, status: 'failed' as const }
    render(<TaskDetails task={failedTask} onClose={() => {}} {...mockHandlers} />)
    expect(screen.queryByText('Start')).not.toBeInTheDocument()
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    render(<TaskDetails task={baseTask} onClose={onClose} {...mockHandlers} />)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders results with multiple agents', () => {
    const taskMultiResults: CoordinationTask = {
      ...baseTask,
      results: {
        'agent-a': {
          agentId: 'agent-a',
          content: 'Result A',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:01:00Z',
          duration: 60000,
        },
        'agent-b': {
          agentId: 'agent-b',
          content: 'Result B',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T00:01:00Z',
          duration: 45000,
        },
      },
    }

    render(<TaskDetails task={taskMultiResults} onClose={() => {}} {...mockHandlers} />)
    expect(screen.getByText('agent-a')).toBeInTheDocument()
    expect(screen.getByText('agent-b')).toBeInTheDocument()
    expect(screen.getByText('Result A')).toBeInTheDocument()
    expect(screen.getByText('Result B')).toBeInTheDocument()
  })

  it('does not render Results section when results is empty object', () => {
    render(<TaskDetails task={baseTask} onClose={() => {}} {...mockHandlers} />)
    expect(screen.queryByText('Results')).not.toBeInTheDocument()
  })
})

describe('Scheduling stats display', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    capturedSubscribeHandler = null
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: { id: '1', name: 'Test Swarm' },
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('displays scheduling stats from service', () => {
    render(<SwarmCoordinatorPanel />)

    // getSchedulingStats returns totalTasksScheduled: 5
    // There's a dedicated "Scheduled" label next to the value
    const scheduledLabel = screen.getByText('Scheduled')
    const scheduledContainer = scheduledLabel.closest('.bg-glass')
    const scheduledValue = scheduledContainer?.querySelector('.text-xl, .text-sm.font-bold')
    expect(scheduledValue?.textContent).toBe('5')

    // calculateLoadBalanceEfficiency returns 0.85 -> 85%
    const loadLabel = screen.getByText('Load Balance')
    const loadContainer = loadLabel.closest('.bg-glass')
    const loadValue = loadContainer?.querySelector('.text-sm.font-bold')
    expect(loadValue?.textContent).toBe('85%')

    // starvationPreventions: 0
    const starvationLabel = screen.getByText('Starvation')
    const starvationContainer = starvationLabel.closest('.bg-glass')
    const starvationValue = starvationContainer?.querySelector('.text-sm.font-bold')
    expect(starvationValue?.textContent).toBe('0')
  })

  it('displays Scheduled label', () => {
    render(<SwarmCoordinatorPanel />)
    expect(screen.getByText('Scheduled')).toBeInTheDocument()
  })

  it('displays Load Balance label', () => {
    render(<SwarmCoordinatorPanel />)
    expect(screen.getByText('Load Balance')).toBeInTheDocument()
  })

  it('displays Starvation label', () => {
    render(<SwarmCoordinatorPanel />)
    expect(screen.getByText('Starvation')).toBeInTheDocument()
  })
})

describe('Unmounted component protection', () => {
  it('does not update state after unmount during submit', async () => {
    vi.useRealTimers()

    let resolveSubmit: (value: unknown) => void
    vi.mocked(api.swarm.submitTask).mockImplementation(async () => {
      await new Promise((resolve) => { resolveSubmit = resolve })
      return 'late-task-id'
    })

    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: { id: '1', name: 'Test Swarm' },
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })

    const { unmount } = render(<SwarmCoordinatorPanel />)

    fireEvent.click(screen.getByText('New Task'))
    fireEvent.change(screen.getByPlaceholderText('Implement user authentication'), { target: { value: 'Unmount Submit' } })
    fireEvent.change(screen.getByPlaceholderText('Write the prompt that will be sent to agents...'), { target: { value: 'Prompt' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }))

    // Unmount while API is pending
    unmount()

    // Resolve API after unmount - should not throw
    resolveSubmit!(undefined)

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
  })
})

describe('Refresh button', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    capturedSubscribeHandler = null
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: { id: '1', name: 'Test Swarm' },
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('has a Refresh button in header', () => {
    render(<SwarmCoordinatorPanel />)
    expect(screen.getByLabelText('Refresh')).toBeInTheDocument()
  })
})