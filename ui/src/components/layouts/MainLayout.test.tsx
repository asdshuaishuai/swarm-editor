import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import MainLayout from './MainLayout'

// Mock the store
vi.mock('../../store/appStore', () => ({
  useAppStore: vi.fn((selector?: (state: unknown) => unknown) => {
    const state = {
      agents: [
        { id: 'claude-code', name: 'Claude Code', type: 'coder', state: 'idle' },
        { id: 'kimi-code', name: 'Kimi Code', type: 'coder', state: 'idle' },
      ],
      zenMode: false,
      initialize: vi.fn(),
      toasts: [],
      removeToast: vi.fn(),
    }
    return selector ? selector(state) : state
  }),
}))

// Mock services
vi.mock('../../services', () => ({
  api: {
    agent: {
      getAgents: vi.fn().mockResolvedValue([
        { id: 'claude-code', name: 'Claude Code', state: 'idle' },
        { id: 'kimi-code', name: 'Kimi Code', state: 'idle' },
      ]),
    },
  },
}))

// Helper to render with Router
const renderWithRouter = (ui: React.ReactElement) => {
  return render(
    <BrowserRouter>
      {ui}
    </BrowserRouter>
  )
}

describe('MainLayout', () => {
  it('renders children', () => {
    renderWithRouter(
      <MainLayout>
        <div data-testid="child">Test Content</div>
      </MainLayout>
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.getByText('Test Content')).toBeInTheDocument()
  })

  it('has correct layout structure with flex classes', () => {
    const { container } = renderWithRouter(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    expect(container.firstChild).toHaveClass('flex', 'flex-col', 'h-screen')
  })

  it('renders app title in header', () => {
    renderWithRouter(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    expect(screen.getByText('Swarm Editor')).toBeInTheDocument()
  })

  it('renders AgentCluster in left panel', () => {
    renderWithRouter(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    // AgentCluster shows agent names from mocked store
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
  })

  it('renders CodeObserver in right panel', () => {
    renderWithRouter(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    // CodeObserver has tabs
    expect(screen.getByText('变更文件')).toBeInTheDocument()
  })

  it('collapses left panel when toggle is clicked', () => {
    renderWithRouter(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )

    const toggleBtn = screen.getByLabelText('切换左侧面板')
    fireEvent.click(toggleBtn)

    // AgentCluster should no longer be visible
    expect(screen.queryByText('Claude Code')).not.toBeInTheDocument()
  })

  it('collapses right panel when toggle is clicked', () => {
    renderWithRouter(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )

    const toggleBtn = screen.getByLabelText('切换右侧面板')
    fireEvent.click(toggleBtn)

    // CodeObserver should no longer be visible
    expect(screen.queryByText('变更文件')).not.toBeInTheDocument()
  })

  it('always renders center content area', () => {
    renderWithRouter(
      <MainLayout>
        <div data-testid="center">Center Content</div>
      </MainLayout>
    )

    expect(screen.getByTestId('center')).toBeInTheDocument()
  })
})
