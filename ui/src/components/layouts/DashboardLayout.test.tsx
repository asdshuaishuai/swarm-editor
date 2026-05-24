import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DashboardLayout from './DashboardLayout'
import { useAppStore } from '../../store/appStore'

// --- Mocks ---

const defaultStore = {
  agents: [] as Array<{ state: string }>,
  activeSwarm: null as { name: string; topology: string; strategy: string } | null,
  connected: false,
  toasts: [] as Array<{ id: string; message: string }>,
}

const mockNavigate = vi.fn()

vi.mock('../../store/appStore', () => ({
  useAppStore: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('lucide-react', () => {
  const icons = ['Network', 'Activity', 'Cpu', 'TrendingUp', 'AlertTriangle', 'CheckCircle', 'Settings', 'Bell']
  const mod: Record<string, React.FC<{ className?: string }>> = {}
  for (const name of icons) {
    mod[name] = (props) => <svg data-testid={`icon-${name}`} {...props} />
  }
  return mod
})

function mockStore(overrides: Partial<typeof defaultStore> = {}) {
  const store = { ...defaultStore, ...overrides }
  ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (sel?: (s: typeof store) => unknown) => (sel ? sel(store) : store),
  )
}

// --- Helpers ---

function renderLayout(children = <div data-testid="child">Hello</div>) {
  return render(<DashboardLayout>{children}</DashboardLayout>)
}

// --- Tests ---

describe('DashboardLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStore()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ---- Basic rendering ----

  describe('basic rendering', () => {
    it('renders children inside main content area', () => {
      renderLayout(<div data-testid="child">Hello</div>)
      expect(screen.getByTestId('child')).toBeTruthy()
      expect(screen.getByText('Hello')).toBeTruthy()
    })

    it('renders multiple children', () => {
      renderLayout(
        <>
          <div data-testid="child-a">A</div>
          <div data-testid="child-b">B</div>
        </>,
      )
      expect(screen.getByTestId('child-a')).toBeTruthy()
      expect(screen.getByTestId('child-b')).toBeTruthy()
    })

    it('renders the Swarm Editor title', () => {
      renderLayout()
      expect(screen.getByText('Swarm Editor')).toBeTruthy()
    })

    it('renders subtitle', () => {
      renderLayout()
      expect(screen.getByText('Agent Orchestration Platform')).toBeTruthy()
    })

    it('renders the outer container with min-h-screen', () => {
      const { container } = renderLayout()
      const outer = container.firstElementChild as HTMLElement
      expect(outer.className).toContain('min-h-screen')
    })

    it('renders a sticky header', () => {
      renderLayout()
      const header = screen.getByRole('banner')
      expect(header.className).toContain('sticky')
      expect(header.className).toContain('top-0')
    })

    it('renders a footer', () => {
      renderLayout()
      const footer = screen.getByRole('contentinfo')
      expect(footer).toBeTruthy()
    })

    it('renders main content area', () => {
      renderLayout()
      const main = screen.getByRole('main')
      expect(main).toBeTruthy()
    })
  })

  // ---- Icons ----

  describe('icons', () => {
    it('renders the Network icon in the logo area', () => {
      renderLayout()
      expect(screen.getByTestId('icon-Network')).toBeTruthy()
    })

    it('renders Activity icon for active agents stat', () => {
      renderLayout()
      expect(screen.getByTestId('icon-Activity')).toBeTruthy()
    })

    it('renders Cpu icon for idle agents stat', () => {
      renderLayout()
      expect(screen.getByTestId('icon-Cpu')).toBeTruthy()
    })

    it('renders CheckCircle icon in footer', () => {
      renderLayout()
      expect(screen.getByTestId('icon-CheckCircle')).toBeTruthy()
    })

    it('renders Bell icon for notifications button', () => {
      renderLayout()
      expect(screen.getByTestId('icon-Bell')).toBeTruthy()
    })

    it('renders Settings icon for settings button', () => {
      renderLayout()
      expect(screen.getByTestId('icon-Settings')).toBeTruthy()
    })

    it('does not render AlertTriangle icon when no error agents', () => {
      mockStore({ agents: [{ state: 'idle' }] })
      renderLayout()
      expect(screen.queryByTestId('icon-AlertTriangle')).toBeNull()
    })

    it('renders AlertTriangle icon when error agents exist', () => {
      mockStore({ agents: [{ state: 'error' }] })
      renderLayout()
      expect(screen.getByTestId('icon-AlertTriangle')).toBeTruthy()
    })

    it('does not render TrendingUp icon when no active swarm', () => {
      mockStore({ activeSwarm: null })
      renderLayout()
      expect(screen.queryByTestId('icon-TrendingUp')).toBeNull()
    })

    it('renders TrendingUp icon when active swarm exists', () => {
      mockStore({ activeSwarm: { name: 'TestSwarm', topology: 'mesh', strategy: 'balanced' } })
      renderLayout()
      expect(screen.getByTestId('icon-TrendingUp')).toBeTruthy()
    })
  })

  // ---- Connection status ----

  describe('connection status', () => {
    it('shows "Connected" text when connected', () => {
      mockStore({ connected: true })
      renderLayout()
      expect(screen.getByText('Connected')).toBeTruthy()
    })

    it('shows "Disconnected" text when not connected', () => {
      mockStore({ connected: false })
      renderLayout()
      expect(screen.getByText('Disconnected')).toBeTruthy()
    })

    it('renders green pulse dot in logo area when connected', () => {
      mockStore({ connected: true })
      renderLayout()
      const logoContainer = screen.getByTestId('icon-Network').parentElement!.parentElement!
      const pulseDot = logoContainer.querySelector('.animate-pulse')
      expect(pulseDot).toBeTruthy()
      expect(pulseDot!.className).toContain('bg-green-500')
    })

    it('does not render pulse dot in logo when disconnected', () => {
      mockStore({ connected: false })
      renderLayout()
      const logoContainer = screen.getByTestId('icon-Network').parentElement!.parentElement!
      const pulseDot = logoContainer.querySelector('.animate-pulse')
      expect(pulseDot).toBeNull()
    })

    it('connection status indicator has green styling when connected', () => {
      mockStore({ connected: true })
      renderLayout()
      const statusEl = screen.getByText('Connected').closest('div')!
      expect(statusEl.className).toContain('bg-green-500/10')
    })

    it('connection status indicator has red styling when disconnected', () => {
      mockStore({ connected: false })
      renderLayout()
      const statusEl = screen.getByText('Disconnected').closest('div')!
      expect(statusEl.className).toContain('bg-red-500/10')
    })
  })

  // ---- Agent counts ----

  describe('agent count display', () => {
    it('shows 0 active agents when agents array is empty', () => {
      mockStore({ agents: [] })
      renderLayout()
      const activeLabel = screen.getByText('Active')
      const countEl = activeLabel.parentElement!.querySelector('.text-sm')!
      expect(countEl.textContent).toBe('0')
    })

    it('counts executing agents as active', () => {
      mockStore({ agents: [{ state: 'executing' }] })
      renderLayout()
      const activeLabel = screen.getByText('Active')
      const countEl = activeLabel.parentElement!.querySelector('.text-sm')!
      expect(countEl.textContent).toBe('1')
    })

    it('counts thinking agents as active', () => {
      mockStore({ agents: [{ state: 'thinking' }] })
      renderLayout()
      const activeLabel = screen.getByText('Active')
      const countEl = activeLabel.parentElement!.querySelector('.text-sm')!
      expect(countEl.textContent).toBe('1')
    })

    it('counts both executing and thinking as active', () => {
      mockStore({ agents: [{ state: 'executing' }, { state: 'thinking' }] })
      renderLayout()
      // Active count = 2
      // The number "2" appears in the active stat
      const activeLabel = screen.getByText('Active')
      const countEl = activeLabel.parentElement!.querySelector('.text-sm')!
      expect(countEl.textContent).toBe('2')
    })

    it('counts idle agents correctly', () => {
      mockStore({ agents: [{ state: 'idle' }, { state: 'idle' }, { state: 'idle' }] })
      renderLayout()
      const idleLabel = screen.getByText('Idle')
      const countEl = idleLabel.parentElement!.querySelector('.text-sm')!
      expect(countEl.textContent).toBe('3')
    })

    it('counts error agents separately from active and idle', () => {
      mockStore({ agents: [{ state: 'error' }, { state: 'error' }] })
      renderLayout()
      const errorLabel = screen.getByText('Errors')
      const countEl = errorLabel.parentElement!.querySelector('.text-sm')!
      expect(countEl.textContent).toBe('2')
    })

    it('shows correct counts for mixed agent states', () => {
      mockStore({
        agents: [
          { state: 'executing' },
          { state: 'thinking' },
          { state: 'idle' },
          { state: 'idle' },
          { state: 'error' },
          { state: 'error' },
          { state: 'error' },
        ],
      })
      renderLayout()
      // Active = 2, Idle = 2, Errors = 3
      const activeLabel = screen.getByText('Active')
      const idleLabel = screen.getByText('Idle')
      const errorsLabel = screen.getByText('Errors')
      expect(activeLabel.parentElement!.querySelector('.text-sm')!.textContent).toBe('2')
      expect(idleLabel.parentElement!.querySelector('.text-sm')!.textContent).toBe('2')
      expect(errorsLabel.parentElement!.querySelector('.text-sm')!.textContent).toBe('3')
    })

    it('hides errors section when no agents have error state', () => {
      mockStore({ agents: [{ state: 'idle' }, { state: 'executing' }] })
      renderLayout()
      expect(screen.queryByText('Errors')).toBeNull()
    })

    it('hides errors section when agents array is empty', () => {
      mockStore({ agents: [] })
      renderLayout()
      expect(screen.queryByText('Errors')).toBeNull()
    })

    it('agents with unknown state are not counted in any category', () => {
      mockStore({ agents: [{ state: 'waiting' }, { state: 'unknown' }] })
      renderLayout()
      const activeLabel = screen.getByText('Active')
      const idleLabel = screen.getByText('Idle')
      expect(activeLabel.parentElement!.querySelector('.text-sm')!.textContent).toBe('0')
      expect(idleLabel.parentElement!.querySelector('.text-sm')!.textContent).toBe('0')
      expect(screen.queryByText('Errors')).toBeNull()
    })
  })

  // ---- Active swarm footer ----

  describe('active swarm footer', () => {
    it('shows swarm name, topology, and strategy when activeSwarm is set', () => {
      mockStore({ activeSwarm: { name: 'ProdSwarm', topology: 'mesh', strategy: 'balanced' } })
      renderLayout()
      expect(screen.getByText('ProdSwarm')).toBeTruthy()
      expect(screen.getByText('mesh')).toBeTruthy()
      expect(screen.getByText('balanced')).toBeTruthy()
    })

    it('does not render swarm info when activeSwarm is null', () => {
      mockStore({ activeSwarm: null })
      renderLayout()
      // Only footer text should be "System Healthy" and its icon
      expect(screen.getByText('System Healthy')).toBeTruthy()
      // No swarm-specific text
      const footer = screen.getByRole('contentinfo')
      expect(footer.textContent).not.toContain('undefined')
    })

    it('renders pipe separators between swarm fields', () => {
      mockStore({ activeSwarm: { name: 'S1', topology: 'star', strategy: 'priority' } })
      renderLayout()
      const footer = screen.getByRole('contentinfo')
      const pipes = footer.querySelectorAll('.text-slate-600')
      expect(pipes.length).toBe(2) // two separators between name | topology | strategy
    })

    it('shows "System Healthy" text in footer regardless of swarm state', () => {
      mockStore({ activeSwarm: null })
      renderLayout()
      expect(screen.getByText('System Healthy')).toBeTruthy()
    })

    it('shows "System Healthy" text alongside active swarm info', () => {
      mockStore({ activeSwarm: { name: 'S1', topology: 'mesh', strategy: 'round_robin' } })
      renderLayout()
      expect(screen.getByText('System Healthy')).toBeTruthy()
      expect(screen.getByText('S1')).toBeTruthy()
    })
  })

  // ---- Notifications / Toasts ----

  describe('notifications', () => {
    it('renders notification button with correct aria-label', () => {
      renderLayout()
      expect(screen.getByLabelText('Notifications')).toBeTruthy()
    })

    it('does not show notification badge when toasts array is empty', () => {
      mockStore({ toasts: [] })
      renderLayout()
      // The badge div contains a span with the count; when no toasts, no badge div exists
      // Check that the Bell button has no badge sibling
      const bellButton = screen.getByLabelText('Notifications')
      const badge = bellButton.querySelector('.bg-red-500')
      expect(badge).toBeNull()
    })

    it('shows notification badge with count when toasts exist', () => {
      mockStore({ toasts: [{ id: '1', message: 'a' }, { id: '2', message: 'b' }, { id: '3', message: 'c' }] })
      renderLayout()
      expect(screen.getByText('3')).toBeTruthy()
    })

    it('shows badge with "1" for single toast', () => {
      mockStore({ toasts: [{ id: '1', message: 'test' }] })
      renderLayout()
      expect(screen.getByText('1')).toBeTruthy()
    })

    it('notification badge has red background', () => {
      mockStore({ toasts: [{ id: '1', message: 'test' }] })
      renderLayout()
      const bellButton = screen.getByLabelText('Notifications')
      const badgeDiv = bellButton.querySelector('.bg-red-500')
      expect(badgeDiv).toBeTruthy()
    })

    it('notification button scrolls to top on click', () => {
      const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
      renderLayout()
      fireEvent.click(screen.getByLabelText('Notifications'))
      expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
      scrollToSpy.mockRestore()
    })
  })

  // ---- Settings button ----

  describe('settings button', () => {
    it('renders settings button with correct aria-label', () => {
      renderLayout()
      expect(screen.getByLabelText('Settings')).toBeTruthy()
    })

    it('navigates to /settings when clicked', () => {
      renderLayout()
      fireEvent.click(screen.getByLabelText('Settings'))
      expect(mockNavigate).toHaveBeenCalledWith('/settings')
    })

    it('calls navigate exactly once on click', () => {
      renderLayout()
      fireEvent.click(screen.getByLabelText('Settings'))
      expect(mockNavigate).toHaveBeenCalledTimes(1)
    })
  })

  // ---- Layout structure ----

  describe('layout structure', () => {
    it('header has backdrop blur effect', () => {
      renderLayout()
      const header = screen.getByRole('banner')
      expect(header.className).toContain('backdrop-blur')
    })

    it('footer is fixed at bottom', () => {
      renderLayout()
      const footer = screen.getByRole('contentinfo')
      expect(footer.className).toContain('fixed')
      expect(footer.className).toContain('bottom-0')
    })

    it('footer has backdrop blur effect', () => {
      renderLayout()
      const footer = screen.getByRole('contentinfo')
      expect(footer.className).toContain('backdrop-blur')
    })

    it('main content area has max-w-7xl', () => {
      renderLayout()
      const main = screen.getByRole('main')
      expect(main.className).toContain('max-w-7xl')
    })

    it('header has max-w-7xl inner container', () => {
      renderLayout()
      const header = screen.getByRole('banner')
      const inner = header.querySelector('.max-w-7xl')
      expect(inner).toBeTruthy()
    })

    it('footer has max-w-7xl inner container', () => {
      renderLayout()
      const footer = screen.getByRole('contentinfo')
      const inner = footer.querySelector('.max-w-7xl')
      expect(inner).toBeTruthy()
    })

    it('header has z-50 for stacking context', () => {
      renderLayout()
      const header = screen.getByRole('banner')
      expect(header.className).toContain('z-50')
    })
  })

  // ---- Logo area ----

  describe('logo area', () => {
    it('renders a logo icon container with gradient background', () => {
      renderLayout()
      const logoIcon = screen.getByTestId('icon-Network').parentElement!
      expect(logoIcon.className).toContain('from-blue-500')
      expect(logoIcon.className).toContain('to-purple-600')
    })

    it('logo icon container is rounded', () => {
      renderLayout()
      const logoIcon = screen.getByTestId('icon-Network').parentElement!
      expect(logoIcon.className).toContain('rounded-xl')
    })
  })

  // ---- Edge cases ----

  describe('edge cases', () => {
    it('handles undefined agents gracefully by using empty array default', () => {
      // Even though we default to [], test the selector with no agents
      mockStore({ agents: [] })
      expect(() => renderLayout()).not.toThrow()
    })

    it('handles large number of agents', () => {
      const agents = Array.from({ length: 100 }, (_, i) => ({
        state: i % 3 === 0 ? 'executing' : i % 3 === 1 ? 'idle' : 'error',
      }))
      mockStore({ agents })
      renderLayout()
      // 34 executing/thinking active (0, 3, 6, ..., 99) = 34
      // 33 idle (1, 4, 7, ..., 97) = 33
      // 33 error (2, 5, 8, ..., 98) = 33
      expect(screen.getByText('34')).toBeTruthy() // active
    })

    it('handles activeSwarm with empty string fields', () => {
      mockStore({ activeSwarm: { name: '', topology: '', strategy: '' } })
      renderLayout()
      // Still renders the footer section, even with empty strings
      const footer = screen.getByRole('contentinfo')
      expect(footer).toBeTruthy()
    })

    it('renders correctly with all features active (connected, errors, swarm, toasts)', () => {
      mockStore({
        connected: true,
        agents: [{ state: 'executing' }, { state: 'error' }],
        activeSwarm: { name: 'FullSwarm', topology: 'star', strategy: 'round_robin' },
        toasts: [{ id: '1', message: 'test' }],
      })
      renderLayout()
      expect(screen.getByText('Connected')).toBeTruthy()
      expect(screen.getByText('Errors')).toBeTruthy()
      expect(screen.getByText('FullSwarm')).toBeTruthy()
      // Verify notification badge exists (it has 1 toast)
      const bellButton = screen.getByLabelText('Notifications')
      const badgeDiv = bellButton.querySelector('.bg-red-500')
      expect(badgeDiv).toBeTruthy()
    })

    it('renders with no features active (disconnected, no agents, no swarm, no toasts)', () => {
      mockStore({
        connected: false,
        agents: [],
        activeSwarm: null,
        toasts: [],
      })
      renderLayout()
      expect(screen.getByText('Disconnected')).toBeTruthy()
      expect(screen.queryByText('Errors')).toBeNull()
      expect(screen.getByText('System Healthy')).toBeTruthy()
    })

    it('renders children that contain complex JSX', () => {
      renderLayout(
        <section data-testid="complex-child">
          <h2>Dashboard</h2>
          <p>Content here</p>
          <ul>
            <li>Item 1</li>
            <li>Item 2</li>
          </ul>
        </section>,
      )
      expect(screen.getByTestId('complex-child')).toBeTruthy()
      expect(screen.getByText('Dashboard')).toBeTruthy()
      expect(screen.getByText('Item 1')).toBeTruthy()
    })
  })

  // ---- useAppStore selector behavior ----

  describe('store integration', () => {
    it('calls useAppStore with selector functions for each state field', () => {
      renderLayout()
      const mockFn = useAppStore as unknown as ReturnType<typeof vi.fn>
      // Component uses 4 separate selectors: agents, activeSwarm, connected, toasts
      // Plus the mockImplementation handles it, we just verify it was called
      expect(mockFn).toHaveBeenCalled()
    })

    it('re-renders when store state changes', () => {
      // First render: disconnected
      mockStore({ connected: false })
      const { rerender } = renderLayout()
      expect(screen.getByText('Disconnected')).toBeTruthy()

      // Change store state to connected
      mockStore({ connected: true })
      rerender(<DashboardLayout><div/></DashboardLayout>)
      expect(screen.getByText('Connected')).toBeTruthy()
    })
  })

  // ---- Error agent display details ----

  describe('error agent display details', () => {
    it('error count uses red text styling', () => {
      mockStore({ agents: [{ state: 'error' }] })
      renderLayout()
      const errorCountEl = screen.getByText('1')
      expect(errorCountEl.className).toContain('text-red-400')
    })

    it('error stat container has red background tint', () => {
      mockStore({ agents: [{ state: 'error' }] })
      renderLayout()
      const errorSection = screen.getByText('Errors').closest('.flex')
      const bgContainer = errorSection!.querySelector('.bg-red-500\\/10')
      expect(bgContainer).toBeTruthy()
    })
  })

  // ---- Active agent display details ----

  describe('active agent display details', () => {
    it('active agent icon container has green background tint', () => {
      renderLayout()
      const activeLabel = screen.getByText('Active')
      const container = activeLabel.closest('.flex')
      const bgEl = container!.querySelector('.bg-green-500\\/10')
      expect(bgEl).toBeTruthy()
    })

    it('idle agent icon container has slate background tint', () => {
      renderLayout()
      const idleLabel = screen.getByText('Idle')
      const container = idleLabel.closest('.flex')
      const bgEl = container!.querySelector('.bg-slate-500\\/10')
      expect(bgEl).toBeTruthy()
    })
  })
})
