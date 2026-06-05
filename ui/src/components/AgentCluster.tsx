import { useState } from 'react'

export interface Agent {
  id: string
  name: string
  icon: string
  status: 'active' | 'idle' | 'busy' | 'error' | 'offline'
  role: 'primary' | 'worker' | 'reviewer' | 'advisor'
  task?: string
  latency?: number
}

interface AgentClusterProps {
  agents: Agent[]
  primaryAgentId?: string
  onSetPrimary: (agentId: string) => void
  onAgentClick?: (agent: Agent) => void
}

const STATUS_COLORS = {
  active: 'bg-success shadow-[0_0_6px_rgba(34,197,94,0.4)]',
  idle: 'bg-text-muted',
  busy: 'bg-warning animate-pulse',
  error: 'bg-error shadow-[0_0_6px_rgba(239,68,68,0.4)]',
  offline: 'bg-text-disabled',
}

const AGENT_ICONS: Record<string, string> = {
  'claude-code': '◈',
  'codex': '◆',
  'kimi-code': '◇',
  'opencode': '○',
  'cline': '□',
  'qwen-code': '◆',
  'gemini-cli': '◇',
  'default': '□',
}

export function AgentCluster({ agents, primaryAgentId, onSetPrimary, onAgentClick }: AgentClusterProps) {
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 overflow-x-auto" style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-default)' }}>
      {agents.map(agent => {
        const isPrimary = agent.id === primaryAgentId
        const isHovered = agent.id === hoveredAgent

        return (
          <div
            key={agent.id}
            className="relative group"
            onMouseEnter={() => setHoveredAgent(agent.id)}
            onMouseLeave={() => setHoveredAgent(null)}
          >
            <button
              onClick={() => onAgentClick?.(agent)}
              onDoubleClick={() => onSetPrimary(agent.id)}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all
                ${isPrimary
                  ? 'bg-primary text-white shadow-sm'
                  : 'hover:bg-bg-hover'
                }
                ${agent.status === 'offline' ? 'opacity-50' : ''}
              `}
              style={!isPrimary ? { color: 'var(--text-secondary)' } : undefined}
              title={`${agent.name}${isPrimary ? ' (主导)' : ''} - 双击设为主导`}
            >
              {/* 状态指示器 */}
              <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[agent.status]}`} />

              {/* Agent 图标 */}
              <span className="text-base">{AGENT_ICONS[agent.id] || AGENT_ICONS.default}</span>

              {/* Agent 名称 */}
              <span className="font-medium">{agent.name}</span>

              {/* 主导标记 */}
              {isPrimary && (
                <span className="text-xs opacity-75">👑</span>
              )}

              {/* 延迟 */}
              {agent.latency && (
                <span className="text-xs opacity-50">{agent.latency}ms</span>
              )}
            </button>

            {/* 悬浮提示 */}
            {isHovered && (
              <div
                className="absolute top-full left-0 mt-1 z-50 p-2 rounded-md shadow-mac text-xs min-w-[160px] animate-fade-in"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}
              >
                <div className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{agent.name}</div>
                <div style={{ color: 'var(--text-muted)' }}>
                  状态: {agent.status}
                  {agent.task && <><br />任务: {agent.task}</>}
                  {agent.latency && <><br />延迟: {agent.latency}ms</>}
                </div>
                {!isPrimary && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onSetPrimary(agent.id)
                    }}
                    className="mt-2 w-full text-center py-1 rounded text-xs transition-colors"
                    style={{ background: 'var(--primary-muted)', color: 'var(--primary-light)' }}
                  >
                    设为主导
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* 占位，推到右侧 */}
      <div className="flex-1" />

      {/* 快捷操作 */}
      <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>双击设为主导</span>
      </div>
    </div>
  )
}
