import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentCluster, type Agent } from './AgentCluster'

const sampleAgents: Agent[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    icon: '◈',
    status: 'active',
    role: 'primary',
    latency: 120,
    task: 'Refactoring code',
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    icon: '◇',
    status: 'idle',
    role: 'worker',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    icon: '○',
    status: 'offline',
    role: 'worker',
  },
]

describe('AgentCluster', () => {
  const onSetPrimary = vi.fn()
  const onAgentClick = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it('renders all agent names', () => {
    render(<AgentCluster agents={sampleAgents} onSetPrimary={onSetPrimary} />)
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    expect(screen.getByText('Gemini CLI')).toBeInTheDocument()
    expect(screen.getByText('OpenCode')).toBeInTheDocument()
  })

  it('shows primary crown for the primary agent', () => {
    render(
      <AgentCluster
        agents={sampleAgents}
        primaryAgentId="claude-code"
        onSetPrimary={onSetPrimary}
      />,
    )
    // Crown emoji appears next to primary agent name
    expect(screen.getByText('👑')).toBeInTheDocument()
  })

  it('shows latency for agents that have it', () => {
    render(<AgentCluster agents={sampleAgents} onSetPrimary={onSetPrimary} />)
    expect(screen.getByText('120ms')).toBeInTheDocument()
  })

  it('calls onAgentClick when agent button clicked', () => {
    render(
      <AgentCluster
        agents={sampleAgents}
        onSetPrimary={onSetPrimary}
        onAgentClick={onAgentClick}
      />,
    )
    fireEvent.click(screen.getByText('Gemini CLI'))
    expect(onAgentClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'gemini-cli' }),
    )
  })

  it('calls onSetPrimary on double click', () => {
    render(
      <AgentCluster
        agents={sampleAgents}
        onSetPrimary={onSetPrimary}
        onAgentClick={onAgentClick}
      />,
    )
    fireEvent.doubleClick(screen.getByText('Gemini CLI'))
    expect(onSetPrimary).toHaveBeenCalledWith('gemini-cli')
  })

  it('shows hover tooltip with agent details', () => {
    render(
      <AgentCluster
        agents={sampleAgents}
        onSetPrimary={onSetPrimary}
      />,
    )
    fireEvent.mouseEnter(screen.getByText('Claude Code').closest('button')!)
    // Tooltip shows status and task
    expect(screen.getByText(/状态: active/)).toBeInTheDocument()
    expect(screen.getByText(/任务: Refactoring code/)).toBeInTheDocument()
  })

  it('renders with empty agents list', () => {
    render(<AgentCluster agents={[]} onSetPrimary={onSetPrimary} />)
    expect(screen.getByText(/双击设为主导/)).toBeInTheDocument()
  })

  it('applies offline opacity class to offline agents', () => {
    render(<AgentCluster agents={sampleAgents} onSetPrimary={onSetPrimary} />)
    const offlineButton = screen.getByText('OpenCode').closest('button')
    expect(offlineButton?.className).toContain('opacity-50')
  })
})
