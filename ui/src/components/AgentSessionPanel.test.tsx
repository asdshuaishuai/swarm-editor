import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AgentSessionPanel } from './AgentSessionPanel'

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
})
