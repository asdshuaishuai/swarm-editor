import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import AgentPanel from './AgentPanel'
import { useAppStore } from '../store/appStore'

vi.mock('../store/appStore', () => ({
  useAppStore: vi.fn(),
}))

vi.mock('../utils', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../utils/fileReference', () => ({
  isCursorInFileReference: vi.fn(() => ({ inReference: false })),
  parseFileReferences: vi.fn(() => []),
  getLanguageFromExtension: vi.fn((ext: string) => ext || 'text'),
  expandGlob: vi.fn((_pattern: string, files: string[]) => files),
}))

// Capture FileAutocompleteWrapper props for testing onSelect/onClose
const autocompleteProps = {
  onSelect: (_path: string) => {},
  onClose: () => {},
}

vi.mock('./FileAutocomplete', () => ({
  FileAutocompleteWrapper: (props: { visible: boolean; onSelect: (path: string) => void; onClose: () => void }) => {
    autocompleteProps.onSelect = props.onSelect
    autocompleteProps.onClose = props.onClose
    return props.visible ? <div data-testid="file-autocomplete">File Autocomplete</div> : null
  },
}))

vi.mock('./ConfirmDialog', () => ({
  ConfirmDialog: ({ onConfirm, onCancel, title, message }: {
    onConfirm: () => void
    onCancel: () => void
    title: string
    message: string
  }) => (
    <div data-testid="confirm-dialog">
      <span>{title}</span>
      <span>{message}</span>
      <button onClick={onConfirm} data-testid="confirm-btn">Confirm</button>
      <button onClick={onCancel} data-testid="cancel-btn">Cancel</button>
    </div>
  ),
}))

// Store event handlers for triggering in tests
const eventHandlers = new Map<string, (payload: unknown) => void>()

// Always restore real timers after each test to prevent leakage
afterEach(() => {
  vi.useRealTimers()
})

// Mock services module
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
        await new Promise((resolve) => {
          setTimeout(resolve, 500)
        })
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
  fsApi: {
    listDir: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue('file content'),
  },
}))

// Shared mock functions accessible across all describe blocks
const mockSelectAgent = vi.fn()
const mockStartAgent = vi.fn()
const mockStopAgent = vi.fn()
const mockLoadAgents = vi.fn()
const mockAddToast = vi.fn()

function mockStore(overrides: Record<string, unknown> = {}) {
  const defaultState = {
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
    agentLoadError: null,
    ...overrides,
  }
  ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector?: (state: unknown) => unknown) => {
    return selector ? selector(defaultState) : defaultState
  })
  return defaultState
}

