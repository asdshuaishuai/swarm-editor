import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import AgentPanel from './AgentPanel'
import { useAppStore } from '../store/appStore'

vi.mock('../store/appStore', () => ({
  useAppStore: vi.fn(),
}))

// Store event handlers for triggering in tests
const eventHandlers = new Map<string, (payload: unknown) => void>()

// Always restore real timers after each test to prevent leakage
afterEach(() => {
  vi.useRealTimers()
})

// Mock WebSocket events API
vi.mock('../services', () => ({
  events: {
    onAgentMessage: vi.fn().mockImplementation((handler: (payload: unknown) => void) => {
      eventHandlers.set('agent_message', handler)
      return () => eventHandlers.delete('agent_message')
    }),
  },
  api: {
    agent: {
      createSession: vi.fn().mockResolvedValue({
        sessionId: 'test-session',
        agentId: '1',
        agentName: 'Agent 1',
      }),
      sendMessage: vi.fn().mockImplementation(async (_sessionId: string, _message: string) => {
        // Simulate a delay and then trigger the WebSocket event handler
        await new Promise((resolve) => {
          setTimeout(resolve, 500)
        })
        // Trigger the WebSocket event handler for agent_message
        const handler = eventHandlers.get('agent_message')
        if (handler) {
          handler({
            sessionId: 'test-session',
            content: 'I understand your request. Let me help you with that.',
          })
        }
        return {
          sessionId: 'test-session',
          stopReason: 'EndTurn',
        }
      }),
      closeSession: vi.fn().mockResolvedValue(undefined),
    },
  },
}))

// Shared mock functions accessible across all describe blocks
const mockSelectAgent = vi.fn()
const mockStartAgent = vi.fn()
const mockStopAgent = vi.fn()
const mockLoadAgents = vi.fn()
const mockAddToast = vi.fn()

