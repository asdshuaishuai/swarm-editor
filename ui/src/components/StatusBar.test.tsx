import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import StatusBar from './StatusBar'
import { useAppStore } from '../store/appStore'

vi.mock('../store/appStore', () => ({
  useAppStore: vi.fn(),
}))

// Helper to create complete mock state (R5029: tests were missing properties)
const createMockState = (overrides: Partial<ReturnType<typeof useAppStore>> = {}) => ({
  connected: true,
  connecting: false,
  agents: [],
  activeSwarm: null,
  activeTeam: null,
  notificationHistory: [],
  clearNotificationHistory: vi.fn(),
  editorCursorPosition: null,
  editorSelection: null,
  editorLanguage: 'plaintext',
  editorEncoding: 'UTF-8',
  editorIndent: { type: 'spaces', size: 2 },
  editorLineEnding: 'lf' as 'lf' | 'crlf',
  workspaceProblems: [],
  ...overrides,
})

const mockAppStore = (state: ReturnType<typeof createMockState>) => {
  ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector) => {
    return selector ? selector(state) : state
  })
}

describe('StatusBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAppStore(createMockState())
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
    expect(screen.getByText('0 agents')).toBeInTheDocument()
  })

  it('does not show swarm info when no active swarm', () => {
    render(<StatusBar />)
    expect(screen.queryByText('Test Swarm')).not.toBeInTheDocument()
  })

  it('does not show team info when no active team', () => {
    render(<StatusBar />)
    expect(screen.queryByText('Test Team')).not.toBeInTheDocument()
  })
})

describe('StatusBar connection states', () => {
  it('shows connecting state', () => {
    mockAppStore(createMockState({ connecting: true, connected: false }))
    render(<StatusBar />)
    expect(screen.getByText('Connecting...')).toBeInTheDocument()
  })

  it('shows disconnected state', () => {
    mockAppStore(createMockState({ connected: false }))
    render(<StatusBar />)
    expect(screen.getByText('Disconnected')).toBeInTheDocument()
  })
})

describe('StatusBar with active sessions', () => {
  it('shows active swarm name', () => {
    mockAppStore(createMockState({ activeSwarm: { id: '1', name: 'Test Swarm' } }))
    render(<StatusBar />)
    expect(screen.getByText('Test Swarm')).toBeInTheDocument()
  })

  it('shows active team name', () => {
    mockAppStore(createMockState({ activeTeam: { id: '1', name: 'Test Team' } }))
    render(<StatusBar />)
    expect(screen.getByText('Test Team')).toBeInTheDocument()
  })

  it('shows agent count', () => {
    mockAppStore(createMockState({ agents: [{ id: '1' }, { id: '2' }] }))
    render(<StatusBar />)
    expect(screen.getByText('2 agents')).toBeInTheDocument()
  })
})
