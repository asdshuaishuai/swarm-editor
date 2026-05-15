import { useState, useEffect, useRef, useCallback } from 'react'
import { EmergenceDashboard } from '../components/EmergenceDashboard'
import { useHandoffStore } from '../stores/handoffStore'
import { api, type AgentInfo } from '../services'
import { logger } from '../utils'

interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  agentName?: string
}

interface TaskInfo {
  id: string
  name: string
  status: 'pending' | 'in_progress' | 'completed' | 'error'
  assignedAgent?: string
  progress: number
}

interface AgentDispatchPanelProps {
  swarmId?: string
  onTaskClick?: (taskId: string) => void
}

export function AgentDispatchPanel({ swarmId, onTaskClick }: AgentDispatchPanelProps) {
  const [activeView, setActiveView] = useState<'chat' | 'tasks' | 'swarm'>('swarm')
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [tasks, setTasks] = useState<TaskInfo[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [availableAgents, setAvailableAgents] = useState<string[]>([])
  const [agentObjects, setAgentObjects] = useState<AgentInfo[]>([])
  const [isSending, setIsSending] = useState(false)
  const { activeHandoff } = useHandoffStore()
  const mountedRef = useRef(true)
  const sessionRef = useRef<string | null>(null)

  // Track mounted state to prevent setState on unmounted component
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Load real data from backend
  useEffect(() => {
    const loadData = async () => {
      try {
        // 获取 swarms 数据来构建 tasks
        const swarms = await api.swarm.getSwarms()
        if (!mountedRef.current) return

        const taskItems: TaskInfo[] = swarms.map(swarm => ({
          id: swarm.id,
          name: swarm.name,
          status: swarm.state === 'running' ? 'in_progress' : swarm.state === 'created' ? 'pending' : 'completed',
          assignedAgent: (swarm.agents && swarm.agents.length > 0) ? swarm.agents[0] : undefined,
          progress: swarm.stats?.completedTasks
            ? (() => { const total = (swarm.stats.pendingTasks ?? 0) + swarm.stats.completedTasks; return total > 0 ? Math.round((swarm.stats.completedTasks / total) * 100) : 0 })()
            : 0
        }))
        setTasks(taskItems)

        // 获取真实 agents
        const agents = await api.agent.getAgents()
        if (!mountedRef.current) return
        setAgentObjects(agents)
        setAvailableAgents(agents.map(a => a.name))
      } catch (error) {
        logger.debug('AgentDispatch', 'Failed to load data:', error)
        if (!mountedRef.current) return
        setTasks([])
        setAvailableAgents([])
      }
    }
    loadData()
  }, [])

  // Cleanup session on unmount
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        api.agent.closeSession(sessionRef.current).catch(() => {})
      }
    }
  }, [])

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() || isSending) return

    const content = inputValue.trim()
    const newMessage: AgentMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, newMessage])
    setInputValue('')

    // Resolve agent ID from selected agent name
    const agentId = selectedAgent
      ? (agentObjects.find(a => a.name === selectedAgent)?.id ?? selectedAgent)
      : null

    if (!agentId) {
      setMessages(prev => [...prev, {
        id: `msg-${Date.now()}-err`,
        role: 'system',
        content: 'Please select an agent before sending a message.',
        timestamp: new Date()
      }])
      return
    }

    setIsSending(true)
    try {
      // Create session if none exists
      if (!sessionRef.current) {
        const session = await api.agent.createSession(agentId, 'default')
        sessionRef.current = session.id
      }

      // Send message to backend
      const response = await api.agent.sendMessage(sessionRef.current, content)

      if (!mountedRef.current) return

      // Add assistant response if content was returned
      if (response.content) {
        setMessages(prev => [...prev, {
          id: `msg-${Date.now()}-resp`,
          role: 'assistant',
          content: response.content!,
          timestamp: new Date(),
          agentName: selectedAgent ?? undefined
        }])
      }
    } catch (error) {
      logger.debug('AgentDispatch', 'Failed to send message:', error)
      if (!mountedRef.current) return

      // Reset session on error so next message creates a new one
      sessionRef.current = null

      setMessages(prev => [...prev, {
        id: `msg-${Date.now()}-err`,
        role: 'system',
        content: `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      }])
    } finally {
      if (mountedRef.current) {
        setIsSending(false)
      }
    }
  }, [inputValue, isSending, selectedAgent, agentObjects])

  const getStatusColor = (status: TaskInfo['status']) => {
    switch (status) {
      case 'completed': return 'text-green-400 bg-green-500/20'
      case 'in_progress': return 'text-blue-400 bg-blue-500/20'
      case 'error': return 'text-red-400 bg-red-500/20'
      default: return 'text-slate-400 bg-slate-500/20'
    }
  }

  const getAgentColor = (agentName?: string) => {
    if (!agentName) return 'text-slate-400 bg-slate-500/20'
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
    <div className="flex flex-col h-full bg-[#0f0f10] border-l border-[#1f1f21]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1f1f21]">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Agent Dispatch</h3>
        {activeHandoff && (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-orange-500/20 rounded text-orange-400 text-[10px] animate-pulse" role="status" aria-live="polite">
            <span>Handoff pending</span>
          </div>
        )}
      </div>

      {/* View Tabs */}
      <div className="flex border-b border-[#1f1f21]" role="tablist" aria-label="Agent dispatch views">
        {[
          { id: 'swarm', label: 'Swarm', icon: '🐝' },
          { id: 'tasks', label: 'Tasks', icon: '📋' },
          { id: 'chat', label: 'Chat', icon: '💬' }
        ].map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeView === tab.id}
            onClick={() => setActiveView(tab.id as typeof activeView)}
            className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
              activeView === tab.id
                ? 'text-white bg-slate-800/50 border-b-2 border-blue-500'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
            }`}
          >
            <span className="mr-1">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeView === 'swarm' && (
          <div className="h-full">
            <EmergenceDashboard swarmId={swarmId} />
          </div>
        )}

        {activeView === 'tasks' && (
          <div className="h-full overflow-y-auto p-2 space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTaskClick?.(task.id) }}}
                onClick={() => onTaskClick?.(task.id)}
                className="bg-slate-800/30 rounded-lg p-3 cursor-pointer hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-white">{task.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${getStatusColor(task.status)}`}>
                    {task.status.replace('_', ' ')}
                  </span>
                </div>

                {task.assignedAgent && (
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${getAgentColor(task.assignedAgent)}`}>
                      {task.assignedAgent.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-[11px] text-slate-400">{task.assignedAgent}</span>
                  </div>
                )}

                {/* Progress bar */}
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden" role="progressbar" aria-valuenow={task.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Task progress: ${task.progress}%`}>
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
                <div className="text-right mt-1">
                  <span className="text-[10px] text-slate-500">{task.progress}%</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeView === 'chat' && (
          <div className="flex flex-col h-full">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <svg className="w-10 h-10 text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p className="text-xs text-slate-500">Start a conversation</p>
                  <p className="text-xs text-slate-600 mt-1">Select an agent to begin</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 ${
                        msg.role === 'user'
                          ? 'bg-blue-500/20 text-blue-100'
                          : 'bg-slate-700/50 text-slate-200'
                      }`}
                    >
                      {msg.agentName && (
                        <div className={`text-[10px] mb-1 ${getAgentColor(msg.agentName)}`}>
                          {msg.agentName}
                        </div>
                      )}
                      <p className="text-xs">{msg.content}</p>
                      <div className="text-[10px] text-slate-500 mt-1">
                        {msg.timestamp.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input */}
            <div className="p-2 border-t border-[#1f1f21]">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Send message to agent..."
                  className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 outline-none"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isSending}
                  className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSending ? '...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Agent Quick Select */}
      <div className="px-2 py-2 border-t border-[#1f1f21]">
        <div className="text-[10px] text-slate-500 mb-1 px-1">Active Agents</div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {availableAgents.length === 0 ? (
            <span className="text-[10px] text-slate-600 px-2">No agents available</span>
          ) : (
            availableAgents.map((agent) => (
              <button
                key={agent}
                onClick={() => {
                  if (selectedAgent !== agent && sessionRef.current) {
                    api.agent.closeSession(sessionRef.current).catch(() => {})
                    sessionRef.current = null
                  }
                  setSelectedAgent(agent)
                }}
                className={`flex-shrink-0 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                  selectedAgent === agent
                    ? getAgentColor(agent)
                    : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50'
                }`}
              >
                {agent.split('-')[0]}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default AgentDispatchPanel