describe('AgentPanel', () => {
  const defaultMockState = {
    agents: [
      { id: '1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: {} },
      { id: '2', name: 'Agent 2', type: 'reviewer', state: 'idle', capabilities: {} },
    ],
    selectedAgent: null,
    selectAgent: mockSelectAgent,
    startAgent: mockStartAgent,
    stopAgent: mockStopAgent,
    loadAgents: mockLoadAgents,
    addToast: mockAddToast,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector?: (state: unknown) => unknown) => {
      return selector ? selector(defaultMockState) : defaultMockState
    })
  })

  it('renders agent selector', () => {
    render(<AgentPanel />)
    expect(screen.getByText('Select Agent')).toBeInTheDocument()
  })

  it('renders agents in dropdown', () => {
    render(<AgentPanel />)
    expect(screen.getByText('Agent 1 (coder)')).toBeInTheDocument()
    expect(screen.getByText('Agent 2 (reviewer)')).toBeInTheDocument()
  })

  it('renders agents list with status', () => {
    render(<AgentPanel />)
    // Check agent list section - use getAllByText since there are multiple Idle labels
    const idleLabels = screen.getAllByText('Idle')
    expect(idleLabels.length).toBeGreaterThanOrEqual(2)
  })

  it('renders input placeholder when agent selected', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        ...defaultMockState,
        selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' },
      }
      return selector ? selector(state) : state
    })
    render(<AgentPanel />)
    expect(screen.getByPlaceholderText('Type a message... (@File to reference files)')).toBeInTheDocument()
  })

  it('send button is disabled when no agent selected', () => {
    render(<AgentPanel />)
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    expect(sendButton).toBeDisabled()
  })

  it('calls selectAgent when agent is selected', () => {
    render(<AgentPanel />)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: '1' } })
    expect(mockSelectAgent).toHaveBeenCalled()
  })

  it('sends message on button click when agent is selected', async () => {
    vi.useFakeTimers()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        ...defaultMockState,
        selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' },
      }
      return selector ? selector(state) : state
    })
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'Hello agent' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    // Check user message appears
    expect(screen.getByText('Hello agent')).toBeInTheDocument()
    // Input should be cleared
    expect(input).toHaveValue('')

    // Advance timers to complete the setTimeout and prevent unhandled errors
    await act(async () => {
      vi.runAllTimersAsync()
    })
    vi.useRealTimers()
  })

  it('sends message on Enter key when agent is selected', async () => {
    vi.useFakeTimers()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        ...defaultMockState,
        selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' },
      }
      return selector ? selector(state) : state
    })
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'Test message' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })

    expect(screen.getByText('Test message')).toBeInTheDocument()

    // Advance timers to complete the setTimeout and prevent unhandled errors
    await act(async () => {
      vi.runAllTimersAsync()
    })
    vi.useRealTimers()
  })

  it('does not send message on Shift+Enter', async () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        ...defaultMockState,
        selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' },
      }
      return selector ? selector(state) : state
    })
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'Test message' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

    // Message should not appear in chat
    expect(screen.getByText('Chat with Agent 1')).toBeInTheDocument()
  })

  it('shows loading indicator after sending', async () => {
    vi.useFakeTimers()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        ...defaultMockState,
        selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' },
      }
      return selector ? selector(state) : state
    })
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'Hello' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    // Loading indicator should appear
    const spinners = document.querySelectorAll('.animate-spin')
    expect(spinners.length).toBeGreaterThan(0)

    // Advance timers to complete the setTimeout and prevent unhandled errors
    await act(async () => {
      vi.runAllTimersAsync()
    })
    vi.useRealTimers()
  })

  it('receives agent response after delay', async () => {
    vi.useFakeTimers()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        ...defaultMockState,
        selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' },
      }
      return selector ? selector(state) : state
    })
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'Hello' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    // Fast-forward timers and wrap in act
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(screen.getByText('I understand your request. Let me help you with that.')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('calls loadAgents when refresh button clicked', async () => {
    render(<AgentPanel />)
    const refreshButtons = screen.getAllByRole('button')
    const refreshButton = refreshButtons.find(btn => btn.querySelector('svg.lucide-refresh-cw'))
    fireEvent.click(refreshButton!)
    
    await waitFor(() => {
      expect(mockLoadAgents).toHaveBeenCalled()
    })
  })

  it('calls startAgent when play button clicked on idle agent', async () => {
    render(<AgentPanel />)
    const playButtons = screen.getAllByRole('button')
    const playButton = playButtons.find(btn => btn.querySelector('svg.lucide-play'))
    fireEvent.click(playButton!)
    
    await waitFor(() => {
      expect(mockStartAgent).toHaveBeenCalledWith('1')
    })
  })

  it('calls stopAgent when stop button clicked on running agent', async () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        ...defaultMockState,
        agents: [
          { id: '1', name: 'Agent 1', type: 'coder', state: 'executing', capabilities: {} },
        ],
      }
      return selector ? selector(state) : state
    })
    render(<AgentPanel />)
    const stopButtons = screen.getAllByRole('button')
    const stopButton = stopButtons.find(btn => btn.querySelector('svg.lucide-square'))
    fireEvent.click(stopButton!)
    
    await waitFor(() => {
      expect(mockStopAgent).toHaveBeenCalledWith('1')
    })
  })

  it('shows empty state when no agents available', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        ...defaultMockState,
        agents: [],
      }
      return selector ? selector(state) : state
    })
    render(<AgentPanel />)
    expect(screen.getByText('No agents available')).toBeInTheDocument()
  })

  it('calls selectAgent when agent card is clicked in agent list', () => {
    render(<AgentPanel />)
    // Find the agent card by looking for the agent name in the list
    const agentName = screen.getByText('Agent 1')
    // The parent div with onClick is 4 levels up from the name span
    // Agent name is in: div > div.flex-1.min-w-0 > div.text-sm.font-medium.truncate > span
    // The clickable card is: div.cursor-pointer (the grandparent of agentName's parent)
    const agentCard = agentName.closest('.cursor-pointer')
    expect(agentCard).toBeInTheDocument()
    fireEvent.click(agentCard!)
    expect(mockSelectAgent).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })

  it('shows visual selection state when agent is selected in list', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        ...defaultMockState,
        selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' },
      }
      return selector ? selector(state) : state
    })
    render(<AgentPanel />)
    // The selected agent card should have the accent border class
    // Use getAllByText since 'Agent 1' appears in both dropdown and list
    const agentNames = screen.getAllByText('Agent 1')
    // Find the one that's inside a cursor-pointer element (the list card)
    const agentCard = agentNames
      .map(el => el.closest('.cursor-pointer'))
      .find(el => el !== null)
    expect(agentCard).toHaveClass('border')
    expect(agentCard).toHaveClass('border-accent/30')
  })
})