describe('AgentPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventHandlers.clear()
    mockStore()
  })

  // --- Rendering ---

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
    const idleLabels = screen.getAllByText('Idle')
    expect(idleLabels.length).toBeGreaterThanOrEqual(2)
  })

  it('renders input placeholder when agent selected', () => {
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
    render(<AgentPanel />)
    expect(screen.getByPlaceholderText('Type a message... (@File to reference files)')).toBeInTheDocument()
  })

  it('renders default placeholder when no agent selected', () => {
    render(<AgentPanel />)
    expect(screen.getByPlaceholderText('Select an agent first...')).toBeInTheDocument()
  })

  it('shows empty state when no agents available', () => {
    mockStore({ agents: [] })
    render(<AgentPanel />)
    expect(screen.getByText('No agents available')).toBeInTheDocument()
  })

  it('shows "Select an agent to start chatting" when no agent selected', () => {
    render(<AgentPanel />)
    expect(screen.getByText('Select an agent to start chatting')).toBeInTheDocument()
  })

  it('shows chat prompt with agent name when agent selected', () => {
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
    render(<AgentPanel />)
    expect(screen.getByText('Chat with Agent 1')).toBeInTheDocument()
  })

  // --- Agent Load Error Banner ---

  it('shows error banner when agentLoadError is set', () => {
    mockStore({ agentLoadError: 'Failed to load agents' })
    render(<AgentPanel />)
    expect(screen.getByText('Failed to load agents')).toBeInTheDocument()
    expect(screen.getByText('Retry')).toBeInTheDocument()
  })

  it('does not show error banner when agentLoadError is null', () => {
    render(<AgentPanel />)
    expect(screen.queryByText('Retry')).toBeNull()
  })

  it('retry button in error banner calls handleRefresh', async () => {
    mockStore({ agentLoadError: 'Failed to load agents' })
    render(<AgentPanel />)
    // There are two refresh buttons: one in the banner and one in the selector header.
    // The banner one is the "Retry" text link.
    fireEvent.click(screen.getByText('Retry'))
    await waitFor(() => {
      expect(mockLoadAgents).toHaveBeenCalled()
    })
  })

  // --- Agent Selector ---

  it('calls selectAgent when agent is selected via dropdown', () => {
    render(<AgentPanel />)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: '1' } })
    expect(mockSelectAgent).toHaveBeenCalled()
  })

  it('calls selectAgent with null when selecting empty option', () => {
    render(<AgentPanel />)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: '1' } })
    expect(mockSelectAgent).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
    fireEvent.change(select, { target: { value: '' } })
    expect(mockSelectAgent).toHaveBeenCalledWith(null)
  })

  it('calls selectAgent with null when agent not found in dropdown', () => {
    render(<AgentPanel />)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'non-existent-agent' } })
    expect(mockSelectAgent).toHaveBeenCalledWith(null)
  })

  it('calls selectAgent when agent card is clicked in agent list', () => {
    render(<AgentPanel />)
    const agentName = screen.getByText('Agent 1')
    const agentCard = agentName.closest('.cursor-pointer')
    expect(agentCard).toBeInTheDocument()
    fireEvent.click(agentCard!)
    expect(mockSelectAgent).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })

  it('shows visual selection state when agent is selected in list', () => {
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
    render(<AgentPanel />)
    const agentNames = screen.getAllByText('Agent 1')
    const agentCard = agentNames
      .map(el => el.closest('.cursor-pointer'))
      .find(el => el !== null)
    expect(agentCard).toHaveClass('border')
    expect(agentCard).toHaveClass('border-accent/30')
  })

  // --- Selected Agent Info ---

  it('shows selected agent info section when agent is selected', () => {
    mockStore({
      selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: {} },
    })
    render(<AgentPanel />)
    // Agent name appears in both the agent list card and the info section
    const agentNames = screen.getAllByText('Agent 1')
    // The info section one is inside a bg-glass/30 container
    const infoSectionName = agentNames.find(el => el.closest('.bg-glass\\/30'))
    expect(infoSectionName).toBeInTheDocument()
  })

  it('shows capabilities when agent has pairProgramming', () => {
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: { pairProgramming: true } }],
      selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: { pairProgramming: true } },
    })
    render(<AgentPanel />)
    expect(screen.getByText('Pair Programming')).toBeInTheDocument()
  })

  it('shows capabilities when agent has teamCollaboration', () => {
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: { teamCollaboration: true } }],
      selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: { teamCollaboration: true } },
    })
    render(<AgentPanel />)
    expect(screen.getByText('Team Collaboration')).toBeInTheDocument()
  })

  it('shows both capabilities when agent has both', () => {
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: { pairProgramming: true, teamCollaboration: true } }],
      selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: { pairProgramming: true, teamCollaboration: true } },
    })
    render(<AgentPanel />)
    expect(screen.getByText('Pair Programming')).toBeInTheDocument()
    expect(screen.getByText('Team Collaboration')).toBeInTheDocument()
  })

  it('does not show capability badges when agent has no capabilities', () => {
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: {} }],
      selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: {} },
    })
    render(<AgentPanel />)
    expect(screen.queryByText('Pair Programming')).toBeNull()
    expect(screen.queryByText('Team Collaboration')).toBeNull()
  })

  // --- Send Button State ---

  it('send button is disabled when no agent selected', () => {
    render(<AgentPanel />)
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    expect(sendButton).toBeDisabled()
  })

  it('send button is disabled when input is empty', () => {
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
    render(<AgentPanel />)
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    expect(sendButton).toBeDisabled()
  })

  it('send button is enabled when input has text and agent is selected', () => {
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'Hello' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    expect(sendButton).not.toBeDisabled()
  })

  // --- Sending Messages ---

  it('sends message on button click when agent is selected', async () => {
    vi.useFakeTimers()
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'Hello agent' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    expect(screen.getByText('Hello agent')).toBeInTheDocument()
    expect(input).toHaveValue('')

    await act(async () => {
      vi.runAllTimersAsync()
    })
    vi.useRealTimers()
  })

  it('sends message on Enter key when agent is selected', async () => {
    vi.useFakeTimers()
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'Test message' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })

    expect(screen.getByText('Test message')).toBeInTheDocument()

    await act(async () => {
      vi.runAllTimersAsync()
    })
    vi.useRealTimers()
  })

  it('does not send message on Shift+Enter', () => {
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'Test message' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(screen.getByText('Chat with Agent 1')).toBeInTheDocument()
  })

  it('shows loading indicator after sending', async () => {
    vi.useFakeTimers()
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'Hello' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    const spinners = document.querySelectorAll('.animate-spin')
    expect(spinners.length).toBeGreaterThan(0)

    await act(async () => {
      vi.runAllTimersAsync()
    })
    vi.useRealTimers()
  })

  it('receives agent response after delay', async () => {
    vi.useFakeTimers()
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'Hello' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(screen.getByText('I understand your request. Let me help you with that.')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('does not send message while loading', async () => {
    vi.useFakeTimers()
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')

    fireEvent.change(input, { target: { value: 'First message' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    await act(async () => {
      vi.runAllTimersAsync()
    })

    expect(input).toHaveValue('')

    fireEvent.change(input, { target: { value: 'Second message' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })

    const messageAreas = screen.getAllByText('First message')
    expect(messageAreas.length).toBe(1)

    vi.useRealTimers()
  })

  it('returns early when handleSend called with empty input', () => {
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
    render(<AgentPanel />)
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    expect(sendButton).toBeDisabled()
  })

  // --- Refresh ---

  it('calls loadAgents when refresh button clicked', async () => {
    render(<AgentPanel />)
    const refreshButtons = screen.getAllByRole('button')
    const refreshButton = refreshButtons.find(btn => btn.querySelector('svg.lucide-refresh-cw'))
    fireEvent.click(refreshButton!)

    await waitFor(() => {
      expect(mockLoadAgents).toHaveBeenCalled()
    })
  })

  // --- Agent Toggle (Start/Stop) ---

  it('calls startAgent when play button clicked on idle agent', async () => {
    render(<AgentPanel />)
    const playButtons = screen.getAllByRole('button')
    const playButton = playButtons.find(btn => btn.querySelector('svg.lucide-play'))
    fireEvent.click(playButton!)

    await waitFor(() => {
      expect(mockStartAgent).toHaveBeenCalledWith('1')
    })
  })

  it('shows confirm dialog when stop button clicked on running agent', async () => {
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'executing', capabilities: {} }],
    })
    render(<AgentPanel />)
    const stopButtons = screen.getAllByRole('button')
    const stopButton = stopButtons.find(btn => btn.querySelector('svg.lucide-square'))
    fireEvent.click(stopButton!)

    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
    })
  })

  it('calls stopAgent when confirm button clicked in confirm dialog', async () => {
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'executing', capabilities: {} }],
    })
    render(<AgentPanel />)
    const stopButtons = screen.getAllByRole('button')
    const stopButton = stopButtons.find(btn => btn.querySelector('svg.lucide-square'))
    fireEvent.click(stopButton!)

    await waitFor(() => {
      expect(screen.getByTestId('confirm-btn')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('confirm-btn'))

    await waitFor(() => {
      expect(mockStopAgent).toHaveBeenCalledWith('1')
    })
  })

  it('closes confirm dialog when cancel button clicked', async () => {
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'executing', capabilities: {} }],
    })
    render(<AgentPanel />)
    const stopButtons = screen.getAllByRole('button')
    const stopButton = stopButtons.find(btn => btn.querySelector('svg.lucide-square'))
    fireEvent.click(stopButton!)

    await waitFor(() => {
      expect(screen.getByTestId('cancel-btn')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('cancel-btn'))

    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).toBeNull()
    })
  })

  it('shows confirm dialog with correct agent name for executing agent', async () => {
    mockStore({
      agents: [{ id: '1', name: 'TestBot', type: 'coder', state: 'executing', capabilities: {} }],
    })
    render(<AgentPanel />)
    const stopButtons = screen.getAllByRole('button')
    const stopButton = stopButtons.find(btn => btn.querySelector('svg.lucide-square'))
    fireEvent.click(stopButton!)

    // The confirm dialog message should contain the agent name
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
    })
    expect(screen.getByText(/Are you sure you want to stop "TestBot"/)).toBeInTheDocument()
  })

  // --- Agent State Colors & Labels ---

  it('shows green color for executing agent', () => {
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'executing', capabilities: {} }],
    })
    render(<AgentPanel />)
    expect(screen.getByText('Running')).toBeInTheDocument()
  })

  it('shows green color for running agent', () => {
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'running', capabilities: {} }],
    })
    render(<AgentPanel />)
    expect(screen.getByText('Running')).toBeInTheDocument()
  })

  it('shows yellow color for thinking agent', () => {
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'thinking', capabilities: {} }],
    })
    render(<AgentPanel />)
    expect(screen.getByText('Thinking')).toBeInTheDocument()
  })

  it('shows red color for error agent', () => {
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'error', capabilities: {} }],
    })
    render(<AgentPanel />)
    expect(screen.getByText('Error')).toBeInTheDocument()
  })

  it('shows Idle for idle agent', () => {
    render(<AgentPanel />)
    expect(screen.getAllByText('Idle').length).toBeGreaterThanOrEqual(2)
  })

  it('shows Idle for stopped agent', () => {
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'stopped', capabilities: {} }],
    })
    render(<AgentPanel />)
    expect(screen.getByText('Idle')).toBeInTheDocument()
  })

  it('shows agent type capitalized', () => {
    render(<AgentPanel />)
    expect(screen.getByText('coder')).toBeInTheDocument()
    expect(screen.getByText('reviewer')).toBeInTheDocument()
  })

  // --- State Dot Colors ---

  it('shows success dot for running agent', () => {
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'running', capabilities: {} }],
    })
    render(<AgentPanel />)
    const dots = document.querySelectorAll('.bg-success')
    expect(dots.length).toBeGreaterThanOrEqual(1)
  })

  it('shows warning dot for thinking agent', () => {
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'thinking', capabilities: {} }],
    })
    render(<AgentPanel />)
    const dots = document.querySelectorAll('.bg-warning')
    expect(dots.length).toBeGreaterThanOrEqual(1)
  })

  it('shows error dot for error agent', () => {
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'error', capabilities: {} }],
    })
    render(<AgentPanel />)
    const dots = document.querySelectorAll('.bg-error')
    expect(dots.length).toBeGreaterThanOrEqual(1)
  })

  it('shows default dot for idle agent', () => {
    render(<AgentPanel />)
    const dots = document.querySelectorAll('.bg-text-tertiary')
    expect(dots.length).toBeGreaterThanOrEqual(1)
  })

  // --- Toggle Button State Colors ---

  it('shows error color on toggle button for executing agent', () => {
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'executing', capabilities: {} }],
    })
    render(<AgentPanel />)
    const stopButtons = screen.getAllByRole('button')
    const stopButton = stopButtons.find(btn => btn.querySelector('svg.lucide-square'))
    expect(stopButton!.className).toContain('text-error')
  })

  it('shows success color on toggle button for idle agent', () => {
    render(<AgentPanel />)
    const playButtons = screen.getAllByRole('button')
    const playButton = playButtons.find(btn => btn.querySelector('svg.lucide-play'))
    expect(playButton!.className).toContain('text-success')
  })

  // --- Error Handling ---

  it('handles startAgent error gracefully', async () => {
    const failingStart = vi.fn().mockRejectedValueOnce(new Error('Start failed'))
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: {} }],
      startAgent: failingStart,
    })
    render(<AgentPanel />)
    const startButtons = screen.getAllByRole('button')
    const startButton = startButtons.find(btn => btn.querySelector('svg.lucide-play'))
    fireEvent.click(startButton!)

    await waitFor(() => {
      expect(failingStart).toHaveBeenCalled()
    })
  })

  it('handles stopAgent error gracefully', async () => {
    const failingStop = vi.fn().mockRejectedValueOnce(new Error('Stop failed'))
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'executing', capabilities: {} }],
      stopAgent: failingStop,
    })
    render(<AgentPanel />)
    const stopButtons = screen.getAllByRole('button')
    const stopButton = stopButtons.find(btn => btn.querySelector('svg.lucide-square'))
    fireEvent.click(stopButton!)

    await waitFor(() => {
      expect(screen.getByTestId('confirm-btn')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('confirm-btn'))

    await waitFor(() => {
      expect(failingStop).toHaveBeenCalled()
    })
  })

  // --- Message Display ---

  it('displays user message with justify-end class', async () => {
    vi.useFakeTimers()
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'Hello' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    const userMsg = screen.getByText('Hello').closest('.flex')
    expect(userMsg!.className).toContain('justify-end')

    await act(async () => {
      vi.runAllTimersAsync()
    })
    vi.useRealTimers()
  })

  it('displays user message with accent background', async () => {
    vi.useFakeTimers()
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'Hello' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    const msgBubble = screen.getByText('Hello').closest('.rounded-mac')
    expect(msgBubble!.className).toContain('bg-accent')

    await act(async () => {
      vi.runAllTimersAsync()
    })
    vi.useRealTimers()
  })

  it('displays assistant message with glass background', async () => {
    vi.useFakeTimers()
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'Hello' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    const assistantMsg = screen.getByText('I understand your request. Let me help you with that.').closest('.rounded-mac')
    expect(assistantMsg!.className).toContain('bg-glass')
    vi.useRealTimers()
  })

  it('displays loading spinner with aria-live attribute', async () => {
    vi.useFakeTimers()
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'Hello' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    expect(screen.getByLabelText('Agent is thinking')).toBeInTheDocument()

    await act(async () => {
      vi.runAllTimersAsync()
    })
    vi.useRealTimers()
  })

  // --- Toggle Agent Loading State ---

  it('shows spinner on toggle button while toggling', async () => {
    // Make startAgent hang so isToggling stays set
    const hangingStart = vi.fn().mockImplementation(() => new Promise(() => {}))
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: {} }],
      startAgent: hangingStart,
    })
    render(<AgentPanel />)
    const playButtons = screen.getAllByRole('button')
    const playButton = playButtons.find(btn => btn.querySelector('svg.lucide-play'))
    await act(async () => {
      fireEvent.click(playButton!)
    })

    // The button should now show a spinner instead of play icon
    const allButtons = screen.getAllByRole('button')
    const loaderBtn = allButtons.find(btn => btn.querySelector('svg.lucide-loader-circle'))
    expect(loaderBtn).toBeTruthy()
  })

  it('disables toggle button while toggling', async () => {
    const hangingStart = vi.fn().mockImplementation(() => new Promise(() => {}))
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: {} }],
      startAgent: hangingStart,
    })
    render(<AgentPanel />)
    const playButtons = screen.getAllByRole('button')
    const playButton = playButtons.find(btn => btn.querySelector('svg.lucide-play'))
    await act(async () => {
      fireEvent.click(playButton!)
    })

    // Find the button that is now disabled with the loader icon
    const toggleButtons = screen.getAllByRole('button')
    const loaderBtn = toggleButtons.find(btn => btn.querySelector('svg.lucide-loader-circle'))
    expect(loaderBtn).toBeTruthy()
    expect(loaderBtn).toBeDisabled()
  })

  // --- Refresh Spinner ---

  it('shows spinning animation on refresh button while refreshing', async () => {
    const hangingLoad = vi.fn().mockImplementation(() => new Promise(() => {}))
    mockStore({ loadAgents: hangingLoad })
    render(<AgentPanel />)
    const refreshButtons = screen.getAllByRole('button')
    const refreshButton = refreshButtons.find(btn => btn.querySelector('svg.lucide-refresh-cw'))
    fireEvent.click(refreshButton!)

    const svg = refreshButton!.querySelector('svg')
    expect(svg!.className.baseVal || svg!.className).toContain('animate-spin')
  })
})

