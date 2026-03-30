import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { WorkspacePanel } from './WorkspacePanel'

// Mock services
vi.mock('../services', () => ({
  api: {
    agent: {
      getAgents: vi.fn().mockResolvedValue([
        { id: 'agent-1', name: 'claude-code', status: 'running' },
        { id: 'agent-2', name: 'kimi-code', status: 'idle' },
      ]),
    },
  },
}))

// Mock react-router-dom
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const renderWithRouter = (ui: React.ReactElement) => {
  return render(
    <BrowserRouter>
      {ui}
    </BrowserRouter>
  )
}

describe('WorkspacePanel', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('renders workspace panel header', () => {
    renderWithRouter(<WorkspacePanel />)
    expect(screen.getByText('Workspace')).toBeInTheDocument()
  })

  it('renders all tabs', () => {
    renderWithRouter(<WorkspacePanel />)
    expect(screen.getByText('Sessions')).toBeInTheDocument()
    expect(screen.getByText('Files')).toBeInTheDocument()
    expect(screen.getByText('Agents')).toBeInTheDocument()
  })

  it('shows sessions tab by default', () => {
    renderWithRouter(<WorkspacePanel />)
    expect(screen.getByText('No conversation sessions yet')).toBeInTheDocument()
  })

  it('shows agents after loading', async () => {
    renderWithRouter(<WorkspacePanel />)

    // Click on agents tab
    const agentsTab = screen.getByText('Agents')
    agentsTab.click()

    await waitFor(() => {
      expect(screen.getByText('claude-code')).toBeInTheDocument()
      expect(screen.getByText('kimi-code')).toBeInTheDocument()
    })
  })

  it('renders settings button in footer', () => {
    renderWithRouter(<WorkspacePanel />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })
})