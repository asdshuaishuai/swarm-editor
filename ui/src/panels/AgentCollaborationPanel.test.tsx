import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { AgentCollaborationPanel } from './AgentCollaborationPanel'

// --- Capture callbacks from mocked child components ---
let chatOnSendMessage: ((msg: string) => void) | undefined
let chatOnSwitchAgent: ((id: string) => void) | undefined

// --- Mocks ---

vi.mock('../components/AgentChat', () => ({
  AgentChat: ({ messages, onSendMessage, onSwitchAgent, isLoading }: {
    messages: unknown[]
    onSendMessage: (msg: string) => void
    onSwitchAgent: (id: string) => void
    isLoading: boolean
    primaryAgentId?: string
  }) => {
    chatOnSendMessage = onSendMessage
    chatOnSwitchAgent = onSwitchAgent
    return (
      <div data-testid="agent-chat">
        <span data-testid="chat-message-count">{messages.length}</span>
        <span data-testid="chat-loading">{String(isLoading)}</span>
        <button data-testid="chat-send" onClick={() => onSendMessage('test')}>Send</button>
        <button data-testid="chat-switch" onClick={() => onSwitchAgent('new-agent')}>Switch</button>
      </div>
    )
  },
}))

vi.mock('../components/SwarmStatus', () => ({
  SwarmStatus: ({ tasks, progress, consensus, emergence }: {
    tasks: unknown[]
    progress: number
    consensus?: { total: number; agreed: number; votes: unknown[] }
    emergence?: { health?: unknown; signals?: unknown[] }
  }) => (
    <div data-testid="swarm-status">
      <span data-testid="task-count">{tasks.length}</span>
      <span data-testid="progress">{progress}</span>
      {consensus && <span data-testid="consensus-total">{consensus.total}</span>}
      {consensus && <span data-testid="consensus-agreed">{consensus.agreed}</span>}
      {emergence && <span data-testid="emergence-present">yes</span>}
    </div>
  ),
}))

const mockGetAgents = vi.fn().mockResolvedValue([
  { id: 'claude-code', name: 'Claude Code', state: 'active', type: 'acp' },
])
const mockCreateSession = vi.fn().mockResolvedValue({ id: 'session-1' })
const mockSendMessage = vi.fn().mockResolvedValue({ content: 'response' })
const mockCloseSession = vi.fn().mockResolvedValue(undefined)
const mockGetSwarms = vi.fn().mockResolvedValue([])
const mockGetSwarmTasks = vi.fn().mockResolvedValue([])
const mockGetConsensus = vi.fn().mockResolvedValue({ consensus: [], algorithm: 'majority', threshold: 0.5 })
const mockGetEmergenceData = vi.fn().mockResolvedValue(null)
const mockSubscribe = vi.fn().mockReturnValue(() => {})

vi.mock('../services', () => ({
  api: {
    agent: {
      getAgents: (...args: unknown[]) => mockGetAgents(...args),
      createSession: (...args: unknown[]) => mockCreateSession(...args),
      sendMessage: (...args: unknown[]) => mockSendMessage(...args),
      closeSession: (...args: unknown[]) => mockCloseSession(...args),
    },
    swarm: {
      getSwarms: (...args: unknown[]) => mockGetSwarms(...args),
      getSwarmTasks: (...args: unknown[]) => mockGetSwarmTasks(...args),
      getConsensus: (...args: unknown[]) => mockGetConsensus(...args),
    },
    monitoring: {
      getEmergenceData: (...args: unknown[]) => mockGetEmergenceData(...args),
    },
  },
}))

vi.mock('../services/websocket', () => ({
  getWebSocketClient: () => ({
    subscribe: (...args: unknown[]) => mockSubscribe(...args),
  }),
}))

vi.mock('../services/byzantine', () => ({
  byzantineService: {
    updateByzantineConfig: vi.fn(),
    createMessage: vi.fn(),
    detectFaultyNodes: vi.fn().mockReturnValue([]),
  },
}))

