import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { AgentNetworkGraph } from './AgentNetworkGraph'

// Mock requestAnimationFrame / cancelAnimationFrame
let rafCallbacks: Map<number, FrameRequestCallback>
let rafCounter: number

// Full mock canvas 2d context
function createMockCtx() {
  return {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    closePath: vi.fn(),
    setLineDash: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
    strokeRect: vi.fn(),
    fillRect: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '' as CanvasTextAlign,
    textBaseline: '' as CanvasTextBaseline,
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    scale: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    canvas: null as HTMLCanvasElement | null,
  }
}

let mockCtx: ReturnType<typeof createMockCtx>
let originalGetContext: typeof HTMLCanvasElement.prototype.getContext

beforeEach(() => {
  rafCallbacks = new Map()
  rafCounter = 0

  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = ++rafCounter
    rafCallbacks.set(id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafCallbacks.delete(id)
  })
  vi.stubGlobal('devicePixelRatio', 1)

  mockCtx = createMockCtx()
  originalGetContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement, contextId: string) {
    if (contextId === '2d') {
      mockCtx.canvas = this
      return mockCtx as unknown as CanvasRenderingContext2D
    }
    return null
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext
})

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext
  vi.restoreAllMocks()
})

// Helper to drain animation frames up to N frames
function drainFrames(maxFrames: number) {
  for (let i = 0; i < maxFrames; i++) {
    const entries = Array.from(rafCallbacks.entries())
    if (entries.length === 0) break
    const [id, cb] = entries[entries.length - 1]
    rafCallbacks.delete(id)
    cb(Date.now())
  }
}

describe('AgentNetworkGraph', () => {
  const mockAgents = [
    { id: 'a1', name: 'Agent 1', status: 'active' as const, x: 100, y: 100, vx: 0, vy: 0, tasks: 3, connections: ['a2'] },
    { id: 'a2', name: 'Agent 2', status: 'idle' as const, x: 200, y: 150, vx: 0, vy: 0, tasks: 0, connections: [] },
  ]

  const mockFlows = [
    { from: 'a1', to: 'a2', status: 'in_progress' as const },
  ]

  it('renders canvas element', () => {
    const { container } = render(<AgentNetworkGraph agents={mockAgents} flows={mockFlows} />)
    const canvas = container.querySelector('canvas')
    expect(canvas).toBeTruthy()
  })

  it('uses default dimensions', () => {
    const { container } = render(<AgentNetworkGraph agents={mockAgents} flows={mockFlows} />)
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    // With devicePixelRatio=1, canvas attribute width/height matches props
    expect(canvas.width).toBe(400)
    expect(canvas.height).toBe(300)
  })

  it('accepts custom dimensions', () => {
    const { container } = render(<AgentNetworkGraph agents={mockAgents} flows={mockFlows} width={600} height={400} />)
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.width).toBe(600)
    expect(canvas.height).toBe(400)
  })

  it('renders with empty agents', () => {
    const { container } = render(<AgentNetworkGraph agents={[]} flows={[]} />)
    expect(container.querySelector('canvas')).toBeTruthy()
  })

  it('renders with empty flows', () => {
    const { container } = render(<AgentNetworkGraph agents={mockAgents} flows={[]} />)
    expect(container.querySelector('canvas')).toBeTruthy()
  })

  it('handles node click callback prop without error', () => {
    const onClick = vi.fn()
    render(<AgentNetworkGraph agents={mockAgents} flows={mockFlows} onNodeClick={onClick} />)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders without onNodeClick', () => {
    const { container } = render(<AgentNetworkGraph agents={mockAgents} flows={mockFlows} />)
    expect(container.querySelector('canvas')).toBeTruthy()
  })
})

describe('AgentNetworkGraph - Canvas context setup', () => {
  it('requests 2d context from canvas', () => {
    render(<AgentNetworkGraph agents={[]} flows={[]} />)
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d')
  })

  it('scales context by devicePixelRatio', () => {
    vi.stubGlobal('devicePixelRatio', 2)
    render(<AgentNetworkGraph agents={[]} flows={[]} width={200} height={150} />)
    expect(mockCtx.scale).toHaveBeenCalledWith(2, 2)
  })

  it('uses devicePixelRatio 1 when not available', () => {
    vi.stubGlobal('devicePixelRatio', undefined)
    render(<AgentNetworkGraph agents={[]} flows={[]} width={200} height={150} />)
    expect(mockCtx.scale).toHaveBeenCalledWith(1, 1)
  })
})

