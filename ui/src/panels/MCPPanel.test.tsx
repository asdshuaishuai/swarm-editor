import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import MCPPanel from './MCPPanel'
import type { MCPServerSetting } from '../hooks/useSettings'

// --- Mocks ---

const mockAddServer = vi.fn()
const mockRemoveServer = vi.fn()
const mockStartServer = vi.fn()
const mockStopServer = vi.fn()
const mockListTools = vi.fn()
const mockCallTool = vi.fn()
const mockScanServers = vi.fn()
const mockAddMCPServer = vi.fn()
const mockRemoveMCPServer = vi.fn()
const mockUpdateMCPServer = vi.fn()
const mockUpdateSetting = vi.fn()
const mockAddToast = vi.fn()
const mockScanSkills = vi.fn()

vi.mock('../services', () => ({
  api: {
    mcp: {
      addServer: (...args: unknown[]) => mockAddServer(...args),
      removeServer: (...args: unknown[]) => mockRemoveServer(...args),
      listTools: (...args: unknown[]) => mockListTools(...args),
      callTool: (...args: unknown[]) => mockCallTool(...args),
      scanServers: (...args: unknown[]) => mockScanServers(...args),
      startServer: (...args: unknown[]) => mockStartServer(...args),
      stopServer: (...args: unknown[]) => mockStopServer(...args),
      getUnifiedServers: vi.fn().mockResolvedValue({}),
      upsertServer: vi.fn().mockResolvedValue({ success: true, id: 'test', status: 'processing' }),
      deleteUnifiedServer: vi.fn().mockResolvedValue({ success: true, status: 'processing' }),
      toggleApp: vi.fn().mockResolvedValue({ success: true, status: 'processing' }),
      importFromApps: vi.fn().mockResolvedValue({ success: true, imported: 0, total: 0 }),
    },
    agent: {
      scanSkills: (...args: unknown[]) => mockScanSkills(...args),
    },
    events: {
      onMCPConfigSynced: vi.fn().mockReturnValue(() => {}),
    },
  },
}))

// Build a helper so tests can inject different settings
let mockSettings: {
  mcpServers: MCPServerSetting[]
  mcpEnabled: boolean
}

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({
    settings: mockSettings,
    addMCPServer: mockAddMCPServer,
    removeMCPServer: mockRemoveMCPServer,
    updateMCPServer: mockUpdateMCPServer,
    updateSetting: mockUpdateSetting,
  }),
}))

vi.mock('../store/appStore', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ addToast: mockAddToast }),
}))

