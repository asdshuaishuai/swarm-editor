import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services'
import { logger } from '../utils'

interface ConversationSession {
  id: string
  agentName: string
  agentId: string
  lastMessage: string
  timestamp: Date
  messageCount: number
}

export function WorkspacePanel() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'files' | 'sessions' | 'agents'>('sessions')
  const [sessions, setSessions] = useState<ConversationSession[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [agents, setAgents] = useState<{id: string; name: string; status: string}[]>([])

  // Load conversation sessions and agents from backend
  useEffect(() => {
    let cancelled = false
    const loadData = async () => {
      try {
        // 获取真实的 agents
        const agentList = await api.agent.getAgents()
        if (cancelled) return
        setAgents(agentList.map(a => ({ id: a.id, name: a.name, status: a.status || a.state || 'unknown' })))

        const sessionList = await api.agent.getSessions()
        if (cancelled) return
        setSessions(sessionList.map(s => ({
          id: s.id,
          agentName: s.agentId,
          agentId: s.agentId,
          lastMessage: `${s.mode} mode`,
          timestamp: new Date(s.createdAt),
          messageCount: 0,
        })))
      } catch (error) {
        if (cancelled) return
        logger.debug('WorkspacePanel', 'Failed to load data:', error)
        setAgents([])
        setSessions([])
      }
    }
    loadData()
    return () => { cancelled = true }
  }, [])

  const formatTimeAgo = (date: Date) => {
    // Date.now() is acceptable here - this function is only called for actual session data
    // eslint-disable-next-line react-hooks/purity
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  const handleSessionClick = (session: ConversationSession) => {
    setSelectedSessionId(session.id)
    // Navigate to editor with session context
    navigate(`/?session=${session.id}&agent=${session.agentId}`)
  }

  const getAgentColor = (agentName: string) => {
    const colors: Record<string, string> = {
      'claude-code': 'text-orange-400 bg-orange-500/20',
      'kimi-code': 'text-purple-400 bg-purple-500/20',
      'opencode': 'text-green-400 bg-green-500/20',
      'crush-cli': 'text-red-400 bg-red-500/20',
      'gemini-cli': 'text-blue-400 bg-blue-500/20',
      'qwen-code': 'text-cyan-400 bg-cyan-500/20',
      'droid-cli': 'text-yellow-400 bg-yellow-500/20'
    }
    return colors[agentName] || 'text-slate-400 bg-slate-500/20'
  }

  return (
    <div className="flex flex-col h-full bg-[#0f0f10] border-r border-[#1f1f21]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1f1f21]">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Workspace</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('agents')}
            className="p-1 rounded hover:bg-slate-800 transition-colors"
            title="New Session"
            aria-label="New Session"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#1f1f21]" role="tablist" aria-label="Workspace views">
        {[
          { id: 'sessions', label: 'Sessions', icon: '💬' },
          { id: 'files', label: 'Files', icon: '📁' },
          { id: 'agents', label: 'Agents', icon: '🤖' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-white bg-slate-800/50 border-b-2 border-blue-500'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
            }`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`${tab.id}-panel`}
          >
            <span className="mr-1">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'sessions' && (
          <div id="sessions-panel" role="tabpanel" aria-label="Sessions" className="py-1">
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                <svg className="w-10 h-10 text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-xs text-slate-500">No conversation sessions yet</p>
                <p className="text-xs text-slate-600 mt-1">Start a new session with an agent</p>
              </div>
            ) : (
              sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => handleSessionClick(session)}
                  className={`w-full px-3 py-2 text-left hover:bg-slate-800/50 transition-colors border-l-2 ${
                    selectedSessionId === session.id
                      ? 'bg-slate-800/50 border-blue-500'
                      : 'border-transparent hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${getAgentColor(session.agentName)}`}>
                      {session.agentName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-white truncate">{session.agentName}</span>
                        <span className="text-[10px] text-slate-500">{formatTimeAgo(session.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate pl-8">{session.lastMessage}</p>
                  <div className="flex items-center gap-2 pl-8 mt-1">
                    <span className="text-[10px] text-slate-500">{session.messageCount} messages</span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {activeTab === 'files' && (
          <div id="files-panel" role="tabpanel" aria-label="Files" className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <svg className="w-10 h-10 text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <p className="text-xs text-slate-500">File explorer</p>
            <p className="text-xs text-slate-600 mt-1">Open a project to view files</p>
          </div>
        )}

        {activeTab === 'agents' && (
          <div id="agents-panel" role="tabpanel" aria-label="Agents" className="py-1">
            {agents.length === 0 ? (
              <div className="text-center py-4 text-slate-500 text-xs">
                No agents configured
              </div>
            ) : (
              agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => navigate(`/settings?agent=${agent.id}`)}
                  className="w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-800/50 transition-colors"
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${getAgentColor(agent.name)}`}>
                    {agent.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs text-slate-300">{agent.name}</span>
                  <div
                    className={`ml-auto w-2 h-2 rounded-full ${
                      agent.status === 'running' ? 'bg-green-500' :
                      agent.status === 'error' ? 'bg-red-500' : 'bg-slate-500'
                    }`}
                    title={agent.status}
                  />
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-[#1f1f21]">
        <button
          onClick={() => navigate('/settings')}
          className="w-full px-2 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700/50 rounded transition-colors flex items-center justify-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>
      </div>
    </div>
  )
}

export default WorkspacePanel