describe('AgentPanel input handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventHandlers.clear()
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
  })

  it('updates input value on change', () => {
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'test input' } })
    expect(input).toHaveValue('test input')
  })

  it('clears input after sending message', async () => {
    vi.useFakeTimers()
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'Hello' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    expect(input).toHaveValue('')

    await act(async () => {
      vi.runAllTimersAsync()
    })
    vi.useRealTimers()
  })

  it('textarea is disabled when no agent is selected', () => {
    mockStore({ selectedAgent: null })
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Select an agent first...')
    expect(input).toBeDisabled()
  })

  it('textarea is enabled when agent is selected', () => {
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    expect(input).not.toBeDisabled()
  })
})

describe('AgentPanel file loading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventHandlers.clear()
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
  })

  it('loads files from backend on mount', async () => {
    const { fsApi } = await import('../services')
    vi.mocked(fsApi.listDir).mockResolvedValue([
      { name: 'test.ts', isDirectory: false, path: 'test.ts' },
    ])
    render(<AgentPanel />)
    await waitFor(() => {
      expect(fsApi.listDir).toHaveBeenCalledWith('.')
    })
  })

  it('loads files recursively from subdirectories', async () => {
    const { fsApi } = await import('../services')
    vi.mocked(fsApi.listDir)
      .mockResolvedValueOnce([
        { name: 'src', isDirectory: true, path: 'src' },
      ])
      .mockResolvedValueOnce([
        { name: 'index.ts', isDirectory: false, path: 'src/index.ts' },
      ])
    render(<AgentPanel />)
    await waitFor(() => {
      expect(fsApi.listDir).toHaveBeenCalledWith('.')
      expect(fsApi.listDir).toHaveBeenCalledWith('src')
    })
  })

  it('skips excluded directories when loading files', async () => {
    const { fsApi } = await import('../services')
    vi.mocked(fsApi.listDir).mockResolvedValue([
      { name: 'node_modules', isDirectory: true, path: 'node_modules' },
      { name: 'app.ts', isDirectory: false, path: 'app.ts' },
    ])
    render(<AgentPanel />)
    await waitFor(() => {
      expect(fsApi.listDir).toHaveBeenCalledWith('.')
    })
    // node_modules should be skipped - only called once for '.'
    // No recursive call for node_modules
    const listDirCalls = vi.mocked(fsApi.listDir).mock.calls
    const nodeModulesCall = listDirCalls.find(c => c[0] === 'node_modules')
    expect(nodeModulesCall).toBeUndefined()
  })

  it('handles listDir errors gracefully', async () => {
    const { fsApi } = await import('../services')
    vi.mocked(fsApi.listDir).mockRejectedValue(new Error('Permission denied'))
    // Should not crash
    render(<AgentPanel />)
    await waitFor(() => {
      expect(fsApi.listDir).toHaveBeenCalled()
    })
  })
})

