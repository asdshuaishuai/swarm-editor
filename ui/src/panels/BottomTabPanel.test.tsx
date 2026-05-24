import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { BottomTabPanel } from './BottomTabPanel'

// Mock dependencies
vi.mock('./AgentDispatchPanel', () => ({
  AgentDispatchPanel: () => <div data-testid="agent-dispatch-panel">AgentDispatchPanel</div>,
}))

vi.mock('../services', () => ({
  api: {
    agent: {
      getAgents: vi.fn().mockResolvedValue([]),
      createSession: vi.fn().mockResolvedValue({ id: 'session-1', agentId: 'agent-1', mode: 'default', messages: [], createdAt: '', updatedAt: '' }),
      sendMessage: vi.fn().mockResolvedValue({ sessionId: 'session-1', stopReason: 'complete', content: 'OK' }),
      closeSession: vi.fn().mockResolvedValue(undefined),
    },
  },
}))

vi.mock('../utils', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

import { api } from '../services'
import { logger } from '../utils'

// Helper: a full mock agent for getAgents
function mockAgent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'agent-1',
    name: 'Test Agent',
    type: 'cli',
    state: 'idle',
    ...overrides,
  }
}

// Helper: a full mock session for createSession
function mockSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    agentId: 'agent-1',
    mode: 'default',
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

// Helper: a full mock sendMessage response
function mockMessageResponse(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'session-1',
    stopReason: 'complete',
    content: 'OK',
    ...overrides,
  }
}

