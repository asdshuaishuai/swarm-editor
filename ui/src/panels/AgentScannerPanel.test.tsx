import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import AgentScannerPanel from './AgentScannerPanel'

const mockStartAgent = vi.fn().mockResolvedValue({})
const mockAddServer = vi.fn().mockResolvedValue({})
const mockAddToast = vi.fn()
const mockUpdateSetting = vi.fn()
const mockLoadAgents = vi.fn().mockResolvedValue(undefined)
const mockScanServers = vi.fn().mockResolvedValue([])
const mockScanSkills = vi.fn().mockResolvedValue([])
const mockGetUnifiedSkills = vi.fn().mockResolvedValue({ skills: [] })
const mockToggleSkillApp = vi.fn().mockResolvedValue({ success: true })
const mockImportSkillsFromScanned = vi.fn().mockResolvedValue({ imported: 0 })

// Mutable store agents (connected agents in the store)
let storeAgents: any[] = []

vi.mock('../services', () => ({
  api: {
    agent: {
      scanSkills: (...args: any[]) => mockScanSkills(...args),
      startAgent: (...args: any[]) => mockStartAgent(...args),
      getUnifiedSkills: (...args: any[]) => mockGetUnifiedSkills(...args),
      toggleSkillApp: (...args: any[]) => mockToggleSkillApp(...args),
      importSkillsFromScanned: (...args: any[]) => mockImportSkillsFromScanned(...args),
    },
    mcp: {
      scanServers: (...args: any[]) => mockScanServers(...args),
      addServer: (...args: any[]) => mockAddServer(...args),
    },
  },
}))

vi.mock('../store/appStore', () => ({
  useAppStore: Object.assign(
    (selector: any) => selector({
      agents: storeAgents,
      addToast: mockAddToast,
    }),
    {
      getState: () => ({
        agents: storeAgents,
        addToast: mockAddToast,
        loadAgents: mockLoadAgents,
      }),
    }
  ),
}))

// Mutable monitoring store state (reassigned in beforeEach and refresh mocks)
let monitoredMCPServers: any[] = []
let monitoredSkills: any[] = []

vi.mock('../stores/monitoringStore', () => ({
  useMonitoringStore: (selector: any) => selector({
    get mcpServers() { return monitoredMCPServers },
    get skills() { return monitoredSkills },
    refreshMCPServers: async (...args: any[]) => {
      await mockScanServers(...args)
    },
    refreshSkills: async (...args: any[]) => {
      await mockScanSkills(...args)
    },
  }),
}))

// Mutable settings state so individual tests can toggle autoScan
let settingsState = { agentAutoScan: false, agentScanInterval: 30000 }

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({
    settings: settingsState,
    updateSetting: mockUpdateSetting,
  }),
}))

// AgentConfigModal mock: renders clickable buttons for onClose and onSaved
vi.mock('../components/AgentConfigModal', () => ({
  default: (props: { onClose: () => void; onSaved: () => void }) => (
    <div data-testid="config-modal">
      <button data-testid="modal-close" onClick={props.onClose}>ModalClose</button>
      <button data-testid="modal-saved" onClick={props.onSaved}>ModalSaved</button>
    </div>
  ),
}))

vi.mock('../utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getFileIcon: () => '',
  getFileIconColor: () => 'text-blue-400',
}))

// Icons return empty string to avoid polluting text content queries
vi.mock('lucide-react', () => ({
  Radar: () => '',
  RefreshCw: () => '',
  Plus: () => '',
  Check: () => '',
  Wifi: () => '',
  WifiOff: () => '',
  Clock: () => '',
  Cpu: () => '',
  Activity: () => '',
  Plug: () => '',
  Wrench: () => '',
  Settings: () => '',
  Download: () => '',
}))

// Mock scrollIntoView for jsdom
Element.prototype.scrollIntoView = vi.fn()

/**
 * Helper: renders AgentScannerPanel and waits for the initial render to settle.
 */
async function renderAndWait() {
  const result = await act(async () => { return render(<AgentScannerPanel />) })
  await waitFor(() => expect(screen.getByText('刷新')).toBeInTheDocument())
  return result
}

