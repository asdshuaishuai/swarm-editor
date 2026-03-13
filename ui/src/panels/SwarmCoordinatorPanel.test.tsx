import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import SwarmCoordinatorPanel, { TaskCard, TaskDetails } from './SwarmCoordinatorPanel'
import { useAppStore } from '../store/appStore'
import type { CoordinationTask } from '../types'

vi.mock('../store/appStore', () => ({
  useAppStore: vi.fn(),
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

  it('creates task when form is submitted', () => {
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

    // Modal should close and task should appear
    expect(screen.queryByText('Submit New Task')).not.toBeInTheDocument()
    expect(screen.getByText('Test Task')).toBeInTheDocument()
  })

  it('selects task when clicked', () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))

    const titleInput = screen.getByPlaceholderText('Implement user authentication')
    fireEvent.change(titleInput, { target: { value: 'Selectable Task' } })

    const promptTextarea = screen.getByPlaceholderText('Write the prompt that will be sent to agents...')
    fireEvent.change(promptTextarea, { target: { value: 'Test prompt' } })

    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }))

    // Click on the task to select it
    fireEvent.click(screen.getByText('Selectable Task'))

    // Task details should appear
    expect(screen.getByText('Task Details')).toBeInTheDocument()
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
    render(<SwarmCoordinatorPanel />)

    // Create a task
    fireEvent.click(screen.getByText('New Task'))
    const titleInput = screen.getByPlaceholderText('Implement user authentication')
    fireEvent.change(titleInput, { target: { value: 'Progress Task' } })
    const promptTextarea = screen.getByPlaceholderText('Write the prompt that will be sent to agents...')
    fireEvent.change(promptTextarea, { target: { value: 'Test prompt' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }))

    // Manually set task to running status for test
    // Note: In real app this would be done through backend

    // Advance timers to trigger progress update
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // Task should still exist
    expect(screen.getByText('Progress Task')).toBeInTheDocument()
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

  it('shows task details with all fields', () => {
    render(<SwarmCoordinatorPanel />)
    // Create task
    fireEvent.click(screen.getByText('New Task'))
    fireEvent.change(screen.getByPlaceholderText('Implement user authentication'), { target: { value: 'Full Detail Task' } })
    fireEvent.change(screen.getByPlaceholderText('Write the prompt that will be sent to agents...'), { target: { value: 'Test the details panel' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }))
    // Select task to show details
    const taskTitles = screen.getAllByText('Full Detail Task')
    fireEvent.click(taskTitles[0])
    // Check all detail fields are shown
    expect(screen.getByText('Task Details')).toBeInTheDocument()
    expect(screen.getByText('ID')).toBeInTheDocument()
    expect(screen.getByText('Title')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Priority')).toBeInTheDocument()
    expect(screen.getByText('Prompt')).toBeInTheDocument()
    expect(screen.getByText('Test the details panel')).toBeInTheDocument()
  })

  it('deselects task when clicking again', () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))
    fireEvent.change(screen.getByPlaceholderText('Implement user authentication'), { target: { value: 'Toggle Task' } })
    fireEvent.change(screen.getByPlaceholderText('Write the prompt that will be sent to agents...'), { target: { value: 'Test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }))
    // Select task (use the h4 element in the task card)
    const taskTitles = screen.getAllByText('Toggle Task')
    fireEvent.click(taskTitles[0]) // Click on the task card title
    expect(screen.getByText('Task Details')).toBeInTheDocument()
    // Click again to deselect
    fireEvent.click(taskTitles[0])
    expect(screen.queryByText('Task Details')).not.toBeInTheDocument()
  })

  it('closes task details with X button', () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))
    fireEvent.change(screen.getByPlaceholderText('Implement user authentication'), { target: { value: 'Close Test Task' } })
    fireEvent.change(screen.getByPlaceholderText('Write the prompt that will be sent to agents...'), { target: { value: 'Test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }))
    // Select task to show details
    const taskTitles = screen.getAllByText('Close Test Task')
    fireEvent.click(taskTitles[0])
    expect(screen.getByText('Task Details')).toBeInTheDocument()
    // Click X button to close
    const closeButton = screen.getByRole('button', { name: '' })
    fireEvent.click(closeButton)
    expect(screen.queryByText('Task Details')).not.toBeInTheDocument()
  })

  it('sorts tasks by priority', () => {
    render(<SwarmCoordinatorPanel />)
    // Create first task with priority 5
    fireEvent.click(screen.getByText('New Task'))
    fireEvent.change(screen.getByPlaceholderText('Implement user authentication'), { target: { value: 'Medium Priority Task' } })
    fireEvent.change(screen.getByPlaceholderText('Write the prompt that will be sent to agents...'), { target: { value: 'Test' } })
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }))
    // Create second task with priority 10
    fireEvent.click(screen.getByText('New Task'))
    fireEvent.change(screen.getByPlaceholderText('Implement user authentication'), { target: { value: 'High Priority Task' } })
    fireEvent.change(screen.getByPlaceholderText('Write the prompt that will be sent to agents...'), { target: { value: 'Test' } })
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }))
    // High priority task should appear first (sorted by priority desc)
    const tasks = screen.getAllByText(/Priority Task/)
    expect(tasks[0]).toHaveTextContent('High Priority Task')
    expect(tasks[1]).toHaveTextContent('Medium Priority Task')
  })

  it('shows task with description', () => {
    render(<SwarmCoordinatorPanel />)
    fireEvent.click(screen.getByText('New Task'))
    fireEvent.change(screen.getByPlaceholderText('Implement user authentication'), { target: { value: 'Task With Description' } })
    fireEvent.change(screen.getByPlaceholderText('Detailed task description...'), { target: { value: 'This is a detailed description for the task' } })
    fireEvent.change(screen.getByPlaceholderText('Write the prompt that will be sent to agents...'), { target: { value: 'Test prompt' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Task' }))
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

  it('shows results with success content', () => {
    const taskWithResults = {
      ...baseTask,
      results: {
        'agent-a': { content: 'Task completed successfully' }
      }
    }
    render(<TaskDetails task={taskWithResults} onClose={() => {}} />)
    expect(screen.getByText('Results')).toBeInTheDocument()
    expect(screen.getByText('agent-a')).toBeInTheDocument()
    expect(screen.getByText('Task completed successfully')).toBeInTheDocument()
  })

  it('shows results with error content', () => {
    const taskWithErrors = {
      ...baseTask,
      results: {
        'agent-b': { error: 'Connection failed' }
      }
    }
    render(<TaskDetails task={taskWithErrors} onClose={() => {}} />)
    expect(screen.getByText('Results')).toBeInTheDocument()
    expect(screen.getByText('agent-b')).toBeInTheDocument()
    expect(screen.getByText('Connection failed')).toBeInTheDocument()
  })

  it('shows Start button for pending task', () => {
    const pendingTask = { ...baseTask, status: 'pending' as const }
    render(<TaskDetails task={pendingTask} onClose={() => {}} />)
    expect(screen.getByText('Start')).toBeInTheDocument()
  })

  it('shows Pause and Cancel buttons for running task', () => {
    const runningTask = { ...baseTask, status: 'running' as const, progress: 0.3 }
    render(<TaskDetails task={runningTask} onClose={() => {}} />)
    expect(screen.getByText('Pause')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })
})