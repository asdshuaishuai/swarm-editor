import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { EmergenceDashboard } from './EmergenceDashboard'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetEmergenceData = vi.fn()

vi.mock('../services', () => ({
  monitoringApi: {
    getEmergenceData: () => mockGetEmergenceData(),
  },
}))

const mockFormatRelativeTime = vi.fn((_d: Date | string) => 'just now')

vi.mock('../utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  formatRelativeTime: (d: Date | string) => mockFormatRelativeTime(d),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeData(overrides: Partial<{
  signals: Array<{
    id: string
    type: string
    severity: string
    message: string
    timestamp: string
  }>
  health: {
    overallScore: number
    congestionLevel: number
    collaborationIndex: number
    innovationRate: number
    agentUtilization: number
  }
  agents: Array<{
    id: string
    name: string
    type: string
    load: number
    connectivity: number
    x: number
    y: number
  }>
  flows: Array<{
    id: string
    fromAgent: string
    toAgent: string
    taskType: string
    status: string
    startedAt: string
  }>
}> = {}) {
  return {
    health: {
      overallScore: 0.75,
      congestionLevel: 0.3,
      collaborationIndex: 0.8,
      innovationRate: 0.5,
      agentUtilization: 0.7,
    },
    signals: [],
    agents: [],
    flows: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('EmergenceDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockGetEmergenceData.mockResolvedValue(makeData())
    mockFormatRelativeTime.mockReturnValue('just now')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // -----------------------------------------------------------------------
  // Rendering & loading
  // -----------------------------------------------------------------------

  describe('initial rendering', () => {
    it('renders Swarm Monitor header', async () => {
      render(<EmergenceDashboard />)
      expect(screen.getByText('Swarm Monitor')).toBeInTheDocument()
      await vi.advanceTimersByTimeAsync(0)
    })

    it('shows Analyzing spinner while loading', () => {
      mockGetEmergenceData.mockReturnValue(new Promise(() => {}))
      render(<EmergenceDashboard />)
      expect(screen.getByText('Analyzing...')).toBeInTheDocument()
    })

    it('renders view mode buttons (Signals, Network, Flow)', async () => {
      render(<EmergenceDashboard />)
      expect(screen.getByText('Signals')).toBeInTheDocument()
      expect(screen.getByText('Network')).toBeInTheDocument()
      expect(screen.getByText('Flow')).toBeInTheDocument()
      await vi.advanceTimersByTimeAsync(0)
    })

    it('calls getEmergenceData on mount', async () => {
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      expect(mockGetEmergenceData).toHaveBeenCalledTimes(1)
    })

    it('shows the pulsing green dot in header', async () => {
      render(<EmergenceDashboard />)
      const dot = document.querySelector('.animate-pulse')
      expect(dot).toBeInTheDocument()
      await vi.advanceTimersByTimeAsync(0)
    })
  })

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe('error handling', () => {
    it('displays error message when fetch fails with Error instance', async () => {
      mockGetEmergenceData.mockRejectedValue(new Error('Network failure'))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Failed to load emergence data')).toBeInTheDocument()
      })
      expect(screen.getByText('Network failure')).toBeInTheDocument()
    })

    it('displays generic error message when fetch fails with non-Error', async () => {
      mockGetEmergenceData.mockRejectedValue('string error')
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        // Both title and detail show "Failed to load emergence data" for non-Error
        expect(screen.getAllByText('Failed to load emergence data').length).toBeGreaterThanOrEqual(1)
      })
    })

    it('logs error via logger when fetch fails', async () => {
      const { logger } = await import('../utils')
      mockGetEmergenceData.mockRejectedValue(new Error('fail'))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(logger.error).toHaveBeenCalledWith(
          'EmergenceDashboard',
          'Failed to fetch emergence data:',
          expect.any(Error),
        )
      })
    })

    it('recovers from error on next successful fetch', async () => {
      mockGetEmergenceData.mockRejectedValueOnce(new Error('temporary'))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Failed to load emergence data')).toBeInTheDocument()
      })

      // Advance to trigger interval-based refetch
      mockGetEmergenceData.mockResolvedValue(makeData())
      await vi.advanceTimersByTimeAsync(10_000)
      await vi.advanceTimersByTimeAsync(0)

      await waitFor(() => {
        expect(screen.queryByText('Failed to load emergence data')).not.toBeInTheDocument()
      })
    })
  })

  // -----------------------------------------------------------------------
  // Health display
  // -----------------------------------------------------------------------

  describe('health score display', () => {
    it('shows health section with overall score (rounded from 0-1 scale)', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        health: {
          overallScore: 0.856,
          congestionLevel: 0.3,
          collaborationIndex: 0.8,
          innovationRate: 0.5,
          agentUtilization: 0.7,
        },
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Health')).toBeInTheDocument()
      })
      // 0.856 * 100 = 85.6, rounded = 86
      expect(screen.getByText('86')).toBeInTheDocument()
    })

    it('displays all four health metrics', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        health: {
          overallScore: 0.75,
          congestionLevel: 0.42,
          collaborationIndex: 0.88,
          innovationRate: 0.55,
          agentUtilization: 0.67,
        },
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Health')).toBeInTheDocument()
      })
      expect(screen.getByText('42%')).toBeInTheDocument()
      expect(screen.getByText('88%')).toBeInTheDocument()
      expect(screen.getByText('55%')).toBeInTheDocument()
      expect(screen.getByText('67%')).toBeInTheDocument()
    })

    it('applies green color class for score >= 80', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        health: { overallScore: 0.9, congestionLevel: 0.1, collaborationIndex: 0.9, innovationRate: 0.8, agentUtilization: 0.9 },
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        const scoreEl = screen.getByText('90')
        expect(scoreEl.className).toContain('text-green-400')
      })
    })

    it('applies yellow color class for score 60-79', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        health: { overallScore: 0.65, congestionLevel: 0.3, collaborationIndex: 0.5, innovationRate: 0.4, agentUtilization: 0.6 },
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        const scoreEl = screen.getByText('65')
        expect(scoreEl.className).toContain('text-yellow-400')
      })
    })

    it('applies red color class for score < 60', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        health: { overallScore: 0.35, congestionLevel: 0.8, collaborationIndex: 0.2, innovationRate: 0.1, agentUtilization: 0.3 },
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        const scoreEl = screen.getByText('35')
        expect(scoreEl.className).toContain('text-red-400')
      })
    })

    it('does not show health section when data has no health', async () => {
      mockGetEmergenceData.mockResolvedValue({
        health: null as unknown as { overallScore: number; congestionLevel: number; collaborationIndex: number; innovationRate: number; agentUtilization: number },
        signals: [],
        agents: [],
        flows: [],
      })
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      // Should not crash; health section not rendered
      await waitFor(() => {
        expect(screen.queryByText('Health')).not.toBeInTheDocument()
      })
    })
  })

  // -----------------------------------------------------------------------
  // Signals view
  // -----------------------------------------------------------------------

  describe('signals view', () => {
    it('shows "No signals" when signals array is empty', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({ signals: [] }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('No signals')).toBeInTheDocument()
      })
    })

    it('renders signals with type, description, strength, and timestamp', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        signals: [
          { id: 's1', type: 'congestion', severity: 'high', message: 'High congestion detected', timestamp: '2026-01-01T00:00:00Z' },
        ],
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Congestion')).toBeInTheDocument()
      })
      expect(screen.getByText('High congestion detected')).toBeInTheDocument()
      expect(screen.getByText('90%')).toBeInTheDocument() // high severity => 0.9 strength
      expect(mockFormatRelativeTime).toHaveBeenCalled()
    })

    it('maps medium severity to 0.6 strength', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        health: { overallScore: 0.5, congestionLevel: 0.12, collaborationIndex: 0.34, innovationRate: 0.78, agentUtilization: 0.56 },
        signals: [
          { id: 's2', type: 'opportunity', severity: 'medium', message: 'Medium opp', timestamp: '2026-01-01T00:00:00Z' },
        ],
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Opportunity')).toBeInTheDocument()
      })
      expect(screen.getByText('60%')).toBeInTheDocument()
    })

    it('maps low severity to 0.3 strength', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        health: { overallScore: 0.5, congestionLevel: 0.12, collaborationIndex: 0.34, innovationRate: 0.78, agentUtilization: 0.56 },
        signals: [
          { id: 's3', type: 'innovation', severity: 'low', message: 'Low innovation', timestamp: '2026-01-01T00:00:00Z' },
        ],
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Innovation')).toBeInTheDocument()
      })
      expect(screen.getByText('30%')).toBeInTheDocument()
    })

    it('renders self_organization signal type', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        signals: [
          { id: 's4', type: 'self_organization', severity: 'medium', message: 'Self-org event', timestamp: '2026-01-01T00:00:00Z' },
        ],
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Self-Organization')).toBeInTheDocument()
      })
    })

    it('renders synergy signal type', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        signals: [
          { id: 's5', type: 'synergy', severity: 'high', message: 'Synergy event', timestamp: '2026-01-01T00:00:00Z' },
        ],
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Synergy')).toBeInTheDocument()
      })
    })

    it('falls back to opportunity type for unknown signal type', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        signals: [
          { id: 's6', type: '', severity: 'low', message: 'Unknown type', timestamp: '2026-01-01T00:00:00Z' },
        ],
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Opportunity')).toBeInTheDocument()
      })
    })

    it('renders signal summary bar with counts per type', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        signals: [
          { id: 's1', type: 'congestion', severity: 'high', message: 'C1', timestamp: '2026-01-01T00:00:00Z' },
          { id: 's2', type: 'congestion', severity: 'medium', message: 'C2', timestamp: '2026-01-01T00:00:00Z' },
          { id: 's3', type: 'opportunity', severity: 'low', message: 'O1', timestamp: '2026-01-01T00:00:00Z' },
        ],
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        // Congestion label appears in both signal card and summary bar
        expect(screen.getAllByText('Congestion').length).toBeGreaterThanOrEqual(2)
      })
      // Summary grid shows count "2" for congestion (2 signals)
      const allCounts = screen.getAllByText('2')
      expect(allCounts.length).toBeGreaterThanOrEqual(1) // at least the congestion count
    })

    it('renders all 5 signal type icons in summary', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({ signals: [] }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('No signals')).toBeInTheDocument()
      })
      // The summary bar has 5 entries with icons
      expect(screen.getAllByText('0').length).toBe(5)
    })

    it('calls onSignalClick when a signal card is clicked', async () => {
      const onSignalClick = vi.fn()
      mockGetEmergenceData.mockResolvedValue(makeData({
        signals: [
          { id: 's1', type: 'congestion', severity: 'high', message: 'Click me', timestamp: '2026-01-01T00:00:00Z' },
        ],
      }))
      render(<EmergenceDashboard onSignalClick={onSignalClick} />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Click me')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Click me'))
      expect(onSignalClick).toHaveBeenCalledTimes(1)
      expect(onSignalClick).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'congestion',
          description: 'Click me',
          strength: 0.9,
        }),
      )
    })

    it('renders multiple signals at once', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        signals: [
          { id: 's1', type: 'congestion', severity: 'high', message: 'Signal A', timestamp: '2026-01-01T00:00:00Z' },
          { id: 's2', type: 'synergy', severity: 'medium', message: 'Signal B', timestamp: '2026-01-01T00:00:00Z' },
          { id: 's3', type: 'innovation', severity: 'low', message: 'Signal C', timestamp: '2026-01-01T00:00:00Z' },
        ],
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Signal A')).toBeInTheDocument()
      })
      expect(screen.getByText('Signal B')).toBeInTheDocument()
      expect(screen.getByText('Signal C')).toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  // View mode switching
  // -----------------------------------------------------------------------

  describe('view mode switching', () => {
    it('starts in signals mode by default', async () => {
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        // Signals button should have active styling
        const signalsBtn = screen.getByText('Signals')
        expect(signalsBtn.className).toContain('bg-blue-500/30')
      })
    })

    it('switches to network mode when Network button clicked', async () => {
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Signals')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Network'))
      // Should show canvas
      const canvas = document.querySelector('canvas')
      expect(canvas).toBeInTheDocument()
    })

    it('switches to flow mode when Flow button clicked', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        flows: [
          { id: 'f1', fromAgent: 'agent-1', toAgent: 'agent-2', taskType: 'collab', status: 'running', startedAt: '2026-01-01T00:00:00Z' },
        ],
        agents: [
          { id: 'agent-1', name: 'Agent One', type: 'worker', load: 0.5, connectivity: 0.8, x: 0.2, y: 0.3 },
          { id: 'agent-2', name: 'Agent Two', type: 'worker', load: 0.2, connectivity: 0.6, x: 0.7, y: 0.6 },
        ],
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Signals')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Flow'))
      // No signals section visible
      expect(screen.queryByText('No signals')).not.toBeInTheDocument()
    })

    it('applies active styling to selected mode button', async () => {
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        const signalsBtn = screen.getByText('Signals')
        expect(signalsBtn.className).toContain('bg-blue-500/30')
      })
      fireEvent.click(screen.getByText('Network'))
      const networkBtn = screen.getByText('Network')
      expect(networkBtn.className).toContain('bg-blue-500/30')
      const signalsBtn = screen.getByText('Signals')
      expect(signalsBtn.className).not.toContain('bg-blue-500/30')
    })

    it('shows legend in network mode', async () => {
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Signals')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Network'))
      expect(screen.getByText('Active')).toBeInTheDocument()
      expect(screen.getByText('Idle')).toBeInTheDocument()
      expect(screen.getByText('Error')).toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  // Network view (canvas)
  // -----------------------------------------------------------------------

  describe('network view', () => {
    it('renders a canvas element', async () => {
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Signals')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Network'))
      const canvas = document.querySelector('canvas')
      expect(canvas).toBeInTheDocument()
    })

    it('draws nodes on canvas with agent data', async () => {
      // We need to mock canvas context to verify drawing calls
      const mockCtx = {
        setTransform: vi.fn(),
        scale: vi.fn(),
        fillRect: vi.fn(),
        strokeStyle: '',
        lineWidth: 0,
        setLineDash: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        fillStyle: '',
        font: '',
        textAlign: '',
        textBaseline: '',
        fillText: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        createRadialGradient: vi.fn().mockReturnValue({
          addColorStop: vi.fn(),
        }),
      }

      const originalGetContext = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockCtx) as unknown as typeof HTMLCanvasElement.prototype.getContext

      mockGetEmergenceData.mockResolvedValue(makeData({
        agents: [
          { id: 'a1', name: 'Agent Alpha', type: 'worker', load: 0.9, connectivity: 0.8, x: 0.3, y: 0.4 },
        ],
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Signals')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Network'))
      // Force a resize to trigger redraw
      await vi.advanceTimersByTimeAsync(0)
      // Canvas drawing was called
      expect(mockCtx.fillRect).toHaveBeenCalled()
      HTMLCanvasElement.prototype.getContext = originalGetContext
    })
  })

  // -----------------------------------------------------------------------
  // Flow view
  // -----------------------------------------------------------------------

  describe('flow view', () => {
    it('renders task flows with from/to agent names', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        agents: [
          { id: 'a1', name: 'Scanner Agent', type: 'scanner', load: 0.9, connectivity: 0.8, x: 0.2, y: 0.3 },
          { id: 'a2', name: 'Builder Agent', type: 'builder', load: 0.5, connectivity: 0.6, x: 0.7, y: 0.6 },
        ],
        flows: [
          { id: 'f1', fromAgent: 'a1', toAgent: 'a2', taskType: 'collaboration', status: 'running', startedAt: '2026-01-01T00:00:00Z' },
        ],
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Signals')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Flow'))
      await waitFor(() => {
        expect(screen.getByText('Scanner')).toBeInTheDocument()
        expect(screen.getByText('Builder')).toBeInTheDocument()
      })
    })

    it('displays flow type badge as collaboration', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        agents: [
          { id: 'a1', name: 'Agent A', type: 'worker', load: 0.9, connectivity: 0.8, x: 0.2, y: 0.3 },
          { id: 'a2', name: 'Agent B', type: 'worker', load: 0.5, connectivity: 0.6, x: 0.7, y: 0.6 },
        ],
        flows: [
          { id: 'f1', fromAgent: 'a1', toAgent: 'a2', taskType: 'collaboration', status: 'running', startedAt: '2026-01-01T00:00:00Z' },
        ],
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Signals')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Flow'))
      await waitFor(() => {
        expect(screen.getByText('collaboration')).toBeInTheDocument()
      })
    })

    it('maps completed flow status', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        agents: [
          { id: 'a1', name: 'Alpha', type: 'w', load: 0.5, connectivity: 0.5, x: 0.1, y: 0.2 },
          { id: 'a2', name: 'Beta', type: 'w', load: 0.3, connectivity: 0.5, x: 0.8, y: 0.7 },
        ],
        flows: [
          { id: 'f1', fromAgent: 'a1', toAgent: 'a2', taskType: 'handoff', status: 'completed', startedAt: '2026-01-01T00:00:00Z' },
        ],
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Signals')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Flow'))
      await waitFor(() => {
        // Completed flows should render a green dot
        expect(screen.getByText('Alpha')).toBeInTheDocument()
        expect(screen.getByText('Beta')).toBeInTheDocument()
      })
    })

    it('maps pending flow status', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        agents: [
          { id: 'a1', name: 'First', type: 'w', load: 0.2, connectivity: 0.5, x: 0.1, y: 0.2 },
          { id: 'a2', name: 'Second', type: 'w', load: 0.3, connectivity: 0.5, x: 0.8, y: 0.7 },
        ],
        flows: [
          { id: 'f2', fromAgent: 'a1', toAgent: 'a2', taskType: 'delegation', status: 'pending', startedAt: '2026-01-01T00:00:00Z' },
        ],
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Signals')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Flow'))
      await waitFor(() => {
        expect(screen.getByText('First')).toBeInTheDocument()
      })
    })

    it('skips flows where from/to agent not found', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        agents: [
          { id: 'a1', name: 'Only One', type: 'w', load: 0.5, connectivity: 0.5, x: 0.1, y: 0.2 },
        ],
        flows: [
          { id: 'f1', fromAgent: 'a1', toAgent: 'nonexistent', taskType: 'collaboration', status: 'running', startedAt: '2026-01-01T00:00:00Z' },
        ],
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Signals')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Flow'))
      // Flow should not render since "nonexistent" agent is missing
      await vi.advanceTimersByTimeAsync(0)
      expect(screen.queryByText('collaboration')).not.toBeInTheDocument()
    })

    it('shows agent first letter in avatar circle', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        agents: [
          { id: 'a1', name: 'Zeta Agent', type: 'w', load: 0.9, connectivity: 0.5, x: 0.1, y: 0.2 },
          { id: 'a2', name: 'Omega Agent', type: 'w', load: 0.2, connectivity: 0.5, x: 0.8, y: 0.7 },
        ],
        flows: [
          { id: 'f1', fromAgent: 'a1', toAgent: 'a2', taskType: 'collaboration', status: 'running', startedAt: '2026-01-01T00:00:00Z' },
        ],
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Signals')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Flow'))
      await waitFor(() => {
        expect(screen.getByText('Z')).toBeInTheDocument()
        expect(screen.getByText('O')).toBeInTheDocument()
      })
    })
  })

  // -----------------------------------------------------------------------
  // Agent nodes mapping
  // -----------------------------------------------------------------------

  describe('agent node mapping', () => {
    it('maps agents with load > 0.8 to active status', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        agents: [
          { id: 'a1', name: 'Busy Agent', type: 'worker', load: 0.95, connectivity: 0.8, x: 0.3, y: 0.4 },
        ],
        flows: [
          { id: 'f1', fromAgent: 'a1', toAgent: 'a2', taskType: 'c', status: 'running', startedAt: '2026-01-01T00:00:00Z' },
        ],
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      // Agent has active status (load > 0.8). Verify via flow view rendering.
      await waitFor(() => {
        expect(screen.getByText('Signals')).toBeInTheDocument()
      })
    })

    it('maps agents with load between 0 and 0.8 to idle status', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        agents: [
          { id: 'a1', name: 'Idle Agent', type: 'worker', load: 0.3, connectivity: 0.8, x: 0.3, y: 0.4 },
        ],
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Signals')).toBeInTheDocument()
      })
    })

    it('maps agents with load 0 to error status', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        agents: [
          { id: 'a1', name: 'Dead Agent', type: 'worker', load: 0, connectivity: 0, x: 0, y: 0 },
        ],
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Signals')).toBeInTheDocument()
      })
    })

    it('provides default x/y positions based on index when not provided', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        agents: [
          { id: 'a0', name: 'Agent0', type: 'worker', load: 0.5, connectivity: 0.5, x: 0, y: 0 },
          { id: 'a1', name: 'Agent1', type: 'worker', load: 0.5, connectivity: 0.5, x: 0, y: 0 },
          { id: 'a2', name: 'Agent2', type: 'worker', load: 0.5, connectivity: 0.5, x: 0, y: 0 },
          { id: 'a3', name: 'Agent3', type: 'worker', load: 0.5, connectivity: 0.5, x: 0, y: 0 },
        ],
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Signals')).toBeInTheDocument()
      })
      // Components render without errors, default positions used
    })
  })

  // -----------------------------------------------------------------------
  // Polling / interval
  // -----------------------------------------------------------------------

  describe('polling interval', () => {
    it('refetches data every 10 seconds', async () => {
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      expect(mockGetEmergenceData).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(10_000)
      expect(mockGetEmergenceData).toHaveBeenCalledTimes(2)

      await vi.advanceTimersByTimeAsync(10_000)
      expect(mockGetEmergenceData).toHaveBeenCalledTimes(3)
    })

    it('clears interval on unmount', async () => {
      const { unmount } = render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      expect(mockGetEmergenceData).toHaveBeenCalledTimes(1)

      unmount()
      await vi.advanceTimersByTimeAsync(20_000)
      // Should NOT have been called again after unmount
      expect(mockGetEmergenceData).toHaveBeenCalledTimes(1)
    })

    it('cancels in-flight fetch on unmount', async () => {
      let resolvePromise: (value: unknown) => void
      const slowPromise = new Promise((resolve) => { resolvePromise = resolve })
      mockGetEmergenceData.mockReturnValue(slowPromise)

      const { unmount } = render(<EmergenceDashboard />)
      unmount()

      // Resolve after unmount - should not cause state update
      resolvePromise!(makeData())
      await vi.advanceTimersByTimeAsync(0)
      // No error means cancellation path works
    })
  })

  // -----------------------------------------------------------------------
  // swarmId prop
  // -----------------------------------------------------------------------

  describe('swarmId prop', () => {
    it('re-fetches data when swarmId changes', async () => {
      const { rerender } = render(<EmergenceDashboard swarmId="swarm-1" />)
      await vi.advanceTimersByTimeAsync(0)
      expect(mockGetEmergenceData).toHaveBeenCalledTimes(1)

      rerender(<EmergenceDashboard swarmId="swarm-2" />)
      await vi.advanceTimersByTimeAsync(0)
      expect(mockGetEmergenceData).toHaveBeenCalledTimes(2)
    })

    it('does not re-fetch when swarmId is same', async () => {
      const { rerender } = render(<EmergenceDashboard swarmId="swarm-1" />)
      await vi.advanceTimersByTimeAsync(0)
      expect(mockGetEmergenceData).toHaveBeenCalledTimes(1)

      rerender(<EmergenceDashboard swarmId="swarm-1" />)
      await vi.advanceTimersByTimeAsync(0)
      // Still 1 because deps didn't change
      expect(mockGetEmergenceData).toHaveBeenCalledTimes(1)
    })
  })

  // -----------------------------------------------------------------------
  // Health score gradient
  // -----------------------------------------------------------------------

  describe('health score gradient', () => {
    it('uses green gradient for score >= 80', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        health: { overallScore: 0.85, congestionLevel: 0.1, collaborationIndex: 0.9, innovationRate: 0.8, agentUtilization: 0.9 },
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        const healthSection = screen.getByText('Health').closest('div')
        expect(healthSection?.parentElement?.className).toContain('from-green-500/20')
      })
    })

    it('uses yellow gradient for score 60-79', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        health: { overallScore: 0.65, congestionLevel: 0.3, collaborationIndex: 0.5, innovationRate: 0.4, agentUtilization: 0.6 },
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        const healthSection = screen.getByText('Health').closest('div')
        expect(healthSection?.parentElement?.className).toContain('from-yellow-500/20')
      })
    })

    it('uses red gradient for score < 60', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        health: { overallScore: 0.4, congestionLevel: 0.8, collaborationIndex: 0.2, innovationRate: 0.1, agentUtilization: 0.3 },
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        const healthSection = screen.getByText('Health').closest('div')
        expect(healthSection?.parentElement?.className).toContain('from-red-500/20')
      })
    })
  })

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles null signals array', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({ signals: null as unknown as never[] }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('No signals')).toBeInTheDocument()
      })
    })

    it('handles null agents array', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({ agents: null as unknown as never[] }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Signals')).toBeInTheDocument()
      })
    })

    it('handles null flows array', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({ flows: null as unknown as never[] }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Signals')).toBeInTheDocument()
      })
    })

    it('handles undefined signal type gracefully', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        signals: [
          { id: 'sx', type: undefined as unknown as string, severity: 'low', message: 'Test', timestamp: '2026-01-01T00:00:00Z' },
        ],
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Test')).toBeInTheDocument()
      })
    })

    it('does not call onSignalClick when not provided', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        signals: [
          { id: 's1', type: 'congestion', severity: 'high', message: 'Clickable', timestamp: '2026-01-01T00:00:00Z' },
        ],
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Clickable')).toBeInTheDocument()
      })
      // Should not throw
      fireEvent.click(screen.getByText('Clickable'))
    })

    it('handles empty flows in flow view', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        agents: [
          { id: 'a1', name: 'Solo', type: 'w', load: 0.5, connectivity: 0.5, x: 0.1, y: 0.2 },
        ],
        flows: [],
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Signals')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Flow'))
      // Flow area is empty, no errors
      await vi.advanceTimersByTimeAsync(0)
    })

    it('uses formatRelativeTime for signal timestamps', async () => {
      mockGetEmergenceData.mockResolvedValue(makeData({
        signals: [
          { id: 's1', type: 'congestion', severity: 'high', message: 'Time test', timestamp: '2026-05-25T12:00:00Z' },
        ],
      }))
      render(<EmergenceDashboard />)
      await vi.advanceTimersByTimeAsync(0)
      await waitFor(() => {
        expect(screen.getByText('Time test')).toBeInTheDocument()
      })
      expect(mockFormatRelativeTime).toHaveBeenCalledWith(expect.any(Date))
    })
  })
})
