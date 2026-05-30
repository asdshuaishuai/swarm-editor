import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ActivityLog from './ActivityLog'
import type { ActivityEntry, ActivityType } from '../stores/monitoringStore'

vi.mock('../hooks/useAutoScroll', () => ({
  useAutoScroll: () => ({ containerRef: { current: null }, handleScroll: vi.fn() }),
}))

function getCard(label: string): HTMLElement | null {
  return screen.getByText(label).closest('.p-2') as HTMLElement | null
}

const createEntry = (overrides: Partial<ActivityEntry> & { id: string; activityType: ActivityType }): ActivityEntry => ({
  timestamp: '2026-01-01T10:00:00Z',
  actor: 'test-actor',
  action: 'test-action',
  resourceType: 'test-resource',
  resourceId: 'test-id',
  color: '#58a6ff',
  ...overrides,
})

const sampleEntries: ActivityEntry[] = [
  createEntry({ id: '1', activityType: 'GOAL_INIT', actor: 'queen', action: 'parse', resourceType: 'task', resourceId: 't1' }),
  createEntry({ id: '2', activityType: 'MCP_CALL', actor: 'claude', action: 'readFile', resourceType: 'fs', resourceId: 'App.tsx' }),
  createEntry({ id: '3', activityType: 'AGENT_START', actor: 'system', action: '启动', resourceType: 'agent', resourceId: 'a1' }),
  createEntry({ id: '4', activityType: 'SKILL_SCAN', actor: 'scanner', action: '扫描完成', resourceType: 'skill', resourceId: 'test' }),
  createEntry({ id: '5', activityType: 'HITL_PASSED', actor: 'user', action: '授权', resourceType: 'file', resourceId: 'f1' }),
]

const defaultStore = { activityEntries: sampleEntries }

vi.mock('../stores/monitoringStore', () => ({
  useMonitoringStore: (selector: (state: typeof defaultStore) => typeof defaultStore) => selector(defaultStore),
}))

