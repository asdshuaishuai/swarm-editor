import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import MainLayout from './MainLayout'

// Mock child components with factory functions
vi.mock('../../panels/WorktreePanel', () => ({
  __esModule: true,
  WorktreePanel: () => <div data-testid="worktree-panel">WorktreePanel</div>,
  default: () => <div data-testid="worktree-panel">WorktreePanel</div>,
}))

vi.mock('../../panels/SupervisorPanel', () => ({
  __esModule: true,
  SupervisorPanel: () => <div data-testid="supervisor-panel">SupervisorPanel</div>,
  default: () => <div data-testid="supervisor-panel">SupervisorPanel</div>,
}))

vi.mock('../../panels/BottomTabPanel', () => ({
  __esModule: true,
  BottomTabPanel: () => <div data-testid="bottom-tab-panel">BottomTabPanel</div>,
  default: () => <div data-testid="bottom-tab-panel">BottomTabPanel</div>,
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

  it('renders WorktreePanel on left', () => {
    renderWithRouter(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    expect(screen.getByTestId('worktree-panel')).toBeInTheDocument()
  })

  it('renders SupervisorPanel on right', () => {
    renderWithRouter(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    expect(screen.getByTestId('supervisor-panel')).toBeInTheDocument()
  })

  it('renders BottomTabPanel at bottom', () => {
    renderWithRouter(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    expect(screen.getByTestId('bottom-tab-panel')).toBeInTheDocument()
  })

  it('has correct layout structure with flex classes', () => {
    const { container } = renderWithRouter(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    // Check for flex layout classes on root
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

  it('collapses left panel when toggle is clicked', () => {
    renderWithRouter(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )

    const toggleBtn = screen.getByLabelText('Toggle Worktree Panel')
    fireEvent.click(toggleBtn)

    // Worktree panel should no longer be visible
    expect(screen.queryByTestId('worktree-panel')).not.toBeInTheDocument()
  })

  it('collapses right panel when toggle is clicked', () => {
    renderWithRouter(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )

    const toggleBtn = screen.getByLabelText('Toggle Supervisor Panel')
    fireEvent.click(toggleBtn)

    expect(screen.queryByTestId('supervisor-panel')).not.toBeInTheDocument()
  })

  it('collapses bottom panel when toggle is clicked', () => {
    renderWithRouter(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )

    const toggleBtn = screen.getByLabelText('Toggle Bottom Panel')
    fireEvent.click(toggleBtn)

    expect(screen.queryByTestId('bottom-tab-panel')).not.toBeInTheDocument()
  })
})