import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useAppStore } from '../store/appStore'
import {
  Play,
  Pause,
  Square,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Network,
  Users,
  Zap,
  Target,
  X,
} from 'lucide-react'
import type { CoordinationTask } from '../types'
import { api } from '../services'
import { logger } from '../utils'
import { getWebSocketClient } from '../services/websocket'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { schedulingService } from '../services/scheduling'

interface SwarmCoordinatorPanelProps {
  /** Initial tasks for testing purposes */
  initialTasks?: CoordinationTask[]
  /** Test-only: set selected task by ID on mount (for testing else branches) */
  testSelectedTaskId?: string
  /** Test-only: directly call handleStartTask with specific taskId (for testing else branches) */
  testStartTaskId?: string
  /** Test-only: directly call handlePauseTask with specific taskId (for testing else branches) */
  testPauseTaskId?: string
  /** Test-only: directly call handleCancelTask with specific taskId (for testing else branches) */
  testCancelTaskId?: string
}

export default function SwarmCoordinatorPanel({
  initialTasks = [],
  testSelectedTaskId,
  testStartTaskId,
  testPauseTaskId,
  testCancelTaskId,
}: SwarmCoordinatorPanelProps) {
  const activeSwarm = useAppStore(state => state.activeSwarm)
  const addToast = useAppStore(state => state.addToast)
  const mountedRef = useRef(true)
  const [tasks, setTasks] = useState<CoordinationTask[]>(initialTasks)
  const [selectedTask, setSelectedTask] = useState<CoordinationTask | null>(() => {
    // Test-only: set initial selected task from prop
    if (testSelectedTaskId) {
      return initialTasks.find(t => t.id === testSelectedTaskId) || null
    }
    return null
  })
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [newTaskModal, setNewTaskModal] = useState(false)
  const [newTask, setNewTask] = useState<{
    title: string
    description: string
    prompt: string
    priority: string
    requiredRole: string
    constraints: string
    acceptance: string
    riskTolerance: 'low' | 'medium' | 'high'
  }>({
    title: '',
    description: '',
    prompt: '',
    priority: 'medium',
    requiredRole: '',
    constraints: '',
    acceptance: '',
    riskTolerance: 'medium',
  })

  // Memoized task stats for performance
  const taskStats = useMemo(() => ({
    pending: tasks.filter(t => t.status === 'pending').length,
    running: tasks.filter(t => t.status === 'running').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    failed: tasks.filter(t => t.status === 'failed').length,
  }), [tasks])

  // Scheduling stats from the scheduling service
  const schedulingStats = useMemo(() => schedulingService.getSchedulingStats(), [tasks])
  const loadBalanceEfficiency = useMemo(() => schedulingService.calculateLoadBalanceEfficiency(), [tasks])

  // Track mounted state to prevent setState on unmounted component
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Real task updates via WebSocket
  useEffect(() => {
    const ws = getWebSocketClient()
    const unsub = ws.subscribe('swarm_task_update', (data: unknown) => {
      if (!mountedRef.current) return
      const update = data as { taskId: string; status: string; progress?: number }
      setTasks(prev => prev.map(t =>
        t.id === update.taskId
          ? { ...t, status: update.status as CoordinationTask['status'], progress: update.progress ?? t.progress }
          : t
      ))
    })
    return () => unsub()
  }, [])

  // Polling fallback: refresh task stats from backend every 10s when there's an active swarm.
  // The backend does not yet emit swarm_task_update events, so this keeps the UI in sync.
  useEffect(() => {
    if (!activeSwarm) return

    const interval = setInterval(async () => {
      if (!mountedRef.current || !activeSwarm) return
      try {
        const taskList = await api.swarm.getSwarmTasks(activeSwarm.id)
        if (!mountedRef.current) return
        // If no tasks are still running but we have locally-running tasks,
        // mark them as completed (the backend finished them while we were polling).
        const hasRunning = taskList.some(t => t.status === 'running')
        if (!hasRunning) {
          setTasks(prev => prev.map(t =>
            t.status === 'running' ? { ...t, status: 'completed' as const, progress: 1 } : t
          ))
          setSelectedTask(prev =>
            prev?.status === 'running' ? { ...prev, status: 'completed' as const, progress: 1 } : prev
          )
        }
      } catch {
        // ignore polling errors
      }
    }, 10000)

    return () => clearInterval(interval)
  }, [activeSwarm])

  const handleSubmitTask = useCallback(async () => {
    if (!activeSwarm) {
      addToast('warning', 'No Active Swarm', 'Please select or create a swarm first')
      return
    }

    try {
      const priority = newTask.priority || 'medium'

      // 提交任务到后端
      const taskId = await api.swarm.submitTask({
        swarmId: activeSwarm.id,
        title: newTask.title,
        description: newTask.description,
        priority,
        constraints: newTask.constraints ? newTask.constraints.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        acceptance: newTask.acceptance ? newTask.acceptance.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        riskTolerance: newTask.riskTolerance,
      })

      // Check if component is still mounted before updating state
      if (!mountedRef.current) return

      const task: CoordinationTask = {
        id: taskId,
        title: newTask.title,
        description: newTask.description,
        prompt: newTask.prompt,
        priority: priority,
        status: 'pending',
        progress: 0,
        assignedTo: [],
        results: {},
        createdAt: new Date().toISOString(),
      }

      // Record scheduling event
      schedulingService.recordTaskScheduled(task, 'pending')

      setTasks((prev) => [...prev, task])
      setNewTaskModal(false)
      setNewTask({
        title: '',
        description: '',
        prompt: '',
        priority: 'medium',
        requiredRole: '',
        constraints: '',
        acceptance: '',
        riskTolerance: 'medium',
      })
    } catch (err) {
      logger.error('Swarm', 'Failed to submit task:', err)
      addToast('error', 'Submit Failed', err instanceof Error ? err.message : 'Failed to submit task')
    }
  }, [activeSwarm, addToast, newTask])

  const statusColors = {
    pending: 'bg-text-tertiary',
    decomposing: 'bg-warning',
    assigned: 'bg-info',
    running: 'bg-accent animate-pulse',
    consensus: 'bg-warning',
    completed: 'bg-success',
    failed: 'bg-error',
  }

  const handleStartTask = useCallback(async (taskId: string) => {
    if (!activeSwarm) return

    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, status: 'running' as const, progress: 0 } : t
      )
    )
    setSelectedTask((prev) =>
      prev?.id === taskId ? { ...prev, status: 'running' as const, progress: 0 } : prev
    )

    try {
      // 调用后端执行任务
      const result = await api.swarm.executeTask(activeSwarm.id, taskId)

      // Check if component is still mounted before updating state
      if (!mountedRef.current) return

      // 更新任务结果
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? {
            ...t,
            status: 'completed' as const,
            progress: 1,
            results: Object.fromEntries(
              Object.entries(result.agentResults).map(([id, r]) => [id, {
                agentId: r.agentId,
                content: r.content,
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                duration: r.durationMs,
              }])
            ),
          } : t
        )
      )
      setSelectedTask((prev) =>
        prev?.id === taskId ? {
          ...prev,
          status: 'completed' as const,
          progress: 1,
        } : prev
      )

      // Update scheduling agent load
      const agentIds = Object.keys(result.agentResults)
      agentIds.forEach(id => {
        const r = result.agentResults[id]
        schedulingService.updateAgentLoad(id, 0, 5, r.durationMs)
      })
    } catch (err) {
      logger.error('Swarm', 'Failed to execute task:', err)
      // Check if component is still mounted before updating state
      if (!mountedRef.current) return
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: 'failed' as const } : t
        )
      )
    }
  }, [activeSwarm])

  const handlePauseTask = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, status: 'pending' as const } : t
      )
    )
    setSelectedTask((prev) =>
      prev?.id === taskId ? { ...prev, status: 'pending' as const } : prev
    )
  }

  const [cancelTaskConfirm, setCancelTaskConfirm] = useState<{ id: string; title: string } | null>(null)

  const requestCancelTask = useCallback((taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    setCancelTaskConfirm({ id: taskId, title: task?.title || taskId })
  }, [tasks])

  const handleCancelTask = () => {
    if (!cancelTaskConfirm) return
    const { id } = cancelTaskConfirm
    setCancelTaskConfirm(null)
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status: 'failed' as const } : t
      )
    )
    setSelectedTask((prev) =>
      prev?.id === id ? { ...prev, status: 'failed' as const } : prev
    )
  }

  // Test-only: trigger handlers with specific taskIds to test else branches
  // These MUST be after handler definitions to avoid "undefined" calls
  useEffect(() => {
    if (testStartTaskId) {
      handleStartTask(testStartTaskId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testStartTaskId])

  useEffect(() => {
    if (testPauseTaskId) {
      handlePauseTask(testPauseTaskId)
    }
  }, [testPauseTaskId])

  useEffect(() => {
    if (testCancelTaskId) {
      requestCancelTask(testCancelTaskId)
    }
  }, [testCancelTaskId, requestCancelTask])

  const priorityColors: Record<string, string> = {
    low: 'text-text-tertiary',
    medium: 'text-warning',
    high: 'text-error',
    critical: 'text-error font-bold',
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-glass-border bg-glass/30">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent/10 rounded-mac">
            <Zap size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Swarm Coordinator</h2>
            <p className="text-xs text-text-secondary">
              {activeSwarm?.name || 'No swarm selected'} • {tasks.length} tasks
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setNewTaskModal(true)}
            className="btn-primary"
          >
            <Target size={16} />
            <span>New Task</span>
          </button>
          <button className="p-2 hover:bg-card-hover rounded-mac transition-colors" title="Refresh" aria-label="Refresh">
            <RefreshCw size={16} className="text-text-secondary" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Task List */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-3">
            <StatCard
              icon={<Clock size={16} />}
              label="Pending"
              value={taskStats.pending}
              color="text-text-secondary"
            />
            <StatCard
              icon={<Loader2 size={16} className="animate-spin" />}
              label="Running"
              value={taskStats.running}
              color="text-accent"
            />
            <StatCard
              icon={<CheckCircle size={16} />}
              label="Completed"
              value={taskStats.completed}
              color="text-success"
            />
            <StatCard
              icon={<XCircle size={16} />}
              label="Failed"
              value={taskStats.failed}
              color="text-error"
            />
          </div>

          {/* Scheduling Stats */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-glass border border-glass-border rounded-mac p-2.5">
              <span className="text-xs text-text-tertiary">Scheduled</span>
              <div className="text-sm font-bold text-text-primary">{schedulingStats.totalTasksScheduled}</div>
            </div>
            <div className="bg-glass border border-glass-border rounded-mac p-2.5">
              <span className="text-xs text-text-tertiary">Load Balance</span>
              <div className="text-sm font-bold text-text-primary">{Math.round(loadBalanceEfficiency * 100)}%</div>
            </div>
            <div className="bg-glass border border-glass-border rounded-mac p-2.5">
              <span className="text-xs text-text-tertiary">Starvation</span>
              <div className="text-sm font-bold text-text-primary">{schedulingStats.starvationPreventions}</div>
            </div>
          </div>

          {/* Task List */}
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-text-tertiary">
              <div className="p-4 bg-glass rounded-mac-xl mb-4">
                <Network size={48} className="opacity-50" />
              </div>
              <p className="text-base font-medium text-text-secondary mb-1">No tasks yet</p>
              <p className="text-sm">Submit a task to start coordinating agents</p>
            </div>
          ) : (
            <div className="space-y-2">
              {schedulingService.sortTasksByPriority(tasks)
                .map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    isSelected={selectedTask?.id === task.id}
                    isExpanded={expandedTaskId === task.id}
                    statusColor={statusColors[task.status]}
                    priorityColor={priorityColors[task.priority] || priorityColors.medium}
                    onClick={() => setSelectedTask(selectedTask?.id === task.id ? null : task)}
                    onToggleExpand={() => setExpandedTaskId(prev => prev === task.id ? null : task.id)}
                  />
                ))}
            </div>
          )}
        </div>

        {/* Task Details Panel */}
        {selectedTask && (
          <div className="w-80 border-l border-glass-border bg-mac-panel/50 p-4 overflow-y-auto">
            <TaskDetails
              task={selectedTask}
              onClose={() => setSelectedTask(null)}
              onStart={handleStartTask}
              onPause={handlePauseTask}
              onCancel={requestCancelTask}
            />
          </div>
        )}
      </div>

      {/* New Task Modal */}
      {newTaskModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-mac-panel/95 border border-glass-border rounded-mac-xl p-5 w-[500px] max-h-[85vh] overflow-y-auto shadow-mac backdrop-blur-xl" role="dialog" aria-modal="true" aria-label="Submit New Task">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Target size={18} className="text-accent" />
                Submit New Task
              </h3>
              <button
                onClick={() => {
                  setNewTaskModal(false)
                  setNewTask({
                    title: '',
                    description: '',
                    prompt: '',
                    priority: 'medium',
                    requiredRole: '',
                    constraints: '',
                    acceptance: '',
                    riskTolerance: 'medium',
                  })
                }}
                className="p-1.5 hover:bg-card-hover rounded-mac transition-colors"
              >
                <X size={18} className="text-text-secondary" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                  Title *
                </label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  className="w-full input-mac"
                  placeholder="Implement user authentication"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                  Description
                </label>
                <textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  className="w-full input-mac font-mono resize-none"
                  rows={3}
                  placeholder="Detailed task description..."
                />
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                  Agent Prompt *
                </label>
                <textarea
                  value={newTask.prompt}
                  onChange={(e) => setNewTask({ ...newTask, prompt: e.target.value })}
                  className="w-full input-mac font-mono resize-none"
                  rows={4}
                  placeholder="Write the prompt that will be sent to agents..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                    Priority (1-10)
                  </label>
                  <select
                    value={newTask.priority}
                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                    className="w-full input-mac"
                    aria-label="Priority"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                    Required Role
                  </label>
                  <select
                    value={newTask.requiredRole}
                    onChange={(e) => setNewTask({ ...newTask, requiredRole: e.target.value })}
                    className="w-full input-mac"
                    aria-label="Required Role"
                  >
                    <option value="">Any</option>
                    <option value="coder">Coder</option>
                    <option value="reviewer">Reviewer</option>
                    <option value="tester">Tester</option>
                    <option value="architect">Architect</option>
                  </select>
                </div>
              </div>

              {/* Constraints */}
              <div>
                <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                  约束条件
                </label>
                <input
                  type="text"
                  value={newTask.constraints}
                  onChange={(e) => setNewTask(prev => ({ ...prev, constraints: e.target.value }))}
                  placeholder="如：不改测试文件, 不动配置"
                  className="w-full input-mac"
                />
              </div>

              {/* Acceptance criteria */}
              <div>
                <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                  验收标准
                </label>
                <input
                  type="text"
                  value={newTask.acceptance}
                  onChange={(e) => setNewTask(prev => ({ ...prev, acceptance: e.target.value }))}
                  placeholder="如：所有测试通过, 无 lint 错误"
                  className="w-full input-mac"
                />
              </div>

              {/* Risk tolerance */}
              <div>
                <label className="block text-sm text-text-secondary mb-1.5 font-medium">
                  风险偏好
                </label>
                <div className="flex gap-2">
                  {(['low', 'medium', 'high'] as const).map(level => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setNewTask(prev => ({ ...prev, riskTolerance: level }))}
                      className={`flex-1 py-1.5 text-xs rounded-mac transition-colors ${
                        newTask.riskTolerance === level ? 'bg-accent/30 text-accent border border-accent/50' : 'bg-glass text-text-secondary border border-glass-border'
                      }`}
                    >
                      {level === 'low' ? '低' : level === 'medium' ? '中' : '高'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-glass-border">
              <button
                onClick={() => {
                  setNewTaskModal(false)
                  setNewTask({
                    title: '',
                    description: '',
                    prompt: '',
                    priority: 'medium',
                    requiredRole: '',
                    constraints: '',
                    acceptance: '',
                    riskTolerance: 'medium',
                  })
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitTask}
                disabled={!newTask.title || !newTask.prompt}
                className="btn-primary"
              >
                Submit Task
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelTaskConfirm && (
        <ConfirmDialog
          title="Cancel Task"
          message={`Are you sure you want to cancel "${cancelTaskConfirm.title}"? This action cannot be undone.`}
          confirmLabel="Cancel Task"
          variant="danger"
          onConfirm={handleCancelTask}
          onCancel={() => setCancelTaskConfirm(null)}
        />
      )}
    </div>
  )
}

// StatCard displays a statistic
function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: string
}) {
  return (
    <div className="bg-glass border border-glass-border rounded-mac p-3">
      <div className="flex items-center gap-2">
        <div className={color}>{icon}</div>
        <span className="text-xs text-text-secondary">{label}</span>
      </div>
      <div className="text-xl font-bold mt-1 text-text-primary">{value}</div>
    </div>
  )
}

