import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import { Send, Loader2, Bot, User, Play, Square, RefreshCw } from 'lucide-react'
import { logger } from '../utils'

export default function AgentPanel() {
  const { agents, selectedAgent, selectAgent, startAgent, stopAgent, loadAgents } = useAppStore()
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

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: input,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    // Simulate agent response
    setTimeout(() => {
      const agentMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant' as const,
        content: 'I understand your request. Let me help you with that.',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, agentMessage])
      setIsLoading(false)
    }, 1000)
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
        return 'text-green-500'
      case 'thinking':
        return 'text-yellow-500'
      case 'error':
        return 'text-red-500'
      case 'idle':
      case 'stopped':
      default:
        return 'text-gray-400'
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

  return (
    <div className="flex flex-col w-80 bg-panel-bg border-l border-panel-border">
      {/* Agent Selector */}
      <div className="p-2 border-b border-panel-border">
        <div className="flex items-center space-x-2">
          <Bot size={16} className="text-accent" />
          <select
            className="flex-1 bg-editor-bg border border-panel-border rounded px-2 py-1 text-sm"
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
            className="p-1 hover:bg-editor-bg rounded disabled:opacity-50"
            title="Refresh agents"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Agent List with Controls */}
      <div className="border-b border-panel-border max-h-48 overflow-y-auto">
        {agents.length === 0 ? (
          <div className="p-3 text-center text-text-secondary text-sm">
            No agents available
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className={`flex items-center justify-between p-2 rounded cursor-pointer hover:bg-editor-bg ${
                  selectedAgent?.id === agent.id ? 'bg-editor-bg border border-accent/30' : ''
                }`}
                onClick={() => selectAgent(agent)}
              >
                <div className="flex items-center space-x-2 flex-1 min-w-0">
                  <Bot size={14} className={getStateColor(agent.state)} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{agent.name}</div>
                    <div className="text-xs text-text-secondary flex items-center space-x-1">
                      <span className={`inline-block w-2 h-2 rounded-full ${
                        agent.state === 'executing' ? 'bg-green-500' :
                        agent.state === 'thinking' ? 'bg-yellow-500' :
                        agent.state === 'error' ? 'bg-red-500' :
                        'bg-gray-400'
                      }`}></span>
                      <span>{getStateLabel(agent.state)}</span>
                      <span className="text-panel-border">|</span>
                      <span>{agent.type}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleToggleAgent(agent.id, agent.state)
                  }}
                  disabled={isToggling === agent.id}
                  className={`p-1 rounded hover:bg-accent/20 disabled:opacity-50 ${
                    agent.state === 'executing' ? 'text-red-500' : 'text-green-500'
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
        <div className="p-2 border-b border-panel-border bg-editor-bg/50">
          <div className="text-xs text-text-secondary">
            <div className="font-medium text-text-primary mb-1">{selectedAgent.name}</div>
            <div>Capabilities: {selectedAgent.capabilities?.pairProgramming ? 'Pair Programming, ' : ''}{selectedAgent.capabilities?.teamCollaboration ? 'Team Collaboration' : ''}</div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {messages.length === 0 ? (
          <div className="text-center text-text-secondary text-sm mt-8">
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
                className={`max-w-[80%] rounded px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-accent text-white'
                    : 'bg-editor-bg border border-panel-border'
                }`}
              >
                <div className="flex items-center space-x-1 mb-1">
                  {msg.role === 'user' ? (
                    <User size={12} />
                  ) : (
                    <Bot size={12} className="text-accent" />
                  )}
                  <span className="text-xs opacity-75">
                    {msg.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-editor-bg border border-panel-border rounded px-3 py-2">
              <Loader2 size={16} className="animate-spin text-accent" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-2 border-t border-panel-border">
        <div className="flex items-end space-x-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selectedAgent ? "Type a message..." : "Select an agent first..."}
            className="flex-1 bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-accent disabled:opacity-50"
            rows={2}
            disabled={!selectedAgent}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || !selectedAgent}
            className="p-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
