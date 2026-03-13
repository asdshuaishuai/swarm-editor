import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import StatusBar from './StatusBar'
import { useAppStore } from '../store/appStore'

vi.mock('../store/appStore', () => ({
  useAppStore: vi.fn(),
}))

describe('StatusBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        connected: true,
        connecting: false,
        agents: [],
        activeSwarm: null,
        activeTeam: null,
      }
      return selector ? selector(state) : state
    })
  })

  it('renders connection status when connected', () => {
    render(<StatusBar />)
    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it('renders version number', () => {
    render(<StatusBar />)
    expect(screen.getByText('v0.1.0')).toBeInTheDocument()
  })

  it('renders agent count', () => {
    render(<StatusBar />)
    expect(screen.getByText('Agents: 0')).toBeInTheDocument()
  })

  it('does not show swarm info when no active swarm', () => {
    render(<StatusBar />)
    expect(screen.queryByText('Swarm:')).not.toBeInTheDocument()
  })

  it('does not show team info when no active team', () => {
    render(<StatusBar />)
    expect(screen.queryByText('Team:')).not.toBeInTheDocument()
  })
})

describe('StatusBar connection states', () => {
  it('shows connecting state', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        connected: false,
        connecting: true,
        agents: [],
        activeSwarm: null,
        activeTeam: null,
      }
      return selector ? selector(state) : state
    })
    render(<StatusBar />)
    expect(screen.getByText('Connecting...')).toBeInTheDocument()
  })

  it('shows disconnected state', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        connected: false,
        connecting: false,
        agents: [],
        activeSwarm: null,
        activeTeam: null,
      }
      return selector ? selector(state) : state
    })
    render(<StatusBar />)
    expect(screen.getByText('Disconnected')).toBeInTheDocument()
  })
})

describe('StatusBar with active sessions', () => {
  it('shows active swarm name', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        connected: true,
        connecting: false,
        agents: [],
        activeSwarm: { id: '1', name: 'Test Swarm' },
        activeTeam: null,
      }
      return selector ? selector(state) : state
    })
    render(<StatusBar />)
    expect(screen.getByText('Swarm:')).toBeInTheDocument()
    expect(screen.getByText('Test Swarm')).toBeInTheDocument()
  })

  it('shows active team name', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        connected: true,
        connecting: false,
        agents: [],
        activeSwarm: null,
        activeTeam: { id: '1', name: 'Test Team' },
      }
      return selector ? selector(state) : state
    })
    render(<StatusBar />)
    expect(screen.getByText('Team:')).toBeInTheDocument()
    expect(screen.getByText('Test Team')).toBeInTheDocument()
  })

  it('shows agent count', () => {
    ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
      const state = {
        connected: true,
        connecting: false,
        agents: [{ id: '1' }, { id: '2' }],
        activeSwarm: null,
        activeTeam: null,
      }
      return selector ? selector(state) : state
    })
    render(<StatusBar />)
    expect(screen.getByText('Agents: 2')).toBeInTheDocument()
  })
})