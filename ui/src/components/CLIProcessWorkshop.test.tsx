import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CLIProcessWorkshop from './CLIProcessWorkshop'

const mockGetAgents = vi.fn()

vi.mock('../services', () => ({
  api: {
    agent: {
      getAgents: (...args: unknown[]) => mockGetAgents(...args),
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
  useAgentLifecycleStore: (selector?: (state: typeof mockStore) => unknown) =>
    selector ? selector(mockStore) : mockStore,
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

  // --- New tests for expanded coverage ---

  it('clears interval on unmount', async () => {
    vi.useFakeTimers()
    mockGetAgents.mockResolvedValue([])
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    const { unmount } = render(<CLIProcessWorkshop />)
    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
    vi.useRealTimers()
  })

  it('handles API error on initial load gracefully', async () => {
    mockGetAgents.mockRejectedValue(new Error('Network error'))
    render(<CLIProcessWorkshop />)
    // Should show empty state since no agents loaded
    expect(screen.getByText('暂无运行中的 CLI 进程')).toBeInTheDocument()
  })

  it('handles API error on periodic refresh', async () => {
    vi.useFakeTimers()
    let callCount = 0
    mockGetAgents.mockImplementation(() => {
      callCount++
      if (callCount <= 1) return Promise.resolve([])
      return Promise.reject(new Error('Timer refresh error'))
    })

    render(<CLIProcessWorkshop />)
    await vi.advanceTimersByTimeAsync(10000)
    // Should not throw
    expect(mockGetAgents).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('shows "thinking" status with correct status text', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'test-agent', type: 'worker', state: 'thinking' },
    ])

    render(<CLIProcessWorkshop />)
    expect(await screen.findByText('思考中')).toBeInTheDocument()
  })

  it('shows "stuck" status with correct status text', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'test-agent', type: 'worker', state: 'stuck' },
    ])

    render(<CLIProcessWorkshop />)
    expect(await screen.findByText('已卡住')).toBeInTheDocument()
  })

  it('shows "blocked" status with correct status text', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'test-agent', type: 'worker', state: 'error' },
    ])

    render(<CLIProcessWorkshop />)
    expect(await screen.findByText('被安全闸阻断：等候特权核准执行')).toBeInTheDocument()
  })

  it('shows "running" status with correct status text', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'test-agent', type: 'worker', state: 'running' },
    ])

    render(<CLIProcessWorkshop />)
    expect(await screen.findByText('执行中')).toBeInTheDocument()
  })

  it('shows "stopped" status with correct status text', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'test-agent', type: 'worker', state: 'stopped' },
    ])

    render(<CLIProcessWorkshop />)
    expect(await screen.findByText('stopped')).toBeInTheDocument()
  })

  it('shows "idle" status with correct text', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'test-agent', type: 'worker', state: 'idle' },
    ])

    render(<CLIProcessWorkshop />)
    expect(await screen.findByText('idle (sleeping)')).toBeInTheDocument()
  })

  it('handles agent with no capabilities showing dash', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'test-agent', type: 'worker', state: 'idle', capabilities: [] },
    ])

    render(<CLIProcessWorkshop />)
    // Version column shows '-' when no capabilities
    const versionCells = await screen.findAllByText('-')
    expect(versionCells.length).toBeGreaterThanOrEqual(1)
  })

  it('shows no PID when agent has no pid', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'test-agent', type: 'worker', state: 'idle' },
    ])

    render(<CLIProcessWorkshop />)
    // Should show dash in PID column for agents without pid
    const dashElements = await screen.findAllByText('-')
    expect(dashElements.length).toBeGreaterThanOrEqual(1)
  })

  it('shows running command for running agent', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'test-agent', type: 'worker', state: 'running', command: 'npm run build' },
    ])

    render(<CLIProcessWorkshop />)
    expect(await screen.findByText('npm run build')).toBeInTheDocument()
  })

  it('uses lifecycle state over agent state', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'test-agent', type: 'worker', state: 'idle' },
    ])
    // Lifecycle says running, agent says idle
    mockStore.agents = new Map([
      ['agent-1', { agentId: 'agent-1', name: 'test-agent', state: 'running', lastActive: '2026-01-01', capabilities: [] }],
    ])

    render(<CLIProcessWorkshop />)
    expect(await screen.findByText('执行中')).toBeInTheDocument()

    mockStore.agents = new Map()
  })

  it('shows name color for gemini agents', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'gemini-cli', type: 'worker', state: 'idle' },
    ])

    render(<CLIProcessWorkshop />)
    const name = await screen.findByText('gemini-cli')
    // gemini should have cyan color - jsdom converts hex to rgb()
    expect(name.closest('td')).toBeTruthy()
    expect(name.closest('td')?.style.color).toBe('rgb(34, 211, 238)')
  })

  it('shows name color for claude agents', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'claude-code', type: 'worker', state: 'idle' },
    ])

    render(<CLIProcessWorkshop />)
    const name = await screen.findByText('claude-code')
    expect(name.closest('td')?.style.color).toBe('rgb(251, 146, 60)')
  })

  it('shows name color for mcp agents', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'mcp-server', type: 'worker', state: 'idle' },
    ])

    render(<CLIProcessWorkshop />)
    const name = await screen.findByText('mcp-server')
    expect(name.closest('td')?.style.color).toBe('rgb(192, 132, 252)')
  })

  it('shows name color for validation agents', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'validation-agent', type: 'worker', state: 'idle' },
    ])

    render(<CLIProcessWorkshop />)
    const name = await screen.findByText('validation-agent')
    expect(name.closest('td')?.style.color).toBe('rgb(192, 132, 252)')
  })

  it('shows name color for aider agents', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'aider', type: 'worker', state: 'idle' },
    ])

    render(<CLIProcessWorkshop />)
    const name = await screen.findByText('aider')
    expect(name.closest('td')?.style.color).toBe('rgb(74, 222, 128)')
  })

  it('shows name color for running unknown agent', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'custom-agent', type: 'worker', state: 'running' },
    ])

    render(<CLIProcessWorkshop />)
    const name = await screen.findByText('custom-agent')
    expect(name.closest('td')?.style.color).toBe('rgb(156, 163, 175)')
  })

  it('shows name color for blocked unknown agent', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'custom-agent', type: 'worker', state: 'error' },
    ])

    render(<CLIProcessWorkshop />)
    const name = await screen.findByText('custom-agent')
    expect(name.closest('td')?.style.color).toBe('rgb(156, 163, 175)')
  })

  it('shows default name color for idle unknown agent', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'custom-agent', type: 'worker', state: 'idle' },
    ])

    render(<CLIProcessWorkshop />)
    const name = await screen.findByText('custom-agent')
    expect(name.closest('td')?.style.color).toBe('rgb(156, 163, 175)')
  })

  it('highlights selected row', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'test-agent', type: 'worker', state: 'idle' },
      { id: 'agent-2', name: 'other-agent', type: 'worker', state: 'idle' },
    ])

    render(<CLIProcessWorkshop />)
    await screen.findByText('test-agent')

    // Click first row
    fireEvent.click(screen.getByText('test-agent'))
    const row = screen.getByText('test-agent').closest('tr')
    expect(row?.style.background).toBe('rgba(88, 166, 255, 0.05)')
  })


  it('uses agent type for role when available', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'test-agent', type: 'supervisor', state: 'idle' },
    ])

    render(<CLIProcessWorkshop />)
    expect(await screen.findByText('supervisor')).toBeInTheDocument()
  })

  it('defaults role to worker when no type', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'test-agent', state: 'idle' },
    ])

    render(<CLIProcessWorkshop />)
    expect(await screen.findByText('worker')).toBeInTheDocument()
  })

  it('renders table headers', () => {
    render(<CLIProcessWorkshop />)
    expect(screen.getByText('工具/进程 ID (CLI BINARY)')).toBeInTheDocument()
    expect(screen.getByText('核心职能 (ROLE)')).toBeInTheDocument()
    expect(screen.getByText('版本 (VERSION)')).toBeInTheDocument()
    expect(screen.getByText('PID / 内存 (RESOURCES)')).toBeInTheDocument()
    expect(screen.getByText('当前执行 CLI 指令 (RUNNING COMMAND)')).toBeInTheDocument()
  })

  it('estimates memory correctly for known agents', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'claude-code', type: 'worker', state: 'running', pid: 100 },
    ])

    render(<CLIProcessWorkshop />)
    expect(await screen.findByText(/142MB/)).toBeInTheDocument()
  })

  it('estimates default memory for unknown agents', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'unknown-agent', type: 'worker', state: 'running', pid: 200 },
    ])

    render(<CLIProcessWorkshop />)
    expect(await screen.findByText(/80MB/)).toBeInTheDocument()
  })

  it('handles agent with unknown state as stopped', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'test-agent', type: 'worker', state: 'unknown-state' },
    ])

    render(<CLIProcessWorkshop />)
    expect(await screen.findByText('stopped')).toBeInTheDocument()
  })

  it('handles agent with no state or status field', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'test-agent', type: 'worker' },
    ])

    render(<CLIProcessWorkshop />)
    // No state => toProcess gets undefined => state becomes 'unknown' => 'stopped'
    expect(await screen.findByText('stopped')).toBeInTheDocument()
  })

  it('shows command for idle agent with command', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'test-agent', type: 'worker', state: 'idle', command: 'npm start' },
    ])

    render(<CLIProcessWorkshop />)
    expect(await screen.findByText('npm start')).toBeInTheDocument()
  })

  it('dispatches custom event with correct detail on row click', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-42', name: 'test-agent', type: 'worker', state: 'idle' },
    ])

    let capturedDetail: Record<string, string> | null = null
    const handler = (e: Event) => {
      capturedDetail = (e as CustomEvent).detail as Record<string, string>
    }
    window.addEventListener('sandbox:node-selected', handler)

    render(<CLIProcessWorkshop />)
    fireEvent.click(await screen.findByText('test-agent'))

    expect(capturedDetail).toEqual({ agentId: 'agent-42', agentName: 'test-agent' })
    window.removeEventListener('sandbox:node-selected', handler)
  })

  it('shows stuck status in command column with correct color', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'test-agent', type: 'worker', state: 'stuck', command: 'some-cmd' },
    ])

    render(<CLIProcessWorkshop />)
    const stuckText = await screen.findByText('已卡住')
    expect(stuckText).toBeInTheDocument()
    expect(stuckText.closest('span')?.style.color).toBe('rgb(251, 191, 36)')
  })

  it('shows blocked status in command column with correct color', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'agent-1', name: 'test-agent', type: 'worker', state: 'error', command: 'some-cmd' },
    ])

    render(<CLIProcessWorkshop />)
    const blockedText = await screen.findByText('被安全闸阻断：等候特权核准执行')
    expect(blockedText).toBeInTheDocument()
    expect(blockedText.closest('span')?.style.color).toBe('rgb(249, 115, 22)')
  })

})
