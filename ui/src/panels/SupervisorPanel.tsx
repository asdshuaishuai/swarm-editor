import { useState, useEffect, useCallback, useRef } from 'react'
import { api, events, AgentInfo, TaskInfo } from '../services'
import { logger } from '../utils'
import { useHandoffStore } from '../stores/handoffStore'
import type { AuditEvent, AuditStats, ScheduleRunnerStatus, SupervisorStats } from '../services/api'

interface TaskItem {
  id: string
  title: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  agentId: string
  agentName: string
  progress: number
  createdAt: Date
}

interface ActivityItem {
  id: string
  type: 'commit' | 'pr' | 'review' | 'error' | 'handoff'
  message: string
  agent?: string
  timestamp: Date
}

interface ReviewItem {
  id: string
  type: 'handoff' | 'permission' | 'conflict'
  title: string
  agent: string
  description: string
  timestamp: Date
  data?: unknown
}

function calculateRiskLevel(agents: AgentInfo[], tasks: TaskItem[]): {
  level: 'low' | 'medium' | 'high'
  alerts: string[]
} {
  const alerts: string[] = []
  const errorAgents = agents.filter(a => (a.state || a.status) === 'error').length
  const failedTasks = tasks.filter(t => t.status === 'failed').length

  if (errorAgents > agents.length / 2) alerts.push(`${errorAgents} agents unhealthy`)
  if (failedTasks > 0) alerts.push(`${failedTasks} tasks failed`)

  const level = alerts.length >= 2 ? 'high' : alerts.length >= 1 ? 'medium' : 'low'
  return { level, alerts }
}