describe('ActivityLog', () => {
  beforeEach(() => {
    defaultStore.activityEntries = [...sampleEntries]
    vi.clearAllMocks()
  })

  it('renders audit header', () => {
    render(<ActivityLog />)
    expect(screen.getByText(/活动日志/)).toBeInTheDocument()
  })

  it('renders all filter buttons', () => {
    render(<ActivityLog />)
    expect(screen.getByText('全部')).toBeInTheDocument()
    expect(screen.getByText('MCP')).toBeInTheDocument()
    expect(screen.getByText('工具')).toBeInTheDocument()
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

  // --- New tests for expanded coverage ---

  it('renders GOAL_INIT description', () => {
    render(<ActivityLog />)
    expect(screen.getByText(/接管全域控制/)).toBeInTheDocument()
  })

  it('renders MCP_CALL description', () => {
    render(<ActivityLog />)
    expect(screen.getByText(/readFile/)).toBeInTheDocument()
  })

  it('renders AGENT_START description', () => {
    render(<ActivityLog />)
    expect(screen.getByText(/已上线/)).toBeInTheDocument()
  })

  it('renders SKILL_SCAN description', () => {
    render(<ActivityLog />)
    expect(screen.getByText(/扫描完成/)).toBeInTheDocument()
  })

  it('renders HITL_PASSED description', () => {
    render(<ActivityLog />)
    expect(screen.getByText(/安全授权已通过/)).toBeInTheDocument()
  })

  it('renders SECURITY_GATE entry with amber styling', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '10', activityType: 'SECURITY_GATE', actor: 'attacker', action: 'privileged-test', resourceType: 'system', resourceId: 's1' }),
    ]
    render(<ActivityLog />)
    expect(screen.getByText('[SECURITY_GATE]')).toBeInTheDocument()
    expect(screen.getByText(/安全漏洞沙箱拦截技能/)).toBeInTheDocument()
    const card = getCard('[SECURITY_GATE]')
    expect(card?.style.background).toBe('rgba(69, 26, 3, 0.2)')
  })

  it('renders HITL_DENIED entry with rose styling', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '11', activityType: 'HITL_DENIED', actor: 'user', action: 'denied-action', resourceType: 'file', resourceId: 'f1' }),
    ]
    render(<ActivityLog />)
    expect(screen.getByText('[HITL_DENIED]')).toBeInTheDocument()
    expect(screen.getByText(/安全授权被拒绝/)).toBeInTheDocument()
    const card = getCard('[HITL_DENIED]')
    expect(card?.style.background).toBe('rgba(127, 29, 29, 0.2)')
  })

  it('renders BLUEPRINT entry', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '12', activityType: 'BLUEPRINT', actor: 'agent', action: 'code-skill', resourceType: 'module', resourceId: 'm1' }),
    ]
    render(<ActivityLog />)
    expect(screen.getByText('[BLUEPRINT]')).toBeInTheDocument()
    expect(screen.getByText(/Blueprint/)).toBeInTheDocument()
  })

  it('renders EXEC entry with default styling', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '13', activityType: 'EXEC', actor: 'worker', action: 'execute', resourceType: 'task', resourceId: 't1' }),
    ]
    render(<ActivityLog />)
    expect(screen.getByText('[EXEC]')).toBeInTheDocument()
    const card = getCard('[EXEC]')
    expect(card?.style.background).toBe('rgba(33, 38, 45, 0.4)')
  })

  it('renders AGENT_STOP entry with gray styling', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '14', activityType: 'AGENT_STOP', actor: 'system', action: '停止', resourceType: 'agent', resourceId: 'a1' }),
    ]
    render(<ActivityLog />)
    expect(screen.getByText('[AGENT_STOP]')).toBeInTheDocument()
    expect(screen.getByText(/已下线/)).toBeInTheDocument()
    const card = getCard('[AGENT_STOP]')
    expect(card?.style.background).toBe('rgba(55, 65, 81, 0.15)')
  })

  it('renders TEST_SUCCESS entry with purple styling', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '15', activityType: 'TEST_SUCCESS', actor: 'tester', action: 'test-pass', resourceType: 'suite', resourceId: 's1' }),
    ]
    render(<ActivityLog />)
    expect(screen.getByText('[TEST_SUCCESS]')).toBeInTheDocument()
    expect(screen.getByText(/测试通过/)).toBeInTheDocument()
    const card = getCard('[TEST_SUCCESS]')
    expect(card?.style.background).toBe('rgba(59, 7, 100, 0.2)')
  })

  it('renders INFO entry with default description', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '16', activityType: 'INFO', actor: 'system', action: 'boot', resourceType: 'node', resourceId: 'n1' }),
    ]
    render(<ActivityLog />)
    // INFO falls through to default case in renderDescription
    expect(screen.getByText('system', { exact: false })).toBeInTheDocument()
  })

  it('renders SKILL_SCAN entry with orange styling', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '17', activityType: 'SKILL_SCAN', actor: 'scanner', action: 'scanned', resourceType: 'skill', resourceId: 's1' }),
    ]
    render(<ActivityLog />)
    const card = getCard('[SKILL_SCAN]')
    expect(card?.style.background).toBe('rgba(69, 26, 3, 0.15)')
  })

  it('renders AGENT_START entry with cyan styling', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '18', activityType: 'AGENT_START', actor: 'system', action: 'start', resourceType: 'agent', resourceId: 'a1' }),
    ]
    render(<ActivityLog />)
    const card = getCard('[AGENT_START]')
    expect(card?.style.background).toBe('rgba(8, 51, 68, 0.15)')
  })

  it('formats timestamp using toLocaleTimeString', () => {
    render(<ActivityLog />)
    // The timestamp should be formatted (not raw ISO string)
    expect(screen.queryByText('2026-01-01T10:00:00Z')).toBeNull()
  })

  it('handles entry without timestamp', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '20', activityType: 'EXEC', timestamp: '' }),
    ]
    render(<ActivityLog />)
    // Should not crash - empty timestamp produces empty string
    expect(screen.getByText('[EXEC]')).toBeInTheDocument()
  })

  it('filters to 协定 entries', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '30', activityType: 'BLUEPRINT' }),
      createEntry({ id: '31', activityType: 'SECURITY_GATE' }),
      createEntry({ id: '32', activityType: 'HITL_PASSED' }),
      createEntry({ id: '33', activityType: 'HITL_DENIED' }),
      createEntry({ id: '34', activityType: 'GOAL_INIT' }),
    ]
    render(<ActivityLog />)
    fireEvent.click(screen.getByText('协定'))
    expect(screen.getByText('[BLUEPRINT]')).toBeInTheDocument()
    expect(screen.getByText('[SECURITY_GATE]')).toBeInTheDocument()
    expect(screen.getByText('[HITL_PASSED]')).toBeInTheDocument()
    expect(screen.getByText('[HITL_DENIED]')).toBeInTheDocument()
    expect(screen.queryByText('[GOAL_INIT]')).toBeNull()
  })

  it('filters to 系统 entries', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '40', activityType: 'INFO' }),
      createEntry({ id: '41', activityType: 'GOAL_INIT' }),
    ]
    render(<ActivityLog />)
    fireEvent.click(screen.getByText('系统'))
    expect(screen.getByText('[INFO]')).toBeInTheDocument()
    expect(screen.queryByText('[GOAL_INIT]')).toBeNull()
  })

  it('highlights active filter button', () => {
    render(<ActivityLog />)
    const mcpButton = screen.getByText('MCP')
    fireEvent.click(mcpButton)
    expect(mcpButton.style.color).toBe('rgb(229, 231, 235)')
    expect(mcpButton.style.background).toBe('rgba(88, 166, 255, 0.15)')
  })

  it('shows inactive filter button with muted color', () => {
    render(<ActivityLog />)
    const allButton = screen.getByText('全部')
    expect(allButton.style.color).toBe('rgb(229, 231, 235)')
    const mcpButton = screen.getByText('MCP')
    expect(mcpButton.style.color).toBe('rgb(107, 114, 128)')
  })

  it('renders multiple entries of same type', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '50', activityType: 'MCP_CALL', actor: 'a1' }),
      createEntry({ id: '51', activityType: 'MCP_CALL', actor: 'a2' }),
    ]
    render(<ActivityLog />)
    const mcpLabels = screen.getAllByText('[MCP_CALL]')
    expect(mcpLabels).toHaveLength(2)
  })

  it('renders entry with color on activity type label', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '60', activityType: 'GOAL_INIT', color: '#ff0000' }),
    ]
    render(<ActivityLog />)
    const label = screen.getByText('[GOAL_INIT]')
    expect(label.style.color).toBe('rgb(255, 0, 0)')
  })

  it('MCP filter includes TEST_SUCCESS', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '70', activityType: 'TEST_SUCCESS' }),
      createEntry({ id: '71', activityType: 'MCP_CALL' }),
      createEntry({ id: '72', activityType: 'GOAL_INIT' }),
    ]
    render(<ActivityLog />)
    fireEvent.click(screen.getByText('MCP'))
    expect(screen.getByText('[TEST_SUCCESS]')).toBeInTheDocument()
    expect(screen.getByText('[MCP_CALL]')).toBeInTheDocument()
    expect(screen.queryByText('[GOAL_INIT]')).toBeNull()
  })

  it('Agent filter includes GOAL_INIT, AGENT_START, AGENT_STOP', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '80', activityType: 'EXEC' }),
      createEntry({ id: '81', activityType: 'GOAL_INIT' }),
      createEntry({ id: '82', activityType: 'AGENT_START' }),
      createEntry({ id: '83', activityType: 'AGENT_STOP' }),
      createEntry({ id: '84', activityType: 'MCP_CALL' }),
    ]
    render(<ActivityLog />)
    fireEvent.click(screen.getByText('Agent'))
    expect(screen.queryByText('[EXEC]')).toBeNull()
    expect(screen.getByText('[GOAL_INIT]')).toBeInTheDocument()
    expect(screen.getByText('[AGENT_START]')).toBeInTheDocument()
    expect(screen.getByText('[AGENT_STOP]')).toBeInTheDocument()
    expect(screen.queryByText('[MCP_CALL]')).toBeNull()
  })

  it('工具 filter includes MCP_CALL, EXEC, TEST_SUCCESS', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '90', activityType: 'MCP_CALL' }),
      createEntry({ id: '91', activityType: 'EXEC' }),
      createEntry({ id: '92', activityType: 'TEST_SUCCESS' }),
      createEntry({ id: '93', activityType: 'GOAL_INIT' }),
    ]
    render(<ActivityLog />)
    fireEvent.click(screen.getByText('工具'))
    expect(screen.getByText('[MCP_CALL]')).toBeInTheDocument()
    expect(screen.getByText('[EXEC]')).toBeInTheDocument()
    expect(screen.getByText('[TEST_SUCCESS]')).toBeInTheDocument()
    expect(screen.queryByText('[GOAL_INIT]')).toBeNull()
  })

  it('HITL_PASSED border style is green', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '95', activityType: 'HITL_PASSED' }),
    ]
    render(<ActivityLog />)
    const card = getCard('[HITL_PASSED]')
    expect(card?.style.border).toBe('1px solid rgba(20, 83, 45, 0.4)')
  })

  it('HITL_DENIED border style is rose', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '96', activityType: 'HITL_DENIED' }),
    ]
    render(<ActivityLog />)
    const card = getCard('[HITL_DENIED]')
    expect(card?.style.border).toBe('1px solid rgba(136, 19, 55, 0.4)')
  })

  it('SECURITY_GATE border style is amber', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '92', activityType: 'SECURITY_GATE' }),
    ]
    render(<ActivityLog />)
    const card = getCard('[SECURITY_GATE]')
    expect(card?.style.border).toBe('1px solid rgba(120, 53, 15, 0.4)')
  })

  it('MCP_CALL border style is purple', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '93', activityType: 'MCP_CALL' }),
    ]
    render(<ActivityLog />)
    const card = getCard('[MCP_CALL]')
    expect(card?.style.border).toBe('1px solid rgba(88, 28, 135, 0.3)')
  })

  it('SKILL_SCAN border style is orange', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '94', activityType: 'SKILL_SCAN' }),
    ]
    render(<ActivityLog />)
    const card = getCard('[SKILL_SCAN]')
    expect(card?.style.border).toBe('1px solid rgba(154, 52, 18, 0.3)')
  })

  it('AGENT_START border style is cyan', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '95', activityType: 'AGENT_START' }),
    ]
    render(<ActivityLog />)
    const card = getCard('[AGENT_START]')
    expect(card?.style.border).toBe('1px solid rgba(21, 94, 117, 0.3)')
  })

  it('AGENT_STOP border style is gray', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '96', activityType: 'AGENT_STOP' }),
    ]
    render(<ActivityLog />)
    const card = getCard('[AGENT_STOP]')
    expect(card?.style.border).toBe('1px solid rgba(75, 85, 99, 0.3)')
  })

  it('default entry border style', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '97', activityType: 'EXEC' }),
    ]
    render(<ActivityLog />)
    const card = getCard('[EXEC]')
    expect(card?.style.border).toBe('1px solid rgb(48, 54, 61)')
  })

  it('switches between filters correctly', () => {
    defaultStore.activityEntries = [
      createEntry({ id: 'a', activityType: 'MCP_CALL' }),
      createEntry({ id: 'b', activityType: 'GOAL_INIT' }),
      createEntry({ id: 'c', activityType: 'SKILL_SCAN' }),
    ]
    render(<ActivityLog />)

    // Switch to MCP
    fireEvent.click(screen.getByText('MCP'))
    expect(screen.getByText('[MCP_CALL]')).toBeInTheDocument()
    expect(screen.queryByText('[GOAL_INIT]')).toBeNull()

    // Switch to Agent
    fireEvent.click(screen.getByText('Agent'))
    expect(screen.getByText('[GOAL_INIT]')).toBeInTheDocument()
    expect(screen.queryByText('[MCP_CALL]')).toBeNull()

    // Switch back to all
    fireEvent.click(screen.getByText('全部'))
    expect(screen.getByText('[MCP_CALL]')).toBeInTheDocument()
    expect(screen.getByText('[GOAL_INIT]')).toBeInTheDocument()
    expect(screen.getByText('[SKILL_SCAN]')).toBeInTheDocument()
  })

  it('TEST_SUCCESS in default styling uses purple border', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '98', activityType: 'TEST_SUCCESS' }),
    ]
    render(<ActivityLog />)
    const card = getCard('[TEST_SUCCESS]')
    expect(card?.style.border).toBe('1px solid rgba(88, 28, 135, 0.3)')
  })

  it('BLUEPRINT border style is default', () => {
    defaultStore.activityEntries = [
      createEntry({ id: '99', activityType: 'BLUEPRINT' }),
    ]
    render(<ActivityLog />)
    const card = getCard('[BLUEPRINT]')
    expect(card?.style.border).toBe('1px solid rgb(48, 54, 61)')
  })
})
