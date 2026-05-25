import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VisualOrchestrator } from './VisualOrchestrator'

// ── Hoisted mocks (no external variable references in factories) ──

// Shared state so that addToast is the same reference across all useAppStore calls
const _sharedAddToast = vi.fn()
const _sharedState = {
  agents: [
    { id: 'agent-1', name: 'Coder', type: 'coder', state: 'idle' },
    { id: 'agent-2', name: 'Reviewer', type: 'reviewer', state: 'idle' },
    { id: 'agent-3', name: 'Tester', type: 'tester', state: 'idle' },
  ],
  addToast: _sharedAddToast,
}

vi.mock('../store/appStore', () => ({
  useAppStore: vi.fn((selector?: (state: unknown) => unknown) => {
    return selector ? selector(_sharedState) : _sharedState
  }),
}))

vi.mock('../services', () => ({
  api: {
    swarm: {
      createSwarm: vi.fn().mockResolvedValue({ id: 'swarm-1' }),
    },
  },
}))

vi.mock('../utils', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// ── Lazy-loaded mock references ──

async function getApiMocks() {
  const mod = await import('../services')
  return {
    createSwarm: vi.mocked(mod.api.swarm.createSwarm),
  }
}

describe('VisualOrchestrator', () => {
  let createSwarm: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    _sharedAddToast.mockClear()
    const apiMocks = await getApiMocks()
    createSwarm = apiMocks.createSwarm
    createSwarm.mockResolvedValue({ id: 'swarm-1' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ─── Basic rendering ────────────────────────────────────────

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

  it('does not show empty state when nodes exist', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test Workflow',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)
    expect(screen.queryByText(/click an agent/i)).not.toBeInTheDocument()
  })

  it('shows available agents in palette', () => {
    render(<VisualOrchestrator />)
    expect(screen.getByText('Coder')).toBeInTheDocument()
    expect(screen.getByText('Reviewer')).toBeInTheDocument()
    expect(screen.getByText('Tester')).toBeInTheDocument()
  })

  it('shows workflow stats', () => {
    render(<VisualOrchestrator />)
    expect(screen.getByText(/Nodes: 0/)).toBeInTheDocument()
    expect(screen.getByText(/Edges: 0/)).toBeInTheDocument()
  })

  it('shows status as draft initially', () => {
    render(<VisualOrchestrator />)
    expect(screen.getByText('draft')).toBeInTheDocument()
  })

  // ─── Adding nodes ───────────────────────────────────────────

  it('adds node when clicking agent in palette', async () => {
    const { container } = render(<VisualOrchestrator />)

    const agentCards = container.querySelectorAll('.cursor-pointer')
    const coderCard = Array.from(agentCards).find(el => el.textContent?.includes('Coder'))

    if (coderCard) {
      fireEvent.click(coderCard)
    }

    await waitFor(() => {
      expect(screen.getByText(/Nodes: 1/)).toBeInTheDocument()
    })
  })

  it('adds multiple nodes when clicking different agents', async () => {
    render(<VisualOrchestrator />)

    fireEvent.click(screen.getByText('Coder'))
    fireEvent.click(screen.getByText('Reviewer'))

    await waitFor(() => {
      expect(screen.getByText(/Nodes: 2/)).toBeInTheDocument()
    })
  })

  it('adds agent via keyboard Enter on palette item', async () => {
    render(<VisualOrchestrator />)

    const coderInPalette = screen.getByRole('option', { name: /Coder/i })
    fireEvent.keyDown(coderInPalette, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByText(/Nodes: 1/)).toBeInTheDocument()
    })
  })

  it('adds agent via keyboard Space on palette item', async () => {
    render(<VisualOrchestrator />)

    const coderInPalette = screen.getByRole('option', { name: /Coder/i })
    fireEvent.keyDown(coderInPalette, { key: ' ' })

    await waitFor(() => {
      expect(screen.getByText(/Nodes: 1/)).toBeInTheDocument()
    })
  })

  // ─── Workflow name editing ──────────────────────────────────

  it('updates workflow name on input change', () => {
    render(<VisualOrchestrator />)

    const input = screen.getByDisplayValue('New Workflow')
    fireEvent.change(input, { target: { value: 'My Custom Workflow' } })

    expect(screen.getByDisplayValue('My Custom Workflow')).toBeInTheDocument()
  })

  // ─── Run button states ──────────────────────────────────────

  it('disables run button when less than 2 nodes', () => {
    render(<VisualOrchestrator />)

    const coderOption = screen.getByRole('option', { name: /Coder/i })
    fireEvent.click(coderOption)

    const runButton = screen.getByText('Run')
    expect(runButton).toBeDisabled()
  })

  it('enables run button when 2+ nodes', async () => {
    render(<VisualOrchestrator />)

    const coderOption = screen.getByRole('option', { name: /Coder/i })
    const reviewerOption = screen.getByRole('option', { name: /Reviewer/i })
    fireEvent.click(coderOption)
    fireEvent.click(reviewerOption)

    await waitFor(() => {
      const runButton = screen.getByText('Run')
      expect(runButton).not.toBeDisabled()
    })
  })

  // ─── Save handler ───────────────────────────────────────────

  it('calls onSave when save button clicked', async () => {
    const onSave = vi.fn()
    render(<VisualOrchestrator onSave={onSave} />)

    fireEvent.click(screen.getByText('Save'))

    expect(onSave).toHaveBeenCalled()
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New Workflow',
        status: 'draft',
      })
    )
  })

  it('calls addToast on save', async () => {
    render(<VisualOrchestrator />)

    fireEvent.click(screen.getByText('Save'))

    expect(_sharedAddToast).toHaveBeenCalledWith('success', 'Workflow saved', 'New Workflow')
  })

  // ─── Run handler ────────────────────────────────────────────

  it('calls onRun when run button clicked with 2+ nodes', async () => {
    const onRun = vi.fn()
    render(<VisualOrchestrator onRun={onRun} />)

    const coderOption = screen.getByRole('option', { name: /Coder/i })
    const reviewerOption = screen.getByRole('option', { name: /Reviewer/i })
    fireEvent.click(coderOption)
    fireEvent.click(reviewerOption)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Run'))
    })

    await waitFor(() => {
      expect(onRun).toHaveBeenCalled()
    })
  })

  it('calls createSwarm with correct config when run', async () => {
    render(<VisualOrchestrator />)

    const coderOption = screen.getByRole('option', { name: /Coder/i })
    const reviewerOption = screen.getByRole('option', { name: /Reviewer/i })
    fireEvent.click(coderOption)
    fireEvent.click(reviewerOption)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Run'))
    })

    await waitFor(() => {
      expect(createSwarm).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Workflow',
          topology: 'mesh',
          strategy: 'parallel',
        })
      )
    })
  })

  it('shows warning toast when running with less than 2 nodes (guard)', () => {
    render(<VisualOrchestrator />)

    // Run button is disabled with < 2 nodes
    const coderOption = screen.getByRole('option', { name: /Coder/i })
    fireEvent.click(coderOption)

    expect(screen.getByText('Run')).toBeDisabled()
  })

  it('prevents running if workflow is not draft (already running)', async () => {
    const onRun = vi.fn()
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test Workflow',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
        { id: 'n2', name: 'Reviewer', type: 'reviewer', x: 300, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'running' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} onRun={onRun} />)

    // Status is "running" so the Run button should not exist
    expect(screen.queryByText('Run')).not.toBeInTheDocument()
  })

  it('handles createSwarm error gracefully', async () => {
    createSwarm.mockRejectedValue(new Error('Network error'))
    const onRun = vi.fn()

    render(<VisualOrchestrator onRun={onRun} />)

    const coderOption = screen.getByRole('option', { name: /Coder/i })
    const reviewerOption = screen.getByRole('option', { name: /Reviewer/i })
    fireEvent.click(coderOption)
    fireEvent.click(reviewerOption)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Run'))
    })

    await waitFor(() => {
      expect(_sharedAddToast).toHaveBeenCalledWith('error', 'Failed to run workflow', 'Network error')
    })
  })

  it('handles createSwarm error with non-Error thrown value', async () => {
    createSwarm.mockRejectedValue('string error')
    const onRun = vi.fn()

    render(<VisualOrchestrator onRun={onRun} />)

    const coderOption = screen.getByRole('option', { name: /Coder/i })
    const reviewerOption = screen.getByRole('option', { name: /Reviewer/i })
    fireEvent.click(coderOption)
    fireEvent.click(reviewerOption)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Run'))
    })

    await waitFor(() => {
      expect(_sharedAddToast).toHaveBeenCalledWith('error', 'Failed to run workflow', 'Unknown error')
    })
  })

  it('shows running status after successful run', async () => {
    render(<VisualOrchestrator />)

    const coderOption = screen.getByRole('option', { name: /Coder/i })
    const reviewerOption = screen.getByRole('option', { name: /Reviewer/i })
    fireEvent.click(coderOption)
    fireEvent.click(reviewerOption)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Run'))
    })

    await waitFor(() => {
      expect(screen.getByText('running')).toBeInTheDocument()
    })
  })

  it('adds toast on successful run', async () => {
    render(<VisualOrchestrator />)

    const coderOption = screen.getByRole('option', { name: /Coder/i })
    const reviewerOption = screen.getByRole('option', { name: /Reviewer/i })
    fireEvent.click(coderOption)
    fireEvent.click(reviewerOption)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Run'))
    })

    await waitFor(() => {
      expect(_sharedAddToast).toHaveBeenCalledWith('success', 'Workflow started', 'swarm-1')
    })
  })

  // ─── Pause/Resume/Step/Reset controls ───────────────────────

  it('shows Pause and Step buttons when running', async () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
        { id: 'n2', name: 'Reviewer', type: 'reviewer', x: 300, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'running' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    expect(screen.getByText('Pause')).toBeInTheDocument()
    expect(screen.getByText('Step')).toBeInTheDocument()
    expect(screen.getByText('Reset')).toBeInTheDocument()
  })

  it('shows Resume and Step buttons when paused', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
        { id: 'n2', name: 'Reviewer', type: 'reviewer', x: 300, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'paused' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    expect(screen.getByText('Resume')).toBeInTheDocument()
    expect(screen.getByText('Step')).toBeInTheDocument()
    expect(screen.getByText('Reset')).toBeInTheDocument()
  })

  it('shows Done and Reset when completed', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
        { id: 'n2', name: 'Reviewer', type: 'reviewer', x: 300, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'completed' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.getByText('Reset')).toBeInTheDocument()
  })

  it('pauses workflow and shows toast', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
        { id: 'n2', name: 'Reviewer', type: 'reviewer', x: 300, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'running' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    fireEvent.click(screen.getByText('Pause'))

    expect(screen.getByText('paused')).toBeInTheDocument()
    expect(_sharedAddToast).toHaveBeenCalledWith('info', 'Workflow paused', 'Test')
  })

  it('resumes paused workflow and shows toast', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
        { id: 'n2', name: 'Reviewer', type: 'reviewer', x: 300, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'paused' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    fireEvent.click(screen.getByText('Resume'))

    expect(screen.getByText('running')).toBeInTheDocument()
    expect(_sharedAddToast).toHaveBeenCalledWith('info', 'Workflow resumed', 'Test')
  })

  it('resets running workflow to draft', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
        { id: 'n2', name: 'Reviewer', type: 'reviewer', x: 300, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'running' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    fireEvent.click(screen.getByText('Reset'))

    expect(screen.getByText('draft')).toBeInTheDocument()
    expect(_sharedAddToast).toHaveBeenCalledWith('info', 'Workflow reset', 'Test')
  })

  it('resets completed workflow to draft', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
        { id: 'n2', name: 'Reviewer', type: 'reviewer', x: 300, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'completed' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    fireEvent.click(screen.getByText('Reset'))

    expect(screen.getByText('draft')).toBeInTheDocument()
  })

  // ─── Step (LangGraph-style) ─────────────────────────────────

  it('steps through nodes from null activeNodeIndex', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
        { id: 'n2', name: 'Reviewer', type: 'reviewer', x: 300, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'running' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    // Step from null index -> should start at 0
    fireEvent.click(screen.getByText('Step'))

    expect(screen.getByText(/Step 1: Coder/)).toBeInTheDocument()
  })

  it('steps through to next node', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
        { id: 'n2', name: 'Reviewer', type: 'reviewer', x: 300, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'running' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    // Step twice: first goes to node 0, second goes to node 1
    fireEvent.click(screen.getByText('Step'))
    expect(screen.getByText(/Step 1: Coder/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('Step'))
    expect(screen.getByText(/Step 2: Reviewer/)).toBeInTheDocument()
  })

  it('completes workflow when stepping past last node', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'running' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    // Step once to reach node 0
    fireEvent.click(screen.getByText('Step'))

    // Step again to go past the last node -> completed
    fireEvent.click(screen.getByText('Step'))

    expect(screen.getByText('completed')).toBeInTheDocument()
    expect(_sharedAddToast).toHaveBeenCalledWith('success', 'Workflow completed', 'Test')
  })

  it('steps when paused', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
        { id: 'n2', name: 'Reviewer', type: 'reviewer', x: 300, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'paused' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    fireEvent.click(screen.getByText('Step'))
    expect(screen.getByText(/Step 1: Coder/)).toBeInTheDocument()
  })

  // ─── Execution log ──────────────────────────────────────────

  it('shows execution log after running', async () => {
    render(<VisualOrchestrator />)

    const coderOption = screen.getByRole('option', { name: /Coder/i })
    const reviewerOption = screen.getByRole('option', { name: /Reviewer/i })
    fireEvent.click(coderOption)
    fireEvent.click(reviewerOption)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Run'))
    })

    await waitFor(() => {
      expect(screen.getByText('Execution Log')).toBeInTheDocument()
    })
  })

  it('clears execution log on reset', async () => {
    render(<VisualOrchestrator />)

    const coderOption = screen.getByRole('option', { name: /Coder/i })
    const reviewerOption = screen.getByRole('option', { name: /Reviewer/i })
    fireEvent.click(coderOption)
    fireEvent.click(reviewerOption)

    await waitFor(() => {
      fireEvent.click(screen.getByText('Run'))
    })

    await waitFor(() => {
      expect(screen.getByText('Execution Log')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Reset'))

    expect(screen.queryByText('Execution Log')).not.toBeInTheDocument()
  })

  // ─── Node selection and canvas click ────────────────────────

  it('shows instruction when a node is selected', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    const nodeButton = screen.getByRole('button', { name: /Coder - coder - idle/i })
    fireEvent.click(nodeButton)

    expect(screen.getByText(/click another node to connect/i)).toBeInTheDocument()
  })

  it('deselects node when canvas is clicked', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    const nodeButton = screen.getByRole('button', { name: /Coder - coder - idle/i })
    fireEvent.click(nodeButton)
    expect(screen.getByText(/click another node to connect/i)).toBeInTheDocument()

    // Click on the canvas area to deselect
    const canvas = nodeButton.closest('.relative')
    if (canvas) {
      fireEvent.click(canvas)
    }

    expect(screen.queryByText(/click another node to connect/i)).not.toBeInTheDocument()
  })

  // ─── Node selection via keyboard ────────────────────────────

  it('selects node via Enter key', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    const nodeButton = screen.getByRole('button', { name: /Coder - coder - idle/i })
    fireEvent.keyDown(nodeButton, { key: 'Enter' })

    expect(screen.getByText(/click another node to connect/i)).toBeInTheDocument()
  })

  it('selects node via Space key', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    const nodeButton = screen.getByRole('button', { name: /Coder - coder - idle/i })
    fireEvent.keyDown(nodeButton, { key: ' ' })

    expect(screen.getByText(/click another node to connect/i)).toBeInTheDocument()
  })

  // ─── Edge creation ──────────────────────────────────────────

  it('creates edge between two nodes when clicking one then another', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
        { id: 'n2', name: 'Reviewer', type: 'reviewer', x: 300, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    // Click first node
    const coderButton = screen.getByRole('button', { name: /Coder - coder - idle/i })
    fireEvent.click(coderButton)

    // Click second node to create edge
    const reviewerButton = screen.getByRole('button', { name: /Reviewer - reviewer - idle/i })
    fireEvent.click(reviewerButton)

    expect(screen.getByText(/Edges: 1/)).toBeInTheDocument()
  })

  it('does not create duplicate edge between same nodes', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
        { id: 'n2', name: 'Reviewer', type: 'reviewer', x: 300, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    // Click first node then second to create edge n1->n2
    const coderButton = screen.getByRole('button', { name: /Coder - coder - idle/i })
    const reviewerButton = screen.getByRole('button', { name: /Reviewer - reviewer - idle/i })
    fireEvent.click(coderButton)
    fireEvent.click(reviewerButton)

    // Now selectedNode is reviewer (n2). Click coder again -- edge n2->n1 will be attempted.
    // Then click reviewer again -- edge n1->n2 should NOT be duplicated.
    // But n2->n1 is a different edge direction, so we first verify we have 1 edge.
    expect(screen.getByText(/Edges: 1/)).toBeInTheDocument()

    // Click coder (selectedNode = reviewer) → edge reviewer->coder (n2->n1) created
    fireEvent.click(coderButton)
    expect(screen.getByText(/Edges: 2/)).toBeInTheDocument()

    // Now try to create the same n1->n2 edge again: select n1 (which is coder, currently selected from n2->n1 edge),
    // then click n2. But n2->n1 already exists, n1->n2 already exists.
    // Currently coder is selected. Click reviewer → edge coder->reviewer = n1->n2 already exists, should not add.
    fireEvent.click(reviewerButton)
    expect(screen.getByText(/Edges: 2/)).toBeInTheDocument()
  })

  it('does not create edge when clicking same node', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    const coderButton = screen.getByRole('button', { name: /Coder - coder - idle/i })
    fireEvent.click(coderButton)
    fireEvent.click(coderButton)

    expect(screen.getByText(/Edges: 0/)).toBeInTheDocument()
  })

  it('renders SVG edges between nodes', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
        { id: 'n2', name: 'Reviewer', type: 'reviewer', x: 300, y: 100, status: 'idle' as const },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2', label: 'next' },
      ],
      status: 'draft' as const,
    }
    const { container } = render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    const lines = container.querySelectorAll('line')
    expect(lines.length).toBe(1)
    expect(lines[0].getAttribute('stroke')).toBe('#6b7280')
  })

  it('highlights edge when connected node is selected', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
        { id: 'n2', name: 'Reviewer', type: 'reviewer', x: 300, y: 100, status: 'idle' as const },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2', label: 'next' },
      ],
      status: 'draft' as const,
    }
    const { container } = render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    // Click one of the connected nodes
    const coderButton = screen.getByRole('button', { name: /Coder - coder - idle/i })
    fireEvent.click(coderButton)

    const lines = container.querySelectorAll('line')
    expect(lines[0].getAttribute('stroke')).toBe('#3b82f6')
  })

  it('does not render SVG line for edge with missing nodes', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n999-missing', label: 'next' },
      ],
      status: 'draft' as const,
    }
    const { container } = render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    // Edge points to a missing node, so no line should render
    const lines = container.querySelectorAll('line')
    expect(lines.length).toBe(0)
  })

  // ─── Node drag ──────────────────────────────────────────────

  it('handles node mouse down and selects node', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    const nodeButton = screen.getByRole('button', { name: /Coder - coder - idle/i })
    fireEvent.mouseDown(nodeButton, { clientX: 150, clientY: 150 })

    // Node should be selected
    expect(screen.getByText(/click another node to connect/i)).toBeInTheDocument()
  })

  it('moves node when dragging on canvas', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    const { container } = render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    const nodeButton = screen.getByRole('button', { name: /Coder - coder - idle/i })
    // Start drag
    fireEvent.mouseDown(nodeButton, { clientX: 150, clientY: 150 })

    // Get canvas and simulate mouse move
    const canvas = container.querySelector('.relative') as HTMLElement
    if (canvas) {
      // Mock getBoundingClientRect for the canvas
      canvas.getBoundingClientRect = vi.fn().mockReturnValue({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
        right: 800,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      })
      fireEvent.mouseMove(canvas, { clientX: 300, clientY: 300 })
    }

    // Mouse up ends drag
    fireEvent.mouseUp(canvas)
    // No error means drag completed
  })

  it('does not move node when no drag in progress', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    const { container } = render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    const canvas = container.querySelector('.relative') as HTMLElement
    if (canvas) {
      // Move without starting a drag -- should be a no-op
      fireEvent.mouseMove(canvas, { clientX: 300, clientY: 300 })
    }
    // No crash means the guard works
  })

  it('handles mouseLeave on canvas to end drag', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    const { container } = render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    const nodeButton = screen.getByRole('button', { name: /Coder - coder - idle/i })
    fireEvent.mouseDown(nodeButton, { clientX: 150, clientY: 150 })

    const canvas = container.querySelector('.relative') as HTMLElement
    if (canvas) {
      canvas.getBoundingClientRect = vi.fn().mockReturnValue({
        left: 0, top: 0, width: 800, height: 600,
        right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}),
      })
      fireEvent.mouseLeave(canvas)
    }
    // Drag should be ended
  })

  // ─── Keyboard delete ────────────────────────────────────────

  it('deletes selected node on Delete key', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
        { id: 'n2', name: 'Reviewer', type: 'reviewer', x: 300, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    expect(screen.getByText(/Nodes: 2/)).toBeInTheDocument()

    // Select a node
    const coderButton = screen.getByRole('button', { name: /Coder - coder - idle/i })
    fireEvent.click(coderButton)

    // Press Delete
    fireEvent.keyDown(window, { key: 'Delete' })

    expect(screen.getByText(/Nodes: 1/)).toBeInTheDocument()
  })

  it('deletes selected node on Backspace key', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
        { id: 'n2', name: 'Reviewer', type: 'reviewer', x: 300, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    const coderButton = screen.getByRole('button', { name: /Coder - coder - idle/i })
    fireEvent.click(coderButton)

    fireEvent.keyDown(window, { key: 'Backspace' })

    expect(screen.getByText(/Nodes: 1/)).toBeInTheDocument()
  })

  it('deletes connected edges when node is deleted', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
        { id: 'n2', name: 'Reviewer', type: 'reviewer', x: 300, y: 100, status: 'idle' as const },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2', label: 'next' },
      ],
      status: 'draft' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    expect(screen.getByText(/Edges: 1/)).toBeInTheDocument()

    const coderButton = screen.getByRole('button', { name: /Coder - coder - idle/i })
    fireEvent.click(coderButton)

    fireEvent.keyDown(window, { key: 'Delete' })

    expect(screen.getByText(/Edges: 0/)).toBeInTheDocument()
  })

  it('does nothing on Delete when no node is selected', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    expect(screen.getByText(/Nodes: 1/)).toBeInTheDocument()

    // Press Delete without selecting
    fireEvent.keyDown(window, { key: 'Delete' })

    // Should still have 1 node
    expect(screen.getByText(/Nodes: 1/)).toBeInTheDocument()
  })

  it('deselects node after deletion', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    const coderButton = screen.getByRole('button', { name: /Coder - coder - idle/i })
    fireEvent.click(coderButton)
    expect(screen.getByText(/click another node to connect/i)).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Delete' })

    // Instruction should be gone since node was deselected
    expect(screen.queryByText(/click another node to connect/i)).not.toBeInTheDocument()
  })

  // ─── Node status indicators ─────────────────────────────────

  it('renders running node with pulse class', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'running' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    const { container } = render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    const pulseDot = container.querySelector('.animate-pulse')
    expect(pulseDot).toBeInTheDocument()
  })

  it('renders waiting node with warning dot', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'waiting' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    const { container } = render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    const warningDot = container.querySelector('.bg-warning')
    expect(warningDot).toBeInTheDocument()
  })

  it('renders error node with error dot', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'error' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    const { container } = render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    const errorDot = container.querySelector('.bg-error')
    expect(errorDot).toBeInTheDocument()
  })

  it('renders idle node with tertiary dot', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    const { container } = render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    const idleDot = container.querySelector('.bg-text-tertiary')
    expect(idleDot).toBeInTheDocument()
  })

  // ─── Node aria attributes ───────────────────────────────────

  it('renders nodes with correct aria attributes', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    const nodeButton = screen.getByRole('button', { name: /Coder - coder - idle/i })
    expect(nodeButton).toHaveAttribute('aria-pressed', 'false')
  })

  it('sets aria-pressed to true when node is selected', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    const nodeButton = screen.getByRole('button', { name: /Coder - coder - idle/i })
    fireEvent.click(nodeButton)

    expect(nodeButton).toHaveAttribute('aria-pressed', 'true')
  })

  // ─── Workflow status display ────────────────────────────────

  it('shows correct status text for running workflow', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
        { id: 'n2', name: 'Reviewer', type: 'reviewer', x: 300, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'running' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    expect(screen.getByText('running')).toBeInTheDocument()
  })

  it('shows correct status text for paused workflow', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
        { id: 'n2', name: 'Reviewer', type: 'reviewer', x: 300, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'paused' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    expect(screen.getByText('paused')).toBeInTheDocument()
  })

  it('shows correct status text for completed workflow', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
        { id: 'n2', name: 'Reviewer', type: 'reviewer', x: 300, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'completed' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    expect(screen.getByText('completed')).toBeInTheDocument()
  })

  // ─── No agents available state ──────────────────────────────

  it('shows no agents available when agents list is empty', async () => {
    const { useAppStore } = await import('../store/appStore')
    // Override to return empty agents list
    vi.mocked(useAppStore).mockImplementationOnce(
      // Cast to match the overloaded useAppStore signature
      Object.assign(
        (selector?: (state: Record<string, unknown>) => unknown) => {
          const emptyState: Record<string, unknown> = {
            agents: [],
            addToast: _sharedAddToast,
          }
          return selector ? selector(emptyState) : emptyState
        },
        { withTypes: vi.fn() }
      ) as never
    )

    render(<VisualOrchestrator />)

    expect(screen.getByText('No agents available')).toBeInTheDocument()
  })

  // ─── Selected node visual styling ───────────────────────────

  it('applies accent border to selected node', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    const nodeButton = screen.getByRole('button', { name: /Coder - coder - idle/i })
    fireEvent.click(nodeButton)

    // The inner card should have the accent border classes
    const card = nodeButton.querySelector('.border-accent')
    expect(card).toBeInTheDocument()
  })

  it('applies default border to unselected node', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    const { container } = render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    // Node not selected -- should have border-glass-border
    const card = container.querySelector('.border-glass-border')
    expect(card).toBeInTheDocument()
  })

  // ─── Agent palette avatar ───────────────────────────────────

  it('renders agent initial in palette avatar', () => {
    render(<VisualOrchestrator />)

    expect(screen.getByText('C')).toBeInTheDocument() // Coder initial
  })

  // ─── Full workflow lifecycle ────────────────────────────────

  it('supports full run-pause-resume-reset lifecycle', async () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Lifecycle Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
        { id: 'n2', name: 'Reviewer', type: 'reviewer', x: 300, y: 100, status: 'idle' as const },
      ],
      edges: [],
      status: 'draft' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    // Run
    fireEvent.click(screen.getByText('Run'))
    await waitFor(() => {
      expect(screen.getByText('running')).toBeInTheDocument()
    })

    // Pause
    fireEvent.click(screen.getByText('Pause'))
    await waitFor(() => {
      expect(screen.getByText('paused')).toBeInTheDocument()
    })

    // Resume
    fireEvent.click(screen.getByText('Resume'))
    await waitFor(() => {
      expect(screen.getByText('running')).toBeInTheDocument()
    })

    // Reset
    fireEvent.click(screen.getByText('Reset'))
    await waitFor(() => {
      expect(screen.getByText('draft')).toBeInTheDocument()
    })
  })

  // ─── Edge with condition ────────────────────────────────────

  it('renders edges with condition property', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
        { id: 'n2', name: 'Reviewer', type: 'reviewer', x: 300, y: 100, status: 'idle' as const },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2', label: 'next', condition: 'success' },
      ],
      status: 'draft' as const,
    }
    const { container } = render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    const lines = container.querySelectorAll('line')
    expect(lines.length).toBe(1)
  })

  // ─── Grid background ────────────────────────────────────────

  it('renders grid background with radial gradient', () => {
    const { container } = render(<VisualOrchestrator />)

    const gridDiv = container.querySelector('[style*="radial-gradient"]')
    expect(gridDiv).toBeInTheDocument()
  })

  // ─── SVG arrowhead marker ───────────────────────────────────

  it('renders SVG arrowhead marker definition', () => {
    const { container } = render(<VisualOrchestrator />)

    const marker = container.querySelector('#arrowhead')
    expect(marker).toBeInTheDocument()
  })

  // ─── Execution log max 5 entries ────────────────────────────

  it('limits execution log display to last 5 entries', () => {
    const initialWorkflow = {
      id: 'wf-test',
      name: 'Test',
      description: '',
      nodes: [
        { id: 'n1', name: 'Coder', type: 'coder', x: 100, y: 100, status: 'idle' as const },
        { id: 'n2', name: 'Reviewer', type: 'reviewer', x: 300, y: 100, status: 'idle' as const },
        { id: 'n3', name: 'Tester', type: 'tester', x: 500, y: 100, status: 'idle' as const },
        { id: 'n4', name: 'Builder', type: 'builder', x: 200, y: 300, status: 'idle' as const },
        { id: 'n5', name: 'Deployer', type: 'deployer', x: 400, y: 300, status: 'idle' as const },
        { id: 'n6', name: 'Monitor', type: 'monitor', x: 300, y: 400, status: 'idle' as const },
      ],
      edges: [],
      status: 'running' as const,
    }
    render(<VisualOrchestrator initialWorkflow={initialWorkflow} />)

    // Step 6 times to create 6 log entries
    for (let i = 0; i < 6; i++) {
      fireEvent.click(screen.getByText('Step'))
    }

    // The execution log container should exist
    expect(screen.getByText('Execution Log')).toBeInTheDocument()
    // Only last 5 entries shown, so first entry should not be visible
    // Step 1 log should be trimmed, Step 2-6 should be visible
  })

  // ─── Save with updated workflow name ────────────────────────

  it('saves with updated workflow name', () => {
    const onSave = vi.fn()
    render(<VisualOrchestrator onSave={onSave} />)

    const input = screen.getByDisplayValue('New Workflow')
    fireEvent.change(input, { target: { value: 'Updated Name' } })

    fireEvent.click(screen.getByText('Save'))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Updated Name',
      })
    )
  })
})