export function SupervisorPanel() {
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([])
  const [expandedSection, setExpandedSection] = useState<string | null>('tasks')
  const [loading, setLoading] = useState(false)
  const [supervisorStats, setSupervisorStats] = useState<SupervisorStats | null>(null)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [auditStats, setAuditStats] = useState<AuditStats | null>(null)
  const [scheduleRunner, setScheduleRunner] = useState<ScheduleRunnerStatus | null>(null)
  const [a2aStatus, setA2aStatus] = useState<{ messageLogSize: number } | null>(null)
  const mountedRef = useRef(true)

  const { activeHandoff, resolveHandoff } = useHandoffStore()

  // Track mounted state to prevent setState on unmounted component
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Load data from backend
  const loadData = useCallback(async () => {
    try {
      // Parallel fetch agents, swarms, supervisor stats, audit, and schedule runner
      const [agentList, swarms, supStats, auditResult, auditStatsResult, runnerResult] = await Promise.all([
        api.agent.getAgents(),
        api.swarm.getSwarms(),
        api.monitoring.getSupervisorStats().catch((e) => { logger.debug('SupervisorPanel', 'getSupervisorStats failed', e); return null }),
        api.monitoring.listAuditEvents({ limit: 20 }).catch((e) => { logger.debug('SupervisorPanel', 'listAuditEvents failed', e); return [] }),
        api.monitoring.getAuditStats().catch((e) => { logger.debug('SupervisorPanel', 'getAuditStats failed', e); return null }),
        api.monitoring.getScheduleRunnerStatus().catch((e) => { logger.debug('SupervisorPanel', 'getScheduleRunnerStatus failed', e); return null }),
      ])
      if (!mountedRef.current) return
      setAgents(agentList)
      if (supStats) setSupervisorStats(supStats)
      setAuditEvents(auditResult)
      if (auditStatsResult) setAuditStats(auditStatsResult)
      if (runnerResult) setScheduleRunner(runnerResult)

      const taskItems: TaskItem[] = []

      // Fetch real tasks from each swarm
      const taskResults = await Promise.all(
        swarms.map(swarm => api.swarm.getSwarmTasks(swarm.id).catch((e) => { logger.debug('SupervisorPanel', 'getSwarmTasks failed', e); return [] as TaskInfo[] }))
      )
      swarms.forEach((swarm, i) => {
        const tasks = taskResults[i]
        for (const task of tasks) {
          taskItems.push({
            id: task.id,
            title: task.title,
            status: task.status as TaskItem['status'],
            agentId: (task.assignedTo?.[0]) || swarm.coordinatorId || '',
            agentName: task.assignedTo?.[0] || 'Unassigned',
            progress: task.status === 'completed' ? 100 : 0,
            createdAt: new Date(task.createdAt || Date.now())
          })
        }
      })

      setTasks(taskItems)

      // 构建活动日志（基于 agent 状态变化）
      const activityItems: ActivityItem[] = agentList
        .filter(a => a.lastActive)
        .map(agent => {
          const agentState = agent.state || agent.status || 'unknown'
          const activityType: ActivityItem['type'] = agentState === 'error' ? 'error' : agentState === 'running' || agentState === 'executing' ? 'commit' : 'review'
          return {
            id: `activity-${agent.id}`,
            type: activityType,
            message: agentState === 'running' || agentState === 'executing' ? `${agent.name} is working` : `${agent.name} is ${agentState}`,
            agent: agent.name,
            timestamp: new Date(agent.lastActive || Date.now())
          }
        })
        .slice(0, 10)

      setActivities(activityItems)

      // Fetch A2A status
      const a2aResult = await api.a2a.getStatus().catch((e) => { logger.debug('SupervisorPanel', 'a2a.getStatus failed', e); return null })
      if (a2aResult && mountedRef.current) setA2aStatus(a2aResult as { messageLogSize: number })
    } catch (error) {
      logger.error('SupervisorPanel', 'Failed to load supervisor data:', error)
      if (!mountedRef.current) return
      // 设置空状态而不是 mock 数据
      setAgents([])
      setTasks([])
      setActivities([])
    }
  }, [])

  // Load initial data + subscribe to real-time event-driven updates
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial data load is intentional
    loadData()

    const unsubScheduleStart = events.subscribe('schedule_execution_started', () => loadData())
    const unsubScheduleDone = events.subscribe('schedule_execution_completed', () => loadData())
    const unsubSwarmTask = events.subscribe('swarm_task_update', () => loadData())
    const unsubAgentStatus = events.subscribe('agent_status_change', () => loadData())

    return () => {
      unsubScheduleStart()
      unsubScheduleDone()
      unsubSwarmTask()
      unsubAgentStatus()
    }
  }, [loadData])

  // Sync handoff to review queue
  useEffect(() => {
    if (activeHandoff) {
      const reviewItem: ReviewItem = {
        id: activeHandoff.id,
        type: 'handoff',
        title: `Handoff: ${activeHandoff.fromAgent} → ${activeHandoff.toAgent}`,
        agent: activeHandoff.fromAgent,
        description: activeHandoff.reason,
        timestamp: activeHandoff.createdAt,
        data: activeHandoff
      }
      // This is intentional - syncing external store state to local state
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Syncing external handoff store to local review queue
      setReviewQueue(prev => {
        if (prev.find(r => r.id === activeHandoff.id)) return prev
        return [reviewItem, ...prev]
      })
    }
  }, [activeHandoff])

  const handleReviewAction = (reviewId: string, action: 'approve' | 'reject') => {
    const review = reviewQueue.find(r => r.id === reviewId)
    if (review?.type === 'handoff' && review.data) {
      resolveHandoff(action === 'approve', action === 'approve' ? 'Approved by supervisor' : 'Rejected by supervisor')
    }
    setReviewQueue(prev => prev.filter(r => r.id !== reviewId))
  }

  const handleRefresh = useCallback(async () => {
    setLoading(true)
    try {
      await loadData()
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [loadData])

  const handlePauseAll = useCallback(async () => {
    const activeAgents = agents.filter(a => a.state === 'active' || a.state === 'executing')
    if (activeAgents.length === 0) return
    setLoading(true)
    try {
      await Promise.all(activeAgents.map(a => api.agent.stopAgent(a.id)))
      await loadData()
    } catch (err) {
      logger.error('SupervisorPanel', 'Failed to pause agents:', err)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [agents, loadData])

  const getHealthStatus = () => {
    if (supervisorStats) {
      if (supervisorStats.unhealthyAgents > 0) return { status: 'degraded', color: 'text-yellow-500', bg: 'bg-yellow-500/20' }
      if (supervisorStats.busyAgents > 0) return { status: 'active', color: 'text-green-500', bg: 'bg-green-500/20' }
      return { status: 'idle', color: 'text-slate-500', bg: 'bg-slate-500/20' }
    }
    const running = agents.filter(a => (a.state || a.status) === 'running' || (a.state || a.status) === 'executing').length
    const errorCount = agents.filter(a => (a.state || a.status) === 'error').length
    if (errorCount > 0) return { status: 'degraded', color: 'text-yellow-500', bg: 'bg-yellow-500/20' }
    if (running > 0) return { status: 'active', color: 'text-green-500', bg: 'bg-green-500/20' }
    return { status: 'idle', color: 'text-slate-500', bg: 'bg-slate-500/20' }
  }

  const health = getHealthStatus()
  const risk = calculateRiskLevel(agents, tasks)

  const handleCancelTask = useCallback(async (swarmId: string, taskId: string) => {
    try {
      await api.swarm.cancelTask(swarmId, taskId, 'user_cancelled')
      await loadData()
    } catch (err) {
      logger.error('SupervisorPanel', 'Failed to cancel task:', err)
    }
  }, [loadData])

  const toggleSection = (section: string) => {
    setExpandedSection(prev => prev === section ? null : section)
  }

  const renderSection = (
    id: string,
    title: string,
    icon: React.ReactNode,
    children?: React.ReactNode,
    badge?: number
  ) => {
    const isExpanded = expandedSection === id
    return (
    <div className="border-b border-[#1f1f21] last:border-b-0">
      <button
        onClick={() => toggleSection(id)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-800/30 transition-colors"
        aria-expanded={isExpanded}
        aria-controls={`section-${id}`}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {badge !== undefined && badge > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-500 text-white rounded-full">
              {badge}
            </span>
          )}
          <svg
            className={`w-4 h-4 text-slate-500 transition-transform ${expandedSection === id ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {isExpanded && (
        <div id={`section-${id}`} className="pb-2">
          {children}
        </div>
      )}
    </div>
  )}

  return (
    <div className="flex flex-col h-full bg-[#0f0f10] border-l border-[#1f1f21]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#1f1f21]">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Supervisor</h3>
      </div>

      {/* Dashboard Summary */}
      <div className="px-3 py-2 border-b border-[#1f1f21]">
        <div className="grid grid-cols-2 gap-1.5">
          {/* Tasks Card */}
          <div className="bg-slate-800/50 rounded p-2 text-center">
            <div className="text-sm font-bold text-blue-400">
              {tasks.filter(t => t.status === 'running').length}/{tasks.filter(t => t.status === 'pending').length}/{tasks.filter(t => t.status === 'completed').length}
            </div>
            <div className="text-[10px] text-slate-500">Running/Pending/Done</div>
          </div>
          {/* Agents Card */}
          <div className="bg-slate-800/50 rounded p-2 text-center">
            <div className="text-sm font-bold text-green-400">
              {agents.filter(a => (a.state || a.status) === 'running' || (a.state || a.status) === 'executing' || (a.state || a.status) === 'active' || (a.state || a.status) === 'idle').length}/{agents.filter(a => (a.state || a.status) === 'error').length}
            </div>
            <div className="text-[10px] text-slate-500">Online/Error</div>
          </div>
          {/* Risk Card */}
          <div className="bg-slate-800/50 rounded p-2 text-center">
            <div className="flex items-center justify-center gap-1">
              <span className={`w-2 h-2 rounded-full ${
                risk.level === 'low' ? 'bg-green-400' :
                risk.level === 'medium' ? 'bg-yellow-400' :
                'bg-red-400'
              }`} />
              <span className={`text-sm font-bold ${
                risk.level === 'low' ? 'text-green-400' :
                risk.level === 'medium' ? 'text-yellow-400' :
                'text-red-400'
              }`}>
                {risk.level.toUpperCase()}
              </span>
            </div>
            <div className="text-[10px] text-slate-500">Risk</div>
          </div>
          {/* A2A Card */}
          <div className="bg-slate-800/50 rounded p-2 text-center">
            <div className="text-sm font-bold text-purple-400">{a2aStatus?.messageLogSize ?? '-'}</div>
            <div className="text-[10px] text-slate-500">A2A Messages</div>
          </div>
        </div>
        {/* Decision Priority Summary */}
        {(reviewQueue.length > 0 || risk.alerts.length > 0) && (
          <div className="mt-1.5 text-[10px] text-yellow-400">
            需要决策: {[
              reviewQueue.length > 0 ? `Handoff x${reviewQueue.length}` : null,
              ...risk.alerts,
            ].filter(Boolean).join(', ')}
          </div>
        )}
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Health Section */}
        {renderSection(
          'health',
          'Health',
          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>,
          <div className="px-3 space-y-2">
            <div className={`flex items-center justify-between p-2 rounded ${health.bg}`}>
              <span className={`text-xs font-medium ${health.color}`}>System Status</span>
              <span className={`text-xs capitalize ${health.color}`}>{health.status}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-slate-800/50 rounded">
                <div className="text-lg font-bold text-green-400">{supervisorStats?.healthyAgents ?? agents.filter(a => (a.state || a.status) === 'running' || (a.state || a.status) === 'executing').length}</div>
                <div className="text-[10px] text-slate-500">Healthy</div>
              </div>
              <div className="p-2 bg-slate-800/50 rounded">
                <div className="text-lg font-bold text-slate-400">{supervisorStats ? supervisorStats.totalAgents - supervisorStats.busyAgents - supervisorStats.unhealthyAgents : agents.filter(a => (a.state || a.status) === 'idle').length}</div>
                <div className="text-[10px] text-slate-500">Idle</div>
              </div>
              <div className="p-2 bg-slate-800/50 rounded">
                <div className="text-lg font-bold text-red-400">{supervisorStats?.unhealthyAgents ?? agents.filter(a => (a.state || a.status) === 'error').length}</div>
                <div className="text-[10px] text-slate-500">Unhealthy</div>
              </div>
            </div>
            {supervisorStats && (
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-2 bg-slate-800/50 rounded">
                  <div className="text-sm font-bold text-blue-400">{Math.round(supervisorStats.avgResponseTime)}ms</div>
                  <div className="text-[10px] text-slate-500">Avg Response</div>
                </div>
                <div className="p-2 bg-slate-800/50 rounded">
                  <div className="text-sm font-bold text-purple-400">{supervisorStats.throughput.toFixed(1)}/s</div>
                  <div className="text-[10px] text-slate-500">Throughput</div>
                </div>
              </div>
            )}
          </div>,
          undefined
        )}

        {/* Tasks Section */}
        {renderSection(
          'tasks',
          'Tasks',
          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>,
          <div className="px-3 space-y-1">
            {tasks.map(task => (
              <div key={task.id} className="p-2 bg-slate-800/30 rounded group">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-white truncate flex-1">{task.title}</span>
                  <div className="flex items-center gap-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      task.status === 'running' ? 'bg-blue-500/20 text-blue-400' :
                      task.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                      task.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>
                      {task.status}
                    </span>
                    {task.status === 'running' && (
                      <button
                        onClick={() => handleCancelTask(task.id, task.id)}
                        className="opacity-0 group-hover:opacity-100 px-1 py-0.5 text-[10px] bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-all"
                        title="Cancel task"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500">{task.agentName}</span>
                  {task.status === 'running' && (
                    <div className="flex-1 h-1 bg-slate-700 rounded overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>,
          tasks.filter(t => t.status === 'running').length
        )}

        {/* Review Queue Section */}
        {renderSection(
          'review',
          'Review Queue',
          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>,
          <div className="px-3 space-y-2">
            {reviewQueue.length === 0 ? (
              <div className="text-center py-4 text-slate-500 text-xs">
                No items pending review
              </div>
            ) : (
              reviewQueue.map(review => (
                <div key={review.id} className="p-2 bg-slate-800/50 rounded border border-slate-700">
                  <div className="flex items-start justify-between mb-1">
                    <span className="text-xs text-white flex-1 mr-2">{review.title}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        review.type === 'handoff' ? 'bg-purple-500/20 text-purple-400' :
                        review.type === 'permission' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {review.type}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        review.type === 'handoff' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {review.type === 'handoff' ? '● MED' : '● HIGH'}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 mb-1">{review.description}</p>
                  <p className="text-[10px] text-slate-500 italic mb-2">
                    {review.type === 'handoff' && '建议：查看上下文后接受或拒绝'}
                    {review.type === 'permission' && '建议：确认权限范围后批准'}
                    {review.type === 'conflict' && '建议：手动解决冲突'}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">{review.agent}</span>
                      {(Date.now() - review.timestamp.getTime()) > 5 * 60 * 1000 && (
                        <span className="text-[10px] text-yellow-400">{'⏰'} 等待 {formatTimeAgo(review.timestamp)}</span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleReviewAction(review.id, 'reject')}
                        className="px-2 py-0.5 text-[10px] bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => handleReviewAction(review.id, 'approve')}
                        className="px-2 py-0.5 text-[10px] bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors"
                      >
                        Approve
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>,
          reviewQueue.length
        )}

        {/* Activity Feed Section */}
        {renderSection(
          'activity',
          'Activity',
          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>,
          <div className="px-3 space-y-1">
            {activities.map(activity => (
              <div key={activity.id} className="flex items-start gap-2 py-1">
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${
                  activity.type === 'commit' ? 'bg-green-500' :
                  activity.type === 'error' ? 'bg-red-500' :
                  activity.type === 'review' ? 'bg-blue-500' :
                  'bg-slate-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-slate-300 truncate">{activity.message}</p>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    {activity.agent && <span>{activity.agent}</span>}
                    <span>{formatTimeAgo(activity.timestamp)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>,
          undefined
        )}

        {/* Audit Log Section */}
        {renderSection(
          'audit',
          'Audit Log',
          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>,
          <div className="px-3 space-y-1">
            {auditStats && (
              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-2">
                <span>{auditStats.count} events</span>
                <span className={auditStats.enabled ? 'text-green-400' : 'text-slate-500'}>
                  {auditStats.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            )}
            {auditEvents.length === 0 ? (
              <div className="text-center py-4 text-slate-500 text-xs">No audit events</div>
            ) : (
              auditEvents.slice(0, 10).map(event => (
                <div key={event.id} className="flex items-start gap-2 py-1">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${
                    event.success ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-slate-300 truncate">
                      <span className="text-slate-500">{event.actor}</span> {event.action} <span className="text-slate-500">{event.resourceType}</span>
                    </p>
                    <span className="text-[10px] text-slate-500">{formatTimeAgo(new Date(event.timestamp))}</span>
                  </div>
                </div>
              ))
            )}
            {auditEvents.length > 0 && (
              <button
                onClick={async () => {
                  try {
                    await api.monitoring.clearAuditLog()
                    setAuditEvents([])
                    setAuditStats(prev => prev ? { ...prev, count: 0 } : null)
                  } catch (err) {
                    logger.error('SupervisorPanel', 'Failed to clear audit log:', err)
                  }
                }}
                className="w-full mt-2 py-1 text-[10px] text-slate-500 hover:text-red-400 bg-slate-800/30 rounded transition-colors"
              >
                Clear Audit Log
              </button>
            )}
          </div>,
          auditStats?.count ? Math.min(auditStats.count, 99) : undefined
        )}

        {/* Schedule Runner Section */}
        {renderSection(
          'schedule-runner',
          'Schedule Runner',
          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>,
          <div className="px-3 space-y-2">
            {scheduleRunner ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300">
                    Status: <span className={scheduleRunner.running ? 'text-green-400' : 'text-slate-500'}>
                      {scheduleRunner.running ? 'Running' : 'Stopped'}
                    </span>
                  </span>
                  <button
                    onClick={async () => {
                      try {
                        const result = scheduleRunner.running
                          ? await api.monitoring.stopScheduleRunner()
                          : await api.monitoring.startScheduleRunner()
                        setScheduleRunner(result)
                      } catch (err) {
                        logger.error('SupervisorPanel', 'Failed to toggle schedule runner:', err)
                      }
                    }}
                    className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                      scheduleRunner.running
                        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                        : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                    }`}
                  >
                    {scheduleRunner.running ? 'Stop' : 'Start'}
                  </button>
                </div>
                <div className="text-[10px] text-slate-500">
                  {scheduleRunner.scheduleCount} schedule(s)
                </div>
                {scheduleRunner.schedules && scheduleRunner.schedules.length > 0 && (
                  <div className="space-y-1 mt-1">
                    {scheduleRunner.schedules.map(s => (
                      <div key={s.id} className="p-1.5 bg-slate-800/30 rounded text-[10px]">
                        <div className="text-slate-300">{s.name}</div>
                        <div className="text-slate-500">{s.cron}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-4 text-slate-500 text-xs">Schedule runner not available</div>
            )}
          </div>,
          scheduleRunner?.running ? scheduleRunner.scheduleCount : undefined
        )}
      </div>

      {/* Footer - Quick Actions */}
      <div className="px-3 py-2 border-t border-[#1f1f21] flex items-center gap-2">
        <button onClick={handlePauseAll} disabled={loading} className="flex-1 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700/50 rounded transition-colors disabled:opacity-50">
          {loading ? 'Pausing...' : 'Pause All'}
        </button>
        <button onClick={handleRefresh} disabled={loading} className="flex-1 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700/50 rounded transition-colors disabled:opacity-50">
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    </div>
  )
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default SupervisorPanel