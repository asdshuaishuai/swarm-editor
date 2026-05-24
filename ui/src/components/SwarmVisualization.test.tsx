import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import SwarmVisualization from './SwarmVisualization'
import type { CoordinationTask, TaskStatus } from '../types'

interface MockAgent {
  id: string
  name: string
  status: string
  currentTask?: string
}

interface MockSwarm {
  coordinatorId: string
  name?: string
}

const mockStore: {
  agents: MockAgent[]
  activeSwarm: MockSwarm | null
} = {
  agents: [
    { id: 'coordinator-1', name: 'Queen', status: 'idle' },
    { id: 'worker-1', name: 'Worker A', status: 'executing' },
    { id: 'worker-2', name: 'Worker B', status: 'thinking' },
  ],
  activeSwarm: { coordinatorId: 'coordinator-1' },
}

vi.mock('../store/appStore', () => ({
  useAppStore: (selector: (state: typeof mockStore) => unknown) => selector(mockStore),
}))

vi.mock('lucide-react', () => ({
  Network: () => <svg data-testid="icon-network" />,
  Zap: () => <svg data-testid="icon-zap" />,
  Target: () => <svg data-testid="icon-target" />,
  CheckCircle: () => <svg data-testid="icon-checkcircle" />,
  XCircle: () => <svg data-testid="icon-xcircle" />,
  Clock: () => <svg data-testid="icon-clock" />,
  Loader2: () => <svg data-testid="icon-loader2" />,
  ArrowRight: () => <svg data-testid="icon-arrowright" />,
  GitBranch: () => <svg data-testid="icon-gitbranch" />,
  Layers: () => <svg data-testid="icon-layers" />,
}))

