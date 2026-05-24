import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import TaskFlowVisualization from './TaskFlowVisualization'
import type { TaskFlowEntry } from '../stores/taskFlowStore'

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

let mockTaskFlowStore: {
  tasks: Map<string, TaskFlowEntry>
  handoffChain: any[]
  toolInvocations: any[]
  nodeFlows: Map<any, any>
  subscribe: () => () => void
  getTaskChain: () => any[]
  getAgentToolHistory: () => any[]
  getAgentHandoffs: () => any[]
  getWorkflowNodes: () => any[]
  clearHistory: () => void
}

let mockAgentLifecycleStore: {
  agents: Map<string, any>
  activeTurns: Map<string, any>
  healthAlerts: any[]
  agentCards: Map<string, any>
  connectedAgents: Set<string>
  subscribe: () => () => void
  refreshAgentCards: () => Promise<void>
  findAgentsByCapability: () => Promise<any[]>
  getAgentState: () => string
  getAgentAlerts: () => any[]
  clearAlerts: () => void
}

vi.mock('../stores/taskFlowStore', () => ({
  useTaskFlowStore: (selector?: (s: any) => any) =>
    selector ? selector(mockTaskFlowStore) : mockTaskFlowStore,
}))

vi.mock('../stores/agentLifecycleStore', () => ({
  useAgentLifecycleStore: (selector?: (s: any) => any) =>
    selector ? selector(mockAgentLifecycleStore) : mockAgentLifecycleStore,
}))

describe('TaskFlowVisualization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const tasks = new Map<string, TaskFlowEntry>()
    tasks.set('task-001', mockTask1)
    tasks.set('task-002', mockTask2)

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

    const agents = new Map<string, any>()
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

    mockAgentLifecycleStore = {
      agents,
      activeTurns: new Map(),
      healthAlerts: [],
      agentCards: new Map(),
      connectedAgents: new Set(['claude-code', 'gemini-cli']),
      subscribe: vi.fn(() => vi.fn()),
      refreshAgentCards: vi.fn(),
      findAgentsByCapability: vi.fn(() => Promise.resolve([])),
      getAgentState: vi.fn(() => 'idle'),
      getAgentAlerts: vi.fn(() => []),
      clearAlerts: vi.fn(),
    }
  })

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
    // Filter buttons are in the first row; "全部" is unique
    const filterBar = screen.getByText('全部').parentElement!
    expect(filterBar).toBeInTheDocument()
    // Other tab labels appear in both filter bar and status badges, so check filter bar children
    expect(screen.getByText('交接中')).toBeInTheDocument()
  })

  it('filters to running tasks when clicking running tab', () => {
    render(<TaskFlowVisualization />)
    // Click the "运行中" filter button specifically
    const runningTabs = screen.getAllByText('运行中')
    fireEvent.click(runningTabs[0])
    // Only the running task should be visible as a task title
    expect(screen.getByText('Refactor module')).toBeInTheDocument()
    expect(screen.queryByText('Write tests')).not.toBeInTheDocument()
  })

  it('filters to completed tasks when clicking completed tab', () => {
    render(<TaskFlowVisualization />)
    const completedTabs = screen.getAllByText('已完成')
    fireEvent.click(completedTabs[0])
    expect(screen.queryByText('Refactor module')).not.toBeInTheDocument()
    expect(screen.getByText('Write tests')).toBeInTheDocument()
  })

  it('shows task count in stats bar', () => {
    render(<TaskFlowVisualization />)
    // Stats bar shows total tasks
    expect(screen.getByText(/总任务:/)).toBeInTheDocument()
    expect(screen.getByText(/工具调用:/)).toBeInTheDocument()
  })

  it('expands task to show tool calls and handoffs on click', () => {
    render(<TaskFlowVisualization />)
    fireEvent.click(screen.getByText('Write tests'))
    expect(screen.getByText('read_file')).toBeInTheDocument()
    // claude-code and gemini-cli appear in multiple places, use getAllByText
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
})
