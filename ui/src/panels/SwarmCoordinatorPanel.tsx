import { useState, useEffect } from 'react'
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
} from 'lucide-react'
import type { CoordinationTask } from '../types'

export default function SwarmCoordinatorPanel() {
  const { activeSwarm } = useAppStore()
  const [tasks, setTasks] = useState<CoordinationTask[]>([])
  const [selectedTask, setSelectedTask] = useState<CoordinationTask | null>(null)
  const [newTaskModal, setNewTaskModal] = useState(false)
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    prompt: '',
    priority: 5,
    requiredRole: '',
  })

  // Simulated task updates
  useEffect(() => {
    const interval = setInterval(() => {
      // Simulate task progress updates
      setTasks((prev) =>
        prev.map((t) => {
          if (t.status === 'running' && t.progress < 1) {
            return { ...t, progress: Math.min(t.progress + 0.1, 1) }
          }
          return t
        })
      )
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const handleSubmitTask = () => {
    const task: CoordinationTask = {
      id: `task-${Date.now()}`,
      title: newTask.title,
      description: newTask.description,
      prompt: newTask.prompt,
      priority: newTask.priority,
      status: 'pending',
      progress: 0,
      assignedTo: [],
      results: {},
      createdAt: new Date().toISOString(),
    }

    setTasks((prev) => [...prev, task])
    setNewTaskModal(false)
    setNewTask({
      title: '',
      description: '',
      prompt: '',
      priority: 5,
      requiredRole: '',
    })
  }

  const statusColors = {
    pending: 'bg-text-secondary',
    decomposing: 'bg-warning',
    assigned: 'bg-info',
    running: 'bg-accent animate-pulse',
    consensus: 'bg-warning',
    completed: 'bg-success',
    failed: 'bg-error',
  }

  const priorityColors = {
    1: 'text-text-secondary',
    2: 'text-text-secondary',
    3: 'text-info',
    4: 'text-warning',
    5: 'text-warning',
    6: 'text-warning',
    7: 'text-error',
    8: 'text-error',
    9: 'text-error',
    10: 'text-error font-bold',
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-panel-border">
        <div className="flex items-center space-x-3">
          <Zap size={20} className="text-accent" />
          <div>
            <h2 className="text-lg font-semibold">Swarm Coordinator</h2>
            <p className="text-xs text-text-secondary">
              {activeSwarm?.name || 'No swarm selected'} - {tasks.length} tasks
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setNewTaskModal(true)}
            className="flex items-center space-x-1 px-3 py-1.5 bg-accent hover:bg-accent-hover rounded text-sm"
          >
            <Target size={16} />
            <span>New Task</span>
          </button>
          <button className="p-2 hover:bg-panel-border rounded" title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Task List */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <StatCard
              icon={<Clock size={16} />}
              label="Pending"
              value={tasks.filter((t) => t.status === 'pending').length}
              color="text-text-secondary"
            />
            <StatCard
              icon={<Loader2 size={16} className="animate-spin" />}
              label="Running"
              value={tasks.filter((t) => t.status === 'running').length}
              color="text-accent"
            />
            <StatCard
              icon={<CheckCircle size={16} />}
              label="Completed"
              value={tasks.filter((t) => t.status === 'completed').length}
              color="text-success"
            />
            <StatCard
              icon={<XCircle size={16} />}
              label="Failed"
              value={tasks.filter((t) => t.status === 'failed').length}
              color="text-error"
            />
          </div>

          {/* Task List */}
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-text-secondary">
              <Network size={48} className="mb-4 opacity-50" />
              <p className="text-lg mb-2">No tasks yet</p>
              <p className="text-sm">Submit a task to start coordinating agents</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks
                .sort((a, b) => b.priority - a.priority)
                .map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    isSelected={selectedTask?.id === task.id}
                    statusColor={statusColors[task.status]}
                    priorityColor={priorityColors[task.priority as keyof typeof priorityColors]}
                    onClick={() => setSelectedTask(selectedTask?.id === task.id ? null : task)}
                  />
                ))}
            </div>
          )}
        </div>

        {/* Task Details Panel */}
        {selectedTask && (
          <div className="w-80 border-l border-panel-border p-4 overflow-y-auto">
            <TaskDetails task={selectedTask} onClose={() => setSelectedTask(null)} />
          </div>
        )}
      </div>

      {/* New Task Modal */}
      {newTaskModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-panel-bg border border-panel-border rounded-lg p-6 w-[500px] max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Submit New Task</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  className="w-full bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  placeholder="Implement user authentication"
                />
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Description
                </label>
                <textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  className="w-full bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent font-mono"
                  rows={3}
                  placeholder="Detailed task description..."
                />
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Agent Prompt *
                </label>
                <textarea
                  value={newTask.prompt}
                  onChange={(e) => setNewTask({ ...newTask, prompt: e.target.value })}
                  className="w-full bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm focus:outline-none focus:border-accent font-mono"
                  rows={4}
                  placeholder="Write the prompt that will be sent to agents..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">
                    Priority (1-10)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={newTask.priority}
                    onChange={(e) => setNewTask({ ...newTask, priority: parseInt(e.target.value) })}
                    className="w-full bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">
                    Required Role
                  </label>
                  <select
                    value={newTask.requiredRole}
                    onChange={(e) => setNewTask({ ...newTask, requiredRole: e.target.value })}
                    className="w-full bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm"
                  >
                    <option value="">Any</option>
                    <option value="coder">Coder</option>
                    <option value="reviewer">Reviewer</option>
                    <option value="tester">Tester</option>
                    <option value="architect">Architect</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={() => setNewTaskModal(false)}
                className="px-4 py-2 border border-panel-border hover:bg-panel-border rounded text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitTask}
                disabled={!newTask.title || !newTask.prompt}
                className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
              >
                Submit Task
              </button>
            </div>
          </div>
        </div>
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
    <div className="bg-editor-bg border border-panel-border rounded p-3">
      <div className="flex items-center space-x-2">
        <div className={color}>{icon}</div>
        <span className="text-xs text-text-secondary">{label}</span>
      </div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  )
}

