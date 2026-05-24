import { useState, useMemo } from 'react'
import { useAgentLifecycleStore } from '../stores/agentLifecycleStore'
import { useTaskFlowStore } from '../stores/taskFlowStore'

type FilterTab = 'all' | 'active' | 'idle' | 'alert'

const STATUS_COLORS: Record<string, string> = {
  idle: '#3fb950',
  thinking: '#58a6ff',
  executing: '#f0883e',
  stuck: '#fb7185',
  error: '#fb7185',
  offline: '#6b7280',
}

const CAPABILITY_CHIP_COLORS = [
  '#58a6ff', '#3fb950', '#f0883e', '#bc8cff',
  '#f778ba', '#79c0ff', '#56d364', '#d2a8ff',
]

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '活跃' },
  { key: 'idle', label: '空闲' },
  { key: 'alert', label: '告警' },
]

export default function AgentCapabilityPanel() {
  const [filter, setFilter] = useState<FilterTab>('all')
  const agents = useAgentLifecycleStore((s) => s.agents)
  const agentCards = useAgentLifecycleStore((s) => s.agentCards)
  const getAgentAlerts = useAgentLifecycleStore((s) => s.getAgentAlerts)
  const toolInvocations = useTaskFlowStore((s) => s.toolInvocations)
  const handoffChain = useTaskFlowStore((s) => s.handoffChain)

  const agentList = useMemo(() => {
    const list: { agentId: string; name: string; state: string; capabilities: string[] }[] = []
    for (const agent of agents.values()) {
      list.push(agent)
    }
    return list
  }, [agents])

  const filteredAgents = useMemo(() => {
    if (filter === 'all') return agentList
    if (filter === 'active') return agentList.filter((a) => a.state === 'executing' || a.state === 'thinking')
    if (filter === 'idle') return agentList.filter((a) => a.state === 'idle')
    if (filter === 'alert') return agentList.filter((a) => getAgentAlerts(a.agentId).length > 0)
    return agentList
  }, [agentList, filter, getAgentAlerts])

  const getLatestHandoff = (agentId: string): string | null => {
    const agentHandoffs = handoffChain.filter(
      (h) => h.fromAgent === agentId || h.toAgent === agentId
    )
    if (agentHandoffs.length === 0) return null
    const latest = agentHandoffs[agentHandoffs.length - 1]
    if (latest.fromAgent === agentId) return `→ ${latest.toAgent}`
    return `← ${latest.fromAgent}`
  }

  const getActiveTools = (agentId: string): string[] => {
    return toolInvocations
      .filter((t) => t.agentId === agentId && !t.result && !t.error)
      .slice(-3)
      .map((t) => t.toolName)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Filter bar */}
      <div
        className="flex items-center gap-1 px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid #30363d' }}
      >
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className="px-2.5 py-1 text-[11px] font-medium rounded transition-colors"
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
          {filteredAgents.length}/{agentList.length}
        </span>
      </div>

      {/* Agent card list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {filteredAgents.length === 0 && (
          <div className="text-center py-8 text-xs" style={{ color: '#6b7280' }}>
            暂无匹配的 Agent
          </div>
        )}
        {filteredAgents.map((agent) => {
          const card = agentCards.get(agent.agentId)
          const capabilities = card?.capabilities || agent.capabilities || []
          const alerts = getAgentAlerts(agent.agentId)
          const hasAlert = alerts.length > 0
          const activeTools = getActiveTools(agent.agentId)
          const latestHandoff = getLatestHandoff(agent.agentId)
          const statusColor = STATUS_COLORS[agent.state] || '#6b7280'

          return (
            <div
              key={agent.agentId}
              className="rounded-md p-3 transition-colors"
              style={{
                background: '#21262d',
                border: '1px solid #30363d',
              }}
            >
              {/* Header: status dot + name + alert icon */}
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: statusColor }}
                />
                <span className="text-xs font-bold text-white truncate">{agent.name}</span>
                {hasAlert && (
                  <svg
                    className="w-3.5 h-3.5 shrink-0 ml-auto"
                    fill="#fb7185"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2L1 21h22L12 2zm0 4l7.53 13H4.47L12 6zm-1 5v4h2v-4h-2zm0 6v2h2v-2h-2z" />
                  </svg>
                )}
              </div>

              {/* Capabilities chips */}
              {capabilities.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {capabilities.slice(0, 6).map((cap, i) => (
                    <span
                      key={cap}
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{
                        background: `${CAPABILITY_CHIP_COLORS[i % CAPABILITY_CHIP_COLORS.length]}20`,
                        color: CAPABILITY_CHIP_COLORS[i % CAPABILITY_CHIP_COLORS.length],
                        border: `1px solid ${CAPABILITY_CHIP_COLORS[i % CAPABILITY_CHIP_COLORS.length]}30`,
                      }}
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              )}

              {/* Active tool calls */}
              {activeTools.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {activeTools.map((tool) => (
                    <span
                      key={tool}
                      className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                      style={{ background: '#f0883e20', color: '#f0883e', border: '1px solid #f0883e30' }}
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              )}

              {/* Latest handoff */}
              {latestHandoff && (
                <div className="mt-2 text-[10px] font-mono" style={{ color: '#8b949e' }}>
                  {latestHandoff}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
