import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DaemonLog from './DaemonLog'

vi.mock('../hooks/useAutoScroll', () => ({
  useAutoScroll: () => ({ containerRef: { current: null }, handleScroll: vi.fn() }),
}))

const mockDaemonLogs = [
  { id: '1', timestamp: '2026-01-01T10:00:00Z', tag: 'DAEMON' as const, message: 'Agent started' },
  { id: '2', timestamp: '2026-01-01T10:01:00Z', tag: 'MCP' as const, message: 'Server connected' },
  { id: '3', timestamp: '2026-01-01T10:02:00Z', tag: 'EXEC' as const, message: 'Task running' },
  { id: '4', timestamp: '2026-01-01T10:03:00Z', tag: 'HITL_TRIGGER' as const, message: 'Permission needed' },
  { id: '5', timestamp: '2026-01-01T10:04:00Z', tag: 'SKILL' as const, message: 'Skill scanned' },
  { id: '6', timestamp: '2026-01-01T10:05:00Z', tag: 'SYSTEM' as const, message: 'Config loaded' },
]

const defaultStore = {
  daemonLogs: mockDaemonLogs,
}

vi.mock('../stores/monitoringStore', () => ({
  useMonitoringStore: (selector: any) => selector(defaultStore),
  TAG_COLORS: {
    DAEMON: '#58a6ff',
    MCP: '#f0883e',
    EXEC: '#3fb950',
    HITL_TRIGGER: '#d29922',
    SKILL: '#bc8cff',
    SYSTEM: '#8b949e',
  },
}))

describe('DaemonLog', () => {
  beforeEach(() => {
    defaultStore.daemonLogs = [...mockDaemonLogs]
    vi.clearAllMocks()
  })

  it('renders all filter buttons', () => {
    render(<DaemonLog />)
    expect(screen.getByText('全部')).toBeInTheDocument()
    expect(screen.getByText('DAEMON')).toBeInTheDocument()
    expect(screen.getByText('MCP')).toBeInTheDocument()
    expect(screen.getByText('EXEC')).toBeInTheDocument()
    expect(screen.getByText('HITL')).toBeInTheDocument()
    expect(screen.getByText('SKILL')).toBeInTheDocument()
    expect(screen.getByText('SYSTEM')).toBeInTheDocument()
  })

  it('shows all logs by default', () => {
    render(<DaemonLog />)
    expect(screen.getByText('Agent started')).toBeInTheDocument()
    expect(screen.getByText('Server connected')).toBeInTheDocument()
    expect(screen.getByText('Task running')).toBeInTheDocument()
  })

  it('filters to DAEMON logs only', () => {
    render(<DaemonLog />)
    fireEvent.click(screen.getByText('DAEMON'))
    expect(screen.getByText('Agent started')).toBeInTheDocument()
    expect(screen.queryByText('Server connected')).toBeNull()
  })

  it('filters to MCP logs only', () => {
    render(<DaemonLog />)
    fireEvent.click(screen.getByText('MCP'))
    expect(screen.getByText('Server connected')).toBeInTheDocument()
    expect(screen.queryByText('Agent started')).toBeNull()
  })

  it('filters to SKILL logs only', () => {
    render(<DaemonLog />)
    fireEvent.click(screen.getByText('SKILL'))
    expect(screen.getByText('Skill scanned')).toBeInTheDocument()
    expect(screen.queryByText('Agent started')).toBeNull()
  })

  it('shows empty state when no logs', () => {
    defaultStore.daemonLogs = []
    render(<DaemonLog />)
    expect(screen.getByText('等待守护进程日志...')).toBeInTheDocument()
  })

  it('shows empty state when filter has no matching logs', () => {
    defaultStore.daemonLogs = [mockDaemonLogs[0]] // only DAEMON
    render(<DaemonLog />)
    fireEvent.click(screen.getByText('MCP'))
    expect(screen.getByText('等待守护进程日志...')).toBeInTheDocument()
  })

  it('shows tag labels in log entries', () => {
    render(<DaemonLog />)
    expect(screen.getByText('[DAEMON]')).toBeInTheDocument()
    expect(screen.getByText('[MCP]')).toBeInTheDocument()
  })

  it('resets filter when clicking 全部', () => {
    render(<DaemonLog />)
    fireEvent.click(screen.getByText('MCP'))
    expect(screen.queryByText('Agent started')).toBeNull()
    fireEvent.click(screen.getByText('全部'))
    expect(screen.getByText('Agent started')).toBeInTheDocument()
  })
})