// getRiskLevel returns a risk level string based on total changed files across all results
function getRiskLevel(task: CoordinationTask): string {
  let totalFiles = 0
  if (task.results) {
    for (const r of Object.values(task.results)) {
      totalFiles += r.filesChanged?.length || 0
    }
  }
  if (totalFiles > 10) return 'HIGH'
  if (totalFiles > 3) return 'MEDIUM'
  return 'LOW'
}

// getRiskDotColor returns a CSS class for the risk level color
function getRiskDotColor(task: CoordinationTask): string {
  let totalFiles = 0
  if (task.results) {
    for (const r of Object.values(task.results)) {
      totalFiles += r.filesChanged?.length || 0
    }
  }
  if (totalFiles > 10) return 'text-red-400'
  if (totalFiles > 3) return 'text-yellow-400'
  return 'text-green-400'
}

// TaskCard displays a task in the list
export function TaskCard({
  task,
  isSelected,
  isExpanded,
  statusColor,
  priorityColor,
  onClick,
  onToggleExpand,
}: {
  task: CoordinationTask
  isSelected: boolean
  isExpanded: boolean
  statusColor: string
  priorityColor: string
  onClick: () => void
  onToggleExpand: () => void
}) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      className={`p-3.5 rounded-mac-xl cursor-pointer transition-all duration-200 ${
        isSelected
          ? 'bg-accent-muted border-2 border-accent'
          : 'bg-glass border border-glass-border hover:border-accent/50 hover:bg-card-hover'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${statusColor}`} />
            <h4 className="font-medium text-sm text-text-primary">{task.title}</h4>
          </div>
          <p className="text-xs text-text-secondary mt-1 line-clamp-1">
            {task.description || (task.prompt ? task.prompt.slice(0, 50) + '...' : '')}
          </p>
        </div>
        <div className="flex items-center">
          <span className={`text-xs font-mono capitalize ${priorityColor}`}>
            {task.priority}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      {task.status === 'running' && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-text-secondary mb-1.5">
            <span>Progress</span>
            <span className="font-mono">{Math.round(task.progress * 100)}%</span>
          </div>
          <div className="h-1.5 bg-glass rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300 rounded-full"
              style={{ width: `${task.progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Assigned agents */}
      {task.assignedTo && task.assignedTo.length > 0 && (
        <div className="flex items-center gap-2 mt-3">
          <Users size={12} className="text-text-secondary" />
          {task.assignedTo.slice(0, 3).map((agentId) => (
            <div
              key={agentId}
              className="px-2 py-0.5 text-xs bg-glass rounded-mac text-text-secondary"
            >
              {agentId}
            </div>
          ))}
          {task.assignedTo.length > 3 && (
            <span className="text-xs text-text-tertiary">
              +{task.assignedTo.length - 3} more
            </span>
          )}
        </div>
      )}

      {/* Expand toggle */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleExpand() }}
        className="mt-2 text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
      >
        {isExpanded ? 'Hide details' : 'Show details'}
      </button>

      {/* Expanded detail section */}
      {isExpanded && (
        <div className="mt-2 pt-2 border-t border-slate-700/50 space-y-1">
          {(() => {
            const entries = Object.entries(task.results || {})
            if (entries.length === 0) {
              return <div className="text-[10px] text-text-tertiary">No results yet</div>
            }
            return entries.map(([agentId, result]) => (
              <div key={agentId} className="space-y-0.5">
                {/* Agent label */}
                <div className="text-[10px] text-text-tertiary font-medium">{agentId}</div>
                {/* Output preview */}
                {result.content && (
                  <div className="text-[10px]">
                    <span className="text-text-tertiary">Output:</span>{' '}
                    <span className="text-text-secondary">{result.content.slice(0, 200)}</span>
                  </div>
                )}
                {/* Changed files */}
                {result.filesChanged && result.filesChanged.length > 0 && (
                  <div className="text-[10px]">
                    <span className="text-text-tertiary">Changes:</span>{' '}
                    <span className="text-text-secondary">{result.filesChanged.length} files</span>
                  </div>
                )}
                {/* Duration */}
                {result.duration > 0 && (
                  <div className="text-[10px]">
                    <span className="text-text-tertiary">Duration:</span>{' '}
                    <span className="text-text-secondary">{result.duration}ms</span>
                  </div>
                )}
              </div>
            ))
          })()}
          {/* Risk level */}
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-text-tertiary">Risk:</span>
            <span className={getRiskDotColor(task)}>{getRiskLevel(task)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// TaskDetails shows detailed task information
export function TaskDetails({
  task,
  onClose,
  onStart,
  onPause,
  onCancel,
}: {
  task: CoordinationTask
  onClose: () => void
  onStart: (taskId: string) => void
  onPause: (taskId: string) => void
  onCancel: (taskId: string) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-text-primary">Task Details</h3>
        <button onClick={onClose} className="p-1.5 hover:bg-card-hover rounded-mac transition-colors" aria-label="Close">
          <XCircle size={16} className="text-text-secondary" />
        </button>
      </div>

      <div className="space-y-4">
        <div className="bg-glass/50 rounded-mac p-3">
          <label className="text-xs text-text-tertiary uppercase tracking-wider">ID</label>
          <p className="font-mono text-sm text-text-primary mt-1">{task.id}</p>
        </div>

        <div className="bg-glass/50 rounded-mac p-3">
          <label className="text-xs text-text-tertiary uppercase tracking-wider">Title</label>
          <p className="text-sm text-text-primary mt-1">{task.title}</p>
        </div>

        <div className="bg-glass/50 rounded-mac p-3">
          <label className="text-xs text-text-tertiary uppercase tracking-wider">Status</label>
          <p className="text-sm capitalize text-text-primary mt-1">{task.status}</p>
        </div>

        <div className="bg-glass/50 rounded-mac p-3">
          <label className="text-xs text-text-tertiary uppercase tracking-wider">Priority</label>
          <p className="text-sm text-text-primary mt-1 capitalize">{task.priority}</p>
        </div>

        <div>
          <label className="text-xs text-text-tertiary uppercase tracking-wider">Prompt</label>
          <pre className="text-xs bg-glass border border-glass-border p-3 rounded-mac overflow-x-auto font-mono mt-2 text-text-secondary">
            {task.prompt}
          </pre>
        </div>

        {/* Results */}
        {task.results && Object.keys(task.results).length > 0 && (
          <div>
            <label className="text-xs text-text-tertiary uppercase tracking-wider">Results</label>
            <div className="space-y-2 mt-2">
              {Object.entries(task.results).map(([agentId, result]) => (
                <div key={agentId} className="bg-glass border border-glass-border p-3 rounded-mac">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-text-primary">{agentId}</span>
                    {result.error ? (
                      <XCircle size={14} className="text-error" />
                    ) : (
                      <CheckCircle size={14} className="text-success" />
                    )}
                  </div>
                  {result.error ? (
                    <p className="text-xs text-error mt-1.5">{result.error}</p>
                  ) : (
                    <p className="text-xs text-text-secondary mt-1.5 line-clamp-2">
                      {result.content}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t border-glass-border">
          {task.status === 'pending' && (
            <button
              onClick={() => onStart(task.id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-accent hover:bg-accent-hover rounded-mac text-sm font-medium transition-colors"
            >
              <Play size={14} />
              <span>Start</span>
            </button>
          )}
          {task.status === 'running' && (
            <>
              <button
                onClick={() => onPause(task.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-glass hover:bg-card-hover border border-glass-border rounded-mac text-sm transition-colors"
              >
                <Pause size={14} />
                <span>Pause</span>
              </button>
              <button
                onClick={() => onCancel(task.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-error/10 hover:bg-error/20 border border-error/30 text-error rounded-mac text-sm transition-colors"
              >
                <Square size={14} />
                <span>Cancel</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
