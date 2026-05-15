import { useState, useEffect, useCallback, useRef } from 'react'
import { api, AgentInfo } from '../services'
import { logger } from '../utils'
import { useHandoffStore } from '../stores/handoffStore'

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

export function SupervisorPanel() {
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([])
  const [expandedSection, setExpandedSection] = useState<string | null>('tasks')
  const [loading, setLoading] = useState(false)
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
      // 获取真实的 agents 数据
      const agentList = await api.agent.getAgents()
      if (!mountedRef.current) return
      setAgents(agentList)

      // 获取 swarms 数据来构建 tasks
      const swarms = await api.swarm.getSwarms()
      if (!mountedRef.current) return

      const taskItems: TaskItem[] = []

      swarms.forEach(swarm => {
        if (swarm.stats && swarm.stats.pendingTasks + swarm.stats.executingAgents > 0) {
          const totalTasks = swarm.stats.pendingTasks + swarm.stats.completedTasks
          taskItems.push({
            id: swarm.id,
            title: swarm.name,
            status: swarm.state === 'running' ? 'running' : 'pending',
            agentId: swarm.coordinatorId || '',
            agentName: 'Coordinator',
            progress: totalTasks > 0 ? (swarm.stats.completedTasks / totalTasks) * 100 : 0,
            createdAt: new Date(swarm.createdAt || Date.now())
          })
        }
      })

      setTasks(taskItems)

      // 构建活动日志（基于 agent 状态变化）
      const activityItems: ActivityItem[] = agentList
        .filter(a => a.lastActive)
        .map(agent => {
          const activityType: ActivityItem['type'] = agent.status === 'error' ? 'error' : agent.status === 'running' ? 'commit' : 'review'
          return {
            id: `activity-${agent.id}`,
            type: activityType,
            message: agent.status === 'running' ? `${agent.name} is working` : `${agent.name} is ${agent.status}`,
            agent: agent.name,
            timestamp: new Date(agent.lastActive || Date.now())
          }
        })
        .slice(0, 10)

      setActivities(activityItems)
    } catch (error) {
      logger.error('SupervisorPanel', 'Failed to load supervisor data:', error)
      if (!mountedRef.current) return
      // 设置空状态而不是 mock 数据
      setAgents([])
      setTasks([])
      setActivities([])
    }
  }, [])

  // Load initial data
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial data load is intentional
    loadData()

    // Subscribe to real-time updates
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
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
    const running = agents.filter(a => a.status === 'running').length
    const errorCount = agents.filter(a => a.status === 'error').length

    if (errorCount > 0) return { status: 'degraded', color: 'text-yellow-500', bg: 'bg-yellow-500/20' }
    if (running > 0) return { status: 'active', color: 'text-green-500', bg: 'bg-green-500/20' }
    return { status: 'idle', color: 'text-slate-500', bg: 'bg-slate-500/20' }
  }

  const health = getHealthStatus()

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
                <div className="text-lg font-bold text-green-400">{agents.filter(a => a.status === 'running').length}</div>
                <div className="text-[10px] text-slate-500">Running</div>
              </div>
              <div className="p-2 bg-slate-800/50 rounded">
                <div className="text-lg font-bold text-slate-400">{agents.filter(a => a.status === 'idle').length}</div>
                <div className="text-[10px] text-slate-500">Idle</div>
              </div>
              <div className="p-2 bg-slate-800/50 rounded">
                <div className="text-lg font-bold text-red-400">{agents.filter(a => a.status === 'error').length}</div>
                <div className="text-[10px] text-slate-500">Error</div>
              </div>
            </div>
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
              <div key={task.id} className="p-2 bg-slate-800/30 rounded">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-white truncate flex-1">{task.title}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    task.status === 'running' ? 'bg-blue-500/20 text-blue-400' :
                    task.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                    task.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                    'bg-slate-500/20 text-slate-400'
                  }`}>
                    {task.status}
                  </span>
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
                    <span className="text-xs text-white">{review.title}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      review.type === 'handoff' ? 'bg-purple-500/20 text-purple-400' :
                      review.type === 'permission' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {review.type}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mb-2">{review.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">{review.agent}</span>
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