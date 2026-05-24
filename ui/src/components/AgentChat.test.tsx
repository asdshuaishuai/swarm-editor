import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentChat, type ChatMessage } from './AgentChat'

// jsdom does not implement scrollIntoView
HTMLElement.prototype.scrollIntoView = vi.fn()

vi.mock('./MarkdownContent', () => ({
  MarkdownContent: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}))

const baseMessages: ChatMessage[] = [
  {
    id: 'msg-1',
    role: 'user',
    content: 'Hello agent',
    timestamp: new Date('2026-01-01T10:00:00'),
  },
  {
    id: 'msg-2',
    role: 'agent',
    agentId: 'claude-code',
    agentName: 'Claude Code',
    content: 'Hello user!',
    timestamp: new Date('2026-01-01T10:00:01'),
    isPrimary: true,
  },
  {
    id: 'msg-3',
    role: 'system',
    content: 'System notice',
    timestamp: new Date('2026-01-01T10:00:02'),
  },
]

describe('AgentChat', () => {
  const onSendMessage = vi.fn()
  const onSwitchAgent = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it('renders empty state when no messages', () => {
    render(<AgentChat messages={[]} onSendMessage={onSendMessage} />)
    expect(screen.getByText(/多 Agent 协同/)).toBeInTheDocument()
    expect(screen.getByText(/\/switch agent-id/)).toBeInTheDocument()
  })

  it('renders all messages', () => {
    render(<AgentChat messages={baseMessages} onSendMessage={onSendMessage} />)
    expect(screen.getByText('Hello agent')).toBeInTheDocument()
    expect(screen.getByText('Hello user!')).toBeInTheDocument()
    expect(screen.getByText('System notice')).toBeInTheDocument()
  })

  it('shows agent name and primary badge for primary agents', () => {
    render(<AgentChat messages={baseMessages} onSendMessage={onSendMessage} />)
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    expect(screen.getByText('主导')).toBeInTheDocument()
  })

  it('calls onSendMessage when submitting text', () => {
    render(<AgentChat messages={[]} onSendMessage={onSendMessage} />)
    const textarea = screen.getByPlaceholderText(/输入任务描述/)
    fireEvent.change(textarea, { target: { value: 'Fix the bug' } })
    fireEvent.click(screen.getByText('发送'))
    expect(onSendMessage).toHaveBeenCalledWith('Fix the bug')
  })

  it('calls onSendMessage on Enter key', () => {
    render(<AgentChat messages={[]} onSendMessage={onSendMessage} />)
    const textarea = screen.getByPlaceholderText(/输入任务描述/)
    fireEvent.change(textarea, { target: { value: 'Test task' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onSendMessage).toHaveBeenCalledWith('Test task')
  })

  it('does not submit on Shift+Enter', () => {
    render(<AgentChat messages={[]} onSendMessage={onSendMessage} />)
    const textarea = screen.getByPlaceholderText(/输入任务描述/)
    fireEvent.change(textarea, { target: { value: 'Multiline' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(onSendMessage).not.toHaveBeenCalled()
  })

  it('handles /switch command to change agent', () => {
    render(
      <AgentChat
        messages={[]}
        onSendMessage={onSendMessage}
        onSwitchAgent={onSwitchAgent}
      />,
    )
    const textarea = screen.getByPlaceholderText(/输入任务描述/)
    fireEvent.change(textarea, { target: { value: '/switch gemini-cli' } })
    fireEvent.click(screen.getByText('发送'))
    expect(onSwitchAgent).toHaveBeenCalledWith('gemini-cli')
    expect(onSendMessage).not.toHaveBeenCalled()
  })

  it('shows loading indicator when isLoading is true', () => {
    render(<AgentChat messages={[]} onSendMessage={onSendMessage} isLoading={true} />)
    // The loading indicator has bounce animation spans
    const bouncingDots = document.querySelectorAll('.animate-bounce')
    expect(bouncingDots.length).toBe(3)
  })

  it('disables send button when input is empty or loading', () => {
    render(<AgentChat messages={[]} onSendMessage={onSendMessage} isLoading={true} />)
    const button = screen.getByText('发送')
    expect(button).toBeDisabled()
  })

  it('displays primaryAgentId in footer', () => {
    render(
      <AgentChat
        messages={[]}
        onSendMessage={onSendMessage}
        primaryAgentId="claude-code"
      />,
    )
    expect(screen.getByText(/当前主导: claude-code/)).toBeInTheDocument()
  })
})