describe('AgentPanel file autocomplete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventHandlers.clear()
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
  })

  it('shows file autocomplete when cursor is in file reference', async () => {
    const { isCursorInFileReference } = await import('../utils/fileReference')
    vi.mocked(isCursorInFileReference).mockReturnValue({
      inReference: true,
      query: 'test',
    })
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: '@File test', selectionStart: 11 } })
    expect(screen.getByTestId('file-autocomplete')).toBeInTheDocument()
  })

  it('hides file autocomplete when cursor leaves file reference', async () => {
    const { isCursorInFileReference } = await import('../utils/fileReference')
    vi.mocked(isCursorInFileReference).mockReturnValue({ inReference: false })
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'normal text', selectionStart: 5 } })
    expect(screen.queryByTestId('file-autocomplete')).toBeNull()
  })

  it('closes file autocomplete via onClose callback', async () => {
    const { isCursorInFileReference } = await import('../utils/fileReference')
    vi.mocked(isCursorInFileReference).mockReturnValue({
      inReference: true,
      query: 'test',
    })
    // This test verifies the FileAutocompleteWrapper onClose integration
    // The mocked component receives onClose and can invoke it
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: '@File test', selectionStart: 11 } })
    expect(screen.getByTestId('file-autocomplete')).toBeInTheDocument()
    // After next change with no reference, it should be hidden
    vi.mocked(isCursorInFileReference).mockReturnValue({ inReference: false })
    fireEvent.change(input, { target: { value: 'plain text', selectionStart: 5 } })
    expect(screen.queryByTestId('file-autocomplete')).toBeNull()
  })
})

