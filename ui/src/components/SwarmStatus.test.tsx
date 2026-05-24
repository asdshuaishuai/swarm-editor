import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SwarmStatus } from './SwarmStatus'
import type { SwarmTask, ConsensusVote, EmergentSignal } from './SwarmStatus'

const tasks: SwarmTask[] = [
  { id: '1', name: 'Task A', status: 'completed' },
  { id: '2', name: 'Task B', status: 'running' },
  { id: '3', name: 'Task C', status: 'pending' },
]

describe('SwarmStatus', () => {
  // ── Basic rendering ──

  it('renders status header', () => {
    render(<SwarmStatus tasks={[]} />)
    expect(screen.getByText('蜂群状态')).toBeInTheDocument()
  })

  it('shows expand button', () => {
    render(<SwarmStatus tasks={[]} />)
    expect(screen.getByText('展开')).toBeInTheDocument()
  })

  it('toggles to collapse on click', () => {
    render(<SwarmStatus tasks={[]} />)
    fireEvent.click(screen.getByText('展开'))
    expect(screen.getByText('收起')).toBeInTheDocument()
  })

  it('toggles back to expand on second click', () => {
    render(<SwarmStatus tasks={[]} />)
    fireEvent.click(screen.getByText('展开'))
    expect(screen.getByText('收起')).toBeInTheDocument()
    fireEvent.click(screen.getByText('收起'))
    expect(screen.getByText('展开')).toBeInTheDocument()
  })

  // ── Task stats ──

  it('shows task stats', () => {
    render(<SwarmStatus tasks={tasks} />)
    expect(screen.getByText(/任务: 1\/3/)).toBeInTheDocument()
    expect(screen.getByText(/运行中: 1/)).toBeInTheDocument()
  })

  it('handles empty tasks', () => {
    render(<SwarmStatus tasks={[]} />)
    expect(screen.getByText(/任务: 0\/0/)).toBeInTheDocument()
  })

  it('counts failed tasks in completed count only', () => {
    const mixedTasks: SwarmTask[] = [
      { id: '1', name: 'Done', status: 'completed' },
      { id: '2', name: 'Fail', status: 'failed' },
      { id: '3', name: 'Run', status: 'running' },
      { id: '4', name: 'Pend', status: 'pending' },
    ]
    render(<SwarmStatus tasks={mixedTasks} />)
    expect(screen.getByText(/任务: 1\/4/)).toBeInTheDocument()
    expect(screen.getByText(/运行中: 1/)).toBeInTheDocument()
  })

  it('counts multiple running tasks', () => {
    const multiRun: SwarmTask[] = [
      { id: '1', name: 'A', status: 'running' },
      { id: '2', name: 'B', status: 'running' },
      { id: '3', name: 'C', status: 'completed' },
    ]
    render(<SwarmStatus tasks={multiRun} />)
    expect(screen.getByText(/运行中: 2/)).toBeInTheDocument()
  })

  // ── Progress ──

  it('shows progress when provided', () => {
    render(<SwarmStatus tasks={tasks} progress={65} />)
    expect(screen.getByText('65%')).toBeInTheDocument()
    expect(screen.getByText('任务进度')).toBeInTheDocument()
  })

  it('hides progress when not provided', () => {
    render(<SwarmStatus tasks={tasks} />)
    expect(screen.queryByText('任务进度')).toBeNull()
  })

  it('renders progress bar with correct width', () => {
    render(<SwarmStatus tasks={tasks} progress={42} />)
    const bar = document.querySelector('[style*="width: 42%"]')
    expect(bar).toBeInTheDocument()
  })

  it('shows 0% progress', () => {
    render(<SwarmStatus tasks={tasks} progress={0} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('shows 100% progress', () => {
    render(<SwarmStatus tasks={tasks} progress={100} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  // ── Primary Agent ──

  it('shows primary agent when provided', () => {
    render(<SwarmStatus tasks={[]} primaryAgentId="queen-1" />)
    expect(screen.getByText('当前主导:')).toBeInTheDocument()
    expect(screen.getByText('queen-1')).toBeInTheDocument()
  })

  it('hides primary agent when not provided', () => {
    render(<SwarmStatus tasks={[]} />)
    expect(screen.queryByText('当前主导:')).toBeNull()
  })

  it('renders primary agent badge with correct class', () => {
    render(<SwarmStatus tasks={[]} primaryAgentId="agent-x" />)
    const badge = screen.getByText('agent-x')
    expect(badge.className).toContain('agent-badge')
    expect(badge.className).toContain('primary')
  })

  // ── Consensus ──

  it('shows consensus section when provided', () => {
    render(<SwarmStatus tasks={[]} consensus={{ total: 3, agreed: 2, votes: [] }} />)
    expect(screen.getByText('共识投票')).toBeInTheDocument()
  })

  it('hides consensus when not provided', () => {
    render(<SwarmStatus tasks={[]} />)
    expect(screen.queryByText('共识投票')).toBeNull()
  })

  it('shows agreed count in consensus', () => {
    render(<SwarmStatus tasks={[]} consensus={{ total: 5, agreed: 3, votes: [] }} />)
    expect(screen.getByText('3/5 同意')).toBeInTheDocument()
  })

  describe('consensus votes (expanded)', () => {
    const votes: ConsensusVote[] = [
      { agentId: 'a1', agentName: 'Agent 1', vote: 'agree' },
      { agentId: 'a2', agentName: 'Agent 2', vote: 'disagree' },
      { agentId: 'a3', agentName: 'Agent 3', vote: 'abstain' },
    ]

    it('renders vote details when expanded', () => {
      render(<SwarmStatus tasks={[]} consensus={{ total: 3, agreed: 1, votes }} />)
      fireEvent.click(screen.getByText('展开'))
      expect(screen.getByText('Agent 1')).toBeInTheDocument()
      expect(screen.getByText('Agent 2')).toBeInTheDocument()
      expect(screen.getByText('Agent 3')).toBeInTheDocument()
    })

    it('shows checkmark for agree vote', () => {
      render(<SwarmStatus tasks={[]} consensus={{ total: 3, agreed: 1, votes }} />)
      fireEvent.click(screen.getByText('展开'))
      expect(screen.getByText('✓')).toBeInTheDocument()
    })

    it('shows cross for disagree vote', () => {
      render(<SwarmStatus tasks={[]} consensus={{ total: 3, agreed: 1, votes }} />)
      fireEvent.click(screen.getByText('展开'))
      expect(screen.getByText('✗')).toBeInTheDocument()
    })

    it('shows dash for abstain vote', () => {
      render(<SwarmStatus tasks={[]} consensus={{ total: 3, agreed: 1, votes }} />)
      fireEvent.click(screen.getByText('展开'))
      expect(screen.getByText('-')).toBeInTheDocument()
    })

    it('shows vote reason when provided', () => {
      const votesWithReason: ConsensusVote[] = [
        { agentId: 'a1', agentName: 'Agent 1', vote: 'disagree', reason: 'Code quality issue' },
      ]
      render(<SwarmStatus tasks={[]} consensus={{ total: 1, agreed: 0, votes: votesWithReason }} />)
      fireEvent.click(screen.getByText('展开'))
      expect(screen.getByText('Code quality issue')).toBeInTheDocument()
    })

    it('hides vote details when collapsed', () => {
      render(<SwarmStatus tasks={[]} consensus={{ total: 3, agreed: 1, votes }} />)
      // Not expanded, so vote details should not show
      expect(screen.queryByText('Agent 1')).toBeNull()
    })
  })

  // ── Expanded task list ──

  describe('expanded task list', () => {
    it('shows task list when expanded', () => {
      render(<SwarmStatus tasks={tasks} />)
      fireEvent.click(screen.getByText('展开'))
      expect(screen.getByText('Task A')).toBeInTheDocument()
      expect(screen.getByText('Task B')).toBeInTheDocument()
      expect(screen.getByText('Task C')).toBeInTheDocument()
    })

    it('does not show task list when collapsed', () => {
      render(<SwarmStatus tasks={tasks} />)
      expect(screen.queryByText('Task A')).toBeNull()
    })

    it('shows assignedTo when present', () => {
      const assignedTasks: SwarmTask[] = [
        { id: '1', name: 'Task X', status: 'running', assignedTo: 'agent-007' },
      ]
      render(<SwarmStatus tasks={assignedTasks} />)
      fireEvent.click(screen.getByText('展开'))
      expect(screen.getByText('agent-007')).toBeInTheDocument()
    })

    it('does not show assignedTo when absent', () => {
      render(<SwarmStatus tasks={tasks} />)
      fireEvent.click(screen.getByText('展开'))
      // No assignedTo spans should be present for tasks without assignedTo
      expect(screen.queryByText('agent-007')).toBeNull()
    })

    it('shows nothing for tasks when expanded with empty tasks', () => {
      render(<SwarmStatus tasks={[]} />)
      fireEvent.click(screen.getByText('展开'))
      // Just verify no task names appear
      expect(screen.queryByText('Task')).toBeNull()
    })
  })

  // ── Emergence health ──

  describe('emergence health', () => {
    it('shows emergence section when expanded', () => {
      render(<SwarmStatus tasks={[]} emergence={{ health: { overallScore: 0.85 } }} />)
      fireEvent.click(screen.getByText('展开'))
      expect(screen.getByText('信息素健康度')).toBeInTheDocument()
    })

    it('does not show emergence section when collapsed', () => {
      render(<SwarmStatus tasks={[]} emergence={{ health: { overallScore: 0.85 } }} />)
      expect(screen.queryByText('信息素健康度')).toBeNull()
    })

    it('does not show emergence section when emergence has no health', () => {
      render(<SwarmStatus tasks={[]} emergence={{}} />)
      fireEvent.click(screen.getByText('展开'))
      expect(screen.queryByText('信息素健康度')).toBeNull()
    })

    it('shows overall score rounded to percentage', () => {
      render(<SwarmStatus tasks={[]} emergence={{ health: { overallScore: 0.857 } }} />)
      fireEvent.click(screen.getByText('展开'))
      expect(screen.getByText('86%')).toBeInTheDocument()
    })

    it('shows congestion level', () => {
      render(<SwarmStatus tasks={[]} emergence={{ health: { congestionLevel: 0.3 } }} />)
      fireEvent.click(screen.getByText('展开'))
      expect(screen.getByText('拥堵度')).toBeInTheDocument()
      expect(screen.getByText('30%')).toBeInTheDocument()
    })

    it('shows congestion level with error color when > 0.5', () => {
      render(<SwarmStatus tasks={[]} emergence={{ health: { congestionLevel: 0.7 } }} />)
      fireEvent.click(screen.getByText('展开'))
      const congestionValue = screen.getByText('70%')
      expect(congestionValue).toBeInTheDocument()
      // Should have var(--error) style when > 0.5
      const parent = congestionValue.closest('span')
      expect(parent?.getAttribute('style')).toContain('var(--error)')
    })

    it('shows congestion level with normal color when <= 0.5', () => {
      render(<SwarmStatus tasks={[]} emergence={{ health: { congestionLevel: 0.4 } }} />)
      fireEvent.click(screen.getByText('展开'))
      const congestionValue = screen.getByText('40%')
      const parent = congestionValue.closest('span')
      expect(parent?.getAttribute('style')).toContain('var(--text-primary)')
    })

    it('shows collaboration index', () => {
      render(<SwarmStatus tasks={[]} emergence={{ health: { collaborationIndex: 0.92 } }} />)
      fireEvent.click(screen.getByText('展开'))
      expect(screen.getByText('协作指数')).toBeInTheDocument()
      expect(screen.getByText('92%')).toBeInTheDocument()
    })

    it('shows agent utilization', () => {
      render(<SwarmStatus tasks={[]} emergence={{ health: { agentUtilization: 0.67 } }} />)
      fireEvent.click(screen.getByText('展开'))
      expect(screen.getByText('利用率')).toBeInTheDocument()
      expect(screen.getByText('67%')).toBeInTheDocument()
    })

    it('hides individual health fields when not provided', () => {
      render(<SwarmStatus tasks={[]} emergence={{ health: { overallScore: 0.5 } }} />)
      fireEvent.click(screen.getByText('展开'))
      expect(screen.getByText('整体评分')).toBeInTheDocument()
      expect(screen.queryByText('拥堵度')).toBeNull()
      expect(screen.queryByText('协作指数')).toBeNull()
      expect(screen.queryByText('利用率')).toBeNull()
    })

    it('shows all health fields together', () => {
      render(
        <SwarmStatus
          tasks={[]}
          emergence={{
            health: {
              overallScore: 0.88,
              congestionLevel: 0.12,
              collaborationIndex: 0.95,
              agentUtilization: 0.78,
            },
          }}
        />,
      )
      fireEvent.click(screen.getByText('展开'))
      expect(screen.getByText('88%')).toBeInTheDocument()
      expect(screen.getByText('12%')).toBeInTheDocument()
      expect(screen.getByText('95%')).toBeInTheDocument()
      expect(screen.getByText('78%')).toBeInTheDocument()
    })
  })

  // ── Emergent signals ──

  describe('emergent signals', () => {
    const signals: EmergentSignal[] = [
      { id: 's1', type: 'anomaly', severity: 'high', message: 'High memory usage' },
      { id: 's2', type: 'warning', severity: 'medium', message: 'Latency spike' },
      { id: 's3', type: 'info', severity: 'low', message: 'Normal event' },
    ]

    it('shows signals section when expanded and signals present', () => {
      render(<SwarmStatus tasks={[]} emergence={{ signals }} />)
      fireEvent.click(screen.getByText('展开'))
      expect(screen.getByText('涌现信号')).toBeInTheDocument()
    })

    it('does not show signals when collapsed', () => {
      render(<SwarmStatus tasks={[]} emergence={{ signals }} />)
      expect(screen.queryByText('涌现信号')).toBeNull()
    })

    it('does not show signals section when signals array is empty', () => {
      render(<SwarmStatus tasks={[]} emergence={{ signals: [] }} />)
      fireEvent.click(screen.getByText('展开'))
      expect(screen.queryByText('涌现信号')).toBeNull()
    })

    it('renders each signal message', () => {
      render(<SwarmStatus tasks={[]} emergence={{ signals }} />)
      fireEvent.click(screen.getByText('展开'))
      expect(screen.getByText('High memory usage')).toBeInTheDocument()
      expect(screen.getByText('Latency spike')).toBeInTheDocument()
      expect(screen.getByText('Normal event')).toBeInTheDocument()
    })

    it('renders signal type', () => {
      render(<SwarmStatus tasks={[]} emergence={{ signals }} />)
      fireEvent.click(screen.getByText('展开'))
      expect(screen.getByText('anomaly')).toBeInTheDocument()
      expect(screen.getByText('warning')).toBeInTheDocument()
      expect(screen.getByText('info')).toBeInTheDocument()
    })

    it('limits signals to first 5', () => {
      const manySignals: EmergentSignal[] = Array.from({ length: 8 }, (_, i) => ({
        id: `s${i}`,
        type: 'info',
        severity: 'low',
        message: `Signal ${i}`,
      }))
      render(<SwarmStatus tasks={[]} emergence={{ signals: manySignals }} />)
      fireEvent.click(screen.getByText('展开'))
      expect(screen.getByText('Signal 0')).toBeInTheDocument()
      expect(screen.getByText('Signal 4')).toBeInTheDocument()
      expect(screen.queryByText('Signal 5')).toBeNull()
      expect(screen.queryByText('Signal 7')).toBeNull()
    })
  })

  // ── Combined state ──

  it('renders all sections together when expanded', () => {
    render(
      <SwarmStatus
        tasks={tasks}
        primaryAgentId="queen"
        progress={75}
        consensus={{ total: 3, agreed: 2, votes: [] }}
        emergence={{
          health: { overallScore: 0.9 },
          signals: [{ id: 's1', type: 'info', severity: 'low', message: 'Test signal' }],
        }}
      />,
    )
    fireEvent.click(screen.getByText('展开'))
    expect(screen.getByText('蜂群状态')).toBeInTheDocument()
    expect(screen.getByText('queen')).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('共识投票')).toBeInTheDocument()
    expect(screen.getByText('信息素健康度')).toBeInTheDocument()
    expect(screen.getByText('涌现信号')).toBeInTheDocument()
    expect(screen.getByText('Task A')).toBeInTheDocument()
  })
})