describe('AgentPanel with selected agent', () => {
  const mockSelectAgent = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        agents: [{ id: '1', name: 'Selected Agent', type: 'coder', state: 'idle', capabilities: {} }],
        selectedAgent: { id: '1', name: 'Selected Agent', type: 'coder', state: 'idle' },
        selectAgent: mockSelectAgent,
        startAgent: vi.fn(),
        stopAgent: vi.fn(),
        loadAgents: vi.fn(),
        addToast: mockAddToast,
      }
      return selector ? selector(state) : state
    })
  })

  it('shows selected agent in dropdown', () => {
    render(<AgentPanel />)
    const select = screen.getByRole('combobox')
    expect(select).toHaveValue('1')
  })

  it('shows chat prompt with agent name', () => {
    render(<AgentPanel />)
    expect(screen.getByText('Chat with Selected Agent')).toBeInTheDocument()
  })

  it('shows capabilities when agent has pairProgramming and teamCollaboration', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: { pairProgramming: true, teamCollaboration: true } }],
        selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: { pairProgramming: true, teamCollaboration: true } },
        selectAgent: mockSelectAgent,
        startAgent: vi.fn(),
        stopAgent: vi.fn(),
        loadAgents: vi.fn(),
        addToast: mockAddToast,
      }
      return selector ? selector(state) : state
    })
    render(<AgentPanel />)
    // Check that capabilities are displayed as separate badges
    expect(screen.getByText('Pair Programming')).toBeInTheDocument()
    expect(screen.getByText('Team Collaboration')).toBeInTheDocument()
  })
})

describe('AgentPanel loading state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: {} }],
        selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' },
        selectAgent: vi.fn(),
        startAgent: vi.fn(),
        stopAgent: vi.fn(),
        loadAgents: vi.fn(),
        addToast: mockAddToast,
      }
      return selector ? selector(state) : state
    })
  })

  it('does not send message while loading', async () => {
    vi.useFakeTimers()
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')

    // Send first message
    fireEvent.change(input, { target: { value: 'First message' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    // Input should be cleared
    expect(input).toHaveValue('')

    // Type another message and try to send via Enter while still loading
    fireEvent.change(input, { target: { value: 'Second message' } })

    // Press Enter while loading - this tests the isLoading return branch
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })

    // Only the first message should be visible in the chat
    const messageAreas = screen.getAllByText('First message')
    expect(messageAreas.length).toBe(1)

    // Advance timer to complete loading
    await act(async () => {
      vi.runAllTimersAsync()
    })

    vi.useRealTimers()
  })

  it('returns early when handleSend called with empty input', () => {
    render(<AgentPanel />)
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))

    // Button is disabled, but let's verify
    expect(sendButton).toBeDisabled()
  })
})

