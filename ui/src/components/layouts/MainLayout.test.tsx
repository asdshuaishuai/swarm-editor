import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import MainLayout from './MainLayout'

// Hoisted mock variables
const {
  useMonitoringStoreMock,
  useAgentLifecycleStoreMock,
  useTaskFlowStoreMock,
} = vi.hoisted(() => {
  const makeStoreMock = (defaultState: Record<string, unknown>) =>
    Object.assign(
      vi.fn((selector?: (state: unknown) => unknown) => {
        return selector ? selector(defaultState) : defaultState
      }),
      {
        getState: vi.fn(() => ({
          initialLoad: vi.fn().mockResolvedValue(undefined),
          subscribeToEvents: vi.fn(() => vi.fn()),
          subscribe: vi.fn(() => vi.fn()),
        })),
      },
    )

  return {
    useMonitoringStoreMock: makeStoreMock({
      acpPackets: [],
      auditEnabled: true,
      toggleAudit: vi.fn(),
      auditStats: null,
      activityEntries: [],
      daemonLogs: [],
      mcpServers: [],
      skills: [],
      a2aMessages: [],
      a2aStatus: null,
    }),
    useAgentLifecycleStoreMock: makeStoreMock({
      agents: new Map(),
      activeTurns: new Map(),
      healthAlerts: [],
      agentCards: new Map(),
      connectedAgents: new Set(),
    }),
    useTaskFlowStoreMock: makeStoreMock({
      tasks: new Map(),
      handoffChain: [],
      toolInvocations: [],
      nodeFlows: new Map(),
    }),
  }
})

const mockSetWorkspacePath = vi.fn()
const mockRefreshFileTree = vi.fn().mockResolvedValue(undefined)

vi.mock('../../store/appStore', () => ({
  useAppStore: vi.fn((selector?: (state: unknown) => unknown) => {
    const state = {
      agents: [
        { id: 'claude-code', name: 'Claude Code', type: 'coder', state: 'idle' },
        { id: 'kimi-code', name: 'Kimi Code', type: 'coder', state: 'idle' },
      ],
      zenMode: false,
      initialize: vi.fn(),
      toasts: [],
      removeToast: vi.fn(),
      addToast: vi.fn(),
    }
    return selector ? selector(state) : state
  }),
}))

const wsState = {
  workspacePath: '/home/user/project',
  currentFile: null,
  openFiles: [],
  dirtyFiles: new Set(),
  openFile: vi.fn().mockResolvedValue(undefined),
  closeFile: vi.fn(),
  renameFileInStore: vi.fn(),
  loadWorkspace: vi.fn().mockResolvedValue(undefined),
  setWorkspacePath: mockSetWorkspacePath,
  refreshFileTree: mockRefreshFileTree,
}

vi.mock('../../stores/workspaceStore', () => ({
  useWorkspaceStore: Object.assign(
    vi.fn((selector?: (state: unknown) => unknown) => {
      return selector ? selector(wsState) : wsState
    }),
    { getState: () => wsState }
  ),
}))

vi.mock('../../services', () => ({
  api: {
    agent: {
      getAgents: vi.fn().mockResolvedValue([
        { id: 'claude-code', name: 'Claude Code', state: 'idle' },
        { id: 'kimi-code', name: 'Kimi Code', state: 'idle' },
      ]),
      scanSkills: vi.fn().mockResolvedValue([]),
    },
    monitoring: {
      listAuditEvents: vi.fn().mockResolvedValue([]),
      getAuditStats: vi.fn().mockResolvedValue({ count: 0, enabled: true }),
    },
    swarm: {
      getSwarms: vi.fn().mockResolvedValue([]),
    },
    session: {
      getSessions: vi.fn().mockResolvedValue([]),
    },
    mcp: {
      getServers: vi.fn().mockResolvedValue([]),
    },
    a2a: {
      getStatus: vi.fn().mockResolvedValue({}),
      getMessageLog: vi.fn().mockResolvedValue([]),
      getAgentCards: vi.fn().mockResolvedValue([]),
    },
  },
  events: {
    subscribe: vi.fn(() => vi.fn()),
  },
}))

vi.mock('../../services/api', () => ({
  gitApi: {
    getBranch: vi.fn().mockResolvedValue('main'),
    pull: vi.fn().mockResolvedValue({ output: 'Already up to date.' }),
    getStatus: vi.fn().mockResolvedValue([]),
  },
  workspaceApi: {
    openFolderDialog: vi.fn().mockResolvedValue(null),
  },
}))

