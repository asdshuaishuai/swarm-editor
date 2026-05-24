import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import WorkflowPanel from './WorkflowPanel'

// Hoisted mocks - must be defined before vi.mock calls
const {
  mockAddToast,
  mockList,
  mockCreate,
  mockUpdate,
  mockDelete,
  mockExecute,
  mockGetCheckpoints,
  mockRestore,
  mockGetReport,
  mockResume,
  mockClearAllCaches,
  mockOnSave,
  mockOnRun,
} = vi.hoisted(() => ({
  mockAddToast: vi.fn(),
  mockList: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockExecute: vi.fn(),
  mockGetCheckpoints: vi.fn(),
  mockRestore: vi.fn(),
  mockGetReport: vi.fn(),
  mockResume: vi.fn(),
  mockClearAllCaches: vi.fn(),
  mockOnSave: vi.fn(),
  mockOnRun: vi.fn(),
}))

// --- Mock store ---
vi.mock('../store/appStore', () => ({
  useAppStore: vi.fn((selector?: (state: unknown) => unknown) => {
    const state = {
      agents: [
        { id: 'agent-1', name: 'Coder', type: 'coder', state: 'idle' },
        { id: 'agent-2', name: 'Reviewer', type: 'reviewer', state: 'idle' },
      ],
      addToast: mockAddToast,
    }
    return selector ? selector(state) : state
  }),
}))

// --- Mock api ---
vi.mock('../services', () => ({
  api: {
    workflows: {
      list: mockList,
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete,
      execute: mockExecute,
      getCheckpoints: mockGetCheckpoints,
      restore: mockRestore,
      getReport: mockGetReport,
      resume: mockResume,
      clearAllCaches: mockClearAllCaches,
    },
  },
}))

// --- Mock logger ---
vi.mock('../utils', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  },
}))

// --- Mock VisualOrchestrator ---
vi.mock('../components/VisualOrchestrator', () => ({
  VisualOrchestrator: ({ initialWorkflow, onSave, onRun }: {
    initialWorkflow?: { name: string; id?: string }
    onSave?: (workflow: { name: string; id?: string; description?: string }) => void
    onRun?: (workflow: { name: string; id?: string }) => void
  }) => {
    // Must NOT call hooks or use state in a function component rendered by render()
    // Just render a simple div
    void mockOnSave
    void mockOnRun
    return (
      <div data-testid="visual-orchestrator">
        <span data-testid="workflow-name">{initialWorkflow?.name || 'New Workflow'}</span>
        <span data-testid="workflow-id">{initialWorkflow?.id || ''}</span>
        <button
          data-testid="mock-save-btn"
          onClick={() => onSave?.({ name: 'Test Save', id: 'wf-1', description: 'desc' })}
        >
          Mock Save
        </button>
        <button
          data-testid="mock-run-btn"
          onClick={() => onRun?.({ name: 'Test Run', id: 'wf-1' })}
        >
          Mock Run
        </button>
        <button
          data-testid="mock-save-new-btn"
          onClick={() => onSave?.({ name: 'New One', description: 'new desc' })}
        >
          Mock Save New
        </button>
        <button
          data-testid="mock-run-no-id-btn"
          onClick={() => onRun?.({ name: 'No Id Run' })}
        >
          Mock Run No Id
        </button>
      </div>
    )
  },
}))

// --- Mock ConfirmDialog ---
vi.mock('../components/ConfirmDialog', () => ({
  ConfirmDialog: ({ title, message, confirmLabel, onConfirm, onCancel }: {
    title: string
    message: string
    confirmLabel?: string
    onConfirm: () => void
    onCancel: () => void
  }) => (
    <div data-testid="confirm-dialog">
      <span data-testid="confirm-title">{title}</span>
      <span data-testid="confirm-message">{message}</span>
      <span data-testid="confirm-label">{confirmLabel}</span>
      <button data-testid="confirm-ok" onClick={onConfirm}>Confirm</button>
      <button data-testid="confirm-cancel" onClick={onCancel}>Cancel</button>
    </div>
  ),
}))