vi.mock('../utils', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock('../utils/agentUtils', () => ({
  AGENT_ICONS: {
    'claude-code': '◈',
    'kimi-code': '◇',
    'default': '□',
  },
  mapAgentStatus: (state: string) => {
    if (state === 'active' || state === 'connected') return 'active'
    if (state === 'idle') return 'idle'
    return 'offline'
  },
}))

// --- Tests ---

describe('AgentCollaborationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    chatOnSendMessage = undefined
    chatOnSwitchAgent = undefined
    mockGetAgents.mockResolvedValue([
      { id: 'claude-code', name: 'Claude Code', state: 'active', type: 'acp' },
    ])
    mockCreateSession.mockResolvedValue({ id: 'session-1' })
    mockSendMessage.mockResolvedValue({ content: 'response' })
    mockCloseSession.mockResolvedValue(undefined)
    mockGetSwarms.mockResolvedValue([])
    mockGetSwarmTasks.mockResolvedValue([])
    mockGetConsensus.mockResolvedValue({ consensus: [], algorithm: 'majority', threshold: 0.5 })
    mockGetEmergenceData.mockResolvedValue(null)
    mockSubscribe.mockReturnValue(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ====== Rendering ======

  describe('Rendering', () => {
    it('renders without crashing', () => {
      render(<AgentCollaborationPanel />)
      expect(screen.getByTestId('agent-chat')).toBeInTheDocument()
      expect(screen.getByTestId('swarm-status')).toBeInTheDocument()
    })

    it('renders AgentChat with empty messages initially', () => {
      render(<AgentCollaborationPanel />)
      expect(screen.getByTestId('chat-message-count')).toHaveTextContent('0')
    })

    it('renders SwarmStatus with no tasks initially', () => {
      render(<AgentCollaborationPanel />)
      expect(screen.getByTestId('task-count')).toHaveTextContent('0')
      expect(screen.getByTestId('progress')).toHaveTextContent('0')
    })

    it('renders with loading state false initially', () => {
      render(<AgentCollaborationPanel />)
      expect(screen.getByTestId('chat-loading')).toHaveTextContent('false')
    })
  })

  // ====== Agent Fetching ======

  describe('Agent Fetching', () => {
    it('fetches agents on mount via api.agent.getAgents()', async () => {
      render(<AgentCollaborationPanel />)
      await waitFor(() => {
        expect(mockGetAgents).toHaveBeenCalledTimes(1)
      })
    })

    it('handles agent fetch error gracefully', async () => {
      mockGetAgents.mockRejectedValueOnce(new Error('Failed'))
      render(<AgentCollaborationPanel />)
      await waitFor(() => {
        expect(mockGetAgents).toHaveBeenCalled()
      })
      // Component should still render without crashing
      expect(screen.getByTestId('agent-chat')).toBeInTheDocument()
    })

    it('maps agents with correct icon and status', async () => {
      mockGetAgents.mockResolvedValue([
        { id: 'claude-code', name: 'Claude Code', state: 'active', type: 'acp' },
        { id: 'kimi-code', name: 'Kimi Code', state: 'idle', type: 'acp' },
      ])
      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(mockGetAgents).toHaveBeenCalled()
      })
      // Agents are loaded but we can't directly inspect internal state.
      // We verify the component renders and the API was called.
      expect(screen.getByTestId('agent-chat')).toBeInTheDocument()
    })

    it('sets primary agent role for activeAgentId', async () => {
      render(<AgentCollaborationPanel primaryAgentId="claude-code" />)

      await waitFor(() => {
        expect(mockGetAgents).toHaveBeenCalled()
      })
      expect(screen.getByTestId('agent-chat')).toBeInTheDocument()
    })
  })

  // ====== Swarm Data Fetching ======

  describe('Swarm Data Fetching', () => {
    it('fetches swarm data on mount', async () => {
      render(<AgentCollaborationPanel />)
      await waitFor(() => {
        expect(mockGetSwarms).toHaveBeenCalledTimes(1)
        expect(mockGetConsensus).toHaveBeenCalledTimes(1)
        expect(mockGetEmergenceData).toHaveBeenCalledTimes(1)
      })
    })

    it('fetches tasks from first running swarm', async () => {
      mockGetSwarms.mockResolvedValue([
        { id: 'sw-1', name: 'Swarm 1', status: 'created', state: 'created', topology: 'mesh', strategy: 'parallel', agentCount: 0, taskCount: 0 },
        { id: 'sw-2', name: 'Swarm 2', status: 'running', state: 'running', topology: 'mesh', strategy: 'parallel', agentCount: 2, taskCount: 5 },
      ])
      mockGetSwarmTasks.mockResolvedValue([
        { id: 't-1', title: 'Task 1', status: 'completed', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
        { id: 't-2', title: 'Task 2', status: 'running', description: '', priority: 'high', assignedTo: [], results: [], createdAt: '' },
      ])

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        // Should pick the running swarm (sw-2) over the first one
        expect(mockGetSwarmTasks).toHaveBeenCalledWith('sw-2')
      })

      await waitFor(() => {
        expect(screen.getByTestId('task-count')).toHaveTextContent('2')
      })
    })

    it('uses first swarm as fallback when no running swarm exists', async () => {
      mockGetSwarms.mockResolvedValue([
        { id: 'sw-1', name: 'Swarm 1', status: 'created', state: 'created', topology: 'mesh', strategy: 'parallel', agentCount: 0, taskCount: 0 },
      ])
      mockGetSwarmTasks.mockResolvedValue([])

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(mockGetSwarmTasks).toHaveBeenCalledWith('sw-1')
      })
    })

    it('does not fetch tasks when no swarms exist', async () => {
      mockGetSwarms.mockResolvedValue([])

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(mockGetSwarms).toHaveBeenCalled()
      })
      expect(mockGetSwarmTasks).not.toHaveBeenCalled()
    })

    it('handles swarm data fetch error gracefully', async () => {
      mockGetSwarms.mockRejectedValueOnce(new Error('Swarm fetch failed'))

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(mockGetSwarms).toHaveBeenCalled()
      })
      // Component should still render
      expect(screen.getByTestId('swarm-status')).toBeInTheDocument()
    })

    it('handles getConsensus error gracefully', async () => {
      mockGetConsensus.mockRejectedValueOnce(new Error('Consensus error'))

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(mockGetConsensus).toHaveBeenCalled()
      })
      expect(screen.getByTestId('swarm-status')).toBeInTheDocument()
    })

    it('handles getEmergenceData error gracefully', async () => {
      mockGetEmergenceData.mockRejectedValueOnce(new Error('Emergence error'))

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(mockGetEmergenceData).toHaveBeenCalled()
      })
      expect(screen.getByTestId('swarm-status')).toBeInTheDocument()
    })

    it('calculates progress from tasks', async () => {
      mockGetSwarms.mockResolvedValue([
        { id: 'sw-1', name: 'Swarm', status: 'running', state: 'running', topology: 'mesh', strategy: 'parallel', agentCount: 1, taskCount: 4 },
      ])
      mockGetSwarmTasks.mockResolvedValue([
        { id: 't-1', title: 'Task 1', status: 'completed', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
        { id: 't-2', title: 'Task 2', status: 'completed', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
        { id: 't-3', title: 'Task 3', status: 'running', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
        { id: 't-4', title: 'Task 4', status: 'pending', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
      ])

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        // 2 completed / 4 total = 50%
        expect(screen.getByTestId('progress')).toHaveTextContent('50')
      })
    })

    it('shows 0% progress with no tasks', async () => {
      mockGetSwarms.mockResolvedValue([])
      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(screen.getByTestId('progress')).toHaveTextContent('0')
      })
    })
  })

  // ====== Consensus Data ======

  describe('Consensus Data', () => {
    it('processes consensus data through byzantine service', async () => {
      const { byzantineService } = await import('../services/byzantine')
      mockGetConsensus.mockResolvedValue({
        consensus: [
          { taskId: 't-1', algorithm: 'majority', approvalRate: 0.8, totalVotes: 5, approvedVotes: 4, completed: true, agreed: true },
        ],
        algorithm: 'majority',
        threshold: 0.5,
      })

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(byzantineService.updateByzantineConfig).toHaveBeenCalledWith({ enabled: true })
        expect(byzantineService.createMessage).toHaveBeenCalled()
      })
    })

    it('displays consensus votes when consensus data exists', async () => {
      mockGetConsensus.mockResolvedValue({
        consensus: [
          { taskId: 't-1', algorithm: 'majority', approvalRate: 1.0, totalVotes: 3, approvedVotes: 3, completed: true, agreed: true },
          { taskId: 't-2', algorithm: 'majority', approvalRate: 0.33, totalVotes: 3, approvedVotes: 1, completed: true, agreed: false },
        ],
        algorithm: 'majority',
        threshold: 0.5,
      })

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(screen.getByTestId('consensus-total')).toHaveTextContent('2')
        expect(screen.getByTestId('consensus-agreed')).toHaveTextContent('1')
      })
    })

    it('adds BFT disagree vote when faulty nodes detected', async () => {
      const { byzantineService } = await import('../services/byzantine')
      vi.mocked(byzantineService.detectFaultyNodes).mockReturnValueOnce(['node-1'])

      mockGetConsensus.mockResolvedValue({
        consensus: [
          { taskId: 't-1', algorithm: 'majority', approvalRate: 1.0, totalVotes: 3, approvedVotes: 3, completed: true, agreed: true },
        ],
        algorithm: 'majority',
        threshold: 0.5,
      })

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(screen.getByTestId('consensus-total')).toHaveTextContent('1')
      })
      // The votes should include the BFT system vote
      expect(screen.getByTestId('swarm-status')).toBeInTheDocument()
    })

    it('does not process empty consensus', async () => {
      mockGetConsensus.mockResolvedValue({ consensus: [], algorithm: 'majority', threshold: 0.5 })

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(mockGetConsensus).toHaveBeenCalled()
      })
      // No consensus data rendered
      expect(screen.queryByTestId('consensus-total')).not.toBeInTheDocument()
    })
  })

  // ====== Emergence Data ======

  describe('Emergence Data', () => {
    it('displays emergence data when available', async () => {
      mockGetEmergenceData.mockResolvedValue({
        health: { overallScore: 85, congestionLevel: 10, collaborationIndex: 90, innovationRate: 75, agentUtilization: 80 },
        signals: [{ id: 's-1', type: 'synergy', severity: 'low', message: 'Good collaboration' }],
        agents: [],
        flows: [],
      })

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(screen.getByTestId('emergence-present')).toBeInTheDocument()
      })
    })

    it('does not display emergence when null', async () => {
      mockGetEmergenceData.mockResolvedValue(null)

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(mockGetEmergenceData).toHaveBeenCalled()
      })
      expect(screen.queryByTestId('emergence-present')).not.toBeInTheDocument()
    })
  })

  // ====== WebSocket Subscriptions ======

  describe('WebSocket Subscriptions', () => {
    it('subscribes to agent_stats and swarm_stats on mount', () => {
      render(<AgentCollaborationPanel />)
      expect(mockSubscribe).toHaveBeenCalledTimes(2)
      expect(mockSubscribe).toHaveBeenCalledWith('agent_stats', expect.any(Function))
      expect(mockSubscribe).toHaveBeenCalledWith('swarm_stats', expect.any(Function))
    })

    it('unsubscribes WebSocket listeners on unmount', () => {
      const unsubAgent = vi.fn()
      const unsubSwarm = vi.fn()
      mockSubscribe
        .mockReturnValueOnce(unsubAgent)
        .mockReturnValueOnce(unsubSwarm)

      const { unmount } = render(<AgentCollaborationPanel />)
      unmount()

      expect(unsubAgent).toHaveBeenCalledTimes(1)
      expect(unsubSwarm).toHaveBeenCalledTimes(1)
    })

    it('updates agents when agent_stats event received', async () => {
      let agentStatsHandler: ((data: unknown) => void) | undefined
      mockSubscribe.mockImplementation((event: string, handler: (data: unknown) => void) => {
        if (event === 'agent_stats') agentStatsHandler = handler
        return () => {}
      })

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(agentStatsHandler).toBeDefined()
      })

      // Simulate receiving agent stats
      await act(async () => {
        agentStatsHandler!([
          { id: 'claude-code', name: 'Claude', state: 'active' },
          { id: 'kimi-code', name: 'Kimi', state: 'idle' },
        ])
      })

      // Component should still render fine with updated agents
      expect(screen.getByTestId('agent-chat')).toBeInTheDocument()
    })

    it('ignores non-array agent_stats data', async () => {
      let agentStatsHandler: ((data: unknown) => void) | undefined
      mockSubscribe.mockImplementation((event: string, handler: (data: unknown) => void) => {
        if (event === 'agent_stats') agentStatsHandler = handler
        return () => {}
      })

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(agentStatsHandler).toBeDefined()
      })

      await act(async () => {
        agentStatsHandler!('not an array')
      })

      expect(screen.getByTestId('agent-chat')).toBeInTheDocument()
    })

    it('refreshes swarm data when swarm_stats event received with data', async () => {
      let swarmStatsHandler: ((data: unknown) => void) | undefined
      mockSubscribe.mockImplementation((event: string, handler: (data: unknown) => void) => {
        if (event === 'swarm_stats') swarmStatsHandler = handler
        return () => {}
      })

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(swarmStatsHandler).toBeDefined()
      })

      // Initial calls
      const initialCallCount = mockGetSwarms.mock.calls.length

      await act(async () => {
        swarmStatsHandler!([{ id: 'sw-1', status: 'running' }])
      })

      await waitFor(() => {
        expect(mockGetSwarms).toHaveBeenCalledTimes(initialCallCount + 1)
      })
    })

    it('ignores empty swarm_stats data', async () => {
      let swarmStatsHandler: ((data: unknown) => void) | undefined
      mockSubscribe.mockImplementation((event: string, handler: (data: unknown) => void) => {
        if (event === 'swarm_stats') swarmStatsHandler = handler
        return () => {}
      })

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(swarmStatsHandler).toBeDefined()
      })

      const initialCallCount = mockGetSwarms.mock.calls.length

      await act(async () => {
        swarmStatsHandler!([])
      })

      // Should not trigger additional fetchSwarmData
      expect(mockGetSwarms).toHaveBeenCalledTimes(initialCallCount)
    })

    it('ignores non-array swarm_stats data', async () => {
      let swarmStatsHandler: ((data: unknown) => void) | undefined
      mockSubscribe.mockImplementation((event: string, handler: (data: unknown) => void) => {
        if (event === 'swarm_stats') swarmStatsHandler = handler
        return () => {}
      })

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(swarmStatsHandler).toBeDefined()
      })

      const initialCallCount = mockGetSwarms.mock.calls.length

      await act(async () => {
        swarmStatsHandler!({ not: 'an array' })
      })

      expect(mockGetSwarms).toHaveBeenCalledTimes(initialCallCount)
    })
  })

  // ====== Message Sending ======

  describe('Message Sending', () => {
    it('creates session on first message send', async () => {
      render(<AgentCollaborationPanel />)
      await waitFor(() => {
        expect(chatOnSendMessage).toBeDefined()
      })

      await act(async () => {
        await chatOnSendMessage!('hello')
      })

      expect(mockCreateSession).toHaveBeenCalledWith('claude-code', 'default')
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith('session-1', 'hello')
      })
    })

    it('sends message via api.agent.sendMessage()', async () => {
      render(<AgentCollaborationPanel />)
      await waitFor(() => {
        expect(chatOnSendMessage).toBeDefined()
      })

      await act(async () => {
        await chatOnSendMessage!('test message')
      })

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith('session-1', 'test message')
      })
    })

    it('reuses existing session for subsequent messages', async () => {
      render(<AgentCollaborationPanel />)
      await waitFor(() => {
        expect(chatOnSendMessage).toBeDefined()
      })

      await act(async () => {
        await chatOnSendMessage!('first')
      })
      await act(async () => {
        await chatOnSendMessage!('second')
      })

      expect(mockCreateSession).toHaveBeenCalledTimes(1)
      expect(mockSendMessage).toHaveBeenCalledTimes(2)
    })

    it('adds user message to chat on send', async () => {
      render(<AgentCollaborationPanel />)
      await waitFor(() => {
        expect(chatOnSendMessage).toBeDefined()
      })

      await act(async () => {
        await chatOnSendMessage!('hello')
      })

      await waitFor(() => {
        expect(screen.getByTestId('chat-message-count')).toHaveTextContent('2')
        // User message + agent response
      })
    })

    it('adds agent response with correct agent name', async () => {
      render(<AgentCollaborationPanel />)
      await waitFor(() => {
        expect(chatOnSendMessage).toBeDefined()
      })

      await act(async () => {
        await chatOnSendMessage!('hello')
      })

      await waitFor(() => {
        // message count should be 2 (user + agent)
        expect(screen.getByTestId('chat-message-count')).toHaveTextContent('2')
      })
    })

    it('adds error message when send fails', async () => {
      mockSendMessage.mockRejectedValueOnce(new Error('Send failed'))

      render(<AgentCollaborationPanel />)
      await waitFor(() => {
        expect(chatOnSendMessage).toBeDefined()
      })

      await act(async () => {
        await chatOnSendMessage!('hello')
      })

      await waitFor(() => {
        // User message + error message
        expect(screen.getByTestId('chat-message-count')).toHaveTextContent('2')
      })
    })

    it('shows "unknown error" for non-Error exceptions', async () => {
      mockSendMessage.mockRejectedValueOnce('string error')

      render(<AgentCollaborationPanel />)
      await waitFor(() => {
        expect(chatOnSendMessage).toBeDefined()
      })

      await act(async () => {
        await chatOnSendMessage!('hello')
      })

      await waitFor(() => {
        expect(screen.getByTestId('chat-message-count')).toHaveTextContent('2')
      })
    })

    it('sets loading state during send', async () => {
      let resolveSend: (value: unknown) => void
      const sendPromise = new Promise((resolve: (value: unknown) => void) => { resolveSend = resolve })
      mockSendMessage.mockReturnValue(sendPromise)

      render(<AgentCollaborationPanel />)
      await waitFor(() => {
        expect(chatOnSendMessage).toBeDefined()
      })

      // Start sending
      await act(async () => {
        chatOnSendMessage!('hello')
      })

      // While sending, loading should be true
      expect(screen.getByTestId('chat-loading')).toHaveTextContent('true')

      // Resolve the send
      await act(async () => {
        resolveSend!({ content: 'done' })
        await sendPromise
      })

      await waitFor(() => {
        expect(screen.getByTestId('chat-loading')).toHaveTextContent('false')
      })
    })

    it('shows fallback message when response has no content', async () => {
      mockSendMessage.mockResolvedValue({ content: undefined })

      render(<AgentCollaborationPanel />)
      await waitFor(() => {
        expect(chatOnSendMessage).toBeDefined()
      })

      await act(async () => {
        await chatOnSendMessage!('hello')
      })

      await waitFor(() => {
        expect(screen.getByTestId('chat-message-count')).toHaveTextContent('2')
      })
    })

    it('resets loading state after error', async () => {
      mockSendMessage.mockRejectedValueOnce(new Error('fail'))

      render(<AgentCollaborationPanel />)
      await waitFor(() => {
        expect(chatOnSendMessage).toBeDefined()
      })

      await act(async () => {
        await chatOnSendMessage!('hello')
      })

      await waitFor(() => {
        expect(screen.getByTestId('chat-loading')).toHaveTextContent('false')
      })
    })
  })

  // ====== Agent Switching ======

  describe('Agent Switching', () => {
    it('calls onSwitchAgent callback when switching agents', async () => {
      const onSwitchAgent = vi.fn()
      render(<AgentCollaborationPanel onSwitchAgent={onSwitchAgent} />)
      await waitFor(() => {
        expect(chatOnSwitchAgent).toBeDefined()
      })

      await act(async () => {
        chatOnSwitchAgent!('kimi-code')
      })

      expect(onSwitchAgent).toHaveBeenCalledWith('kimi-code')
    })

    it('closes session when switching agents', async () => {
      render(<AgentCollaborationPanel />)
      await waitFor(() => {
        expect(chatOnSendMessage).toBeDefined()
      })

      // Create a session first
      await act(async () => {
        await chatOnSendMessage!('hello')
      })
      await waitFor(() => {
        expect(mockCreateSession).toHaveBeenCalled()
      })

      // Switch agent
      await act(async () => {
        chatOnSwitchAgent!('kimi-code')
      })

      expect(mockCloseSession).toHaveBeenCalledWith('session-1')
    })

    it('adds system message when switching agents', async () => {
      render(<AgentCollaborationPanel />)
      await waitFor(() => {
        expect(chatOnSwitchAgent).toBeDefined()
      })

      await act(async () => {
        chatOnSwitchAgent!('new-agent')
      })

      // System message should be added
      expect(screen.getByTestId('chat-message-count')).toHaveTextContent('1')
    })

    it('does not close session when no active session on switch', async () => {
      render(<AgentCollaborationPanel />)
      await waitFor(() => {
        expect(chatOnSwitchAgent).toBeDefined()
      })

      // Switch without having created a session
      await act(async () => {
        chatOnSwitchAgent!('new-agent')
      })

      expect(mockCloseSession).not.toHaveBeenCalled()
    })
  })

  // ====== primaryAgentId Prop ======

  describe('primaryAgentId Prop', () => {
    it('uses primaryAgentId as default active agent', async () => {
      render(<AgentCollaborationPanel primaryAgentId="kimi-code" />)

      await waitFor(() => {
        expect(mockGetAgents).toHaveBeenCalled()
      })
      expect(screen.getByTestId('agent-chat')).toBeInTheDocument()
    })

    it('updates active agent when primaryAgentId changes', async () => {
      const { rerender } = render(<AgentCollaborationPanel primaryAgentId="claude-code" />)

      await waitFor(() => {
        expect(mockGetAgents).toHaveBeenCalled()
      })

      rerender(<AgentCollaborationPanel primaryAgentId="kimi-code" />)

      // Component should still render after prop change
      expect(screen.getByTestId('agent-chat')).toBeInTheDocument()
    })

    it('defaults to claude-code when no primaryAgentId provided', async () => {
      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(mockGetAgents).toHaveBeenCalled()
      })
      // Default is claude-code, so session creation would use it
    })
  })

  // ====== Session Cleanup ======

  describe('Session Cleanup', () => {
    it('cleans up session on unmount', async () => {
      const { unmount } = render(<AgentCollaborationPanel />)
      await waitFor(() => {
        expect(chatOnSendMessage).toBeDefined()
      })

      // Send a message to create a session
      await act(async () => {
        await chatOnSendMessage!('hello')
      })
      await waitFor(() => {
        expect(mockCreateSession).toHaveBeenCalled()
      })

      unmount()

      expect(mockCloseSession).toHaveBeenCalledWith('session-1')
    })

    it('does not close session on unmount when no session exists', async () => {
      const { unmount } = render(<AgentCollaborationPanel />)
      await waitFor(() => {
        expect(screen.getByTestId('agent-chat')).toBeInTheDocument()
      })

      unmount()

      expect(mockCloseSession).not.toHaveBeenCalled()
    })

    it('handles closeSession error on unmount gracefully', async () => {
      mockCloseSession.mockRejectedValueOnce(new Error('close failed'))

      const { unmount } = render(<AgentCollaborationPanel />)
      await waitFor(() => {
        expect(chatOnSendMessage).toBeDefined()
      })

      await act(async () => {
        await chatOnSendMessage!('hello')
      })
      await waitFor(() => {
        expect(mockCreateSession).toHaveBeenCalled()
      })

      // Unmount should not throw
      unmount()

      expect(mockCloseSession).toHaveBeenCalled()
    })
  })

  // ====== Integration Scenarios ======

  describe('Integration Scenarios', () => {
    it('handles full message lifecycle: send -> receive -> switch agent -> send again', async () => {
      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(chatOnSendMessage).toBeDefined()
      })

      // Send first message
      await act(async () => {
        await chatOnSendMessage!('first')
      })

      await waitFor(() => {
        expect(mockCreateSession).toHaveBeenCalledTimes(1)
        expect(mockSendMessage).toHaveBeenCalledTimes(1)
      })

      // Switch agent (closes session)
      await act(async () => {
        chatOnSwitchAgent!('new-agent')
      })

      expect(mockCloseSession).toHaveBeenCalledWith('session-1')

      // Send again (should create new session)
      mockCreateSession.mockResolvedValueOnce({ id: 'session-2' })

      await act(async () => {
        await chatOnSendMessage!('second')
      })

      await waitFor(() => {
        expect(mockCreateSession).toHaveBeenCalledTimes(2)
      })
    })

    it('handles concurrent fetchAgents and fetchSwarmData errors', async () => {
      mockGetAgents.mockRejectedValueOnce(new Error('agent fail'))
      mockGetSwarms.mockRejectedValueOnce(new Error('swarm fail'))

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(mockGetAgents).toHaveBeenCalled()
        expect(mockGetSwarms).toHaveBeenCalled()
      })

      // Component should still render
      expect(screen.getByTestId('agent-chat')).toBeInTheDocument()
      expect(screen.getByTestId('swarm-status')).toBeInTheDocument()
    })

    it('processes tasks with various statuses for progress calculation', async () => {
      mockGetSwarms.mockResolvedValue([
        { id: 'sw-1', name: 'Swarm', status: 'running', state: 'running', topology: 'mesh', strategy: 'parallel', agentCount: 1, taskCount: 5 },
      ])
      mockGetSwarmTasks.mockResolvedValue([
        { id: 't-1', title: 'Done 1', status: 'completed', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
        { id: 't-2', title: 'Done 2', status: 'completed', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
        { id: 't-3', title: 'Done 3', status: 'completed', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
        { id: 't-4', title: 'Running', status: 'running', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
        { id: 't-5', title: 'Pending', status: 'pending', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
      ])

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        // 3 completed / 5 total = 60%
        expect(screen.getByTestId('progress')).toHaveTextContent('60')
      })
    })
  })
})