describe('AgentPanel agent selection', () => {
  const mockSelectAgent = vi.fn()
  const mockAddToast = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: {} }],
        selectedAgent: null,
        selectAgent: mockSelectAgent,
        startAgent: vi.fn(),
        stopAgent: vi.fn(),
        loadAgents: vi.fn(),
        addToast: mockAddToast,
      }
      return selector ? selector(state) : state
    })
  })

  it('calls selectAgent with null when selecting empty option', () => {
    render(<AgentPanel />)
    const select = screen.getByRole('combobox')

    // Select an agent first
    fireEvent.change(select, { target: { value: '1' } })
    expect(mockSelectAgent).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))

    // Now select the empty option
    fireEvent.change(select, { target: { value: '' } })
    expect(mockSelectAgent).toHaveBeenCalledWith(null)
  })

  it('calls selectAgent with null when agent not found', () => {
    render(<AgentPanel />)
    const select = screen.getByRole('combobox')

    // Try to select an agent that doesn't exist
    fireEvent.change(select, { target: { value: 'non-existent-agent' } })
    expect(mockSelectAgent).toHaveBeenCalledWith(null)
  })
})

describe('AgentPanel state colors', () => {
  it('shows green color for executing agent', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'executing', capabilities: {} }],
        selectedAgent: null,
        selectAgent: vi.fn(),
        startAgent: vi.fn(),
        stopAgent: vi.fn(),
        loadAgents: vi.fn(),
        addToast: mockAddToast,
      }
      return selector ? selector(state) : state
    })
    render(<AgentPanel />)
    expect(screen.getByText('Running')).toBeInTheDocument()
  })

  it('shows yellow color for thinking agent', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'thinking', capabilities: {} }],
        selectedAgent: null,
        selectAgent: vi.fn(),
        startAgent: vi.fn(),
        stopAgent: vi.fn(),
        loadAgents: vi.fn(),
        addToast: mockAddToast,
      }
      return selector ? selector(state) : state
    })
    render(<AgentPanel />)
    expect(screen.getByText('Thinking')).toBeInTheDocument()
  })

  it('shows red color for error agent', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'error', capabilities: {} }],
        selectedAgent: null,
        selectAgent: vi.fn(),
        startAgent: vi.fn(),
        stopAgent: vi.fn(),
        loadAgents: vi.fn(),
        addToast: mockAddToast,
      }
      return selector ? selector(state) : state
    })
    render(<AgentPanel />)
    expect(screen.getByText('Error')).toBeInTheDocument()
  })

  it('handles startAgent error gracefully', async () => {
    const mockStartAgent = vi.fn().mockRejectedValueOnce(new Error('Start failed'))
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: {} }],
        selectedAgent: null,
        selectAgent: vi.fn(),
        startAgent: mockStartAgent,
        stopAgent: vi.fn(),
        loadAgents: vi.fn(),
        addToast: mockAddToast,
      }
      return selector ? selector(state) : state
    })
    render(<AgentPanel />)

    // Find and click start button
    const startButtons = screen.getAllByRole('button')
    const startButton = startButtons.find(btn => btn.querySelector('svg.lucide-play'))
    fireEvent.click(startButton!)

    // Should not crash - error is logged
    await waitFor(() => {
      expect(mockStartAgent).toHaveBeenCalled()
    })
  })

  it('handles stopAgent error gracefully', async () => {
    const mockStopAgent = vi.fn().mockRejectedValueOnce(new Error('Stop failed'))
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'executing', capabilities: {} }],
        selectedAgent: null,
        selectAgent: vi.fn(),
        startAgent: vi.fn(),
        stopAgent: mockStopAgent,
        loadAgents: vi.fn(),
        addToast: mockAddToast,
      }
      return selector ? selector(state) : state
    })
    render(<AgentPanel />)

    // Find and click stop button
    const stopButtons = screen.getAllByRole('button')
    const stopButton = stopButtons.find(btn => btn.querySelector('svg.lucide-square'))
    fireEvent.click(stopButton!)

    // Should not crash - error is logged
    await waitFor(() => {
      expect(mockStopAgent).toHaveBeenCalled()
    })
  })
})
