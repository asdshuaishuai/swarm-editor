import { useState, useEffect, useCallback } from 'react'
import { api } from '../services'
import { AgentInfo } from '../services/api'
import { getWebSocketClient } from '../services/websocket'
import { logger } from '../utils'

interface AgentConnectionPanelProps {
  onAgentSelect?: (agentId: string) => void
}

export function AgentConnectionPanel({ onAgentSelect }: AgentConnectionPanelProps) {
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<string | null>(null)

  const fetchAgents = useCallback(async () => {
    try {
      const agentList = await api.agent.getAgents()
      setAgents(agentList)
    } catch (err) {
      logger.error('Failed to fetch agents:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAgents()
    const interval = setInterval(fetchAgents, 10000) // Refresh every 10s

    // Subscribe to real-time agent status updates
    const ws = getWebSocketClient()
    const unsub = ws.subscribe('agent_stats', (data: unknown) => {
      const agentStats = data as AgentInfo[]
      if (Array.isArray(agentStats)) {
        setAgents(agentStats)
      }
    })

    return () => {
      clearInterval(interval)
      unsub()
    }
  }, [fetchAgents])

  const handleConnect = async (agentId: string) => {
    setConnecting(agentId)
    try {
      await api.agent.startAgent(agentId)
      await fetchAgents()
    } catch (err) {
      logger.error('Failed to connect agent:', err)
    } finally {
      setConnecting(null)
    }
  }

  const handleDisconnect = async (agentId: string) => {
    setConnecting(agentId)
    try {
      await api.agent.stopAgent(agentId)
      await fetchAgents()
    } catch (err) {
      logger.error('Failed to disconnect agent:', err)
    } finally {
      setConnecting(null)
    }
  }

  const getStatusColor = (state: string) => {
    switch (state) {
      case 'active':
      case 'connected':
      case 'executing':
        return 'bg-success'
      case 'idle':
        return 'bg-info'
      case 'busy':
      case 'thinking':
        return 'bg-warning'
      case 'error':
        return 'bg-error'
      default:
        return 'bg-text-muted'
    }
  }

  const getStatusText = (state: string) => {
    switch (state) {
      case 'active':
      case 'connected':
        return '已连接'
      case 'executing':
        return '执行中'
      case 'idle':
        return '空闲'
      case 'busy':
      case 'thinking':
        return '忙碌'
      case 'error':
        return '错误'
      default:
        return '离线'
    }
  }

  if (loading) {
    return (
      <div className="p-4 text-center" style={{ color: 'var(--text-muted)' }}>
        加载中...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Agent 连接
          </div>
          <button
            onClick={fetchAgents}
            className="p-1 rounded hover:bg-bg-hover transition-colors"
            title="刷新"
          >
            <svg className="w-3 h-3" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {agents.length === 0 ? (
          <div className="p-4 text-center" style={{ color: 'var(--text-muted)' }}>
            <div className="text-2xl mb-2">🔌</div>
            <div className="text-sm">暂无 Agent 连接</div>
            <div className="text-xs mt-1">配置文件: ~/.swarm-editor/agents.json</div>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {agents.map(agent => (
              <div
                key={agent.id}
                className="p-2 rounded-md hover:bg-bg-hover cursor-pointer transition-colors"
                onClick={() => onAgentSelect?.(agent.id)}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${getStatusColor(agent.state)}`} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {agent.name}
                    </span>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {getStatusText(agent.state)}
                  </span>
                </div>

                {agent.description && (
                  <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                    {agent.description}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {agent.state === 'idle' || agent.state === 'offline' ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleConnect(agent.id)
                      }}
                      disabled={connecting === agent.id}
                      className="flex-1 py-1 px-2 rounded text-xs font-medium transition-colors"
                      style={{
                        background: 'var(--primary)',
                        color: 'white',
                        opacity: connecting === agent.id ? 0.5 : 1,
                      }}
                    >
                      {connecting === agent.id ? '连接中...' : '连接'}
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDisconnect(agent.id)
                      }}
                      disabled={connecting === agent.id}
                      className="flex-1 py-1 px-2 rounded text-xs font-medium transition-colors"
                      style={{
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-secondary)',
                        opacity: connecting === agent.id ? 0.5 : 1,
                      }}
                    >
                      {connecting === agent.id ? '断开中...' : '断开'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-3" style={{ borderTop: '1px solid var(--border-default)' }}>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          共 {agents.length} 个 Agent
        </div>
      </div>
    </div>
  )
}
