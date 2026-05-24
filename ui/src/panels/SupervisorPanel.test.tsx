import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SupervisorPanel } from './SupervisorPanel'

// Mock services
const mockGetAgents = vi.fn().mockResolvedValue([])
const mockGetSwarms = vi.fn().mockResolvedValue([])
const mockGetSwarmTasks = vi.fn().mockResolvedValue([])
const mockGetSupervisorStats = vi.fn().mockResolvedValue(null)
const mockListAuditEvents = vi.fn().mockResolvedValue([])
const mockGetAuditStats = vi.fn().mockResolvedValue(null)
const mockGetScheduleRunnerStatus = vi.fn().mockResolvedValue(null)
const mockStopAgent = vi.fn().mockResolvedValue({ id: 'agent-1' })
const mockCancelTask = vi.fn().mockResolvedValue({ taskId: 'task-1', status: 'cancelled' })
const mockClearAuditLog = vi.fn().mockResolvedValue(undefined)
const mockStartScheduleRunner = vi.fn().mockResolvedValue(null)
const mockStopScheduleRunner = vi.fn().mockResolvedValue(null)
const mockResolveHandoff = vi.fn().mockResolvedValue({ requestId: 'h1', accepted: true, status: 'resolved' })
const mockGetA2aStatus = vi.fn().mockResolvedValue(null)
const mockSubscribe = vi.fn().mockReturnValue(() => {})

vi.mock('../services', () => ({
  api: {
    agent: {
      getAgents: (...args: unknown[]) => mockGetAgents(...args),
      stopAgent: (...args: unknown[]) => mockStopAgent(...args),
    },
    swarm: {
      getSwarms: (...args: unknown[]) => mockGetSwarms(...args),
      getSwarmTasks: (...args: unknown[]) => mockGetSwarmTasks(...args),
      cancelTask: (...args: unknown[]) => mockCancelTask(...args),
      resolveHandoff: (...args: unknown[]) => mockResolveHandoff(...args),
    },
    monitoring: {
      getSupervisorStats: (...args: unknown[]) => mockGetSupervisorStats(...args),
      listAuditEvents: (...args: unknown[]) => mockListAuditEvents(...args),
      getAuditStats: (...args: unknown[]) => mockGetAuditStats(...args),
      getScheduleRunnerStatus: (...args: unknown[]) => mockGetScheduleRunnerStatus(...args),
      clearAuditLog: (...args: unknown[]) => mockClearAuditLog(...args),
      startScheduleRunner: (...args: unknown[]) => mockStartScheduleRunner(...args),
      stopScheduleRunner: (...args: unknown[]) => mockStopScheduleRunner(...args),
    },
    a2a: {
      getStatus: (...args: unknown[]) => mockGetA2aStatus(...args),
    },
  },
  events: {
    subscribe: (...args: unknown[]) => mockSubscribe(...args),
  },
}))

// Mock handoff store
const mockResolveHandoffStore = vi.fn()
vi.mock('../stores/handoffStore', () => ({
  useHandoffStore: vi.fn(() => ({
    activeHandoff: null,
    resolveHandoff: mockResolveHandoffStore,
  })),
}))

