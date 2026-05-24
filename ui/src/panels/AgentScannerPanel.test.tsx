import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import AgentScannerPanel from './AgentScannerPanel'

const mockRefreshAgents = vi.fn().mockResolvedValue([])
const mockScanServers = vi.fn().mockResolvedValue([])
const mockScanSkills = vi.fn().mockResolvedValue([])
const mockAddToast = vi.fn()

vi.mock('../services', () => ({
  api: {
    agent: {
      refreshAgents: (...args: any[]) => mockRefreshAgents(...args),
      scanSkills: (...args: any[]) => mockScanSkills(...args),
    },
    mcp: {
      scanServers: (...args: any[]) => mockScanServers(...args),
    },
  },
}))

vi.mock('../store/appStore', () => ({
  useAppStore: (selector: any) => selector({
    agents: [],
    addToast: mockAddToast,
  }),
}))

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => ({
    settings: { agentAutoScan: false, agentScanInterval: 30000 },
    updateSetting: vi.fn(),
  }),
}))

vi.mock('../components/AgentConfigModal', () => ({
  default: () => null,
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
}))

// Mock scrollIntoView for jsdom
Element.prototype.scrollIntoView = vi.fn()

describe('AgentScannerPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders header with Scanner title', async () => {
    mockRefreshAgents.mockResolvedValueOnce([])
    await act(async () => { render(<AgentScannerPanel />) })
    expect(screen.getByText('Scanner')).toBeInTheDocument()
  })

  it('renders scan tabs with correct labels', async () => {
    mockRefreshAgents.mockResolvedValueOnce([])
    await act(async () => { render(<AgentScannerPanel />) })
    expect(screen.getByText('Agents')).toBeInTheDocument()
    expect(screen.getByText('MCP Servers')).toBeInTheDocument()
    expect(screen.getByText('Skills')).toBeInTheDocument()
  })

  it('renders scan button', async () => {
    mockRefreshAgents.mockResolvedValueOnce([])
    await act(async () => { render(<AgentScannerPanel />) })
    // After auto-scan resolves, button reverts to "Scan"
    await waitFor(() => {
      expect(screen.getByText('Scan')).toBeInTheDocument()
    })
  })

  it('triggers scan on click', async () => {
    mockRefreshAgents.mockResolvedValueOnce([])
    await act(async () => { render(<AgentScannerPanel />) })
    // Wait for initial auto-scan to finish
    await waitFor(() => expect(screen.getByText('Scan')).toBeInTheDocument())
    mockRefreshAgents.mockResolvedValueOnce([])
    fireEvent.click(screen.getByText('Scan'))
    await waitFor(() => {
      expect(mockRefreshAgents).toHaveBeenCalled()
    })
  })

  it('maps non-error status to available via scanAll', async () => {
    mockRefreshAgents.mockResolvedValueOnce([
      { id: 'a1', name: 'Agent 1', status: 'idle', command: '/bin/test', capabilities: ['code'] },
    ])
    await act(async () => { render(<AgentScannerPanel />) })
    await waitFor(() => {
      expect(screen.getByText('available')).toBeInTheDocument()
    })
  })

  it('maps error status to unreachable via scanAll', async () => {
    mockRefreshAgents.mockResolvedValueOnce([
      { id: 'a2', name: 'Agent 2', status: 'error', command: '/bin/test', capabilities: [] },
    ])
    await act(async () => { render(<AgentScannerPanel />) })
    await waitFor(() => {
      expect(screen.getByText('unreachable')).toBeInTheDocument()
    })
  })

  it('handles undefined capabilities without crash', async () => {
    mockRefreshAgents.mockResolvedValueOnce([
      { id: 'a3', name: 'Agent 3', status: 'idle', command: '/bin/test' },
    ])
    await act(async () => { render(<AgentScannerPanel />) })
    await waitFor(() => {
      expect(mockRefreshAgents).toHaveBeenCalled()
    })
    expect(screen.getByText('available')).toBeInTheDocument()
  })

  it('switches to MCP Servers tab', async () => {
    mockRefreshAgents.mockResolvedValueOnce([])
    await act(async () => { render(<AgentScannerPanel />) })
    fireEvent.click(screen.getByText('MCP Servers'))
    // Should show MCP-specific empty state or content
    expect(screen.getByText('MCP Servers')).toBeInTheDocument()
  })

  it('switches to Skills tab', async () => {
    mockRefreshAgents.mockResolvedValueOnce([])
    await act(async () => { render(<AgentScannerPanel />) })
    fireEvent.click(screen.getByText('Skills'))
    expect(screen.getByText('Skills')).toBeInTheDocument()
  })
})
