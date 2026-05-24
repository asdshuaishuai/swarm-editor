import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import MainLayout from './MainLayout'

// Hoisted mock variables — available inside vi.mock() factories
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

// Mock the store
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

// Mock services
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
  },
}))

// Mock monitoring stores
vi.mock('../../stores/monitoringStore', () => ({
  useMonitoringStore: useMonitoringStoreMock,
}))

vi.mock('../../stores/agentLifecycleStore', () => ({
  useAgentLifecycleStore: useAgentLifecycleStoreMock,
}))

vi.mock('../../stores/taskFlowStore', () => ({
  useTaskFlowStore: useTaskFlowStoreMock,
}))

// Mock AgentCapabilityPanel
vi.mock('../AgentCapabilityPanel', () => ({
  default: () => <div data-testid="agent-capability-panel">Agent Capabilities</div>,
}))

// Mock lazy-loaded panels
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
vi.mock('../ProblemsPanel', () => ({
  default: () => <div data-testid="problems-panel">Problems</div>,
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

  it('renders left sidebar with tabs', () => {
    renderWithRouter(<MainLayout />)
    expect(screen.getByText('项目文件 & Git')).toBeInTheDocument()
    expect(screen.getByText(/MCP 与技能/)).toBeInTheDocument()
  })

  it('renders center tabs', () => {
    renderWithRouter(<MainLayout />)
    expect(screen.getByText(/蜂王自动调度沙盘/)).toBeInTheDocument()
    expect(screen.getByText(/代码编辑器/)).toBeInTheDocument()
  })

  it('renders right sidebar tabs', () => {
    renderWithRouter(<MainLayout />)
    expect(screen.getAllByText(/协定封包/).length).toBeGreaterThan(0)
    expect(screen.getByText(/活动日志/)).toBeInTheDocument()
  })

  it('renders bottom panel tabs', () => {
    renderWithRouter(<MainLayout />)
    expect(screen.getByText(/本地 CLI 进程工坊/)).toBeInTheDocument()
    expect(screen.getByText(/交互终端/)).toBeInTheDocument()
    expect(screen.getByText(/检查诊断/)).toBeInTheDocument()
    expect(screen.getByText(/守护进程审计/)).toBeInTheDocument()
  })

  it('switches left tab to MCP', async () => {
    await act(async () => {
      renderWithRouter(<MainLayout />)
    })
    await act(async () => {
      fireEvent.click(screen.getByText(/MCP 与技能/))
    })
    expect(screen.getByTestId('mcp-panel')).toBeInTheDocument()
  })

  it('switches center tab to editor', async () => {
    await act(async () => {
      renderWithRouter(<MainLayout />)
    })
    await act(async () => {
      fireEvent.click(screen.getByText(/代码编辑器/))
    })
    expect(screen.getByTestId('editor-panel')).toBeInTheDocument()
  })
})
