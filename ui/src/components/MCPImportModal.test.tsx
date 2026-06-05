import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MCPImportModal from './MCPImportModal'
import type { MCPServerInfo } from '../services/api'

vi.mock('lucide-react', () => ({
  Upload: () => <span data-testid="upload-icon" />,
  X: () => <span data-testid="x-icon" />,
}))

const makeServers = (overrides: Partial<MCPServerInfo>[] = []): MCPServerInfo[] => {
  const defaults: MCPServerInfo[] = [
    { id: '1', name: 'context7', status: 'disconnected', command: 'npx', args: ['-y', '@upstash/context7'], source: 'Claude Code' },
    { id: '2', name: 'fetch', status: 'disconnected', url: 'https://mcp-fetch.example.com', source: 'Kimi Code' },
    { id: '3', name: 'filesystem', status: 'disconnected', command: 'node', args: ['./fs-mcp.js'], source: 'OpenCode' },
  ]
  return defaults.map((d, i) => ({ ...d, ...overrides[i] }))
}

describe('MCPImportModal', () => {
  const onImport = vi.fn()
  const onClose = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it('renders scanned servers with checkboxes', () => {
    const servers = makeServers()
    render(<MCPImportModal scanned={servers} onImport={onImport} onClose={onClose} />)
    expect(screen.getByText('context7')).toBeInTheDocument()
    expect(screen.getByText('fetch')).toBeInTheDocument()
    expect(screen.getByText('filesystem')).toBeInTheDocument()
    // All checkboxes should be checked by default (3 servers + 1 "select all" checkbox)
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes.length).toBe(4) // 1 select all + 3 server checkboxes
    checkboxes.forEach(cb => expect(cb).toBeChecked())
  })

  it('toggles checkbox selection and updates count', () => {
    const servers = makeServers()
    render(<MCPImportModal scanned={servers} onImport={onImport} onClose={onClose} />)
    expect(screen.getByText('已选 3 / 3')).toBeInTheDocument()

    // Uncheck the second server
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[2]) // index 2 = second server checkbox (0 = select all, 1 = first server)
    expect(screen.getByText('已选 2 / 3')).toBeInTheDocument()
  })

  it('calls onImport with selected servers when import button clicked', () => {
    const servers = makeServers()
    render(<MCPImportModal scanned={servers} onImport={onImport} onClose={onClose} />)

    // Uncheck the third server
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[3]) // third server
    expect(screen.getByText('已选 2 / 3')).toBeInTheDocument()

    // Click import
    fireEvent.click(screen.getByText('导入选中'))
    expect(onImport).toHaveBeenCalledWith([
      servers[0],
      servers[1],
    ])
  })

  it('does not call onImport when no servers selected', () => {
    const servers = makeServers()
    render(<MCPImportModal scanned={servers} onImport={onImport} onClose={onClose} />)

    // Uncheck all via select-all
    fireEvent.click(screen.getByLabelText('全选'))
    expect(screen.getByText('已选 0 / 3')).toBeInTheDocument()

    fireEvent.click(screen.getByText('导入选中'))
    expect(onImport).not.toHaveBeenCalled()
  })

  it('shows source agent labels', () => {
    const servers = makeServers()
    render(<MCPImportModal scanned={servers} onImport={onImport} onClose={onClose} />)
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    expect(screen.getByText('Kimi Code')).toBeInTheDocument()
    expect(screen.getByText('OpenCode')).toBeInTheDocument()
  })

  it('closes on cancel button click', () => {
    const servers = makeServers()
    render(<MCPImportModal scanned={servers} onImport={onImport} onClose={onClose} />)
    fireEvent.click(screen.getByText('取消'))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on X button click', () => {
    const servers = makeServers()
    render(<MCPImportModal scanned={servers} onImport={onImport} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('x-icon'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows empty state when no servers scanned', () => {
    render(<MCPImportModal scanned={[]} onImport={onImport} onClose={onClose} />)
    expect(screen.getByText('未发现 MCP 服务器')).toBeInTheDocument()
  })

  it('toggles all servers with select-all checkbox', () => {
    const servers = makeServers()
    render(<MCPImportModal scanned={servers} onImport={onImport} onClose={onClose} />)

    // Uncheck all
    fireEvent.click(screen.getByLabelText('全选'))
    expect(screen.getByText('已选 0 / 3')).toBeInTheDocument()

    // Check all again
    fireEvent.click(screen.getByLabelText('全选'))
    expect(screen.getByText('已选 3 / 3')).toBeInTheDocument()
  })

  it('shows command and url details for servers', () => {
    const servers = makeServers()
    render(<MCPImportModal scanned={servers} onImport={onImport} onClose={onClose} />)
    expect(screen.getByText('npx')).toBeInTheDocument()
    expect(screen.getByText('https://mcp-fetch.example.com')).toBeInTheDocument()
    expect(screen.getByText('node')).toBeInTheDocument()
  })
})