describe('BottomTabPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  // ==================== Tab Rendering ====================

  it('renders with default agents tab active', () => {
    render(<BottomTabPanel />)
    expect(screen.getByTestId('agent-dispatch-panel')).toBeInTheDocument()
  })

  it('renders both tab labels', () => {
    render(<BottomTabPanel />)
    expect(screen.getByText('Agents')).toBeInTheDocument()
    expect(screen.getByText('Console')).toBeInTheDocument()
  })

  it('applies custom height', () => {
    const { container } = render(<BottomTabPanel height={300} />)
    expect(container.firstChild).toHaveStyle({ height: '300px' })
  })

  it('applies default height of 200', () => {
    const { container } = render(<BottomTabPanel />)
    expect(container.firstChild).toHaveStyle({ height: '200px' })
  })

  it('renders tablist with correct aria-label', () => {
    render(<BottomTabPanel />)
    expect(screen.getByRole('tablist', { name: 'Bottom panel tabs' })).toBeInTheDocument()
  })

  it('renders both tab buttons with role tab', () => {
    render(<BottomTabPanel />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
  })

  it('marks agents tab as selected by default', () => {
    render(<BottomTabPanel />)
    const agentsTab = screen.getByRole('tab', { name: /Agents/ })
    expect(agentsTab).toHaveAttribute('aria-selected', 'true')
  })

  it('marks console tab as not selected by default', () => {
    render(<BottomTabPanel />)
    const consoleTab = screen.getByRole('tab', { name: /Console/ })
    expect(consoleTab).toHaveAttribute('aria-selected', 'false')
  })

  // ==================== Tab Switching ====================

  it('switches to console tab when clicked', async () => {
    const user = userEvent.setup()
    render(<BottomTabPanel />)

    await user.click(screen.getByText('Console'))
    expect(screen.getByPlaceholderText('Enter command...')).toBeInTheDocument()
  })

  it('marks console tab as selected after clicking', async () => {
    const user = userEvent.setup()
    render(<BottomTabPanel />)

    await user.click(screen.getByRole('tab', { name: /Console/ }))
    const consoleTab = screen.getByRole('tab', { name: /Console/ })
    expect(consoleTab).toHaveAttribute('aria-selected', 'true')
  })

  it('switches back to agents tab from console', async () => {
    const user = userEvent.setup()
    render(<BottomTabPanel />)

    await user.click(screen.getByText('Console'))
    expect(screen.getByPlaceholderText('Enter command...')).toBeInTheDocument()

    await user.click(screen.getByText('Agents'))
    expect(screen.getByTestId('agent-dispatch-panel')).toBeInTheDocument()
  })

  it('starts with console tab when defaultTab is console', () => {
    render(<BottomTabPanel defaultTab="console" />)
    expect(screen.getByPlaceholderText('Enter command...')).toBeInTheDocument()
    expect(screen.queryByTestId('agent-dispatch-panel')).not.toBeInTheDocument()
  })

  // ==================== Quick Action Buttons ====================

  it('renders Clear action button', () => {
    render(<BottomTabPanel />)
    expect(screen.getByLabelText('Clear')).toBeInTheDocument()
  })

  it('renders Maximize action button', () => {
    render(<BottomTabPanel />)
    expect(screen.getByLabelText('Maximize')).toBeInTheDocument()
  })

  it('clicking Clear button does not throw', () => {
    render(<BottomTabPanel />)
    const clearBtn = screen.getByLabelText('Clear')
    expect(() => fireEvent.click(clearBtn)).not.toThrow()
  })

  it('clicking Maximize button does not throw', () => {
    render(<BottomTabPanel />)
    const maxBtn = screen.getByLabelText('Maximize')
    expect(() => fireEvent.click(maxBtn)).not.toThrow()
  })

  // ==================== Console Panel ====================

  describe('Console Panel', () => {
    it('renders console empty state message', () => {
      render(<BottomTabPanel defaultTab="console" />)
      expect(screen.getByText('Console output will appear here')).toBeInTheDocument()
    })

    it('renders input field with correct placeholder', () => {
      render(<BottomTabPanel defaultTab="console" />)
      const input = screen.getByPlaceholderText('Enter command...')
      expect(input).toBeInTheDocument()
    })

    it('renders dollar sign prompt', () => {
      render(<BottomTabPanel defaultTab="console" />)
      expect(screen.getByText('$')).toBeInTheDocument()
    })

    it('updates input value on typing', async () => {
      const user = userEvent.setup()
      render(<BottomTabPanel defaultTab="console" />)

      const input = screen.getByPlaceholderText('Enter command...')
      await user.type(input, 'hello')
      expect(input).toHaveValue('hello')
    })

    it('renders console output area with role log', () => {
      render(<BottomTabPanel defaultTab="console" />)
      expect(screen.getByRole('log')).toBeInTheDocument()
    })

    it('renders console output area with aria-live polite', () => {
      render(<BottomTabPanel defaultTab="console" />)
      const log = screen.getByRole('log')
      expect(log).toHaveAttribute('aria-live', 'polite')
    })

    it('submits command on Enter key and shows command entry', async () => {
      const user = userEvent.setup()
      vi.mocked(api.agent.getAgents).mockResolvedValue([mockAgent()])
      vi.mocked(api.agent.createSession).mockResolvedValue(mockSession())
      vi.mocked(api.agent.sendMessage).mockResolvedValue(mockMessageResponse({ content: 'Command result' }))

      render(<BottomTabPanel defaultTab="console" />)

      const input = screen.getByPlaceholderText('Enter command...')
      await user.type(input, 'test command{Enter}')

      expect(screen.getByText('> test command')).toBeInTheDocument()
    })

    it('does not submit empty command on Enter', async () => {
      const user = userEvent.setup()
      render(<BottomTabPanel defaultTab="console" />)

      const input = screen.getByPlaceholderText('Enter command...')
      await user.click(input)
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(screen.getByText('Console output will appear here')).toBeInTheDocument()
      expect(api.agent.sendMessage).not.toHaveBeenCalled()
    })

    it('does not submit whitespace-only command on Enter', async () => {
      const user = userEvent.setup()
      render(<BottomTabPanel defaultTab="console" />)

      const input = screen.getByPlaceholderText('Enter command...')
      await user.type(input, '   ')
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(screen.getByText('Console output will appear here')).toBeInTheDocument()
      expect(api.agent.sendMessage).not.toHaveBeenCalled()
    })

    it('creates session on first command submission', async () => {
      const user = userEvent.setup()
      vi.mocked(api.agent.getAgents).mockResolvedValue([mockAgent()])
      vi.mocked(api.agent.createSession).mockResolvedValue(mockSession())
      vi.mocked(api.agent.sendMessage).mockResolvedValue(mockMessageResponse())

      render(<BottomTabPanel defaultTab="console" />)

      const input = screen.getByPlaceholderText('Enter command...')
      await user.type(input, 'cmd{Enter}')

      await waitFor(() => {
        expect(api.agent.getAgents).toHaveBeenCalled()
      })
      expect(api.agent.createSession).toHaveBeenCalledWith('agent-1', 'default')
    })

    it('uses fallback agent id when no agents returned', async () => {
      const user = userEvent.setup()
      vi.mocked(api.agent.getAgents).mockResolvedValue([])
      vi.mocked(api.agent.createSession).mockResolvedValue(mockSession())
      vi.mocked(api.agent.sendMessage).mockResolvedValue(mockMessageResponse())

      render(<BottomTabPanel defaultTab="console" />)

      const input = screen.getByPlaceholderText('Enter command...')
      await user.type(input, 'cmd{Enter}')

      await waitFor(() => {
        expect(api.agent.createSession).toHaveBeenCalledWith('claude-code', 'default')
      })
    })

    it('reuses existing session for subsequent commands', async () => {
      const user = userEvent.setup()
      vi.mocked(api.agent.getAgents).mockResolvedValue([mockAgent()])
      vi.mocked(api.agent.createSession).mockResolvedValue(mockSession())
      vi.mocked(api.agent.sendMessage).mockResolvedValue(mockMessageResponse())

      render(<BottomTabPanel defaultTab="console" />)

      const input = screen.getByPlaceholderText('Enter command...')
      await user.type(input, 'cmd1{Enter}')

      await waitFor(() => {
        expect(api.agent.sendMessage).toHaveBeenCalledTimes(1)
      })

      await user.type(input, 'cmd2{Enter}')

      await waitFor(() => {
        expect(api.agent.createSession).toHaveBeenCalledTimes(1)
        expect(api.agent.sendMessage).toHaveBeenCalledTimes(2)
      })
    })

    it('displays success response from agent', async () => {
      const user = userEvent.setup()
      vi.mocked(api.agent.getAgents).mockResolvedValue([mockAgent()])
      vi.mocked(api.agent.createSession).mockResolvedValue(mockSession())
      vi.mocked(api.agent.sendMessage).mockResolvedValue(mockMessageResponse({ content: 'Hello World' }))

      render(<BottomTabPanel defaultTab="console" />)

      const input = screen.getByPlaceholderText('Enter command...')
      await user.type(input, 'test{Enter}')

      await waitFor(() => {
        expect(screen.getByText('Hello World')).toBeInTheDocument()
      })
    })

    it('displays default message when response has no content', async () => {
      const user = userEvent.setup()
      vi.mocked(api.agent.getAgents).mockResolvedValue([mockAgent()])
      vi.mocked(api.agent.createSession).mockResolvedValue(mockSession())
      vi.mocked(api.agent.sendMessage).mockResolvedValue(mockMessageResponse({ content: undefined }))

      render(<BottomTabPanel defaultTab="console" />)

      const input = screen.getByPlaceholderText('Enter command...')
      await user.type(input, 'test{Enter}')

      await waitFor(() => {
        expect(screen.getByText('Command executed')).toBeInTheDocument()
      })
    })

    it('displays error message on command failure', async () => {
      const user = userEvent.setup()
      vi.mocked(api.agent.getAgents).mockRejectedValue(new Error('Network error'))

      render(<BottomTabPanel defaultTab="console" />)

      const input = screen.getByPlaceholderText('Enter command...')
      await user.type(input, 'test{Enter}')

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument()
      })
      expect(logger.error).toHaveBeenCalledWith('Console', 'Command failed:', expect.any(Error))
    })

    it('displays generic error for non-Error throws', async () => {
      const user = userEvent.setup()
      vi.mocked(api.agent.getAgents).mockRejectedValue('string error')

      render(<BottomTabPanel defaultTab="console" />)

      const input = screen.getByPlaceholderText('Enter command...')
      await user.type(input, 'test{Enter}')

      await waitFor(() => {
        expect(screen.getByText('Command failed')).toBeInTheDocument()
      })
    })

    it('clears input after command submission', async () => {
      const user = userEvent.setup()
      vi.mocked(api.agent.getAgents).mockResolvedValue([mockAgent()])
      vi.mocked(api.agent.createSession).mockResolvedValue(mockSession())
      vi.mocked(api.agent.sendMessage).mockResolvedValue(mockMessageResponse())

      render(<BottomTabPanel defaultTab="console" />)

      const input = screen.getByPlaceholderText('Enter command...')
      await user.type(input, 'test{Enter}')

      await waitFor(() => {
        expect(input).toHaveValue('')
      })
    })

    it('displays timestamp with command entries', async () => {
      const user = userEvent.setup()
      vi.mocked(api.agent.getAgents).mockResolvedValue([mockAgent()])
      vi.mocked(api.agent.createSession).mockResolvedValue(mockSession())
      vi.mocked(api.agent.sendMessage).mockResolvedValue(mockMessageResponse())

      render(<BottomTabPanel defaultTab="console" />)

      const input = screen.getByPlaceholderText('Enter command...')
      await user.type(input, 'test{Enter}')

      await waitFor(() => {
        const timestampElements = screen.getAllByText(/^\[\d{2}:\d{2}:\d{2}\]$/)
        expect(timestampElements.length).toBeGreaterThan(0)
      })
    })

    it('logs multiple entries in sequence', async () => {
      const user = userEvent.setup()
      vi.mocked(api.agent.getAgents).mockResolvedValue([mockAgent()])
      vi.mocked(api.agent.createSession).mockResolvedValue(mockSession())
      vi.mocked(api.agent.sendMessage).mockResolvedValue(mockMessageResponse({ content: 'Response' }))

      render(<BottomTabPanel defaultTab="console" />)

      const input = screen.getByPlaceholderText('Enter command...')
      await user.type(input, 'cmd1{Enter}')

      await waitFor(() => {
        expect(screen.getByText('> cmd1')).toBeInTheDocument()
      })

      await user.type(input, 'cmd2{Enter}')

      await waitFor(() => {
        expect(screen.getByText('> cmd2')).toBeInTheDocument()
      })
    })

    it('cleans up session on unmount', async () => {
      const user = userEvent.setup()
      vi.mocked(api.agent.getAgents).mockResolvedValue([mockAgent()])
      vi.mocked(api.agent.createSession).mockResolvedValue(mockSession())
      vi.mocked(api.agent.sendMessage).mockResolvedValue(mockMessageResponse())
      vi.mocked(api.agent.closeSession).mockResolvedValue(undefined)

      const { unmount } = render(<BottomTabPanel defaultTab="console" />)

      const input = screen.getByPlaceholderText('Enter command...')
      await user.type(input, 'test{Enter}')

      await waitFor(() => {
        expect(api.agent.sendMessage).toHaveBeenCalled()
      })

      unmount()

      await waitFor(() => {
        expect(api.agent.closeSession).toHaveBeenCalledWith('session-1')
      })
    })

    it('handles close session rejection gracefully', async () => {
      const user = userEvent.setup()
      vi.mocked(api.agent.getAgents).mockResolvedValue([mockAgent()])
      vi.mocked(api.agent.createSession).mockResolvedValue(mockSession())
      vi.mocked(api.agent.sendMessage).mockResolvedValue(mockMessageResponse())
      vi.mocked(api.agent.closeSession).mockRejectedValue(new Error('close failed'))

      const { unmount } = render(<BottomTabPanel defaultTab="console" />)

      const input = screen.getByPlaceholderText('Enter command...')
      await user.type(input, 'test{Enter}')

      await waitFor(() => {
        expect(api.agent.sendMessage).toHaveBeenCalled()
      })

      unmount()

      await waitFor(() => {
        expect(logger.debug).toHaveBeenCalledWith('BottomTab', 'Failed to close session on unmount')
      })
    })
  })
})
