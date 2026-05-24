import { useState, useMemo } from 'react'
import { useTaskFlowStore, type TaskFlowEntry, type HandoffEvent, type ToolInvocation } from '../stores/taskFlowStore'
import { useAgentLifecycleStore } from '../stores/agentLifecycleStore'

type FilterTab = 'all' | 'running' | 'completed' | 'handoff'

const STATUS_COLORS: Record<string, string> = {
  pending: '#6b7280',
  running: '#58a6ff',
  completed: '#3fb950',
  failed: '#fb7185',
  cancelled: '#8b949e',
}

const STATUS_LABELS: Record<string, string> = {
  pending: '等待中',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'running', label: '运行中' },
  { key: 'completed', label: '已完成' },
  { key: 'handoff', label: '交接中' },
]

export default function TaskFlowVisualization() {
  const [filter, setFilter] = useState<FilterTab>('all')
  const [expandedTask, setExpandedTask] = useState<string | null>(null)

  const tasks = useTaskFlowStore(state => state.tasks)
  const handoffChain = useTaskFlowStore(state => state.handoffChain)
  const agents = useAgentLifecycleStore(state => state.agents)

  const taskList = useMemo(() => {
    const all: TaskFlowEntry[] = []
    for (const task of tasks.values()) all.push(task)
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [tasks])

  const filtered = useMemo(() => {
    if (filter === 'all') return taskList
    if (filter === 'running') return taskList.filter(t => t.status === 'running')
    if (filter === 'completed') return taskList.filter(t => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled')
    if (filter === 'handoff') {
      const handoffTaskIds = new Set(handoffChain.filter(h => !h.accepted).map(h => h.taskId))
      return taskList.filter(t => handoffTaskIds.has(t.taskId))
    }
    return taskList
  }, [taskList, filter, handoffChain])

  // Unique agent names from all tasks for columns
  const agentNames = useMemo(() => {
    const names = new Set<string>()
    for (const task of filtered) {
      for (const a of task.assignedAgents) names.add(a)
    }
    return Array.from(names)
  }, [filtered])

  // Map agent name to lifecycle state color
  const agentStateColor = (name: string): string => {
    for (const agent of agents.values()) {
      if (agent.name === name || agent.agentId === name) {
        if (agent.state === 'executing') return '#58a6ff'
        if (agent.state === 'error' || agent.state === 'stuck') return '#fb7185'
        if (agent.state === 'offline') return '#6b7280'
        return '#3fb950'
      }
    }
    return '#6b7280'
  }

  const activeHandoffs = handoffChain.filter(h => !h.accepted)
  const totalToolCalls = taskList.reduce((sum, t) => sum + t.toolCalls.length, 0)

  const toggleExpand = (taskId: string) => {
    setExpandedTask(prev => (prev === taskId ? null : taskId))
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Filter bar */}
      <div className="flex items-center gap-1 px-3 py-2 shrink-0" style={{ borderBottom: '1px solid #30363d' }}>
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className="px-3 py-1 rounded text-[11px] font-semibold transition"
            style={{
              background: filter === tab.key ? '#21262d' : 'transparent',
              color: filter === tab.key ? '#d1d5db' : '#8b949e',
              border: filter === tab.key ? '1px solid #30363d' : '1px solid transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
        <span className="ml-auto text-[10px] font-mono" style={{ color: '#6b7280' }}>
          {filtered.length} / {taskList.length}
        </span>
      </div>

      {/* Main timeline area */}
      <div className="flex-1 overflow-auto px-3 py-2">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs" style={{ color: '#6b7280' }}>
            暂无任务流数据
          </div>
        ) : (
          <div className="flex gap-3">
            {/* Agent columns */}
            {agentNames.length > 0 && (
              <div className="shrink-0 flex flex-col gap-0" style={{ width: '140px' }}>
                {agentNames.map(name => (
                  <div
                    key={name}
                    className="px-2 py-1.5 text-[10px] font-semibold flex items-center gap-1.5"
                    style={{ background: '#161b22', borderRadius: '4px', border: '1px solid #21262d', color: '#d1d5db' }}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: agentStateColor(name) }}
                    />
                    <span className="truncate">{name.length > 14 ? name.slice(0, 12) + '..' : name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Task timeline */}
            <div className="flex-1 flex flex-col gap-2 min-w-0">
              {filtered.map(task => {
                const isExpanded = expandedTask === task.taskId
                const borderColor = STATUS_COLORS[task.status] || '#6b7280'

                return (
                  <div key={task.taskId}>
                    {/* Task bubble */}
                    <div
                      className="rounded-lg px-3 py-2 cursor-pointer transition hover:brightness-110"
                      style={{ background: '#21262d', borderLeft: `3px solid ${borderColor}`, border: `1px solid #30363d`, borderLeftWidth: '3px', borderLeftColor: borderColor }}
                      onClick={() => toggleExpand(task.taskId)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: borderColor }}
                          />
                          <span className="text-xs font-semibold truncate" style={{ color: '#d1d5db' }}>
                            {task.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                            style={{ background: 'rgba(0,0,0,0.3)', color: STATUS_COLORS[task.status] || '#8b949e' }}
                          >
                            {STATUS_LABELS[task.status] || task.status}
                          </span>
                          {task.assignedAgents.length > 0 && (
                            <span className="text-[10px]" style={{ color: '#8b949e' }}>
                              {task.assignedAgents[0]}
                            </span>
                          )}
                          <svg
                            className="w-3 h-3 shrink-0 transition"
                            style={{ color: '#6b7280', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Expanded: tool calls + handoffs */}
                    {isExpanded && (
                      <div className="ml-3 mt-1 flex flex-col gap-1.5 pl-3" style={{ borderLeft: '1px dashed #30363d' }}>
                        {/* Handoff arrows */}
                        {task.handoffs.map((h: HandoffEvent) => (
                          <div
                            key={h.id}
                            className="flex items-center gap-2 px-2 py-1.5 rounded text-[10px]"
                            style={{ background: 'rgba(248,136,62,0.08)', border: '1px dashed #f0883e' }}
                          >
                            <svg className="w-3 h-3 shrink-0" style={{ color: '#f0883e' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                            <span style={{ color: '#f0883e' }}>{h.fromAgent}</span>
                            <span style={{ color: '#6b7280' }}>&rarr;</span>
                            <span style={{ color: '#f0883e' }}>{h.toAgent}</span>
                            {h.reason && <span style={{ color: '#8b949e' }}> {h.reason}</span>}
                            {!h.accepted && (
                              <span className="ml-auto px-1 rounded text-[9px] font-mono animate-pulse" style={{ background: 'rgba(248,136,62,0.2)', color: '#f0883e' }}>
                                交接中
                              </span>
                            )}
                          </div>
                        ))}

                        {/* Tool call badges */}
                        {task.toolCalls.map((tc: ToolInvocation) => (
                          <div
                            key={tc.id}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] w-fit"
                            style={{ background: 'rgba(192,132,252,0.1)', border: '1px solid rgba(192,132,252,0.25)' }}
                          >
                            <svg className="w-3 h-3 shrink-0" style={{ color: '#c084fc' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span style={{ color: '#c084fc' }}>{tc.toolName}</span>
                            <span style={{ color: '#6b7280' }}>{tc.durationMs}ms</span>
                            {tc.error && <span style={{ color: '#fb7185' }}>ERR</span>}
                          </div>
                        ))}

                        {task.handoffs.length === 0 && task.toolCalls.length === 0 && (
                          <span className="text-[10px] py-1" style={{ color: '#6b7280' }}>
                            无工具调用或交接记录
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div
        className="flex items-center justify-between px-3 py-1.5 shrink-0 text-[10px] font-mono"
        style={{ borderTop: '1px solid #30363d', color: '#8b949e' }}
      >
        <div className="flex items-center gap-4">
          <span>
            总任务: <strong style={{ color: '#d1d5db' }}>{taskList.length}</strong>
          </span>
          <span>
            活跃交接: <strong style={{ color: '#f0883e' }}>{activeHandoffs.length}</strong>
          </span>
          <span>
            工具调用: <strong style={{ color: '#c084fc' }}>{totalToolCalls}</strong>
          </span>
        </div>
        <span style={{ color: '#6b7280' }}>
          Agent 列: {agentNames.length}
        </span>
      </div>
    </div>
  )
}
