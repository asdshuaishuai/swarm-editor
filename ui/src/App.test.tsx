import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

// Mock the store
vi.mock('./store/appStore', () => ({
  useAppStore: vi.fn(() => ({
    initialize: vi.fn(),
  })),
}))

// Mock child components
vi.mock('./components/layouts/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-layout">{children}</div>
  ),
}))

vi.mock('./panels/EditorPanel', () => ({
  default: () => <div data-testid="editor-panel">Editor</div>,
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

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders MainLayout', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )
    expect(screen.getByTestId('main-layout')).toBeInTheDocument()
  })

  it('renders EditorPanel on root route', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )
    expect(screen.getByTestId('editor-panel')).toBeInTheDocument()
  })

  it('renders SwarmPanel on /swarm route', () => {
    render(
      <MemoryRouter initialEntries={['/swarm']}>
        <App />
      </MemoryRouter>
    )
    expect(screen.getByTestId('swarm-panel')).toBeInTheDocument()
  })

  it('renders TeamPanel on /team route', () => {
    render(
      <MemoryRouter initialEntries={['/team']}>
        <App />
      </MemoryRouter>
    )
    expect(screen.getByTestId('team-panel')).toBeInTheDocument()
  })

  it('renders SettingsPanel on /settings route', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <App />
      </MemoryRouter>
    )
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument()
  })
})
