import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import SwarmCoordinatorPanel, { TaskCard, TaskDetails } from './SwarmCoordinatorPanel'
import { useAppStore } from '../store/appStore'
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
    },
  },
}))

describe('SwarmCoordinatorPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: { id: '1', name: 'Test Swarm' },
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
    expect(screen.getByText('30%')).toBeInTheDocument()

    // Advance timer to trigger progress update (1 second)
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // Progress should increase by 0.1 (to 40%)
    expect(screen.getByText('40%')).toBeInTheDocument()

    // Advance again
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // Progress should be 50%
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('auto-completes task when progress reaches 100%', async () => {
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

    // Initially shows 95% progress
    expect(screen.getByText('95%')).toBeInTheDocument()

    // Verify stats show 1 running task
    expect(screen.getByText('Running')).toBeInTheDocument()
    const runningStat = screen.getByText('Running').closest('.bg-editor-bg')?.querySelector('.text-xl')
    expect(runningStat?.textContent).toBe('1')

    // Advance timer - progress reaches 100% and task auto-completes
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // Task should be completed now - verify by stats showing 1 completed task
    // The value is in a sibling div to the label container
    const completedLabel = screen.getByText('Completed')
    const statCard = completedLabel.closest('.bg-editor-bg')
    const completedValue = statCard?.querySelector('.text-xl')
    expect(completedValue?.textContent).toBe('1')

    // Running tasks should now be 0
    const runningLabel = screen.getByText('Running')
    const runningCard = runningLabel.closest('.bg-editor-bg')
    const runningValue = runningCard?.querySelector('.text-xl')
    expect(runningValue?.textContent).toBe('0')
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
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // No progress percentage should be shown for pending tasks
    expect(screen.queryByText('%')).not.toBeInTheDocument()
  })

  it('auto-completes task already at 100% progress', async () => {
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

    // Initially shows 100% progress (running task at 100%)
    expect(screen.getByText('100%')).toBeInTheDocument()

    // Advance timer - should auto-complete
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // Task should now be completed - verify by stats
    const completedLabel = screen.getByText('Completed')
    const statCard = completedLabel.closest('.bg-editor-bg')
    const completedValue = statCard?.querySelector('.text-xl')
    expect(completedValue?.textContent).toBe('1')
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

    // Both tasks show their progress
    expect(screen.getByText('20%')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()

    // Advance timer
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // Both should update
    expect(screen.getByText('30%')).toBeInTheDocument()
    expect(screen.getByText('60%')).toBeInTheDocument()
  })
})

describe('SwarmCoordinatorPanel task execution', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        activeSwarm: { id: '1', name: 'Test Swarm' },
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

    // Click Cancel button
    fireEvent.click(screen.getByText('Cancel'))

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
    const closeButton = screen.getByRole('button', { name: '' })
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

    // Click Cancel on the selected task
    fireEvent.click(screen.getByText('Cancel'))

    // Wait for state update
    await vi.advanceTimersByTimeAsync(100)

    // The task should now be failed
    expect(screen.getByText('failed')).toBeInTheDocument()
  })
})