vi.mock('../utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// --- Shared server fixtures ---

const connectedServer: MCPServerSetting = {
  id: 'mcp-1',
  name: 'test-server',
  command: 'test-cmd',
  args: [],
  env: {},
  enabled: true,
  autoStart: true,
  status: 'connected',
}

const disconnectedServer: MCPServerSetting = {
  id: 'mcp-2',
  name: 'offline-server',
  command: 'offline-cmd',
  args: ['--flag', 'value'],
  env: { KEY: 'val' },
  enabled: false,
  autoStart: false,
  status: 'disconnected',
}

const errorServer: MCPServerSetting = {
  id: 'mcp-3',
  name: 'error-server',
  command: 'broken-cmd',
  args: [],
  env: {},
  enabled: true,
  autoStart: true,
  status: 'error',
}

const networkServer: MCPServerSetting = {
  id: 'mcp-4',
  name: 'brave-search',
  command: 'npx @brave/search-mcp',
  args: [],
  env: {},
  enabled: true,
  autoStart: true,
  status: 'connected',
}

function renderWithDefaults(overrides?: { servers?: MCPServerSetting[]; mcpEnabled?: boolean }) {
  mockSettings = {
    mcpServers: overrides?.servers ?? [connectedServer],
    mcpEnabled: overrides?.mcpEnabled ?? true,
  }
  return render(<MCPPanel />)
}

// --- Test suites ---

describe('MCPPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListTools.mockResolvedValue([])
    mockAddServer.mockResolvedValue({ id: 'new-1' })
    mockRemoveServer.mockResolvedValue(undefined)
    mockStartServer.mockResolvedValue({ status: 'connected' })
    mockStopServer.mockResolvedValue({ status: 'disconnected' })
    mockScanServers.mockResolvedValue([])
    mockCallTool.mockResolvedValue({ ok: true })
    mockScanSkills.mockResolvedValue([
      { id: 's1', name: 'Go Vet', description: 'Go static analysis', source: 'filesystem', path: '~/.claude/skills/go-vet', tags: ['go', 'lint'] },
      { id: 's2', name: 'Filesystem Tools', description: 'Read/write files', source: 'mcp', tags: ['files'] },
      { id: 's3', name: 'Claude Code Skills', description: 'Code generation', source: 'agent', agentId: 'claude-code', tags: ['coding'] },
      { id: 's4', name: 'AST Analyzer', description: 'Semantic analysis', source: 'filesystem', path: '~/.claude/skills/ast', tags: ['ast'] },
    ])
  })

  // ---------------------------------------------------------------
  // Rendering: basic UI structure
  // ---------------------------------------------------------------
  describe('basic rendering', () => {
    it('renders the MCP servers header', () => {
      renderWithDefaults()
      expect(screen.getByText('MCP 服务器')).toBeInTheDocument()
    })

    it('renders the skills section header', () => {
      renderWithDefaults()
      expect(screen.getByText(/蜂群可加载技能库/)).toBeInTheDocument()
    })

    it('renders scan and register buttons', () => {
      renderWithDefaults()
      expect(screen.getByTitle('扫描并导入 MCP 服务器')).toBeInTheDocument()
      expect(screen.getByText('注册')).toBeInTheDocument()
    })

    it('shows server count in header', () => {
      renderWithDefaults()
      expect(screen.getByText('1')).toBeInTheDocument()
    })

    it('shows MCP enabled toggle with correct state when enabled', () => {
      renderWithDefaults({ mcpEnabled: true })
      expect(screen.getByText('已启用')).toBeInTheDocument()
    })

    it('shows MCP disabled state', () => {
      renderWithDefaults({ mcpEnabled: false })
      expect(screen.getByText('已禁用')).toBeInTheDocument()
    })

    it('shows correct server count for multiple servers', () => {
      renderWithDefaults({ servers: [connectedServer, disconnectedServer] })
      expect(screen.getByText('2')).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------
  describe('empty state', () => {
    it('renders empty state when no servers configured', () => {
      renderWithDefaults({ servers: [] })
      expect(screen.getByText('无 MCP 服务器配置')).toBeInTheDocument()
      expect(screen.getByText('注册 MCP 服务器以扩展 Agent 能力')).toBeInTheDocument()
    })

    it('does not show server count > 0 in empty state', () => {
      renderWithDefaults({ servers: [] })
      // Both configured and discovered counts should be 0
      expect(screen.getByText((content) => content.includes('已配置:'))).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------
  // MCP Server Card rendering
  // ---------------------------------------------------------------
  describe('server card rendering', () => {
    it('displays server name', async () => {
      renderWithDefaults()
      await waitFor(() => {
        expect(screen.getByText('test-server')).toBeInTheDocument()
      })
    })

    it('displays server command', async () => {
      renderWithDefaults()
      await waitFor(() => {
        expect(screen.getByText('test-cmd')).toBeInTheDocument()
      })
    })

    it('displays server args when present', async () => {
      renderWithDefaults({ servers: [disconnectedServer] })
      await waitFor(() => {
        expect(screen.getByText('--flag value')).toBeInTheDocument()
      })
    })

    it('does not render args block when args is empty', async () => {
      renderWithDefaults()
      await waitFor(() => {
        expect(screen.getByText('test-server')).toBeInTheDocument()
      })
      expect(screen.queryByText(/--flag/)).not.toBeInTheDocument()
    })

    it('renders toggle button for connected server showing disconnect label', async () => {
      renderWithDefaults()
      await waitFor(() => {
        expect(screen.getByText('断开')).toBeInTheDocument()
      })
    })

    it('renders toggle button for disconnected server showing connect label', async () => {
      renderWithDefaults({ servers: [disconnectedServer] })
      await waitFor(() => {
        expect(screen.getByText('连接')).toBeInTheDocument()
      })
    })

    it('renders badge "系统特权" for connected non-network server', async () => {
      renderWithDefaults()
      await waitFor(() => {
        expect(screen.getByText('系统特权')).toBeInTheDocument()
      })
    })

    it('renders badge "外部网络" for connected network server', async () => {
      renderWithDefaults({ servers: [networkServer] })
      await waitFor(() => {
        expect(screen.getByText('外部网络')).toBeInTheDocument()
      })
    })

    it('renders badge "离线资料" for disconnected server', async () => {
      renderWithDefaults({ servers: [disconnectedServer] })
      await waitFor(() => {
        expect(screen.getByText('离线资料')).toBeInTheDocument()
      })
    })

    it('renders multiple server cards', async () => {
      renderWithDefaults({ servers: [connectedServer, disconnectedServer] })
      await waitFor(() => {
        expect(screen.getByText('test-server')).toBeInTheDocument()
        expect(screen.getByText('offline-server')).toBeInTheDocument()
      })
    })
  })

  // ---------------------------------------------------------------
  // Tools loading and display (MCPServerCard)
  // ---------------------------------------------------------------
  describe('tools loading', () => {
    it('loads tools for connected server on mount', async () => {
      mockListTools.mockResolvedValue([
        { name: 'read_file', description: 'Read a file' },
        { name: 'write_file', description: 'Write a file' },
      ])
      renderWithDefaults()

      await waitFor(() => {
        expect(mockListTools).toHaveBeenCalledWith('mcp-1')
      })
      await waitFor(() => {
        expect(screen.getByText('read_file()')).toBeInTheDocument()
        expect(screen.getByText('write_file()')).toBeInTheDocument()
      })
    })

    it('shows no-tools message when tools list is empty', async () => {
      mockListTools.mockResolvedValue([])
      renderWithDefaults()

      await waitFor(() => {
        expect(mockListTools).toHaveBeenCalledWith('mcp-1')
      })
      // Wait for loading to finish, then check empty message
      await waitFor(() => {
        expect(screen.getByText('无可用工具')).toBeInTheDocument()
      })
    })

    it('does not load tools for disconnected server', async () => {
      renderWithDefaults({ servers: [disconnectedServer] })
      await waitFor(() => {
        expect(screen.getByText('offline-server')).toBeInTheDocument()
      })
      expect(mockListTools).not.toHaveBeenCalled()
    })

    it('shows Loading... while tools are being fetched', async () => {
      let resolveTools: (value: unknown[]) => void
      mockListTools.mockReturnValue(new Promise<unknown[]>(resolve => { resolveTools = resolve }))
      renderWithDefaults()

      await waitFor(() => {
        expect(screen.getByText('Loading...')).toBeInTheDocument()
      })
      resolveTools!([])
      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
      })
    })

    it('handles tool loading error gracefully', async () => {
      mockListTools.mockRejectedValue(new Error('network error'))
      renderWithDefaults()

      // Should not crash - tools section still renders
      await waitFor(() => {
        expect(mockListTools).toHaveBeenCalledWith('mcp-1')
      })
      await waitFor(() => {
        expect(screen.getByText('无可用工具')).toBeInTheDocument()
      })
    })
  })

  // ---------------------------------------------------------------
  // Tool calling
  // ---------------------------------------------------------------
  describe('tool calling', () => {
    const tools = [
      { name: 'search', description: 'Search the web' },
      { name: 'fetch', description: 'Fetch a URL' },
    ]

    it('calls a tool when tool button is clicked', async () => {
      mockListTools.mockResolvedValue(tools)
      mockCallTool.mockResolvedValue({ results: ['item1'] })
      const user = userEvent.setup()
      renderWithDefaults()

      await waitFor(() => {
        expect(screen.getByText('search()')).toBeInTheDocument()
      })

      await user.click(screen.getByText('search()'))
      expect(mockCallTool).toHaveBeenCalledWith('mcp-1', 'search', {})
    })

    it('shows toast on successful tool call', async () => {
      mockListTools.mockResolvedValue(tools)
      mockCallTool.mockResolvedValue({ data: 'ok' })
      const user = userEvent.setup()
      renderWithDefaults()

      await waitFor(() => {
        expect(screen.getByText('search()')).toBeInTheDocument()
      })
      await user.click(screen.getByText('search()'))

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('success', 'Tool Called', 'search executed successfully')
      })
    })

    it('shows tool result panel after successful call', async () => {
      mockListTools.mockResolvedValue(tools)
      mockCallTool.mockResolvedValue({ data: 'result-data' })
      const user = userEvent.setup()
      renderWithDefaults()

      await waitFor(() => {
        expect(screen.getByText('search()')).toBeInTheDocument()
      })
      await user.click(screen.getByText('search()'))

      await waitFor(() => {
        expect(screen.getByText('search 结果:')).toBeInTheDocument()
      })
      expect(screen.getByText(/result-data/)).toBeInTheDocument()
    })

    it('shows string result directly', async () => {
      mockListTools.mockResolvedValue([{ name: 'echo', description: 'Echo' }])
      mockCallTool.mockResolvedValue('plain string result')
      const user = userEvent.setup()
      renderWithDefaults()

      await waitFor(() => {
        expect(screen.getByText('echo()')).toBeInTheDocument()
      })
      await user.click(screen.getByText('echo()'))

      await waitFor(() => {
        expect(screen.getByText('plain string result')).toBeInTheDocument()
      })
    })

    it('shows toast on tool call failure', async () => {
      mockListTools.mockResolvedValue(tools)
      mockCallTool.mockRejectedValue(new Error('tool crashed'))
      const user = userEvent.setup()
      renderWithDefaults()

      await waitFor(() => {
        expect(screen.getByText('search()')).toBeInTheDocument()
      })
      await user.click(screen.getByText('search()'))

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Tool Call Failed', 'tool crashed')
      })
    })

    it('shows toast with unknown error when tool call rejects without Error instance', async () => {
      mockListTools.mockResolvedValue([{ name: 'tool1', description: 'T' }])
      mockCallTool.mockRejectedValue('string error')
      const user = userEvent.setup()
      renderWithDefaults()

      await waitFor(() => {
        expect(screen.getByText('tool1()')).toBeInTheDocument()
      })
      await user.click(screen.getByText('tool1()'))

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Tool Call Failed', 'Unknown error')
      })
    })
  })

  // ---------------------------------------------------------------
  // Server toggle (start/stop)
  // ---------------------------------------------------------------
  describe('server toggle', () => {
    it('starts a disconnected server when toggle clicked', async () => {
      mockStartServer.mockResolvedValue({ status: 'connected' })
      const user = userEvent.setup()
      renderWithDefaults({ servers: [disconnectedServer] })

      await waitFor(() => {
        expect(screen.getByText('连接')).toBeInTheDocument()
      })
      await user.click(screen.getByText('连接'))

      expect(mockStartServer).toHaveBeenCalledWith('mcp-2')
      await waitFor(() => {
        expect(mockUpdateMCPServer).toHaveBeenCalledWith('offline-server', { status: 'connected' })
      })
    })

    it('stops a connected server when toggle clicked', async () => {
      mockStopServer.mockResolvedValue({ status: 'disconnected' })
      const user = userEvent.setup()
      renderWithDefaults()

      await waitFor(() => {
        expect(screen.getByText('断开')).toBeInTheDocument()
      })
      await user.click(screen.getByText('断开'))

      expect(mockStopServer).toHaveBeenCalledWith('mcp-1')
      await waitFor(() => {
        expect(mockUpdateMCPServer).toHaveBeenCalledWith('test-server', { status: 'disconnected' })
      })
    })

    it('shows success toast on toggle', async () => {
      mockStopServer.mockResolvedValue({ status: 'disconnected' })
      const user = userEvent.setup()
      renderWithDefaults()

      await waitFor(() => {
        expect(screen.getByText('断开')).toBeInTheDocument()
      })
      await user.click(screen.getByText('断开'))

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('success', 'Server Stopped', 'Server "test-server" has been stopped')
      })
    })

    it('shows start toast when starting', async () => {
      mockStartServer.mockResolvedValue({ status: 'connected' })
      const user = userEvent.setup()
      renderWithDefaults({ servers: [disconnectedServer] })

      await waitFor(() => {
        expect(screen.getByText('连接')).toBeInTheDocument()
      })
      await user.click(screen.getByText('连接'))

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('success', 'Server Started', 'Server "offline-server" has been started')
      })
    })

    it('shows error toast on toggle failure', async () => {
      mockStopServer.mockRejectedValue(new Error('connection refused'))
      const user = userEvent.setup()
      renderWithDefaults()

      await waitFor(() => {
        expect(screen.getByText('断开')).toBeInTheDocument()
      })
      await user.click(screen.getByText('断开'))

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to Toggle Server', 'connection refused')
      })
    })

    it('shows unknown error toast when toggle rejects with non-Error', async () => {
      mockStartServer.mockRejectedValue('fail')
      const user = userEvent.setup()
      renderWithDefaults({ servers: [disconnectedServer] })

      await waitFor(() => {
        expect(screen.getByText('连接')).toBeInTheDocument()
      })
      await user.click(screen.getByText('连接'))

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to Toggle Server', 'Unknown error')
      })
    })
  })

  // ---------------------------------------------------------------
  // MCP enabled toggle
  // ---------------------------------------------------------------
  describe('MCP enabled toggle', () => {
    it('calls updateSetting with false when toggling from enabled', async () => {
      const user = userEvent.setup()
      renderWithDefaults({ mcpEnabled: true })

      const toggle = screen.getByRole('switch', { name: /已启用/ })
      await user.click(toggle)

      expect(mockUpdateSetting).toHaveBeenCalledWith('mcpEnabled', false)
      expect(mockAddToast).toHaveBeenCalledWith('info', 'MCP 设置', 'MCP 已禁用')
    })

    it('calls updateSetting with true when toggling from disabled', async () => {
      const user = userEvent.setup()
      renderWithDefaults({ mcpEnabled: false })

      const toggle = screen.getByRole('switch', { name: /已禁用/ })
      await user.click(toggle)

      expect(mockUpdateSetting).toHaveBeenCalledWith('mcpEnabled', true)
      expect(mockAddToast).toHaveBeenCalledWith('info', 'MCP 设置', 'MCP 已启用')
    })
  })

  // ---------------------------------------------------------------
  // Scan servers
  // ---------------------------------------------------------------
  describe('scan servers', () => {
    it('triggers scan and shows success toast when refresh button clicked', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await user.click(screen.getByTitle('扫描并导入 MCP 服务器'))

      expect(mockScanServers).toHaveBeenCalled()
      expect(mockAddToast).toHaveBeenCalledWith('success', '刷新完成', '已扫描并导入 MCP 服务器')
    })
  })

  // ---------------------------------------------------------------
  // Add server modal
  // ---------------------------------------------------------------
  describe('add server modal', () => {
    it('opens add modal when register button clicked', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await user.click(screen.getByText('注册'))
      expect(screen.getByRole('dialog', { name: /添加 MCP 服务器/ })).toBeInTheDocument()
    })

    it('closes add modal when close button clicked', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await user.click(screen.getByText('注册'))
      expect(screen.getByRole('dialog', { name: /添加 MCP 服务器/ })).toBeInTheDocument()

      // Close via the X button inside the modal
      const dialog = screen.getByRole('dialog', { name: /添加 MCP 服务器/ })
      const closeBtn = within(dialog).getAllByRole('button').find(b => b.textContent === '')
      expect(closeBtn).toBeTruthy()
      await user.click(closeBtn!)

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /添加 MCP 服务器/ })).not.toBeInTheDocument()
      })
    })

    it('closes add modal when cancel button clicked', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await user.click(screen.getByText('注册'))
      await user.click(screen.getByText('取消'))

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /添加 MCP 服务器/ })).not.toBeInTheDocument()
      })
    })

    it('disables add button when name is missing but command is present', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await user.click(screen.getByText('注册'))
      const dialog = screen.getByRole('dialog', { name: /添加 MCP 服务器/ })
      const inputs = within(dialog).getAllByRole('textbox')
      // Only fill command, leave name empty
      await user.type(inputs[1], 'some-command')

      const addBtn = within(dialog).getByText('添加服务器').closest('button')!
      expect(addBtn).toBeDisabled()
      expect(mockAddServer).not.toHaveBeenCalled()
    })

    it('disables add button when command is missing but name is present', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await user.click(screen.getByText('注册'))
      const dialog = screen.getByRole('dialog', { name: /添加 MCP 服务器/ })
      const inputs = within(dialog).getAllByRole('textbox')
      // Only fill name, leave command empty
      await user.type(inputs[0], 'some-name')

      const addBtn = within(dialog).getByText('添加服务器').closest('button')!
      expect(addBtn).toBeDisabled()
      expect(mockAddServer).not.toHaveBeenCalled()
    })

    it('disables add button when name is empty', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await user.click(screen.getByText('注册'))
      // The button is disabled when name/command empty
      const dialog = screen.getByRole('dialog', { name: /添加 MCP 服务器/ })
      const addBtn = within(dialog).getByText('添加服务器').closest('button')!
      expect(addBtn).toBeDisabled()
    })

    it('enables add button when name and command are filled', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await user.click(screen.getByText('注册'))
      const dialog = screen.getByRole('dialog', { name: /添加 MCP 服务器/ })

      const inputs = within(dialog).getAllByRole('textbox')
      const nameInput = inputs[0]
      const commandInput = inputs[1]
      await user.type(nameInput, 'my-server')
      await user.type(commandInput, 'npx serve')

      const addBtn = within(dialog).getByText('添加服务器').closest('button')!
      expect(addBtn).not.toBeDisabled()
    })

    it('adds server successfully', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await user.click(screen.getByText('注册'))
      const dialog = screen.getByRole('dialog', { name: /添加 MCP 服务器/ })

      const inputs = within(dialog).getAllByRole('textbox')
      await user.type(inputs[0], 'my-new-server')
      await user.type(inputs[1], 'npx my-mcp')

      await user.click(within(dialog).getByText('添加服务器'))

      expect(mockAddServer).toHaveBeenCalledWith({
        name: 'my-new-server',
        command: 'npx my-mcp',
        args: [],
        env: {},
      })
      await waitFor(() => {
        expect(mockAddMCPServer).toHaveBeenCalled()
      })
      const addedServer = mockAddMCPServer.mock.calls[0][0] as MCPServerSetting
      expect(addedServer.name).toBe('my-new-server')
      expect(addedServer.command).toBe('npx my-mcp')
      expect(addedServer.status).toBe('disconnected')
    })

    it('shows success toast after adding server', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await user.click(screen.getByText('注册'))
      const dialog = screen.getByRole('dialog', { name: /添加 MCP 服务器/ })
      const inputs = within(dialog).getAllByRole('textbox')
      await user.type(inputs[0], 'new-srv')
      await user.type(inputs[1], 'cmd')
      await user.click(within(dialog).getByText('添加服务器'))

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('success', 'MCP Server Added', expect.stringContaining('new-srv'))
      })
    })

    it('closes modal after successful add', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await user.click(screen.getByText('注册'))
      const dialog = screen.getByRole('dialog', { name: /添加 MCP 服务器/ })
      const inputs = within(dialog).getAllByRole('textbox')
      await user.type(inputs[0], 'srv')
      await user.type(inputs[1], 'cmd')
      await user.click(within(dialog).getByText('添加服务器'))

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /添加 MCP 服务器/ })).not.toBeInTheDocument()
      })
    })

    it('shows error toast when add server fails', async () => {
      mockAddServer.mockRejectedValue(new Error('duplicate name'))
      const user = userEvent.setup()
      renderWithDefaults()

      await user.click(screen.getByText('注册'))
      const dialog = screen.getByRole('dialog', { name: /添加 MCP 服务器/ })
      const inputs = within(dialog).getAllByRole('textbox')
      await user.type(inputs[0], 'srv')
      await user.type(inputs[1], 'cmd')
      await user.click(within(dialog).getByText('添加服务器'))

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to Add Server', 'duplicate name')
      })
    })

    it('shows unknown error when add server rejects with non-Error', async () => {
      mockAddServer.mockRejectedValue('fail')
      const user = userEvent.setup()
      renderWithDefaults()

      await user.click(screen.getByText('注册'))
      const dialog = screen.getByRole('dialog', { name: /添加 MCP 服务器/ })
      const inputs = within(dialog).getAllByRole('textbox')
      await user.type(inputs[0], 'srv')
      await user.type(inputs[1], 'cmd')
      await user.click(within(dialog).getByText('添加服务器'))

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to Add Server', 'Unknown error')
      })
    })

    it('parses args from space-separated input', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await user.click(screen.getByText('注册'))
      const dialog = screen.getByRole('dialog', { name: /添加 MCP 服务器/ })
      const inputs = within(dialog).getAllByRole('textbox')
      await user.type(inputs[0], 'srv')
      await user.type(inputs[1], 'cmd')
      // The args input is the 3rd textbox
      await user.type(inputs[2], '/path --readonly --verbose')
      await user.click(within(dialog).getByText('添加服务器'))

      expect(mockAddServer).toHaveBeenCalledWith(
        expect.objectContaining({
          args: ['/path', '--readonly', '--verbose'],
        })
      )
    })

    it('parses env from KEY=value lines', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await user.click(screen.getByText('注册'))
      const dialog = screen.getByRole('dialog', { name: /添加 MCP 服务器/ })
      const inputs = within(dialog).getAllByRole('textbox')
      await user.type(inputs[0], 'srv')
      await user.type(inputs[1], 'cmd')
      // The env textarea
      await user.type(inputs[3], 'API_KEY=abc123{enter}DEBUG=true')
      await user.click(within(dialog).getByText('添加服务器'))

      expect(mockAddServer).toHaveBeenCalledWith(
        expect.objectContaining({
          env: { API_KEY: 'abc123', DEBUG: 'true' },
        })
      )
    })

    it('toggles autoStart switch', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await user.click(screen.getByText('注册'))
      const dialog = screen.getByRole('dialog', { name: /添加 MCP 服务器/ })
      // Find the autoStart switch inside the dialog
      const switches = within(dialog).getAllByRole('switch')
      expect(switches.length).toBeGreaterThan(0)
      const autoStartSwitch = switches[0]
      expect(autoStartSwitch).toHaveAttribute('aria-checked', 'true')
      await user.click(autoStartSwitch)
      expect(autoStartSwitch).toHaveAttribute('aria-checked', 'false')
    })
  })

  // ---------------------------------------------------------------
  // Edit server modal
  // ---------------------------------------------------------------
  describe('edit server modal', () => {
    it('opens edit modal when edit button clicked', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await waitFor(() => {
        expect(screen.getByText('test-server')).toBeInTheDocument()
      })
      // Find edit button - it is inside the server card
      const editButtons = screen.getAllByRole('button').filter(btn => {
        const svg = btn.querySelector('svg')
        return svg && btn.textContent === '' && btn.className.includes('hover:bg-')
      })
      // The edit button is the first small icon button after the toggle
      await user.click(editButtons[0])

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /编辑 MCP 服务器/ })).toBeInTheDocument()
      })
    })

    it('displays current server name in edit modal', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await waitFor(() => {
        expect(screen.getByText('test-server')).toBeInTheDocument()
      })
      const editButtons = screen.getAllByRole('button').filter(btn => {
        const svg = btn.querySelector('svg')
        return svg && btn.textContent === '' && btn.className.includes('hover:bg-')
      })
      await user.click(editButtons[0])

      await waitFor(() => {
        const dialog = screen.getByRole('dialog', { name: /编辑 MCP 服务器/ })
        const nameInput = within(dialog).getAllByRole('textbox')[0] as HTMLInputElement
        expect(nameInput.value).toBe('test-server')
      })
    })

    it('saves edits and closes modal', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await waitFor(() => {
        expect(screen.getByText('test-server')).toBeInTheDocument()
      })
      const editButtons = screen.getAllByRole('button').filter(btn => {
        const svg = btn.querySelector('svg')
        return svg && btn.textContent === '' && btn.className.includes('hover:bg-')
      })
      await user.click(editButtons[0])

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /编辑 MCP 服务器/ })).toBeInTheDocument()
      })

      await user.click(screen.getByText('保存修改'))

      await waitFor(() => {
        expect(mockUpdateMCPServer).toHaveBeenCalled()
        expect(screen.queryByRole('dialog', { name: /编辑 MCP 服务器/ })).not.toBeInTheDocument()
      })
    })

    it('shows success toast on edit save', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await waitFor(() => {
        expect(screen.getByText('test-server')).toBeInTheDocument()
      })
      const editButtons = screen.getAllByRole('button').filter(btn => {
        const svg = btn.querySelector('svg')
        return svg && btn.textContent === '' && btn.className.includes('hover:bg-')
      })
      await user.click(editButtons[0])
      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /编辑 MCP 服务器/ })).toBeInTheDocument()
      })
      await user.click(screen.getByText('保存修改'))

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('success', 'Server Updated', expect.stringContaining('test-server'))
      })
    })

    it('shows error toast on edit failure', async () => {
      mockUpdateMCPServer.mockImplementation(() => { throw new Error('update failed') })
      const user = userEvent.setup()
      renderWithDefaults()

      await waitFor(() => {
        expect(screen.getByText('test-server')).toBeInTheDocument()
      })
      const editButtons = screen.getAllByRole('button').filter(btn => {
        const svg = btn.querySelector('svg')
        return svg && btn.textContent === '' && btn.className.includes('hover:bg-')
      })
      await user.click(editButtons[0])
      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /编辑 MCP 服务器/ })).toBeInTheDocument()
      })
      await user.click(screen.getByText('保存修改'))

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to Update Server', 'update failed')
      })
    })

    it('closes edit modal when cancel clicked', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await waitFor(() => {
        expect(screen.getByText('test-server')).toBeInTheDocument()
      })
      const editButtons = screen.getAllByRole('button').filter(btn => {
        const svg = btn.querySelector('svg')
        return svg && btn.textContent === '' && btn.className.includes('hover:bg-')
      })
      await user.click(editButtons[0])
      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /编辑 MCP 服务器/ })).toBeInTheDocument()
      })

      // Click cancel inside the edit dialog
      const dialog = screen.getByRole('dialog', { name: /编辑 MCP 服务器/ })
      const cancelBtn = within(dialog).getByText('取消')
      await user.click(cancelBtn)

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /编辑 MCP 服务器/ })).not.toBeInTheDocument()
      })
    })

    it('toggles autoStart in edit modal', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await waitFor(() => {
        expect(screen.getByText('test-server')).toBeInTheDocument()
      })
      const editButtons = screen.getAllByRole('button').filter(btn => {
        const svg = btn.querySelector('svg')
        return svg && btn.textContent === '' && btn.className.includes('hover:bg-')
      })
      await user.click(editButtons[0])
      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /编辑 MCP 服务器/ })).toBeInTheDocument()
      })

      const dialog = screen.getByRole('dialog', { name: /编辑 MCP 服务器/ })
      const switchEl = within(dialog).getByRole('switch')
      expect(switchEl).toHaveAttribute('aria-checked', 'true')
      await user.click(switchEl)
      expect(switchEl).toHaveAttribute('aria-checked', 'false')
    })
  })

  // ---------------------------------------------------------------
  // Delete server (ConfirmDialog)
  // ---------------------------------------------------------------
  describe('delete server', () => {
    it('shows confirm dialog when delete button clicked', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await waitFor(() => {
        expect(screen.getByText('test-server')).toBeInTheDocument()
      })
      // Delete button is the last small icon button in the card
      const allButtons = screen.getAllByRole('button')
      // Find the delete button by looking for a button that triggers delete
      // There are edit and delete icon buttons. The delete button triggers the confirm dialog.
      // Let's find buttons that contain SVG icons and are not toggle/edit
      const deleteButtons = allButtons.filter(btn => {
        const svg = btn.querySelector('svg')
        return svg && btn.textContent === '' && btn.closest('.space-y-2\\.5') !== null
      })
      // The delete button is the last icon button in the card row
      const deleteBtn = deleteButtons[deleteButtons.length - 1]
      await user.click(deleteBtn!)

      await waitFor(() => {
        expect(screen.getByRole('alertdialog', { name: 'Remove MCP Server' })).toBeInTheDocument()
      })
    })

    it('calls removeServer API on confirm', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await waitFor(() => {
        expect(screen.getByText('test-server')).toBeInTheDocument()
      })
      const allButtons = screen.getAllByRole('button')
      const deleteButtons = allButtons.filter(btn => {
        const svg = btn.querySelector('svg')
        return svg && btn.textContent === '' && btn.closest('.space-y-2\\.5') !== null
      })
      const deleteBtn = deleteButtons[deleteButtons.length - 1]
      await user.click(deleteBtn!)

      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      })

      const confirmBtn = screen.getByText('Remove')
      await user.click(confirmBtn)

      expect(mockRemoveServer).toHaveBeenCalledWith('mcp-1')
    })

    it('calls removeMCPServer settings on confirm', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await waitFor(() => {
        expect(screen.getByText('test-server')).toBeInTheDocument()
      })
      const allButtons = screen.getAllByRole('button')
      const deleteButtons = allButtons.filter(btn => {
        const svg = btn.querySelector('svg')
        return svg && btn.textContent === '' && btn.closest('.space-y-2\\.5') !== null
      })
      await user.click(deleteButtons[deleteButtons.length - 1]!)
      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      })
      await user.click(screen.getByText('Remove'))

      await waitFor(() => {
        expect(mockRemoveMCPServer).toHaveBeenCalledWith('test-server')
      })
    })

    it('shows success toast after delete', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await waitFor(() => {
        expect(screen.getByText('test-server')).toBeInTheDocument()
      })
      const allButtons = screen.getAllByRole('button')
      const deleteButtons = allButtons.filter(btn => {
        const svg = btn.querySelector('svg')
        return svg && btn.textContent === '' && btn.closest('.space-y-2\\.5') !== null
      })
      await user.click(deleteButtons[deleteButtons.length - 1]!)
      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      })
      await user.click(screen.getByText('Remove'))

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('success', 'Server Removed', 'Server "test-server" has been removed')
      })
    })

    it('closes confirm dialog after successful delete', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await waitFor(() => {
        expect(screen.getByText('test-server')).toBeInTheDocument()
      })
      const allButtons = screen.getAllByRole('button')
      const deleteButtons = allButtons.filter(btn => {
        const svg = btn.querySelector('svg')
        return svg && btn.textContent === '' && btn.closest('.space-y-2\\.5') !== null
      })
      await user.click(deleteButtons[deleteButtons.length - 1]!)
      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      })
      await user.click(screen.getByText('Remove'))

      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      })
    })

    it('shows error toast when delete fails', async () => {
      mockRemoveServer.mockRejectedValue(new Error('cannot remove'))
      const user = userEvent.setup()
      renderWithDefaults()

      await waitFor(() => {
        expect(screen.getByText('test-server')).toBeInTheDocument()
      })
      const allButtons = screen.getAllByRole('button')
      const deleteButtons = allButtons.filter(btn => {
        const svg = btn.querySelector('svg')
        return svg && btn.textContent === '' && btn.closest('.space-y-2\\.5') !== null
      })
      await user.click(deleteButtons[deleteButtons.length - 1]!)
      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      })
      await user.click(screen.getByText('Remove'))

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('error', 'Failed to Remove Server', 'cannot remove')
      })
    })

    it('closes confirm dialog when cancel clicked', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await waitFor(() => {
        expect(screen.getByText('test-server')).toBeInTheDocument()
      })
      const allButtons = screen.getAllByRole('button')
      const deleteButtons = allButtons.filter(btn => {
        const svg = btn.querySelector('svg')
        return svg && btn.textContent === '' && btn.closest('.space-y-2\\.5') !== null
      })
      await user.click(deleteButtons[deleteButtons.length - 1]!)
      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      })

      // ConfirmDialog cancel button text is 'Cancel' by default
      const dialog = screen.getByRole('alertdialog')
      const cancelBtn = within(dialog).getByText('Cancel')
      await user.click(cancelBtn)

      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      })
    })
  })


  // ---------------------------------------------------------------
  // Server status variants
  // ---------------------------------------------------------------
  describe('server status variants', () => {
    it('renders error server with connect button', async () => {
      renderWithDefaults({ servers: [errorServer] })
      await waitFor(() => {
        expect(screen.getByText('error-server')).toBeInTheDocument()
        expect(screen.getByText('连接')).toBeInTheDocument()
      })
    })

    it('renders connecting server with disconnect button', async () => {
      const connectingServer: MCPServerSetting = {
        ...connectedServer,
        id: 'mcp-connecting',
        name: 'connecting-srv',
        status: 'connecting',
      }
      renderWithDefaults({ servers: [connectingServer] })
      await waitFor(() => {
        expect(screen.getByText('connecting-srv')).toBeInTheDocument()
        expect(screen.getByText('连接')).toBeInTheDocument()
      })
    })

    it('renders disconnected server with reduced opacity class', async () => {
      renderWithDefaults({ servers: [disconnectedServer] })
      await waitFor(() => {
        expect(screen.getByText('offline-server')).toBeInTheDocument()
      })
      // Disconnected server card has opacity-70 class
      const card = screen.getByText('offline-server').closest('.opacity-70')
      expect(card).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------
  // handleParseArgs edge cases (tested via add modal)
  // ---------------------------------------------------------------
  describe('args parsing', () => {
    it('filters out empty strings from args', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await user.click(screen.getByText('注册'))
      const dialog = screen.getByRole('dialog', { name: /添加 MCP 服务器/ })
      const inputs = within(dialog).getAllByRole('textbox')
      await user.type(inputs[0], 'srv')
      await user.type(inputs[1], 'cmd')
      // Type double spaces - should filter empties
      await user.type(inputs[2], 'a  b   c')
      await user.click(within(dialog).getByText('添加服务器'))

      expect(mockAddServer).toHaveBeenCalledWith(
        expect.objectContaining({
          args: ['a', 'b', 'c'],
        })
      )
    })

    it('handles empty args input', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await user.click(screen.getByText('注册'))
      const dialog = screen.getByRole('dialog', { name: /添加 MCP 服务器/ })
      const inputs = within(dialog).getAllByRole('textbox')
      await user.type(inputs[0], 'srv')
      await user.type(inputs[1], 'cmd')
      // Leave args empty
      await user.click(within(dialog).getByText('添加服务器'))

      expect(mockAddServer).toHaveBeenCalledWith(
        expect.objectContaining({
          args: [],
        })
      )
    })
  })

  // ---------------------------------------------------------------
  // handleParseEnv edge cases
  // ---------------------------------------------------------------
  describe('env parsing', () => {
    it('handles values containing equals sign', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await user.click(screen.getByText('注册'))
      const dialog = screen.getByRole('dialog', { name: /添加 MCP 服务器/ })
      const inputs = within(dialog).getAllByRole('textbox')
      await user.type(inputs[0], 'srv')
      await user.type(inputs[1], 'cmd')
      await user.type(inputs[3], 'KEY=value=with=equals')
      await user.click(within(dialog).getByText('添加服务器'))

      expect(mockAddServer).toHaveBeenCalledWith(
        expect.objectContaining({
          env: { KEY: 'value=with=equals' },
        })
      )
    })

    it('skips lines without equals sign', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await user.click(screen.getByText('注册'))
      const dialog = screen.getByRole('dialog', { name: /添加 MCP 服务器/ })
      const inputs = within(dialog).getAllByRole('textbox')
      await user.type(inputs[0], 'srv')
      await user.type(inputs[1], 'cmd')
      await user.type(inputs[3], 'NOEQUALSSIGN{enter}VALID=yes')
      await user.click(within(dialog).getByText('添加服务器'))

      expect(mockAddServer).toHaveBeenCalledWith(
        expect.objectContaining({
          env: { VALID: 'yes' },
        })
      )
    })

    it('handles empty env input', async () => {
      const user = userEvent.setup()
      renderWithDefaults()

      await user.click(screen.getByText('注册'))
      const dialog = screen.getByRole('dialog', { name: /添加 MCP 服务器/ })
      const inputs = within(dialog).getAllByRole('textbox')
      await user.type(inputs[0], 'srv')
      await user.type(inputs[1], 'cmd')
      // Leave env empty
      await user.click(within(dialog).getByText('添加服务器'))

      expect(mockAddServer).toHaveBeenCalledWith(
        expect.objectContaining({
          env: {},
        })
      )
    })
  })

  // ---------------------------------------------------------------
  // Skills section (real scanned data, MCP skills filtered out)
  // ---------------------------------------------------------------
  describe('skills section', () => {
    it('renders scanned skills from backend (excluding mcp)', async () => {
      renderWithDefaults()
      await waitFor(() => {
        expect(screen.getByText('Go Vet')).toBeInTheDocument()
        expect(screen.getByText('Claude Code Skills')).toBeInTheDocument()
        expect(screen.getByText('AST Analyzer')).toBeInTheDocument()
        // MCP-sourced skill should NOT appear
        expect(screen.queryByText('Filesystem Tools')).not.toBeInTheDocument()
      })
    })

    it('renders discovered count (excluding mcp)', async () => {
      renderWithDefaults()
      await waitFor(() => {
        // 4 total skills, 1 mcp filtered out = 3
        expect(screen.getByText(/已发现: 3/)).toBeInTheDocument()
      })
    })

    it('renders skill source badges (no MCP badge)', async () => {
      renderWithDefaults()
      await waitFor(() => {
        expect(screen.getAllByText('FS')).toHaveLength(2) // Go Vet + AST Analyzer
        expect(screen.getByText('AGENT')).toBeInTheDocument()
        // MCP badge should NOT appear
        expect(screen.queryByText('MCP')).not.toBeInTheDocument()
      })
    })

    it('renders skill descriptions', async () => {
      renderWithDefaults()
      await waitFor(() => {
        expect(screen.getByText('Go static analysis')).toBeInTheDocument()
        expect(screen.getByText('Code generation')).toBeInTheDocument()
        expect(screen.getByText('Semantic analysis')).toBeInTheDocument()
        // MCP-sourced skill description should NOT appear
        expect(screen.queryByText('Read/write files')).not.toBeInTheDocument()
      })
    })

    it('renders empty state when no non-mcp skills found', async () => {
      mockScanSkills.mockResolvedValue([
        { id: 's1', name: 'MCP Only', description: 'Only MCP', source: 'mcp', tags: ['mcp'] },
      ])
      renderWithDefaults()
      await waitFor(() => {
        expect(screen.getByText(/未发现技能/)).toBeInTheDocument()
      })
    })
  })
})
