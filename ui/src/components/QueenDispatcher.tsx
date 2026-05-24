import { useState, useCallback, useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import { useTaskFlowStore, type TaskFlowEntry } from '../stores/taskFlowStore'
import { api } from '../services'
import { logger } from '../utils'

type Strategy = 'round_robin' | 'least_loaded' | 'priority' | 'capability'

const STRATEGIES: Record<Strategy, { label: string; desc: string }> = {
  round_robin: { label: '轮询调度', desc: 'Round Robin' },
  least_loaded: { label: '最小负载', desc: 'Least Loaded' },
  priority: { label: '优先级调度', desc: 'Priority Based' },
  capability: { label: '能力匹配', desc: 'Capability Match' },
}

export default function QueenDispatcher() {
  const [strategy, setStrategy] = useState<Strategy>('priority')
  const [goal, setGoal] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const addToast = useAppStore(state => state.addToast)

  // Read task flow for execution status display
  const taskFlowTasks = useTaskFlowStore(state => state.tasks)

  // Recent tasks for display
  const recentTasks = useMemo(() => {
    const tasks: TaskFlowEntry[] = []
    for (const task of taskFlowTasks.values()) {
      tasks.push(task)
    }
    return tasks
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3)
  }, [taskFlowTasks])

  const statusLabel = (status: string): { text: string; color: string } => {
    switch (status) {
      case 'pending': return { text: '等待中', color: '#6b7280' }
      case 'running': return { text: '执行中', color: '#58a6ff' }
      case 'completed': return { text: '已完成', color: '#3fb950' }
      case 'failed': return { text: '失败', color: '#f85149' }
      case 'cancelled': return { text: '已取消', color: '#6b7280' }
      default: return { text: status, color: '#6b7280' }
    }
  }

  const handleSubmit = useCallback(async () => {
    if (!goal.trim()) return
    setSubmitting(true)
    try {
      const swarms = await api.swarm.getSwarms()
      if (swarms.length > 0) {
        // Use the first available swarm, prefer one matching our strategy
        const matchingSwarm = swarms.find(s => s.strategy === strategy) || swarms[0]
        await api.swarm.submitTask({
          swarmId: matchingSwarm.id,
          title: goal.trim(),
          description: `策略: ${STRATEGIES[strategy].label}. ${goal.trim()}`,
          priority: strategy === 'priority' ? 'high' : strategy === 'round_robin' ? 'medium' : strategy === 'least_loaded' ? 'medium' : 'medium',
        })
      } else {
        // No swarms available, try direct agent session
        const sessions = await api.agent.getSessions()
        if (sessions.length > 0) {
          await api.agent.sendMessage(sessions[0].id, goal.trim())
        } else {
          addToast('warning', '无可用的 Swarm 或 Agent 会话', '请先启动 Agent 或创建 Swarm')
          return
        }
      }
      addToast('success', '目标已下发', goal.slice(0, 30) + '...')
      setGoal('')
    } catch (err) {
      logger.warn('QueenDispatcher: submit failed', err)
      addToast('error', '下发失败', '目标下发失败')
    } finally {
      setSubmitting(false)
    }
  }, [goal, strategy, addToast])

  return (
    <div className="p-2.5 flex flex-col gap-2 shrink-0 text-xs" style={{ background: '#161b22', borderTop: '1px solid #30363d' }}>
      {/* 策略选择 */}
      <div className="flex items-center justify-between text-[10px] font-mono" style={{ color: '#6b7280' }}>
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.7 4.8L5.5 3.6 4.1 5l1.2 1.2c-.3.5-.5 1-.6 1.6H3v2h1.7c.1.6.3 1.1.6 1.6L4.1 12.6l1.4 1.4 1.2-1.2c.5.3 1 .5 1.6.6V15h2v-1.7c.6-.1 1.1-.3 1.6-.6l1.2 1.2 1.4-1.4-1.2-1.2c.3-.5.5-1 .6-1.6H15V8h-1.7c-.1-.6-.3-1.1-.6-1.6L13.9 5l-1.4-1.4-1.2 1.2c-.5-.3-1-.5-1.6-.6V3h-2v1.7c-.6.1-1.1.3-1.6.6zM10 9a1 1 0 110 2 1 1 0 010-2z" />
            <path d="M18.7 12.8l-1.2-1.2-1.4 1.4 1.2 1.2c-.3.5-.5 1-.6 1.6H15v2h1.7c.1.6.3 1.1.6 1.6l-1.2 1.2 1.4 1.4 1.2-1.2c.5.3 1 .5 1.6.6V23h2v-1.7c.6-.1 1.1-.3 1.6-.6l1.2 1.2 1.4-1.4-1.2-1.2c-.3-.5.5-1 .6-1.6H25v-2h-1.7c-.1-.6-.3-1.1-.6-1.6l1.2-1.2-1.4-1.4-1.2 1.2c-.5-.3-1-.5-1.6-.6V14h-2v1.7c-.6.1-1.1.3-1.6.6zM22 18a1 1 0 110 2 1 1 0 010-2z" />
          </svg>
          蜂王策略:
        </span>
        <select
          value={strategy}
          onChange={e => setStrategy(e.target.value as Strategy)}
          className="text-[10px] rounded px-1.5 py-0.5 focus:outline-none"
          style={{ background: '#0d1117', border: '1px solid #30363d', color: '#d1d5db' }}
        >
          {Object.entries(STRATEGIES).map(([key, { label, desc }]) => (
            <option key={key} value={key}>{label} ({desc})</option>
          ))}
        </select>
      </div>

      {/* 最近任务执行状态 */}
      {recentTasks.length > 0 && (
        <div className="flex flex-col gap-0.5 text-[10px] font-mono" style={{ color: '#6b7280' }}>
          {recentTasks.map(task => {
            const sl = statusLabel(task.status)
            return (
              <div key={task.taskId} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sl.color }} />
                <span className="truncate flex-1" style={{ color: '#9ca3af' }}>{task.title.length > 24 ? task.title.slice(0, 22) + '..' : task.title}</span>
                <span style={{ color: sl.color }}>{sl.text}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* 目标输入框 */}
      <div className="flex items-center gap-1 rounded-md p-1.5" style={{ background: '#0d1117', border: '1px solid #30363d' }}>
        <span style={{ color: '#f59e0b' }} className="text-[11px] font-bold">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2 7l3 9h14l3-9-5 4-4 7-4 7-5-4zm3 11v2h14v-2H5z"/>
          </svg>
        </span>
        <input
          type="text"
          value={goal}
          onChange={e => setGoal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
          placeholder="下发全域调度目标至蜂王 (如: 重构主布局)..."
          className="flex-1 bg-transparent focus:outline-none text-[11px] px-1 font-mono"
          style={{ color: '#d1d5db' }}
          disabled={submitting}
        />
        <button
          onClick={handleSubmit}
          disabled={submitting || !goal.trim()}
          className="w-6 h-6 rounded flex items-center justify-center hover:bg-blue-600 transition"
          style={{ background: '#58a6ff', color: '#fff', opacity: submitting || !goal.trim() ? 0.5 : 1 }}
          title="下发目标"
        >
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