// Sample workflow data
const sampleWorkflow = {
  id: 'wf-1',
  name: 'Test Workflow',
  description: 'Test description',
  mode: 'sequential',
  status: 'draft',
  nodes: [
    { id: 'n1', name: 'Node 1', type: 'coder', position: { x: 100, y: 100 } },
    { id: 'n2', name: 'Node 2', type: 'reviewer', position: { x: 200, y: 200 } },
  ],
  edges: [
    { id: 'e1', from: 'n1', to: 'n2', label: 'Edge 1' },
  ],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

const runningWorkflow = {
  ...sampleWorkflow,
  id: 'wf-running',
  name: 'Running Workflow',
  status: 'running',
  mode: 'parallel',
}

const failedWorkflow = {
  ...sampleWorkflow,
  id: 'wf-failed',
  name: 'Failed Workflow',
  status: 'failed',
}

const sampleCheckpoint = {
  id: 'cp-1',
  workflowId: 'wf-1',
  createdAt: '2024-01-01T12:00:00Z',
  currentNode: 'Node 1',
}

const sampleReport = {
  workflowId: 'wf-1',
  executionId: 'exec-1',
  createdAt: '2024-01-01T12:00:00Z',
  status: 'completed' as const,
  mode: 'sequential',
  durationMs: 5000,
  succeededNodes: [
    { nodeId: 'n1', status: 'completed', durationMs: 2000 },
    { nodeId: 'n2', status: 'completed', durationMs: 3000 },
  ],
  failedNodes: [] as { nodeId: string; failureType: string; errorMessage: string; timestamp: string; durationMs: number; retryable: boolean }[],
  skippedNodes: [] as { nodeId: string; reason: string; skippedAt: string }[],
  totalNodes: 2,
  successCount: 2,
  failureCount: 0,
  skippedCount: 0,
}

describe('WorkflowPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue([sampleWorkflow])
    mockCreate.mockResolvedValue({ id: 'wf-new', name: 'New Workflow', status: 'draft' })
    mockUpdate.mockResolvedValue(undefined)
    mockDelete.mockResolvedValue(undefined)
    mockExecute.mockResolvedValue(undefined)
    mockGetCheckpoints.mockResolvedValue([sampleCheckpoint])
    mockRestore.mockResolvedValue(sampleWorkflow)
    mockGetReport.mockResolvedValue(sampleReport)
    mockResume.mockResolvedValue(sampleWorkflow)
    mockClearAllCaches.mockResolvedValue(undefined)
  })

  // ===========================
  // Rendering
  // ===========================
  describe('Rendering', () => {
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

    it('shows header with icon and title', () => {
      render(<WorkflowPanel />)
      expect(screen.getByText('Workflow Designer')).toBeInTheDocument()
      expect(screen.getByText('Design multi-agent workflows')).toBeInTheDocument()
    })

    it('shows import button', () => {
      render(<WorkflowPanel />)
      expect(screen.getByText('Import')).toBeInTheDocument()
    })

    it('shows Clear All Caches button', () => {
      render(<WorkflowPanel />)
      expect(screen.getByText('Clear All Caches')).toBeInTheDocument()
    })
  })

  // ===========================
  // Tab switching
  // ===========================
  describe('Tab switching', () => {
    it('switches to saved tab when clicked and loads workflows', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(mockList).toHaveBeenCalledOnce()
      })
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
    })

    it('switches back to design tab when clicked', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Design'))
      expect(screen.getByTestId('visual-orchestrator')).toBeInTheDocument()
    })

    it('clicking Design tab when already on design stays on design', () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Design'))
      expect(screen.getByTestId('visual-orchestrator')).toBeInTheDocument()
    })

    it('reloads workflows when switching to saved tab again', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(mockList).toHaveBeenCalledTimes(1)
      })
      fireEvent.click(screen.getByText('Design'))
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(mockList).toHaveBeenCalledTimes(2)
      })
    })
  })

  // ===========================
  // Saved workflows list
  // ===========================
  describe('Saved workflows list', () => {
    it('displays workflow name and description', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
        expect(screen.getByText('Test description')).toBeInTheDocument()
      })
    })

    it('shows "No description" when description is empty', async () => {
      mockList.mockResolvedValueOnce([{
        ...sampleWorkflow,
        description: '',
      }])
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('No description')).toBeInTheDocument()
      })
    })

    it('shows workflow mode', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('sequential')).toBeInTheDocument()
      })
    })

    it('shows node and edge counts', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('2 nodes')).toBeInTheDocument()
        expect(screen.getByText('1 edges')).toBeInTheDocument()
      })
    })

    it('shows 0 nodes/0 edges for workflow without nodes/edges', async () => {
      mockList.mockResolvedValueOnce([{
        ...sampleWorkflow,
        nodes: undefined,
        edges: undefined,
      }])
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('0 nodes')).toBeInTheDocument()
        expect(screen.getByText('0 edges')).toBeInTheDocument()
      })
    })

    it('shows loading state while fetching workflows', async () => {
      let resolveList: (v: unknown) => void
      mockList.mockReturnValueOnce(new Promise(resolve => { resolveList = resolve }))
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      expect(screen.getByText('Loading workflows...')).toBeInTheDocument()
      await act(async () => { resolveList!([]) })
    })

    it('shows empty state when no saved workflows', async () => {
      mockList.mockResolvedValueOnce([])
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('No saved workflows')).toBeInTheDocument()
        expect(screen.getByText('Design and save a workflow to see it here')).toBeInTheDocument()
      })
    })

    it('renders multiple workflows', async () => {
      mockList.mockResolvedValueOnce([sampleWorkflow, runningWorkflow, failedWorkflow])
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
        expect(screen.getByText('Running Workflow')).toBeInTheDocument()
        expect(screen.getByText('Failed Workflow')).toBeInTheDocument()
      })
    })
  })

  // ===========================
  // Save workflow (via VisualOrchestrator)
  // ===========================
  describe('Save workflow', () => {
    it('calls api.workflows.update when workflow has id', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByTestId('mock-save-btn'))
      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith('wf-1', {
          name: 'Test Save',
          description: 'desc',
        })
      })
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('success', 'Workflow updated', 'Test Save')
      })
    })

    it('calls api.workflows.create when workflow has no id', async () => {
      render(<WorkflowPanel />)
      // Click the "Mock Save New" button which fires onSave without id
      fireEvent.click(screen.getByTestId('mock-save-new-btn'))
      await waitFor(() => {
        expect(mockCreate).toHaveBeenCalledWith({
          name: 'New One',
          description: 'new desc',
        })
      })
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('success', 'Workflow created', 'wf-new')
      })
    })

    it('handles save error (update)', async () => {
      const { logger } = await import('../utils')
      mockUpdate.mockRejectedValueOnce(new Error('Save failed'))
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByTestId('mock-save-btn'))
      await waitFor(() => {
        expect(logger.error).toHaveBeenCalled()
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to save workflow', 'Save failed')
      })
    })

    it('handles save error with non-Error object', async () => {
      mockUpdate.mockRejectedValueOnce('string error')
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByTestId('mock-save-btn'))
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to save workflow', 'Unknown error')
      })
    })

    it('handles create error', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Create failed'))
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByTestId('mock-save-new-btn'))
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to save workflow', 'Create failed')
      })
    })
  })

  // ===========================
  // Run workflow (via VisualOrchestrator)
  // ===========================
  describe('Run workflow', () => {
    it('calls api.workflows.execute when workflow has id', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByTestId('mock-run-btn'))
      await waitFor(() => {
        expect(mockExecute).toHaveBeenCalledWith('wf-1')
        expect(mockAddToast).toHaveBeenCalledWith('success', 'Workflow started', 'Test Run')
      })
    })

    it('does not call execute when workflow has no id', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByTestId('mock-run-no-id-btn'))
      await waitFor(() => {
        expect(mockExecute).not.toHaveBeenCalled()
      })
    })

    it('handles run error', async () => {
      const { logger } = await import('../utils')
      mockExecute.mockRejectedValueOnce(new Error('Run failed'))
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByTestId('mock-run-btn'))
      await waitFor(() => {
        expect(logger.error).toHaveBeenCalled()
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to run workflow', 'Run failed')
      })
    })

    it('handles run error with non-Error object', async () => {
      mockExecute.mockRejectedValueOnce('unknown')
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByTestId('mock-run-btn'))
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to run workflow', 'Unknown error')
      })
    })
  })

  // ===========================
  // Delete workflow
  // ===========================
  describe('Delete workflow', () => {
    it('shows confirm dialog when delete button is clicked', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const deleteButtons = screen.getAllByTitle('Delete')
      fireEvent.click(deleteButtons[0])
      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
        expect(screen.getByTestId('confirm-title')).toHaveTextContent('Delete Workflow')
        expect(screen.getByTestId('confirm-message')).toHaveTextContent('Are you sure you want to delete this workflow?')
        expect(screen.getByTestId('confirm-label')).toHaveTextContent('Delete')
      })
    })

    it('deletes workflow on confirm', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const deleteButtons = screen.getAllByTitle('Delete')
      fireEvent.click(deleteButtons[0])
      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByTestId('confirm-ok'))
      await waitFor(() => {
        expect(mockDelete).toHaveBeenCalledWith('wf-1')
        expect(mockAddToast).toHaveBeenCalledWith('success', 'Workflow deleted')
      })
    })

    it('dismisses confirm dialog on cancel', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const deleteButtons = screen.getAllByTitle('Delete')
      fireEvent.click(deleteButtons[0])
      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByTestId('confirm-cancel'))
      await waitFor(() => {
        expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument()
      })
      expect(mockDelete).not.toHaveBeenCalled()
    })

    it('removes deleted workflow from list after successful delete', async () => {
      mockList.mockResolvedValueOnce([sampleWorkflow])
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const deleteButtons = screen.getAllByTitle('Delete')
      fireEvent.click(deleteButtons[0])
      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByTestId('confirm-ok'))
      await waitFor(() => {
        expect(screen.queryByText('Test Workflow')).not.toBeInTheDocument()
      })
    })

    it('handles delete error', async () => {
      const { logger } = await import('../utils')
      mockDelete.mockRejectedValueOnce(new Error('Delete failed'))
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const deleteButtons = screen.getAllByTitle('Delete')
      fireEvent.click(deleteButtons[0])
      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByTestId('confirm-ok'))
      await waitFor(() => {
        expect(logger.error).toHaveBeenCalled()
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to delete workflow', 'Delete failed')
      })
    })

    it('handles delete error with non-Error object', async () => {
      mockDelete.mockRejectedValueOnce(42)
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const deleteButtons = screen.getAllByTitle('Delete')
      fireEvent.click(deleteButtons[0])
      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByTestId('confirm-ok'))
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to delete workflow', 'Unknown error')
      })
    })
  })

  // ===========================
  // Edit workflow
  // ===========================
  describe('Edit workflow', () => {
    it('switches to design tab with workflow loaded when edit is clicked', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const editButtons = screen.getAllByTitle('Edit')
      fireEvent.click(editButtons[0])
      await waitFor(() => {
        expect(screen.getByTestId('visual-orchestrator')).toBeInTheDocument()
        expect(screen.getByTestId('workflow-name')).toHaveTextContent('Test Workflow')
      })
    })

    it('passes correct workflow id to VisualOrchestrator on edit', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const editButtons = screen.getAllByTitle('Edit')
      fireEvent.click(editButtons[0])
      await waitFor(() => {
        expect(screen.getByTestId('workflow-id')).toHaveTextContent('wf-1')
      })
    })
  })

  // ===========================
  // Run from saved list
  // ===========================
  describe('Run from saved list', () => {
    it('executes workflow via run button in saved list', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const runButtons = screen.getAllByTitle('Run')
      fireEvent.click(runButtons[0])
      await waitFor(() => {
        expect(mockExecute).toHaveBeenCalledWith('wf-1')
        expect(mockAddToast).toHaveBeenCalledWith('success', 'Workflow started', 'Test Workflow')
      })
    })

    it('handles run error from saved list', async () => {
      mockExecute.mockRejectedValueOnce(new Error('Execute failed'))
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const runButtons = screen.getAllByTitle('Run')
      fireEvent.click(runButtons[0])
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to start', 'Execute failed')
      })
    })
  })

  // ===========================
  // Resume workflow
  // ===========================
  describe('Resume workflow', () => {
    it('resumes workflow when resume button clicked', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const resumeButtons = screen.getAllByTitle('Resume')
      fireEvent.click(resumeButtons[0])
      await waitFor(() => {
        expect(mockResume).toHaveBeenCalledWith('wf-1')
        expect(mockAddToast).toHaveBeenCalledWith('success', 'Workflow resumed')
      })
    })

    it('handles resume error', async () => {
      const { logger } = await import('../utils')
      mockResume.mockRejectedValueOnce(new Error('Resume failed'))
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const resumeButtons = screen.getAllByTitle('Resume')
      fireEvent.click(resumeButtons[0])
      await waitFor(() => {
        expect(logger.error).toHaveBeenCalled()
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to resume', 'Resume failed')
      })
    })

    it('handles resume error with non-Error object', async () => {
      mockResume.mockRejectedValueOnce(null)
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const resumeButtons = screen.getAllByTitle('Resume')
      fireEvent.click(resumeButtons[0])
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to resume', 'Unknown error')
      })
    })
  })

  // ===========================
  // Checkpoints
  // ===========================
  describe('Checkpoints', () => {
    it('opens checkpoints modal when checkpoints button clicked', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const checkpointButtons = screen.getAllByTitle('Checkpoints')
      fireEvent.click(checkpointButtons[0])
      await waitFor(() => {
        expect(mockGetCheckpoints).toHaveBeenCalledWith('wf-1')
        expect(screen.getByText('Checkpoints')).toBeInTheDocument()
      })
    })

    it('displays checkpoint items in modal', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const checkpointButtons = screen.getAllByTitle('Checkpoints')
      fireEvent.click(checkpointButtons[0])
      await waitFor(() => {
        expect(screen.getByText('Node 1')).toBeInTheDocument()
        expect(screen.getByText('2024-01-01T12:00:00Z')).toBeInTheDocument()
        expect(screen.getByText('Restore')).toBeInTheDocument()
      })
    })

    it('shows "No checkpoints" when list is empty', async () => {
      mockGetCheckpoints.mockResolvedValueOnce([])
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const checkpointButtons = screen.getAllByTitle('Checkpoints')
      fireEvent.click(checkpointButtons[0])
      await waitFor(() => {
        expect(screen.getByText('No checkpoints')).toBeInTheDocument()
      })
    })

    it('restores checkpoint when Restore button clicked', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const checkpointButtons = screen.getAllByTitle('Checkpoints')
      fireEvent.click(checkpointButtons[0])
      await waitFor(() => {
        expect(screen.getByText('Restore')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Restore'))
      await waitFor(() => {
        expect(mockRestore).toHaveBeenCalledWith('wf-1', 'cp-1')
        expect(mockAddToast).toHaveBeenCalledWith('success', 'Workflow restored', 'Restored to checkpoint cp-1')
      })
    })

    it('closes checkpoints modal after restore', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const checkpointButtons = screen.getAllByTitle('Checkpoints')
      fireEvent.click(checkpointButtons[0])
      await waitFor(() => {
        expect(screen.getByText('Restore')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Restore'))
      await waitFor(() => {
        // The modal should close
        expect(screen.queryByRole('dialog', { name: 'Workflow Checkpoints' })).not.toBeInTheDocument()
      })
    })

    it('closes checkpoints modal via close button', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const checkpointButtons = screen.getAllByTitle('Checkpoints')
      fireEvent.click(checkpointButtons[0])
      await waitFor(() => {
        expect(screen.getByText('Checkpoints')).toBeInTheDocument()
      })
      const closeButtons = screen.getAllByLabelText('Close')
      fireEvent.click(closeButtons[0])
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Workflow Checkpoints' })).not.toBeInTheDocument()
      })
    })

    it('handles checkpoint load error', async () => {
      const { logger } = await import('../utils')
      mockGetCheckpoints.mockRejectedValueOnce(new Error('Load checkpoints failed'))
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const checkpointButtons = screen.getAllByTitle('Checkpoints')
      fireEvent.click(checkpointButtons[0])
      await waitFor(() => {
        expect(logger.error).toHaveBeenCalled()
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to load checkpoints', 'Load checkpoints failed')
      })
    })

    it('handles checkpoint restore error', async () => {
      const { logger } = await import('../utils')
      mockRestore.mockRejectedValueOnce(new Error('Restore failed'))
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const checkpointButtons = screen.getAllByTitle('Checkpoints')
      fireEvent.click(checkpointButtons[0])
      await waitFor(() => {
        expect(screen.getByText('Restore')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Restore'))
      await waitFor(() => {
        expect(logger.error).toHaveBeenCalled()
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to restore', 'Restore failed')
      })
    })

    it('shows checkpoint id when currentNode is empty', async () => {
      mockGetCheckpoints.mockResolvedValueOnce([{
        ...sampleCheckpoint,
        currentNode: '',
      }])
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const checkpointButtons = screen.getAllByTitle('Checkpoints')
      fireEvent.click(checkpointButtons[0])
      await waitFor(() => {
        expect(screen.getByText('cp-1')).toBeInTheDocument()
      })
    })

    it('handles checkpoint load error with non-Error object', async () => {
      mockGetCheckpoints.mockRejectedValueOnce('bad')
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const checkpointButtons = screen.getAllByTitle('Checkpoints')
      fireEvent.click(checkpointButtons[0])
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to load checkpoints', 'Unknown error')
      })
    })

    it('handles checkpoint restore error with non-Error object', async () => {
      mockRestore.mockRejectedValueOnce('bad')
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const checkpointButtons = screen.getAllByTitle('Checkpoints')
      fireEvent.click(checkpointButtons[0])
      await waitFor(() => {
        expect(screen.getByText('Restore')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Restore'))
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to restore', 'Unknown error')
      })
    })
  })

  // ===========================
  // Execution Report
  // ===========================
  describe('Execution Report', () => {
    it('opens report modal when report button clicked', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const reportButtons = screen.getAllByTitle('Report')
      fireEvent.click(reportButtons[0])
      await waitFor(() => {
        expect(mockGetReport).toHaveBeenCalledWith('wf-1')
        expect(screen.getByText('Execution Report')).toBeInTheDocument()
      })
    })

    it('displays report status, duration, and node counts', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const reportButtons = screen.getAllByTitle('Report')
      fireEvent.click(reportButtons[0])
      await waitFor(() => {
        expect(screen.getByText('completed')).toBeInTheDocument()
        expect(screen.getByText('5s')).toBeInTheDocument()
        expect(screen.getByText('2/2')).toBeInTheDocument()
      })
    })

    it('shows succeeded nodes in report', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const reportButtons = screen.getAllByTitle('Report')
      fireEvent.click(reportButtons[0])
      await waitFor(() => {
        expect(screen.getByText('Succeeded (2)')).toBeInTheDocument()
        expect(screen.getByText(/n1 — 2s/)).toBeInTheDocument()
        expect(screen.getByText(/n2 — 3s/)).toBeInTheDocument()
      })
    })

    it('shows failed nodes in report', async () => {
      mockGetReport.mockResolvedValueOnce({
        ...sampleReport,
        status: 'failed',
        successCount: 1,
        failureCount: 1,
        succeededNodes: [
          { nodeId: 'n1', status: 'completed', durationMs: 2000 },
        ],
        failedNodes: [
          { nodeId: 'n2', failureType: 'timeout', errorMessage: 'Node timed out', timestamp: '2024-01-01T12:00:00Z', durationMs: 1000, retryable: true },
        ],
      })
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const reportButtons = screen.getAllByTitle('Report')
      fireEvent.click(reportButtons[0])
      await waitFor(() => {
        expect(screen.getByText('Failed (1)')).toBeInTheDocument()
        expect(screen.getByText(/n2 — Node timed out/)).toBeInTheDocument()
      })
    })

    it('shows "Unknown error" for failed node with no errorMessage', async () => {
      mockGetReport.mockResolvedValueOnce({
        ...sampleReport,
        status: 'failed',
        successCount: 0,
        failureCount: 1,
        succeededNodes: [],
        failedNodes: [
          { nodeId: 'n2', failureType: 'system', errorMessage: '', timestamp: '2024-01-01T12:00:00Z', durationMs: 0, retryable: false },
        ],
      })
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const reportButtons = screen.getAllByTitle('Report')
      fireEvent.click(reportButtons[0])
      await waitFor(() => {
        expect(screen.getByText(/n2 — Unknown error/)).toBeInTheDocument()
      })
    })

    it('shows N/A for duration when durationMs is 0', async () => {
      mockGetReport.mockResolvedValueOnce({
        ...sampleReport,
        durationMs: 0,
      })
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const reportButtons = screen.getAllByTitle('Report')
      fireEvent.click(reportButtons[0])
      await waitFor(() => {
        expect(screen.getByText('N/A')).toBeInTheDocument()
      })
    })

    it('closes report modal via close button', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const reportButtons = screen.getAllByTitle('Report')
      fireEvent.click(reportButtons[0])
      await waitFor(() => {
        expect(screen.getByText('Execution Report')).toBeInTheDocument()
      })
      const closeButtons = screen.getAllByLabelText('Close')
      fireEvent.click(closeButtons[closeButtons.length - 1])
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Workflow Report' })).not.toBeInTheDocument()
      })
    })

    it('does not show succeeded section when no succeeded nodes', async () => {
      mockGetReport.mockResolvedValueOnce({
        ...sampleReport,
        succeededNodes: [],
        successCount: 0,
      })
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const reportButtons = screen.getAllByTitle('Report')
      fireEvent.click(reportButtons[0])
      await waitFor(() => {
        expect(screen.getByText('Execution Report')).toBeInTheDocument()
        expect(screen.queryByText(/Succeeded \(/)).not.toBeInTheDocument()
      })
    })

    it('does not show failed section when no failed nodes', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const reportButtons = screen.getAllByTitle('Report')
      fireEvent.click(reportButtons[0])
      await waitFor(() => {
        expect(screen.getByText('Execution Report')).toBeInTheDocument()
        expect(screen.queryByText(/Failed \(/)).not.toBeInTheDocument()
      })
    })

    it('handles report load error', async () => {
      const { logger } = await import('../utils')
      mockGetReport.mockRejectedValueOnce(new Error('Report failed'))
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const reportButtons = screen.getAllByTitle('Report')
      fireEvent.click(reportButtons[0])
      await waitFor(() => {
        expect(logger.error).toHaveBeenCalled()
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to load report', 'Report failed')
      })
    })

    it('handles report load error with non-Error object', async () => {
      mockGetReport.mockRejectedValueOnce(undefined)
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const reportButtons = screen.getAllByTitle('Report')
      fireEvent.click(reportButtons[0])
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to load report', 'Unknown error')
      })
    })
  })

  // ===========================
  // Export workflow
  // ===========================
  describe('Export workflow', () => {
    it('exports workflow when export button clicked', async () => {
      const createObjectURLSpy = vi.fn(() => 'blob:test')
      const revokeObjectURLSpy = vi.fn()
      const mockClick = vi.fn()
      vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURLSpy)
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURLSpy)

      const originalCreateElement = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = originalCreateElement(tag)
        if (tag === 'a') {
          el.click = mockClick
        }
        return el
      })

      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      const exportButtons = screen.getAllByTitle('Export')
      fireEvent.click(exportButtons[0])

      await waitFor(() => {
        expect(createObjectURLSpy).toHaveBeenCalled()
        expect(mockClick).toHaveBeenCalled()
        expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test')
        expect(mockAddToast).toHaveBeenCalledWith('success', 'Workflow exported', 'Test Workflow')
      })

      vi.restoreAllMocks()
    })
  })

  // ===========================
  // Import workflow
  // ===========================
  describe('Import workflow', () => {
    it('creates file input and clicks it when import button is clicked', () => {
      const mockClick = vi.fn()
      const originalCreateElement = document.createElement.bind(document)
      let createdInput: HTMLInputElement | null = null

      vi.spyOn(document, 'createElement').mockImplementation((tag: string): HTMLElement => {
        const el = originalCreateElement(tag)
        if (tag === 'input') {
          createdInput = el as HTMLInputElement
          el.click = mockClick
        }
        return el
      })

      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Import'))
      expect(mockClick).toHaveBeenCalled()
      expect((createdInput as unknown as HTMLInputElement).type).toBe('file')
      expect((createdInput as unknown as HTMLInputElement).accept).toBe('.json')

      vi.restoreAllMocks()
    })

    it('imports a valid workflow JSON file', async () => {
      const validWorkflow = {
        name: 'Imported Workflow',
        nodes: [{ id: 'n1', name: 'Node1', type: 'coder', x: 0, y: 0, status: 'idle' }],
        edges: [],
      }
      const fileContent = JSON.stringify(validWorkflow)
      const file = new File([fileContent], 'imported.json', { type: 'application/json' })

      let capturedOnchange: ((e: Event) => void) | null = null
      const originalCreateElement = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = originalCreateElement(tag)
        if (tag === 'input') {
          Object.defineProperty(el, 'onchange', {
            set(v: unknown) { capturedOnchange = v as (e: Event) => void },
            get() { return capturedOnchange },
            configurable: true,
          })
          el.click = vi.fn()
        }
        return el
      })

      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Import'))

      expect(capturedOnchange).toBeTruthy()

      const event = new Event('change', { bubbles: true })
      Object.defineProperty(event, 'target', { value: { files: [file] } })

      await act(async () => {
        capturedOnchange!(event)
      })

      await waitFor(() => {
        expect(screen.getByTestId('visual-orchestrator')).toBeInTheDocument()
        expect(screen.getByTestId('workflow-name')).toHaveTextContent('Imported Workflow')
        expect(mockAddToast).toHaveBeenCalledWith('success', 'Workflow imported', 'Imported Workflow')
      })

      vi.restoreAllMocks()
    })

    it('shows error toast for invalid workflow JSON (missing required fields)', async () => {
      const invalidWorkflow = { name: 123, nodes: 'not array' }
      const fileContent = JSON.stringify(invalidWorkflow)
      const file = new File([fileContent], 'invalid.json', { type: 'application/json' })

      let capturedOnchange: ((e: Event) => void) | null = null
      const originalCreateElement = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = originalCreateElement(tag)
        if (tag === 'input') {
          Object.defineProperty(el, 'onchange', {
            set(v: unknown) { capturedOnchange = v as (e: Event) => void },
            get() { return capturedOnchange },
            configurable: true,
          })
          el.click = vi.fn()
        }
        return el
      })

      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Import'))

      const event = new Event('change', { bubbles: true })
      Object.defineProperty(event, 'target', { value: { files: [file] } })

      await act(async () => {
        capturedOnchange!(event)
      })

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to import workflow', 'Invalid workflow format: requires name, nodes array, and edges array')
      })

      vi.restoreAllMocks()
    })

    it('shows error toast for invalid JSON file', async () => {
      const file = new File(['not valid json{'], 'bad.json', { type: 'application/json' })

      let capturedOnchange: ((e: Event) => void) | null = null
      const originalCreateElement = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = originalCreateElement(tag)
        if (tag === 'input') {
          Object.defineProperty(el, 'onchange', {
            set(v: unknown) { capturedOnchange = v as (e: Event) => void },
            get() { return capturedOnchange },
            configurable: true,
          })
          el.click = vi.fn()
        }
        return el
      })

      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Import'))

      const event = new Event('change', { bubbles: true })
      Object.defineProperty(event, 'target', { value: { files: [file] } })

      await act(async () => {
        capturedOnchange!(event)
      })

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to import workflow', 'Invalid JSON file')
      })

      vi.restoreAllMocks()
    })

    it('does nothing when no file is selected', async () => {
      let capturedOnchange: ((e: Event) => void) | null = null
      const originalCreateElement = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = originalCreateElement(tag)
        if (tag === 'input') {
          Object.defineProperty(el, 'onchange', {
            set(v: unknown) { capturedOnchange = v as (e: Event) => void },
            get() { return capturedOnchange },
            configurable: true,
          })
          el.click = vi.fn()
        }
        return el
      })

      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Import'))

      const event = new Event('change', { bubbles: true })
      Object.defineProperty(event, 'target', { value: { files: [] } })

      await act(async () => {
        capturedOnchange!(event)
      })

      expect(mockAddToast).not.toHaveBeenCalled()
      vi.restoreAllMocks()
    })
  })

  // ===========================
  // isValidWorkflow validation (via import)
  // ===========================
  describe('isValidWorkflow validation (via import)', () => {
    async function testImportWithContent(content: string) {
      const file = new File([content], 'test.json', { type: 'application/json' })
      let capturedOnchange: ((e: Event) => void) | null = null
      const originalCreateElement = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = originalCreateElement(tag)
        if (tag === 'input') {
          Object.defineProperty(el, 'onchange', {
            set(v: unknown) { capturedOnchange = v as (e: Event) => void },
            get() { return capturedOnchange },
            configurable: true,
          })
          el.click = vi.fn()
        }
        return el
      })

      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Import'))
      const event = new Event('change', { bubbles: true })
      Object.defineProperty(event, 'target', { value: { files: [file] } })
      await act(async () => { capturedOnchange!(event) })
      vi.restoreAllMocks()
    }

    it('rejects null data', async () => {
      await testImportWithContent('null')
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to import workflow', 'Invalid workflow format: requires name, nodes array, and edges array')
      })
    })

    it('rejects non-object data (string)', async () => {
      await testImportWithContent('"string"')
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to import workflow', 'Invalid workflow format: requires name, nodes array, and edges array')
      })
    })

    it('rejects object without name string', async () => {
      await testImportWithContent(JSON.stringify({ nodes: [], edges: [] }))
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to import workflow', 'Invalid workflow format: requires name, nodes array, and edges array')
      })
    })

    it('rejects object without nodes array', async () => {
      await testImportWithContent(JSON.stringify({ name: 'test', edges: [] }))
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to import workflow', 'Invalid workflow format: requires name, nodes array, and edges array')
      })
    })

    it('rejects object without edges array', async () => {
      await testImportWithContent(JSON.stringify({ name: 'test', nodes: [] }))
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to import workflow', 'Invalid workflow format: requires name, nodes array, and edges array')
      })
    })

    it('accepts valid workflow with all required fields', async () => {
      await testImportWithContent(JSON.stringify({ name: 'valid', nodes: [], edges: [] }))
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('success', 'Workflow imported', 'valid')
      })
    })
  })

  // ===========================
  // Clear caches
  // ===========================
  describe('Clear caches', () => {
    it('clears caches when button clicked', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Clear All Caches'))
      await waitFor(() => {
        expect(mockClearAllCaches).toHaveBeenCalled()
        expect(mockAddToast).toHaveBeenCalledWith('success', 'Caches cleared')
      })
    })

    it('handles clear caches error', async () => {
      const { logger } = await import('../utils')
      mockClearAllCaches.mockRejectedValueOnce(new Error('Cache clear failed'))
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Clear All Caches'))
      await waitFor(() => {
        expect(logger.error).toHaveBeenCalled()
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to clear caches', 'Cache clear failed')
      })
    })

    it('handles clear caches error with non-Error object', async () => {
      mockClearAllCaches.mockRejectedValueOnce({ msg: 'fail' })
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Clear All Caches'))
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to clear caches', 'Unknown error')
      })
    })
  })

  // ===========================
  // Error handling for list
  // ===========================
  describe('Load workflows error handling', () => {
    it('handles error loading workflows', async () => {
      const { logger } = await import('../utils')
      mockList.mockRejectedValueOnce(new Error('Load failed'))
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(logger.error).toHaveBeenCalled()
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to load workflows', 'Load failed')
      })
    })

    it('handles error loading workflows with non-Error object', async () => {
      mockList.mockRejectedValueOnce(undefined)
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to load workflows', 'Unknown error')
      })
    })

    it('clears loading state after error', async () => {
      mockList.mockRejectedValueOnce(new Error('fail'))
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      expect(screen.getByText('Loading workflows...')).toBeInTheDocument()
      await waitFor(() => {
        expect(screen.queryByText('Loading workflows...')).not.toBeInTheDocument()
      })
    })
  })

  // ===========================
  // toDesignerWorkflow conversion (via edit)
  // ===========================
  describe('toDesignerWorkflow conversion (via edit)', () => {
    it('converts workflow with missing node positions to default 0,0', async () => {
      const wfNoPosition = {
        ...sampleWorkflow,
        nodes: [
          { id: 'n1', name: 'Node 1', type: 'coder' },
        ],
        edges: [
          { id: 'e1', from: 'n1', to: 'n2', label: '' },
        ],
      }
      mockList.mockResolvedValueOnce([wfNoPosition])
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      fireEvent.click(screen.getAllByTitle('Edit')[0])
      await waitFor(() => {
        expect(screen.getByTestId('visual-orchestrator')).toBeInTheDocument()
      })
    })

    it('converts workflow with missing nodes/edges to empty arrays', async () => {
      const wfEmptyArrays = {
        ...sampleWorkflow,
        nodes: undefined,
        edges: undefined,
      }
      mockList.mockResolvedValueOnce([wfEmptyArrays])
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      fireEvent.click(screen.getAllByTitle('Edit')[0])
      await waitFor(() => {
        expect(screen.getByTestId('visual-orchestrator')).toBeInTheDocument()
      })
    })
  })

  // ===========================
  // Report node duration display
  // ===========================
  describe('Report node duration display', () => {
    it('shows empty string for node duration when durationMs is 0', async () => {
      mockGetReport.mockResolvedValueOnce({
        ...sampleReport,
        succeededNodes: [
          { nodeId: 'n1', status: 'completed', durationMs: 0 },
        ],
        successCount: 1,
      })
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        expect(screen.getByText('Test Workflow')).toBeInTheDocument()
      })
      fireEvent.click(screen.getAllByTitle('Report')[0])
      await waitFor(() => {
        const nodeEntry = screen.getByText(/n1/)
        expect(nodeEntry.textContent).toBe('n1 — ')
      })
    })
  })

  // ===========================
  // Workflow status color classes
  // ===========================
  describe('Workflow status styling', () => {
    it('applies success color for running status', async () => {
      mockList.mockResolvedValueOnce([runningWorkflow])
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        const statusEl = screen.getByText('running')
        expect(statusEl.className).toContain('text-success')
      })
    })

    it('applies error color for failed status', async () => {
      mockList.mockResolvedValueOnce([failedWorkflow])
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        const statusEl = screen.getByText('failed')
        expect(statusEl.className).toContain('text-error')
      })
    })

    it('no special color for draft status', async () => {
      render(<WorkflowPanel />)
      fireEvent.click(screen.getByText('Saved'))
      await waitFor(() => {
        const statusEl = screen.getByText('draft')
        expect(statusEl.className).not.toContain('text-success')
        expect(statusEl.className).not.toContain('text-error')
      })
    })
  })
})
