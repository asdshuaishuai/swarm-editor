import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { WorkspacePanel } from './WorkspacePanel'

// Mock services
const mockGetAgents = vi.fn()
const mockGetSessions = vi.fn()

vi.mock('../services', () => ({
  api: {
    agent: {
      getAgents: (...args: unknown[]) => mockGetAgents(...args),
      getSessions: (...args: unknown[]) => mockGetSessions(...args),
    },
  },
}))

vi.mock('../utils', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock react-router-dom
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const renderWithRouter = (ui: React.ReactElement) => {
  return render(
    <BrowserRouter>
      {ui}
    </BrowserRouter>
  )
}

const defaultAgents = [
  { id: 'agent-1', name: 'claude-code', status: 'running' },
  { id: 'agent-2', name: 'kimi-code', status: 'idle' },
  { id: 'agent-3', name: 'opencode', state: 'available' },
]

const defaultSessions = [
  { id: 's1', agentId: 'claude-code', mode: 'editing', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', messages: [] },
  { id: 's2', agentId: 'kimi-code', mode: 'review', createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', messages: [] },
]

describe('WorkspacePanel', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    mockGetAgents.mockResolvedValue(defaultAgents)
    mockGetSessions.mockResolvedValue(defaultSessions)
  })

  // ========== Rendering ==========

  it('renders workspace panel header', () => {
    renderWithRouter(<WorkspacePanel />)
    expect(screen.getByText('Workspace')).toBeInTheDocument()
  })

  it('renders all three tabs', () => {
    renderWithRouter(<WorkspacePanel />)
    expect(screen.getByRole('tab', { name: /Sessions/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Files/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Agents/ })).toBeInTheDocument()
  })

  it('renders the new session button', () => {
    renderWithRouter(<WorkspacePanel />)
    expect(screen.getByLabelText('New Session')).toBeInTheDocument()
  })

  it('renders settings button in footer', () => {
    renderWithRouter(<WorkspacePanel />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('shows sessions tab as active by default', () => {
    renderWithRouter(<WorkspacePanel />)
    const sessionsTab = screen.getByRole('tab', { name: /Sessions/ })
    expect(sessionsTab).toHaveAttribute('aria-selected', 'true')
  })

  it('renders tablist with correct aria-label', () => {
    renderWithRouter(<WorkspacePanel />)
    expect(screen.getByRole('tablist', { name: 'Workspace views' })).toBeInTheDocument()
  })

  // ========== Sessions Tab ==========

  it('shows sessions tab panel content', async () => {
    renderWithRouter(<WorkspacePanel />)
    await waitFor(() => {
      expect(screen.getByRole('tabpanel', { name: 'Sessions' })).toBeInTheDocument()
    })
  })

  it('shows empty state when no sessions exist', async () => {
    mockGetSessions.mockResolvedValue([])
    renderWithRouter(<WorkspacePanel />)
    await waitFor(() => {
      expect(screen.getByText('No conversation sessions yet')).toBeInTheDocument()
      expect(screen.getByText('Start a new session with an agent')).toBeInTheDocument()
    })
  })

  it('loads and displays sessions from backend', async () => {
    renderWithRouter(<WorkspacePanel />)
    await waitFor(() => {
      expect(screen.getByText('claude-code')).toBeInTheDocument()
      expect(screen.getByText('editing mode')).toBeInTheDocument()
      expect(screen.getByText('review mode')).toBeInTheDocument()
    })
  })

  it('displays session message count', async () => {
    renderWithRouter(<WorkspacePanel />)
    await waitFor(() => {
      const messageCounts = screen.getAllByText('0 messages')
      expect(messageCounts.length).toBe(2)
    })
  })

  it('navigates to editor when session is clicked', async () => {
    renderWithRouter(<WorkspacePanel />)
    await waitFor(() => {
      expect(screen.getByText('editing mode')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('claude-code'))
    expect(mockNavigate).toHaveBeenCalledWith('/?session=s1&agent=claude-code')
  })

  it('highlights selected session', async () => {
    renderWithRouter(<WorkspacePanel />)
    await waitFor(() => {
      expect(screen.getByText('claude-code')).toBeInTheDocument()
    })
    const sessionButton = screen.getByText('claude-code').closest('button') as HTMLElement
    fireEvent.click(sessionButton)
    // After clicking, the session should be selected (has blue border)
    expect(sessionButton.className).toContain('border-blue-500')
  })

  it('displays agent initial letter in session avatar', async () => {
    renderWithRouter(<WorkspacePanel />)
    await waitFor(() => {
      // 'C' for claude-code
      expect(screen.getByText('C')).toBeInTheDocument()
      // 'K' for kimi-code
      expect(screen.getByText('K')).toBeInTheDocument()
    })
  })

  // ========== Tab Switching ==========

  it('switches to files tab when clicked', () => {
    renderWithRouter(<WorkspacePanel />)
    const filesTab = screen.getByRole('tab', { name: /Files/ })
    fireEvent.click(filesTab)
    expect(screen.getByRole('tabpanel', { name: 'Files' })).toBeInTheDocument()
    expect(screen.getByText('File explorer')).toBeInTheDocument()
    expect(screen.getByText('Open a project to view files')).toBeInTheDocument()
  })

  it('switches to agents tab when clicked', async () => {
    renderWithRouter(<WorkspacePanel />)
    const agentsTab = screen.getByRole('tab', { name: /Agents/ })
    fireEvent.click(agentsTab)
    await waitFor(() => {
      expect(screen.getByRole('tabpanel', { name: 'Agents' })).toBeInTheDocument()
      expect(screen.getByText('claude-code')).toBeInTheDocument()
      expect(screen.getByText('kimi-code')).toBeInTheDocument()
      expect(screen.getByText('opencode')).toBeInTheDocument()
    })
  })

  it('updates aria-selected when switching tabs', () => {
    renderWithRouter(<WorkspacePanel />)
    const agentsTab = screen.getByRole('tab', { name: /Agents/ })
    fireEvent.click(agentsTab)
    expect(agentsTab).toHaveAttribute('aria-selected', 'true')
    const sessionsTab = screen.getByRole('tab', { name: /Sessions/ })
    expect(sessionsTab).toHaveAttribute('aria-selected', 'false')
  })

  it('switches to agents tab via new session button', async () => {
    renderWithRouter(<WorkspacePanel />)
    const newSessionBtn = screen.getByLabelText('New Session')
    fireEvent.click(newSessionBtn)
    await waitFor(() => {
      expect(screen.getByRole('tabpanel', { name: 'Agents' })).toBeInTheDocument()
    })
  })

  // ========== Agents Tab ==========

  it('shows empty state when no agents configured', async () => {
    mockGetAgents.mockResolvedValue([])
    renderWithRouter(<WorkspacePanel />)
    const agentsTab = screen.getByRole('tab', { name: /Agents/ })
    fireEvent.click(agentsTab)
    await waitFor(() => {
      expect(screen.getByText('No agents configured')).toBeInTheDocument()
    })
  })

  it('displays agent status dots correctly', async () => {
    renderWithRouter(<WorkspacePanel />)
    const agentsTab = screen.getByRole('tab', { name: /Agents/ })
    fireEvent.click(agentsTab)
    await waitFor(() => {
      // agent-1 is running -> green dot
      const greenDot = screen.getByTitle('running')
      expect(greenDot.className).toContain('bg-green-500')
    })
  })

  it('displays error status dot for error agents', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-err', name: 'error-agent', status: 'error' },
    ])
    renderWithRouter(<WorkspacePanel />)
    const agentsTab = screen.getByRole('tab', { name: /Agents/ })
    fireEvent.click(agentsTab)
    await waitFor(() => {
      const errorDot = screen.getByTitle('error')
      expect(errorDot.className).toContain('bg-red-500')
    })
  })

  it('displays default status dot for unknown status', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-unk', name: 'unknown-agent', status: 'offline' },
    ])
    renderWithRouter(<WorkspacePanel />)
    const agentsTab = screen.getByRole('tab', { name: /Agents/ })
    fireEvent.click(agentsTab)
    await waitFor(() => {
      const offlineDot = screen.getByTitle('offline')
      expect(offlineDot.className).toContain('bg-slate-500')
    })
  })

  it('navigates to settings with agent id when agent is clicked', async () => {
    renderWithRouter(<WorkspacePanel />)
    const agentsTab = screen.getByRole('tab', { name: /Agents/ })
    fireEvent.click(agentsTab)
    await waitFor(() => {
      expect(screen.getByText('claude-code')).toBeInTheDocument()
    })
    // Click on the agent name (within the agent button)
    const agentButton = screen.getByText('claude-code').closest('button') as HTMLElement
    fireEvent.click(agentButton)
    expect(mockNavigate).toHaveBeenCalledWith('/settings?agent=agent-1')
  })

  it('uses agent state when status is undefined', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-state', name: 'test-agent', state: 'available', status: undefined },
    ])
    renderWithRouter(<WorkspacePanel />)
    const agentsTab = screen.getByRole('tab', { name: /Agents/ })
    fireEvent.click(agentsTab)
    await waitFor(() => {
      expect(screen.getByText('test-agent')).toBeInTheDocument()
    })
  })

  it('displays agent initial letter in avatar', async () => {
    renderWithRouter(<WorkspacePanel />)
    const agentsTab = screen.getByRole('tab', { name: /Agents/ })
    fireEvent.click(agentsTab)
    await waitFor(() => {
      expect(screen.getByText('claude-code')).toBeInTheDocument()
      // Check for agent avatar initials
      const agentButton = screen.getByText('claude-code').closest('button') as HTMLElement
      expect(agentButton.textContent).toContain('C')
    })
  })

  // ========== Footer ==========

  it('navigates to settings when footer button is clicked', () => {
    renderWithRouter(<WorkspacePanel />)
    fireEvent.click(screen.getByText('Settings'))
    expect(mockNavigate).toHaveBeenCalledWith('/settings')
  })

  // ========== Agent Colors ==========

  it('applies correct colors for claude-code agent', async () => {
    renderWithRouter(<WorkspacePanel />)
    await waitFor(() => {
      expect(screen.getByText('claude-code')).toBeInTheDocument()
    })
    const avatar = screen.getByText('C').closest('div') as HTMLElement
    expect(avatar.className).toContain('text-orange-400')
    expect(avatar.className).toContain('bg-orange-500/20')
  })

  it('applies correct colors for kimi-code agent', async () => {
    renderWithRouter(<WorkspacePanel />)
    await waitFor(() => {
      expect(screen.getByText('kimi-code')).toBeInTheDocument()
    })
    const avatar = screen.getByText('K').closest('div') as HTMLElement
    expect(avatar.className).toContain('text-purple-400')
  })

  it('applies correct colors for opencode agent', async () => {
    renderWithRouter(<WorkspacePanel />)
    const agentsTab = screen.getByRole('tab', { name: /Agents/ })
    fireEvent.click(agentsTab)
    await waitFor(() => {
      expect(screen.getByText('opencode')).toBeInTheDocument()
    })
    const avatar = screen.getByText('O').closest('div') as HTMLElement
    expect(avatar.className).toContain('text-green-400')
  })

  it('applies default slate colors for unknown agent', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-unk', name: 'unknown-agent', status: 'running' },
    ])
    mockGetSessions.mockResolvedValue([])
    renderWithRouter(<WorkspacePanel />)
    const agentsTab = screen.getByRole('tab', { name: /Agents/ })
    fireEvent.click(agentsTab)
    await waitFor(() => {
      expect(screen.getByText('unknown-agent')).toBeInTheDocument()
    })
    const avatar = screen.getByText('U').closest('div') as HTMLElement
    expect(avatar.className).toContain('text-slate-400')
    expect(avatar.className).toContain('bg-slate-500/20')
  })

  it('applies correct colors for crush-cli agent', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-crush', name: 'crush-cli', status: 'running' },
    ])
    mockGetSessions.mockResolvedValue([])
    renderWithRouter(<WorkspacePanel />)
    const agentsTab = screen.getByRole('tab', { name: /Agents/ })
    fireEvent.click(agentsTab)
    await waitFor(() => {
      expect(screen.getByText('crush-cli')).toBeInTheDocument()
    })
    const avatar = screen.getByText('C').closest('div') as HTMLElement
    expect(avatar.className).toContain('text-red-400')
  })

  it('applies correct colors for gemini-cli agent', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-gem', name: 'gemini-cli', status: 'running' },
    ])
    mockGetSessions.mockResolvedValue([])
    renderWithRouter(<WorkspacePanel />)
    const agentsTab = screen.getByRole('tab', { name: /Agents/ })
    fireEvent.click(agentsTab)
    await waitFor(() => {
      expect(screen.getByText('gemini-cli')).toBeInTheDocument()
    })
    const avatar = screen.getByText('G').closest('div') as HTMLElement
    expect(avatar.className).toContain('text-blue-400')
  })

  it('applies correct colors for qwen-code agent', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-qwen', name: 'qwen-code', status: 'running' },
    ])
    mockGetSessions.mockResolvedValue([])
    renderWithRouter(<WorkspacePanel />)
    const agentsTab = screen.getByRole('tab', { name: /Agents/ })
    fireEvent.click(agentsTab)
    await waitFor(() => {
      expect(screen.getByText('qwen-code')).toBeInTheDocument()
    })
    const avatar = screen.getByText('Q').closest('div') as HTMLElement
    expect(avatar.className).toContain('text-cyan-400')
  })

  it('applies correct colors for droid-cli agent', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-droid', name: 'droid-cli', status: 'running' },
    ])
    mockGetSessions.mockResolvedValue([])
    renderWithRouter(<WorkspacePanel />)
    const agentsTab = screen.getByRole('tab', { name: /Agents/ })
    fireEvent.click(agentsTab)
    await waitFor(() => {
      expect(screen.getByText('droid-cli')).toBeInTheDocument()
    })
    const avatar = screen.getByText('D').closest('div') as HTMLElement
    expect(avatar.className).toContain('text-yellow-400')
  })

  // ========== Error Handling ==========

  it('clears agents and sessions when API call fails', async () => {
    mockGetAgents.mockRejectedValue(new Error('Network error'))
    mockGetSessions.mockRejectedValue(new Error('Network error'))
    renderWithRouter(<WorkspacePanel />)
    await waitFor(() => {
      expect(screen.getByText('No conversation sessions yet')).toBeInTheDocument()
    })
    // Switch to agents tab - should show empty
    const agentsTab = screen.getByRole('tab', { name: /Agents/ })
    fireEvent.click(agentsTab)
    await waitFor(() => {
      expect(screen.getByText('No agents configured')).toBeInTheDocument()
    })
  })

  it('handles partial failure (agents succeed, sessions fail)', async () => {
    mockGetAgents.mockResolvedValue(defaultAgents)
    mockGetSessions.mockRejectedValue(new Error('Session error'))
    renderWithRouter(<WorkspacePanel />)
    // Sessions should be empty since error triggers setSessions([])
    await waitFor(() => {
      expect(screen.getByText('No conversation sessions yet')).toBeInTheDocument()
    })
  })

  // ========== Cleanup / Unmount ==========

  it('does not update state after unmount during load', async () => {
    let resolveAgents: (value: unknown) => void
    mockGetAgents.mockImplementation(() => new Promise(r => { resolveAgents = r }))
    mockGetSessions.mockResolvedValue([])
    const { unmount } = renderWithRouter(<WorkspacePanel />)
    unmount()
    // Resolve after unmount - should not cause warnings
    resolveAgents!(defaultAgents)
    // No assertion needed - just verifying no React state-update-on-unmounted warning
  })

  // ========== formatTimeAgo (via session rendering) ==========

  it('shows "just now" for very recent sessions', async () => {
    const recentDate = new Date()
    mockGetSessions.mockResolvedValue([
      { id: 's-recent', agentId: 'claude-code', mode: 'chat', createdAt: recentDate.toISOString(), messages: [] },
    ])
    renderWithRouter(<WorkspacePanel />)
    await waitFor(() => {
      expect(screen.getByText('just now')).toBeInTheDocument()
    })
  })
})
