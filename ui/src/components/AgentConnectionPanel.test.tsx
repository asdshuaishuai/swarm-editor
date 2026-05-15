import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AgentConnectionPanel } from './AgentConnectionPanel'

const mockGetAgents = vi.fn().mockResolvedValue([
  { id: 'claude-code', name: 'Claude Code', state: 'active', type: 'acp' },
  { id: 'kimi-code', name: 'Kimi Code', state: 'idle', type: 'acp' },
])
const mockStartAgent = vi.fn().mockResolvedValue({})
const mockStopAgent = vi.fn().mockResolvedValue({})
const mockSubscribe = vi.fn().mockReturnValue(() => {})

vi.mock('../services', () => ({
  api: {
    agent: {
      getAgents: (...args: unknown[]) => mockGetAgents(...args),
      startAgent: (...args: unknown[]) => mockStartAgent(...args),
      stopAgent: (...args: unknown[]) => mockStopAgent(...args),
    },
  },
}))

vi.mock('../services/websocket', () => ({
  getWebSocketClient: () => ({
    subscribe: mockSubscribe,
  }),
}))

afterEach(() => {
  vi.useRealTimers()
})

describe('AgentConnectionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAgents.mockResolvedValue([
      { id: 'claude-code', name: 'Claude Code', state: 'active', type: 'acp' },
      { id: 'kimi-code', name: 'Kimi Code', state: 'idle', type: 'acp' },
    ])
  })

  it('renders agent list from API', async () => {
    render(<AgentConnectionPanel />)

    await waitFor(() => {
      expect(screen.getByText('Claude Code')).toBeDefined()
      expect(screen.getByText('Kimi Code')).toBeDefined()
    })

    expect(screen.getByText('共 2 个 Agent')).toBeDefined()
  })

  it('shows connect button for idle agents', async () => {
    render(<AgentConnectionPanel />)

    await waitFor(() => {
      expect(screen.getByText('Kimi Code')).toBeDefined()
    })

    // Kimi Code is idle, should show connect button
    const connectButtons = screen.getAllByText('连接')
    expect(connectButtons.length).toBeGreaterThan(0)
  })

  it('shows disconnect button for active agents', async () => {
    render(<AgentConnectionPanel />)

    await waitFor(() => {
      expect(screen.getByText('Claude Code')).toBeDefined()
    })

    // Claude Code is active, should show disconnect button
    const disconnectButtons = screen.getAllByText('断开')
    expect(disconnectButtons.length).toBeGreaterThan(0)
  })

  it('calls api.agent.startAgent() on connect click', async () => {
    render(<AgentConnectionPanel />)

    await waitFor(() => {
      expect(screen.getByText('Kimi Code')).toBeDefined()
    })

    // Click the connect button (for the idle agent - Kimi Code)
    const connectButtons = screen.getAllByText('连接')
    fireEvent.click(connectButtons[0])

    await waitFor(() => {
      expect(mockStartAgent).toHaveBeenCalledWith('kimi-code')
    })
  })

  it('calls api.agent.stopAgent() on disconnect click', async () => {
    render(<AgentConnectionPanel />)

    await waitFor(() => {
      expect(screen.getByText('Claude Code')).toBeDefined()
    })

    // Click the disconnect button (for the active agent - Claude Code)
    const disconnectButtons = screen.getAllByText('断开')
    fireEvent.click(disconnectButtons[0])

    await waitFor(() => {
      expect(mockStopAgent).toHaveBeenCalledWith('claude-code')
    })
  })

  it('subscribes to agent_stats WebSocket events', () => {
    render(<AgentConnectionPanel />)

    expect(mockSubscribe).toHaveBeenCalledWith('agent_stats', expect.any(Function))
  })

  it('shows loading state initially', () => {
    // Make getAgents hang to keep loading state
    mockGetAgents.mockReturnValue(new Promise(() => {}))

    render(<AgentConnectionPanel />)

    expect(screen.getByText('加载中...')).toBeDefined()
  })

  it('shows empty state when no agents', async () => {
    mockGetAgents.mockResolvedValue([])

    render(<AgentConnectionPanel />)

    await waitFor(() => {
      expect(screen.getByText('暂无 Agent 连接')).toBeDefined()
    })
  })

  it('calls onAgentSelect when agent row is clicked', async () => {
    const onAgentSelect = vi.fn()
    render(<AgentConnectionPanel onAgentSelect={onAgentSelect} />)

    await waitFor(() => {
      expect(screen.getByText('Claude Code')).toBeDefined()
    })

    fireEvent.click(screen.getByText('Claude Code').closest('[class*="cursor-pointer"]')!)

    expect(onAgentSelect).toHaveBeenCalledWith('claude-code')
  })

  it('unsubscribes from WebSocket on unmount', () => {
    const mockUnsub = vi.fn()
    mockSubscribe.mockReturnValue(mockUnsub)

    const { unmount } = render(<AgentConnectionPanel />)
    unmount()

    expect(mockUnsub).toHaveBeenCalled()
  })
})
