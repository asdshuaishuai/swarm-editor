import { useState, useRef, useEffect } from 'react'
import { MarkdownContent } from './MarkdownContent'

export interface ChatMessage {
  id: string
  role: 'user' | 'agent' | 'system'
  agentId?: string
  agentName?: string
  content: string
  timestamp: Date
  isPrimary?: boolean
  taskId?: string
}

interface AgentChatProps {
  messages: ChatMessage[]
  primaryAgentId?: string
  onSendMessage: (message: string) => void
  onSwitchAgent?: (agentId: string) => void
  isLoading?: boolean
}

export function AgentChat({ messages, primaryAgentId, onSendMessage, onSwitchAgent, isLoading }: AgentChatProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    // 检查是否是切换命令
    if (trimmed.startsWith('/switch ')) {
      const agentId = trimmed.slice(8).trim()
      onSwitchAgent?.(agentId)
      setInput('')
      return
    }

    onSendMessage(trimmed)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-surface)' }}>
      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
            <div className="text-4xl mb-4">🐝</div>
            <div className="text-lg font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              多 Agent 协同
            </div>
            <div className="text-sm text-center max-w-md">
              输入任务描述，主导 Agent 会自动分解任务并协调其他 Agent 执行。
              <br />
              使用 <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-hover)' }}>/switch agent-id</code> 切换主导 Agent。
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {/* Agent 头像 */}
              {msg.role === 'agent' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm" style={{ background: msg.isPrimary ? 'var(--primary)' : 'var(--bg-hover)' }}>
                  {msg.isPrimary ? '👑' : '🤖'}
                </div>
              )}

              {/* 消息内容 */}
              <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-first' : ''}`}>
                {/* Agent 名称 */}
                {msg.role === 'agent' && (
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      {msg.agentName || msg.agentId}
                    </span>
                    {msg.isPrimary && (
                      <span className="agent-badge primary">主导</span>
                    )}
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {msg.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                )}

                {/* 消息气泡 */}
                <div
                  className={`
                    px-3 py-2 rounded-lg text-sm
                    ${msg.role === 'user'
                      ? 'bg-primary text-white'
                      : msg.isPrimary
                        ? 'border border-primary/30'
                        : ''
                    }
                  `}
                  style={msg.role !== 'user' && !msg.isPrimary ? { background: 'var(--bg-elevated)' } : undefined}
                >
                  {msg.role === 'agent' ? (
                    <MarkdownContent content={msg.content} />
                  ) : (
                    msg.content
                  )}
                </div>

                {/* 用户消息时间 */}
                {msg.role === 'user' && (
                  <div className="text-xs mt-1 text-right" style={{ color: 'var(--text-muted)' }}>
                    {msg.timestamp.toLocaleTimeString()}
                  </div>
                )}
              </div>

              {/* 用户头像 */}
              {msg.role === 'user' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm bg-info">
                  👤
                </div>
              )}
            </div>
          ))
        )}

        {/* 加载指示器 */}
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--bg-hover)' }}>
              🤖
            </div>
            <div className="px-3 py-2 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--text-muted)', animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--text-muted)', animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--text-muted)', animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="p-3" style={{ borderTop: '1px solid var(--border-default)' }}>
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入任务描述... (Enter 发送, Shift+Enter 换行)"
            className="input flex-1 min-h-[40px] max-h-[120px] resize-none"
            rows={1}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading}
            className="btn-primary px-4 disabled:opacity-50"
          >
            发送
          </button>
        </div>
        <div className="mt-2 flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>当前主导: {primaryAgentId || '未指定'}</span>
          <span>/switch [agent-id] 切换主导</span>
        </div>
      </div>
    </div>
  )
}
