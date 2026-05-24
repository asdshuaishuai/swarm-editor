import { useState, useEffect, useCallback } from 'react'
import { api } from '../services'
import { logger } from '../utils'

interface Session {
  id: string
  agentId: string
  agentName: string
  status: 'active' | 'idle' | 'completed' | 'error'
  startTime: string
  lastActive: string
  messageCount: number
}

interface AgentSessionPanelProps {
  onSessionSelect?: (sessionId: string) => void
}

export function AgentSessionPanel({ onSessionSelect }: AgentSessionPanelProps) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSessions = useCallback(async () => {
    try {
      const sessionList = await api.agent.getSessions()
      // Map backend sessions to local format
      const mappedSessions: Session[] = sessionList.map(s => ({
        id: s.id,
        agentId: s.agentId,
        agentName: s.agentName || s.agentId,
        status: 'active' as const,
        startTime: s.createdAt,
        lastActive: s.updatedAt,
        messageCount: s.messages?.length || 0,
      }))
      setSessions(mappedSessions)
    } catch (err) {
      logger.error('Failed to fetch sessions:', err)
      // Fallback to empty list on error
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-success'
      case 'idle':
        return 'bg-info'
      case 'completed':
        return 'bg-text-muted'
      case 'error':
        return 'bg-error'
      default:
        return 'bg-text-muted'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return '活跃'
      case 'idle':
        return '空闲'
      case 'completed':
        return '完成'
      case 'error':
        return '错误'
      default:
        return '未知'
    }
  }

  const formatTime = (isoString: string) => {
    const date = new Date(isoString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    return `${Math.floor(diff / 86400000)} 天前`
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
            会话历史
          </div>
          <button
            onClick={fetchSessions}
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
        {sessions.length === 0 ? (
          <div className="p-4 text-center" style={{ color: 'var(--text-muted)' }}>
            <div className="text-2xl mb-2">💬</div>
            <div className="text-sm">暂无会话</div>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {sessions.map(session => (
              <div
                key={session.id}
                className="p-2 rounded-md hover:bg-bg-hover cursor-pointer transition-colors"
                onClick={() => onSessionSelect?.(session.id)}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${getStatusColor(session.status)}`} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {session.agentName}
                    </span>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {getStatusText(session.status)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span>{session.messageCount} 条消息</span>
                  <span>{formatTime(session.lastActive)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-3" style={{ borderTop: '1px solid var(--border-default)' }}>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          共 {sessions.length} 个会话
        </div>
      </div>
    </div>
  )
}
