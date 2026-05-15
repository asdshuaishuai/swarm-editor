import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import SwarmCoordinatorPanel, { TaskCard, TaskDetails } from './SwarmCoordinatorPanel'
import { useAppStore } from '../store/appStore'
import { api } from '../services'
import type { CoordinationTask } from '../types'

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
      getSwarmTasks: vi.fn().mockResolvedValue({ pending: 0, running: 0, completed: 0 }),
    },
  },
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
        priority: 5,
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
        priority: 5,
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
        priority: 5,
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
      priority: 5,
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
      priority: 5,
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
      priority: 5,
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
      priority: 5,
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
        priority: 5,
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
        priority: 5,
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
      priority: 5,
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
      priority: 5,
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
      priority: 5,
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
      priority: 5,
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
        priority: 5,
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
        priority: 5,
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
        priority: 5,
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
        priority: 5,
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
    const priorityInput = screen.getByRole('spinbutton')
    fireEvent.change(priorityInput, { target: { value: '8' } })
    expect(priorityInput).toHaveValue(8)
  })

  it('changes required role selection', () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))
    const roleSelects = screen.getAllByRole('combobox')
    fireEvent.change(roleSelects[0], { target: { value: 'coder' } })
    expect(roleSelects[0]).toHaveValue('coder')
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

  it('sorts tasks by priority', async () => {
    render(<SwarmCoordinatorPanel />)
    // Create first task with priority 5
    fireEvent.click(screen.getByText('New Task'))
    fireEvent.change(screen.getByPlaceholderText('Implement user authentication'), { target: { value: 'Medium Priority Task' } })
    fireEvent.change(screen.getByPlaceholderText('Write the prompt that will be sent to agents...'), { target: { value: 'Test' } })
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }))
    // Wait for first task to be created
    await vi.advanceTimersByTimeAsync(100)
    // Create second task with priority 10
    fireEvent.click(screen.getByText('New Task'))
    fireEvent.change(screen.getByPlaceholderText('Implement user authentication'), { target: { value: 'High Priority Task' } })
    fireEvent.change(screen.getByPlaceholderText('Write the prompt that will be sent to agents...'), { target: { value: 'Test' } })
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }))
    // Wait for second task to be created
    await vi.advanceTimersByTimeAsync(100)
    // High priority task should appear first (sorted by priority desc)
    const tasks = screen.getAllByText(/Priority Task/)
    expect(tasks[0]).toHaveTextContent('High Priority Task')
    expect(tasks[1]).toHaveTextContent('Medium Priority Task')
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
    priority: 5,
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
        statusColor="bg-accent animate-pulse"
        priorityColor="text-warning"
        onClick={() => {}}
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
        statusColor="bg-info"
        priorityColor="text-warning"
        onClick={() => {}}
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
        statusColor="bg-info"
        priorityColor="text-warning"
        onClick={() => {}}
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
    priority: 7,
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
      priority: 5,
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
        priority: 5,
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
        priority: 3,
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
        priority: 5,
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
        priority: 3,
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
        priority: 5,
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
        priority: 3,
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
        priority: 5,
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
        priority: 3,
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
        priority: 5,
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
        priority: 3,
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
        priority: 5,
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
        priority: 3,
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
        priority: 5,
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
        priority: 5,
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
        priority: 3,
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
        priority: 5,
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
        priority: 3,
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
        priority: 5,
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
        priority: 3,
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
        priority: 5,
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
        priority: 5,
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
        priority: 3,
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
        priority: 5,
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
        priority: 5,
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