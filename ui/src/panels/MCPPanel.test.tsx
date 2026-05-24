import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import MCPPanel from './MCPPanel'

const mockAddServer = vi.fn()
const mockRemoveServer = vi.fn()
const mockListTools = vi.fn()

vi.mock('../services', () => ({
  api: {
    mcp: {
      addServer: (...args: unknown[]) => mockAddServer(...args),
      removeServer: (...args: unknown[]) => mockRemoveServer(...args),
      listTools: (...args: unknown[]) => mockListTools(...args),
      scanServers: vi.fn().mockResolvedValue([]),
      startServer: vi.fn().mockResolvedValue({ status: 'connected' }),
      stopServer: vi.fn().mockResolvedValue(undefined),
    },
  },
}))

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({
    settings: {
      mcpServers: [
        { id: 'mcp-1', name: 'test-server', command: 'test-cmd', args: [], env: {}, enabled: true, autoStart: true, status: 'connected' },
      ],
      mcpEnabled: true,
    },
    addMCPServer: vi.fn(),
    removeMCPServer: vi.fn(),
    updateMCPServer: vi.fn(),
    updateSetting: vi.fn(),
  }),
}))

vi.mock('../store/appStore', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ addToast: vi.fn() }),
}))

describe('MCPPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListTools.mockResolvedValue([])
  })

  it('renders MCP servers header', () => {
    render(<MCPPanel />)
    expect(screen.getByText('作用中 MCP 伺服器')).toBeInTheDocument()
  })

  it('displays configured server name', async () => {
    render(<MCPPanel />)
    await waitFor(() => {
      expect(screen.getByText('test-server')).toBeInTheDocument()
    })
  })

  it('shows server command', async () => {
    render(<MCPPanel />)
    await waitFor(() => {
      expect(screen.getByText('test-cmd')).toBeInTheDocument()
    })
  })

  it('shows scan button', () => {
    render(<MCPPanel />)
    expect(screen.getByTitle('扫描 MCP 伺服器')).toBeInTheDocument()
  })

  it('shows register button', () => {
    render(<MCPPanel />)
    expect(screen.getByText('注册')).toBeInTheDocument()
  })

  it('shows skills section', () => {
    render(<MCPPanel />)
    expect(screen.getByText(/蜂群可加载技能库/)).toBeInTheDocument()
  })

  it('shows server count in header', () => {
    render(<MCPPanel />)
    // Text is split across elements: 已配置: <strong>1</strong> 伺服器
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('shows enabled toggle', () => {
    render(<MCPPanel />)
    expect(screen.getByText('已启用')).toBeInTheDocument()
  })
})
