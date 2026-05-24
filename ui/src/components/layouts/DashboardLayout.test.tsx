import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import DashboardLayout from './DashboardLayout'
import { useAppStore } from '../../store/appStore'

const mockAppStore = {
  agents: [],
  activeSwarm: null,
  connected: false,
  toasts: [],
}

vi.mock('../../store/appStore', () => ({
  useAppStore: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('lucide-react', () => {
  const MockIcon = (_props: any) => null
  const icons = ['Network','Activity','Cpu','TrendingUp','AlertTriangle','CheckCircle','Settings','Bell']
  const mod: Record<string, any> = {}
  for (const name of icons) mod[name] = MockIcon
  return mod
})

function mockStore(overrides: Partial<typeof mockAppStore> = {}) {
  const store = { ...mockAppStore, ...overrides }
  ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (sel?: (s: any) => any) => sel ? sel(store) : store
  )
}

describe('DashboardLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStore()
  })

  it('renders children', () => {
    render(<DashboardLayout><div data-testid="child">Hello</div></DashboardLayout>)
    expect(screen.getByTestId('child')).toBeTruthy()
  })

  it('shows Swarm Editor title', () => {
    render(<DashboardLayout><div/></DashboardLayout>)
    expect(screen.getByText('Swarm Editor')).toBeTruthy()
  })

  it('shows connected status when connected', () => {
    mockStore({ connected: true })
    render(<DashboardLayout><div/></DashboardLayout>)
    expect(screen.getByText('Connected')).toBeTruthy()
  })

  it('shows disconnected status when not connected', () => {
    mockStore({ connected: false })
    render(<DashboardLayout><div/></DashboardLayout>)
    expect(screen.getByText('Disconnected')).toBeTruthy()
  })

  it('shows active agent count', () => {
    mockStore({ agents: [{ state: 'executing' }, { state: 'thinking' }, { state: 'idle' }] as any })
    render(<DashboardLayout><div/></DashboardLayout>)
    // Active count = 2 (executing + thinking)
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('shows error agents when present', () => {
    mockStore({ agents: [{ state: 'error' }] as any })
    render(<DashboardLayout><div/></DashboardLayout>)
    expect(screen.getByText('Errors')).toBeTruthy()
  })

  it('does not show errors section when no errors', () => {
    mockStore({ agents: [{ state: 'idle' }] as any })
    render(<DashboardLayout><div/></DashboardLayout>)
    expect(screen.queryByText('Errors')).toBeNull()
  })

  it('shows active swarm in footer', () => {
    mockStore({ activeSwarm: { name: 'TestSwarm', topology: 'mesh', strategy: 'balanced' } as any })
    render(<DashboardLayout><div/></DashboardLayout>)
    expect(screen.getByText('TestSwarm')).toBeTruthy()
  })

  it('hides swarm info when no active swarm', () => {
    mockStore({ activeSwarm: null })
    render(<DashboardLayout><div/></DashboardLayout>)
    expect(screen.queryByText('System Healthy')).toBeTruthy()
  })

  it('shows notification badge when toasts exist', () => {
    mockStore({ toasts: [{ id: '1', message: 'test' }] as any })
    render(<DashboardLayout><div/></DashboardLayout>)
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('renders settings button', () => {
    render(<DashboardLayout><div/></DashboardLayout>)
    expect(screen.getByLabelText('Settings')).toBeTruthy()
  })
})
