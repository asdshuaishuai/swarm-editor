import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AgentManagementPanel } from './AgentManagementPanel'

// Mock child components
vi.mock('../components/AgentConnectionPanel', () => ({
  AgentConnectionPanel: () => <div data-testid="connection-panel">AgentConnectionPanel</div>,
}))

vi.mock('../components/AgentSessionPanel', () => ({
  AgentSessionPanel: () => <div data-testid="session-panel">AgentSessionPanel</div>,
}))

describe('AgentManagementPanel', () => {
  it('renders with connections tab active by default', () => {
    render(<AgentManagementPanel />)
    expect(screen.getByTestId('connection-panel')).toBeInTheDocument()
  })

  it('shows Agent Connection tab label', () => {
    render(<AgentManagementPanel />)
    expect(screen.getByText('Agent 连接')).toBeInTheDocument()
  })

  it('shows Session History tab label', () => {
    render(<AgentManagementPanel />)
    expect(screen.getByText('会话历史')).toBeInTheDocument()
  })

  it('switches to sessions tab on click', () => {
    render(<AgentManagementPanel />)
    fireEvent.click(screen.getByText('会话历史'))
    expect(screen.getByTestId('session-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('connection-panel')).not.toBeInTheDocument()
  })

  it('switches back to connections tab on click', () => {
    render(<AgentManagementPanel />)
    fireEvent.click(screen.getByText('会话历史'))
    expect(screen.getByTestId('session-panel')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Agent 连接'))
    expect(screen.getByTestId('connection-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('session-panel')).not.toBeInTheDocument()
  })

  it('applies active tab styling to the selected tab', () => {
    render(<AgentManagementPanel />)
    const connButton = screen.getByText('Agent 连接')
    expect(connButton.className).toContain('border-b-2')
  })

  it('inactive tab does not have active styling', () => {
    render(<AgentManagementPanel />)
    const sessionButton = screen.getByText('会话历史')
    expect(sessionButton.className).not.toContain('border-b-2')
  })

  it('renders two tab buttons', () => {
    render(<AgentManagementPanel />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(2)
  })
})
