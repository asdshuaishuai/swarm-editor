import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BottomTabPanel } from './BottomTabPanel'

// Mock dependencies
vi.mock('./AgentDispatchPanel', () => ({
  AgentDispatchPanel: () => <div data-testid="agent-dispatch-panel">AgentDispatchPanel</div>,
}))

describe('BottomTabPanel', () => {
  it('renders with default agents tab active', () => {
    render(<BottomTabPanel />)
    expect(screen.getByTestId('agent-dispatch-panel')).toBeInTheDocument()
  })

  it('renders both tab labels', () => {
    render(<BottomTabPanel />)
    expect(screen.getByText('Agents')).toBeInTheDocument()
    expect(screen.getByText('Console')).toBeInTheDocument()
  })

  it('switches to console tab when clicked', async () => {
    const { user } = await import('@testing-library/user-event').then(m => ({ user: m.default.setup() }))
    render(<BottomTabPanel />)

    await user.click(screen.getByText('Console'))
    // Console tab should now be active, showing console panel
    expect(screen.getByPlaceholderText('Enter command...')).toBeInTheDocument()
  })

  it('applies custom height', () => {
    const { container } = render(<BottomTabPanel height={300} />)
    expect(container.firstChild).toHaveStyle({ height: '300px' })
  })
})