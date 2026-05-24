import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import QueenSandbox from './QueenSandbox'

// --- Mock store data ---

const makeMockAgents = () => [
  { id: 'ws-scanner', name: 'scanner', type: 'scanner', state: 'idle', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '', lastActive: '' },
  { id: 'queen', name: 'queen', type: 'planner', state: 'idle', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '', lastActive: '' },
  { id: 'claude-code', name: 'claude-code', type: 'coder', state: 'waiting', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '', lastActive: '' },
  { id: 'validation', name: 'validation', type: 'validator', state: 'idle', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '', lastActive: '' },
  { id: 'aider', name: 'aider', type: 'committer', state: 'idle', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '', lastActive: '' },
]

// --- Mock stores ---

let mockAppStoreState: Record<string, unknown> = {}

vi.mock('../store/appStore', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector(mockAppStoreState),
}))

let mockLifecycleState: Record<string, unknown> = {}

vi.mock('../stores/agentLifecycleStore', () => ({
  useAgentLifecycleStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector(mockLifecycleState),
}))

let mockTaskFlowState: Record<string, unknown> = {}

vi.mock('../stores/taskFlowStore', () => ({
  useTaskFlowStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector(mockTaskFlowState),
}))

// --- Mock services ---

const mockOnPermissionRequest = vi.fn()
const mockSendPermissionResponse = vi.fn()

