import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mockGetSwarms = vi.fn().mockResolvedValue([])
const mockSubmitTask = vi.fn().mockResolvedValue({})
const mockGetSessions = vi.fn().mockResolvedValue([])
const mockSendMessage = vi.fn().mockResolvedValue({})
const mockAddToast = vi.fn()

vi.mock('../services', () => ({
  api: {
    swarm: {
      getSwarms: (...args: any[]) => mockGetSwarms(...args),
      submitTask: (...args: any[]) => mockSubmitTask(...args),
    },
    agent: {
      getSessions: (...args: any[]) => mockGetSessions(...args),
      sendMessage: (...args: any[]) => mockSendMessage(...args),
    },
  },
}))

vi.mock('../utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../store/appStore', () => ({
  useAppStore: (selector: any) => selector({ addToast: mockAddToast }),
}))

// Mutable task flow state so tests can override before import
let taskFlowState = { tasks: new Map() }

vi.mock('../stores/taskFlowStore', () => ({
  useTaskFlowStore: (selector: any) => selector(taskFlowState),
}))

// Must import after mock setup
import QueenDispatcher from './QueenDispatcher'

describe('QueenDispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    taskFlowState = { tasks: new Map() }
  })

  // --- Rendering ---

  it('renders strategy selector label', () => {
    render(<QueenDispatcher />)
    expect(screen.getByText(/蜂王策略/)).toBeInTheDocument()
  })

  it('renders all four strategy options', () => {
    render(<QueenDispatcher />)
    expect(screen.getByText(/轮询调度/)).toBeInTheDocument()
    expect(screen.getByText(/最小负载/)).toBeInTheDocument()
    expect(screen.getByText(/优先级调度/)).toBeInTheDocument()
    expect(screen.getByText(/能力匹配/)).toBeInTheDocument()
  })

  it('renders goal input with placeholder text', () => {
    render(<QueenDispatcher />)
    const input = screen.getByPlaceholderText(/下发全域调度目标/)
    expect(input).toBeInTheDocument()
    expect(input).toHaveValue('')
  })

  it('renders submit button with title', () => {
    render(<QueenDispatcher />)
    expect(screen.getByTitle('下发目标')).toBeInTheDocument()
  })

  it('renders SVG icons for strategy and submit', () => {
    const { container } = render(<QueenDispatcher />)
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThanOrEqual(2)
  })

  // --- Default state ---

  it('defaults to priority strategy', () => {
    render(<QueenDispatcher />)
    expect(screen.getByRole('combobox')).toHaveValue('priority')
  })

  it('disables submit button when goal is empty', () => {
    render(<QueenDispatcher />)
    expect(screen.getByTitle('下发目标')).toBeDisabled()
  })

  it('shows reduced opacity on submit button when disabled', () => {
    render(<QueenDispatcher />)
    expect(screen.getByTitle('下发目标')).toHaveStyle({ opacity: '0.5' })
  })

  // --- Strategy selection ---

  it('changes strategy to round_robin', () => {
    render(<QueenDispatcher />)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'round_robin' } })
    expect(select).toHaveValue('round_robin')
  })

  it('changes strategy to least_loaded', () => {
    render(<QueenDispatcher />)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'least_loaded' } })
    expect(select).toHaveValue('least_loaded')
  })

  it('changes strategy to capability', () => {
    render(<QueenDispatcher />)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'capability' } })
    expect(select).toHaveValue('capability')
  })

  // --- Goal input interactions ---

  it('enables submit button when goal has text', () => {
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: '重构主布局' } })
    expect(screen.getByTitle('下发目标')).not.toBeDisabled()
  })

  it('sets full opacity on submit button when enabled', () => {
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'some goal' } })
    expect(screen.getByTitle('下发目标')).toHaveStyle({ opacity: '1' })
  })

  it('disables submit when goal is only whitespace', () => {
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: '   ' } })
    expect(screen.getByTitle('下发目标')).toBeDisabled()
  })

  it('updates input value on typing', () => {
    render(<QueenDispatcher />)
    const input = screen.getByPlaceholderText(/下发全域调度目标/)
    fireEvent.change(input, { target: { value: 'hello world' } })
    expect(input).toHaveValue('hello world')
  })

  // --- Task submission: swarm path ---

  it('calls getSwarms and submitTask on valid submission', async () => {
    mockGetSwarms.mockResolvedValueOnce([{ id: 'swarm-1', strategy: 'priority' }])
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'build feature' } })
    fireEvent.click(screen.getByTitle('下发目标'))
    await waitFor(() => {
      expect(mockGetSwarms).toHaveBeenCalled()
      expect(mockSubmitTask).toHaveBeenCalledWith(
        expect.objectContaining({ swarmId: 'swarm-1', title: 'build feature' }),
      )
    })
  })

  it('picks matching swarm by strategy when available', async () => {
    mockGetSwarms.mockResolvedValueOnce([
      { id: 'swarm-wrong', strategy: 'round_robin' },
      { id: 'swarm-right', strategy: 'priority' },
    ])
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'test' } })
    fireEvent.click(screen.getByTitle('下发目标'))
    await waitFor(() => {
      expect(mockSubmitTask).toHaveBeenCalledWith(
        expect.objectContaining({ swarmId: 'swarm-right' }),
      )
    })
  })

  it('falls back to first swarm when no strategy match', async () => {
    mockGetSwarms.mockResolvedValueOnce([{ id: 'swarm-first', strategy: 'round_robin' }])
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'test' } })
    fireEvent.click(screen.getByTitle('下发目标'))
    await waitFor(() => {
      expect(mockSubmitTask).toHaveBeenCalledWith(
        expect.objectContaining({ swarmId: 'swarm-first' }),
      )
    })
  })

  it('sets priority to high for priority strategy', async () => {
    mockGetSwarms.mockResolvedValueOnce([{ id: 's1', strategy: 'priority' }])
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'important task' } })
    fireEvent.click(screen.getByTitle('下发目标'))
    await waitFor(() => {
      expect(mockSubmitTask).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 'high' }),
      )
    })
  })

  it('sets priority to medium for round_robin strategy', async () => {
    mockGetSwarms.mockResolvedValueOnce([{ id: 's1', strategy: 'round_robin' }])
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'round_robin' } })
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'test task' } })
    fireEvent.click(screen.getByTitle('下发目标'))
    await waitFor(() => {
      expect(mockSubmitTask).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 'medium' }),
      )
    })
  })

  it('sets priority to medium for least_loaded strategy', async () => {
    mockGetSwarms.mockResolvedValueOnce([{ id: 's1', strategy: 'least_loaded' }])
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'least_loaded' } })
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'test task' } })
    fireEvent.click(screen.getByTitle('下发目标'))
    await waitFor(() => {
      expect(mockSubmitTask).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 'medium' }),
      )
    })
  })

  it('sets priority to medium for capability strategy', async () => {
    mockGetSwarms.mockResolvedValueOnce([{ id: 's1', strategy: 'capability' }])
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'capability' } })
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'test task' } })
    fireEvent.click(screen.getByTitle('下发目标'))
    await waitFor(() => {
      expect(mockSubmitTask).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 'medium' }),
      )
    })
  })

  it('includes strategy label in description', async () => {
    mockGetSwarms.mockResolvedValueOnce([{ id: 's1', strategy: 'priority' }])
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'do work' } })
    fireEvent.click(screen.getByTitle('下发目标'))
    await waitFor(() => {
      expect(mockSubmitTask).toHaveBeenCalledWith(
        expect.objectContaining({ description: expect.stringContaining('优先级调度') }),
      )
    })
  })

  it('trims goal text in title and description', async () => {
    mockGetSwarms.mockResolvedValueOnce([{ id: 's1', strategy: 'priority' }])
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: '  padded task  ' } })
    fireEvent.click(screen.getByTitle('下发目标'))
    await waitFor(() => {
      expect(mockSubmitTask).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'padded task' }),
      )
    })
  })

  it('shows success toast after swarm submission', async () => {
    mockGetSwarms.mockResolvedValueOnce([{ id: 's1', strategy: 'priority' }])
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'great task' } })
    fireEvent.click(screen.getByTitle('下发目标'))
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('success', '目标已下发', expect.stringContaining('great task'))
    })
  })

  it('truncates toast message to first 30 chars', async () => {
    mockGetSwarms.mockResolvedValueOnce([{ id: 's1', strategy: 'priority' }])
    render(<QueenDispatcher />)
    const longGoal = 'a'.repeat(50)
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: longGoal } })
    fireEvent.click(screen.getByTitle('下发目标'))
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('success', '目标已下发', 'a'.repeat(30) + '...')
    })
  })

  it('clears goal after successful submission', async () => {
    mockGetSwarms.mockResolvedValueOnce([{ id: 's1', strategy: 'priority' }])
    render(<QueenDispatcher />)
    const input = screen.getByPlaceholderText(/下发全域调度目标/)
    fireEvent.change(input, { target: { value: 'clear me' } })
    fireEvent.click(screen.getByTitle('下发目标'))
    await waitFor(() => {
      expect(input).toHaveValue('')
    })
  })

  // --- Task submission: agent session fallback ---

  it('falls back to agent session when no swarms exist', async () => {
    mockGetSwarms.mockResolvedValueOnce([])
    mockGetSessions.mockResolvedValueOnce([{ id: 'session-1' }])
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'use session' } })
    fireEvent.click(screen.getByTitle('下发目标'))
    await waitFor(() => {
      expect(mockGetSessions).toHaveBeenCalled()
      expect(mockSendMessage).toHaveBeenCalledWith('session-1', 'use session')
    })
  })

  it('shows success toast after agent session submission', async () => {
    mockGetSwarms.mockResolvedValueOnce([])
    mockGetSessions.mockResolvedValueOnce([{ id: 'sess-1' }])
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'session task' } })
    fireEvent.click(screen.getByTitle('下发目标'))
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('success', '目标已下发', expect.any(String))
    })
  })

  it('clears goal after agent session submission', async () => {
    mockGetSwarms.mockResolvedValueOnce([])
    mockGetSessions.mockResolvedValueOnce([{ id: 'sess-1' }])
    render(<QueenDispatcher />)
    const input = screen.getByPlaceholderText(/下发全域调度目标/)
    fireEvent.change(input, { target: { value: 'clear after session' } })
    fireEvent.click(screen.getByTitle('下发目标'))
    await waitFor(() => {
      expect(input).toHaveValue('')
    })
  })

  // --- No resources available ---

  it('shows warning toast when no swarms or sessions', async () => {
    mockGetSwarms.mockResolvedValueOnce([])
    mockGetSessions.mockResolvedValueOnce([])
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'test goal' } })
    fireEvent.click(screen.getByTitle('下发目标'))
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('warning', '无可用的 Swarm 或 Agent 会话', '请先启动 Agent 或创建 Swarm')
    })
  })

  it('does not clear goal when no resources available', async () => {
    mockGetSwarms.mockResolvedValueOnce([])
    mockGetSessions.mockResolvedValueOnce([])
    render(<QueenDispatcher />)
    const input = screen.getByPlaceholderText(/下发全域调度目标/)
    fireEvent.change(input, { target: { value: 'stays here' } })
    fireEvent.click(screen.getByTitle('下发目标'))
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('warning', expect.any(String), expect.any(String))
    })
    expect(input).toHaveValue('stays here')
  })

  it('does not show success toast when no resources', async () => {
    mockGetSwarms.mockResolvedValueOnce([])
    mockGetSessions.mockResolvedValueOnce([])
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'test' } })
    fireEvent.click(screen.getByTitle('下发目标'))
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalled()
    })
    expect(mockAddToast).not.toHaveBeenCalledWith('success', expect.any(String), expect.any(String))
  })

  // --- Error handling ---

  it('shows error toast on API failure', async () => {
    mockGetSwarms.mockRejectedValueOnce(new Error('network error'))
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'fail test' } })
    fireEvent.click(screen.getByTitle('下发目标'))
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', '下发失败', '目标下发失败')
    })
  })

  it('logs warning on API failure', async () => {
    const { logger } = await import('../utils')
    const error = new Error('network error')
    mockGetSwarms.mockRejectedValueOnce(error)
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'fail test' } })
    fireEvent.click(screen.getByTitle('下发目标'))
    await waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith('QueenDispatcher: submit failed', error)
    })
  })

  it('resets submitting state after error', async () => {
    mockGetSwarms.mockRejectedValueOnce(new Error('fail'))
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'error case' } })
    const btn = screen.getByTitle('下发目标')
    fireEvent.click(btn)
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalled()
    })
    expect(btn).not.toBeDisabled()
  })

  it('does not clear goal on error', async () => {
    mockGetSwarms.mockRejectedValueOnce(new Error('fail'))
    render(<QueenDispatcher />)
    const input = screen.getByPlaceholderText(/下发全域调度目标/)
    fireEvent.change(input, { target: { value: 'keep this' } })
    fireEvent.click(screen.getByTitle('下发目标'))
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', expect.any(String), expect.any(String))
    })
    expect(input).toHaveValue('keep this')
  })

  // --- Submitting state (loading) ---

  it('disables input while submitting', async () => {
    let resolveSwarms: (v: any) => void
    mockGetSwarms.mockImplementationOnce(() => new Promise(r => { resolveSwarms = r }))
    render(<QueenDispatcher />)
    const input = screen.getByPlaceholderText(/下发全域调度目标/)
    fireEvent.change(input, { target: { value: 'submitting' } })
    fireEvent.click(screen.getByTitle('下发目标'))
    expect(input).toBeDisabled()
    resolveSwarms!([{ id: 's1', strategy: 'priority' }])
    await waitFor(() => {
      expect(input).not.toBeDisabled()
    })
  })

  it('disables submit button while submitting', async () => {
    let resolveSwarms: (v: any) => void
    mockGetSwarms.mockImplementationOnce(() => new Promise(r => { resolveSwarms = r }))
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'submitting' } })
    const btn = screen.getByTitle('下发目标')
    fireEvent.click(btn)
    expect(btn).toBeDisabled()
    resolveSwarms!([{ id: 's1', strategy: 'priority' }])
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalled()
    })
  })

  // --- Enter key submission ---

  it('submits on Enter key press', async () => {
    mockGetSwarms.mockResolvedValueOnce([{ id: 's1', strategy: 'priority' }])
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'test task' } })
    fireEvent.keyDown(screen.getByPlaceholderText(/下发全域调度目标/), { key: 'Enter' })
    await waitFor(() => {
      expect(mockSubmitTask).toHaveBeenCalled()
    })
  })

  it('does not submit on non-Enter key', () => {
    render(<QueenDispatcher />)
    fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'test task' } })
    fireEvent.keyDown(screen.getByPlaceholderText(/下发全域调度目标/), { key: 'Escape' })
    expect(mockGetSwarms).not.toHaveBeenCalled()
  })

  it('does not submit on Enter with empty goal', () => {
    render(<QueenDispatcher />)
    fireEvent.keyDown(screen.getByPlaceholderText(/下发全域调度目标/), { key: 'Enter' })
    expect(mockGetSwarms).not.toHaveBeenCalled()
  })

  // --- Recent tasks display ---

  it('shows no recent tasks when store is empty', () => {
    render(<QueenDispatcher />)
    expect(screen.queryByText(/等待中|执行中|已完成|失败|已取消/)).not.toBeInTheDocument()
  })

  it('displays up to 3 recent tasks sorted by creation time', () => {
    const tasks = new Map()
    tasks.set('t1', {
      taskId: 't1', swarmId: 's1', title: 'First task',
      status: 'completed', assignedAgents: [], handoffs: [], toolCalls: [],
      createdAt: '2026-01-01T10:00:00Z',
    })
    tasks.set('t2', {
      taskId: 't2', swarmId: 's1', title: 'Second task',
      status: 'running', assignedAgents: [], handoffs: [], toolCalls: [],
      createdAt: '2026-01-01T11:00:00Z',
    })
    tasks.set('t3', {
      taskId: 't3', swarmId: 's1', title: 'Third task',
      status: 'pending', assignedAgents: [], handoffs: [], toolCalls: [],
      createdAt: '2026-01-01T12:00:00Z',
    })
    tasks.set('t4', {
      taskId: 't4', swarmId: 's1', title: 'Old task',
      status: 'failed', assignedAgents: [], handoffs: [], toolCalls: [],
      createdAt: '2026-01-01T09:00:00Z',
    })
    taskFlowState = { tasks }

    render(<QueenDispatcher />)

    // Should show latest 3 (t3, t2, t1) but not t4 (oldest)
    expect(screen.getByText('Third task')).toBeInTheDocument()
    expect(screen.getByText('Second task')).toBeInTheDocument()
    expect(screen.getByText('First task')).toBeInTheDocument()
    expect(screen.queryByText('Old task')).not.toBeInTheDocument()
  })

  it('shows correct status labels for tasks', () => {
    const tasks = new Map()
    tasks.set('t1', {
      taskId: 't1', swarmId: 's1', title: 'Pending task',
      status: 'pending', assignedAgents: [], handoffs: [], toolCalls: [],
      createdAt: '2026-01-01T10:00:00Z',
    })
    tasks.set('t2', {
      taskId: 't2', swarmId: 's1', title: 'Running task',
      status: 'running', assignedAgents: [], handoffs: [], toolCalls: [],
      createdAt: '2026-01-01T11:00:00Z',
    })
    tasks.set('t3', {
      taskId: 't3', swarmId: 's1', title: 'Completed task',
      status: 'completed', assignedAgents: [], handoffs: [], toolCalls: [],
      createdAt: '2026-01-01T12:00:00Z',
    })
    taskFlowState = { tasks }

    render(<QueenDispatcher />)

    expect(screen.getByText('等待中')).toBeInTheDocument()
    expect(screen.getByText('执行中')).toBeInTheDocument()
    expect(screen.getByText('已完成')).toBeInTheDocument()
  })

  it('shows failed and cancelled status labels', () => {
    const tasks = new Map()
    tasks.set('t1', {
      taskId: 't1', swarmId: 's1', title: 'Failed task',
      status: 'failed', assignedAgents: [], handoffs: [], toolCalls: [],
      createdAt: '2026-01-01T10:00:00Z',
    })
    tasks.set('t2', {
      taskId: 't2', swarmId: 's1', title: 'Cancelled task',
      status: 'cancelled', assignedAgents: [], handoffs: [], toolCalls: [],
      createdAt: '2026-01-01T11:00:00Z',
    })
    taskFlowState = { tasks }

    render(<QueenDispatcher />)

    expect(screen.getByText('失败')).toBeInTheDocument()
    expect(screen.getByText('已取消')).toBeInTheDocument()
  })

  it('shows unknown status as-is for unrecognized statuses', () => {
    const tasks = new Map()
    tasks.set('t1', {
      taskId: 't1', swarmId: 's1', title: 'Custom task',
      status: 'custom_status', assignedAgents: [], handoffs: [], toolCalls: [],
      createdAt: '2026-01-01T10:00:00Z',
    })
    taskFlowState = { tasks }

    render(<QueenDispatcher />)

    expect(screen.getByText('custom_status')).toBeInTheDocument()
  })

  it('truncates long task titles with ellipsis', () => {
    const tasks = new Map()
    const longTitle = 'a'.repeat(30)
    tasks.set('t1', {
      taskId: 't1', swarmId: 's1', title: longTitle,
      status: 'running', assignedAgents: [], handoffs: [], toolCalls: [],
      createdAt: '2026-01-01T10:00:00Z',
    })
    taskFlowState = { tasks }

    render(<QueenDispatcher />)

    // Title > 24 chars should be truncated
    expect(screen.getByText('a'.repeat(22) + '..')).toBeInTheDocument()
  })

  it('shows short task titles without truncation', () => {
    const tasks = new Map()
    tasks.set('t1', {
      taskId: 't1', swarmId: 's1', title: 'Short title',
      status: 'running', assignedAgents: [], handoffs: [], toolCalls: [],
      createdAt: '2026-01-01T10:00:00Z',
    })
    taskFlowState = { tasks }

    render(<QueenDispatcher />)

    expect(screen.getByText('Short title')).toBeInTheDocument()
  })

  // --- Layout and styling ---

  it('has correct container background', () => {
    const { container } = render(<QueenDispatcher />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.background).toBe('rgb(22, 27, 34)') // #161b22
  })

  it('has top border on container', () => {
    const { container } = render(<QueenDispatcher />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.style.borderTop).toBe('1px solid rgb(48, 54, 61)') // #30363d
  })

  it('has select with correct background and text color', () => {
    render(<QueenDispatcher />)
    const select = screen.getByRole('combobox')
    expect(select.style.background).toBe('rgb(13, 17, 23)') // #0d1117
    expect(select.style.color).toBe('rgb(209, 213, 219)') // #d1d5db
  })

  it('has input with transparent background', () => {
    render(<QueenDispatcher />)
    const input = screen.getByPlaceholderText(/下发全域调度目标/)
    expect(input.className).toContain('bg-transparent')
  })

  it('submit button has accent background', () => {
    render(<QueenDispatcher />)
    const btn = screen.getByTitle('下发目标')
    expect(btn.style.background).toBe('rgb(88, 166, 255)') // #58a6ff
  })

  // --- Additional edge cases and branches ---

  describe('Strategy descriptions', () => {
    it('displays Round Robin description for round_robin option', () => {
      render(<QueenDispatcher />)
      expect(screen.getByText(/Round Robin/)).toBeInTheDocument()
    })

    it('displays Least Loaded description for least_loaded option', () => {
      render(<QueenDispatcher />)
      expect(screen.getByText(/Least Loaded/)).toBeInTheDocument()
    })

    it('displays Capability Match description for capability option', () => {
      render(<QueenDispatcher />)
      expect(screen.getByText(/Capability Match/)).toBeInTheDocument()
    })

    it('displays Priority Based description for priority option', () => {
      render(<QueenDispatcher />)
      expect(screen.getByText(/Priority Based/)).toBeInTheDocument()
    })
  })

  describe('Strategy selection interactions', () => {
    it('switches from priority to least_loaded and submits with medium priority', async () => {
      mockGetSwarms.mockResolvedValueOnce([{ id: 's1', strategy: 'least_loaded' }])
      render(<QueenDispatcher />)
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'least_loaded' } })
      fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'test goal' } })
      fireEvent.click(screen.getByTitle('下发目标'))
      await waitFor(() => {
        expect(mockSubmitTask).toHaveBeenCalledWith(
          expect.objectContaining({ priority: 'medium' }),
        )
      })
    })

    it('switches to capability strategy and submits with medium priority', async () => {
      mockGetSwarms.mockResolvedValueOnce([{ id: 's1', strategy: 'capability' }])
      render(<QueenDispatcher />)
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'capability' } })
      fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'cap goal' } })
      fireEvent.click(screen.getByTitle('下发目标'))
      await waitFor(() => {
        expect(mockSubmitTask).toHaveBeenCalledWith(
          expect.objectContaining({ priority: 'medium' }),
        )
      })
    })
  })

  describe('Error handling edge cases', () => {
    it('handles non-Error thrown values in catch block', async () => {
      mockGetSwarms.mockRejectedValueOnce('string error')
      render(<QueenDispatcher />)
      fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'test' } })
      fireEvent.click(screen.getByTitle('下发目标'))
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', '下发失败', '目标下发失败')
      })
    })

    it('handles null rejection in catch block', async () => {
      mockGetSwarms.mockRejectedValueOnce(null)
      render(<QueenDispatcher />)
      fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'test' } })
      fireEvent.click(screen.getByTitle('下发目标'))
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', '下发失败', '目标下发失败')
      })
    })

    it('logs warning with the rejected value', async () => {
      const { logger } = await import('../utils')
      const errObj = new Error('specific fail')
      mockGetSwarms.mockRejectedValueOnce(errObj)
      render(<QueenDispatcher />)
      fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'test' } })
      fireEvent.click(screen.getByTitle('下发目标'))
      await waitFor(() => {
        expect(logger.warn).toHaveBeenCalledWith('QueenDispatcher: submit failed', errObj)
      })
    })
  })

  describe('Agent session fallback edge cases', () => {
    it('does not call sendMessage when no sessions available', async () => {
      mockGetSwarms.mockResolvedValueOnce([])
      mockGetSessions.mockResolvedValueOnce([])
      render(<QueenDispatcher />)
      fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'no session' } })
      fireEvent.click(screen.getByTitle('下发目标'))
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('warning', expect.any(String), expect.any(String))
      })
      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('uses first session ID from available sessions', async () => {
      mockGetSwarms.mockResolvedValueOnce([])
      mockGetSessions.mockResolvedValueOnce([{ id: 'sess-a' }, { id: 'sess-b' }])
      render(<QueenDispatcher />)
      fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'multi session' } })
      fireEvent.click(screen.getByTitle('下发目标'))
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith('sess-a', 'multi session')
      })
    })
  })

  describe('Recent tasks edge cases', () => {
    it('shows exactly 3 tasks when more than 3 exist', () => {
      const tasks = new Map()
      for (let i = 0; i < 5; i++) {
        tasks.set(`t${i}`, {
          taskId: `t${i}`, swarmId: 's1', title: `Task ${i}`,
          status: 'pending', assignedAgents: [], handoffs: [], toolCalls: [],
          createdAt: new Date(Date.now() + i * 1000).toISOString(),
        })
      }
      taskFlowState = { tasks }

      render(<QueenDispatcher />)

      // Only 3 should be displayed
      for (let i = 2; i < 5; i++) {
        expect(screen.getByText(`Task ${i}`)).toBeInTheDocument()
      }
      expect(screen.queryByText('Task 0')).not.toBeInTheDocument()
      expect(screen.queryByText('Task 1')).not.toBeInTheDocument()
    })

    it('shows single task correctly', () => {
      const tasks = new Map()
      tasks.set('t1', {
        taskId: 't1', swarmId: 's1', title: 'Only Task',
        status: 'running', assignedAgents: [], handoffs: [], toolCalls: [],
        createdAt: '2026-01-01T10:00:00Z',
      })
      taskFlowState = { tasks }

      render(<QueenDispatcher />)
      expect(screen.getByText('Only Task')).toBeInTheDocument()
    })

    it('handles task with exactly 24 character title without truncation', () => {
      const tasks = new Map()
      const title24 = 'a'.repeat(24)
      tasks.set('t1', {
        taskId: 't1', swarmId: 's1', title: title24,
        status: 'running', assignedAgents: [], handoffs: [], toolCalls: [],
        createdAt: '2026-01-01T10:00:00Z',
      })
      taskFlowState = { tasks }

      render(<QueenDispatcher />)
      expect(screen.getByText(title24)).toBeInTheDocument()
    })

    it('handles task with exactly 25 character title with truncation', () => {
      const tasks = new Map()
      const title25 = 'a'.repeat(25)
      tasks.set('t1', {
        taskId: 't1', swarmId: 's1', title: title25,
        status: 'running', assignedAgents: [], handoffs: [], toolCalls: [],
        createdAt: '2026-01-01T10:00:00Z',
      })
      taskFlowState = { tasks }

      render(<QueenDispatcher />)
      // 25 > 24 so it should be truncated to 22 + '..'
      expect(screen.getByText('a'.repeat(22) + '..')).toBeInTheDocument()
    })
  })

  describe('Status label colors', () => {
    it('uses correct color for running status', () => {
      const tasks = new Map()
      tasks.set('t1', {
        taskId: 't1', swarmId: 's1', title: 'Running',
        status: 'running', assignedAgents: [], handoffs: [], toolCalls: [],
        createdAt: '2026-01-01T10:00:00Z',
      })
      taskFlowState = { tasks }

      const { container } = render(<QueenDispatcher />)

      // Find the status dot (first span with rounded-full)
      const dot = container.querySelector('.rounded-full') as HTMLElement
      expect(dot.style.background).toBe('rgb(88, 166, 255)') // #58a6ff
    })

    it('uses correct color for completed status', () => {
      const tasks = new Map()
      tasks.set('t1', {
        taskId: 't1', swarmId: 's1', title: 'Completed',
        status: 'completed', assignedAgents: [], handoffs: [], toolCalls: [],
        createdAt: '2026-01-01T10:00:00Z',
      })
      taskFlowState = { tasks }

      const { container } = render(<QueenDispatcher />)

      const dot = container.querySelector('.rounded-full') as HTMLElement
      expect(dot.style.background).toBe('rgb(63, 185, 80)') // #3fb950
    })

    it('uses correct color for failed status', () => {
      const tasks = new Map()
      tasks.set('t1', {
        taskId: 't1', swarmId: 's1', title: 'Failed',
        status: 'failed', assignedAgents: [], handoffs: [], toolCalls: [],
        createdAt: '2026-01-01T10:00:00Z',
      })
      taskFlowState = { tasks }

      const { container } = render(<QueenDispatcher />)

      const dot = container.querySelector('.rounded-full') as HTMLElement
      expect(dot.style.background).toBe('rgb(248, 81, 73)') // #f85149
    })

    it('uses correct color for pending status', () => {
      const tasks = new Map()
      tasks.set('t1', {
        taskId: 't1', swarmId: 's1', title: 'Pending',
        status: 'pending', assignedAgents: [], handoffs: [], toolCalls: [],
        createdAt: '2026-01-01T10:00:00Z',
      })
      taskFlowState = { tasks }

      const { container } = render(<QueenDispatcher />)

      const dot = container.querySelector('.rounded-full') as HTMLElement
      expect(dot.style.background).toBe('rgb(107, 114, 128)') // #6b7280
    })

    it('uses correct color for cancelled status', () => {
      const tasks = new Map()
      tasks.set('t1', {
        taskId: 't1', swarmId: 's1', title: 'Cancelled',
        status: 'cancelled', assignedAgents: [], handoffs: [], toolCalls: [],
        createdAt: '2026-01-01T10:00:00Z',
      })
      taskFlowState = { tasks }

      const { container } = render(<QueenDispatcher />)

      const dot = container.querySelector('.rounded-full') as HTMLElement
      expect(dot.style.background).toBe('rgb(107, 114, 128)') // #6b7280
    })

    it('uses default color for unknown status', () => {
      const tasks = new Map()
      tasks.set('t1', {
        taskId: 't1', swarmId: 's1', title: 'Unknown',
        status: 'unknown_status', assignedAgents: [], handoffs: [], toolCalls: [],
        createdAt: '2026-01-01T10:00:00Z',
      })
      taskFlowState = { tasks }

      const { container } = render(<QueenDispatcher />)

      const dot = container.querySelector('.rounded-full') as HTMLElement
      expect(dot.style.background).toBe('rgb(107, 114, 128)') // #6b7280
    })
  })

  describe('Task title text color', () => {
    it('displays task titles with secondary text color', () => {
      const tasks = new Map()
      tasks.set('t1', {
        taskId: 't1', swarmId: 's1', title: 'Colored Title',
        status: 'running', assignedAgents: [], handoffs: [], toolCalls: [],
        createdAt: '2026-01-01T10:00:00Z',
      })
      taskFlowState = { tasks }

      render(<QueenDispatcher />)

      const titleSpan = screen.getByText('Colored Title')
      expect(titleSpan.style.color).toBe('rgb(156, 163, 175)') // #9ca3af
    })

    it('displays status label text with status color', () => {
      const tasks = new Map()
      tasks.set('t1', {
        taskId: 't1', swarmId: 's1', title: 'Status Color',
        status: 'running', assignedAgents: [], handoffs: [], toolCalls: [],
        createdAt: '2026-01-01T10:00:00Z',
      })
      taskFlowState = { tasks }

      render(<QueenDispatcher />)

      const statusLabel = screen.getByText('执行中')
      expect(statusLabel.style.color).toBe('rgb(88, 166, 255)') // #58a6ff
    })
  })

  describe('Submitting state interactions', () => {
    it('does not submit when goal is only whitespace via Enter', () => {
      render(<QueenDispatcher />)
      fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: '   ' } })
      fireEvent.keyDown(screen.getByPlaceholderText(/下发全域调度目标/), { key: 'Enter' })
      expect(mockGetSwarms).not.toHaveBeenCalled()
    })

    it('recovers submitting state after successful submission', async () => {
      mockGetSwarms.mockResolvedValueOnce([{ id: 's1', strategy: 'priority' }])
      render(<QueenDispatcher />)
      const input = screen.getByPlaceholderText(/下发全域调度目标/)
      const btn = screen.getByTitle('下发目标')
      fireEvent.change(input, { target: { value: 'task' } })
      fireEvent.click(btn)
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalled()
      })
      // Input should be cleared after success
      expect(input).toHaveValue('')
      // Button is disabled because goal is empty (not because submitting)
      expect(btn).toBeDisabled()
      // Input should no longer be disabled
      expect(input).not.toBeDisabled()
    })
  })

  describe('Container layout', () => {
    it('has flex-col layout', () => {
      const { container } = render(<QueenDispatcher />)
      const wrapper = container.firstChild as HTMLElement
      expect(wrapper.className).toContain('flex-col')
    })

    it('has gap-2 spacing', () => {
      const { container } = render(<QueenDispatcher />)
      const wrapper = container.firstChild as HTMLElement
      expect(wrapper.className).toContain('gap-2')
    })

    it('has shrink-0 class', () => {
      const { container } = render(<QueenDispatcher />)
      const wrapper = container.firstChild as HTMLElement
      expect(wrapper.className).toContain('shrink-0')
    })
  })

  describe('Goal input styling', () => {
    it('has mono font class', () => {
      render(<QueenDispatcher />)
      const input = screen.getByPlaceholderText(/下发全域调度目标/)
      expect(input.className).toContain('font-mono')
    })

    it('has correct text color', () => {
      render(<QueenDispatcher />)
      const input = screen.getByPlaceholderText(/下发全域调度目标/)
      expect(input.style.color).toBe('rgb(209, 213, 219)') // #d1d5db
    })
  })

  describe('Strategy label styling', () => {
    it('has font-mono class on strategy row', () => {
      const { container } = render(<QueenDispatcher />)
      const strategyRow = container.querySelector('.font-mono')
      expect(strategyRow).toBeInTheDocument()
    })

    it('has correct text color on strategy label', () => {
      const { container } = render(<QueenDispatcher />)
      const strategyRow = container.querySelector('.font-mono') as HTMLElement
      expect(strategyRow.style.color).toBe('rgb(107, 114, 128)') // #6b7280
    })
  })

  describe('Swarm submission with matching strategy', () => {
    it('prefers round_robin swarm when round_robin strategy selected', async () => {
      mockGetSwarms.mockResolvedValueOnce([
        { id: 's-priority', strategy: 'priority' },
        { id: 's-rr', strategy: 'round_robin' },
      ])
      render(<QueenDispatcher />)
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'round_robin' } })
      fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'test' } })
      fireEvent.click(screen.getByTitle('下发目标'))
      await waitFor(() => {
        expect(mockSubmitTask).toHaveBeenCalledWith(
          expect.objectContaining({ swarmId: 's-rr' }),
        )
      })
    })

    it('prefers least_loaded swarm when least_loaded strategy selected', async () => {
      mockGetSwarms.mockResolvedValueOnce([
        { id: 's-priority', strategy: 'priority' },
        { id: 's-ll', strategy: 'least_loaded' },
      ])
      render(<QueenDispatcher />)
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'least_loaded' } })
      fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'test' } })
      fireEvent.click(screen.getByTitle('下发目标'))
      await waitFor(() => {
        expect(mockSubmitTask).toHaveBeenCalledWith(
          expect.objectContaining({ swarmId: 's-ll' }),
        )
      })
    })

    it('prefers capability swarm when capability strategy selected', async () => {
      mockGetSwarms.mockResolvedValueOnce([
        { id: 's-priority', strategy: 'priority' },
        { id: 's-cap', strategy: 'capability' },
      ])
      render(<QueenDispatcher />)
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'capability' } })
      fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'test' } })
      fireEvent.click(screen.getByTitle('下发目标'))
      await waitFor(() => {
        expect(mockSubmitTask).toHaveBeenCalledWith(
          expect.objectContaining({ swarmId: 's-cap' }),
        )
      })
    })
  })

  describe('Submit button hover state', () => {
    it('has hover:bg-blue-600 class', () => {
      render(<QueenDispatcher />)
      const btn = screen.getByTitle('下发目标')
      expect(btn.className).toContain('hover:bg-blue-600')
    })
  })

  describe('Description formatting', () => {
    it('includes correct Chinese strategy label in description for least_loaded', async () => {
      mockGetSwarms.mockResolvedValueOnce([{ id: 's1', strategy: 'least_loaded' }])
      render(<QueenDispatcher />)
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'least_loaded' } })
      fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'test' } })
      fireEvent.click(screen.getByTitle('下发目标'))
      await waitFor(() => {
        expect(mockSubmitTask).toHaveBeenCalledWith(
          expect.objectContaining({ description: expect.stringContaining('最小负载') }),
        )
      })
    })

    it('includes correct Chinese strategy label in description for round_robin', async () => {
      mockGetSwarms.mockResolvedValueOnce([{ id: 's1', strategy: 'round_robin' }])
      render(<QueenDispatcher />)
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'round_robin' } })
      fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'test' } })
      fireEvent.click(screen.getByTitle('下发目标'))
      await waitFor(() => {
        expect(mockSubmitTask).toHaveBeenCalledWith(
          expect.objectContaining({ description: expect.stringContaining('轮询调度') }),
        )
      })
    })

    it('includes correct Chinese strategy label in description for capability', async () => {
      mockGetSwarms.mockResolvedValueOnce([{ id: 's1', strategy: 'capability' }])
      render(<QueenDispatcher />)
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'capability' } })
      fireEvent.change(screen.getByPlaceholderText(/下发全域调度目标/), { target: { value: 'test' } })
      fireEvent.click(screen.getByTitle('下发目标'))
      await waitFor(() => {
        expect(mockSubmitTask).toHaveBeenCalledWith(
          expect.objectContaining({ description: expect.stringContaining('能力匹配') }),
        )
      })
    })
  })
})
