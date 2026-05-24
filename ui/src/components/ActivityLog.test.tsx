import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ActivityLog from './ActivityLog'

vi.mock('../hooks/useAutoScroll', () => ({
  useAutoScroll: () => ({ containerRef: { current: null }, handleScroll: vi.fn() }),
}))

const sampleEntries = [
  { id: '1', timestamp: '2026-01-01T10:00:00Z', activityType: 'GOAL_INIT' as const, actor: 'queen', action: 'parse', resourceType: 'task', resourceId: 't1', color: '#58a6ff' },
  { id: '2', timestamp: '2026-01-01T10:01:00Z', activityType: 'MCP_CALL' as const, actor: 'claude', action: 'readFile', resourceType: 'fs', resourceId: 'App.tsx', color: '#c084fc' },
  { id: '3', timestamp: '2026-01-01T10:02:00Z', activityType: 'AGENT_START' as const, actor: 'system', action: '启动', resourceType: 'agent', resourceId: 'a1', color: '#22d3ee' },
  { id: '4', timestamp: '2026-01-01T10:03:00Z', activityType: 'SKILL_SCAN' as const, actor: 'scanner', action: '扫描完成', resourceType: 'skill', resourceId: 'test', color: '#f97316' },
  { id: '5', timestamp: '2026-01-01T10:04:00Z', activityType: 'HITL_PASSED' as const, actor: 'user', action: '授权', resourceType: 'file', resourceId: 'f1', color: '#34d399' },
]

const defaultStore = { activityEntries: sampleEntries }

vi.mock('../stores/monitoringStore', () => ({
  useMonitoringStore: (selector: any) => selector(defaultStore),
}))

describe('ActivityLog', () => {
  beforeEach(() => {
    defaultStore.activityEntries = [...sampleEntries]
    vi.clearAllMocks()
  })

  it('renders audit header', () => {
    render(<ActivityLog />)
    expect(screen.getByText(/蜂群运作活动审计流/)).toBeInTheDocument()
  })

  it('renders all filter buttons', () => {
    render(<ActivityLog />)
    expect(screen.getByText('全部')).toBeInTheDocument()
    expect(screen.getByText('MCP')).toBeInTheDocument()
    expect(screen.getByText('Agent')).toBeInTheDocument()
    expect(screen.getByText('协定')).toBeInTheDocument()
    expect(screen.getByText('Skill')).toBeInTheDocument()
    expect(screen.getByText('系统')).toBeInTheDocument()
  })

  it('shows all entries by default', () => {
    render(<ActivityLog />)
    expect(screen.getByText('[GOAL_INIT]')).toBeInTheDocument()
    expect(screen.getByText('[MCP_CALL]')).toBeInTheDocument()
    expect(screen.getByText('[AGENT_START]')).toBeInTheDocument()
  })

  it('filters to MCP entries', () => {
    render(<ActivityLog />)
    fireEvent.click(screen.getByText('MCP'))
    expect(screen.getByText('[MCP_CALL]')).toBeInTheDocument()
    expect(screen.queryByText('[GOAL_INIT]')).toBeNull()
  })

  it('filters to Agent entries', () => {
    render(<ActivityLog />)
    fireEvent.click(screen.getByText('Agent'))
    expect(screen.getByText('[GOAL_INIT]')).toBeInTheDocument()
    expect(screen.getByText('[AGENT_START]')).toBeInTheDocument()
    expect(screen.queryByText('[MCP_CALL]')).toBeNull()
  })

  it('filters to Skill entries', () => {
    render(<ActivityLog />)
    fireEvent.click(screen.getByText('Skill'))
    expect(screen.getByText('[SKILL_SCAN]')).toBeInTheDocument()
    expect(screen.queryByText('[GOAL_INIT]')).toBeNull()
  })

  it('shows empty state when no entries', () => {
    defaultStore.activityEntries = []
    render(<ActivityLog />)
    expect(screen.getByText('暂无活动记录')).toBeInTheDocument()
  })

  it('shows empty state when filter matches nothing', () => {
    defaultStore.activityEntries = [sampleEntries[0]] // only GOAL_INIT
    render(<ActivityLog />)
    fireEvent.click(screen.getByText('MCP'))
    expect(screen.getByText('暂无活动记录')).toBeInTheDocument()
  })

  it('resets filter when clicking 全部', () => {
    render(<ActivityLog />)
    fireEvent.click(screen.getByText('MCP'))
    expect(screen.queryByText('[GOAL_INIT]')).toBeNull()
    fireEvent.click(screen.getByText('全部'))
    expect(screen.getByText('[GOAL_INIT]')).toBeInTheDocument()
  })

  it('renders activity descriptions with actor names', () => {
    render(<ActivityLog />)
    expect(screen.getByText('queen', { exact: false })).toBeInTheDocument()
  })

  it('renders HITL_PASSED with green styling context', () => {
    render(<ActivityLog />)
    expect(screen.getByText('[HITL_PASSED]')).toBeInTheDocument()
  })
})