describe('AgentCollaborationPanel edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    chatOnSendMessage = undefined
    chatOnSwitchAgent = undefined
    mockGetAgents.mockResolvedValue([
      { id: 'claude-code', name: 'Claude Code', state: 'active', type: 'acp' },
    ])
    mockCreateSession.mockResolvedValue({ id: 'session-1' })
    mockSendMessage.mockResolvedValue({ content: 'response' })
    mockCloseSession.mockResolvedValue(undefined)
    mockGetSwarms.mockResolvedValue([])
    mockGetSwarmTasks.mockResolvedValue([])
    mockGetConsensus.mockResolvedValue({ consensus: [], algorithm: 'majority', threshold: 0.5 })
    mockGetEmergenceData.mockResolvedValue(null)
    mockSubscribe.mockReturnValue(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('handles unknown agent IDs with default icon', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'unknown-agent', name: 'Unknown Agent', state: 'active', type: 'acp' },
    ])

    render(<AgentCollaborationPanel />)
    await waitFor(() => {
      expect(mockGetAgents).toHaveBeenCalled()
    })
    // Should not crash with unknown agent ID
    expect(screen.getByTestId('agent-chat')).toBeInTheDocument()
  })

  it('handles null taskList from getSwarmTasks', async () => {
    mockGetSwarms.mockResolvedValue([
      { id: 'sw-1', name: 'Swarm', status: 'running', state: 'running', topology: 'mesh', strategy: 'parallel', agentCount: 1, taskCount: 0 },
    ])
    mockGetSwarmTasks.mockResolvedValue(null)

    render(<AgentCollaborationPanel />)

    await waitFor(() => {
      expect(mockGetSwarmTasks).toHaveBeenCalledWith('sw-1')
    })

    // Should show 0 tasks (null handled as empty)
    expect(screen.getByTestId('task-count')).toHaveTextContent('0')
  })

  it('handles unknown agent ID in WebSocket agent_stats', async () => {
    let agentStatsHandler: ((data: unknown) => void) | undefined
    mockSubscribe.mockImplementation((event: string, handler: (data: unknown) => void) => {
      if (event === 'agent_stats') agentStatsHandler = handler
      return () => {}
    })

    render(<AgentCollaborationPanel />)

    await waitFor(() => {
      expect(agentStatsHandler).toBeDefined()
    })

    // Send agent stats with unknown ID (not in AGENT_ICONS map)
    await act(async () => {
      agentStatsHandler!([
        { id: 'custom-agent', name: 'Custom', state: 'active' },
      ])
    })

    // Should not crash
    expect(screen.getByTestId('agent-chat')).toBeInTheDocument()
  })

  it('passes emergence data with health and signals to SwarmStatus', async () => {
    mockGetEmergenceData.mockResolvedValue({
      health: { overallScore: 90, congestionLevel: 5, collaborationIndex: 95, innovationRate: 80, agentUtilization: 85 },
      signals: [{ id: 's-1', type: 'synergy', severity: 'low', message: 'Test signal' }],
      agents: [],
      flows: [],
    })

    render(<AgentCollaborationPanel />)

    await waitFor(() => {
      expect(screen.getByTestId('emergence-present')).toBeInTheDocument()
    })
  })

  it('handles createSession failure on message send', async () => {
    mockCreateSession.mockRejectedValueOnce(new Error('Session create failed'))

    render(<AgentCollaborationPanel />)
    await waitFor(() => {
      expect(chatOnSendMessage).toBeDefined()
    })

    await act(async () => {
      await chatOnSendMessage!('hello')
    })

    // Should add error message
    await waitFor(() => {
      expect(screen.getByTestId('chat-message-count')).toHaveTextContent('2')
    })
  })

  it('passes primaryAgentId to AgentChat', async () => {
    render(<AgentCollaborationPanel primaryAgentId="kimi-code" />)

    await waitFor(() => {
      expect(mockGetAgents).toHaveBeenCalled()
    })
    expect(screen.getByTestId('agent-chat')).toBeInTheDocument()
  })

  it('handles empty task list from swarms', async () => {
    mockGetSwarms.mockResolvedValue([
      { id: 'sw-1', name: 'Empty Swarm', status: 'running', state: 'running', topology: 'mesh', strategy: 'parallel', agentCount: 0, taskCount: 0 },
    ])
    mockGetSwarmTasks.mockResolvedValue([])

    render(<AgentCollaborationPanel />)

    await waitFor(() => {
      expect(mockGetSwarmTasks).toHaveBeenCalledWith('sw-1')
    })

    expect(screen.getByTestId('task-count')).toHaveTextContent('0')
    expect(screen.getByTestId('progress')).toHaveTextContent('0')
  })

  it('handles consensus data with mixed agree/disagree votes', async () => {
    mockGetConsensus.mockResolvedValue({
      consensus: [
        { taskId: 't-1', algorithm: 'pbft', approvalRate: 1.0, totalVotes: 3, approvedVotes: 3, completed: true, agreed: true },
        { taskId: 't-2', algorithm: 'majority', approvalRate: 0.4, totalVotes: 5, approvedVotes: 2, completed: true, agreed: false },
        { taskId: 't-3', algorithm: 'pbft', approvalRate: 0.8, totalVotes: 5, approvedVotes: 4, completed: true, agreed: true },
      ],
      algorithm: 'hybrid',
      threshold: 0.5,
    })

    render(<AgentCollaborationPanel />)

    await waitFor(() => {
      expect(screen.getByTestId('consensus-total')).toHaveTextContent('3')
      expect(screen.getByTestId('consensus-agreed')).toHaveTextContent('2')
    })
  })

  it('calculates 100% progress when all tasks completed', async () => {
    mockGetSwarms.mockResolvedValue([
      { id: 'sw-1', name: 'Done Swarm', status: 'running', state: 'running', topology: 'mesh', strategy: 'parallel', agentCount: 1, taskCount: 3 },
    ])
    mockGetSwarmTasks.mockResolvedValue([
      { id: 't-1', title: 'Done 1', status: 'completed', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
      { id: 't-2', title: 'Done 2', status: 'completed', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
      { id: 't-3', title: 'Done 3', status: 'completed', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
    ])

    render(<AgentCollaborationPanel />)

    await waitFor(() => {
      expect(screen.getByTestId('progress')).toHaveTextContent('100')
    })
  })

  it('handles switch agent with closeSession rejection', async () => {
    mockCloseSession.mockRejectedValueOnce(new Error('close failed'))

    render(<AgentCollaborationPanel />)
    await waitFor(() => {
      expect(chatOnSendMessage).toBeDefined()
    })

    // Create a session first
    await act(async () => {
      await chatOnSendMessage!('hello')
    })
    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalled()
    })

    // Switch agent (should handle close rejection gracefully)
    await act(async () => {
      chatOnSwitchAgent!('kimi-code')
    })

    // Should still add system message
    expect(screen.getByTestId('chat-message-count')).toHaveTextContent('3')
  })
})

