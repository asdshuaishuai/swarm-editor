import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AgentConnectionPanel } from './AgentConnectionPanel'

const mockGetAgents = vi.fn()
const mockStartAgent = vi.fn()
const mockStopAgent = vi.fn()
const mockSubscribe = vi.fn()

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

vi.mock('../utils', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const defaultAgents = [
  { id: 'claude-code', name: 'Claude Code', state: 'active', type: 'acp', description: 'AI coding assistant' },
  { id: 'kimi-code', name: 'Kimi Code', state: 'idle', type: 'acp' },
]

describe('AgentConnectionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAgents.mockResolvedValue([...defaultAgents])
    mockStartAgent.mockResolvedValue({})
    mockStopAgent.mockResolvedValue({})
    mockSubscribe.mockReturnValue(vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('loading state', () => {
    it('shows loading state initially', () => {
      mockGetAgents.mockReturnValue(new Promise(() => {}))
      render(<AgentConnectionPanel />)
      expect(screen.getByText('加载中...')).toBeInTheDocument()
    })

    it('removes loading state after agents are fetched', async () => {
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.queryByText('加载中...')).not.toBeInTheDocument()
      })
    })
  })

  describe('agent list rendering', () => {
    it('renders agent list from API', async () => {
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument()
        expect(screen.getByText('Kimi Code')).toBeInTheDocument()
      })

      expect(screen.getByText('共 2 个 Agent')).toBeInTheDocument()
    })

    it('renders agent description when present', async () => {
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('AI coding assistant')).toBeInTheDocument()
      })
    })

    it('does not render description when agent has no description', async () => {
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Kimi Code')).toBeInTheDocument()
      })

      // Kimi Code has no description - verify no description text for it
      const descElements = screen.queryAllByText('AI coding assistant')
      // Only one agent has a description
      expect(descElements).toHaveLength(1)
    })

    it('shows empty state when no agents', async () => {
      mockGetAgents.mockResolvedValue([])
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('暂无 Agent 连接')).toBeInTheDocument()
      })
      expect(screen.getByText('配置文件: ~/.swarm-editor/agents.json')).toBeInTheDocument()
    })

    it('shows agent count in footer', async () => {
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('共 2 个 Agent')).toBeInTheDocument()
      })
    })

    it('shows 0 agents in footer for empty list', async () => {
      mockGetAgents.mockResolvedValue([])
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('共 0 个 Agent')).toBeInTheDocument()
      })
    })
  })

  describe('status display', () => {
    it('shows 已连接 for active state', async () => {
      render(<AgentConnectionPanel />)
      await waitFor(() => {
        expect(screen.getByText('已连接')).toBeInTheDocument()
      })
    })

    it('shows 已连接 for connected state', async () => {
      mockGetAgents.mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', state: 'connected', type: 'acp' },
      ])
      render(<AgentConnectionPanel />)
      await waitFor(() => {
        expect(screen.getByText('已连接')).toBeInTheDocument()
      })
    })

    it('shows 执行中 for executing state', async () => {
      mockGetAgents.mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', state: 'executing', type: 'acp' },
      ])
      render(<AgentConnectionPanel />)
      await waitFor(() => {
        expect(screen.getByText('执行中')).toBeInTheDocument()
      })
    })

    it('shows 空闲 for idle state', async () => {
      render(<AgentConnectionPanel />)
      await waitFor(() => {
        expect(screen.getByText('空闲')).toBeInTheDocument()
      })
    })

    it('shows 忙碌 for busy state', async () => {
      mockGetAgents.mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', state: 'busy', type: 'acp' },
      ])
      render(<AgentConnectionPanel />)
      await waitFor(() => {
        expect(screen.getByText('忙碌')).toBeInTheDocument()
      })
    })

    it('shows 忙碌 for thinking state', async () => {
      mockGetAgents.mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', state: 'thinking', type: 'acp' },
      ])
      render(<AgentConnectionPanel />)
      await waitFor(() => {
        expect(screen.getByText('忙碌')).toBeInTheDocument()
      })
    })

    it('shows 错误 for error state', async () => {
      mockGetAgents.mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', state: 'error', type: 'acp' },
      ])
      render(<AgentConnectionPanel />)
      await waitFor(() => {
        expect(screen.getByText('错误')).toBeInTheDocument()
      })
    })

    it('shows 离线 for unknown state', async () => {
      mockGetAgents.mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', state: 'unknown_state', type: 'acp' },
      ])
      render(<AgentConnectionPanel />)
      await waitFor(() => {
        expect(screen.getByText('离线')).toBeInTheDocument()
      })
    })
  })

  describe('connect button', () => {
    it('shows connect button for idle agents', async () => {
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Kimi Code')).toBeInTheDocument()
      })

      const connectButtons = screen.getAllByText('连接')
      expect(connectButtons.length).toBeGreaterThan(0)
    })

    it('shows connect button for offline agents', async () => {
      mockGetAgents.mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', state: 'offline', type: 'acp' },
      ])
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('连接')).toBeInTheDocument()
      })
    })

    it('calls api.agent.startAgent() on connect click', async () => {
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Kimi Code')).toBeInTheDocument()
      })

      const connectButtons = screen.getAllByText('连接')
      fireEvent.click(connectButtons[0])

      await waitFor(() => {
        expect(mockStartAgent).toHaveBeenCalledWith('kimi-code')
      })
    })

    it('shows 连接中... while connecting', async () => {
      mockStartAgent.mockReturnValue(new Promise(() => {}))
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Kimi Code')).toBeInTheDocument()
      })

      const connectButtons = screen.getAllByText('连接')
      fireEvent.click(connectButtons[0])

      await waitFor(() => {
        expect(screen.getByText('连接中...')).toBeInTheDocument()
      })
    })

    it('disables connect button while connecting', async () => {
      mockStartAgent.mockReturnValue(new Promise(() => {}))
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Kimi Code')).toBeInTheDocument()
      })

      const connectButtons = screen.getAllByText('连接')
      fireEvent.click(connectButtons[0])

      await waitFor(() => {
        const connectingButton = screen.getByText('连接中...')
        expect(connectingButton.closest('button')).toHaveAttribute('disabled')
      })
    })

    it('refreshes agent list after successful connect', async () => {
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Kimi Code')).toBeInTheDocument()
      })

      const initialCallCount = mockGetAgents.mock.calls.length

      const connectButtons = screen.getAllByText('连接')
      fireEvent.click(connectButtons[0])

      await waitFor(() => {
        expect(mockGetAgents).toHaveBeenCalledTimes(initialCallCount + 1)
      })
    })

    it('logs error on connect failure', async () => {
      const { logger } = await import('../utils')
      mockStartAgent.mockRejectedValue(new Error('Connection failed'))
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Kimi Code')).toBeInTheDocument()
      })

      const connectButtons = screen.getAllByText('连接')
      fireEvent.click(connectButtons[0])

      await waitFor(() => {
        expect(logger.error).toHaveBeenCalledWith('Failed to connect agent:', expect.any(Error))
      })
    })

    it('stops showing connecting state after connect failure', async () => {
      mockStartAgent.mockRejectedValue(new Error('Connection failed'))
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Kimi Code')).toBeInTheDocument()
      })

      const connectButtons = screen.getAllByText('连接')
      fireEvent.click(connectButtons[0])

      await waitFor(() => {
        expect(screen.queryByText('连接中...')).not.toBeInTheDocument()
      })
    })
  })

  describe('disconnect button', () => {
    it('shows disconnect button for active agents', async () => {
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument()
      })

      const disconnectButtons = screen.getAllByText('断开')
      expect(disconnectButtons.length).toBeGreaterThan(0)
    })

    it('shows disconnect button for executing agents', async () => {
      mockGetAgents.mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', state: 'executing', type: 'acp' },
      ])
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('断开')).toBeInTheDocument()
      })
    })

    it('shows disconnect button for busy agents', async () => {
      mockGetAgents.mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', state: 'busy', type: 'acp' },
      ])
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('断开')).toBeInTheDocument()
      })
    })

    it('calls api.agent.stopAgent() on disconnect click', async () => {
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument()
      })

      const disconnectButtons = screen.getAllByText('断开')
      fireEvent.click(disconnectButtons[0])

      await waitFor(() => {
        expect(mockStopAgent).toHaveBeenCalledWith('claude-code')
      })
    })

    it('shows 断开中... while disconnecting', async () => {
      mockStopAgent.mockReturnValue(new Promise(() => {}))
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument()
      })

      const disconnectButtons = screen.getAllByText('断开')
      fireEvent.click(disconnectButtons[0])

      await waitFor(() => {
        expect(screen.getByText('断开中...')).toBeInTheDocument()
      })
    })

    it('logs error on disconnect failure', async () => {
      const { logger } = await import('../utils')
      mockStopAgent.mockRejectedValue(new Error('Disconnect failed'))
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument()
      })

      const disconnectButtons = screen.getAllByText('断开')
      fireEvent.click(disconnectButtons[0])

      await waitFor(() => {
        expect(logger.error).toHaveBeenCalledWith('Failed to disconnect agent:', expect.any(Error))
      })
    })

    it('stops showing disconnecting state after disconnect failure', async () => {
      mockStopAgent.mockRejectedValue(new Error('Disconnect failed'))
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument()
      })

      const disconnectButtons = screen.getAllByText('断开')
      fireEvent.click(disconnectButtons[0])

      await waitFor(() => {
        expect(screen.queryByText('断开中...')).not.toBeInTheDocument()
      })
    })

    it('refreshes agent list after successful disconnect', async () => {
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument()
      })

      const initialCallCount = mockGetAgents.mock.calls.length

      const disconnectButtons = screen.getAllByText('断开')
      fireEvent.click(disconnectButtons[0])

      await waitFor(() => {
        expect(mockGetAgents).toHaveBeenCalledTimes(initialCallCount + 1)
      })
    })
  })

  describe('refresh', () => {
    it('renders refresh button', async () => {
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByTitle('刷新')).toBeInTheDocument()
      })
    })

    it('calls fetchAgents when refresh button is clicked', async () => {
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument()
      })

      const initialCallCount = mockGetAgents.mock.calls.length

      fireEvent.click(screen.getByTitle('刷新'))

      await waitFor(() => {
        expect(mockGetAgents).toHaveBeenCalledTimes(initialCallCount + 1)
      })
    })

    it('refreshes agents periodically every 10 seconds', async () => {
      vi.useFakeTimers()
      render(<AgentConnectionPanel />)

      // First fetch happens on mount - wait for it with fake timers
      await vi.advanceTimersByTimeAsync(0)

      const callCountAfterMount = mockGetAgents.mock.calls.length

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000)
      })

      expect(mockGetAgents.mock.calls.length).toBeGreaterThan(callCountAfterMount)
    })

    it('stops periodic refresh on unmount', async () => {
      vi.useFakeTimers()
      const { unmount } = render(<AgentConnectionPanel />)

      await vi.advanceTimersByTimeAsync(0)

      const callCountAtUnmount = mockGetAgents.mock.calls.length
      unmount()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000)
      })

      expect(mockGetAgents).toHaveBeenCalledTimes(callCountAtUnmount)
    })
  })

  describe('WebSocket subscription', () => {
    it('subscribes to agent_stats WebSocket events', () => {
      render(<AgentConnectionPanel />)
      expect(mockSubscribe).toHaveBeenCalledWith('agent_stats', expect.any(Function))
    })

    it('updates agent list when WebSocket sends agent_stats', async () => {
      let statsCallback: ((data: unknown) => void) = () => {}
      mockSubscribe.mockImplementation((channel: string, cb: (data: unknown) => void) => {
        if (channel === 'agent_stats') {
          statsCallback = cb
        }
        return vi.fn()
      })

      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument()
      })

      act(() => {
        statsCallback([
          { id: 'new-agent', name: 'New Agent', state: 'active', type: 'acp' },
        ])
      })

      await waitFor(() => {
        expect(screen.getByText('New Agent')).toBeInTheDocument()
      })
    })

    it('ignores non-array WebSocket data', async () => {
      let statsCallback: ((data: unknown) => void) = () => {}
      mockSubscribe.mockImplementation((channel: string, cb: (data: unknown) => void) => {
        if (channel === 'agent_stats') {
          statsCallback = cb
        }
        return vi.fn()
      })

      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument()
      })

      act(() => {
        statsCallback({ not: 'an array' })
      })

      // Original agents should still be rendered
      expect(screen.getByText('Claude Code')).toBeInTheDocument()
      expect(screen.getByText('Kimi Code')).toBeInTheDocument()
    })

    it('unsubscribes from WebSocket on unmount', () => {
      const mockUnsub = vi.fn()
      mockSubscribe.mockReturnValue(mockUnsub)

      const { unmount } = render(<AgentConnectionPanel />)
      unmount()

      expect(mockUnsub).toHaveBeenCalled()
    })
  })

  describe('onAgentSelect callback', () => {
    it('calls onAgentSelect when agent row is clicked', async () => {
      const onAgentSelect = vi.fn()
      render(<AgentConnectionPanel onAgentSelect={onAgentSelect} />)

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Claude Code').closest('[class*="cursor-pointer"]')!)

      expect(onAgentSelect).toHaveBeenCalledWith('claude-code')
    })

    it('does not call onAgentSelect when not provided', async () => {
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument()
      })

      // Should not throw when clicking without onAgentSelect
      const row = screen.getByText('Claude Code').closest('[class*="cursor-pointer"]')!
      expect(() => fireEvent.click(row)).not.toThrow()
    })

    it('does not call onAgentSelect when connect button is clicked (stopPropagation)', async () => {
      const onAgentSelect = vi.fn()
      render(<AgentConnectionPanel onAgentSelect={onAgentSelect} />)

      await waitFor(() => {
        expect(screen.getByText('Kimi Code')).toBeInTheDocument()
      })

      const connectButtons = screen.getAllByText('连接')
      fireEvent.click(connectButtons[0])

      // onAgentSelect should NOT have been called because stopPropagation
      expect(onAgentSelect).not.toHaveBeenCalled()
    })

    it('does not call onAgentSelect when disconnect button is clicked (stopPropagation)', async () => {
      const onAgentSelect = vi.fn()
      render(<AgentConnectionPanel onAgentSelect={onAgentSelect} />)

      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument()
      })

      const disconnectButtons = screen.getAllByText('断开')
      fireEvent.click(disconnectButtons[0])

      expect(onAgentSelect).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('logs error when getAgents fails', async () => {
      const { logger } = await import('../utils')
      mockGetAgents.mockRejectedValue(new Error('Network error'))
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(logger.error).toHaveBeenCalledWith('Failed to fetch agents:', expect.any(Error))
      })
    })

    it('removes loading state even when getAgents fails', async () => {
      mockGetAgents.mockRejectedValue(new Error('Network error'))
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.queryByText('加载中...')).not.toBeInTheDocument()
      })
    })
  })

  describe('status dot color classes', () => {
    it('applies bg-success for active state', async () => {
      mockGetAgents.mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', state: 'active', type: 'acp' },
      ])
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Agent 1')).toBeInTheDocument()
      })

      const dot = screen.getByText('Agent 1').closest('div')!.querySelector('.bg-success')
      expect(dot).toBeInTheDocument()
    })

    it('applies bg-info for idle state', async () => {
      mockGetAgents.mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', state: 'idle', type: 'acp' },
      ])
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Agent 1')).toBeInTheDocument()
      })

      const dot = screen.getByText('Agent 1').closest('div')!.querySelector('.bg-info')
      expect(dot).toBeInTheDocument()
    })

    it('applies bg-warning for busy state', async () => {
      mockGetAgents.mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', state: 'busy', type: 'acp' },
      ])
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Agent 1')).toBeInTheDocument()
      })

      const dot = screen.getByText('Agent 1').closest('div')!.querySelector('.bg-warning')
      expect(dot).toBeInTheDocument()
    })

    it('applies bg-error for error state', async () => {
      mockGetAgents.mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', state: 'error', type: 'acp' },
      ])
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Agent 1')).toBeInTheDocument()
      })

      const dot = screen.getByText('Agent 1').closest('div')!.querySelector('.bg-error')
      expect(dot).toBeInTheDocument()
    })

    it('applies bg-text-muted for unknown state', async () => {
      mockGetAgents.mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', state: 'unknown_state', type: 'acp' },
      ])
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Agent 1')).toBeInTheDocument()
      })

      const dot = screen.getByText('Agent 1').closest('div')!.querySelector('.bg-text-muted')
      expect(dot).toBeInTheDocument()
    })

    it('applies bg-success for connected state', async () => {
      mockGetAgents.mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', state: 'connected', type: 'acp' },
      ])
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Agent 1')).toBeInTheDocument()
      })

      const dot = screen.getByText('Agent 1').closest('div')!.querySelector('.bg-success')
      expect(dot).toBeInTheDocument()
    })

    it('applies bg-success for executing state', async () => {
      mockGetAgents.mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', state: 'executing', type: 'acp' },
      ])
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Agent 1')).toBeInTheDocument()
      })

      const dot = screen.getByText('Agent 1').closest('div')!.querySelector('.bg-success')
      expect(dot).toBeInTheDocument()
    })

    it('applies bg-warning for thinking state', async () => {
      mockGetAgents.mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', state: 'thinking', type: 'acp' },
      ])
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Agent 1')).toBeInTheDocument()
      })

      const dot = screen.getByText('Agent 1').closest('div')!.querySelector('.bg-warning')
      expect(dot).toBeInTheDocument()
    })
  })

  describe('header', () => {
    it('renders Agent 连接 header', async () => {
      render(<AgentConnectionPanel />)

      await waitFor(() => {
        expect(screen.getByText('Agent 连接')).toBeInTheDocument()
      })
    })
  })
})