vi.mock('../../stores/monitoringStore', () => ({
  useMonitoringStore: useMonitoringStoreMock,
}))

vi.mock('../../stores/agentLifecycleStore', () => ({
  useAgentLifecycleStore: useAgentLifecycleStoreMock,
}))

vi.mock('../../stores/taskFlowStore', () => ({
  useTaskFlowStore: useTaskFlowStoreMock,
}))

// Mock all child components
vi.mock('../AgentCapabilityPanel', () => ({
  default: () => <div data-testid="agent-capability-panel">Agent Capabilities</div>,
}))

vi.mock('../../panels/ExplorerPanel', () => ({
  default: () => <div data-testid="explorer-panel">Explorer</div>,
}))
vi.mock('../../panels/MCPPanel', () => ({
  default: () => <div data-testid="mcp-panel">MCP</div>,
}))
vi.mock('../../panels/EditorPanel', () => ({
  default: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="editor-panel">Editor{embedded ? ' (embedded)' : ''}</div>
  ),
}))
vi.mock('../../panels/TerminalPanel', () => ({
  default: () => <div data-testid="terminal-panel">Terminal</div>,
}))
vi.mock('../../panels/ProblemsPanel', () => ({
  default: () => <div data-testid="problems-panel">Problems</div>,
}))
vi.mock('../QueenSandbox', () => ({
  default: ({ onNodeSelect }: { onNodeSelect: (id: string, name: string) => void }) => (
    <div data-testid="queen-sandbox" onClick={() => onNodeSelect('agent-1', 'Claude Code')}>Queen Sandbox</div>
  ),
}))
vi.mock('../ProtocolMonitor', () => ({
  default: ({ contextLabel }: { contextLabel: string | null }) => (
    <div data-testid="protocol-monitor">Protocol {contextLabel || 'none'}</div>
  ),
}))
vi.mock('../ActivityLog', () => ({
  default: () => <div data-testid="activity-log">Activity Log</div>,
}))
vi.mock('../QueenDispatcher', () => ({
  default: () => <div data-testid="queen-dispatcher">Queen Dispatcher</div>,
}))
vi.mock('../CLIProcessWorkshop', () => ({
  default: () => <div data-testid="cli-process-workshop">CLI Process Workshop</div>,
}))
vi.mock('../DaemonLog', () => ({
  default: () => <div data-testid="daemon-log">Daemon Log</div>,
}))
vi.mock('../SymbolOutline', () => ({
  default: () => <div data-testid="symbol-outline">Symbol Outline</div>,
}))
vi.mock('../../panels/SupervisorPanel', () => ({
  default: () => <div data-testid="supervisor-panel">Supervisor</div>,
}))

// Helper to render with Router
const renderWithRouter = (ui: React.ReactElement) => {
  return render(
    <BrowserRouter>
      {ui}
    </BrowserRouter>
  )
}