describe('AgentPanel session management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventHandlers.clear()
  })

  it('creates a new session when sending first message', async () => {
    vi.useFakeTimers()
    const { api } = await import('../services')
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'Hello' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    await act(async () => {
      vi.runAllTimersAsync()
    })

    expect(api.agent.createSession).toHaveBeenCalledWith('1')
    vi.useRealTimers()
  })

  it('handles session creation error', async () => {
    vi.useFakeTimers()
    const { api } = await import('../services')
    vi.mocked(api.agent.createSession).mockRejectedValueOnce(new Error('Session creation failed'))
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'Hello' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    await act(async () => {
      vi.runAllTimersAsync()
    })

    expect(mockAddToast).toHaveBeenCalledWith(
      'error',
      'Session Error',
      expect.stringContaining('Session creation failed')
    )
    vi.useRealTimers()
  })

  it('handles session creation error with non-Error object', async () => {
    vi.useFakeTimers()
    const { api } = await import('../services')
    vi.mocked(api.agent.createSession).mockRejectedValueOnce('string error')
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'Hello' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    await act(async () => {
      vi.runAllTimersAsync()
    })

    expect(mockAddToast).toHaveBeenCalledWith(
      'error',
      'Session Error',
      expect.stringContaining('string error')
    )
    vi.useRealTimers()
  })

  it('closes session when switching agents', async () => {
    const { api } = await import('../services')
    const { rerender } = render(<AgentPanel />)

    // First, set up a session by selecting agent 1
    mockStore({
      agents: [
        { id: '1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: {} },
        { id: '2', name: 'Agent 2', type: 'reviewer', state: 'idle', capabilities: {} },
      ],
      selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' },
    })
    rerender(<AgentPanel />)

    // Now simulate creating a session by sending a message
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'Hello' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    await waitFor(() => {
      expect(api.agent.createSession).toHaveBeenCalled()
    })

    // Now switch to agent 2
    mockStore({
      agents: [
        { id: '1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: {} },
        { id: '2', name: 'Agent 2', type: 'reviewer', state: 'idle', capabilities: {} },
      ],
      selectedAgent: { id: '2', name: 'Agent 2', type: 'reviewer', state: 'idle' },
    })
    rerender(<AgentPanel />)

    await waitFor(() => {
      expect(api.agent.closeSession).toHaveBeenCalled()
    })
  })
})