function makeTask(overrides: Partial<CoordinationTask> = {}): CoordinationTask {
  return {
    id: 'task-1',
    parentId: undefined,
    title: 'Test Task',
    description: 'A test task',
    prompt: 'Do something',
    priority: 'high',
    subtasks: [],
    isSubtask: false,
    assignedTo: ['worker-1'],
    requiredRole: undefined,
    status: 'running' as TaskStatus,
    progress: 0.5,
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: undefined,
    results: {},
    consensus: undefined,
    metadata: undefined,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('SwarmVisualization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockStore.agents = [
      { id: 'coordinator-1', name: 'Queen', status: 'idle' },
      { id: 'worker-1', name: 'Worker A', status: 'executing' },
      { id: 'worker-2', name: 'Worker B', status: 'thinking' },
    ]
    mockStore.activeSwarm = { coordinatorId: 'coordinator-1' }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('basic rendering', () => {
    it('renders with default topology', () => {
      const { container } = render(<SwarmVisualization />)
      expect(container.querySelector('svg')).toBeInTheDocument()
    })

    it('renders agent nodes', () => {
      render(<SwarmVisualization />)
      expect(screen.getByText('Queen')).toBeInTheDocument()
      expect(screen.getByText('Worker A')).toBeInTheDocument()
      expect(screen.getByText('Worker B')).toBeInTheDocument()
    })

    it('renders view mode toggle buttons', () => {
      render(<SwarmVisualization />)
      expect(screen.getByRole('tab', { name: /Topology/ })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Tasks/ })).toBeInTheDocument()
    })

    it('renders topology label in uppercase', () => {
      render(<SwarmVisualization />)
      expect(screen.getByText(/STAR.*3 agents/)).toBeInTheDocument()
    })

    it('renders swarm topology header', () => {
      render(<SwarmVisualization />)
      expect(screen.getByText('Swarm Topology')).toBeInTheDocument()
    })

    it('renders with active swarm name', () => {
      mockStore.activeSwarm = { coordinatorId: 'coordinator-1', name: 'My Swarm' }
      render(<SwarmVisualization />)
      expect(screen.getByText('My Swarm')).toBeInTheDocument()
    })

    it('renders empty topology when no agents', () => {
      mockStore.agents = []
      mockStore.activeSwarm = null
      const { container } = render(<SwarmVisualization />)
      expect(container.querySelector('svg')).toBeInTheDocument()
      expect(screen.getByText(/0 agents/)).toBeInTheDocument()
    })

    it('renders stats footer', () => {
      render(<SwarmVisualization />)
      expect(screen.getByText(/1 executing/)).toBeInTheDocument()
      expect(screen.getByText(/1 thinking/)).toBeInTheDocument()
      expect(screen.getByText(/1 idle/)).toBeInTheDocument()
    })

    it('renders topology type in footer', () => {
      render(<SwarmVisualization />)
      expect(screen.getByText('Topology: star')).toBeInTheDocument()
    })
  })

  describe('topology variants', () => {
    it('renders with mesh topology', () => {
      render(<SwarmVisualization topology="mesh" />)
      expect(screen.getByText(/MESH/)).toBeInTheDocument()
    })

    it('renders with ring topology', () => {
      render(<SwarmVisualization topology="ring" />)
      expect(screen.getByText(/RING/)).toBeInTheDocument()
    })

    it('renders with tree topology', () => {
      render(<SwarmVisualization topology="tree" />)
      expect(screen.getByText(/TREE/)).toBeInTheDocument()
    })

    it('renders with hybrid topology', () => {
      render(<SwarmVisualization topology="hybrid" />)
      expect(screen.getByText(/HYBRID/)).toBeInTheDocument()
    })

    it('shows QUEEN BEE label for star topology', () => {
      render(<SwarmVisualization topology="star" />)
      expect(screen.getByText('QUEEN BEE')).toBeInTheDocument()
    })

    it('does not show QUEEN BEE label for non-star topology', () => {
      render(<SwarmVisualization topology="mesh" />)
      expect(screen.queryByText('QUEEN BEE')).not.toBeInTheDocument()
    })

    it('generates star edges (command + report) for each non-coordinator', () => {
      const { container } = render(<SwarmVisualization topology="star" />)
      // 2 workers => 2 command edges + 2 report edges = 4 lines
      const lines = container.querySelectorAll('line')
      expect(lines.length).toBe(4)
    })

    it('generates mesh edges connecting all nodes bidirectionally', () => {
      const { container } = render(<SwarmVisualization topology="mesh" />)
      // 3 nodes => 3 pairs * 2 = 6 edges
      const lines = container.querySelectorAll('line')
      expect(lines.length).toBe(6)
    })

    it('generates ring edges connecting nodes in a circle', () => {
      const { container } = render(<SwarmVisualization topology="ring" />)
      // 3 nodes => 3 edges
      const lines = container.querySelectorAll('line')
      expect(lines.length).toBe(3)
    })

    it('generates tree edges (command + report) like star', () => {
      const { container } = render(<SwarmVisualization topology="tree" />)
      // 2 workers => 2 command + 2 report = 4
      const lines = container.querySelectorAll('line')
      expect(lines.length).toBe(4)
    })

    it('handles hybrid topology with no edges', () => {
      const { container } = render(<SwarmVisualization topology="hybrid" />)
      const lines = container.querySelectorAll('line')
      expect(lines.length).toBe(0)
    })
  })

  describe('node interactions', () => {
    it('selects a node on click', () => {
      render(<SwarmVisualization />)
      // Use getAllByText since "Queen" appears in SVG text node AND potentially in info panel
      const queenElements = screen.getAllByText('Queen')
      // First one should be in the SVG graph
      const svgText = queenElements.find(el => el.tagName === 'text')
      expect(svgText).toBeTruthy()
      const queenGroup = svgText!.closest('g')
      fireEvent.click(queenGroup!)

      // Selected node info panel should appear with coordinator · idle text
      // After clicking, there will be a new "Queen" in the info panel
      expect(screen.getByText(/coordinator · idle/)).toBeInTheDocument()
    })

    it('deselects node on second click', () => {
      render(<SwarmVisualization />)
      const queenElements = screen.getAllByText('Queen')
      const svgText = queenElements.find(el => el.tagName === 'text')!
      const queenGroup = svgText.closest('g')!
      fireEvent.click(queenGroup)
      expect(screen.getByText(/coordinator · idle/)).toBeInTheDocument()

      fireEvent.click(queenGroup)
      expect(screen.queryByText(/coordinator · idle/)).not.toBeInTheDocument()
    })

    it('selects node on Enter key', () => {
      render(<SwarmVisualization />)
      const queenElements = screen.getAllByText('Queen')
      const svgText = queenElements.find(el => el.tagName === 'text')!
      const queenGroup = svgText.closest('g')!
      fireEvent.keyDown(queenGroup, { key: 'Enter' })
      expect(screen.getByText(/coordinator · idle/)).toBeInTheDocument()
    })

    it('selects node on Space key', () => {
      render(<SwarmVisualization />)
      const queenElements = screen.getAllByText('Queen')
      const svgText = queenElements.find(el => el.tagName === 'text')!
      const queenGroup = svgText.closest('g')!
      fireEvent.keyDown(queenGroup, { key: ' ' })
      expect(screen.getByText(/coordinator · idle/)).toBeInTheDocument()
    })

    it('shows current task in node info when available', () => {
      mockStore.agents = [
        { id: 'worker-1', name: 'Worker A', status: 'executing', currentTask: 'Task 42' },
      ]
      mockStore.activeSwarm = null
      render(<SwarmVisualization />)
      const workerElements = screen.getAllByText('Worker A')
      const svgText = workerElements.find(el => el.tagName === 'text')
      expect(svgText).toBeTruthy()
      const workerGroup = svgText!.closest('g')!
      fireEvent.click(workerGroup)
      expect(screen.getByText(/Task: Task 42/)).toBeInTheDocument()
    })

    it('shows coordinator type icon for coordinator node', () => {
      render(<SwarmVisualization />)
      const queenElements = screen.getAllByText('Queen')
      const svgText = queenElements.find(el => el.tagName === 'text')!
      const queenGroup = svgText.closest('g')!
      fireEvent.click(queenGroup)
      expect(screen.getByTestId('icon-target')).toBeInTheDocument()
    })

    it('shows worker type icon for worker node', () => {
      render(<SwarmVisualization />)
      const workerElements = screen.getAllByText('Worker A')
      const svgText = workerElements.find(el => el.tagName === 'text')!
      const workerGroup = svgText.closest('g')!
      fireEvent.click(workerGroup)
      expect(screen.getByTestId('icon-zap')).toBeInTheDocument()
    })

    it('shows node name truncated to 8 characters', () => {
      mockStore.agents = [
        { id: 'w1', name: 'VeryLongWorkerName', status: 'idle' },
      ]
      mockStore.activeSwarm = null
      render(<SwarmVisualization />)
      expect(screen.getByText('VeryLong')).toBeInTheDocument()
    })
  })

  describe('view mode switching', () => {
    it('switches to tasks view on tab click', () => {
      render(<SwarmVisualization />)
      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
      expect(screen.getByRole('tab', { name: /Tasks/ }).getAttribute('aria-selected')).toBe('true')
    })

    it('shows no tasks message in tasks view when no tasks', () => {
      render(<SwarmVisualization />)
      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
      expect(screen.getByText('No tasks to visualize')).toBeInTheDocument()
    })

    it('shows no tasks sub-message', () => {
      render(<SwarmVisualization />)
      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
      expect(screen.getByText('Submit a task to see the flow')).toBeInTheDocument()
    })

    it('renders task cards when tasks are provided', () => {
      const tasks = [makeTask({ title: 'My Task', status: 'running' })]
      render(<SwarmVisualization tasks={tasks} />)
      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
      expect(screen.getByText('My Task')).toBeInTheDocument()
    })

    it('switches back to topology view', () => {
      render(<SwarmVisualization />)
      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
      expect(screen.getByRole('tab', { name: /Tasks/ }).getAttribute('aria-selected')).toBe('true')

      fireEvent.click(screen.getByRole('tab', { name: /Topology/ }))
      expect(screen.getByRole('tab', { name: /Topology/ }).getAttribute('aria-selected')).toBe('true')
    })
  })

  describe('TaskFlowCard in tasks view', () => {
    it('shows completed task with check icon', () => {
      const tasks = [makeTask({ title: 'Done Task', status: 'completed' })]
      render(<SwarmVisualization tasks={tasks} />)
      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
      expect(screen.getByText('Done Task')).toBeInTheDocument()
      expect(screen.getByTestId('icon-checkcircle')).toBeInTheDocument()
    })

    it('shows failed task with error icon', () => {
      const tasks = [makeTask({ title: 'Failed Task', status: 'failed' })]
      render(<SwarmVisualization tasks={tasks} />)
      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
      expect(screen.getByText('Failed Task')).toBeInTheDocument()
      expect(screen.getByTestId('icon-xcircle')).toBeInTheDocument()
    })

    it('shows running task with loader icon', () => {
      const tasks = [makeTask({ title: 'Running Task', status: 'running' })]
      render(<SwarmVisualization tasks={tasks} />)
      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
      expect(screen.getByText('Running Task')).toBeInTheDocument()
      expect(screen.getByTestId('icon-loader2')).toBeInTheDocument()
    })

    it('shows pending task with clock icon', () => {
      const tasks = [makeTask({ title: 'Pending Task', status: 'pending' })]
      render(<SwarmVisualization tasks={tasks} />)
      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
      expect(screen.getByText('Pending Task')).toBeInTheDocument()
      expect(screen.getByTestId('icon-clock')).toBeInTheDocument()
    })

    it('shows task progress', () => {
      const tasks = [makeTask({ title: 'Task', status: 'running', progress: 0.75 })]
      render(<SwarmVisualization tasks={tasks} />)
      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
      expect(screen.getByText('1 agents · 75%')).toBeInTheDocument()
    })

    it('shows progress bar', () => {
      const tasks = [makeTask({ title: 'Task', status: 'running', progress: 0.5 })]
      render(<SwarmVisualization tasks={tasks} />)
      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
      const progressBar = screen.getByRole('progressbar')
      expect(progressBar).toHaveAttribute('aria-valuenow', '50')
    })

    it('expands task card on click to show agents', () => {
      const tasks = [makeTask({ title: 'Expandable Task', assignedTo: ['worker-1'] })]
      render(<SwarmVisualization tasks={tasks} />)
      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
      fireEvent.click(screen.getByText('Expandable Task'))
      expect(screen.getByText('Assigned Agents')).toBeInTheDocument()
    })

    it('shows agent name in expanded task card', () => {
      const tasks = [makeTask({ title: 'Task', assignedTo: ['worker-1'] })]
      render(<SwarmVisualization tasks={tasks} />)
      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
      fireEvent.click(screen.getByText('Task'))
      // The agent id should appear as a tag
      expect(screen.getByText('Worker A')).toBeInTheDocument()
    })

    it('shows agent ID when agent not found', () => {
      const tasks = [makeTask({ title: 'Task', assignedTo: ['unknown-agent'] })]
      render(<SwarmVisualization tasks={tasks} />)
      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
      fireEvent.click(screen.getByText('Task'))
      expect(screen.getByText('unknown-agent')).toBeInTheDocument()
    })

    it('shows results section when results exist', () => {
      const tasks = [makeTask({
        title: 'Task',
        assignedTo: ['worker-1'],
        results: {
          'worker-1': {
            agentId: 'worker-1',
            content: 'Task completed successfully',
            error: undefined as string | undefined,
            startedAt: '2026-01-01T00:00:00Z',
            completedAt: '2026-01-01T01:00:00Z',
            duration: 3600000,
          },
        },
      })]
      render(<SwarmVisualization tasks={tasks} />)
      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
      fireEvent.click(screen.getByText('Task'))
      expect(screen.getByText('Results')).toBeInTheDocument()
      expect(screen.getByText(/Task completed succe/)).toBeInTheDocument()
    })

    it('shows error result with error icon', () => {
      const tasks = [makeTask({
        title: 'Task',
        assignedTo: ['worker-1'],
        results: {
          'worker-1': {
            agentId: 'worker-1',
            content: '',
            error: 'Something went wrong',
            startedAt: '2026-01-01T00:00:00Z',
            completedAt: '2026-01-01T01:00:00Z',
            duration: 3600000,
          },
        },
      })]
      render(<SwarmVisualization tasks={tasks} />)
      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
      fireEvent.click(screen.getByText('Task'))
      // Error result should show the error icon
      const errorIcons = screen.getAllByTestId('icon-xcircle')
      expect(errorIcons.length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })

    it('toggles expanded state on click', () => {
      const tasks = [makeTask({ title: 'Task', assignedTo: ['worker-1'] })]
      render(<SwarmVisualization tasks={tasks} />)
      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
      fireEvent.click(screen.getByText('Task'))
      expect(screen.getByText('Assigned Agents')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Task'))
      expect(screen.queryByText('Assigned Agents')).not.toBeInTheDocument()
    })

    it('expands task on Enter key', () => {
      const tasks = [makeTask({ title: 'Task', assignedTo: ['worker-1'] })]
      render(<SwarmVisualization tasks={tasks} />)
      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
      const taskHeader = screen.getByText('Task').closest('[role="button"]')!
      fireEvent.keyDown(taskHeader, { key: 'Enter' })
      expect(screen.getByText('Assigned Agents')).toBeInTheDocument()
    })

    it('expands task on Space key', () => {
      const tasks = [makeTask({ title: 'Task', assignedTo: ['worker-1'] })]
      render(<SwarmVisualization tasks={tasks} />)
      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
      const taskHeader = screen.getByText('Task').closest('[role="button"]')!
      fireEvent.keyDown(taskHeader, { key: ' ' })
      expect(screen.getByText('Assigned Agents')).toBeInTheDocument()
    })

    it('shows completed result content truncated to 50 chars', () => {
      const longContent = 'A'.repeat(100)
      const tasks = [makeTask({
        title: 'Task',
        assignedTo: ['worker-1'],
        results: {
          'worker-1': {
            agentId: 'worker-1',
            content: longContent,
            error: undefined as string | undefined,
            startedAt: '2026-01-01T00:00:00Z',
            completedAt: '2026-01-01T01:00:00Z',
            duration: 3600000,
          },
        },
      })]
      render(<SwarmVisualization tasks={tasks} />)
      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
      fireEvent.click(screen.getByText('Task'))
      // Content should be sliced to first 50 chars
      const truncatedEl = screen.getByText('A'.repeat(50))
      expect(truncatedEl).toBeInTheDocument()
    })

    it('shows "completed" when no content and no error', () => {
      const tasks = [makeTask({
        title: 'Task',
        assignedTo: ['worker-1'],
        results: {
          'worker-1': {
            agentId: 'worker-1',
            content: '',
            error: undefined as string | undefined,
            startedAt: '2026-01-01T00:00:00Z',
            completedAt: '2026-01-01T01:00:00Z',
            duration: 3600000,
          },
        },
      })]
      render(<SwarmVisualization tasks={tasks} />)
      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
      fireEvent.click(screen.getByText('Task'))
      expect(screen.getByText('completed')).toBeInTheDocument()
    })
  })

  describe('animation', () => {
    it('starts edge animation interval and clears on unmount', () => {
      const { unmount } = render(<SwarmVisualization topology="star" />)

      // Advance timer to trigger animation interval
      act(() => {
        vi.advanceTimersByTime(2000)
      })

      // Unmount should not throw
      expect(() => unmount()).not.toThrow()
    })

    it('animates a random command edge', () => {
      const { container } = render(<SwarmVisualization topology="star" />)

      act(() => {
        vi.advanceTimersByTime(2000)
      })

      // After animation, an animating edge should have been set
      // The circle with animateMotion may or may not be present depending on timing
      // Just verify no crash
      expect(container.querySelector('svg')).toBeInTheDocument()
    })

    it('clears animation timeout after 500ms', () => {
      render(<SwarmVisualization topology="star" />)

      act(() => {
        vi.advanceTimersByTime(2000) // trigger interval
      })

      act(() => {
        vi.advanceTimersByTime(500) // trigger animation timeout
      })

      // animatingEdge should be cleared now — no crash
      expect(screen.getByText(/STAR/)).toBeInTheDocument()
    })
  })

  describe('null/edge case agents', () => {
    it('handles agents being null gracefully', () => {
      // The component uses safeAgents = agents || []
      // We test by having agents = null in the store
      mockStore.agents = null as unknown as MockAgent[]
      mockStore.activeSwarm = null
      const { container } = render(<SwarmVisualization />)
      expect(container.querySelector('svg')).toBeInTheDocument()
      expect(screen.getByText(/0 agents/)).toBeInTheDocument()
    })

    it('renders with single agent', () => {
      mockStore.agents = [{ id: 'solo', name: 'Solo', status: 'idle' }]
      mockStore.activeSwarm = { coordinatorId: 'solo' }
      render(<SwarmVisualization />)
      expect(screen.getByText('Solo')).toBeInTheDocument()
      expect(screen.getByText(/1 agents/)).toBeInTheDocument()
    })

    it('renders agent with error status', () => {
      mockStore.agents = [
        { id: 'err-1', name: 'ErrAgent', status: 'error' },
      ]
      mockStore.activeSwarm = null
      render(<SwarmVisualization />)
      // Name is truncated to 8 chars in the SVG text
      expect(screen.getByText('ErrAgent')).toBeInTheDocument()
    })
  })

  describe('multiple tasks in tasks view', () => {
    it('renders multiple task cards', () => {
      const tasks = [
        makeTask({ id: 't1', title: 'Task 1', status: 'running' }),
        makeTask({ id: 't2', title: 'Task 2', status: 'completed' }),
      ]
      render(<SwarmVisualization tasks={tasks} />)
      fireEvent.click(screen.getByRole('tab', { name: /Tasks/ }))
      expect(screen.getByText('Task 1')).toBeInTheDocument()
      expect(screen.getByText('Task 2')).toBeInTheDocument()
    })
  })
})