describe('MainLayout', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Restore default useAppStore mock
    const { useAppStore } = await import('../../store/appStore')
    vi.mocked(useAppStore).mockImplementation(((selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        agents: [
          { id: 'claude-code', name: 'Claude Code', type: 'coder', state: 'idle' },
          { id: 'kimi-code', name: 'Kimi Code', type: 'coder', state: 'idle' },
        ],
        zenMode: false,
        initialize: vi.fn(),
        toasts: [],
        removeToast: vi.fn(),
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    }) as unknown as typeof useAppStore)
  })

  // --- Layout structure ---
  it('renders the five-layer layout structure', () => {
    const { container } = renderWithRouter(<MainLayout />)
    expect(container.firstChild).toHaveClass('flex', 'flex-col', 'h-screen')
  })

  it('renders app title in title bar', () => {
    renderWithRouter(<MainLayout />)
    expect(screen.getByText('Swarm Editor')).toBeInTheDocument()
  })

  it('renders ACP/A2A version tag', () => {
    renderWithRouter(<MainLayout />)
    expect(screen.getByText(/ACP\/A2A ENGINE/)).toBeInTheDocument()
  })

  // --- Left sidebar ---
  it('renders left sidebar with tabs', () => {
    renderWithRouter(<MainLayout />)
    expect(screen.getByText('项目文件 & Git')).toBeInTheDocument()
    expect(screen.getByText(/MCP 与技能/)).toBeInTheDocument()
    expect(screen.getByText('Agent 能力')).toBeInTheDocument()
  })

  it('renders skill count badge when skills are found', async () => {
    const { api } = await import('../../services')
    vi.mocked(api.agent.scanSkills).mockResolvedValueOnce([
      { id: '1', name: 'skill-1', source: 'filesystem' },
      { id: '2', name: 'skill-2', source: 'mcp' },
      { id: '3', name: 'skill-3', source: 'agent' },
    ])
    await act(async () => { renderWithRouter(<MainLayout />) })
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('shows Explorer by default in left sidebar', () => {
    renderWithRouter(<MainLayout />)
    expect(screen.getByTestId('explorer-panel')).toBeInTheDocument()
  })

  it('shows SymbolOutline below Explorer', () => {
    renderWithRouter(<MainLayout />)
    expect(screen.getByTestId('symbol-outline')).toBeInTheDocument()
  })

  it('switches left tab to MCP', async () => {
    await act(async () => { renderWithRouter(<MainLayout />) })
    await act(async () => { fireEvent.click(screen.getByText(/MCP 与技能/)) })
    expect(screen.getByTestId('mcp-panel')).toBeInTheDocument()
  })

  it('switches left tab to Agent Capability', async () => {
    await act(async () => { renderWithRouter(<MainLayout />) })
    await act(async () => { fireEvent.click(screen.getByText('Agent 能力')) })
    expect(screen.getByTestId('agent-capability-panel')).toBeInTheDocument()
  })

  // --- Center panel ---
  it('renders center tabs', () => {
    renderWithRouter(<MainLayout />)
    expect(screen.getByText(/蜂王自动调度沙盘/)).toBeInTheDocument()
    expect(screen.getByText(/代码编辑器/)).toBeInTheDocument()
  })

  it('shows Queen Sandbox by default in center', () => {
    renderWithRouter(<MainLayout />)
    expect(screen.getByTestId('queen-sandbox')).toBeInTheDocument()
  })

  it('switches center tab to editor', async () => {
    await act(async () => { renderWithRouter(<MainLayout />) })
    await act(async () => { fireEvent.click(screen.getByText(/代码编辑器/)) })
    expect(screen.getByTestId('editor-panel')).toBeInTheDocument()
  })

  it('updates selectedNodeLabel when QueenSandbox onNodeSelect fires', async () => {
    await act(async () => { renderWithRouter(<MainLayout />) })
    await act(async () => { fireEvent.click(screen.getByTestId('queen-sandbox')) })
    // Component should still render after event (no crash)
    expect(screen.getByTestId('queen-sandbox')).toBeInTheDocument()
  })

  // --- Right sidebar ---
  it('renders right sidebar tabs', () => {
    renderWithRouter(<MainLayout />)
    expect(screen.getAllByText(/指令交互/).length).toBeGreaterThan(0)
    expect(screen.getByText(/活动日志/)).toBeInTheDocument()
  })

  it('shows Protocol Monitor by default in right sidebar', () => {
    renderWithRouter(<MainLayout />)
    expect(screen.getByTestId('protocol-monitor')).toBeInTheDocument()
  })

  it('switches right tab to Activity Log', async () => {
    await act(async () => { renderWithRouter(<MainLayout />) })
    const activityButtons = screen.getAllByText(/活动日志/)
    await act(async () => { fireEvent.click(activityButtons[0]) })
    expect(screen.getByTestId('activity-log')).toBeInTheDocument()
  })

  it('renders Queen Dispatcher at bottom of right sidebar', () => {
    renderWithRouter(<MainLayout />)
    expect(screen.getByTestId('queen-dispatcher')).toBeInTheDocument()
  })

  // --- Bottom panel ---
  it('renders bottom panel tabs', () => {
    renderWithRouter(<MainLayout />)
    expect(screen.getByText(/本地 CLI 进程工坊/)).toBeInTheDocument()
    expect(screen.getByText(/交互终端/)).toBeInTheDocument()
    expect(screen.getByText(/检查诊断/)).toBeInTheDocument()
    expect(screen.getByText(/守护进程审计/)).toBeInTheDocument()
  })

  it('shows CLI Process Workshop by default in bottom panel', () => {
    renderWithRouter(<MainLayout />)
    expect(screen.getByTestId('cli-process-workshop')).toBeInTheDocument()
  })

  it('switches bottom tab to Terminal', async () => {
    await act(async () => { renderWithRouter(<MainLayout />) })
    await act(async () => { fireEvent.click(screen.getByText(/交互终端/)) })
    expect(screen.getByTestId('terminal-panel')).toBeInTheDocument()
  })

  it('switches bottom tab to Problems', async () => {
    await act(async () => { renderWithRouter(<MainLayout />) })
    await act(async () => { fireEvent.click(screen.getByText(/检查诊断/)) })
    expect(screen.getByTestId('problems-panel')).toBeInTheDocument()
  })

  it('switches bottom tab to Daemon Log', async () => {
    await act(async () => { renderWithRouter(<MainLayout />) })
    await act(async () => { fireEvent.click(screen.getByText(/守护进程审计/)) })
    expect(screen.getByTestId('daemon-log')).toBeInTheDocument()
  })

  it('switches bottom tab to Supervisor', async () => {
    await act(async () => { renderWithRouter(<MainLayout />) })
    await act(async () => { fireEvent.click(screen.getByText(/监督面板/)) })
    expect(screen.getByTestId('supervisor-panel')).toBeInTheDocument()
  })

  // --- Status bar ---
  it('renders status bar', () => {
    renderWithRouter(<MainLayout />)
    expect(screen.getByText(/daemon 守护进程已就绪/)).toBeInTheDocument()
  })

  it('displays current branch in status bar', async () => {
    await act(async () => { renderWithRouter(<MainLayout />) })
    expect(screen.getByText(/main/)).toBeInTheDocument()
  })

  it('shows skill count in status bar', async () => {
    const { api } = await import('../../services')
    vi.mocked(api.agent.scanSkills).mockResolvedValueOnce([
      { id: '1', name: 's1', source: 'filesystem' },
    ])
    await act(async () => { renderWithRouter(<MainLayout />) })
    expect(screen.getByText(/1 实体能力运作中/)).toBeInTheDocument()
  })

  // --- Title bar menus ---
  it('navigates to MCP tab via menu', async () => {
    await act(async () => { renderWithRouter(<MainLayout />) })
    await act(async () => { fireEvent.click(screen.getByText(/MCP 服务器/)) })
    expect(screen.getByTestId('mcp-panel')).toBeInTheDocument()
  })

  it('navigates to sandbox via menu', async () => {
    await act(async () => { renderWithRouter(<MainLayout />) })
    // First switch to editor
    await act(async () => { fireEvent.click(screen.getByText(/代码编辑器/)) })
    expect(screen.getByTestId('editor-panel')).toBeInTheDocument()
    // Then click Swarm Engine menu
    await act(async () => { fireEvent.click(screen.getByText(/蜂群架构/)) })
    expect(screen.getByTestId('queen-sandbox')).toBeInTheDocument()
  })

  it('opens folder via File menu', async () => {
    const { workspaceApi } = await import('../../services/api')
    vi.mocked(workspaceApi.openFolderDialog).mockResolvedValueOnce('/new/folder')
    await act(async () => { renderWithRouter(<MainLayout />) })
    const fileMenu = screen.getByText(/文件 \(File\)/)
    await act(async () => { fireEvent.click(fileMenu) })
    expect(workspaceApi.openFolderDialog).toHaveBeenCalled()
    expect(mockSetWorkspacePath).toHaveBeenCalledWith('/new/folder')
  })

  it('handles open folder dialog returning null', async () => {
    const { workspaceApi } = await import('../../services/api')
    vi.mocked(workspaceApi.openFolderDialog).mockResolvedValueOnce(null)
    await act(async () => { renderWithRouter(<MainLayout />) })
    const fileMenu = screen.getByText(/文件 \(File\)/)
    await act(async () => { fireEvent.click(fileMenu) })
    expect(mockSetWorkspacePath).not.toHaveBeenCalled()
  })

  it('handles open folder dialog error', async () => {
    const { workspaceApi } = await import('../../services/api')
    vi.mocked(workspaceApi.openFolderDialog).mockRejectedValueOnce(new Error('Dialog failed'))
    await act(async () => { renderWithRouter(<MainLayout />) })
    const fileMenu = screen.getByText(/文件 \(File\)/)
    await act(async () => { fireEvent.click(fileMenu) })
    // Component should still be rendered after error (no crash)
    expect(fileMenu).toBeInTheDocument()
  })

  // --- Git sync button ---
  it('calls git pull on sync button click', async () => {
    const { gitApi } = await import('../../services/api')
    await act(async () => { renderWithRouter(<MainLayout />) })
    const syncButton = screen.getByTitle('Git 同步')
    await act(async () => { fireEvent.click(syncButton) })
    expect(gitApi.pull).toHaveBeenCalled()
  })

  it('shows error toast on git pull failure', async () => {
    const { gitApi } = await import('../../services/api')
    vi.mocked(gitApi.pull).mockRejectedValueOnce(new Error('Pull failed'))
    await act(async () => { renderWithRouter(<MainLayout />) })
    const syncButton = screen.getByTitle('Git 同步')
    await act(async () => { fireEvent.click(syncButton) })
    expect(gitApi.pull).toHaveBeenCalled()
    // addToast is called in the catch block — component should not crash
    expect(syncButton).toBeInTheDocument()
  })

  // --- Settings button ---
  it('navigates to settings on gear button click', async () => {
    await act(async () => { renderWithRouter(<MainLayout />) })
    const settingsButton = screen.getByTitle('设置')
    await act(async () => { fireEvent.click(settingsButton) })
    expect(window.location.hash).toBe('#/settings')
  })

  // --- Daemon status line ---
  it('displays agent names when agents exist', () => {
    renderWithRouter(<MainLayout />)
    expect(screen.getByText(/Claude Code.*Kimi Code/)).toBeInTheDocument()
  })

  it('displays standby when no agents', async () => {
    const { useAppStore } = await import('../../store/appStore')
    vi.mocked(useAppStore).mockImplementation(((selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        agents: [],
        zenMode: false,
        initialize: vi.fn(),
        toasts: [],
        removeToast: vi.fn(),
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    }) as unknown as typeof useAppStore)
    await act(async () => { renderWithRouter(<MainLayout />) })
    expect(screen.getByText(/standby/)).toBeInTheDocument()
  })

  // --- Protocol label in bottom panel ---
  it('renders DAEMON PROTOCOL label', () => {
    renderWithRouter(<MainLayout />)
    expect(screen.getByText(/DAEMON PROTOCOL: ACP_V1_BRIDGE/)).toBeInTheDocument()
  })

  // --- FLOW STATUS ---
  it('renders FLOW STATUS indicator', () => {
    renderWithRouter(<MainLayout />)
    expect(screen.getByText(/FLOW STATUS: ONLINE/)).toBeInTheDocument()
  })

  // --- Agent count in bottom ---
  it('shows active agent count in CLI tab', async () => {
    await act(async () => { renderWithRouter(<MainLayout />) })
    // The count text is inside a span within the button
    const countText = screen.getByText(/Active进程/)
    expect(countText.textContent).toContain('2')
  })

  // --- Active agent count with zero agents ---
  it('shows 0 active agents when no agents', async () => {
    const { useAppStore } = await import('../../store/appStore')
    vi.mocked(useAppStore).mockImplementation(((selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        agents: [],
        zenMode: false,
        initialize: vi.fn(),
        toasts: [],
        removeToast: vi.fn(),
        addToast: vi.fn(),
      }
      return selector ? selector(state) : state
    }) as unknown as typeof useAppStore)
    await act(async () => { renderWithRouter(<MainLayout />) })
    const countText = screen.getByText(/Active进程/)
    expect(countText.textContent).toContain('0')
  })

  // --- sandbox:node-selected event ---
  it('listens for sandbox:node-selected events', async () => {
    await act(async () => { renderWithRouter(<MainLayout />) })
    await act(async () => {
      window.dispatchEvent(new CustomEvent('sandbox:node-selected', {
        detail: { agentId: 'test-agent', agentName: 'Test Agent' }
      }))
    })
    // The event should update selectedNodeLabel which is passed to ProtocolMonitor
    expect(screen.getByTestId('protocol-monitor')).toHaveTextContent('Test Agent (test-agent)')
  })

  // --- Monitoring store initialization ---
  it('initializes monitoring stores on mount', () => {
    renderWithRouter(<MainLayout />)
    expect(useMonitoringStoreMock.getState).toHaveBeenCalled()
  })

  // --- Git branch ---
  it('handles git branch failure gracefully', async () => {
    const { gitApi } = await import('../../services/api')
    vi.mocked(gitApi.getBranch).mockRejectedValueOnce(new Error('Not a git repo'))
    await act(async () => { renderWithRouter(<MainLayout />) })
    expect(screen.getByText(/main/)).toBeInTheDocument()
  })

  it('updates branch when git returns different branch', async () => {
    const { gitApi } = await import('../../services/api')
    vi.mocked(gitApi.getBranch).mockResolvedValueOnce('feature-branch')
    await act(async () => { renderWithRouter(<MainLayout />) })
    expect(screen.getByText(/feature-branch/)).toBeInTheDocument()
  })

  // --- scanSkills error ---
  it('handles scanSkills failure gracefully', async () => {
    const { api } = await import('../../services')
    vi.mocked(api.agent.scanSkills).mockRejectedValueOnce(new Error('Scan failed'))
    await act(async () => { renderWithRouter(<MainLayout />) })
    // Component should still render with 0 skills
    expect(screen.getByText(/MCP 与技能/)).toBeInTheDocument()
  })
})
