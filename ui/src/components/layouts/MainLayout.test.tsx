import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import MainLayout from './MainLayout'

// Mock child components
vi.mock('../Sidebar', () => ({
  default: () => <div data-testid="sidebar">Sidebar</div>,
}))

vi.mock('../StatusBar', () => ({
  default: () => <div data-testid="statusbar">StatusBar</div>,
}))

vi.mock('../AgentPanel', () => ({
  default: () => <div data-testid="agentpanel">AgentPanel</div>,
}))

describe('MainLayout', () => {
  it('renders children', () => {
    render(
      <MainLayout>
        <div data-testid="child">Test Content</div>
      </MainLayout>
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.getByText('Test Content')).toBeInTheDocument()
  })

  it('renders Sidebar', () => {
    render(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
  })

  it('renders StatusBar', () => {
    render(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    expect(screen.getByTestId('statusbar')).toBeInTheDocument()
  })

  it('renders AgentPanel', () => {
    render(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    expect(screen.getByTestId('agentpanel')).toBeInTheDocument()
  })

  it('has correct layout structure', () => {
    const { container } = render(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    )
    // Check for flex layout classes
    expect(container.firstChild).toHaveClass('flex', 'flex-col', 'h-screen')
  })
})
