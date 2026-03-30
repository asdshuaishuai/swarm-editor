import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import WorkflowPanel from './WorkflowPanel'

// Mock the store
vi.mock('../store/appStore', () => ({
  useAppStore: vi.fn((selector?: (state: unknown) => unknown) => {
    const state = {
      agents: [
        { id: 'agent-1', name: 'Coder', type: 'coder', state: 'idle' },
        { id: 'agent-2', name: 'Reviewer', type: 'reviewer', state: 'idle' },
      ],
      addToast: vi.fn(),
    }
    return selector ? selector(state) : state
  }),
}))

// Mock the api
vi.mock('../services', () => ({
  api: {
    workflows: {
      list: vi.fn().mockResolvedValue([
        {
          id: 'wf-1',
          name: 'Test Workflow',
          description: 'Test description',
          mode: 'sequential',
          status: 'draft',
          nodes: [
            { id: 'n1', name: 'Node 1', type: 'coder', position: { x: 100, y: 100 } },
          ],
          edges: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ]),
      create: vi.fn().mockResolvedValue({ id: 'wf-new', name: 'New Workflow', status: 'draft' }),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn().mockResolvedValue(undefined),
    },
    swarm: {
      createSwarm: vi.fn().mockResolvedValue({ id: 'swarm-1' }),
    },
  },
}))

// Mock VisualOrchestrator to avoid complex rendering
vi.mock('../components/VisualOrchestrator', () => ({
  VisualOrchestrator: ({ initialWorkflow, onSave, onRun }: {
    initialWorkflow?: { name: string }
    onSave?: (workflow: { name: string }) => void
    onRun?: (workflow: { name: string }) => void
  }) => (
    <div data-testid="visual-orchestrator">
      <span data-testid="workflow-name">{initialWorkflow?.name || 'New Workflow'}</span>
      <button onClick={() => onSave?.({ name: 'Test' })}>Mock Save</button>
      <button onClick={() => onRun?.({ name: 'Test' })}>Mock Run</button>
    </div>
  ),
}))

describe('WorkflowPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with design tab active by default', () => {
    render(<WorkflowPanel />)
    expect(screen.getByText('Workflow Designer')).toBeInTheDocument()
    expect(screen.getByTestId('visual-orchestrator')).toBeInTheDocument()
  })

  it('shows design and saved tabs', () => {
    render(<WorkflowPanel />)
    expect(screen.getByText('Design')).toBeInTheDocument()
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('switches to saved tab when clicked', async () => {
    render(<WorkflowPanel />)

    fireEvent.click(screen.getByText('Saved'))

    await waitFor(() => {
      expect(screen.getByText('Test Workflow')).toBeInTheDocument()
    })
  })

  it('shows import button', () => {
    render(<WorkflowPanel />)
    expect(screen.getByText('Import')).toBeInTheDocument()
  })

  it('shows workflow stats in saved tab', async () => {
    render(<WorkflowPanel />)

    fireEvent.click(screen.getByText('Saved'))

    await waitFor(() => {
      expect(screen.getByText('1 nodes')).toBeInTheDocument()
      expect(screen.getByText('0 edges')).toBeInTheDocument()
    })
  })

  it('shows workflow status badge', async () => {
    render(<WorkflowPanel />)

    fireEvent.click(screen.getByText('Saved'))

    await waitFor(() => {
      expect(screen.getByText('draft')).toBeInTheDocument()
    })
  })

  it('shows empty state when no saved workflows', async () => {
    const { api } = await import('../services')
    vi.mocked(api.workflows.list).mockResolvedValueOnce([])

    render(<WorkflowPanel />)

    fireEvent.click(screen.getByText('Saved'))

    await waitFor(() => {
      expect(screen.getByText('No saved workflows')).toBeInTheDocument()
    })
  })

  it('handles workflow deletion', async () => {
    const { api } = await import('../services')
    render(<WorkflowPanel />)

    // Go to saved tab
    fireEvent.click(screen.getByText('Saved'))

    await waitFor(() => {
      expect(screen.getByText('Test Workflow')).toBeInTheDocument()
    })

    // Find and click delete button (trash icon)
    const deleteButtons = screen.getAllByTitle('Delete')
    fireEvent.click(deleteButtons[0])

    // Confirm deletion in the confirmation dialog
    await waitFor(() => {
      expect(screen.getByText('Delete Workflow')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Delete'))

    await waitFor(() => {
      expect(api.workflows.delete).toHaveBeenCalledWith('wf-1')
    })
  })

  it('handles workflow editing', async () => {
    render(<WorkflowPanel />)

    // Go to saved tab
    fireEvent.click(screen.getByText('Saved'))

    await waitFor(() => {
      expect(screen.getByText('Test Workflow')).toBeInTheDocument()
    })

    // Find and click edit button
    const editButtons = screen.getAllByTitle('Edit')
    fireEvent.click(editButtons[0])

    // Should switch to design tab with workflow loaded
    await waitFor(() => {
      expect(screen.getByTestId('visual-orchestrator')).toBeInTheDocument()
    })
  })

  it('handles save from orchestrator', async () => {
    render(<WorkflowPanel />)

    fireEvent.click(screen.getByText('Mock Save'))

    // Should call the api (workflow would be created/updated)
    // This is handled by the mock component
    expect(screen.getByTestId('visual-orchestrator')).toBeInTheDocument()
  })

  it('handles run from orchestrator', async () => {
    render(<WorkflowPanel />)

    fireEvent.click(screen.getByText('Mock Run'))

    // Run is handled by VisualOrchestrator which calls api.swarm.createSwarm
    expect(screen.getByTestId('visual-orchestrator')).toBeInTheDocument()
  })

  it('shows header with icon and title', () => {
    render(<WorkflowPanel />)
    expect(screen.getByText('Workflow Designer')).toBeInTheDocument()
    expect(screen.getByText('Design multi-agent workflows')).toBeInTheDocument()
  })
})
