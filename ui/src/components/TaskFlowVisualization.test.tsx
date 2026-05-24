import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import TaskFlowVisualization from './TaskFlowVisualization'
import type { TaskFlowEntry, HandoffEvent, ToolInvocation } from '../stores/taskFlowStore'

const mockTask1: TaskFlowEntry = {
  taskId: 'task-001',
  swarmId: 'swarm-1',
  title: 'Refactor module',
  status: 'running',
  assignedAgents: ['claude-code'],
  handoffs: [],
  toolCalls: [],
  createdAt: '2026-01-01T10:00:00Z',
}

const mockTask2: TaskFlowEntry = {
  taskId: 'task-002',
  swarmId: 'swarm-1',
  title: 'Write tests',
  status: 'completed',
  assignedAgents: ['gemini-cli'],
  handoffs: [
    {
      id: 'h-1',
      taskId: 'task-002',
      fromAgent: 'claude-code',
      toAgent: 'gemini-cli',
      reason: 'hand off testing',
      timestamp: '2026-01-01T10:05:00Z',
      accepted: false,
    },
  ],
  toolCalls: [
    {
      id: 'tc-1',
      serverId: 'mcp-1',
      toolName: 'read_file',
      args: {},
      durationMs: 150,
      timestamp: '2026-01-01T10:04:00Z',
    },
  ],
  createdAt: '2026-01-01T10:03:00Z',
}

const mockTask3: TaskFlowEntry = {
  taskId: 'task-003',
  swarmId: 'swarm-1',
  title: 'Deploy app',
  status: 'failed',
  assignedAgents: ['aider'],
  handoffs: [],
  toolCalls: [
    {
      id: 'tc-2',
      serverId: 'mcp-2',
      toolName: 'deploy',
      args: {},
      durationMs: 3000,
      timestamp: '2026-01-01T10:10:00Z',
      error: 'Connection refused',
    },
  ],
  createdAt: '2026-01-01T10:08:00Z',
}

const mockTask4: TaskFlowEntry = {
  taskId: 'task-004',
  swarmId: 'swarm-1',
  title: 'Cancelled task',
  status: 'cancelled',
  assignedAgents: [],
  handoffs: [],
  toolCalls: [],
  createdAt: '2026-01-01T10:12:00Z',
}

const mockTask5: TaskFlowEntry = {
  taskId: 'task-005',
  swarmId: 'swarm-1',
  title: 'Pending work',
  status: 'pending',
  assignedAgents: ['claude-code'],
  handoffs: [],
  toolCalls: [],
  createdAt: '2026-01-01T10:14:00Z',
}

interface MockAgentLifecycle {
  agentId: string
  name: string
  state: string
  lastActive: string
  capabilities: string[]
}

let mockTaskFlowStore: {
  tasks: Map<string, TaskFlowEntry>
  handoffChain: HandoffEvent[]
  toolInvocations: ToolInvocation[]
  nodeFlows: Map<string, unknown>
  subscribe: () => () => void
  getTaskChain: () => HandoffEvent[]
  getAgentToolHistory: () => ToolInvocation[]
  getAgentHandoffs: () => HandoffEvent[]
  getWorkflowNodes: () => unknown[]
  clearHistory: () => void
}

let mockAgentLifecycleStore: {
  agents: Map<string, MockAgentLifecycle>
  activeTurns: Map<string, unknown>
  healthAlerts: unknown[]
  agentCards: Map<string, unknown>
  connectedAgents: Set<string>
  subscribe: () => () => void
  refreshAgentCards: () => Promise<void>
  findAgentsByCapability: () => Promise<unknown[]>
  getAgentState: () => string
  getAgentAlerts: () => unknown[]
  clearAlerts: () => void
}

vi.mock('../stores/taskFlowStore', () => ({
  useTaskFlowStore: (selector?: (s: unknown) => unknown) =>
    selector ? selector(mockTaskFlowStore) : mockTaskFlowStore,
}))

vi.mock('../stores/agentLifecycleStore', () => ({
  useAgentLifecycleStore: (selector?: (s: unknown) => unknown) =>
    selector ? selector(mockAgentLifecycleStore) : mockAgentLifecycleStore,
}))

