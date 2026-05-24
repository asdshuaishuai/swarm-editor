import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

// Mock the store
vi.mock('./store/appStore', () => ({
  useAppStore: vi.fn((selector?: (state: unknown) => unknown) => {
    const state = {
      initialize: vi.fn(),
      toasts: [] as unknown[],
      removeToast: vi.fn(),
    }
    return selector ? selector(state) : state
  }),
}))

// Mock hooks
vi.mock('./hooks', () => ({
  useACPEvents: vi.fn(),
  useTheme: vi.fn(() => ({
    theme: 'dark',
    effectiveTheme: 'dark',
    setTheme: vi.fn(),
    toggleTheme: vi.fn(),
    isDark: true,
  })),
}))

// Mock MainLayout — now renders without children (it has its own content)
vi.mock('./components/layouts/MainLayout', () => ({
  default: () => <div data-testid="main-layout">MainLayout</div>,
}))

// Mock lazy loaded panels
vi.mock('./panels/SettingsPanel', () => ({
  default: () => <div data-testid="settings-panel">Settings</div>,
}))

vi.mock('./components/Toast', () => ({
  ToastContainer: ({ toasts }: { toasts: unknown[] }) => (
    <div data-testid="toast-container">{toasts.length} toasts</div>
  ),
}))

vi.mock('./components/PermissionDialog', () => ({
  PermissionDialog: () => <div data-testid="permission-dialog" />,
  PermissionQueueIndicator: () => <div data-testid="permission-queue-indicator" />,
}))

vi.mock('./components/CommandPalette', () => ({
  CommandPalette: () => <div data-testid="command-palette" />,
}))

vi.mock('./components/SearchPanel', () => ({
  SearchPanel: () => <div data-testid="search-panel" />,
}))

vi.mock('./components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('./components/StatusBar', () => ({
  default: () => <div data-testid="status-bar" />,
}))

vi.mock('./components/HandoffDialog', () => ({
  useHandoffStore: vi.fn(() => ({
    activeHandoff: null,
    resolveHandoff: vi.fn(),
    clearActiveHandoff: vi.fn(),
  })),
  HandoffDialog: () => <div data-testid="handoff-dialog" />,
}))

vi.mock('./components/TabSwitcher', () => ({
  TabSwitcher: () => <div data-testid="tab-switcher" />,
}))

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders MainLayout on root route', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      )
    })
    expect(screen.getByTestId('main-layout')).toBeInTheDocument()
  })

  it('renders MainLayout on /editor route', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/editor']}>
          <App />
        </MemoryRouter>
      )
    })
    expect(screen.getByTestId('main-layout')).toBeInTheDocument()
  })

  it('renders MainLayout on /swarm route', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/swarm']}>
          <App />
        </MemoryRouter>
      )
    })
    expect(screen.getByTestId('main-layout')).toBeInTheDocument()
  })

  it('renders SettingsPanel on /settings route', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/settings']}>
          <App />
        </MemoryRouter>
      )
    })
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument()
  })

  it('renders global components (status bar, command palette, etc)', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <App />
        </MemoryRouter>
      )
    })
    expect(screen.getByTestId('status-bar')).toBeInTheDocument()
    expect(screen.getByTestId('command-palette')).toBeInTheDocument()
    expect(screen.getByTestId('tab-switcher')).toBeInTheDocument()
  })
})
