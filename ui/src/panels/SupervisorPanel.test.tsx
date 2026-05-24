import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SupervisorPanel } from './SupervisorPanel'

// Mock services
vi.mock('../services', () => ({
  api: {
    agent: {
      getAgents: vi.fn().mockResolvedValue([
        { id: 'agent-1', name: 'test-agent', type: 'worker', status: 'idle', command: '', capabilities: [] },
      ]),
    },
    swarm: {
      getSwarms: vi.fn().mockResolvedValue([]),
      getSwarmTasks: vi.fn().mockResolvedValue([]),
    },
    monitoring: {
      getSupervisorStats: vi.fn().mockResolvedValue(null),
      listAuditEvents: vi.fn().mockResolvedValue([]),
      getAuditStats: vi.fn().mockResolvedValue(null),
      getScheduleRunnerStatus: vi.fn().mockResolvedValue(null),
    },
  },
  events: {
    subscribe: vi.fn().mockReturnValue(() => {}),
  },
}))

// Mock handoff store
vi.mock('../stores/handoffStore', () => ({
  useHandoffStore: vi.fn(() => ({
    activeHandoff: null,
    resolveHandoff: vi.fn(),
  })),
}))

describe('SupervisorPanel', () => {
  it('renders supervisor panel header', () => {
    render(<SupervisorPanel />)
    expect(screen.getByText('Supervisor')).toBeInTheDocument()
  })

  it('shows health section', () => {
    render(<SupervisorPanel />)
    expect(screen.getByText('Health')).toBeInTheDocument()
  })

  it('shows tasks section', () => {
    render(<SupervisorPanel />)
    expect(screen.getByText('Tasks')).toBeInTheDocument()
  })

  it('shows review queue section', () => {
    render(<SupervisorPanel />)
    expect(screen.getByText('Review Queue')).toBeInTheDocument()
  })

  it('shows activity section', () => {
    render(<SupervisorPanel />)
    expect(screen.getByText('Activity')).toBeInTheDocument()
  })

  it('renders quick action buttons', () => {
    render(<SupervisorPanel />)
    expect(screen.getByText('Pause All')).toBeInTheDocument()
    expect(screen.getByText('Refresh')).toBeInTheDocument()
  })
})