describe('AgentScannerPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Restore default mock implementations after reset
    mockScanServers.mockResolvedValue([])
    mockScanSkills.mockResolvedValue([])
    mockStartAgent.mockResolvedValue({})
    mockAddServer.mockResolvedValue({})
    mockAddToast.mockResolvedValue(undefined)
    mockUpdateSetting.mockResolvedValue(undefined)
    mockLoadAgents.mockResolvedValue(undefined)
    storeAgents = []
    monitoredMCPServers = []
    monitoredSkills = []
    settingsState = { agentAutoScan: false, agentScanInterval: 30000 }
  })

  // ── Header & Tabs ───────────────────────────────────────────

  it('renders header with Scanner title', async () => {
    await renderAndWait()
    expect(screen.getByText('Scanner')).toBeInTheDocument()
  })

  it('renders subtitle description', async () => {
    await renderAndWait()
    expect(screen.getByText('Discover agents, MCP servers & skills')).toBeInTheDocument()
  })

  it('renders scan tabs with correct labels', async () => {
    await renderAndWait()
    expect(screen.getByText('Agents')).toBeInTheDocument()
    expect(screen.getByText('MCP Servers')).toBeInTheDocument()
    expect(screen.getByText('Skills')).toBeInTheDocument()
  })

  it('renders scan button', async () => {
    await renderAndWait()
    expect(screen.getByText('刷新')).toBeInTheDocument()
  })

  // ── Empty States ────────────────────────────────────────────

  it('shows agents empty state when no agents found', async () => {
    await renderAndWait()
    expect(screen.getByText('No agents discovered')).toBeInTheDocument()
    expect(screen.getByText('Click scan to search for available agents')).toBeInTheDocument()
  })

  it('shows MCP empty state when switched to MCP tab with no servers', async () => {
    await renderAndWait()
    fireEvent.click(screen.getByText('MCP Servers'))
    expect(screen.getByText('No MCP servers discovered')).toBeInTheDocument()
    expect(screen.getByText('MCP servers are found from agent config files')).toBeInTheDocument()
  })

  it('shows Skills empty state when switched to Skills tab with no skills', async () => {
    await renderAndWait()
    fireEvent.click(screen.getByText('Skills'))
    expect(screen.getByText('No skills discovered')).toBeInTheDocument()
    expect(screen.getByText('Skills come from ~/.claude/skills/ and agent capabilities')).toBeInTheDocument()
  })

  // ── Refresh Button ─────────────────────────────────────────

  it('calls loadAgents and store refreshers when refresh clicked', async () => {
    await renderAndWait()
    mockLoadAgents.mockClear()
    mockScanServers.mockClear()
    mockScanSkills.mockClear()
    fireEvent.click(screen.getByText('刷新'))
    await waitFor(() => {
      expect(mockLoadAgents).toHaveBeenCalled()
      expect(mockScanServers).toHaveBeenCalled()
      expect(mockScanSkills).toHaveBeenCalled()
    })
  })

  it('shows success toast after refresh completes', async () => {
    await renderAndWait()
    fireEvent.click(screen.getByText('刷新'))
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('success', '刷新完成', '数据已更新')
    })
  })

  it('shows error toast when refresh fails', async () => {
    await renderAndWait()
    mockLoadAgents.mockRejectedValueOnce(new Error('Network timeout'))
    fireEvent.click(screen.getByText('刷新'))
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', '刷新失败', 'Network timeout')
    })
  })

  it('shows generic error toast on non-Error refresh failure', async () => {
    await renderAndWait()
    mockLoadAgents.mockRejectedValueOnce('unknown failure')
    fireEvent.click(screen.getByText('刷新'))
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', '刷新失败', 'Unknown error')
    })
  })

  // ── Agent Status Mapping ────────────────────────────────────

  it('maps non-error status to available and shows Connected', async () => {
    storeAgents = [
      { id: 'a1', name: 'Agent 1', status: 'idle', state: 'active', command: '/bin/test', capabilities: ['code'] },
    ]
    await renderAndWait()
    expect(screen.getByText('available')).toBeInTheDocument()
    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it('maps error status to unreachable', async () => {
    storeAgents = [
      { id: 'a2', name: 'Agent 2', status: 'error', state: 'error', command: '/bin/test', capabilities: [] },
    ]
    await renderAndWait()
    expect(screen.getByText('unreachable')).toBeInTheDocument()
    expect(screen.getByText('Connect')).toBeInTheDocument()
  })

  it('maps undefined status to unreachable', async () => {
    storeAgents = [
      { id: 'a3', name: 'Agent 3', status: undefined, state: 'error', command: '/bin/test', capabilities: [] },
    ]
    await renderAndWait()
    expect(screen.getByText('unreachable')).toBeInTheDocument()
  })

  it('handles undefined capabilities without crash', async () => {
    storeAgents = [
      { id: 'a3', name: 'Agent 3', status: 'idle', state: 'active', command: '/bin/test' },
    ]
    await renderAndWait()
    expect(screen.getByText('available')).toBeInTheDocument()
  })

  // ── Agent Cards ─────────────────────────────────────────────

  it('displays agent endpoint from command', async () => {
    storeAgents = [
      { id: 'a1', name: 'MyAgent', type: 'cli', status: 'idle', state: 'active', command: '/usr/local/bin/agent', capabilities: [] },
    ]
    await renderAndWait()
    expect(screen.getByText('/usr/local/bin/agent')).toBeInTheDocument()
  })

  it('displays up to 4 capability badges', async () => {
    storeAgents = [
      { id: 'a1', name: 'Ag', type: 'cli', status: 'idle', state: 'active', command: '/bin/a', capabilities: ['code', 'test', 'review', 'deploy'] },
    ]
    await renderAndWait()
    expect(screen.getByText('code')).toBeInTheDocument()
    expect(screen.getByText('test')).toBeInTheDocument()
    expect(screen.getByText('review')).toBeInTheDocument()
    expect(screen.getByText('deploy')).toBeInTheDocument()
  })

  it('shows overflow count when more than 4 capabilities', async () => {
    storeAgents = [
      { id: 'a1', name: 'Ag', type: 'cli', status: 'idle', state: 'active', command: '/bin/a', capabilities: ['a', 'b', 'c', 'd', 'e', 'f'] },
    ]
    await renderAndWait()
    expect(screen.getByText('+2 more')).toBeInTheDocument()
  })

  it('shows Connected button for agents in store', async () => {
    storeAgents = [
      { id: 'a1', name: 'NewAgent', type: 'cli', status: 'idle', state: 'active', command: '/bin/a', capabilities: [] },
    ]
    await renderAndWait()
    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it('shows disabled Connect button for unreachable agent', async () => {
    storeAgents = [
      { id: 'a1', name: 'DeadAgent', type: 'cli', status: 'error', state: 'error', command: '/bin/a', capabilities: [] },
    ]
    await renderAndWait()
    const connectBtn = screen.getByText('Connect').closest('button')!
    expect(connectBtn).toBeDisabled()
  })

  it('shows Connected button when agent is in store', async () => {
    storeAgents = [
      { id: 'a1', name: 'StoreAgent', type: 'cli', status: 'idle', state: 'active', command: '/bin/a', capabilities: [] },
    ]
    await renderAndWait()
    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  // ── Agent Connect Interaction ───────────────────────────────

  it('calls startAgent when Connect clicked for unreachable agent', async () => {
    storeAgents = [
      { id: 'a1', name: 'ConnAgent', type: 'cli', status: 'error', state: 'error', command: '/bin/a', capabilities: [] },
    ]
    await renderAndWait()
    mockStartAgent.mockResolvedValueOnce({ id: 'a1' })
    const connectBtn = screen.getByText('Connect').closest('button')!
    expect(connectBtn).toBeDisabled()
    // Disabled button click should not trigger startAgent
    fireEvent.click(connectBtn)
    expect(mockStartAgent).not.toHaveBeenCalled()
  })

  it('shows Connected button for active agents in store', async () => {
    storeAgents = [
      { id: 'a1', name: 'ConnAgent', type: 'cli', status: 'idle', state: 'active', command: '/bin/a', capabilities: [] },
    ]
    await renderAndWait()
    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  // ── Configure Button ────────────────────────────────────────

  it('renders configure button per agent card', async () => {
    storeAgents = [
      { id: 'a1', name: 'ConfAgent', type: 'cli', status: 'idle', state: 'active', command: '/bin/a', capabilities: [] },
    ]
    await renderAndWait()
    expect(screen.getByLabelText('Configure agent')).toBeInTheDocument()
  })

  it('opens config modal when Configure button is clicked', async () => {
    storeAgents = [
      { id: 'a1', name: 'ConfAgent', type: 'cli', status: 'idle', state: 'active', command: '/bin/a', capabilities: [] },
    ]
    await renderAndWait()
    fireEvent.click(screen.getByLabelText('Configure agent'))
    await waitFor(() => {
      expect(screen.getByTestId('config-modal')).toBeInTheDocument()
    })
  })

  it('closes config modal via onClose callback', async () => {
    storeAgents = [
      { id: 'a1', name: 'ConfAgent', type: 'cli', status: 'idle', state: 'active', command: '/bin/a', capabilities: [] },
    ]
    await renderAndWait()
    fireEvent.click(screen.getByLabelText('Configure agent'))
    await waitFor(() => {
      expect(screen.getByTestId('config-modal')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('modal-close'))
    await waitFor(() => {
      expect(screen.queryByTestId('config-modal')).not.toBeInTheDocument()
    })
  })

  it('triggers refresh and closes modal after AgentConfigModal onSaved', async () => {
    storeAgents = [
      { id: 'a1', name: 'ConfAgent', type: 'cli', status: 'idle', state: 'active', command: '/bin/a', capabilities: [] },
    ]
    await renderAndWait()
    fireEvent.click(screen.getByLabelText('Configure agent'))
    await waitFor(() => {
      expect(screen.getByTestId('config-modal')).toBeInTheDocument()
    })
    mockLoadAgents.mockClear()
    mockScanServers.mockClear()
    mockScanSkills.mockClear()
    fireEvent.click(screen.getByTestId('modal-saved'))
    await waitFor(() => {
      expect(screen.queryByTestId('config-modal')).not.toBeInTheDocument()
      expect(mockLoadAgents).toHaveBeenCalled()
    })
  })

  // ── MCP Servers Tab ─────────────────────────────────────────

  it('displays discovered MCP servers', async () => {
    monitoredMCPServers = [
      { id: 'm1', name: 'FileSystem MCP', status: 'running', command: 'npx fs-mcp', args: ['--root', '/tmp'] },
    ]
    await renderAndWait()
    fireEvent.click(screen.getByText('MCP Servers'))
    expect(screen.getByText('FileSystem MCP')).toBeInTheDocument()
    expect(screen.getByText('npx fs-mcp')).toBeInTheDocument()
    expect(screen.getByText('running')).toBeInTheDocument()
    expect(screen.getByText('Args: --root /tmp')).toBeInTheDocument()
  })

  it('hides args section when MCP server has no args', async () => {
    monitoredMCPServers = [
      { id: 'm1', name: 'NoArgs MCP', status: 'stopped', command: 'npx/no-args' },
    ]
    await renderAndWait()
    fireEvent.click(screen.getByText('MCP Servers'))
    expect(screen.getByText('NoArgs MCP')).toBeInTheDocument()
    expect(screen.queryByText(/Args:/)).not.toBeInTheDocument()
  })

  it('calls addServer when Add to Config clicked', async () => {
    monitoredMCPServers = [
      { id: 'm1', name: 'AddMe MCP', status: 'running', command: 'npx add-me', args: ['--flag'] },
    ]
    await renderAndWait()
    fireEvent.click(screen.getByText('MCP Servers'))
    fireEvent.click(screen.getByText('Add to Config'))
    await waitFor(() => {
      expect(mockAddServer).toHaveBeenCalledWith({ name: 'AddMe MCP', command: 'npx add-me', args: ['--flag'] })
    })
  })

  it('shows success toast after adding MCP server', async () => {
    monitoredMCPServers = [
      { id: 'm1', name: 'ToastMCP', status: 'running', command: 'npx toast' },
    ]
    await renderAndWait()
    fireEvent.click(screen.getByText('MCP Servers'))
    mockAddServer.mockResolvedValueOnce({})
    fireEvent.click(screen.getByText('Add to Config'))
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('success', 'MCP Added', 'Added ToastMCP')
    })
  })

  it('does not call addServer when MCP server has no command', async () => {
    monitoredMCPServers = [
      { id: 'm1', name: 'NoCmd MCP', status: 'running' },
    ]
    await renderAndWait()
    fireEvent.click(screen.getByText('MCP Servers'))
    fireEvent.click(screen.getByText('Add to Config'))
    await waitFor(() => {
      expect(mockAddServer).not.toHaveBeenCalled()
    })
  })

  it('shows error toast when addServer fails', async () => {
    monitoredMCPServers = [
      { id: 'm1', name: 'ErrMCP', status: 'running', command: 'npx err' },
    ]
    await renderAndWait()
    fireEvent.click(screen.getByText('MCP Servers'))
    mockAddServer.mockRejectedValueOnce(new Error('Server conflict'))
    fireEvent.click(screen.getByText('Add to Config'))
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Add failed', 'Server conflict')
    })
  })

  it('shows generic error toast on non-Error addServer failure', async () => {
    monitoredMCPServers = [
      { id: 'm1', name: 'ErrMCP', status: 'running', command: 'npx err' },
    ]
    await renderAndWait()
    fireEvent.click(screen.getByText('MCP Servers'))
    mockAddServer.mockRejectedValueOnce('unknown')
    fireEvent.click(screen.getByText('Add to Config'))
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', 'Add failed', 'Unknown error')
    })
  })

  it('hides args section when MCP server has empty args array', async () => {
    monitoredMCPServers = [
      { id: 'm1', name: 'EmptyArgs MCP', status: 'running', command: 'cmd', args: [] },
    ]
    await renderAndWait()
    fireEvent.click(screen.getByText('MCP Servers'))
    expect(screen.getByText('EmptyArgs MCP')).toBeInTheDocument()
    expect(screen.queryByText(/Args:/)).not.toBeInTheDocument()
  })

  it('calls addServer with undefined args when MCP server has no args', async () => {
    monitoredMCPServers = [
      { id: 'm1', name: 'NoArgsAdd', status: 'running', command: 'npx/noargs' },
    ]
    await renderAndWait()
    fireEvent.click(screen.getByText('MCP Servers'))
    fireEvent.click(screen.getByText('Add to Config'))
    await waitFor(() => {
      expect(mockAddServer).toHaveBeenCalledWith({ name: 'NoArgsAdd', command: 'npx/noargs', args: undefined })
    })
  })

  // ── Skills Tab ──────────────────────────────────────────────

  it('displays discovered skills', async () => {
    monitoredSkills = [
      { id: 'sk1', name: 'CodeReview', description: 'Reviews code', source: 'filesystem', tags: ['review', 'quality'] },
    ]
    await renderAndWait()
    fireEvent.click(screen.getByText('Skills'))
    expect(screen.getByText('CodeReview')).toBeInTheDocument()
    expect(screen.getByText('Reviews code')).toBeInTheDocument()
    expect(screen.getByText('filesystem')).toBeInTheDocument()
    expect(screen.getByText('review')).toBeInTheDocument()
    expect(screen.getByText('quality')).toBeInTheDocument()
  })

  it('hides description when skill has none', async () => {
    monitoredSkills = [
      { id: 'sk1', name: 'NoDesc', source: 'mcp' },
    ]
    await renderAndWait()
    fireEvent.click(screen.getByText('Skills'))
    expect(screen.getByText('NoDesc')).toBeInTheDocument()
    expect(screen.getByText('mcp')).toBeInTheDocument()
  })

  it('shows skill agentId when present', async () => {
    monitoredSkills = [
      { id: 'sk1', name: 'AgentSkill', source: 'agent', agentId: 'claude-code' },
    ]
    await renderAndWait()
    fireEvent.click(screen.getByText('Skills'))
    expect(screen.getByText('Agent: claude-code')).toBeInTheDocument()
  })

  it('does not show agentId when absent', async () => {
    monitoredSkills = [
      { id: 'sk1', name: 'NoAgentSkill', source: 'filesystem' },
    ]
    await renderAndWait()
    fireEvent.click(screen.getByText('Skills'))
    expect(screen.queryByText(/Agent:/)).not.toBeInTheDocument()
  })

  it('does not render tags section when skill has no tags', async () => {
    monitoredSkills = [
      { id: 'sk1', name: 'NoTagsSkill', source: 'filesystem' },
    ]
    await renderAndWait()
    fireEvent.click(screen.getByText('Skills'))
    expect(screen.getByText('NoTagsSkill')).toBeInTheDocument()
  })

  it('renders skill card without tags section when tags is empty array', async () => {
    monitoredSkills = [
      { id: 'sk1', name: 'EmptyTagsSkill', source: 'filesystem', tags: [] },
    ]
    await renderAndWait()
    fireEvent.click(screen.getByText('Skills'))
    expect(screen.getByText('EmptyTagsSkill')).toBeInTheDocument()
    expect(screen.getByText('filesystem')).toBeInTheDocument()
  })

  it('displays skill with all optional fields populated', async () => {
    monitoredSkills = [
      { id: 'sk1', name: 'FullSkill', description: 'A complete skill', source: 'agent', agentId: 'claude-code', tags: ['coding', 'review'] },
    ]
    await renderAndWait()
    fireEvent.click(screen.getByText('Skills'))
    expect(screen.getByText('FullSkill')).toBeInTheDocument()
    expect(screen.getByText('A complete skill')).toBeInTheDocument()
    expect(screen.getByText('agent')).toBeInTheDocument()
    expect(screen.getByText('Agent: claude-code')).toBeInTheDocument()
    expect(screen.getByText('coding')).toBeInTheDocument()
    expect(screen.getByText('review')).toBeInTheDocument()
  })

  // ── Auto-Scan Toggle ───────────────────────────────────────

  it('renders auto-scan toggle switch', async () => {
    await renderAndWait()
    expect(screen.getByRole('switch')).toBeInTheDocument()
  })

  it('toggles auto-scan when switch is clicked', async () => {
    await renderAndWait()
    fireEvent.click(screen.getByRole('switch'))
    expect(mockUpdateSetting).toHaveBeenCalledWith('agentAutoScan', true)
  })

  it('auto-scan toggle has correct aria-checked', async () => {
    settingsState = { agentAutoScan: false, agentScanInterval: 30000 }
    await renderAndWait()
    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)
    expect(mockUpdateSetting).toHaveBeenCalledWith('agentAutoScan', true)
  })

  it('auto-scan toggle shows enabled styling', async () => {
    settingsState = { agentAutoScan: true, agentScanInterval: 30000 }
    await renderAndWait()
    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(toggle.className).toContain('bg-accent')
    fireEvent.click(toggle)
    expect(mockUpdateSetting).toHaveBeenCalledWith('agentAutoScan', false)
  })

  it('shows auto-scan info text when enabled', async () => {
    settingsState = { agentAutoScan: true, agentScanInterval: 30000 }
    await renderAndWait()
    expect(screen.getByText('后端自动扫描 (30s)')).toBeInTheDocument()
  })

  it('hides auto-scan info text when disabled', async () => {
    settingsState = { agentAutoScan: false, agentScanInterval: 30000 }
    await renderAndWait()
    expect(screen.queryByText('后端自动扫描 (30s)')).not.toBeInTheDocument()
  })

  // ── Multiple Items ──────────────────────────────────────────

  it('renders multiple agent cards with mixed statuses', async () => {
    storeAgents = [
      { id: 'a1', name: 'AgentOne', type: 'cli', status: 'idle', state: 'active', command: '/bin/one', capabilities: [] },
      { id: 'a2', name: 'AgentTwo', type: 'cli', status: 'error', state: 'error', command: '/bin/two', capabilities: [] },
    ]
    await renderAndWait()
    expect(screen.getByText('AgentOne')).toBeInTheDocument()
    expect(screen.getByText('AgentTwo')).toBeInTheDocument()
    expect(screen.getAllByText('available').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('unreachable').length).toBeGreaterThanOrEqual(1)
  })

  it('renders multiple MCP server cards', async () => {
    monitoredMCPServers = [
      { id: 'm1', name: 'Server1', status: 'running', command: 'cmd1' },
      { id: 'm2', name: 'Server2', status: 'stopped', command: 'cmd2' },
    ]
    await renderAndWait()
    fireEvent.click(screen.getByText('MCP Servers'))
    expect(screen.getByText('Server1')).toBeInTheDocument()
    expect(screen.getByText('Server2')).toBeInTheDocument()
  })

  it('renders multiple skill cards', async () => {
    monitoredSkills = [
      { id: 'sk1', name: 'SkillA', source: 'filesystem' },
      { id: 'sk2', name: 'SkillB', source: 'mcp' },
    ]
    await renderAndWait()
    fireEvent.click(screen.getByText('Skills'))
    expect(screen.getByText('SkillA')).toBeInTheDocument()
    expect(screen.getByText('SkillB')).toBeInTheDocument()
  })

  // ── Edge Cases ──────────────────────────────────────────────

  it('uses empty string when agent has no command', async () => {
    storeAgents = [
      { id: 'a1', name: 'NoCmdAgent', type: 'cli', status: 'idle', state: 'active', capabilities: [] },
    ]
    await renderAndWait()
    expect(screen.getByText('NoCmdAgent')).toBeInTheDocument()
  })

  it('handles agent with latency field', async () => {
    storeAgents = [
      { id: 'a1', name: 'LatencyAgent', type: 'cli', status: 'idle', state: 'active', command: '/bin/a', capabilities: [], latency: 42 },
    ]
    await renderAndWait()
    expect(screen.getByText('LatencyAgent')).toBeInTheDocument()
  })

  it('maps agent command to endpoint field', async () => {
    storeAgents = [
      { id: 'a1', name: 'CmdAgent', type: 'cli', status: 'idle', state: 'active', command: 'claude --acp', capabilities: [] },
    ]
    await renderAndWait()
    expect(screen.getByText('claude --acp')).toBeInTheDocument()
  })

  it('does not show overflow when agent has exactly 4 capabilities', async () => {
    storeAgents = [
      { id: 'a1', name: 'ExactCap', type: 'cli', status: 'idle', state: 'active', command: '/bin/a', capabilities: ['a', 'b', 'c', 'd'] },
    ]
    await renderAndWait()
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('d')).toBeInTheDocument()
    expect(screen.queryByText(/more/)).not.toBeInTheDocument()
  })

  it('shows +1 more when agent has 5 capabilities', async () => {
    storeAgents = [
      { id: 'a1', name: 'FiveCap', type: 'cli', status: 'idle', state: 'active', command: '/bin/a', capabilities: ['a', 'b', 'c', 'd', 'e'] },
    ]
    await renderAndWait()
    expect(screen.getByText('+1 more')).toBeInTheDocument()
  })

  it('renders agent card with no capabilities', async () => {
    storeAgents = [
      { id: 'a1', name: 'NoCapAgent', type: 'cli', status: 'idle', state: 'active', command: '/bin/a', capabilities: [] },
    ]
    await renderAndWait()
    expect(screen.getByText('NoCapAgent')).toBeInTheDocument()
    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it('processes agent data with lastActive field', async () => {
    storeAgents = [
      { id: 'a1', name: 'ActiveAgent', type: 'cli', status: 'idle', state: 'active', command: '/bin/a', lastActive: '2026-01-01T00:00:00Z', capabilities: [] },
    ]
    await renderAndWait()
    expect(screen.getByText('ActiveAgent')).toBeInTheDocument()
  })

  it('uses current date when agent has no lastActive', async () => {
    storeAgents = [
      { id: 'a1', name: 'NoLastActive', type: 'cli', status: 'idle', state: 'active', command: '/bin/a', capabilities: [] },
    ]
    await renderAndWait()
    expect(screen.getByText('NoLastActive')).toBeInTheDocument()
    expect(screen.getByText('available')).toBeInTheDocument()
  })

  it('displays agent type from API response', async () => {
    storeAgents = [
      { id: 'a1', name: 'TypedAgent', type: 'mcp', status: 'idle', state: 'active', command: '/bin/a', capabilities: ['code'] },
    ]
    await renderAndWait()
    expect(screen.getByText('TypedAgent')).toBeInTheDocument()
    expect(screen.getByText('code')).toBeInTheDocument()
  })

  // ── Tab Active Styling ─────────────────────────────────────

  it('applies active styling to selected tab', async () => {
    await renderAndWait()
    const agentsTab = screen.getByText('Agents').closest('button')!
    expect(agentsTab.className).toContain('text-accent')
  })

  it('applies inactive styling to non-selected tabs', async () => {
    await renderAndWait()
    const mcpTab = screen.getByText('MCP Servers').closest('button')!
    expect(mcpTab.className).toContain('text-text-tertiary')
  })

  // ── Refresh Triggers Re-scan ────────────────────────────────

  it('re-scans after successful connect', async () => {
    storeAgents = [
      { id: 'a1', name: 'ConnAgent', type: 'cli', status: 'error', state: 'error', command: '/bin/a', capabilities: [] },
    ]
    await renderAndWait()
    // Connect button is disabled for unreachable agents, so startAgent is not called
    const connectBtn = screen.getByText('Connect').closest('button')!
    expect(connectBtn).toBeDisabled()
  })

  it('allows multiple sequential refreshes', async () => {
    storeAgents = [
      { id: 'a1', name: 'Agent1', type: 'cli', status: 'idle', state: 'active', command: '/bin/a' },
    ]
    await renderAndWait()
    expect(screen.getByText('Agent1')).toBeInTheDocument()

    // Click refresh — loadAgents called
    mockLoadAgents.mockClear()
    fireEvent.click(screen.getByText('刷新'))
    await waitFor(() => {
      expect(mockLoadAgents).toHaveBeenCalledTimes(1)
    })

    // Click refresh again
    mockLoadAgents.mockClear()
    fireEvent.click(screen.getByText('刷新'))
    await waitFor(() => {
      expect(mockLoadAgents).toHaveBeenCalledTimes(1)
    })
  })

  // ── EmptyState Component ────────────────────────────────────

  it('renders EmptyState with correct structure', async () => {
    await renderAndWait()
    expect(screen.getByText('No agents discovered')).toBeInTheDocument()
    expect(screen.getByText('Click scan to search for available agents')).toBeInTheDocument()
  })

  it('renders EmptyState for MCP with correct subtitle', async () => {
    await renderAndWait()
    fireEvent.click(screen.getByText('MCP Servers'))
    expect(screen.getByText('MCP servers are found from agent config files')).toBeInTheDocument()
  })

  it('renders EmptyState for Skills with correct subtitle', async () => {
    await renderAndWait()
    fireEvent.click(screen.getByText('Skills'))
    expect(screen.getByText('Skills come from ~/.claude/skills/ and agent capabilities')).toBeInTheDocument()
  })

  // ── Unified Skills ────────────────────────────────────────────

  it('shows Import button in Skills tab', async () => {
    await renderAndWait()
    fireEvent.click(screen.getByText('Skills'))
    expect(screen.getByText('Import from Scan')).toBeInTheDocument()
  })

  it('shows unified skills with per-agent toggle pills', async () => {
    mockGetUnifiedSkills.mockResolvedValue({
      skills: [{
        id: 'fs:test-skill',
        name: 'test-skill',
        source: 'filesystem',
        apps: { claude: true, opencode: false, qwen: false, kimi: false },
      }],
    })
    await renderAndWait()
    fireEvent.click(screen.getByText('Skills'))
    await waitFor(() => {
      expect(screen.getByText('test-skill')).toBeInTheDocument()
    })
    expect(screen.getByText('Claude')).toBeInTheDocument()
    expect(screen.getByText('Kimi')).toBeInTheDocument()
    expect(screen.getByText('OpenCode')).toBeInTheDocument()
    expect(screen.getByText('Qwen')).toBeInTheDocument()
  })

  it('calls toggleSkillApp when agent pill clicked', async () => {
    mockGetUnifiedSkills.mockResolvedValue({
      skills: [{
        id: 'fs:test-skill',
        name: 'test-skill',
        source: 'filesystem',
        apps: { claude: true, opencode: false, qwen: false, kimi: false },
      }],
    })
    await renderAndWait()
    fireEvent.click(screen.getByText('Skills'))
    await waitFor(() => expect(screen.getByText('test-skill')).toBeInTheDocument())

    mockGetUnifiedSkills.mockResolvedValue({
      skills: [{
        id: 'fs:test-skill',
        name: 'test-skill',
        source: 'filesystem',
        apps: { claude: true, opencode: true, qwen: false, kimi: false },
      }],
    })
    fireEvent.click(screen.getByText('OpenCode'))
    await waitFor(() => {
      expect(mockToggleSkillApp).toHaveBeenCalledWith('fs:test-skill', 'opencode', true)
    })
  })

  it('calls importSkillsFromScanned when Import clicked', async () => {
    await renderAndWait()
    fireEvent.click(screen.getByText('Skills'))
    mockImportSkillsFromScanned.mockResolvedValue({ imported: 3 })
    fireEvent.click(screen.getByText('Import from Scan'))
    await waitFor(() => {
      expect(mockImportSkillsFromScanned).toHaveBeenCalled()
      expect(mockAddToast).toHaveBeenCalledWith('success', 'Skills imported', '3 skills imported')
    })
  })

  it('shows scanned skills without toggle pills', async () => {
    monitoredSkills = [{
      id: 'fs:scanned-only',
      name: 'scanned-only',
      source: 'filesystem',
      tags: ['local'],
    }]
    await renderAndWait()
    fireEvent.click(screen.getByText('Skills'))
    await waitFor(() => {
      expect(screen.getByText('scanned-only')).toBeInTheDocument()
    })
    // Scanned-only skills should not have agent toggle pills
    expect(screen.queryByText('Import from Scan')).toBeInTheDocument()
  })
})
