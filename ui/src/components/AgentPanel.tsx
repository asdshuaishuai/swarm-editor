import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import { Send, Loader2, Bot, User } from 'lucide-react'

export default function AgentPanel() {
  const { agents, selectedAgent, selectAgent } = useAppStore()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Array<{
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
  }>>([])
  const [isLoading, setIsLoading] = useState(false)

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
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {messages.length === 0 ? (
          <div className="text-center text-text-secondary text-sm mt-8">
            Start a conversation with an agent
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
            placeholder="Type a message..."
            className="flex-1 bg-editor-bg border border-panel-border rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-accent"
            rows={2}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="p-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}