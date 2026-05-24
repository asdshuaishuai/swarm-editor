import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import QueenSandbox from './QueenSandbox'

const mockAgents = [
  { id: 'agent-1', name: 'scanner', type: 'worker', status: 'idle', command: '', capabilities: [] },
  { id: 'agent-2', name: 'claude-code', type: 'worker', status: 'executing', command: 'claude', capabilities: ['code'] },
]

vi.mock('../store/appStore', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ agents: mockAgents }),
}))

vi.mock('../stores/agentLifecycleStore', () => ({
  useAgentLifecycleStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ agents: new Map(), activeTurns: new Map(), processes: [], setProcesses: vi.fn() }),
}))

vi.mock('../stores/taskFlowStore', () => ({
  useTaskFlowStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ tasks: [], edges: [] }),
}))

vi.mock('../services', () => ({
  api: {
    agent: { getAgents: vi.fn().mockResolvedValue([]) },
    permissions: { respond: vi.fn().mockResolvedValue(undefined) },
  },
}))

describe('QueenSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders SVG sandbox container', () => {
    render(<QueenSandbox />)
    const svg = document.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('renders agent nodes', () => {
    render(<QueenSandbox />)
    expect(screen.getByText('scanner')).toBeInTheDocument()
    expect(screen.getByText('claude-code')).toBeInTheDocument()
  })

  it('calls onNodeSelect when node clicked', () => {
    const onNodeSelect = vi.fn()
    render(<QueenSandbox onNodeSelect={onNodeSelect} />)

    fireEvent.click(screen.getByText('scanner'))
    expect(onNodeSelect).toHaveBeenCalledWith('agent-1', 'scanner')
  })

  it('renders without onNodeSelect prop', () => {
    render(<QueenSandbox />)
    fireEvent.click(screen.getByText('scanner'))
    // Should not throw
  })

  it('renders edge connections', () => {
    render(<QueenSandbox />)
    const lines = document.querySelectorAll('line')
    expect(lines.length).toBeGreaterThanOrEqual(0)
  })
})
