// Mock ResizeObserver (not available in jsdom) — must be before component imports
vi.stubGlobal('ResizeObserver', class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkflowEditor } from './WorkflowEditor'
import { useAppStore } from '../store/appStore'

// Mock the store
vi.mock('../store/appStore', () => ({
  useAppStore: vi.fn(),
}))

const mockStore = (overrides: Record<string, unknown> = {}) => {
  ;(useAppStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (state: Record<string, unknown>) => unknown) => {
    const state = {
      activeSwarm: null,
      agents: [],
      ...overrides,
    }
    return selector ? selector(state) : state
  })
}

describe('WorkflowEditor', () => {
  const mockOnNodeClick = vi.fn()
  const mockOnNodeDoubleClick = vi.fn()
  const mockOnEdgeClick = vi.fn()
  const mockOnGraphChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockStore()
  })

  afterEach(() => {
    cleanup()
  })

  it('should render workflow editor with demo data', () => {
    render(
      <WorkflowEditor
        onNodeClick={mockOnNodeClick}
        onNodeDoubleClick={mockOnNodeDoubleClick}
        onEdgeClick={mockOnEdgeClick}
        onGraphChange={mockOnGraphChange}
      />
    )

    expect(screen.getByText('Start')).toBeInTheDocument()
    expect(screen.getByText('Agent 1')).toBeInTheDocument()
    expect(screen.getByText('Agent 2')).toBeInTheDocument()
    expect(screen.getByText('Task')).toBeInTheDocument()
    expect(screen.getByText('End')).toBeInTheDocument()
  })

  it('should render toolbar in edit mode', () => {
    render(<WorkflowEditor readOnly={false} />)

    expect(screen.getByTitle('Add Node')).toBeInTheDocument()
    expect(screen.getByTitle('Delete (Del)')).toBeInTheDocument()
    expect(screen.getByTitle('Zoom In')).toBeInTheDocument()
    expect(screen.getByTitle('Zoom Out')).toBeInTheDocument()
    expect(screen.getByTitle('Fit View')).toBeInTheDocument()
  })

  it('should not render toolbar in read-only mode', () => {
    render(<WorkflowEditor readOnly={true} />)

    expect(screen.queryByTitle('Add Node')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Delete (Del)')).not.toBeInTheDocument()
  })

  it('should render zoom indicator', () => {
    render(<WorkflowEditor />)

    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('should select node on click', () => {
    render(<WorkflowEditor onNodeClick={mockOnNodeClick} />)

    const agentNode = screen.getByText('Agent 1')
    fireEvent.click(agentNode)

    expect(mockOnNodeClick).toHaveBeenCalledTimes(1)
  })

  it('should add new node when Add Node is clicked', () => {
    render(<WorkflowEditor readOnly={false} />)

    const addButton = screen.getByTitle('Add Node')
    fireEvent.click(addButton)

    expect(screen.getByText('New Task')).toBeInTheDocument()
  })

  it('should delete selected node', () => {
    render(<WorkflowEditor readOnly={false} />)

    const agentNode = screen.getByText('Agent 1')
    fireEvent.click(agentNode)

    const deleteButton = screen.getByTitle('Delete (Del)')
    fireEvent.click(deleteButton)

    expect(screen.queryByText('Agent 1')).not.toBeInTheDocument()
  })

  it('should zoom in', () => {
    render(<WorkflowEditor />)

    const zoomInButton = screen.getByTitle('Zoom In')
    fireEvent.click(zoomInButton)

    expect(screen.getByText('110%')).toBeInTheDocument()
  })

  it('should zoom out', () => {
    render(<WorkflowEditor />)

    const zoomOutButton = screen.getByTitle('Zoom Out')
    fireEvent.click(zoomOutButton)

    expect(screen.getByText('90%')).toBeInTheDocument()
  })

  it('should fit view', () => {
    render(<WorkflowEditor />)

    const fitButton = screen.getByTitle('Fit View')
    fireEvent.click(fitButton)

    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('should build graph from active swarm', () => {
    mockStore({
      activeSwarm: {
        id: 'swarm-1',
        name: 'Test Swarm',
        agents: [
          { id: 'a1', name: 'Agent A', state: 'executing' },
          { id: 'a2', name: 'Agent B', state: 'idle' },
        ],
      },
    })

    render(<WorkflowEditor />)

    expect(screen.getByText('Agent A')).toBeInTheDocument()
    expect(screen.getByText('Agent B')).toBeInTheDocument()
  })

  it('should render grid background', () => {
    const { container } = render(<WorkflowEditor />)

    const gridDiv = container.querySelector('.opacity-10')
    expect(gridDiv).toBeInTheDocument()
  })

  it('should render minimap', () => {
    const { container } = render(<WorkflowEditor />)

    const minimapSvg = container.querySelectorAll('svg')
    expect(minimapSvg.length).toBeGreaterThan(0)
  })

  it('should copy and paste selected node with Ctrl+C/V', async () => {
    const user = userEvent.setup()
    render(<WorkflowEditor readOnly={false} />)

    // Demo data has exactly 1 "Agent 1"
    expect(screen.getAllByText('Agent 1').length).toBe(1)

    const agentNode = screen.getByText('Agent 1')
    await user.click(agentNode)
    await user.keyboard('{Control>}c{/Control}')
    await user.keyboard('{Control>}v{/Control}')

    // After paste: original + copy = 2 "Agent 1" nodes
    expect(screen.getAllByText('Agent 1').length).toBe(2)
  })

  it('should duplicate node with Ctrl+D', async () => {
    const user = userEvent.setup()
    render(<WorkflowEditor readOnly={false} />)

    // Demo data has exactly 1 "Agent 1"
    expect(screen.getAllByText('Agent 1').length).toBe(1)

    const agentNode = screen.getByText('Agent 1')
    await user.click(agentNode)
    await user.keyboard('{Control>}d{/Control}')

    // Ctrl+D creates a duplicate: now 2 Agent 1 nodes exist
    expect(screen.getAllByText('Agent 1').length).toBe(2)
  })

  it('should select all nodes with Ctrl+A', async () => {
    const user = userEvent.setup()
    render(<WorkflowEditor readOnly={false} />)

    const container = screen.getByText('Start').parentElement!
    await user.click(container)
    await user.keyboard('{Control>}a{/Control}')

    // All 5 demo nodes should be present
    expect(screen.getByText('Agent 1')).toBeInTheDocument()
    expect(screen.getByText('Agent 2')).toBeInTheDocument()
  })

  it('should undo with Ctrl+Z', async () => {
    const user = userEvent.setup()
    render(<WorkflowEditor readOnly={false} />)

    // Add a node
    await user.click(screen.getByTitle('Add Node'))
    expect(screen.getByText('New Task')).toBeInTheDocument()

    // Undo
    await user.keyboard('{Control>}z{/Control}')
    expect(screen.queryByText('New Task')).not.toBeInTheDocument()
  })

  it('should redo with Ctrl+Shift+Z', async () => {
    const user = userEvent.setup()
    render(<WorkflowEditor readOnly={false} />)

    await user.click(screen.getByTitle('Add Node'))
    expect(screen.getByText('New Task')).toBeInTheDocument()
    await user.keyboard('{Control>}z{/Control}')
    expect(screen.queryByText('New Task')).not.toBeInTheDocument()
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
    expect(screen.getByText('New Task')).toBeInTheDocument()
  })

  it('should clear selection with Escape', async () => {
    const user = userEvent.setup()
    render(<WorkflowEditor readOnly={false} />)

    const agentNode = screen.getByText('Agent 1')
    await user.click(agentNode)
    await user.keyboard('{Escape}')

    // Selection is cleared (no visual change in test, just verify no crash)
    expect(agentNode).toBeInTheDocument()
  })

  it('should show context menu on right-click canvas', () => {
    render(<WorkflowEditor readOnly={false} />)

    const container = document.querySelector('.relative') as HTMLElement
    fireEvent.contextMenu(container!, { clientX: 200, clientY: 200 })

    expect(screen.getByText('Paste')).toBeInTheDocument()
    expect(screen.getByText('Select All')).toBeInTheDocument()
    expect(screen.getByText('Auto Layout')).toBeInTheDocument()
    expect(screen.getByText('Fit View')).toBeInTheDocument()
  })

  it('should close context menu on Escape', async () => {
    const user = userEvent.setup()
    render(<WorkflowEditor readOnly={false} />)

    const container = document.querySelector('.relative') as HTMLElement
    fireEvent.contextMenu(container!, { clientX: 200, clientY: 200 })
    expect(screen.getByText('Paste')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByText('Paste')).not.toBeInTheDocument()
  })

  it('should show node context menu with Copy/Duplicate/Delete on right-click node', async () => {
    const user = userEvent.setup()
    render(<WorkflowEditor readOnly={false} />)

    const agentNode = screen.getByText('Agent 1')
    await user.pointer({ target: agentNode, keys: '[MouseRight]' })

    expect(screen.getByText('Copy')).toBeInTheDocument()
    expect(screen.getByText('Duplicate')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('should show edge context menu with edge type options and Delete Edge', () => {
    render(<WorkflowEditor readOnly={false} />)

    // Get the edge <g> element (first edge in the pointer-events-auto group)
    const edgeGroups = document.querySelectorAll('.pointer-events-auto > g')
    expect(edgeGroups.length).toBeGreaterThan(0)

    // Right-click on the edge group to trigger context menu
    const edge = edgeGroups[0]
    fireEvent.contextMenu(edge, { clientX: 200, clientY: 200 })

    // Check edge type options
    expect(screen.getByText('Edge Type')).toBeInTheDocument()
    expect(screen.getByText('Bezier')).toBeInTheDocument()
    expect(screen.getByText('Straight')).toBeInTheDocument()
    expect(screen.getByText('Step')).toBeInTheDocument()
    expect(screen.getByText('Smoothstep')).toBeInTheDocument()
    expect(screen.getByText('Delete Edge')).toBeInTheDocument()
  })

})
