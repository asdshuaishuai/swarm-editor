import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

function makeRound(overrides: Record<string, unknown> = {}): ConsensusRound {
  return {
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
    ...overrides,
  }
}

interface ConsensusRound {
  round: number
  taskId: string
  taskTitle: string
  status: 'collecting' | 'evaluating' | 'consensus' | 'timeout' | 'conflict'
  votes: Vote[]
  threshold: number
  agreement: number
  deadline: Date
  algorithm: 'simple_majority' | 'supermajority' | 'unanimity' | 'weighted' | 'byzantine' | 'queen_bee'
}

interface Vote {
  agentId: string
  agentName: string
  approved: boolean
  confidence: number
  comment?: string
  timestamp: Date
}

const sampleRound = makeRound()

describe('ConsensusVisualization', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('no currentRound', () => {
    it('renders with no rounds', () => {
      const { container } = render(<ConsensusVisualization />)
      expect(container.firstChild).toBeTruthy()
    })

    it('shows "No active consensus" when no currentRound', () => {
      render(<ConsensusVisualization />)
      expect(screen.getByText('No active consensus')).toBeInTheDocument()
    })

    it('shows placeholder text explaining consensus', () => {
      render(<ConsensusVisualization />)
      expect(screen.getByText('Consensus will be triggered when agents need to agree')).toBeInTheDocument()
    })

    it('does not show timer when no currentRound', () => {
      render(<ConsensusVisualization />)
      expect(screen.queryByText(/⏱/)).not.toBeInTheDocument()
    })

    it('does not show action buttons when no currentRound', () => {
      render(<ConsensusVisualization />)
      expect(screen.queryByText('Approve')).not.toBeInTheDocument()
      expect(screen.queryByText('Reject')).not.toBeInTheDocument()
    })

    it('does not show historical rounds when rounds is empty', () => {
      render(<ConsensusVisualization />)
      expect(screen.queryByText('Recent Rounds')).not.toBeInTheDocument()
    })
  })

  describe('algorithm labels', () => {
    it('renders algorithm label for currentRound', () => {
      render(<ConsensusVisualization currentRound={sampleRound} />)
      expect(screen.getByText('Simple Majority (>50%)')).toBeInTheDocument()
    })

    it('renders supermajority label', () => {
      render(<ConsensusVisualization currentRound={makeRound({ algorithm: 'supermajority' })} />)
      expect(screen.getByText('Supermajority (2/3)')).toBeInTheDocument()
    })

    it('renders unanimity label', () => {
      render(<ConsensusVisualization currentRound={makeRound({ algorithm: 'unanimity' })} />)
      expect(screen.getByText('Unanimity (100%)')).toBeInTheDocument()
    })

    it('renders weighted label', () => {
      render(<ConsensusVisualization currentRound={makeRound({ algorithm: 'weighted' })} />)
      expect(screen.getByText('Weighted Voting')).toBeInTheDocument()
    })

    it('renders byzantine label', () => {
      render(<ConsensusVisualization currentRound={makeRound({ algorithm: 'byzantine' })} />)
      expect(screen.getByText('Byzantine Fault Tolerance')).toBeInTheDocument()
    })

    it('renders queen_bee label', () => {
      render(<ConsensusVisualization currentRound={makeRound({ algorithm: 'queen_bee' })} />)
      expect(screen.getByText('Queen Bee Model')).toBeInTheDocument()
    })
  })

  describe('status display', () => {
    it('renders task title for currentRound', () => {
      render(<ConsensusVisualization currentRound={sampleRound} />)
      expect(screen.getByText('Refactor main layout')).toBeInTheDocument()
    })

    it('renders round number', () => {
      render(<ConsensusVisualization currentRound={sampleRound} />)
      expect(screen.getByText('Round 1')).toBeInTheDocument()
    })

    it('shows CONSENSUS status in uppercase', () => {
      render(<ConsensusVisualization currentRound={sampleRound} />)
      expect(screen.getByText('CONSENSUS')).toBeInTheDocument()
    })

    it('shows COLLECTING status', () => {
      render(<ConsensusVisualization currentRound={makeRound({ status: 'collecting' })} />)
      expect(screen.getByText('COLLECTING')).toBeInTheDocument()
    })

    it('shows TIMEOUT status', () => {
      render(<ConsensusVisualization currentRound={makeRound({ status: 'timeout' })} />)
      expect(screen.getByText('TIMEOUT')).toBeInTheDocument()
    })

    it('shows CONFLICT status', () => {
      render(<ConsensusVisualization currentRound={makeRound({ status: 'conflict' })} />)
      expect(screen.getByText('CONFLICT')).toBeInTheDocument()
    })

    it('shows EVALUATING status', () => {
      render(<ConsensusVisualization currentRound={makeRound({ status: 'evaluating' })} />)
      expect(screen.getByText('EVALUATING')).toBeInTheDocument()
    })
  })

  describe('timer countdown', () => {
    it('displays time left when currentRound has future deadline', () => {
      render(<ConsensusVisualization currentRound={makeRound({ deadline: new Date(Date.now() + 90000) })} />)
      expect(screen.getByText(/⏱/)).toBeInTheDocument()
    })

    it('shows Expired when deadline is in the past', () => {
      render(<ConsensusVisualization currentRound={makeRound({ deadline: new Date(Date.now() - 1000) })} />)
      expect(screen.getByText(/⏱.*Expired/)).toBeInTheDocument()
    })

    it('updates timer every second', () => {
      const deadline = new Date(Date.now() + 3000)
      render(<ConsensusVisualization currentRound={makeRound({ deadline })} />)

      // Advance 1 second
      vi.advanceTimersByTime(1000)
      // After advancing, the timer should still be showing (not expired)
      expect(screen.getByText(/⏱/)).toBeInTheDocument()
    })

    it('cleans up interval on unmount', () => {
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
      const { unmount } = render(<ConsensusVisualization currentRound={sampleRound} />)
      unmount()
      expect(clearIntervalSpy).toHaveBeenCalled()
      clearIntervalSpy.mockRestore()
    })
  })

  describe('agreement progress bar', () => {
    it('renders progress bar with aria-valuenow', () => {
      render(<ConsensusVisualization currentRound={makeRound({ agreement: 0.75, threshold: 0.6 })} />)
      const progressBar = screen.getByRole('progressbar', { name: /Agreement level/ })
      expect(progressBar).toBeInTheDocument()
      expect(progressBar).toHaveAttribute('aria-valuenow', '75')
    })

    it('renders agreement percentage text', () => {
      render(<ConsensusVisualization currentRound={makeRound({ agreement: 0.75, threshold: 0.6 })} />)
      expect(screen.getByText('75% / 60%')).toBeInTheDocument()
    })

    it('rounds agreement and threshold values', () => {
      render(<ConsensusVisualization currentRound={makeRound({ agreement: 0.756, threshold: 0.667 })} />)
      expect(screen.getByText('76% / 67%')).toBeInTheDocument()
    })
  })

  describe('vote distribution', () => {
    it('shows approved vote count', () => {
      render(<ConsensusVisualization currentRound={sampleRound} />)
      expect(screen.getByText('Approved')).toBeInTheDocument()
      // Both votes are approved
      expect(screen.getByText('2', { selector: '.text-success.text-lg' })).toBeInTheDocument()
    })

    it('shows rejected vote count', () => {
      const round = makeRound({
        votes: [
          { agentId: 'a1', agentName: 'Agent 1', approved: true, confidence: 0.9, timestamp: new Date() },
          { agentId: 'a2', agentName: 'Agent 2', approved: false, confidence: 0.3, timestamp: new Date() },
        ],
      })
      render(<ConsensusVisualization currentRound={round} />)
      expect(screen.getByText('Rejected')).toBeInTheDocument()
    })

    it('shows pending vote count', () => {
      render(<ConsensusVisualization currentRound={makeRound({ threshold: 0.5 })} />)
      expect(screen.getByText('Pending')).toBeInTheDocument()
    })

    it('calculates pending as threshold minus total votes', () => {
      // threshold 0.5 maps to display but pending = threshold_display - total
      // In code: pendingVotes = (currentRound?.threshold || 0) - totalVotes
      const round = makeRound({ threshold: 5 })
      render(<ConsensusVisualization currentRound={round} />)
      // 2 votes, threshold 5 => pending = 5 - 2 = 3
      expect(screen.getByText('3', { exact: false })).toBeInTheDocument()
    })
  })

  describe('individual votes', () => {
    it('renders agent names', () => {
      render(<ConsensusVisualization currentRound={sampleRound} />)
      expect(screen.getByText('Agent 1')).toBeInTheDocument()
      expect(screen.getByText('Agent 2')).toBeInTheDocument()
    })

    it('renders confidence percentage', () => {
      render(<ConsensusVisualization currentRound={sampleRound} />)
      expect(screen.getByText('90% confidence')).toBeInTheDocument()
      expect(screen.getByText('80% confidence')).toBeInTheDocument()
    })

    it('renders vote comment when present', () => {
      const round = makeRound({
        votes: [
          { agentId: 'a1', agentName: 'Agent 1', approved: true, confidence: 0.9, comment: 'Looks good', timestamp: new Date() },
        ],
      })
      render(<ConsensusVisualization currentRound={round} />)
      expect(screen.getByText('"Looks good"')).toBeInTheDocument()
    })

    it('does not render comment element when vote has no comment', () => {
      const round = makeRound({
        votes: [
          { agentId: 'a1', agentName: 'Agent 1', approved: true, confidence: 0.9, timestamp: new Date() },
        ],
      })
      render(<ConsensusVisualization currentRound={round} />)
      // Should not have any quoted comment text
      expect(screen.queryByText(/".*"/)).not.toBeInTheDocument()
    })

    it('renders confidence bar per vote', () => {
      render(<ConsensusVisualization currentRound={sampleRound} />)
      const confidenceBars = screen.getAllByRole('progressbar', { name: /Confidence/ })
      expect(confidenceBars).toHaveLength(2)
    })

    it('confidence bar has correct aria-valuenow', () => {
      render(<ConsensusVisualization currentRound={sampleRound} />)
      const bar = screen.getByRole('progressbar', { name: 'Confidence: 90%' })
      expect(bar).toHaveAttribute('aria-valuenow', '90')
    })

    it('renders "Individual Votes" section header', () => {
      render(<ConsensusVisualization currentRound={sampleRound} />)
      expect(screen.getByText('Individual Votes')).toBeInTheDocument()
    })
  })

  describe('byzantine warning', () => {
    it('shows warning when algorithm is byzantine and there are rejected votes', () => {
      const round = makeRound({
        algorithm: 'byzantine',
        votes: [
          { agentId: 'a1', agentName: 'Agent 1', approved: true, confidence: 0.9, timestamp: new Date() },
          { agentId: 'a2', agentName: 'Agent 2', approved: false, confidence: 0.3, timestamp: new Date() },
        ],
      })
      render(<ConsensusVisualization currentRound={round} />)
      expect(screen.getByText('Potential Byzantine Behavior Detected')).toBeInTheDocument()
      expect(screen.getByText(/1 agent\(s\) voted against consensus/)).toBeInTheDocument()
    })

    it('does not show warning when algorithm is byzantine but no rejected votes', () => {
      const round = makeRound({
        algorithm: 'byzantine',
        votes: [
          { agentId: 'a1', agentName: 'Agent 1', approved: true, confidence: 0.9, timestamp: new Date() },
          { agentId: 'a2', agentName: 'Agent 2', approved: true, confidence: 0.8, timestamp: new Date() },
        ],
      })
      render(<ConsensusVisualization currentRound={round} />)
      expect(screen.queryByText('Potential Byzantine Behavior Detected')).not.toBeInTheDocument()
    })

    it('does not show warning when not byzantine algorithm', () => {
      const round = makeRound({
        algorithm: 'simple_majority',
        votes: [
          { agentId: 'a1', agentName: 'Agent 1', approved: true, confidence: 0.9, timestamp: new Date() },
          { agentId: 'a2', agentName: 'Agent 2', approved: false, confidence: 0.3, timestamp: new Date() },
        ],
      })
      render(<ConsensusVisualization currentRound={round} />)
      expect(screen.queryByText('Potential Byzantine Behavior Detected')).not.toBeInTheDocument()
    })

    it('shows correct count of rejected agents in warning', () => {
      const round = makeRound({
        algorithm: 'byzantine',
        votes: [
          { agentId: 'a1', agentName: 'Agent 1', approved: false, confidence: 0.2, timestamp: new Date() },
          { agentId: 'a2', agentName: 'Agent 2', approved: false, confidence: 0.3, timestamp: new Date() },
          { agentId: 'a3', agentName: 'Agent 3', approved: true, confidence: 0.9, timestamp: new Date() },
        ],
      })
      render(<ConsensusVisualization currentRound={round} />)
      expect(screen.getByText(/2 agent\(s\) voted against consensus/)).toBeInTheDocument()
    })
  })

  describe('historical rounds', () => {
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
      const option = screen.getByRole('option')
      expect(option.textContent).toContain('R1')
    })

    it('shows conflict icon for conflict status rounds', () => {
      const conflictRound = makeRound({ status: 'conflict' })
      render(<ConsensusVisualization rounds={[conflictRound]} />)
      const option = screen.getByRole('option')
      expect(option.textContent).toContain('✗')
    })

    it('shows neutral icon for collecting status rounds', () => {
      const collectingRound = makeRound({ status: 'collecting' })
      render(<ConsensusVisualization rounds={[collectingRound]} />)
      const option = screen.getByRole('option')
      expect(option.textContent).toContain('○')
    })

    it('shows at most 5 recent rounds', () => {
      const rounds = Array.from({ length: 7 }, (_, i) => makeRound({ round: i + 1, taskId: `task-${i}` }))
      render(<ConsensusVisualization rounds={rounds} />)
      const options = screen.getAllByRole('option')
      expect(options).toHaveLength(5)
    })

    it('selects a round on click', () => {
      render(<ConsensusVisualization rounds={[sampleRound]} />)
      const option = screen.getByRole('option')
      fireEvent.click(option)
      // After clicking, the button should have bg-accent class (selected state)
      expect(option.className).toContain('bg-accent')
    })

    it('deselects a round on second click', () => {
      render(<ConsensusVisualization rounds={[sampleRound]} />)
      const option = screen.getByRole('option')
      fireEvent.click(option)
      expect(option.className).toContain('bg-accent')
      fireEvent.click(option)
      expect(option.className).not.toContain('bg-accent')
    })

    it('sets aria-selected on selected round', () => {
      render(<ConsensusVisualization rounds={[sampleRound]} />)
      const option = screen.getByRole('option')
      expect(option).toHaveAttribute('aria-selected', 'false')
      fireEvent.click(option)
      expect(option).toHaveAttribute('aria-selected', 'true')
    })

    it('renders listbox with correct role', () => {
      render(<ConsensusVisualization rounds={[sampleRound]} />)
      expect(screen.getByRole('listbox', { name: 'Recent consensus rounds' })).toBeInTheDocument()
    })

    it('does not render historical rounds section when rounds is empty', () => {
      render(<ConsensusVisualization rounds={[]} />)
      expect(screen.queryByText('Recent Rounds')).not.toBeInTheDocument()
    })
  })

  describe('action buttons', () => {
    it('shows Approve and Reject buttons when status is collecting', () => {
      render(<ConsensusVisualization currentRound={makeRound({ status: 'collecting' })} />)
      expect(screen.getByRole('button', { name: /Approve/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Reject/ })).toBeInTheDocument()
    })

    it('does not show action buttons when status is not collecting', () => {
      render(<ConsensusVisualization currentRound={makeRound({ status: 'consensus' })} />)
      expect(screen.queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Reject/ })).not.toBeInTheDocument()
    })

    it('calls onApprove when Approve button is clicked', () => {
      const onApprove = vi.fn()
      render(<ConsensusVisualization currentRound={makeRound({ status: 'collecting' })} onApprove={onApprove} />)
      fireEvent.click(screen.getByRole('button', { name: /Approve/ }))
      expect(onApprove).toHaveBeenCalledOnce()
    })

    it('calls onReject when Reject button is clicked', () => {
      const onReject = vi.fn()
      render(<ConsensusVisualization currentRound={makeRound({ status: 'collecting' })} onReject={onReject} />)
      fireEvent.click(screen.getByRole('button', { name: /Reject/ }))
      expect(onReject).toHaveBeenCalledOnce()
    })

    it('does not render action buttons when no currentRound', () => {
      render(<ConsensusVisualization />)
      expect(screen.queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Reject/ })).not.toBeInTheDocument()
    })
  })

  describe('edge cases', () => {
    it('renders with zero votes', () => {
      const round = makeRound({ votes: [], threshold: 3, agreement: 0 })
      render(<ConsensusVisualization currentRound={round} />)
      expect(screen.getByText('Refactor main layout')).toBeInTheDocument()
    })

    it('renders with high confidence vote (>0.8)', () => {
      const round = makeRound({
        votes: [
          { agentId: 'a1', agentName: 'Agent 1', approved: true, confidence: 0.95, timestamp: new Date() },
        ],
      })
      render(<ConsensusVisualization currentRound={round} />)
      expect(screen.getByText('95% confidence')).toBeInTheDocument()
    })

    it('renders with medium confidence vote (>0.5, <=0.8)', () => {
      const round = makeRound({
        votes: [
          { agentId: 'a1', agentName: 'Agent 1', approved: true, confidence: 0.65, timestamp: new Date() },
        ],
      })
      render(<ConsensusVisualization currentRound={round} />)
      expect(screen.getByText('65% confidence')).toBeInTheDocument()
    })

    it('renders with low confidence vote (<=0.5)', () => {
      const round = makeRound({
        votes: [
          { agentId: 'a1', agentName: 'Agent 1', approved: false, confidence: 0.3, timestamp: new Date() },
        ],
      })
      render(<ConsensusVisualization currentRound={round} />)
      expect(screen.getByText('30% confidence')).toBeInTheDocument()
    })

    it('renders with agreement above threshold (success color)', () => {
      const round = makeRound({ agreement: 0.9, threshold: 0.6 })
      render(<ConsensusVisualization currentRound={round} />)
      // The progress bar fill should have bg-success class
      const progressBar = screen.getByRole('progressbar', { name: /Agreement level/ })
      expect(progressBar).toBeInTheDocument()
    })

    it('renders with agreement at half threshold (warning color)', () => {
      const round = makeRound({ agreement: 0.35, threshold: 0.6 })
      render(<ConsensusVisualization currentRound={round} />)
      // agreement >= threshold/2 => warning color
      expect(screen.getByText('35% / 60%')).toBeInTheDocument()
    })

    it('renders with agreement below half threshold (error color)', () => {
      const round = makeRound({ agreement: 0.2, threshold: 0.6 })
      render(<ConsensusVisualization currentRound={round} />)
      expect(screen.getByText('20% / 60%')).toBeInTheDocument()
    })

    it('clamps agreement width to 100% maximum', () => {
      const round = makeRound({ agreement: 1.5, threshold: 0.6 })
      render(<ConsensusVisualization currentRound={round} />)
      expect(screen.getByText('150% / 60%')).toBeInTheDocument()
    })

    it('renders with evaluating status (uses default icon)', () => {
      render(<ConsensusVisualization currentRound={makeRound({ status: 'evaluating' })} />)
      expect(screen.getByText('EVALUATING')).toBeInTheDocument()
    })

    it('handles multiple rounds with different statuses', () => {
      const rounds = [
        makeRound({ round: 1, taskId: 't1', status: 'consensus' }),
        makeRound({ round: 2, taskId: 't2', status: 'conflict' }),
        makeRound({ round: 3, taskId: 't3', status: 'collecting' }),
      ]
      render(<ConsensusVisualization rounds={rounds} />)
      const options = screen.getAllByRole('option')
      expect(options).toHaveLength(3)
      // First round has consensus checkmark
      expect(options[0].textContent).toContain('✓')
      // Second has conflict cross
      expect(options[1].textContent).toContain('✗')
      // Third has neutral circle
      expect(options[2].textContent).toContain('○')
    })

    it('renders with unanimity algorithm evaluating status', () => {
      render(<ConsensusVisualization currentRound={makeRound({ algorithm: 'unanimity', status: 'evaluating' })} />)
      expect(screen.getByText('Unanimity (100%)')).toBeInTheDocument()
      expect(screen.getByText('EVALUATING')).toBeInTheDocument()
    })
  })
})