// TaskCard displays a task in the list
export function TaskCard({
  task,
  isSelected,
  statusColor,
  priorityColor,
  onClick,
}: {
  task: CoordinationTask
  isSelected: boolean
  statusColor: string
  priorityColor: string
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`p-3 border rounded cursor-pointer transition-colors ${
        isSelected
          ? 'border-accent bg-accent/10'
          : 'border-panel-border hover:border-accent'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${statusColor}`} />
            <h4 className="font-medium text-sm">{task.title}</h4>
          </div>
          <p className="text-xs text-text-secondary mt-1 line-clamp-1">
            {task.description || task.prompt?.slice(0, 50) + '...'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`text-xs font-mono ${priorityColor}`}>
            P{task.priority}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      {task.status === 'running' && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
            <span>Progress</span>
            <span>{Math.round(task.progress * 100)}%</span>
          </div>
          <div className="h-1 bg-panel-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${task.progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Assigned agents */}
      {task.assignedTo && task.assignedTo.length > 0 && (
        <div className="flex items-center space-x-1 mt-2">
          <Users size={12} className="text-text-secondary" />
          {task.assignedTo.slice(0, 3).map((agentId) => (
            <div
              key={agentId}
              className="px-1.5 py-0.5 text-xs bg-panel-border rounded"
            >
              {agentId}
            </div>
          ))}
          {task.assignedTo.length > 3 && (
            <span className="text-xs text-text-secondary">
              +{task.assignedTo.length - 3} more
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// TaskDetails shows detailed task information
export function TaskDetails({
  task,
  onClose,
}: {
  task: CoordinationTask
  onClose: () => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Task Details</h3>
        <button onClick={onClose} className="p-1 hover:bg-panel-border rounded">
          <XCircle size={16} />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-xs text-text-secondary">ID</label>
          <p className="font-mono text-sm">{task.id}</p>
        </div>

        <div>
          <label className="text-xs text-text-secondary">Title</label>
          <p className="text-sm">{task.title}</p>
        </div>

        <div>
          <label className="text-xs text-text-secondary">Status</label>
          <p className="text-sm capitalize">{task.status}</p>
        </div>

        <div>
          <label className="text-xs text-text-secondary">Priority</label>
          <p className="text-sm">{task.priority}/10</p>
        </div>

        <div>
          <label className="text-xs text-text-secondary">Prompt</label>
          <pre className="text-xs bg-editor-bg p-2 rounded overflow-x-auto font-mono">
            {task.prompt}
          </pre>
        </div>

        {/* Results */}
        {task.results && Object.keys(task.results).length > 0 && (
          <div>
            <label className="text-xs text-text-secondary">Results</label>
            <div className="space-y-2 mt-2">
              {Object.entries(task.results).map(([agentId, result]) => (
                <div key={agentId} className="bg-editor-bg p-2 rounded">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{agentId}</span>
                    {result.error ? (
                      <XCircle size={14} className="text-error" />
                    ) : (
                      <CheckCircle size={14} className="text-success" />
                    )}
                  </div>
                  {result.error ? (
                    <p className="text-xs text-error mt-1">{result.error}</p>
                  ) : (
                    <p className="text-xs text-text-secondary mt-1 line-clamp-2">
                      {result.content}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex space-x-2 pt-4 border-t border-panel-border">
          {task.status === 'pending' && (
            <button className="flex-1 flex items-center justify-center space-x-1 py-1.5 bg-accent hover:bg-accent-hover rounded text-sm">
              <Play size={14} />
              <span>Start</span>
            </button>
          )}
          {task.status === 'running' && (
            <>
              <button className="flex-1 flex items-center justify-center space-x-1 py-1.5 border border-panel-border hover:bg-panel-border rounded text-sm">
                <Pause size={14} />
                <span>Pause</span>
              </button>
              <button className="flex-1 flex items-center justify-center space-x-1 py-1.5 border border-error text-error hover:bg-error/20 rounded text-sm">
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