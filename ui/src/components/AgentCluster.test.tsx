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

  // ── Basic rendering ──

  it('renders all agent names', () => {
    render(<AgentCluster agents={sampleAgents} onSetPrimary={onSetPrimary} />)
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    expect(screen.getByText('Gemini CLI')).toBeInTheDocument()
    expect(screen.getByText('OpenCode')).toBeInTheDocument()
  })

  it('renders with empty agents list', () => {
    render(<AgentCluster agents={[]} onSetPrimary={onSetPrimary} />)
    expect(screen.getByText(/双击设为主导/)).toBeInTheDocument()
  })

  it('renders hint text at the end', () => {
    render(<AgentCluster agents={sampleAgents} onSetPrimary={onSetPrimary} />)
    expect(screen.getByText('双击设为主导')).toBeInTheDocument()
  })

  // ── Primary agent ──

  it('shows primary crown for the primary agent', () => {
    render(
      <AgentCluster
        agents={sampleAgents}
        primaryAgentId="claude-code"
        onSetPrimary={onSetPrimary}
      />,
    )
    expect(screen.getByText('👑')).toBeInTheDocument()
  })

  it('does not show crown when no primaryAgentId', () => {
    render(<AgentCluster agents={sampleAgents} onSetPrimary={onSetPrimary} />)
    expect(screen.queryByText('👑')).toBeNull()
  })

  it('applies primary styling to primary agent button', () => {
    render(
      <AgentCluster
        agents={sampleAgents}
        primaryAgentId="claude-code"
        onSetPrimary={onSetPrimary}
      />,
    )
    const btn = screen.getByText('Claude Code').closest('button')
    expect(btn?.className).toContain('bg-primary')
    expect(btn?.className).toContain('text-white')
  })

  it('applies non-primary styling to non-primary agents', () => {
    render(
      <AgentCluster
        agents={sampleAgents}
        primaryAgentId="claude-code"
        onSetPrimary={onSetPrimary}
      />,
    )
    const btn = screen.getByText('Gemini CLI').closest('button')
    expect(btn?.className).not.toContain('bg-primary')
    // Non-primary buttons have var(--text-secondary) style
    expect(btn?.getAttribute('style')).toContain('var(--text-secondary)')
  })

  it('primary agent button title includes (主导)', () => {
    render(
      <AgentCluster
        agents={sampleAgents}
        primaryAgentId="gemini-cli"
        onSetPrimary={onSetPrimary}
      />,
    )
    expect(screen.getByTitle(/Gemini CLI.*主导/)).toBeInTheDocument()
  })

  it('non-primary agent button title does not include (主导) marker', () => {
    render(
      <AgentCluster
        agents={sampleAgents}
        primaryAgentId="claude-code"
        onSetPrimary={onSetPrimary}
      />,
    )
    const geminiBtn = screen.getByTitle(/Gemini CLI/)
    // Title format: "AgentName - 双击设为主导" (no " (主导)" marker)
    expect(geminiBtn.getAttribute('title')).not.toContain(' (主导)')
  })

  // ── Status colors ──

  it('renders active status indicator with correct class', () => {
    render(<AgentCluster agents={sampleAgents} onSetPrimary={onSetPrimary} />)
    const claudeBtn = screen.getByText('Claude Code').closest('button')
    const indicator = claudeBtn?.querySelector('.bg-success')
    expect(indicator).toBeInTheDocument()
  })

  it('renders idle status indicator with correct class', () => {
    render(<AgentCluster agents={sampleAgents} onSetPrimary={onSetPrimary} />)
    const geminiBtn = screen.getByText('Gemini CLI').closest('button')
    const indicator = geminiBtn?.querySelector('.bg-text-muted')
    expect(indicator).toBeInTheDocument()
  })

  it('renders offline status indicator with correct class', () => {
    render(<AgentCluster agents={sampleAgents} onSetPrimary={onSetPrimary} />)
    const opencodeBtn = screen.getByText('OpenCode').closest('button')
    const indicator = opencodeBtn?.querySelector('.bg-text-disabled')
    expect(indicator).toBeInTheDocument()
  })

  it('renders busy status with animate-pulse', () => {
    const busyAgent: Agent = { id: 'busy-1', name: 'Busy Agent', icon: '◈', status: 'busy', role: 'worker' }
    render(<AgentCluster agents={[busyAgent]} onSetPrimary={onSetPrimary} />)
    const btn = screen.getByText('Busy Agent').closest('button')
    const indicator = btn?.querySelector('.animate-pulse')
    expect(indicator).toBeInTheDocument()
  })

  it('renders error status with bg-error', () => {
    const errorAgent: Agent = { id: 'err-1', name: 'Error Agent', icon: '◈', status: 'error', role: 'worker' }
    render(<AgentCluster agents={[errorAgent]} onSetPrimary={onSetPrimary} />)
    const btn = screen.getByText('Error Agent').closest('button')
    const indicator = btn?.querySelector('.bg-error')
    expect(indicator).toBeInTheDocument()
  })

  // ── Agent icons (AGENT_ICONS mapping) ──

  it('uses AGENT_ICONS for known agent ids', () => {
    const knownAgent: Agent = { id: 'codex', name: 'Codex', icon: '◆', status: 'active', role: 'worker' }
    render(<AgentCluster agents={[knownAgent]} onSetPrimary={onSetPrimary} />)
    // The component uses AGENT_ICONS[id] || default
    expect(screen.getByText('◆')).toBeInTheDocument()
  })

  it('uses default icon for unknown agent id', () => {
    const unknownAgent: Agent = { id: 'custom-unknown', name: 'Custom', icon: 'X', status: 'active', role: 'worker' }
    render(<AgentCluster agents={[unknownAgent]} onSetPrimary={onSetPrimary} />)
    // AGENT_ICONS.default is '□'
    expect(screen.getByText('□')).toBeInTheDocument()
  })

  // ── Latency ──

  it('shows latency for agents that have it', () => {
    render(<AgentCluster agents={sampleAgents} onSetPrimary={onSetPrimary} />)
    expect(screen.getByText('120ms')).toBeInTheDocument()
  })

  it('does not show latency for agents without it', () => {
    render(<AgentCluster agents={sampleAgents} onSetPrimary={onSetPrimary} />)
    // Gemini CLI has no latency
    const geminiBtn = screen.getByText('Gemini CLI').closest('button')
    const latencySpan = geminiBtn?.querySelector('.opacity-50')
    // No latency span inside the Gemini button
    expect(latencySpan).toBeNull()
  })

  // ── Click interactions ──

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

  it('does not call onAgentClick when it is not provided', () => {
    render(<AgentCluster agents={sampleAgents} onSetPrimary={onSetPrimary} />)
    // Should not throw when clicking without onAgentClick
    expect(() => fireEvent.click(screen.getByText('Gemini CLI'))).not.toThrow()
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

  // ── Hover tooltip ──

  it('shows hover tooltip with agent details', () => {
    render(
      <AgentCluster
        agents={sampleAgents}
        onSetPrimary={onSetPrimary}
      />,
    )
    fireEvent.mouseEnter(screen.getByText('Claude Code').closest('button')!)
    expect(screen.getByText(/状态: active/)).toBeInTheDocument()
    expect(screen.getByText(/任务: Refactoring code/)).toBeInTheDocument()
  })

  it('shows latency in tooltip when present', () => {
    render(<AgentCluster agents={sampleAgents} onSetPrimary={onSetPrimary} />)
    fireEvent.mouseEnter(screen.getByText('Claude Code').closest('button')!)
    expect(screen.getByText(/延迟: 120ms/)).toBeInTheDocument()
  })

  it('does not show latency in tooltip when absent', () => {
    render(<AgentCluster agents={sampleAgents} onSetPrimary={onSetPrimary} />)
    fireEvent.mouseEnter(screen.getByText('Gemini CLI').closest('button')!)
    expect(screen.queryByText(/延迟:/)).toBeNull()
  })

  it('does not show task in tooltip when absent', () => {
    render(<AgentCluster agents={sampleAgents} onSetPrimary={onSetPrimary} />)
    fireEvent.mouseEnter(screen.getByText('Gemini CLI').closest('button')!)
    expect(screen.queryByText(/任务:/)).toBeNull()
  })

  it('shows set-primary button in tooltip for non-primary agent', () => {
    render(
      <AgentCluster
        agents={sampleAgents}
        primaryAgentId="claude-code"
        onSetPrimary={onSetPrimary}
      />,
    )
    fireEvent.mouseEnter(screen.getByText('Gemini CLI').closest('button')!)
    expect(screen.getByText('设为主导')).toBeInTheDocument()
  })

  it('does not show set-primary button in tooltip for primary agent', () => {
    render(
      <AgentCluster
        agents={sampleAgents}
        primaryAgentId="claude-code"
        onSetPrimary={onSetPrimary}
      />,
    )
    fireEvent.mouseEnter(screen.getByText('Claude Code').closest('button')!)
    expect(screen.queryByText('设为主导')).toBeNull()
  })

  it('calls onSetPrimary from tooltip set-primary button', () => {
    render(
      <AgentCluster
        agents={sampleAgents}
        primaryAgentId="claude-code"
        onSetPrimary={onSetPrimary}
      />,
    )
    fireEvent.mouseEnter(screen.getByText('Gemini CLI').closest('button')!)
    fireEvent.click(screen.getByText('设为主导'))
    expect(onSetPrimary).toHaveBeenCalledWith('gemini-cli')
  })

  it('hides tooltip on mouse leave', () => {
    render(<AgentCluster agents={sampleAgents} onSetPrimary={onSetPrimary} />)
    const wrapper = screen.getByText('Claude Code').closest('button')!.closest('.group')!
    fireEvent.mouseEnter(screen.getByText('Claude Code').closest('button')!)
    expect(screen.getByText(/状态: active/)).toBeInTheDocument()
    fireEvent.mouseLeave(wrapper)
    expect(screen.queryByText(/状态: active/)).toBeNull()
  })

  // ── Offline opacity ──

  it('applies offline opacity class to offline agents', () => {
    render(<AgentCluster agents={sampleAgents} onSetPrimary={onSetPrimary} />)
    const offlineButton = screen.getByText('OpenCode').closest('button')
    expect(offlineButton?.className).toContain('opacity-50')
  })

  it('does not apply opacity-50 to active agents', () => {
    render(<AgentCluster agents={sampleAgents} onSetPrimary={onSetPrimary} />)
    const activeButton = screen.getByText('Claude Code').closest('button')
    expect(activeButton?.className).not.toContain('opacity-50')
  })

  // ── Container structure ──

  it('renders container with correct styling', () => {
    const { container } = render(<AgentCluster agents={sampleAgents} onSetPrimary={onSetPrimary} />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('flex')
    expect(wrapper.className).toContain('overflow-x-auto')
    expect(wrapper.getAttribute('style')).toContain('var(--bg-surface)')
  })
})
