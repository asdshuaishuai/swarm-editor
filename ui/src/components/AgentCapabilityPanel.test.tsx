import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AgentCapabilityPanel from './AgentCapabilityPanel'

const defaultLifecycle = {
  agents: new Map([
    ['a1', { agentId: 'a1', name: 'claude-code', state: 'executing', capabilities: ['code', 'review'] }],
    ['a2', { agentId: 'a2', name: 'gemini-cli', state: 'idle', capabilities: ['search'] }],
  ]),
  agentCards: new Map(),
  getAgentAlerts: vi.fn().mockReturnValue([]),
}

const defaultTaskFlow: { toolInvocations: any[]; handoffChain: any[] } = {
  toolInvocations: [],
  handoffChain: [],
}

vi.mock('../stores/agentLifecycleStore', () => ({
  useAgentLifecycleStore: (selector: any) => selector(defaultLifecycle),
}))

vi.mock('../stores/taskFlowStore', () => ({
  useTaskFlowStore: (selector: any) => selector(defaultTaskFlow),
}))

describe('AgentCapabilityPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders filter tabs', () => {
    render(<AgentCapabilityPanel />)
    expect(screen.getByText('全部')).toBeInTheDocument()
    expect(screen.getByText('活跃')).toBeInTheDocument()
    expect(screen.getByText('空闲')).toBeInTheDocument()
    expect(screen.getByText('告警')).toBeInTheDocument()
  })

  it('shows agent count', () => {
    render(<AgentCapabilityPanel />)
    expect(screen.getByText('2/2')).toBeInTheDocument()
  })

  it('displays all agents by default', () => {
    render(<AgentCapabilityPanel />)
    expect(screen.getByText('claude-code')).toBeInTheDocument()
    expect(screen.getByText('gemini-cli')).toBeInTheDocument()
  })

  it('filters to active agents', () => {
    render(<AgentCapabilityPanel />)
    fireEvent.click(screen.getByText('活跃'))
    expect(screen.getByText('claude-code')).toBeInTheDocument()
    expect(screen.queryByText('gemini-cli')).toBeNull()
    expect(screen.getByText('1/2')).toBeInTheDocument()
  })

  it('filters to idle agents', () => {
    render(<AgentCapabilityPanel />)
    fireEvent.click(screen.getByText('空闲'))
    expect(screen.queryByText('claude-code')).toBeNull()
    expect(screen.getByText('gemini-cli')).toBeInTheDocument()
  })

  it('shows empty state when no agents match filter', () => {
    render(<AgentCapabilityPanel />)
    fireEvent.click(screen.getByText('告警'))
    expect(screen.getByText('暂无匹配的 Agent')).toBeInTheDocument()
  })

  it('shows capabilities chips', () => {
    render(<AgentCapabilityPanel />)
    expect(screen.getByText('code')).toBeInTheDocument()
    expect(screen.getByText('review')).toBeInTheDocument()
    expect(screen.getByText('search')).toBeInTheDocument()
  })

  it('shows active tool invocations', () => {
    defaultTaskFlow.toolInvocations = [
      { agentId: 'a1', toolName: 'readFile', result: null, error: null },
    ]
    render(<AgentCapabilityPanel />)
    expect(screen.getByText('readFile')).toBeInTheDocument()
    defaultTaskFlow.toolInvocations = []
  })

  it('shows handoff chain', () => {
    defaultTaskFlow.handoffChain = [
      { fromAgent: 'a1', toAgent: 'a2', task: 'review' },
    ]
    render(<AgentCapabilityPanel />)
    expect(screen.getByText('→ a2')).toBeInTheDocument()
    defaultTaskFlow.handoffChain = []
  })

  it('shows alert icon for alerted agents', () => {
    defaultLifecycle.getAgentAlerts = vi.fn().mockImplementation((id: string) =>
      id === 'a1' ? [{ type: 'stuck' }] : []
    )
    render(<AgentCapabilityPanel />)
    // Alert SVG should be present for a1
    const svg = document.querySelector('svg[fill="#fb7185"]')
    expect(svg).toBeInTheDocument()
  })
})
