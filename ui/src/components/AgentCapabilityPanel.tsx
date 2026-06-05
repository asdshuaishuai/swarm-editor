import { useState, useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import { useAgentLifecycleStore } from '../stores/agentLifecycleStore'
import { useTaskFlowStore } from '../stores/taskFlowStore'
import AgentConfigModal from './AgentConfigModal'
import type { AgentConfig } from '../types'

type FilterTab = 'all' | 'active' | 'idle' | 'alert'

const STATUS_COLORS: Record<string, string> = {
  idle: '#3fb950',
  executing: '#f0883e',
  thinking: '#58a6ff',
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

interface AgentEntry {
  agentId: string
  name: string
  state: string
  capabilities: string[]
  type?: string
  registered: boolean
}

export default function AgentCapabilityPanel() {
  const [filter, setFilter] = useState<FilterTab>('all')
  const [configModalAgent, setConfigModalAgent] = useState<AgentConfig | null>(null)

  // Real registered/scanned agents from appStore
  const registeredAgents = useAppStore((s) => s.agents)
  // Live lifecycle state from monitoring
  const lifecycleAgents = useAgentLifecycleStore((s) => s.agents)
  const agentCards = useAgentLifecycleStore((s) => s.agentCards)
  const getAgentAlerts = useAgentLifecycleStore((s) => s.getAgentAlerts)
  const toolInvocations = useTaskFlowStore((s) => s.toolInvocations)
  const handoffChain = useTaskFlowStore((s) => s.handoffChain)

  // Merge registered agents with lifecycle state
  const agentList = useMemo<AgentEntry[]>(() => {
    const seen = new Set<string>()
    const list: AgentEntry[] = []

    // Primary source: registered agents from appStore (real scanned agents)
    for (const agent of registeredAgents) {
      seen.add(agent.id)
      const lifecycle = lifecycleAgents.get(agent.id)
      list.push({
        agentId: agent.id,
        name: agent.name,
        state: lifecycle?.state || agent.state,
        capabilities: lifecycle?.capabilities || [],
        type: agent.type,
        registered: true,
      })
    }

    // Secondary: lifecycle agents not yet in registered list
    for (const [id, agent] of lifecycleAgents.entries()) {
      if (!seen.has(id)) {
        seen.add(id)
        list.push({
          agentId: id,
          name: agent.name,
          state: agent.state,
          capabilities: agent.capabilities || [],
          registered: false,
        })
      }
    }

    return list
  }, [registeredAgents, lifecycleAgents])

  const filteredAgents = useMemo(() => {
    if (filter === 'all') return agentList
    if (filter === 'active') return agentList.filter((a) => a.state === 'executing' || a.state === 'thinking')
    if (filter === 'idle') return agentList.filter((a) => a.state === 'idle')
    if (filter === 'alert') return agentList.filter((a) => getAgentAlerts(a.agentId).length > 0 || a.state === 'error')
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
          const hasAlert = alerts.length > 0 || agent.state === 'error'
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
                {agent.type && (
                  <span className="text-[9px] px-1 rounded" style={{ background: '#30363d', color: '#8b949e' }}>
                    {agent.type}
                  </span>
                )}
                {hasAlert && (
                  <svg
                    className="w-3.5 h-3.5 shrink-0"
                    fill="#fb7185"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2L1 21h22L12 2zm0 4l7.53 13H4.47L12 6zm-1 5v4h2v-4h-2zm0 6v2h2v-2h-2z" />
                  </svg>
                )}
                <button
                  onClick={() => setConfigModalAgent({
                    id: agent.agentId,
                    name: agent.name,
                    description: '',
                    enabled: true,
                    command: '',
                    args: [],
                    env: {},
                    tags: [],
                  })}
                  className="ml-auto p-1 rounded hover:bg-[#30363d] transition-colors"
                  style={{ color: '#6b7280' }}
                  title="配置 Agent"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
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

      {/* Agent Config Modal */}
      {configModalAgent && (
        <AgentConfigModal
          agent={configModalAgent}
          onClose={() => setConfigModalAgent(null)}
          onSaved={() => setConfigModalAgent(null)}
        />
      )}
    </div>
  )
}