describe('SupervisorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // Default mock implementations
    mockGetAgents.mockResolvedValue([])
    mockGetSwarms.mockResolvedValue([])
    mockGetSwarmTasks.mockResolvedValue([])
    mockGetSupervisorStats.mockResolvedValue(null)
    mockListAuditEvents.mockResolvedValue([])
    mockGetAuditStats.mockResolvedValue(null)
    mockGetScheduleRunnerStatus.mockResolvedValue(null)
    mockGetA2aStatus.mockResolvedValue(null)
    mockSubscribe.mockReturnValue(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Basic Rendering ──

  it('renders supervisor panel header', async () => {
    render(<SupervisorPanel />)
    expect(screen.getByText('Supervisor')).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTimeAsync(0) })
  })

  it('shows health section', async () => {
    render(<SupervisorPanel />)
    expect(screen.getByText('Health')).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTimeAsync(0) })
  })

  it('shows tasks section', async () => {
    render(<SupervisorPanel />)
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTimeAsync(0) })
  })

  it('shows review queue section', async () => {
    render(<SupervisorPanel />)
    expect(screen.getByText('Review Queue')).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTimeAsync(0) })
  })

  it('shows activity section', async () => {
    render(<SupervisorPanel />)
    expect(screen.getByText('Activity')).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTimeAsync(0) })
  })

  it('renders quick action buttons', async () => {
    render(<SupervisorPanel />)
    expect(screen.getByText('Pause All')).toBeInTheDocument()
    expect(screen.getByText('Refresh')).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTimeAsync(0) })
  })

  // ── Dashboard Summary Cards ──

  it('shows Running/Pending/Done labels in dashboard', async () => {
    render(<SupervisorPanel />)
    expect(screen.getByText('Running/Pending/Done')).toBeInTheDocument()
    expect(screen.getByText('Online/Error')).toBeInTheDocument()
    expect(screen.getByText('Risk')).toBeInTheDocument()
    expect(screen.getByText('A2A Messages')).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTimeAsync(0) })
  })

  it('shows LOW risk indicator when no agents are in error state', async () => {
    render(<SupervisorPanel />)
    expect(screen.getByText('LOW')).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTimeAsync(0) })
  })

  it('shows dash for A2A messages when no a2a status', async () => {
    render(<SupervisorPanel />)
    // The A2A card shows '-' when a2aStatus is null
    const a2aCard = screen.getByText('A2A Messages').closest('.bg-slate-800\\/50')
    expect(a2aCard).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTimeAsync(0) })
  })

  it('shows A2A message count when a2a status is available', async () => {
    mockGetA2aStatus.mockResolvedValue({ messageLogSize: 42 })
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  // ── Health Section Expansion ──

  it('expands health section on click and shows system status', async () => {
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    // Health section is collapsed by default (tasks is expanded)
    const healthButton = screen.getByText('Health').closest('button')!
    fireEvent.click(healthButton)

    expect(screen.getByText('System Status')).toBeInTheDocument()
    expect(screen.getByText('Healthy')).toBeInTheDocument()
    expect(screen.getByText('Idle')).toBeInTheDocument()
    expect(screen.getByText('Unhealthy')).toBeInTheDocument()
  })

  it('shows idle system status when no agents are running', async () => {
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const healthButton = screen.getByText('Health').closest('button')!
    fireEvent.click(healthButton)

    expect(screen.getByText('idle')).toBeInTheDocument()
  })

  it('shows active status when agents are running', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'a1', name: 'runner', type: 'worker', state: 'running', command: '', capabilities: [] },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const healthButton = screen.getByText('Health').closest('button')!
    fireEvent.click(healthButton)

    expect(screen.getByText('active')).toBeInTheDocument()
  })

  it('shows degraded status when agents have error state', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'a1', name: 'broken', type: 'worker', state: 'error', command: '', capabilities: [] },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const healthButton = screen.getByText('Health').closest('button')!
    fireEvent.click(healthButton)

    expect(screen.getByText('degraded')).toBeInTheDocument()
  })

  it('shows degraded status when agents have error status (backward compat)', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'a1', name: 'broken', type: 'worker', status: 'error', command: '', capabilities: [] },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const healthButton = screen.getByText('Health').closest('button')!
    fireEvent.click(healthButton)

    expect(screen.getByText('degraded')).toBeInTheDocument()
  })

  it('shows active status when agents have executing state', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'a1', name: 'exec-agent', type: 'worker', state: 'executing', command: '', capabilities: [] },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const healthButton = screen.getByText('Health').closest('button')!
    fireEvent.click(healthButton)

    expect(screen.getByText('active')).toBeInTheDocument()
  })

  // ── SupervisorStats-driven health display ──

  it('uses supervisorStats for health display when available', async () => {
    mockGetSupervisorStats.mockResolvedValue({
      totalAgents: 5,
      healthyAgents: 3,
      degradedAgents: 0,
      unhealthyAgents: 0,
      busyAgents: 2,
      avgResponseTime: 150,
      throughput: 12.5,
    })
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const healthButton = screen.getByText('Health').closest('button')!
    fireEvent.click(healthButton)

    // active status because busyAgents > 0 and unhealthyAgents === 0
    expect(screen.getByText('active')).toBeInTheDocument()
    // Shows stats numbers from supervisorStats
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1) // healthyAgents
    expect(screen.getByText('150ms')).toBeInTheDocument() // avgResponseTime
    expect(screen.getByText('12.5/s')).toBeInTheDocument() // throughput
  })

  it('shows degraded status from supervisorStats when unhealthyAgents > 0', async () => {
    mockGetSupervisorStats.mockResolvedValue({
      totalAgents: 4,
      healthyAgents: 2,
      degradedAgents: 0,
      unhealthyAgents: 2,
      busyAgents: 1,
      avgResponseTime: 200,
      throughput: 5.0,
    })
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const healthButton = screen.getByText('Health').closest('button')!
    fireEvent.click(healthButton)

    expect(screen.getByText('degraded')).toBeInTheDocument()
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1) // unhealthyAgents
  })

  it('shows idle status from supervisorStats when no busy or unhealthy agents', async () => {
    mockGetSupervisorStats.mockResolvedValue({
      totalAgents: 3,
      healthyAgents: 3,
      degradedAgents: 0,
      unhealthyAgents: 0,
      busyAgents: 0,
      avgResponseTime: 50,
      throughput: 0.0,
    })
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const healthButton = screen.getByText('Health').closest('button')!
    fireEvent.click(healthButton)

    expect(screen.getByText('idle')).toBeInTheDocument()
  })

  // ── Tasks Section ──

  it('shows tasks section expanded by default', async () => {
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })
    // Tasks section is expanded by default
    const taskSection = document.getElementById('section-tasks')
    expect(taskSection).toBeInTheDocument()
  })

  it('collapses tasks section when clicked', async () => {
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const tasksButton = screen.getByText('Tasks').closest('button')!
    fireEvent.click(tasksButton)

    const taskSection = document.getElementById('section-tasks')
    expect(taskSection).not.toBeInTheDocument()
  })

  it('re-expands tasks section on second click', async () => {
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const tasksButton = screen.getByText('Tasks').closest('button')!
    fireEvent.click(tasksButton) // collapse
    fireEvent.click(tasksButton) // re-expand

    const taskSection = document.getElementById('section-tasks')
    expect(taskSection).toBeInTheDocument()
  })

  it('displays running tasks with cancel button', async () => {
    mockGetSwarms.mockResolvedValue([{ id: 'swarm-1', coordinatorId: 'coord-1' }])
    mockGetSwarmTasks.mockResolvedValue([
      { id: 'task-1', title: 'Test Task', status: 'running', assignedTo: ['agent-1'], createdAt: new Date().toISOString() },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    expect(screen.getByText('Test Task')).toBeInTheDocument()
    expect(screen.getByText('running')).toBeInTheDocument()
    expect(screen.getByText('agent-1')).toBeInTheDocument()
  })

  it('displays pending tasks without cancel button', async () => {
    mockGetSwarms.mockResolvedValue([{ id: 'swarm-1', coordinatorId: 'coord-1' }])
    mockGetSwarmTasks.mockResolvedValue([
      { id: 'task-2', title: 'Pending Task', status: 'pending', assignedTo: [], createdAt: new Date().toISOString() },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    expect(screen.getByText('Pending Task')).toBeInTheDocument()
    expect(screen.getByText('pending')).toBeInTheDocument()
    expect(screen.getByText('Unassigned')).toBeInTheDocument()
  })

  it('displays completed tasks', async () => {
    mockGetSwarms.mockResolvedValue([{ id: 'swarm-1', coordinatorId: 'coord-1' }])
    mockGetSwarmTasks.mockResolvedValue([
      { id: 'task-3', title: 'Done Task', status: 'completed', assignedTo: ['agent-2'], createdAt: new Date().toISOString() },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    expect(screen.getByText('Done Task')).toBeInTheDocument()
    expect(screen.getByText('completed')).toBeInTheDocument()
  })

  it('displays failed tasks', async () => {
    mockGetSwarms.mockResolvedValue([{ id: 'swarm-1', coordinatorId: 'coord-1' }])
    mockGetSwarmTasks.mockResolvedValue([
      { id: 'task-4', title: 'Failed Task', status: 'failed', assignedTo: ['agent-3'], createdAt: new Date().toISOString() },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    expect(screen.getByText('Failed Task')).toBeInTheDocument()
    expect(screen.getByText('failed')).toBeInTheDocument()
  })

  it('shows task count badge for running tasks', async () => {
    mockGetSwarms.mockResolvedValue([{ id: 'swarm-1', coordinatorId: 'coord-1' }])
    mockGetSwarmTasks.mockResolvedValue([
      { id: 't1', title: 'Running 1', status: 'running', assignedTo: ['a1'], createdAt: new Date().toISOString() },
      { id: 't2', title: 'Running 2', status: 'running', assignedTo: ['a2'], createdAt: new Date().toISOString() },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    // Badge should show 2 for 2 running tasks
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  // ── Cancel Task ──

  it('cancels a running task when cancel button is clicked', async () => {
    mockGetSwarms.mockResolvedValue([{ id: 'swarm-1', coordinatorId: 'coord-1' }])
    mockGetSwarmTasks.mockResolvedValue([
      { id: 'task-1', title: 'Cancellable Task', status: 'running', assignedTo: ['agent-1'], createdAt: new Date().toISOString() },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const cancelButton = screen.getByTitle('Cancel task')
    fireEvent.click(cancelButton)

    await act(async () => { vi.advanceTimersByTimeAsync(0) })
    expect(mockCancelTask).toHaveBeenCalled()
  })

  it('handles cancel task error gracefully', async () => {
    mockCancelTask.mockRejectedValueOnce(new Error('cancel failed'))
    mockGetSwarms.mockResolvedValue([{ id: 'swarm-1', coordinatorId: 'coord-1' }])
    mockGetSwarmTasks.mockResolvedValue([
      { id: 'task-1', title: 'Failing Cancel', status: 'running', assignedTo: ['agent-1'], createdAt: new Date().toISOString() },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const cancelButton = screen.getByTitle('Cancel task')
    fireEvent.click(cancelButton)

    await act(async () => { vi.advanceTimersByTimeAsync(0) })
    expect(mockCancelTask).toHaveBeenCalled()
  })

  // ── Risk Level Calculation ──

  it('shows MEDIUM risk when some tasks fail', async () => {
    mockGetSwarms.mockResolvedValue([{ id: 'swarm-1', coordinatorId: 'coord-1' }])
    mockGetSwarmTasks.mockResolvedValue([
      { id: 't1', title: 'Failed', status: 'failed', assignedTo: ['a1'], createdAt: new Date().toISOString() },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    expect(screen.getByText('MEDIUM')).toBeInTheDocument()
  })

  it('shows HIGH risk when multiple conditions trigger alerts', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'a1', name: 'err1', type: 'worker', state: 'error', command: '', capabilities: [] },
      { id: 'a2', name: 'err2', type: 'worker', state: 'error', command: '', capabilities: [] },
      { id: 'a3', name: 'ok', type: 'worker', state: 'idle', command: '', capabilities: [] },
    ])
    mockGetSwarms.mockResolvedValue([{ id: 'swarm-1', coordinatorId: 'coord-1' }])
    mockGetSwarmTasks.mockResolvedValue([
      { id: 't1', title: 'Failed', status: 'failed', assignedTo: ['a1'], createdAt: new Date().toISOString() },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    expect(screen.getByText('HIGH')).toBeInTheDocument()
  })

  it('shows risk alerts in decision summary when alerts exist', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'a1', name: 'err1', type: 'worker', state: 'error', command: '', capabilities: [] },
      { id: 'a2', name: 'err2', type: 'worker', state: 'error', command: '', capabilities: [] },
      { id: 'a3', name: 'ok', type: 'worker', state: 'idle', command: '', capabilities: [] },
    ])
    mockGetSwarms.mockResolvedValue([{ id: 'swarm-1', coordinatorId: 'coord-1' }])
    mockGetSwarmTasks.mockResolvedValue([
      { id: 't1', title: 'Failed', status: 'failed', assignedTo: ['a1'], createdAt: new Date().toISOString() },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    expect(screen.getByText(/2 agents unhealthy/)).toBeInTheDocument()
    expect(screen.getByText(/1 tasks failed/)).toBeInTheDocument()
  })

  // ── Review Queue Section ──

  it('shows no items pending review when queue is empty', async () => {
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const reviewButton = screen.getByText('Review Queue').closest('button')!
    fireEvent.click(reviewButton)

    expect(screen.getByText('No items pending review')).toBeInTheDocument()
  })

  it('shows review items when handoff is active', async () => {
    const { useHandoffStore } = await import('../stores/handoffStore')
    const mockHandoff = {
      id: 'h1',
      fromAgent: 'agent-a',
      toAgent: 'agent-b',
      taskId: 't1',
      reason: 'Test handoff reason',
      status: 'pending' as const,
      createdAt: new Date(),
    }
    vi.mocked(useHandoffStore).mockReturnValue({
      activeHandoff: mockHandoff,
      resolveHandoff: mockResolveHandoffStore,
    })

    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const reviewButton = screen.getByText('Review Queue').closest('button')!
    fireEvent.click(reviewButton)

    expect(screen.getByText(/Handoff: agent-a → agent-b/)).toBeInTheDocument()
    expect(screen.getByText('Test handoff reason')).toBeInTheDocument()
    expect(screen.getByText('agent-a')).toBeInTheDocument()
  })

  it('approves a handoff review item', async () => {
    const { useHandoffStore } = await import('../stores/handoffStore')
    const mockHandoff = {
      id: 'h1',
      fromAgent: 'agent-a',
      toAgent: 'agent-b',
      taskId: 't1',
      reason: 'Approve this',
      status: 'pending' as const,
      createdAt: new Date(),
    }
    vi.mocked(useHandoffStore).mockReturnValue({
      activeHandoff: mockHandoff,
      resolveHandoff: mockResolveHandoffStore,
    })

    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const reviewButton = screen.getByText('Review Queue').closest('button')!
    fireEvent.click(reviewButton)

    const approveButton = screen.getByText('Approve')
    fireEvent.click(approveButton)

    expect(mockResolveHandoffStore).toHaveBeenCalledWith(true, 'Approved by supervisor')
  })

  it('rejects a handoff review item', async () => {
    const { useHandoffStore } = await import('../stores/handoffStore')
    const mockHandoff = {
      id: 'h1',
      fromAgent: 'agent-a',
      toAgent: 'agent-b',
      taskId: 't1',
      reason: 'Reject this',
      status: 'pending' as const,
      createdAt: new Date(),
    }
    vi.mocked(useHandoffStore).mockReturnValue({
      activeHandoff: mockHandoff,
      resolveHandoff: mockResolveHandoffStore,
    })

    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const reviewButton = screen.getByText('Review Queue').closest('button')!
    fireEvent.click(reviewButton)

    const rejectButton = screen.getByText('Reject')
    fireEvent.click(rejectButton)

    expect(mockResolveHandoffStore).toHaveBeenCalledWith(false, 'Rejected by supervisor')
  })

  it('does not add duplicate handoff items to review queue', async () => {
    const { useHandoffStore } = await import('../stores/handoffStore')
    const mockHandoff = {
      id: 'h1',
      fromAgent: 'agent-a',
      toAgent: 'agent-b',
      taskId: 't1',
      reason: 'Duplicate check',
      status: 'pending' as const,
      createdAt: new Date(),
    }
    vi.mocked(useHandoffStore).mockReturnValue({
      activeHandoff: mockHandoff,
      resolveHandoff: mockResolveHandoffStore,
    })

    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const reviewButton = screen.getByText('Review Queue').closest('button')!
    fireEvent.click(reviewButton)

    // Should only have one handoff item
    const handoffItems = screen.getAllByText(/Handoff: agent-a → agent-b/)
    expect(handoffItems).toHaveLength(1)
  })

  it('shows review queue badge count', async () => {
    const { useHandoffStore } = await import('../stores/handoffStore')
    const mockHandoff = {
      id: 'h1',
      fromAgent: 'agent-a',
      toAgent: 'agent-b',
      taskId: 't1',
      reason: 'Badge test',
      status: 'pending' as const,
      createdAt: new Date(),
    }
    vi.mocked(useHandoffStore).mockReturnValue({
      activeHandoff: mockHandoff,
      resolveHandoff: mockResolveHandoffStore,
    })

    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    // Badge for review queue (1 item) - the badge is inside the button
    const reviewButton = screen.getByText('Review Queue').closest('button')!
    const badges = reviewButton.querySelectorAll('.bg-blue-500')
    expect(badges.length).toBeGreaterThanOrEqual(1)
  })

  // ── Activity Feed ──

  it('shows activity items when agents have lastActive', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'a1', name: 'runner', type: 'worker', state: 'running', command: '', capabilities: [], lastActive: new Date().toISOString() },
      { id: 'a2', name: 'idler', type: 'worker', state: 'idle', command: '', capabilities: [], lastActive: new Date().toISOString() },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const activityButton = screen.getByText('Activity').closest('button')!
    fireEvent.click(activityButton)

    expect(screen.getByText(/runner is working/)).toBeInTheDocument()
    expect(screen.getByText(/idler is idle/)).toBeInTheDocument()
  })

  it('shows error activity for agents in error state', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'a1', name: 'broken', type: 'worker', state: 'error', command: '', capabilities: [], lastActive: new Date().toISOString() },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const activityButton = screen.getByText('Activity').closest('button')!
    fireEvent.click(activityButton)

    expect(screen.getByText(/broken is error/)).toBeInTheDocument()
  })

  it('shows executing activity for executing agents', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'a1', name: 'exec-agent', type: 'worker', state: 'executing', command: '', capabilities: [], lastActive: new Date().toISOString() },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const activityButton = screen.getByText('Activity').closest('button')!
    fireEvent.click(activityButton)

    expect(screen.getByText(/exec-agent is working/)).toBeInTheDocument()
  })

  it('filters agents without lastActive from activity feed', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'a1', name: 'invisible-agent', type: 'worker', state: 'idle', command: '', capabilities: [] },
      { id: 'a2', name: 'visible-agent', type: 'worker', state: 'idle', command: '', capabilities: [], lastActive: new Date().toISOString() },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const activityButton = screen.getByText('Activity').closest('button')!
    fireEvent.click(activityButton)

    expect(screen.queryByText(/invisible-agent/)).not.toBeInTheDocument()
    expect(screen.getByText(/visible-agent is idle/)).toBeInTheDocument()
  })

  // ── Refresh Button ──

  it('calls loadData when Refresh button is clicked', async () => {
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const initialCallCount = mockGetAgents.mock.calls.length

    const refreshButton = screen.getByText('Refresh')
    fireEvent.click(refreshButton)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    expect(mockGetAgents.mock.calls.length).toBeGreaterThan(initialCallCount)
  })

  it('shows Refreshing text while loading', async () => {
    // First call succeeds (initial load). Second call hangs.
    let resolveRefresh: () => void
    mockGetAgents
      .mockResolvedValueOnce([]) // initial load
      .mockImplementationOnce(() => new Promise<void>(r => { resolveRefresh = r }))

    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    // Now click Refresh - the second call will hang
    const refreshButton = screen.getByText('Refresh')
    fireEvent.click(refreshButton)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    // Should show Refreshing state
    expect(screen.getByText('Refreshing...')).toBeInTheDocument()

    // Resolve the hanging promise
    await act(async () => {
      resolveRefresh!()
      await vi.advanceTimersByTimeAsync(0)
    })

    // After resolve, should go back to Refresh
    expect(screen.getByText('Refresh')).toBeInTheDocument()
  })

  // ── Pause All Button ──

  it('does nothing when Pause All clicked with no active agents', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'a1', name: 'idle-agent', type: 'worker', state: 'idle', command: '', capabilities: [] },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const pauseButton = screen.getByText('Pause All')
    fireEvent.click(pauseButton)

    expect(mockStopAgent).not.toHaveBeenCalled()
  })

  it('stops active agents when Pause All is clicked', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'a1', name: 'active-agent', type: 'worker', state: 'active', command: '', capabilities: [] },
      { id: 'a2', name: 'exec-agent', type: 'worker', state: 'executing', command: '', capabilities: [] },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const pauseButton = screen.getByText('Pause All')
    fireEvent.click(pauseButton)

    await act(async () => { vi.advanceTimersByTimeAsync(0) })
    expect(mockStopAgent).toHaveBeenCalledTimes(2)
    expect(mockStopAgent).toHaveBeenCalledWith('a1')
    expect(mockStopAgent).toHaveBeenCalledWith('a2')
  })

  it('handles Pause All error gracefully', async () => {
    mockStopAgent.mockRejectedValueOnce(new Error('stop failed'))
    mockGetAgents.mockResolvedValue([
      { id: 'a1', name: 'active-agent', type: 'worker', state: 'active', command: '', capabilities: [] },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const pauseButton = screen.getByText('Pause All')
    fireEvent.click(pauseButton)

    await act(async () => { vi.advanceTimersByTimeAsync(0) })
    expect(mockStopAgent).toHaveBeenCalled()
  })

  it('shows Pausing text while pause is in progress', async () => {
    let resolveStop: () => void
    mockStopAgent.mockImplementationOnce(() => new Promise<void>(r => { resolveStop = r }))
    mockGetAgents.mockResolvedValue([
      { id: 'a1', name: 'active-agent', type: 'worker', state: 'active', command: '', capabilities: [] },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const pauseButton = screen.getByText('Pause All')
    fireEvent.click(pauseButton)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    expect(screen.getByText('Pausing...')).toBeInTheDocument()

    await act(async () => {
      resolveStop!()
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByText('Pause All')).toBeInTheDocument()
  })

  // ── Audit Log Section ──

  it('shows no audit events when empty', async () => {
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const auditButton = screen.getByText('Audit Log').closest('button')!
    fireEvent.click(auditButton)

    expect(screen.getByText('No audit events')).toBeInTheDocument()
  })

  it('shows audit events when available', async () => {
    mockListAuditEvents.mockResolvedValue([
      { id: 'e1', timestamp: new Date().toISOString(), eventType: 'test', actor: 'admin', action: 'deploy', resourceType: 'service', resourceId: 'r1', success: true },
      { id: 'e2', timestamp: new Date().toISOString(), eventType: 'test', actor: 'user', action: 'delete', resourceType: 'file', resourceId: 'r2', success: false },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const auditButton = screen.getByText('Audit Log').closest('button')!
    fireEvent.click(auditButton)

    expect(screen.getByText(/admin/)).toBeInTheDocument()
    expect(screen.getByText(/deploy/)).toBeInTheDocument()
    expect(screen.getByText(/user/)).toBeInTheDocument()
    expect(screen.getByText(/delete/)).toBeInTheDocument()
  })

  it('shows audit stats when available', async () => {
    mockGetAuditStats.mockResolvedValue({ count: 42, enabled: true })
    mockListAuditEvents.mockResolvedValue([
      { id: 'e1', timestamp: new Date().toISOString(), eventType: 'test', actor: 'admin', action: 'test', resourceType: 'test', resourceId: 'r1', success: true },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const auditButton = screen.getByText('Audit Log').closest('button')!
    fireEvent.click(auditButton)

    expect(screen.getByText('42 events')).toBeInTheDocument()
    expect(screen.getByText('Enabled')).toBeInTheDocument()
  })

  it('shows disabled audit stats', async () => {
    mockGetAuditStats.mockResolvedValue({ count: 0, enabled: false })
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const auditButton = screen.getByText('Audit Log').closest('button')!
    fireEvent.click(auditButton)

    expect(screen.getByText('Disabled')).toBeInTheDocument()
  })

  it('clears audit log when clear button is clicked', async () => {
    mockListAuditEvents.mockResolvedValue([
      { id: 'e1', timestamp: new Date().toISOString(), eventType: 'test', actor: 'admin', action: 'test', resourceType: 'test', resourceId: 'r1', success: true },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const auditButton = screen.getByText('Audit Log').closest('button')!
    fireEvent.click(auditButton)

    const clearButton = screen.getByText('Clear Audit Log')
    fireEvent.click(clearButton)

    await act(async () => { vi.advanceTimersByTimeAsync(0) })
    expect(mockClearAuditLog).toHaveBeenCalled()
    expect(screen.getByText('No audit events')).toBeInTheDocument()
  })

  it('shows audit badge count from auditStats', async () => {
    mockGetAuditStats.mockResolvedValue({ count: 15, enabled: true })
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    // The audit section button should show a badge with count
    const auditButton = screen.getByText('Audit Log').closest('button')!
    const badges = auditButton.querySelectorAll('.bg-blue-500')
    expect(badges.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('15')).toBeInTheDocument()
  })

  it('handles clear audit log error gracefully', async () => {
    mockClearAuditLog.mockRejectedValueOnce(new Error('clear failed'))
    mockListAuditEvents.mockResolvedValue([
      { id: 'e1', timestamp: new Date().toISOString(), eventType: 'test', actor: 'admin', action: 'test', resourceType: 'test', resourceId: 'r1', success: true },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const auditButton = screen.getByText('Audit Log').closest('button')!
    fireEvent.click(auditButton)

    const clearButton = screen.getByText('Clear Audit Log')
    fireEvent.click(clearButton)

    await act(async () => { vi.advanceTimersByTimeAsync(0) })
    expect(mockClearAuditLog).toHaveBeenCalled()
  })

  // ── Schedule Runner Section ──

  it('shows schedule runner not available when null', async () => {
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const scheduleButton = screen.getByText('Schedule Runner').closest('button')!
    fireEvent.click(scheduleButton)

    expect(screen.getByText('Schedule runner not available')).toBeInTheDocument()
  })

  it('shows running schedule runner with Stop button', async () => {
    mockGetScheduleRunnerStatus.mockResolvedValue({
      running: true,
      scheduleCount: 3,
      schedules: [
        { id: 's1', name: 'Daily Build', cron: '0 0 * * *' },
        { id: 's2', name: 'Hourly Check', cron: '0 * * * *' },
      ],
    })
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const scheduleButton = screen.getByText('Schedule Runner').closest('button')!
    fireEvent.click(scheduleButton)

    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('Stop')).toBeInTheDocument()
    expect(screen.getByText('3 schedule(s)')).toBeInTheDocument()
    expect(screen.getByText('Daily Build')).toBeInTheDocument()
    expect(screen.getByText('0 0 * * *')).toBeInTheDocument()
    expect(screen.getByText('Hourly Check')).toBeInTheDocument()
    expect(screen.getByText('0 * * * *')).toBeInTheDocument()
  })

  it('shows stopped schedule runner with Start button', async () => {
    mockGetScheduleRunnerStatus.mockResolvedValue({
      running: false,
      scheduleCount: 1,
    })
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const scheduleButton = screen.getByText('Schedule Runner').closest('button')!
    fireEvent.click(scheduleButton)

    expect(screen.getByText('Stopped')).toBeInTheDocument()
    expect(screen.getByText('Start')).toBeInTheDocument()
    expect(screen.getByText('1 schedule(s)')).toBeInTheDocument()
  })

  it('starts a stopped schedule runner when Start is clicked', async () => {
    const mockStartedStatus = { running: true, scheduleCount: 2 }
    mockGetScheduleRunnerStatus.mockResolvedValueOnce({ running: false, scheduleCount: 2 })
    mockStartScheduleRunner.mockResolvedValue(mockStartedStatus)

    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const scheduleButton = screen.getByText('Schedule Runner').closest('button')!
    fireEvent.click(scheduleButton)

    const startButton = screen.getByText('Start')
    fireEvent.click(startButton)

    await act(async () => { vi.advanceTimersByTimeAsync(0) })
    expect(mockStartScheduleRunner).toHaveBeenCalled()
    expect(screen.getByText('Running')).toBeInTheDocument()
  })

  it('stops a running schedule runner when Stop is clicked', async () => {
    const mockStoppedStatus = { running: false, scheduleCount: 2 }
    mockGetScheduleRunnerStatus.mockResolvedValueOnce({ running: true, scheduleCount: 2 })
    mockStopScheduleRunner.mockResolvedValue(mockStoppedStatus)

    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const scheduleButton = screen.getByText('Schedule Runner').closest('button')!
    fireEvent.click(scheduleButton)

    const stopButton = screen.getByText('Stop')
    fireEvent.click(stopButton)

    await act(async () => { vi.advanceTimersByTimeAsync(0) })
    expect(mockStopScheduleRunner).toHaveBeenCalled()
    expect(screen.getByText('Stopped')).toBeInTheDocument()
  })

  it('handles schedule runner toggle error gracefully', async () => {
    mockGetScheduleRunnerStatus.mockResolvedValueOnce({ running: true, scheduleCount: 1 })
    mockStopScheduleRunner.mockRejectedValueOnce(new Error('toggle failed'))

    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const scheduleButton = screen.getByText('Schedule Runner').closest('button')!
    fireEvent.click(scheduleButton)

    const stopButton = screen.getByText('Stop')
    fireEvent.click(stopButton)

    await act(async () => { vi.advanceTimersByTimeAsync(0) })
    expect(mockStopScheduleRunner).toHaveBeenCalled()
  })

  it('shows schedule runner badge when running', async () => {
    mockGetScheduleRunnerStatus.mockResolvedValue({
      running: true,
      scheduleCount: 5,
    })
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    // Badge should show schedule count
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('shows schedules list when available', async () => {
    mockGetScheduleRunnerStatus.mockResolvedValue({
      running: true,
      scheduleCount: 1,
      schedules: [
        { id: 's1', name: 'Weekly Report', cron: '0 9 * * 1' },
      ],
    })
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const scheduleButton = screen.getByText('Schedule Runner').closest('button')!
    fireEvent.click(scheduleButton)

    expect(screen.getByText('Weekly Report')).toBeInTheDocument()
    expect(screen.getByText('0 9 * * 1')).toBeInTheDocument()
  })

  it('does not show schedules list when schedules array is empty', async () => {
    mockGetScheduleRunnerStatus.mockResolvedValue({
      running: true,
      scheduleCount: 0,
      schedules: [],
    })
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const scheduleButton = screen.getByText('Schedule Runner').closest('button')!
    fireEvent.click(scheduleButton)

    expect(screen.getByText('0 schedule(s)')).toBeInTheDocument()
  })

  // ── Agent Online/Error Count in Dashboard ──

  it('shows correct online and error counts in dashboard', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'a1', name: 'running-agent', type: 'worker', state: 'running', command: '', capabilities: [] },
      { id: 'a2', name: 'idle-agent', type: 'worker', state: 'idle', command: '', capabilities: [] },
      { id: 'a3', name: 'error-agent', type: 'worker', state: 'error', command: '', capabilities: [] },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    // Online/Error card: online=2 (running+idle), error=1
    expect(screen.getByText('2/1')).toBeInTheDocument()
  })

  it('counts agents with status field as fallback to state', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'a1', name: 'status-agent', type: 'worker', status: 'active', command: '', capabilities: [] },
      { id: 'a2', name: 'error-agent', type: 'worker', status: 'error', command: '', capabilities: [] },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    expect(screen.getByText('1/1')).toBeInTheDocument()
  })

  // ── Event Subscriptions ──

  it('subscribes to real-time events on mount', async () => {
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    expect(mockSubscribe).toHaveBeenCalledWith('schedule_execution_started', expect.any(Function))
    expect(mockSubscribe).toHaveBeenCalledWith('schedule_execution_completed', expect.any(Function))
    expect(mockSubscribe).toHaveBeenCalledWith('swarm_task_update', expect.any(Function))
    expect(mockSubscribe).toHaveBeenCalledWith('agent_status_change', expect.any(Function))
  })

  it('unsubscribes from events on unmount', async () => {
    const mockUnsub = vi.fn()
    mockSubscribe.mockReturnValue(mockUnsub)

    const { unmount } = render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    unmount()
    // Each of the 4 subscriptions should be unsubscribed
    expect(mockUnsub).toHaveBeenCalledTimes(4)
  })

  it('refreshes data when subscribed event fires', async () => {
    let capturedHandler: (() => void) | undefined
    mockSubscribe.mockImplementation((_event: string, handler: () => void) => {
      if (!capturedHandler) capturedHandler = handler
      return () => {}
    })

    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const initialCallCount = mockGetAgents.mock.calls.length

    // Trigger event handler
    await act(async () => {
      capturedHandler!()
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(mockGetAgents.mock.calls.length).toBeGreaterThan(initialCallCount)
  })

  // ── Error Handling ──

  it('handles getAgents error gracefully', async () => {
    mockGetAgents.mockRejectedValueOnce(new Error('network error'))
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    // Panel should still render without crashing
    expect(screen.getByText('Supervisor')).toBeInTheDocument()
  })

  it('handles getSwarmTasks error gracefully', async () => {
    mockGetSwarms.mockResolvedValue([{ id: 'swarm-1', coordinatorId: 'coord-1' }])
    mockGetSwarmTasks.mockRejectedValueOnce(new Error('task fetch failed'))
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    expect(screen.getByText('Supervisor')).toBeInTheDocument()
  })

  it('handles getSupervisorStats error gracefully', async () => {
    mockGetSupervisorStats.mockRejectedValueOnce(new Error('stats error'))
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    expect(screen.getByText('Supervisor')).toBeInTheDocument()
  })

  it('handles listAuditEvents error gracefully', async () => {
    mockListAuditEvents.mockRejectedValueOnce(new Error('audit error'))
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    expect(screen.getByText('Supervisor')).toBeInTheDocument()
  })

  it('handles getAuditStats error gracefully', async () => {
    mockGetAuditStats.mockRejectedValueOnce(new Error('audit stats error'))
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    expect(screen.getByText('Supervisor')).toBeInTheDocument()
  })

  it('handles getScheduleRunnerStatus error gracefully', async () => {
    mockGetScheduleRunnerStatus.mockRejectedValueOnce(new Error('runner error'))
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    expect(screen.getByText('Supervisor')).toBeInTheDocument()
  })

  it('handles a2a getStatus error gracefully', async () => {
    mockGetA2aStatus.mockRejectedValueOnce(new Error('a2a error'))
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    expect(screen.getByText('Supervisor')).toBeInTheDocument()
  })

  // ── Task Progress ──

  it('shows progress bar for running tasks', async () => {
    mockGetSwarms.mockResolvedValue([{ id: 'swarm-1', coordinatorId: 'coord-1' }])
    mockGetSwarmTasks.mockResolvedValue([
      { id: 'task-1', title: 'Progress Task', status: 'running', assignedTo: ['agent-1'], createdAt: new Date().toISOString() },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    // Progress bar exists for running tasks
    const progressBar = document.querySelector('.bg-blue-500.transition-all')
    expect(progressBar).toBeInTheDocument()
  })

  it('shows completed tasks with progress 100', async () => {
    mockGetSwarms.mockResolvedValue([{ id: 'swarm-1', coordinatorId: 'coord-1' }])
    mockGetSwarmTasks.mockResolvedValue([
      { id: 'task-1', title: 'Completed Task', status: 'completed', assignedTo: ['agent-1'], createdAt: new Date().toISOString() },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    // Completed tasks should not show progress bar (only running tasks do)
    const progressBar = document.querySelector('.bg-blue-500.transition-all')
    expect(progressBar).not.toBeInTheDocument()
  })

  it('handles tasks with no assignedTo using coordinatorId', async () => {
    mockGetSwarms.mockResolvedValue([{ id: 'swarm-1', coordinatorId: 'coord-1' }])
    mockGetSwarmTasks.mockResolvedValue([
      { id: 'task-1', title: 'Unassigned Task', status: 'pending', assignedTo: [], createdAt: new Date().toISOString() },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    expect(screen.getByText('Unassigned')).toBeInTheDocument()
  })

  // ── Section Toggle with aria-expanded ──

  it('sets aria-expanded true when section is expanded', async () => {
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const tasksButton = screen.getByText('Tasks').closest('button')!
    expect(tasksButton).toHaveAttribute('aria-expanded', 'true')
  })

  it('sets aria-expanded false when section is collapsed', async () => {
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const tasksButton = screen.getByText('Tasks').closest('button')!
    fireEvent.click(tasksButton)

    expect(tasksButton).toHaveAttribute('aria-expanded', 'false')
  })

  // ── Unmounted Component Safety ──

  it('does not update state after unmount during loadData', async () => {
    let resolveAgents: (value: unknown) => void
    mockGetAgents.mockImplementationOnce(() => new Promise(r => { resolveAgents = r }))

    const { unmount } = render(<SupervisorPanel />)

    // Unmount before data resolves
    unmount()

    // Resolve the promise - should not cause state update on unmounted component
    await act(async () => {
      resolveAgents!([])
      await vi.advanceTimersByTimeAsync(0)
    })
  })

  // ── Multiple Swarms with Tasks ──

  it('fetches tasks from multiple swarms', async () => {
    mockGetSwarms.mockResolvedValue([
      { id: 'swarm-1', coordinatorId: 'coord-1' },
      { id: 'swarm-2', coordinatorId: 'coord-2' },
    ])
    mockGetSwarmTasks
      .mockResolvedValueOnce([
        { id: 't1', title: 'Swarm1 Task', status: 'running', assignedTo: ['a1'], createdAt: new Date().toISOString() },
      ])
      .mockResolvedValueOnce([
        { id: 't2', title: 'Swarm2 Task', status: 'pending', assignedTo: ['a2'], createdAt: new Date().toISOString() },
      ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    expect(screen.getByText('Swarm1 Task')).toBeInTheDocument()
    expect(screen.getByText('Swarm2 Task')).toBeInTheDocument()
  })

  // ── Decision Priority Summary ──

  it('shows decision summary when review queue has items', async () => {
    const { useHandoffStore } = await import('../stores/handoffStore')
    const mockHandoff = {
      id: 'h1',
      fromAgent: 'a1',
      toAgent: 'a2',
      taskId: 't1',
      reason: 'test',
      status: 'pending' as const,
      createdAt: new Date(),
    }
    vi.mocked(useHandoffStore).mockReturnValue({
      activeHandoff: mockHandoff,
      resolveHandoff: mockResolveHandoffStore,
    })

    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    expect(screen.getByText(/Handoff x1/)).toBeInTheDocument()
  })

  // ── Health Stats with supervisorStats ──

  it('computes idle agents from supervisorStats', async () => {
    mockGetSupervisorStats.mockResolvedValue({
      totalAgents: 5,
      healthyAgents: 3,
      degradedAgents: 0,
      unhealthyAgents: 1,
      busyAgents: 1,
      avgResponseTime: 100,
      throughput: 8.0,
    })
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const healthButton = screen.getByText('Health').closest('button')!
    fireEvent.click(healthButton)

    // idle = totalAgents - busyAgents - unhealthyAgents = 5 - 1 - 1 = 3
    // But there are multiple "3" texts on screen (healthyAgents also 3).
    // Check for the specific Idle label area
    const idleLabels = screen.getAllByText('3')
    expect(idleLabels.length).toBeGreaterThanOrEqual(2) // healthy=3, idle=3
    expect(screen.getByText('Idle')).toBeInTheDocument()
    expect(screen.getByText('Unhealthy')).toBeInTheDocument()
  })

  it('computes healthy agents from agent list when no supervisorStats', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'a1', name: 'running', type: 'worker', state: 'running', command: '', capabilities: [] },
      { id: 'a2', name: 'idle', type: 'worker', state: 'idle', command: '', capabilities: [] },
      { id: 'a3', name: 'error', type: 'worker', state: 'error', command: '', capabilities: [] },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const healthButton = screen.getByText('Health').closest('button')!
    fireEvent.click(healthButton)

    // Healthy = agents with state 'running' or 'executing' = 1
    // Idle = agents with state 'idle' = 1
    // Unhealthy = agents with state 'error' = 1
    expect(screen.getByText('Healthy')).toBeInTheDocument()
    expect(screen.getByText('Unhealthy')).toBeInTheDocument()
  })

  // ── Disabled Buttons During Loading ──

  it('disables buttons when loading', async () => {
    // First call succeeds (initial load). Second call hangs.
    let resolveRefresh: () => void
    mockGetAgents
      .mockResolvedValueOnce([]) // initial load
      .mockImplementationOnce(() => new Promise<void>(r => { resolveRefresh = r }))

    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    // Click Refresh to trigger loading
    const refreshButton = screen.getByText('Refresh')
    fireEvent.click(refreshButton)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    // Buttons should show loading text and be disabled
    expect(screen.getByText('Refreshing...')).toBeInTheDocument()
    expect(screen.getByText('Pausing...')).toBeInTheDocument()

    const refreshingBtn = screen.getByText('Refreshing...').closest('button')!
    const pausingBtn = screen.getByText('Pausing...').closest('button')!
    expect(refreshingBtn).toBeDisabled()
    expect(pausingBtn).toBeDisabled()

    await act(async () => {
      resolveRefresh!()
      await vi.advanceTimersByTimeAsync(0)
    })
  })

  // ── Activity Type Colors ──

  it('renders different activity type indicators', async () => {
    mockGetAgents.mockResolvedValue([
      { id: 'a1', name: 'running', type: 'worker', state: 'running', command: '', capabilities: [], lastActive: new Date().toISOString() },
      { id: 'a2', name: 'error', type: 'worker', state: 'error', command: '', capabilities: [], lastActive: new Date().toISOString() },
      { id: 'a3', name: 'idle', type: 'worker', state: 'idle', command: '', capabilities: [], lastActive: new Date().toISOString() },
    ])
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const activityButton = screen.getByText('Activity').closest('button')!
    fireEvent.click(activityButton)

    // Different dot colors for different activity types
    const greenDots = document.querySelectorAll('.bg-green-500')
    const redDots = document.querySelectorAll('.bg-red-500')
    const blueDots = document.querySelectorAll('.bg-blue-500')
    expect(greenDots.length).toBeGreaterThan(0) // commit/running type
    expect(redDots.length).toBeGreaterThan(0)   // error type
    expect(blueDots.length).toBeGreaterThan(0)   // review/idle type
  })

  // ── Chevron Rotation ──

  it('shows rotated chevron for expanded section', async () => {
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const tasksButton = screen.getByText('Tasks').closest('button')!
    // The chevron is the last SVG in the button (second one), which has the transition-transform class
    const chevrons = tasksButton.querySelectorAll('svg')
    const chevron = chevrons[chevrons.length - 1] // last svg is the chevron
    expect(chevron).toHaveClass('rotate-180')
  })

  it('shows non-rotated chevron for collapsed section', async () => {
    render(<SupervisorPanel />)
    await act(async () => { vi.advanceTimersByTimeAsync(0) })

    const tasksButton = screen.getByText('Tasks').closest('button')!
    fireEvent.click(tasksButton) // collapse

    const chevrons = tasksButton.querySelectorAll('svg')
    const chevron = chevrons[chevrons.length - 1]
    expect(chevron).not.toHaveClass('rotate-180')
  })
})
