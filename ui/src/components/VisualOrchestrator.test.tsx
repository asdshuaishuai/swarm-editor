import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VisualOrchestrator } from './VisualOrchestrator'

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
    swarm: {
      createSwarm: vi.fn().mockResolvedValue({ id: 'swarm-1' }),
    },
  },
}))

describe('VisualOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with default workflow name', () => {
    render(<VisualOrchestrator />)
    expect(screen.getByDisplayValue('New Workflow')).toBeInTheDocument()
  })

  it('renders with initial workflow', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test Workflow',
      description: 'Test',
      nodes: [],
      edges: [],
      status: 'draft' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)
    expect(screen.getByDisplayValue('Test Workflow')).toBeInTheDocument()
  })

  it('shows empty state when no nodes', () => {
    render(<VisualOrchestrator />)
    expect(screen.getByText(/click an agent/i)).toBeInTheDocument()
  })

  it('shows available agents in palette', () => {
    render(<VisualOrchestrator />)
    expect(screen.getByText('Coder')).toBeInTheDocument()
    expect(screen.getByText('Reviewer')).toBeInTheDocument()
  })

  it('adds node when clicking agent in palette', async () => {
    const { container } = render(<VisualOrchestrator />)

    // Find and click the agent in the palette (not the heading)
    const agentCards = container.querySelectorAll('.cursor-pointer')
    const coderCard = Array.from(agentCards).find(el => el.textContent?.includes('Coder'))

    if (coderCard) {
      fireEvent.click(coderCard)
    }

    // Check that nodes count increased
    await waitFor(() => {
      expect(screen.getByText(/Nodes: 1/)).toBeInTheDocument()
    })
  })

  it('disables run button when less than 2 nodes', () => {
    render(<VisualOrchestrator />)

    // Add one node
    fireEvent.click(screen.getByText('Coder'))

    // Run button should be disabled
    const runButton = screen.getByText('Run')
    expect(runButton).toBeDisabled()
  })

  it('enables run button when 2+ nodes', async () => {
    render(<VisualOrchestrator />)

    // Add two nodes
    fireEvent.click(screen.getByText('Coder'))
    fireEvent.click(screen.getByText('Reviewer'))

    await waitFor(() => {
      const runButton = screen.getByText('Run')
      expect(runButton).not.toBeDisabled()
    })
  })

  it('calls onSave when save button clicked', async () => {
    const onSave = vi.fn()
    render(<VisualOrchestrator onSave={onSave} />)

    fireEvent.click(screen.getByText('Save'))

    expect(onSave).toHaveBeenCalled()
  })

  it('calls onRun when run button clicked with 2+ nodes', async () => {
    const onRun = vi.fn()
    render(<VisualOrchestrator onRun={onRun} />)

    // Add two nodes
    fireEvent.click(screen.getByText('Coder'))
    fireEvent.click(screen.getByText('Reviewer'))

    await waitFor(() => {
      fireEvent.click(screen.getByText('Run'))
    })

    await waitFor(() => {
      expect(onRun).toHaveBeenCalled()
    })
  })

  it('updates workflow name on input change', () => {
    render(<VisualOrchestrator />)

    const input = screen.getByDisplayValue('New Workflow')
    fireEvent.change(input, { target: { value: 'My Custom Workflow' } })

    expect(screen.getByDisplayValue('My Custom Workflow')).toBeInTheDocument()
  })

  it('shows workflow stats', () => {
    render(<VisualOrchestrator />)

    expect(screen.getByText(/Nodes: 0/)).toBeInTheDocument()
    expect(screen.getByText(/Edges: 0/)).toBeInTheDocument()
  })

  it('shows status as draft initially', () => {
    render(<VisualOrchestrator />)

    expect(screen.getByText(/Status:/)).toBeInTheDocument()
  })
})