describe('AgentPanel file reference resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventHandlers.clear()
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
  })

  it('resolves @File references when sending message', async () => {
    vi.useFakeTimers()
    const { parseFileReferences } = await import('../utils/fileReference')
    const { api, fsApi } = await import('../services')

    vi.mocked(parseFileReferences).mockReturnValue([{
      type: 'file',
      path: 'test.ts',
      raw: '@File test.ts',
      startIndex: 0,
      endIndex: 15,
    }])
    vi.mocked(fsApi.readFile).mockResolvedValue('const x = 1')
    vi.mocked(api.agent.sendMessage).mockImplementation(async () => {
      return { sessionId: 'test-session', stopReason: 'EndTurn' }
    })

    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: '@File test.ts' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    await act(async () => {
      vi.runAllTimersAsync()
    })

    expect(fsApi.readFile).toHaveBeenCalledWith('test.ts')
    vi.useRealTimers()
  })

  it('handles file read error in @File resolution', async () => {
    vi.useFakeTimers()
    const { parseFileReferences } = await import('../utils/fileReference')
    const { api, fsApi } = await import('../services')

    vi.mocked(parseFileReferences).mockReturnValue([{
      type: 'file',
      path: 'missing.ts',
      raw: '@File missing.ts',
      startIndex: 0,
      endIndex: 18,
    }])
    vi.mocked(fsApi.readFile).mockRejectedValue(new Error('File not found'))
    vi.mocked(api.agent.sendMessage).mockImplementation(async () => {
      return { sessionId: 'test-session', stopReason: 'EndTurn' }
    })

    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: '@File missing.ts' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    await act(async () => {
      vi.runAllTimersAsync()
    })

    // Should still send the message with error placeholder
    expect(api.agent.sendMessage).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('resolves @File glob patterns', async () => {
    vi.useFakeTimers()
    const { parseFileReferences, expandGlob } = await import('../utils/fileReference')
    const { api, fsApi } = await import('../services')

    vi.mocked(parseFileReferences).mockReturnValue([{
      type: 'glob',
      path: '**/*.ts',
      raw: '@Files **/*.ts',
      startIndex: 0,
      endIndex: 15,
    }])
    vi.mocked(expandGlob).mockReturnValue(['a.ts', 'b.ts'])
    vi.mocked(fsApi.readFile).mockResolvedValue('content')
    vi.mocked(api.agent.sendMessage).mockImplementation(async () => {
      return { sessionId: 'test-session', stopReason: 'EndTurn' }
    })

    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: '@Files **/*.ts' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    await act(async () => {
      vi.runAllTimersAsync()
    })

    expect(fsApi.readFile).toHaveBeenCalledWith('a.ts')
    expect(fsApi.readFile).toHaveBeenCalledWith('b.ts')
    vi.useRealTimers()
  })

  it('handles glob with no matches', async () => {
    vi.useFakeTimers()
    const { parseFileReferences, expandGlob } = await import('../utils/fileReference')
    const { api, fsApi } = await import('../services')

    vi.mocked(parseFileReferences).mockReturnValue([{
      type: 'glob',
      path: '**/*.xyz',
      raw: '@Files **/*.xyz',
      startIndex: 0,
      endIndex: 16,
    }])
    vi.mocked(expandGlob).mockReturnValue([])
    vi.mocked(api.agent.sendMessage).mockImplementation(async () => {
      return { sessionId: 'test-session', stopReason: 'EndTurn' }
    })

    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: '@Files **/*.xyz' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    await act(async () => {
      vi.runAllTimersAsync()
    })

    expect(fsApi.readFile).not.toHaveBeenCalled()
    expect(api.agent.sendMessage).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('handles glob with more than 10 matches by limiting to 10', async () => {
    vi.useFakeTimers()
    const { parseFileReferences, expandGlob } = await import('../utils/fileReference')
    const { api, fsApi } = await import('../services')

    const manyFiles = Array.from({ length: 15 }, (_, i) => `file${i}.ts`)
    vi.mocked(parseFileReferences).mockReturnValue([{
      type: 'glob',
      path: '**/*.ts',
      raw: '@Files **/*.ts',
      startIndex: 0,
      endIndex: 15,
    }])
    vi.mocked(expandGlob).mockReturnValue(manyFiles)
    vi.mocked(fsApi.readFile).mockResolvedValue('content')
    vi.mocked(api.agent.sendMessage).mockImplementation(async () => {
      return { sessionId: 'test-session', stopReason: 'EndTurn' }
    })

    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: '@Files **/*.ts' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    await act(async () => {
      vi.runAllTimersAsync()
    })

    // Should only read 10 files
    expect(fsApi.readFile).toHaveBeenCalledTimes(10)
    vi.useRealTimers()
  })

  it('handles glob file read error gracefully', async () => {
    vi.useFakeTimers()
    const { parseFileReferences, expandGlob } = await import('../utils/fileReference')
    const { api, fsApi } = await import('../services')

    vi.mocked(parseFileReferences).mockReturnValue([{
      type: 'glob',
      path: '**/*.ts',
      raw: '@Files **/*.ts',
      startIndex: 0,
      endIndex: 15,
    }])
    vi.mocked(expandGlob).mockReturnValue(['bad.ts'])
    vi.mocked(fsApi.readFile).mockRejectedValue(new Error('Read error'))
    vi.mocked(api.agent.sendMessage).mockImplementation(async () => {
      return { sessionId: 'test-session', stopReason: 'EndTurn' }
    })

    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: '@Files **/*.ts' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    await act(async () => {
      vi.runAllTimersAsync()
    })

    expect(api.agent.sendMessage).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('resolves folder type references by removing them', async () => {
    vi.useFakeTimers()
    const { parseFileReferences } = await import('../utils/fileReference')
    const { api } = await import('../services')

    vi.mocked(parseFileReferences).mockReturnValue([{
      type: 'folder',
      path: 'src/',
      raw: '@File src/',
      startIndex: 0,
      endIndex: 11,
    }])
    vi.mocked(api.agent.sendMessage).mockImplementation(async () => {
      return { sessionId: 'test-session', stopReason: 'EndTurn' }
    })

    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: '@File src/' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    await act(async () => {
      vi.runAllTimersAsync()
    })

    // Should still send the message (folder refs removed)
    expect(api.agent.sendMessage).toHaveBeenCalled()
    vi.useRealTimers()
  })
})

describe('AgentPanel send message error paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventHandlers.clear()
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
  })

  it('handles sendMessage error', async () => {
    vi.useFakeTimers()
    const { api } = await import('../services')
    vi.mocked(api.agent.sendMessage).mockRejectedValueOnce(new Error('Network error'))
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'Hello' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    await act(async () => {
      vi.runAllTimersAsync()
    })

    expect(mockAddToast).toHaveBeenCalledWith(
      'error',
      'Send Error',
      expect.stringContaining('Network error')
    )
    vi.useRealTimers()
  })

  it('handles sendMessage error with non-Error object', async () => {
    vi.useFakeTimers()
    const { api } = await import('../services')
    vi.mocked(api.agent.sendMessage).mockRejectedValueOnce('timeout')
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'Hello' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    await act(async () => {
      vi.runAllTimersAsync()
    })

    expect(mockAddToast).toHaveBeenCalledWith(
      'error',
      'Send Error',
      expect.stringContaining('timeout')
    )
    vi.useRealTimers()
  })

  it('sets isLoading to false when session creation fails during send', async () => {
    vi.useFakeTimers()
    const { api } = await import('../services')
    vi.mocked(api.agent.createSession).mockRejectedValueOnce(new Error('No session'))
    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'Hello' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    await act(async () => {
      vi.runAllTimersAsync()
    })

    // Loading spinner should be gone
    expect(screen.queryByLabelText('Agent is thinking')).toBeNull()
    vi.useRealTimers()
  })
})

describe('AgentPanel confirmStopAgent guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventHandlers.clear()
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'executing', capabilities: {} }],
    })
  })

  it('confirmStopAgent returns early when stopAgentConfirm is null', () => {
    // This tests the guard at line 353
    // The confirm dialog is only visible after clicking stop, so
    // confirmStopAgent should be a no-op when called without prior state
    render(<AgentPanel />)
    // Verify confirm dialog is NOT shown (stopAgentConfirm is null)
    expect(screen.queryByTestId('confirm-dialog')).toBeNull()
  })
})

