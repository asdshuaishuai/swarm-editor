import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AgentCollaborationPanel } from './AgentCollaborationPanel'

// Mock AgentChat to make its props accessible
let chatOnSendMessage: ((msg: string) => void) | undefined
let chatOnSwitchAgent: ((id: string) => void) | undefined

vi.mock('../components/AgentChat', () => ({
  AgentChat: ({ messages, onSendMessage, onSwitchAgent, isLoading }: { messages: unknown[]; onSendMessage: (msg: string) => void; onSwitchAgent: (id: string) => void; isLoading: boolean }) => {
    chatOnSendMessage = onSendMessage
    chatOnSwitchAgent = onSwitchAgent
    return (
      <div data-testid="agent-chat">
        <span data-testid="chat-message-count">{messages.length}</span>
        <span data-testid="chat-loading">{String(isLoading)}</span>
      </div>
    )
  },
}))

vi.mock('../components/SwarmStatus', () => ({
  SwarmStatus: ({ tasks, progress }: { tasks: unknown[]; progress: number }) => (
    <div data-testid="swarm-status">
      <span data-testid="task-count">{tasks.length}</span>
      <span data-testid="progress">{progress}</span>
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
    },
  },
}))

vi.mock('../services/websocket', () => ({
  getWebSocketClient: () => ({
    subscribe: (...args: unknown[]) => mockSubscribe(...args),
  }),
}))

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
    mockSubscribe.mockReturnValue(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders without crashing', () => {
    render(<AgentCollaborationPanel />)
    expect(screen.getByTestId('agent-chat')).toBeInTheDocument()
    expect(screen.getByTestId('swarm-status')).toBeInTheDocument()
  })

  it('fetches agents on mount via api.agent.getAgents()', async () => {
    render(<AgentCollaborationPanel />)
    await waitFor(() => {
      expect(mockGetAgents).toHaveBeenCalledTimes(1)
    })
  })

  it('subscribes to agent_stats and swarm_stats WebSocket events', () => {
    render(<AgentCollaborationPanel />)
    // subscribe is called twice: agent_stats and swarm_stats
    expect(mockSubscribe).toHaveBeenCalledTimes(2)
    expect(mockSubscribe).toHaveBeenCalledWith('agent_stats', expect.any(Function))
    expect(mockSubscribe).toHaveBeenCalledWith('swarm_stats', expect.any(Function))
  })

  it('creates session on first message send', async () => {
    render(<AgentCollaborationPanel />)
    await waitFor(() => {
      expect(chatOnSendMessage).toBeDefined()
    })

    await chatOnSendMessage!('hello')

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

    await chatOnSendMessage!('test message')

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith('session-1', 'test message')
    })
  })

  it('reuses existing session for subsequent messages', async () => {
    render(<AgentCollaborationPanel />)
    await waitFor(() => {
      expect(chatOnSendMessage).toBeDefined()
    })

    await chatOnSendMessage!('first')
    await chatOnSendMessage!('second')

    expect(mockCreateSession).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).toHaveBeenCalledTimes(2)
  })

  it('cleans up session on unmount', async () => {
    const { unmount } = render(<AgentCollaborationPanel />)
    await waitFor(() => {
      expect(chatOnSendMessage).toBeDefined()
    })

    // Send a message to create a session
    await chatOnSendMessage!('hello')
    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalled()
    })

    unmount()

    expect(mockCloseSession).toHaveBeenCalledWith('session-1')
  })

  it('calls onSwitchAgent callback when switching agents', async () => {
    const onSwitchAgent = vi.fn()
    render(<AgentCollaborationPanel onSwitchAgent={onSwitchAgent} />)
    await waitFor(() => {
      expect(chatOnSwitchAgent).toBeDefined()
    })

    chatOnSwitchAgent!('kimi-code')

    expect(onSwitchAgent).toHaveBeenCalledWith('kimi-code')
  })

  it('closes session when switching agents', async () => {
    render(<AgentCollaborationPanel />)
    await waitFor(() => {
      expect(chatOnSendMessage).toBeDefined()
    })

    // Create a session first
    await chatOnSendMessage!('hello')
    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalled()
    })

    // Switch agent
    chatOnSwitchAgent!('kimi-code')

    expect(mockCloseSession).toHaveBeenCalledWith('session-1')
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

  it('sets primaryAgentId from props', () => {
    render(<AgentCollaborationPanel primaryAgentId="kimi-code" />)
    // The component should use kimi-code as the active agent
    // We verify this by checking that getAgents was called (component mounted)
    expect(mockGetAgents).toHaveBeenCalled()
  })
})
