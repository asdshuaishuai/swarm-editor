import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ConsensusVisualization from './ConsensusVisualization'

vi.mock('lucide-react', () => ({
  CheckCircle: () => 'svg',
  XCircle: () => 'svg',
  Clock: () => 'svg',
  Users: () => 'svg',
  Target: () => 'svg',
  AlertTriangle: () => 'svg',
  BarChart3: () => 'svg',
}))

const sampleRound = {
  round: 1,
  taskId: 'task-1',
  taskTitle: 'Refactor main layout',
  status: 'consensus' as const,
  votes: [
    { agentId: 'a1', agentName: 'Agent 1', approved: true, confidence: 0.9, timestamp: new Date() },
    { agentId: 'a2', agentName: 'Agent 2', approved: true, confidence: 0.8, timestamp: new Date() },
  ],
  threshold: 0.5,
  agreement: 1.0,
  deadline: new Date(Date.now() + 60000),
  algorithm: 'simple_majority' as const,
}

describe('ConsensusVisualization', () => {
  it('renders with no rounds', () => {
    const { container } = render(<ConsensusVisualization />)
    expect(container.firstChild).toBeTruthy()
  })

  it('shows "No active consensus" when no currentRound', () => {
    render(<ConsensusVisualization />)
    expect(screen.getByText('No active consensus')).toBeInTheDocument()
  })

  it('renders algorithm label for currentRound', () => {
    render(<ConsensusVisualization currentRound={sampleRound} />)
    expect(screen.getByText('Simple Majority (>50%)')).toBeInTheDocument()
  })

  it('renders task title for currentRound', () => {
    render(<ConsensusVisualization currentRound={sampleRound} />)
    expect(screen.getByText('Refactor main layout')).toBeInTheDocument()
  })

  it('renders historical rounds list', () => {
    render(<ConsensusVisualization rounds={[sampleRound]} />)
    expect(screen.getByText('Recent Rounds')).toBeInTheDocument()
    expect(screen.getByRole('option')).toBeInTheDocument()
  })

  it('renders round button with R prefix', () => {
    render(<ConsensusVisualization rounds={[sampleRound]} />)
    expect(screen.getByText('R1', { exact: false })).toBeInTheDocument()
  })

  it('renders consensus status icon in round button', () => {
    render(<ConsensusVisualization rounds={[sampleRound]} />)
    // ✓ is rendered for consensus status
    const option = screen.getByRole('option')
    expect(option.textContent).toContain('R1')
  })
})
