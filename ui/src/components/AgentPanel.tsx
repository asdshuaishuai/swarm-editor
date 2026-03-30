import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import { Send, Loader2, Bot, User, Play, Square, RefreshCw } from 'lucide-react'
import { logger } from '../utils'
import { api, events } from '../services'

interface ChatSession {
  agentId: string
  sessionId: string
}

export default function AgentPanel() {
  const agents = useAppStore(state => state.agents)
  const selectedAgent = useAppStore(state => state.selectedAgent)
  const selectAgent = useAppStore(state => state.selectAgent)
  const startAgent = useAppStore(state => state.startAgent)
  const stopAgent = useAppStore(state => state.stopAgent)
  const loadAgents = useAppStore(state => state.loadAgents)
  const addToast = useAppStore(state => state.addToast)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Array<{
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
  }>>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isToggling, setIsToggling] = useState<string | null>(null)
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null)
  const sessionRef = useRef<ChatSession | null>(null)

  // 监听后端事件 (WebSocket)
  useEffect(() => {
    const unlisten = events.onAgentMessage((payload) => {
      const { sessionId, content } = payload as { sessionId: string; content: string }
      if (sessionRef.current?.sessionId === sessionId) {
        // 添加 Agent 响应消息
        const agentMessage = {
          id: Date.now().toString(),
          role: 'assistant' as const,
          content: content || 'Task completed.',
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, agentMessage])
        setIsLoading(false)
      }
    })

    return () => {
      unlisten()
    }
  }, [])

  // 切换 Agent 时关闭旧会话
  useEffect(() => {
    if (currentSession && selectedAgent?.id !== currentSession.agentId) {
      api.agent.closeSession(currentSession.sessionId).catch(e => {
        logger.warn('AgentPanel', 'Failed to close session:', e)
      })
      setCurrentSession(null)
      sessionRef.current = null
      setMessages([])
    }
  }, [selectedAgent?.id, currentSession])

  // 确保会话存在
  const ensureSession = async (): Promise<ChatSession | null> => {
    if (!selectedAgent) return null

    // 如果已有会话且 Agent 匹配，复用
    if (currentSession && currentSession.agentId === selectedAgent.id) {
      return currentSession
    }

    // 创建新会话
    try {
      const result = await api.agent.createSession(selectedAgent.id)
      const session: ChatSession = {
        agentId: selectedAgent.id,
        sessionId: result.sessionId || result.id,
      }
      setCurrentSession(session)
      sessionRef.current = session
      return session
    } catch (e) {
      logger.error('AgentPanel', 'Failed to create session:', e)
      addToast('error', 'Session Error', `Failed to create session: ${e instanceof Error ? e.message : String(e)}`)
      return null
    }
  }

  const handleSend = async () => {
    if (!input.trim() || isLoading || !selectedAgent) return

    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: input,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const session = await ensureSession()
      if (!session) {
        setIsLoading(false)
        return
      }

      // 发送消息到后端
      // 后端会通过 'agent-message' 事件返回响应，由事件监听器处理
      await api.agent.sendMessage(session.sessionId, userMessage.content)

      // 注意：不在这里设置 setIsLoading(false)
      // 等待 'agent-message' 事件到达后，在监听器中处理
    } catch (e) {
      logger.error('AgentPanel', 'Failed to send message:', e)
      addToast('error', 'Send Error', `Failed to send message: ${e instanceof Error ? e.message : String(e)}`)
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await loadAgents()
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleToggleAgent = async (agentId: string, currentState: string) => {
    setIsToggling(agentId)
    try {
      if (currentState === 'running' || currentState === 'executing') {
        await stopAgent(agentId)
      } else {
        await startAgent(agentId)
      }
    } catch (error) {
      logger.error('Agents', 'Failed to toggle agent:', error)
    } finally {
      setIsToggling(null)
    }
  }

  const getStateColor = (state: string) => {
    switch (state) {
      case 'executing':
      case 'running':
        return 'text-success'
      case 'thinking':
        return 'text-warning'
      case 'error':
        return 'text-error'
      case 'idle':
      case 'stopped':
      default:
        return 'text-text-tertiary'
    }
  }

  const getStateLabel = (state: string) => {
    switch (state) {
      case 'executing':
      case 'running':
        return 'Running'
      case 'thinking':
        return 'Thinking'
      case 'error':
        return 'Error'
      case 'idle':
      case 'stopped':
      default:
        return 'Idle'
    }
  }

  const getStateDotColor = (state: string) => {
    switch (state) {
      case 'executing':
      case 'running':
        return 'bg-success'
      case 'thinking':
        return 'bg-warning'
      case 'error':
        return 'bg-error'
      default:
        return 'bg-text-tertiary'
    }
  }

  return (
    <div className="flex flex-col w-80 bg-mac-panel/95 border-l border-glass-border backdrop-blur-xl">
      {/* Agent Selector */}
      <div className="p-3 border-b border-glass-border">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-accent" />
          <select
            className="flex-1 input-mac py-1.5"
            value={selectedAgent?.id || ''}
            onChange={(e) => {
              const agent = agents.find((a) => a.id === e.target.value)
              selectAgent(agent || null)
            }}
          >
            <option value="">Select Agent</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} ({agent.type})
              </option>
            ))}
          </select>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1.5 hover:bg-card-hover rounded-mac transition-colors disabled:opacity-50"
            title="Refresh agents"
            aria-label="Refresh agents"
          >
            <RefreshCw size={14} className={`text-text-secondary ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Agent List with Controls */}
      <div className="border-b border-glass-border max-h-52 overflow-y-auto">
        {agents.length === 0 ? (
          <div className="p-4 text-center text-text-tertiary text-sm">
            No agents available
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className={`flex items-center justify-between p-2.5 rounded-mac cursor-pointer transition-all duration-200 ${
                  selectedAgent?.id === agent.id
                    ? 'bg-accent-muted border border-accent/30'
                    : 'hover:bg-card-hover'
                }`}
                onClick={() => selectAgent(agent)}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Bot size={14} className={getStateColor(agent.state)} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate text-text-primary">{agent.name}</div>
                    <div className="text-xs text-text-secondary flex items-center gap-1.5 mt-0.5">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${getStateDotColor(agent.state)}`}></span>
                      <span>{getStateLabel(agent.state)}</span>
                      <span className="text-glass-border">•</span>
                      <span className="capitalize">{agent.type}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleToggleAgent(agent.id, agent.state)
                  }}
                  disabled={isToggling === agent.id}
                  className={`p-1.5 rounded-mac transition-colors disabled:opacity-50 ${
                    agent.state === 'executing'
                      ? 'text-error hover:bg-error/10'
                      : 'text-success hover:bg-success/10'
                  }`}
                  title={agent.state === 'executing' ? 'Stop agent' : 'Start agent'}
                >
                  {isToggling === agent.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : agent.state === 'executing' ? (
                    <Square size={14} />
                  ) : (
                    <Play size={14} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected Agent Info */}
      {selectedAgent && (
        <div className="p-3 border-b border-glass-border bg-glass/30">
          <div className="text-xs text-text-secondary">
            <div className="font-medium text-text-primary mb-1">{selectedAgent.name}</div>
            <div className="flex flex-wrap gap-1">
              {selectedAgent.capabilities?.pairProgramming && (
                <span className="px-1.5 py-0.5 bg-accent/10 text-accent rounded text-xs">Pair Programming</span>
              )}
              {selectedAgent.capabilities?.teamCollaboration && (
                <span className="px-1.5 py-0.5 bg-success/10 text-success rounded text-xs">Team Collaboration</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-text-tertiary text-sm mt-8">
            {selectedAgent
              ? `Chat with ${selectedAgent.name}`
              : 'Select an agent to start chatting'}
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-mac px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-accent text-white'
                    : 'bg-glass border border-glass-border text-text-primary'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 opacity-75">
                  {msg.role === 'user' ? (
                    <User size={11} />
                  ) : (
                    <Bot size={11} className="text-accent" />
                  )}
                  <span className="text-xs">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-glass border border-glass-border rounded-mac px-3 py-2">
              <Loader2 size={14} className="animate-spin text-accent" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-glass-border">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selectedAgent ? "Type a message..." : "Select an agent first..."}
            className="flex-1 input-mac resize-none focus:outline-none focus:border-accent disabled:opacity-50"
            rows={2}
            disabled={!selectedAgent}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || !selectedAgent}
            className="p-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-mac transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
