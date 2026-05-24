import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ProtocolMonitor from './ProtocolMonitor'
import type { ProtocolPacket } from '../stores/monitoringStore'

const mockPackets: ProtocolPacket[] = [
  {
    id: 'pkt-1',
    type: 'ACP_ORCHESTRATE',
    source: 'queen',
    target: 'agent-1',
    timestamp: '2026-01-01T00:00:00Z',
    payload: '{"action":"execute"}',
    details: { command: 'run_tests' },
    color: '#fbbf24',
    borderColor: '#92400e',
    bgTint: 'rgba(251,191,36,0.05)',
  },
  {
    id: 'pkt-2',
    type: 'A2A_PROTOCOL',
    source: 'agent-1',
    target: 'agent-2',
    timestamp: '2026-01-01T00:00:01Z',
    payload: '{"message":"hello"}',
    details: {},
    color: '#22d3ee',
    borderColor: '#0e7490',
    bgTint: 'rgba(34,211,238,0.05)',
  },
  {
    id: 'pkt-3',
    type: 'MCP_TOOL_INVOKED',
    source: 'agent-1',
    target: 'mcp-server',
    timestamp: '2026-01-01T00:00:02Z',
    payload: '{"tool":"read_file"}',
    details: { args: { path: '/test.ts' } },
    color: '#c084fc',
    borderColor: '#7c3aed',
    bgTint: 'rgba(192,132,252,0.05)',
  },
]

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

describe('ProtocolMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders protocol monitor header', () => {
    render(<ProtocolMonitor />)
    expect(screen.getByText(/ACP & A2A Protocol Packet Monitor/)).toBeInTheDocument()
  })

  it('shows filter tabs', () => {
    render(<ProtocolMonitor />)
    expect(screen.getByText('全部')).toBeInTheDocument()
    expect(screen.getByText('ACP')).toBeInTheDocument()
    expect(screen.getByText('A2A')).toBeInTheDocument()
    expect(screen.getByText('MCP')).toBeInTheDocument()
  })

  it('shows packet count', () => {
    render(<ProtocolMonitor />)
    expect(screen.getByText('3 pkts')).toBeInTheDocument()
  })

  it('shows live indicator when audit enabled', () => {
    render(<ProtocolMonitor />)
    expect(screen.getByText('LIVE')).toBeInTheDocument()
  })

  it('calls toggleAudit on live button click', () => {
    render(<ProtocolMonitor />)
    fireEvent.click(screen.getByText('LIVE'))
    expect(mockToggleAudit).toHaveBeenCalled()
  })

  it('shows search input', () => {
    render(<ProtocolMonitor />)
    expect(screen.getByPlaceholderText('Search packets...')).toBeInTheDocument()
  })

  it('renders context label when provided', () => {
    render(<ProtocolMonitor contextLabel="agent-1" />)
    expect(screen.getByText(/Protocol Monitor: agent-1/)).toBeInTheDocument()
  })

  it('shows stat dots for packet types', () => {
    render(<ProtocolMonitor />)
    expect(screen.getByText('ACP')).toBeInTheDocument()
    expect(screen.getByText('A2A')).toBeInTheDocument()
    expect(screen.getByText('MCP')).toBeInTheDocument()
  })
})
