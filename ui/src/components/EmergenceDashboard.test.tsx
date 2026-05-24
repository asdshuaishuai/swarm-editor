import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { EmergenceDashboard } from './EmergenceDashboard'

const mockGetEmergenceData = vi.fn().mockResolvedValue(null)

vi.mock('../services', () => ({
  monitoringApi: {
    getEmergenceData: (...args: any[]) => mockGetEmergenceData(...args),
  },
}))

vi.mock('../utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  formatRelativeTime: (_d: Date) => 'just now',
}))

describe('EmergenceDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetEmergenceData.mockResolvedValue(null)
  })

  it('renders Swarm Monitor header', () => {
    render(<EmergenceDashboard />)
    expect(screen.getByText('Swarm Monitor')).toBeInTheDocument()
  })

  it('shows Analyzing spinner while loading', () => {
    mockGetEmergenceData.mockReturnValue(new Promise(() => {}))
    render(<EmergenceDashboard />)
    expect(screen.getByText('Analyzing...')).toBeInTheDocument()
  })

  it('renders view mode buttons', () => {
    render(<EmergenceDashboard />)
    expect(screen.getByText('Signals')).toBeInTheDocument()
    expect(screen.getByText('Network')).toBeInTheDocument()
    expect(screen.getByText('Flow')).toBeInTheDocument()
  })

  it('calls getEmergenceData on mount', async () => {
    mockGetEmergenceData.mockResolvedValue(null)
    render(<EmergenceDashboard />)
    await waitFor(() => {
      expect(mockGetEmergenceData).toHaveBeenCalled()
    })
  })

  it('handles fetch error gracefully', async () => {
    mockGetEmergenceData.mockRejectedValue(new Error('Network error'))
    render(<EmergenceDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Failed to load emergence data')).toBeInTheDocument()
    })
    expect(screen.getByText('Swarm Monitor')).toBeInTheDocument()
  })

  it('renders health score when data available', async () => {
    mockGetEmergenceData.mockResolvedValue({
      signals: [],
      health: { overallScore: 75, congestionLevel: 0.3, collaborationIndex: 0.8, innovationRate: 0.5, agentUtilization: 0.7 },
      agents: [],
      taskFlows: [],
    })
    render(<EmergenceDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Health')).toBeInTheDocument()
    })
  })
})