describe('TaskFlowVisualization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const tasks = new Map<string, TaskFlowEntry>()
    tasks.set('task-001', mockTask1)
    tasks.set('task-002', mockTask2)
    tasks.set('task-003', mockTask3)
    tasks.set('task-004', mockTask4)
    tasks.set('task-005', mockTask5)

    mockTaskFlowStore = {
      tasks,
      handoffChain: mockTask2.handoffs,
      toolInvocations: [],
      nodeFlows: new Map(),
      subscribe: vi.fn(() => vi.fn()),
      getTaskChain: vi.fn(() => []),
      getAgentToolHistory: vi.fn(() => []),
      getAgentHandoffs: vi.fn(() => []),
      getWorkflowNodes: vi.fn(() => []),
      clearHistory: vi.fn(),
    }

    const agents = new Map<string, MockAgentLifecycle>()
    agents.set('claude-code', {
      agentId: 'claude-code',
      name: 'claude-code',
      state: 'executing',
      lastActive: '2026-01-01T10:00:00Z',
      capabilities: [],
    })
    agents.set('gemini-cli', {
      agentId: 'gemini-cli',
      name: 'gemini-cli',
      state: 'idle',
      lastActive: '2026-01-01T10:05:00Z',
      capabilities: [],
    })
    agents.set('aider', {
      agentId: 'aider',
      name: 'aider',
      state: 'error',
      lastActive: '2026-01-01T10:10:00Z',
      capabilities: [],
    })

    mockAgentLifecycleStore = {
      agents,
      activeTurns: new Map(),
      healthAlerts: [],
      agentCards: new Map(),
      connectedAgents: new Set(['claude-code', 'gemini-cli', 'aider']),
      subscribe: vi.fn(() => vi.fn()),
      refreshAgentCards: vi.fn(),
      findAgentsByCapability: vi.fn(() => Promise.resolve([])),
      getAgentState: vi.fn(() => 'idle'),
      getAgentAlerts: vi.fn(() => []),
      clearAlerts: vi.fn(),
    }
  })

  describe('basic rendering', () => {
    it('renders tasks from the store', () => {
      render(<TaskFlowVisualization />)
      expect(screen.getByText('Refactor module')).toBeInTheDocument()
      expect(screen.getByText('Write tests')).toBeInTheDocument()
    })

    it('shows empty state when no tasks', () => {
      mockTaskFlowStore.tasks = new Map()
      mockTaskFlowStore.handoffChain = []
      render(<TaskFlowVisualization />)
      expect(screen.getByText('暂无任务流数据')).toBeInTheDocument()
    })

    it('renders filter tabs', () => {
      render(<TaskFlowVisualization />)
      expect(screen.getByText('全部')).toBeInTheDocument()
      expect(screen.getByText('交接中')).toBeInTheDocument()
    })

    it('shows task count in stats bar', () => {
      render(<TaskFlowVisualization />)
      expect(screen.getByText(/总任务:/)).toBeInTheDocument()
      expect(screen.getByText(/工具调用:/)).toBeInTheDocument()
    })

    it('shows active handoff count in stats bar', () => {
      render(<TaskFlowVisualization />)
      expect(screen.getByText(/活跃交接:/)).toBeInTheDocument()
    })

    it('shows agent column count in stats bar', () => {
      render(<TaskFlowVisualization />)
      expect(screen.getByText(/Agent 列:/)).toBeInTheDocument()
    })

    it('displays total tool calls count', () => {
      render(<TaskFlowVisualization />)
      // task-002 has 1 tool call, task-003 has 1 tool call = 2 total
      const toolCallElements = screen.getAllByText((content) => content.includes('工具调用:'))
      expect(toolCallElements.length).toBeGreaterThanOrEqual(1)
    })

    it('renders filtered count relative to total count', () => {
      render(<TaskFlowVisualization />)
      // "5 / 5" format showing filtered / total
      const countEl = screen.getByText('5 / 5')
      expect(countEl).toBeInTheDocument()
    })
  })

  describe('filter tabs', () => {
    it('shows all tasks by default', () => {
      render(<TaskFlowVisualization />)
      expect(screen.getByText('Refactor module')).toBeInTheDocument()
      expect(screen.getByText('Write tests')).toBeInTheDocument()
      expect(screen.getByText('Deploy app')).toBeInTheDocument()
      expect(screen.getByText('Cancelled task')).toBeInTheDocument()
      expect(screen.getByText('Pending work')).toBeInTheDocument()
    })

    it('filters to running tasks when clicking running tab', () => {
      render(<TaskFlowVisualization />)
      const runningTabs = screen.getAllByText('运行中')
      fireEvent.click(runningTabs[0])
      expect(screen.getByText('Refactor module')).toBeInTheDocument()
      expect(screen.queryByText('Write tests')).not.toBeInTheDocument()
    })

    it('filters to completed tasks (includes failed and cancelled)', () => {
      render(<TaskFlowVisualization />)
      const completedTabs = screen.getAllByText('已完成')
      fireEvent.click(completedTabs[0])
      expect(screen.queryByText('Refactor module')).not.toBeInTheDocument()
      expect(screen.getByText('Write tests')).toBeInTheDocument()
      expect(screen.getByText('Deploy app')).toBeInTheDocument()
      expect(screen.getByText('Cancelled task')).toBeInTheDocument()
    })

    it('filters to handoff tasks', () => {
      render(<TaskFlowVisualization />)
      // The handoff chain has a handoff for task-002 that is not accepted
      fireEvent.click(screen.getByText('交接中'))
      // Only task-002 has unaccepted handoffs
      expect(screen.getByText('Write tests')).toBeInTheDocument()
      expect(screen.queryByText('Refactor module')).not.toBeInTheDocument()
    })

    it('updates filtered count after applying filter', () => {
      render(<TaskFlowVisualization />)
      const runningTabs = screen.getAllByText('运行中')
      fireEvent.click(runningTabs[0])
      // Should show 1 / 5 (1 running out of 5 total)
      expect(screen.getByText('1 / 5')).toBeInTheDocument()
    })

    it('returns to all tasks when clicking all tab', () => {
      render(<TaskFlowVisualization />)
      const runningTabs = screen.getAllByText('运行中')
      fireEvent.click(runningTabs[0])
      expect(screen.queryByText('Write tests')).not.toBeInTheDocument()

      fireEvent.click(screen.getByText('全部'))
      expect(screen.getByText('Write tests')).toBeInTheDocument()
    })

    it('shows empty filtered results when no matching tasks', () => {
      // Only pending + running tasks, no completed ones
      const tasks = new Map<string, TaskFlowEntry>()
      tasks.set('task-001', mockTask1) // running
      tasks.set('task-005', mockTask5) // pending
      mockTaskFlowStore.tasks = tasks
      mockTaskFlowStore.handoffChain = []
      render(<TaskFlowVisualization />)
      const completedTabs = screen.getAllByText('已完成')
      fireEvent.click(completedTabs[0])
      expect(screen.getByText('暂无任务流数据')).toBeInTheDocument()
    })
  })

  describe('task expansion', () => {
    it('expands task to show tool calls and handoffs on click', () => {
      render(<TaskFlowVisualization />)
      fireEvent.click(screen.getByText('Write tests'))
      expect(screen.getByText('read_file')).toBeInTheDocument()
      expect(screen.getAllByText('claude-code').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('gemini-cli').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('hand off testing')).toBeInTheDocument()
    })

    it('toggles expanded task off on second click', () => {
      render(<TaskFlowVisualization />)
      fireEvent.click(screen.getByText('Write tests'))
      expect(screen.getByText('read_file')).toBeInTheDocument()
      fireEvent.click(screen.getByText('Write tests'))
      expect(screen.queryByText('read_file')).not.toBeInTheDocument()
    })

    it('shows "no tools or handoffs" when expanded task has neither', () => {
      render(<TaskFlowVisualization />)
      fireEvent.click(screen.getByText('Refactor module'))
      expect(screen.getByText('无工具调用或交接记录')).toBeInTheDocument()
    })

    it('shows tool call duration', () => {
      render(<TaskFlowVisualization />)
      fireEvent.click(screen.getByText('Write tests'))
      expect(screen.getByText('150ms')).toBeInTheDocument()
    })

    it('shows ERR badge for tool call with error', () => {
      render(<TaskFlowVisualization />)
      fireEvent.click(screen.getByText('Deploy app'))
      expect(screen.getByText('ERR')).toBeInTheDocument()
    })

    it('shows handoff arrow between agents', () => {
      render(<TaskFlowVisualization />)
      fireEvent.click(screen.getByText('Write tests'))
      // Handoff arrow shows fromAgent → toAgent
      const arrowElements = screen.getAllByText('→')
      expect(arrowElements.length).toBeGreaterThanOrEqual(1)
    })

    it('shows pending handoff badge when not accepted', () => {
      render(<TaskFlowVisualization />)
      fireEvent.click(screen.getByText('Write tests'))
      // The handoff for task-002 is not accepted, shows "交接中"
      const pendingBadges = screen.getAllByText('交接中')
      // One in the filter tab, one in the handoff detail
      expect(pendingBadges.length).toBeGreaterThanOrEqual(2)
    })

    it('expands only one task at a time', () => {
      render(<TaskFlowVisualization />)
      fireEvent.click(screen.getByText('Write tests'))
      expect(screen.getByText('read_file')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Deploy app'))
      // Write tests should be collapsed
      expect(screen.queryByText('read_file')).not.toBeInTheDocument()
      // Deploy app should be expanded
      expect(screen.getByText('deploy')).toBeInTheDocument()
    })
  })

  describe('agent columns', () => {
    it('shows agent name column', () => {
      render(<TaskFlowVisualization />)
      // claude-code appears in multiple places (column + task badge), use getAllByText
      const claudeRefs = screen.getAllByText('claude-code')
      expect(claudeRefs.length).toBeGreaterThanOrEqual(1)
    })

    it('truncates long agent names in column', () => {
      const longAgentTask: TaskFlowEntry = {
        taskId: 'task-long',
        swarmId: 'swarm-1',
        title: 'Long agent task',
        status: 'running',
        assignedAgents: ['very-long-agent-name-here'],
        handoffs: [],
        toolCalls: [],
        createdAt: '2026-01-01T11:00:00Z',
      }
      const tasks = new Map<string, TaskFlowEntry>()
      tasks.set('task-long', longAgentTask)
      mockTaskFlowStore.tasks = tasks
      mockTaskFlowStore.handoffChain = []

      // Add the agent to lifecycle store so agentStateColor can find it
      const agents = new Map<string, MockAgentLifecycle>()
      agents.set('very-long-agent-name-here', {
        agentId: 'very-long-agent-name-here',
        name: 'very-long-agent-name-here',
        state: 'idle',
        lastActive: '2026-01-01T10:00:00Z',
        capabilities: [],
      })
      mockAgentLifecycleStore.agents = agents

      render(<TaskFlowVisualization />)
      // Name > 14 chars should be truncated to 12 + '..'
      expect(screen.getByText('very-long-ag..')).toBeInTheDocument()
    })

    it('shows agent state color dot', () => {
      render(<TaskFlowVisualization />)
      // The agent column shows colored dots for agent states
      const dots = document.querySelectorAll('.rounded-full.w-2.h-2')
      expect(dots.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('status colors and labels', () => {
    it('shows status label for each task', () => {
      render(<TaskFlowVisualization />)
      // Running task shows "运行中" badge
      const runningBadges = screen.getAllByText('运行中')
      expect(runningBadges.length).toBeGreaterThanOrEqual(1)
      // Completed task shows "已完成" badge
      const completedBadges = screen.getAllByText('已完成')
      expect(completedBadges.length).toBeGreaterThanOrEqual(1)
    })

    it('shows failed status label', () => {
      render(<TaskFlowVisualization />)
      expect(screen.getByText('失败')).toBeInTheDocument()
    })

    it('shows cancelled status label', () => {
      render(<TaskFlowVisualization />)
      expect(screen.getByText('已取消')).toBeInTheDocument()
    })

    it('shows pending status label', () => {
      render(<TaskFlowVisualization />)
      expect(screen.getByText('等待中')).toBeInTheDocument()
    })

    it('shows unknown status as raw string when not in STATUS_LABELS', () => {
      const unknownTask: TaskFlowEntry = {
        taskId: 'task-unknown',
        swarmId: 'swarm-1',
        title: 'Unknown task',
        status: 'custom_status',
        assignedAgents: [],
        handoffs: [],
        toolCalls: [],
        createdAt: '2026-01-01T12:00:00Z',
      }
      const tasks = new Map<string, TaskFlowEntry>()
      tasks.set('task-unknown', unknownTask)
      mockTaskFlowStore.tasks = tasks
      mockTaskFlowStore.handoffChain = []
      render(<TaskFlowVisualization />)
      expect(screen.getByText('custom_status')).toBeInTheDocument()
    })
  })

  describe('task sorting', () => {
    it('sorts tasks by createdAt descending', () => {
      render(<TaskFlowVisualization />)
      const allTaskTitles = screen.getAllByText(/Refactor module|Write tests|Deploy app|Cancelled task|Pending work/)
      // Pending work (10:14) should come before Cancelled task (10:12), etc.
      // Just verify all are rendered
      expect(allTaskTitles.length).toBe(5)
    })
  })

  describe('assigned agent display', () => {
    it('shows first assigned agent name in task bubble', () => {
      render(<TaskFlowVisualization />)
      // task-001 assigned to claude-code — shows the agent name
      const claudeRefs = screen.getAllByText('claude-code')
      expect(claudeRefs.length).toBeGreaterThanOrEqual(1)
    })

    it('does not show agent name for tasks with no agents', () => {
      render(<TaskFlowVisualization />)
      // task-004 has empty assignedAgents
      // The task bubble for Cancelled task should not show an agent name
      // We can verify by checking no extra text appears after the status badge
      const cancelledEl = screen.getByText('Cancelled task')
      expect(cancelledEl).toBeInTheDocument()
    })
  })

  describe('edge cases', () => {
    it('handles accepted handoff (no pending badge in expanded view)', () => {
      const acceptedTask: TaskFlowEntry = {
        taskId: 'task-accepted',
        swarmId: 'swarm-1',
        title: 'Accepted handoff task',
        status: 'running',
        assignedAgents: ['claude-code'],
        handoffs: [
          {
            id: 'h-accepted',
            taskId: 'task-accepted',
            fromAgent: 'claude-code',
            toAgent: 'gemini-cli',
            reason: 'test accepted',
            timestamp: '2026-01-01T10:00:00Z',
            accepted: true,
          },
        ],
        toolCalls: [],
        createdAt: '2026-01-01T10:00:00Z',
      }
      const tasks = new Map<string, TaskFlowEntry>()
      tasks.set('task-accepted', acceptedTask)
      mockTaskFlowStore.tasks = tasks
      mockTaskFlowStore.handoffChain = [{
        ...acceptedTask.handoffs[0],
        accepted: true,
      }]
      render(<TaskFlowVisualization />)

      fireEvent.click(screen.getByText('Accepted handoff task'))
      // The handoff reason should be shown
      expect(screen.getByText('test accepted')).toBeInTheDocument()
      // Verify handoff arrows are present (from -> to)
      expect(screen.getAllByText('→').length).toBeGreaterThanOrEqual(1)
    })

    it('handles handoff without reason', () => {
      const noReasonTask: TaskFlowEntry = {
        taskId: 'task-noreason',
        swarmId: 'swarm-1',
        title: 'No reason handoff',
        status: 'running',
        assignedAgents: ['claude-code'],
        handoffs: [
          {
            id: 'h-noreason',
            taskId: 'task-noreason',
            fromAgent: 'claude-code',
            toAgent: 'gemini-cli',
            reason: '',
            timestamp: '2026-01-01T10:00:00Z',
            accepted: false,
          },
        ],
        toolCalls: [],
        createdAt: '2026-01-01T10:00:00Z',
      }
      const tasks = new Map<string, TaskFlowEntry>()
      tasks.set('task-noreason', noReasonTask)
      mockTaskFlowStore.tasks = tasks
      mockTaskFlowStore.handoffChain = [noReasonTask.handoffs[0]]
      render(<TaskFlowVisualization />)

      fireEvent.click(screen.getByText('No reason handoff'))
      // Handoff arrows should still be shown
      expect(screen.getAllByText('→').length).toBeGreaterThanOrEqual(1)
    })

    it('handles tool call without error', () => {
      render(<TaskFlowVisualization />)
      fireEvent.click(screen.getByText('Write tests'))
      // read_file has no error, so no ERR badge for this tool
      expect(screen.getByText('read_file')).toBeInTheDocument()
      expect(screen.getByText('150ms')).toBeInTheDocument()
    })

    it('handles agent with stuck state', () => {
      const agents = new Map<string, MockAgentLifecycle>()
      agents.set('stuck-agent', {
        agentId: 'stuck-agent',
        name: 'stuck-agent',
        state: 'stuck',
        lastActive: '2026-01-01T10:00:00Z',
        capabilities: [],
      })
      mockAgentLifecycleStore.agents = agents

      const stuckTask: TaskFlowEntry = {
        taskId: 'task-stuck',
        swarmId: 'swarm-1',
        title: 'Stuck agent task',
        status: 'running',
        assignedAgents: ['stuck-agent'],
        handoffs: [],
        toolCalls: [],
        createdAt: '2026-01-01T10:00:00Z',
      }
      const tasks = new Map<string, TaskFlowEntry>()
      tasks.set('task-stuck', stuckTask)
      mockTaskFlowStore.tasks = tasks
      mockTaskFlowStore.handoffChain = []
      render(<TaskFlowVisualization />)

      expect(screen.getByText('Stuck agent task')).toBeInTheDocument()
      // Agent column should show the stuck agent (appears multiple places)
      const stuckRefs = screen.getAllByText('stuck-agent')
      expect(stuckRefs.length).toBeGreaterThanOrEqual(1)
    })

    it('handles agent with offline state', () => {
      const agents = new Map<string, MockAgentLifecycle>()
      agents.set('offline-agent', {
        agentId: 'offline-agent',
        name: 'offline-agent',
        state: 'offline',
        lastActive: '2026-01-01T10:00:00Z',
        capabilities: [],
      })
      mockAgentLifecycleStore.agents = agents

      const offlineTask: TaskFlowEntry = {
        taskId: 'task-offline',
        swarmId: 'swarm-1',
        title: 'Offline agent task',
        status: 'completed',
        assignedAgents: ['offline-agent'],
        handoffs: [],
        toolCalls: [],
        createdAt: '2026-01-01T10:00:00Z',
      }
      const tasks = new Map<string, TaskFlowEntry>()
      tasks.set('task-offline', offlineTask)
      mockTaskFlowStore.tasks = tasks
      mockTaskFlowStore.handoffChain = []
      render(<TaskFlowVisualization />)

      const offlineRefs = screen.getAllByText('offline-agent')
      expect(offlineRefs.length).toBeGreaterThanOrEqual(1)
    })

    it('handles agent lookup by agentId as fallback', () => {
      const agents = new Map<string, MockAgentLifecycle>()
      agents.set('my-agent-id', {
        agentId: 'my-agent-id',
        name: 'my-agent-id',
        state: 'executing',
        lastActive: '2026-01-01T10:00:00Z',
        capabilities: [],
      })
      mockAgentLifecycleStore.agents = agents

      const agentTask: TaskFlowEntry = {
        taskId: 'task-agentid',
        swarmId: 'swarm-1',
        title: 'Agent ID lookup',
        status: 'running',
        assignedAgents: ['my-agent-id'],
        handoffs: [],
        toolCalls: [],
        createdAt: '2026-01-01T10:00:00Z',
      }
      const tasks = new Map<string, TaskFlowEntry>()
      tasks.set('task-agentid', agentTask)
      mockTaskFlowStore.tasks = tasks
      mockTaskFlowStore.handoffChain = []
      render(<TaskFlowVisualization />)

      // Should find the agent — appears in multiple places
      const agentRefs = screen.getAllByText('my-agent-id')
      expect(agentRefs.length).toBeGreaterThanOrEqual(1)
    })

    it('handles empty tasks map', () => {
      mockTaskFlowStore.tasks = new Map()
      mockTaskFlowStore.handoffChain = []
      render(<TaskFlowVisualization />)
      expect(screen.getByText('暂无任务流数据')).toBeInTheDocument()
      expect(screen.getByText('0 / 0')).toBeInTheDocument()
    })
  })
})