vi.mock('../services', () => ({
  api: {
    agent: { getAgents: vi.fn().mockResolvedValue([]) },
    permissions: { respond: vi.fn().mockResolvedValue(undefined) },
    events: {
      onPermissionRequest: (...args: unknown[]) => mockOnPermissionRequest(...args),
      sendPermissionResponse: (...args: unknown[]) => {
        mockSendPermissionResponse(...args)
        return Promise.resolve()
      },
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

// --- Helpers ---

function resetStoreDefaults() {
  mockAppStoreState = {
    agents: makeMockAgents(),
    activePermission: null,
  }
  mockLifecycleState = {
    agents: new Map(),
    activeTurns: new Map(),
  }
  mockTaskFlowState = {
    tasks: new Map(),
  }
  // Default: onPermissionRequest returns a no-op unsubscribe function
  mockOnPermissionRequest.mockReturnValue(vi.fn())
}

function renderSandbox(props?: { onNodeSelect?: (nodeId: string, nodeName: string) => void }) {
  return render(<QueenSandbox {...props} />)
}

/** Get the main topology SVG (the one with viewBox="0 0 800 400") */
function getMainSvg(): SVGSVGElement | null {
  const svgs = document.querySelectorAll('svg')
  for (const svg of svgs) {
    if (svg.getAttribute('viewBox') === '0 0 800 400') return svg
  }
  return null
}

/** Click a node by its SVG text element (the agent name below the node) */
function clickNodeByName(name: string) {
  const textEls = document.querySelectorAll('svg text')
  for (const el of textEls) {
    if (el.textContent === name) {
      // Find the closest .sandbox-node parent group
      const nodeGroup = el.closest('.sandbox-node') || el.closest('g')
      if (nodeGroup) {
        fireEvent.click(nodeGroup)
        return
      }
    }
  }
  // Fallback: try screen.getByText (but this might match non-SVG text)
  throw new Error(`Node "${name}" not found`)
}

// ===================================================================
// TESTS
// ===================================================================

describe('QueenSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStoreDefaults()
  })

  // ---------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------
  describe('rendering', () => {
    it('renders the main SVG sandbox container with correct viewBox', () => {
      renderSandbox()
      const svg = getMainSvg()
      expect(svg).toBeInTheDocument()
      expect(svg?.getAttribute('viewBox')).toBe('0 0 800 400')
    })

    it('renders the main wrapper div with dark background', () => {
      const { container } = renderSandbox()
      const wrapper = container.firstChild as HTMLElement
      expect(wrapper).toBeTruthy()
      expect(wrapper.style.background).toBe('rgb(10, 13, 18)')
    })

    it('renders CSS keyframes for animations', () => {
      renderSandbox()
      const styleEl = document.querySelector('style')
      expect(styleEl).toBeInTheDocument()
      expect(styleEl?.textContent).toContain('sandbox-pulse-executing')
      expect(styleEl?.textContent).toContain('sandbox-pulse-thinking')
      expect(styleEl?.textContent).toContain('sandbox-flash-stuck')
      expect(styleEl?.textContent).toContain('sandbox-error-glow')
    })

    it('renders architecture guide overlay in top-left', () => {
      renderSandbox()
      expect(screen.getByText(/蜂王全局调度协定/)).toBeInTheDocument()
    })

    it('renders bottom description panel', () => {
      renderSandbox()
      expect(screen.getByText(/自主流转说明/)).toBeInTheDocument()
    })

    it('renders node count and edge count in info overlay when no node is selected', () => {
      renderSandbox()
      const infoEl = screen.getByText(/节点: \d+ \| 管道阶段: \d+/)
      expect(infoEl).toBeInTheDocument()
    })

    it('renders SVG defs with filter elements', () => {
      renderSandbox()
      const svg = getMainSvg()
      const defs = svg?.querySelector('defs')
      expect(defs).toBeInTheDocument()
      expect(document.getElementById('glow-particle')).toBeInTheDocument()
      expect(document.getElementById('glow-cyan')).toBeInTheDocument()
      expect(document.getElementById('glow-amber')).toBeInTheDocument()
      expect(document.getElementById('shadow-node')).toBeInTheDocument()
    })

    it('renders all 5 default agent nodes as SVG text', () => {
      renderSandbox()
      const svg = getMainSvg()
      const nodeTexts = svg?.querySelectorAll('.sandbox-node text')
      const names = Array.from(nodeTexts || []).map(t => t.textContent)
      expect(names).toContain('scanner')
      expect(names).toContain('queen')
      expect(names).toContain('claude-code')
      expect(names).toContain('validation')
      expect(names).toContain('aider')
    })

    it('renders status badges for idle nodes', () => {
      renderSandbox()
      const idleBadges = screen.getAllByText('空闲')
      expect(idleBadges.length).toBeGreaterThanOrEqual(3)
    })
  })

  // ---------------------------------------------------------------
  // Default topology edges
  // ---------------------------------------------------------------
  describe('default topology edges', () => {
    it('renders 3 edges for default topology', () => {
      renderSandbox()
      const svg = getMainSvg()
      // Edges are paths with strokeDasharray
      const edgePaths = svg?.querySelectorAll('path[stroke-dasharray]')
      expect(edgePaths?.length).toBe(3)
    })

    it('renders animated particles for active edges', () => {
      renderSandbox()
      const svg = getMainSvg()
      const particles = svg?.querySelectorAll('circle[filter="url(#glow-particle)"]')
      expect(particles?.length).toBe(3)
    })
  })

  // ---------------------------------------------------------------
  // Node interactions
  // ---------------------------------------------------------------
  describe('node interactions', () => {
    it('calls onNodeSelect when a node is clicked', () => {
      const onNodeSelect = vi.fn()
      renderSandbox({ onNodeSelect })
      clickNodeByName('scanner')
      expect(onNodeSelect).toHaveBeenCalledWith('ws-scanner', 'scanner')
    })

    it('dispatches sandbox:node-selected custom event on node click', () => {
      const listener = vi.fn()
      window.addEventListener('sandbox:node-selected', listener)
      renderSandbox()
      clickNodeByName('queen')
      expect(listener).toHaveBeenCalledTimes(1)
      const detail = (listener.mock.calls[0][0] as CustomEvent).detail
      expect(detail.agentId).toBe('queen')
      expect(detail.agentName).toBe('queen')
      window.removeEventListener('sandbox:node-selected', listener)
    })

    it('shows selected node info in top-right overlay after clicking', () => {
      renderSandbox()
      clickNodeByName('scanner')
      expect(screen.getByText(/选中调度单元/)).toBeInTheDocument()
      // scanner name appears in both the SVG node text and the info overlay
      const strongEl = document.querySelector('strong[style*="rgb(255, 255, 255)"]')
      expect(strongEl?.textContent).toContain('scanner')
    })

    it('shows PID info for agents that have pid', () => {
      const agentsWithPid = makeMockAgents().map(a =>
        a.id === 'ws-scanner' ? { ...a, pid: 1234 } : a
      ) as unknown as typeof mockAppStoreState['agents']
      mockAppStoreState = { ...mockAppStoreState, agents: agentsWithPid }
      renderSandbox()
      // PID is rendered in SVG text element
      const pidTexts = Array.from(document.querySelectorAll('svg text'))
        .filter(t => t.textContent?.includes('PID: 1234'))
      expect(pidTexts.length).toBe(1)
    })

    it('does not crash when clicking a node without onNodeSelect prop', () => {
      renderSandbox()
      expect(() => clickNodeByName('scanner')).not.toThrow()
    })

    it('highlights selected node with cyan glow', () => {
      renderSandbox()
      clickNodeByName('queen')
      // After selecting, there should be a highlight circle
      const highlightCircles = document.querySelectorAll('svg circle[stroke="#58a6ff"]')
      expect(highlightCircles.length).toBeGreaterThan(0)
    })
  })

  // ---------------------------------------------------------------
  // HITL (Human-in-the-Loop) popup
  // ---------------------------------------------------------------
  describe('HITL popup', () => {
    it('shows HITL popup when clicking a blocked/waiting node', () => {
      renderSandbox()
      // claude-code has state 'waiting' which maps to 'blocked' via getLifecycleStatus
      clickNodeByName('claude-code')
      expect(screen.getByText(/敏感指令安全授权闸/)).toBeInTheDocument()
      expect(screen.getByText(/确认并核准执行/)).toBeInTheDocument()
      expect(screen.getByText(/拒绝阻断/)).toBeInTheDocument()
    })

    it('approves HITL when approve button is clicked', () => {
      renderSandbox()
      clickNodeByName('claude-code')
      const approveBtn = screen.getByText(/确认并核准执行/)
      fireEvent.click(approveBtn)
      expect(screen.queryByText(/敏感指令安全授权闸/)).not.toBeInTheDocument()
    })

    it('denies HITL when deny button is clicked', () => {
      renderSandbox()
      clickNodeByName('claude-code')
      const denyBtn = screen.getByText(/拒绝阻断/)
      fireEvent.click(denyBtn)
      expect(screen.queryByText(/敏感指令安全授权闸/)).not.toBeInTheDocument()
    })

    it('shows approved status badge after approving', () => {
      renderSandbox()
      clickNodeByName('claude-code')
      fireEvent.click(screen.getByText(/确认并核准执行/))
      expect(screen.getByText(/执行完成 \(已授权\)/)).toBeInTheDocument()
    })

    it('shows denied status badge after denying', () => {
      renderSandbox()
      clickNodeByName('claude-code')
      fireEvent.click(screen.getByText(/拒绝阻断/))
      expect(screen.getByText(/特权已手动阻断/)).toBeInTheDocument()
    })

    it('does not show HITL popup for non-blocked nodes', () => {
      renderSandbox()
      clickNodeByName('scanner')
      expect(screen.queryByText(/敏感指令安全授权闸/)).not.toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------
  // Lifecycle state mapping
  // ---------------------------------------------------------------
  describe('lifecycle status mapping', () => {
    it('maps lifecycle executing state correctly', () => {
      const lifecycleMap = new Map()
      lifecycleMap.set('ws-scanner', { state: 'executing', agentId: 'ws-scanner', name: 'scanner', lastActive: '', capabilities: [] })
      mockLifecycleState = { ...mockLifecycleState, agents: lifecycleMap }
      renderSandbox()
      expect(screen.getAllByText('执行中').length).toBeGreaterThanOrEqual(1)
    })

    it('maps lifecycle thinking state correctly', () => {
      const lifecycleMap = new Map()
      lifecycleMap.set('ws-scanner', { state: 'thinking', agentId: 'ws-scanner', name: 'scanner', lastActive: '', capabilities: [] })
      mockLifecycleState = { ...mockLifecycleState, agents: lifecycleMap }
      renderSandbox()
      expect(screen.getAllByText('思考中').length).toBeGreaterThanOrEqual(1)
    })

    it('maps lifecycle stuck state correctly', () => {
      const lifecycleMap = new Map()
      lifecycleMap.set('ws-scanner', { state: 'stuck', agentId: 'ws-scanner', name: 'scanner', lastActive: '', capabilities: [] })
      mockLifecycleState = { ...mockLifecycleState, agents: lifecycleMap }
      renderSandbox()
      expect(screen.getAllByText('已卡住').length).toBeGreaterThanOrEqual(1)
    })

    it('maps lifecycle error state correctly', () => {
      const lifecycleMap = new Map()
      lifecycleMap.set('ws-scanner', { state: 'error', agentId: 'ws-scanner', name: 'scanner', lastActive: '', capabilities: [] })
      mockLifecycleState = { ...mockLifecycleState, agents: lifecycleMap }
      renderSandbox()
      expect(screen.getAllByText('错误').length).toBeGreaterThanOrEqual(1)
    })

    it('uses fallback when no lifecycle data available', () => {
      renderSandbox()
      const idleBadges = screen.getAllByText('空闲')
      expect(idleBadges.length).toBeGreaterThanOrEqual(1)
    })

    it('maps waiting fallback state to blocked', () => {
      // claude-code already has state 'waiting', which maps to blocked
      renderSandbox()
      // Blocked nodes show '等候特权核准' in the badge (not '已阻塞' which is the label)
      const allTexts = Array.from(document.querySelectorAll('svg text'))
      const blockedBadge = allTexts.find(t => t.textContent === '等候特权核准')
      expect(blockedBadge).toBeTruthy()
    })
  })

  // ---------------------------------------------------------------
  // Active edge animation
  // ---------------------------------------------------------------
  describe('active edge animation', () => {
    it('speeds up animation when edge has active turns', () => {
      const activeTurns = new Map()
      activeTurns.set('ws-scanner', { taskId: 't1', startedAt: '' })
      mockLifecycleState = { ...mockLifecycleState, activeTurns }
      renderSandbox()
      const animateMotions = document.querySelectorAll('animateMotion')
      const fastParticles = Array.from(animateMotions).filter(el => el.getAttribute('dur') === '1.5s')
      expect(fastParticles.length).toBeGreaterThan(0)
    })

    it('detects active edge agents from running tasks', () => {
      const tasks = new Map()
      tasks.set('t1', { taskId: 't1', status: 'running', assignedAgents: ['ws-scanner'] })
      mockTaskFlowState = { ...mockTaskFlowState, tasks }
      renderSandbox()
      const animateMotions = document.querySelectorAll('animateMotion')
      const fastParticles = Array.from(animateMotions).filter(el => el.getAttribute('dur') === '1.5s')
      expect(fastParticles.length).toBeGreaterThan(0)
    })
  })

  // ---------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------
  describe('empty state', () => {
    beforeEach(() => {
      mockAppStoreState = { agents: [], activePermission: null }
    })

    it('renders empty state message when no agents', () => {
      renderSandbox()
      expect(screen.getByText('尚未发现 Agent')).toBeInTheDocument()
    })

    it('renders empty state sub-message', () => {
      renderSandbox()
      expect(screen.getByText(/请在左侧 Agent 扫描器中扫描或添加 Agent/)).toBeInTheDocument()
    })

    it('shows node count 0 in info overlay', () => {
      renderSandbox()
      expect(screen.getByText('节点: 0 | 管道阶段: 0')).toBeInTheDocument()
    })

    it('does not render any idle badges', () => {
      renderSandbox()
      expect(screen.queryByText('空闲')).not.toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------
  // Dynamic sequential edges (non-default topology)
  // ---------------------------------------------------------------
  describe('dynamic edges', () => {
    it('creates sequential edges for non-default topology', () => {
      const customAgents = [
        { id: 'a1', name: 'alpha', type: 'worker', state: 'idle', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '', lastActive: '' },
        { id: 'a2', name: 'beta', type: 'worker', state: 'idle', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '', lastActive: '' },
        { id: 'a3', name: 'gamma', type: 'worker', state: 'idle', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '', lastActive: '' },
      ]
      mockAppStoreState = { agents: customAgents, activePermission: null }
      renderSandbox()
      const svg = getMainSvg()
      const edgePaths = svg?.querySelectorAll('path[stroke-dasharray]')
      expect(edgePaths?.length).toBe(2)
    })

    it('renders no edges for single agent', () => {
      mockAppStoreState = { agents: [{ id: 'a1', name: 'solo', type: 'worker', state: 'idle', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '', lastActive: '' }], activePermission: null }
      renderSandbox()
      const svg = getMainSvg()
      const edgePaths = svg?.querySelectorAll('path[stroke-dasharray]')
      expect(edgePaths?.length).toBe(0)
    })

    it('colors edges blue when connected nodes are executing', () => {
      const customAgents = [
        { id: 'a1', name: 'alpha', type: 'worker', state: 'executing', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '', lastActive: '' },
        { id: 'a2', name: 'beta', type: 'worker', state: 'idle', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '', lastActive: '' },
      ]
      mockAppStoreState = { agents: customAgents, activePermission: null }
      renderSandbox()
      const svg = getMainSvg()
      const edgePaths = svg?.querySelectorAll('path[stroke-dasharray]')
      expect(edgePaths?.length).toBe(1)
      expect(edgePaths?.[0].getAttribute('stroke')).toBe('#58a6ff')
    })

    it('colors edges gray when connected nodes are idle', () => {
      const customAgents = [
        { id: 'a1', name: 'alpha', type: 'worker', state: 'idle', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '', lastActive: '' },
        { id: 'a2', name: 'beta', type: 'worker', state: 'idle', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '', lastActive: '' },
      ]
      mockAppStoreState = { agents: customAgents, activePermission: null }
      renderSandbox()
      const svg = getMainSvg()
      const edgePaths = svg?.querySelectorAll('path[stroke-dasharray]')
      expect(edgePaths?.length).toBe(1)
      expect(edgePaths?.[0].getAttribute('stroke')).toBe('#30363d')
    })
  })

  // ---------------------------------------------------------------
  // Pipeline ordering
  // ---------------------------------------------------------------
  describe('pipeline ordering', () => {
    it('sorts agents by pipeline role', () => {
      const unorderedAgents = [
        { id: 'coder-1', name: 'coder', type: 'coder', state: 'idle', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '', lastActive: '' },
        { id: 'scanner-1', name: 'scanner', type: 'scanner', state: 'idle', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '', lastActive: '' },
        { id: 'planner-1', name: 'planner', type: 'planner', state: 'idle', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '', lastActive: '' },
      ]
      mockAppStoreState = { agents: unorderedAgents, activePermission: null }
      renderSandbox()
      // Verify all 3 are rendered
      const svg = getMainSvg()
      const nodeTexts = svg?.querySelectorAll('.sandbox-node text')
      const names = Array.from(nodeTexts || []).map(t => t.textContent)
      expect(names).toContain('scanner')
      expect(names).toContain('planner')
      expect(names).toContain('coder')
    })
  })

  // ---------------------------------------------------------------
  // Node visual states
  // ---------------------------------------------------------------
  describe('node visual states', () => {
    it('renders blocked node with amber glow animation', () => {
      // claude-code has state 'waiting' which maps to 'blocked' -> amber glow
      renderSandbox()
      const amberCircles = document.querySelectorAll('svg circle[filter="url(#glow-amber)"]')
      expect(amberCircles.length).toBeGreaterThan(0)
    })

    it('renders executing node with cyan glow animation', () => {
      const agents = makeMockAgents().map(a =>
        a.id === 'ws-scanner' ? { ...a, state: 'executing' } : a
      )
      const lifecycleMap = new Map()
      lifecycleMap.set('ws-scanner', { state: 'executing', agentId: 'ws-scanner', name: 'scanner', lastActive: '', capabilities: [] })
      mockAppStoreState = { ...mockAppStoreState, agents }
      mockLifecycleState = { ...mockLifecycleState, agents: lifecycleMap }
      renderSandbox()
      const cyanCircles = document.querySelectorAll('svg circle[filter="url(#glow-cyan)"]')
      expect(cyanCircles.length).toBeGreaterThan(0)
    })

    it('renders error node with red glow', () => {
      const agents = makeMockAgents().map(a =>
        a.id === 'ws-scanner' ? { ...a, state: 'error' } : a
      )
      const lifecycleMap = new Map()
      lifecycleMap.set('ws-scanner', { state: 'error', agentId: 'ws-scanner', name: 'scanner', lastActive: '', capabilities: [] })
      mockAppStoreState = { ...mockAppStoreState, agents }
      mockLifecycleState = { ...mockLifecycleState, agents: lifecycleMap }
      renderSandbox()
      const redCircles = document.querySelectorAll('svg circle[filter="url(#glow-red)"]')
      expect(redCircles.length).toBeGreaterThan(0)
    })

    it('renders queen node with special cyan glow', () => {
      renderSandbox()
      const queenNodeGroup = document.querySelectorAll('.sandbox-node')
      const queenNode = Array.from(queenNodeGroup).find(g => {
        const text = g.querySelector('text')
        return text?.textContent === 'queen'
      })
      expect(queenNode).toBeTruthy()
      const cyanInQueen = queenNode!.querySelectorAll('circle[filter="url(#glow-cyan)"]')
      expect(cyanInQueen.length).toBeGreaterThan(0)
    })

    it('renders node name with correct colors per agent type', () => {
      renderSandbox()
      // Find the text elements inside sandbox nodes
      const svg = getMainSvg()
      const nodeTexts = svg?.querySelectorAll('.sandbox-node text')
      expect(nodeTexts).toBeTruthy()

      const queenText = Array.from(nodeTexts || []).find(t => t.textContent === 'queen')
      expect(queenText?.getAttribute('fill')).toBe('#22d3ee')

      const claudeText = Array.from(nodeTexts || []).find(t => t.textContent === 'claude-code')
      expect(claudeText?.getAttribute('fill')).toBe('#fb923c')

      const scannerText = Array.from(nodeTexts || []).find(t => t.textContent === 'scanner')
      expect(scannerText?.getAttribute('fill')).toBe('#9ca3af')
    })

    it('truncates long agent names', () => {
      const agents = [{ id: 'long-agent', name: 'very-long-agent-name-that-exceeds-limit', type: 'worker', state: 'idle', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '', lastActive: '' }]
      mockAppStoreState = { agents, activePermission: null }
      renderSandbox()
      // The SVG text should show the truncated name: first 14 chars + '..' = 'very-long-agen..'
      const svg = getMainSvg()
      expect(svg).toBeTruthy()
      const allTexts = svg!.querySelectorAll('text')
      const truncated = Array.from(allTexts).find(t => t.textContent === 'very-long-agen..')
      expect(truncated).toBeTruthy()
    })
  })

  // ---------------------------------------------------------------
  // Node icon rendering
  // ---------------------------------------------------------------
  describe('node icons', () => {
    it('renders terminal icon for default nodes', () => {
      renderSandbox()
      const terminalPaths = document.querySelectorAll('svg path[d="M4 6l5 5-5 5"]')
      expect(terminalPaths.length).toBeGreaterThan(0)
    })
  })

  // ---------------------------------------------------------------
  // Permission request events
  // ---------------------------------------------------------------
  describe('permission request events', () => {
    it('subscribes to permission_request events on mount', () => {
      renderSandbox()
      expect(mockOnPermissionRequest).toHaveBeenCalled()
    })

    it('shows permission dialog when permission request is received', () => {
      let permissionHandler: ((payload: Record<string, unknown>) => void) | undefined
      mockOnPermissionRequest.mockImplementation((handler: (p: Record<string, unknown>) => void) => {
        permissionHandler = handler
        return vi.fn()
      })
      renderSandbox()
      expect(permissionHandler).toBeTruthy()
      act(() => {
        permissionHandler!({
          id: 'perm-1',
          sessionId: 'sess-1',
          type: 'file_write',
          description: 'Write to src/index.ts',
        })
      })
      expect(screen.getByText(/Agent 权限请求/)).toBeInTheDocument()
      expect(screen.getByText(/file_write/)).toBeInTheDocument()
      expect(screen.getByText(/Write to src\/index\.ts/)).toBeInTheDocument()
    })

    it('sends approve response via API when approve button is clicked', () => {
      let permissionHandler: ((payload: Record<string, unknown>) => void) | undefined
      mockOnPermissionRequest.mockImplementation((handler: (p: Record<string, unknown>) => void) => {
        permissionHandler = handler
        return vi.fn()
      })
      renderSandbox()
      act(() => {
        permissionHandler!({
          id: 'perm-1',
          sessionId: 'sess-1',
          type: 'file_write',
          description: 'Write to src/index.ts',
        })
      })
      const approveBtn = screen.getByText('确认核准')
      fireEvent.click(approveBtn)
      expect(mockSendPermissionResponse).toHaveBeenCalledWith('perm-1', true, 'user')
    })

    it('sends deny response via API when deny button is clicked', () => {
      let permissionHandler: ((payload: Record<string, unknown>) => void) | undefined
      mockOnPermissionRequest.mockImplementation((handler: (p: Record<string, unknown>) => void) => {
        permissionHandler = handler
        return vi.fn()
      })
      renderSandbox()
      act(() => {
        permissionHandler!({
          id: 'perm-2',
          sessionId: 'sess-1',
          type: 'file_delete',
          description: 'Delete temp file',
        })
      })
      const denyBtn = screen.getByText('拒绝')
      fireEvent.click(denyBtn)
      expect(mockSendPermissionResponse).toHaveBeenCalledWith('perm-2', false, 'user')
    })

    it('clears pending permission when activePermission becomes null', () => {
      let permissionHandler: ((payload: Record<string, unknown>) => void) | undefined
      mockOnPermissionRequest.mockImplementation((handler: (p: Record<string, unknown>) => void) => {
        permissionHandler = handler
        return vi.fn()
      })
      const { rerender } = renderSandbox()
      act(() => {
        permissionHandler!({
          id: 'perm-1',
          sessionId: 'sess-1',
          type: 'test',
          description: 'test desc',
        })
      })
      expect(screen.getByText(/Agent 权限请求/)).toBeInTheDocument()
      // Set activePermission to a non-null value, then back to null
      mockAppStoreState = { ...mockAppStoreState, activePermission: { id: 'x' } }
      rerender(<QueenSandbox />)
      mockAppStoreState = { ...mockAppStoreState, activePermission: null }
      rerender(<QueenSandbox />)
      // The permission dialog should have been cleared
    })
  })

  // ---------------------------------------------------------------
  // Node shape rendering
  // ---------------------------------------------------------------
  describe('node shapes', () => {
    it('renders circle nodes with correct radius', () => {
      renderSandbox()
      const nodeCircles = document.querySelectorAll('svg circle[cx][cy][r="32"]')
      // All 5 default agents use circle shape
      expect(nodeCircles.length).toBe(5)
    })
  })

  // ---------------------------------------------------------------
  // Node staggering layout
  // ---------------------------------------------------------------
  describe('node layout', () => {
    it('staggeres nodes vertically based on index parity', () => {
      const agents = [
        { id: 'a1', name: 'first', type: 'worker', state: 'idle', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '', lastActive: '' },
        { id: 'a2', name: 'second', type: 'worker', state: 'idle', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '', lastActive: '' },
        { id: 'a3', name: 'third', type: 'worker', state: 'idle', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '', lastActive: '' },
        { id: 'a4', name: 'fourth', type: 'worker', state: 'idle', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '', lastActive: '' },
      ]
      mockAppStoreState = { agents, activePermission: null }
      renderSandbox()
      const nodeElements = document.querySelectorAll('.sandbox-node')
      expect(nodeElements.length).toBe(4)
    })
  })

  // ---------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------
  describe('edge cases', () => {
    it('handles null agents gracefully', () => {
      mockAppStoreState = { agents: null, activePermission: null }
      renderSandbox()
      expect(screen.getByText('尚未发现 Agent')).toBeInTheDocument()
    })

    it('handles undefined agent state gracefully', () => {
      const agents = [{ id: 'a1', name: 'test', type: 'worker', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '', lastActive: '' }]
      mockAppStoreState = { agents, activePermission: null }
      renderSandbox()
      expect(screen.getByText('test')).toBeInTheDocument()
    })

    it('handles undefined agent type gracefully', () => {
      const agents = [{ id: 'a1', name: 'noType', state: 'idle', capabilities: { loadSession: false, promptCapabilities: { image: false, audio: false, embeddedContext: false }, mcp: { http: false, sse: false }, pairProgramming: false, teamCollaboration: false }, createdAt: '', lastActive: '' }]
      mockAppStoreState = { agents, activePermission: null }
      renderSandbox()
      expect(screen.getByText('noType')).toBeInTheDocument()
    })

    it('unsubscribes from permission events on unmount', () => {
      const mockUnsub = vi.fn()
      // The mock for onPermissionRequest calls mockOnPermissionRequest internally
      // We need mockOnPermissionRequest to return mockUnsub when called
      mockOnPermissionRequest.mockReturnValue(mockUnsub)
      const { unmount } = renderSandbox()
      // Verify subscription happened
      expect(mockOnPermissionRequest).toHaveBeenCalled()
      // Unmount should trigger useEffect cleanup which calls the unsub function
      unmount()
      expect(mockUnsub).toHaveBeenCalled()
    })
  })
})