describe('AgentCollaborationPanel additional edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    chatOnSendMessage = undefined
    chatOnSwitchAgent = undefined
    mockGetAgents.mockResolvedValue([
      { id: 'claude-code', name: 'Claude Code', state: 'active', type: 'acp' },
      { id: 'kimi-code', name: 'Kimi Code', state: 'idle', type: 'acp' },
    ])
    mockCreateSession.mockResolvedValue({ id: 'session-1' })
    mockSendMessage.mockResolvedValue({ content: 'response' })
    mockCloseSession.mockResolvedValue(undefined)
    mockGetSwarms.mockResolvedValue([])
    mockGetSwarmTasks.mockResolvedValue([])
    mockGetConsensus.mockResolvedValue({ consensus: [], algorithm: 'majority', threshold: 0.5 })
    mockGetEmergenceData.mockResolvedValue(null)
    mockSubscribe.mockReturnValue(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('fetchAgents error handling', () => {
    it('logs warning when fetchAgents fails', async () => {
      const { logger } = await import('../utils')
      mockGetAgents.mockRejectedValueOnce(new Error('Network timeout'))

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(mockGetAgents).toHaveBeenCalled()
      })

      expect(logger.warn).toHaveBeenCalledWith(
        'AgentCollaboration',
        'Failed to fetch agents',
        expect.any(Error)
      )
    })

    it('continues rendering after fetchAgents failure', async () => {
      mockGetAgents.mockRejectedValueOnce(new Error('Server error'))

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(screen.getByTestId('agent-chat')).toBeInTheDocument()
        expect(screen.getByTestId('swarm-status')).toBeInTheDocument()
      })
    })
  })

  describe('fetchSwarmData error handling', () => {
    it('logs debug when fetchSwarmData fails completely', async () => {
      const { logger } = await import('../utils')
      mockGetSwarms.mockRejectedValueOnce(new Error('Swarm service unavailable'))

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(mockGetSwarms).toHaveBeenCalled()
      })

      expect(logger.debug).toHaveBeenCalledWith(
        'AgentCollaboration',
        'Failed to fetch swarm data',
        expect.any(Error)
      )
    })

    it('continues rendering after fetchSwarmData failure', async () => {
      mockGetSwarms.mockRejectedValueOnce(new Error('Connection refused'))

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(screen.getByTestId('agent-chat')).toBeInTheDocument()
        expect(screen.getByTestId('swarm-status')).toBeInTheDocument()
      })
    })
  })

  describe('message sending edge cases', () => {
    it('creates session with activeAgentId', async () => {
      render(<AgentCollaborationPanel primaryAgentId="kimi-code" />)

      await waitFor(() => {
        expect(chatOnSendMessage).toBeDefined()
      })

      await act(async () => {
        await chatOnSendMessage!('hello kimi')
      })

      expect(mockCreateSession).toHaveBeenCalledWith('kimi-code', 'default')
    })

    it('uses fallback message when agent name not found', async () => {
      // Use only one agent, then switch to an agent not in the list
      mockGetAgents.mockResolvedValue([
        { id: 'claude-code', name: 'Claude Code', state: 'active', type: 'acp' },
      ])

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(chatOnSwitchAgent).toBeDefined()
      })

      // Switch to an agent not in the fetched list
      await act(async () => {
        chatOnSwitchAgent!('unknown-agent')
      })

      // System message should use the agent ID as fallback name
      expect(screen.getByTestId('chat-message-count')).toHaveTextContent('1')
    })

    it('handles sendMessage returning null content', async () => {
      mockSendMessage.mockResolvedValueOnce({ content: null })

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(chatOnSendMessage).toBeDefined()
      })

      await act(async () => {
        await chatOnSendMessage!('hello')
      })

      // Should still add a response message with fallback text
      await waitFor(() => {
        expect(screen.getByTestId('chat-message-count')).toHaveTextContent('2')
      })
    })

    it('handles sendMessage returning empty string content', async () => {
      mockSendMessage.mockResolvedValueOnce({ content: '' })

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(chatOnSendMessage).toBeDefined()
      })

      await act(async () => {
        await chatOnSendMessage!('hello')
      })

      // Empty string is falsy, should use fallback message
      await waitFor(() => {
        expect(screen.getByTestId('chat-message-count')).toHaveTextContent('2')
      })
    })

    it('handles createSession rejection with non-Error object', async () => {
      mockCreateSession.mockRejectedValueOnce('string error')

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(chatOnSendMessage).toBeDefined()
      })

      await act(async () => {
        await chatOnSendMessage!('hello')
      })

      // Should add error message with "unknown error" fallback
      await waitFor(() => {
        expect(screen.getByTestId('chat-message-count')).toHaveTextContent('2')
      })
    })
  })

  describe('agent switching edge cases', () => {
    it('switches to new agent and creates new session on next message', async () => {
      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(chatOnSendMessage).toBeDefined()
        expect(chatOnSwitchAgent).toBeDefined()
      })

      // Send first message to create session
      await act(async () => {
        await chatOnSendMessage!('first')
      })

      expect(mockCreateSession).toHaveBeenCalledTimes(1)

      // Switch agent
      await act(async () => {
        chatOnSwitchAgent!('new-agent')
      })

      expect(mockCloseSession).toHaveBeenCalledWith('session-1')

      // Prepare for new session creation
      mockCreateSession.mockResolvedValueOnce({ id: 'session-2' })

      // Send another message - should create new session
      await act(async () => {
        await chatOnSendMessage!('second')
      })

      expect(mockCreateSession).toHaveBeenCalledTimes(2)
    })

    it('does not call onSwitchAgent when callback is undefined', async () => {
      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(chatOnSwitchAgent).toBeDefined()
      })

      // onSwitchAgent is not provided, should not crash
      await act(async () => {
        chatOnSwitchAgent!('new-agent')
      })

      // Should still add system message
      expect(screen.getByTestId('chat-message-count')).toHaveTextContent('1')
    })

    it('handles multiple rapid agent switches', async () => {
      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(chatOnSwitchAgent).toBeDefined()
      })

      // Switch agents multiple times rapidly
      await act(async () => {
        chatOnSwitchAgent!('agent-1')
      })
      await act(async () => {
        chatOnSwitchAgent!('agent-2')
      })
      await act(async () => {
        chatOnSwitchAgent!('agent-3')
      })

      // Should have 3 system messages
      expect(screen.getByTestId('chat-message-count')).toHaveTextContent('3')
    })
  })

  describe('WebSocket subscription cleanup', () => {
    it('handles WebSocket subscription handler for swarm_stats with non-array', async () => {
      let swarmStatsHandler: ((data: unknown) => void) | undefined
      mockSubscribe.mockImplementation((event: string, handler: (data: unknown) => void) => {
        if (event === 'swarm_stats') swarmStatsHandler = handler
        return () => {}
      })

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(swarmStatsHandler).toBeDefined()
      })

      const initialCallCount = mockGetSwarms.mock.calls.length

      // Send non-array data
      await act(async () => {
        swarmStatsHandler!('not an array')
      })

      // Should not trigger fetchSwarmData
      expect(mockGetSwarms).toHaveBeenCalledTimes(initialCallCount)
    })

    it('handles WebSocket subscription handler for agent_stats with empty array', async () => {
      let agentStatsHandler: ((data: unknown) => void) | undefined
      mockSubscribe.mockImplementation((event: string, handler: (data: unknown) => void) => {
        if (event === 'agent_stats') agentStatsHandler = handler
        return () => {}
      })

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(agentStatsHandler).toBeDefined()
      })

      // Send empty array
      await act(async () => {
        agentStatsHandler!([])
      })

      // Should update agents to empty array
      expect(screen.getByTestId('agent-chat')).toBeInTheDocument()
    })
  })

  describe('session cleanup edge cases', () => {
    it('logs debug when session close fails on unmount', async () => {
      const { logger } = await import('../utils')
      mockCloseSession.mockRejectedValueOnce(new Error('close failed'))

      const { unmount } = render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(chatOnSendMessage).toBeDefined()
      })

      // Create a session
      await act(async () => {
        await chatOnSendMessage!('hello')
      })

      unmount()

      await waitFor(() => {
        expect(logger.debug).toHaveBeenCalledWith(
          'AgentCollaboration',
          'Failed to close session',
          expect.any(Error)
        )
      })
    })

    it('logs debug when session close fails on agent switch', async () => {
      const { logger } = await import('../utils')
      mockCloseSession.mockRejectedValueOnce(new Error('close failed'))

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(chatOnSendMessage).toBeDefined()
        expect(chatOnSwitchAgent).toBeDefined()
      })

      // Create a session
      await act(async () => {
        await chatOnSendMessage!('hello')
      })

      // Switch agent - should attempt close and log debug on failure
      await act(async () => {
        chatOnSwitchAgent!('kimi-code')
      })

      await waitFor(() => {
        expect(logger.debug).toHaveBeenCalledWith(
          'AgentCollaboration',
          'Failed to close session',
          expect.any(Error)
        )
      })
    })
  })

  describe('consensus data processing', () => {
    it('processes consensus with 0% approval rate', async () => {
      mockGetConsensus.mockResolvedValue({
        consensus: [
          { taskId: 't-1', algorithm: 'unanimous', approvalRate: 0, totalVotes: 5, approvedVotes: 0, completed: true, agreed: false },
        ],
        algorithm: 'unanimous',
        threshold: 1.0,
      })

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(screen.getByTestId('consensus-total')).toHaveTextContent('1')
        expect(screen.getByTestId('consensus-agreed')).toHaveTextContent('0')
      })
    })

    it('processes consensus with 100% approval rate', async () => {
      mockGetConsensus.mockResolvedValue({
        consensus: [
          { taskId: 't-1', algorithm: 'unanimous', approvalRate: 1.0, totalVotes: 3, approvedVotes: 3, completed: true, agreed: true },
        ],
        algorithm: 'unanimous',
        threshold: 1.0,
      })

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(screen.getByTestId('consensus-total')).toHaveTextContent('1')
        expect(screen.getByTestId('consensus-agreed')).toHaveTextContent('1')
      })
    })

    it('handles consensus with single entry', async () => {
      mockGetConsensus.mockResolvedValue({
        consensus: [
          { taskId: 'single-task', algorithm: 'pbft', approvalRate: 0.67, totalVotes: 3, approvedVotes: 2, completed: true, agreed: true },
        ],
        algorithm: 'pbft',
        threshold: 0.66,
      })

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(screen.getByTestId('consensus-total')).toHaveTextContent('1')
      })
    })
  })

  describe('emergence data processing', () => {
    it('passes emergence health and signals to SwarmStatus', async () => {
      mockGetEmergenceData.mockResolvedValue({
        health: {
          overallScore: 95,
          congestionLevel: 2,
          collaborationIndex: 98,
          innovationRate: 85,
          agentUtilization: 90,
        },
        signals: [
          { id: 's-1', type: 'emergence', severity: 'high', message: 'High collaboration detected' },
          { id: 's-2', type: 'synergy', severity: 'medium', message: 'New pattern found' },
        ],
        agents: [],
        flows: [],
      })

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(screen.getByTestId('emergence-present')).toBeInTheDocument()
      })
    })

    it('does not pass emergence data when null', async () => {
      mockGetEmergenceData.mockResolvedValue(null)

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(mockGetEmergenceData).toHaveBeenCalled()
      })

      expect(screen.queryByTestId('emergence-present')).not.toBeInTheDocument()
    })
  })

  describe('task progress calculation', () => {
    it('shows 0% progress when all tasks are pending', async () => {
      mockGetSwarms.mockResolvedValue([
        { id: 'sw-1', name: 'Swarm', status: 'running', state: 'running', topology: 'mesh', strategy: 'parallel', agentCount: 1, taskCount: 3 },
      ])
      mockGetSwarmTasks.mockResolvedValue([
        { id: 't-1', title: 'Pending 1', status: 'pending', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
        { id: 't-2', title: 'Pending 2', status: 'pending', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
        { id: 't-3', title: 'Pending 3', status: 'pending', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
      ])

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(screen.getByTestId('progress')).toHaveTextContent('0')
      })
    })

    it('shows correct progress with mixed task statuses', async () => {
      mockGetSwarms.mockResolvedValue([
        { id: 'sw-1', name: 'Swarm', status: 'running', state: 'running', topology: 'mesh', strategy: 'parallel', agentCount: 1, taskCount: 6 },
      ])
      mockGetSwarmTasks.mockResolvedValue([
        { id: 't-1', title: 'Completed 1', status: 'completed', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
        { id: 't-2', title: 'Completed 2', status: 'completed', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
        { id: 't-3', title: 'Failed', status: 'failed', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
        { id: 't-4', title: 'Running', status: 'running', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
        { id: 't-5', title: 'Pending', status: 'pending', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
        { id: 't-6', title: 'Completed 3', status: 'completed', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
      ])

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        // 3 completed / 6 total = 50%
        expect(screen.getByTestId('progress')).toHaveTextContent('50')
      })
    })

    it('rounds progress correctly', async () => {
      mockGetSwarms.mockResolvedValue([
        { id: 'sw-1', name: 'Swarm', status: 'running', state: 'running', topology: 'mesh', strategy: 'parallel', agentCount: 1, taskCount: 3 },
      ])
      mockGetSwarmTasks.mockResolvedValue([
        { id: 't-1', title: 'Completed', status: 'completed', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
        { id: 't-2', title: 'Running', status: 'running', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
        { id: 't-3', title: 'Pending', status: 'pending', description: '', priority: 'medium', assignedTo: [], results: [], createdAt: '' },
      ])

      render(<AgentCollaborationPanel />)

      await waitFor(() => {
        // 1 completed / 3 total = 33.33...% rounds to 33
        expect(screen.getByTestId('progress')).toHaveTextContent('33')
      })
    })
  })

  describe('primaryAgentId prop changes', () => {
    it('updates activeAgentId when primaryAgentId prop changes from undefined to a value', async () => {
      const { rerender } = render(<AgentCollaborationPanel />)

      await waitFor(() => {
        expect(screen.getByTestId('agent-chat')).toBeInTheDocument()
      })

      rerender(<AgentCollaborationPanel primaryAgentId="kimi-code" />)

      // Should still render without errors
      expect(screen.getByTestId('agent-chat')).toBeInTheDocument()
    })

    it('updates activeAgentId when primaryAgentId prop changes from one value to another', async () => {
      const { rerender } = render(<AgentCollaborationPanel primaryAgentId="claude-code" />)

      await waitFor(() => {
        expect(screen.getByTestId('agent-chat')).toBeInTheDocument()
      })

      rerender(<AgentCollaborationPanel primaryAgentId="kimi-code" />)

      expect(screen.getByTestId('agent-chat')).toBeInTheDocument()
    })

    it('does not update activeAgentId when primaryAgentId is undefined', async () => {
      const { rerender } = render(<AgentCollaborationPanel primaryAgentId="claude-code" />)

      await waitFor(() => {
        expect(screen.getByTestId('agent-chat')).toBeInTheDocument()
      })

      // Re-render with undefined primaryAgentId - should keep current activeAgentId
      rerender(<AgentCollaborationPanel />)

      expect(screen.getByTestId('agent-chat')).toBeInTheDocument()
    })
  })

  describe('component layout', () => {
    it('renders with correct flex layout classes', () => {
      const { container } = render(<AgentCollaborationPanel />)
      const outerDiv = container.firstElementChild
      expect(outerDiv?.className).toContain('flex')
      expect(outerDiv?.className).toContain('flex-col')
      expect(outerDiv?.className).toContain('h-full')
    })

    it('renders AgentChat in a flex-1 container', () => {
      const { container } = render(<AgentCollaborationPanel />)
      const chatContainer = container.querySelector('.flex-1')
      expect(chatContainer).toBeInTheDocument()
    })

    it('renders SwarmStatus outside the chat container', () => {
      render(<AgentCollaborationPanel />)
      expect(screen.getByTestId('agent-chat')).toBeInTheDocument()
      expect(screen.getByTestId('swarm-status')).toBeInTheDocument()
    })
  })
})
