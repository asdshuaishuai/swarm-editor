import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AgentSessionPanel, getStatusColor, getStatusText, formatTime } from './AgentSessionPanel'

const { mockGetSessions } = vi.hoisted(() => ({
  mockGetSessions: vi.fn(),
}))

vi.mock('../services', () => ({
  api: {
    agent: {
      getSessions: mockGetSessions,
    },
  },
}))

// Helper to create a session object
function makeSession(overrides: Partial<{
  id: string
  agentId: string
  agentName: string
  messages: Array<{ role: string; content: string; timestamp: string }>
  createdAt: string
  updatedAt: string
}> = {}) {
  return {
    id: overrides.id ?? 'session-1',
    agentId: overrides.agentId ?? 'agent-x',
    agentName: overrides.agentName ?? 'Agent X',
    mode: 'default',
    messages: overrides.messages ?? [],
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
  }
}

describe('AgentSessionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state initially', () => {
    mockGetSessions.mockReturnValue(new Promise(() => {})) // never resolves
    render(<AgentSessionPanel />)

    expect(screen.getByText('加载中...')).toBeInTheDocument()
  })

  it('renders session list from API', async () => {
    mockGetSessions.mockResolvedValue([
      {
        id: 'session-1',
        agentId: 'claude-code',
        agentName: 'Claude Code',
        mode: 'default',
        messages: [{ role: 'user', content: 'hello', timestamp: new Date().toISOString() }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'session-2',
        agentId: 'kimi-code',
        agentName: 'Kimi Code',
        mode: 'default',
        messages: [
          { role: 'user', content: 'hi', timestamp: new Date().toISOString() },
          { role: 'assistant', content: 'hello', timestamp: new Date().toISOString() },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])

    render(<AgentSessionPanel />)

    await waitFor(() => {
      expect(screen.getByText('Claude Code')).toBeInTheDocument()
      expect(screen.getByText('Kimi Code')).toBeInTheDocument()
    })

    expect(screen.getByText('1 条消息')).toBeInTheDocument()
    expect(screen.getByText('2 条消息')).toBeInTheDocument()
    expect(screen.getByText('共 2 个会话')).toBeInTheDocument()
  })

  it('shows empty state when no sessions', async () => {
    mockGetSessions.mockResolvedValue([])

    render(<AgentSessionPanel />)

    await waitFor(() => {
      expect(screen.getByText('暂无会话')).toBeInTheDocument()
    })

    expect(screen.getByText('共 0 个会话')).toBeInTheDocument()
  })

  it('calls onSessionSelect on click', async () => {
    mockGetSessions.mockResolvedValue([
      {
        id: 'session-1',
        agentId: 'claude-code',
        agentName: 'Claude Code',
        mode: 'default',
        messages: [{ role: 'user', content: 'hello', timestamp: new Date().toISOString() }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])

    const onSessionSelect = vi.fn()
    render(<AgentSessionPanel onSessionSelect={onSessionSelect} />)

    await waitFor(() => {
      expect(screen.getByText('Claude Code')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Claude Code').closest('.cursor-pointer')!)

    expect(onSessionSelect).toHaveBeenCalledWith('session-1')
  })

  it('shows error fallback when API fails', async () => {
    mockGetSessions.mockRejectedValue(new Error('Network error'))

    render(<AgentSessionPanel />)

    await waitFor(() => {
      expect(screen.getByText('暂无会话')).toBeInTheDocument()
    })

    expect(screen.getByText('共 0 个会话')).toBeInTheDocument()
  })

  it('displays session status text', async () => {
    mockGetSessions.mockResolvedValue([
      {
        id: 'session-1',
        agentId: 'claude-code',
        agentName: 'Claude Code',
        mode: 'default',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])

    render(<AgentSessionPanel />)

    await waitFor(() => {
      // Mapped sessions always have 'active' status
      expect(screen.getByText('活跃')).toBeInTheDocument()
    })
  })

  it('displays header with session history label', async () => {
    mockGetSessions.mockResolvedValue([])

    render(<AgentSessionPanel />)

    await waitFor(() => {
      expect(screen.getByText('会话历史')).toBeInTheDocument()
    })
  })

  // --- formatTime branches ---

  it('shows "刚刚" for very recent sessions (< 1 minute)', async () => {
    const now = new Date()
    mockGetSessions.mockResolvedValue([makeSession({ updatedAt: now.toISOString() })])

    render(<AgentSessionPanel />)

    await waitFor(() => {
      expect(screen.getByText('刚刚')).toBeInTheDocument()
    })
  })

  it('shows minutes ago for sessions within the last hour', async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
    mockGetSessions.mockResolvedValue([makeSession({ updatedAt: fiveMinAgo.toISOString() })])

    render(<AgentSessionPanel />)

    await waitFor(() => {
      expect(screen.getByText('5 分钟前')).toBeInTheDocument()
    })
  })

  it('shows hours ago for sessions within the last day', async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000)
    mockGetSessions.mockResolvedValue([makeSession({ updatedAt: threeHoursAgo.toISOString() })])

    render(<AgentSessionPanel />)

    await waitFor(() => {
      expect(screen.getByText('3 小时前')).toBeInTheDocument()
    })
  })

  it('shows days ago for sessions older than a day', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400 * 1000)
    mockGetSessions.mockResolvedValue([makeSession({ updatedAt: twoDaysAgo.toISOString() })])

    render(<AgentSessionPanel />)

    await waitFor(() => {
      expect(screen.getByText('2 天前')).toBeInTheDocument()
    })
  })

  // --- getStatusColor branches via CSS class ---

  it('renders active status dot with bg-success class', async () => {
    mockGetSessions.mockResolvedValue([makeSession()])

    render(<AgentSessionPanel />)

    await waitFor(() => {
      expect(screen.getByText('活跃')).toBeInTheDocument()
    })

    // The mapping always produces 'active', which maps to 'bg-success'
    const dot = document.querySelector('.bg-success')
    expect(dot).toBeInTheDocument()
    expect(dot).toHaveClass('rounded-full')
  })

  // --- Fallback to agentId when agentName is missing ---

  it('falls back to agentId when agentName is empty', async () => {
    mockGetSessions.mockResolvedValue([makeSession({ agentId: 'fallback-agent', agentName: '' })])

    render(<AgentSessionPanel />)

    await waitFor(() => {
      // agentName is empty string, which is falsy, so || returns agentId
      expect(screen.getByText('fallback-agent')).toBeInTheDocument()
    })
  })

  // --- Session with no messages property ---

  it('shows 0 messages when messages is undefined', async () => {
    const session = makeSession()
    delete (session as Record<string, unknown>).messages

    mockGetSessions.mockResolvedValue([session])

    render(<AgentSessionPanel />)

    await waitFor(() => {
      expect(screen.getByText('0 条消息')).toBeInTheDocument()
    })
  })

  // --- Refresh button ---

  it('has a refresh button with title "刷新"', async () => {
    mockGetSessions.mockResolvedValue([])

    render(<AgentSessionPanel />)

    await waitFor(() => {
      expect(screen.getByTitle('刷新')).toBeInTheDocument()
    })
  })

  it('re-fetches sessions when refresh button is clicked', async () => {
    mockGetSessions.mockResolvedValue([])

    render(<AgentSessionPanel />)

    await waitFor(() => {
      expect(screen.getByText('暂无会话')).toBeInTheDocument()
    })

    expect(mockGetSessions).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTitle('刷新'))

    await waitFor(() => {
      expect(mockGetSessions).toHaveBeenCalledTimes(2)
    })
  })

  // --- onSessionSelect not provided ---

  it('does not crash when onSessionSelect is not provided and a session is clicked', async () => {
    mockGetSessions.mockResolvedValue([makeSession()])

    render(<AgentSessionPanel />)

    await waitFor(() => {
      expect(screen.getByText('Agent X')).toBeInTheDocument()
    })

    // Click the session row - should not throw since onSessionSelect is optional
    const row = screen.getByText('Agent X').closest('.cursor-pointer')!
    expect(() => fireEvent.click(row)).not.toThrow()
  })

  // --- Session list rendering detail ---

  it('renders the emoji in empty state', async () => {
    mockGetSessions.mockResolvedValue([])

    render(<AgentSessionPanel />)

    await waitFor(() => {
      expect(screen.getByText('暂无会话')).toBeInTheDocument()
    })

    expect(screen.getByText('💬')).toBeInTheDocument()
  })

  it('renders session count in footer', async () => {
    mockGetSessions.mockResolvedValue([
      makeSession({ id: 's1', agentName: 'A1' }),
      makeSession({ id: 's2', agentName: 'A2' }),
      makeSession({ id: 's3', agentName: 'A3' }),
    ])

    render(<AgentSessionPanel />)

    await waitFor(() => {
      expect(screen.getByText('共 3 个会话')).toBeInTheDocument()
    })

    expect(screen.getByText('A1')).toBeInTheDocument()
    expect(screen.getByText('A2')).toBeInTheDocument()
    expect(screen.getByText('A3')).toBeInTheDocument()
  })

  // --- Agent name display ---

  it('shows agentName when provided', async () => {
    mockGetSessions.mockResolvedValue([makeSession({ agentId: 'some-id', agentName: 'Custom Name' })])

    render(<AgentSessionPanel />)

    await waitFor(() => {
      expect(screen.getByText('Custom Name')).toBeInTheDocument()
    })
  })

  // --- Multiple sessions with different times ---

  it('displays different time labels for sessions of different ages', async () => {
    const recent = new Date()
    const old = new Date(Date.now() - 2 * 86400 * 1000)

    mockGetSessions.mockResolvedValue([
      makeSession({ id: 's1', agentName: 'Recent', updatedAt: recent.toISOString() }),
      makeSession({ id: 's2', agentName: 'Old', updatedAt: old.toISOString() }),
    ])

    render(<AgentSessionPanel />)

    await waitFor(() => {
      expect(screen.getByText('Recent')).toBeInTheDocument()
      expect(screen.getByText('Old')).toBeInTheDocument()
    })

    expect(screen.getByText('刚刚')).toBeInTheDocument()
    expect(screen.getByText('2 天前')).toBeInTheDocument()
  })
})

describe('getStatusColor', () => {
  it('returns bg-success for active', () => {
    expect(getStatusColor('active')).toBe('bg-success')
  })

  it('returns bg-info for idle', () => {
    expect(getStatusColor('idle')).toBe('bg-info')
  })

  it('returns bg-text-muted for completed', () => {
    expect(getStatusColor('completed')).toBe('bg-text-muted')
  })

  it('returns bg-error for error', () => {
    expect(getStatusColor('error')).toBe('bg-error')
  })

  it('returns bg-text-muted for unknown status', () => {
    expect(getStatusColor('unknown')).toBe('bg-text-muted')
  })
})

describe('getStatusText', () => {
  it('returns 活跃 for active', () => {
    expect(getStatusText('active')).toBe('活跃')
  })

  it('returns 空闲 for idle', () => {
    expect(getStatusText('idle')).toBe('空闲')
  })

  it('returns 完成 for completed', () => {
    expect(getStatusText('completed')).toBe('完成')
  })

  it('returns 错误 for error', () => {
    expect(getStatusText('error')).toBe('错误')
  })

  it('returns 未知 for unknown status', () => {
    expect(getStatusText('unknown')).toBe('未知')
  })
})

describe('formatTime', () => {
  it('returns 刚刚 for less than 1 minute ago', () => {
    const now = new Date().toISOString()
    expect(formatTime(now)).toBe('刚刚')
  })

  it('returns minutes ago for less than 1 hour ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    expect(formatTime(fiveMinAgo)).toBe('5 分钟前')
  })

  it('returns hours ago for less than 1 day ago', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString()
    expect(formatTime(threeHoursAgo)).toBe('3 小时前')
  })

  it('returns days ago for more than 1 day ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400 * 1000).toISOString()
    expect(formatTime(twoDaysAgo)).toBe('2 天前')
  })

  it('returns 1 分钟前 for exactly 60 seconds ago', () => {
    const sixtySecAgo = new Date(Date.now() - 60000).toISOString()
    expect(formatTime(sixtySecAgo)).toBe('1 分钟前')
  })

  it('returns 1 小时前 for exactly 1 hour ago', () => {
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
    expect(formatTime(oneHourAgo)).toBe('1 小时前')
  })

  it('returns 1 天前 for exactly 1 day ago', () => {
    const oneDayAgo = new Date(Date.now() - 86400000).toISOString()
    expect(formatTime(oneDayAgo)).toBe('1 天前')
  })
})