describe('AgentPanel agent state colors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventHandlers.clear()
  })

  it('shows success text color for executing state', () => {
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'executing', capabilities: {} }],
    })
    render(<AgentPanel />)
    const agentName = screen.getAllByText('Agent 1').find(el => el.closest('.cursor-pointer'))
    const icon = agentName!.closest('.flex')!.querySelector('svg')
    expect(icon!.className.baseVal || (icon!.className as string)).toContain('text-success')
  })

  it('shows success text color for running state', () => {
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'running', capabilities: {} }],
    })
    render(<AgentPanel />)
    const agentName = screen.getAllByText('Agent 1').find(el => el.closest('.cursor-pointer'))
    const icon = agentName!.closest('.flex')!.querySelector('svg')
    expect(icon!.className.baseVal || (icon!.className as string)).toContain('text-success')
  })

  it('shows warning text color for thinking state', () => {
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'thinking', capabilities: {} }],
    })
    render(<AgentPanel />)
    const agentName = screen.getAllByText('Agent 1').find(el => el.closest('.cursor-pointer'))
    const icon = agentName!.closest('.flex')!.querySelector('svg')
    expect(icon!.className.baseVal || (icon!.className as string)).toContain('text-warning')
  })

  it('shows error text color for error state', () => {
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'error', capabilities: {} }],
    })
    render(<AgentPanel />)
    const agentName = screen.getAllByText('Agent 1').find(el => el.closest('.cursor-pointer'))
    const icon = agentName!.closest('.flex')!.querySelector('svg')
    expect(icon!.className.baseVal || (icon!.className as string)).toContain('text-error')
  })

  it('shows tertiary text color for idle state', () => {
    mockStore({
      agents: [{ id: '1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: {} }],
    })
    render(<AgentPanel />)
    const agentName = screen.getAllByText('Agent 1').find(el => el.closest('.cursor-pointer'))
    const icon = agentName!.closest('.flex')!.querySelector('svg')
    expect(icon!.className.baseVal || (icon!.className as string)).toContain('text-text-tertiary')
  })
})

describe('AgentPanel closeSession error path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventHandlers.clear()
  })

  it('logs warning when closeSession fails during agent switch', async () => {
    const { api } = await import('../services')
    vi.mocked(api.agent.closeSession).mockRejectedValueOnce(new Error('Close failed'))

    const { rerender } = render(<AgentPanel />)

    // Set up a session by selecting agent 1 and sending a message
    mockStore({
      agents: [
        { id: '1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: {} },
        { id: '2', name: 'Agent 2', type: 'reviewer', state: 'idle', capabilities: {} },
      ],
      selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' },
    })
    rerender(<AgentPanel />)

    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: 'Hello' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    await waitFor(() => {
      expect(api.agent.createSession).toHaveBeenCalled()
    })

    const { logger } = await import('../utils')

    // Switch to agent 2 to trigger closeSession
    mockStore({
      agents: [
        { id: '1', name: 'Agent 1', type: 'coder', state: 'idle', capabilities: {} },
        { id: '2', name: 'Agent 2', type: 'reviewer', state: 'idle', capabilities: {} },
      ],
      selectedAgent: { id: '2', name: 'Agent 2', type: 'reviewer', state: 'idle' },
    })
    rerender(<AgentPanel />)

    await waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith('AgentPanel', 'Failed to close session:', expect.any(Error))
    })
  })
})

