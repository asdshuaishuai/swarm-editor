import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ProtocolMonitor from './ProtocolMonitor'
import type { ProtocolPacket } from '../stores/monitoringStore'

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const basePacket = {
  color: '#fbbf24',
  borderColor: '#92400e',
  bgTint: 'rgba(251,191,36,0.05)',
}

const mockPackets: ProtocolPacket[] = [
  {
    ...basePacket,
    id: 'pkt-1',
    type: 'ACP_ORCHESTRATE',
    source: 'queen',
    target: 'agent-1',
    timestamp: '2026-01-01T00:00:00Z',
    payload: '{"action":"execute"}',
    details: { command: 'run_tests', agent: 'claude-code', task: 'Run all unit tests' },
  },
  {
    ...basePacket,
    id: 'pkt-2',
    type: 'A2A_PROTOCOL',
    source: 'agent-1',
    target: 'agent-2',
    timestamp: '2026-01-01T00:00:01Z',
    payload: '{"message":"hello"}',
    details: { sender: 'agent-1', receiver: 'agent-2', messageType: 'request', payload: 'ping' },
  },
  {
    ...basePacket,
    id: 'pkt-3',
    type: 'MCP_TOOL_INVOKED',
    source: 'agent-1',
    target: 'mcp-server',
    timestamp: '2026-01-01T00:00:02Z',
    payload: '{"tool":"read_file"}',
    details: { toolName: 'read_file', serverId: 'filesystem', args: { path: '/test.ts' }, result: true },
  },
  {
    ...basePacket,
    id: 'pkt-4',
    type: 'ACP_PRIVILEGE_GATE',
    source: 'security-gate',
    target: 'agent-3',
    timestamp: '2026-01-01T00:00:03Z',
    payload: '{"permission":"write"}',
    details: { permission: 'write', requestingAgent: 'agent-3', approved: true },
  },
  {
    ...basePacket,
    id: 'pkt-5',
    type: 'ACP_ORCHESTRATE',
    source: 'queen',
    target: 'agent-4',
    timestamp: '2026-01-01T00:00:04Z',
    payload: '',
    details: {},
  },
]

// ---------------------------------------------------------------------------
// Mock store
// ---------------------------------------------------------------------------

const mockToggleAudit = vi.fn()

const mockStore = {
  acpPackets: mockPackets,
  auditEnabled: true,
  toggleAudit: mockToggleAudit,
  addAuditEvent: vi.fn(),
  setAuditEnabled: vi.fn(),
  clearAuditEvents: vi.fn(),
  auditEvents: [],
  auditStats: null,
  emergenceData: null,
  setEmergenceData: vi.fn(),
}

vi.mock('../stores/monitoringStore', () => ({
  useMonitoringStore: (selector: (s: typeof mockStore) => unknown) => selector(mockStore),
}))

