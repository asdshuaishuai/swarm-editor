import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CLIProcessWorkshop from './CLIProcessWorkshop'

const mockGetAgents = vi.fn()

vi.mock('../services', () => ({
  api: {
    agent: {
      getAgents: (...args: any[]) => mockGetAgents(...args),
    },
  },
}))

vi.mock('../utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockStore = {
  agents: new Map(),
  activeTurns: new Map(),
  healthAlerts: [],
  agentCards: new Map(),
  connectedAgents: new Set(),
  subscribe: vi.fn(() => () => {}),
  refreshAgentCards: vi.fn(),
  findAgentsByCapability: vi.fn(),
  getAgentState: vi.fn(),
  getAgentAlerts: vi.fn(),
  clearAlerts: vi.fn(),
}

vi.mock('../stores/agentLifecycleStore', () => ({
  useAgentLifecycleStore: (selector?: any) =>
    selector ? selector(mockStore) : mockStore,
}))

// AgentConfigModal mock - just renders a placeholder
vi.mock('./AgentConfigModal', () => ({
  default: ({ onClose, onSaved }: any) => (
    <div data-testid="config-modal">
      <button data-testid="modal-close" onClick={onClose}>Close</button>
      <button data-testid="modal-save" onClick={() => onSaved({ id: 'agent-1', name: 'Test' })}>Save</button>
    </div>
  ),
}))

describe('CLIProcessWorkshop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStore.agents = new Map()
    mockGetAgents.mockResolvedValue([])
  })

  it('renders without crashing', () => {
    const { container } = render(<CLIProcessWorkshop />)
    expect(container.querySelector('table')).toBeInTheDocument()
  })

  it('shows empty state when no agents are available', () => {
    render(<CLIProcessWorkshop />)
    expect(screen.getByText('暂无运行中的 CLI 进程')).toBeInTheDocument()
  })

  it('shows agent list when agents are available', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'claude-code', type: 'worker', state: 'idle', capabilities: ['code-edit'] },
      { id: 'agent-2', name: 'gemini-cli', type: 'worker', state: 'running', capabilities: ['search'], pid: 1234, command: 'gemini chat' },
    ])

    render(<CLIProcessWorkshop />)

    // Wait for agents to load
    const claude = await screen.findByText('claude-code')
    expect(claude).toBeInTheDocument()
    expect(screen.getByText('gemini-cli')).toBeInTheDocument()
    expect(screen.getByText('code-edit')).toBeInTheDocument()
  })

  it('displays status indicators for each agent', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'claude-code', type: 'worker', state: 'idle' },
      { id: 'agent-2', name: 'gemini-cli', type: 'worker', state: 'running', pid: 5678 },
    ])

    render(<CLIProcessWorkshop />)

    // Running agent shows PID and memory
    const pidText = await screen.findByText(/PID: 5678/)
    expect(pidText).toBeInTheDocument()
  })

  it('dispatches sandbox:node-selected event on row click', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'claude-code', type: 'worker', state: 'idle' },
    ])
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    render(<CLIProcessWorkshop />)

    const row = await screen.findByText('claude-code')
    fireEvent.click(row)

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'sandbox:node-selected',
      }),
    )
    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    dispatchSpy.mockRestore()
  })

  it('opens config modal when config button is clicked', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'claude-code', type: 'worker', state: 'idle', command: '/usr/bin/claude' },
    ])

    render(<CLIProcessWorkshop />)

    // Wait for agent to render, then click config button
    await screen.findByText('claude-code')
    const configButton = screen.getByText('配置')
    expect(configButton).toBeInTheDocument()
    fireEvent.click(configButton)

    expect(screen.getByTestId('config-modal')).toBeInTheDocument()
  })

  it('closes config modal and refreshes agents on save', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'claude-code', type: 'worker', state: 'idle', command: '/usr/bin/claude' },
    ])

    render(<CLIProcessWorkshop />)

    await screen.findByText('claude-code')
    // Open config modal
    fireEvent.click(screen.getByText('配置'))
    expect(screen.getByTestId('config-modal')).toBeInTheDocument()

    // Click save
    fireEvent.click(screen.getByTestId('modal-save'))
    // getAgents is called again after save
    expect(mockGetAgents).toHaveBeenCalledTimes(2) // initial load + refresh after save
  })

  it('refreshes agent list periodically', async () => {
    vi.useFakeTimers()
    mockGetAgents.mockResolvedValue([])

    render(<CLIProcessWorkshop />)

    // Initial load
    expect(mockGetAgents).toHaveBeenCalledTimes(1)

    // Advance past the 10s interval
    await vi.advanceTimersByTimeAsync(10000)
    expect(mockGetAgents).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(10000)
    expect(mockGetAgents).toHaveBeenCalledTimes(3)

    vi.useRealTimers()
  })

  it('merges lifecycle state from store with agent info', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'claude-code', type: 'worker', state: 'idle' },
    ])
    // Simulate lifecycle store reporting this agent as "thinking"
    mockStore.agents = new Map([
      ['agent-1', { agentId: 'agent-1', name: 'claude-code', state: 'thinking', lastActive: '2026-01-01', capabilities: [] }],
    ])

    render(<CLIProcessWorkshop />)

    // The lifecycle state "thinking" should be used, showing "思考中"
    const statusText = await screen.findByText('思考中')
    expect(statusText).toBeInTheDocument()

    // Reset
    mockStore.agents = new Map()
  })
})