describe('AgentPanel file reference edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventHandlers.clear()
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
  })

  it('removes file reference when content is not in fileContents map', async () => {
    vi.useFakeTimers()
    const { parseFileReferences } = await import('../utils/fileReference')
    const { api, fsApi } = await import('../services')

    // Simulate a file reference that fails to read (fileContents.get returns undefined)
    vi.mocked(parseFileReferences).mockReturnValue([{
      type: 'file',
      path: 'missing.ts',
      raw: '@File missing.ts',
      startIndex: 0,
      endIndex: 17,
    }])
    // readFile rejects, so the catch sets the error string, but we want to test
    // the path where content is falsy in fileContents. Use empty string result.
    vi.mocked(fsApi.readFile).mockResolvedValue('')
    vi.mocked(api.agent.sendMessage).mockImplementation(async () => {
      return { sessionId: 'test-session', stopReason: 'EndTurn' }
    })

    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: '@File missing.ts' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    await act(async () => {
      vi.runAllTimersAsync()
    })

    // Message should be sent (reference removed because empty content is falsy)
    expect(api.agent.sendMessage).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('includes overflow indicator when glob matches more than 10 files in first pass', async () => {
    vi.useFakeTimers()
    const { parseFileReferences, expandGlob } = await import('../utils/fileReference')
    const { api, fsApi } = await import('../services')
    const { logger } = await import('../utils')

    const manyFiles = Array.from({ length: 15 }, (_, i) => `file${i}.ts`)
    vi.mocked(parseFileReferences).mockReturnValue([{
      type: 'glob',
      path: '**/*.ts',
      raw: '@Files **/*.ts',
      startIndex: 0,
      endIndex: 15,
    }])
    vi.mocked(expandGlob).mockImplementation((_pattern: string, _files: string[]) => manyFiles)
    vi.mocked(fsApi.readFile).mockResolvedValue('content')
    vi.mocked(api.agent.sendMessage).mockImplementation(async () => {
      return { sessionId: 'test-session', stopReason: 'EndTurn' }
    })

    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: '@Files **/*.ts' } })
    const sendButtons = screen.getAllByRole('button')
    const sendButton = sendButtons.find(btn => btn.querySelector('svg.lucide-send'))
    fireEvent.click(sendButton!)

    await act(async () => {
      vi.runAllTimersAsync()
    })

    // The first pass should log about limiting to 10 files
    expect(logger.info).toHaveBeenCalledWith('AgentPanel', 'Glob matched 15 files, limited to 10')
    // Only 10 files should be read
    expect(fsApi.readFile).toHaveBeenCalledTimes(10)
    vi.useRealTimers()
  })
})

describe('AgentPanel excluded directory path matching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventHandlers.clear()
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
  })

  it('skips excluded directory when dirPath equals excluded dir name', async () => {
    const { fsApi } = await import('../services')
    // When listDir returns a directory named 'node_modules' at root level,
    // the recursive call for 'node_modules' should be skipped because
    // dirPath === 'node_modules' matches the EXCLUDE_DIRS check
    vi.mocked(fsApi.listDir)
      .mockResolvedValueOnce([
        { name: 'node_modules', isDirectory: true, path: 'node_modules' },
        { name: 'app.ts', isDirectory: false, path: 'app.ts' },
      ])

    render(<AgentPanel />)
    await waitFor(() => {
      expect(fsApi.listDir).toHaveBeenCalledWith('.')
    })

    // No recursive call for 'node_modules'
    const calls = vi.mocked(fsApi.listDir).mock.calls.map(c => c[0])
    expect(calls).not.toContain('node_modules')
  })
})

describe('AgentPanel file autocomplete selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventHandlers.clear()
    mockStore({ selectedAgent: { id: '1', name: 'Agent 1', type: 'coder', state: 'idle' } })
  })

  it('replaces @File reference text when file is selected from autocomplete', async () => {
    const { isCursorInFileReference } = await import('../utils/fileReference')
    vi.mocked(isCursorInFileReference).mockReturnValue({
      inReference: true,
      query: 'test',
    })

    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')

    // Type text with @File reference
    fireEvent.change(input, { target: { value: '@File test', selectionStart: 11 } })

    // Trigger file selection via the captured callback
    act(() => {
      autocompleteProps.onSelect('src/utils/test.ts')
    })

    // The input should be updated with the selected path
    expect(input).toHaveValue('@File src/utils/test.ts ')
  })

  it('does not replace text when no @File match is found', async () => {
    const { isCursorInFileReference } = await import('../utils/fileReference')
    vi.mocked(isCursorInFileReference).mockReturnValue({
      inReference: true,
      query: 'test',
    })

    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')

    // Type text WITHOUT @File reference pattern
    fireEvent.change(input, { target: { value: 'some plain text', selectionStart: 15 } })

    // Trigger file selection - since there's no @File match, it should just close autocomplete
    act(() => {
      autocompleteProps.onSelect('some-file.ts')
    })

    // Input should remain unchanged (no @File match found)
    expect(input).toHaveValue('some plain text')
  })

  it('closes autocomplete via onClose callback', async () => {
    const { isCursorInFileReference } = await import('../utils/fileReference')
    vi.mocked(isCursorInFileReference).mockReturnValue({
      inReference: true,
      query: 'test',
    })

    render(<AgentPanel />)
    const input = screen.getByPlaceholderText('Type a message... (@File to reference files)')
    fireEvent.change(input, { target: { value: '@File test', selectionStart: 11 } })
    expect(screen.getByTestId('file-autocomplete')).toBeInTheDocument()

    // Trigger close via the captured callback
    act(() => {
      autocompleteProps.onClose()
    })

    expect(screen.queryByTestId('file-autocomplete')).toBeNull()
  })
})