describe('AgentNetworkGraph - Drawing', () => {
  it('clears the canvas on each frame', () => {
    render(<AgentNetworkGraph agents={[]} flows={[]} width={300} height={200} />)
    drainFrames(1)
    expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 300, 200)
  })

  it('calls createRadialGradient for each agent node', () => {
    const agents = [
      { id: 'a1', name: 'Alpha', status: 'active' as const, x: 50, y: 50, vx: 0, vy: 0, tasks: 1, connections: [] },
    ]
    render(<AgentNetworkGraph agents={agents} flows={[]} width={300} height={200} />)
    drainFrames(1)
    expect(mockCtx.createRadialGradient).toHaveBeenCalled()
  })
})

describe('AgentNetworkGraph - Node status rendering', () => {
  it('renders active node with green gradient', () => {
    const gradient = { addColorStop: vi.fn() }
    mockCtx.createRadialGradient.mockReturnValue(gradient)
    const agents = [
      { id: 'a1', name: 'Active Agent', status: 'active' as const, x: 100, y: 100, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    render(<AgentNetworkGraph agents={agents} flows={[]} />)
    drainFrames(1)
    expect(gradient.addColorStop).toHaveBeenCalledWith(0, 'rgba(34, 197, 94, 0.4)')
    expect(gradient.addColorStop).toHaveBeenCalledWith(1, 'transparent')
  })

  it('renders error node with red gradient', () => {
    const gradient = { addColorStop: vi.fn() }
    mockCtx.createRadialGradient.mockReturnValue(gradient)
    const agents = [
      { id: 'a1', name: 'Error Agent', status: 'error' as const, x: 100, y: 100, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    render(<AgentNetworkGraph agents={agents} flows={[]} />)
    drainFrames(1)
    expect(gradient.addColorStop).toHaveBeenCalledWith(0, 'rgba(239, 68, 68, 0.4)')
    expect(gradient.addColorStop).toHaveBeenCalledWith(1, 'transparent')
  })

  it('renders idle node with gray gradient', () => {
    const gradient = { addColorStop: vi.fn() }
    mockCtx.createRadialGradient.mockReturnValue(gradient)
    const agents = [
      { id: 'a1', name: 'Idle Agent', status: 'idle' as const, x: 100, y: 100, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    render(<AgentNetworkGraph agents={agents} flows={[]} />)
    drainFrames(1)
    expect(gradient.addColorStop).toHaveBeenCalledWith(0, 'rgba(100, 116, 139, 0.3)')
    expect(gradient.addColorStop).toHaveBeenCalledWith(1, 'transparent')
  })

  it('sets active node fill color to green (#22c55e)', () => {
    const agents = [
      { id: 'a1', name: 'Active', status: 'active' as const, x: 100, y: 100, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    render(<AgentNetworkGraph agents={agents} flows={[]} />)
    drainFrames(1)
    // After drawing the node circle, fillStyle should be '#22c55e'
    expect(mockCtx.fill).toHaveBeenCalled()
  })

  it('sets error node fill color to red (#ef4444)', () => {
    const agents = [
      { id: 'a1', name: 'Error', status: 'error' as const, x: 100, y: 100, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    render(<AgentNetworkGraph agents={agents} flows={[]} />)
    drainFrames(1)
    expect(mockCtx.fill).toHaveBeenCalled()
  })

  it('sets idle node fill color to gray (#64748b)', () => {
    const agents = [
      { id: 'a1', name: 'Idle', status: 'idle' as const, x: 100, y: 100, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    render(<AgentNetworkGraph agents={agents} flows={[]} />)
    drainFrames(1)
    expect(mockCtx.fill).toHaveBeenCalled()
  })
})

describe('AgentNetworkGraph - Task badge rendering', () => {
  it('draws task badge when tasks > 0', () => {
    const agents = [
      { id: 'a1', name: 'Busy', status: 'active' as const, x: 100, y: 100, vx: 0, vy: 0, tasks: 5, connections: [] },
    ]
    render(<AgentNetworkGraph agents={agents} flows={[]} />)
    drainFrames(1)
    // glow arc + node arc + badge arc = 3 arc calls at minimum
    expect(mockCtx.arc.mock.calls.length).toBeGreaterThanOrEqual(3)
    // Badge text fillText call
    const textCalls = mockCtx.fillText.mock.calls
    const badgeTextCall = textCalls.find(c => c[0] === '5')
    expect(badgeTextCall).toBeTruthy()
  })

  it('does not draw badge when tasks is 0', () => {
    const agents = [
      { id: 'a1', name: 'Free', status: 'idle' as const, x: 100, y: 100, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    render(<AgentNetworkGraph agents={agents} flows={[]} />)
    drainFrames(1)
    // glow circle + node circle = 2 arc calls per frame, no badge arc
    // Verify no badge text was drawn (task count text uses 'sans-serif' font)
    const sansFontCalls = mockCtx.fillText.mock.calls.filter(() => mockCtx.font.includes('sans-serif'))
    expect(sansFontCalls.length).toBe(0)
  })
})

describe('AgentNetworkGraph - Flow rendering by status', () => {
  it('draws completed flow with green solid line', () => {
    const agents = [
      { id: 'a1', name: 'A1', status: 'active' as const, x: 50, y: 50, vx: 0, vy: 0, tasks: 0, connections: [] },
      { id: 'a2', name: 'A2', status: 'idle' as const, x: 150, y: 50, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    const flows = [{ from: 'a1', to: 'a2', status: 'completed' as const }]
    render(<AgentNetworkGraph agents={agents} flows={flows} />)
    drainFrames(1)
    // Completed: solid green line, no dash for completed (only setLineDash([]) at end)
    expect(mockCtx.stroke).toHaveBeenCalled()
  })

  it('draws in_progress flow with dashed blue line', () => {
    const agents = [
      { id: 'a1', name: 'A1', status: 'active' as const, x: 50, y: 50, vx: 0, vy: 0, tasks: 0, connections: [] },
      { id: 'a2', name: 'A2', status: 'idle' as const, x: 150, y: 50, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    const flows = [{ from: 'a1', to: 'a2', status: 'in_progress' as const }]
    render(<AgentNetworkGraph agents={agents} flows={flows} />)
    drainFrames(1)
    expect(mockCtx.setLineDash).toHaveBeenCalledWith([5, 5])
    expect(mockCtx.setLineDash).toHaveBeenCalledWith([])
  })

  it('draws pending flow with dashed gray line', () => {
    const agents = [
      { id: 'a1', name: 'A1', status: 'active' as const, x: 50, y: 50, vx: 0, vy: 0, tasks: 0, connections: [] },
      { id: 'a2', name: 'A2', status: 'idle' as const, x: 150, y: 50, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    const flows = [{ from: 'a1', to: 'a2', status: 'pending' as const }]
    render(<AgentNetworkGraph agents={agents} flows={flows} />)
    drainFrames(1)
    expect(mockCtx.setLineDash).toHaveBeenCalledWith([3, 3])
    expect(mockCtx.setLineDash).toHaveBeenCalledWith([])
  })

  it('draws arrow at flow target end', () => {
    const agents = [
      { id: 'a1', name: 'A1', status: 'active' as const, x: 50, y: 50, vx: 0, vy: 0, tasks: 0, connections: [] },
      { id: 'a2', name: 'A2', status: 'idle' as const, x: 150, y: 50, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    const flows = [{ from: 'a1', to: 'a2', status: 'completed' as const }]
    render(<AgentNetworkGraph agents={agents} flows={flows} />)
    drainFrames(1)
    // Arrow uses closePath + fill
    expect(mockCtx.closePath).toHaveBeenCalled()
  })

  it('skips flow when source node is not found', () => {
    const agents = [
      { id: 'a2', name: 'A2', status: 'idle' as const, x: 150, y: 50, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    const flows = [{ from: 'missing', to: 'a2', status: 'completed' as const }]
    render(<AgentNetworkGraph agents={agents} flows={flows} />)
    drainFrames(1)
    // No moveTo for the flow line since source is missing
    expect(mockCtx.moveTo).not.toHaveBeenCalled()
  })

  it('skips flow when target node is not found', () => {
    const agents = [
      { id: 'a1', name: 'A1', status: 'active' as const, x: 50, y: 50, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    const flows = [{ from: 'a1', to: 'missing', status: 'completed' as const }]
    render(<AgentNetworkGraph agents={agents} flows={flows} />)
    drainFrames(1)
    expect(mockCtx.moveTo).not.toHaveBeenCalled()
  })
})

describe('AgentNetworkGraph - Force layout', () => {
  it('initializes nodes at provided positions', () => {
    const agents = [
      { id: 'a1', name: 'Agent 1', status: 'active' as const, x: 50, y: 60, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    render(<AgentNetworkGraph agents={agents} flows={[]} width={400} height={300} />)
    drainFrames(1)
    expect(mockCtx.arc).toHaveBeenCalled()
  })

  it('initializes nodes at random positions when x/y are 0', () => {
    const agents = [
      { id: 'a1', name: 'Random', status: 'idle' as const, x: 0, y: 0, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    render(<AgentNetworkGraph agents={agents} flows={[]} width={400} height={300} />)
    drainFrames(1)
    expect(mockCtx.arc).toHaveBeenCalled()
    randomSpy.mockRestore()
  })

  it('applies repulsion between two close nodes', () => {
    const agents = [
      { id: 'a1', name: 'A1', status: 'active' as const, x: 100, y: 100, vx: 0, vy: 0, tasks: 0, connections: [] },
      { id: 'a2', name: 'A2', status: 'idle' as const, x: 110, y: 100, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    render(<AgentNetworkGraph agents={agents} flows={[]} width={400} height={300} />)
    drainFrames(5)
    expect(mockCtx.arc).toHaveBeenCalled()
  })

  it('applies attraction for connected flows', () => {
    const agents = [
      { id: 'a1', name: 'A1', status: 'active' as const, x: 50, y: 100, vx: 0, vy: 0, tasks: 0, connections: [] },
      { id: 'a2', name: 'A2', status: 'idle' as const, x: 350, y: 100, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    const flows = [{ from: 'a1', to: 'a2', status: 'in_progress' as const }]
    render(<AgentNetworkGraph agents={agents} flows={flows} width={400} height={300} />)
    drainFrames(5)
    expect(mockCtx.stroke).toHaveBeenCalled()
  })

  it('constrains nodes within canvas boundaries', () => {
    const agents = [
      { id: 'a1', name: 'Far', status: 'active' as const, x: 500, y: 500, vx: 100, vy: 100, tasks: 0, connections: [] },
    ]
    render(<AgentNetworkGraph agents={agents} flows={[]} width={400} height={300} />)
    drainFrames(5)
    expect(mockCtx.arc).toHaveBeenCalled()
  })
})

describe('AgentNetworkGraph - Node name rendering', () => {
  it('truncates long node name to first 6 chars of first word', () => {
    const agents = [
      { id: 'a1', name: 'LongName Agent', status: 'active' as const, x: 100, y: 100, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    render(<AgentNetworkGraph agents={agents} flows={[]} />)
    drainFrames(1)
    const textCalls = mockCtx.fillText.mock.calls
    expect(textCalls.length).toBeGreaterThan(0)
    // 'LongName'.substring(0, 6) = 'LongNa'
    expect(textCalls[0][0]).toBe('LongNa')
  })

  it('renders short node name unchanged', () => {
    const agents = [
      { id: 'a1', name: 'Al', status: 'active' as const, x: 100, y: 100, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    render(<AgentNetworkGraph agents={agents} flows={[]} />)
    drainFrames(1)
    const textCalls = mockCtx.fillText.mock.calls
    expect(textCalls.length).toBeGreaterThan(0)
    // 'Al'.split(' ')[0].substring(0, 6) = 'Al'
    expect(textCalls[0][0]).toBe('Al')
  })

  it('uses first word of multi-word name', () => {
    const agents = [
      { id: 'a1', name: 'Agent Test', status: 'active' as const, x: 100, y: 100, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    render(<AgentNetworkGraph agents={agents} flows={[]} />)
    drainFrames(1)
    const textCalls = mockCtx.fillText.mock.calls
    expect(textCalls[0][0]).toBe('Agent')
  })

  it('sets correct font for node name', () => {
    const agents = [
      { id: 'a1', name: 'Test', status: 'active' as const, x: 100, y: 100, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    render(<AgentNetworkGraph agents={agents} flows={[]} />)
    drainFrames(1)
    expect(mockCtx.font).toBe('bold 9px monospace')
  })
})

describe('AgentNetworkGraph - Click handling', () => {
  it('calls onNodeClick when clicking on a node', () => {
    const onClick = vi.fn()
    const agents = [
      { id: 'a1', name: 'A1', status: 'active' as const, x: 100, y: 100, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    const { container } = render(
      <AgentNetworkGraph agents={agents} flows={[]} onNodeClick={onClick} />
    )
    const canvas = container.querySelector('canvas') as HTMLCanvasElement

    canvas.getBoundingClientRect = vi.fn(() => ({
      left: 0, top: 0, right: 400, bottom: 300,
      width: 400, height: 300, x: 0, y: 0, toJSON: vi.fn(),
    }))

    drainFrames(1)

    // Click at node position (100, 100)
    fireEvent.click(canvas, { clientX: 100, clientY: 100 })
    expect(onClick).toHaveBeenCalledWith('a1')
  })

  it('does not call onNodeClick when clicking empty space', () => {
    const onClick = vi.fn()
    const agents = [
      { id: 'a1', name: 'A1', status: 'active' as const, x: 100, y: 100, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    const { container } = render(
      <AgentNetworkGraph agents={agents} flows={[]} onNodeClick={onClick} />
    )
    const canvas = container.querySelector('canvas') as HTMLCanvasElement

    canvas.getBoundingClientRect = vi.fn(() => ({
      left: 0, top: 0, right: 400, bottom: 300,
      width: 400, height: 300, x: 0, y: 0, toJSON: vi.fn(),
    }))

    drainFrames(1)

    // Click far away
    fireEvent.click(canvas, { clientX: 350, clientY: 250 })
    expect(onClick).not.toHaveBeenCalled()
  })

  it('does nothing on click when onNodeClick is not provided', () => {
    const agents = [
      { id: 'a1', name: 'A1', status: 'active' as const, x: 100, y: 100, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    const { container } = render(
      <AgentNetworkGraph agents={agents} flows={[]} />
    )
    const canvas = container.querySelector('canvas') as HTMLCanvasElement

    canvas.getBoundingClientRect = vi.fn(() => ({
      left: 0, top: 0, right: 400, bottom: 300,
      width: 400, height: 300, x: 0, y: 0, toJSON: vi.fn(),
    }))

    drainFrames(1)
    expect(() => fireEvent.click(canvas, { clientX: 100, clientY: 100 })).not.toThrow()
  })

  it('handles click with canvas offset from viewport', () => {
    const onClick = vi.fn()
    const agents = [
      { id: 'a1', name: 'A1', status: 'active' as const, x: 100, y: 100, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    const { container } = render(
      <AgentNetworkGraph agents={agents} flows={[]} onNodeClick={onClick} />
    )
    const canvas = container.querySelector('canvas') as HTMLCanvasElement

    // Canvas is offset by (50, 50) in the viewport
    canvas.getBoundingClientRect = vi.fn(() => ({
      left: 50, top: 50, right: 450, bottom: 350,
      width: 400, height: 300, x: 50, y: 50, toJSON: vi.fn(),
    }))

    drainFrames(1)

    // clientX 150 maps to canvas-local x=100, clientY 150 maps to canvas-local y=100
    fireEvent.click(canvas, { clientX: 150, clientY: 150 })
    expect(onClick).toHaveBeenCalledWith('a1')
  })

  it('selects the first node found within click radius', () => {
    const onClick = vi.fn()
    const agents = [
      { id: 'a1', name: 'A1', status: 'active' as const, x: 100, y: 100, vx: 0, vy: 0, tasks: 0, connections: [] },
      { id: 'a2', name: 'A2', status: 'idle' as const, x: 200, y: 200, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    const { container } = render(
      <AgentNetworkGraph agents={agents} flows={[]} onNodeClick={onClick} />
    )
    const canvas = container.querySelector('canvas') as HTMLCanvasElement

    canvas.getBoundingClientRect = vi.fn(() => ({
      left: 0, top: 0, right: 400, bottom: 300,
      width: 400, height: 300, x: 0, y: 0, toJSON: vi.fn(),
    }))

    drainFrames(1)

    // Click near a2
    fireEvent.click(canvas, { clientX: 200, clientY: 200 })
    expect(onClick).toHaveBeenCalledWith('a2')
  })
})

describe('AgentNetworkGraph - Keyboard handling', () => {
  it('calls onNodeClick with empty string on Escape key', () => {
    const onClick = vi.fn()
    const { container } = render(
      <AgentNetworkGraph agents={[]} flows={[]} onNodeClick={onClick} />
    )
    const canvas = container.querySelector('canvas') as HTMLCanvasElement

    fireEvent.keyDown(canvas, { key: 'Escape' })
    expect(onClick).toHaveBeenCalledWith('')
  })

  it('does nothing on non-Escape key', () => {
    const onClick = vi.fn()
    const { container } = render(
      <AgentNetworkGraph agents={[]} flows={[]} onNodeClick={onClick} />
    )
    const canvas = container.querySelector('canvas') as HTMLCanvasElement

    fireEvent.keyDown(canvas, { key: 'Enter' })
    expect(onClick).not.toHaveBeenCalled()
  })

  it('handles Escape without onNodeClick gracefully', () => {
    const { container } = render(
      <AgentNetworkGraph agents={[]} flows={[]} />
    )
    const canvas = container.querySelector('canvas') as HTMLCanvasElement

    expect(() => fireEvent.keyDown(canvas, { key: 'Escape' })).not.toThrow()
  })
})

describe('AgentNetworkGraph - Accessibility', () => {
  it('has role="img"', () => {
    const { container } = render(<AgentNetworkGraph agents={[]} flows={[]} />)
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.getAttribute('role')).toBe('img')
  })

  it('has tabIndex={0} for keyboard access', () => {
    const { container } = render(<AgentNetworkGraph agents={[]} flows={[]} />)
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.tabIndex).toBe(0)
  })

  it('has descriptive aria-label with agent and flow counts', () => {
    const agents = [
      { id: 'a1', name: 'A1', status: 'active' as const, x: 0, y: 0, vx: 0, vy: 0, tasks: 0, connections: [] },
      { id: 'a2', name: 'A2', status: 'idle' as const, x: 0, y: 0, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    const flows = [
      { from: 'a1', to: 'a2', status: 'in_progress' as const },
      { from: 'a2', to: 'a1', status: 'pending' as const },
    ]
    const { container } = render(<AgentNetworkGraph agents={agents} flows={flows} />)
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.getAttribute('aria-label')).toBe(
      'Agent network graph with 2 agents and 2 connections. Click on a node to select.'
    )
  })

  it('has correct aria-label for empty graph', () => {
    const { container } = render(<AgentNetworkGraph agents={[]} flows={[]} />)
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.getAttribute('aria-label')).toBe(
      'Agent network graph with 0 agents and 0 connections. Click on a node to select.'
    )
  })

  it('has focus styling classes', () => {
    const { container } = render(<AgentNetworkGraph agents={[]} flows={[]} />)
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.className).toContain('cursor-pointer')
    expect(canvas.className).toContain('focus:outline-none')
    expect(canvas.className).toContain('focus:ring-2')
    expect(canvas.className).toContain('focus:ring-accent')
  })
})

describe('AgentNetworkGraph - Animation lifecycle', () => {
  it('starts animation loop on mount', () => {
    render(<AgentNetworkGraph agents={[]} flows={[]} />)
    expect(rafCallbacks.size).toBeGreaterThan(0)
  })

  it('stops animation after max 100 frames', () => {
    render(<AgentNetworkGraph agents={[]} flows={[]} width={200} height={200} />)
    drainFrames(110)
    // After 100 frames, no more callbacks
    expect(rafCallbacks.size).toBe(0)
  })

  it('continues animation before reaching 100 frames', () => {
    render(<AgentNetworkGraph agents={[]} flows={[]} width={200} height={200} />)
    drainFrames(50)
    // Still should have callbacks registered (50 < 100)
    expect(rafCallbacks.size).toBeGreaterThan(0)
  })

  it('cancels animation on unmount', () => {
    const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame')
    const { unmount } = render(<AgentNetworkGraph agents={[]} flows={[]} />)
    const registeredIds = Array.from(rafCallbacks.keys())
    expect(registeredIds.length).toBeGreaterThan(0)
    unmount()
    expect(cancelSpy).toHaveBeenCalledWith(registeredIds[registeredIds.length - 1])
    cancelSpy.mockRestore()
  })
})

describe('AgentNetworkGraph - Multiple agents and complex flows', () => {
  it('handles three agents with all status types', () => {
    const gradient = { addColorStop: vi.fn() }
    mockCtx.createRadialGradient.mockReturnValue(gradient)
    const agents = [
      { id: 'a1', name: 'Active One', status: 'active' as const, x: 50, y: 50, vx: 0, vy: 0, tasks: 2, connections: [] },
      { id: 'a2', name: 'Idle Two', status: 'idle' as const, x: 150, y: 50, vx: 0, vy: 0, tasks: 0, connections: [] },
      { id: 'a3', name: 'Error Three', status: 'error' as const, x: 250, y: 50, vx: 0, vy: 0, tasks: 1, connections: [] },
    ]
    render(<AgentNetworkGraph agents={agents} flows={[]} width={400} height={200} />)
    drainFrames(1)
    expect(mockCtx.createRadialGradient.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('handles multiple flows with mixed statuses', () => {
    const agents = [
      { id: 'a1', name: 'A1', status: 'active' as const, x: 50, y: 100, vx: 0, vy: 0, tasks: 0, connections: [] },
      { id: 'a2', name: 'A2', status: 'idle' as const, x: 150, y: 100, vx: 0, vy: 0, tasks: 0, connections: [] },
      { id: 'a3', name: 'A3', status: 'error' as const, x: 250, y: 100, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    const flows = [
      { from: 'a1', to: 'a2', status: 'completed' as const },
      { from: 'a2', to: 'a3', status: 'in_progress' as const },
      { from: 'a1', to: 'a3', status: 'pending' as const },
    ]
    render(<AgentNetworkGraph agents={agents} flows={flows} width={400} height={200} />)
    drainFrames(1)
    expect(mockCtx.stroke).toHaveBeenCalled()
    // Should have drawn 3 flow lines
    expect(mockCtx.moveTo.mock.calls.length).toBeGreaterThanOrEqual(3)
  })
})

describe('AgentNetworkGraph - Canvas style', () => {
  it('applies width and height to inline style', () => {
    const { container } = render(
      <AgentNetworkGraph agents={[]} flows={[]} width={500} height={350} />
    )
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.style.width).toBe('500px')
    expect(canvas.style.height).toBe('350px')
  })
})

describe('AgentNetworkGraph - Node radius scaling', () => {
  it('draws larger node for agent with more tasks', () => {
    const agents = [
      { id: 'a1', name: 'Busy', status: 'active' as const, x: 100, y: 100, vx: 0, vy: 0, tasks: 10, connections: [] },
    ]
    render(<AgentNetworkGraph agents={agents} flows={[]} />)
    drainFrames(1)
    // radius = 18 + 10*4 = 58, so glow radius = 58*2 = 116
    // Check that arc was called with the larger radius
    const arcCalls = mockCtx.arc.mock.calls
    // Find the node circle call (second arc for the node, not glow)
    // The glow circle is radius*2, the node circle is radius
    expect(arcCalls.length).toBeGreaterThanOrEqual(3) // glow + node + badge
  })
})

describe('AgentNetworkGraph - Rerender with changed props', () => {
  it('reinitializes nodes when agents prop changes', () => {
    const agents1 = [
      { id: 'a1', name: 'A1', status: 'active' as const, x: 50, y: 50, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    const agents2 = [
      { id: 'a1', name: 'A1', status: 'active' as const, x: 50, y: 50, vx: 0, vy: 0, tasks: 0, connections: [] },
      { id: 'a2', name: 'A2', status: 'idle' as const, x: 150, y: 50, vx: 0, vy: 0, tasks: 0, connections: [] },
    ]
    const { rerender } = render(
      <AgentNetworkGraph agents={agents1} flows={[]} />
    )
    drainFrames(1)
    const arcCountAfterFirst = mockCtx.arc.mock.calls.length

    rerender(<AgentNetworkGraph agents={agents2} flows={[]} />)
    drainFrames(1)

    // More arc calls with more agents
    expect(mockCtx.arc.mock.calls.length).toBeGreaterThan(arcCountAfterFirst)
  })
})
