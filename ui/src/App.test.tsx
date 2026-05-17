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

// Mock child components
vi.mock('./components/layouts/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-layout">{children}</div>
  ),
}))

// Mock lazy loaded panels - 返回完整的 mock 组件
vi.mock('./panels/EditorPanel', () => ({
  default: () => <div data-testid="editor-panel">Editor</div>,
}))

vi.mock('./panels/AgentCollaborationPanel', () => ({
  AgentCollaborationPanel: () => <div data-testid="agent-collaboration-panel">Agent Collaboration</div>,
}))

vi.mock('./panels/SwarmPanel', () => ({
  default: () => <div data-testid="swarm-panel">Swarm</div>,
}))

vi.mock('./panels/TeamPanel', () => ({
  default: () => <div data-testid="team-panel">Team</div>,
}))

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

  it('renders MainLayout', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <App />
        </MemoryRouter>
      )
    })
    expect(screen.getByTestId('main-layout')).toBeInTheDocument()
  })

  it('renders AgentCollaborationPanel on root route', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      )
    })
    expect(screen.getByTestId('agent-collaboration-panel')).toBeInTheDocument()
  })

  it('renders EditorPanel on /editor route', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/editor']}>
          <App />
        </MemoryRouter>
      )
    })
    expect(screen.getByTestId('editor-panel')).toBeInTheDocument()
  })

  it('renders SwarmPanel on /swarm route', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/swarm']}>
          <App />
        </MemoryRouter>
      )
    })
    expect(screen.getByTestId('swarm-panel')).toBeInTheDocument()
  })

  it('renders TeamPanel on /team route', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/team']}>
          <App />
        </MemoryRouter>
      )
    })
    expect(screen.getByTestId('team-panel')).toBeInTheDocument()
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
})
