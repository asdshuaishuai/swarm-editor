import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { WorktreePanel } from './WorktreePanel'

// Mock services
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../services', () => ({
  api: {
    fs: {
      listDir: vi.fn().mockResolvedValue([
        { name: 'src', path: '/test/src', isDirectory: true },
        { name: 'go.mod', path: '/test/go.mod', isDirectory: false },
      ]),
      getWorkspace: vi.fn().mockResolvedValue('/test/workspace'),
    },
    agent: {
      getAgents: vi.fn().mockResolvedValue([
        { id: 'agent-1', name: 'test-agent', status: 'idle' },
      ]),
    },
  },
}))

describe('WorktreePanel', () => {
  it('renders worktree panel header', () => {
    render(<WorktreePanel />)
    expect(screen.getByText('Worktrees')).toBeInTheDocument()
  })

  it('shows files section after loading', async () => {
    render(<WorktreePanel />)
    await waitFor(() => {
      expect(screen.getByText('Files')).toBeInTheDocument()
    })
  })

  it('renders create worktree button', () => {
    render(<WorktreePanel />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
  })
})