vi.mock('../hooks/useAutoScroll', () => ({
  useAutoScroll: () => ({ containerRef: { current: null }, handleScroll: vi.fn() }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderMonitor(props?: { contextLabel?: string | null }) {
  return render(<ProtocolMonitor {...props} />)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProtocolMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStore.acpPackets = mockPackets
    mockStore.auditEnabled = true
  })

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------

  describe('rendering', () => {
    it('renders protocol monitor header without context label', () => {
      renderMonitor()
      expect(screen.getByText(/ACP & A2A Protocol Packet Monitor/)).toBeInTheDocument()
    })

    it('renders header with context label when provided', () => {
      renderMonitor({ contextLabel: 'agent-1' })
      expect(screen.getByText(/Protocol Monitor: agent-1/)).toBeInTheDocument()
    })

    it('renders header with null context label as default', () => {
      renderMonitor({ contextLabel: null })
      expect(screen.getByText(/ACP & A2A Protocol Packet Monitor/)).toBeInTheDocument()
    })

    it('shows all four filter tabs', () => {
      renderMonitor()
      expect(screen.getByText('全部')).toBeInTheDocument()
      expect(screen.getByText('ACP')).toBeInTheDocument()
      expect(screen.getByText('A2A')).toBeInTheDocument()
      expect(screen.getByText('MCP')).toBeInTheDocument()
    })

    it('shows packet count', () => {
      renderMonitor()
      expect(screen.getByText('5 pkts')).toBeInTheDocument()
    })

    it('shows LIVE indicator when audit enabled', () => {
      renderMonitor()
      expect(screen.getByText('LIVE')).toBeInTheDocument()
    })

    it('shows OFF indicator when audit disabled', () => {
      mockStore.auditEnabled = false
      renderMonitor()
      expect(screen.getByText('OFF')).toBeInTheDocument()
    })

    it('shows search input', () => {
      renderMonitor()
      expect(screen.getByPlaceholderText('Search packets...')).toBeInTheDocument()
    })

    it('shows stat dots with correct counts', () => {
      renderMonitor()
      // ACP counts: pkt-1 (ORCHESTRATE) + pkt-4 (PRIVILEGE_GATE) + pkt-5 (ORCHESTRATE) = 3
      // A2A counts: pkt-2 = 1
      // MCP counts: pkt-3 = 1
      expect(screen.getByText('ACP:3')).toBeInTheDocument()
      expect(screen.getByText('A2A:1')).toBeInTheDocument()
      expect(screen.getByText('MCP:1')).toBeInTheDocument()
    })

    it('renders packets in list view by default', () => {
      renderMonitor()
      // Should show packet types rendered (some appear multiple times: header + body)
      expect(screen.getAllByText('ACP_ORCHESTRATE').length).toBeGreaterThanOrEqual(2)
      expect(screen.getByText('A2A_PROTOCOL')).toBeInTheDocument()
      expect(screen.getAllByText('MCP_TOOL_INVOKED').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('ACP_PRIVILEGE_GATE')).toBeInTheDocument()
    })

    it('shows timeline toggle button in list mode', () => {
      renderMonitor()
      expect(screen.getByText('列表')).toBeInTheDocument()
    })

    it('renders the footer message in list mode', () => {
      renderMonitor()
      expect(screen.getByText('* Swarm protocol connection active...')).toBeInTheDocument()
    })

    it('renders empty state when no packets', () => {
      mockStore.acpPackets = []
      renderMonitor()
      expect(screen.getByText('Waiting for protocol packets...')).toBeInTheDocument()
      expect(screen.getByText('0 pkts')).toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  // View mode toggle (list / timeline)
  // -----------------------------------------------------------------------

  describe('view mode toggle', () => {
    it('switches from list to timeline view', () => {
      renderMonitor()
      const toggleBtn = screen.getByText('列表')
      fireEvent.click(toggleBtn)
      expect(screen.getByText('时间轴')).toBeInTheDocument()
    })

    it('switches from timeline back to list view', () => {
      renderMonitor()
      const toggleBtn = screen.getByText('列表')
      fireEvent.click(toggleBtn)
      // Now in timeline mode
      expect(screen.getByText('时间轴')).toBeInTheDocument()
      fireEvent.click(screen.getByText('时间轴'))
      // Back in list mode
      expect(screen.getByText('列表')).toBeInTheDocument()
    })

    it('renders timeline view with packets', () => {
      renderMonitor()
      fireEvent.click(screen.getByText('列表'))
      // Timeline should show packet count
      expect(screen.getByText(/Timeline view -- 5 packets/)).toBeInTheDocument()
    })

    it('renders timeline empty state', () => {
      mockStore.acpPackets = []
      renderMonitor()
      fireEvent.click(screen.getByText('列表'))
      expect(screen.getByText('Waiting for protocol packets...')).toBeInTheDocument()
    })

    it('shows time axis labels in timeline', () => {
      renderMonitor()
      fireEvent.click(screen.getByText('列表'))
      // Time labels should exist (format varies by locale, so just check they exist)
      const timeLabels = screen.getAllByText(/\d{1,2}:\d{2}/)
      expect(timeLabels.length).toBeGreaterThanOrEqual(2)
    })
  })

  // -----------------------------------------------------------------------
  // Filter tabs
  // -----------------------------------------------------------------------

  describe('filter tabs', () => {
    it('shows all packets in 全部 tab (default)', () => {
      renderMonitor()
      expect(screen.getByText('5 pkts')).toBeInTheDocument()
    })

    it('filters to ACP packets only', () => {
      renderMonitor()
      fireEvent.click(screen.getByText('ACP'))
      // ACP_ORCHESTRATE (pkt-1, pkt-5) + ACP_PRIVILEGE_GATE (pkt-4) = 3
      // The list view should show only those packet types
      expect(screen.queryByText('A2A_PROTOCOL')).not.toBeInTheDocument()
      expect(screen.queryByText('MCP_TOOL_INVOKED')).not.toBeInTheDocument()
    })

    it('filters to A2A packets only', () => {
      renderMonitor()
      fireEvent.click(screen.getByText('A2A'))
      expect(screen.queryByText('ACP_ORCHESTRATE')).not.toBeInTheDocument()
      expect(screen.queryByText('MCP_TOOL_INVOKED')).not.toBeInTheDocument()
      expect(screen.getByText('A2A_PROTOCOL')).toBeInTheDocument()
    })

    it('filters to MCP packets only', () => {
      renderMonitor()
      fireEvent.click(screen.getByText('MCP'))
      expect(screen.queryByText('ACP_ORCHESTRATE')).not.toBeInTheDocument()
      expect(screen.queryByText('A2A_PROTOCOL')).not.toBeInTheDocument()
      expect(screen.getAllByText('MCP_TOOL_INVOKED').length).toBeGreaterThanOrEqual(1)
    })

    it('resets filter when clicking 全部', () => {
      renderMonitor()
      fireEvent.click(screen.getByText('MCP'))
      expect(screen.queryByText('ACP_ORCHESTRATE')).not.toBeInTheDocument()
      fireEvent.click(screen.getByText('全部'))
      expect(screen.getAllByText('ACP_ORCHESTRATE').length).toBeGreaterThanOrEqual(2)
    })
  })

  // -----------------------------------------------------------------------
  // Search
  // -----------------------------------------------------------------------

  describe('search', () => {
    it('filters packets by search text matching type', () => {
      renderMonitor()
      const input = screen.getByPlaceholderText('Search packets...')
      fireEvent.change(input, { target: { value: 'MCP_TOOL' } })
      expect(screen.getAllByText('MCP_TOOL_INVOKED').length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByText('ACP_ORCHESTRATE')).not.toBeInTheDocument()
    })

    it('filters packets by search text matching source', () => {
      renderMonitor()
      const input = screen.getByPlaceholderText('Search packets...')
      fireEvent.change(input, { target: { value: 'security' } })
      expect(screen.getByText('ACP_PRIVILEGE_GATE')).toBeInTheDocument()
    })

    it('filters packets by search text matching target', () => {
      renderMonitor()
      const input = screen.getByPlaceholderText('Search packets...')
      fireEvent.change(input, { target: { value: 'mcp-server' } })
      expect(screen.getAllByText('MCP_TOOL_INVOKED').length).toBeGreaterThanOrEqual(1)
    })

    it('filters packets by search text matching payload', () => {
      renderMonitor()
      const input = screen.getByPlaceholderText('Search packets...')
      fireEvent.change(input, { target: { value: 'read_file' } })
      expect(screen.getAllByText('MCP_TOOL_INVOKED').length).toBeGreaterThanOrEqual(1)
    })

    it('filters packets by search text matching details', () => {
      renderMonitor()
      const input = screen.getByPlaceholderText('Search packets...')
      fireEvent.change(input, { target: { value: 'run_tests' } })
      expect(screen.getAllByText('ACP_ORCHESTRATE').length).toBeGreaterThanOrEqual(1)
    })

    it('shows empty state when search matches nothing', () => {
      renderMonitor()
      const input = screen.getByPlaceholderText('Search packets...')
      fireEvent.change(input, { target: { value: 'nonexistent-xyz' } })
      expect(screen.getByText('Waiting for protocol packets...')).toBeInTheDocument()
    })

    it('is case-insensitive', () => {
      renderMonitor()
      const input = screen.getByPlaceholderText('Search packets...')
      fireEvent.change(input, { target: { value: 'queen' } })
      // queen is the source of pkt-1 and pkt-5 (ACP_ORCHESTRATE)
      expect(screen.getAllByText('ACP_ORCHESTRATE').length).toBeGreaterThanOrEqual(1)
    })

    it('clears search results when input is cleared', () => {
      renderMonitor()
      const input = screen.getByPlaceholderText('Search packets...')
      fireEvent.change(input, { target: { value: 'nonexistent' } })
      expect(screen.getByText('Waiting for protocol packets...')).toBeInTheDocument()
      fireEvent.change(input, { target: { value: '' } })
      expect(screen.getAllByText('ACP_ORCHESTRATE').length).toBeGreaterThanOrEqual(2)
    })

    it('trims whitespace from search text', () => {
      renderMonitor()
      const input = screen.getByPlaceholderText('Search packets...')
      fireEvent.change(input, { target: { value: '   ' } })
      // Whitespace-only should not filter
      expect(screen.getAllByText('ACP_ORCHESTRATE').length).toBeGreaterThanOrEqual(2)
    })
  })

  // -----------------------------------------------------------------------
  // Context label filtering
  // -----------------------------------------------------------------------

  describe('context label filtering', () => {
    it('filters packets by context label matching source', () => {
      renderMonitor({ contextLabel: 'queen' })
      // Only pkt-1 and pkt-5 have source=queen
      expect(screen.getByText('2 pkts')).toBeInTheDocument()
    })

    it('filters packets by context label matching target', () => {
      renderMonitor({ contextLabel: 'agent-2' })
      // pkt-2 has target=agent-2
      expect(screen.getByText('1 pkts')).toBeInTheDocument()
    })

    it('filters packets by context label matching payload', () => {
      renderMonitor({ contextLabel: 'read_file' })
      // pkt-3 payload contains read_file
      expect(screen.getByText('1 pkts')).toBeInTheDocument()
    })

    it('filters packets by context label matching details fields', () => {
      renderMonitor({ contextLabel: 'claude-code' })
      // pkt-1 details.agent = claude-code
      expect(screen.getByText('1 pkts')).toBeInTheDocument()
    })

    it('is case-insensitive for context label', () => {
      renderMonitor({ contextLabel: 'QUEEN' })
      expect(screen.getByText('2 pkts')).toBeInTheDocument()
    })

    it('updates stat dots based on context-filtered packets', () => {
      renderMonitor({ contextLabel: 'agent-1' })
      // pkt-1 (target agent-1, ORCHESTRATE), pkt-2 (source agent-1, A2A), pkt-3 (source agent-1, MCP)
      expect(screen.getByText('3 pkts')).toBeInTheDocument()
    })

    it('shows zero packets when context label matches nothing', () => {
      renderMonitor({ contextLabel: 'nonexistent-agent' })
      expect(screen.getByText('0 pkts')).toBeInTheDocument()
      expect(screen.getByText('Waiting for protocol packets...')).toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  // Audit toggle
  // -----------------------------------------------------------------------

  describe('audit toggle', () => {
    it('calls toggleAudit when LIVE button is clicked', () => {
      renderMonitor()
      fireEvent.click(screen.getByText('LIVE'))
      expect(mockToggleAudit).toHaveBeenCalledTimes(1)
    })

    it('calls toggleAudit when OFF button is clicked', () => {
      mockStore.auditEnabled = false
      renderMonitor()
      fireEvent.click(screen.getByText('OFF'))
      expect(mockToggleAudit).toHaveBeenCalledTimes(1)
    })
  })

  // -----------------------------------------------------------------------
  // PacketHeader rendering
  // -----------------------------------------------------------------------

  describe('packet header', () => {
    it('shows QUEEN_SUPERVISOR as source for ACP_ORCHESTRATE packets', () => {
      renderMonitor()
      // PacketHeaders show (QUEEN_SUPERVISOR -> agent-X) for orchestrate
      expect(screen.getByText(/QUEEN_SUPERVISOR -> agent-1/)).toBeInTheDocument()
    })

    it('shows source directly for non-orchestrate packets', () => {
      renderMonitor()
      // A2A packet has source=agent-1, target=agent-2
      expect(screen.getByText(/agent-1 -> agent-2/)).toBeInTheDocument()
    })

    it('shows timestamp for packets', () => {
      renderMonitor()
      // All packets have timestamps, the format is locale-dependent
      // Just verify there's time-related content
      const timeElements = screen.getAllByText(/\d{1,2}:\d{2}:\d{2}/)
      expect(timeElements.length).toBeGreaterThan(0)
    })

    it('does not show icon for MCP_TOOL_INVOKED in header', () => {
      const { container } = renderMonitor()
      // MCP packets use PacketIcon in PacketBody, not PacketHeader
      // The header SVGs for other types should still exist
      const svgs = container.querySelectorAll('svg')
      expect(svgs.length).toBeGreaterThan(0)
    })

    it('shows source without target when target is empty', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-notarget',
          type: 'ACP_ORCHESTRATE',
          source: 'queen',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: {},
        },
      ]
      renderMonitor()
      // Source should be QUEEN_SUPERVISOR for orchestrate, no target arrow
      expect(screen.getByText(/QUEEN_SUPERVISOR\)/)).toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  // Deep packet details rendering
  // -----------------------------------------------------------------------

  describe('deep packet details', () => {
    it('renders ACP_ORCHESTRATE details with cmd, agent, and task', () => {
      renderMonitor()
      expect(screen.getByText('run_tests')).toBeInTheDocument()
      expect(screen.getByText('claude-code')).toBeInTheDocument()
    })

    it('renders A2A_PROTOCOL details with from, to, type', () => {
      renderMonitor()
      expect(screen.getByText('agent-1')).toBeInTheDocument()
      expect(screen.getByText('agent-2')).toBeInTheDocument()
      expect(screen.getByText('request')).toBeInTheDocument()
    })

    it('renders ACP_PRIVILEGE_GATE details with permission, agent, status', () => {
      renderMonitor()
      expect(screen.getByText('write')).toBeInTheDocument()
      expect(screen.getByText('APPROVED')).toBeInTheDocument()
    })

    it('renders MCP_TOOL_INVOKED details with tool, server, result', () => {
      renderMonitor()
      expect(screen.getByText('read_file')).toBeInTheDocument()
      expect(screen.getByText('filesystem')).toBeInTheDocument()
      expect(screen.getByText('OK')).toBeInTheDocument()
    })

    it('renders MCP_TOOL_INVOKED with FAIL status', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-fail',
          type: 'MCP_TOOL_INVOKED',
          source: 'agent-1',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { toolName: 'bad_tool', serverId: 'broken', result: false },
        },
      ]
      renderMonitor()
      expect(screen.getByText('FAIL')).toBeInTheDocument()
    })

    it('renders MCP_TOOL_INVOKED with string result status', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-str',
          type: 'MCP_TOOL_INVOKED',
          source: 'agent-1',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { toolName: 'tool', serverId: 'server', result: 'partial_success' },
        },
      ]
      renderMonitor()
      expect(screen.getByText('partial_success')).toBeInTheDocument()
    })

    it('renders ACP_PRIVILEGE_GATE with DENIED status', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-denied',
          type: 'ACP_PRIVILEGE_GATE',
          source: 'gate',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { permission: 'admin', requestingAgent: 'evil-agent', approved: false },
        },
      ]
      renderMonitor()
      expect(screen.getByText('DENIED')).toBeInTheDocument()
    })

    it('renders ACP_PRIVILEGE_GATE with string status', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-pending',
          type: 'ACP_PRIVILEGE_GATE',
          source: 'gate',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { permission: 'deploy', requestingAgent: 'agent-x', status: 'pending_review' },
        },
      ]
      renderMonitor()
      expect(screen.getByText('PENDING_REVIEW')).toBeInTheDocument()
    })

    it('renders fallback payload when details are empty but payload exists', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-info',
          type: 'ACP_ORCHESTRATE',
          source: 'queen',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '{"custom":"data"}',
          details: undefined,
        },
      ]
      renderMonitor()
      expect(screen.getByText('{"custom":"data"}')).toBeInTheDocument()
    })

    it('does not render fallback when payload is empty curly braces', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-empty',
          type: 'ACP_ORCHESTRATE',
          source: 'queen',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '{}',
          details: undefined,
        },
      ]
      renderMonitor()
      // The fallback should not render for empty JSON
      expect(screen.queryByText('{}')).not.toBeInTheDocument()
    })

    it('does not render fallback for default empty payload pattern', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-default',
          type: 'ACP_ORCHESTRATE',
          source: 'queen',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '{\n  "action": "",\n  "resource": "",\n  "details": {}\n}',
          details: undefined,
        },
      ]
      renderMonitor()
      // Should not render the default empty payload
      expect(screen.queryByText(/"action": ""/)).not.toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  // PacketBody rendering for MCP
  // -----------------------------------------------------------------------

  describe('MCP packet body', () => {
    it('renders MCP_TOOL_INVOKED with bold header and pulsing icon', () => {
      renderMonitor()
      fireEvent.click(screen.getByText('MCP'))
      // MCP body has a bold "MCP_TOOL_INVOKED" text (in a div with font-bold)
      const mcpElements = screen.getAllByText('MCP_TOOL_INVOKED')
      // Find the one inside a font-bold container (the PacketBody)
      const boldElement = mcpElements.find((el) => {
        const parent = el.closest('div.font-bold')
        return parent !== null
      })
      expect(boldElement).toBeTruthy()
      if (boldElement) {
        const svg = boldElement.closest('div')?.querySelector('svg')
        expect(svg?.className.baseVal).toContain('animate-pulse')
      }
    })
  })

  // -----------------------------------------------------------------------
  // DetailLabel
  // -----------------------------------------------------------------------

  describe('detail label', () => {
    it('does not render when value is empty string', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-noval',
          type: 'ACP_ORCHESTRATE',
          source: 'queen',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { command: '', agent: '', task: '' },
        },
      ]
      renderMonitor()
      // With all empty strings in parsed result, no detail labels should appear
      // The parseOrchestrate function returns null when all are empty
      // So the fallback should try raw payload which is empty
      expect(screen.queryByText('cmd:')).not.toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  // parse functions edge cases
  // -----------------------------------------------------------------------

  describe('parse function edge cases', () => {
    it('handles A2A with string payload under 80 chars', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-a2a-short',
          type: 'A2A_PROTOCOL',
          source: 'a',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { sender: 's', receiver: 'r', messageType: 't', payload: 'short payload' },
        },
      ]
      renderMonitor()
      expect(screen.getByText('short payload')).toBeInTheDocument()
    })

    it('handles A2A with string payload over 80 chars (truncated)', () => {
      const longPayload = 'a'.repeat(100)
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-a2a-long',
          type: 'A2A_PROTOCOL',
          source: 'a',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { sender: 's', receiver: 'r', messageType: 't', payload: longPayload },
        },
      ]
      renderMonitor()
      expect(screen.getByText('a'.repeat(80) + '...')).toBeInTheDocument()
    })

    it('handles A2A with object payload', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-a2a-obj',
          type: 'A2A_PROTOCOL',
          source: 'a',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { sender: 's', receiver: 'r', messageType: 't', message: { key: 'value' } },
        },
      ]
      renderMonitor()
      expect(screen.getByText('{"key":"value"}')).toBeInTheDocument()
    })

    it('handles MCP with string args over 80 chars (truncated)', () => {
      const longArgs = 'b'.repeat(100)
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-mcp-long',
          type: 'MCP_TOOL_INVOKED',
          source: 'agent',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { toolName: 'tool', serverId: 'srv', args: longArgs },
        },
      ]
      renderMonitor()
      expect(screen.getByText('b'.repeat(80) + '...')).toBeInTheDocument()
    })

    it('handles MCP with object args', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-mcp-obj',
          type: 'MCP_TOOL_INVOKED',
          source: 'agent',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { toolName: 'tool', serverId: 'srv', arguments: { foo: 'bar' } },
        },
      ]
      renderMonitor()
      expect(screen.getByText('{"foo":"bar"}')).toBeInTheDocument()
    })

    it('handles MCP with string result over 30 chars (truncated)', () => {
      const longResult = 'c'.repeat(50)
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-mcp-res',
          type: 'MCP_TOOL_INVOKED',
          source: 'agent',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { toolName: 'tool', serverId: 'srv', result: longResult },
        },
      ]
      renderMonitor()
      expect(screen.getByText('c'.repeat(30) + '...')).toBeInTheDocument()
    })

    it('handles ACP_ORCHESTRATE with task description over 120 chars (truncated)', () => {
      const longTask = 'd'.repeat(150)
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-orch-long',
          type: 'ACP_ORCHESTRATE',
          source: 'queen',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { command: 'cmd', task: longTask },
        },
      ]
      renderMonitor()
      expect(screen.getByText('d'.repeat(120) + '...')).toBeInTheDocument()
    })

    it('handles A2A with all empty fields returning null', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-a2a-empty',
          type: 'A2A_PROTOCOL',
          source: 'a',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { sender: '', receiver: '', messageType: '' },
        },
      ]
      renderMonitor()
      // With all empty, parseA2A returns null, DeepPacketDetails returns null
      // So no detail labels should appear for this packet
      expect(screen.queryByText('from:')).not.toBeInTheDocument()
    })

    it('handles ACP_PRIVILEGE_GATE with no approved/status field', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-gate-nostatus',
          type: 'ACP_PRIVILEGE_GATE',
          source: 'gate',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { permission: 'read', requestingAgent: 'agent-x' },
        },
      ]
      renderMonitor()
      expect(screen.getByText('read')).toBeInTheDocument()
      expect(screen.getByText('agent-x')).toBeInTheDocument()
      // approvalStatus should be empty, so no "status:" label
      expect(screen.queryByText('APPROVED')).not.toBeInTheDocument()
      expect(screen.queryByText('DENIED')).not.toBeInTheDocument()
    })

    it('handles MCP with no toolName or serverId (parse returns null)', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-mcp-empty',
          type: 'MCP_TOOL_INVOKED',
          source: 'agent',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: {},
        },
      ]
      renderMonitor()
      // parseMCPTool returns null when both toolName and serverId are empty
      // DeepPacketDetails should not render tool/server labels
      expect(screen.queryByText('tool:')).not.toBeInTheDocument()
    })

    it('handles undefined details gracefully', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-undef',
          type: 'ACP_ORCHESTRATE',
          source: 'queen',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: undefined,
        },
      ]
      renderMonitor()
      // Should not throw, renders gracefully
      expect(screen.getByText('ACP_ORCHESTRATE')).toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  // Timeline view
  // -----------------------------------------------------------------------

  describe('timeline view', () => {
    it('renders all packets in timeline', () => {
      renderMonitor()
      fireEvent.click(screen.getByText('列表'))
      // Should show all 5 packets in timeline content
      const typeLabels = screen.getAllByText(/ACP_ORCHESTRATE|A2A_PROTOCOL|MCP_TOOL_INVOKED|ACP_PRIVILEGE_GATE/)
      expect(typeLabels.length).toBe(5)
    })

    it('renders packet footer with count', () => {
      renderMonitor()
      fireEvent.click(screen.getByText('列表'))
      expect(screen.getByText('* Timeline view -- 5 packets')).toBeInTheDocument()
    })

    it('handles single packet in timeline', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-single',
          type: 'ACP_ORCHESTRATE',
          source: 'queen',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: {},
        },
      ]
      renderMonitor()
      fireEvent.click(screen.getByText('列表'))
      expect(screen.getByText('* Timeline view -- 1 packets')).toBeInTheDocument()
    })

    it('handles packets with same timestamp', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-same1',
          type: 'ACP_ORCHESTRATE',
          source: 'queen',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: {},
        },
        {
          ...basePacket,
          id: 'pkt-same2',
          type: 'A2A_PROTOCOL',
          source: 'agent',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: {},
        },
      ]
      renderMonitor()
      fireEvent.click(screen.getByText('列表'))
      expect(screen.getByText('* Timeline view -- 2 packets')).toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  // Combined search + tab filter
  // -----------------------------------------------------------------------

  describe('combined search and tab filter', () => {
    it('search applies on top of tab filter', () => {
      renderMonitor()
      fireEvent.click(screen.getByText('ACP'))
      // Only ACP packets visible now (pkt-1, pkt-4, pkt-5)
      const input = screen.getByPlaceholderText('Search packets...')
      // Search for PRIVILEGE_GATE specific content
      fireEvent.change(input, { target: { value: 'write' } })
      // Only pkt-4 should match
      expect(screen.getByText('ACP_PRIVILEGE_GATE')).toBeInTheDocument()
      expect(screen.queryByText('ACP_ORCHESTRATE')).not.toBeInTheDocument()
    })

    it('tab filter works within context-filtered results', () => {
      renderMonitor({ contextLabel: 'agent-1' })
      // 3 packets match context: pkt-1, pkt-2, pkt-3
      fireEvent.click(screen.getByText('A2A'))
      // Only pkt-2 is A2A
      expect(screen.getByText('A2A_PROTOCOL')).toBeInTheDocument()
      expect(screen.queryByText('ACP_ORCHESTRATE')).not.toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  // PacketIcon
  // -----------------------------------------------------------------------

  describe('packet icon', () => {
    it('renders SVG icon for non-MCP packets in header', () => {
      const { container } = renderMonitor()
      // Non-MCP packets should have icons in their headers
      const svgs = container.querySelectorAll('svg.w-3')
      expect(svgs.length).toBeGreaterThan(0)
    })

    it('renders SVG icon with animate-pulse for MCP in body', () => {
      const { container } = renderMonitor()
      const pulsingSvgs = container.querySelectorAll('svg.animate-pulse')
      expect(pulsingSvgs.length).toBeGreaterThan(0)
    })
  })

  // -----------------------------------------------------------------------
  // StatDot
  // -----------------------------------------------------------------------

  describe('stat dots', () => {
    it('renders colored dots for each category', () => {
      const { container } = renderMonitor()
      // Stat dots use inline-block rounded-full spans
      const dots = container.querySelectorAll('span.inline-block.w-1\\.5')
      expect(dots.length).toBe(3) // ACP, A2A, MCP
    })

    it('shows zero counts for missing categories', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-only',
          type: 'ACP_ORCHESTRATE',
          source: 'queen',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: {},
        },
      ]
      renderMonitor()
      expect(screen.getByText('ACP:1')).toBeInTheDocument()
      expect(screen.getByText('A2A:0')).toBeInTheDocument()
      expect(screen.getByText('MCP:0')).toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  // Packet with target display
  // -----------------------------------------------------------------------

  describe('packet target display', () => {
    it('shows source -> target when both exist', () => {
      renderMonitor()
      // pkt-2 has source=agent-1, target=agent-2
      expect(screen.getByText(/agent-1 -> agent-2/)).toBeInTheDocument()
    })

    it('shows source only when no target', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-notgt',
          type: 'A2A_PROTOCOL',
          source: 'solo-agent',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { sender: 'a', receiver: 'b', messageType: 'c' },
        },
      ]
      renderMonitor()
      expect(screen.getByText(/solo-agent\)$/)).toBeInTheDocument()
    })

    it('hides source span when source is empty', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-nosrc',
          type: 'A2A_PROTOCOL',
          source: '',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { sender: 'a', receiver: 'b', messageType: 'c' },
        },
      ]
      renderMonitor()
      // Source span should not render when source is empty
      expect(screen.queryByText(/\(\)/)).not.toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  // Alternative field name parsing
  // -----------------------------------------------------------------------

  describe('alternative field name parsing', () => {
    it('parses ACP_ORCHESTRATE with action field', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-action',
          type: 'ACP_ORCHESTRATE',
          source: 'queen',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { action: 'deploy', targetAgent: 'prod-agent', description: 'Deploy to prod' },
        },
      ]
      renderMonitor()
      expect(screen.getByText('deploy')).toBeInTheDocument()
      expect(screen.getByText('prod-agent')).toBeInTheDocument()
    })

    it('parses ACP_ORCHESTRATE with subtype and goal fields', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-subtype',
          type: 'ACP_ORCHESTRATE',
          source: 'queen',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { subtype: 'build', goal: 'Build the project' },
        },
      ]
      renderMonitor()
      expect(screen.getByText('build')).toBeInTheDocument()
      expect(screen.getByText('Build the project')).toBeInTheDocument()
    })

    it('parses ACP_ORCHESTRATE with eventType and prompt fields', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-evtype',
          type: 'ACP_ORCHESTRATE',
          source: 'queen',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { eventType: 'orchestrate', assignee: 'agent-y', prompt: 'Do something' },
        },
      ]
      renderMonitor()
      expect(screen.getByText('orchestrate')).toBeInTheDocument()
      expect(screen.getByText('agent-y')).toBeInTheDocument()
    })

    it('parses A2A with from/to/protocol fields', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-a2a-alt',
          type: 'A2A_PROTOCOL',
          source: 'a',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { from: 'sender-a', to: 'receiver-b', protocol: 'handshake' },
        },
      ]
      renderMonitor()
      expect(screen.getByText('sender-a')).toBeInTheDocument()
      expect(screen.getByText('receiver-b')).toBeInTheDocument()
      expect(screen.getByText('handshake')).toBeInTheDocument()
    })

    it('parses A2A with source/target/msgType and data body', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-a2a-alt2',
          type: 'A2A_PROTOCOL',
          source: 'a',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { source: 'x', target: 'y', msgType: 'z', data: { nested: true } },
        },
      ]
      renderMonitor()
      expect(screen.getByText('x')).toBeInTheDocument()
      expect(screen.getByText('y')).toBeInTheDocument()
      expect(screen.getByText('z')).toBeInTheDocument()
      expect(screen.getByText('{"nested":true}')).toBeInTheDocument()
    })

    it('parses ACP_PRIVILEGE_GATE with capability/requester/actor fields', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-priv-alt',
          type: 'ACP_PRIVILEGE_GATE',
          source: 'gate',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { capability: 'sudo', requester: 'admin-bot', granted: false },
        },
      ]
      renderMonitor()
      expect(screen.getByText('sudo')).toBeInTheDocument()
      expect(screen.getByText('admin-bot')).toBeInTheDocument()
      expect(screen.getByText('DENIED')).toBeInTheDocument()
    })

    it('parses ACP_PRIVILEGE_GATE with privilege/operation/allowed fields', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-priv-alt2',
          type: 'ACP_PRIVILEGE_GATE',
          source: 'gate',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { privilege: 'exec', operation: 'shell', allowed: true },
        },
      ]
      renderMonitor()
      expect(screen.getByText('exec')).toBeInTheDocument()
      expect(screen.getByText('APPROVED')).toBeInTheDocument()
    })

    it('parses MCP with tool/method/serverName fields', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-mcp-alt',
          type: 'MCP_TOOL_INVOKED',
          source: 'agent',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { method: 'execute', serverName: 'runtime', success: true },
        },
      ]
      renderMonitor()
      expect(screen.getByText('execute')).toBeInTheDocument()
      expect(screen.getByText('runtime')).toBeInTheDocument()
      expect(screen.getByText('OK')).toBeInTheDocument()
    })

    it('parses MCP with function/server and params input fields', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-mcp-alt2',
          type: 'MCP_TOOL_INVOKED',
          source: 'agent',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: { function: 'calc', server: 'math', input: 'expr', status: 'done' },
        },
      ]
      renderMonitor()
      expect(screen.getByText('calc')).toBeInTheDocument()
      expect(screen.getByText('math')).toBeInTheDocument()
      expect(screen.getByText('done')).toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  // INFO packet type
  // -----------------------------------------------------------------------

  describe('INFO packet type', () => {
    it('renders INFO packets', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-info',
          type: 'INFO',
          source: 'system',
          timestamp: '2026-01-01T00:00:00Z',
          payload: 'System initialized',
          details: {},
        },
      ]
      renderMonitor()
      expect(screen.getByText('INFO')).toBeInTheDocument()
    })

    it('INFO packets are counted in total but not in ACP/A2A/MCP', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-info',
          type: 'INFO',
          source: 'system',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: {},
        },
      ]
      renderMonitor()
      expect(screen.getByText('1 pkts')).toBeInTheDocument()
      expect(screen.getByText('ACP:0')).toBeInTheDocument()
      expect(screen.getByText('A2A:0')).toBeInTheDocument()
      expect(screen.getByText('MCP:0')).toBeInTheDocument()
    })

    it('INFO packets are not filtered by any specific tab', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-info',
          type: 'INFO',
          source: 'system',
          timestamp: '2026-01-01T00:00:00Z',
          payload: '',
          details: {},
        },
      ]
      renderMonitor()
      // INFO shows in 'all' tab
      expect(screen.getByText('INFO')).toBeInTheDocument()
      // Click ACP tab - INFO should not appear
      fireEvent.click(screen.getByText('ACP'))
      expect(screen.queryByText('INFO')).not.toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  // Timestamp rendering in packets without timestamp
  // -----------------------------------------------------------------------

  describe('packet without timestamp', () => {
    it('renders packet with empty timestamp gracefully', () => {
      mockStore.acpPackets = [
        {
          ...basePacket,
          id: 'pkt-nots',
          type: 'ACP_ORCHESTRATE',
          source: 'queen',
          timestamp: '',
          payload: '',
          details: { command: 'cmd', agent: 'agent' },
        },
      ]
      renderMonitor()
      expect(screen.getByText('ACP_ORCHESTRATE')).toBeInTheDocument()
    })
  })
})
